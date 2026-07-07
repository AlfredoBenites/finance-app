-- Migration 035: group purchases. One shared purchase split into a per-person
-- charge (each on the payer's card), so each participant owes only their share of
-- the items + tax + tip/fees. The split lines are normal transactions linked by
-- group_id; the calculator inputs are stored on transaction_groups so a group can
-- be reopened and re-split later.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

create table if not exists transaction_groups (
    id          uuid primary key default gen_random_uuid(),
    owner_id    uuid not null references auth.users (id) on delete cascade,
    data        jsonb not null,          -- calculator inputs (mode, tax_rate, tip, fees, participants, ...)
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists transaction_groups_owner_id_idx on transaction_groups (owner_id);
alter table transaction_groups enable row level security;

alter table transactions
    add column if not exists group_id uuid
        references transaction_groups (id) on delete set null;
