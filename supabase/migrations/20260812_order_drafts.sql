-- 20260812_order_drafts.sql
-- Phase 2a of authorize-then-capture: THE DRAFT STORE. The table only. Nothing reads it yet.
--
-- ✅ ADDITIVE. A brand-new table, a new function, and nothing else. No existing table is altered, no
-- existing function is replaced, no column is added to `orders`, and `place_order_atomic` is untouched.
-- Nothing in the deployed application references `order_drafts` — verified by grep across app/, lib/,
-- components/ and supabase/ before this file was written. So it can be applied at ANY time, before or
-- after any deploy, and the running build behaves identically either way.
-- ⚠️ THE DEPLOY COUPLING ARRIVES IN PHASE 2b, NOT HERE. The moment a route issues a NAMED select
-- against this table, that build REQUIRES this migration — PostgREST answers a named select on a
-- missing relation/column with 42703/42P01 and fails the WHOLE statement. Run this first; the coupling
-- is then already satisfied when the wiring lands.
--
-- ── WHY A TABLE AT ALL, AND WHY NOT `orders` WITH A 'draft' STATUS ─────────────────────────────────
-- THE PRINCIPLE: nothing reserves capacity until payment is authorised. A draft is a wish, not a
-- commitment, and it must be invisible to the capacity engine, to stock, and to every board and count.
--
-- A draft CANNOT live in `orders`, and this is measured, not assumed. Both stock tallies read:
--     lib/stock-availability.ts:35-42  getLiveItemCounts
--     lib/option-stock.ts:68-75        getLiveOptionCounts
--   .from('orders').select(...).eq('truck_id',..).eq('event_id',..)
--     .neq('status','cancelled').neq('status','rejected')
-- That is a DENY-list, not an allow-list: every status that is not those two counts. A row carrying a
-- novel status like 'draft' would be tallied as sold, would move `stock_remaining` on the customer
-- menu, and could trip enforceStockLimits into flipping a real item sold-out. No status value avoids
-- it; only a separate relation does.
-- (The kitchen-capacity reader, lib/slot-bookings.ts:216-227, IS an allow-list — .in('status',
-- ['pending','confirmed','modified','cooking']) — so it would have been safe. One of the three being
-- safe is not enough.)
--
-- ── 🔴 THE KEY: order_key IS MINTED HERE AND CARRIES THROUGH UNCHANGED ─────────────────────────────
-- This table's primary key is `order_key uuid`, WITH NO DEFAULT. The caller supplies it. The same uuid
-- later becomes the order's primary key, which is what keeps every existing correlation working with
-- no change to any of it:
--   • /api/stripe/checkout sets   payment_intent_data.metadata.order_key
--   • the webhook reads it back   metadata.order_key  → orders lookup
--   • the ledger keys on          `stripe_pi:{paymentIntentId}` — untouched, and never derived from
--                                 the order key, so it does not care when the order was created
--
-- THE PRECEDENT, quoted from app/api/dashboard/action/route.ts:1171-1174 before copying it:
--     -- Accept a CLIENT-minted order_key (offline outbox) → idempotent replay: a re-sent already-synced
--     -- walk-up is a no-op (order_key PK conflict → ignored), never a duplicate. Online walk-ups (no client
--     -- key) keep the server-default order_key + a plain insert, exactly as before.
--     const clientOrderKey: string | undefined = typeof manualOrder?.order_key === 'string' ? manualOrder.order_key : undefined
--     ...
--     if (clientOrderKey) insertPayload.order_key = clientOrderKey
-- So an order_key minted BEFORE the row exists is already a shipped, load-bearing pattern on the
-- offline walk-up path. `orders.order_key` carries `DEFAULT gen_random_uuid()` (20260607_order_key_
-- per_event.sql:20) — a DEFAULT, which applies only when no value is supplied, NOT a generated-always
-- identity. Supplying one is ordinary INSERT behaviour and that path relies on it every day.
--
-- ⚠️ AND THE COST, STATED: an order_key will now exist for a draft that may never become an order, so
-- the key alone stops meaning "an order exists". Nothing today reads a bare order_key as proof of that
-- — every reader selects the row — but it is the assumption to re-check in phase 2b.
--
-- ── 🔴 THE DOUBLE-PROMOTION CONSTRAINT ────────────────────────────────────────────────────────────
-- Both the webhook and the redirect-back will try to create the order from one draft. EXACTLY ONE MAY
-- SUCCEED, and the loser must LEARN it lost rather than error.
--
-- TWO LAYERS, and the first is the one that does the work:
--
--   1. THE CLAIM IS A CONDITIONAL UPDATE, and Postgres row-locking arbitrates it:
--        update order_drafts
--           set promoted_at = now(), customer_name = null, customer_email = null, customer_phone = null
--         where order_key = $1 and promoted_at is null
--        returning *;
--      Two concurrent claims serialise on the row lock. The winner gets one row back INCLUDING the PII
--      it needs to build the order. The loser re-evaluates `promoted_at is null` after the winner
--      commits, matches nothing, and gets ZERO ROWS AND NO ERROR — which is exactly "learns it lost".
--      🔴 THE RETURNING IS LOAD-BEARING. Claim-then-read would let the loser read the row between the
--      winner's claim and its insert. Claim and read must be one statement.
--
--   2. `orders.order_key` IS THE PRIMARY KEY (20260607_order_key_per_event.sql:42), so even if both
--      claimants somehow reached the INSERT, the second would take a 23505 and write nothing. That is
--      a backstop, not the mechanism — a 23505 is an error, and the design asks for a quiet loser.
--
-- ⚠️ NO UNIQUE INDEX ON promoted_at IS ADDED, deliberately. Uniqueness is the wrong tool: the question
-- is not "is this value unique" but "did anyone get here first", which is a race and needs a lock.
--
-- ── 🔴 THE PURGE STORY. THIS TABLE HOLDS NAME, EMAIL AND PHONE. ───────────────────────────────────
-- stripe_webhook_events was deliberately built with NO payload column because nothing in this codebase
-- sweeps JSONB for erasure. This table cannot take that way out — it must hold the customer's details
-- to create the order — so the erasure is designed in, and it is designed so that NO SCHEDULED SWEEPER
-- IS REQUIRED for it to work.
--
--   (a) ON PROMOTION — the three PII columns are NULLED IN THE SAME STATEMENT that claims the draft
--       (see the claim above). From that instant the draft holds no personal data; the ORDER holds it,
--       under the order's own retention. There is no window, and no second write that could be missed.
--
--   (b) ON ABANDONMENT — the row is HARD DELETED once `expires_at` has passed. This happens
--       OPPORTUNISTICALLY, on the write path, following the booking_locks precedent
--       (lib/stock-guard.ts:43-48 deletes stale locks immediately before acquiring one). Creating any
--       draft purges expired ones first, so on a truck taking orders the PII lifetime is bounded by
--       expires_at plus the gap to the next order.
--
--   (c) BELT AND BRACES — `purge_order_drafts()` below does the same DELETE for a truck that stopped
--       trading mid-service, so the last few abandoned drafts of the day are not left indefinitely.
--       ⚠️ NOTHING CALLS IT YET, and wiring a caller is a later phase. It is created here rather than
--       written into a backlog note because a purge story with no executable purge IS a backlog note.
--
-- 🔴 SO THE MAXIMUM LIFETIME OF CUSTOMER PII IN THIS TABLE IS `expires_at` — thirty minutes — for an
-- abandoned draft, and ZERO for a promoted one. It is never the retention period of the table.
--
-- ── EXPIRY: 30 MINUTES, AND WHY THAT NUMBER ───────────────────────────────────────────────────────
-- The draft has to survive the whole time the customer spends at the card form: it holds the request,
-- and the request is known at submit, before the payment page exists. So the floor is not "the seconds
-- between authorising and the webhook arriving" — that is the last leg, not the whole journey.
-- 🔴 30 MINUTES IS STRIPE CHECKOUT'S OWN MINIMUM SESSION LIFETIME. Choosing it means the draft can
-- never expire BEFORE the payment session that references it, which is the one failure that costs real
-- money: an authorisation taken against a draft that has already been deleted is money held with no
-- order and nothing left to reconcile against.
-- It is minutes, not hours: a draft is not a saved basket and must not become one.
-- ⚠️ IT IS A COLUMN DEFAULT, so it is one place to change. If phase 2b decides the draft is created
-- only AFTER authorisation succeeds, the journey collapses to that last leg and a far shorter value
-- would be right. Change it here, not at a call site.
--
-- ── PRIVILEGES: RLS ON, ZERO POLICIES ─────────────────────────────────────────────────────────────
-- 🔴 A NEW TABLE IN `public` IS AUTOMATICALLY EXPOSED BY PostgREST. Doing nothing would publish a table
-- of customer names, emails and phone numbers on the anon key. RLS enabled with NO policies is the same
-- shape stripe_webhook_events and booking_locks use: the service role bypasses RLS, everyone else is
-- denied every row. Customers never touch this table directly; only server routes do.
--
-- VERIFY AFTER APPLYING:
--   select count(*) from order_drafts;                               -- expect 0
--   select relrowsecurity from pg_class where relname='order_drafts';-- expect t
--   select count(*) from pg_policies where tablename='order_drafts'; -- expect 0
--   select pg_get_functiondef(oid) from pg_proc where proname='purge_order_drafts';

