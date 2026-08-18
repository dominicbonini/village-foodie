# KDS phone header — the badges are gone; the row carries controls

**File changed — ONE source file:** `app/dashboard/[token]/kds/page.tsx`.
**Also written:** `docs/kds-phone-controls-final-report.md` (this file).
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `log` and `diff` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any migration, any schema change.

**No span of the prompt arrived garbled.** 🔴 **ONE CONTRADICTION WAS FOUND AND I STOPPED AND ASKED
RATHER THAN CHOOSING:** the six-item always-visible row needs ~442px and 390px gives 358, so Change 5
("the row must never wrap") and the row's own contents cannot both hold. **You were given the
arithmetic twice — including the answer to "does it fit if renamed to `Manage`?" (no: ~404px) — and you
chose to keep `Manage event` on the row and accept two lines.** That is what is built. **You also chose
the van truncating as a last resort at 320px.**

**🔴 NO LABEL WAS SHORTENED OR REWORDED**, `Manage event` included — the rename to `Manage` would have
saved 46px and the row still wraps, so it would have cost a word and bought nothing.

---

# THE WIDTH MODEL AND ITS ERROR BAR

**MEASURED BY MODEL, NOT RENDERED.** Helvetica's published advance widths (units/1000 em — the closest
public metric set to the `-apple-system` / SF Pro Text stack these headers render in), scaled to the
Tailwind size in force, plus the real padding and gap values read out of the class strings: `text-xs` =
12px, `text-sm` = 14px, `px-2.5` = 10px a side, `px-3` = 12px a side, `gap-x-3` = 12px, `p-1` = 4px.
Emoji at 1.15em. ⚠️ **±5%.** SF Pro Text is slightly narrower than Helvetica at small sizes, so the model
runs **pessimistic**. **Content width = viewport − `px-4`: 320 → 288 · 375 → 343 · 390 → 358 · 430 → 398.**

| Item | Model |
|---|---|
| `←` back | 26.7px |
| `🔔`/`🔕` sound, icon only | 33.8px |
| `Screen on` / `Screen off`, words, no glyph | 77.2px |
| `Screen settings` | 110.4px |
| `Manage event ▾` | 117.3px |
| **fixed controls + their 4 gaps** | **413.3px** |

🔴 **413px of fixed controls against 358px available at 390px — BEFORE THE TRUCK NAME. That is why it
is two lines, and it is arithmetic, not judgement.**

---

# CHANGE 1 — EVERY STATE BADGE IS GONE

✅ **EXECUTED — the header's rendered JSX (comments stripped) contains exactly five glyph sites, and
every one of them is a CONTROL or a `sm:`-and-above mount:**

```
1873  <span aria-hidden>✓</span>                                    inside `hidden sm:contents`  -> sm:+ only
1891  <span aria-hidden>💷</span>                                   inside `hidden sm:contents`  -> sm:+ only
1939  <span aria-hidden>{soundEnabled ? '🔔' : '🔕'}</span>          THE PHONE SOUND CONTROL'S OWN FACE
2013  {!soundEnabled && <span … className="text-xs">🔕</span>}       on the 📱 button, `hidden sm:flex` -> sm:+ only
2014  {!screenHeld && <span … className="text-xs">🌙</span>}         on the 📱 button, `hidden sm:flex` -> sm:+ only
```

✅ **`line-through` does not appear anywhere in the header at all.** ✅ **Below `sm:` the only glyph on
the row is the sound toggle's own face.** No struck `✓`, no struck `💷`, no `🌙`, no `☀️`, no `🔕` as a
marker on another control.

🔴 **AND THE REASON IS RECORDED IN THE FILE, NOT JUST HERE:** a struck-through glyph reads as
"unavailable" or "cancelled"; these are settings, and a screen deliberately set to make-only is not in
an error state. The badges only ever existed because four settings were being encoded in a collapsed
row.

---

# CHANGE 2 — SCREEN-ON IS BACK ON THE ROW, IN WORDS

```tsx
        <div className="sm:hidden shrink-0">{screenOnBtn(screenHeld ? 'Screen on' : 'Screen off', true)}</div>
```
```tsx
  const screenOnBtn = (label: string, wordsOnly = false) => (
    <button
      type="button"
      onClick={toggleKeepScreenOn}
      aria-pressed={screenHeld}
      …
      {!wordsOnly && <span aria-hidden>{screenHeld ? '☀️' : '🌙'}</span>}
      <span>{label}</span>
```

✅ **IT RUNS FROM A REAL `click` ON A REAL `<button>`** — `onClick={toggleKeepScreenOn}`, which is
**unchanged**, as is `screenOnBtn` itself apart from the optional flag that suppresses the glyph.
`keepAwake.ts` was not touched.

