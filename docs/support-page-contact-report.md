# Support page — email address promoted above the form

**Built. Not deployed, not committed. No SQL, no migrations. One file changed:
`app/contact/HatchGrabContact.tsx`. Nothing outside it.**

**VERIFICATION.** I am **not** offering the typecheck as verification (it passes; it proves compilation).
**I rendered this page in Chromium and measured it** at 390×844, 375×667, 320×568 and 1280×900, on a
hatchgrab host (`http://hatchgrab.127.0.0.1.nip.io:3000/contact`) because the HatchGrab render only
exists on one. Every number below is a live `getBoundingClientRect`, taken **twice at each width** — once
with the new block hidden to establish the "before" — so the deltas are measured, not derived.

**GARBLED SPANS: none.** **One instruction pair needed care rather than a stop** — see §4: item 3 asks the
copy to "make clear that either route reaches the same place", and item 4 says that if they go to
different places the copy must not imply otherwise. Item 4 governs, and it turns out I **cannot establish
either way from the code**, so I have written copy that is true regardless and flagged it for you. That
is item 4 doing its job, not a contradiction.

🔴 **THE WORDING BELOW IS PROVISIONAL, PENDING YOUR APPROVAL, as item 3 requires.** It is in the file so
it could be measured — measurement was the only way to answer item 6 — but treat it as a draft.

---

## 1. The page: file, route, who reaches it

| | |
|---|---|
| **File** | `app/contact/HatchGrabContact.tsx` — the HatchGrab render |
| **Reached via** | `app/contact/page.tsx`, which branches on the `Host` header (`isHatchGrabHost`) and `await import()`s this module on the HatchGrab branch only |
| **Route** | **`/contact`** on a hatchgrab host. ⚠️ **`/support` does not exist** — it was deleted on 20 August 2026 and this file is where its body went (`HatchGrabContact.tsx:2-3`) |
| **Gated?** | 🟢 **No. Fully public.** No auth check, no admin gate, no token. A logged-out visitor reaches it directly |
| **Indexed?** | **Yes, deliberately** — `robots: { index: true, follow: true }` on the HatchGrab branch (`page.tsx:58`) |

### 🔴 Who actually lands here — three routes matter more than the link list

1. **Every non-admin visitor to hatchgrab.com.** `app/landing/layout.tsx:45` redirects them here in
   production. **This page is what the public sees on that domain**, and the landing page is not.
2. **App Store review.** This is the **Support URL given to Apple** (`page.tsx:3`, and the note at
   `HatchGrabContact.tsx`). A reviewer's message arriving nowhere is the stated stake.
3. **Operators from the landing footer** — `components/landing/LandingFooter.tsx:102`,
   `/contact?topic=General%20Enquiry`.

### Every link to `/contact` in the repo

| Where | Link |
|---|---|
| `components/landing/LandingFooter.tsx:102` | `?topic=General%20Enquiry` |
| `app/landing/cost/CostComparison.tsx:845` | `?topic=Cost%20Comparison` |
| `app/(legal)/layout.tsx:105` | bare `/contact` |
| `components/legal/LegalPage.tsx:42` | bare `/contact` |
| `components/Footer.tsx:35,39,43` | `General Enquiry` / `Add Business` / `Report Issue` |
| `app/trucks/[slug]/TruckClient.tsx:192,301,327` | `?topic=Add%20Business&truck=…` |
| `app/venues/[slug]/VenueClient.tsx:150` | `?topic=ClaimVenue&venue=…` |

⚠️ **Most of those are Village Foodie surfaces**, and on villagefoodie.co.uk they render the *other*
branch of `page.tsx` — which does **not** contain the email address and is not touched by this change.
**Only visitors on a hatchgrab host see what I changed.**

---

## 2. What I changed, and how the page reads now

**Top to bottom, after:**

