"""CRUD endpoints for buckets. Scoped to the logged-in user."""
from decimal import Decimal

from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.database import supabase
from app.models.bucket import Bucket, BucketCreate, BucketUpdate

router = APIRouter(prefix="/api/buckets", tags=["buckets"])

TABLE = "buckets"

UNALLOCATED = "unallocated"


class TransferRequest(BaseModel):
    account_id: str
    source: str = Field(alias="from")  # a bucket id, or "unallocated"
    to: str  # a bucket id, or "unallocated"
    amount: Decimal

    model_config = {"populate_by_name": True}


@router.post("/transfer")
def transfer(payload: TransferRequest, user_id: str = Depends(get_current_user_id)):
    """Move money between buckets (and to/from unallocated) within one account.

    Constraints: positive amount, a bucket can't go negative, and allocations
    can't exceed the account balance (unallocated can't go negative).
    """
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if payload.source == payload.to:
        raise HTTPException(status_code=400, detail="Source and destination must differ")

    acct = (
        supabase.table("accounts")
        .select("balance")
        .eq("id", payload.account_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not acct.data:
        raise HTTPException(status_code=404, detail="Account not found")
    balance = Decimal(str(acct.data[0]["balance"]))

    rows = (
        supabase.table(TABLE)
        .select("id, current_amount")
        .eq("owner_id", user_id)
        .eq("account_id", payload.account_id)
        .execute()
        .data
    )
    amounts = {r["id"]: Decimal(str(r["current_amount"])) for r in rows}
    unallocated = balance - sum(amounts.values(), Decimal("0"))
    amt = payload.amount

    # Validate the source has enough.
    if payload.source == UNALLOCATED:
        if unallocated < amt:
            raise HTTPException(status_code=400, detail="Not enough unallocated money")
    else:
        if payload.source not in amounts:
            raise HTTPException(status_code=404, detail="Source bucket not in this account")
        if amounts[payload.source] < amt:
            raise HTTPException(status_code=400, detail="Bucket doesn't have that much")
    if payload.to != UNALLOCATED and payload.to not in amounts:
        raise HTTPException(status_code=404, detail="Destination bucket not in this account")

    # Apply: decrease the source bucket, increase the destination bucket.
    if payload.source != UNALLOCATED:
        supabase.table(TABLE).update({"current_amount": str(amounts[payload.source] - amt)}).eq(
            "id", payload.source
        ).eq("owner_id", user_id).execute()
    if payload.to != UNALLOCATED:
        supabase.table(TABLE).update({"current_amount": str(amounts[payload.to] + amt)}).eq(
            "id", payload.to
        ).eq("owner_id", user_id).execute()
    return {"ok": True}


@router.get("", response_model=list[Bucket])
def list_buckets(user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table(TABLE)
        .select("*")
        .eq("owner_id", user_id)
        .order("created_at")
        .execute()
    )
    return result.data


@router.post("", response_model=Bucket, status_code=201)
def create_bucket(payload: BucketCreate, user_id: str = Depends(get_current_user_id)):
    data = payload.model_dump(mode="json")
    data["owner_id"] = user_id
    result = supabase.table(TABLE).insert(data).execute()
    return result.data[0]


@router.get("/{bucket_id}", response_model=Bucket)
def get_bucket(bucket_id: str, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table(TABLE)
        .select("*")
        .eq("id", bucket_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Bucket not found")
    return result.data[0]


@router.put("/{bucket_id}", response_model=Bucket)
def update_bucket(
    bucket_id: str,
    payload: BucketUpdate,
    user_id: str = Depends(get_current_user_id),
):
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        supabase.table(TABLE)
        .update(changes)
        .eq("id", bucket_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Bucket not found")
    return result.data[0]


@router.delete("/{bucket_id}", status_code=204)
def delete_bucket(bucket_id: str, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table(TABLE)
        .delete()
        .eq("id", bucket_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Bucket not found")
    return None
