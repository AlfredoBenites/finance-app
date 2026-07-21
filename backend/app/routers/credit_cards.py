"""CRUD endpoints for credit cards. Scoped to the logged-in user."""
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from postgrest.exceptions import APIError

from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.database import supabase, fetch_all
from app.db_errors import is_foreign_key_violation
from app.models.credit_card import CreditCard, CreditCardCreate, CreditCardUpdate
from app.services import calculations as calc

router = APIRouter(prefix="/api/credit-cards", tags=["credit_cards"])

TABLE = "credit_cards"


class UpgradeRequest(BaseModel):
    new_card_id: str
    upgraded_on: Optional[date] = None


class StatementOverrideRequest(BaseModel):
    amount: Optional[Decimal] = None  # null clears the override


class ReconcileMove(BaseModel):
    transaction_id: str
    in_statement: bool  # True = keep on this statement; False = push to next cycle


class ReconcileRequest(BaseModel):
    moves: list[ReconcileMove]


class PaymentRequest(BaseModel):
    account_id: str
    bucket_id: Optional[str] = None
    amount: Optional[Decimal] = None  # defaults to the full unpaid balance
    paid_on: Optional[date] = None


@router.get("/payments")
def list_payments(user_id: str = Depends(get_current_user_id)):
    """Card payment history, newest first, with card/account/bucket names."""
    rows = supabase.table("card_payments").select("*").eq("owner_id", user_id).execute().data
    cards = {c["id"]: c["name"] for c in supabase.table(TABLE).select("id, name").eq("owner_id", user_id).execute().data}
    accts = {a["id"]: a["name"] for a in supabase.table("accounts").select("id, name").eq("owner_id", user_id).execute().data}
    bks = {b["id"]: b["name"] for b in supabase.table("buckets").select("id, name").eq("owner_id", user_id).execute().data}
    return [
        {
            "id": r["id"],
            "card": cards.get(r["credit_card_id"], "Unknown"),
            "account": accts.get(r["account_id"], "—"),
            "bucket": bks.get(r["bucket_id"], "—") if r.get("bucket_id") else "—",
            "amount": float(r["amount"]),
            "paid_on": r["paid_on"],
        }
        for r in sorted(rows, key=lambda r: (r.get("paid_on") or "", r["created_at"]), reverse=True)
    ]


@router.post("/{card_id}/pay")
def pay_card(card_id: str, payload: PaymentRequest, user_id: str = Depends(get_current_user_id)):
    """Pay a card: settle its unpaid charges, draw the money from an account
    (and optionally a bucket), and record the payment."""
    card = supabase.table(TABLE).select("id").eq("id", card_id).eq("owner_id", user_id).execute()
    if not card.data:
        raise HTTPException(status_code=404, detail="Credit card not found")

    txns = fetch_all(
        lambda: supabase.table("transactions")
        .select("id, amount")
        .eq("owner_id", user_id)
        .eq("credit_card_id", card_id)
        .eq("paid_to_bank", False)
        .order("transaction_date")
    )
    unpaid_total = -sum((Decimal(str(t["amount"])) for t in txns), Decimal("0"))
    amount = payload.amount if payload.amount is not None else unpaid_total
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Nothing to pay on this card")

    acct = supabase.table("accounts").select("balance").eq("id", payload.account_id).eq("owner_id", user_id).execute()
    if not acct.data:
        raise HTTPException(status_code=404, detail="Account not found")
    balance = Decimal(str(acct.data[0]["balance"]))
    if balance < amount:
        raise HTTPException(status_code=400, detail="Account balance is less than the payment")

    # Mark charges paid TO THE BANK: all of them if paying in full, else
    # oldest-first up to the amount. This does NOT touch is_paid_back (whether a
    # person reimbursed you) — paying the issuer and being reimbursed are separate.
    paid_on = (payload.paid_on or date.today()).isoformat()
    if amount >= unpaid_total:
        to_settle = [t["id"] for t in txns]
    else:
        to_settle, cum = [], Decimal("0")
        for t in txns:
            charge = -Decimal(str(t["amount"]))
            if cum + charge <= amount:
                cum += charge
                to_settle.append(t["id"])
            else:
                break
    for tid in to_settle:
        supabase.table("transactions").update(
            {"paid_to_bank": True}
        ).eq("id", tid).eq("owner_id", user_id).execute()

    # Draw the money: from the bucket (down to 0) and the account balance.
    if payload.bucket_id:
        b = supabase.table("buckets").select("current_amount").eq("id", payload.bucket_id).eq("owner_id", user_id).execute()
        if b.data:
            cur = Decimal(str(b.data[0]["current_amount"]))
            new_bucket = cur - amount if cur - amount > 0 else Decimal("0")
            supabase.table("buckets").update({"current_amount": str(new_bucket)}).eq(
                "id", payload.bucket_id
            ).eq("owner_id", user_id).execute()
    supabase.table("accounts").update({"balance": str(balance - amount)}).eq(
        "id", payload.account_id
    ).eq("owner_id", user_id).execute()

    supabase.table("card_payments").insert({
        "owner_id": user_id,
        "credit_card_id": card_id,
        "account_id": payload.account_id,
        "bucket_id": payload.bucket_id,
        "amount": str(amount),
        "paid_on": paid_on,
    }).execute()
    return {"ok": True, "paid": float(amount), "charges_settled": len(to_settle)}


