# The stale sandbox account id on Test Kitchen — what it breaks and what clearing it does

Date: 13 August 2026
Status: READ-ONLY DIAGNOSIS. **No file was changed. No row was changed. No SQL was run.** This report is
the only file created. No `next dev`, no `next build`, no commit, no deploy.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 0. 🔴 THE THING TO READ FIRST — THIS IS NOT ONLY A GREYED BUTTON

While the Payments tab shows an error, **Test Kitchen is still offering customers a card that cannot
possibly work.** The customer-facing gate does not read `stripe_account_id` at all:

**QUOTED**, `lib/payments/online-payments-switch.ts:44-52`:

```ts
offered: operator?.stripe_charges_enabled === true && pausedAt === null,
```

**Live values, read just now:** `stripe_charges_enabled = true`, `trucks.online_payments_paused_at = null`
→ **`offered = true`**. So `/api/menu` reports `cardPaymentsReady: true`, the order page renders the card
option, and `authorizeDraft` then calls `paymentIntents.create(..., { stripeAccount: 'acct_1U30w22fB4PPCw2D' })`
with the live key — which is the exact call that produced your error.

🔴 **A customer choosing "pay by card" on Test Kitchen right now gets a failure at the moment of payment.**
Clearing `stripe_account_id` alone would **not** fix that; `stripe_charges_enabled` is the column that
governs it. Both are in section 5.

And one more, in the opposite direction:

🔴 **DO NOT CLEAR `stripe_account_livemode`.** It is the only reason Test Kitchen's 18 historical online
rows — **£164.50 charged, £6.00 refunded, £158.50 net** — still count as money. Nulling it silently
removes them from every total. Section 7.

---

## 1. WHAT THE STATUS ROUTE DOES WITH AN UNREACHABLE ID — QUOTED

**QUOTED**, `app/api/stripe/connect/route.ts:179-200`:

```ts
if (action === 'status') {
  if (!operator?.stripe_account_id) {
    return NextResponse.json({
      accountId: null, chargesEnabled: false, syncedAt: null,
      detailsSubmitted: false, cardPaymentsStatus: null,
      viewer: ctx.viewer,
      livemode: platformKeyLivemode(),
    })
  }
  …
  const { chargesEnabled, detailsSubmitted, cardPaymentsStatus } =
    await readAccountReadiness(operator.stripe_account_id)
```

and the outer catch, `:398-404`:

```ts
} catch (err) {
  const message = err instanceof Error ? err.message : 'Stripe request failed'
  console.error(`[stripe/connect] action=${action} operator=${ctx.operatorId} FAILED:`, message)
  return NextResponse.json({ error: message }, { status: 500 })
}
```

### Why it becomes `configError` rather than "not connected" — INFERRED from the above

🔴 **The only test is the PRESENCE of the id, never its RESOLVABILITY.** `:180` asks "is the column
null?", the column is not null, so control falls straight through to a Stripe call that cannot succeed.
The chain from there:

1. `readAccountReadiness('acct_1U30w22fB4PPCw2D')` throws Stripe's
   *"The provided key sk_live_… does not have access to account acct_1U30w22fB4PPCw2D"*.
2. The outer catch turns it into **500**, carrying Stripe's own message verbatim.
3. Client `post()` throws with `err.status = 500`. Not 403, so it falls to the `else`:
   `setFetchError(message)`.
4. `configError = fetchError` → the amber card, headline **"We couldn't check this truck's Stripe
   account"** (the reachability copy from the three-way split), body = Stripe's sentence.
5. `status` never resolves, so it stays `null` → `derivePaymentsState({ accountId: null, … })` →
   **`not_connected`** → the Connect button **renders** but
   `disabled={creating || !!configError || keyModeMismatch}` is true.

**Hence exactly what you see: the "not connected" card, with a greyed button, under a reachability
error.** The state machine already agrees with you that nothing is connected — it is only `configError`
that disables the button.

---

## 2. 🔴 THE FOURTH CASE — SHOULD THE APP HANDLE IT? RECOMMENDATION

**Yes — but not the way it first appears, and the discriminator matters more than the handling.**

### The naive version is dangerous

"Stripe returned an error reading the account ⇒ treat as not connected" would fire on a **transient
Stripe outage, a rate-limit, a network blip or a temporary permissions problem**. On a *live* account
that would present a working truck with a Connect button — and pressing it would… well, see below. The
failure mode of guessing wrong here is losing sight of a real account holding real money, which is far
worse than a greyed button.

### The safe discriminator already exists and needs no Stripe call

