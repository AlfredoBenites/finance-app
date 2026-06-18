"""Create a payoff bucket for each existing credit card that doesn't have one.

New cards get a payoff bucket automatically; this backfills cards created before
that. Non-destructive and safe to re-run.

Usage (from backend/, venv active):
    python scripts/seed_card_buckets.py --email you@example.com
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", required=True)
    args = ap.parse_args()
    from app.database import supabase

    target = args.email.strip().lower()
    users = supabase.auth.admin.list_users()
    users = users if isinstance(users, list) else getattr(users, "users", [])
    owner = next((u.id for u in users if (getattr(u, "email", "") or "").lower() == target), None)
    if owner is None:
        sys.exit(f"ERROR: no app user found with email {args.email!r}.")

    cards = supabase.table("credit_cards").select("id, name").eq("owner_id", owner).execute().data
    existing = supabase.table("buckets").select("credit_card_id").eq("owner_id", owner).execute().data
    have = {b["credit_card_id"] for b in existing if b.get("credit_card_id")}

    created = 0
    for c in cards:
        if c["id"] in have:
            continue
        supabase.table("buckets").insert({
            "owner_id": owner,
            "name": f"{c['name']} payoff",
            "category": "Credit Card Payoff",
            "current_amount": "0",
            "credit_card_id": c["id"],
        }).execute()
        created += 1
        print(f"  created payoff bucket for {c['name']}")
    print(f"\nDONE — created {created} payoff bucket(s).")


if __name__ == "__main__":
    main()
