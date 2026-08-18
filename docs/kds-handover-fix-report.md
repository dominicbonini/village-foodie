# KDS handover — the four fixes

**Diagnosis accepted from [docs/kds-truck-not-found-report.md](kds-truck-not-found-report.md) and re-read first.**
Two files changed: `app/dashboard/[token]/kds/page.tsx` and `app/dashboard/[token]/page.tsx`.
No API route, no server change, no SQL, no migration.

⚠️ **This needs a DEPLOY, not a rebuild.** See §8.

---

## FIX 1 · `setTruck` runs before any guard

### The order of statements BEFORE

```tsx
      const servedEventId = data.offlinePauseEventId
      if (requestedEventId && servedEventId !== undefined && servedEventId !== requestedEventId) {
        console.error(`[kds] event scope mismatch — requested ${requestedEventId}, served ${servedEventId ?? 'null'}; rendering no orders`)
        setEventScopeMismatch({ requested: requestedEventId, served: servedEventId ?? null })
        setOrders([])
        setLoading(false)
        return                      // 🔴 ONE STATEMENT EARLY
      }
      setEventScopeMismatch(null)

      setTruck(data.truck)          // 🔴 NEVER REACHED
```

### 🔴 Everything that `return` skipped — the report understated it

The diagnosis said `setOrders` and `setLoading` ran. They did. **Seventeen further statements did not**,
and the last group is the one that made the failure permanent rather than transient:

| # | Skipped statement | Consequence |
|---|---|---|
| 1 | `setTruck(data.truck)` | 🔴 **the reported defect** — `truck` stays `null` |
| 2 | `setShowCookingStep(...)` | cooking step lost |
| 3 | `setActiveVanCount(...)` | van-name display rule lost |
| 4 | `setBuzzerCount(...)` | buzzer chip lost |
| 5 | the per-order `event_id` filter + `echoedBuzzerKeys` cleanup | pending-buzzer echoes never released |
| 6 | `setOrders(prev => applyPendingBuzzers(mergeOrders(...)))` | replaced by `setOrders([])` |
| 7 | `setPausedUntil(...)` | 🔴 **pause banner lost** |
| 8 | `setOnlinePausedUntil(...)` | 🔴 **offline-pause banner lost** |
| 9 | `setExtraWaitMins(...)` | extra-wait lost |
| 10–12 | `setCategoryOrder` / `setItemCategoryMap` / `setCatConfigs` | menu maps lost |
| 13 | `setPayments(...)` | payment state lost |
| 14–15 | `setHeldAuthorisations(...)` ×2 | held authorisations lost |
| 16 | `setPaymentFailures(...)` | payment failures lost |
| 17 | `setRequiresPin(false)` | pin flag never cleared |
| 18 | 🔴 **the entire `/api/events/manage` fetch — `setEvents(fetched)` and the auto-open loop** | see below |

🔴 **#18 is why it could never recover.** `setEvents` never ran → `activeEvent` never resolved →
`eventScopeRef.current` stayed `null` → the next poll took the same pre-resolution branch and sent the same
bare id → the same mismatch. **The failure was self-perpetuating, not a first-load blip.** Polling forever
could not fix it; only a navigation without `?event_id=` could — which is exactly what the cold relaunch
did.

### AFTER

```tsx
      const scopeMismatch =
        !!requestedEventId && servedEventId !== undefined && servedEventId !== null && servedEventId !== requestedEventId

      setTruck(data.truck)
      setShowCookingStep(data.vanShowCookingStep ?? false)
      setActiveVanCount(data.activeVanCount ?? null)
      setBuzzerCount(data.vanBuzzerCount ?? null)
      setCategoryOrder(data.categoryOrder ?? [])
      setItemCategoryMap(data.itemCategoryMap ?? {})
      setCatConfigs(data.catConfigs ?? {})
      setRequiresPin(false)

      if (scopeMismatch) {
        console.error(`[kds] event scope mismatch — requested ${requestedEventId}, served ${servedEventId ?? 'null'}; rendering no orders`)
        setEventScopeMismatch({ requested: requestedEventId as string, served: servedEventId ?? null })
        setOrders([])
      } else {
        setEventScopeMismatch(null)
        …the per-order filter, setOrders(merge), both pause columns, extra wait, payments…
      }

      // the events fetch now ALWAYS runs
```

