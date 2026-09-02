# Foreground refresh, and per-route timeout ceilings

**Built. NOT deployed, NOT committed. No SQL, no migrations.**
**Changed: `app/dashboard/[token]/page.tsx`, `app/dashboard/[token]/kds/page.tsx`,
`app/api/menu/[truckId]/route.ts`, `app/api/heartbeat/route.ts`, `app/api/manage/route.ts`,
`app/api/orders/submit/route.ts`, `app/api/dashboard/action/route.ts`.**

---

## VERIFICATION

**EXECUTION** for everything drawn from the repository: `grep`/`node` reads of the Stripe SDK's compiled
defaults, and a Node parse to establish the exact string a customer would see on a platform timeout.

🔴 **NOT MEASURED: any of this at runtime.** No app run, no resume, no route driven to its ceiling.
`/manage` is behind a session I do not have (`proxy.ts:305`), and the dashboard and KDS are token-gated
the same way. **`npx tsc --noEmit` is clean — SANITY ONLY, not verification.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

# PART ONE — `onAppResume`

## 1 · Which pattern I followed

**`lib/native/useHeartbeat.ts:72-76`** — and it is the right one because it exists for **the identical
reason**, in its own words: *"Native foreground: a suspended interval leaves the van stale, so re-ping on
resume. No-op on web."*

```ts
useEffect(() => {
  if (!token) return
  return onAppResume(() => { void ping(token, vanId, true) })
}, [token, vanId])
```

**Copied exactly:** the effect **returns the unsubscribe directly**, the callback is `void`-ed, and it is
gated on the identity it needs.

⚠️ **The other two are the same hook used differently and were the wrong template.** `usePrinting.ts:145`
wraps an async IIFE with its own try/catch because a failed reconnect must stay silent;
`AppLockGate.tsx:49` consumes a self-inflicted foreground via `authInProgress`. **Neither concern applies
to a refetch.**

**Placed inside the existing realtime/poll effect** on both boards, so it is created and torn down with
the 60s interval it complements, on the same `[truck?.id]` dependency.

## 2 · It cannot amplify

**`fetchAll` opens with the batch-1 in-flight guard:**

```ts
if(inFlightRef.current){ if(!forceSeed) return; inFlightRef.current.abort() }
```

**The resume calls `fetchAllRef.current()` with no arguments, so `forceSeed` is `false`.**

> ✅ **A resume that fires while a poll is mid-flight RETURNS IMMEDIATELY. It is dropped, not queued, not
> a second request.** The outstanding read completes and updates the board as normal.

**KDS is the same guarantee by a different rule** (`kds/page.tsx:561-565`): its guard is scope-based —
`if (inFlightRef.current.scope === scope) return`. A resume asks for **the same event**, so it is dropped;
only a genuine event change supersedes.

⚠️ **One resume = at most one request.** The 60s interval remains the only repeating caller.

## 3 · On resume with a degraded backend

**The resume adds no new failure handling — it reuses `fetchAll`'s, which is already correct:**

| | |
|---|---|
| **Blank the board?** | ❌ **No.** A non-ok while authenticated hits the keep-state branch; the abort path (10s) keeps state too |
| **Mark the backend degraded on its own?** | ⚠️ **It sets `degradedSince` exactly as a poll failure does** — and that is right, because **this is a foreground fetch with the operator watching.** It is not a background task making a claim about a screen nobody saw |
| **Retry storm?** | ❌ **No.** One call, no retry, no backoff loop |
| **Interaction with the cold-launch work** | 🔴 **Correct by construction.** A resume that fails while never-authenticated takes `enterBoardUnavailable()` — the cached-truck path — so it **keeps the cached board and the existing bar and does NOT show an error screen** |

⚠️ **`fetchAll` is gated on the same `truck?.id` as the poll**, so on a cold launch that has not yet
succeeded the resume does not fire — the initial load or the cold-launch path owns the screen.

## 4 · The KDS — same gap, same fix

> 🔴 **YES, AND IT HAD THE IDENTICAL GAP.** `kds/page.tsx` has a 60s `setInterval` (`:1133`), an in-flight
> guard (`:562`) and **no `onAppResume`** — `grep` returned nothing before this change. A cook waking the
> screen mid-service waited for the next tick.

