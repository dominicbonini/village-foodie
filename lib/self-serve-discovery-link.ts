// lib/self-serve-discovery-link.ts
// When a prospect SELF-SERVES from an OUTREACH demo, point their discovery row at the NEW REAL truck.
// Called from /api/setup create_truck after the truck exists and carries operator_id.
//
// 🔴 THE ONE RULE THAT DIFFERS FROM THE ADMIN PROMOTE: NEVER DELETE THE OPERATOR'S TRUCK. The promote
// (/api/admin/create-truck) treats a failed link as a failed create and runs deleteTruckCascade — right
// when the admin is driving, wrong for a real operator who just signed up. This module has no delete
// path at all (nothing here imports one): it links if it can, RECORDS the outcome on the demo session
// (discovery_link_status / _truck_id / _note / discovery_linked_at, migration 20260912), logs a greppable
// tag, and returns. It never throws past its boundary.
//
// OUTCOMES
//   null       — this operator has no claimed OUTREACH demo (anonymous landing-page demo, or no demo at
//                all). Nothing is written and nothing is logged: the anonymous path is untouched.
//   'linked'   — discovery_trucks.hatchgrab_truck_id = newTruckId (guarded `.is(null)`, same as the
//                promote), then the shadow exclusion the promote's create-operator step applies.
//   'conflict' — the row already carried a non-null hatchgrab_truck_id (or no longer exists): the update
//                matched zero rows. NOT overwritten, NOT silent — recorded and logged as a conflict.
//   'failed'   — PostgREST returned an error on the link update; the message is recorded.

import type { SupabaseClient } from '@supabase/supabase-js'

export type DiscoveryLinkOutcome = {
  status: 'linked' | 'conflict' | 'failed'
  discoveryTruckId: string
  note: string | null
}

export async function linkDiscoveryRowForSelfServe(
  supabase: SupabaseClient, operatorId: string, newTruckId: string, now: Date = new Date(),
): Promise<DiscoveryLinkOutcome | null> {
  try {
    // The operator's claimed OUTREACH demo. `.not(null)` is the anonymous-demo exit: a landing-page demo
    // has no discovery_truck_id and this returns nothing. Newest first if they somehow claimed two.
    const { data: session, error: sessErr } = await supabase
      .from('demo_sessions')
      .select('truck_id, discovery_truck_id, discovery_link_status')
      .eq('claimed_by_operator_id', operatorId)
      .not('discovery_truck_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    // A missing column (migration 20260912 unapplied) surfaces as a PostgREST error here, NOT as "no
    // session" — logged so it cannot be mistaken for an anonymous demo.
    if (sessErr) { console.error('[setup] DISCOVERY_LINK_READ_FAILED', sessErr.message); return null }
    if (!session?.discovery_truck_id) return null
    const discoveryTruckId = session.discovery_truck_id as string
    const demoTruckId = session.truck_id as string
    const nowIso = now.toISOString()

    // 🔴 `.is('hatchgrab_truck_id', null)` + `.select('id')` — the SAME guard the admin promote uses, for
    // the same reason: an UPDATE that matches nothing is not an error in PostgREST, so the affected-row
    // count is the only way to see a conflict. A row that already carries a link is NOT overwritten.
    const { data: linked, error: linkErr } = await supabase
      .from('discovery_trucks')
      .update({ hatchgrab_truck_id: newTruckId, updated_at: nowIso })
      .eq('id', discoveryTruckId)
      .is('hatchgrab_truck_id', null)
      .select('id')

    let outcome: DiscoveryLinkOutcome
    if (linkErr) {
      outcome = { status: 'failed', discoveryTruckId, note: linkErr.message }
      console.error(`[setup] DISCOVERY_LINK_FAILED demo=${demoTruckId} discovery=${discoveryTruckId} truck=${newTruckId} — ${linkErr.message}`)
    } else if (!linked || linked.length === 0) {
      outcome = { status: 'conflict', discoveryTruckId, note: 'discovery row already linked to another truck, or no longer exists — not overwritten' }
      console.error(`[setup] DISCOVERY_LINK_CONFLICT demo=${demoTruckId} discovery=${discoveryTruckId} truck=${newTruckId} — row already linked or missing; left untouched`)
    } else {
      outcome = { status: 'linked', discoveryTruckId, note: null }
      // The shadow exclusion the admin promote applies in create-operator (by name there; by id here,
      // which is strictly narrower). Best-effort and separate from the link so its failure cannot undo it.
      const { error: exclErr } = await supabase
        .from('discovery_trucks').update({ excluded: true }).eq('id', discoveryTruckId)
      if (exclErr) console.error(`[setup] DISCOVERY_SHADOW_EXCLUDE_FAILED discovery=${discoveryTruckId} — ${exclErr.message}`)
    }

    // Record the outcome on the session for reconciliation. Best-effort: the truck already exists and
    // the link (if any) already landed; a failed diagnostic write changes neither.
    const { error: recErr } = await supabase.from('demo_sessions').update({
      discovery_link_status: outcome.status,
      discovery_link_truck_id: newTruckId,
      discovery_link_note: outcome.note,
      discovery_linked_at: nowIso,
    }).eq('truck_id', demoTruckId)
    if (recErr) console.error('[setup] DISCOVERY_LINK_RECORD_FAILED', recErr.message)

    return outcome
  } catch (e) {
    console.error('[setup] DISCOVERY_LINK_THREW', e instanceof Error ? e.message : e)
    return null
  }
}
