export const BRANDS = {
  VILLAGE_FOODIE: {
    name: 'Village Foodie',
    domain: 'www.villagefoodie.co.uk',
    logo: '/logos/village-foodie-logo-v2.png',
    focus: 'consumer' as const,
  },
  HATCHGRAB: {
    name: 'HatchGrab',
    domain: 'www.hatchgrab.com',
    logo: '/logos/village-foodie-logo-v2.png', // temporary — replace when HatchGrab logo exists
    focus: 'operator' as const,
  },
} as const

// ── HATCHGRAB LOGO ASSET PATHS — ONE DEFINITION EACH (V9.7) ─────────────────────────────────────────
// 🔴 THESE EXIST BECAUSE TWO CALL SITES HARDCODED TWO DIFFERENT PATHS FOR THE SAME LOGO, and only one of
// them resolved: app/manage/[token]/page.tsx used '/logos/hatchgrab.png' (which never existed, so the QR
// poster silently fell back to the text "Powered by HatchGrab") while lib/email-config.ts used
// '/logos/hatchgrab-logo.png'. Two spellings of one asset is the makeCartKey duplication class; import
// from here rather than typing a path.
// ⚠️ SVG for the WEB, PNG for EMAIL — this is not a preference. Email clients do not render SVG, so
// HATCHGRAB_LOGO_PNG is the only correct choice in an email template. Never swap it for the SVG.
// ⚠️ WHITE variants are for DARK backgrounds (e.g. bg-slate-900 headers/nav); the plain variants carry
// navy "HATCH" and are for light backgrounds. Picking the wrong one renders the wordmark invisible.
// Artwork is TIGHT-CROPPED (30 July 2026): viewBox "21 39 1287 283" / 640 × 141 (PNG) — ratio 4.548:1
// (was 3.97:1 before the crop; the artwork is unchanged, only surrounding whitespace was removed).
// ⚠️ EVERY hardcoded width/height PAIR must use 4.548:1 — a stale pair letterboxes or squashes. Set it or an
// aspect-ratio at every call site so there is no layout shift.
export const HATCHGRAB_WORDMARK_SVG       = '/logos/hatchgrab-wordmark.svg'
export const HATCHGRAB_WORDMARK_WHITE_SVG = '/logos/hatchgrab-wordmark-white.svg'
export const HATCHGRAB_LOGO_PNG           = '/logos/hatchgrab-logo.png'
export const HATCHGRAB_LOGO_WHITE_PNG     = '/logos/hatchgrab-logo-white.png'

export function getBrandFromHost(host: string) {
  if (host.includes('hatchgrab')) return BRANDS.HATCHGRAB
  return BRANDS.VILLAGE_FOODIE // default
}

export function isHatchGrabHost(host: string): boolean {
  return host.includes('hatchgrab')
}

// ── Operator surface colour tokens ────────────────────────────────
// NOT imported into components directly (Tailwind purges dynamic class strings).
// Use as documentation: when changing operator header colour, update here AND
// every bg-slate-900 in AppHeader.tsx, tabs bars, and any future operator pages.
export const HEADER_BG = 'bg-slate-900'   // AppHeader — all operator headers
export const TABS_BG   = 'bg-slate-900'   // tabs bar below header (must match HEADER_BG)
export const PAGE_BG   = 'bg-slate-50'    // operator page content area
