# KDS Cook/Full — the build. D1, D3, D4, D5, D6.

**All five decisions built.** `npx tsc --noEmit` passes with no output — **which is not verification.**

**Two files changed:** `components/dashboard/OrderCard.tsx` and `app/dashboard/[token]/kds/page.tsx`.
**No commit, no stage, no revert, no stash, no clean.** No build, no `next dev`, no `next build`, no
`cap sync`, no deploy, no SQL, no migration, nothing under `app/api`.

**Untouched, verified by scan:** `boardMode`, `displayOrders`, `boardKeepsReady`, the two switches,
their keys, their dual-write persistence and defaults; `hg_kds_cardmode_` and its localStorage-only
storage; `lib/native/useGatedActionResult.tsx`, the `pendingPayment` prop and the payment overlay;
`completionBtn`, `completionBtnDisabled`, the board filters, the grid cap, `doneOrders`, the overlay
substitution, the event bar.

**No span of the prompt arrived garbled.** ⚠️ **One tension inside the brief resolved itself against the
enumeration rather than the summary — see "The two amounts that stay" below. It changed nothing I built;
I am reporting it, not asking about it.**

---

# 🔴 N1 — RECORDED AS INSTRUCTED, AND NOT FIXED

**N1 is the dual-write's own stated safety property failing: "the first paint must never show fewer
orders or fewer buttons than the stored configuration".**

⚠️ **The guard was written to protect the ORDERS half of that sentence and does protect it — READ,
`kds/page.tsx`:**

```
  // 🔴 AND THE ONE GUARD THE DUAL WRITE NEEDS. After a WKWebView cold kill localStorage can be empty
  // while Preferences still holds "handover on". For the frames before the reconcile lands, `handoverOn`
  // would fall to its unset default and — on a show_paid_step-true truck — DROP every 'ready' order from
  // the board. Showing MORE orders than configured is visible and harmless; showing fewer silently drops
  // a ticket.
```

🔴 **It keeps the ORDER on the board and then hands it to a `viewMode` derived from the same unset
default — so the order survives the first paint and its BUTTONS do not.** ⚠️ **That is a persistence
defect belonging with the dual-write reconciliation, not with this task.** ✅ **No `'ready'` case was
added to the cook branch; `renderButtons` was not touched at all.**

---

# D1 — `viewMode` IS `boardMode` AGAIN; `hideAmounts` CARRIES THE DISPLAY CHOICE

## The KDS call site — BEFORE

```tsx
  // KDS always uses window or cook — never solo
  // 🔴 THE CARD, AND ONLY THE CARD. Feeds OrderCard's `viewMode`, and through it showPrices,
  // partPaidRow, padding, item grouping and type size. It reaches no filter.
  const cardViewMode = cardMode
```
```tsx
                viewMode={cardViewMode}
```
```tsx
                readyStepOn={cardViewMode === 'window' && readyOn && handoverOn}
```

⚠️ **THE OLD COMMENT WAS TRUE AND STILL WRONG. "It reaches no filter" was correct — and irrelevant, because
the damage was never a filter. It was `renderButtons`.**

## AFTER

```tsx
  const hideAmounts = cardMode === 'cook'
```
```tsx
                /* 🔴 `boardMode`, NOT the display control. The two switches decide the button branch
                   and the layout; the Full/Cook toggle decides only `hideAmounts` below. */
                viewMode={boardMode}
```
```tsx
                readyStepOn={boardMode === 'window' && readyOn && handoverOn}
```
```tsx
                hideAmounts={hideAmounts}
```

✅ **`cardViewMode` is gone as an identifier — EXECUTED: the only surviving occurrence of that string in
the file is inside the comment that explains its removal.**

## 🔴 THE PROOF — `hideAmounts` IN NO LIFECYCLE REFERENCE

**EXECUTED — every occurrence in `OrderCard.tsx`, comments excluded:**

