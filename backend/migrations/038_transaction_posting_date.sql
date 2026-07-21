-- Migration 038: optional per-transaction posting date (for statement windowing).
--
-- Issuers assign a charge to a statement by when it POSTS, which can differ from
-- the transaction date you type. This column lets the statement calc use the real
-- posting date for the few charges that drift across a cycle boundary, WITHOUT
-- changing the transaction_date you see on the Expenses page. Set via the "Reconcile
-- charges" flow on Pay a card. When null, statement windowing uses transaction_date.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

alter table transactions
    add column if not exists posting_date date;
