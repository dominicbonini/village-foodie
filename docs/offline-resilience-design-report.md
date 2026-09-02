# Design — keeping a trading truck working when the backend is degraded

**Design only. Nothing built, nothing changed.** Companion to
`docs/dashboard-incident-postmortem.md` and `docs/native-error-handling-report.md`.

---

## VERIFICATION

🔴 **This is a design document. Nothing in it has been built, run or verified.** No file was changed,
no SQL run, no migration, no deploy. **Every statement about existing code is a source read** — I did
not execute the app, and §9 exists because a source read is not a behaviour verification. **No
typecheck was run and none is offered as evidence.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

⚠️ **One carry-over to note:** the manual-delta task from the previous message was interrupted before
any edit. `docs/reference-manual.md` is byte-identical to its pre-task backup — **nothing was applied,
and that work is still outstanding.**

---

## THE FINDING THAT SHAPES THE WHOLE DESIGN

**The write side is already built to the standard being asked for. The read side has nothing.**

| | Write path (`lib/native/orderGate.ts`) | Read path (`/api/dashboard` fetch) |
|---|---|---|
| Timeout | ✅ **`AbortSignal.timeout(5_000)`** — `orderGate.ts:220,235` | 🔴 **NONE** — `page.tsx:926` is a bare `fetch` |
| Durable queue | ✅ Capacitor Preferences, one key per op, atomic | 🔴 none |
| Conflict handling | ✅ 409 → `conflict` state, never overwrites | 🔴 n/a |
| Provisional identity | ✅ `provisional_id`, `deviceLetter()`, `nextSeq()` | 🔴 n/a |

🔴 **SO DURING THE INCIDENT THE APP COULD PROBABLY STILL SAVE WORK IT COULD NO LONGER SHOW YOU.** A
tapped "Ready" would have hit the 5-second timeout, thrown, and queued durably. **The board it was
tapped on hung for 148 seconds and then blanked.** ⚠️ **I have not verified this happened — it is what
the code is written to do, and the operator's report does not tell me either way.**

**The corollary is the good news in this report: most of what is being asked for is a read-side
equivalent of machinery that already exists, plus one change to the signal that drives it.**

---

## 1. The reachability model

### What is wrong today

`lib/native/reachability.ts` is a **binary** `online: boolean`, decided solely by
`HEAD /api/ping` — 10s interval, 3s timeout, 3 consecutive failures to go offline, 1 success to return.

**Why a trivial probe cannot serve this, stated as a principle rather than an anecdote:**

> 🔴 **A PROBE MEASURES ONLY THE DEPENDENCIES IT EXERCISES.** `/api/ping` is a synchronous
> `NextResponse.json({ok:true})` with no auth and no database. It shares exactly **one** dependency
> with `/api/dashboard`: that the Vercel function platform is up. **It cannot observe Supabase,
> PostgREST, GoTrue or the gateway — every layer that actually failed.**

It answered "online" correctly and uselessly every 10 seconds for two and a half hours. ⚠️ **The module
already argues this one layer down** — it rejects `navigator.onLine` because it is *"true on a
connected-but-dead uplink"*. **The same sentence condemns `/api/ping`: 200 on a connected-but-dead
backend.** The author found the class and stopped one layer short.

### The proposed model — three states, not two

| State | Meaning | Board | Writes |
|---|---|---|---|
| **ONLINE** | Data is arriving within budget | Live | Sent |
| **🔴 DEGRADED** | Server reachable, data path failing or too slow | **Last-known-good, marked stale** | **Queued** |
| **OFFLINE** | Server not reachable at all | Last-known-good, marked stale | Queued |

**DEGRADED is the state that did not exist, and it is the entire gap.**

### What marks it DEGRADED

**Signal source: the outcome of the real data routes, not a probe.** Specifically `GET /api/dashboard`
(read) and `POST /api/dashboard/action` (write) — **the routes the operator actually depends on.**

Enter DEGRADED on **any two** of these within a **rolling 90-second window**:

