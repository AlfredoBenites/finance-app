"""Import historical expenses from the Google Sheets CSV.

DRY RUN (default): reads data/expenses.csv + data/category_map.csv and prints a
full reconciliation (counts/sums per card, account, category, profile, paid
status, and everything excluded) WITHOUT touching the database. No email needed.

COMMIT (--commit --email you@example.com): wipes the user's existing rows, then
seeds profiles, cards, accounts, categories, merchant defaults, and inserts the
transactions. Everything is owner-scoped to the matched user.

Usage (from backend/, with the venv active):
    python scripts/import_expenses.py                 # dry run
    python scripts/import_expenses.py --commit --email you@example.com
"""
import argparse
import collections
import csv
import os
import sys
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

# Make the `app` package importable when run as a plain script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXPENSES = os.path.join(REPO_ROOT, "data", "expenses.csv")
CATEGORY_MAP = os.path.join(REPO_ROOT, "data", "category_map.csv")

CARD_MAP = {
    "discover it student cc": "Discover it Student",
    "amex blue cash everyday cc": "Amex Blue Cash Everyday",
    "robinhood gold cc": "Robinhood Gold",
    "chase freedom unlimited cc": "Chase Freedom Unlimited",
    "capital one quicksilver cc": "Capital One Quicksilver",
    "capital one platinum cc": "Capital One Platinum",
}
# Non-card payment methods -> (account name, account_type)
ACCOUNT_MAP = {
    "ally": ("Ally Checking", "checking"),
    "ally checking": ("Ally Checking", "checking"),
    "ally hysa": ("Ally HYSA", "savings"),
    "wells fargo": ("Wells Fargo", "checking"),
    "wf": ("Wells Fargo", "checking"),
    "bmo savings": ("BMO Savings", "savings"),
    "chase": ("Chase Checking", "checking"),
    "paypal": ("PayPal", "cash"),
    "cash": ("Cash", "cash"),
    "cashapp": ("CashApp", "cash"),
    "venmo": ("Venmo", "cash"),
    "robinhood": ("Robinhood", "investment"),
}


def money(s):
    s = (s or "").strip().replace("$", "").replace(",", "")
    if s in ("", "-"):
        return None
    try:
        return Decimal(s)
    except Exception:
        return None


def parse_rate(s):
    s = (s or "").strip().replace("%", "")
    if not s:
        return None
    try:
        return (Decimal(s) / Decimal("100")).quantize(Decimal("0.0001"))
    except Exception:
        return None


def make_date_resolver():
    """Stateful date parser. Handles full dates (m/d/Y) and year-less ones (m/d)
    by carrying the year forward from prior rows (the file is chronological) and
    bumping it when the month rolls over (e.g. Dec -> Jan)."""
    ctx = {"year": None, "month": None}

    def resolve(s):
        s = (s or "").strip()
        if not s:
            return None
        for fmt in ("%m/%d/%Y", "%m/%d/%y"):
            try:
                d = datetime.strptime(s, fmt)
                ctx["year"], ctx["month"] = d.year, d.month
                return d.strftime("%Y-%m-%d")
            except ValueError:
                pass
        parts = s.split("/")
        if len(parts) < 2:
            return None
        try:
            m, day = int(parts[0]), int(parts[1])
        except ValueError:
            return None
        year = ctx["year"] or 2025
        if ctx["month"] is not None and m < ctx["month"]:
            year += 1  # rolled into a new year
        try:
            out = datetime(year, m, day).strftime("%Y-%m-%d")
        except ValueError:
            return None
        ctx["year"], ctx["month"] = year, m
        return out

    return resolve


