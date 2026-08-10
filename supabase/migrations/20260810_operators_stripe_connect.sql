-- 20260810_operators_stripe_connect.sql
-- Stripe Connect: the connected-account id and its cached readiness, on OPERATORS.
--
-- 🔴 RUN THIS FIRST, THEN 20260810_stripe_webhook_events_account_updated.sql, THEN DEPLOY.
--
-- ✅ CLASSIFICATION: **ADDITIVE**, and inert on arrival. Three nullable columns with no backfill and no
-- default beyond NULL. Applying this changes nothing for anyone — no truck, no operator, no order path.
--
-- ── 🔴 WHY `operators` AND NOT `trucks` ─────────────────────────────────────────────────────────────
-- ONE connected account PER OPERATOR, decided in the Part 1 audit and not reopened. Stripe's own model
-- groups terminal readers by **Location**, one per truck, *under a single account* — so a per-truck
-- account is not needed for multi-truck and would actively get in the way of Terminal later.
-- ⚠️ CONSEQUENCE, worth stating because it is not obvious: `charges_enabled` is an ACCOUNT property, so
-- **all of an operator's trucks go live together**. There is no per-truck readiness and none is wanted.
-- ⚠️ `operators` had 18 columns and ZERO `stripe_*` before this (live-verified 10 August; the Part 1
-- audit said 13, which was true when written). Nothing is being renamed or reused.
--
-- ── 🔴 READINESS IS `charges_enabled`, NEVER "a row exists" ─────────────────────────────────────────
-- `stripe_account_id` being non-null means an account was CREATED. It says nothing about whether that
-- account can take money: an account can exist for days mid-verification, and can go back to
-- `charges_enabled = false` at any time if Stripe raises a requirement. So the readiness column is
-- SEPARATE and is the only thing any consumer may test.
-- ⚠️ IT IS A CACHE, NOT THE TRUTH. Stripe is the truth. This column exists so a page render does not
-- have to make an API call, and it is kept fresh two ways: the `account.updated` webhook branch, and a
-- reconcile-on-tab-open. If they ever disagree, Stripe wins — re-read and overwrite.
-- 🔴 DEFAULT FALSE, NOT NULL. A three-state readiness ("yes / no / not sure") would be read as truthy
-- somewhere within a week. Absent means NOT READY, which is the only safe direction on a money gate.
--
-- ── ⚠️ SANDBOX ONLY. NOTHING HERE MAY CREATE A LIVE ACCOUNT. ────────────────────────────────────────
-- There is no livemode column on this table, deliberately: an operator has ONE account, and which mode
-- it belongs to is a property of the KEY that created it, not of the row. The guard lives in the route
-- (it refuses to run against a key that is not `sk_test_`) and in the webhook's livemode branch. When
-- live accounts are switched on, revisit this note before assuming the column is mode-agnostic.
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'operators' and column_name like 'stripe%'
--    order by column_name;
--   -- expect exactly 3 rows:
--   --   stripe_account_id           | text                        | YES | null
--   --   stripe_charges_enabled      | boolean                     | NO  | false
--   --   stripe_account_synced_at    | timestamp with time zone    | YES | null
--
--   -- every existing operator must be untouched and NOT ready:
--   select count(*) as total,
--          count(stripe_account_id) as with_account,
--          count(*) filter (where stripe_charges_enabled) as ready
--     from operators;
--   -- expect: total = <all operators>, with_account = 0, ready = 0
--
--   -- the uniqueness guard is in place (one account, one operator):
--   select indexname from pg_indexes
--    where tablename = 'operators' and indexname = 'operators_stripe_account_id_key';

alter table operators
  add column if not exists stripe_account_id text,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_account_synced_at timestamptz;

-- 🔴 ONE ACCOUNT, ONE OPERATOR — enforced, not merely intended. Without this a retried create could
-- attach the same `acct_…` to two operator rows, and the webhook's `account.updated` branch (which looks
-- the operator up BY account id) would then update an arbitrary one of them. UNIQUE on a nullable column
-- permits many NULLs in Postgres, which is exactly the wanted behaviour: unlimited operators with no
-- account, at most one holding any given account.
create unique index if not exists operators_stripe_account_id_key
  on operators (stripe_account_id)
  where stripe_account_id is not null;

comment on column operators.stripe_account_id is
  'Stripe connected account id (acct_…). ONE PER OPERATOR, not per truck — Terminal groups readers by Location under a single account. NULL = never created. ⚠️ NON-NULL DOES NOT MEAN READY: an account can exist mid-verification. Readiness is stripe_charges_enabled and nothing else.';

comment on column operators.stripe_charges_enabled is
  'Cached copy of the Stripe account''s charges_enabled. 🔴 THE ONLY READINESS TEST — never test "a row exists". Kept fresh by the account.updated webhook branch (livemode-guarded) and by reconcile-on-tab-open. It is a CACHE; Stripe is the truth, and on disagreement Stripe wins. NOT NULL DEFAULT false because absent must mean NOT READY.';

comment on column operators.stripe_account_synced_at is
  'When stripe_charges_enabled was last written from a Stripe read or event. Diagnostic only — nothing gates on it. A stale timestamp beside charges_enabled = true is the signal that reconcile has stopped running.';

notify pgrst, 'reload schema';
