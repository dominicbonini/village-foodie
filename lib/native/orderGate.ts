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

/** action→status map for an OFFLINE optimistic status advance — mirrors what the server status handler sets.
 *  cancel/reject included so an offline cancel/reject shows its TERMINAL state immediately (they now route
 *  through the gate too — FIX 2 / offline-cancel queueing). */
const OFFLINE_STATUS_MAP: Record<string, string> = { confirm: 'confirmed', cooking: 'cooking', ready: 'ready', collected: 'collected', cancel: 'cancelled', reject: 'rejected' }

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

// ── FIX 2 — durable pending-status OVERLAY (offline) ────────────────────────────────────────────────
// The optimistic advance for an offline status change must OUTLIVE stale reads (the 60s poll, the SW cache
// re-serving a pre-change /api/dashboard snapshot) — a one-shot setOrders patch gets wiped. So instead of
// patching order state, we derive the optimistic status at RENDER from the durable outbox: the pending
// 'status' ops ARE the source of truth. It auto-clears when an op drains (reconnect), at which point the
// merge (FIX 1) accepts the server's newer updated_at → seamless handoff.

export interface PendingStatusOp { order_key: string; action: string; seq: number }

/** The pending (non-conflict) 'status' ops, oldest-first — the input to buildStatusOverlay. Reads Preferences. */
export async function listPendingStatusOps(): Promise<PendingStatusOp[]> {
  const ops = await listOps()
  return ops
    .filter(o => o.kind === 'status' && o.state !== 'conflict')
    .map(o => ({ order_key: o.order_key, action: String((o.body as { action?: unknown } | undefined)?.action ?? ''), seq: o.seq }))
    .filter(o => o.action)
    .sort((a, b) => a.seq - b.seq)
}

/** Fold the pending status ops (seq order) over the CURRENT orders to produce an optimistic status per
 *  order_key. Applied at render OVER the merged orders (before the column split) on both surfaces, so an
 *  offline-advanced card moves columns and no read can wipe it. Pure — orders provide the fold base
 *  (offlineStatusPatch resolves 'collected' status_before_collected / 'undo_collected' target from it). */
export function buildStatusOverlay(
  orders: Array<{ order_key: string; status?: string; status_before_collected?: string | null }>,
  ops: PendingStatusOp[],
): Map<string, { status: string; status_before_collected?: string | null }> {
  const overlay = new Map<string, { status: string; status_before_collected?: string | null }>()
  if (!ops.length) return overlay
  const baseByKey = new Map(orders.map(o => [o.order_key, { status: o.status, status_before_collected: o.status_before_collected }]))
  for (const op of ops) {
    const base = overlay.get(op.order_key) ?? baseByKey.get(op.order_key)   // fold sequential ops on the same order
    const sp = offlineStatusPatch(op.action, base)
    if (sp) overlay.set(op.order_key, sp)
  }
  return overlay
}

export interface GateResult {
  ok: boolean          // server accepted the write
  queued: boolean      // stored offline for later replay (optimistic local state should be applied)
  status?: number      // server HTTP status when a response was received
  data?: any           // parsed server JSON when ok
  provisional_id?: string  // device-prefixed display number for an offline-created order
  order_key: string
}

/** Device-prefixed provisional display number for an offline-created order (e.g. 'A13'), CONTINUING the
 *  sequence — seed the counter from the highest known order first (seedProvisionalSeq) so orders 1-4 mint
 *  M5, M6 rather than restarting. The M-number is KEPT as the permanent id on sync (server uses provisional_id
 *  as the order id). */
export async function nextProvisionalId(): Promise<string> {
  const letter = await deviceLetter()
  const cur = parseInt((await Preferences.get({ key: PROV_SEQ_KEY })).value ?? '0', 10) || 0
  const next = cur + 1
  await Preferences.set({ key: PROV_SEQ_KEY, value: String(next) })
  return `${letter}${next}`
}

/** Seed the provisional counter so offline numbers CONTINUE from the highest known order (not restart at 1).
 *  MONOTONIC — only ever raises hg_prov_seq (max), never rewinds; the running increment in nextProvisionalId
 *  still prevents multi-offline-order collisions (the panel's `orders` doesn't refetch while offline). Call on
 *  each sync/load with the highest known order number (letter prefix STRIPPED, e.g. "M5"→5, "4"→4). */
