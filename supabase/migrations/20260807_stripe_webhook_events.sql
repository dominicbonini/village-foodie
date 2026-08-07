-- 20260807_stripe_webhook_events.sql
-- The STRIPE EVENT RECEIPT LOG. One row per webhook event this app has accepted. Groundwork only —
-- nothing in it moves money, and it is NOT order_payments.
--
-- ✅ CLASSIFICATION: **ADDITIVE**. A brand-new table that nothing currently deployed reads or writes.
-- Applying it changes nothing for the running app, so it is SAFE TO RUN AT ANY TIME.
-- RUN ORDER: apply BEFORE deploying /api/webhooks/stripe. That route INSERTs here, and PostgREST returns
-- PGRST205 for a table it cannot see. The consequence of getting it wrong is bounded but ugly: the route
-- would verify signatures correctly and then fail to record, returning 500, and Stripe would retry the
-- same event for three days. No money is involved either way. The reverse order is a no-op — the table
-- would simply sit empty until the deploy lands.
--
-- ── WHY THIS TABLE EXISTS: STRIPE GUARANTEES AT-LEAST-ONCE, NOT EXACTLY-ONCE ────────────────────────
-- Stripe's own words: "Webhook endpoints might occasionally receive the same event more than once. You
-- can guard against duplicated event receipts by logging the event IDs you've processed, and then not
-- processing already-logged events." They also automatically retry for UP TO THREE DAYS with exponential
-- backoff, allow a manual resend for 15 days (Dashboard) or 30 days (CLI), and explicitly do NOT
-- guarantee ordering. A handler that assumes one delivery per event is wrong on all four counts.
-- This table is the "logging the event IDs you've processed" half, made durable.
--
-- 🔴 THE UNIQUE CONSTRAINT IS THE IDEMPOTENCY MECHANISM — NOT A READ-THEN-WRITE CHECK.
-- The route INSERTs FIRST and treats a 23505 unique violation as "already seen, acknowledge and stop".
-- It deliberately does NOT `select ... then insert`: two concurrent deliveries of the same event (which
-- is exactly what a retry racing a slow first attempt looks like) would both read "not seen" and both
-- proceed. The database is the only thing that can arbitrate that, so it is asked to.
-- This mirrors the idiom the payment ledger already uses — order_payments_idempotency_key_uidx plus
-- "treat 23505 as a successful no-op" (20260729_order_payments_ledger.sql:29-37) — deliberately, so
-- there is ONE way idempotency is done in this codebase rather than two.
--
-- ── 🔴 NO PAYLOAD COLUMN. THE FULL EVENT BODY IS DELIBERATELY NOT STORED. ───────────────────────────
-- The obvious design is a `payload jsonb` for debugging. It is refused, and the precedent is recorded in
-- lib/audit/actionAudit.ts: "NOTHING SWEEPS THIS TABLE… the anonymisation pass nulls named COLUMNS on
-- `orders` — it cannot reach inside a JSONB blob. Anything personal written into these snapshots is
-- therefore retained indefinitely and would outlive the erasure the privacy policy promises."
-- A Stripe Checkout/PaymentIntent event carries `customer_details.email`, `.name`, `.phone` and a
-- billing address. Storing the raw event would put customer identifiers in a table with no foreign keys
-- and no sweeper — a GDPR erasure hole created for developer convenience.
-- ✅ THE DEBUGGING NEED IS MET WITHOUT IT: `stripe_event_id` is the join key to Stripe's own Dashboard,
-- which retains the complete payload and its delivery history. This table answers "did we receive it,
-- when, and did we act on it"; Stripe answers "what was in it". That split is correct, not a compromise.
-- ⚠️ DO NOT ADD A PAYLOAD COLUMN LATER WITHOUT SOLVING THE SWEEP. If a future handler genuinely needs
-- event contents, store the specific scalar fields it needs (ids, amounts, statuses), never the blob.
--
-- ── 🔴 livemode IS NOT NULL WITH NO DEFAULT, AND THAT IS THE OPPOSITE OF order_payments.livemode ────
-- order_payments.livemode carries `default true` because it had to classify 50 pre-existing rows of real
-- money taken before the column existed (20260807_order_payments_livemode.sql). This table has NO
-- pre-existing rows and NO legacy writer, so there is nothing a default would rescue and everything it
-- could hide: every row here is born from a Stripe event, and every Stripe event states its own mode in
-- a field. A default would let a writer that forgot silently record a test event as live.
-- NOT NULL, NO DEFAULT ⇒ omission is a 23502 at the database, on top of the value being a required
-- parameter in TypeScript. Both doors shut, and neither costs availability because no deployed code
-- inserts here yet.
--
-- ── NO FOREIGN KEYS ────────────────────────────────────────────────────────────────────────────────
-- `connected_account` holds a Stripe `acct_...` and is a plain text value. There is nothing to reference
-- — no Connect account is stored anywhere in this schema yet, deliberately (§37 leaves the account's
-- home an open decision). Following action_audit_log rather than order_payments here: a receipt log must
-- survive deletion of whatever it describes, and order_payments cascading on BOTH orders and trucks is
-- recorded in the audit-log migration as the mistake not to inherit.
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   -- table + every column
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns where table_name = 'stripe_webhook_events' order by ordinal_position;
--   select count(*) as col_count from information_schema.columns
--    where table_name = 'stripe_webhook_events';                                  -- expect 9
--   -- livemode must be NOT NULL with NO default (see the note above)
--   select is_nullable, column_default from information_schema.columns
--    where table_name = 'stripe_webhook_events' and column_name = 'livemode';     -- expect NO | null
--   -- the unique constraint that IS the idempotency mechanism
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'stripe_webhook_events'::regclass and contype = 'u';
--   -- expect stripe_webhook_events_event_id_uniq UNIQUE (stripe_event_id)
--   -- NO foreign keys
--   select count(*) as fk_count from information_schema.table_constraints
--    where table_name = 'stripe_webhook_events' and constraint_type = 'FOREIGN KEY';  -- expect 0
--   -- indexes
--   select indexname, indexdef from pg_indexes
--    where tablename = 'stripe_webhook_events' order by indexname;
--   -- RLS on, ZERO policies — same posture as order_payments and action_audit_log
--   select relrowsecurity from pg_class where relname = 'stripe_webhook_events';  -- expect t
--   select count(*) as policy_count from pg_policies
--    where tablename = 'stripe_webhook_events';                                   -- expect 0
--   -- and, once the endpoint is live, the sanity read that matters:
--   select livemode, count(*) from stripe_webhook_events group by 1;
--   -- during test-mode bring-up expect ONLY `f` rows. A `t` row means a LIVE event reached this app.

