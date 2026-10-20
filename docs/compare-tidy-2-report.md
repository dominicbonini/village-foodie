# compare-tidy-2 — finish the /compare simplification

**Date:** 20 October 2026 · **Branch:** main (uncommitted; nothing pushed or deployed)

**Summary.**
- **Months-free question removed:** the card, its input and its messages.
- **Free months from data:** they come from `plans.trial_months` of the trial plan, with an outreach override `?free=N` (a whole number 1–12) for that visit. Every months figure follows the value in use.
- **Dimmed cards are inert:** no pointer events, and nothing inside can take focus until question 1 is answered. The look is unchanged.
- **Unchanged:** questions 1, 2, 3, 4a and 4b. /compare stays noindex with its metadata unchanged. No SQL was run or needed.

---

## 1 · What changed

| | Before | After |
|---|---|---|
| Question 5, "Your introductory offer — how many months free?" | a number input, prefilled with the trial length, editable 0–12 | **removed**: the card, the input, its "No plan fee, no service fee" / "Paying from day one" line, the `freeMonthsRaw` state, `STEP.free`, and messages `compare.free.title`, `.aria`, `.none`, `.some` (en-GB; en-US had none) |
| The months in use | what the visitor typed | **`freeMonthsOverride ?? plans.trial_months ?? 0`**. The override comes from `?free=N`, which the server page accepts only as a whole number 1–12. Missing, `0`, `13`, `abc`, `2.5` or a repeated parameter fall back to the data value. |
| Card numbers | 1 system, 2 trucks, 3 orders, 4 fee / trading days, 5 months free | **1, 2, 3, 4**. The small print's "question 4" (the fee question) is still correct. |
| Dimmed cards (before question 1) | faded (opacity 0.45), but still clickable and focusable | faded the same, and **inert**: `pointer-events: none` plus the `inert` attribute, a single change in the `Card` component. They come alive the moment question 1 is answered. |

Every figure that uses the months reads the one value:
- year-one HatchGrab cost: (12 − N) × monthly;
- the year-one saving and %;
- the two-year saving;
- the breakdown's "Months 1–N — £0 on us";
- the No path's "And your first N months are on us."

**Outreach.** The router keeps the query: `/compare?free=4` → **302** → `/uk/compare?free=4` (curl).

**Metadata unchanged.** "Cost calculator — HatchGrab UK", `noindex, nofollow`, canonical `/uk/compare` (curl).

## 2 · Proof

### Screenshots

Production build (`next start` on :3100), /uk/compare, at 1440px and 375px, in three states:
- unanswered;
- the No path at £3,000;
- the Yes path at £3,000 with 4.5% + 20p.

Pixel-compared, before vs after:

| View | Before | After | Pixel comparison |
|---|---|---|---|
| unanswered 1440 | 1440×2000 | 1440×1848 | rows 0–1335 identical; the months card (152px) is removed; everything below is the same content |
| unanswered 375 | 375×2333 | 375×2168 | rows 0–1463 identical; the card (165px) is removed; the same |
| No path 1440 | 1440×2772 | 1440×2620 | rows 0–1285 identical; the card (152px) is removed; the same |
| No path 375 | 375×3298 | 375×3133 | rows 0–954 identical; the card (165px) is removed; the same |
| Yes path 1440 | 1440×2996 | 1440×2843 | rows 0–852 identical; the card (153px) is removed; the results are identical in content |
| Yes path 375 | 375×3486 | 375×3321 | rows 0–1543 identical; the card (165px) is removed; the same |

**Below the removed card.** The content is identical, but it isn't bit-identical when bottom-aligned. The removed card's box was a fractional height (about 152.4px), so everything below sits a sub-pixel higher and its glyph edges are anti-aliased differently. The diff image shows only text and outline edges. The result text in that region is word-for-word the same (below).

The only difference, then, is the months card. No number or text that follows the months changed at the default value.

### Result text, before → after (1440; 375 identical)

