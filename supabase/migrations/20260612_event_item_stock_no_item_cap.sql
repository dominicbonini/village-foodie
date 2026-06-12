-- 20260612_event_item_stock_no_item_cap.sql
-- Per-event "no individual cap (follow category)" flag. Applied by hand in Supabase.
-- A row with no_item_cap = true means this item has NO individual ceiling THIS event → its item
-- ceiling resolves to null → it follows the category pool. Distinct from stock_count = null (which
-- means "use the menu default" and is overloaded across sold-out / sell-through rows).
alter table event_item_stock
  add column if not exists no_item_cap boolean not null default false;
notify pgrst, 'reload schema';
