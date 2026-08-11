# `readLedger` consumers, the hoisted operators read, and the `.or()` grammar

**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. No fix proposed or applied.**

⚠️ **ONE MINOR DISCREPANCY IN THE PROMPT, FLAGGED AND NOT ACTED ON:** it opens *"two questions"* and then lists **three**. No instruction contradicts another and the three are unambiguous, so all three are answered. Nothing was skipped or merged.

---

# 🔴 THE THREE ANSWERS

1. ✅ **`readLedger` HAS EXACTLY TWO CALL SITES, BOTH IN ITS OWN FILE, AND BOTH FUNNEL.** The function is **not exported** — it is module-private to `lib/payments/ledger.ts`. Both call sites pass `rows` **straight into `getOrderBalance` on the very next line and never touch the array again.** Nothing sums, counts, filters or tests a row outside the chokepoint.
2. ✅ **THE ORDERS BLOCK IS UNAFFECTED BY AN OPERATORS FAILURE.** The read logs and falls through — **no throw, no early return, no `if` guarding the orders block on it.** Orders still return.
3. ✅ **THE `.or()` IS A STRICT SUPERSET.** Its first disjunct is character-identical to the old `.eq()`, and its second requires `livemode.eq.false`, which a `livemode: true` row can never satisfy.

---

## 1. Every call site of `readLedger`

**Source: QUOTED.** A repo-wide grep for `readLedger` across `lib/`, `app/` and `components/` returns nine hits: **six are comments**, one is the declaration, and **two are calls**.

### 🔴 IT IS NOT EXPORTED — the blast radius is one file

```
lib/payments/ledger.ts:308:async function readLedger(supabase: SupabaseClient, orderKey: string): Promise<LedgerRow[]>
```

```
$ grep -n "export.*readLedger" lib/payments/ledger.ts
  NOT EXPORTED — module-private
```

🔴 **`async function`, not `export async function`. No other file can call it, so the widened SQL cannot reach a consumer outside `lib/payments/ledger.ts`** — and inside that file there are two.

### Call site 1 — `recalcOrderPayment`, line 454

```ts
export async function recalcOrderPayment(supabase: SupabaseClient, orderKey: string): Promise<OrderBalance> {
  const [order, rows] = await Promise.all([readOrder(supabase, orderKey), readLedger(supabase, orderKey)])
  const balance = getOrderBalance(order, rows)

  const { error } = await supabase
    .from('orders')
    .update({ payment_status: balance.status, amount_paid: fromMinor(balance.paidMinor) })
    .eq('order_key', orderKey)
```

| | |
|---|---|
| **How the rows are used** | passed to `getOrderBalance(order, rows)` on the **next line**, and nowhere else |
| **Passes through `isLiveRow` / `getOrderBalance`?** | ✅ **YES — `getOrderBalance`, which calls `isLiveRow` on every row** |
| **Anything sums, counts or tests them directly?** | 🔴 **NO.** What is written to `orders` is `balance.status` and `balance.paidMinor` — **derived values, not the rows** |

### Call site 2 — `recordCollectionPayment`, line 569

```ts
export async function recordCollectionPayment(
  supabase: SupabaseClient,
  opts: { orderKey: string; truckId: string; createdBy?: string | null; method?: PaymentMethod | null },
): Promise<{ inserted: boolean; balance: OrderBalance; chargedMinor: number }> {
  const [order, rows] = await Promise.all([readOrder(supabase, opts.orderKey), readLedger(supabase, opts.orderKey)])
  const before = getOrderBalance(order, rows)

  // Nothing outstanding (already settled, or a replay whose row is present): recalc so the cache is
  // correct and return without inserting a zero/negative row the CHECK would reject anyway.
  if (before.balanceMinor <= 0) {
    const balance = await recalcOrderPayment(supabase, opts.orderKey)
    return { inserted: false, balance, chargedMinor: 0 }
  }

  const { inserted, balance } = await recordPaymentEvent(supabase, {
    …
    amountMinor: before.balanceMinor,
    …
    idempotencyKey: collectIdempotencyKey(opts.orderKey, before.paidMinor, before.balanceMinor),
```

| | |
|---|---|
| **How the rows are used** | passed to `getOrderBalance(order, rows)` on the **next line**, and nowhere else |
| **Passes through `isLiveRow` / `getOrderBalance`?** | ✅ **YES** |
| **Anything sums, counts or tests them directly?** | 🔴 **NO.** Everything downstream reads `before.balanceMinor` and `before.paidMinor` — **derived values.** The idempotency key is built from those two numbers, not from a row |

