# KDS HEADER — ONE CHANGE STOPPED, ONE BUILT, THREE REPORTED

**File changed:** `app/dashboard/[token]/kds/page.tsx` — **the only source file written**, and only for
Change 4.
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `diff` and `show` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any schema change.
✅ **The dashboard, every shared component and everything under `app/api` are untouched** —
`git diff --stat` across `app/dashboard/[token]/page.tsx`, `components` and `app/api` is **empty**.

⚠️ **ONE STALE SPAN, FLAGGED, NOT STOPPED ON.** The brief lists the pre-existing tree as
`M docs/reference-manual.md` and `?? docs/kds-event-isolation-report.md`. It also holds
`M app/dashboard/[token]/kds/page.tsx` and `?? docs/kds-event-isolation-fix-report.md` from the event-
isolation task completed immediately before this one. **All four were left alone**; this task's edit
adds to the existing modification of the KDS page. Likewise "Touch only `app/dashboard/[token]/kds/page.tsx`"
against "write your full report to `docs/kds-header-tidy-report.md`" is the same pairing you resolved
explicitly last turn — source files only, plus the report — so it is noted rather than stopped on.
**No other span arrived garbled.**

---

# 🔴 CHANGE 1 — STOPPED. NOT REMOVED. THE HEADER BUTTON IS REACHABLE IN A STATE THE MENU ITEM IS NOT.

**This is the stop condition the brief specified, and it is met on the face of the gates.**

## The Event actions item and its gate, quoted

```tsx
          {event.status === 'open' && (paused
            ? (onResume && (
              <button onClick={onResume}
                className="w-full bg-red-600 text-white font-bold py-2.5 rounded-xl hover:bg-red-700 text-sm">▶ Resume orders</button>
            ))
            : (onPause && (
              <button onClick={onPause}
                className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">⏸ Pause orders</button>
            ))
          )}
```

✅ **Confirmed: `Pause orders` exists inside Event actions and is gated on `status === 'open'`**, as
the previous work established. The KDS passes both handlers, so both directions are wired:

```tsx
          paused={isPaused}
          onPause={() => { setShowEventMenu(false); togglePause() }}
          onResume={() => { setShowEventMenu(false); togglePause() }}
```

## 🔴 BUT THE MENU ITSELF CARRIES A SECOND GATE THE HEADER BUTTON DOES NOT — AND IT IS `!isDemo`

**The modal mount:**

```tsx
      {showEventMenu && activeEvent && !isDemo && (
        <EventActionsModal
```

**And the only control that opens it, gated the same way — the file says so in its own comment:**

```tsx
              ⚠️ THIS IS THE ONLY OPENER OF THE SHARED MENU ON THIS SURFACE, which is why the gate above
              mattered so much: with it, Start Event, Change event, Finish and Cancel were all
              unreachable on any event that was not already running. */}
          {!isDemo && (
            <button onClick={() => { setEventNoteInput(activeEvent.customer_note || ''); setShowEventMenu(true) }}
```

**The header button's gate:**

```tsx
        {activeEvent?.status === 'open' && (!isDemo || isPaused) && (
          <button
            onClick={togglePause}
```

## THE GAP, STATED AS A TABLE

| State | Header button | Event actions item |
|---|---|---|
| Live event, not demo, not paused | ✅ `Pause orders` | ✅ `⏸ Pause orders` |
| Live event, not demo, paused | ✅ `Paused — tap to resume` | ✅ `▶ Resume orders` |
| 🔴 **Live event, DEMO, paused** | 🔴 **`Paused — tap to resume` — RENDERS** | 🔴 **UNREACHABLE.** The menu does not mount and nothing opens it |
| Live event, demo, not paused | — hidden, deliberately | — unreachable |

# 🔴 REMOVING THE HEADER BUTTON WOULD DELETE THE ONLY RESUME CONTROL A PAUSED DEMO HAS. THAT IS A CAPABILITY, NOT A DUPLICATE.

**And the file already says this is why the gate is shaped that way:**