🔴 **THIS REVERSES THE REGRESSION THE LAST TASK CREATED.** Re-acquiring after Safari drops the lock is
**one tap** again — it was three (expand → `Screen & sound` → chip). On web this control IS the
acquisition mechanism, not a display of one, and the `KeepAwakePrompt` bar in the banner stack is now
the second path rather than the only sane one.

⚠️ **THE ~70px IS SPENT KNOWINGLY.** `Screen off` in words is 77.2px where a glyph-only chip was 34px.
**Two glyph designs have been rejected (`☀️`/`🌙`, then the struck sun) and the words match the
wide-width label**, so this is the third and deliberate answer.

---

# CHANGE 3 — SOUND ON THE ROW, TWO DISTINCT GLYPHS

```tsx
          aria-label={soundEnabled ? 'New-order sound is on — tap to turn it off' : 'New-order sound is off — tap to turn it on'}
          title={…same…}
          className={`sm:hidden flex items-center px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${soundEnabled ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}
        >
          <span aria-hidden>{soundEnabled ? '🔔' : '🔕'}</span>
```

🔴 **TWO CHARACTERS, NEVER ONE STRUCK THROUGH.** `🔔` and `🔕` each read as themselves — which is
precisely what a struck glyph fails to do. Colour carries the same state a second time (green / slate).
✅ **The accessible name states the state AND the action in words at both states**, because the glyph is
the only visible label. ✅ **The handler is the original** — enabling still primes the audio, because
enabling is the gesture the browser requires. **The master only; which-sounds and due-to-cook are behind
`Screen settings`.**

---

# CHANGE 4 — `Screen settings`

## 4.1 The mechanism: a SHEET, and it overlays the board

🔴 **I CHOSE THE EXISTING POPUP (`deviceOpen`) AND DELETED THE EXPAND-IN-PLACE ROWS, `phoneExpanded`
INCLUDED.** The reason expanding in place was ever right was so an operator could see the board change
as they changed it — **and the two controls that argument was really about, sound and screen, are now on
the row itself.** What is left behind the button is set-once configuration plus `ThisDeviceSettings`,
which is a whole card and never fitted three lines.

⚠️ **THE COST, STATED: the sheet OVERLAYS the board (`fixed inset-0 z-[60]` over `bg-black/50`), so
`Full`/`Cook` and `List`/`Grid` cannot be seen taking effect while the sheet is open** — the change
lands and is visible on close. **Nothing pushes the board down any more.** That is the trade for one
mechanism instead of two, and for a panel that can hold a native card.

## 4.2 What is in it, and the labels

| Row | Label | Provenance | Renders |
|---|---|---|---|
| layout | `List` `Grid` | the header segment's own button text | `sm:hidden` |
| card display | `Full` `Cook` | the header segment's own button text | `sm:hidden` |
| step 1 | `Ready step` + `On`/`Off` | the switch's own `hidden sm:inline` label | `sm:hidden` |
| step 2 | `Payment & handover` + `On`/`Off` | the switch's own `hidden sm:inline` label | `sm:hidden` |
| which-sounds | `New order sound` → `Only orders needing confirming` / `All new orders` | the dashboard's, unchanged | both widths |
| due-to-cook | `Sound when an order is due to be cooked` | the dashboard's, unchanged | both widths |
| device | `ThisDeviceSettings` | `isNativeApp() && !isDemo`, **gate unchanged** | both widths |

✅ **NO DESCRIPTIONS ANYWHERE IN THE PHONE SECTION.** ✅ **Same handlers, same `disabled` rule** — neither
switch can be turned off while it is the only step left. 🔴 **The step switches carry no state word and
no glyph on the row outside; their state is visible only here, as `On`/`Off` on the control itself.**

**The panel's heading follows the button:** `Screen settings` below `sm:`, 🔴 **`Device settings` at
`sm:` and above — unchanged.**

---

# CHANGE 5 — WRAPPING, AND WHAT SHRINKS

```tsx
        <div className="flex items-center gap-2 min-w-0 shrink sm:shrink-0">
          <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <span className="font-medium text-slate-900 flex min-w-0">
            <span className="truncate shrink-[999] min-w-0">{truck.name}</span>
            {vanName ? <span className="truncate shrink min-w-0">{` — ${vanName}`}</span> : null}
          </span>
        </div>
