# Native client behaviour during the 1 September outage — "Access denied"

**Scope:** the client's error handling, not the server latency (that is
`docs/dashboard-incident-postmortem.md`).
**Read-only.** Nothing changed, run, deployed or migrated.

---

## VERIFICATION

🔴 **EVERYTHING IN THIS REPORT IS A SOURCE READ. NOT ONE BEHAVIOUR WAS VERIFIED IN A RUNNING CLIENT.**
I did not open the Android app, did not run `next dev`, did not open a browser, did not inspect a live
Cache Storage entry, and did not reproduce any of it. **No typecheck was run and it would prove nothing
here.** Where I state what code *does*, I mean what it is written to do. §8 lists what that leaves open.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## THE ANSWER, IN ONE PARAGRAPH

**The operator's expectation was correct and the app should have kept showing its orders.** It did not,
because of **one line on the server and one line on the client**, which together turn a database
failure into a logout:

- **Server** (`app/api/dashboard/route.ts:81`): `if (error || !truck)` returns **401 "Invalid token"**.
  **A failed `trucks` read and a genuinely invalid token take the identical branch.**
- **Client** (`app/dashboard/[token]/page.tsx:927`): `res.status === 401` → `setError('Invalid access
  link')` — **the only failure branch in the whole function that does not check whether the session was
  already authenticated.**

**The orders were still in React state at that moment. They were never discarded. An error render gate
simply replaced the page.**

⚠️ **The 504 is a red herring for this symptom.** A 504 does *not* produce "Access denied" — it is
handled correctly and preserves state. **The message the operator saw came from a 401**, which is what
the route returns when Supabase fails.

---

## 1. How "Access denied — invalid access link" is produced

**Two files. The string is assembled from two separate places.**

### The heading — `app/dashboard/[token]/page.tsx:2782`

```jsx
if(error){ … <p className="text-slate-900 font-bold text-lg mb-2">Access denied</p>
           <p className="text-slate-500 text-sm">{error}</p> … }
```

🔴 **"Access denied" is hard-coded and unconditional on `error` being truthy.** It is not an auth
decision — it is the *only* error screen this page has. **Any non-null `error`, whatever its cause,
renders the words "Access denied".** The subtitle is the `error` string.

### The subtitle — `app/dashboard/[token]/page.tsx:927`

```js
const res=await fetch(`/api/dashboard?${p}`,{headers:await nativeAuthHeader()}); const data=await res.json()
if(res.status===401){if(data.requiresPin){setRequiresPin(true);setLoading(false);return};setError('Invalid access link');setLoading(false);return}
```

**`'Invalid access link'` is set in exactly one place, on exactly one condition: `res.status === 401`
without `requiresPin`.** (Verified: one occurrence repo-wide.)

### 🔴 Can a failed, timed-out or 504 fetch reach it? — **YES, and the convergence is on the SERVER**

**Stating it explicitly as asked: a network/database failure and an invalid token converge on the same
branch, and they converge twice.**

**Convergence 1 — server, `app/api/dashboard/route.ts:74-84`:**

```js
const { data: truck, error } = await supabase
  .from('trucks').select('*').eq('dashboard_token', token).single()

if (error || !truck) {
  console.error('[dashboard] truck lookup failed:', error?.message, error?.details)
  return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
}
```

🔴 **`error` here is a PostgREST/transport error — a statement timeout, a connection failure, a 5xx from
the gateway. `!truck` is "no such token". THEY ARE THE SAME BRANCH AND THE SAME 401.** The route cannot
say "I could not check your token", only "your token is invalid".

⚠️ **Note the two are not even distinguished in the log line** — one message covers both, so the logs
would not separate them either.

**Convergence 2 — client, line 927:** having received a 401, the client cannot tell which of the two
produced it, because the body is `{error:'Invalid token'}` in both cases.

### The three paths, precisely

| What happened upstream | Route returns | Client branch | Operator sees |
|---|---|---|---|
| Token genuinely invalid | 401 | `:927` | **"Access denied — Invalid access link"** |
| 🔴 **Supabase read ERRORED** (timeout, connection) | **401** | **`:927`** | **"Access denied — Invalid access link"** ← **this is the incident** |
| Supabase read HUNG to 300s | 504 | `:936` or `:1035` | **existing state kept** (§2) |

