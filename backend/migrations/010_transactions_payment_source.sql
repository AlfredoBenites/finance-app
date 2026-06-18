-- Migration 010: allow non-credit-card payments.
--
-- A transaction is now paid by EXACTLY ONE source: a credit card OR an account
-- (bank/cash/PayPal/etc.). This makes the app a general personal-finance tracker,
-- not card-only, while card debt and cashback still come only from card rows.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

-- Card is now optional.
alter table transactions alter column credit_card_id drop not null;

-- New optional link to an account (the non-card payment source).
alter table transactions
    add column account_id uuid references accounts (id) on delete restrict;

-- Integrity: exactly one payment source per transaction.
alter table transactions
    add constraint transactions_one_payment_source
    check (num_nonnulls(credit_card_id, account_id) = 1);

create index if not exists transactions_account_id_idx on transactions (account_id);
