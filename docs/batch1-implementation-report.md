# Batch 1 — implementation report

**Date:** 1 September 2026 · **Committed:** nothing · **Deployed:** nothing · **Migrations/SQL:** none.

---

## 🔴 R1 STOPPED ON ITS OWN PRECONDITION — AND R2/R3 WITH IT

**You asked me to enumerate every consumer first and STOP if any treats a non-401 as fatal. One does.**

**Implemented: R4, R5, R6, R7.**
**Held: R1, R2, R3 — awaiting your decision.**

---

## R1 PRECONDITION — every consumer of `GET /api/dashboard`

**Five consumers. Established by searching `app/`, `components/`, `lib/`, `public/`, `scripts/` for
`/api/dashboard`, excluding `/api/dashboard/action` (a different POST route), then reading each hit.**
**Four are `fetch` call sites; the fifth is the service worker. Every other hit was a comment or a type.**

| # | Consumer | File:line | Non-401 failure handling | Fatal? |
|---|---|---|---|---|
| 1 | Dashboard `fetchAll` | `page.tsx:936` | `if(!res.ok){ authenticated ? warn+keep state : setError }` | **Only before first auth** |
| 2 | Dashboard `submitPin` | `page.tsx:1547` | `if(!res.ok){setPinError('Incorrect PIN');return}` | No — **but mislabels** |
| 3 | 🔴 **KDS `fetchAll`** | `kds/page.tsx:563` | `if (!res.ok) throw new Error('Failed to fetch')` → catch → `setError('Could not load orders')` → `:1788 if (error \|\| !truck) return` **full-screen replacement** | 🔴 **YES — ALWAYS** |
| 4 | KDS `submitPin` | `kds/page.tsx:1389` | `if(!res.ok){setPinError('Incorrect PIN');return}` | No — **but mislabels** |
| 5 | Service worker | `public/sw.js:113` | `.catch()` fires only on a *network rejection*; a 503 **resolves**, so it passes through | No |

### 🔴 The blocker: consumer 3

**`kds/page.tsx:563` treats every non-ok status as fatal, unconditionally — including when the cook is
looking at a full board of live tickets.** There is no `authenticatedRef` equivalent on that screen and
no keep-state path. Giving it one is **R9, which is batch 2 and explicitly out of scope here.**

⚠️ **R1 would not make this worse.** Today an outage yields 401 → throw → blank. After R1 it would yield
503 → throw → blank. **Identical outcome.** But your instruction was to stop and tell you if any
consumer treats a non-401 as fatal, not to judge whether it degrades — so I stopped.

### 🔴 A second finding you did not ask for, and it changes the picture

**Both `submitPin` handlers report ANY non-ok status as "Incorrect PIN"** (`page.tsx:1547`,
`kds/page.tsx:1389`).

> **During the outage, an operator typing their correct PIN was told it was wrong.**

**R1 does not fix this — it makes a 503 say "Incorrect PIN" instead of a 401 saying it.** So the
availability/authentication conflation exists in **three** places, not one: the route, the dashboard's
401 branch, and both PIN handlers. **A status-code split that stops at the route leaves two of the three
standing.**

### Why R2 and R3 are held too

- **R2 is held by your own constraint:** *"R1 and R2 ship together or not at all."*
- **R3 is held because it has the same effect as R2 in the dimension the constraint protects.** Once
  authenticated, the only thing that sets `error` on the dashboard is the 401 branch at `:927`. So
  making the render gate non-fatal (R3) produces keep-state on a 401 — **which is exactly R2's
  revocation weakening, arriving by a different route.** Shipping R3 alone would honour the letter of
  the constraint and defeat its purpose.

⚠️ **I have not shipped R3 and I am not deciding this for you.** If you want R3 alone, say so and I will
apply it — but I would be shipping the revocation trade without the server split that removes it.

### The decision in front of you

| Option | Effect |
|---|---|
| **A — R1+R2+R3 now, KDS stays fatal** | Dashboard keeps its board; **KDS still blanks** (R9 is batch 2). Half the fix. |
| **B — pull R9 forward into this batch** | Both surfaces keep state. **Exceeds the batch you authorised**, so I will not do it unasked. |
| **C — hold all three for batch 2** | Ship R4–R7 now (the amplification cut, which needs none of this) and do the status split with R9 together. |
| **D — R1 only** | Server honest; **no client benefit at all** — every consumer still blanks. |

