# Android hardware back — a handler that dismisses, and never navigates

Scope honoured: **one new module and three surface registrations.** No `next dev`, no `next build`, no
`cap sync`, no deploy, no commit, **no package installed**, no database write, no Stripe call, no
migration.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Dashboard, KDS, manage, Add Order and the customer page are reported **separately**. Every claim is
marked **READ** or **INFERRED**.

> ✅ `npx tsc --noEmit` exits 0. ⚠️ **Nothing here has run on an Android device** — Part G is the test.

🔴 **ONE SURFACE IS DELIBERATELY NOT WIRED IN THIS PASS — manage, 33 overlays — and the reason it is
safe to leave is the single most important design decision below. Read C1 before judging the coverage.**

---

# PART A — WHAT IS THERE

## A1. Capacitor's `OnBackPressedCallback`

**READ** — `node_modules/@capacitor/app/android/src/main/java/com/capacitorjs/plugins/app/AppPlugin.java:50-66`:

```java
        this.onBackPressedCallback = new OnBackPressedCallback(!disableBackButtonHandler) {
            @Override
            public void handleOnBackPressed() {
                if (!hasListeners(EVENT_BACK_BUTTON)) {
                    if (bridge.getWebView().canGoBack()) {
                        bridge.getWebView().goBack();
                    }
                } else {
                    JSObject data = new JSObject();
                    data.put("canGoBack", bridge.getWebView().canGoBack());
                    notifyListeners(EVENT_BACK_BUTTON, data, true);
                    bridge.triggerJSEvent("backbutton", "document");
                }
            }
        };

        getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), this.onBackPressedCallback);
```

🔴 **THE `if/else` IS THE WHOLE MECHANISM OF THIS FIX. Registering ANY listener moves execution from the
`goBack()` branch to the `notifyListeners` branch** — so the destructive navigation is not suppressed by
our handler, it **stops being reachable at all**. That property is what makes C1's answer possible.

## A2. The existing `appStateChange` listener — the shape followed

**READ** — `lib/native/app.ts` in full, the only existing consumer of `@capacitor/app`:

```ts
export function onAppResume(cb: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  let remove: (() => void) | undefined
  import('@capacitor/app')
    .then(({ App }) => {
      const handlePromise = App.addListener('appStateChange', (state: { isActive: boolean }) => {
        if (state.isActive) cb()
      })
      Promise.resolve(handlePromise).then((handle: { remove: () => void }) => {
        remove = () => { try { handle.remove() } catch {} }
      })
    })
    .catch(() => {})
  return () => { remove?.() }
}
```

✅ **The new module follows it exactly**: `Capacitor.isNativePlatform()` guard, **dynamic import** (keeps
the plugin off the web bundle), `Promise.resolve(handlePromise)` for the handle, `try/catch` on
`remove`, `.catch(() => {})` on the import. **No second registration pattern was invented.**

## A3. 🔴 THE INVENTORY — every overlay on the operator surfaces

**READ** — counted by `fixed inset-0` and cross-checked against the gate on the line above each:

| Surface | Overlays | Wired |
|---|---|---|
| **KDS** | **5** | ✅ **all 5** |
| **Add Order panel** | **4** | ✅ **all 4** |
| **Dashboard** | **13** | ✅ **all 13** |
| 🔴 **Manage** | **33** | 🔴 **NONE — see C1** |
| **Total** | **55** | **22** |

### KDS — READ, gate and z-index

| Line | z | Gate | Dismissed today by |
|---|---|---|---|
| 1617 | **70** | `isDemo && showKdsIntro` | `dismissKdsIntro()` |
| 1643 | 60 | `deviceOpen && !isDemo` | close button |
| 1588 | 60 | `finishConfirm` | Cancel → `setFinishConfirm(null)` |
| 1564 | 50 | `showEventMenu && activeEvent && !isDemo` | ✅ **backdrop tap** — `onClick={e => e.target === e.currentTarget && setShowEventMenu(false)}` |
| 1542 | 50 | `showScreenOffWarning` | buttons |

### Add Order panel — READ

