# The WhatsApp share preview — diagnosis

**GARBLED SPANS: none. No instruction contradicted another.**

⚠️ **DIAGNOSIS ONLY. No file was changed and no asset was created.** The only write is this report.
Every measurement below is from the **production response**, fetched with a link-preview crawler
user-agent, not from source.

🟢 **The manual already records this**, at two places, as open — so this is a confirmation with numbers,
not a discovery:
- **§27** (`Found, reported, not fixed`): *"**No branded og:image.** `generateMetadata` sets no image, so
  a hatchgrab.com share card shows the Village Foodie logo with alt text reading 'HatchGrab Logo'. Needs
  a 1200 × 630."* ⚠️ **One clause of that entry is wrong and it matters — see §5.**
- **§38**: *"STILL OPEN, AND BOTH ARE OUTWARD-FACING: link previews on our own host still use the other
  brand's logo, from a 3.86 MB file."*

---

## 1. What production actually serves

Fetched `2026-09-03` with `-A "WhatsApp/2.24 facebookexternalhit/1.1"`, following redirects.
**`https://hatchgrab.com/` 307s to `https://www.hatchgrab.com/`**; both resolve to the same 117,534-byte
response. The consumer host was read from `lib/brand.ts:4` (`domain: 'www.villagefoodie.co.uk'`), not
assumed.

### `https://hatchgrab.com/` and `https://www.hatchgrab.com/` — byte-identical output

```html
<meta property="og:title" content="HatchGrab"/>
<meta property="og:description" content="The food truck management platform"/>
<meta property="og:url" content="https://hatchgrab.com"/>
<meta property="og:site_name" content="HatchGrab"/>
<meta property="og:locale" content="en_GB"/>
<meta property="og:image" content="https://hatchgrab.com/logos/village-foodie%20logo-sharing.png"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:image:alt" content="HatchGrab Logo"/>
<meta property="og:type" content="website"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="HatchGrab"/>
<meta name="twitter:description" content="The food truck management platform"/>
<meta name="twitter:image" content="https://hatchgrab.com/logos/village-foodie%20logo-sharing.png"/>
<title>HatchGrab — The ordering system built for food trucks | HatchGrab</title>
```

### `https://www.villagefoodie.co.uk/`

```html
<meta property="og:title" content="Village Foodie"/>
<meta property="og:description" content="Find local food trucks and pop-ups visiting villages near you."/>
<meta property="og:url" content="https://villagefoodie.co.uk"/>
<meta property="og:site_name" content="Village Foodie"/>
<meta property="og:locale" content="en_GB"/>
<meta property="og:image" content="https://villagefoodie.co.uk/logos/village-foodie%20logo-sharing.png"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:image:alt" content="Village Foodie Logo"/>
<meta property="og:type" content="website"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="Village Foodie"/>
<meta name="twitter:description" content="Find local food trucks and pop-ups visiting villages near you."/>
<meta name="twitter:image" content="https://villagefoodie.co.uk/logos/village-foodie%20logo-sharing.png"/>
<title>Village Foodie</title>
```

### The required inventory, per host

| Tag | hatchgrab.com | www.hatchgrab.com | www.villagefoodie.co.uk |
|---|---|---|---|
| `og:image` | 🔴 **the Village Foodie file** | 🔴 **the Village Foodie file** | present, correct for the brand |
| `og:image:width` | `1200` 🔴 **false — see §2** | `1200` 🔴 **false** | `1200` 🔴 **false** |
| `og:image:height` | `630` 🔴 **false — see §2** | `630` 🔴 **false** | `630` 🔴 **false** |
| `og:image:alt` | 🔴 `"HatchGrab Logo"` — **describes a Village Foodie image** | 🔴 same | `"Village Foodie Logo"` — accurate |
| `og:title` | `HatchGrab` | `HatchGrab` | `Village Foodie` |
| `og:description` | present | present | present |
| `og:url` | ⚠️ `https://hatchgrab.com` — **apex, while the page is served from `www.`** | ⚠️ same | ⚠️ `https://villagefoodie.co.uk` — apex, served from `www.` |
| `og:site_name` | `HatchGrab` | `HatchGrab` | `Village Foodie` |
| `twitter:card` | `summary_large_image` | same | same |
| `twitter:image` | 🔴 **the Village Foodie file** | 🔴 same | present, correct |
| **canonical `<link>`** | 🔴 **ABSENT** | 🔴 **ABSENT** | 🔴 **ABSENT** |