```
[nav: HatchGrab wordmark · Log in]

  SUPPORT                                    ← .eyebrow, unchanged
  How can we help?                           ← <h1>, unchanged
  Something not working, or a question about your account?
  Two ways to reach us — either way we will come back to you by email.

  ─────────────────────           ─────────────────────      ← two options, side by side
  Email us                        Or fill in the form below     at >=760px, stacked below
  hello@hatchgrab.com — best
  if you want to attach a
  screenshot.

  [ the Tally form ]                         ← unchanged embed, same id, same params

[footer: Privacy · Terms · © 2026 HatchGrab]
```

**The edits, all in `app/contact/HatchGrabContact.tsx`:**

1. **The `lede` rewritten** to introduce two routes instead of pointing at the form.
2. **A two-option block added above the form**, using `.does` / `.does-item`.
3. **The trailing "Or just email us at…" paragraph removed** — moved, not deleted. **Its original
   25-August note is preserved verbatim in place**, as with the footer reversal, because the reasoning
   is still the reasoning.
4. **The mailto underlined inline** — see §7, this fixes a measured defect.

### 🟢 No new CSS, and that was a constraint not a convenience

Item 8 says change nothing outside the page — and `app/landing/landing.css` is **shared with the landing
page**. So the two-up layout reuses `.does` / `.does-item` (`landing.css:247-251`), which the landing
already uses for exactly this shape: one column, two at ≥760px, with the navy border-top accent.

