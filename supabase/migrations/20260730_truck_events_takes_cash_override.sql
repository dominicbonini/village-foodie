-- 20260730_truck_events_takes_cash_override.sql
-- Per-event override for the cash/card split. V9.5, §37. Mirrors truck_events.show_paid_step_override.
--
-- ✅ CLASSIFICATION: **ADDITIVE**, and inert on arrival. NULLABLE with DEFAULT NULL, and NULL means
-- "inherit the truck default" — so every existing event resolves exactly as it does today, with no
-- backfill and no seeding. Applying this changes nothing for anyone.
-- RUN ORDER: apply BEFORE deploying. The dashboard writes this column and /api/dashboard selects it;
-- PostgREST rejects a statement naming a column it cannot see (PGRST204/PGRST205). The reverse order is
-- a no-op — old code never names it, and `?? trucks.takes_cash` is what it already effectively does.
--
-- ── 🔴 WHY THIS REVERSES A SETTLED DECISION ─────────────────────────────────────────────────────────
-- V9.5 originally ruled takes_cash TRUCK-LEVEL ONLY, reasoning that whether a truck accepts cash is a
-- property of the BUSINESS, not of a pitch. That reasoning was incomplete. **If the card terminal fails
-- mid-service, the operator needs cash enabled for TONIGHT, from the dashboard, without going into
-- Manage.** That is a genuine event-level need and it is time-critical — the one moment an operator
-- cannot be asked to navigate to another surface. The setting is also off by default, so some operators
-- will never find it in Manage at all.
--
-- ── NO SEEDING, NO BULK WRITE — SAME AS show_paid_step_override ─────────────────────────────────────
-- Null-means-inherit gives three properties for free, and all three are wanted here:
--   • changing the truck default REACHES every event that was never explicitly overridden;
--   • it LEAVES ALONE every event the operator did override — an operator who enabled cash for one
--     event must not lose it when they later change their general default;
--   • an override NEVER carries forward, because a new event simply has no value.
-- ⚠️ That last property is also how the terminal-failure case CLEANS ITSELF UP: tonight's event has cash
-- on, tomorrow's inherits the truck default. **There is no expiry mechanism and none should be built** —
-- the absence of seeding is the expiry.
--
-- ⚠️ NULLABLE IS LOAD-BEARING. A NOT NULL DEFAULT FALSE column could not express "inherit": every event
-- would be a concrete override from creation, and changing the truck default would reach nothing.
--
-- Resolved in exactly one place: lib/payments/paid-step.ts (resolvePaidStep). Do not add a second.
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   -- the column, with its nullability and default
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'truck_events' and column_name = 'takes_cash_override';
--   -- expect exactly 1 row: takes_cash_override | boolean | YES | null
--   -- EVERY existing event must read NULL — the no-seed, no-backfill guarantee:
--   select takes_cash_override, count(*) from truck_events group by 1;
--   -- expect a single row: null | <all events>
--   -- and both per-event override columns now exist side by side:
--   select column_name from information_schema.columns
--    where table_name = 'truck_events' and column_name like '%_override' order by 1;
--   -- expect: order_ready_override, show_paid_step_override, takes_cash_override
--   -- truck-level defaults untouched by this migration:
--   select show_paid_step, takes_cash, count(*) from trucks group by 1, 2;

alter table truck_events
  add column if not exists takes_cash_override boolean default null;

comment on column truck_events.takes_cash_override is
  'Per-event override for the cash/card split. NULL = inherit trucks.takes_cash (the default). true/false = an explicit choice made on the dashboard for THIS event only — the intended case is a card terminal failing mid-service, where the operator needs cash enabled tonight without going into Manage. Deliberately NOT seeded at event creation and NEVER bulk-written when the truck default changes, so the override expires by itself: the next event simply inherits the default again. Resolved only by lib/payments/paid-step.ts.';

notify pgrst, 'reload schema';
