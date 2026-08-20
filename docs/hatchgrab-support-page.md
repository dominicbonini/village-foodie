# /support on HatchGrab — the existing Tally form, embedded

**PROMPT INTEGRITY.** No span of the brief arrived garbled. No instruction contradicted another.

**NO STOP CONDITION FIRED** — all four checked in §2 before anything was built.

**TWO FILES CHANGED, ONE CREATED.** `app/support/page.tsx` (new, 128 lines) and
`app/landing/page.tsx` (+3 / -1). **`app/contact/page.tsx` is untouched** — verified by an empty
`git diff`. No `next dev`, no `next build`.

🔴 **NOTHING HAS BEEN RENDERED. THE EMBED HAS NOT BEEN TESTED.** See §4.

---

# 🔴 THE FINDING THAT DECIDED WHERE THIS PAGE LIVES

**`app/landing/layout.tsx` is an ADMIN-ONLY GATE in production.** Quoted in full:

```tsx
export const dynamic = 'force-dynamic'

export default async function LandingLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) {
    redirect('/')
  }
  return <>{children}</>
}
```

🔴 **A SUPPORT PAGE UNDER `app/landing/` WOULD REDIRECT APPLE'S REVIEWER TO THE DISCOVERY MAP.** They
are not an admin, `verifyAdmin()` returns false, and the Support URL is dead before a single byte of the
form ships. **This is not a styling preference — it is the difference between a working Support URL and
a broken one.**

**So `/support` is at `app/support/page.tsx`, top level, ungated — and it matches the landing page by
importing the landing's own stylesheet rather than by re-describing it.** §3 shows how.

---

# 1. PHASE 1 — READ

## 1.1 How Village Foodie embeds the Tally form — ✅ AN EMBED, NOT A LINK

**`app/contact/page.tsx`**, the relevant parts quoted verbatim:

```tsx
function ContactForm() {
  const searchParams = useSearchParams();
  const topic = searchParams.get('topic') || '';
  const venue = searchParams.get('venue') || '';
  const truck = searchParams.get('truck') || ''; // 👇 Catch the truck name

  let tallyUrl = `https://tally.so/embed/7R2Ra2?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1&topic=${encodeURIComponent(topic)}`;
  if (venue) tallyUrl += `&venue=${encodeURIComponent(venue)}`;
  if (truck) tallyUrl += `&truck=${encodeURIComponent(truck)}`;

  return (
    <iframe
      src={tallyUrl}
      loading="lazy"
      width="100%"
      height="500"
      frameBorder="0"
      title="Contact Village Foodie"
      className="w-full"
      style={{ minHeight: '500px' }}
    ></iframe>
  );
}
```

and the script, `app/contact/page.tsx:36`:

```tsx
      <Script src="https://tally.so/widgets/embed.js" strategy="lazyOnload" />
```

| | | |
|---|---|---|
| **Kind** | 🔴 **an `<iframe>` embed** — not a link. The approach the brief hoped for is the one that exists | READ |
| **Tally form id** | **`7R2Ra2`** | READ |
| **Embed base** | `https://tally.so/embed/7R2Ra2` | READ |
| **Flags** | `alignLeft=1`, `hideTitle=1`, `transparentBackground=1`, `dynamicHeight=1` | READ |
| **Script** | `https://tally.so/widgets/embed.js`, `strategy="lazyOnload"` — needed for `dynamicHeight` to resize the frame | READ |
| **How `topic` reaches the form** | read from `useSearchParams()` on OUR page, `encodeURIComponent`'d, and **appended to the Tally embed URL as a query parameter**. Tally receives it; our code only forwards it | READ |
| **Also forwarded** | `venue` and `truck`, both conditionally | READ |

## 1.2 The landing page's styling conventions

**Root wrapper** (`app/landing/page.tsx:103`) — everything is scoped under one class:

```tsx
    <div className={`hg-landing ${archivo.variable} ${publicSans.variable} ${courierPrime.variable}`}>
```

