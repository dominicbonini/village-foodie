-- 20260811_orders_confirmation_slot_fields.sql
-- The three values the customer confirmation shows that nothing currently stores.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────────────────────────────
-- The confirmation screen (app/trucks/[slug]/order/page.tsx) is reached today only as a component state
-- with no URL, so every value it renders can be held in memory. Making it reachable by URL means every
-- value has to survive a page load, and three of the fourteen it displays cannot:
--   1. the slot the customer ASKED for, before any roll-forward
--   2. whether the slot MOVED
--   3. the "Around HH:MM" ASAP estimate they were shown before they pressed Place order
-- A repo-wide grep for `requested_slot`, `slot_changed` and `asap_estimate` returned ZERO hits before
-- this migration. The customer path records the OUTCOME and discards the REQUEST.
--
-- ── ✅ CLASSIFICATION: ADDITIVE. NULLABLE, NO DEFAULTS. ─────────────────────────────────────────────
-- Every existing row reads NULL on all three, and NULL is the correct value for them: nobody captured
-- these facts when those orders were placed and none can be derived after the event. The confirmation
-- renders exactly as it does today when they are null — the slot-moved and ASAP-estimate blocks are
-- already conditional on truthy values, so a null simply takes the plain "Collection time: HH:MM" branch.
--
-- ── WHY TWO COLUMNS AND NOT THREE ───────────────────────────────────────────────────────────────────
-- `slot_changed` is NOT a column. It is `requested_slot is not null and requested_slot is distinct from
-- slot` — derivable from what is stored, and storing it as well would create two sources for one fact,
-- which is the drift this codebase repeatedly records. The submit route already computes `slotChanged`
-- server-side and returns it in the response; the confirmation derives the same answer from these two
-- columns. If you ever find yourself adding a boolean here, check first whether the comparison is wrong
-- rather than whether it is missing.
--
-- ── COLUMN SHAPES ──────────────────────────────────────────────────────────────────────────────────
--   requested_slot  text  -- 'HH:MM', matching orders.slot's own shape and storage. NULL for an ASAP
--                         -- order (which requests no slot) and for every row placed before today.
--   asap_estimate   text  -- 'HH:MM'. NULL for every non-ASAP order and for every row placed before
--                         -- today. See the note below: this one also needed a REQUEST field.
--
-- ⚠️ `text`, not `time`, deliberately: `orders.slot` is already text and every consumer does string
-- comparison and string formatting on it (`formatTime`, `slot.split(':')`). A `time` column here would be
-- the only typed clock value on the table and would need casting at every read to compare with its
-- neighbour. Consistency with the column it is compared AGAINST beats type purity.
--
-- ── 🔴 asap_estimate NEEDED A CLIENT CHANGE TOO, NOT JUST A COLUMN ─────────────────────────────────
-- The other two are computed on the server and were simply not persisted. The ASAP estimate is computed
-- in the BROWSER (`backwardAsap || asapSlot || customerAsapTime`) from the slots fetch, and never left it
-- — it is not in the request body, so the server has never seen it. A column alone would stay
-- permanently null. `asapEstimate` was therefore added to the submit payload as well.
-- ⚠️ IT IS DISPLAY-ONLY AND MUST STAY SO. It is a number the customer's own browser produced, so it may
-- never be used for reconciliation, capacity, or anything that decides money or a slot — the same rule
-- `client_ts` carries in the native offline outbox ("display only — NEVER used for reconciliation").
--
-- ── ✅ RUN ORDER: ADDITIVE, NOT DEPLOY-COUPLED. Either order is safe. ──────────────────────────────
-- CHECKED, NOT ASSUMED. Every read of these columns goes through a select that already tolerates them:
--   app/api/orders/[id]/route.ts   -> a NAMED select, and this build ADDS the two columns to it.
--                                     🔴 That makes THAT ROUTE deploy-coupled in the code-before-migration
--                                     direction: a named select on a missing column is 42703 and fails the
--                                     whole statement. Apply this migration first and the question does
--                                     not arise; the reverse order breaks /order/[id]/manage as well,
--                                     because both pages share that route.
--   app/api/orders/submit/route.ts -> writes them in an UPDATE, which cannot 42703 a SELECT. A failure
--                                     there is logged and non-fatal: the order is already committed.
--   app/api/dashboard/route.ts     -> orders are read with select('*'), so it never names them.
-- VERDICT: the COLUMNS are additive; the ORDER/[id] ROUTE is deploy-coupled. Migration first.
--
-- VERIFY AFTER APPLYING:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'orders' and column_name in ('requested_slot', 'asap_estimate')
--    order by column_name;
--   -- expect 2 rows, both: text | YES | null
--
--   select count(*) filter (where requested_slot is not null) as req,
--          count(*) filter (where asap_estimate  is not null) as asap,
--          count(*) as total
--     from orders;
--   -- expect req = 0, asap = 0 immediately after applying: no backfill, and none is possible.

alter table orders
  add column if not exists requested_slot text,
  add column if not exists asap_estimate  text;

comment on column orders.requested_slot is
  'The collection slot the CUSTOMER ASKED FOR, as ''HH:MM'', before any roll-forward. NULL for an ASAP order (nothing was requested) and for every row placed before 11 August 2026. Compare with `slot` to know whether the booking moved — there is deliberately no `slot_changed` boolean, because the comparison IS the answer and a stored copy could drift from it. DISPLAY ONLY: the confirmation screen reads it to say "your 12:00 slot was just taken". Nothing decides capacity, money or a booking from it.';

comment on column orders.asap_estimate is
  'The "Around HH:MM" estimate the customer was SHOWN before pressing Place order, on an ASAP order. NULL for every chosen-slot order and for every row placed before 11 August 2026. 🔴 COMPUTED IN THE CUSTOMER''S BROWSER and sent in the submit payload — the server has no equivalent, which is why a column alone would have stayed null. DISPLAY ONLY, and it must stay so: it is a client-produced number, the same class as the offline outbox''s `client_ts`, and may never be used for reconciliation, capacity or anything that decides money.';

notify pgrst, 'reload schema';
