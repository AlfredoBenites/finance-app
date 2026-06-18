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
