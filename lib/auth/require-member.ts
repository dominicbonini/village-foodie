// lib/auth/require-member.ts — 🔴 "ONLY SIGNED-IN TEAM MEMBERS MAY VIEW THE DASHBOARD OR CHANGE ANYTHING"
// (dashboard-auth-2, 18 November 2026; docs/dashboard-auth-1-report.md is the review, docs/dashboard-auth-2-report.md
// this build).
//
// Every staff route that today authorises on the dashboard token (+PIN) calls `requireMember` once per request. It
// works out WHO is calling and whether the planned rule would let them:
//   • member        — a signed-in owner, manager or staff member of THIS truck              → allowed
//   • admin         — a signed-in HatchGrab admin (operators.is_admin)                      → allowed
//   • foreign_operator — signed in, but an operator of ANOTHER truck                        → would refuse
//   • kds           — nobody signed in, on a kitchen screen opened from /kds/<kds_token>    → would refuse (D2 i)
//   • token_only    — nobody signed in (the link, and the PIN if set, only)                 → would refuse
//   • unresolved    — the sign-in check itself failed (auth service down)                   → logged, never refused
//                     (under enforcement this must be a RETRYABLE 503, never a refusal)
//   • demo          — a demo truck (same rule as lib/truck-access.ts: the `demo-` truck id) → EXEMPT, not logged
// `/api/heartbeat` never calls this: refusing a heartbeat would pause online ordering.
//
// ── 🔴 MODE 'log' (TODAY, EVERY GROUP) NEVER REFUSES AND NEVER DELAYS ─────────────────────────────────────────────
// `requireMember` returns `{ refuse: null }` straight away. The sign-in lookup (when the route has not already done
// it) and the row are done AFTER the response, through lib/runtime/after-response.ts `keepAlive` (Next's `after()`),
// with every error caught. A shadow row is written only for a caller that WOULD be refused:
//   action_audit_log: action = 'auth_shadow:<action>', truck_id, actor_kind / actor_id (the caller's auth id when one
//   resolved — an operator identifier, never a customer's; actor_label is left NULL), source (web / native /
//   offline_replay), after_state = { route, caller_kind, client: 'web'|'app'|'kds', group, mode, method } and, for
//   board reads, { reads_suppressed_before, suppressed_since }.
//   🔴 NEVER the token, the PIN, an order key or any customer field — nothing from the request body goes in except the
//   action NAME, and that only after it matches /^[a-z_]{1,40}$/.
// BOARD READS ARE THROTTLED (Dominic, 18 November 2026: "Q1 A … also record the number of reads suppressed"): at most
// one row per truck × caller kind × client per hour, per server instance; the next row carries how many reads were
// suppressed since the last one. Serverless instances come and go, so the counts are a floor, not an exact total.
//
// ── TURNING ENFORCEMENT ON ──────────────────────────────────────────────────────────────────────────────────────────
// One line per group in AUTH_MODE. Routes already do `if (gate.refuse) return gate.refuse`. ⚠️ Before flipping a group:
// the refusal's words (messages) and the offline queue's "hold until signed in" (docs/dashboard-auth-1-report.md §5
// step 4) must ship first — the body below is a placeholder code with no wording, deliberately (no wording changes in
// this build).
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveActor, resolveActorSource, type ResolvedActor, type ActorSource } from '@/lib/audit/actor'
import { logAction } from '@/lib/audit/actionAudit'
import { keepAlive } from '@/lib/runtime/after-response'
import { isDemoIdentifier } from '@/lib/demo'

/** group1 — events, refunds and Manage-level settings; group2 — orders, payments, stock, service controls, settings;
 *  read — the board and the lists it is built from. (docs/dashboard-auth-1-report.md §5.) */
export type AuthGroup = 'group1' | 'group2' | 'read'
export type AuthMode = 'log' | 'enforce'
/** 🔴 THE SWITCH. 'log' everywhere until the shadow log has been read after deploy. */
export const AUTH_MODE: Record<AuthGroup, AuthMode> = { group1: 'log', group2: 'log', read: 'log' }

