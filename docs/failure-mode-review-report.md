# Operator-app failure-mode review — what survives a backend outage today

**READ-ONLY. No files changed, no code written, nothing deployed, no migrations, no SQL.**

---

## VERIFICATION

**What I performed: SOURCE READ, plus `git` EXECUTION to establish what is live.**

🔴 **I have not run the app, not induced a failure, and not measured anything at a client.** Every
behavioural statement below is traced to a file and line and is marked **READ** or **INFERRED**. **No
typecheck was run and it would not be evidence.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0 · WHAT IS ACTUALLY LIVE — established, not assumed

| Check | Result |
|---|---|
| `HEAD` | **`e734989` "pre-live"** |
| `origin/main` | **`e734989` — identical** |
| Working tree, resilience files | **clean** — nothing uncommitted |
| `maxDuration = 30` introduced by | **`e734989`** (`git log -S`) |
| `inFlightRef` introduced by | **`e734989`** |
| `sw.js` `res.ok` check introduced by | **`e734989`** |

✅ **Batch 1 and the four-site status split are committed and pushed to `main`.**
⚠️ **That they are LIVE IN PRODUCTION is INFERRED** from the Vercel-on-`main` arrangement. **I did not
fetch production to confirm the deployed build carries them.**

🔴 **ONE BATCH-1 ITEM IS NARROWER THAN ITS DESCRIPTION.** The "30s maxDuration" was applied to
**`/api/dashboard` ONLY**. Verified by grep across `app/api`:

| Route | `maxDuration` |
|---|---|
| `app/api/dashboard/route.ts` | ✅ **30s** (line 72) |
| 🔴 `app/api/dashboard/action/route.ts` (**every operator write**) | ❌ **none — 300s default** |
| 🔴 `app/api/menu/[truckId]/route.ts` (**customer menu**) | ❌ **none — 300s** |
| 🔴 `app/api/orders/submit/route.ts` (**customer checkout**) | ❌ **none — 300s** |
| `app/api/manage/route.ts`, `app/api/heartbeat/route.ts` | ❌ **none — 300s** |

**The invocation-amplification half of the 1 September cause is fixed on ONE route of five.**

**Also live:** the read timeout is **client-side**, not on the route — `READ_TIMEOUT_MS = 10_000`
(`app/dashboard/[token]/page.tsx:830`, `kds/page.tsx:488`). **The route has no internal deadline**; a
Supabase call inside it is unbounded and only the 30s platform cap stops it.

---

## 1 · Every failure mode, and what happens TODAY

**Dashboard = `app/dashboard/[token]/page.tsx`. KDS = `app/dashboard/[token]/kds/page.tsx`.
Writes = `lib/native/orderGate.ts`. SW = `public/sw.js`.**

**The read path in one line:** `fetch` (10s abort, `page:955`) → `res.json()` (`:962`) → 401 branch
(`:973`) → `res.ok` clears degraded (`:980`) → 429 backoff (`:984`) → `!res.ok` keeps state (`:989`) →
catch (`:1097-1101`) → `finally` (`:1102`).

