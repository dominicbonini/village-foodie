# The KDS status bar, and the removal of a capture site's button

Scope honoured: **three files edited.** No `next dev`, no `next build`, no deploy, no archive, no
commit, no package installed, no migration, no gate, **nothing under `lib/payments/`**. **Part D was
SKIPPED — nothing native changed, so `cap sync` was not run.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Dashboard and KDS are reported **separately**. Every claim is marked **READ**, **INFERRED** or
**MEASURED**.

> ✅ `npx tsc --noEmit` exits 0.
> 🔴 **PART B's four blockers were RE-VERIFIED FROM THE FOUR FILES, not from a report, before anything
> was deleted.** All four name `'modified'`. No STOP condition was reached. B2.
> ⚠️ **The accepted cost is stated in B6 and again in the code**: Edit's capture is now the routine
> path, and it arrives through a backstop whose own comments call a recovery *"a defect report, not a
> success story"*.

---

# PART A — STATUS BAR: DARK CONTENT ON THE KDS ONLY

## A1. `configureStatusBar()` and every call site — READ, before

```ts
export async function configureStatusBar() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
…
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setStyle({ style: Style.Dark })
```

**READ** — **four** call sites, complete:

```
app/app/page.tsx:26                       void configureStatusBar()                    <- cold-launch entry
app/dashboard/[token]/page.tsx:197        …setLastScreen('dashboard');void configureStatusBar()…
app/dashboard/[token]/kds/page.tsx:411    configureStatusBar()
app/manage/[token]/page.tsx:321           useEffect(() => { void configureStatusBar() }, [])
```

🔴 **ALL FOUR TOOK THE SAME HARDCODED `Style.Dark`, AND THE NAME IS THE TRAP.** **READ** — the file's
own comment, quoting the plugin's typedef: *"`Style.Dark` = "Light text for dark backgrounds"
(definitions.d.ts:46-52), i.e. LIGHT icons — correct against the navy header."* **Correct for three
surfaces; wrong for the one with a white header.**

## A2. Per-surface — before and after

**READ, after** — the helper takes a **semantic** parameter, not the plugin's enum:

```ts
export type StatusBarContent = 'light' | 'dark'

export async function configureStatusBar(content: StatusBarContent = 'light') {
```

```ts
    // Style.Dark = LIGHT glyphs, Style.Light = DARK glyphs. Inverted, hence StatusBarContent above.
    await StatusBar.setStyle({ style: content === 'dark' ? Style.Light : Style.Dark })
```

⚠️ **THE PARAMETER IS NAMED FOR WHAT THE OPERATOR SEES, DELIBERATELY.** A call site reading
`setStyle({ style: Style.Dark })` looks like it asks for dark glyphs and asks for the opposite —
**which is precisely how the KDS ended up with light text on white.** `configureStatusBar('dark')`
cannot be misread.

**READ, after** — the one call site that changed:

```tsx
  useEffect(() => {
    // 'dark' CONTENT, AND THIS IS THE ONE SURFACE THAT ASKS FOR IT. The KDS's top bar is bg-white and
    // fills the safe-area strip, so the shared default (light glyphs, correct against the dashboard's
    // navy AppHeader) rendered the clock and indicators invisible - only the battery, whose filled
    // outline survives, remained readable. The header stays white by decision; the glyphs change.
    configureStatusBar('dark')
```

✅ **The other three call sites are BYTE-IDENTICAL** — the default preserves their behaviour exactly:

```
app/app/page.tsx:26                       void configureStatusBar()
app/dashboard/[token]/page.tsx:197        …void configureStatusBar()…
app/manage/[token]/page.tsx:321           useEffect(() => { void configureStatusBar() }, [])
```

## A3. 🔴 How the KDS is identified — an existing signal, and NO second mechanism

**The caller already knows which surface it is. That is the whole answer, and it is the only one
added.**

🔴 **NO ROUTE TEST, NO `usePathname()`, NO "am I the KDS" HELPER WAS INTRODUCED.** §35 records this
codebase's habit of one question acquiring several answers — the dashboard and KDS resolving the event
independently is the most recent instance — so the fix deliberately adds no new way to ask.

