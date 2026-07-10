"""Tests for investment holdings + their effect on net worth."""
USER_A = ("user-a", "a@example.com")


def test_holding_crud(api):
    api.login(*USER_A)
    acct = api.client.post("/api/accounts", json={"name": "Robinhood", "balance": 0}).json()["id"]
    h = api.client.post("/api/holdings", json={"account_id": acct, "symbol": "aapl",
                                               "kind": "stock", "shares": 3, "manual_price": 100}).json()
    assert h["symbol"] == "aapl"  # stored as sent; the UI upper-cases before sending
    api.client.put(f"/api/holdings/{h['id']}", json={"shares": 5})
    got = api.client.get("/api/holdings").json()[0]
    assert float(got["shares"]) == 5.0
    api.client.delete(f"/api/holdings/{h['id']}")
    assert api.client.get("/api/holdings").json() == []


def test_holdings_value_adds_to_account_cash_in_net_worth(api):
    api.login(*USER_A)
    # balance 999 is the account's uninvested cash (buying power); holdings add on top
    acct = api.client.post("/api/accounts", json={"name": "Robinhood", "balance": 999}).json()["id"]
    api.client.post("/api/holdings", json={"account_id": acct, "symbol": "AAPL",
                                           "kind": "stock", "shares": 10, "manual_price": 200})
    d = api.client.get("/api/dashboard").json()
    # account value = 999 cash + 10 * 200 holdings = 2999
    assert d["total_assets"] == 2999.0
    assert d["net_worth"] == 2999.0


def test_refresh_prices_with_no_holdings_is_noop(api):
    api.login(*USER_A)
    r = api.client.post("/api/holdings/refresh-prices")
    assert r.status_code == 200 and r.json() == {"ok": True, "updated": 0, "total": 0}
