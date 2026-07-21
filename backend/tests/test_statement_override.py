"""Tests for the manual statement-balance override (escape hatch)."""


def _card_statement(dash, card_id):
    row = next(d for d in dash["debt_by_card"] if d["credit_card_id"] == card_id)
    return row["statement"]


def test_override_sets_the_statement_due(api):
    api.login("user-a", "a@example.com")
    cid = api.client.post("/api/credit-cards", json={"name": "RH Gold", "statement_day": 15}).json()["id"]

    r = api.client.post(f"/api/credit-cards/{cid}/statement-override", json={"amount": 3846.63})
    assert r.status_code == 200, r.text
    assert float(r.json()["statement_override"]) == 3846.63

    dash = api.client.get("/api/dashboard").json()
    assert _card_statement(dash, cid) == 3846.63


def test_clearing_override_reverts_to_inferred(api):
    api.login("user-a", "a@example.com")
    cid = api.client.post("/api/credit-cards", json={"name": "RH Gold", "statement_day": 15}).json()["id"]
    api.client.post(f"/api/credit-cards/{cid}/statement-override", json={"amount": 3846.63})

    r = api.client.post(f"/api/credit-cards/{cid}/statement-override", json={"amount": None})
    assert r.status_code == 200, r.text
    assert r.json()["statement_override"] is None

    dash = api.client.get("/api/dashboard").json()
    assert _card_statement(dash, cid) == 0.0


def test_override_requires_a_statement_day(api):
    api.login("user-a", "a@example.com")
    cid = api.client.post("/api/credit-cards", json={"name": "No Day"}).json()["id"]
    r = api.client.post(f"/api/credit-cards/{cid}/statement-override", json={"amount": 100})
    assert r.status_code == 400
    assert "statement day" in r.json()["detail"].lower()
