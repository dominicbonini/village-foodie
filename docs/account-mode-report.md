# Making a test-mode card payment visible on a test-mode account

**Date:** 11 August 2026
**Result: BUILT. Migration written, not run. Three files changed. No `next dev`, no `next build`, no commit, no deploy.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

```
 M app/api/dashboard/route.ts
 M app/api/stripe/connect/route.ts
 M lib/payments/ledger.ts
?? supabase/migrations/20260811_operators_stripe_account_livemode.sql
```

---

# 🔴 THE HEADLINE

**✅ ADDITIVITY PROVEN OVER ALL 442 ORDERS: 438 identical, 4 increased, ZERO decreased.**

**✅ Stripe's v2 Account object DOES carry the mode**, so it is read back rather than derived — `livemode: boolean`, non-optional, verified against the installed SDK. The key-derivation fallback exists but is not the mechanism.

🔴 **THE CHANGE IS DEPLOY-COUPLED.** `operators` is read with a **NAMED select on every path** — there is **no `select('*')` on that table anywhere in the repo**. Migration first, then deploy.

⚠️ **TWO THINGS YOU SHOULD READ RATHER THAN SKIM, both at the end:** one order moves to **`refund_due`**, and the database holds **four** test-online rows, not three.

---

## 1. The migration — `operators.stripe_account_livemode`

**`supabase/migrations/20260811_operators_stripe_account_livemode.sql`**

```sql
alter table operators
  add column if not exists stripe_account_livemode boolean;
```

✅ **Nullable, NO default**, as specified. **The name is `stripe_account_livemode`** — it sits beside `stripe_account_id`, `stripe_charges_enabled` and `stripe_account_synced_at`, and it says what it holds rather than what it is for.

### 🔴 The NULL rule, in the migration header and in the column comment

```sql
-- ── 🔴 NULLABLE, NO DEFAULT — AND NULL MUST NEVER BE READ AS "LIVE" ─────────────────────────────────
-- NULL means THERE IS NO CONNECTED ACCOUNT. It does not mean live, it does not mean test, and it does
-- not mean unknown-so-assume-the-common-case. Every read must test `=== false` for arm (b), never
-- `!== true` and never a truthiness check:
--   • `=== false`  → a NULL operator contributes nothing to arm (b), which is correct: with no account
--                    there can be no online rows to admit, so the arm is vacuous for them.
--   • `!== true`   → 🔴 WRONG. It would admit every `livemode: false` online row for every operator that
--                    has never connected Stripe, on the strength of a column that was never set.
```

⚠️ **No default, deliberately:** `false` would classify every operator as holding a test account **including the eleven with no account at all**; `true` would be worse.

---

## 2. Populating it — read back, not inferred

### ✅ FIRST ESTABLISHED: the create response carries the mode

**Verified against the installed SDK** — `node_modules/stripe/cjs/resources/V2/Core/Accounts.d.ts:88-95`:

```ts
export interface Account {
    id: string;
    object: 'v2.core.account';
    …
    /**
     * Has the value `true` if the object exists in live mode or the value `false` if the object exists in test mode.
     */
    livemode: boolean;
```

🔴 **NON-OPTIONAL. So the mode is READ OFF STRIPE'S OWN OBJECT** — the same discipline as the posture read-back three lines below it.

### `app/api/stripe/connect/route.ts`

```ts
      const accountLivemode =
        typeof (account as { livemode?: unknown }).livemode === 'boolean'
          ? (account as { livemode: boolean }).livemode
          : !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
      const { error } = await supabase
        .from('operators')
        .update({
          stripe_account_id: account.id,
          // 🔴 WRITTEN IN THE SAME STATEMENT AS THE ID, DELIBERATELY. An account id without its mode is
          // exactly the state this column exists to end: the id is recorded, the payments arrive, and
          // nothing can classify them. One statement means the pair can never be half-written.
          stripe_account_livemode: accountLivemode,
          stripe_account_synced_at: new Date().toISOString(),
        })
        .eq('id', ctx.operatorId)
```

⚠️ **The key-derived fallback is a shape guard, not the mechanism** — it exists only so a future SDK change cannot silently write NULL, which the consumers read as *"no connected account"*.

### The comment explaining why derivation is legitimate HERE