create table if not exists stripe_webhook_events (
  id                uuid        primary key default gen_random_uuid(),
  -- Stripe's own event id (`evt_...`). THE idempotency key, and the join key to Stripe's Dashboard.
  stripe_event_id   text        not null,
  -- e.g. 'payment_intent.succeeded', 'account.updated'. Free text, no CHECK: Stripe adds event types
  -- continuously and a CHECK would make every new one a deploy-coupled migration — the same reasoning
  -- action_audit_log.action records for the same decision.
  type              text        not null,
  -- 🔴 FROM THE EVENT'S OWN `livemode` FIELD. Never from an env var, a key prefix, or which endpoint
  -- received the callback — a production Connect URL receives BOTH modes, so neither the endpoint nor
  -- the key can tell you which one this was. See the column comment.
  livemode          boolean     not null,
  -- The connected account (`acct_...`) for a Connect event, from the event's top-level `account` field.
  -- NULL for platform-scoped events. No FK — nothing to reference yet.
  connected_account text,
  -- The Stripe API version that shaped this event's payload. Recorded because an event's structure is
  -- fixed at creation and does NOT follow later API-version changes; without it, a handler debugging an
  -- unexpected shape has no way to know which schema it was looking at.
  api_version       text,
  -- When STRIPE created the event, from the event's `created` (unix seconds). Distinct from received_at
  -- on purpose: the gap between them IS the delivery delay, and on a retry it can be days.
  stripe_created_at timestamptz,
  received_at       timestamptz not null default now(),
  -- ⚠️ ALWAYS FALSE TODAY, AND THAT IS HONEST RATHER THAN SPECULATIVE. This endpoint records that an
  -- event arrived; it does not act on one, because no handler exists yet (deliberately out of scope).
  -- The column exists now because the unique constraint alone cannot distinguish "seen" from
  -- "finished" — a crash between the INSERT and a future handler would look identical to a completed
  -- delivery, and the retry would be skipped as a duplicate having done nothing. That is a correctness
  -- requirement for the next pass, not a guess about it.
  handled           boolean     not null default false,

  constraint stripe_webhook_events_event_id_uniq unique (stripe_event_id)
);

