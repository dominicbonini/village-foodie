# QR POSTER LOGO — DIAGNOSIS · EMAIL BRANDING INVENTORY

**Date:** 30 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`
**Status: 🛑 NOTHING CHANGED. Your prescribed fix is already in place — the cause is elsewhere.**
No `next dev` / `next build` run. **No file edited but this report.**

**Prompt integrity:** no span read as garbled or truncated.

---

# 1. QR POSTER — 🔴 YOUR HYPOTHESIS IS DISPROVEN ON ITS PREMISE

> *"the source is the SVG, and Safari either fails to draw SVG to canvas or reports naturalWidth as 0"*

**The source is not the SVG. It is already the PNG.** The fix you prescribed is the code that is running.
Per your instruction — *"if the diagnosis shows a different cause, STOP and report it rather than applying
my fix anyway"* — **I stopped and changed nothing.**

## (a) Which constant — **the PNG**

[app/manage/[token]/page.tsx:45](app/manage/[token]/page.tsx#L45) and
[:7033](app/manage/[token]/page.tsx#L7033):

```ts
import { HATCHGRAB_LOGO_PNG } from '@/lib/brand'
…
hatchgrabLogoUrl: `${window.location.origin}${HATCHGRAB_LOGO_PNG}`,
```

[lib/brand.ts:32](lib/brand.ts#L32) → `'/logos/hatchgrab-logo.png'`. On disk: **valid PNG, 640 × 141,
8-bit RGBA, non-interlaced, 19,050 B**. Not an SVG at any point in this path.

## (b) Canvas `drawImage`, not a DOM `<img>`

[lib/generateQRCode.ts:214](lib/generateQRCode.ts#L214):

```ts
ctx.drawImage(hgLogo, rightX - logoW, brandingY - logoH, logoW, logoH)
```

## (c) What triggers the text fallback — **`loadImageViaBlobUrl` returning `null`**

[generateQRCode.ts:208-227](lib/generateQRCode.ts#L208) — **not** an `onerror` handler, **not** a
`naturalWidth` check at the call site, **not** a try/catch there:

```ts
if (hatchgrabLogoUrl) {
  const hgLogo = await loadImageViaBlobUrl(hatchgrabLogoUrl)
  if (hgLogo) { …drawImage… }
  else { ctx.fillText('Powered by HatchGrab', rightX, brandingY) }   // ← the observed output
} else { ctx.fillText('Powered by HatchGrab', rightX, brandingY) }
```

**Two ways to reach the text: a falsy `hatchgrabLogoUrl`, or a `null` return from the loader.**

## (d) Yes — it awaits the load event

[generateQRCode.ts:37-41](lib/generateQRCode.ts#L37):

```ts
await new Promise<void>((resolve) => {
  img.onload  = () => resolve()
  img.onerror = () => resolve()      // ⚠️ resolves on FAILURE too — see (f)
  img.src = blobUrl
})
```

## (e) `crossOrigin` — **never set**, and it does not need to be

`grep crossOrigin lib/generateQRCode.ts` → **no matches**. The image is not loaded from its URL at all:
it is `fetch`ed, converted to a **Blob**, and loaded from a `blob:` URL — same-origin by construction.
That is the file's stated purpose (*"Fetch an external image as a same-origin blob URL to avoid canvas
CORS taint"*). The source passed in is an **absolute same-origin URL** (`window.location.origin` + path).

## (f) `naturalWidth === 0` → the loader returns `null` → text fallback

[generateQRCode.ts:43](lib/generateQRCode.ts#L43): `return img.naturalWidth > 0 ? img : null`.

🔴 **So a zero `naturalWidth` never reaches the width computation** — it is caught one level up. The
`logoW` division at [:213](lib/generateQRCode.ts#L213) cannot divide by zero, because `hgLogo` would be
`null` and the `if (hgLogo)` branch would not run. **Your "collapsing width computation" mechanism cannot
occur here.**

---

# 🔴 THE ACTUAL CAUSE: THE ASSET AND THE FIX ARE **UNDEPLOYED**

```
$ git status --porcelain public/logos/
?? public/logos/hatchgrab-logo.png          ← UNTRACKED
?? public/logos/hatchgrab-logo@1x.png       ← UNTRACKED
?? public/logos/hatchgrab-logo-white.png    ← UNTRACKED
?? public/logos/hatchgrab-logo-white@1x.png ← UNTRACKED
?? public/logos/hatchgrab-wordmark.svg      ← UNTRACKED
?? public/logos/hatchgrab-wordmark-white.svg← UNTRACKED
```

```
$ git show HEAD:app/manage/[token]/page.tsx | grep hatchgrab.*png
7027:  hatchgrabLogoUrl: `${window.location.origin}/logos/hatchgrab.png`,
```

**All six assets are untracked. And HEAD's manage page still requests `/logos/hatchgrab.png` — the path
that never existed.** So on any deployed build:

```
fetch('https://…/logos/hatchgrab.png')  →  404  →  !resp.ok  →  return null  →  "Powered by HatchGrab"
```

**That is the observed symptom, exactly, and it requires no Safari quirk to explain.**

## 🔴 THE DISCRIMINATOR — I need one answer from you

| Where Safari was pointed | Prediction | Cause |
|---|---|---|
| **Deployed** (hatchgrab.com / a preview) | 🔴 **text fallback** — 404 on a path that does not exist and an asset that was never committed | **Ship it.** No code change needed |
| **localhost dev server** | ✅ **logo should render** — the working tree requests `/logos/hatchgrab-logo.png`, which exists and is a valid PNG | **My diagnosis is incomplete** — see the secondary finding below |

**If it was localhost, the one thing that settles it in seconds:** open
`http://localhost:3000/logos/hatchgrab-logo.png` directly. A 404 there means a serving problem; a
rendered logo means the fetch is fine and the failure is downstream, in which case the finding below is
the prime suspect.

