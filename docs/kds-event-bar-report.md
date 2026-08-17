# KDS event bar — STAGE 1 DIAGNOSIS + STAGE 2 BUILT

**Both stages in this file.** Stage 1's diagnosis is preserved below; Stage 2 was built on your
go-ahead — *"it appears when the event is live. however its missing details as well such as Live. It
should be exactly the same as dashboard with exception colours might be different as white
background."*

`npx tsc --noEmit` passes with no output — **which is not verification.**

**Four files changed:** `lib/event-display.ts` (new), `app/dashboard/[token]/kds/page.tsx`,
`app/dashboard/[token]/page.tsx`, `components/dashboard/AddOrderPanel.tsx`. **No commit, no stage, no
revert, no stash, no clean.** No build, no `next dev`, no `next build`, no `cap sync`, no deploy, no
SQL, no migration. **Nothing under `app/api`. Board filters, the two switches and the persistence are
untouched.**

⚠️ **TWO FILES BEYOND THE KDS WERE TOUCHED, AND THE REASON IS DRY — see "The third copy that wasn't
made".** If you would rather I had duplicated instead, that is one revert away.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# 🔴 THE ROOT CAUSE, CONFIRMED BY YOUR OBSERVATION

**The event line was never removed. It was gated on `activeEvent?.status === 'open'`.** Your *"it
appears when the event is live"* is exactly that gate, observed.

```tsx
      {/* ── Event header when open ── */}
      {activeEvent?.status === 'open' && (
```

🔴 **AND THE ONLY CONTROL THAT OPENED EVENT ACTIONS LIVED INSIDE IT** — so a truck whose event had not
started had no event line, no Event actions, no way to change event, and **no way to press Start
Event.** The shared modal offered `onStartEvent`; reaching it required the event to already be
started.

---

# STAGE 1 — THE SIX ANSWERS

## 1. Does the KDS still render an event line? ✅ **YES — it was never deleted**

**No commit and no uncommitted task removed it.** ⚠️ **N112's justification — *"the header line
directly below it already named the selected event"* — was TRUE ONLY FOR A LIVE EVENT.** The strip it
replaced listed every upcoming event **regardless of status**. **INFERRED: the removal traded an
always-present control for a conditionally-present one, and the condition was never checked.**

## 2. Every condition gating it

| # | Condition | Effect |
|---|---|---|
| 1 | `activeEvent?.status === 'open'` | 🔴 **the whole row, Event actions included** |
| 2 | `!isDemo` | the Event actions half only |

🔴 **"Not started" → NO.** The dashboard's own mapping proves the vocabulary:

```tsx
                  // 'confirmed' (or any not-yet-started status) — NOT finished; pairs with Start Event.
                  <span className="text-xs font-medium text-slate-400 flex-shrink-0">Not started</span>
```

`'confirmed' !== 'open'`. ⚠️ **Nor `'closed'`, nor `'cancelled'`.**
🔴 **`selectedEventId` null → NO** — optional chaining yields `undefined`.

## 3. Event actions on the KDS? **Mounted, but nothing could open it**

**One `setShowEventMenu(true)` existed, inside the `status === 'open'` block.** Every other call was
`(false)`. ✅ **The modal, its props and the picker overlay were all correct and all unreachable.**

## 4. Horizontal overflow — 🔴 REAL, PRE-EXISTING, AND NOT FIXED HERE

```tsx
      <header
        className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0"
```

🔴 **No `flex-wrap`, no `overflow-x-auto`, no `min-w-0`** — and the root clips:

```tsx
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden">
```

**Children in order:** back-link · truck+van · List/Grid · bell · `Marks ready` · `Payment/Collected` ·
mobile-phone chip (native only) · `flex-1` spacer · extra-wait select · Pause *(open-only)* · Screen
on/off.

# 🔴 IT CANNOT WRAP, CANNOT SCROLL, CANNOT TRUNCATE. IT CLIPS.

⚠️ **`flex-1` on the spacer is what turns overflow into clipping**: it absorbs slack when wide and
collapses to zero when narrow, after which the `shrink-0` chips refuse to shrink and the tail — **Screen
on/off, the last child** — is pushed past the edge. ✅ **That matches your `"Screen o…"` exactly.**

**At the three widths — 🔴 INFERRED, NOT MEASURED:** **768px** overflow near-certain; **1024px**
marginal and consistent with your capture; **1366px** likely fits. ⚠️ **Counter-intuitively the worst
case is just above 640px, where `hidden sm:inline` labels appear and the row gets WIDER.**

