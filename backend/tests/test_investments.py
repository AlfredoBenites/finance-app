"""Tests for buying investments: shares go up, account cash goes down, history logged."""


def _account(api, balance):
    return api.client.post(
        "/api/accounts",
        json={"name": "Robinhood", "account_type": "investment", "balance": balance, "is_asset": True},
    ).json()["id"]


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
