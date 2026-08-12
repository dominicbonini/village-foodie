# Making promotion survive the serverless runtime

**Date:** 12 August 2026
**BUILD.** No `next dev`, no `next build`. Nothing committed. Nothing deployed. **No migration.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE HEADLINE NUMBER

```
order 25, webhook alone, void promoteDraft   AUTHORISATION -> ORDER ROW : 23.5s
this build, redirect wired, awaited          AUTHORISATION -> ORDER ROW :  2.0s
```

Measured against real Stripe and real rows. The customer's request was held for **2.3 seconds** — inside a 6-second deadline it never came close to — and then 303'd to the identical `?confirm=` URL it goes to today.

| # | What | Where |
|---|---|---|
| 1 | `void promoteDraft(...)` → `after()`, via a shared `keepAlive` | `lib/runtime/after-response.ts` (new), `webhooks/stripe/route.ts` |
| 2 | `export const maxDuration = 300` | both routes, justified below |
| 3 | 🔴 `return_url` now points at `/api/payments/return` | `app/trucks/[slug]/order/page.tsx:1505` |
| 4 | The redirect **races a 6s deadline** rather than blocking, and hands the rest to `after()` | `payments/return/route.ts` |
| 4b | `already` is now **verified against an actual order row**, not assumed | `webhooks/stripe/route.ts` |
| Census | ✅ **NO FILE GAINED A CHARACTER CLASS.** All three distinct sets identical |

---

## 1. `after()` instead of a floating promise

**A shared helper, because both routes need it and the fallback reasoning must be written once:** `lib/runtime/after-response.ts`.

```ts
export function keepAlive(task: Promise<unknown> | (() => Promise<unknown>), label: string): void {
  try {
    after(task)
  } catch (err) {
    console.error(
      `[after-response] 🔴 could not schedule "${label}" with after() — falling back to a floating ` +
      `promise, which the runtime may drop:`, err instanceof Error ? err.message : err,
    )
    void Promise.resolve(typeof task === 'function' ? task() : task)
      .catch(e => console.error(`[after-response] 🔴 fallback task "${label}" rejected:`, e))
  }
}
```

### 🔴 The `try/catch` is not padding

`after()` requires a request scope and **throws** outside one (`next/dist/server/after/after.js`: `` throw new Error('`after` was called outside a request scope') ``). The webhook's contract is that **nothing between verification and the response may throw** — a throwing handler is what turns one Stripe delivery into several. So a scheduling failure degrades to exactly what shipped before (a floating promise), loudly, and the 2xx is never at risk. **Falling back is strictly better than today; throwing would be strictly worse.**

### The webhook now schedules a thunk

```ts
function startPromotion(orderKey: string, trigger: 'webhook', eventId: string) {
  keepAlive(() => promoteDraft(supabase, orderKey, trigger)
    .then(async res => { … })
    .catch(err => { … }), `promotion:${orderKey}`)
}
```

⚠️ **A THUNK, NOT A PROMISE**, so promotion does not even *begin* until the response is on the wire. With `void` it started immediately and raced the response; there was never a reason for it to.

### The 2xx contract, kept absolutely

`keepAlive` does one thing before returning: call `after()`, which enqueues. **Measured:** in case (b) the handler produced its response in **~39 ms**, and the promotion ran for a further 93 ms afterwards. In case (c) the handler returned in **~29 ms** and the promotion took **1926 ms** under `after()`. Nothing slow and nothing that can throw moved above the response.

---

## 2. `maxDuration`, and the number

```ts
export const maxDuration = 300
```
on **both** routes.

| | |
|---|---|
| **What it was** | unset ⇒ the platform default |
| **The default, quoted from this repo** | `app/api/demo/route.ts:23` — *"it inherited the PLATFORM DEFAULT (10s on Hobby / 15s on Pro)"* |
| **The ceiling, quoted from this repo** | same comment — *"the highest a Vercel Pro Node function permits (300s)"*, and *"on Hobby the cap is 60s"* |
| **What promotion actually costs** | order 24: **2.5 s** claim→insert, **20.4 s** end to end including two Brevo sends. Order 25: **23.5 s** claim→insert. This build, case (c): **1.9 s** end to end |

**15 seconds cannot host either measured promotion.** That is the whole justification: the default is below the observed cost of the work, and being killed is the failure being fixed.

⚠️ **Why the ceiling rather than something snugger.** `maxDuration` here is not a latency budget — the customer is redirected at 6 s regardless — it is *the window the runtime is willing to keep the container awake for the `after()` task*. Vercel bills actual duration, and the ordinary promotion finishes in seconds, so the number is a ceiling for the pathological case rather than a reservation. **A snugger number buys nothing and reintroduces the exact class of failure being closed.**