```
  94   hideAmounts = false,                                   ← prop default
 147   hideAmounts?: boolean                                  ← type
 563   : balance.status === 'part_refunded' ? (hideAmounts ? null : …)   ← D6, MONEY
 661   const partPaidRow = (hidePayments || viewMode === 'cook' || hideAmounts || …)  ← MONEY
1110   {!hideAmounts && <span …>£{Number(order.total)…}</span>}          ← D5 solo, MONEY
1133   {!hideAmounts && <span …>£{Number(order.total)…}</span>}          ← D5 window, MONEY
1235   {!hideAmounts && deal.price != null ? `£${…}` : ''}               ← D3, MONEY
1252   {!hideAmounts && m.price > 0 && <span …>+£{…}</span>}             ← D3, MONEY
1300   : hideAmounts ? <span … /> : <span …>£{…}</span>                  ← D3, MONEY
1308   {!hideAmounts && m.price > 0 && <span …>+£{…}</span>}             ← D3, MONEY
```

**EXECUTED — a line-range scan of the three lifecycle functions returns ZERO occurrences:**

```
  completionBtn          (402-470)   0
  completionBtnDisabled  (709-720)   0
  renderButtons          (845-981)   0
```

**EXECUTED — occurrences co-located with any status test: `0`** (scan for `hideAmounts` lines also
containing `order.status`, `includes(order`, `'ready'`, `'confirmed'`, `'cooking'` or `'collected'`).

# ✅ TEN OCCURRENCES, ALL TEN MONEY. NONE IN A BUTTON, A STATUS TEST OR A DIMENSION.

## 🔴 THE NOW-UNREACHABLE DISJUNCT — I LEFT IT, DELIBERATELY

```tsx
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
```

**With `viewMode` back on `boardMode`, `boardMode === 'window'` ⟺ `handoverOn` ⟺ `!hidePayments`, so the
second disjunct requires `handoverOn && !handoverOn`. It can never be true from the KDS.**

**I left it, for three reasons:**

1. 🔴 **You wrote: *"Do not touch `renderButtons` beyond what Decision 1 requires."* Decision 1 requires
   nothing inside `renderButtons` — the whole fix is at the call site. Removing the disjunct would be a
   `renderButtons` edit I was not asked for.**
2. ⚠️ **The unreachability is a property of ONE CALLER, not of the component.** `hidePayments` and
   `viewMode` are independent props; any future caller can set `window` + `hidePayments` and would then
   get the cook button set, which is what its own comment argues for — READ:

```
    // ⚠️ EXPLICITLY `viewMode === 'window'`, never a bare `hidePayments`. Solo is the DASHBOARD's mode;
    // gating on the mode by name makes it structurally impossible for this prop to reach it, whatever a
    // future caller passes.
```
3. ✅ **It is dead weight, not a hazard.** A branch that cannot be entered cannot misroute anything.

---

# D3 — LINE 1138 SPLIT BY HAND

**READ — the new header on the test:**

```tsx
          {/* ── Items: cook view vs window/solo view ─────────────────────────────────────────────────
              🔴 THIS TEST DECIDES THE RENDERING, NOT THE MONEY. It used to decide both at once — the cook
              arm hid every price AND changed what an item IS — which made it impossible to hide money
              without also changing the layout. The two were separated by hand:
                • WHICH ARM RUNS follows `viewMode` (the two switches). The kitchen rendering —
                  `itemGroups`, deals DISSOLVED into category batches, `line.note`, the plain <p> — is the
                  right rendering for a kitchen screen and is kept exactly as it was.
                • WHETHER PRICES PRINT inside whichever arm runs follows `hideAmounts` (the Full/Cook
                  control). The cook arm has never printed a price, so the gate appears only in the arm
                  below, at its four price sites.
              ⚠️ Both arms remain inert for ticking: ITEM_TICK_ENABLED is false, so the <button> in the
              window/solo arm has an undefined onClick and neither arm is an action. That is unchanged. */}
          {viewMode === 'cook' ? (
```

✅ **The cook arm is byte-identical — not one character changed.** ✅ **`ITEM_TICK_ENABLED` is still
`false`; the diff contains no edit to it or to `tapItem`.**

## The four price sites in the Full arm

**1 — the deal price. AFTER:**

```tsx
                    <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900">
                      {!hideAmounts && deal.price != null ? `£${Number(deal.price).toFixed(2)}` : ''}
                    </span>
```

**2 and 4 — the two modifier surcharges. AFTER:**

```tsx
                                {!hideAmounts && m.price > 0 && <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-700">+£{m.price.toFixed(2)}</span>}
```

**3 — the line price. AFTER:**

