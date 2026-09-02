# Outbox write loss on a degraded backend — fixed and measured

**Built. NOT deployed, NOT committed. No SQL, no migrations.**
**One file changed: `lib/native/orderGate.ts` (+69 −8).**

---

## VERIFICATION — 🔴 MEASURED, NOT REASONED

**What I performed: EXECUTION.** A harness runs the **real `orderGate.ts` and `outbox.ts`** (copied
verbatim, only their import specifiers rewritten) under Node with `--experimental-strip-types`, against
an in-memory `Preferences` stub and a scripted `fetch`. **The same ten cases were run against the
pre-change file and the post-change file.**

| | BEFORE (`e734989`, live) | AFTER |
|---|---|---|
| **Failing cases** | 🔴 **6** | ✅ **0** |

> **The suite fails on the shipped code.** It is not a "nothing changed" test.

**Sanity only, NOT verification:** `npx tsc --noEmit` exit 0.
🔴 **No device, no emulator, no real network. Everything below is the module under stubs.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 1 · The classification, and why

**`isRetryableFailure()` — `lib/native/orderGate.ts:56`.** Consulted at the live write (`:347`) and in
the drain (`:425`).

### RETRYABLE → QUEUE. *"The request was fine; the server could not serve it."*

| Class | Line | Reasoning |
|---|---|---|
| **`retryable: true` in the body** | `:57` | 🔴 **The server's EXPLICIT contract, honoured above any status guess.** `app/api/dashboard/action/route.ts:194-198` already returns exactly this with a 503 and `Retry-After: 10` |
| **5xx (500/502/503/504)** | `:58` | A verdict on the SERVER, not the request. The same bytes succeed later |
| **408, 429** | `:59` | A timeout or a rate-limit is a *"not now"*, never a *"not ever"* |
| **Thrown fetch** (network/DNS/TLS/abort) | `:349-351` | Unchanged — it never reached a server that could judge it |

> 🔴 **THE ROUTE ALREADY ASSUMED THIS.** `action/route.ts:191-193`: *"503 IS RETRYABLE… **The client's
> gate already queues a write it could not deliver**"*. **It did not.** This change makes that sentence
> true.

### TERMINAL → DO NOT QUEUE. *"A verdict on the request itself."*

| Class | Reasoning |
|---|---|
| **400 / 422** | Malformed. Replay produces the same rejection for ever. The route has **40 distinct 400s** |
| **403** | Authorisation refused — a decision, not a failure |
| **404** | No such order (9 sites) |
| **409** | Already its own branch (`:422`) → `conflict`, flagged for operator review, never overwritten |
| 🔴 **401** | **Terminal — and safe ONLY because of the status split.** The write route now answers **503** for *"could not check"* (`:194`) and reserves 401 for **bad_pin** (`:201`) and **unauthorised** (`:203`) — decisions it actually made. ⚠️ **Before that split a 401 could mean a dead database and queueing it would have been correct. If the split is ever collapsed, this line becomes wrong** — recorded in the code comment |

### The one judgement call I am flagging rather than burying

⚠️ **429.** I classified it retryable. It is retryable by definition, and `proxy.ts` exempts operators
from the limiter, so an operator write should rarely see one. **But queueing a rate-limited write means
the drain retries into a limiter.** The break-on-first-failure fix (§2) bounds it to one post per
backoff cycle. **If you would rather a 429 surface immediately, it is one line at `:59`.** **I did not
treat it as ambiguous enough to stop, and I am naming it so you can overrule.**

---

## 2 · The drain

**`:425-435`.** A retryable HTTP failure now does what a thrown fetch has always done:

```ts
} else if (isRetryableFailure(res.status, data)) {
  if (tooOld) { …conflict; continue }
  await saveOp({ ...syncing, attempts: priorAttempts, state: 'pending', last_error })
  break                                   // ← stops the drain
}
```

**What stops one drain saturating a degraded route, in order:**