🔴 **REQUIRES THE PRO PLAN.** On Hobby the cap is 60 s and 300 is rejected. `vercel.json` already carries four sub-daily cron entries, which implies Pro — **but that is inference, not proof.** If this is a Hobby project, 300 must become 60 on both routes.

---

## 3. The redirect, wired

`app/trucks/[slug]/order/page.tsx:1505`:

```ts
    const returnUrl = `${window.location.origin}/api/payments/return?draft=${encodeURIComponent(payment.orderKey)}&truck=${encodeURIComponent(slug)}`
```

**Verified live:** the route 303'd to

```
Location: https://www.hatchgrab.com/trucks/test-kitchen/order?confirm=cafc1922-40a8-46d7-8c07-2a2f7e45d66a
```

— character for character the URL the client used to navigate to directly. **The confirmation screen, its polling and its rendering are untouched.**

⚠️ `payment.orderKey` is the draft key, which becomes the order's key. Both names are the same uuid by construction; the route takes it as `draft` because at that moment no order exists.

---

## 4. 🔴 THE REDIRECT MUST NOT CREATE A WORSE FAILURE — WHAT I CHOSE, AND WHY

**All three of your options are in play, but the one that does the work is a fourth: the redirect never holds the request open long enough to be killed in the first place.**

```ts
  const work: Promise<Awaited<ReturnType<typeof promoteDraft>>> =
    promoteDraft(supabase, draftKey, 'redirect').catch(err => { … return { status: 'error' as const, … } })
  keepAlive(work, `promotion:${draftKey}`)

  const raced = await Promise.race([
    work,
    new Promise<typeof STILL_RUNNING>(resolve => setTimeout(() => resolve(STILL_RUNNING), REDIRECT_DEADLINE_MS)),
  ])

  if (raced === STILL_RUNNING) {
    console.warn(`[payments/return] promotion for draft=${draftKey} exceeded ${REDIRECT_DEADLINE_MS}ms — redirecting now and letting it finish under after(); the confirmation screen will poll it in.`)
    return NextResponse.redirect(`${menuUrl}?confirm=${encodeURIComponent(draftKey)}`, { status: 303 })
  }
```

### Why this and not the alternatives

| Option | Verdict |
|---|---|
| **maxDuration on that route** | ✅ **Taken, but insufficient alone.** It raises the cliff from 15 s to 300 s; it does not stop a customer staring at a held request for 20 s while two emails send |
| **Don't let a timed-out promoter hold the claim** | ❌ **Rejected as too dangerous to do unattended.** Releasing `promoted_at` lets a second promoter insert; if the first was merely slow, the second hits the `orders.order_key` primary key, and promoteDraft treats an insert failure as a refusal **and cancels the hold — on an order that exists**. Safe only with a stale window provably longer than `maxDuration`, which means 300 s+ and a periodic repair job. **Out of scope, and it would need promoteDraft's internals or the stranded cron** |
| **Make `already` verifiable** | ✅ **Taken**, at the webhook. See below |
| 🔴 **Race a deadline** | ✅ **THE PRIMARY.** It cannot cancel, cannot abandon and cannot release the claim. It only stops *waiting* |

### 🔴 THE FLOOR OF THIS DESIGN IS TODAY'S BEHAVIOUR

If the deadline wins, the customer is redirected to exactly the screen, with exactly the polling, they get today — while **the same promotion carries on under `after()`, in the same invocation, with a 300 s budget**. So the redirect adds a fast path and removes nothing.

**6000 ms** is ~2.4× the 2.5 s a healthy promotion took to reach its insert, and far inside the 60 s the confirmation screen tolerates (`page.tsx:675-677`). Measured this build: **2.3 s**, 38 % of the deadline.

### `already` is now verified

```ts
      if (res.status === 'already') {
        const { data: order } = await supabase
          .from('orders').select('order_key').eq('order_key', orderKey).maybeSingle()
        if (!order) {
          console.error(
            `[webhook/stripe] 🔴 promotion(${orderKey}) -> already, BUT NO ORDER ROW EXISTS. Either a ` +
            `promoter is still running or one died holding the claim. If this key has no order in a ` +
            `few minutes, money is authorised against nothing — reconcile by hand.`,
          )
          return markHandled(eventId, 'promotion:already_no_order')
        }
      }
```

⚠️ **One indexed read, on the uncommon path only.** A `promoted` result skips it entirely. It does **not** attempt repair, for the primary-key/cancel-the-hold reason above — it makes the state loud and named instead of silently successful.

