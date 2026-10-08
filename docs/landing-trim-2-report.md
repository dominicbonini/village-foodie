# LANDING TRIM, ROUND 2 — THE SOCIAL POSTS TILE, THE PRO CARD, THE BUTTON, AND /features' TAIL

**6 October 2026 · branch `main`, local only. Nothing pushed, nothing deployed, no production request,
no database write, no truck touched, no outreach row read or edited, and the menu-upload demo flow was
not run.**

Round 1 is `docs/landing-trim-report.md` and was **not** overwritten.

---

## ⚠️ 0 · ONE THING TO READ FIRST: `lib/plan-features.ts` IS CHANGED, AND NOT BY THIS ROUND

Round 2 says *"Do NOT change lib/plan-features.ts, lib/landing-table.ts or lib/features.ts in this
round."* **Two of the three are untouched. The third is not, and the change is not round 2's.**

Immediately before this brief arrived you gave two separate instructions, mid-turn:

1. *"in features table, rename 'ONLINE SALES & AUTOMATION' to PRO TIER"*
2. *"also make social media posts as live in the feature list and put it after private events"*

Both land in `lib/plan-features.ts`. The second one I stopped and asked about, because it could not be
done as asked without a decision — §1. **I read round 2's rule as scoping round 2, not as retracting
work you had just authorised**, especially since round 2's own Pro card list includes "Social media
posts" as a live bullet, which only makes sense alongside it. 🔴 **If that reading is wrong, say so and
I will revert both** — they are two self-contained edits.

**Round 2 itself changed none of the three.**

---

## 🔴 1 · THE CARRIED-OVER WORK, AND THE DECISION INSIDE IT

### 1a · "Online sales & automation" → "Pro tier"

The three section headings are now **Core operations · Pro tier · Max tier**. The old title named the
KIND of feature while the one below it named the PLAN, so the table changed the question it was
answering halfway down.

⛔ **Accurate, not just tidier**: every row in that section is `pro: true` or `coming_soon`, none is
`starter: true`. ⚠️ **Sentence case, like 'Max tier'** — the capitals are the stylesheet's
(`text-transform: uppercase`), so a string typed in capitals would be shouting stored in the data.
🔴 **One source, four surfaces**: it renders on /features, Billing, Admin and the plans PDF.

### 1b · "Social media posts" → live, after "Private events" — **and what you chose**

I put the problem to you before touching it, because flipping the cells is not a copy edit:

| | |
|---|---|
| `canAccess(p, 'places_posts_preview')` | **false** for starter, pro, max, trial, tester **and** demo |
| how it is held | `trucks.feature_overrides` only — granted today to **one truck**, test-kitchen ("Pizza Kitchen") |
| the related `schedule_graphics` | **Max only**; false for Pro |
| the row's own comment | *"THE DAY IT SHIPS it needs a `Feature` key, a `ROW_FEATURE_MAP` entry AND `true` cells — all three, or the row goes from honestly unbuilt to an unchecked promise."* |

**You chose: "Tick it, change no gate."** So the row is `starter: false, pro: true, max: true`, moved to
directly after 'Private events', **with no `ROW_FEATURE_MAP` entry**.

🔴 **THE MISSING MAP ENTRY IS LOAD-BEARING AND LOOKS LIKE A BUG.** `findPlanParityViolations()`
`continue`s past a row it has no key for, so the `true` cells are never checked against `canAccess`.
**Adding the obvious entry would make the guard throw at module load** and take out the landing,
/features, Billing and Admin in dev. ⛔ **So its absence is the only reason this builds**, and that is
now written beside the row in ~20 lines naming you, the date, the alternatives, and the instruction
*"DO NOT 'fix' this by adding the map entry alone."*

⚠️ **What this means in plain terms**: `/features`, Billing, Admin and the plans PDF now show a tick for
a feature **no plan grants**. That is your call and it is recorded as one. The two ways to make it
honest are in the source comment and in §8.

