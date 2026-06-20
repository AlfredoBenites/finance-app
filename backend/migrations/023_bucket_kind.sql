-- Migration 023: classify each bucket so it can flow into net worth / real
-- available money correctly.
--
--   spendable  -> your money, freely available  (net worth: yes, available: yes)
--   set_aside  -> your money, earmarked         (net worth: yes, available: no)   [default]
--   not_mine   -> someone else's money you hold  (net worth: no,  available: no)
--
-- Default 'set_aside' keeps every existing number unchanged until a bucket is
-- reclassified (e.g. a "Mom's money" bucket -> not_mine).
--
-- How to run: open the Supabase SQL Editor, paste this file, click Run.

alter table buckets add column if not exists kind text not null default 'set_aside';

alter table buckets drop constraint if exists buckets_kind_check;
alter table buckets add constraint buckets_kind_check
  check (kind in ('spendable', 'set_aside', 'not_mine'));
