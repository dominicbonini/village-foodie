-- 20260811_operators_stripe_account_livemode.sql
-- Records whether an operator's connected Stripe account is a LIVE account or a TEST account.
--
-- ── WHY THIS COLUMN HAS TO EXIST ────────────────────────────────────────────────────────────────────
-- Stripe's `livemode` is decided by which API key authenticated the request, so a test-mode payment can
-- ONLY ever produce `livemode: false`. No Stripe feature changes that. This build refuses any key that
-- does not start `sk_test_` (lib/stripe/connect.ts, app/api/stripe/checkout/route.ts), so `livemode: true`
-- can never arrive from Stripe here at all — and every display filter excludes `livemode: false`. The
-- result is that a card payment which genuinely succeeded is invisible on every operator and customer
-- surface. §37 already prescribed the remedy: store the account's mode alongside its id.
--
-- ── ✅ CLASSIFICATION: ADDITIVE, AND THE RULE IT SERVES IS ADDITIVE TOO ─────────────────────────────
-- A ledger row counts toward a balance if EITHER:
--   (a) livemode is TRUE                                                  — unchanged, exactly as today
--   (b) livemode is FALSE **and** channel is 'online' **and** this column is FALSE for the truck's operator
-- 🔴 (b) CAN ONLY EVER ADD ROWS. Nothing that counts today stops counting. That is the acceptance
-- criterion, not a preference: a truck with no connected Stripe account must keep counting its cash
-- collections exactly as now, which is why the rule tests `livemode === true` FIRST and independently.
-- A blanket comparison of a row's livemode against an account mode would break precisely that case, and
-- would be a subtraction wearing an addition's clothes.
--
-- ── 🔴 NULLABLE, NO DEFAULT — AND NULL MUST NEVER BE READ AS "LIVE" ─────────────────────────────────
-- NULL means THERE IS NO CONNECTED ACCOUNT. It does not mean live, it does not mean test, and it does
-- not mean unknown-so-assume-the-common-case. Every read must test `=== false` for arm (b), never
-- `!== true` and never a truthiness check:
--   • `=== false`  → a NULL operator contributes nothing to arm (b), which is correct: with no account
--                    there can be no online rows to admit, so the arm is vacuous for them.
--   • `!== true`   → 🔴 WRONG. It would admit every `livemode: false` online row for every operator that
--                    has never connected Stripe, on the strength of a column that was never set.
-- There is deliberately no default. A default of `false` would silently classify every operator as
-- holding a test account, including ones with no account at all; a default of `true` would be worse.
-- The backfill below sets the value for exactly the rows that have an account and leaves the rest NULL.
--
-- ── WHERE THE VALUE COMES FROM ──────────────────────────────────────────────────────────────────────
-- ✅ FROM STRIPE'S OWN ACCOUNT OBJECT, NOT FROM OUR KEY. The v2 Account object carries `livemode: boolean`
-- as a non-optional field (verified against the installed SDK: stripe/resources/V2/Core/Accounts.d.ts:95,
-- "Has the value `true` if the object exists in live mode or the value `false` if the object exists in
-- test mode"). app/api/stripe/connect/route.ts reads it off the create response and writes it here in the
-- same statement as `stripe_account_id`. This follows the house rule already recorded for the v2
-- migration: READ THE ACCOUNT BACK; a 200 on the create call is not evidence about what landed.
--
-- ⚠️ AND WHY DERIVING A MODE IS LEGITIMATE HERE BUT FORBIDDEN FOR A WEBHOOK EVENT — the distinction is
-- not a double standard, it is the difference between two kinds of fact:
--   • AN ACCOUNT'S MODE IS A PROPERTY OF THE KEY THAT CREATED IT. A test key creates a test account and
--     can create nothing else; the account cannot later change mode. So the key is a sound source, and
--     the account object agreeing with it is a confirmation rather than a coincidence.
--   • AN EVENT'S MODE IS A PROPERTY OF THE EVENT. A production Connect webhook URL receives BOTH live
--     and test events by design, so the endpoint proves nothing and the key proves nothing about a
--     callback that arrived unbidden. That is why stripe_webhook_events.livemode and
--     order_payments.livemode are copied verbatim from the event and may never be inferred.
-- The code reads the account object anyway, so the derivation is a fallback, not the mechanism.
--
-- ── 🔴 RUN ORDER: **APPLY THIS BEFORE DEPLOYING THE CODE.** ─────────────────────────────────────────
-- DEPLOY-COUPLED, verified rather than assumed. `operators` is read with NAMED selects on the paths this
-- change touches:
--     app/api/dashboard/route.ts        ->  .select('stripe_charges_enabled')            -- NAMED
--     app/api/stripe/checkout/route.ts  ->  .select('stripe_account_id, stripe_charges_enabled')  -- NAMED
--     app/api/menu/[truckId]/route.ts   ->  .select('stripe_charges_enabled')            -- NAMED
--     app/api/stripe/connect/route.ts   ->  .select('id, stripe_account_id, ...')        -- NAMED
-- There is NO select('*') on `operators` anywhere. This column is added to the dashboard and connect
-- selects. PostgREST answers a named select on a column it cannot see with 42703 and fails the WHOLE
-- statement, so deploying first would break the dashboard's operator read and the Connect tab.
-- Migration first. Then deploy.
--
-- VERIFY AFTER APPLYING:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'operators' and column_name = 'stripe_account_livemode';
--   -- expect exactly 1 row: stripe_account_livemode | boolean | YES | null
--
--   select stripe_account_livemode, count(*) from operators group by 1;
--   -- expect: false = (however many operators hold a stripe_account_id), null = the rest. NEVER true.

alter table operators
  add column if not exists stripe_account_livemode boolean;

-- ── BACKFILL — ONE TIME, AND IT CANNOT BE WRONG ────────────────────────────────────────────────────
-- Every account id in this table today was created by this build, and this build REFUSES any key that
-- does not start `sk_test_` (lib/stripe/connect.ts:88 — "REFUSING: STRIPE_SECRET_KEY is not a sandbox
-- key"). A live account therefore cannot exist here. `false` is not an assumption about these rows; it
-- is the only value the code that made them could have produced.
-- ⚠️ Scoped to rows that HAVE an account. Operators with none stay NULL — see the note above on why NULL
-- must not become `false`.
update operators
   set stripe_account_livemode = false
 where stripe_account_id is not null
   and stripe_account_livemode is null;

comment on column operators.stripe_account_livemode is
  'Is this operator''s connected Stripe account a LIVE account? Read from the v2 Account object''s own `livemode` field at creation, never from NODE_ENV. 🔴 NULL means NO CONNECTED ACCOUNT and must NEVER be read as "live" — every consumer tests `= false` for the test-account arm, never `is distinct from true`. Exists so a test-mode card payment (which can only ever be livemode=false, because Stripe derives that from the authenticating key) can count toward a balance on a truck whose account is itself test. The rule is ADDITIVE: livemode=true rows count exactly as before, unconditionally.';

notify pgrst, 'reload schema';
