-- Migration 026: a history log of money movements.
--
-- Records account-to-account transfers (scope='account') and money moved within
-- buckets (scope='bucket': bucket moves, reimbursement allocations, income
-- allocations). Each row stores a human-readable summary for display.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

create table if not exists money_moves (
    id          uuid primary key default gen_random_uuid(),
    owner_id    uuid not null references auth.users (id) on delete cascade,
    scope       text not null check (scope in ('account', 'bucket')),
    amount      numeric(14, 2) not null,
    summary     text not null,
    created_at  timestamptz not null default now()
);

create index if not exists money_moves_owner_id_idx on money_moves (owner_id);

alter table money_moves enable row level security;
