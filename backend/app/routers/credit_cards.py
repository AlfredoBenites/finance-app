"""CRUD endpoints for credit cards."""
from postgrest.exceptions import APIError

from fastapi import APIRouter, HTTPException

from app.database import supabase
from app.db_errors import is_foreign_key_violation
from app.models.credit_card import CreditCard, CreditCardCreate, CreditCardUpdate

router = APIRouter(prefix="/api/credit-cards", tags=["credit_cards"])

TABLE = "credit_cards"


@router.get("", response_model=list[CreditCard])
def list_credit_cards():
    result = supabase.table(TABLE).select("*").order("created_at").execute()
    return result.data


@router.post("", response_model=CreditCard, status_code=201)
def create_credit_card(payload: CreditCardCreate):
    # mode="json" converts Decimal money fields to a JSON-safe form.
    result = supabase.table(TABLE).insert(payload.model_dump(mode="json")).execute()
    return result.data[0]


@router.get("/{card_id}", response_model=CreditCard)
def get_credit_card(card_id: str):
    result = supabase.table(TABLE).select("*").eq("id", card_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Credit card not found")
    return result.data[0]


@router.put("/{card_id}", response_model=CreditCard)
def update_credit_card(card_id: str, payload: CreditCardUpdate):
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = supabase.table(TABLE).update(changes).eq("id", card_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Credit card not found")
    return result.data[0]


@router.delete("/{card_id}", status_code=204)
def delete_credit_card(card_id: str):
    try:
        result = supabase.table(TABLE).delete().eq("id", card_id).execute()
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
