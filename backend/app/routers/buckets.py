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


def _reimbursements(user_id: str):
    """Group not-yet-allocated reimbursements (others' paid card charges) by card.

    Returns dict card_id -> Decimal total, plus the primary profile id.
    """
    primary = (
        supabase.table("profiles").select("id").eq("owner_id", user_id).eq("is_primary", True).execute().data
    )
    primary_id = primary[0]["id"] if primary else None
    txns = (
        supabase.table("transactions")
        .select("amount, credit_card_id, profile_id, is_paid_back, reimbursement_allocated")
        .eq("owner_id", user_id)
        .eq("is_paid_back", True)
        .execute()
        .data
    )
    totals: dict[str, Decimal] = {}
    for t in txns:
        if not t.get("credit_card_id") or t.get("reimbursement_allocated"):
            continue
        if primary_id is not None and t.get("profile_id") == primary_id:
            continue  # your own charge paid = you paid the bank, not a reimbursement
        totals[t["credit_card_id"]] = totals.get(t["credit_card_id"], Decimal("0")) - Decimal(str(t["amount"]))
    return {cid: amt for cid, amt in totals.items() if amt > 0}


@router.get("/reimbursements")
def list_reimbursements(user_id: str = Depends(get_current_user_id)):
    """Suggestions: reimbursed money not yet moved into a card's payoff bucket."""
    totals = _reimbursements(user_id)
    if not totals:
        return []
    cards = {c["id"]: c["name"] for c in supabase.table("credit_cards").select("id, name").eq("owner_id", user_id).execute().data}
    accts = {a["id"]: a["name"] for a in supabase.table("accounts").select("id, name").eq("owner_id", user_id).execute().data}
    bks = supabase.table(TABLE).select("id, name, credit_card_id, account_id").eq("owner_id", user_id).execute().data
    out = []
    for cid, amount in totals.items():
        bucket = next((b for b in bks if b["credit_card_id"] == cid and b["account_id"]), None)
        if not bucket:
            continue  # no payoff bucket assigned to an account yet
        out.append({
            "credit_card_id": cid,
            "card_name": cards.get(cid, "Unknown"),
            "bucket_id": bucket["id"],
            "bucket_name": bucket["name"],
            "account_id": bucket["account_id"],
            "account_name": accts.get(bucket["account_id"], "—"),
            "amount": float(amount),
        })
    return out


@router.post("/allocate-reimbursement")
def allocate_reimbursement(card_id: str, user_id: str = Depends(get_current_user_id)):
    """Move a card's reimbursed money into its payoff bucket (from unallocated)."""
    amount = _reimbursements(user_id).get(card_id)
    if not amount:
        raise HTTPException(status_code=400, detail="Nothing to allocate for this card")
    bucket = (
        supabase.table(TABLE)
        .select("id, current_amount, account_id")
        .eq("owner_id", user_id)
        .eq("credit_card_id", card_id)
        .execute()
        .data
    )
    bucket = next((b for b in bucket if b["account_id"]), None)
    if not bucket:
        raise HTTPException(status_code=400, detail="Assign this card's payoff bucket to an account first")

    acct = supabase.table("accounts").select("balance").eq("id", bucket["account_id"]).eq("owner_id", user_id).execute()
    balance = Decimal(str(acct.data[0]["balance"]))
    siblings = supabase.table(TABLE).select("current_amount").eq("owner_id", user_id).eq("account_id", bucket["account_id"]).execute().data
    unallocated = balance - sum((Decimal(str(b["current_amount"])) for b in siblings), Decimal("0"))
    if unallocated < amount:
        raise HTTPException(
            status_code=400,
            detail="Update the account balance to reflect the reimbursement, then allocate.",
        )

    supabase.table(TABLE).update(
        {"current_amount": str(Decimal(str(bucket["current_amount"])) + amount)}
    ).eq("id", bucket["id"]).eq("owner_id", user_id).execute()
    # Mark those charges as allocated so they stop being suggested.
    primary = supabase.table("profiles").select("id").eq("owner_id", user_id).eq("is_primary", True).execute().data
    primary_id = primary[0]["id"] if primary else None
    txns = (
        supabase.table("transactions").select("id, profile_id, reimbursement_allocated")
        .eq("owner_id", user_id).eq("credit_card_id", card_id).eq("is_paid_back", True).execute().data
    )
    for t in txns:
        if t.get("reimbursement_allocated"):
            continue
        if primary_id is not None and t.get("profile_id") == primary_id:
            continue
        supabase.table("transactions").update({"reimbursement_allocated": True}).eq("id", t["id"]).eq("owner_id", user_id).execute()
    return {"ok": True, "allocated": float(amount)}


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