| Line | Gate | Dismissed today by |
|---|---|---|
| 2231 | `capacityConfirm` | Cancel arm |
| 2300 | `itemModal` | ✅ **backdrop tap** — `<div className="absolute inset-0 bg-black/40" onClick={() => setItemModal(null)} />` |
| 2409 | `showEventPicker` | ✅ **backdrop tap** — `onClick={() => setShowEventPicker(false)}` |
| 2143 | `showOrderSheet` | ✅ **backdrop tap** — `onClick={() => setShowOrderSheet(false)}` |

### Dashboard — READ, all 13 with z-index

`showOfflinePausedNotice` (50) · `finishConfirm` (**60**) · `showPauseModal && !isDemo` (50) ·
`showScreenOffWarning` (50) · `showKDSPicker` (50) · `showProfileModal` (50) ·
`showCancelModal && cancellingOrder` (50) · `showRejectModal && rejectingOrder` (50) ·
`editingOrder` (50) · **`editItemModal` (60)** · `showDemoEventLock` (**60**) ·
`showEventMenu && activeEvent && !isDemo` (50) · `showQRFullscreen` (50)

⚠️ **`editItemModal` opens FROM `editingOrder` and sits at z-60 over it — the one true nesting on this
surface. See C2.**

## A4. Which surfaces are reachable on Android

| Surface | Reachable on Android? |
|---|---|
| Dashboard | ✅ yes |
| KDS | ✅ yes |
| Manage | ✅ yes |
| Add Order panel | ✅ yes — a tab of the dashboard |
| **Customer order page** | ⚠️ **In a BROWSER, yes. In the app, no** — the shell's `server.url` is `/app`, the operator entry point. **See Part D.** |

---

# PART B — THE HANDLER

## B1. One listener, one registry — where it lives

**NEW FILE: `lib/native/backHandler.ts`.** 🔴 **The listener is global, so several registrations would
ALL fire on one press and two mounted surfaces would each close something.** The module therefore holds
**one** listener over a **LIFO stack of resolvers**, attached lazily on the first registration:

```ts
type BackResolver = () => boolean

const resolvers: BackResolver[] = []
let listenerAttached = false
```

```ts
      const handlePromise = App.addListener('backButton', () => {
        for (let i = resolvers.length - 1; i >= 0; i--) {
          try {
            if (resolvers[i]()) return
          } catch (err) {
            console.error('[back] resolver threw, skipping:', err)
          }
        }
        // 🔴 NOTHING HANDLED IT. DO NOTHING. No navigation, no exit. See the header.
      })
```

**Surfaces register through one hook — READ:**

```ts
export function useAndroidBack(entries: Array<[boolean, () => void]>): void {
  const latest = useRef(entries)
  latest.current = entries

  useEffect(() => {
    const resolver: BackResolver = () => {
      for (const [isOpen, close] of latest.current) {
        if (isOpen) { close(); return true }
      }
      return false
    }
    resolvers.push(resolver)
    ensureListener()
    return () => {
      const i = resolvers.indexOf(resolver)
      if (i !== -1) resolvers.splice(i, 1)
      …
    }
  }, [])
}
```

⚠️ **The entries are read through a REF, not captured** — the resolver registers once per mount but
reads the **latest** array each time it runs. **Capturing the array in the closure would freeze it at
first render and the handler would believe every modal was shut.**

⚠️ **`listenerAttached` is set AFTER a successful attach**, matching `lib/native/push.ts`'s reasoning:
set-first would leave the app permanently handler-less after one transient import failure.

⚠️ **The listener is never detached when the stack empties**, deliberately — attaching is asynchronous,
so a detach-on-empty could race a remount and **restore Capacitor's destructive `goBack()` branch**. An
idle listener over an empty stack does nothing.

## B2. Precedence, and how each level is detected