```tsx
        {/* Pause — both views.
            DEMO: the PAUSE direction is hidden, the RESUME direction is NOT. This is one toggle button, so
            `!isDemo || isPaused` keeps the recovery path open: offline auto-pause (heartbeat-monitor) can
            still pause a demo event without anyone touching this, and hiding the button outright would
            strand the demo paused with no way back — the exact failure we're avoiding, just caused by us. */}
```

⚠️ **ONE HONEST QUALIFICATION, BECAUSE IT WEAKENS THE CASE AND YOU SHOULD HAVE IT.** That comment's
stated route into the state — the offline auto-pause — **no longer reaches `isPaused` on this surface.**
The event-pause fix earlier this session pointed `pausedUntil` at `data.vanPausedUntil`
(`truck_events.paused_until`, the MANUAL pause) and **deliberately excluded `vanOnlinePausedUntil`**,
which is the column `heartbeat-monitor` writes. So `isPaused` is now true only for a manual pause, and
a manual pause on a demo event cannot be set from either surface today — both pause controls are demo-
gated.

🔴 **I AM STILL STOPPING, AND HERE IS WHY THE QUALIFICATION DOES NOT DISSOLVE THE STOP:**

1. **The stop condition as you wrote it is structural** — *"reachable in any state the menu item is
   NOT"* — and the branch `isDemo && isPaused` renders the header button while the menu cannot mount.
   That is true of the code as it stands, regardless of how the state is entered.
2. **Whether a demo event's `truck_events.paused_until` is in the future is a database question**, and
   SQL is forbidden here. A row set before the token became a demo identifier, or by any path I have
   not enumerated, satisfies it.
3. **The branch is a deliberate recovery path with a comment explaining it.** Deleting it because its
   documented trigger has moved is exactly the "a qualifier stopped being true" failure the manual
   records at M10 — except run in reverse, and with the safety net removed rather than a hazard added.

**What I did NOT touch, as instructed:** `togglePause`, `applyPending`/`markPending`, the
`vanPausedUntil` read, and the pause banner. **All unmodified.**

**To proceed you would need to say which:** remove the header button *and* accept that a paused demo
has no resume; or remove it *and* ungate the Event actions menu for demo; or leave it. **I have not
chosen.**

---

# CHANGE 2 — `Screen on` — UNCHANGED, AS INSTRUCTED

```tsx
        <button
          onClick={toggleKeepScreenOn}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${screenHeld ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'}`}
          title={screenHeld ? 'Screen will stay on' : 'Tap to keep the screen on'}
        >
          <span>{screenHeld ? '☀️' : '🌙'}</span>
          <span className="hidden sm:inline">{screenHeld ? 'Screen on' : 'Screen off'}</span>
        </button>
```

**Not one byte moved.** ⚠️ Its label is `hidden sm:inline`, so below 640px it is the emoji alone —
listed again in Change 5.

---

# CHANGE 3 — `No extra wait` STAYS ON THE HEADER. IT WAS NOT MOVED.

```tsx
          <select
            value={extraWaitMins}
            onChange={e => handleSetWait(parseInt(e.target.value))}
            className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700"
          >
            <option value="0">No extra wait</option>
```

**Unmodified.**

## 🔴 WOULD REMOVING CHANGE 1 ALONE RETURN THE HEADER TO ONE ROW? NO — AND THE STRONGEST ARGUMENT NEEDS NO WIDTH MODEL AT ALL.

**Both controls are almost exactly the same width, and `Screen on` is the next item in source order.**

```
  Pause + its gap  = 110px
  Screen on + gap  = 105px
  Observed: Pause did NOT fit on row 1 -> free space S < 110px
  Remove Pause: Screen on fits iff S >= 105px
  So one row requires S in [105, 110) — a 5px window.
