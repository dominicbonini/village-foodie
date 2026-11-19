-- 20261119_faq_translations_locale_3letter.sql — plans-everywhere-3 (19 November 2026, docs/plans-everywhere-3-report.md):
-- LET THE FAQ TRANSLATOR WRITE FILIPINO (fil-PH). faq_translations_locale_check only accepted a TWO-letter language code
-- ('^[a-z]{2}-[A-Z]{2}$'), so since fil-PH became a language base (18 Nov) every translator run has failed at its write —
-- "new row for relation "faq_translations" violates check constraint "faq_translations_locale_check"" — and NOTHING has been written
-- for any language since 18 Nov 14:40 UTC (sw-TZ, si-LK, ta-LK, ca-AD, sq-AL, bs-BA, mk-MK have no FAQ at all; /tz/faq is a 404).
-- This widens the rule to a two- OR three-letter language code. Nothing else changes; no row is written.
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261119_faq_translations_locale_3letter.sql
--
-- UNDO (only if Dominic asks; fails while any fil-PH row exists):
--   alter table public.faq_translations drop constraint faq_translations_locale_check;
--   alter table public.faq_translations add constraint faq_translations_locale_check check (locale ~ '^[a-z]{2}-[A-Z]{2}$');
set lock_timeout = '3s';
begin;
alter table public.faq_translations drop constraint if exists faq_translations_locale_check;
alter table public.faq_translations add constraint faq_translations_locale_check check (locale ~ '^[a-z]{2,3}-[A-Z]{2}$');
commit;
-- VERIFY (read-only): select pg_get_constraintdef(oid) from pg_constraint where conname = 'faq_translations_locale_check';
--   → CHECK ((locale ~ '^[a-z]{2,3}-[A-Z]{2}$'::text))
