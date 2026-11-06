// lib/marketing-render.ts — perf-1 (5 November 2026, docs/perf-1-report.md): "THIS REQUEST IS RENDERING A MARKETING PAGE".
//
// The landing page, /features and /faq (and their /<country> addresses) call markMarketingRender() first, in the page and in its
// metadata. While it is set, the shared readers those pages use — the country list, the plan catalogue, the comparison/app flags and
// the public FAQ — read through the tagged shared cache (lib/marketing-cache.ts) instead of their 60-second in-memory copies, so an
// app write shows on the very next request on every server. EVERY OTHER CALLER (Manage, ordering, the KDS, Admin, the proxy, route
// handlers) never sets it and reads exactly as before.
// It is React's request-scoped `cache`: one flag per server render, shared by the page, its metadata and every server component in
// it. Outside a React server render (a route handler, the proxy) `cache` does not memoise, so the flag reads false there.
import { cache } from 'react'

const flag = cache((): { on: boolean } => ({ on: false }))

/** Call first in a marketing page module's default export and its generateMetadata. */
export function markMarketingRender(): void { flag().on = true }
/** True only inside a marketing page's server render. */
export function isMarketingRender(): boolean { return flag().on }

// cwv-2 (6 November 2026, docs/cwv-2-report.md §4): "THIS RENDER IS A BUILT-AHEAD PAGE" — the landing, /features and /faq at a COUNTRY
// address, built ahead and kept by the CDN until a tag is revalidated or 300 seconds pass. On those, a degraded answer to a failed read
// (no FAQ, every comparison switch off) would be STORED with the page; so there the shared readers rethrow instead (Next then keeps the
// last good page), and perf-1's rule holds — a failed read is never kept. Every other render degrades exactly as before.
const builtAhead = cache((): { on: boolean } => ({ on: false }))
/** Call with markMarketingRender() in a built-ahead page's render and metadata (lib/visitor-country.ts resolveBuiltAheadCountry). */
export function markBuiltAheadRender(): void { builtAhead().on = true }
/** True only inside a built-ahead page's server render. */
export function isBuiltAheadRender(): boolean { return builtAhead().on }
