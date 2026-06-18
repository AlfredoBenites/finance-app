"""Endpoint tests for authentication, per-user ownership, and profile sharing."""
from fastapi.testclient import TestClient

from app.main import app

USER_A = ("user-a", "a@example.com")
USER_B = ("user-b", "b@example.com")


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


def test_dashboard_exclude_repayments(api):
    api.login(*USER_A)
    api.client.post("/api/income", json={"income_date": "2026-06-01", "source": "Job",
                                         "amount": 1000, "category": "Job", "account_id": "a1"})
    api.client.post("/api/income", json={"income_date": "2026-06-02", "source": "Mom",
                                         "amount": 300, "category": "Repayment", "account_id": "a1"})
    assert api.client.get("/api/dashboard").json()["total_income"] == 1300.0
    assert api.client.get("/api/dashboard?exclude_repayments=true").json()["total_income"] == 1000.0


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
