# KDS Cook display: reclaiming the empty price column

**Stage 1 found nothing load-bearing, so Stage 2 ran.** `npx tsc --noEmit` passes with no output —
**which is not verification.**

**One file changed: `components/dashboard/OrderCard.tsx`.** **No commit, no stage, no revert, no stash,
no clean.** No build, no `next dev`, no `next build`, no `cap sync`, no deploy, no SQL, no migration,
nothing under `app/api`. **`docs/kds-cook-split-build-report-2.md` was read and not overwritten.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

✅ **THE OUT-OF-SCOPE CONSTRAINT IS SAFE, AND IT WAS NEVER AT RISK.** Nothing here touches card width,
the grid's column count, `visibleOrders`, its 8-item cap or `overflowCount` — EXECUTED: none of those
identifiers appears in this task's diff, and all of them live in `kds/page.tsx`, which was not opened
for writing. **The change is entirely INSIDE one card, between two flex siblings.**

---

# STAGE 1 — Q1. THE ITEM ROW MARKUP, IN FULL

# 🔴 THERE IS NOT ONE ROW. THERE ARE FOUR, AND THEY DO NOT ALL BEHAVE THE SAME.

**That distinction is the whole of this task: two of the four already collapsed correctly, one reserved
an empty column, and one reserved a column that was ALWAYS empty even in Full.**

## ROW A — the deal header row

```tsx
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-normal text-slate-900 flex-1">🎁 {deal.name}</span>
                    <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900">
                      {!hideAmounts && deal.price != null ? `£${Number(deal.price).toFixed(2)}` : ''}
                    </span>
                  </div>
```

| Child | Classes | Behaviour under `hideAmounts` BEFORE |
|---|---|---|
| deal name | `text-sm font-normal text-slate-900 **flex-1**` | grows into whatever is left |
| price | `text-right tabular-nums **w-16 flex-shrink-0** text-sm text-slate-900` | 🔴 **span rendered, content `''`** — 64px reserved |

## ROW B — the deal-slot row

```tsx
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="flex-1 font-normal text-slate-900">1× {itemName}</span>
                          <span className="w-16 flex-shrink-0" />
                        </div>
```

🔴 **ITS SECOND CHILD IS A BARE SPACER WITH NO CONTENT AT ALL, IN FULL AND IN COOK ALIKE.** It exists
only to reserve the price column so a deal slot's name lines up with the priced rows above it.

## ROW C — the modifier row (two identical copies: deal slots, and standalone lines)

```tsx
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="flex-1 text-xs text-slate-500">+ {m.name}</span>
                                {!hideAmounts && m.price > 0 && <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-700">+£{m.price.toFixed(2)}</span>}
                              </div>
```

✅ **ALREADY CORRECT. The whole span is inside the `&&`, so under `hideAmounts` it is ABSENT from the
tree, not empty. This row already reflowed.** ⚠️ **It also already collapses in Full for any modifier
with `m.price === 0`, so the "no column" case is not new behaviour here.**

## ROW D — the main item row. 🔴 THIS IS THE ONE YOU OBSERVED.

