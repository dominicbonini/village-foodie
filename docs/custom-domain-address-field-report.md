# The address field — no prefix in the box

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — every string quoted here is read from a file on disk.
- **Typecheck** — `npx tsc --noEmit`, clean. `npx eslint` on both touched files: no new rule violated.
- **Execution** — the **real component was transpiled and run** in a `vm` and rendered through
  `react-dom/server`, at both the pre-edit and post-edit source, over seven screen states; the **real
  `checkSubdomain` and `domainFromWebsite` were executed** on the full input set; and both `www` tests
  were lifted from the route and evaluated.

**NO DEPLOY. NO MIGRATION. NO SQL.** Pizzeria Gusto's row was not read or written.
🔴 **Nothing arrived garbled, but items 2 and 3 CONTRADICTED EACH OTHER. I stopped and asked rather
than choosing — §1. Two premises in the brief were also wrong, and one of my own escalations
overstated a severity, corrected in §5.**

---

## 1. 🔴 THE CONTRADICTION, AND WHAT YOU DECIDED

**Item 2** asked for a line showing *"the address that will be created"*, normalised with the
has-website path's `domainFromWebsite`. **Item 3** required the submitted value to be **byte-identical**
to today's, naming a scheme, a `www`, a path and an apex — **which are exactly the inputs where the two
disagree.** Executed evidence, before any change:

| Typed | What the field submitted | What was actually created | Item 2's preview |
|---|---|---|---|
| `yourtruck.com` | `events.yourtruck.com` | `events.yourtruck.com` | `events.yourtruck.com` ✅ |
| `yourtruck.com/schedule` | `events.yourtruck.com/schedule` | `events.yourtruck.com` | `events.yourtruck.com` ✅ |
| `https://yourtruck.com` | `events.https://yourtruck.com` | **refused — apex** | `events.yourtruck.com` 🔴 |
| `https://www.yourtruck.com/events` | `events.https://…/events` | **refused — www** | `events.yourtruck.com` 🔴 |
| `www.yourtruck.com` | `events.www.yourtruck.com` | **`events.www.yourtruck.com`** | `events.yourtruck.com` 🔴 |

On the last three the line would have **named an address that was not the one created** — and on the
`www` row a *different* host would have gone to the hosting provider than the screen stated. Item 2's
own words could not be satisfied while item 3 held.

**⚠️ THE THIRD COLUMN IS THE THING THAT MADE THIS SUBTLE.** What is provisioned is **not** the string
the field builds: `checkSubdomain` normalises server-side and `domain_provision` uses `verdict.host` for
both `addDomain()` and the `custom_domain` write. So the field was already being partly rescued —
inconsistently, and invisibly.

**YOUR DECISION: normalise at source.** The field now sends the normalised value, so the line and the
submission cannot disagree. **This changes what is submitted, which is what item 3 forbade — recorded
here as a sanctioned override, not an oversight.**

---

## 2. WHAT CHANGED IN THE FIELD

**The `events.` chip beside the box is gone.** Proven absent from the rendered markup. The input now
spans the full width (`w-full`, was `flex-1` in a flex row) and the keyboard-suppression attributes are
carried over untouched:

```html
<input type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck="false"
       placeholder="yourtruck.com" aria-label="Your own web address" class="w-full …" />
```

⚠️ **One comment was corrected while moving it.** It justified `type="text"` on the grounds that
*"`events.` is supplied beside it"* — no longer true. The type still must stay `text`, for the surviving
half of the reason: **an operator may reasonably type a bare `yourtruck.com`, which is invalid for
`type="url"`.**

### The field and its helper line, rendered

| Typed | Helper line |
|---|---|
| *(nothing)* | `For example, events.yourtruck.com` |
| `pizzeriagusto.co.uk` | `Your address will be events.pizzeriagusto.co.uk` |
| `www.yourtruck.com` | `Your address will be events.yourtruck.com` |
| `yourtruc` *(unparseable)* | `For example, events.yourtruck.com` |

**The neutral example covers both the empty field and an unparseable entry**, so there is never a
half-built `events.` with nothing after it — which is what item 2 asked for.

### One normaliser, not two

`domainFromWebsite(typedDomain)` — **the same function the has-website path already calls on
`trucks.website`.** It strips the scheme, the path, the port and any trailing dot, then reduces to the
**registrable domain** via the public suffix list. **No second normaliser was written**, and
`lib/custom-domain/apex.ts` is **byte-identical**.

