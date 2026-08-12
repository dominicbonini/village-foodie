# The promotion race: what it would take for the redirect to win

**Date:** 12 August 2026
**READ-ONLY DIAGNOSIS. No file changed, no file created except this report. No `next dev`, no `next build`, no commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THERE IS NO RACE. THE REDIRECT PATH IS NEVER CALLED.

Your premise — *"the path with a human attached loses the race to the path that can be frozen"* — is right about the outcome and wrong about the mechanism, and the difference changes the whole answer.

**`/api/payments/return` is unreachable. Nothing in the codebase points a Stripe `return_url` at it.**

**QUOTED.** The only `return_url` that exists, `app/trucks/[slug]/order/page.tsx:1495-1500`:

```ts
    const returnUrl = `${window.location.origin}/trucks/${encodeURIComponent(slug)}/order?confirm=${encodeURIComponent(payment.orderKey)}`
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      })
```

and the success path, `:1512`:

```ts
      // AUTHORISED. Manual capture ⇒ `requires_capture`: money HELD, not taken. The webhook promotes.
      window.location.href = returnUrl
```

🔴 **THAT URL GOES STRAIGHT TO THE CONFIRMATION SCREEN AND SKIPS THE PROMOTER ENTIRELY.** The customer's browser never touches `/api/payments/return`, so its `await promoteDraft(...)` has not executed once since the Payment Element shipped. An exhaustive grep confirms it: every reference to `payments/return` in the repo is inside that file itself, a comment, or a log line.

### And it used to be wired. I unwired it.

**QUOTED**, `git log -S"api/payments/return" -- app/trucks/[slug]/order/page.tsx` returns two commits: `0cb2d2a` (which added the route) and **`f7aed6c "payment fix again"`, 2026-08-12T15:57:41+01:00 — the hosted-Checkout-to-Payment-Element build**. Its diff **deletes** this comment:

```
-      // ⚠️ `data.url` GOES TO STRIPE AND RETURNS THROUGH /api/payments/return, which promotes the draft
-      // and then redirects to the same `?confirm=` URL as before. The confirmation screen is unchanged.
```

and adds the `returnUrl` above. Under hosted Checkout, Stripe returned the customer through the promoter. When I replaced Checkout with the in-page Element I pointed `return_url` at the destination the promoter used to redirect to, and never re-interposed it. **That is my omission and it is the whole finding.**

### The two URLs are already identical, which is why nothing looked broken

| | |
|---|---|
| What the client sets today | `${origin}/trucks/${slug}/order?confirm=${orderKey}` |
| What `/api/payments/return` 303s to | `` `${menuUrl}?confirm=${encodeURIComponent(draftKey)}` `` where `menuUrl = ${base}/trucks/${truck}/order` |

**The same string.** The route is a drop-in interposition: point `return_url` at `/api/payments/return?draft=…&truck=…` and the customer lands exactly where they land now, having been promoted on the way.

⚠️ **AND SO: for order 25 the webhook did not beat the redirect. It ran unopposed.** `handler_result: "promotion:promoted"` was never in doubt.

---

## 1. Both promotion triggers, in full

### The webhook — `void`, detached

**QUOTED**, `app/api/webhooks/stripe/route.ts:398-408`:

```ts
    // 🔴 OUT OF BAND. THE 2xx CONTRACT IS NOT NEGOTIABLE — see the header: nothing slow and nothing that
    // can throw runs between verification and the response. Promotion is both: it takes a lock, runs
    // four checks, inserts, rebuilds capacity and sends two emails. So it is STARTED and not awaited,
    // and the 2xx goes back immediately.
    // ⚠️ THE COST, STATED PLAINLY: on a serverless runtime an invocation may be frozen once the response
    // is returned, so this promotion is NOT guaranteed to finish. That is why it is not the only trigger.
    // The redirect route promotes too, and the cancellation sweep releases any hold that never became an
    // order — so a dropped continuation costs latency, never money.
    startPromotion(orderKey, 'webhook', eventId)
    console.log(`[webhook/stripe] AUTHORISED pi=${piId} order_key=${orderKey} capturable=${capturable} — promotion started`)
    return NextResponse.json({ received: true })
```

