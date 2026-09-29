-- 20260929_outreach_messages_attachments.sql
-- The names, types and sizes of an email's attachments.
--
-- ✅ APPLIED BY HAND on 29 September 2026, in the Supabase SQL editor, by Dominic. This file is the
--    record of what was run, not a pending change.
--
-- ── 🔴 METADATA ONLY, AND THAT IS THE WHOLE POINT ─────────────────────────────────────────────────
-- `[{ "filename": "menu.pdf", "contentType": "application/pdf", "size": 184320 }]`. The list comes off
-- the BODYSTRUCTURE the IMAP server has already sent, so it costs nothing to collect, and no
-- attachment PART is ever fetched. A prospect's file is their file; this app has no reason to hold a
-- copy and every reason not to.
--
-- ⚠️ NULLABLE, AND NULL MEANS SOMETHING DIFFERENT FROM `[]`. Null is "this row was written before the
-- bodies were stored, or by a path that did not look"; `[]` is "we looked and there are none". The
-- backfill uses that difference to know what still needs reading.
begin;

alter table public.outreach_messages
  add column if not exists attachments jsonb;

comment on column public.outreach_messages.attachments is
  'Attachment metadata only — filename, contentType, size. Contents are never downloaded or stored.';

commit;

-- 🔴 PostgREST caches the schema, columns included. Run with the file.
notify pgrst, 'reload schema';
