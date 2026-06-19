"""CRUD endpoints for credit cards. Scoped to the logged-in user."""
from datetime import date
from typing import Optional

from postgrest.exceptions import APIError

from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.database import supabase
from app.db_errors import is_foreign_key_violation
from app.models.credit_card import CreditCard, CreditCardCreate, CreditCardUpdate

router = APIRouter(prefix="/api/credit-cards", tags=["credit_cards"])

TABLE = "credit_cards"


class UpgradeRequest(BaseModel):
    new_card_id: str
    upgraded_on: Optional[date] = None


@router.get("/upgrades")
def list_upgrades(user_id: str = Depends(get_current_user_id)):
    """History of card upgrades (old -> new), with card names."""
    rows = supabase.table("card_upgrades").select("*").eq("owner_id", user_id).execute().data
    cards = supabase.table(TABLE).select("id, name").eq("owner_id", user_id).execute().data
    names = {c["id"]: c["name"] for c in cards}
    return [
        {
            "id": r["id"],
            "old_name": names.get(r["old_card_id"], "Unknown"),
            "new_name": names.get(r["new_card_id"], "Unknown"),
            "upgraded_on": r["upgraded_on"],
        }
        for r in sorted(rows, key=lambda r: r.get("upgraded_on") or "", reverse=True)
    ]


@router.post("/{card_id}/upgrade", response_model=CreditCard)
def upgrade_card(
    card_id: str, payload: UpgradeRequest, user_id: str = Depends(get_current_user_id)
):
    """Record an upgrade to another card and archive the old one (keep history)."""
    if card_id == payload.new_card_id:
        raise HTTPException(status_code=400, detail="A card can't be upgraded to itself")
    for cid in (card_id, payload.new_card_id):
        owned = supabase.table(TABLE).select("id").eq("id", cid).eq("owner_id", user_id).execute()
        if not owned.data:
            raise HTTPException(status_code=404, detail="Credit card not found")
    supabase.table("card_upgrades").insert({
        "owner_id": user_id,
        "old_card_id": card_id,
        "new_card_id": payload.new_card_id,
        "upgraded_on": payload.upgraded_on.isoformat() if payload.upgraded_on else None,
    }).execute()
    result = (
        supabase.table(TABLE)
        .update({"is_active": False})
        .eq("id", card_id)
        .eq("owner_id", user_id)
        .execute()
    )
    return result.data[0]


@router.get("", response_model=list[CreditCard])
def list_credit_cards(user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table(TABLE)
        .select("*")
        .eq("owner_id", user_id)
        .order("created_at")
        .execute()
    )
    return result.data


@router.post("", response_model=CreditCard, status_code=201)
def create_credit_card(
    payload: CreditCardCreate, user_id: str = Depends(get_current_user_id)
):
    # mode="json" converts Decimal money fields to a JSON-safe form.
    data = payload.model_dump(mode="json")
    data["owner_id"] = user_id
    result = supabase.table(TABLE).insert(data).execute()
    card = result.data[0]
    # Auto-create a payoff bucket for the new card (money saved to pay it off).
    supabase.table("buckets").insert({
        "owner_id": user_id,
        "name": f"{card['name']} payoff",
        "category": "Credit Card Payoff",
        "current_amount": "0",
        "credit_card_id": card["id"],
    }).execute()
    return card


@router.get("/{card_id}", response_model=CreditCard)
def get_credit_card(card_id: str, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table(TABLE)
        .select("*")
        .eq("id", card_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Credit card not found")
    return result.data[0]


@router.put("/{card_id}", response_model=CreditCard)
def update_credit_card(
    card_id: str,
    payload: CreditCardUpdate,
    user_id: str = Depends(get_current_user_id),
):
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        supabase.table(TABLE)
        .update(changes)
        .eq("id", card_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Credit card not found")
    return result.data[0]


@router.delete("/{card_id}", status_code=204)
def delete_credit_card(card_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        result = (
            supabase.table(TABLE)
            .delete()
            .eq("id", card_id)
            .eq("owner_id", user_id)
            .execute()
        )
    except APIError as e:
        if is_foreign_key_violation(e):
            raise HTTPException(
                status_code=409,
                detail="Card has transactions. Delete or reassign them first.",
            )
        raise
    if not result.data:
        raise HTTPException(status_code=404, detail="Credit card not found")
    return None
