# KDS: the two axes, uncrossed

**Two files changed:** `components/dashboard/OrderCard.tsx` and `app/dashboard/[token]/kds/page.tsx`.
`npx tsc --noEmit` passes with no output — **which is not verification.**

**No commit, no stage, no revert, no stash, no clean.** 🔴 **NO `git stash`, no `git checkout`, no
`git restore` — the only git commands run this task were `status` and `diff`.** No build, no `next
dev`, no `next build`, no `cap sync`, no deploy, no SQL, no migration.

**Untouched, verified by scan:** the board filters, `boardMode`, `boardKeepsReady`, the two switches
and their keys/defaults/persistence, `renderButtons`, `completionBtn`, `completionBtnDisabled`,
`RejectOrderModal`, `useGatedActionResult`, the status badge, the event bar, the APNs work, and
anything under `app/api`.

**No span of the prompt arrived garbled.** 🔴 **BUT ONE PAIR OF YOUR OWN REQUIREMENTS COLLIDES, and I
have NOT resolved it — the part-paid row and the paid chip are TAPPABLE MONEY CONTROLS, not display.
See "The second crossing" below. Everything else in Stage 2 is built.**

---

# STAGE 1 — Q1. EVERY `viewMode` REFERENCE, CLASSIFIED

**EXECUTED — a file-wide scan. Thirteen code references (comments excluded).**

## Declarations — no axis

```tsx
  viewMode = 'solo',
```
```tsx
  viewMode?: ViewMode
```

## 🔴 LIFECYCLE — which buttons exist, and which statuses render what

```tsx
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
```
```tsx
    if (viewMode === 'window') {
```
```tsx
            {viewMode === 'solo' && (['pending', 'confirmed', 'modified'].includes(order.status) || ['confirmed', 'modified', 'ready'].includes(order.status)) && (
```

**THREE. The first two select the button set; the third gates the ghost Edit/Cancel row, and is
solo-only so the KDS never reaches it.**

## PRESENTATION — padding, type size, header markup, item rendering, money