```tsx
                          {allDone
                            ? <span className="text-right tabular-nums w-16 flex-shrink-0 text-xs text-green-500 font-bold">✓</span>
                            : hideAmounts
                              ? <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900" />
                              : <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900">£{(line.unit_price * line.quantity).toFixed(2)}</span>
                          }
```

🔴 **THE `w-16` COLUMN IS KEPT AND EMPTIED, NEVER REMOVED.** It is LAYOUT — it is what aligns every row —
and the Full arm already renders it empty for a deal with no price and for deal-slot lines
(`<span className="w-16 flex-shrink-0" />`). **Deleting it would re-flow the list, and Cook is defined as
the same card minus the money, not a different card.**

✅ **The `✓` all-struck arm is not money and was not touched.**

---

# D4 — `showPrices` DELETED

**EXECUTED, immediately before deleting — the complete scan:**

```
623   // ⚠️ NOT IN COOK MODE, AND NOT WHEN `hidePayments`. Cook shows no prices at all (`showPrices` is
752   const showPrices = viewMode !== 'cook'
```

✅ **One declaration, one comment, ZERO reads. Deleted.** ✅ **The stale clause that cited it as
load-bearing was rewritten in the same pass:**

```
  // ⚠️ NOT IN COOK MODE, NOT WHEN `hidePayments`, AND NOT WHEN `hideAmounts`. Cook's header carries no
  // payment chip today; adding a money line would put money on the one screen deliberately without it.
  // It is absent there rather than overflowing there.
  // 🔴 `hideAmounts` IS THE THIRD DISJUNCT AND IT IS NOT REDUNDANT: a HANDOVER device (viewMode
  // 'window') whose display is set to Cook has neither of the first two true, and this row is a pure
  // monetary amount — "£6.50 paid, £6.50 due" — so it must go with the rest of the money.
  // ⚠️ The old clause here cited `showPrices` as the reason cook shows no prices. That variable had
  // ZERO consumers and has been deleted; the cook item renderer below is what omits prices.
```

⚠️ **EXECUTED — the only surviving `showPrices` in the file is that last sentence, which documents the
deletion.**

---

# D5 — THE HEADER TOTALS, AND THE PROOF THAT SOLO IS UNCHANGED

**BEFORE — solo:**
```tsx
                <span className="font-bold text-sm flex-shrink-0">£{Number(order.total).toFixed(2)}</span>
```
**AFTER — solo:**
```tsx
                {!hideAmounts && <span className="font-bold text-sm flex-shrink-0">£{Number(order.total).toFixed(2)}</span>}
```

**BEFORE — window:**
```tsx
                  <span className="font-bold text-base">£{Number(order.total).toFixed(2)}</span>
```
**AFTER — window:**
```tsx
                  {!hideAmounts && <span className="font-bold text-base">£{Number(order.total).toFixed(2)}</span>}
```

# 🔴 THE SOLO PROOF — THREE STEPS, EACH CHECKABLE

1. **`hideAmounts` defaults to `false`** — READ, `OrderCard.tsx:94`: `hideAmounts = false,`
2. **The dashboard passes it nowhere** — ✅ **EXECUTED: `grep -c hideAmounts app/dashboard/[token]/page.tsx` returns `0`.** Both of its `<OrderCard …>` call sites are unchanged in the diff.
3. **Therefore `!hideAmounts` is the constant `true`**, and `true && <span>` evaluates to that same `<span>` — the identical element, identical className, identical children `['£', expr]`.

## 🔴 THE ONE SITE WHERE I CHANGED MY OWN FIRST ATTEMPT, BECAUSE IT WOULD NOT HAVE BEEN IDENTICAL

**My first version of the line price collapsed the span's children into one template literal:**

```tsx
<span className="…">{hideAmounts ? '' : `£${(line.unit_price * line.quantity).toFixed(2)}`}</span>
```

🔴 **THAT IS NOT CHARACTER-IDENTICAL AND I REJECTED IT.** The original JSX `£{expr}` gives the span TWO
children — the literal `'£'` and the expression — which React server-renders with a separator between
adjacent text nodes. Collapsing them to one string produces the same visible text and **different
markup**. ⚠️ **On Gusto's live money path "the same to look at" is not the bar you set.** ✅ **The shipped
version keeps the original span verbatim on the `false` arm and adds a sibling arm for the hidden case,
so solo's element tree is untouched.**

