-- Migration 015: link a bucket to a credit card (a "payoff" bucket).
--
-- Each card can have a payoff bucket; money saved in it represents money set
-- aside to pay that card, so it reduces the card's displayed (remaining) debt.
-- Card-linked buckets do NOT separately reduce "real available money" (the card
-- debt they fund is already subtracted) — only non-card buckets do.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

alter table buckets
    add column if not exists credit_card_id uuid references credit_cards (id) on delete cascade;

create index if not exists buckets_credit_card_id_idx on buckets (credit_card_id);
