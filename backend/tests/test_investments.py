"""Tests for buying investments: shares go up, account cash goes down, history logged."""


def _account(api, balance):
    return api.client.post(
        "/api/accounts",
        json={"name": "Robinhood", "account_type": "investment", "balance": balance, "is_asset": True},
    ).json()["id"]


def _bucket(api, account_id, amount, name="Buying power"):
    return api.client.post(
        "/api/buckets",
        json={"name": name, "account_id": account_id, "current_amount": amount},
    ).json()["id"]


def _bucket_amount(api, bucket_id):
    row = next(b for b in api.client.get("/api/buckets").json() if b["id"] == bucket_id)
    return float(row["current_amount"])


def test_buy_creates_holding_debits_cash_and_logs(api):
    api.login("user-a", "a@example.com")
    acc = _account(api, 1000)

    r = api.client.post(
        "/api/holdings/buy",
        json={"account_id": acc, "symbol": "aapl", "kind": "stock", "category": "Roth IRA",
              "shares": 2, "price": 100, "traded_on": "2026-07-09"},
    )
    assert r.status_code == 200, r.text
    holding = r.json()
    assert holding["symbol"] == "AAPL"
    assert float(holding["shares"]) == 2
    # Seeded price so it has an immediate value.
    assert float(holding["last_price"]) == 100

    # Buying power dropped by 2 * 100 = 200.
    acc_row = next(a for a in api.client.get("/api/accounts").json() if a["id"] == acc)
    assert float(acc_row["balance"]) == 800

    # History has one buy.
    txns = api.client.get("/api/holdings/transactions").json()
    assert len(txns) == 1
    assert txns[0]["type"] == "buy"
    assert float(txns[0]["amount"]) == 200
    assert float(txns[0]["shares"]) == 2


def test_buying_more_adds_to_existing_holding(api):
    api.login("user-a", "a@example.com")
    acc = _account(api, 1000)
    api.client.post("/api/holdings/buy", json={"account_id": acc, "symbol": "AAPL", "shares": 2, "price": 100})
    r = api.client.post("/api/holdings/buy", json={"account_id": acc, "symbol": "AAPL", "shares": 3, "price": 50})
    assert r.status_code == 200, r.text
    assert float(r.json()["shares"]) == 5

    # Only one holding for AAPL in this account.
    aapl = [h for h in api.client.get("/api/holdings").json() if h["symbol"] == "AAPL"]
    assert len(aapl) == 1
    # Cash: 1000 - 200 - 150 = 650.
    acc_row = next(a for a in api.client.get("/api/accounts").json() if a["id"] == acc)
    assert float(acc_row["balance"]) == 650


def test_buy_uses_exact_total_when_given(api):
    api.login("user-a", "a@example.com")
    acc = _account(api, 1000)
    # shares * price rounds to 463.51, but the real charge was 463.50.
    r = api.client.post(
        "/api/holdings/buy",
        json={"account_id": acc, "symbol": "NVDA", "shares": 2.289841, "price": 202.42, "amount": 463.50},
    )
    assert r.status_code == 200, r.text
    acc_row = next(a for a in api.client.get("/api/accounts").json() if a["id"] == acc)
    assert float(acc_row["balance"]) == 536.50  # 1000 - 463.50, not 463.51
    txn = api.client.get("/api/holdings/transactions").json()[0]
    assert float(txn["amount"]) == 463.50
    assert float(txn["price"]) == 202.42


def test_buy_rejects_insufficient_buying_power(api):
    api.login("user-a", "a@example.com")
    acc = _account(api, 50)
    r = api.client.post("/api/holdings/buy", json={"account_id": acc, "symbol": "AAPL", "shares": 1, "price": 100})
    assert r.status_code == 400
    assert "buying power" in r.json()["detail"].lower()
    # Nothing changed.
    assert api.client.get("/api/holdings").json() == []
    assert api.client.get("/api/holdings/transactions").json() == []


def test_sell_reduces_shares_and_returns_cash(api):
    api.login("user-a", "a@example.com")
    acc = _account(api, 1000)
    api.client.post("/api/holdings/buy", json={"account_id": acc, "symbol": "AAPL", "shares": 5, "price": 100})
    hid = api.client.get("/api/holdings").json()[0]["id"]

    r = api.client.post("/api/holdings/sell", json={"holding_id": hid, "shares": 2, "price": 120})
    assert r.status_code == 200, r.text
    assert r.json()["shares_left"] == 3

    assert float(api.client.get("/api/holdings").json()[0]["shares"]) == 3
    acc_row = next(a for a in api.client.get("/api/accounts").json() if a["id"] == acc)
    # 1000 - 500 (buy) + 240 (sell) = 740
    assert float(acc_row["balance"]) == 740
    sells = [t for t in api.client.get("/api/holdings/transactions").json() if t["type"] == "sell"]
    assert len(sells) == 1 and float(sells[0]["amount"]) == 240


