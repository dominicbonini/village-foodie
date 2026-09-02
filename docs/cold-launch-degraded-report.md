# Cold launch on a degraded backend — reaching the Add-order panel

**Built. NOT deployed, NOT committed. No SQL, no migrations.**
**New: `lib/native/truckSnapshot.ts`. Changed: `app/dashboard/[token]/page.tsx` (+152 −21).**

---

## VERIFICATION

**EXECUTION.** 13 assertions chaining the **real** `menuSnapshot`, `truckSnapshot`, `orderGate` and
`outbox` modules under Node against a scripted 503. **A mutant with the truck age-bound deleted fails
C5**, so the suite bites.

**SANITY ONLY, not verification:** `npx tsc --noEmit` clean — and it caught **two** real errors I
introduced (a wrong type name, and an unclosed JSX expression from a mis-placed paren).

🔴 **NOT MEASURED: React.** The render gates are modelled in the harness from the source, not rendered.
**I have not opened the app.** §8 is the runbook.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 1 · Every point that can abort before the panel renders

**Traced from mount to `<AddOrderPanel/>`. There were FOUR, not one — and `:1022` was not even the last.**

| # | Line (pre-change) | What it does | Panel reachable past it? |
|---|---|---|---|
| **A1** | **`:2886`** `if(loading) return <"Loading dashboard…">` | Full-screen spinner while `loading` | **No** — but correct: it clears in `finally` on every path |
| **A2** | **`:1022`** `else { setError(data.error \|\| 'Failed to load') }` | Any non-ok **first** load sets `error` | 🔴 **No** — feeds A4 |
| **A3** | **`:1133`** `else if(!authenticatedRef.current) setError('Connection error')` | An **abort/timeout or thrown fetch** on a first load | 🔴 **No** — feeds A4 |
| **A4** | **`:2915`** `if(error && !authenticated) return <"Access denied">` | The full-page error return | 🔴 **No.** **The screen the operator actually saw** |
| **A5** | `:2916` `if(requiresPin && !authenticated) return <PIN>` | PIN entry | No — **legitimate, untouched** |
| 🔴 **A6** | **`:3988`** `{truck && ( <AddOrderPanel …/> )}` | **The panel is mounted only when `truck` is non-null**, and `setTruck` runs **only** on a successful `/api/dashboard` | 🔴 **NO — AND THIS IS THE ONE THAT MATTERS** |

> 🔴 **FIXING `:1022` ALONE WOULD NOT HAVE MET THE REQUIREMENT.** Past the error screen, `truck` is still
> null on a cold degraded launch, so **A6 would have kept the panel unmounted anyway.** The menu snapshot
> was correct and complete and still unreachable, because nothing on the device held the truck config.

**A seventh, found while fixing:** `:3965` renders **"No orders yet today"** whenever `orders.length===0`
— **which is exactly "missing data presented as empty data".**

---

## 2 · What was made non-fatal, and what renders instead

### The new module — `lib/native/truckSnapshot.ts`

The truck **config** (plan, feature overrides, payment settings, emoji), in `@capacitor/preferences`,
keyed by token, native-only, written on **every successful load**, **7-day bound**.

🔴 **IT DELIBERATELY DOES NOT STORE ORDERS.** A board seeded with yesterday's orders is worse than an
empty one — an operator would work rows that may already be collected. **The board stays empty and says
it could not be loaded.** That distinction is the requirement.

⚠️ **Why 7 days and not the menu's 24h:** the menu carries **prices**, so a stale one takes money at the
wrong amount. This carries **config** — a stale plan is a wrong affordance, not a wrong charge — and 7
days spans a trading week.

### The changes

