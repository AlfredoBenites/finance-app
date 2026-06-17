"""Helpers for turning low-level Postgres errors into clean HTTP responses."""
from postgrest.exceptions import APIError

# Postgres error code for a foreign-key violation (e.g. deleting a profile
# that still has transactions pointing at it).
FOREIGN_KEY_VIOLATION = "23503"


def is_foreign_key_violation(error: APIError) -> bool:
    return getattr(error, "code", None) == FOREIGN_KEY_VIOLATION
