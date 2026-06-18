-- Migration 014: mark one profile as "me" (the account owner's own profile).
--
-- Used by the dashboard's "only my debt" toggle so net worth can exclude debt
-- that belongs to other people (e.g. Mom, who reimburses you).
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.
-- Then mark your own profile as primary in the app (Profiles -> "This is me").

alter table profiles add column if not exists is_primary boolean not null default false;
