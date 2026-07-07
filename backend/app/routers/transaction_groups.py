"""Group purchases: one shared charge split into a per-participant transaction.

Each split line is a normal transaction (on the payer's card) linked by group_id,
so owed-by-profile, reimbursement suggestions, cashback, and statements all work
unchanged. The calculator inputs are stored on transaction_groups so a group can
be reopened and re-split; editing matches lines by profile to preserve each
person's reimbursed/paid state.
"""
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.database import supabase
from app.services.calculations import compute_cashback
from app.services.group_split import compute_shares

router = APIRouter(prefix="/api/transaction-groups", tags=["transaction-groups"])

TABLE = "transaction_groups"
TXN = "transactions"


class GroupParticipant(BaseModel):
    profile_id: str
    subtotal: Optional[Decimal] = None  # required in itemized mode
    charged_to: Optional[str] = None  # who pays this share (defaults to profile_id)


class GroupPurchase(BaseModel):
    mode: str = "itemized"  # "itemized" | "even"
    # Exactly one payment source: a credit card OR an account (bank/cash).
    card_id: Optional[str] = None
    account_id: Optional[str] = None
    transaction_date: date
    merchant: Optional[str] = None
    category: Optional[str] = None
    cashback_rate: Optional[Decimal] = None
    notes: Optional[str] = None
    amount: Optional[Decimal] = None  # actual total charged, kept for the record/verification
    # Shared costs entered as amounts (from the receipt).
    tax: Decimal = Decimal("0")
    tip: Decimal = Decimal("0")
    delivery_fee: Decimal = Decimal("0")
    service_fee: Decimal = Decimal("0")
    discount: Decimal = Decimal("0")
    subtotal: Optional[Decimal] = None  # even mode: the single shared subtotal
    payer_profile_id: Optional[str] = None
    participants: list[GroupParticipant]


def _shares(payload: GroupPurchase):
    if not payload.participants:
        raise HTTPException(status_code=400, detail="Add at least one participant.")
    if bool(payload.card_id) == bool(payload.account_id):
        raise HTTPException(status_code=400, detail="Pick exactly one payment source: a card or an account.")
    shares = compute_shares(
        mode=payload.mode,
        tax=payload.tax,
        tip=payload.tip,
        delivery_fee=payload.delivery_fee,
        service_fee=payload.service_fee,
        discount=payload.discount,
        participants=[p.model_dump() for p in payload.participants],
        subtotal=payload.subtotal,
        payer_profile_id=payload.payer_profile_id,
    )
    if any(s["owed"] <= 0 for s in shares):
        raise HTTPException(status_code=400, detail="Every participant's share must be positive.")
    return shares


def _line_fields(payload: GroupPurchase, profile_id: str, owed: Decimal, group_id: str):
    amount = -owed  # a purchase is negative
    is_card = bool(payload.card_id)
    cashback = compute_cashback(amount, payload.cashback_rate) if is_card else None
    return {
        "transaction_date": payload.transaction_date.isoformat(),
        "merchant": payload.merchant,
        "category": payload.category,
        "amount": str(amount),
        "profile_id": profile_id,
        "credit_card_id": payload.card_id,
        "account_id": payload.account_id,
        "cashback_rate": str(payload.cashback_rate) if (is_card and payload.cashback_rate is not None) else None,
        "cashback_amount": str(cashback) if cashback is not None else None,
        "notes": payload.notes,
        "group_id": group_id,
    }


# Fresh split lines start unsettled (the payer's own share and everyone else's
# debt). Set explicitly so the row is complete even where DB defaults don't apply.
NEW_LINE_DEFAULTS = {"is_paid_back": False, "paid_back_date": None}


@router.post("", status_code=201)
def create_group(payload: GroupPurchase, user_id: str = Depends(get_current_user_id)):
    shares = _shares(payload)
    group = supabase.table(TABLE).insert(
        {"owner_id": user_id, "data": payload.model_dump(mode="json")}
    ).execute().data[0]
    lines = []
    for s in shares:
        data = _line_fields(payload, s["profile_id"], s["owed"], group["id"])
        data.update(NEW_LINE_DEFAULTS)
        data["owner_id"] = user_id
        lines.append(supabase.table(TXN).insert(data).execute().data[0])
    return {"group": group, "transactions": lines}


@router.get("/{group_id}")
def get_group(group_id: str, user_id: str = Depends(get_current_user_id)):
    g = supabase.table(TABLE).select("*").eq("id", group_id).eq("owner_id", user_id).execute().data
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return g[0]


@router.put("/{group_id}")
def update_group(group_id: str, payload: GroupPurchase, user_id: str = Depends(get_current_user_id)):
    existing = supabase.table(TABLE).select("id").eq("id", group_id).eq("owner_id", user_id).execute().data
    if not existing:
        raise HTTPException(status_code=404, detail="Group not found")
    shares = _shares(payload)

    current = supabase.table(TXN).select("*").eq("group_id", group_id).eq("owner_id", user_id).execute().data
    by_profile = {t["profile_id"]: t for t in current}
    keep_profiles = {s["profile_id"] for s in shares}

    lines = []
    for s in shares:
        fields = _line_fields(payload, s["profile_id"], s["owed"], group_id)
        prior = by_profile.get(s["profile_id"])
        if prior:
            # Update amount/details but keep this line's reimbursed/paid state.
            updated = supabase.table(TXN).update(fields).eq("id", prior["id"]).eq("owner_id", user_id).execute().data[0]
            lines.append(updated)
        else:
            fields.update(NEW_LINE_DEFAULTS)
            fields["owner_id"] = user_id
            lines.append(supabase.table(TXN).insert(fields).execute().data[0])
    # Drop lines for participants no longer in the group.
    for t in current:
        if t["profile_id"] not in keep_profiles:
            supabase.table(TXN).delete().eq("id", t["id"]).eq("owner_id", user_id).execute()

    supabase.table(TABLE).update({"data": payload.model_dump(mode="json")}).eq("id", group_id).eq("owner_id", user_id).execute()
    return {"group_id": group_id, "transactions": lines}


@router.delete("/{group_id}", status_code=204)
def delete_group(group_id: str, user_id: str = Depends(get_current_user_id)):
    existing = supabase.table(TABLE).select("id").eq("id", group_id).eq("owner_id", user_id).execute().data
    if not existing:
        raise HTTPException(status_code=404, detail="Group not found")
    supabase.table(TXN).delete().eq("group_id", group_id).eq("owner_id", user_id).execute()
    supabase.table(TABLE).delete().eq("id", group_id).eq("owner_id", user_id).execute()
    return None
