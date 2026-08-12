# The order card — layout map, and what already lives top right

**Date:** 13 August 2026
**READ-ONLY DIAGNOSIS. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

⚠️ **ONE THING TO SETTLE BEFORE ANYTHING ELSE.** "The paid button" is `paidChip` — the green **PAID** pill — and **it is already top right in two of the three view modes.** In solo it is the last element of header **row 2**; in window it is in the row-1 right cluster; in cook it does not render at all. **So this is a move of about one row in one mode, not a relocation across the card.** §4.

---

## 1. The full layout map

**Source: QUOTED.** `components/dashboard/OrderCard.tsx`, 1102 lines.

### Module-level, outside the card

| Lines | Region |
|---|---|
| 22-44 | `Toggle`, `Btn` — shared primitives |
| 46-70 | 🔴 `InlinePriceEditor` — **the card's own tappable-text precedent** (§7) |
| 72-76 | `addMinsToSlot` |

### Inside `OrderCard` — computation, no markup

| Lines | What |
|---|---|
| 80-193 | Props and their documentation |
| 195-206 | Paid-step settings via `resolvePaidStep` |
| 208-232 | 🔴 **Payment state** — `balance`, `isPaid`, `effectivePaid`, `effectivePartPaid` |
| 236-350 | `completionBtn()` — the bottom-row money/complete button |
| 352-425 | 🔴 **`paidChipStatic` / `paidChip`** — the element in question |
| 427-462 | `removePaymentModal` — `fixed inset-0`, escapes the card |
| 464-498 | 🔴 **`buzzerChip`** |
| 503-511 | `completionBtnDisabled()` |
| 527-567 | Timing: `slotOffset`, `urgencyState`, `headerCls`, `s` (status style), `allStruck` |
| 569-624 | Item grouping |
| 625-635 | 🔴 **`offsetLabel`** and **`isLate`** |
| 637-741 | `renderButtons()` — per-view-mode bottom actions |
| 745-771 | 🔴 **`nameEl`** — the customer name as contact control (§7) |
| 773-786 | `conflictMarker` |

### The rendered card — 788 to 1101

| Lines | Region | Contains |
|---|---|---|
| **789** | **Card root** | `rounded-2xl overflow-hidden flex flex-col`. Border colour encodes `conflict`/`pendingSync` |
| **791** | **Conflict banner** | Full-width red or amber bar, above the header |
| **797** | **Remove-payment modal** | `fixed inset-0` — escapes the card entirely |
| **800-820** | 🔴 **HEADER — cook mode** | R1: `#id` + buzzer + `ml-auto` time/late. R2: name + `✓` |
| **822-895** | 🔴 **HEADER — solo & window** | Two branches, below |
| **831-849** | **solo R1** | `#id`, `· time`, buzzer, then `ml-auto` group: late pill / offset, `✓` |
| **850-861** | **solo R2** | name (`flex-1`), status badge, **£total**, 🔴 **`paidChip`** |
| **867-882** | **window R1** | left: `#id` + buzzer. right (`flex-shrink-0`): **£total**, 🔴 **`paidChip`**, `✓` |
| **883-891** | **window R2** | name, `ml-auto` time, late pill / offset |
| **896-910** | **Contact panel** | `mailto:` and `tel:` links. Only when `showContact` |
| **912-1099** | **Body** (`expanded` is a hardcoded `true`, `:189`) | items, notes, time-adjust, actions |
| 914-1041 | Items | cook vs window/solo renderings |
| 1042-1054 | Notes / allergy block | |
| 1056-1069 | Quick time adjust | `pending` + `slot` + not cook |
| 1071-1097 | **Bottom actions** | ghost Edit/Cancel (solo only), then `renderButtons()` |

---

## 2. 🔴 EVERY ELEMENT THAT CAN RENDER TOP RIGHT

**Source: QUOTED.** "Top right" = the right-hand cluster of header **row 1**, plus — in solo — the right of **row 2**, since that is where `paidChip` sits today.

### solo — row 1 right (`ml-auto` group, `:842-849`)

