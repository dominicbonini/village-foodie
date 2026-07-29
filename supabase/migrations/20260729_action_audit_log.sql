-- 20260729_action_audit_log.sql
-- The GENERAL operator-action audit log. Append-only. V9.4.
--
-- ✅ CLASSIFICATION: **ADDITIVE**. A brand-new table that nothing currently deployed reads or writes.
-- Applying it changes nothing for the running app, so it is SAFE TO RUN AT ANY TIME.
-- RUN ORDER: apply BEFORE deploying the code that writes to it. The 'collected' and 'undo_collected'
-- handlers insert here, and PostgREST returns PGRST205 for a table it cannot see. The consequences of
-- getting it wrong differ by branch, which is worth knowing before choosing when to run it:
--   • 'collected'       — writes best-effort; a missing table logs to console and the collection still
--                         completes. Degraded, not broken.
--   • 'undo_collected'  — writes STRICTLY; a missing table means the audit insert throws, which ABORTS
--                         the ledger delete and REFUSES the undo with a 500. Deploying the code before
--                         this migration would break undo on a live path. Run this first.
--
-- ── WHY A SEPARATE TABLE FROM order_payments ────────────────────────────────────────────────────────
-- They model different things and must not be conflated:
--   order_payments   — MUTABLE. What is currently OWED. undo_collected DELETES its row, correctly: the
--                      money is no longer owed and the idempotency key must be freed.
--   action_audit_log — APPEND-ONLY. What PEOPLE DID. The deletion above is itself an event, recorded
--                      here. The ledger may forget; the log never does.
-- The fraud vector that prompted this: mark paid → take cash → undo → collect → undo again. Verified
-- live, that left NO trace of the first collect or of either undo. The fix is not to stop deleting from
-- the ledger; it is that a ledger is not an audit trail.
--
-- 🔴 NO FOREIGN KEYS. NO CASCADE. DELIBERATE.
-- truck_id, order_key and the actor ids are stored as PLAIN VALUES with no referential integrity. The
-- record must SURVIVE deletion of its subject — an audit row that disappears when someone deletes the
-- order or the truck it describes is worthless precisely when it matters most. This follows
-- allergen_audit_log, whose truck_id is likewise a bare `text NOT NULL` with no FK
-- (20260628_allergen_audit_log.sql:15), and it is deliberately the OPPOSITE of order_payments, which
-- cascades on BOTH orders and trucks (20260729_order_payments_ledger.sql:57,60) — that table gets it
-- wrong for audit purposes, and this one must not inherit the mistake.
-- CONSEQUENCE, stated plainly: rows here can outlive their truck and become unjoinable. That is the
-- intended trade. Nothing prunes this table.
--
-- 🔴 APPEND-ONLY BY INTENT.
-- Nothing in this codebase may ever UPDATE or DELETE from action_audit_log. lib/audit/actionAudit.ts is
-- the ONLY writer and only ever INSERTs. To amend a record, append a NEW row describing the amendment —
-- a log you can edit is not a log. This is enforced by convention, not by a grant: the service role
-- bypasses RLS, so the constraint is social and must be stated where people will read it. (A dedicated
-- insert-only role is the real enforcement and is not built.)
--
-- ── ACTOR MODEL ─────────────────────────────────────────────────────────────────────────────────────
-- actor_kind is the HONEST identity-quality flag, in the spirit of allergen_audit_log.auth_method:
--   'owner'   — a resolved session owning this truck (or an is_admin operator).
--   'staff'   — a resolved session with truck_users membership. NOTE role 'manager' collapses to
--               'staff' here; the precise role is NOT persisted.
--   'token'   — resolution ran cleanly and there was NO session: a shared per-truck dashboard token
--               acted. This is the normal KDS/anonymous case and is a FACT, not a null.
--   'unknown' — resolution itself failed. We do not know whether a user was present.
-- The 'token' / 'unknown' split is the point: the log must distinguish "a shared token acted" from
-- "we failed to ask". actor_id is null for both, so without actor_kind they would be indistinguishable.
--
-- `action` is intentionally FREE TEXT with no CHECK. cancel/reject/edit/stock overrides are all intended
-- future callers; a CHECK would make each new one a deploy-coupled migration, which is how an audit log
-- quietly stops being written to.
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   -- table + every column
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns where table_name = 'action_audit_log' order by ordinal_position;
--   select count(*) as col_count from information_schema.columns
--    where table_name = 'action_audit_log';                                   -- expect 12
--   -- NO foreign keys must exist on this table (the whole point):
--   select count(*) as fk_count from information_schema.table_constraints
--    where table_name = 'action_audit_log' and constraint_type = 'FOREIGN KEY';   -- expect 0
--   -- the actor_kind / source CHECKs
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'action_audit_log'::regclass and contype = 'c' order by conname;
--   -- indexes
--   select indexname, indexdef from pg_indexes where tablename = 'action_audit_log' order by indexname;
--   -- RLS on, and ZERO policies — matching allergen_audit_log's siblings (booking_locks, whatsapp_logs,
--   -- excluded_terms, device_notification_prefs, order_payments):
--   select relrowsecurity from pg_class where relname = 'action_audit_log';    -- expect t
--   select count(*) as policy_count from pg_policies where tablename = 'action_audit_log';  -- expect 0

