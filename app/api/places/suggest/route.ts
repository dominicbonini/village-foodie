// GET /api/places/suggest?q=Sud&country=GB&session=<uuid> — town and city suggestions for the "Where's your
// truck based?" box (Phase 2D-1). Server-side Google Places (lib/places.ts); the key never leaves the server.
// 🔴 NEVER BLOCKS: every failure answers 200 { state: 'none' }, and the box then takes free text.
import { NextRequest, NextResponse } from 'next/server'
import { suggestTowns } from '@/lib/places'
import { placesGuard, sessionTokenOf } from '../_guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const country = (req.nextUrl.searchParams.get('country') ?? '').toUpperCase()
  const guard = await placesGuard(req, country)
  if (!guard.ok) return NextResponse.json({ state: 'none' }, { headers: { 'Cache-Control': 'no-store' } })
  const r = await suggestTowns(q, country, sessionTokenOf(req.nextUrl.searchParams.get('session')))
  return NextResponse.json(r.state === 'ok' ? r : { state: 'none' }, { headers: { 'Cache-Control': 'no-store' } })
}
