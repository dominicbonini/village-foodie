# KDS on a phone — one `View` panel, one banner stack, and four smaller fixes

**Files written — FIVE:**

| File | What |
|---|---|
| `app/dashboard/[token]/kds/page.tsx` | the `View` button and panel, the banner stack, extra wait out of the header, 5a, 5b |
| `components/shared/EventActionsModal.tsx` | full event details at the top; the extra-wait note |
| `components/shared/ExtraWaitModal.tsx` | 🔴 **NEW** — the picker that makes `Add extra wait` a button |
| `app/dashboard/[token]/page.tsx` | 🔴 **GUSTO'S LIVE PATH** — the picker wiring and the details passed to the shared modal |
| `docs/kds-view-panel-report.md` | this file |

**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `log` and `diff` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any migration, any schema change.

**No span of the prompt arrived garbled.** ⚠️ **ONE PAIR OF INSTRUCTIONS PULLS IN OPPOSITE DIRECTIONS
AND IS RESOLVED RATHER THAN CHOSEN BLIND — see §2.4.** Stage 2 says *"AT `sm:` AND ABOVE NOTHING
CHANGES. Every header control stays exactly where it is today"*; Stage 4 says *"Move the KDS's
extra-wait control into `EventActionsModal`"*, which removes a header control at **every** width. The
narrower, later, explicitly-scoped instruction wins and the exception is stated in full below. That is
the only place the two briefs meet, so I did not stop.

---

# STAGE 1 — READ ONLY

## Q1 — EVERY KDS HEADER CONTROL

🔴 **`Manage event` IS NOT ON THE HEADER.** It is in the **event bar**, the row below it
(`:2193`). It is listed because the brief names it, with that correction.

| Control | Wide-width visible label | At phone width, BEFORE | Breakpoint classes, BEFORE |
|---|---|---|---|
| Back to dashboard | `← Dashboard` | `←` only | `hidden sm:inline` on the word |
| Truck — van name | `Pizzeria Gusto — Van 1` | same, unabbreviated | **none** |
| List | `List` | same | **none** — the segment had no breakpoint at all |
| Grid | `Grid` | same | **none** |
| Full | `Full` | same | **none** |
| Cook | `Cook` | same | **none** |
| Ready step | `✓ Ready step` | ❌ **not rendered** | wrapper `hidden sm:contents`, label `hidden sm:inline` |
| Payment & handover | `💷 Payment & handover` | ❌ **not rendered** | wrapper `hidden sm:contents`, label `hidden sm:inline` |
| **the steps opener** | ❌ not rendered | 🔴 `This screen · Ready only` | `sm:hidden` |
| Device settings | `📱` + `🔕`/`🌙` badges, **no text at any width** | identical | **none — it rendered at every width** |
| Screen on | `Screen on` / `Screen off` | ❌ not rendered (row inside the sheet) | `hidden sm:block` |
| New-order sound | ❌ not on the header at all | ❌ | inside the device sheet only |
| Extra wait | a `<select>`: `No extra wait` / `+10 min` / `+20 min` / `+30 min` | same | `!isDemo`, **no breakpoint** |
| Pause orders | `Pause orders` / `Paused — tap to resume` | same | `activeEvent?.status === 'open' && (!isDemo \|\| isPaused)`, **no breakpoint** |
| Manage event *(event bar)* | `Manage event ▾` | `▾` | `hidden sm:inline` on the words, `!isDemo` |

🔴 **THAT IS WHY IT WAS THREE ROWS.** At phone width the header still had to fit: `←`, the truck and
van name, **four** display buttons that had no breakpoint at all, the steps opener, the device button,
the extra-wait `<select>` and the pause button.

## Q2 — EVERY BANNER, ITS POSITION BEFORE, AND ITS CONDITION

