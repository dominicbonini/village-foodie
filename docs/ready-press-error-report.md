# "Can't reach the server" flashed on every Ready press — investigation, cause and fix

**Date** 19 September 2026 · **Scope** localhost only, nothing deployed · **Truck** test-truck (Pizza
Kitchen), "Bures Music Festival". Pizzeria Gusto was never called, read or written.

**The report.** With "Completing an unpaid order" set to **One press**, every press of **Ready** briefly
showed a header message about not reaching the server, which cleared itself after a few seconds. The
order went Ready correctly. Mid-investigation Dominic added that **placing an order does it too**.

**The answer, in one line.** The server was never unreachable. A dashboard read that the client
**deliberately aborted and replaced with a newer one** was reported as a connectivity failure, because
nothing distinguished our own abort from the 10-second read timeout — they share one `AbortController`
and reject with the same exception. This is a regression from 18 September, when operator actions were
given the right to supersede an outstanding read rather than be dropped.

**The completion setting is not the cause.** It changes nothing about the Ready request sequence; the
harness asserts the two are byte-identical. See *Anything I could not establish*.

---

## git status — before

**0 staged · 38 modified · 108 untracked · 146 entries.**

Modified (tracked):

```
android/app/capacitor.build.gradle          lib/capacity-breach.ts
android/capacitor.settings.gradle           lib/features.ts
app/api/dashboard/action/route.ts           lib/orders/place-in-slot.ts
app/api/dashboard/route.ts                  lib/payments/promote-draft.ts
app/api/events/route.ts                     lib/plan-features.ts
app/api/manage/route.ts                     lib/printing/bleTransport.ts
app/api/menu/[truckId]/route.ts             lib/printing/transport.ts
app/api/orders/submit/route.ts              lib/printing/usePrinting.ts
app/api/slots/[truckId]/route.ts            lib/slot-availability.ts
app/dashboard/[token]/page.tsx        ←     lib/slot-bookings.ts
app/landing/page.tsx                        lib/slot-display.ts
app/manage/[token]/page.tsx                 lib/slot-generation.ts
app/trucks/[slug]/order/page.tsx            lib/supabase.ts
components/dashboard/AddOrderPanel.tsx      package-lock.json
components/dashboard/CapacityBreachBanner.tsx  package.json
components/printing/PrintingSettings.tsx    scripts/migrate-from-sheets.cjs
content/store-listing.md                    scripts/register-payment-domain.cjs
docs/reference-manual.md                    scripts/whatsapp-golive-parity-harness.cjs
ios/App/App/Info.plist
ios/App/CapApp-SPM/Package.swift
```

Untracked, by directory: `scripts/` 51 · `docs/` 40 · `supabase/migrations/` 5 · `lib/printing/` 4 ·
`lib/` 3 · `scripts/fixtures/` 1 · `plugins/` 1 · `lib/orders/` 1 · `components/printing/` 1 ·
`app/api/printing/` 1.

---

# ESTABLISH

## §1 — The exact string, and every path that can raise it

The string is the dashboard's **degraded strip**, rendered in `DashboardPage`:

> **Can't reach the server. Showing orders from 14:30. New orders may be missing.**

It is an amber full-width bar under the header, gated on `degradedSince && !error`. It is not a toast,
deliberately: the condition outlives a toast.

There are several other "can't reach" surfaces in the app, and none of them is this one:

| surface | symbol | why it is not this |
|---|---|---|
| offline banner | `OfflineBanner` | says "📴 No connection — N changes saved on this device"; driven by `reachability`, not by a fetch |
| board-unavailable screen | `enterBoardUnavailable` | a red full-page state for a first load that failed; the board did load here |
| PIN error | `setPinError` | only on a 503 at the PIN gate |
| Add Order submit | `showToast` in `submitManual` | "Couldn't reach the server — you appear to be offline. The order was NOT sent." A toast, and it says the order was not sent |
| printer | `netTransport` | "Can't reach the **printer**" |

**The one that fires here** is `setDegradedSince` inside `fetchAll`, and specifically this branch:

```ts
if(ctrl.signal.aborted&&authenticatedRef.current){
  console.warn('[fetchAll] dashboard read aborted after',READ_TIMEOUT_MS,'ms or superseded — keeping existing state; the 60s poll retries')
  setDegradedSince(prev=>prev??new Date())
}
```

