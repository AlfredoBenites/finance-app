"""CRUD endpoints for profiles, plus a per-profile summary (SPEC.md 7.4).

All endpoints require a logged-in user and operate only on that user's rows.
"""
from datetime import date
from decimal import Decimal

from postgrest.exceptions import APIError

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.database import supabase
from app.db_errors import is_foreign_key_violation
from app.services import calculations as calc

from app.models.profile import Profile, ProfileCreate, ProfileUpdate

router = APIRouter(prefix="/api/profiles", tags=["profiles"])

TABLE = "profiles"


@router.get("", response_model=list[Profile])
def list_profiles(user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table(TABLE)
        .select("*")
        .eq("owner_id", user_id)
        .order("created_at")
        .execute()
    )
    return result.data


@router.post("", response_model=Profile, status_code=201)
def create_profile(payload: ProfileCreate, user_id: str = Depends(get_current_user_id)):
    data = payload.model_dump()
    data["owner_id"] = user_id
    result = supabase.table(TABLE).insert(data).execute()
    return result.data[0]


@router.get("/cashback-redirected")
def cashback_redirected(user_id: str = Depends(get_current_user_id)):
    """Per-profile cashback that is credited to the primary profile instead of to
    that profile (Insights: 'cashback from other profiles'). Declared before the
    '/{profile_id}' route so the path isn't captured as a profile id.
    """
    profiles = (
        supabase.table(TABLE).select("*").eq("owner_id", user_id).execute().data
    )
    redirecting = {
        p["id"]: p["name"]
        for p in profiles
        if p.get("cashback_to_primary") and not p.get("is_primary")
    }
    if not redirecting:
        return []

    all_txns = (
        supabase.table("transactions").select("*").eq("owner_id", user_id).execute().data
    )
    by_profile: dict[str, dict] = {}
    for t in all_txns:
        pid = t.get("profile_id")
        if pid not in redirecting:
            continue
        entry = by_profile.setdefault(pid, {"earned": Decimal("0"), "pending": Decimal("0")})
        amount = calc._dec(t.get("cashback_amount"))
        entry["earned" if t.get("is_paid_back") else "pending"] += amount

    result = [
        {
            "profile_id": pid,
            "name": redirecting[pid],
            "earned": float(v["earned"]),
            "pending": float(v["pending"]),
        }
        for pid, v in by_profile.items()
        if v["earned"] or v["pending"]
    ]
    result.sort(key=lambda d: -(d["earned"] + d["pending"]))
    return result