```tsx
  const partPaidRow = (hidePayments || viewMode === 'cook' || hideAmounts || !effectivePartPaid) ? null : (
```
```tsx
      {viewMode === 'cook' ? (
        /* Cook: non-interactive two-line header, no collapse */
```
```tsx
        <div className={`w-full text-left ${viewMode === 'window' ? 'px-3 py-2' : 'px-4 py-3'} ${headerCls}`}>
```
```tsx
          {viewMode === 'solo' ? (
```
```tsx
          {viewMode === 'cook' ? (
            <div className="mb-2">
```
```tsx
                          className={`w-full flex justify-between items-baseline gap-2 ${viewMode === 'solo' || viewMode === 'window' ? 'text-sm' : 'text-base'} rounded py-1.5 text-left ${
```
```tsx
            <div className={`bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 mx-3 rounded-md flex items-start gap-2 text-sm ${viewMode === 'solo' ? 'mb-2' : 'mb-3'}`}>
```

**SEVEN.**

| Axis | Count | Lines (before the change) |
|---|---|---|
| Declaration | 2 | 93, 128 |
| 🔴 **LIFECYCLE** | 3 | 906, 931, 1427 |
| **PRESENTATION** | 7 | 661, 1082, 1110, 1111, 1232, 1339, 1394 |

---

# Q2 — WHAT A PAYMENT/COLLECTED-OFF, `Full` DEVICE RENDERED, VERSUS WHAT IT SHOULD

**Payment/Collected OFF ⇒ `handoverOn` false ⇒ `boardMode === 'cook'` ⇒ `viewMode === 'cook'`, whatever
`Full` says.**

| Presentation reference | TODAY (before) | SHOULD (and now does) |
|---|---|---|
| header markup | 🔴 **COOK header** — two lines, `text-lg` order number | ✅ **WINDOW header** — `text-3xl` order number |
| header padding | cook's own `px-3 py-2` | ✅ window's `px-3 py-2` — **the same, so nothing moved here** |
| solo-vs-window split | not reached | ✅ window arm |
| item rendering | 🔴 **COOK arm** — deals dissolved, `line.note`, plain `<p>`, **no prices** | ✅ **FULL arm** — deal blocks, `specialInstructions`, `<button>` rows, **prices** |
| item line type | not reached (cook arm hardcodes `text-sm`) | ✅ `text-sm` via the `'window'` branch |
| notes-block margin | `mb-3` | ✅ `mb-3` — **unchanged either way** |
| `partPaidRow` | hidden | ⚠️ **STILL HIDDEN — by `hidePayments`, not by this axis. See the second crossing** |

✅ **The order total and the line prices were ALREADY on the right axis — both are gated by
`hideAmounts` alone — so a `Full` device now shows them.**

---

# Q3 — CAN IT BE SPLIT WITHOUT ANY REFERENCE NEEDING BOTH?

# ✅ YES. NO `viewMode` REFERENCE NEEDS BOTH AXES. NO STOP CONDITION MET.

**Each of the three lifecycle references tests only which buttons exist; each of the seven presentation
references tests only what is drawn. There is no expression that reads `viewMode` for both purposes.**

⚠️ **THE ONE STRUCTURAL REQUIREMENT: the presentation axis needs THREE values, not two.** The
references distinguish `'solo'` (dashboard), `'window'` and `'cook'`, while the Full/Cook control
produces only the latter two. ✅ **Solved by defaulting the new prop to `viewMode`, so a caller that
passes only `viewMode` — the dashboard — resolves both to `'solo'` and is untouched.**

---

# Q4 — EXACTLY WHAT SHRANK, AND WHY

# 🔴 THE ORDER NUMBER: `text-lg` INSTEAD OF `text-3xl`. THAT IS 1.125rem AGAINST 1.875rem.

**READ — the cook header, which a Payment-off device was rendering:**

```tsx
        <div className={`w-full px-3 py-2 ${headerCls}`}>
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-lg font-bold text-slate-900 truncate">#{order.id}</span>
```

**READ — the window header, which `Full` should have rendered:**

```tsx
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-3xl font-bold">#{order.id}</span>
```

**Every difference, named:**

| Element | Cook (was rendering) | Window (`Full` should) | Shrank? |
|---|---|---|---|
| **order number** | `text-lg` | `text-3xl` | 🔴 **YES — the one you saw** |
| **customer name** | `nameEl('text-xs text-slate-600 min-w-0')` | `nameEl('opacity-80 min-w-0')` inheriting `text-sm` from `font-medium text-sm` | 🔴 **YES — `text-xs` vs `text-sm`** |
| **time / lateness** | `text-xs` | inherits `text-sm` | 🔴 **YES** |
| header padding | `px-3 py-2` | `px-3 py-2` | ✅ **NO — identical** |
| item lines | cook arm, `text-sm` | full arm, `text-sm` via the `'window'` branch | ✅ **NO** |
| notes-block margin | `mb-3` | `mb-3` | ✅ **NO** |

⚠️ **`px-4 py-3` IS THE SOLO PADDING AND WAS NEVER IN PLAY ON THE KDS** — the `'window'` branch already
selected `px-3 py-2`, which is what cook uses too.

## 🔴 COOK'S LARGE-TYPE TREATMENT WAS LOST EARLIER, AND I HAVE NOT REINTRODUCED IT

**One line still carries it, and it is UNREACHABLE:**

```tsx
${cardStyle === 'solo' || cardStyle === 'window' ? 'text-sm' : 'text-base'}
```

⚠️ **`text-base` is the cook arm of that ternary — but it sits inside the FULL item renderer, which cook
never runs.** ✅ **So cook's item lines are `text-sm`, hardcoded in its own arm, and this `text-base` has
had no effect since the item renderers were split.** 🔴 **The `docs/kds-cook-split-build-report-2.md`
backlog records the same thing: *"the old cook view's bigger type and different header were a genuine
legibility feature for a grill screen a metre away. Dropped so Cook means one thing. If wanted back, it
needs its own control and its own name."*** **NOT reintroduced here, as instructed.**

---

# Q5 — THE "To make" BAR AND THE "Done today" STRIP

**READ — both follow `boardMode` today:**

```tsx
      {allDayPills.length > 0 && boardMode === 'window' && (
```
```tsx
          {boardMode === 'window' && activeLayout === 'list' && doneOrders.length > 0 && (
```

⚠️ **Their existing comments call the gate deliberate — *"ON boardMode, DELIBERATELY — the card toggle
must not hide it"*** — which was written when `cardMode` was the thing that might wrongly hide them.

**Under the two axes as you have now stated them:**

| Element | Lifecycle or presentation? | Reasoning |
|---|---|---|
| **"Done today" strip** | 🔴 **LIFECYCLE, and correctly gated** | It renders `doneOrders` — orders that have LEFT the board. Which orders exist on a screen is exactly what the switch decides |
| **"To make" pill bar** | ⚠️ **NEITHER CLEANLY — it is a BOARD-LEVEL aggregate, not a card** | It totals outstanding items across the board. It is not "what the card shows", so `cardStyle` has no claim on it; but it is also not board MEMBERSHIP. 🔴 **Arguably it belongs on neither axis and wants its own control** — the same conclusion the earlier backlog reached |

🔴 **REPORTED, NOT CHANGED, as instructed.**

---

# STAGE 2 — THE SPLIT

## The new prop

```tsx
  viewMode = 'solo',
  // ⚠️ DEFAULTS TO `viewMode`, WHICH IS WHAT KEEPS EVERY EXISTING CALLER BYTE-IDENTICAL. The dashboard
  // passes neither, so both resolve to 'solo' and every branch below behaves exactly as it did.
  cardStyle = viewMode,
```

⚠️ **A destructuring default may reference an earlier-bound property, so `cardStyle` falls back to
`viewMode` with no call-site change and no `??` at every use.**

## The KDS call site

```tsx
                /* 🔴 THE LIFECYCLE AXIS — `boardMode`, from the two switches. It decides the button
                   branch and NOTHING about appearance. `cardStyle` below is the presentation axis. */
                viewMode={boardMode}
```
```tsx
                cardStyle={cardMode}
```

## 🔴 THE PROOF — EVERY REFERENCE, AFTER

**EXECUTED — every `viewMode` / `cardStyle` code reference in the file:**

```
 93:  viewMode = 'solo',                                              declaration
 96:  cardStyle = viewMode,                                           declaration
135:  viewMode?: ViewMode                                             type
149:  cardStyle?: ViewMode                                            type
682:  partPaidRow … cardStyle === 'cook' …                            PRESENTATION
927:  if (viewMode === 'cook' || (viewMode === 'window' && …))        LIFECYCLE
952:  if (viewMode === 'window') {                                    LIFECYCLE
1103: {cardStyle === 'cook' ? (            header markup              PRESENTATION
1131: cardStyle === 'window' ? 'px-3 py-2' : 'px-4 py-3'              PRESENTATION
1132: {cardStyle === 'solo' ? (            solo vs window             PRESENTATION
1253: {cardStyle === 'cook' ? (            item renderer              PRESENTATION
1360: cardStyle === 'solo' || cardStyle === 'window' ? …              PRESENTATION
1415: cardStyle === 'solo' ? 'mb-2' : 'mb-3'                          PRESENTATION
1448: {viewMode === 'solo' && ([…statuses…]) && (                     LIFECYCLE
```

# ✅ THREE LIFECYCLE ON `viewMode`. SEVEN PRESENTATION ON `cardStyle`. NOT ONE CROSSING.

**EXECUTED — the additional scans you asked for:**

```
hideAmounts inside completionBtn / completionBtnDisabled / renderButtons   → 0
hideAmounts co-located with any status test                                → 0
cardStyle  inside completionBtn / renderButtons                            → 0
cardStyle passed by the dashboard                                          → 0
```

⚠️ **`hideAmounts` keeps its money-only role and is now partly redundant with `cardStyle === 'cook'` —
on the KDS both derive from `cardMode`, so they are the same boolean. Left alone: collapsing them is a
change nobody asked for, and `hideAmounts` is the one the money sites already read.**

---

# 🔴 THE SECOND CROSSING — I STOPPED HERE RATHER THAN CHOOSING

**Your Stage 2 says `Full` must show, on every switch combination, *"prices, the order total, the
part-paid row, refund amounts…"*. ✅ Prices, the total, the full-size header, the full-size order number
and the Full item rendering all now do. 🔴 THE PART-PAID ROW AND THE REFUND-AMOUNT CHIP DO NOT, AND I
DID NOT FORCE THEM.**

**Because they are not display. READ — the part-paid row is a `<button>`:**

```tsx
  const partPaidRow = (hidePayments || cardStyle === 'cook' || hideAmounts || !effectivePartPaid) ? null : (
    <button
      onClick={() => setConfirmRemovePayment(true)}
      title={hasReversibleInPersonPayment ? 'Tap to remove this payment' : 'Tap for how to refund this'}
```

**and the paid chip is wrapped in one too, opening the same modal:**

```tsx
  const paidChip = paidChipStatic === null ? null : heldAuthorisation && !effectivePaid ? (
```

🔴 **BOTH ARE TAP TARGETS INTO `PaymentActionsModal` — the remove-payment / refund flow.** ⚠️ **So
`hidePayments` gating them is not an appearance decision; it is your other rule — *"Payment/Collected
decides … whether the payment and collected buttons exist"* — applied to two controls that happen to
carry an amount.**

# ⚠️ THE TWO REQUIREMENTS COLLIDE ON EXACTLY THESE TWO ELEMENTS:

| | Says |
|---|---|
| **"`Full` means everything"** | show the part-paid row and refund amounts on a Payment-off device |
| **"Payment/Collected decides whether the payment … buttons exist"** | do not put a payment control on a Payment-off device |

**There is no reading that satisfies both, because these elements are simultaneously an amount and a
control.** 🔴 **NOT RESOLVED. Nothing was changed at either site beyond moving the `viewMode === 'cook'`
disjunct to `cardStyle === 'cook'`, which is the axis fix and changes no output.**

**The three ways out, named, none chosen:** render them non-tappable on a Payment-off Full device ·
accept them as controls and amend "everything" to exclude them · leave the chip and drop only the row.

---

# 🔴 VERIFICATION

| Item | Method |
|---|---|
| **Full + Payment OFF renders prices, total and full-size text** | 🔴 **SOURCE READ ONLY.** Traced: `cardStyle='window'` ⇒ the window header (`text-3xl`) and the Full item arm; the total and line prices are gated by `hideAmounts`, which is false under Full. **NO BROWSER WAS OPENED** |
| **…and the part-paid row** | 🔴 **NO — IT DOES NOT, AND I SAID SO ABOVE.** This acceptance item is not met, deliberately |
| **Full + Payment ON renders identically apart from buttons** | 🔴 **SOURCE READ ONLY** — both resolve `cardStyle='window'`, and every presentation reference now reads only `cardStyle`. **The identity is structural, not observed** |
| **Cook renders identically on both switch settings** | 🔴 **SOURCE READ ONLY** — same argument with `cardStyle='cook'` |
| **No text shrinks between switch settings within one display mode** | ✅ **EXECUTED as a code fact** — no type-size or padding expression reads `viewMode` any more; the scan above is exhaustive. 🔴 **Not measured on a screen** |
| **Buttons still follow the switches** | ✅ **EXECUTED** — all three lifecycle references still read `viewMode`, and `renderButtons` contains zero `cardStyle` and zero `hideAmounts` |
| **The dashboard is unchanged in every branch** | 🔴 **SOURCE READ ONLY**, on a three-step argument: `cardStyle` defaults to `viewMode`; the dashboard passes neither (`grep -c cardStyle` → **0**); so both are `'solo'` and every branch takes the arm it always took. ✅ **The grep is EXECUTED. 🔴 NO BROWSER WAS OPENED ON GUSTO'S DASHBOARD** |
| Q5's two gates read `boardMode` | ✅ **EXECUTED** |
| Cook's large type is unreachable, not removed here | ✅ **EXECUTED** — the `text-base` arm sits in the renderer cook never runs |
| Census, byte scan | ✅ **EXECUTED** |

🔴 **NOTHING WAS OBSERVED RENDERING. Every "it now shows" is read from a branch.**

---

# INTEGRITY

## Non-ASCII class census

### `components/dashboard/OrderCard.tsx` — **31 classes BEFORE, 31 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 1418 | 1518 | +100 | the two prop-doc banners |
| U+2014 EM DASH | 179 | 184 | +5 | comment prose |
| **U+26A0 WARNING SIGN** | 62 | 64 | **+2** | two new caveats — **both paired** |
| **U+FE0F** | 60 | 62 | **+2** | ✅ **matches exactly** |
| U+1F534 LARGE RED CIRCLE | 58 | 61 | +3 | comment prose |
| *every other class* | — | — | **0** | 🔴 **including `U+00A3` at 25 — NOT ONE POUND SIGN MOVED. No money site was retyped; only the axis a branch reads changed** |

### `app/dashboard/[token]/kds/page.tsx` — **33 classes BEFORE, 33 AFTER**

**bytes 143,988 → 144,553.** ⚠️ **The only change is the `cardStyle` prop and its comment; `U+26A0`
holds at 69/69/0 bare.**

## 🔴 Bare `U+26A0`

| File | BEFORE | AFTER |
|---|---|---|
| `OrderCard.tsx` | 62 / 60 / **2 bare** | 64 / 62 / **2 bare** ✅ **unchanged** |
| KDS | 69 / 69 / **0** | 69 / 69 / **0** ✅ |

**The two are the pre-existing conflict markers. Both warning signs added this task are paired.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

```
  components/dashboard/OrderCard.tsx                   103,048  offending=0  CR=0   (was 101,181)
  app/dashboard/[token]/kds/page.tsx                   144,553  offending=0  CR=0   (was 143,988)
  docs/kds-axes-split-report.md    (SEPARATE PASS)      19,679  offending=0  CR=0
TOTAL OFFENDING: 0
```

⚠️ **`OrderCard.tsx` grew 1,867 bytes for a change that renamed seven identifiers — the growth is the
two prop docs explaining which axis is which, which is the part that stops the next brief re-crossing
them.**

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 37 | 0 | 37 |
| U+2705 WHITE HEAVY CHECK MARK | 32 | 0 | 32 |
| **U+26A0 WARNING SIGN** | **16** | **16** | ✅ **0** |

# ✅ EVERY WARNING SIGN IN THIS REPORT IS PAIRED — 16 OF 16, ZERO BARE.

⚠️ **Nothing this report quotes carries a bare `U+26A0`.** `OrderCard.tsx` has two — the conflict
markers — but this task neither touches nor quotes them, **so 0 is the correct number here rather than
a suppressed one.**

✅ **The report's total `U+FE0F` count is 16, which exactly accounts for the 16 paired warning signs and
leaves none attached to any other base.** ✅ **The two unpaired bases are internally consistent — 0 of
37, 0 of 32 — so neither is split across two renderings.** ⚠️ **No other emoji-presentation base appears
in this report at all.

## `git status --porcelain`

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/OrderCard.tsx
 M docs/reference-manual.md
 M lib/apns.ts
?? components/shared/RejectOrderModal.tsx
?? docs/apns-key-fix-report.md
?? docs/apns-token-cleanup-report.md
?? docs/kds-axes-split-report.md
?? docs/kds-reject-parity-build-report.md
?? docs/kds-reject-parity-report.md
?? docs/push-diagnosis-report.md
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`?? docs/kds-axes-split-report.md`** | 🔴 **THIS TASK — the only NEW entry** |
| `M components/dashboard/OrderCard.tsx` | 🔴 **THIS TASK — it was CLEAN before this task began** |
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **PARTLY** — the reject interception was already uncommitted here; **this task added `cardStyle`** |
| `M app/dashboard/[token]/page.tsx` | ✅ pre-existing — the reject-parity build. 🔴 **NOT touched this task** |
| `?? components/shared/RejectOrderModal.tsx` · `?? docs/kds-reject-parity-*.md` | ✅ pre-existing — the reject-parity task |
| `M lib/apns.ts` · `?? docs/apns-*.md` · `?? docs/push-diagnosis-report.md` | ✅ pre-existing — the APNs tasks |
| `M docs/reference-manual.md` | ✅ pre-existing — the V11.23 update |