def load_category_map():
    mp = {}
    with open(CATEGORY_MAP, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            mp[row["merchant"].strip().lower()] = row["category"].strip()
    return mp


def classify(rows, cat_map):
    """Return (planned, skips) where planned is a list of transaction dicts."""
    planned = []
    skips = collections.Counter()
    skip_sum = collections.defaultdict(Decimal)
    resolve_date = make_date_resolver()
    for r in rows:
        r = r + [""] * (8 - len(r)) if len(r) < 8 else r
        method = r[2].strip()
        amount = money(r[3])
        merchant = r[4].strip()
        notes = r[5].strip()
        paid_raw = r[7].strip().upper()
        # Resolve date for every row so the year carries forward continuously.
        date = resolve_date(r[1])

        if amount is None and not merchant:
            skips["blank row"] += 1
            continue
        if amount is None:
            skips["unparseable amount"] += 1
            continue
        if merchant.lower() == "transfer":
            skips["transfer"] += 1; skip_sum["transfer"] += amount
            continue
        category = cat_map.get(merchant.lower(), "Other")
        if category == "EXCLUDE":
            skips["excluded (payment/fee/bucket)"] += 1; skip_sum["excluded"] += amount
            continue
        if date is None:
            skips["unparseable date"] += 1
            continue

        is_card = "cc" in method.lower()
        card = CARD_MAP.get(method.lower()) if is_card else None
        account = None
        if not is_card:
            account = ACCOUNT_MAP.get(method.lower(), (method or "Unknown", "cash"))[0]

        rate = parse_rate(r[6]) if is_card else None
        cashback = (-amount * rate).quantize(Decimal("0.01"), ROUND_HALF_UP) if rate is not None else None
        profile = "Mom" if "mom" in notes.lower() else "Alfredo"
        is_paid = not (paid_raw == "NOT PAID" or "not paid" in notes.lower())

        planned.append({
            "transaction_date": date, "merchant": merchant or None, "category": category,
            "amount": amount, "profile": profile, "card": card, "account": account,
            "cashback_rate": rate, "cashback_amount": cashback,
            "is_paid_back": is_paid, "notes": notes or None,
        })
    return planned, skips, skip_sum


def report(planned, skips, skip_sum, cat_map):
    def section(title): print(f"\n=== {title} ===")
    total = sum(p["amount"] for p in planned)
    print("\n" + "#" * 64)
    print("DRY RUN — nothing written. Verify these against your sheet.")
    print("#" * 64)
    print(f"\nWILL IMPORT: {len(planned)} transactions, total ${total:,.2f}")

    section("Excluded (NOT imported)")
    for k, v in skips.items():
        extra = f"  (${skip_sum[k.split()[0]]:,.2f})" if k.split()[0] in skip_sum else ""
        print(f"  {v:4d}  {k}{extra}")

    section("By payment source — CARDS")
    by = collections.defaultdict(lambda: [0, Decimal(0)])
    for p in planned:
        if p["card"]:
            by[p["card"]][0] += 1; by[p["card"]][1] += p["amount"]
    for k, (n, s) in sorted(by.items()): print(f"  {n:4d}  ${s:>11,.2f}  {k}")

    section("By payment source — ACCOUNTS (non-card)")
    by = collections.defaultdict(lambda: [0, Decimal(0)])
    for p in planned:
        if p["account"]:
            by[p["account"]][0] += 1; by[p["account"]][1] += p["amount"]
    for k, (n, s) in sorted(by.items()): print(f"  {n:4d}  ${s:>11,.2f}  {k}")

    section("By profile")
    by = collections.defaultdict(lambda: [0, Decimal(0), Decimal(0)])
    for p in planned:
        by[p["profile"]][0] += 1; by[p["profile"]][1] += p["amount"]
        if not p["is_paid_back"]: by[p["profile"]][2] += -p["amount"]
    for k, (n, s, owed) in sorted(by.items()):
        print(f"  {k:8s}  {n:4d} txns  spent ${-s:,.2f}  still-owed ${owed:,.2f}")

    section("Paid status")
    paid = sum(1 for p in planned if p["is_paid_back"]); unpaid = len(planned) - paid
    print(f"  paid back: {paid}   unpaid (NOT PAID): {unpaid}")

    section("By category")
    by = collections.defaultdict(lambda: [0, Decimal(0)])
    for p in planned:
        by[p["category"]][0] += 1; by[p["category"]][1] += p["amount"]
    for k, (n, s) in sorted(by.items(), key=lambda x: x[1][1]):
        print(f"  {n:4d}  ${-s:>10,.2f}  {k}")

    cats = sorted({c for c in cat_map.values() if c != "EXCLUDE"})
    cards = sorted({p["card"] for p in planned if p["card"]})
    accts = sorted({p["account"] for p in planned if p["account"]})
    section("Will be created on commit")
    print(f"  profiles: Alfredo, Mom")
    print(f"  cards ({len(cards)}): {', '.join(cards)}")
    print(f"  accounts ({len(accts)}): {', '.join(accts)}")
    print(f"  categories ({len(cats)}) + {len([m for m,c in cat_map.items() if c!='EXCLUDE'])} merchant defaults")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true", help="actually write to the DB")
    ap.add_argument("--email", help="app signup email (required with --commit)")
    args = ap.parse_args()

    cat_map = load_category_map()
    with open(EXPENSES, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))[1:]
    planned, skips, skip_sum = classify(rows, cat_map)
    report(planned, skips, skip_sum, cat_map)

    if not args.commit:
        print("\n(dry run — re-run with --commit --email <you> to load)")
        return

    if not args.email:
        sys.exit("ERROR: --commit requires --email")
    from scripts.commit_import import commit  # separate module does the writes
    commit(planned, cat_map, args.email)


if __name__ == "__main__":
    main()