⚠️ **`await res.json()` runs BEFORE any status check** (same line 926). On a Vercel 504, whose body is
an HTML error page, `res.json()` **throws**, so control jumps straight to the `catch` at `:1035` and the
status checks never execute. **That is why the 504 path behaves better than the 401 path — by accident,
not by design.**

---

## 2. Timeout / 5xx handling versus 401/403

**Quoted in full. There are four failure branches and only one of them misbehaves.**

### Dashboard — `app/dashboard/[token]/page.tsx`

```js
// :927  401 → HARD ERROR
if(res.status===401){if(data.requiresPin){setRequiresPin(true);setLoading(false);return};setError('Invalid access link');setLoading(false);return}

// :931  429 → RETRY with backoff, no error
if(res.status===429&&!authenticatedRef.current&&rl429RetriesRef.current<5){
  const backoff=Math.min(1000*2**rl429RetriesRef.current,8000); rl429RetriesRef.current++
  setLoading(true); setTimeout(()=>fetchAllRef.current(),backoff); return
}

// :936  any other !ok (500, 502, 504) → KEEPS STATE if authenticated
if(!res.ok){if(authenticatedRef.current){console.warn('[fetchAll] dashboard fetch failed:',res.status,'— keeping existing state')}else{setError(data.error||'Failed to load')};setLoading(false);return}

// :1035 thrown fetch / JSON parse failure → KEEPS STATE if authenticated
} catch{if(!authenticatedRef.current)setError('Connection error')} finally{setLoading(false)}
```

🔴 **THE ASYMMETRY IS THE DEFECT.** `authenticatedRef.current` is set true at `:1013` after the first
successful load. **Lines 931, 936 and 1035 all consult it. Line 927 does not.**

> **A 502 or a 504 on an authenticated session logs a warning and keeps the board.
> A 401 on the same session wipes the page — even if the operator has been working for hours.**

**The comment at `:936` — *"Transient failure after successful auth — keep existing state, never blank
the dashboard"* — states exactly the intended behaviour. The 401 branch, nine lines above, violates
it.** ⚠️ **This looks like the 401 branch simply predates the resilience work and was never revisited,
but I have not read its history and am not asserting that.**

**There is no distinct error state, no retry and no fallback render for a timeout or 5xx** — beyond
"keep what you have and log". For 401 there is no retry at all: it is terminal until reload.

### KDS — `app/dashboard/[token]/kds/page.tsx`

```js
// :555
if (res.status === 401) {
  if (data.requiresPin) { setRequiresPin(true); setLoading(false); return }
  throw new Error(data.error ?? 'Unauthorized')
}
if (!res.ok) throw new Error('Failed to fetch')            // :563
...
} catch (e) { console.error('[kds] fetchAll error:', e); setError('Could not load orders') }   // :718-719
```

**The KDS is worse in one respect and better in another.**

- **Worse: it collapses 401 AND every non-ok status into the same `throw`**, so a 504 *also* becomes an
  error screen. It has **no `authenticatedRef` equivalent and no keep-state path at all.**
- **Better: the wording is honest.** `:1788` renders `{error ?? 'Truck not found'}` — the operator sees
  **"Could not load orders"**, which is true, rather than an accusation about their access link.

⚠️ **So during this incident the two surfaces disagreed:** the dashboard said the access link was
invalid; the KDS said orders could not be loaded. **The KDS was right.**

---

## 3. Were the orders still in memory, and does the error path discard them? — **HELD, AND NOT DISCARDED**

**Answering the operator's actual question directly: yes, the orders could have stayed on screen.**

**What line 927 does on a 401:** `setRequiresPin` (not taken) · `setError('Invalid access link')` ·
`setLoading(false)` · `return`.