```ts
      // ⚠️ WHY DERIVING A MODE WOULD BE LEGITIMATE HERE, WHILE IT IS FORBIDDEN FOR A WEBHOOK EVENT.
      // Not a double standard — two different kinds of fact:
      //   AN ACCOUNT'S MODE IS A PROPERTY OF THE KEY THAT CREATED IT. A test key creates a test account
      //   and can create nothing else, and the account cannot later change mode. The key would be a sound
      //   source; the object agreeing with it is confirmation, not coincidence.
      //   AN EVENT'S MODE IS A PROPERTY OF THE EVENT. A production Connect webhook URL receives BOTH live
      //   and test events by design, so neither the endpoint nor the key says anything about a callback
      //   that arrived unbidden — which is why order_payments.livemode and stripe_webhook_events.livemode
      //   are copied verbatim from the event and may never be inferred.
```

✅ **The log line now carries it too:** `[stripe/connect] account created operator=… account=… livemode=false` — so a `livemode=true` on a build that refuses live keys is visible immediately.

---

## 3. The backfill

```sql
update operators
   set stripe_account_livemode = false
 where stripe_account_id is not null
   and stripe_account_livemode is null;
```

🔴 **`false` is not an assumption — it is the only value the code that made those rows could have produced.** `lib/stripe/connect.ts:88` refuses any key not starting `sk_test_`, so a live account cannot exist here.

⚠️ **Scoped to rows that HAVE an account.** Live count: **8 operators, 1 with a `stripe_account_id`** — so the backfill sets exactly one row and leaves seven NULL.

---

## 4. The rule, at both filter sites

### `isLiveRow` — the chokepoint

```ts
export function isLiveRow(row: { livemode?: boolean; channel?: PaymentChannel; account_is_test?: boolean }): boolean {
  // ── ARM (a) — UNCHANGED, AND FIRST. Every row that counted yesterday returns here. ────────────────
  if (row.livemode === true) return true
  // ── ARM (b) — test money, from Stripe, on an account that is itself test. Absent flags fail closed. ─
  return row.account_is_test === true && row.livemode === false && row.channel === 'online'
}
```

🔴 **ARM (a) IS TESTED FIRST, ALONE, AND RETURNS IMMEDIATELY.** Nothing below it is reachable by a `livemode: true` row, so **no row that counts today can stop counting.** The comment above it names the trap explicitly:

```ts
 * ⚠️ THE TEMPTING WRONG SHAPE IS A COMPARISON: `row.livemode === accountIsLive`. It reads as symmetrical
 * and it is a SUBTRACTION — a cash row (`livemode: true`) on a test-account truck would stop counting,
 * and the truck's takings would vanish. If you find yourself writing that, you have inverted the rule.
```

⚠️ **`channel` is in the predicate on purpose:** it confines arm (b) to money Stripe reported, so a bad writer or bad backfill producing a `livemode: false` in-person row would still be excluded rather than admitted by an account-level flag.

### `readLedger` — the SQL side, and the plumbing you asked me to quote

```ts
    .eq('order_key', orderKey)
    .or('livemode.eq.true,and(livemode.eq.false,channel.eq.online)')
```

🔴 **A STRICT SUPERSET.** The first disjunct **is** the old filter, character for character. **The scope filter keeps its own separate line** — the 7 August incident was one filter eating another.

### 🔴 HOW THE OPERATOR'S MODE REACHES IT — IT NEEDS TWO EXTRA READS, AND I AM SAYING SO

`readLedger` is given an `order_key` and nothing else. The mode is **two hops away**: `order_payments.truck_id` → `trucks.operator_id` → `operators.stripe_account_livemode`.

```ts
async function annotateTestAccountRows(supabase: SupabaseClient, rows: LedgerRow[]): Promise<LedgerRow[]> {
  const candidates = rows.filter(r => r.livemode === false && r.channel === 'online')
  if (candidates.length === 0) return rows
  …
  const testOperators = new Set(opRows.filter(o => o.stripe_account_livemode === false).map(o => o.id))
```

⚠️ **NOT AN EMBED, AND THE REASON IS QUOTED IN THE SOURCE:**

```ts
 * PostgREST
 * can embed across a foreign key, but embedding it into the LEDGER SELECT would put a NAMED nested
 * select on the money read — and a named select that cannot resolve is 42703, which fails the WHOLE
 * statement and would take every balance in the product down with it. That is the exact failure class
 * §35 records twice. So the hop is a SEPARATE query, deliberately, and its worst case is that the flag
 * stays unset — which is today's behaviour, not a broken one. Stated rather than worked around.
```

✅ **IT IS LAZY: zero extra queries unless the set actually contains a test-online row.** On **438 of 442 orders** that is no extra work at all — and this function sits on `recalcOrderPayment`, which runs on the hatch on every collect and every undo.

