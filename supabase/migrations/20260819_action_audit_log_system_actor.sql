-- 20260819_action_audit_log_system_actor.sql
-- 🔴 ADMIT 'system' ON action_audit_log — BOTH THE SOURCE AND THE ACTOR KIND.
--
-- 🚫 ALREADY APPLIED. Dominic ran this by hand on 19 August 2026 and verified it against pg_constraint;
-- both constraints already read exactly what this file writes. It is recorded here so the migration
-- history matches the database, and it is IDEMPOTENT (drop-if-exists, then add), so re-running it is a
-- no-op that restores the same definitions. Do not run it again expecting it to do something.
--
-- ── WHY IT EXISTS ──────────────────────────────────────────────────────────────────────────────────
-- The reject path was extracted to lib/orders/reject-order.ts so that scheduled work can reach it — see
-- the offline auto-reject design read. Scheduled work is not a request: it has no `req`, so it can
-- resolve neither a source ('web' | 'native' | 'offline_replay') nor an actor identity. Every existing
-- value would be a LIE in the one table that exists to answer "who did this".
--
-- 🔴 AND THE FAILURE MODE IS THE REASON THIS LANDS BEFORE ANY SWEEP DOES. Writing a value outside these
-- CHECKs raises 23514 inside logAction — which the release path calls AFTER cancelAuthorization has
-- already cancelled the hold at Stripe. The money would have moved and the record of it would not exist.
-- The type and the constraint are therefore widened while nothing yet passes the new value.
--
-- ── WHAT 'system' MEANS, AND WHAT IT IS NOT ────────────────────────────────────────────────────────
--   source     'system'  — there was no request. Scheduled or automatic server-side work.
--   actor_kind 'system'  — the actor is known exactly and is not a person.
-- 🔴 IT IS THE OPPOSITE OF 'unknown', NOT A SYNONYM. 'unknown' means resolution FAILED and we cannot say
-- whether a human was present; 'system' means we can say precisely, and the answer is "no human". The
-- table's existing comment already refuses to collapse 'token' and 'unknown' for the same reason.
--
-- ✅ ADDITIVE, AND WIDENING ONLY. Every value the old constraints admitted, these admit. No existing row
-- can become invalid, nothing is backfilled, and no column, type or nullability changes.
-- 🔴 DEPLOY ORDER, STATED PLAINLY: MIGRATION FIRST, DEPLOY SECOND — and it is already satisfied here,
-- because the DDL was applied before this build exists. The reverse order is the one that breaks: code
-- writing 'system' against the old CHECK fails 23514 at the worst moment. Deploying this build against
-- the widened constraints is safe in either direction TODAY, because no caller passes 'system' yet.
--
-- VERIFY (already run, 19 August 2026):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'action_audit_log'::regclass and contype = 'c'
--    order by conname;
--     -- expect action_audit_log_actor_kind_chk … ARRAY['owner','staff','token','unknown','system']
--     -- expect action_audit_log_source_chk     … ARRAY['web','native','offline_replay','system']
--   select source, count(*) from action_audit_log group by 1 order by 2 desc;   -- expect no 'system' yet

alter table action_audit_log
  drop constraint if exists action_audit_log_source_chk;
alter table action_audit_log
  add constraint action_audit_log_source_chk
  check (source in ('web', 'native', 'offline_replay', 'system'));

alter table action_audit_log
  drop constraint if exists action_audit_log_actor_kind_chk;
alter table action_audit_log
  add constraint action_audit_log_actor_kind_chk
  check (actor_kind in ('owner', 'staff', 'token', 'unknown', 'system'));

comment on column action_audit_log.source is
  'Where the action came from. ''web'' / ''native'' are the two request surfaces. ''offline_replay'' means '
  'the action was QUEUED earlier and applied now, so created_at is the REPLAY time, not the time the '
  'operator tapped — detected from the `expected_from` field that lib/native/orderGate.ts adds only to '
  'replayed ops. ''system'' means there was NO request: scheduled or automatic server-side work, with no '
  'human behind it. Added 19 August 2026 alongside the same value on actor_kind.';

comment on column action_audit_log.actor_kind is
  'Coarse identity class. ''owner''/''staff'' resolved from a session. ''token'' means resolution ran '
  'cleanly and there was no session — a shared per-truck token acted, which is the normal KDS case. '
  '''unknown'' means resolution itself FAILED and we cannot say whether a human was present. '
  '🔴 ''system'' IS THE OPPOSITE OF ''unknown'', not a synonym: the actor is known exactly and is not a '
  'person. Added 19 August 2026.';

notify pgrst, 'reload schema';