@router.post("/{card_id}/statement-override", response_model=CreditCard)
def set_statement_override(
    card_id: str, payload: StatementOverrideRequest, user_id: str = Depends(get_current_user_id)
):
    """Pin the ACTUAL statement balance for this card's current cycle (or clear it
    with a null amount). Stored with the current close date so it auto-expires once
    the next cycle closes. Escape hatch for issuer quirks the date rules can't model."""
    card = supabase.table(TABLE).select("statement_day").eq("id", card_id).eq("owner_id", user_id).execute()
    if not card.data:
        raise HTTPException(status_code=404, detail="Credit card not found")
    sd = card.data[0].get("statement_day")
    if not sd:
        raise HTTPException(status_code=400, detail="Set a statement day on this card first.")
    if payload.amount is None:
        changes = {"statement_override": None, "statement_override_close": None}
    else:
        if payload.amount < 0:
            raise HTTPException(status_code=400, detail="Amount can't be negative.")
        _open, close = calc.statement_window(int(sd), date.today())
        changes = {"statement_override": str(payload.amount), "statement_override_close": close.isoformat()}
    result = supabase.table(TABLE).update(changes).eq("id", card_id).eq("owner_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Credit card not found")
    return result.data[0]


@router.get("/{card_id}/reconcile")
def get_reconcile(card_id: str, user_id: str = Depends(get_current_user_id)):
    """Charges near this card's current statement close, so the user can fix which
    ones actually landed on this statement (issuers bill by posting date)."""
    card = supabase.table(TABLE).select("statement_day").eq("id", card_id).eq("owner_id", user_id).execute()
    if not card.data:
        raise HTTPException(status_code=404, detail="Credit card not found")
    sd = card.data[0].get("statement_day")
    if not sd:
        raise HTTPException(status_code=400, detail="Set a statement day on this card first.")
    today = date.today()
    open_, close = calc.statement_window(int(sd), today)
    txns = fetch_all(
        lambda: supabase.table("transactions")
        .select("id, transaction_date, posting_date, refund_for_id, merchant, amount, credit_card_id")
        .eq("owner_id", user_id)
        .eq("credit_card_id", card_id)
    )
    by_id = {t["id"]: t for t in txns}
    eff = lambda t: calc.statement_date(t, by_id)
    lo, hi = close - timedelta(days=7), close + timedelta(days=7)
    boundary = sorted([t for t in txns if lo <= eff(t) <= hi], key=eff)
    charges = [
        {
            "id": t["id"],
            "transaction_date": t["transaction_date"],
            "posting_date": t.get("posting_date"),
            "effective_date": eff(t).isoformat(),
            "merchant": t.get("merchant"),
            # Positive contribution to the statement (a purchase adds; a refund subtracts).
            "statement_amount": float(-Decimal(str(t["amount"]))),
            "in_statement": open_ < eff(t) <= close,
        }
        for t in boundary
    ]
    return {
        "open": open_.isoformat(),
        "close": close.isoformat(),
        "estimate": float(calc.statement_balance(txns, int(sd), today)),
        "charges": charges,
    }


@router.post("/{card_id}/reconcile")
def apply_reconcile(card_id: str, payload: ReconcileRequest, user_id: str = Depends(get_current_user_id)):
    """Set each moved charge's posting date so it lands on the statement the user
    says (this cycle = the close date; next cycle = the day after close)."""
    card = supabase.table(TABLE).select("statement_day").eq("id", card_id).eq("owner_id", user_id).execute()
    if not card.data:
        raise HTTPException(status_code=404, detail="Credit card not found")
    sd = card.data[0].get("statement_day")
    if not sd:
        raise HTTPException(status_code=400, detail="Set a statement day on this card first.")
    _open, close = calc.statement_window(int(sd), date.today())
    in_date = close.isoformat()
    out_date = (close + timedelta(days=1)).isoformat()
    updated = 0
    for m in payload.moves:
        pd = in_date if m.in_statement else out_date
        res = (
            supabase.table("transactions")
            .update({"posting_date": pd})
            .eq("id", m.transaction_id)
            .eq("owner_id", user_id)
            .eq("credit_card_id", card_id)
            .execute()
        )
        if res.data:
            updated += 1
    return {"ok": True, "updated": updated}


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
    # The archived card no longer needs a payoff bucket; removing it just frees
    # its allocation back to the account (balances are manual, so no money lost).
    supabase.table("buckets").delete().eq("credit_card_id", card_id).eq(
        "owner_id", user_id
    ).execute()
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
        "is_active": True,
        "is_completed": False,
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
