-- 20260907_discovery_run_log.sql
-- Per-site run log for the DISCOVERY pass (Pass A) of scripts/run-scraper.js.
--
-- ⛔ NOT APPLIED. Run by hand in the Supabase SQL editor. Idempotent (`if not exists`).
--    After applying: `notify pgrst, 'reload schema';` (last line).
--
-- ── 🔴 WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────
-- Pass B (the three HatchGrab operator trucks) writes `scraper_run_log`. Pass A — the ~95 URL-scraped
-- discovery trucks that produce the public map — writes NOTHING. Every per-site failure is caught,
-- printed to stdout in a GitHub Actions log nobody reads, and skipped.
--
-- The cost, measured 7 September 2026: 51 URL-scraped trucks have ZERO future events, and there is no
-- way to tell an idle truck from a broken one. Pimp My Fish sat at zero for six days and was found only
-- because the operator happened to look at the map.
--
-- ── 🔴 THE ONE DISTINCTION THIS TABLE EXISTS TO MAKE ────────────────────────────────────────────────
-- ZERO-FOUND must be distinguishable from NEVER-ATTEMPTED. That is structural here, not a flag:
--   • attempted and found nothing  → a row exists for that (run_id, site_name) with events_extracted = 0
--   • never attempted              → NO ROW for that site under the latest run_id
-- So "which sites did this run skip entirely?" is an anti-join against the previous run, and
-- "which sites are being read but yield nothing?" is a filter. Neither question is answerable today.
--
-- Shaped to read like `scraper_run_log` (20260604_scraper_adaptive.sql): a `run_at`, a per-subject key,
-- counters, and a free-text `notes`. It is a SEPARATE table because the subject is different — Pass A
-- keys on a SHEET ROW (a name + a URL + a strategy), not on `trucks.id`, and most discovery sites have
-- no `trucks` row at all, so the existing FK could not hold them.

set lock_timeout = '3s';

begin;

create table if not exists public.discovery_run_log (
  id                uuid primary key default gen_random_uuid(),

  -- One id per invocation of the scraper, so a whole run can be selected, compared with the previous
  -- run, and anti-joined to find sites that vanished from the Sheet.
  run_id            uuid        not null,
  run_at            timestamptz not null default now(),

  -- The Sheet row this attempt came from. NOT a foreign key: the site list lives in the Google Sheet,
  -- and a name here may have no `discovery_trucks` row (a brand-new truck) or no `trucks` row at all.
  site_name         text        not null,
  source_type       text,                     -- 'truck' | 'venue' (which tab the row came from)
  url               text,
  strategy          text,

  -- 🔴 THE OUTCOME VOCABULARY. Fixed strings so a query can group on them; a CHECK is deliberately
  -- omitted (V12.1: PostgREST cannot expose a CHECK to a UI, and an unknown future outcome must be
  -- storable rather than fatal).
  --   'ok'            — page read, AI returned, events extracted (may still be 0 after filtering)
  --   'empty_page'    — page text below the 50-character floor; nothing to send to the model
  --   'ai_error'      — Gemini failed or returned unparseable JSON after its retries
  --   'site_error'    — anything thrown for this site (navigation, browser, unexpected)
  --   'manual'        — a manual/manual_single row: no page load by design
  outcome           text        not null,

  page_chars        integer,                  -- length of the text handed to the model
  events_extracted  integer,                  -- what the model returned, before our filters
  events_filtered   integer,                  -- dropped by the historical/exclusion/private filters
  events_new        integer,                  -- appended after dedup — what actually reached the Sheet
  duplicates        integer,                  -- suppressed by dedup against the Events tab

  error             text,                     -- message, truncated by the writer
  notes             text
);

-- "How has this site behaved lately?" — the alert query's access path.
create index if not exists discovery_run_log_site_run
  on public.discovery_run_log (site_name, run_at desc);

-- "What did run X do?" and the previous-run anti-join.
create index if not exists discovery_run_log_run
  on public.discovery_run_log (run_id, site_name);

-- ── RLS + GRANTS — SERVICE ROLE ONLY ────────────────────────────────────────────────────────────────
-- Same three defences as every other operational table here: RLS on, one service-role policy, and the
-- default anon/authenticated grants REVOKED (enabling RLS alone leaves the capability in place).
alter table public.discovery_run_log enable row level security;

drop policy if exists "service_role only" on public.discovery_run_log;
create policy "service_role only" on public.discovery_run_log
  for all to service_role using (true) with check (true);

revoke all on public.discovery_run_log from anon, authenticated, public;

commit;

notify pgrst, 'reload schema';