### 🔴 PROVEN BY SEARCH, NOT BY READING

The `rows` identifier appears **exactly twice in each function** — the destructure and the `getOrderBalance` call:

```
$ awk 'NR>=453 && NR<=475' lib/payments/ledger.ts | grep -n "rows"
2:  const [order, rows] = await Promise.all([readOrder(...), readLedger(...)])
3:  const balance = getOrderBalance(order, rows)

$ awk 'NR>=569 && NR<=645' lib/payments/ledger.ts | grep -n "\brows\b"
1:  const [order, rows] = await Promise.all([readOrder(...), readLedger(...)])
2:  const before = getOrderBalance(order, rows)
```

**And every `getOrderBalance` call in the file:**

```
192:export function getOrderBalance(order: BalanceableOrder, ledgerRows: LedgerRow[]): OrderBalance {   ← the definition
269:  return getOrderBalance(order, ledgerRows).balanceMinor > 0                                        ← hasUnrecordedPayment
455:  const balance = getOrderBalance(order, rows)                                                      ← call site 1
570:  const before = getOrderBalance(order, rows)                                                       ← call site 2
```

⚠️ **Line 269 (`hasUnrecordedPayment`) does NOT call `readLedger`** — it takes `ledgerRows` as a parameter from its caller, and it too funnels through `getOrderBalance`.

### ✅ SO: EVERY CONSUMER FUNNELS. SAYING IT EXPLICITLY, AS ASKED.

🔴 **Every consumer of `readLedger`'s output — both of them — funnels through `getOrderBalance`, which applies `isLiveRow` to every row before any arithmetic. Nothing sums, counts, filters, inspects or tests a returned row outside the chokepoint.**

**The widened SQL therefore cannot expose test money to anything**, because:

| Layer | What it does with a `livemode: false` row |
|---|---|
| `readLedger` SQL | **fetches it** if it is `channel = 'online'` — this is the change |
| `annotateTestAccountRows` | stamps `account_is_test: true` **only** if the truck's operator's account is itself test |
| `getOrderBalance` → `isLiveRow` | 🔴 **DISCARDS it unless BOTH the stamp and the channel hold.** Arm (a) is unreachable by a `livemode: false` row |
| the two call sites | never see the array again |

⚠️ **`getOrderBalance`'s own filter line is unchanged** — `const succeeded = (ledgerRows ?? []).filter(r => isLiveRow(r) && r.state === 'succeeded')`. The widening happened inside `isLiveRow`, not around it.

### ⚠️ ONE CONSUMER OUTSIDE THIS CHAIN, NAMED FOR COMPLETENESS

**`/api/dashboard`'s payments map is a SEPARATE reader** — it does not call `readLedger` (it cannot; the function is private) but it runs the **same widened `.or()`** and ships rows to a browser. **Those rows are fed to `getOrderBalance` client-side** by `OrderCard`, the KDS and `mapOrderToTicket`, so they funnel too — **but they are raw rows on a device before that happens.** That is a visibility change, not an arithmetic one, and it is the one place a future reader could pick a row up for a purpose other than summing.

⚠️ **`reverseCollectionPayment` is the third reader of `order_payments` and was NOT widened** — it keeps `.eq('livemode', true)` and additionally `.neq('channel', 'online')`, so it is doubly out of reach of the new rows.

---

## 2. The hoisted operators read, and what happens to the orders block

**Source: QUOTED.** `app/api/dashboard/route.ts:202-249`, the new ordering in full:

```ts
  // Orders are strictly event-scoped (no event_date+van_id fallback): with no
  // selected event there is nothing to show (Section 5 — empty dashboard).
  let activeOrders: any[] = []
  let doneToday: any[] = []
  /** order_key → its order_payments rows. Fed straight into getOrderBalance client-side. */
  const payments: Record<string, any[]> = {}
  /** order_keys whose money write is on record as having FAILED. …  */
  const paymentFailures = new Set<string>()

  // ── 🔴 THE OPERATOR'S STRIPE FACTS — ONE READ, TWO CONSUMERS, HOISTED TO HERE ────────────────────
  …
  const operatorStripe: { chargesEnabled: boolean; accountLivemode: boolean | null } =
    { chargesEnabled: false, accountLivemode: null }
  if (truck.operator_id) {
    const { data: op, error: opErr } = await supabase
      .from('operators')
      .select('stripe_charges_enabled, stripe_account_livemode')
      .eq('id', truck.operator_id)
      .maybeSingle()
    if (opErr) {
      console.error('[dashboard] operator stripe lookup failed — card control hidden, test rows stay excluded:', opErr.message)
    }
    operatorStripe.chargesEnabled = op?.stripe_charges_enabled === true
    operatorStripe.accountLivemode =
      typeof op?.stripe_account_livemode === 'boolean' ? op.stripe_account_livemode : null
  }
  const stripeAccountLivemode = operatorStripe.accountLivemode

  if (selectedEventId) {
    let activeOrdersQuery = supabase
      .from('orders')
      .select('*')
      .eq('truck_id', truck.id)
      .eq('event_id', selectedEventId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: true })
```

