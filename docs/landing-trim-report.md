# LANDING PAGE TRIM — THE COMPARISON TABLE MOVES TO /features

**6 October 2026 · branch `main`, local only. Nothing pushed, nothing deployed, no production request,
no database write, no truck touched, no outreach row read or edited, and the menu-upload demo flow was
not run.**

---

## 🔴 0 · ONE THING IN THE BRIEF DID NOT MATCH THE CODE, AND I STOPPED TO ASK

The brief's CONTEXT said the plan feature list *"is shared with the Billing page via one component"*,
and STEP 3 was headed *"shared component, so this applies on Landing AND Billing"*. **It is not.**

| What the brief assumed | What is actually there |
|---|---|
| one shared plan-card component | the Starter/Pro/Max bullet lists are **hand-written `<li>` literals** in `app/landing/page.tsx`, with the file's own comments saying so repeatedly (*"HAND-WRITTEN, NOT RENDERED FROM FEATURE_SECTIONS"*) |
| Billing shows those cards | Billing renders `FEATURE_SECTIONS` as a **plan-columns × feature-rows matrix** (`app/manage/[token]/page.tsx:14300`). It has no bullet-list plan cards at all |
| the rename is a change | the shared row **already read** `{ name: 'Private events', … }` (`lib/plan-features.ts:304`). The landing card was the surface out of step |

⛔ **That made three instructions mutually exclusive**: *"shared … applies on Landing AND Billing"*,
*"the comparison table's row order stays exactly as it is"*, and *"check the Billing page plan cards
show the new order"*. The only list Billing shares is the one I was told not to reorder.

**Your decision:** *"just the pricing section is changing here. the full features list doesn't need
changing except that it's being moved to another page."*

🟢 **So `lib/plan-features.ts`, `lib/landing-table.ts` and `lib/features.ts` are byte-untouched** —
proven with `git diff --quiet` in §7 — and every Step 3 change is to the landing page's own card
literals. Billing, Admin and the plans PDF render exactly what they rendered this morning.

---

## 📁 1 · FILES CHANGED, ADDED AND DELETED

### Added

| File | |
|---|---|
| `app/features/page.tsx` | 156 lines. The new page: host gate, its own metadata, the chrome, the moved section, the back link |
| `components/landing/FeatureComparison.tsx` | 124 lines. The section itself — **moved verbatim**, §2 |

### Changed

```
 app/landing/page.tsx                 | 269 ++++++++++++++---------------
 app/landing/landing.css              |  42 +++++-
 app/sitemap.ts                       |  16 ++-
 components/landing/LandingNav.tsx    |  14 ++
 components/landing/LandingFooter.tsx |   4 +
 lib/plan-features.ts                 |  15 +-      ← §4e, the section rename ONLY
 scripts/plan-feature-order.cjs       |   4 +-      ← its pin, updated to the new name
 docs/reference-manual.md             |   1 line    ← the sentence §4e falsified
 8 files changed
```

⚠️ **`lib/plan-features.ts` IS IN THIS LIST, AND §0 SAID IT WOULD NOT BE.** That was true of the trim
itself and is still true of it; the rename in §4e came later, as a separate instruction, and it is a
**section TITLE**, not a row, a cell or an order. See §7 for what that does and does not touch.

### Deleted

**No files.** ⚠️ **The "Everything you need, nothing you don't" section was never a component** — the
Orders eyebrow, its lede and the `#17` Sarah ticket were inline JSX in `app/landing/page.tsx`, so there
was nothing to delete alongside it. See §4 for the CSS it leaves behind.

---

## 🔴 2 · THE MOVE IS PROVABLY VERBATIM

The brief said *"moved intact: heading, subline, table and footnotes 1–5 … Do not change the table's
rows, order or wording."* That is asserted rather than asserted-at:

```
old lines: 61   new lines: 61
✅ IDENTICAL, ignoring indentation only
```

The old section was lifted out of `git show HEAD:app/landing/page.tsx` (between the
`FULL COMPARISON` banner and the `FINAL CTA` banner), compared line-for-line against the component's
JSX with leading whitespace stripped, and the two are the same 61 lines. The only change is a two-space
dedent: the section sat six levels deep inside the landing's wrapper `<div>` and sits four deep in a
component.

**Two module-level helpers moved with it**, because each had exactly one reader and that reader was the
table:

| | |
|---|---|
| `FOOTNOTE_TEXT_OVERRIDES` | the landing-only footnote-2 wording. ⚠️ The shared `FOOTNOTES` are still not modified — Billing and Admin keep the original text |
| `Cell` | the ✓ / — / "Coming soon" renderer. Its glyphs still come from `lib/landing-table.ts`, so the PDF prints what the page prints |

