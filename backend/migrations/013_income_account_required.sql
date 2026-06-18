-- Migration 013: make the income account mandatory.
--
-- Every income entry must record which account the money landed in. Since the
-- column becomes NOT NULL, switch the FK from ON DELETE SET NULL to RESTRICT
-- (deleting an account that has income is blocked, like transactions).
-- Safe because there are no income rows yet.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

alter table income alter column account_id set not null;
alter table income drop constraint if exists income_account_id_fkey;
alter table income
    add constraint income_account_id_fkey
    foreign key (account_id) references accounts (id) on delete restrict;
