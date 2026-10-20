# compare-tidy — simplify the /compare cost calculator

**Date:** 20 October 2026 · **Branch:** main (on top of `755c284c landing new prices`; uncommitted; nothing pushed or deployed)

**Summary.**
- **Staff question removed:** the question, its answers, the "Everyone gets their own login." line, its state, its gating and its messages.
- **The suggestion panel moved** into the online-orders card, under the slider and its "£X included…" line, as you chose (Q1 a).
- **Earlier unlocking:** everything after question 1 now unlocks on question 1 alone (Q2 a).
- **Renumbered** 1–5 with no gap (Q3 a).
- **Driven by order value alone:** the suggestion and the HatchGrab cost depend only on the monthly online order value, the country's card fees and the trial length (data).
- **Follow-ups:**
  - F1: the footnote markers are now numbered by row position: printing ¹, WhatsApp ².
  - F2: the Village Foodie sitemap lists `/contact`.
- /compare stays noindex, with its metadata unchanged. No SQL was run or needed.

---

## 1 · What changed in the calculator

| | Before | After |
|---|---|---|
| Question 3 | "How many people work the van?" (One / Two or more) | **removed**, with its state (`staff`), its effect and its messages |
| "We suggest {plan}" panel | inside the staff question's card, shown once it was answered | **inside the online-orders card**, under the slider and the "£X included…" line, in the same styling; it follows the slider live |
| "Everyone gets their own login." | shown on "Two or more" | **removed** |
| "£X included…" line under the slider | waited for the staff answer | **always shown**; the card unlocks with question 1 |
| Later cards, "See what it costs ↓", results | unlocked when question 1 **and** the staff question were answered | **unlock as soon as question 1 is answered** |
| Card numbers | system 1, trucks 2, people 3, orders 4, fee / trading days 5, months free 6 | **system 1, trucks 2, orders 3, fee / trading days 4, months free 5**; the small print's reference follows ("question 4") |

**How the suggestion works.** It is `cheapestAt()` from `lib/plan-offer.ts`, the same rule as the landing's "Which plan is cheapest for me?" bar. Its only input is the online order value per truck, read against the plans' `plan_prices`. The staff answer had already stopped affecting the plan in Stage B; it now affects nothing, because it no longer exists.

**The HatchGrab cost** is the plan's monthly price plus its fee on online orders above what it includes, × trucks, from `plan_prices`. Year 1 subtracts the free months, which default to `plans.trial_months`. Card processing is the country's `country_settings` card fee, shown separately as the processor's, on both sides.

**Messages removed** (en-GB and en-US): `compare.people.title`, `compare.people.one`, `compare.people.twoOrMore` and `compare.plan.ownLogin`.

**Grep proof.** No code, state or message references the staff question or its keys (`staff`, `setStaff`, `people.*`, `ownLogin`, `twoOrMore`) in `app/compare`, `messages/` or `lib/`. The only remaining mentions are two comments in `CostComparison.tsx` that record the removal. Every other "staff" in lib/ and components/ is the unrelated owner/manager/staff team role.

## 2 · Proof

### Screenshots

Production build (`next start` on :3100), /uk/compare, before vs after:
- **unanswered**;
- **answered:** "No, not yet", plus "One" on the old page, then £3,000 a month.

| View | Before | After | Differences |
|---|---|---|---|
| unanswered, 1440 | 1440×1980 | 1440×2000 | The staff card is gone; the cards are renumbered. The (still dimmed) orders card now carries its "£X…" line and the suggestion panel, so the page is 20px taller. |
| unanswered, 375 | 375×2238 | 375×2333 | The same. |
| answered £3,000, 1440 | 1440×2942 | 1440×2772 | The staff card and its line are gone; "We suggest Pro" sits under the slider and its "Inside the £4,000 … included" line; the cards are numbered 1–5. The results, breakdown and footer are identical. |
| answered £3,000, 375 | 375×3460 | 375×3298 | The same. |

These are exactly the four allowed differences:
- the removed question and its line;
- the panel's new position;
- the renumbering;
- the earlier unlocking.

Nothing else changed.

### Suggestions