### 1c · And a harness was passing falsely — caught while re-aiming it

`scripts/plan-feature-order.cjs` asserts *"`app/landing/page.tsx` renders FEATURE_SECTIONS from the
shared module"*. **Round 1 moved that table to /features; the landing has not rendered a row since —
and the check went on passing**, because round 1's tombstone comment in the landing page names both
`@/lib/plan-features` and `FEATURE_SECTIONS`, and the check read raw source.

🔴 **Ninth time in this build that a comment has decided a claim about code, and the first to survive a
full green sweep.** Fixed three ways: comments stripped with `codeOf()`; the entry re-aimed at
`components/landing/FeatureComparison.tsx`, which actually renders it; and the claim strengthened from
"the name appears" to `FEATURE_SECTIONS.(map|flatMap)(` — *iteration*, not mention.

⚠️ **The first version of that stronger regex then failed on Admin**, which uses `.flatMap`. The check
was wrong, not the page.

A new assertion now pins the absence too: **the landing must NOT render the table, and must still
import the module** — because that import is what fires the parity guard on the landing route.

`plan-feature-order.cjs`: **29/29**. `findPlanParityViolations()`: **0**.

---

## 📁 2 · FILES CHANGED

### Round 2 proper

| File | |
|---|---|
| `app/landing/page.tsx` | the tile, the Pro card, the Starter split, the button |
| `app/landing/landing.css` | `.feat-cta` added; `.features-back` and `.li-note` deleted |
| `app/features/page.tsx` | the back-link section removed |

**Added:** `docs/landing-trim-2-shots/` — six screenshots, §7.

### Carried over from the two instructions before this brief (§1)

| File | |
|---|---|
| `lib/plan-features.ts` | the section rename, and the Social media posts row |
| `scripts/plan-feature-order.cjs` | its pins re-aimed, plus the false-pass fix |
| `docs/reference-manual.md` | one sentence that the rename falsified |

**Unchanged, confirmed with `git diff --quiet`:** `lib/landing-table.ts`, `lib/features.ts`.

---

## 🔴 3 · THE TILE — VERSION A, AND THE PROOF

**Replaced:** *"Never type your schedule twice"* → **"Your social media posts, made for you"**, same
position, same `does-item` markup and styling. The other five are untouched and there are still six.

> Upload the design you already post on Facebook or Instagram. Every week we fill in your dates, places
> and times, ready to share.

### ⚠️ 3a · The copy was settled in three steps, and this is the last

| | |
|---|---|
| 1 | the brief's **version A**, chosen on the evidence below — *"…from Canva or anywhere else … **and write the caption**, ready to post on Facebook or Instagram."* |
| 2 | your first replacement — *"Upload the design you already post on Facebook or Instagram, from Canva or anywhere else. Every week we fill in your dates, places and times"* |
| 3 | **what shipped** — *"Upload the design you already post on Facebook or Instagram. Every week we fill in your dates, places and times, ready to share."* |

🔴 **And the heading changed with it**: "weekly post" → **"social media posts"**, which is both the
wider word and the right number — the feature makes a post for a single event as well as for the week.
⚠️ The plural was a fourth, separate correction, after the body had settled.

⚠️ **Asserted as an absence as well as a match**: the page is checked to contain no fragment of either
superseded draft (`Canva`, `write the caption`, `ready to post on Facebook`). A leftover phrase from an
earlier version is exactly what a copy change leaves behind.

### Why version A was the right pick of the two — and why it no longer matters

The brief made the choice a question about the code: use A **only if** Social posts actually generates
post text or a caption. **It does.**

| | |
|---|---|
| `lib/weekly-post/caption.ts:134` | **`weekCaption()`** — *"The caption for the image."* Builds the week's caption from `WeekData` |
| `lib/weekly-post/caption.ts:89` | **`eventPostText()`** — the per-event post text, with the ordering link |
| `app/api/weekly-post/route.ts` | the **`captions`** action returns `{ caption, perEvent }`, called alongside the render |
| `components/manage/WeeklyPost.tsx` | renders it into an **editable "Caption for your page"** panel with its own Copy button |

