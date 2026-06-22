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


def _allocation_groups(user_id: str):
    """Not-yet-allocated paid card charges grouped by (profile_id, card_id),
    with each group's total owed and the individual lines behind it."""
    txns = (
        supabase.table("transactions")
        .select(
            "amount, credit_card_id, profile_id, reimbursement_allocated, "
            "merchant, transaction_date, category, notes"
        )
        .eq("owner_id", user_id)
        .eq("is_paid_back", True)
        .order("transaction_date")
        .execute()
        .data
    )
    groups: dict[tuple, dict] = {}
    for t in txns:
        if not t.get("credit_card_id") or t.get("reimbursement_allocated"):
            continue
        key = (t["profile_id"], t["credit_card_id"])
        g = groups.setdefault(key, {"total": Decimal("0"), "lines": []})
        amt = Decimal(str(t["amount"]))
        g["total"] += -amt  # purchases are negative; owed is positive
        g["lines"].append({
            "transaction_date": t["transaction_date"],
            "merchant": t.get("merchant"),
            "category": t.get("category"),
            "notes": t.get("notes"),
            "amount": float(amt),
        })
    return {k: v for k, v in groups.items() if v["total"] > 0}


def _allocations(user_id: str):
    """(profile_id, card_id) -> total owed. Used by allocate/dismiss validation."""
    return {k: v["total"] for k, v in _allocation_groups(user_id).items()}


@router.get("/reimbursements")
def list_reimbursements(user_id: str = Depends(get_current_user_id)):
    """Suggestions: paid charges not yet moved into a card's payoff bucket.

    Each proposes moving the money from that profile's default bucket into the
    card's payoff bucket (both overridable in the UI)."""
    groups = _allocation_groups(user_id)
    if not groups:
        return []
    profiles = {p["id"]: p for p in supabase.table("profiles").select("id, name, default_bucket_id").eq("owner_id", user_id).execute().data}
    cards = {c["id"]: c["name"] for c in supabase.table("credit_cards").select("id, name").eq("owner_id", user_id).execute().data}
    bks = supabase.table(TABLE).select("id, name, credit_card_id, account_id").eq("owner_id", user_id).execute().data
    bk_name = {b["id"]: b["name"] for b in bks}
    payoff = {b["credit_card_id"]: b["id"] for b in bks if b["credit_card_id"] and b["account_id"]}
    out = []
    for (pid, cid), g in groups.items():
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
            "amount": float(g["total"]),
            "transactions": g["lines"],
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
    _mark_handled(user_id, payload.profile_id, payload.credit_card_id)
    return {"ok": True, "allocated": float(amount)}


class DismissRequest(BaseModel):
    profile_id: str
    credit_card_id: str


def _mark_handled(user_id: str, profile_id=None, card_id=None):
    """Mark paid charges as allocated (handled) without moving money.

    A single bulk UPDATE — not one request per row — so dismissing stays fast
    even with thousands of paid transactions. Setting the flag on a paid bank
    charge (no card) is harmless: those are never suggested anyway.
    """
    q = (
        supabase.table("transactions")
        .update({"reimbursement_allocated": True})
        .eq("owner_id", user_id)
        .eq("is_paid_back", True)
    )
    if profile_id:
        q = q.eq("profile_id", profile_id)
    if card_id:
        q = q.eq("credit_card_id", card_id)
    q.execute()


@router.post("/dismiss-reimbursement")
def dismiss_reimbursement(payload: DismissRequest, user_id: str = Depends(get_current_user_id)):
    """Decline one suggestion (mark that profile+card's charges handled)."""
    _mark_handled(user_id, payload.profile_id, payload.credit_card_id)
    return {"ok": True}


@router.post("/dismiss-all-reimbursements")
def dismiss_all_reimbursements(user_id: str = Depends(get_current_user_id)):
    """Decline all current suggestions."""
    _mark_handled(user_id)
    return {"ok": True}


