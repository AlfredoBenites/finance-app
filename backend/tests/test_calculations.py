"""Unit tests for the dashboard calculations (SPEC.md section 9).

These cover the pure functions in app.services.calculations — no database or
network needed. Sign convention: purchases are negative, refunds positive.
"""
from decimal import Decimal

from app.services import calculations as calc


# --- small helpers to build sample rows -------------------------------------

def txn(amount, paid=False, profile="p1", card="c1", cashback=None):
    return {
        "amount": amount,
        "is_paid_back": paid,
        "profile_id": profile,
        "credit_card_id": card,
        "cashback_amount": cashback,
    }


def acct(balance, account_type="checking", is_asset=True, active=True):
    return {
        "balance": balance,
        "account_type": account_type,
        "is_asset": is_asset,
        "is_active": active,
    }


def bucket(current, active=True):
    return {"current_amount": current, "is_active": active}


# --- _dec --------------------------------------------------------------------

def test_dec_handles_none_string_and_number():
    assert calc._dec(None) == Decimal("0")
    assert calc._dec("52.40") == Decimal("52.40")
    assert calc._dec(40) == Decimal("40")


# --- card debt / owed --------------------------------------------------------

def test_total_card_debt_negates_unpaid_and_ignores_paid():
    txns = [txn(-400), txn(-100, paid=True), txn(-50)]
    # only the two unpaid purchases count: -(-400 + -50) = 450
    assert calc.total_card_debt(txns) == Decimal("450")


def test_debt_by_card_groups_by_card():
    txns = [txn(-400, card="c1"), txn(-50, card="c1"), txn(-30, card="c2")]
    assert calc.debt_by_card(txns) == {"c1": Decimal("450"), "c2": Decimal("30")}


def test_card_debt_ignores_account_purchases():
    # An account (bank/cash) purchase has no credit_card_id and is not card debt.
    account_txn = {
        "amount": -50, "is_paid_back": False, "profile_id": "p1",
        "credit_card_id": None, "account_id": "a1", "cashback_amount": None,
    }
    txns = [txn(-400, card="c1"), account_txn]
    assert calc.total_card_debt(txns) == Decimal("400")
    assert calc.debt_by_card(txns) == {"c1": Decimal("400")}


def test_owed_by_profile_groups_by_profile():
    txns = [txn(-400, profile="mom"), txn(-100, profile="me", paid=True), txn(-25, profile="mom")]
    # paid one excluded; mom owes 425, me owes 0 (not present)
    assert calc.owed_by_profile(txns) == {"mom": Decimal("425")}


# --- cashback ----------------------------------------------------------------

def test_cashback_earned_counts_only_paid():
    txns = [txn(-100, paid=True, cashback="3.00"), txn(-50, cashback="1.50")]
    assert calc.cashback_earned(txns) == Decimal("3.00")


def test_cashback_pending_counts_only_unpaid():
    txns = [txn(-100, paid=True, cashback="3.00"), txn(-50, cashback="1.50")]
    assert calc.cashback_pending(txns) == Decimal("1.50")


def test_cashback_treats_missing_amount_as_zero():
    txns = [txn(-50, cashback=None)]
    assert calc.cashback_pending(txns) == Decimal("0")


# --- buckets / accounts ------------------------------------------------------

def test_total_bucket_money_active_only():
    buckets = [bucket("300"), bucket("200", active=False), bucket("50")]
    assert calc.total_bucket_money(buckets) == Decimal("350")


def test_liquid_cash_only_liquid_types_and_active():
    accounts = [
        acct("1500", "checking"),
        acct("500", "savings"),
        acct("35000", "roth_ira"),       # not liquid
        acct("100", "cash", active=False),  # inactive
    ]
    assert calc.liquid_cash(accounts) == Decimal("2000")


def test_total_assets_active_assets_only():
    accounts = [acct("1500"), acct("35000", "roth_ira"), acct("200", is_asset=False)]
    assert calc.total_assets(accounts) == Decimal("36500")


def test_other_liabilities_active_non_assets():
    accounts = [acct("200", is_asset=False), acct("1500")]
    assert calc.other_liabilities(accounts) == Decimal("200")


# --- composite calculations --------------------------------------------------

def test_real_available_money():
    accounts = [acct("1500", "checking")]
    txns = [txn(-400)]
    buckets = [bucket("300")]
    assert calc.real_available_money(accounts, txns, buckets) == Decimal("800")


def test_net_worth_excludes_buckets_but_includes_liabilities():
    accounts = [acct("1500"), acct("200", is_asset=False)]
    txns = [txn(-400)]
    # 1500 assets - (400 card debt + 200 other liability) = 900
    assert calc.net_worth(accounts, txns) == Decimal("900")


def test_spec_9_7_worked_example():
    # SPEC 9.7: checking 1500, card debt 400, buckets 300 -> real available 800
    accounts = [acct("1500", "checking")]
    txns = [txn(-400)]
    buckets = [bucket("300")]
    assert calc.real_available_money(accounts, txns, buckets) == Decimal("800")
    # net worth ignores buckets: 1500 - 400 = 1100
    assert calc.net_worth(accounts, txns) == Decimal("1100")


# --- compute_cashback --------------------------------------------------------

def test_compute_cashback_positive_for_a_purchase():
    # purchase of 100 at 3% -> 3.00 cashback (positive)
    assert calc.compute_cashback(Decimal("-100"), Decimal("0.03")) == Decimal("3.00")


def test_compute_cashback_none_when_no_rate():
    assert calc.compute_cashback(Decimal("-100"), None) is None


def test_compute_cashback_refund_claws_back():
    # a positive refund produces negative cashback
    assert calc.compute_cashback(Decimal("10"), Decimal("0.03")) == Decimal("-0.30")


def test_compute_cashback_rounds_to_cents():
    # 52.40 * 0.015 = 0.786 -> rounds to 0.79
    assert calc.compute_cashback(Decimal("-52.40"), Decimal("0.015")) == Decimal("0.79")