It clears on the next response of any kind: `if(res.ok) setDegradedSince(null)`. That is the
"clears itself after a few seconds".

## §2 — The Ready press, end to end, under both settings

**Client.** `OrderCard` renders `<Btn label="Ready" … onClick={() => onAction('ready', order.order_key)}/>`
— one call, with no reference to `completionPresses`. `onAction` is the page's `doAction`:

| # | method | route | body | optimistic? | retried? |
|---|---|---|---|---|---|
| 1 | POST | `/api/dashboard/action` | `{token, pin, action:'ready', order_key, defer_email:true}` | no — the card waits on it | no (offline → durable outbox via `gatedAction`) |
| 2 | GET | `/api/dashboard?token…&event_id…` | — | — | yes, the 60 s poll |
| 3 | POST | `/api/dashboard/action` | `{token, pin, action:'send_ready_email', order_key}` | — | no; cancelled if Undo is pressed inside 4 s |

Request 2 is `await refetch()`, the last line of `handleGateResult`. Request 3 is `scheduleReadyEmail`,
a 4-second `setTimeout` in `useReadyEmailUndo` — the Undo window.

**Server.** The `ready` branch of `app/api/dashboard/action/route.ts` reads the order, writes
`orders.status = 'ready'`, and calls `rebuildProductionSlotUsage` for the date. **It does not read
`completionPresses` at all.**

**What the setting actually changes.** `resolvePaidStep(truck, event).completionPresses` resolves
`event.completion_presses_override ?? truck.completion_presses ?? (showPaidStep ? 'two' : 'one')`. Its
readers are:

- `OrderCard` `completionBtn` — which **completion** button to render ("Mark paid & collected" vs
  "Mark paid" then "Collected"). Paid-ness is tested first, so an already-paid order is offered
  "Collected" whatever the setting says.
- `app/api/dashboard/action/route.ts`, the `undo_collected` branch — `splitPaidStep` decides whether an
  undo reverses the payment as well as the status.
- `app/manage/[token]/page.tsx` — the settings radio.

**None of them is on the Ready path.** Side by side, the sequence is identical:

```
one press:  POST /api/dashboard/action [ready] · GET /api/dashboard · POST /api/dashboard/action [send_ready_email]
two press:  POST /api/dashboard/action [ready] · GET /api/dashboard · POST /api/dashboard/action [send_ready_email]
```

That is observed, not asserted from reading: the harness drives the real handler and records every
request.

## §3 — What actually differs, and the sequence that produces the message

Taking the prompt's list in order:

- **a second request only in one-press mode** — no. Three requests either way, identical.
- **a route/body that 404s, 400s or 409s** — no. Every request in the press returns 200; the harness
  asserts it.
- **a double submit or a stale token** — no. Exactly one write per press.
- **an optimistic update whose reconciliation fetch fails** — *this is the one*, but not through a
  failure: through a **deliberate cancellation** misread as a failure.
- **the new capacity-refresh work** — no. It reads `/api/slots` on its own timer with no
  `AbortController`, and never touches `degradedSince`. Its throttle and trailing call are unaffected.
- **a realtime reconnect** — not a reconnect, but realtime **is** the other half of the sequence.

**The sequence.** `orders` realtime is subscribed on `event: '*'` for the truck and calls
`fetchAllRef.current()` on every row change:

1. The Ready press writes `orders.status='ready'`. Postgres realtime broadcasts almost immediately.
2. The client starts dashboard **read A**.
3. The POST is still running — it also does `rebuildProductionSlotUsage`, several more round trips — so
   it returns **after** the broadcast. `handleGateResult` ends with `await refetch()`, which since
   18 September **supersedes**: it aborts read A and starts read B, so an operator's own action is never
   the thing that gets discarded.
4. Read A's catch sees `ctrl.signal.aborted` and raises the degraded banner. It cannot tell our own
   abort from the `READ_TIMEOUT_MS` abort: **both use the same controller and reject with the same
   `DOMException`.**
5. Read B succeeds, `setDegradedSince(null)`, the banner disappears.

The ordering in step 3 is why it looks deterministic rather than occasional: the realtime broadcast
reliably beats a POST that does extra database work.