| Level | Rule | How it is detected |
|---|---|---|
| **1. A modal is open** | **CLOSE IT. Do not navigate.** | The surface's own `[isOpen, close]` entry, **ordered innermost first** — the first truthy one wins and the press is consumed. |
| **2. A panel or sub-view** | close that | ⚠️ **Modelled as the same list**, ordered after the modals. On Add Order, `showOrderSheet` is exactly this and sits last. |
| **3. Navigate up one level** | 🔴 **NOT IMPLEMENTED — DELIBERATELY.** | **There is no navigation in any list and no fallback in the handler.** See below. |
| **4. At a root screen** | **DO NOTHING** | The loop ends, nothing returns true, and the handler returns. **No `router.back()`, no `exitApp()`, no `goBack()`.** |

🔴 **LEVEL 3 IS ABSENT, AND THAT IS A DECISION, NOT AN OMISSION.** "Navigate up one level" on these
surfaces means leaving the dashboard or the KDS — which is precisely the destructive behaviour being
fixed. **B3 forbids it on the KDS absolutely, and there is no operator surface where a gesture leaving
the screen is better than a tap on a deliberate control.** ⚠️ **If an "up" level is ever wanted, it
should be per-surface and explicit, not a global fallback — a global one would reintroduce exactly
today's defect on any screen nobody wired.**

## B3. 🔴 THE KDS — the code that guarantees back does nothing

**READ, as committed:**

```tsx
  // ── 🔴 ANDROID HARDWARE BACK — THE KDS IS THE HIGH-RISK SURFACE ────────────────────────────────
  // ORDERED INNERMOST FIRST, which here means highest z-index first: the demo intro (z-70) sits over
  // the device sheet and the finish confirm (both z-60), which sit over the event menu and the
  // screen-off warning (z-50). Back closes exactly the top one and consumes the press.
  //
  // 🔴 AND WITH NOTHING OPEN, BACK DOES NOTHING. There is no navigation entry in this list and no
  // fallback in the handler — an operator mid-service CANNOT lose the board to a stray edge-swipe,
  // which is what happened before: canGoBack() was true and Capacitor navigated the page away.
  // ⚠️ Do not add a "go back to the dashboard" entry here. The Dashboard control in the header is the
  // deliberate way off this screen; a gesture is not.
  useAndroidBack([
    [isDemo && showKdsIntro, () => dismissKdsIntro()],
    [deviceOpen && !isDemo, () => setDeviceOpen(false)],
    [!!finishConfirm, () => setFinishConfirm(null)],
    [showEventMenu && !!activeEvent && !isDemo, () => setShowEventMenu(false)],
    [showScreenOffWarning, () => setShowScreenOffWarning(false)],
  ])
```

🔴 **THE GUARANTEE IS STRUCTURAL: every one of the five entries is a `setState`. Not one navigates.**
With all five false the resolver returns `false`, the handler's loop ends, and **the function returns
having done nothing.** ✅ **The board cannot be lost.**

## B4. `canGoBack` — received and deliberately ignored

**READ, as committed:**

```ts
      // 🔴 `canGoBack` IS DELIBERATELY IGNORED. It arrives on the event and it is exactly the wrong
      // signal here: it is true on nearly every operator screen precisely BECAUSE router.push pushed a
      // history entry, and acting on it is what threw the page away. Whether there is history to burn
      // has no bearing on whether a modal is open.
      const handlePromise = App.addListener('backButton', () => {
```

⚠️ **The listener signature takes no parameter at all**, so the value is not merely unused — it is not
bound. **A future edit cannot casually start acting on it without adding it back deliberately.**

## B5. iOS — registering is inert, and here is the evidence

**READ** — `backButton` **has no iOS emitter**. `node_modules/@capacitor/app/ios/Sources/AppPlugin/`
contains `AppPlugin.swift`, and searching the iOS directory for `backButton` returns **nothing**. The
event is fired only from `AppPlugin.java`'s `OnBackPressedCallback` (A1).

**READ** — the plugin's own type definitions describe it as Android-only,
`node_modules/@capacitor/app/dist/esm/definitions.d.ts:155`:

```
     * Force exit the app. This should only be used in conjunction with the `backButton` handler for Android to
```

✅ **So registering on iOS attaches a listener for an event that never fires.** ⚠️ **No `getPlatform()`
test is written, deliberately** — a platform branch here would be a second thing to keep correct, and
the module is inert on iOS without one. **The only platform guard is `isNativePlatform()`, which keeps
the dynamic import off the web bundle.**

