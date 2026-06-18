"""Per-category cashback rule endpoints. Scoped to the logged-in user.

A rule sets the cashback rate for one (card, category). The transaction form
uses these to auto-fill the rate, falling back to the card's default.
"""
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.database import supabase
from app.models.cashback_rule import CashbackRule, CashbackRuleCreate

router = APIRouter(prefix="/api", tags=["cashback_rules"])

TABLE = "card_category_cashback"


def _owned_card_or_404(card_id: str, user_id: str) -> None:
    card = (
        supabase.table("credit_cards")
        .select("id")
        .eq("id", card_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not card.data:
        raise HTTPException(status_code=404, detail="Credit card not found")


@router.get("/cashback-rules", response_model=list[CashbackRule])
def list_all_rules(user_id: str = Depends(get_current_user_id)):
    """All of the user's rules — used by the transaction form to resolve rates."""
    result = supabase.table(TABLE).select("*").eq("owner_id", user_id).execute()
    return result.data


@router.get("/credit-cards/{card_id}/cashback-rules", response_model=list[CashbackRule])
def list_card_rules(card_id: str, user_id: str = Depends(get_current_user_id)):
    _owned_card_or_404(card_id, user_id)
    result = (
        supabase.table(TABLE)
        .select("*")
        .eq("card_id", card_id)
        .eq("owner_id", user_id)
        .order("category")
        .execute()
    )
    return result.data


@router.post(
    "/credit-cards/{card_id}/cashback-rules",
    response_model=CashbackRule,
    status_code=201,
)
def upsert_card_rule(
    card_id: str,
    payload: CashbackRuleCreate,
    user_id: str = Depends(get_current_user_id),
):
    """Set the rate for a (card, category). Updates the rule if it already exists."""
    _owned_card_or_404(card_id, user_id)
    category = payload.category.strip()
    if not category:
        raise HTTPException(status_code=400, detail="Category is required")

    rate = str(payload.rate)
    existing = (
        supabase.table(TABLE)
        .select("*")
        .eq("card_id", card_id)
        .eq("owner_id", user_id)
        .eq("category", category)
        .execute()
    )
    if existing.data:
        result = (
            supabase.table(TABLE)
            .update({"rate": rate})
            .eq("id", existing.data[0]["id"])
            .eq("owner_id", user_id)
            .execute()
        )
    else:
        result = supabase.table(TABLE).insert(
            {
                "card_id": card_id,
                "owner_id": user_id,
                "category": category,
                "rate": rate,
            }
        ).execute()
    return result.data[0]


@router.delete("/cashback-rules/{rule_id}", status_code=204)
def delete_rule(rule_id: str, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table(TABLE)
        .delete()
        .eq("id", rule_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Rule not found")
    return None
