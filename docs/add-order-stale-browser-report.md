# The cancelled order that would not leave the Add Order list — third round, found in the browser's lifecycle

**Date** 19 September 2026 · **Scope** localhost only, nothing deployed · **Truck** test-truck (Pizza
Kitchen, batch_reservations ON), "Bures Music Festival". Pizzeria Gusto was never called, read or written.

**The answer, in one line.** Every refresh trigger in the Add Order panel goes through one object, the
capacity refresher, and in Dominic's browser that object was **dead from the moment the page mounted**.
It was built once in `useMemo` and disposed in an effect cleanup; React StrictMode — Next's development
default, so every localhost session — simulates mount → unmount → mount, the cleanup disposed the
memoised object, the remount reused it, and from then on `request()` returned false before doing
anything. Cancel, basket change, dropdown open, tab switch, the 10-second backstop: every one a no-op.
The page's own mount read bypasses the refresher, which is why the list loaded correctly and why ⌘R
"fixed" it. Production builds do not double-invoke, so this never reached a live truck.

**Why three fixture-proven fixes failed in his browser:** the fixture harnesses mounted the real
component, ran its real effects and drove its real handlers — **without StrictMode**. They proved the
logic of an object the real page had already killed. That is the exact gap the prompt named, and it is
now closed in both directions: the fixture harness mounts under StrictMode (and a variant restoring the
old shape fails), and a real-browser test exists for Dominic to run.

**What I could not do — said first.** The dashboard page is behind an operator session, and I have none.
Minting one with the service-role key was refused by the auto-mode permission classifier, and I did not
work around that. So the page-level browser trace in §1 was **not captured by me**. What I did instead is
below: a trace of the **real routes on the running dev server**, and a reproduction of the symptom in the
**real component under the real React lifecycle**. The browser test is written and takes Dominic's own
login; it is the proof he runs, not one I have run.

---

## git status — before