| Where | Before | After |
|---|---|---|
| **A2** `:1022` | `setError(…)` → Access denied | **`await enterBoardUnavailable('HTTP …')`** |
| **A3** `:1133` | `setError('Connection error')` | **`await enterBoardUnavailable('no response')`** |
| **new** `enterBoardUnavailable()` | — | Sets `boardUnavailable`, and if `truck` is null loads the snapshot into it |
| **success path** | — | `saveTruckSnapshot(token, data.truck)`; clears `boardUnavailable` |
| **A4** `:2915` | unchanged | 🔴 **Still fires for a genuine 401** — that is a verdict on the credential and must stay fatal |
| **new dead-end** | — | `if(boardUnavailable && !truck)` → the plain screen (§5) |
| **A6** `:3988` | `{truck && <AddOrderPanel/>}` | **`truck` is now populated from the snapshot, so this mounts** |
| **new tab guard** | — | Inside the Add-order tab: `boardUnavailable && !truckMenu` → a plain message instead of an empty panel (§5) |
| **`:3965`** | `'No orders yet today'` | **`boardUnavailable ? "Couldn't load today's orders." : …`** |

### What renders in place of the data that did not arrive

- **The shell, the tabs, the event bar and the Add-order panel** — all of it.
- **The board is EMPTY and labelled** *"Couldn't load today's orders."* — never *"No orders yet today"*.
- **A red bar** at the top (§3).
- **No spinner, no error screen, no blank.**

---

## 3 · 🔴 THE STRINGS — proposed, for your approval before final

**Written to the `OfflineBanner.tsx` conventions: no "server", no "sync", no jargon; say what happened
and what still works; never imply data is current.**

**a) The bar, when the board could not be loaded but the panel works:**

> **Couldn't load today's orders. You can still take new orders on this device.**

**b) The board's empty state, replacing "No orders yet today":**

> **Couldn't load today's orders.**

**c) The dead end — no truck saved (whole screen):**

> **Can't take orders on this device right now**
> We couldn't reach your orders, and there's nothing saved on this device yet.
> Open the app once while you're connected and it will work offline after that.

**d) The Add-order tab — truck cached but no menu:**

> **Can't take orders on this device right now**
> Your menu isn't saved on this device, so there's nothing to build an order from.
> Open the app once while you're connected and it will work offline after that.

⚠️ **These are IN THE CODE as working text so the path renders. Treat them as proposed — say the word and
I will change them; nothing is deployed.**

---

## 4 · The measurement

**Real modules, scripted 503, `node --experimental-strip-types`.**

| Case | Forced | Result |
|---|---|---|
| **C1** | Online session first | ✅ truck + menu both stored |
| **C2** | 🔴 **Backend 503, app opened COLD** | ✅ **`screen: 'board'`, `panelMounted: true`** — the error screen is not taken |
| **C2** | — | ✅ `canCompose: true`, `addTab: 'panel'` |
| **C2** | — | ✅ board copy is **"Couldn't load today's orders."** |
| 🔴 **C3** | **Compose from the cached menu and submit** | ✅ **`queued: true`, 1 op in the outbox** |
| **C3** | — | ✅ carries a **provisional number** (`/^[A-Z]\d+$/`) |
| **C3** | — | ✅ **the composed line survives into the queued body** — `{name:'Margherita', price:10, quantity:1}` |
| **C4** | Device **never online** | ✅ `cannot-take-orders`, panel not mounted |
| **C5** | Truck snapshot **past 7 days** | ✅ refused → dead end |
| **C6** | **Truck cached, menu expired** | ✅ **the TAB shows the message; no empty menu** |
| **C7** | Recovery | ✅ a successful load rewrites the snapshot |
| **C8** | Web | ✅ nothing stored, dead end |
| | **TOTAL** | ✅ **13 assertions, 0 failing** |

**Mutation:** deleting the truck age bound → **C5 FAILS**. ⚠️ **Without this, "0 failing" would prove
nothing.**

🔴 **C6 was a genuine defect this measurement found.** Before it, a valid truck snapshot with an expired
menu mounted the panel with an **empty item grid** — precisely the trap item 5 forbids. **The tab-level
guard was added because the harness failed, not because I predicted it.**

---

## 5 · No snapshot at all

| State | What the operator gets |
|---|---|
| **No truck snapshot** (never online, or past 7 days) | 🔴 **A full-screen dead end** — copy (c). **Deliberately not the shell**: showing tabs with nothing behind them invites an order that cannot be finished |
| **Truck cached, no/expired menu** | The board renders (so they can see it is unreachable), and **the Add-order tab itself** carries copy (d) |
| **Both present** | Full board + working panel |

**Both dead ends name the fix in the operator's own terms — *"open the app once while you're
connected"* — rather than describing a cache.**

