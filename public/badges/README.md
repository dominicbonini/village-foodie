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


## Every language (store-badges-1, 2 November 2026)

Each vendor's **own** localized badge for each of the site's 28 language bases, **downloaded unmodified** from the vendor on
**2 November 2026** and written to disk byte-for-byte. **Nothing was edited, recoloured, cropped, re-lettered or redrawn** — both
vendors forbid it, and "App Store" is never translated. Checked by eye: Apple's own files keep "App Store" in English;
Apple's **Croatian** badge declines it the Croatian way ("Preuzmi u App Store**u**") — that is Apple's artwork, unmodified. The English files above keep their
names and stay the English badges (every English locale, and any language without a file of its own).

- **Apple** — the **black** "Download on the App Store" badge, **SVG**, from Apple's marketing tools
  (`toolbox.marketingtools.apple.com`, an apple.com host; `tools.applemarketingtools.com` did not resolve from here). Norwegian is
  Apple's `no-no`, Arabic Apple's `ar-ar`. Each file keeps its OWN size: most are 119.66 × 40, but French, Hungarian, Croatian
  (130.14 × 41), Finnish, Estonian, Japanese and Chinese are wider or narrower.
- **Google** — the "Get it on Google Play" badge from Google's badge page (`play.google.com/intl/…/badges`). **Google offers no
  SVG there, so it is the PNG, 646 × 250** — 6.25× our 40 px display height (at least 3× was asked). ~~Full-bleed (no built-in
  margin), so it sizes by height like the English one.~~ ⛔ **Corrected badges-manual-1 (8 November 2026):** those PNGs carry a
  transparent margin (29 px above and below the badge), so they read smaller than Apple's — 27 are now Google's full-bleed SVGs from the
  Partner Marketing Hub, and zh-HK's margin is cancelled in layout (see the Google table below). Portuguese (Portugal) is Google's `pt`, Norwegian `no`.
- **No English fallback was needed:** both vendors have a badge for all 28 languages.
- Regional variants read their base's file (de-AT / de-CH / de-LI → de-DE, es-MX → es-ES, fr-LU → fr-FR, nl-BE → nl-NL,
  el-CY → el-GR) — `lib/store-badge-files.ts` `badgeFor`.
- Every file's sha256 is in `scripts/fixtures/store-badges-1-manifest.json`; `scripts/store-badges-1.cjs` checks each file on disk
  against it.
- **Shown only where the app is available:** `components/StoreBadges.tsx` renders Apple's badge only where the page's country has
  `ios_app_available`, Google's only where it has `android_app_available` (35.ak-7), Apple first, and nothing at all when neither.

### Apple — `apple/`

