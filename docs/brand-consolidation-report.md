# Brand consolidation — the HatchGrab mark on two customer surfaces

**Built. NOT deployed, NOT committed. No SQL, no migrations.**
**Changed by this task: `app/layout.tsx`, `app/globals.css`, `app/trucks/[slug]/order/page.tsx`,
`app/trucks/[slug]/TruckClient.tsx`.**

⚠️ **SCOPE NARROWED MID-TASK, BY YOU, AND THE NARROWING RESOLVED A CONTRADICTION I WAS ABOUT TO RAISE.**
The original brief said "customer-facing surfaces" while item 6 forbade changing the domain — and
branding here is **derived from the host** (`lib/brand.ts:55` `getBrandFromHost`), so "replace VF on
customer surfaces" without touching the domain would have meant deleting the Village Foodie brand
outright. **Your clarification — the order form and the event calendar, on hatchgrab.com only — is
exactly the change the architecture already supports.**

---

## VERIFICATION

**EXECUTION.** The `data-brand` attribute was verified in the **server-rendered HTML under both hosts**,
and the CSS selectors were verified in a browser.

🔴 **END-TO-END ON THE DEV SERVER IS UNVERIFIED, AND I AM NOT GOING TO PRETEND OTHERWISE.** The running
dev server (pid 12179, up 1h57m) is **serving a stale CSS chunk** — hash `28bc9c2a`, unchanged after
editing and touching `globals.css`, with `grep brand-mark` returning **0** in the served stylesheet while
`--background` from the same file **is** present. **The rendered page therefore still shows both marks.
A dev-server restart would settle it; I have not killed your process.**

**No span of the prompt arrived garbled.**

---

# PART 1 — THE ENUMERATION

**Where a customer can meet Village Foodie branding. `grep` found 70 occurrences across 96 files; these
are the customer-reachable ones.** ✅ = changed by this task.

## Surfaces (what a browser renders)

