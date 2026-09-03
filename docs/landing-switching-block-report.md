# The switching block — a side door under the plan cards

**Built. Not deployed, not committed. No SQL, no migrations.**

**GARBLED SPANS: none.** No instruction contradicted another.

**VERIFICATION.** Not a typecheck. Everything below was **rendered and measured in a browser** — the block
at three widths against the live landing, and the calculator timed on an isolated server with the pricing
flag on (your dev server untouched, the copy deleted afterwards).

**COPY: used exactly as approved.** Heading *"Switching from another platform?"*, body *"See what you'd be
paying on HatchGrab for the same orders. Takes about a minute."*, link *"Compare what you're paying →"*.
⚠️ One typographic note in §4.

---

## 1. Where it sits — measured, not asserted

**Inside `<section id="pricing">`, after the plan cards, before the small print.** Identical at all three
widths:

| | 1280px | 390px | 320px |
|---|---|---|---|
| Gap: plan cards → block | **32.0px** | 32.0px | 32.0px |
| Gap: block → small print | **28.8px** | 28.8px | 28.8px |
| After the plan cards | ✅ | ✅ | ✅ |
| Before the small print | ✅ | ✅ | ✅ |

**Relative to the `/compare` link from the last task: that link is gone** — see §2. The block occupies its
position and does its job.

**Why after the cards:** the cards are the main argument and every visitor gets them. This is the extra
step only the paying subset needs, and putting it before the cards would interrupt the argument for
everyone to serve a minority.

---

## 2. 🔴 The two links — and which I removed

**There were two, in one section, to the same page:**

| | Wording | Status |
|---|---|---|
| Old, added yesterday | *"Work out what you would pay →"*, a bare line in `.price-foot` | 🔴 **REMOVED** |
| New | The switching block's *"Compare what you're paying →"* | ✅ kept |

**I removed the bare link.** Your instinct was right and the reasoning is the block's whole point: the
bare link had **no filter on it**. It invited everyone — including an operator paying nothing today — into
a calculator whose answer for them is "more than nothing". **The block does the same job and adds the
sentence that turns the wrong audience away before they click.** Keeping both would have left the
unfiltered invitation standing directly above the filtered one.

**Confirmed by grep: exactly one `href="/compare"` remains in the landing page, and zero references to
`compare-link` in either the page or the stylesheet** — the element and its three CSS rules went together,
no dead selector left behind.

---

## 3. Visually secondary — the type scale, measured

| | Rendered size |
|---|---|
| Section `<h2>` — "Start free. Stay free…" | **34.4px** |
| A plan name — "Pro" | **18.4px** |
| **The block's heading** | **16.0px** |

**It is smaller than a plan name, let alone the section heading** — so it reads as a note under the cards,
not as a new section. It is also a `<p>`, **not a heading element**: the section already has one `<h2>`,
and a second heading would give it structural weight it should not have.

**It does not compete with the primary CTA.** The page's one action is the orange `DemoCta` ("Try Free" /
"Upload my menu"). The block's link is **orange text on a transparent background** — measured
`rgb(239,139,44)`, `background-color: rgba(0,0,0,0)` — at 15.2px. **No fill, no border, no button.** The
panel itself is the section's own `--wash` tint with a 1px `--line` border, which is quieter than the
white plan cards beside it.

---

## 4. 🔴 No competitor named, no comparative claim

**Confirmed, reading the rendered text:**

> Switching from another platform? · See what you'd be paying on HatchGrab for the same orders. Takes
> about a minute. · Compare what you're paying →

- **No business is named.** "another platform" is deliberately unnamed.
- **No comparative claim is made about anyone.** It says what *you* would pay on HatchGrab for *your*
  orders — a statement about our own pricing against the reader's own figures, not a claim about a
  competitor's product or price.
- **Nothing I added elsewhere names one either.** The only files touched are `app/landing/page.tsx` (this
  block) and `app/landing/landing.css` (its styles).

⚠️ **The one thing I did NOT change, and you may want to.** The approved copy uses **straight**
apostrophes (`you'd`, `you're`) and I used them exactly as given. **The rest of the page uses curly ones**
("can't", "won't", "that's"). It is visible side by side. **Two characters would fix it** — but the copy
was approved verbatim and I will not silently re-punctuate approved wording. Say the word.

