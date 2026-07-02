'use client'
// ── Phase-1 offline OUTBOX (order integrity) ──────────────────────────────────────────────────────────
// Durable, per-op queue of order mutations that failed to reach the server (offline / unreachable). The
// GATE (lib/native/orderGate.ts) writes here on failure; the drain replays on reconnect. Orders here MUST
// survive a hard app-kill.
//
// STORAGE CHOICE — Capacitor Preferences (iOS: NSUserDefaults plist in the app sandbox):
//   • Persists to disk and survives force-quit + device restart (it is NOT WebKit "website data", so — unlike
//     WKWebView IndexedDB/localStorage — it is never evicted under WebKit storage pressure).
//   • Already a project dependency (session/device/app-lock use it) → no new native plugin to add + cap-sync.
//   • We write ONE Preferences key per op (`hg_outbox_<op_id>`) so every enqueue is a single atomic set — a
//     hard-kill mid-write can't corrupt the whole queue (no read-modify-write of a shared blob).
//   Caveat (documented): NSUserDefaults flushes writes to disk on the OS's schedule, so a force-quit in the
//   sub-second window after the newest enqueue *could* drop only that last write. For Phase 1 this is the
//   accepted residual; the hardening upgrade is @capacitor-community/sqlite (per-commit fsync) — same
//   interface, swap the storage impl. See reference-manual + memory project_offline_order_handling_design.
import { Preferences } from '@capacitor/preferences'
import { getDeviceId } from '@/lib/native/device'

const KEY_PREFIX = 'hg_outbox_'
const SEQ_KEY = 'hg_outbox_seq'          // monotonic per-device counter (ordering, clock-independent)
const DEVICE_LETTER_KEY = 'hg_device_letter'

export type OutboxKind = 'create' | 'status' | 'edit'

export interface OutboxOp {
  op_id: string          // uuid — dedupe / logging
  kind: OutboxKind
  order_key: string      // uuid, client-minted at create — THE server idempotency key
  url: string            // endpoint to replay to (e.g. /api/dashboard/action)
  body: Record<string, unknown>  // the POST payload (already includes order_key / action / manualOrder)
  seq: number            // per-device monotonic → FIFO replay (a create precedes its own status ops)
  client_ts: number      // display only — NEVER used for reconciliation
  attempts: number
  provisional_id: string // device-prefixed display number for offline creates (e.g. 'A13'); '' for status ops
  state: 'pending' | 'syncing' | 'conflict'
}

/** uuid v4 (crypto-backed; falls back to a random string on ancient runtimes). */
export function newUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `op_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

/** A stable single letter for THIS device (from device_id) → offline display numbers can't collide across
 *  devices (A13 vs B13). Persisted so it's stable across launches. */
export async function deviceLetter(): Promise<string> {
  const existing = (await Preferences.get({ key: DEVICE_LETTER_KEY })).value
  if (existing) return existing
  const id = getDeviceId()
  // Derive a deterministic A–Z from the device_id so it's stable even before the first persist.
  let sum = 0
  for (let i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i)) % 26
  const letter = String.fromCharCode(65 + sum)
  await Preferences.set({ key: DEVICE_LETTER_KEY, value: letter })
  return letter
}

async function nextSeq(): Promise<number> {
  const cur = parseInt((await Preferences.get({ key: SEQ_KEY })).value ?? '0', 10) || 0
  const next = cur + 1
  await Preferences.set({ key: SEQ_KEY, value: String(next) })
  return next
}

/** Durably persist a new op. Returns the stored op (with seq). MUST resolve before the caller treats the
 *  order as "saved" (persist-before-network / persist-before-ack invariant). */
export async function enqueue(input: {
  kind: OutboxKind
  order_key: string
  url: string
  body: Record<string, unknown>
  provisional_id?: string
}): Promise<OutboxOp> {
  const op: OutboxOp = {
    op_id: newUuid(),
    kind: input.kind,
    order_key: input.order_key,
    url: input.url,
    body: input.body,
    seq: await nextSeq(),
    client_ts: Date.now(),
    attempts: 0,
    provisional_id: input.provisional_id ?? '',
    state: 'pending',
  }
  await Preferences.set({ key: KEY_PREFIX + op.op_id, value: JSON.stringify(op) })
  return op
}

/** All queued ops, oldest-first (FIFO by seq). */
export async function listOps(): Promise<OutboxOp[]> {
  const { keys } = await Preferences.keys()
  const ops: OutboxOp[] = []
  for (const k of keys) {
    if (!k.startsWith(KEY_PREFIX)) continue
    const v = (await Preferences.get({ key: k })).value
    if (!v) continue
    try { ops.push(JSON.parse(v) as OutboxOp) } catch { /* skip a corrupt entry, never throw */ }
  }
  return ops.sort((a, b) => a.seq - b.seq)
}

export async function countOps(): Promise<number> {
  const { keys } = await Preferences.keys()
  return keys.filter(k => k.startsWith(KEY_PREFIX)).length
}

/** Remove an op — ONLY after a definitive server ACK (or a resolved conflict). */
export async function removeOp(op_id: string): Promise<void> {
  await Preferences.remove({ key: KEY_PREFIX + op_id })
}

/** Persist a mutated op (e.g. attempts++, state → 'syncing' | 'conflict'). */
export async function saveOp(op: OutboxOp): Promise<void> {
  await Preferences.set({ key: KEY_PREFIX + op.op_id, value: JSON.stringify(op) })
}
