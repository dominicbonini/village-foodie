# Time-list dots — a time blocked by an overlapping batch reads full, and a settings hint says why

**Date:** 18 September 2026 · Display only · Localhost only; nothing deployed, nothing committed, nothing staged.
**Files changed:** `lib/slot-availability.ts`, `lib/slot-display.ts`, `lib/slot-interval.ts` (untracked),
`components/dashboard/AddOrderPanel.tsx`, `app/dashboard/[token]/page.tsx`, `app/manage/[token]/page.tsx`.
**Harnesses:** new `scripts/dot-overlap-labels.cjs`, `scripts/collection-times-hint.cjs`; re-targeted (never
weakened) `scripts/slot-interval-settings.cjs`, `scripts/slot-interval-event-override.cjs`,
`scripts/slot-interval-dots.cjs`, `scripts/add-order-fit-message.cjs`, `scripts/_batch-rolling-snapshot.cjs`,
`scripts/batch-reservation-golden-on.cjs`, `scripts/_batch-reservation-golden-on-generate.cjs` (the generator was
edited for consistency and **not run**); `scripts/harnesses.json` lists 47.
**Scripts run:** `node scripts/run-harnesses.cjs` and the harnesses named here, individually. `scripts/` was never
globbed. No golden generator was run. No live truck's token, device id, page, route or API was touched.

**No span of the prompt arrived garbled.** One tension between two instructions was resolved without choosing
against either — see R2/§2.4 (the customer page has neither colour nor labels, so "colour follows the rule" lands on
`/api/slots`' `tone` field, which nothing customer-facing renders, while `available` — the field the customer's
empty-basket list gates on — keeps today's read, so the times offered do not move).

---

## STEP 0 — the gate, and `git status`

**The gate failed and I stopped.** All seven named files showed uncommitted changes (the branch is still at
`fc0fddc`; nothing from this workstream has been committed or deployed). Dominic answered **"2 proceed"** — build
on the uncommitted tree. So every "today" in this report is the working tree as it stood before this task
(the P3 batch reservations, the edit-lock and refresh work), not HEAD. Where a harness compares against
**HEAD** it says so.

### Before
Branch `main`, up to date with `origin/main`, nothing staged: 37 modified, 81 untracked — the full listing is
the one in `docs/edit-lock-and-refresh-report.md` §STEP 0 "After" plus that report.

### After
Identical, plus:

| Path | State |
|---|---|
| `lib/slot-availability.ts`, `lib/slot-display.ts`, `components/dashboard/AddOrderPanel.tsx`, `app/dashboard/[token]/page.tsx`, `app/manage/[token]/page.tsx` | modified (already ` M`) |
| `lib/slot-interval.ts` | untracked already; the hint helper added |
| `scripts/dot-overlap-labels.cjs`, `scripts/collection-times-hint.cjs` | **new**, untracked |
| `scripts/harnesses.json` | 47 harnesses |
| `docs/dot-overlap-labels-report.md` | **new** — this file |

`git add -A` / `git add .` were not run. Nothing staged, committed, stashed, reset or restored. 121 entries, 0 staged.

---

## READ FIRST — R1 to R4

### R1 — how each surface built its dot colour and label (before this task)

**The engine read every dot used.** `lib/slot-display.ts` `buildSlotIndicators`:

```ts
    const w = intervalMins > 5
      ? coverDotWindows(back, slotM, prevOf(slotM), step, eventStartMins)
      : (back.pileByStart.get(slotM) ?? back.byStart.get(slotM - step) ?? null)
    const tone: SlotTone = w?.tone ?? 'green'   // engine's tone: batch denominator + capacity ceiling
```
and the label is that window's composition: `Object.entries(w.byCat) … "${count} ${display}"`, joined. So the dot
at T read **one** window — the one keyed `T − step` (the pile at the event-start slot; `coverDotWindows` on a
10–30 grid) — and nothing that merely overlapped it.

- **Add Order list** — `AddOrderPanel`: `slotIndicators = buildSlotIndicators(manualSlots, …)`; the option:
  `{s.collection_time} {ind.emoji}{ind.overTotal > 0 ? '❗' : ''}{ind.label ? \` ${ind.label}\` : ''}{wontFit ? (ind.label ? ' · Order won’t fit' : ' – Order won’t fit') : ''}`.
- **Day strip** — `/api/dashboard`: `dayIndicators = buildSlotIndicators(slots, productionSlotUnits, …)` and each
  strip row takes `tone: dayIndicators.get(s.collection_time)?.tone ?? s.tone, label: …?.label ?? ''`;
  `DayLoadStrip` renders `TONE[tone].dot` and `s.label`. Offline, `displaySlots` re-runs the same
  `buildSlotIndicators` over `offlineOccupancy`.
- **Edit picker** — `editSlotIndicators = buildSlotIndicators(editSlots, editCapacityInputs.productionSlotUnits …)`;
  option `{s.collection_time} {ind.emoji}{ind.overTotal>0?'❗':''}{label}` with `label = ind.label (+ " · (current)")`.
- **Customer list** — `/api/slots` → `buildSlotAvailability`'s no-basket branch (the same window line, quoted in
  §2) gives each row `tone` and `available = tone !== 'red' && !isPast && !tooSoon`; the page renders
  `<option value={slot.collection_time}>{slot.collection_time}</option>` — **the time only** — and filters:
  basket non-empty ⇒ `unfittableSlots` (fitOrderBackward); basket empty ⇒ `else if (!s.available) return false`.

