// app/api/admin/provision-demo/route.ts
//
// ⚠️ TEMPORARY TEST SCAFFOLDING. This is NOT the real entry point. The production path is a PUBLIC upload
// on the landing page (spec Stage 1-2) with no auth at all — anonymous by design. This route exists only so
// provisionDemo() can be exercised against the live DB, by a human, before anonymous traffic drives it.
// DELETE (or repurpose) when the public upload endpoint lands.
//
// It deliberately mirrors the real caller's shape — multipart file OR text, same as process-menu — so what
// gets proven here is the same code path the public route will use.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { provisionDemo, ProvisionDemoError } from '@/lib/provision-demo'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let file: File | null = null
  let text: string | null = null
  let existingTruckId: string | undefined

  const contentType = req.headers.get('content-type') || ''
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const f = form.get('file')
      file = f instanceof File && f.size > 0 ? f : null
      const t = form.get('text')
      text = typeof t === 'string' && t.trim() ? t : null
      const e = form.get('existingTruckId')
      existingTruckId = typeof e === 'string' && e.trim() ? e.trim() : undefined
    } else {
      const body = await req.json()
      text = typeof body.text === 'string' && body.text.trim() ? body.text : null
      existingTruckId = typeof body.existingTruckId === 'string' && body.existingTruckId.trim()
        ? body.existingTruckId.trim() : undefined
    }
  } catch {
    return NextResponse.json({ error: 'Could not read request body' }, { status: 400 })
  }

  if (!file && !text && !existingTruckId) {
    return NextResponse.json(
      { error: 'Supply a menu file, menu text, or an existingTruckId to re-provision' },
      { status: 400 },
    )
  }

  try {
    const result = await provisionDemo(supabase, { file, text, existingTruckId })

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
      },
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
      },
      warnings: result.warnings,
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
