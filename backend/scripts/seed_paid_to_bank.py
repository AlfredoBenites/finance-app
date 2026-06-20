"""Seed the `paid_to_bank` flag for a user who pays each statement in full.

For each card: charges through its most recent CLOSED statement are paid to the
bank; the current open cycle is not. Cards with a statement_day use it; cards
without one assume everything before the current month is paid.

Run AFTER migration 022 has added the column. Non-destructive to is_paid_back
(reimbursement) — it only sets paid_to_bank. Safe to re-run.

Usage (from backend/, venv active):
    python scripts/seed_paid_to_bank.py --email you@example.com
    python scripts/seed_paid_to_bank.py --email you@example.com --dry-run
"""
import argparse
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    from app.database import supabase
    from app.services import calculations as calc

    target = args.email.strip().lower()
    users = supabase.auth.admin.list_users()
    users = users if isinstance(users, list) else getattr(users, "users", [])
    owner = next((u.id for u in users if (getattr(u, "email", "") or "").lower() == target), None)
    if owner is None:
        sys.exit(f"ERROR: no app user found with email {args.email!r}.")

    today = date.today()
    cards = supabase.table("credit_cards").select("id, name, statement_day").eq("owner_id", owner).execute().data

    for c in cards:
        sd = c.get("statement_day")
        if sd:
            _open, close = calc.statement_window(int(sd), today)
            cutoff = close.isoformat()
            basis = f"statement closes {sd} -> paid through {cutoff}"
        else:
            cutoff = today.replace(day=1).isoformat()  # assume prior months paid
            basis = f"no statement day -> paid through end of last month (<{cutoff})"

        rows = (
            supabase.table("transactions")
            .select("id, transaction_date, amount")
            .eq("owner_id", owner)
            .eq("credit_card_id", c["id"])
            .lte("transaction_date", cutoff)
            .execute()
            .data
        )
        owed_rows = (
            supabase.table("transactions")
            .select("amount")
            .eq("owner_id", owner)
            .eq("credit_card_id", c["id"])
            .gt("transaction_date", cutoff)
            .execute()
            .data
        )
        owed = -sum((float(r["amount"]) for r in owed_rows), 0.0)
        print(f"{c['name']}: {basis}")
        print(f"  marking {len(rows)} charge(s) paid_to_bank; bank debt left (open cycle): ${owed:,.2f}")
        if not args.dry_run and rows:
            supabase.table("transactions").update({"paid_to_bank": True}).eq("owner_id", owner).eq(
                "credit_card_id", c["id"]
            ).lte("transaction_date", cutoff).execute()

    print("\nDONE" + (" (dry run — nothing written)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
