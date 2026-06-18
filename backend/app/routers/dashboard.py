"""Dashboard summary endpoint. Scoped to the logged-in user.

Fetches the user's rows once, then delegates all math to services.calculations.
Returns plain floats so the frontend can display them directly.
"""
from fastapi import APIRouter, Depends

from app.auth import get_current_user_id
from app.database import supabase
from app.services import calculations as calc

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard(user_id: str = Depends(get_current_user_id)):
    def owned(table, columns="*"):
        return supabase.table(table).select(columns).eq("owner_id", user_id).execute().data

    transactions = owned("transactions")
    buckets = owned("buckets")
    accounts = owned("accounts")
    profiles = owned("profiles", "id, name")
    cards = owned("credit_cards", "id, name")
    income_rows = owned("income", "amount")
    total_income = sum((calc._dec(i["amount"]) for i in income_rows), calc.Decimal("0"))

    profile_names = {p["id"]: p["name"] for p in profiles}
    card_names = {c["id"]: c["name"] for c in cards}

    owed = calc.owed_by_profile(transactions)
    debts = calc.debt_by_card(transactions)

    return {
        "total_credit_card_debt": float(calc.total_card_debt(transactions)),
        "total_cashback_earned": float(calc.cashback_earned(transactions)),
        "total_cashback_pending": float(calc.cashback_pending(transactions)),
        "total_bucket_money": float(calc.total_bucket_money(buckets)),
        "liquid_cash": float(calc.liquid_cash(accounts)),
        "real_available_money": float(
            calc.real_available_money(accounts, transactions, buckets)
        ),
        "total_assets": float(calc.total_assets(accounts)),
        "net_worth": float(calc.net_worth(accounts, transactions)),
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
