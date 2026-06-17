-- Migration 001: profiles
-- A profile represents a person whose spending is tracked (e.g., Me, Mom, Dad).
-- Profiles are separate but can share credit cards (see SPEC.md section 6).
--
-- How to run: open the Supabase SQL Editor and paste/run this file.

create extension if not exists "pgcrypto";

create table if not exists profiles (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    color           text,
    avatar_initials text,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Keep updated_at current on every UPDATE.
create or replace function set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
    before update on profiles
    for each row
    execute function set_updated_at();

-- Enable Row Level Security. With NO policies, the public anon key is fully
-- blocked. The backend uses the service role key, which bypasses RLS.
alter table profiles enable row level security;
