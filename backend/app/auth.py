"""Authentication dependency.

The frontend logs in via Supabase Auth and sends the resulting access token as
`Authorization: Bearer <token>` on every request. This dependency validates that
token with Supabase and returns the current user. Use it with Depends() to require
a logged-in user and to scope data by user id.
"""
from typing import Optional

from fastapi import Depends, Header, HTTPException

from app.database import supabase


def get_current_user(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.split(" ", 1)[1].strip()
    try:
        response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = getattr(response, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


def get_current_user_id(user=Depends(get_current_user)) -> str:
    """Convenience dependency that returns just the user's id."""
    return user.id
