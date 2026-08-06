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
//   • We write ONE Preferences key per op (`hg_outbox_op_<op_id>`) so every enqueue is a single atomic set — a
//     hard-kill mid-write can't corrupt the whole queue (no read-modify-write of a shared blob).
//   Caveat (documented): NSUserDefaults flushes writes to disk on the OS's schedule, so a force-quit in the
//   sub-second window after the newest enqueue *could* drop only that last write. For Phase 1 this is the
//   accepted residual; the hardening upgrade is @capacitor-community/sqlite (per-commit fsync) — same
//   interface, swap the storage impl. See reference-manual + memory project_offline_order_handling_design.
import { Preferences } from '@capacitor/preferences'
import { getDeviceId } from '@/lib/native/device'

// OP-KEY PREFIX — MUST NOT be a prefix of any COUNTER key. The old prefix was 'hg_outbox_', which is
// itself a prefix of the counter 'hg_outbox_seq' → startsWith('hg_outbox_') wrongly enumerated the
// counter as an op (its value "1" JSON-parses to the number 1, a shapeless "op" with no order_key), so
// countPendingOps returned a PHANTOM 1 and the inspector showed a "malformed — missing order_key" entry
// even with ZERO real ops. The '_op_' segment fixes it structurally: 'hg_outbox_seq' does NOT start with
// 'hg_outbox_op_'. (Bump left as-is on any old-prefix data — there were no real ops to migrate.)
const KEY_PREFIX = 'hg_outbox_op_'
const SEQ_KEY = 'hg_outbox_seq'          // monotonic per-device counter (ordering, clock-independent)
const DEVICE_LETTER_KEY = 'hg_device_letter'
// ── 🔴 ACKNOWLEDGEMENT IS NOT DELETION ──────────────────────────────────────────────────────────────
// The op_ids whose conflict the operator has SEEN AND ACKNOWLEDGED. A separate key, deliberately: the op
// itself is never mutated and never removed, so acknowledging is a pure addition. See the ack functions.
const ACK_KEY = 'hg_outbox_conflict_ack'

// The Preferences keys this module owns that are NOT ops (counters / device state). Enumeration
// explicitly excludes these as defense-in-depth, so even a future counter sharing the op prefix by
// mistake can never be listed/counted as an op.
const NON_OP_KEYS = new Set<string>([SEQ_KEY, DEVICE_LETTER_KEY, ACK_KEY])

/** True only for an actual op key — the op prefix AND not a known counter/state key. */
function isOpKey(k: string): boolean {
  return k.startsWith(KEY_PREFIX) && !NON_OP_KEYS.has(k)
}

/** A parsed Preferences value is a real op only if it's an object carrying the op identity fields.
 *  Guards against a stray primitive (e.g. the counter's "1") ever being treated as an op. */
function isOpShape(v: unknown): v is OutboxOp {
  return !!v && typeof v === 'object' && typeof (v as OutboxOp).op_id === 'string'
    && typeof (v as OutboxOp).order_key === 'string'
}

// 'stock' — an offline stock write (set_stock / set_category_stock / set_modifier_option_*). It has no real
// order_key; the `order_key` field instead holds a SYNTHETIC stable key `${event_id}:${action}:${target}` so
// (a) it satisfies the drain's malformed-guard (which requires a truthy order_key), and (b) a re-queue for the
// SAME target+action COALESCES (see enqueue) → absolute last-write-wins locally, fewer replays. Idempotent on
// replay (set_stock is an absolute UPSERT). Excluded from the status-op paths (listPendingStatusOps filters
// kind==='status'), so it never touches the order overlay.
// 'buzzer' — an offline buzzer assignment/deselect (set_buzzer). Carries a REAL order_key, so it
// satisfies the drain's malformed-guard on its own. Its queued body also carries the ORDER'S placed_at,
// which is what server-side conflict resolution arbitrates on when two devices hand out the same
// number (later placed_at keeps it — see 20260804_assign_buzzer_atomic.sql).
// 🔴 NEVER COALESCED, unlike 'stock'. A buzzer number is a PHYSICAL FACT about a pager in a
// customer's hand; it cannot be re-derived from anything. Dropping an older op for a newer one on the
// same order would be safe only if the last write were the whole truth, and it is not — the
// intermediate assignment may be the one that raced another device. Every op replays.
// ⚠️ NOT the declared-but-unused 'edit' kind. That kind has no call site anywhere, has never been
// exercised on replay, and reusing it would mean a first outing for two things at once.
export type OutboxKind = 'create' | 'status' | 'edit' | 'stock' | 'buzzer'

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
  last_error?: string    // last drain failure (HTTP status + server error, or thrown-fetch) — for the dev inspector
}