| # | Banner | Condition | Position BEFORE |
|---|---|---|---|
| a | `OfflineBanner` (outbox conflicts) | its own, native | 🔴 **ABOVE the header**, `:1653` |
| b | `WebOfflineBanner` | its own, web | **ABOVE the header**, `:1655` |
| c | `DemoModeBanner` | `isDemo` | **ABOVE the header**, `:1663` |
| d | `KeepAwakePrompt` | `keepScreenOn && !held` — and it splits three ways: `unsupported`/`insecure` render a **static amber notice**, `off`/`denied` render a **tappable button** | 🔴 **directly under the header** — and then everything else rendered BELOW it, which is why it read as mid-page |
| e | Offline bar | `isOffline` | **below the To-make bar** |
| f | Orders-not-loaded | `eventScopeMismatch` | below (e) |
| g | Paused | `anyPaused`, with `pauseReason` deciding the "(device offline)" suffix and whether Resume shows | below (f) |
| h | Extra wait | `extraWaitMins > 0` | below (g) |
| i | Start Event card | `status === 'confirmed' && !auto_open` | below (h) |
| j | Recently closed | `recentlyClosed && activeEvent` | **BELOW the event bar** |

🔴 **WHICH CAN FIRE TOGETHER: ALL OF d–h.** None of those conditions excludes another —
`eventScopeMismatch` (a scope answer), `anyPaused` (an event column), `isOffline` (reachability),
`keepScreenOn && !held` (a browser lock) and `extraWaitMins > 0` (an event column) are five
independent facts. A paused board on an offline phone at an unreachable wake-lock address with a
buffer set shows **five bars at once**, and did before this change too — just not together.

## Q3 — THE DEVICE SHEET, AND ITS GATE

```tsx
              {isNativeApp() && !isDemo && <ThisDeviceSettings token={token} />}
```

| Block | Renders on web? |
|---|---|
| `Screen & sound` heading | ✅ yes |
| `Keep the screen on` row (`sm:hidden`) | ✅ yes |
| `New-order sound` master | ✅ yes |
| `New order sound` — which-sounds radios | ✅ yes |
| 🔴 `ThisDeviceSettings`: *"You're viewing: truck — van"* → **truck switch** (>1 permitted truck) → **van** (>1) → **default screen** → **notifications** → **app-lock** | ❌ **NO — native only, and not in demo.** The component ALSO self-guards on `isNativeApp` |

✅ **The gate is `isNativeApp() && !isDemo` at the mount point, exactly as quoted. It is unchanged by
this task.**

## Q4 — 🔴 PAUSE: THE HEADER BUTTON IS STILL THE ONLY RESUME CONTROL ON A PAUSED DEMO. IT STAYS.

**The header's gate** (`app/dashboard/[token]/kds/page.tsx:1975`):

```tsx
        {activeEvent?.status === 'open' && (!isDemo || isPaused) && (
```

**The modal's item** (`components/shared/EventActionsModal.tsx`):

```tsx
          {event.status === 'open' && (paused
            ? (onResume && (…▶ Resume orders…))
            : (onPause && (…⏸ Pause orders…)))}
```

**and the modal's mount and its only opener, both `!isDemo`:**

```tsx
      {showEventMenu && activeEvent && !isDemo && (
          {!isDemo && (
            <button onClick={() => { … setShowEventMenu(true) }}
```

# 🔴 CONFIRMED, BY SOURCE READ: ON A PAUSED DEMO THE MENU CANNOT BE OPENED AT ALL, SO THE HEADER BUTTON IS THE ONLY RESUME CONTROL. IT IS NOT IN THE `View` PANEL AND IT DID NOT MOVE TO MANAGE EVENT. IT IS STILL ON THE HEADER, AT EVERY WIDTH, WITH ITS GATE UNCHANGED.

⚠️ **And the file already argues against its own gate**: since the event-pause fix the board reads
`data.vanPausedUntil` (the MANUAL column) with `vanOnlinePausedUntil` excluded, so `isPaused` no
longer turns true from an auto-pause. 🔴 **That is an argument about how the state is REACHED, not
about whether the button is needed once it is, and the file says so at length. Nothing here was
changed on the strength of it.**

## Q5 — EXTRA WAIT: TWO IMPLEMENTATIONS, ONE ROUTE. NOT SHARED.

