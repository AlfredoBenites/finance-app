"""Endpoint tests for authentication, per-user ownership, and profile sharing."""
from fastapi.testclient import TestClient

from app.database import fetch_all, supabase
from app.main import app

USER_A = ("user-a", "a@example.com")
USER_B = ("user-b", "b@example.com")


def test_fetch_all_pages_past_the_row_cap(api):
    # fetch_all must return EVERY row, paging past PostgREST's max-rows cap —
    # otherwise wholesale fetches silently drop rows once a table grows past it.
    api.login(*USER_A)
    for i in range(5):
        api.client.post("/api/profiles", json={"name": f"P{i}"})
    rows = fetch_all(lambda: supabase.table("profiles").select("*").eq("owner_id", "user-a"), page_size=2)
    assert len(rows) == 5


# --- authentication ----------------------------------------------------------

def test_unauthenticated_request_is_rejected():
    # No dependency override here: the real auth dependency should reject it.
    client = TestClient(app)
    resp = client.get("/api/profiles")
    assert resp.status_code == 401


# --- per-user ownership ------------------------------------------------------

def test_profiles_are_scoped_to_the_creating_user(api):
    api.login(*USER_A)
    created = api.client.post("/api/profiles", json={"name": "Mom"})
    assert created.status_code == 201

    # A sees their profile.
    a_list = api.client.get("/api/profiles").json()
    assert [p["name"] for p in a_list] == ["Mom"]

    # B sees nothing of A's.
    api.login(*USER_B)
    b_list = api.client.get("/api/profiles").json()
    assert b_list == []


def test_user_cannot_read_update_or_delete_anothers_profile(api):
    api.login(*USER_A)
    profile_id = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]

    api.login(*USER_B)
    assert api.client.get(f"/api/profiles/{profile_id}").status_code == 404
    assert api.client.put(f"/api/profiles/{profile_id}", json={"name": "Hacked"}).status_code == 404
    assert api.client.delete(f"/api/profiles/{profile_id}").status_code == 404

    # And A's profile is untouched.
    api.login(*USER_A)
    assert api.client.get(f"/api/profiles/{profile_id}").json()["name"] == "Mom"


def test_profile_summary_shows_debt_per_card(api):
    api.login(*USER_A)
    pid = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    visa = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]
    amex = api.client.post("/api/credit-cards", json={"name": "Amex"}).json()["id"]
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                                               "profile_id": pid, "credit_card_id": visa})
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-02", "amount": -50,
                                               "profile_id": pid, "credit_card_id": amex})
    summary = api.client.get(f"/api/profiles/{pid}/summary").json()
    debts = {d["name"]: d["balance"] for d in summary["debt_by_card"]}
    assert debts == {"Visa": 100.0, "Amex": 50.0}


def test_profile_statement_groups_unpaid_charges_by_card(api):
    api.login(*USER_A)
    pid = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    visa = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]
    amex = api.client.post("/api/credit-cards", json={"name": "Amex"}).json()["id"]
    # two unpaid Visa charges, one unpaid Amex, and one PAID Visa charge (excluded)
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                                               "profile_id": pid, "credit_card_id": visa})
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-03", "amount": -25,
                                               "profile_id": pid, "credit_card_id": visa})
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-02", "amount": -50,
                                               "profile_id": pid, "credit_card_id": amex})
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-04", "amount": -999,
                                               "profile_id": pid, "credit_card_id": visa, "is_paid_back": True})
    st = api.client.get(f"/api/profiles/{pid}/statement").json()
    assert st["profile_name"] == "Mom"
    assert st["total_owed"] == 175.0
    owed = {c["card_name"]: c["owed"] for c in st["cards"]}
    assert owed == {"Visa": 125.0, "Amex": 50.0}
    visa_card = next(c for c in st["cards"] if c["card_name"] == "Visa")
    assert len(visa_card["transactions"]) == 2  # the paid one is excluded


def test_profile_summary_shows_cashback_per_card(api):
    api.login(*USER_A)
    pid = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    visa = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]
    # paid purchase (earned cashback) and unpaid purchase (pending) on the same card
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                                               "profile_id": pid, "credit_card_id": visa,
                                               "cashback_rate": 0.03, "is_paid_back": True})
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-02", "amount": -100,
                                               "profile_id": pid, "credit_card_id": visa,
                                               "cashback_rate": 0.03})
    cb = api.client.get(f"/api/profiles/{pid}/summary").json()["cashback_by_card"]
    assert len(cb) == 1
    assert cb[0]["name"] == "Visa"
    assert cb[0]["earned"] == 3.0
    assert cb[0]["pending"] == 3.0


