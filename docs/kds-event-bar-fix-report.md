# KDS: event bar, header wrap, and a card-display toggle

**Three fixes, one file.** `npx tsc --noEmit` passes with no output — **which is not verification.**

**ONE file changed by this task: `app/dashboard/[token]/kds/page.tsx`.** `OrderCard.tsx` was **not**
needed and **not** touched. No commit, no stage, no revert, no stash, no clean. No build, no `next
dev`, no `next build`, no `cap sync`, no deploy, no SQL, no migration. **Nothing under `app/api` or
`lib/payments`.**

⚠️ **`docs/kds-event-bar-report.md` was read first. Its diagnosis is accepted and not re-litigated.**

# 🔴 ONE ITEM STOPPED, AS THE BRIEF INSTRUCTS — THE STATUS LABELS

**The brief says to reuse the dashboard's status mapping and, failing that, to stop rather than write a
second copy.** **READ — the dashboard's mapping is INLINE JSX in `app/dashboard/[token]/page.tsx`, not
a function, not exported:**

```tsx
                  <span className="text-xs font-medium text-amber-400 flex-shrink-0">⏸ Paused</span>
…
                  <span className="text-xs font-medium text-green-400 flex-shrink-0">● Live</span>
…
                  <span className="text-xs font-medium text-slate-400 flex-shrink-0">● Finished</span>
…
                  <span className="text-xs font-medium text-slate-400 flex-shrink-0">Not started</span>
```

🔴 **EXTRACTING IT REQUIRES EDITING `app/dashboard/[token]/page.tsx`, WHICH THIS BRIEF FORBIDS** —
*"Touch only `app/dashboard/[token]/kds/page.tsx` unless a fix genuinely requires `OrderCard.tsx`."*

⚠️ **AND A SECOND COPY ALREADY EXISTS — I WROTE IT LAST TASK, BEFORE THIS RULE WAS GIVEN.** So the
choice was not "extract or duplicate" but "extract (out of scope) or leave the existing duplicate".
**I left it, and I am flagging it rather than quietly keeping it.** ✅ **Nothing new was duplicated
this task.**

**To close it, say the word and I will lift the four branches into `lib/event-display.ts` beside
`fmtVenue` and `eventDateLabel`, which is one import each side.**

⚠️ **ONE WORDING DISCREPANCY IN THE BRIEF, FLAGGED NOT RESOLVED:** it lists the labels as *"Not
started", "Live", "Paused", "Closed"* — **the dashboard's actual word for `'closed'` is `● Finished`,
not "Closed".** I matched the dashboard, since the instruction was to use its mapping.

---

# FIX 1 — THE EVENT BAR

## What was already done last task, and what this task added

| Element | State before this task | Now |
|---|---|---|
| Gate `activeEvent` non-null, any status | ✅ done last task | unchanged |
| Venue name · time range | ✅ done | unchanged |
| Date line, dashboard format | ✅ done — **`eventDateLabel` reused from `lib/event-display.ts`** | unchanged |
| Status label | ✅ done — dashboard's words and branch order | unchanged, **duplicate flagged above** |
| `Event actions ▾` outside the status gate | ✅ done | unchanged |
| 🔴 **Status dot, coloured per status** | 🔴 **MISSING — removed entirely last task** | ✅ **ADDED** |

## The dot — READ, as written

```tsx
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isPaused ? 'bg-amber-500'
              : activeEvent.status === 'open' ? 'bg-green-500'
              : activeEvent.status === 'cancelled' ? 'bg-red-500'
              : 'bg-slate-300'
          }`} />
```

🔴 **THE OLD DOT WAS HARDCODED GREEN, AND THAT WAS ONLY HONEST WHILE THE ROW RENDERED FOR `'open'`
ALONE.** With the row now rendering for every status, a fixed green dot would have contradicted the
words beside it — which is why last task removed it rather than leaving it lying. **It is back,
carrying the same distinction the label does.**

✅ **`isPaused` wins over `'open'`, exactly as it does in the label chain**, so dot and label cannot
disagree. ⚠️ **Colours are the dashboard's hues shifted for a white header, the same shift the labels
take.** ⚠️ **`'closed'` and `'confirmed'` share `bg-slate-300` — the dashboard also gives both
`text-slate-400`, so the dot is no less specific than the label it sits beside.**

✅ **`Pause orders` is untouched and still gated `activeEvent?.status === 'open'`**, as instructed.

---

# FIX 2 — THE HEADER WRAPS INSTEAD OF CLIPPING

**READ — before:**

```tsx
        className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0"
