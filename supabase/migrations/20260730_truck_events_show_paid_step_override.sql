-- 20260730_truck_events_show_paid_step_override.sql
-- Per-event override for the paid step. V9.5, §37.
--
-- ✅ CLASSIFICATION: **ADDITIVE**, and inert on arrival. The column is NULLABLE with DEFAULT NULL, and
-- NULL means "inherit the truck default" — so every existing event resolves exactly as it does today,
-- with no backfill and no seeding. Applying this changes nothing for anyone.
-- RUN ORDER: apply BEFORE deploying. The dashboard writes this column and /api/dashboard selects it;
-- PostgREST rejects a statement naming a column it cannot see (PGRST204/PGRST205), so deploying first
-- would break the per-event control and the events query. The reverse order is a no-op — old code never
-- names the column, and `?? truck.show_paid_step` is what it already effectively does.
--
-- ── THE MODEL ───────────────────────────────────────────────────────────────────────────────────────
--   showPaidStep = truck_events.show_paid_step_override ?? trucks.show_paid_step ?? false
-- Resolved at READ time, in exactly one place: lib/payments/paid-step.ts. `takes_cash` stays TRUCK-LEVEL
-- and has no event column — whether a truck accepts cash is a property of the business, not of a pitch.
--
-- ── 🔴 NO SEEDING, NO BULK WRITE — AND THAT IS THE POINT ────────────────────────────────────────────
-- This deliberately DIVERGES from `truck_events.order_ready_override`, which it otherwise mirrors.
-- order_ready_override is seeded at event creation and BULK-WRITTEN onto every event when the truck
-- default flips (app/api/manage/route.ts:~981 — "including events previously toggled on the dashboard
-- (they reset to the new value, by design)"). That is right for the order-ready step and WRONG here:
-- an operator who set Saturday's festival to take payment at order must not lose that because they
-- changed their general default a week later.
-- Null-means-inherit gives the correct behaviour for free:
--   • changing the truck default REACHES every event that was never explicitly overridden;
--   • it LEAVES ALONE every event the operator did override;
--   • an override never carries forward, because a new event simply has no value.
-- All three properties come from NOT writing code. **Do not add a seed to the three event-creation
-- paths, and do not add a bulk write to the Manage settings save.**
--
-- ⚠️ NULLABLE IS LOAD-BEARING, NOT LAZINESS. A NOT NULL DEFAULT FALSE column could not express
-- "inherit" at all — every event would be a concrete override the moment it was created, and changing
-- the truck default would reach nothing.
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   -- the column, with its nullability and default
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'truck_events' and column_name = 'show_paid_step_override';
--   -- expect exactly 1 row: show_paid_step_override | boolean | YES | null
--   -- EVERY existing event must read NULL — the no-seed, no-backfill guarantee:
--   select show_paid_step_override, count(*) from truck_events group by 1;
--   -- expect a single row: null | <all events>
--   -- and the truck-level defaults are untouched by this migration:
--   select show_paid_step, takes_cash, count(*) from trucks group by 1, 2;
--   -- expect a single row: f | f | <all trucks>   (unless a truck has already opted in)

alter table truck_events
  add column if not exists show_paid_step_override boolean default null;

comment on column truck_events.show_paid_step_override is
  'Per-event override for the paid step. NULL = inherit trucks.show_paid_step (the default). true/false = an explicit choice made on the dashboard for THIS event only. Deliberately NOT seeded at event creation and NEVER bulk-written when the truck default changes — unlike order_ready_override — so changing the default reaches un-overridden events while leaving deliberate per-event choices intact. Resolved only by lib/payments/paid-step.ts.';

notify pgrst, 'reload schema';