def test_cashback_redirects_to_a_chosen_profile(api):
    api.login(*USER_A)
    me = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    api.client.post(f"/api/profiles/{me}/make-primary")
    mom = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    stepdad = api.client.post("/api/profiles", json={"name": "Stepdad"}).json()["id"]
    visa = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]
    # Stepdad: a paid purchase (=> $3 earned cashback) and an unpaid $50 charge (debt).
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                                               "profile_id": stepdad, "credit_card_id": visa,
                                               "cashback_rate": 0.03, "is_paid_back": True})
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-02", "amount": -50,
                                               "profile_id": stepdad, "credit_card_id": visa})

    # No redirect yet: Stepdad has his cashback; Mom/Me have none.
    assert api.client.get(f"/api/profiles/{stepdad}/summary").json()["cashback_earned"] == 3.0
    assert api.client.get(f"/api/profiles/{mom}/summary").json()["cashback_earned"] == 0.0
    assert api.client.get("/api/profiles/cashback-redirected").json() == []

    # Mom covers Stepdad's card: send his cashback to her.
    api.client.put(f"/api/profiles/{stepdad}", json={"cashback_to_profile_id": mom})

    # Stepdad STILL shows his own cashback (kept for reference); debt unchanged.
    sd = api.client.get(f"/api/profiles/{stepdad}/summary").json()
    assert sd["cashback_earned"] == 3.0
    assert {c["name"]: c["earned"] for c in sd["cashback_by_card"]} == {"Visa": 3.0}
    assert sd["total_unpaid"] == 50.0

    # Mom now shows Stepdad's cashback merged into her by-card, with no debt.
    mom_sum = api.client.get(f"/api/profiles/{mom}/summary").json()
    assert mom_sum["cashback_earned"] == 3.0
    assert {c["name"]: c["earned"] for c in mom_sum["cashback_by_card"]} == {"Visa": 3.0}
    assert mom_sum["debt_by_card"] == []

    # Redirect targets Mom (not the primary), so the Insights "to me" list is empty.
    assert api.client.get("/api/profiles/cashback-redirected").json() == []

    # Point it at the primary instead → Insights lists Stepdad.
    api.client.put(f"/api/profiles/{stepdad}", json={"cashback_to_profile_id": me})
    redirected = api.client.get("/api/profiles/cashback-redirected").json()
    assert len(redirected) == 1
    assert redirected[0]["name"] == "Stepdad"
    assert redirected[0]["earned"] == 3.0

    # Clearing the redirect removes it from the Insights list.
    api.client.put(f"/api/profiles/{stepdad}", json={"cashback_to_profile_id": None})
    assert api.client.get("/api/profiles/cashback-redirected").json() == []


def test_dashboard_upcoming_payments(api):
    api.login(*USER_A)
    pid = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    card = api.client.post("/api/credit-cards", json={"name": "Visa", "due_day": 15}).json()["id"]
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -250,
                                               "profile_id": pid, "credit_card_id": card})
    up = api.client.get("/api/dashboard").json()["upcoming_payments"]
    assert len(up) == 1
    assert up[0]["name"] == "Visa" and up[0]["amount"] == 250.0
    assert "due_date" in up[0] and "days_until" in up[0]


def test_dashboard_only_my_debt_scopes_to_primary_profile(api):
    api.login(*USER_A)
    me = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    mom = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    api.client.post(f"/api/profiles/{me}/make-primary")
    card = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]
    # $100 of my unpaid debt, $400 of Mom's unpaid debt
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                                               "profile_id": me, "credit_card_id": card})
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-02", "amount": -400,
                                               "profile_id": mom, "credit_card_id": card})
    assert api.client.get("/api/dashboard").json()["total_credit_card_debt"] == 500.0
    assert api.client.get("/api/dashboard?only_primary=true").json()["total_credit_card_debt"] == 100.0


def test_net_worth_ignores_other_profiles_charges(api):
    api.login(*USER_A)
    me = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    api.client.post(f"/api/profiles/{me}/make-primary")
    mom = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    api.client.post("/api/accounts", json={"name": "Ally", "balance": 1000})  # asset
    card = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -100,
                                               "profile_id": me, "credit_card_id": card})
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-02", "amount": -400,
                                               "profile_id": mom, "credit_card_id": card})
    d = api.client.get("/api/dashboard").json()
    # net worth always personal: 1000 assets - 100 (my card debt). Mom's 400 excluded.
    assert d["net_worth"] == 900.0
    # but you still owe the bank the full 500 (you pay the issuer everything)
    assert d["total_credit_card_debt"] == 500.0


def test_dashboard_exclude_repayments(api):
    api.login(*USER_A)
    api.client.post("/api/income", json={"income_date": "2026-06-01", "source": "Job",
                                         "amount": 1000, "category": "Job", "account_id": "a1"})
    api.client.post("/api/income", json={"income_date": "2026-06-02", "source": "Mom",
                                         "amount": 300, "category": "Repayment", "account_id": "a1"})
    assert api.client.get("/api/dashboard").json()["total_income"] == 1300.0
    assert api.client.get("/api/dashboard?exclude_repayments=true").json()["total_income"] == 1000.0