✅ **The other three price sites needed no such care: each already had a SINGLE expression child
(`{cond ? '…' : ''}` or `{cond && <span>}`), so prefixing `!hideAmounts &&` leaves the false-case value
byte-identical.**

---

# D6 — `paidChipStatic` SPLIT

**BEFORE:**
```tsx
    : balance.status === 'part_refunded' ? <span title="Charged in full, then partly refunded. Nothing to collect." className="…">{money(balance.balanceMinor)} REFUNDED</span>
```
**AFTER:**
```tsx
    : balance.status === 'part_refunded' ? (hideAmounts ? null : <span title="Charged in full, then partly refunded. Nothing to collect." className="…">{money(balance.balanceMinor)} REFUNDED</span>)
```

**Per Answer 2 — hidden entirely, not reworded.** **The comment records why:**

```
    // 🔴 THE ONE ARM OF THIS CHAIN THAT CARRIES AN AMOUNT, AND THE ONLY ONE `hideAmounts` TOUCHES.
    // Hidden ENTIRELY in Cook rather than reworded to a bare "REFUNDED": that would make a part-refunded
    // order read identically to a fully refunded one, and the second still has money outstanding. A
    // refund is not actionable at a hatch, so nothing is lost by its absence and a new string invented
    // to avoid printing a number would be the wrong trade.
    // ⚠️ NULL HERE DOES NOT FALL THROUGH TO `PAID`. This is a ternary cascade: a part_refunded order
    // matches HERE and stops, so hiding the chip shows no chip, never a different one.
```

| Arm | Amount? | In Cook |
|---|---|---|
| `REFUNDED` (full) | ✗ | ✅ **renders** — a state, no number. Untouched |
| `{money(…)} REFUNDED` | 🔴 **YES** | 🔴 **hidden** |
| `PAID` | ✗ | ✅ **renders** — untouched |
| `CARD HELD` | ✗ | ✅ **renders** — untouched |

⚠️ **THE CASCADE POINT IS LOAD-BEARING AND WORTH RE-READING: `null` on the part-refund arm does NOT fall
through to `PAID`.** A part-refunded order matches that arm and stops, so Cook shows no chip on such an
order — not a different chip.

---

# ⚠️ THE TWO AMOUNTS THAT STAY, AND THE RULE THAT KEEPS THEM

**Your definition says HIDDEN: *"…Every monetary amount"*, and UNCHANGED: *"all buttons"*. Two BUTTON
LABELS carry an amount, so the two clauses point opposite ways. READ — `completionBtn`:**

```tsx
        label={effectivePartPaid ? `Mark ${money(balance.balanceMinor)} paid` : 'Mark paid'}
```

**and `completionBtnDisabled`:**

```tsx
      {effectivePaid || heldAuthorisation ? 'Collected' : completionPresses === 'one' ? 'Mark paid & collected' : effectivePartPaid ? `Mark ${money(balance.balanceMinor)} paid` : 'Mark paid'}
```

🔴 **I DID NOT GATE THEM, AND I DID NOT ASK, BECAUSE THE BRIEF DECIDES IT TWICE OVER:** *"UNCHANGED: all
buttons"* is an explicit enumeration, and the invariant list names `completionBtn` as untouched outright.
**A summary clause does not override two explicit ones.**

⚠️ **THE CONSEQUENCE, STATED SO IT IS NOT A SURPRISE ON A DEVICE: on a HANDOVER device with the display
set to Cook, a part-paid order's completion button still reads `Mark £6.50 paid`.** ✅ **It is the only
amount left on such a card.** **RECOMMENDING NOTHING — say the word and it is a one-line change, but it
is a `completionBtn` edit and you ring-fenced that.**

⚠️ **`InlinePriceEditor` also contains two `£` sites. It is exported from this file and has ZERO call
sites inside `OrderCard`'s own render — EXECUTED — so it never appears on a card and is not in scope.**

---

# 🔴 VERIFICATION

**`tsc --noEmit` passes with no output. THAT IS NOT VERIFICATION and is not counted below.**