**The ordering, stated plainly:**

```
  line 204-210   activeOrders / doneToday / payments / paymentFailures declared
  line 229-243   THE OPERATORS READ            ← hoisted to here
  line 244       const stripeAccountLivemode = operatorStripe.accountLivemode
  line 246       if (selectedEventId) {        ← THE ORDERS BLOCK STARTS HERE
```

### 🔴 THE FAILURE PATH, QUOTED — CAN THE ROUTE STILL RETURN ORDERS?

✅ **YES. Unconditionally.**

| Failure | What the code does | Orders returned? |
|---|---|---|
| 🔴 **`opErr` set (42703, RLS, network)** | `console.error(…)` — **and nothing else.** No `throw`, no `return`, no re-raise | ✅ **YES** |
| **`op` is `null`** (no row) | `op?.…` optional chains → `chargesEnabled = false`, `accountLivemode = null` | ✅ **YES** |
| **`truck.operator_id` is null** | the whole `if` block is skipped; the initialiser stands | ✅ **YES** |
| **The column does not exist** | 42703 ⇒ `opErr` set ⇒ the row above | ✅ **YES** |

**The three lines that decide it:**

```ts
    if (opErr) {
      console.error('[dashboard] operator stripe lookup failed — card control hidden, test rows stay excluded:', opErr.message)
    }
```

🔴 **THAT `if` BLOCK CONTAINS ONE STATEMENT AND IT IS A LOG. There is no `return NextResponse.json(...)` and no `throw` anywhere between the operators read and `if (selectedEventId)`.** The orders block at line 246 is guarded on `selectedEventId` **and on nothing else** — it does not test `op`, `opErr`, `operatorStripe` or `stripeAccountLivemode`.

⚠️ **`.maybeSingle()`, not `.single()`** — deliberately. `.single()` raises `PGRST116` on zero rows, which would turn "this truck has no operator row" into an error. `.maybeSingle()` returns `{ data: null, error: null }`.

⚠️ **supabase-js returns `{ data, error }` rather than rejecting on a query error**, so a 42703 lands in `opErr` and is *caught by the `if`*, not by an absent try/catch.

### 🔴 WHY THIS IS NOT THE 42703 THAT EMPTIED THE BOARD

**That incident, recorded in this same file at lines ~181-190, was a NAMED SELECT ON `truck_events` whose error was DROPPED, and whose result `todayEvents` every `selectedEventId` branch requires non-null.** The chain was: 42703 → `todayEvents` null → `selectedEventId` never resolved → the orders block never ran → **HTTP 200 with `orders: []`**.

**The new read is different in all three respects:**

| | The 42703 incident | The hoisted operators read |
|---|---|---|
| **Error handling** | 🔴 **dropped** | ✅ **captured and logged** with a consequence clause |
| **Does the orders block depend on its result?** | 🔴 **YES** — via `selectedEventId` | 🔴 **NO** — nothing downstream tests it |
| **Failure outcome** | 🔴 **empty board, silently** | ✅ **orders render; the card-payments control hides and test rows stay excluded** |

⚠️ **BUT ONE THING IS WORTH SAYING PLAINLY:** if the migration is not applied, this read 42703s on **every dashboard load**, logs on every load, and the card-payments control silently disappears for every truck. **Orders are safe; a feature is not.** That is the deploy-coupling already recorded, seen from the failure side.

⚠️ **AND THE OTHER TWO NAMED READS ARE NOT AS FORGIVING** — `app/api/stripe/connect/route.ts` names the column in both a `select` and an `update`, and its create-and-persist branch is the one that logs *"ACCOUNT CREATED BUT NOT PERSISTED"*. **Migration first.**

---

## 3. The `.or()` string and PostgREST's grammar

**Source: QUOTED.** The identical string appears in **two** places:

```
lib/payments/ledger.ts:337        .or('livemode.eq.true,and(livemode.eq.false,channel.eq.online)')
app/api/dashboard/route.ts:304    .or('livemode.eq.true,and(livemode.eq.false,channel.eq.online)')
```

### What it matches, from the grammar

