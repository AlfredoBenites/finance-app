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


def test_account_transfer_between_buckets_cross_account(api):
    api.login(*USER_A)
    a = api.client.post("/api/accounts", json={"name": "Capital One", "balance": 500}).json()["id"]
    b = api.client.post("/api/accounts", json={"name": "Ally", "balance": 0}).json()["id"]
    src_bucket = api.client.post("/api/buckets", json={"name": "bonus", "account_id": a, "current_amount": 500}).json()["id"]
    dst_bucket = api.client.post("/api/buckets", json={"name": "invest", "account_id": b, "current_amount": 0}).json()["id"]
    # all of a's money is in src_bucket (0 unallocated); pull from the bucket -> dst bucket
    r = api.client.post("/api/accounts/transfer", json={
        "from_account_id": a, "to_account_id": b, "amount": 300,
        "from_bucket_id": src_bucket, "to_bucket_id": dst_bucket})
    assert r.status_code == 200
    bals = {x["name"]: float(x["balance"]) for x in api.client.get("/api/accounts").json()}
    assert bals["Capital One"] == 200.0 and bals["Ally"] == 300.0
    amts = {x["id"]: float(x["current_amount"]) for x in api.client.get("/api/buckets").json()}
    assert amts[src_bucket] == 200.0 and amts[dst_bucket] == 300.0


def test_account_transfer_recorded_in_history(api):
    api.login(*USER_A)
    a = api.client.post("/api/accounts", json={"name": "Cap One", "balance": 100}).json()["id"]
    b = api.client.post("/api/accounts", json={"name": "Ally", "balance": 0}).json()["id"]
    api.client.post("/api/accounts/transfer", json={"from_account_id": a, "to_account_id": b, "amount": 40})
    hist = api.client.get("/api/accounts/transfers").json()
    assert len(hist) == 1 and float(hist[0]["amount"]) == 40.0
    assert "Cap One" in hist[0]["summary"] and "Ally" in hist[0]["summary"]


def test_bucket_move_recorded_in_history(api):
    api.login(*USER_A)
    acct = api.client.post("/api/accounts", json={"name": "Ally", "balance": 500}).json()["id"]
    b1 = api.client.post("/api/buckets", json={"name": "Savings", "account_id": acct, "current_amount": 300}).json()["id"]
    b2 = api.client.post("/api/buckets", json={"name": "Vacation", "account_id": acct, "current_amount": 0}).json()["id"]
    api.client.post("/api/buckets/transfer", json={"account_id": acct, "from": b1, "to": b2, "amount": 100})
    hist = api.client.get("/api/buckets/moves").json()
    assert len(hist) == 1 and float(hist[0]["amount"]) == 100.0
    assert "Savings" in hist[0]["summary"] and "Vacation" in hist[0]["summary"]


def test_search_matches_merchant_or_notes(api):
    api.login(*USER_A)
    pid = _profile(api)
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -50,
                    "merchant": "Publix", "notes": "for the beach trip", "profile_id": pid, "credit_card_id": "c1"})
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-02", "amount": -20,
                    "merchant": "Beach Shop", "notes": "sunscreen", "profile_id": pid, "credit_card_id": "c1"})
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-03", "amount": -10,
                    "merchant": "Gas", "notes": "commute", "profile_id": pid, "credit_card_id": "c1"})
    # "beach" matches the note on Publix and the merchant on Beach Shop -> 2
    got = api.client.get("/api/transactions?search=beach").json()
    merchants = sorted(t["merchant"] for t in got)
    assert merchants == ["Beach Shop", "Publix"]
    # a note-only term
    assert [t["merchant"] for t in api.client.get("/api/transactions?search=sunscreen").json()] == ["Beach Shop"]
