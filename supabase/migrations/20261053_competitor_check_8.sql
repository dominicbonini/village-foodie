-- supabase/migrations/20261053_competitor_check_8.sql — competitor-check-8 (31 October 2026, docs/competitor-check-8-report.md).
-- ⛔ NOT RUN — Dominic runs it. The checker reads every part tolerantly, so it works before this runs:
--   • deep_time_limit_seconds absent → 1800 s (the code's default);
--   • deep_progress absent → a timed-out deep check still keeps its finished groups' findings, but the next run checks every
--     group again instead of only the missing ones;
--   • pass_batches_reread absent → a failed batch collected before its errors were logged is not re-read (one log line says so);
--   • 'time_up' refused by the old CHECK → the run is recorded 'done'.
--
-- 1 · competitor_check_settings.deep_time_limit_seconds — a deep (or single) check's time limit (was 600 s in code).
-- 2 · competitor_check_settings.pass_batches_reread — the failed Message Batches whose items' errors the checker has logged,
--     so each is re-read (and logged) once. Ids only.
-- 3 · competitors.deep_progress — per country ('*' for an every-country check), what a deep check that ran out of time
--     finished: {"DE": {"requestedAt": …, "at": …, "pricesDone": true, "keys": ["term", "trial", "preorder", …]}}. A scheduling
--     column: the checker writes it, Admin never edits it; cleared when the check finishes.
-- 4 · competitor_check_runs.stopped_reason may be 'time_up' — the job's time ran out before its list did.

begin;

alter table public.competitor_check_settings
  add column if not exists deep_time_limit_seconds integer not null default 1800,
  add column if not exists pass_batches_reread     jsonb   not null default '[]'::jsonb;
alter table public.competitor_check_settings drop constraint if exists competitor_check_settings_deep_time_limit_chk;
alter table public.competitor_check_settings add constraint competitor_check_settings_deep_time_limit_chk
  check (deep_time_limit_seconds between 60 and 3600);

alter table public.competitors add column if not exists deep_progress jsonb not null default '{}'::jsonb;

alter table public.competitor_check_runs drop constraint if exists competitor_check_runs_stopped_reason_check;
alter table public.competitor_check_runs add constraint competitor_check_runs_stopped_reason_check
  check (stopped_reason in ('done', 'daily_cap', 'monthly_cap', 'paused', 'error', 'time_up'));

commit;

-- Check:
--   select deep_time_limit_seconds, pass_batches_reread from public.competitor_check_settings;
--   select count(*) filter (where deep_progress <> '{}'::jsonb) as with_progress from public.competitors;
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'competitor_check_runs_stopped_reason_check';