⚠️ **A failed lookup leaves the rows unannotated** ⇒ they do not count ⇒ **under-report, never over-report.**

### `/api/dashboard` — the browser-facing reader

Same widened `.or(…)`, plus the stamp, because **the client cannot look the mode up**:

```ts
        const accountIsTest = stripeAccountLivemode === false
        for (const r of payRows ?? []) {
          const row = (accountIsTest && r.livemode === false && r.channel === 'online')
            ? { ...r, account_is_test: true }
            : r
          ;(payments[r.order_key] ||= []).push(row)
        }
```

⚠️ **`LEDGER_ROW_COLUMNS` gained `truck_id`** so a reader can resolve the mode without a per-row lookup. Selected, never summed — like `external_ref`.

⚠️ **ONE STRUCTURAL MOVE, NAMED:** the route's `operators` read was **hoisted above the orders block**. It is still **one query**; the payments map needs `stripe_account_livemode` and is built earlier than the card-payments control that needed `stripe_charges_enabled`.

---

## 5. What was NOT changed

### `reverseCollectionPayment` — untouched, and it did not need touching

```ts
    .eq('order_key', opts.orderKey)
    .eq('kind', 'charge')
    .neq('channel', 'online')
    .eq('livemode', true)
```

🔴 **IT ALREADY FILTERS `.neq('channel', 'online')`, SO A TEST-ONLINE ROW CAN NEVER BE ITS CANDIDATE.** Its `livemode` filter is therefore not reachable by arm (b) and needs no change. **Confirmed by diff: no added or removed line in `ledger.ts` touches this function.**

### `recalcOrderPayment` — unchanged code, inherited rule

```ts
export async function recalcOrderPayment(supabase: SupabaseClient, orderKey: string): Promise<OrderBalance> {
  const [order, rows] = await Promise.all([readOrder(supabase, orderKey), readLedger(supabase, orderKey)])
  const balance = getOrderBalance(order, rows)

  const { error } = await supabase
    .from('orders')
    .update({ payment_status: balance.status, amount_paid: fromMinor(balance.paidMinor) })
    .eq('order_key', orderKey)
```

**Byte-identical.** It inherits the rule through `readLedger` and `getOrderBalance`, which is the chokepoint design working as intended.

### ✅ FOR A `livemode: true` ROW, BEHAVIOUR IS BYTE-IDENTICAL

| Stage | `livemode: true` row |
|---|---|
| `readLedger` SQL | matched by the **first disjunct**, which is the old filter verbatim |
| `annotateTestAccountRows` | **not a candidate** — returns the same object, not a copy |
| `isLiveRow` | **arm (a) returns `true` on line 1** |
| the arithmetic | untouched — `paid = Σcharges − Σrefunds` |
| `recalcOrderPayment` | same call, same write |
| `reverseCollectionPayment` | same query, same `.eq('livemode', true)` |

### The two admin row-counts — untouched

`git diff --stat` on `app/api/admin/delete-truck/route.ts` and `app/api/admin/execute-account-deletion/route.ts` returns **nothing**.

---

## 🔴 DEPLOY ORDER — ESTABLISHED, NOT ASSUMED

Every `operators` read on every path this change touches:

| Path | How `operators` is read | Tolerant? |
|---|---|---|
| 🔴 `app/api/dashboard/route.ts` | **`.select('stripe_charges_enabled, stripe_account_livemode')` — NAMED** | 🔴 **NO** |
| 🔴 `app/api/stripe/connect/route.ts` | **`.select('id, stripe_account_id, stripe_charges_enabled, stripe_account_synced_at')` — NAMED** | 🔴 **NO** (its `update` also names the column) |
| 🔴 `app/api/stripe/checkout/route.ts` | **`.select('stripe_account_id, stripe_charges_enabled')` — NAMED** | ⚠️ untouched, but named |
| 🔴 `app/api/menu/[truckId]/route.ts` | **`.select('stripe_charges_enabled')` — NAMED** | ⚠️ untouched, but named |
| `lib/payments/ledger.ts` (new) | **`.select('id, stripe_account_livemode')` — NAMED** | 🔴 **NO** |

🔴 **THERE IS NO `select('*')` ON `operators` ANYWHERE IN THE REPO.** Unlike `trucks`, this table has no tolerant reader to fall back on.

### 🔴 VERDICT: DEPLOY-COUPLED. APPLY THE MIGRATION FIRST.

