"""Single shared Supabase client for the backend.

The frontend never talks to Supabase directly — only this backend does.
"""
from supabase import Client, create_client

from app.config import settings

supabase: Client = create_client(settings.supabase_url, settings.supabase_key)

PAGE_SIZE = 1000


def fetch_all(build_query, page_size: int = PAGE_SIZE):
    """Fetch EVERY row for a query, paging past PostgREST's max-rows cap
    (default 1000). Without this, a wholesale fetch silently drops rows once a
    table grows past the cap — e.g. the newest transactions vanish from
    calculations while the oldest ones stay.

    `build_query` is a no-arg callable that returns a FRESH query builder each
    time (a builder can't be reused after .execute()), e.g.:

        rows = fetch_all(
            lambda: supabase.table("transactions").select("*").eq("owner_id", uid)
        )
    """
    rows = []
    start = 0
    while True:
        chunk = build_query().range(start, start + page_size - 1).execute().data
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        start += page_size
    return rows
