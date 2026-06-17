"""CRUD endpoints for profiles, plus a per-profile summary (SPEC.md 7.4)."""
from decimal import Decimal

from postgrest.exceptions import APIError

from fastapi import APIRouter, HTTPException

from app.database import supabase
from app.db_errors import is_foreign_key_violation
from app.services import calculations as calc

from app.models.profile import Profile, ProfileCreate, ProfileUpdate

router = APIRouter(prefix="/api/profiles", tags=["profiles"])

TABLE = "profiles"


@router.get("", response_model=list[Profile])
def list_profiles():
    result = supabase.table(TABLE).select("*").order("created_at").execute()
    return result.data


@router.post("", response_model=Profile, status_code=201)
def create_profile(payload: ProfileCreate):
    result = supabase.table(TABLE).insert(payload.model_dump()).execute()
    return result.data[0]


@router.get("/{profile_id}", response_model=Profile)
def get_profile(profile_id: str):
    result = supabase.table(TABLE).select("*").eq("id", profile_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]


@router.put("/{profile_id}", response_model=Profile)
def update_profile(profile_id: str, payload: ProfileUpdate):
    # Only send fields the client actually provided.
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = supabase.table(TABLE).update(changes).eq("id", profile_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]


@router.delete("/{profile_id}", status_code=204)
def delete_profile(profile_id: str):
    try:
        result = supabase.table(TABLE).delete().eq("id", profile_id).execute()
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
def profile_summary(profile_id: str):
    """Totals and activity for one profile (SPEC.md 7.4).

    'owed' = everything this profile was charged; it splits into 'paid' (already
    paid back) and 'unpaid' (still owed). Amounts are reported as positive.
    """
    profile = supabase.table(TABLE).select("*").eq("id", profile_id).execute()
    if not profile.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    txns = (
        supabase.table("transactions")
        .select("*")
        .eq("profile_id", profile_id)
        .order("transaction_date", desc=True)
        .execute()
        .data
    )
    cards = supabase.table("credit_cards").select("id, name").execute().data
    card_names = {c["id"]: c["name"] for c in cards}

    total_unpaid = calc.total_card_debt(txns)  # negated sum of unpaid amounts
    total_paid = -sum((calc._dec(t["amount"]) for t in calc.paid(txns)), Decimal("0"))
    total_owed = total_paid + total_unpaid

    cards_used = sorted({card_names.get(t["credit_card_id"], "Unknown") for t in txns})

    return {
        "profile": profile.data[0],
        "total_owed": float(total_owed),
        "total_paid": float(total_paid),
        "total_unpaid": float(total_unpaid),
        "cashback_earned": float(calc.cashback_earned(txns)),
        "cashback_pending": float(calc.cashback_pending(txns)),
        "cards_used": cards_used,
        "transactions": txns,
    }
