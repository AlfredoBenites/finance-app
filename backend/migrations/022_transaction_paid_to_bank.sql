-- Migration 022: separate "paid the bank" from "reimbursed by a person".
--
-- Until now `is_paid_back` meant both "a person paid me back" AND "I paid the
-- card issuer", so paying a card wrongly cleared per-person reimbursement
-- tracking. Add `paid_to_bank` to track the bank side independently:
--   is_paid_back  -> a person reimbursed you (you set it; drives "owed to you")
--   paid_to_bank  -> you paid the card issuer (Pay-a-card sets it; drives debt/net worth)
--
-- New rows default to not-paid. Existing data is seeded separately (a pay-in-full
-- user's charges through each card's last closed statement are marked paid).
--
-- How to run: open the Supabase SQL Editor, paste this file, click Run.

alter table transactions add column if not exists paid_to_bank boolean not null default false;

-- Baseline seed: keep current card-debt / net-worth numbers unchanged at migration
-- time by carrying over the old combined flag. A precise, statement-aware re-seed
-- (scripts/seed_paid_to_bank.py) refines this for a pay-in-full user afterward.
update transactions set paid_to_bank = is_paid_back where credit_card_id is not null;
