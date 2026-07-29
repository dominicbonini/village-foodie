-- 20260730_drop_trucks_default_walkup_payment.sql
-- DROP trucks.default_walkup_payment. It shipped yesterday (20260729_trucks_paid_step_settings.sql),
-- was never useful, and is now unreferenced. `show_paid_step` STAYS — this drops only its companion.
--
-- 🔴 CLASSIFICATION: **DEPLOY-COUPLED — AND IN THE OPPOSITE DIRECTION TO EVERY OTHER MIGRATION HERE.**
-- Additive migrations run BEFORE the deploy. A DROP must run **AFTER** it.
--
--   ✅ CORRECT ORDER:  1. deploy the code that no longer references the column
--                      2. THEN run this migration
--
--   ❌ WRONG ORDER (drop first): the CURRENTLY DEPLOYED build still contains
--        supabase.from('trucks').update({ default_walkup_payment: value })
--      in the `set_default_walkup_payment` action. Against a dropped column PostgREST returns PGRST204
--      and the Settings control 500s for any operator who touches it. `trucks.select('*')` keeps working
--      (it never names the column), so reads degrade quietly rather than breaking — but a live operator
--      hitting the old toggle would get an error. There is no version in which dropping first is safe.
--
-- ⚠️ There is NO rush and no harm in leaving the column in place indefinitely — it is one unused text
-- column with a default. If you are not deploying today, do nothing. The only wrong move is running this
-- before the deploy.
--
-- ── WHY IT IS BEING REMOVED ─────────────────────────────────────────────────────────────────────────
-- Walk-ups and PHONE orders arrive through the SAME Add Order panel with OPPOSITE payment timings, so a
-- truck-level default is wrong roughly half the time. The operator therefore had to read and correct the
-- confirm bar on every single order — strictly worse than no default at all, because a wrong default that
-- looks right is more dangerous than an explicit choice. Replaced with open-check semantics: the confirm
-- bar offers TWO equal actions ("Confirm and take £X.XX" / "Confirm order"), neither pre-selected, and
-- the operator decides per order at the moment of sale — which is what they were doing anyway.
--
-- ⚠️ NO DATA OF VALUE IS LOST. The column was a UI default only — never a payment record. All payment
-- state lives in the order_payments ledger and is untouched by this. Every truck still reads the
-- shipped default ('at_order') because no UI ever wrote any other value in the one day it existed.
--
-- IDEMPOTENT: `drop ... if exists` for both the constraint and the column, so re-running is a no-op.
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   -- the column must be GONE, and show_paid_step must still be there:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'trucks' and column_name in ('show_paid_step','default_walkup_payment');
--   -- expect exactly ONE row: show_paid_step | boolean | NO | false
--   -- the CHECK constraint must be gone too (a column drop takes it, but confirm rather than assume):
--   select count(*) as leftover_checks from pg_constraint
--    where conrelid = 'trucks'::regclass and contype = 'c'
--      and pg_get_constraintdef(oid) ilike '%default_walkup_payment%';   -- expect 0
--   -- and the paid step itself is untouched for every truck:
--   select show_paid_step, count(*) from trucks group by 1 order by 2 desc;

-- Explicit, though `drop column` would remove it implicitly — stated so the intent is readable and so a
-- partial re-run cannot leave a constraint referencing a missing column.
alter table trucks drop constraint if exists trucks_default_walkup_payment_check;

alter table trucks drop column if exists default_walkup_payment;

notify pgrst, 'reload schema';
