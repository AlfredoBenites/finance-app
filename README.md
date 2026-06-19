# Personal Finance / Credit Card Tracker

A full-stack web app for tracking credit-card spending, cashback, money owed by
different people, savings "buckets," account balances, and net worth — a cleaner,
faster alternative to managing the same data in a spreadsheet.

Built as an MVP with correctness of the data model and calculations as the first
priority. See [`SPEC.md`](./SPEC.md) for the full product spec.

## Features

- **Profiles** — separate people whose spending is tracked independently. Profiles
  are distinct but can share the same credit cards.
- **Credit cards** — shared across profiles; balances are calculated from transactions.
- **Transactions** — each belongs to one profile and one card, with per-transaction
  cashback and a "paid me back" flag. Filter by profile, card, category, month,
  paid/unpaid, and merchant search.
- **Buckets** — money set aside for a purpose. Reduces available spending money but
  not net worth.
- **Accounts** — manually-entered bank/cash/investment balances (assets) and debts
  (liabilities).
- **Dashboard** — card debt, cashback earned/pending, bucket totals, real available
  money, net worth, plus per-profile and per-card breakdowns.

## Tech stack

- **Frontend:** React + Vite
- **Backend:** Python + FastAPI
- **Database:** Supabase (Postgres)

The frontend never talks to Supabase directly — it calls the FastAPI backend, which
is the only thing that connects to the database.

## Architecture

```
React (Vite)  --HTTP-->  FastAPI backend  --supabase-py-->  Supabase Postgres
  frontend/                 backend/                          (5 tables, RLS on)
```

Row Level Security is enabled on every table with no public policies, so the public
anon key is fully locked out. The backend authenticates with the Supabase **service
role key**, which bypasses RLS.

## Project structure

```
finance-app/
├── SPEC.md                  product spec (source of truth)
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
│       └── services/        pure calculation functions (SPEC section 9)
└── frontend/
    ├── .env.local           VITE_API_BASE_URL (gitignored)
    └── src/
        ├── api/client.js    fetch wrappers for the backend
        └── pages/           Dashboard, Profiles, Credit Cards, Transactions, Buckets, Accounts
```

## Prerequisites

- Python 3.9+ (3.11+ recommended)
- Node.js 18+
- A Supabase project

## Setup

### 1. Database

In the Supabase **SQL Editor**, run the migration files in order:

```
backend/migrations/001_create_profiles.sql
backend/migrations/002_create_credit_cards.sql
backend/migrations/003_create_transactions.sql
backend/migrations/004_create_buckets.sql
backend/migrations/005_create_accounts.sql
```

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

## Key calculations (SPEC section 9)

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

- Dashboard is global; per-profile dashboards (SPEC 7.4) are partially covered by the
  profile summary view.
- "Real available money" treats all active buckets as set-aside (no "core savings"
  exemption field yet).
- "Owed by profile" includes every profile (no is-owner flag).
- Not yet built (deferred per spec): authentication, Plaid/bank sync, recurring
  expenses, charts, CSV/Sheets import.