and `:554-565`:

```ts
function startPromotion(orderKey: string, trigger: 'webhook', eventId: string) {
  void promoteDraft(supabase, orderKey, trigger)
    .then(res => {
      console.log(`[webhook/stripe] promotion(${orderKey}) -> ${res.status}${'detail' in res ? ` (${res.detail})` : ''}${'reason' in res ? ` (${res.reason})` : ''}`)
      // Marked only once the work actually finished, which is what makes the duplicate branch above
      // able to tell "done" from "started and lost".
      return markHandled(eventId, `promotion:${res.status}`)
    })
    .catch(err => {
      console.error(`[webhook/stripe] 🔴 promotion(${orderKey}) threw — the event stays UNHANDLED so a redelivery retries it:`, err)
    })
}
```

🔴 **"The redirect route promotes too" is the load-bearing sentence in that comment, and it is currently false.**

### The redirect — `await`, blocking, and never invoked

**QUOTED**, `app/api/payments/return/route.ts:30-62`:

```ts
export async function GET(req: NextRequest) {
  const draftKey = req.nextUrl.searchParams.get('draft')
  const truck = req.nextUrl.searchParams.get('truck') ?? ''
  const base = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? req.nextUrl.origin
  const menuUrl = `${base}/trucks/${encodeURIComponent(truck)}/order`
  …
  let res: Awaited<ReturnType<typeof promoteDraft>>
  try {
    res = await promoteDraft(supabase, draftKey, 'redirect')
  } catch (err) {
    console.error(`[payments/return] 🔴 promotion threw for draft=${draftKey} — the webhook remains the authority:`, err)
    return NextResponse.redirect(`${menuUrl}?confirm=${encodeURIComponent(draftKey)}`, { status: 303 })
  }

  switch (res.status) {
    case 'promoted':
    case 'already':
      return NextResponse.redirect(`${menuUrl}?confirm=${encodeURIComponent(draftKey)}`, { status: 303 })
```

⚠️ **AND IT HAS NO `maxDuration`.** `grep -rn "maxDuration" app` returns three routes and this is not one, so it inherits the platform default — which the repo itself states: *"it inherited the PLATFORM DEFAULT (10s on Hobby / 15s on Pro)"* (`app/api/demo/route.ts:23`). **A 23.5-second promotion awaited in this route would 504 before it finished.** Making the redirect the promoter is not only a one-line client change.

---

## 2. The claim, and what the loser experiences

**QUOTED**, `lib/payments/order-drafts.ts:332-370`:

```ts
export async function claimOrderDraft(supabase, orderKey): Promise<OrderDraftRow | null> {
  // 1. READ. This is where the caller's copy of the customer details comes from.
  const row = await getOrderDraft(supabase, orderKey)
  if (!row) { … return null }
  if (row.promoted_at) {
    console.log(`[order-drafts] claim not taken for order_key=${orderKey} — already promoted at ${row.promoted_at}`)
    return null
  }

  // 2. CLAIM. The guard is what arbitrates; the read above decided nothing.
  const { data, error } = await supabase
    .from('order_drafts')
    .update({ promoted_at: new Date().toISOString() })
    .eq('order_key', orderKey)
    .is('promoted_at', null)
    .select('order_key')
    .maybeSingle()

  if (error) { … return null }
  if (!data) {
    // ⚠️ THE ORDINARY OUTCOME FOR THE LOSER, AND NOT AN ERROR.
    console.log(`[order-drafts] claim not taken for order_key=${orderKey} — another promoter got there first`)
    return null
  }
  return row
}
```

### The loser gets `null`, no error, and it learns fast. **It does not block on the promotion.**

**INFERRED, from the shape of the calls:** there are two paths out for a loser, and neither waits for the winner's work.

