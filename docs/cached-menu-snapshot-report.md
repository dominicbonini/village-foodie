# Cached menu snapshot — composing an order while the backend is down

**Built. NOT deployed, NOT committed. No SQL, no migrations.**
**New: `lib/native/menuSnapshot.ts`. Changed: `app/dashboard/[token]/page.tsx` (+73 −…).**

---

## VERIFICATION

**EXECUTION** for the snapshot module: 14 assertions under Node with `--experimental-strip-types`,
running the **real module** against an in-memory `Preferences` stub. **A mutant with the age guard
deleted fails 2 of them**, so the suite bites.

**SANITY ONLY, not verification:** `npx tsc --noEmit` exit 0 — and it **caught a real ordering bug**
(`applyMenu` used before declaration), which I fixed.

🔴 **NOT MEASURED: the page wiring.** `fetchMenu` → hydrate lives in a 13,000-line React component; **I
have not rendered it, not run the app, and not composed an order.** §9 is the runbook.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 1 · What the Add-order panel actually needs — read, not guessed

**`AddOrderPanelProps`, `components/dashboard/AddOrderPanel.tsx:77-140`:**

| Prop | Where it comes from today | In the snapshot? |
|---|---|---|
| `truckMenu: TruckMenu` | `GET /api/menu/{truckId}?dashboard=1&event_id=…` → `d.menu` (`page.tsx` `fetchMenu`) | ✅ **the whole object** |
| `menuGroups` | **Derived** — `groupByCategory(truckMenu.items, …)` (`page.tsx:2943`) | ✅ derived from it |
| `categoryConfigs` (prep secs / batch) | **Derived** from `d.menu.categories[].prep_secs / batch_size` | ✅ |
| `categoryAllowNotes` | **Derived** from `d.menu.categories[].allowNotes` | ✅ |
| `categoryOrder`, `itemCategoryMap` | **Derived** from `truckMenu` | ✅ |
| **Modifier groups + options** | 🔴 **Inside the menu** — `TruckMenu.categories[].modifierGroups` (`types.ts:221`) | ✅ |
| **Deals / bundles** | `truckMenu.bundles` — `availableDeals` (`AddOrderPanel.tsx:477`) | ✅ **no server lookup exists** |
| `itemStocks`, `categoryStocks` | `POST /api/dashboard/action {action:'get_stock'}` | ❌ **NOT cached — §5** |
| `offlineCapacity` | 🔴 **Already built** — SW-cached `/api/dashboard` inputs (`AddOrderPanelProps:110-118`) | n/a |
| `orders`, `waitMinutes`, `todayEvent` | Dashboard state / SW-cached `/api/dashboard` | n/a |

> 🔴 **ONE OBJECT COVERS EVERYTHING THE MENU HALF NEEDS.** Items, prices, categories, prep/batch,
> allowNotes, subcategories, modifier groups **with their options**, bundles and upsell rules all ride
> inside `d.menu`.

### Why nothing cached it before

**`fetchMenu` (`page.tsx`) requests `/api/menu/…&nocache=${Date.now()}` — a UNIQUE URL every call**, so
the service worker can never match it. **And `public/sw.js:113` caches only `/api/dashboard` and
`/api/events/manage`.** **The menu was uncached by two independent mechanisms.**

---

## 2 · The snapshot

**`lib/native/menuSnapshot.ts` (new, 90 lines).**

| | |
|---|---|
| **Stored where** | 🔴 **`@capacitor/preferences`** — the same store as the outbox, chosen there because WKWebView evicts IndexedDB/localStorage under pressure. **Survives a cold app-kill.** ⚠️ **Deliberately NOT the service worker cache** — the snapshot works whether or not the SW is active (§6) |
| **Key** | `hg_menu_snap_<truckId>_<eventId\|noevent>` — **event-scoped**, because `/api/menu` returns that event's deals and pause state. **Measured (S9): another event's key returns null** |
| **Size** | ⚠️ **NOT MEASURED on real data.** It is one `/api/menu` payload as JSON — the test-truck menu is 29 items; a large menu with many modifier options is the case to watch. **Preferences has no documented hard cap but is not a bulk store** |
| **Written** | In `fetchMenu`'s success branch, **only after `d.menu` is truthy** — i.e. only a good response is ever stored. Fire-and-forget; a storage failure cannot break the online path |
| **Read** | **Only when a live fetch produced no menu** — `r.ok ? r.json() : null` lands a **5xx here too**, so this covers the 1 September shape as well as a dead uplink |
| **Invalidated** | Overwritten by every good fetch; **deleted** when past 24h, when corrupt, or on a shape mismatch |
| **Never written** | `loadMenuSnapshot` returns null → **`hydrateMenuFromSnapshot` is a silent no-op** → the panel is exactly as it is today, with nothing to compose from. **Measured (S5)** |

