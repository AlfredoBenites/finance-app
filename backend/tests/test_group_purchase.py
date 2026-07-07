"""Group purchase split math + endpoints."""
from decimal import Decimal

from app.services.group_split import compute_shares

USER_A = ("user-a", "a@example.com")


def _owed(shares):
    return {s["profile_id"]: s["owed"] for s in shares}


def test_itemized_splits_all_shared_costs_proportionally():
    shares = compute_shares(
        mode="itemized", tax="3", tip="6", delivery_fee="0", service_fee="0", discount="0",
        participants=[{"profile_id": "a", "subtotal": "20"}, {"profile_id": "b", "subtotal": "10"}],
        payer_profile_id="a",
    )
    owed = _owed(shares)
    # shared pool = 9, split by order (2:1): A 20 + 6, B 10 + 3; sum = grand (39).
    assert owed["a"] == Decimal("26.00")
    assert owed["b"] == Decimal("13.00")


def test_even_split_divides_the_total_equally_ignoring_costs():
    # Even mode splits the whole total; the cost breakdown is ignored.
    shares = compute_shares(
        mode="even", tax="3", tip="6", delivery_fee="0", service_fee="0", discount="0",
        participants=[{"profile_id": "a"}, {"profile_id": "b"}], subtotal="40", payer_profile_id="a",
    )
    owed = _owed(shares)
    assert owed["a"] == Decimal("20.00") and owed["b"] == Decimal("20.00")


def test_rounding_remainder_goes_to_payer():
    shares = compute_shares(
        mode="itemized", tax="0", tip="10", delivery_fee="0", service_fee="0", discount="0",
        participants=[{"profile_id": "a", "subtotal": "10"}, {"profile_id": "b", "subtotal": "10"}, {"profile_id": "c", "subtotal": "10"}],
        payer_profile_id="a",
    )
    owed = _owed(shares)
    assert sum(owed.values()) == Decimal("40.00")  # 30 items + 10 tip
    assert owed["a"] == Decimal("13.34")  # payer absorbs the leftover cent
    assert owed["b"] == Decimal("13.33") and owed["c"] == Decimal("13.33")


def test_charged_to_aggregates_and_matches_doordash_receipt():
    # Real DoorDash order: me/Blanki/Vale/Bubu; I'm covering Bubu (charged to me).
    shares = compute_shares(
        mode="itemized", tax="3.60", tip="5.25", delivery_fee="0", service_fee="2.69", discount="5",
        participants=[
            {"profile_id": "me", "subtotal": "12.39", "charged_to": "me"},
            {"profile_id": "blanki", "subtotal": "12.99", "charged_to": "blanki"},
            {"profile_id": "vale", "subtotal": "16.58", "charged_to": "vale"},
            {"profile_id": "bubu", "subtotal": "11.79", "charged_to": "me"},
        ],
        payer_profile_id="me",
    )
    owed = _owed(shares)
    # All shared costs split by order; my share + Bubu's fold onto me.
    assert owed["me"] == Decimal("27.12")
    assert owed["blanki"] == Decimal("14.57")
    assert owed["vale"] == Decimal("18.60")
    assert "bubu" not in owed  # Bubu's share was charged to me
    assert sum(owed.values()) == Decimal("60.29")  # matches the receipt total


def test_create_group_splits_into_per_profile_charges(api):
    api.login(*USER_A)
    me = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    api.client.post(f"/api/profiles/{me}/make-primary")
    mom = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    card = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]

    resp = api.client.post("/api/transaction-groups", json={
        "mode": "itemized", "card_id": card, "transaction_date": "2026-06-01",
        "merchant": "Dinner", "tax": 3, "tip": 6, "payer_profile_id": me,
        "participants": [{"profile_id": me, "subtotal": 20}, {"profile_id": mom, "subtotal": 10}],
    })
    assert resp.status_code == 201
    by_profile = {t["profile_id"]: float(t["amount"]) for t in resp.json()["transactions"]}
    assert by_profile[me] == -26.0
    assert by_profile[mom] == -13.0
    assert api.client.get(f"/api/profiles/{mom}/summary").json()["total_unpaid"] == 13.0


def test_create_group_charged_to_pays_for_someone(api):
    api.login(*USER_A)
    me = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    api.client.post(f"/api/profiles/{me}/make-primary")
    bubu = api.client.post("/api/profiles", json={"name": "Bubu"}).json()["id"]
    card = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]

    resp = api.client.post("/api/transaction-groups", json={
        "mode": "itemized", "card_id": card, "transaction_date": "2026-06-01",
        "tax": 0, "tip": 0, "payer_profile_id": me,
        "participants": [
            {"profile_id": me, "subtotal": 10, "charged_to": me},
            {"profile_id": bubu, "subtotal": 10, "charged_to": me},  # I pay for Bubu
        ],
    })
    txns = resp.json()["transactions"]
    assert len(txns) == 1  # both shares fold into one charge on me
    assert txns[0]["profile_id"] == me and float(txns[0]["amount"]) == -20.0
    # Bubu owes nothing.
    assert api.client.get(f"/api/profiles/{bubu}/summary").json()["total_unpaid"] == 0.0


def test_group_can_be_paid_from_an_account(api):
    api.login(*USER_A)
    me = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    api.client.post(f"/api/profiles/{me}/make-primary")
    mom = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    acct = api.client.post("/api/accounts", json={"name": "Cash", "balance": 100}).json()["id"]
    resp = api.client.post("/api/transaction-groups", json={
        "mode": "itemized", "account_id": acct, "transaction_date": "2026-06-01", "tax": 0, "tip": 0, "notes": "lunch",
        "participants": [{"profile_id": me, "subtotal": 10}, {"profile_id": mom, "subtotal": 10}],
    })
    assert resp.status_code == 201
    for t in resp.json()["transactions"]:
        assert t["account_id"] == acct and t["credit_card_id"] is None
        assert t["notes"] == "lunch"


def test_group_requires_exactly_one_payment_source(api):
    api.login(*USER_A)
    me = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    resp = api.client.post("/api/transaction-groups", json={
        "mode": "itemized", "transaction_date": "2026-06-01",
        "participants": [{"profile_id": me, "subtotal": 10}],
    })
    assert resp.status_code == 400


def test_edit_group_preserves_reimbursed_lines_and_deletes_removed(api):
    api.login(*USER_A)
    me = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    api.client.post(f"/api/profiles/{me}/make-primary")
    mom = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    dad = api.client.post("/api/profiles", json={"name": "Dad"}).json()["id"]
    card = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]

    gid = api.client.post("/api/transaction-groups", json={
        "mode": "itemized", "card_id": card, "transaction_date": "2026-06-01", "tax": 0, "tip": 0,
        "participants": [{"profile_id": mom, "subtotal": 10}, {"profile_id": dad, "subtotal": 10}],
    }).json()["group"]["id"]
    mom_txn = next(t for t in api.client.get("/api/transactions").json() if t["profile_id"] == mom)
    api.client.put(f"/api/transactions/{mom_txn['id']}", json={"is_paid_back": True})

    api.client.put(f"/api/transaction-groups/{gid}", json={
        "mode": "itemized", "card_id": card, "transaction_date": "2026-06-01", "tax": 0, "tip": 0,
        "participants": [{"profile_id": mom, "subtotal": 15}],
    })
    txns = [t for t in api.client.get("/api/transactions").json() if t.get("group_id") == gid]
    assert len(txns) == 1
    assert txns[0]["profile_id"] == mom
    assert float(txns[0]["amount"]) == -15.0
    assert txns[0]["is_paid_back"] is True


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