| | KDS | Dashboard |
|---|---|---|
| Control | a `<select>` on the header | `renderExtraWait(cls)` — a **button** when active, a `<select>` when not |
| Handler | `handleSetWait(mins)` — `useCallback`, `await`s, reads `activeEventIdRef.current`, counts a `queued` response into `pendingSyncCount`, then `fetchAllRef.current()` | inline — `markPending('extraWaitMins'/'extraWaitStartedAt')`, stamps `startedAt`, no await |
| POST | `/api/dashboard/action`, `action: 'set_extra_wait'` | **the same action** |
| Options | 0 / 10 / 20 / 30 | 10 / 20 / 30 (+ a clear button) |

✅ **They share the ROUTE and nothing else.** Two components, two handlers, two optimistic strategies.
🔴 **THAT IS WHY 4a IS "THE KDS GAINS THE ROW", NOT "THE KDS GAINS THE DASHBOARD'S CONTROL"** — the
node is passed per surface through the `extraWaitControl` slot the modal already had.

---

# STAGE 2 — THE `View` PANEL

## 2.1 The header, below `sm:`

```tsx
        <button
          onClick={() => setDeviceOpen(true)}
          title="View — what this screen does, how cards look, and this device's screen and sound"
          className="sm:hidden flex items-center gap-1 …"
        >
          <span className="font-semibold">View</span>
          {!soundEnabled && <span aria-hidden className="text-xs">🔕</span>}
          {!screenHeld && <span aria-hidden className="text-xs">🌙</span>}
        </button>
```

🔴 **THE TWO OFF-STATE BADGES CAME WITH IT.** The device button — which carried them — is now
`hidden sm:flex`, so without this a phone would have lost both signals. Same glyphs, same conditions,
same `aria-hidden`.

⚠️ **AND ONE THING WAS LOST, DELIBERATELY, ON INSTRUCTION.** The old opener read `This screen ·
Ready only` — **the switch state was ON the button**, and a long comment in this file forbade putting
it behind a tap. The brief requires *"ONE button labelled `View`"*, so that state is now one tap away,
in the panel's first section. **This is a real regression against a documented rule and it is
reported, not hidden.** The mitigation is that the two rows are the FIRST thing in the panel.

## 2.2 What changed on the header, and what did not

| Control | Change | At `sm:` and above |
|---|---|---|
| List / Grid / Full / Cook | wrapper `flex …` → `hidden sm:flex …` | ✅ **computes to `display:flex` — identical** |
| Device settings `📱` | `flex …` → `hidden sm:flex …` | ✅ **identical** |
| steps opener | replaced by `View`, both `sm:hidden` | ✅ **neither renders — identical** |
| Ready step / Payment & handover | untouched | ✅ identical |
| Screen on | untouched (`hidden sm:block`) | ✅ identical |
| Pause orders | untouched | ✅ identical |
| Back, truck/van name | untouched | ✅ identical |
| 🔴 **Extra wait `<select>`** | 🔴 **REMOVED AT EVERY WIDTH — the one exception, mandated by Stage 4** | 🔴 **CHANGED. See §2.4** |

## 2.3 The panel's rows, and where each label came from

| Row label | Taken from |
|---|---|
| `Ready step` | 🔴 the header switch's own `hidden sm:inline` label, verbatim |
| `Payment & handover` | 🔴 the header switch's own `hidden sm:inline` label, verbatim |
| `List` `Grid` | the header segment's own button text, verbatim |
| `Full` `Cook` | the header segment's own button text, verbatim |
| `Keep the screen on` | the device sheet's existing row, verbatim |
| `New-order sound` | the device sheet's existing row, verbatim |
| `New order sound` (which sounds) | the dashboard's own heading, already reused here |
| `Sound when an order is due to be cooked` | 🔴 the dashboard's own label, verbatim — §5b |
| *section:* `What this screen does` | the absorbed steps panel's own `<h2>` |
| *section:* `Layout` | the header's own comment — `── LAYOUT SWITCHER` |
| *section:* `Card display` | the header's own comment — `🔴 CARD DISPLAY: Full / Cook` |

