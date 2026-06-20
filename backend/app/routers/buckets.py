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


class AllocateRequest(BaseModel):
    profile_id: str
    credit_card_id: str
    source_bucket_id: str
    dest_bucket_id: str


def _allocations(user_id: str):
    """Group not-yet-allocated paid card charges by (profile_id, card_id)."""
    txns = (
        supabase.table("transactions")
        .select("amount, credit_card_id, profile_id, reimbursement_allocated")
        .eq("owner_id", user_id)
        .eq("is_paid_back", True)
        .execute()
        .data
    )
    totals: dict[tuple, Decimal] = {}
    for t in txns:
        if not t.get("credit_card_id") or t.get("reimbursement_allocated"):
            continue
        key = (t["profile_id"], t["credit_card_id"])
        totals[key] = totals.get(key, Decimal("0")) - Decimal(str(t["amount"]))
    return {k: v for k, v in totals.items() if v > 0}


@router.get("/reimbursements")
def list_reimbursements(user_id: str = Depends(get_current_user_id)):
    """Suggestions: paid charges not yet moved into a card's payoff bucket.

    Each proposes moving the money from that profile's default bucket into the
    card's payoff bucket (both overridable in the UI)."""
    totals = _allocations(user_id)
    if not totals:
        return []
    profiles = {p["id"]: p for p in supabase.table("profiles").select("id, name, default_bucket_id").eq("owner_id", user_id).execute().data}
    cards = {c["id"]: c["name"] for c in supabase.table("credit_cards").select("id, name").eq("owner_id", user_id).execute().data}
    bks = supabase.table(TABLE).select("id, name, credit_card_id, account_id").eq("owner_id", user_id).execute().data
    bk_name = {b["id"]: b["name"] for b in bks}
    payoff = {b["credit_card_id"]: b["id"] for b in bks if b["credit_card_id"] and b["account_id"]}
    out = []
    for (pid, cid), amount in totals.items():
        prof = profiles.get(pid, {})
        src = prof.get("default_bucket_id")
        dest = payoff.get(cid)
        out.append({
            "profile_id": pid,
            "profile_name": prof.get("name", "Unknown"),
            "credit_card_id": cid,
            "card_name": cards.get(cid, "Unknown"),
            "source_bucket_id": src,
            "source_bucket_name": bk_name.get(src),
            "dest_bucket_id": dest,
            "dest_bucket_name": bk_name.get(dest),
            "amount": float(amount),
        })
    return out


@router.post("/allocate-reimbursement")
def allocate_reimbursement(payload: AllocateRequest, user_id: str = Depends(get_current_user_id)):
    """Move a (profile, card)'s money from a source bucket into a dest bucket."""
    amount = _allocations(user_id).get((payload.profile_id, payload.credit_card_id))
    if not amount:
        raise HTTPException(status_code=400, detail="Nothing to allocate")
    if payload.source_bucket_id == payload.dest_bucket_id:
        raise HTTPException(status_code=400, detail="Source and destination must differ")

    def get_bucket(bid):
        r = supabase.table(TABLE).select("id, current_amount, account_id").eq("id", bid).eq("owner_id", user_id).execute()
        if not r.data:
            raise HTTPException(status_code=404, detail="Bucket not found")
        return r.data[0]

    src = get_bucket(payload.source_bucket_id)
    dest = get_bucket(payload.dest_bucket_id)
    src_amt = Decimal(str(src["current_amount"]))
    if src_amt < amount:
        raise HTTPException(status_code=400, detail="Source bucket doesn't have that much")

    supabase.table(TABLE).update({"current_amount": str(src_amt - amount)}).eq("id", src["id"]).eq("owner_id", user_id).execute()
    supabase.table(TABLE).update({"current_amount": str(Decimal(str(dest["current_amount"])) + amount)}).eq("id", dest["id"]).eq("owner_id", user_id).execute()
    # A cross-account move also shifts the two account balances.
    if src["account_id"] and dest["account_id"] and src["account_id"] != dest["account_id"]:
        for acc_id, delta in ((src["account_id"], -amount), (dest["account_id"], amount)):
            a = supabase.table("accounts").select("balance").eq("id", acc_id).eq("owner_id", user_id).execute()
            if a.data:
                supabase.table("accounts").update({"balance": str(Decimal(str(a.data[0]["balance"])) + delta)}).eq("id", acc_id).eq("owner_id", user_id).execute()

    # Mark the (profile, card) charges as allocated so they stop being suggested.
    txns = (
        supabase.table("transactions").select("id, reimbursement_allocated")
        .eq("owner_id", user_id).eq("credit_card_id", payload.credit_card_id)
        .eq("profile_id", payload.profile_id).eq("is_paid_back", True).execute().data
    )
    for t in txns:
        if not t.get("reimbursement_allocated"):
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
