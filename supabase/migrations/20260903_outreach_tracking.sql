-- 20260903_outreach_tracking.sql
-- Outreach tracking for the discovery-list prospecting programme (manual V12.1 outreach section).
--
-- ── HOW TO APPLY ────────────────────────────────────────────────────────────────────────────────────
-- Run BY HAND in the Supabase SQL editor, as every migration in this project is. It is NOT run by any
-- tooling. Idempotent (`if not exists` / `on conflict do nothing`), so re-running is safe.
-- After applying: `notify pgrst, 'reload schema';` so PostgREST picks up the new tables (last line).
--
-- ── 🔴 SECURITY POSTURE — THE V12.1 LESSON APPLIED ──────────────────────────────────────────────────
-- Nine tables in this database carried a policy named "service role full access" that was granted to the
-- PUBLIC role — because the CREATE POLICY had no `TO` clause and an omitted `TO` defaults to PUBLIC, which
-- includes anon and authenticated. The anon key printed in the page source read every dashboard token.
-- These two tables carry prospect contact data and message bodies and must be reachable by NOTHING but the
-- service role. Three defences, all required:
--   1. RLS ENABLED (default-deny once no policy matches).
--   2. NO policy granting anything to public / anon / authenticated. The only policy is TO service_role,
--      named explicitly. (The service role bypasses RLS anyway, so this policy is documentation of intent
--      more than a functional grant — but it can never accidentally admit anon.)
--   3. anon and authenticated grants explicitly REVOKED. 🔴 THIS IS THE STEP THE OTHER PRIVATE TABLES
--      SKIPPED. Supabase's default privileges GRANT anon + authenticated on every new table in `public`,
--      so `enable row level security` alone leaves the grant in place (withheld only by default-deny) —
--      exactly the "policy dropped but grant intact" half-state the V12.1 sweep flagged as OPEN on seven
--      tables. Revoking removes the capability itself. Revoked from PUBLIC too, to catch the pseudo-role
--      the nine policies were mistakenly granted through.
--
-- The FK to discovery_trucks takes a brief lock on a table the live site reads; the whole file runs under
-- a 3s lock_timeout so it aborts rather than queues behind a long read on a trading day.

set lock_timeout = '3s';

begin;

-- ── outreach_prospects — one row per prospect ───────────────────────────────────────────────────────
-- 🔴 NO CHECK CONSTRAINT ON `stage`. PostgREST exposes no CHECK metadata, so a constraint here cannot be
-- read back to build the UI and becomes a rule with one silent enforcement side. Valid values live in ONE
-- exported constant (lib/outreach.ts OUTREACH_STAGES) that both the page and the route import; the route
-- validates every write against it. Same reasoning for the platform tag (free text, derived from a host).
create table if not exists public.outreach_prospects (
  id                  uuid        primary key default gen_random_uuid(),
  discovery_truck_id  uuid        not null unique references public.discovery_trucks(id),
  stage               text        not null default 'not_contacted',  -- lib/outreach.ts OUTREACH_STAGES
  platform            text,                                          -- competitor/current-platform tag; null = unknown, distinct from none
  whatsapp_number     text,
  whatsapp_confirmed  boolean     not null default false,
  next_action_at      date,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── outreach_contacts — the contact log, one row per touch ──────────────────────────────────────────
-- Same no-CHECK / shared-constant rule for channel / direction / kind (lib/outreach.ts CONTACT_*).
-- `on delete cascade`: a contact has no meaning without its prospect.
create table if not exists public.outreach_contacts (
  id            uuid        primary key default gen_random_uuid(),
  prospect_id   uuid        not null references public.outreach_prospects(id) on delete cascade,
  contacted_at  timestamptz not null default now(),
  channel       text,       -- lib/outreach.ts CONTACT_CHANNELS
  direction     text,       -- lib/outreach.ts CONTACT_DIRECTIONS
  kind          text,       -- lib/outreach.ts CONTACT_KINDS
  message       text,       -- the actual message body sent
  created_at    timestamptz not null default now()
);

-- Most-recent-first history per prospect, and the OUTBOUND-count scan the next-action interval derives from.
create index if not exists outreach_contacts_prospect_contacted_idx
  on public.outreach_contacts (prospect_id, contacted_at desc);

-- ── RLS + GRANTS — private, service-role only ───────────────────────────────────────────────────────
alter table public.outreach_prospects enable row level security;
alter table public.outreach_contacts  enable row level security;

-- Explicit service-role-only policy (named TO service_role, never a bare/PUBLIC one).
drop policy if exists "service_role only" on public.outreach_prospects;
create policy "service_role only" on public.outreach_prospects
  for all to service_role using (true) with check (true);

drop policy if exists "service_role only" on public.outreach_contacts;
create policy "service_role only" on public.outreach_contacts
  for all to service_role using (true) with check (true);

-- 🔴 REVOKE the default grants Supabase applies to new public tables. Without this, anon/authenticated
-- retain SELECT/INSERT/UPDATE/DELETE (withheld only by RLS default-deny) — the exact half-state V12.1
-- flagged. Revoked from PUBLIC as well, so no pseudo-role path remains.
revoke all on public.outreach_prospects from anon, authenticated, public;
revoke all on public.outreach_contacts  from anon, authenticated, public;

-- ── PART 2 — BACKFILL: one prospect per discovery truck, platform derived from order_url's host ──────
-- 🔴 THE HOST IS THE SIGNAL, NOT A TRUCK LIST. `*.hatchesup.app` (and the bare apex) → 'Hatches Up';
-- any other host is stored verbatim (the three own-domain trucks); a NULL order_url stays NULL platform so
-- "unknown" is distinguishable from "none". This mirrors lib/outreach.ts platformFromOrderUrl() exactly.
-- `on conflict (discovery_truck_id) do nothing`: the UNIQUE FK makes a re-run a no-op rather than an error.
insert into public.outreach_prospects (discovery_truck_id, platform)
select
  dt.id,
  case
    when x.host is null or x.host = '' then null
    when x.host = 'hatchesup.app' or x.host like '%.hatchesup.app' then 'Hatches Up'
    else x.host
  end as platform
from public.discovery_trucks dt
-- host = the order_url with the scheme stripped, cut at the first '/', ':', '?' or '#', lower-cased.
-- A left join lateral so a NULL/blank order_url yields a NULL host (→ NULL platform), never a dropped row.
left join lateral (
  select case
    when dt.order_url is null or btrim(dt.order_url) = '' then null
    else lower(
      split_part(
        split_part(
          split_part(
            split_part(regexp_replace(dt.order_url, '^https?://', '', 'i'), '/', 1),
          ':', 1),
        '?', 1),
      '#', 1)
    )
  end as host
) x on true
on conflict (discovery_truck_id) do nothing;

commit;

-- Make PostgREST aware of the new tables.
notify pgrst, 'reload schema';
