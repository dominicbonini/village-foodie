-- 20260810_trucks_completion_presses.sql
-- One truck-level setting: does completing an UNPAID order take one press or two?
--
-- ✅ CLASSIFICATION: **ADDITIVE**, and inert on arrival. Nothing existing is dropped, renamed or
-- re-typed. `trucks.show_paid_step` and `truck_events.show_paid_step_override` are UNTOUCHED and
-- stay exactly as they are — they keep owning the Add Order panel's shape and the per-event override.
--
-- ── 🔴 RUN ORDER: THIS ONE IS SAFE IN BOTH DIRECTIONS, WHICH IS WHY THIS SHAPE WAS CHOSEN ───────────
-- Apply BEFORE deploy (the normal order): the deployed build never names this column, so applying it
-- changes nothing for anyone.
-- Apply AFTER deploy (the wrong order): ALSO SAFE, and deliberately so. `trucks` is read with
-- select('*') everywhere (app/api/dashboard/route.ts, app/api/dashboard/action/route.ts), so a missing
-- column arrives `undefined` rather than raising 42703 — and lib/payments/paid-step.ts resolves
--     completionPresses = truck.completion_presses ?? (showPaidStep ? 'two' : 'one')
-- which reproduces TODAY'S BEHAVIOUR EXACTLY for every truck. Not a lucky accident: that fallback
-- expression exists for this window, and is documented at the resolver.
-- ⚠️ NO NAMED SELECT ANYWHERE NAMES THIS COLUMN. In particular it is NOT added to `paidStepFor`'s
-- truck_events select (app/api/dashboard/action/route.ts:~41) — that select is on the path the offline
-- outbox replays through, and its documented failure mode is "fails to a WRONG VALUE, not a crash".
-- Keeping this column off it is the reason this change carries no 42703 exposure at all.
--
-- ── 🔴 THE DEFAULT MUST BE BACKFILLED PER ROW, NOT SET TO A CONSTANT ────────────────────────────────
-- There is no single constant that preserves every truck, because the fleet is split 3/9:
--   show_paid_step = true  (3 trucks: pizzeria-gusto, test-kitchen, village-spice) -> TWO presses today
--   show_paid_step = false (9 trucks)                                              -> ONE press today
-- A constant default silently changes behaviour for one of the two groups. So the UPDATE below derives
-- the value from each row's own show_paid_step, and only then is the column made NOT NULL.
-- The column DEFAULT ('one') is a SAFETY NET for rows created outside provisioning, not a decision —
-- lib/provision-truck.ts sets this explicitly per profile so no new truck lands on a default nobody
-- chose (operator profile: 'two', matching its showPaidStep: true; demo profile: 'one').
--
-- ── WHY TEXT AND NOT A SMALLINT ─────────────────────────────────────────────────────────────────────
-- 'one'/'two' cannot be accidentally incremented and do not read as a count of something countable.
-- It also matches house style: crew_mode, display_mode, preorder_deadline_type are all text + CHECK.
--
-- ── WHY NO PER-EVENT OVERRIDE ───────────────────────────────────────────────────────────────────────
-- Deliberate, and recorded so it is not added casually. This setting decides what `undo_collected`
-- REVERSES (one press ⇒ status AND payment; two presses ⇒ status only). Flipping it mid-event would
-- change the meaning of an undo for orders that already exist: an order paid by "Mark paid" at 18:00,
-- the event flipped to one press at 19:00, then collected and undone at 19:30 — and the undo would
-- DELETE a charge row booked ninety minutes earlier. If per-event presses are ever wanted, the correct
-- fix is making undo_collected decide from the order's own audit trail, not an override column.
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   -- the column, its nullability and its default
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'trucks' and column_name = 'completion_presses';
--   -- expect exactly 1 row: completion_presses | text | NO | 'one'::text
--
--   -- the split, which must match the fleet's show_paid_step split exactly
--   select completion_presses, count(*) from trucks group by 1 order by 2 desc;
--   -- expect exactly two rows:  one | 9   and   two | 3
--
--   -- 🔴 THE REAL CHECK: the backfill agreeing with its source, PER ROW. Expect ZERO rows.
--   select id, show_paid_step, completion_presses from trucks
--    where (show_paid_step is true) <> (completion_presses = 'two');
--
--   -- and show_paid_step is untouched by this migration
--   select show_paid_step, takes_cash, count(*) from trucks group by 1, 2;
--   -- expect: t|f|3 and f|f|9 — the same split as before this ran

alter table trucks
  add column if not exists completion_presses text;

-- PER ROW, from each truck's own show_paid_step. Runs before NOT NULL so the column cannot briefly
-- hold a constant that is wrong for three quarters of the fleet.
update trucks
   set completion_presses = case when show_paid_step is true then 'two' else 'one' end
 where completion_presses is null;

alter table trucks
  alter column completion_presses set not null,
  alter column completion_presses set default 'one';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trucks_completion_presses_chk'
  ) then
    alter table trucks
      add constraint trucks_completion_presses_chk
      check (completion_presses in ('one', 'two'));
  end if;
end $$;

comment on column trucks.completion_presses is
  'Does completing an UNPAID order take one press or two? ''one'' = a single "Mark paid and collected" button firing the existing ''collected'' action (records payment and clears the order in ONE server action, ONE request, ONE outbox op). ''two'' = "Mark paid" then "Collected". Also decides what undo_collected reverses: one press ⇒ status AND payment, two presses ⇒ status only. Truck-level with NO per-event override — see the migration header. Independent of trucks.show_paid_step, which owns the Add Order panel and keeps its own per-event override. Resolved only by lib/payments/paid-step.ts.';

notify pgrst, 'reload schema';