-- "What has arrived recently, in this mode" — the operational read. Ordering by received_at (our clock)
-- not stripe_created_at (theirs), because when triaging you want arrival order, and a three-day retry
-- would sort into the distant past under the other column.
create index if not exists stripe_webhook_events_livemode_received_idx
  on stripe_webhook_events (livemode, received_at desc);

-- "Everything for this connected account" — the read for diagnosing one truck's onboarding or payments.
-- Partial: platform-scoped events have a NULL account and are never the subject of this question.
create index if not exists stripe_webhook_events_account_idx
  on stripe_webhook_events (connected_account, received_at desc) where connected_account is not null;

alter table stripe_webhook_events enable row level security;
-- service-role only, no anon policy: the only writer is a server route using the service key
-- (app/api/webhooks/stripe). No browser and no customer ever touches this table — same posture as
-- order_payments, action_audit_log, device_notification_prefs, booking_locks and whatsapp_logs.

comment on table stripe_webhook_events is
  'One row per Stripe webhook event ACCEPTED by /api/webhooks/stripe (signature verified). This is a RECEIPT LOG, not a ledger — it records that an event arrived, never that money moved. order_payments remains the canonical money record and this table must never be summed, joined into a balance, or treated as evidence of payment. The UNIQUE constraint on stripe_event_id IS the idempotency mechanism: the route inserts first and treats 23505 as "already seen", because Stripe guarantees at-least-once delivery and retries for up to three days. Deliberately stores NO event payload — see the migration header for the GDPR reasoning.';

comment on column stripe_webhook_events.livemode is
  'Copied verbatim from the Stripe event''s own `livemode` field. 🔴 NEVER derived from STRIPE_SECRET_KEY, from an sk_test_/sk_live_ prefix, from NODE_ENV, or from which endpoint received the callback. Stripe documents that a production Connect webhook URL receives BOTH live and test events, so the endpoint proves nothing and the key proves nothing about a callback that arrived unbidden. The event is the only artefact that knows which mode produced it, and it says so in this field. NOT NULL with NO DEFAULT so an omission is a loud 23502 rather than a silent misclassification — unlike order_payments.livemode, which needed a default to classify rows that predated the column.';

comment on column stripe_webhook_events.stripe_event_id is
  'Stripe''s `evt_...` id. UNIQUE — this is what makes a duplicate delivery a no-op. Also the join key to Stripe''s own Dashboard, which holds the full payload and delivery history this table deliberately does not.';

comment on column stripe_webhook_events.handled is
  'FALSE on every row today: the endpoint records receipt and does not act. Exists so a future handler can distinguish "seen" from "finished" — the unique constraint alone cannot, and a crash between insert and handling would otherwise be indistinguishable from a completed delivery whose retry is then skipped.';

notify pgrst, 'reload schema';
