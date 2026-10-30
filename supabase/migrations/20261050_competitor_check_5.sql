-- supabase/migrations/20261050_competitor_check_5.sql — competitor-check-5 (30 October 2026, docs/competitor-check-5-report.md).
-- ⛔ NOT RUN — Dominic runs it. Optional: until it runs, the checker uses the same values from the code
-- (lib/competitor-check/model.ts DEFAULT_MAX_OUTPUT_TOKENS) — reading the column is tolerant.
--
-- max_output_tokens: max_tokens per model for every Claude call the checker makes (the extractor, the verifier, the quick
-- pass and its batch). The maximum output on the Messages API, from https://platform.claude.com/docs/en/about-claude/models/overview
-- ("Max output", read 30 Oct 2026): 128K tokens for Claude Haiku 5.5 and Claude Sonnet 5.5. A model not named here gets
-- the code's default (32,000 for a model the code does not know). Only whole numbers of at least 1,024 are read.

begin;

alter table public.competitor_check_settings
  add column if not exists max_output_tokens jsonb not null default '{"claude-haiku-5-5": 128000, "claude-sonnet-5-5": 128000}'::jsonb;
alter table public.competitor_check_settings drop constraint if exists competitor_check_settings_max_output_tokens_chk;
alter table public.competitor_check_settings add constraint competitor_check_settings_max_output_tokens_chk check (jsonb_typeof(max_output_tokens) = 'object');

commit;

-- Check:
--   select max_output_tokens from public.competitor_check_settings;