| File | Language | Source URL | Downloaded |
|---|---|---|---|
| `apple/fr-FR.svg` | French (France) (fr-FR) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/fr-fr | 2026-11-02 |
| `apple/de-DE.svg` | German (Germany) (de-DE) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/de-de | 2026-11-02 |
| `apple/es-ES.svg` | European Spanish (es-ES) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/es-es | 2026-11-02 |
| `apple/it-IT.svg` | Italian (Italy) (it-IT) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/it-it | 2026-11-02 |
| `apple/pt-PT.svg` | European Portuguese (pt-PT) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/pt-pt | 2026-11-02 |
| `apple/nl-NL.svg` | Dutch (Netherlands) (nl-NL) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/nl-nl | 2026-11-02 |
| `apple/sv-SE.svg` | Swedish (Sweden) (sv-SE) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/sv-se | 2026-11-02 |
| `apple/da-DK.svg` | Danish (Denmark) (da-DK) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/da-dk | 2026-11-02 |
| `apple/nb-NO.svg` | Norwegian Bokmål (Norway) (nb-NO) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/no-no | 2026-11-02 |
| `apple/pl-PL.svg` | Polish (Poland) (pl-PL) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/pl-pl | 2026-11-02 |
| `apple/cs-CZ.svg` | Czech (Czechia) (cs-CZ) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/cs-cz | 2026-11-02 |
| `apple/hu-HU.svg` | Hungarian (Hungary) (hu-HU) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/hu-hu | 2026-11-02 |
| `apple/sk-SK.svg` | Slovak (Slovakia) (sk-SK) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/sk-sk | 2026-11-02 |
| `apple/ro-RO.svg` | Romanian (Romania) (ro-RO) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/ro-ro | 2026-11-02 |
| `apple/hr-HR.svg` | Croatian (Croatia) (hr-HR) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/hr-hr | 2026-11-02 |
| `apple/sl-SI.svg` | Slovenian (Slovenia) (sl-SI) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/sl-si | 2026-11-02 |
| `apple/fi-FI.svg` | Finnish (Finland) (fi-FI) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/fi-fi | 2026-11-02 |
| `apple/et-EE.svg` | Estonian (Estonia) (et-EE) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/et-ee | 2026-11-02 |
| `apple/lv-LV.svg` | Latvian (Latvia) (lv-LV) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/lv-lv | 2026-11-02 |
| `apple/lt-LT.svg` | Lithuanian (Lithuania) (lt-LT) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/lt-lt | 2026-11-02 |
| `apple/el-GR.svg` | Greek (Greece) (el-GR) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/el-gr | 2026-11-02 |
| `apple/bg-BG.svg` | Bulgarian (Bulgaria) (bg-BG) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/bg-bg | 2026-11-02 |
| `apple/pt-BR.svg` | Brazilian Portuguese (pt-BR) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/pt-br | 2026-11-02 |
| `apple/ms-MY.svg` | Malay (Malaysia) (ms-MY) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/ms-my | 2026-11-02 |
| `apple/ja-JP.svg` | Japanese (Japan) (ja-JP) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/ja-jp | 2026-11-02 |
| `apple/zh-HK.svg` | Chinese (Hong Kong SAR China) (zh-HK) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/zh-hk | 2026-11-02 |
| `apple/th-TH.svg` | Thai (Thailand) (th-TH) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/th-th | 2026-11-02 |
| `apple/ar-AE.svg` | Arabic (United Arab Emirates) (ar-AE) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/ar-ar | 2026-11-02 |
| `apple/tr-TR.svg` | Turkish (Türkiye) (tr-TR) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/tr-tr | 2026-11-10 |
| `apple/ko-KR.svg` | Korean (South Korea) (ko-KR) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/ko-kr | 2026-11-10 |
| `apple/zh-TW.svg` | Chinese, Traditional (Taiwan) (zh-TW) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/zh-tw | 2026-11-10 |
| `apple/id-ID.svg` | Indonesian (Indonesia) (id-ID) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/id-id | 2026-11-10 |
| `apple/vi-VN.svg` | Vietnamese (Vietnam) (vi-VN) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/vi-vn | 2026-11-10 |
| `apple/he-IL.svg` | Hebrew (Israel) (he-IL) | https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/he-il | 2026-11-10 |

### Google — `google/`

