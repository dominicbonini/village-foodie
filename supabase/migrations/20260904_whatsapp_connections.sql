-- 20260904_whatsapp_connections.sql
-- Per-truck WhatsApp Business connection state, written by Embedded Signup (S1 of the Embedded Signup
-- workstream — see docs/whatsapp-embedded-signup-scope-report.md).
--
-- ⛔ NOT APPLIED. THIS TABLE DOES NOT EXIST UNTIL DOMINIC RUNS THIS BY HAND IN THE SUPABASE SQL EDITOR.
-- Every migration in this project is applied by hand; nothing in the repo runs it. Idempotent
-- (`if not exists`), so re-running is safe. After applying: `notify pgrst, 'reload schema';` (last line).
--
-- ── 🔴 WHY A SEPARATE TABLE AND NOT COLUMNS ON `trucks` ──────────────────────────────────────────────
-- Live routes read `trucks` (and `operators`) with `select('*')` — app/api/dashboard/route.ts:92-93 and
-- app/api/manage/route.ts:162, and app/api/dashboard/route.ts:189 names the pattern in its own comment.
-- A token column on `trucks` would therefore be returned by those routes THE MOMENT IT EXISTS, and every
-- column added later is opted in by default. 🔴 A REDACTION LIST FAILS BY OMISSION, SILENTLY — it is a
-- list somebody has to remember to update, and nothing fails when they do not. That is the same class as
-- the V12.1 `dashboard_token` exposure, where the anon key returned ten live dashboard credentials.
-- A separate table is not reached by those reads at all. The separation is the control; the encryption
-- below is the second layer, not the first.
--
-- ── ⚠️ WHAT THE ENCRYPTION ON `access_token_ciphertext` DOES AND DOES NOT DO ─────────────────────────
-- App-level AES-256-GCM (lib/whatsapp/token-crypto.ts). 🔴 IT IS NOT PROTECTION AGAINST A COMPROMISED
-- PROCESS: anything that can run our code can read the key from the environment and decrypt. What it
-- raises the bar on is DUMPS, BACKUPS AND EXPORTS — a stolen .sql dump, a copied backup, a support
-- export, a screenshot of a table view. Do not write "encrypted at rest" and stop; that phrasing implies
-- a guarantee this does not give.
--
-- ── 🔴 TOKENS EXPIRE AFTER 60 DAYS, AND THAT IS THE NORMAL CASE ─────────────────────────────────────
-- The Facebook Login for Business configuration (2892063604490064) was created from Meta's
-- "WhatsApp Embedded Signup Configuration With 60 Expiration Token" template. `token_expires_at` is
-- therefore NOT NULL and load-bearing: reauthorisation is routine, not an error path. A row whose token
-- has passed `token_expires_at` is treated as revoked by the state machine.

set lock_timeout = '3s';

begin;

