# Website-embed — Stage 2c: two corrections

**WHICH OF THE THREE I DID: A TYPECHECK AND TEN EXECUTIONS. No standalone parse — `tsc --noEmit`
subsumes it.** `npx tsc --noEmit` exits 0. All ten harnesses pass, including the single-source and
plain-English checkers re-run over the changed copy.

🔴 **Nothing was deployed and no migration was run. No schema change was needed and none was made** —
the three existing migration files are untouched and still unapplied.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

**Scope: two files.** `lib/embed-instructions.ts` and `components/dashboard/EmbedWizard.tsx`. By
mtime, nothing else in the tree moved — `app/api/manage/route.ts` (22:38), `components/dashboard/types.ts`
(22:39), the migration (22:35), `app/embed/[slug]/page.tsx` (22:03) and `components/TruckListCard.tsx`
(21:47) all predate this stage, which began at 22:47.

---

## 1. ALL FOUR PLATFORMS SHIP `orderButtonWorks: null`

```
  🔴 no platform record claims the order button works
     [["squarespace",null],["wix",null],["wordpress",null],["shopify",null],["other",null],["someone-else",null]]
```

WordPress and Shopify shipped `true` on the reasoning that their blocks place content directly on the
page. **You are right that this is an inference about markup rather than an observation of the button,
and that it is the same standard that correctly held Squarespace at `null`.** Applying one standard to
one platform and a looser one to two others is how a guess becomes a promise — the comment in the
record now says exactly that, so the next reader cannot re-derive the looser version.

**Proven per platform, with a second assertion that goes beyond the tri-state:**

```
  PASS  Wix              orderButtonWorks=null  → says we are still confirming
  PASS     …and makes NO claim that it works
  PASS  Squarespace      orderButtonWorks=null  → says we are still confirming
  PASS     …and makes NO claim that it works
  PASS  WordPress        orderButtonWorks=null  → says we are still confirming
  PASS     …and makes NO claim that it works
  PASS  Shopify          orderButtonWorks=null  → says we are still confirming
  PASS     …and makes NO claim that it works
  PASS  Something else   orderButtonWorks=null  → says we are still confirming
  PASS     …and makes NO claim that it works
```

The second line of each pair scans the rendered steps screen for any positive claim — *"will work"*,
*"works on"*, *"you can order"*, *"the Order button works"*, *"opens a new tab correctly"* — because
"the tri-state is null" and "the screen makes no promise" are two different facts and only the second
one is what an operator experiences.

⚠️ **`true` is now unreached, as `false` already was. Both branches stay.** The first platform we
actually observe — working or broken — must not need new plumbing to say so.

---

## 2. THE WORDPRESS PLAN REQUIREMENT — kept and sharpened

### (a) The silent failure is now named, in our own words

The record gained a `caveat`, which renders on the **steps screen** — where the operator will be
standing when it happens:

> If your schedule box disappears the moment you save the page, that is your plan and not something
> you did wrong. Nothing you type differently will make it stay — use the plain link instead, or ask
> WordPress.com to switch your hosting features on.

```
  PASS  it is shown on the STEPS screen, where they will be when it happens
  PASS  🔴 it names the failure: it disappears when you save
  PASS  🔴 it says it is NOT their fault
```

🔴 **This is worth more than the requirement itself.** Nothing errors — the content is simply gone on
save. An operator who has not been told concludes they pasted it wrong and tries again, and again, and
then blames us or gives up. One sentence converts an unbounded loop into a decision.

### (b) The question is no longer a self-assessment

The old wording asked the operator to check whether their plan includes it. **Because a paid plan is
not sufficient on its own, that is a question they can answer "yes" to and still fail** — the worst
shape a warning can take, since it consumes their confidence and then breaks anyway.

The record now separates the two jobs:

| Field | Job |
|---|---|
| `note` | **States the condition** — paid plan, *and* hosting features switched on |
| `authorityUrl` | WordPress.com's own page, as the authority |
| `question` | What we ask, per record — something the operator can act on |
| `whereToCheck` | The "I am not sure" helper line |

The note reads: *"WordPress comes in two shapes and this only affects one of them. On websites hosted
by WordPress.com, your schedule box is only allowed on their paid plans — and paying on its own is not
enough, because their hosting features have to be switched on as well. Their own page below is the
place that says what you get."*

The question is **"Shall we carry on and try it?"** — answerable, and it routes exactly as before
(yes → steps · no → the link version · not sure → steps). The helper line is *"You will know within a
minute either way — if it stays on the page after you save, it worked."*, which is the only reliable
test there is.

```
  PASS  …with the record's own question, not a hardcoded one
  PASS  …and the question is NOT "does your plan include it"
  PASS  …linking to WordPress.com's own page as the authority
  PASS  Squarespace, with no pre-question, still shows its requirement straight away
```

⚠️ **`pricingUrl` was renamed `authorityUrl`.** WordPress.com's authority for *what is restricted* is
their support page, not their price list; leaving the field named `pricingUrl` would invite the next
editor to link the wrong document. Squarespace's value is unchanged and still points at their pricing
page, which for them is the right authority.

🔴 **No tier name appears anywhere** — in copy or in the column. Unchanged from Stage 2b and re-checked.

---

## 3. 🔴 CAN THE TWO WORDPRESSES BE TOLD APART? — **NO RELIABLE DISCRIMINATOR**

I investigated before deciding, and the answer is no. **I did not add a fingerprint.**

### What the existing signals do

`x-pingback`, `/wp-content/`, `/wp-includes/` and the `generator` meta tag are served by **both**
shapes. They identify WordPress; they say nothing about who hosts it. That much you had already
established and it holds.

### The tempting extras, and why each is worse than useless

