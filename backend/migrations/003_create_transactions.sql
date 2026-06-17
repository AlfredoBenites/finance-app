-- Migration 003: transactions
-- A transaction belongs to exactly one profile and one credit card (SPEC.md 8.3).
-- Sign convention (per SPEC.md 8.3 + product decision):
--   purchases are NEGATIVE (e.g. -52.40), refunds/income are POSITIVE.
-- cashback_amount is computed by the backend as -(amount * cashback_rate),
-- so cashback on a purchase is positive.
--
-- How to run: open the Supabase SQL Editor and paste/run this file.
-- Relies on set_updated_at() from 001 and the profiles/credit_cards tables.

create table if not exists transactions (
    id               uuid primary key default gen_random_uuid(),
    transaction_date date not null,
    merchant         text,
    category         text,
    amount           numeric(12, 2) not null,
    profile_id       uuid not null references profiles(id) on delete restrict,
    credit_card_id   uuid not null references credit_cards(id) on delete restrict,
    cashback_rate    numeric(6, 4),
    cashback_amount  numeric(12, 2),
    is_paid_back     boolean not null default false,
    paid_back_date   date,
    notes            text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

-- Indexes for the common filters (by profile, by card, by date) from SPEC 7.3.
create index if not exists transactions_profile_id_idx on transactions (profile_id);
create index if not exists transactions_credit_card_id_idx on transactions (credit_card_id);
create index if not exists transactions_transaction_date_idx on transactions (transaction_date);

drop trigger if exists transactions_set_updated_at on transactions;
create trigger transactions_set_updated_at
    before update on transactions
    for each row
    execute function set_updated_at();

-- Lock out the public anon key; backend service role key bypasses RLS.
alter table transactions enable row level security;