**Wired the same way, in the same effect, with the same teardown.** Its failure path already keeps the
board and sets the degraded strip (`:616`), so §3 holds there too.

---

# PART TWO — `maxDuration`

## 5 · All the routes, before and after

⚠️ **The brief says five. I found SIX** — `manage` and `heartbeat` as well as the four named.

| Route | Was | **Now** | What it does |
|---|---|---|---|
| `api/dashboard/route.ts` | **30** | **30** *(unchanged)* | Operator board read, ~15 sequential DB round trips |
| `api/dashboard/action/route.ts` | none → 300 | 🔴 **300 (explicit)** | **Every operator write** — and capture/refund, which reach Stripe |
| `api/menu/[truckId]/route.ts` | none → 300 | ✅ **20** | Customer menu read. **No Stripe API call** |
| `api/orders/submit/route.ts` | none → 300 | 🔴 **300 (explicit)** | **Customer checkout** — creates a Stripe PaymentIntent |
| `api/manage/route.ts` | none → 300 | ✅ **30** | The whole manage console payload |
| `api/heartbeat/route.ts` | none → 300 | ✅ **10** | Two indexed writes, no external service |

## 6 · Each value, and the slowest legitimate operation it must survive

| Route | Value | Slowest legitimate case it must accommodate | What breaks if exceeded |
|---|---|---|---|
| **menu** | **20s** | A large menu on a cold Postgres connection — a dozen sequential round trips plus per-event override reads. Healthy is well under 1s | 504 → the page shows **"This truck is not currently taking orders."** (`order/page.tsx:1002`) — handled |
| **heartbeat** | **10s** | Two indexed writes on a cold connection. Healthy is tens of ms. 🔴 **Tightest on purpose: it fires every 15s from every device, so it is the route most able to build a backlog** | 504 → ignored (fire-and-forget); next tick in 15s. Worst case one interval of staleness in the auto-pause monitor |
| **manage** | **30s** | A truck with a large menu and many events — **the widest fan-out in the app, wider than `/api/dashboard`** | 504 → `load()`'s catch shows the standing staleness bar and keeps what it has |
| **dashboard** | 30s | ~15 sequential round trips (unchanged, already reasoned in batch 1) | Keeps the board + degraded bar |
| 🔴 **action** | **300s** | **A Stripe capture or refund** — see below | — |
| 🔴 **orders/submit** | **300s** | **A Stripe PaymentIntent creation** — see below | — |

## 7 · What is seen when a ceiling is hit — and 🔴 one finding

**A Vercel timeout kills the invocation and returns a platform 504 whose body is HTML, not JSON.**

| Path | Handled? |
|---|---|
| `/api/dashboard` → dashboard/KDS | ✅ **Handled.** Non-ok → keep board + degraded bar |
| `/api/manage` → manage page | ✅ **Handled.** `load()` catch → the staleness bar |
| `/api/menu` → customer page | ✅ **Handled.** `setError('This truck is not currently taking orders.')` |
| `/api/dashboard/action` → operator write | ✅ **Handled, and better than before.** A 504 is a 5xx, so the outbox now classes it retryable and **queues** it |
| 🔴 **`/api/orders/submit` → customer checkout** | ⚠️ **CAUGHT, BUT WHAT IT SHOWS IS RAW** |

### 🔴 THE FINDING

`app/trucks/[slug]/order/page.tsx:1987` does **`const data = await res.json()` BEFORE any `res.ok`
check.** On a platform 504 the body is HTML, so `res.json()` throws a `SyntaxError`, which lands in the
catch at `:2107`: `setError(err.message || 'Something went wrong. Please try again.')`.

**`err.message` is truthy, so the fallback never runs. Measured with Node:**

```
err.message = "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"
```

> 🔴 **A CUSTOMER MID-CHECKOUT WOULD SEE A JSON PARSER MESSAGE, ON A PAGE-REPLACING ERROR SCREEN.**
> ⚠️ **Pre-existing, and not caused by this change** — I left `orders/submit` at 300s, so I have not made
> it more likely. **But it is live today for any platform-level 5xx, and the fix is one line: check
> `res.ok` before parsing, or bound the message.** **Not bundled in here — it is a customer-facing copy
> change on a payment path and deserves its own approval.**

