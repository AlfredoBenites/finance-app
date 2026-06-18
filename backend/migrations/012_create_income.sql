-- Migration 012: income tracking.
--
-- Money coming IN — jobs, side gigs, tips, gifts, cashback, refunds. Separate
-- from expenses (transactions). Amounts are positive. Optionally linked to the
-- account the money landed in. Owner-scoped with RLS.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.
-- Relies on set_updated_at() from 001.

create table if not exists income (
    id          uuid primary key default gen_random_uuid(),
    owner_id    uuid not null references auth.users (id) on delete cascade,
    income_date date not null,
    source      text not null,          -- where the income came from (e.g. a job, a gig, a tip)
    category    text,                    -- type: Job / Side Gig / Tip / Gift / Cashback / Refund / Other
    amount      numeric(12, 2) not null, -- positive
    account_id  uuid references accounts (id) on delete set null,  -- where it landed (optional)
    notes       text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists income_owner_id_idx on income (owner_id);
create index if not exists income_date_idx on income (income_date);

drop trigger if exists income_set_updated_at on income;
create trigger income_set_updated_at
    before update on income
    for each row
    execute function set_updated_at();

alter table income enable row level security;
