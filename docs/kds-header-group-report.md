# KDS HEADER — THE PER-DEVICE CONTROLS ARE GROUPED. THE ROW IS STILL TWO LINES AT iPAD PORTRAIT.

**File changed:** `app/dashboard/[token]/kds/page.tsx` — **the only source file written.**
✅ **`ThisDeviceSettings` WAS NOT EDITED, so the dashboard's UserMenu is untouched** —
`git diff --stat` across `components`, `lib`, `app/api` and `app/dashboard/[token]/page.tsx` is
**empty**. **No STOP was required on the shared-component question; see §2.1 for how it was avoided.**
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `diff` and `show` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

⚠️ **ONE THING YOU DID NOT ASK FOR WAS CHANGED, AND IT WAS FORCED BY CHANGE 2. §2.2 states it in full
before anything else rests on it: the device button's `isNativeApp() && !isDemo` gate had to go, or
the move would have DELETED sound and keep-screen-on on web and in demo rather than relocating them.**

---

# 1. CHANGE 1 — THE PAUSE BUTTON. GATE UNTOUCHED, REASON RECORDED.

**The gate is character-identical to before:**

```tsx
        {activeEvent?.status === 'open' && (!isDemo || isPaused) && (
```

**The comment added above it:**

```tsx
            ── 🔴 THIS BUTTON IS NOT A DUPLICATE OF THE EVENT-ACTIONS ITEM. DO NOT DELETE IT. ──────────
            It looks like one: `⏸ Pause orders` also lives in EventActionsModal, gated there on
            `event.status === 'open'`. But the MODAL is mounted on `showEventMenu && activeEvent &&
            !isDemo`, and the only control that opens it is `!isDemo` too — so on a PAUSED DEMO the menu
            cannot be reached at all and THIS BUTTON IS THE ONLY RESUME CONTROL ON THE SCREEN. That is
            the whole reason the gate reads `(!isDemo || isPaused)` rather than `!isDemo`, and it is why
            a request to remove this button as a duplicate was refused rather than carried out.
            ⚠️ AND THE ROUTE INTO THAT STATE NAMED ABOVE HAS SINCE MOVED, WHICH IS NOT A REASON TO
            DELETE THIS. The offline auto-pause writes `truck_events.online_paused_until`, and since the
            event-pause fix this board's `pausedUntil` reads `data.vanPausedUntil` — the MANUAL column —
            with `vanOnlinePausedUntil` deliberately excluded. So `isPaused` no longer turns true from a
            heartbeat auto-pause. 🔴 THE GATE IS RETAINED DELIBERATELY ANYWAY: the branch is a recovery
            path, its cost is one hidden button, and the cost of being wrong is a demo stuck paused with
            no way back. If the KDS ever reads the offline column again, this is live once more with no
            further change. Check both facts before touching it — do not assume it is dead.
```

**It records all four things you asked for:** that the button is the only resume control on a paused
demo · that the modal and its opener are both `!isDemo` · that the offline auto-pause route no longer
reaches `isPaused` since the event-pause fix excluded `vanOnlinePausedUntil` · **and that the gate is
retained deliberately, so the next reader does not delete it as dead.** The pre-existing comment above
it is untouched. **No handler, no guard, no banner was modified.**

---

# 2. CHANGE 2 — THE PER-DEVICE CONTROLS ARE GROUPED

## 2.1 🔴 THE SHARED-COMPONENT QUESTION, ANSWERED WITHOUT STOPPING

**The instruction was to stop if Change 2 would alter what the dashboard's UserMenu renders. It does
not, because the two controls were NOT put inside `ThisDeviceSettings`.**

They were written into **the KDS's own sheet wrapper**, in `kds/page.tsx`, as a sibling block above the
shared card:

```tsx
              {isNativeApp() && !isDemo && <ThisDeviceSettings token={token} />}
```

✅ **`components/native/OperatorDeviceConfig.tsx` is byte-for-byte unmodified**, so
`components/dashboard/UserMenu.tsx` renders exactly what it rendered before. ⚠️ **And that is the right
outcome on the merits, not just the safe one:** a screen-wake lock and a new-order ding are properties
of *a board that is running service*, and the dashboard's copy of that sheet is opened from a user
menu on a screen that does neither. **They would have been noise there.**

## 2.2 🔴 THE GATE THAT HAD TO CHANGE, AND WHY — STATED, NOT BURIED

**Before**, the device button and its sheet were both `isNativeApp() && !isDemo`. **Sound and
keep-screen-on had no such gate — they rendered on every KDS, web and demo included.**