✅ **NO SHEET-ONLY NAME WAS INVENTED.** The two section headings are the only strings not lifted from
a visible control, and both come from the header's own comments naming those controls.

**One panel, one state.** The steps panel's state is deleted and the `View` button opens `deviceOpen`
— the same panel the `📱` button opens at `sm:` and above. Everything phone-only inside it is wrapped
in a single `sm:hidden` block, which is what makes the tablet/desktop panel byte-identical in output:

```tsx
              <div className="sm:hidden rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 mb-3">
```

**The native block kept its gate**, unchanged and in place: `{isNativeApp() && !isDemo && <ThisDeviceSettings token={token} />}`.

## 2.4 🔴 THE ONE `sm:`-AND-ABOVE CHANGE, STATED PLAINLY

**The extra-wait `<select>` no longer renders on the KDS header at ANY width.** Stage 4 orders it into
`EventActionsModal`; it cannot both move there and stay on the tablet header. **Reachability is not
reduced at any width** — it is in Manage event on both surfaces now — but a tablet operator who reached
it in one tap now takes two. **That is the cost, and it is the instruction's cost, not a choice made
here.**

## 2.5 The phone header row count — ⚠️ ESTIMATE, NOT A MEASUREMENT

**Nothing was rendered or measured.** What renders below `sm:` is now, in order: `←` · truck — van ·
`View` (+ up to two badges) · a `flex-1 basis-0` spacer · **`Pause orders` when the event is open**.

| Width | Rows | Basis |
|---|---|---|
| 390px (iPhone 14/15), no pause | **1** | ~30 + ~150 + ~64 + gaps ≈ **270px** |
| 390px, event open (pause shown) | **1**, tight | + ~104px ≈ **385px** — ⚠️ **within ~5px of the edge; a long truck+van name will wrap it to 2** |
| 375px (SE/mini), event open | ⚠️ **1 or 2** — truck-name dependent |
| ≥640px | **unchanged from today** |

🔴 **THE ONLY HONEST STATEMENT: three rows became one on a phone with no live event, and one-or-two
with the pause button showing.** The brief's target row — back, truck/van, `View`, Manage event — is
met with the correction that **Manage event is in the event bar, one row down, and always was**, and
with **`Pause orders` still present per Q4**.

---

# STAGE 3 — THE BANNER STACK

One container, directly under `</header>`, above the To-make bar and above the event bar:

```tsx
      </header>
      <div className="flex-shrink-0">
        {eventScopeMismatch && (…)}      {/* orders not loaded */}
        {anyPaused && (…)}               {/* paused */}
        {isOffline && (…)}               {/* offline */}
        <KeepAwakePrompt … />            {/* wake lock */}
        {extraWaitMins > 0 && (…)}       {/* extra wait */}
      </div>
```

✅ **EXECUTED — the line numbers, in file order:** `</header>` 2022 → container 2045 → scope 2056 →
paused 2074 → offline 2081 → `KeepAwakePrompt` 2092 → extra wait 2093 → **To-make bar 2104** → **event
bar 2150**.

| Requirement | Held |
|---|---|
| paused → offline → wake-lock | ✅ 2074 → 2081 → 2092 |
| above the event bar | ✅ every one of them is above 2150 |
| two can coexist | ✅ **they are siblings in one container with independent conditions — nothing is `else`** |
| copy, condition, behaviour unchanged | ✅ **the blocks were MOVED as whole text.** `pauseReason`, the Resume link, the `(device offline)` suffix, the queued-count suffix and `KeepAwakePrompt`'s three arms are the same source |

**Two placements are judgement calls and are stated rather than buried:**

- 🔴 **`eventScopeMismatch` is FIRST, above paused.** It is not one of the three the brief ordered, and
  its own comment already ruled that it outranks pause — *"a paused board still shows the right orders;
  this one shows none"*. **Demoting it would have re-decided something the brief did not raise.**
