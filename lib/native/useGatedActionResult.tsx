'use client'
// ── POST-GATE RESULT HANDLING — ONE IMPLEMENTATION, BOTH SURFACES ────────────────────────────────────
// `gatedAction` was already shared and already called identically by the dashboard and the KDS. Every
// divergence between the two surfaces lived DOWNSTREAM of it — in what each did with the result — and
// that is what this module ends. See docs/offline-outbox-parity-report.md for the diagnosis: the KDS
// toasted only for 'ready', offered Undo only for 'ready', had no payment overlay, and swallowed every
// thrown error in an empty `catch {}`.
//
// 🔴 THE DASHBOARD IS THE REFERENCE, NOT THE AVERAGE. Every string, every duration, every Undo target
// and the whole branch ORDER below are the dashboard's, lifted verbatim. This file exists so the KDS
// rises to them; nothing here was softened to make the two meet in the middle. If a branch reads oddly,
// it reads exactly as oddly as it did on Pizzeria Gusto's live money path yesterday.
//
// 🔴 SURFACE-SPECIFIC EFFECTS ARE OPTIONAL CALLBACKS, AND AN OMITTED ONE OMITS THAT EFFECT — the
// EventActionsModal pattern (`onStartEvent?: () => void  /* Omit to hide. */`). The dashboard has prep
// pills and the KDS does not; the KDS has a queued-op counter and the dashboard does not. Neither is a
// gap to be filled — they are features one surface has — so each is a callback the other simply does not
// pass. That is what keeps this ONE implementation rather than a sixth block written to look shared.
//
// ⚠️ THIS IS A .tsx, NOT A .ts, FOR EXACTLY ONE REASON: the committed-'ready' toast renders a JSX
// fragment (`<>Order #{num} ready · {buzzerPill(…)}</>`). `ShowToast` takes a ReactNode precisely so that
// pill can travel, and a .ts file cannot hold the markup. Moving the fragment was not optional — it is
// the one piece of toast copy whose byte-identity across the two surfaces was already a stated design
// requirement (see the KDS's own comment at its former call site).
//
// ⚠️ WHAT THIS FILE DOES NOT TOUCH: `gatedAction`, the outbox, reachability, the drain, `expected_from`,
// the status/payment overlay MODULES, `useOutboxConflicts`, `OfflineBanner`, the action endpoint, and
// every server-side idempotency guard. It runs strictly after the gate has returned.
import { useCallback } from 'react'
import { buzzerPill } from '@/lib/buzzer'
import { isCollectAction, type GateResult } from '@/lib/native/orderGate'
import { removePendingStatusOp } from '@/lib/native/outbox'
import type { ShowToast } from '@/lib/useToasts'

/** The minimum a resolved order must carry for the shared branches: its display number and its buzzer.
 *  Anything else a surface needs (the dashboard's `items`, for the prep strike) reaches its own callback
 *  through the generic, never through this shape. */
export interface GatedOrderLike {
  order_key: string
  id: string | number
  buzzer_number?: number | null
}

export interface GatedActionEffects<TOrder extends GatedOrderLike> {
  // ── REQUIRED — both surfaces have all of these today ──────────────────────────────────────────────
  showToast: ShowToast
  /** Resolve the order for its display number. ⚠️ The DASHBOARD deliberately falls back to
   *  `deviceQueuedOrders` here, because an offline-CREATED order is not in `orders` yet; the KDS has no
   *  create path and no such list. The fallback is therefore the caller's, not this module's. */
  findOrder: (orderKey: string) => TOrder | undefined
  refreshPendingStatus: () => void
  dropOverlayEntry: (orderKey: string) => void
  scheduleReadyEmail: (orderKey: string) => void
  undoReady: (orderKey: string, displayId: string | number) => void
  /** Re-enter the surface's OWN action handler — so a repair or an Undo takes the same offline gate the
   *  original tap took. 🔴 NOT a direct fetch: `mark_paid` fired from the PAYMENT NOT RECORDED toast must
   *  queue when offline exactly as a tapped one would. */
  runAction: (action: string, orderKey: string) => void
  refetch: () => void | Promise<void>
  setActionLoading: (v: string | null) => void

