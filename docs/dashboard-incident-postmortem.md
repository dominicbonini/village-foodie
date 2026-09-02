# Post-mortem — `/api/dashboard` outage, 1 September 2026

**Duration:** ~13:22 → ~16:00 UTC (~2h 38m) · **Recovery:** spontaneous, no fix applied.
**Supersedes the conclusions of** `docs/dashboard-timeout-report.md` **and**
`docs/dashboard-latency-followup-report.md`.

---

## VERIFICATION — what I actually did

- **Against production: NOTHING.** No SQL, no build, no deploy, no migration, no call to any endpoint.
  **Every latency figure in this report is yours.**
- **Locally executed:** `git log`/`diff-tree`/`ls-files`, `grep`, and an import-graph walker. **That is
  execution of my analysis, not of the system.**
- **TYPECHECK: not run.** It would establish nothing about a latency incident.
- **A source read is not a behaviour verification, and I mark inference as inference throughout.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 🔴 THE HEADLINE, AND IT IS A CORRECTION TO BOTH PRIOR REPORTS

**We did not cause this outage. We roughly doubled it, and we turned it into a total one.**

The 44.8s → 23.5s drop when clients were closed is the fact both earlier reports lacked, and it is
decisive: **~half the observed latency was queueing behind our own traffic.** An upstream degradation
that would have produced a bad-but-responding system was amplified by three of our own choices — **no
client timeout, no in-flight guard, and a 300-second function ceiling** — into a 504 and a retry storm.

| Prior claim | Status |
|---|---|
| *"A data plane that accepts connections but never answers"* (report 1) | **WRONG.** It answered, slowly. |
| *"The latency is not ours to fix"* (report 2, §3) | **HALF WRONG.** The upstream fault was not ours. **Roughly half the observed latency was**, and it was the half we could have removed. |
| *"26 idle + 2 active means PostgREST is not sending work"* (report 1) | **WITHDRAWN.** §3 gives the correct reading. |
| *"Silence localises the hang to line 75"* (report 1) | **WRONG**, already corrected in report 2. |
| *"Order volume is ruled out"* | **STANDS — and is now OBSERVED**, not reasoned (64 orders vs 0, same time). |

---

## 1. Timeline

**Every entry marked OBSERVED (measured, or read by me in this repository) or REPORTED (relayed to me).
Gaps are marked as gaps.**

| Time (UTC) | Entry | Basis |
|---|---|---|
| — | `4275916` "KDS event scroll fix" committed 13:27 local (12:27 UTC) | **OBSERVED** — `git log` |
| — | `5083d1c` "KDS DRY event picker" committed 13:52 local (12:52 UTC) | **OBSERVED** — `git log` |
| **~13:22** | pizzeria-gusto's last order row created | **REPORTED** |
| **~13:22** | Dashboard hangs from around this time | **REPORTED** — ⚠️ *"around"*; onset is not pinned |
| *gap* | **Whether onset preceded, coincided with or followed the last order is NOT ESTABLISHED.** The order is the last *successful* write; it does not timestamp the onset. | **GAP** |
| — | `GET /api/dashboard` → 504 `FUNCTION_INVOCATION_TIMEOUT`, 300s, `lhr1` | **REPORTED** |
| — | Vercel Firewall: Allowed. Middleware: 200 | **REPORTED** |
| — | Invalid token → **401 in 44.8s**; second date → **401 in 49.6s** | **REPORTED** |
| — | The two dates carried **64 orders and zero orders**. Same duration | **REPORTED** — rules out volume |
| — | Postgres: 36/60 connections, 2 active, 0 idle-in-transaction, no blocking, **SQL Editor instant** | **REPORTED** |
| — | Retry storm: **12 requests in one second, ~1K errors in an hour** | **REPORTED** |
| — | **Rollback `5083d1c` → `4275916`. Service NOT restored** | **REPORTED** |
| — | Neither commit touches the route or any of its 21 reachable modules | **OBSERVED** — `git diff-tree` + import walk |
| — | **All operator clients closed. 401 falls 44.8s → 23.5s** | **REPORTED** — 🔴 the pivotal measurement |
| **~16:00** | Service recovers. **No fix, no deploy, no rollback-forward, no config change** | **REPORTED** |
| — | Supabase reported having issues in the period | **REPORTED, SECOND-HAND, UNVERIFIED** |