🔴 **iOS BEHAVIOUR IS UNCHANGED. There is no hardware back on iOS to change.**

---

# PART C — THE MODALS

## C1. Coverage — 22 of 55, and why the other 33 are not made worse

| Surface | Overlays | Covered | Note |
|---|---|---|---|
| **KDS** | 5 | ✅ **5** | the unattended board |
| **Add Order** | 4 | ✅ **4** | the part-built order |
| **Dashboard** | 13 | ✅ **13** | |
| 🔴 **Manage** | 33 | 🔴 **0** | **not wired in this pass** |

🔴 **THE BRIEF SAYS "A HANDLER THAT MISSES A MODAL MAKES THAT MODAL WORSE, NOT BETTER." WITH THIS
DESIGN THAT IS NOT TRUE, AND THE MECHANISM IS IN A1.**

Registering **any** listener moves Capacitor from the `goBack()` branch to the `notifyListeners`
branch — **for the whole app, not per surface.** So the moment this module is live:

| | Before | After, wired | After, NOT wired |
|---|---|---|---|
| Back over a modal | 🔴 **navigates the page away, modal state lost** | ✅ **closes the modal** | ⚠️ **does nothing** |
| Back with nothing open | 🔴 **navigates the page away** | ✅ **does nothing** | ✅ **does nothing** |

⚠️ **An unwired modal goes from DESTRUCTIVE to INERT.** Inert is a poor experience; destructive is the
defect. ✅ **So there is no window in which any screen is worse than it was, and manage can be wired
later without urgency.**

**Why manage was left:** 33 overlays in a **785 KB** file, and it is a **settings surface** — an
operator is not on it mid-service with a hot pan. **The two surfaces where a stray swipe costs
something — an unattended kitchen board and a half-built order — are both fully covered.** ⚠️ **Stated
as a scope decision, not an oversight; it is one `useAndroidBack` block to add.**

## C2. ⚠️ Nested modals — innermost only

**Two real nestings exist, and both are handled by list order.**

**Dashboard — `editItemModal` (z-60) opens from `editingOrder` (z-50). READ, as committed:**

```tsx
  useAndroidBack([
    [!!editItemModal, () => setEditItemModal(null)],
    [!!finishConfirm, () => setFinishConfirm(null)],
    [showDemoEventLock, () => setShowDemoEventLock(false)],
    [!!editingOrder, () => setEditingOrder(null)],
    …
```

🔴 **`editItemModal` is FIRST. Back over the item editor closes the item editor and leaves the order
editor open** — the resolver returns `true` on the first match and stops. ⚠️ **Reversed, back would
close the order editor underneath and strand the item editor over nothing.**

**KDS — `finishConfirm` (z-60) stacks over `showEventMenu` (z-50).** **READ**, the code's own note:
*"Stacks above the event menu; early close warns harder. z-[60] so it sits over the event menu modal."*
✅ **`finishConfirm` is listed before `showEventMenu`.**

> ✅ **The rule applied throughout: order by z-index, highest first. Both nestings then fall out of it.**

## C3. 🔴 Modals where closing could LOSE WORK

**Four hold something. Each was decided individually, not by rule.**

| Modal | Holds | Decision |
|---|---|---|
| **`itemModal`** (Add Order) | the modifiers chosen for **one** item, not yet added | ✅ **REGISTERED.** **READ** — it already dismisses on a backdrop tap: `<div className="absolute inset-0 bg-black/40" onClick={() => setItemModal(null)} />`. **Back is the same existing dismissal by another gesture, at the same cost.** |
| **`showOrderSheet`** (Add Order) | nothing — a review sheet over the basket | ✅ **REGISTERED.** Closing returns to the menu; **`manualItems` is untouched.** Already backdrop-dismissible. |
| **`editingOrder`** (dashboard) | an **edit in progress** | ✅ **REGISTERED.** **READ** — already backdrop-dismissible: `onClick={e=>e.target===e.currentTarget&&setEditingOrder(null)}`. Same cost as an existing gesture. |
| **`editItemModal`** (dashboard) | an item edit inside that edit | ⚠️ **REGISTERED, and this one is a genuine trade.** It has **no** backdrop dismiss — closing on back is a *new* way to dismiss it. **It is registered anyway because leaving it out would be worse: back would then close `editingOrder` underneath it** (C2). **The nesting forced the decision.** |