**Currently in the working tree: R4, R5, R6, R7 only.**

---

## VERIFICATION — what I actually did

- **`npx tsc --noEmit` → exit 0**, and `node --check public/sw.js` parses. 🔴 **NEITHER IS
  VERIFICATION AND I AM NOT OFFERING THEM AS SUCH.** They are a build-breakage sanity check, because a
  broken build on a live surface is a deploy blocker. **Nothing below has been run in a browser, on a
  device, or against a degraded backend. §9 lists the tests that would actually prove it.**
- **No commit, no deploy, no migration, no SQL, no `next build`, no `next dev`.**

---

## R4 — in-flight guard *(highest value in the batch)*

### Files and lines

| File | Change |
|---|---|
| `app/dashboard/[token]/page.tsx` | **+`inFlightRef`, `READ_TIMEOUT_MS`** after `rl429RetriesRef` (`:813`); **guard** at the top of `fetchAll` (`:919`) |
| `app/dashboard/[token]/kds/page.tsx` | **+`inFlightRef`, `loadedOnceRef`, `READ_TIMEOUT_MS`** after `fetchAllRef` (`:469`); **guard** at the top of `fetchAll` (`:530`) |

```js
// dashboard
if(inFlightRef.current){ if(!forceSeed) return; inFlightRef.current.abort() }
const ctrl=new AbortController(); inFlightRef.current=ctrl
```
```js
// KDS — no forceSeed parameter exists, so the requested event IS the distinction
const scope = selectedEventId ?? ''
if (inFlightRef.current) { if (inFlightRef.current.scope === scope) return; inFlightRef.current.ctrl.abort() }
```

### 🔴 The design decision inside R4, stated because it is not what you literally specified

**"A poll that fires while one is outstanding is dropped, not queued" — implemented exactly. But a
`forceSeed` call SUPERSEDES rather than being dropped, and I want that on the record.**

`forceSeed` is the **event switch** (`page.tsx:1174`, on `selectedEventId`), plus trucks-realtime and
reconnect. **Dropping it would leave the board on the previous event for up to 60 seconds on a live
service** — a regression I was not willing to introduce silently. So it aborts the outstanding read and
takes its place: **still exactly one request in flight**, and **an operator's own action is never the
thing discarded**. The KDS reaches the same rule through its event scope, since its `fetchAll` has no
`forceSeed` parameter.

**If you would rather forceSeed were dropped too, it is a one-line change — but the board would lag an
event switch by up to a minute.**

### What the operator now sees that they did not before

**Nothing, when things are healthy** — that is the point. When the backend is slow: **the tab stops
generating a backlog.** Previously one open tab sustained ~5 concurrent 300-second invocations; it now
sustains **one**. With the dashboard and KDS both open, **~10 concurrent becomes ~2**.

⚠️ **This does not make a slow backend fast. It stops us making it slower** — the measured amplification
was ~2× (44.8s → 23.5s when clients were closed).

### The failing case that must bite

**V7 (§9).** Delay `/api/dashboard` by 60s at a proxy, leave the board open for 3 minutes, count
requests in the network trace. **Before: ~3 outstanding. After: never more than 1.** 🔴 **The test fails
if you count zero requests — that means nothing ran, not that the guard works.**

---

## R5 — 10s abort, abort on unmount

### Files and lines

| File | Change |
|---|---|
| `page.tsx` | `setTimeout(()=>ctrl.abort(),READ_TIMEOUT_MS)`; `signal:ctrl.signal` on the fetch (`:926`); rewritten `catch`/`finally` (`:1035`); unmount effect |
| `kds/page.tsx` | same; `signal` on `:552`; `loadedOnceRef.current = true` after `setTruck` (`:604`); rewritten `catch`/`finally`; unmount effect |

**`AbortController` + `setTimeout`, not `AbortSignal.timeout()`** — one signal has to carry both the
deadline **and** R4's supersede. Same pattern as `lib/native/reachability.ts`, which already does this.

### 🔴 "An abort is not reported as a failure when a retry follows" — and only then

**The qualifier is load-bearing and I checked it rather than assuming it.** Both 60-second polls are
gated on `if(!truck?.id) return` (`page.tsx:1181`, `kds/page.tsx:1021`), **so the poll exists only after
a first successful load.** Therefore:

