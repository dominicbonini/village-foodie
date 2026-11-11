// lib/store-badge-files.ts — 🔴 THE STORE BADGES IN EVERY LANGUAGE (store-badges-1, 2 November 2026; docs/store-badges-1-report.md).
//
// Each vendor's OWN localized badge for each of the site's 28 language bases, downloaded unmodified from the vendor
// (public/badges/README.md lists every file, its source URL and the download date; scripts/fixtures/store-badges-1-manifest.json
// holds each file's sha256, checked by scripts/store-badges-1.cjs). The width and height are each FILE'S OWN (the SVG's viewBox, or a
// PNG's pixels), so a badge is sized by height and keeps its own aspect ratio — never stretched to match the other.
// badges-manual-1 (8 November 2026): Google's badges are its own full-bleed localized SVGs (zh-HK: a PNG with a transparent margin,
// `inset`), so every Google badge's VISIBLE height is the App Store badge's (components/StoreBadges.tsx).
// 🔴 NEVER EDITED, RECOLOURED, CROPPED OR RE-LETTERED: both vendors forbid it, and "App Store" is never translated.
// The English badges are the files that were here before (the three SVGs directly in public/badges, names unchanged): every English locale, and any
// language without a file of its own. languages-world-1 (10 November 2026): + tr-TR, ko-KR, zh-TW, id-ID, vi-VN, he-IL (both vendors) and is-IS,
// sr-RS (Google only: Apple publishes no Icelandic or Serbian badge, so badgeFor gives those pages Apple's English one). A regional variant reads its base's badge (de-AT → de-DE, es-MX → es-ES, fr-LU → fr-FR,
// nl-BE → nl-NL, el-CY → el-GR, de-CH / de-LI → de-DE).
import { overrideChain, type AppLocale } from '@/lib/i18n/locales'
import { APP_STORE_BADGE_SRC, GOOGLE_PLAY_BADGE_SRC } from '@/lib/app-badges'

/** A badge file: its src and its OWN width × height (SVG viewBox or PNG pixels). badges-manual-1: `inset` — a transparent margin built
 *  into the file (same units), which StoreBadges cancels with negative margins so only the visible badge takes up room. Absent: full-bleed. */
export interface BadgeFile { src: string; width: number; height: number; inset?: { top: number; bottom: number } }

/** Apple's English badge (the black US-UK file) and Google's English one — the files that were here before. */
export const APPLE_ENGLISH: BadgeFile = { src: APP_STORE_BADGE_SRC, width: 119.66407, height: 40 }
export const GOOGLE_ENGLISH: BadgeFile = { src: GOOGLE_PLAY_BADGE_SRC, width: 238.96, height: 70.87 }