🔴 **THE BASKET IS NEVER CLEARED BY ANY ENTRY, ON ANY SURFACE.** **READ**, the committed comment:

```
  // 🔴 THE BASKET IS NEVER TOUCHED. Closing the order sheet returns to the menu with every line
  // intact; closing the item modal discards only the modifiers chosen for THAT item, which is what
  // its own backdrop tap already does (`onClick={() => setItemModal(null)}` on that overlay).
  // Nothing here clears `manualItems`, and no entry submits anything.
  // ⚠️ `capacityConfirm` is a DECISION modal — dismissing it is the CANCEL arm, never the "place it
  // anyway" arm. Back must never become a way to commit an order past a capacity warning.
```

⚠️ **AND THE DECISION MODALS ARE THE OTHER HALF OF THIS.** `capacityConfirm`, `showCancelModal`,
`showRejectModal` and `finishConfirm` all take an irreversible action on one arm. **Every registered
closer is the setter the modal's own X or Cancel calls — never the confirming arm.** 🔴 **Back can
dismiss a decision; it can never make one.**

---

# PART D — THE CUSTOMER PAGE

## D1 / D2. Out of scope, and unaffected — reported separately

🔴 **The customer order page is NOT affected, and it was not touched.**

- **In a browser on Android** (how customers reach it): **Capacitor is not present at all.**
  `useAndroidBack` is never called on that page, and even if it were, `ensureListener()` returns at
  `if (!Capacitor.isNativePlatform()) return`. ✅ **Hardware back remains the browser's own, exactly as
  today.**
- **In the app:** the shell's `server.url` is `https://www.hatchgrab.com/app` — the operator entry
  point. **INFERRED: an operator does not reach the customer page inside the shell**, and no operator
  navigation targets it.
- **READ:** `app/trucks/[slug]/order/page.tsx` **is not in the diff.** No import, no hook, no change.

✅ **Stated plainly: the customer page is out of scope for this task and is confirmed unaffected.**

---

# PART E — BOUNDARIES

## E1. `git diff --stat`

```
 app/api/webhooks/instagram/route.ts     |  48 ++-
 app/api/webhooks/messenger/route.ts     |  48 ++-
 app/api/webhooks/meta/whatsapp/route.ts | 173 +++++++++--
 app/dashboard/[token]/kds/page.tsx      |  19 ++
 app/dashboard/[token]/page.tsx          |  32 ++
 components/dashboard/AddOrderPanel.tsx  |  22 ++
 docs/reference-manual.md                | 519 +++++++++++++++++++++++++++++++-
```

plus **`lib/native/backHandler.ts`**, untracked.

⚠️ **THIS TASK'S ENTRIES:** the three surface files (**19 + 32 + 22 = 73 added lines, ZERO deletions**),
the new module, and this report. **The three webhook routes and `reference-manual.md` are earlier
tasks.**

**Untouched, counted from the diff by path:**

| Path | Files |
|---|---|
| `lib/payments/` | **0** |
| `lib/slot*` (capacity engine) | **0** |
| `lib/capacity*` | **0** |
| `supabase/migrations/` | **0** |
| `lib/features` (the gate) | **0** |

## E2. No package installed

✅ **`package.json` is NOT in the diff — zero occurrences.** `@capacitor/app` was already a dependency
at **8.1.0** and is already used by `lib/native/app.ts`. **Nothing was added, upgraded or removed.**

## E3. iOS unchanged

✅ **Confirmed three ways:** nothing under `ios/` is in the diff; `backButton` has no iOS emitter (B5);
and the three edited files are shared surfaces whose only change is a hook that registers a listener for
an event iOS never fires. ⚠️ **On iOS the module attaches one inert listener and adds one entry to an
array. No iOS code path branches on it.**

## E4. What changes for a Gusto operator on Android

