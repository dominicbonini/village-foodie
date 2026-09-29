-- 20260929_outreach_messages_account.sql
-- Which mailbox each outreach message lives in.
--
-- ✅ APPLIED BY HAND on 29 September 2026, in the Supabase SQL editor, by Dominic, together with the
--    backfill. This file is the record of what was run, not a pending change.
--
-- ── 🔴 WHY THE COLUMN EXISTS ───────────────────────────────────────────────────────────────────────
-- `mailbox` + `uid` identify a message INSIDE ONE ACCOUNT and are meaningless outside it. Until today
-- there was one account, so the pair was enough. `dominic@hatchgrab.com` is now its own mailbox, and
-- opening a September import against it would either find nothing or find a DIFFERENT message that
-- happens to hold that uid. `account` is the third part of the address.
--
-- ⚠️ `NOT NULL` WITH NO DEFAULT, DELIBERATELY. A default would let a future insert forget to say which
-- mailbox it read from and silently claim the wrong one; with no default, an insert that omits it
-- fails loudly. Every insert in the app names it explicitly.
--
-- ⚠️ EVERY EXISTING ROW IS 'hello'. All the history — the September import, the test sends, every Sent
-- copy — was read from or written to `hello@`, which is exactly where those uids still point.
begin;

alter table public.outreach_messages
  add column if not exists account text;

update public.outreach_messages set account = 'hello' where account is null;

alter table public.outreach_messages
  alter column account set not null;

alter table public.outreach_messages drop constraint if exists outreach_messages_account_check;
alter table public.outreach_messages add constraint outreach_messages_account_check
  check (account in ('hello', 'dominic'));

commit;

-- 🔴 PostgREST caches the schema, columns included. Run with the file.
notify pgrst, 'reload schema';