**badges-manual-1 (8 November 2026): 27 languages replaced by Google's own FULL-BLEED localized SVG.** The PNGs from Google's badge
page carry a built-in transparent margin — 29 px above and below a 192 px-high badge in a 250 px image (Arabic: margins on all four
sides) — so at `height: 40px` their visible badge was only ~31 px, visibly smaller than Apple's (the store-badges-1 note "full-bleed (no
built-in margin)" was wrong; measured). The Google Play **Partner Marketing Hub** (Google's own site, the "Get it on Google Play Badges"
→ Digital → svg folder) publishes the badge as SVG in every language we need, the same artwork family and the same 238.96 × 70.87
viewBox as our English file (Google's current English SVG there renders pixel-identical to ours). Each file was downloaded unmodified on
**8 November 2026**, written byte-for-byte, renamed to the locale; its original filename is in the table and in the manifest. Verified by
eye against the old PNG: same words in every language except **Spanish** ("DESCARGAR EN", was "DISPONIBLE EN") and **Finnish** ("LATAA SE
Google Play", was "Google Playsta") — Google's current wording. Norwegian is Google's "Norwegian", Malay its "Malaysian", Arabic its
"Arabic-Saudi-Arabia", Japanese its only file ("Print_color_Japanese", the same full-bleed shape), Portuguese its "-Portugal" / "-Brazil",
Spanish its "Spanish" (Spain; "-LATAM" is separate). **zh-HK stays the PNG**: the hub has no Hong Kong file and its Traditional Chinese
"Taiwan" SVG has different words ("立即下載" under the logo) — so its transparent margin is cancelled in layout instead
(`lib/store-badge-files.ts` `inset`, `components/StoreBadges.tsx`). Google's rule there: *"make sure the Google Play badge is the same size
or larger than the other badges"* — equal visible heights satisfy it.

| File | Language | Source URL | Downloaded |
|---|---|---|---|
| `google/fr-FR.svg` | French (France) (fr-FR) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_French.svg`) | 2026-11-08 |
| `google/de-DE.svg` | German (Germany) (de-DE) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_German.svg`) | 2026-11-08 |
| `google/es-ES.svg` | European Spanish (es-ES) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Spanish.svg`) | 2026-11-08 |
| `google/it-IT.svg` | Italian (Italy) (it-IT) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Italian.svg`) | 2026-11-08 |
| `google/pt-PT.svg` | European Portuguese (pt-PT) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Portuguese-Portugal.svg`) | 2026-11-08 |
| `google/nl-NL.svg` | Dutch (Netherlands) (nl-NL) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Dutch.svg`) | 2026-11-08 |
| `google/sv-SE.svg` | Swedish (Sweden) (sv-SE) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Swedish.svg`) | 2026-11-08 |
| `google/da-DK.svg` | Danish (Denmark) (da-DK) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Danish.svg`) | 2026-11-08 |
| `google/nb-NO.svg` | Norwegian Bokmål (Norway) (nb-NO) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Norwegian.svg`) | 2026-11-08 |
| `google/pl-PL.svg` | Polish (Poland) (pl-PL) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Polish.svg`) | 2026-11-08 |
| `google/cs-CZ.svg` | Czech (Czechia) (cs-CZ) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Czech.svg`) | 2026-11-08 |
| `google/hu-HU.svg` | Hungarian (Hungary) (hu-HU) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Hungarian.svg`) | 2026-11-08 |
| `google/sk-SK.svg` | Slovak (Slovakia) (sk-SK) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Slovak.svg`) | 2026-11-08 |
| `google/ro-RO.svg` | Romanian (Romania) (ro-RO) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Romanian.svg`) | 2026-11-08 |
| `google/hr-HR.svg` | Croatian (Croatia) (hr-HR) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Croatian.svg`) | 2026-11-08 |
| `google/sl-SI.svg` | Slovenian (Slovenia) (sl-SI) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Slovenian.svg`) | 2026-11-08 |
| `google/fi-FI.svg` | Finnish (Finland) (fi-FI) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Finnish.svg`) | 2026-11-08 |
| `google/et-EE.svg` | Estonian (Estonia) (et-EE) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Estonian.svg`) | 2026-11-08 |
| `google/lv-LV.svg` | Latvian (Latvia) (lv-LV) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Latvian.svg`) | 2026-11-08 |
| `google/lt-LT.svg` | Lithuanian (Lithuania) (lt-LT) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Lithuanian.svg`) | 2026-11-08 |
| `google/el-GR.svg` | Greek (Greece) (el-GR) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Greek.svg`) | 2026-11-08 |
| `google/bg-BG.svg` | Bulgarian (Bulgaria) (bg-BG) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Bulgarian.svg`) | 2026-11-08 |
| `google/pt-BR.svg` | Brazilian Portuguese (pt-BR) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Portuguese-Brazil.svg`) | 2026-11-08 |
| `google/ms-MY.svg` | Malay (Malaysia) (ms-MY) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Malaysian.svg`) | 2026-11-08 |
| `google/ja-JP.svg` | Japanese (Japan) (ja-JP) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Print_color_Japanese.svg`) | 2026-11-08 |
| `google/zh-HK.png` | Chinese (Hong Kong SAR China) (zh-HK) | https://play.google.com/intl/en_us/badges/static/images/badges/zh-hk_badge_web_generic.png | 2026-11-02 |
| `google/th-TH.svg` | Thai (Thailand) (th-TH) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Thai.svg`) | 2026-11-08 |
| `google/ar-AE.svg` | Arabic (United Arab Emirates) (ar-AE) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Arabic-Saudi-Arabia.svg`) | 2026-11-08 |
| `google/tr-TR.svg` | Turkish (Türkiye) (tr-TR) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Turkish.svg`) | 2026-11-10 |
| `google/ko-KR.svg` | Korean (South Korea) (ko-KR) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Korean.svg`) | 2026-11-10 |
| `google/zh-TW.svg` | Chinese, Traditional (Taiwan) (zh-TW) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Chinese-Taiwan.svg`) | 2026-11-10 |
| `google/id-ID.svg` | Indonesian (Indonesia) (id-ID) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Indonesian.svg`) | 2026-11-10 |
| `google/vi-VN.svg` | Vietnamese (Vietnam) (vi-VN) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Vietnamese.svg`) | 2026-11-10 |
| `google/he-IL.svg` | Hebrew (Israel) (he-IL) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Hebrew.svg`) | 2026-11-10 |
| `google/is-IS.svg` | Icelandic (Iceland) (is-IS) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Icelandic.svg`) | 2026-11-10 |
| `google/sr-RS.svg` | Serbian (Serbia; Google’s badge is Cyrillic) (sr-RS) | https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718 (`GetItOnGooglePlay_Badge_Web_color_Serbian.svg`) | 2026-11-10 |

*languages-world-1 (10 November 2026): Apple publishes no Icelandic or Serbian App Store badge (its toolbox answers 404 and neither language is in Apple’s localized-badge list), so is-IS and sr-RS pages show Apple’s English badge. Apple’s zh-TW file is byte-identical to zh-HK’s (one Traditional Chinese badge). Google’s Serbian badge is drawn in Cyrillic.*
