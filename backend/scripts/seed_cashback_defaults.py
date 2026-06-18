"""Seed standard cashback rates per card (published reward structures).

DRY RUN (default): prints the planned rates. COMMIT (--commit --email you@...):
sets each card's default_cashback_rate and upserts its per-category rules.
Non-destructive (updates/adds; safe to re-run). Rates are starting points — edit
in the app (especially Discover's rotating 5% category each quarter).

Usage (from backend/, venv active):
    python scripts/seed_cashback_defaults.py
    python scripts/seed_cashback_defaults.py --commit --email you@example.com
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# card name -> (default rate, {category: rate})
DEFAULTS = {
    "Amex Blue Cash Everyday": ("0.01", {"Groceries": "0.03", "Gas": "0.03", "Online Shopping": "0.03"}),
    "Chase Freedom Unlimited": ("0.015", {"Travel": "0.05", "Food": "0.03", "Health": "0.03"}),
    "Robinhood Gold": ("0.03", {"Travel": "0.05"}),
    "Capital One Quicksilver": ("0.015", {"Travel": "0.05"}),
    "Capital One Platinum": ("0.00", {}),
    # Discover it Student: 5% rotates quarterly — leave base 1%, set the bonus per quarter.
    "Discover it Student": ("0.01", {}),
}


def report():
    print("\nPlanned cashback defaults (rates as %):")
    for card, (base, rules) in DEFAULTS.items():
        extra = ", ".join(f"{c} {float(r) * 100:g}%" for c, r in rules.items()) or "—"
        print(f"  {card:28s} base {float(base) * 100:g}%   bonuses: {extra}")


def commit(email):
    from app.database import supabase

    target = email.strip().lower()
    users = supabase.auth.admin.list_users()
    users = users if isinstance(users, list) else getattr(users, "users", [])
    owner = next((u.id for u in users if (getattr(u, "email", "") or "").lower() == target), None)
    if owner is None:
        sys.exit(f"ERROR: no app user found with email {email!r}.")
    print(f"\nMatched user {email} -> {owner}")

    cards = supabase.table("credit_cards").select("id, name").eq("owner_id", owner).execute().data
    by_name = {c["name"]: c["id"] for c in cards}

    for name, (base, rules) in DEFAULTS.items():
        card_id = by_name.get(name)
        if not card_id:
            print(f"  (skip) no card named {name!r}")
            continue
        supabase.table("credit_cards").update({"default_cashback_rate": base}).eq(
            "id", card_id
        ).eq("owner_id", owner).execute()
        for category, rate in rules.items():
            existing = (
                supabase.table("card_category_cashback")
                .select("id")
                .eq("owner_id", owner)
                .eq("card_id", card_id)
                .eq("category", category)
                .execute()
            )
            if existing.data:
                supabase.table("card_category_cashback").update({"rate": rate}).eq(
                    "id", existing.data[0]["id"]
                ).execute()
            else:
                supabase.table("card_category_cashback").insert({
                    "owner_id": owner, "card_id": card_id, "category": category, "rate": rate,
                }).execute()
        print(f"  set {name}: base {base}, {len(rules)} category rule(s)")
    print("\nDONE.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--email")
    args = ap.parse_args()
    report()
    if not args.commit:
        print("\n(dry run — re-run with --commit --email <you> to apply)")
        return
    if not args.email:
        sys.exit("ERROR: --commit requires --email")
    commit(args.email)


if __name__ == "__main__":
    main()
