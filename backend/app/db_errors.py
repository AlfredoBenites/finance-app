"""Helpers for turning low-level Postgres errors into clean HTTP responses."""
from postgrest.exceptions import APIError

# Postgres error code for a foreign-key violation (e.g. deleting a profile
# that still has transactions pointing at it).
FOREIGN_KEY_VIOLATION = "23503"

# Unique-constraint violation (e.g. sharing a profile with the same email twice).
UNIQUE_VIOLATION = "23505"

# Check-constraint violation (e.g. a transaction with zero or two payment sources).
CHECK_VIOLATION = "23514"


def is_foreign_key_violation(error: APIError) -> bool:
    return getattr(error, "code", None) == FOREIGN_KEY_VIOLATION


def is_unique_violation(error: APIError) -> bool:
    return getattr(error, "code", None) == UNIQUE_VIOLATION


def is_check_violation(error: APIError) -> bool:
    return getattr(error, "code", None) == CHECK_VIOLATION
