-- Default starting stock per item, pre-fills the Menu & Stock tab for each event.
-- Operators set this once in the manage page; they can still adjust per-event in the dashboard.
ALTER TABLE menu_items_db
ADD COLUMN IF NOT EXISTS default_stock integer DEFAULT NULL;
