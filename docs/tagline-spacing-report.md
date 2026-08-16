# The tagline reads as one thought — two `line-height` declarations, no markup change

Scope honoured: **one file edited, two declarations added.** No `next dev`, no `next build`, no
`cap sync`, no deploy, no commit, no package installed. **No markup changed. No copy changed.**

**No span of the prompt arrived garbled, and no instruction contradicted another.** ⚠️ **One point
where the brief and the reference manual could be read as disagreeing IS flagged — see C1.**

Hero and footer are reported **separately**. Every claim is marked **READ** or **INFERRED**.

> ✅ `npx tsc --noEmit` exits 0.
> 🔴 **`app/landing/page.tsx` WAS NOT TOUCHED BY THIS TASK.** Its census shows **not one codepoint
> count changed**. Every line in its diff belongs to the two earlier tasks. D1.

---

# 🔴 TWO PREMISES IN THE BRIEF ARE WRONG, AND BOTH MAKE THE JOB SMALLER

**1. They are NOT two `<p>` elements.** Both taglines are already **one `<p>` containing a `<br />`**.
So B3's *"consider making them one element"* is already done, and there are no paragraph margins
fighting anything. **The entire gap is inherited leading.**

**2. The footer cannot go on one line.** *"Less time booking. More time cooking."* is **37 characters**
against `.foot-tag`'s own **`max-width: 28ch`** — it would wrap at whatever word ran out of room,
breaking the *second* clause rather than between the two. 🔴 **C2 anticipates exactly this and
instructs the two-line-with-tighter-leading branch, which is what was done.**

**The result is that both placements needed the same one-property fix, and neither needed new markup.**

---

# PART A — READ BOTH

## A1. The hero tagline — READ, in full

**READ** — `app/landing/page.tsx:151`, the complete element:

```tsx
            <p className="hero-tag">Less time booking.<br />More time <span className="lean">cooking.</span></p>
```

**READ** — its rule, `app/landing/landing.css:122` (before):

```css
/* Tagline — muted soft-ink with ONLY the accent word (cooking!) in italic-orange (reuses .lean). */
.hg-landing .hero-tag { font-family: var(--display); font-weight: 700; font-size: clamp(1.15rem,2.2vw,1.45rem); color: var(--ink-soft); letter-spacing: -.015em; max-width: 32ch; margin-bottom: 1.8rem; }
.hg-landing .hero-tag .lean { font-style: italic; color: var(--orange); }
```

**READ** — the only other rule that touches it, `landing.css:137-140`:

```css
/* MOBILE (≤939px): centre the whole left column — title, tagline, and CTA (CTA centring is in its base rule). */
@media(max-width:939px){
  .hg-landing .hero h1 { text-align: center; }
  .hg-landing .hero-tag { text-align: center; margin-inline: auto; }
}
```

**Everything contributing vertical space between the two sentences:**

| Candidate | Present? |
|---|---|
| Two `<p>` elements with default margins | 🔴 **NO — one `<p>`** |
| `<br />` | ✅ yes — the only line break |
| `space-y-*` utility | 🔴 **NO** |
| `margin` between the lines | 🔴 **NO — impossible; they are one element** |
| **`line-height`** | 🔴 **NOT SET on the rule — INHERITED** |

**READ** — the inherited value, `landing.css:60`, on the landing root:

```css
.hg-landing {
  font-family: var(--body);
  color: var(--ink);
  background: var(--paper);
  -webkit-font-smoothing: antialiased;
  line-height: 1.55;
}
```

## A2. The footer tagline — READ, in full

**READ** — `app/landing/page.tsx:489-492`, with the comment that ships above it:

```tsx
              {/* Same slogan and same line break as the hero tagline (:148), so the two agree.
                  ⚠️ Deliberately WITHOUT the hero's `.lean` orange accent on "cooking." — the footer tag
                  is muted #8A93A6 by design and an orange word here was not asked for. */}
              <p className="foot-tag">Less time booking.<br />More time cooking.</p>
```

