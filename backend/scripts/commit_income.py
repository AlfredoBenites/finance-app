"""Write half of the income import — NON-DESTRUCTIVE.

Finds the user, creates any accounts that don't exist yet (by name), then
bulk-inserts the income rows. Leaves all existing data untouched.
"""
from app.database import supabase


def _find_owner_id(email):
    target = email.strip().lower()
    users = supabase.auth.admin.list_users()
    users = users if isinstance(users, list) else getattr(users, "users", [])
    for u in users:
        if (getattr(u, "email", "") or "").lower() == target:
            return u.id
    raise SystemExit(f"ERROR: no app user found with email {email!r}.")


def commit(planned, account_types, email):
    owner = _find_owner_id(email)
    print(f"\nMatched user {email} -> {owner}")

    # Existing accounts by name (don't duplicate).
    existing = supabase.table("accounts").select("id,name").eq("owner_id", owner).execute().data
    acct_ids = {a["name"]: a["id"] for a in existing}

    needed = sorted({p["account"] for p in planned})
    created = 0
    for name in needed:
        if name not in acct_ids:
            res = supabase.table("accounts").insert({
                "owner_id": owner, "name": name,
                "account_type": account_types.get(name, "cash"), "balance": "0", "is_asset": True,
            }).execute()
            acct_ids[name] = res.data[0]["id"]
            created += 1
    print(f"Accounts: {len(existing)} existed, created {created} new")

    rows = [{
        "owner_id": owner,
        "income_date": p["income_date"],
        "source": p["source"],
        "category": p["category"],
        "amount": str(p["amount"]),
        "account_id": acct_ids[p["account"]],
        "notes": p["notes"],
    } for p in planned]
    inserted = 0
    for i in range(0, len(rows), 500):
        supabase.table("income").insert(rows[i:i + 500]).execute()
        inserted += len(rows[i:i + 500])
    print(f"\nDONE — inserted {inserted} income entries for {email}.")