export async function seedProvisionalSeq(highestKnown: number): Promise<void> {
  if (!Number.isFinite(highestKnown) || highestKnown <= 0) return
  const cur = parseInt((await Preferences.get({ key: PROV_SEQ_KEY })).value ?? '0', 10) || 0
  if (highestKnown > cur) await Preferences.set({ key: PROV_SEQ_KEY, value: String(highestKnown) })
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

// SERIALIZE: only ONE drain may run at a time. OfflineBanner fires drainOutbox() from BOTH
// onReachabilityChange(online) AND the backoff scheduleRetry — with no lock they overlap, and Drain B can
// saveOp() an op that Drain A already removeOp()'d (the just-removed key comes back → synced-but-not-removed,
// stuck amber forever). A concurrent call coalesces onto the in-flight run instead of starting a second.
let drainInFlight: Promise<DrainResult> | null = null

/** Replay the outbox FIFO on reconnect. SERIALIZED (see drainInFlight). Idempotent replay (server dedupes on
 *  order_key upsert / status precondition), so a re-post of an already-applied op is a safe no-op that returns
 *  2xx → the op is finally removed. Outcomes: 2xx → remove; 409 → conflict (flag for review); thrown fetch →
 *  stop if likely offline, but flag+skip once it has failed MAX_ATTEMPTS so one poison op can't block the
 *  queue nor loop amber forever. Never creates duplicates. */
export async function drainOutbox(): Promise<DrainResult> {
  if (drainInFlight) return drainInFlight                        // already running → coalesce (race fix)
  drainInFlight = drainOnce().finally(() => { drainInFlight = null })
  return drainInFlight
}

async function drainOnce(): Promise<DrainResult> {
  const ops = (await listOps()).filter(o => o.state !== 'conflict')
  let synced = 0, conflicts = 0
  for (const op of ops) {
    // MALFORMED GUARD: a poison op from the buggy-code era can lack fields the whole pipeline relies on —
    // order_key (server idempotency / dedup / removal all key on it), url (post target), op_id (storage
    // key / removeOp). Such an op can NEVER sync idempotently or be cleanly removed → it would retry forever
    // amber (and NaN attempts from a missing `attempts` never reaches MAX, so it never even escalates). Flag
    // it 'conflict' (dismissible in the inspector) and SKIP — never post/retry it.
    if (!op.order_key || !op.url || !op.op_id) {
      if (op.op_id) await saveOp({ ...op, state: 'conflict', last_error: `malformed op — missing ${[!op.order_key && 'order_key', !op.url && 'url'].filter(Boolean).join('/') || 'required field'}` })
      conflicts++
      continue
    }
    // COPY-ON-WRITE: the op is deserialized from storage and can be FROZEN/readonly in the runtime (observed
    // on-device: mutating it throws "Attempted to assign to readonly property", crashing the whole drain on
    // the first op). NEVER mutate op in place; write a NEW object each time and persist that.
    // `attempts ?? 0` — a malformed op with a missing `attempts` would otherwise make NaN → never hits MAX.
    const syncing = { ...op, state: 'syncing' as const, attempts: (op.attempts ?? 0) + 1 }
    await saveOp(syncing)
    let res: Response
    try {
      res = await post(syncing.url, syncing.body)
    } catch (e: unknown) {
      // Thrown fetch = NO server response (genuine offline OR a per-op failure). If this op has now failed
      // MAX_ATTEMPTS times, treat it as poison: flag 'conflict' and CONTINUE so it can't block the ops behind
      // it nor loop amber forever (the earlier hole — the catch used to only ever set 'pending' + break).
      // Below MAX it's likely a transient/offline blip → keep 'pending' and STOP; retry on the next drain.
      const last_error = `network: ${e instanceof Error ? e.message : 'thrown fetch (no response)'}`
      if (syncing.attempts >= MAX_ATTEMPTS) { await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++; continue }
      await saveOp({ ...syncing, state: 'pending', last_error })
      break
    }
    if (res.ok) {
      await removeOp(syncing.op_id); synced++
    } else {
      // Capture the server's rejection reason for the dev inspector (HTTP status + body error), THEN branch.
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      const last_error = `HTTP ${res.status}${(data as any)?.error ? ` — ${(data as any).error}` : ''}`
      if (res.status === 409) {
        // Genuine conflict (e.g. the order was cancelled online while advanced offline) → flag, don't overwrite.
        await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++
      } else if (syncing.attempts >= MAX_ATTEMPTS) {
        await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++   // give up auto-retry → surface for review
      } else {
        await saveOp({ ...syncing, state: 'pending', last_error })                 // transient server error → retry next drain
      }
    }
  }
  const remaining = (await listOps()).filter(o => o.state !== 'conflict').length
  return { synced, conflicts, remaining }
}
