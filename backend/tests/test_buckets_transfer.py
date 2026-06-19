"""Tests for moving money between envelope buckets within an account."""
USER_A = ("user-a", "a@example.com")


def _setup(api):
    """Account with balance 1000 and two buckets (gas, payoff) at 0."""
    api.login(*USER_A)
    acct = api.client.post("/api/accounts", json={"name": "Ally", "balance": 1000}).json()["id"]
    gas = api.client.post("/api/buckets", json={"name": "Gas", "account_id": acct, "current_amount": 0}).json()["id"]
    payoff = api.client.post("/api/buckets", json={"name": "Payoff", "account_id": acct, "current_amount": 0}).json()["id"]
    return acct, gas, payoff


def _amount(api, bucket_id):
    rows = api.client.get("/api/buckets").json()
    return next(float(b["current_amount"]) for b in rows if b["id"] == bucket_id)


def test_allocate_from_unallocated(api):
    acct, gas, _ = _setup(api)
    r = api.client.post("/api/buckets/transfer", json={"account_id": acct, "from": "unallocated", "to": gas, "amount": 300})
    assert r.status_code == 200
    assert _amount(api, gas) == 300.0


def test_cannot_allocate_more_than_balance(api):
    acct, gas, _ = _setup(api)
    r = api.client.post("/api/buckets/transfer", json={"account_id": acct, "from": "unallocated", "to": gas, "amount": 1500})
    assert r.status_code == 400


def test_move_between_buckets(api):
    acct, gas, payoff = _setup(api)
    api.client.post("/api/buckets/transfer", json={"account_id": acct, "from": "unallocated", "to": gas, "amount": 300})
    api.client.post("/api/buckets/transfer", json={"account_id": acct, "from": gas, "to": payoff, "amount": 100})
    assert _amount(api, gas) == 200.0
    assert _amount(api, payoff) == 100.0


def test_cannot_overdraw_a_bucket(api):
    acct, gas, payoff = _setup(api)
    api.client.post("/api/buckets/transfer", json={"account_id": acct, "from": "unallocated", "to": gas, "amount": 100})
    r = api.client.post("/api/buckets/transfer", json={"account_id": acct, "from": gas, "to": payoff, "amount": 200})
    assert r.status_code == 400


def test_can_move_bucket_to_another_account(api):
    acct, gas, _ = _setup(api)
    acct2 = api.client.post("/api/accounts", json={"name": "HYSA", "balance": 0}).json()["id"]
    r = api.client.put(f"/api/buckets/{gas}", json={"account_id": acct2})
    assert r.status_code == 200
    assert r.json()["account_id"] == acct2
