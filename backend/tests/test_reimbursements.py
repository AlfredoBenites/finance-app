"""Tests for the reimbursement-to-bucket suggestions."""
USER_A = ("user-a", "a@example.com")


def _setup(api):
    api.login(*USER_A)
    me = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    mom = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    api.client.post(f"/api/profiles/{me}/make-primary")
    acct = api.client.post("/api/accounts", json={"name": "Ally", "balance": 1000}).json()["id"]
    card = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]
    # assign the auto-created payoff bucket to the account
    payoff = next(b for b in api.client.get("/api/buckets").json() if b["credit_card_id"] == card)
    api.client.put(f"/api/buckets/{payoff['id']}", json={"account_id": acct})
    return me, mom, acct, card, payoff["id"]


def test_reimbursement_suggested_then_allocated(api):
    me, mom, acct, card, payoff = _setup(api)
    # Mom's $100 charge, paid back (reimbursed); your own $40 charge, also paid
    mom_txn = api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                              "profile_id": mom, "credit_card_id": card, "is_paid_back": True}).json()["id"]
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-02", "amount": -40,
                    "profile_id": me, "credit_card_id": card, "is_paid_back": True})

    # only Mom's reimbursement is suggested (not your own paid charge)
    sug = api.client.get("/api/buckets/reimbursements").json()
    assert len(sug) == 1
    assert sug[0]["amount"] == 100.0 and sug[0]["card_name"] == "Visa"

    # allocate it -> bucket gets $100, suggestion clears
    assert api.client.post(f"/api/buckets/allocate-reimbursement?card_id={card}").status_code == 200
    amt = next(b["current_amount"] for b in api.client.get("/api/buckets").json() if b["id"] == payoff)
    assert float(amt) == 100.0
    assert api.client.get("/api/buckets/reimbursements").json() == []


def test_allocate_blocked_when_unallocated_insufficient(api):
    me, mom, acct, card, payoff = _setup(api)
    # set the account balance to 50 (less than the reimbursement)
    api.client.put(f"/api/accounts/{acct}", json={"balance": 50})
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                    "profile_id": mom, "credit_card_id": card, "is_paid_back": True})
    assert api.client.post(f"/api/buckets/allocate-reimbursement?card_id={card}").status_code == 400
