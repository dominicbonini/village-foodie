-- supabase/migrations/20261046_global_players_1.sql — global-players-1 (29 October 2026, docs/global-players-1-report.md).
-- ⛔ NOT RUN — Dominic runs it, BEFORE the deploy's first workflow run (the importer refuses a 'pos' competitor until the
-- focus CHECK allows it, and records why). Everything that reads the new columns reads them tolerantly until then.
--
-- 1 · competitors.focus gains 'pos' — the big restaurant till / POS players (Square, SumUp, Zettle, Lightspeed, Toast,
--     Clover), now compared in every country where they sell (Dominic, 29 Oct). Delivery marketplaces stay out.
-- 2 · competitors.not_in_countries — the countries an accepted "not sold here" finding (outcome 'not_in_country') ruled
--     out: the competitor drops out of that country's deep check and comparison table.
-- 3 · competitors.deep_checked_in — per country, when a competitor that sells in SEVERAL countries was last deep-checked
--     there (the deep check reads one country at a time for them). A scheduling column: the checker may write it.
-- 4 · competitor_check_findings: the field 'availability' and the outcomes 'in_country' / 'not_in_country'.
-- 5 · comparison_entries.group_label — an optional override of the group label under a tool's name on the comparison page
--     (e.g. "Kasse mit Online-Shop"); null = the label for the competitor's focus, from messages.
--
-- 🔴 No new table; RLS and grants on these tables are unchanged (service role only).

begin;

-- ── 1 · focus 'pos' ─────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.competitors drop constraint if exists competitors_focus_check;
alter table public.competitors add constraint competitors_focus_check
  check (focus in ('food_truck', 'street_food_markets', 'nearest_local', 'pop_up', 'pos'));

-- ── 2 · 3 · availability and per-country deep checks ────────────────────────────────────────────────────────────────
alter table public.competitors
  add column if not exists not_in_countries text[] not null default '{}',
  add column if not exists deep_checked_in  jsonb  not null default '{}'::jsonb;
alter table public.competitors drop constraint if exists competitors_not_in_countries_chk;
alter table public.competitors add constraint competitors_not_in_countries_chk
  check (array_to_string(not_in_countries, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$');
alter table public.competitors drop constraint if exists competitors_deep_checked_in_chk;
alter table public.competitors add constraint competitors_deep_checked_in_chk check (jsonb_typeof(deep_checked_in) = 'object');

-- ── 4 · the findings' new outcomes ──────────────────────────────────────────────────────────────────────────────────
alter table public.competitor_check_findings drop constraint if exists competitor_check_findings_outcome_check;
alter table public.competitor_check_findings add constraint competitor_check_findings_outcome_check
  check (outcome in ('changed', 'unchanged', 'new_plan', 'plan_gone', 'new_url', 'classification', 'blocked', 'page_gone', 'not_stated',
                     'in_country', 'not_in_country'));

-- ── 5 · the group label override ────────────────────────────────────────────────────────────────────────────────────
alter table public.comparison_entries add column if not exists group_label text;
alter table public.comparison_entries drop constraint if exists comparison_entries_group_label_chk;
alter table public.comparison_entries add constraint comparison_entries_group_label_chk
  check (group_label is null or length(btrim(group_label)) between 1 and 60);

commit;

-- Check:
--   select pg_get_constraintdef(oid) from pg_constraint where conname in ('competitors_focus_check', 'competitor_check_findings_outcome_check');
--   select name, focus, lifecycle, not_in_countries, deep_checked_in from public.competitors where focus = 'pos';
