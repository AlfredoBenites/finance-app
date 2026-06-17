-- Migration 002: credit_cards
-- A credit card can be shared across profiles (see SPEC.md sections 6 and 7.2).
-- Card balances are CALCULATED from transactions, not stored here (SPEC.md section 15).
--
-- How to run: open the Supabase SQL Editor and paste/run this file.
-- Relies on set_updated_at() defined in 001_create_profiles.sql.

create table if not exists credit_cards (
    id                    uuid primary key default gen_random_uuid(),
    name                  text not null,
    issuer                text,
    last_four             text,
    credit_limit          numeric(12, 2),
    default_cashback_rate numeric(6, 4),   -- e.g. 0.0150 = 1.5%
    color                 text,
    is_active             boolean not null default true,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

drop trigger if exists credit_cards_set_updated_at on credit_cards;
create trigger credit_cards_set_updated_at
    before update on credit_cards
    for each row
    execute function set_updated_at();

-- Lock out the public anon key; backend service role key bypasses RLS.
alter table credit_cards enable row level security;
