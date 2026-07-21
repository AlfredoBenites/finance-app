"""Test fixtures: an in-memory fake of the Supabase client + an auth-overridden
TestClient.

We don't hit a real database. Instead we replace supabase.table(...) with a fake
query builder that stores rows in dicts and honors .eq() filters — so tests of
per-user owner scoping and sharing authorization actually verify the filtering,
not a mock that always returns everything.

Auth is handled by overriding the get_current_user(_id) dependencies, so no real
token validation happens; tests switch users via harness.login(...).
"""
import uuid

import pytest
from postgrest.exceptions import APIError

import app.database as database
from app.auth import get_current_user, get_current_user_id
from app.main import app

FIXED_TS = "2026-01-01T00:00:00+00:00"


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """Mimics the subset of the postgrest query builder the app uses."""

    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._op = "select"
        self._payload = None
        self._eq = []
        self._like = []  # (col, needle) ANDed
        self._or = []  # list of OR-groups, each a list of (col, needle)
        self._range = None  # (start, end) inclusive, for pagination

    def select(self, *_args, **_kwargs):
        self._op = "select"
        return self

    def insert(self, record):
        self._op = "insert"
        self._payload = record
        return self

    def update(self, changes):
        self._op = "update"
        self._payload = changes
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, col, val):
        self._eq.append((col, val))
        return self

    def ilike(self, col, pattern):
        self._like.append((col, str(pattern).strip("%*").lower()))
        return self

    def or_(self, expr):
        group = []
        for item in expr.split(","):
            col, _op, pat = item.split(".", 2)
            group.append((col, pat.strip("%*").lower()))
        self._or.append(group)
        return self

    # Operators the app calls but these tests don't filter on — accept and ignore.
    def gte(self, *_a, **_k):
        return self

    def lt(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    @staticmethod
    def _contains(row, col, needle):
        return needle in str(row.get(col) or "").lower()

    def _matches(self, row):
        if not all(row.get(col) == val for col, val in self._eq):
            return False
        if not all(self._contains(row, c, n) for c, n in self._like):
            return False
        for group in self._or:
            if not any(self._contains(row, c, n) for c, n in group):
                return False
        return True

    def execute(self):
        rows = self._store.setdefault(self._table, [])

        if self._op == "insert":
            record = dict(self._payload)
            record.setdefault("id", str(uuid.uuid4()))
            record.setdefault("created_at", FIXED_TS)
            record.setdefault("updated_at", FIXED_TS)
            # Enforce the unique(profile_id, shared_with_email) constraint.
            if self._table == "profile_shares":
                for existing in rows:
                    if (
                        existing["profile_id"] == record["profile_id"]
                        and existing["shared_with_email"] == record["shared_with_email"]
                    ):
                        raise APIError({"code": "23505", "message": "duplicate key"})
            # Enforce unique(owner_id, name) on categories.
            if self._table == "categories":
                for existing in rows:
                    if (
                        existing["owner_id"] == record["owner_id"]
                        and existing["name"] == record["name"]
                    ):
                        raise APIError({"code": "23505", "message": "duplicate key"})
            # Enforce exactly-one-payment-source on transactions.
            if self._table == "transactions":
                cc = record.get("credit_card_id")
                ac = record.get("account_id")
                if (cc is None) == (ac is None):
                    raise APIError({"code": "23514", "message": "check violation"})
            rows.append(record)
            return _Result([record])

        matched = [r for r in rows if self._matches(r)]

        if self._op == "select":
            rows_out = list(matched)
            if self._range is not None:
                rows_out = rows_out[self._range[0]:self._range[1] + 1]
            # PostgREST never returns more than its max-rows cap, with or without
            # a range. Enforcing it here is what makes a fetch that forgets to
            # page show up as a failing test instead of only in production.
            return _Result(rows_out[: database.PAGE_SIZE])
        if self._op == "update":
            for row in matched:
                row.update(self._payload)
            return _Result(list(matched))
        if self._op == "delete":
            for row in matched:
                rows.remove(row)
            return _Result(list(matched))
        return _Result([])


class _FakeSupabase:
    def __init__(self):
        self.store = {}

    def table(self, name):
        return _Query(self.store, name)


class _FakeUser:
    def __init__(self, user_id, email):
        self.id = user_id
        self.email = email


class Harness:
    """Test handle: the HTTP client plus the current logged-in user."""

    def __init__(self, client, fake):
        self.client = client
        self.fake = fake
        self.user = {"id": "user-a", "email": "a@example.com"}

    def login(self, user_id, email):
        self.user = {"id": user_id, "email": email}


@pytest.fixture
def api(monkeypatch):
    from fastapi.testclient import TestClient

    fake = _FakeSupabase()
    # All routers share the one supabase object; patch its .table in place.
    monkeypatch.setattr(database.supabase, "table", fake.table)

    harness = Harness(client=None, fake=fake)
    # Resolve the current user at request time from the harness.
    app.dependency_overrides[get_current_user_id] = lambda: harness.user["id"]
    app.dependency_overrides[get_current_user] = lambda: _FakeUser(
        harness.user["id"], harness.user["email"]
    )

    harness.client = TestClient(app)
    yield harness
    app.dependency_overrides.clear()