| Case | Cost | Blocks? |
|---|---|---|
| **Arrives after the winner's claim has committed** | Step 1's `select` sees `promoted_at` set and returns at the guard. **One indexed read.** | ❌ **No lock is taken at all** |
| **Arrives during the winner's `UPDATE`** | Its own `UPDATE` waits on the Postgres row lock, re-evaluates `promoted_at is null` after the winner commits, matches nothing, returns zero rows | ⚠️ **Blocks for the duration of ONE statement, not one promotion** |

🔴 **THE SECOND ROW IS THE ONE THAT MATTERS AND IT IS SAFE BECAUSE THE CLAIM IS NOT INSIDE A TRANSACTION.** Every call here goes through PostgREST, one auto-committed statement at a time. The winner's `UPDATE` commits before it does anything else — before the truck read, before the lock, before the insert. So the row lock is held for microseconds, not for the 23.5 seconds the winner then spends. **A loser can never be stuck behind a promotion in progress.**

⚠️ **One consequence worth naming:** the claim is taken *first*, before any of the work. That is what makes a frozen winner so expensive — it holds the claim and the loser is permanently told "someone else has it", even when nobody is running.

---

## 3. Redirect promotes first, webhook arrives mid-promotion

**Walked precisely. INFERRED from the code, with each guard QUOTED.**

| Step | Redirect (winner) | Webhook (arrives at any point) |
|---|---|---|
| **Claim** | `UPDATE … is('promoted_at', null)` matches → gets the row | `claimOrderDraft` → `promoted_at` already set → returns `null` |
| **promoteDraft returns** | continues into the body | 🔴 **returns immediately at line 114-118** |
| **Insert** | runs once | never reached |
| **Emails** | run once | never reached |
| **Capture (step 8a)** | runs once | never reached |

**QUOTED**, `lib/payments/promote-draft.ts:114-118` — the loser's entire experience:

```ts
  const draft = await claimOrderDraft(supabase, orderKey)
  if (!draft) {
    console.log(`[promote:${trigger}] draft=${orderKey} not claimed — already promoted, or no such draft`)
    return { status: 'already', orderKey }
  }
```

### Could anything run twice? ❌ **No, and there are four independent reasons.**

| What | What stops a second run | Where |
|---|---|---|
| The order INSERT | 🔴 **The claim.** `.is('promoted_at', null)` is the gate, and everything below it is inside the `if (!draft) return` | `order-drafts.ts:349-353`, `promote-draft.ts:114` |
| The emails | The same gate — they are step 9, far below it | `promote-draft.ts:389, 442` |
| Capture | The same gate, **plus** three layers of its own: a ledger pre-check on `stripe_pi:<id>`, Stripe's own refusal to capture twice, and `order_payments_idempotency_key_uidx` | `capture.ts:17-22` |
| A second order row | `orders.order_key` is the primary key, supplied from the draft | `20260812_order_drafts.sql` |

⚠️ **The one thing that DOES run twice is harmless:** both callers pay for one `getOrderDraft` read. The header names it — *"THE PLAIN READ IS NOT A RACE. A loser may read the PII too, but it never wins the claim and therefore never does anything with it."*

---

## 4. What the webhook does when the redirect got there first

**QUOTED.** `promoteDraft` returns `{ status: 'already', orderKey }`, which lands in `startPromotion`'s `.then`:

```ts
      console.log(`[webhook/stripe] promotion(${orderKey}) -> ${res.status}…`)
      return markHandled(eventId, `promotion:${res.status}`)
```

✅ **A cheap no-op, and explicitly not an error.**

- **Cost:** one `getOrderDraft` read, then one `UPDATE` on `stripe_webhook_events`. No lock, no Stripe call, no email.
- **HTTP:** the 2xx was already returned before promotion started, so Stripe sees success either way and never retries.
- **The event is marked handled** with `promotion:already`, which is exactly what the duplicate branch needs to see. **QUOTED**, `route.ts:210-217`:

