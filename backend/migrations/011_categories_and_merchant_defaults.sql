-- Migration 011: user-managed categories + per-merchant default categories.
--
-- categories: the list of spending categories a user can pick from; they can add
--   more in the app as they go.
-- merchant_categories: remembers the default category for a merchant, so typing
--   that merchant again auto-fills the category.
--
-- Transactions still store category as free text; these tables drive the UI and
-- the auto-fill. Both are owner-scoped with RLS.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.
-- Relies on set_updated_at() from 001.

create table if not exists categories (
    id         uuid primary key default gen_random_uuid(),
    owner_id   uuid not null references auth.users (id) on delete cascade,
    name       text not null,
    created_at timestamptz not null default now(),
    unique (owner_id, name)
);
create index if not exists categories_owner_id_idx on categories (owner_id);
alter table categories enable row level security;

create table if not exists merchant_categories (
    id         uuid primary key default gen_random_uuid(),
    owner_id   uuid not null references auth.users (id) on delete cascade,
    merchant   text not null,
    category   text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, merchant)
);
create index if not exists merchant_categories_owner_id_idx on merchant_categories (owner_id);

drop trigger if exists merchant_categories_set_updated_at on merchant_categories;
create trigger merchant_categories_set_updated_at
    before update on merchant_categories
    for each row
    execute function set_updated_at();

alter table merchant_categories enable row level security;
