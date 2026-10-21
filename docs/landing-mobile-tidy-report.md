# landing-mobile-tidy — the landing page's hero line, plan cards, cheapest box and ticks

**Date:** 21 October 2026 · **Branch:** main (on top of `4633801c`; uncommitted; nothing pushed or deployed) · No database
change (none was needed).

This covers the original brief plus your answers and follow-ups on 21 October, applied in order. A later instruction
replaced an earlier one where you said so: the hero line went under the button (option A), then beside it again. Each
fix was checked with screenshots and measurements in **WebKit** (Safari's engine, via Playwright) and **Chromium**.

## Summary

- **Hero line:** two lines.
  - Line 1, "Upload a photo of your menu and see it working in under 60 seconds.", is semi-bold, dark navy and 15px.
  - Line 2, "No signup. No card.", is grey and 13.6px.
  - On phones they're centred under the button.
  - **From 1140px they sit beside the button**, inside the left column (they never reach the screenshots), centred on
    the button.
  - From 940–1139px (including your ~1000px window) they sit under the button, left-aligned, because beside it line 1
    would need four or more lines.
  - The headline, tagline, button and screenshots don't move at any desktop width (measured).
- **Plan cards, laptop/desktop:**
  - the gap above the price is gone, because the reserved two-line subtitle height was removed;
  - prices line up across the cards (each row is as tall as the tallest real subtitle);
  - prices are back at live's **2.3rem (36.8px)**;
  - there is 11px under "per truck / month";
  - the three "Try free" buttons are exactly level.
- **Plan cards, phones (below 640px):**
  - all three cards have Pro's dark 2px border;
  - each card's top is a **2×2 grid that lines up on baselines**: name and price on row 1, subtitle and "per truck /
    month" on row 2;
  - the name is 23px, the price 34px, and the label 13px, 4–6px under the price;
  - every plan name is on one line at 360px in GB, US, IE, AU and NZ;
  - subtitles wrap only at spaces.
- **"Which plan is cheapest for me?"** is centred at every width: the title, then the small grey line "Your online
  orders each month", then the bands. On desktop the bands sit in one row, 38px apart; on phones they stack. The bands
  no longer say "of online orders a month", and no plan name wraps.
- **The trial tick** sits beside "First 3 months…" on phones, both in the strip under the hero and in the list at the
  bottom of the page. Before, it sat 38–55px away from its text; now it's 9px.
- **GST:** "incl. GST" and "All prices include GST." are removed from en-AU and en-NZ (§3).
- **Checks:**
  - tsc is clean and `next build` passes;
  - no new lint errors;
  - **full sweep 147/147**;
  - 6 harness files re-pinned for the approved changes only.
- **One port:** only your dev server on 3000 is running (§1).
- **/features (follow-ups):**
  - the plan prices in the table header now line up on phones, where "Pay as you go" takes two lines;
  - the orange "3 months free with every feature unlocked" box is removed (§4b).

---

## 1 · One port, and why your laptop and iPhone showed the old layout

**Port 3000 is the only one in use now.** The server I'd run on 3100 for production-build checks is stopped.

**Your dev server (`next dev`, port 3000) serves the current code** at **`http://hatchgrab.localhost:3000/uk`** (and
`/us`). Plain `http://localhost:3000/` is a different page (not the HatchGrab landing). Measured on 3000 in WebKit and
Chromium, the page matches the production build exactly, including the tick fix below. The dev CSS is sent `no-store`,
so if a tab still shows the old look, reload it with ⌥⌘R. If that doesn't help, restart `npm run dev`; it has been
running since 18 October. Its page carries the new markup
(`hero-cta-lead`) and its CSS has every final rule (`.plan-word`, `.8125rem`, `1.4375rem`, `.proof .tick`).

What you saw matches a moment mid-change: the markup was newer than the stylesheet. For example:
- the new `plan-amount` span under the old `.plan-price span { font-size: .9rem }` rule renders the price at body-text
  size;
- the new `cheap-bands` wrapper with no rule for it makes the bands run together ("Pay as you go£2,900");
- an intermediate rule I had tried (`minmax(min-content, …)`) squashed the phone name column.

Safari also keeps old CSS until a hard refresh (⌥⌘R).

My production builds write to `.next/`, and the dev server writes to `.next/dev/`, so they don't overwrite each other.

## 2 · What changed, by item

### 2.1 Hero line (item 5, then your answers 2 and 1)

Markup: `app/landing/page.tsx` renders `hero.ctaNote` with two tags, `<lead>` and `<small>`, as two spans of one
paragraph, so a screen reader reads it as one paragraph. CSS (`app/landing/landing.css`):

| | Line 1 (`.hero-cta-lead`) | Line 2 (`.hero-cta-small`) |
|---|---|---|
| size | .94rem (15px; the old line was 13.6px, the headline is 32–48px) | .85rem (13.6px, the old size) |
| weight / colour | 600 · `--head` (#16314F, the headline's navy) | 600 · `--hero-grey` (the old muted grey) |
| wrap | `text-wrap: balance` (even lines) | — |

Where it sits:

| Width | Placement | Measured (WebKit / Chromium, /uk and /us) |
|---|---|---|
| < 940px | under the button, centred | unchanged layout, new words |
| 940–1139px (1000 tested) | under the button, left-aligned. Its box keeps the old note's height, so the hero doesn't grow | headline, button and screenshots at the same pixels as live |
| ≥ 1140px (1280, 1440 tested) | **beside the button**, confined to the left column, vertically centred on the button (a zero-height box, so the row stays the button's height) | text block centred on the button (Δ 0px); right edge = the column's edge (562 / 642px; live's note overflowed it to 583 / 663); screenshots start 44px further right; headline, button and screenshots unchanged |

**The same idea appears elsewhere, unchanged as asked:**
- `demoUpload.intro` (the upload modal: "…in under 60 seconds. No sign-up, no card.");
- `demoUpload.usually` ("This usually takes under 60 seconds.");
- `landing.final.lede` (the final call-to-action; en-GB and en-US);
- `landing.hero.subSmall` (in the markup but hidden at every width).

Emails and /features don't use it.

### 2.2 Plan cards: laptop and desktop (items 1 and 2, then your answer 1 and the follow-ups)

- **The gap above the price was `.plan-who { min-height: 2.4em }`**: two lines reserved for a subtitle so the prices
  lined up. Every subtitle is one line, so each card had an empty line (~13px). It is removed.
- From 880px the cards share their name and subtitle **rows** (CSS subgrid: `.plan { grid-template-rows: subgrid }`).
  Everything from the price down is one cell (`.plan-body`, new markup in `components/pricing/PricingSection.tsx`). So
  each row is as tall as the tallest name or subtitle actually shown, and the prices start on one line.
- **Price size:** live's `.plan-price { font-size: 2.3rem }` (36.8px) is unchanged on desktop. The 34px applies only
  below 640px.
- **"per truck / month" → fee line:** .15rem → **.7rem (11px)**, every card, every width.
- **Buttons level:**
  - the cards are equal height (grid stretch);
  - `.plan-body` is a flex column and the button has `margin-top: auto`;
  - Pro's 2px border is offset by 1px less padding, so its price and button land on exactly the same lines as the
    others (live was 1px off).
- "See every feature →" stays above its button.

| Measured | Live | Now |
|---|---|---|
| price size, 1000 / 1280 / 1440 | 36.8px | 36.8px |
| price tops across the 3 cards | two values, 1px apart | one value |
| "Try free" tops across the 3 cards | two values, 1px apart | one value |
| gap under "per truck / month" | ~2px | 11px |

### 2.3 Plan cards: phones (item 1, then your phone follow-ups)

Below 640px only:
- **Borders:** all three cards have `border: 2px solid var(--head)` (Pro's). Pro keeps its badge and orange button.
- **The 2×2 top:** `.plan` becomes `display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items:
  baseline`.
  - `.plan-body` and `.plan-price` are `display: contents`, so the amount and its label are grid cells.
  - Row 1 is the name and the price; row 2 is the subtitle and "per truck / month".
  - The left cells have `min-width: 0` and no fixed width.
- **Sizes:**
  - name 1.4375rem (23px);
  - price 2.125rem (34px), right-aligned and never wrapping;
  - label .8125rem (13px), never wrapping;
  - column gap .6rem.
- **Subtitle:** each word is a nowrap `.plan-word`, so "pre-orders" never splits; it wraps at spaces only.
- **Price → label:** the second row tucks up .3rem, giving a gap of **4–6px**. Rows still share baselines (Δ 0 on every
  card).
- **Fee line** starts .9rem under the subtitle, as before.

Measured on every card, in both engines (90 cards: GB, US, IE, AU and NZ fixtures × 360 / 375 / 393 × 3 plans; the
screenshot set covers /uk, /us and NZ):

| Check | Result |
|---|---|
| plan name on one line | 90 / 90 |
| price and label each on one line | 90 / 90 |
| row baselines shared (row 1, row 2) | Δ 0 / 0 on all |
| price → label gap | 4–6px |
| no overlap (name → price clearance) | ≥ 44px (NZ$0 at 360) |
| subtitle splits a word | never |
| horizontal scroll | none (scroll width = viewport) |

One thing to look at: with the label tucked 4–6px under the price, the name's descenders ("y", "g" in "Pay as you go")
sit close above the subtitle. That follows from the shared baselines plus the tight gap. If it feels cramped, a 7–8px
gap would loosen both.

### 2.4 "Which plan is cheapest for me?" (item 3, then your answers 3 and 4)

- **Markup:** a heading block (`.cheap-head`: title, then `.cheap-sub`) and a band row (`.cheap-bands`).
- **Layout:** everything is centred at every width. Desktop has one row with a 2.4rem (38px) gap; whole bands wrap if
  they don't fit (`.cheap-band { white-space: nowrap }`). Phones stack one band per line.
- **Measured:** one row at 1000, 1280 and 1440 with 38px gaps (live: 26px, and two rows at 1000). Every band is one
  line at 360 (GB, US, NZ$: "NZ$4,900 – NZ$14,100 → Pro").
- **The amounts still come from data:** `cheapestBands`, unchanged.
- **The plans PDF** (`lib/plans-pdf.ts`) shares these messages, so its bar gets the same small line ("Which plan is
  cheapest for me? *Your online orders each month* Under £2,900 → Pay as you go · …"). Without it, the PDF's first band
  would have lost its meaning.

### 2.5 The trial tick (item 4, and your follow-up for the bottom of the page)

- **Both lists:** the strip under the hero (`.trust-in li`) and the final call-to-action's list (`.proof li`).
- **The fix:** the tick is now inline at the start of the first line (`display: inline-flex; vertical-align: baseline;
  margin-right: .55rem; margin-block: -.2rem`), not a flex item beside a block of text.
- **Vertical centring:** an inline-flex box's baseline is its icon's bottom edge, which sits half a capital below the
  tick's middle, so `vertical-align: baseline` centres the tick on the capitals. An earlier version used `-.3em`, which
  left it **5px low**; that is the misalignment you saw on 3100. Now, measured in WebKit and Chromium at 375 and 1440,
  both lists: tick centre − capitals' centre = **0px** (top strip) and **0.2px** (bottom list). A wrapped item keeps its tick
  beside its first word, and the wrapped lines stay centred. The negative block margin stops the 21px tick making its
  line taller.
- **Measured** (WebKit and Chromium):
  - the gap from tick to first word is 9px on every line at 360, 375 and 1440, in both lists;
  - before, on the wrapped "First 3 months…" line it was 47–55px (top strip) and 38–45px (bottom list).
  - On desktop the strip's items shift by about 4px (the space now drawn between tick and word).

## 3 · Wording: every sentence, before → after

**en-GB** (the only locale with these keys; en-US and en-IE don't override them, so they inherit):

| Key | Before | After |
|---|---|---|
| `landing.hero.ctaNote` | No signup, no card.`<br>`See it working in under 60 seconds. | `<lead>`Upload a photo of your menu and see it working in under 60 seconds.`</lead><small>`No signup. No card.`</small>` |
| `pricing.bar.subtitle` (new) | — | Your online orders each month |
| `pricing.bar.first` | Under {to} of online orders a month → **{plan}** | Under {to} → **{plan}** |

Rendered:
- **/uk:** "Under £2,900 of online orders a month → Pay as you go" → "Under £2,900 → Pay as you go". "£2,900 – £8,000 →
  Pro" and "Over £8,000 → Unlimited" are unchanged.
- **/us:** the same with $.

**en-AU and en-NZ, the GST decision.** HatchGrab isn't GST-registered in AU/NZ, so no HatchGrab plan price claims to
include GST. Three overrides are deleted, so those lines fall back to en-GB. The footnote override loses its first
sentence but keeps "in {country}" and "EFTPOS machine".

| Key | Before (en-AU / en-NZ) | After |
|---|---|---|
| `pricing.card.perTruckMonth` | per truck / month incl. GST | per truck / month *(en-GB)* |
| `compare.plan.summary` | {price} per truck per month incl. GST, with {allowance} of online orders included… | {price} per truck per month, with {allowance} of online orders included… *(en-GB)* |
| `compare.plan.summaryNoFee` | {price} per truck per month incl. GST, with unlimited online orders and no HatchGrab fee. | {price} per truck per month, with unlimited online orders and no HatchGrab fee. *(en-GB)* |
| `pricing.footnote` | All prices include GST. * Plus Stripe’s card processing on online card orders (currently {cardFee} in {country}), paid to Stripe, not HatchGrab. Walk-up orders use your own EFTPOS machine — HatchGrab charges 0%. | * Plus Stripe’s card processing on online card orders (currently {cardFee} in {country}), paid to Stripe, not HatchGrab. Walk-up orders use your own EFTPOS machine — HatchGrab charges 0%. |

- Truck menus, orders and receipts are untouched: they never used these keys, and a truck's own `prices_include_tax`
  / `tax_label` behaviour is unchanged.
- There is no "GST" left in `messages/en-AU.json` or `messages/en-NZ.json`.
- `split-messages --check` is clean (107 namespaces).
- docs/anz-1-report.md still describes the earlier "incl. GST" wording; this report supersedes it on that point.

## 4 · /features, /compare and Billing

**Unchanged.**
- None of them uses a class this work changed (`plan*`, `cheap-*`, `hero-cta-*`, `trust-*`, `proof`, `tick`). In the
  rendered /uk/features, /us/features, /uk/compare and /us/compare, the only near match is the country menu's
  `cc-tick`, which no rule here touches.
- None of them uses the changed messages. "Your online orders each month" appears 0 times.
- Billing uses `PlanTable` and `plan-table.css`, neither changed here.
- **Only the plans PDF changed** (§2.4), and pricing-pages proves its new bar text.

## 4b · /features follow-ups (Dominic, 21 October 2026)

**Prices aligned in the table header.**
- In a phone's narrow column (76px), "Pay as you go" wraps to two lines and the others don't, so its price sat a line
  lower.
- Each header cell is now a flex column with its price pushed to the bottom (`.pt-features .pt-col { display: flex;
  flex-direction: column }`, `.pt-col-price { margin-top: auto }`). The cells already stretch to the row's height, so
  every price shares one line and the names keep level tops.
- **/features only:** Manage › Billing's table (`plan-table.css`) is untouched.
- "Pay as you go" stays on two lines on phones: at that column width one line would need the name at about 11px.
- **Measured** on port 3000, WebKit and Chromium, /uk and /us at 360, 375, 393 and 1440: **one price line in every
  case**. The reconstructed "before" had two on phones.

**The trial box is removed.**
- `app/features/page.tsx`: the `.features-callout` paragraph and its now-unused trial and fallback lookups are removed.
- `app/landing/landing.css`: its rule is removed, and the lede takes the 2.6rem the box left above the table (42px).
- `messages/en-GB.json`: `planTable.callout` is removed; no other locale had it.
- The landing page's pricing banner still offers the trial.

| Key | Before | After |
|---|---|---|
| `planTable.callout` | **3 months free with every feature unlocked.** Then {fallback} automatically, unless you choose a plan. | *(removed)* |

**Re-pinned** for this (approved):
- `pricing-pages`: /features has no callout; the trial-length scenario checks the banner and PDF only.
- `marketing-country-parity`: "no trial callout".

**Re-run:**

| Harness | Result |
|---|---|
| pricing-pages | 145 / 145 |
| marketing-country-parity | 145 / 145 |
| plans-data-model | 150 / 150 |
| language-phase-0 | 163 / 163 |
| language-phase-1e | 1024 / 1024 |
| language-phase-1e-tidy | 61 / 61 |
| messages-parity | 40,549 / 40,549 |
| seo-fixes | 86 / 86 |

Also: tsc is clean, lint is clean, `split-messages --check` is clean, and `next build` passes. The full 147-harness
sweep (§6) ran before these two /features fixes; the eight harnesses above are the ones that cover /features and the
messages.

**Screenshots:** `{before,after}-{webkit,chromium}-{uk,us}-features-top-{360,375,1440}.png`. "Before" is
**reconstructed on port 3000**: this tree with the old header rules and the removed box put back, because live /features
doesn't yet have the restored look this work builds on.

## 5 · Screenshots: `docs/landing-mobile-tidy/`

Names are `<before|after>-<engine>-<page>-<view>-<width>.png`.
- **engine:** `webkit` (Playwright WebKit 2359, Safari's engine) or `chromium` (Playwright Chromium 1243).
- **page:** `uk`, `us` or `nz` (the NZ fixture, after only).
- **view:** `hero`, `cards`, `cheapest`, `ticks-top` or `ticks-bottom`.
- **"before"** is the live site (`www.hatchgrab.com`, deployed at `4633801c`), which is the state this work started
  from. Live /us says "Pay at Hatch" in its banner where this tree says "Pay at the truck" (anz-1, uncommitted); that
  word isn't part of this work.
- **"after"** is a production build of this tree (`next build` + `next start`). The NZ cards are the anz-1 fixture
  render painted with that build's CSS.

| View | Widths | Pages |
|---|---|---|
| hero, cards, cheapest box | 1000, 1280, 1440 (and 375) | /uk, /us — before and after |
| cards (phone) | 360, 375, 393 | /uk, /us before and after; NZ after |
| tick strip (top), tick list (bottom) | 375, 1440 | /uk, /us — before and after (after: shot on port 3000, with the centring fix) |
| bottom tick list, current CSS over the build | 360, 375, 1440 | `before-/after-<engine>-final-ticks-*` |

Decision records:
- `compare-pro-card-1440.png`: the Pro card before the redesign, live, and with my first change;
- `question-hero-desktop-option-{A,B}-1440.png`: the two options you were asked about (superseded by "beside the
  button").

## 6 · Checks

- **tsc:** clean.
- **Build:** `next build` passes (the final build includes every change above).
- **Lint:** compared with HEAD, no new errors in the changed files:

  | File | Now | HEAD |
  |---|---|---|
  | `PricingSection.tsx` | 0 | 0 |
  | `app/landing/page.tsx` | 0 | 0 |
  | `lib/plans-pdf.ts` | 4 | 4 |

  The CSS isn't linted.
- **Harnesses re-pinned, for the approved changes only.** Each is marked `⚠️ RE-PINNED (landing-mobile-tidy, 21 October
  2026)`; no product bug was found.
  - **`anz-1`:** the bands' new wording, and no GST claim on the plan cards, /compare summaries or footnote (it now
    asserts there is no "GST" at all).
  - **`plans-data-model`:** the landing differs outside #pricing only by the exact new hero note, mapped back to the old
    one.
  - **`pricing-pages`:** the bar's new wording, on the page and in the PDF.
  - **`marketing-country-parity`:** the stored landing text's hero line, replaced exactly (it throws if the old line is
    missing).
  - **`_lp-stage-b`** (shared by language-phase-0/1e/1e-tidy and others): the hero note is its own named region. F's
    must be exactly the two-span note and BEFORE's exactly the old line; everything else stays byte-identical.
  - **`_language-phase-0-after`:** the price markup check now expects the `plan-amount` / `plan-per` spans.
- **Re-runs, each on its own:**

  | Harness | Result |
  |---|---|
  | anz-1 | 76 / 76 |
  | ireland-1 | 55 / 55 |
  | plans-data-model | 150 / 150 |
  | pricing-pages | 145 / 145 |
  | marketing-country-parity | 145 / 145 |
  | language-phase-0 | 163 / 163 |
  | language-phase-1e | 1024 / 1024 |
  | language-phase-1e-tidy | 61 / 61 |
- **Full sweep (`node scripts/run-harnesses.cjs`, 147 harnesses): 147 run, 147 passed, 0 failed.**
  - It includes the new wording, the GST removal and every layout change; `event-types-render` passed.
  - It started before the last change (the ticks' `vertical-align`, CSS only), so the two harnesses that read
    `landing.css` were re-run afterwards: pricing-pages 145/145, seo-fixes 86/86.
  - tsc and `next build` were re-run on the final tree: both pass.
  - No server is left running except your `next dev` on port 3000.

## 7 · Files

- `components/pricing/PricingSection.tsx`:
  - `.plan-body` wrapper;
  - `plan-amount` / `plan-per` spans;
  - subtitle words as `.plan-word`;
  - `.cheap-head` / `.cheap-sub` / `.cheap-bands`.
- `app/landing/page.tsx`: the hero note's two spans.
- `app/features/page.tsx`: the trial callout is removed.
- `app/landing/landing.css`:
  - cards: subgrid, phone grid, borders, spacing;
  - cheapest box;
  - hero note;
  - both tick lists.
- `lib/plans-pdf.ts`: the bar's small line.
- `messages/en-GB.json`: `hero.ctaNote`, `pricing.bar.subtitle`, `pricing.bar.first`; `planTable.callout` removed.
- `messages/en-AU.json`, `messages/en-NZ.json`: the GST wording.
- The generated `messages/ns/*` and `lib/i18n/catalog/*`.
- Harnesses: `scripts/anz-1.cjs`, `scripts/plans-data-model.cjs`, `scripts/pricing-pages.cjs`,
  `scripts/marketing-country-parity.cjs`, `scripts/_lp-stage-b.cjs`, `scripts/_language-phase-0-after.cjs`.
- Screenshots: `docs/landing-mobile-tidy/`.
