-- Migration 037: manual statement-balance override per credit card.
--
-- The app infers a card's statement from the transaction dates you type, but
-- issuers bill by POSTING date, so charges near the cycle edge can land on a
-- different statement (Robinhood Gold showed $130 more than the real statement).
-- These columns let you pin the ACTUAL statement balance for the current cycle;
-- statement_due uses it instead of the inferred charges, and automatically falls
-- back to the inferred value once the next cycle closes (the stored close date no
-- longer matches).
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

alter table credit_cards
    add column if not exists statement_override numeric(12, 2),
    add column if not exists statement_override_close date;