**READ** — its rule, `landing.css:313` (before), and the one mobile override:

```css
.hg-landing .foot-tag { color: #8A93A6; font-size: .88rem; margin-top: .5rem; max-width: 28ch; }
```
```css
@media(max-width:720px){
  .hg-landing .foot-grid { flex-direction: column; align-items: center; text-align: center; }
  .hg-landing .foot-tag { margin-inline: auto; }
```

**Same audit:** one `<p>`, one `<br />`, no `space-y`, no inter-line margin, **no `line-height` —
inherited `1.55`**. ⚠️ **It does not set `font-family` either, so it inherits `--body` (Public Sans)
where the hero uses `--display` (Archivo).** That matters for C2's measurement.

## A3. 🔴 What creates the gap, stated plainly

**IN BOTH: a single element with loose leading. NOT two paragraphs with default margins.**

The brief offers the two as alternatives and says the fix differs. **The evidence settles it:** each
tagline is one `<p>`, so there is no second element and no margin between them to collapse. The only
thing separating the sentences is **the half-leading that `line-height: 1.55` adds below line 1 and
above line 2** — inherited from `.hg-landing`, overridden by neither rule.

✅ **That is the easier of the two cases, and it is why this task changes no markup at all.**

## A4. The computed gap, with arithmetic

**Root font-size is the browser default 16px — READ, no `html { font-size }` rule exists in
`landing.css` or `globals.css`.** A unitless `line-height` multiplies the **element's own**
font-size, and the leading is split half above and half below each line, so **the gap between two
stacked lines = `(line-height − 1) × font-size`.**

**HERO** — `font-size: clamp(1.15rem, 2.2vw, 1.45rem)` = 18.40px … 23.20px:

| Viewport | `2.2vw` | clamp picks | line box @1.55 | **gap between the two lines** |
|---|---|---|---|---|
| 375px (phone) | 8.25px | **18.40px** | 28.52px | **10.12px** |
| 834px (tablet portrait) | 18.35px | **18.40px** | 28.52px | **10.12px** |
| 1024px | 22.53px | **22.53px** | 34.92px | **12.39px** |
| 1440px (desktop) | 31.68px | **23.20px** | 35.96px | **12.76px** |

**FOOTER** — `font-size: .88rem` = **14.08px**, no clamp, identical at every width:

```
  14.08px x 1.55 = 21.82px line box  ->  gap = 14.08 x 0.55 = 7.74px
```

⚠️ **INFERRED, and it is the honest caveat on all of the above:** these are the *leading* figures,
which are exact. The **visually perceived** gap also depends on the font's ascent/descent metrics
(Archivo in the hero, Public Sans in the footer), which cannot be measured without rendering. **The
leading is what changed and what is quantified; the glyph metrics are unchanged either way.**

---

# PART B — THE HERO

## B1. ✅ The line break is kept

**READ** — the `<br />` is untouched. `app/landing/page.tsx` is not in this task's diff at all (D1).

⚠️ **And B1's reasoning is confirmed by the rule itself: `max-width: 32ch`.** *"Less time booking. More
time cooking."* is 37 characters, so a single-line hero **could not fit inside 32ch either** — it would
wrap unpredictably exactly as the brief predicts. **The break is load-bearing, not decorative.**

## B2. Before and after

```css
/* BEFORE — no line-height; inherits 1.55 from .hg-landing */
.hg-landing .hero-tag { … letter-spacing: -.015em; max-width: 32ch; margin-bottom: 1.8rem; }

/* AFTER */
.hg-landing .hero-tag { … letter-spacing: -.015em; line-height: 1.2; max-width: 32ch; margin-bottom: 1.8rem; }
```

| | line-height | gap @18.40px | gap @23.20px |
|---|---|---|---|
| **Before** | 1.55 (inherited) | 10.12px | 12.76px |
| **After** | **1.2** | **3.68px** | **4.64px** |