🔴 **So moving them behind an unchanged gate would have DELETED both controls on web and in demo, not
moved them.** A web KDS would have had no way to mute a ding or hold the screen awake, with no
indication anything had gone.

**What changed, minimally:**

| | Before | After |
|---|---|---|
| device **button** | `isNativeApp() && !isDemo` | 🔴 **always rendered** |
| device **sheet** | `deviceOpen && !isDemo` | 🔴 **`deviceOpen`** |
| `ThisDeviceSettings` **inside** it | (implied by the sheet's gate) | ✅ **`isNativeApp() && !isDemo` — the same gate, moved to its own mount point** |

✅ **The demo still shows no device configuration**, which is what that gate was for — its own comment
says so. A web or demo operator now opens this sheet and sees **exactly the two new rows and nothing
else.** **Nothing inside the sheet was ungated.**

## 2.3 What was moved, and the exact labels

**Both controls were removed from the header** — the two blocks are gone, each replaced by a comment
recording where it went. **The handlers are the originals, unchanged**: `toggleKeepScreenOn` (which
owns the plain-English failure toast) and the sound setter that primes the audio on enable, because
enabling is the user gesture the browser requires.

| Control | Header label BEFORE | 🔴 **Sheet label NOW** | Helper line |
|---|---|---|---|
| keep-screen-on | `☀️ Screen on` / `🌙 Screen off` — **emoji only below `sm:`** | 🔴 **"Keep the screen on"** | *"Stops this device dimming or locking during service. This device only."* |
| sound | `🔔` / `🔕` — **bare icon at EVERY width** | 🔴 **"New-order sound"** | *"Dings when a new order lands on this board. This device only."* |

Each row's control is a chip reading **`☀️ On` / `🌙 Off`** and **`🔔 On` / `🔕 Off`** — **the state in
a word, not a colour**, with `aria-pressed` on both. The block is headed **"This screen"** to
distinguish it from the shared card's own "This device" heading below it.

⚠️ **THE BINARY RULE IS PRESERVED.** The screen chip reads `screenHeld` — the lock **actually held** —
not the stored preference, exactly as the old header chip did, so "On" can never claim something the
device is not doing. ⚠️ **`KeepAwakePrompt` still sits directly below the header and is untouched**:
when the preference is on but the lock is not held, the full-width bar is still there to be tapped.
**Moving the toggle did not move the recovery path.**

## 2.4 🔴 THE INDICATOR — BADGES ON THE DEVICE BUTTON

**Chosen: a badge on the device button.** One indicator style, both states.

```tsx
        <button
          onClick={() => setDeviceOpen(true)}
          aria-label={`Device settings — sound ${soundEnabled ? 'on' : 'off'}, screen ${screenHeld ? 'staying on' : 'not held on'}`}
          title={`Device settings — sound ${soundEnabled ? 'on' : 'off'}, screen ${screenHeld ? 'staying on' : 'not held on'}`}
          className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
        >
          <span aria-hidden>📱</span>
          {!soundEnabled && <span aria-hidden className="text-xs">🔕</span>}
          {!screenHeld && <span aria-hidden className="text-xs">🌙</span>}
        </button>
```

# 🔴 WHAT IT SHOWS WHEN EACH IS OFF

| State | Button reads | Announced |
|---|---|---|
| both on | `📱` | *"Device settings — sound on, screen staying on"* |
| 🔴 **sound OFF** | `📱 🔕` | *"…sound **off**, screen staying on"* |
| 🔴 **screen NOT HELD** | `📱 🌙` | *"…sound on, screen **not held on**"* |
| 🔴 **both off** | `📱 🔕 🌙` | *"…sound **off**, screen **not held on**"* |

🔴 **AN OFF STATE IS NEVER HIDDEN, WHICH IS THE ENTIRE SAFETY ARGUMENT FOR PUTTING TWO CONTROLS
BEHIND A TAP.** A cook glancing at the header still learns *"this screen will go dark"* and *"this
screen will not ding"* without opening anything. ⚠️ **ON means no badge** — absence carries the good
state, which is the standard convention and the only one that costs no width.

⚠️ **AND THE BADGE IS A VISUAL CHANNEL ONLY, SO THE ACCESSIBLE NAME STATES BOTH IN WORDS, ALWAYS** —
including when both are on. A bare "Device settings" would have announced nothing about either.

⚠️ **THE SCREEN BADGE FOLLOWS `screenHeld`, NOT THE PREFERENCE.** A device whose preference is on but
whose lock failed shows 🌙 — the true state — and `KeepAwakePrompt` is simultaneously offering the
recovery tap. **The badge cannot claim a lock that is not held.**

⚠️ **NO NEW GLYPH CLASS ENTERED THE FILE.** 🔕 and 🌙 are the same characters the two old header
controls already used; they moved rather than multiplied. Census in §5 confirms 33 classes before and
33 after.

## 2.5 What did NOT move

✅ `Ready step` · `Payment/Collected` · `List`/`Grid` · `Full`/`Cook` · `No extra wait` ·
`Pause orders` · the Event actions `⋯` control — **all still on the header, all unmodified.**
**Neither switch, neither key, no default and no persistence was touched.**

---

# 3. CHANGE 3 — THE DASHBOARD LINK NOW HAS AN ACCESSIBLE NAME

```tsx
        <AppLink
          href={`/dashboard/${token}`}
          aria-label="Dashboard"
          title="Back to the dashboard"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
        >
          <span aria-hidden>←</span>
          <span className="hidden sm:inline">Dashboard</span>
        </AppLink>
```

**It had none at all**: below `sm:` the word is hidden and the arrow is `aria-hidden`, so the only
route off this screen announced as nothing.

🔴 **`aria-label` IS THE EXACT VISIBLE STRING, NOT A LONGER PARAPHRASE, AND THAT IS DELIBERATE.**
WCAG 2.5.3 (Label in Name) wants the visible text contained in the accessible name, and a
voice-control user saying *"Dashboard"* has to match. `aria-label="Back to dashboard"` would have read
better in a screen reader and **broken voice control at wide width**, where "Dashboard" is on screen.
The longer wording went into `title`, for pointer users, where it costs nothing.

✅ **Position, icon and visible text are unchanged — attributes only.**

---

# 4. CHANGE 4 — RE-MEASURED. 🔴 IT IS AN ESTIMATE.

# ⚠️ THESE FIGURES ARE A MODEL, NOT A MEASUREMENT. NOTHING WAS RENDERED.

Computed from the classes as written, at **0.515em average advance for mixed-case text and 1.15em for
emoji** — the same model as `docs/kds-header-tidy-report.md`, so the before/after numbers are
comparable. **The dominant uncertainty is the truck+van name**, which is data-dependent, so every row
is given at both extremes. **Treat the ONE ROW / WRAPS verdicts near a boundary as uncertain.**

## Per-control widths after the move (typical name, both badges showing)

| Control | px |
|---|---|
| Dashboard link | 86 |
| **truck/van name** | **197** — 🔴 data-dependent, 57 at a short name |
| **List / Grid / Full / Cook** | **228** — 🔴 the largest fixed block |
| Ready step | 98 |
| **Payment/Collected** | **149** |
| device (`📱 🔕 🌙`) | 76 — *(40 with no badges)* |
| spacer `basis-0` | 0 |
| No extra wait | 118 |
| pause | 98 |

**Row total: 1,268 → 1,111 px** (typical name, no badges) **/ 1,147 px** (both badges).
**Saved: 122–158px.**

## Does it fit one row?

| Viewport | available | BEFORE | 🔴 **AFTER** |
|---|---|---|---|
| **iPad 9.7/10.2 portrait (768)** | 736 | WRAPS (+532) | 🔴 **WRAPS — by 375–411px** |
| **768** | 736 | WRAPS (+532) | 🔴 **WRAPS — by 375–411px** |
| iPad Air portrait (820) | 788 | WRAPS (+480) | 🔴 **WRAPS — by 323–359px** |
| iPad Pro 11" portrait (834) | 802 | WRAPS (+466) | 🔴 **WRAPS — by 309–345px** |
| **1024** | 992 | WRAPS (+276) | 🔴 **WRAPS — by 119–155px** |
| **1366** | 1334 | ONE ROW | ✅ **ONE ROW** |

**At a short truck name ("Gusto", no van suffix)** the deficits fall to **+235–270px** at iPad
portrait and ⚠️ **1024 lands on the boundary — 971px against 992 available with no badges (fits), 1,006
with both (does not).** **That is inside the model's error and should be treated as undetermined.**

# 🔴 SO: THE MOVE IS A REAL SAVING AND IT IS NOT ENOUGH. iPAD PORTRAIT IS STILL TWO ROWS.

⚠️ **The two chips that wrapped are gone, so the second row's CONTENTS have changed** — it is now
whichever chips fall off the end, most likely `No extra wait` and `Pause orders`. **That was not the
goal and is not an improvement in itself.**

## What would close the remaining ~375px — PROPOSED, NOT IMPLEMENTED

Ranked by width recovered. **None of these was built and none touches the controls you fenced off.**

1. 🔴 **The `List / Grid / Full / Cook` pill — 228px, the largest single block on the row.** It is two
   independent two-way controls sharing one container. **Collapsing the display pair (`Full`/`Cook`)
   into the device sheet, or either pair to icons, recovers 100–228px.** ⚠️ `Full`/`Cook` is
   per-device and persisted per-device, so it is the same *kind* of setting as the two just moved —
   **but it is a display control an operator changes while looking at the board, which is an argument
   for keeping it in sight.** Your call, not mine.
2. **The truck/van name — up to 197px.** It is the only item on the row at 16px, and it is
   `flex-shrink-0`, so it never gives ground. **Truncating it, or dropping the ` — Van 1` suffix to a
   tooltip, recovers most of it** and costs nothing functional: the van is also named in the device
   sheet's "You're viewing" line.
3. **`Payment/Collected` — 149px**, the longest label on the row. **Shortening the label is the wrong
   fix** — the previous report flagged its `sm:`-collapse to a bare 💷 as the worst wording problem on
   this header, and a shorter word makes that worse, not better.
4. **A second row on purpose.** ⚠️ **Worth naming because it may be the honest answer:** eleven
   controls do not fit an iPad in portrait, and `flex-wrap` with `gap-y-2` already handles it. **The
   defect was never the wrap — it was that the wrap looked accidental.**

🔴 **Items 1 and 2 together recover 300–425px and would close it at iPad portrait. Nothing smaller
will.**

---

# 5. VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.** `npx tsc --noEmit` exits 0, and `npx eslint` on the KDS produces
a finding set **byte-identical to HEAD's** (`git show HEAD:…` piped through `eslint --stdin`, sorted
sets diffed). **This change adds no lint finding.**