```tsx
                {(offsetLabel !== null || allStruck) && (
                  <div className="flex items-center gap-1.5 font-medium text-sm ml-auto flex-shrink-0">
                    {offsetLabel !== null && (isLate
                      ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-600 text-white">{offsetLabel}</span>
                      : <span className="opacity-70">{offsetLabel}</span>)}
                    {allStruck && <span className="font-black text-xs opacity-70">✓</span>}
                  </div>
                )}
```

| Element | Condition | Kind |
|---|---|---|
| **Late pill** — `12m late`, red | `offsetLabel !== null && isLate` (`slotDt && slotOffset >= 1`) | Conditional |
| **Offset readout** — `in 20m` / `now` / `14m` | `offsetLabel !== null && !isLate`. ⚠️ **Effectively ALWAYS**: with no slot it falls back to `${getTicketAge(order.created_at)}m`; the only null is a slot >24h past | ⚠️ **Near-always** |
| **`✓` all-struck** | `allStruck` — every unit ticked off in cook view | Conditional |

### solo — row 1 left-to-centre (can push into the right)

| Element | Condition | Kind |
|---|---|---|
| `#{order.id}` `text-2xl` | Always | **Always** |
| `· {timeLabel}` `text-lg` | `timeLabel` truthy | Conditional |
| 🔔 **Buzzer chip** | 🔴 **`onBuzzer` supplied** — i.e. the van has buzzers configured | Conditional, **prop-dependent** |

### solo — row 2 right (`:850-861`) — **where `paidChip` is now**

| Element | Condition | Kind |
|---|---|---|
| Customer name | Always (`flex-1 min-w-0` — the only shrinking element) | **Always** |
| **Status badge** — `MODIFIED` / `COOKING` / `READY` | `!['confirmed','pending'].includes(order.status)` | Conditional |
| **£ total** | Always in solo | **Always** |
| 🔴 **`paidChip`** | `!hidePayments && (effectivePaid \|\| effectivePartPaid)` | Conditional + **device-dependent** |

### window (KDS) — row 1 right (`:877-881`)

```tsx
                <div className="flex items-baseline gap-1.5 flex-shrink-0">
                  <span className="font-bold text-base">£{Number(order.total).toFixed(2)}</span>
                  {paidChip}
                  {allStruck && <span className="font-black text-xs opacity-70">✓</span>}
                </div>
```

| Element | Condition | Kind |
|---|---|---|
| **£ total** | Always | **Always** |
| 🔴 **`paidChip`** | as above | Conditional |
| **`✓`** | `allStruck` | Conditional |

### window — row 2 right (`:886-890`)

| Element | Condition |
|---|---|
| **Time** (`ml-auto`) | `timeLabel` truthy |
| **Late pill / `· offset`** | `offsetLabel !== null` |

### cook — row 1 right (`:807-812`)

| Element | Condition |
|---|---|
| **Time + late pill / `· offset`** in one `ml-auto` span | Always present as a container; the pill needs `isLate` |
| 🔴 **`paidChip`** | ❌ **NEVER — cook mode does not render it at all** |

### ⚠️ THINGS YOU ASKED ABOUT THAT ARE *NOT* IN THIS REGION

| Asked about | Where it actually is |
|---|---|
| **Offline indicator** | 🔴 **Not a top-right element.** `pendingSync` colours the **card border** (`:789`) and swaps the whole bottom button set (`:640`) |
| **Sync / payment conflict** | A **full-width banner ABOVE the header** (`:773-786`), plus a border colour. Never in the corner |
| **Prep-time / amber warning** | 🔴 **Not an element.** `amberLeadMins` → `urgencyState` → `headerCls`, which is the header's **background and top border** (`helpers.ts:149-158`). It has no footprint in the row |
| **Timers** | The only time-ish things are `timeLabel` and `offsetLabel`, both above |
| **Buzzer number** | ✅ In row 1, but **left cluster** in every mode — deliberately, `:465-473` |

---

## 3. 🔴 THE WORST CASE

**Source: INFERRED, by composing the conditions in §2.**

### solo, row 1 — four elements

```
#127 · 18:45   🔔 4                         [12m late]  ✓
```

`#id` (`text-2xl`) + `· 18:45` (`text-lg`) + buzzer chip + red late pill + `✓`. **Requires:** a truck with buzzers, a buzzer assigned, an overdue slot, and every item ticked. ⚠️ **All four co-occur routinely on a busy late order.**