### R2 — does the customer list show any label text today? **No.** Nor a colour.
Each customer option is the bare time. There is no emoji, no count, no reason. The only capacity signal a
customer sees is a time being absent — by `unfittableSlots` (basket) or `available` (no basket).

### R3 — where the rolling load for [T − prep, T) is read
From the projection's `intervals` (`BackwardOccupancy.intervals`: every cooking batch as a `[start, start+prep)`
`CookInterval` carrying `cat`, plus zero-width instant points), through the existing helpers:

- category: `categoryLoadOver(back.intervals, cat, T − prep, T)` — half-open, the SAME call `fitOrderBackward`
  makes for a one-batch order at T (OFF: `existing = categoryLoadOver(back.intervals, cat, ws, ws + prep)`; ON:
  inside `reserveBatches`, `categoryLoadOver(intervals, cat, ws, ws + P)`).
- kitchen ceiling, as the fit applies it: OFF, `windowScopedPeak` (the span start and each existing start inside
  it, `concurrencyAt` over all intervals); ON, `reserveBatches`' overlapping total (`total += iv.items` for every real
  interval overlapping the window, `free = min(batch − existing, kc − total)`).
- switch ON and OFF alike, `projectBackwardOccupancy` seats reservations verbatim (ON) or by P2's rule (OFF) into
  the same `intervals`, so one read serves both; the harness runs every case both ways.

