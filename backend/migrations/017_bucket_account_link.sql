-- Migration 017: buckets live inside a bank account (envelope budgeting).
--
-- A bucket belongs to an account; the account's balance is the total, its buckets
-- carve it up, and the remainder is "unallocated". Money is moved between buckets
-- (and to/from unallocated) rather than set to arbitrary amounts.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

alter table buckets
    add column if not exists account_id uuid references accounts (id) on delete cascade;

create index if not exists buckets_account_id_idx on buckets (account_id);
