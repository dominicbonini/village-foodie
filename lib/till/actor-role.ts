// lib/till/actor-role.ts — 🔴 till-pack-2 (25 November 2026, docs/till-pack-2-report.md): THE ACTOR'S ROLE BEHIND A CORRECTION.
//
// When a route records an edit, an undo, a reversal or a refund, the ROLE of whoever did it — owner / staff / admin / system / unknown,
// never a name or an id (those stay in action_audit_log) — is recorded against the till chain entries that correction made, in
// till_entry_actors (supabase/migrations/20261133_till_pack_2.sql). The route reads the truck's chain head BEFORE the write and names the
// order AFTER it; till_record_actor() then links the role to that order's entries made in between (its versions, its payment rows).
// 🔴 BEST-EFFORT, NEVER A REFUSAL: both calls swallow their own errors. A truck outside the till (a demo truck) simply has no entries.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResolvedActor } from '@/lib/audit/actor'

export type TillRole = 'owner' | 'staff' | 'admin' | 'system' | 'unknown'

/** The coarse role for the till: an admin acting on a truck that is not theirs is 'admin'; a shared truck token is 'unknown'. */
export function tillRoleOf(actor: Pick<ResolvedActor, 'actorKind'> & { adminAccess?: boolean } | null | undefined): TillRole {
  if (!actor) return 'unknown'
  if (actor.adminAccess) return 'admin'
  if (actor.actorKind === 'owner' || actor.actorKind === 'staff' || actor.actorKind === 'system') return actor.actorKind
  return 'unknown'
}

/** The truck's chain head now (0 when it has none, or on any failure — the later record then simply covers more, never fewer). */
export async function tillHeadSeq(supabase: SupabaseClient, truckId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('till_head_seq', { p_truck: truckId })
    if (error) { console.warn('[till] head read failed (the actor role is still recorded):', error.message); return 0 }
    return Number(data) || 0
  } catch { return 0 }
}

/** Record the role behind the order's entries made since `fromSeq`. Returns how many entries it named (0 on any failure). */
export async function noteTillActor(
  supabase: SupabaseClient,
  args: { truckId: string; fromSeq: number; orderKey: string | null | undefined; action: string; role: TillRole },
): Promise<number> {
  if (!args.orderKey || !/^[a-z_]{1,40}$/.test(args.action)) return 0
  try {
    const { data, error } = await supabase.rpc('till_record_actor', { p_truck: args.truckId, p_from_seq: args.fromSeq, p_order_key: args.orderKey, p_action: args.action, p_role: args.role })
    if (error) { console.warn(`[till] actor role not recorded for ${args.action}:`, error.message); return 0 }
    return Number(data) || 0
  } catch (e) {
    console.warn(`[till] actor role not recorded for ${args.action}:`, e instanceof Error ? e.message : e)
    return 0
  }
}