🔴 **Absent, stated explicitly:** **no `<link rel="canonical">` is emitted on any of the three hosts.**
Nothing else in the requested list is missing — every other tag is present on all three.

⚠️ **`og:image` on the hatchgrab hosts points at the APEX**, and the apex 307s:

```
HTTP/2 307
location: https://www.hatchgrab.com/logos/village-foodie%20logo-sharing.png
```

**The declared image URL is a redirect, not the image.** WhatsApp follows it, which is why you saw a card
at all — but a crawler that does not follow redirects on `og:image` gets nothing. Recorded because it is
a second, independent fragility in the same tag.

---

## 2. The images themselves

Both hosts declare **the same file**, and it is the same 3.68 MB object on each.

| | `https://hatchgrab.com/logos/village-foodie%20logo-sharing.png` | `https://villagefoodie.co.uk/logos/…` |
|---|---|---|
| HTTP | 200, `image/png` | 200, `image/png` |
| **Bytes** | **3,856,486 B — 3.68 MB** | **3,856,486 B — identical** |
| **Pixels** | **2397 × 1270** | **2397 × 1270** |
| **Aspect** | **1.8874 : 1** | 1.8874 : 1 |
| Format | PNG, bit depth 8, colour type 6 (RGBA) | same |

### 🔴 The declared dimensions are wrong

`og:image:width` / `og:image:height` say **1200 × 630** (ratio **1.9048**). The file is **2397 × 1270**
(ratio **1.8874**). **The tags do not describe the resource they point at** — neither the size nor,
exactly, the shape.

### 🔴 What the image actually depicts — opened and viewed, not inferred

**A full-bleed Village Foodie logo lockup**: an orange food-truck mark and the words **VILLAGE FOODIE**
in cream on the dark navy field, filling nearly the entire 2397 × 1270 canvas with little margin.

**This is the whole symptom in one asset.** It is *the wrong brand*, and because the artwork is a logo
scaled to fill a large canvas — rather than a card composition with the mark at a modest size — a
correctly-rendered `summary_large_image` card shows that logo **enormous**. **Nothing is malfunctioning
in the rendering; the card is displaying exactly what it was given.**

⚠️ **3.68 MB is far outside what preview crawlers are built for.** WhatsApp resolved it on your device;
whether it does so reliably on a slow connection, or caches a failure, is not something this report
measured. The manual already files this file under the oversized-asset class that replaced a 7.95 MB
`apple-touch-icon.png`.

---

## 3. Every `generateMetadata` that can serve a hatchgrab host

| # | File : line | Serves a hatchgrab host? | Branches on host? | Mechanism |
|---|---|---|---|---|
| 1 | 🔴 **`app/layout.tsx:21`** | **YES — this is the one** | ⚠️ **PARTLY — see below** | `host.includes('hatchgrab')`, **inline** (`:24`) |
| 2 | `app/contact/page.tsx:53` | YES | **No** — returns `{ title: 'Support' }`; inherits the rest from #1 | the page body branches separately via `isHatchGrabHost` (`:38`) |
| 3 | `app/venues/[slug]/page.tsx:66` | No — consumer route | **No** — hardcodes `'… | Village Foodie'` | none |
| 4 | `app/trucks/[slug]/page.tsx:38` | ⚠️ Reachable on both | 🔴 **No** — hardcodes `siteName: 'Village Foodie'` and `'… | Village Foodie'` | none |
| 5 | `app/domain/page.tsx:96` | No — operator custom domains only | Yes, by design | `hostKey(rawHost)` + a truck lookup |

