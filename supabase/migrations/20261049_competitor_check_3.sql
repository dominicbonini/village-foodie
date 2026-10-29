-- supabase/migrations/20261049_competitor_check_3.sql — competitor-check-3 (29 October 2026, docs/competitor-check-3-report.md).
-- ⛔ NOT RUN — Dominic runs it before the deploy. Everything that reads the new columns reads them tolerantly until then.
--
-- THE QUICK PASS: one cheap pass over every active competitor in every country it sells in (the key prices and the features
-- shown on that country's comparison page), alongside the thorough deep check, which becomes the later per-country dive.
--
-- 1 · competitor_check_settings: the pass's own models (Haiku by default — extractor_model / verifier_model stay the deep
--     check's), how many checks a day, when it was started and from which country, its hard limits per check (page fetches,
--     searches, page length), and the Message Batch in flight (pass_batch: its id, when it went in, its items, its estimate).
-- 2 · competitors.pass_state — per competitor: the classification read (a candidate's) and, per country, when the pass last
--     checked it there ({"class": "relevant" | "not_relevant", "class_at": …, "done": {"DE": "…"}}). A scheduling column: the
--     checker may write it, so a stopped pass resumes where it stopped.
-- 3 · competitor_check_runs.mode gains 'pass'.
--
-- 🔴 No new table; RLS and grants are unchanged (service role only). The daily and monthly caps still cover every run.

begin;

-- ── 1 · the pass's settings ─────────────────────────────────────────────────────────────────────────────────────────
alter table public.competitor_check_settings
  add column if not exists pass_extractor_model text not null default 'claude-haiku-5-5',
  add column if not exists pass_verifier_model  text not null default 'claude-haiku-5-5',
  add column if not exists pass_per_day         integer not null default 40,
  add column if not exists pass_requested_at    timestamptz,
  add column if not exists pass_country         text,
  add column if not exists pass_max_fetches     integer not null default 3,
  add column if not exists pass_max_searches    integer not null default 1,
  add column if not exists pass_max_page_tokens integer not null default 6000,
  add column if not exists pass_batch           jsonb;
alter table public.competitor_check_settings drop constraint if exists competitor_check_settings_pass_chk;
alter table public.competitor_check_settings add constraint competitor_check_settings_pass_chk check (
  pass_per_day between 0 and 500 and pass_max_fetches between 1 and 10 and pass_max_searches between 0 and 5
  and pass_max_page_tokens between 1000 and 20000 and (pass_country is null or pass_country ~ '^[A-Z]{2}$')
  and (pass_batch is null or jsonb_typeof(pass_batch) = 'object'));

-- ── 2 · per competitor: where the pass has been ──────────────────────────────────────────────────────────────────────
alter table public.competitors add column if not exists pass_state jsonb not null default '{}'::jsonb;
alter table public.competitors drop constraint if exists competitors_pass_state_chk;
alter table public.competitors add constraint competitors_pass_state_chk check (jsonb_typeof(pass_state) = 'object');

-- ── 3 · a run of the pass ────────────────────────────────────────────────────────────────────────────────────────────
alter table public.competitor_check_runs drop constraint if exists competitor_check_runs_mode_check;
alter table public.competitor_check_runs add constraint competitor_check_runs_mode_check check (mode in ('deep', 'routine', 'single', 'pass'));

commit;

-- Check:
--   select pass_extractor_model, pass_verifier_model, pass_per_day, pass_requested_at, pass_country, pass_max_fetches, pass_max_searches, pass_max_page_tokens, pass_batch from public.competitor_check_settings;
--   select count(*) filter (where pass_state <> '{}'::jsonb) from public.competitors;
