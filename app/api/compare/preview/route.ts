// app/api/compare/preview/route.ts — compare-cache-1 (Dominic, 27 November 2026, decision 2; docs/compare-cache-1-report.md): AN ADMIN'S
// PREVIEW OF THE CACHED COMPARISON PAGES.
//
//   GET /api/compare/preview?to=/de/vergleich/foodtruck-bestellsystem        → admin only: Next's draft mode on, then that page
//   GET /api/compare/preview?to=/de/vergleich/foodtruck-bestellsystem&off=1  → draft mode off, then that page (the public, cached view)
//
// The comparison pages and their twins are cached for 30 days and their public render reads no cookie. In draft mode Next renders them
// per request, never from or into the cache, and only then do they read the admin (the banner, a page that is not live yet, ?view=public).
// 🔴 The cookie is set only for a verified admin (lib/auth/admin.ts); anyone else gets a 404 and no cookie. `to` must be a comparison
// address (lib/comparison-flags.ts comparisonAddressOf) — never any other path or another site, so this is no open redirect.
// proxy.ts answers 404 for this path on any host but HatchGrab's (comparisonBlockedOnHost).
import { NextRequest, NextResponse } from 'next/server'
import { draftMode } from 'next/headers'
import { adminUser } from '@/lib/auth/admin'
import { comparisonAddressOf } from '@/lib/comparison-flags'

export const dynamic = 'force-dynamic'

const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' } })

export async function GET(req: NextRequest) {
  if (!(await adminUser(req))) return notFound()
  const to = req.nextUrl.searchParams.get('to') ?? ''
  if (!to.startsWith('/') || to.startsWith('//') || !comparisonAddressOf(to)) {
    return new NextResponse('Give ?to= a comparison page address, e.g. /de/vergleich/foodtruck-bestellsystem', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' } })
  }
  const dm = await draftMode()
  if (req.nextUrl.searchParams.get('off') === '1') dm.disable()
  else dm.enable()
  const res = NextResponse.redirect(new URL(to, req.nextUrl.origin), 307)
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}