**READ** — each call site is *inside the page it configures*, and two of them already declare their
surface in the same statement:

```tsx
// dashboard — already names itself, in the same effect
useEffect(()=>{if(isNativeApp()){setLastScreen('dashboard');void configureStatusBar()}},[])
// KDS — already names itself, in the effect whose comment says "this effect owns the status bar only"
useEffect(() => { configureStatusBar('dark')
```

✅ **So the surface is stated where it is already known, and nothing has to work it out.** The
alternative — deriving it from the URL inside `statusBar.ts` — would have been a **second** answer to a
question `setLastScreen` already answers.

## A4. Navigation between surfaces — the style follows

**READ** — both effects are `useEffect(..., [])`, i.e. **on mount**. In the native shell every internal
navigation is a soft `router.push` (`AppLink`), so each page mounts and its effect fires.

**KDS → dashboard → KDS, traced:**

| Step | Effect that fires | `setStyle` receives | Result |
|---|---|---|---|
| On the KDS | `kds/page.tsx:411`, `'dark'` | `Style.Light` = **dark glyphs** | ✅ readable on white |
| → dashboard | `page.tsx:197`, default `'light'` | `Style.Dark` = **light glyphs** | ✅ readable on navy |
| → KDS again | `kds/page.tsx:411`, `'dark'` | `Style.Light` | ✅ readable again |

⚠️ **THE SETTING IS NATIVE AND PERSISTS ACROSS NAVIGATION**, which is exactly why a single cold-launch
call was never enough: whichever page rendered last owned the style. **Now each page re-asserts its own
on mount**, so the last writer is always the page in front of the operator.

⚠️ **COLD LAUNCH STRAIGHT TO THE KDS is a two-step and lands correctly.** `/app` calls the default
(light glyphs) at `page.tsx:26`, then routes to the KDS, whose mount effect immediately calls `'dark'`.
**INFERRED: a brief flash of light glyphs is possible on that path** — one paint at most, and only when
`getLastScreen()` is `'kds'`.

## A5. ⚠️ Nothing relied on is one of the three no-ops

**READ** — the three, from `statusBar.ts`'s own verified-against-source comment:

| Call | Status | Relied on here? |
|---|---|---|
| `setOverlaysWebView` | INERT on Android 15+; **load-bearing on iOS** | ⚠️ **unchanged, still called** — not a new dependency |
| `setBackgroundColor` | 🔴 verified no-op, **REMOVED** | ✅ **not used** |
| **`setStyle`** | ✅ **"the ONLY one of the three that still works on Android"** | ✅ **the only thing this change relies on** |

✅ **The fix depends on exactly one call, and it is the one confirmed to work on both platforms.**
⚠️ **`Style.Light` is the same enum as `Style.Dark`, taking the other branch of the same
`setAppearanceLightStatusBars` implementation** — not a different API with its own support question.

## A6. Android — unaffected in appearance, and correct in mechanism

**READ** — `setStyle` maps to `setAppearanceLightStatusBars` on Android (`StatusBar.java:42-52`),
**ungated by any API check**, so the call is honoured there too.

⚠️ **BUT ANDROID'S STRIP IS PAINTED BY THE WINDOW BACKGROUND, NOT BY THE HEADER.** **READ** —
`android/app/src/main/res/values/styles.xml`'s `AppTheme.NoActionBar` → `@color/hgHeaderNavy`
(`#0F172A`), and §36 records `env(safe-area-inset-top)` resolving to **0** on Android because Capacitor
has already padded the WebView's parent.

🔴 **SO ON ANDROID THE KDS'S STRIP IS NAVY, NOT WHITE — and it will now get DARK glyphs on it.**
**INFERRED, and flagged rather than buried: this change makes the Android KDS status bar *worse*, not
better** — dark-on-navy. ⚠️ **It cannot be observed today** (no Android build is on a device, §36) and
**the right fix is not a platform branch in this helper** but for the Android strip to match the
surface the way iOS's does. **Reported, not worked around, as A5's instruction requires.**

---

# PART B — 🔴 THE ADJUST-TIME ROW REMOVED

## B1. The row in full — READ, before

