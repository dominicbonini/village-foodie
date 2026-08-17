# KDS — THE TWO STEP SWITCHES AT PHONE WIDTH

**File changed:** `app/dashboard/[token]/kds/page.tsx` — **the only source file written.**
✅ **The dashboard, every shared component, `lib` and `app/api` are untouched** — `git diff --stat`
across all four is **empty**.
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status` and `diff` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# STAGE 1 — THE INVENTORY, RE-QUOTED FROM SOURCE

🔴 **THE EARLIER REPORT'S TABLE IS ALREADY OUT OF DATE, AND THAT IS WHY YOU ASKED.** Since
`docs/kds-header-tidy-report.md` was written, the header-group task **moved `Sound` and `Screen on`
into the device sheet**, so two of the five rows it flagged no longer exist on the header. This is the
tree as it stands, read fresh.

## The header row, in source order

| # | Control | Full label (≥640px) | 🔴 **Below `sm:` (<640px)** | Accessible name |
|---|---|---|---|---|
| 1 | Dashboard link | `← Dashboard` | `←` alone | ✅ **`aria-label="Dashboard"`** — added last task |
| 2 | Truck / van name | `● {truck} — {van}` | same — never collapses | text |
| 3 | List | `List` | same | text |
| 4 | Grid | `Grid` | same | text |
| 5 | Full | `Full` | same | text + `title` |
| 6 | Cook | `Cook` | same | text + `title` |
| 7 | **Ready step** | `✓ Ready step` | 🔴 **`✓` ALONE** | `title` only |
| 8 | **Payment/Collected** | `💷 Payment/Collected` | 🔴 **`💷` ALONE** | `title` only |
| 9 | Device | `📱` (+ `🔕` / `🌙` badges) | same — never has a word | ✅ `aria-label` + `title`, state in words |
| 10 | Extra wait | `No extra wait` / `+10 min` … | same — never collapses | text |
| 11 | Pause | `Pause orders` / `Paused — tap to resume` | same — never collapses | text |

**READ — the two collapses, quoted:**

```tsx
              <span className="hidden sm:inline text-xs">Ready step</span>
```
```tsx
              <span className="hidden sm:inline text-xs">Payment/Collected</span>
```

## The event bar, one row below — and it has the same defect

| Control | ≥640px | 🔴 Below `sm:` | Accessible name |
|---|---|---|---|
| Event actions | `Event actions ▾` | 🔴 **`▾` ALONE** | 🔴 **NONE — no `title`, no `aria-label`** |
| Event date | `📅 {date}` | hidden entirely (`hidden sm:block`) | — |

```tsx
              <span className="hidden sm:inline">Event actions </span>▾
```

# 🔴 CONTROLS WITH NO ACCESSIBLE NAME AT ANY WIDTH: ONE — `Event actions`, on the event bar.

⚠️ **Rows 7 and 8 DO have an accessible name** (their `title` supplies one) — **their defect is
visual**: `title` never appears on a touch device, which is the only kind of device this screen runs
on. **Row 9 is a bare glyph but is fully named**, fixed last task. **Not fixed here — Stage 2 is
scoped to rows 7 and 8, and Event actions is reported in Stage 3.**

## What the device sheet already contains, so nothing is duplicated

**READ — after the header-group task, "Device settings" holds:**

| Block | Items |
|---|---|
| **"This screen"** (this file's own markup) | **Keep the screen on** · **New-order sound** |
| **`ThisDeviceSettings`** (shared, native-only) | viewing truck/van + device ID · Truck select · Van select · Default screen · Order notifications · app lock + backup PIN |

# ✅ NO OVERLAP. The device sheet holds SCREEN and NOTIFICATION properties of the hardware; the two step switches are properties of the SERVICE this board performs. Nothing in Stage 2 duplicates anything in it.

⚠️ **A DELIBERATE DECISION NOT TO REUSE THAT SHEET, STATED:** the two could have been added as two more
rows there. They were not, because *"what this device is"* and *"what this screen does to tickets"* are
different questions, and the second is the one an operator needs mid-service. **A separate panel also
keeps the device sheet's contents untouched, which the brief requires.**

---

# STAGE 2 — THE GROUPING

## 2.1 🔴 AT AND ABOVE `sm:`, NOTHING CHANGES — AND THE MECHANISM IS THE POINT

```tsx
        <div className="hidden sm:contents">