create table if not exists order_drafts (
  -- 🔴 NO DEFAULT. The caller mints this and it becomes orders.order_key verbatim. A default here would
  -- let a caller forget to keep the value it needs for Stripe metadata, and discover it at the webhook.
  order_key       uuid        primary key,

  -- ── THE RESOLVED SERVER FACTS ─────────────────────────────────────────────────────────────────
  -- Resolved by the server BEFORE the draft is written (truck by slug-or-id, event by id-or-date), so
  -- promotion never has to re-resolve them and cannot resolve them differently.
  -- ⚠️ NO FOREIGN KEY TO truck_events OR vans. `orders` has none either, and an event deleted mid-flow
  -- must not cascade away a draft whose customer has already authorised a payment. truck_id DOES cascade:
  -- a deleted truck has no orders to create.
  truck_id        text        not null references trucks(id) on delete cascade,
  event_id        uuid,
  van_id          uuid,
  event_date      date,
  -- What the customer ASKED for. NOT what they will get: the slot is re-resolved under the event lock at
  -- promotion, because occupancy moves while they are at the card form. Null = ASAP.
  requested_slot  text,
  order_type      text        not null default 'collection',
  table_ref       text,

  -- ── THE CUSTOMER. 🔴 THE ONLY PII IN THIS TABLE. See the purge story in the header. ────────────
  customer_name   text,
  customer_email  text,
  customer_phone  text,

  -- ── THE BASKET ────────────────────────────────────────────────────────────────────────────────
  -- Same jsonb shapes as the matching orders columns, so promotion is a copy and never a transform.
  -- items[] carries its modifiers inline, exactly as orders.items does.
  items           jsonb       not null default '[]'::jsonb,
  deals           jsonb,
  extras          jsonb,
  bundle          jsonb,
  notes           text,
  discount_code   text,
  -- ⚠️ BEYOND THE ENUMERATED LIST, AND FLAGGED. Both are part of the REQUEST the draft must hold, and
  -- omitting them would silently lose two fields the current submit path already persists:
  --   asap_estimate — display-only, becomes orders.asap_estimate
  --   upsell_events — fire-and-forget analytics, becomes the upsell_events insert
  -- Neither decides money, capacity or a slot. If they are not wanted, they are two columns to drop.
  asap_estimate   text,
  upsell_events   jsonb,

  -- ── THE MONEY. SERVER-COMPUTED, NEVER FROM THE REQUEST BODY. ──────────────────────────────────
  -- Server-side pricing removed every money field from the request; these are what lib/order-repricing
  -- resolved from the price book at submit/route.ts:643. The draft carries selections and the total the
  -- SERVER derived from them — never a figure a client sent.
  -- 🔴 total_minor IS THE AMOUNT AUTHORISED. Integer pence, so the figure sent to Stripe is the figure
  -- stored, with no float crossing the boundary. `total` is kept alongside because place_order_atomic
  -- takes p_order.total as numeric and derives total_minor itself; storing both means promotion never
  -- has to convert, and toMinor/fromMinor stay the only conversion pair in the codebase.
  subtotal        numeric(8,2) not null,
  discount_amt    numeric(8,2) not null default 0,
  total           numeric(8,2) not null,
  total_minor     integer      not null,
  currency        text         not null default 'GBP',

  -- ── LIFECYCLE ─────────────────────────────────────────────────────────────────────────────────
  created_at      timestamptz not null default now(),
  -- See the header for why 30 minutes and why it lives here rather than at a call site.
  expires_at      timestamptz not null default (now() + interval '30 minutes'),
  -- The PaymentIntent this draft's authorisation belongs to. Null until the payment is started; the
  -- unique index below makes one intent unable to belong to two drafts.
  payment_intent_id text,
  -- 🔴 FROM THE STRIPE EVENT, NEVER FROM A KEY PREFIX OR AN ENV VAR — the same rule order_payments
  -- .livemode and stripe_webhook_events.livemode follow. Null until an authorisation exists.
  livemode        boolean,
  -- 🔴 THE PROMOTION MARKER AND THE CONSTRAINT. Null = claimable. Non-null = an order was created from
  -- this draft and the PII was erased in the same statement. See the header.
  promoted_at     timestamptz,

  -- A draft with no payable amount could never be authorised, so it must never be written.
  constraint order_drafts_total_minor_positive check (total_minor > 0),
  -- An expiry that has already passed at insert time is a bug, not a state.
  constraint order_drafts_expiry_after_creation check (expires_at > created_at)
);