**Nav** (`:106-107`), slate background from the shared `HEADER_BG`:

```tsx
      <nav className={HEADER_BG}>
        <div className="nav-in">
```

**The conventions themselves, from `app/landing/landing.css`** — all READ:

| Convention | Value |
|---|---|
| **Container** | `.wrap { max-width: var(--max); margin: 0 auto; padding-inline: var(--gut); }` |
| `--max` | `1140px` |
| `--gut` | `clamp(1.25rem, 4vw, 2.5rem)` — 🔴 **fluid, which is what makes it work on a phone** |
| `--nav-h` | `4.5rem` fixed, `position: sticky; top: 0` |
| **h1** | `var(--display)` 800, `clamp(2rem, 4.3vw, 3rem)`, `letter-spacing: -.03em` |
| **h2** | `clamp(1.6rem, 3.2vw, 2.15rem)` |
| **`.eyebrow`** | display 700, `.75rem`, `letter-spacing: .16em`, uppercase, `var(--orange)` |
| **`.lede`** | `var(--ink-soft)`, `max-width: 50ch` |
| **`section`** | `padding: clamp(3.5rem, 7vw, 5.5rem) 0` |
| **Colours** | `--head #16314F`, `--ink #2C4766`, `--ink-soft #5F7A99`, `--orange #EF8B2C` |
| **Fonts** | Archivo (display), Public Sans (body), Courier Prime (ticket), via `next/font` → CSS vars |

🔴 **THE SHEET IS SCOPED: every rule is `.hg-landing …`.** That is what makes reuse safe — it cannot
leak, and a page that wraps itself in `.hg-landing` gets the landing's look exactly rather than
approximately.

## 1.3 Routes under the landing area, and where /support must live

`find app/landing -type f` → **three files: `page.tsx`, `layout.tsx`, `landing.css`.** There are no
sub-routes. **READ.**

**Does the landing's `noindex` apply to a support page?** `app/landing/page.tsx:32-35`:

```tsx
export const metadata: Metadata = {
  title: 'HatchGrab — The ordering system built for food trucks',
  robots: { index: false, follow: false },
}
```

⚠️ **NO — AND IT MUST NOT.** That `robots` block is **page-level metadata on `/landing`**, not
inherited by a sibling route, and its stated reason (`page.tsx:1-2`) is that the landing is a *hidden
preview*: *"HIDDEN preview route at /landing (noindex/nofollow). Root `/` is the live site, so this sits
at a hidden path until it's ready to promote."* **That reasoning is about an unfinished marketing page.
It does not transfer to a support page a reviewer must be able to open.**

🔴 **BUT THE `layout.tsx` GATE WOULD HAVE, AND IT IS FAR WORSE THAN A `noindex`** — see the headline
above. **So `/support` lives at `app/support/page.tsx`.**

## 1.4 Every contact/help/support link on the landing page today

`grep -n -i "contact\|support\|help\|mailto\|tally" app/landing/page.tsx` → **exactly one hit.**

```tsx
              <a href="#">Contact</a>
```
`app/landing/page.tsx:503`, in the footer's `.foot-links`, beside `Pricing`, `Privacy` and `Terms`.

🔴 **THAT IS THE CONTROL THAT GOES NOWHERE**, and it is the only one. There is no help link, no mailto
and no Tally reference anywhere else on the landing page. **READ.**

---

# 2. PHASE 2 — STOP CONDITIONS

| Condition | Result |
|---|---|
| **Tally cannot be embedded on a second domain without reconfiguration** | ✅ **No blocker in our code.** The embed is a plain `<iframe src="https://tally.so/embed/7R2Ra2?…">` — **nothing in it names a domain**, so the same markup works from any origin. ⚠️ **CANNOT DETERMINE whether Tally's own dashboard restricts embed domains for this form** — that is a setting in Tally, not in this repository. If it does, the symptom is a blank or refused frame and the fix is one toggle in Tally. **The first load of the deployed page settles it.** |
| **A /support route already exists** | ✅ **It did not.** `find app -ipath '*support*'` returned nothing and no route referenced `/support` |
| **Instructions contradict** | ✅ No |
| **Garbled prompt** | ✅ No |

