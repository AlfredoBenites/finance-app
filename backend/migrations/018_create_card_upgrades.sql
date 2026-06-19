-- Migration 018: credit card upgrade history.
--
-- When a card is upgraded to a different product (e.g. Platinum -> Quicksilver),
-- the old card is archived (is_active = false) but kept for history, and the
-- upgrade is recorded here. Rare, so this is a small table.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

create table if not exists card_upgrades (
    id           uuid primary key default gen_random_uuid(),
    owner_id     uuid not null references auth.users (id) on delete cascade,
    old_card_id  uuid not null references credit_cards (id) on delete cascade,
    new_card_id  uuid not null references credit_cards (id) on delete cascade,
    upgraded_on  date,
    created_at   timestamptz not null default now()
);

create index if not exists card_upgrades_owner_id_idx on card_upgrades (owner_id);

alter table card_upgrades enable row level security;