⚠️ **It is generated, not a template with a slot**: the module's header records that the per-event
wording is computed **at copy time**, so "tonight" / "tomorrow" / "on Tue 13 Oct" is right for the
moment the operator copies it rather than for the moment the image was made.

⛔ **YOUR FINAL BODY MAKES NO CAPTION CLAIM AT ALL**, so the A/B question is moot and the line is now
**under-claiming rather than over-claiming**. The caption generator is real and this copy does not sell
it — which is a choice, not a gap, and is recorded here so nobody "corrects" the tile back later.

⚠️ **The schedule-import claim the old tile carried is not lost** — it is still made on this page, in
the "Getting going" steps (*"Got it on your website? We'll read it from there"*).

---

## 🔴 4 · THE PRO CARD, AS RENDERED

Read out of the DOM at both widths, asserted as a **whole-list equality**:

```
 1  Everything in Free, plus
 2  Offline order protection
 3  Take payment online
 4  Pre-orders & collection times
 5  Smart slot management
 6  Auto-accept orders
 7  Private events
 8  Social media posts
 9  WhatsApp auto-replies (Messenger & Instagram coming soon)
10  Take payment on your phone          [COMING SOON badge]
```

| | |
|---|---|
| **"Messenger & Instagram auto-replies"** | **gone entirely.** It carried the COMING SOON badge directly under the live WhatsApp line, so the card read as half-finished for a channel nobody buys the plan for |
| **The parenthetical** | **plain bullet text, same size and format as the rest of the line** |
| **"Social media posts"** | a normal live bullet, no badge |
| **"Take payment on your phone"** | keeps its existing badge |
| **Starter** | changed — §5. **Max**: untouched |

### ⚠️ 4a · The parenthetical changed twice, and the second one is yours

The brief asked for *"plain, smaller, muted text … using an existing muted/secondary text style"*. I
built that as `.li-note` — `.68rem` in `--ink-faint`, the same token `.cred-scope` and the footer use.

**You then said:** *"'(Messenger & Instagram coming soon)' needs to be same size and format as
'WhatsApp auto-replies'."* 🔴 **That overrides the brief and is what shipped.** There is now **no span
at all** — the parenthetical is part of the line's own text run, so there is no second style to keep in
step. ⛔ **`.li-note` was deleted from landing.css in the same edit** rather than left styling nothing.

**Asserted as uniformity, which is stronger than matching two numbers:** the bullet has **zero child
elements**, so nothing on it *can* differ in size or colour; `.li-note` appears **nowhere on the page**;
and the line measures **14.72px / `rgb(95,122,153)`** — identical to the "Private events" bullet beside
it, compared against a sibling rather than a number typed into the check.

⚠️ **It is still not the badge**, which was the original point: WhatsApp itself is live, so
`.soon-inline` would have labelled the live half of the sentence "coming soon".

⚠️ **The `WHATSAPP_LIVE` flag still decides.** With it off there is nothing live to separate, so that
branch keeps the single welded badge line it has always had, verbatim.

---

## 🔴 5 · THE STARTER CARD — ONE BULLET BECAME TWO

**You asked mid-round:** *"in the starter card, QR code and Discovery map listing should be separate
bullets."* The brief had said Starter was unchanged; the newer instruction wins.

```
Everything to run a service
Walk-up orders & kitchen screen
Online ordering, pay at the hatch
Menu, meal deals & upsells
QR code                      ← was "QR code & discovery map listing"
Discovery map listing        ← …one welded line for two features
iPhone, iPad and Android kitchen app
```