  // ── OPTIONAL — omit to omit the effect ────────────────────────────────────────────────────────────
  /** The payment overlay's refresh. Both surfaces pass it. */
  refreshPendingPayment?: () => void
  /** An op was just queued (the KDS's pending-sync set + counter). The dashboard has no such state. */
  onQueued?: (orderKey: string) => void
  /** That queued op was removed again by the offline Undo — the exact inverse of `onQueued`. */
  onQueuedUndone?: (orderKey: string) => void
  /** Strike this order's prep pills (the dashboard's solo-operator auto-clear). The KDS has no pills. */
  onPrepStrike?: (orderKey: string, order: TOrder) => void
  /** Un-strike them, for the offline Undo. Pair it with `onPrepStrike` or pass neither. */
  onPrepUnstrike?: (orderKey: string) => void
}

/**
 * Handle a `gatedAction` result. Call it inside the caller's own `try`, and let it throw:
 *
 *   const result = await gatedAction({…})
 *   await handleGateResult(result, action, orderKey)
 *
 * 🔴 IT THROWS ON A SERVER REJECTION, exactly as the dashboard always has (`if(!result.ok)throw new
 * Error(data.error)`), so the caller's `catch` is what surfaces it. That throw is the whole of the KDS's
 * fourth gain: its `catch {}` was empty, so a rejected action produced nothing at all.
 */