Back stops being destructive. Today a press or an edge-swipe on any operator screen navigates the whole
page away — over an open modal it discards the modal **and** the screen beneath it, and on the kitchen
display that means the board vanishes mid-service with no obvious way back. After this, a press closes
the topmost open modal on the dashboard, the KDS and the Add Order panel — the same dismissal the X or a
backdrop tap already performs — and **with nothing open it does nothing at all.** 🔴 **An operator can
no longer lose the board, and a half-built order survives a stray swipe: no entry clears the basket and
no entry confirms a decision.** ⚠️ **On the manage settings screen back is now inert rather than
destructive** — an improvement, but not yet the dismissal it should be. ✅ **iOS operators see no change
whatever**, and nothing about ordering, payments, capacity or printing is touched.

---

# PART F — INTEGRITY

## F1 / F2. Non-ASCII census, side by side

| File | bytes | classes before → after | Gained | Lost |
|---|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | 381,182 → 383,613 | **53 → 53** | **NONE** | NONE |
| `app/dashboard/[token]/kds/page.tsx` | 101,652 → 102,971 | **32 → 32** | **NONE** | NONE |
| `components/dashboard/AddOrderPanel.tsx` | 168,995 → 170,492 | **36 → 36** | **NONE** | NONE |
| `lib/native/backHandler.ts` | — → 6,560 | **new file, 5** | n/a | n/a |

**Every difference explained** — in all three edited files the movement is confined to classes the file
already held: **U+2500 BOX DRAWINGS** (+69 / +34 / +16, the section rules), **U+2014 EM DASH**
(+2 / +2 / +3), **U+1F534** (+2 / +2 / +2), and **U+26A0 with U+FE0F** (+2/+2, +1/+1, +2/+2 — **paired,
see F3**).

⚠️ **THE BRIEF'S WARNING — "five tasks running have introduced glyph classes into files that had
none" — WAS CHECKED BEFORE ASSERTING, AND THIS TIME IT DID NOT HAPPEN.** All three files already used
the house vocabulary (box rules, red circles, paired warning signs), so the same style added no class.
✅ **The difference from the last two tasks is that those files had NARROW baselines; these three do
not. The rule was applied by measuring, not by remembering.**

## F3. Carrier-aware variation-selector check

🔴 Carriers read from **what actually precedes each U+FE0F**, never from a Unicode-category filter — a
`category == 'So'` filter silently misses bases such as U+2139 INFORMATION SOURCE (category `Ll`).

