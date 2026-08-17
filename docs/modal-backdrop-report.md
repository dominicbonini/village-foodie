# Modal backdrop — the lighter right-hand strip

**File changed:** `components/dashboard/PaymentActionsModal.tsx` — **the only file written apart from
this report**, and only its `shell()` wrapper.
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `diff` and `show` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any schema change.
✅ **`app/dashboard/[token]/page.tsx`, the KDS page, the Kitchen capacity panel and everything under
`app/api` are untouched** — `git diff --stat` on all four is **empty**.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# 🔴 THE CAUSE: `@container` ON THE ORDERS COLUMN MAKES IT THE CONTAINING BLOCK FOR `position: fixed`

**The backdrop is not being painted over. It is not reaching.** `fixed inset-0` resolved against the
**orders column**, not the viewport — so the dim stopped at that column's right edge and the `lg:w-48`
Kitchen capacity sidebar beside it was never covered.

```tsx
              <div className="@container lg:flex-1 lg:min-w-0 lg:min-h-0 lg:overflow-y-auto">
```

Tailwind's `@container` is `container-type: inline-size`, which applies **`contain: layout style
inline-size`** — and **layout containment makes an element the containing block for its
absolutely- and fixed-positioned descendants.** The modal is rendered *from inside an `OrderCard`*,
which lives in that column.

⚠️ **AND THE FILE ALREADY CLAIMS THE OPPOSITE, IN A COMMENT THAT STOPPED BEING TRUE:**

```tsx
      {/* Rendered from inside the card but positioned `fixed inset-0`, so it escapes the card's
          `overflow-hidden` and its grid cell entirely — it centres on the VIEWPORT and is therefore
          identical in solo, window and grid, at any column width. That is precisely what the inline
          confirm could not do. */}
```

🔴 **That was written before `@container` was added to the column.** A qualifier that was true when
written, falsified by a change somewhere else — the same shape the manual records at M10.

✅ **AND IT EXPLAINS THE GEOMETRY EXACTLY:** the strip is the sidebar's `lg:w-48` (192px) plus the
row's `lg:gap-5`; it appears only at **`lg:` and above**, because below that breakpoint the sidebar
does not render and the column is not `lg:flex-1`. **iPad portrait and every phone were never
affected — which matches "iPad, landscape" being where it was seen.**

---

# STAGE 1

## Q1 — The backdrop

**READ — one `shell()` helper serves every branch of this modal:**

```tsx
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
```

| Property | Value |
|---|---|
| positioning | `position: fixed` + `inset: 0` |
| 🔴 **fixed to the viewport?** | 🔴 **NO — see the cause above. It was fixed to the `@container` column** |
| z-index | `z-50` |
| dim | `bg-black/50` — 50% black, **uniform in the CSS**; the defect is coverage, not opacity |
| dismiss | backdrop click, suppressed while `busy` |

## Q2 — The Kitchen capacity panel, and 🔴 THE LEADING CANDIDATE REFUTED

**READ — the panel's container:**

```tsx
              <aside className="hidden lg:flex lg:flex-col lg:w-48 lg:flex-shrink-0 lg:min-h-0">
                <DayLoadStrip slots={displaySlots} eventDate={activeEvent?.event_date ?? null} variant="sidebar" />
              </aside>
```

**READ — the panel's own root:**

```tsx
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col min-h-0 flex-1">
      <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 shrink-0">Kitchen capacity</p>
