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

// ── 🔴 THE PROVISIONAL SEQUENCE IS PER EVENT, NOT PER DEVICE-LIFETIME. ─────────────────────────────
// It used to be ONE lifelong key, `hg_prov_seq`, that `seedProvisionalSeq` only ever RAISED — so it never
// came back down when the event changed. A device sitting at 39 after one service minted N40 on the next
// event, whose orders run 1, 2, 3. That was invisible while the server renumbered offline orders on sync;
// adopting the provisional VERBATIM promoted it to customer-facing, which is what forced this.
// One key per event id. The no-event case gets its OWN key rather than sharing one, so a truck with no
// event selected cannot drag an event's sequence up or be dragged up by it.
// ⚠️ THE OLD GLOBAL KEY IS DELIBERATELY NOT MIGRATED — see seedProvisionalSeq. Carrying 39 forward into
// an event key is precisely the defect.
const PROV_SEQ_PREFIX = 'hg_prov_seq_'
const PROV_SEQ_NO_EVENT_KEY = 'hg_prov_seq_noevent'

/** The Preferences key holding the provisional sequence for ONE event. A null/empty event id (the
 *  no-event fallback the server handles via increment_order_counter) gets its own separate key. */
function provSeqKey(eventId: string | null | undefined): string {
  return eventId ? PROV_SEQ_PREFIX + eventId : PROV_SEQ_NO_EVENT_KEY
}
const MAX_ATTEMPTS = 5

// ── 🔴 RETRYABLE vs TERMINAL — THE CLASSIFICATION THE OUTBOX TURNS ON ────────────────────────────
// Until 2 September a write that got ANY server response was treated as delivered-and-rejected: never
// queued, never retried, gone. On 1 September the gateway answered `upstream request timeout` while
// Postgres was healthy, so operator actions were lost in exactly the conditions the outbox exists for.
//
// RETRYABLE = "the request was fine; the server could not serve it." The same bytes will succeed later,
// so the op belongs in the outbox.
//   • 5xx           — 500/502/503/504. app/api/dashboard/action/route.ts:194-198 already returns a 503
//                     with `Retry-After: 10` for "we could not check", and its own comment (:191) says
//                     "The client's gate already queues a write it could not deliver". IT DID NOT. This
//                     makes that sentence true.
//   • 408 / 429     — a timeout or a rate-limit is a "not now", never a "not ever".
//   • `retryable: true` in the body — the server's EXPLICIT contract, honoured above any status guess.
//
// TERMINAL = a verdict on THE REQUEST ITSELF. Replaying it can only fail again:
//   • 400/422 malformed · 403 forbidden · 404 no such order · 409 conflict (its own branch, flagged for
//     operator review, never overwritten).
//   • 🔴 401 IS TERMINAL, AND THAT IS SAFE ONLY BECAUSE OF THE STATUS SPLIT. The write route now
//     answers 503 for "could not check" (:194) and reserves 401 for bad_pin (:201) / unauthorised (:203)
//     — a decision it actually made. Before that split a 401 could mean a dead database, and queueing
//     it would have been correct. If that split is ever collapsed, THIS LINE BECOMES WRONG.
export function isRetryableFailure(status: number, body?: unknown): boolean {
  if (body && typeof body === 'object' && (body as { retryable?: unknown }).retryable === true) return true
  if (status >= 500) return true
  if (status === 408 || status === 429) return true
  return false
}

// 🔴 THE DEAD-LETTER BOUND IS TIME, NOT A COUNT — see the report. MAX_ATTEMPTS discarded a queued
// write after ~3 minutes of outage (5 drains at 5/10/20/40/60s backoff); 1 September ran over two hours.
// A retryable failure now burns NO attempt at all, so `attempts` counts only terminal answers and an
// outage can no longer exhaust it. This age bound is the sole backstop that stops an undeliverable op
// retrying for ever, and it does not DISCARD: it moves the op to `conflict`, which is the loud red
// operator banner in components/native/OfflineBanner.tsx, and the record stays on the device.
// ⚠️ `client_ts` is documented in outbox.ts as "display only — NEVER used for reconciliation". This is a
// LOCAL RETRY DEADLINE, not reconciliation: nothing about server ordering or conflict resolution reads it.
const MAX_QUEUE_AGE_MS = 12 * 60 * 60 * 1000   // 12h — longer than any plausible outage, shorter than a service