| | Behaviour |
|---|---|
| **Aborted, already authenticated** | `console.warn`, **board kept, operator told nothing** — the poll retries in 60s |
| **Aborted, not yet authenticated** | `setError('Connection error')` — **exactly as before**, because **no retry follows** and silence would leave a spinner up for ever |

**The test is `ctrl.signal.aborted`, not the thrown value** — `abort()` rejects with a DOMException whose
shape I would otherwise be trusting.

⚠️ **KDS scope kept deliberately narrow.** I changed **only** the abort case. A 401, a non-ok status and
a thrown fetch all still reach `setError('Could not load orders')` unchanged. **I did not give the KDS a
general keep-state path — that is R9, batch 2.**

### What the operator now sees

**First load against a dead backend: "Connection error" after ~10 seconds instead of a spinner for
~300.** **Already-loaded board: unchanged on screen, no new message.** ⚠️ **On the KDS an abort now
leaves the board up where before it eventually blanked** — a genuine improvement, but **only for
aborts**; a 503 or 401 still blanks it until R9.

### The failing case that must bite

**V1 + V5.** Proxy-delay `/api/dashboard` to 60s **after** the board has loaded. **Dashboard and KDS both
keep their orders; a `[fetchAll] … aborted` warning appears at ~10s.** 🔴 **Counter-test: pull the
network before the FIRST load — "Connection error" must still appear.** If it does not, the abort
suppression has swallowed a real failure.

---

## R6 — response-ok check before the cache write

**File:** `public/sw.js:113-123`.

```js
if (res.ok) {
  const clone = res.clone()
  caches.open(DATA_CACHE).then(cache => cache.put(event.request, clone))
}
```

**What it stops:** every 401 the degraded backend produced was being written into `DATA_CACHE` **on top
of the last known-good snapshot**. The cache exists to keep orders on screen when the device is
genuinely offline — **without this line, the incident it protects against is the thing that destroys
it.**

⚠️ **THIS DOES NOT CLEAN AN ALREADY-POISONED ENTRY.** A bad entry stays until overwritten by a good
response or the cache is invalidated. 🔴 **Whether shipped devices are currently poisoned is UNVERIFIED —
it is reasoned from the Cache API spec, not observed.** Inspecting hardware is R13, batch 2.

**Operator-visible change: none today.** It protects a future offline.

**Failing case:** **V12.** Web Inspector → Storage → Cache Storage on the tablet. Force a 503, confirm
`DATA_CACHE` is **not** updated; force a 200, confirm it **is**. 🔴 **This also finally establishes
whether the service worker is active in the WebView at all — which I have never verified, and R6 is
inert if it is not.**

---

## R7 — `maxDuration = 30`

**File:** `app/api/dashboard/route.ts` — new `export const maxDuration = 30` above `GET`.

**Was:** no export at all, so the platform default of 300s applied. **Healthy full run is ~750ms**
(~15 sequential Supabase round trips at ~50ms), so **30s is ~40× headroom.**

🔴 **THIS IS NOT A FIX FOR A SLOW BACKEND AND MUST NOT BE READ AS ONE.** It decides how much damage one
slow request does before it is killed — **a 10× cut in slot-time per failed attempt.**

⚠️ **Not applied to the routes that legitimately run long** — `demo` (300), `webhooks/stripe` (300),
`payments/return` (300) each carry their own export and are untouched.

**What the operator now sees:** a hard failure at ~30s instead of ~300s. ⚠️ **In practice R5's 10s client
abort fires first**, so this is a server-side backstop for callers without one.

**Failing case:** proxy-delay the route past 30s and confirm the platform kills it at ~30s, not ~300s —
**read from the Vercel function duration line, not from the browser.**

---

## Constraints — how each was honoured

| Constraint | Evidence |
|---|---|
| **Change nothing outside the seven items** | `git status`: **4 files** — `route.ts`, `page.tsx`, `kds/page.tsx`, `sw.js`. ⚠️ `docs/reference-manual.md` is also modified, **from the earlier V11.55 delta task, not this one.** |
| **Do not alter the outbox, orderGate, reachability, or any offline mechanism** | `git diff --quiet` confirms **untouched**: `reachability.ts`, `orderGate.ts`, `outbox.ts`, `network.ts`, `useOfflineAlert.ts`, `OfflineBanner.tsx` |
| **R1+R2 together or not at all** | **Neither shipped.** `git diff` shows no `+`/`-` on any line containing `Invalid token`, `Invalid access link` or `Access denied` |
| **Never tell an operator something is saved unless durably stored** | **No new "saved" message was added anywhere.** R4/R5 only *suppress* a misleading failure; they never claim success. The only new operator-visible strings are two `console.warn`s, which no operator sees. |
| **Commit nothing** | Nothing committed. |

