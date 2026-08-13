// app/api/admin/create-truck/route.ts
// Admin-only truck creation. The FIRST caller of lib/provision-truck — deliberately admin-gated so the
// create path can be proven on a real onboarding, with a human watching, before anonymous demo traffic
// ever drives it (prod `trucks` has constraints the code doesn't always match, and that's where drift
// bites — sheet_id being NOT NULL with no default is the live example).
//
// Uses the canonical verifyAdmin (session cookie, Bearer fallback for the native app). NOTE: the sibling
// create-operator route still does its own inline operators.is_admin lookup — same effect, but new code
// should use the shared helper. Converging that one is a separate tidy-up.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { provisionTruck, ProvisionError, type ProvisionTruckOptions } from '@/lib/provision-truck'
// The SAME helper lib/provision-truck uses for its own van-failure rollback. Reused rather than
// hand-rolling a delete here, so the compensation deletes exactly what a truck owns.
import { deleteTruckCascade } from '@/lib/delete-truck'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * GET — pre-fill for the promote flow. Admin-only, read-only, one row.
 *
 * ⚠️ IT EXISTS BECAUSE THE ADMIN CONSOLE CANNOT SEE THESE FIELDS. /api/admin's discovery query selects
 * only id, name, visibility, hatchgrab_truck_id, exclude_reason, show_on_vf, show_on_hg and excluded —
 * so `cuisine` and `contact_email` never reach the browser. Widening that query would have meant editing
 * a third file outside this change's scope; this keeps the addition inside the route that already owns
 * promotion. It returns nothing that is not already visible to an admin.
 *
 * ⚠️ NAME IS RETURNED TOO, so a caller could use this alone, but the console already holds the name and
 * falls back to it when this call fails — the pre-fill is a convenience, never a dependency.
 */