// Statuses a replayed status-op may apply FROM (incl. its own target → idempotent re-apply). It EXCLUDES the
// terminal-conflict states 'cancelled'/'rejected': if a customer cancelled/rejected the order online while
// the operator advanced it offline, the server returns 409 and the outbox flags it — never overwrites.
export const STATUS_REPLAY_EXPECTED_FROM = ['pending', 'confirmed', 'modified', 'cooking', 'ready', 'collected']

/** action→status map for an OFFLINE optimistic status advance — mirrors what the server status handler sets.
 *  cancel/reject included so an offline cancel/reject shows its TERMINAL state immediately (they now route
 *  through the gate too — FIX 2 / offline-cancel queueing). */
// ⚠️ `collected_cash` / `collected_card` ARE `collected` WITH A METHOD ON THE ROW. They complete the
// order exactly as `collected` does — same status, same status_before_collected rule below — and exist
// as separate action names only so the two buttons keep separate pending state and an offline replay
// carries which one was tapped. Omitting them here would leave an offline one-press completion with no
// optimistic advance while `collected` had one.
const OFFLINE_STATUS_MAP: Record<string, string> = { confirm: 'confirmed', cooking: 'cooking', ready: 'ready', collected: 'collected', collected_cash: 'collected', collected_card: 'collected', cancel: 'cancelled', reject: 'rejected' }

/** The three action names that complete an order. `collected` is the plain one; the other two also
 *  record HOW the money arrived. Every consumer that means "did this complete the order" tests this. */
export const COLLECT_ACTIONS = new Set(['collected', 'collected_cash', 'collected_card'])
export function isCollectAction(action: string): boolean { return COLLECT_ACTIONS.has(action) }

/** 🔴 THE TWO PLAIN IN-PERSON PAYMENT ACTIONS — the ones whose NAME carries no method.
 *  `mark_paid_cash` / `mark_paid_card` / `collected_cash` / `collected_card` answer for themselves and
 *  are deliberately absent: the server derives their method from the string and a body field would be a
 *  second source for one fact. These two are the only names a surface may attach `method` to, and it may
 *  only do so when the truck's own `takes_cash` setting answers the question. */
export const PLAIN_PAID_ACTIONS = new Set(['mark_paid', 'collected'])

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
  if (isCollectAction(action)) return { status: next, status_before_collected: order?.status ?? null }
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

// ── PAYMENT OVERLAY — the payment equivalent of the status overlay above ────────────────────────────
// 🔴 PAYMENT IS NOT A STATUS AND MUST NOT BE PUT IN OFFLINE_STATUS_MAP. That map patches `order.status`;
// payment state is DERIVED from ledger rows by getOrderBalance(). Writing 'paid' into the status machine
// would corrupt the card — the kitchen columns, the action buttons and mergeOrders all key on status.
// So payment gets its own overlay, layered ON TOP of getOrderBalance()'s output. getOrderBalance stays
// the resolver and the source of truth for CONFIRMED state; nothing here re-derives a balance.
//
// 🔴 IT PUBLISHES 'PENDING', NEVER 'PAID'. A queued op has not been accepted by the server. Claiming paid
// would be the same lie as keep-awake publishing a false 'off' after a failed release (§35): a state we
// cannot demonstrate, presented as fact. 'pending_paid' / 'pending_unpaid' say what is true — the
// operator has recorded it on this device and the server has not confirmed it.

/** The payment actions that route through the gate as kind:'status'. ⚠️ `collected` and `undo_collected`
 *  are NOT here: they change status too, so the STATUS overlay already moves the card for them. Adding
 *  them here would double-report the same op on two overlays.
 *  🔴 AND NEITHER ARE `collected_cash` / `collected_card`, FOR THE IDENTICAL REASON. They take money as
 *  well as completing the order, so the temptation is to list them — but they move the card through the
 *  STATUS overlay, and adding them would put the same op on two overlays. The distinction they exist for
 *  (per-button pending state, and a faithful offline replay) comes from the action STRING, which the
 *  outbox stores in the op body and replays verbatim; it does not require membership of this set. */
const PAYMENT_ACTIONS = new Set(['mark_paid', 'mark_paid_cash', 'mark_paid_card', 'undo_mark_paid'])

export type PendingPaymentState = 'pending_paid' | 'pending_unpaid'

/** 🔴 HOW A MONEY OP IS TOLD FROM A WORKFLOW OP. `kind` CANNOT do it — payment actions are queued as
 *  kind:'status' exactly like 'ready' and 'collected', because they replay to the same endpoint. The only
 *  discriminator is body.action, and this is the one predicate that owns that decision: the overlay above
 *  and the conflict classifier below both call it, so they can never disagree about what a payment is.
 *  ⚠️ Adding a new payment action means adding it to PAYMENT_ACTIONS and nowhere else. */
