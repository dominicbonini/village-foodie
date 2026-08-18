# A provisional id lost on the fallback-to-queue path — and the freeze on the same order

**DIAGNOSIS ONLY. Nothing was changed** except this report. No build was run.

🔴 **THE HYPOTHESIS IN STEP 2 IS CONFIRMED, FROM SOURCE, AND THE CODE ALREADY DOCUMENTS IT AS INTENDED.**
The op is enqueued **without** a provisional while the screen **mints and shows one**. They are two
different expressions. `41` and `N42` differ for exactly this reason and nothing else.

⚠️ **BUT THE FREEZE IS NOT WHAT IT LOOKS LIKE, AND I AM REPORTING AGAINST THE OPERATOR'S SUSPICION.** An
unbounded `await` does **not** block the main thread in JavaScript, and the banners do no synchronous
work. See §5–§7 — that part is **INFERRED**, and I say what would settle it.

---

# Phase 1

## 1 · Every site that mints a provisional, and every site that decides whether to send one

**Mint site A — the value that will be SENT** (`components/dashboard/AddOrderPanel.tsx`):

```tsx
      const provisional = isOnline() ? '' : await nextProvisionalId(manualEvent?.id ?? null)
```
**Gate: `isOnline()`.** Online ⇒ **empty string**, no mint. **READ.**

**Mint site B — the value that will be DISPLAYED** (same file, ~90 lines later, inside `if (result.queued)`):

```tsx
        const displayId = provisional || await nextProvisionalId(manualEvent?.id ?? null)
```
**Gate: `provisional` being falsy.** Empty ⇒ **mints a fresh one**. **READ.**

**The decision to send** — the body, and the gate call:

```tsx
        provisional_id: provisional || null,
```
```tsx
      const result = await gatedAction({
        url: '/api/dashboard/action',
        kind: 'create', order_key: orderKey, provisional_id: provisional, online: isOnline(),
        body: { token, pin, action: 'manual', manualOrder },
      })
```

🔴 **Both the body's `provisional_id` and the gate's `provisional_id` are the SAME `provisional` variable —
the one that is `''` whenever `isOnline()` was true at body-build time.**

## 2 · 🔴 THE CENTRAL QUESTION — the enqueue-on-failure path, in full

```ts
  const queue = async (): Promise<GateResult> => {
    const queuedBody = { ...body, placed_offline: true, ...(expectedFrom ? { expected_from: expectedFrom } : {}), ...(queuedExtra ?? {}) }
    await enqueue({ kind, order_key, url, body: queuedBody, provisional_id })
    return { ok: false, queued: true, provisional_id, order_key }
  }

  // Native + known-offline → don't burn a timeout, queue immediately.
  if (isNativeApp() && online === false) return queue()

  try {
    const res = await post(url, body)
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, queued: false, status: res.status, data, provisional_id, order_key }
  } catch {
    if (isNativeApp()) return queue()
    return { ok: false, queued: false, order_key }
  }
```

**`queue()` faithfully forwards whatever `provisional_id` it was given. The gate is not the defect.**
🔴 **The defect is that it was given `''`** — because the caller decided at **body-build time**, on
`isOnline()`, and the failure happens later.

### 🔴 SAID EXPLICITLY, AS THE BRIEF ASKS

**YES. On the fallback-to-queue path the op is enqueued WITHOUT a provisional while the SCREEN ALREADY
SHOWS ONE.** The queued body carries `provisional_id: null`; the server therefore takes the adopt-path's
`else` branch and calls the atomic counter; the card on screen shows `N41`, minted purely for display and
sent nowhere. **READ.**

⚠️ **AND THE CODE KNOWS. This is a documented, deliberate asymmetry, not an unnoticed bug** — the comment
immediately above the display mint says so:

```
        // ⚠️ THE ROUTE-2 NUMBER IS DISPLAY-ONLY, AND THAT ASYMMETRY IS DELIBERATE. The body was built at
        // :1039 and is already in the outbox carrying `provisional_id: null`, so on replay the server
        // assigns an ordinary sequential number — a route-2 order shows 'N8' now and '#7' after sync,
        // where a route-1 order keeps its N permanently. Changing that would mean rewriting a queued
        // payload, which is the outbox's business and out of scope here.
        // 🔴 NOTHING HERE IS LOAD-BEARING. `order_key` (minted at :1030) is the identity key and is
        // untouched; `id` is the human display number and is never a lookup key.
```

🔴 **"NOTHING HERE IS LOAD-BEARING" WAS TRUE WHEN IT WAS WRITTEN AND IS FALSE NOW.** It was written while
the server renumbered *every* offline order on sync, so a display-only N-number cost nothing. **Adopting
the provisional verbatim made the displayed number a promise to a customer** — and this path is the one
place that promise is not kept. **The comment is now the record of a decision that a later change
invalidated, and nothing re-examined it.**

## 3 · Displayed vs sent — two expressions, not one

| | Expression | Value when `isOnline()` was true |
|---|---|---|
| **SENT** | `const provisional = isOnline() ? '' : await nextProvisionalId(…)` | `''` → body carries `null` |
| **DISPLAYED** | `const displayId = provisional \|\| await nextProvisionalId(…)` | **a freshly minted `N41`** |