## 8 · The customer ordering routes, and how the floor was established

**Not by judgement — by reading the SDK. `lib/payments/authorize.ts:125` constructs the client as
`new Stripe(stripeSecretKey())` with NO options, so it takes every default. From
`node_modules/stripe/cjs/stripe.core.js`:**

```
DEFAULT_TIMEOUT   = 80000          (:99)
maxNetworkRetries = 2   (default)  (:171)
```

> 🔴 **ONE STRIPE CALL CAN LEGITIMATELY RUN 80s, AND WITH RETRIES UP TO ~240s, BEFORE THE SDK GIVES UP.
> THAT IS THE FLOOR.**

**A ceiling below it would cut a card operation mid-flight, and the failure is asymmetric:** Stripe may
have created or captured the intent while our invocation was killed — **money moved with no local
record.** That is strictly worse than the slowness a cap prevents, which is exactly the trade you named.

**So both payment-touching routes stay at 300s — but now as an EXPLICIT export with the measurement in
the comment, not an inherited default nobody chose.**

🔴 **`action/route.ts` is on this list and it is not obvious.** Most of its handlers are fast DB writes,
but it imports `captureOnConfirmation` (`lib/payments/capture.ts`) and `refundOrder`
(`lib/payments/refund.ts`), **both of which construct a Stripe client** — so a capture or a refund
carries the same floor as checkout. **A single route-level cap cannot distinguish them.**

### The right sequence, not done here

1. **Bound the Stripe client** — `new Stripe(key, { timeout: 20_000, maxNetworkRetries: 1 })` → worst
   case ~40s.
2. **Then** bring both ceilings down to just above that (~60s).

⚠️ **Step 1 changes payment behaviour on a live surface and is deliberately not bundled into a
timeout-capping change.** ⚠️ **And a bounded Stripe client needs its own thought about what a timed-out
`create` means — the intent may still exist at Stripe.**

---

## Risk, and what must be verified where

| Change | Risk |
|---|---|
| `onAppResume` × 2 | **Low.** One extra fetch per foreground, dropped by the in-flight guard if a read is outstanding. ⚠️ **But it fires on EVERY resume on a live board** |
| menu 20s / manage 30s / heartbeat 10s | **Low-medium.** 🔴 **The risk is a legitimately slow run being cut** — the numbers are reasoned from round-trip counts, **not measured against production timings** |
| action / orders-submit explicit 300 | **None** — same value, now documented |

### Must be on hardware

- 🔴 **T1 — the resume itself.** Background the tablet, place an order from another device, foreground.
  **The board must show it immediately, not after up to 60s.** ⚠️ **A suspended `setInterval` may also
  fire on resume; T1 is what distinguishes "the fix worked" from "the timer happened to tick".** Check
  the network panel for **one** request, not two.
- **T2 — resume mid-poll.** Foreground repeatedly during a slow load: **never two concurrent
  `/api/dashboard` requests.**
- **T3 — resume while degraded.** Backend 503, background, foreground: **board kept, bar shown, no error
  screen.**
- **T4 — the KDS**, same as T1.
- **T5 — heartbeat at 10s** on a real connection: no 504s in the Vercel log over a service.

### The laptop settled

The Stripe floor (SDK read), the customer-visible 504 string (Node parse), the in-flight guard's
behaviour (source), and that all six routes now carry an explicit ceiling.

---

## What I could not establish

1. 🔴 **That the resume wiring fires at all.** **No device.** T1/T4 are the tests.
2. 🔴 **That 20s / 30s / 10s are above real production timings.** **Reasoned from round-trip counts, never
   measured.** ⚠️ **`/api/dashboard`'s own comment estimates ~750ms healthy for ~15 round trips; I applied
   the same arithmetic to routes I have not timed.** **The Vercel duration logs would settle it in
   minutes and I recommend checking them before deploy.**
3. **Whether a platform 504 body is HTML on every Vercel error class** — I established the parse failure
   from a representative HTML body, not from a captured production 504.
4. **Whether anything else on the `action` route reaches Stripe** beyond capture and refund — I traced the
   imports, not every handler.