- ⚠️ **`OfflineBanner`, `WebOfflineBanner` and `DemoModeBanner` were NOT moved into the stack.** They
  are shared components mounted **above** the header on both surfaces, they are already at the top of
  the page rather than mid-page, and moving them would change the app shell rather than this screen's
  banners. **The Start Event card and the Recently-closed card also stayed** — they are event-lifecycle
  cards with their own actions, not status bars, and neither renders mid-board.

---

# STAGE 4 — EXTRA WAIT INTO MANAGE EVENT

## 4a — the KDS gains the row; the control is its own

Per Q5 the two surfaces never shared an implementation, so the KDS passes its own node into the slot
the dashboard already fills, calling **its own unchanged `handleSetWait`**:

```tsx
          extraWaitControl={(isDemo && extraWaitMins <= 0) ? undefined : extraWaitMins > 0 ? (
            <button onClick={() => { setShowEventMenu(false); void handleSetWait(0) }} …>
              ⏱ +{extraWaitMins}m active · Tap to clear
            </button>
          ) : (
            <button onClick={() => { setShowEventMenu(false); setShowExtraWaitPicker(true) }} …>
              ⏱ Add extra wait
            </button>
          )}
```

⚠️ **THE DEMO GATE CHANGED SHAPE, AND ONLY IN AN UNREACHABLE STATE.** The header hid extra wait
outright in demo (`!isDemo`); this uses the dashboard's `(isDemo && waitMinutes <= 0)` shape, so the ADD
direction is still hidden in demo and a clear path exists if a value somehow got set. **The reachable
behaviour — a demo can never ADD extra wait — is identical.**

## 4b — every row in that modal is now a button

**New shared component `components/shared/ExtraWaitModal.tsx`.** It offers **`+10 min`, `+20 min`,
`+30 min`** — the same three values — and **writes nothing**: it hands the number back and each caller
performs the write it always performed.

**Dashboard, before → after:**

```tsx
  const renderExtraWait=(cls:string)=> …
    <select defaultValue="" onChange={e=>{const m=parseInt(e.target.value);if(!m)return;const startedAt=…;fetch(…);markPending(…);setExtraWaitMins(m);…}}>
```
```tsx
  const applyExtraWait=(m:number)=>{const startedAt=new Date().toISOString();fetch(…same body…);markPending('extraWaitMins',m);markPending('extraWaitStartedAt',startedAt);setExtraWaitMins(m);setExtraWaitStartedAt(startedAt)}
  const renderExtraWait=(cls:string,variant:'select'|'button'='select')=> …
    ):variant==='button'?(
    <button onClick={()=>{setShowEventMenu(false);setShowExtraWaitPicker(true)}} …>⏱ Add extra wait</button>
```