```

**READ — after:**

```tsx
        className="flex flex-wrap content-start items-center gap-x-3 gap-y-2 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0"
```

✅ **`paddingTop: 'max(0.625rem, env(safe-area-inset-top))'` is UNCHANGED** — it is what keeps the
header below the iOS status bar.
✅ **The back link and the truck/van name are the first two children and stay on line one.**
✅ **No horizontal scroll**, as instructed — a control behind a swipe on an unattended kitchen screen
is a control an operator cannot find.

## 🔴 THE SECOND CHANGE THE WRAP REQUIRED — THE SPACER

**READ:**

```tsx
        <div className="flex-1 basis-0" />
```

⚠️ **`flex-1` alone has an `auto` basis.** On a **nowrap** row that is harmless — it simply absorbs
slack. On a **wrapping** row it lets the spacer claim width and push the next chip onto a new line
while space still remains, producing a ragged break at widths that would otherwise fit. **`basis-0`
makes it take only leftover slack and vanish when there is none, which is what a spacer should do.**
🔴 **Without this the wrap would have "worked" and still looked broken.**

## At the three widths — 🔴 INFERRED FROM CLASSES, NOT MEASURED

| Width | Before | After |
|---|---|---|
| **641px** | 🔴 **worst case — every `hidden sm:inline` label appears at once; clipped** | ✅ **wraps to 2–3 lines, nothing lost** |
| **768px** | 🔴 clipped | ✅ wraps |
| **1024px** | ⚠️ marginal — matched your capture | ✅ wraps if needed, else one line |
| ≥1366px | ✅ fitted | ✅ unchanged, one line |

⚠️ **The board loses whatever height a wrapped line takes** (`gap-y-2` + chip height ≈ 38px per extra
line). **That is the trade `flex-wrap` makes and it is visible rather than silent, which is the point.**

---

# FIX 3 — THE CARD-DISPLAY TOGGLE

## 🔴 THE SPLIT — THE LOAD-BEARING CHANGE

```ts
  const boardMode: KdsView = handoverOn ? 'window' : 'cook'
  const cardMode: KdsView = cardModePref ?? boardMode
```

```ts
  const displayOrders = (boardMode === 'cook' ? (boardKeepsReady ? activeOrders : cookOrders) : windowOrders)
```

```ts
  const cardViewMode = cardMode