**This also explains placing an order**, which Dominic reported mid-investigation: `onOrderPlaced` calls
`fetchAll(undefined,false,true)` — the same supersede — while the insert's own realtime event has already
started a read. Same collision, same banner. **Six call sites** supersede: the shared post-action
handler, the order edit, the refund, the buzzer write, the interval settings save, and order-placed. Any
of them can show it.

## §4 — Reproduced deterministically

Driven through the real rules, with a fake client, in `scripts/ready-press-one-press.cjs`:

```
realtime event      → decideRead(null)                    → 'start'      (read A begins)
60-second poll      → decideRead(slotA, {})               → 'drop'
action's refetch    → decideRead(slotA, {supersede:true}) → 'supersede'  (abort A, begin B)
read A fails        → aborted: true
```

**Pre-fix classification** (broken variant V1, which is the code as Dominic is running it):

```
"Can't reach the server. Showing orders from 02:30 PM. New orders may be missing."
```

**Post-fix:** `null` — no banner.

**The failing request, its status and its body:** there isn't one. No request 404s, 400s, 409s or 500s.
The only "failure" is `AbortError` on a `GET /api/dashboard` that the client itself cancelled one
millisecond before starting its replacement. **It is not a genuine network failure**, and the evidence is
that the read was aborted by `inFlightRef.current.abort()` from the same tab, with `navigator.onLine`
true and the superseding read returning 200 immediately afterwards.

## §5 — Is anything lost?

**No.** Read-only checks on test-truck:

```sql
SELECT orders.order_key, orders.id, orders.status, orders.event_id, orders.total, orders.updated_at
  FROM orders WHERE orders.truck_id = 'test-truck' ORDER BY orders.updated_at DESC LIMIT 6;
```

| order | status | event | total |
|---|---|---|---|
| `28f1d956…` #10 | collected | `252aae9f…` | 78 |
| `80cc1c07…` #11 | **ready** | `252aae9f…` | 13 |
| `59082653…` #12 | **ready** | `252aae9f…` | 39 |
| `f51fb965…` #6 | **ready** | `252aae9f…` | 39 |
| `1abf4080…` #5 | **ready** | `252aae9f…` | 26 |

Every press landed in the right state.

```sql
SELECT order_payments.order_key, order_payments.kind, order_payments.channel, order_payments.method,
       order_payments.amount_minor, order_payments.state, order_payments.idempotency_key, order_payments.created_at
  FROM order_payments WHERE order_payments.truck_id = 'test-truck' ORDER BY order_payments.created_at DESC LIMIT 8;
```

One `charge` row per order, `channel: in_person_other`, `state: succeeded`, each under a deterministic
idempotency key of the form `collect:<order_key>:0:<amount_minor>`. **A repeated press cannot double-write:
the key is derived from the order and the outstanding balance, so a second attempt collides rather than
inserting.** `recordCollectionPayment` also short-circuits on a zero balance.

**Can one press produce two writes?** No. `doAction` fires one POST; `OrderCard` carries an explicit rule
never to dispatch `mark_paid` and `collected` together (the outbox has no dependency ordering, so a
conflicted op would be skipped while the other replayed). The harness asserts one write per press under
both settings.

**Is optimistic state left inconsistent when the superseded read dies?** No. An aborted read applies
nothing — it is cancelled before its JSON resolves — and the superseding read applies everything a
moment later.

## §6 — Does this mask a genuine failure?

**Yes, in two ways, and the second is the worse one.**

1. **False positives train the operator to ignore it.** A banner that appears after every press and
   clears itself teaches an operator that it means nothing. When the connection genuinely does go, the
   same words appear and are dismissed the same way. That is the real cost here — the message was
   correct-looking and useless.
2. **An application error was wearing a connectivity error's clothes.** The `!res.ok` branch raised the
   *same* sentence for an HTTP 500 or 503 from our own backend. An operator told the connection is bad
   will move the till, check the wifi, walk outside — none of which addresses a failing server, and from
   the hatch they cannot tell the difference. That is fixed here too, separately from the abort bug.

---

# THE FIX

New module **`lib/dashboard-read.ts`**, holding the read-slot discipline and what a failed read means. It
was extracted so the rules can be tested without mounting a 4,500-line component.

