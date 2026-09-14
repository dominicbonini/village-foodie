// app/demo/[ref]/route.ts
// The readable demo URL: /demo/<public_ref> ("/demo/pizzeria-gusto").
//
// It RESOLVES and REDIRECTS, nothing more: demo_sessions.public_ref → the demo truck's dashboard_token →
// 307 to /dashboard/<token>, which is the existing demo dashboard with its existing token-only access.
// No dashboard logic lives here and none is duplicated. public_ref is a LOOKUP KEY: it is guessable by
// design (accepted, 12 September 2026 — it exists so a prospect can be told a URL over the phone), and it
// never becomes a credential because the boundary stays the `demo-` token proxy.ts already recognises.
//
// ⚠️ NO WRITES. Unlike /api/demo/return (which re-provisions on GET), opening this URL changes nothing —
// a link scanner that fetches it consumes nothing. The "fresh event on first open" behaviour is a
// separate, later piece of work and must not be added to a GET here.
//
// Unknown or swept refs bounce to the landing page with the same `?demo=expired` flag /api/demo/return
// uses, so a non-technical person lands somewhere useful rather than on a JSON error.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isDemoIdentifier } from '@/lib/demo'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const REF_SHAPE = /^[a-z0-9-]{1,80}$/

function bounce(req: NextRequest, reason: string) {
  const url = new URL('/landing', req.url)
  url.hash = 'try'
  url.searchParams.set('demo', reason)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params
  const publicRef = (ref ?? '').trim().toLowerCase()
  if (!REF_SHAPE.test(publicRef)) return bounce(req, 'invalid')

  const { data: session } = await supabase
    .from('demo_sessions').select('truck_id, public_ref').eq('public_ref', publicRef).maybeSingle()
  if (!session?.truck_id) return bounce(req, 'expired')

  const { data: truck } = await supabase
    .from('trucks').select('id, dashboard_token').eq('id', session.truck_id as string).maybeSingle()
  // The row's own id is the authority — a matched session still has to point at a demo truck.
  if (!truck || !isDemoIdentifier(truck.id as string) || !isDemoIdentifier(truck.dashboard_token as string)) {
    return bounce(req, 'expired')
  }

  return NextResponse.redirect(new URL(`/dashboard/${truck.dashboard_token}`, req.url))
}
