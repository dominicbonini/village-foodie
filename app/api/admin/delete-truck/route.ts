// app/api/admin/delete-truck/route.ts
// Admin-only truck teardown. Wraps lib/delete-truck's deleteTruckCascade() — the same helper the Phase-3
// scheduled cleanup job will use for expired demo trucks, so exercising it here is deliberate: the cleanup
// job should not be the first thing that ever runs this code path in anger.
//
// GET  ?truckId=…  → DRY RUN. Returns row counts for what would be destroyed, so the console can show real
//                    numbers before anyone types a confirmation. Reads only; deletes nothing.
// POST { truckId, confirmSlug, allowOperatorDelete } → performs the cascade.
//
// ⚠️ EVERY GUARD IS ENFORCED HERE, not just in the UI. A typed-confirmation box and an override tickbox
// that live only in React are theatre — this endpoint is reachable by any admin session with a fetch call,
// so the slug match and the operator guard are re-checked server-side before anything is deleted.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { deleteTruckCascade, DeleteTruckError } from '@/lib/delete-truck'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// High-signal tables surfaced in the dry run. NOT the full cascade (~25 tables) — these are the ones that
// tell an admin "this is the truck I think it is" and "this is how much history I am about to destroy".
const IMPACT_TABLES = [
  { table: 'orders', label: 'orders' },
  { table: 'truck_events', label: 'events' },
  { table: 'menu_items_db', label: 'menu items' },
  { table: 'menu_categories', label: 'menu categories' },
  { table: 'modifier_groups', label: 'extras groups' },
  { table: 'bundles_db', label: 'deals' },
  { table: 'truck_vans', label: 'vans' },
  { table: 'truck_users', label: 'team members' },
] as const

async function fetchTruck(truckId: string) {
  const { data } = await supabase
    .from('trucks')
    .select('id, name, slug, operator_id, active, excluded, plan')
    .eq('id', truckId)
    .maybeSingle()
  return data
}

async function countImpact(truckId: string) {
  const counts = await Promise.all(
    IMPACT_TABLES.map(async ({ table, label }) => {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('truck_id', truckId)
      // A failed count must NOT block the delete — report it as unknown rather than pretending it's 0,
      // which would understate the blast radius.
      return { label, count: error ? null : (count ?? 0) }
    }),
  )
  return counts
}

export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const truckId = req.nextUrl.searchParams.get('truckId')
  if (!truckId) return NextResponse.json({ error: 'truckId required' }, { status: 400 })

  const truck = await fetchTruck(truckId)
  if (!truck) return NextResponse.json({ error: 'Truck not found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    truck,
    impact: await countImpact(truckId),
    // The console mirrors this to decide whether the override tickbox is required. It is re-checked on
    // POST regardless — this is for display, not for enforcement.
    requiresOperatorOverride: truck.operator_id !== null,
  })
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

  const truckId = typeof body.truckId === 'string' ? body.truckId : null
  const confirmSlug = typeof body.confirmSlug === 'string' ? body.confirmSlug.trim() : ''
  const allowOperatorDelete = body.allowOperatorDelete === true

  if (!truckId) return NextResponse.json({ error: 'truckId required' }, { status: 400 })

  const truck = await fetchTruck(truckId)
  if (!truck) return NextResponse.json({ error: 'Truck not found' }, { status: 404 })

  // ── Guard 1: typed confirmation ──────────────────────────────────────────────────────────────────
  // Must match the truck's slug, or its id when slug is null. Case-insensitive: the point is proving you
  // know WHICH truck you're deleting, not exact-keystroke obedience.
  const expected = (truck.slug || truck.id).toLowerCase()
  if (confirmSlug.toLowerCase() !== expected) {
    return NextResponse.json(
      { error: `Confirmation does not match. Type "${truck.slug || truck.id}" to confirm.`, code: 'confirm_mismatch' },
      { status: 400 },
    )
  }

  // ── Guard 2: operator attached ───────────────────────────────────────────────────────────────────
  // A truck with an operator is, by definition, somebody's live business — demo and throwaway trucks have
  // no operator. Deleting one needs deliberate extra intent, not just a correctly-typed slug.
  if (truck.operator_id && !allowOperatorDelete) {
    return NextResponse.json(
      {
        error: 'This truck has an operator account attached. Tick the override to delete it anyway.',
        code: 'operator_attached',
        operatorId: truck.operator_id,
      },
      { status: 409 },
    )
  }

  // Counted BEFORE the delete — afterwards there is nothing left to count.
  const impact = await countImpact(truckId)

  try {
    await deleteTruckCascade(supabase, truckId)
  } catch (err) {
    if (err instanceof DeleteTruckError) {
      // The cascade is a SEQUENCE of statements, not a transaction — a mid-sequence failure leaves the
      // truck PARTIALLY deleted. Naming the failing step is what makes that diagnosable (and resumable:
      // re-running is safe, every step is an idempotent DELETE … WHERE truck_id = …).
      console.error(`[delete-truck] failed at step "${err.step}" for ${truckId}:`, err.message)
      return NextResponse.json(
        {
          error: err.message,
          code: 'cascade_failed',
          failedStep: err.step,
          truckId,
          partial: true,
        },
        { status: 500 },
      )
    }
    console.error('[delete-truck] unexpected failure:', err)
    return NextResponse.json({ error: 'Delete failed', truckId }, { status: 500 })
  }

  console.warn(`[delete-truck] deleted truck ${truckId} (${truck.name})`)

  return NextResponse.json({
    ok: true,
    truckId,
    name: truck.name,
    slug: truck.slug,
    hadOperator: truck.operator_id !== null,
    deleted: impact,
  })
}
