-- 20260904_whatsapp_connections_token_issued_at.sql
-- Adds `token_issued_at` to public.whatsapp_connections.
--
-- ⛔ NOT APPLIED. THIS COLUMN DOES NOT EXIST UNTIL DOMINIC RUNS THIS BY HAND IN THE SUPABASE SQL
-- EDITOR. Every migration in this project is applied by hand; nothing in the repo runs it.
-- Idempotent (`if not exists`), so re-running is safe.
--
-- ── 🔴 WHY THIS COLUMN, AND WHY THE PROXY IT REPLACES WAS DANGEROUS ─────────────────────────────────
-- The reauthorise prompt fires when a token is inside the last REAUTHORISE_WINDOW_FRACTION (0.25) of
-- its OWN life, so the code needs the lifetime: `token_expires_at - <issue time>`. Until now the issue
-- time was taken from `updated_at`, which was exact ONLY because the signup route happened to be the
-- table's sole writer.
-- 🔴 IT ROTS SILENTLY AND IN THE WRONG DIRECTION. The first future writer to touch a row — filling in
-- `payment_method_present`, say — pushes `updated_at` forward, which makes the token look
-- SHORTER-LIVED than it is and SHRINKS the warning window. The operator gets LESS notice, not more,
-- and nothing anywhere errors. A proxy that fails toward "no warning before a truck goes silent" is
-- not a proxy worth keeping.
--
-- ── ⚠️ WHY NOW, AND WHAT DEFERRING WOULD HAVE COST ──────────────────────────────────────────────────
-- `whatsapp_connections` IS EMPTY and no production code path reads it, so this is one ALTER and
-- nothing else. See the backfill note at the bottom for what this would have cost later.
--
-- ── 🔴 THE CONSTRAINT MIRRORS THE EXISTING ONE. IT DOES NOT INVENT A SECOND PATTERN. ────────────────
-- `whatsapp_connections_token_expiry_together` already says "a held token must carry its expiry":
--     check (access_token_ciphertext is null or token_expires_at is not null)
-- This adds the same sentence for the issue time, same shape, same name pattern. Two constraints that
-- read alike are two constraints a reader can trust; one clever biconditional covering both columns
-- would be a new pattern and would silently restate the applied constraint.
-- ⚠️ HONEST LIMIT OF THIS SHAPE, STATED RATHER THAN GLOSSED: it enforces only the FORWARD direction —
-- token ⇒ issue time. It does NOT forbid an issue time on a row that holds no token. That is exactly
-- as true of the existing expiry constraint, and making either strict would mean changing BOTH
-- together into a biconditional — a change to an ALREADY-APPLIED constraint, which is a separate
-- decision and is not taken here.

set lock_timeout = '3s';

begin;

-- 🔴 WHEN META ISSUED THE TOKEN. Written in the same statement that stores the ciphertext, from the
-- same instant the expiry is computed from — so `token_expires_at - token_issued_at` is exactly the
-- `expires_in` Meta returned, not an approximation of it.
-- ⚠️ NULLABLE, like token_expires_at, because a row legitimately exists before a token does
-- (partial onboarding). The CHECK below is what makes it load-bearing.
alter table public.whatsapp_connections
  add column if not exists token_issued_at timestamptz;

-- Mirrors whatsapp_connections_token_expiry_together, deliberately.
alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_token_issued_together;

alter table public.whatsapp_connections
  add constraint whatsapp_connections_token_issued_together
  check (access_token_ciphertext is null or token_issued_at is not null);

commit;

-- Make PostgREST aware of the new column. Without this the API layer keeps its cached schema and
-- every write naming `token_issued_at` fails with "column not found".
notify pgrst, 'reload schema';

-- ── ⚠️ NO BACKFILL IS NEEDED, BECAUSE THE TABLE IS EMPTY. ──────────────────────────────────────────
-- Recorded so the cost of having deferred this is on the record rather than assumed away. Had rows
-- existed and held tokens, the `add constraint` above would have FAILED IMMEDIATELY on validation —
-- every existing token row violates it — so the migration would have had to become:
--   1. add the column,
--   2. backfill it, then
--   3. add the constraint (or add it NOT VALID and VALIDATE separately, to avoid a long table lock).
-- 🔴 AND STEP 2 IS THE PROBLEM: THE ISSUE TIME IS UNRECOVERABLE. Meta does not report when a token was
-- issued; only `expires_in` at the moment of exchange, which is long gone. The only candidates would
-- have been:
--   • `updated_at` — the very proxy this column exists to remove, so the backfill would have baked the
--     bug in permanently for every pre-existing row;
--   • `token_expires_at - 60 days` — inventing the number the workstream just finished deleting;
--   • re-onboarding every truck to observe a fresh `expires_in`.
-- All three are worse than one ALTER on an empty table. That is the whole argument for doing it today.
