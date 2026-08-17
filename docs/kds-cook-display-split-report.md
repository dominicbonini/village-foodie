# KDS: the Cook display toggle — STAGE 1 ONLY. STOPPED.

# 🔴 STOPPED. ONE `viewMode` REFERENCE DOES MONEY **AND** LAYOUT AT ONCE. NOTHING WAS CHANGED.

**`components/dashboard/OrderCard.tsx` and `app/dashboard/[token]/kds/page.tsx` were READ and NOT
written.** No file in the repo was written by this task except this report. **Stage 2 was not started** —
no prop was added, no reference was moved, no call site was touched.

**No commit, no stage, no revert, no stash, no clean.** No build, no `next dev`, no `next build`, no
`cap sync`, no deploy, no SQL, no migration, nothing under `app/api`.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

## ✅ NO CONFLICT WITH THE POST-GATE PARITY WORK

**EXECUTED — `grep` for the landed work inside `OrderCard.tsx`: `useGatedActionResult` has ZERO
occurrences there (it is a page-level hook), and `pendingPayment` is a prop this task's classification
does not touch.** ✅ **Nothing in this brief reaches either. There is nothing to flag.**

---

# 🔴 THE STOP — REFERENCE AT LINE 1138

**READ — the item block, and it is a single ternary on `viewMode` that swaps TWO different things at
once:**

```tsx
          {/* ── Items: cook view vs window/solo view ── */}
          {viewMode === 'cook' ? (
            <div className="mb-2">
              {itemGroups.map(({ cat, lines }, gi) => (
                <div key={cat}>
                  <div className={`flex items-center gap-2 mb-1 ${gi > 0 ? 'mt-3' : ''}`}>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                      {cat === '__other__' ? 'Other' : cat}
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  {lines.map((line, j) => (
                    <div key={j} className="mb-0.5">
                      <p className="text-sm font-normal text-slate-900">{line.quantity}× {line.name}</p>
```

```tsx
          ) : (
            /* Window / solo: DEALS FIRST (deal blocks + leading "Deals" divider) THEN the standalone
               items by category. Cook view is untouched — it DISSOLVES deals into category batches via
               itemGroups (Section 8); this deals-first reorder is operator-order-card only. */
```

## What that one reference decides, in two columns

| | Cook arm | Full arm |
|---|---|---|
| 🔴 **MONEY** | **no prices at all** | `£{(line.unit_price * line.quantity)}` per line, `£{deal.price}` per deal, `+£{m.price}` per modifier |
| 🔴 **LAYOUT — data source** | `itemGroups` — **deals DISSOLVED into category batches** | `standaloneGroups` **plus** deal blocks, deals first, with a "Deals" divider |
| 🔴 **LAYOUT — markup** | a plain `<p>` per line | a `<button>` per line, with a `w-16` price column, strike-through and `(struck/qty)` |
| 🔴 **LAYOUT — type size** | `text-sm` fixed | `${viewMode === 'solo' \|\| viewMode === 'window' ? 'text-sm' : 'text-base'}` |
| 🔴 **LAYOUT — notes field** | `line.note` | `line.specialInstructions` |

# ⚠️ SO IT IS MONEY **AND** LAYOUT, IN ONE TEST. Per your instruction, I stopped here rather than choosing.

⚠️ **IT IS NOT ALSO LIFECYCLE, AND I CHECKED.** The Full arm's per-line `<button>` looks like an action,
but — READ, `OrderCard.tsx:21`:

```tsx
const ITEM_TICK_ENABLED = false
```

✅ **With that false, `onClick` is `undefined` in the Full arm and the two arms are equally inert.** **So
the split needed is two-way (money vs layout), not three-way.**

## What splitting it means, stated but NOT done

**The Cook arm cannot simply be deleted, and the Full arm cannot simply gain a `hideAmounts` guard,
because the two arms disagree about more than money — they disagree about what an "item" IS.** 🔴 **A
deal is ONE line in Full and is DISSOLVED into its component categories in Cook.** ⚠️ **That is a
kitchen-vs-counter data decision, not a visual one, and your definition of Cook — *"UNCHANGED in Cook:
item names, quantities, category headings"* — does not say which of the two groupings survives.**

