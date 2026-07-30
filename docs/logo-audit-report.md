# LOGO / ICON ASSET AUDIT — READ-ONLY

**Date:** 30 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`
**Status: 🛑 READ-ONLY. No file changed but this report. No `next dev` / `next build` run.**
Everything below is **observed from the tree**, not from the manual. Where the manual disagrees, the tree wins and I say so.

**Prompt integrity:** no span read as garbled or truncated.

---

# TL;DR — THE FACTS THAT MATTER

| # | Finding |
|---|---|
| 1 | **No HatchGrab logo file exists anywhere.** Two *different* paths are referenced in code, neither present |
| 2 | **There is no favicon file at all** — the icon is an inline **🚚 emoji SVG data URI** |
| 3 | `public/apple-touch-icon.png` is **2528×1696 and 7.95 MB**; the manifest declares it **180×180** |
| 4 | **Capacitor icons are untouched scaffold placeholders** — verified by looking at them |
| 5 | `generateMetadata` **does not branch brand for any image**, and duplicates `lib/brand.ts`'s host check inline |
| 6 | **Stripe: confirmed none.** No SDK, no env vars, no Connect config |
| 7 | The manual's `hatchgrab-logo.png` backlog item is **correct**; its QR claim is **incomplete** (see §3) |

---

# 1. STATIC ASSETS

## Brand / logo / icon assets under `public/`

| Path | Bytes | Pixels | Format | Alpha |
|---|---|---|---|---|
| `public/apple-touch-icon.png` | **7,954,151** (7.95 MB) | **2528 × 1696** | PNG | **yes** |
| `public/og.image.png` | 232,050 | 856 × 1328 | PNG | yes |
| `public/gusto-logo.png` | 54,891 | 320 × 233 | PNG | no |
| `public/logos/village-foodie-logo-v2.png` | 184,671 | 910 × 274 | PNG | yes |
| `public/logos/village-foodie logo-sharing.png` | 3,856,486 (3.86 MB) | 2397 × 1270 | PNG | yes |
| `public/file.svg` · `globe.svg` · `next.svg` · `vercel.svg` · `window.svg` | 391 / 1,035 / 1,375 / 128 / 385 | vector | SVG | n/a |

⚠️ **`apple-touch-icon.png` is not square and is enormous.** 2528×1696 (3:2), 7.95 MB, served as the iOS
home-screen icon and as the sole PWA manifest icon. **The manifest declares it `"sizes": "180x180"`** —
wrong on both count and aspect.

⚠️ **`village-foodie logo-sharing.png` contains a SPACE in its filename** and is referenced unencoded as
`/logos/village-foodie logo-sharing.png` in `app/layout.tsx` (twice). It is also declared to Open Graph as
**1200×630** when it is actually **2397×1270**.

*(The remaining ~115 files in `public/logos/` and ~75 in `public/photos/` are individual food-truck
customer logos/photos — `pizzeriagusto.jpg`, `steakandhonour.jpg` etc. Not platform brand assets, so not
enumerated here.)*

## 🔴 `public/logos/hatchgrab-logo.png` — DOES NOT EXIST. Manual CONFIRMED.

`ls public/logos/hatchgrab*.png` → **no matches**. The manual's backlog line is accurate:

> `docs/reference-manual.md:4221` — *"FAQ / help page; HatchGrab logo asset at public/logos/hatchgrab-logo.png."*

🔴 **But the tree is worse than the manual implies: code references TWO DIFFERENT paths, and neither exists.**

| Referenced path | Site | Fallback when missing |
|---|---|---|
| `/logos/hatchgrab.png` | [manage/page.tsx:7027](app/manage/[token]/page.tsx#L7027) | text *"Powered by HatchGrab"* |
| `/logos/hatchgrab-logo.png` | [lib/email-config.ts:33](lib/email-config.ts#L33) | **none — broken image in emails** |

`lib/email-config.ts:30` carries its own TODO: *"Add hatchgrab-logo.png to /public/logos/ once HatchGrab
branding is finalised."* ⚠️ **Creating one file will not fix both** — the two paths differ by `-logo`.

## Reference / orphan analysis

| Asset | References | Verdict |
|---|---|---|
| `village-foodie-logo-v2.png` | **9** — `app/page.tsx:194`, `login/page.tsx:84`, `trucks/page.tsx:37`, `trucks/[slug]/TruckClient.tsx:122`, `trucks/[slug]/order/page.tsx:2566`, `reset-password/page.tsx:104`, `components/shared/AppHeader.tsx:32`, `lib/brand.ts:5` + `:11`, `lib/email-config.ts:36` | ✅ **heavily used** |
| `village-foodie logo-sharing.png` | 2 — `app/layout.tsx:43`, `:56` | ✅ used (OG + Twitter) |
| `apple-touch-icon.png` | 2 — `app/layout.tsx:60`, `public/manifest.json:11` | ✅ used |
| `gusto-logo.png` | 1 — `app/landing/page.tsx:202` | ✅ used (testimonial) |
| **`og.image.png`** | **0** | 🔴 **ORPHAN** (232 KB) |
| **`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`** | **0 each** | 🔴 **ORPHANS** — `create-next-app` scaffold leftovers |

---

# 2. FAVICON AND WEB METADATA

## 🔴 There is NO favicon file. Anywhere.

| Candidate | Present? |
|---|---|
| `app/favicon.ico` | ❌ |
| `app/icon.*` | ❌ |
| `app/apple-icon.*` | ❌ |
| `public/favicon.ico` | ❌ |

**The browser icon is an inline data URI containing a 🚚 emoji** — [app/layout.tsx:59](app/layout.tsx#L59):

```ts
icons: {
  icon: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🚚%3C/text%3E%3C/svg%3E",
  apple: "/apple-touch-icon.png",
},
```

## `generateMetadata` — [app/layout.tsx:17-63](app/layout.tsx#L17)

**What it branches on host** ([:20](app/layout.tsx#L20) `const isHG = host.includes('hatchgrab')`):
`siteName` · `description` · `baseUrl` (`https://hatchgrab.com` vs `https://villagefoodie.co.uk`).

