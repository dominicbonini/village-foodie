'use client'
// ── Phase-1 order GATE + replay drain ─────────────────────────────────────────────────────────────────
// Every order mutation (walk-up create, status advance/complete) goes through gatedAction():
//   try the Supabase-backed write → success: done → NETWORK failure (offline/unreachable) on NATIVE: persist
//   to the durable outbox + return a "queued" result so the screen can apply optimistic local state + show
//   the offline warning. On reconnect, drainOutbox() replays FIFO, idempotently (server dedupes on order_key
//   / status-precondition), removing each op only after a definitive ACK.
//
// SAFETY: on WEB (non-native) OR on a server response (even an error), behaviour is IDENTICAL to a plain
// fetch — we only ever queue on a NATIVE app that could not REACH the server (thrown fetch). Server-side
// rejections (400/403/409…) are returned to the caller as today, never silently queued.
import { Preferences } from '@capacitor/preferences'
import { isNativeApp } from '@/lib/native/device'
import { enqueue, listOps, removeOp, saveOp, deviceLetter, type OutboxKind } from '@/lib/native/outbox'

const PROV_SEQ_KEY = 'hg_prov_seq'
const MAX_ATTEMPTS = 5

// Statuses a replayed status-op may apply FROM (incl. its own target → idempotent re-apply). It EXCLUDES the
// terminal-conflict states 'cancelled'/'rejected': if a customer cancelled/rejected the order online while
// the operator advanced it offline, the server returns 409 and the outbox flags it — never overwrites.
export const STATUS_REPLAY_EXPECTED_FROM = ['pending', 'confirmed', 'modified', 'cooking', 'ready', 'collected']

/** action→status map for an OFFLINE optimistic status advance — mirrors what the server status handler sets. */
const OFFLINE_STATUS_MAP: Record<string, string> = { confirm: 'confirmed', cooking: 'cooking', ready: 'ready', collected: 'collected' }

/**
 * Compute the optimistic local order-status change for an offline-QUEUED status action, so the UI advances
 * immediately (deferred sync). SHARED by the dashboard (doAction) and the KDS (handleAction) so both behave
 * identically — one source of truth, never a divergent map. Returns the fields to merge into the order, or
 * null if the action doesn't change status. `order` supplies the current status ('collected' →
 * status_before_collected) and the prior status_before_collected ('undo_collected' revert target).
 */
export function offlineStatusPatch(
  action: string,
  order: { status?: string; status_before_collected?: string | null } | undefined,
): { status: string; status_before_collected?: string | null } | null {
  if (action === 'undo_collected') return { status: order?.status_before_collected ?? 'confirmed', status_before_collected: null }
  const next = OFFLINE_STATUS_MAP[action]
  if (!next) return null
  if (action === 'collected') return { status: next, status_before_collected: order?.status ?? null }
  return { status: next }
}

export interface GateResult {
  ok: boolean          // server accepted the write
  queued: boolean      // stored offline for later replay (optimistic local state should be applied)
  status?: number      // server HTTP status when a response was received
  data?: any           // parsed server JSON when ok
  provisional_id?: string  // device-prefixed display number for an offline-created order
  order_key: string
}

/** Device-prefixed provisional display number for an offline-created order (e.g. 'A13'), stable + non-
 *  colliding across devices. Replaced by the server's real sequential id at sync. */
export async function nextProvisionalId(): Promise<string> {
  const letter = await deviceLetter()
  const cur = parseInt((await Preferences.get({ key: PROV_SEQ_KEY })).value ?? '0', 10) || 0
  const next = cur + 1
  await Preferences.set({ key: PROV_SEQ_KEY, value: String(next) })
  return `${letter}${next}`
}

async function post(url: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

/** The GATE. `online` is a hint from reachability — when false on native we skip a doomed attempt and queue
 *  straight away. `order_key` must already be in `body` (client-minted for creates). */
export async function gatedAction(opts: {
  url: string
  body: Record<string, unknown>
  kind: OutboxKind
  order_key: string
  provisional_id?: string
  online?: boolean
  expectedFrom?: string[]   // merged into the QUEUED body only (the online attempt stays byte-identical)
}): Promise<GateResult> {
  const { url, body, kind, order_key, provisional_id, online, expectedFrom } = opts

  const queue = async (): Promise<GateResult> => {
    // expected_from rides ONLY on the replayed op → online requests are unchanged; the server guards replays.
    const queuedBody = expectedFrom ? { ...body, expected_from: expectedFrom } : body
    await enqueue({ kind, order_key, url, body: queuedBody, provisional_id })
    return { ok: false, queued: true, provisional_id, order_key }
  }

  // Native + known-offline → don't burn a timeout, queue immediately.
  if (isNativeApp() && online === false) return queue()

  try {
    const res = await post(url, body)
    const data = await res.json().catch(() => ({}))
    // A server RESPONSE (even an error) is NOT an offline case — return it as-is (web behaviour unchanged).
    return { ok: res.ok, queued: false, status: res.status, data, provisional_id, order_key }
  } catch {
    // Thrown fetch = could not reach the server. Queue on native; on web, surface as a failed (non-queued)
    // result so existing web error handling runs exactly as before.
    if (isNativeApp()) return queue()
    return { ok: false, queued: false, order_key }
  }
}

export interface DrainResult { synced: number; conflicts: number; remaining: number }

/** Replay the outbox FIFO on reconnect. Idempotent (server dedupes on order_key / status precondition):
 *  a 2xx ACK → remove; a 409 conflict → flag for review (kept, state='conflict'); a network error → stop
 *  (remaining ops stay pending for the next reconnect). Never creates duplicates. */
export async function drainOutbox(): Promise<DrainResult> {
  const ops = (await listOps()).filter(o => o.state !== 'conflict')
  let synced = 0, conflicts = 0
  for (const op of ops) {
    // COPY-ON-WRITE: the op is deserialized from storage and can be FROZEN/readonly in the runtime (observed
    // on-device: mutating it throws "Attempted to assign to readonly property", crashing the whole drain on
    // the first op → nothing ever syncs/removes → the "Syncing" banner sticks). NEVER mutate op in place;
    // write a NEW object each time and persist that. Also cleaner: no aliasing of the persisted snapshot.
    const syncing = { ...op, state: 'syncing' as const, attempts: op.attempts + 1 }
    await saveOp(syncing)
    let res: Response
    try {
      res = await post(syncing.url, syncing.body)
    } catch {
      // Lost connectivity mid-drain → stop; this + later ops stay 'pending' for next time.
      await saveOp({ ...syncing, state: 'pending' })
      break
    }
    if (res.ok) {
      await removeOp(syncing.op_id); synced++
    } else if (res.status === 409) {
      // Genuine conflict (e.g. the order was cancelled online while advanced offline) → flag, don't overwrite.
      await saveOp({ ...syncing, state: 'conflict' }); conflicts++
    } else if (syncing.attempts >= MAX_ATTEMPTS) {
      await saveOp({ ...syncing, state: 'conflict' }); conflicts++   // give up auto-retry → surface for review
    } else {
      await saveOp({ ...syncing, state: 'pending' })                 // transient server error → retry next drain
    }
  }
  const remaining = (await listOps()).filter(o => o.state !== 'conflict').length
  return { synced, conflicts, remaining }
}
