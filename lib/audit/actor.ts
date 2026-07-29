// ── ACTOR RESOLUTION — THE SINGLE IMPLEMENTATION ─────────────────────────────────────────────────────
// Who is making this request? Extracted VERBATIM from app/api/dashboard/route.ts:55-109 (the dashboard
// GET), which was the only place in the codebase that resolved a human. It is now shared by that route
// and by /api/dashboard/action, which previously discarded identity entirely.
//
// 🔴 DO NOT WRITE A SECOND IMPLEMENTATION. `truck_users` is already queried inline in eight API routes
// with three different shapes; that is the `makeCartKey` triplication class the manual documents (§27),
// and identity resolution is a far worse thing to have drift than a cache key. If another route needs an
// actor, import this.
//
// ⚠️ NEITHER FUNCTION HERE REFUSES A REQUEST.
// They return a description of what could be determined — they do not decide anything. That separation is
// load-bearing: the dashboard GET *does* 403 a user who belongs to a different truck, and it still does,
// by inspecting `foreignOperator` itself. The action route deliberately ignores that flag and proceeds.
// Attribution is a LOGGING concern; making it an authorisation concern would turn a cookie hiccup into a
// refused "Mark paid & done" at a live hatch. `verifyToken` remains the only gate.
//
// ── TWO ENTRY POINTS, BECAUSE THE TWO CALLERS WANT OPPOSITE FAILURE POSTURES ────────────────────────
//   resolveActor()     — MAY THROW, exactly as the original inline block did (it had no try/catch, so an
//                        auth-service error surfaced as a 500). The dashboard GET uses this, so its
//                        behaviour is preserved byte-for-byte, including in the error case.
//   resolveActorSafe() — never throws; degrades to actor_kind 'unknown'. The ACTION route uses this, so
//                        a failed identity lookup degrades the LOG and never the operation.
// Keeping the difference here rather than in the routes means the 'unknown' fallback shape is defined
// once, and neither caller can accidentally acquire the other's posture.
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/** Coarse identity class. 'token' and 'unknown' are NOT the same thing and must not be collapsed:
 *  'token'   — resolution ran cleanly and there was no session. A shared per-truck token acted. This is
 *              the normal, legitimate KDS/anonymous case, and it is a FACT worth recording.
 *  'unknown' — resolution itself failed (auth service error, unexpected throw). We do not know whether a
 *              user was present. "We failed to ask" — distinct from "we asked and nobody was there". */
export type ActorKind = 'owner' | 'staff' | 'token' | 'unknown'

/** Where the request came from, where determinable. */
export type ActorSource = 'web' | 'native' | 'offline_replay'

export interface ResolvedActor {
  actorKind: ActorKind
  /** auth.users id when a session resolved, else null. */
  actorId: string | null
  /** Display name or email when resolvable, else null. */
  actorLabel: string | null
  /** The precise membership role, preserved for the GET route's existing response shape. */
  userRole: 'owner' | 'manager' | 'staff' | null
  /** The GET route's existing `currentUserName` — same value, same fallbacks. */
  currentUserName: string | null
  /** TRUE only when the user has an operator record but is NOT a member of THIS truck. The dashboard GET
   *  turns this into a 403; the action route ignores it. This flag is the whole reason the helper returns
   *  data instead of a NextResponse. */
  foreignOperator: boolean
}

const TOKEN_ONLY: ResolvedActor = {
  actorKind: 'token', actorId: null, actorLabel: null,
  userRole: null, currentUserName: null, foreignOperator: false,
}

const UNKNOWN: ResolvedActor = {
  actorKind: 'unknown', actorId: null, actorLabel: null,
  userRole: null, currentUserName: null, foreignOperator: false,
}

/**
 * Resolve the acting human, if any.
 *
 * Behaviour is byte-for-byte the previous inline block: cookie session first (web, unchanged), then a
 * Bearer fallback for the native app, then operators → is_admin all-access → truck_users membership.
 *
 * ⚠️ MAY THROW — deliberately, because the block this replaces had no try/catch and an auth-service
 * error surfaced as a 500 on the dashboard GET. Preserving that means the GET's error semantics are
 * unchanged by the extraction. Callers that must never fail should use resolveActorSafe().
 */
