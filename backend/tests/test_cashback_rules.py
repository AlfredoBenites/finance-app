"""Endpoint tests for per-category cashback rules."""
USER_A = ("user-a", "a@example.com")
USER_B = ("user-b", "b@example.com")


def _make_card(api):
    return api.client.post("/api/credit-cards", json={"name": "Chase"}).json()["id"]


def test_upsert_and_list_rule(api):
    api.login(*USER_A)
    card_id = _make_card(api)
    resp = api.client.post(
        f"/api/credit-cards/{card_id}/cashback-rules",
        json={"category": "Groceries", "rate": 0.05},
    )
    assert resp.status_code == 201

    rules = api.client.get(f"/api/credit-cards/{card_id}/cashback-rules").json()
    assert len(rules) == 1
    assert rules[0]["category"] == "Groceries"
    assert rules[0]["rate"] == "0.05"


def test_upsert_updates_existing_rule_instead_of_duplicating(api):
    api.login(*USER_A)
    card_id = _make_card(api)
    api.client.post(
        f"/api/credit-cards/{card_id}/cashback-rules",
        json={"category": "Groceries", "rate": 0.05},
    )
    api.client.post(
        f"/api/credit-cards/{card_id}/cashback-rules",
        json={"category": "Groceries", "rate": 0.03},
    )
    rules = api.client.get(f"/api/credit-cards/{card_id}/cashback-rules").json()
    assert len(rules) == 1
    assert rules[0]["rate"] == "0.03"


def test_cannot_add_rule_to_another_users_card(api):
    api.login(*USER_A)
    card_id = _make_card(api)

    api.login(*USER_B)
    resp = api.client.post(
        f"/api/credit-cards/{card_id}/cashback-rules",
        json={"category": "Gas", "rate": 0.02},
    )
    assert resp.status_code == 404


def test_rules_are_scoped_per_user(api):
    api.login(*USER_A)
    card_id = _make_card(api)
    api.client.post(
        f"/api/credit-cards/{card_id}/cashback-rules",
        json={"category": "Gas", "rate": 0.02},
    )

    api.login(*USER_B)
    assert api.client.get("/api/cashback-rules").json() == []


def test_delete_rule(api):
    api.login(*USER_A)
    card_id = _make_card(api)
    api.client.post(
        f"/api/credit-cards/{card_id}/cashback-rules",
        json={"category": "Gas", "rate": 0.02},
    )
    rule_id = api.client.get("/api/cashback-rules").json()[0]["id"]
    assert api.client.delete(f"/api/cashback-rules/{rule_id}").status_code == 204
    assert api.client.get("/api/cashback-rules").json() == []