### 🔴 "Preserve the web path byte-for-byte where a change is native-relevant" — how I established it

**I did not need to preserve anything, because none of these four changes has a native/web branch.**
Established by reading, not assumed:

- **R4/R5 touch `fetchAll` and its `catch`.** Neither calls `isNativeApp()`, and the only native-aware
  expression on the line — `await nativeAuthHeader()` — is **unmodified**; I appended `signal` to the
  same options object. **`nativeAuthHeader()` returns `{}` on web, so the web request is identical apart
  from the abort signal, which is what R5 is for.**
- **The guard and the abort run identically on both**, deliberately: **the amplification was measured on
  two operator tablets, but a web dashboard left open does the same thing.**
- **R6 is `public/sw.js`** — the same file serves both; the shells are remote-URL and load the same
  origin.
- **R7 is server-side**, with no platform branch.

⚠️ **So the web path is NOT byte-for-byte unchanged — it changes in exactly the same way as native, on
purpose.** If you intended the web to keep its old unguarded behaviour, **say so and I will gate it** —
but I would be leaving the amplification in place on any open web dashboard.

---

## §9 — How each behaviour would be verified on a real device

🔴 **The rig is the hard part, and without it every test below passes for the wrong reason.**
`/api/ping` must stay fast while `/api/dashboard` is slow — a network-level failure tests something
else entirely.

**Rig:** an on-device proxy (Charles/mitmproxy on the tablet's wifi) with a **delay rule on
`/api/dashboard` only**. ⚠️ **`setSimulatedOffline(true)` is NOT a substitute** — it is dev-only and
tests OFFLINE, not degraded.

| # | Test | 🔴 Must bite |
|---|---|---|
| **V1** | Load the board, then enable a 60s delay | Orders **stay**; `[fetchAll] … aborted` at ~10s; **no error screen** |
| **V5** | Same, on the KDS | Tickets **stay** through an abort. ⚠️ **A 503 or 401 still blanks it — that is R9 and expected to fail** |
| **V7** | 60s delay, watch the trace for 3 minutes | 🔴 **Never more than ONE `/api/dashboard` in flight.** Counting zero means nothing ran |
| **V7b** | With a read outstanding, **switch event** | 🔴 **The board follows immediately.** Proves supersede, and catches the regression a naive drop-everything guard would cause |
| **V12** | Web Inspector → Cache Storage; force a 503 then a 200 | 503 **not** cached, 200 **is**. Also establishes the SW is active at all |
| **V-neg1** | Pull the network **before** the first load | 🔴 **"Connection error" must still appear.** Proves R5 did not swallow a real failure |
| **V-neg2** | Unmount mid-request (navigate away) | Request shows **cancelled** in the trace |
| **V-R7** | Delay past 30s | Function killed at ~30s — **read the Vercel duration, not the browser** |

**Minimum set: V1, V7, V7b, V-neg1.** Board survives · we stopped amplifying · the event switch still
works · a genuine failure is still reported.

---

## What I could not establish

1. **Whether the service worker is active in either WebView.** **R6 is inert if it is not.** (V12)
2. **Whether shipped devices hold a poisoned cache entry.** Spec-reasoned, not observed.
3. **Whether any of this behaves as written.** **Nothing has been run.** Sanity checks only.
4. **Real p50/p99 per round trip** — the 10s and 30s ceilings are reasoned from ~50ms healthy, not
   measured.
5. **Whether the KDS 60s poll is gated identically to the dashboard's** — I read `if (!truck?.id) return`
   on both, **but did not observe either firing.**

---

## Awaiting your decision

**R1, R2 and R3 are not implemented.** The precondition tripped on `kds/page.tsx:563`, and the PIN
handlers make the conflation wider than R1 alone addresses. **Tell me A, B, C or D and I will apply
it.** Nothing is committed.
