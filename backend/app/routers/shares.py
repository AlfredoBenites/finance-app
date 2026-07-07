"""Profile sharing endpoints (SPEC.md 14 / auth-and-sharing vision).

An owner shares a profile by email. The recipient, once logged in with that
email, gets a READ-ONLY view of what they owe on that profile.
"""
from postgrest.exceptions import APIError

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user, get_current_user_id
from app.database import supabase, fetch_all
from app.db_errors import is_unique_violation
from app.models.share import Share, ShareCreate
from app.services import calculations as calc

router = APIRouter(prefix="/api", tags=["shares"])


def _owned_profile_or_404(profile_id: str, user_id: str) -> dict:
    """Return the profile if it belongs to user_id, else 404."""
    result = (
        supabase.table("profiles")
        .select("*")
        .eq("id", profile_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]


@router.post("/profiles/{profile_id}/shares", response_model=Share, status_code=201)
def share_profile(
    profile_id: str,
    payload: ShareCreate,
    user_id: str = Depends(get_current_user_id),
):
    _owned_profile_or_404(profile_id, user_id)
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    record = {
        "profile_id": profile_id,
        "owner_id": user_id,
        "shared_with_email": email,
    }
    try:
        result = supabase.table("profile_shares").insert(record).execute()
    except APIError as e:
        if is_unique_violation(e):
            raise HTTPException(status_code=409, detail="Already shared with that email")
        raise
    return result.data[0]


@router.get("/profiles/{profile_id}/shares", response_model=list[Share])
def list_profile_shares(profile_id: str, user_id: str = Depends(get_current_user_id)):
    _owned_profile_or_404(profile_id, user_id)
    result = (
        supabase.table("profile_shares")
        .select("*")
        .eq("profile_id", profile_id)
        .eq("owner_id", user_id)
        .order("created_at")
        .execute()
    )
    return result.data


@router.delete("/shares/{share_id}", status_code=204)
def revoke_share(share_id: str, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table("profile_shares")
        .delete()
        .eq("id", share_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Share not found")
    return None


@router.get("/shared-with-me")
def shared_with_me(user=Depends(get_current_user)):
    """Read-only summaries of profiles shared with the current user's email."""
    email = (user.email or "").strip().lower()
    shares = (
        supabase.table("profile_shares")
        .select("*")
        .eq("shared_with_email", email)
        .execute()
        .data
    )

    summaries = []
    for share in shares:
        profile_id = share["profile_id"]
        profile = (
            supabase.table("profiles").select("*").eq("id", profile_id).execute().data
        )
        if not profile:
            continue  # profile was deleted
        txns = fetch_all(
            lambda: supabase.table("transactions")
            .select("*")
            .eq("profile_id", profile_id)
            .order("transaction_date", desc=True)
        )
        summaries.append(
            {
                "profile_name": profile[0]["name"],
                "total_unpaid": float(calc.total_card_debt(txns)),
                "transactions": txns,
            }
        )
    return summaries
