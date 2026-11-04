// lib/truck-access.ts — 🔴 WHO MAY USE A TRUCK'S MANAGE SCREEN: the deny-by-default check, MOVED here unchanged from
// app/api/manage/route.ts (paperwork-1, 4 November 2026) so a second route (app/api/manage/paperwork) asks the SAME
// function rather than a copy. The route keeps a one-line wrapper with the same name and call, so every harness that stubs
// `const access = await resolveTruckAccess(req, truck)` there still finds it.
// The reasoning below is the route's, word for word.
//
// ══ 🔴 DENY BY DEFAULT. THE TOKEN SAYS WHICH TRUCK; THE SESSION SAYS WHO. ═════════════════════════
// This route used to initialise the caller's role to 'owner' and only NARROW it when a session
// resolved — so NO SESSION MEANT OWNER, and possession of a dashboard_token was full authority over
// somebody's business. The inversion is the whole fix: no resolved caller ⇒ no access.
// ⚠️ TWO CREDENTIALS, ONE ANSWER. Web sends a cookie session (@supabase/ssr). The NATIVE app has no
// cookie — its session lives in @capacitor/preferences — and sends a Bearer JWT instead.
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isDemoIdentifier } from '@/lib/demo'

/** Native app: `Authorization: Bearer <access_token>`. Same shape as /api/native/my-trucks. */
async function userIdFromBearer(supabase: SupabaseClient, req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!jwt) return null
  try {
    const { data } = await supabase.auth.getUser(jwt)
    return data.user?.id ?? null
  } catch { return null }
}

/** Cookie session (web) first, then the native Bearer. Null = no caller could be established. */
async function resolveCallerId(supabase: SupabaseClient, req: NextRequest): Promise<string | null> {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (user) return user.id
  } catch { /* no cookie / transient auth fault — fall through to the Bearer */ }
  return userIdFromBearer(supabase, req)
}

export type TruckAccess =
  | { ok: true; role: 'owner' | 'manager' | 'staff'; userId: string | null; operatorId: string | null; via: 'demo' | 'admin' | 'owner' | 'member' }
  | { ok: false; status: 401 | 403; error: string; code: 'sign_in_required' | 'no_truck_access' }

/**
 * 🔴 THE ONE PLACE ACCESS IS DECIDED, for both GET and POST.
 *
 * 🔴 THE DEMO CARVE-OUT IS KEYED ON THE TRUCK ID PREFIX, NOT ON `operator_id IS NULL`.
 * A demo truck has no owner BY CONSTRUCTION — lib/provision-truck.ts writes `operator_id: null`, and a
 * prospect works one with no account at all, so there is no session to resolve and never will be.
 * ⚠️ THE `operator_id IS NULL` SHAPE WAS REJECTED DELIBERATELY: it would silently re-open this hole for
 * any REAL truck that ends up unowned — and an unowned real truck is the normal state immediately after
 * provisioning, before /api/admin/create-operator runs. A rule that grants owner to "whoever asks" the
 * moment a column is null is the same defect wearing a different condition.
 * The prefix rule is the one lib/demo.ts defines and the demo-cleanup cron already enforces before it
 * will delete anything (`isDemoIdentifier` → `startsWith('demo-')`), and assertReservedPrefix() in
 * provision-truck guarantees no operator truck can ever carry it. Same rule, same source, three places.
 */
export async function resolveTruckAccessWith(supabase: SupabaseClient, req: NextRequest, truck: { id: string; operator_id: string | null }): Promise<TruckAccess> {
  // ── The carve-out. Narrow, explicit, and first so the reasoning is impossible to miss.
  if (isDemoIdentifier(truck.id)) {
    return { ok: true, role: 'owner', userId: null, operatorId: null, via: 'demo' }
  }

  const userId = await resolveCallerId(supabase, req)
  // 🔴 THE INVERSION. No caller ⇒ no access. This is the line the whole workstream exists to add.
  if (!userId) {
    return { ok: false, status: 401, error: 'Sign in required', code: 'sign_in_required' }
  }

  const { data: op } = await supabase
    .from('operators').select('id, is_admin').eq('auth_user_id', userId).maybeSingle()

  // Platform admin — the same bypass /api/native/my-trucks grants, kept consistent.
  if (op?.is_admin) return { ok: true, role: 'owner', userId, operatorId: op.id, via: 'admin' }

  // Owner of THIS truck. ⚠️ `truck.operator_id &&` matters: without it, two nulls compare equal and
  // every unowned truck would hand ownership to any operator who asked.
  if (op && truck.operator_id && op.id === truck.operator_id) {
    return { ok: true, role: 'owner', userId, operatorId: op.id, via: 'owner' }
  }

  // Crew member on THIS truck. The role stored here is what the 24-action gate below reads.
  const { data: truckUser } = await supabase
    .from('truck_users').select('role').eq('auth_user_id', userId).eq('truck_id', truck.id).maybeSingle()
  if (truckUser?.role) {
    return { ok: true, role: truckUser.role as 'owner' | 'manager' | 'staff', userId, operatorId: op?.id ?? null, via: 'member' }
  }

  // 🔴 AUTHENTICATED, BUT NOT ON THIS TRUCK. A token is not a grant.
  return { ok: false, status: 403, error: 'You do not have access to this truck', code: 'no_truck_access' }
}
