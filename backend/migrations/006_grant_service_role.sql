-- Migration 006: grant table privileges to service_role.
--
-- The FastAPI backend authenticates as the `service_role`. That role bypasses
-- Row Level Security, but it still needs normal table-level privileges. In some
-- projects these default grants are missing, causing:
--   42501: permission denied for table <name>
--
-- This grants the backend role access to all current and future tables in the
-- public schema. RLS still blocks the public anon role (no policies exist for it).
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

grant usage on schema public to service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- Make sure tables/sequences created later are also accessible to service_role.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
