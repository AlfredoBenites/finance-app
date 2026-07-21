"""Tests for the statement 'reconcile charges' flow (posting-date fix)."""
from datetime import date

from app.services import calculations as calc


def _setup(api):
    api.login("user-a", "a@example.com")
    pid = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    cid = api.client.post("/api/credit-cards", json={"name": "RH Gold", "statement_day": 15}).json()["id"]
    return pid, cid


def _charge(api, pid, cid, on, amount):
    return api.client.post(
        "/api/transactions",
        json={"transaction_date": on, "amount": amount, "profile_id": pid, "credit_card_id": cid},
    ).json()


def test_reconcile_pushes_a_boundary_charge_to_next_cycle(api):
    pid, cid = _setup(api)
    close = calc.statement_window(15, date.today())[1]
    t = _charge(api, pid, cid, close.isoformat(), -50)  # dated on the close day → this statement

    r = api.client.get(f"/api/credit-cards/{cid}/reconcile").json()
    assert r["estimate"] == 50.0
    ch = next(c for c in r["charges"] if c["id"] == t["id"])
    assert ch["in_statement"] is True and ch["statement_amount"] == 50.0

    # Push it to next cycle.
    resp = api.client.post(
        f"/api/credit-cards/{cid}/reconcile",
        json={"moves": [{"transaction_id": t["id"], "in_statement": False}]},
    )
    assert resp.status_code == 200 and resp.json()["updated"] == 1

    # Now it's off this statement; the transaction_date is untouched.
    r2 = api.client.get(f"/api/credit-cards/{cid}/reconcile").json()
    assert r2["estimate"] == 0.0
    ch2 = next(c for c in r2["charges"] if c["id"] == t["id"])
    assert ch2["in_statement"] is False
    assert ch2["transaction_date"] == close.isoformat()  # real date unchanged


def test_reconcile_requires_a_statement_day(api):
    api.login("user-a", "a@example.com")
    cid = api.client.post("/api/credit-cards", json={"name": "No Day"}).json()["id"]
    assert api.client.get(f"/api/credit-cards/{cid}/reconcile").status_code == 400
