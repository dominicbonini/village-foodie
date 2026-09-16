-- 20260916_whatsapp_alerts.sql
-- The de-duplication ledger for WhatsApp alert emails, plus the one connection column that records a
-- billing refusal from Meta.
--
-- ⛔ NOT APPLIED. NEITHER THE TABLE NOR THE COLUMN EXISTS UNTIL DOMINIC RUNS THIS BY HAND IN THE
-- SUPABASE SQL EDITOR. Every migration in this project is applied by hand; nothing in the repo runs it.
-- Idempotent (`if not exists`), so re-running is safe. Last line reloads PostgREST — do not skip it.
--
-- ⚠️ UNTIL IT IS APPLIED, THE ALERT SENDER FAILS CLOSED AND SENDS NOTHING. The insert that claims a row
-- errors with PGRST205 (unknown table) and the sender treats that as "not claimed", which means no
-- email rather than a duplicate email. Sending is the thing worth being careful about; silence is safe.
--
-- ── 🔴 WHY THE ROW IS INSERTED BEFORE THE EMAIL IS SENT, NOT AFTER ──────────────────────────────────
-- The unique constraint below is the CLAIM. Two webhook deliveries crossing the 80% threshold in the
-- same millisecond both check "have we emailed yet?", both read no, and both send — the check-then-act
-- race. Inserting first makes the DATABASE decide: exactly one insert wins the unique constraint, and
-- only the winner sends. The loser's `on conflict do nothing` returns no row and it stays quiet.
-- 🔴 AND WHY THE ROW IS DELETED WHEN THE SEND FAILS: a claim that outlives a failed send is a
-- permanent silence — the alert would be marked delivered forever having never been delivered once.
-- Releasing the claim restores the retry. The consequence is accepted and deliberate: a crash BETWEEN
-- the send and a failed delete can send twice. A duplicate warning email is a nuisance; a suppressed
-- "you are about to stop receiving customer messages" email is the failure that matters.

set lock_timeout = '3s';

begin;

create table if not exists public.whatsapp_alerts (
  id           bigserial   primary key,

  -- 🔴 TEXT, NOT uuid. `trucks.id` is text — live ids are slugs like 'pizzeria-gusto'. Declaring this
  -- uuid fails the migration or, worse, silently never matches. Same rule as whatsapp_connections.
  truck_id     text        not null references public.trucks(id) on delete cascade,

  -- Which alert this is. One of the six in WhatsAppAlertKind (lib/whatsapp/alerts.ts).
  -- ⚠️ NO CHECK CONSTRAINT, BY HOUSE RULE. The permitted values live in a TypeScript union and are
  -- enforced at the one place rows are written. A CHECK here would need a migration to add a seventh
  -- alert kind and would fail at runtime, in production, at the moment the new alert first fires.
  kind         text        not null,

  -- What makes this alert distinct from the next one of the same kind — the window it belongs to.
  -- 🔴 THIS COLUMN IS THE ENTIRE DE-DUPLICATION POLICY. It is computed in TypeScript, not here:
  --   limit_80 / limit_100 / payment_blocked  → 'YYYY-MM', the usage month. They are statements about a
  --       monthly allowance, so they may legitimately fire again next month and must not before then.
  --   token_refresh_failing / token_refresh_urgent / token_invalid → 'YYYY-MM-DD', the UTC day. The cron
  --       runs daily, so this is "at most one per run" — which is exactly what makes a second run of the
  --       same day's job send nothing.
  period_key   text        not null,

  created_at   timestamptz not null default now(),

  -- 🔴 THE CLAIM. This constraint is load-bearing, not hygiene: it is what makes concurrent senders
  -- agree on who sends. Removing it does not cause duplicate ROWS, it causes duplicate EMAILS.
  constraint whatsapp_alerts_once unique (truck_id, kind, period_key)
);

-- ── RLS + GRANTS — SERVICE ROLE ONLY ────────────────────────────────────────────────────────────────
-- Same three defences as whatsapp_connections: RLS on, no policy admitting anon/authenticated, and the
-- default Supabase grants REVOKED so the capability is gone rather than merely withheld by default-deny.
alter table public.whatsapp_alerts enable row level security;

drop policy if exists "service_role only" on public.whatsapp_alerts;
create policy "service_role only" on public.whatsapp_alerts
  for all to service_role using (true) with check (true);

revoke all on public.whatsapp_alerts from anon, authenticated, public;

-- ── THE BILLING-REFUSAL MARKER ──────────────────────────────────────────────────────────────────────
-- Set when Meta refuses a send with error 131042 (no usable payment method on the WABA). Cleared back
-- to null on the next send that succeeds.
-- 🔴 THIS IS AN OBSERVATION, NOT A SETTING. It records that Meta actually refused a real send — which is
-- why it is trusted enough to raise a banner in Settings, while `payment_method_present` (never
-- populated by either signup path, null on every live row) is not.
-- ⚠️ IT DOES NOT BLOCK SENDING. Nothing reads it to decide whether to try. Sends keep being attempted;
-- Meta remains the authority on whether it will accept them.
alter table public.whatsapp_connections
  add column if not exists payment_blocked_at timestamptz;

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA AND BOTH THE TABLE AND THE COLUMN READ AS ABSENT.
notify pgrst, 'reload schema';
