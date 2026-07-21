"""Statement due-date / past-due logic and how an unpaid statement rolls over."""
from datetime import date
from decimal import Decimal

from app.services import calculations as calc


def test_statement_due_date_is_the_first_due_day_after_close():
    # AMEX Blue Cash: closes 22nd, due 17th -> due is the NEXT month's 17th.
    assert calc.statement_due_date(date(2026, 6, 22), 17) == date(2026, 7, 17)
    # Robinhood: closes 29th, due 22nd -> next month's 22nd (matches the real bill).
    assert calc.statement_due_date(date(2026, 6, 29), 22) == date(2026, 7, 22)
    # due_day after the statement day -> same month.
    assert calc.statement_due_date(date(2026, 6, 10), 25) == date(2026, 6, 25)
    # Year wrap: closes Dec 29, due 22 -> next Jan 22.
    assert calc.statement_due_date(date(2026, 12, 29), 22) == date(2027, 1, 22)


def test_past_due_yields_a_negative_countdown():
    # A statement that closed June 22 is due July 17; "today" of July 20 is 3 days late.
    due = calc.statement_due_date(date(2026, 6, 22), 17)
    assert (due - date(2026, 7, 20)).days == -3  # negative == past due (was wrongly +28)


def test_unpaid_statement_replaces_next_cycle_not_adds_to_it():
    # statement_day = 22. A June-cycle charge (unpaid) and a July-cycle charge.
    txns = [
        {"id": "t1", "credit_card_id": "c", "transaction_date": "2026-06-10", "amount": "-100"},
        {"id": "t2", "credit_card_id": "c", "transaction_date": "2026-07-10", "amount": "-50"},
    ]
    # June statement (a "today" in the June cycle) = the June charge only.
    assert calc.statement_balance(txns, 22, date(2026, 6, 25)) == Decimal("100")
    # July statement = the July charge ONLY — the unpaid June charge does NOT roll in
    # (statement_balance assumes prior statements were paid; it replaces, not accrues).
    assert calc.statement_balance(txns, 22, date(2026, 7, 25)) == Decimal("50")
    # But the total owed to the bank still counts BOTH unpaid charges, so nothing is lost.
    assert calc.bank_debt_by_card(txns)["c"] == Decimal("150")