```

# ✅ `displayOrders` READS `boardMode` AND NEVER `cardMode`. VERIFIED BY SCAN.

**Every occurrence of `cardMode` in the file:** its own declaration, the `cardModePref` state, the
`cardViewMode` assignment, and the two control buttons' active-state checks. 🔴 **It appears in no
filter, no `.filter(`, no slice, no bucket.** ✅ **And `activeView` no longer exists — a scan for
`activeView === ` returns nothing, so no consumer can silently read the old conflated value.**

✅ **`boardKeepsReady` is unchanged and still applied on both paths.**

## What each drives

| Value | Drives |
|---|---|
| **`boardMode`** | `displayOrders`, the "To make" pill bar, the "Done today" strip |
| **`cardMode`** | `cardViewMode` → `OrderCard`'s `viewMode` → `showPrices`, `partPaidRow`, header shape, padding, item grouping, type size |

⚠️ **The To-make bar and the Done strip stay on `boardMode`, unchanged from the previous build, as
instructed — the card toggle does not hide them.** **READ, the comment left at each:**

```tsx
      {/* ⚠️ ON boardMode, DELIBERATELY — the card toggle must not hide it. Unchanged from the
          previous build; whether it should be ungated is a separate decision. */}
```

## The control — beside List/Grid, not beside the switches

```tsx
          <div className="w-px h-4 bg-slate-300 mx-1" />
          <button
            onClick={() => setCardMode('window')}
            title="Full cards — prices and payment details, as the hatch sees them."
…
            Full
          </button>
          <button
            onClick={() => setCardMode('cook')}
            title="Cook cards — bigger type, grouped by category, no prices."
…
            Cook
          </button>
```

✅ **Same segmented shape as List/Grid, in the same container, behind the same divider style the
Window/Cook pair used to sit behind.** ⚠️ **Placed there deliberately: it changes how a card looks and
nothing about which orders exist, so putting it beside the step switches would imply it moves
tickets.**

## Storage — and the rule

```ts
  const [cardModePref, setCardModePref] = useState<KdsView | null>(() => {
    if (typeof window === 'undefined') return null
    const v = localStorage.getItem(`hg_kds_cardmode_${token}`)
    return v === 'window' || v === 'cook' ? v : null
  })
  const setCardMode = useCallback((next: KdsView) => {
    setCardModePref(next)
    try { localStorage.setItem(`hg_kds_cardmode_${token}`, next) } catch { /* private mode — resets next session */ }
  }, [token])
```

# 🔴 THE RULE, STATED AS THE BRIEF REQUIRES

**A preference that moves the BOARD is dual-written to localStorage AND Capacitor Preferences, and
reconciled with Preferences winning. A preference that only changes APPEARANCE is localStorage only.**

**The reason is the failure each one can cause.** The two step switches decide which orders leave the
screen, so losing one to a WKWebView cold kill would silently change what a kitchen can see — that is
worth the async reconcile and the `boardKeepsReady` guard around it. **This one decides how a card
looks. A one-frame flash of the wrong card size is cosmetic and self-corrects on the next paint; a
one-frame flash of the wrong board membership is not.** ⚠️ **Pairing them would blur the distinction
that makes the dual write meaningful — if everything is dual-written, the mechanism stops signalling
which preferences are dangerous.**

✅ **A NEW KEY, `hg_kds_cardmode_<token>`.** 🔴 **`hg_kds_view_` was NOT reused: the one-time migration
reads that key, and a second meaning would make a display choice look like a migration input.**

✅ **TRI-STATE PRESERVED.** `null` = never chosen ≠ chose `'window'`. Unset follows `boardMode`, so a
making screen shows Cook cards and a handover screen shows Full **before anyone touches the control**;
pressing either button commits a choice that then overrides it. ⚠️ **Collapsing the tri-state would
freeze a making screen on Full cards the first time anyone glanced at the control.**

## Gating

✅ **`can('cook_screen')` is untouched, and this control is NOT gated on it.**
🔴 **REPORTED AS REQUIRED: the making screen remains available on every plan.** Both former call sites
went with the Window/Cook control last task; the flag now gates nothing reachable on the KDS, and a
Starter or Pro truck can render cook cards and a making board.

---

# INVARIANTS

| | Status | Evidence |
|---|---|---|
| `seededRef` / `setSelectedEventId` untouched | ✅ | the seed effect is byte-identical; no diff line this task touches either identifier |
| `EventActionsModal` not forked | ✅ | not opened for edit |
| Two switches, keys, dual write, defaults untouched | ✅ | `handoverOn` / `readyOn` / `writePref` / the reconcile are unchanged |
| Board filters only repointed at `boardMode` | ✅ | `cookOrders`, `windowOrders`, `boardKeepsReady`, `MAX_GRID_VISIBLE`, `doneOrders`, the overlay all unchanged |
| Nothing under `app/api` / `lib/payments` | ✅ | one file in the diff for this task |
| Nothing unasked changed | ⚠️ | **one addition: `basis-0` on the spacer, which FIX 2 requires — explained above** |

---

# 🔴 VERIFICATION

**`tsc` passing is NOT verification and is not counted.**

| Item | Method |
|---|---|
| `displayOrders` reads `boardMode` only | ✅ **EXECUTED** — literal match |
| `cardMode` reaches no filter | ✅ **EXECUTED** — every occurrence enumerated |
| `activeView` fully gone | ✅ **EXECUTED** — `activeView === ` returns nothing |
| Seed effect byte-identical | ✅ **EXECUTED** — read after the edits |
| Dashboard status labels are inline, not exported | ✅ **EXECUTED** — scan |
| One file changed | ✅ **EXECUTED** — `git diff --stat` |
| Census, byte scan, carrier | ✅ **EXECUTED** |
| **The event bar renders on a `'confirmed'` event** | 🔴 **SOURCE READ ONLY — NOT OBSERVED** |
| **Event actions opens from it; Start Event is reachable** | 🔴 **SOURCE READ ONLY — NOT CLICKED** |
| **The header does not clip at 641 / 768 / 1024px** | 🔴 **INFERRED FROM CLASSES — NOT MEASURED.** No browser was opened |
| **Toggling Full/Cook changes the card and leaves the board identical** | 🔴 **SOURCE READ ONLY.** The scan proves `cardMode` reaches no filter, which is an argument, not an observation |
| **The switches still change board membership as built** | 🔴 **SOURCE READ ONLY** |
| **The dot colours read correctly on white** | 🔴 **NOT OBSERVED** |

⚠️ **AND THE LIVE-TRUCK LIMIT STILL HOLDS: both trucks are `kds_mode` false, so the Waiting treatment
and status `'cooking'` remain unobservable; and `hg_kds_readystep_` holds a stale `'on'` on every dev
device (previous report, Q6), which is unfixed and will make the switches read as both-on.**

---

# INTEGRITY

## Non-ASCII class census — `app/dashboard/[token]/kds/page.tsx`

**34 classes BEFORE, 34 AFTER. No class gained, none lost.**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 63 | 71 | **+8** | headline markers in the new comments |
| U+2014 EM DASH | 185 | 200 | **+15** | prose |
| U+2500 BOX DRAWINGS | 1449 | 1627 | **+178** | five new comment rules |
| U+26A0 WARNING SIGN | 50 | 62 | **+12** | caveats — **all 12 paired** |
| U+FE0F VAR SELECTOR-16 | 50 | 62 | **+12** | ✅ **matches the U+26A0 delta exactly** |
| *all 29 others* | — | — | **0** | unchanged — including `U+1F4C5`, `U+1F4CD`, `U+2013`, `U+25CF`, `U+23F8`, the event bar's glyphs |

✅ **The Full/Cook control introduced NO non-ASCII character at all — both labels are plain ASCII.**

## Carrier-aware check — the edited file

| Base | BEFORE n / paired / bare | AFTER n / paired / bare | Verdict |
|---|---|---|---|
| U+26A0 | 50 / 49 / **1** | 62 / 61 / **1** | ✅ **bare unchanged** |
| U+2705 | 2 / 0 / 2 | 2 / 0 / 2 | ✅ |
| U+2713 | 4 / 0 / 4 | 4 / 0 / 4 | ✅ |
| U+1F534 | 63 / 0 / 63 | 71 / 0 / 71 | ✅ consistent |

🔴 **The one bare U+26A0 is pre-existing and unchanged.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. The written file, plus this report in a SEPARATE pass.**

```
  app/dashboard/[token]/kds/page.tsx                    137,463  offending=0  CR=0   (was 129,581)
  docs/kds-event-bar-fix-report.md  (SEPARATE PASS)      17,689  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 48 | 0 | 48 |
| U+1F534 LARGE RED CIRCLE | 25 | 0 | 25 |
| U+26A0 WARNING SIGN | 18 | **18** | **0** |
| U+23F8 DOUBLE VERTICAL BAR | 1 | 0 | 1 |
| U+25CF BLACK CIRCLE | 3 | 0 | 3 |

**Every warning sign is paired; ZERO are bare — 18 of 18.** The file's total U+FE0F count is **18**,
which accounts for all of them and leaves none attached to any other base. ⚠️ **The four unpaired
bases are each internally consistent (0 of 48, 0 of 25, 0 of 1, 0 of 3), so no base is split across
two renderings** — the pause and circle glyphs are quoted from the dashboard's own labels and are bare
there too.

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
?? docs/kds-event-bar-fix-report.md
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
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **PARTLY** — seven earlier tasks; **this task made the three fixes** |
| `?? docs/kds-event-bar-fix-report.md` | 🔴 **THIS TASK — the only new entry** |
| `M app/dashboard/[token]/page.tsx` · `M components/dashboard/AddOrderPanel.tsx` · `?? lib/event-display.ts` | ✅ pre-existing — **last task's `fmtVenue` extraction** |
| `M app/manage/[token]/page.tsx` · `M components/DemoGetStarted.tsx` · `?? components/shared/CuisinePicker.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/dashboard/OrderCard.tsx` | ✅ pre-existing — the step switches |
| `M docs/reference-manual.md` | ✅ pre-existing — V11.22 |
| `?? components/shared/EventActionsModal.tsx` · `EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/*.md` (eleven earlier reports) | ✅ pre-existing |

⚠️ **NINE TASKS' WORK IS NOW UNCOMMITTED, ACROSS SEVEN SOURCE FILES.**
