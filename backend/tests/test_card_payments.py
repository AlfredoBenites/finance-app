"""Tests for paying a card (settle charges + draw money)."""
USER_A = ("user-a", "a@example.com")


def test_pay_card_settles_charges_and_draws_money(api):
    api.login(*USER_A)
    acct = api.client.post("/api/accounts", json={"name": "Ally", "balance": 1000}).json()["id"]
    card = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]
    pid = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -300,
                                               "profile_id": pid, "credit_card_id": card})
    bucket = api.client.post("/api/buckets", json={"name": "Visa payoff", "account_id": acct,
                                                   "current_amount": 300}).json()["id"]

    r = api.client.post(f"/api/credit-cards/{card}/pay",
                        json={"account_id": acct, "bucket_id": bucket, "amount": 300})
    assert r.status_code == 200
    assert r.json()["charges_settled"] == 1

    # card debt settled
    assert api.client.get("/api/dashboard").json()["total_credit_card_debt"] == 0.0
    # account balance and bucket drawn down
    balance = next(a["balance"] for a in api.client.get("/api/accounts").json() if a["id"] == acct)
    assert float(balance) == 700.0
    amt = next(b["current_amount"] for b in api.client.get("/api/buckets").json() if b["id"] == bucket)
    assert float(amt) == 0.0
    # payment recorded
    assert len(api.client.get("/api/credit-cards/payments").json()) == 1


def test_paying_marks_bank_paid_not_reimbursed(api):
    """Paying a card settles it with the bank but must NOT mark charges as
    reimbursed by a person (that's the user's call)."""
    api.login(*USER_A)
    acct = api.client.post("/api/accounts", json={"name": "Ally", "balance": 1000}).json()["id"]
    card = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]
    pid = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                                               "profile_id": pid, "credit_card_id": card})
    api.client.post(f"/api/credit-cards/{card}/pay", json={"account_id": acct, "amount": 100})

    t = api.client.get("/api/transactions").json()[0]
    assert t["paid_to_bank"] is True      # you paid the issuer
    assert t["is_paid_back"] is False     # Mom still owes you
    # bank debt is cleared...
    assert api.client.get("/api/dashboard").json()["total_credit_card_debt"] == 0.0
    # ...but the reimbursement suggestion does NOT fire (charge is still unpaid)
    assert api.client.get("/api/buckets/reimbursements").json() == []


def test_cannot_pay_more_than_account_balance(api):
    api.login(*USER_A)
    acct = api.client.post("/api/accounts", json={"name": "Ally", "balance": 50}).json()["id"]
    card = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]
    r = api.client.post(f"/api/credit-cards/{card}/pay", json={"account_id": acct, "amount": 200})
    assert r.status_code == 400
