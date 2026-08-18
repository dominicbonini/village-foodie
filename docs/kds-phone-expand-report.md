# KDS on a phone — the `View` sheet replaced by an expand/collapse row

**File changed — ONE source file:** `app/dashboard/[token]/kds/page.tsx`.
**Also written:** `docs/kds-phone-expand-report.md` (this file).
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `log` and `diff` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any migration, any schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

⚠️ **TWO THINGS ARE REPORTED RATHER THAN SOLVED, BOTH ON YOUR INSTRUCTION TO SAY SO:** the collapsed
row can reach two lines when a long truck+van name meets three badges (§2.4), and line 3 clears 390px
by roughly 6px on an estimate that was never measured (§3.4). **Neither was fixed by shortening a
label.**

---

# STAGE 1 — READ ONLY (what was there before this task)

## Q1 — THE `View` BUTTON AND ITS PANEL, AS BUILT

```tsx
        <button
          onClick={() => setDeviceOpen(true)}
          title="View — what this screen does, how cards look, and this device's screen and sound"
          className="sm:hidden flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg …"
        >
          <span className="font-semibold">View</span>
          {!soundEnabled && <span aria-hidden className="text-xs">🔕</span>}
          {!screenHeld && <span aria-hidden className="text-xs">🌙</span>}
        </button>
```

**The panel it opened** — `{deviceOpen && (…)}`, a `fixed inset-0 z-[60]` overlay with a `bg-black/50`
backdrop. 🔴 **THAT IS THE DEFECT IN ONE LINE: `fixed inset-0` OVER `bg-black/50` COVERS THE BOARD,
and the operator was changing what the board does.**

| Row, in order | Where it came from | Gate |
|---|---|---|
| `What this screen does` (section) | the absorbed steps panel's own `<h2>` | `sm:hidden` block |
| `Ready step` + sentence | the header switch's `hidden sm:inline` label | `sm:hidden` |
| `Payment & handover` + sentence | the header switch's `hidden sm:inline` label | `sm:hidden` |
| "These are set on this device only…" | the steps panel, verbatim | `sm:hidden` |
| `Layout` → `List` / `Grid` | the header's own comment + segment button text | `sm:hidden` |
| `Card display` → `Full` / `Cook` | the header's own comment + segment button text | `sm:hidden` |
| `Screen & sound` / `Sound` (heading) | written for 5a last task | breakpoint spans |
| `Keep the screen on` | the device sheet's own row | `sm:hidden` |
| `New-order sound` (master) | the device sheet's own row | none |
| `New order sound` — which-sounds radios | the dashboard's heading and options | none |
| `Sound when an order is due to be cooked` | the dashboard's label, verbatim | none |
| `ThisDeviceSettings` | the shared native card | `isNativeApp() && !isDemo` |

## Q2 — THE NATIVE DEVICE BLOCK AND ITS GATE

```tsx
              {isNativeApp() && !isDemo && <ThisDeviceSettings token={token} />}
```

🔴 **NATIVE-ONLY ROWS, none of which renders on web or in demo:** *"You're viewing: truck — van"* →
**truck switch** (only with >1 permitted truck) → **van** (only with >1) → **default screen** →
**notifications** → **app-lock**. The component **also self-guards on `isNativeApp`**, so the gate is
belt and braces. ✅ **On web the panel simply ends after the sound rows.**

## Q3 — WHICH-SOUNDS AND DUE-TO-COOK, AND THE KEY THEY WRITE

```tsx
                    {([['needs_confirming', 'Only orders needing confirming'], ['all', 'All new orders']] as const).map(([val, label]) => (
                          const next = { ...(storedSoundCfg ?? DEFAULT_SOUND_CONFIG), new_orders: val }
                          writeSoundConfig(token, next); setStoredSoundCfg(next); soundConfigRef.current = next
```
```tsx
                  <span className="font-semibold text-slate-700">Sound when an order is due to be cooked</span>
                      const next = { ...cur, order_due: !cur.order_due }
                      writeSoundConfig(token, next); setStoredSoundCfg(next); soundConfigRef.current = next
```

