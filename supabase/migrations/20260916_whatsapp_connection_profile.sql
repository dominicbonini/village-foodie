-- 20260916_whatsapp_connection_profile.sql
-- ⛔ ALREADY APPLIED IN PRODUCTION BY HAND, 16 September 2026, BEFORE THIS FILE EXISTED.
-- 🔴 THIS FILE IS A RECORD, NOT AN INSTRUCTION. Do not run it expecting it to do something: the two
-- columns are already there and PostgREST has already been reloaded. It exists so the repo's migration
-- history matches the database, because a column that no migration mentions is one the next reader
-- cannot account for.
-- ⚠️ CORRECT THIS HEADER IF IT IS EVER RUN SOMEWHERE ELSE. A stale "already applied" on a fresh
-- environment has misled this project before, in both directions.
--
-- ── WHAT THEY HOLD ──────────────────────────────────────────────────────────────────────────────────
--   display_phone_number  the number in human form, as META reports it for the connected phone number id
--   verified_name         the business name Meta has approved, empty until it does
-- 🔴 NEITHER IS `trucks.whatsapp_sender`. That column is a free-text value the operator typed and is
-- read by the webhook's sender fallback and by customer emails; these two are Meta's own answer about a
-- connected number and are display-only. Do not reconcile them.
-- Both are NULLABLE and stay null when the lookup fails — onboarding must never depend on them.

alter table public.whatsapp_connections
  add column if not exists display_phone_number text,
  add column if not exists verified_name text;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA AND THE NEW COLUMNS READ AS ABSENT. That trap has
-- cost this project a round trip three times in two days.
notify pgrst, 'reload schema';
