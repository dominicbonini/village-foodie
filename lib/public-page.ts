// lib/public-page.ts — cwv-1 (5 November 2026, docs/cwv-1-report.md): THE SHAPE OF A HATCHGRAB PUBLIC PAGE'S ADDRESS. Pure, no imports.
// The public pages are the ones MarketingFrame draws: a country's landing, /features, /faq and /compare, a comparison page, the legal
// documents (/privacy, /terms, /country-terms and each country's /<xx>/…), /about and /contact.
// app/providers.tsx uses it twice, in the browser (so no country table is bundled):
//   • PostHog turns on web-vitals capture (LCP, INP, CLS) only when the visit STARTS on a HatchGrab page of this shape;
//   • its before_send drops a `$web_vitals` event whose path, or any of whose measurements' own address, is not of this shape
//     (isPublicWebVitals: a visitor who went on to /signup or a dashboard in the same tab).
// scripts/cwv-1.cjs checks it is true for every country's public addresses and false for every app route, and isPublicWebVitals's cases.

/** The shape of a HatchGrab public page's address (no query, no trailing slash). */
export function isPublicPagePath(pathname: string | null | undefined): boolean {
  const p = String(pathname ?? '')
  return /^\/(about|contact|privacy|terms|country-terms)$/.test(p)
    || /^\/[a-z]{2}(?:\/(?:features|compare|faq|privacy|terms|country-terms))?$/.test(p)
    || /^\/[a-z]{2}\/[a-z0-9-]+\/[a-z0-9-]+$/.test(p)   // a comparison page: /uk/comparison/food-truck-ordering-system
}

/**
 * May this `$web_vitals` event be sent? Only if its own path AND the address every measurement inside it was taken on are public pages.
 * 🔴 WHY BOTH. posthog-js buffers a page's measurements and sends them 5 s after the first, or when a measurement from another address
 * arrives — so the event's $pathname is where the visitor is WHEN IT IS SENT, while each `$web_vitals_<LCP|INP|CLS>_event` carries the
 * `$current_url` it was MEASURED on. A visitor who entered on /uk, signed in, reached /dashboard/<token> in the same tab and came back
 * could otherwise have the dashboard's measurement (its address is a credential) sent under /uk. One non-public address drops it all.
 * `props` is the event's properties; a measurement whose address is missing or unreadable counts as not public.
 */
export function isPublicWebVitals(path: string | null | undefined, props: Record<string, unknown>): boolean {
  if (!isPublicPagePath(path)) return false
  for (const [k, v] of Object.entries(props)) {
    if (!/^\$web_vitals_[A-Z]+_event$/.test(k)) continue
    const u = v && typeof v === 'object' ? (v as { $current_url?: unknown }).$current_url : undefined
    let p = ''
    try { p = typeof u === 'string' ? new URL(u).pathname : '' } catch { p = '' }
    if (!isPublicPagePath(p)) return false
  }
  return true
}