**The gap closes by 64%.**

⚠️ **1.2 IS NOT A NEW VALUE — it is inside the file's existing display-type range**, which is why it
will not read as foreign: `h1` is **1.05**, `.hero-cta-text b` is **1.25**, `blockquote` is **1.35**.
**The tagline sits between the headline and the CTA text, and now its leading does too.**

**READ** — the reasoning is recorded at the line, not only here:

```css
/* line-height 1.2 OVERRIDES the .hg-landing body default of 1.55, and it is the whole point of this rule.
   The tagline is ONE <p> with a <br /> — two rhythmic clauses, not two paragraphs — and at 1.55 the
   0.55em of leading between them (10-13px depending on the clamp) read as two separate thoughts.
   1.2 sits between h1's 1.05 and .hero-cta-text b's 1.25, so it is the house range, not a new value.
   ⚠️ SPACING ONLY. Font size, weight, colour and the .lean italic on "cooking." are untouched. */
```

## B3. 🔴 They were already one element — nothing was consolidated

**Stated plainly, because the brief asks for a decision that turns out to be unnecessary: the hero
tagline is a SINGLE `<p>` containing a `<br />`, and always was.** There are no two elements, no two
sets of margins, and nothing to merge.

✅ **So the brief's preferred shape — *"a single element is easier to keep tight than two with margins
fighting it"* — is what already ships**, and the leading was the only thing left to fix. **Had they
been two `<p>`s, the fix would have been `margin-bottom: 0` on the first plus a leading change; it
is one declaration instead.**

## B4. How it renders at three widths — INFERRED, nothing was rendered

⚠️ **Marked INFERRED throughout. No `next dev`, no `next build`, no screenshot.**

- **Phone (375px, ≤939px branch).** The clamp floors at **18.40px** (2.2vw is only 8.25px), and
  `@media(max-width:939px)` centres the block. Two centred lines with a **3.68px** gap instead of
  10.12px. **INFERRED: this is where the change is most visible** — the clamp is at its minimum, so
  the type is smallest while the old gap was proportionally largest against it.
- **Tablet (834px).** Still the ≤939px branch and still the clamp floor — 2.2vw reaches only 18.35px,
  a hair under the 18.40px minimum. **Identical to phone: centred, 3.68px.** ⚠️ **A portrait iPad
  therefore renders the mobile treatment, not a middle one** — that is pre-existing behaviour, not
  something this change introduces.
- **Desktop (1440px).** Left-aligned in the hero grid, clamp at its **23.20px** ceiling, gap **4.64px**
  instead of 12.76px. **INFERRED: the two clauses now sit close enough to scan as one unit while the
  `.lean` italic orange on "cooking." still lands as the accent.**

⚠️ **One thing that is NOT inferred and is worth stating: nothing below the tagline moves.**
`margin-bottom: 1.8rem` is unchanged, so the CTA row keeps its exact offset from the tagline's last
line. **Only the space *inside* the paragraph closes; the space *around* it is untouched.**

## B5. ✅ Font size, weight, colour and the italic are untouched

**READ** — the diff line, with only `line-height: 1.2;` inserted:

```diff
-.hg-landing .hero-tag { font-family: var(--display); font-weight: 700; font-size: clamp(1.15rem,2.2vw,1.45rem); color: var(--ink-soft); letter-spacing: -.015em; max-width: 32ch; margin-bottom: 1.8rem; }
+.hg-landing .hero-tag { font-family: var(--display); font-weight: 700; font-size: clamp(1.15rem,2.2vw,1.45rem); color: var(--ink-soft); letter-spacing: -.015em; line-height: 1.2; max-width: 32ch; margin-bottom: 1.8rem; }
```

