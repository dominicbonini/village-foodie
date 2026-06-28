-- Phase 1 of per-dish option availability (design model C).
-- Adds a per-(dish,group) exclusion list to the item_modifier_groups junction. Default '{}' = the dish
-- offers ALL of the group's options (backward-compatible: every existing link keeps offering all
-- options, zero backfill). The menu resolution (app/api/menu/[truckId]/route.ts) drops any option
-- whose id is in this array when building that dish's group options. Visibility-only — orders store
-- option NAMES, so this never affects order storage, pricing, or stock.

ALTER TABLE item_modifier_groups
  ADD COLUMN IF NOT EXISTS excluded_option_ids uuid[] NOT NULL DEFAULT '{}';

-- VERIFY (expect excluded_option_ids = {} on existing rows):
-- select menu_item_id, group_id, excluded_option_ids from item_modifier_groups limit 5;