| symbol | what it does |
|---|---|
| `decideRead(current, {forceSeed, supersede})` | `'start'` when the slot is free; `'drop'` for a poll or realtime while a read runs; `'supersede'` for an event switch or an operator action's own refetch |
| `ReadSlot` | `{ controller, superseded }` — the flag is the whole fix: it is set **before** `abort()`, and is the only way the aborted read can tell our own replacement from the timeout |
| `classifyReadFailure({aborted, superseded, status})` | `'superseded'` · `'timeout'` · `'offline'` · `'server-error'` |
| `nextDegraded(prev, failure, now)` | folds a failure into the banner state; **`'superseded'` returns `prev` unchanged** |
| `degradedBanner(state, lastRefresh)` | the sentence, or `null` |

Changed in **`app/dashboard/[token]/page.tsx`**:

- `inFlightRef` now holds a `ReadSlot` rather than a bare `AbortController`.
- `fetchAll`'s guard goes through `decideRead`, and a supersede sets `slot.superseded = true` **before**
  aborting.
- The catch classifies through `classifyReadFailure`. A `'superseded'` read is **silent** — no banner, no
  warning, nothing for the operator to do, because a newer read is already in flight.
- The `!res.ok` branch now classifies as `'server-error'` and carries the status.
- `degradedSince` became `degraded: {since, kind, status?}`; `const degradedSince = degraded?.since ?? null`
  keeps the stock-freshness reader (`stockLoading ? 'unknown' : (stockFetchFailed || degradedSince) ? 'stale' : 'live'`)
  byte-identical.
- The banner renders `degradedBanner(degraded, lastRefresh)`.

**Nothing was changed about the Ready press itself.** No request was removed or added: all three were
already correct, and the fix is to stop misreporting a cancellation as a failure.

## The wording, per kind

| kind | when | sentence |
|---|---|---|
| `superseded` | we replaced this read with a newer one | *(no banner at all)* |
| `offline` | `fetch` threw — DNS, connection refused, TLS, offline | **Can't reach the server. Showing orders from HH:MM. New orders may be missing.** |
| `timeout` | no answer within `READ_TIMEOUT_MS` (10 s) | same as `offline` — from the hatch these are the same fact |
| `server-error` | the server answered, with an error status | **The server couldn't load orders (error 500). Showing orders from HH:MM. New orders may be missing.** |

Both surviving sentences keep "New orders may be missing", which is the half that matters:
stale-and-complete and stale-and-incomplete are different risks, and only the second costs a customer
their food.

---

# THE HARNESS — `scripts/ready-press-one-press.cjs`

Listed in `scripts/harnesses.json` (now **54** entries) and running in the suite. Runtime ≈ 10 s,
including one real 4-second email defer, not a mocked one.

**Failure mode it defends:** the dashboard telling an operator the server is unreachable when it is not —
either because a read we cancelled ourselves was counted as a failure, or because an application error
borrowed a connectivity error's words.

**Broken variants ran FIRST; both FAILED as required:**

```
  ✓ FAILED as required  V1 pre-fix: a superseded read raised "Can't reach the server. Showing orders from 02:30 PM. New orders may be missing."
  ✓ FAILED as required  V2 one message for both kinds: a 500 reads "Can't reach the server. Showing orders from 02:30 PM. New orders may be missing."
```

V1 removes the `superseded` test from `classifyReadFailure`, which **is** the code Dominic is running —
so the first line above is the bug, reproduced. V2 collapses the two kinds back into one sentence.

**The real tree:**

