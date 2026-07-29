-- 20260729_trucks_paid_step_settings.sql
-- Two truck-level settings for the PAID STEP. Payments phase 1b part 1 (V9.4, §37).
--
-- ✅ CLASSIFICATION: **ADDITIVE**, and unusually safely so — both columns carry NOT NULL DEFAULTs that
-- encode EXACTLY today's behaviour, so every existing truck keeps the current one-tap
-- "Mark paid & done" flow with no visible change until an operator opts in.
-- RUN ORDER: apply BEFORE deploying. The Settings tab reads and writes both columns, and PostgREST
-- rejects an update naming a column it cannot see (PGRST204), so deploying first would break the two new
-- toggles. The reverse order is a no-op: the columns are defaulted and the old code never reads them.
--
-- ── WHY show_paid_step DEFAULTS TO FALSE ────────────────────────────────────────────────────────────
-- 🔴 Pizzeria Gusto trades with real customers on this code. `false` means the operator surface is
-- BYTE-IDENTICAL to today: one "Mark paid & done" button, one tap, one undo toast. The split button, the
-- Add Order payment decision, the paid chip and the two-stage undo are ALL gated behind this flag. A
-- truck sees the new flow only after deliberately turning it on.
--
-- ── WHY default_walkup_payment IS A TRUCK DEFAULT, NOT A REMEMBERED STATE ───────────────────────────
-- It seeds the Add Order confirm bar on EVERY order. The operator can flip an individual order the other
-- way, and that flip is deliberately NOT persisted — the next order returns to this default. The whole
-- point of the paid step is that the taps are identical every time; a control that remembers the last
-- choice makes the sequence depend on history, which is exactly what a fast-tap surface must not do.
-- 'at_order'      — money taken when the order is placed (the common walk-up: they order and pay at once)
-- 'at_collection' — order placed now, paid when collected (a tab, or food not ready)
--
-- ⚠️ NEITHER COLUMN IS A PAYMENT RECORD. They are UI defaults only. All payment state continues to be
-- derived from the order_payments ledger by lib/payments/ledger.ts — nothing here computes or mutates it.
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   -- both columns, with their types, NOT NULLs and defaults
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'trucks' and column_name in ('show_paid_step','default_walkup_payment');
--   -- expect 2 rows: boolean/NO/false, and text/NO/'at_order'::text
--   -- the CHECK constraint
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'trucks'::regclass and contype = 'c'
--      and pg_get_constraintdef(oid) ilike '%default_walkup_payment%';
--   -- EVERY existing truck must read the safe defaults — i.e. nothing changed for anyone:
--   select show_paid_step, default_walkup_payment, count(*)
--     from trucks group by 1, 2 order by 3 desc;
--   -- expect a single row: f | at_order | <all trucks>

alter table trucks add column if not exists show_paid_step boolean not null default false;
alter table trucks add column if not exists default_walkup_payment text not null default 'at_order';

-- Idempotent: drop-then-add so re-running converges rather than erroring on a duplicate name.
alter table trucks drop constraint if exists trucks_default_walkup_payment_check;
alter table trucks
  add constraint trucks_default_walkup_payment_check
  check (default_walkup_payment in ('at_order', 'at_collection'));

comment on column trucks.show_paid_step is
  'OFF (default) = today''s behaviour exactly: one "Mark paid & done" button. ON splits it into "Mark paid" then "Done", enables the Add Order payment decision, the paid chip and the two-stage undo. Gates the ENTIRE phase-1b operator surface — a truck sees nothing new until it opts in.';

comment on column trucks.default_walkup_payment is
  'Seeds the Add Order confirm bar on every walk-up. The operator may flip a single order the other way; that flip is deliberately NOT persisted, so the taps are identical every time. UI default only — never a payment record.';

notify pgrst, 'reload schema';
