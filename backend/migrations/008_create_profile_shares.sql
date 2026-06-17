-- Migration 008: profile sharing (Google-Docs style).
--
-- An owner can share one of their profiles with another person by email. When
-- that person signs up / logs in with that email, they get a READ-ONLY view of
-- what they owe on that profile (and nothing else of the owner's).
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

create table if not exists profile_shares (
    id                uuid primary key default gen_random_uuid(),
    profile_id        uuid not null references profiles (id) on delete cascade,
    owner_id          uuid not null references auth.users (id) on delete cascade,
    shared_with_email text not null,
    created_at        timestamptz not null default now(),
    -- A profile can only be shared with the same email once.
    unique (profile_id, shared_with_email)
);

create index if not exists profile_shares_profile_id_idx on profile_shares (profile_id);
create index if not exists profile_shares_email_idx on profile_shares (shared_with_email);

alter table profile_shares enable row level security;
