"""Import income from data/income.csv.

DRY RUN (default): reads the CSV and prints a reconciliation (by type, by
account, exclusions) with NO DB writes.

COMMIT (--commit --email you@...): NON-DESTRUCTIVE — adds income rows and
creates any missing accounts. Does NOT touch existing expenses/profiles/cards.

income.csv columns: Month, Date, Type(="Payment Method"), Amount(+), Dest(="Category"), Notes
Rules (per product decisions): exclude transfers, verification micro-deposits,
and small purchase refunds; include earned income, repayments, and financial-aid
refunds. Account is mandatory; messy destinations fall back to an 'Other' account.
"""
import argparse
import collections
import csv
import os
import sys
from datetime import datetime
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
INCOME_CSV = os.path.join(REPO_ROOT, "data", "income.csv")

EXCLUDE_TYPES = {"transfer", "temporary", "amazon refund"}  # transfers, verification, purchase refund

# Income "Payment Method" (type) -> our income category.
TYPE_CATEGORY = {
    "refund": "Financial Aid", "mdc refund": "Financial Aid", "scholarship": "Financial Aid",
    "stipend": "Job", "afrl payment": "Job", "afrl stipend": "Job", "payroll": "Job",
    "chase bonus": "Bonus", "bmo bonus": "Bonus", "ally referral": "Bonus",
    "gift": "Gift", "dad's gift": "Gift",
    "cashback": "Cashback", "interest": "Interest",
    "work w dad": "Side Gig", "prizepicks": "Other", "wells fargo": "Other",
}

# Destination ("Category") -> account name. Unmapped -> 'Other' (flagged).
ACCOUNT_MAP = {
    "cash": "Cash", "ally": "Ally Checking", "ally checking": "Ally Checking",
    "ally checkings": "Ally Checking", "ally hysa": "Ally HYSA", "wells fargo": "Wells Fargo",
    "robinhood": "Robinhood", "paypal": "PayPal", "bmo": "BMO Savings", "chase": "Chase Checking",
    "roth ira": "Roth IRA", "cashapp": "CashApp", "cash app": "CashApp", "venmo": "Venmo",
}
ACCOUNT_TYPE = {
    "Cash": "cash", "Ally Checking": "checking", "Ally HYSA": "savings", "Wells Fargo": "checking",
    "Robinhood": "investment", "PayPal": "cash", "BMO Savings": "savings", "Chase Checking": "checking",
    "Roth IRA": "roth_ira", "CashApp": "cash", "Venmo": "cash", "Other": "cash",
}


def money(s):
    s = (s or "").strip().replace("$", "").replace(",", "")
    if s in ("", "-"):
        return None
    try:
        return Decimal(s)
    except Exception:
        return None


def classify_payment(notes):
    n = (notes or "").lower()
    if "tip" in n:
        return "Tip"
    if "doodycalls" in n or "sold" in n or "ebay" in n:
        return "Side Gig"
    if "interest" in n:
        return "Interest"
    if "boost" in n or "payout" in n or "gold" in n:
        return "Cashback"
    if "paid back" in n or "from dad" in n or "from mom" in n:
        return "Repayment"
    if any(k in n for k in ("interview", "hackerrank", "research", "handshake", "codepath")):
        return "Job"
    return "Other"


def classify(rows):
    planned, skips = [], collections.Counter()
    skip_sum = collections.defaultdict(Decimal)
    for r in rows:
        r = r + [""] * (6 - len(r)) if len(r) < 6 else r
        d, typ, amt, dest, notes = r[1].strip(), r[2].strip(), money(r[3]), r[4].strip(), r[5].strip()
        if amt is None:
            skips["blank/unparseable"] += 1
            continue
        tl = typ.lower()
        if tl in EXCLUDE_TYPES:
            skips[tl] += 1; skip_sum[tl] += amt
            continue
        # category
        if tl == "payment":
            category = classify_payment(notes)
        elif tl.endswith("payment") or tl.endswith("'s payment"):
            category = "Repayment"
        else:
            category = TYPE_CATEGORY.get(tl, "Other")
        # account
        account = ACCOUNT_MAP.get(dest.lower(), "Other")
        try:
            date = datetime.strptime(d, "%m/%d/%Y").strftime("%Y-%m-%d")
        except ValueError:
            try:
                date = datetime.strptime(d + "/2025", "%m/%d/%Y").strftime("%Y-%m-%d")
            except ValueError:
                skips["unparseable date"] += 1
                continue
        planned.append({"income_date": date, "source": typ, "category": category,
                        "amount": amt, "account": account, "notes": notes or None,
                        "dest_raw": dest})
    return planned, skips, skip_sum


def report(planned, skips, skip_sum):
    total = sum(p["amount"] for p in planned)
    print("\n" + "#" * 60)
    print("INCOME DRY RUN — nothing written (non-destructive: only ADDS income).")
    print("#" * 60)
    print(f"\nWILL IMPORT: {len(planned)} income entries, total ${total:,.2f}")
    print("\n=== Excluded ===")
    for k, v in skips.items():
        s = f"  (${skip_sum[k]:,.2f})" if k in skip_sum else ""
        print(f"  {v:4d}  {k}{s}")
    print("\n=== By income type ===")
    by = collections.defaultdict(lambda: [0, Decimal(0)])
    for p in planned:
        by[p["category"]][0] += 1; by[p["category"]][1] += p["amount"]
    for k, (n, s) in sorted(by.items(), key=lambda x: -x[1][1]):
        print(f"  {n:4d}  ${s:>10,.2f}  {k}")
    print("\n=== Into account ===")
    by = collections.defaultdict(lambda: [0, Decimal(0)])
    for p in planned:
        by[p["account"]][0] += 1; by[p["account"]][1] += p["amount"]
    for k, (n, s) in sorted(by.items(), key=lambda x: -x[1][1]):
        print(f"  {n:4d}  ${s:>10,.2f}  {k}")
    other = sorted({p["dest_raw"] for p in planned if p["account"] == "Other"})
    if other:
        print(f"\n  (destinations mapped to 'Other' account: {', '.join(other)})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--email")
    args = ap.parse_args()
    with open(INCOME_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))[1:]
    planned, skips, skip_sum = classify(rows)
    report(planned, skips, skip_sum)
    if not args.commit:
        print("\n(dry run — re-run with --commit --email <you> to load)")
        return
    if not args.email:
        sys.exit("ERROR: --commit requires --email")
    from scripts.commit_income import commit
    commit(planned, ACCOUNT_TYPE, args.email)


if __name__ == "__main__":
    main()