🔴 **THE HYDRATOR REFUSES TO OVERWRITE A LIVE MENU** (`if(truckMenuRef.current) return`). A poll failing
mid-service must not swap a live menu for a cached one.

🔴 **NATIVE ONLY** (`isNativeApp()` guard). **Web has no durable outbox**, so an order composed offline
on web could not be queued — caching a menu there would offer a flow that cannot complete. **Measured
(S10): on web nothing is stored and nothing is read.**

---

## 3 · 🔴 STALENESS — 24 hours, and why

**`MENU_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000`.**

**The number is a money decision, not cache tuning.** The question is *"how long may a price be wrong
before we would rather refuse to trade from it"*:

- **Longer than one trading day plus the overnight gap** — a truck that went online this morning can
  still compose this evening, which is the actual case this exists for.
- **Short enough that a price edited yesterday cannot be charged tomorrow.**
- **In normal use the age is minutes**: every successful fetch rewrites it.

### At the boundary — REFUSE, do not degrade

`loadMenuSnapshot` returns **null and DELETES the entry**. The panel is then as it is today: no menu,
nothing to compose. **An operator who cannot compose is better off than one composing at last week's
prices.** **Measured: S6 refuses and deletes at 24h+1min; S7 still serves at 23h59m.**

### How the operator knows

**A second, separate amber bar** (`page.tsx`, beside the degraded strip):

> **Menu saved on this tablet at 11:40. Check prices before taking payment.**

⚠️ **It is deliberately its own bar, not folded into "Can't reach the server".** Those are different
facts: one says ORDERS may be stale, this says PRICES may be stale, **and only the second takes money at
the wrong amount.** It names the **time**, not an age — *"11:40"* is actionable at a hatch; *"3 hours
old"* is arithmetic the operator should not have to do.

---

## 4 · What an offline order carries, and what happens on replay

| | |
|---|---|
| **Provisional number** | Minted at ENQUEUE, once, in `orderGate.ts` `queue()` — device-prefixed (`A13`), per-event sequence. Returned so the card shows what was sent |
| **`placed_offline: true`** | Stamped on the queued body only |
| **`order_key`** | Client-minted uuid — **the server's idempotency key**, so a re-post is a safe no-op |
| **The prices it was composed at** | 🔴 **NOT authoritative — see below** |

### 🔴 THE SERVER RE-PRICES. THE COMPOSED PRICE IS NOT WHAT IS CHARGED.

**`app/api/dashboard/action/route.ts:1342`** — the create path runs `repriceOrder(manualItemsIn, deals,
priceBook, …)` against **its own price book**, then stores `serverTotal` (`:1355`). **The client's figure
is not accepted.**

**So on replay, two cases:**

| If the live menu has changed | What happens | Who is told |
|---|---|---|
| **A price DIFFERS** | 🔴 **The order is stored at the NEW price, silently.** `booked.unresolved` is empty because the item still exists, so no 409 is raised | 🔴 **NOBODY.** If the operator took cash at the composed price, **the till and the order now disagree and nothing surfaces it** |
| **An item was DELETED** | ✅ `booked.unresolved` is non-empty and `confirmUnresolvedTotal` is absent on a replayed body → **409 `needsPriceConfirm`** (`:1365-1372`) | ✅ The drain flags 409 → `conflict` → **the red operator banner** |

> ⚠️ **THE PRICE-DIVERGENCE CASE IS A REAL, UNFIXED RISK AND IT IS WHY §3's BANNER SAYS "CHECK PRICES
> BEFORE TAKING PAYMENT".** The banner is a mitigation, not a fix. **A proper fix would send the composed
> unit prices and have the server raise a 409 on divergence — a server change, out of scope here, and I
> am flagging it rather than quietly relying on the banner.**

---

## 5 · What CANNOT be composed offline

**Established by reading the panel, not assumed:**