⚠️ **The one inline style (`marginBottom: 1.5rem`) is not laziness.** `.hg-landing * { margin: 0 }`
(`landing.css:77`) beats a Tailwind `mb-*` utility on source order — the same trap that left an
`mx-auto` doing nothing in the footer. An inline style is the only thing that wins without adding a rule
to a sheet this task must not touch. (It also means the old paragraph's `mt-6` was **probably inert**.)

---

## 3. Proposed wording — for your approval

> **How can we help?**
>
> Something not working, or a question about your account? Two ways to reach us — either way we will
> come back to you by email.
>
> **Email us**
> hello@hatchgrab.com — best if you want to attach a screenshot.
>
> **Or fill in the form below**

**Choices I made, and why:**

- **"either way we will come back to you by email"** — this is the expectation, and it is **not new**:
  the page already said *"we will come back to you by email"*. I am not inventing a commitment, and
  **no response time is stated**, as instructed.
- 🔴 **It does NOT say both routes reach the same place.** See §4 — I cannot establish that, so I will
  not write it. **If you confirm Tally delivers to `hello@hatchgrab.com`,** the honest sentence is one
  word longer: *"Two ways to reach us — both land in the same inbox, and either way we will come back
  to you by email."* Say the word and I will add it.
- **"best if you want to attach a screenshot"** — a real reason to pick email over a web form, rather
  than filler.
- 🔴 **The second option has no description sentence, and that is a measured decision.** At 320×568
  every line pushes the form down; a sentence saying "the form is below" costs ~38px of a 568px viewport
  to say what the reader can already see. See §6.
- **The copy is deliberately tight** — my first draft was ~90px taller and put the form **completely
  below the fold at 320px**. §6 has the numbers.

---

## 4. 🔴 What the form actually does — and the finding

**It is a third-party Tally embed. Nothing in this repository receives it.**

`ContactForm.tsx:44`:
```
https://tally.so/embed/7R2Ra2?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1&topic=…
```

| Question | Answer, from the code |
|---|---|
| **Where does it send?** | **Tally's servers**, form id `7R2Ra2`. Not our infrastructure. The submission never touches our API — I grepped: there is no route, handler or webhook in this repo for it |
| **To what address?** | 🔴 **NOT KNOWABLE FROM THIS REPOSITORY.** Tally's notification recipient is configured in Tally's dashboard. There is no config, env var or constant for it here |
| **Does the sender get a confirmation?** | 🔴 **NOT KNOWABLE FROM THIS REPOSITORY** — also a Tally-side setting |
| **What if the send fails?** | 🔴 **We cannot detect it, report it, or recover it.** It is a cross-origin `<iframe>`; our code has no error handling and no visibility into the submission. If Tally is down, or the iframe is blocked (third-party iframes are a common ad-blocker target), the visitor sees an empty or broken frame and **our page says nothing**. `minHeight: 700px` only preserves a scrollable frame if Tally's *resize* script fails — a different failure |

### The finding, stated plainly

**I cannot establish that the form and the email address reach the same place.** They may well — but that
is a Tally dashboard setting, and asserting it from here would be asserting a state I have not read.
**Per your item 4, the copy therefore does not imply they do.**

**Two things worth doing, neither of which is a code change:**

1. **Send a test through the form and see where it lands.** If it is `hello@hatchgrab.com`, tell me and
   I will add the one-clause sentence in §3.
2. ⚠️ **Consider recording the answer in the manual.** Right now the destination of every support
   message this business receives is knowable only by logging into Tally. That is a single point of
   knowledge, on the Support URL given to Apple.

---

## 5. The email address — correct, and live

**`hello@hatchgrab.com` is the right address, and it is confirmed live.**

- `docs/reference-manual.md:20761` — **READ**: *"`privacy@hatchgrab.com` and `hello@hatchgrab.com` are
  **LIVE AND TESTED as receiving**."*
- `privacy@hatchgrab.com` is **not** right for this page — it is the data-protection address, named in
  the privacy policy (`content/legal/privacy-policy.md:22,143,145,173`) for subject-access and deletion
  requests. General support belongs on `hello@`.
- **No `support@hatchgrab.com` exists.** I grepped the whole repository: zero occurrences.

### ⚠️ A stale comment, reported not edited

`lib/email-signup.ts:23` still reads:

> `// ⚠️ NOT LIVE YET. This mailbox must exist, and hatchgrab.com must be SPF/DKIM-verified in Brevo,`

**That contradicts the manual and is stale.** `lib/email-config.ts:4` carries a matching TODO. **Both are
outside this page**, so per item 8 I have **not touched them** — but they are the kind of stale comment
that made this page's address get removed once already. Worth a one-line correction in a separate change.

### Should a support-specific address exist?

**Not yet, and I would not create one now.** `hello@` is live, tested, already the reply-to on signup
emails (`HATCHGRAB_REPLY_TO`), and already published as the App Store Support URL contact. A second
address is another mailbox to monitor for a business at this stage, and the failure mode — mail arriving
somewhere nobody watches — is worse than the tidiness gained. Revisit when volume justifies it.

---

## 6. 🔴 Mobile — MEASURED, and the 320px case needs your decision

Every figure is the **top edge of the form's iframe** against the viewport height.

| Viewport | Form top BEFORE | Form top AFTER | Pushed down | Form visible without scrolling | Above the fold? |
|---|---|---|---|---|---|
| **1280×900** desktop | 349.8 | 445.9 | +96.1 | **454px** | ✅ comfortable |
| **390×844** iPhone 12/13/14 | 325.8 | 518.0 | +192.2 | **326px** | ✅ comfortable |
| **375×667** iPhone SE 2022 / 8 | 325.8 | 518.0 | +192.2 | **149px** | ✅ fine |
| **320×568** iPhone SE 1st gen | 350.6 | 542.8 | +192.2 | **25px** | ⚠️ **technically yes — but only just** |

**No horizontal overflow at any width.** The two options are **side by side at ≥760px** (block height
72px) and **stacked below it** (168px).

### The honest answer on 320×568

**My first draft failed your constraint outright** — form top at **655.2px in a 568px viewport**, i.e.
**completely below the fold, 0px visible.** I tightened the copy (shorter lede, shorter email line, no
description on the second option, 1.5rem instead of 2.6rem below the block), which recovered **112px**.

**The form's top edge is now above the fold at 320px — by 25 pixels.** I am not going to dress that up:
**25px is a sliver.** The heading "Or fill in the form below" is the last thing comfortably visible, and
the form itself begins right at the bottom edge. It satisfies the letter of your constraint and only
just its spirit.

**For context, not as an excuse:** at 320×568 the form was already only 217px visible *before* this
change — the page was tight there already. 320×568 is the iPhone SE 1st gen / iPhone 5; the smallest
current iPhone is 375×667, where this is comfortable.

**Options, if 25px is not enough for you:**

| Option | Effect | |
|---|---|---|
| **Leave as built** | Form top above the fold at every width tested; 25px at 320 | ✅ **My recommendation** — the change you asked for, delivered, and no real device in current use is worse than 375×667 |
| Drop the "Email us" description | ~+38px of form at 320 | Loses the one reason to pick email; the option becomes an unexplained address |
| Shorten the lede to one sentence | ~+25px | Loses "we will come back to you by email" — the expectation you asked for |
| Options side by side on mobile too | ~+90px | 🔴 At 320px each column is ~140px and `hello@hatchgrab.com` is wider than that. **Would overflow.** Not viable |

**Recommending the first. Not deciding it.**

---

## 7. The mailto — and a defect I found while moving it

**It was already a `mailto:` before this change** (`href="mailto:hello@hatchgrab.com"`), carried across
unchanged. Item 7's first half needed no work.

### 🔴 But it did not look like a link, and I measured that

`.hg-landing a { color: inherit }` (`landing.css:78`), and nothing gives it a decoration. Computed style,
read from the live page:

```
mailto colour : rgb(95, 122, 153)
body  colour : rgb(95, 122, 153)      ← identical
decoration   : none
```

**The address was rendering as plain body text.** That was survivable as a throwaway line under the form;
it is not survivable as one of the two things the page now offers. **I added `textDecoration: 'underline'`
inline** — inline because the fix must not add a rule to the shared landing sheet. Verified underlined in
the live render, and it adds no height (form top unchanged at 542.8 / 518.0).

⚠️ **This is the one thing I changed that you did not explicitly ask for.** It is one property on the
element I was already moving, and I would rather flag it than have you find it. Say so and I will drop it.

### Should a subject line be prefilled?

**Yes — and I have deliberately NOT added it**, because it changes what lands in your mailbox and that is
your call, like the wording.

**Recommended:** `mailto:hello@hatchgrab.com?subject=HatchGrab%20support`

- **For:** every message arrives with a consistent, filterable subject; it distinguishes support mail
  from the signup-email replies that already land in `hello@` via `HATCHGRAB_REPLY_TO`; and it removes a
  small decision from someone already having a problem.
- **Against:** some clients render a prefilled subject awkwardly, and a sender who overwrites it costs
  you nothing — so the downside is close to zero.
- ⚠️ **Do not prefill a body.** A pre-written body is the thing people delete, and it wastes the first
  line of their message.

---

## 8. Scope

**One file changed: `app/contact/HatchGrabContact.tsx`** (+69 / −24).

Verified untouched: `app/contact/page.tsx`, `app/contact/ContactForm.tsx` (**the form embed, its id, its
five flags and its three query parameters are all byte-identical**), `app/landing/landing.css`,
`lib/email-signup.ts`, `lib/email-config.ts`, the legal content, and the Village Foodie branch of
`/contact`.

The nav, the footer, the Tally embed and the page's `.eyebrow` / `<h1>` are all unchanged.

---

## What I need from you

1. **Approve or amend the wording in §3.**
2. **Does the Tally form deliver to `hello@hatchgrab.com`?** (§4) — if yes, I will add the "both land in
   the same inbox" clause.
3. **Is 25px of form above the fold at 320×568 acceptable?** (§6) — I recommend yes.
4. **Prefill the subject line?** (§7) — I recommend yes.
5. **Keep the underline?** (§7) — the one unrequested change.