```
── THE READ SLOT: A SUPERSEDED READ IS NOT A FAILURE ────────────────────────────────────
  ✓ a realtime event starts a read when the slot is free
  ✓ the 60-second poll is DROPPED while that read runs (decision: drop)
  ✓ the action's own refetch SUPERSEDES it instead of being dropped (decision: supersede)
  ✓ the aborted read is classified 'superseded', not 'timeout'
  ✓ and it raises NO banner: null

── THE TWO ERROR KINDS KEEP THEIR OWN WORDS ─────────────────────────────────────────────
  ✓ a genuine network failure still says: "Can't reach the server. Showing orders from 02:30 PM. New orders may be missing."
  ✓ a read that timed out says the same: "Can't reach the server. Showing orders from 02:30 PM. New orders may be missing."
  ✓ an APPLICATION error says something else entirely: "The server couldn't load orders (error 500). Showing orders from 02:30 PM. New orders may be missing."
  ✓ both still warn that the list may be INCOMPLETE — that half is the one that costs a customer their food

── THE READY PRESS, UNDER BOTH SETTINGS ─────────────────────────────────────────────────
     one-press:  ["POST /api/dashboard/action [ready]","GET /api/dashboard","POST /api/dashboard/action [send_ready_email]"]
     two-press:  ["POST /api/dashboard/action [ready]","GET /api/dashboard","POST /api/dashboard/action [send_ready_email]"]
  ✓ the request sequence is IDENTICAL under one press and two presses
  ✓ exactly three requests: the write, the refetch, and the deferred ready email
  ✓ no press produces two writes: 1 under one press, 1 under two
  ✓ and not one of them fails — there is no failing request in a Ready press under either setting

✅ a superseded read is silent, the two error kinds keep their own words, and the press is unchanged by the setting
```

The press is driven through the **real** `useGatedActionResult` and `useReadyEmailUndo` on the mini-DOM
rig, with `fetch` recording every request — so "exactly these requests" is observed, not read off the
source. The single `POST … [ready]` that `doAction` fires is issued by the harness itself and labelled as
such in the script; everything after it is the real machinery.

---

# VERIFICATION — true exit codes

| command | exit |
|---|---|
| `node scripts/ready-press-one-press.cjs` | **0** (14 assertions, 2 broken variants failed first) |
| `node scripts/run-harnesses.cjs` | **0** — 54 run · 54 passed · 0 failed |
| `npx tsc --noEmit` | **0** |
| `npx next build` | **0** |

**Goldens — unchanged, byte for byte. No generator was run.**

