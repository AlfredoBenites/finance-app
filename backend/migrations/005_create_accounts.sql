-- Migration 005: accounts
-- Bank / cash / investment accounts (SPEC.md 7.6 / 8.5). Balances are manually
-- entered for the MVP. Used for net worth and real-available-money calculations.
--
-- How to run: open the Supabase SQL Editor and paste/run this file.
-- Relies on set_updated_at() from 001.

create table if not exists accounts (
    id           uuid primary key default gen_random_uuid(),
    name         text not null,
    account_type text,           -- checking, savings, cash, investment, roth_ira
    institution  text,
    balance      numeric(14, 2) not null default 0,
    is_asset     boolean not null default true,  -- false = a debt/liability
    is_active    boolean not null default true,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

drop trigger if exists accounts_set_updated_at on accounts;
create trigger accounts_set_updated_at
    before update on accounts
    for each row
    execute function set_updated_at();

alter table accounts enable row level security;