export async function resolveActor(
  req: NextRequest | Request,
  serviceClient: SupabaseClient,
  truck: { id: string; operator_id?: string | null },
): Promise<ResolvedActor> {
  {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user: cookieUser } } = await supabaseAuth.auth.getUser()   // WEB (cookie) — unchanged
    let user = cookieUser

    // ADDITIVE (native app): the app has NO cookie, but sends its Supabase session as a Bearer so the
    // SAME operator/is_admin/role resolution below applies. Only runs when there's no cookie user.
    if (!user) {
      const authz = req.headers.get('authorization')
      const jwt = authz?.startsWith('Bearer ') ? authz.slice(7) : null
      if (jwt) {
        const { data: { user: bearerUser } } = await serviceClient.auth.getUser(jwt)
        if (bearerUser) user = bearerUser
      }
    }

    // No session at all → a shared per-truck token acted. Recorded as a fact, not as a null.
    if (!user) return TOKEN_ONLY

    const { data: operator } = await serviceClient
      .from('operators')
      .select('id, name, email, is_admin')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    const isOwner = !!(operator && truck.operator_id && truck.operator_id === operator.id)

    // Admins (operators.is_admin) get owner-equivalent ALL-ACCESS to any truck's dashboard, regardless of
    // ownership/membership (interim — a distinct "admin view" role is backlogged).
    if (isOwner || operator?.is_admin) {
      const label = operator!.name || operator!.email || null
      return { actorKind: 'owner', actorId: user.id, actorLabel: label, userRole: 'owner', currentUserName: label, foreignOperator: false }
    }

    // Not the owner — check truck_users membership (staff/manager, or an invited user whose operators
    // record was created during invite but who doesn't own any truck).
    const { data: truckUser } = await serviceClient
      .from('truck_users')
      .select('name, email, role')
      .eq('auth_user_id', user.id)
      .eq('truck_id', truck.id)
      .maybeSingle()

    if (truckUser) {
      const label = truckUser.name || truckUser.email || null
      const role = (truckUser.role as 'owner' | 'manager' | 'staff') || 'staff'
      // actor_kind is the COARSE vocabulary ('owner' | 'staff'); `manager` collapses into 'staff' here.
      // The precise role survives in `userRole` for the GET response — but note it is NOT persisted to
      // action_audit_log, so a manager and a staff member are indistinguishable in the log today.
      return {
        actorKind: role === 'owner' ? 'owner' : 'staff',
        actorId: user.id, actorLabel: label, userRole: role, currentUserName: label, foreignOperator: false,
      }
    }

    // Has an operator account, but for a DIFFERENT truck. The GET route 403s on this; we only report it.
    if (operator && truck.operator_id) {
      return { actorKind: 'token', actorId: user.id, actorLabel: operator.name || operator.email || null, userRole: null, currentUserName: null, foreignOperator: true }
    }

    // Session exists but maps to no operator and no membership → token-only access (KDS/anonymous).
    return TOKEN_ONLY
  }
}

/**
 * resolveActor(), but it CANNOT fail. Any throw degrades to actor_kind 'unknown' — "we failed to ask",
 * which the log records as distinct from 'token' ("we asked and nobody was there").
 *
 * 🔴 THIS IS THE ONLY VERSION /api/dashboard/action MAY USE. Attribution there must never be able to
 * refuse or break an operator action: a Supabase blip during identity lookup must cost a log field, not
 * a collection at a live hatch.
 */
export async function resolveActorSafe(
  req: NextRequest | Request,
  serviceClient: SupabaseClient,
  truck: { id: string; operator_id?: string | null },
): Promise<ResolvedActor> {
  try {
    return await resolveActor(req, serviceClient, truck)
  } catch (e) {
    console.error('[actor] identity resolution failed — recording actor_kind=unknown and proceeding:', e)
    return UNKNOWN
  }
}

/**
 * Where did this request come from?
 *   'offline_replay' — the body carries `expected_from`, which lib/native/orderGate.ts:135 adds ONLY to a
 *                      replayed op ("expected_from rides ONLY on the replayed op"). A reliable marker.
 *   'native'         — the Capacitor shell's UA marker, the same signal proxy.ts:164 uses.
 *   'web'            — everything else.
 * ⚠️ 'offline_replay' means the action was QUEUED earlier and is being applied now: `created_at` on the
 * audit row is the REPLAY time, not the time the operator tapped. `client_ts` exists on the op envelope
 * but is explicitly "display only — NEVER used for reconciliation" (outbox.ts:62) and is not transmitted.
 */
export function resolveActorSource(req: NextRequest | Request, body: { expected_from?: unknown }): ActorSource {
  if (Array.isArray(body?.expected_from)) return 'offline_replay'
  if ((req.headers.get('user-agent') || '').includes('HatchGrabNativeApp')) return 'native'
  return 'web'
}