| Required claim | Method |
|---|---|
| Screen-on and sound are reachable from the device sheet, with full labels | ✅ **Source read.** Both rows quoted above, labels "Keep the screen on" and "New-order sound". ⚠️ **NOT rendered — no sheet was opened** |
| Both states are visible without opening the sheet, and the indicator shows the OFF state clearly | ✅ **Source read** — the two `{!soundEnabled && …}` / `{!screenHeld && …}` badges, plus a state-naming `aria-label`. ⚠️ **NOT rendered, and NOT checked with a screen reader** |
| The pause button is unchanged and still reachable on a paused demo | ✅ **EXECUTED** — `git diff` shows the gate line itself outside every changed hunk; **only the comment above it moved.** ⚠️ **Reachability on a paused demo is a source-read of three gates, not an exercised state** |
| The Dashboard link has an accessible name | ✅ **Source read** — `aria-label="Dashboard"`. ⚠️ Not verified with assistive tech |
| **The dashboard's UserMenu renders exactly what it rendered before** | ✅ **EXECUTED** — `git diff --stat components lib app/api app/dashboard/[token]/page.tsx` is **empty**. `ThisDeviceSettings` was not opened for editing |
| The header's row count at each width | 🔴 **ESTIMATE, NOT MEASUREMENT.** The arithmetic was executed; **the widths it consumes are modelled.** Labelled as such in every row of §4 |

