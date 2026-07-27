-- 20260723_demo_sessions.sql
-- Phase 3: demo persistence (Stage 4) + the cleanup job's run history (§7).
--
-- ✅ APPLIED (confirmed against the live DB 2026-07-23 — both tables present).
--
-- ⚠️ This header previously read "NOT YET APPLIED". It was wrong, and docs/onboarding-flow.md repeated it.
-- Re-running this file is harmless (`create table if not exists`) but also a NO-OP — do not add columns
-- here expecting them to land. Phase 4's additions are a separate ALTER file:
-- 20260723_demo_sessions_phase4.sql.
--
-- ── WHY A TABLE, NOT COLUMNS ON `trucks` ────────────────────────────────────────────────────────────
-- The obvious move is `trucks.demo_email` + `trucks.demo_expires_at`. Rejected:
--   1. It repeats the `is_test` mistake (reference-manual §824) — bolting demo/test lifecycle onto the
--      trucks row, where it becomes a second source of truth about what a truck IS. `demo-` prefixed
--      identity already answers that; expiry and email are SESSION state, not truck state.
--   2. It would put three columns on the trucks table that are permanently NULL for every real operator.
--   3. Row existence is a cleaner signal than a nullable column: no demo session ⇒ no row.
--   4. ON DELETE CASCADE means lib/delete-truck.ts needs NO change — deleting the truck takes the session
--      with it, so there is still exactly ONE delete path (the brief's requirement).
--
-- ── WHY AN EXPLICIT expires_at, NOT created_at + a rule in code ─────────────────────────────────────
--   1. The cleanup job becomes `where expires_at < now()` — the retention rule lives in the data, in one
--      place, instead of being re-derived by every reader.
--   2. Giving an email EXTENDS it: one UPDATE, no rule duplication.
--   3. If the policy ever changes (say 14 days → 7), demos already promised a date KEEP that date. We
--      state the deletion date in the email; retroactively shortening it would break a promise made to a
--      real person. A derived rule cannot express that; a stored timestamp does it for free.

-- ── Demo sessions ───────────────────────────────────────────────────────────────────────────────────
-- DEPLOY-COUPLED (SOFT): lib/provision-demo writes here best-effort inside a try/catch, so applying the
-- code before the migration degrades to "demos aren't persisted and get swept on the 24h rule" rather
-- than breaking provisioning. Apply it promptly all the same — until then, no email capture works.
create table if not exists demo_sessions (
  truck_id      text primary key references trucks(id) on delete cascade,
  email         text,
  created_at    timestamptz not null default now(),
  -- When the cleanup job may delete this demo. Seeded to now() + 24h at provision; pushed to now() + 14d
  -- when an email is captured; pushed forward again on each return visit.
  expires_at    timestamptz not null,
  -- When the return-link email was last sent (null = never). Rate-limits re-sends.
  email_sent_at timestamptz
);

create index if not exists demo_sessions_expires_at on demo_sessions(expires_at);

comment on table demo_sessions is
  'Lifecycle for anonymous demo trucks (id prefixed `demo-`). Row existence = a live demo. Cascades with the truck, so lib/delete-truck.ts remains the single delete path.';

-- ── Cleanup run history ─────────────────────────────────────────────────────────────────────────────
-- ADDITIVE (run-anytime). Mirrors the scraper_run_log pattern, which the manual records as the
-- AUTHORITATIVE run history (a `last_run_at` column on the subject proved unreliable).
--
-- This exists because of a specific, recorded failure: the pg_cron edge functions silently died when the
-- Vault service_role_key secret was deleted — every invocation 401'd and NOTHING surfaced it. A job that
-- writes a row on every invocation, success or failure, makes "it stopped running" a visible fact rather
-- than an absence nobody notices.
create table if not exists demo_cleanup_log (
  id               uuid primary key default gen_random_uuid(),
  run_at           timestamptz not null default now(),
  ok               boolean not null,
  expired_deleted  integer not null default 0,
  orphans_deleted  integer not null default 0,
  -- Per-truck failures from deleteTruckCascade, so a partial delete is diagnosable (which step, which id).
  failures         jsonb,
  error            text,
  duration_ms      integer,
  -- Gap since the previous successful run, in minutes. Populated by the job itself so an INTERMITTENT
  -- death shows up in the history even after it recovers.
  gap_mins         integer
);

create index if not exists demo_cleanup_log_run_at on demo_cleanup_log(run_at desc);

comment on table demo_cleanup_log is
  'One row per demo-cleanup invocation, success or failure. Authoritative run history — the absence of recent rows is the signal that the job has died.';
