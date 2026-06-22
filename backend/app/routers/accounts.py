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


UNALLOCATED = "unallocated"


class AccountTransfer(BaseModel):
    from_account_id: str
    to_account_id: str
    amount: Decimal
    # optional: pull from / drop into a specific bucket; None or "unallocated"
    # means the account's unallocated money.
    from_bucket_id: str = UNALLOCATED
    to_bucket_id: str = UNALLOCATED


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


def _bucket_in_account(user_id, bucket_id, account_id):
    """Fetch a bucket and confirm it belongs to the account. Returns the row."""
    b = supabase.table("buckets").select("id, current_amount, account_id").eq("id", bucket_id).eq("owner_id", user_id).execute().data
    if not b:
        raise HTTPException(status_code=404, detail="Bucket not found")
    if b[0]["account_id"] != account_id:
        raise HTTPException(status_code=400, detail="That bucket isn't in the chosen account")
    return b[0]


@router.post("/transfer")
def transfer_between_accounts(payload: AccountTransfer, user_id: str = Depends(get_current_user_id)):
    """Move money from one account to another (e.g. bank -> brokerage).

    Optionally pull from a specific bucket and/or drop into one; otherwise it
    uses each account's unallocated money. Bucket envelopes stay consistent."""
    amount = payload.amount
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status_code=400, detail="Pick two different accounts")

    src = supabase.table(TABLE).select("balance, name").eq("id", payload.from_account_id).eq("owner_id", user_id).execute().data
    dst = supabase.table(TABLE).select("balance").eq("id", payload.to_account_id).eq("owner_id", user_id).execute().data
    if not src or not dst:
        raise HTTPException(status_code=404, detail="Account not found")
    src_balance = Decimal(str(src[0]["balance"]))

    # --- validate the source side ---
    from_bucket = None
    if payload.from_bucket_id and payload.from_bucket_id != UNALLOCATED:
        from_bucket = _bucket_in_account(user_id, payload.from_bucket_id, payload.from_account_id)
        if Decimal(str(from_bucket["current_amount"])) < amount:
            raise HTTPException(status_code=400, detail="That bucket doesn't have that much")
    else:
        bks = supabase.table("buckets").select("current_amount").eq("owner_id", user_id).eq("account_id", payload.from_account_id).execute().data
        unallocated = src_balance - sum((Decimal(str(b["current_amount"])) for b in bks), Decimal("0"))
        if amount > unallocated:
            raise HTTPException(
                status_code=400,
                detail=f"Only {unallocated} is unallocated in {src[0]['name']}; pull from a bucket instead.",
            )

    to_bucket = None
    if payload.to_bucket_id and payload.to_bucket_id != UNALLOCATED:
        to_bucket = _bucket_in_account(user_id, payload.to_bucket_id, payload.to_account_id)

    # --- apply: balances always move; buckets move only if specified ---
    supabase.table(TABLE).update({"balance": str(src_balance - amount)}).eq("id", payload.from_account_id).eq("owner_id", user_id).execute()
    supabase.table(TABLE).update({"balance": str(Decimal(str(dst[0]["balance"])) + amount)}).eq("id", payload.to_account_id).eq("owner_id", user_id).execute()
    if from_bucket:
        supabase.table("buckets").update({"current_amount": str(Decimal(str(from_bucket["current_amount"])) - amount)}).eq("id", from_bucket["id"]).eq("owner_id", user_id).execute()
    if to_bucket:
        supabase.table("buckets").update({"current_amount": str(Decimal(str(to_bucket["current_amount"])) + amount)}).eq("id", to_bucket["id"]).eq("owner_id", user_id).execute()
    return {"ok": True, "transferred": float(amount)}


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