| Failure class | Threshold | Why this class |
|---|---|---|
| **Latency over budget** | response > **8s** | Healthy is ~750ms (15 waves × ~50ms). 8s is ~10× headroom. |
| **5xx / 504** | any | Server-side failure, unambiguous. |
| **Thrown fetch after the new read timeout** | any | Client gave up (see §8, c2). |
| 🔴 **401 while already authenticated** | any | **The incident's own signature.** Belt-and-braces even after the server fix — see the ordering note below. |

**Two events, not one** — a single slow poll during a deploy or a cold start must not flip a live
board. **90 seconds** because the poll is 60s: two events means two consecutive polls.

### What clears it

**One successful `/api/dashboard` within budget → ONLINE immediately.** Matching the existing
`OK_THRESHOLD = 1`, and for its stated reason: fast recovery triggers prompt outbox replay. **Slow to
alarm, fast to forgive.**

⚠️ **No exponential re-entry damping in v1.** A flapping backend would flip the banner repeatedly. **I
would rather ship the honest flapping and see it than pre-build a smoother that hides the signal** —
but it is a known rough edge, not an oversight.

### 🔴 Keep `/api/ping` — demoted from oracle to discriminator

**Yes, it should be kept, for exactly one job it is uniquely good at.**

```
data route failing  +  /api/ping OK      →  DEGRADED   (the backend is broken)
data route failing  +  /api/ping failing →  OFFLINE    (we are off the network)
```

**It cannot tell you the backend is healthy. It can tell you the device still has a network**, which is
precisely what separates the two failure states — and that distinction changes what the operator is
told and whether "check your signal" is honest advice. **Its 3-second `AbortController` and debounce
are well-judged for that narrower job and should stay.**

### 🔴 The lever this pulls for free

`orderGate.ts:297` already reads:

```js
if (isNativeApp() && online === false) return queue()
```

**The write gate already queues the moment reachability says offline.** So a reachability model that
recognises DEGRADED **automatically makes the existing, durable, conflict-aware outbox engage during a
backend degradation** — with no change to the outbox itself. ⚠️ **And that is also the risk: it starts
queueing writes in a state where the server may still be accepting them. §3 is where that is bounded.**

**Files:** `lib/native/reachability.ts` (rewrite), `lib/native/network.ts` (unchanged),
`app/dashboard/[token]/page.tsx:1056` and `kds/page.tsx` (subscribe to three states),
`lib/native/useOfflineAlert.ts`, `useOfflineStatusOverlay.ts`, `useOfflinePaymentOverlay.ts` (widen
from boolean).

⚠️ **`startReachability()` is native-gated today** (`page.tsx:1056`: `if(!isNativeApp())return`). **The
web dashboard has no reachability at all** and would need the same model to benefit. **That is a
decision to take, not an assumption — the web dashboard has no outbox, so queueing writes there is not
available.**

---

## 2. Keep-state behaviour, per surface

### Dashboard — `app/dashboard/[token]/page.tsx`

**What stays on screen: everything.** The orders are already in React state and **nothing clears
them** — verified by searching for any clear on a failure path; the only `setOrders([])` calls are in
the KDS event-scope guard. **The board is hidden by a render gate, not emptied.**

| Change | Line | Behaviour |
|---|---|---|
| Make the 401 branch conditional | **`:927`** | `if(res.status===401 && !authenticatedRef.current)` — otherwise warn, mark DEGRADED, keep state. **The 429, non-ok and catch branches at `:931/:936/:1035` already do this. This is the one that does not.** |
| Make the error gate non-fatal once authenticated | **`:2782`** | `if(error && !authenticated)` → full-page error. Otherwise render the board **plus a degraded banner**. |
| Staleness indicator | `:1013` sets `setLastRefresh(new Date())` — **the value already exists** | Banner shows "Showing orders from HH:MM". |

**What the operator is told:** §7.

**What they can do against stale data:**

