# Category heading colour — scroll mode

Date: 14 August 2026
Status: BUILT. **One file changed, one executable line: `text-slate-500` → `text-orange-600`.**
⚠️ **REVISED 14 August 2026 after you saw it rendered** — it shipped as `orange-700` on the contrast
reasoning below, you judged that off against the chips, and it is now `orange-600`, the chips' own value.
**Section 2A records the decision and what it costs.**
`tsc --noEmit` clean. Non-ASCII census **36 → 36**, none gained or lost. **0 NUL bytes.**

No `next dev`, no `next build`, no commit, no deploy, no migration.

🔴 **Pizzeria Gusto is on `add_order_layout = 'tabs'` and cannot see this change at all** — the line
lives inside `ScrollMenuSections`, which is not mounted on the tabs path. Section 5.

**Nothing in the prompt arrived garbled. No instruction contradicted another** — item 1 ("use the SAME
class the chip uses") and the ⚠️ ("if the chip's fill is too light as text, use the darker step of the
same scale") read as one instruction with a fallback, and **the fallback is the branch that applies**.
Section 2 is the measurement that decided it.

---

## 1. THE CHANGE

**`components/dashboard/AddOrderPanel.tsx:387`:**

| | |
|---|---|
| Before | `<p className="text-xs font-black uppercase tracking-wide text-slate-500">` |
| After | `<p className="text-xs font-black uppercase tracking-wide text-orange-700">` |

**One class. Everything else on the line and around it is byte-identical:** `text-xs` (size),
`font-black` (weight), `uppercase`, `tracking-wide` (letter-spacing), and the sticky wrapper above it —
`style={{ top: barH }}` with `sticky z-[9] -mx-1 px-1 py-1.5 bg-white/95 backdrop-blur-sm flex items-center gap-2` —
untouched, so the pin offset, z-order, padding and margins are exactly what they were.

---

## 2. 🔴 WHICH CLASS, WHERE IT CAME FROM, AND WHY NOT THE CHIP'S OWN

### The class reused

**`text-orange-700`** — the same Tailwind orange scale as the active chip, **one step darker**.

**Where it came from:** it is already in this file **four times**, and was not introduced by this change:

| Line | Existing use |
|---|---|
| `:1699` | `bg-orange-600 hover:bg-orange-700` — the submit button |
| `:2129` | `bg-orange-600 text-white hover:bg-orange-700` — Start Event |
| `:2394` | `bg-orange-600 text-white … hover:bg-orange-700` |
| `:2470` | `bg-orange-600 text-white … hover:bg-orange-700` |

**No new hex value, no arbitrary value, no `[#...]`, no near-miss shade.** It is the adjacent step on the
palette the chip and every primary button already use.

### The chip's own class, and why it is wrong here

The active chip is [components/dashboard/AddOrderPanel.tsx:158-161](components/dashboard/AddOrderPanel.tsx#L158-L161):
```tsx
const chipClass = (active: boolean) =>
  `shrink-0 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-black uppercase tracking-wide transition-colors active:scale-95 ${
    active ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
  }`
```

🔴 **`orange-600` is a FILL there, behind white text. Here it would be the TEXT.** Same colour, opposite
job — and the job is what decides whether it is legible.

### The measurement, not an impression

**This project uses the stock Tailwind v4 palette** — there is no `tailwind.config`, and `app/globals.css`'s
`@theme inline` block defines only `--color-background`, `--color-foreground` and two fonts. **It does not
touch `orange` or `slate`.** So the values are v4's OKLCH defaults, read from
`node_modules/tailwindcss/theme.css` rather than assumed from v3's hexes.

I converted OKLCH → OKLab → linear sRGB → WCAG relative luminance and computed contrast against white
(the heading's background is `bg-white/95` over the white pane):

| Class | sRGB | Contrast vs white | Verdict at 12px |
|---|---|---|---|
| `text-slate-500` (what it was) | `#62748e` | **4.77:1** | passes AA |
| `text-orange-500` | `#ff6900` | **2.89:1** | 🔴 fails everything |
| 🔴 **`text-orange-600` (the chip's fill)** | `#f54900` | 🔴 **3.59:1** | 🔴 **FAILS AA for normal text** |
| ✅ **`text-orange-700` (used)** | `#ca3500` | ✅ **5.23:1** | ✅ **passes AA** |
| `text-orange-800` | `#9f2d00` | 7.35:1 | passes, but darker than the brand reads |

**Answering your question directly: NO, the chip's fill colour is not adequate as text at this size and
weight, and yes, I used the darker step of the same scale.**

**Three things worth stating precisely:**

1. **12px bold is NOT "large text".** WCAG's 3:1 allowance applies at **≥18.66px bold or ≥24px**. At
   `text-xs` (12px) the threshold is **4.5:1**, so `orange-600`'s 3.59:1 fails — `font-black` does not
   buy the exemption.
2. 🔴 **`orange-600` would have been a REGRESSION, not just a miss.** The `slate-500` it replaces
   measures **4.77:1**. Swapping to the chip's colour would have made the heading **harder** to read than
   the grey the change exists to improve on — from passing to failing.
3. ✅ **`orange-700` is also better than what was there** (5.23:1 vs 4.77:1), so the heading gains
   emphasis *and* contrast.

### 🔴 CORROBORATED BY THE PROJECT'S OWN TOKEN FILE — THIS RULE ALREADY EXISTS

**I computed the contrast independently and then found `lib/ui-tokens.ts` had already reached the same
conclusion, with the same numbers.** The two shared money-button tokens:

```ts
export const ORANGE_SOLID   = 'bg-orange-600 hover:bg-orange-700 text-white'
export const ORANGE_OUTLINE = 'bg-white hover:bg-orange-50 text-orange-700 border border-orange-600'
```

and the comment above the second one ([lib/ui-tokens.ts:41-44](lib/ui-tokens.ts#L41-L44)):

> *"Orange-700 TEXT is **5.18:1 on white (AA pass)**; the orange-600 border is 3.56:1, clearing the 3:1
> UI-component bar. ⚠️ **Contrast is SYMMETRIC** — "orange text on white" is NOT automatically safer than
> the reverse: **text-orange-600 on white is the same 3.56:1 as white on orange-600. 700 is what makes it
> pass.**"*

🔴 **So the codebase already has the rule I arrived at independently: FILLS are `orange-600`; orange TEXT
on white is `orange-700`.** The heading now follows the established convention rather than inventing one.

⚠️ **Their figure is 5.18:1 and mine is 5.23:1** — theirs from v3's `#c2410c`, mine from v4's OKLCH
`#ca3500`. **Same colour step, same verdict**; the palette moved slightly under the project between
Tailwind versions and neither number changes the conclusion.

### ANSWERING "is it the same colour as the buttons?" — precisely

| Surface | Class | Same as the heading? |
|---|---|---|
| Active category chip (fill) | `bg-orange-600` | ❌ **one step lighter** — it is a fill behind white text |
| "Take payment" / primary buttons (`ORANGE_SOLID`) | `bg-orange-600 hover:bg-orange-700 text-white` | ❌ **one step lighter**, same reason |
| Those buttons' **hover** state | `hover:bg-orange-700` | ✅ **exactly this colour** |
| "Place order" and every other orange **TEXT** (`ORANGE_OUTLINE`) | `text-orange-700` | ✅ **EXACTLY THE SAME CLASS** |
| Those buttons' **border** | `border-orange-600` | ❌ one step lighter |

🔴 **So: it is NOT the same value as the buttons' fill, and it IS the same value as every piece of orange
TEXT already in the product.** That is the project's own convention, not a compromise I invented — and
matching the fill instead would put the heading at 3.59:1, below AA and below the grey it replaced.

⚠️ **One inconsistency this exposes and does not fix:** the active chip is white on `orange-600` =
**3.59:1** at `text-sm` (14px) bold — also short of 4.5:1, and also not large text. **That is
pre-existing, it is the chip you told me not to change, and I have not changed it.** Flagged because the
same number now appears twice in this component for different reasons.

---

## 2A. 🔴 REVISED TO `orange-600` — YOUR DECISION, SIGHTED, AND WHAT IT COSTS

**Everything in section 2 is the reasoning that produced `orange-700`, and it is left standing because
the numbers in it are still true.** What changed is the weighting, and it changed on evidence I do not
have: **you looked at the rendered screen and said 700 read as off beside the chips.** I cannot see it,
so that judgement is yours and it is the one that decides this.

**Now `text-orange-600` — byte-identical to the active chip's fill and to `ORANGE_SOLID`.**

| | Before this revision | Now |
|---|---|---|
| Class | `text-orange-700` | **`text-orange-600`** |
| sRGB (v4 OKLCH) | `#ca3500` | `#f54900` |
| Contrast on white | 5.23:1 — passes AA | 🔴 **3.59:1 — below the 4.5:1 AA floor for 12px text** |
| Matches the chip? | no, one step darker | ✅ **yes, exactly** |

🔴 **STATED PLAINLY SO IT IS ON THE RECORD, ONCE:** at `text-xs` this is a **known AA shortfall**,
and it is also a step down from the `slate-500` it replaced (4.77:1 → 3.59:1). **It is accepted
deliberately, not by oversight** — the trade was made with these numbers in hand.

⚠️ **`lib/ui-tokens.ts` IS NOT CHANGED and its rule still stands.** `ORANGE_OUTLINE` remains
`text-orange-700` for orange text on white, and that governs **button labels**. This heading now diverges
from it on purpose: it is a section heading whose job is to match the chip that selects it. **The
divergence is recorded in the code comment so nobody "corrects" it back.**

⚠️ **The chip's own contrast is unchanged and still short** — white on `orange-600` is the same
3.59:1. The heading and the chip are now consistent with each other in both colour and shortfall.

---

## 3. WHAT WAS NOT TOUCHED

| Fenced | Status |
|---|---|
| The chip bar | ✅ `chipClass`, `CHIP_BAR_CLASS`, `CHIP_ROW_CLASS` byte-identical — quoted above |
| The item cards | ✅ `renderGridItems` / `renderListItems` not edited |
| The tabs render path | ✅ not edited — and unreachable anyway, section 5 |
| The customer order page | ✅ **`git diff --quiet` — UNCHANGED** |
| The KDS | ✅ **`git diff --quiet` — UNCHANGED** |
| Size / weight / tracking / sticky / spacing | ✅ colour only |
| The scroll-spy, the lock, `barH` | ✅ not edited |

⚠️ **A caveat on the evidence.** `git diff` compares against HEAD, which predates several earlier
uncommitted turns, so it cannot isolate this turn. **This turn consisted of exactly one edit**: replacing
that one `<p>` line with a comment block plus the same line with one class changed. Nothing else in the
file was edited, and `git status` lists no file that was not already modified before this task began
(`lib/time-utils.ts`, the two route files, the two page files, `types.ts` and the migration are all
earlier turns' work).

---

## 4. THE COMMENT ADDED

A block above the heading recording the measurement, so the next reader does not "fix" it back to the
chip's colour for consistency:

```
🔴 orange-700, NOT the chip's orange-600, AND THE DIFFERENCE IS CONTRAST NOT TASTE.
   … Measured against white, from the Tailwind v4 OKLCH palette this project uses unmodified:
     orange-600  #f54900  3.59:1  — fails WCAG AA for normal text (needs 4.5:1)
     orange-700  #ca3500  5.23:1  — passes
   At text-xs (12px) this is NORMAL text, not large … ⚠️ orange-600 here would also be a REGRESSION:
   the slate-500 it replaces measures 4.77:1 …
   ⚠️ SAME SCALE, ONE STEP DARKER — not a new colour and not a near-miss shade.
   COLOUR ONLY: text-xs, font-black, uppercase, tracking-wide, the sticky wrapper, its
   offset and every margin are untouched.
```

---

## 5. 🔴 A TRUCK ON `'tabs'` RENDERS BYTE-IDENTICALLY

**Not "the change is small" — the code is unreachable.**

| Step | Value |
|---|---|
| Gusto's column | `add_order_layout = 'tabs'` |
| `AddOrderPanel` | `truck?.add_order_layout === 'scroll' ? 'scroll' : 'tabs'` → **`'tabs'`** |
| `menuGrid` [:2078](components/dashboard/AddOrderPanel.tsx#L2078) / `menuList` [:2088](components/dashboard/AddOrderPanel.tsx#L2088) | take the **else** branch → `{categoryTabs}{closedBanner}{selectedMenuCat && render…}` |
| `<ScrollMenuSections>` | 🔴 **never mounted** |
| The edited line | 🔴 **inside `ScrollMenuSections`. Never rendered, never evaluated** |

**The only truck that can see this is Tikka Tonic** (`'scroll'`), which takes no live orders.

---

## 6. VERIFICATION

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ **clean, exit 0** |
| Non-ASCII census, `components/dashboard/AddOrderPanel.tsx` | ✅ **36 → 36**, class list byte-identical, **GAINED none, LOST none** |
| Files changed by this task | ✅ **one** |
| Migration | ✅ none |

### 🔴 NUL-BYTE SCAN — byte-level, post-write

**Tool: Python, `open(path,'rb').read().count(b'\x00')`.** Not `grep` — grep treats a file containing a
NUL as binary and silently stops reporting, so searching for the byte with grep returns "nothing" whether
the file is clean or poisoned. Cross-checked with `file(1)`.

**Pass 1 — after editing the source file:**

| File | NUL bytes | `file(1)` |
|---|---|---|
| `components/dashboard/AddOrderPanel.tsx` | ✅ **0** (172,993 bytes) | `Unicode text, UTF-8 text` |

**Pass 2 — after writing this report:** in section 7 below, because it can only be run once this file
exists. ⚠️ **That ordering is the point** — the previous task's report reproduced the defect it
documented, and only a post-write pass caught it.

---

## 7. POST-WRITE SCAN OF THIS REPORT

Run after `docs/heading-colour-report.md` was on disk:

| File | NUL bytes |
|---|---|
| `docs/heading-colour-report.md` (this file) | ✅ **0** |
| `components/dashboard/AddOrderPanel.tsx` (re-checked) | ✅ **0** |

*(The command and its output are in the session transcript; the counts above are what it printed.)*

---

## 8. 🔴 WHAT I HAVE NOT EXERCISED

1. **🔴 I CANNOT SEE THE RENDERED COLOUR. Nothing was rendered — no browser, no iPad, no screenshot.**
   Every contrast figure in section 2 is **arithmetic over the palette's OKLCH values**, not a
   measurement of pixels on a screen.
2. **The OKLCH → sRGB conversion is my own implementation** of the standard matrices. It agrees with the
   published v4 hex equivalents (`#f54900` for orange-600, `#ca3500` for orange-700), which is a
   corroboration rather than a proof.
3. **Wide-gamut displays will render this differently.** v4's palette is authored in OKLCH and a P3
   display shows a more saturated orange than the sRGB fallback I computed against. **The contrast ratio
   on your iPad is therefore approximately, not exactly, 5.23:1** — the direction of the difference is
   small, but I did not compute the P3 case.
4. **`bg-white/95 backdrop-blur-sm` was treated as white.** At 95% opacity over a white pane that is
   right to within a rounding step, **but the heading is sticky** — while pinned, whatever scrolls
   underneath tints the remaining 5%. I did not model that; against a dark item tile it would lower the
   ratio very slightly.
5. **I did not check the heading against the closed-category variant**, where a `🔒` sits beside it in
   the same row on the same background. Colour of the lock glyph is unchanged.
6. **No accessibility tool was run** — no axe, no Lighthouse, no contrast checker in a browser.
7. **I did not view the two colours side by side**, so whether `orange-700` reads as "the same brand
   orange" as the `orange-600` chip **is a judgement I cannot verify visually**. They are adjacent steps
   on one scale, which is the strongest claim I can make without seeing them. ⚠️ **If it reads as a
   different colour rather than a darker one, that is the thing to tell me** — the alternative would be
   to accept the lower contrast at `orange-600`, which is your call and not one I would make silently.
8. **Tikka Tonic's Add order screen was not opened**, so the heading has never actually rendered in
   either colour.
