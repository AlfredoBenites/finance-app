"""Tests for the allocate-to-bucket suggestions (own + others' paid charges)."""
USER_A = ("user-a", "a@example.com")


def _setup(api):
    api.login(*USER_A)
    me = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    mom = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    api.client.post(f"/api/profiles/{me}/make-primary")
    acct = api.client.post("/api/accounts", json={"name": "Ally", "balance": 1000}).json()["id"]
    card = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]
    moms = api.client.post("/api/buckets", json={"name": "Moms money", "account_id": acct, "current_amount": 500}).json()["id"]
    payoff = next(b["id"] for b in api.client.get("/api/buckets").json() if b["credit_card_id"] == card)
    api.client.put(f"/api/buckets/{payoff}", json={"account_id": acct})
    # Mom's default money bucket
    api.client.put(f"/api/profiles/{mom}", json={"default_bucket_id": moms})
    return me, mom, acct, card, moms, payoff


def test_suggests_own_and_others_paid_charges(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                    "profile_id": mom, "credit_card_id": card, "is_paid_back": True})
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-02", "amount": -40,
                    "profile_id": me, "credit_card_id": card, "is_paid_back": True})
    sug = api.client.get("/api/buckets/reimbursements").json()
    # one suggestion per (profile, card) — both Mom's and your own
    by_profile = {s["profile_name"]: s for s in sug}
    assert by_profile["Mom"]["amount"] == 100.0
    assert by_profile["Mom"]["source_bucket_id"] == moms  # Mom's default bucket
    assert by_profile["Me"]["amount"] == 40.0


def test_allocate_moves_source_to_dest_and_clears(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                    "profile_id": mom, "credit_card_id": card, "is_paid_back": True})
    r = api.client.post("/api/buckets/allocate-reimbursement", json={
        "profile_id": mom, "credit_card_id": card, "source_bucket_id": moms, "dest_bucket_id": payoff})
    assert r.status_code == 200
    amounts = {b["id"]: float(b["current_amount"]) for b in api.client.get("/api/buckets").json()}
    assert amounts[moms] == 400.0 and amounts[payoff] == 100.0
    assert not any(s["profile_id"] == mom for s in api.client.get("/api/buckets/reimbursements").json())


def test_dismiss_clears_one_suggestion_without_moving_money(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                    "profile_id": mom, "credit_card_id": card, "is_paid_back": True})
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-02", "amount": -40,
                    "profile_id": me, "credit_card_id": card, "is_paid_back": True})
    r = api.client.post("/api/buckets/dismiss-reimbursement", json={"profile_id": mom, "credit_card_id": card})
    assert r.status_code == 200
    # money untouched
    amounts = {b["id"]: float(b["current_amount"]) for b in api.client.get("/api/buckets").json()}
    assert amounts[moms] == 500.0 and amounts[payoff] == 0.0
    # Mom's suggestion gone, mine still there
    sug = api.client.get("/api/buckets/reimbursements").json()
    assert not any(s["profile_id"] == mom for s in sug)
    assert any(s["profile_id"] == me for s in sug)


def test_dismiss_all_clears_every_suggestion(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                    "profile_id": mom, "credit_card_id": card, "is_paid_back": True})
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-02", "amount": -40,
                    "profile_id": me, "credit_card_id": card, "is_paid_back": True})
    r = api.client.post("/api/buckets/dismiss-all-reimbursements")
    assert r.status_code == 200
    assert api.client.get("/api/buckets/reimbursements").json() == []


def test_allocate_blocked_when_source_short(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -700,
                    "profile_id": mom, "credit_card_id": card, "is_paid_back": True})
    # Mom's bucket only has 500
    r = api.client.post("/api/buckets/allocate-reimbursement", json={
        "profile_id": mom, "credit_card_id": card, "source_bucket_id": moms, "dest_bucket_id": payoff})
    assert r.status_code == 400
