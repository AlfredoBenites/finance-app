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
    # An account holding investments is valued at the sum of its holdings
    # (shares x manual-or-last price), overriding its manual balance.
    holdings = owned("holdings", "account_id, shares, last_price, manual_price")
    holdings_value = {}
    for h in holdings:
        price = h.get("manual_price")
        price = price if price is not None else h.get("last_price")
        if price is not None:
            holdings_value[h["account_id"]] = holdings_value.get(h["account_id"], calc.Decimal("0")) + (
                calc._dec(h.get("shares")) * calc._dec(price)
            )
    accounts = [
        {**a, "balance": str(holdings_value[a["id"]])} if a["id"] in holdings_value else a
        for a in accounts
    ]
    profiles = owned("profiles", "id, name, is_primary")
    cards = owned("credit_cards", "id, name, due_day, statement_day, is_active")
    card_payments = owned("card_payments", "credit_card_id, amount, paid_on")
    income_rows = owned("income", "amount, income_date, category")

    # Year scopes the transaction/income-derived numbers; account balances are
    # always current (they aren't dated).
    if year is not None:
        prefix = f"{year}-"
        transactions = [t for t in transactions if str(t["transaction_date"]).startswith(prefix)]
        income_rows = [i for i in income_rows if str(i["income_date"]).startswith(prefix)]

    primary_id = next((p["id"] for p in profiles if p.get("is_primary")), None)
    # Net worth & real-available are always YOUR money: scope to your own profile
    # so other people's spending on your cards never counts against you.
    my_txns = (
        [t for t in transactions if t["profile_id"] == primary_id]
        if primary_id is not None else transactions
    )
    # The displayed total card debt can optionally be narrowed the same way via
    # the "only my debt" toggle (otherwise it's the full balance owed to banks).
    debt_txns = my_txns if only_primary else transactions

    if exclude_repayments:
        income_rows = [i for i in income_rows if (i.get("category") or "") != "Repayment"]
    total_income = sum((calc._dec(i["amount"]) for i in income_rows), calc.Decimal("0"))

    profile_names = {p["id"]: p["name"] for p in profiles}
    card_names = {c["id"]: c["name"] for c in cards}

    # "owed by profile" is the per-person reimbursement view (who owes YOU).
    owed = calc.owed_by_profile(transactions)
    # Card debt is what you owe the BANK (charges not yet paid to the issuer),
    # independent of reimbursement. The payoff bucket shows how much you've SAVED
    # toward it.
    debts = calc.bank_debt_by_card(debt_txns)
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
            card_pays = [p for p in card_payments if p.get("credit_card_id") == c["id"]]
            statement_by_card[c["id"]] = calc.statement_due(card_txns, card_pays, int(sd), today)

    # "Unallocated" = charges a person hasn't reimbursed yet (is_paid_back based).
    # That's the red figure on the dashboard's "Unallocated Balance by Card".
    # Every active card is listed (even at $0); the running balance owed to the
    # bank is reported separately (total_debt) and lives on Insights.
    unreimbursed = calc.debt_by_card(debt_txns)
    total_debt = sum(debts.values(), calc.Decimal("0"))
    debt_by_card = []
    for c in cards:
        if c.get("is_active") is False:
            continue
        cid = c["id"]
        unr = unreimbursed.get(cid, calc.Decimal("0"))
        stmt = statement_by_card.get(cid)
        debt_by_card.append({
            "credit_card_id": cid,
            "name": c["name"],
            "owed": float(debts.get(cid, calc.Decimal("0"))),
            "saved": float(savings.get(cid, calc.Decimal("0"))),
            "balance": float(unr),
            "statement": float(stmt) if stmt is not None else None,
        })
    debt_by_card.sort(key=lambda d: -d["balance"])

    # Upcoming payment reminders: the full balance owed to the bank, due on each
    # card's due day. (Uses all profiles' charges — you pay the bank the total.)
    full_debts = calc.bank_debt_by_card(all_transactions)

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
        # Cashback from only your own profile's charges, for the dashboard's
        # "my cashback only" option.
        "total_cashback_mine": float(
            sum((calc._dec(t.get("cashback_amount")) for t in my_txns), calc.Decimal("0"))
        ),
        "total_bucket_money": float(calc.total_bucket_money(buckets)),
        "liquid_cash": float(calc.liquid_cash(accounts)),
        "real_available_money": float(
            calc.real_available_money(accounts, my_txns, buckets)
        ),
        "total_assets": float(calc.total_assets(accounts)),
        "net_worth": float(calc.net_worth(accounts, my_txns, buckets)),
        "total_income": float(total_income),
        "owed_by_profile": [
            {"profile_id": pid, "name": profile_names.get(pid, "Unknown"), "amount": float(amt)}
            for pid, amt in owed.items()
        ],
        "debt_by_card": debt_by_card,
    }


