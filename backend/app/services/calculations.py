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
    """Map credit_card_id -> amount NOT yet reimbursed by a person (per-profile
    'owed to you'). Uses is_paid_back. For what you owe the bank, see
    bank_debt_by_card."""
    totals: dict[str, Decimal] = {}
    for t in unpaid(transactions):
        cid = t.get("credit_card_id")
        if not cid:
            continue  # account purchase, not card debt
        totals[cid] = totals.get(cid, Decimal("0")) - _dec(t["amount"])
    return totals


def not_paid_to_bank(transactions: list[dict]) -> list[dict]:
    return [t for t in transactions if not t.get("paid_to_bank")]


def total_bank_debt(transactions: list[dict]) -> Decimal:
    """What you owe the card issuer(s): negated sum of charges not yet paid to
    the bank. Independent of whether a person has reimbursed you."""
    return -sum(
        (_dec(t["amount"]) for t in not_paid_to_bank(transactions) if t.get("credit_card_id")),
        Decimal("0"),
    )


def bank_debt_by_card(transactions: list[dict]) -> dict[str, Decimal]:
    """Map credit_card_id -> balance owed to the bank (charges not paid_to_bank)."""
    totals: dict[str, Decimal] = {}
    for t in not_paid_to_bank(transactions):
        cid = t.get("credit_card_id")
        if not cid:
            continue
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


def statement_due(
    transactions: list[dict],
    payments: list[dict],
    statement_day: int,
    today: date,
    override_amount=None,
    override_close=None,
) -> Decimal:
    """What's still owed on the current statement: charges in the most-recently
    closed cycle minus payments credited after it closed, clamped at zero.

    So it drops to $0 once the statement is paid (never negative), and rolls to
    the next cycle's charges automatically when that cycle closes. `transactions`
    and `payments` should already be one card's rows.

    If `override_amount` is set AND `override_close` matches this cycle's close
    date, that manual amount is used instead of the inferred charges (the issuer
    bills by posting date, so the inferred figure can drift near the boundary).
    The override auto-expires once a later cycle closes."""
    _open, close = statement_window(statement_day, today)
    if override_amount is not None and str(override_close or "") == close.isoformat():
        charges = _dec(override_amount)
    else:
        charges = statement_balance(transactions, statement_day, today)
    paid_after = sum(
        (_dec(p.get("amount")) for p in payments if str(p.get("paid_on") or "") > close.isoformat()),
        Decimal("0"),
    )
    due = charges - paid_after
    return due if due > Decimal("0") else Decimal("0")


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


def earmarked_bucket_money(buckets: list[dict]) -> Decimal:
    """Active buckets that aren't 'spendable' — money set aside and therefore not
    freely available. INCLUDES card payoff buckets (money earmarked to pay a card).
    """
    return sum(
        (
            _dec(b["current_amount"])
            for b in buckets
            if b.get("is_active") and b.get("kind") != "spendable"
        ),
        Decimal("0"),
    )


def unsettled_card_charges(transactions: list[dict]) -> Decimal:
    """Card charges not yet paid to the bank AND not yet set aside in a payoff
    bucket (reimbursement_allocated). You still need free cash for these; charges
    you've already set aside for are covered by their (subtracted) payoff bucket.
    """
    return -sum(
        (
            _dec(t["amount"])
            for t in transactions
            if t.get("credit_card_id")
            and not t.get("paid_to_bank")
            and not t.get("reimbursement_allocated")
        ),
        Decimal("0"),
    )


def not_mine_bucket_money(buckets: list[dict]) -> Decimal:
    """Active buckets holding someone else's money (kind='not_mine'). This cash
    sits in your accounts but isn't yours, so it's subtracted from net worth."""
    return sum(
        (
            _dec(b["current_amount"])
            for b in buckets
            if b.get("is_active") and b.get("kind") == "not_mine"
        ),
        Decimal("0"),
    )


def all_card_bucket_money(buckets: list[dict]) -> Decimal:
    """Total in active credit-card payoff buckets: money already set aside to pay
    cards. This may include reimbursements other people gave you that now sit in
    your account, so it isn't free for you to spend."""
    return sum(
        (
            _dec(b["current_amount"])
            for b in buckets
            if b.get("is_active") and b.get("credit_card_id")
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
    """Freely-spendable cash = liquid cash − money set aside in buckets (incl.
    card payoff buckets) − card charges not yet set aside for.

    Card debt isn't subtracted directly: the payoff buckets (already saved toward
    cards) plus the unsettled charges (not yet saved for) together cover what you
    owe, without double-counting the money sitting in payoff buckets.
    """
    return (
        liquid_cash(accounts)
        - earmarked_bucket_money(buckets)
        - unsettled_card_charges(transactions)
    )


def net_worth(accounts: list[dict], transactions: list[dict], buckets: list[dict] = ()) -> Decimal:
    """Assets minus liabilities. Buckets you own do NOT reduce net worth (they're
    money already inside your accounts) — but 'not_mine' buckets (cash you hold
    for someone else) are subtracted, since that money isn't yours.

    Card debt here is what you owe the bank (paid_to_bank), not reimbursement
    status, and `transactions` should be scoped to your own profile so other
    people's spending on your cards doesn't count against you."""
    liabilities = total_bank_debt(transactions) + other_liabilities(accounts)
    return total_assets(accounts) - liabilities - not_mine_bucket_money(buckets)