🔴 **IT DOES NOT TOUCH `orders`.** I searched the dashboard page for `setOrders([])` and any other clear
of that state on a failure path — **there is none.** The two `setOrders([])` calls in the codebase are
both in the **KDS** (`kds/page.tsx:634`, `:1399`) and belong to the event-scope-mismatch guard, not to
error handling.

**So at the moment the screen changed, the previously-fetched orders were still in React state,
complete and unmodified. They became unreachable purely because of a render gate:**

```
:2758   if(loading) return <Loading dashboard...>
:2782   if(error)   return <Access denied>          ← returns BEFORE the board renders
:2784   if(requiresPin && !authenticated) return <PIN>
        … the real dashboard, which reads `orders`
```

**The board is below the gate. The data was above it, in memory, the whole time.**

> 🔴 **THE ORDERS WERE NEVER LOST. THEY WERE HIDDEN BY AN ERROR SCREEN THAT SHOULD NOT HAVE RENDERED.**
> Adding `authenticatedRef.current` to the condition on line 927 — the same check the three neighbouring
> branches already make — would have left the board on screen.

⚠️ **One caveat I cannot resolve from source:** if the operator or the OS **reloaded** the WebView at any
point, React state is gone and this argument no longer applies — recovery would then depend on §4, and
§4 says nothing there could have helped either. **I do not know whether a reload occurred.**

---

## 4. Every offline mechanism on this surface, and its trigger

**For each: the trigger, and whether it could have fired. The server was reachable throughout, and that
single fact disqualifies all four.**

| # | Mechanism | File | Trigger condition | Could it engage? |
|---|---|---|---|---|
| 1 | **Reachability / offline banner** | `lib/native/reachability.ts` | **3 consecutive failures of `HEAD /api/ping`** (10s interval, 3s timeout) | 🔴 **NO. STRUCTURALLY IMPOSSIBLE.** `/api/ping` returned 200 in ~106ms. `consecutiveFails` never left 0; `online` never left `true`. See §5. |
| 2 | **Phase-1 durable outbox** | `lib/native/orderGate.ts`, `outbox.ts` | **A THROWN fetch on a mutation** — its own header: *"we only ever queue on a NATIVE app that could not REACH the server (thrown fetch)"* | 🔴 **NO, TWICE OVER.** It is the **WRITE** path and the failure was a **READ**. And a 401/504 is a *resolved* response — `fetch` does not reject on an HTTP error status — so nothing throws. |
| 3 | **Service-worker read cache** | `public/sw.js:111-123` | **`fetch(event.request)` REJECTS**, then `.catch(() => caches.match(...))` | 🔴 **NO.** A 401 and a 504 both **resolve**. `.catch()` never ran, so the cached snapshot was never served. On the 300s hang the SW's own `fetch` hung too — **it has no timeout either.** |
| 4 | **Offline alert / status overlay** | `lib/native/useOfflineAlert.ts`, `useOfflineStatusOverlay.ts` | `onReachabilityChange(...)` — **downstream of #1** | 🔴 **NO.** #1 never transitioned, so these never fired. |

**Also confirmed present and NOT relevant:** `useHeartbeat.ts` drives the **server-side** auto-pause,
which was **OFF** and is a different mechanism — not conflated here.

### 🔴 A SECOND DEFECT IN THE SERVICE WORKER — THE CACHE WAS BEING POISONED

```js
// public/sw.js:113-122
if (event.request.method === 'GET' && (url.pathname.startsWith('/api/dashboard') || …)) {
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone()
        caches.open(DATA_CACHE).then(cache => cache.put(event.request, clone))   // ← NO res.ok CHECK
        return res
      })
      .catch(() => caches.match(event.request))
  )
```

**`cache.put` is called unconditionally. There is no `res.ok` test.** So **every 401 "Invalid token"
response was written into `DATA_CACHE`, overwriting the last known-good dashboard snapshot.**

**The consequence is worse than this incident.** The cache exists to keep orders on screen when the
device is genuinely offline. **After this incident it holds a 401 for `/api/dashboard`** — so the next
real offline event serves the cached 401 from `.catch()`, the client hits line 927, and the operator
gets **"Access denied" while offline**, with the snapshot that was supposed to save them destroyed.