> *"RE-RUNNING IS SAFE BECAUSE PROMOTION IS IDEMPOTENT ON THE DRAFT CLAIM: a second promotion of an already-promoted draft gets zero rows from the conditional UPDATE and returns `already`. The ledger is likewise idempotent on the PaymentIntent id. Nothing here can double."*

🔴 **This is the branch that makes "let the redirect win" safe without removing the webhook.** The design already anticipated the webhook losing; it has simply never had anything to lose to.

---

## 5. Can the webhook's promotion be non-detached?

**QUOTED FROM THE INSTALLED PACKAGES, not from memory.**

### ✅ Next.js ships `after()`, and this project has it

`node_modules/next/server.d.ts`:
```ts
export { after } from 'next/dist/server/after'
```

`node_modules/next/dist/server/after/after.d.ts`:
```ts
export type AfterTask<T = unknown> = Promise<T> | AfterCallback<T>;
export type AfterCallback<T = unknown> = () => T | Promise<T>;
/**
 * This function allows you to schedule callbacks to be executed after the current request finishes.
 */
export declare function after<T>(task: AfterTask<T>): void;
```

**Next 16.1.6** (`require('next/package.json').version`). The primitive exists, is stable, and is one import away. **The repo does not use it anywhere** — `grep -rn "waitUntil\|unstable_after"` across `app` and `lib` returns exactly one hit, and it is Puppeteer's `waitUntil: 'networkidle2'` in `verify-schedule-url`.

### ❌ `@vercel/functions` is NOT installed

```
$ ls node_modules/@vercel
(nothing)
```

So `waitUntil` from that package is not available without adding a dependency.

### ⚠️ What `after()` actually guarantees here: **not established**

The `.d.ts` says *"executed after the current request finishes"* — it does not say the platform keeps the container alive. Whether Vercel's runtime holds the invocation open for an `after()` task, and for how long, is platform behaviour I cannot quote from this repo or these packages.

**What I can say:** `after()` is the framework's *declared* mechanism for exactly this, so the runtime is told the work exists — which `void` never does. `void` hands the runtime a floating promise it has no reason to wait for. That is strictly more than nothing, and strictly less than a guarantee.

🔴 **AND ONE HARD CEILING THAT NO PRIMITIVE REMOVES.** The repo states the platform default is *"10s on Hobby / 15s on Pro"* and the maximum for a Pro Node function is 300s (`app/api/demo/route.ts:23-28`). Order 25's promotion spanned **149.8 seconds**. Even a perfectly-honoured `after()` on a route with no `maxDuration` would be killed long before that — so `after()` alone would not have saved it.

---

## 6. The cost of the webhook delaying briefly

### 🔴 IT IS THE WRONG LEVER, AND TODAY IT IS A PURE LOSS.

Nothing would win the delay: the redirect is never called. A delay would simply postpone every promotion by its own length, and the customer's spinner would grow by exactly that much. **INFERRED, but directly from §the headline.**

### If the redirect were wired, here is the cost anyway

| Where the delay sits | What it costs | Verdict |
|---|---|---|
| **Before the 2xx** | 🔴 Inside Stripe's delivery timeout and the 15s function budget. The header's rule — *"nothing slow and nothing that can throw runs between verification and the response, because a slow or throwing handler is precisely what turns one delivery into several"* — forbids it outright | ❌ **Never** |
| **After the 2xx, inside the detached task** | Free in HTTP terms, and it lengthens the window in which the invocation can be frozen **before doing any work at all** | ⚠️ **Makes the current failure mode worse** |

🔴 **THE SECOND ROW IS THE REAL RISK AND IT IS NOT THE ONE YOU ASKED ABOUT.** Today the detached promotion at least *claims* immediately (0.345 s for order 25). Sleeping first means a freeze during the sleep leaves the draft unclaimed and the order uncreated — and the only thing that then rescues it is a Stripe **redelivery**, which the duplicate branch handles but which Stripe schedules on its own timetable, not ours.

### The customer who closes the tab during the delay

