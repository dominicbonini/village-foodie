-- canada-1 (22 October 2026, docs/canada-1-report.md §8) — BLOCK A, "RUN NOW" (before or after the deploy; either is safe).
-- ⚠️ NOT RUN when written. Widens the allergen-set CHECK to the Canadian list ('ca', lib/allergens.ts CA — Health Canada's
-- priority food allergens). No row holds 'ca' yet, so nothing changes for anyone. It must run BEFORE block B
-- (20261032_canada_row.sql), whose CA row says allergen_set = 'ca'.
begin;
alter table public.country_settings drop constraint country_settings_allergen_set_chk;
alter table public.country_settings add constraint country_settings_allergen_set_chk
  check (allergen_set in ('uk14', 'us9', 'anz', 'ca'));
commit;

-- Check: select pg_get_constraintdef(oid) from pg_constraint where conname = 'country_settings_allergen_set_chk';
