# The Add Order secondary button is now "Place order"

**Date:** 10 August 2026
**Copy only.** No behaviour change, no styling change, no other label change.
**Prompt integrity:** nothing arrived garbled, and **no instruction contradicted another** — nothing to stop and ask about.

---

## The change

| | Before | After |
|---|---|---|
| Add Order, secondary button (setting **ON**) | `Place order, pay later` | **`Place order`** |

[AddOrderPanel.tsx:1338](../components/dashboard/AddOrderPanel.tsx#L1338) — one line, one string.

### Recorded at the site so it is not lengthened again

The reasoning is now a comment on the confirm bar, in the terms you gave:

> 🔴 *"THE SECONDARY IS **"Place order"**, AND IT IS DELIBERATELY SHORT. DO NOT LENGTHEN IT. It was briefly "Place order, pay later"; that was DEFENSIVE, and the defence is unnecessary because it never stands alone — **it sits beside "Take payment £10.00", and the contrast carries the meaning: one button names a price, the other does not.** An operator who has turned "Take orders without payment" ON knows what they configured. The longer label also cost width in a row that is tight on a phone."*

And the guard against the obvious wrong shortening:

> ⚠️ *"AND IT IS NOT "Confirm order", which is what it will drift back to if anyone shortens it without reading this. Two reasons, both live: "confirm" reads as THE primary action, which is the inversion this bar was rebuilt to remove; and **"Confirm" is the customer-order flow's own word for accepting an order into the queue** (the order card's `✓ Confirm`, the pending bucket), so it already means something else in this product."*

---

## VERIFY

### Every surface rendering the secondary label — checked for siblings

**There is exactly one render site.** A repo-wide search for the old string returns two hits and only one is code:

| Hit | What it is |
|---|---|
| [AddOrderPanel.tsx:1338](../components/dashboard/AddOrderPanel.tsx#L1338) | 🔴 **the rendered label** — changed |
| AddOrderPanel.tsx:1311 | the new comment, quoting the old label as history |

**No sibling render site exists.** I checked specifically because a label disagreed with itself earlier today — the enabled completion button read "Mark paid and collected" while its disabled placeholder read "&".

### Two related strings found, examined, and left alone — reported not fixed

| Site | String | Verdict |
|---|---|---|
| [AddOrderPanel.tsx:1892](../components/dashboard/AddOrderPanel.tsx#L1892) | `<p className="font-black text-slate-900">Confirm order</p>` | **A SHEET HEADING, not a button** — it titles the mobile order sheet, beside a ✕ close. It is not a competing label and does not sit next to the payment button. **Left as-is.** |
| [app/trucks/[slug]/order/page.tsx:2259](../app/trucks/[slug]/order/page.tsx#L2259) | `'Place order'` | **The CUSTOMER's submit button.** The operator's secondary now uses the same words — and that is **coherent, not a collision**: "place an order" means the same thing on both surfaces. It is precisely the contrast with `Confirm`, which means something *different* on the operator card (accepting an incoming order), that made `Confirm` the wrong choice. **Left as-is.** |

### One stale sibling found and corrected

[lib/ui-tokens.ts:37](../lib/ui-tokens.ts#L37) — the `ORANGE_OUTLINE` doc comment read:

> *"SECONDARY of the same brand colour — **"Confirm order"** beside "Cash"/"Card"."*

**That named a button that had not existed since the confirm bar was rebuilt.** The file's own header says *"Two copies that agree today are two copies that disagree tomorrow; a shared constant cannot drift"*, so a token comment naming a dead label is exactly the drift it warns about. Updated to `"Place order" beside "Take payment" / "Cash" / "Card"`, with a note to keep it in step. **Comment only — the exported class string is unchanged.**

### Settings descriptions still name buttons that exist ✅

The Manage and dashboard completion-setting descriptions name **`Mark paid & collected`**, **`Mark paid`** and **`Collected`** — the *completion* buttons, none of which changed. **No settings copy anywhere names the Add Order buttons**, so nothing needed updating. (The only Manage/dashboard mentions of *"Take payment"* are code comments about the cash split, not rendered copy.)

### 🔴 No completion button label changed

```
OrderCard.tsx:296  label="Collected"
OrderCard.tsx:299  label="Mark paid & collected"
OrderCard.tsx:334  : 'Mark paid'   /  `Mark ${money(balance.balanceMinor)} paid`
OrderCard.tsx:496  the disabled placeholder — same four strings
```

**All four unchanged.** And your reasoning is now recorded at that site, since it is the obvious next thing someone would shorten:

> 🔴 *"DO NOT DROP THE WORD "MARK". IT IS WHAT MAKES THESE READ AS ACTIONS. **"Mark paid" is an instruction; "Paid" is a status** — and this card already carries a PAID CHIP a few lines up, so a button reading `Paid & collected` beside a chip reading `PAID` would read as a state the card is reporting rather than a thing the operator can press."*
>
> ⚠️ *"The Add Order case is the opposite and that is why it could be shortened: "Place order" sits beside "Take payment £10.00", so the CONTRAST carries the meaning. Nothing on this card supplies that contrast — the completion button is frequently the only control on the row."*

---

## ALSO CHECKED — the inline vs stacked amount. **Reported, not changed.**

### Yes, the two states differ

| State | Markup | Renders |
|---|---|---|
| **OFF**, single button | `` `Take payment${manualTotal > 0 ? ` £${…}` : ''}` `` at `text-base` | **INLINE** — one line |
| **ON**, primary button | `<span className="text-sm">Take payment</span><span className="text-base font-black">£{…}</span>` in a `flex flex-col` | **STACKED** — label over amount |

### Measured at 375px — the inline form does **not** clip, with room to spare

The confirm bar is `<div className="border-t border-slate-200 p-4 …">` ([:1273](../components/dashboard/AddOrderPanel.tsx#L1273)), so `p-4` = 16px each side → **≈343px of inner width**. The OFF button is `w-full` with **no horizontal padding class**, so effectively all 343px is available to centred text.

| Label | Chars | Approx width at 16px semibold | Available | Verdict |
|---|---|---|---|---|
| `Take payment £10.00` | 19 | **≈158px** | ≈343px | ✅ **46% of the width — comfortable** |
| `Take payment £1,234.56` | 22 | ≈183px | ≈343px | ✅ still comfortable |

### Why the ON state stacks anyway — and why that is not an inconsistency

**The two buttons face different constraints.** The stacked form exists because in the ON state the payment button is `flex-1` **sharing the row** with the secondary — and with `takes_cash` on, with two more. Three buttons across ≈343px leaves each roughly **110px**, against which an inline `Take payment £10.00` at ≈158px **would** clip. That is the width note the original comment records.

**The OFF button has the whole row to itself, so the constraint does not apply.** Inline is correct there and stacked is correct in the row.

**No recommendation, and nothing changed** — as instructed. ⚠️ One incidental benefit worth noting: shortening the secondary from `Place order, pay later` (≈150px at 14px) to `Place order` (≈80px) **gives the ON row about 70px back**, which makes the shared-row constraint less tight than it was.

---

## 🔴 GUSTO — the label, and nothing else

They are `show_paid_step` **TRUE**, so the setting is **ON** and they see this button.

| | Before | After |
|---|---|---|
| Secondary button | `Place order, pay later` | 🔴 **`Place order`** |
| Primary button | `Take payment` / `£10.00` stacked | **identical** |
| Cash/card split | not split (`takes_cash` false) | **identical** |
| What either button dispatches | one `gatedAction({ kind: 'create' })` | **identical** |
| `paymentTaken` / `paymentMethod` | unchanged | **identical** |
| Order card, chip, completion buttons | unchanged | **identical** |
| Settings descriptions | name the completion buttons | **identical** |

**Exactly what you expected: the label only.**

---

## tsc and lint

```
$ npx tsc --noEmit
TSC EXIT: 0

$ npx eslint .   (rule|severity, whole repo)
  vs the immediately-previous task : IDENTICAL
  vs this morning's pre-work baseline:
    3c3   568 → 566  @typescript-eslint/no-explicit-any   (2 FEWER, from the previous task)
    15c15  44 → 32   react/no-unescaped-entities          (12 FEWER, from earlier tasks)
```

**No rule introduced and no count increased by this task** — the lint profile is byte-identical to the previous run, which is what a copy-only change should produce.

---

## Files changed — three

| File | Change |
|---|---|
| [components/dashboard/AddOrderPanel.tsx](../components/dashboard/AddOrderPanel.tsx) | the label, plus the do-not-lengthen / not-"Confirm order" reasoning |
| [components/dashboard/OrderCard.tsx](../components/dashboard/OrderCard.tsx) | **comment only** — why the completion buttons keep "Mark" |
| [lib/ui-tokens.ts](../lib/ui-tokens.ts) | **comment only** — the stale `"Confirm order"` reference corrected |

**Copy only. No behaviour change, no styling change, no completion button touched, and the inline/stacked question reported rather than altered.**