**That is the decision I will not make for you. Everything else in the brief is unambiguous.**

---

# STAGE 1 — EVERY `viewMode` REFERENCE, CLASSIFIED

**EXECUTED — a file-wide scan. Seventeen occurrences, quoted in full below.**

## Declarations — no bucket

```tsx
  viewMode = 'solo',
```
```tsx
  viewMode?: ViewMode
```

⚠️ **The default is `'solo'`, which is why the dashboard is unaffected by everything below.**

## Comments — no bucket

```tsx
  // ── Button sets per viewMode ────────────────────────────────────────────────
```
```tsx
    // ⚠️ EXPLICITLY `viewMode === 'window'`, never a bare `hidePayments`. Solo is the DASHBOARD's mode;
```
```tsx
      // The dashboard never reaches this branch at all: it renders viewMode 'solo'.
```
```tsx
              It rendered on `order.status === 'pending' && order.slot && viewMode !== 'cook'` and each
```

## 🔴 LIFECYCLE — decides which actions or buttons exist

```tsx
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
```
```tsx
    if (viewMode === 'window') {
```
```tsx
            {viewMode === 'solo' && (['pending', 'confirmed', 'modified'].includes(order.status) || ['confirmed', 'modified', 'ready'].includes(order.status)) && (
```

⚠️ **THREE, AND THE FIRST TWO ARE THE WHOLE DEFECT YOU OBSERVED.** The third gates the ghost Edit/Cancel
row and is solo-only, so the KDS never reaches it either way.

## 🔴 MONEY — decides whether an AMOUNT is shown

```tsx
  const partPaidRow = (hidePayments || viewMode === 'cook' || !effectivePartPaid) ? null : (
```

```tsx
  const showPrices = viewMode !== 'cook'
```

# 🔴 `showPrices` IS DEAD CODE. IT HAS ZERO CONSUMERS.

**EXECUTED — the complete result of scanning the file for `showPrices`:**

```
components/dashboard/OrderCard.tsx:623   // …Cook shows no prices at all (`showPrices` is
components/dashboard/OrderCard.tsx:752   const showPrices = viewMode !== 'cook'
```

🔴 **One declaration and one COMMENT REFERRING TO IT. Nothing reads it.** ⚠️ **This matters for Stage 2:
the obvious-looking fix — "point `showPrices` at the new prop" — would change nothing at all. Prices are
hidden in Cook solely by the line-1138 arm being a different renderer, which is precisely the reference
that needs splitting.** ⚠️ **And the comment at `:623` is therefore stale: it explains a variable that
does nothing.**

## LAYOUT — padding, type size, header markup, grouping

