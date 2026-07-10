-- Migration 036: investment purchase/sale history.
--
-- A "buy" moves cash (buying power) out of an account and into shares of a
-- holding. Each buy (and later, sell) is recorded here so the Investments page
-- can show a history of what was bought/sold, how much, and when.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

create table if not exists investment_transactions (
    id          uuid primary key default gen_random_uuid(),
    owner_id    uuid not null references auth.users (id) on delete cascade,
    account_id  uuid references accounts (id) on delete set null,
    holding_id  uuid references holdings (id) on delete set null,
    symbol      text not null,
    kind        text not null default 'stock',   -- stock | crypto
    type        text not null default 'buy',     -- buy | sell (sell is future)
    shares      numeric not null,
    price       numeric not null,                -- per-share price paid
    amount      numeric(14, 2) not null,         -- shares * price, in dollars
    traded_on   date not null,
    notes       text,
    created_at  timestamptz not null default now()
);

create index if not exists investment_transactions_owner_id_idx on investment_transactions (owner_id);
create index if not exists investment_transactions_account_idx on investment_transactions (account_id);

alter table investment_transactions enable row level security;