They are **not** harmed by the delay itself, only by the extra freeze window above. If the detached task survives the sleep it promotes exactly as now, `N` seconds later. Their confirmation email is `N` seconds later. Nothing expires.

### What bounds the delay

| Bound | Value | Source |
|---|---|---|
| The confirmation screen's patience | **60 s** — 30 retries at 2000 ms, then *"We couldn't find that order."* | `page.tsx:675-677` **QUOTED** |
| Function budget | **15 s** default, 300 s ceiling on Pro | `app/api/demo/route.ts:23-28` **QUOTED** |
| Draft expiry | **30 minutes** | `expires_at timestamptz not null default (now() + interval '30 minutes')` **QUOTED** |
| Stripe hold | ~7 days | Stripe, not the repo |

**The binding constraint is the 60-second confirmation screen, and the 15-second function budget sits well inside it.** Any delay worth having is a few seconds; the ceiling on usefulness is small and the downside is a wider freeze window.

---

## 7. Every way the redirect can fail to arrive

⚠️ **Today the answer to every row is the same: the redirect never arrives, for anyone.** This table is what would be true once it is wired.

| # | Failure | Reaches `/api/payments/return`? | What rescues the order |
|---|---|---|---|
| 1 | 🔴 **Not wired** (today) | ❌ **Never, for 100% of orders** | The webhook, detached |
| 2 | Customer closes the tab after authorising | ❌ | The webhook |
| 3 | Signal lost between authorisation and navigation | ❌ | The webhook |
| 4 | 3DS completed on a different device / out-of-band | ⚠️ **Not established.** With `redirect: 'if_required'` Stripe redirects the browser that started the flow; an out-of-band approval on another device returns the *original* browser, if it is still open | The webhook |
| 5 | Browser blocks or mangles the return navigation | ❌ | The webhook |
| 6 | `confirmPayment` throws after the money is authorised | ❌ — `:1512`'s `window.location.href` is never reached | The webhook |
| 7 | The route itself throws | ✅ arrives, promotion fails | **QUOTED**, `return/route.ts:50`: *"THE WEBHOOK IS STILL COMING… the customer is sent to the confirmation, which will resolve as soon as promotion lands"* |
| 8 | The route 504s on a slow promotion | ✅ arrives, killed mid-flight | ⚠️ **The claim is already taken.** The webhook gets `already` and does nothing. **Nothing finishes the promotion** — see below |
| 9 | Neither ever promotes | — | The cancellation sweep releases the hold within ~10 min of expiry |

### 🔴 ROW 8 IS THE NEW FAILURE MODE THAT WIRING THE REDIRECT WOULD CREATE

An awaited promotion that is killed by the function timeout leaves `promoted_at` set and no order row. The webhook then reads `already` and stands down. **INFERRED, and it follows directly from §2: the claim is taken before the work, so an abandoned winner poisons the draft for every other promoter.** The one-off script from the stranded-authorisation build already surfaces this state — it shows a promoted draft with no order row as `CHECK BY HAND` — but nothing repairs it automatically.

---

## 8. Suspension or slowness — can anything here tell us?

### ❌ There is no timing instrumentation on this path. **QUOTED by absence.**

`grep -rniE "elapsed|durationMs|took .*ms|performance.now"` across `app` and `lib` finds duration logging in **one** place — `app/api/cron/demo-cleanup/route.ts:199`, `const durationMs = Date.now() - startedAt`, written to a run-log row. Nothing in `lib/payments`, nothing in the webhook, nothing in `promoteDraft`. There are no per-step timers, no request-duration middleware, and no APM.

### What the database can bracket, and no more

| Timestamp | What it pins |
|---|---|
| `stripe_webhook_events.received_at` | the handler started |
| `order_drafts.promoted_at` | the claim committed |
| `orders.placed_at` / `created_at` | the insert |
| `order_payments.created_at` | capture recorded |
| `stripe_webhook_events.handled_at` | `promoteDraft` **resolved** |

Those five are exactly what the previous report used. **They bound the work; they cannot say whether the process was executing or parked between any two of them.**