```tsx
          {order.status === 'pending' && order.slot && viewMode !== 'cook' && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="text-xs text-slate-400 font-medium shrink-0">Adjust time:</span>
              {[5, 10, 20].map(mins => (
                <button key={mins}
                  onClick={() => onAction(`adjust_slot_+${mins}`, order.order_key)}
                  className="text-xs bg-slate-100 hover:bg-orange-100 hover:text-orange-700 text-slate-600 font-bold px-2 py-1 rounded-lg transition-colors active:scale-95">
                  +{mins}m
                </button>
              ))}
              <span className="text-xs text-slate-300 ml-1 min-w-0 truncate">→ new time sent to customer</span>
            </div>
          )}
```

**READ** — what `adjust_slot_+N` calls, `app/api/dashboard/action/route.ts:1949-1977`:

```ts
    if (action?.startsWith('adjust_slot_+')) {
…
          await moveSlotBooking(
…
      await supabase.from('orders').update({ slot: newSlot, status: 'confirmed' }).eq('order_key', orderKey)
…
      const adjustCapture = await captureOnConfirmation(supabase, { orderKey, truckId: truck.id, trigger: 'time_adjust' })
```

🔴 **Three writes, not one: a slot move, an unconditional `status: 'confirmed'`, and a Stripe
capture.** ⚠️ **And it is the only capture site that fires on a `'pending'` order** — the row rendered
on `order.status === 'pending'` and nothing else captures there.

## B2. 🔴 RE-VERIFIED FROM THE CODE — all four, before anything was deleted

| # | Blocker | Evidence | Verdict |
|---|---|---|---|
| 1 | **stranded sweep allow-list** | `supabase/migrations/20260816_find_stranded_authorisations_settled.sql:96` | ✅ **includes it** |
| 2 | **`printWatcher` DEFAULT_ELIGIBLE** | `lib/printing/printWatcher.ts:61` | ✅ **includes it** |
| 3 | **customer cancel path** | `app/api/orders/cancel/route.ts:68` | ✅ **allows it** |
| 4 | **due-alert scan** | `app/dashboard/[token]/page.tsx:2490` | ✅ **includes it** |

**READ, each:**

```sql
-- 1. the sweep that collects Edit's deferred capture
    and o.status in ('confirmed', 'modified', 'cooking', 'ready', 'collected')
```
```ts
// 2. the kitchen ticket
const DEFAULT_ELIGIBLE = ['confirmed', 'modified', 'cooking', 'ready']
```
```ts
// 3. the customer's own cancel
    if (!['pending', 'confirmed', 'modified'].includes(order.status)) {
```
```ts
// 4. the due alert — 'modified' is absent from the EXCLUSION, i.e. present in the scan
        if(o.status!=='pending'&&o.status!=='confirmed'&&o.status!=='modified'){ prevUrgencyRef.current.delete(o.order_key); continue }
```

✅ **ALL FOUR NAME `'modified'`. No STOP condition was reached, and the check was made against these
four files rather than against `docs/`.**

🔴 **Blocker 1 is the load-bearing one and deserves naming: Edit writes `'modified'`, and the sweep
that collects a deferred capture used to skip that status.** With it absent, removing this row would
have routed every time change into a capture that nothing would ever pick up. **That is the condition
that changed.**

## B3. Edit fully covers the time change, with the capacity traffic light

**READ** — the Edit modal's Collection time control, `page.tsx:4807-4824`:

```tsx
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Collection time</label>
…
                  <select value={editSlot} onChange={e=>setEditSlot(e.target.value)} …>
…
                      const ind=editSlotIndicators.get(s.collection_time)??{emoji:'🟢',label:'',overTotal:0}
```

**READ** — and those indicators are the real capacity projection, not a count:

```tsx
  const editSlotIndicators = useMemo<Map<string, SlotIndicator>>(() => {
    if (!editCapacityInputs || !editSlots.length) return new Map()
    return buildSlotIndicators(
      editSlots,
      editCapacityInputs.productionSlotUnits || {},
      editServerCatConfigs,
      editCapacityInputs.kitchenCapacity ?? null,
      editCapacityInputs.eventStartMins,
      categoryOrder,
      editCapacityInputs.capacityWindowMins ?? 5,
    )
```