export type CallerKind = 'member' | 'admin' | 'foreign_operator' | 'kds' | 'token_only' | 'unresolved' | 'demo'
export type ClientKind = 'web' | 'app' | 'kds'

/** The client, from what the request says about itself (labels for the log — never a credential). */
export function clientKindOf(req: NextRequest | Request): ClientKind {
  if ((req.headers.get('x-hg-client') || '') === 'kds-link') return 'kds'
  if ((req.headers.get('user-agent') || '').includes('HatchGrabNativeApp')) return 'app'
  return 'web'
}

/** True for the callers the planned rule refuses. */
export function wouldRefuse(kind: CallerKind): boolean {
  return kind === 'foreign_operator' || kind === 'kds' || kind === 'token_only' || kind === 'unresolved'
}

type Truck = { id: string; operator_id?: string | null }

/** Who is calling. `actor` when the route already resolved it (no second lookup). `distinguishAdmin` adds one read to
 *  tell an admin from the owner — only needed when the answer is shown; both are allowed. */
export async function classifyCaller(
  req: NextRequest | Request,
  supabase: SupabaseClient,
  truck: Truck,
  opts: { actor?: ResolvedActor | null; distinguishAdmin?: boolean } = {},
): Promise<{ kind: CallerKind; actor: ResolvedActor | null }> {
  if (isDemoIdentifier(truck.id)) return { kind: 'demo', actor: opts.actor ?? null }
  let actor = opts.actor ?? null
  if (!actor) {
    try {
      // ⚠️ resolveActor recognises the OWNER through `truck.operator_id`. Several routes look the truck up with a
      // narrow select that leaves it out; without it an owner would read as token-only. Fetch it when missing.
      let t: Truck = truck
      if (!('operator_id' in truck)) {
        const { data, error } = await supabase.from('trucks').select('operator_id').eq('id', truck.id).maybeSingle()
        if (error) return { kind: 'unresolved', actor: null }
        t = { id: truck.id, operator_id: (data?.operator_id as string | null) ?? null }
      }
      actor = await resolveActor(req, supabase, t)
    } catch { return { kind: 'unresolved', actor: null } }
  }
  // resolveActorSafe reports a failed lookup as actorKind 'unknown'.
  if ((actor.actorKind as string) === 'unknown') return { kind: 'unresolved', actor }
  if (actor.foreignOperator) return { kind: 'foreign_operator', actor }
  if (actor.userRole) {
    if (opts.distinguishAdmin && actor.userRole === 'owner' && actor.actorId) {
      try {
        const { data: op } = await supabase.from('operators').select('id, is_admin').eq('auth_user_id', actor.actorId).maybeSingle()
        if (op?.is_admin && op.id !== truck.operator_id) return { kind: 'admin', actor }
      } catch { /* an admin is allowed either way */ }
    }
    return { kind: 'member', actor }
  }
  return { kind: clientKindOf(req) === 'kds' ? 'kds' : 'token_only', actor }
}

// ── BOARD-READ THROTTLE (per server instance) ───────────────────────────────────────────────────────────────────────
export const READ_WINDOW_MS = 60 * 60 * 1000
const readWindows = new Map<string, { since: number; suppressed: number }>()
/** Tests only. */
export function __resetAuthShadowThrottle(): void { readWindows.clear() }

const safeAction = (a: unknown) => (typeof a === 'string' && /^[a-z_]{1,40}$/.test(a) ? a : 'unknown')

// ── PENDING SHADOW WORK (so tests can wait for it; the request never does) ─────────────────────────────────────────
const pending = new Set<Promise<void>>()
/** Tests only: wait for every scheduled shadow task to finish. */
export async function flushAuthShadow(): Promise<void> { while (pending.size) await Promise.all([...pending]) }