| | Label | Key |
|---|---|---|
| which-sounds | `New order sound` → `Only orders needing confirming` / `All new orders` | 🔴 `hg_soundcfg_${token}` via `writeSoundConfig` — **shared with the dashboard, deliberately** |
| due-to-cook | `Sound when an order is due to be cooked` / `Sounds when a ticket turns amber.` | 🔴 **the same key, same writer** |

✅ **Both are unchanged by this task** — they moved panel, not key, not label, not writer.

## Q4 — THE PHONE HEADER BEFORE THIS TASK

**Contents below `sm:`:** `←` · truck — van · `View` (+ up to two badges) · a `flex-1 basis-0` spacer ·
`Pause orders` **when the event is open**.
**Row count:** **one** without the pause chip; **one, within a few px of the edge**, with it — the
figure the previous report gave as an estimate, never a measurement.

---

# STAGE 2 — THE COLLAPSED ROW

**One row: `←` · truck — van · the toggle · (the spacer) · `Pause orders` when it applies.**
⚠️ **`Manage event` is in the EVENT BAR, the row below the header, and always has been. It is
unchanged.** ⚠️ **`Pause orders` is untouched in this task, as instructed.**

```tsx
        <button
          onClick={() => setPhoneExpanded(v => !v)}
          aria-expanded={phoneExpanded}
          aria-label={`This screen — ${readyOn ? 'ready step on' : 'ready step off'}, ${handoverOn ? 'payment and handover on' : 'payment and handover off'}, sound ${soundEnabled ? 'on' : 'off'}, screen ${screenHeld ? 'staying on' : 'not held on'}`}
          title="What this screen does, how cards look, and this device's screen and sound"
          className="sm:hidden flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-slate-100 …"
        >
          <span className="font-semibold">This screen</span>
          {!readyOn && <span aria-hidden className="text-xs line-through opacity-70">✓</span>}
          {!handoverOn && <span aria-hidden className="text-xs line-through opacity-70">💷</span>}
          {!soundEnabled && <span aria-hidden className="text-xs">🔕</span>}
          {!screenHeld && <span aria-hidden className="text-xs">🌙</span>}
          <span aria-hidden className={`text-slate-400 transition-transform ${phoneExpanded ? 'rotate-180' : ''}`}>▾</span>
        </button>
```

## 2.1 🔴 EXACTLY WHAT RENDERS, FOR EVERY COMBINATION

**The badge rule is the existing one, extended: a badge appears for what is OFF and for nothing that is
on.** The step glyphs are the switches' OWN glyphs struck through — `line-through` is what makes `✓`
mean "ready step OFF" — so two new states cost **no new character**.

| Steps | Sound | Screen | Renders after "This screen" |
|---|---|---|---|
| both on | on | held | ✅ **nothing but the chevron** — the all-good case is silent |
| both on | on | not held | `🌙` |
| both on | off | held | `🔕` |
| both on | off | not held | `🔕` `🌙` |
| **ready OFF** | on | held | ~~`✓`~~ |
| **ready OFF** | off | held | ~~`✓`~~ `🔕` |
| **ready OFF** | on | not held | ~~`✓`~~ `🌙` |
| **ready OFF** | off | not held | 🔴 ~~`✓`~~ `🔕` `🌙` — **the maximum, three** |
| **handover OFF** | on | held | ~~`💷`~~ |
| **handover OFF** | off | held | ~~`💷`~~ `🔕` |
| **handover OFF** | on | not held | ~~`💷`~~ `🌙` |
| **handover OFF** | off | not held | 🔴 ~~`💷`~~ `🔕` `🌙` — **the maximum, three** |
| **both off** | — | — | 🔴 **UNREACHABLE.** Each switch is `disabled` while it is the only step left |

**(`~~x~~` above = the glyph rendered with `line-through`.)**

🔴 **THE CASE THIS EXISTS FOR:** a screen that has silently stopped handling payment shows ~~`💷`~~ on
the collapsed row, with no tap and no expansion. That was the requirement.