🟢 **Each half is now byte-identical to its row's `name`** in `lib/plan-features.ts` — `'QR code'`
(`qr_menu`) and `'Discovery map listing'` (`discovery_map`) — which is the rule the Max card's bullets
already follow, so the card and the /features table say the same words for the same thing.

⚠️ **Nothing checks these bullets against the matrix.** They are hand-written literals; the match is
deliberate, not automatic. **Asserted as the absence of the welded string AND as two adjacent bullets
in order**, because either half alone would satisfy a contains-check on the old line's words.

---

## 🔴 6 · THE BUTTON, AND /features' TAIL

### "See every feature →"

Was a text link reading *"See every feature, plan by plan →"*. It is now a **centred outlined button**,
same position (after the plan cards, before the switching block), still → `/features`.

⛔ **`btn btn-ghost` — the exact class the white Starter and Max "Try Free" buttons wear.** No new
style, and **not** `btn-primary`: every orange control on this page opens the demo modal, so an orange
button here would compete with the three in the cards directly above it for a different action.

🔴 **WHITE FILL, ADDED ON REQUEST.** `.btn-ghost` is transparent, which read as a hole now that the
pricing section is a wash `.band` (round 1 §4d). ⚠️ **`--paper` — the same fill the plan cards above it
use**, so it reads as another white object on the tint rather than as a new colour entering the page.
⛔ **Scoped to `.feat-cta .btn`, NOT changed on `.btn-ghost` itself**: the Try Free buttons share that
class and sit inside white cards, so filling the class globally would look identical there today and
would be a change waiting to surprise whoever next puts a ghost button on a tinted background.
🟢 **It is still the outlined style** — border, text colour, padding and radius all still come from
`.btn` + `.btn-ghost`; the rule adds a fill and nothing else.

**Measured, not asserted from class names:** border `rgb(221,229,238)` — **the same outline as the Try
Free buttons**; background `rgb(255,255,255)`; **not** the orange primary, which measures
`rgb(239,139,44)` beside it; centred to within 1px; and
**185px wide against a 350px row at 390px and a 1060px row at 1440px**, so it is sized to its label at
both widths rather than stretching. ⚠️ The CSS rule is one line that only centres — `.btn` is
`inline-flex` and sizes itself; a `width` there is what would have made it full-width on a phone.

### /features

**The "See prices and plans →" link and its whole `<section>` are gone.** 🔴 **The section, not just the
`<p>`**: every bare `<section>` in landing.css carries `padding: clamp(3.5rem,7vw,5.5rem) 0`, so an
emptied one would have left ~5.5rem of white above the footer — a worse artefact than the link was.