Deploying first ⇒ `42703` on the dashboard's operator read (the card-payments control breaks), on the Connect tab's read and update (**account creation fails after the account exists at Stripe** — the one unrecoverable branch), and on `annotateTestAccountRows` (which logs and degrades to today's behaviour, the only tolerant one of the three).

---

## VERIFICATION — actual numbers

Read-only script importing the **real** `getOrderBalance` and `isLiveRow` (transpiled from the working tree). Every query a `select`. **Script deleted.**

⚠️ **The migration is unrun**, so the script **simulated the backfill exactly as the migration defines it** — `false` where a `stripe_account_id` exists, NULL otherwise — and printed the resolved value per truck so the simulation is auditable:

```
COLUMN operators.stripe_account_livemode EXISTS? -> NO — column does not exist
  operators=8  with a stripe_account_id=1
  pizzeria-gusto  operator=814efb07-… account=null                 -> livemode=null  -> account_is_test=false
  test-truck      operator=d926161e-… account=acct_1U30w22fB4PPCw2D -> livemode=false -> account_is_test=true
  (ten other trucks: account=null -> livemode=null -> account_is_test=false)

  orders=442  order_payments rows=108
  rows with livemode=false AND channel='online' = 4
  rows with livemode=false, other channels      = 0
  rows with livemode=true                        = 104
```

### (a) 🔴 ADDITIVITY — EVERY ORDER IN THE DATABASE

```
  orders evaluated : 442
  IDENTICAL        : 438
  paidMinor UP     : 4
  🔴 paidMinor DOWN: 0   <-- ANY NON-ZERO HERE IS A FAILURE
  status changed   : 4

  ✅ NO ORDER DECREASED. The rule is additive on every row in the database.

  EVERY CHANGED ORDER:
  order_key                            | truck      | total_minor | paid BEFORE -> AFTER | status BEFORE -> AFTER
  9e7905d7-cd26-4e21-947d-e2a09b505061 | test-truck |         650 |     0 ->  650        | unpaid -> paid
  a9f1aa6d-5816-4f6f-aa6e-102a056f2679 | test-truck |         950 |   950 -> 1900        | paid   -> refund_due
  945d30d8-8021-431b-8270-724716d19da8 | test-truck |        1250 |     0 -> 1250        | unpaid -> paid
  74255389-1e07-472d-8ed5-4d2ea35647f3 | test-truck |        1300 |     0 -> 1300        | unpaid -> paid
```

✅ **Zero decreases across 442 orders. Only four change, all on `test-truck`, all upward.**

### (b) pizzeria-gusto — no connected account

```
  operators.stripe_account_id       = null
  simulated stripe_account_livemode = null   (NULL = no connected account)
  -> account_is_test for its rows   = false

  orders=220  ledger rows across them=72
  IDENTICAL before/after = 220   DIFFERENT = 0
  its livemode=true (in-person) rows = 72, channels: ["in_person_other"]
  orders reading 'paid' BEFORE = 72   AFTER = 72
```

✅ **All 220 orders identical. All 72 in-person collections still count. 72 orders read `paid` before and after.** This is the case the additivity criterion exists to protect, and it is untouched.

### (c) test-truck — the test-online rows now count

```
  operators.stripe_account_id       = "acct_1U30w22fB4PPCw2D"
  simulated stripe_account_livemode = false
  -> account_is_test for its rows   = true
  its livemode=false + online rows  = 4

  order_key                            | amount | external_ref                  | OLD   | NEW  | total | paid BEFORE->AFTER | status
  a9f1aa6d-5816-4f6f-aa6e-102a056f2679 |    950 | pi_3U31rB2fB4PPCw2D0j9ji161  | false | true |   950 |  950 -> 1900       | paid -> refund_due
  9e7905d7-cd26-4e21-947d-e2a09b505061 |    650 | pi_3U3GgH2fB4PPCw2D13vzTwn2  | false | true |   650 |    0 ->  650       | unpaid -> paid
  945d30d8-8021-431b-8270-724716d19da8 |   1250 | pi_3U3GBu2fB4PPCw2D0c1r7d6g  | false | true |    0 -> 1250       | unpaid -> paid
  74255389-1e07-472d-8ed5-4d2ea35647f3 |   1300 | pi_3U3GYj2fB4PPCw2D0FMj5XRb  | false | true |  1300 |    0 -> 1300       | unpaid -> paid
```

✅ **`isLiveRow` flips `false → true` for all four. Three orders go `unpaid → paid` at exactly their total.**

### (d) The two admin row-counts

```
  Both are `select(*, {count:"exact", head:true}).eq("truck_id", …)` with NO livemode filter,
  and this change edits neither file. Unchanged BY CONSTRUCTION.
    pizzeria-gusto                   unfiltered row count = 72
    demo-krh2c8ksabdv28ccprswbfhkdk  unfiltered row count = 1
    test-truck                       unfiltered row count = 35
```

✅ **`git diff --stat` on both files returns nothing.** The counts are physical row counts and cannot move.

### tsc / lint

```
$ npx tsc --noEmit -p tsconfig.json   → clean
$ eslint  lib/payments/ledger.ts            → 0 messages
          app/api/stripe/connect/route.ts   → 0 messages
          app/api/dashboard/route.ts        → 17 messages, ALL pre-existing `no-explicit-any`
                                              (L53-54, 204-207, 493-756) — none on a line I added
```

---

## 🔴 TWO THINGS YOU SHOULD READ, NOT SKIM

### 1. One order moves to `refund_due`, and it is not a regression but it IS operator-visible

**`a9f1aa6d-…` goes `paid → refund_due`, paid `950 → 1900` against a `950` total.**

**It already carried BOTH a `livemode: true` in-person collection of £9.50 AND the test-mode Stripe payment of £9.50.** Someone marked it paid at the hatch and it was also paid by test card. Admitting the second row doubles the recorded payment.

✅ **`paidMinor` went UP, so it passes the stated criterion — no balance decreased.** 🔴 **But `refund_due` is a real state that renders on the order card and it will look like a fault.** It is not: it is an accurate report of two payment rows against one order, and it was **latent before this change** — arm (a) was simply hiding one of them. **Named here rather than buried in a count.**

### 2. There are FOUR test-online rows, not three

The brief said *"the three existing online rows"*. **The database holds four**, all on `test-truck`, all with distinct PaymentIntent ids. **Three produce `unpaid → paid`; the fourth is the double-payment above.** Reported because a count that disagrees with the brief is exactly the kind of thing that should not be quietly reconciled.

---

## NON-ASCII CENSUS

| File | Before | After | Δ | Per-character |
|---|---|---|---|---|
| `lib/payments/ledger.ts` | **D=12 T=769** | **D=12 T=1067** | **+298** | `§`+2, `—`+24, `─`+254, `⚠`+6, `🔴`+6, U+FE0F+6 |
| `app/api/dashboard/route.ts` | **D=9 T=490** | **D=9 T=558** | **+68** | `—`+9, `⇒`+1, `─`+40, `⚠`+7, `🔴`+4, U+FE0F+7 |
| `app/api/stripe/connect/route.ts` | **D=8 T=295** | **D=8 T=318** | **+23** | `—`+4, `─`+14, `⚠`+1, `🔴`+3, U+FE0F+1 |
| 🆕 migration `.sql` | — | new file | — | `─`, `—`, `⚠`, `🔴`, `✅`, `•`, `→`, U+FE0F |

```
DISTINCT: 12 → 12 · 9 → 9 · 8 → 8
characters that DROPPED          : 0
NEW character classes introduced : 0
```

### 🔴 ONE VIOLATION, CAUGHT BY THE CENSUS AND CORRECTED

**My first draft of `lib/payments/ledger.ts` used `…` (U+2026) in a comment, taking DISTINCT from 12 to 13.** That file did not contain an ellipsis. The census caught it; the phrase was rewritten to `.eq('order_key', orderKey)` and DISTINCT returned to 12. **Reported rather than quietly fixed — this is the second run in a row the check has earned its place.**

✅ **Every `⚠` delta matches its U+FE0F delta exactly** (+6/+6, +7/+7, +1/+1).
✅ **No `✅` was added to any of the three edited files** — none of them contained it. It appears only in the new migration, which has no prior set to violate.
✅ **Garble scan:** zero U+FFFD; no `Â` / `â€` / `Ã©` / `ðŸ` mojibake in any of the four.

---

## WHAT WAS NOT TOUCHED — verified, not asserted

| Instruction | Result |
|---|---|
| **Do not touch the two admin row-counts** | ✅ `git diff --stat` on both returns **nothing** |
| **Do not change `reverseCollectionPayment` beyond what the rule requires** | ✅ **Zero diff lines touch it.** Its `.neq('channel','online')` already excludes arm (b) entirely |
| **Do not change `recalcOrderPayment`'s semantics** | ✅ **Byte-identical code**; it inherits the rule through the chokepoint |
| **Additive only** | ✅ **Proven: 0 of 442 orders decreased** |
| **Nothing else** | ✅ Three files plus one new migration |
