// app/api/private-event/route.ts — the guest header for a private event, keyed by its token.
//
// 🔴 WHY THIS EXISTS AT ALL. The ordering page needs to show "PRIVATE EVENT" and the event's NAME at
// the top (decision 5) — and `private_name` must never appear on a public feed, so `/api/events`
// cannot carry it. This endpoint is the one place the name is published, and it is published only to
// a caller holding the event's current token.
//
// ⛔ THE TOKEN IS THE WHOLE AUTHORISATION, AND IT IS MATCHED, NOT TRUSTED. `resolvePrivateLink` looks
// the token up; nothing here takes an event id from the caller, so there is no id to tamper with.
//
// ⚠️ IT PUBLISHES NO LOCATION. Venue, town, postcode and coordinates are not selected and not
// returned — a guest at the wedding knows where they are, and this endpoint is reachable by anyone
// who has the link, including whoever it was forwarded to. Date, times, the truck's name and the
// event's name are the whole payload.
//
// ⚠️ REGISTERED IN proxy.ts's `isGeneralPublic`, like `/p` itself. An unmetered public read keyed on
// a string anyone can vary is the regression the `/o/` note in that file records.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolvePrivateLink } from '@/lib/private-events/read'
import { privateDisplayName } from '@/lib/private-events/resolve'

export const dynamic = 'force-dynamic'

/* ⛔ NEVER CACHED, AT ANY LAYER. "Make a new link" must take effect immediately (decision 7), and a
 * cached 200 for a retired token is a link that keeps working after the operator revoked it. */
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' } as const

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') || ''
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const outcome = await resolvePrivateLink(supabase, token)

  /* ⛔ ONE REFUSAL SHAPE FOR EVERY FAILURE. 'unknown', 'unavailable' and 'ordering_off' all answer
   * 404 with `{ ok: false }` and no reason — the page at /p/<token> is where a human is told what
   * happened, and it resolves the token itself. An API that distinguished them would let anyone
   * probing this endpoint learn whether a token exists. */
  if (outcome.kind !== 'ok') {
    return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE })
  }

  return NextResponse.json({
    ok: true,
    eventId: outcome.event.id,
    truckName: outcome.truck.name,
    /* The operator's name for it, or "Private event" when they did not give one. */
    name: privateDisplayName(outcome.event.private_name),
    /** True when the operator typed a name — so the page can show the generic label as a label
     *  rather than as a heading that looks like somebody's wedding. */
    named: !!(outcome.event.private_name || '').trim(),
    date: outcome.event.event_date,
    startTime: outcome.event.start_time || '',
    endTime: outcome.event.end_time || '',
    status: outcome.event.status || '',
  }, { headers: NO_STORE })
}