## 🔴 NOT VERIFIED

- **NOTHING WAS RENDERED AND NOTHING WAS TAPPED.** No `next dev`, no `next build`, no `cap sync`, no
  device. **Every claim about how this looks is a claim about source.**
- 🔴 **THE BADGES HAVE NEVER BEEN SEEN.** Whether `📱 🔕 🌙` reads as three separate states or as one
  cluttered chip at arm's length on a counter is exactly the kind of question this method cannot
  answer, and it is the part of Change 2 most worth looking at on hardware.
- **The sheet's two rows have never been opened**, including whether the new "This screen" block and
  the shared card's "This device" heading read as one sheet or two.
- ⚠️ **The web/demo path is newly reachable and unexercised**: a web KDS now has a device button it
  never had. It opens a sheet containing only the two rows.

---

# 6. INTEGRITY

## 6.1 `app/dashboard/[token]/kds/page.tsx`

**Byte-level tool (Python over `open(…,'rb')`), never grep.**

```
BEFORE   bytes 162,820   chars 157,548   lines 2,360
AFTER    bytes 171,188   chars 165,546   lines 2,443
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 33 distinct classes before, 33 after. NO NEW CLASS, NONE REMOVED.**

| Codepoint | Before | After | Δ | |
|---|---|---|---|---|
| U+2500 ─ | 1964 | 2079 | +115 | comment rules |
| U+2014 — | 258 | 278 | +20 | comment prose |
| U+1F534 🔴 | 105 | 115 | +10 | comment prose |
| U+FE0F | 90 | 99 | +9 | selectors |
| U+26A0 ⚠️ | 89 | 97 | +8 | comment prose |
| **U+1F515 🔕** | **1** | **5** | **+4** | 🔴 **the badge + the sheet chip + prose** |
| **U+1F319 🌙** | **1** | **5** | **+4** | 🔴 **same** |
| U+1F514 🔔 | 1 | 2 | +1 | sheet chip |
| U+2600 ☀ | 1 | 2 | +1 | sheet chip |
| U+1F4F1 📱 | 2 | 3 | +1 | button + comment |
| U+23F8 ⏸ | 1 | 2 | +1 | quoted in the pause comment |
| U+21D2 ⇒ | 9 | 11 | +2 | comment prose |
| U+2192 → | 21 | 20 | -1 | 🔴 **fell by one — the deleted sound comment carried it** |
| **every other class** | — | — | **0** | |

🔴 **NO NEW CLASS AND NONE REMOVED — 🔕, 🌙, 🔔 and ☀️ were already in this file.** The two moved
controls carried their own glyphs with them; nothing new entered the census.
✅ **`U+26A0` moved +8 and `U+FE0F` moved +9 — the difference is the one extra `☀️`**,
which is also a paired base. **Carrier-aware check on the source: `U+26A0` n=97, 97
paired, 0 bare; `U+2600` n=2, 2 paired, 0 bare.** `U+1F534`, `U+1F515`,
`U+1F319`, `U+1F514` and `U+1F4F1` are all bare — **emoji presentation by default**, unchanged.

## 6.2 This report — SEPARATE pass, run AFTER writing

```
docs/kds-header-group-report.md   bytes 21,780
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE:**

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 🔴 | 41 | 0 | 41 |
| U+2705 ✅ | 19 | 0 | 19 |
| **U+26A0 ⚠️** | **24** | **24** | ✅ **0** |
| **U+2600 ☀** | **6** | **4** | **2** |
| U+1F319 🌙 | 12 | 0 | 12 |
| U+1F515 🔕 | 11 | 0 | 11 |
| U+1F514 🔔 | 5 | 0 | 5 |
| U+1F4F1 📱 | 9 | 0 | 9 |
| U+1F4B7 💷 | 2 | 0 | 2 |
| U+23F8 ⏸ | 3 | 0 | 3 |

