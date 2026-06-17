"""CRUD endpoints for accounts."""
from fastapi import APIRouter, HTTPException

from app.database import supabase
from app.models.account import Account, AccountCreate, AccountUpdate

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

TABLE = "accounts"


@router.get("", response_model=list[Account])
def list_accounts():
    result = supabase.table(TABLE).select("*").order("created_at").execute()
    return result.data


@router.post("", response_model=Account, status_code=201)
def create_account(payload: AccountCreate):
    result = supabase.table(TABLE).insert(payload.model_dump(mode="json")).execute()
    return result.data[0]


@router.get("/{account_id}", response_model=Account)
def get_account(account_id: str):
    result = supabase.table(TABLE).select("*").eq("id", account_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Account not found")
    return result.data[0]


@router.put("/{account_id}", response_model=Account)
def update_account(account_id: str, payload: AccountUpdate):
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = supabase.table(TABLE).update(changes).eq("id", account_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Account not found")
    return result.data[0]


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: str):
    result = supabase.table(TABLE).delete().eq("id", account_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Account not found")
    return None