**The split is by SCOPE, not by convenience.** Hoisted: the truck row, the van's cooking-step and buzzer
settings, the truck's van count, the menu maps, the auth flag — **none is event-scoped**; every one is a fact
about the truck or the van, resolved from the token before any event is chosen. Kept inside the guard:
orders, both pause columns (`truck_events.paused_until` of the *selected* event), extra wait (sourced from
the selected event, `route.ts:712`) and the payment maps (keyed off the served orders). **The forbidden state
— one event's data under another event's name — is still impossible. Only the truck escapes.**

The guard's own `setLoading(false)` was dropped because `finally { setLoading(false) }` already covers every
path; verified by execution below.

⚠️ **One tidy-up, stated rather than slipped in:** `setHeldAuthorisations` appeared **twice**, back to back,
the first misindented by four spaces. The duplicate is removed. Same call, same guard, same result — this is
a dead line, not a behaviour change.

---

## FIX 2 · `openKDS` sends `date` alongside `event_id`, from one object

`app/dashboard/[token]/page.tsx` — **the pair is built in one expression from one resolved object**, which
is the invariant the V11.25 work exists to hold:

```tsx
    const scope=activeEvent?.id?{id:activeEvent.id,date:activeEvent.event_date??null}:null
    const ev=scope?[`event_id=${encodeURIComponent(scope.id)}`,...(scope.date?[`date=${encodeURIComponent(scope.date)}`]:[])].join('&'):''
```

There is no second lookup and no second source: `scope` is read once, and both params come out of it. A
null `event_date` sends the id alone rather than a bare `date=` the route would read as an empty string.

**`ev` feeds both branches unchanged** — the native `parts` array and the web `window.open` — so the fix
lands on the native handover and the web one together.

### The receiving half, without which the sender is inert

`applyEventScope`'s pre-resolution branch sent a bare id, and its comment claimed *"there is nothing for it
to disagree with"*. There was. The KDS now reads the date the handover sends:

```tsx
  const seedEventDate = searchParams.get('date') ?? ''
```

```tsx
    if (fallbackId) {
      params.set('event_id', fallbackId)
      if (seedEventDate && fallbackId === seedEventId) params.set('date', seedEventDate)
      return fallbackId
    }
```

🔴 **`fallbackId === seedEventId` is the safety.** `seedEventDate` describes `seedEventId` and nothing else,
so it can never be paired with an event it does not describe. Once the operator switches event,
`eventScopeRef` is populated and the branch above owns the pair anyway.

### Executed — the real expressions, extracted from the files and run

```
openKDS QUERY STRING, EXECUTED:
  today's event          -> "event_id=ev-today&date=2026-08-18"
  future event           -> "event_id=ev-2108&date=2026-08-21"
  event with null date   -> "event_id=ev-nodate"
  no active event        -> ""

applyEventScope, EXECUTED (real body, types stripped):
  1st fetch, handover 21 Aug (ref unset) : event_id=ev-2108&date=2026-08-21   (requested=ev-2108)
  1st fetch, handover with no date       : event_id=ev-2108                   (requested=ev-2108)
  after events land (ref populated)      : event_id=ev-2108&date=2026-08-21   (requested=ev-2108)
  switched event, seed date NOT reused   : event_id=ev-other                  (requested=ev-other)
  cold launch, nothing seeded            :                                    (requested=null)
```

**The pair rides together on the very first fetch, and the seed date is never attached to a different id.**

---

## FIX 3 · A served `null` is not a mismatch

### The corrected condition

```tsx
      const scopeMismatch =
        !!requestedEventId && servedEventId !== undefined && servedEventId !== null && servedEventId !== requestedEventId
```

`servedEventId !== null` is the addition. `null` means **"this truck has no event on the date I resolved"**,
not "I served you a different event".

🔴 **It is safe to exclude, not merely convenient.** `/api/dashboard` wraps **both** order queries in
`if (selectedEventId) { … }` (route.ts:249). A null selection runs **no orders query at all**, so
`data.orders` is empty. There is no wrong-event data to protect against because there is no data.

### Executed truth table — the real expression, evaluated

```
scopeMismatch TRUTH TABLE, EXECUTED:
  today's event, date sent, matched            requested=ev-today  served=ev-today  -> ok
  future event, date sent (FIX 2), matched     requested=ev-2108   served=ev-2108   -> ok
  future event, NO date (the old bug)          requested=ev-2108   served=ev-today  -> MISMATCH
  no event today, served null (FIX 3)          requested=ev-2108   served=null      -> ok
  cold launch, nothing requested               requested=null      served=ev-today  -> ok
  older server, field absent                   requested=ev-2108   served=undefined -> ok
  genuine wrong event served                   requested=ev-2108   served=ev-other  -> MISMATCH
```

