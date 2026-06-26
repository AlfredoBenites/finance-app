-- Migration 027: let bank/cash expenses be subtracted from a bucket + balance.
--
-- A purchase paid from an account (not a credit card) is real money leaving that
-- account. The Buckets page suggests subtracting it from a bucket (or just the
-- account's unallocated balance). `account_deducted` tracks whether that's been
-- handled, so a suggestion fires once per expense and then stops.
--
-- Existing account expenses are historical, so mark them handled — only new ones
-- are suggested going forward.
--
-- How to run: open the Supabase SQL Editor, paste this file, click Run.

alter table transactions add column if not exists account_deducted boolean not null default false;

update transactions set account_deducted = true where account_id is not null;
