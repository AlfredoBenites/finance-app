-- Migration 039: drop the statement-override columns (feature removed).
--
-- The manual "actual statement balance" override (mig 037) was replaced by the
-- reconcile flow (mig 038) plus the linked-refund rule, which fix the statement at
-- the data level instead of patching a display number. These columns are no longer
-- used. Safe to run; nothing reads them anymore.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

alter table credit_cards
    drop column if exists statement_override,
    drop column if exists statement_override_close;
