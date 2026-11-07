-- supabase/migrations/20261079_compare_autopublish_1_blocked.sql — compare-autopublish-1 (7 November 2026, docs/compare-autopublish-1-report.md).
-- "ADMIN'S CHOICES ALWAYS WIN" FOR A MANUAL UNVERIFY: auto_blocked on comparison_entries, competitor_plans and competitor_feature_values.
-- Admin › Pricing check's "Undo verified" (an entry, a plan, a competitor's features in a country) now also sets auto_blocked = true and
-- clears auto_verified_at, so the automatic rules never verify that row again; "Mark verified" clears it. A new plan version or a new
-- answer starts unblocked (it is new data). Schema only: every existing row starts false.

begin;

alter table public.comparison_entries add column if not exists auto_blocked boolean not null default false;
alter table public.competitor_plans add column if not exists auto_blocked boolean not null default false;
alter table public.competitor_feature_values add column if not exists auto_blocked boolean not null default false;

commit;