create table if not exists public.whatsapp_connections (
  -- One row per truck. The FK is the identity: a truck has zero or one WhatsApp connection.
  -- 🔴 TEXT, NOT uuid. CORRECTED 4 September 2026 — it was declared `uuid` and that was WRONG.
  -- `trucks.id` IS TEXT: live ids are slugs like 'pizzeria-gusto' and 'test-truck', not uuids. The
  -- reference manual records this as RULE (V6.2): "trucks.id is text, not uuid. Every FK column
  -- referencing trucks(id) must be text... Declaring them uuid FAILS THE MIGRATION OR SILENTLY NEVER
  -- MATCHES." ⚠️ The second half is the dangerous one — a type mismatch that does not error is a table
  -- that never joins. Every other FK to trucks(id) in this repo is text; the closest analogue is
  -- 20260723_demo_sessions.sql, identical in shape:
  --     truck_id text primary key references trucks(id) on delete cascade
  -- 🔴 CASCADE DIRECTION: deleting a TRUCK deletes its connection row. Nothing about this table can
  -- delete a truck — an FK cascade only ever runs from the referenced row toward the referencing one.
  truck_id                 text        primary key references public.trucks(id) on delete cascade,

  -- ── IDENTIFIERS RETURNED BY EMBEDDED SIGNUP ──────────────────────────────────────────────────────
  -- 🔴 These mirror WhatsAppConnectionInput in lib/whatsapp/connection-state.ts field for field, so the
  -- state machine consumes a row with no adaptation layer. Do not rename one without the other.
  waba_id                  text        not null,
  -- NULL = the number step never finished. The state machine reads that as 'onboarding_incomplete'.
  phone_number_id          text,
  -- The Meta business (portfolio) id that owns the WABA. Returned by the flow; kept for support and for
  -- any future Graph call that is scoped to the business rather than the WABA.
  business_id              text,

  -- ── 🔴 THE FINISH TYPE. STORE IT — IT IS NOT DERIVABLE LATER. ────────────────────────────────────
  -- FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING means the customer onboarded THEIR EXISTING WhatsApp
  -- Business app number — the COEXISTENCE case, and the one every food truck will hit, because every
  -- truck already has WhatsApp Business on a phone with that number on their flyers.
  -- FINISH (Cloud-API-only) means a number was provisioned into the Cloud API instead.
  -- 🔴 LOSING THIS LOSES THE ABILITY TO TELL COEXISTENCE TRUCKS FROM CLOUD-API-ONLY ONES, which changes
  -- what is safe to say to an operator about their phone and what support can assume. Free text
  -- deliberately: Meta may add finish types, and an unknown value must store rather than fail.
  finish_type              text,

  -- ── THE CREDENTIAL ───────────────────────────────────────────────────────────────────────────────
  -- 🔴 CIPHERTEXT ONLY. NEVER A PLAINTEXT TOKEN IN THIS COLUMN. Written and read exclusively through
  -- lib/whatsapp/token-crypto.ts. The column name says ciphertext so a reader cannot mistake it.
  access_token_ciphertext  text,
  -- 🔴 NOT NULL AND LOAD-BEARING (60-day tokens). A connection with a token must know when it dies.
  -- Nullable only while no token is held (token_missing / onboarding_incomplete), enforced by the CHECK.
  token_expires_at         timestamptz,
  -- When the token was OBSERVED revoked or expired. Non-null outranks everything in the derivation.
  token_revoked_at         timestamptz,

  -- ── META-REPORTED STATE ──────────────────────────────────────────────────────────────────────────
  -- 🔴 NULL MEANS UNREAD, NOT ABSENT. An unread value must never render as "you have not paid".
  -- The state machine only treats an explicit `false` as 'awaiting_payment_method'.
  payment_method_present   boolean,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- 🔴 A HELD TOKEN MUST CARRY ITS EXPIRY. The two are written together or not at all — this is what
  -- makes token_expires_at load-bearing rather than advisory. It is a CHECK rather than a bare NOT NULL
  -- because a row legitimately exists before the token does (partial onboarding).
  constraint whatsapp_connections_token_expiry_together
    check (access_token_ciphertext is null or token_expires_at is not null)
);

-- Support lookup by the routing key. Partial: only rows that actually carry one.
create unique index if not exists whatsapp_connections_phone_number_id_key
  on public.whatsapp_connections (phone_number_id)
  where phone_number_id is not null;

-- ── RLS + GRANTS — SERVICE ROLE ONLY, IN THIS SAME MIGRATION ────────────────────────────────────────
-- 🔴 THE V12.1 LESSON, APPLIED IN FULL. Three defences, all required:
--   1. RLS enabled (default-deny once no policy matches).
--   2. NO policy granting anything to public / anon / authenticated. The only policy names service_role
--      explicitly. (The service role bypasses RLS anyway, so this is documentation of intent as much as
--      a grant — but it can never accidentally admit anon.)
--   3. 🔴 GRANTS REVOKED. Supabase's default privileges GRANT anon + authenticated on every new table in
--      `public`, so `enable row level security` alone leaves the capability in place, withheld only by
--      default-deny — the exact "policy dropped but grant intact" half-state V12.1 flagged. Revoking
--      removes the capability itself. Revoked from PUBLIC too, to catch the pseudo-role.
alter table public.whatsapp_connections enable row level security;

drop policy if exists "service_role only" on public.whatsapp_connections;
create policy "service_role only" on public.whatsapp_connections
  for all to service_role using (true) with check (true);

revoke all on public.whatsapp_connections from anon, authenticated, public;

commit;

-- Make PostgREST aware of the new table.
notify pgrst, 'reload schema';
