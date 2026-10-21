// GET /api/places/details?id=<placeId>&country=GB&session=<uuid> — the picked town's name, county or state,
// and point (Phase 2D-1). Server-side Google Places (lib/places.ts); ends the search's billing session.
// 🔴 NEVER BLOCKS: every failure answers 200 { state: 'none' }, and the town is kept as typed.
import { messagesStyleOf } from '@/lib/address-formats'
import { NextRequest, NextResponse } from 'next/server'
import { townDetails } from '@/lib/places'
import { placesGuard, sessionTokenOf } from '../_guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  const country = (req.nextUrl.searchParams.get('country') ?? '').toUpperCase()
  const guard = await placesGuard(req, country)
  if (!guard.ok) return NextResponse.json({ state: 'none' }, { headers: { 'Cache-Control': 'no-store' } })
  const r = await townDetails(id, sessionTokenOf(req.nextUrl.searchParams.get('session')), messagesStyleOf(guard.settings.addressFormat))   // address-formats-1: Places mapping unchanged until stage 2
  return NextResponse.json(r.state === 'ok' ? r : { state: 'none' }, { headers: { 'Cache-Control': 'no-store' } })
}
