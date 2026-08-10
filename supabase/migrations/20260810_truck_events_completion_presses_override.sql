-- 20260810_truck_events_completion_presses_override.sql
-- Per-event override for the completion setting. Mirrors truck_events.show_paid_step_override exactly.
--
-- ✅ CLASSIFICATION: **ADDITIVE**. NULLABLE with DEFAULT NULL, and NULL means "inherit the truck
-- default". Applying this changes nothing for anyone.
--
-- ── 🔴 IT DOES NEED A ONE-TIME BACKFILL, AND LEAVING IT OUT SILENTLY MOVES AN EVENT ─────────────────
-- The obvious reading — "nullable, no backfill, everything inherits, nothing changes" — is WRONG here,
-- and it was caught by resolving all 95 live events with both migrations simulated rather than by
-- reasoning. Until today ONE boolean drove both settings, so an event that overrode the paid step OFF
-- was ALSO overriding the completion to one press. Splitting them breaks that link: with this column
-- left null, such an event inherits the truck's completion default instead, which may be 'two'.
--     MEASURED: test-kitchen's 2026-07-30 event (show_paid_step_override = false, truck default true)
--     resolves 'one' today and would resolve 'two' after the split — a real behaviour change on a live
--     event, from a migration that looks inert.
-- So the UPDATE below carries the old coupling forward ONCE, per row, from each event's own
-- show_paid_step_override. With it: 0 of 95 events change. Without it: 1 does.
--
-- ⚠️ THIS IS A BACKFILL, NOT SEEDING, AND THE DISTINCTION IS THE WHOLE POINT OF THE NEXT SECTION.
-- It writes ONCE, only to events that ALREADY carry an explicit paid-step override, to preserve what
-- those events already do. It does NOT seed new events and does NOT bulk-write when a truck default
-- changes — those are the two things that must never happen here, and neither is happening.
-- An event whose show_paid_step_override is NULL stays NULL: it was inheriting before and inherits now.
--
-- 🔴 RUN ORDER: **APPLY THIS BEFORE DEPLOYING. THE REVERSE ORDER EMPTIES THE BOARD.**
-- This is the one migration in this series whose order is NOT symmetric, and the asymmetry is the whole
-- reason it needs saying. `paidStepFor` (app/api/dashboard/action/route.ts) and the dashboard's events
-- query (app/api/dashboard/route.ts) both read truck_events with a **NAMED SELECT**, and this column is
-- added to both. PostgREST rejects a statement naming a column it cannot see with **42703**, failing the
-- WHOLE statement — not just that field. Concretely, deploying first:
--   • /api/dashboard's events query fails → `todayEvents` is null → every selectedEventId branch is
--     skipped → the orders block never runs → the route answers **HTTP 200 with `orders: []`**. An empty
--     board is a SUPPORTED state (no event selected), so the failure wears the disguise of normal
--     behaviour. This exact incident is recorded at app/api/dashboard/route.ts:~142.
--   • `paidStepFor` fails → it LOGS AND CONTINUES with the truck defaults (deliberate: refusing would
--     strand an operator mid-service) → every per-event payment override is silently ignored for
--     'collected', 'undo_collected' and the walk-up paid-at-order path.
-- Applying this migration first is a no-op for the deployed build, which never names the column.
-- 🔴 SO: MIGRATION FIRST, THEN DEPLOY. Never the other way round.
--
-- ── THE MODEL — IDENTICAL TO show_paid_step_override, NOT A SECOND MECHANISM ────────────────────────
--   completionPresses = truck_events.completion_presses_override ?? trucks.completion_presses
--                       ?? (resolved showPaidStep ? 'two' : 'one')
-- Resolved at READ time, in exactly one place: lib/payments/paid-step.ts. `??` and never `||`, so an
-- explicit override of the non-default value is honoured rather than silently re-inheriting.
--
-- ── 🔴 NO SEEDING, NO BULK WRITE — SAME AS show_paid_step_override, AND FOR THE SAME REASON ─────────
-- Deliberately UNLIKE truck_events.order_ready_override, which IS seeded at event creation and
-- BULK-WRITTEN onto every event when the truck default flips. Correct there, wrong here: an operator who
-- set Saturday's festival to one press must not lose that because they changed their general default a
-- week later. Null-means-inherit gives all three properties for free:
--   • changing the truck default REACHES every event that was never explicitly overridden;
--   • it LEAVES ALONE every event the operator did override;
--   • an override never carries forward, because a new event simply has no value.
-- All three come from NOT writing code. Do not add a seed to the event-creation paths, and do not add a
-- bulk write to the Manage settings save.
--
-- ⚠️ NULLABLE IS LOAD-BEARING, NOT LAZINESS. A NOT NULL DEFAULT column could not express "inherit" at
-- all — every event would become a concrete override the moment it was created, and changing the truck
-- default would reach nothing.
--
-- ── ⚠️ THIS SETTING DECIDES WHAT AN UNDO REVERSES, WHICH THE PAID-STEP OVERRIDE DOES NOT ────────────
-- `completion_presses` drives undo_collected: one press ⇒ the undo reverses status AND payment; two ⇒
-- status only. So flipping this override MID-EVENT changes the meaning of an undo for orders that
-- already exist. An order paid by "Mark paid" at 18:00, the event flipped to one press at 19:00, then
-- collected and undone at 19:30 — and the undo DELETES a charge row booked ninety minutes earlier.
-- That hazard is why this override was declined once. It is being added deliberately anyway, because the
-- mid-service need is real (the same argument takes_cash_override was reversed on, 30 July); the hazard
-- is NARROW (it needs a flip between a payment and its undo, inside one event) and the audit trail
-- survives it — reverseCollectionPayment writes its audit row BEFORE deleting, via logActionOrThrow, so
-- a failed audit aborts the delete and the deletion is reconstructable from before_state.
-- 🔴 IF THIS EVER BITES, THE FIX IS NOT TO DROP THE OVERRIDE. It is to make undo_collected decide from
-- the ORDER's own audit trail — action_audit_log already distinguishes a 'collected' that booked the
-- charge (amount_minor set) from a prior 'mark_paid' — rather than from truck/event config at all.
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'truck_events' and column_name = 'completion_presses_override';
--   -- expect exactly 1 row: completion_presses_override | text | YES | null
--
--   -- 🔴 THE BACKFILL AGREEING WITH ITS SOURCE, PER ROW. Expect ZERO rows.
--   select id, event_date, show_paid_step_override, completion_presses_override from truck_events
--    where completion_presses_override is distinct from case
--            when show_paid_step_override is true  then 'two'
--            when show_paid_step_override is false then 'one'
--            else null end;
--
--   -- and the shape of the result: only events that already carried a paid-step override get a value.
--   select show_paid_step_override, completion_presses_override, count(*)
--     from truck_events group by 1, 2 order by 3 desc;
--   -- expect (live today): null|null|92,  true|two|1,  false|one|1,  and one null|null row whose
--   -- takes_cash_override is set but whose paid-step override is not.
--
--   -- the three payment override columns now sit side by side, all nullable:
--   select column_name, is_nullable from information_schema.columns
--    where table_name = 'truck_events'
--      and column_name in ('show_paid_step_override','takes_cash_override','completion_presses_override');
--   -- expect 3 rows, all YES
--
--   -- and the truck-level defaults are untouched by this migration:
--   select show_paid_step, takes_cash, completion_presses, count(*) from trucks group by 1,2,3;

