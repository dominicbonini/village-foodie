# Store badges — official artwork, filed here so it is findable

**This folder holds vendor artwork, not our own assets. Nothing in it may be edited.**

## What is here

| File | Variant | In use? |
|---|---|---|
| `Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg` | **Black** | ✅ **YES** — the landing footer, under the links (since 2 September 2026) |
| `Download_on_the_App_Store_Badge_US-UK_RGB_wht_092917.svg` | **White** | ❌ Held — correct only if a surface ever goes light |
| `GetItOnGooglePlay_Badge_Web_color_English.svg` | **Colour (full-bleed black field)** | ✅ **YES** — beside the Apple badge, since 5 September 2026 |

Both supplied by Dominic on **2 September 2026** and written to disk **byte-for-byte as received**.
Apple's own filenames are preserved deliberately — they encode the locale (`US-UK`), the colour
(`wht` / `blk`) and Apple's version date code (`092917`). **Do not rename them.**

Native size is **119.66407 × 40** (both files). Rendered at `height: 40px; width: auto`, which is
Apple's onscreen minimum exactly and preserves the aspect ratio with no scaling.

## 🟢 ALREADY ON BLACK — which settles the Android question in advance

Apple, from https://developer.apple.com/app-store/marketing/guidelines/ :

> "**Whenever one or more badges for other app platforms appear in the layout, use the preferred black
> badge.** Place the App Store badge first in the lineup of badges."

The footer briefly used the **white** badge. It was switched to **black** on 2 September 2026 because the
white one read as a bright slab on `bg-slate-900` — and that switch **also removes a future problem**. The
rule above means the day a Play badge is added the Apple badge would have had to become black anyway, and
on a dark footer that would have forced a light panel behind the pair. **Being on black already, adding
the Play badge is now purely additive: one more `<a>`, no colour change, no panel.**
See `docs/footer-badge-position-report.md`.

## Apple's rules that bind any use of these files

- **Minimum size:** 40 px high onscreen; 10 mm high in print.
- **Clear space:** "**Minimum clear space is equal to one-quarter the height of the badge**" — i.e. ≥10px
  on all four sides at our 40px. (Apple's one-tenth relaxation is for "very limited layout space" such as
  mobile banners; a footer is not that.)
- **"Don't modify, angle, or animate the App Store badge."** No recolouring, no rotation, no CSS
  `filter`, no drop-shadow, no hover transform, no rounded corners, no cropping.
- **"Never use the Apple logo in place of the word Apple. Don't use the standalone Apple logo."** Do not
  extract the apple glyph out of these files to use on its own.
- The badge **must link to the App Store product page** for the app.
- Do not re-draw, trace or re-create the badge. If a new variant or locale is needed, download it from
  Apple: https://toolbox.marketingtools.apple.com/app-store/ (also generates the product-page link).

## ⚠️ Not the same thing as `public/apple-touch-icon.png`

That file is **our own** HatchGrab web-clip icon, rendered from `public/icons/hatchgrab-icon.svg`. It has
nothing to do with Apple's marketing artwork and is governed by none of the above.


## The Google Play badge (added 5 September 2026)

Supplied by Dominic on **5 September 2026** and written to disk **byte-for-byte as received**. Google's
own filename is preserved for the same reason Apple's are — it encodes the variant (`color`) and the
language (`English`). **Do not rename it.**

Native size is **238.96 × 70.87**. Rendered at `height: 40px; width: auto` → **134.87px wide**, against
Apple's 119.66px at the same height. 🔴 **THE WIDTHS DIFFER AND THAT IS CORRECT** — same height,
different word count. Forcing them equal would scale one off-ratio, which both vendors forbid.

🟢 **It is FULL-BLEED, which is why the pair matches.** Some Google badge downloads ship with built-in
clear space, which reads visually smaller than Apple's at the same height. This one does not: its first
element is `<rect x="-.11" width="239.17" height="70.87" rx="8.86">`, a rounded rectangle filling the
whole viewBox — the same shape as Apple's black badge. Both are 40px-tall pills.

🟢 **And the black Apple badge was already in place**, which is what Apple requires the moment another
platform's badge appears. Adding this one needed no colour change and no panel — exactly as the section
above predicted on 2 September.

## Where they are used

Both badges render from **one component**, `components/StoreBadges.tsx`, reading **one data module**,
`lib/app-badges.ts`. Two surfaces call it:

| Surface | Notes |
|---|---|
| The landing footer (`components/landing/LandingFooter.tsx`) | styled by `landing.css`'s `.foot-apps` / `.foot-badge` |
| Manage → Settings, the "Get the app" card | 🔴 **web-only** — hidden inside the native shells |

🔴 **APPLE'S BADGE IS FIRST IN THE DOM AND THE WRAPPER HAS NO `order` PROPERTY**, so Apple's *"place the
App Store badge first in the lineup"* holds by construction and cannot be undone in CSS.
