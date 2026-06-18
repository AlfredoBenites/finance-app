-- Migration 016: statement + payment-due day-of-month per credit card.
--
-- statement_day: day the statement closes. due_day: day the payment is due.
-- Stored as day-of-month (1-31) since they recur monthly. Used to show upcoming
-- payment reminders on the dashboard.
--
-- How to run: open the Supabase SQL Editor, paste this whole file, click Run.

alter table credit_cards add column if not exists statement_day integer;
alter table credit_cards add column if not exists due_day integer;