**What is NOT in this timeline, deliberately:** any claim about what Supabase was doing internally, the
exact onset minute, or a causal link between the 13:22 order and the onset. **I have no evidence for
any of them.**

---

## 2. The 44.8s → 23.5s drop — mechanism

**You are right that this is the fact least consistent with a pure upstream cause. It has a specific
mechanism and it is in this repository.**

### The amplifier: four compounding defects on the client

All four are **OBSERVED** by reading `app/dashboard/[token]/page.tsx` and `.../kds/page.tsx`:

1. **No in-flight guard.** `fetchAll` (`page.tsx:919`) has no `fetchingRef`, no `isFetching`, no
   deduplication. **I grepped for all three and for `AbortController`; none exists.** A new call fires
   regardless of whether the previous one is still open.
2. **No client-side timeout or abort.** `page.tsx:926`, `page.tsx:1546`, `kds/page.tsx:552`,
   `kds/page.tsx:1387` are all bare `fetch(...)` with only a headers object. **No `signal`.** The
   browser waits the full 300s.
3. **A 60-second poll on each surface.** `page.tsx:1227` and `kds/page.tsx:1055` — **independent
   intervals**, and **both call the same `/api/dashboard`.**
4. **A 300-second server ceiling** (§4), so each abandoned attempt occupies a function slot for five
   minutes.

### The arithmetic

**Per open tab, in steady state:**

```
one request every 60s  ×  each lasting 300s  =  5 concurrent invocations per tab
```

Each invocation walks a **sequential** chain (~15 waves), so it holds **exactly one in-flight Supabase
request at a time**. Therefore:

```
concurrent Supabase requests from us  ≈  5 × (open dashboard tabs + open KDS tabs)
```

⚠️ **Dashboard and KDS are two tabs per operator, both hitting `/api/dashboard`** — so one operator
working normally contributes ~10 concurrent requests, not 5.

### Why closing clients halved it

When offered load `N` exceeds server concurrency `C`, queueing delay is proportional to `N/C`. **Remove
roughly half the offered requests and the queue wait roughly halves.**

```
44.8s → 23.5s   =   factor 1.906   ≈   2
```

🔴 **THAT RATIO IS THE EVIDENCE. It is what a queue does when you halve the arrivals, and it is not what
a fixed upstream service time does — a fixed service time is unaffected by who else is waiting.**

### How much did we contribute? — about half, and I will not claim more precision than that

- **Our share: ~21 seconds** (44.8 − 23.5) — removable by us, entirely.
- **The residual: ~23.5 seconds** — still **≈470×** a healthy per-request cost, with our clients gone.

🔴 **SO BOTH ARE TRUE AND NEITHER EXCUSES THE OTHER.** An upstream fault of enormous magnitude was
necessary — 23.5s with zero load from us is not something we caused. **And our own traffic doubled it,
which is the part we own.**

⚠️ **THE FEEDBACK LOOP IS THE REAL DEFECT, AND IT IS SELF-SUSTAINING.** Slower responses → attempts
overlap instead of completing → more concurrent requests → longer queue → slower responses. **Once
started it does not need the original trigger to persist.** *"12 requests in one second"* is that loop
at full amplitude.

⚠️ **What I CANNOT establish:** whether the residual 23.5s was upstream service time, upstream queueing
from *other* Supabase tenants, or queueing behind traffic of ours I did not account for (cron jobs, the
scraper, other operators). **The 2× is solid; the composition of the remainder is not.**

---

## 3. Postgres healthy · SQL Editor instant · PostgREST ~45s

**These are not in conflict. They are three different paths, and only one of them was slow.**

### The layers

```
browser / Vercel function
        │
        ▼
  [1] Supabase edge (Cloudflare)
        │
        ▼
  [2] Kong API gateway            ← /rest/v1 AND /auth/v1 BOTH pass through here
        │
        ├──► [3] PostgREST  ──┐
        └──► [3'] GoTrue    ──┤
                              ▼
                        [4] Supavisor / pgbouncer
                              │
                              ▼
                        [5] Postgres            ← "36/60, 2 active, 0 idle-in-transaction"

  Supabase SQL Editor ──────────────────────────► [5] directly (its own platform path)
```

### Which component can be slow while the other two look fine