1. 🔴 **Break on the first retryable failure** (`:435`) — **new.** A 5xx says the *server* is failing, so
   every op behind it fails identically. Previously this branch set `pending` and **continued**, posting
   the whole queue, each op with its own 30s timeout.
2. **Serialisation** (`drainInFlight`, unchanged) — concurrent calls coalesce.
3. **Backoff between drains** (`OfflineBanner.tsx:67`, unchanged) — 5/10/20/40/60s cap.

**What happens to the remaining items:** 🔴 **nothing at all.** They are never posted, never touched,
never counted. They stay `pending` in the order they were queued, and the next drain starts from the
head. **Measured: `posts === 1` for a five-op queue (case D).**

---

## 3 · 🔴 The dead-letter threshold

**`MAX_ATTEMPTS = 5` was the wrong instrument, not the wrong number.** Five drains at 5/10/20/40/60s
backoff is **~135 seconds**. 1 September ran **over two hours**.

### Count-bounded or time-bounded? — **Neither. CLASS-bounded, with time as the backstop.**

| | |
|---|---|
| 🔴 **A retryable failure now burns NO attempt** | `attempts` is restored to its pre-try value (`:413`, `:434`). It counts **terminal answers only**, so an outage — of any length — **cannot exhaust it** |
| **`MAX_ATTEMPTS = 5` is UNCHANGED** (`:33`) | It now guards only what it was for: a genuinely poisonous op that keeps getting a terminal answer |
| **`MAX_QUEUE_AGE_MS = 12h`** (`:71`) | The sole backstop that stops an undeliverable op retrying for ever. **12h is longer than any plausible outage and shorter than the gap between services** |

⚠️ **`client_ts` is documented in `outbox.ts:76` as "display only — NEVER used for reconciliation".** I
use it as a **local retry deadline**, which is not reconciliation — nothing about server ordering or
conflict resolution reads it. **Stated here because the comment is emphatic and I am knowingly reading
that field.**

### What happens to an item that exceeds it — 🔴 IT IS NEVER DISCARDED

**It moves to `state: 'conflict'` and the record stays on the device.** `conflict` is not a dev-only
state: `components/native/OfflineBanner.tsx:125-150` renders it as a **red, full-width, two-step-dismiss
banner** — *"⚠ PAYMENT NOT RECORDED … marked as paid on this device, but the server rejected it"* for
money, and a status banner otherwise, with *"The record is kept on this device either way."*

> **Measured (case G): an op backdated 13 hours becomes `conflict` and is STILL STORED — `{n:1,
> state:'conflict'}`. Nothing is deleted, at any point, on any path.**

⚠️ **ONE COPY DEFECT THIS EXPOSES, WHICH I DID NOT FIX:** the conflict banner says *"the server rejected
it"*. **After 12h of failed delivery that is false — the server never answered.** The banner needs a
second wording for the age-bound case. **Out of scope; flagged.**

---

## 4 · The stale-but-valid 200 — 🔴 SEPARATE, AND NOT FIXED HERE

**Out of scope, and I have not touched it.** It lives in the READ path
(`app/dashboard/[token]/page.tsx:980`, `kds/page.tsx:622`); this change is entirely in the WRITE path.

**The risk, stated plainly:** a backend that answers 200 with stale rows is **accepted silently and
CLEARS the degraded banner**. There is no max-age, no server timestamp check and no staleness test
anywhere on that path. **The operator is shown a board that looks current, with no amber strip, and
nothing anywhere says otherwise.** It is the only failure mode in the review with **no signal at all** —
worse than the one fixed here, because the fixed one at least failed loudly.

---

## 5 · What the operator sees, stage by stage

