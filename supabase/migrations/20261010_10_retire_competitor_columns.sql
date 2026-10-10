-- 20261010_10_retire_competitor_columns.sql
-- Country settings, Part C: the competitor columns are RETIRED. Kept, emptied, and marked unread.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent: a second run finds nothing to update and rewrites the same comments.
--
-- ✅ CLASSIFICATION: SAFE TO RUN AFTER PART C IS DEPLOYED (and harmless before it: the only reader was
--    /compare's prefill, and emptying it early just makes the boxes start empty a little sooner — which is
--    the decided end state anyway).
--
-- ── WHY ─────────────────────────────────────────────────────────────────────────────────────────────
-- Decided 10 October 2026: /compare no longer prefills what a competitor charges. Both fee boxes start
-- empty and the page names no other provider. Part C removed every read of these three columns from the
-- code (lib/country-settings.ts no longer selects them; the admin Countries page has no competitor row).
-- ⛔ THE COLUMNS ARE NOT DROPPED — the brief forbids dropping a column. They are set to NULL so no stale
-- figure sits in the table, and each carries a comment saying it is retired. Their CHECKs
-- (country_settings_competitor_pct_chk, country_settings_minor_nonneg_chk) accept NULL, so nothing fails.
-- ⚠️ No CHECK is added to keep them NULL: a later decision to use them again should not need a migration
-- to undo one. "Unread" is enforced by the code, and recorded here.
--
-- VERIFY AFTER APPLYING:
--   select country_code, competitor_name, competitor_pct, competitor_fixed_minor from public.country_settings;
--     -- expect NULL in all three on every row
--   select column_name, col_description('public.country_settings'::regclass, ordinal_position)
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'country_settings' and column_name like 'competitor%';

set lock_timeout = '3s';

begin;

update public.country_settings
   set competitor_name = null,
       competitor_pct = null,
       competitor_fixed_minor = null
 where competitor_name is not null
    or competitor_pct is not null
    or competitor_fixed_minor is not null;

comment on column public.country_settings.competitor_name is
  'RETIRED 10 October 2026 — unread by the app and kept NULL. /compare no longer prefills a competitor (20261010_10). Kept rather than dropped; do not read it.';
comment on column public.country_settings.competitor_pct is
  'RETIRED 10 October 2026 — unread by the app and kept NULL. See competitor_name.';
comment on column public.country_settings.competitor_fixed_minor is
  'RETIRED 10 October 2026 — unread by the app and kept NULL. See competitor_name.';

commit;
