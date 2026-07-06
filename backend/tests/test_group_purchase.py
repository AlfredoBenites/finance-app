"""Group purchase split math + endpoints."""
from decimal import Decimal

from app.services.group_split import compute_shares

USER_A = ("user-a", "a@example.com")


def _owed(shares):
    return {s["profile_id"]: s["owed"] for s in shares}


def test_itemized_split_tax_per_order_fees_even():
    shares = compute_shares(
        mode="itemized", tax_rate="0.10", tip="6", delivery_fee="0", service_fee="0",
        participants=[{"profile_id": "a", "subtotal": "20"}, {"profile_id": "b", "subtotal": "10"}],
        payer_profile_id="a",
    )
    owed = _owed(shares)
    # A: 20 + 2 tax + 3 tip; B: 10 + 1 tax + 3 tip; sum = grand (33 + 6 = 39).
    assert owed["a"] == Decimal("25.00")
    assert owed["b"] == Decimal("14.00")
    assert sum(owed.values()) == Decimal("39.00")


def test_even_split_divides_whole_bill_equally():
    shares = compute_shares(
        mode="even", tax_rate="0.10", tip="6", delivery_fee="0", service_fee="0",
        participants=[{"profile_id": "a"}, {"profile_id": "b"}], subtotal="30", payer_profile_id="a",
    )
    owed = _owed(shares)
    assert owed["a"] == Decimal("19.50") and owed["b"] == Decimal("19.50")


def test_rounding_remainder_goes_to_payer():
    # tip 10 across 3 people = 3.333.. each; shares must still sum to the grand total.
    shares = compute_shares(
        mode="itemized", tax_rate="0", tip="10", delivery_fee="0", service_fee="0",
        participants=[{"profile_id": "a", "subtotal": "10"}, {"profile_id": "b", "subtotal": "10"}, {"profile_id": "c", "subtotal": "10"}],
        payer_profile_id="a",
    )
    owed = _owed(shares)
    assert sum(owed.values()) == Decimal("40.00")  # 30 items + 10 tip
    assert owed["a"] == Decimal("13.34")  # payer absorbs the leftover cent
    assert owed["b"] == Decimal("13.33") and owed["c"] == Decimal("13.33")


def test_create_group_splits_into_per_profile_charges(api):
    api.login(*USER_A)
    me = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    api.client.post(f"/api/profiles/{me}/make-primary")
    mom = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    card = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]

    resp = api.client.post("/api/transaction-groups", json={
        "mode": "itemized", "card_id": card, "transaction_date": "2026-06-01",
        "merchant": "Dinner", "tax_rate": 0.10, "tip": 6, "payer_profile_id": me,
        "participants": [{"profile_id": me, "subtotal": 20}, {"profile_id": mom, "subtotal": 10}],
    })
    assert resp.status_code == 201
    txns = resp.json()["transactions"]
    by_profile = {t["profile_id"]: float(t["amount"]) for t in txns}
    assert by_profile[me] == -25.0  # your own share
    assert by_profile[mom] == -14.0  # Mom's share (a purchase, negative)
    # Every line is tagged with the group and Mom now owes her share.
    assert all(t["group_id"] for t in txns)
    assert api.client.get(f"/api/profiles/{mom}/summary").json()["total_unpaid"] == 14.0


def test_edit_group_preserves_reimbursed_lines_and_deletes_removed(api):
    api.login(*USER_A)
    me = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    api.client.post(f"/api/profiles/{me}/make-primary")
    mom = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    dad = api.client.post("/api/profiles", json={"name": "Dad"}).json()["id"]
    card = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]

    gid = api.client.post("/api/transaction-groups", json={
        "mode": "itemized", "card_id": card, "transaction_date": "2026-06-01", "tax_rate": 0, "tip": 0,
        "participants": [{"profile_id": mom, "subtotal": 10}, {"profile_id": dad, "subtotal": 10}],
    }).json()["group"]["id"]
    # Mom reimburses her line.
    mom_txn = next(t for t in api.client.get("/api/transactions").json() if t["profile_id"] == mom)
    api.client.put(f"/api/transactions/{mom_txn['id']}", json={"is_paid_back": True})

    # Edit: bump Mom's order and drop Dad.
    api.client.put(f"/api/transaction-groups/{gid}", json={
        "mode": "itemized", "card_id": card, "transaction_date": "2026-06-01", "tax_rate": 0, "tip": 0,
        "participants": [{"profile_id": mom, "subtotal": 15}],
    })
    txns = [t for t in api.client.get("/api/transactions").json() if t.get("group_id") == gid]
    assert len(txns) == 1  # Dad's line was removed
    mom_line = txns[0]
    assert mom_line["profile_id"] == mom
    assert float(mom_line["amount"]) == -15.0  # re-split to the new amount
    assert mom_line["is_paid_back"] is True  # ...but her reimbursed state was kept


def test_delete_group_removes_its_lines(api):
    api.login(*USER_A)
    me = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    api.client.post(f"/api/profiles/{me}/make-primary")
    mom = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    card = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]
    gid = api.client.post("/api/transaction-groups", json={
        "mode": "even", "card_id": card, "transaction_date": "2026-06-01", "subtotal": 20,
        "participants": [{"profile_id": me}, {"profile_id": mom}],
    }).json()["group"]["id"]
    assert api.client.delete(f"/api/transaction-groups/{gid}").status_code == 204
    assert [t for t in api.client.get("/api/transactions").json() if t.get("group_id") == gid] == []