| # | Failure | Dashboard | KDS | Native shell / writes |
|---|---|---|---|---|
| 1 | **Slow (< 10s)** | ✅ **Succeeds normally.** No log, no signal (§7) | ✅ same | Writes cap at **5s** (`orderGate:220`) → abort → **queued** on native |
| 2 | **Timeout (> 10s)** | ✅ **KEEPS BOARD.** Abort → `:1097-1099`, degraded set, poll retries in 60s | ✅ **KEEPS BOARD** (`:791`) | ✅ 5s abort throws → `gatedAction` catch (`:305`) → **queue** on native; **web returns a plain failure** (`:309`) |
| 3 | **5xx / 503** | ✅ **KEEPS BOARD** (`:989`), degraded set | ✅ **KEEPS BOARD** (`:613-616`) | 🔴 **NOT QUEUED.** `:303` — *"A server RESPONSE (even an error) is NOT an offline case"* → returned as a failed result |
| 4 | **4xx (non-401/429)** | ✅ **KEEPS BOARD** if authenticated (`:989`); **errors if not** | ✅ same | 🔴 **Not queued** — same `:303` |
| 5 | **401 auth failure** | 🔴 **TERMINAL — clears the board** (`:973-977`). **Correct now**: the route only sends 401 after a *successful* read (`route.ts:121`) | 🔴 **TERMINAL** (`:599-608`) | n/a |
| 6 | **429** | ✅ Pre-auth: **backoff retry ×5** (1/2/4/8/8s, `:984-987`). Post-auth: keeps board | ✅ keeps board | Not special-cased → treated as any non-ok |
| 7 | **Malformed body** | ✅ **KEEPS BOARD.** `res.json()` at `:962` throws → catch → `:1101`. ⚠️ **It throws BEFORE the 401 branch**, so a malformed 401 is read as a transient failure — safe direction | ✅ same | `res.json().catch(()=>({}))` (`:302`) — **tolerated**, `res.ok` still decides |
| 8 | **Network drop** | ✅ **KEEPS BOARD** (`:1101`) | ✅ same | ✅ Thrown → **queued** (native). Reachability flips offline after **3 fails ≈ 30s** |
| 9 | **DNS failure** | ✅ Same as 8 — indistinguishable at `fetch` | ✅ same | ✅ Same as 8 |
| 10 | **TLS failure** | ✅ Same as 8 | ✅ same | ✅ Same as 8 |
| 11 | 🔴 **Upstream gateway timeout (1 Sept)** | ✅ **KEEPS BOARD** — the 10s abort fires long before the 148s median | ✅ **KEEPS BOARD** | ⚠️ **Depends on shape.** A *slow* write → 5s abort → **queued** ✅. A gateway that *answers* 504 fast → **not queued** (mode 3) |
| 12 | **Partial / truncated response** | ✅ **KEEPS BOARD** — `res.json()` throws (mode 7) | ✅ same | Tolerated; `res.ok` decides |
| 13 | 🔴 **Valid but STALE 200** | 🔴 **ACCEPTED SILENTLY, AND IT CLEARS THE DEGRADED BANNER** (`:980`). **There is no max-age, no server timestamp check, no staleness test anywhere on this path** | 🔴 **Same** (`:622`) | n/a |

**Where the three surfaces differ:**

- **Web vs native writes:** a thrown/timed-out write **queues on native only**. `orderGate:308-309` —
  **on web it returns `{ok:false, queued:false}`**. **A web operator has no durable outbox.**
- **KDS mirrors the dashboard** on every read mode (401 terminal, everything else keeps the board) — the
  status split reached both.
- **The SW sits under both** and changes nothing for modes 3/4 (see §5).

---

## 2 · What still blanks, errors or stops — ranked

| Rank | Case | Likelihood | Operational cost |
|---|---|---|---|
| **1** | 🔴 **Cold launch during a backend outage → error screen.** Not authenticated ⇒ `:989`/`:1100` take the `setError` branch. **The board never appears** | **High** — an operator force-quits or the OS evicts the app during an incident | 🔴 **Total loss of the surface.** §5, §8 |
| **2** | 🔴 **A degraded-but-answering backend does not queue writes** (`orderGate:303`) | **High** — 1 Sept produced gateway 504s | 🔴 **The operator's action is simply lost.** Mode 3/4 |
| **3** | 🔴 **Stale-but-valid 200 clears the degraded banner** (`:980`) | **Medium** | 🔴 **Silent wrongness — the worst class.** Operator trusts a board that is not current |
| **4** | 🔴 **Outbox dead-letters a whole queue during a sustained outage.** 5 attempts (`MAX_ATTEMPTS`, `orderGate:33`) at 5/10/20/40/60s backoff ⇒ **~2-3 minutes** | **High** during any outage > 3 min | 🔴 **Every queued order becomes `conflict` and needs manual review.** §6 |
| **5** | **Web operators have no outbox at all** (`orderGate:309`) | Medium | Writes fail with no queue and no replay |
| **6** | **Four of five routes still uncapped at 300s** (§0) | High | Re-creates the client-amplification half of 1 Sept on the write path |
| **7** | **401 is terminal mid-service** (`:973`, `kds:599`) | Low — now only after a successful read | Correct by design; the residual risk is a route bug re-collapsing the split |

---

## 3 · The reachability signal today

🔴 **THERE ARE TWO, THEY ARE INDEPENDENT, AND ONLY ONE WAS FIXED.**

### A · `degradedSince` — the READ signal. ✅ Correctly derived.

| | |
|---|---|
| Where | `page.tsx:289` / `kds:481` |
| **Marks degraded** | **Any** non-ok while authenticated (`:989`), abort/timeout (`:1099`), any thrown error (`:1101`) |
| **Clears** | **The first `res.ok`** (`:980`, `kds:622`) |
| **Window** | 🔴 **NONE. One failure sets it; one success clears it.** No threshold, no debounce |
| Shown as | Amber strip: *"Can't reach the server. Showing orders from HH:MM. New orders may be missing."* (`:3031-3035`, `kds:1887`) |

