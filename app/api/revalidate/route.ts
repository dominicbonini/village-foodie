// app/api/revalidate/route.ts — perf-1 (5 November 2026, docs/perf-1-report.md): EXPIRE THE MARKETING PAGES' CACHED DATA, for the
// writers that are not the app — scripts/db-migrate.cjs after a migration, the FAQ translation run (scripts/faq-translate) after it
// writes. The app's own writes call revalidateMarketing() directly (Admin › Countries, its comparison status, Admin › FAQ).
//
//   POST /api/revalidate   header  x-revalidate-secret: <REVALIDATE_SECRET>   body  {"tags": ["marketing-faq", …]}
//
// 🔴 THE RULES:
//   • POST only; the secret travels in a header, never the URL; compared in constant time (SHA-256 of each, timingSafeEqual);
//   • REVALIDATE_SECRET unset → 503 and nothing done (an unconfigured endpoint is closed, not open);
//   • a wrong or missing secret → 401, the same short answer whatever was wrong;
//   • every tag must be on the allow-list (lib/marketing-tags.ts) — anything else → 400 and nothing done;
//   • the tags are EXPIRED at once (revalidateTag(tag, { expire: 0 })): the next request reads the database.
// It returns no data and reads nothing from the database.
import { NextRequest, NextResponse } from 'next/server'
import { isMarketingTag, MARKETING_TAG_LIST } from '@/lib/marketing-tags'
import { revalidateMarketing } from '@/lib/marketing-cache'
import { secretMatches } from '@/lib/revalidate-secret'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET
  if (!expected) return NextResponse.json({ error: 'Revalidation is not configured.' }, { status: 503 })
  if (!secretMatches(req.headers.get('x-revalidate-secret'), expected)) return NextResponse.json({ error: 'Not allowed.' }, { status: 401 })
  let tags: unknown
  try { tags = (await req.json())?.tags } catch { tags = null }
  if (!Array.isArray(tags) || tags.length === 0 || tags.length > MARKETING_TAG_LIST.length || !tags.every(isMarketingTag)) {
    return NextResponse.json({ error: `Give "tags": one or more of ${MARKETING_TAG_LIST.join(', ')}.` }, { status: 400 })
  }
  const unique = [...new Set(tags)]
  revalidateMarketing(unique, 'api/revalidate')
  console.log(`[revalidate] expired ${unique.join(', ')}`)
  return NextResponse.json({ revalidated: unique })
}