Row 4 is defect C, gone. Rows 3 and 7 confirm a **genuine** wrong-event response still trips the guard — the
protection is narrowed, not removed. Rows 5 and 6 confirm the two pre-existing escapes are untouched.

### What a no-event day now renders

`truck` is set (Fix 1) → the `if (error || !truck)` return does not fire → the board renders. `scopeMismatch`
is false → the else branch runs → `setOrders(merge(prev, []))` → an empty grid. The events fetch runs, so the
event chips and the "no event" state resolve normally. **An empty board with the screen's own no-orders
treatment — not an error, and not a red mismatch banner claiming a scope problem that does not exist.**

---

## FIX 4 · The notice is reachable — by making the guard not produce that state

**I did not move the notice. I removed the state that suppressed it, which is the fix the brief offers as the
alternative and the correct one of the two.**

The notice renders at `kds/page.tsx:2367`, inside the main return — **below** `if (error || !truck)`. Moving
it above that return would have made the *notice* visible while leaving `truck` null: the board behind it
would still be the error screen, and every one of the seventeen skipped statements would still be skipped.
That treats the symptom and leaves the disease.

With Fix 1, `setTruck(data.truck)` runs on **every** path that can set the notice, so the state
"notice set ∧ truck null" is unreachable by construction. The notice now renders exactly where it was
written to render, above the pause banners, as its own comment always claimed.

⚠️ **The brief's point stands and is worth recording:** a notice that could only be set in the one state that
guaranteed it could not be shown reads as tested when it never was. It was written for an operator
*switching* event on a loaded board — where `truck` is already set — and was being reached on a *cold open*,
where it never had been.

---

## Layer 3 · The per-order `event_id` filter — unchanged, and still cannot fire

Not touched. It now sits **inside the else branch**, which is strictly stronger than before:

```tsx
      const incomingOrders = requestedEventId
        ? rawOrders.filter((o: Order) => o.event_id === requestedEventId)
        : rawOrders
```

It only executes when `scopeMismatch` is false, i.e. when `servedEventId` is `undefined`, `null`, or **equal
to** `requestedEventId`. In each case it cannot drop a row:

| Reached with | Route's orders query | Can the filter drop a row? |
|---|---|---|
| `served === requested` | `.eq('event_id', selectedEventId)` where `selectedEventId === requestedEventId` | **No** — every row carries that id |
| `served === null` | no orders query at all (`if (selectedEventId)`) | **No** — zero rows |
| `served === undefined` (old server) | unknown shape | unchanged from before this work |
| `requestedEventId === null` | filter skipped by its own ternary | **No** |

**Fix 2 makes `served === requested` the normal case rather than a hope**, so the filter's own comment —
*"THIS SHOULD NEVER FIRE"* — is now true for the reason it claims. Verified structurally by execution below.

---

## 🔴 Gusto's live path — exactly what they see, before and after

The dashboard is Gusto's live surface, and defect C broke their Kitchen screen on **any day with no event**.

