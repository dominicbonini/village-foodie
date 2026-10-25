// app/api/compare/[country]/[section]/[slug]/[format]/route.ts — a comparison page's Markdown and JSON twins
// (compare-de-1, 24 October 2026). Served at /de/vergleich/foodtruck-bestellsystem.md and .json through next.config.ts's
// rewrite. 🔴 THE PAGE'S OWN VISIBILITY (lib/comparison-server.ts resolveComparison): off → 404, admin → 404 except for a
// verified admin, live → public. Built by the same lib/comparison.ts as the page, from the same view — an admin gets the
// public view unless ?view=admin, so a draft twin never shows more than the page's public toggle would.
import { NextRequest, NextResponse } from 'next/server'
import { isHatchGrabHost } from '@/lib/brand'
import { adminUser } from '@/lib/auth/admin'
import { resolveComparison, comparisonT } from '@/lib/comparison-server'
import { buildComparison, comparisonMarkdown, comparisonJson } from '@/lib/comparison'

export const dynamic = 'force-dynamic'

const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

export async function GET(req: NextRequest, { params }: { params: Promise<{ country: string; section: string; slug: string; format: string }> }) {
  if (!isHatchGrabHost(req.headers.get('host') || '')) return notFound()
  const { country, section, slug, format } = await params
  if (format !== 'md' && format !== 'json') return notFound()
  const r = await resolveComparison(country, section, slug, async () => (await adminUser(req)) !== null)
  if (!r) return notFound()
  const t = comparisonT(r.input.settings.locale)
  const view = buildComparison(r.input, t, { admin: r.admin, publicView: !(r.admin && req.nextUrl.searchParams.get('view') === 'admin') })
  const live = r.flags.status === 'live'
  const headers: Record<string, string> = live
    ? { 'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400', Link: `<${r.input.urls.page}>; rel="canonical"` }
    : { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }
  if (format === 'md') return new NextResponse(comparisonMarkdown(view, r.input, t), { headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8' } })
  return NextResponse.json(comparisonJson(view, r.input, t), { headers })
}
