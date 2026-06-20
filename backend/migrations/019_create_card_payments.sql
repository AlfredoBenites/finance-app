-- Migration 019: credit card payments.
--
-- A payment toward a card draws money from an account (and optionally a bucket),
-- settles the card's charges, and is recorded here for history.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

create table if not exists card_payments (
    id             uuid primary key default gen_random_uuid(),
    owner_id       uuid not null references auth.users (id) on delete cascade,
    credit_card_id uuid not null references credit_cards (id) on delete cascade,
    account_id     uuid references accounts (id) on delete set null,
    bucket_id      uuid references buckets (id) on delete set null,
    amount         numeric(12, 2) not null,
    paid_on        date,
    created_at     timestamptz not null default now()
);

create index if not exists card_payments_owner_id_idx on card_payments (owner_id);
create index if not exists card_payments_card_id_idx on card_payments (credit_card_id);

alter table card_payments enable row level security;
