# Bounding the Stripe client — report

**Task:** bound the Stripe client so the 300s payment-route ceilings can later come down, with
idempotency on every create, capture and refund.
**Status:** applied, typechecked and measured. **Nothing deployed, nothing committed, no SQL, no
migration. No `maxDuration` value was changed.**

**VERIFICATION — which of parse / typecheck / execution I performed:**
- **Parse:** yes. Every edited file parses.
- **Typecheck:** yes. `npx tsc --noEmit` across the whole project — **clean**.
- **Execution:** yes. A harness ran the **real** `lib/stripe/client.ts` against a **real local HTTP
  server** over a real socket, with the Stripe SDK pointed at it. **23 assertions, 23 passed.** Both
  guard mutations were caught. Timings below are measured wall-clock, not arithmetic.
- **NOT performed:** no call was made to Stripe itself. Everything about how *Stripe* responds to these
  keys is INFERRED from its documented contract — see §8.

---

## 1. Every Stripe client construction, and whether they should share one

**READ — seven constructions, all `new Stripe(key)` with NO options:**

| # | Site (before) | What it did | Now |
|---|---|---|---|
| 1 | `lib/payments/authorize.ts:125` | `paymentIntents.create` | `stripeClient()` |
| 2 | `lib/payments/authorize.ts:221` | `paymentIntents.cancel` | `stripeClient()` |
| 3 | `lib/payments/capture.ts:270` | `paymentIntents.capture` | `stripeClient()` |
| 4 | `lib/payments/capture.ts:300` | `paymentIntents.retrieve` (read) | `stripeClient()` |
| 5 | `lib/payments/refund.ts:128` | `refunds.create` | `stripeClient()` |
| 6 | `app/api/webhooks/stripe/route.ts:620` | `refunds.list` (read) | `stripeClient()` |
| 7 | `lib/stripe/connect.ts:154` (`stripeClient()` factory) | onboarding + `paymentMethodDomains` | delegates to the shared factory |

**Should they share one?** Yes — one **factory**, not one **instance**.

- **A shared factory: yes.** The bounds and the reasoning belong in one place, or the next client added
  silently reverts to the 80s×3 default. That is exactly how all seven got there.
- **A shared module-scoped instance: no, and deliberately.** Three of these sites relied on the client
  being built per call: `connect.ts` runs `requireStripeKey` on every construction (its own comment says
  so — *"Created per call rather than module-scoped so the check runs every time"*), and a module-scoped
  singleton would also pin a rotated `STRIPE_SECRET_KEY` for the life of the lambda. The new
  `stripeClient()` is still **per call**; only the options are shared.

**Also removed:** `stripeSecretKey()` was **defined three times** — `authorize.ts:43`, `capture.ts:62`,
`refund.ts:33` — byte-identical each time. One definition now, in `lib/stripe/client.ts`.

**New file: `lib/stripe/client.ts`.** No `apiVersion` is passed, deliberately — that keeps the SDK's own
pinned version, which is what all seven call sites already had. Passing one here would have been a
silent API-version migration hidden inside a timeout change.

---

## 2. The bound — the values, and why

```ts
timeout: 20_000            // ms
maxNetworkRetries: 1
// worst case per call = 20_000 × 2 = 40_000 ms
```

**What it was (READ from `node_modules/stripe/cjs/stripe.core.js`):** `DEFAULT_TIMEOUT = 80000` (`:99`),
`maxNetworkRetries = 2` (`:171`). **MEASURED, not inferred** — with the bounds removed, the harness
recorded a real call taking **241,027 ms across 3 attempts, first attempt aborting at 80,510 ms.**

**Why 20s, not 15s:** the top of the briefed band. A card authorisation on a bad mobile signal at a
festival pitch is the operation we least want to cut short, and 20s is already twice the point at which
a customer has decided the page is broken. The customer-facing wait is not fixed by shaving 5s here.

**Why 1 retry, not 2:** the SDK only retries connection errors and 5xx/429 — never a definite answer —
so a second retry buys little and doubles the tail. One retry keeps the recovery, halves the worst case.

**Measured worst case: 40,515 ms, 2 attempts, first aborted at 20,507 ms.**

**Headroom for a future ceiling: 300s → 40s is 7.5× of slack.** But see §5 — the number to size a
ceiling against is the *route*, not one Stripe call.

---

## 3. 🔴 Idempotency — the gate on this change

### What was there before (READ)

