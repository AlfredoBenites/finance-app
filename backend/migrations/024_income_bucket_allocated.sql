-- Migration 024: let income be allocated into a bucket.
--
-- When you record income into an account, the Buckets page suggests putting it
-- in a bucket (which adds the amount to that bucket and the account balance).
-- `bucket_allocated` tracks whether that's been handled, so a suggestion fires
-- once per income and then stops.
--
-- Existing income is historical, so mark it handled — only new income is
-- suggested going forward.
--
-- How to run: open the Supabase SQL Editor, paste this file, click Run.

alter table income add column if not exists bucket_allocated boolean not null default false;

update income set bucket_allocated = true;
