// ── 🔴 KEPT AFTER THE IFRAME REMOVAL (V11.49), AND IT IS NOW A CUSTOM-DOMAIN ROUTE. ─────────────────
// The public iframe route this was built for is deleted. This endpoint survives because it is the DATA
// SOURCE FOR THE CUSTOM-DOMAIN PAGE: app/domain/page.tsx renders <EmbedSchedule>, which fetches exactly
// this. Its name is historical.
// 🔴 THE `embed_enabled` GUARD BELOW IS LOAD-BEARING AND IS WHY `domain_provision` SETS THAT COLUMN.
// Left false, this returns an empty list and the operator's own domain shows a page with no schedule on
// it — silently. See app/api/manage/route.ts, the domain_provision patch.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
/* 🔴 PRIVATE EVENTS SHOW HERE, REDACTED — this is the truck's own public schedule. */
import { readPrivateEventIds } from '@/lib/private-events/read'
import { PRIVATE_PUBLIC_LABEL } from '@/lib/private-events/resolve'

/**
 * ── /api/embed/events?slug=<trucks.slug> — ONE TRUCK'S UPCOMING EVENTS, FILTERED IN SQL ─────────
 *
 * 🔴 THIS ROUTE EXISTS BECAUSE /api/discovery/events CANNOT SERVE AN EMBED, AND THE REASON IS
 * MEASURED, NOT STYLISTIC. That route is classified `isStrictPublic` in proxy.ts:28-29 and therefore
 * limited to THREE REQUESTS PER MINUTE PER IP, with the operator bypass deliberately excluded
 * (proxy.ts:119, `&& !isStrict`). It also returns EVERY truck's events — 1000 scraped + 200 operator
 * — and the client filters afterwards. On an operator's own homepage that is the wrong shape twice
 * over: the fourth visitor behind a shared address in any minute gets a 429, and each of the first
 * three downloads the entire network's schedule to display one truck's.
 *
 * Here the filter is a WHERE clause. `trucks.slug` is unique, `event_date >= today` and the status
 * set are SQL predicates, and the response carries only the rows the embed will render.
 *
 * ── THE SLUG SPACE IS `trucks.slug`, DELIBERATELY, AND THE OTHER ONE IS A REAL TRAP ─────────────
 * ⚠️ THERE ARE TWO SLUG SPACES IN THIS CODEBASE AND THEY SHARE A URL SHAPE. `/trucks/[slug]` (the
 * public profile) resolves by `createSlug(trucks.name)` — see api/discovery/events/route.ts:257 and
 * :344 — while `/trucks/[slug]/order` and `/api/menu/[truckId]` resolve by the `trucks.slug` COLUMN
 * (api/menu/[truckId]/route.ts:35). They agree only while `trucks.slug === createSlug(trucks.name)`,
 * and `operatorIdentity` (lib/provision-truck.ts:302-307) appends a numeric suffix on collision —
 * which is precisely when they stop agreeing.
 * 🔴 THIS ROUTE USES THE COLUMN, because the column is authoritative, unique and indexed, and because
 * the Order button the embed renders deep-links to `/trucks/<slug>/order`, which resolves in the
 * COLUMN's space. Using the name-derived slug here would build order links that 404 for exactly the
 * trucks whose slug was suffixed.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function toddmmyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 })
  }

  // ── The truck. Note what is NOT selected: no dashboard_token, no pin, no contact details. This is a
  // public route on a third-party page, so it reads the minimum the embed renders and nothing else.
  const { data: truck, error: truckErr } = await supabase
    .from('trucks')
    .select('id, name, slug, active, embed_enabled, order_link_hg')
    .eq('slug', slug)
    .maybeSingle()

  if (truckErr) {
    console.error('[embed/events] truck lookup failed:', truckErr.message)
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 })
  }

  // ⚠️ THE SAME ANSWER FOR "NO SUCH TRUCK" AND "NOT OPTED IN": an empty list, 200. The PAGE owns the
  // gate and the fallback copy (app/embed/[slug]/page.tsx); this route must not become a second place
  // that decides what an embed is allowed to show, and it must not let a caller distinguish a truck
  // that declined an embed from one that does not exist.
  if (!truck || !truck.active || !truck.embed_enabled) {
    return NextResponse.json({ events: [] }, { headers: CACHE_HEADERS })
  }

  const today = new Date().toISOString().split('T')[0]

  const { data: rows, error: evErr } = await supabase
    .from('truck_events')
    .select('id, event_date, start_time, end_time, venue_name, town, postcode, notes, status')
    .eq('truck_id', truck.id)
    .in('status', ['confirmed', 'open'])
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false })

  if (evErr) {
    console.error('[embed/events] events query failed:', evErr.message)
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 })
  }

  /* ══ 🔴 PRIVATE EVENTS, REDACTED — AND THIS ROUTE SERVES **TWO** SURFACES (20261014) ═══════════
   * `/embed/<slug>` is the widget an operator frames on their own website, and `app/domain/page.tsx`
   * renders the same `EmbedSchedule` against this endpoint for a custom domain. Both are "the truck's
   * public schedule" in decision 4's sense, so both show a private event as "Private event" with the
   * date and times — and patching this one mapper covers both.
   * ⛔ `orderLinkHg` IS FORCED FALSE FOR A PRIVATE EVENT, which is how "No Order button on the public
   * schedule" is enforced on this surface: `TruckListCard` gates its CTA on that flag, so there is no
   * second place to change and no card that could render a button we did not mean. */
  const privacy = await readPrivateEventIds(supabase, (rows || []).map(e => e.id), '/api/embed/events')

  // Shaped as the VillageEvent fields TruckListCard actually reads, so the card renders unmodified.
  // `source: 'operator'` is a statement of fact, not a flag: these rows come from truck_events.
  const events = (rows || []).map((e) => ({
    id: e.id,
    date: toddmmyyyy(e.event_date),
    startTime: e.start_time || '',
    endTime: e.end_time || '',
    truckName: truck.name || '',
    venueName: privacy.isPrivate(e.id) ? PRIVATE_PUBLIC_LABEL : (e.venue_name || ''),
    status: e.status,               // 'open' → Order now; 'confirmed' → Pre-order
    village: privacy.isPrivate(e.id) ? '' : (e.town || ''),
    postcode: privacy.isPrivate(e.id) ? '' : (e.postcode || ''),
    notes: privacy.isPrivate(e.id) ? '' : (e.notes || ''),
    eventNotes: '',
    isPrivate: privacy.isPrivate(e.id),
    source: 'operator' as const,
    // The embed is a HatchGrab surface, so it consults order_link_hg — the SAME column, and the same
    // `?? true` default, that api/discovery/events/route.ts:291 applies. orderLinkVf is deliberately
    // absent: nothing on this route may consult it (see TruckListCard's assumeHatchGrab prop).
    orderLinkHg: privacy.isPrivate(e.id) ? false : (truck.order_link_hg ?? true),
  }))

  return NextResponse.json({ events }, { headers: CACHE_HEADERS })
}

// ── EDGE CACHE ────────────────────────────────────────────────────────────────────────────────────
// 60s fresh, 5 minutes of stale-while-revalidate. An embed sits on a homepage that may be hit far
// harder than our own pages, and every hit that the CDN answers is a hit that never reaches Postgres,
// never spends a rate-limit token at the origin, and never costs a function invocation.
//
// 🔴 THE COST OF THE 60 SECONDS, STATED RATHER THAN GLOSSED. `status` flips 'confirmed' → 'open' the
// moment the operator presses Start, and that flip is what turns "Pre-order" into "Order now"
// (TruckListCard.tsx:64-68). A cached response can therefore show "Pre-order" for up to a minute
// after service opens, and up to five more if the CDN is serving stale while it revalidates. That is
// a display lag on a button whose link works either way — the order page resolves the event itself —
// so it is a cosmetic staleness, not a wrong action. It was chosen over `no-store` because an embed
// with no cache is a database read on every visitor to a third party's website.
const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
  // Belt-and-braces against the embed being indexed independently of the page that frames it. The
  // page route gets the same treatment via vercel.json; this is the API's own copy.
  'X-Robots-Tag': 'noindex, noarchive',
} as const