/** uuid v4 — ALWAYS a valid RFC-4122 uuid. Used for BOTH the outbox op_id AND the order's order_key (a uuid
 *  PK), so the fallback MUST also be a real uuid. `crypto.randomUUID` is SECURE-CONTEXT-ONLY → undefined over
 *  plain HTTP (e.g. a phone hitting the dev server at http://<lan-ip>:3000, not localhost/https); the old
 *  `op_…` fallback then reached order_key and Postgres rejected it ("invalid input syntax for type uuid").
 *  getRandomValues works in insecure contexts; Math.random is a last-ditch. Both keep the uuid FORMAT valid. */
export function newUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  const b = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40   // version 4
  b[8] = (b[8] & 0x3f) | 0x80   // variant 10xx
  const h = Array.from(b, x => x.toString(16).padStart(2, '0'))
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`
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
  // COALESCE stock ops: a newer stock write for the SAME target (synthetic order_key) supersedes an older
  // pending one — absolute last-write-wins, fewer replays. Only pending/syncing (not 'conflict', which needs
  // review). Order/status/edit ops are never coalesced (each is a distinct mutation).
  if (input.kind === 'stock' && input.order_key) {
    for (const prev of await listOps()) {
      if (prev.kind === 'stock' && prev.order_key === input.order_key && prev.state !== 'conflict') await removeOp(prev.op_id)
    }
  }
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
    if (!isOpKey(k)) continue
    const v = (await Preferences.get({ key: k })).value
    if (!v) continue
    try {
      const parsed = JSON.parse(v)
      if (isOpShape(parsed)) ops.push(parsed)   // shape guard: a non-op value (e.g. a counter) is never an op
    } catch { /* skip a corrupt entry, never throw */ }
  }
  return ops.sort((a, b) => a.seq - b.seq)
}

export async function countOps(): Promise<number> {
  const { keys } = await Preferences.keys()
  return keys.filter(isOpKey).length
}

/** Count of ACTIONABLE ops (pending/syncing) — EXCLUDES 'conflict' ops. The banner uses THIS (not countOps)
 *  so a conflict awaiting review never keeps a perpetual "syncing" banner up. Reads op state (heavier than
 *  countOps' key-only count). */
export async function countPendingOps(): Promise<number> {
  return (await listOps()).filter(o => o.state !== 'conflict').length
}

/** Ops flagged 'conflict' (409 / gave-up after MAX_ATTEMPTS) — surfaced SEPARATELY for operator review. */
export async function listConflictOps(): Promise<OutboxOp[]> {
  return (await listOps()).filter(o => o.state === 'conflict')
}

// ── 🔴 DISMISSING THE BANNER IS NOT DISCARDING THE RECORD. READ BEFORE WIRING ANYTHING TO A BUTTON. ──
// This used to be one function, and the conflict banner's "Dismiss" called it. One tap deleted every
// conflict op — and since a queued payment now renders IDENTICALLY to a confirmed one, those ops are the
// ONLY surviving evidence that money was displayed as taken and never recorded. A reflexive tap on a red
// bar mid-service destroyed it, and nothing anywhere else could reconstruct it.
//
// Split into two operations that are not the same thing:
//   • acknowledgeConflicts(ids) — HIDES the banner. Adds op_ids to an ack list. Destroys nothing; the ops
//     stay in Preferences, listConflictOps still returns them, the dev inspector still shows them.
//   • clearConflicts()          — actually DELETES. 🔴 ZERO CALL SITES, and it must stay that way. If you
//     are about to wire this to a control, you are re-introducing the defect above. Kept only as a
//     deliberate recovery lever for a poison op that can never drain.

/** 🔴 DELETES the conflict ops. NOT the banner's Dismiss — see the note above. No UI calls this. */
export async function clearConflicts(): Promise<void> {
  for (const op of await listConflictOps()) await removeOp(op.op_id)
}

/** op_ids the operator has acknowledged. Pruned to ops that still exist, so the list cannot grow forever
 *  and a re-queued op can never inherit a stale acknowledgement. */
export async function listAcknowledgedIds(): Promise<Set<string>> {
  try {
    const raw = (await Preferences.get({ key: ACK_KEY })).value
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [])
  } catch { return new Set() }
}

/** Mark conflicts as SEEN. 🔴 Additive only — no op is mutated and no op is removed. Prunes ack entries
 *  whose op has since drained, so the key stays bounded. Best-effort: a failed write means the banner
 *  reappears on the next poll, which is the safe direction to fail in. */
export async function acknowledgeConflicts(opIds: string[]): Promise<void> {
  try {
    const live = new Set((await listOps()).map(o => o.op_id))
    const next = await listAcknowledgedIds()
    for (const id of opIds) next.add(id)
    const pruned = [...next].filter(id => live.has(id))
    await Preferences.set({ key: ACK_KEY, value: JSON.stringify(pruned) })
  } catch (e) { console.warn('[outbox] could not record the acknowledgement:', e) }
}

/** Conflict ops the operator has NOT yet acknowledged — what the banner and the per-order marker read.
 *  ⚠️ A conflict that has been acknowledged is HIDDEN, never gone: listConflictOps() still returns it. */
export async function listUnacknowledgedConflicts(): Promise<OutboxOp[]> {
  const [conflicts, acked] = await Promise.all([listConflictOps(), listAcknowledgedIds()])
  return conflicts.filter(o => !acked.has(o.op_id))
}

/** Remove an op — ONLY after a definitive server ACK (or a resolved conflict). */
export async function removeOp(op_id: string): Promise<void> {
  await Preferences.remove({ key: KEY_PREFIX + op_id })
}

/** Offline UNDO of a queued status change: remove the LATEST still-PENDING (non-conflict) status op for an
 *  order — clean revert, as-if-never-happened, no compensating op. Returns true if one was removed (false ⇒
 *  it already synced/drained → the caller falls back to the online compensating undo). */
export async function removePendingStatusOp(order_key: string): Promise<boolean> {
  const ops = (await listOps()).filter(o => o.kind === 'status' && o.state !== 'conflict' && o.order_key === order_key)
  if (!ops.length) return false
  const latest = ops.sort((a, b) => a.seq - b.seq)[ops.length - 1]
  await removeOp(latest.op_id)
  return true
}

/** DEV/recovery: wipe EVERY outbox op. Safe — an op's server effect is already applied (idempotent replay),
 *  so clearing only drops the local bookkeeping; used to clear poison ops from prior buggy-code testing. */
export async function clearAllOps(): Promise<void> {
  const { keys } = await Preferences.keys()
  for (const k of keys) if (isOpKey(k)) await Preferences.remove({ key: k })   // ops only — never the counters
}

/** Persist a mutated op (e.g. attempts++, state → 'syncing' | 'conflict'). */
export async function saveOp(op: OutboxOp): Promise<void> {
  await Preferences.set({ key: KEY_PREFIX + op.op_id, value: JSON.stringify(op) })
}
