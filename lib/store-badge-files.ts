// lib/store-badge-files.ts — 🔴 THE STORE BADGES IN EVERY LANGUAGE (store-badges-1, 2 November 2026; docs/store-badges-1-report.md).
//
// Each vendor's OWN localized badge for each of the site's 28 language bases, downloaded unmodified from the vendor
// (public/badges/README.md lists every file, its source URL and the download date; scripts/fixtures/store-badges-1-manifest.json
// holds each file's sha256, checked by scripts/store-badges-1.cjs). The width and height are each FILE'S OWN (Apple's SVG viewBox,
// Google's PNG size), so a badge is sized by height and keeps its own aspect ratio — never stretched to match the other.
// 🔴 NEVER EDITED, RECOLOURED, CROPPED OR RE-LETTERED: both vendors forbid it, and "App Store" is never translated.
// The English badges are the files that were here before (the three SVGs directly in public/badges, names unchanged): every English locale, and any
// language without a file of its own. A regional variant reads its base's badge (de-AT → de-DE, es-MX → es-ES, fr-LU → fr-FR,
// nl-BE → nl-NL, el-CY → el-GR, de-CH / de-LI → de-DE).
import { overrideChain, type AppLocale } from '@/lib/i18n/locales'
import { APP_STORE_BADGE_SRC, GOOGLE_PLAY_BADGE_SRC } from '@/lib/app-badges'

export interface BadgeFile { src: string; width: number; height: number }

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
}

/** Google's "Get it on Google Play" badge per language base (play.google.com/intl/…/badges). */
export const GOOGLE_BADGES: Readonly<Record<string, BadgeFile>> = {
  'fr-FR': { src: '/badges/google/fr-FR.png', width: 646, height: 250 },
  'de-DE': { src: '/badges/google/de-DE.png', width: 646, height: 250 },
  'es-ES': { src: '/badges/google/es-ES.png', width: 646, height: 250 },
  'it-IT': { src: '/badges/google/it-IT.png', width: 646, height: 250 },
  'pt-PT': { src: '/badges/google/pt-PT.png', width: 646, height: 250 },
  'nl-NL': { src: '/badges/google/nl-NL.png', width: 646, height: 250 },
  'sv-SE': { src: '/badges/google/sv-SE.png', width: 646, height: 250 },
  'da-DK': { src: '/badges/google/da-DK.png', width: 646, height: 250 },
  'nb-NO': { src: '/badges/google/nb-NO.png', width: 646, height: 250 },
  'pl-PL': { src: '/badges/google/pl-PL.png', width: 646, height: 250 },
  'cs-CZ': { src: '/badges/google/cs-CZ.png', width: 646, height: 250 },
  'hu-HU': { src: '/badges/google/hu-HU.png', width: 646, height: 250 },
  'sk-SK': { src: '/badges/google/sk-SK.png', width: 646, height: 250 },
  'ro-RO': { src: '/badges/google/ro-RO.png', width: 646, height: 250 },
  'hr-HR': { src: '/badges/google/hr-HR.png', width: 646, height: 250 },
  'sl-SI': { src: '/badges/google/sl-SI.png', width: 646, height: 250 },
  'fi-FI': { src: '/badges/google/fi-FI.png', width: 646, height: 250 },
  'et-EE': { src: '/badges/google/et-EE.png', width: 646, height: 250 },
  'lv-LV': { src: '/badges/google/lv-LV.png', width: 646, height: 250 },
  'lt-LT': { src: '/badges/google/lt-LT.png', width: 646, height: 250 },
  'el-GR': { src: '/badges/google/el-GR.png', width: 646, height: 250 },
  'bg-BG': { src: '/badges/google/bg-BG.png', width: 646, height: 250 },
  'pt-BR': { src: '/badges/google/pt-BR.png', width: 646, height: 250 },
  'ms-MY': { src: '/badges/google/ms-MY.png', width: 646, height: 250 },
  'ja-JP': { src: '/badges/google/ja-JP.png', width: 646, height: 250 },
  'zh-HK': { src: '/badges/google/zh-HK.png', width: 646, height: 250 },
  'th-TH': { src: '/badges/google/th-TH.png', width: 646, height: 250 },
  'ar-AE': { src: '/badges/google/ar-AE.png', width: 646, height: 250 },
}

/** The badge for a page in `locale`: its own file, else its base's (a regional variant), else the English one. */
export function badgeFor(vendor: 'apple' | 'google', locale: string | null | undefined): BadgeFile {
  const files = vendor === 'apple' ? APPLE_BADGES : GOOGLE_BADGES
  const chain = locale ? [...overrideChain(locale as AppLocale)].reverse() : []
  for (const l of chain) if (files[l]) return files[l]
  return vendor === 'apple' ? APPLE_ENGLISH : GOOGLE_ENGLISH
}
