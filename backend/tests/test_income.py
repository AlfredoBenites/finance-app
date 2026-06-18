"""Endpoint tests for income."""
USER_A = ("user-a", "a@example.com")
USER_B = ("user-b", "b@example.com")


def test_create_and_list_income(api):
    api.login(*USER_A)
    r = api.client.post(
        "/api/income",
        json={"income_date": "2026-06-01", "source": "DoodyCalls", "category": "Side Gig",
              "amount": 240, "account_id": "acct-1"},
    )
    assert r.status_code == 201
    rows = api.client.get("/api/income").json()
    assert len(rows) == 1
    assert rows[0]["source"] == "DoodyCalls"


def test_income_requires_account(api):
    api.login(*USER_A)
    r = api.client.post(
        "/api/income", json={"income_date": "2026-06-01", "source": "Tip", "amount": 20}
    )
    assert r.status_code == 422  # account_id is required


def test_income_scoped_per_user(api):
    api.login(*USER_A)
    api.client.post("/api/income", json={"income_date": "2026-06-01", "source": "Tip",
                                         "amount": 20, "account_id": "acct-1"})
    api.login(*USER_B)
    assert api.client.get("/api/income").json() == []


def test_income_shows_in_dashboard_total(api):
    api.login(*USER_A)
    api.client.post("/api/income", json={"income_date": "2026-06-01", "source": "Job",
                                         "amount": 1000, "account_id": "acct-1"})
    api.client.post("/api/income", json={"income_date": "2026-06-02", "source": "Tip",
                                         "amount": 50, "account_id": "acct-1"})
    assert api.client.get("/api/dashboard").json()["total_income"] == 1050.0


def test_dashboard_year_scopes_income(api):
    api.login(*USER_A)
    api.client.post("/api/income", json={"income_date": "2025-05-01", "source": "Old",
                                         "amount": 100, "account_id": "acct-1"})
    api.client.post("/api/income", json={"income_date": "2026-05-01", "source": "New",
                                         "amount": 200, "account_id": "acct-1"})
    assert api.client.get("/api/dashboard?year=2026").json()["total_income"] == 200.0
    assert api.client.get("/api/dashboard?year=2025").json()["total_income"] == 100.0
    assert api.client.get("/api/dashboard").json()["total_income"] == 300.0


def test_delete_income(api):
    api.login(*USER_A)
    iid = api.client.post(
        "/api/income", json={"income_date": "2026-06-01", "source": "Gift",
                             "amount": 8, "account_id": "acct-1"}
    ).json()["id"]
    assert api.client.delete(f"/api/income/{iid}").status_code == 204
    assert api.client.get("/api/income").json() == []
