# Personal Finance / Credit Card Tracker

A full-stack web app for tracking credit-card spending, cashback, money owed by
different people, savings "buckets," account balances, and net worth — a cleaner,
faster alternative to managing the same data in a spreadsheet.

Built as an MVP with correctness of the data model and calculations as the first
priority.

## Features

- **Auth & multi-tenancy** — email/password sign-in (Supabase Auth); each user's
  data is private via row-level security. The frontend never touches the database
  directly — it calls the backend, which uses the service-role key.
- **Profiles** — separate people whose spending is tracked independently; they can
  share the same credit cards. Mark one as "me" for a true personal net worth.
- **Profile sharing** — share a profile read-only with another account by email
  (Google-Docs style), so they can see what they owe.
- **Credit cards** — shared across profiles; balances calculated from transactions;
  per-category cashback rules that auto-fill on the expense form; statement due
  dates with reminders; upgrade history (archive an old card, keep its data).
- **Expenses** — each belongs to a profile and a credit card *or* a bank account,
  with per-transaction cashback and a "paid back" flag. Filter by profile, card,
  category, year, paid/unpaid, and merchant search.
- **Income** — track money in (jobs, gigs, tips, gifts, cashback) per account.
- **Accounts** — manual bank/cash/investment balances; close/archive accounts
  without losing their history.
- **Buckets (envelope budgeting)** — buckets live inside an account and carve up its
  balance; move money between them, never more than the account actually holds.
- **Pay a card** — settle a card's charges by drawing from a chosen account + bucket.
- **Smart allocation** — marking a charge paid suggests moving the money from a
  per-profile default bucket into the card's payoff bucket.
- **Dashboard** — card debt, income, cashback earned/pending, bucket totals, real
  available money, net worth, owed-by-profile, debt-by-card, and upcoming-payment
  reminders. Year filter (defaults to the current year) plus "hide repayments" and
  "only my debt" toggles.
- **Data import** — one-off scripts import a full Google Sheets history (expenses +
  income) with a dry-run reconciliation before anything is written.

## Tech stack

- **Frontend:** React + Vite
- **Backend:** Python + FastAPI
- **Database:** Supabase (Postgres)

The frontend never talks to Supabase directly — it calls the FastAPI backend, which
is the only thing that connects to the database.

## Architecture

```
React (Vite)  --HTTP-->  FastAPI backend  --supabase-py-->  Supabase Postgres
  frontend/                 backend/                          (RLS on every table)
```

Row Level Security is enabled on every table with no public policies, so the public
anon key is fully locked out. The backend authenticates with the Supabase **service
role key**, which bypasses RLS.

## Project structure

```
finance-app/
├── .env.local               backend secrets (gitignored)
├── .env.example             backend env template
├── backend/
│   ├── requirements.txt
│   ├── migrations/          SQL migrations, run in order in the Supabase SQL Editor
│   └── app/
│       ├── main.py          FastAPI app + CORS + routers
│       ├── config.py        loads env vars
│       ├── database.py      Supabase client
│       ├── db_errors.py     maps DB errors to HTTP responses
│       ├── models/          Pydantic request/response models
│       ├── routers/         one file per resource + dashboard
│       └── services/        pure calculation functions
└── frontend/
    ├── .env.local           VITE_API_BASE_URL (gitignored)
    └── src/
        ├── api/client.js    fetch wrappers for the backend
        └── pages/           Dashboard, Profiles, Credit Cards, Expenses, Income,
                             Buckets, Pay a card, Accounts, Shared with me
```

## Prerequisites

- Python 3.9+ (3.11+ recommended)
- Node.js 18+
- A Supabase project

## Setup

### 1. Database

In the Supabase **SQL Editor**, run every file in `backend/migrations/` in numeric
order (`001_…` through `021_…`).

### 2. Backend environment

Copy `.env.example` to `.env.local` and fill in your values:

```
SUPABASE_URL=https://<project-ref>.supabase.co     # API URL, NOT the dashboard URL
SUPABASE_KEY=<service role key>                     # Project Settings -> API -> service_role
```

The `service_role` key is a full-access secret. It lives only in the backend and is
never exposed to the frontend. `.env.local` is gitignored.

### 3. Run the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### 4. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:5173`. (`frontend/.env.local` already points
`VITE_API_BASE_URL` at the backend.)

## How to manually test

1. **Profiles** — add two profiles.
2. **Credit Cards** — add "Chase Freedom", issuer "Chase", cashback `1.5`.
3. **Transactions** — add an unpaid purchase: merchant "Publix", Groceries, type
   Purchase, amount `52.40`, pick a profile and card, cashback `1.5`. It stores as
   `-52.40` with `+$0.79` cashback.
4. **Accounts** — add "Chase Checking", type `checking`, balance `1500`, Asset.
5. **Buckets** — add "Car insurance", saved `300`.
6. **Dashboard** — verify card debt, bucket money, liquid cash, real available money,
   and net worth. With the data above plus a `$400` unpaid charge you should see
   real available money = `$1500 − $400 − $300 = $800` and net worth = `$1100`
   (buckets do not reduce net worth).
7. Mark the transaction **paid back** — card debt drops and its cashback moves from
   pending to earned.

## Key calculations

- **Amount sign:** purchases are stored negative, refunds/income positive.
- **Card debt / amount owed:** negated sum of unpaid transaction amounts.
- **Cashback per transaction:** `-(amount × rate)`, so cashback on a purchase is
  positive. Computed by the backend.
- **Real available money:** liquid cash − card debt − bucket money.
- **Net worth:** assets − liabilities. Buckets are excluded.

## Security notes

- Secrets are stored in environment variables only; `.env.local` files are gitignored.
- The service role key is backend-only and never shipped to the frontend.
- RLS is enabled on all tables so the public anon key cannot read or write data.

## Known limitations / future work

- Each charge tracks two independent states: **reimbursed** (a person paid you
  back — you toggle it) and **paid to bank** (you paid the card issuer — set by
  Pay-a-card). Card debt / net worth use "paid to bank"; "owed by profile" and
  the bucket-allocation banner use "reimbursed."
- Reminders are in-app (shown on the dashboard); no email/push yet.
- Not yet built (deferred): charts / "finance wrapped" summaries, a dedicated
  monthly view, Plaid/bank sync (balances are tracked manually by choice),
  recurring expenses, CSV export, dark mode.
