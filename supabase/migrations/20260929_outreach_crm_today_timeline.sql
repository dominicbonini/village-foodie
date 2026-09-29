-- 20260929_outreach_crm_today_timeline.sql
-- The two columns that make a reply "waiting for me", and the table that records what happened.
--
-- ✅ APPLIED BY HAND on 29 September 2026, in the Supabase SQL editor, by Dominic. This file is the
--    record of what was run, not a pending change.
--
-- ── 🔴 WHY A REPLY NEEDS A STATE OF ITS OWN ────────────────────────────────────────────────────────
-- Before this, "have I dealt with that reply?" was answerable only by reading the thread. The stage
-- says `replied` from the first inbound message until somebody changes it by hand, so it cannot say
-- whether the last one has been answered. `handled_at` is that fact and nothing else.
--
-- ⚠️ EVERY INBOUND ROW THAT EXISTED WAS SET `handled_at = now()` IN THIS MIGRATION. Without that the
-- Today screen would have opened on months of historical replies, all presented as work waiting —
-- which is exactly the "231 rows in no order" problem §57 exists to end. Nothing historical is
-- waiting; only what arrives from now on is.
--
-- ⚠️ `snoozed_until` IS SEPARATE FROM `handled_at`, deliberately. "Not now" is not "done": a snoozed
-- reply comes back on its own, and Mark as needing reply clears both so it comes back immediately.
begin;

alter table public.outreach_messages add column if not exists handled_at    timestamptz;
alter table public.outreach_messages add column if not exists snoozed_until timestamptz;

comment on column public.outreach_messages.handled_at is
  'When this inbound message stopped needing attention. Set by hand, or automatically when an outbound contact is logged after it.';
comment on column public.outreach_messages.snoozed_until is
  'Hidden from Today until this instant. Not the same as handled: a snooze comes back.';

update public.outreach_messages set handled_at = now()
  where direction = 'inbound' and handled_at is null;

-- ── 🔴 WHAT HAPPENED, AS OPPOSED TO WHAT WAS SAID ─────────────────────────────────────────────────
-- `outreach_contacts` is the ladder — a record of touches, and §57 derives the next step from it.
-- A stage change is not a touch and a note is not a contact; putting either in that table would
-- change what the work queue computes. This is the second, inert stream, and the timeline merges it.
create table if not exists public.outreach_events (
  id          uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  kind        text not null check (kind in ('stage_change','note')),
  from_stage  text,
  to_stage    text,
  body        text,
  created_at  timestamptz not null default now()
);

create index if not exists outreach_events_prospect_created_idx
  on public.outreach_events (prospect_id, created_at desc);

-- 🔴 SERVICE ROLE ONLY, like every other outreach table. The admin routes hold the service key; no
-- browser session may read a word of this.
alter table public.outreach_events enable row level security;
revoke all on public.outreach_events from anon, authenticated;

commit;

-- 🔴 PostgREST caches the schema, columns and tables included. Run with the file.
notify pgrst, 'reload schema';