🔴 **NOT FIXED — you asked for the event bar. Options are listed at the end, unchosen.**

## 5. Any way to change the event? 🔴 **THERE WAS NONE**

The only `setShowEventPicker(true)` is `onChangeEvent` inside the modal, reachable only from the button
inside the gate. ✅ **Now reachable, because the gate is gone.**

## 6. The switch defaults — 🔴 THE STOP CONDITION WAS NOT MET

```ts
  const handoverOn = handoverPref ?? !showPaidStep
  const readyOn = readyPref ?? !handoverOn
```

**`show_paid_step` TRUE, nothing stored → `handoverOn` = FALSE, `readyOn` = TRUE.**
✅ **The unset default is `Marks ready` ON, `Payment/Collected` OFF — one on, one off, not both.**

## 🔴 BUT BOTH-ON REVEALED A REAL DEFECT, AND IT IS SEPARATE FROM THIS TASK

**Both-on requires `hg_kds_readystep_` = `'on'` stored. It cannot arise from defaults.**

**READ — the SUPERSEDED chip's writer, quoted in `docs/kds-ready-toggle-report.md`:**

```ts
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(`hg_kds_readystep_${token}`, readyStepOn ? 'on' : 'off')
  }, [readyStepOn, token])
```

🔴 **NO NULL GUARD. IT RAN ON MOUNT AND WROTE THE DEFAULT `'on'`.** Every device that loaded that
uncommitted build has the key set **without anyone touching the chip.**

⚠️ **THE C1–C3 CHECKS WERE CORRECT AND STILL MISSED IT.** They asked whether the key existed in
**HEAD** — the right question for "has this shipped", the wrong one for "is this dev device clean",
because the dev device ran the working tree. **INFERRED: `git show HEAD:` proves what users have; it
proves nothing about what a machine that ran the uncommitted tree has in its localStorage.**

🔴 **CONSEQUENCE: the migration built last task will NOT fire on your test devices**, because its
precondition is "both keys unset". **Clearing `hg_kds_readystep_<token>` on the device is the only way
to see the true unset default. I have not done it — that is a device action.**

---

# STAGE 2 — WHAT WAS BUILT

## The bar, in full

```tsx
      {activeEvent && (
        <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-100 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-slate-900 truncate">
              {'\u{1F4CD}'} {fmtVenue(activeEvent.venue_name, activeEvent.town)} · {formatTime(activeEvent.start_time)}–{formatTime(activeEvent.end_time)}
            </span>
            {activeEvent.event_date && !isDemo && (
              <span className="hidden sm:block text-xs font-medium text-slate-500 truncate mt-0.5">{'\u{1F4C5}'} {eventDateLabel(activeEvent.event_date)}</span>
            )}
          </div>
          {isPaused ? (
            <span className="text-xs font-medium text-amber-600 flex-shrink-0">⏸ Paused</span>
          ) : activeEvent.status === 'open' ? (
            <span className="text-xs font-medium text-green-600 flex-shrink-0">● Live</span>
          ) : activeEvent.status === 'closed' ? (
            <span className="text-xs font-medium text-slate-500 flex-shrink-0">● Finished</span>
          ) : activeEvent.status === 'cancelled' ? (
            <span className="text-xs font-medium text-red-600 flex-shrink-0">Cancelled</span>
          ) : (
            // 'confirmed' (or any not-yet-started status) — NOT finished; pairs with Start Event.
            <span className="text-xs font-medium text-slate-500 flex-shrink-0">Not started</span>
          )}
          {!isDemo && (
            <button onClick={() => { setEventNoteInput(activeEvent.customer_note || ''); setShowEventMenu(true) }}
              className="flex-shrink-0 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:border-slate-400 font-semibold">
              <span className="hidden sm:inline">Event actions </span>▾
            </button>
          )}
        </div>
      )}
```

⚠️ **The pin and calendar glyphs are written as escapes ABOVE ONLY, so this report does not itself
gain those character classes. The source file carries the literal characters, copied from the
dashboard.**

## Against the dashboard, element by element