---

# 3. PHASE 3 — WHAT WAS BUILT

## 3.a The page — `app/support/page.tsx`, new, 128 lines

**It matches the landing page by REUSING it, not by imitating it:**

```tsx
import { Archivo, Public_Sans, Courier_Prime } from 'next/font/google'
import { HEADER_BG } from '@/lib/brand'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'
import { PRIVACY_PATH, TERMS_PATH } from '@/lib/legal'
import '../landing/landing.css'
```

Same three fonts mapped to the same CSS vars, same `.hg-landing` root, same `HEADER_BG` nav at the same
`--nav-h`, same `.wrap` container at `--max`/`--gut`, same `.eyebrow` / `h1` / `.lede` type. **The
stylesheet is imported, not copied — so the two pages cannot drift.**

⚠️ **THE NAV IS DELIBERATELY SIMPLER THAN THE LANDING'S:** wordmark + a single `Log in`. The landing nav
also carries `Pricing`, an in-page anchor that does not exist here, and `DemoCta`, a client component
that requires `DemoModalProvider` and would pull the whole demo-upload modal onto a support page.
**Neither belongs on this route, and leaving them out is the smaller footprint.**

⚠️ **THE WORDMARK DOES NOT LINK.** On this domain `/` is the discovery map — a different product — and
a reviewer tapping the logo would land somewhere confusing with no way back. **The landing page's own
nav logo points at `#` for a related reason.** It renders as identity, not as a control.

🔴 **NO VILLAGE FOODIE BRANDING ANYWHERE, VERIFIED PROGRAMMATICALLY.** The landing footer's *"From the
people behind Village Foodie"* line is **not** carried across. Comments were stripped from the source
and the remainder searched for `village|foodie` case-insensitively: **0 hits in non-comment source.**
The only mentions are in explanatory comments, which never render.

## 3.b The embed — the same form, unchanged

```tsx
const TALLY_SRC =
  'https://tally.so/embed/7R2Ra2?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1&topic=General%20Enquiry'
```

**Same form id `7R2Ra2`, same four flags, same `tally.so/widgets/embed.js` script.** No new form, no
rebuilt fields.

⚠️ **`topic` IS PINNED TO `General Enquiry`** — the exact value the existing link
(`/contact?topic=General%20Enquiry`) already sends, so the form opens on a topic it is **known to
accept** rather than one invented here. The page takes no query parameters of its own; a reviewer opens
a bare URL and gets a working form.

⚠️ **THE IFRAME CARRIES `minHeight: '700px'` AS WELL AS `dynamicHeight=1`.** If `embed.js` never arrives
— a content blocker, a corporate network — the frame simply scrolls internally instead of collapsing.
**A support page must not depend on a third-party script to be operable.**

## 3.c The copy — as suggested, two sentences, landing voice

> **Support** *(eyebrow)*
> # How can we help?
> Something not working, or a question about your account? Send us a message below and we will come
> back to you by email.

Plain, second person, no marketing — matching the landing's register.

## 3.d The landing control now points at /support

```diff
-              <a href="#">Contact</a>
+              {/* 🔴 WAS `href="#"` — a control that went nowhere. Now the public support page, which is
+                  also the Support URL given to App Store review. */}
+              <a href="/support">Contact</a>
```

✅ **No interim cross-brand link existed to remove** — §1.4 found the dead `#` and nothing else.
✅ **Nothing else on the landing page changed** — the diff is those three lines.

## 3.e 🔴 INDEXABLE — what I did, and why

```tsx
export const metadata: Metadata = {
  title: 'Support — HatchGrab',
  description: 'Get help with HatchGrab. Send us a message and we will come back to you by email.',
  robots: { index: true, follow: true },
}
```

