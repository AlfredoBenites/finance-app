"""Tiny helper to record a money movement for the history sections."""
from decimal import Decimal

from app.database import supabase


def log_move(user_id: str, scope: str, amount, summary: str) -> None:
    """Record a movement. scope is 'account' (account-to-account transfer) or
    'bucket' (money moved within/among buckets). Best-effort: history is not
    worth failing the actual move over."""
    try:
        supabase.table("money_moves").insert({
            "owner_id": user_id,
            "scope": scope,
            "amount": str(Decimal(str(amount))),
            "summary": summary,
        }).execute()
    except Exception:
        pass