| Element | Dashboard | KDS now | Same? |
|---|---|---|---|
| Venue + times | pin `{fmtVenue(…)} · {formatTime(start)}–{formatTime(end)}` | **identical expression** | ✅ |
| Date line | calendar `{eventDateLabel(…)}`, `hidden sm:block`, demo-hidden | **identical** | ✅ |
| Paused | `⏸ Paused` | `⏸ Paused` | ✅ word-for-word |
| Open | `● Live` | `● Live` | ✅ **the missing detail you named** |
| Closed | `● Finished` | `● Finished` | ✅ |
| Cancelled | `Cancelled` | `Cancelled` | ✅ |
| Otherwise | `Not started` | `Not started` | ✅ |
| Branch ORDER | paused → open → closed → cancelled → else | **identical** | ✅ |
| Event actions | `Event actions ▾` | `Event actions ▾`, `hidden sm:inline` | ⚠️ **see below** |

## 🔴 THE ONLY DIFFERENCES, ALL DELIBERATE

| Difference | Why |
|---|---|
| **Colours: `-400` → `-600`/`-500`** | 🔴 **exactly your exception.** This header is `bg-white`; the dashboard's is dark. `text-green-400` on white is unreadable, so each status keeps its HUE and gains contrast: green→`-600`, amber→`-600`, red→`-600`, slate→`-500`. **Same words, same order, same meaning.** |
| The venue line is `text-slate-900`, not `text-white` | same reason |
| **Event actions is the KDS's light chip, not the dashboard's dark one** | a dark chip on a white header would be the loudest thing on a kitchen screen. ⚠️ **Label and glyph are identical.** |
| **`hidden sm:inline` on the label** | pre-existing KDS behaviour, kept — this header is tighter (Q4) |
| **No demo padlock variant** | the KDS hides Event actions in demo; the dashboard shows a locked chip. **Pre-existing, unchanged, not in scope.** |
| **No "No event selected" fallback** | the dashboard has one; the KDS renders nothing when `activeEvent` is null. **Pre-existing.** ⚠️ **Worth a decision later — see the residuals.** |

## 🔴 THE GREEN DOT IS GONE, AND THAT WAS NECESSARY

The old row led with `<span className="w-2 h-2 rounded-full bg-green-500" />` — a dot that **silently
meant "open"**, which was safe only because the row rendered for nothing else. **Rendering for every
status would have made it a lie.** ✅ **Replaced by the dashboard's own status vocabulary, which says
the word.**

## The third copy that wasn't made

🔴 **`fmtVenue` existed BYTE-IDENTICALLY in two files** — `app/dashboard/[token]/page.tsx` and
`components/dashboard/AddOrderPanel.tsx` — **and the KDS bar would have been a third.**
**`eventDateLabel` existed once, inside the dashboard component.**

✅ **Both now live in `lib/event-display.ts`, imported by all three surfaces.**

```
$ grep -rn "function fmtVenue" app components lib
lib/event-display.ts:17:export function fmtVenue(venueName?: string | null, town?: string | null): string {
```

⚠️ **THAT IS WHY TWO FILES BEYOND THE KDS ARE IN THE DIFF.** Both edits are pure removals plus one
import each — **the function bodies moved verbatim, em dash and containment test included, because the
dashboard's bar is the reference rendering and any difference would show as two surfaces disagreeing
about the same event.** ⚠️ **`getLocalDateInTz` is still used twice in the dashboard, so its import
stays.**

## The constraints, checked

| Constraint | Status |
|---|---|
| `seededRef` / `setSelectedEventId` untouched | ✅ **The seed effect is byte-identical.** The two diff lines mentioning `seededRef` are **comments from an earlier task**, verified by reading them |
| Do not fork `EventActionsModal` | ✅ **Not touched.** `canStart = status === 'confirmed' \|\| 'closed'` already lives inside it, so **Start / Restart Event now appears with no change to the component** |
| Board filters, switches, persistence, `app/api` | ✅ untouched |
| Header overflow | 🔴 **NOT ADDRESSED — options below** |

⚠️ **ONE THING NOW REACHABLE THAT NEVER WAS: `onChangeEvent` → `switchEvent` on a NON-OPEN event.**
N112 names the seed as the thing most worth re-checking whenever this menu changes. **The seed is
untouched, but this path is newly reachable and has never been exercised in that state.**

---

# 🔴 VERIFICATION

**`tsc` passing is NOT verification and is not counted.**

