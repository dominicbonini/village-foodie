-- 20260803_buzzer_settings.sql
-- The two SETTINGS columns for the buzzer feature: a van-level default and a per-event override.
-- Additive, nullable, no backfill. Run together with 20260803_orders_buzzer_number_placed_at.sql.
--
-- 🔴 DEPLOY-COUPLED — RUN THIS BEFORE DEPLOYING THE APP, AND THE COUPLING HERE IS THE DANGEROUS ONE.
-- Both columns are added to NAMED selects:
--   • truck_events.buzzer_prompt → app/api/dashboard/route.ts:128
--   • truck_vans.buzzer_count    → app/api/dashboard/route.ts:387 and app/api/manage/route.ts:960
-- A named select over a column PostgREST cannot see returns 42703 and fails the WHOLE statement. For
-- the truck_events one that means `todayEvents` comes back null, every selectedEventId branch below it
-- is skipped, the orders query never runs, and the route answers **HTTP 200 with `orders: []`** — a
-- blank board with no error and nothing in any log. That precise incident is written up at
-- app/api/dashboard/route.ts:135-153; the destructure now logs, but it still returns an empty board.
--
-- The reverse order is safe: both columns are nullable with no default and nothing in the running
-- build names them.
--
-- VERIFY AFTER APPLYING:
--   select table_name, column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where (table_name = 'truck_vans'   and column_name = 'buzzer_count')
--       or (table_name = 'truck_events' and column_name = 'buzzer_prompt');
--   -- expect two rows, both is_nullable = YES, both column_default = NULL

-- ── (a) truck_vans.buzzer_count ───────────────────────────────────────────────────────────────────
-- How many physical buzzers this van carries, numbered 1..N. This is the VAN DEFAULT and the master
-- switch in one column:
--   NULL  = this van has no buzzers. The whole feature is invisible — no grid, no chip, no prompt,
--           and the per-event override control is not even rendered.
--   1..30 = this van hands out buzzers, numbered 1..buzzer_count.
--
-- ⚠️ VAN-LEVEL, NOT TRUCK-LEVEL, and that is deliberate: buzzers are physical stock that lives in one
-- vehicle. A two-van truck can easily have buzzers in one and not the other, and kitchen_capacity /
-- order_ready_enabled already establish truck_vans as the home for per-vehicle service settings.
--
-- smallint + a 1-30 select in the UI. There is no CHECK constraint: the range is a UI affordance, and a
-- constraint would 500 a write rather than being a validation the operator can see.
alter table truck_vans
  add column if not exists buzzer_count smallint;

comment on column truck_vans.buzzer_count is
  'Number of physical buzzers this VAN carries, numbered 1..N. NULL = this van has no buzzers (feature entirely hidden). Van-level, not truck-level: buzzers are physical stock in one vehicle. Written by update_van_settings (app/api/manage/route.ts) - that handler drops any key not in its destructure, so a new setting must be added there or it saves silently and writes nothing.';

-- ── (b) truck_events.buzzer_prompt ────────────────────────────────────────────────────────────────
-- Per-event override for the AFTER-ORDER PROMPT only. It does NOT control whether buzzers exist (that
-- is buzzer_count) and it does NOT hide the grid or the card chip — an operator can always assign a
-- buzzer by hand. It governs one thing: does the grid open automatically after a new order is placed.
--
-- NULL = inherit. Resolved by resolveBuzzerPrompt (lib/buzzer.ts) as:
--     event.buzzer_prompt ?? (van.buzzer_count != null)
-- i.e. a van that has buzzers prompts by default, and an event can turn that off for one service
-- (a quiet lunch, a pitch where the buzzers were left behind).
--
-- ⚠️ `??` and not `||`: an explicit override of FALSE must be honoured, not fall through to the
-- default. This is the same nullish-inherit contract as show_paid_step_override / takes_cash_override,
-- and the reasoning is recorded at lib/payments/paid-step.ts:12-16.
--
-- ⚠️ NOTHING SEEDS THIS COLUMN and nothing bulk-writes it, deliberately — the paid-step model, not the
-- order_ready_override model. A new event simply has no row value and inherits, so an override never
-- carries forward to the next service. The absence of seeding IS the expiry
-- (lib/payments/paid-step.ts:18-34 records why that choice was made there).
alter table truck_events
  add column if not exists buzzer_prompt boolean;

comment on column truck_events.buzzer_prompt is
  'Per-event override for the after-order buzzer PROMPT only (not for whether buzzers exist - that is truck_vans.buzzer_count). NULL = inherit, resolved by resolveBuzzerPrompt in lib/buzzer.ts as event.buzzer_prompt ?? (van.buzzer_count != null). Never seeded, never bulk-written: a new event inherits, so an override expires by itself. Written ONLY by set_buzzer_prompt_override; the dashboard must never write the van default.';

-- PostgREST must reload or the named selects above return 42703 (→ silent empty board):
notify pgrst, 'reload schema';
