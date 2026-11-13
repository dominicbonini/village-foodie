-- supabase/migrations/20261101_allergen_kitchen.sql — allergen-kitchen-1 (13 November 2026, docs/allergen-kitchen-1-report.md).
-- Run by Claude with scripts/db-migrate.cjs --approved-by-dominic (Dominic, 13 Nov: "Run migrations yourself with
-- scripts/db-migrate.cjs --approved-by-dominic (approved)").
--
-- THE MODEL: a dish keeps ONE allergen list (menu_items_db.allergens = what its recipe contains). A truck's "allergens your
-- kitchen handles" = the allergens of every confirmed active dish ∪ every available extra ∪ the ones the truck ADDS. Only the
-- added part is stored (below); the rest is computed live (lib/allergen-kitchen.ts), so it follows the dishes on its own.
--   • trucks.allergen_kitchen_extra — the allergens the truck added, or that came from an allergen card's "may be present in
--     all dishes" / "may contain" lines or a menu's "may contain" note. The same English labels as menu_items_db.allergens.
--   • trucks.allergens_confirmed_at — set when the owner ticks "I confirm the allergens for each dish are correct…".
--   • allergen_audit_log.field gains 'kitchen' (change_type 'kitchen_edit' / 'kitchen_confirm'; change_type has no CHECK).
-- No backfill: every existing truck starts with an empty list and no confirmation. Idempotent.
begin;

alter table public.trucks add column if not exists allergen_kitchen_extra text[] not null default '{}';
alter table public.trucks add column if not exists allergens_confirmed_at timestamptz null;

alter table public.allergen_audit_log drop constraint if exists allergen_audit_log_field_check;
alter table public.allergen_audit_log add constraint allergen_audit_log_field_check
  check (field = any (array['allergens', 'dietary', 'allergens_verified', 'card', 'kitchen']));

commit;