**Measured:** exactly **one `<section>`** left (the table's), footnotes **1–5** still render, and the
**gap between the band's bottom edge and the footer's top is 0px** at both widths. The band's own
padding below the last footnote is **57px at 390 / 89px at 1440** — breathing room, not a void.

⚠️ **The way back is still there**: the nav's "Pricing" resolves to `/landing#pricing` on this route via
the existing `landingHref` prop, and the footer carries one too. ⛔ `.features-back` was deleted from
landing.css in the same edit.

---

## ✅ 7 · CHECKS

Chromium at DPR 2 against `next build` + `next start`, host faked with
`--host-resolver-rules=MAP local.hatchgrab.com 127.0.0.1` as in round 1.

| | |
|---|---|
| **browser assertions** | **56 · all passing** at 390px and 1440px |
| `npx tsc --noEmit` | **clean** |
| `npx eslint` on the touched files | **0 errors, 0 warnings** |
| `npx next build` | **✓ Compiled successfully** |
| `findPlanParityViolations()` | **0**, called directly against the compiled module |
| `scripts/plan-feature-order.cjs` | **29/29** |
| `node scripts/run-harnesses.cjs` | **98 run · 98 passed · 0 failed** |
| the landing still imports `@/lib/plan-features` | **yes** — asserted in the harness, so the guard keeps firing on that route |
| `lib/landing-table.ts`, `lib/features.ts` | **unchanged** (`git diff --quiet`) |

**Also measured at both widths:** no horizontal page scroll on either page; the button sits after the
plan cards and before the switching block; the old tile is absent and there are still six.

### Two assertions that failed on correct code, and were my error

1. ⚠️ **`borderStyle` is `solid` on an element with no border.** Tailwind's preflight sets
   `*, ::before, ::after { border-width: 0; border-style: solid }`, so a style check reads "solid" on
   something that paints nothing. **`borderTopWidth` is what decides it** — and the badge beside it is
   now measured in the same breath, so "no border" is a comparison (`0px` vs the badge's `1px`) rather
   than a number.
2. ⚠️ **`document` is not in scope in Node.** A "not the orange primary" assertion was written with a
   `document.querySelectorAll` call outside `page.evaluate` and threw `ReferenceError`. The primary's
   colour is read inside the page and compared out here as a plain value.
3. ⚠️ **A clipped screenshot below the fold threw** *"clipped area is either empty or outside the
   resulting image"*: without `fullPage: true` the clip is taken against the **viewport**, and both
   blocks are well below the fold. The clip's y is a document coordinate.

---

## 📸 8 · SCREENSHOTS

| Path | |
|---|---|
| `docs/landing-trim-2-shots/landing-what-it-does-390.png` | the six tiles, phone |
| `docs/landing-trim-2-shots/landing-what-it-does-1440.png` | the six tiles, laptop |
| `docs/landing-trim-2-shots/landing-plans-and-button-390.png` | the three cards + the button, phone |
| `docs/landing-trim-2-shots/landing-plans-and-button-1440.png` | the three cards + the button, laptop |
| `docs/landing-trim-2-shots/features-bottom-390.png` | footnotes → footer, phone |
| `docs/landing-trim-2-shots/features-bottom-1440.png` | footnotes → footer, laptop |

All six at **device pixel ratio 2**. The two card shots are clipped to the plans grid through the
button; the two `/features` shots are taken scrolled to the bottom of the document.

---

## ⚠️ 9 · WHAT I COULD NOT VERIFY

1. 🔴 **That the Social media posts tick is one you want on a public page.** I verified the mechanism,
   not the promise: `canAccess` grants `places_posts_preview` to **no plan**, so the tick on /features,
   Billing, Admin and the PDF is a claim the gate does not back. §1b records your instruction; the two
   ways to make it true are in the source and below.
2. ⚠️ **Billing, Admin and the plans PDF** — the renamed heading and the new tick render there too.
   Verified by code (all three iterate the same `FEATURE_SECTIONS` with no override layer) rather than
   in a browser: Billing needs an operator session, Admin an admin session, and the PDF route is
   `verifyAdmin()`-gated and 404s locally.
3. ⚠️ **Real devices and Safari.** Everything here is headless Chromium.
4. ⚠️ **No visual-regression baseline exists**, so "the other five tiles are unchanged" rests on the
   diff touching one `does-item` and on the tile count, not on a pixel comparison.

---

## 📋 10 · OPEN ITEMS

1. 🔴 **Decide what backs the Social media posts tick.** Either add `places_posts_preview` to
   `PRO_FEATURES` and `MAX_FEATURES` **and** add the `ROW_FEATURE_MAP` entry — the table then matches
   the gate and the guard checks it — or add it to `MAX_FEATURES` only, matching `schedule_graphics`,
   and move the row into 'Max tier' with `pro: false`. ⛔ **Adding the map entry on its own is a build
   break, not a tidy-up**, and the source says so.
2. ⚠️ **If my reading in §0 is wrong**, say so — the rename and the row flip are two self-contained
   edits and I will revert either or both.
3. ⚠️ **Round 1's open items still stand**, including the dead `.ticket*` CSS and the fact that the
   landing's white/wash band sequence is documented in the source but not pinned by any harness.