⚠️ **Two limits on this finding, both stated rather than glossed:**
- **Per the Cache API spec, `put()` rejects only for status 206 and a few response types — a 401 is
  storable.** That is **read from the specification, not observed.** I did not inspect Cache Storage on
  a device.
- The `caches.open(...).then(...)` promise is **not returned or awaited**, so if `put()` *did* reject it
  would be an unhandled rejection — **silent either way.**

🔴 **NONE OF THE FOUR MECHANISMS WAS DEFECTIVE IN ITSELF. They are all keyed, directly or transitively,
to "can we reach the server", and the server was reachable. The app had no concept of "reachable but
not working", which is exactly what happened.**

---

## 5. What the `/api/ping` reachability check actually gates

**`lib/native/reachability.ts`, read in full.**

```
PING_URL = '/api/ping'   INTERVAL_MS = 10_000   TIMEOUT_MS = 3_000
FAIL_THRESHOLD = 3   // ~30s of consecutive failure before declaring OFFLINE
OK_THRESHOLD = 1
```

**It gates:** the `isOffline` flag on the dashboard (`page.tsx:1056`, native-only:
`if(!isNativeApp())return`), the offline banner, the offline overlays, the `online:` stamp on every
queued write (`page.tsx:1804/2152/2246/…`, `kds/page.tsx:1188/1284/1307`), and the offline→online
transition that triggers outbox replay.

### 🔴 The mismatch, stated precisely

**What `/api/ping` is:**

```js
// app/api/ping/route.ts — its own comment: "Intentionally does NO auth, NO DB work"
export function HEAD() { return new NextResponse(null, { status: 200, … }) }
```

**A synchronous return. It touches no database, no Supabase service, no auth.**

**What it stands in for:** `/api/dashboard` — ~19 Supabase queries across ~15 sequential round trips
through PostgREST and GoTrue.

> 🔴 **THE PROBE SHARES EXACTLY ONE DEPENDENCY WITH THE THING IT PROTECTS: THAT THE VERCEL FUNCTION
> PLATFORM IS UP. IT EXERCISES NONE OF THE DEPENDENCY THAT FAILED.**

**It is a fast liveness probe standing in for a dependency it does not exercise.** During this incident
it answered "we are online" correctly and uselessly, every 10 seconds, for two and a half hours, while
the only route the operator needed was unusable.

⚠️ **The module's own design note is right about the wrong axis.** It explains at length why
`navigator.onLine` is inadequate — *"true on a connected-but-dead uplink"* — and replaces it with a real
network round trip. **The same reasoning taken one step further condemns `/api/ping`: a 200 from a route
with no dependencies is true on a connected-but-dead backend.** The author identified the class of bug
and stopped one layer short of it.

⚠️ **And an irony worth recording: `ping()` has a 3-second `AbortController`. The `/api/dashboard` fetch
it stands in for has no timeout at all.** The probe is more carefully written than the request it is
meant to protect.

---

## 6. Retry behaviour on this route

**All OBSERVED by reading `page.tsx` and `kds/page.tsx`.**

| Property | Dashboard | KDS |
|---|---|---|
| **Poll interval** | **60s** — `page.tsx:1227` `setInterval(()=>fetchAllRef.current(),60000)` | **60s** — `kds/page.tsx:1055`, an **independent** interval |
| **In-flight guard** | 🔴 **NONE.** No `fetchingRef`, `isFetching`, `inFlight` or dedupe — I searched for all of them | 🔴 **NONE** |
| **`AbortController` / `signal`** | 🔴 **NONE.** `page.tsx:926`, `:1546` are bare `fetch` with only a headers object | 🔴 **NONE** — `:552`, `:1387` |
| **Abort on unmount** | 🔴 **NO** — there is no controller to abort | 🔴 **NO** |
| **Client-side timeout** | 🔴 **NONE.** Waits the full server 300s | 🔴 **NONE** |
| **Backoff** | Only for **429**, and only while `!authenticatedRef.current` (`:931`, 5 tries) | **None** |

### Additional refetch triggers beyond the poll

