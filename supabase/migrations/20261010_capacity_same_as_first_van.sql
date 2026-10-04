-- 20261010_capacity_same_as_first_van.sql
-- Kitchen capacity moves to Menu › Kitchen capacity, and gets its OWN "same as Van 1" flag.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent, so re-running is safe — see the note on the backfill, which is the only part
--    where that needed thought. The last line reloads PostgREST — do not skip it, or the new column
--    reads as absent and every van reports "set separately" regardless of its old flag.
--
-- ── 🔴 WHY A SECOND FLAG, AND NOT A REUSE OF same_as_first_van ────────────────────────────────────
-- Today ONE switch — Settings › Truck settings' "Same as Van 1" — covers everything a van owns,
-- capacity included. Capacity is moving to its own screen (Menu › Kitchen capacity) with its own
-- switch, and the two must be able to disagree: a truck may want Van 2 to follow Van 1's offline
-- protection and service settings while giving it a smaller kitchen, or the reverse.
--
-- Reusing one column would make the Menu switch silently move the Settings switch and vice versa —
-- two controls, one state, each able to undo the other with no indication that it had.
--
-- ── 🔴 EVERY VAN MUST BEHAVE EXACTLY AS BEFORE, WHICH IS WHAT THE BACKFILL IS FOR ─────────────────
-- `same_as_first_van` has been covering capacity, so a van following Van 1 today IS following Van 1's
-- capacity today. Adding a column that defaulted to `false` for everyone would silently unfollow
-- every such van the moment this deployed — the capacity would not CHANGE (the values were copied,
-- never looked up), but the switch would read "set separately" when the operator had said "same", and
-- a later change to Van 1 would stop reaching Van 2.
--
-- So the new flag is INITIALISED FROM THE OLD ONE. After this migration every van's two flags are
-- equal, and the verification select in the report counts exactly that.
--
-- ── ⚠️ IDEMPOTENT, AND THE BACKFILL IS THE REASON IT TAKES FOUR STATEMENTS ───────────────────────
-- A plain `update … set capacity_same_as_first_van = same_as_first_van` is NOT idempotent in the way
-- that matters: re-running it after an operator had turned the capacity switch off would silently
-- turn it back on. So the column is added NULLABLE with no default, the backfill is scoped to
-- `where capacity_same_as_first_van is null`, and only then does it become NOT NULL DEFAULT false.
--
--   • first run  → column added (all NULL) → backfill sets every row → NOT NULL applied.
--   • re-run     → column exists; NO row is NULL, so the backfill touches ZERO rows; the default and
--                  the NOT NULL are already in place and both statements are no-ops.
--
-- The NOT NULL is what makes the re-run safe: once it is on, no row can ever be NULL again, so the
-- backfill can never fire a second time. That ordering is the whole design.
--
-- ── 🔴 ADDITIVE ONLY. `same_as_first_van` IS NOT TOUCHED ─────────────────────────────────────────
-- It keeps its meaning and its data; it simply stops covering capacity. Nothing is dropped, renamed
-- or re-typed, and no other table is involved — `van_category_settings` is written exactly as it is
-- today, through lib/van-category-settings.ts.

set lock_timeout = '3s';

begin;

-- ── 1 · THE COLUMN, NULLABLE FOR NOW ─────────────────────────────────────────────────────────────
-- ⚠️ NO DEFAULT YET, DELIBERATELY. A default would fill new rows during this transaction and make the
-- "is null" backfill below unable to tell "not yet initialised" from "set to false on purpose".
alter table public.truck_vans
  add column if not exists capacity_same_as_first_van boolean;

-- ── 2 · THE BACKFILL — ONE ROW PER VAN, FROM ITS OWN OLD FLAG ───────────────────────────────────
-- 🔴 `coalesce(..., false)` BECAUSE THE SOURCE IS NOT NULL IN PRACTICE BUT THE READ SHOULD NOT ASSUME
-- IT. `same_as_first_van` is `not null default false` (20261005), so the coalesce is belt and braces
-- rather than a behaviour choice — and it costs nothing.
-- ⚠️ SCOPED TO `is null`, which is what makes this statement safe to run twice. See the header.
update public.truck_vans
   set capacity_same_as_first_van = coalesce(same_as_first_van, false)
 where capacity_same_as_first_van is null;

-- ── 3 · NOW IT CAN BE NOT NULL WITH A DEFAULT ───────────────────────────────────────────────────
-- 🔴 AND THIS IS THE GUARD ON STEP 2. With NOT NULL in place, no row can be NULL again, so a re-run
-- of this file finds nothing to backfill and cannot overwrite an operator's later choice.
-- ⚠️ `false` IS THE RIGHT DEFAULT FOR A *NEW* VAN. A van created after this migration has no
-- relationship to Van 1 until somebody says so — which is exactly what `same_as_first_van` does too.
alter table public.truck_vans
  alter column capacity_same_as_first_van set default false;

alter table public.truck_vans
  alter column capacity_same_as_first_van set not null;

comment on column public.truck_vans.capacity_same_as_first_van is
  'Does this van follow the FIRST van''s KITCHEN CAPACITY? Set and read only by Menu › Kitchen capacity. Initialised from same_as_first_van by 20261010 so every van behaved exactly as before, and independent of it from then on: Settings › Truck settings'' "Same as Van 1" now covers everything EXCEPT capacity. A COPY, NEVER A LOOKUP — switching it on copies the first van''s kitchen_capacity, capacity_window_mins and van_category_settings rows into this van, so no reader resolves through this column and switching it off keeps the copied values. The first van is the oldest ACTIVE van (firstVanId in lib/van-category-settings.ts). false on a new van: it has no relationship to Van 1 until somebody says so.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: `capacity_same_as_first_van` reads as absent
--    (PGRST204 / 42703), `get_vans` returns it undefined, and every van's capacity switch shows OFF
--    on correct code — which is the one state this migration's backfill exists to prevent.
notify pgrst, 'reload schema';