### R4 — where the Collection times boxes get cooking categories and prep — **no new read**
- Manage: the box lives in `SettingsTab`, whose props already include `categories: Category[]`
  (`{ name, prep_secs, batch_size, … }`, from the page's initial `/api/manage` load — `menu_categories.select('*')`).
- Dashboard: the page holds `truckMenu.categories` (`prep_secs`, `batch_size`) — the same object `catConfigs`
  is built from at `page.tsx` (`truckMenu?.categories?.forEach(c => m[c.name.toLowerCase()] = { secs: c.prep_secs … })`).
Neither page needed a separate tolerant read; the named-select rule is untouched.

---

## 1. What changed, by symbol

### `lib/slot-availability.ts`
- **new** `DotOverlap`, `DotCatRead`, `DotRead` types and **`dotOccupancyAt(back, slotMins, prevSlotMins, step,
  eventStartMins, catConfigs, kitchenCapacity, displayIntervalMins, batchReservations, rankOf?)`** — THE one dot
  read. `window` = today's read byte-for-byte (pile ?? window ending at T ?? null at 5; `coverDotWindows` at 10–30);
  per cooking category `used = categoryLoadOver(back.intervals, cat, T − prep, T)`, `full = used ≥ batch` or the
  kitchen span full; `tone = max(window.tone, overlap tone)`; `overlap` (the binding limit, batch or kitchen)
  reported **only when strictly worse than the window's own tone**.
- **new** `kitchenLoadOver(intervals, from, to, batchReservations)` (module-private): ON ⇒ `reserveBatches`' sum;
  OFF ⇒ the window-scoped peak at the span start and every **cooking** start inside it.
- `buildSlotAvailability`, no-basket branch: `const read = dotOccupancyAt(…)`; `tone = read.tone`; `w = read.window`
  for `bound_by`/`current_orders`; **new local `windowToneForAvailable`** so
  `capacityAvailable = (hasBasket ? tone : windowToneForAvailable) !== 'red'` — `available` reads today's window.

### `lib/slot-display.ts`
- `SlotIndicator` gains `overlap`, `ownLabel`, `multiCat`, `nextFree` (additive).
- **new** `formatOverlapLabel(overlap, multiCat, nextFree)` — the one formatter.
- `buildSlotIndicators`: reads every slot once through `dotOccupancyAt` (`reads`), then per slot: `ownLabel` = the
  window composition exactly as before (`peak …` prefix kept); `overlap = ownLabel ? null : read.overlap`;
  `nextFree = nextFreeFor(slotM, overlap)` (no order: the earliest LATER listed time whose read is not full for the
  same limit); `label = overlap ? formatOverlapLabel(…) : ownLabel`. The `coverDotWindows` import moved into the
  helper.

### `lib/slot-interval.ts`
- **new** `misalignedCookingCategory(intervalMins, categories)` → the longest-prep cooking category whose prep does
  not divide the interval, or null; **new** `collectionTimesHint(cat)` → the sentence.

### `components/dashboard/AddOrderPanel.tsx`
- **new** memo `nextFitAfter`: for each listed time, the earliest later non-grace time NOT in `manualFitWhy` — the
  same verdict the "Order won't fit" label reads. Placed below `manualFitWhy` (a first draft above it was a TDZ error
  tsc caught).
- the option: `label = ind.overlap && !ind.ownLabel && hasItems ? formatOverlapLabel(ind.overlap, ind.multiCat, nextFitAfter.get(t) ?? null) : ind.label`;
  the two separators now hang off `label`. `slotIndicatorFor`'s default carries the new fields.

### `app/dashboard/[token]/page.tsx`
- the edit picker's default indicator carries the new fields (its option line is unchanged; no-order variant).
- the Collection times box: **one** conditional line after the second select's block:
  `misalignedCookingCategory(overrideOn ? operator : customer, truckMenu?.categories ?? [])` → `collectionTimesHint`.

### `app/manage/[token]/page.tsx`
- the same one conditional line, with `categories` (the tab's existing prop).

### Every new string
| Where | String |
|---|---|
| operator dots, red, single cooking category | `Full – next free HH:MM` / `Full` |
| operator dots, red, several categories | `{Category} full – next free HH:MM` / `{Category} full` |
| operator dots, red, kitchen ceiling binding | `Kitchen full – next free HH:MM` / `Kitchen full` |
| operator dots, amber | `{n} free` / `{Category}: {n} free` / `Kitchen: {n} free` |
| both Collection times boxes | `{Category} takes {prep} minutes to cook, so some times between batches will show as full.` |

Customer-facing: **none** (§2.4). `" · Order won’t fit"` / `" – Order won’t fit"` are unchanged.

## 2. The rule as built

### 2.1 Colour
For each listed T and each cooking category: rolling `used` over `[T − prep, T)` via `categoryLoadOver`, plus the
kitchen ceiling over the same span as the fit applies it (R3). Colour = worst of today's window read and this.

### 2.2 Labels
A time **with** its own booking keeps `"{n} {Category}"`; colour may now be worse. A time **without** one that an
existing batch overlaps shows the reason, never another time's count. "next free": no order ⇒ the earliest later
listed time not full for the binding limit (`nextFreeFor`); order in progress ⇒ the earliest later time
`fitOrderBackward` accepts it (`nextFitAfter`); none ⇒ plain `Full`. `" · Order won’t fit"` is still appended
where the order doesn't fit, `" – "` after a bare dot.

### 2.3 How it combines with the 10–30 "peak" coverage
`dotOccupancyAt.window` **is** `coverDotWindows(...)` on a 10–30 grid, unchanged, and the overlap read is taken
**in addition**: `tone = max(coverTone, overlapTone)`, the reason shown only when the overlap is strictly worse.
Proof that aligned 10–30 grids are unchanged: the seeded aligned sweep (grids 5/10/15/20/30, preps dividing the
grid, instants and ceilings, switch ON/OFF) — 1,200 states, 0 differ — and the `aligned240` golden family (grids
10–45), 0 differ. Misaligned 10-grid case, from the harness: prep 15, 8 @17:00 and 8 @17:30 →
`17:10 🔴 Full – next free 17:50 · 17:30 🔴 8 Pizzas · 17:40 🔴 Full – next free 17:50 · 17:50 🟢`.

### 2.4 The customer page
It shows no dots and no labels (R2). `/api/slots` rows' `tone` now follows the rule (the harness: 17:05 `tone red`);
**`available` keeps today's window read** — the customer's empty-basket list gates on it and the times offered to
customers must not move. No reason text is emitted on the row and the page source contains none; the harness's V4
proves the check would catch one. Net customer-facing change: **nil**, which is what the hard constraint requires.

### 2.5 One instant-point edge, kept as today
A zero-width **instant** point (a no-prep counted item) that has spilled strictly inside a cooking span and sits at no
cooking start is **not** an evaluated instant of the dot's kitchen read — today's window read does not see it either
(such a point creates a window keyed by the capacity step that the *next* dot covers on a 10–30 grid). The fit does
evaluate it. So a ceiling breach caused only by such a spill can still show one dot late, exactly as before this task.
Without this the aligned identity sweep produced 13 differences, all of that shape; with it, 0. Cooking overlap —
the case this task is about — is read in full.

## 3. Each harness — failure mode, broken variant FIRST, then the real result

### `scripts/dot-overlap-labels.cjs` (FIXTURES through the real engine; the panel lines through the real `AddOrderPanel`)
**Failure mode:** a green, count-less dot on a time every order of that category is refused at.

| | Broken variant | Result |
|---|---|---|
| V1 | today's exact-time read (the rolling read discarded) | ✓ FAILED as required: `"17:05 🟢"` |
| V2 | the overlapping window's own count repeated on the overlapped time | ✓ FAILED as required: `"17:05 🔴 8 Pizzas"` |
| V3 | "next free" from the no-order rule while an order is in progress | ✓ FAILED as required: with 9 pizzas 17:05 named 17:15, where 9 do NOT fit |
| V4 | operator reason text emitted on the `/api/slots` row | ✓ FAILED as required: the 17:05 row carried `"Full – next free"` |
| V5 | closed-left overlap (touching windows counted) | ✓ FAILED as required: `"17:15 🔴 1 Pizza"` (the 16:45–17:00 batch ends as 17:15's window begins) |

**Real result** — every line below is verbatim harness output, switch OFF and ON:

```
  17:00 🔴 8 Pizzas
  17:05 🔴 Full – next free 17:15
  17:10 🔴 Full – next free 17:15
  17:15 🟡 1 Pizza
  2 pizzas  · "17:05 🔴 Full – next free 17:15 · Order won’t fit" / "17:15 🟡 1 Pizza"   (17:00 "… 8 Pizzas · Order won’t fit")
  partial: 5 @17:00 → "17:05 🟡 3 free"
  9 pizzas, switch OFF: "17:05 🔴 Full – next free 17:45 · Order won’t fit" — 9 fit at 17:45, refused at every listed time before it
  9 pizzas, switch ON : "17:05 🔴 Full – next free 17:30 · Order won’t fit" — 9 fit at 17:30, refused at every listed time before it
  two categories: "17:05 🔴 Pizza full – next free 17:15" · "17:15 🟡 Burgers: 2 free"
  kitchen ceiling (kc 6): "17:05 🔴 Kitchen full – next free 17:15" · partial "17:05 🟡 Kitchen: 1 free"
  customer row 17:05: tone red, available true (today's window), no reason text; the page renders none
  10-minute grid, prep 15: "17:10 🔴 Full – next free 17:50" · "17:30 🔴 8 Pizzas" · "17:40 🔴 Full – next free 17:50" · "17:50 🟢"
  AGREEMENT: 2200 states (prep 10 and 15, batch 4/6/8, kc null/6/10, switch ON and OFF), 96441 (time, category) reads: dot red by overlap ⇔ refused, 0 disagree
   …the only refusals with no overlap to show are LEAD refusals (why = preopen only): 114, every one exactly §31's pre-open rule on the slot's committed load + 1 (0 not)
  ALIGNED: 1200 seeded aligned states: dots and /api/slots tones 0 differ
  ALIGNED: Gusto-shaped (300) + aligned240 (240) + Gusto's six live events: 546 fixtures, 0 dots differ from today
✅ overlapped times read full, with a reason, and nothing else moved        rc=0
```
(9 pizzas OFF: today's split puts 8 in the earlier window, which holds 1 until 17:45; ON: Dominic's rule fills
nearest-first, so 17:30's two windows — 8 + 1 free — take it.) The AGREEMENT statement is exact in one direction
and exact-with-one-named-exception in the other: a one-item order can also be refused for **lead** alone — the
slot's committed load plus one needs a window before the pre-open run-up — which has no overlap to show; the
harness verifies every such case satisfies §31's rule and nothing else. "ALIGNED … from today" compares against the
same build with the rolling read disabled, which is today's read by construction (the window line is unchanged).

### `scripts/collection-times-hint.cjs`
**Failure mode:** the hint missing when a prep does not divide the interval, or shown when it does.
**Broken variant:** a "prep ≠ interval" rule — ✓ FAILED as required (prep 15 at every 30 showed a hint; 30 is two
batches). **Real:** appears at 5, 10, 20 (`Pizza takes 15 minutes to cook, so some times between batches will show
as full.`); hidden at 15 and 30; hidden for Gusto's shape (prep 5, every 5, instant categories) and with no cooking
categories; the longest misaligned category is named (Burgers 10 / Pizza 15 / Roast 25 at every 10 → Roast); one line
on each page, reading the categories the page already holds, following the ticked "your" interval, identical on
Manage and the dashboard, the sentence from the shared helper only. rc=0.

### Re-targeted, not weakened
- `slot-interval-settings.cjs` — the ALLOWED-prose block gained one assertion: the single
  `misalignedCookingCategory → collectionTimesHint` call in the box, and nothing else added.
- `slot-interval-event-override.cjs` — copy-intact list gained: the one hint line present once on each box.
- `slot-interval-dots.cjs` — its "byte-identical to HEAD at 5" compares indicator objects; a `SlotIndicator` gained
  four additive fields, so both sides are projected onto HEAD's five (`tone, emoji, label, overTotal, occ`). Real: 68
  cases identical to HEAD, both readers. rc=0.
- `add-order-fit-message.cjs` — its source regex for the option line now matches the local `label` in place of
  `ind.label`; the two separators are unchanged.
- `_batch-rolling-snapshot.cjs`, `batch-reservation-golden-on.cjs`, `_batch-reservation-golden-on-generate.cjs` —
  `projectDots` / `GOLDEN_DOT_KEYS`: the dots digested by the goldens are projected onto the five fields the goldens
  were recorded over, exactly as `GOLDEN_FIT_KEYS` already projects `fitOrderBackward`'s additive `why`/`reserved`.
  **The goldens were not regenerated** — the recorded digests matched once the shape was projected, which is the
  proof that no aligned fixture's dot moved. Neither golden records a misaligned fixture (every family is grid ≡ 0
  mod prep; checked: `aligned240` has 0 rows where the grid is not a multiple of a prep).

## 4. Verification

| Check | Result |
|---|---|
| `node scripts/run-harnesses.cjs` | **47 run · 47 passed · 0 failed — true exit code 0** (every listed harness rc=0) |
| `scripts/fixtures/batch-rolling-golden.json` | sha256 `8bdae817748ad334…` before and after, mtime 17 Sep 10:11 |
| `scripts/fixtures/batch-reservation-golden-on.json` | sha256 `ce5550b7ee2a42ce…` before and after, mtime 17 Sep 13:42 |
| `npx tsc --noEmit` | **true exit code 0** |
| `npx next build` | "Compiled successfully in 5.3s", **true exit code 0** |

**eslint, changed files, against a clean HEAD worktree — delta per rule:**

| File · rule · severity | HEAD → tree |
|---|---|
| `components/dashboard/AddOrderPanel.tsx` · `react-hooks/exhaustive-deps` · warn | 7 → 1 (from the earlier refresh work) |
| `components/dashboard/AddOrderPanel.tsx` · `react-hooks/set-state-in-effect` · error | 5 → 4 (ditto) |
| `lib/slot-availability.ts` · `@typescript-eslint/no-unused-vars` · warn | 1 → 0 |
| `lib/slot-interval.ts` (untracked) | 0 errors, 0 warnings |
| totals over the six files | errors 378 → 377 · warnings 115 → 108 |

No rule count rose. (The first background lint runs produced empty output because zsh read `[token]` in the paths
as a glob; the delta above is the quoted-path rerun.)

**Hard constraints:** `fitOrderBackward`, `earliestBackwardFitSlot`, placement, reservations and
`detectCapacityBreaches` are not edited (the diff of `lib/slot-availability.ts` adds the helper and changes the
no-basket dot branch of `buildSlotAvailability` only; `lib/capacity-breach.ts` is untouched); the batch-reservation
identity, writers, immutability, instants, display-equals-picker and both goldens all pass; the customer-path identity
harness passes (offered sets identical OFF; supersets ON as before).

## 5. Localhost test script — test-truck (Pizza Kitchen), switch ON

1. Manage → Settings → Van → Collection times: set **Customer Collection Times = Every 5 minutes**. The line
   *"Pizza takes 15 minutes to cook, so some times between batches will show as full."* appears under the selects.
   Dashboard → Settings shows the same line on its box. Tick "Use different times for orders I add", set yours to
   15: the line disappears (it follows your interval); set yours to 10: it returns.
2. Event today 17:00–21:00. Store **8 pizzas @17:00** and **1 pizza @17:15** (Add Order, or two customer orders).
3. **Add Order, empty order:** the list reads `17:00 🔴 8 Pizzas`, `17:05 🔴 Full – next free 17:15`,
   `17:10 🔴 Full – next free 17:15`, `17:15 🟡 1 Pizza`, then `17:20 🟡 7 free`, `17:25 🟡 7 free`, `17:30 🟢`.
4. **Add 2 pizzas:** `17:05 🔴 Full – next free 17:15 · Order won’t fit`, `17:10` the same, `17:15 🟡 1 Pizza`
   (no "won't fit" — 3 ≤ 8). Pick 17:05 and Add anyway: the popup names 16:50–17:05 with existing 9 — the same
   refusal the label showed.
5. **Day strip** (Settings → the strip, or the sidebar): 17:05 and 17:10 are red with `Full – next free 17:15`;
   17:00 red `8 Pizzas`; 17:15 amber `1 Pizza`.
6. **Customer page** for test-truck: the time picker looks exactly as before — bare times; with an empty basket
   17:00 is absent (as today), 17:05 and 17:10 are present (as today); add a pizza and both vanish (as today).
7. **Customer times back to Every 15 minutes:** the hint disappears on both boxes; the Add Order list shows
   `17:00 🔴 8 Pizzas`, `17:15 🟡 1 Pizza`, `17:30 🟢` — as before this task.
8. **Gusto, look only, by you:** Pizzeria Gusto is prep 5 at every 5 — an aligned grid — so its dots and boxes are
   byte-identical to today by construction and by the 546-fixture proof. Nothing to open; nothing was opened.

## 6. Manual sections made stale (NOT edited)
`docs/reference-manual.md` §31 ("Slot & Capacity Engine — CANONICAL MODEL"): the "DISPLAYS" list should name
`dotOccupancyAt` as the one dot read and record that a dot's colour is the worst of its window and the rolling
`[T − prep, T)` overlap; the "Dot tone" bullet and the worked example stand; add the reason-label vocabulary and
the note that `/api/slots`' `available` reads the window tone, not the display tone. The Collection times section
(the event-override report's §12 list) gains the hint line and its rule. Nothing else.

## 7. Anything I could not establish
- The look of the day strip's `Full – next free HH:MM` text at narrow widths (it truncates like any label; not
  rendered here).
- Real-device timing of the Collection times hint updating "live" — it is a pure function of the select state,
  proven by source; not exercised in a browser.
- Whether any operator relies on `/api/slots`' row `tone` outside the four surfaces named (grep found no other
  reader); `available` is unchanged regardless.
