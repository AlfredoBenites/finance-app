-- Migration 020: track whether a reimbursed charge has been moved to a bucket.
--
-- When someone else's charge is marked paid (they reimbursed you), the Buckets
-- tab suggests moving that money into the card's payoff bucket. This flag marks
-- which reimbursements have already been allocated so they stop being suggested.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

alter table transactions
    add column if not exists reimbursement_allocated boolean not null default false;
