# Website-embed — Stage 2b: detection, one picker, plan requirement

**WHICH OF THE THREE I DID: A TYPECHECK AND TEN EXECUTIONS. No standalone parse — `tsc --noEmit`
subsumes it.** `npx tsc --noEmit` exits 0. Ten harnesses run the **real** transpiled modules in a
`vm`: the detection matcher, the `detect_platform` route, the wizard through every screen, the
single-source proof, the scraper-column proof extended to the new paths, plus the five Stage 1/1b/2
harnesses re-run.

🔴 **Nothing was deployed. No migration was run.** Three migration files now exist and are unapplied;
**no SQL of any kind was executed.** Pizzeria Gusto is untouched.

**Nothing in this send arrived garbled**, and the truncation I flagged on the previous send is
resolved — items 4 through 7 arrived complete.

---

## 0. Scope — five files

| File | Change |
|---|---|
| `supabase/migrations/20260826_trucks_embed_plan_answer.sql` | **NEW — written, NOT run.** One nullable column. |
| `lib/embed-instructions.ts` | **REWRITTEN** — one record per platform, the only source |
| `components/dashboard/EmbedWizard.tsx` | **REWRITTEN** — address-first, one picker, requirement page, link version |
| `app/api/manage/route.ts` | `detect_platform` added; plan answer wired; email renders from the record |
| `components/dashboard/types.ts` | one optional field, `embed_plan_answer?` |

**Nothing else was touched.** By mtime, every other file in the tree predates this stage:
`components/TruckListCard.tsx` (21:47), `app/embed/[slug]/page.tsx` (22:03),
`app/embed/[slug]/EmbedSchedule.tsx` (21:47), `app/dashboard/[token]/page.tsx` (22:06), `proxy.ts`,
`vercel.json`, `lib/ratelimit.ts`, `app/providers.tsx`, `lib/features.ts`. `lib/plan-features.ts`,
`TruckClient.tsx` and the order page are **unchanged versus HEAD**.

---

## 1. ONE PLATFORM RECORD — and the proof no second copy survives