| Candidate | Why it fails |
|---|---|
| `s0.wp.com`, `stats.wp.com`, `i0.wp.com` | 🔴 **Exactly the trap you named.** These are Automattic asset hosts used by **Jetpack**, which runs on millions of **self-hosted** sites. A self-hosted site with Jetpack would be flagged as hosted and shown a warning that does not apply to it — a false warning telling an operator to go and look at a price list they do not need. |
| `x-hacker`, `x-ac`, `x-rq` | Automattic **infrastructure** headers, so they also appear on their other hosting products, which carry none of these restrictions. Same misclassification, different route. |
| The hostname | A hosted site on a custom domain gives the hostname nothing to say. |
| Any origin header | A front-end cache in front of the site can strip or replace them entirely. |

### 🔴 And the deciding reason, which is not about fingerprints at all

**Even a perfect hosted/self-hosted split would not answer this question.** The condition includes
*hosting features being active* — runtime state on their account that **no fetch from outside can
see**. A fingerprint would therefore produce a confident-looking answer to the wrong question, and a
confident wrong answer is worse than an honest ask.

### So: one WordPress record, and one plain question

The record carries a `preQuestion`, asked **before** the requirement:

> **First — where does your website live?**  ·  *On WordPress.com*  ·  *On my own hosting*

```
  PASS  WordPress carries a pre-question
  PASS  it is asked FIRST — the requirement itself is not shown yet
  PASS  both answers are offered
  PASS  own hosting → reassured, requirement NOT shown
  PASS  WordPress.com → the requirement IS shown
```

*On my own hosting* → *"Then none of this applies to you — your website can take the schedule box as
it is."* → straight to the steps.

⚠️ **THE EXEMPT ANSWER RECORDS NOTHING, DELIBERATELY.** `trucks.embed_plan_answer` holds what the
operator said when asked whether their plan includes this, and a self-hosted operator was never asked
that. Writing `'yes'` would put an answer in the column they never gave; **NULL already means the true
thing** — the question was not put to them. This also avoids the schema change the brief rules out.

`preQuestion` is a **generic field on the record**, not a WordPress special case, so the next platform
with a two-shapes problem needs one record edit and no new screen.

---

## 4. VERIFICATION

**Which of the three: a typecheck and ten executions.** No standalone parse.

### Single-source still holds over the changed copy

```
  483 source files scanned
  46 strings checked: labels, hints, caveats, help links, plan notes, authority links, every step
  PASS  Every one of them appears in lib/embed-instructions.ts and NOWHERE ELSE.
```

The count rose from 45 to 46 — the new WordPress `caveat`. The new `question`, `whereToCheck` and the
four `preQuestion` strings are all record fields rendered by the wizard, which writes none of them.

### Plain English, over the new sentences

```
  "code"    absent from our own words ✓     "widget"   absent from our own words ✓
  "snippet" absent from our own words ✓     "element"  absent from our own words ✓
  "embed"   absent from our own words ✓     "html"     absent from our own words ✓
  "iframe"  absent from our own words ✓

  QUOTED BUTTON LABELS CARRYING A TECHNICAL WORD — the full declared exception, 7 (unchanged):
    "Code" · "Add Elements" · "Embed Code" · "Embed HTML" · "Enter Code" · "Custom HTML" · "Embed"

  PASS  ONE NAME for the thing being pasted — "schedule box" — is used
  PASS  …and the email uses it too
```

**The new sentences introduce no banned word.** Writing the silent-removal warning without them was
the constraint that shaped it: *"your schedule box disappears the moment you save"* rather than any
description of what is being filtered. The exception list did not grow.

### Everything else is unchanged

```
  embed-gate PASS   embed-api PASS   posthog PASS   proxy-embed PASS   card-parity-1b PASS
  stamp-throttle PASS   embed-actions PASS   detect PASS   wizard-2b PASS   single-source PASS
```

- **Detection: 11/11, byte-identical** — all four platforms from a header and from a body-only page,
  three unresolvable cases returning null. **No fingerprint was added or changed.**
- **The picker:** same six options, same order, still one component with two states differing only in
  selection and one line of copy.
- **The requirement page** still renders only where a record carries a requirement — Wix, Shopify,
  Something else and I-didn't-build-it all still skip it.
- **The other four platform records** are untouched apart from Squarespace and Shopify migrating to
  the new `PlanRequirement` shape (Squarespace) or losing a `true` (Shopify).
- **The embed route, the schema and the rate-limit buckets** were not touched — `app/embed/[slug]/`
  and the three migrations carry earlier timestamps.
- **The plan gate still bites:** max → wizard · starter → null · pro → null · trial NULL → wizard ·
  trial EXPIRED → null.

---

## 5. What remains unverified

1. **Nothing was rendered in a browser.** The wizard was executed with a stubbed React and driven hook
   state. No click path was walked, no real WordPress site was visited.
2. **`orderButtonWorks` is now honestly `null` everywhere — which is not the same as knowing.** Four
   platforms remain untested on a real site. That is the point of this correction, not a gap it closes.
3. **The WordPress.com restriction is documented, not observed by me.** I have not pasted a schedule
   box into a WordPress.com page and watched it vanish. The copy is written from their documentation
   as you described it, and the caveat is phrased as what the operator will see rather than as a
   mechanism I have confirmed.
4. **The "no reliable discriminator" conclusion is reasoned from known fingerprint behaviour**, not
   from fetching a sample of hosted and self-hosted sites. If someone wants to overturn it, the
   evidence that would do so is a header present on WordPress.com and absent under Jetpack — and §3's
   deciding reason would still stand even then.
5. **Three migrations remain unapplied.** Unchanged by this stage; still required before deploying.
6. **`next build` was not run.** `tsc --noEmit` is a typecheck, not a build.