## ⚠️ SECONDARY FINDING — a genuine Safari hazard, but NOT the cause of *this* symptom

[generateQRCode.ts:42-43](lib/generateQRCode.ts#L42):

```ts
URL.revokeObjectURL(blobUrl)          // ← revoked BEFORE the caller draws
return img.naturalWidth > 0 ? img : null
```

The blob URL is revoked inside the loader, but `drawImage` happens **later, in the caller**. WebKit
defers image decode more aggressively than Blink, and revoking the backing blob between `onload` and
`drawImage` is a known source of **blank draws in Safari**.

🔴 **But this does NOT produce your symptom.** `naturalWidth` remains 640 after load, so the loader
returns a valid image, `if (hgLogo)` passes, and the **text fallback never runs** — you would get an
*empty corner*, not "Powered by HatchGrab". **You saw the text, so this is not what happened.** Reported
because it is a real latent Safari risk on the same line, and because it is the thing to look at if the
answer to the discriminator above is "localhost".

⚠️ **A second, subtler point on the same block:** `img.onerror = () => resolve()` treats failure as
success and lets the `naturalWidth` check downstream decide. That is correct, but it means **a decode
failure and a successful load are indistinguishable in the logs — there are none.** Nothing anywhere
reports *why* the loader returned null.

---

# ALSO REPORTED (not acted on) — THE BRANDING STRIP

**Geometry**, from [generateQRCode.ts:154-158](lib/generateQRCode.ts#L154) and
[:196-214](lib/generateQRCode.ts#L196): `qrX = 50`, `qrSize = 400`, `rightX = 450`. The strip spans
**x = 50 → 450, i.e. 400px**. The truck name is drawn **left-aligned at x = 50**; the logo is
**right-aligned to x = 450**.

| | Logo width `round((nw/nh) × 28)` | Logo occupies | **Space left for the name** |
|---|---|---|---|
| Pre-crop (640 × 161) | 640/161 × 28 = **111px** | x 339 → 450 | **289px** |
| **Now (640 × 141)** | 640/141 × 28 = **127px** | x **323 → 450** | **273px** |

🔴 **The name has 273px, down 16px from 289px.**

## "Real Thai Food" — ✅ fits, comfortably

At `bold 22px Arial` ([:201](lib/generateQRCode.ts#L201)), "Real Thai Food" (12 letters + 2 spaces)
measures **≈163px**. Against 273px that leaves **≈110px of clearance**. **No collision.**

## ⚠️ But a long name **overlaps** — it does not truncate

[:203](lib/generateQRCode.ts#L203) is `ctx.fillText(truckName, qrX, brandingY)`. **`fillText` accepts an
optional `maxWidth` argument and it is not passed**, so there is **no clamping, no ellipsis, no wrap**.
A name wider than 273px simply renders *underneath* the logo.

**The threshold is ≈23 characters** at this font (≈11.6px average advance). Live names already close to
it: **"Noodle and Dumpling Bar" (23)**, **"Kezmet Turkish Kitchen" (22)**, "Rural Coffee Caravan" (20),
"Suffolk Spice Fusion" (20). **Reported only — not acted on.** *(The single-argument fix would be passing
`273` as `maxWidth`, which squashes rather than truncates; a proper fix is a measure-and-ellipsis loop.)*

---

# 2. EMAIL BRANDING INVENTORY — REPORT ONLY

## ✅ THE TWO ANSWERS YOU ASKED FOR, FIRST

| Question | Answer |
|---|---|
| **Customer-facing emails rendering a HatchGrab logo?** | 🟢 **NO — none.** `lib/email.ts` contains **0** `<img>` tags; `app/api/dashboard/action/route.ts` contains **0**. Every customer email is **text-only**, carrying a *"Powered by HatchGrab"* text credit and nothing more |
| **Operator-facing emails rendering the Village Foodie logo?** | 🟢 **NO — none.** `VF_LOGO_URL` ([email-config.ts:39](lib/email-config.ts#L39)) has **ZERO consumers** — grep returns only its own declaration. **No email renders the VF logo at all** |

🔴 **Neither mismatch exists.** Only **three** templates render any image, and **all three are
operator-facing HatchGrab emails**.

## Full inventory

| # | file:line | FROM → TO | Image | Footer credit |
|---|---|---|---|---|
| 1 | [demo/save-email:87](app/api/demo/save-email/route.ts#L87) | **HatchGrab → prospective operator** (demo visitor) | 🖼️ **HatchGrab logo** | — |
| 2 | [admin/create-operator:109](app/api/admin/create-operator/route.ts#L109) | **HatchGrab → new operator** | 🖼️ **HatchGrab logo** | `Welcome aboard,<br/>Dominic<br/>HatchGrab` ([:134](app/api/admin/create-operator/route.ts#L134)) |
| 3 | [manage:1170](app/api/manage/route.ts#L1170) | **HatchGrab → invited team member** (*"You've been invited to join {truck} on HatchGrab"*) | 🖼️ **HatchGrab logo** | `HatchGrab` ([:1190](app/api/manage/route.ts#L1190)) |
| 4 | [auth/forgot-password:84](app/api/auth/forgot-password/route.ts#L84) | HatchGrab → operator | ❌ none | `HatchGrab` ([:72](app/api/auth/forgot-password/route.ts#L72)) |
| 5 | [auth/resend-verification:65](app/api/auth/resend-verification/route.ts#L65) | HatchGrab → operator | ❌ none | — |
| 6 | [auth/change-email:77](app/api/auth/change-email/route.ts#L77) | HatchGrab → operator | ❌ none | — |
| 7 | [signup:155](app/api/signup/route.ts#L155) | HatchGrab → new operator (*"Confirm your email address"*) | ❌ none | — |
| 8 | [demo/build-request:62](app/api/demo/build-request/route.ts#L62) | HatchGrab → **HatchGrab** (internal, to `replyTo`) | ❌ none | — |
| 9 | [cron/demo-cleanup:86](app/api/cron/demo-cleanup/route.ts#L86) | HatchGrab → **HatchGrab** (internal) | ❌ none | — |
| 10 | [lib/email.ts:79](lib/email.ts#L79) `formatConfirmationEmail` | **Truck → customer** (sender name = truck, [:386](lib/email.ts#L386)) | ❌ none | `Powered by <a…>HatchGrab</a>` ([:241](lib/email.ts#L241), orange `#ea580c`) · text version *"Powered by HatchGrab — hatchgrab.com"* ([:305](lib/email.ts#L305)) |
| 11 | [lib/email.ts:319](lib/email.ts#L319) `formatNewOrderEmail` | **Truck → operator** (new-order alert) | ❌ none | — |
| 12 | [lib/email.ts:403](lib/email.ts#L403) `sendCancellationEmail` | **Truck → customer** | ❌ none | `Powered by HatchGrab · hatchgrab.com` ([:425](lib/email.ts#L425)) |
| 13 | [lib/email.ts:437](lib/email.ts#L437) `sendEventCancellationEmail` | **Truck → customer** | ❌ none | `Powered by HatchGrab · hatchgrab.com` ([:466](lib/email.ts#L466)) |
| 14 | [dashboard/action:284](app/api/dashboard/action/route.ts#L284) | **Truck → customer** (sender `{name: truckName \|\| 'HatchGrab'}`, [:120](app/api/dashboard/action/route.ts#L120)) | ❌ none | `Powered by HatchGrab · hatchgrab.com` |
| 15 | [dashboard/action:317](app/api/dashboard/action/route.ts#L317) | **Truck → customer** | ❌ none | `Powered by HatchGrab · hatchgrab.com` |
| 16 | [dashboard/action:737](app/api/dashboard/action/route.ts#L737) | **Truck → customer** | ❌ none | `Pay at the truck on collection · Powered by HatchGrab · hatchgrab.com` |

## ⚠️ Width-without-height — **all three logo images**

| file:line | Attributes |
|---|---|
| [demo/save-email:87](app/api/demo/save-email/route.ts#L87) | `width="180"` — **no height** |
| [admin/create-operator:109-110](app/api/admin/create-operator/route.ts#L109) | `width="180"` — **no height** |
| [manage:1170-1171](app/api/manage/route.ts#L1170) | `width="180"` — **no height** |

**No image anywhere has a height without a width.** ✅ **And width-only is the correct choice for email**:
a lone width lets the client derive height from the intrinsic image, so these **self-corrected** when the
artwork was re-cropped from 3.97:1 to 4.548:1 — a hardcoded pair would have squashed them. *(They now
render 180 × 40 instead of 180 × 45.)*

## ⚠️ Two observations, reported not acted on

1. **`HATCHGRAB_SENDER.email` is `hello@villagefoodie.co.uk`** ([email-config.ts:12](lib/email-config.ts#L12))
   — every HatchGrab-branded email is sent **from a Village Foodie address**. The file's own TODO says it
   waits on `hello@hatchgrab.com` being set up in Brevo with SPF/DKIM. **A from-address mismatch, not a
   logo one** — outside what you asked, but it is the same brand-boundary question.
2. **`VF_LOGO_URL` is dead code** — declared, never imported.

---

## What I could NOT verify

- 🔴 **I could not reproduce the QR failure**, and cannot without knowing **which host Safari was pointed
  at**. That single answer decides between "ship the asset" and "there is a second bug". Everything else
  in section 1 is read from source and from `git`.
- 🔴 **I did not open the QR poster or generate one.** The 127px logo width, the 273px name budget and the
  ≈163px measurement of "Real Thai Food" are **arithmetic from the source constants and font metrics**,
  not measured pixels. The ≈23-character overlap threshold carries the same ±10-15% estimate error as my
  earlier text-width work — treat it as "around 20-25 characters", not a hard number.
- **The Safari revoke-before-draw hazard is asserted from WebKit behaviour**, not observed here. I am
  confident it is *not* the current cause (the symptom would be a blank corner, not the text), but I have
  not proven it is harmless in this codebase either.
- **The email inventory is from grep + reading each sender/subject**, not from sending anything. Recipient
  classification for #10-16 rests on the sender name being the truck and the templates addressing a
  customer by name; I did not trace every call site that invokes them.
- **I did not check whether any email template is rendered by a service outside this repo** (e.g. a Brevo
  template ID), which would not appear in a source grep.