-- The purge sweep (b)/(c) in the header: "expired and never promoted".
create index if not exists order_drafts_expiry on order_drafts(expires_at) where promoted_at is null;

-- 🔴 ONE PAYMENT INTENT BELONGS TO AT MOST ONE DRAFT. Partial, because it is null until a payment is
-- started and many drafts sit in that state at once. This is what lets the webhook fall back to the
-- intent id if metadata is ever missing, and be certain of the answer.
create unique index if not exists order_drafts_payment_intent_uidx
  on order_drafts(payment_intent_id) where payment_intent_id is not null;

-- Truck-scoped purge and any future per-truck read.
create index if not exists order_drafts_truck on order_drafts(truck_id);

-- ── 🔴 RLS: ON, WITH NO POLICIES. See the header. ────────────────────────────────────────────────
alter table order_drafts enable row level security;

comment on table order_drafts is
  'Authorize-then-capture staging. Holds a customer order request between submit and a successful card '
  'authorisation. INVISIBLE to the capacity engine, getLiveItemCounts and getLiveOptionCounts by living '
  'outside `orders`. Holds PII: nulled on promotion, hard-deleted at expiry. Max PII lifetime = expires_at.';
comment on column order_drafts.order_key is
  'Minted before any order exists and becomes orders.order_key verbatim, so Stripe metadata.order_key '
  'and the payment ledger need no change. No default: the caller must supply it.';