---

## 5. 🔴 "Takes about a minute" — TIMED. The claim holds.

**Measured total: 57.7 seconds**, with the result on screen. Under a minute, so **no STOP.**

**How it was timed, so you can judge the number rather than trust it:**

| Component | Measured |
|---|---|
| Page load to interactive | **1.5 s** |
| Mechanical completion (as fast as the UI allows) | **1.5 s** |
| **Paced run, end to end** | **57.7 s** |

The paced run is built from **measured** quantities, not guesses: the calculator has **five steps**
carrying **14 / 14 / 29 / 51 / 17 words**, one slider and two typed figures. The model applied was
**reading at 200 wpm** over those exact word counts, plus **1.5 s to act per control** — doubled for the
slider drag, tripled for the two typed figures at step 4. **That model is the assumption; the word counts,
step count and load time are measurements.**

⚠️ **The number depends on one thing being true: that the operator knows their current rate.** Step 4
asks *"What do you pay per order now?"* and wants a percentage and a per-order amount. Someone who has to
find an invoice will take minutes, not a minute. 🟢 **But that is exactly who the block filters for** — an
operator already paying another platform generally knows their rate to the nearest half-percent — and
**"about a minute" is appropriately hedged** rather than a promise of sixty seconds.

---

## 6. The three widths

| | 1280px | 390px | 320px |
|---|---|---|---|
| Block size | 544 × 144.8 | 350 × 144.8 | **280 × 191.4** |
| Horizontal overflow | **none** | **none** | **none** |
| Page errors | none | none | none |
| Plan cards / small print pushed into a worse position | **no** | **no** | **no** |

**The gaps above and below are identical at every width** (32.0px and 28.8px), so nothing above or below
it is crowded. At **320px the block grows to 191.4px tall** — the body wraps onto more lines — which
lengthens the section by about 47px against the other widths. **That is the block absorbing the narrow
viewport itself rather than pushing anything into a worse position:** the cards are already stacked in one
column there, and the small print sits below it with the same 28.8px of air.

`max-width: 34rem` with `margin-inline: auto` keeps it narrower than the card grid at desktop, so it reads
as subordinate to the cards rather than as a fourth full-width element.

---

## 7. 🔴 Clicking through while the flag is unset — and yes, this is worse than before

**Current state: `NEXT_PUBLIC_PRICING_PUBLISHED` is unset, so `/compare` answers 307 → `/contact`.** A
visitor clicking the link lands on the contact form.

**Does the block make that worse than the bare link did? Yes — and it is worth saying plainly.**

- The bare link said *"Work out what you would pay →"*. Bouncing to a contact form is a non-sequitur, but
  it promised nothing specific.
- **The block promises a specific outcome and a duration**: *"See what you'd be paying… Takes about a
  minute."* Arriving at a contact form instead is a broken promise made one sentence earlier — and the
  reader has just self-identified as someone paying a competitor, which is the most valuable visitor on
  the page to disappoint.

🔴 **So the flag matters more with this block than it did without it.** The recommendation from the release
report is unchanged and now firmer: **set `NEXT_PUBLIC_PRICING_PUBLISHED=true` in Vercel before or with
this deploy.** If for any reason it will not be set, **this block should not ship** — the bare link was
survivable in that state; this is not.

---

## 8. What was not touched

| | |
|---|---|
| The three protected strings | ✅ untouched |
| `lib/pricing.ts` (price mask set) | ✅ untouched |
| `lib/features.ts` | ✅ untouched |
| `/compare` gates (`app/compare/page.tsx`) | ✅ untouched |
| The plan cards, the small print, the comparison table | ✅ unchanged |

---

## Files changed

```
app/landing/page.tsx      the switching block, between the plan cards and .price-foot;
                          the bare "Work out what you would pay →" link removed
app/landing/landing.css   .switch-block / .switch-head / .switch-body / .switch-cta added;
                          the three .compare-link rules removed with the element they styled
```

## Before you deploy

1. 🔴 **Set `NEXT_PUBLIC_PRICING_PUBLISHED=true`** — §7. This block raises the cost of getting that wrong.
2. ⚠️ Decide on the straight-vs-curly apostrophes — §4.

**Nothing deployed. Nothing committed.**
