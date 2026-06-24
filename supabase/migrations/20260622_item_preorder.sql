-- Pre-orders (V7.8 §44, Stage 1) — per-item pre-order config.
-- An operator opts an item into pre-order behaviour: a DEADLINE + a past-deadline ACTION.
-- Read at request time by lib/preorder.ts (isPreorderDeadlinePassed), consumed by the menu API
-- sold-out composition (app/api/menu/[truckId]/route.ts) and the order-submit auto-accept rollup
-- (app/api/orders/submit/route.ts). Written by the Manage item editor / set_item_preorder_bulk.
--
-- Additive + nullable (the §9 spiciness / §10 auto_accept per-item pattern); columns inherit the
-- table's existing RLS. NULL = "unset / not a pre-order item" (the read helper treats it as inert).
-- Idempotent (IF NOT EXISTS): these columns were already hand-applied in the Supabase SQL editor;
-- this file is the TRACKED record (closing the untracked-migration gap spiciness/auto_accept left).
-- Apply by hand in the Supabase SQL editor if not already present, then: notify pgrst, 'reload schema';

alter table menu_items_db
  add column if not exists preorder_enabled        boolean,
  add column if not exists preorder_deadline_type  text,
  add column if not exists preorder_deadline_value integer,
  add column if not exists preorder_past_action    text;

comment on column menu_items_db.preorder_enabled        is 'Pre-orders on for this item. NULL/false = off (inert).';
comment on column menu_items_db.preorder_deadline_type  is E'Deadline kind: ''hours_before'' (N hours before event start) or ''daily_cutoff'' (cutoff time on the event day).';
comment on column menu_items_db.preorder_deadline_value is 'hours_before → whole hours; daily_cutoff → minutes-of-day in event-tz (e.g. 12:00 = 720).';
comment on column menu_items_db.preorder_past_action    is E'Past the deadline: ''sold_out'' (hide at the menu) or ''force_pending'' (orderable, but the order needs operator approval — won''t auto-accept).';
