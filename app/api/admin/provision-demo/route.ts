// app/api/admin/provision-demo/route.ts
//
// THE ADMIN DEMO ENTRY POINT — the outreach "Create Demo" action (components/admin/CreateDemoModal.tsx).
//
// HISTORY: this began as temporary test scaffolding for exercising provisionDemo() against the live DB
// before the public upload (/api/demo) existed. It was REPURPOSED rather than deleted (12 September 2026)
// because it is exactly the shape an admin-only demo needs and the public route can never be: it is
// verifyAdmin-gated, so it can carry a truck NAME, a LOGO and a DISCOVERY ID — three things an anonymous
// visitor must never be able to set on a demo, and which /api/demo therefore does not accept.
//
// WHAT IT ADDS OVER /api/demo, per request:
//   discoveryTruckId — the discovery_trucks row this demo is built for. The row's own `name` and
//                      `logo_url` are read SERVER-SIDE from that id (the client cannot supply a logo
//                      source; it can only override the display name). Threads into provisionDemo →
//                      demo_sessions.discovery_truck_id + public_ref + the 30-day tier + the branded
//                      name/logo. 🔴 NEVER written to discovery_trucks.hatchgrab_truck_id — that column
//                      means "this discovery row IS an operator truck" to every reader.
//   name             — optional override of the discovery name for the demo truck.
//   template         — the same sample-menu id /api/demo accepts, for a prospect with no menu to hand.
// Everything the old scaffolding accepted (multipart file OR JSON/multipart text, existingTruckId) still
// works unchanged; the verification counts it returned are kept because the modal shows them.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { provisionDemo, ProvisionDemoError } from '@/lib/provision-demo'
import { getDemoTemplate } from '@/lib/demo-templates'
import { parseDemoKitchen } from '@/lib/demo-kitchen'