| | No path, £3,000 | Yes path, £3,000, 4.5% + 20p |
|---|---|---|
| **before** (input showing 3) | "And your first 3 months are on us." · "Months 1–3 — £0 on us" | "£1,080 a year" · "£261 in year one" · "You save £819 — 76% less in your first year" · "Year one: Save £819" · "Year two: Save £732" · "Over two years that’s £1,551 saved." |
| **after**, no `?free` | the same | the same |
| **`?free=4`** | "And your first **4** months are on us." · "Months 1–**4**" | "£**232** in year one" (8 × £29) · "**79%** less in your first year" · "Year one: Save £**848**" · "Over two years that’s £**1,580** saved." |
| **`?free=0`**, **`?free=13`**, **`?free=abc`** | as the default (3) | as the default (3) |

### Dimmed cards are inert (headless Chrome, production build)

**Before question 1:**
- **Mouse clicks do nothing.** Real clicks at the centre of the dimmed "2" trucks button and of "Use Pro instead" change nothing: the trucks stay at "1" and the suggestion stays "Pay as you go".
- **Tab skips them.** Tabbing 60 times through the page reaches only question 1's two buttons, the nav and the footer, never an element inside a dimmed card.
- **Three cards are `inert`.**

After answering "No, not yet", no card is inert.

### Grep

No reference remains to the removed question's state or keys (`freeMonthsRaw`, `setFreeMonthsRaw`, `STEP.free`, `compare.free.*`) in `app/`, `lib/`, `components/` or `messages/`.

## 3 · What was executed

- **Production builds:** before (the compare-tidy tree) and after; both pass.
- **Captures:** `/uk/compare` at 2 widths × 3 states, plus `?free=4`, `?free=0`, `?free=13` and `?free=abc`. Pixel and text comparison; an inert-cards test in headless Chrome; curl of the redirect and the head.
- **tsc:** clean.
- **Lint:** no new errors on `app/compare/CostComparison.tsx` and `app/compare/page.tsx`.
- **`scripts/pricing-pages.cjs`:** 140/140. New checks:
  - no months card;
  - the data default (3) everywhere;
  - an override of 4 everywhere;
  - the page's 1–12 parsing;
  - dimmed cards `inert` before question 1 and not after;
  - numbering 1–4 on both paths.
- **Full sweep (`node scripts/run-harnesses.cjs`, final tree):**
  - **144 of 145 harnesses pass.**
  - The one failure, `demo-rebuild-replace`, fails 1 check only because its fixture date is today. With the clock pinned to 2026-10-19 it passes 36/36.
- **Re-pins** (each marked `⚠️ RE-PINNED (compare-tidy-2, 20 October 2026)`):
  - **`compare-no-system`:** the patch on the removed state is gone; fixtures pass `freeMonthsOverride`; numbering 1–4 on both paths; no months card.
  - **`country-settings-parity`:** a named change, C2, drops the months input from the before-snapshot. B4 now asserts the results use the data default, worked out from the seed: "first 3 months", "Months 1–3", and year one = cost × trucks × 9.
  - **`marketing-country-parity`:** a new transform T-free; a new check, T-inert, confirms the three dimmed cards carry `pointer-events:none` and `inert`, and question 1's card neither.
  - **`plans-data-model`:** `tidyCompare` gains T-free and T-inert.
  - **The language-phase family** (`language-phase-0`, `-1e`, `-1e-tidy`; `-1c`, `-1d`, `-1d2`, `-2` and `messages-parity` re-run and passing):
    - `_lp-compare-tidy.cjs` removes the months card, adds `inert` to dimmed cards and requires numbering 1–4;
    - `_lp-stage-b.cjs` accepts the card's absence;
    - `_lp1e-parts.cjs` passes test cases' months as `freeMonthsOverride`.
  - **No product bug was found** by any re-pin.

## 4 · Files

- `app/compare/CostComparison.tsx`: the card removed, `freeMonthsOverride`, `Card` inert.
- `app/compare/page.tsx`: the `?free` parsing.
- `messages/en-GB.json`: `compare.free.*` removed, plus generated files.
- harnesses: `scripts/pricing-pages.cjs`, plus the re-pins listed in §3.