## 2.2 The accessible name

`This screen — ready step on, payment and handover off, sound off, screen not held on` —
🔴 **all four facts in words, always, whatever the badges show**, because a badge is a visual channel
only. `aria-expanded` carries open/closed, so the name does not repeat it.

## 2.3 The chevron

`▾` with `rotate-180` when expanded. ⚠️ **A rotation and not a second character** — `▴` would have been
a new class in a file whose census is held at 33.

## 2.4 ⚠️ THE ROW CAN REACH TWO LINES, AND HERE IS WHEN — REPORTED, NOT SILENTLY FIXED

**Estimated widths at 390px (358px of content after `px-4`), text-xs at ~6.0px/char:**

| Piece | Estimate |
|---|---|
| `←` | ~30px |
| truck — van, `text-sm` (`Pizzeria Gusto — Van 1`) | ~170px |
| toggle, no badges | ~103px |
| toggle, three badges | ~157px |
| two `gap-x-3` gaps | ~24px |

**No badges ≈ 327px → ONE ROW. Three badges ≈ 381px → ⚠️ IT WRAPS**, and a short truck name (`Gusto`,
~60px) brings even the three-badge case to ~271px, which does not.

🔴 **THE HONEST STATEMENT: the collapsed row is one row for a short truck+van name in every badge
state, and for a long one only while fewer than three badges show.** Adding `Pause orders` (~104px,
out of scope this task) wraps it in more cases again.

**PROPOSED, NOT APPLIED — your call, since both change something you did not ask for:**
1. ⭐ **Let the truck/van name truncate** — `min-w-0 truncate` on that block. It is the only piece here
   with no fixed information value at a glance, it is already on screen elsewhere, and this makes the row
   width independent of the truck's name. **This is the one I would pick.**
2. **Drop `🌙` from the badge set.** Cheapest in pixels, but it deletes a warning that the screen may
   dim mid-service, which is exactly the class of thing this row exists to show. **Not recommended.**
3. **Accept two rows in the worst case.** It is still visible and reachable — the header is
   `flex-wrap content-start`, which is what it was built to do.

---

# STAGE 3 — THE EXPANDED STATE

```tsx
        {phoneExpanded && (
          <div className="w-full sm:hidden flex flex-col gap-2 pt-1">
```

## 3.1 The three lines, and where every label came from

| Line | Controls | Label provenance |
|---|---|---|
| **1** | `List` `Grid` · `Full` `Cook` | 🔴 the header segment's **own button text**, verbatim |
| **2** | `✓ Ready step` · `💷 Payment & handover` | 🔴 the two header switches' **own `hidden sm:inline` labels**, verbatim |
| **3** | `Keep the screen on` · `New-order sound` · `Sounds` | 🔴 the device sheet's **own row labels**, verbatim; `Sounds` is the button name you specified, and it is also the dashboard's own card heading |

✅ **NO DESCRIPTIONS AND NO HELPER SENTENCES ANYWHERE IN THE THREE LINES.** The sentences that used to
explain the switches lived in the sheet and went with it — expanding in place means the board itself is
the explanation.

⚠️ **ON LINE 3 THE LABEL IS THE CHIP, NOT A CAPTION BESIDE IT.** `screenOnBtn('Keep the screen on')`
is the SAME function the `hidden sm:block` header mount calls, with a different label argument, and the
sound master is its sibling in shape. That is what fits three controls on one 390px line **without a
word being shortened** — and state is still carried the way it already was, by colour plus the ☀️/🌙
and 🔔/🔕 glyph.

## 3.2 The board is pushed down, not covered

🔴 **`w-full` INSIDE THE HEADER'S OWN `flex-wrap` ROW.** The header is:

```tsx
      <header className="flex flex-wrap content-start items-center gap-x-3 gap-y-2 px-4 py-2.5 … flex-shrink-0">
```

so this is an ordinary flex child claiming the full width: it wraps onto its own line, **the header gets
taller, and the board below — `flex-1 min-h-0` in the page's `h-dvh flex-col` column — shortens by
exactly that height and scrolls within what is left.**