---

## 3. THE SUBMITTED ADDRESS — WHAT CHANGED, AND IT IS PROVEN LINE BY LINE

Item 3 asked me to prove the submitted value was unchanged. **Under your decision it is deliberately
changed, so here is the full before/after instead — measured, not asserted.**

```
  TYPED                             BEFORE (raw)                            AFTER (normalised)
  ------------------------------------------------------------------------------------------------
  "yourtruck.com"                   events.yourtruck.com                    events.yourtruck.com
  "  YourTruck.COM  "               events.yourtruck.com                    events.yourtruck.com
  "https://www.yourtruck.com/events" events.https://www.yourtruck.com/events events.yourtruck.com  ← changed
  "www.yourtruck.com"               events.www.yourtruck.com                events.yourtruck.com  ← changed
  "https://yourtruck.com"           events.https://yourtruck.com            events.yourtruck.com  ← changed
  "yourtruck.com/schedule"          events.yourtruck.com/schedule           events.yourtruck.com  ← changed
  "yourtruc"                        events.yourtruc                         (none — button disabled)  ← changed
```

🔴 **AND THE PREVIEW EQUALS THE SUBMITTED VALUE ON EVERY ROW.** That is the property the change exists
to create, and it is what makes the line honest.

⚠️ **THE LAST ROW IS A BEHAVIOUR CHANGE WORTH SEEING.** A half-typed `yourtruc` used to build
`events.yourtruc` with the button **enabled**, and was refused by the guard after the press. It now
yields no address and a **disabled** button. **Better, but quieter** — the operator is told nothing
about *why* the button will not press until they finish typing the suffix. That is a deliberate trade,
not an oversight.

---

## 4. THE GUARDS — 10/10 VERDICTS BYTE-IDENTICAL

`lib/custom-domain/apex.ts` **was not edited**, and `checkSubdomain` was executed at both the pre-edit
and post-edit source over ten cases:

```
  ✅ "yourtruck.com"            REFUSED  apex        ✅ ""                        REFUSED  empty
  ✅ "yourtruck.co.uk"          REFUSED  apex        ✅ "not a domain"            REFUSED  not_a_domain
  ✅ "events.yourtruck.com"     accepted             ✅ "events.www.yourtruck.com" accepted
  ✅ "events.yourtruck.co.uk"   accepted             ✅ "www.yourtruck.com"        accepted
  ✅ "a.b.c.yourtruck.com"      accepted             ✅ "shop.www-cafe.com"        accepted
  → 10/10 verdicts byte-identical to before
```

### 🔴 BUT AN APEX IS NO LONGER REACHABLE THROUGH THE FIELD, AND YOUR ITEM 3 ASSUMED IT WAS

Item 3 said *"this is the path where an operator types the domain, so an apex is reachable through the
field again."* **It was. It is not any more, and that is a consequence of normalising at source:**
`domainFromWebsite` returns the **registrable** domain, so the address is always `events.` + eTLD+1 —
**exactly one label in front, which can never be an apex.** Executed:

```
  typed "yourtruck.com"      → events.yourtruck.com     accepted
  typed "https://yourtruck.com" → events.yourtruck.com  accepted
  typed "bbc.co.uk"          → events.bbc.co.uk         accepted
  typed "a.b.yourtruck.com"  → events.yourtruck.com     accepted
  typed ".com" / "com"       → (none)                   button disabled
  → an apex is ✅ NO LONGER reachable through the field
```

⚠️ **THE GUARDS STILL MATTER AND MUST STAY.** They now defend a path **the interface cannot reach**, on
this branch as well as the other — which is the same position they were already in for the has-website
path, and the same reasoning already written into the file: **a client is a courtesy; anything able to
POST reaches the action with no screen in the way.** 🔴 **Do not read "unreachable from the interface"
as "unnecessary".**

---

## 5. THE `www` HOLE — FIXED, AND MY OWN SEVERITY CORRECTED

**The read.** The route's `www` refusal tests the **first label** of the subdomain
(`app/api/manage/route.ts`). With the word in front fixed to `events`, that label is **always
`events`** — so a submitted `events.www.theirdomain.com` (subdomain `events.www`) sailed past it.

🔴 **I FIRST REPORTED THIS AS DEFEATING THE `www` GUARD. THAT OVERSTATED IT, AND I CORRECTED IT TO YOU
BEFORE BUILDING.** The dangerous case — the submitted host **being** `www.theirdomain.com`, which
replaces their homepage — has subdomain `www`, **fires the first-label test, and was never at risk.**
What leaked through was a **doubled-up nonsense name**, not a takeover: `events.www.theirdomain.com` is
a different name from their homepage and replaces nothing.

