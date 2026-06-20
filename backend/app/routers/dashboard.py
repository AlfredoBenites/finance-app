"""Dashboard summary endpoint. Scoped to the logged-in user.

Fetches the user's rows once, then delegates all math to services.calculations.
Returns plain floats so the frontend can display them directly.
"""
import calendar
from datetime import date
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

    all_transactions = owned("transactions")  # unfiltered; statement cycles ignore the year filter
    transactions = all_transactions
    buckets = owned("buckets")
    accounts = owned("accounts")
    profiles = owned("profiles", "id, name, is_primary")
    cards = owned("credit_cards", "id, name, due_day, statement_day")
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

    # Debt is what's owed on each card; the payoff bucket is shown as how much
    # you've SAVED toward it (paying the card via the Payments tab is what
    # reduces the debt). owed already excludes reimbursed charges.
    savings = calc.card_bucket_savings(buckets)

    # Current statement balance per card (charges in the most-recently-closed
    # billing cycle) for cards that have a statement closing day set. This is
    # what's actually due to the bank — independent of reimbursement status.
    today = date.today()
    statement_by_card = {}
    for c in cards:
        sd = c.get("statement_day")
        if sd:
            card_txns = [t for t in all_transactions if t.get("credit_card_id") == c["id"]]
            statement_by_card[c["id"]] = calc.statement_balance(card_txns, int(sd), today)

    debt_by_card = []
    total_debt = calc.Decimal("0")
    card_ids = set(debts) | {cid for cid, v in statement_by_card.items() if v > 0}
    for cid in card_ids:
        owed_amt = debts.get(cid, calc.Decimal("0"))
        total_debt += owed_amt
        stmt = statement_by_card.get(cid)
        debt_by_card.append({
            "credit_card_id": cid,
            "name": card_names.get(cid, "Unknown"),
            "owed": float(owed_amt),
            "saved": float(savings.get(cid, calc.Decimal("0"))),
            "balance": float(owed_amt),
            "statement": float(stmt) if stmt is not None else None,
        })
    debt_by_card.sort(key=lambda d: -d["balance"])

    # Upcoming payment reminders: the full balance owed to the bank, due on each
    # card's due day. (Uses all profiles' charges — you pay the bank the total.)
    full_debts = calc.debt_by_card(all_transactions)

    def next_due(day):
        def on(y, m):
            return date(y, m, min(day, calendar.monthrange(y, m)[1]))
        this_month = on(today.year, today.month)
        if this_month >= today:
            return this_month
        y, m = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
        return on(y, m)

    upcoming_payments = []
    for c in cards:
        # With a statement day, the upcoming payment is the closed statement
        # balance (what's due to the bank); otherwise fall back to total unpaid.
        if c.get("statement_day"):
            amt = float(statement_by_card.get(c["id"], calc.Decimal("0")))
        else:
            amt = float(full_debts.get(c["id"], calc.Decimal("0")))
        if c.get("due_day") and amt > 0:
            nd = next_due(int(c["due_day"]))
            upcoming_payments.append({
                "name": c["name"],
                "due_date": nd.isoformat(),
                "days_until": (nd - today).days,
                "amount": amt,
            })
    upcoming_payments.sort(key=lambda x: x["days_until"])

    return {
        "upcoming_payments": upcoming_payments,
        "total_credit_card_debt": float(total_debt),
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
        "debt_by_card": debt_by_card,
    }
