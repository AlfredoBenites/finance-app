-- Migration 007: per-user data ownership (multi-tenant).
--
-- Every table gets an owner_id pointing at the authenticated user (auth.users).
-- The backend stamps owner_id on insert and scopes every query to the current
-- user, so users never see each other's data.
--
-- This DELETES all existing rows first (they were throwaway test data and have
-- no owner). After this, sign up and create fresh data that belongs to you.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

-- 1. Clear test data (children first to respect foreign keys).
delete from transactions;
delete from credit_cards;
delete from profiles;
delete from buckets;
delete from accounts;

-- 2. Add owner_id to each table (tables are now empty, so NOT NULL is safe).
alter table profiles
    add column owner_id uuid not null references auth.users (id) on delete cascade;
alter table credit_cards
    add column owner_id uuid not null references auth.users (id) on delete cascade;
alter table transactions
    add column owner_id uuid not null references auth.users (id) on delete cascade;
alter table buckets
    add column owner_id uuid not null references auth.users (id) on delete cascade;
alter table accounts
    add column owner_id uuid not null references auth.users (id) on delete cascade;

-- 3. Index owner_id on each table (every query filters by it).
create index if not exists profiles_owner_id_idx on profiles (owner_id);
create index if not exists credit_cards_owner_id_idx on credit_cards (owner_id);
create index if not exists transactions_owner_id_idx on transactions (owner_id);
create index if not exists buckets_owner_id_idx on buckets (owner_id);
create index if not exists accounts_owner_id_idx on accounts (owner_id);