`page.tsx:1184-1195` — **two Supabase Realtime channels**, `postgres_changes` on `orders` and on
`trucks`, both calling `fetchAllRef.current()` (`:1186`). Plus ~12 call sites that refetch after an
operator action (`:1660`, `:1833`, `:2072`, `:2232`, `:2323`, `:2377`, `:2481`, …).

**🔴 Every one of these can fire while a previous request is still open, because there is no guard.**

### Concurrency per open tab

```
one request per 60s  ×  each held open for up to 300s  =  5 concurrent invocations per tab
```

⚠️ **Per *tab*, and dashboard + KDS are two tabs both calling `/api/dashboard`** — so **~10 per operator
working normally**, before any action-triggered or realtime-triggered refetch.

**This is the amplifier quantified in `docs/dashboard-incident-postmortem.md` §2, and it is consistent
with the reported twelve requests in one second.** ⚠️ **I have not reconciled twelve-in-one-second with
a 60s interval from the source alone** — that burst rate needs multiple clients, action-triggered
refetches, realtime events, or reloads. **I cannot attribute it precisely.**

---

## 7. Recommended behaviour

**None applied. Per §11 of the manual, both shells are remote-URL: every change below is a WEB change
shipping to `main`, live on iOS and Android at the next deploy with no rebuild or resubmission.**
⚠️ **That also means each is an instant release to a shipped App Store app and an in-review Play build.**

### (a) Never render a server failure as access-denied

| # | Change | File | Risk |
|---|---|---|---|
| **a1** | 🔴 **Distinguish the two 401 causes at source.** Return a **503** with `{error:'Service unavailable'}` when `error` is set, and keep **401 "Invalid token"** only for `!truck`. | `app/api/dashboard/route.ts:81` | **LOW.** ⚠️ **But it changes a status code every client reads.** The dashboard's `:936` and the KDS's `:563` already handle non-401 failures, so both improve immediately — **verify no other consumer treats non-401 as fatal before shipping.** |
| **a2** | **Add the auth check the neighbouring branches already make:** `if(res.status===401 && !authenticatedRef.current)`. On 401 with an established session, warn and keep state. | `page.tsx:927` | 🔴 **LOWEST RISK, HIGHEST VALUE — ~10 characters, and it alone would have prevented what the operator saw.** ⚠️ **Trade-off, stated:** a genuinely revoked token now leaves a stale board until reload instead of ejecting immediately. **For an operator mid-service that is the right trade; it should still be a deliberate decision, not a side effect.** |
| **a3** | **Stop calling every failure "Access denied".** Make the heading depend on the cause. | `page.tsx:2782` | **LOW.** Copy only. |
| **a4** | **Give the KDS a keep-state path.** It currently throws on 401 *and* every non-ok status with no equivalent of `authenticatedRef`. | `kds/page.tsx:555,563,719` | **MEDIUM.** The KDS is a cook-facing screen mid-service; changing when it blanks needs care. Its wording is already honest — **fix the behaviour, keep the words.** |

### (b) Hold last-known-good orders with a staleness indicator

| # | Change | File | Risk |
|---|---|---|---|
| **b1** | **Surface `lastRefresh` as a staleness badge** ("Last updated 4 min ago") whenever a poll fails. The value already exists — `setLastRefresh(new Date())` at `page.tsx:1013`. | `page.tsx` | **LOW.** Additive. |
| **b2** | 🔴 **A degraded banner instead of a blank screen** — "Can't reach the server. Showing orders from HH:MM." | `page.tsx`, `kds/page.tsx` | **MEDIUM.** 🔴 **Stale orders on a live board are genuinely dangerous** — a cook could work a cancelled ticket. **The staleness must be unmissable, and actions should be gated or queued past a threshold. This is the one change here that could cause a real-world error if done badly.** |
| **b3** | **Fix the SW cache poisoning:** add `if (res.ok)` before `cache.put`, so a 401/504 never overwrites the good snapshot. | `public/sw.js:117` | **LOW and independently worth doing.** ⚠️ **The DATA_CACHE may already hold a poisoned entry from this incident** — it needs invalidating, which I have not established how to do safely from here. |
| **b4** | **Make the SW fall back on a bad *status*, not only a thrown fetch** — serve the cached snapshot for 5xx too. | `public/sw.js:121` | **MEDIUM.** ⚠️ **Must never mask a 401 that is genuinely an auth failure** — pair it strictly with a1. |