| Item | Method |
|---|---|
| The old gate was `status === 'open'` | ✅ **EXECUTED** — literal match before the edit |
| Only one `setShowEventMenu(true)`, inside that gate | ✅ **EXECUTED** — scan |
| Only one `setShowEventPicker(true)`, inside the modal | ✅ **EXECUTED** — scan |
| Header has no wrap/overflow class; root is `overflow-hidden` | ✅ **EXECUTED** — literal match |
| `fmtVenue` now exists exactly once | ✅ **EXECUTED** — repo-wide scan |
| Seed effect byte-identical; both diff hits are comments | ✅ **EXECUTED** — `git diff` + read |
| Census, byte scan, carrier | ✅ **EXECUTED** |
| **The bar renders for a "Not started" event** | 🔴 **SOURCE READ ONLY — NOT OBSERVED** |
| **`● Live` renders for an open event** | 🔴 **SOURCE READ ONLY** |
| **Event actions opens, and Start Event appears** | 🔴 **SOURCE READ ONLY — NOT CLICKED** |
| **The colours are readable on white** | 🔴 **NOT OBSERVED — no rendering was done** |
| **Widths at 768/1024/1366** | 🔴 **INFERRED FROM CLASSES, NOT MEASURED** |
| **The bar does not itself overflow** | 🔴 **SOURCE READ ONLY.** ⚠️ It has `flex-1 min-w-0` + `truncate`, so it *should* truncate rather than clip — **the opposite of the header — but that is a reading, not an observation** |

---

# RESIDUALS — REPORTED, NOT ACTED ON

1. 🔴 **The header still clips at iPad widths (Q4).** Options, unranked: **`flex-wrap`** (two rows,
   board loses height, no control moves) · **`overflow-x-auto`** (one row, controls behind an
   undiscoverable swipe on a touch screen) · **move controls into the event bar or a menu** (largest
   change) · **drop `shrink-0` from the switches** (smallest diff, truncates the newest controls) ·
   **raise the label breakpoint from `sm:` to `md:`/`lg:`** (shortens the row exactly where it breaks,
   no layout change). **Recommending none.**
2. ⚠️ **No "No event selected" state on the KDS**, where the dashboard has one with a Select-event
   button. With no event, the KDS shows no bar and no route to pick one.
3. ⚠️ **Demo shows no Event actions at all**, where the dashboard shows a locked chip with an
   explainer.
4. 🔴 **`hg_kds_readystep_` holds a stale `'on'` on every dev device** (Q6) — **a defect of the earlier
   task, deliberately not fixed here.**
5. ⚠️ **`fmtVenue` in `AddOrderPanel` was migrated, not left** — that file is on the money screen, and
   the change is a removal plus an import. **Flagged because it was not in the original scope.**

---

# INTEGRITY

## Non-ASCII class census, before and after

### `app/dashboard/[token]/kds/page.tsx` — 33 classes BEFORE, **34 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| **U+1F4C5 CALENDAR** | 0 | 1 | 🔴 **+1, NEW** | **the date-line glyph, copied verbatim from the dashboard's bar** |
| **U+2013 EN DASH** | 0 | 1 | 🔴 **+1, NEW** | **the `–` between the two times, copied verbatim from the dashboard** |
| **U+22EF MIDLINE ELLIPSIS** | 1 | 0 | 🔴 **−1, LOST** | it survived only in a comment inside the block that was replaced |
| U+1F4CD ROUND PUSHPIN | 1 | 2 | +1 | the venue prefix, from the dashboard |
| U+25CF BLACK CIRCLE | 1 | 3 | +2 | `● Live` and `● Finished`, from the dashboard |
| U+23F8 DOUBLE VERTICAL BAR | 1 | 2 | +1 | `⏸ Paused`, from the dashboard |
| U+00B7 MIDDLE DOT | 9 | 11 | +2 | the `·` separator |
| U+25BE DOWN TRIANGLE | 3 | 1 | −2 | two were in removed comments; the `▾` on the button remains |
| U+1F534 · U+2014 · U+2500 | 62 / 182 / 1507 | 63 / 185 / 1449 | +1 / +3 / −58 | comment prose and rules |
| U+26A0 | 48 | 50 | +2 | caveats — **both paired** |
| U+FE0F | 48 | 50 | +2 | ✅ **matches the U+26A0 delta exactly** |

🔴 **TWO CLASSES GAINED, ONE LOST — DECLARED.** ⚠️ **Both gains are characters the dashboard's bar
already uses, and the whole instruction was "exactly the same as dashboard". Omitting them would have
meant NOT matching it.** ✅ **Both were copied from the dashboard source, not retyped.**