def test_card_upgrade_archives_old_and_records_history(api):
    api.login(*USER_A)
    old = api.client.post("/api/credit-cards", json={"name": "Platinum"}).json()["id"]
    new = api.client.post("/api/credit-cards", json={"name": "Quicksilver"}).json()["id"]
    r = api.client.post(f"/api/credit-cards/{old}/upgrade",
                        json={"new_card_id": new, "upgraded_on": "2026-06-01"})
    assert r.status_code == 200
    assert r.json()["is_active"] is False
    hist = api.client.get("/api/credit-cards/upgrades").json()
    assert len(hist) == 1
    assert hist[0]["old_name"] == "Platinum" and hist[0]["new_name"] == "Quicksilver"
    # the archived card's payoff bucket is removed
    buckets = api.client.get("/api/buckets").json()
    assert not any(b.get("credit_card_id") == old for b in buckets)


def test_card_payoff_bucket_shows_as_saved_without_reducing_debt(api):
    api.login(*USER_A)
    pid = api.client.post("/api/profiles", json={"name": "Me"}).json()["id"]
    card = api.client.post("/api/credit-cards", json={"name": "Visa"}).json()["id"]
    api.client.post("/api/transactions", json={"transaction_date": "2026-06-01", "amount": -500,
                                               "profile_id": pid, "credit_card_id": card})
    # set aside $200 toward this card — shown as 'saved', but the debt is unchanged
    # (paying via the Payments tab is what reduces the debt).
    api.client.post("/api/buckets", json={"name": "extra", "current_amount": 200, "credit_card_id": card})
    d = api.client.get("/api/dashboard").json()
    assert d["total_credit_card_debt"] == 500.0
    row = next(c for c in d["debt_by_card"] if c["name"] == "Visa")
    assert row["owed"] == 500.0 and row["saved"] == 200.0 and row["balance"] == 500.0


def test_dashboard_is_scoped_to_the_user(api):
    api.login(*USER_A)
    profile_id = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    api.client.post(
        "/api/transactions",
        json={
            "transaction_date": "2026-06-01",
            "amount": -400,
            "profile_id": profile_id,
            "credit_card_id": "card-1",
        },
    )
    a_dash = api.client.get("/api/dashboard").json()
    assert a_dash["total_credit_card_debt"] == 400.0

    api.login(*USER_B)
    b_dash = api.client.get("/api/dashboard").json()
    assert b_dash["total_credit_card_debt"] == 0.0


# --- profile sharing ---------------------------------------------------------

def _setup_shared_profile(api):
    """A creates a profile with one unpaid $100 charge and shares it with B."""
    api.login(*USER_A)
    profile_id = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    api.client.post(
        "/api/transactions",
        json={
            "transaction_date": "2026-06-01",
            "amount": -100,
            "profile_id": profile_id,
            "credit_card_id": "card-1",
        },
    )
    share = api.client.post(
        f"/api/profiles/{profile_id}/shares", json={"email": USER_B[1]}
    )
    assert share.status_code == 201
    return profile_id


def test_shared_with_me_shows_only_the_shared_profile(api):
    _setup_shared_profile(api)

    api.login(*USER_B)
    shared = api.client.get("/api/shared-with-me").json()
    assert len(shared) == 1
    assert shared[0]["profile_name"] == "Mom"
    assert shared[0]["total_unpaid"] == 100.0


def test_shared_user_still_cannot_open_the_profile_directly(api):
    profile_id = _setup_shared_profile(api)
    api.login(*USER_B)
    # The summary endpoint is owner-only; sharing does not grant it.
    assert api.client.get(f"/api/profiles/{profile_id}/summary").status_code == 404


def test_sharing_requires_owning_the_profile(api):
    api.login(*USER_A)
    profile_id = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]

    api.login(*USER_B)
    resp = api.client.post(
        f"/api/profiles/{profile_id}/shares", json={"email": "c@example.com"}
    )
    assert resp.status_code == 404  # B doesn't own it


def test_duplicate_share_returns_409(api):
    api.login(*USER_A)
    profile_id = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    first = api.client.post(f"/api/profiles/{profile_id}/shares", json={"email": USER_B[1]})
    assert first.status_code == 201
    second = api.client.post(f"/api/profiles/{profile_id}/shares", json={"email": USER_B[1]})
    assert second.status_code == 409


def test_revoking_a_share_removes_access(api):
    profile_id = _setup_shared_profile(api)

    api.login(*USER_A)
    shares = api.client.get(f"/api/profiles/{profile_id}/shares").json()
    assert len(shares) == 1
    assert api.client.delete(f"/api/shares/{shares[0]['id']}").status_code == 204

    api.login(*USER_B)
    assert api.client.get("/api/shared-with-me").json() == []


def test_share_email_is_normalized(api):
    """Sharing with mixed-case email is matched case-insensitively for the recipient."""
    api.login(*USER_A)
    profile_id = api.client.post("/api/profiles", json={"name": "Mom"}).json()["id"]
    api.client.post(f"/api/profiles/{profile_id}/shares", json={"email": "B@Example.com"})

    api.login(*USER_B)  # logs in as b@example.com (lowercase)
    shared = api.client.get("/api/shared-with-me").json()
    assert len(shared) == 1