🔴 **Two expressions, evaluated at different times, with different gates.** **READ.**

⚠️ **And the display mint CONSUMES a device sequence value.** `nextProvisionalId` writes the per-event key.
So `N41` burned sequence 41 for a label that was discarded — which is why the next order minted **N42**
rather than N41. **The observed `N42` is a direct consequence of the wasted mint. READ.**

## 4 · `isOnline()` and its lag — the mechanism, named not estimated

```ts
export function isOnline(): boolean { return online }
```

**A cached module-level boolean.** Its updater (`lib/native/reachability.ts`):

```ts
const PING_URL = '/api/ping'
const INTERVAL_MS = 10_000
const TIMEOUT_MS = 3_000
const FAIL_THRESHOLD = 3   // consecutive failures (~30s) before declaring OFFLINE — debounces blips
const OK_THRESHOLD = 1     // one success flips back to ONLINE (fast recovery → prompt replay)
```

```ts
async function check() {
  const ok = await ping()
  if (ok) {
    consecutiveOks++; consecutiveFails = 0
    if (!online && consecutiveOks >= OK_THRESHOLD) { online = true; emit() }
  } else {
    consecutiveFails++; consecutiveOks = 0
    if (online && consecutiveFails >= FAIL_THRESHOLD) { online = false; emit() }
  }
}
```

🔴 **THE LAG, FROM THE CONSTANTS: `isOnline()` keeps returning `true` for THREE consecutive failed checks
on a 10-second interval — roughly 30 seconds, and up to ~33 s counting the third check's 3-second
timeout.** A `@capacitor/network` down event forces an immediate check but **does not itself flip the
flag** — it still has to fail the threshold. **READ**, from the constants; I did not estimate.

⚠️ **`isOnline()` is deliberately a debounced BANNER signal**, and the module says so: *"the true source of
offline-for-a-WRITE is the reactive gate (a failed mutation enqueues immediately); this module drives the
BANNER + the online↔offline TRANSITIONS."* 🔴 **The panel uses it as the source of truth for whether to
mint a number — a purpose it was explicitly not built for.**

**This is the ~30-second window in which order 41 was placed. INFERRED**, but it is the only reading that
fits: `41` was placed at 21:36:32 with a stale-true `isOnline()`, `N42` at 21:37:40 once the flag had
flipped. **68 seconds apart — comfortably more than the threshold.**

## 5 · 🔴 THE FREEZE — and I do not think it is a freeze

**The submit path:**

```tsx
    setLoading(true)
    setSubmitting(takePaymentRef.current ? … : 'plain')
    try {
      …
      const result = await gatedAction({ … })
```

**`post()` has no timeout and no `AbortController`:**

```ts
async function post(url: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
```

🔴 **READ: an `await` on a pending `fetch` does NOT block the main thread.** It yields to the event loop;
rendering, scrolling and taps keep running. **An 83-second unbounded fetch cannot, by itself, make a
WKWebView unresponsive.** That is a property of the language, not of this codebase.

**What it DOES do — INFERRED, and it explains the report without a thread stall:**

`setLoading(true)` runs before the await and is not cleared until the `finally`. Every control in the panel
is gated on it:

```tsx
            disabled={loading || !hasItems || !manualEvent}
```

**Seven such controls. READ.** So for the entire 83 seconds the panel's buttons are disabled and the
submit shows a busy state. 🔴 **To an operator that is indistinguishable from a frozen iPad, and there is
no timeout, no progress and no cancel.** **The device was almost certainly responsive; the PANEL was
locked.**

**CANNOT DETERMINE** whether anything genuinely stalled the main thread — that needs a profile or a
Safari-inspector trace at the time. **What would settle it:** repeat with the Web Inspector attached and
watch for long tasks, or simply try scrolling the orders list while the submit is pending. **If scrolling
works, it is the lockout, not a freeze.**

## 6 · The banners — the operator's suspicion, tested rather than assumed

**Tested, and I do not find support for it.**

- `OfflineBanner` mounts a **5-second `setInterval`** that calls `refreshCounts()` → `countPendingOps()`
  → a `Preferences.keys()` read. **Asynchronous**, off the main thread's critical path.
- `onReachabilityChange` fires a callback that awaits `countPendingOps()` and `drainOutbox()` — **all
  async**. No synchronous loops.
- `useOutboxConflicts` runs its own **5-second `setInterval`**. Same shape.
- The banner renders a **static `<div>`** with a class string — **no animation, no transition, no layout
  thrash. READ.**
- 🔴 **Neither banner touches the orders list.** They set their own local state (`queued`, `phase`,
  `conflicts`). **They cannot trigger an orders re-render. READ.**

⚠️ **The one honest caveat:** these are React state updates on a page that also renders the orders grid,
so a re-render of the banner's parent would re-render siblings. **CANNOT DETERMINE** whether the parent
memoises. But the interval fires every 5 s **all the time**, not only during an offline transition — **so
if that were the cause, the iPad would be unresponsive continuously, which it is not.** That argument
refutes the suspicion more strongly than the code reading does.

