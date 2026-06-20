"""Endpoint tests for the card-or-account payment source on transactions."""
USER_A = ("user-a", "a@example.com")


def _profile(api):
    return api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]


def test_card_transaction_counts_as_card_debt(api):
    api.login(*USER_A)
    pid = _profile(api)
    r = api.client.post(
        "/api/transactions",
        json={"transaction_date": "2026-06-01", "amount": -400, "profile_id": pid,
              "credit_card_id": "card-1"},
    )
    assert r.status_code == 201
    assert api.client.get("/api/dashboard").json()["total_credit_card_debt"] == 400.0


def test_account_transaction_is_not_card_debt(api):
    api.login(*USER_A)
    pid = _profile(api)
    r = api.client.post(
        "/api/transactions",
        json={"transaction_date": "2026-06-01", "amount": -100, "profile_id": pid,
              "account_id": "acct-1"},
    )
    assert r.status_code == 201
    # A bank/cash purchase is not credit-card debt.
    assert api.client.get("/api/dashboard").json()["total_credit_card_debt"] == 0.0


def test_transaction_with_no_payment_source_is_rejected(api):
    api.login(*USER_A)
    pid = _profile(api)
    r = api.client.post(
        "/api/transactions",
        json={"transaction_date": "2026-06-01", "amount": -5, "profile_id": pid},
    )
    assert r.status_code == 400


def test_transaction_with_two_payment_sources_is_rejected(api):
    api.login(*USER_A)
    pid = _profile(api)
    r = api.client.post(
        "/api/transactions",
        json={"transaction_date": "2026-06-01", "amount": -5, "profile_id": pid,
              "credit_card_id": "card-1", "account_id": "acct-1"},
    )
    assert r.status_code == 400


def test_account_transfer_moves_balance(api):
    api.login(*USER_A)
    a = api.client.post("/api/accounts", json={"name": "Capital One", "balance": 1000}).json()["id"]
    b = api.client.post("/api/accounts", json={"name": "Ally HYSA", "balance": 200}).json()["id"]
    r = api.client.post("/api/accounts/transfer", json={"from_account_id": a, "to_account_id": b, "amount": 300})
    assert r.status_code == 200
    bals = {x["name"]: float(x["balance"]) for x in api.client.get("/api/accounts").json()}
    assert bals["Capital One"] == 700.0 and bals["Ally HYSA"] == 500.0


def test_account_transfer_blocked_when_money_is_allocated(api):
    api.login(*USER_A)
    a = api.client.post("/api/accounts", json={"name": "Capital One", "balance": 1000}).json()["id"]
    b = api.client.post("/api/accounts", json={"name": "Ally", "balance": 0}).json()["id"]
    # allocate 900 into a bucket -> only 100 unallocated
    api.client.post("/api/buckets", json={"name": "saved", "account_id": a, "current_amount": 900})
    r = api.client.post("/api/accounts/transfer", json={"from_account_id": a, "to_account_id": b, "amount": 300})
    assert r.status_code == 400
