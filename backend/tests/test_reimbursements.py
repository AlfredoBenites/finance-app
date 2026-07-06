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


def test_linked_refund_nets_against_its_purchase(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    purchase = api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -33.81,
                    "profile_id": mom, "credit_card_id": card, "is_paid_back": True}).json()["id"]
    # Before any refund, the suggestion moves the full charge.
    before = api.client.get("/api/buckets/reimbursements").json()
    assert before[0]["amount"] == 33.81

    # A $10 refund linked to that purchase nets it down to $23.81.
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-05", "amount": 10,
                    "profile_id": mom, "credit_card_id": card, "refund_for_id": purchase})
    after = api.client.get("/api/buckets/reimbursements").json()
    assert len(after) == 1
    assert round(after[0]["amount"], 2) == 23.81
    # The line reflects the net amount (so the checklist + allocate math match) and reports the refund.
    line = after[0]["transactions"][0]
    assert round(line["amount"], 2) == -23.81
    assert round(line["refunded"], 2) == 10.0
    # The refund itself is not a separate suggestion line.
    assert len(after[0]["transactions"]) == 1


def test_linked_refund_settles_with_its_purchase(api):
    # A refund keeps offsetting debt only while its purchase is owed; when the
    # purchase is reimbursed, the refund settles too and leaves the owed totals.
    me, mom, acct, card, moms, payoff = _setup(api)
    purchase = api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -30,
                    "profile_id": mom, "credit_card_id": card}).json()["id"]
    refund = api.client.post("/api/transactions", json={"transaction_date": "2026-06-03", "amount": 8.61,
                    "profile_id": mom, "credit_card_id": card, "refund_for_id": purchase}).json()["id"]
    # While the purchase is unpaid, the refund is unpaid too (offsets the debt).
    assert api.client.get(f"/api/transactions/{refund}").json()["is_paid_back"] is False
    summary_before = api.client.get(f"/api/profiles/{mom}/summary").json()
    assert summary_before["total_unpaid"] == 30.0 - 8.61

    # Mark the purchase reimbursed → the refund follows, so neither is left owed.
    api.client.put(f"/api/transactions/{purchase}", json={"is_paid_back": True})
    assert api.client.get(f"/api/transactions/{refund}").json()["is_paid_back"] is True
    summary_after = api.client.get(f"/api/profiles/{mom}/summary").json()
    assert summary_after["total_unpaid"] == 0.0


def test_fully_refunded_purchase_drops_out_of_suggestions(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    purchase = api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -20,
                    "profile_id": mom, "credit_card_id": card, "is_paid_back": True}).json()["id"]
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-06", "amount": 20,
                    "profile_id": mom, "credit_card_id": card, "refund_for_id": purchase})
    assert api.client.get("/api/buckets/reimbursements").json() == []


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


def test_allocate_only_selected_transactions(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    t1 = api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                    "profile_id": mom, "credit_card_id": card, "is_paid_back": True}).json()["id"]
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-02", "amount": -60,
                    "profile_id": mom, "credit_card_id": card, "is_paid_back": True})
    # allocate ONLY the $100 charge
    r = api.client.post("/api/buckets/allocate-reimbursement", json={
        "profile_id": mom, "credit_card_id": card, "source_bucket_id": moms,
        "dest_bucket_id": payoff, "transaction_ids": [t1]})
    assert r.status_code == 200 and r.json()["allocated"] == 100.0
    amounts = {b["id"]: float(b["current_amount"]) for b in api.client.get("/api/buckets").json()}
    assert amounts[moms] == 400.0 and amounts[payoff] == 100.0  # only $100 moved
    # the $60 charge is still suggested
    mom_sug = next(s for s in api.client.get("/api/buckets/reimbursements").json() if s["profile_id"] == mom)
    assert mom_sug["amount"] == 60.0


def test_allocating_marks_charge_paid(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    # an own, not-yet-paid card charge
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                    "profile_id": me, "credit_card_id": card})
    sug = next(s for s in api.client.get("/api/buckets/reimbursements").json() if s["profile_id"] == me)
    api.client.post("/api/buckets/allocate-reimbursement", json={
        "profile_id": me, "credit_card_id": card,
        "source_bucket_id": sug["source_bucket_id"], "dest_bucket_id": sug["dest_bucket_id"]})
    t = api.client.get("/api/transactions").json()[0]
    assert t["is_paid_back"] is True  # completing the suggestion marks it paid
    assert not any(s["profile_id"] == me for s in api.client.get("/api/buckets/reimbursements").json())


def test_allocate_blocked_when_source_short(api):
    me, mom, acct, card, moms, payoff = _setup(api)
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -700,
                    "profile_id": mom, "credit_card_id": card, "is_paid_back": True})
    # Mom's bucket only has 500
    r = api.client.post("/api/buckets/allocate-reimbursement", json={
        "profile_id": mom, "credit_card_id": card, "source_bucket_id": moms, "dest_bucket_id": payoff})
    assert r.status_code == 400


def test_account_expense_deducts_from_bucket_and_balance(api):
    api.login(*USER_A)
    pid = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    acct = api.client.post("/api/accounts", json={"name": "Ally Checking", "balance": 500}).json()["id"]
    gym = api.client.post("/api/buckets", json={"name": "Gym", "account_id": acct, "current_amount": 100}).json()["id"]
    tid = api.client.post("/api/transactions", json={"transaction_date": "2026-06-25", "amount": -40,
                    "merchant": "YouFit", "profile_id": pid, "account_id": acct}).json()["id"]
    # shows as a suggestion
    sug = api.client.get("/api/buckets/account-expenses").json()
    assert len(sug) == 1 and sug[0]["amount"] == -40.0
    # apply it to the Gym bucket
    r = api.client.post("/api/buckets/deduct-expense", json={"transaction_id": tid, "bucket_id": gym})
    assert r.status_code == 200
    amt = next(b["current_amount"] for b in api.client.get("/api/buckets").json() if b["id"] == gym)
    bal = next(a["balance"] for a in api.client.get("/api/accounts").json() if a["id"] == acct)
    assert float(amt) == 60.0 and float(bal) == 460.0  # both down by 40
    assert api.client.get("/api/buckets/account-expenses").json() == []  # cleared
    t = next(x for x in api.client.get("/api/transactions").json() if x["id"] == tid)
    assert t["is_paid_back"] is True  # accepting the suggestion settles the expense