---

## 6 · Recovery

**Nothing is required of the operator. In order:**

1. **The 60s poll** (`:1332`) is gated on `truck?.id` — 🔴 **and `truck` is now non-null from the snapshot,
   so the poll RUNS on a cold degraded launch.** It did not before, because `truck` stayed null. **That
   is what makes recovery automatic here.**
2. A poll succeeds → `setTruck(data.truck)`, **`setBoardUnavailable(false)`**, `setTruckSnapshotAt(null)`,
   `saveTruckSnapshot(...)` rewrites the snapshot, and `setDegradedSince(null)`.
3. **The red bar and the board copy clear in the same render.** Real orders replace the empty board.
4. `fetchMenu` succeeds independently → `applyMenu`, `setMenuSnapshotAt(null)`, snapshot rewritten.
5. Anything composed offline drains via the outbox on its own schedule — **untouched by this task**.

⚠️ **`fetchAll` and `fetchMenu` recover independently and in no fixed order**, so the two banners can
clear separately. **Intended — they are different facts.**

---

## 7 · Scope — exclusions honoured

| | |
|---|---|
| Reachability model | ✅ **UNTOUCHED** |
| Outbox drain (`orderGate.ts`) | ✅ **Not touched by this task** (its diff is the prior write-loss fix) |
| `maxDuration` | ✅ **UNTOUCHED** |
| **The snapshot itself** (`menuSnapshot.ts`) | ✅ **UNTOUCHED** — verified by `git diff` |
| **`onAppResume`** | ✅ **NOT WIRED** — `grep` confirms it does not appear in the dashboard page |
| `public/sw.js` | ✅ **UNTOUCHED** |
| **Files this task changed** | **`lib/native/truckSnapshot.ts` (new)**, **`app/dashboard/[token]/page.tsx`** |

✅ **Nothing here required touching an excluded item, so there is no contradiction to raise.**

---

## 8 · Runbook — tablet vs laptop

### 🔴 The Android tablet settles these

| # | Test | Pass condition |
|---|---|---|
| **T1** | Open online (both snapshots written). **Force-quit.** Airplane mode. **Relaunch** | 🔴 **The board opens** with the red bar; **Add-order lists items**; an order can be composed and taken |
| **T2** | 🔴 **The real target.** Point at a build whose `/api/dashboard` returns **503**, force-quit, relaunch | Same as T1. **This is the 1 September shape and the whole point** |
| **T3** | T2, then compose + take an order | Order queues, provisional number shown, **appears on the board as queued** |
| **T4** | 🔴 **Wipe app storage** (Settings → Storage → Clear data), airplane mode, launch | **Copy (c)** — the dead end. **Not a spinner, not "Access denied", not an empty menu** |
| **T5** | Truck cached, menu expired (backdate the key), open Add-order | **Copy (d)** in the tab; the board still renders |
| **T6** | From T2, restore the backend and **wait ≤60s without touching anything** | 🔴 **Bar clears, orders appear, no operator action** — §6 |
| **T7** | Genuine **rotated token** while offline | 🔴 **"Access denied" MUST still appear.** Confirms A4 stayed fatal for a real auth verdict |
| **T8** | Both banners + the red bar at arm's length in daylight | Legible, distinguishable |

### The laptop already settled

Snapshot save/load/expiry/absence, the web no-op, the dead-end vs panel decision, the composed order
queueing with its line intact, and that a successful load rewrites the snapshot — **all measured (§4)**.

---

## What I could not establish

1. 🔴 **That any of this renders.** **No app run, no device.** The gates are modelled from source; **T1-T7
   are open**, and T2/T4 are the ones that decide whether the requirement is met.
2. **Whether `truck` from a 7-day-old snapshot mis-gates a feature.** Plan gating reads `truck.plan`;
   **a plan change inside 7 days would be honoured late.** Not measured.
3. **Whether the 60s poll actually starts** on a snapshot-supplied truck (§6 step 1). **Read from the
   effect's `[truck?.id]` dependency, not observed** — **T6 is the check.**
4. **The flicker risk** if `fetchMenu` hydrates after `fetchAll` fails: the tab guard is scoped to avoid a
   full-screen flash, **but I have not seen it render.**