export function isPaymentAction(action: string): boolean {
  return PAYMENT_ACTIONS.has(action)
}

/** The action string an op will replay with — '' if the body carries none (a malformed/legacy op). */
export function opAction(op: { body?: unknown }): string {
  return String((op.body as { action?: unknown } | undefined)?.action ?? '')
}

/** Pending payment ops, oldest-first. Same outbox, same 'status' kind — filtered by ACTION. */
export async function listPendingPaymentOps(): Promise<PendingStatusOp[]> {
  const ops = await listOps()
  return ops
    .filter(o => o.kind === 'status' && o.state !== 'conflict')
    .map(o => ({ order_key: o.order_key, action: String((o.body as { action?: unknown } | undefined)?.action ?? ''), seq: o.seq }))
    .filter(o => PAYMENT_ACTIONS.has(o.action))
    .sort((a, b) => a.seq - b.seq)
}

/** Fold pending payment ops (seq order) → the optimistic payment state per order_key.
 *  LAST OP WINS: mark → undo → mark folds to 'pending_paid', which is what the operator last did. Pure. */
export function buildPaymentOverlay(ops: PendingStatusOp[]): Map<string, PendingPaymentState> {
  const overlay = new Map<string, PendingPaymentState>()
  for (const op of ops) {
    overlay.set(op.order_key, op.action === 'undo_mark_paid' ? 'pending_unpaid' : 'pending_paid')
  }
  return overlay
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

/** Device-prefixed provisional display number for an offline-created order (e.g. 'A13'), CONTINUING
 *  THAT EVENT'S sequence — seed from the event's highest known order first (seedProvisionalSeq) so orders
 *  1-3 mint N4, not N40. The number is KEPT as the permanent id on sync (the server adopts provisional_id
 *  verbatim as orders.id), so it is shown to a customer and can never be revised.
 *  🔴 MONOTONIC WITHIN THE EVENT: read-add-persist on that event's key alone, so this can never return a
 *  value it has already returned for the same event. The device letter is unchanged and still
 *  distinguishes two devices minting into the same event. */
export async function nextProvisionalId(eventId: string | null | undefined): Promise<string> {
  const letter = await deviceLetter()
  const key = provSeqKey(eventId)
  const cur = parseInt((await Preferences.get({ key })).value ?? '0', 10) || 0
  const next = cur + 1
  await Preferences.set({ key, value: String(next) })
  return `${letter}${next}`
}

/** Seed THIS EVENT'S provisional counter so offline numbers continue from that event's highest known
 *  order (not restart at 1, and not continue from a different event's). Call on each sync/load with the
 *  highest order number IN THAT EVENT (letter prefix STRIPPED, e.g. "N5"→5, "4"→4).
 *  🔴 STILL ONLY EVER RAISES, within that event's key — never lowers an existing value. That is what makes
 *  re-issue impossible: a reconnect re-seeds ABOVE the numbers already shown, never below them.
 *  🔴 AND THE OLD GLOBAL `hg_prov_seq` IS NEVER READ HERE. Its value is deliberately not migrated into any
 *  event key: a device at 39 must start the next event from that event's own orders, which is the entire
 *  point of the change. The stale key is simply left in place, orphaned and unread. */
export async function seedProvisionalSeq(eventId: string | null | undefined, highestKnown: number): Promise<void> {
  if (!Number.isFinite(highestKnown) || highestKnown <= 0) return
  const key = provSeqKey(eventId)
  const cur = parseInt((await Preferences.get({ key })).value ?? '0', 10) || 0
  if (highestKnown > cur) await Preferences.set({ key, value: String(highestKnown) })
}

/** Live-submit bound. An operator is WAITING on this one, and the panel holds seven controls disabled
 *  until it settles — 83 seconds was observed on hardware. 5s is comfortably inside reachability's own
 *  ~30s offline verdict, so a genuinely dead uplink still falls through to the queue rather than being
 *  pre-empted, while a slow-but-working one has time to answer a small POST. */
const LIVE_TIMEOUT_MS = 5_000
/** Drain bound. Nobody is waiting on a replay, so this is generous — but it MUST exist: an unbounded
 *  fetch here never settles, `drainInFlight` never clears, and every later drainOutbox() returns the same
 *  dead promise. That is what stranded an order for 39 minutes. */
const DRAIN_TIMEOUT_MS = 30_000

/** 🔴 BOUNDED. `AbortSignal.timeout` rejects the fetch, so a hang becomes an ORDINARY THROWN FETCH and
 *  lands in the callers' existing `catch` — gatedAction queues it, the drain marks it pending and retries.
 *  Nothing about failure CLASSIFICATION changes: an abort is not a response, so it can never be read as a
 *  409 and can never dead-letter on its own. It only dead-letters via the pre-existing MAX_ATTEMPTS rule. */
async function post(url: string, body: Record<string, unknown>, timeoutMs: number = DRAIN_TIMEOUT_MS): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
}