```

# ✅ THE PANEL AND ITS ANCESTORS CARRY **NO** `z-index`, `position`, `transform`, `filter`, `opacity`, `will-change`, `backdrop-filter` OR `isolation`.

**EXECUTED — the full ancestor chain, each element's stacking-relevant properties:**

| Ancestor | Classes | Creates a stacking context / containing block? |
|---|---|---|
| `<body>` | `${geistSans.variable} ${geistMono.variable} antialiased` | no |
| app shell | `bg-slate-50 h-dvh flex flex-col overflow-hidden` | no |
| `<main>` | `w-full min-[1400px]:max-w-5xl … flex-1 min-h-0 overflow-y-auto lg:overflow-hidden …` | no |
| orders tab | `lg:h-full lg:min-h-0 lg:flex lg:flex-col` | no |
| the two-column row | `lg:flex lg:gap-5 lg:items-stretch lg:flex-1 lg:min-h-0` | no |
| 🔴 **the orders column** | 🔴 **`@container lg:flex-1 lg:min-w-0 lg:min-h-0 lg:overflow-y-auto`** | 🔴 **YES — `contain: layout style inline-size`** |
| `<aside>` | `hidden lg:flex lg:flex-col lg:w-48 lg:flex-shrink-0 lg:min-h-0` | no |
| `DayLoadStrip` root | `bg-white border … rounded-xl p-3 shadow-sm flex flex-col min-h-0 flex-1` | no |

🔴 **SO THE CANDIDATE IS REFUTED WHERE THE BRIEF EXPECTED IT AND CONFIRMED ON THE SIBLING.** The
transform/filter is not on the *panel* — it is `contain` on the *orders column beside it*. **The strip
is not lighter because something covers it; it is lighter because the backdrop's box ends before it.**

## Q3 — In place, not portalled (before this fix)

**READ — it was rendered in place**, from `OrderCard`:

```tsx
  const removePaymentModal = (
    <PaymentActionsModal
```

**Ancestors between the backdrop and `<body>`, innermost first:** `PaymentActionsModal`'s own shell →
`OrderCard`'s root `<div id={anchorId}>` → the order-card grid → the section wrapper → 🔴 **the
`@container` column** → the two-column `lg:flex` row → the orders-tab `<div>` → `<main>` → the app
shell → `<body>`.

# 🔴 EXACTLY ONE OF THEM ESTABLISHES A CONTAINING BLOCK FOR `fixed`: THE `@container` COLUMN.

## Q4 — 🔴 HOW MANY BACKDROP IMPLEMENTATIONS? **84, AND THEY DO NOT AGREE.**

**EXECUTED — every `fixed inset-0` overlay in `app/` and `components/`:**

| z-index | count | | dim | count |
|---|---|---|---|---|
| `z-50` | **55** | | `bg-black/40` | 1 |
| `z-[60]` | 15 | | **`bg-black/50`** | **34** |
| `z-[70]` | 4 | | **`bg-black/60`** | **34** |
| `z-[80]` | 2 | | `bg-black/70` | 2 |
| `z-[90]` | 1 | | `bg-white` (QR fullscreen) | 1 |
| `z-[100]` | 2 | | *(no dim — nested `absolute inset-0` instead)* | 7 |
| `z-40` | 1 | | | |
| `z-[55]` | 1 | | | |

# 🔴 THE FINDING: THERE IS NO SHARED BACKDROP. EVERY MODAL HAND-ROLLS ONE, AND THE TWO COMMONEST DIMS — `/50` AND `/60` — ARE USED **EXACTLY AS OFTEN AS EACH OTHER**.

⚠️ **Two dashboard modals opened together therefore dim by different amounts**, and seven overlays put
the dim on a nested `absolute inset-0` child instead of the fixed parent — a third shape again.
**NOT UNIFIED IN THIS TASK, as instructed.** §2.2 states what unifying would touch.

## Q5 — Which surfaces

| Surface | Affected? | Why |
|---|---|---|
| 🔴 **Dashboard, Orders tab, `lg:` and up** | 🔴 **YES** | the `@container` column, and `PaymentActionsModal` renders inside it — from `OrderCard` (`OrderCard.tsx:643`) and from the completed-orders list (`page.tsx:3547`) |
| Dashboard, below `lg:` | ✅ no | the sidebar does not render; the column is not the flex child it is at `lg:` |
| Dashboard, every modal mounted after `</main>` | ✅ no | `BuzzerGrid` (`:4560`), `RejectOrderModal` (`:4669`) and the nine page-level overlays are all **outside** the container — `</main>` closes at 4409 |
| **Add Order tab** | ✅ **no**, checked rather than assumed | it has its own `@container` divs (`AddOrderPanel.tsx:2092, 2097`) but its three overlays sit at **indent 8 against the containers' 10 and 12** — siblings, not descendants |
| 🔴 **KDS** | ✅ **NO** | **EXECUTED — `@container` does not appear anywhere in `app/dashboard/[token]/kds/page.tsx`.** Its order lists are plain flex/grid, so `fixed` there has always resolved to the viewport. **`PaymentActionsModal` renders on the KDS too, via the same `OrderCard`, and has always dimmed correctly there** |

---

# STAGE 2 — THE FIX

## 2.1 The change

```tsx
  const shell = (children: React.ReactNode) => {
    const overlay = (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && !busy && onClose()}>
        <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
          {children}
        </div>
      </div>
    )
    return typeof document === 'undefined' ? null : createPortal(overlay, document.body)
  }