✅ **EXECUTED:** a scan of every line between `{phoneExpanded && (` and `</header>` finds **no
`absolute`, no `fixed`, no `z-`, no backdrop and no scroll lock**. There is no layer over the tickets.

## 3.3 No auto-collapse, and where the state lives

```tsx
  const [phoneExpanded, setPhoneExpanded] = useState(false)
```

| Question | Answer |
|---|---|
| Where does it live? | 🔴 **React state in the KDS page component. No localStorage key was added** |
| Survives re-renders and polls? | ✅ **Yes** — `fetchAll` sets order state and never touches this |
| Survives a reload? | 🔴 **NO. A reload reopens collapsed.** Stated because you said either was acceptable provided I said which |
| Anything auto-collapse it? | ✅ **No.** `setPhoneExpanded` has exactly **one** caller — the toggle's own `onClick`. No effect, no timer, no route change and no poll writes it |

## 3.4 ⚠️ THREE LINES AT 390px — AN ESTIMATE WITH ~6px OF HEADROOM

| Line | Pieces | Estimate |
|---|---|---|
| 1 | List/Grid segment ~104 + Full/Cook ~100 + gap 8 | **~212px** ✅ |
| 2 | `✓ Ready step` ~102 + `💷 Payment & handover` ~150 + gap 8 | **~260px** ✅ |
| 3 | `Keep the screen on` chip ~146 + `New-order sound` chip ~128 + `Sounds` ~62 + two gaps 16 | ⚠️ **~352px of 358px available** |

🔴 **SO: THREE LINES AT 390px ON THIS ARITHMETIC — BUT NOTHING WAS RENDERED OR MEASURED, AND LINE 3
CLEARS BY ~6px.** A wider system font, a larger text size setting, or a 375px/320px phone pushes line 3
onto a fourth line. **I did not shorten a label to buy margin, as instructed.**

**PROPOSED, NOT APPLIED, if hardware shows it wrapping:**
1. ⭐ **Move `New-order sound` into the `Sounds` popup** and leave line 3 as screen + `Sounds`
   (~208px, huge margin). **Cost: the during-service mute goes behind one tap — which is the exact
   thing you ruled against, so this is offered only if the line actually breaks.**
2. **Let line 3 wrap to a fourth line.** No control is lost; the three-line rule is.
3. **Shorten one label** — needs your say-so, which is why it is not here.

---

# STAGE 4 — THE `Sounds` POPUP

## 4.1 🔴 THE DECISION: IT ABSORBS THE NATIVE DEVICE BLOCK. THE `📱` BUTTON DOES NOT COME BACK ON A PHONE.

**Below `sm:` there is now exactly ONE panel on this screen, and `Sounds` opens it.** It holds
which-sounds, due-to-cook, and — on a native, non-demo device — the whole `ThisDeviceSettings` block
behind its unchanged gate.

**The reason, in three parts:**

1. 🔴 **THE `📱` BUTTON IS ALREADY `hidden sm:flex` FROM THE PREVIOUS TASK.** Not absorbing would mean
   putting it back on the phone header — a fourth chip on the row §2.4 shows is already at its limit —
   or leaving van rebinding, default screen, notifications and app-lock **unreachable on a phone**. The
   second is unacceptable and the first undoes this work.
2. ⚠️ **THE CONTENTS ARE THE SAME KIND OF THING.** Which-sounds, default screen, van binding and
   app-lock are all **set once, per device, off the service path**. The during-service controls — the
   sound master, keep-screen-on, the two step switches, the display segments — are on the header, in
   place, over the board. **The split is by when you touch it, not by what it is called.**
3. 🔴 **TWO PANELS ON ONE PHONE IS WHAT THIS WORK WAS REDUCING**, and there is now one.

⚠️ **THE COST, STATED: a button reading `Sounds` opens something that also holds device configuration.**
It is mitigated where it can be — the panel's own heading names both:

```tsx
                <span className="sm:hidden">{isNativeApp() && !isDemo ? 'Sounds & this device' : 'Sounds'}</span>
                <span className="hidden sm:inline">Device settings</span>
```

**On web and in demo the native block does not render and the heading reads plain `Sounds`, which is
then exactly true.** Label-in-Name is satisfied — the button's visible text is contained in its
accessible name; a panel heading is not the button's name and must not under-describe its contents to
match a five-letter chip.

## 4.2 What is inside it, per width

| | Below `sm:` (opened by `Sounds`) | `sm:` and above (opened by `📱`) |
|---|---|---|
| Heading | `Sounds` / `Sounds & this device` | 🔴 `Device settings` — **unchanged** |
| `Sound` sub-heading | hidden (`hidden sm:block`) — the `<h2>` above already says it | ✅ **shown, unchanged** |
| `Keep the screen on` row | 🔴 **removed — it is on line 3** | ✅ **it was `sm:hidden`, so nothing changes here** |
| `New-order sound` master | 🔴 **hidden (`hidden sm:flex`) — it is on line 3** | ✅ **shown, unchanged** |
| which-sounds radios | ✅ shown | ✅ **unchanged** |
| due-to-cook | ✅ shown | ✅ **unchanged** |
| `ThisDeviceSettings` | ✅ shown, gate intact | ✅ **unchanged** |

