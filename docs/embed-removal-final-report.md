# Option D — embed removal, placement and wording, dynamic QR

**WHICH OF THE THREE I PERFORMED: A TYPECHECK AND TWO EXECUTIONS.** No standalone parse — `npx tsc
--noEmit` subsumes it and **exits 0**. Two harnesses run the **real** routes, the **real** layout and the
**real** component in a `vm`: **17/17** and **10/10**. The copy checker ran over six strings: **6/6**.
Six further checks in §7 are labelled **PARSE**.

🔴 **Nothing was deployed. NO COLUMN WAS DROPPED and no migration was written** — 113 migrations on
disk, unchanged, and all three embed migrations still present. Pizzeria Gusto is untouched.

**Nothing in the prompt arrived garbled.** One instruction could not be met as literally worded and I
have reported it rather than fudged it — §7.3, the "one contiguous region" check.

**Files: 3 deleted, 6 modified, 1 created.**

| | |
|---|---|
| **Deleted** | `components/dashboard/EmbedWizard.tsx` · `lib/embed-instructions.ts` · `app/embed/[slug]/page.tsx` |
| **Modified** | `app/api/manage/route.ts` · `app/manage/[token]/page.tsx` · `components/dashboard/CustomDomainSetup.tsx` · `app/api/embed/events/route.ts` · `app/embed/[slug]/EmbedSchedule.tsx` · `components/embed/EmbedParts.tsx` |
| **Created** | `app/trucks/[slug]/order/layout.tsx` |

---

## 1. PART A — WHAT WAS REMOVED

| Item | Where it went |
|---|---|
| The embed wizard component | `components/dashboard/EmbedWizard.tsx` **deleted** |
| Its mount | removed from `app/manage/[token]/page.tsx`, with its import |
| Platform records and instruction content | `lib/embed-instructions.ts` **deleted** |
| Platform detection and the picker | `detect_platform` action **removed** (93 lines including its header) |
| The plan-requirement screen and its pre-question | the screen went with the wizard; the `plan_answer` write **removed** from `save_embed_setup` |
| The embed escape-hatch email | `send_embed_instructions` **removed** (36 lines) |
| The public iframe route | `app/embed/[slug]/page.tsx` **deleted** |
| The load stamp and its throttle | lived inside that route — deleted with it; the stale read-back **removed** from `get_embed_status` |

The staff-block list no longer names the two removed actions, and the
`scheduleBox / instructionsEmail / detectPlatform` import is gone.

### What was kept, each commented with why it has no UI

| Kept | The comment says |
|---|---|
| `app/api/embed/events/route.ts` | *"KEPT AFTER THE IFRAME REMOVAL, AND IT IS NOW A CUSTOM-DOMAIN ROUTE… Its name is historical."* |
| `app/embed/[slug]/EmbedSchedule.tsx` | *"ITS FOLDER NAME IS HISTORY, NOT DEPENDENCY… deleting it with the folder would take the custom-domain page's content with it."* |
| `components/embed/EmbedParts.tsx` | *"the chrome of the CUSTOM-DOMAIN page, which is their only caller now."* |
| `save_embed_setup` | *"the only supported way to turn that column OFF without hand-written SQL… an operational lever, not a feature."* |
| `get_embed_status` | *"the diagnostic for the silent failure… nothing on the custom-domain page reads or reports `embed_enabled`."* |
| Every embed column | untouched. §7.5. |

---

## 2. 🔴 PART A2 — THE THING THAT MAKES OPTION D WORK

`domain_provision` now sets the column, inside the same patch that records the domain
(`app/api/manage/route.ts`):

```ts
    const patch = {
      custom_domain: verdict.host,
      // ── 🔴 THIS LINE IS WHY THE CUSTOM DOMAIN HAS ANY CONTENT AT ALL. DO NOT REMOVE IT. ──────────
      // … after the iframe wizard was removed THIS IS THE ONLY PLACE IN THE CODEBASE THAT SETS IT TRUE.
      // 🔴 WITHOUT IT THE FAILURE IS SILENT AND LOOKS FINE … Assert the EVENTS, never the render.
      embed_enabled: true,
      …
```

