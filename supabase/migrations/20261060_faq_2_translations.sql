-- 20261060_faq_2_translations.sql — faq-2 (2 November 2026, docs/faq-2-seo-geo-2-report.md Part A): THE FAQ'S TRANSLATIONS.
--
-- One row per (question, locale) and per (section, locale). A row is a language base (fr-FR, de-DE … all 28) or a regional /
-- English variant (en-US, de-CH, es-MX …) holding ONLY wording that truly differs from its parent (35.am-5); with no row a variant
-- reads its parent. Written only by the translator (.github/workflows/faq-translate.yml → scripts/faq-translate/main.ts).
--   source_hash   sha256 of the exact English the row was made from (lib/faq/translation.ts sourceHashOf): a question's
--                 question_en, answer_en and answer_single_plan_en; a section's title_en. A row whose hash differs from the
--                 current English is out of date and is never shown.
--   status        'ok' (passed every check) or 'failed' (kept with its reason, never shown, retried next run).
-- Security as faq_items: RLS on, no policies, no grant to anon or authenticated — the service role only.
-- No existing row is touched; nothing is deleted.

begin;

create table if not exists public.faq_translations (
  item_id            uuid references public.faq_items(id) on delete cascade,
  section_id         uuid references public.faq_sections(id) on delete cascade,
  source_id          uuid generated always as (coalesce(item_id, section_id)) stored,
  locale             text not null check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  question           text,
  answer             text,
  answer_single_plan text,
  title              text,
  source_hash        text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  model              text,
  translated_at      timestamptz not null default now(),
  status             text not null check (status in ('ok', 'failed')),
  reason             text,
  primary key (source_id, locale),
  -- exactly one of a question or a section
  check ((item_id is null) <> (section_id is null)),
  -- a failed row says why; an ok question row has its question and answer; an ok section row has its title
  check (status = 'ok' or reason is not null),
  check (status <> 'ok' or item_id is null or (question is not null and answer is not null)),
  check (status <> 'ok' or section_id is null or title is not null)
);

create index if not exists faq_translations_locale_idx on public.faq_translations (locale);

alter table public.faq_translations enable row level security;
revoke all on public.faq_translations from anon, authenticated, public;
grant all on public.faq_translations to service_role;

commit;