✅ **Edit is strictly better than the row it replaces: the row moved the slot by a fixed +5/+10/+20 with
no view of capacity at the destination; Edit shows the same oven-occupancy traffic light Add Order
uses, and the operator picks the slot.** **READ** — and the edit submits the slot to the same route:

```tsx
action:'edit',order_key:editingOrder.order_key,editedOrder:{…slot:editSlot||null,…}
```

## B4. Removed — no orphan left behind

**MEASURED:**

```
$ grep -c "Adjust time:" components/dashboard/OrderCard.tsx
0
$ grep -n "adjust_slot" components/dashboard/OrderCard.tsx
1239:              button fired `onAction('adjust_slot_+N')`, which is NOT a display action: it writes
1255:              ⚠️ NOTHING ELSE WAS DELETED. `adjust_slot_+N` still exists server-side, and both
```

✅ **Both remaining hits are inside the replacement comment.** The container, the caption, the three
buttons and the trailing `→ new time sent to customer` note went together — **the whole
`{order.status === 'pending' && … && ( … )}` block, plus the 14-line wrap-fix comment that described
only that row.** ⚠️ **The `→` and `…` counts fell (U+2192 23→22, U+2026 8→6), which is the arithmetic
proof the caption and its comment left with it** (F2).

## B5. ✅ `captureOnConfirmation` and `moveSlotBooking` are NOT deleted

**MEASURED** — `captureOnConfirmation` retains **five** call sites:

```
app/api/dashboard/action/route.ts:259    trigger: 'confirm'
app/api/dashboard/action/route.ts:1977   trigger: 'time_adjust'      <- the handler is INTACT
app/api/orders/submit/route.ts:1081      auto-accept
lib/payments/stranded-authorisations.ts:165   the sweep
lib/payments/promote-draft.ts:385        promotion
```

**MEASURED** — `moveSlotBooking` retains its call site:

```
app/api/dashboard/action/route.ts:1961
```

🔴 **ONLY THE BUTTON WAS REMOVED. The server-side `adjust_slot_+N` handler is untouched**, so the
action remains reachable by an **offline outbox replay** of a queued op and by a direct POST — which is
correct: deleting the handler would have broken a replay of something an operator already tapped.

## B6. ⚠️ THE ACCEPTED COST, STATED PLAINLY

**Removing this row makes the deferred path ROUTINE rather than exceptional.**

- **Before:** a pending order's time change captured **immediately**, inline, at the tap.
- **After:** every time change goes through **Edit**, which writes `'modified'` and does **not**
  capture inline. The capture arrives from `find_stranded_authorisations`, **deferred up to ~25
  minutes** — a 10-minute grace plus a 15-minute cron.

🔴 **AND THE SWEEP'S OWN COMMENTS CALL A RECOVERY *"a defect report, not a success story"*.** It was
built to catch a fault. **It is now the ordinary route for one class of capture**, which degrades its
value as an alarm: a hit no longer means something went wrong.

⚠️ **This is a known trade, not an oversight, and it is recorded in the code as well as here** so the
next person reading `OrderCard.tsx` finds it without needing this report. **The money is not at risk —
`'modified'` is in the allow-list (B2) — but the alarm is quieter.**

---

# PART C — THE RECENTLY-CLOSED BANNER'S "Extend 30 min"

## C1. What it is, and where — READ

```tsx
      {/* ── Recently closed banner ── */}
      {recentlyClosed && activeEvent && (
        <div className="mx-3 mt-2 mb-1 bg-slate-100 border border-slate-200 rounded-xl p-3 flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-slate-600">Event finished · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
          <button onClick={() => extendEvent(activeEvent.id, 30)} className="text-sm font-medium text-teal-600 hover:text-teal-700 ml-3 flex-shrink-0">Extend 30 min</button>
```

**It is a plain text button inside the banner**, right-aligned by `justify-between`, teal, `text-sm`,
with **no border and no background** — so it reads as a link rather than a button.

**READ** — the banner's own gate:

```ts
  const recentlyClosed = !!(activeEvent?.status === 'closed' && activeEvent.closed_at && Date.now() - new Date(activeEvent.closed_at).getTime() < 10 * 60 * 1000)
```