🔴 **LAYERS 1–3. The HTTP data plane in front of the database.** Named specifically: **Kong, PostgREST,
or the edge in front of them.** I cannot narrow further from here.

**Why each observation is consistent with that:**

- **"SQL Editor instant"** — the SQL Editor **does not traverse layers 1–4.** It is a platform-side path
  straight to Postgres. ⚠️ **It therefore tests the database and proves nothing whatsoever about
  PostgREST.** It was the most misleading signal available during the incident.
- **"2 active, 0 idle-in-transaction"** — 🔴 **exactly what a queue in front of the database looks
  like.** If requests wait ~45s for admission and then execute in ~1ms, **Postgres is idle at almost
  every instant you sample it.** Low activity is the *symptom*, not the refutation.
  ⚠️ **My first report read this backwards** and used it to rule out pooling entirely.
- **"36/60 connections, 26 idle"** — consistent with PostgREST holding a warm pool it is **not
  dispatching work into**, because the bottleneck is upstream of the pool.
- **"No blocking"** — correct, and expected. **This was never lock contention.** Nothing on the GET path
  writes (`slot-bookings.ts:190` passes `persistReseed=false` — **OBSERVED**).

### 🔴 The corroborating detail neither earlier report used

**Middleware's `proxy.ts:281` `supabase.auth.getUser()` is a GoTrue call, and GoTrue sits behind the
same Kong gateway as PostgREST.** If both PostgREST *and* GoTrue were slow, **that points at the shared
layer (Kong/edge) rather than at PostgREST alone** — and it would explain a 44.8s total splitting
roughly ~22s in middleware and ~22s in the handler.

⚠️ **I could not establish the split.** Vercel logs middleware and function durations separately (§8).

---

## 4. The 300-second ceiling

### Where it is set

**Nowhere — for this route.** **OBSERVED:**

- `app/api/dashboard/route.ts` exports **only `GET`**. No `maxDuration`.
- `vercel.json` names **exactly one** function: `app/api/manage/verify-schedule-url/route.ts`
  (`memory 1024`, `maxDuration 60`).
- **Six routes** set their own: `demo` 300, `payments/return` 300, `webhooks/stripe` 300,
  `demo/restart` 60, `manage/whatsapp-preview` 60, `manage/verify-schedule-url` 60.

**So the 300s is the platform default.** ⚠️ `app/api/demo/route.ts:26` records the old default as
"10s Hobby / 15s Pro" — **stale**; the error message is the authority.

### 🔴 What timeout would have produced a slow-but-usable page? — **NONE. That is the honest answer.**

```
15 sequential waves × 45s  =  675s
 5 waves (fully flattened) × 45s  =  225s
```

**A 225-second dashboard is not a usable page.** No value of `maxDuration` makes a route usable when a
single round trip costs 45 seconds. **`maxDuration` does not control usability. It controls blast
radius**, and that is the correct frame for choosing it.

### What it actually controls: slot-time, and therefore the feedback loop

```
slot-seconds per tab per minute  =  (60/60) × maxDuration
   at 300s → 300 slot-seconds/min/tab  →  5 concurrent invocations per tab
   at  30s →  30 slot-seconds/min/tab  →  0.5 concurrent per tab   (10× less)
```

🔴 **Lowering `maxDuration` to 30s would have cut our contribution to the queue by ~10×** — which, by §2,
was ~half the latency. **It would not have produced a working dashboard. It would have produced a fast,
honest failure and no retry storm.**

### Recommended values, and what breaks

| Setting | Recommend | Healthy headroom | Risk if lowered |
|---|---|---|---|
| **Supabase client timeout** (`lib/supabase.ts:3`, currently **none**) | **AbortSignal 5s per request** | healthy call ~50ms → **100×** | A legitimately slow single query starts failing. **I have not measured p99 per query** — set from real data, not from this table. |
| **`maxDuration`** on `/api/dashboard` | **30s** | healthy full route ~750ms → **40×** | A cold start plus a transient slow moment could 504 where it previously succeeded slowly. **30 is chosen to be far above anything normal, not tight.** |
| **Client** `fetch` | **AbortSignal 10s + in-flight guard + exponential backoff** | — | A slow-but-recoverable poll is abandoned. Acceptable: the next poll retries and `page.tsx:936` already preserves existing state. |

