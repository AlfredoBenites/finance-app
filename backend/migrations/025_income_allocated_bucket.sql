-- Migration 025: remember where an income was allocated, so it can be undone.
--
-- When you allocate income via the Buckets suggestion, we now store the target
-- (a bucket id, or 'unallocated'). The Income tab's Undo button uses it to
-- reverse the exact account-balance and bucket bumps.
--
-- NULL means the income was never allocated through the suggestion (e.g. seeded
-- historical income), so there's nothing to undo.
--
-- How to run: open the Supabase SQL Editor, paste this file, click Run.

alter table income add column if not exists allocated_bucket_id text;