```

🔴 **Flex wrapping places items onto a line until one does not fit. `Pause orders` did not fit, so the
free space at that point was under 110px. Delete it and `Screen on` — needing 105px — simply takes its
place on line 2 unless the free space happens to land in a 5px window.** The header would still be two
rows, with one chip on the second line instead of two. **This argument uses only the observed wrap and
the two controls' near-identical widths; it does not depend on any estimate below.**

⚠️ **The `basis-0` spacer does not change this.** Its own comment records why it was given a zero
basis: it takes only leftover slack, so it contributes nothing to the line-breaking calculation.

## The width model, for the other viewports — 🔴 AN ESTIMATE, NOT A MEASUREMENT

**Nothing was rendered.** These are computed from the classes as written, at 0.515em average advance
for mixed-case text and 1.15em for emoji. **The dominant uncertainty is the truck+van name**, which is
data-dependent, so it is run at both extremes.

| Control | width (px) | note |
|---|---|---|
| Dashboard link | 86 | `←` + label |
| **truck/van name** | **57–197** | 🔴 **data-dependent — the single biggest variable** |
| List / Grid / Full / Cook | **228** | 🔴 **the largest fixed block on the row** |
| sound | 40 | |
| Ready step | 98 | |
| **Payment/Collected** | **149** | the longest label |
| device 📱 | 40 | native only |
| spacer | 0 | `basis-0` |
| No extra wait | 118 | |
| pause | 98 | *(161 when it reads "Paused — tap to resume")* |
| Screen on | 93 | |

| Viewport | available | with Pause | without Pause |
|---|---|---|---|
| **iPad 9.7/10.2 portrait (768)** | 736 | 🔴 WRAPS | 🔴 **STILL WRAPS** |
| **768** | 736 | 🔴 WRAPS | 🔴 **STILL WRAPS** |
| iPad Air portrait (820) | 788 | 🔴 WRAPS | 🔴 **STILL WRAPS** |
| iPad Pro 11" portrait (834) | 802 | 🔴 WRAPS | 🔴 **STILL WRAPS** |
| **1024** | 992 | 🔴 WRAPS | 🔴 **STILL WRAPS** |
| **1366** | 1334 | ✅ ONE ROW | ✅ ONE ROW — **it already fits WITH the button** |

**Row total: 1,268px with Pause / 1,158px without, at the typical name; 1,128 / 1,018 at a short one.**
Removing the button frees **110px** against a deficit of **~380px at iPad portrait** and **~170px at
1024**. ⚠️ **At 1366 the button was never the problem** — that row fits either way.

## What WOULD return it to one row — stated, not recommended, and `No extra wait` is not among them

Ranked by width recovered, and none of them touches `No extra wait`:

1. **The List/Grid/Full/Cook group — 228px, the largest fixed block.** Two independent two-way
   controls sharing one pill. Collapsing either pair to icons, or moving the display pair behind a
   control, recovers 100–228px.
2. **The truck/van name — up to 197px.** It is the only item at 16px on a row of 12px chips, and it is
   `flex-shrink-0`, so it never gives ground. Truncating it, or dropping the van suffix, recovers most
   of it at no functional cost.
3. **`Payment/Collected` — 149px**, the longest label on the row.
4. **Moving the `sm:` breakpoint up**, so the labels collapse at tablet rather than phone width —
   ⚠️ **but that trades a wrap for the bare-icon problem in Change 5, on the two switches where it
   matters most.**

🔴 **Nothing short of one of the first three closes a ~380px deficit.** **REPORTED, NOT BUILT.**

---

# CHANGE 4 — BUILT. THE DEVICE BUTTON'S NAME, AND THE PANEL'S HEADING.

## The panel's heading BEFORE this change, quoted

**The sheet had NO heading of its own** — its top row was the close button alone:

```tsx
            <div className="flex justify-end mb-1">
              <button onClick={() => setDeviceOpen(false)} aria-label="Close"
                className="text-white/80 hover:text-white text-3xl leading-none">×</button>
            </div>
```

**The card inside it carries one, in a shared component:**

```tsx
        <h3 className="text-sm font-bold text-slate-900">This device</h3>