## C2. How easy is it to press accidentally?

⚠️ **THE BANNER APPEARS UNPROMPTED. That is the main risk, and it is inherent to the affordance.** It
renders **automatically for ten minutes** after an event closes — including when the event
auto-closed, so it can arrive with nobody touching the screen.

| Factor | Assessment |
|---|---|
| **Appears unprompted** | 🔴 **YES** — ten minutes, `status === 'closed'`, no interaction needed |
| **What sits next to it** | ✅ **Nothing interactive.** Its only sibling is the `<span>` of text at the other end of a `justify-between` row |
| **What is directly below** | ⚠️ **The order grid** — `p-3` cards, the first row of which is the nearest tap target |
| **Tap size** | ⚠️ **`text-sm` with no padding class** — roughly 14px tall, **well under the 44px floor** the KDS applies to its other mid-service controls |
| **Confirmation** | 🔴 **NONE.** One tap writes a new `end_time` |

**INFERRED, and it is the honest reading: an accidental press is unlikely but not negligible.** It has
clear space around it, which is what protects it — but it is **small, unconfirmed, appears without
being asked for, and sits immediately above the busiest region of the screen.** ⚠️ **The realistic
accident is a mis-aimed reach for the first order card**, not a stray swipe.

✅ **And the consequence of an accident is mild and visible:** the event's `end_time` moves 30 minutes
later, the banner disappears (the event is no longer `closed`), and a toast says *"Extended to HH:MM"*.
**Recoverable by finishing the event again.**

## C3. Same `extendEvent`, no payment import — confirmed

**READ** — it is the identical function the removed KDS `+30 min` called:

```ts
  const extendEvent = async (eventId: string, addMins: number) => {
…
      const res = await fetch('/api/events/action', { method: 'POST', … body: JSON.stringify({ token, action: 'update', eventId, payload: { end_time: newEnd } }) })
```

**MEASURED:**

```
$ grep -c "payments\|releaseHold\|refund\|capture" app/api/events/action/route.ts
0
```

✅ **`/api/events/action` imports nothing from `lib/payments/` and contains no capture, refund or
release.** It writes `truck_events.end_time` and nothing else.

## C4. ✅ NOT REMOVED

**It is untouched.** Position and accident-risk are reported above for your decision. ⚠️ **If it were
ever to move, the natural home is the ⋯ menu beside "Change event"** — but that is a decision, not a
defect, and it was not made here.

---

# PART D — SYNC

## D1. ✅ SKIPPED — nothing native changed

**MEASURED** — `git status --porcelain ios/ android/ capacitor.config.ts` returns **nothing**.

⚠️ **`lib/native/statusBar.ts` is TypeScript in the web bundle, not native config.** §11 records that
`lib/native/*` compiles into the web bundle despite its name; the plugin it calls is already installed
and its version is unchanged. ✅ **`npx cap sync` was NOT run.** D2 and D3 do not apply.

---

# PART E — BOUNDARIES

## E1. `git diff --stat`

**THIS TASK'S FILES:**

```
 lib/native/statusBar.ts            | 27 +-      <- ALL this task (not in any earlier diff)
 components/dashboard/OrderCard.tsx | 49 +-      <- ALL this task (not in any earlier diff)
 app/dashboard/[token]/kds/page.tsx | 94 ++--    <- SHARED with last turn, see F6
```

✅ **Boundary greps — every one zero except a comment:**

```
  supabase/migrations    0
  canAccess              0
  package.json           0
  lib/payments/          1   <- LAST TURN's comment line in kds/page.tsx ("imports nothing from lib/payments/ at all")
```

**MEASURED** — that hit is `+                lib/payments/ at all. The same control remains on the
dashboard's event menu.`, an added **comment** line from the previous task. ✅ **No file under
`lib/payments/` is in the diff at all**, and no migration or gate changed.

## E2. What a Pizzeria Gusto operator sees — and what changes about their money