### (c) Retry and abort discipline

| # | Change | File | Risk |
|---|---|---|---|
| **c1** | 🔴 **In-flight guard on `fetchAll`.** A `useRef` boolean; skip if a request is open. | `page.tsx:919`, `kds/page.tsx` | **LOW. The single highest-value change for system stability** — caps concurrency at 1 per surface regardless of latency and breaks the amplification loop at source. |
| **c2** | **`AbortSignal.timeout(10_000)` on every `/api/dashboard` fetch**, and abort on unmount. | `page.tsx:926,1546`, `kds/page.tsx:552,1387` | **LOW.** Feeds the existing `catch` at `:1035`, which already keeps state when authenticated. |
| **c3** | **Exponential backoff on repeated failure**, not a fixed 60s. | `page.tsx:1227`, `kds/page.tsx:1055` | **LOW–MEDIUM.** ⚠️ **Must still recover promptly** — cap the backoff (~5 min) so the board self-heals without a reload. |
| **c4** | **Make reachability exercise a real dependency.** Either add a DB-touching probe, or drive `isOffline` from actual `/api/dashboard` outcomes rather than `/api/ping`. | `lib/native/reachability.ts` | 🔴 **HIGHEST RISK HERE, AND I DO NOT RECOMMEND DOING IT FIRST.** `isOnline()` stamps every queued write and gates outbox replay. A probe that fails on backend slowness would flip operators into offline mode and start queueing writes during a partial degradation. **The correct answer is probably a THIRD state — "reachable but degraded" — that drives the banner without touching the write gate. That is a design decision, not a patch.** |

**Suggested order: a2 → c1 → b3 → a1 → c2 → a4 → b1 → b2 → c3 → c4.** ⚠️ **a2 and c1 together are
roughly fifteen lines and address both the operator-visible symptom and the amplification.**

---

## 8. What I could not establish

🔴 **Nothing below was verified in a running client. Every finding in this report is a source read.**

| # | Unknown | What would settle it |
|---|---|---|
| 1 | **Whether the app actually received a 401 rather than a 504** at the moment the message appeared | **Vercel logs**: `/api/dashboard` status codes for that device/token in the window. §1 shows 401 is the only path to that string, so a 401 must have occurred — **but I have not seen one in a log.** |
| 2 | **Whether `[dashboard] truck lookup failed:` appears in the logs, and with what message** | **Vercel log export.** 🔴 **This is the decisive artefact.** A PostgREST timeout/connection message there proves the conflation fired in production; `PGRST116` would mean a genuinely invalid token instead. |
| 3 | **Whether the WebView reloaded** during the incident | Device logs, or the operator's recollection. **Decides whether §3's "the orders were still in memory" held throughout.** |
| 4 | **Whether `DATA_CACHE` actually contains a poisoned 401** | Chrome DevTools → Application → Cache Storage on the device. **Spec-reasoned, not observed.** |
| 5 | **Whether the SW was registered and active** on that device | `chrome://serviceworker-internals`. Registration is called at `page.tsx:205` / `kds:877`; **I did not verify it activated in the Capacitor WebView.** |
| 6 | **Whether the KDS showed "Could not load orders"** while the dashboard showed "Access denied" | The operator. **§2 predicts they disagreed — worth confirming, as it would corroborate the whole analysis.** |
| 7 | **How twelve requests in one second arose** from a 60s interval | **Vercel logs** with timestamps and user-agents. §6 gives candidates; **I cannot attribute it.** |
| 8 | **Whether `cache.put` succeeded or rejected for a 401** in this browser | Device inspection. **Read from spec.** |
| 9 | **Whether other operators saw the same message** | Support reports. **One device, one report.** |
| 10 | **Whether the 401 branch predates the keep-state work** | `git log -L` on that line. **I did not run it and am not asserting the history.** |
