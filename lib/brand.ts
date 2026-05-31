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