**Static `export const metadata`** (no host access by construction): `app/landing/page.tsx:49`,
`app/compare/page.tsx:50`, `app/o/[slug]/page.tsx:38`, `app/hire/page.tsx:4`,
`app/(legal)/privacy/page.tsx:19`, `app/(legal)/terms/page.tsx:19`.

### 🔴 The defect, exactly: the branch exists and the image sits outside it

`app/layout.tsx:21-60`. The host check drives four values and **not the image**:

```ts
const isHG = host.includes('hatchgrab')
const siteName   = isHG ? 'HatchGrab' : 'Village Foodie'          // branched
const description= isHG ? 'The food truck management platform' : '…'  // branched
const baseUrl    = isHG ? 'https://hatchgrab.com' : 'https://villagefoodie.co.uk'  // branched
…
  images: [{
    url: "/logos/village-foodie logo-sharing.png",   // 🔴 NOT branched — hardcoded
    width: 1200, height: 630,                        // 🔴 NOT measured — hardcoded
    alt: `${siteName} Logo`,                         // branched — which is why it says
  }],                                                //   "HatchGrab Logo" over a VF image
…
  twitter: { images: ["/logos/village-foodie logo-sharing.png"] }  // 🔴 NOT branched
```

**Everything a reader would check to confirm the branding is host-aware — title, description, site name,
base URL, even the image's own alt text — is correct.** Only the two `url` values are not, and they are
the two nobody re-reads because the surrounding code is so clearly branded.

⚠️ **`alt` is the tell.** It is generated from `siteName`, so the page confidently labels the wrong
image with the right brand. **A wrong value derived from a correct variable reads as correct.**

### The host check: 8 code occurrences, 3 mechanisms — and they agree on the predicate

| Mechanism | Sites |
|---|---|
| `isHatchGrabHost(host)` — **the canonical helper**, `lib/brand.ts:60-62` | `app/contact/page.tsx:38`, `app/compare/page.tsx:57`, `app/api/discovery/events/route.ts:74` |
| **Inline** `host.includes('hatchgrab')` | 🔴 `app/layout.tsx:24`, 🔴 `app/layout.tsx:117`, `lib/brand.ts:56` (inside `getBrandFromHost`), `lib/custom-host.ts:27`, `proxy.ts:89` |
| **Client-side** `window.location.hostname.includes('hatchgrab')` — `lib/domain.ts:1-3` | `app/dashboard/[token]/page.tsx:3041`, `app/login/page.tsx:102`, plus `isHatchGrab()` consumers |

🟢 **All eight agree on the test** — every one is `includes('hatchgrab')`, and `proxy.ts:86-89` documents
its copy as deliberate (*"the SAME test as `isHatchGrabHost` … so the two cannot disagree"*).

🔴 **They do NOT agree on where they can run.** `lib/domain.ts` reads `window`, so it returns **false on
the server** — the manual records this at `app/layout.tsx:111` and it is why metadata must use the
header form. **The predicate is consistent; the danger is picking the wrong one of the three.**

⚠️ `app/layout.tsx` duplicates the check inline **twice** (`:24`, `:117`) rather than importing the
helper it sits beside. The manual records this as `app/layout.tsx:20`; **the line has since moved to
`:24`** and a second occurrence has appeared at `:117`.

---

## 4. HatchGrab-branded assets in `public/`

**Seven files carry the HatchGrab name. Every one is a logo or wordmark. None is a share card.**

| Bytes | Pixels | Path |
|---|---|---|
| 19,050 | 640 × 141 | `public/logos/hatchgrab-logo.png` |
| 16,441 | 640 × 141 | `public/logos/hatchgrab-logo-white.png` |
| 9,227 | 320 × 70 | `public/logos/hatchgrab-logo@1x.png` |
| 8,163 | 1287 × 283 (svg) | `public/logos/hatchgrab-wordmark.svg` |
| 8,163 | 1287 × 283 (svg) | `public/logos/hatchgrab-wordmark-white.svg` |
| 7,814 | 320 × 70 | `public/logos/hatchgrab-logo-white@1x.png` |
| 297 | 1024 × 1024 (svg) | `public/icons/hatchgrab-icon.svg` |

