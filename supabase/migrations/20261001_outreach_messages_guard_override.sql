-- 20261001_outreach_messages_guard_override.sql
-- One column, so a waved guard is recorded on the email it is about.
--
-- ✅ ALREADY APPLIED, AND THAT IS WHY THIS FILE IS BEING WRITTEN NOW rather than the day the column
--    appeared. It is in `information_schema` today (`guard_override | jsonb`). The SQL was given in
--    docs/outreach-recorded-steps-report.md §4 and in the chat reply, run by hand, and NEVER COMMITTED
--    — so the repository's own record of the schema did not contain a column three selects name.
--
-- ⚠️ RUNNING IT AGAINST A DATABASE THAT ALREADY HAS THE COLUMN IS A NO-OP. `add column if not exists`
--    and `comment on` are both idempotent; this re-states what is there, it does not change it.
--
-- ── 🔴 WHY A MISSING MIGRATION FILE IS A DEFECT AND NOT A TIDINESS PROBLEM ─────────────────────────
-- `supabase/migrations/` is the only written record of this schema that travels with the code. On
-- 2 October 2026 a harness was added (scripts/outreach-schema-census.cjs) that checks every column
-- named in a select against that record, because a column that does not exist had just stopped every
-- outreach send for a day (`outreach_messages.preview`, 42703 — docs/outreach-send-read-failure-report.md).
-- 🔴 THAT CHECK IS ONLY AS GOOD AS THE RECORD IT READS. A column applied by hand and never committed
-- is indistinguishable, to the census and to a new database, from one that was invented — so the
-- census had to either flag it or carry an exception, and an exception for "we know this one is fine"
-- is the hole the next `preview` goes through. Committing the file is the honest half of the fix.
-- ⚠️ A FRESH DATABASE NEEDED THIS ANYWAY. Without this file, `supabase db reset` produces a schema
-- the send route and the timeline route both probe for and degrade on, silently, for ever.
begin;

alter table public.outreach_messages
  add column if not exists guard_override jsonb;

comment on column public.outreach_messages.guard_override is
  'The guards waved through when this message was sent: [{"id","message"}], with the sentences as they were shown. Null on a clean send and on every row written before this column existed. Replaces the "Sent anyway:" note in outreach_events; existing notes are left alone.';

commit;

-- 🔴 PostgREST caches the schema. Until it reloads, selecting the column returns PGRST204 — which both
--    probes (`messagesHaveGuardOverride`, in the send route and the timeline route) read as "not there"
--    and degrade on, so the only symptom is a missing grey line.
notify pgrst, 'reload schema';

-- ── VERIFICATION ──────────────────────────────────────────────────────────────────────────────────
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'outreach_messages' and column_name = 'guard_override';

-- How many sends carry a waved guard. ⚠️ Null and absent are the same thing here on purpose: "no
-- warning was waved" and "this row predates the column" are both null, and neither claims the other.
select count(*) as messages, count(guard_override) as sent_after_a_warning
from public.outreach_messages;
