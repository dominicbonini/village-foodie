-- supabase/migrations/20261067_import_and_cs_fix.sql — import-and-cs-fix (4 November 2026, docs/import-and-cs-fix-report.md).
-- WHO SET A FEATURE'S TICK, AND WHERE IT SHOWS: the file (the automatic importer) or Admin.
--
-- The features importer (lib/data-import/features.ts) re-applied the file's `checked` and `show_scope` whenever a feature's tier
-- changed, so the first tiered import (4 Nov 09:02 UTC) ticked asap, options, staff and walkup back on after Admin had unticked
-- them on 2 Nov. `updated_by` is per ROW, so it cannot say WHICH of the two Admin changed. From now on:
--   • checked_by  — 'admin' when Admin last set `checked`, 'file' when the importer did;
--   • scope_by    — the same for `show_scope` / `show_countries`.
-- The importer applies tiers and adds new features, but never changes a value Admin set (an OFF-tier feature is still unticked).
-- BACKFILL: a row Admin has touched (updated_by is not null — today allergens, asap, options, staff, walkup) is 'admin' for both:
-- the cautious reading, since the row cannot say which of the two Admin changed. Every other row is 'file'.
-- ⚠️ This does NOT put back the four ticks the 4 Nov import turned on: that is a change to stored values, waiting for Dominic's yes.

begin;

alter table public.comparison_features
  add column if not exists checked_by text,
  add column if not exists scope_by text;
alter table public.comparison_features drop constraint if exists comparison_features_checked_by_chk;
alter table public.comparison_features add constraint comparison_features_checked_by_chk check (checked_by is null or checked_by in ('admin', 'file'));
alter table public.comparison_features drop constraint if exists comparison_features_scope_by_chk;
alter table public.comparison_features add constraint comparison_features_scope_by_chk check (scope_by is null or scope_by in ('admin', 'file'));

update public.comparison_features set checked_by = case when updated_by is not null then 'admin' else 'file' end where checked_by is null;
update public.comparison_features set scope_by = case when updated_by is not null then 'admin' else 'file' end where scope_by is null;

commit;

-- Check (read-only):
--   select key, checked, show_scope, tier, checked_by, scope_by from comparison_features where checked_by = 'admin' or scope_by = 'admin' order by key;