/** The GATE. `online` is a hint from reachability — when false on native we skip a doomed attempt and queue
 *  straight away. `order_key` must already be in `body` (client-minted for creates). */
export async function gatedAction(opts: {
  url: string
  body: Record<string, unknown>
  kind: OutboxKind
  order_key: string
  provisional_id?: string
  /** Event the order belongs to — used ONLY to key the provisional sequence when queue() mints. Passed by
   *  the create caller; every other kind mints nothing and can omit it. */
  eventId?: string | null
  online?: boolean
  expectedFrom?: string[]   // merged into the QUEUED body only (the online attempt stays byte-identical)
  /** Extra keys merged into the QUEUED body only, same contract as expectedFrom. Used by 'buzzer' ops
   *  to mark themselves `replay: true` and to carry the order's placed_at, so the server can arbitrate
   *  a two-device conflict — neither of which must ever ride on an online request, where the operator
   *  was present and their decision is not something to arbitrate. */
  queuedExtra?: Record<string, unknown>
}): Promise<GateResult> {
  const { url, body, kind, order_key, provisional_id, eventId, online, expectedFrom, queuedExtra } = opts

  const queue = async (): Promise<GateResult> => {
    // PLACED OFFLINE, STAMPED HERE AND NOWHERE ELSE. This is the ONE place every queued body passes
    // through, which is why the flag lives here rather than at the call sites: an order queued because
    // reachability flipped AFTER its body was built (the 'route 2' case that produced an unmarked order
    // 5 on 21 August) is stamped just the same as one built while already offline. The panel cannot know
    // at body-build time; this function knows at queue time, which is the moment that is actually true.
    // It rides on the QUEUED body only, exactly like expected_from -- an online request is untouched.
    // ── 🔴 THE NUMBER IS MINTED HERE, ONCE, AND NOWHERE ELSE. ────────────────────────────────────
    // It used to be decided at BODY-BUILD time on `isOnline()` — a DEBOUNCED BANNER signal that stays
    // true for ~30s after real connectivity loss. An order placed inside that window was sent with
    // `provisional_id: null`, failed, and was queued UNMARKED, while the panel separately minted a label
    // from a second expression. The server then correctly assigned a counter value and the customer's
    // number changed under them: an order labelled N41 landed as 41.
    // 🔴 MINTING AT ENQUEUE IS THE ONLY MOMENT THAT IS ACTUALLY TRUE. This function is the one place
    // every queued body passes through, and it is reached from BOTH routes — the known-offline check and
    // the thrown-fetch catch. The same seam already stamps `placed_offline` for exactly this reason.
    // 🔴 AND IT IS RETURNED, SO THE CALLER DISPLAYS WHAT WAS SENT. The second mint at the call site is
    // deleted; there is now one value, used for the body and the card. Minting a FRESH number here while
    // the panel kept its own would have traded a renumber for a mismatch, which is worse.
    // ⚠️ ONLY FOR `create`, and only when the caller supplied none — a status/stock/buzzer op has no
    // display number, and a caller that already has one keeps it.
    // ⚠️ NO SEQUENCE VALUE IS CONSUMED BY AN ORDER THAT ENDS UP ONLINE: this runs only on the queue path.
    let mintedProvisional = provisional_id ?? ''
    if (!mintedProvisional && kind === 'create') mintedProvisional = await nextProvisionalId(eventId ?? null)
    // expected_from rides ONLY on the replayed op → online requests are unchanged; the server guards replays.
    const queuedBody: Record<string, unknown> = { ...body, placed_offline: true, ...(expectedFrom ? { expected_from: expectedFrom } : {}), ...(queuedExtra ?? {}) }
    // 🔴 STAMPED WHERE THE SERVER ACTUALLY READS IT — inside `manualOrder`, not at the body root. The
    // server reads `manualOrder.provisional_id`; a root-level key would be silently ignored and the
    // order would replay unmarked, which is the defect this exists to close. Shape-specific on purpose,
    // and guarded by `kind === 'create'`, which is the only kind with that shape.
    if (mintedProvisional && kind === 'create' && queuedBody.manualOrder && typeof queuedBody.manualOrder === 'object') {
      queuedBody.manualOrder = { ...(queuedBody.manualOrder as Record<string, unknown>), provisional_id: mintedProvisional }
    }
    await enqueue({ kind, order_key, url, body: queuedBody, provisional_id: mintedProvisional })
    return { ok: false, queued: true, provisional_id: mintedProvisional, order_key }
  }

  // Native + known-offline → don't burn a timeout, queue immediately.
  if (isNativeApp() && online === false) return queue()

  try {
    const res = await post(url, body, LIVE_TIMEOUT_MS)
    const data = await res.json().catch(() => ({}))
    // 🔴 A RETRYABLE SERVER FAILURE IS A DELIVERY FAILURE, NOT A REJECTION. This branch used to read
    // "A server RESPONSE (even an error) is NOT an offline case" and returned every non-ok status to the
    // caller — so a 503 from a degraded backend lost the operator's action outright. A response now only
    // ends the attempt when it is a VERDICT (isRetryableFailure === false).
    // ⚠️ NATIVE ONLY. Web has no durable outbox, so queueing there would promise storage that does not
    // exist — the one thing this file must never do. Web behaviour is unchanged, byte for byte.
    if (!res.ok && isNativeApp() && isRetryableFailure(res.status, data)) return queue()
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
    // it 'conflict' (dismissible in the inspector) and SKIP — never post/retry it. (A kind:'stock' op is
    // VALID here: it carries a SYNTHETIC key `${event_id}:${action}:${target}` in order_key, so it passes.)
    if (!op.order_key || !op.url || !op.op_id) {
      if (op.op_id) await saveOp({ ...op, state: 'conflict', last_error: `malformed op — missing ${[!op.order_key && 'order_key', !op.url && 'url'].filter(Boolean).join('/') || 'required field'}` })
      conflicts++
      continue
    }
    // COPY-ON-WRITE: the op is deserialized from storage and can be FROZEN/readonly in the runtime (observed
    // on-device: mutating it throws "Attempted to assign to readonly property", crashing the whole drain on
    // the first op). NEVER mutate op in place; write a NEW object each time and persist that.
    // `attempts ?? 0` — a malformed op with a missing `attempts` would otherwise make NaN → never hits MAX.
    const priorAttempts = op.attempts ?? 0
    const syncing = { ...op, state: 'syncing' as const, attempts: priorAttempts + 1 }
    await saveOp(syncing)
    // 🔴 THE AGE BOUND, EVALUATED ONCE PER OP. A retryable failure no longer burns an attempt, so this
    // is the ONLY thing that can end an undeliverable op — and it ends it in `conflict` (the red operator
    // banner), never by deleting it.
    const tooOld = Date.now() - (op.client_ts ?? Date.now()) > MAX_QUEUE_AGE_MS
    let res: Response
    try {
      res = await post(syncing.url, syncing.body)
    } catch (e: unknown) {
      // Thrown fetch = NO server response: genuine offline, DNS/TLS, or our own 30s drain timeout. That is
      // RETRYABLE BY DEFINITION — the request never reached a server that could judge it.
      // 🔴 IT NO LONGER BURNS AN ATTEMPT. It used to, and five drains at 5/10/20/40/60s backoff dead-
      // lettered a perfectly good queue after ~3 minutes. `attempts` is restored to its pre-try value so it
      // counts TERMINAL answers only; `tooOld` is the backstop that keeps a poison op from looping for ever.
      const last_error = `network: ${e instanceof Error ? e.message : 'thrown fetch (no response)'}`
      if (tooOld) { await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++; continue }
      await saveOp({ ...syncing, attempts: priorAttempts, state: 'pending', last_error })
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
      } else if (isRetryableFailure(res.status, data)) {
        // 🔴 THE DEGRADED-BACKEND BRANCH, AND THE REASON ONE DRAIN NO LONGER POSTS THE WHOLE QUEUE.
        // A 5xx says the SERVER is failing, not this op — so every op behind it would fail the same way.
        // `break` stops the drain exactly as a thrown fetch does, leaving the rest untouched and pending;
        // OfflineBanner's 5/10/20/40/60s backoff owns the next attempt. No attempt is burned.
        // ⚠️ Before this, the branch below set 'pending' and CONTINUED — so a degraded route received every
        // queued op in sequence, each with its own 30s timeout, and each op reached MAX_ATTEMPTS in five
        // drains. That is the write-loss this change exists to end.
        if (tooOld) { await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++; continue }
        await saveOp({ ...syncing, attempts: priorAttempts, state: 'pending', last_error })
        break
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