export function useGatedActionResult<TOrder extends GatedOrderLike>(fx: GatedActionEffects<TOrder>) {
  const {
    showToast, findOrder, refreshPendingStatus, dropOverlayEntry, scheduleReadyEmail, undoReady,
    runAction, refetch, setActionLoading,
    refreshPendingPayment, onQueued, onQueuedUndone, onPrepStrike, onPrepUnstrike,
  } = fx

  return useCallback(async (result: GateResult, action: string, orderKey: string): Promise<void> => {
    // ── QUEUED OFFLINE ────────────────────────────────────────────────────────────────────────────
    // The optimistic advance is a DURABLE render-time overlay derived from the outbox, NOT a one-shot
    // patch (a stale poll or an SW-cache read would wipe that). Refreshing it here is what moves the card
    // instantly; it outlives reads and auto-clears when the server catches up.
    if (result.queued) {
      const q = findOrder(orderKey)
      refreshPendingStatus(); refreshPendingPayment?.()
      onQueued?.(orderKey)
      // Mirror the online prep-board auto-clear on ready/collected.
      if ((action === 'ready' || isCollectAction(action)) && q) onPrepStrike?.(orderKey, q)
      setActionLoading(null)
      // OFFLINE UNDO: remove the still-pending op → the overlay reverts as-if-never-happened. If it
      // already synced within the toast window (removePendingStatusOp → false), fall back to the ONLINE
      // compensating undo. Offered for ready/collected, matching the online undo affordance.
      const offlineUndo = async () => {
        const removed = await removePendingStatusOp(orderKey)
        if (removed) {
          dropOverlayEntry(orderKey); refreshPendingStatus()
          onQueuedUndone?.(orderKey)
          onPrepUnstrike?.(orderKey)
          showToast(`Order #${q?.id ?? ''} reverted`)
        } else if (action === 'ready') { undoReady(orderKey, q?.id ?? '') }
        else if (isCollectAction(action)) { runAction('undo_collected', orderKey) }
        else { void refetch() }
      }
      const savedMsg = `Order #${q?.id ?? ''} saved`
      if (action === 'ready' || isCollectAction(action)) {
        showToast(savedMsg, 'success', { duration: 7000, action: { label: '↩ Undo', run: offlineUndo } })
      } else { showToast(savedMsg) }
      return
    }

    // ── COMMITTED ─────────────────────────────────────────────────────────────────────────────────
    const data = result.data ?? {}
    if (!result.ok) throw new Error(data.error)
    const labels: Record<string, string> = { confirm: 'confirmed', reject: 'rejected', ready: 'ready', collected: 'collected', undo_collected: 'restored', cancel: 'cancelled' }
    const done = findOrder(orderKey)
    const num = done?.id ?? ''
    // ── THE MONEY HALF FAILED, ON A 200 ─────────────────────────────────────────────────────────────
    // 🔴 `result.ok` IS TRUE HERE AND THE ACTION DID PARTLY SUCCEED. 'collected' books the ledger row,
    // then logs, then writes the status; the ledger write FAILS OPEN so the operator is never stranded at
    // the hatch. The response carries `paymentWarning`, and an order completed with no payment recorded
    // otherwise looks EXACTLY like a successful one: green toast, card cleared, done.
    // 🔴 IT REPLACES THE SUCCESS TOAST, never sits beside it. Two toasts for one tap — one green, one red
    // — is the operator reading whichever their eye lands on, and the green one is the lie. So this is
    // the FIRST branch of the chain and the others are `else if`; everything AFTER the chain still runs,
    // because the order really did advance. The 20s duration is a deliberate outlier against the 3.5s
    // default: this is the only toast that reports missing money, and it must survive a glance away at a
    // hatch. It is NOT the durable record — the card marker is — it is what catches them in the act.
    // ⚠️ The repair is the SAME 'mark_paid' the card offers, charging the outstanding balance under the
    // same idempotency key: safe to re-fire, and a no-op if the money did land after all.
    const moneyFailed = !!data.paymentWarning
    // ── TWO-STAGE UNDO ────────────────────────────────────────────────────────────────────────────
    // With the paid step split there are TWO undoable actions, so each gets its OWN toast naming the
    // stage it reverses. Undo is never ambiguous after a fast double tap: whichever toast is on screen is
    // the one for the tap you just made, and it reverses exactly that stage. Undoing "Done" leaves the
    // payment standing — the server does the same, and that is a decision recorded elsewhere, not one
    // this module may quietly change.
    if (moneyFailed) {
      showToast(
        `⚠ Order #${num} — PAYMENT NOT RECORDED. ${isCollectAction(action) ? 'The order completed' : 'The order was saved'}; the money did not.`,
        'error',
        { duration: 20000, action: { label: 'Record payment', run: () => runAction('mark_paid', orderKey) } },
      )
    } else if (action === 'mark_paid') {
      showToast(`Order #${num} marked paid`, 'success', { duration: 7000, action: { label: '↩ Undo', run: () => runAction('undo_mark_paid', orderKey) } })
    } else if (action === 'undo_mark_paid') {
      showToast('Undone — payment removed')
    } else if (action === 'undo_collected') {
      showToast('Undone — order not collected')
    } else if (isCollectAction(action)) {
      showToast(`Order #${num} collected`, 'success', { duration: 7000, action: { label: '↩ Undo', run: () => runAction('undo_collected', orderKey) } })
    } else if (action === 'ready') {
      // Status commits now but the customer email is DEFERRED 4s (defer_email on the request): an Undo
      // within 4s cancels the email AND reverts the status.
      scheduleReadyEmail(orderKey)
      // READY IS THE MOMENT THE BUZZER IS PRESSED, so the number belongs here and not only on the card.
      // 🔴 NO BUZZER ⇒ THE ORIGINAL STRING, BYTE-IDENTICAL. A conditional suffix, never a placeholder:
      // "Buzzer —" or an empty pill would be noise on the majority of orders.
      // The pill is SOLID WHITE, not the undo button's bg-white/20: it echoes that button's shape
      // vocabulary (rounded, padded, font-black) but has to carry text at 17.85:1, because the toast
      // ground is bg-green-600 + white = 3.30:1 — below the 4.5:1 floor for its 14px bold text.
      // ⚠️ That 3.30:1 is a REAL pre-existing defect on EVERY success toast in the app. It is
      // deliberately NOT fixed here (darkening to green-700 would reach 5.02:1 but touches every toast)
      // — it is its own change.
      showToast(
        done?.buzzer_number != null
          ? <>Order #{num} ready · {buzzerPill(done.buzzer_number)}</>
          : `Order #${num} ready`,
        'success', { duration: 4000, action: { label: '↩ Undo', run: () => undoReady(orderKey, num) } })
    } else {
      showToast(`Order #${num} ${labels[action] || action}`)
    }
    // Auto-clear prep board on collected (solo operator workflow)
    if (isCollectAction(action) || action === 'ready') {
      if (done) onPrepStrike?.(orderKey, done)
    }
    await refetch()
  }, [
    showToast, findOrder, refreshPendingStatus, dropOverlayEntry, scheduleReadyEmail, undoReady,
    runAction, refetch, setActionLoading,
    refreshPendingPayment, onQueued, onQueuedUndone, onPrepStrike, onPrepUnstrike,
  ])
}
