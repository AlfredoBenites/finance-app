"""Single shared Supabase client for the backend.

The frontend never talks to Supabase directly — only this backend does.
"""
from typing import Optional

from supabase import Client, create_client

from app.config import settings

supabase: Client = create_client(settings.supabase_url, settings.supabase_key)

PAGE_SIZE = 1000


def fetch_all(build_query, page_size: Optional[int] = None):
    """Fetch EVERY row for a query, paging past PostgREST's max-rows cap
    (default 1000). Without this, a wholesale fetch silently drops rows once a
    table grows past the cap — e.g. the newest transactions vanish from
    calculations while the oldest ones stay.

    `build_query` is a no-arg callable that returns a FRESH query builder each
    time (a builder can't be reused after .execute()), e.g.:

        rows = fetch_all(
            lambda: supabase.table("transactions").select("*").eq("owner_id", uid)
        )

    `page_size` defaults to PAGE_SIZE, read at call time so tests can shrink the
    cap without having to insert a thousand rows to reach it.
    """
    page_size = page_size or PAGE_SIZE
    rows = []
    start = 0
    while True:
        # `id` is appended as the last sort key (the caller's own ordering still
        # wins) to make the ordering total. Paging asks for one window at a time,
        # and rows that tie on the caller's sort could otherwise come back in a
        # different order per request, which would duplicate or skip a row right
        # at a page boundary.
        chunk = build_query().order("id").range(start, start + page_size - 1).execute().data
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        start += page_size
    return rows