`PlatformRecord` now carries every field the brief names: `label` · `fingerprints` · `steps` ·
`helpUrl` · `planRequirement` (null where there is none) · `orderButtonWorks` (true/false/**null**) ·
`caveat` — plus `hint` and `handOff`.

**Surfaces wired to it — three:**

| Surface | How |
|---|---|
| The wizard screen | `EmbedWizard.tsx` imports `PICKER_ORDER`, `recordFor`, `scheduleBox`, `linkVersion` and renders every platform word from the record |
| The escape-hatch email | `instructionsEmail()` takes the chosen platform and renders **the same `steps` array**, help link, plan note and caveat |
| The link version | `linkVersion()` — the operator-facing reference for the plain-link route |

### The proof

A harness reads the records, extracts **45 strings** — every label, hint, caveat, help link, plan
note, pricing link and **every individual step** — and searches all **483** source files:

```
  PASS  Every one of them appears in lib/embed-instructions.ts and NOWHERE ELSE.

  SURFACES WIRED TO THE RECORD:
    PASS  components/dashboard/EmbedWizard.tsx       the wizard screen
    PASS  app/api/manage/route.ts                    the escape-hatch email + detection

  RETIRED EXPORTS (the Stage 2 shape that allowed a second copy):
    PASS  PLATFORM_GUIDES      PASS  guideFor      PASS  embedTag      PASS  PlatformGuide
```

⚠️ **THE FIRST RUN FAILED ON THREE, AND THEY WERE THE CHECKER OVER-REACHING.** It flagged the words
"Squarespace", "Wix" and "I didn't build it" in `app/api/manage/route.ts` — all three inside
**engineering comments** explaining why detection is a fetch and verification is a live load. A comment
cannot render, so it cannot drift in front of an operator, which is the failure the rule exists to
prevent. Comments are now stripped before searching **and every stripped hit is printed anyway**:

```
  OCCURRENCES INSIDE CODE COMMENTS — stripped before searching, listed so nothing is hidden (3):
    app/api/manage/route.ts  mentions squarespace/label "Squarespace"
    app/api/manage/route.ts  mentions wix/label "Wix"
    app/api/manage/route.ts  mentions someone-else/label "I didn't build it"
```

---

## 2. DETECTION

**The address is asked once, first.** On submit the wizard saves it, then calls `detect_platform`,
then lands on the picker — whatever happened.

**Timeout: 6 seconds**, plus a **256KB capped streaming read**. The reasoning is in the code and it is
the operator's, not the server's: this runs while a person watches a spinner having just typed their
own web address, and past about six seconds they conclude it is broken. Because detection is
**advisory**, waiting longer buys a pre-selected radio button and nothing more.

### The matcher — four platforms, from a header AND from a body-only page

```
  PASS  Squarespace — server header       → squarespace  via header  (server: squarespace)
  PASS  Squarespace — body only           → squarespace  via body    (static1.squarespace.com + this is squarespace)
  PASS  Wix — x-wix-request-id            → wix          via header  (x-wix-request-id)
  PASS  Wix — body only                   → wix          via body    (static.parastorage.com + wixstatic.com)
  PASS  WordPress — x-pingback            → wordpress    via header  (x-pingback)
  PASS  WordPress — body only             → wordpress    via body    (/wp-content/ + /wp-includes/)
  PASS  Shopify — x-shopid                → shopify      via header  (x-shopid)
  PASS  Shopify — body only               → shopify      via body    (cdn.shopify.com + shopify.theme)
  PASS  🔴 UNRECOGNISED — a plain site    → null
  PASS  🔴 ONE body hit is NOT enough     → null
  PASS  🔴 EMPTY everything               → null
  11/11
```

🔴 **HEADERS BEAT BODY, AND ONE BODY HIT IS NOT ENOUGH.** A header is set by the platform's own
infrastructure; a body string can appear on any page that merely *links* to a builder — an agency
portfolio mentioning Squarespace would match on body alone. Two hits are required before body counts.

### It never blocks — every failure is a 200 with `platform: null`

```
  PASS  a private address 192.168.x       → status 200, platform null, reason blocked_address
  PASS  loopback by name                  → status 200, platform null, reason blocked_address
  PASS  an .internal name                 → status 200, platform null, reason blocked_address
  PASS  🔴 cloud metadata 169.254.169.254 → status 200, platform null, reason blocked_address
  PASS  not an address at all             → status 200, platform null, reason unreadable_address
  PASS  a non-web scheme                  → status 200, platform null, reason unreadable_address
  PASS  🔴 an unreachable real host       → status 200, platform null, reason no_answer
  PASS  detection is READ-ONLY — it writes nothing at all
```

**There is no error path to the operator.** A website we could not read is not their problem to solve,
so every failure lands them on the picker with nothing selected — the same screen, one click further
from done.

⚠️ **THIS IS AN SSRF SURFACE AND IT IS FENCED.** http/https only (`normaliseUrl` refuses every other
scheme and every bare IP); an explicit deny-list for loopback, private ranges, link-local and internal
names; **the FINAL url re-checked after redirects**, so a redirect into an internal host is caught
rather than trusted; a hard timeout; a capped read.

⚠️ **TWO OF MY EXPECTATIONS IN THAT TABLE WERE WRONG AND THE CODE WAS RIGHT.** I predicted `localhost`
and `169.254.169.254` would be refused by `normaliseUrl` as unreadable; both parse fine as URLs and are
caught by the host deny-list instead — a *stronger* result, and 169.254.169.254 is the cloud metadata
endpoint, i.e. the single most important SSRF target. I corrected the expectations, not the code.

🔴 **DETECTION AND VERIFICATION ARE NOT INTERCHANGEABLE AND NEITHER IS REUSED FOR THE OTHER.** A fetch
reads the shell a platform serves, which is where fingerprints live — reliable. It cannot see our
schedule box on a Wix or Squarespace page, because those assemble client-side. **Verification stays a
live load** (the operator opens their own site; the embed route stamps the row).

---

## 3. THE PICKER — one component, one list, two states

```
  PASS  undetected renders all six options, in PICKER_ORDER
        ["Squarespace","Wix","WordPress","Shopify","Something else","I didn't build it"]
  PASS  detected renders the SAME six, same order
  PASS  the option list is IDENTICAL between the two states
  PASS  undetected shows the "pick one" line, not the "looks like" line
  PASS  detected shows the "looks like" line, not the "pick one" line
  PASS  nothing arrives selected when detection found nothing
  PASS  the detected option arrives selected
```

**The two states differ in exactly two things: which option carries the selection ring, and one line of
copy under the heading.** There is no detected variant and no undetected variant — one `step ===
'platform'` branch, one `PICKER_ORDER.map`, rendered twice with different state.

Detection also never locks: the option list is fully clickable in both states, and `Continue` reads
`chosen`, which the operator can change.

---

## 4. THE PLAN REQUIREMENT PAGE

**Renders only where the record carries one** — proven per platform:

```
  PASS  Squarespace      requirement page RENDERS
  PASS     …states the requirement without naming a tier
  PASS     …links to Squarespace's own pricing page
  PASS     …offers yes / no / not sure
  PASS  Wix              requirement page does NOT render
  PASS  WordPress        requirement page RENDERS   (+ the three sub-assertions)
  PASS  Shopify          requirement page does NOT render
  PASS  Something else   requirement page does NOT render
  PASS  I didn't build it requirement page does NOT render

  WHERE EACH PLATFORM GOES FROM THE PICKER:
    Squarespace      → requirement
    Wix              → steps
    WordPress        → requirement
    Shopify          → steps
    Something else   → steps
    I didn't build it → email
```

**Yes → steps. Not sure → steps, with where to check. No → the link version.** All three are recorded
to `trucks.embed_plan_answer`; none of them blocks.

🔴 **NO TIER NAME APPEARS ANYWHERE**, in copy or in the column. The column stores our question's
answer, not a name for somebody else's product — a stale tier name in a database outlives a stale one
in copy.

### "No" is not a dead end

```
  PASS  the link version renders
  PASS  it says it works everywhere, on every plan
  PASS  it carries the truck's own schedule address
  PASS  it suggests button wording
  PASS  🔴 it does NOT tell them to upgrade
```

The copy is *"A plain link to your schedule works on every website builder, on every plan."* — the true
and useful thing. **No upgrade sentence**, asserted by the harness.

---

## 5. THE ORDER-BUTTON TRI-STATE

```
  PASS  Wix              orderButtonWorks=null  → says we are still confirming
  PASS  Squarespace      orderButtonWorks=null  → says we are still confirming
  PASS  WordPress        orderButtonWorks=true  → makes no claim
  PASS  Shopify          orderButtonWorks=true  → makes no claim
  PASS  Something else   orderButtonWorks=null  → says we are still confirming
```

`false` routes to the link version before the operator tries — **real code on a path no platform
reaches today.** It stays because the first platform we confirm broken must not need new plumbing.

⚠️ **`true` DELIBERATELY SAYS NOTHING.** The brief mandates copy for `false` and `null`; for `true` I
chose silence, because a reassurance we have not observed is still a promise. **None of the four has
been tested on a real site.**

---

## 6. 🔴 TWO JUDGEMENT CALLS THAT ARE MINE, NOT THE BRIEF'S

**1. Squarespace ships `null`, not `true`.** The brief says Wix ships UNSET; it does not say what
Squarespace ships. My Stage 2 report raised the doubt that Squarespace wraps pasted content in a
restricted frame, and no evidence has arrived since, so flipping it to `true` now would be promising
on the strength of nothing. WordPress and Shopify ship `true` because their blocks place content
directly on the page. **Change any of these if you know better than I do.**

**2. WordPress carries a plan requirement, and I could not verify it.** WordPress comes in two shapes
and only one of them may restrict this. I hedged the wording rather than assert —
*"WordPress comes in two shapes. If your website is on your own hosting you are fine. If it is on
WordPress.com, some of their plans do not include this — worth a quick look at their plans page."* — and
the link is the authority, which is the pattern the brief asks for. **A false warning has a real cost:
it makes an operator think they must pay when they needn't.** If you want it dropped, delete
`planRequirement` from that one record and the screen stops rendering for WordPress with no other
change.

---

## 7. PLAIN ENGLISH

Checked across **every screen × every platform**, plus every record field, the email, and the
link-version wording:

```
  "code"       absent from our own words ✓      "widget"     absent from our own words ✓
  "snippet"    absent from our own words ✓      "element"    absent from our own words ✓
  "embed"      absent from our own words ✓      "html"       absent from our own words ✓
  "iframe"     absent from our own words ✓

  QUOTED BUTTON LABELS CARRYING A TECHNICAL WORD — the full declared exception, 7:
    "Code" · "Add Elements" · "Embed Code" · "Embed HTML" · "Enter Code" · "Custom HTML" · "Embed"
      (the platform's own label, capitalised as the operator sees it)

  PASS  ONE NAME for the thing being pasted — "schedule box" — is used
  PASS  …and the email uses it too
```

⚠️ **THREE EXCLUSIONS, EACH PRINTED SO IT STAYS AUDITABLE:** quoted button labels (the declared
exception) · **URLs** · **the schedule box itself**.

**The first run failed on "code", "embed" and "iframe", and all three were the checker's corpus being
wrong.** "code" and "embed" matched inside *Wix's own help URL* (`…embedding-custom-code-on-your-site`)
— that is Wix's filename, not a sentence anyone reads. "iframe" matched inside the schedule box markup
— the thing being pasted, which the operator copies without reading and which contains "iframe"
because it *is* one. Our **name** for it is "schedule box", asserted separately.

Sentences follow the mandated shape: *Click the button called "Embed HTML".*

---

## 8. Nothing else moved

**The scraper columns, across all 14 paths including the six new ones:**

```
  2b: plan answer YES                        payload ["embed_enabled","embed_plan_answer"]
  2b: plan answer NO                         payload ["embed_enabled","embed_plan_answer"]
  2b: plan answer NOT SURE                   payload ["embed_enabled","embed_plan_answer"]
  2b: plan answer + website together         payload ["embed_enabled","embed_plan_answer","website"]
  2b: an INVALID plan answer is dropped      payload ["embed_enabled"]
  🔴 2b SMUGGLING: plan answer + scraper cols payload ["embed_enabled","embed_plan_answer"]

  UNION OF ALL COLUMNS WRITTEN: ["embed_enabled","embed_plan_answer","website"]
  PASS  schedule_url never appears in any payload
  PASS  scraper_preference never appears in any payload
  PASS  scraper_rule never appears in any payload
  PASS  detection is READ-ONLY — it writes nothing at all
```

**The plan gate still bites:** `max` → wizard · `starter` → null · `pro` → null · `trial NULL` →
wizard · `trial EXPIRED` → null.

**Every harness, run together:**

```
  embed-gate PASS   embed-api PASS   posthog PASS   proxy-embed PASS   card-parity-1b PASS
  stamp-throttle PASS   embed-actions PASS   detect PASS   wizard-2b PASS   single-source PASS
```

⚠️ The Stage 2 `wizard-gate` harness was **deleted, not skipped** — it tested `PLATFORM_GUIDES` and
`guideFor`, which no longer exist. `wizard-2b` supersedes it and covers strictly more.

---

## 9. What remains unverified

1. **Nothing was rendered in a browser.** The wizard was executed with a stubbed React and driven hook
   state; no click path was walked, no CSS seen, no email sent, no real website fetched.
2. **The fingerprints were tested against constructed responses, not live sites.** They are
   well-established (`x-wix-request-id`, `x-shopid`, `x-pingback`, `static1.squarespace.com`) but **no
   real operator's website was fetched.**
3. **The platform menu paths still come from training, not from the live products.** Unchanged from
   Stage 2, and now mitigated by `helpUrl` on every record.
4. **`orderButtonWorks` is unobserved on all four platforms** — §5, §6.
5. **The WordPress plan requirement is unverified** — §6.
6. **Three migrations are unapplied**: `embed_enabled`, the `embed_last_seen_at`/`embed_last_referer`
   pair, and `embed_plan_answer`. **Apply all three before deploying.**
7. **The 6-second timeout was not tested against a slow real site**, only against an unreachable host.
8. **`next build` was not run.** `tsc --noEmit` is a typecheck, not a build.
