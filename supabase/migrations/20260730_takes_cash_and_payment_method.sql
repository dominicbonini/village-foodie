-- 20260730_takes_cash_and_payment_method.sql
-- The CASH/CARD split. Two additive columns: a truck setting and a ledger dimension. V9.4, §37.
--
-- ✅ CLASSIFICATION: **ADDITIVE**, and safely so — both columns encode "nothing changes" by default.
--   trucks.takes_cash        boolean NOT NULL default FALSE → every truck keeps the single "Mark paid"
--                            / "Take payment" button it has today until an operator opts in.
--   order_payments.method    text NULLABLE, no default → every existing row reads NULL, which is the
--                            HONEST value: takes_cash was off, so we never asked how the money arrived.
-- RUN ORDER: apply BEFORE deploying. The Settings tab writes takes_cash and the ledger writes method;
-- PostgREST rejects an insert/update naming a column it cannot see (PGRST204), so deploying first would
-- break the new toggle and every "Cash"/"Card" tap. The reverse order is a no-op — the columns are
-- defaulted/nullable and the old code never names them.
--
-- ⚠️ NO BACKFILL, DELIBERATELY. `method` is left NULL on all existing rows. Inventing 'cash' or 'card'
-- for a payment nobody recorded a method for would be fabricating a financial record. NULL means
-- "not recorded", which is exactly what happened.
--
-- ── 🔴 WHY A NEW COLUMN AND NOT A WIDENED `channel` — DO NOT RE-LITIGATE ────────────────────────────
-- `channel` answers ONE question: *does the 0.99% platform fee apply, and does this count toward the
-- monthly allowance?* (§37, and the header of 20260729_order_payments_ledger.sql). Cash and the
-- operator's own PDQ are IDENTICAL on that axis — both `in_person_other`, both zero fee, both outside
-- the allowance. Adding 'in_person_cash'/'in_person_card' to `channel` would make every fee and
-- allowance query an `in (...)` over a growing list, and **one forgotten member silently charges a
-- platform fee on cash**. It would also leave every existing `in_person_other` row permanently
-- ambiguous.
-- `method` is a SEPARATE, ORTHOGONAL axis: *what did the customer physically hand over?* It exists for
-- till reconciliation, not for billing. Nothing in the fee engine may ever read it.
--
-- ⚠️ `method` AFFECTS NO ARITHMETIC. getOrderBalance and recalcOrderPayment are untouched — paid,
-- balance and payment_status derive from kind/amount_minor/state exactly as before. A method is a label
-- on a money event, never a term in it.
--
-- ⚠️ A manual payment is BY DEFINITION money taken outside the platform — Stripe payments log
-- themselves. So `method` is only ever written on `channel = 'in_person_other'` rows today. Online and
-- in_person_stripe rows keep NULL (their method is implicit in the channel).
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   -- both columns, with types, nullability and defaults
--   select table_name, column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where (table_name = 'trucks'         and column_name = 'takes_cash')
--       or (table_name = 'order_payments' and column_name = 'method')
--    order by table_name;
--   -- expect 2 rows: trucks/takes_cash/boolean/NO/false, order_payments/method/text/YES/null
--   -- the CHECK
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'order_payments'::regclass and contype = 'c'
--      and pg_get_constraintdef(oid) ilike '%method%';
--   -- EVERY existing truck must still read the safe default — nothing changed for anyone:
--   select takes_cash, count(*) from trucks group by 1;          -- expect a single row: f | <all>
--   -- EVERY existing payment row must read NULL — the no-backfill guarantee:
--   select method, count(*) from order_payments group by 1;      -- expect a single row: null | <all>

alter table trucks add column if not exists takes_cash boolean not null default false;

alter table order_payments add column if not exists method text;

-- Idempotent: drop-then-add so re-running converges rather than erroring on a duplicate name.
alter table order_payments drop constraint if exists order_payments_method_chk;
alter table order_payments
  add constraint order_payments_method_chk
  check (method is null or method in ('cash', 'card'));

comment on column trucks.takes_cash is
  'OFF (default) = today''s behaviour exactly: one "Mark paid" button on the card and one "Take payment" in Add Order. ON splits each into "Cash" and "Card" — two buttons, ONE TAP either way, never a modal (§10 fast-tap). Only surfaced when show_paid_step is also on.';

comment on column order_payments.method is
  'HOW the money physically arrived: cash, or the operator''s own card machine. NULL = not recorded (every row before the cash/card split, and every Stripe row, whose method is implicit in the channel). ORTHOGONAL TO channel: channel decides whether the 0.99% platform fee applies, method is for till reconciliation only. The fee engine must never read this column.';

notify pgrst, 'reload schema';
