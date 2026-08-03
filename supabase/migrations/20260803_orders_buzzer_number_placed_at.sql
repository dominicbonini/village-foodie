-- 20260803_orders_buzzer_number_placed_at.sql
-- Two ADDITIVE, NULLABLE columns on `orders` for the buzzer feature (phase 1, online only).
--
-- 🔴 DEPLOY-COUPLED — RUN THIS BEFORE DEPLOYING THE APP.
-- The failure mode is NOT a loud one. `orders` is read with select('*') (app/api/dashboard/route.ts:199,
-- :206), which cannot fail on a missing column — but the WRITE paths name `buzzer_number` and
-- `placed_at` explicitly, and PostgREST rejects an insert/update naming a column it cannot see with
-- PGRST204. Worse, the sibling `truck_events` read IS a named select
-- (app/api/dashboard/route.ts:128, which this feature extends with buzzer_prompt in
-- 20260803_buzzer_settings.sql): a named select over a column whose migration has not run returns
-- 42703, the events query comes back null, every selectedEventId branch is skipped, and the route
-- returns **HTTP 200 with `orders: []`** — an empty board, no error, nothing in any log. That exact
-- incident is recorded at app/api/dashboard/route.ts:135-153. Apply both buzzer migrations together,
-- BEFORE the deploy.
--
-- The reverse order is safe: both columns are nullable with no default, so applying this ahead of the
-- deploy changes nothing for the currently running build.
--
-- VERIFY AFTER APPLYING:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'orders' and column_name in ('buzzer_number', 'placed_at');
--   -- expect two rows, both is_nullable = YES, both column_default = NULL

-- ── (a) orders.buzzer_number ──────────────────────────────────────────────────────────────────────
-- The physical buzzer/pager handed to the customer for THIS order. Scoped to the order's event: the
-- same number is reused every service, and across concurrent events on the same date.
--
-- 🔴 THERE IS DELIBERATELY NO UNIQUE INDEX ON (event_id, buzzer_number). Assignment is
-- warn-then-confirm: the operator is TOLD the number is with another order and chooses to take it, at
-- which point the server clears it from the other row and sets it here. A unique constraint would turn
-- that confirmed, intended action into a 23505 → HTTP 500 at the hatch, mid-service. Uniqueness is an
-- APPLICATION invariant here, enforced in the set_buzzer handler
-- (app/api/dashboard/action/route.ts) and surfaced in the grid before the write. Do not add one.
--
-- smallint: buzzer_count is capped at 30 in the UI and a physical rack is never near 32767.
alter table orders
  add column if not exists buzzer_number smallint;

comment on column orders.buzzer_number is
  'Physical buzzer/pager number handed to the customer, unique per event by APPLICATION rule (warn-then-confirm), NOT by constraint - a unique index would 500 the confirmed take-it path. Null = no buzzer. Freed when the order reaches collected/cancelled/rejected (the row keeps the number; readers filter on BUZZER_IN_USE_STATUSES in lib/buzzer.ts).';

-- ── (b) orders.placed_at ──────────────────────────────────────────────────────────────────────────
-- 🔴 NULLABLE, NO DEFAULT, NO BACKFILL — AND THAT IS THE POINT.
-- `created_at` means "row inserted". For an order taken offline and replayed later that is the SYNC
-- time, not the moment of sale, and the two can be hours apart. `placed_at` is the moment the operator
-- (or customer) committed, minted client-side at the tap and sent in the POST body.
--
-- Existing rows have no placement time and INVENTING one is wrong: backfilling created_at would assert
-- a sale time we do not know, and would be silently wrong for exactly the offline rows the column
-- exists to describe. Every reader must treat null as UNKNOWN and fall back to created_at at read time.
--
-- ⚠️ DO NOT add `default now()` and DO NOT backfill. A default would make an unset placed_at
-- indistinguishable from a real one, which destroys the null-means-unknown contract above.
alter table orders
  add column if not exists placed_at timestamptz;

comment on column orders.placed_at is
  'Moment the order was COMMITTED (client-minted at the tap), as distinct from created_at = row inserted. For an offline order replayed later, created_at is the sync time and placed_at is the sale time. NULLABLE with NO default and NO backfill: null means unknown - readers fall back to created_at. Never add a default.';

-- PostgREST must reload or the write paths naming these columns get PGRST204:
notify pgrst, 'reload schema';