```tsx
                        <button
                          onClick={ITEM_TICK_ENABLED ? () => itemIndex >= 0 && tapItem(itemIndex, line.quantity) : undefined}
                          className={`w-full flex justify-between items-baseline gap-2 ${viewMode === 'solo' || viewMode === 'window' ? 'text-sm' : 'text-base'} rounded py-1.5 text-left ${
                            ITEM_TICK_ENABLED
                              ? `transition-all active:scale-[0.99] select-none ${allDone ? 'opacity-40' : partDone ? 'bg-orange-50' : 'hover:bg-orange-50'}`
                              : 'cursor-default'
                          }`}>
                          <span className={`flex-1 font-normal transition-all ${allDone ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {line.quantity}× {line.name}
                            {partDone && <span className="text-orange-500 text-xs font-black ml-1.5">({struck}/{line.quantity})</span>}
                          </span>
                          {allDone
                            ? <span className="text-right tabular-nums w-16 flex-shrink-0 text-xs text-green-500 font-bold">✓</span>
                            : hideAmounts
                              ? <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900" />
                              : <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900">£{(line.unit_price * line.quantity).toFixed(2)}</span>
                          }
                        </button>
```

| Child, in order | Classes | Behaviour under `hideAmounts` BEFORE |
|---|---|---|
| **1. name** | `**flex-1** font-normal transition-all` + a strike/colour swap on `allDone` | grows into whatever is left |
| **2. price / ✓** | `text-right tabular-nums **w-16 flex-shrink-0**` (+ per-arm type/colour) | 🔴 **THE EMPTY SPAN — 64px reserved, nothing in it** |

**Container: `w-full flex justify-between items-baseline gap-2 … rounded py-1.5 text-left`.**

---

# Q2 — FLEX, NOT GRID. AND NOTHING IS SIZED AGAINST THE PRICE COLUMN.

# ✅ IT IS `flex justify-between items-baseline gap-2`. THERE IS NO GRID ANYWHERE IN THE ITEM AREA.

**EXECUTED — a scan of the whole Full arm for `grid`, `col-span`, `basis` and arbitrary `w-[…]` values
returns NOTHING.** ✅ **No grid template exists, so no column count can be disturbed.**

## What removing the price child does to every remaining child

| Child | Sized against the price column? | What happens when it goes |
|---|---|---|
| **the name span** | ⚠️ **INDIRECTLY, and this is the point.** `flex-1` means "take the free space", and the price column was consuming 64px of it plus the `gap-2`'s 8px | 🔴 **It gains 72px of text width and reflows. This is the intended and only intended effect** |
| **the `(struck/qty)` counter** | ✗ | ⚠️ nothing — it is INLINE TEXT inside the name span, not a sibling. It moves only as the text it sits in moves, and `ITEM_TICK_ENABLED` is false so it never renders |
| **the quantity** | ✗ | ⚠️ **there is no quantity COLUMN.** `{line.quantity}× {line.name}` is one text run inside the name span |
| **the container's `justify-between`** | — | ✅ **no-op.** With one child, `justify-between` places it at flex-start — and `flex-1` already fills the line, so the computed layout is identical either way |
| **the `gap-2`** | — | ✅ **no-op with one child.** Gap applies between children |
| **`items-baseline`** | — | ✅ **no-op with one child** |

# ✅ NO CHILD IS SIZED AGAINST THE PRICE COLUMN BY A FIXED WIDTH OR A GRID TEMPLATE. NOTHING BUT THE NAME MOVES. NO STOP.

---

# Q3 — THE OTHER ELEMENTS IN AND UNDER THE ROW

| Element | Present? | Moved or resized by removing the price column? |
|---|---|---|
| **quantity column** | 🔴 **NO SUCH COLUMN** — it is inline text in the name span | ✗ **it reflows WITH the name, which is the goal** |
| **tick column** | 🔴 **NO.** The `✓` occupies the SAME slot as the price and is mutually exclusive with it (`allDone ? ✓ : price`) | ✗ — and it keeps its own `w-16`, untouched. `ITEM_TICK_ENABLED` is false so it is unreachable anyway |
| **modifier line** | ✅ ROW C, a SEPARATE `<div>` below the `<button>`, inside `pl-4` | ✗ **independent flex container.** It already collapses its own column under `hideAmounts` |
| **note line** | ✅ `<span className="text-xs text-slate-500 italic">📝 {…}</span>` in a `flex-col` | ✗ **no width column at all** |
| **allergen / dietary indicator** | 🔴 **NONE EXISTS** — EXECUTED: a scan for `allergen`, `dietary`, `vegan`, `gluten` returns nothing in this file | n/a |
| **category heading** | ✅ `flex items-center gap-2` + a `flex-1 h-px` rule | ✗ **its own container; no `w-16` in it** |

---

# Q4 — THE DASHBOARD RENDERS THIS SAME MARKUP, AND CANNOT BE AFFECTED

✅ **YES — the Full arm is the `viewMode !== 'cook'` arm, so it serves BOTH `'window'` (KDS) and
`'solo'` (dashboard).** **That is precisely why every change is inside a `hideAmounts` arm.**

**The proof, unchanged from last task and re-verified:**

1. **`hideAmounts` defaults to `false`** — `OrderCard.tsx`: `hideAmounts = false,`
2. **The dashboard passes it nowhere** — ✅ **EXECUTED: `grep -c hideAmounts app/dashboard/[token]/page.tsx` → `0`.** Both of its `<OrderCard …>` call sites are absent from this task's diff.
3. **Therefore every gate below is a constant-false test on solo**, and the arm that runs is the one that was already running.

# ✅ REMOVING THE COLUMN IN COOK CANNOT CHANGE SOLO'S ELEMENT TREE, BECAUSE THE COLUMN IS NEVER REMOVED ON SOLO.

---

# STAGE 2 — THE CHANGE. THREE SITES, NOT ONE.

## ROW D — the observed defect

**BEFORE:**
```tsx
                            : hideAmounts
                              ? <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900" />
                              : <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900">£{(line.unit_price * line.quantity).toFixed(2)}</span>
```
**AFTER:**
```tsx
                            : hideAmounts
                              ? null
                              : <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900">£{(line.unit_price * line.quantity).toFixed(2)}</span>
```

✅ **ONE TOKEN CHANGED: the empty span became `null`.** ✅ **The `✓` arm and the price arm are
byte-identical.** 🔴 **`null` is absent from the tree — not `w-0`, not `invisible`, not an empty span.**

## ROW A — the deal price

**BEFORE:**
```tsx
                    <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900">
                      {!hideAmounts && deal.price != null ? `£${Number(deal.price).toFixed(2)}` : ''}
                    </span>
```
**AFTER:**
```tsx
                    {!hideAmounts && (
                      <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900">
                        {deal.price != null ? `£${Number(deal.price).toFixed(2)}` : ''}
                      </span>
                    )}
```

⚠️ **THE GATE MOVED OUT OF THE SPAN AND AROUND IT — and in doing so it RESTORED the span's original
child expression.** Before last task the child was `{deal.price != null ? … : ''}`; last task prefixed
`!hideAmounts &&` INSIDE it; this task lifts the gate outside, leaving the child exactly as it was
originally. 🔴 **On solo the rendered element is the same span with the same single expression child —
identical to both the current and the pre-`hideAmounts` tree.**

## ROW B — the always-empty spacer

**BEFORE:**
```tsx
                          <span className="w-16 flex-shrink-0" />
```
**AFTER:**
```tsx
                          {!hideAmounts && <span className="w-16 flex-shrink-0" />}
```

🔴 **THIS ONE WAS NOT IN YOUR LIST AND I AM FLAGGING IT RATHER THAN LEAVING IT.** It renders no price in
EITHER mode — it is pure reserved width, so that a deal slot's name lines up with the priced rows above
it. **With every price gone there is nothing left to line up with, and leaving it would reserve, on deal
slot lines only, exactly the column this task exists to reclaim.** ✅ **Its false arm is the original
span verbatim, so solo is untouched.**

## ROW C — no change needed

✅ **Both copies were already `{!hideAmounts && m.price > 0 && <span …>}` — the span already left the
tree. Not edited.**

## 🔴 SOLO — BEFORE AND AFTER, AND WHY THE TREE IS IDENTICAL

| Site | Solo BEFORE | Solo AFTER | Identical? |
|---|---|---|---|
| ROW D | `hideAmounts` is false ⇒ the price `<span>` | the same expression, same arm ⇒ the same `<span>` | ✅ **the arm is byte-identical** |
| ROW A | the `<span>` with child `{!hideAmounts && deal.price != null ? … : ''}` → evaluates to the price string or `''` | the `<span>` with child `{deal.price != null ? … : ''}` → **the same string or `''`** | ✅ **same element, same ONE expression child, same value** |
| ROW B | the spacer `<span>` | `true && <span>` ⇒ **the same span** | ✅ |

🔴 **THE PRECEDENT YOU NAMED WAS OBEYED. No markup was collapsed into a template literal and no child
list changed arity: ROW A's span has exactly one expression child before and after, and ROW D's price
span was not retyped at all.** ✅ **No text-node structure changed anywhere.**

# ✅ NO SOLO OUTPUT DIFFERS. NO STOP CONDITION MET.

---

# 🔴 THE ORDER TOTAL IN THE HEADER — IT ALREADY COLLAPSES. NO CHANGE MADE.

**You asked whether the header total leaves an empty slot too. ✅ IT DOES NOT — both totals were already
written with the gate OUTSIDE the span, so the element is absent, not empty. READ:**

```tsx
                {!hideAmounts && <span className="font-bold text-sm flex-shrink-0">£{Number(order.total).toFixed(2)}</span>}
```
```tsx
                  {!hideAmounts && <span className="font-bold text-base">£{Number(order.total).toFixed(2)}</span>}
```

**And the window cluster it sits in is a plain flex row with a gap — READ:**

```tsx
                <div className="flex items-baseline gap-1.5 flex-shrink-0">
                  {statusBadgeKds}
                  {!hideAmounts && <span className="font-bold text-base">£{Number(order.total).toFixed(2)}</span>}
                  {paidChip}
                  {allStruck && <span className="font-black text-xs opacity-70">✓</span>}
                </div>
```

✅ **THE `Ready` BADGE AND THE OTHER ROW-1 INDICATORS REPOSITION CORRECTLY, and the reason is
structural: `statusBadgeKds`, `paidChip` and the `✓` are siblings in an ordinary flex row with
`gap-1.5`.** When the total leaves the tree, the gap that preceded it goes with it and the remaining
children close up in order — badge, then paid chip, then ✓. ⚠️ **The cluster is `flex-shrink-0` and
right-aligned by its parent's `justify-between`, so it stays hard right and the `#order` number on the
left does not move.** 🔴 **Nothing was edited here.**

---

# WHAT WAS NOT TOUCHED

- ✅ **`hideAmounts`'s existing occurrences: all still money.** ⚠️ **THE COUNT WENT FROM TEN TO ELEVEN,
  DECLARED: the new one is ROW B's spacer gate. It guards RESERVED PRICE SPACE rather than a printed
  amount, which is the same category of thing and is the point of the task.** The other ten are
  unchanged in meaning; three of them changed shape (ROW A's gate moved outside its span, ROW D's empty
  span became `null`, ROW B is new).
- ✅ **`renderButtons`, `completionBtn`, `completionBtnDisabled`, the arm selection at the item split,
  `paidChipStatic` and its part-refund split, the status badge, `buzzerChip`, the late pill, the `✓`
  all-struck mark** — absent from the diff.
- ✅ **`boardMode`, `boardKeepsReady`, `displayOrders`, the two switches, the Full/Cook control,
  `lib/native/useGatedActionResult.tsx`, the `pendingPayment` prop, the grid cap, `overflowCount`,
  `doneOrders`, the overlay substitution, the event bar** — all in files this task did not open.

---

# 🔴 VERIFICATION

**`tsc --noEmit` passes with no output. THAT IS NOT VERIFICATION and is not counted.**

| Item | Method |
|---|---|
| **In Cook, a name that fits renders on ONE line where it previously wrapped** | 🔴 **SOURCE READ ONLY.** Argued from `flex-1` regaining `w-16` + `gap-2` = 72px. **NO BROWSER WAS OPENED AND NO CARD WAS MEASURED.** ⚠️ **Whether "1× Chicken wings Thai style" specifically now fits depends on the rendered column width, which no source read can settle** |
| **In Cook, no empty column remains beside any item name** | ⚠️ **PART EXECUTED, PART READ.** ✅ EXECUTED: every `w-16` in the item area is enumerated below and each is either gated by `hideAmounts` or is the `✓`. 🔴 **That the result LOOKS gapless was not observed** |
| **In Cook, a genuinely long name still wraps rather than overflowing** | 🔴 **SOURCE READ ONLY** — the name span carries no `truncate`, no `whitespace-nowrap` and no `min-w-0` change, so its wrapping behaviour is untouched; it simply wraps at a wider column. **Not observed** |
| **In Full, the row is pixel-identical to before** | 🔴 **SOURCE READ ONLY** — every changed site's false arm is the original markup. **Not rendered** |
| **The dashboard's row and header are identical to before** | 🔴 **SOURCE READ ONLY.** ✅ The `grep -c` → 0 at its call sites is EXECUTED; the rendering is not. 🔴 **NO BROWSER WAS OPENED ON GUSTO'S DASHBOARD** |
| **The card is not narrower and no more or fewer cards fit per row** | ✅ **EXECUTED, and this one is genuinely settled by scanning** — card width and the grid come from `kds/page.tsx`, which was NOT WRITTEN; `visibleOrders`, the 8-item cap and `overflowCount` appear nowhere in this diff. **The change is between two flex siblings inside a card whose outer box is untouched** |
| Every `w-16` in the item area is accounted for | ✅ **EXECUTED** — table below |
| No grid / `col-span` / `basis` / arbitrary width in the item area | ✅ **EXECUTED** — scan returns nothing |
| No allergen or dietary indicator exists | ✅ **EXECUTED** — scan returns nothing |
| Census, byte scan, bare `U+26A0` | ✅ **EXECUTED** |

## EXECUTED — every `w-16` in the item area, after the change

```
1283   <span … w-16 …>          ROW A price      — inside {!hideAmounts && ( … )}
1300   {!hideAmounts && <span className="w-16 flex-shrink-0" />}   ROW B spacer — gated
1307   {!hideAmounts && m.price > 0 && <span … w-16 …>}            ROW C modifier — already gated
1359   <span … w-16 … text-green-500>✓</span>                      ROW D tick — NOT money, kept
1362   <span … w-16 …>£{…}</span>                                  ROW D price — the else arm only
1370   {!hideAmounts && m.price > 0 && <span … w-16 …>}            ROW C modifier — already gated
```

✅ **Six sites. Five are money or reserved money-space and every one of them is behind `hideAmounts`.
The sixth is the `✓`, which is not money and is deliberately kept.**

🔴 **NOT ONE RENDERING CLAIM WAS BEHAVIOUR-VERIFIED. No browser, no device, no KDS was opened. The
symptom you observed was measured by YOU, not by me, and I have not re-observed the fix.**

---

# INTEGRITY

## Non-ASCII class census — `components/dashboard/OrderCard.tsx`

# ✅ 31 CLASSES BEFORE, 31 AFTER. NO CLASS GAINED OR LOST.

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| **U+26A0 WARNING SIGN** | 59 | 62 | **+3** | three new caveats — **all paired** |
| **U+FE0F** | 57 | 60 | **+3** | ✅ **matches the U+26A0 delta exactly** |
| U+1F534 LARGE RED CIRCLE | 57 | 58 | +1 | comment prose |
| U+2014 EM DASH | 178 | 179 | +1 | comment prose |
| **U+00D7 MULTIPLICATION SIGN** | 4 | 5 | **+1** | ⚠️ **the `1× Chicken wings Thai style` QUOTED IN A COMMENT** — the three rendering sites (`{line.quantity}× {line.name}`, `1× {itemName}`, and the cook arm's) are unchanged |
| *every other class* | — | — | **0** | 🔴 **including `U+00A3` at 25 — NOT ONE POUND SIGN WAS ADDED OR REMOVED. No price site was retyped; the gates moved around them** |

⚠️ **`U+2500` did not move either, so no comment banner was added — the three new comments sit inside
existing blocks. The file grew 1,381 bytes, all of it comment and JSX indentation.**

## 🔴 The 2 pre-existing bare `U+26A0`

| Base | BEFORE n / paired / bare | AFTER n / paired / bare |
|---|---|---|
| U+26A0 | 59 / 57 / **2** | 62 / 60 / **2** |

# ✅ UNCHANGED — STILL EXACTLY 2, AND THE SAME TWO.

**They are `⚠ PAYMENT NOT RECORDED — check before releasing` and `⚠ Last update didn't sync`, the two
conflict markers. All three warning signs added this task are PAIRED, which is why the total rose by
three and the bare count did not move.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. The report scanned in a SEPARATE pass AFTER writing.**

```
  components/dashboard/OrderCard.tsx                    101,181  offending=0  CR=0   (was 99,800)
  docs/kds-cook-reflow-report.md    (SEPARATE PASS)       25,343  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 53 | 0 | 53 |
| U+1F534 LARGE RED CIRCLE | 33 | 0 | 33 |
| **U+26A0 WARNING SIGN** | **16** | **14** | 🔴 **2** |
| U+2713 CHECK MARK | 13 | 0 | 13 |
| U+2717 BALLOT X | 7 | 0 | 7 |
| U+1F381 WRAPPED PRESENT | 2 | 0 | 2 |
| U+1F4DD MEMO | 2 | 0 | 2 |

# 🔴 TWO BARE U+26A0, BOTH ON ONE LINE, BOTH VERBATIM QUOTES.

**Every warning sign I wrote as prose is paired — 14 of 14. The two bare ones are both on the single
line that NAMES `OrderCard.tsx`'s two pre-existing bare glyphs, quoted in the form the source writes
them.** ✅ **EXECUTED — `OrderCard.tsx` measures `U+26A0 n=62 paired=60 bare=2` after this task, and its
two bare glyphs are exactly those two strings.** ⚠️ **Pairing them here would have misquoted the very
count this report certifies as unchanged.**

✅ **The report's total `U+FE0F` count is 14, which exactly accounts for the 14 paired warning signs and
leaves none attached to any other base.** ✅ **The six unpaired bases are internally consistent — 0 of
53, 0 of 33, 0 of 13, 0 of 7, 0 of 2, 0 of 2 — so no base is split across two renderings.** ⚠️ **`U+2713`,
`U+1F381` and `U+1F4DD` are bare because every occurrence is inside a verbatim quote of the card's own
markup — the `✓` tick, the `🎁` deal prefix and the `📝` note prefix — all of which the source writes
bare.

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
?? docs/kds-cook-reflow-report.md
?? docs/kds-cook-split-build-report-2.md
?? docs/kds-cook-split-build-report.md
?? docs/kds-event-bar-fix-report.md
?? docs/kds-event-bar-report.md
?? docs/kds-exit-point-report.md
?? docs/kds-pill-audit-report.md
?? docs/kds-ready-toggle-report.md
?? docs/kds-status-badge-report.md
?? docs/kds-status-badge-stage2-report.md
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
| 🔴 **`?? docs/kds-cook-reflow-report.md`** | 🔴 **THIS TASK — the only NEW entry** |
| `M components/dashboard/OrderCard.tsx` | ⚠️ **PARTLY** — the step switches, the cook split and the status badge were already there; **this task reclaimed the price column at three sites** |
| `M app/dashboard/[token]/kds/page.tsx` | ✅ pre-existing — twelve earlier tasks. 🔴 **NOT touched this task** |
| `M app/dashboard/[token]/page.tsx` | ✅ pre-existing. 🔴 **NOT touched** |
| `?? lib/native/useGatedActionResult.tsx` | ✅ pre-existing — the post-gate extraction |
| `?? docs/kds-cook-split-build-report-2.md` | ✅ pre-existing — **the build this follows, not overwritten** |
| `?? docs/kds-status-badge-stage2-report.md` · `?? docs/kds-status-badge-report.md` · `?? docs/kds-cook-display-split-report.md` · `?? docs/kds-cook-split-build-report.md` | ✅ pre-existing |
| `M app/manage/[token]/page.tsx` · `M components/DemoGetStarted.tsx` · `?? components/shared/CuisinePicker.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/dashboard/AddOrderPanel.tsx` · `?? lib/event-display.ts` | ✅ pre-existing — the display extractions |
| `M lib/settings-copy.ts` · `M docs/reference-manual.md` | ✅ pre-existing |
| `?? components/shared/EventActionsModal.tsx` · `EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/*.md` (twenty earlier reports) | ✅ pre-existing |

✅ **Eight modified and twenty-four untracked before; eight modified and twenty-five untracked after.
The single delta is this report. Only `OrderCard.tsx` was written among source files, as instructed.**
