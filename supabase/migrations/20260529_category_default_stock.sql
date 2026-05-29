-- Default starting stock per event at the category level.
-- Works in concert with item-level default_stock: item orders count against both.
ALTER TABLE menu_categories
ADD COLUMN IF NOT EXISTS default_stock integer DEFAULT NULL;
