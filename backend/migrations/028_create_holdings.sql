-- Migration 028: investment holdings (stocks / crypto) inside an account.
--
-- Each holding is a number of shares of a symbol in an investment account. Its
-- value = shares x price, where price is the manual override if set, else the
-- last fetched price (Finnhub for stocks, CoinGecko for crypto). An account's
-- value for net worth is the sum of its holdings (if it has any).
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

create table if not exists holdings (
    id               uuid primary key default gen_random_uuid(),
    owner_id         uuid not null references auth.users (id) on delete cascade,
    account_id       uuid not null references accounts (id) on delete cascade,
    symbol           text not null,
    kind             text not null default 'stock' check (kind in ('stock', 'crypto')),
    shares           numeric(20, 8) not null default 0,
    last_price       numeric(20, 8),
    manual_price     numeric(20, 8),
    price_updated_at timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists holdings_owner_id_idx on holdings (owner_id);

alter table holdings enable row level security;