✅ `font-weight: 700` · `font-size: clamp(…)` · `color: var(--ink-soft)` · `letter-spacing: -.015em` ·
`max-width: 32ch` · `margin-bottom: 1.8rem` — **all identical.** ✅ **And
`.hg-landing .hero-tag .lean { font-style: italic; color: var(--orange); }` is not in the diff**, so
the italic orange on "cooking." is exactly as it was.

---

# PART C — THE FOOTER

## C1. 🔴 It would wrap, so it STAYS TWO LINES — C2's own branch

**The single-line form was measured against the container before being written, and it does not fit.**

**READ** — the constraint is on the tagline's own rule, so it applies at **every** viewport width:

```css
.hg-landing .foot-tag { color: #8A93A6; font-size: .88rem; margin-top: .5rem; max-width: 28ch; }
```

**The arithmetic:**

```
  single-line string: "Less time booking. More time cooking."  =  37 characters (5 spaces, 32 non-space)
  the cap:            max-width: 28ch

  ch = the advance width of "0" in the element's font (Public Sans, inherited via --body) ~ 0.60em
      -> 28ch  ~  16.80em

  the string, at typical Public Sans advances (~0.52em lowercase, ~0.26em space):
      32 x 0.52em  +  5 x 0.26em  =  16.64 + 1.30  =  17.94em
```

🔴 **17.94em against a 16.80em cap — it overflows by roughly 7% and wraps.** ⚠️ **INFERRED, and the
margin is narrow enough to say so: this is computed from typical grotesque advance widths, not from
the actual Public Sans metrics, so the true figure could be a few percent either side of the cap.**

**But the direction of the uncertainty is what decides it.** If it fits, one line. If it does not, it
wraps **at whatever word runs out of room** — and with 28ch of room the break lands inside *"More time
cooking."*, splitting the **second clause** rather than falling between the two. 🔴 **That is precisely
the outcome C2 calls worse than two clean lines**, and it is the outcome a marginal miss produces.

✅ **So the footer keeps two lines and gets the same leading fix as the hero**, exactly as C2
instructs for this case. **The words are not changed.**

⚠️ **AND THE ALTERNATIVE WAS REJECTED FOR A SECOND, INDEPENDENT REASON.** The one-line form could be
forced by raising `max-width` — but that is changing the footer's layout, which **C3 forbids**.

⚠️ **A NOTE ON THE MANUAL, FLAGGED RATHER THAN QUIETLY RESOLVED.** §38 records the tagline as
deliberately identical in both slots: *"hero subhead and footer carry it identically, because two
near-identical versions differing by one word is the weakest option: anyone who notices wonders which
is the error."* 🔴 **A one-line footer would have put the two slots visibly out of step.** I do not
read that as a contradiction — the manual's objection is to differing **wording**, and Part C changes
no words — but it is recorded here because it points the same way as the measurement, and because the
two-line outcome keeps §38 true without needing an amendment.

## C2. Before and after

```css
/* BEFORE — no line-height; inherits 1.55 */
.hg-landing .foot-tag { color: #8A93A6; font-size: .88rem; margin-top: .5rem; max-width: 28ch; }

/* AFTER */
.hg-landing .foot-tag { color: #8A93A6; font-size: .88rem; line-height: 1.25; margin-top: .5rem; max-width: 28ch; }
```

| | line-height | gap @14.08px |
|---|---|---|
| **Before** | 1.55 (inherited) | 7.74px |
| **After** | **1.25** | **3.52px** |

**The gap closes by 55%.**