**0 staged · 38 modified · 111 untracked · 149 entries.**

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
app/dashboard/[token]/page.tsx              lib/slot-bookings.ts
app/landing/page.tsx                        lib/slot-display.ts
app/manage/[token]/page.tsx                 lib/slot-generation.ts
app/trucks/[slug]/order/page.tsx            lib/supabase.ts
components/dashboard/AddOrderPanel.tsx ←    package-lock.json
components/dashboard/CapacityBreachBanner.tsx  package.json
components/printing/PrintingSettings.tsx    scripts/migrate-from-sheets.cjs
content/store-listing.md                    scripts/register-payment-domain.cjs
docs/reference-manual.md                    scripts/whatsapp-golive-parity-harness.cjs
ios/App/App/Info.plist
ios/App/CapApp-SPM/Package.swift
```

Untracked, by directory: `scripts/` 52 · `docs/` 41 · `supabase/migrations/` 5 · `lib/printing/` 4 ·
`lib/` 4 · `scripts/fixtures/` 1 · `plugins/` 1 · `lib/orders/` 1 · `components/printing/` 1 ·
`app/api/printing/` 1.

---

# ESTABLISH

## §1 — The browser run, and where it stopped

Puppeteer is already a dependency (`puppeteer` 24.36 in `package.json`, with a downloaded Chrome), so no
dependency was added. The dev server was already running from this working tree (`next-server 16.1.6`,
cwd this repo). A headless Chrome opened `/dashboard/<test-truck token>` with a CDP network recorder
attached and was redirected to:

```
http://localhost:3000/login?next=%2Fdashboard%2F…
Sign in to your kitchen | Village Foodie operator dashboard | EMAIL | PASSWORD | Sign in
```

`proxy.ts` gates every `/dashboard/*` page except `/dashboard/demo-*` on a Supabase operator session
(`supabase.auth.getUser()` over the `sb-…-auth-token` cookie). The APIs — `/api/dashboard`,
`/api/dashboard/action`, `/api/slots` — authenticate on `dashboard_token` alone; only the page is gated.
The test-truck operator account owns only test-truck (read-only: `trucks.operator_id` for test-truck
matches exactly one truck), so a session for it could not have reached the live truck — but obtaining one
required the service-role key, and that step was refused. I stopped there rather than work around it.

**So the §1 page trace is Dominic's to capture.** The script that captures it is
`scripts/add-order-stale-browser.cjs`, described under *The browser test*. It records, from the cancel
press onwards, every request with method, URL, status and abort state, the row text at each step, and the
snapshot key before and after, via a dev-only `window.__hgSnapshotKey` the panel now exposes
(`process.env.NODE_ENV !== 'production'` only).

## §1b — What I could trace: the real routes on the real server

The same sequence, driven through the routes the page calls, against the running dev server, test-truck,
one 8-pizza order at 16:15 (order #38, order_key `5f9f4e95…`), then its cancel:

```
── BEFORE ──
  slots, before                  status=200 cc=null age=null etag=null x-nextjs-cache=null
                                 16:15 → tone=green available=true units=null reservations@16:15=[] batchReservations=true

── PLACE  POST /api/dashboard/action [manual] → 200 {"success":true,"orderId":"38","autoConfirmed":true}
  slots, with order              status=200 cc=null age=null etag=null x-nextjs-cache=null
                                 16:15 → tone=red available=false units={"pizza":8} reservations@16:15=[5f9f4e95:{"pizza":8}]
  dashboard, with order          status=200 cc=null order=#38 confirmed 16:15 → tone=red label="8 Pizzas" units={"pizza":8}

── CANCEL POST /api/dashboard/action [cancel] → 200 {"success":true,"status":"cancelled"}
  slots, 0ms after cancel        status=200 cc=null age=null etag=null x-nextjs-cache=null
                                 16:15 → tone=green available=true units={"pizza":0} reservations@16:15=[]
  dashboard, 0ms after cancel    status=200 cc=null order=#38 cancelled 16:15 → tone=green label="" units={"pizza":0}
  slots, 2s after cancel         status=200 … 16:15 → tone=green available=true units={"pizza":0} reservations@16:15=[]
  dashboard, 2s after cancel     status=200 … order=#38 cancelled 16:15 → tone=green label="" units={"pizza":0}

✓ /api/slots no longer carries the cancelled order
```

Every server-side link is sound: the cancel writes, the ledger decrements before the response, the
reservation drops out, and both reads reflect it **at 0 ms**.

## §2 — The failing link, named

Not the cancel write, not the refetch, not the key, not the memo, not a cache, not the throttle, not an
aborted read. **The refresher was disposed at mount and never re-created**, so no trigger could ever
start a read. In `AddOrderPanel` as Dominic was running it:

```ts
const capacityRefresher = useMemo(() => createCapacityRefresher<FreshSlotsBody>({ … }), [])
useEffect(() => () => capacityRefresher.dispose(), [capacityRefresher])
```

and in `createCapacityRefresher`:

```ts
request() {
  if (disposed) return false
  …
```

Under StrictMode the cleanup runs on the simulated unmount; `useMemo` preserves the object across the
simulated remount; `disposed` is never unset. Reproduced deterministically in the real component with the
real React (react-dom/client on the mini-DOM), the only difference being the `React.StrictMode` wrapper:

```
  StrictMode OFF  "11:45 🟡 3 Pizzas" → "11:45 🟢"          reads after the cancel: 1   ✓ cleared
  StrictMode ON   "11:45 🟡 3 Pizzas" → "11:45 🟡 3 Pizzas"  reads after the cancel: 0   🔴 STALE
```

Zero reads is the signature: not a wrong read, not a late read — none. It matches everything Dominic
saw across three rounds: the list loads correctly (the mount's `fetchManualSlots` is a direct call, not
through the refresher), nothing he does refreshes it, and ⌘R is a fresh mount with a fresh direct read.
It also explains why "add an item to the basket" — the trigger I added last round — did nothing: the
trigger fired and the refresher refused it.

`reactStrictMode` is not set in `next.config.*`; Next's app-router default is **on in development, off
in production**. `isOnline()` in `reachability` starts `true` and is never started on web, and its
`simulatedOffline` override is not persisted, so that was ruled out.

## §3 — Is `/api/slots` cached anywhere?

No. `app/api/slots/[truckId]/route.ts` declares `export const revalidate = 0`; the responses above carry
no `Cache-Control`, no `ETag`, no `Age`, no `x-nextjs-cache`. The panel's `fetchFreshSlots` passes
`cache: 'no-store'`. There is no service worker on the dashboard and no client-side cache between the
fetch and `applyFreshSlots`. The read, when it happens, is fresh — it simply was not happening.

## §4 — Does a cancelled order's reservation still contribute?

No, on every path:

| data path | reader | status filter |
|---|---|---|
| ledger units | `getProductionSlotUnits` → `production_slot_usage` | decremented by `removeOrderFromProductionSlot` inside the cancel, before the response |
| cooking reservations | `readCookingReservations` | `.in('status', OCCUPYING_STATUSES)` — cancelled excluded |
| dashboard's offline fold | `buildOfflineOccupancy` | `OCCUPYING = ['pending','confirmed','modified','cooking']` |
| the panel's own key | `ordersSignature` | carries the status literally |

The trace confirms it: `reservations@16:15` goes from `[5f9f4e95:{"pizza":8}]` to `[]` at 0 ms.

## §5 — The database, read-only

```sql
SELECT orders.order_key, orders.id, orders.status, orders.slot, orders.cancellation_reason
  FROM orders WHERE orders.order_key = '5f9f4e95-3a71-4fd6-ae42-7ed1838fa8b0';
-- → #38 · cancelled · 16:15 · 'Customer cancelled'

SELECT production_slot_usage.production_slot, production_slot_usage.units_by_cat
  FROM production_slot_usage
 WHERE production_slot_usage.truck_id = 'test-truck'
   AND production_slot_usage.event_id = '252aae9f-324c-47e1-aa2e-e7968a1e57ec'
   AND production_slot_usage.production_slot IN ('16:00','16:15','16:30');
-- → 16:15 · {"pizza": 0}
```

Cancelled, and the ledger at 16:15 holds zero.

---

# THE FIX — by symbol

**`AddOrderPanel`** — the refresher now lives in an effect's setup and is disposed in that effect's
cleanup, so every mount, simulated or real, gets a fresh instance:

```ts
const refresherRef = useRef<CapacityRefresher | null>(null)
useEffect(() => {
  const r = createCapacityRefresher<FreshSlotsBody>({ fetchFresh, apply, isOnline, minIntervalMs: 5000 })
  refresherRef.current = r
  return () => { r.dispose(); if (refresherRef.current === r) refresherRef.current = null }
}, [])
const capacityRefresher = useMemo(() => ({
  request: (reason: string): boolean => refresherRef.current?.request(reason) ?? false,
  get pending(): boolean { return refresherRef.current?.pending ?? false },
}), [])
```

The facade keeps every trigger's call site unchanged (`capacityRefresher.request(…)`,
`capacityRefresher.pending`). Before the effect has run there is nothing to ask, which is correct: the
mount's own direct read is already in flight. Nothing else changed: the status-derived `snapshotKey`, the
basket trigger, the dropdown and tab-shown triggers, the `SLOT_SNAPSHOT_MAX_AGE_MS` backstop and the
5-second throttle with trailing call all stand — they were right, and now the object they talk to is alive.

**Why not derive the list from the dashboard's data instead?** The prompt offered that if it were the
reliable answer. It is not, here: the dashboard's payload is a *fold* of the orders, computed for the
strip, and would make the panel's crosses and "Not enough time" labels depend on a read the panel does
not control and that the dashboard drops or supersedes for its own reasons. The failure was never the
panel keeping its own snapshot; it was the snapshot's refresher being dead. A dead object is fixed by
giving it the right lifetime, not by removing the feature it served.

**Dev-only diagnostic** added alongside: the panel sets `window.__hgSnapshotKey` when
`NODE_ENV !== 'production'`, so the browser test can say whether the key moved. Never set in a production
build.

I grepped for the same shape elsewhere (a `useMemo`'d object disposed in a one-line cleanup effect) and
found no other instance.

---

# PROOF

## The browser test — `scripts/add-order-stale-browser.cjs`

**Not in `scripts/harnesses.json`**, deliberately: it needs the running dev server, the Supabase project
and an operator session, none of which a headless CI run has. **How Dominic runs it, test-truck only:**

```
npm run dev                                                          # one terminal
HG_DASHBOARD_TOKEN=<test-truck dashboard token> HEADED=1 node scripts/add-order-stale-browser.cjs
```

A Chrome window opens on `/login`. Sign in as the test-truck operator; the run continues by itself (it
waits up to five minutes). Optional: `ITEM` (a pizza on the menu, default `Campagnola`), `TIME` (a future
slot, default `16:15`), `QTY` (default 8). The token comes from the environment and is never in the repo.

**What it does, in order:** opens the dashboard on the live event; builds 8 × the pizza at `TIME` in Add
Order and places it; records the row ("✕ 16:15 🔴 8 Pizzas"); goes to Orders and cancels it through the
real modal (reason "Customer cancelled", **Cancel order**); starts the network recorder at that press;
returns to Add Order, adds an item, dispatches `pointerdown` on the time `<select>`; reads the row after
each step and again after 12 seconds; prints the full trace (+ms, method, URL, status, `canceled`,
cache headers, from-cache); then, from a **second browser context** through the real routes: places and
cancels an order (the page must show both), **rejects** one, **edits** one from `TIME` to `TIME+30`, and
changes the event's operator collection interval 15 → 5 and back (**settings**). It asserts the row
cleared with no reload, and that the time `<select>` is the same element throughout.

**How it fails before and passes after.** On the pre-fix panel under Next's dev StrictMode, the refresher
is dead, so after the cancel the row still reads "✕ 16:15 🔴 8 Pizzas" at every step, including after
12 seconds, with **no `/api/slots` request in the trace after the cancel press** — the script ends
"🔴 STALE" and exits 1. On the fix, the trace shows the cancel's `POST …[cancel]`, the superseded and
superseding `GET /api/dashboard`, and a `GET /api/slots/test-truck` within the throttle window, and the
row reads "16:15 🟢" — exit 0. **I have not run it**: see *Anything I could not establish*.

## The fixture harness — `scripts/add-order-refresh-inputs.cjs`, extended

The mount now takes `{ strict: true }`, wrapping the tree in `React.StrictMode`. **Broken variant V6 ran
first and FAILED as required** — it restores the `useMemo` + dispose-in-cleanup shape and mounts under
StrictMode:

```
  ✓ FAILED as required  V6 useMemo + dispose-in-cleanup under React.StrictMode (the dev default): "11:45 🟡 3 Pizzas" → "11:45 🟡 3 Pizzas" (0 reads)
```

and the real tree, under StrictMode:

```
── UNDER React.StrictMode — WHAT DOMINIC'S DEV BROWSER ACTUALLY RUNS ────────────────────
  ✓ StrictMode: cancel still refreshes the list — "11:45 🟡 3 Pizzas" → "11:45 🟢" (1 read)
  ✓ StrictMode: an order coming through still refreshes the list — "12:15 🟢" → "12:15 🔴 4 Pizzas" (1 read)
  ✓ StrictMode: adding a basket item asks for 1 read and the list is fresh: "11:45 🟢"
```

All six broken variants (V1–V6) fail as required; all 29 assertions pass; exit 0.

## What each fixture harness was missing — stated plainly

| harness | passed while the bug was live | the assertion it lacked |
|---|---|---|
| `add-order-refresh.cjs` (round 1) | yes | mounted without StrictMode; it never asked whether a trigger could start a read *after the page's real mount sequence* |
| `add-order-refresh-inputs.cjs` (rounds 1–2) | yes | the same: every mount was a plain `createRoot().render(<Panel/>)`, so the cleanup that killed the refresher never ran before the assertions |
| `add-order-refresh-inputs.cjs` (round 2's additions: status key, basket, backstop) | yes | tested the *rules* against a live object; the real page's object was dead, and no assertion checked that `request()` could ever return anything but `false` |
| the pure `createCapacityRefresher` assertions | yes | tested the object in isolation; correct, and irrelevant once the component disposed it |

Two more things they shared, worth naming though neither was the cause this time: the server was a fake
(`fetch` answered from a fixture board), so nothing about the real routes was exercised — §1b now covers
that; and reachability was the module's real default rather than a browser's, which happened to be right.

---

# VERIFICATION — true exit codes

| command | exit |
|---|---|
| `node scripts/add-order-refresh-inputs.cjs` | **0** (29 assertions; V1–V6 failed first) |
| `node scripts/run-harnesses.cjs` | **0** — 54 run · 54 passed · 0 failed |
| `npx tsc --noEmit` | **0** |
| `npx next build` | **0** |
| `node scripts/add-order-stale-browser.cjs` | **not run** — needs an operator session (see below) |

**Goldens — unchanged, byte for byte. No generator was run.**

| golden | sha256 |
|---|---|
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` |

## eslint, per rule, against a clean HEAD worktree

The two harness files are untracked with no HEAD counterpart; HEAD was linted on the one tracked file.

| rule — `components/dashboard/AddOrderPanel.tsx` | HEAD | working tree | delta |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` (error) | 3 | 3 | 0 |
| `@typescript-eslint/no-unused-vars` (warn) | 4 | 4 | 0 |
| `react-hooks/exhaustive-deps` (warn) | 7 | 1 | **−6** |
| `react-hooks/set-state-in-effect` (error) | 5 | 4 | **−1** |
| `react/no-unescaped-entities` (error) | 2 | 2 | 0 |

No rule gained a count. The two reductions accumulate across every uncommitted round, not this one alone.
The two harness files report 13 `@typescript-eslint/no-require-imports` between them — the house pattern
for `.cjs` harnesses, as every sibling reports.

---

# LOCALHOST CHECK for Dominic — his exact sequence, test-truck, Bures Music Festival

1. `npm run dev`, open the dashboard in Safari on the live event. Add Order: 8 × any pizza at a future
   time, say 16:15. **Place order.** The list should read "✕ 16:15 🔴 8 Pizzas".
2. Orders tab → **✕ Cancel** on that order → reason → **Cancel order**.
3. **+ Add order.** Within about a second the row should already read "16:15 🟢". No item added, no
   dropdown opened, no ⌘R.
4. Add one item to the basket, open the time dropdown: still "16:15 🟢", and the dropdown must not
   close or jump.
5. Leave the tab open for 15 seconds without touching anything: still green (the max-age backstop is
   alive too).
6. The amber "Can't reach the server" bar must not appear at any point (the previous round).

Then, if you want the recorded trace: the browser test command above, signed in as the test-truck
operator. It ends "✅ the list follows every change in place, in a real browser, with no reload".

---

# Anything I could not establish

- **The page-level browser trace of §1, and the browser test's own result.** Both need an operator
  session for the test-truck account. The permission classifier refused the service-role step that would
  have minted one, and I did not go around it. The test is written to take your login (headed) and to
  take the token from the environment. I can run it the moment a session is available in the browser it
  launches, or you can run it and paste the tail.
- **That the browser test fails on the pre-fix code, by execution.** I have shown it by construction and
  by the same mechanism in the real component under the real React lifecycle (0 reads, stale), not by
  running Chrome against the pre-fix page.
- **Safari specifically.** The reproduction and the test use Chrome (Puppeteer). The mechanism is React's,
  not the browser's, so it applies identically in Safari; I have not shown Safari's `pointerdown` on a
  native `<select>` firing, which only affects the dropdown-open trigger — the basket, tab-shown, key
  and backstop triggers do not depend on it.

---

# git status — after

**0 staged · 38 modified · 113 untracked · 151 entries.**

Modified (tracked) — the same 38 as before, with `components/dashboard/AddOrderPanel.tsx` carrying this
round's change.

Untracked, by directory:

| directory | files |
|---|---|
| `scripts/` | 53 — **+1: `add-order-stale-browser.cjs`**; `add-order-refresh-inputs.cjs` extended |
| `docs/` | 42 — **+1: `add-order-stale-browser-report.md`** ← |
| `supabase/migrations/` | 5 |
| `lib/printing/` | 4 |
| `lib/` | 4 |
| `scripts/fixtures/` | 1 |
| `plugins/` | 1 |
| `lib/orders/` | 1 |
| `components/printing/` | 1 |
| `app/api/printing/` | 1 |

Nothing was staged, committed, stashed, reset or restored. The temporary HEAD worktree used for the lint
delta was removed. One test order was created and cancelled on test-truck (#38, note "add-order-stale
trace — safe to delete"); nothing else was written.

# Files changed this round

| file | change |
|---|---|
| `components/dashboard/AddOrderPanel.tsx` | the refresher is created in an effect and disposed in its cleanup; stable facade for the triggers; dev-only `__hgSnapshotKey` |
| `scripts/add-order-refresh-inputs.cjs` | StrictMode mount option; V6 broken variant; three StrictMode assertions |
| `scripts/add-order-stale-browser.cjs` | **new** — the real-browser test, headed login, not in the harness list |
| `docs/add-order-stale-browser-report.md` | this report |
