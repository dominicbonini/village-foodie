# Landing pricing — the mobile order, and the walk-up note

**10 October 2026 · not deployed · not pushed · localhost only · no truck touched**

Two changes to the landing page's pricing section: on a phone the three plan cards now come second
instead of fourth, and the Pro and Max fee lines say that walk-ups carry no fee.

---

## 1. The mobile order

### 1.1 What it was, and what it is

| | before (all widths) | **below 640px** |
|---|---|---|
| 1 | PRICING + "Start free. Upgrade when you need to." | PRICING + the heading |
| 2 | the fee paragraph ("Pro is £29 a month…") | the fee paragraph — **unmoved, still under the heading** |
| 3 | the orange "first month is completely free" box | **the three plan cards** |
| 4 | **the three plan cards** | the orange trial box |
| 5 | "Not sure which plan?" + Compare all features | "Not sure which plan?" + Compare all features |
| 6 | Switching from another platform? | Switching from another platform? |
| 7 | the small print | the small print |

So on a phone the cards move up past one block — the orange trial box — and everything else keeps the
order it had.

**640px and up is untouched** — the "before" column is still exactly what renders there.

### 1.2 How

One CSS block in `app/landing/landing.css`, `@media(max-width:639px)`. **No markup was moved, nothing
was duplicated and nothing was reworded** — every word is rendered once, from one place in
`app/landing/page.tsx`, so the wording is identical at every width and there is no second copy to keep
in step.

```css
@media(max-width:639px){
  .hg-landing #pricing .wrap       { display: flex; flex-direction: column; }
  .hg-landing #pricing .price-head { display: contents; }
  …order: 1 … 8 …
}
```

⚠️ **The fee paragraph stays with the heading**, which is where it has always been and where it was asked
to stay — it is part of the header block rather than a step of its own. So `.price-head` moves as **one
unit** and its box is left alone: its own `margin-bottom: 2.2rem` and the `.price-head .lede` rules above
still apply exactly as they do on a desktop, and the header reads the same on both.

⚠️ **An earlier draft of this moved the fee paragraph to the bottom**, below the switching block, which
needed `display: contents` on `.price-head` to dissolve the header's box so the paragraph could be ordered
away from the heading it sits with. That is gone: with the paragraph staying put, the header is a single
flex item and the rule is four lines shorter.

### 1.3 The four margin lines, and why they are not tidying

`.hg-landing * { box-sizing: border-box; margin: 0; padding: 0 }` is the first rule in this stylesheet, so
**every margin on the page is deliberate** — nothing collapses by accident, and a flex container therefore
changes no gap it is not told to. Two seams did change, and each has one line:

| seam | before | what the line does |
|---|---|---|
| cards → trial box | nothing — `.plans` has no bottom margin, and nothing followed it here | the box takes `margin-top: 2rem` |
| trial box → compare link | its `margin-bottom: 2rem` would **add** to `.feat-cta`'s `margin-top: 2.2rem` | the box hands the gap over (`margin-bottom: 0`) |

Plus one that the move from block flow to flex would have shifted on its own: `.feat-btn`'s
`margin-bottom: .4rem` **collapsed** into `.switch-block`'s `margin-top: 2rem` in block flow and would
have added to it in flex, so it is zeroed and the gap below the button is the 2rem it has always been.

The header → cards seam needed nothing: `.price-head` still carries its own `margin-bottom: 2.2rem`,
which is the same gap it gave the block below it before.

---

## 2. The walk-up note

The Pro and Max fee lines now read:

> Pro — First £1,500 of online orders included, then 0.99%\*. **No fee on walk-ups.**
> Max — First £2,000 of online orders included, then 0.99%\*. **No fee on walk-ups.**

- **The star stays on the percentage it footnotes.** The new sentence follows it, so the footnote still
  points at the fee it is about.
- **Plain text in the same `.plan-fee`**, so it takes the same size, colour and weight as the rest of the
  line, with no second rule to keep in step.
- **Starter is untouched**, as asked. Its fee line is "Pay at Hatch", which is a model rather than an
  allowance.

⚠️ **It is appended at the two cards, not in `PLAN_ALLOWANCES`.** That constant is read by the features
PDF (`lib/plans-pdf.ts`, `app/landing/features-pdf/route.ts`) as well as by these cards — editing the
source string would have changed three surfaces when the brief named two cards. The constant is unchanged.

🔴 **It is not a new claim.** The section's own fee paragraph has said *"Walk-ups carry no HatchGrab
platform fee on any plan"* all along; this puts it where a reader comparing two cards is actually looking.

---

## 3. What was run

| | |
|---|---|
| `npx tsc --noEmit` | clean |
| screenshot at 390px | `docs/landing-polish-shots/pricing-mobile/pricing-390.png` |
| screenshot at 1440px | `docs/landing-polish-shots/pricing-mobile/pricing-1440.png` |

Both shots are of the `#pricing` element itself, from the dev server on localhost. The rendered order was
read off the page at the same time, which is the one thing worth stating as a result rather than a claim:

```
 390px: eyebrow → h2 → lede → plans → trial-banner → feat-cta → feat-btn → switch-block → price-foot
1440px: eyebrow → h2 → lede → trial-banner → plans → feat-cta → feat-btn → switch-block → price-foot
```

The two differ in one place — `plans` and `trial-banner` swap — and the 1440px line is the markup's own
order, unchanged.

⚠️ **One note on reaching the page locally.** `proxy.ts` rewrites `/` to the landing only when the `Host`
header contains `hatchgrab`, and redirects `/landing` to `/` — so on plain `localhost:3000` the root
renders the Village Foodie discovery map instead. The screenshots were taken by launching Chromium with
`--host-resolver-rules=MAP hatchgrab.localhost 127.0.0.1` and visiting
`http://hatchgrab.localhost:3000/`. Nothing left this machine and no hosts file was changed.

Nothing else was run — the brief asked for light checks.

---

## 4. The rules

| Rule | |
|---|---|
| Current branch only | `main`, no branch created |
| Never deploy or push | Neither was done |
| Localhost only | The dev server already running on :3000 |
| Never test against a live trading truck | No truck was involved at all — this is the public marketing page |
| Nothing reworded | No copy was changed. The only new words are the sentence §2 was asked for |

Nothing in the brief arrived garbled, and no instruction contradicted another.

---

## 5. Files

| File | |
|---|---|
| `app/landing/landing.css` | the `@media(max-width:639px)` order block — eight lines of rules |
| `app/landing/page.tsx` | ". No fee on walk-ups." on the Pro and Max fee lines |
| `docs/landing-polish-shots/pricing-mobile/` | **new** — the two screenshots |