**🔴 WHAT IT DOES *NOT* BRANCH — every image is unconditionally Village Foodie:**

| Field | Value | Brand-aware? |
|---|---|---|
| `openGraph.images[0].url` | `/logos/village-foodie logo-sharing.png` (declared 1200×630) | ❌ |
| `twitter.images` | `/logos/village-foodie logo-sharing.png` | ❌ |
| `icons.icon` | the 🚚 emoji data URI | ❌ |
| `icons.apple` | `/apple-touch-icon.png` | ❌ |
| `manifest` | `/manifest.json` (hardcoded, VF-named) | ❌ |
| `openGraph.images[0].alt` | `` `${siteName} Logo` `` | ✅ (text only) |

🔴 **So a hatchgrab.com share card shows the Village Foodie logo with the alt text "HatchGrab Logo".**

⚠️ **It does NOT use `lib/brand.ts`.** `layout.tsx` re-implements the host check inline rather than
importing `isHatchGrabHost`/`getBrandFromHost`. **The only importer of `lib/brand.ts`'s host helpers is
[app/api/discovery/events/route.ts:4](app/api/discovery/events/route.ts#L4).** Two copies of the same
rule — and `BRANDS.HATCHGRAB.logo` is itself a placeholder:

```ts
// lib/brand.ts:11
logo: '/logos/village-foodie-logo-v2.png', // temporary — replace when HatchGrab logo exists
```

## PWA manifest — `public/manifest.json` exists (371 bytes)

*(There is no `app/manifest.ts`.)*

```json
{
  "name": "Village Foodie Kitchen",
  "short_name": "VF Kitchen",
  "description": "Kitchen display system for Village Foodie food trucks",
  "start_url": "/", "display": "standalone",
  "background_color": "#f8fafc", "theme_color": "#0f172a",
  "icons": [ { "src": "/apple-touch-icon.png", "sizes": "180x180", "type": "image/png" } ]
}
```

🔴 **One icon, and its declared size is a fiction** (real file: 2528×1696). Name/description are
Village-Foodie-branded and served unconditionally, including on hatchgrab.com. `theme_color` `#0f172a`
is `slate-900`, matching `HEADER_BG`; `background_color` `#f8fafc` does **not** match the Capacitor
native background `#1C1C1E`.

---

# 3. THE QR COMPOSITE

**Library:** `qrcode` **`^1.5.4`** ([package.json:41](package.json#L41)), types `@types/qrcode ^1.5.6`.
**Implementation:** [lib/generateQRCode.ts](lib/generateQRCode.ts) — **two separate functions**.

**The fullscreen dashboard QR** is `generateQRWithLogo`, called from
[app/dashboard/[token]/page.tsx:1100-1111](app/dashboard/[token]/page.tsx#L1100) via dynamic import.

## Compositing method: **HTML5 canvas**, not SVG overlay and not a library option

[generateQRCode.ts:74-99](lib/generateQRCode.ts#L74) — QR rendered to a data URL, drawn into a
`<canvas>`, then the logo drawn on top.

**Image source:** a **URL**, fetched and converted to a **same-origin blob URL** first, to avoid canvas
CORS taint — `loadImageViaBlobUrl` ([:30-47](lib/generateQRCode.ts#L30)). Not a data URI, not a local import.

## Logo size

| Function | Logo px | QR px | Fraction |
|---|---|---|---|
| `generateQRWithLogo` ([:88](lib/generateQRCode.ts#L88)) | `Math.round(size * 0.29)` → **174 px** at the dashboard's `size = 600` | 600 | **29%** |
| `generateQRCodePNG` ([:178](lib/generateQRCode.ts#L178)) | **116 px** hardcoded | 400 | **29%** |

## ✅ Error correction IS set to `'H'` — in both functions

```ts
// lib/generateQRCode.ts:68   (generateQRWithLogo)
    errorCorrectionLevel: 'H',
// lib/generateQRCode.ts:145  (generateQRCodePNG)
    errorCorrectionLevel: 'H',
```

## ✅ There IS a white backing plate

**Not drawn straight onto the modules.** A filled white rounded rectangle sits behind the logo, with
**6 px padding** on every side and an **8 px corner radius** — [:92-96](lib/generateQRCode.ts#L92):

```ts
const padding = 6
ctx.fillStyle = '#ffffff'
roundRect(ctx, logoX - padding, logoY - padding, logoSize + padding * 2, logoSize + padding * 2, 8)
ctx.fill()
```

Identical treatment in `generateQRCodePNG` [:186-190](lib/generateQRCode.ts#L186). ⚠️ The plate is drawn
**before** the null-logo check resolves, so in the demo placeholder path the white plate renders with a
dashed outline and "Your logo here" text instead of an image.

## 🔴 SETTLING THE `qr_code_style` QUESTION: **GATED — and by TWO conditions, not one**

**The composite is NOT unconditional.** [app/dashboard/[token]/page.tsx:1101](app/dashboard/[token]/page.tsx#L1101):

```ts
const showBrandedQr = hasFeature(truck.plan,'branded_qr_code') && truck.qr_code_style === 'branded'
…
generateQRWithLogo(orderUrl, showBrandedQr ? truck.logo : null, 600, isDemo ? 'Your logo here' : null)
```

**Both must be true**: the plan must carry `branded_qr_code` **and** the column must read `'branded'`.
Otherwise `logoUrl` is `null` and [:72](lib/generateQRCode.ts#L72) returns the plain QR early.

⚠️ **Where the "unconditional" impression comes from:** `generateQRCodePNG` (the Manage **download**
path, [manage/page.tsx:7021](app/manage/[token]/page.tsx#L7021)) **is not gated by
`qr_code_style` at all** — it composites `logoUrl` whenever one is passed. **Two QR paths, two different
gating rules.** That is the real answer to "the manual asserts both".

**The manual is INCOMPLETE, not wrong.** `reference-manual.md:1995` says the column *"controls whether
the public QR composites the truck logo into the centre (error-correction level H)"* — true for the
fullscreen path, but it **omits the `hasFeature` plan gate** and **omits that the Manage download path is
ungated**.

---

# 4. CAPACITOR ICON PIPELINE

## ❌ `@capacitor/assets`: NOT installed. ❌ `resources/`: does not exist.

Installed Capacitor packages ([package.json:13-24](package.json#L13)): `@aparajita/capacitor-biometric-auth`,
`@capacitor-community/keep-awake`, `android`, `app`, `cli`, `core`, `ios`, `local-notifications`,
`network`, `preferences`, `push-notifications`, `status-bar`. **All `^8.x`.**

**There is no icon-generation pipeline of any kind.**

## iOS — `ios/App/App/Assets.xcassets/AppIcon.appiconset/`

| File | Bytes | Pixels | Alpha |
|---|---|---|---|
| `AppIcon-512@2x.png` | 110,522 | **1024 × 1024** | no |
| `Contents.json` | 218 | — | — |

```json
{ "images": [ { "filename": "AppIcon-512@2x.png", "idiom": "universal",
               "platform": "ios", "size": "1024x1024" } ],
  "info": { "author": "xcode", "version": 1 } }
```

Sibling: `Splash.imageset/` — `splash-2732x2732.png`, `-1`, `-2`, **all 41,273 bytes (identical)**, plus
`Contents.json`.

## Android — every `mipmap-*`

| Directory | Files |
|---|---|
| `mipmap-anydpi-v26` | `ic_launcher.xml` (265 B), `ic_launcher_round.xml` (265 B) |
| `mipmap-mdpi` | `ic_launcher.png` 1,869 · `ic_launcher_foreground.png` 2,110 · `ic_launcher_round.png` 2,725 |
| `mipmap-hdpi` | 2,786 · 3,450 · 4,341 |
| `mipmap-xhdpi` | 3,981 · 5,036 · 6,593 |
| `mipmap-xxhdpi` | 6,644 · 9,793 · 10,455 |
| `mipmap-xxxhdpi` | 9,441 · 15,529 · 15,916 |

## 🔴 THESE ARE CAPACITOR'S DEFAULT PLACEHOLDERS. NOTHING HAS BEEN CUSTOMISED.

**How I can tell — I opened them.** I read `AppIcon-512@2x.png` and
`mipmap-xxxhdpi/ic_launcher.png` as images. Both show the **stock Capacitor mark: a light-blue
gradient "capacitor" symbol on a white diagonal-grid background.** No HatchGrab wordmark, no Village
Foodie logo, no food-truck imagery. **This is the scaffold artwork, unmodified.**

Corroborating: every Android icon shares a `Jun 2 16:55` mtime (a single scaffold write), the iOS icon
and splash share `May 12 21:38`, and the three splash PNGs are byte-identical duplicates — all
signatures of generated scaffold output rather than hand-authored assets.

## Splash screen

**Assets exist** (`Splash.imageset`, 2732×2732 ×3) and **config exists**
([capacitor.config.ts](capacitor.config.ts)):

```ts
SplashScreen: { launchShowDuration: 1000, backgroundColor: '#1C1C1E',
                showSpinner: false, launchAutoHide: true },
```

🔴 **But `@capacitor/splash-screen` is NOT in `package.json` (0 matches) and NOT in `node_modules`.**
**The config block is inert** — it configures a plugin that is not installed. Native default splash
behaviour applies instead.

## App id and server URL — `capacitor.config.ts`

| Key | Value |
|---|---|
| `appId` | **`com.hatchgrab.app`** |
| `appName` | **`HatchGrab`** |
| `webDir` | `out` |
| `server.url` | `` `${CAP_SERVER_BASE}/app` `` where `CAP_SERVER_BASE = process.env.CAP_SERVER_URL \|\| 'https://www.hatchgrab.com'` → **`https://www.hatchgrab.com/app`** |
| `server.cleartext` | `IS_LOCAL_HTTP` — false in production |
| `ios.backgroundColor` / `android.backgroundColor` | `#1C1C1E` |
| `appendUserAgent` (both platforms) | `HatchGrabNativeApp` |

⚠️ **The app is already fully HatchGrab-identified at the native layer** (`com.hatchgrab.app`, name
"HatchGrab", pointing at hatchgrab.com) **while shipping Capacitor's placeholder icon.**

---

# 5. WHERE THE VILLAGE FOODIE LOGO IS RENDERED

All render `/logos/village-foodie-logo-v2.png`.

| # | File:line | Surface | Facing |
|---|---|---|---|
| 1 | [components/shared/AppHeader.tsx:32](components/shared/AppHeader.tsx#L32) | shared operator header (`width={90} height={27}`, `opacity-70`, wrapped in `<Link href="/">`) | 🔧 **OPERATOR** — used by `app/app/page.tsx`, `admin/page.tsx`, `dashboard/[token]/page.tsx`, `manage/[token]/page.tsx` |
| 2 | [app/page.tsx:194](app/page.tsx#L194) | public home page (`priority`, 140px mobile) | 👤 **CUSTOMER** |
| 3 | [app/trucks/page.tsx:37](app/trucks/page.tsx#L37) | truck directory | 👤 **CUSTOMER** |
| 4 | [app/trucks/[slug]/TruckClient.tsx:122](app/trucks/[slug]/TruckClient.tsx#L122) | individual truck page | 👤 **CUSTOMER** |
| 5 | [app/trucks/[slug]/order/page.tsx:2566](app/trucks/[slug]/order/page.tsx#L2566) | customer ordering page header | 👤 **CUSTOMER** |
| 6 | [app/login/page.tsx:84](app/login/page.tsx#L84) | login | 🔧 **OPERATOR** |
| 7 | [app/reset-password/page.tsx:104](app/reset-password/page.tsx#L104) | password reset | 🔧 **OPERATOR** |
| 8 | [app/layout.tsx:43](app/layout.tsx#L43), [:56](app/layout.tsx#L56) | OG + Twitter share cards (`logo-sharing.png`) | 🌐 **BOTH** (host-independent) |
| 9 | [lib/email-config.ts:36](lib/email-config.ts#L36) | email template logo | 👤 **CUSTOMER** (transactional email) |
| 10 | [lib/brand.ts:5](lib/brand.ts#L5), [:11](lib/brand.ts#L11) | brand table — **both VF *and* HatchGrab entries** | 🌐 config |

⚠️ **The operator surfaces (1, 6, 7) show the Village Foodie logo on hatchgrab.com** — `AppHeader` has no
host awareness at all and links to `/`.

**Separately: the landing page uses NO image.** `HatchGrabWordmark`
([components/brand/HatchGrabWordmark.tsx](components/brand/HatchGrabWordmark.tsx)) is a **pure
CSS + inline-SVG** component — `<span>HATCH</span>` + a bolt `<path>` + a swoosh `<path>` + `<span>Grab</span>`.
Used by `app/landing/page.tsx:106` & `:418` and `app/signup/page.tsx:19`. **No file dependency.**

**Report only — nothing proposed.**

---

# 6. STRIPE BRANDING — ✅ CONFIRMED: NONE

| Check | Result |
|---|---|
| `stripe` in `package.json` | **0 matches** — no SDK |
| `STRIPE*` env vars referenced anywhere | **none** |
| `business_profile` | **0 matches** |
| Connect account config / `acct_` ids | **0 matches** |

**Every hit is copy or a type string, not configuration:**

- [manage/page.tsx:8597](app/manage/[token]/page.tsx#L8597) — UI copy: *"Online payments are powered by Stripe Connect. Platform and card processing fees are TBC…"*
- [lib/plan-features.ts:84](lib/plan-features.ts#L84), [:129](lib/plan-features.ts#L129) — pricing-table copy
- [lib/payments/ledger.ts:59](lib/payments/ledger.ts#L59) — `PaymentChannel = 'online' | 'in_person_stripe' | 'in_person_other'` (a string union; no integration)

⚠️ **One false positive worth naming:** [manage/page.tsx:1279](app/manage/[token]/page.tsx#L1279) `stripe(i)`
is a **table row-striping helper**, nothing to do with payments.

**Your expectation is confirmed: there is no Stripe branding to audit.**

---

# 7. BRANCH AND TREE STATE

| Item | Value |
|---|---|
| Current branch | **`main`** |
| `landing-v32` **local** | ✅ **EXISTS** |
| `landing-v32` **remote** | ✅ **EXISTS** — `remotes/origin/landing-v32` |

## Does the landing page reference a HatchGrab logo asset? — **NO.**

`app/landing/page.tsx:105-106` renders the wordmark as a component, not an image:

```tsx
<a href="#" className="nav-logo" aria-label="HatchGrab home">
  <HatchGrabWordmark variant="dark" />
</a>
```

**No `src=`, no file path, so nothing to be missing.** `app/landing/landing.css:72` labels its styling
*"logo (approximation; see HatchGrabWordmark.tsx)"*. The only image on the landing page is
`/gusto-logo.png` ([:202](app/landing/page.tsx#L202)) — a customer testimonial logo, which **does exist**.

---

# WHERE THE MANUAL IS WRONG OR INCOMPLETE

| Manual line | Claim | Verdict |
|---|---|---|
| `:4221` | HatchGrab logo asset at `public/logos/hatchgrab-logo.png` is open backlog | ✅ **CORRECT** — but understated: **two** different paths are referenced (`/logos/hatchgrab.png` and `/logos/hatchgrab-logo.png`), neither exists |
| `:1995` | `qr_code_style` *"controls whether the public QR composites the truck logo"* | ⚠️ **INCOMPLETE** — omits the `hasFeature(plan,'branded_qr_code')` **AND** gate, and omits that the Manage **download** path (`generateQRCodePNG`) is **not gated by the column at all** |
| `:1995` | error-correction level H | ✅ **CORRECT** — verified in both functions |
| — | *(no manual entry)* | 🔴 **UNDOCUMENTED:** no favicon file exists; the icon is a 🚚 emoji data URI |
| — | *(no manual entry)* | 🔴 **UNDOCUMENTED:** `SplashScreen` is configured in `capacitor.config.ts` but `@capacitor/splash-screen` is **not installed** |
| — | *(no manual entry)* | 🔴 **UNDOCUMENTED:** `generateMetadata` duplicates `lib/brand.ts`'s host check inline and brands **no** image |

---

## What I could NOT verify

- **Nothing was rendered or built.** No `next dev`/`next build`, so I have not seen a share card, a
  favicon in a tab, a home-screen icon or a generated QR. Everything is from files, `sips` metadata, and
  reading two icons as images.
- ⚠️ **The "Capacitor default placeholder" verdict is from LOOKING at the artwork**, corroborated by
  mtimes and byte-identical splash duplicates. I could **not** diff against the upstream scaffold —
  `@capacitor/ios` and `@capacitor/android` do not vendor icon templates into `node_modules`. The visual
  evidence is unambiguous (stock capacitor mark on a grid), but it is visual, not a checksum match.
- **`sips` reports `hasAlpha`**, which means an alpha channel is present — **not** that the image actually
  uses transparency. I did not sample pixels.
- **The orphan list is a grep of `app/`, `components/`, `lib/` and `manifest.json`.** An asset referenced
  from CSS, from `docs/`, from a native project file, or by an external system would not have matched. I
  am confident about `next.svg`/`vercel.svg`/`file.svg`/`globe.svg`/`window.svg` (scaffold leftovers);
  **`og.image.png` is the one I would double-check** before deleting.
- **I did not enumerate all ~190 truck logo/photo files** individually — they are customer content, not
  platform brand assets.
- **I did not inspect `landing-v32`'s contents** — only confirmed the branch exists locally and on origin.
  If that branch adds a HatchGrab asset, this audit of `main` would not show it.
- **Whether `public/manifest.json` is actually served on hatchgrab.com** is inferred from
  `manifest: "/manifest.json"` being unconditional in `generateMetadata`; I did not fetch it.