| Allowed | Rationale |
|---|---|
| ✅ View all orders, notes, items, customer details | Read-only, already on the device |
| ✅ Advance status: confirm → cooking → ready → collected | Queues; conflict-aware on replay (§3) |
| ✅ Assign / clear buzzers | Queues; local-only meaning |
| ✅ Take a walk-up order | Queues with a provisional number (§4) |
| ✅ Reprint / re-view a ticket | Local render |

| Blocked, and visibly so | Rationale |
|---|---|
| 🔴 **Refunds and cancel-with-refund** | Money. §3. |
| 🔴 **Stock and capacity numbers presented as authoritative** | The snapshot is stale; **show them greyed with "approximate"**, per the manual's own *"offline — stock approximate"* design |
| 🔴 **Settings / plan / menu edits** | No queue kind exists for them; they must fail honestly |
| ⚠️ **Believing the order list is complete** | 🔴 **The most dangerous item on this page.** New customer orders placed just before the outage may not be on the device. **The banner must say the list may be incomplete, not merely stale.** |

### 🔴 How genuine revocation is still honoured

**This is the security question and it has a clean answer, but only in this order:**

1. **Fix the server first** (§8 R1): `route.ts:81` returns **503** when the read *errored* and keeps
   **401** only for `!truck` — an authoritative "this token does not exist".
2. **Then a 401 means what it says**, and the client can treat it as terminal: eject, clear state, show
   the real access-denied screen.

⚠️ **Until R1 ships, the client-side keep-state change (R2) means a revoked token leaves a working
board on screen until reload.** **That is a real security trade and it must be a decision, not a side
effect.** My reading: **for a mid-service operator it is the right trade** — the token is a bearer
credential whose revocation response is rotation, and rotation takes effect on the next successful
load — **but ship R1 and R2 together and the trade largely disappears.**

⚠️ **Residual either way:** a board already rendered keeps rendering until the next successful fetch.
**There is no server push that can revoke a rendered page**, and designing one is out of scope here.

### Kitchen screen — `app/dashboard/[token]/kds/page.tsx`

🔴 **Worse than the dashboard and needs more work.** It collapses 401 **and** every non-ok status into
a single `throw` (`:555`, `:563`) caught at `:718`, and `:1788` is `if (error || !truck) return` — **a
full-screen replacement with no keep-state path at all.**

| Change | Line | Behaviour |
|---|---|---|
| Add an authenticated flag | new | The KDS has **no `authenticatedRef` equivalent** — it must gain one |
| Stop throwing on non-ok | `:563` | Mark DEGRADED, keep the board |
| Stop throwing on 401 once authenticated | `:555` | As the dashboard |
| Make the error gate conditional | `:1788` | Render the board + banner unless never-authenticated |

✅ **Keep the wording.** *"Could not load orders"* was the honest message on the day. **Fix the
behaviour and keep the words.**

⚠️ **The KDS is a cook-facing screen in a moving kitchen. Changing when it blanks is higher risk than
the same change on the dashboard** — it is the surface where a stale ticket becomes wasted food.

---

## 3. What may queue while degraded

**Working from what the outbox already supports:** `OutboxKind = 'create' | 'status' | 'edit' |
'stock' | 'buzzer'` (`lib/native/outbox.ts:67`).

| Kind | Queue? | Reconciliation on reconnect | Conflict |
|---|---|---|---|
| **`status`** — confirm / cooking / ready | ✅ **Yes** | Replay oldest-first; server applies if the transition is still legal | ✅ **Built**: server returns **409** for terminal states (`cancelled`/`rejected`), op flagged `conflict`, **never overwrites**. Surfaced by `useOutboxConflicts.ts` |
| **`buzzer`** | ✅ **Yes** | Last-write-wins per order | Buzzer already reassigned → flag; the manual's buzzer-loss banner already exists |
| **`create`** — walk-up | ✅ **Yes** | Insert with `order_key` (idempotent) and reconcile `provisional_id` → real display number | Duplicate replay prevented by `order_key` idempotency |
| **`stock`** | ⚠️ **Yes, but presented as approximate** | Last-write-wins | 🔴 **No true conflict detection — it is a counter, not a state machine.** Two devices decrementing diverge. **The manual's own rule applies: rare over-sell flagged, not prevented.** |
| **`edit`** — items / price / slot | 🔴 **NO in v1** | — | **Repricing against a stale menu can change what a customer owes.** Queue it only after the money rules below are settled. |

