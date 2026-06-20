-- Migration 021: a default "money bucket" per profile.
--
-- Where that person's money is kept (e.g. Mom -> "Mom's money", you -> "Core
-- savings"). When you mark one of their charges paid, the Buckets tab suggests
-- moving the money FROM this bucket into the card's payoff bucket.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

alter table profiles
    add column if not exists default_bucket_id uuid references buckets (id) on delete set null;