⚠️ **Set at PROVISION, not at verification, deliberately.** Provisioning is the one step that always
happens and happens exactly once. Setting it at verification would leave the column false for every
operator who provisions and never returns — and verification is a *cron* transition, so the failure
would depend on a job having run.

### EXECUTION — proved on the data, not on a render

```
1. AFTER THE REMOVAL — provision a domain, then assert /api/embed/events returns EVENTS
  before provision: embed_enabled = false  (the NOT NULL DEFAULT)
  before provision: events = 0   ← the silent failure, if nothing sets the column
  domain_provision → 200   patch wrote embed_enabled = true
  after provision : events = 2
      {"id":"e1","date":"01/01/2099",…,"venueName":"Market Square",…}

  PASS  baseline: a truck with embed_enabled false returns ZERO events
  PASS  🔴 provision sets embed_enabled TRUE on the row
  PASS  🔴 AFTER PROVISION THE EVENTS ARE NON-EMPTY — asserted on the DATA, not on a render
  PASS  …and they are this truck's real events
```

🔴 **The baseline row is the important one.** It reproduces the exact failure the stop identified — zero
events, no error — so the passing case is measured against a harness that can actually fail. The two
routes share one in-memory database, so the provision is genuinely visible to the events route.

### 🔴 TRUCKS THAT PROVISIONED BEFORE THIS CHANGE — reported, no migration written

**By artefact, there should be none:** none of this is deployed, `app/api/manage/route.ts` is
uncommitted, and the three `custom_domain` migrations are unapplied — so no row can carry a
`custom_domain` yet. **But I did not query the database and cannot prove that.**

**If any exist, the symptom is exactly the silent one:** `custom_domain` set, `embed_enabled` false,
page renders, schedule permanently empty.

**To find them — I did NOT run this:**

```sql
select id, name, slug, custom_domain, embed_enabled, custom_domain_verified_at
  from trucks
 where custom_domain is not null
   and embed_enabled is not true;
```

**To fix them — I did NOT run this either:**

```sql
update trucks
   set embed_enabled = true
 where custom_domain is not null
   and embed_enabled is not true;
```

⚠️ It is idempotent and touches only rows that already hold a domain. **Run the select first** — if it
returns zero rows, as expected, the update is unnecessary.

---

## 3. PART B — PLACEMENT AND WORDING

**1. Moved.** The custom-domain card now sits **immediately above the Order QR code card**, with the
adjacency argued at the mount: *"once this card's setup is finished the SAME PRINTED CODE starts sending
customers to the operator's own address. Reading them in this order is what makes that obvious."*

**2. Heading and description, verbatim as specified:**

```tsx
  <h3 className="font-bold text-slate-900">Add your schedule to your website</h3>
  <p className="text-sm text-slate-500 mt-0.5">
    Show where you are trading next, on your own website.
  </p>
```

**3. The first screen sets the expectation before it asks anything**, with one concrete example:

> **You will get a web address of your own for your schedule, like this one:**
> `schedule.yourtruck.co.uk`
> *Your website stays exactly as it is. You put a link to this from it, and we keep the page up to date.*

🔴 **Why this block exists, recorded at it:** the heading is in the operator's language, and taken alone
*"add your schedule to your website"* reads as though it appears on their existing homepage. **Nobody may
reach the record step still believing that** — that is where they or their web person change something
at their domain provider, and an operator who has misunderstood will either stop or ask for the wrong
change.

**4. The plain-English checker: 6/6.**

⚠️ **The committed checker does not exist.** §35 of the manual documents the *rule* and says a checker
enforces it, but it was a session harness, not a committed script. **I rebuilt it from §35's stated
rule** — banned-word list, quoted labels and URLs stripped, every exclusion printed — and ran it. Stated
plainly because "ran the existing checker" would be a stronger claim than the truth.