> ✅ **It is derived from `/api/dashboard` itself — the route the app depends on — not from a probe.**
> ✅ **IT WOULD HAVE DETECTED 1 SEPTEMBER.** Reads ran at a 148s median; the 10s abort fires, `:1099`
> sets degraded, and the banner appears within ~10s of the first bad poll.

### B · `isOnline()` — the WRITE/replay signal. 🔴 Still the useless probe.

`lib/native/reachability.ts`: **`HEAD /api/ping`** (`:13`), every **10s** (`:14`), **3s** timeout
(`:15`), **3 consecutive fails ≈ 30s** to go offline (`:16`), **1 success** to return (`:17`).

> 🔴 **THIS IS THE PROBE THAT STAYED GREEN AT ~106ms THROUGHOUT 1 SEPTEMBER.** `/api/ping` does no auth
> and touches no database (`page.tsx:285`). **It would NOT have detected the incident, and it still
> would not.** It gates the offline banner and, critically, **whether `drainOutbox` runs** (§6).

⚠️ **The mitigating fact, READ at `reachability.ts:9-10` and confirmed at `orderGate:298-310`: writes
are NOT gated on this probe.** The gate is **reactive** — a write is queued because *it* failed, not
because the probe said offline. **That is the right design and it is why 1 September did not lose every
write.** **But the probe still decides when the queue drains.**

---

## 4 · A wrong degraded verdict, both directions

**These are two different decisions with two different costs, and conflating them is the error to avoid.**

### Direction 1 — WRONGLY DEGRADED (queue writes a healthy server would have accepted)

| | |
|---|---|
| What triggers it | A write exceeding **5s** (`LIVE_TIMEOUT_MS`), or the probe failing 3× while the API is fine |
| **Bound** | 🔴 **A healthy-but-slow server is indistinguishable from a dead one at 5s.** Nothing re-checks |
| Cost | The order takes a **provisional id** (`orderGate:283`). **The comment at `:267-278` records a real past incident: a customer's number changed under them (N41 → 41).** Replay is idempotent on `order_key`, so **no duplicate is created** |
| Recovery | Automatic on the next drain |

### Direction 2 — WRONGLY ONLINE (stay online while the backend is unusable)

| | |
|---|---|
| What triggers it | 🔴 **Exactly 1 September**: `/api/ping` green, `/api/dashboard` dead |
| **Bound for READS** | ✅ **Now bounded at ~10s** by `degradedSince` — the banner appears |
| **Bound for WRITES** | ⚠️ **5s per attempt, then queued** — bounded and self-correcting |
| 🔴 **Unbounded case** | **A backend that ANSWERS quickly with 5xx.** `orderGate:303` classifies that as "not offline" → **never queued, never retried, silently lost**. **No timeout saves this: the server answered** |

### 🔴 WHICH IS WORSE — and I am not softening this

> **DIRECTION 2 IS WORSE, AND ITS WORST FORM IS ALREADY LIVE.**

**A wrongly-queued write is recoverable**: the data exists on the device, replay is idempotent, and the
damage is a display number. **A write lost to a fast 5xx is not recoverable at all** — nothing holds it,
nothing retries it, and the operator's only evidence is a toast. **On a food truck the second one costs a
customer their food; the first costs a renumbered ticket.**

⚠️ **AND THE HIGHEST-COST OUTCOME IS NOT A WRONG VERDICT AT ALL.** §6: a **correct** degraded verdict
during an outage longer than ~3 minutes dead-letters the entire queue to `conflict`. **The system is
better at detecting the outage than at surviving it.**

---

## 5 · What can be served from cache — established from the code

**`public/sw.js`.** `DATA_CACHE` network-first for `GET /api/dashboard` and `/api/events/manage`
(`:113`), caching **only `res.ok`** since R6 (`:125-128`).

### 🔴 THE FALLBACK IS `.catch()` — IT ONLY FIRES ON A THROWN FETCH

`:129` returns the response as-is; `:131` `.catch(() => caches.match(...))`.

> 🔴 **A 503 IS RETURNED TO THE APP, NOT REPLACED BY THE CACHE.** The SW snapshot helps a **network
> drop**. **It does nothing for a degraded-but-answering backend** — which is what 1 September was.

### App ALREADY RUNNING vs COLD LAUNCH

| | Already running | 🔴 Cold launch |
|---|---|---|
| Board source | **React state in memory** — not the cache | Must come from the network or `DATA_CACHE` |
| Backend **unreachable** (throws) | ✅ Board stays; degraded banner | ⚠️ SW serves the cached `/api/dashboard` **if an entry matching that exact URL exists** (keyed with `event_id`/`date`/`pin`) |
| 🔴 Backend **degraded (503)** | ✅ **Board stays** — this is the win | 🔴 **ERROR SCREEN.** 503 passes through the SW, `authenticatedRef` is false, `:989` takes `setError` |
| Shell HTML | Already loaded | Navigation is network-first → `/offline.html` only on a throw (`:152-154`) |