/** Apple's black "Download on the App Store" badge per language base (toolbox.marketingtools.apple.com). */
export const APPLE_BADGES: Readonly<Record<string, BadgeFile>> = {
  'fr-FR': { src: '/badges/apple/fr-FR.svg', width: 126.50751, height: 40 },
  'de-DE': { src: '/badges/apple/de-DE.svg', width: 119.66407, height: 40 },
  'es-ES': { src: '/badges/apple/es-ES.svg', width: 119.66407, height: 40 },
  'it-IT': { src: '/badges/apple/it-IT.svg', width: 119.66407, height: 40 },
  'pt-PT': { src: '/badges/apple/pt-PT.svg', width: 119.66407, height: 40 },
  'nl-NL': { src: '/badges/apple/nl-NL.svg', width: 119.66407, height: 40 },
  'sv-SE': { src: '/badges/apple/sv-SE.svg', width: 119.66407, height: 40 },
  'da-DK': { src: '/badges/apple/da-DK.svg', width: 119.66407, height: 40 },
  'nb-NO': { src: '/badges/apple/nb-NO.svg', width: 119.66407, height: 40 },
  'pl-PL': { src: '/badges/apple/pl-PL.svg', width: 119.66407, height: 40 },
  'cs-CZ': { src: '/badges/apple/cs-CZ.svg', width: 119.66407, height: 40 },
  'hu-HU': { src: '/badges/apple/hu-HU.svg', width: 150.72179, height: 40 },
  'sk-SK': { src: '/badges/apple/sk-SK.svg', width: 119.66407, height: 40 },
  'ro-RO': { src: '/badges/apple/ro-RO.svg', width: 119.66407, height: 40 },
  'hr-HR': { src: '/badges/apple/hr-HR.svg', width: 130.139, height: 41 },
  'sl-SI': { src: '/badges/apple/sl-SI.svg', width: 119.66407, height: 40 },
  'fi-FI': { src: '/badges/apple/fi-FI.svg', width: 142.85157, height: 40 },
  'et-EE': { src: '/badges/apple/et-EE.svg', width: 142.16954, height: 40 },
  'lv-LV': { src: '/badges/apple/lv-LV.svg', width: 119.66407, height: 40 },
  'lt-LT': { src: '/badges/apple/lt-LT.svg', width: 119.66407, height: 40 },
  'el-GR': { src: '/badges/apple/el-GR.svg', width: 119.66407, height: 40 },
  'bg-BG': { src: '/badges/apple/bg-BG.svg', width: 119.66407, height: 40 },
  'pt-BR': { src: '/badges/apple/pt-BR.svg', width: 119.66407, height: 40 },
  'ms-MY': { src: '/badges/apple/ms-MY.svg', width: 119.66407, height: 40 },
  'ja-JP': { src: '/badges/apple/ja-JP.svg', width: 108.85157, height: 40 },
  'zh-HK': { src: '/badges/apple/zh-HK.svg', width: 108.85157, height: 40 },
  'th-TH': { src: '/badges/apple/th-TH.svg', width: 119.66407, height: 40 },
  'ar-AE': { src: '/badges/apple/ar-AE.svg', width: 119.66408, height: 40.00013 },
  'tr-TR': { src: '/badges/apple/tr-TR.svg', width: 151.29018, height: 40 },  // languages-world-1
  'ko-KR': { src: '/badges/apple/ko-KR.svg', width: 129.70071, height: 40 },  // languages-world-1
  'zh-TW': { src: '/badges/apple/zh-TW.svg', width: 108.85157, height: 40 },  // languages-world-1
  'id-ID': { src: '/badges/apple/id-ID.svg', width: 119.66407, height: 40 },  // languages-world-1
  'vi-VN': { src: '/badges/apple/vi-VN.svg', width: 119.66407, height: 40 },  // languages-world-1
  'he-IL': { src: '/badges/apple/he-IL.svg', width: 121.664, height: 42 },  // languages-world-1
}

/** Google's "Get it on Google Play" badge per language base. badges-manual-1 (8 November 2026): Google's own FULL-BLEED localized
 *  SVG from the Google Play Partner Marketing Hub (27 languages; the dimensions are each file's viewBox), the same artwork family as the
 *  English badge. zh-HK keeps the PNG from Google's badge page (646 × 250): Google publishes no Hong Kong SVG, and its Taiwan SVG has
 *  different words. That PNG carries a TRANSPARENT MARGIN of 29px above and below its 192px-high badge — `inset`, in the file's own
 *  pixels — which components/StoreBadges.tsx cancels in layout so the VISIBLE badge is the App Store badge's height. */