**Set explicitly rather than left to default**, so the intent is on the page and cannot be mistaken for
an oversight. **And nothing else stands in the way — each checked:**

| Gate | Result |
|---|---|
| A `middleware.ts` | ✅ **none exists** in the source tree |
| A layout above `app/support/` | ✅ **none** — `app/support/` holds only `page.tsx`, so only the root layout applies |
| The root layout | ✅ **no `redirect`, no `verifyAdmin`, no auth** — it is fonts, metadata and the PostHog provider |
| `vercel.json`'s `X-Robots-Tag: noindex` | ✅ **scoped to `/api/(.*)` and `/trucks/(.*)`. Tested both patterns against the string `/support`: neither matches** |
| The landing admin gate | ✅ **not inherited** — that is the whole reason for the location |

🔴 **SO: NO AUTH, NO TOKEN, NO GATE, NO REDIRECT, NO `noindex`.**

## 3.f Phone rendering

**No fixed pixel width appears anywhere on the page.** `--gut` is `clamp(1.25rem, 4vw, 2.5rem)`; `.wrap`
is `max-width` not `width`; the iframe is `width="100%"` with `style={{ width: '100%' }}`; the nav
inherits the landing's own `@media(max-width:639px)` rules. **READ-FROM-SOURCE, unobserved.**

## ⚠️ ONE THING I DREW AND THEN REMOVED, AND WHY IT MATTERS

I first added a fallback line — *"If the form does not load, email hello@hatchgrab.com"*. **I removed
it.** `lib/email-signup.ts:23-24` says in as many words:

```
// ⚠️ NOT LIVE YET. This mailbox must exist, and hatchgrab.com must be SPF/DKIM-verified in Brevo,
// before the first real send.
export const HATCHGRAB_REPLY_TO = 'hello@hatchgrab.com'
```

and `lib/email-config.ts:3-7` carries the matching TODO, with `HATCHGRAB_SENDER.email` still set to the
villagefoodie.co.uk address.

🔴 **PRINTING AN ADDRESS NOBODY HAS CONFIRMED RECEIVES MAIL, ON THE PAGE AN APP STORE REVIEWER IS TOLD
TO USE, IS A LABEL ASSERTING A STATE NOBODY CHECKED.** The only address proven to work today is on the
other brand's domain, and this page must carry none of it. **So the form is the only channel — which is
what the brief asked for.** A comment in the file records this so the next reader does not re-add it.
**Add a mailto the day the mailbox is confirmed.**

---

# 4. PHASE 4 — VERIFICATION

🔴 **THE EMBED HAS NOT BEEN RENDERED OR TESTED. NOTHING ON THIS PAGE HAS BEEN SEEN.** Every visual claim
below is **READ-FROM-SOURCE AND UNOBSERVED**. `tsc` was not run and would not be verification if it had
been. **The first real check is opening `https://www.hatchgrab.com/support` on the deployed site** — and
the single most likely failure is Tally refusing the frame on a new domain (§2), which shows as a blank
or refused iframe.

## What a visitor sees at /support

1. The slate HatchGrab nav at 72px, wordmark left (not a link), `Log in` right.
2. An orange `SUPPORT` eyebrow, then **"How can we help?"** in Archivo 800 at the landing's h1 scale.
3. The two-sentence intro in `.lede`.
4. **The Tally form, embedded**, full width of the 1140px container, at least 700px tall.
5. A slate footer: `Privacy` · `Terms`, and `© 2026 HatchGrab`.

✅ **REACHABLE WITHOUT LOGGING IN.** No auth of any kind touches this route — the five gates in §3.e
were each checked and none applies. The `Log in` link in the nav is an offer, not a requirement.

✅ **THE LANDING CONTROL NOW GOES THERE** — `app/landing/page.tsx:503` is `<a href="/support">Contact</a>`,
and it was the only contact control on the page.

## The executable diff and line count