@router.get("/{profile_id}", response_model=Profile)
def get_profile(profile_id: str, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table(TABLE)
        .select("*")
        .eq("id", profile_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]


@router.put("/{profile_id}", response_model=Profile)
def update_profile(
    profile_id: str,
    payload: ProfileUpdate,
    user_id: str = Depends(get_current_user_id),
):
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        supabase.table(TABLE)
        .update(changes)
        .eq("id", profile_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]


@router.delete("/{profile_id}", status_code=204)
def delete_profile(profile_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        result = (
            supabase.table(TABLE)
            .delete()
            .eq("id", profile_id)
            .eq("owner_id", user_id)
            .execute()
        )
    except APIError as e:
        if is_foreign_key_violation(e):
            raise HTTPException(
                status_code=409,
                detail="Profile has transactions. Delete or reassign them first.",
            )
        raise
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return None


@router.post("/{profile_id}/make-primary", response_model=Profile)
def make_primary(profile_id: str, user_id: str = Depends(get_current_user_id)):
    """Mark this profile as 'me' (and unmark any others)."""
    owned = (
        supabase.table(TABLE).select("id").eq("id", profile_id).eq("owner_id", user_id).execute()
    )
    if not owned.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    supabase.table(TABLE).update({"is_primary": False}).eq("owner_id", user_id).execute()
    result = (
        supabase.table(TABLE)
        .update({"is_primary": True})
        .eq("id", profile_id)
        .eq("owner_id", user_id)
        .execute()
    )
    return result.data[0]


@router.get("/{profile_id}/summary")
def profile_summary(profile_id: str, user_id: str = Depends(get_current_user_id)):
    """Totals and activity for one profile (SPEC.md 7.4).

    'owed' = everything this profile was charged; it splits into 'paid' (already
    paid back) and 'unpaid' (still owed). Amounts are reported as positive.
    """
    profile = (
        supabase.table(TABLE)
        .select("*")
        .eq("id", profile_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not profile.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    viewed = profile.data[0]

    all_txns = (
        supabase.table("transactions")
        .select("*")
        .eq("owner_id", user_id)
        .order("transaction_date", desc=True)
        .execute()
        .data
    )
    own_txns = [t for t in all_txns if t.get("profile_id") == profile_id]

    all_profiles = (
        supabase.table(TABLE).select("*").eq("owner_id", user_id).execute().data
    )
    # Non-primary profiles whose cashback is credited to the primary profile.
    redirecting_ids = {
        p["id"] for p in all_profiles
        if p.get("cashback_to_primary") and not p.get("is_primary")
    }

    # Cashback can be attributed to a different profile than owed/debt. Owed and
    # debt always stay with the profile that was charged (own_txns); only the
    # cashback set shifts: the primary absorbs redirecting profiles' cashback,
    # and a redirecting profile keeps none of its own.
    if viewed.get("is_primary"):
        cashback_txns = own_txns + [
            t for t in all_txns if t.get("profile_id") in redirecting_ids
        ]
    elif profile_id in redirecting_ids:
        cashback_txns = []
    else:
        cashback_txns = own_txns

    cards = (
        supabase.table("credit_cards")
        .select("id, name")
        .eq("owner_id", user_id)
        .execute()
        .data
    )
    card_names = {c["id"]: c["name"] for c in cards}

    total_unpaid = calc.total_card_debt(own_txns)  # negated sum of unpaid amounts
    total_paid = -sum((calc._dec(t["amount"]) for t in calc.paid(own_txns)), Decimal("0"))
    total_owed = total_paid + total_unpaid

    cards_used = sorted({card_names.get(t.get("credit_card_id"), "Unknown") for t in own_txns})

    # How much THIS profile still owes on each card (unpaid card charges).
    debt_by_card = [
        {"name": card_names.get(cid, "Unknown"), "balance": float(bal)}
        for cid, bal in calc.debt_by_card(own_txns).items()
    ]
    debt_by_card.sort(key=lambda d: -d["balance"])

    # Cashback credited to this profile on each card (earned = settled, pending =
    # unpaid). For the primary this includes redirecting profiles' cashback,
    # merged into the same card rows.
    cb_by_card: dict[str, dict[str, Decimal]] = {}
    for t in cashback_txns:
        cid = t.get("credit_card_id")
        if not cid:
            continue
        entry = cb_by_card.setdefault(cid, {"earned": Decimal("0"), "pending": Decimal("0")})
        amount = calc._dec(t.get("cashback_amount"))
        entry["earned" if t.get("is_paid_back") else "pending"] += amount
    cashback_by_card = [
        {"name": card_names.get(cid, "Unknown"), "earned": float(v["earned"]), "pending": float(v["pending"])}
        for cid, v in cb_by_card.items()
        if v["earned"] or v["pending"]
    ]
    cashback_by_card.sort(key=lambda d: -(d["earned"] + d["pending"]))

    return {
        "profile": viewed,
        "total_owed": float(total_owed),
        "total_paid": float(total_paid),
        "total_unpaid": float(total_unpaid),
        "cashback_earned": float(calc.cashback_earned(cashback_txns)),
        "cashback_pending": float(calc.cashback_pending(cashback_txns)),
        "cards_used": cards_used,
        "debt_by_card": debt_by_card,
        "cashback_by_card": cashback_by_card,
        "transactions": own_txns,
    }


@router.get("/{profile_id}/statement")
def profile_statement(profile_id: str, user_id: str = Depends(get_current_user_id)):
    """What this profile still owes, per card, with the unpaid charges behind each
    total. The frontend turns this into a printable statement to share."""
    profile = (
        supabase.table(TABLE)
        .select("name")
        .eq("id", profile_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not profile.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    txns = (
        supabase.table("transactions")
        .select("*")
        .eq("profile_id", profile_id)
        .eq("owner_id", user_id)
        .order("transaction_date")
        .execute()
        .data
    )
    card_names = {
        c["id"]: c["name"]
        for c in supabase.table("credit_cards").select("id, name").eq("owner_id", user_id).execute().data
    }

    by_card: dict = {}
    for t in txns:
        cid = t.get("credit_card_id")
        if not cid or t.get("is_paid_back"):
            continue  # only unpaid card charges count toward what's still owed
        entry = by_card.setdefault(
            cid, {"card_name": card_names.get(cid, "Unknown"), "owed": Decimal("0"), "transactions": []}
        )
        amt = calc._dec(t["amount"])
        entry["owed"] += -amt  # purchases are negative; owed is positive
        entry["transactions"].append({
            "transaction_date": t["transaction_date"],
            "merchant": t.get("merchant"),
            "category": t.get("category"),
            "notes": t.get("notes"),
            "amount": float(amt),
        })

    cards = sorted(by_card.values(), key=lambda c: -c["owed"])
    for c in cards:
        c["owed"] = float(c["owed"])

    return {
        "profile_name": profile.data[0]["name"],
        "generated_on": date.today().isoformat(),
        "total_owed": sum(c["owed"] for c in cards),
        "cards": cards,
    }