### 🔴 BUT ONE IN-REPO FACT IS STRONGLY SUGGESTIVE, AND IT IS NEW

The repo states the platform default function duration is **15 seconds on Pro**, and neither the webhook route nor `payments/return` sets `maxDuration`.

**Order 25's promotion spanned 149.8 seconds** from claim to resolve.

**INFERRED:** a detached continuation is not bounded by the *response* timeout, so this is not a contradiction — but it does establish that **the work outlived the platform's request budget by an order of magnitude**, which is only possible for work the runtime is not accounting for. It is consistent with suspension-and-resume and inconsistent with a single continuous 149.8-second execution under a 15-second-budget invocation. **It does not prove suspension.**

### 🔴 ONLY VERCEL'S INVOCATION LOG CAN ANSWER IT. HERE IS EXACTLY WHERE TO LOOK.

1. **Vercel Dashboard → your project → Logs** (or **Observability → Logs**).
2. Filter by path `/api/webhooks/stripe`, time window **2026-08-12 21:22:00–21:25:00 UTC**.
3. On the invocation that starts at **21:22:05Z**, compare the reported **Duration / Execution Duration** against the wall-clock span to `handled_at 21:24:35.262Z`:
   - **Duration ≈ 150 s** → it ran continuously and our code is genuinely that slow.
   - 🔴 **Duration ≈ 1 s, or the log line for `promotion(...) -> promoted` appears under a *later* invocation's request id** → it was frozen and resumed. **That is the decisive artefact.**
4. Look for the two log lines by name — `[webhook/stripe] AUTHORISED pi=… promotion started` and `[webhook/stripe] promotion(…) -> promoted` — and **check whether they carry the same request id**. If they do not, suspension is proven.
5. Cross-check whether any invocation lands at **21:24:33Z**, which is when `orders.updated_at` moved 1.44 s before `handled_at`. An unrelated request warming that instance would explain both at once.

⚠️ **Vercel's log retention is limited** (1 hour on Hobby, longer on Pro). **If more than the retention window has passed, this is no longer answerable for order 25 and would need to be reproduced.**

---

# Quoted vs inferred

| § | Status |
|---|---|
| Headline | **QUOTED** — the only `return_url` in the repo, the exhaustive grep, and `f7aed6c`'s deletion of the comment that named the route |
| 1 | **QUOTED** — both triggers in full, plus the absent `maxDuration` |
| 2 | **QUOTED** — `claimOrderDraft` entire. The blocking analysis is **INFERRED** from PostgREST's one-statement-per-call, auto-commit shape |
| 3 | **INFERRED** walk-through; every guard **QUOTED** |
| 4 | **QUOTED** — the `.then`, and the duplicate branch's own statement of idempotency |
| 5 | **QUOTED** from `node_modules` — `after`'s export and signature, Next 16.1.6, the absent `@vercel/functions`. What Vercel does for `after()` is **not established** |
| 6 | **QUOTED** for every bound. The verdicts are **INFERRED** |
| 7 | **QUOTED** for rows 1, 6, 7, 9. Row 4 is **not established**. Row 8 is **INFERRED** from §2 |
| 8 | **QUOTED by absence** for the instrumentation, and **QUOTED** for the 15 s default. Suspension is **INFERRED and not proven** |

# Not established

- 🔴 **Whether Vercel keeps an invocation alive for a Next.js `after()` task**, and for how long. The `.d.ts` promises scheduling, not survival.
- 🔴 **Whether order 25's promotion was suspended or slow.** Only the Vercel invocation log answers it — §8 says exactly where, and warns that retention may already have expired it.
- **What an out-of-band 3DS approval on a second device does to the return navigation** (row 4).
- **What wrote `orders.updated_at = 21:24:33.822`.** Still open from the previous report; §8 step 5 is the way to close it.
- **Whether the plan is Hobby or Pro**, which sets both the default timeout (10 s vs 15 s) and log retention. `vercel.json` carries four cron entries on sub-daily schedules, which implies Pro, but that is not proof.