```

🔴 **THE STACKING CONTEXT IS FIXED, NOT OUT-RANKED. No z-index changed** — `z-50` before, `z-50`
after. **No z-index could have helped:** nothing is painting over the backdrop, so raising it would
have changed nothing while looking like a fix. **The portal removes the containing ancestor**, which
is the cause.

**The two alternatives, and why they were not taken:**

| Option | Verdict |
|---|---|
| Remove `@container` from the column | 🔴 **NOT SAFE.** Its own comment: *"the order-card grids below size their column count off THIS content column's width (not the viewport), so iPad gets 3-across in both orientations"*. Removing it **changes the grid layout on the live dashboard** — the brief's STOP condition |
| Raise the backdrop's z-index | 🔴 **INEFFECTIVE**, and the arms race the brief warns about. Z-index cannot extend an element past its own containing block |
| ✅ **Portal to `<body>`** | changes **only** which DOM node the overlay hangs from |

## 2.2 ⚠️ NO LAYOUT OR SCROLL BEHAVIOUR CHANGED — SO NO STOP WAS TRIGGERED

- **Same markup, same classes, same `z-50`, same `bg-black/50`, same handlers.** The overlay JSX is
  character-identical; it is passed to `createPortal` instead of returned directly.
- **React events bubble through the REACT tree, not the DOM tree**, so every parent handler — including
  `OrderCard`'s — behaves exactly as before. **The modal was already a React child of `OrderCard` and
  still is.**
- **Nothing about the Kitchen capacity panel, the orders grid, `<main>`'s scrolling or the app shell
  was touched.**
- ⚠️ **`null` on the server, not rendered in place.** The component already returns `null` unless
  `open`, and `open` is only ever true after a client interaction, so the server never emits this shell
  and hydration has nothing to mismatch against.

**What unifying the other 83 would touch** — *not done*: a shared `<ModalShell>`, then 83 call sites
across the dashboard, KDS, manage, admin and the customer order page, each with its own z-index tier
(`z-50` through `z-[100]`), its own dim, and seven using a nested `absolute inset-0` instead. 🔴 **Any
of them rendered inside a future `@container` has this same latent defect**, and a shared shell is the
only thing that would close the class rather than this instance.

---

# VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.** `npx tsc --noEmit` exits 0. `npx eslint` on the changed file
reports **no findings, before or after** (HEAD's version compared via `eslint --stdin`).

| Required claim | Method |
|---|---|
| The backdrop covers the full viewport with uniform opacity, including the right-hand panel | 🔴 **SOURCE ONLY.** The cause is quoted and the mechanism is specified behaviour (`container-type` ⇒ `contain: layout` ⇒ containing block for fixed descendants), and a portal to `<body>` removes every containing ancestor. **NOTHING WAS RENDERED. The strip has not been seen to go** |
| No modal's contents, position or scroll behaviour changed | ✅ **EXECUTED** — `git diff` shows the overlay's JSX is character-identical; the only changed lines are the import, the `const overlay =` binding and the `createPortal` return. **No class string was edited** |
| The dashboard behaves correctly | 🔴 **SOURCE ONLY.** `git diff --stat` on `app/dashboard/[token]/page.tsx` is **empty** — the page itself is untouched — but the modal it mounts now portals |
| The KDS behaves correctly | ✅ **EXECUTED for the premise** — `@container` appears nowhere in the KDS page, so its `fixed` overlays already resolved to the viewport. 🔴 **The portal still applies there** (same shared component): positionally a no-op, **but not observed** |

## 🔴 WHAT WAS NOT VERIFIED

- **NOTHING WAS RENDERED AND NOTHING WAS TAPPED.** No `next dev`, no `next build`, no `cap sync`, no
  device.
- 🔴 **THE DIAGNOSIS IS INFERRED FROM GEOMETRY AND SPEC, NOT FROM A SCREENSHOT I CAN MEASURE.** It
  predicts: the lighter strip is **exactly** the sidebar's 192px plus the 20px gap, it appears **only**
  at `lg:` and above, and it appears **only** for `PaymentActionsModal` — the Remove-payment / refund
  modal reached from a PAID chip. ⚠️ **If the modal in your screenshot was a different one — Pause
  duration, Event actions, Buzzer — the cause is NOT this**, because those mount outside the container,
  and the diagnosis would need redoing.
- **The portal has not been exercised**, including the backdrop-click dismiss and the Android back
  handler while it is open.

---

# INTEGRITY

## `components/dashboard/PaymentActionsModal.tsx`

**Byte-level tool (Python over `open(…,'rb')`), never grep.**

```
BEFORE   bytes 18,104   chars 17,427   lines 327
AFTER    bytes 20,553   chars 19,803   lines 356
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 9 distinct classes before, 9 after. NO NEW CLASS, NONE REMOVED.**

