-- 20260909_discovery_exclusion_terms.sql
-- The scraper's GLOBAL exclusion list — a NEW table, because it cannot live in `excluded_terms`.
--
-- ⛔ NOT APPLIED. Run by hand in the Supabase SQL editor. Idempotent (`if not exists`).
--
-- ── 🔴 WHY A NEW TABLE AND NOT `excluded_terms` ────────────────────────────────────────────────────
-- `excluded_terms` is `unique (truck_id, term)` with `truck_id text NOT NULL references trucks(id)`
-- (supabase/migrations/20260604_exclusion_terms.sql:3-9, confirmed against the live PostgREST schema).
-- The scraper's list is GLOBAL — its members are 'TBC', 'live music', 'quiz nights' — so there is no
-- truck_id to put in a NOT NULL column. run-scraper.js:792 has been sending {term} with
-- onConflict:'term' since 4 June 2026 and every write has been REFUSED twice over: 42P10 (no such
-- constraint) and 23502 (null in a NOT NULL column). The failures go to dbWriteFailures, which is a
-- GitHub Actions log nobody reads. The table holds 0 rows against 143 terms in the Sheet.
--
-- The two features mean DIFFERENT things and must not share a table:
--   operator feature (app/api/manage/route.ts:2158-2182) — "THIS TRUCK does not want this term",
--     normalised by lib/schedule-extract.ts:13 (keeps spaces), matched by substring.
--   scraper feature — "this string IS NOT A FOOD TRUCK AT ALL", normalised by run-scraper.js:55-64
--     (strips stop-words AND spaces), matched by 1-edit Levenshtein.
-- Three of those four properties differ. One column written by two questions, with nothing on the row
-- saying which, is the anti-pattern this manual already records for `order_url` (app manual V12.2).
--
-- 🔴 WHAT THIS DOES NOT DO: nothing reads this table. run-scraper.js:453 still builds `excludedTerms`
-- from the Sheet's Exclusions tab. This closes the data gap; the read switch is EXCLUSIONS_FROM=db,
-- a separate, later step.

set lock_timeout = '3s';

begin;

create table if not exists public.discovery_exclusion_terms (
  id          uuid primary key default gen_random_uuid(),

  -- The term exactly as a human or the model wrote it, for display.
  term        text not null,

  -- 🔴 THE VALUE THE SCRAPER ACTUALLY COMPARES: normalizeName(term) (run-scraper.js:55-64).
  -- UNIQUE on this, not on `term`, because 'AXLE + HOP' and 'Axle and Hop' are the SAME rule and
  -- would otherwise both be stored and both be applied.
  term_key    text not null unique,

  -- 'sheet-import-2026-09' | 'scraper' | 'admin'. Provenance the Exclusions tab never had:
  -- it has one column, no timestamp and no author, which is why the three rows removed on
  -- 8 September could not be attributed to a person or to the machine.
  source      text not null,

  -- 🔴 THE POISON FLAG. Set when term_key fuzzy-matches a REAL truck name at insert time. A term that
  -- matches a truck silences that truck (run-scraper.js:860) and, in the Apps Script, DELETES its
  -- future events (v6.57:245). Recorded, not dropped and not silently kept.
  hits_truck  text,

  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists discovery_exclusion_terms_key on public.discovery_exclusion_terms (term_key);

-- Service role only — same three defences as every other operational table here.
alter table public.discovery_exclusion_terms enable row level security;
drop policy if exists "service_role only" on public.discovery_exclusion_terms;
create policy "service_role only" on public.discovery_exclusion_terms
  for all to service_role using (true) with check (true);
revoke all on public.discovery_exclusion_terms from anon, authenticated, public;

commit;

notify pgrst, 'reload schema';