| Scenario | BEFORE | AFTER |
|---|---|---|
| **An event today**, selected on the dashboard | ✅ Worked. `date` defaulted to today, the event was in `todayEvents`, `served === requested`. | ✅ **Unchanged.** `date` is now sent explicitly and equals the default. Same match, same board. |
| **A future event handed over** (e.g. tomorrow's, or a pre-order event) | 🔴 **"Truck not found".** Route defaulted `date` to today, the event was not in the set, served a different id, guard fired before `setTruck`. | ✅ **The board loads, scoped to that event.** `date` rides with the id, the route matches it, `served === requested`, no mismatch. |
| **No event at all today** | 🔴 **"Truck not found"** whenever any event was handed over — `selectedEventId` resolved to `null`, `null !== undefined`, guard fired. | ✅ **Empty board with the screen's own no-orders treatment.** `null` is no longer a mismatch, and the truck is set regardless. |

⚠️ **And in the one case where a mismatch is genuine** — the server really did serve a different event —
the operator now gets the **red "Orders not loaded for this event" notice on a working board**, which is what
that notice was written to do, instead of a screen claiming their truck does not exist.

---

## Verification

### Verified by EXECUTION

The real expressions were **extracted from the edited files by regex and evaluated**, not paraphrased.

| Claim | How |
|---|---|
| ✅ **A future event handed over loads the board** | `openKDS` executed → `event_id=ev-2108&date=2026-08-21`; `applyEventScope` executed → forwards both on the first fetch; `scopeMismatch` executed with `requested === served` → `ok`. |
| ✅ **No event today renders an empty board, not an error** | `scopeMismatch(requested='ev-2108', served=null)` → **`ok`**. Route source confirms `if (selectedEventId)` gates both order queries, so the response carries no orders. |
| ✅ **Today's event is unchanged** | `openKDS` executed → `event_id=ev-today&date=2026-08-18`, which equals the route's own default; `scopeMismatch` → `ok`. |
| ✅ **`truck` is set on every path the guard can take** | Structural pass over the handler with comments stripped: `setTruck` is before the guard, at top level (not inside any `if`), and **no `return` exists between the ok-check and it**. |
| ✅ **The mismatch notice can render** | Follows from the above: `setTruck` precedes both branches, so `truck` is non-null wherever `setEventScopeMismatch` is called. |
| ✅ **The per-order filter cannot fire** | Structural pass: the filter is inside the `else`, so it runs only when the ids agree, are `null`, or nothing was requested. |
| ✅ **The handler no longer abandons itself** | Structural pass: zero `return`s in the mismatch branch; the `/api/events/manage` fetch is after the guard block; `setLoading(false)` is still in `finally`. |

```
STRUCTURAL ASSERTIONS (comments stripped):
  setTruck appears BEFORE the guard              : true
  no 'return' between the ok-check and setTruck  : true
  setTruck is at top level (not inside an if)    : true
  guard no longer returns (0 returns in branch)  : true
  per-order filter is INSIDE the else branch     : true
  events fetch is AFTER the guard block          : true
  setLoading(false) still in finally             : true
```

### Verified by SOURCE ONLY

| Claim | Basis, and its limit |
|---|---|
| ⚠️ **The route matches an `event_id` once `date` accompanies it** | Read from `route.ts:67` (`date` default), `:135` (`.eq('event_date', date)`) and `:182` (`eventIdParam && todayEvents?.some(...)`). **The route was not executed** — no server was run. |
| ⚠️ **A null selection returns no orders** | `route.ts:249` — `if (selectedEventId) { …both queries… }`. Read, not run. |
| ⚠️ **The rendered result on a device** | Not observed. No `next dev`, no `next build`, no deploy. The three scenarios are argued from the executed expressions plus the route source, not from a screen. |
| ⚠️ **Nothing else consumes the hoisted state in an event-scoped way** | Each hoisted setter was traced to a truck-, van- or menu-level field in the route's response map. |

### 🔴 Not offered as verification

`npx tsc --noEmit` reports no error in either file. **The brief is right that this is not verification** — a
statement reorder is precisely what a typechecker cannot fail on. Recorded only to say both files compile.

**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any commit, any SQL.

---

## 8 · ⚠️ This needs a DEPLOY. A rebuild alone does nothing.

**Plainly: rebuilding the iPad app will not pick this up.**

Both changed files are **web pages served from the remote URL**. `capacitor.config.ts` sets
`server.url = https://www.hatchgrab.com/app`, so the shell is a WKWebView loading the deployed site — the
JavaScript for the dashboard and the KDS comes down the wire on every launch, not out of the bundle.

**The change reaches the device when, and only when, the web app is deployed.** After deploying, the iPad
picks it up on the next load of those routes — no `cap sync`, no Xcode build, no App Store submission. The
native shell is untouched by this work: no plugin, no config, no native file.

---

## 9 · Integrity

### Byte-level scan — separate pass per file, byte tool (`open(path,'rb')`), never grep

Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. **Before** is `git show HEAD:<path>`
(HEAD = `cf26f1d`); **after** is the working tree.

| File | | Bytes | NUL | Other flagged | **Total flagged** | TAB / LF / CR | non-ASCII | classes |
|---|---|---|---|---|---|---|---|---|
| `kds/page.tsx` | before | 229279 | 0 | 0 | **0** | 0 / 3068 / 0 | 3656 | 33 |
| `kds/page.tsx` | after | 233564 | 0 | 0 | **0** | 0 / 3114 / 0 | 3763 | 34 |
| `dashboard/page.tsx` | before | 406902 | 0 | 0 | **0** | 0 / 5203 / 0 | 3767 | 53 |
| `dashboard/page.tsx` | after | 408294 | 0 | 0 | **0** | 0 / 5216 / 0 | 3809 | 53 |

**Zero flagged control bytes on all four scans. No sanitisation was needed and none was performed.**

Class census delta — every change is comment text I wrote:

```
--- kds/page.tsx: class delta (before -> after) ---
    U+1F534 LARGE RED CIRCLE                    202 ->   210   (+8)
    U+2014 EM DASH                              419 ->   435   (+16)
    U+2026 HORIZONTAL ELLIPSIS                    0 ->     1   (+1)
    U+2500 BOX DRAWINGS LIGHT HORIZONTAL       2625 ->  2701   (+76)
    U+26A0 WARNING SIGN                         140 ->   143   (+3)
    U+FE0F VARIATION SELECTOR-16                145 ->   148   (+3)
    NEW classes: ['U+2026 HORIZONTAL ELLIPSIS']   REMOVED: none

--- dashboard/page.tsx: class delta (before -> after) ---
    U+1F534 LARGE RED CIRCLE                    127 ->   129   (+2)
    U+2014 EM DASH                              538 ->   541   (+3)
    U+21D2 RIGHTWARDS DOUBLE ARROW               15 ->    16   (+1)
    U+2500 BOX DRAWINGS LIGHT HORIZONTAL       2592 ->  2626   (+34)
    U+26A0 WARNING SIGN                          93 ->    94   (+1)
    U+FE0F VARIATION SELECTOR-16                 92 ->    93   (+1)
    NEW classes: none   REMOVED: none
```

⚠️ **One new class in `kds/page.tsx`: U+2026 HORIZONTAL ELLIPSIS ×1**, from `if (selectedEventId) { … }`
quoted inside a comment. Named rather than buried in a "+1". **No class was removed from either file**, and
U+26A0 and U+FE0F moved together (+3/+3 and +1/+1) — the pairing convention is preserved exactly.

**`docs/kds-handover-fix-report.md`** — scanned as a separate pass after writing; figures in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the number
changes the file, which changes the number. The digit-stable figure, and the one that matters, is the flagged
count: **zero**. Length, LF count and the full class census were measured on the final file and are in chat.

### Carrier-aware variation-selector check

Per emoji-presentation base, bare versus followed by U+FE0F. Counts in the chat reply, same constraint as
above. The rule they satisfy: `Emoji_Presentation=Yes` bases 100% bare (VS-16 redundant),
`Emoji_Presentation=No` bases 100% paired (without it they render as monochrome text). **No base appears
both bare and paired.**

### `git status --porcelain`

Printed in the chat reply.

| Entry | Pre-existed this task? |
|---|---|
| `?? docs/kds-truck-not-found-report.md` | ✅ **YES** — the accepted diagnosis, written in the previous turn. `cf26f1d` was committed **before** it existed, so it never entered a commit and was already untracked when this task began. Not touched here. |
| `M app/dashboard/[token]/kds/page.tsx` | ❌ No — Fixes 1, 2 (receiving half), 3, 4. |
| `M app/dashboard/[token]/page.tsx` | ❌ No — Fix 2 (sending half). |
| `?? docs/kds-handover-fix-report.md` | ❌ No — this report. |

**One entry pre-existed: the diagnosis report.** Everything else from earlier in this session was committed
**outside this task** as `cf26f1d` ("ipad banner fix", 18 Aug 20:41), which is why the tree was otherwise
clean at the start. The three remaining entries are this task's own work.

Nothing was committed, staged, reverted, stashed or cleaned. **No `git stash`, `git checkout` or
`git restore` was run at any point in this session.** The only git commands used here were read-only:
`git show HEAD:<path>` and `git status`.

---

## 10 · Flags

1. **Duplicate `setHeldAuthorisations` removed** (Fix 1). Dead line, identical call, one of the two
   misindented. Stated rather than slipped in.
2. **The guard now narrows rather than returns.** Its protective guarantee is unchanged — no event-scoped
   field is applied on a mismatch — but the handler completes, so the events fetch runs and the board can
   recover on the next poll instead of being stuck forever.
3. ⚠️ **`offlinePauseEventId` is still the field carrying the served event id**, and its name still says
   something else. Not renamed — that is a server change and the server is out of scope, as the existing
   comment already records.
4. **No instruction in this prompt contradicted another, and no span arrived garbled.** Nothing needed asking.