### 🔴 solo, row 2 — THE ACTUAL CROWDING, AND WHERE THE PAID CHIP IS

```
Dominic Bonin…   [MODIFIED]   £18.00   [£11.00 / £7.00 due]
```

**Four elements, three of them `flex-shrink-0`.** The name is the only thing that can give, and it is already the element documented as having been truncated to `"D…"` before the Contact box was removed (`:827-829`).

⚠️ **THE PART-PAID CHIP IS THE WORST OF THE FOUR.** It is not the compact `PAID` pill but:

```tsx
    : effectivePartPaid ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0 whitespace-nowrap">{money(balance.paidMinor)} / {money(balance.balanceMinor)} due</span>
```

🔴 **`whitespace-nowrap`, and roughly 15 characters** — `£11.00 / £7.00 due`. That is **three to four times the width of `PAID`**, and it cannot wrap or shrink.

### window, row 1 — three, at a 240px column

```
#127  🔔 4                    £18.00  PAID  ✓
```

⚠️ **The 240px KDS column is the tightest surface in the product**, and the file says the two-row header exists *because* a single row "truncated name + clipped price".

### cook, row 1 — two, and no paid chip ever

```
#127   🔔 4              18:45 [12m late]
```

---

## 4. The paid chip today

**Source: QUOTED.** `:412-425`:

```tsx
  const paidChipStatic = hidePayments ? null
    : effectivePaid ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">PAID</span>
    : effectivePartPaid ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0 whitespace-nowrap">{money(balance.paidMinor)} / {money(balance.balanceMinor)} due</span>
    : null

  const paidChip = paidChipStatic === null ? null : (
    <button onClick={() => setConfirmRemovePayment(true)} title="Tap to remove this payment" className="flex-shrink-0">
      {paidChipStatic}
    </button>
  )
```

### Every condition governing it

| # | Condition | Effect |
|---|---|---|
| 1 | `hidePayments` (per-device preference) | ⇒ **null**. A no-money screen shows nothing |
| 2 | `effectivePaid` | ⇒ green **`PAID`** |
| 3 | `effectivePartPaid` | ⇒ amber **`£X / £Y due`** |
| 4 | neither | ⇒ **null**. An unpaid order has no chip at all |
| 5 | 🔴 **`viewMode`** | Rendered in **solo** (`:860`) and **window** (`:879`). ❌ **Never in cook** |

⚠️ **`effectivePaid` folds in the offline overlay** (`:223-226`), so a queued mark-paid shows the chip immediately.
⚠️ **`effectivePaid` is `paid` OR `refunded`** (`:212`) — a refunded order shows the green PAID chip.

### Space it occupies

| State | Text | Approx width |
|---|---|---|
| Paid | `PAID` | **~40px** — `text-[10px]`, 4 chars, `px-1.5` |
| Part-paid | `£11.00 / £7.00 due` | 🔴 **~110-130px**, `whitespace-nowrap`, unshrinkable |
| Hidden / unpaid | — | **0px, and no gap** — it is `null`, not an empty node |

🔴 **THE SIZING IS DELIBERATE AND SHARED.** The buzzer chip was explicitly built on the paid chip's metrics — *"Sized on the paidChip's own metrics (text-[10px]/px-1.5/py-0.5/rounded-full) so the two chips read as one family"* (`:475-476`). **Changing the paid chip's dimensions silently breaks that pairing.**

---

## 5. What would have to move

**Source: INFERRED.** Reading "top right" as **header row 1, right**.

### solo — the chip would join the `ml-auto` group

| Worst case | Row 1 after the move | Collision? |
|---|---|---|
| No buzzer, on time, `PAID` | `#127 · 18:45` … `14m` `PAID` | ✅ **None.** Row 1 has documented slack |
| Buzzer + late + `PAID` | `#127 · 18:45 🔔 4` … `[12m late]` `PAID` | ⚠️ **Tight but survivable** — nothing here shrinks, so it either fits or wraps |
| 🔴 **Buzzer + late + `✓` + PART-PAID** | `#127 · 18:45 🔔 4` … `[12m late]` `✓` `[£11.00 / £7.00 due]` | 🔴 **COLLIDES.** Five unshrinkable items; `#id` at `text-2xl` and the time at `text-lg` are the widest things on the card |

