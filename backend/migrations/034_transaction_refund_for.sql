-- Migration 034: link a refund to the purchase it offsets. When set, the
-- reimbursement suggestion nets the refund against that purchase so it proposes
-- moving the REMAINING amount, not the full original charge. The displayed
-- expense totals are unchanged (the statement still shows the full charge).
--
-- How to run: open the Supabase SQL Editor, paste this file, click Run.

alter table transactions
  add column if not exists refund_for_id uuid
    references transactions(id) on delete set null;
