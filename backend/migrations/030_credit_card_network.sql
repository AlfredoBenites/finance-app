-- Migration 030: a card's payment network (Visa, Mastercard, Amex, Discover,
-- Other) so the card visual can show the network mark. Nullable free text.
--
-- How to run: open the Supabase SQL Editor, paste this file, click Run.

alter table credit_cards add column if not exists network text;
