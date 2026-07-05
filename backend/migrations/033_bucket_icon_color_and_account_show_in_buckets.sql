-- Migration 033: bucket icons/colors + letting empty accounts appear on Buckets.
--
-- - buckets.icon  : a lucide icon key (e.g. "gift", "car") shown next to the bucket.
-- - buckets.color : a color key for that icon (e.g. "blue"), for color-coding.
-- - accounts.show_in_buckets : when true, the account shows on the Buckets page
--   even with no buckets yet, so you can open it and add some.
--
-- How to run: open the Supabase SQL Editor, paste this file, click Run.

alter table buckets add column if not exists icon text;
alter table buckets add column if not exists color text;
alter table accounts add column if not exists show_in_buckets boolean not null default false;