| Item | Method |
|---|---|
| **Cook, both switches on, `confirmed` — same buttons as Full** | 🔴 **SOURCE READ ONLY.** Both switches on ⇒ `handoverOn` ⇒ `boardMode === 'window'` ⇒ `viewMode === 'window'` in BOTH display modes, and `hideAmounts` appears in no button branch — so the button set is *the same expression*, not merely a matching one. **No card was rendered** |
| **Cook, both switches on, `ready` — the completion control renders** | 🔴 **SOURCE READ ONLY** — window branch, `readyStepOn` true, `if (order.status === 'ready') return completionBtn()`. **The observed defect is addressed by construction; it was NOT re-observed** |
| **Cook — no line price, no total, no part-paid row, no refund amount** | 🔴 **SOURCE READ ONLY**, and ⚠️ **INCOMPLETE AS STATED: the two `Mark £X paid` button labels above are excluded by your own "all buttons" rule.** Every non-button amount is gated — the enumeration is above |
| **Cook — `PAID` and `CARD HELD` still render** | 🔴 **SOURCE READ ONLY** — neither arm was touched; only the part-refund arm was gated |
| **Cook — the kitchen item rendering is kept** | ✅ **EXECUTED** — the cook arm is byte-identical in the diff; not one character inside it changed |
| **Full/Cook changes no button, no board membership, no card dimension** | ✅ **EXECUTED for the code-level claim** — `hideAmounts` occurs 10 times, all money; zero in the three lifecycle functions; zero co-located with a status test; `displayOrders` and `boardMode` are absent from the diff. 🔴 **NOT OBSERVED as rendering** |
| **The dashboard renders identically, in every branch** | 🔴 **SOURCE READ ONLY.** The three-step proof above is an argument from `hideAmounts = false` plus `grep -c` = 0 at the call sites. ✅ **The `grep` is EXECUTED; the rendering is NOT.** 🔴 **NO BROWSER WAS OPENED ON GUSTO'S DASHBOARD** |
| **The payment overlay still renders on a queued `mark_paid`** | ✅ **EXECUTED as an untouched-ness claim** — `pendingPayment`, `paymentOverlay` and `useOfflinePaymentOverlay` do not appear in the diff of either file. 🔴 **The rendering itself was NOT observed** |
| `showPrices` had zero consumers when deleted | ✅ **EXECUTED** — scan run immediately before the deletion |
| `cardViewMode` is gone | ✅ **EXECUTED** — one surviving occurrence, inside a comment |
| Census, byte scan, carrier | ✅ **EXECUTED** |

🔴 **NOT ONE RENDERING CLAIM WAS BEHAVIOUR-VERIFIED. No browser, no device, no KDS was opened. Every
"it will show" is read from a branch or proved by a scan.**

---

# INTEGRITY

## Non-ASCII class census — before and after

### `components/dashboard/OrderCard.tsx` — **31 classes BEFORE, 31 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 1278 | 1372 | +94 | comment banners |
| U+2014 EM DASH | 153 | 168 | +15 | comment prose |
| **U+26A0 WARNING SIGN** | 47 | 54 | **+7** | seven new caveats — **all paired** |
| **U+FE0F** | 45 | 52 | **+7** | ✅ **matches the U+26A0 delta exactly** |
| U+1F534 LARGE RED CIRCLE | 47 | 54 | +7 | comment prose |
| U+00A3 POUND SIGN | 23 | 25 | +2 | ⚠️ **BOTH IN A COMMENT** — the `"£6.50 paid, £6.50 due"` example in the rewritten `partPaidRow` note. **No new price is rendered anywhere** |
| U+2022 BULLET | 8 | 10 | +2 | the two `•` in the D3 header |
| U+2713 CHECK MARK | 9 | 10 | +1 | the `✓` named in the D3 line-price comment |
| *every other class* | — | — | **0** | |

# ✅ NO CLASS GAINED OR LOST. EVERY DELTA IS COMMENT PROSE — the only glyph a reader might fear, `U+00A3`, gained exactly two and both are inside a comment.

### `app/dashboard/[token]/kds/page.tsx` — **33 classes BEFORE, 33 AFTER**

| Class | BEFORE | AFTER | Δ |
|---|---|---|---|
| U+2500 | 1627 | 1674 | +47 |
| U+1F534 | 74 | 76 | +2 |
| **U+26A0** | 64 | 65 | **+1** — paired |
| **U+FE0F** | 65 | 66 | **+1** — ✅ **matches** |
| U+2014 | 202 | 203 | +1 |
| *every other class* | — | — | **0** |