**On the KDS the clock, signal and Wi-Fi indicators become readable again** — they were light glyphs on
the white header and only the battery survived; the header stays white and the glyphs go dark, and
moving between the KDS and the dashboard now flips them each way because every page re-asserts its own
style on mount. **On the dashboard, the +5m/+10m/+20m row is gone from pending order cards**, so
changing a collection time is done through **Edit**, which is strictly more informative — it shows the
same capacity traffic light Add Order uses instead of moving the slot blind. 🔴 **What changes about
their money is the TIMING, not the amount:** the removed row captured the held card **immediately** at
the tap, whereas Edit's capture is collected by the stranded-authorisation sweep **up to about 25
minutes later**. ✅ **Nothing is lost — `'modified'` is in that sweep's allow-list, verified in B2 —
but a card that used to be charged the instant an operator nudged a time is now charged within the
half-hour.** ⚠️ **And the sweep it relies on was built as an alarm; this makes routine traffic out of
it.**

---

# PART F — INTEGRITY

## F1. Non-ASCII census BEFORE

```
lib/native/statusBar.ts               7 classes    4,825 bytes   U+2014:13 U+2192:3 U+2022:3 U+26A0:1 U+FE0F:1 U+1F6AB:1 U+2713:1
app/dashboard/[token]/kds/page.tsx   32 classes  108,635 bytes   U+2500:1100 U+2014:135 U+1F534:38 …
components/dashboard/OrderCard.tsx   31 classes   87,613 bytes   U+2500:1286 U+2014:146 U+1F534:45 U+26A0:42 U+FE0F:40 …
```

## F2. Census AFTER — every difference explained

| File | Classes | Gained | Lost |
|---|---|---|---|
| `lib/native/statusBar.ts` | **7 → 7** | **none** | **none** |
| `app/dashboard/[token]/kds/page.tsx` | **32 → 32** | **none** | **none** |
| `components/dashboard/OrderCard.tsx` | **31 → 31** | **none** | **none** |

**`statusBar.ts` — no count moved at all.** The new doc comments used only em dashes and plain ASCII;
**the file's single `⚠️` is pre-existing and untouched.**

**`OrderCard.tsx` — four counts FELL and one rose, and the falls are the proof of the removal:**

```
  U+2192 RIGHTWARDS ARROW    23 -> 22   the caption "→ new time sent to customer" went with the row
  U+2026 HORIZONTAL ELLIPSIS  8 ->  6   the wrap-fix comment quoted the clipped text "new time ser… to custome…"
  U+2500 BOX DRAWINGS      1286 -> 1272 the removed comment's rule, minus the replacement's
  U+2014 EM DASH            146 -> 145  net of removed and added prose
  U+26A0 WARNING SIGN        42 ->  44  two new notes; U+FE0F tracks exactly (40 -> 42)
```

**`kds/page.tsx` — the counts that moved are the PREVIOUS turn's** (the event picker and the `+30 min`
removal); **this task added four comment lines using only glyphs already present.**

✅ **No new class in any file**, and the `📅`/`🟢`-class emoji that would have introduced one were
avoided.

## F3. 🔴 Carrier-aware variation-selector check

| File | U+26A0 n / paired / **bare** | Other bases | bare vs HEAD |
|---|---|---|---|
| `lib/native/statusBar.ts` | **1 / 1 / 0** | none present | **0 → 0** ✅ |
| `app/dashboard/[token]/kds/page.tsx` | **21 / 20 / 1** | U+2705 2, U+1F534 38, U+2500 1100 | **1 → 1** ✅ |
| `components/dashboard/OrderCard.tsx` | **44 / 42 / 2** | U+2705 2, U+1F534 45, U+2500 1272 | **2 → 2** ✅ |

✅ **Every warning sign added by this task is paired, and no file's bare count moved.** ⚠️ The two
non-balancing sums (`20` vs `21`, `42` vs `42`) are pre-existing selectors on bases outside the four
checked, which is why the **delta against each file's own history** is the measure rather than the
ratio.

## F4. Byte scan

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  lib/native/statusBar.ts                  6,442 bytes   offending=0   CR=0
  app/dashboard/[token]/kds/page.tsx     109,046 bytes   offending=0   CR=0
  components/dashboard/OrderCard.tsx      87,216 bytes   offending=0   CR=0