### `app/dashboard/[token]/page.tsx` — 53 → **53.** ✅ **No class changed at all** (pure code removal).
### `components/dashboard/AddOrderPanel.tsx` — 36 → **36.** Only `U+2014` 220 → 219, the em dash inside the removed `fmtVenue`.
### `lib/event-display.ts` — NEW, 7 classes, **all present in its parents**: `U+00A7 U+00B7 U+1F534 U+2014 U+2500 U+26A0 U+FE0F`.

## Carrier-aware check — edited files

| File | Base | BEFORE | AFTER | Verdict |
|---|---|---|---|---|
| KDS | U+26A0 | 48 / 47 / **1 bare** | 50 / 49 / **1 bare** | ✅ unchanged |
| dashboard | U+26A0 | 78 / 75 / **3 bare** | 78 / 75 / **3 bare** | ✅ unchanged |
| AddOrderPanel | U+26A0 | 44 / 41 / **3 bare** | 44 / 41 / **3 bare** | ✅ unchanged |
| `lib/event-display.ts` | U+26A0 | *(new)* | 4 / **4** / **0 bare** | ✅ all paired |

🔴 **Every pre-existing bare U+26A0 count is unchanged. Every warning sign added is paired.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. All four written files, plus this report in a SEPARATE pass.**

```
  lib/event-display.ts                                    3,256  offending=0  CR=0   (new)
  app/dashboard/[token]/kds/page.tsx                    129,581  offending=0  CR=0   (was 128,968)
  app/dashboard/[token]/page.tsx                        390,443  offending=0  CR=0   (was 391,343)
  components/dashboard/AddOrderPanel.tsx                170,249  offending=0  CR=0   (was 170,492)
  docs/kds-event-bar-report.md      (SEPARATE PASS)      21,306  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 38 | 0 | 38 |
| U+1F534 LARGE RED CIRCLE | 38 | 0 | 38 |
| U+26A0 WARNING SIGN | 22 | **22** | **0** |
| U+23F8 DOUBLE VERTICAL BAR | 4 | 0 | 4 |

**Every warning sign is paired; ZERO are bare — 22 of 22.** The file's total U+FE0F count is **22**,
which accounts for all of them and leaves none attached to any other base. ⚠️ **The three unpaired
bases are each internally consistent (0 of 38, 0 of 38, 0 of 4), so no base is split across two
renderings.** ✅ **The pin and calendar glyphs were written as `\u{…}` escapes in the quoted JSX above,
so this report does NOT carry those classes — only the source file does.**

## `git status --porcelain`

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/DemoGetStarted.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M docs/reference-manual.md
?? components/shared/CuisinePicker.tsx
?? components/shared/EventActionsModal.tsx
?? components/shared/EventFinishTimeModal.tsx
?? docs/cuisine-field-report.md
?? docs/extend-removal-report.md
?? docs/finish-time-dry-report.md
?? docs/kds-event-bar-report.md
?? docs/kds-exit-point-report.md
?? docs/kds-ready-toggle-report.md
?? docs/kds-step-switches-report.md
?? docs/kds-steps-model-report.md
?? docs/kds-toggles-review-report.md
?? docs/kds-two-switches-build-report.md
?? docs/kds-two-switches-report.md
?? docs/kds-view-removal-report.md
?? lib/event-display.ts
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **PARTLY** — six earlier tasks; **this task added the event bar** |
| `M app/dashboard/[token]/page.tsx` | ⚠️ **PARTLY** — **this task removed its two local helpers** |
| `?? lib/event-display.ts` | 🔴 **THIS TASK** |
| `M components/dashboard/AddOrderPanel.tsx` | 🔴 **THIS TASK — its first change; not previously in the diff** |
| `?? docs/kds-event-bar-report.md` | 🔴 **THIS TASK** |
| `M app/manage/[token]/page.tsx` · `M components/DemoGetStarted.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/dashboard/OrderCard.tsx` | ✅ pre-existing |
| `M docs/reference-manual.md` | ✅ pre-existing — V11.22 |
| `?? components/shared/CuisinePicker.tsx` · `EventActionsModal.tsx` · `EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/*.md` (ten earlier reports) | ✅ pre-existing |

⚠️ **EIGHT TASKS' WORK IS NOW UNCOMMITTED, ACROSS SEVEN SOURCE FILES.**