**What an operator can DO with a kept board:** advance status, mark ready/done, take walk-ups — each
write is attempted, times out at 5s, and **queues on native**. ⚠️ **Composing a walk-up needs a menu +
stock snapshot, which is NOT built** (manual §11) — so the create path exists but the operator cannot
assemble an order offline. **Freshness is whatever `lastRefresh` says; there is no max-age.**

---

## 6 · The replay path

`drainOutbox` (`orderGate:326`) → `drainOnce` (`:340-384`). Triggered from `OfflineBanner.tsx` on
reachability **offline→online** (`:87-103`) and by `scheduleRetry` backoff **5/10/20/40/60s cap**
(`:67`).

| Protection | Present? |
|---|---|
| **Serialisation** | ✅ **Yes** — `drainInFlight` coalesces concurrent calls (`:319-329`) |
| **Backoff between drains** | ✅ **Yes** — 5→60s (`OfflineBanner:67`) |
| **Stops on a network-level failure** | ✅ **Yes** — `pending` + **`break`** (`:363-364`) |
| 🔴 **Stops on an HTTP 5xx** | ❌ **NO.** `:377-378` sets `pending` and **the loop CONTINUES to the next op** |
| **Re-enters degraded on first failure** | ❌ **No such mechanism.** `degradedSince` is dashboard-local and the drain never touches it |

> 🔴 **THIS IS THE FINDING.** Against a backend that is **up but degraded** — 1 September's exact shape —
> a single drain posts **every queued op in sequence**, each with a **30s** timeout (`DRAIN_TIMEOUT_MS`),
> with **no early exit**. **The drain is gated on `isOnline()`, which stayed green.** Serialisation stops
> two drains overlapping; **nothing stops one drain re-saturating the route.**

🔴 **AND IT BURNS THE QUEUE.** Every attempt increments `attempts`; at **`MAX_ATTEMPTS = 5`** the op
becomes `conflict` (`:375-376`) — auto-retry abandoned, manual review required. **Five drains at
5+10+20+40+60s ≈ 135 seconds.** **An outage of ~3 minutes or more dead-letters every queued write.**

---

## 7 · What is logged, and what an outage looks like to us

**`app/api/dashboard/route.ts`: 15 `console.error`, 3 `console.warn`, 🔴 ZERO `console.log`, and no
timing instrumentation** (grep for `Date.now()`/`performance.now()`/`duration` returns only an unrelated
`slotDurationMins`). **Client side: `console.warn` at `page:989`, `:1098`, `kds:615`.**

| | |
|---|---|
| **A slow-but-successful run** | 🔴 **Logs NOTHING.** No duration, no counter. **The 1 September signature — 148s median, all 200s — is invisible** |
| **A read failure** | `console.error` server-side (`route.ts:113`, `:121`); `console.warn` client-side |
| **Where it goes** | **Vercel function logs only.** No aggregation, no alert, no dashboard |
| **A client-side degraded state** | 🔴 **Never leaves the device.** The banner is local; nothing is reported |
| **An outbox dead-letter** | 🔴 **Nothing.** `state:'conflict'` is written to device storage and surfaced only in a dev inspector |

> 🔴 **AN OPERATOR FAILURE IS INVISIBLE TO US UNTIL THEY RING.** That is the honest answer.

**To see it in minutes, the minimum is:** (a) a **duration log on every `/api/dashboard` response**,
success included, with the status — one `console.log` closes the 1 September blind spot; (b) a **client
beacon when `degradedSince` is set**, so a fleet-wide event is visible without an operator; (c) an
**alert on p95 duration and on 503 rate**. ⚠️ **(b) must not use PostHog as it stands — the exposure
review found dashboard tokens already in `$current_url` with zero sanitisation.**

---

## 8 · What CANNOT be made resilient