```
 app/landing/page.tsx | 4 +++-
 1 file changed, 3 insertions(+), 1 deletion(-)
```

| File | Lines | Status |
|---|---|---|
| `app/support/page.tsx` | **128** | **new** |
| `app/landing/page.tsx` | 526 (was 524) | **modified, +3 / -1** |
| `app/contact/page.tsx` | 80 | ✅ **untouched — empty `git diff`** |

## What could not be verified

| | What would settle it |
|---|---|
| Whether Tally permits this form on hatchgrab.com | Open `/support` on the deployed site |
| Whether `dynamicHeight` resizes correctly at 700px | Same visit, on a phone and on desktop |
| Whether the `General Enquiry` topic value still matches a Tally option | Submit the form once and check it arrives tagged correctly |
| Whether `hello@hatchgrab.com` receives mail | Send it a test message. **Until then no address is printed** |
| That the page is actually indexed | Search Console, after deploy |

---

# 5. INTEGRITY CENSUS

Run as a **separate pass after** each write, with a byte-level tool and a carrier-aware per-base
variation-selector scanner — **never grep**. Results appended below.

## 5.1 `app/support/page.tsx` (new)

```
bytes=7844   NUL(0x00)=0   other disallowed control bytes=0   TOTAL FLAGGED=0
TAB(0x09)=0  LF(0x0A)=128  CR(0x0D)=0
```

```
    U+26A0 WARNING SIGN      bare=0  +VS16=6  +VS15=0
    U+FE0F total=6  attached to a base above=6  unaccounted=0  leading-orphan=0
```

## 5.2 `app/landing/page.tsx` (modified)

```
bytes=36647  NUL(0x00)=0   other disallowed control bytes=0   TOTAL FLAGGED=0
TAB(0x09)=0  LF(0x0A)=526  CR(0x0D)=0
    U+26A0 WARNING SIGN      bare=0  +VS16=14  +VS15=0
    U+FE0F total=14  attached to a base above=14  unaccounted=0  leading-orphan=0
```

**Characters INTRODUCED by the edit, measured against the pre-change copy:**

```
  distinct non-ASCII classes before=19  after=19  NEW CLASSES INTRODUCED = none
    U+2014 EM DASH            60 -> 61  (+1)
    U+1F534 LARGE RED CIRCLE   7 ->  8  (+1)
```

⚠️ **NO NEW CHARACTER CLASS WAS ADDED TO THE LANDING PAGE.** Both already occur in it; the edit adds one
instance of each, inside the new comment.

## 5.3 This report

```
bytes=15733  NUL(0x00)=0   other disallowed control bytes=0   TOTAL FLAGGED=0
TAB(0x09)=0  LF(0x0A)=344  CR(0x0D)=0
    U+26A0 WARNING SIGN      bare=0  +VS16=8  +VS15=0
    U+FE0F total=8  attached to a base above=8  unaccounted=0  leading-orphan=0
```

## 5.4 Across all three

**0 NUL bytes. 0 other disallowed control bytes. 0 tabs. 0 CR — LF throughout.**

**NO BASE IS SPLIT ACROSS BOTH CARRIERS IN ANY FILE.** U+26A0 — the only base present whose default
presentation is text — is paired with U+FE0F on **every** occurrence (6 + 14 + 8 = 28) and bare on
**none**. Every other emoji-presentation base is bare on every occurrence with no selector attached, and
every U+FE0F in every file is accounted for by an immediately preceding U+26A0, with none orphaned and
none leading a file.

⚠️ **FIXED-POINT NOTE.** Appending this section changed the report it describes, so its byte and line
figures above are from the pass taken after the body was written. A final pass over the completed file
is reported here in ASCII so it cannot move them again: **NUL = 0, other disallowed control bytes = 0,
tabs = 0, CR = 0**, the distinct non-ASCII set is unchanged, and the per-base carrier result is
identical — U+26A0 paired on every occurrence and bare on none.
