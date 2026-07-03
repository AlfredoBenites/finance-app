-- Migration 032: redirect a profile's cashback to ANY chosen profile, not just
-- the primary. Replaces the boolean cashback_to_primary (migration 031) with a
-- nullable reference to the target profile. NULL = keep the cashback with this
-- profile. Example: point Stepdad's cashback at Mom because she covers his card.
--
-- The source profile still shows its own cashback for reference; the target
-- profile also shows it (merged into its cashback-by-card).
--
-- How to run: open the Supabase SQL Editor, paste this file, click Run.

alter table profiles
  add column if not exists cashback_to_profile_id uuid
    references profiles(id) on delete set null;

-- Carry over anyone who was redirecting to "primary": point them at the primary
-- profile in their own account.
update profiles p
set cashback_to_profile_id = (
  select me.id from profiles me
  where me.owner_id = p.owner_id and me.is_primary = true
  limit 1
)
where p.cashback_to_primary = true;

alter table profiles drop column if exists cashback_to_primary;