### Candidates for relocation, with destinations

| Candidate | Could go to | Cost |
|---|---|---|
| 🔴 **`· {timeLabel}` from solo row 1** | Row 2, where **window already puts it** (`:886`) | ⚠️ The comment at `:824-826` says the time is in row 1 *deliberately* — *"the time is key info, so it sits beside the big order#, not demoted"*. **This is the highest-value move and the one with an explicit prior decision against it** |
| **The offset / late pill** | Row 2, again matching window | Loses the at-a-glance lateness beside the order number |
| **`✓` all-struck** | Anywhere — it is a 1-character opacity-70 marker | ✅ **Cheapest move on the card.** Buys ~14px |
| **£ total (solo row 2)** | Row 1 right, where **window already has it** | Would *add* to row 1, not relieve it |
| 🔴 **The part-paid chip's TEXT** | `£7.00 due` instead of `£11.00 / £7.00 due` | ✅ **Halves the worst case without moving anything.** ⚠️ Loses the paid-so-far figure |
| **Buzzer chip** | Row 2 | 🔴 **Explicitly ruled out** at `:472-474` — *"Adding a sixth shrink-0 chip there is what would force a THIRD ROW"* |

### window — no move needed

`paidChip` is **already** in the row-1 right cluster with £total and `✓`. ✅ **Nothing to do.**

### cook — the chip does not exist

Adding it would be a **new** element in a mode that has deliberately never shown money. ⚠️ **Not a move; a new decision.**

---

## 6. Per view mode

**Source: QUOTED.** `export type ViewMode = 'solo' | 'window' | 'cook'` (`:13`).

| | Where it comes from | Row 1 right holds | Paid chip |
|---|---|---|---|
| **solo** | The **default** (`viewMode = 'solo'`, `:91`). The dashboard passes nothing | late pill / offset, `✓` | 🔴 **Row 2** |
| **window** | KDS, `cardViewMode = activeView === 'cook' ? 'cook' : 'window'` | **£total, `paidChip`, `✓`** | ✅ **Already row 1 right** |
| **cook** | KDS cook view | time + late pill (one `ml-auto` span) | ❌ **Never rendered** |

### 🔴 WOULD A CHANGE NEED TO BE PER-MODE? YES, UNAVOIDABLY.

**The three headers are three separate JSX branches** — `:800` (cook) vs `:822`, then `:823` (solo) vs the window `else`. **There is no shared header component**, so any edit is per-branch by construction.

More importantly they **disagree about what row 1 right is for**: window uses it for **money**, solo for **time**, cook for **time**. ⚠️ **Moving the solo chip to row 1 makes solo's row 1 mean both**, which is the one thing window avoided by splitting the rows.

⚠️ Padding differs too — cook and window `px-3 py-2`, solo `px-4 py-3` (`:802`, `:822`).

---

## 7. Tappable-text affordances

### The customer name, as it now renders

**QUOTED, `:759-771`:**

```tsx
  const nameEl = (className: string) => (
    (order.customer_email || order.customer_phone) ? (
      <button
        onClick={(e) => { e.stopPropagation(); setShowContact(v => !v) }}
        title="Tap for contact details"
        className={`group inline-flex items-baseline gap-1 text-left ${className}`}>
        <span className="truncate underline underline-offset-2">{order.customer_name}</span>
        <span className="text-slate-300 group-hover:text-orange-400 transition-colors text-[10px] flex-shrink-0" aria-hidden>✉</span>
      </button>
    ) : (
      <span className={`truncate ${className}`}>{order.customer_name}</span>
    )
  )
```

⚠️ **Bare `underline` with `underline-offset-2` plus a hover-coloured `✉`.** The underline is what carries it on touch, where hover does not exist.

### 🔴 EVERY OTHER TAPPABLE-TEXT AFFORDANCE IN THE DASHBOARD

