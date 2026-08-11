-- 20260811_trucks_online_payments_paused_at.sql
-- TEMPORARY operator kill-switch for online card payments.
--
-- ✅ CLASSIFICATION: **ADDITIVE**. NULLABLE, **NO DEFAULT**. Every existing row is NULL, and NULL means
-- online card payments are ENABLED — which is exactly today's behaviour. Applying this changes nothing
-- for anyone. No backfill, and none is possible to need: there is no prior column whose meaning has to
-- be carried forward.
--
-- ── WHAT THE VALUE MEANS ────────────────────────────────────────────────────────────────────────────
--   NULL         = online card payments are OFFERED (subject to operators.stripe_charges_enabled)
--   a timestamptz = an operator turned them OFF, and this is WHEN
-- The timestamp is not read by any gate — `IS NULL` is the whole decision. It exists so the dashboard
-- can say how long the truck has been paused, because this switch does NOT self-expire.
--
-- 🔴 IT DOES NOT SELF-EXPIRE, AND THAT IS DELIBERATE. The three per-event overrides in truck_events
-- expire by themselves because nothing seeds them onto the next event. This one is TRUCK-WIDE and
-- persists until an operator clears it. That is the correct semantics for a payment incident — an
-- outage does not end because the service did — but it means a truck can be left paused and forgotten.
-- The dashboard carries a persistent banner for exactly that reason. Do not add an auto-expiry here.
--
-- ── 🔴 RUN ORDER: **APPLY THIS BEFORE DEPLOYING THE CODE.** ──────────────────────────────────────────
-- This change is DEPLOY-COUPLED, and the coupling was VERIFIED rather than assumed. The comment at
-- lib/payments/paid-step.ts:93-95 asserts that `trucks` is read with select('*') everywhere; that is
-- TRUE for the menu route, the dashboard route and the action route, and **FALSE** for the one that
-- matters most:
--     app/api/stripe/checkout/route.ts  ->  .select('id, name, operator_id')   -- a NAMED select
-- This column is added to that named select. PostgREST answers a named select on a column it cannot
-- see with **42703**, failing the WHOLE statement — so deploying first would make `truck` null, the
-- route would return its 409 notReady, and EVERY card payment on EVERY truck would silently fall back
-- to pay-at-hatch. Quiet, total, and indistinguishable from the switch working.
-- Migration first. Then deploy.
--
-- ── 🔴 THIS COLUMN IS TEMPORARY. WHEN THE SWITCH IS REMOVED, DELETE ALL OF THIS ─────────────────────
-- The whole feature is four files plus this column. To remove it:
--   1. DELETE  lib/payments/online-payments-switch.ts          (the only resolver; nothing else holds the rule)
--   2. REVERT  app/api/menu/[truckId]/route.ts                 (one call -> back to `op?.stripe_charges_enabled === true`)
--   3. REVERT  app/api/stripe/checkout/route.ts                (one call + drop the column from the named select)
--   4. REVERT  app/api/dashboard/action/route.ts               (delete the `set_online_payments_paused` handler)
--   5. REVERT  app/dashboard/[token]/page.tsx                  (delete the Settings card, the banner, the save fn, the state)
--   6. REVERT  components/dashboard/types.ts                   (drop `online_payments_paused_at` from Truck)
--   7. RUN     alter table trucks drop column online_payments_paused_at;
-- Nothing else reads this column. Keep it that way — if a fifth reader appears, this list is wrong and
-- the removal stops being a delete.
--
-- ⚠️ DO NOT WIRE THIS INTO app/api/webhooks/stripe. Money that has already arrived must be recorded
-- whatever this column says; the webhook deliberately consults no truck or event setting before writing
-- the ledger. A payment in flight when the switch is flipped still lands in order_payments. Correct.

alter table trucks
  add column if not exists online_payments_paused_at timestamptz;

comment on column trucks.online_payments_paused_at is
  'TEMPORARY (added 2026-08-11). NULL = online card payments offered; a timestamp = an operator paused '
  'them, and when. Read ONLY through lib/payments/online-payments-switch.ts. Truck-wide, does not '
  'self-expire, dashboard-only control. Delete with the switch — see this migration for the file list.';