**The fix**, on your instruction: a **separate** branch for a `www` label deeper in the subdomain, with
its own accurate message. **The takeover test is byte-identical and still first-label** — proven, its
occurrence count in the route is 1 before and 1 after.

```
  SUBMITTED HOST                    subdomain     BEFORE        AFTER
  www.yourtruck.com                 www           REFUSED www   REFUSED www
  www.shop.yourtruck.com            www.shop      REFUSED www   REFUSED www
  events.yourtruck.com              events        allowed       allowed
  events.www.yourtruck.com          events.www    allowed       REFUSED www_inner   ← newly refused
  shop.www-cafe.com                 shop          allowed       allowed
  events.www-cafe.com               events        allowed       allowed
```

✅ **`shop.www-cafe.com` AND `events.www-cafe.com` ARE STILL ALLOWED.** The test is on whole **labels**,
preserving exactly the distinction the original first-label test was written for — *"www" as part of a
name is not the conventional web prefix.*

⚠️ **NOBODY USING THE INTERFACE CAN EVER SEE THIS MESSAGE**, because the field now normalises
`www.yourtruck.com` down to `yourtruck.com` before building the address. It is a guard for a direct
POST, like the apex ones.

---

## 6. THE PLAIN-ENGLISH CHECKER

```
  50/51 pass, 1 known violation(s)
```
The one is the **pre-existing** `QR: print or display` entry, untouched and unrelated.

**Added:** `'no-website result'` (*Your address will be events.yourtruck.com*), `'no-website example'`
(*For example, events.yourtruck.com*), `'guard, www inner'` (*That address has www in the middle of it.
Take the www. off the front of your web address and try again.*).
**Nothing removed** — the `'no-website question'` and `'no-website help'` strings are unchanged.

---

## 7. WHAT IS UNCHANGED

| | |
|---|---|
| **The has-website path, rendered** | ✅ **BYTE-IDENTICAL** — executed at both sources |
| The record step, both `idle` states, the closed card, the failed-provisioning state | ✅ **BYTE-IDENTICAL** — 7/7 screens |
| `lib/custom-domain/apex.ts` — both guards, `psl`, the SOA helper | ✅ **`cmp -s` BYTE-IDENTICAL** |
| `vercel.ts`, `copy.ts`, `dns.ts`, `ratelimit.ts`, `features.ts` | ✅ **not opened** |
| The plan gate, both rate limiters, all three `checkSubdomain` call sites, the SOA check | ✅ counts equal |
| The `patch` object `domain_provision` writes (1,657 chars) | ✅ **byte-identical** |
| Everything from the `addDomain` call onward | ✅ **byte-identical** |
| `app/api/manage/route.ts` | **one hunk, 19 lines, all inside the new `www_inner` branch** |

**Files changed: three.** `components/dashboard/CustomDomainSetup.tsx`, `app/api/manage/route.ts`,
`scripts/check-plain-english.mjs`.

---

## 8. WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING WAS OPENED IN A BROWSER.** Every screen above came from `react-dom/server` with
   `useState` driven by hand. **No key was typed into the field**, so the live-updating behaviour of the
   helper line is asserted from the render function, not watched.
2. 🔴 **THE SUBMISSION CHANGE IS NOT COVERED BY ANY TEST THAT WILL RUN AGAIN.** There is no test runner
   in this repo; the parity above is a one-off harness in the scratchpad. **If someone later replaces
   `domainFromWebsite` here with a bespoke parse, nothing will notice.**
3. ⚠️ **A HALF-TYPED ENTRY DISABLES THE BUTTON SILENTLY.** §3. Worth a line of copy eventually.
4. ⚠️ **`domainFromWebsite` DEPENDS ON THE BUNDLED PUBLIC-SUFFIX SNAPSHOT**, and that dependency now
   sits on the **submission** path rather than just the display path. A suffix added after the snapshot
   makes `parentOf` return the wrong registrable domain — which previously only mis-rendered a
   suggestion and now mis-builds an address. **The SOA guard is what still catches the dangerous half
   of that**, and it is unchanged. §35's permissive-failure entry applies.
5. **The `www_inner` message has never been seen by anyone**, and by design cannot be reached from the
   interface.
