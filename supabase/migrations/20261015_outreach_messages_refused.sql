-- 20261015_outreach_messages_refused.sql
-- ⛔ PROPOSED — NOT APPLIED. Apply by hand in the Supabase SQL editor, as every migration here is.
-- docs/outreach-instant-send-report.md.
--
-- WHY. Send is now instant with Undo: the compose window closes when Send is pressed, and the server
-- answers about five seconds later. So a send the server REFUSES (do-not-contact, a guard that asks
-- "send anyway?", a literal {{plans_pdf}}, …) can no longer be shown in the window — it has to be
-- RECORDED, and the prospect flagged through the existing "Emails needing a look" list on Today.
--
--   status 'refused' — a send the server declined BEFORE the mail server was contacted. Nothing was
--                      sent. ⚠️ It is NOT 'failed': a failed row offers Retry, and Retry re-sends the
--                      stored row WITHOUT re-running the guards — a refused send must never take that path.
--   refusal jsonb    — { reason, guards: [{id, kind, message}], request } — the plain-English reason,
--                      the guard sentences exactly as shown (for "Send anyway"), and the send request so
--                      "Send anyway" re-submits the same message through every guard again.
--
-- ⚠️ ADDITIVE. The status list below is the current one (20260929_outreach_messages_poll_states.sql)
-- plus 'refused'; no row changes. Until this is applied the route records nothing and behaves as before
-- (the refusal is still returned, and the toast still says why) — it probes for the `refusal` column.
set lock_timeout = '3s';
begin;

alter table public.outreach_messages drop constraint if exists outreach_messages_status_check;
alter table public.outreach_messages add constraint outreach_messages_status_check
  check (status in ('sending', 'sent', 'failed', 'uncertain', 'bounced', 'received', 'auto_reply', 'bounce', 'refused'));

alter table public.outreach_messages add column if not exists refusal jsonb;

comment on column public.outreach_messages.refusal is
  'Set only on status = refused: { reason, guards: [{ id, kind, message }], request }. Nothing was sent.';

commit;

-- Make PostgREST aware of the new column.
notify pgrst, 'reload schema';

-- Check (read-only):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'outreach_messages_status_check';
--   select column_name, data_type from information_schema.columns
--    where table_name = 'outreach_messages' and column_name = 'refusal';
