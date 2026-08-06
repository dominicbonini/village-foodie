-- 20260807_account_deletion_pending_state.sql
-- 🔴 WRITTEN, NOT RUN. Hand-apply.
--
-- ── ACCOUNT DELETION IS ANONYMISATION PLUS IDENTITY REMOVAL, NOT ROW DELETION ───────────────────────
-- The published privacy policy promises deletion of personal data while RETAINING accounting records for
-- six years. order_payments carries NO customer identifiers at all, so it needs no scrubbing — it needs
-- to NOT BE DELETED. Nothing in this migration deletes anything, and no FK constraint is touched.
--
-- ⚠️ DO NOT REUSE deleteTruckCascade FOR THIS. It deletes `orders` first, and order_payments cascades
-- from BOTH orders(order_key) AND trucks(id). That helper is the HARD delete, correct for demo/test
-- trucks with no legal record, and its behaviour is deliberately unchanged.
--
-- ── WHY THE STATE LIVES IN TWO PLACES, AND WHICH ONE IS AUTHORITATIVE ───────────────────────────────
-- operators.deletion_requested_at  = THE ACCOUNT RECORD. Authoritative. What the cron sweeps, what
--                                    Dominic cancels, what proves when the 30 days started.
-- trucks.deletion_requested_at     = A DERIVED ENFORCEMENT CACHE. Same value, copied to every truck the
--                                    operator owns at request time.
--
-- 🔴 THE DUPLICATION IS DELIBERATE AND IS A HOT-PATH DECISION. /api/orders/submit and /api/dashboard
-- both already `select('*')` from `trucks` and neither loads `operators`. Reading the account state from
-- the operator row would add a second round-trip to the hottest path in the product (every order
-- submission) and to a poll that runs every 60 seconds per open dashboard. Denormalising costs one
-- column on a row those queries already fetch. The write path below is the ONLY writer of both, and it
-- writes them together — same rule as orders.payment_status / amount_paid, which are likewise derived
-- caches of a canonical record.
-- ⚠️ An operator with a pending deletion must not be able to create a NEW truck, or it would arrive
-- unstamped. That is an application guard, not a constraint.

alter table operators
  add column if not exists deletion_requested_at   timestamptz,
  add column if not exists deletion_requested_by   uuid,
  add column if not exists deletion_due_at         timestamptz,
  add column if not exists deletion_last_notified_at timestamptz;

comment on column operators.deletion_requested_at is
  'THE ACCOUNT RECORD. Non-null = this account is pending deletion; ordering has stopped on every truck it owns and the dashboard stays readable. Set by /api/account/request-deletion (owner only). CLEARED ONLY BY DOMINIC, by hand — there is deliberately no in-app cancel. Authoritative; trucks.deletion_requested_at is a derived enforcement cache of this value.';

comment on column operators.deletion_requested_by is
  'auth.users id of the owner who requested it. Kept for the audit trail; nulled by the anonymisation pass along with the rest of the operator identity.';

comment on column operators.deletion_due_at is
  'deletion_requested_at + 30 days. Stored rather than computed so the window is fixed at request time and cannot move if the interval is ever changed.';

comment on column operators.deletion_last_notified_at is
  '🔴 RE-NOTIFY, DO NOT FIRE ONCE. The due-sweep cron emails Dominic and stamps this. It re-emails while the account is still pending and this is older than the re-notify interval, because a one-shot email that lands in spam is an unkept commitment with no second chance. NOTHING EXECUTES AUTOMATICALLY — the cron only ever notifies.';

alter table trucks
  add column if not exists deletion_requested_at timestamptz;

comment on column trucks.deletion_requested_at is
  'DERIVED ENFORCEMENT CACHE of operators.deletion_requested_at, copied to every truck the operator owns at request time. Non-null = STOP TAKING ORDERS. Read on the hot paths (/api/orders/submit, /api/menu) which already select the truck row, so it costs no extra query. 🔴 It must NOT be used to hide the dashboard or the KDS — the operator keeps read access for the whole 30 days. trucks.active is the switch that would break that; this is deliberately a separate column.';

create index if not exists operators_deletion_due_idx
  on operators (deletion_due_at)
  where deletion_requested_at is not null;

notify pgrst, 'reload schema';

-- ── VERIFY (run after) ────────────────────────────────────────────────────────────────────────────
-- Expect four new operators columns and one new trucks column, ALL NULL on every existing row — i.e.
-- nobody is pending, and no truck's ordering behaviour changes by the migration alone.
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_name = 'operators' and column_name like 'deletion%';
--
--   select count(*) as pending_accounts from operators where deletion_requested_at is not null;   -- expect 0
--   select count(*) as blocked_trucks   from trucks    where deletion_requested_at is not null;   -- expect 0
--
-- 🔴 "add column if not exists" succeeds whether or not it added anything. The counts are the only thing
-- that proves the columns are really there and really empty.