🔴 **`variant` DEFAULTS TO `'select'`, SO THE DASHBOARD'S OTHER MOUNT IS UNTOUCHED.** `renderExtraWait`
is called twice: `:3177` (`hidden md:block`, the dashboard's own panel) — **still a `<select>`, not
asked about — and `:4992`, the modal, which passes `'button'`. The write is one function called by
both.

## 4c — the full event at the top of the modal

```tsx
          <div className="min-w-0">
            <h3 className="font-black text-slate-900 truncate">{fmtVenue(event.venue_name, event.town) || event.venue_name}</h3>
            {(event.event_date || event.start_time || event.end_time) && (
              <p className="text-xs font-medium text-slate-500 mt-0.5">
                {event.event_date ? eventDateLabel(event.event_date) : ''}
                {event.event_date && (event.start_time || event.end_time) ? ', ' : ''}
                {formatTimeRange(event.start_time, event.end_time)}
              </p>
            )}
          </div>
```

✅ **NO SECOND FORMATTER WAS WRITTEN.** `fmtVenue` and `eventDateLabel` are imported from
`lib/event-display` — the same two both event bars use — and `formatTimeRange` from `lib/time-utils`,
the same one the KDS's Start Event card uses.

⚠️ **THE TOWN IS INSIDE `fmtVenue`, NOT A THIRD LINE.** That formatter appends `— Town` and suppresses
it when the town is already inside the venue name, so this reads exactly what the bar above it reads.
Writing the town separately would have produced *"The Bell, Castle Hedingham, Castle Hedingham"* on
precisely the trucks the containment test exists for.

⚠️ **THE FOUR NEW FIELDS ARE OPTIONAL** — a caller that passes none renders the venue name alone, with
no empty line and no dangling separator.

## 🔴 THE DASHBOARD'S MODAL — BEFORE AND AFTER

| | Before | After |
|---|---|---|
| Title | `Pizzeria Gusto` (venue only) | `The Bell — Castle Hedingham` + a second line `Today 18th August, 12:00-18:00` |
| × | top-right | 🔴 **same button, same classes, `shrink-0` added so the longer title cannot squash it** |
| Start / Restart Event | first, orange, `confirmed`/`closed` only | ✅ unchanged |
| Change event | filled slate | ✅ unchanged |
| Note for customers + Save note | unchanged | ✅ unchanged |
| Pause / Resume orders | `open` only, `onPause` omitted in demo | ✅ **unchanged — same gate, same callbacks** |
| **Add extra wait** | 🔴 a `<select>` among filled buttons | 🔴 **a filled button that opens the picker. Same 10/20/30, same POST, same `markPending` pair, same `startedAt`** |
| Change event finish time / Finish event / Cancel event | unchanged | ✅ unchanged |
| **Order of items** | — | ✅ **identical. Nothing was inserted, removed or reordered** |

✅ **No item, no gate and no handler changed on the dashboard.** The one behavioural difference is that
choosing a wait now takes two taps in a modal instead of one in a select wheel, and the event menu
closes as the picker opens — **the same hand-off `Pause` and `Change event finish time` already make.**

---

# STAGE 5 — TWO SMALL FIXES

## 5a — the heading follows the breakpoint

```tsx
                <h3 className="text-sm font-bold text-slate-900">
                  <span className="sm:hidden">Screen &amp; sound</span>
                  <span className="hidden sm:inline">Sound</span>
                </h3>
```

🔴 **ONE `<h3>` ELEMENT, ONE MOUNT, NO JS BRANCH AND NO SECOND HEADING.** The words switch with the
same `sm:hidden` / `hidden sm:inline` idiom every collapsing label on this screen already uses — which
is exactly the pair that makes the claim true: the screen row inside the card is `sm:hidden`, so above
`sm:` the card really does hold sound only.

## 5b — the due-to-cook sound, on the KDS

**The dashboard's row, quoted before reuse:**

```tsx
                      <p className="text-sm font-semibold text-slate-800">Sound when an order is due to be cooked</p>
                      <p className="text-slate-500 text-xs mt-0.5">Sounds when a ticket turns amber.</p>
                    <Toggle on={sc.order_due} onToggle={()=>saveSoundConfig({...sc,order_due:!sc.order_due})} disabled={isOffline}/>
```

**The KDS's new row — the dashboard's words, this sheet's shape, the shared key:**

```tsx
                      const next = { ...cur, order_due: !cur.order_due }
                      writeSoundConfig(token, next); setStoredSoundCfg(next); soundConfigRef.current = next
```

✅ **Label and sub-label are the dashboard's, word for word.** ⚠️ **The WIDGET is this sheet's pill
button, not the dashboard's `Toggle`** — every other control in this panel is that pill, and the words
are what must not diverge, not the widget. 🔴 **It writes the SAME shared `hg_soundcfg_` key through
`writeSoundConfig`, exactly as the which-sounds radios beside it do, and updates `soundConfigRef` so the
next amber ticket obeys it without a re-render.** No master key, no default and no read path changed.

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0.** **`npx eslint`, per file: KDS 21 (18 errors, 3 warnings), dashboard 108
(82, 26) — both IDENTICAL to the counts recorded for these files earlier this session — and 0 for both
shared components.**

| Required claim | Method |
|---|---|
| The phone header row count | ⚠️ **ESTIMATE, SOURCE-DERIVED. NOT MEASURED.** Nothing was rendered. §2.5 gives the arithmetic and names the case that may still wrap |
| `sm:` and above byte-identical | ⚠️ **NOT byte-identical, and it cannot be** — §2.4. ✅ **EXECUTED for the rest:** every changed class is `flex` → `hidden sm:flex`, which computes to `display:flex` at `sm:`+, and the two `sm:hidden` openers both stay hidden there. 🔴 **The extra-wait select is the one real change at those widths** |
| Every control reachable on a phone | ✅ **SOURCE READ, control by control:** steps ✅ panel · List/Grid ✅ panel · Full/Cook ✅ panel · screen-on ✅ panel (`sm:hidden` row) · sound master ✅ panel · which-sounds ✅ panel · due-to-cook ✅ panel · device config ✅ panel (native, non-demo) · pause ✅ **header** · extra wait ✅ **Manage event** · Manage event ✅ event bar. 🔴 **NOT VERIFIED ON HARDWARE** |
| Panel labels match the wide-width labels | ✅ **EXECUTED** — the table in §2.3 was built by grepping the rendered label strings out of the file and matching them to their header sources |
| Banners above the event bar, in order, coexisting | ✅ **EXECUTED** — the line-number sequence in §3, produced by a script over the file, plus the source reading that no condition excludes another |
| `Pause orders` still reachable in every state | ✅ **EXECUTED (source)** — the gate string is unchanged in the file and the button is outside every new `sm:` wrapper. Q4 is the argument for why it was not moved |
| Extra wait reachable from Manage event on both surfaces | ✅ **SOURCE READ** — both call sites pass `extraWaitControl`; both open the same shared picker |
| The modal shows venue, town, date and times | ✅ **SOURCE READ** — town via `fmtVenue`, date via `eventDateLabel`, times via `formatTimeRange`. ⚠️ **Not rendered, so the exact rendered string is not confirmed** |
| The dashboard's modal otherwise unchanged | ✅ **EXECUTED** — `git diff` on that file touches the import, the extra-wait function, the `event={{…}}` literal, one prop, one state line, one back-stack line and the picker mount. **No item, order, gate or handler is in the diff** |
| Due-to-cook settable from the KDS | ✅ **SOURCE READ** — the row writes `writeSoundConfig(token, {...cur, order_due: !cur.order_due})`. 🔴 **NOT executed: no browser, so the write was not observed** |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RENDERED, ON ANY DEVICE OR IN ANY BROWSER.** No `next dev`, no `next build`, no phone.
- **The row count is arithmetic, not a measurement**, and the pause-button case is close to the edge.
- 🔴 **THE WAKE-LOCK BANNER'S POSITION IS FIXED; ITS MESSAGE IS NOT AND MUST NOT BE.** On
  `192.168.50.104` it will still say the screen can't be kept on, because plain HTTP is not a secure
  context. **On hatchgrab.com it will not appear at all.** No condition was touched.

---

# INTEGRITY

⚠️ **THE "BEFORE" BASELINE IS `HEAD`, NOT THE PRE-TASK WORKING TREE, AND THAT IS STATED BECAUSE IT
MATTERS.** Both page files were already dirty when this task began (earlier tasks this session), and a
working tree has no history — the pre-task bytes are not recoverable without `checkout`, which is
forbidden. **Every census below is therefore current-vs-HEAD, which is the STRICTER test: it catches a
class introduced by this task AND by any earlier one.**

```
app/dashboard/[token]/kds/page.tsx     HEAD 183,408 → 209,453 bytes · 2,872 lines · 33 classes
   NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
   classes added vs HEAD: NONE   ·  removed: NONE

app/dashboard/[token]/page.tsx         HEAD 389,542 → 390,931 bytes · 5,029 lines · 53 classes
   NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
   classes added vs HEAD: NONE   ·  removed: NONE

components/shared/EventActionsModal.tsx  HEAD 7,492 → 10,494 bytes · 172 lines · 9 classes
   NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
   classes added vs HEAD: NONE   ·  removed: NONE

components/shared/ExtraWaitModal.tsx     NEW · 2,849 bytes · 45 lines · 7 classes
   NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

🔴 **THREE CLASSES WERE INTRODUCED AND THEN REMOVED TO HOLD THE CENSUS**, before this report was
written: `U+2550 ═` (a comment rule in the KDS, rewritten with the `─` the file already carries), and
`U+00B7 ·` and `U+2013 –` in the shared modal (the date/time separator, now a comma, and one comment's
en dash). **A file that gains a character class is the defect this rule exists to catch, and it caught
three.**

**Carrier-aware, on the source files: `U+26A0` is 125/125 paired in the KDS, 9/9 in the shared modal,
2/2 in the new file, and 84 with 2 bare in the dashboard — ⚠️ both bare ones are pre-existing and are
not in this task's diff.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/kds-view-panel-report.md   bytes 31,293
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 46 | 0 | 46 |
| U+26A0 (warning sign — TEXT presentation) | 18 | 18 | 0 |
| U+2705 (check mark button) | 50 | 0 | 50 |
| U+23F1 (stopwatch) | 3 | 0 | 3 |
| U+1F4B7 (banknote) | 1 | 0 | 1 |
| U+1F4F1 (mobile phone) | 3 | 0 | 3 |
| U+1F515 (bell with slash) | 2 | 0 | 2 |
| U+1F319 (crescent moon) | 2 | 0 | 2 |
| U+2713 (check mark — TEXT presentation) | 1 | 0 | 1 |
| U+25BE (triangle — TEXT presentation) | 2 | 0 | 2 |
| U+25B6 (play — TEXT presentation) | 1 | 0 | 1 |
| U+23F8 (pause) | 1 | 0 | 1 |

U+26A0 is the only base here that is TEXT-presentation AND used as an emoji, and every one of its
occurrences is PAIRED with U+FE0F. U+2713, U+25BE, U+25B6 are bare because they are quoted from
source, where they are bare by design (the codebase treats them as glyphs, not emoji). U+1F534,
U+2705, U+23F1, U+1F4B7, U+1F4F1, U+1F515, U+1F319 and U+23F8 have emoji presentation by default,
so bare is correct for them.

## Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/landing/landing.css
 M app/landing/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M components/dashboard/UserMenu.tsx
 M components/shared/EventActionsModal.tsx
 M docs/privacy-manifest-report.md
 M docs/reference-manual.md
 M lib/plan-features.ts
?? components/shared/ExtraWaitModal.tsx
?? docs/add-order-overflow-fix-report.md
?? docs/add-order-overflow-report.md
?? docs/event-actions-rename-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-screen-on-header-report.md
?? docs/kds-view-panel-report.md
?? docs/landing-features-move-report.md
?? docs/offline-protection-kds-fix-report.md
?? docs/offline-protection-kds-report.md
?? docs/plan-feature-order-domain-report.md
?? docs/screen-sound-alignment-report.md
?? docs/screen-sound-fix-report.md
?? docs/splice-verification-report.md
?? lib/native/useHeartbeat.ts
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M app/dashboard/[token]/kds/page.tsx` | ⚠️ already `M` before this task; **THIS TASK wrote to it** |
| 🔴 `M app/dashboard/[token]/page.tsx` | ⚠️ already `M` before this task; **THIS TASK wrote to it** |
| 🔴 `?? components/shared/ExtraWaitModal.tsx` | 🔴 **THIS TASK — new file** |
| 🔴 `M components/shared/EventActionsModal.tsx` | 🔴 **THIS TASK — it was CLEAN at HEAD before this task** |
| 🔴 `?? docs/kds-view-panel-report.md` | 🔴 **THIS TASK** — this file |
| `M app/landing/page.tsx`, `M app/landing/landing.css`, `M lib/plan-features.ts` | ✅ pre-existing — the landing task immediately before this one |
| everything else | ✅ pre-existing — earlier tasks this session and their reports |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