// Same ceiling as /api/demo and for the same reason: the provision blocks for the whole extract + commit.
export const maxDuration = 300

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let file: File | null = null
  let text: string | null = null
  let existingTruckId: string | undefined
  let discoveryTruckId: string | null = null
  let nameOverride: string | null = null
  let templateId: string | null = null
  // The admin's three kitchen numbers. Raw here; validated by parseDemoKitchen below, which is the SAME
  // code scripts/demo-seed-parameters.cjs asserts the bounds against.
  let rawInterval: unknown = null, rawCook: unknown = null, rawBatch: unknown = null

  const contentType = req.headers.get('content-type') || ''
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const f = form.get('file')
      file = f instanceof File && f.size > 0 ? f : null
      text = str(form.get('text'))
      existingTruckId = str(form.get('existingTruckId')) ?? undefined
      discoveryTruckId = str(form.get('discoveryTruckId'))
      nameOverride = str(form.get('name'))
      templateId = str(form.get('template'))
      rawInterval = form.get('collection_interval_mins')
      rawCook = form.get('cook_mins')
      rawBatch = form.get('batch_size')
    } else {
      const body = await req.json()
      text = str(body.text)
      existingTruckId = str(body.existingTruckId) ?? undefined
      discoveryTruckId = str(body.discoveryTruckId)
      nameOverride = str(body.name)
      templateId = str(body.template)
      rawInterval = body.collection_interval_mins
      rawCook = body.cook_mins
      rawBatch = body.batch_size
    }
  } catch {
    return NextResponse.json({ error: 'Could not read request body' }, { status: 400 })
  }

  // 🔴 VALIDATED SERVER-SIDE, AND A BAD VALUE IS A 400 WITH ITS OWN SENTENCE — never a silent fallback to
  // the default. An admin who typed 500 must be told, not handed a demo at 4 that looks like it worked.
  const { kitchen, error: kitchenError } = parseDemoKitchen({ intervalMins: rawInterval, cookMins: rawCook, batchSize: rawBatch })
  if (kitchenError) return NextResponse.json({ error: kitchenError }, { status: 400 })

  const template = getDemoTemplate(templateId)
  if (!file && !text && !existingTruckId && !template) {
    return NextResponse.json(
      { error: 'Supply a menu file, menu text, a sample template, or an existingTruckId to re-provision' },
      { status: 400 },
    )
  }

  // ── The discovery row, read here and not trusted from the client ───────────────────────────────
  // `name` and `logo_url` come from the row. The logo value then goes through lib/demo-logo's allowlist
  // inside provisionDemo — a value outside it (an external host) builds the demo WITHOUT a logo and says
  // so in `warnings`; it is never fetched.
  let name: string | null = null
  let logoUrl: string | null = null
  if (discoveryTruckId) {
    const { data: row, error } = await supabase
      .from('discovery_trucks').select('id, name, logo_url').eq('id', discoveryTruckId).maybeSingle()
    if (error) return NextResponse.json({ error: `Could not read the discovery truck: ${error.message}` }, { status: 500 })
    if (!row) return NextResponse.json({ error: 'Discovery truck not found' }, { status: 404 })
    name = nameOverride ?? str(row.name)
    logoUrl = str(row.logo_url)
    if (!name) return NextResponse.json({ error: 'That discovery truck has no name to brand the demo with' }, { status: 400 })
  }

  try {
    const result = await provisionDemo(supabase, {
      file, text, template, existingTruckId, kitchen,
      ...(discoveryTruckId ? { discoveryTruckId, name, logoUrl } : {}),
    })

    // Counts read back from the DB rather than inferred — the point of this route is to verify what
    // ACTUALLY landed, so trusting the provisioner's own arithmetic would defeat it.
    // `result.event` is null when the menu failed (provisionDemo now stops before the event) — the
    // event-scoped reads are skipped in that case rather than crashing on a null id/date.
    const ev = result.event
    const [cats, items, slotRows, orderRows] = await Promise.all([
      supabase.from('menu_categories').select('*', { count: 'exact', head: true })
        .eq('truck_id', result.truckId).eq('is_active', true),
      supabase.from('menu_items_db').select('*', { count: 'exact', head: true })
        .eq('truck_id', result.truckId).eq('is_active', true),
      ev ? supabase.from('slot_capacity').select('*', { count: 'exact', head: true })
        .eq('truck_id', result.truckId).eq('event_date', ev.event_date) : Promise.resolve({ count: 0 }),
      ev ? supabase.from('orders').select('*', { count: 'exact', head: true })
        .eq('truck_id', result.truckId).eq('event_id', ev.id) : Promise.resolve({ count: 0 }),
    ])

    // Read the event back too, so status/opened_at are what the DB holds — opened_at alongside
    // status:'open' is the specific inconsistency this build set out to avoid.
    const { data: eventRow } = ev
      ? await supabase
          .from('truck_events')
          .select('id, status, opened_at, start_time, end_time, event_date, van_id')
          .eq('id', ev.id).single()
      : { data: null }

    return NextResponse.json({
      ok: true,
      mode: existingTruckId ? 're-provision' : 'first-run',
      truck: {
        id: result.truckId,
        slug: result.slug,
        dashboard_token: result.dashboardToken,
        van_id: result.vanId,
        name,
        logo_storage_path: result.logoStoragePath,
      },
      // OUTREACH: null for an unlinked demo. The readable URL is `/demo/<publicRef>`.
      publicRef: result.publicRef,
      discoveryTruckId,
      event: ev ? {
        id: ev.id,
        event_date: eventRow?.event_date ?? ev.event_date,
        start_time: eventRow?.start_time ?? ev.start_time,
        end_time: eventRow?.end_time ?? ev.end_time,
        status: eventRow?.status ?? null,
        opened_at: eventRow?.opened_at ?? null,
        van_id: eventRow?.van_id ?? null,
        slotsGenerated: ev.slotCount,
      } : null,
      counts: {
        categories: cats.count ?? 0,
        items: items.count ?? 0,
        slotCapacityRows: slotRows.count ?? 0,
        orders: orderRows.count ?? 0,
        seededOrders: result.seededOrders,
      },
      menu: result.menu,
      urls: {
        dashboard: `/dashboard/${result.dashboardToken}`,
        order: `/trucks/${result.slug}/order`,
        kds: `/dashboard/${result.dashboardToken}/kds`,
        ...(result.publicRef ? { public: `/demo/${result.publicRef}` } : {}),
      },
      warnings: result.warnings,
      // 🔴 SURFACED AT CREATION, NOT DISCOVERED ON THE DEMO PAGE. A refused logo used to reach the
      // operator only inside the collapsed "Notes" list, which is how a demo went out unbranded with
      // nothing on screen that said so.
      logoNote: result.logoNote,
    })
  } catch (err) {
    if (err instanceof ProvisionDemoError) {
      // truckId present → a truck row exists and may need sweeping (delete-truck can do it).
      return NextResponse.json(
        { error: err.message, truckId: err.truckId, code: 'provision_failed' },
        { status: 500 },
      )
    }
    console.error('[provision-demo] unexpected failure:', err)
    return NextResponse.json({ error: 'Demo provisioning failed' }, { status: 500 })
  }
}