## 7 · Anything else that can block the main thread

**Nothing found on the submit or drain path.** Every step is `await`ed I/O: `Preferences` reads/writes,
`fetch`, `JSON.parse`. **The only CPU work is `JSON.stringify` of one order body — microseconds. READ.**

⚠️ **`listOps()` reads every op key sequentially** (`Preferences.keys()` then a `get` per key). At the
observed queue depth of one or two this is nothing; **at hundreds of ops it would be many awaits, still
non-blocking but slow.** Not a factor here.

---

# Phase 2 — stop conditions

**The evidence SUPPORTS the step-2 hypothesis and I am reporting it as confirmed.** ⚠️ **It does NOT
support the freeze hypothesis as stated**, and §5–§6 say so plainly rather than making the reading fit.
No instruction contradicted another; no span arrived garbled.

---

# Phase 3 — proposed, NOT built

## Defect 1 — the provisional is decided too early 🔴 the real one

**Smallest fix: mint at ENQUEUE time when an op arrives without one.** In `gatedAction`'s `queue()`, if
`provisional_id` is empty and `kind === 'create'`, mint one there and use it for **both** the enqueued op
and the returned `GateResult`.

**Touches:** `lib/native/orderGate.ts` — `queue()` only. It would need the event id, which it does not
currently receive, so `gatedAction`'s options gain one field and the panel passes `manualEvent?.id`.

✅ **Why this is the right seam:** `queue()` is the single place every queued body passes through — the
file already argues exactly that for `placed_offline`: *"an order queued because reachability flipped
AFTER its body was built … is stamped just the same."* **The same reasoning applies verbatim to the
number, and was not extended to it.**

⚠️ **It must also rewrite `body.provisional_id`**, not just the op field — the server reads the body. That
is the "rewriting a queued payload" the old comment declined as out of scope. **It is one key on an object
that has not yet been persisted, so the objection is weaker than it reads.**

## Defect 2 — no timeout on the live submit or in `post()`

**Smallest fix: `AbortSignal.timeout(n)` on both `fetch` calls.** A live submit that has not answered in
~10 s is offline for practical purposes; aborting makes it `throw`, which lands in the `catch` that
already queues correctly.

**Touches:** `lib/native/orderGate.ts` — `post()`, and the live attempt if it is to have a different
budget. ✅ **This also un-wedges the drain**, which is the separate defect already recorded.

⚠️ **Choosing the timeout is a real decision, not a detail:** too short and a slow-but-working uplink
queues orders that would have landed; too long and the operator waits. **The drain and the live submit may
want different values.**

## Defect 3 — should the label ever be minted before the sent value is decided?

🔴 **No, and this is the structural version of Defect 1.** With the mint moved into `queue()`, the display
mint disappears: `displayId` becomes `result.provisional_id`, which is by then the real one.

**Touches:** the panel's display line only — it becomes a read of the gate's result rather than a second
mint. ✅ **This also stops the wasted sequence consumption** that produced the `N41`/`N42` gap.

⚠️ **What I would NOT do:** mint eagerly for every order, online or not. That would burn a device sequence
number per online order for no reason.

---

# Phase 4 — honesty

| Claim | Status |
|---|---|
| The op is enqueued without a provisional while the screen shows one | ✅ **READ** — two expressions, quoted |
| The code documents the asymmetry as deliberate | ✅ **READ** |
| `queue()` forwards `provisional_id` faithfully | ✅ **READ** — the gate is not the defect |
| `isOnline()` lags ~30 s (3 × 10 s), up to ~33 s | ✅ **READ** from the constants |
| Order 41 was placed inside that window | ⚠️ **INFERRED** — fits the 68 s gap and nothing else does |
| The display mint consumes a sequence value, explaining `N42` | ✅ **READ** + arithmetic |
| An unbounded `await` does not block the main thread | ✅ **READ** — language semantics |
| The perceived freeze is the panel's `disabled={loading…}` lockout | ⚠️ **INFERRED** |
| The banners are not the cause | ⚠️ **INFERRED**, and argued from the 5 s interval running always |
| Anything genuinely stalled the main thread | 🔴 **CANNOT DETERMINE** |

🔴 **Nothing here was exercised.** No device, no submit, no drain. `next dev` / `next build` not run; no
typecheck is offered as verification.

**Observations that would settle the open points:**
1. **Was it a lockout or a stall?** Attempt to scroll the orders list while a submit is pending. Scrolling
   works ⇒ lockout.
2. **Was `isOnline()` stale-true for order 41?** Not recoverable after the fact — the flag is in-memory
   with no logging. **A one-line log at the mint site would make the next occurrence self-evident.**
3. **Did the live POST hang or fail fast?** `last_error` on the op would say, but the op drained and was
   deleted. **Only the dev inspector, before the drain, can catch it.**

---

# Phase 5 — integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

**Result: zero NUL bytes and zero other flagged control bytes.** Counts, the non-ASCII census and the
per-base carrier-aware variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