### 🔴 SO: WHAT NOW HAPPENS TO A PROMOTION KILLED MID-FLIGHT

| | |
|---|---|
| **Killed at the 6 s deadline** | 🔴 **CANNOT HAPPEN.** The deadline does not kill anything; the work continues under `after()` |
| **Killed at `maxDuration`** | Only after **300 s**, which no measured promotion approaches (worst observed: 23.5 s) |
| **If it does happen** | `promoted_at` set, no order row, hold live. The webhook logs 🔴 and records `handler_result: 'promotion:already_no_order'`. `node scripts/list-stranded-authorisations.cjs --all` shows it as **CHECK BY HAND**. The cancellation sweep never releases it (`promoted_at is null` excludes it), so the hold expires at Stripe in ~7 days |
| **Still open** | ⚠️ **Nothing repairs it automatically.** §7 |

---

## 5. What the customer sees, and how long they wait

| Step | What they see | Measured |
|---|---|---|
| Taps Pay | the Element goes inert, `payStage: 'authorising'` | — |
| Apple Pay / card authorises | Stripe's sheet dismisses | ~14 s in the wild, **theirs, not ours** |
| `window.location.href = returnUrl` | the browser navigates; the current page stays with a loading indicator | — |
| 🔴 `/api/payments/return` promotes | **still that loading indicator** | 🔴 **2.3 s** |
| 303 | the confirmation renders **immediately** — the order already exists | first poll is a hit |

**Ordinary case: about 2 seconds, and the confirmation is populated on arrival.** The "Loading your order..." spinner, which order 25's customer watched for ~24 s, does not appear at all.

**If promotion exceeds 6 s:** the 303 fires anyway and they land on the spinner, polling every 2 s for up to 60 s — **identical to today**, with the promotion still running.

---

## 6. How the two paths now interact

### Who wins in the ordinary case: 🔴 **the redirect**

Both fire on the same authorisation. The redirect starts from the customer's browser the moment `confirmPayment` resolves; the webhook starts when Stripe's event is delivered (**1.1 s** behind its own `created` for order 25). In the measured run the redirect had already promoted and captured before the webhook arrived.

### What the loser costs — **quoted, not rebuilt**

`lib/payments/order-drafts.ts:342-368`:

```ts
  if (row.promoted_at) {
    console.log(`[order-drafts] claim not taken for order_key=${orderKey} — already promoted at ${row.promoted_at}`)
    return null
  }
  …
  if (!data) {
    // ⚠️ THE ORDINARY OUTCOME FOR THE LOSER, AND NOT AN ERROR.
    console.log(`[order-drafts] claim not taken for order_key=${orderKey} — another promoter got there first`)
    return null
  }
```
and `lib/payments/promote-draft.ts:114-118`:
```ts
  const draft = await claimOrderDraft(supabase, orderKey)
  if (!draft) {
    console.log(`[promote:${trigger}] draft=${orderKey} not claimed — already promoted, or no such draft`)
    return { status: 'already', orderKey }
  }
```

**Measured cost of losing (case b): one indexed read, plus the new order-row check. Total handler time 132 ms, of which 93 ms was the after() work.**

### Nothing can run twice — **the claim is the gate, and everything is below it**