@router.get("/breakdown")
def get_breakdown(user_id: str = Depends(get_current_user_id)):
    """Line-by-line breakdowns behind the dashboard's headline figures, so the
    explainer panels can show exactly how each number is reached. Read-only and
    always current-state (no year filter) — these mirror the dashboard's
    Real available money, Net worth, and Cashback.
    """
    def owned(table, columns="*"):
        return supabase.table(table).select(columns).eq("owner_id", user_id).execute().data

    transactions = owned("transactions")
    buckets = owned("buckets")
    accounts = owned("accounts")
    profiles = owned("profiles", "id, name, is_primary")
    cards = owned("credit_cards", "id, name")

    # Value investment accounts at the sum of their holdings (same override the
    # main dashboard applies), so totals match exactly.
    holdings = owned("holdings", "account_id, shares, last_price, manual_price")
    holdings_value = {}
    for h in holdings:
        price = h.get("manual_price")
        price = price if price is not None else h.get("last_price")
        if price is not None:
            holdings_value[h["account_id"]] = holdings_value.get(h["account_id"], calc.Decimal("0")) + (
                calc._dec(h.get("shares")) * calc._dec(price)
            )
    accounts = [
        {**a, "balance": str(holdings_value[a["id"]])} if a["id"] in holdings_value else a
        for a in accounts
    ]

    primary_id = next((p["id"] for p in profiles if p.get("is_primary")), None)
    my_txns = (
        [t for t in transactions if t["profile_id"] == primary_id]
        if primary_id is not None else transactions
    )
    profile_names = {p["id"]: p["name"] for p in profiles}
    card_names = {c["id"]: c["name"] for c in cards}

    # --- Real available money: liquid cash − my unallocated debt − all card
    # payoff buckets − set-aside non-card buckets ---
    liquid_accounts = [
        {"name": a.get("name"), "balance": float(calc._dec(a.get("balance")))}
        for a in accounts
        if a.get("is_active") and a.get("account_type") in calc.LIQUID_ACCOUNT_TYPES
    ]
    set_aside_buckets = [
        {"name": b.get("name"), "amount": float(calc._dec(b.get("current_amount")))}
        for b in buckets
        if b.get("is_active") and not b.get("credit_card_id") and b.get("kind") != "spendable"
    ]
    card_buckets = [
        {"name": b.get("name"), "amount": float(calc._dec(b.get("current_amount")))}
        for b in buckets
        if b.get("is_active") and b.get("credit_card_id")
    ]
    ra_liquid = calc.liquid_cash(accounts)
    ra_my_debt = calc.total_card_debt(my_txns)
    ra_card_buckets = calc.all_card_bucket_money(buckets)
    ra_set_aside = calc.non_card_bucket_money(buckets)
    real_available = {
        "liquid_cash": float(ra_liquid),
        "my_unallocated_debt": float(ra_my_debt),
        "card_buckets": float(ra_card_buckets),
        "set_aside_buckets": float(ra_set_aside),
        "total": float(ra_liquid - ra_my_debt - ra_card_buckets - ra_set_aside),
        "accounts": liquid_accounts,
        "card_bucket_list": card_buckets,
        "bucket_list": set_aside_buckets,
    }

    # --- Net worth: assets − card debt − other liabilities − not-mine buckets ---
    asset_accounts = [
        {"name": a.get("name"), "balance": float(calc._dec(a.get("balance")))}
        for a in accounts
        if a.get("is_active") and a.get("is_asset")
    ]
    nw_assets = calc.total_assets(accounts)
    nw_debt = calc.total_bank_debt(my_txns)
    nw_other = calc.other_liabilities(accounts)
    nw_not_mine = calc.not_mine_bucket_money(buckets)
    net_worth = {
        "total_assets": float(nw_assets),
        "card_debt": float(nw_debt),
        "other_liabilities": float(nw_other),
        "not_mine_buckets": float(nw_not_mine),
        "total": float(nw_assets - nw_debt - nw_other - nw_not_mine),
        "assets": asset_accounts,
    }

    # --- Cashback: all accrued, broken down by card (with each person's share)
    # and by person ---
    by_profile: dict = {}
    by_card: dict = {}
    by_card_profile: dict = {}  # card_id -> {profile_id -> amount}
    cashback_total = calc.Decimal("0")
    for t in transactions:
        amt = calc._dec(t.get("cashback_amount"))
        if amt == 0:
            continue
        cashback_total += amt
        pid = t.get("profile_id")
        by_profile[pid] = by_profile.get(pid, calc.Decimal("0")) + amt
        cid = t.get("credit_card_id")
        if cid:
            by_card[cid] = by_card.get(cid, calc.Decimal("0")) + amt
            slot = by_card_profile.setdefault(cid, {})
            slot[pid] = slot.get(pid, calc.Decimal("0")) + amt

    def people_for(cid):
        return sorted(
            [{"name": profile_names.get(pid, "Unknown"), "amount": float(v)} for pid, v in by_card_profile.get(cid, {}).items()],
            key=lambda d: -d["amount"],
        )

    cashback = {
        "total": float(cashback_total),
        "by_card": sorted(
            [
                {"name": card_names.get(cid, "Unknown"), "amount": float(v), "profiles": people_for(cid)}
                for cid, v in by_card.items()
            ],
            key=lambda d: -d["amount"],
        ),
        "by_profile": sorted(
            [{"name": profile_names.get(pid, "Unknown"), "amount": float(v)} for pid, v in by_profile.items()],
            key=lambda d: -d["amount"],
        ),
    }

    return {"real_available": real_available, "net_worth": net_worth, "cashback": cashback}