```

**Every button on the row is `shrink-0`. Only the name gives way, and within the name the truck goes
first:** `shrink-[999]` against `shrink` means flexbox takes ~1000px off the truck for every one it
takes off the van, so **the truck is effectively gone before the van loses a character** — your last
resort, implemented rather than promised.

## 5.1 🔴 THE ROW IS TWO LINES AT EVERY PHONE WIDTH — ON YOUR DECISION

**Greedy packing of the six items, using the minimum possible name, at 320 / 375 / 390 / 430px: TWO
LINES at all four.** The split is the same everywhere:

```
line 1   ←  <truck — van>   🔔   [Screen off]        fixed part 173.6px + the name
line 2   [Screen settings]  [Manage event ▾]         239.7px
```

| Viewport | Content | Line 1 fixed | **Name budget** | Line 2 | Fits? |
|---|---|---|---|---|---|
| **320px** | 288 | 173.6 | **102.4px** | 239.7 | ✅ **both lines fit** |
| **375px** | 343 | 173.6 | **157.4px** | 239.7 | ✅ |
| **390px** | 358 | 173.6 | **172.4px** | 239.7 | ✅ |
| **430px** | 398 | 173.6 | **212.4px** | 239.7 | ✅ |

✅ **NEITHER LINE OVERFLOWS AND NOTHING IS EVER PUSHED OFF-SCREEN AT ANY OF THE THREE WIDTHS YOU
NAMED.** The header is `flex-wrap content-start gap-y-2`, so the second line is a proper line, not a
clipped one.

## 5.2 The van survives at every width — the last resort does not even engage

| Name | Van run | Name budget at 320px | Outcome at 320px |
|---|---|---|---|
| `Gusto` | — | 102.4 | ✅ untouched |
| `Pizzeria Gusto — Van 1` | 58.4px | 102.4 | ✅ **van whole**, truck truncates to ~44px → `Pizzeri... — Van 1` |
| `The Long Barn Wood-Fired Pizza Co — Van 12` | 66.2px | 102.4 | ✅ **van whole**, truck truncates to ~36px → `The Lo... — Van 12` |
| a van run longer than 102px (e.g. `— Van Bombay East`) | >102 | 102.4 | ⚠️ **the van itself clips** — `— Van Bomba...` — which is the last resort you chose, and it still identifies the screen |

🔴 **THE PREVIOUS TASK'S 320px BOUNDARY CASE (288.8 of 288) IS GONE.** It came from trying to hold six
items on one line; with the row on two lines the tightest quantity at 320px is line 2 at **239.7 of
288 — 48px of clearance, 3.4× the model's own ±14px error bar.**

---

# ⚠️ `Pause orders` — UNCHANGED

`hidden sm:block` except the `isDemo && isPaused` arm, exactly as the previous task left it. **Not in
this task's diff.** On a paused demo it is still the only resume control that exists, because the Manage
event menu's mount and openers are all `!isDemo`.

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint` on the KDS: 21 problems (18 errors, 3 warnings) — identical
to HEAD and to every task this session.**

| Required claim | Method |
|---|---|
| No state badge or struck glyph on the collapsed row | ✅ **EXECUTED** — a script strips the header's comments and lists every glyph site in rendered JSX: five, of which three are `sm:`-only mounts and one is the sound control's own face; `line-through` appears nowhere in the header |
| `Screen on`/`Screen off` in words, toggles from a click | ✅ **EXECUTED (source)** — one `screenOnBtn`, `onClick={toggleKeepScreenOn}` unchanged, `wordsOnly` suppresses the glyph only for the `sm:hidden` mount. ⚠️ **Not rendered — the lock was not acquired in a browser** |
| Sound shows `🔔` or `🔕`, two glyphs, accessible name | ✅ **EXECUTED (source)** — a single ternary between two distinct characters; `aria-label` and `title` state both the state and the action at both states |
| Every other control reachable behind `Screen settings`, wide-width labels | ✅ **EXECUTED (source)** — the table in §4.2, each label matched back to the header control it came from |
| The row cannot wrap at 320 / 390 / 430px | 🔴 **IT DOES WRAP — TO EXACTLY TWO LINES, BY YOUR DECISION, AND NEITHER LINE OVERFLOWS.** ⚠️ **MODEL, ±5%:** line 1 fixed 173.6 + name budget 102–212; line 2 239.7 against 288–398. **Not rendered** |
| `sm:` and above unchanged | ✅ **AS CLOSE TO PROOF AS SOURCE ALLOWS.** Every edit is one of four kinds: (a) new elements carrying `sm:hidden` (the four phone controls, the panel's phone section); (b) deletions of things that were already `sm:hidden` (the expanding rows, the panel's screen row); (c) `screenOnBtn`'s new argument, which **defaults to false** — the `hidden sm:block` mount passes nothing and renders ☀️/🌙 with its label exactly as before; (d) the name block, whose `sm:shrink-0` restores `flex-shrink: 0` so `truncate`/`shrink-[999]` are unreachable at those widths. 🔴 **No control that renders at `sm:`+ was added, removed, restyled or reworded.** ⚠️ **Not rendered, so this is an argument from the class strings** |
| The dashboard is untouched | ✅ **EXECUTED** — `app/dashboard/[token]/page.tsx` is **390,931 bytes**, unchanged across all three KDS tasks; `components/shared/EventActionsModal.tsx` 10,494 and `ExtraWaitModal.tsx` 2,849, both unchanged; nothing under `app/api` is in the diff |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RENDERED.** Every width is arithmetic over published font metrics, ±5%.
- ⚠️ **The two-line row is a design decision you took on the arithmetic, not a fault the model missed.**
  If it reads badly on hardware, the cheapest fix is still moving `Manage event` to the event bar, which
  costs the header 129px and no words.