| | What should happen instead | Does server-side auto-pause cover it? |
|---|---|---|
| 🔴 **Customer online ordering during a backend outage** | **Nothing client-side can help** — the customer's device has no cache of this truck and the order must reach the database to exist. **Fail fast and honestly** (`/api/menu` and `/api/orders/submit` are both **uncapped at 300s** — they hang instead) | ⚠️ **PARTIALLY.** Auto-pause is driven by **heartbeat staleness** (`truck_events.online_paused_until`). If the operator device cannot reach `/api/heartbeat`, the event pauses and customers are turned away cleanly. 🔴 **But if the DEVICE is fine and only the DB is degraded, heartbeats may still land — no pause, and customers meet a hanging checkout** |
| 🔴 **Cold launch while production is down** | The shells are **remote-URL Capacitor** (`server.url = …/app`) — **there is no local bundle to fall back to.** Best available: keep the SW `DATA_CACHE` snapshot usable on a 503, and show a *"can't reach the server — last board from HH:MM, read-only"* screen instead of an error | ❌ **No** |
| **Composing a walk-up offline** | Needs a cached menu + stock snapshot — **the write half is built, the read half is not** | ❌ No |
| **Anything requiring a server-assigned number, payment capture, or an email** | Queue and reconcile; never claim success | ❌ No |
| **Two devices diverging during an outage** | Already handled — `409` → `conflict` (`orderGate:372-374`) | n/a |

---

## 9 · Remaining work, ordered by value-per-risk

**Web change = a Vercel deploy (instant on both shells, since they load production).
Native release = an App Store / Play submission.**

| # | Work | Ships as | Risk | Why here |
|---|---|---|---|---|
| **1** | **Log duration + status on every `/api/dashboard` response** | **Web** | **Very low** — one line, no behaviour change | 🔴 **Highest value per risk in the list.** Closes the blind spot that made 1 September invisible for hours |
| **2** | **`maxDuration` on `action`, `menu`, `orders/submit`, `manage`, `heartbeat`** | **Web** | **Low** — a cap, not a behaviour change. ⚠️ Pick per-route; 30s may be wrong for `orders/submit` | Finishes the amplification fix that is currently 1 route of 5 |
| **3** | 🔴 **Queue writes on 5xx, not only on a thrown fetch** (`orderGate:303`) | **Web**¹ | **Medium** — changes write classification; needs the §4 direction-1 trade re-examined | Closes the **lost write**, §2 rank 2 |
| **4** | 🔴 **Break the drain on the first 5xx, and don't count outage failures toward `MAX_ATTEMPTS`** | **Web**¹ | **Medium** | Stops re-saturation **and** stops dead-lettering a good queue, §6 |
| **5** | **Staleness guard: reject/flag a 200 older than N, and don't clear the banner on it** | **Web** | Medium — needs a server timestamp in the payload | Closes the silent-wrongness case, §2 rank 3 |
| **6** | **Cold launch serves the `DATA_CACHE` snapshot read-only on a 503** | **Web (sw.js)** | 🔴 **High** — serving cache on an error response is exactly what R6 fixed; must not reintroduce cached-401 poisoning | §2 rank 1, but the riskiest to get wrong |
| **7** | **Derive `isOnline()` from real route failures, not `/api/ping`** | **Web**¹ | Medium-high — it gates drains; a wrong verdict stops replay | §3B. **Do AFTER 3 and 4**, or a better verdict just drains faster into a degraded backend |
| **8** | **A durable outbox for web operators** | **Web** | High — new persistence on a surface that has none | §2 rank 5 |
| **9** | **Cached menu + stock snapshot for offline walk-ups** | **Web + native** | High | Completes Stage B |

¹ **`lib/native/*` is TypeScript served from production to the WebView, so these ship as a web deploy —
no native release. Verified: the shells load `server.url`.** ⚠️ **A change to the Capacitor container
itself would need a release; none of 1-9 does.**

### Needs hardware, not a laptop

- 🔴 **Items 3, 4, 7 — the outbox on a real device.** Preferences storage, backgrounding and OS eviction
  cannot be simulated. **The manual already records a drain crash caused by frozen deserialised objects
  (`orderGate:347-349`) — found only on-device.**
- 🔴 **Item 6 — cold launch with the backend forced to 503**, on both shells.
- **Item 2 — that a capped route returns cleanly rather than truncating mid-write.**
- **The 30s KDS/dashboard degraded banner on the physical tablet**, at arm's length in daylight.

---

## What I could not establish

1. 🔴 **That production runs `e734989`.** Git says committed and pushed; **I did not query production.**
2. 🔴 **Any runtime behaviour whatsoever.** **No failure was induced, no client measured.** Every row in
   §1 is a source read.
3. **Whether `/api/heartbeat` kept succeeding on 1 September** — decides whether auto-pause fired and
   therefore whether customers were turned away cleanly. **§8 depends on it and it is UNKNOWN.**
4. **How many ops a real outbox holds during service** — decides how bad §6's dead-lettering is.
5. **Whether any shipped device still holds a poisoned pre-R6 cache entry** (`sw.js:122-124` says the fix
   does not clean existing entries).
