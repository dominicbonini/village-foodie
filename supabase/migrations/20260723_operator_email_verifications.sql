-- 20260723_operator_email_verifications.sql
-- M3 (Phase 4 Step 2): email-verification tokens for self-serve signup.
--
-- ADDITIVE — a brand-new table nothing else references. Safe to run any time; ORDER-REQUIRED before the
-- /signup deploy, which writes a row per account created.
--
-- ── WHY A NEW TABLE AND NOT `operator_email_changes` ────────────────────────────────────────────────
-- That table (app/verify-email/page.tsx) is the EMAIL-CHANGE flow: it carries old_email → new_email and
-- its whole job is flipping an address on an existing account. Signup verification confirms the address
-- an account was BORN with; there is no "old". Overloading one table would mean every reader has to ask
-- which kind of row it is holding, and the two fail differently — a failed email change leaves a working
-- account on the old address, a failed signup verification leaves an account nobody can recover.
-- Same shape, deliberately separate lifecycle.
--
-- ── WHY VERIFY AT ALL, GIVEN IT BLOCKS NOTHING AT SIGNUP ────────────────────────────────────────────
-- Verification is sent at signup but NON-BLOCKING (spec O11): an inbox round-trip at the moment of
-- highest intent costs conversions to solve a problem that is not yet urgent. Nothing is public during
-- setup, so an unreachable operator harms nobody. It becomes urgent at GO-LIVE, where lib/go-live-checks.ts
-- gates on it — that is when real customers start placing real orders and every recovery path we have
-- (order notifications, password reset, anything going wrong) runs through this address.
--
-- Sending at signup rather than at go-live is deliberate: that is when the address is freshest in their
-- mind and a typo is most likely to be noticed.
create table if not exists operator_email_verifications (
  id          uuid primary key default gen_random_uuid(),
  operator_id uuid not null references operators(id) on delete cascade,
  -- The address this token proves. Stored rather than joined so a later email change cannot retroactively
  -- make an old verification look like it confirmed the new address.
  email       text not null,
  token       text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  verified_at timestamptz
);

-- The two lookups this table has: by token (the click) and by operator (has this account verified? —
-- what go-live-checks asks).
create index if not exists oev_operator on operator_email_verifications(operator_id);
create index if not exists oev_unverified on operator_email_verifications(operator_id)
  where verified_at is null;

comment on table operator_email_verifications is
  'Signup email-verification tokens. SEPARATE from operator_email_changes (that is the change-address flow, which has an old_email and fails differently). Non-blocking at signup; enforced at go-live by lib/go-live-checks.ts.';