| Concern | Finding |
|---|---|
| **Payment** | ✅ **Already safe, and no gate is needed.** `AddOrderPanel.tsx:952`: *"THIS PANEL CANNOT CREATE A STRIPE-SETTLED ORDER — there is no Stripe path in this file at all"*. A plain/Cash/Card press records a **method on the row** (`:944-957`); no payment provider is contacted. **Money taken offline is recorded in the queued op, and a failed replay raises the PAYMENT NOT RECORDED banner** |
| **Discount / deal lookup** | ✅ **No lookup exists.** `availableDeals = (truckMenu?.bundles \|\| []).filter(b => b.available)` (`:477`) — deals come from the menu payload, so they are in the snapshot. The server re-prices deals authoritatively on replay (`:1385-1391`) |
| **Live capacity** | ✅ **Already handled** — `offlineCapacity` (`:110-118`) gives advisory traffic lights from SW-cached inputs |
| **Event switching** | ✅ **Already refused** — only events loaded this session are switchable offline (`:2581`, `page.tsx` `onEventChange`) |
| 🔴 **Live stock** | ⚠️ **NOT gated, and I did NOT add a gate.** See below |

### 🔴 Stock — what I did NOT do, and why I am reporting rather than guessing

**I did not cache stock and I did not refuse stock-tracked items offline.**

- **Caching stock would be worse than not having it**: a cached count is *wrong the moment another device
  sells one*, and it would show a confident "3 left" that is fiction.
- **Refusing every stock-tracked item would block most composing** on a truck that uses stock at all —
  which defeats the requirement.

**What happens today with no stock data:** `itemStocks` / `categoryStocks` are empty, so
`calcAddableRemaining` has nothing to bind on and **no item shows a "N left" badge or a disabled `+`**.
**The operator can oversell, and the server does not reject on replay** (stock is not a create-path
precondition I found).

> ⚠️ **THIS IS THE ONE PLACE THE BUILD DOES NOT MEET ITEM 5's STANDARD, AND I AM NAMING IT RATHER THAN
> PRETENDING OTHERWISE.** Refusing at the start would need a per-item decision the panel cannot make
> offline. **Options: (a) show every item with no stock badge, as now; (b) grey items whose LAST KNOWN
> stock was finite; (c) refuse composing entirely when stock matters. I have not chosen — it is your
> call, and it is a separate change.**

---

## 6 · Cold launch — 🔴 the honest answer

### Can a cold launch reach this at all?

**Two different outages, two different answers:**

| Outage | Cold launch |
|---|---|
| **Backend DEGRADED, production reachable** (1 September) | ✅ **The shell boots** — `server.url` serves static HTML/JS from the Vercel CDN, which does not touch the database. 🔴 **BUT THE DASHBOARD STILL ERRORS BEFORE THE PANEL:** `/api/dashboard` 503s, `authenticatedRef` is false, and `page.tsx:1022` takes `setError(data.error\|\|'Failed to load')`. **The operator never reaches the Add-order panel, so the snapshot is never consulted.** |
| **Production UNREACHABLE** (DNS / no uplink) | The shell has no local bundle. **Whether anything loads depends entirely on the service worker.** |

> 🔴 **THE SNAPSHOT FIXES THE APP ALREADY RUNNING. IT DOES NOT, ON ITS OWN, FIX COLD LAUNCH.** The
> blocker is the auth-gated error path, which is a separate change (my failure-mode review ranked it
> rank 1, and serving the board from cache on a 503 as its highest-risk item). **I have not touched it —
> item 7 sequenced it away, and item 6 asked me to report this rather than fix it.**

### Is the service worker active in the WebView?

🔴 **STILL UNVERIFIED. I am not going to claim otherwise.** `lib/native/serviceWorker.ts:1-9` registers
`/sw.js` unconditionally on `load`, guarded only by `'serviceWorker' in navigator`. **Whether it
registers, activates and controls the page inside the Android WebView / WKWebView remote-URL shell is
untested** — this is the third time it has been flagged.

⚠️ **The snapshot deliberately does not depend on the answer** — it uses Preferences, not the SW cache.

**The check to run on the tablet** (Chrome → `chrome://inspect` → inspect the WebView → Console):

```js
navigator.serviceWorker.getRegistrations().then(r => console.log(
  'registrations:', r.length,
  'scope:', r[0]?.scope,
  'active:', !!r[0]?.active,
  'state:', r[0]?.active?.state,
  'CONTROLLING THIS PAGE:', !!navigator.serviceWorker.controller
))
```

