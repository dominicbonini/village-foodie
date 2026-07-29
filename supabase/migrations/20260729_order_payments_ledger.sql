-- 20260729_order_payments_ledger.sql
-- The PAYMENT LEDGER: one row per money event. Payments phase 1a (V9.4, §37).
--
-- ✅ CLASSIFICATION: **ADDITIVE**. A brand-new table that nothing in the currently-deployed app reads or
-- writes. Applying it changes nothing for the running app, so it is SAFE TO RUN AT ANY TIME.
-- RUN ORDER: apply BEFORE deploying the phase-1a code. The 'collected' / 'undo_collected' handlers write
-- here on every "Mark paid & done", and PostgREST returns PGRST205 for a table it cannot see — deploying
-- first would break order completion on a live trading path. The reverse order is a no-op.
-- Run this one FIRST, then 20260729_orders_payment_status_widen_check.sql, then deploy.
--
-- ── WHY A LEDGER AND NOT MORE COLUMNS ON `orders` ───────────────────────────────────────────────────
-- A four-state enum cannot express an order edited after payment. Paid £30, operator adds an item → £35
-- total, £5 due: `paid` is wrong and `unpaid` is wrong. One row per money event can express it, and every
-- figure the operator sees derives from the sum. `orders.payment_status` and `orders.amount_paid` become
-- DERIVED CACHES recomputed by lib/payments/ledger.ts — never hand-written.
--
-- ── INTEGER MINOR UNITS ONLY ────────────────────────────────────────────────────────────────────────
-- ⚠️ There is NO numeric and NO pounds value anywhere in this table, by design. `orders` is protected
-- from binary64 drift only by an accident of schema (numeric(8,2) rounds at the insert boundary); a
-- ledger that money is actually computed from must not rely on that. amount_minor is ALWAYS POSITIVE —
-- `kind` carries the sign — so a sign error cannot masquerade as a refund. Conversion to/from pounds goes
-- through toMinor/fromMinor in lib/order-repricing.ts, NEVER a hardcoded ×100.
--
-- ── CHANNEL IS REQUIRED, NOT OPTIONAL ───────────────────────────────────────────────────────────────
-- `payment_status = 'paid'` cannot tell you whether the 0.99% platform fee applies; only the channel can.
-- In-person payments never incur it and never count toward the allowance (§37), so a payment recorded
-- without its channel is unbillable. Hence NOT NULL with a CHECK rather than a nullable convenience field.
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────────────────────────────
-- `idempotency_key` is nullable with a UNIQUE index that binds only where present. The native offline
-- outbox (lib/native/outbox.ts) replays queued 'collected' actions on reconnect, and a plain insert would
-- book a second charge for one collection. The collect handler supplies the deterministic key
-- `collect:{order_key}`, so a replay collides and is treated as a successful no-op.
-- NOTE this is deliberately NOT a unique index on (order_key, kind, channel): £10 cash now and £5 on
-- collection are two legitimate in-person charges against one order, and a composite index would forbid
-- the second. An undo DELETES the collect row (see lib/payments/ledger.ts), which frees the key for a
-- legitimate re-collect.
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   -- table + every column, types included
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns where table_name = 'order_payments' order by ordinal_position;
--   -- expect 13 rows, and amount_minor must be `integer` (NOT numeric)
--   select count(*) as col_count from information_schema.columns where table_name = 'order_payments';
--   -- the four CHECKs
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'order_payments'::regclass and contype = 'c' order by conname;
--   -- both indexes: order_payments_order_key_idx + order_payments_idempotency_key_uidx
--   select indexname, indexdef from pg_indexes where tablename = 'order_payments' order by indexname;
--   -- RLS must be ON (and there must be NO policies — see below)
--   select relrowsecurity from pg_class where relname = 'order_payments';           -- expect t
--   select count(*) as policy_count from pg_policies where tablename = 'order_payments';  -- expect 0

create table if not exists order_payments (
  id              uuid        primary key default gen_random_uuid(),
  -- Cascade: a deleted order cannot leave orphaned money events behind.
  order_key       uuid        not null references orders(order_key) on delete cascade,
  -- trucks.id is TEXT (not uuid) — FK must match. Denormalised so per-truck fee/allowance rollups (§37)
  -- never need to join through orders.
  truck_id        text        not null references trucks(id) on delete cascade,
  kind            text        not null,
  channel         text        not null,
  -- ⚠️ INTEGER MINOR UNITS, ALWAYS POSITIVE. `kind` carries the sign.
  amount_minor    integer     not null,
  -- On every row, not inferred from the truck: changing a truck's currency must never retroactively
  -- reprice historical money events (§37, Currency and country).
  currency        text        not null default 'GBP',
  state           text        not null,
  -- The processor's id (Stripe PaymentIntent/Refund) once Stripe exists. Its PRESENCE is also the test
  -- for "real money moved" that decides delete-vs-reverse on undo.
  external_ref    text,
  note            text,
  -- Nullable; unique only where present. See the idempotency note above.
  idempotency_key text,
  created_at      timestamptz not null default now(),
  created_by      text,

  constraint order_payments_kind_chk    check (kind    in ('charge', 'refund')),
  constraint order_payments_channel_chk check (channel in ('online', 'in_person_stripe', 'in_person_other')),
  constraint order_payments_state_chk   check (state   in ('pending', 'succeeded', 'failed')),
  -- Positive-only: a negative "charge" and a positive "refund" would both balance the same way while
  -- meaning opposite things. The sign lives in `kind`, in exactly one place.
  constraint order_payments_amount_positive_chk check (amount_minor > 0)
);

-- The read shape every caller uses: "all money events for this order".
create index if not exists order_payments_order_key_idx on order_payments (order_key);

-- PARTIAL unique index. Postgres already treats NULLs as distinct in a plain unique index, so the
-- `where` clause is not strictly required — it is written explicitly so the intent ("uniqueness binds
-- only where a key was supplied") is readable from the schema, and so the index stays small.
create unique index if not exists order_payments_idempotency_key_uidx
  on order_payments (idempotency_key) where idempotency_key is not null;

alter table order_payments enable row level security;
-- service-role only, no anon policy: every reader and writer is a server route using the service key
-- (app/api/dashboard/action). No browser and no customer ever touches this table directly — same posture
-- as device_notification_prefs, booking_locks, whatsapp_logs and excluded_terms.

comment on table order_payments is
  'The canonical payment record: one row per money event (charge/refund). orders.payment_status and orders.amount_paid are DERIVED CACHES recomputed from this table by lib/payments/ledger.ts and must never be hand-written. Integer minor units only — no numeric, no pounds.';

comment on column order_payments.amount_minor is
  'ALWAYS POSITIVE integer minor units (pence for GBP). `kind` carries the sign: paid = sum(charge) - sum(refund) over state=''succeeded''.';

comment on column order_payments.channel is
  'Required, never inferred. payment_status alone cannot tell you whether the 0.99% platform fee applies — only the channel can. In-person payments never incur it and never count toward the monthly allowance (§37).';

comment on column order_payments.idempotency_key is
  'Nullable; UNIQUE where present. The offline outbox replays queued ''collected'' actions, so the collect handler supplies the deterministic key ''collect:{order_key}'' and a replay collides into a no-op. An undo DELETES the collect row, freeing the key for a legitimate re-collect.';

comment on column order_payments.external_ref is
  'Processor reference (Stripe PaymentIntent/Refund id) once Stripe exists. Its PRESENCE is the test for "real money moved": undo DELETES a row with no external_ref (a mis-tap that never moved money) and inserts a compensating refund for one that has it.';

notify pgrst, 'reload schema';