create table if not exists action_audit_log (
  id            uuid        primary key default gen_random_uuid(),
  -- The action name as it arrives at /api/dashboard/action ('collected', 'undo_collected', later
  -- 'cancel', 'reject', 'edit', 'set_stock', …). Free text — see the note above.
  action        text        not null,
  -- 🔴 NO FK, deliberately. Plain values so the record outlives its subject.
  truck_id      text        not null,
  order_key     uuid,
  -- Integer minor units where money is involved. Never pounds, never numeric — same rule as the ledger.
  amount_minor  integer,
  before_state  jsonb,
  after_state   jsonb,
  actor_kind    text        not null,
  -- auth.users id when a session resolved; null for 'token' and 'unknown'. NO FK.
  actor_id      text,
  actor_label   text,
  source        text        not null,
  created_at    timestamptz not null default now(),

  constraint action_audit_log_actor_kind_chk check (actor_kind in ('owner', 'staff', 'token', 'unknown')),
  constraint action_audit_log_source_chk     check (source     in ('web', 'native', 'offline_replay'))
);

-- "Everything that happened to this order" — the read shape for investigating a specific dispute.
create index if not exists action_audit_log_order_key_idx on action_audit_log (order_key);
-- "Everything this truck did, newest first" — mirrors allergen_audit_log_truck_created_idx.
create index if not exists action_audit_log_truck_created_idx on action_audit_log (truck_id, created_at desc);

alter table action_audit_log enable row level security;
-- service-role only, no anon policy: the only writer is a server route using the service key
-- (app/api/dashboard/action). No browser and no customer ever touches this table directly — same posture
-- as order_payments, device_notification_prefs, booking_locks, whatsapp_logs and excluded_terms.
-- ⚠️ NOTE this is a STRICTER posture than allergen_audit_log itself, which enables no RLS at all — the
-- only application table in the repo in that state. Matching its siblings rather than matching it.

comment on table action_audit_log is
  'APPEND-ONLY record of operator actions. Never UPDATE, never DELETE — append a new row to amend. Deliberately carries NO foreign keys so a record outlives the truck/order it describes (unlike order_payments, which cascades on both). Distinct from order_payments: the ledger models what is OWED and may delete; this models what people DID and never forgets.';

comment on column action_audit_log.actor_kind is
  'Identity-quality flag, in the spirit of allergen_audit_log.auth_method. ''token'' = resolution ran and there was no session (a shared per-truck token acted); ''unknown'' = resolution itself failed (we do not know). Both carry a null actor_id, so this column is the only thing distinguishing them. ''staff'' also covers role ''manager'', which is not separately persisted.';

comment on column action_audit_log.source is
  '''offline_replay'' means the action was QUEUED earlier and applied now, so created_at is the REPLAY time, not the time the operator tapped. Detected from the `expected_from` field that lib/native/orderGate.ts adds only to replayed ops.';

comment on column action_audit_log.before_state is
  'For a destructive action this MUST fully reconstruct what was destroyed. undo_collected stores the entire deleted order_payments row here (amount, channel, idempotency_key, created_at, created_by, …) so the deletion is reconstructable from the log alone.';

notify pgrst, 'reload schema';