| Codepoint | Before | After | Δ |
|---|---|---|---|
| U+2500 ─ | 282 | 301 | +19 |
| U+2014 — | 24 | 30 | +6 |
| U+1F534 🔴 | 9 | 12 | +3 |
| U+26A0 ⚠️ | 6 | 9 | +3 |
| U+FE0F | 6 | 9 | +3 |
| U+2026 … | 3 | 4 | +1 |
| U+21D2 ⇒ · U+00A3 £ · U+00B7 · | 2 · 2 · 2 | unchanged | **0** |

✅ **Every added character is comment prose. `U+26A0` and `U+FE0F` moved by the SAME +3**, which
is what a correctly-paired addition looks like. **Carrier-aware check on the source: `U+26A0`
n=9, 9 paired, 0 bare.**

## This report — SEPARATE pass, run AFTER writing

```
docs/modal-backdrop-report.md   bytes 16,504
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE:**

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 🔴 | 32 | 0 | 32 |
| U+2705 ✅ | 17 | 0 | 17 |
| **U+26A0 ⚠️** | **9** | **9** | ✅ **0** |

`U+1F534` and `U+2705` have **emoji presentation by default** and need no selector — bare is correct
for both. **`U+26A0` is the only base here that defaults to TEXT presentation**, and ✅ **every one of
its 9 occurrences is PAIRED — 9 OF 9, ZERO BARE.** ⚠️ **No other
emoji-presentation base occurs in this report at all**, so the table is complete rather than trimmed.
The report's total `U+FE0F` count is 9, which exactly accounts for the 9 paired warning
signs and leaves none attached to any other base.

## Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M components/dashboard/PaymentActionsModal.tsx
 M docs/reference-manual.md
?? docs/kds-event-isolation-fix-report.md
?? docs/kds-event-isolation-report.md
?? docs/kds-header-group-report.md
?? docs/kds-header-tidy-report.md
?? docs/kds-phone-controls-report.md
?? docs/modal-backdrop-report.md
?? docs/payment-method-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M components/dashboard/PaymentActionsModal.tsx` | 🔴 **THIS TASK — the only source file written.** It was clean at HEAD |
| 🔴 `?? docs/modal-backdrop-report.md` | 🔴 **THIS TASK** — this file |
| `M docs/reference-manual.md` | ✅ pre-existing — the V11.24 update. **Left alone, as instructed** |
| `?? docs/kds-event-isolation-report.md` | ✅ pre-existing — **left alone, as instructed** |
| `M app/dashboard/[token]/kds/page.tsx` · `?? docs/kds-event-isolation-fix-report.md` · `?? docs/kds-header-tidy-report.md` · `?? docs/kds-header-group-report.md` · `?? docs/kds-phone-controls-report.md` · `?? docs/payment-method-report.md` | ✅ pre-existing — the five preceding tasks. ⚠️ **Not named in the brief's two-entry list; left alone on the same footing** |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