```

## 🔴 WHAT THE PANEL ACTUALLY CONTAINS — so "Device settings" can be judged, not assumed

`ThisDeviceSettings`, read in full from `components/native/OperatorDeviceConfig.tsx`:

| Item | Shown when | What it is |
|---|---|---|
| "You're viewing: **Truck** — **Van**" + device ID | always | read-out, not a control |
| **Truck** select | the user is a member of >1 truck | re-binds THIS device to another truck |
| **Van** select | the truck has >1 active van | re-binds THIS device to another van |
| **Default screen** — Dashboard / KDS | always | which screen this device opens on |
| **Order notifications** checkbox | always | `notify_enabled` on this device's `van_devices` row |
| **Require fingerprint or face unlock to open** | always | per-device app lock, plus its backup-PIN setup |

✅ **"Device settings" IS ACCURATE.** Every item is per-device configuration — the component's own
copy says *"This device only — other devices are set separately"* — and nothing in it is truck-wide or
account-wide. ⚠️ **The Truck and Van selects are the only ones that could read as broader**, and they
are not: each re-scopes *this device's* binding, leaving other devices untouched. **Not assumed —
enumerated from the source above.**

## What was changed

```tsx
          <button
            onClick={() => setDeviceOpen(true)}
            aria-label="Device settings"
            title="Device settings"
            className="text-sm px-3 py-1.5 rounded-lg font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
          >
            <span aria-hidden>📱</span>
          </button>
```

```tsx
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-white font-bold text-base">Device settings</h2>
              <button onClick={() => setDeviceOpen(false)} aria-label="Close"
                className="text-white/80 hover:text-white text-3xl leading-none">×</button>
            </div>