| # | Surface | File | What shows | Kind |
|---|---|---|---|---|
| ✅ **1** | **Customer ORDER FORM** header | `app/trucks/[slug]/order/page.tsx:4225` | VF logo, `bg-slate-900` header, *"always visible"* | **Asset** |
| ✅ **2** | **Truck SCHEDULE / event calendar** header | `app/trucks/[slug]/TruckClient.tsx:123` | VF logo, identical header | **Asset** |
| 3 | Discovery map (home) | `app/page.tsx:194` | VF logo 200×60 | Asset |
| 4 | Truck directory | `app/trucks/page.tsx:37,52` | VF logo + *"the Village Foodie network"* | Asset + string |
| 5 | Venue page | `app/venues/[slug]/VenueClient.tsx:105` | *"← Back to Village Foodie"* | String |
| 6 | Embed (operator's own site) | `app/embed/[slug]/EmbedSchedule.tsx` | Deliberately chrome-less | — |
| 7 | Custom-domain schedule | `app/domain/page.tsx:80-86,166` | One VF logo; title would read *"… \| Village Foodie"* | Asset + config |
| 8 | Event / truck cards | `components/EventListCard.tsx:161`, `TruckListCard.tsx` | WhatsApp copy *"I found you on Village Foodie 🚚"* | String |

## Titles, meta, share images, manifest, icons

| # | Item | File | What | Kind |
|---|---|---|---|---|
| 9 | Page titles + description | `app/layout.tsx:26-30` | `siteName` = VF on any non-hatchgrab host; template `%s \| Village Foodie` | **Config (host-derived)** |
| 10 | OG / Twitter images | `app/layout.tsx:40+`, `public/og.image.png` (232 KB, **9 Mar**) | The share card | Asset |
| 11 | `metadataBase` | `app/layout.tsx` | `villagefoodie.co.uk` vs `hatchgrab.com` | Config |
| 12 | Manifest | `public/manifest.json` | `name: "Village Foodie Kitchen"` | **String — one manifest for both hosts** |
| 13 | Favicons / touch icons | `public/favicon.ico`, `public/icons/*` | HatchGrab bolt **already** | Asset |

## Printed / encoded / sent

| # | Item | File | What | Kind |
|---|---|---|---|---|
| 14 | **QR poster** | `lib/generateQRCode.ts:250` | *"Powered by HatchGrab"* — **already HatchGrab** | Asset + string |
| 15 | **Customer emails** | `lib/email-config.ts:16-18` | Sender name **`Village Foodie`** | **Config — item 2** |
| 16 | Cuisine / util copy | `lib/cuisines.ts`, `lib/utils.ts` | Incidental references | String |

---

# PART 2 — EXPENSIVE OR IMPOSSIBLE. HELD, NOT CHANGED.

| Thing | Why it is held |
|---|---|
| 🔴 **QR codes already printed** | A poster in a truck window encodes a URL. **Changing the domain would invalidate every printed code.** ⚠️ The poster already says *"Powered by HatchGrab"*, so the printed artefact is not the problem — **the encoded URL is** |
| 🔴 **The customer email sender identity** | `lib/email-config.ts` sends as **`Village Foodie`**. Changing it needs **DNS: SPF/DKIM for the new sending domain**, and until it propagates **customer email deliverability is at risk**. Held under item 6 |
| 🔴 **OG images already cached** | Facebook, WhatsApp and X cache share cards for days to weeks. A new image does **not** refresh existing shares; each platform's debugger must be poked per URL |
| 🔴 **The domains** | `villagefoodie.co.uk` and `hatchgrab.com`. Held under item 6 — and your clarification makes them unnecessary |
| 🔴 **App store listings** | Name, icon and screenshots on both stores. **A Play review is in progress; touching it restarts the queue** |
| ⚠️ **`public/manifest.json`** | `name: "Village Foodie Kitchen"` — **ONE manifest serves BOTH hosts**, so changing it renames the PWA on villagefoodie.co.uk too. **A host-aware manifest route would be needed. Not done** |

---

# PART 3 — SHARED SURFACES. THE SPREAD YOU HAVE HIT THREE TIMES.

| Shared thing | Serves | What I did |
|---|---|---|
| 🔴 **`app/layout.tsx`** | **Every page — operator and customer** | ⚠️ **I TOUCHED IT.** One added attribute, `data-brand`, from the `host` the file **already reads** ("🔴 READ ONCE, HERE"). **Additive: nothing reads it but the two customer surfaces, and no operator surface changes appearance.** Flagging because it is shared |
| 🔴 **`app/globals.css`** | Every page | ⚠️ **I TOUCHED IT.** Two rules scoped to `.brand-mark-vf` / `.brand-mark-hg`, **classes that exist nowhere else in the repo** |
| **`components/shared/AppHeader.tsx`** | **Operator** manage + dashboard | ✅ **NOT TOUCHED** — it is operator-only and already HatchGrab |
| **`lib/brand.ts`** | Both | ✅ **NOT TOUCHED** — see Part 4 |
| **`public/logos/village-foodie-logo-v2.png`** | Surfaces 1-4, 7 | ✅ **NOT TOUCHED** — still the VF mark, still correct on villagefoodie.co.uk |
| **`lib/generateQRCode.ts`** | Operator-generated, customer-scanned | ✅ Already HatchGrab |

---

# PART 4 — WHAT VILLAGE FOODIE HAS THAT HATCHGRAB DOES NOT

**Named as gaps rather than substituted with something that does not exist:**

1. 🔴 **A consumer VOICE.** `layout.tsx:27-29`: VF is *"Find local food trucks and pop-ups visiting
   villages near you"*; HatchGrab is *"The food truck management platform"*. **HatchGrab has no
   customer-facing description.** Anything customer-facing that adopts the HatchGrab name currently
   inherits copy written for operators.
2. 🔴 **A DISCOVERY product.** `components/shared/BrandHomeLink.tsx:12`: *"`/` is the Village Foodie
   DISCOVERY MAP — a different product, not a HatchGrab page."* **The map, the directory and venue pages
   are VF's reason to exist. HatchGrab has no equivalent.**
3. ⚠️ **A logo lockup for light backgrounds in a customer context.** HatchGrab has four wordmark variants,
   but the customer headers here are `bg-slate-900`, so only the **white** variant applies. **No customer
   light-background lockup has been designed.**
4. ⚠️ **A share image.** `public/og.image.png` is the VF card. **There is no HatchGrab OG image.**
5. ✅ **Colour is NOT a gap.** `lib/brand.ts:52-53` defines `#EF8B2C` and `#16314F` from the artwork.
6. 🔴 **A finding while enumerating:** `lib/brand.ts:11` still says
   `logo: '/logos/village-foodie-logo-v2.png', // temporary — replace when HatchGrab logo exists`.
   **The HatchGrab wordmark now exists** (`HATCHGRAB_WORDMARK_SVG`, line 30 of the same file), **so that
   comment is stale and `BRANDS.HATCHGRAB.logo` is wrong.** **Not fixed — `lib/brand.ts` is shared and
   outside this scope.**

---

# PART 5 — WHAT CHANGED, AND WHAT A CUSTOMER NOW SEES

| File | Change |
|---|---|
| **`app/layout.tsx`** | `<html lang="en" data-brand={brand}>`, from the `host` already read. One attribute |
| **`app/globals.css`** | Two rules: `html[data-brand="hatchgrab"] .brand-mark-vf {display:none}` and `html:not([data-brand="hatchgrab"]) .brand-mark-hg {display:none}` |
| **`app/trucks/[slug]/order/page.tsx`** | The header renders **both** marks; CSS shows one |
| **`app/trucks/[slug]/TruckClient.tsx`** | Same |

### What a customer sees

| Surface | on **hatchgrab.com** | on **villagefoodie.co.uk** |
|---|---|---|
| Customer order form | 🔴 **HatchGrab wordmark (white)** | ✅ **Village Foodie logo — unchanged** |
| Truck schedule / event calendar | 🔴 **HatchGrab wordmark (white)** | ✅ **Village Foodie logo — unchanged** |
| Everything else in Part 1 | Unchanged | Unchanged |

**Three details that are not incidental:**

- 🔴 **A plain `<img>`, not `next/image`.** The wordmark is an **SVG**, and `next/image` would need
  `dangerouslyAllowSVG`, which `components/brand/HatchGrabWordmark.tsx` records as deliberately not
  enabled.
- 🔴 **141 × 31 — the 4.548:1 crop ratio** `lib/brand.ts:26-29` requires. *"EVERY hardcoded width/height
  PAIR must use 4.548:1 — a stale pair letterboxes or squashes."*
- 🔴 **The WHITE variant**, because both headers are `bg-slate-900`. `lib/brand.ts:24-25`: *"Picking the
  wrong one renders the wordmark invisible."*

### Why CSS and not `isHatchGrab()`

**`lib/domain.ts:1-3` returns `false` when `window` is undefined** — i.e. on the server. Branching on it
would put the **Village Foodie** mark in the SSR HTML and swap it after hydration: **a visible logo flash
on every load**, the same class of defect `app/embed/[slug]/EmbedSchedule.tsx:18` documents. **Resolving
the brand server-side means the correct mark is in the first painted frame.**

### Measured

```
Host: localhost:3000                    <html … data-brand="villagefoodie">   both marks in HTML
Host: hatchgrab.…nip.io:3000            <html … data-brand="hatchgrab">       both marks in HTML

selector test, real browser:
  data-brand="hatchgrab"      vf:none    hg:inline  -> shows HatchGrab      ✅
  data-brand="villagefoodie"  vf:inline  hg:none    -> shows Village Foodie ✅
```

🔴 **The end-to-end render is NOT verified** — see VERIFICATION. **Restart the dev server and reload
`/trucks/<slug>/order` on both hosts; that is the outstanding check.**

---

## Items 6 and 7 — held and untouched

| | |
|---|---|
| Domain | ✅ **Untouched** |
| Email sender | ✅ **Untouched** — `lib/email-config.ts` still `Village Foodie` |
| App store listings | ✅ **Untouched.** No `ios/`, `android/` or store metadata changed |
| Anything in the field (QR codes, cached OG) | ✅ **Untouched** |
| **Operator surfaces** | ✅ **Untouched.** `AppHeader.tsx`, `app/manage/*`, `app/dashboard/*` unchanged by this task |

⚠️ Other files in `git status` are prior tasks' uncommitted work.

---

## What I could not establish

1. 🔴 **That either page renders the HatchGrab mark.** **The dev server's CSS chunk is stale** and I did
   not restart your process. **This is the one open check.**
2. **Whether "event calendar" means this page.** I read it as the **truck schedule page**
   (`/trucks/<slug>`), which lists a truck's upcoming events and is reachable on hatchgrab.com.
   ⚠️ **If you meant the venue page or the custom-domain schedule, say so — neither is changed.**
3. **Whether anything else keys off `<html>` attributes.** I grepped for `data-brand` and found no other
   consumer, but an empty grep is not proof.
4. **How the two marks compare optically** at 110/140px — the VF logo is 3.33:1 and the wordmark 4.548:1,
   so at equal width the wordmark is **shorter**. **Worth a look before deploy.**