🔴 **THE IN-FLIGHT GUARD IS THE HIGHEST-VALUE SINGLE CHANGE AND IT IS ~5 LINES.** It alone caps
concurrency at one request per surface regardless of latency, which breaks the loop at its source.

⚠️ **Do NOT lower `maxDuration` on `demo` (300), `payments/return` (300) or `webhooks/stripe` (300).**
Those legitimately run long — menu extraction is documented at 40–80s. **This is a per-route change, not
a global one.**

---

## 5. Flattening the query chain

**Current: ~19 queries in ~15 sequential waves. Dependency depth is 5.** (Wave table in
`docs/dashboard-latency-followup-report.md` §4; unchanged.)

### The plan

| Level | Run together | Blocked by | Risk to a live operator surface |
|---|---|---|---|
| **1** | `trucks` (`:75`) | — | **None.** Unchanged. |
| **2** | actor auth chain ‖ `collection_times` ‖ `truck_events` ‖ `operators`(stripe) ‖ `menu_categories` ‖ `menu_items_db` ‖ `truck_vans` count | `truck.id` | **LOW–MEDIUM.** 🔴 **The auth chain must stay internally sequential** (`getUser` → `operators` → `truck_users`) and **the 403 must still be decided before any order data is returned.** Running the reads concurrently with auth means fetching data for a request that may be refused — **acceptable only if the 403 still short-circuits the response**. Get this wrong and you leak another truck's board. |
| **3** | `orders` ACTIVE+DONE ‖ `production_slot_usage` ‖ `truck_vans` select | `selectedEventId`, `van_id` | **LOW.** All three already depend only on level 2 output. |
| **4** | `order_payments` ‖ `order_drafts` ‖ `action_audit_log` | `visibleKeys` | **LOW.** Independent of each other; all keyed on the same array. |
| **5** | `order_payments` (captured) | wave 4's drafts | **NONE.** Already early-returns when there are no drafts (`held-authorisation.ts:81`) — **usually skipped entirely.** |

**Expected: ~15 waves → 5 (6 including middleware). ~10 waves removed, a 3× reduction.**

```
healthy   750ms → 250ms
at 22s/wave  330s → 110s
at 45s/wave  675s → 225s     ← under 300s, so a 504 becomes a very slow 200
```

### What cannot be flattened, and why

- **The auth chain.** `getUser` → `operators`(`auth_user_id`) → `truck_users`(`auth_user_id`) — each
  needs the previous result. **OBSERVED** at `lib/audit/actor.ts:90/107/124`.
- **Held-authorisation's second read.** `held-authorisation.ts:83` keys `.in()` on idempotency keys
  derived from the first read's rows.
- **Everything below level 1.** `truck.id` gates the entire route.
- ⚠️ **The empty-slot-usage path (wave 16a)** adds 5 more reads when `production_slot_usage` has no rows
  — `buildUnitsFromOrders` = `orders` + `menu_items_db` + `menu_categories` + `collection_times` +
  `truck_events`. **Three of those five are already fetched elsewhere in the route and could be passed
  in.** Low risk, pure duplication removal.

### 🔴 The risk that applies to the whole exercise

**This route is the operator's live board mid-service, and it has a documented history of silent-empty
failures** (the V9.5 42703 incident: a named select failed, `todayEvents` came back null, and the route
returned **HTTP 200 with `orders: []`** — no error anywhere). **Reordering it moves error handling
around**, and the failure mode of this file is *silence*, not a crash.

⚠️ **Any flattening must preserve every `if (err) console.error(...)` branch and every `|| []` fallback
exactly.** **Deploys are frozen, this is an operator-facing surface, and it should not be the first
thing shipped when the freeze lifts.**

---

## 6. Other routes with the same exposure

**Worked from what a browser requests on each surface — OBSERVED by grepping the page components — not
from the route list.**

### How clients are obtained (OBSERVED)

- **6 of 66** API routes import the shared `@/lib/supabase` (`lib/supabase.ts:3` — **no options object,
  no timeout**).
- **53** construct their own `createClient(...)` inline. I sampled five (`demo`, `demo/save-email`,
  `demo/return`, `demo/restart`, `payments/return`) — **none passes a timeout.**
- ⚠️ **I did not read all 53.** **I cannot assert that none has a timeout.** What I can assert: **the
  four highest-blast-radius routes all share the one untimed client**, so **a single change to
  `lib/supabase.ts` covers all four.**

