# DASHBOARD "TAKING PAYMENT" → TITLED BY ITS SETTING (BUILD REPORT)

**Date:** 30 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`
**Status: ✅ DONE.** `tsc --noEmit` **clean (exit 0)**. Styling only. `next dev` / `next build` NOT run.
**File changed (1):** `app/dashboard/[token]/page.tsx`. **🔴 Manage untouched. `lib/ui-tokens.ts` untouched.**

> This file replaces the previous build report. That content is not preserved anywhere.

**Prompt integrity:** no span read as garbled or truncated.

---

# WHAT I MATCHED FROM THE AUTO-ACCEPT CARD

I read [page.tsx:2877-2901](app/dashboard/[token]/page.tsx#L2877) and copied its structure rather than
adapting what was there. **Side by side, after the edit:**

| Element | Auto-accept (the pattern) | Taking payment (now) |
|---|---|---|
| **Card** | `bg-white rounded-2xl shadow-sm border border-slate-200 p-4 divide-y divide-slate-100` | ✅ **identical** |
| **Parent row** | `flex items-center justify-between` + `pb-3` | ✅ `flex items-center justify-between gap-3 pb-3` |
| **Title** | `text-sm font-semibold text-slate-800` | ✅ **identical** — "Separate paid step" |
| **Sub-label** | `text-slate-500 text-xs mt-0.5` | ✅ **identical** |
| **Right cluster** | `flex items-center gap-2 shrink-0 ml-3` + `Saving…` + `Toggle` | ✅ **identical** |
| **Child row** | `pt-3 pl-4 flex items-center justify-between` | ✅ `pt-3 pl-4 flex items-center justify-between gap-3` |

🔴 **Nothing was carried over from the removed heading.** Its wrapper (`<div className="pb-3">`) and its
`SUBCARD_HEADING` class are gone entirely — the `pb-3` now on the parent row is the *auto-accept
pattern's* `pb-3`, not the heading's, and it sits on a different element doing a different job.

⚠️ **The only difference from the pattern is `gap-3`**, which was already on both rows before this change
and is unrelated to the heading. I left it: removing it was not requested, and with `ml-3` on the right
cluster it is inert in practice. **Flagging rather than silently normalising.**

⚠️ **One deliberate divergence:** auto-accept's `pb-3` is **conditional** (`${autoAccept?'pb-3':''}`)
because its child unmounts when the parent is off. **Our cash row is always rendered** — disabled, not
hidden, per the standing constraint — so the `pb-3` here is unconditional. **Same visual result whenever
the child is present, which for this card is always.**

## ✅ THE DIVIDER CHECK

`divide-y` applies a **border-top to every child except the first**. So the child count is what matters:

| | Children of the card | Dividers | Where |
|---|---|---|---|
| **Before** | 3 — heading wrapper, paid-step row, cash row | **2** | above the paid-step row **and** above the cash row |
| **After** | **2** — paid-step row, cash row | **1** | ✅ **between the two rows only** |

**Confirmed there is no separator above the first row** — it is the first child, so `divide-y` skips it.
**Exactly auto-accept's shape**, which also has two children and one line between them.

## ✅ THE PADDING CHECK — this was the real trap

**The old rows used `py-3`.** With the heading removed, the paid-step row would have become the card's
first child *while still carrying `pt-3` worth of top padding* — stacking on top of the card's own `p-4`
and making this card's first row sit **looser** than every other card on the tab.

**Fixed by matching the pattern exactly:**

| Row | Before | After |
|---|---|---|
| Paid step | `py-3` | ✅ **`pb-3`** — no top padding; the card's `p-4` alone spaces the first row |
| Cash | `py-3 pl-4` | ✅ **`pt-3 pl-4`** — no bottom padding; the card's `p-4` alone closes the card |

**Top and bottom spacing now come from the card's `p-4` on both cards**, and the inter-row gap is
`pb-3` + `pt-3` on both. **Identical to auto-accept.**

---

# ✅ `SUBCARD_HEADING` — DASHBOARD IMPORT REMOVED

It had **exactly one** dashboard consumer (the heading just deleted), so the import went with it:

```
$ grep -n "SUBCARD_HEADING" app/dashboard/[token]/page.tsx
2913:  … note SUBCARD_HEADING is a MANAGE token; this file no longer imports it. */}   ← comment only
```

**No `import` line, no usage.** `tsc` exit 0 confirms nothing else referenced it.

**Still exported and still used where it does real work:**

| Location | Status |
|---|---|
| [lib/ui-tokens.ts:56](lib/ui-tokens.ts#L56) | ✅ **unchanged** — still exported |
| `app/manage/[token]/page.tsx` | ✅ **4 references** (1 import + 3 headings: Accepting orders, Taking payment, Opening and closing) |

🔴 **It is now a Manage-only token, which is the correct end state** — the group label does real work
only where three groups share one card. I recorded that in the card's comment so nobody re-imports it.

---

# ✅ THE COMMENT SURVIVED

The **DO-NOT-ADD-PER-EVENT-SCOPE-WORDING** block is intact (verified: 1 occurrence) and **reattached as
the card's first child**, immediately inside the card wrapper and above the paid-step row. It was
previously sitting above the heading wrapper; the heading is gone, the comment is not.

**It needed no rewording** — it guards a rule about *the rows*, and both rows are still there. It never
referred to the heading as its subject; it mentions the heading sub-label only as one of the removals it
records.

I did update **a different, now-false comment** — the V9.5 block above the card said *"Sub-card treatment
+ heading matches Manage → Settings"*, which this edit falsified. It now reads:

> ⚠️ **NO GROUP HEADING HERE (V9.6).** This card is titled by its SETTING ("Separate paid step"), like
> every other card on this tab, with "Do you take cash?" nested beneath it as a child — structurally
> identical to the auto-accept card two rows above. A "TAKING PAYMENT" group label was tried and removed:
> it is only needed in MANAGE, where three groups share one Order settings card, and here the nesting
> already carries what it was saying. **Do not reinstate it** — and note `SUBCARD_HEADING` is a MANAGE
> token; this file no longer imports it.

---

# ✅ MANAGE IS UNTOUCHED

**No edit was made to `app/manage/[token]/page.tsx` in this pass.** Verified:

- **Manage's "Taking payment" sub-card heading is present**, still using the token —
  [manage/page.tsx:7788](app/manage/[token]/page.tsx#L7788): `<p className={SUBCARD_HEADING}>Taking payment</p>`
- All **three** Manage headings and all **three** grey sub-panels intact.
- Manage's own copy — including its heading sub-label and its fuller cash description — unchanged.

**The two surfaces have now diverged deliberately**, which is the point: Manage groups three settings
inside one card and needs the label; the dashboard gives each setting its own card and does not.

## Nothing else changed

**No copy on either row.** Both titles, both sub-labels and the "Needs the separate paid step turned on."
line are byte-identical. **No toggle, no handler, no logic** — `savePaidStepOverride`,
`saveTakesCashOverride`, both `disabled` expressions and both `Saving…` indicators are untouched. The
`pl-4` nesting and the nesting-rationale comment survive.

---

## What I could NOT verify

- 🔴 **Nothing was rendered.** No `next dev`, so **the card has not been seen with its new title**. The
  padding and divider conclusions are derived from Tailwind's semantics (`divide-y` skips the first
  child; `p-4` + `pb-3`/`pt-3`) and from matching a working sibling's class strings — **not from looking
  at it.** **The check I would want: put this card and the auto-accept card side by side and confirm the
  first-row top spacing and the divider weight are indistinguishable.**
- ⚠️ **The unconditional-vs-conditional `pb-3` divergence is unobserved.** It is correct by reasoning (our
  child is always present), but if the cash row were ever made conditional, that `pb-3` would need the
  same ternary auto-accept uses — **and nothing enforces that.**
- **`gap-3` remains on both rows** where auto-accept has none. I judged it inert; I did not measure
  whether it shifts anything against the sibling card.
- **`tsc` exit 0 is necessary and not sufficient** — it proves the `SUBCARD_HEADING` import was genuinely
  unused and that the JSX still balances after removing a wrapper, which are the two failures this edit
  risked. It says nothing about appearance.
- **I did not re-check the other Settings cards on the tab** (offline protection, order-ready, sounds) for
  whether they also match the auto-accept pattern — only that this one now does.