### 🔴 Money and refunds — flagged separately, and conservative

**`PLAIN_PAID_ACTIONS = new Set(['mark_paid', 'collected'])` (`orderGate.ts:60`) — these already route
through the gate and would already queue.**

| Action | Recommendation | Why |
|---|---|---|
| **`collected`** (no payment) | ✅ Queue | A state change. The customer has the food. |
| ⚠️ **`collected_cash` / `collected_card`, `mark_paid`** | ⚠️ **Queue, but ONLY as a record of what the operator did** — never as an instruction to move money | Cash is already in the till; the queue is bookkeeping. **The gate's own comment already says these "take money as they complete".** |
| 🔴 **Refunds, and `cancel` carrying `refunded_minor`** (`page.tsx:2421`) | 🔴 **DO NOT QUEUE. Block, with a clear message.** | It writes an `order_payments` row against a **live Stripe key**. **This truck already carries 24 `livemode:true` rows, 19 of them attached to seeded orders.** A refund replayed against a state that changed under it is an irreversible money movement made on stale information. |

> 🔴 **THE RULE: A QUEUED WRITE IS A PROMISE TO REPLAY A DECISION MADE ON STALE DATA. THAT IS
> ACCEPTABLE FOR A TICKET'S STATUS AND UNACCEPTABLE FOR A REFUND.** Refunds wait for ONLINE and are
> re-confirmed by the operator against fresh data.

⚠️ **The bounding risk of the whole section:** DEGRADED is *reachable*, so the server may be accepting
some writes. **Queueing a write the server would have taken means the operator's action is delayed
rather than lost — acceptable. But if the drain later replays it against a changed world, the 409 path
is what saves us**, and that path is only proven for `status`. **`stock` and `buzzer` have no
equivalent, and `edit` is excluded for that reason.**

---

## 4. Walk-up orders while degraded

### 🔴 Most of this is already built — more than the manual's "NOT BUILT" line implies

| Component | Status | Evidence |
|---|---|---|
| `create` outbox kind | ✅ **Built** | `outbox.ts:67` |
| Wired to the Add Order panel | ✅ **Built** | `AddOrderPanel.tsx:1215` — `kind:'create', order_key, online: isOnline()` |
| Device-prefixed provisional numbers | ✅ **Built** | `outbox.ts:78` `provisional_id` ("e.g. 'A13'"), `deviceLetter()` `:101`, `nextSeq()` `:113` |
| Durable storage | ✅ **Built** | Capacitor Preferences, one atomic key per op |
| Idempotent replay | ✅ **Built** | keyed on `order_key` |
| Payment capture at creation | ✅ **Built** | `paymentTaken` rides on the create op (`action/route.ts:1684`) |

⚠️ **The manual records the read side as agreed-design-not-built and calls it "the biggest pending
native build". For the WRITE half of walk-ups that is out of date** — the write half exists. **What is
missing is everything that lets the operator *compose* an order without the server.**

### What does not exist

