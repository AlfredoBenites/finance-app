"""CRUD endpoints for profiles, plus a per-profile summary (SPEC.md 7.4).

All endpoints require a logged-in user and operate only on that user's rows.
"""
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

    txns = (
        supabase.table("transactions")
        .select("*")
        .eq("profile_id", profile_id)
        .eq("owner_id", user_id)
        .order("transaction_date", desc=True)
        .execute()
        .data
    )
    cards = (
        supabase.table("credit_cards")
        .select("id, name")
        .eq("owner_id", user_id)
        .execute()
        .data
    )
    card_names = {c["id"]: c["name"] for c in cards}

    total_unpaid = calc.total_card_debt(txns)  # negated sum of unpaid amounts
    total_paid = -sum((calc._dec(t["amount"]) for t in calc.paid(txns)), Decimal("0"))
    total_owed = total_paid + total_unpaid

    cards_used = sorted({card_names.get(t["credit_card_id"], "Unknown") for t in txns})

    # How much THIS profile still owes on each card (unpaid card charges).
    debt_by_card = [
        {"name": card_names.get(cid, "Unknown"), "balance": float(bal)}
        for cid, bal in calc.debt_by_card(txns).items()
    ]
    debt_by_card.sort(key=lambda d: -d["balance"])

    return {
        "profile": profile.data[0],
        "total_owed": float(total_owed),
        "total_paid": float(total_paid),
        "total_unpaid": float(total_unpaid),
        "cashback_earned": float(calc.cashback_earned(txns)),
        "cashback_pending": float(calc.cashback_pending(txns)),
        "cards_used": cards_used,
        "debt_by_card": debt_by_card,
        "transactions": txns,
    }
