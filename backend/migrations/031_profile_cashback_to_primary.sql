-- Migration 031: per-profile cashback attribution. When a non-primary profile
-- has cashback_to_primary = true, the cashback its transactions generate is
-- credited to the primary ("me") profile instead of to that profile. Debt and
-- amounts owed are unaffected — only cashback moves. Default false keeps every
-- existing profile's cashback with that profile.
--
-- How to run: open the Supabase SQL Editor, paste this file, click Run.

alter table profiles
  add column if not exists cashback_to_primary boolean not null default false;
