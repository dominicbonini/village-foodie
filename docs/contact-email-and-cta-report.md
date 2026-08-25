# Contact — an email address, and the secondary CTA's label

**Date:** 25 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` not run by me.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

🔴 **ONE THING YOU NEED TO DECIDE, AND ONLY YOU CAN: the address I was asked to add is the one this
codebase removed on purpose, with a written reason that is still in the tree. §2.2. I built it as
asked and I am not going to let it pass quietly.**

---

# §1 — TASK 0: WHAT IS ALREADY THERE

## 1.1 🔴 IS AN EMAIL ADDRESS ALREADY SHOWN? — **NO, AND ITS ABSENCE WAS DELIBERATE**

Neither render printed one. `app/contact/HatchGrabContact.tsx` carried a block whose heading was:

> 🔴 **A FALLBACK EMAIL ADDRESS WAS DRAFTED ON /support AND REMOVED. IT STAYS REMOVED.**
> *"`hello@hatchgrab.com` is the obvious candidate, and lib/email-signup.ts:23 says in as many words
> that it is NOT usable yet … Printing an address nobody has confirmed receives mail — on the page an
> App Store reviewer is told to use — is a label asserting a state nobody checked … Add a mailto here
> the day the mailbox is confirmed."*

## 1.2 ✅ DOES THE FORM CARRY A TOPIC OR SOURCE PARAMETER? — **YES. THE MECHANISM EXISTS.**

`app/contact/ContactForm.tsx`:

```tsx
const topic = searchParams.get('topic') || ''
const venue = searchParams.get('venue') || ''
const truck = searchParams.get('truck') || ''
let tallyUrl = `https://tally.so/embed/7R2Ra2?…&topic=${encodeURIComponent(topic)}`
```

✅ **One component, both brands.** Values already in use across the app, which set the convention —
Title Case, `%20`-encoded:

```
   General%20Enquiry  ×5      Add%20Business  ×4      Report%20Issue  ×1      ClaimVenue  ×1
```

## 1.3 ✅ IS THE PAGE GATED? — **PUBLIC AND UNGATED, ON BOTH HOSTS**

**How I established it, independently of the file's own comment:**
1. The route is `app/contact/`, **top level** — not under `app/landing/`, whose `layout.tsx` is the
   admin gate.
2. **`proxy.ts` does not match `/contact`.** Its `operatorPaths` list is
   `['/dashboard','/manage','/kds','/login','/forgot-password','/reset-password','/admin']` — `/contact`
   is absent, so the Village-Foodie→HatchGrab redirect does not touch it; `isProtected` covers only
   `/dashboard` and `/manage`; and the root rewrite is guarded on `pathname === '/'`.
3. Confirmed live this session, anonymously: `HEAD https://www.hatchgrab.com/login` → **200**, and the
   `/manage` probe 307'd while nothing in that chain touched `/contact`.

⚠️ **This is the Support URL given to App Store review** — `https://www.hatchgrab.com/contact`.

---

# §2 — TASK 1: THE EMAIL

## 2.1 THE EXACT WORDING AND PLACEMENT

```tsx
<p className="lede mt-6">
  Or just email us at{' '}
  <a href="mailto:hello@hatchgrab.com">hello@hatchgrab.com</a>
</p>
```

**Rendered: “Or just email us at hello@hatchgrab.com”** — directly under the form, framed as an
alternative, not a fallback.

✅ **NO NEW VISUAL STYLE.** `lede` is the class the paragraph *above* the form already uses; `mt-6` is
the page's own spacing step. **No box, no colour, no icon, no border.** The link inherits the landing
stylesheet's anchor treatment rather than declaring one.

✅ **THE FORM IS UNTOUCHED.** `app/contact/ContactForm.tsx` is **byte-identical as a whole file** (3,028
bytes) — fields, Tally id, the five flags, all three query parameters, submission handling. The
`<Suspense>`/`<ContactForm>` call in `HatchGrabContact.tsx` is byte-identical too. **The email is an
addition; nothing was replaced.**