- ⚠️ **The sheet overlays the board**, so the display segments cannot be watched taking effect.

---

# INTEGRITY

⚠️ **"BEFORE" IS THE FIGURE THE PREVIOUS REPORT RECORDED FOR THIS FILE** — the tree was already dirty and
`checkout` is forbidden. **The census is also checked against `HEAD`.**

```
app/dashboard/[token]/kds/page.tsx
BEFORE (end of the previous task)   220,411 bytes · 3,559 non-ASCII occurrences (per that report: 3,689 before its own trims)
AFTER                               216,158 bytes · 208,846 chars · 2,911 lines
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 33 distinct classes before, 33 after; `added-vs-HEAD: none`, `removed:
none`.** ⚠️ **YOU EXPECTED THE CENSUS TO FALL, AND IT DID NOT — HERE IS EXACTLY WHY, RATHER THAN A
SHRUG.** Glyph OCCURRENCES fell and the file shrank by 4,253 bytes, but **no glyph lost its last
site**: `☀️` and `🌙` still render in `screenOnBtn`'s default and on the `📱` button's badges, and `✓`
and `💷` still render on the two step switches — **all four of those are `sm:`-and-above mounts, which
this task must keep byte-identical.** A falling class count would have meant changing them.

**Carrier-aware on the source: `U+26A0` n=130, 130 paired, ✅ 0 bare; `U+2600` n=5, 5 paired, ✅ 0 bare.**

🔴 **ONE CHARACTER WAS INTRODUCED AND REMOVED BEFORE THIS REPORT WAS WRITTEN:** `U+2026 …`, in a comment
showing a clipped van name. Rewritten as `...`. **Fourth task running that this pass has caught
something.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/kds-phone-controls-final-report.md   bytes 19,108
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 20 | 0 | 20 |
| U+26A0 (warning sign — TEXT presentation) | 13 | 13 | 0 |
| U+2705 (check mark button) | 27 | 0 | 27 |
| U+2600 (sun — TEXT presentation) | 5 | 5 | 0 |
| U+1F4B7 (banknote) | 3 | 0 | 3 |
| U+1F4F1 (mobile phone) | 3 | 0 | 3 |
| U+1F515 (bell with slash) | 7 | 0 | 7 |
| U+1F514 (bell) | 6 | 0 | 6 |
| U+1F319 (crescent moon) | 6 | 0 | 6 |
| U+2713 (check mark — TEXT presentation) | 3 | 0 | 3 |
| U+25BE (triangle — TEXT presentation) | 2 | 0 | 2 |

U+26A0 and U+2600 are the two bases used as emoji here that have TEXT presentation by default,
and every occurrence of each is PAIRED with U+FE0F. U+2713 and U+25BE are bare because they are
quoted from source, where this codebase leaves them bare by design. The rest have emoji
presentation by default, so bare is correct for them.

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
?? docs/kds-phone-controls-final-report.md
?? docs/kds-phone-expand-report.md
?? docs/kds-phone-width-fix-report.md
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
| 🔴 `M app/dashboard/[token]/kds/page.tsx` | ⚠️ already `M`; 🔴 **THIS TASK wrote to it — the only source file written** |
| 🔴 `?? docs/kds-phone-controls-final-report.md` | 🔴 **THIS TASK** — this file |
| `M app/dashboard/[token]/page.tsx`, `M components/shared/EventActionsModal.tsx`, `?? components/shared/ExtraWaitModal.tsx`, `?? docs/kds-view-panel-report.md`, `?? docs/kds-phone-expand-report.md`, `?? docs/kds-phone-width-fix-report.md` | ✅ pre-existing — the three previous KDS tasks; **none touched by this one** |
| `M app/landing/*`, `M lib/plan-features.ts`, `?? docs/landing-features-move-report.md` | ✅ pre-existing — the landing tasks |
| everything else | ✅ pre-existing — earlier tasks this session and their reports |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