export const GOOGLE_BADGES: Readonly<Record<string, BadgeFile>> = {
  'fr-FR': { src: '/badges/google/fr-FR.svg', width: 238.96, height: 70.87 },
  'de-DE': { src: '/badges/google/de-DE.svg', width: 238.96, height: 70.87 },
  'es-ES': { src: '/badges/google/es-ES.svg', width: 238.96, height: 70.87 },
  'it-IT': { src: '/badges/google/it-IT.svg', width: 238.96, height: 70.87 },
  'pt-PT': { src: '/badges/google/pt-PT.svg', width: 238.96, height: 70.87 },
  'nl-NL': { src: '/badges/google/nl-NL.svg', width: 238.96, height: 70.87 },
  'sv-SE': { src: '/badges/google/sv-SE.svg', width: 238.96, height: 70.87 },
  'da-DK': { src: '/badges/google/da-DK.svg', width: 238.96, height: 70.87 },
  'nb-NO': { src: '/badges/google/nb-NO.svg', width: 238.96, height: 70.87 },
  'pl-PL': { src: '/badges/google/pl-PL.svg', width: 239.53, height: 70.87 },
  'cs-CZ': { src: '/badges/google/cs-CZ.svg', width: 238.96, height: 70.87 },
  'hu-HU': { src: '/badges/google/hu-HU.svg', width: 238.96, height: 70.87 },
  'sk-SK': { src: '/badges/google/sk-SK.svg', width: 238.96, height: 70.87 },
  'ro-RO': { src: '/badges/google/ro-RO.svg', width: 238.96, height: 70.87 },
  'hr-HR': { src: '/badges/google/hr-HR.svg', width: 238.96, height: 70.87 },
  'sl-SI': { src: '/badges/google/sl-SI.svg', width: 238.96, height: 70.87 },
  'fi-FI': { src: '/badges/google/fi-FI.svg', width: 238.96, height: 70.87 },
  'et-EE': { src: '/badges/google/et-EE.svg', width: 238.96, height: 70.87 },
  'lv-LV': { src: '/badges/google/lv-LV.svg', width: 238.96, height: 70.87 },
  'lt-LT': { src: '/badges/google/lt-LT.svg', width: 238.96, height: 70.87 },
  'el-GR': { src: '/badges/google/el-GR.svg', width: 238.96, height: 70.87 },
  'bg-BG': { src: '/badges/google/bg-BG.svg', width: 238.96, height: 70.87 },
  'pt-BR': { src: '/badges/google/pt-BR.svg', width: 238.96, height: 70.87 },
  'ms-MY': { src: '/badges/google/ms-MY.svg', width: 238.96, height: 70.87 },
  'ja-JP': { src: '/badges/google/ja-JP.svg', width: 180, height: 53.333599 },
  'zh-HK': { src: '/badges/google/zh-HK.png', width: 646, height: 250, inset: { top: 29, bottom: 29 } },
  'th-TH': { src: '/badges/google/th-TH.svg', width: 238.96, height: 70.87 },
  'ar-AE': { src: '/badges/google/ar-AE.svg', width: 238.96, height: 70.87 },
  'tr-TR': { src: '/badges/google/tr-TR.svg', width: 238.96, height: 70.87 },  // languages-world-1
  'ko-KR': { src: '/badges/google/ko-KR.svg', width: 238.96, height: 70.87 },  // languages-world-1
  'zh-TW': { src: '/badges/google/zh-TW.svg', width: 238.96, height: 70.87 },  // languages-world-1
  'id-ID': { src: '/badges/google/id-ID.svg', width: 238.96, height: 70.87 },  // languages-world-1
  'vi-VN': { src: '/badges/google/vi-VN.svg', width: 238.96, height: 70.87 },  // languages-world-1
  'he-IL': { src: '/badges/google/he-IL.svg', width: 238.96, height: 70.87 },  // languages-world-1
  'is-IS': { src: '/badges/google/is-IS.svg', width: 238.96, height: 70.87 },  // languages-world-1
  'sr-RS': { src: '/badges/google/sr-RS.svg', width: 238.96, height: 70.87 },  // languages-world-1
}


/** The badge for a page in `locale`: its own file, else its base's (a regional variant), else the English one. */
export function badgeFor(vendor: 'apple' | 'google', locale: string | null | undefined): BadgeFile {
  const files = vendor === 'apple' ? APPLE_BADGES : GOOGLE_BADGES
  const chain = locale ? [...overrideChain(locale as AppLocale)].reverse() : []
  for (const l of chain) if (files[l]) return files[l]
  return vendor === 'apple' ? APPLE_ENGLISH : GOOGLE_ENGLISH
}