## 2.2 🔴 THE CONCERN, STATED PLAINLY — I BUILT IT, BUT READ THIS

The codebase's own record still says this mailbox is not live:

```
  lib/email-signup.ts:23   ⚠️ NOT LIVE YET. This mailbox must exist, and hatchgrab.com must be
                              SPF/DKIM-verified in Brevo, before the first real send.
  lib/email-config.ts:4    TODO: When hello@hatchgrab.com is set up in Brevo with SPF/DKIM, update
                              HATCHGRAB_SENDER.email … Until then, emails send from
                              hello@villagefoodie.co.uk
  HATCHGRAB_SENDER         { email: 'hello@villagefoodie.co.uk', replyTo: 'hello@villagefoodie.co.uk' }
```

🔴 **IF THAT IS STILL TRUE, AN APP STORE REVIEWER'S EMAIL GOES NOWHERE** — on the page Apple was
given, during a review that is already answering a Guideline 2.1 rejection.

✅ **BUT THOSE COMMENTS ARE DATED 10 AUGUST AND ONE FACT ALREADY CONTRADICTS THEM:**

```ts
export const HATCHGRAB_REPLY_TO = 'hello@hatchgrab.com'   // lib/email-signup.ts:25
```

**That is exported and set as the reply-to on the signup emails, so replies to those are ALREADY being
directed to this address.** Either the mailbox works and the comments are stale, or it does not and
signup replies have been going nowhere too.

🔴 **I CANNOT CHECK A MAILBOX AND I HAVE NOT PRETENDED TO.** You asked for the address and you own it.
**Send one test message to hello@hatchgrab.com before this deploys.** If it arrives, the two stale
comments in `lib/` should be cleared — **out of scope here, so I have not touched them.**

⚠️ **The comment at the site now records all of this**, including that the previous decision was
reversed by you and that the two `lib/` comments were not verified.

## 2.3 ✅ HATCHGRAB RENDER ONLY — A DECISION I MADE

`/contact` is one route serving two brands off the `Host` header. **I added the address to the HatchGrab
branch alone.**

`app/contact/page.tsx` states the Village Foodie render is *"unchanged, character for character"* by
design, and a `hatchgrab.com` address on a Village Foodie page is **the exact branding leak the split
exists to remove**. ⚠️ **If you want it on the Village Foodie page too, that is a different address
(`hello@villagefoodie.co.uk`, the one proven to work) and a separate instruction.**

---

# §3 — TASK 2: THE LABEL

**"Talk to us" → "Ask us a question".** The reasoning is recorded at the site, including the rejected
alternative: **"Talk to us" implies a phone number we do not publish; "Chat to us" implies live chat we
do not have.** The new label describes what the operator would do and promises nothing about channel or
speed — which matters more here than on the landing, because the destination is a form plus an email
address, not a person.

## 3.1 ✅ AT 375px THEY STACK — AND THAT IS NOT A CALCULATION

You asked me to say plainly which kind of claim this is. **It is neither an estimate nor unobserved: it
is read directly off the class list.**

```
  <div className="flex flex-col gap-2 p-4 sm:flex-row sm:gap-3">
```

🔴 **`flex-col` below `sm` (640px) means each CTA is a full-width block on its own line.** There is no
horizontal fit question at 375px at all — a longer label cannot overflow a row it does not share.

## 3.2 THE SIDE-BY-SIDE CASE ≥640px — **THIS ONE IS A CALCULATION**

Arithmetic on assumed glyph advances at `text-lg`, not a measurement. Each CTA is `flex-1`, so ~276px at
a 640px viewport (~292px at the `max-w-2xl` ceiling):