| Stage | What is shown | Where | Honest? |
|---|---|---|---|
| **Write queued** | Toast: *"Order #A13 saved"*, with **↩ Undo** for 7s | `useGatedActionResult.tsx:162-164` | ✅ **Yes.** `enqueue()` is **awaited before the result returns** (`:293`), so it is durably in Preferences before the word "saved" appears |
| **Queue waiting, device offline** | *"📴 Offline — N changes saved on this device, will sync when you're back online."* | `OfflineBanner.tsx:181` | ✅ Yes — "on this device" is the true claim |
| **Draining** | *"Back online — syncing N changes…"* | `:187` | ✅ Yes |
| **Drained** | Synced count | `:190-196` | ✅ Yes |
| ⚠️ **Queued while ONLINE** (the new case: ping green, backend degraded) | *"N changes saved on this device, syncing…"* | `:197-201` | ⚠️ **Accurate but optimistic.** It says "syncing…" while the drain has broken and is backing off. **Not a false "saved" promise — the data IS stored — but it does not convey "the server is unwell".** Flagged, not fixed |
| **Cannot be delivered** (409, terminal 4xx ×5, or 12h) | 🔴 Red banner, two-step dismissal, order named | `:125-150` | ✅ Loud and actionable — see the §3 wording caveat |

