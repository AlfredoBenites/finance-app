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
    mine = api.client.post("/api/buckets", json={"name": "My money", "account_id": acct, "current_amount": 500}).json()["id"]
    payoff = next(b["id"] for b in api.client.get("/api/buckets").json() if b["credit_card_id"] == card)
    api.client.put(f"/api/buckets/{payoff}", json={"account_id": acct})
    # default money buckets (your own charges need a funded source to be suggested)
    api.client.put(f"/api/profiles/{mom}", json={"default_bucket_id": moms})
    api.client.put(f"/api/profiles/{me}", json={"default_bucket_id": mine})
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
    # each suggestion lists the paid charges that add up to its total
    assert len(by_profile["Mom"]["transactions"]) == 1
    assert by_profile["Mom"]["transactions"][0]["amount"] == -100.0


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


def test_income_allocation_adds_to_bucket_and_account_balance(api):
    api.login(*USER_A)
    acct = api.client.post("/api/accounts", json={"name": "Ally", "balance": 100}).json()["id"]
    moms = api.client.post("/api/buckets", json={"name": "Moms money", "account_id": acct, "current_amount": 0}).json()["id"]
    inc = api.client.post("/api/income", json={"income_date": "2026-06-20", "source": "Mom's Payment",
                                               "amount": 500, "account_id": acct}).json()["id"]
    # the income shows as a suggestion
    sug = api.client.get("/api/buckets/income-allocations").json()
    assert len(sug) == 1 and sug[0]["amount"] == 500.0

    r = api.client.post("/api/buckets/allocate-income", json={"income_id": inc, "bucket_id": moms})
    assert r.status_code == 200
    # bucket and account balance both went up by 500
    amt = next(b["current_amount"] for b in api.client.get("/api/buckets").json() if b["id"] == moms)
    bal = next(a["balance"] for a in api.client.get("/api/accounts").json() if a["id"] == acct)
    assert float(amt) == 500.0 and float(bal) == 600.0
    # suggestion clears
    assert api.client.get("/api/buckets/income-allocations").json() == []


def test_income_allocation_to_unallocated_bumps_balance_only(api):
    api.login(*USER_A)
    acct = api.client.post("/api/accounts", json={"name": "Ally", "balance": 100}).json()["id"]
    bucket = api.client.post("/api/buckets", json={"name": "b", "account_id": acct, "current_amount": 0}).json()["id"]
    inc = api.client.post("/api/income", json={"income_date": "2026-06-20", "source": "Pay",
                                               "amount": 500, "account_id": acct}).json()["id"]
    r = api.client.post("/api/buckets/allocate-income", json={"income_id": inc, "bucket_id": "unallocated"})
    assert r.status_code == 200
    bal = next(a["balance"] for a in api.client.get("/api/accounts").json() if a["id"] == acct)
    amt = next(b["current_amount"] for b in api.client.get("/api/buckets").json() if b["id"] == bucket)
    assert float(bal) == 600.0 and float(amt) == 0.0  # balance up, no bucket earmarked
    assert api.client.get("/api/buckets/income-allocations").json() == []


def test_undo_income_allocation_reverses_bucket_and_balance(api):
    api.login(*USER_A)
    acct = api.client.post("/api/accounts", json={"name": "Ally", "balance": 100}).json()["id"]
    bucket = api.client.post("/api/buckets", json={"name": "b", "account_id": acct, "current_amount": 0}).json()["id"]
    inc = api.client.post("/api/income", json={"income_date": "2026-06-20", "source": "Pay",
                                               "amount": 500, "account_id": acct}).json()["id"]
    api.client.post("/api/buckets/allocate-income", json={"income_id": inc, "bucket_id": bucket})
    # undo it
    r = api.client.post("/api/buckets/undo-income-allocation", json={"income_id": inc})
    assert r.status_code == 200
    bal = next(a["balance"] for a in api.client.get("/api/accounts").json() if a["id"] == acct)
    amt = next(b["current_amount"] for b in api.client.get("/api/buckets").json() if b["id"] == bucket)
    assert float(bal) == 100.0 and float(amt) == 0.0  # back to before
    # and it re-appears as a suggestion
    assert len(api.client.get("/api/buckets/income-allocations").json()) == 1