🔴 **AND IT CAUGHT ONE.** The first draft of the QR sentence read *"this **code** sends customers there
instead"* — `code` is on the banned list. **I reworded rather than widening the exclusion**, to *"this
**QR code**"*, which is the operator's own name for the printed object and is the term already used
throughout that card. Exclusions applied, deduplicated: the example address `schedule.yourtruck.co.uk`,
and the phrase `QR code`.

---

## 4. PART C — THE QR REDIRECT

### The encoded URL is untouched

Neither construction was edited. §7.2 proves the manage one byte-identical and the dashboard one
unchanged.

### The change is on the serving side

New file `app/trucks/[slug]/order/layout.tsx` — a **server** layout wrapping the existing client page,
because `page.tsx` is `'use client'` and can neither read the database nor issue a server redirect.
`export const dynamic = 'force-dynamic'` is what guarantees the read happens per request.

**Five conditions, all ANDed**, each a reason a redirect would strand a paying customer:

1. a domain is set;
2. `custom_domain_verified_at` — a **machine** has seen it resolve to us;
3. `custom_domain_confirmed_at` — a **person** has opened it and said the page is right (🔴 *"a domain
   can resolve correctly and still show the wrong truck's schedule, and only a human catches that"*);
4. the plan still grants the feature — otherwise their page is the name-and-link fallback, which
   customers cannot order from;
5. the last daily check was healthy — within `STOPPED_AFTER_MS` from `lib/custom-domain/cadence.ts`.
   🔴 **Reused, not restated**: a printed code cannot afford a second opinion about what "healthy" means.

Any error, missing row or unreadable column **serves our own page**.

### 🔴 THE STATUS CODE: 307, AND IT IS A DESIGN DECISION

`redirect()` issues **307 Temporary Redirect**.

**It must not be 301 or 308.** Those are permanent, and browsers and intermediaries cache them
indefinitely — often with no way for the customer to clear it. On a printed code that is a trap with no
recovery: a truck whose plan lapses, whose domain expires, or who stops paying their registrar would
have customers **permanently pinned to a dead address by a redirect we issued** — and reprinting the
code would not undo it, because the code is not what is cached. 🔴 **A permanent redirect would silently
convert this dynamic code back into a static one, with the destination baked into the customer's browser
instead of the paper.** A temporary redirect is re-decided on every scan, which is the whole point of
resolving per request.

### EXECUTION — per request, and nothing stored

```
2. THE QR REDIRECT — one truck, five states, NO WRITE BETWEEN THEM
  live + confirmed + healthy         → REDIRECT  https://schedule.rtf.co.uk/   (writes during resolve: 0)
  plan lapsed (expired trial)        → served our page   (writes during resolve: 0)
  not confirmed by the operator      → served our page   (writes during resolve: 0)
  last check FAILED (stale ok)       → served our page   (writes during resolve: 0)
  never verified                     → served our page   (writes during resolve: 0)

  PASS  🔴 ZERO writes across all five resolutions
  PASS  🔴 restored state redirects again on the NEXT request, with nothing run in between
```

🔴 **The state was mutated directly on the row, never through the app** — so what is proven is that the
*resolution* reads current state, not that some write path happens to keep a stored target correct. The
last assertion is the one that shows there is no stored target at all: restoring health makes the very
next request redirect again, with no job, no cache bust and no write.

### The QR settings copy

> Once your own web address is set up, this QR code sends customers there instead. You never need to
> print a new one.

Placed under the "Order QR code" heading, with the reason recorded: *"a truck that reprints a hatch board
because we did not say one sentence has paid for our silence."*

---

## 5. VERIFICATION SUMMARY

```
  npx tsc --noEmit                                  exit 0
  optd.js   (real routes + real layout, shared db)  17/17 PASS
  optd2.js  (real component + real canAccess)       10/10 PASS
  plain-English checker (rebuilt from §35)           6/6  PASS
```

### The wizard gate still bites

```
  starter              null (nothing)
  pro                  null (nothing)
  max                  RENDERS (507 chars)
  trial (EXPIRED)      null (nothing)
  trial                RENDERS (507 chars)
  mount condition: !isDemoIdentifier(token) && truck
  real token → true   demo token → false
```

---

## 6. WHAT REMAINS UNVERIFIED

1. 🔴 **NOTHING WAS RENDERED IN A BROWSER.** No manage page, no custom domain, no QR scan, no redirect
   followed. **The card's new position and the first screen were not seen.**
2. 🔴 **THE LAYOUT'S REDIRECT WAS EXERCISED AS A FUNCTION, NOT AS A REQUEST.** `next/navigation`'s
   `redirect` was stubbed to throw a tagged error. **That `force-dynamic` actually defeats layout caching
   in a real Next build is REASONED FROM THE DOCUMENTED SEMANTICS, NOT OBSERVED** — and it is the single
   assumption the whole per-request guarantee rests on. `next build` was not run.
3. **No real HTTP status code was observed.** 307 is what `redirect()` documents for a server component;
   no response was inspected.
4. **The database was not queried**, so the count of pre-existing provisioned trucks (§2) is an argument
   from artefacts, not an observation.
5. **The plain-English checker is a reconstruction**, not the original. Its banned-word list is my
   reading of §35, and a word that rule would catch but my list omits would pass.
6. **The deleted files are recoverable from `/tmp` only for this session** — they are in git history for
   `app/embed/[slug]/page.tsx`, but `EmbedWizard.tsx` and `lib/embed-instructions.ts` were **untracked**,
   so once this session's `/tmp` is cleared they exist nowhere but the working tree's absence. ⚠️ **If
   this feature may return, commit before clearing.**
7. **Six migrations remain unapplied.** This work needed none.

---

## 7. SCOPE PROOFS

**7.1 Nothing orphaned.** `EmbedWizard`, `embed-instructions`, `detectPlatform`, `scheduleBox`,
`detect_platform`, `send_embed_instructions` — **0 references each** across `app`, `lib`, `components`.
The only `instructionsEmail` left is the unrelated `custom-domain/copy` export. Nothing imports the
deleted route; the three remaining mentions are comments naming it as deleted. `tsc --noEmit` exits 0.

**7.2 The encoded URL is byte-identical.**

```
  before: "const orderUrl = truck.slug\n    ? `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order`\n    : null"
  after : "const orderUrl = truck.slug\n    ? `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order`\n    : null"
```

…and it names only the slug — no custom-domain term appears in it. The dashboard construction is
untouched.

**7.3 ⚠️ THE MANAGE SETTINGS TAB — THREE REGIONS, NOT ONE, AND ONE IS UNAVOIDABLE.**

```
  SettingsTab: 2188 lines -> 2196 lines
  changed regions: 3
    insert  new[1022:1029]   the custom-domain mount, above the QR card
    insert  new[1032:1041]   the QR settings copy
    delete  old[2153:2161]   the custom-domain mount, from above the danger zone
  unchanged lines carried through identically: True (2180 lines)
```

🔴 **A MOVE CANNOT BE ONE CONTIGUOUS REGION — it is a delete at the old site and an insert at the new
one, by definition.** The third region is the QR copy, which is a separate instruction. **All 2,180
unchanged lines carried through byte-identically**, and every other section is intact: Accepting orders,
Taking payment, Opening and closing, Display settings, Kitchen capacity, Order QR code, the danger zone
and Auto-replies all have identical occurrence counts before and after.

**7.4 The dashboard was not touched this workstream** — its only embed reference is the relocation
comment written in the previous one.

**7.5 No column dropped, no migration written.** 113 migrations on disk, unchanged; all three embed
migrations present. Every `drop column` in the tree is a pre-existing migration for an unrelated column.
`embed_enabled`, `embed_plan_answer`, `embed_last_seen_at` and `embed_last_referer` all still exist —
two of them now written by nothing, which is **deliberate and reversible**, unlike dropping them.