## 🔴 The 2 pre-existing bare `U+26A0` in `OrderCard.tsx`

| File | BEFORE n / paired / bare | AFTER n / paired / bare |
|---|---|---|
| `OrderCard.tsx` | 47 / 45 / **2** | 54 / 52 / **2** |
| KDS | 64 / 64 / **0** | 65 / 65 / **0** |

# ✅ UNCHANGED — STILL EXACTLY 2, AND THE SAME TWO.

**They are `⚠ PAYMENT NOT RECORDED — check before releasing` and `⚠ Last update didn't sync`, the two
conflict markers. Every one of the seven warning signs added this task is PAIRED, which is why the total
rose by 7 and the bare count did not move.** ✅ **The KDS still carries zero bare.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. The report scanned in a SEPARATE pass AFTER writing.**

```
  components/dashboard/OrderCard.tsx                     95,877  offending=0  CR=0   (was 90,137)
  app/dashboard/[token]/kds/page.tsx                    138,882  offending=0  CR=0   (was 137,629)
  docs/kds-cook-split-build-report-2.md (SEPARATE PASS)   25,990  offending=0  CR=0
TOTAL OFFENDING: 0
```

⚠️ **`OrderCard.tsx` grew 5,740 bytes and `showPrices` was DELETED — the growth is comment, not code.
Six of the ten `hideAmounts` sites are a single added token (`!hideAmounts && `).**

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 40 | 0 | 40 |
| U+1F534 LARGE RED CIRCLE | 35 | 0 | 35 |
| **U+26A0 WARNING SIGN** | **25** | **23** | 🔴 **2** |
| U+2717 BALLOT X | 3 | 0 | 3 |
| U+2713 CHECK MARK | 3 | 0 | 3 |

# 🔴 TWO BARE U+26A0, BOTH ON ONE LINE, BOTH VERBATIM QUOTES.

**Every warning sign I wrote as prose is paired — 23 of 23. The two bare ones are both on the single
line that NAMES `OrderCard.tsx`'s two pre-existing bare glyphs, quoted in the form the source writes
them.** ✅ **EXECUTED — `OrderCard.tsx` measures `U+26A0 n=54 paired=52 bare=2` after this task, and its
two bare glyphs are exactly those two strings.** ⚠️ **Pairing them here would have misquoted the very
count this report certifies as unchanged.**

✅ **The report's total `U+FE0F` count is 23, which exactly accounts for the 23 paired warning signs and
leaves none attached to any other base.** ✅ **The four unpaired bases are internally consistent — 0 of
40, 0 of 35, 0 of 3, 0 of 3 — so no base is split across two renderings.**

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
?? docs/kds-cook-split-build-report-2.md
?? docs/kds-cook-split-build-report.md
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
| 🔴 **`?? docs/kds-cook-split-build-report-2.md`** | 🔴 **THIS TASK — the only NEW entry** |
| `M components/dashboard/OrderCard.tsx` | ⚠️ **PARTLY** — the step switches were already there; **this task added `hideAmounts`, deleted `showPrices` and split lines 1138 / the chip chain / the two totals** |
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **PARTLY** — twelve earlier tasks; **this task rewired `viewMode`, `readyStepOn` and added `hideAmounts`** |
| `M app/dashboard/[token]/page.tsx` | ✅ pre-existing — the post-gate extraction and the settings-copy edits. 🔴 **NOT touched this task** |
| `?? lib/native/useGatedActionResult.tsx` | ✅ pre-existing — the post-gate extraction |
| `?? docs/kds-cook-display-split-report.md` · `?? docs/kds-cook-split-build-report.md` | ✅ pre-existing — the two Stage 1 reports this one continues |
| `M app/manage/[token]/page.tsx` · `M components/DemoGetStarted.tsx` · `?? components/shared/CuisinePicker.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/dashboard/AddOrderPanel.tsx` · `?? lib/event-display.ts` | ✅ pre-existing — the display extractions |
| `M lib/settings-copy.ts` · `M docs/reference-manual.md` | ✅ pre-existing |
| `?? components/shared/EventActionsModal.tsx` · `EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/*.md` (eighteen earlier reports) | ✅ pre-existing |

✅ **Eight modified and twenty-two untracked before; eight modified and twenty-three untracked after.
The single delta is this report — no source file was created or removed.**
