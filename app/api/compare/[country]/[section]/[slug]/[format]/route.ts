// app/api/compare/[country]/[section]/[slug]/[format]/route.ts — a comparison page's Markdown and JSON twins
// (compare-de-1, 24 October 2026). Served at /de/vergleich/foodtruck-bestellsystem.md and .json through next.config.ts's
// rewrite. 🔴 THE PAGE'S OWN VISIBILITY (lib/comparison-server.ts resolveComparison): off → 404, admin → 404 except for a
// verified admin, live → public. Built by the same lib/comparison.ts as the page, from the same view — an admin gets the
// public view unless ?view=admin, so a draft twin never shows more than the page's public toggle would.
//
// ── compare-cache-1 (Dominic, 27 November 2026; docs/compare-cache-1-report.md): CACHED FOR 30 DAYS like the page, under its country's tag
// comparison-<CC>. The public answer reads NO request (no host, cookie or query): the host rule is proxy.ts's; the admin and ?view=admin
// are read only in draft mode (an admin's preview, /api/compare/preview), which Next renders per request and never caches.
import { NextRequest, NextResponse } from 'next/server'
import { draftMode } from 'next/headers'
import { adminUser } from '@/lib/auth/admin'
import { resolveComparison, comparisonT, comparisonSuitsT } from '@/lib/comparison-server'
import { buildComparison, comparisonMarkdown, comparisonJson } from '@/lib/comparison'

export const revalidate = 2592000   // 30 days — lib/marketing-tags.ts COMPARISON_REVALIDATE_SECONDS
export const dynamicParams = true
/** No twin built ahead: each renders on its first request, then is kept (as the page). */
export function generateStaticParams(): { country: string; section: string; slug: string; format: string }[] { return [] }

const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

export async function GET(req: NextRequest, { params }: { params: Promise<{ country: string; section: string; slug: string; format: string }> }) {
  const { country, section, slug, format } = await params
  if (format !== 'md' && format !== 'json') return notFound()
  const preview = (await draftMode()).isEnabled
  const r = await resolveComparison(country, section, slug, async () => preview && (await adminUser(req)) !== null)
  if (!r) return notFound()
  const t = comparisonT(r.input.settings.locale)
  const view = buildComparison(r.input, t, { admin: r.admin, publicView: !(r.admin && preview && req.nextUrl.searchParams.get('view') === 'admin') }, comparisonSuitsT(r.input.settings.locale))
  const live = r.flags.status === 'live'
  const headers: Record<string, string> = live
    ? { 'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400', Link: `<${r.input.urls.page}>; rel="canonical"` }
    : { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }
  if (format === 'md') return new NextResponse(comparisonMarkdown(view, r.input, t), { headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8' } })
  return NextResponse.json(comparisonJson(view, r.input, t), { headers })
}