**A — glyph suffix, no underline.** 🔴 **The card's own, and the most native to this surface** (`:63-70`):
```tsx
    <button onClick={() => { setVal(price.toFixed(2)); setEditing(true) }}
      className="flex items-center gap-1.5 shrink-0 text-right group" title="Tap to override price">
      <span className="text-slate-900 font-bold text-sm">£{(price * quantity).toFixed(2)}</span>
      <span className="text-slate-300 group-hover:text-orange-400 transition-colors text-xs" aria-hidden>✏</span>
    </button>
```
✅ **Reads as a value you can edit, not a link.** ⚠️ Hover-only reveal — invisible on a tablet until touched.

**B — bordered pill / chip.** `buzzerChip` (`:485-497`) and `paidChip` (`:421-425`):
```tsx
      className={`flex-shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full border whitespace-nowrap transition-colors ${…}`}>
```
✅ **The card's established chip family**, already shared between two controls.

**C — bare underline in a banner.** `CapacityBreachBanner.tsx:53`:
```tsx
        className="self-end sm:self-auto underline font-bold shrink-0"
```
and `BuzzerLostBanner.tsx:78`:
```tsx
              className="min-h-[44px] underline font-bold px-1"
```
⚠️ **Both are inside coloured banners**, where an underline reads as an action rather than a hyperlink.

**D — underline with offset.** `DemoLoopComplete.tsx:194`:
```tsx
              className="font-bold underline underline-offset-2 hover:text-orange-800">
```

**E — orange + `hover:underline` — the only true hyperlink idiom.** `page.tsx:2271`, `:2761`:
```tsx
<Link href="/" className="mt-4 inline-block text-orange-600 text-sm hover:underline">← {_brand}</Link>
<AppLink href={`/manage/${token}`} className="text-xs font-medium text-orange-700 underline">Edit categories</AppLink>
```
⚠️ **These navigate.** Borrowing this for an in-card control would promise a page change.

**F — muted underline, KDS.** `kds/page.tsx:1172`: `className="text-xs text-slate-400 hover:text-slate-600 underline"`

**G — chevron disclosure.** `Event actions ▾` (`page.tsx:2649`) and `UserMenu.tsx:98`'s `rotate-180`. ✅ **Says "more here", not "go elsewhere"** — but reads as a menu.

**H — dashed border, for "add".** `AddOrderPanel.tsx:1822`, `page.tsx:4218`: `border-dashed`. Reserved for **create** actions.

### ⚠️ WHICH LOOKS NATIVE RATHER THAN LIKE A HYPERLINK

**Source: INFERRED.** By frequency and by what each already means on this card:

| Rank | Pattern | Why |
|---|---|---|
| 1 | **B — the chip** | 🔴 Already how the card says "tappable": two controls use it, `title="Tap to …"` on both, and the family is documented as shared |
| 2 | **A — glyph suffix** | The card's own text-tap idiom, on a **value**. ⚠️ Needs a non-hover cue on touch |
| 3 | **G — chevron** | Clear, but means "a menu opens" |
| — | 🔴 **E — orange + underline** | ❌ **Avoid.** It is the app's navigation idiom |

⚠️ **`title="Tap to …"` is on all three of the card's tappables** and is the nearest thing to a convention here.

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — line ranges read directly off the file |
| 2 | **QUOTED** — every element and its condition. The four "not actually there" corrections are **QUOTED** from where they really live |
| 3 | **INFERRED** by composing §2's conditions; the widths and `whitespace-nowrap` are **QUOTED** |
| 4 | **QUOTED** — the markup and all five conditions. The pixel estimates are **INFERRED** from the Tailwind classes |
| 5 | **INFERRED** throughout; each candidate's existing constraint is **QUOTED** |
| 6 | **QUOTED** — the type, the branches, the KDS's `cardViewMode`. "Unavoidably per-mode" is **INFERRED** |
| 7 | **QUOTED** — every affordance verbatim. The ranking is **INFERRED** |

## Not established

- **What "top right" means for solo** — header row 1 right, or the right end of row 2 where the chip already is. §5 assumes row 1; if you mean row 2, **the chip is already there and nothing needs to move.**
- **Whether the part-paid chip should keep both figures.** It is the single widest thing that can appear in either row, and shortening it is the only change that improves the worst case without moving anything.
- **Whether cook mode should gain a paid chip.** It has never had one; that is a new decision, not a move.
- **Real rendered widths.** All estimates are from Tailwind classes; nothing was measured in a browser.