**`CONTROLLING THIS PAGE: true` is the only line that matters** — a registration that is not controlling
serves nothing. Then: `caches.keys().then(console.log)` should list `vf-shell-v1` and `vf-data-v1`.

---

## 7 · Scope

| | |
|---|---|
| **Reachability model** | ✅ **UNTOUCHED** (`lib/native/reachability.ts`) |
| **Outbox drain** | ✅ **UNTOUCHED BY THIS TASK.** ⚠️ `lib/native/orderGate.ts` shows in `git diff` — that is the **previous, already-reported write-loss fix**, still uncommitted. **Nothing in this task edited it** |
| **`maxDuration`** | ✅ **UNTOUCHED** — no file under `app/api` changed |
| `public/sw.js` | ✅ **UNTOUCHED** |
| **Files this task changed** | **`lib/native/menuSnapshot.ts` (new)**, **`app/dashboard/[token]/page.tsx`** |

---

## 8 · The measurement

**Harness:** the real `menuSnapshot.ts` with a stubbed `Preferences` and `isNativeApp`.

| Case | Forced condition | Result |
|---|---|---|
| **S1** | Good fetch | ✅ one snapshot, key `hg_menu_snap_t1_e1` |
| **S2** | 🔴 **Backend returns 5xx** | ✅ **composes from the snapshot** |
| **S3** | 🔴 **Backend times out (no response)** | ✅ **composes from the snapshot** |
| **S4** | Round trip | ✅ **price `10` and modifier option `Large` both survive** |
| **S5** | 🔴 **Snapshot never written** | ✅ **"nothing" — refuses, invents no menu** |
| **S6** | 🔴 **24h + 1 min old** | ✅ **refused, and the entry deleted** |
| **S7** | 23h 59m old | ✅ still usable |
| **S8** | Truncated/corrupt entry | ✅ refused and removed |
| **S9** | Different event | ✅ null — no cross-event serving |
| **S10** | Web (non-native) | ✅ stores nothing, reads nothing |
| | **TOTAL** | ✅ **14 assertions, 0 failing** |

**Mutation check — the suite can fail:** with the age guard deleted, **S6 fails both assertions (2
FAILING)**. ⚠️ **Without this, "0 failing" would prove nothing.**

🔴 **What the harness does NOT measure:** the `fetchMenu` → `hydrateMenuFromSnapshot` wiring, the banner,
and whether the panel actually composes from a hydrated menu. **All React, all unmeasured.**

---

## 9 · Runbook — tablet vs laptop

### 🔴 The Android tablet settles these

| # | Test | Pass condition |
|---|---|---|
| **T1** | Open the app online, load the menu, **force-quit**, put the device in airplane mode, relaunch | Amber bar: *"Menu saved on this tablet at HH:MM"*; **the Add-order panel lists items with prices** |
| **T2** | 🔴 **The real target.** Point the tablet at a build whose `/api/menu` returns **503** while `/api/dashboard` still succeeds | Menu appears from the snapshot; **an order can be composed and taken**; it queues |
| **T3** | Compose and take an order offline, then restore the backend | Order replays; **check the stored total against what was charged** — §4's divergence case |
| **T4** | **Cold launch with the backend degraded** | 🔴 **Expected to FAIL to the error screen** (§6). **Confirm it, so the cold-launch work is scoped from evidence** |
| **T5** | The SW check in §6 | Records whether `controller` is non-null — **three reports have needed this** |
| **T6** | Snapshot **size** on a real menu — `Preferences.get` the key and read `.length` | Establishes whether Preferences is a sane store for the largest real menu |
| **T7** | Both banners at arm's length in daylight | Legible; the two amber bars distinguishable |

### The laptop already settled

Save/load, event scoping, the 24h boundary in both directions, corrupt-entry rejection, web no-op,
declaration order — **all measured above**.

---

## What I could not establish

1. 🔴 **That any of the page wiring works.** **No render, no device.** T1-T4 are open.
2. 🔴 **Whether the service worker is active in the WebView.** **Third flagging. T5.**
3. **Real snapshot size.** T6.
4. **Whether the stock gap (§5) is acceptable** — that is your decision and I have not made it.
5. **Whether 24h is right.** A judgement; nothing measured it.