| | Prevented by | Measured (case b) |
|---|---|---|
| A second order row | the claim, plus `orders.order_key` primary key | orders **1 → 1** |
| A second email | the claim — the email is step 9, far below it | emails **`[]`** |
| A second capture | the claim, **plus** three of its own layers (ledger pre-check on `stripe_pi:<id>`, Stripe's refusal, `order_payments_idempotency_key_uidx`) | ledger **1 → 1** |

---

## 7. The stranded finder

### ✅ It still catches everything it caught, and it has already earned its keep

```
Promoted drafts with an uncancelled authorisation : 4
Of those, not captured                            : 0
✅ Nothing stranded. Every accepted card order has been captured.
```

Orders 18 and 19 — the £12.50 my earlier report found held and untaken — were recovered by the sweep at **21:15:15** and **21:15:17**, with `capture_missing` then `capture_recovered` audit rows for each, exactly as designed.

### ❌ The promoted-draft-with-no-order case is **STILL CHECK BY HAND**

**QUOTED**, `supabase/migrations/20260815_find_stranded_authorisations.sql`:
```sql
  from order_drafts d
  join orders o on o.order_key = d.order_key
```
An **inner join**. A draft with no order row cannot appear, so the `*/15` cron will never act on it.

The one-off script does see it, but only with `--all`:
```js
    const status = o ? o.status : 'NO ORDER ROW'
    const accepted = !!o && ACCEPTED.includes(o.status)
    …
    if (!accepted && !SHOW_ALL) continue
```
→ rendered as **`CHECK BY HAND`**.

**What this build adds:** the state is now *named at the moment it is detected*, by `handler_result: 'promotion:already_no_order'` plus a 🔴 log line — where previously the webhook recorded `promotion:already` and called it success. **Findable, still not self-healing.**

⚠️ **Closing it properly needs a reclaim pass** (release a claim provably older than `maxDuration` when no order exists, then re-promote), which touches the stranded cron and needs a migration for the anti-join. **Deliberately not built here** — it is a separate design, and doing it badly cancels holds on real orders.

---

# VERIFICATION

**Method:** the real `GET`/`POST` exports of both routes, executed inside a **real Next `workAsyncStorage` scope** with a real `AfterContext` and `AfterRunner`, so `after()` genuinely schedules and `executeAfter()` drains it — not a mock. Real database, real Stripe sandbox, real HMAC-signed webhook payloads. Brevo intercepted at the `fetch` boundary.

```
webhook maxDuration = 300   return maxDuration = 300
```

## 🔴 WRITES DECLARED

| Write | Cleanup |
|---|---|
| 3 `order_drafts` rows | ✅ deleted |
| 2 `orders` rows (#36, #37) | ✅ deleted |
| 2 `order_payments` rows | ✅ deleted |
| 3 synthetic `stripe_webhook_events` rows | ✅ deleted (`evt_harness_*`) |
| 3 sandbox PaymentIntents | ⚠️ **NOT reversible.** 2 captured, 1 cancelled in cleanup |
| 2 display numbers (#36, #37) | ⚠️ **NOT reversible.** Next real order is #38 |
| **Emails sent** | ✅ **ZERO** |

```
residual drafts/orders/payments/events: 0/0/0/0
BREVO CALLS THAT LEFT THIS MACHINE: 0 (all intercepted)
```

## (a) A card order promoted via the redirect

```
[capture] CAPTURED order_key=cafc1922-… trigger=promote_auto_accept -> status=paid
[promote:redirect] PROMOTED draft=cafc1922-… -> order #36 status=confirmed capture=captured
GET /api/payments/return -> 303  Location: https://www.hatchgrab.com/trucks/test-kitchen/order?confirm=cafc1922-…
order row      : #36 at 2026-08-12T22:02:30.955835+00:00
authorised at  : 2026-08-12T22:02:29.000Z
🔴 AUTHORISATION -> ORDER ROW : 2.0s
   request held for            : 2.3s (deadline is 6.0s)
ledger rows: 1   emails: ["Order #36 confirmed"]
```

🔴 **2.0 seconds, against 23.5 for order 25.** The trigger is `promote:redirect` — the path that has not run since `f7aed6c`.

## (b) The webhook arriving after the redirect has promoted

```
[webhook/stripe] AUTHORISED pi=pi_3U3kED… order_key=cafc1922-… capturable=650 — promotion started
[order-drafts] claim not taken for order_key=cafc1922-… — already promoted at 2026-08-12T22:02:30.338+00:00
[promote:webhook] draft=cafc1922-… not claimed — already promoted, or no such draft
[webhook/stripe] promotion(cafc1922-…) -> already
POST /api/webhooks/stripe -> 200 {"received":true}  (2xx in 132ms)
orders  1 -> 1    ledger 1 -> 1    emails: []
handler_result : {"handler_result":"promotion:already","handled":true}
```

✅ **No second order, no second email, no second capture.** The order-row check passed, so `already` was recorded as success **because it was verified**, not assumed.

## (c) The webhook promoting alone, under `after()`

```
[webhook/stripe] AUTHORISED pi=pi_3U3kEH… order_key=de761f2e-… capturable=650 — promotion started
[capture] CAPTURED order_key=de761f2e-… trigger=promote_auto_accept -> status=paid
[promote:webhook] PROMOTED draft=de761f2e-… -> order #37 status=confirmed capture=captured
[webhook/stripe] promotion(de761f2e-…) -> promoted
[harness] (c): after() queue drained in 1926ms
🔴 COMPLETION LINE: [webhook/stripe] promotion(de761f2e-…) -> promoted
fell back to a floating promise? NO - after() accepted it
handler_result : {"handler_result":"promotion:promoted","handled":true,"handled_at":"2026-08-12T22:02:36.386+00:00"}
```

🔴 **THE COMPLETION LINE APPEARS.** That is the line Vercel's runtime log had zero of across order 25's window — the one written inside `startPromotion`'s `.then`. It now runs inside a task the framework accepted (`fell back to a floating promise? NO`) and is drained by the runtime's own `executeAfter`, in **1926 ms**, after a **29 ms** response.

## (d) A promotion killed mid-flight

Simulated exactly: the draft was claimed through the real `claimOrderDraft` and then abandoned before the insert.

```
claimed the draft and then "died" before the insert: claim ok = true
left behind    : promoted_at=2026-08-12T22:02:37.978+00:00  orders=0  ledger=0
[webhook/stripe] promotion(e16dea96-…) -> already
[webhook/stripe] 🔴 promotion(e16dea96-…) -> already, BUT NO ORDER ROW EXISTS. Either a promoter is
  still running or one died holding the claim. If this key has no order in a few minutes, money is
  authorised against nothing — reconcile by hand.
🔴 handler_result : {"handler_result":"promotion:already_no_order"}
still            : orders=0  ledger=0  emails=[]
```

**Left behind:** `promoted_at` set, no order row, a live £6.50 hold, no ledger row, no email.
**What recovers it:** ❌ **nothing automatic.** It is now *named* — a distinct `handler_result`, a 🔴 log line, and `CHECK BY HAND` in the one-off script. Before this build the webhook recorded `promotion:already` and reported success. The cancellation sweep will not release it (`promoted_at is null` excludes it); Stripe expires the hold in ~7 days.

## Tooling

```
$ npx tsc --noEmit   -> clean
$ npx eslint <the four files>   -> 46 problems before, 46 after (all pre-existing)
```

---

# 🔴 NON-ASCII CENSUS

| File | Before | After | Distinct set |
|---|---|---|---|
| `app/api/webhooks/stripe/route.ts` | 764 / **8** | 890 / **8** | `§ — … → ─ ⚠ 🔴 ️` **identical** |
| `app/api/payments/return/route.ts` | 163 / **6** | 228 / **6** | `— ─ ⚠ ✅ 🔴 ️` **identical** |
| `app/trucks/[slug]/order/page.tsx` | 2573 / **39** | 2599 / **39** | 39 characters, **identical** |

✅ **NO FILE GAINED A CHARACTER CLASS IT DID NOT ALREADY CONTAIN.**

**New file:**

| File | Total | Distinct |
|---|---|---|
| `lib/runtime/after-response.ts` | 166 | 5 — `— ─ ⚠ 🔴 ️` |

---

# 🔴 SOMETHING I FOUND WHILE VERIFYING, AND IT IS NOT MINE TO SIT ON

**Orders 18 and 19 were each paid twice, for real, and the ledger says so.**

```
3a621e2f  charge  in_person_other  600  collect:3a621e2f…:0:600   21:14:05  <- operator collected cash
a06c2090  charge  in_person_other  650  collect:a06c2090…:0:650   21:14:07  <- operator collected cash
3a621e2f  charge  online card      600  stripe_pi:pi_3U3fB5…      21:15:15  <- the sweep captured the card
a06c2090  charge  online card      650  stripe_pi:pi_3U3iwC…      21:15:17  <- the sweep captured the card
```
```
#18  payment_status: refund_due  amount_paid: 12.00   (total 6.00)
#19  payment_status: refund_due  amount_paid: 13.00   (total 6.50)
```

The operator marked both paid in person at 21:14, and the stranded sweep captured their cards **70 seconds later**. Each customer has been charged twice. `refund_due` is the ledger correctly reporting it.

⚠️ **NOT CAUSED BY THIS BUILD, and not fixed by it.** It is the original defect end to end: the money sat uncaptured, the board said "collect at the hatch", the operator collected, and the backstop then took the card payment that had always been owed. **These are direct charges, so HatchGrab cannot refund them — the truck must, from the Stripe Dashboard, £6.00 on `pi_3U3fB52fB4PPCw2D1VD1opZI` and £6.50 on `pi_3U3iwC2fB4PPCw2D0DwOxtVU`.** Sandbox money, so nothing real is owed, but the sequence is exactly what would happen in production.

# Standing

- ⚠️ **`maxDuration = 300` requires the Pro plan.** On Hobby it is rejected and must be 60.
- ⚠️ **Whether Vercel honours `after()` in production is still not established from this repo.** What is established is that Next accepts the task and the framework's own runner drains it — measured above — and that the fallback is loud.
- ❌ **The promoted-draft-with-no-order case is named but not self-healing.** §7.
- ⚠️ **`sendCancellationEmail` still promises a refund HatchGrab cannot issue** — newly relevant given the paragraph above.