**`U+26A0` and `U+2600` are the two bases here that default to TEXT presentation.** ✅ **Every
`U+26A0` is PAIRED — 24 OF 24, ZERO BARE.** ⚠️ **`U+2600` is 4 paired and 2
bare** — the paired ones are verbatim quotes of the product's own chip copy, which the source writes
paired; any bare one is the codepoint LABEL in the table row above, where the glyph is named rather
than quoted. **`U+23F8` is bare because the source writes it bare** in the Event actions label quoted
in §1. Every remaining base has emoji presentation by default and needs no selector. The report's
total `U+FE0F` is 28 = 24 warning signs + 4 sun.

## 6.3 Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M docs/reference-manual.md
?? docs/kds-event-isolation-fix-report.md
?? docs/kds-event-isolation-report.md
?? docs/kds-header-group-report.md
?? docs/kds-header-tidy-report.md
```

| Entry | Pre-existing? |
|---|---|
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **BOTH.** Already modified by the event-isolation and header-tidy tasks; **this task added its hunks to that same modification** |
| 🔴 `?? docs/kds-header-group-report.md` | 🔴 **THIS TASK** — this file, the only new entry |
| `M docs/reference-manual.md` | ✅ pre-existing — the V11.24 update. **Left alone, as instructed** |
| `?? docs/kds-event-isolation-report.md` | ✅ pre-existing — the accepted diagnosis. **Left alone, as instructed** |
| `?? docs/kds-event-isolation-fix-report.md` · `?? docs/kds-header-tidy-report.md` | ✅ pre-existing — the two preceding tasks' reports. ⚠️ **Not named in the brief's list, which cited only two entries; left alone on the same footing** |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