export interface RequireMemberOptions {
  /** The route, for the row ('/api/dashboard/action'). */
  route: string
  group: AuthGroup
  /** The caller, when the route already resolved it. */
  actor?: ResolvedActor | null
  /** An offline-queue replay (the body carried `expected_from`). */
  replay?: boolean
  /** Override AUTH_MODE[group] (tests). */
  mode?: AuthMode
}

/**
 * The member gate. Mode 'log': never refuses, never awaits anything slow — the check and its row happen after the
 * response. Mode 'enforce': awaits the check and returns a refusal for a caller the rule refuses.
 */
export async function requireMember(
  req: NextRequest | Request,
  supabase: SupabaseClient,
  truck: Truck,
  action: unknown,
  opts: RequireMemberOptions,
): Promise<{ refuse: Response | null }> {
  try {
    if (isDemoIdentifier(truck?.id)) return { refuse: null }             // demo: exempt, not logged
    const mode = opts.mode ?? AUTH_MODE[opts.group]
    if (mode === 'enforce') {
      const { kind } = await classifyCaller(req, supabase, truck, { actor: opts.actor })
      if (kind === 'unresolved') {
        return { refuse: NextResponse.json({ code: 'service_unavailable', retryable: true }, { status: 503, headers: { 'Retry-After': '10' } }) }
      }
      if (wouldRefuse(kind)) {
        scheduleShadow(req, supabase, truck, action, opts, 'enforce', kind)
        return { refuse: NextResponse.json({ code: 'sign_in_required', requiresSignIn: true }, { status: 403 }) }
      }
      return { refuse: null }
    }
    scheduleShadow(req, supabase, truck, action, opts, 'log', null)
  } catch (err) {
    console.error('[auth-shadow] could not schedule (ignored):', err instanceof Error ? err.message : err)
  }
  return { refuse: null }
}

function scheduleShadow(
  req: NextRequest | Request, supabase: SupabaseClient, truck: Truck, action: unknown,
  opts: RequireMemberOptions, mode: AuthMode, knownKind: CallerKind | null,
): void {
  // Everything the task needs from the request is read NOW (headers only — never the body).
  const client = clientKindOf(req)
  const source: ActorSource = opts.replay ? 'offline_replay' : resolveActorSource(req, {})
  const method = req.method
  const task = (async () => {
    try {
      const { kind, actor } = knownKind ? { kind: knownKind, actor: opts.actor ?? null } : await classifyCaller(req, supabase, truck, { actor: opts.actor })
      if (!wouldRefuse(kind)) return
      const name = safeAction(action)
      const extra: Record<string, unknown> = {}
      if (opts.group === 'read') {
        const key = `${truck.id}|${kind}|${client}`
        const now = Date.now()
        const w = readWindows.get(key)
        if (w && now - w.since < READ_WINDOW_MS) { w.suppressed++; return }
        if (w) { extra.reads_suppressed_before = w.suppressed; extra.suppressed_since = new Date(w.since).toISOString() }
        else extra.reads_suppressed_before = 0
        readWindows.set(key, { since: now, suppressed: 0 })
      }
      console.info(`[auth-shadow] would refuse ${opts.route} ${name} truck=${truck.id} caller=${kind} client=${client} group=${opts.group} mode=${mode}`)
      await logAction(supabase, {
        action: `auth_shadow:${name}`,
        truckId: truck.id,
        actor: { actorKind: actor?.actorKind ?? 'token', actorId: actor?.actorId ?? null, actorLabel: null },
        source,
        afterState: { route: opts.route, caller_kind: kind, client, group: opts.group, mode, method, ...extra },
      })
    } catch (err) {
      console.error('[auth-shadow] task failed (ignored):', err instanceof Error ? err.message : err)
    }
  })()
  pending.add(task)
  void task.finally(() => pending.delete(task))
  keepAlive(task, 'auth-shadow')
}
