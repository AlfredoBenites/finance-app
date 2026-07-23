# Finance Tracker

A full-stack personal-finance web app for tracking credit-card spending,
cashback, money other people owe you, envelope-style budgets, account balances,
and net worth — everything I used to keep in a sprawling Google Sheet, in one
place that does the math for me.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

**Live demo:** _coming soon_ &nbsp;·&nbsp; **Tech:** React + FastAPI + Supabase

---

## Why I built it

I was tracking my whole financial life in a spreadsheet — credit-card balances,
cashback per card, who owed me money, savings goals, net worth — and it had
grown past a thousand rows and stopped being trustworthy. Small mistakes crept
in, the formulas were fragile, and it couldn't answer simple questions like
"where did my money actually go last month." So I rebuilt it as a real
application, with the data model and the money math as the first priority.

It's now a multi-user product: anyone can sign up, and every account's data is
fully isolated.

## Screenshots

_Screenshots coming soon._
<!-- Add images under docs/screenshots/ and embed them here, e.g.
![Dashboard](docs/screenshots/dashboard.png)
Use a demo account with seeded (non-real) data — never real financial data. -->

## Features

- **Multi-user with strict data isolation** — email/password sign-in via
  Supabase Auth. Every table is scoped by owner, and the frontend never touches
  the database directly. Switch between multiple accounts on one device without
  logging out.
- **Profiles** — track different people's spending separately (they can share the
  same cards); mark one profile as "me" for a true personal net worth. Share a
  profile read-only with someone by email so they can see what they owe.
- **Credit cards** — shared across profiles, balances derived from transactions,
  per-category cashback rules that auto-fill on the expense form, statement/due
  days with reminders, and per-card color used throughout the UI.
- **Expenses** — each belongs to a profile and a card *or* a bank account, with
  per-transaction cashback and a "paid back" flag. Refunds link to the purchase
  they offset; a group purchase splits one receipt proportionally (tax, tip, and
  fees included) across everyone involved.
- **Income, accounts, and envelope budgeting** — track money in per account;
  keep manual bank/cash/investment balances; carve an account's balance into
  "buckets" and move money between them, never more than the account holds.
- **Pay a card** — settle a card by drawing from a chosen account and bucket.
  Reconciles the difference between the date you enter a charge and the date the
  issuer actually posts it, so a statement matches reality near the cycle edge.
- **Investments** — buy/sell holdings against an account's buying power, with a
  trade history and live stock/crypto prices (manual refresh). Net worth values
  an investment account as cash plus holdings.
- **Dashboard & insights** — real available money, net worth, cashback, debt by
  card, owed by profile, and upcoming payments; plus spending charts (by month,
  by category with drill-down into the underlying transactions, and by what paid
  for it).
- **Built for real use** — dark mode, a one-tap "hide amounts" privacy mask, a
  printable statement you can share, and a fully responsive layout for the phone.

## Tech stack

| Layer     | Choice                                                       |
| --------- | ------------------------------------------------------------ |
| Frontend  | React 18 + Vite, Tailwind CSS v4, React Router v7, Recharts  |
| Backend   | Python 3.12 + FastAPI                                        |
| Database  | Supabase (Postgres) with Row-Level Security                  |
| Auth      | Supabase Auth (frontend), Bearer-token validation (backend)  |

## Architecture

```
React (Vite)  ──HTTP──>  FastAPI backend  ──supabase-py──>  Supabase Postgres
  frontend/                  backend/                        (RLS on every table)
```

The frontend never talks to the database directly — it calls the FastAPI
backend, which is the only thing holding the privileged database key. Row-Level
Security is on for every table with no public policy, so the public anon key
(the one shipped to the browser for login) cannot read or write application
data at all.

## Engineering highlights

A few problems that were more interesting than they first looked:

- **Multi-tenant isolation as an invariant.** Every read and write is scoped to
  the signed-in user's id, and the database enforces it independently via RLS.
  The design means a bug in one endpoint can't leak another user's data.
- **Pagination correctness.** PostgREST caps a single query at 1,000 rows.
  Wholesale fetches page through that limit; skipping it silently dropped a
  user's oldest transactions once their history grew past the cap — a bug that
  looked like correct data until you went looking for it.
- **Statement accuracy.** Card issuers bill by *posting* date, not the date you
  enter a charge, so charges near a cycle's edge drift onto the wrong statement.
  The app reconciles this, nets linked refunds onto the right cycle, and keeps a
  manual override as an escape hatch.
- **Money math you can trust.** Calculations run in integer cents to avoid
  floating-point drift, live in pure, separately tested functions, and are
  covered by a backend test suite (140 tests).

## Getting started

**Prerequisites:** Node 18+, Python 3.11+, and a Supabase project.

### 1. Database

In the Supabase SQL Editor, run every file in `backend/migrations/` in numeric
order.

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env.local # then fill in your Supabase values
uvicorn app.main:app --reload
```

API runs at `http://localhost:8000` (interactive docs at `/docs`).

### 3. Frontend

```bash
cd frontend
npm install
# create frontend/.env.local with VITE_API_BASE_URL, VITE_SUPABASE_URL,
# and VITE_SUPABASE_ANON_KEY pointing at your backend + Supabase project
npm run dev
```

App runs at `http://localhost:5173`.

## Testing

```bash
cd backend
pytest tests -q      # 140 tests: auth, ownership, calculations, endpoints
```

## Project structure

```
finance-app/
├── backend/
│   ├── migrations/          SQL migrations, run in order in Supabase
│   ├── tests/               pytest suite
│   └── app/
│       ├── main.py          FastAPI app, CORS, routers
│       ├── routers/         one module per resource + dashboard
│       ├── models/          Pydantic request/response models
│       └── services/        pure calculation functions
└── frontend/
    └── src/
        ├── api/client.js    fetch wrappers for the backend
        ├── components/      design-system UI + per-feature components
        └── pages/           Dashboard, Insights, Profiles, Expenses, Income,
                             Buckets, Accounts, Credit Cards, Pay a card,
                             Investments, Shared with me
```

## Roadmap

- Optional bank connection (Plaid/Teller) so statements reconcile automatically
- Rolling statement balances with interest and late fees
- CSV export and a monthly summary view

## License

[MIT](LICENSE) © Alfredo Benites