🔴 **ONE PANEL, TWO OPENERS, ZERO DUPLICATED MARKUP.** `deviceOpen` is the same state it always was; no
new panel and no new state were added.

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint` on the KDS: 21 problems (18 errors, 3 warnings) — IDENTICAL
to the count for this file at HEAD and after every task this session.**

| Required claim | Method |
|---|---|
| Collapsed, the phone header is ONE row | ⚠️ **ESTIMATE, NOT MEASURED — and qualified.** §2.4 gives the arithmetic and names the two cases that wrap. **Nothing was rendered** |
| The toggle shows the state | ✅ **EXECUTED (source)** — the four badge conditions are read straight off `readyOn`, `handoverOn`, `soundEnabled`, `screenHeld`; §2.1 enumerates all twelve reachable combinations and the unreachable one |
| Expanded, THREE lines and no more at 390px | ⚠️ **ESTIMATE — ~352px of 358px on line 3.** §3.4. **Not measured, and the ~6px margin is stated rather than rounded away** |
| Every control reachable, with the wide-width labels | ✅ **EXECUTED (source)** — List/Grid ✅ line 1 · Full/Cook ✅ line 1 · Ready step ✅ line 2 · Payment & handover ✅ line 2 · keep-screen-on ✅ line 3 · sound master ✅ line 3 · which-sounds ✅ popup · due-to-cook ✅ popup · native device config ✅ popup (native, non-demo) · pause ✅ header, untouched · Manage event ✅ event bar, untouched. **The label table in §3.1 was built by grepping the rendered strings and matching each to its header source** |
| The board is pushed down, not covered | ✅ **EXECUTED** — a scan of every line of the expanded block finds no `absolute`, `fixed`, `z-` or backdrop; the block is a `w-full` flex child of a `flex-wrap` header that is `flex-shrink-0` above a `flex-1 min-h-0` board |
| It does not auto-collapse | ✅ **EXECUTED** — `setPhoneExpanded` has exactly one caller in the file, the toggle's `onClick` |
| `sm:` and above is byte-identical | ⚠️ **NOT byte-identical — the file changed. ✅ THE RENDERED OUTPUT IS UNCHANGED, and that is checkable:** every added element is inside `sm:hidden` (the toggle, the three lines) and every removal from the panel was of something already `sm:hidden` (the phone section, the keep-screen-on row). The two `hidden sm:*` additions — the master row and its `<p>` — hide only BELOW `sm:`. **No control that renders at `sm:`+ was added, moved, removed or restyled** |
| The dashboard is untouched | ✅ **EXECUTED** — `app/dashboard/[token]/page.tsx` is **390,931 bytes, byte-for-byte the size recorded at the end of the previous task**, and its mtime (10:15) precedes this task's only write (10:39). It is not in this task's diff. `components/dashboard/UserMenu.tsx`, `components/shared/*` and everything under `app/api` are likewise untouched |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RENDERED, ON ANY DEVICE OR IN ANY BROWSER.** Both width claims are arithmetic.
- 🔴 **THE TWO MARGINS ARE THIN AND ARE NOT ROUNDED AWAY:** line 3 clears 390px by ~6px, and the
  collapsed row exceeds it with a long truck name and three badges.
- **The `line-through` glyph convention is untested on hardware.** ~~`✓`~~ meaning "ready step off" is
  legible in principle; whether a cook reads it that way at a glance is a question for the van.

---

# INTEGRITY

⚠️ **THE "BEFORE" FOR THIS TASK IS THE FIGURE THE PREVIOUS REPORT RECORDED FOR THE SAME FILE**, because
the working tree was already dirty and a working tree has no history; `checkout` is forbidden. **The
class census is ALSO checked against `HEAD`, which is the stricter test.**

```
app/dashboard/[token]/kds/page.tsx
BEFORE (end of the previous task)   209,453 bytes
AFTER                               212,091 bytes · 204,899 chars · 2,878 lines
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 33 distinct classes before, 33 after. NO NEW CLASS, NONE REMOVED**, and the
same 33 as `HEAD` (`added-vs-HEAD: none`, `removed: none`). Occurrences 3,437 → 3,503.
**Carrier-aware on the source: `U+26A0` n=127, 127 paired, ✅ 0 bare.**

🔴 **ONE CHARACTER WAS INTRODUCED AND REMOVED BEFORE THIS REPORT WAS WRITTEN:** `U+2550 ═`, in a
comment rule bar. **Caught by the census pass, rewritten with the `─` the file already carries.** That
is the second task running in which this rule has caught something.

## This report — a SEPARATE pass, run AFTER writing

```
docs/kds-phone-expand-report.md   bytes 24,350
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 33 | 0 | 33 |
| U+26A0 (warning sign — TEXT presentation) | 16 | 16 | 0 |
| U+2705 (check mark button) | 39 | 0 | 39 |
| U+2B50 (star) | 2 | 0 | 2 |
| U+1F4B7 (banknote) | 8 | 0 | 8 |
| U+1F4F1 (mobile phone) | 3 | 0 | 3 |
| U+1F515 (bell with slash) | 9 | 0 | 9 |
| U+1F319 (crescent moon) | 10 | 0 | 10 |
| U+2600 (sun — TEXT presentation) | 1 | 1 | 0 |
| U+2713 (check mark — TEXT presentation) | 9 | 0 | 9 |
| U+25BE (triangle — TEXT presentation) | 2 | 0 | 2 |
| U+25B4 (triangle — TEXT presentation) | 1 | 0 | 1 |

U+26A0 is the only base used as an emoji that has TEXT presentation by default, and every one of
its occurrences is PAIRED with U+FE0F. U+2600, U+2713, U+25BE are bare because they are quoted
from source, where the codebase pairs U+2600 inside JSX and leaves the others bare by design.
The remaining bases have emoji presentation by default, so bare is correct for them.

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
?? docs/kds-phone-expand-report.md
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
| 🔴 `M app/dashboard/[token]/kds/page.tsx` | ⚠️ already `M` before this task; 🔴 **THIS TASK wrote to it — the only source file written** |
| 🔴 `?? docs/kds-phone-expand-report.md` | 🔴 **THIS TASK** — this file |
| `M app/dashboard/[token]/page.tsx`, `M components/shared/EventActionsModal.tsx`, `?? components/shared/ExtraWaitModal.tsx`, `?? docs/kds-view-panel-report.md` | ✅ pre-existing — **the previous task**, and none of them was touched by this one |
| `M app/landing/*`, `M lib/plan-features.ts`, `?? docs/landing-features-move-report.md` | ✅ pre-existing — the landing tasks |
| everything else | ✅ pre-existing — earlier tasks this session and their reports |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
