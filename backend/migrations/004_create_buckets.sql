-- Migration 004: buckets
-- Money set aside for a purpose (SPEC.md 7.5 / 8.4). Buckets belong to the main
-- account (not a profile). They reduce available spending money but NOT net worth.
--
-- How to run: open the Supabase SQL Editor and paste/run this file.
-- Relies on set_updated_at() from 001.

create table if not exists buckets (
    id             uuid primary key default gen_random_uuid(),
    name           text not null,
    target_amount  numeric(14, 2),
    current_amount numeric(14, 2) not null default 0,
    due_date       date,
    category       text,
    notes          text,
    is_active      boolean not null default true,
    is_completed   boolean not null default false,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

drop trigger if exists buckets_set_updated_at on buckets;
create trigger buckets_set_updated_at
    before update on buckets
    for each row
    execute function set_updated_at();

alter table buckets enable row level security;