### Ranked by blast radius

| # | Route | Surface / what a browser fetches | Supabase calls | `maxDuration` | Client | Blast radius |
|---|---|---|---|---|---|---|
| **1** | **`/api/orders/submit`** | Customer order page — the **pay** action | **19** `from()`, 42 awaits | **DEFAULT 300** | `@/lib/supabase` | 🔴 **HIGHEST. A customer cannot place or pay for an order. Direct lost revenue, on every truck at once. Also the route that writes money.** |
| **2** | **`/api/menu/[truckId]`** | Customer order page **first paint** (fetched 3×) | **22** `from()`, 17 awaits | **DEFAULT 300** | `@/lib/supabase` | 🔴 **The customer sees nothing at all.** The most-hit route on the platform. |
| **3** | **`/api/dashboard`** | **Dashboard AND KDS — both** | ~19, **15 sequential waves** | **DEFAULT 300** | `@/lib/supabase` | 🔴 **The incident. Operator blind mid-service. Two tabs per operator, so it self-amplifies fastest.** |
| **4** | `/api/dashboard/action` | Every operator action — accept, ready, collect, refund | **74** `from()`, 139 awaits | **DEFAULT 300** | `@/lib/supabase` | **HIGH.** Board renders but nothing can be actioned. **Largest query count of any hot route.** |
| **5** | `/api/slots/[truckId]` | Customer slot picker | 9 | **DEFAULT 300** | inline `createClient` | **MEDIUM.** Customer cannot choose a time. |
| **6** | `/api/events` | Customer "change event" | 3 | **DEFAULT 300** | — | **MEDIUM.** Rate-limited (600/min) — **the only one of these inside the limiter.** |
| **7** | `/api/manage` | Settings, menu editing | **131** `from()`, 155 awaits | **DEFAULT 300** | `@/lib/supabase/server` | **LOW-ish.** Highest query count in the repo, but **not mid-service critical.** |
| **8** | `/api/events/manage`, `/api/events/action`, `/api/auth/me` | Dashboard + KDS secondary | few | **DEFAULT 300** | — | **LOW.** Do not gate first paint. |

🔴 **THE SYSTEMIC FINDING: 60 of 66 API routes run on the platform default of 300s, and the shared client
has no timeout. `/api/dashboard` is where it surfaced, not where it is worst.** `/api/orders/submit` has
the same shape and **takes money.**

⚠️ **KDS explicitly, as asked: the KDS has NO separate endpoint.** `kds/page.tsx:552` and `:1387` call
**`/api/dashboard`** — the same route, the same 15 waves, plus its own independent 60s poll
(`kds/page.tsx:1055`). **It shares the defect exactly and doubles the offered load per operator.**

---

## 7. Detection

**The gap is real and I confirmed it: the route has 17 `console.error`/`console.warn` and ZERO
`console.log`, all 17 inside `if (err)` branches. A slow-but-successful run emits nothing.** During this
incident **the logs were working as designed and told you nothing**, because nothing errored — it was
merely slow. **An operator noticing was the detection mechanism.**

### What to instrument, and where

**1. Duration on every response — `app/api/dashboard/route.ts`.**
`const t0 = Date.now()` at entry; on every return path emit one structured line:
```
[dashboard] truck=<id> ms=<total> waves=<n> orders=<n> status=<code>
```
🔴 **This is the single highest-value addition. One line makes "slow but succeeding" visible, which is
the exact state that was invisible today.**

**2. Per-wave timing behind a threshold — same file.** Log a wave only when it exceeds ~1s:
`[dashboard] SLOW WAVE name=orders ms=45210`. **Would have named PostgREST within one request.**

**3. A timing wrapper in `lib/supabase.ts`** — the same place the timeout goes. Wrap `global.fetch`,
record duration, warn past a threshold. **One file instruments the four critical routes at once.**

**4. An alert on p95 duration, not on error rate.** ⚠️ **Error-rate alerting would not have fired for the
first ~40 minutes** — the route was returning 200s slowly before it began timing out. **Alert on p95
`/api/dashboard` > 5s for 5 minutes.**

**5. A synthetic probe.** Call `/api/ping` (no DB) **and** one cheap DB-backed endpoint every minute, and
alert on divergence. 🔴 **`/api/ping` returning 200 while a DB route is slow is precisely this
incident's signature**, and today that comparison had to be made by hand.