Leaving either behind would have left the landing holding a renderer for markup it no longer has, which
lint reports as *unused* rather than as *wrong*.

### Why a component and not a retyped page

A move is the one task that can quietly change what it moves. A shared component makes the claim
checkable in one diff, and it keeps `/features` and the printable PDF reading the same two pure modules
(`lib/plan-features.ts` + `lib/landing-table.ts`) they always did.

---

## 🔴 3 · THE NEW PAGE

| | |
|---|---|
| **Route** | `app/features/page.tsx`, a server component, `dynamic = 'force-dynamic'` (it reads the Host header) |
| **Contents** | the moved section, then **"See prices and plans →"** → `/landing#pricing` |
| **Chrome** | the same `<LandingNav />` and `<LandingFooter />` the landing renders, from one definition |
| **Host handling** | the **same shape as `/compare`**: `isHatchGrabHost(headers().get('host'))`, else `notFound()` |
| **Indexable** | 🟢 **yes** — `robots: { index: true, follow: true }`, unlike `/compare` |
| **Title** | `Plans & features compared — HatchGrab UK` (43 chars, inside Google's ~60) |
| **Canonical** | `https://www.hatchgrab.com/features` |
| **Sitemap** | added, `changeFrequency: 'monthly'`, `priority: 0.8` |

**Verified in the served `<head>`, not in the source:**

```
<title>Plans &amp; features compared — HatchGrab UK</title>
<meta name="description" content="Every HatchGrab feature on every plan, side by side — Starter, Pro and Max, with fees and allowances. Your first month includes everything.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://www.hatchgrab.com/features">
<meta property="og:url" content="https://www.hatchgrab.com/features">
```

⚠️ **Checked in rendered output on purpose.** `app/landing/page.tsx` carries a note about this exact
trap: its own title was *"HatchGrab — … | HatchGrab"* for a long time because `app/layout.tsx` declares
`title: { template: '%s | HatchGrab' }` and a bare string gets the brand twice. The source read
correctly. This page uses `title: { absolute: … }` for the same reason.

### Three deliberate differences from `/compare`

1. 🟢 **Indexable, where `/compare` is `noindex, nofollow`.** `/compare` shows the real unmasked price
   list to a hand-picked audience and has no search traffic to win. This is the opposite case: the
   landing it came from is already `index: true`, this content was public on it this morning, and
   *"what's included on each plan"* is what an operator types into a search box. Moving it off a public
   page and not indexing it here would have made public content private by accident.
2. 🔴 **ONE `.hg-landing` wrapper round the whole page, where `/compare` splits its in two.** All of
   `landing.css` is scoped under `.hg-landing`, and one rule is `.hg-landing * { margin: 0 }` — which is
   why `/compare` keeps its Tailwind calculator outside the wrapper. **Nothing on this page is
   Tailwind**: the chrome and the table are `landing.css` markup throughout. One wrapper is correct here
   *and* is what makes the sticky priced header work, since a `position: sticky` element only travels
   inside its parent's box (`/compare` needed a `display: contents` hack for exactly this).
3. ⚠️ **No CTA of its own beyond the nav's.** The prices and the decision live on the landing; adding
   cards here would give the product two pricing surfaces to keep in step.

### The sitemap, as served

```xml
<!-- Host: www.hatchgrab.com -->
<url><loc>https://www.hatchgrab.com/</loc>        <changefreq>weekly</changefreq>  <priority>1</priority></url>
<url><loc>https://www.hatchgrab.com/features</loc><changefreq>monthly</changefreq> <priority>0.8</priority></url>

<!-- Host: www.villagefoodie.co.uk -->
<url><loc>https://www.villagefoodie.co.uk/</loc>  <changefreq>daily</changefreq>   <priority>1</priority></url>
```

⚠️ **Host-aware, and it already was.** The Village Foodie sitemap is unchanged — a host-blind one would
advertise a HatchGrab URL on `villagefoodie.co.uk`, which the file's own header warns about.

---

## 🔴 4 · THE LANDING PAGE

### 4a · The table section is gone, and the link replaced it

The whole `<section className="band">` is replaced by a tombstone naming where it went and why. **The
link sits directly under the plan cards and before the switching block:**

```jsx
<p className="feat-link"><a href="/features">See every feature, plan by plan →</a></p>
```

⚠️ **Before the switching block, deliberately.** *"Switching from another platform?"* filters itself out
for most readers — its own long note in the source says that is the whole design — so a link placed
after it would sit behind a heading telling half the audience the paragraph is not for them.

⚠️ **A text link, not a button.** Every filled control on this page is an orange `DemoCta`; a button
here would compete with the three in the cards immediately above it.

### 4b · "Everything you need, nothing you don't" is deleted

The Orders eyebrow, its lede and the `#17` Sarah ticket. **It was never a component**, so nothing was
deleted alongside it.

⚠️ **Its CSS is left in place and flagged rather than swept.** `.ticket-stage`, `.ticket` and the
`.t-*` rules in `landing.css` are now **unused** — the other two consumers of that stylesheet
(`/compare` and `/features`) never rendered a ticket. Deleting CSS was not part of this task and a
stylesheet sweep is its own job, so it is recorded here instead of done quietly. **See §9, item 1.**

### 4c · "Features" in the header and the footer

| | |
|---|---|
| **Header** | `<a href="/features" className="btn btn-quiet nav-hide-md">Features</a>`, immediately before Pricing |
| **Footer** | `<a href="/features">Features</a>` in `.foot-links`, at **every** width |
| **Pricing, on the landing** | still `#pricing` — a bare fragment, unchanged |
| **Pricing, on /features** | `/landing#pricing`, via the existing `landingHref` prop |

🔴 **The header link is hidden below 820px, and that number is a measurement.** `nav-hide-sm` drops
Pricing and the full Log in below 640px. Features needed a **wider** floor because the row is already
within ~59px of full at 640: the logo note in `LandingNav.tsx` records the measurement (gutters leave
~589px; logo + gap + Pricing + Log in + CTA ≈ 530px), and a `btn-quiet` "Features" needs ~88px including
its gap. It does not fit — and `.nav-r .btn` is `white-space: nowrap` with the standing instruction that
*"the CTA must never wrap the header"*, so the element that would give way is the one that must not.

⚠️ **So Features is footer-only on a phone AND on a narrow tablet**, which is wider than the brief's
"on phone" but is the honest consequence of *"don't crowd or wrap the header"*. **Measured at fourteen
widths in a browser** rather than reasoned about — §6.

⚠️ **`nav-hide-md` is a `max-width` rule, so the default is visible.** A `min-width` rule edited to the
wrong number would hide the link at every width and look like a deletion; this way the failure mode is
"shown slightly too narrow", not "gone".

🔴 **`/features` is an absolute path and takes no `landingHref`.** Unlike `#pricing` there is no
fragment to resolve against the current page, so there is nothing for a child route to get wrong.

### 4d · 🔴 THE WHITE/WASH ALTERNATION — REPORTED BROKEN, AND FIXED

⛔ **Deleting the "Orders" section broke the page's background sequence, and nothing errored.** Dominic,
the same day: *"the sections were alternating background colours … the testimonial and pricing are both
white. Also 'want to see how easy setup is' section all blends together."* Correct on both counts: the
deleted section held the **wash** slot between the white testimonial and white pricing, so removing it
left **three white blocks in a row** — testimonial, pricing, final CTA — with no seam between them.

| | before the trim | after the trim | **now** |
|---|---|---|---|
| trust strip | wash | wash | **wash** |
| What it does | white | white | **white** |
| Getting going | wash | wash | **wash** |
| Testimonial | white | white | **white** |
| **Orders / ticket** | **wash** | *(deleted)* | — |
| **Pricing** | white | ⛔ white | 🟢 **wash** |
| Final CTA | white | ⛔ white | **white** |

**The fix is one class**: `<section id="pricing" className="band">`. Pricing takes the wash slot the
deleted section used to hold, which restores the alternation *and* restores the exact relationship the
source comment always described — the white testimonial sitting between two wash bands.

🟢 **The plan cards gain from it.** `.plan` is `background: var(--paper)`, so three white cards now sit
**on** the tint instead of white-on-white, and the grid reads as three objects rather than one field.

⚠️ **One thing had to move with it.** `.switch-block` was `background: var(--wash)` — the band's own
colour — so it would have dissolved into its section and lost the boundary it exists to draw. It is
`--paper` now, which keeps the **same relationship it always had**: one step away from whatever it sits
on. The hairline border carries it either way, which is why it was inverted rather than removed.

🔴 **AND THE SEQUENCE IS NOW WRITTEN DOWN IN THE SOURCE.** The comment on "Getting going" used to read
*"… testimonial(white) → orders(wash) …"* — it named the very section whose deletion broke this, and it
was the only record that an order existed at all. It is now a table of all seven blocks with an explicit
instruction to re-read it when a section is added, removed or moved. **A background sequence is a
property of the page, not of any one section**, so nothing can fail locally when it is broken.

**Verified as computed colours in the browser, not as class names**, at 390px and 1440px:

```
WASH   trust-strip    (no heading)
white  section        What it does
WASH   band           Getting going
white  quote-sec      (the testimonial)
WASH   pricing        Pricing
white  try            Want to see how easy setup is?
```

✓ no two adjacent blocks share a tone `[WpWpWp]` · ✓ pricing is `rgb(245,248,251)` · ✓ the plan cards
are `rgb(255,255,255)` on it · ✓ the switching block is white and still reads.

### 4e · 🔴 "Online sales & automation" → "Pro tier"

Asked for separately, in the `/features` table. One line in `lib/plan-features.ts`.

🟢 **It makes the three headings one set: Core operations · Pro tier · Max tier.** The old title named
the KIND of feature while the one below it named the PLAN, so the table changed the question it was
answering halfway down — and the plan is the column a reader is scanning for.

⛔ **It is accurate, not just tidier**: every row in that section is `pro: true` or `coming_soon`, and
none is `starter: true`. A note in the source says what to do if that ever stops being true.

⚠️ **Sentence case, like 'Max tier'.** The capitals on screen come from the stylesheet
(`.cmp2-grp { text-transform: uppercase }`, and Billing's `uppercase tracking-wider`), so a string typed
in capitals would be shouting stored in the data. Verified: the computed `text-transform` is `uppercase`
on all four group labels.

🔴 **ONE SOURCE, FOUR SURFACES — so this heading also changes on Manage → Billing, Admin and the plans
PDF.** There is no landing-only override for a section TITLE (`lib/landing-table.ts` overrides row names
and details only) and adding one would be a second source of truth for a heading. ⚠️ **This is the one
edit to `lib/plan-features.ts` in this workstream**, and it is a rename, not a reorder — the row-order
proof in §7 is unaffected and `plan-feature-order.cjs` still passes 27/27 with its pin updated.

⚠️ **One living document was corrected rather than left false**: `docs/reference-manual.md` stated the
canonical structure as *"three sections — Core operations, Online sales & automation, and Max tier"*.
That sentence became untrue, so it now names Pro tier. **Older reports in `docs/` are historical records
of changes made on their own dates and were deliberately NOT rewritten.**

**Verified on the rendered page:** group labels read `Fees | Core operations | Pro tier | Max tier`, and
the string "Online sales" appears nowhere in the page's text.

### 4f · Nothing else moved

The hero copy and layout, "Built for food trucks", "Getting going", the testimonial, the pricing copy
and orange trial banner, the switching box, the final CTA and the rest of the footer are untouched —
§7 proves it on the hunk list.

### 4g · The load fix — and the brief's premise was already false

⛔ **THE THREE HERO SCREENSHOTS DO NOT REQUEST 3840px IMAGES, AND DID NOT BEFORE THIS CHANGE.** The
brief said *"they currently request w=3840"*. Measured across three viewports × three device pixel
ratios, before any edit:

| | 390 dpr1 | 390 dpr2 | 390 dpr3 | 1440 dpr1 | 1440 dpr2 | 1440 dpr3 | 1728 dpr3 |
|---|---|---|---|---|---|---|---|
| `kitchen.png` | 384 | 640 | 750 | 384 | 640 | 1080 | 1080 |
| `dashboard-v4.png` | 640 | 640 | 1080 | 640 | 828 | 1200 | 1200 |
| `customer-order.png` | 256 | 256 | 384 | 256 | 384 | 640 | 640 |

**Nothing asks for 3840 at any combination.** All three already carry a correct `sizes` matching their
CSS caps (`(max-width: 939px) 58vw, 320px` and so on) — `w=3840` is what you get from `fill` or
`sizes="100vw"`, and these have neither. 🔴 **So the hero was left completely alone**, which is also
what *"the hero must look identical"* asks for: there was no fix to make and any edit would have been
risk for nothing.

🟢 **The Gusto logo was already lazy, and that was also not the fix.** `next/image` defaults to
`loading="lazy"` without `priority`, and it has never had `priority` — verified as `loading=lazy` in the
browser rather than inferred from a missing prop.

**The one real saving available under 2e was its `sizes`:**

| | before | after |
|---|---|---|
| requested | `w=384`, **11.2 KB** | `w=96`, **2.9 KB** |
| rendered at | 77px | 77px (unchanged) |

With no `sizes`, `next/image` builds the srcset from the `width` **prop** — 320, the intrinsic file
width — and picks the smallest device size at or above it. The prop is not the painted width, so it was
never going to choose sensibly on its own. **96px is derived from the stylesheet, not picked**:
`.quote-logo` is `height: 56px; width: auto` and the file is 320×233, so the painted width is
56 × 320/233 ≈ 77px, and 96 is the smallest step in `next/image`'s own `imageSizes` ladder above it.
`width`/`height` are untouched, so the reserved box and aspect ratio are identical and there is no shift.

⚠️ **This touches an element inside the testimonial, which 2d says not to change.** 2e names the Gusto
logo explicitly as the below-the-fold image to fix, so I read that as carving it out for load purposes
only — and the change is a `sizes` attribute with no visual effect. Flagged rather than assumed.

---

## 🔴 5 · THE PLAN CARDS (landing only — see §0)

### The Pro card, read out of the rendered DOM

```
["Everything in Free, plus","Offline order protection","Take payment online",
 "Pre-orders & collection times","Smart slot management","Auto-accept orders","Private events",
 "WhatsApp auto-replies","Messenger & Instagram auto-replies Coming soon",
 "Take payment on your phone Coming soon"]
```

**Exactly the brief's order**, asserted as a whole-list equality at both widths, not as a set of
contains-checks.

| Change | |
|---|---|
| **"Private events with their own ordering link" → "Private events"** | it was the longest bullet in the list, for a detail the matrix row's own `detail` already carries. 🟢 It is now **byte-identical to the row's `name`**, which already said "Private events" — the card was the one out of step, so this closes a gap rather than opening one |
| **"Private events" moved up** | ⛔ the two "Coming soon" bullets did **not** move. What moved is this one, which sat *between* the badged Messenger/Instagram line and "Take payment on your phone" — so the card read built, coming-soon, built, coming-soon, and a reader scanning for what they get today had to read every line to know which half it was in |
| **The ⁴ footnote marker removed** | §5.1 |

### Coming-soon at the bottom, grouped — all three cards

| Card | "Coming soon" bullets | Result |
|---|---|---|
| **Starter** | 0 of 6 | rule satisfied with nothing to move |
| **Pro** | 2 of 10, the **last two** | was interleaved; now grouped |
| **Max** | 1 of 7, the **last one** | already correct, as the brief said |

Asserted structurally rather than by eye: every badged `<li>` index must form an unbroken run ending at
the list's last item.

### 5.1 · The footnote marker, and why it had to go

The Pro card's WhatsApp bullet carried `<sup className="f-note">4</sup>`. 🔴 **`.f-note` resolved to the
numbered list under the comparison table — and that table is `/features` now**, so the superscript
became a reference to nothing, on the one surface where a reader cannot tell a dangling marker from a
missing footnote.

⚠️ **The footnotes themselves are untouched.** Footnote 4 still renders beneath the table on `/features`,
where the matrix row still carries its marker — which is what the brief asks for ("markers in the
/features table stay").

⚠️ **THE `*` FEE-STARS STAY, AND THAT IS THE SAME RULE APPLIED.** Pro's and Max's `.plan-fee` lines carry
`<sup className="fee-star">*</sup>`, pointing at the `*Standard card processing fees…` paragraph in
`.price-foot` — which is **still on the landing page, in the same section**. The brief's test is
"wherever the footnotes it points to are not on the same page"; these pass it. Asserted as *zero*
superscripts inside card `<li>`s, which is where the dangling one was.

🔴 **The old warning in the source is kept**, because it is still the rule for the row: *"if footnote 4
is ever renumbered or retired, this marker must move with it; it will not error, it will just point at
the wrong note."* That is exactly what happened here — the note did not move, the **page** did.

---

## ✅ 6 · THE CHECKS — 88 BROWSER ASSERTIONS, ALL PASSING

Chromium against `next build` + `next start` on port 3100. 🔴 **The host is faked in the browser, not in
`/etc/hosts`**: `proxy.ts` and `lib/brand.ts` both decide the brand with `host.includes('hatchgrab')`,
so `localhost` is Village Foodie and the landing is unreachable at `/`. Chromium's
`--host-resolver-rules=MAP local.hatchgrab.com 127.0.0.1` gives the server a real hatchgrab `Host`
header with no system change and no `sudo`.

### The nav, at fourteen widths

```
 360px: ONE row (39px vs tallest child 39px), 72px tall, nothing overflows  [Upload my menu → | Log in]
 390px: ONE row … 639px: ONE row …                     Features NOT in the header (footer only)
 640px: ONE row (48px vs 48px), 72px tall              Features NOT in the header
 700px / 768px / 818px / 819px: ONE row                Features NOT in the header
 820px: ONE row (48px vs 48px), 72px tall  [Features | Pricing | Log in | Upload my menu →]
 900px / 1024px / 1440px / 1728px: ONE row             Features IS in the header
```

Nav height is **72px at every width**, nothing overflows, and the rightmost child stays inside the nav
box. The 819/820 pair is checked on both sides of the breakpoint.

⚠️ **The first version of this check failed at 360–639px on correct markup**, and the check was wrong,
not the page: it detected wrapping by counting distinct child `top` values, and below 640px the compact
`.nav-only-sm` Log in is 35px tall against the CTA's 39px, so with `align-items: center` their tops
differ by 2px while both sit on one line. Wrapping is now detected by the row's own height against its
tallest child — a wrapped row is ~2× that, nowhere near a 2px difference.

### The landing, at 390px and 1440px

- the comparison table is gone (no `.cmp2`, no "Every feature, side by side" in the text)
- its footnote list went with it (no `.fn`)
- the ticket section is gone (no `.ticket`, no "Everything you need, nothing you don…" in the text)
- the link reads **"See every feature, plan by plan →" → `/features`**
- it sits **after** the last plan card and **before** `.switch-block`, asserted with
  `compareDocumentPosition` rather than by source order
- **no horizontal page scroll**
- the Pro card is the brief's exact order; coming-soon grouped at the bottom on all three cards; zero
  footnote superscripts in card bullets
- **clicking the link actually lands on `/features` with the table rendered**

### /features, at 390px and 1440px

- heading **"Every feature, side by side."** and its subline both present
- **36 rows**, four columns — `Trial | Starter | Pro | Max`
- **footnotes 1–5** all render
- 🔴 **no horizontal page scroll**, and the `.cmp2` container does not scroll sideways either, at
  **both** widths. (The brief allows a scrolling container; this table does not need one — `landing.css`
  narrows `--cmp-col` to `3.6rem` on phones precisely so it fits, which the measurement confirms:
  `3.6rem` at 390px, `7rem` at 1440px)
- `landing.css` **applies** — `--cmp-col` resolves, so the section really is inside `.hg-landing`
- the priced header is still `position: sticky`
- the back link reads **"See prices and plans →" → `/landing#pricing`**
- nav Pricing points **off-page** → `/landing#pricing`
- the footer carries `Features | Pricing | Privacy | Terms | Contact`

⚠️ **A second wrong assertion, also mine:** I asserted the first column reads "Free trial". It reads
**"Trial"** — these are `PLAN_META`'s own names, and I had written the price *label* from memory
(`PLAN_PRICE_LABEL`, which shows "Free"). The table was right.

### The phone fallback

At 390px: Features is in the **footer** (→ `/features`) and **not** in the header.

### The backgrounds and the renamed heading — 11 further assertions

A second run, measuring **computed `backgroundColor`** on every full-width block between the hero and
the footer, in document order, at 390px and 1440px. Output and results in **§4d**; the group-label
check in **§4e**. ⚠️ **Computed colour, not class names** — a `band` class that a later rule overrode
would pass a class census and fail here, which is the half a source check cannot see.

---

## ✅ 7 · WHAT ELSE WAS RUN

| | |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npx next build` | **✓ Compiled successfully**, `/features` listed as a route |
| `npx eslint app components lib` | **774 errors — identical to the baseline.** Warnings 221 → **219** |
| the five touched files, linted alone | **0 errors, 0 new warnings** |
| `node scripts/run-harnesses.cjs` | **98 run · 98 passed · 0 failed** |
| `scripts/plan-feature-order.cjs` | **27/27** — the two pinned row adjacencies and the 31-row invariant |
| `scripts/whatsapp-golive-parity-harness.cjs` | **37/37** |

### The parity guard

```
✅ findPlanParityViolations() -> 0 violations
```

Called **directly** — `lib/plan-features.ts` compiled with the repo's own `tsc` and `require`d, the same
technique the two harnesses above use — not merely inferred from the build not throwing.

🔴 **AND IT STILL FIRES WHEN THE LANDING RENDERS, WHICH WAS THE RISK.** That module runs the guard at
module load, so it only fires on a route that imports it. The landing's import shrank from seven names
to four (`PLAN_PRICES`, `PLAN_DESCRIPTIONS`, `PLAN_ALLOWANCES`, `CARD_FEE_ONLINE_LABEL`) when
`FEATURE_SECTIONS`, `FOOTNOTES`, `TRANSACTION_ROWS` and `type FeatureValue` left with the table, and
the whole `@/lib/landing-table` import went. ⚠️ **If a later change removes the last of those four, the
guard stops running on that route and nothing will say so** — a comment to that effect is now in the
file, above the import.

### The shared sources — what changed, and what provably did not

```
lib/landing-table.ts       unchanged ✓
lib/features.ts            unchanged ✓
lib/plan-features.ts       ONE section title renamed — §4e
```

⚠️ **THIS IS A CORRECTION TO AN EARLIER VERSION OF THIS REPORT**, which said all three were untouched.
That was true of the trim, and the rename in §4e arrived afterwards as its own instruction. Saying
"untouched" now would be the kind of stale claim this report exists not to make.

🟢 **WHAT THE RENAME DOES NOT TOUCH, PROVEN RATHER THAN ASSERTED.** The whole diff to that file is the
string `'Online sales & automation'` → `'Pro tier'` plus its explanatory comment:

- **no row was added, removed, reordered, renamed or re-tiered** — `plan-feature-order.cjs` passes
  **27/27**, and that harness pins the section's full row list **in order** by name as well as the two
  adjacencies asked for by name in October, so a row that moved while the title changed would fail it;
- **no cell changed** — `findPlanParityViolations()` returns **0**, and
  `whatsapp-golive-parity-harness.cjs` passes **37/37**;
- so *"the comparison table's row order stays exactly as it is"* **still holds**, and Billing, Admin and
  the PDF differ from this morning by one heading and nothing else.

### The hero is untouched, two ways

1. **`git diff` hunk list**: the earliest in-body hunk is at old line 401, the testimonial logo. The
   hero is lines ~189–290. **No hunk touches it.**
2. **Measured**: rendered widths and chosen image widths are identical before and after —
   `218 / 255 / 108px` at 390 and `343 / 402 / 166px` at 1440, choosing `w=384 / 640 / 256` in both runs.

---

## 📊 8 · BEFORE AND AFTER

### Visible word count (rendered `innerText`, so `display:none` blocks are excluded)

| | 390px | 1440px |
|---|---|---|
| **landing, before** | 1,911 | 1,946 |
| **landing, after** | **879** | **905** |
| | **−1,032 (−54.0%)** | **−1,041 (−53.5%)** |
| **/features, after** | 993 | 1,007 |

⚠️ The two widths differ because the hero's mobile-only sub-line replaces the tagline and CTA text below
640px — a pre-existing, deliberate swap.

### Page weight transferred (cache disabled)

| | 390px | 1440px |
|---|---|---|
| **landing, before** | 606.0 KB | 605.9 KB |
| **landing, after** | **588.5 KB** | **588.6 KB** |
| | **−17.5 KB** | **−17.3 KB** |
| **/features, after** | 532.9 KB | 533.0 KB |

🔴 **The weight barely moved, and the reason is worth stating.** Deleting 1,032 visible words removed
~8 KB of HTML and 8.3 KB of image (the Gusto `sizes` fix). **The page's weight is JavaScript and fonts,
not content** — the five largest requests are unchanged by this work and are the same five on every one
of these pages:

| | |
|---|---|
| 68.6 KB | `/_next/static/chunks/7d47e10914a6c62b.js` |
| 64.1 KB | `/_next/static/chunks/eb43ae6a9fe4c828.js` |
| 57.8 KB | `/_next/static/chunks/35f643cd8d34e41b.js` |
| 38.5 KB | `/_next/static/media/113fa3cd4dc959e6-s.p.ef053868.woff2` |
| 34.4 KB | `/_next/static/media/75affa71d1e2f6a7-s.p.51cde8ff.woff2` |

⚠️ **So "the page is too long" was a reading problem, not a weight problem, and it is the reading
problem that got fixed.** If page weight is the goal, the next move is those three chunks, not more
copy — **§9, item 4**.

### Hero image widths requested

**Unchanged, because they were already correct** — see §4e. `384 / 640 / 256` at DPR 1, rising with DPR,
never 3840.

### The one image width that did change

| | before | after |
|---|---|---|
| `/gusto-logo.png` | `w=384`, 11.2 KB | **`w=96`, 2.9 KB** |

---

## 🔗 9 · THE QUESTIONS YOU ASKED

### The old table anchor id

⛔ **There was none.** The section was a bare `<section className="band">` with **no `id`** — confirmed
in `git show HEAD:app/landing/page.tsx`.

**And confirmed the other way round**, because "it has no id" is only half an answer. Every `#fragment`
in the repository was enumerated (`app`, `components`, `lib`, `scripts`, `supabase`, excluding hex
colours):

```
  13  #pricing
   …  #try
```

**Those are the only landing anchors that have ever existed.** So there is nothing to preserve and **no
id is invented here to pretend otherwise** — a never-used id with a comment implying it has history
would be worse than none. The brief's instruction was conditional (*"if it has one"*); it does not.

### Every place in the codebase that linked to the old table anchor

**None.** Every `hatchgrab.com` URL in `lib`, `app`, `supabase` and `scripts` was listed:

```
https://hatchgrab.com                https://www.hatchgrab.com/app
https://www.hatchgrab.com            https://www.hatchgrab.com/contact
https://www.hatchgrab.com/           https://www.hatchgrab.com/features   ← added by this change
https://www.hatchgrab.com/kds/${kdsToken}
https://www.hatchgrab.com/logos/hatchgrab-share-card.png
```

**Not one carries a `#` fragment.** No email template, no outreach template in code, no document and no
component ever linked to where the table was. ⛔ **No `outreach_templates` row was read, written or
deactivated**, and none needed to be.

### What the Village Foodie host does at /features

**HTTP 404, in Village Foodie's own chrome.**

```
Host: www.villagefoodie.co.uk   /features  → 404   <title>Village Foodie</title>
                                                   "This page could not be found"
Host: www.villagefoodie.co.uk   /          → 200   (the discovery map, unchanged)
Host: www.hatchgrab.com         /features  → 200
localhost (no brand in the host)/features  → 404
```

🟢 **`notFound()`, not a redirect** — on that host the page genuinely does not exist, and a 404 says so
without leaking that it exists elsewhere. Next renders its own 404 inside the Village Foodie layout.
⚠️ **Village Foodie's sitemap is unchanged** and still carries one URL.

### The parity guard result

**0 violations**, called directly; `plan-feature-order.cjs` 27/27; `whatsapp-golive-parity-harness.cjs`
37/37; full sweep 98/98. See §7.

---

## ⚠️ 10 · WHAT I COULD NOT VERIFY

1. 🔴 **The Billing page's plan cards — because there are none.** Verified by code instead, which is
   what the brief asked for: Billing renders `FEATURE_SECTIONS` as a matrix (one `FEATURE_SECTIONS.map`
   in that file, and **no** `.plan` card, no `soon-inline` badge, no "Everything in Free, plus" anywhere
   in it); the row it shows **already** read `Private events` before this task; and `git diff --quiet`
   proves the shared module is byte-untouched, so its row **order** is unchanged as instructed. **What
   Billing shows is therefore exactly what it showed this morning** — which is the outcome your answer
   asked for, but it is not the sentence the brief's STEP 4 expected, so I am stating it plainly rather
   than ticking it.
2. ⚠️ **The renamed heading on Billing, Admin and the PDF.** §4e changes a shared section title, so it
   renders on all four surfaces. I verified it on `/features` in a browser; Billing and Admin need an
   operator and an admin session respectively, and the PDF is admin-gated (item 3). **Verified by code
   instead**: all three map `section.title` straight out of the same `FEATURE_SECTIONS`, with no
   override layer between them and it.
3. ⚠️ **`/landing/features-pdf` returns 404 locally** — it is `verifyAdmin()`-gated and there is no admin
   session, as you said. **Pre-existing and unrelated**: it imports `lib/plan-features.ts` directly, which
   is untouched, so it is unaffected by construction rather than by test.
4. ⚠️ **Real-device rendering.** Everything above is headless Chromium at DPR 1 unless stated. Safari and
   a physical phone were not used.
5. ⚠️ **No visual regression baseline existed**, so "the hero looks identical" rests on the two proofs in
   §7 — an untouched diff region and identical measured geometry — not on a pixel comparison against a
   stored screenshot.

---

## 📋 11 · OPEN ITEMS FOR YOU

1. ⚠️ **Dead CSS left behind on purpose.** `.ticket-stage`, `.ticket` and the `.t-*` rules in
   `landing.css` now style nothing. Say the word and I will sweep them — it is a small, separate job
   with its own verification.
2. ⚠️ **"Features" is header-hidden below 820px, not below 640px.** That is wider than the brief's
   "on phone", and it is forced by the 640px header already being ~59px from full. If you want it
   visible at 640–819px, something else in that row has to give (the obvious candidate is shortening
   the CTA's mobile label earlier, or dropping "Log in" to an icon). **Your call, not mine.**
3. ⚠️ **The brief's two false premises are worth knowing about beyond this task**: the hero was never
   requesting 3840px images, and the plan cards were never shared with Billing. Both suggest the notes
   this change was briefed from are describing an older state of the page.
4. ⚠️ **The background sequence is now documented in the source but is still not CHECKED.** §4d's
   measurement lives in my scratch script, not in a committed harness, so the next section deletion can
   break it the same way. It is a ~20-line addition to a render harness if you want it pinned.
5. 🔴 **If page weight is the actual goal, this change was not it** — §8. The landing is ~589 KB and
   ~225 KB of that is three JavaScript chunks plus two font files, none of which this work touched.
   That is a real piece of work and I have not started it.
