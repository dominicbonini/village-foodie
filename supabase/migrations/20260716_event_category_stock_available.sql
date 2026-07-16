-- 20260716_event_category_stock_available.sql
-- Per-event category ENABLE/DISABLE (GATE model). Additive, mirrors event_item_stock.available.
-- available = false ⇒ the whole category is closed for THAT event only (per-event grain → auto-reverts
-- next event). Readers (menu API, submit gate, operator Add Order, enforceStockLimits) honour it; NO
-- bulk-write to item rows, so reopening restores exactly the prior per-item state.

alter table event_category_stock
  add column if not exists available boolean not null default true;
