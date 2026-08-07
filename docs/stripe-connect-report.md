# The livemode discriminator — build report

**Date:** 7 August 2026
**Supersedes:** the Stripe Connect readiness audit previously at this path. Its finding is restated in "What was wrong"; its other conclusions are unchanged and unbuilt.
**Provenance:** that audit — a production Connect webhook URL receives **both** live and test events, and `order_payments` had no column that could tell them apart.
**Scope built:** the discriminator column and the filtering. **No Stripe integration** — no webhook endpoint, no PaymentIntent, no onboarding, no keys, no SDK, no env var.

---

## 🔴 Operational precondition — read before deploying

**The migration is written and NOT run, as instructed. The accompanying code is deploy-coupled and must not ship until it is applied.**

The new code both selects and filters on `livemode`. PostgREST returns **PGRST204** for a column it cannot see, and `/api/dashboard`'s payments fetch degrades to an **empty map** on error — which renders **every order as unpaid** on the operator's board ([route.ts:255-258](app/api/dashboard/route.ts#L255-L258)).

```
APPLY THE MIGRATION FIRST.  THEN DEPLOY.  Not the other way round.
```

The reverse order is a no-op: the column is defaulted and the currently-deployed code never names it, so the migration is safe to apply on its own at any time, including mid-service.

⚠️ **What this means for confidence:** `tsc` and ESLint are clean, and every code path is traced below — but because the migration has not been run, **nothing here has been exercised against a database that has the column.** The reasoning is verified; the round-trip is not.

---

## Summary

| | |
|---|---|
| **Column** | `livemode boolean not null default true` — migration written, **not run** |
| **Existing rows** | 100% classified **live** by the default, with no backfill statement |
| **Omission hazard** | closed in the **type system** — `recordPaymentEvent` takes `livemode` as a **required** parameter, so a writer that forgets fails to compile |
| **Exclusion shape** | strict `livemode === true`, enforced at the **chokepoint** (`getOrderBalance`) plus at all three SQL readers |
| **Consumers audited** | 9 — 7 exclude, **2 deliberately do not** (both are row counts protecting retention, not money) |
| **`tsc --noEmit`** | exit 0, before and after |
| **ESLint** | 912 messages / 15 rules, **rule-for-rule identical** to baseline |
| **Gusto** | every existing row live; nothing they see changes; verified path by path in §Verify |

**Nothing in the prompt arrived garbled.** One repeat of last time's minor discrepancy, flagged not assumed: you dated the prior audit 6 August; the file's own header said 7 August (today). The finding is the one I re-verified.

---

## What was wrong (re-verified in the current tree, not taken on trust)

```
$ grep -rn "from('order_payments')" --include='*.ts' . | grep -v node_modules
```
returned 8 sites, **none** of which referenced a mode. The table's 14 columns were re-read from
[20260729_order_payments_ledger.sql:54-84](supabase/migrations/20260729_order_payments_ledger.sql#L54-L84)
and [20260730_takes_cash_and_payment_method.sql:56](supabase/migrations/20260730_takes_cash_and_payment_method.sql#L56):
no `livemode`, no `is_test`, no `mode`. Confirmed still true before editing.

The three columns that might plausibly have carried the distinction cannot:

- **`channel`** — a test online payment and a real one are both `'online'`, the exact value that tells the fee engine the 0.99% applies ([ledger.sql:24-27](supabase/migrations/20260729_order_payments_ledger.sql#L24-L27)).
- **`external_ref`** — test and live PaymentIntent ids are not distinguishable by shape.
- **`state`** / `method` / `currency` — none encodes the mode.

Against Stripe's documented behaviour: *"your production webhook URLs receive both live and test webhooks… We recommend that you check the `livemode` value."* A production endpoint is a mixed-mode firehose **by design**.

---

## 1. The column

### The migration — written, not run

`supabase/migrations/20260807_order_payments_livemode.sql`

```sql
-- 20260807_order_payments_livemode.sql
-- The LIVEMODE DISCRIMINATOR on the payment ledger. Prerequisite for ANY Stripe work (§37, and
-- docs/stripe-connect-report.md). Nothing may write a Stripe payment until this column exists.
--
-- ── 🔴 WHY THIS IS THE FIRST THING BUILT, BEFORE ANY STRIPE CODE ────────────────────────────────────
-- Stripe's own Connect documentation, verbatim: "your production webhook URLs receive BOTH live and test
-- webhooks. This is because you can perform both live and test transactions under a production
-- application. We recommend that you check the `livemode` value." A single production endpoint is
-- therefore a mixed-mode firehose BY DESIGN, not by misconfiguration.
-- Today `order_payments` has fourteen columns and NONE of them can tell a test £25 from a real one:
--   • `channel` cannot — a test online payment and a real one are BOTH 'online', which is the exact value
--     that tells the fee engine to charge the 0.99% platform fee.
--   • `external_ref` cannot — test and live PaymentIntent ids are not distinguishable by shape.
--   • `state`, `method`, `currency`, `note` cannot — none of them encodes the mode.
-- `order_payments` is the six-year accounting record the published privacy policy commits to retaining,
-- on a truck (Pizzeria Gusto) trading real money today. Mixing test rows into it and separating them
-- afterwards means unpicking by hand, per-row, with no reliable key to unpick on. This column is what
-- makes that unnecessary.
--
-- ✅ CLASSIFICATION: **ADDITIVE**, and safely so — one new column carrying a NOT NULL DEFAULT that
-- encodes exactly today's truth. It is safe to run at any time against the CURRENTLY-DEPLOYED app: that
-- code never names `livemode`, so every insert it makes takes the default and is classified LIVE, which
-- is correct for every one of them.
--
-- 🔴 RUN ORDER: apply BEFORE deploying the accompanying code. **DEPLOY-COUPLED, and in one direction
-- only.** The new code both SELECTS and FILTERS on `livemode` (lib/payments/ledger.ts readLedger +
-- reverseCollectionPayment, app/api/dashboard/route.ts). PostgREST returns PGRST204 for a column it
-- cannot see, so deploying first would make the dashboard's payments fetch fail on every poll — and that
-- route degrades to an EMPTY payments map, which renders every order as UNPAID on the operator's board.
-- The reverse order is a no-op: the column is defaulted and the old code never names it.
--   APPLY THIS FIRST. THEN DEPLOY. Do not do it the other way round.
--
-- ── WHY `not null default true` AND NOT NULLABLE ────────────────────────────────────────────────────
-- Three candidate shapes were considered and two rejected:
--
--   ✗ NULLABLE, no default. Every existing row would read NULL, which means "unknown". But they are NOT
--     unknown — every row in this table today is a real cash or own-PDQ collection taken at a real hatch
--     (channel is 'in_person_other' on 100% of rows; 'online' has never been written). Recording a known
--     fact as NULL discards information, and it forces every reader to invent a policy for NULL. A
--     three-valued money column is how you get two readers disagreeing about the same row.
--
--   ✗ NOT NULL, NO DEFAULT (the strictest schema). Attractive, because then an INSERT that forgets
--     `livemode` fails LOUDLY with 23502 instead of silently defaulting to live. But it cannot be applied
--     in one step against a live trading truck: the currently-deployed recordPaymentEvent() does not name
--     the column, so the moment this migration landed, EVERY "Paid & collected" tap at Gusto's hatch
--     would 23502 until the deploy caught up. A guard that takes the hatch down mid-service is not a
--     guard. See the two-phase note below — this shape is the DESTINATION, not the first step.
--
--   ✅ NOT NULL DEFAULT TRUE. The default is what makes the migration independently safe, and `true` is
--     the only correct classification for the rows already there. The "silently live by omission" hazard
--     that the no-default shape would have closed is closed instead IN THE TYPE SYSTEM: recordPaymentEvent
--     takes `livemode: boolean` as a REQUIRED parameter (not optional, no default), so a future writer
--     that omits it fails to COMPILE. That is an earlier and louder failure than 23502 at runtime, and it
--     costs no availability.
--
-- ── PHASE TWO, RECORDED SO IT IS NOT FORGOTTEN (NOT DONE HERE, DELIBERATELY) ────────────────────────
-- Once this migration is applied AND the accompanying deploy is live everywhere — i.e. once no running
-- code can insert without naming `livemode` — the default should be dropped:
--     alter table order_payments alter column livemode drop default;
-- That converts "omission is silently live" into "omission is 23502", closing the hole for raw SQL and
-- for any future service that is not this TypeScript codebase. It is a SEPARATE migration on purpose:
-- doing it here would re-introduce exactly the outage described in the rejected shape above, because
-- both steps cannot be simultaneously true during a rolling deploy. Do not fold it in.
--
-- ⚠️ NO BACKFILL STATEMENT IS NEEDED OR WANTED. `add column ... not null default true` populates every
-- existing row with `true` as part of the ALTER (Postgres 11+ does this without a table rewrite). A
-- separate `update ... set livemode = true` would be a no-op that touches every row for nothing.
--
-- ⚠️ THIS COLUMN AFFECTS NO ARITHMETIC. It is a FILTER, never a term. getOrderBalance still computes
-- paid = Σcharges − Σrefunds over state='succeeded'; this decides only which rows are eligible to be
-- summed at all. Same relationship `state` already has to the sum.
--
-- ⚠️ IT IS NOT `channel`, AND MUST NOT BE FOLDED INTO IT. `channel` answers "does the platform fee
-- apply?" (see 20260729_order_payments_ledger.sql). `livemode` answers "is this money real?". A test
-- online payment is channel='online' AND livemode=false: it WOULD attract a fee if it were real, and it
-- is not real. Collapsing the two would make every fee query an `in (...)` over a growing list — the
-- exact mistake 20260730_takes_cash_and_payment_method.sql refused for `method`, for the same reason.
--
-- VERIFY AFTER APPLYING (reads resulting STATE, not the statement's return):
--   -- the column, with its type, nullability and default
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'order_payments' and column_name = 'livemode';
--   -- expect exactly 1 row: livemode | boolean | NO | true
--   -- the table is now fifteen columns
--   select count(*) as col_count from information_schema.columns where table_name = 'order_payments';
--   -- expect 15
--   -- 🔴 THE ONE THAT MATTERS: EVERY EXISTING ROW MUST BE LIVE. A single `false` here means the
--   -- migration ran against data it should not have, and real takings have been reclassified as test.
--   select livemode, count(*) from order_payments group by 1;
--   -- expect a SINGLE row: t | <all rows>. If a `f` row appears, STOP.
--   -- per-truck, so Gusto is checked by name rather than in aggregate
--   select truck_id, livemode, count(*) from order_payments group by 1, 2 order by 1;
--   -- expect every truck to have exactly one row, livemode = t
--   -- the partial index below
--   select indexname, indexdef from pg_indexes
--    where tablename = 'order_payments' and indexname = 'order_payments_test_rows_idx';

alter table order_payments add column if not exists livemode boolean not null default true;

-- PARTIAL index, on the MINORITY side. Every row today is live and the overwhelming majority always will
-- be, so an index over `livemode = true` would be an index over the whole table and would not be used.
-- The queries that need help are the reconciliation and clean-up ones — "show me the test rows for this
-- truck", "delete the test rows before go-live" — which are exactly the `not livemode` side. Indexing
-- only that side keeps the index a few pages rather than a copy of the table.
-- ⚠️ It deliberately does NOT cover the hot read path. That path is `where order_key = $1 and livemode`,
-- already served by order_payments_order_key_idx (an order has single-digit payment rows, so the livemode
-- filter is a cheap recheck on a tiny set, not a scan).
create index if not exists order_payments_test_rows_idx
  on order_payments (truck_id, created_at) where not livemode;

comment on column order_payments.livemode is
  'Is this money REAL? Written from the Stripe event''s own `livemode` field — NEVER from an env var, a key prefix, or which endpoint received the callback, because only the event knows which mode produced it (a production Connect webhook URL receives BOTH live and test events by design). TRUE on every in-person collection: there is no test mode for cash. FALSE rows are excluded from every consumer that means money — getOrderBalance, the payment_status/amount_paid rollup, and the payments map shipped to the operator surface. They are deliberately NOT excluded from the two admin row-COUNTS (delete-truck guard 3, execute-account-deletion paymentsIntact), which protect physical retention rather than reporting money, and must over-count rather than under-count. Affects no arithmetic: it is a filter on which rows are eligible to be summed, never a term in the sum.';

notify pgrst, 'reload schema';
```

### Nullable or NOT NULL, and which default — stated

**`boolean not null default true`.** Three shapes were considered; the reasoning is in the migration header and is summarised here because you asked for it stated:

| Shape | Existing rows | Rejected because |
|---|---|---|
| Nullable, no default | NULL = "unknown" | They are **not** unknown. Every row today is `channel='in_person_other'` — a real cash or own-PDQ collection. Recording a known fact as NULL discards information and forces every reader to invent a NULL policy. A three-valued money column is how two readers come to disagree about one row. |
| `not null`, **no default** | would fail | Strictly better *schema*, but unshippable in one step: the deployed `recordPaymentEvent` does not name the column, so the instant it applied, **every "Paid & collected" tap at Gusto's hatch would 23502** until the deploy caught up. A guard that takes the hatch down mid-service is not a guard. |
| ✅ `not null default true` | all → `true` | Chosen. |

**`true` is the only correct default for the rows already there** — it is not a convenience, it is the fact. And no backfill statement is needed: `add column … not null default true` populates every existing row as part of the ALTER.

### 🔴 "Must not silently classify a future test row as live by omission"

That is the one thing `default true` cannot do on its own, and it is the reason the requirement is worth stating. It is closed **one layer up, in the type system**:

```ts
    livemode: boolean          // required. no default. not optional.
```
— [ledger.ts:316](lib/payments/ledger.ts#L316), on `recordPaymentEvent`'s event parameter.

A future Stripe writer that omits it **does not compile**. That is an earlier and louder failure than a runtime 23502, and unlike the no-default schema it costs no availability. `tsc` exit 0 below is therefore not just a regression check — it is the evidence that both existing writers supply the value.

**Phase two is recorded in the migration and deliberately not folded in:** once the deploy is live everywhere, `alter column livemode drop default` closes the same hole for raw SQL and any future non-TypeScript writer. Doing it in this migration would reintroduce the outage described above, because both steps cannot be true simultaneously during a rolling deploy.

---

## 2. Written from the event, not from config

The reasoning is recorded at the write site — [lib/payments/ledger.ts:301-316](lib/payments/ledger.ts#L301-L316):

> 🔴 **WHEN THAT WRITER EXISTS, THIS VALUE COMES FROM `event.livemode` ON THE STRIPE EVENT ITSELF** — never from `STRIPE_SECRET_KEY`, never from an `sk_test_`/`sk_live_` prefix, never from `NODE_ENV`, and never from which endpoint received the callback. Stripe's own documentation is explicit that *"your production webhook URLs receive BOTH live and test webhooks"*, so the endpoint proves nothing and the key proves nothing about a callback that arrived unbidden. The event is the only artefact that knows which mode produced it, and it says so in a field. Read that field. Deriving this from configuration would reintroduce the entire defect this column exists to prevent, **while looking correct.**

Two corollaries are recorded at their own sites:

- **The insert names the column explicitly** ([:336-340](lib/payments/ledger.ts#L336-L340)) rather than leaning on the default: a row written from here always knows its own mode, so relying on the default would discard information we hold — and nothing changes here the day phase two drops the default.
- **`recordCollectionPayment` hardcodes `true`, and that is correct rather than a placeholder** ([:397-405](lib/payments/ledger.ts#L397-L405)): it books an in-person collection — an operator at a hatch who has physically taken cash or run a card through their own PDQ. **There is no test mode for cash.** No configuration can make that money less real, so there is nothing to read a flag from; the truth is in what the function does. A Stripe payment does not come through this function at all (it hardcodes `channel:'in_person_other'` and derives the amount from the balance, not from a processor).

---

## 3. Every consumer of `order_payments`, and whether it excludes

Nine sites, from an exhaustive sweep of `from('order_payments')` and `getOrderBalance(`.

### The shape chosen: chokepoint + shared column list

You asked for a shape where a **new** consumer is correct by default rather than by remembering. Three were available:

| Option | Why not / why |
|---|---|
| A Postgres view `order_payments_live` | A new reader that types `order_payments` still gets everything. Renaming does not enforce. |
| RLS policy | **Impossible here.** Every reader and writer is a service-role server route ([ledger.sql:96-98](supabase/migrations/20260729_order_payments_ledger.sql#L96-L98)), and service-role bypasses RLS. |
| ✅ **Filter inside `getOrderBalance`** | Chosen. |

**`getOrderBalance` is already the single funnel through which every money-meaning read passes** — `OrderCard`, the dashboard's `confirmedPaid`, `mapOrderToTicket`, `recalcOrderPayment` (which *writes* the derived caches) and `recordCollectionPayment` all derive paid-ness by calling it, and **nothing derives paid-ness any other way.** Filtering there means a consumer added next year is correct *because it called the resolver*, not because its author remembered a rule ([ledger.ts:147-160](lib/payments/ledger.ts#L147-L160)).

Second layer: **`LEDGER_ROW_COLUMNS`** ([ledger.ts:86](lib/payments/ledger.ts#L86)) — one exported select list shared by all three DB readers, so the column list cannot drift and no reader can quietly omit `livemode`.

### The strictness decision: `=== true`, not `!== false`

[ledger.ts:88-104](lib/payments/ledger.ts#L88-L104):

```ts
export function isLiveRow(row: { livemode?: boolean }): boolean {
  return row.livemode === true
}
```

Chosen for its **failure direction**, exactly as the brief requires:

- **Strict:** a consumer that forgets to select the column sees every row as ineligible → the order reads **unpaid** → the operator asks for money already taken. Visible, embarrassing, recoverable in one tap.
- **Lenient (`!== false`):** a forgotten column makes a **test** payment count as real → the customer shows as **paid** → food leaves the hatch against money that does not exist, and nothing anywhere reports it. Invisible and unrecoverable.

Between under-report and over-report on a money column there is no symmetry, so the check is not symmetric either. **This cost one real change** — the ticket-preview fixture had to gain `livemode: true` ([ticket-preview/page.tsx:76-81](app/dev/ticket-preview/page.tsx#L76-L81)) — and that breakage is the rule working, in the cheap direction.

### The table

| # | Consumer | file:line | Excludes? | Why |
|---|---|---|---|---|
| 1 | **`getOrderBalance`** (the chokepoint) | [ledger.ts:159](lib/payments/ledger.ts#L159) | ✅ **YES** | Every paid/part-paid/balance figure in the product. One filter, all consumers. |
| 2 | **`readLedger`** | [ledger.ts:227-234](lib/payments/ledger.ts#L227-L234) | ✅ **YES** (SQL) | Feeds `recalcOrderPayment`, which **writes** `orders.payment_status` / `amount_paid` — a test row here would put a fabricated figure into the caches every other surface trusts. |
| 3 | **`recalcOrderPayment`** | [ledger.ts:262](lib/payments/ledger.ts#L262) | ✅ inherits 1+2 | The only writer of the derived caches. |
| 4 | **`recordCollectionPayment`** | [ledger.ts:377](lib/payments/ledger.ts#L377) | ✅ inherits 1+2 | Decides **how much to charge**. A test row would tell an operator to collect less than they are owed. |
| 5 | **`reverseCollectionPayment`** lookup | [ledger.ts:477-486](lib/payments/ledger.ts#L477-L486) | ✅ **YES** (SQL) | 🔴 Needed *here specifically*: this is a `[0]` pick of the newest charge, not a sum, so the chokepoint cannot save it. Unfiltered, a test row written after a real collection would be selected **instead of it** — undo deletes a row representing no money and leaves the real payment standing on an order the operator now believes is unpaid. |
| 6 | **`/api/dashboard`** payments map | [route.ts:248-259](app/api/dashboard/route.ts#L248-L259) | ✅ **YES** (SQL) | The only route by which payment rows reach a browser — dashboard, KDS, and via `mapOrderToTicket` the printed ticket. Stops a test payment being **visible**, not just miscounted. |
| 7 | **`mapOrderToTicket`** (kitchen ticket) | [mapOrderToTicket.ts:69](lib/printing/mapOrderToTicket.ts#L69) | ✅ inherits 1 | Calls `getOrderBalance`. Its only caller today is the dev preview; when printing is wired to real rows they will come from (6). |
| 8 | **`delete-truck` guard 3** | [route.ts:161-164](app/api/admin/delete-truck/route.ts#L161-L164) | 🔴 **NO — deliberate** | See below. |
| 9 | **`execute-account-deletion` `paymentsIntact`** | [route.ts:63](app/api/admin/execute-account-deletion/route.ts#L63), [:91](app/api/admin/execute-account-deletion/route.ts#L91) | 🔴 **NO — deliberate** | See below. |

Plus the writer, [ledger.ts:323](lib/payments/ledger.ts#L323) (`recordPaymentEvent`'s insert), and the delete at [:509](lib/payments/ledger.ts#L509) which operates on a row already selected by (5) and so inherits its filter.

### 🔴 The two documented exceptions, and why the rule does not apply to them

Both are **physical row counts protecting retention**, not reports of money — and their safe direction is the **opposite** of the money paths. Both now carry the reasoning at the site so a later reader does not "tidy" them into consistency.

**8 — `delete-truck` guard 3** ([route.ts:152-160](app/api/admin/delete-truck/route.ts#L152-L160)). It asks *"would this delete destroy an accounting record?"* Adding `.eq('livemode', true)` would let a truck holding only test rows be hard-deleted — and `order_payments` cascades from **both** `orders(order_key)` and `trucks(id)`, so the cascade takes the whole table for that truck, live rows included, if the classification were ever wrong by one row. **Refusing to delete a truck that turns out to hold only test data is a mild inconvenience with a documented escape hatch (hand-run SQL). Deleting six years of real takings is not.** This is the same reasoning as the guard's own *"keyed on the data, not on a label"* note.

**9 — `paymentsIntact`** ([route.ts:151-157](app/api/admin/execute-account-deletion/route.ts#L151-L157)). It is a **regression detector**: *"did this run destroy any row it promised to keep?"* A filtered count would be **blind to test rows being destroyed** — exactly the quiet partial deletion the check exists to catch. It must count everything the table holds.

---

## 4. No Stripe integration built

Confirmed by the same greps as the prior audit, re-run after the edits:

| Check | Result |
|---|---|
| `stripe` in `package.json` | 0 matches — no SDK added |
| `process.env.STRIPE_*` anywhere | 0 |
| Any route under `app/api/webhooks/stripe` | does not exist |
| PaymentIntent / Checkout Session / Account Link code | none |
| `application_fee_amount` | 0 |

**Files touched by this task — six:**

| File | Change |
|---|---|
| `supabase/migrations/20260807_order_payments_livemode.sql` | **new**, not run |
| `lib/payments/ledger.ts` | `livemode` on `LedgerRow`; `LEDGER_ROW_COLUMNS`; `isLiveRow`; filter in `getOrderBalance`; SQL filters in `readLedger` + `reverseCollectionPayment`; required `livemode` param; both writers supply it |
| `app/api/dashboard/route.ts` | shared select list + `.eq('livemode', true)` |
| `app/api/admin/delete-truck/route.ts` | **comment only** — records why it does not filter |
| `app/api/admin/execute-account-deletion/route.ts` | **comment only** — same |
| `app/dev/ticket-preview/page.tsx` | fixture gains `livemode: true` |

⚠️ The working tree also carries **uncommitted changes from the previous KDS task** (`app/dashboard/[token]/kds/page.tsx`, `components/dashboard/OrderCard.tsx`). They are unrelated to this one; `git diff --stat` shows both.

---

## Verify

### Before vs after, for a truck with only live rows — **unchanged, path by path**

Every existing row is `livemode = true` after the migration, so `isLiveRow` admits every one of them and the filtered set equals the unfiltered set. Concretely:

| Consumer | Before | After | Identical? |
|---|---|---|---|
| `readLedger` | all rows for the order | all rows (every one `livemode=true`) | ✅ same rows |
| `getOrderBalance` | filters `state==='succeeded'` | filters `isLiveRow && state==='succeeded'` | ✅ same set → same `paidMinor`, `balanceMinor`, `status` |
| `recalcOrderPayment` | writes `payment_status`/`amount_paid` | same balance in → same values written | ✅ byte-identical write |
| `recordCollectionPayment` | `before` from live rows | same `before` | ✅ same `chargedMinor`, **same idempotency key** (it is a function of `paidBefore`+`balance`, both unchanged) |
| `reverseCollectionPayment` | newest non-online charge | same candidate set, same `[0]` | ✅ same row deleted/reversed |
| `/api/dashboard` payments map | rows without `livemode` | same rows **plus** `livemode: true` per row | ✅ additive to the payload |
| `OrderCard` chip / buttons | PAID / part-paid / Mark paid | same | ✅ |
| KDS card + Done-today strip | same | same | ✅ |
| dashboard `confirmedPaid` → offline payment overlay | same | same | ✅ |
| `mapOrderToTicket` printed ticket | same | same | ✅ |
| admin counts (8, 9) | all rows | all rows — **untouched** | ✅ |

The one field genuinely new anywhere a human can see is `livemode: true` inside the `/api/dashboard` JSON payload. Nothing renders it.

### If a test row is inserted (`livemode = false`)

Walked for an order with a £25 total and one `livemode=false` charge of £25:

| Observer | What they get |
|---|---|
| **`getOrderBalance`** | `{ paidMinor: 0, balanceMinor: 2500, status: 'unpaid' }` — the row is not summed |
| **The balance** | **£25.00 still due.** The test row contributes nothing |
| **The operator** | No PAID chip. The completion button still reads `Mark paid` / `💷 Cash` / `💳 Card` (or `Paid & collected` with the paid step off). The order stays actionable |
| **The customer** | Sees **unpaid**. Their view derives from `orders.payment_status`, whose only writer is `recalcOrderPayment` ([ledger.ts:2-7](lib/payments/ledger.ts#L2-L7)), which read only live rows |
| **The kitchen ticket** | Prints as unpaid / balance due — same resolver |
| **The row itself** | Still in the table, still readable by SQL, correctly labelled. Nothing is hidden from an auditor; it is excluded from *money*, not from *existence* |
| **`delete-truck`** | Counts it → refuses the delete. Over-protective, by design |
| **`paymentsIntact`** | Counts it → notices if it is destroyed. By design |

**The failure direction is the required one:** a test row makes the system say *"not paid yet"*, never *"paid"*.

### 🔴 Gusto

The whole point of the task, so verified specifically rather than in aggregate.

**Every existing row is classified live.** Gusto's rows are in-person collections booked by `recordCollectionPayment` — `channel='in_person_other'`, and `'online'` has never been written anywhere in the codebase's history (re-confirmed: the only channel literal in the tree is [ledger.ts:391](lib/payments/ledger.ts#L391)). `add column … not null default true` sets **every** existing row to `true` with no exception and no backfill logic that could get it wrong. The migration's verify block checks this by truck, not just in total:

```sql
select truck_id, livemode, count(*) from order_payments group by 1, 2 order by 1;
-- expect every truck to have exactly one row, livemode = t
```

**Nothing they see changes:**

- Their hatch flow is unchanged: `"Paid & collected"` → `'collected'` → `recordCollectionPayment` → one row, now carrying `livemode: true` **explicitly** rather than by default.
- The idempotency key is unchanged, so the offline outbox's replay-collides-into-a-no-op behaviour is unchanged.
- `payment_status` / `amount_paid` receive the same values.
- The card, the KDS and the ticket render identically.
- Undo still finds and deletes the same row.
- `show_paid_step` is false for them, so every payment-derived element on the card is `null` or a fixed label regardless — as established in the previous task.

**The only way this could harm them is deploying before applying the migration**, which is why that warning is at the top of this document rather than the bottom.

**And the point of it:** after this, a test-mode Stripe payment landing on their truck would be `livemode=false` — excluded from their balances, their board, their tickets and their takings, while still being a real row an auditor can see. That is what makes them safe to onboard in test mode later.

### Checks

```
$ npx tsc --noEmit ; echo $?
0                                    # identical before and after
```

`tsc` passing is load-bearing here, not just hygiene: `livemode` is a **required** parameter on `recordPaymentEvent`, so exit 0 is the proof that both existing writers supply it.

ESLint compared **by rule**, not by count:

```
$ diff lint-before.txt lint-after.txt
LINT RULE PROFILE IDENTICAL TO BASELINE

TOTAL 912
568 @typescript-eslint/no-explicit-any        15 react-hooks/refs
149 @typescript-eslint/no-unused-vars         15 @next/next/no-img-element
 44 react/no-unescaped-entities                8 @typescript-eslint/no-require-imports
 42 react-hooks/set-state-in-effect            8 (fatal)
 25 react-hooks/exhaustive-deps                8 react-hooks/purity
 17 @typescript-eslint/no-unused-expressions   4 react-hooks/preserve-manual-memoization
                                               4 react-hooks/immutability
                                               3 react-hooks/rules-of-hooks
                                               2 prefer-const
```

Zero drift on all 15 rules.

**Not run, per the brief:** the migration itself, `next build`, `next dev`, `npx cap sync`. Restated because it bounds the claim: the code compiles and lints, and every path is traced — but it has not executed against a database carrying the column.

---

## What this unblocks, and what it does not

**Unblocked:** a Stripe webhook writer can now be built, because there is somewhere to put the answer to *"is this money real?"* and every money-meaning consumer already ignores the rows where the answer is no.

**Still unbuilt, and still ahead of any first payment** (from the prior audit, unchanged):

- **No webhook in this repo verifies a signature.** Four endpoints exist; zero check one. The Stripe route must be built from Stripe's spec — raw body via `req.text()`, `Stripe-Signature`, `v1` scheme only, constant-time compare, non-zero tolerance — and will become the reference implementation for the four that predate it.
- **The idempotency key is unsafe for a webhook writer.** `collect:{orderKey}:{paidBefore}:{balance}` survives redelivery but collides on a legitimate second charge of the same amount. Use the Stripe object id — which is exactly the "client-minted per-tap key" [ledger.ts:170](lib/payments/ledger.ts#L170) already names as the only complete answer.
- **The fee columns §37 designed** — `gross_amount`, `fee_computed`, `fee_charged`, `fee_waived_reason`, `rate_applied`, `allowance_applied` — do not exist. Not needed to *prove* a payment; needed before anyone is *billed*.
- **Phase two of this migration** — `alter column livemode drop default`, after the deploy is live everywhere.
- **`trucks.currency` / `trucks.country`** remain **unverified**: §37 asserts they exist, no migration in the repo creates them, no code reads them. Same shape as the `operators.stripe_customer_id` error §13 records. Check `information_schema` before anything depends on them.