> 🔴 **Nothing in this change tells an operator something is saved before it is durably stored.** The
> manual records that false promise as a shipped defect (the SW's old fake `{ok:true, queued:true}`); the
> ordering here — `await enqueue(...)` **then** return — is what keeps it true.

---

## 6 · What changes on a HEALTHY backend

> ✅ **Nothing. Measured.**

- **A successful write** (`res.ok`) takes the **same line as before** (`:348`) — the new guard is
  `if (!res.ok && …)`, so it cannot be reached on success. **No provisional id is minted, nothing is
  enqueued, the toast is unchanged.**
- **A terminal rejection** (400/401/403/404/409) returns exactly as before — **case C measured: a 400 is
  NOT queued, on both BEFORE and AFTER.**
- **A 409 in the drain** is still a conflict — **case H measured, identical on both.**
- **Web is untouched, byte for byte.** The queue branch is `isNativeApp() &&` guarded (`:347`) — **case I
  measured: on web a 503 does NOT queue and stores nothing.** Web has no durable outbox, and promising
  storage that does not exist is the one thing this file must not do.

⚠️ **The wrongly-queued cost is unchanged and still real:** a write that *would* have succeeded but got a
5xx now takes a provisional number, which the manual records as having once renumbered a customer's
ticket (N41 → 41). **That trade is deliberate: a renumbered ticket is recoverable, a lost order is not.**

---

## 7 · 🔴 THE MEASUREMENT

**Harness:** `…/scratchpad/harness/` — the real modules, an in-memory `Preferences`, a scripted `fetch`,
run under `node --experimental-strip-types`. **Session-scoped; it is not added to the repo.**

### How the failing cases were produced

- **A fast 5xx:** `fetch` returns `503 {error:'Service unavailable', retryable:true}` — the exact body
  and status `action/route.ts:194-198` emits.
- **An upstream gateway timeout:** `fetch` returns a promise that **never settles**, rejecting only when
  the caller's own `AbortSignal` fires — so the 5s live / 30s drain deadline is what ends it, exactly as
  a gateway hang does. ⚠️ **`AbortSignal.timeout` does not hold Node's event loop open; the harness keeps
  it alive deliberately, or the case would silently not run.**
- **The drain cases seed the outbox DIRECTLY** rather than through the gate — otherwise on BEFORE nothing
  queues (case A fails first) and there would be no queue to drain, proving nothing about the loop.

### Results

| Case | What it forces | BEFORE (live) | AFTER |
|---|---|---|---|
| **A** | Live write, **503** | 🔴 **FAIL — not queued. The write is lost** | ✅ queued |
| **B** | Live write, **gateway hang** | ✅ queued (the 5s abort throws) | ✅ queued |
| **C** | Live write, **400** | ✅ not queued | ✅ not queued |
| **D** | One drain, 5 queued ops, **503** | 🔴 **FAIL — `posts = 5`**, whole queue posted; `attempts` → `[1,1,1,1,1]` | ✅ **`posts = 1`**, `attempts` → `[0,0,0,0,0]` |
| **E** | **Sustained outage — 10 drains** | 🔴 **FAIL — `{pending:0, conflict:5}`. Every write dead-lettered** | ✅ **`{pending:5, conflict:0}`** |
| **F** | **Recovery** — backend returns | 🔴 **FAIL — `synced:0`. Nothing left to deliver** | ✅ **`synced:5, remaining:0`** |
| **G** | Op backdated **13h** | 🔴 FAIL — stays `pending` for ever | ✅ `conflict`, **still stored** |
| **H** | Drain, **409** | ✅ conflict | ✅ conflict |
| **I** | **Web**, 503 | ✅ not queued, nothing stored | ✅ not queued, nothing stored |
| | **TOTAL** | 🔴 **6 FAILING** | ✅ **0 FAILING** |

> **E and F together are the fault as reported: a queue that existed, was destroyed by the outage, and
> had nothing to deliver when the backend came back.**

---

## 8 · Scope — the three exclusions honoured

| | |
|---|---|
| Cached menu / stock snapshot | ✅ **NOT built** |
| Reachability model (`lib/native/reachability.ts`) | ✅ **UNTOUCHED** — verified by `git diff` |
| `maxDuration` on the other four routes | ✅ **UNTOUCHED** — no file under `app/api` changed |
| `public/sw.js` | ✅ **UNTOUCHED** |
| **Files changed** | 🔴 **`lib/native/orderGate.ts` ONLY** |

✅ **Nothing here required touching any of them, so there is no contradiction to raise.**

---

## 9 · Verification runbook — tablet vs laptop

### 🔴 The physical Android tablet settles these, and a laptop cannot

The harness stubs `@capacitor/preferences`. **Everything about real device storage is unmeasured.**

| # | Test | Pass condition |
|---|---|---|
| **T1** | 🔴 **Real Preferences durability.** Queue 3 writes against a forced 503, **force-quit** the app, relaunch | All 3 still queued; counter shows 3 |
| **T2** | 🔴 **The frozen-object crash.** `orderGate:347-349` records ops deserialising **readonly** on-device, which crashed the whole drain on the first op. **My change writes `{ ...syncing, attempts: priorAttempts }` on two new paths** — copy-on-write, but **only a device proves it** | Drain completes, no crash |
| **T3** | **Degraded-backend drain.** Point the tablet at a build whose write route returns 503; queue 5; watch | **One POST per backoff cycle** (5/10/20/40/60s), not five |
| **T4** | **Recovery.** Restore the route | All 5 sync, banner clears, orders appear on the board |
| **T5** | **Backgrounding.** Queue, background 10 min, foreground | Queue intact, drain resumes |
| **T6** | **The operator-facing copy at arm's length**, in daylight, on the tablet | Banner legible; no screen claims "synced" while queued |

**How to force the 503 without a deploy:** run the dev server on the LAN and add a temporary early
return in `action/route.ts` — ⚠️ **a local-only edit, reverted before any deploy, and NOT part of this
change.**

### The laptop already settled these

Classification (A/B/C), break-on-first-failure (D), no dead-lettering across 10 drains (E), recovery (F),
the 12h bound (G), 409 (H), and web-unchanged (I) — **all measured above.**

---

## What I could not establish

1. 🔴 **Any on-device behaviour.** **No tablet, no emulator.** T1-T6 are open.
2. **That 12h is the right bound.** It is a judgement — long enough for any outage seen, short enough to
   surface within a day. **Nothing measured it.**
3. **What a real outage's queue depth is**, so how long one-post-per-backoff takes to drain a real
   backlog is unknown. ⚠️ **At 60s backoff a 20-op queue needs 20 cycles — worth watching in T3/T4.**
4. **Whether any other caller depends on a 5xx being returned rather than queued.** I read
   `useGatedActionResult.tsx`'s `result.queued` branch (`:141`); **I did not audit every call site.**
