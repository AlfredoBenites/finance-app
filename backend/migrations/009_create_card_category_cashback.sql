-- Migration 009: per-category cashback rules (SPEC.md 14: "better cashback rules
-- by category").
--
-- A card can give different cashback rates by category (e.g. 5% groceries, 1%
-- everything else). These rows are the per-(card, category) overrides; the
-- transaction form uses them to auto-fill the rate, falling back to the card's
-- default_cashback_rate.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.
-- Relies on set_updated_at() from 001.

create table if not exists card_category_cashback (
    id         uuid primary key default gen_random_uuid(),
    card_id    uuid not null references credit_cards (id) on delete cascade,
    owner_id   uuid not null references auth.users (id) on delete cascade,
    category   text not null,
    rate       numeric(6, 4) not null,   -- e.g. 0.0500 = 5%
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- One rate per category per card.
    unique (card_id, category)
);

create index if not exists ccc_card_id_idx on card_category_cashback (card_id);
create index if not exists ccc_owner_id_idx on card_category_cashback (owner_id);

drop trigger if exists ccc_set_updated_at on card_category_cashback;
create trigger ccc_set_updated_at
    before update on card_category_cashback
    for each row
    execute function set_updated_at();

alter table card_category_cashback enable row level security;