export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  const id = req.nextUrl.searchParams.get('discoveryTruckId')
  if (!id) return NextResponse.json({ error: 'discoveryTruckId required' }, { status: 400 })

  const { data, error } = await supabase
    .from('discovery_trucks')
    .select('id, name, cuisine, contact_email')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const kind = (body.kind as ProvisionTruckOptions['kind']) ?? 'operator'
  if (kind !== 'operator' && kind !== 'demo') {
    return NextResponse.json({ error: 'kind must be "operator" or "demo"' }, { status: 400 })
  }

  const visibility = body.visibility as ProvisionTruckOptions['visibility']
  if (visibility !== undefined && visibility !== 'hidden' && visibility !== 'public') {
    return NextResponse.json({ error: 'visibility must be "hidden" or "public"' }, { status: 400 })
  }

  // ⚠️ OPTIONAL. Absent → an ordinary blank create, whose behaviour is unchanged in every respect.
  // Present → after the truck exists, the named discovery_trucks row is pointed at it (see the link
  // block below), which is what makes this a PROMOTE rather than a create-and-hope-someone-links-it.
  const discoveryTruckId = typeof body.discoveryTruckId === 'string' && body.discoveryTruckId.trim()
    ? body.discoveryTruckId.trim()
    : null

  // ⚠️ THE VAN IS BUILT HERE NOW, NOT FORWARDED FROM THE BODY, AND CAPACITY IS ALWAYS AN EXPLICIT NULL.
  // This route used to pass `body.van` straight through, so a caller that omitted `kitchen_capacity`
  // silently got 5 — the module reads an ABSENT key as "use the default" and only an explicitly present
  // null as "leave it unset" (the `'kitchen_capacity' in vanOpts` test). Capacity is a decision the
  // operator makes in Manage once they know their kitchen, so it must not be guessed at creation.
  // ⚠️ NOT `van: false` — that would create no van at all, and a vanless truck has an inert capacity
  // engine because upsert_event only writes slot_capacity when the event's van carries one.
  // The name is the only thing still taken from the caller; omitting it lets the module apply 'Van 1'.
  const vanName = typeof (body.van as { name?: unknown } | undefined)?.name === 'string'
    ? ((body.van as { name: string }).name).trim()
    : ''
  const van: ProvisionTruckOptions['van'] = {
    ...(vanName ? { name: vanName } : {}),
    kitchen_capacity: null,
  }

  try {
    const result = await provisionTruck(supabase, {
      kind,
      name: body.name as string | undefined,
      slug: body.slug as string | undefined,
      plan: body.plan as ProvisionTruckOptions['plan'],
      visibility,
      contactEmail: (body.contactEmail as string | null | undefined) ?? null,
      cuisineType: (body.cuisineType as string | null | undefined) ?? null,
      van,
    })

    // THE LINK, AND WHY IT ROLLS THE TRUCK BACK RATHER THAN WARNING.
    // Runs only for a promote. An operator truck created here WITHOUT its discovery row pointed at it is
    // the exact state this feature exists to prevent: the console then shows the same business twice
    // (one operator row, one unlinked discovery row — see the admin tab's `!t.hatchgrab_truck_id`
    // filter), and the read-through that fills a truck's profile gaps from its scraped shadow has
    // nothing to read, so the logo fallback is lost on the order page and the public profile.
    // ⚠️ SO A FAILED LINK IS A FAILED CREATE. Same posture as the module's own van-failure path: fail
    // loudly and completely rather than half-succeeding quietly and leaving someone to notice later.
    let linkedDiscoveryTruckId: string | null = null
    if (discoveryTruckId) {
      // ⚠️ `.is('hatchgrab_truck_id', null)` IS A CONCURRENCY GUARD, NOT A TIDINESS CHECK. Without it a
      // second promote racing the first would re-point a row that is already linked to another truck,
      // silently orphaning that one. With it, the loser of the race matches zero rows and fails.
      // `.select('id')` is what makes the affected-row count observable — an UPDATE that matches nothing
      // is NOT an error in PostgREST, so checking `error` alone would let the zero-row case through.
      const { data: linked, error: linkErr } = await supabase
        .from('discovery_trucks')
        .update({ hatchgrab_truck_id: result.truck.id, updated_at: new Date().toISOString() })
        .eq('id', discoveryTruckId)
        .is('hatchgrab_truck_id', null)
        .select('id')

      if (linkErr || !linked || linked.length === 0) {
        const why = linkErr
          ? linkErr.message
          : 'that discovery row is already linked to another truck, or does not exist'
        // COMPENSATING DELETE — the same helper, and the same reasoning, as the van-failure path.
        try {
          await deleteTruckCascade(supabase, result.truck.id)
        } catch (cleanupErr) {
          // The compensation itself failed, so a real orphan exists. Same greppable shape as the
          // module's PROVISION_ORPHAN_TRUCK line, and the id goes back to the client so the stranded
          // row is recoverable without a log dive.
          console.error(
            `[create-truck] PROVISION_ORPHAN_TRUCK truck_id=${result.truck.id} — discovery link failed ` +
            `AND the compensating delete failed. Manual cleanup required.`,
            cleanupErr,
          )
          return NextResponse.json(
            {
              error: `Could not link the discovery row (${why}), and rolling the new truck back also failed — truck ${result.truck.id} is orphaned.`,
              code: 'link_failed',
              orphanTruckId: result.truck.id,
            },
            { status: 500 },
          )
        }
        return NextResponse.json(
          { error: `Could not link the discovery row: ${why}. The new truck has been rolled back.`, code: 'link_failed' },
          { status: 409 },
        )
      }
      linkedDiscoveryTruckId = discoveryTruckId
    }

    // ⚠️ dashboard_token is a SECRET and is in this response by necessity (it's how the admin reaches the
    // truck). It is never logged server-side; the console should render it once behind a copy button, the
    // same pattern create-operator uses for tempPassword.
    return NextResponse.json({
      ok: true,
      truck: result.truck,
      van: result.van,
      // ADDITIVE — null for a blank create, so the existing result panel is unaffected when absent.
      linkedDiscoveryTruckId,
      urls: {
        manage: `/manage/${result.truck.dashboard_token}`,
        dashboard: `/dashboard/${result.truck.dashboard_token}`,
        order: `/trucks/${result.truck.slug}/order`,
      },
      warnings: result.warnings,
    })
  } catch (err) {
    if (err instanceof ProvisionError) {
      // orphanTruckId set → a truck row was created and the rollback ALSO failed. Surface the id in the
      // response so it's recoverable without a log dive.
      if (err.orphanTruckId) {
        return NextResponse.json(
          { error: err.message, code: err.code, orphanTruckId: err.orphanTruckId },
          { status: 500 },
        )
      }
      const status =
        err.code === 'validation' || err.code === 'reserved_prefix' ? 400
        : err.code === 'unique_exhausted' ? 409
        : 500
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    console.error('[create-truck] unexpected failure:', err)
    return NextResponse.json({ error: 'Truck creation failed' }, { status: 500 })
  }
}
