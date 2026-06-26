-- Migration 029: a free-text category on holdings (e.g. "Roth IRA", "Brokerage",
-- "Crypto") so one platform account can group its holdings, instead of needing a
-- separate account per type.
--
-- How to run: open the Supabase SQL Editor, paste this file, click Run.

alter table holdings add column if not exists category text;
