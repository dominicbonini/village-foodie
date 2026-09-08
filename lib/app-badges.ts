// lib/app-badges.ts
//
// ── BOTH STORES, ONE FILE. THE LISTINGS AND THE ARTWORK THAT LINKS TO THEM. ──────────────────────
//
// 🔴 THESE LIVED IN components/landing/LandingFooter.tsx AND MOVED HERE ON 5 SEPTEMBER 2026, when a
// second surface needed them (Manage → Settings). Two surfaces reading one constant is the point: an
// App Store URL copied into a dashboard would be correct on the day it was pasted and wrong the first
// time a listing moved — the same duplication failure this codebase keeps recording for field labels,
// fee tables and DNS record rules.
// ⚠️ NOTHING ELSE MOVED WITH THEM. `LandingFooter` re-exports `APP_STORE_URL` so any existing importer
// is unaffected, and the badge MARKUP is `components/StoreBadges.tsx` — this file holds data only.
//
// ⚠️ A PLAIN .ts MODULE WITH NO IMPORTS, deliberately. Manage → Settings must not pull a landing-page
// component (and its stylesheet) into its bundle just to read two strings.

export const APP_STORE_URL = 'https://apps.apple.com/gb/app/hatchgrab/id6803543106'

/**
 * Apple's official badge — **BLACK**, and that is required rather than preferred. Apple: *"Whenever one
 * or more badges for other app platforms appear in the layout, use the preferred black badge. Place the
 * App Store badge first in the lineup of badges."* Both halves of that rule now bind, because the Play
 * badge exists. 🔴 UNMODIFIED VENDOR ARTWORK — see public/badges/README.md.
 * ⚠️ The white variant stays on disk and is the right file only if a surface ever goes light.
 */
export const APP_STORE_BADGE_SRC = '/badges/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg'

/**
 * ── THE GOOGLE PLAY LISTING. SUPPLIED BY DOMINIC, 5 SEPTEMBER 2026. ─────────────────────────────
 *
 * 🔴 PASTED VERBATIM AS GIVEN, INCLUDING `&hl=en`. It was NOT constructed from the package name in
 * `capacitor.config.ts`, NOT taken from a search result, and NOT trimmed or "tidied" — the value in a
 * store URL is that somebody opened it, and an edited one has not been.
 * ⚠️ ONE OBSERVATION, NOT A CHANGE: `hl=en` pins the listing's language to English rather than letting
 * Play follow the visitor's locale. For a UK food-truck audience that is indistinguishable from the
 * default, so it is left exactly as supplied. Remove the parameter only if the listing is ever
 * translated, and only on Dominic's word.
 *
 * ⚠️ THE GUARD STAYS EVEN THOUGH THE VALUE IS NOW REAL. `{GOOGLE_PLAY_URL && …}` costs nothing and
 * means the badge can never render pointing at an empty string if this is ever cleared.
 */
export const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.hatchgrab.app&hl=en'

/**
 * Google's official badge, filed alongside Apple's in `public/badges/` on 5 September 2026 and written
 * byte-for-byte as supplied. 🔴 UNMODIFIED VENDOR ARTWORK — Google's brand terms forbid altering it,
 * exactly as Apple's do.
 * ⚠️ `.svg`, NOT `.png` — this constant briefly named a `.png` that never existed. The supplied file is
 * an SVG and the extension must match it or the badge is a broken image.
 *
 * ── 🟢 WHY THE PAIR MATCHES AT height:40px, VERIFIED RATHER THAN ASSUMED ────────────────────────
 * Google's badge is sometimes shipped with built-in clear space, which would make it read SMALLER than
 * Apple's at the same height. This one is not: its first element is
 * `<rect x="-.11" width="239.17" height="70.87" rx="8.86">` — a FULL-BLEED rounded rectangle filling the
 * whole viewBox, the same shape as Apple's black badge. So both are 40px-tall pills and
 * `.foot-badge img { height: 40px; width: auto }` sizes them as a matched pair.
 * ⚠️ THE WIDTHS DIFFER AND THAT IS CORRECT: 238.96 × 70.87 at height 40 is **134.87px** wide against
 * Apple's 119.66px. Same height, different word count. Do not "fix" it by forcing equal widths — that
 * would scale one of them off-ratio, which both vendors forbid.
 */
export const GOOGLE_PLAY_BADGE_SRC = '/badges/GetItOnGooglePlay_Badge_Web_color_English.svg'