```tsx
      {viewMode === 'cook' ? (
```
*(the header split — cook's two-line non-interactive header vs window/solo)*

```tsx
        <div className={`w-full text-left ${viewMode === 'window' ? 'px-3 py-2' : 'px-4 py-3'} ${headerCls}`}>
```

```tsx
          {viewMode === 'solo' ? (
```

```tsx
                          className={`w-full flex justify-between items-baseline gap-2 ${viewMode === 'solo' || viewMode === 'window' ? 'text-sm' : 'text-base'} rounded py-1.5 text-left ${
```

```tsx
            <div className={`bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 mx-3 rounded-md flex items-start gap-2 text-sm ${viewMode === 'solo' ? 'mb-2' : 'mb-3'}`}>
```

## 🔴 MONEY **AND** LAYOUT — THE STOP

```tsx
          {viewMode === 'cook' ? (
```
*(line 1138, the item block — dissected above)*

## The tally

| Bucket | Count | Lines |
|---|---|---|
| Declaration | 2 | 93, 127 |
| Comment | 4 | 813, 839, 884, 1280 |
| 🔴 **LIFECYCLE** | 3 | 842, 867, 1306 |
| 🔴 **MONEY** | 2 | 629, **752 (dead)** |
| **LAYOUT** | 5 | 1018, 1040, 1041, 1230, 1273 |
| 🔴 **MONEY + LAYOUT** | **1** | **1138 — THE STOP** |

---

# 🔴 THE `renderButtons` TRACE — YOUR PREMISE IS REFUTED, AND THE REAL CAUSE IS ADJACENT

**You asked: with `viewMode === 'cook'`, `kds_mode` false, and an order at status `confirmed`, which
branch does `renderButtons` enter and what does it return? Confirm or refute that it returns nothing.**

# ✅ REFUTED. AT `confirmed` IT RETURNS A **Ready** BUTTON, NOT NOTHING.

**The trace, every gate quoted, in order:**

```tsx
    if (pendingSync) {
```
✗ not syncing → fall through.

```tsx
    if (order.status === 'pending') {
```
✗ status is `confirmed` → fall through.

```tsx
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
```
✅ **`viewMode === 'cook'` → ENTERED. This is the branch.**

```tsx
      if (['confirmed', 'modified'].includes(order.status)) {
        // Stage 1 (order-ready redesign): the cooking step is now ALWAYS on in cook mode — DE-COUPLED
        // from show_cooking_step (was `kdsMode && showCookingStep`). To re-add the "Show cooking step"
        // toggle later, restore `&& showCookingStep` here. Cook mode shows Start cooking → Ready.
        return kdsMode ? (
          <>
            <Btn label="Start cooking" colour="amber" loading={isLoading('cooking')} onClick={() => onAction('cooking', order.order_key)} />
            <Btn label="Ready"         colour="green" loading={isLoading('ready')}   onClick={() => onAction('ready', order.order_key)} />
          </>
        ) : (
          <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
        )
      }
```

✅ **`confirmed` is in the list; `kdsMode` is false ⇒ the ternary's ELSE arm ⇒ it returns a single
`Ready` button.**

# 🔴 SO WHAT YOU SAW WAS NOT A `confirmed` ORDER. IT WAS A `ready` ONE.

**READ — the same branch, continued, and this is where it returns nothing:**

```tsx
      if (order.status === 'cooking') {
        return (
          <>
            <span className="flex-1 text-amber-700 font-bold text-sm flex items-center">🔥 Cooking…</span>
            <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
          </>
        )
      }
      return null
    }
```

🔴 **`ready` matches NEITHER inner test, so the cook branch falls to `return null` — no Ready, no
completion control, nothing.**

## ✅ AND YOUR OWN OBSERVATION CONFIRMS THE STATUS

**You reported that the same orders show `Mark paid & collected` and `Collected` in Full. Those are
`completionBtn()` labels, and with both switches on — `readyStepOn = cardViewMode === 'window' && readyOn
&& handoverOn` — READ, the window branch reaches `completionBtn()` for exactly one status:**

```tsx
        if (order.status === 'ready') {
          return completionBtn()
        }
```

⚠️ **A `confirmed` order in Full would have shown `Ready`, not a completion control. So the cards you
were looking at were at status `'ready'`, and `'ready'` is the one status the cook branch has no case
for.** ✅ **The DEFECT and the CAUSE you named are both correct — a display control is choosing the
button branch — but the failing status is `ready`, not `confirmed`.** ⚠️ **This was already recorded
independently in `docs/kds-status-badge-report.md`: *"A card rendered `viewMode === 'cook'` at status
`'ready'` renders NO button and, today, NO badge."***

---

# 🔴 TWO MORE FACTS STAGE 2 WILL NEED — REPORTED, NOT ACTED ON

**Neither is a `viewMode` reference, so neither is a stop by the letter of your brief. Both would bite
whoever writes Stage 2.**

## 1. The header total is unconditional money inside a LAYOUT branch

**READ — the window header and the solo header each render the order total with no money gate:**

```tsx
                  <span className="font-bold text-base">£{Number(order.total).toFixed(2)}</span>
```
```tsx
                <span className="font-bold text-sm flex-shrink-0">£{Number(order.total).toFixed(2)}</span>
```

🔴 **Today the total is hidden in Cook only because the COOK HEADER is a different header that never
renders it.** ⚠️ **Once `viewMode` follows `boardMode`, a handover device with the display set to Cook
renders the WINDOW header — which prints the total. `hideAmounts` must guard both of those spans, or
"no monetary amount renders anywhere on the card" fails on the very first line of the card.**

## 2. `paidChipStatic` mixes an amount-carrying chip into a chain of amount-free ones

**READ, in full:**

```tsx
  const paidChipStatic = hidePayments ? null
    : balance.status === 'refunded' ? <span title="Refunded in full. Nothing to collect." className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 flex-shrink-0 whitespace-nowrap">REFUNDED</span>
    : balance.status === 'part_refunded' ? <span title="Charged in full, then partly refunded. Nothing to collect." className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 flex-shrink-0 whitespace-nowrap">{money(balance.balanceMinor)} REFUNDED</span>
    : effectivePaid ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">PAID</span>
    : heldAuthorisation ? <span title="Card authorised — do not collect. Payment is taken when you confirm." className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 flex-shrink-0 whitespace-nowrap">CARD HELD</span>
    : null
```

**Your definition splits this chain down the middle:**

| Chip | Carries an amount? | Your rule |
|---|---|---|
| `REFUNDED` | ✗ | ⚠️ **unstated** — it is a payment chip, but it carries no amount |
| **`{money(…)} REFUNDED`** | 🔴 **YES** | 🔴 **HIDDEN in Cook** |
| `PAID` | ✗ | ✅ **explicitly UNCHANGED** |
| `CARD HELD` | ✗ | ⚠️ **unstated** |

⚠️ **So `hideAmounts` cannot gate `paidChipStatic` as a unit — it would take `PAID` with it, which you
explicitly said must stay. The chain needs a per-arm decision, and two of its four arms have no rule
yet.** **RECOMMENDING NOTHING.**

---

# WHAT I DID NOT DO

- ❌ **No `hideAmounts` prop added.** No prop of any name.
- ❌ **`viewMode` still receives `cardMode` at the KDS call site** — `viewMode={cardViewMode}`, untouched.
- ❌ **No LIFECYCLE, MONEY or LAYOUT reference edited.**
- ❌ **`boardMode`, `displayOrders`, the two switches, their keys, their dual-write persistence and their
  defaults: not read for modification, not touched.**
- ❌ **The Full/Cook control, its `hg_kds_cardmode_` key and its localStorage-only storage: untouched.**
- ❌ **`lib/native/useGatedActionResult.tsx`, the `pendingPayment` prop, the payment overlay,
  `completionBtn`, the board filters, the grid cap, `doneOrders`, the overlay substitution, the event
  bar: untouched.**

---

# 🔴 VERIFICATION

**Nothing was compiled and no device was used. There is no behaviour verification in this report.**

| Claim | Method |
|---|---|
| The seventeen `viewMode` references are all of them | ✅ **EXECUTED** — file-wide scan, every hit quoted |
| `showPrices` has zero consumers | ✅ **EXECUTED** — scan returns the declaration and one comment |
| `ITEM_TICK_ENABLED` is `false` | ✅ **EXECUTED** — read at its declaration |
| Every `£` on the card enumerated | ✅ **EXECUTED** — scan; each hit classified |
| `OrderCard.tsx` imports nothing from the post-gate work | ✅ **EXECUTED** — scan returns zero |
| **Line 1138 decides money AND layout** | 🔴 **SOURCE READ ONLY** — read from the two arms. **No card was rendered in either mode** |
| **`confirmed` + cook returns a `Ready` button** | 🔴 **SOURCE READ ONLY** — traced through four gates. **Not observed** |
| **`ready` + cook returns null** | 🔴 **SOURCE READ ONLY** — but ⚠️ **CORROBORATED BY YOUR OWN LIVE OBSERVATION**, which is the strongest evidence in this report and is YOURS, not mine |
| **The window header would print the total under Cook after Stage 2** | 🔴 **SOURCE READ ONLY, AND PREDICTIVE** — it describes code that does not exist yet |
| Nothing was changed | ✅ **EXECUTED** — byte counts and census below; `git status --porcelain` |

🔴 **NOT ONE RENDERING CLAIM HERE WAS BEHAVIOUR-VERIFIED. No browser, no device, no KDS was opened.**

---

# INTEGRITY

## Non-ASCII class census — the two files read

# ✅ 31 CLASSES BEFORE, 31 AFTER (`OrderCard.tsx`). 33 BEFORE, 33 AFTER (the KDS). EVERY COUNT IDENTICAL — NEITHER FILE WAS WRITTEN.

### `components/dashboard/OrderCard.tsx`

| Class | BEFORE | AFTER | Δ |
|---|---|---|---|
| U+2500 · U+2014 · U+1F534 · U+26A0 · U+FE0F | 1278 / 153 / 47 / 47 / 45 | identical | **0** |
| U+00A3 · U+2192 · U+2713 · U+2022 · U+2026 | 23 / 22 / 9 / 8 / 7 | identical | **0** |
| U+00A7 · U+21D2 · U+23F3 · U+00D7 · U+270F · U+00B7 · U+1F525 · U+2709 · U+1F4DD | 6 / 5 / 5 / 4 / 4 / 4 / 4 / 4 / 4 | identical | **0** |
| U+1F4B7 · U+1F4B3 · U+21A9 · U+2705 · U+1F514 | 2 each | identical | **0** |
| U+2264 · U+2265 · U+2717 · U+1F355 · U+1F4F1 · U+1F381 · U+2715 | 1 each | identical | **0** |

### `app/dashboard/[token]/kds/page.tsx`

**33 classes, every count identical. Unchanged since the post-gate parity task, which is the last thing
to write to it.**

## 🔴 The 2 pre-existing bare `U+26A0` in `OrderCard.tsx`

| Base | BEFORE n / paired / bare | AFTER n / paired / bare |
|---|---|---|
| U+26A0 | 47 / 45 / **2** | 47 / 45 / **2** |

# ✅ UNCHANGED — STILL EXACTLY 2, AND THEY ARE THE SAME TWO.

**They are the conflict markers `⚠ PAYMENT NOT RECORDED — check before releasing` and
`⚠ Last update didn't sync`, reported as pre-existing in every census for several tasks. The file was
not written, so there was no opportunity to disturb them.**

⚠️ **NOTE FOR THE NEXT PASS: `app/dashboard/[token]/kds/page.tsx` now carries ZERO bare `U+26A0`
(64 of 64 paired) — its one bare glyph was the duplicated `paymentWarning` string deleted by the
post-gate extraction. Do not expect the old count of 1.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. The report scanned in a SEPARATE pass AFTER it was written. It is the
only file this task wrote.**

```
  components/dashboard/OrderCard.tsx                     90,137  offending=0  CR=0   (unchanged)
  app/dashboard/[token]/kds/page.tsx                    137,629  offending=0  CR=0   (unchanged)
  docs/kds-cook-display-split-report.md (SEPARATE PASS)   23,494  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 37 | 0 | 37 |
| U+2705 WHITE HEAVY CHECK MARK | 30 | 0 | 30 |
| **U+26A0 WARNING SIGN** | **22** | **18** | 🔴 **4** |
| U+274C CROSS MARK | 6 | 0 | 6 |
| U+2717 BALLOT X | 5 | 0 | 5 |
| U+1F525 FIRE | 2 | 0 | 2 |

# 🔴 FOUR BARE U+26A0 — TWO STRINGS, EACH QUOTED TWICE, BOTH `OrderCard.tsx`'s OWN.

**Every warning sign I wrote as prose is paired — 18 of 18. The bare ones are the two conflict-marker
strings, each appearing twice: once where the census section names them and once here. Both are quoted
in the form the source writes them:**

```
⚠ PAYMENT NOT RECORDED — check before releasing
⚠ Last update didn't sync
```

✅ **EXECUTED — `OrderCard.tsx` itself measures `U+26A0 n=47 paired=45 bare=2`, and its two bare glyphs
are exactly these two strings.** ⚠️ **Pairing them here would have misquoted the very count this report
certifies as unchanged.**

✅ **The report's total `U+FE0F` count is 18, which exactly accounts for the 18 paired warning signs and
leaves none attached to any other base.** ✅ **The five unpaired bases are internally consistent — 0 of
37, 0 of 30, 0 of 6, 0 of 5, 0 of 2 — so no base is split across two renderings.** ⚠️ **`U+1F525` FIRE
is bare twice by necessity: both are inside verbatim quotes of the cook branch's own `🔥 Cooking…`.

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
 M lib/settings-copy.ts
?? components/shared/CuisinePicker.tsx
?? components/shared/EventActionsModal.tsx
?? components/shared/EventFinishTimeModal.tsx
?? docs/cuisine-field-report.md
?? docs/extend-removal-report.md
?? docs/finish-time-dry-report.md
?? docs/kds-cook-display-split-report.md
?? docs/kds-event-bar-fix-report.md
?? docs/kds-event-bar-report.md
?? docs/kds-exit-point-report.md
?? docs/kds-pill-audit-report.md
?? docs/kds-ready-toggle-report.md
?? docs/kds-status-badge-report.md
?? docs/kds-step-switches-report.md
?? docs/kds-steps-model-report.md
?? docs/kds-toggles-review-report.md
?? docs/kds-two-switches-build-report.md
?? docs/kds-two-switches-report.md
?? docs/kds-view-removal-report.md
?? docs/offline-outbox-parity-report.md
?? docs/post-gate-parity-report.md
?? docs/settings-copy-report.md
?? lib/event-display.ts
?? lib/native/useGatedActionResult.tsx
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`?? docs/kds-cook-display-split-report.md`** | 🔴 **THIS TASK — the ONLY new entry, and the only file written** |
| `M components/dashboard/OrderCard.tsx` | ✅ **PRE-EXISTING — the step switches. 🔴 NOT touched this task; Stage 1 was read-only and Stage 2 never ran** |
| `M app/dashboard/[token]/kds/page.tsx` | ✅ pre-existing — eleven earlier tasks, last written by the post-gate extraction |
| `M app/dashboard/[token]/page.tsx` | ✅ pre-existing — the post-gate extraction and the settings-copy edit |
| `?? lib/native/useGatedActionResult.tsx` | ✅ pre-existing — the post-gate extraction |
| `M app/manage/[token]/page.tsx` · `M components/DemoGetStarted.tsx` · `?? components/shared/CuisinePicker.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/dashboard/AddOrderPanel.tsx` · `?? lib/event-display.ts` | ✅ pre-existing — the display extractions |
| `M lib/settings-copy.ts` | ✅ pre-existing |
| `M docs/reference-manual.md` | ✅ pre-existing — V11.22 |
| `?? components/shared/EventActionsModal.tsx` · `EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/*.md` (sixteen earlier reports) | ✅ pre-existing |

---

# 🔴 WHAT I NEED FROM YOU TO RUN STAGE 2

**One decision, on line 1138 only. Everything else in the brief is unblocked: the LIFECYCLE references
are identified and few (two that matter), the LAYOUT references are unambiguous and stay on `viewMode`,
and the MONEY bucket is small — with the caveat that one of its two members is dead code.**

**The question, with no recommendation attached: when a handover device sets the display to Cook, does
an item list show**

1. **the Full grouping minus the prices** — deals as deal blocks, deals first, `specialInstructions` — or
2. **the Cook grouping** — deals dissolved into category batches, `line.note`, the plain `<p>` markup?

**Option 1 keeps your rule "UNCHANGED in Cook: item names, quantities, category headings" literally true
and makes Cook purely a money filter. Option 2 keeps today's kitchen-facing batching, which is what a
cook screen was built to show, but changes what an item IS between the two display modes.**

**I have not chosen. Tell me which and I will run Stage 2 exactly as briefed.**
