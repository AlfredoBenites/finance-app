"""CRUD endpoints for accounts. Scoped to the logged-in user."""
from decimal import Decimal

from postgrest.exceptions import APIError
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.database import supabase
from app.db_errors import is_foreign_key_violation
from app.models.account import Account, AccountCreate, AccountUpdate

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

TABLE = "accounts"


class AccountTransfer(BaseModel):
    from_account_id: str
    to_account_id: str
    amount: Decimal


@router.get("", response_model=list[Account])
def list_accounts(user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table(TABLE)
        .select("*")
        .eq("owner_id", user_id)
        .order("created_at")
        .execute()
    )
    return result.data


@router.post("", response_model=Account, status_code=201)
def create_account(payload: AccountCreate, user_id: str = Depends(get_current_user_id)):
    data = payload.model_dump(mode="json")
    data["owner_id"] = user_id
    result = supabase.table(TABLE).insert(data).execute()
    return result.data[0]


@router.post("/transfer")
def transfer_between_accounts(payload: AccountTransfer, user_id: str = Depends(get_current_user_id)):
    """Move money from one account to another (e.g. bank -> brokerage). Comes out
    of the source's UNallocated money so bucket envelopes stay intact."""
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status_code=400, detail="Pick two different accounts")

    src = supabase.table(TABLE).select("balance, name").eq("id", payload.from_account_id).eq("owner_id", user_id).execute().data
    dst = supabase.table(TABLE).select("balance").eq("id", payload.to_account_id).eq("owner_id", user_id).execute().data
    if not src or not dst:
        raise HTTPException(status_code=404, detail="Account not found")

    src_balance = Decimal(str(src[0]["balance"]))
    bks = supabase.table("buckets").select("current_amount").eq("owner_id", user_id).eq("account_id", payload.from_account_id).execute().data
    allocated = sum((Decimal(str(b["current_amount"])) for b in bks), Decimal("0"))
    unallocated = src_balance - allocated
    if payload.amount > unallocated:
        raise HTTPException(
            status_code=400,
            detail=f"Only {unallocated} is unallocated in {src[0]['name']}; move money out of its buckets first.",
        )

    supabase.table(TABLE).update({"balance": str(src_balance - payload.amount)}).eq("id", payload.from_account_id).eq("owner_id", user_id).execute()
    supabase.table(TABLE).update({"balance": str(Decimal(str(dst[0]["balance"])) + payload.amount)}).eq("id", payload.to_account_id).eq("owner_id", user_id).execute()
    return {"ok": True, "transferred": float(payload.amount)}


@router.get("/{account_id}", response_model=Account)
def get_account(account_id: str, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table(TABLE)
        .select("*")
        .eq("id", account_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Account not found")
    return result.data[0]


@router.put("/{account_id}", response_model=Account)
def update_account(
    account_id: str,
    payload: AccountUpdate,
    user_id: str = Depends(get_current_user_id),
):
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        supabase.table(TABLE)
        .update(changes)
        .eq("id", account_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Account not found")
    return result.data[0]


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        result = (
            supabase.table(TABLE)
            .delete()
            .eq("id", account_id)
            .eq("owner_id", user_id)
            .execute()
        )
    except APIError as e:
        if is_foreign_key_violation(e):
            raise HTTPException(
                status_code=409,
                detail="Account has transactions. Delete or reassign them first.",
            )
        raise
    if not result.data:
        raise HTTPException(status_code=404, detail="Account not found")
    return None
