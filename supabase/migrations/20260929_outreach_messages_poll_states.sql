-- 20260929_outreach_messages_poll_states.sql
-- Widen the `outreach_messages` status and source vocabularies for the reply poll.
--
-- ✅ APPLIED BY HAND on 29 September 2026, in the Supabase SQL editor, by Dominic. This file is the
--    record of what was run, not a pending change. Re-running it is safe (each constraint is dropped
--    first) but unnecessary.
--
-- ── WHAT THE NEW VALUES MEAN ───────────────────────────────────────────────────────────────────────
-- STATUS
--   bounced    — an OUTBOUND row the mail system reported undeliverable. Set on the ORIGINAL message,
--                not on the report, so the prospect's own email row is the one that says so.
--   auto_reply — an INBOUND out-of-office or autoresponder. 🔴 Recorded, never logged as a contact:
--                §57.1 exits a prospect's chase sequence on any inbound CONTACT row, so filing an
--                out-of-office as a reply would stop Dominic chasing someone who never answered.
--   bounce     — the INBOUND delivery report itself, kept so the failure can be read in full.
-- SOURCE
--   poll       — written by the reply poll (lib/outreach-mail-poll.ts), as opposed to `system` (this
--                app sent it) or `mailbox_import` (the operator ran the importer).
--
-- ⚠️ THE OLD VALUES ARE ALL STILL VALID. This widens; it removes nothing, so every existing row
-- continues to satisfy the constraint and no data migration is needed.
begin;

alter table public.outreach_messages drop constraint if exists outreach_messages_status_check;
alter table public.outreach_messages add constraint outreach_messages_status_check
  check (status in ('sending', 'sent', 'failed', 'uncertain', 'bounced', 'received', 'auto_reply', 'bounce'));

alter table public.outreach_messages drop constraint if exists outreach_messages_source_check;
alter table public.outreach_messages add constraint outreach_messages_source_check
  check (source in ('system', 'mailbox_import', 'poll'));

commit;

-- 🔴 PostgREST caches the schema, constraints included. Run with the file.
notify pgrst, 'reload schema';
