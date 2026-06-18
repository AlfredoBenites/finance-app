"""Endpoint tests for managed categories and merchant default categories."""
USER_A = ("user-a", "a@example.com")
USER_B = ("user-b", "b@example.com")


def test_create_and_list_category(api):
    api.login(*USER_A)
    assert api.client.post("/api/categories", json={"name": "Tech"}).status_code == 201
    names = [c["name"] for c in api.client.get("/api/categories").json()]
    assert names == ["Tech"]


def test_duplicate_category_returns_409(api):
    api.login(*USER_A)
    api.client.post("/api/categories", json={"name": "Tech"})
    assert api.client.post("/api/categories", json={"name": "Tech"}).status_code == 409


def test_categories_scoped_per_user(api):
    api.login(*USER_A)
    api.client.post("/api/categories", json={"name": "Tech"})
    api.login(*USER_B)
    assert api.client.get("/api/categories").json() == []


def test_merchant_default_upsert_updates_in_place(api):
    api.login(*USER_A)
    api.client.post("/api/merchant-categories", json={"merchant": "Amazon", "category": "Online Shopping"})
    api.client.post("/api/merchant-categories", json={"merchant": "Amazon", "category": "Tech"})
    rows = api.client.get("/api/merchant-categories").json()
    assert len(rows) == 1
    assert rows[0]["category"] == "Tech"


def test_merchant_defaults_scoped_per_user(api):
    api.login(*USER_A)
    api.client.post("/api/merchant-categories", json={"merchant": "Publix", "category": "Groceries"})
    api.login(*USER_B)
    assert api.client.get("/api/merchant-categories").json() == []
