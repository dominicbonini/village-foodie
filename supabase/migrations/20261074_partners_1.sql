-- 20261074_partners_1.sql — Admin › Partners (partners-1, 5 November 2026)
--
-- A simple outreach list for associations, organisers, consultants, suppliers, directories and press,
-- emailed through the SAME outreach mail machinery as truck prospects (outreach_messages).
--
-- ── WHAT THIS DOES ───────────────────────────────────────────────────────────────────────────────────
--   1. NEW TABLE partner_orgs   — one row per organisation. Email unique (case-insensitive) when present.
--   2. NEW TABLE partner_events — the timeline's notes and status changes.
--   3. outreach_messages: ADD partner_id (nullable) → partner_orgs(id), and let prospect_id be null, with a
--      CHECK that every row belongs to EXACTLY ONE of a prospect or a partner.
--
-- ── 🔴 ADDITIVE ONLY ─────────────────────────────────────────────────────────────────────────────────
--   • No existing row is updated or deleted. Every existing outreach_messages row has a prospect_id and,
--     after this, a null partner_id — so it satisfies the new CHECK exactly as it stands.
--   • prospect_id loses its NOT NULL only so a PARTNER's email can be stored; the CHECK still forbids a
--     row with neither. A truck-outreach row still always has a prospect_id, so nothing truck outreach
--     reads changes meaning (the global reads that could meet a partner row filter `prospect_id is not
--     null` in the code shipped with this file).
--   • No outreach_templates row is created, edited, seeded or deactivated.
--
-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────────────
-- The outreach pattern (20260928_outreach_messages.sql): RLS on, one service_role policy, and anon /
-- authenticated / public REVOKED. Every reader and writer is a server route using the service role.
--
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261074_partners_1.sql
set lock_timeout = '3s';
begin;

-- ── 1 · partner_orgs ─────────────────────────────────────────────────────────────────────────────────
create table if not exists public.partner_orgs (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(btrim(name)) > 0),
  type              text not null default 'other'
                    check (type in ('association', 'organiser', 'consultant', 'supplier', 'directory', 'press', 'other')),
  country_code      text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  region            text,
  website           text,
  contact_name      text,
  contact_role      text,
  email             text,
  phone             text,
  linkedin_url      text,
  -- How Dominic found them (free text: "NCASS member list", "met at Foodies Festival", …).
  source            text,
  status            text not null default 'to_contact'
                    check (status in ('to_contact', 'contacted', 'replied', 'in_talks', 'partner', 'not_now')),
  priority          text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  next_follow_up_on date,
  -- What was offered, and what came of it.
  offered           text,
  outcome           text,
  notes             text,
  last_contacted_at timestamptz,
  last_reply_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Email unique, case-insensitive, WHEN PRESENT (blank and null are both "no email" and may repeat).
create unique index if not exists partner_orgs_email_ci_key
  on public.partner_orgs (lower(btrim(email)))
  where email is not null and btrim(email) <> '';

create index if not exists partner_orgs_follow_up_idx on public.partner_orgs (next_follow_up_on);

comment on table public.partner_orgs is
  'Admin › Partners: associations, organisers, consultants, suppliers, directories and press Dominic contacts. Server routes only (service role).';
comment on column public.partner_orgs.status is
  'to_contact | contacted | replied | in_talks | partner | not_now. Automatic only for: first email sent (to_contact → contacted) and a reply received (contacted → replied). Every change is logged in partner_events.';

-- ── 2 · partner_events ───────────────────────────────────────────────────────────────────────────────
create table if not exists public.partner_events (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partner_orgs(id) on delete cascade,
  kind        text not null check (kind in ('note', 'status')),
  body        text,
  from_status text,
  to_status   text,
  created_at  timestamptz not null default now(),
  constraint partner_events_shape check (
    (kind = 'note' and body is not null and length(btrim(body)) > 0)
    or (kind = 'status' and to_status is not null)
  )
);

create index if not exists partner_events_partner_created_idx
  on public.partner_events (partner_id, created_at desc);

comment on table public.partner_events is
  'The Partners timeline''s notes and status changes (emails come from outreach_messages.partner_id). Server routes only.';

-- ── 3 · outreach_messages.partner_id ─────────────────────────────────────────────────────────────────
alter table public.outreach_messages
  add column if not exists partner_id uuid references public.partner_orgs(id) on delete cascade;

alter table public.outreach_messages alter column prospect_id drop not null;

-- A message belongs to a prospect OR a partner — exactly one. Every existing row (prospect_id set,
-- partner_id null) already satisfies it.
alter table public.outreach_messages drop constraint if exists outreach_messages_one_owner;
alter table public.outreach_messages add constraint outreach_messages_one_owner
  check (num_nonnulls(prospect_id, partner_id) = 1);

create index if not exists outreach_messages_partner_date_idx
  on public.outreach_messages (partner_id, message_date desc nulls last)
  where partner_id is not null;

comment on column public.outreach_messages.partner_id is
  'Set for an email to or from a partner (Admin › Partners); then prospect_id is null. Exactly one of the two is set (outreach_messages_one_owner).';

-- ── RLS: the outreach pattern ────────────────────────────────────────────────────────────────────────
alter table public.partner_orgs enable row level security;
drop policy if exists "service_role only" on public.partner_orgs;
create policy "service_role only" on public.partner_orgs
  for all to service_role using (true) with check (true);
revoke all on public.partner_orgs from anon, authenticated, public;

alter table public.partner_events enable row level security;
drop policy if exists "service_role only" on public.partner_events;
create policy "service_role only" on public.partner_events
  for all to service_role using (true) with check (true);
revoke all on public.partner_events from anon, authenticated, public;

commit;

notify pgrst, 'reload schema';

-- ── VERIFY (read-only) ───────────────────────────────────────────────────────────────────────────────
-- select table_name, column_name, is_nullable from information_schema.columns
--  where table_schema = 'public' and table_name = 'outreach_messages' and column_name in ('prospect_id', 'partner_id');
-- select count(*) as rows, count(prospect_id) as with_prospect, count(partner_id) as with_partner from public.outreach_messages;
-- select relname, relrowsecurity from pg_class where relname in ('partner_orgs', 'partner_events');
-- select grantee, table_name, privilege_type from information_schema.role_table_grants
--  where table_name in ('partner_orgs', 'partner_events') and grantee in ('anon', 'authenticated');   -- expect none