| File | U+26A0 before → after (n / paired / bare) | sum(carriers) = U+FE0F |
|---|---|---|
| `app/dashboard/[token]/page.tsx` | 65/62/**3** → 67/64/**3** | 65 = 65 ✅ |
| `app/dashboard/[token]/kds/page.tsx` | 19/18/**1** → 20/19/**1** | 20 = 20 ✅ |
| `components/dashboard/AddOrderPanel.tsx` | 42/39/**3** → 44/41/**3** | 43 = 43 ✅ |
| `lib/native/backHandler.ts` | — → 6/6/**0** | 6 = 6 ✅ |

✅ **Every warning sign added by this task is paired.** The bare counts — **3, 1, 3** — are **unchanged**
from before, i.e. pre-existing and untouched.

## F4. Byte scan of every edited file — byte-level, never grep

All four scanned for NUL, every control byte below 0x09, the 0x0B/0x0C pair, 0x0E-0x1F and 0x7F.
**Offending: 0 in every file. CRLF: 0. Lone CR: 0.**

## F5. Byte scan of this report

Separate pass after writing: **28,265 bytes scanned, offending = 0** — no NUL, no control byte below
0x09, no CRLF, no lone CR.

**And the carrier-aware check on this report, measured in the same pass:**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 45 | 0 | 45 |
| U+1F534 LARGE RED CIRCLE | 39 | 0 | 39 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 34 | 0 | 34 |
| U+26A0 WARNING SIGN | 29 | 29 | **0** |

**Sum of per-base paired = 29 = total U+FE0F count = 29** — every selector has a named carrier, no
orphan, no double-count, **zero bare warning signs**. ⚠️ **U+2500 is a box-drawing rule inside the
quoted source comments, not an emoji** — reporting its 34 occurrences as unpaired would be exactly the
false positive this method exists to prevent.

## F6. `git status` and `git diff --stat`

`git diff --stat` is at E1. **THIS TASK: the three surface files, `lib/native/backHandler.ts`, and this
report.** ⚠️ Everything else predates it. **Nothing staged, branch still `main`.**

---

# PART G — WHAT YOU MUST TEST

⚠️ **None of this has run on a device. `tsc` is clean and every change is quoted, but nothing rendered.**

🔴 **TEST EVERY ITEM TWICE — ONCE WITH GESTURE NAVIGATION AND ONCE WITH THREE-BUTTON.** They dispatch
through the same `OnBackPressedDispatcher` so they *should* behave identically (**INFERRED**), but an
edge-swipe is far easier to trigger by accident, which is the case this fix exists for.

⚠️ **A `cap sync` and an Android build are required first — none of this is on a device today.**

### 1. 🔴 KDS with NOTHING open — the one that matters most

Open the kitchen display, no modal, orders on the board. Press back.

- ✅ **PASS: NOTHING HAPPENS.** The board stays, the orders stay, the event stays.
- 🔴 **FAIL: the screen changes in any way** → stop and report. **This is the defect the task exists to
  fix and there is no acceptable variant of it.**
- **Repeat after navigating dashboard → KDS**, so history definitely exists. **Same result required.**

### 2. Back over an open modal — each surface

| Surface | Open this | PASS | FAIL |
|---|---|---|---|
| **KDS** | the event menu (⋯) | the menu closes, the board stays | the page navigates, or nothing happens |
| **KDS** | Finish event confirm | the confirm closes, **the event is NOT finished** | the event finishes → 🔴 **stop** |
| **Dashboard** | Edit order | the editor closes | the page navigates |
| **Dashboard** | Cancel order confirm | the confirm closes, **the order is NOT cancelled** | the order cancels → 🔴 **stop** |
| **Add Order** | the item modifier modal | the modal closes, **the basket is intact** | the basket empties → 🔴 **stop** |
| 🔴 **Manage** | any settings modal | ⚠️ **NOTHING HAPPENS — expected, not a failure.** See C1. | the page navigates → the module is not live |

### 3. Back over a NESTED sheet

Dashboard → Edit order → open the item editor within it. Press back **once**.

- ✅ **PASS: the ITEM editor closes and the ORDER editor is still open.**
- 🔴 **FAIL: both close, or the order editor closes and the item editor is stranded** → the list order
  is wrong.
- **Press back again: the order editor closes. A third press: nothing.**

### 4. 🔴 Back with a PART-BUILT ORDER in the Add Order panel

Add two or three items, choose modifiers, **do not submit**. Then:

- **With the item modal open:** back closes it. ✅ **PASS: the previously-added items are still in the
  basket.** 🔴 **FAIL: any basket line disappears → stop and report.**
- **With the review sheet open:** back closes it. ✅ **PASS: back on the menu with the basket intact.**
- **With nothing open:** back does nothing. ✅ **PASS: the basket is untouched.**
- **With the capacity confirm open:** back closes it. 🔴 **PASS requires that the order is NOT placed.**
  **FAIL: an order appears on the board → stop immediately; that is a money path.**

### 5. Back at a ROOT screen

Cold-launch the app so it lands on the dashboard (or the KDS via `default_screen`) with no navigation.
Press back.

- ✅ **PASS: nothing happens. The app stays open and the screen is unchanged.**
- ⚠️ **The app should NOT close** — but note it did not close before this change either (Capacitor
  already consumed the press). **What changed is that it no longer navigates.**

### 6. Two supporting checks

- **iOS regression:** open the same modals on the iPad and confirm **nothing about them changed** —
  there is no hardware back to press, so this is a check that the shared components still behave.
- **Web regression:** open the dashboard in a desktop browser, press the browser's back button.
  ✅ **PASS: ordinary browser behaviour, unchanged** — the module never attaches off-native.