```

🔴 **NO VISIBLE LABEL WAS ADDED TO THE BUTTON**, as instructed. Its width is unchanged: the emoji moved
into a `<span aria-hidden>`, which is the file's own idiom (the Dashboard link's `←` is written the
same way) and adds no box of its own.

⚠️ **`title` CHANGED FROM "This device" TO "Device settings"** — a control and the thing it opens
disagreeing about their own name is worse than either wording, and the sheet is where the words now
live. **Say if you want "This device" kept on the button instead.**

🔴 **THE HEADING IS ON THE SHEET, NOT IN THE CARD, AND THAT WAS FORCED.** `ThisDeviceSettings` is a
**shared** component — `components/dashboard/UserMenu.tsx` mounts it too — so editing its `<h3>This
device</h3>` would change the dashboard, which this task forbids. ⚠️ **CONSEQUENCE, STATED RATHER THAN
DISCOVERED LATER: the sheet now reads "Device settings" and the card immediately below it still reads
"This device".** Not a contradiction — the inner one labels the viewing/ID block — but they are two
headings where one would do. **Reported, not resolved; resolving it is a shared-component change.**

---

# CHANGE 5 — HEADER WORDING INVENTORY. REPORT ONLY; NOTHING FIXED.

**Every control on the header, in source order.** Nothing here was changed except row 8's attributes.

| # | Control | Label at ≥640px (`sm:`) | Below 640px | Accessible name |
|---|---|---|---|---|
| 1 | Dashboard link | `← Dashboard` | 🔴 **`←` ALONE** | 🔴 **none — no `title`, no `aria-label`; the glyph is `aria-hidden`** |
| 2 | Truck / van name | `● {truck} — {van}` | same — never collapses | text |
| 3 | List | `List` | same | text |
| 4 | Grid | `Grid` | same | text |
| 5 | Full | `Full` | same | text (+ `title`) |
| 6 | Cook | `Cook` | same | text (+ `title`) |
| 7 | Sound | 🔴 **`🔔` / `🔕` — NO LABEL AT ANY WIDTH** | same | `title` only |
| 8 | Device | 🔴 **`📱` — NO LABEL AT ANY WIDTH** | same | ✅ **`aria-label` + `title` — FIXED BY CHANGE 4** |
| 9 | Extra wait | `No extra wait` / `+10 min` … | same — never collapses | text |
| 10 | Pause | `Pause orders` / `Paused — tap to resume` | same — never collapses | text |
| 11 | Screen on/off | `☀️ Screen on` / `🌙 Screen off` | 🔴 **EMOJI ALONE** | `title` only |
| — | Ready step | `✓ Ready step` | 🔴 **`✓` ALONE** | `title` only |
| — | Payment/Collected | `💷 Payment/Collected` | 🔴 **`💷` ALONE** | `title` only |

*(Rows 12–13 sit between 6 and 7 in source order; listed last so the two switches read together.)*

## 🔴 FLAGGED — BARE ICON WITH NO VISIBLE LABEL AT PHONE WIDTH

| Control | Severity |
|---|---|
| 🔴 **`Payment/Collected` → `💷`** | 🔴 **THE WORST ONE.** This switch decides whether the payment and collected buttons exist — i.e. **when an order leaves the screen.** A coin emoji does not say that. It is also the switch whose "off" state produces a making screen with a different button set entirely |
| 🔴 **`Ready step` → `✓`** | 🔴 **THE SAME CLASS.** A bare tick for "does this screen mark orders ready" is unreadable, and the two switches collapse to two unrelated glyphs sitting side by side with no indication they are a pair |
| ⚠️ `Screen on` → `☀️`/`🌙` | Recoverable — the colour carries the state (teal vs grey) and a wrong tap is harmless |
| ⚠️ Sound → `🔔`/`🔕` | Bare at **every** width, not just phone. The two glyphs differ by a slash |
| ⚠️ Dashboard → `←` | Bare at phone width **and it has no `title` and no `aria-label`** — the only control on the header with no accessible name at all now that Change 4 has landed |

⚠️ **`title` IS NOT A SUBSTITUTE ON THIS SURFACE.** Every one of these except the Dashboard link has a
`title`, and **`title` never appears on a touch device** — which is the only kind of device this screen
runs on. For assistive tech `title` does supply an accessible name; for a cook looking at an iPad it
supplies nothing.

**REPORTED ONLY. The `sm:` collapse was not touched, in any row.**

---

# VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.** `npx tsc --noEmit` exits 0, and `npx eslint` on the KDS produces
a finding set **byte-identical to HEAD's** (compared by piping `git show HEAD:…` through
`eslint --stdin` and diffing the sorted sets). **This change adds no lint finding.**

| Required claim | Method |
|---|---|
| Pausing is still reachable via Event actions in every state the header button covered | 🔴 **NO — AND THAT IS WHY CHANGE 1 STOPPED.** Verified by **source read** of three gates: the item's `status === 'open'`, the modal's `!isDemo` mount, and the opener's `!isDemo`. **The header button covers `isDemo && isPaused`; the menu does not.** ⚠️ **Not exercised** — no demo event was paused |
| The header fits one row at iPad portrait, 768, 1024 and 1366 | 🔴 **IT DOES NOT, at any of them except 1366 — where it already fits WITH the pause button.** ⚠️ **INFERRED from a width model, not measured** — nothing was rendered. **EXECUTED** in the sense that the arithmetic was run, not observed. The estimate-independent argument (5px window) rests only on the observed wrap |
| `Screen on` and `No extra wait` are unchanged and still on the header | ✅ **EXECUTED** — both blocks are outside every hunk in `git diff`; two hunks total, both in Change 4's region |
| The device button has an accessible label and its panel has a clear heading | ✅ **Source-read.** `aria-label="Device settings"` + `title` on the button, `<h2>Device settings</h2>` on the sheet. ⚠️ **NOT verified with a screen reader and NOT rendered** |
| The dashboard is unchanged | ✅ **EXECUTED** — `git diff --stat app/dashboard/[token]/page.tsx components app/api` is **empty**. `components` is included deliberately: `ThisDeviceSettings` is shared with the dashboard's UserMenu and was **not** edited |

## 🔴 WHAT WAS NOT VERIFIED

- **NOTHING WAS RENDERED AND NOTHING WAS TAPPED.** No `next dev`, no `next build`, no `cap sync`, no
  device. **The whole of Change 3's answer is a model**, and the one hardware fact available — that
  `Pause orders` and `Screen on` wrapped together — is yours, not mine.
- **The width model's per-control numbers are estimates** at an assumed average glyph advance. **They
  are wrong by some margin**; they are used only to show the deficit is several times the button's
  width, a conclusion that survives a large error. **The 5px-window argument does not use them.**
- **The new heading's contrast, position and the sheet's behaviour** are source-read only.

---

# INTEGRITY

## `app/dashboard/[token]/kds/page.tsx` — byte scan and census

**Byte-level tool (Python over `open(…,'rb')`), never grep.**

```
BEFORE   bytes 160,748   chars 155,512   lines 2,339
AFTER    bytes 162,820   chars 157,548   lines 2,360
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 33 distinct classes before, 33 after. NO NEW CLASS, NONE REMOVED.**