def test_selling_all_shares_deletes_the_holding(api):
    api.login("user-a", "a@example.com")
    acc = _account(api, 1000)
    api.client.post("/api/holdings/buy", json={"account_id": acc, "symbol": "AAPL", "shares": 5, "price": 100})
    hid = api.client.get("/api/holdings").json()[0]["id"]
    r = api.client.post("/api/holdings/sell", json={"holding_id": hid, "shares": 5, "price": 100})
    assert r.status_code == 200 and r.json()["shares_left"] == 0
    assert api.client.get("/api/holdings").json() == []
    acc_row = next(a for a in api.client.get("/api/accounts").json() if a["id"] == acc)
    assert float(acc_row["balance"]) == 1000  # cash fully returned


def test_sell_more_than_owned_is_rejected(api):
    api.login("user-a", "a@example.com")
    acc = _account(api, 1000)
    api.client.post("/api/holdings/buy", json={"account_id": acc, "symbol": "AAPL", "shares": 2, "price": 100})
    hid = api.client.get("/api/holdings").json()[0]["id"]
    r = api.client.post("/api/holdings/sell", json={"holding_id": hid, "shares": 3, "price": 100})
    assert r.status_code == 400
    assert "only have" in r.json()["detail"].lower()


def test_buy_from_a_bucket_draws_the_bucket_down(api):
    """Cash allocated to a bucket has to leave the bucket too, or the account is
    left over-allocated (balance minus its buckets goes negative)."""
    api.login("user-a", "a@example.com")
    acc = _account(api, 1065.49)
    bucket = _bucket(api, acc, 1065.49)

    r = api.client.post(
        "/api/holdings/buy",
        json={"account_id": acc, "bucket_id": bucket, "symbol": "NVDA",
              "shares": 2.289841, "price": 202.42, "amount": 463.50},
    )
    assert r.status_code == 200, r.text
    acc_row = next(a for a in api.client.get("/api/accounts").json() if a["id"] == acc)
    assert float(acc_row["balance"]) == 601.99
    # Bucket followed the cash down, so unallocated stays at 0 (not -463.50).
    assert _bucket_amount(api, bucket) == 601.99


def test_buy_never_pushes_a_bucket_negative(api):
    api.login("user-a", "a@example.com")
    acc = _account(api, 1000)
    bucket = _bucket(api, acc, 100)
    r = api.client.post(
        "/api/holdings/buy",
        json={"account_id": acc, "bucket_id": bucket, "symbol": "AAPL", "shares": 3, "price": 100},
    )
    assert r.status_code == 200, r.text
    assert _bucket_amount(api, bucket) == 0.0


def test_sell_into_a_bucket_returns_the_proceeds(api):
    api.login("user-a", "a@example.com")
    acc = _account(api, 1000)
    bucket = _bucket(api, acc, 1000)
    api.client.post(
        "/api/holdings/buy",
        json={"account_id": acc, "bucket_id": bucket, "symbol": "AAPL", "shares": 5, "price": 100},
    )
    hid = api.client.get("/api/holdings").json()[0]["id"]
    assert _bucket_amount(api, bucket) == 500.0

    r = api.client.post(
        "/api/holdings/sell",
        json={"holding_id": hid, "bucket_id": bucket, "shares": 2, "price": 120},
    )
    assert r.status_code == 200, r.text
    # Cash and bucket both back up by 240.
    acc_row = next(a for a in api.client.get("/api/accounts").json() if a["id"] == acc)
    assert float(acc_row["balance"]) == 740.0
    assert _bucket_amount(api, bucket) == 740.0


def test_buy_rejects_a_bucket_from_another_account(api):
    api.login("user-a", "a@example.com")
    acc = _account(api, 1000)
    other = api.client.post("/api/accounts", json={"name": "Ally", "balance": 500}).json()["id"]
    bucket = _bucket(api, other, 500, name="Rent")

    r = api.client.post(
        "/api/holdings/buy",
        json={"account_id": acc, "bucket_id": bucket, "symbol": "AAPL", "shares": 1, "price": 100},
    )
    assert r.status_code == 400
    assert "bucket" in r.json()["detail"].lower()
    # Nothing moved: no holding, no cash spent, bucket untouched.
    assert api.client.get("/api/holdings").json() == []
    acc_row = next(a for a in api.client.get("/api/accounts").json() if a["id"] == acc)
    assert float(acc_row["balance"]) == 1000
    assert _bucket_amount(api, bucket) == 500.0


def test_sell_rejects_a_bucket_from_another_account(api):
    api.login("user-a", "a@example.com")
    acc = _account(api, 1000)
    other = api.client.post("/api/accounts", json={"name": "Ally", "balance": 500}).json()["id"]
    bucket = _bucket(api, other, 500, name="Rent")
    api.client.post("/api/holdings/buy", json={"account_id": acc, "symbol": "AAPL", "shares": 2, "price": 100})
    hid = api.client.get("/api/holdings").json()[0]["id"]

    r = api.client.post(
        "/api/holdings/sell",
        json={"holding_id": hid, "bucket_id": bucket, "shares": 1, "price": 100},
    )
    assert r.status_code == 400
    assert "bucket" in r.json()["detail"].lower()
    # The sale didn't happen.
    assert float(api.client.get("/api/holdings").json()[0]["shares"]) == 2
    assert _bucket_amount(api, bucket) == 500.0