```

## F5. Byte scan of this report

Separate pass, run after writing: **28,837 bytes, offending = 0** — no NUL, no control byte below
0x09, no CRLF, no lone CR. Its own carrier-aware check:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 32 | 0 | 32 |
| U+1F534 LARGE RED CIRCLE | 20 | 0 | 20 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 4 | 0 | 4 |
| U+26A0 WARNING SIGN | 27 | 27 | **0** |

**Every warning sign is paired; ZERO are bare.** **Sum of per-base paired = the total U+FE0F count** - no orphan, no double-count.

## F6. `git status` and `git diff --stat`

```
M app/dashboard/[token]/kds/page.tsx
 M components/dashboard/OrderCard.tsx
 M docs/reference-manual.md
 M lib/native/statusBar.ts
?? docs/kds-fixes-report.md
```

```
app/dashboard/[token]/kds/page.tsx |  94 ++++--
 components/dashboard/OrderCard.tsx |  49 ++-
 docs/reference-manual.md           | 599 ++++++++++++++++++++++++++++++++++++-
 lib/native/statusBar.ts            |  27 +-
 4 files changed, 702 insertions(+), 67 deletions(-)
```

🔴 **THIS TASK'S ENTRIES ARE FOUR:** `lib/native/statusBar.ts` and `components/dashboard/OrderCard.tsx`
(**wholly this task — neither appears in any earlier diff**), the `configureStatusBar('dark')` change
plus its comment inside `app/dashboard/[token]/kds/page.tsx`, and `docs/kds-fixes-report.md`
(overwritten).

⚠️ **`kds/page.tsx` is SHARED with the previous turn.** **MEASURED** — of its added lines, **4 belong
to this task** (the `'dark'` call and its rationale) and **10 to the previous one** (the event picker,
the strip removal and the `+30 min` removal). ⚠️ **`docs/reference-manual.md` is the V11.21 update from
two turns ago and is not this task's.**

---

# PART G — WHAT YOU MUST TEST

**1. The status bar on the KDS.** Open the KDS on the iPad.
- **PASS:** the clock, Wi-Fi and signal indicators are **dark and readable** against the white header,
  and the battery still reads correctly.
- **FAILURE:** still light-on-white, or now dark-on-dark somewhere.

**2. The status bar on the dashboard.** Go to the dashboard.
- **PASS:** indicators are **light** against the navy header — **unchanged from today**.
- **FAILURE:** dark glyphs on navy. That would mean the default flipped, and the dashboard's call site
  should be byte-identical.

**3. Moving between them.** KDS → dashboard → KDS, twice.
- **PASS:** the glyphs flip each way, every time, with no stuck state.
- **FAILURE:** the style stays with whichever screen was opened first. ⚠️ **Also try a cold launch
  straight into the KDS** (leave the app on the KDS, force-quit, reopen): a brief flash of light glyphs
  is expected and acceptable; staying light is not.

**4. Adjusting a time via Edit, and confirming the capture arrives.** 🔴 **The money test.**
Take a **pending card order**, open **Edit**, change the collection time, save.
- **PASS:** the slot moves, the customer is emailed the new time, the order reads `modified`, and
  **within about 25 minutes the capture appears** — check `order_payments` for a `stripe_pi:` row, or
  the order's payment status.
- **FAILURE:** no capture after 30 minutes. 🔴 **Then check `action_audit_log` for a `capture_missing`
  row** — the sweep records before it repairs.
- ⚠️ **Also confirm the ticket printed** and that the order still raises its due alert; those are two
  of the four `'modified'` paths B2 verified.

**5. No orphaned markup where the row was.** Look at a **pending** order card in solo, window and cook
views.
- **PASS:** the notes block runs straight into the action buttons with no empty gap, no stray "Adjust
  time:" label and no lone divider.
- **FAILURE:** a gap where the row was, or a caption with no buttons.

**6. Regression sweep.** Confirm an order, cancel one, take a payment.
- **PASS:** unchanged. **Nothing under `lib/payments/` is in this diff**, and the `adjust_slot` handler
  is intact server-side.
- **FAILURE:** any difference. 🔴 **Stop — nothing here should be able to reach those paths.**
