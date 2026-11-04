-- supabase/migrations/20261070_import_and_cs_fix_untick.sql — import-and-cs-fix, Q1 (4 November 2026, docs/import-and-cs-fix-report.md).
-- The 4 Nov 09:02 UTC features import ticked asap, options, staff and walkup back on after Admin had unticked them on 2 Nov.
-- DOMINIC'S DECISION (Q1, 4 Nov): untick asap, options and staff again, marked as his (checked_by = 'admin');
-- LEAVE WALKUP TICKED — it is a core, shown feature in the 3 Nov tiers.
-- Only `checked` changes, only on those three keys, and only where it is still ticked; where each shows is untouched.
-- comparison_features is not a protected table (35.ao-5).

begin;

update public.comparison_features
   set checked = false, checked_by = 'admin', updated_at = now()
 where key in ('asap', 'options', 'staff') and checked = true;

commit;

-- Check (read-only):
--   select key, checked, checked_by, show_scope, scope_by, tier from comparison_features where key in ('asap','options','staff','walkup') order by key;