**Exactly one Stripe call passed a key:** `refund.ts` — `op_refund:${orderKey}:${refundedMinor}:${amountMinor}`.
`paymentIntents.create`, `.capture` and `.cancel` passed **none**. (Every other `idempotency_key` hit in
the repo — `ledger.ts:643`, `online.ts:110`, `online.ts:166` — is the local `order_payments` ledger
column, not Stripe's request option.)

### 🔴 A CORRECTION TO MY OWN FIRST ASSUMPTION, MEASURED

I assumed an unkeyed call was unprotected against the SDK's own network retry. **That was wrong, and the
harness caught it.** The SDK mints one `stripe-node-retry-<uuid>` per request and **reuses it across its
own retries** — measured: both attempts of an unkeyed stalled call sent
`stripe-node-retry-1d585015-8cce-4080-8c9e-1e56f1f0908a`.

**So the SDK's internal retry never could double-charge.** The gap is one level up, and it is the level
this change creates:

> **MEASURED:** two *separate* unkeyed calls send **two different keys** →
> `["stripe-node-retry-43cacc88-d…", "stripe-node-retry-4abb312e-6…"]` → **Stripe acts twice.**
> The same two calls with the derived key send **one key** → `"op_capture:pi_a:500"` → **Stripe acts once.**

That is precisely the boundary a 20s bound now pushes traffic across: we stop listening, the operator
taps again or the outbox replays. **Without the derived keys this change would have been unsafe.** With
them it is safe.

### What is sent now

| Call | Key | Derived from |
|---|---|---|
| `paymentIntents.create` | `pi_create:${orderKey}` | the **draft key** |
| `paymentIntents.capture` | `op_capture:${piId}:${captureMinor}` | the **intent id** + the **order total** |
| `paymentIntents.cancel` | `pi_cancel:${paymentIntentId}` | the **intent id** |
| `refunds.create` | `op_refund:${orderKey}:${refundedMinor}:${amountMinor}` | **unchanged, pre-existing** |

**No clock. No random value. No counter.** MEASURED: all four derivations re-evaluated 31 ms later
produced byte-identical strings. A `Date.now()`-derived mutant was **caught** by the suite.

### "If a retry could produce a different key, that is a finding"

I checked each one for that, and there is **one place where a retry legitimately produces a different
key. It is correct, and here is why:**

- **`pi_create`.** `app/api/orders/submit/route.ts:782` mints `const draftKey = newOrderKey()` — a fresh
  uuid **per attempt**, before `authorizeDraft`. So the key is **stable within an attempt** (an SDK
  retry gets the same intent back) and **new across attempts**. That is not a defect: a new attempt is
  a new basket state that supersedes and cancels the old hold, and it *must* get its own intent. There
  is **one caller** of `authorizeDraft` (`submit/route.ts:828`), so no other caller can pass an
  unstable key.
- **`op_capture` includes `captureMinor` on purpose.** If the operator edited the order between two
  attempts, the amount differs — and replaying the *old* amount would be the wrong outcome. A differing
  key sends a real second capture, Stripe refuses it (capture is one-shot), and the existing
  `ALREADY_CAPTURED` branch retrieves the true figure. **Both paths land on the right number.** With
  the same amount — the timeout-and-retry case — the key matches and Stripe replays.
- **`pi_cancel`, `op_refund`.** Pure functions of values fixed before the call.

**Key lengths** (Stripe's limit is 255): 46 / 47 / 39 / 60 chars. Fine.

**🟢 A useful interaction:** Stripe's idempotency keys live **24 h**. The native outbox's
`MAX_QUEUE_AGE_MS` is **12 h** (`lib/native/orderGate.ts:71`), so **a replayed confirm is always inside
Stripe's window**. If that 12 h is ever raised past 24 h, this guarantee breaks — noted here because
nothing in either file points at the other.

### Where I deliberately did NOT add a key, and why

`lib/stripe/connect.ts` has two creates. Neither gets one:
- `accountSessions.create` (`:367`) mints a **short-lived client_secret**. An idempotent replay would
  hand back the first session's secret, which may by then have **expired** — a key would make this call
  *less* correct. It moves no money.
- `paymentMethodDomains.create` (`:549`) already treats "already exists" as success.

---

## 4. A mid-flight timeout: what happens, and does the webhook reconcile?

### `paymentIntents.create` — **benign. No money is at risk.**

🟢 **READ:** the create call passes **no `confirm`** (`lib/payments/authorize.ts:117-143`). An
unconfirmed PaymentIntent places **nothing on the customer's card** — there is no hold until the browser
confirms. So a timeout here leaves an **orphan record, not an orphan hold**.

- **Local state:** the draft row exists (written before the call); no `payment_intent_id` attached (the
  attach at `:168` never runs); no order, no email, nothing reserved.
- **Webhook:** nothing to reconcile and nothing fires — `payment_intent.created` is not a handled type,
  and correctly so.
- **Cleanup:** the draft is swept, as `submit/route.ts:838` already states.

⚠️ **I corrected an overstatement in my own comment** at `authorize.ts:151` which claimed a duplicate
would be "a SECOND hold on the customer's card". It would not be. The comment now says so.

### `paymentIntents.capture` — **this is the one that moves money, and it IS reconciled.**

- **Local state on timeout:** `captureOnConfirmation` returns `{ status: 'failed', detail }`. **The order
  is already confirmed** by the write above the call (`action/route.ts:285-293` — *"AWAITED AND CANNOT
  THROW… stays confirmed whatever this returns"*). **No ledger row is written.** So the local record
  says confirmed-and-unpaid while Stripe may have taken the money.
- 🟢 **The webhook reconciles it.** READ: capture causes Stripe to emit `payment_intent.succeeded`
  (`webhooks/stripe/route.ts:397` states this explicitly, and `:449` handles it). With
  `amount_received > 0` the branch calls `recordOnlineCardPayment` (`:534`) and **writes the ledger row
  the timed-out invocation lost.** ⚠️ INFERRED, not observed: I read the code path; I did not watch a
  real event arrive.
- 🟢 **And a retry is safe twice over.** `capture.ts` has a **ledger pre-check** on `stripe_pi:<id>`
  (`:35`) that returns `already` without touching Stripe, *plus* the new idempotency key underneath it.

### `refunds.create` — **reconciled, and was already keyed.**

`refund.created` / `refund.updated` / `charge.refunded` all land at `webhooks/stripe/route.ts:589` and
write the ledger. A timed-out refund whose local write was lost is picked up there.

### 🔴 The honest trade-off

Bounding at 20s means a **genuinely slow but succeeding** Stripe call that would have completed at, say,
50s is now abandoned. Before, 80s×3 gave it more room. **The rate of "abandoned but actually succeeded"
goes up.** That is acceptable here, and only because of the three things above: create moves no money,
capture is webhook-reconciled *and* idempotent, refund is webhook-reconciled *and* was already keyed.
If any one of those were missing I would not have shipped the bound.

---

## 5. `maxDuration` — unchanged, as instructed

**No `maxDuration` value was altered.** Verified after the edits:
`orders/submit` 300, `dashboard/action` 300, `webhooks/stripe` 300, `payments/return` 300, and every
other route at its existing value.

What I *did* change is the **comment** in `orders/submit/route.ts` and `dashboard/action/route.ts` that
justified the 300 by citing the 80s×3 SDK floor. That justification is now **false**, and a stale comment
saying "the right fix is to bound the Stripe client first" — when the client is bounded — is worse than
no comment. Both blocks now record the real floor (~40s), that the ceiling is deliberately still 300, and:

> ⚠️ **Before lowering it, count the whole route, not one Stripe call.** `orders/submit` makes a Stripe
> call *plus* the draft write, the ledger and the Supabase work around it. The ceiling must clear the
> **sum**. I have **not measured** the non-Stripe portion, so I am **not** proposing a number.

---

## 6. What the operator and the customer actually see

| Path times out | Customer sees | Operator sees |
|---|---|---|
| **Checkout / create** | `CARD_UNAVAILABLE_MESSAGE` (`submit/route.ts:60`): *"We could not set up card payment just now, so your order has not been placed and you have not been charged. Your basket is saved — please try again, or choose Pay at the truck."* HTTP **503**, basket kept. **Accurate** — nothing was placed and nothing was charged. | Nothing. No order was created. |
| **Capture on confirm** | 🟢 The confirmation email says **`unknown`**, not "pay at the truck". `emailPaymentStateFromCapture` maps `failed` → `'unknown'` with the reasoning already written there: *"`failed` covers… 'captured but the ledger write failed' — which means the customer HAS paid. Claiming either direction would be a guess, and one of the two guesses bills someone twice."* | 🔴 **Nothing. This is a pre-existing gap, not one I introduced.** `captureResult` is consumed only by `resolveEmailPaymentState`; it never reaches the response. The confirm returns success and the order shows confirmed. The operator is not told the capture failed. **I have not changed this** — it is outside this task's scope and touching the confirm response on a truck trading Friday is not a change to bundle into a timeout guard. **Flagging it as the follow-up worth doing.** |
| **Refund** | No refund email — it is sent only on `status === 'refunded'`, and the deliberate comment there covers exactly this. | **HTTP 502** carrying `outcome.detail` (`action/route.ts:1117`). The failure is surfaced. |

---

## 7. What I measured

Harness: the **real** `lib/stripe/client.ts`, import specifier rewritten, run under
`node --experimental-strip-types`, with the Stripe SDK (v22.4.0) pointed at a **real local HTTP server**
that records every request and can stall indefinitely.

```
PASS  client carries timeout = 20000 — read 20000
PASS  client carries maxNetworkRetries = 1 — read 1
PASS  timeout is inside the briefed 15-20s band
PASS  slow-but-inside-bound call succeeds — 1526ms
PASS    ...and is sent exactly once — 1 request(s)
PASS  beyond-bound call throws rather than hanging — StripeConnectionError
PASS    ...within worst case (40s + slack), NOT the old ~240s — 40519ms
PASS    ...attempted exactly 2 times (1 try + 1 retry) — 2 request(s)
PASS    ...first attempt aborted at ~20s, not 80s — gap 20509ms
PASS  every attempt sent an Idempotency-Key header
PASS  🔴 retry reuses the SAME key — cannot double-charge
PASS    ...and it is the key we passed, not one the SDK invented
PASS  SDK auto-key is stable across its OWN retries
PASS  🔴 UNKEYED: two separate calls send DIFFERENT keys -> Stripe would act TWICE
PASS  🟢 KEYED: two separate calls send the SAME key -> Stripe replays, acts ONCE
PASS  pi_create / op_capture / pi_cancel / op_refund are pure functions of their inputs
PASS  🔴 no key varies with the clock or a random value — t+31ms
PASS  MUTANT CAUGHT: a Date.now()-derived key is detected as unstable

23 passed, 0 failed
```

**Mutation testing — the suite must fail when the guard is broken:**

| Mutation | Result |
|---|---|
| **Bounds removed entirely** (SDK defaults) | **5/5 FAIL** — measured **241,027 ms, 3 attempts, first abort 80,510 ms**. This is also the direct measurement of the *old* behaviour. |
| **`maxNetworkRetries` back to 2** | **3/5 FAIL** — measured **61,023 ms, 3 attempts**. |
| Restored | **5/5 pass**, 40,515 ms. |

---

## 8. What needs a real Stripe test-mode call

Everything above proves **what we send**. None of it proves **how Stripe answers**. These need a
test-mode key and are the gate on deploying with confidence:

1. 🔴 **That a replayed key returns the original response** rather than acting again — capture twice with
   `op_capture:<pi>:<minor>` and confirm the second returns the first result (`idempotent_replay`) and
   that only **one** capture appears on the intent.
2. 🔴 **That a second capture at a *different* amount is refused**, and that Stripe's real message still
   matches the `ALREADY_CAPTURED` regex in `capture.ts`. That regex is the fallback the differing-key
   path depends on. **This is the single most important one** — if the message wording has drifted, that
   path lands in the generic failure branch instead.
3. **That `pi_create:<orderKey>` replays cleanly** on a connected account (keys are scoped per account,
   so no cross-truck collision is expected — worth confirming, not assuming).
4. **That `payment_intent.succeeded` actually arrives after a manual capture** and writes the ledger row
   — §4's reconciliation claim is a source read, not an observed event.
5. **That a 20s bound does not cut real Stripe latency.** Test-mode is fast and proves nothing here;
   this wants p99 latency from live logs. If real captures ever approach 20s, raise the timeout — **do
   not** remove the retry.
6. **A real end-to-end card order on the test truck**, checkout → authorise → confirm → capture →
   partial refund, watching for exactly one intent, one capture and one refund.

---

## Files changed

```
lib/stripe/client.ts          NEW — the factory, the bounds, the reasoning
lib/payments/authorize.ts     2 clients bounded; create + cancel keyed; local stripeSecretKey removed
lib/payments/capture.ts       2 clients bounded; capture keyed; local stripeSecretKey removed
lib/payments/refund.ts        1 client bounded; local stripeSecretKey removed (key untouched)
lib/stripe/connect.ts         factory delegates; requireStripeKey preserved; no keys added (reasoned)
app/api/webhooks/stripe/route.ts   1 client bounded (a read)
app/api/orders/submit/route.ts     COMMENT ONLY — stale ceiling justification. maxDuration UNCHANGED.
app/api/dashboard/action/route.ts  COMMENT ONLY — stale ceiling justification. maxDuration UNCHANGED.
```

**Nothing was deployed. Nothing was committed. No SQL, no migration. No `maxDuration` was lowered. No
credential value was added or invented.**

## Nothing in the brief was garbled, and no two instructions conflicted.