# --- income -> bucket allocation --------------------------------------------

class AllocateIncomeRequest(BaseModel):
    income_id: str
    bucket_id: str


class DismissIncomeRequest(BaseModel):
    income_id: str


@router.get("/income-allocations")
def list_income_allocations(user_id: str = Depends(get_current_user_id)):
    """Income recorded into an account that hasn't been put in a bucket yet.

    Each suggestion lets you drop the income into a bucket in the same account."""
    rows = (
        supabase.table("income")
        .select("id, source, amount, account_id, income_date, bucket_allocated")
        .eq("owner_id", user_id)
        .order("income_date", desc=True)
        .execute()
        .data
    )
    acct_names = {
        a["id"]: a["name"]
        for a in supabase.table("accounts").select("id, name").eq("owner_id", user_id).execute().data
    }
    out = []
    for r in rows:
        if r.get("bucket_allocated") or not r.get("account_id"):
            continue
        out.append({
            "income_id": r["id"],
            "source": r["source"],
            "amount": float(r["amount"]),
            "account_id": r["account_id"],
            "account_name": acct_names.get(r["account_id"], "Unknown"),
            "income_date": r["income_date"],
        })
    return out


@router.post("/allocate-income")
def allocate_income(payload: AllocateIncomeRequest, user_id: str = Depends(get_current_user_id)):
    """Land a recorded income amount in its account's balance, optionally earmarked
    in a bucket. bucket_id 'unallocated' adds it to the balance only (not earmarked)."""
    inc = (
        supabase.table("income").select("id, amount, account_id, bucket_allocated")
        .eq("id", payload.income_id).eq("owner_id", user_id).execute().data
    )
    if not inc:
        raise HTTPException(status_code=404, detail="Income not found")
    inc = inc[0]
    if inc.get("bucket_allocated"):
        raise HTTPException(status_code=400, detail="Already allocated")
    amount = Decimal(str(inc["amount"]))

    bk = None
    if payload.bucket_id and payload.bucket_id != UNALLOCATED:
        rows = (
            supabase.table(TABLE).select("id, current_amount, account_id")
            .eq("id", payload.bucket_id).eq("owner_id", user_id).execute().data
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Bucket not found")
        bk = rows[0]
        if bk["account_id"] != inc["account_id"]:
            raise HTTPException(status_code=400, detail="Pick a bucket in the same account the income went into")

    acc = (
        supabase.table("accounts").select("balance")
        .eq("id", inc["account_id"]).eq("owner_id", user_id).execute().data
    )
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    # the money lands in the account either way; a bucket also earmarks it
    supabase.table("accounts").update(
        {"balance": str(Decimal(str(acc[0]["balance"])) + amount)}
    ).eq("id", inc["account_id"]).eq("owner_id", user_id).execute()
    if bk:
        supabase.table(TABLE).update(
            {"current_amount": str(Decimal(str(bk["current_amount"])) + amount)}
        ).eq("id", bk["id"]).eq("owner_id", user_id).execute()
    supabase.table("income").update({"bucket_allocated": True}).eq("id", inc["id"]).eq("owner_id", user_id).execute()
    return {"ok": True, "allocated": float(amount)}


@router.post("/dismiss-income")
def dismiss_income(payload: DismissIncomeRequest, user_id: str = Depends(get_current_user_id)):
    """Decline a single income suggestion (mark handled, move nothing)."""
    r = supabase.table("income").update({"bucket_allocated": True}).eq(
        "id", payload.income_id
    ).eq("owner_id", user_id).execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="Income not found")
    return {"ok": True}


@router.post("/dismiss-all-income")
def dismiss_all_income(user_id: str = Depends(get_current_user_id)):
    """Decline all income suggestions."""
    supabase.table("income").update({"bucket_allocated": True}).eq(
        "owner_id", user_id
    ).eq("bucket_allocated", False).execute()
    return {"ok": True}


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
