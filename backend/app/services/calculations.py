"""Pure calculation functions for the dashboard (SPEC.md section 9).

These take plain lists of dict rows (as returned by Supabase) and return Decimals.
Keeping them pure (no DB access) makes them easy to read and test.

Sign convention reminder: purchases are stored negative, refunds positive.
So "debt" and "amount owed" are the NEGATED sum of unpaid transaction amounts.
"""
import calendar
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

# Account types that count as spendable cash for "real available money".
LIQUID_ACCOUNT_TYPES = {"checking", "savings", "cash"}


def _dec(value) -> Decimal:
    """Coerce a possibly-None / string / number DB value to Decimal."""
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def compute_cashback(amount: Decimal, rate: Optional[Decimal]) -> Optional[Decimal]:
    """Cashback earned on a transaction (SPEC.md 9.3).

    Purchases are stored negative, so we negate to make cashback on spending
    positive (and a positive refund correctly produces negative/clawed-back
    cashback). Returns None when there is no rate.
    """
    if rate is None:
        return None
    return (-amount * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def unpaid(transactions: list[dict]) -> list[dict]:
    return [t for t in transactions if not t.get("is_paid_back")]


def paid(transactions: list[dict]) -> list[dict]:
    return [t for t in transactions if t.get("is_paid_back")]


def total_card_debt(transactions: list[dict]) -> Decimal:
    """Total owed across all cards = negated sum of unpaid amounts (SPEC 9.1).

    Only counts card transactions; account (bank/cash) purchases are not card debt.
    """
    return -sum(
        (_dec(t["amount"]) for t in unpaid(transactions) if t.get("credit_card_id")),
        Decimal("0"),
    )


def debt_by_card(transactions: list[dict]) -> dict[str, Decimal]:
    """Map credit_card_id -> outstanding balance (SPEC 9.1)."""
    totals: dict[str, Decimal] = {}
    for t in unpaid(transactions):
        cid = t.get("credit_card_id")
        if not cid:
            continue  # account purchase, not card debt
        totals[cid] = totals.get(cid, Decimal("0")) - _dec(t["amount"])
    return totals


def statement_window(statement_day: int, today: date) -> tuple:
    """The (open, close] dates of the most-recently-closed billing cycle.

    close = the most recent statement_day on or before today; open = the
    statement_day one month earlier. Days past a month's length clamp to its
    last day (e.g. a 31 statement_day closes on Feb 28)."""
    def on(y: int, m: int) -> date:
        return date(y, m, min(statement_day, calendar.monthrange(y, m)[1]))

    close = on(today.year, today.month)
    if close > today:  # this month's close hasn't happened yet
        y, m = (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
        close = on(y, m)
    y, m = (close.year - 1, 12) if close.month == 1 else (close.year, close.month - 1)
    return on(y, m), close


def statement_balance(transactions: list[dict], statement_day: int, today: date) -> Decimal:
    """What's on the current statement: charges in the most-recently-closed
    billing cycle (refunds in the window reduce it). Assumes prior statements
    were paid in full. `transactions` should already be one card's rows."""
    open_, close = statement_window(statement_day, today)
    total = Decimal("0")
    for t in transactions:
        if not t.get("credit_card_id"):
            continue
        d = date.fromisoformat(str(t["transaction_date"]))
        if open_ < d <= close:
            total += -_dec(t["amount"])
    return total


def owed_by_profile(transactions: list[dict]) -> dict[str, Decimal]:
    """Map profile_id -> amount that profile still owes (SPEC 9.2)."""
    totals: dict[str, Decimal] = {}
    for t in unpaid(transactions):
        pid = t["profile_id"]
        totals[pid] = totals.get(pid, Decimal("0")) - _dec(t["amount"])
    return totals


def cashback_earned(transactions: list[dict]) -> Decimal:
    """Cashback from settled (paid-back) transactions (SPEC 9.4)."""
    return sum((_dec(t.get("cashback_amount")) for t in paid(transactions)), Decimal("0"))


def cashback_pending(transactions: list[dict]) -> Decimal:
    """Cashback from not-yet-settled transactions (SPEC 9.5)."""
    return sum((_dec(t.get("cashback_amount")) for t in unpaid(transactions)), Decimal("0"))


def total_bucket_money(buckets: list[dict]) -> Decimal:
    """Sum of current_amount across active buckets (SPEC 9.6)."""
    return sum(
        (_dec(b["current_amount"]) for b in buckets if b.get("is_active")),
        Decimal("0"),
    )


def non_card_bucket_money(buckets: list[dict]) -> Decimal:
    """Active buckets NOT tied to a credit card.

    Card payoff buckets are earmarked for card debt (which is already subtracted
    from available money), so they don't reduce available money a second time.
    """
    return sum(
        (
            _dec(b["current_amount"])
            for b in buckets
            if b.get("is_active") and not b.get("credit_card_id")
        ),
        Decimal("0"),
    )


def card_bucket_savings(buckets: list[dict]) -> dict[str, Decimal]:
    """Map credit_card_id -> money saved in that card's payoff bucket(s)."""
    totals: dict[str, Decimal] = {}
    for b in buckets:
        cid = b.get("credit_card_id")
        if not cid or not b.get("is_active"):
            continue
        totals[cid] = totals.get(cid, Decimal("0")) + _dec(b["current_amount"])
    return totals


def liquid_cash(accounts: list[dict]) -> Decimal:
    """Spendable cash: active checking/savings/cash account balances."""
    return sum(
        (
            _dec(a["balance"])
            for a in accounts
            if a.get("is_active") and a.get("account_type") in LIQUID_ACCOUNT_TYPES
        ),
        Decimal("0"),
    )


def total_assets(accounts: list[dict]) -> Decimal:
    """All active asset account balances (SPEC 9.8)."""
    return sum(
        (_dec(a["balance"]) for a in accounts if a.get("is_active") and a.get("is_asset")),
        Decimal("0"),
    )


def other_liabilities(accounts: list[dict]) -> Decimal:
    """Active non-asset account balances (debts other than card debt)."""
    return sum(
        (
            _dec(a["balance"])
            for a in accounts
            if a.get("is_active") and not a.get("is_asset")
        ),
        Decimal("0"),
    )


def real_available_money(
    accounts: list[dict], transactions: list[dict], buckets: list[dict]
) -> Decimal:
    """Liquid cash minus card debt minus non-card bucket money (SPEC 9.7).

    Card payoff buckets are excluded here: they fund the card debt that's already
    subtracted, so counting them again would double-count.
    """
    return (
        liquid_cash(accounts)
        - total_card_debt(transactions)
        - non_card_bucket_money(buckets)
    )


def net_worth(accounts: list[dict], transactions: list[dict]) -> Decimal:
    """Assets minus liabilities. Buckets do NOT reduce net worth (SPEC 9.8)."""
    liabilities = total_card_debt(transactions) + other_liabilities(accounts)
    return total_assets(accounts) - liabilities