PostgREST's `or=(a,b)` is a **disjunction of its comma-separated members**; a member may itself be `and(x,y)`, a nested **conjunction**. Top-level filters on the same request combine with **AND**. So `readLedger`'s two lines —

```ts
    .eq('order_key', orderKey)
    .or('livemode.eq.true,and(livemode.eq.false,channel.eq.online)')
```

— produce:

```sql
order_key = $1
AND ( livemode = true
      OR (livemode = false AND channel = 'online') )
```

**Against the old query:**

```sql
order_key = $1 AND livemode = true
```

### 🔴 THE TWO CONFIRMATIONS, PROVED FROM THE GRAMMAR

**(i) It cannot MATCH a `livemode: true` row the old `.eq()` would have EXCLUDED.**

A `livemode: true` row can enter the new predicate by exactly two routes:
- **Disjunct 1**, `livemode = true` — **character-identical to the old filter.** Any row it admits, the old query admitted.
- **Disjunct 2**, `livemode = false AND channel = 'online'` — 🔴 **unreachable for a `livemode: true` row**, because `true = false` is `false`.

**And the scope term `order_key = $1` is unchanged and still ANDed at the top level**, so the truncation the 7 August incident produced cannot recur here: the `.or()` is a *second* top-level condition, not a replacement for the first.

✅ **CONFIRMED: no `livemode: true` row enters by any route the old query did not already allow.**

**(ii) It cannot EXCLUDE a `livemode: true` row the old `.eq()` would have INCLUDED.**

Take any row the old query returned: `order_key = $1` **and** `livemode = true`. Under the new predicate the scope term is unchanged and satisfied, and disjunct 1 is `livemode = true`, which the row satisfies. A disjunction is true if **any** member is true, so the row matches.

✅ **CONFIRMED: the new predicate is a STRICT SUPERSET of the old one.** Formally, `A ∧ B` implies `A ∧ (B ∨ C)` for any `C`, and here `B` is the old filter verbatim.

### The rows the widening newly admits — exactly one class

| `livemode` | `channel` | Old | New |
|---|---|---|---|
| `true` | any | ✅ matched | ✅ matched — **disjunct 1, unchanged** |
| `false` | `'online'` | 🔴 excluded | ✅ **matched — the ONLY new class** |
| `false` | `'in_person_stripe'` | 🔴 excluded | 🔴 **still excluded** |
| `false` | `'in_person_other'` | 🔴 excluded | 🔴 **still excluded** |

### ⚠️ NULL, checked rather than assumed away

**`order_payments.livemode` is `not null default true`** — `20260807_order_payments_livemode.sql:99`:

```sql
alter table order_payments add column if not exists livemode boolean not null default true;
```

🔴 **So a NULL cannot exist.** Even if one could, SQL three-valued logic makes both `livemode = true` and `livemode = false` evaluate to NULL for it, so **both disjuncts fail and the row is excluded — identically to the old query.** The widening has no NULL edge.

⚠️ **`channel` is likewise `not null` with a CHECK** — `20260729_order_payments_ledger.sql:62,79`:

```sql
  channel         text        not null,
  constraint order_payments_channel_chk check (channel in ('online', 'in_person_stripe', 'in_person_other')),
```

**So `channel.eq.online` is a total, three-valued-safe test.**

⚠️ **FETCHING IS NOT COUNTING.** Even for the one newly-admitted class, `isLiveRow` additionally requires `account_is_test === true`, which only `annotateTestAccountRows` (server) or `/api/dashboard` (before shipping) can set, and only from `operators.stripe_account_livemode === false`. **The SQL cannot admit a row to a balance on its own.**

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — both call sites in full, the non-export, and two **exhaustive negative searches** (`rows` occurrences per function; every `getOrderBalance` call in the file) |
| 2 | **QUOTED** — the new ordering verbatim, the error branch, and the guard on the orders block. The contrast with the 42703 incident is **INFERRED** from the quoted code plus the incident note already in that file |
| 3 | **QUOTED** — both `.or()` strings and both column definitions. The superset proof is **INFERRED**, but from the quoted predicate by Boolean algebra rather than by inspection |

## Not established

- **Whether PostgREST's `or=` nesting behaves as documented on the deployed version.** The grammar is standard and the string is the documented `and(...)`-inside-`or=(...)` form, but I did not execute the query against the live database in this pass — the previous pass exercised the *resulting rows* through `getOrderBalance`, not the SQL itself.
- **Whether any future reader of `/api/dashboard`'s `payments` map would use a row for something other than summing.** Today all three consumers funnel through `getOrderBalance`; that is a property of today's code, not a guarantee.