1. 🔴 **A last-known-good menu + stock snapshot.** `AddOrderPanel` builds from `/api/menu`, fetched
   live (`page.tsx:869`). **Degraded ⇒ no menu ⇒ no order can be composed.** *(I read the fetch; I did
   not verify the panel's behaviour when it is absent.)*
2. **A local capacity/stock countdown** from that snapshot.
3. **A reconciliation UI** mapping `A13` → the real number after replay.
4. **The DEGRADED trigger itself** (§1) — without it none of the above engages.

### Build stages, smallest useful slice first

| Stage | What | Depends on | Rough size |
|---|---|---|---|
| **A** | **Nothing new — just §1.** Reachability recognises DEGRADED, so the built create path engages. **Composing still needs a cached menu, so this alone helps only while the panel already holds one.** | §1 | **Zero new build** |
| **B** | **Persist the menu + stock snapshot** to Preferences on every successful `/api/menu`; `AddOrderPanel` reads it when degraded, banner "prices and stock from HH:MM" | A | **Small.** One write, one read, one banner |
| **C** | **Local capacity/stock countdown** from the snapshot, decrementing per queued create; "approximate" throughout | B | **Medium.** Reuses `lib/slot-capacity.ts` / `prep-utils.ts` (both pure, no I/O) |
| **D** | **Provisional→real reconciliation UI** on drain | A | **Medium.** `useOutboxConflicts` is the pattern |
| **E** | Queue `edit`, once the money rules are settled | C, D | **Larger. Not in this pass.** |

🔴 **Stage B is the whole slice that turns "cannot take an order" into "can take an order".** Stages
C–E make it *good*; B makes it *possible*.

---

## 5. 🔴 THE COLD-BOOT LIMIT — costed, not recommended

**The constraint, confirmed:** `capacitor.config.ts:28` sets `server.url = <base>/app`, and
**`ios/App/App/public` is EMPTY** — there are no local web assets. **`webDir: 'out'` is configured but
nothing is synced into the app.** So an app killed and relaunched during an outage **has literally
nothing to execute.** ⚠️ **The failure is worse than a blank board: it is a blank app.**

**Four options. Costs stated; no recommendation.**

### Option A — Bundle a minimal local shell

Ship a small local `/app` entry that renders from the outbox + last snapshot, and hands over to
production when reachable.

- **Cost:** a real native build. **🔴 Every change to the bundled shell requires a store submission on
  both platforms** — days on Play, and **this is exactly the property the remote-URL architecture was
  chosen to avoid.**
- **Web iteration loop:** **split in two.** Bundled code ships on store timescales; everything else
  ships instantly. **Two release cadences in one product is the cost that compounds.**
- **Store submission:** required, and 🔴 **a review is in progress now** — a new binary would replace
  the one under review.
- **Upside:** the only option that survives a cold boot with **no network at all**.

### Option B — Service-worker cached shell

Let the existing SW (`public/sw.js`, registered at `page.tsx:205`, `kds:877`) serve the app shell from
`SHELL_CACHE` on navigation.

- **Cost:** small, **web-only, no store submission**, ships with everything else.
- **Web iteration loop:** untouched.
- ⚠️ **Requires fixing the SW first.** Today `:144` falls back only to `/offline.html`, and the data
  cache has **no `res.ok` check at `:117`** — so **the 401s from this incident may already be cached as
  the "good" snapshot** (unverified, §6 of the native report).
- 🔴 **NOT VERIFIED: whether the SW is registered and active in the Capacitor WKWebView/Android
  WebView, and whether it survives an app kill.** **The whole option rests on that, and I have not
  tested it.** Registration is *called*; that is not the same as active.

### Option C — Hybrid boot shim

A tiny bundled page (Option A's mechanism, ~one file) whose only job is: reachable → redirect to
production; not reachable → load the cached shell / outbox view.

- **Cost:** a native build **once**, then it rarely changes. **One store submission, not a cadence.**
- **Web iteration loop:** effectively untouched — the shim is a router, not the app.
- ⚠️ **"Rarely changes" is a hope, not a guarantee.** Every bug in the shim costs a submission.

### Option D — Accept it

Document that a cold boot during an outage does not work; rely on the app staying resident.

- **Cost:** zero to build. 🔴 **The risk is real and outside our control** — Android kills backgrounded
  WebView apps under memory pressure, and a service day is long. **An operator who backgrounds the app
  to answer a call may return to a dead one.**
- **Honest note:** this is today's behaviour, undocumented. **Choosing it means choosing it, not
  drifting into it.**

**The axis to decide on: A and C buy true cold-boot survival at the price of a native release cadence.
B is nearly free but rests on an unverified assumption. D costs nothing and leaves a real hole.**

---

## 6. What cannot be made to work

### 🔴 Customer online ordering during a backend outage — CONFIRMED IMPOSSIBLE

**Not "hard". Impossible, for a structural reason:**

- The customer is on **`/trucks/<slug>/order` in a normal browser**, arriving via a QR scan. **No app,
  no outbox, no Preferences, no prior state.**
- The page's first paint needs `/api/menu/<truckId>` — **22 Supabase reads.** With the backend down
  there is nothing to render.
- **Even a perfect client cannot help:** placing an order requires **writing to the database**. There
  is no device to hold it, no identity to reconcile it against, and no way to tell the customer their
  order exists.
- 🔴 **And the failure is worse than a blank page — it is a silent double-charge risk.** A customer who
  retries a payment against a degraded backend cannot be told whether the first attempt landed.

**The operator's app can keep working because it has already-fetched data, a durable queue and a
trusted device. A first-time customer browser has none of those three.**

### Does the existing server-side auto-pause cover it? — 🔴 NO

**And this is worth stating plainly because the name invites the assumption.**

Offline auto-pause fires when the **truck's device stops sending heartbeats** — it protects against a
truck that cannot see incoming orders. **It is triggered by device silence and executed by the
server.**

**In a backend outage both halves fail:**
1. The trigger is wrong — the device is **online** and heartbeating; it is the backend that is broken.
2. **The executor is the thing that is down.** Auto-pause writes a pause to the database through the
   same layer that is failing.

⚠️ **It was OFF during this incident in any case** — established, and not to be conflated with client
offline mode.

### What should happen for customers instead

| Option | Where | Honest cost |
|---|---|---|
| **A static "ordering temporarily unavailable" page** at the edge | `proxy.ts` / a Vercel edge response, **no Supabase dependency** | 🔴 **Requires knowing the backend is down — the same detection problem as §1, at the edge, where there is no client history.** Simplest form: catch a `/api/menu` 5xx/timeout client-side and render a static card. |
| **Nothing — let it fail** | — | Today's behaviour. The customer sees a broken page and blames the truck. |

🔴 **THE ONE THING THAT MUST NOT HAPPEN: telling a customer their order was placed when it was not.**
The manual already records that exact false promise as a shipped defect — the old service worker's
fake `{ok:true, queued:true}`. **A customer-side queue would reintroduce it in the one place where
there is no device to make it true.**

---

## 7. How the operator knows

**Governing rule, from the manual: never tell an operator something is saved unless it is durably
stored.** The gate already honours this — `queued: true` is returned **only after** `enqueue()` has
written to Preferences. **Every message below must inherit that discipline: the count comes from
`listOps()`, never from an optimistic counter.**

### The indicator

**A persistent bar under the header — not a toast.** `components/native/OfflineBanner.tsx` exists and
is the place to extend.

| State | Text | Colour |
|---|---|---|
| **ONLINE** | *(nothing)* | — |
| **DEGRADED** | **"Can't reach the server. Showing orders from 14:32. New orders may be missing. 3 changes saved on this device."** | Amber |
| **OFFLINE** | **"No connection. Showing orders from 14:32. New orders may be missing. 3 changes saved on this device."** | Amber |
| **Recovering** | "Reconnecting — syncing 3 changes…" | Blue |
| **Resolved** | "Back online. 3 changes synced." → auto-dismiss ~5s | Green |
| **Resolved with conflicts** | 🔴 **"Back online. 2 synced, 1 needs review." → tap to review.** **Does not auto-dismiss.** | Red |

### Wording rules

- 🔴 **"Saved on this device" — never "saved".** It is true (Preferences), and it tells the operator
  where the truth currently lives.
- 🔴 **"New orders may be missing" is mandatory, not optional.** Stale-and-complete and
  stale-and-incomplete are different risks, and only the second can cost a customer their food.
- **Always name the time**, from `lastRefresh` (`page.tsx:1013`). **"14:32" is actionable; "stale" is
  not.**
- **DEGRADED and OFFLINE differ only in the first sentence** — the operator's actions are identical, so
  the distinction is diagnostic, not instructional.
- ⚠️ **Never say "your changes will be sent" without a count.** Zero queued changes with a reassuring
  message is the false promise in a new costume.

**Files:** `components/native/OfflineBanner.tsx`, `lib/native/useOfflineAlert.ts`,
`useOfflineStatusOverlay.ts`, `app/dashboard/[token]/page.tsx`, `kds/page.tsx`.

---

## 8. Ordering by value-per-risk

### Batch 1 — ships together, no hardware gate

**Highest value, lowest risk. This batch alone prevents a recurrence of what the operator saw.**

| # | Change | Files | Live-surface risk |
|---|---|---|---|
| **R1** | 🔴 **Server: 503 when the read errored; 401 only for `!truck`** | `app/api/dashboard/route.ts:81` | ⚠️ **MEDIUM — changes a status code every consumer reads.** The dashboard `:936` and KDS `:563` already handle non-401. **Check every consumer first.** |
| **R2** | 🔴 **Client: 401 branch consults `authenticatedRef`** | `page.tsx:927` | **LOW. ~10 characters.** Pair with R1 (§2 revocation trade). |
| **R3** | **Error gate non-fatal once authenticated** | `page.tsx:2782` | **LOW–MEDIUM.** Board renders where it previously did not. |
| **R4** | **In-flight guard on `fetchAll`** | `page.tsx:919`, `kds/page.tsx` | **LOW.** 🔴 **Highest systemic value — caps the amplification that doubled the outage.** |
| **R5** | **`AbortSignal.timeout(10s)` on the dashboard read; abort on unmount** | `page.tsx:926,1546`, `kds:552,1387` | **LOW.** Feeds the existing `catch` at `:1035`. |
| **R6** | **SW: `if (res.ok)` before `cache.put`** | `public/sw.js:117` | **LOW**, and stops further poisoning. |
| **R7** | **`export const maxDuration = 30`** | `app/api/dashboard/route.ts` | **LOW.** Blast radius, not usability. |

### Batch 2 — needs hardware testing

| # | Change | Files | Risk |
|---|---|---|---|
| **R8** | 🔴 **The three-state reachability model** | `lib/native/reachability.ts` + subscribers | 🔴 **HIGHEST RISK IN THIS DOCUMENT.** `isOnline()` gates outbox replay and stamps every queued write. **A wrong DEGRADED starts queueing writes the server would have accepted.** **Must be tested on hardware against a real slow backend.** |
| **R9** | **KDS keep-state path** | `kds/page.tsx:555,563,719,1788` | **MEDIUM.** Cook-facing; stale tickets waste food. |
| **R10** | **Degraded banner + staleness** | `OfflineBanner.tsx`, both pages | **LOW–MEDIUM.** Depends on R8. |
| **R11** | **Menu/stock snapshot (Stage B)** | `AddOrderPanel.tsx`, new Preferences store | **MEDIUM.** Stale prices on a real order. |
| **R12** | **Block refunds while degraded** | `page.tsx:2421`, `orderGate.ts` | **LOW to build, HIGH to get wrong.** Money. |
| **R13** | **Verify + invalidate the SW cache** | device inspection | **Unknown until inspected.** |

### Batch 3 — decision required first

**R14 — the cold-boot option (§5).** ⚠️ **Options A and C require a native build and a store
submission.**

### 🔴 Deploy posture

**A store review is in progress and both shells load production.** Every batch-1 change is a **web**
change: it ships to `main`, reaches a shipped App Store app and an in-review Play build **instantly,
with no rebuild** — and **changes what a reviewer sees mid-review.**

**Batch 1 should ship as ONE deploy**, not seven, and **be verified on the deployed build** — a fix in
the repository is not a fix in production.

---

## 9. Verification — failing cases that must bite

🔴 **Every test below is constructed so it CANNOT pass unless the behaviour exists.** No typecheck. No
"it loaded fine". **State which component each request actually reached.**

### The rig

**The hard part is producing DEGRADED without producing OFFLINE** — `/api/ping` must stay fast while
`/api/dashboard` is slow. Options, in order of fidelity:

1. **An on-device proxy** (Charles/mitmproxy on the tablet's wifi) with a **60-second delay rule on
   `/api/dashboard` only**. 🔴 **The only rig that reproduces the incident exactly.**
2. A preview deployment with an artificial `await sleep(60_000)` in the route. ⚠️ **Never on
   production.**
3. `setSimulatedOffline(true)` — **dev-only, and it tests OFFLINE, not DEGRADED.** ⚠️ **Insufficient
   on its own; it is the check that passes because nothing ran.**

### The cases

| # | Test | 🔴 Must bite |
|---|---|---|
| **V1** | Proxy delays `/api/dashboard` 60s; `/api/ping` untouched. Load the board first, then enable the delay. | Board **stays on screen**; amber banner names a time; **"Access denied" never appears**. *Fails today.* |
| **V2** | With V1 running, tap Ready on three orders. | Banner reads **"3 changes saved on this device"**. 🔴 **Then force-quit the app, relaunch, reconnect — all three must still replay.** **Killing the app is the part that proves durability; without it this tests a variable.** |
| **V3** | Point `/api/dashboard` at a stub returning **401** with a **valid** token. | Board stays; banner shows degraded. **Distinguishes R2 from a cosmetic change.** |
| **V4** | 🔴 **Genuinely revoke the token** (rotate `dashboard_token`), then reload. | **Full access-denied screen. Ejects.** **This is the security counter-test and it must still fail closed.** |
| **V5** | Same delay on the **KDS**. | Tickets stay; "Could not load orders" **does not** replace the board. |
| **V6** | Airplane mode with the board loaded. | **OFFLINE** banner ("No connection"), not DEGRADED. **Proves `/api/ping` is still doing its discriminator job.** |
| **V7** | Delay `/api/dashboard` 60s, watch the network trace for 3 minutes. | 🔴 **At most ONE in-flight request at a time.** Counts requests — **the direct test of R4 and of the amplification that doubled the outage.** |
| **V8** | Degraded, then attempt a refund. | **Blocked with a clear message.** **No `order_payments` row exists afterwards** — verified **in the database**, not from the UI. |
| **V9** | Degraded, take a walk-up order. | Provisional number (`A13`); after reconnect it reconciles to a real number **and there is exactly ONE order row** — idempotency proven, not assumed. |
| **V10** | Advance an order offline that is **cancelled server-side** in the meantime. | **409 → conflict flagged, not overwritten**, and surfaced for review. **The conflict path only counts as built when it has been made to fire.** |
| **V11** | Force-quit during the outage and relaunch. | 🔴 **Documents the cold-boot limit.** **Expected to FAIL today** — run it so the failure is recorded, not discovered live. |
| **V12** | Inspect Cache Storage on the tablet (Web Inspector → Storage). | Establishes whether the SW cache **holds a poisoned 401**, and whether the SW is **active at all** in the WebView. 🔴 **§5 Option B depends entirely on this and it is currently unverified.** |

**V1, V2, V4 and V7 are the minimum set.** They cover: the board survives, the queue is durable across
a kill, revocation still works, and we stopped amplifying.

---

## What I could not establish

1. **Whether the outbox actually queued anything during the incident.** The 5s write timeout says it
   should have. **Not verified** — device inspection of Preferences would settle it.
2. **Whether the service worker is registered and active in either WebView, and whether it survives an
   app kill.** **§5 Option B rests on this.** (V12)
3. **Whether `DATA_CACHE` holds a poisoned 401.** Spec-reasoned only. (V12)
4. **How `AddOrderPanel` behaves with no menu available.** I read the fetch, not the failure path.
5. **Whether the web dashboard should get the same model** — it has no outbox, so queueing is
   unavailable there. **A decision, not a finding.**
6. **Real p50/p99 per Supabase round trip.** The 8s DEGRADED budget is reasoned from ~50ms healthy;
   **it should be set from measurement.**
7. **Whether other operators saw the same failure.** One device, one report.