```
   "Ask us a question"                141 + 48 px-6 = 189px   FITS, 87px spare
   "Talk to us"          (the old)     79 + 48       = 127px   FITS
   "Start free →"                     102 + 48       = 150px   FITS
   "Start free and save £1,436 →"     241 + 48       = 289px   over by ~13px
   "Start free and save £15,060 →"    252 + 48       = 300px   over by ~24px
```

✅ **MY CHANGE CAUSES NO WRAPPING — 87px of spare at the tightest width.**

🔴 **BUT THE PRIMARY CTA IS ESTIMATED TO WRAP, AND THAT IS PRE-EXISTING.** It is byte-identical to
before this change; the figure it interpolates is what makes it long. **I am reporting it rather than
fixing it, because the primary CTA is out of scope for this brief.** ⚠️ Inside the ±12px error bar for
the smaller figure; the £15,060 fleet case is over on any plausible version of the model.

---

# §4 — TASK 3: THE SOURCE PARAMETER

✅ **THE MECHANISM EXISTED, SO I USED IT AND BUILT NOTHING.**

```
  /contact  →  /contact?topic=Cost%20Comparison
```

`ContactForm` already reads `topic` and passes it to the Tally embed (§1.2). **Title Case, `%20`-encoded,
matching the four values already in use.** An enquiry from the comparison page is now identifiable in
Tally without adding a field to the form.

✅ **No new parameter, no new route, no change to `ContactForm.tsx`.**

---

# §5 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Contact form fields + submission | **whole-file byte compare** of `ContactForm.tsx` | ✅ **identical, 3,028 bytes — untouched** |
| The `<ContactForm>` call site | full span | ✅ **byte-identical** |
| Contact heading + lede, footer | full spans | ✅ **byte-identical** |
| `HatchGrabContact.tsx` change | comment-stripped diff | ✅ **0 code lines out, 4 in** |
| `CostComparison.tsx` change | comment-stripped diff | ✅ **2 code lines out, 2 in** |
| Cost hero panel | full span to `{heroVerb}` | ✅ **byte-identical** |
| The memo | `useMemo(` → deps array | ✅ **byte-identical** |
| **The primary CTA** | full `<a href="/signup">` span | ✅ **byte-identical** |
| Figure, verb, percentage line, anchor | forward windows | ✅ **identical** |
| Detail card | 700-char forward window | ✅ **identical** |
| The cream footer | 120-char forward window | ✅ **identical** |
| No grid / width token | scan of the CTA row **and** the mailto block | ✅ **NONE in either** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not verification** |

---

# §6 — WHAT REMAINS UNOBSERVED

1. 🔴 **WHETHER hello@hatchgrab.com RECEIVES MAIL** (§2.2). Not a rendering question and not one I can
   answer from a repository. **Send a test before this deploys.** It is the only item here with a
   consequence beyond the page.
2. 🔴 **NEITHER PAGE HAS BEEN RENDERED.** The mailto has never been seen, and I have not confirmed that
   `lede` on a paragraph *below* the form spaces the same way it does above it — the form is a 700px
   iframe, so what sits under it has never had anything under it before.
3. ⚠️ **The anchor's appearance is inherited from `landing.css`, not declared.** If that sheet gives
   anchors no distinct treatment inside `.hg-landing`, **the address may not look clickable.** I did not
   add a class, because you said not to introduce a new visual style — **but that is the trade, and it
   is one look to settle.**
4. ⚠️ **The Tally form has not been opened with `?topic=Cost%20Comparison`.** The parameter is passed
   the same way four shipping links pass theirs, but **whether "Cost Comparison" is a value the Tally
   field accepts, or shows as free text, is unverified** — the other four values were presumably chosen
   to match options in that form and this one was not chosen from it.
5. ⚠️ **The primary CTA's estimated wrap at the breakpoint** (§3.2) — pre-existing, out of scope,
   unmeasured.
6. ⚠️ **Carried forward on the cost page:** the panel rebalance never rendered, the segmented toggle's
   wrap, the scroll cue's landing position, and the pricing gate, which has still never fired.
