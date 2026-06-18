"""CRUD + filtering endpoints for transactions. Scoped to the logged-in user."""
from decimal import Decimal
from typing import Optional

from postgrest.exceptions import APIError

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user_id
from app.database import supabase
from app.db_errors import is_check_violation
from app.models.transaction import Transaction, TransactionCreate, TransactionUpdate
from app.services.calculations import compute_cashback

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

TABLE = "transactions"

ONE_SOURCE_MSG = "A transaction must have exactly one payment source: a card or an account."


def _first_of_next_month(year: int, month: int) -> str:
    """Return the YYYY-MM-DD first day of the month after the given one."""
    if month == 12:
        return f"{year + 1}-01-01"
    return f"{year}-{month + 1:02d}-01"


@router.get("", response_model=list[Transaction])
def list_transactions(
    user_id: str = Depends(get_current_user_id),
    profile_id: Optional[str] = None,
    credit_card_id: Optional[str] = None,
    category: Optional[str] = None,
    is_paid_back: Optional[bool] = None,
    year: Optional[int] = Query(default=None, description="Filter by year, e.g. 2026"),
    month: Optional[str] = Query(default=None, description="Filter by month, format YYYY-MM"),
    search: Optional[str] = Query(default=None, description="Merchant name contains"),
):
    query = supabase.table(TABLE).select("*").eq("owner_id", user_id)

    if profile_id is not None:
        query = query.eq("profile_id", profile_id)
    if credit_card_id is not None:
        query = query.eq("credit_card_id", credit_card_id)
    if category is not None:
        query = query.eq("category", category)
    if is_paid_back is not None:
        query = query.eq("is_paid_back", is_paid_back)
    if year is not None:
        query = query.gte("transaction_date", f"{year}-01-01").lt(
            "transaction_date", f"{year + 1}-01-01"
        )
    if month is not None:
        try:
            year_str, month_str = month.split("-")
            year, month_num = int(year_str), int(month_str)
            start = f"{year}-{month_num:02d}-01"
            end = _first_of_next_month(year, month_num)
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="month must be formatted YYYY-MM")
        query = query.gte("transaction_date", start).lt("transaction_date", end)
    if search is not None:
        query = query.ilike("merchant", f"%{search}%")

    result = query.order("transaction_date", desc=True).execute()
    return result.data


@router.post("", response_model=Transaction, status_code=201)
def create_transaction(
    payload: TransactionCreate, user_id: str = Depends(get_current_user_id)
):
    data = payload.model_dump(mode="json")
    data["owner_id"] = user_id
    cashback = compute_cashback(payload.amount, payload.cashback_rate)
    data["cashback_amount"] = str(cashback) if cashback is not None else None
    try:
        result = supabase.table(TABLE).insert(data).execute()
    except APIError as e:
        if is_check_violation(e):
            raise HTTPException(status_code=400, detail=ONE_SOURCE_MSG)
        raise
    return result.data[0]


@router.get("/{transaction_id}", response_model=Transaction)
def get_transaction(transaction_id: str, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table(TABLE)
        .select("*")
        .eq("id", transaction_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return result.data[0]


@router.put("/{transaction_id}", response_model=Transaction)
def update_transaction(
    transaction_id: str,
    payload: TransactionUpdate,
    user_id: str = Depends(get_current_user_id),
):
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")

    # If amount or rate changed, recompute cashback using the new values
    # merged with whatever the row currently has.
    if "amount" in changes or "cashback_rate" in changes:
        current = (
            supabase.table(TABLE)
            .select("*")
            .eq("id", transaction_id)
            .eq("owner_id", user_id)
            .execute()
        )
        if not current.data:
            raise HTTPException(status_code=404, detail="Transaction not found")
        row = current.data[0]
        amount = payload.amount if "amount" in changes else Decimal(str(row["amount"]))
        if "cashback_rate" in changes:
            rate = payload.cashback_rate
        else:
            rate = Decimal(str(row["cashback_rate"])) if row["cashback_rate"] is not None else None
        cashback = compute_cashback(amount, rate)
        changes["cashback_amount"] = str(cashback) if cashback is not None else None

    try:
        result = (
            supabase.table(TABLE)
            .update(changes)
            .eq("id", transaction_id)
            .eq("owner_id", user_id)
            .execute()
        )
    except APIError as e:
        if is_check_violation(e):
            raise HTTPException(status_code=400, detail=ONE_SOURCE_MSG)
        raise
    if not result.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return result.data[0]


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: str, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table(TABLE)
        .delete()
        .eq("id", transaction_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return None