```

🔴 **`sm:contents`, NOT `sm:flex`.** `display: contents` makes the wrapper produce **no box of its
own**, so at and above the breakpoint the two buttons are still **direct children of the header's flex
row** — same `gap-x-3` to their neighbours, same widths, same wrap behaviour. **A `flex` wrapper would
have replaced two flex items with one and changed the spacing at every width above `sm:`**, which is
precisely what *"at wider widths nothing changes"* forbids.

✅ **THE TWO BUTTONS THEMSELVES ARE UNMODIFIED.** `git diff` on this file contains **no `-` line**
touching `Ready step`, `Payment/Collected`, `setReady(`, `setHandover(`, `hg_kds_readystep_` or
`hg_kds_payments_`. They were wrapped, not rewritten — **so they cannot drift from the panel's copy of
the same handlers.**

## 2.2 🔴 THE STATE IS ON THE BUTTON, NOT BEHIND IT

```tsx
        <button
          onClick={() => setShowStepsPanel(true)}
          title="Which steps this screen does — marking orders ready, and taking payment and handing over"
          className="sm:hidden flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
        >
          <span className="font-semibold">Steps</span>
          <span className="text-slate-400">·</span>
          <span>{readyOn && handoverOn ? 'Ready + payment' : readyOn ? 'Ready only' : handoverOn ? 'Payment only' : 'None'}</span>
        </button>
```

# WHAT IT SHOWS, IN ALL FOUR COMBINATIONS

| `readyOn` | `handoverOn` | 🔴 **The button reads** | What that means |
|---|---|---|---|
| on | on | **`Steps · Ready + payment`** | this screen marks ready AND takes payment; tickets leave here |
| on | off | **`Steps · Ready only`** | a making screen — food is marked up here, another screen hands over |
| off | on | **`Steps · Payment only`** | a hatch screen — another screen marks ready |
| off | off | **`Steps · None`** | ⚠️ **UNREACHABLE** — see below |

⚠️ **THE FOURTH IS UNREACHABLE AND IS WRITTEN ANYWAY.** Each switch is `disabled` while it is the only
step left, so the pair cannot both be off. **A label with no branch for a state is how a future change
to that rule produces a blank button**, so the arm exists and says `None`.

🔴 **WORDS, NOT COLOURED GLYPHS.** Two tinted icons on the opener would have been the same defect one
layer down — a glyph to decode, with colour as the only state channel. **The answer is on the button in
plain text; the panel behind it is only for CHANGING them.**

⚠️ **NO `aria-label` ON THE OPENER, DELIBERATELY.** It has real visible text, so it already has an
accessible name, and an `aria-label` would have to repeat that text verbatim to satisfy Label in Name.
The longer sentence went into `title`, for pointer users.

## 2.3 The panel — 🔴 COPY PROPOSED FOR YOUR EDIT

**Heading: "What this screen does"** — chosen over "Order steps" because *steps* is our word, not
theirs.

| | Label | Sentence |
|---|---|---|
| **1** | **Mark orders ready** | *"This screen gets a Ready button. Tap it when the food is up and the customer is told their order is ready to collect."* |
| **2** | **Take payment and hand over** | *"This screen gets the payment and Collected buttons. Orders leave this screen when they're collected. Turn it off and another screen hands the food over."* |
| — | *(when a switch is the last one on)* | *"This is the only thing this screen does, so it can't be turned off."* |
| — | footer | *"These are set on this device only. Another screen in the same van can do the other step."* |

Each row carries an `On`/`Off` chip — **the state in a word, with `aria-pressed`**, green when on, grey
when off.

✅ **NO BARE STATUS WORDS AS LABELS.** Neither row is called "Ready" or "Collected"; both name **an
action the operator takes**. ✅ **NO JARGON FOR THE EXIT RULE** — *"Orders leave this screen when
they're collected"* is the register you asked for, and `boardMode`, `handoverOn`, `viewMode` and
`cardStyle` appear nowhere in the copy.

## 2.4 What else the panel needed, and why it is not a fourth change

**One `useAndroidBack` entry:**

```tsx
    [showStepsPanel, () => setShowStepsPanel(false)],
```

⚠️ **A consequence of adding a modal to this surface, not a separate decision.** `useAndroidBack` keeps
ONE LIFO stack and **the order of that array IS the nesting**, so an entry registered anywhere else
would sit at the wrong depth. It is placed beside the event picker because it is the same kind of
thing: a chooser opened from the header, over the board, under nothing.

**Behaviour, keys, defaults and persistence: untouched.** The panel's two buttons call
`if (handoverOn) setReady(!readyOn)` and `if (readyOn) setHandover(!handoverOn)` — **the header's exact
expressions, including the `disabled` guard** — so a second PLACE was added, never a second
implementation.

---

# STAGE 3 — THE WORDING REVIEW. REPORT ONLY.

**Every string on the header and in the panels it opens.** "Understood untrained?" assumes a food-truck
operator who has used the board for ten minutes and read no documentation.

## The header

| String | Understood untrained? | Note |
|---|---|---|
| `Dashboard` | ✅ yes | |
| `{truck} — {van}` | ✅ yes | |
| `List` / `Grid` | ✅ yes | |
| **`Full` / `Cook`** | ⚠️ **PARTLY** | 🔴 **`Cook` names a ROLE, not what the control does — it changes what the CARD shows.** An operator reads it as "put this screen in cook mode", which is what it used to mean and no longer does. **Proposed: `All details` / `Kitchen only`.** The `title` already explains both; the labels do not |
| **`Ready step`** | 🔴 **NO** | 🔴 **"Step" is our word.** It names a stage in our model, not anything the operator does. **Proposed: `Mark ready` — matching the panel's "Mark orders ready"** |
| **`Payment/Collected`** | 🔴 **NO** | 🔴 **TWO STATUS WORDS AND A SLASH.** It names two things the system calls buttons, not an action, and the slash reads as "or". **Proposed: `Take payment` — matching the panel's "Take payment and hand over"** |
| `Steps · Ready + payment` (new) | ⚠️ **PARTLY** | "Steps" is still our word. Kept because it is the shortest true noun at that width; **the panel heading avoids it deliberately.** **Alternative: `Does · Ready + payment`** |
| `📱` + `🔕`/`🌙` badges | ⚠️ **PARTLY** | Named for assistive tech; **a sighted untrained operator must still decode two crossed-out glyphs.** The panel behind it says it in words |
| `No extra wait` / `+10 min` | ✅ yes | ⚠️ **but it is silent about WHO it affects** — it changes the time quoted to NEW customers, not existing orders |
| `Pause orders` / `Paused — tap to resume` | ✅ yes | the clearest control on the row |

## The event bar

| String | Understood untrained? | Note |
|---|---|---|
| `📍 {venue} · {time}` · `📅 {date}` | ✅ yes | |
| status label (`Live`, `Paused`, `Finished`, `Not started`) | ✅ yes | shared vocabulary with the dashboard |
| **`Event actions ▾`** | ⚠️ **PARTLY**, and 🔴 **it is a bare `▾` at phone width with NO accessible name** | *"Actions"* names a menu, not a job. **Proposed: `Manage event`** — and it needs an `aria-label` either way |

## The panels

| String | Understood untrained? |
|---|---|
| `Device settings` · `This screen` · `Keep the screen on` · `New-order sound` | ✅ yes |
| `This device` (inside the shared card) | ⚠️ **two headings, one sheet** — recorded last task, unresolved |
| `Default screen` · `Order notifications` | ✅ yes |
| `Require fingerprint or face unlock to open` | ✅ yes |
| **`What this screen does`** + both rows (new) | ✅ **written for this test** |

## 🔴 EVERY STRING THAT NAMES AN INTERNAL CONCEPT RATHER THAN A THING THEY DO

1. 🔴 **`Ready step`** — a stage in our lifecycle model.
2. 🔴 **`Payment/Collected`** — two of our status values, slashed together.
3. ⚠️ **`Cook`** — a role name for a control that changes card contents.
4. ⚠️ **`Steps`** (new, mine) — the same word as #1, kept only for width.
5. ⚠️ **`Event actions`** — a menu name, not a task.

**Nothing above was changed. Stage 2's own labels are the only new copy, and they are proposed for
your edit.**

---

# VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.** `npx tsc --noEmit` exits 0, and `npx eslint` on the KDS produces
a finding set **byte-identical to HEAD's** (`git show HEAD:…` piped through `eslint --stdin`, sorted
sets diffed). **This change adds no lint finding.**

| Required claim | Method |
|---|---|
| At and above `sm:`, the header is unchanged | ✅ **EXECUTED for the markup** — `git diff` contains no `-` line touching either switch, their handlers or their storage keys; the only change around them is a wrapper. 🔴 **The RENDERED result is a source-read argument about `display: contents`** — that it produces no box, so the two buttons remain direct flex children. **Not rendered** |
| Below `sm:`, both switches are reachable with full labels | ✅ **Source read** — the `sm:hidden` opener and the panel quoted above. ⚠️ **NOT rendered; no panel was opened** |
| Both states are readable without opening the panel, in all four combinations | ✅ **Source read** — the four-arm ternary is quoted and every arm is listed in §2.2. ⚠️ **The fourth arm is unreachable by the `disabled` rule** |
| No header control is a bare icon with no accessible name | 🔴 **NOT TRUE, AND IT IS NOT ON THE HEADER.** Every header control now has one. **`Event actions` on the EVENT BAR is a bare `▾` with no `title` and no `aria-label`** — found in Stage 1, reported in Stage 3, **not fixed**, because Stage 2 is scoped to the two switches and the brief forbids changing anything else |
| The dashboard is unchanged | ✅ **EXECUTED** — `git diff --stat app/dashboard/[token]/page.tsx components lib app/api` is **empty** |

## 🔴 WHAT WAS NOT VERIFIED

- **NOTHING WAS RENDERED AND NOTHING WAS TAPPED.** No `next dev`, no `next build`, no `cap sync`, no
  device. **Every claim about how this looks is a claim about source.**
- 🔴 **`sm:contents` HAS NOT BEEN SEEN TO WORK HERE.** It is the load-bearing choice of this task: if
  the wrapper produced a box after all, the wide header would gain one flex item and lose two, and
  spacing would change at every width above 640px — **the one thing this task must not do.** Tailwind
  v4 ships the `contents` utility and `display: contents` is broadly supported, but **that is a source
  and documentation claim, not an observation.**
- **The opener's width at phone size** — it carries up to `Steps · Ready + payment`, which is longer
  than the `✓`/`💷` pair it replaces. **On a wrapping row that is a wrap, not an overflow**, but it has
  not been looked at.
- **The panel's copy has never been read by an operator**, which is the only test that settles Stage 3.

---

# INTEGRITY

## `app/dashboard/[token]/kds/page.tsx` — byte scan and census

**Byte-level tool (Python over `open(…,'rb')`), never grep.**

```
BEFORE   bytes 171,188   chars 165,546   lines 2,443
AFTER    bytes 180,161   chars 174,253   lines 2,567
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 33 distinct classes before, 33 after. NO NEW CLASS, NONE REMOVED.**

| Codepoint | Before | After | Δ | |
|---|---|---|---|---|
| U+2500 ─ | 2079 | 2167 | +88 | comment rules |
| U+2014 — | 278 | 295 | +17 | comment prose |
| U+1F534 🔴 | 115 | 120 | +5 | comment prose |
| U+FE0F | 99 | 106 | +7 | selectors |
| U+26A0 ⚠️ | 97 | 104 | +7 | comment prose |
| **U+2713 ✓** | **4** | **6** | **+2** | 🔴 **the panel's ready chip** |
| **U+1F4B7 💷** | **1** | **3** | **+2** | 🔴 **the panel's payment chip** |
| U+00B7 · | 11 | 12 | +1 | the opener's separator |
| U+00D7 × | 3 | 4 | +1 | the panel's close button |
| U+00A7 § | 3 | 4 | +1 | a comment cross-reference |
| **every other class** | — | — | **0** | |

🔴 **NO NEW CLASS AND NONE REMOVED — ✓ and 💷 were already in this file**, on the very switches this
panel mirrors. The new markup reuses their glyphs rather than introducing icons.
✅ **`U+26A0` moved +7 and `U+FE0F` moved +7** — carrier-aware check on the source:
`U+26A0` n=104, **104 paired, 0 bare**. `U+2713` n=6 and `U+1F4B7`
n=3, both bare — ✓ has no emoji presentation and 💷 has it by default.

## This report — SEPARATE pass, run AFTER writing

```
docs/kds-phone-controls-report.md   bytes 19,224
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE:**

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 🔴 | 35 | 0 | 35 |
| U+2705 ✅ | 29 | 0 | 29 |
| **U+26A0 ⚠️** | **22** | **22** | ✅ **0** |
| U+1F4B7 💷 | 7 | 0 | 7 |
| U+1F4F1 📱 | 3 | 0 | 3 |
| U+1F515 🔕 | 3 | 0 | 3 |
| U+1F319 🌙 | 3 | 0 | 3 |
| U+1F4CD 📍 | 2 | 0 | 2 |
| U+1F4C5 📅 | 3 | 0 | 3 |

**`U+26A0` is the only base here that defaults to TEXT presentation**, and ✅ **every one of its
22 occurrences is PAIRED — 22 OF 22, ZERO BARE.** Every other base above has emoji
presentation by default and needs no selector, so bare is correct for all of them. ⚠️ **`U+2713 ✓` is
NOT an emoji-presentation base at all** — it is quoted here as a label glyph and takes no selector. The
report's total `U+FE0F` count is 22, which exactly accounts for the 22 paired warning signs
and leaves none attached to any other base.

## Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M docs/reference-manual.md
?? docs/kds-event-isolation-fix-report.md
?? docs/kds-event-isolation-report.md
?? docs/kds-header-group-report.md
?? docs/kds-header-tidy-report.md
?? docs/kds-phone-controls-report.md
?? docs/payment-method-report.md
```

| Entry | Pre-existing? |
|---|---|
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **BOTH.** Already modified by the event-isolation, header-tidy and header-group tasks; **this task added its hunks to that same modification** |
| 🔴 `?? docs/kds-phone-controls-report.md` | 🔴 **THIS TASK** — this file, the only new entry |
| `M docs/reference-manual.md` | ✅ pre-existing — the V11.24 update. **Left alone, as instructed** |
| `?? docs/kds-event-isolation-report.md` | ✅ pre-existing — **left alone, as instructed** |
| `?? docs/kds-event-isolation-fix-report.md` · `?? docs/kds-header-tidy-report.md` · `?? docs/kds-header-group-report.md` · `?? docs/payment-method-report.md` | ✅ pre-existing — the four preceding tasks' reports. ⚠️ **Not named in the brief's two-entry list; left alone on the same footing** |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