| golden | sha256 |
|---|---|
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` |

## eslint, per rule, against a clean HEAD worktree

`lib/dashboard-read.ts` and `scripts/ready-press-one-press.cjs` are new and untracked, so HEAD was linted
on the one tracked file.

| rule | HEAD | working tree | delta |
|---|---|---|---|
| `@next/next/no-img-element` (warn) | 1 | 1 | 0 |
| `@typescript-eslint/no-explicit-any` (error) | 56 | 56 | 0 |
| `@typescript-eslint/no-unused-vars` (warn) | 25 | 25 | 0 |
| `react-hooks/exhaustive-deps` (warn) | 2 | 2 | 0 |
| `react-hooks/immutability` (error) | 1 | 1 | 0 |
| `react-hooks/preserve-manual-memoization` (error) | 3 | 3 | 0 |
| `react-hooks/purity` (error) | 5 | 5 | 0 |
| `react-hooks/refs` (error) | 5 | 5 | 0 |
| `react-hooks/set-state-in-effect` (error) | 8 | 8 | 0 |
| `react/no-unescaped-entities` (error) | 7 | 7 | 0 |

**Zero delta, every rule.** `lib/dashboard-read.ts` lints **clean** — 0 errors, 0 warnings. The harness
reports 8 `@typescript-eslint/no-require-imports`, exactly what its untouched sibling
`scripts/add-order-refresh.cjs` reports: the house pattern for `.cjs` harnesses, not a new finding.

---

# LOCALHOST CHECK for Dominic — test-truck, "Bures Music Festival"

1. **Ready under one press.** Settings → "Completing an unpaid order" → **One press**. Press **Ready** on
   an order card. *Expect:* the card advances, the green "Order #N ready" toast with ↩ Undo, and **no
   amber bar at any point**. Watch the top of the screen for a couple of seconds — that is where it used
   to appear.
2. **Ready under two presses.** Switch to **Two presses** and press Ready again. *Expect:* identical
   behaviour, still no amber bar. The setting changes the completion button, never the Ready press.
3. **Place an order.** Add Order → build anything → submit. *Expect:* no amber bar. This was the second
   case you reported and it has the same cause.
4. **A genuine offline press still warns.** With the dashboard open, turn wifi off (or DevTools →
   Network → Offline), then press Ready. *Expect:* the amber bar, reading **"Can't reach the server.
   Showing orders from HH:MM. New orders may be missing."** Turn wifi back on and it clears on the next
   successful read.
5. **An application error reads differently.** Not reproducible by hand without breaking the route, but
   if `/api/dashboard` ever answers 500 you will now see **"The server couldn't load orders (error 500).
   Showing orders from HH:MM. New orders may be missing."** — which tells you to look at the server, not
   at your connection.

---

# Anything I could not establish

**Why you saw it under one press and not under two.** I traced the Ready press end to end and found no
code path on which `completionPresses` changes the requests, the server handler, or the refetch — and the
harness now asserts the sequence is identical under both settings. The collision is a **race** between a
realtime-triggered read and the action's own superseding refetch, and it fires on any action that writes
an `orders` row. Your own second observation supports that: placing an order does it too, and order
placement has nothing to do with the completion setting.

My best explanation is that switching the setting is what made you *look*: the two-press flow you had
been using involves the same collision, and a banner that appears and clears itself within a couple of
seconds is easy to miss until something draws your eye to the header. I could not prove that, and I am
not going to dress a timing coincidence up as a mechanism. If you can still reproduce a difference —
Ready under two presses with genuinely no flash, several times in a row — tell me and I will keep
digging, because that would mean there is a second cause I have not found.

**Not attempted:** I did not run the dev server or press anything in a browser. Everything above is from
the source, the real modules under the harness, and read-only queries.

---

# git status — after

**0 staged · 38 modified · 111 untracked · 149 entries.**

Modified (tracked) — the same 38 as before, with `app/dashboard/[token]/page.tsx` carrying this round's
change:

```
android/app/capacitor.build.gradle          lib/capacity-breach.ts
android/capacitor.settings.gradle           lib/features.ts
app/api/dashboard/action/route.ts           lib/orders/place-in-slot.ts
app/api/dashboard/route.ts                  lib/payments/promote-draft.ts
app/api/events/route.ts                     lib/plan-features.ts
app/api/manage/route.ts                     lib/printing/bleTransport.ts
app/api/menu/[truckId]/route.ts             lib/printing/transport.ts
app/api/orders/submit/route.ts              lib/printing/usePrinting.ts
app/api/slots/[truckId]/route.ts            lib/slot-availability.ts
app/dashboard/[token]/page.tsx        ←     lib/slot-bookings.ts
app/landing/page.tsx                        lib/slot-display.ts
app/manage/[token]/page.tsx                 lib/slot-generation.ts
app/trucks/[slug]/order/page.tsx            lib/supabase.ts
components/dashboard/AddOrderPanel.tsx      package-lock.json
components/dashboard/CapacityBreachBanner.tsx  package.json
components/printing/PrintingSettings.tsx    scripts/migrate-from-sheets.cjs
content/store-listing.md                    scripts/register-payment-domain.cjs
docs/reference-manual.md                    scripts/whatsapp-golive-parity-harness.cjs
ios/App/App/Info.plist
ios/App/CapApp-SPM/Package.swift
```

Untracked, by directory:

| directory | files |
|---|---|
| `scripts/` | 52 — **+1: `ready-press-one-press.cjs`** (`harnesses.json` was already untracked and now lists 54) |
| `docs/` | 41 — **+1: `ready-press-error-report.md`** ← |
| `supabase/migrations/` | 5 |
| `lib/printing/` | 4 |
| `lib/` | 4 — **+1: `dashboard-read.ts`** |
| `scripts/fixtures/` | 1 |
| `plugins/` | 1 |
| `lib/orders/` | 1 |
| `components/printing/` | 1 |
| `app/api/printing/` | 1 |

Nothing was staged, committed, stashed, reset or restored. The temporary HEAD worktree used for the lint
delta was removed.

# Files changed this round

| file | change |
|---|---|
| `lib/dashboard-read.ts` | **new** — the read slot, failure classification and the two banner sentences |
| `app/dashboard/[token]/page.tsx` | `fetchAll` uses the module; a superseded read is silent; `degraded` carries the kind; the banner renders from `degradedBanner` |
| `scripts/ready-press-one-press.cjs` | **new** — the harness |
| `scripts/harnesses.json` | lists the new harness (54) |
| `docs/ready-press-error-report.md` | this report |