### 🔴 Stated plainly: no HatchGrab asset at or near 1200 × 630 exists

I swept **all of `public/`** for any image wider than 800px with an aspect ratio between 1.85 and 1.95.
**Exactly one file matches, and it is the Village Foodie sharing image** — 2397 × 1270, the very file
being served. **There is no HatchGrab share card to point at.**

⚠️ **The widest HatchGrab raster is 640 × 141** — a wordmark strip at **4.54 : 1**. It cannot be cropped
or padded into a 1.9 : 1 card without composition: at 1200px wide it is 265px tall, leaving 365px of
empty canvas that something must fill. **This is authoring, not resizing** — the same distinction the
manual draws about the maskable icon variant in §38.

---

## 5. `BRANDS.HATCHGRAB.logo`

`lib/brand.ts:8-13`, verbatim, with the comment on the line itself:

```ts
  HATCHGRAB: {
    name: 'HatchGrab',
    domain: 'www.hatchgrab.com',
    logo: '/logos/village-foodie-logo-v2.png', // temporary — replace when HatchGrab logo exists
    focus: 'operator' as const,
  },
```

⚠️ **The comment is false on its own terms.** Seven HatchGrab logo assets exist (§4) — the condition it
waits for was met long ago. `lib/brand.ts:30-33` exports paths to four of them **twelve lines below**.

### 🟢 The zero-consumers claim is STILL TRUE — checked, not assumed

I searched every importer of `@/lib/brand` — thirteen files. **Not one imports `BRANDS` or
`getBrandFromHost`.** They import `HEADER_BG`, the wordmark/logo path constants and the hex tokens.
The only textual hit for "BRANDS" outside the file is a prose comment in `app/contact/page.tsx:2`.

```
does any importer pull in BRANDS or getBrandFromHost?  →  NONE — zero consumers confirmed
```

🔴 **So `BRANDS.HATCHGRAB.logo` is NOT the cause of the symptom, and fixing it would change nothing.**
It is a different wrong value in a different unused record. **The served image comes from a string
literal in `app/layout.tsx`, not from here.**

⚠️ **This is where the manual's §27 entry is wrong, and it would have misdirected a fix.** It says
*"`generateMetadata` sets no image"*. **It sets one** — explicitly, with width, height and alt. The
symptom is not an absent tag falling back to a default; it is a **present tag naming the wrong file**.
Someone acting on that entry would look for a missing image and find a complete, confident, wrong one.

---

## Summary of the diagnosis

**Three independent defects, in one four-line object literal:**

1. 🔴 **The image is the wrong brand.** `app/layout.tsx` hardcodes
   `/logos/village-foodie logo-sharing.png` for both `openGraph.images` and `twitter.images`, outside a
   host branch that correctly handles everything else on the same object.
2. 🔴 **The declared dimensions are wrong.** `1200 × 630` against an actual `2397 × 1270`.
3. 🔴 **There is no correct asset to point at.** No HatchGrab image anywhere near 1.9 : 1 exists, and the
   widest one is a 4.54 : 1 wordmark strip.

**"Rendered very large" is not a bug in the rendering.** `twitter:card` is `summary_large_image` and the
declared dimensions are a valid large-card ratio, so WhatsApp draws the big format — and the artwork it
is given is a logo filling its entire canvas. **The card is showing precisely what it was told to show.**

**No fix is proposed**, per the brief. ⚠️ **The blocking input is item 3: a 1200 × 630 HatchGrab share
card has to be composed before any code change has anywhere to point.** Two secondary findings —
the absent canonical on all three hosts, and the apex-vs-`www` redirect on the `og:image` URL — are
independent of that asset and of each other.

**No files changed. No assets created. Nothing deployed.**