We store the account's mode at creation, read back off Stripe's own object:
`operators.stripe_account_livemode`. For Test Kitchen it is **`false`**, and `platformKeyLivemode()` is
**`true`**. That disagreement is **deterministic, local, and cannot be produced by an outage** — and
`describeAccountModeMismatch` (`lib/stripe/connect.ts:141`) already computes exactly it, returning:

> *"platform key is LIVE but the connected account is recorded as TEST — Stripe will answer as though the
> account does not exist, which looks like a permissions failure and is not one"*

**Recommendation: key the new state on the stored mode disagreement, not on the shape of a Stripe
error.** A fifth `PaymentsState` — call it `stranded` — meaning *an account is recorded, and it belongs
to the other mode*. It would render its own card ("This truck's Stripe account was created in test mode
and can't be used now that payments are live"), and it should **not** be blocked by `configError`,
because the mode is knowable without reaching Stripe at all.

### 🔴 But ungreying the button alone would not work, and this is the part to know before building

**QUOTED**, `route.ts:248-249`:

```ts
if (operator?.stripe_account_id) {
  return NextResponse.json({ accountId: operator.stripe_account_id, alreadyExisted: true })
}
```

`create_account` is **idempotent by read**. With the stale id present, pressing Connect returns
`alreadyExisted: true` and creates nothing — the tab would flip to "connected", re-read, and fail again.
So a complete fix needs the create path to know the id is dead too.

### ⚠️ And it must never clear the column by itself

Auto-clearing on a mode disagreement is tempting and I would not do it. `stripe_account_id` is the only
pointer to an account that may hold captured money and open authorisations; the webhook matches
`account.updated` on it (`webhooks/stripe/route.ts:346`), and refunds correlate through it. **A column
that can erase itself on a heuristic is a column that will one day erase the wrong one.** Clearing should
stay a deliberate act — which is what section 5 is.

**So: build the detection and the honest card; leave the clearing manual.** That is a contained change to
`payments-state.ts`, `PaymentsTab.tsx` and the `create_account` guard, and it is not built here.

---

## 3. WHAT CLEARING `stripe_account_id` WOULD DO — EVERY CONSUMER

`grep -rn "stripe_account_id"` across `app`, `lib`, `components`, `scripts`. **QUOTED**, every site:

| Surface | Site | Reads it how | Effect of NULL |
|---|---|---|---|
| **Payments tab — `status`** | `route.ts:180` | `if (!operator?.stripe_account_id)` | 🔴 **Takes the early return.** No Stripe call, no error, `accountId: null` → state `not_connected`, `configError` null → **the Connect button becomes available.** This is the fix you want. |
| **Payments tab — `requirements`** | `route.ts:230` | same guard | Returns `{ connected: false, actionRequired: false }`. The "Action needed" badge stops. |
| **Payments tab — `create_account`** | `route.ts:248` | `if (operator?.stripe_account_id) return alreadyExisted` | 🔴 **The idempotency guard stops matching**, so pressing Connect creates a **new, LIVE** account. That is the intent — and it is irreversible. |
| **Payments tab — `account_session`** | `route.ts:390` | `if (!operator?.stripe_account_id)` | Returns 409 `No connected account yet` instead of throwing. Connect.js does not mount. |
| **Customer card gate** | `online-payments-switch.ts:50` | 🔴 **does not read it at all** | **NO CHANGE.** Still `offered` while `stripe_charges_enabled` is true. See section 0. |
| **`/api/menu`** | `menu/[truckId]/route.ts:679` | via `resolveOnlineCardPayments` | **NO CHANGE**, for the same reason. |
| **`authorizeDraft`** | `authorize.ts:99, 159` | `if (!operator?.stripe_account_id \|\| !cards.offered)` | ✅ **Returns `not_ready`** instead of attempting a doomed intent — a genuine improvement, and the only place clearing the id helps a customer. |
| **`stripeAccountForTruck`** | `authorize.ts:260` | `return operator?.stripe_account_id ?? null` | Returns `null` → **capture, refund, promotion, the submit route's cancel and the stale-authorisation sweep** all see "no account". |
| **`account.updated` webhook** | `webhooks/stripe/route.ts:346` | `.eq('stripe_account_id', accountId)` | Matches zero rows → logs `NO OPERATOR` and marks `no_operator`. Harmless: no sandbox events can arrive under a live endpoint anyway. |
| **`scripts/register-payment-domain.cjs --all`** | `:79` | `.not('stripe_account_id','is',null)` | The operator drops out of the `--all` list. Correct. |
| **`scripts/list-stranded-authorisations.cjs`** | `:139-140` | reads it to cancel a hold | Would report the account as null for any stranded draft. **See the caveat below.** |
| **The ledger (`isLiveRow`, `getOrderBalance`, `annotateTestAccountRows`)** | — | 🔴 **never reads `stripe_account_id`** | **NO CHANGE.** Section 7. |
| **Reports, dashboard, KDS, tickets** | — | read the ledger, not this column | **NO CHANGE.** |

### ⚠️ The one thing to check before clearing

`order_drafts` for Test Kitchen: **13 rows carry a `payment_intent_id`, and 0 of them are unpromoted.**
So there is **no open authorisation** that would be orphaned by losing the account id. Had any been
unpromoted, clearing would have left a hold that neither the sweep nor
`list-stranded-authorisations.cjs` could cancel — but they are all promoted, and in any case they are
sandbox holds that the live key cannot touch either way.

---

## 4. OTHER STALE COLUMNS — LIVE VALUES FOR TEST KITCHEN'S OPERATOR

**QUOTED from the database**, operator `d926161e-33b9-4031-b2a6-21253418538f` (`dbonini82@gmail.com`,
owner of `test-kitchen`, truck id `test-truck`):

| Column | Live value | Stale? | Verdict |
|---|---|---|---|
| `stripe_account_id` | `acct_1U30w22fB4PPCw2D` | 🔴 **yes** — a sandbox account unreachable by the live key | **CLEAR** |
| `stripe_charges_enabled` | 🔴 **`true`** | 🔴 **yes, and this is the dangerous one** — it is the customer-facing money gate, and it is still saying "offer a card" | **CLEAR to `false`** |
| `stripe_account_livemode` | `false` | **No — it is CORRECT.** The account genuinely was test-mode | 🔴 **LEAVE. Clearing it breaks £158.50 of history — section 7** |
| `stripe_account_synced_at` | `2026-08-13T13:23:35.084+00:00` | cosmetic | optional; it is written by three sites and **read for no decision anywhere** (`grep` confirms: selected at `route.ts:171`, never branched on) |
| `trucks.online_payments_paused_at` | `null` | not stale, but it is the **other half** of `offered` | leave — clearing `stripe_charges_enabled` is the correct lever |

---

## 5. THE SQL — ONE QUERY PER BLOCK, NOT RUN

⚠️ Read section 7 before running the second one, and do **not** add `stripe_account_livemode` to either.

**Query 1 — the fix for the customer-facing defect. I would run this one first.**

```sql
-- Stops Test Kitchen offering a card that cannot work. `resolveOnlineCardPayments` requires
-- stripe_charges_enabled === true, so this immediately makes /api/menu report cardPaymentsReady:false
-- and the order page fall back to Pay-at-Hatch. Nothing else keys on it.
UPDATE operators
SET stripe_charges_enabled = false
WHERE id = 'd926161e-33b9-4031-b2a6-21253418538f';
```

**Query 2 — clears the stale account id, which is what ungreys the Connect button.**

```sql
-- Makes the status route take its no-account early return (route.ts:180): no Stripe call, no error,
-- state `not_connected`, Connect available. It ALSO disarms create_account's idempotency guard
-- (route.ts:248), so the next press creates a NEW, LIVE, UNDELETABLE account. Intended — but that is
-- the point of no return described in docs/connect-gate-report.md §5.
UPDATE operators
SET stripe_account_id = NULL
WHERE id = 'd926161e-33b9-4031-b2a6-21253418538f';
```

**Query 3 — optional, cosmetic only.**

```sql
-- The readiness timestamp now refers to a reconcile that can never succeed again. It is written by
-- three sites and read for no decision anywhere, so this is tidiness, not correctness.
UPDATE operators
SET stripe_account_synced_at = NULL
WHERE id = 'd926161e-33b9-4031-b2a6-21253418538f';
```

**Query 4 — read this back afterwards to confirm the shape.**

```sql
-- Expect: account_id NULL, charges_enabled false, livemode STILL false (that one must survive).
SELECT id, email, stripe_account_id, stripe_charges_enabled, stripe_account_livemode, stripe_account_synced_at
FROM operators
WHERE id = 'd926161e-33b9-4031-b2a6-21253418538f';
```

🔴 **The query that must NOT be written**, stated so it is not written by accident:

```sql
-- ☠️ DO NOT RUN. Nulling this un-counts every one of Test Kitchen's 18 sandbox online rows —
-- £158.50 net vanishes from Reports, the dashboard and every order balance. See section 7.
-- UPDATE operators SET stripe_account_livemode = NULL WHERE id = 'd926161e-…';
```

---

## 6. IS ANY OTHER OPERATOR AFFECTED? — NO. READ LIVE

**QUOTED**, all eight operator rows:

| Operator | `stripe_account_id` | `charges_enabled` | `account_livemode` |
|---|---|---|---|
| **dbonini82@gmail.com** | 🔴 **`acct_1U30w22fB4PPCw2D`** | 🔴 **`true`** | `false` |
| contact@pizzeriagusto.co.uk | `null` | `false` | `null` |
| dominicbonini@hotmail.com | `null` | `false` | `null` |
| hello@villagefoodie.co.uk | `null` | `false` | `null` |
| hello1@villagefoodie.co.uk | `null` | `false` | `null` |
| realthaifood@villagefoodie.co.uk | `null` | `false` | `null` |
| testtruck@villagefoodie.co.uk | `null` | `false` | `null` |
| tt4@villagefoodie.co.uk | `null` | `false` | `null` |

**Exactly one operator carries any Stripe state at all, and it is Test Kitchen's.** Every other truck is
cleanly unconnected — which is also why no other truck shows this error, and why the fourth case in
section 2 has exactly one instance today.

---

## 7. ⚠️ THE HISTORICAL ROWS — CONFIRMED SAFE, WITH ONE CONDITION

**Test Kitchen's `order_payments`, read live: 57 rows.**

| Shape | Count |
|---|---|
| `charge` / `in_person_other` / `livemode=true` | 39 |
| `charge` / `online` / `livemode=false` | 17 |
| `refund` / `online` / `livemode=false` | 1 |

Succeeded online totals: **charges £164.50, refunds £6.00, net £158.50.**

### Clearing `stripe_account_id` does not affect how any of them read — QUOTED

**The ledger never reads that column.** `isLiveRow` (`lib/payments/ledger.ts:161-166`):

```ts
export function isLiveRow(row: { livemode?: boolean; channel?: PaymentChannel; account_is_test?: boolean }): boolean {
  if (row.livemode === true) return true
  return row.account_is_test === true && row.livemode === false && row.channel === 'online'
}
```

- The **39 in-person rows** carry `livemode: true` and return on **arm (a)**, first line. Nothing about
  the operator row is consulted at all.
- The **18 online rows** carry `livemode: false` and go to **arm (b)**, which needs `account_is_test`.
  That flag is produced by `annotateTestAccountRows` (`ledger.ts:411, 445, 453`), which walks
  `order_payments.truck_id → trucks.operator_id → operators.stripe_account_livemode` and tests
  `=== false`.

**`stripe_account_id` appears nowhere in that path.** ✅ **Confirmed: clearing it changes nothing about
how a single one of the 57 rows reads.**

### 🔴 But `stripe_account_livemode` IS in that path, and it is load-bearing

```ts
const testOperators = new Set(opRows.filter(o => o.stripe_account_livemode === false).map(o => o.id))
```

`=== false`, not `!== true`. So:

| If `stripe_account_livemode` becomes | Arm (b) | The 18 online rows |
|---|---|---|
| stays `false` | fires | **count — £158.50 net** |
| set to `NULL` | 🔴 fails | **stop counting. £158.50 disappears** from Reports, the dashboard, every order balance and every order's paid/unpaid status |
| set to `true` | 🔴 fails (and is a lie) | same disappearance |

⚠️ **This is exactly the "exclude-by-default" behaviour the ledger was designed for** — an absent flag
means "not real money", and it fails closed. It is correct behaviour protecting a wrong input, which is
why nothing would warn you: the rows would simply stop appearing.

**So the column that looks most stale — a `livemode: false` on a platform that is now live — is the one
that must survive.** It is not a statement about the platform; it is a permanent property of the account
those 18 payments were taken on, and §37 stored it with the account id precisely so history could not be
rewritten by a key change.

---

## 8. WHAT I ESTABLISHED, AND WHAT I DID NOT

**Established (QUOTED):** the status route's presence-only test and the 500 path; the full client chain
to `configError` and the greyed button; every consumer of `stripe_account_id` and what NULL does to each;
that `resolveOnlineCardPayments` ignores it and keys on `stripe_charges_enabled`; every Stripe column's
live value for all eight operators; Test Kitchen's 57 ledger rows and the £158.50 arm (b) depends on;
that `create_account` is idempotent on the id; that 13 drafts hold a `payment_intent_id` and none is
unpromoted.

**Established by inference:** that a customer choosing card on Test Kitchen today would fail at payment;
that clearing the id alone would not fix that; that the mode disagreement is a safer discriminator than
the Stripe error text.

**Not established:** whether `acct_1U30w22fB4PPCw2D` still exists in the Stripe sandbox — I did not call
Stripe. It does not matter for any of the above: the live key cannot reach it either way.

**Not done:** no file changed, no row changed, no SQL executed, no Stripe call made.