alter table truck_events
  add column if not exists completion_presses_override text default null;

-- ONE-TIME, PER ROW, from each event's own show_paid_step_override — carrying forward the coupling that
-- existed until today. NULL stays NULL (inherit). See the header for the event this preserves.
update truck_events
   set completion_presses_override = case
         when show_paid_step_override is true  then 'two'
         when show_paid_step_override is false then 'one'
         else null end
 where completion_presses_override is null
   and show_paid_step_override is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'truck_events_completion_presses_override_chk'
  ) then
    -- NULL passes a CHECK, so "inherit" needs no special case here.
    alter table truck_events
      add constraint truck_events_completion_presses_override_chk
      check (completion_presses_override in ('one', 'two'));
  end if;
end $$;

comment on column truck_events.completion_presses_override is
  'Per-event override for the completion setting. NULL = inherit trucks.completion_presses (the default). ''one''/''two'' = an explicit choice made on the dashboard for THIS event only. Deliberately NOT seeded at event creation and NEVER bulk-written when the truck default changes — unlike order_ready_override — so changing the default reaches un-overridden events while leaving deliberate per-event choices intact. ⚠️ This setting decides what undo_collected reverses; see the migration header for the mid-event flip hazard. Resolved only by lib/payments/paid-step.ts.';

notify pgrst, 'reload schema';