def test_income_allocation_rejects_bucket_in_other_account(api):
    api.login(*USER_A)
    a1 = api.client.post("/api/accounts", json={"name": "Ally", "balance": 100}).json()["id"]
    a2 = api.client.post("/api/accounts", json={"name": "Chase", "balance": 100}).json()["id"]
    other = api.client.post("/api/buckets", json={"name": "x", "account_id": a2, "current_amount": 0}).json()["id"]
    inc = api.client.post("/api/income", json={"income_date": "2026-06-20", "source": "Pay",
                                               "amount": 50, "account_id": a1}).json()["id"]
    r = api.client.post("/api/buckets/allocate-income", json={"income_id": inc, "bucket_id": other})
    assert r.status_code == 400


def test_dismiss_income_clears_without_moving(api):
    api.login(*USER_A)
    acct = api.client.post("/api/accounts", json={"name": "Ally", "balance": 100}).json()["id"]
    inc = api.client.post("/api/income", json={"income_date": "2026-06-20", "source": "Pay",
                                               "amount": 50, "account_id": acct}).json()["id"]
    api.client.post("/api/buckets/dismiss-income", json={"income_id": inc})
    assert api.client.get("/api/buckets/income-allocations").json() == []
    bal = next(a["balance"] for a in api.client.get("/api/accounts").json() if a["id"] == acct)
    assert float(bal) == 100.0  # untouched


def test_own_charge_suggested_when_source_has_money(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    # your own charge, NOT reimbursed, NOT paid to bank -> suggest setting money aside
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                    "profile_id": me, "credit_card_id": card})
    mine = next((s for s in api.client.get("/api/buckets/reimbursements").json() if s["profile_id"] == me), None)
    assert mine and mine["amount"] == 100.0 and mine["own"] is True  # My money (500) covers it


def test_own_charge_hidden_when_source_short(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -600,
                    "profile_id": me, "credit_card_id": card})  # My money only has 500
    assert not any(s["profile_id"] == me for s in api.client.get("/api/buckets/reimbursements").json())


def test_own_charge_hidden_once_paid_to_bank(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                    "profile_id": me, "credit_card_id": card, "paid_to_bank": True})
    assert not any(s["profile_id"] == me for s in api.client.get("/api/buckets/reimbursements").json())


def test_income_update_changes_amount_and_date(api):
    api.login(*USER_A)
    acct = api.client.post("/api/accounts", json={"name": "Ally", "balance": 0}).json()["id"]
    inc = api.client.post("/api/income", json={"income_date": "2026-06-20", "source": "Pay",
                                               "amount": 100, "account_id": acct}).json()["id"]
    r = api.client.put(f"/api/income/{inc}", json={"amount": 250, "income_date": "2026-06-25"})
    assert r.status_code == 200
    got = api.client.get("/api/income").json()[0]
    assert float(got["amount"]) == 250.0 and got["income_date"] == "2026-06-25"


def test_marking_reimbursed_reopens_suggestion(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    tid = api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                    "profile_id": mom, "credit_card_id": card, "is_paid_back": True}).json()["id"]
    api.client.post("/api/buckets/dismiss-reimbursement", json={"profile_id": mom, "credit_card_id": card})
    assert api.client.get("/api/buckets/reimbursements").json() == []  # dismissed
    # re-marking reimbursed clears the allocated flag -> suggestion returns
    api.client.put(f"/api/transactions/{tid}", json={"is_paid_back": True, "reimbursement_allocated": False})
    assert any(s["profile_id"] == mom for s in api.client.get("/api/buckets/reimbursements").json())


def test_allocate_blocked_when_source_short(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -700,
                    "profile_id": mom, "credit_card_id": card, "is_paid_back": True})
    # Mom's bucket only has 500
    r = api.client.post("/api/buckets/allocate-reimbursement", json={
        "profile_id": mom, "credit_card_id": card, "source_bucket_id": moms, "dest_bucket_id": payoff})
    assert r.status_code == 400