**Production build, GB live data** (reading the page's "We suggest", by the slider):
- £2,000 → **Pay as you go**
- £3,000 → **Pro**
- £8,500 → **Unlimited**

The same before and after: Stage B had already made the suggestion volume-only.

**US fixture switched on** (`scripts/pricing-pages.cjs`):
- $2,000 → **Pay as you go**
- $3,000 → **Pro**
- $8,500 → **Unlimited**

It reads "$29 per truck per month", with no £.

## 3 · The remaining questions — what each changes, and my recommendation

Removing more is your decision. I removed nothing else.

| # | Question | What it changes in the result | Recommendation |
|---|---|---|---|
| 1 | **"Do you take online orders now?"** (Yes, with another system / No, not yet) | Which **comparison** the page makes. On **Yes**, it asks what they pay (Q4a), computes the **competitor cost** and shows the **savings** (year 1, year 2, %; or the "dearer" breakdown). On **No**, there's no competitor; it shows the **HatchGrab cost per trading day** and its breakdown, and asks trading days (Q4b) instead. It does **not** change the HatchGrab cost or the suggestion. It also unlocks the rest of the page. | **Keep.** It decides which answer the page gives. |
| 2 | **"How many trucks do you run?"** (1 / 2 / 3 / 4+) | Multiplies **both sides' monthly and yearly totals**, so the **HatchGrab cost**, the **competitor cost** and the **savings** in £. It also adds the "across N trucks" lines. It does **not** change the suggestion or the per-van per-day figure, since both are per truck. | **Keep.** Multi-van totals are the point for a fleet. |
| 3 | **"Online orders per month, per truck"** (slider; worded "How much do you think you'd take online…" on the No path) | **Everything:** the **suggestion**, the **HatchGrab cost** (the plan's fee above what it includes), the **competitor cost** (their % of it, plus their per-order fee × orders at the £15 average), and the **savings**. | **Keep.** It's the core input. |
| 4a | **"What do you pay per order now?"** (Yes path only: percentage, fixed per order, and "includes card processing / is charged on top") | The **competitor cost** only, and so the **savings**. Not the HatchGrab cost or the suggestion. | **Keep.** Without it there is no comparison. |
| 4b | **"How many days a week do you trade?"** (No path only: 1–7, default 4) | Only the **presentation** of the No-path headline: "£X **a trading day**", the "Based on N days a week" line and the "less than a coffee" claim. It changes no total, no cost, no suggestion. | **Remove or merge.** Show the No-path headline **per week**, as the Yes path already does. One fewer question, at the cost of losing the per-day framing. |
| 5 | **"Your introductory offer — how many months free?"** (number, default = the trial length from data) | The **year-1 HatchGrab cost** (12 − N months), the **year-1 saving and %**, the **two-year saving**, the breakdown's "Months 1–N — on us" line and the "first N months are on us" line. It does not change the monthly cost or the suggestion. | **Remove as a question; keep its effect from data.** The free months are now a fact (`plans.trial_months`), not something a visitor should edit. Letting them type 12 overstates the saving. |

## 4 · Is the online-order-value question first? (not moved)

**No. It is question 3**, after "Do you take online orders now?" (1) and "How many trucks?" (2).

**Moving it first would change more than the order:**
- **Its wording depends on question 1:** "Online orders per month, per truck" with "Only orders placed through your ordering page…" on Yes, and "How much do you think you'd take online…" with "A rough guess is fine…" on No. Placed first, it would need a neutral title and caption until question 1 is answered.
- **The unlocking would change:** it would be live while everything after it waited for question 1.
- **The card positions only reorder** (no new layout element), but the copy dependency above is a real change.

If you want it first, it needs one wording decision.

## 5 · F1 — footnotes numbered by table position

- **Numbering is derived, never fixed:** `lib/feature-table.ts` `noteOrder()` walks the table in render order (groups, then rows) and numbers each row note as it meets it.
- **Today:**
  - Kitchen ticket printing (Run your service) is **¹** and its footnote comes first;
  - WhatsApp auto-replies (Marketing & automation) is **²**.
- **Moving a row** moves its number and footnote with it.

**Proof (GB and US).** `pricing-pages.cjs` checks the markers on the two rows and the footnote order "*, ¹ printing, ² WhatsApp" on all three surfaces:
- /features;
- Manage › Billing;
- the plans PDF.

Live /uk/features (production build) shows the same: "Kitchen ticket printing ¹ | WhatsApp auto-replies ²", then "* … ¹ Kitchen ticket printing needs … ² WhatsApp auto-replies need …".

## 6 · F2 — the Village Foodie sitemap

`https://www.villagefoodie.co.uk/sitemap.xml` now lists the root and `/contact`. `/contact` has no lastmod (`yearly`, `0.3`), like the HatchGrab `/contact`. Shown by curl against the production build. `scripts/seo-fixes.cjs` asserts it.

## 7 · What was executed

- **Production builds:** before (the tree as left by pricing-tidy) and after; both pass. Screenshot and suggestion capture of /uk/compare on each, plus curl of the VF sitemap and /uk/features.
- **tsc:** clean.
- **Lint:** no new errors on the changed files (`app/compare/CostComparison.tsx`, `lib/feature-table.ts`, `app/sitemap.ts`).
- **Harnesses:**
  - `pricing-pages` 136/136, with new checks:
    - the suggestion by volume, GB and US ($);
    - the staff question gone;
    - numbering 1–5 on both paths;
    - the panel under the slider;
    - unlocking on question 1;
    - F1 on all three surfaces.
  - `seo-fixes` 86/86 (the VF sitemap with `/contact`). Its robots baseline is now pinned to commit `c6c44c9e`, because `public/robots.txt` left HEAD in your commit `755c284c`.
- **Full sweep (`node scripts/run-harnesses.cjs`, final tree):**
  - **144 of 145 harnesses pass.**
  - The one failure, `demo-rebuild-replace`, fails 1 check only because its fixture date is today. With the clock pinned to 2026-10-19 it passes 36/36, as in every workstream today.
- **Re-pins** (each marked `⚠️ RE-PINNED (compare-tidy, 20 October 2026)`):
  - **Compare calculator (the staff question's removal):**
    - `compare-no-system`: the `staff` patch is dropped; the cards are numbered 1–5 on both paths, with trading days at 4.
    - `country-settings-parity`: the patch is dropped. A named transform C1, plus checks per case: the staff card is gone, orders is 3 with the panel after it, fee or trading days is 4, months free is 5, and the results show on question 1 alone.
    - `marketing-country-parity`: `tidySides` removes the staff card and renumbers; the panel region is checked against the seed.
    - `plans-data-model`: a local `tidyCompare` for the /compare page and calculator views.
  - **The language-phase family** (`language-phase-0`, `-1d2`, `-1e`, `-1e-tidy`; `-1c`, `-1d`, `-2` and `messages-parity` re-run and passing):
    - a new shared module, `scripts/_lp-compare-tidy.cjs` (registered), holds an exact transform of the old calculator, plus the F2 sitemap entry;
    - `_lp-stage-b.cjs` applies the calculator transform;
    - `_lp-pricing-tidy.cjs` expects the F1 marker order.
  - **No product bug was found** by any re-pin.

## 8 · One observation (not changed)

Before question 1 is answered, the orders card is dimmed (opacity 0.45), and its moved "We suggest" panel shows inside it. Its "Use … instead" buttons can still be clicked.

That isn't new. A dimmed card has only ever been faded, never blocked: the slider in the same card was always draggable before question 1, and the old panel never showed before the staff answer.

If you'd rather the dimmed cards be inert, it's a one-line change in the `Card` component (`pointer-events: none` when disabled). Say if you want it.

## 9 · Files

- `app/compare/CostComparison.tsx`
- `lib/feature-table.ts` (`noteOrder()`; the markers derived from row position)
- `app/sitemap.ts` (VF `/contact`)
- `messages/en-GB.json`, `messages/en-US.json` (the four keys removed) + generated files
- harnesses: `scripts/pricing-pages.cjs`, `scripts/seo-fixes.cjs`, the new `scripts/_lp-compare-tidy.cjs`, `scripts/harnesses.json`, plus the re-pins in §7
