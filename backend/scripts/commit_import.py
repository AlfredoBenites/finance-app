"""The write half of the import — only invoked with --commit.

Finds the user by email, wipes their existing rows, seeds profiles/cards/
accounts/categories/merchant-defaults, then bulk-inserts the transactions.
"""
import csv
import os

from app.database import supabase

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CATEGORY_MAP = os.path.join(REPO_ROOT, "data", "category_map.csv")

ACCOUNT_TYPE = {
    "Ally Checking": "checking", "Ally HYSA": "savings", "Wells Fargo": "checking",
    "BMO Savings": "savings", "Chase Checking": "checking", "PayPal": "cash",
    "Cash": "cash", "CashApp": "cash", "Venmo": "cash", "Robinhood": "investment",
}
# Tables to clear for this user, in FK-safe order.
WIPE_ORDER = [
    "transactions", "profile_shares", "card_category_cashback", "merchant_categories",
    "categories", "buckets", "accounts", "credit_cards", "profiles",
]


def _find_owner_id(email):
    target = email.strip().lower()
    users = supabase.auth.admin.list_users()
    users = users if isinstance(users, list) else getattr(users, "users", [])
    for u in users:
        if (getattr(u, "email", "") or "").lower() == target:
            return u.id
    raise SystemExit(f"ERROR: no app user found with email {email!r}. Sign up first.")


def _insert_named(table, owner_id, names, extra=lambda n: {}):
    """Insert rows with a 'name' and return {name: id}."""
    out = {}
    for name in names:
        row = {"owner_id": owner_id, "name": name, **extra(name)}
        res = supabase.table(table).insert(row).execute()
        out[name] = res.data[0]["id"]
    return out


def commit(planned, cat_map, email):
    owner = _find_owner_id(email)
    print(f"\nMatched user {email} -> {owner}")

    # 1. Wipe existing rows for this user.
    print("Clearing existing data:")
    for table in WIPE_ORDER:
        res = supabase.table(table).delete().eq("owner_id", owner).execute()
        print(f"  {table}: deleted {len(res.data)}")

    # 2. Seed profiles / cards / accounts.
    profiles = _insert_named("profiles", owner, ["Me", "Mom"])
    cards = _insert_named("credit_cards", owner, sorted({p["card"] for p in planned if p["card"]}))
    accounts = _insert_named(
        "accounts", owner, sorted({p["account"] for p in planned if p["account"]}),
        extra=lambda n: {"account_type": ACCOUNT_TYPE.get(n, "cash"), "balance": "0", "is_asset": True},
    )
    print(f"Seeded {len(profiles)} profiles, {len(cards)} cards, {len(accounts)} accounts")

    # 3. Seed categories + merchant defaults (preserve original merchant case).
    cats = sorted({c for c in cat_map.values() if c != "EXCLUDE"})
    _insert_named("categories", owner, cats)
    md_rows = []
    with open(CATEGORY_MAP, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["category"].strip() != "EXCLUDE":
                md_rows.append({"owner_id": owner, "merchant": row["merchant"].strip(),
                                "category": row["category"].strip()})
    supabase.table("merchant_categories").insert(md_rows).execute()
    print(f"Seeded {len(cats)} categories, {len(md_rows)} merchant defaults")

    # 4. Bulk-insert transactions.
    txns = []
    for p in planned:
        txns.append({
            "owner_id": owner,
            "transaction_date": p["transaction_date"],
            "merchant": p["merchant"],
            "category": p["category"],
            "amount": str(p["amount"]),
            "profile_id": profiles[p["profile"]],
            "credit_card_id": cards[p["card"]] if p["card"] else None,
            "account_id": accounts[p["account"]] if p["account"] else None,
            "cashback_rate": str(p["cashback_rate"]) if p["cashback_rate"] is not None else None,
            "cashback_amount": str(p["cashback_amount"]) if p["cashback_amount"] is not None else None,
            "is_paid_back": p["is_paid_back"],
            "notes": p["notes"],
        })
    inserted = 0
    for i in range(0, len(txns), 500):
        chunk = txns[i:i + 500]
        supabase.table("transactions").insert(chunk).execute()
        inserted += len(chunk)
    print(f"\nDONE — inserted {inserted} transactions for {email}.")