comment on column order_drafts.promoted_at is
  'Set by the conditional-UPDATE claim that makes double-promotion impossible. A loser gets zero rows '
  'and no error. The same statement nulls the three PII columns.';
comment on column order_drafts.expires_at is
  'Stripe Checkout''s minimum session lifetime, so a draft can never expire before the payment session '
  'that references it. Also the maximum lifetime of customer PII in this table.';

-- ── PURGE ────────────────────────────────────────────────────────────────────────────────────────
-- Erasure for abandoned drafts. The write path purges opportunistically (booking_locks precedent), so
-- this exists for a truck that stopped trading mid-service and left the day's last few drafts behind.
-- ⚠️ NOTHING CALLS THIS YET. Wiring a caller is a later phase. It is here, executable, because a purge
-- story with no executable purge is a backlog note — which is what this table was told not to have.
-- Returns the number of rows removed so a future caller can log it.
create or replace function purge_order_drafts() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  -- Promoted drafts are NOT deleted here: they already hold no PII (nulled at the claim) and their
  -- retention is a separate question from erasure. Only the abandoned ones are swept.
  delete from order_drafts
   where promoted_at is null
     and expires_at < now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function purge_order_drafts() is
  'GDPR erasure for abandoned order drafts: hard-deletes expired, never-promoted rows. Promoted rows '
  'already carry no PII. Nothing calls this yet.';

notify pgrst, 'reload schema';
