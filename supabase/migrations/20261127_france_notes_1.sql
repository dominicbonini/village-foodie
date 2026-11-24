-- 20261127_france_notes_1.sql
-- france-notes-1 (24 November 2026, docs/france-notes-1-report.md): THE LINE NOTES GET THEIR OWN COLUMN, so the 12-month retention blanks
-- them there and never rewrites an order's items or deals.
--
--   • orders.line_notes / order_drafts.line_notes — NEW, NULLABLE jsonb, no default, no constraint. Each line's note (items[].
--     specialInstructions) and each deal's slot notes (deals[].slotNotes), tied to the line by its cartKey, else its position
--     (lib/line-notes.ts holds the shape). NULL = the notes, if any, are still inside items / deals: every order before this, and every
--     order the deployed code writes — readers fall back to them, and retention keeps blanking them there exactly as before.
--
-- ✅ CLASSIFICATION: ADDITIVE AND BACKWARD-COMPATIBLE. Two nullable columns. No backfill, no existing row changed, no constraint, trigger or
--    function added or changed; place_order_atomic_v2 is not touched (the customer path moves the notes with a follow-up update inside
--    the same event lock — see the report). The deployed code never reads or writes the column.

set lock_timeout = '3s';

begin;

alter table public.orders       add column if not exists line_notes jsonb;
alter table public.order_drafts add column if not exists line_notes jsonb;

comment on column public.orders.line_notes is
  'france-notes-1: the order''s line notes (items[].specialInstructions, deals[].slotNotes), kept out of items/deals so retention never rewrites them. {v:1, items:{key:{at,note}}, deals:{key:{at,slotNotes}}}; key = the line''s cartKey, else "#position". NULL = notes (if any) still inside items/deals. lib/line-notes.ts.';
comment on column public.order_drafts.line_notes is
  'france-notes-1: the card draft''s line notes, same shape as orders.line_notes; copied to the order at promotion.';

notify pgrst, 'reload schema';

commit;

-- VERIFY (read-only):
--   select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
--     where table_schema = 'public' and column_name = 'line_notes' and table_name in ('orders', 'order_drafts');