| Codepoint | Before | After | Δ |
|---|---|---|---|
| U+2500 ─ | 1964 | 1964 | +0 |
| U+2014 — | 253 | 258 | +5 |
| U+1F534 🔴 | 102 | 105 | +3 |
| U+FE0F | 87 | 90 | +3 |
| U+26A0 ⚠️ | 86 | 89 | +3 |
| U+1F4F1 📱 | 1 | 2 | +1 |
| **every other class** | — | — | **0** |

**Carrier-aware check on the source: `U+26A0` n=89, 89 paired, 0 bare.**
`U+1F534` n=105 bare (emoji presentation by default), `U+1F4F1` n=2 bare, `U+2713`
n=4, `U+2705` n=2 — unchanged in pairing.

## This report — SEPARATE pass, run AFTER writing

```
docs/kds-header-tidy-report.md   bytes 23,913
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE:**

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 🔴 | 46 | 0 | 46 |
| U+2705 ✅ | 18 | 0 | 18 |
| **U+26A0 ⚠️** | **21** | **21** | ✅ **0** |
| U+1F4F1 📱 | 5 | 0 | 5 |
| U+1F4B7 💷 | 4 | 0 | 4 |
| U+1F514 🔔 | 3 | 0 | 3 |
| U+1F515 🔕 | 3 | 0 | 3 |
| U+2600 ☀ | 4 | 3 | 1 |
| U+1F319 🌙 | 4 | 0 | 4 |
| U+23F8 ⏸ | 3 | 0 | 3 |
| U+25B6 ▶ | 3 | 0 | 3 |

**`U+26A0` and `U+2600` are the two bases here that default to TEXT presentation.** ✅ **Every
`U+26A0` is PAIRED — 21 OF 21, ZERO BARE.** ⚠️ **`U+2600` is 3 PAIRED AND 1 BARE, AND THE BARE ONE IS
ACCOUNTED FOR:** the 3 paired occurrences are verbatim quotes of the product's own button copy,
which the source writes paired; the single bare one is the codepoint LABEL in the table row directly
above, where the glyph is being named rather than quoted. **`U+23F8` and `U+25B6` are bare because the source writes them bare** in the
Event actions labels quoted above; pairing them here would misquote it. Every remaining base has emoji
presentation by default. The report's total `U+FE0F` count is 24 = 21 warning signs +
3 sun.

## Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M docs/reference-manual.md
?? docs/kds-event-isolation-fix-report.md
?? docs/kds-event-isolation-report.md
?? docs/kds-header-tidy-report.md
```

| Entry | Pre-existing? |
|---|---|
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **BOTH.** Already modified by the event-isolation task; **this task added Change 4's two hunks to it** |
| 🔴 `?? docs/kds-header-tidy-report.md` | 🔴 **THIS TASK** — this file, the only new entry |
| `M docs/reference-manual.md` | ✅ pre-existing — the V11.24 update. **Left alone** |
| `?? docs/kds-event-isolation-report.md` · `?? docs/kds-event-isolation-fix-report.md` | ✅ pre-existing — the diagnosis and its fix report. **Left alone** |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