⚠️ **1.25, NOT the hero's 1.2, AND THE DIFFERENCE IS DELIBERATE.** This is 14.08px body text where the
hero is 18–23px display type, and smaller type wants marginally more relative leading to stay legible.
**1.25 is also an existing value in this file** — `.th-sub` and `.hero-cta-text b` both use it. ✅ **In
absolute terms the two now sit within 0.2px of each other (3.52px vs 3.68px at the hero's floor), so
they read as the same treatment despite the different multipliers.**

**READ** — recorded at the line:

```css
/* Same tightening as .hero-tag, and it STAYS TWO LINES ON PURPOSE. Setting it as one sentence —
   "Less time booking. More time cooking." — is 37 characters against this rule's own max-width: 28ch,
   so it would wrap at whatever word ran out of room and break the SECOND clause rather than between
   the two. A strapline split at a random word is worse than two clean lines, so the fix here is the
   leading, not the line count. …
   ⚠️ SPACING ONLY. Colour, size and max-width are unchanged, and no other footer content is touched. */
```

## C3. ✅ No other footer content, link or layout changed

**READ** — the footer hunk in the diff touches **one line plus a comment**. Everything around it is
context:

```
 .hg-landing .foot-grid { display: flex; flex-wrap: wrap; gap: 1.5rem; justify-content: space-between; align-items: flex-start; }
-.hg-landing .foot-tag { color: #8A93A6; font-size: .88rem; margin-top: .5rem; max-width: 28ch; }
+.hg-landing .foot-tag { color: #8A93A6; font-size: .88rem; line-height: 1.25; margin-top: .5rem; max-width: 28ch; }
 .hg-landing .foot-links { display: flex; flex-wrap: wrap; gap: 1.4rem; }
 .hg-landing .foot-links a { color: #C3CAD8; text-decoration: none; font-size: .9rem; }
 .hg-landing .foot-links a:hover { color: #fff; }
```

✅ `.foot-grid`, `.foot-links`, `.foot-links a`, `.foot-base`, `.foot-logo`, the wordmark rule and the
`@media(max-width:720px)` centring block are **all outside the diff**. ✅ **`margin-top: .5rem` is
unchanged**, so the tagline's distance from the wordmark above it is identical.

---

# PART D — BOUNDARIES

## D1. `git diff --stat`, broken out line by line

```
 app/landing/landing.css | 16 ++++++++++++++--
 app/landing/page.tsx    |  6 +++++-
 2 files changed, 19 insertions(+), 3 deletions(-)
```

🔴 **ONLY `landing.css` IS THIS TASK. `page.tsx`'s six lines are entirely the two earlier tasks.**
**READ** — searching this task's subject matter in that file's diff:

```
$ git diff -- app/landing/page.tsx | grep -c "line-height\|hero-tag\|foot-tag"
0
```

**And its census confirms it independently: `count changes: NONE` — not one codepoint moved** (E2).

**Every added line in `landing.css`, attributed:**

| Line | Belongs to |
|---|---|
| `/* line-height 1.2 OVERRIDES the .hg-landing body default of 1.55, …` (5 comment lines) | **THIS TASK** |
| `.hg-landing .hero-tag { … line-height: 1.2; … }` (1 replaced line) | **THIS TASK** |
| `/* Same tightening as .hero-tag, and it STAYS TWO LINES ON PURPOSE. …` (7 comment lines) | **THIS TASK** |
| `.hg-landing .foot-tag { … line-height: 1.25; … }` (1 replaced line) | **THIS TASK** |

**Every added line in `page.tsx`, attributed:**

| Line | Belongs to |
|---|---|
| `{/* ⚠️ HAND-WRITTEN, NOT RENDERED FROM FEATURE_SECTIONS. …` (3 comment lines) | iPhone task |
| `<li>iPhone, iPad and Android kitchen app</li>` | iPhone task |
| `<li>Digital loyalty stamp cards <span className="soon-inline">Coming soon</span></li>` | loyalty task |

🔴 **THIS TASK'S FUNCTIONAL CHANGE IS TWO DECLARATIONS: `line-height: 1.2` and `line-height: 1.25`.**
Everything else it added is comment.

## D2. ✅ No other copy, component or route changed

**READ** — the tagline strings are byte-identical in both places:

```tsx
app/landing/page.tsx:151   <p className="hero-tag">Less time booking.<br />More time <span className="lean">cooking.</span></p>
app/landing/page.tsx:492   <p className="foot-tag">Less time booking.<br />More time cooking.</p>
```

**No word, no full stop, no `<br />`, no class name and no element changed.** ✅ No component, no route,
no gate, no feature key, no migration, no native config — `git status` shows **no new modified file**
beyond `landing.css` (E6).

## D3. What a visitor sees differently

**Hero:** the two clauses close from about 10–13px apart to about 4px, so *"Less time booking. / More
time cooking."* reads as one two-line thought under the headline rather than two stacked statements —
and nothing around it moves, because only the space **inside** the paragraph changed.

**Footer:** the same tightening at smaller scale, from about 8px to about 3.5px, so the muted strapline
under the wordmark reads as a single unit — **still two lines**, because one line would have wrapped
mid-clause against the tagline's own 28ch cap.

---

# PART E — INTEGRITY

## E1. Non-ASCII census BEFORE

```
app/landing/landing.css   11 classes  31,072 bytes
    U+2500:146 U+2014:35 U+2192:10 U+26A0:4 U+FE0F:4 U+2265:4 U+2264:3 U+2605:2 U+2026:1 U+00A3:1 U+1F534:1

app/landing/page.tsx      19 classes  35,294 bytes   (read for context; NOT edited)
    U+2500:93 U+2014:56 U+2019:22 U+2192:12 U+26A0:12 U+FE0F:12 U+00A3:11 U+1F534:6 U+00D7:6
    U+201C:3 U+2713:2 U+2248:2 U+201D:2 U+2605:2 U+2728:2 U+2265:1 U+2026:1 U+00B7:1 U+00A9:1
```

⚠️ **The brief's warning is exactly right about where the risk was: the tagline carries a full stop
and `page.tsx` already holds U+2019 ×22, so a curly apostrophe swapped into a copy edit there would be
invisible in review.** ✅ **It could not happen here — the copy was never touched.**

## E2. Census AFTER — every difference explained

| File | Classes | Gained | Lost | Counts changed |
|---|---|---|---|---|
| `app/landing/landing.css` | **11 → 11** | **none** | **none** | 3, all pre-existing glyphs |
| `app/landing/page.tsx` | **19 → 19** | **none** | **none** | 🔴 **NONE — untouched** |

**The three that moved in `landing.css`, and why:**

```
  U+2014 EM DASH               35 -> 39   +4  em dashes in the two new comment blocks
  U+26A0 WARNING SIGN           4 ->  6   +2  one "SPACING ONLY" note per rule
  U+FE0F VARIATION SELECTOR    4 ->  6   +2  tracks U+26A0 exactly
```

✅ **Both glyphs were already in the file** (4 of each), so no class was introduced. ✅ **No typographic
apostrophe, no en dash, no curly quote** — the only non-ASCII characters added are 4 em dashes and 2
paired warning signs, and the CSS values themselves (`1.2`, `1.25`) are pure ASCII.

## E3. 🔴 Carrier-aware variation-selector check

| File | U+2705 | U+1F534 | U+2500 | U+26A0 n / paired / **bare** | sum = FE0F? |
|---|---|---|---|---|---|
| `app/landing/landing.css` | absent | 1, none paired | 146, none paired | **6 / 6 / 0** | ✅ 6 = 6 |
| `app/landing/page.tsx` | absent | 6, none paired | 93, none paired | **12 / 12 / 0** | ✅ 12 = 12 |

✅ **AND THE DELTA AGAINST EACH FILE'S OWN HISTORY IS ZERO**, measured against `git show HEAD:`:

```
  app/landing/landing.css   bare warnings HEAD=0 -> now=0  (delta +0)
  app/landing/page.tsx      bare warnings HEAD=0 -> now=0  (delta +0)
```

⚠️ **U+1F534 and U+2500 take no selector** — reporting them as unpaired would be the false positive
this method exists to prevent.

## E4. Byte scan of every edited file

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  app/landing/landing.css          32338 bytes offending=0 CR=0
  app/landing/page.tsx             35294 bytes offending=0 CR=0   (control — not edited)
```

✅ **Zero offending bytes, zero CR.**

## E5. Byte scan of this report

Separate pass, run after writing: **25,659 bytes, offending = 0** — no NUL, no control byte below
0x09, no CRLF, no lone CR. Its own carrier-aware check:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 22 | 0 | 22 |
| U+1F534 LARGE RED CIRCLE | 18 | 0 | 18 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 0 | 0 | 0 |
| U+26A0 WARNING SIGN | 19 | 19 | **0** |

**Every warning sign is paired; ZERO are bare.** **Sum of per-base paired = the total U+FE0F count** - no orphan, no double-count.

## E6. `git status` and `git diff --stat`

```
M app/api/orders/submit/route.ts
 M app/api/webhooks/instagram/route.ts
 M app/api/webhooks/messenger/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/landing/landing.css
 M app/landing/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/native/OperatorDeviceConfig.tsx
 M docs/device-naming-report.md
 M docs/reference-manual.md
 M lib/plan-features.ts
?? components/shared/EventCancelModal.tsx
?? docs/android-audit-report.md
?? docs/android-back-handler-report.md
?? docs/android-parity-report.md
?? docs/event-cancel-holds-report.md
?? docs/event-cancel-refunds-report.md
?? docs/fcm-sender-report.md
?? docs/loyalty-pricing-report.md
?? docs/overlay-audit-report.md
?? docs/overlay-fixes-report.md
?? docs/tagline-spacing-report.md
?? docs/whatsapp-onboarding-report.md
?? docs/whatsapp-routing-report.md
?? docs/whatsapp-signature-report.md
?? lib/fcm.ts
?? lib/meta/
?? lib/native/backHandler.ts
?? supabase/migrations/20260816_trucks_phone_number_id.sql
```

```
app/api/orders/submit/route.ts             |  66 ++-
 app/api/webhooks/instagram/route.ts        |  48 +-
 app/api/webhooks/messenger/route.ts        |  48 +-
 app/api/webhooks/meta/whatsapp/route.ts    | 173 ++++++-
 app/dashboard/[token]/kds/page.tsx         |  70 ++-
 app/dashboard/[token]/page.tsx             | 117 ++++-
 app/landing/landing.css                    |  16 +-
 app/landing/page.tsx                       |   6 +-
 app/manage/[token]/page.tsx                |  75 +--
 components/dashboard/AddOrderPanel.tsx     |  22 +
 components/native/OperatorDeviceConfig.tsx |  13 +-
 docs/device-naming-report.md               | 765 ++++++++++++++++-------------
 docs/reference-manual.md                   | 519 ++++++++++++++++++-
 lib/plan-features.ts                       |  16 +-
 14 files changed, 1487 insertions(+), 467 deletions(-)
```

🔴 **THIS TASK'S ENTRIES ARE TWO:** `app/landing/landing.css` (newly modified — it was **not** in the
diff before this task) and `docs/tagline-spacing-report.md` (new, untracked).

⚠️ **`app/landing/page.tsx` appears as modified and is NOT this task's** — its six lines are the iPhone
wording and the loyalty bullet, itemised in D1. **Everything else — `lib/plan-features.ts`,
`components/native/OperatorDeviceConfig.tsx`, `app/api/orders/submit/route.ts`, the three Meta webhook
routes, the two dashboard pages, `app/manage/[token]/page.tsx`,
`components/dashboard/AddOrderPanel.tsx`, `docs/reference-manual.md`, and the untracked `lib/fcm.ts`,
`lib/meta/`, `lib/native/backHandler.ts`, `components/shared/EventCancelModal.tsx`, the `20260816`
migration and the eleven other reports — is prior turns' work, uncommitted as instructed and untouched
here.**