**6. A Supabase-reachability check** independent of the app: `curl` `/rest/v1/` on a schedule. **Would
have distinguished "our code" from "Supabase" in seconds instead of two reports.**

**7. Client-side, `page.tsx` / `kds/page.tsx`:** log slow polls, and **surface a "connection slow"
banner** rather than an indefinite spinner. ⚠️ **The operator's only signal today was
`Loading dashboard...` forever, which is indistinguishable from a broken page.**

**8. Subscribe to the Supabase status page.** Free, and the leading candidate here was **REPORTED,
second-hand, hours in.**

---

## 8. What I still cannot establish

**Listed as gaps. I am not filling any of them with narrative.**

| # | Unknown | What would settle it |
|---|---|---|
| 1 | **Whether Supabase actually had an incident**, and its nature | **The Supabase status page history and the incident record for `eu-west-2` covering 13:00–16:00 UTC.** Currently **second-hand and unverified.** |
| 2 | **Which layer was slow** — Kong, PostgREST, the edge, Supavisor | **Supabase project logs for the window**: PostgREST/Kong request logs with durations, and pool metrics. §3 narrows it to 1–3; **only their logs can name it.** |
| 3 | 🔴 **The middleware/function duration split** on one failing request | **Vercel log export.** Middleware and function durations are separate lines. **Settles whether GoTrue was also degraded — which would confirm the shared-gateway reading in §3.** |
| 4 | **The true onset time** | **Vercel log export**: first `/api/dashboard` exceeding ~2s. *"Around 13:22"* is REPORTED and approximate. |
| 5 | **Composition of the residual 23.5s** — upstream service time vs upstream queueing vs our remaining traffic (crons, scraper, other operators) | Supabase request logs **plus** Vercel concurrency metrics for the same minutes. **The 2× amplification is solid; this split is not.** |
| 6 | **Whether other routes were equally slow** at the time — `/api/menu`, `/api/orders/submit` | **Vercel log export**, p95 by route. 🔴 **If `/api/orders/submit` was also 45s, customers could not order and the commercial impact is far larger than an operator inconvenience. I do not know whether they could.** |
| 7 | **Whether anything logged before the 504s** | **Vercel log export**, filter `[dashboard]`. **Expect nothing** — and that would confirm only "no query errored". |
| 8 | **Exact concurrency we offered** | Vercel concurrent-execution metrics. My §2 figure is **arithmetic from the polling intervals I read, not a measurement.** |
| 9 | **Whether any of the 53 inline `createClient` routes sets a timeout** | Reading all 53. **I sampled five. An empty grep over a sample is not evidence of absence.** |
| 10 | **Why recovery was gradual/spontaneous at ~16:00** | Supabase incident record. **No action of ours coincided with it.** |

---

## Recommended actions — none applied

**In order. ⚠️ All are code changes; deploys are frozen, and a deploy is an instant release to a shipped
iOS app and an in-review Play build.**

| # | Change | File | Why first |
|---|---|---|---|
| 1 | **In-flight guard + `AbortSignal` on the client poll** | `app/dashboard/[token]/page.tsx`, `.../kds/page.tsx` | **~5 lines. Caps concurrency at 1 per surface regardless of latency — breaks the feedback loop at source.** Highest value, lowest risk, touches no server behaviour. |
| 2 | **Request timeout on the shared client** | `lib/supabase.ts:3` | One file covers `/api/dashboard`, `/api/dashboard/action`, `/api/orders/submit`, `/api/menu/[truckId]` — the four worst. |
| 3 | **Duration logging** | `app/api/dashboard/route.ts` + `lib/supabase.ts` | Makes the invisible state visible. **No behaviour change.** |
| 4 | **`export const maxDuration = 30`** on the hot routes | the route files | Caps slot-time ~10×. |
| 5 | **p95 alerting + synthetic probe** | outside the repo | Detection in minutes. |
| 6 | **Flatten 15 waves → 5** | `app/api/dashboard/route.ts` | Real but the **riskiest** (§5). **Do it last, not first.** |

🔴 **AND THE ONE THAT NEEDS NO DEPLOY: if this recurs, close the operator tabs immediately.** It halved
the latency today, and it is the only lever available mid-incident.
