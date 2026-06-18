"""Dashboard summary endpoint. Scoped to the logged-in user.

Fetches the user's rows once, then delegates all math to services.calculations.
Returns plain floats so the frontend can display them directly.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user_id
from app.database import supabase
from app.services import calculations as calc

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard(
    user_id: str = Depends(get_current_user_id),
    year: Optional[int] = Query(default=None, description="Scope to a year, e.g. 2026"),
    only_primary: bool = Query(default=False, description="Count only your own profile's debt"),
    exclude_repayments: bool = Query(default=False, description="Exclude repayment income from total"),
):
    def owned(table, columns="*"):
        return supabase.table(table).select(columns).eq("owner_id", user_id).execute().data

    transactions = owned("transactions")
    buckets = owned("buckets")
    accounts = owned("accounts")
    profiles = owned("profiles", "id, name, is_primary")
    cards = owned("credit_cards", "id, name")
    income_rows = owned("income", "amount, income_date, category")

    # Year scopes the transaction/income-derived numbers; account balances are
    # always current (they aren't dated).
    if year is not None:
        prefix = f"{year}-"
        transactions = [t for t in transactions if str(t["transaction_date"]).startswith(prefix)]
        income_rows = [i for i in income_rows if str(i["income_date"]).startswith(prefix)]

    # "only my debt": scope debt / net worth / available to your own profile, so
    # money others owe you (e.g. Mom's charges) isn't counted as your debt.
    debt_txns = transactions
    if only_primary:
        primary_id = next((p["id"] for p in profiles if p.get("is_primary")), None)
        if primary_id is not None:
            debt_txns = [t for t in transactions if t["profile_id"] == primary_id]

    if exclude_repayments:
        income_rows = [i for i in income_rows if (i.get("category") or "") != "Repayment"]
    total_income = sum((calc._dec(i["amount"]) for i in income_rows), calc.Decimal("0"))

    profile_names = {p["id"]: p["name"] for p in profiles}
    card_names = {c["id"]: c["name"] for c in cards}

    owed = calc.owed_by_profile(transactions)
    debts = calc.debt_by_card(debt_txns)

    return {
        "total_credit_card_debt": float(calc.total_card_debt(debt_txns)),
        "total_cashback_earned": float(calc.cashback_earned(transactions)),
        "total_cashback_pending": float(calc.cashback_pending(transactions)),
        "total_bucket_money": float(calc.total_bucket_money(buckets)),
        "liquid_cash": float(calc.liquid_cash(accounts)),
        "real_available_money": float(
            calc.real_available_money(accounts, debt_txns, buckets)
        ),
        "total_assets": float(calc.total_assets(accounts)),
        "net_worth": float(calc.net_worth(accounts, debt_txns)),
        "total_income": float(total_income),
        "owed_by_profile": [
            {"profile_id": pid, "name": profile_names.get(pid, "Unknown"), "amount": float(amt)}
            for pid, amt in owed.items()
        ],
        "debt_by_card": [
            {"credit_card_id": cid, "name": card_names.get(cid, "Unknown"), "balance": float(bal)}
            for cid, bal in debts.items()
        ],
    }
