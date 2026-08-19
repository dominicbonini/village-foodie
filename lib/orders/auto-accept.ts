// lib/orders/auto-accept.ts
// 🔴 ONE AUTO-ACCEPT DECISION, FOR BOTH PATHS THAT CREATE AN ORDER.
//
// ── WHY THIS FILE EXISTS, AND IT IS NOT TIDINESS ──────────────────────────────────────────────────
// A pay-at-hatch order is created by app/api/orders/submit; a CARD order is created later, by
// lib/payments/promote-draft, because the submit request returns with a client secret before any order
// exists. Each computed this decision separately, and they drifted — the card path was two terms short:
// the offline marker and the pre-order force-pending rule. Both omissions meant a card customer's order
// auto-confirmed AND CAPTURED where the identical pay-at-hatch order would have waited for a human.
//
// 🔴 THE WARNING WAS ALREADY WRITTEN AND IT DID NOT PREVENT THE RECURRENCE. lib/payments/capture.ts
// carried "THERE ARE TWO AUTO-ACCEPTS, AND THAT COST ONE ORDER ITS CAPTURE", authored after the first
// time work reached one path and not the other — and the offline build then reached one path and not the
// other. A note asking two conditions to be kept in agreement by hand is not a mechanism. This is.
//
// ── ⚠️ WHAT THIS IS NOT ───────────────────────────────────────────────────────────────────────────
// It is NOT the card path's refusals. Sold-out, closed-category and option-ceiling all REFUSE a
// promotion outright and release the hold; they answer "may this order exist at all", not "should a
// human look at it first". They stay where they are, in promote-draft, untouched.
// It is NOT for the operator's manual insert, which writes 'confirmed' as a literal because an
// operator entering an order IS the confirmation — there is no decision to share. Nor for the demo
// seeder, which fabricates rows and evaluates no rule.
import { isPreorderDeadlinePassed, type PreorderConfig } from '@/lib/preorder'
import { canAccess } from '@/lib/features'
import { getNowMinsInTz, getLocalDateInTz } from '@/lib/time-utils'

export interface AutoAcceptTruck {
  auto_accept?: boolean | null
  plan?: string | null
  feature_overrides?: Record<string, unknown> | null
  trial_expires_at?: string | null
  preorders_enabled?: boolean | null
  timezone?: string | null
}

/**
 * Should this new order auto-confirm, or wait for a human?
 *
 * 🔴 EVERY INPUT IS EXPLICIT. Nothing is read from a request, a session or a client here, so the two
 * callers cannot supply it differently by accident — which is exactly how they drifted.
 * ⚠️ IT IS ONLY REACHED WHEN THE SLOT CLAIM BOOKED, on both paths, exactly as before. A full event
 * lands `pending` and unbooked without consulting this at all.
 */
export function decideAutoAccept(args: {
  truck: AutoAcceptTruck
  /** The normalised lines, from normaliseOrderLines on both paths. */
  orderLines: { name: string }[]
  /** name → item auto_accept, `false` only when the item explicitly opts out. */
  autoAcceptByName: Record<string, boolean>
  /** name → the item's pre-order config, built from menu_items_db.preorder_enabled + the truck's rule. */
  preorderByName: Record<string, PreorderConfig>
  /** The order's event date, 'YYYY-MM-DD'. */
  eventDate: string
  /** The event's start time as minutes-of-day, or null when the event has no start_time. */
  eventStartMins: number | null
  /** truck_events.offline_no_autoaccept_until, or null. An expiry, not a flag. */
  offlineNoAutoAcceptUntil: string | null
  /** Order-level notes. */
  notes: string | null | undefined
  /** The raw item array — read for `specialInstructions` only. */
  items: unknown
  /** The raw deals array — read for `slotNotes` only. */
  deals: unknown
}): boolean {
  const { truck, orderLines, autoAcceptByName, preorderByName, eventDate, eventStartMins, offlineNoAutoAcceptUntil, notes, items, deals } = args

  // Auto-confirm ONLY when the truck auto-accepts AND every basket item allows it. A single
  // item flagged auto_accept=false forces the whole order to stay `pending` (manual review) —
  // reusing the same state an auto-accept-off truck produces. autoAccepted stays false, so the
  // customer "Order received! … will confirm shortly" messaging + email tone apply unchanged.
  const allItemsAutoAccept = orderLines.every(l => autoAcceptByName[l.name] !== false)
  // PRE-ORDER force-pending (Stage 4): a line whose item is past a 'force_pending' pre-order
  // deadline forces the order pending — the SAME effect as auto_accept=false, via the SAME
  // helper Stage 3 uses for the menu sold-out (display ⟷ enforcement can't diverge). Event-tz
  // now (NEVER device-local); plan-gated server-side (a downgraded truck's config is inert).
  // tz defaults to 'Europe/London' (the documented current state until per-truck tz lands).
  const preorderTz = truck.timezone || 'Europe/London'
  const preorderFeatureOn = canAccess(
    truck.plan as never, 'advance_preordering', (truck.feature_overrides ?? {}) as never, truck.trial_expires_at ?? null
  )
  // MASTER toggle (V7.8): truck-level preorders_enabled gates ALL pre-order effects. !== false
  // so null/pre-migration reads as ENABLED. Read-time gate only — per-item config persists.
  const preorderActive = preorderFeatureOn && eventStartMins != null
    && truck.preorders_enabled !== false
  const preNowMins = getNowMinsInTz(preorderTz)
  const preNowDate = getLocalDateInTz(preorderTz)
  const anyForcesPending = preorderActive && orderLines.some(l => {
    const cfg = preorderByName[l.name]
    if (!cfg) return false
    const pre = isPreorderDeadlinePassed(cfg, eventDate, eventStartMins as number, preNowDate, preNowMins)
    return pre.isPreorder && pre.passed && pre.pastAction === 'force_pending'
  })
  // ── 🔴 SAFETY — A NOTED ORDER ALWAYS WAITS FOR A HUMAN. NO LONGER A SETTING. ─────────────────
  // A customer note (order-level OR any line's specialInstructions) is where allergy requests land. The
  // truck-level `notes_require_review` toggle that used to gate this is GONE from both surfaces and from
  // this condition: a note is something the customer took the trouble to write, the dashboard is in
  // front of the operator anyway, and an order that auto-confirms past an unread note is bad service.
  // ⚠️ NO TRUCK'S BEHAVIOUR CHANGED. All 16 stored `true`, verified against the live database before the
  // toggle was removed, so every truck was already reviewing noted orders.
  // ⚠️ THE COLUMN STILL EXISTS AND IS NOW UNREAD. Deliberately not dropped — leaving it costs nothing
  // and makes this reversible; retiring it is its own decision.
  // Same pending state an auto_accept=false item already produces (NO new status; customer messaging
  // unchanged).
  // Deal-slot free-text notes (deals[].slotNotes: Record<slot, note>) count too — a note on a deal
  // item is still an allergy request. slotModifiers (a CHOICE, not free text) does NOT count.
  // Defensive on any shape (null slotNotes / non-string values) — a throw here would fail the order.
  const orderHasNotes =
    !!(notes && notes.trim()) ||
    (Array.isArray(items) && items.some((i: any) => i?.specialInstructions?.trim())) ||
    (Array.isArray(deals) && deals.some((d: any) =>
      Object.values(d?.slotNotes ?? {}).some((n: any) => typeof n === 'string' && n.trim())))
  // ── 🔴 OFFLINE PROTECTION, MODE B: THE VAN IS OFFLINE, SO NOTHING AUTO-CONFIRMS ────────────
  // `offline_no_autoaccept_until` is written by heartbeat-monitor when the van has gone stale AND
  // the resolved mode is 'no_auto_accept', and cleared by /api/heartbeat on the van's next ping.
  // While it is in the FUTURE this behaves exactly like `truck.auto_accept === false`: the order
  // is still placed, the slot is still claimed and held, and the customer still sees "Order
  // received! — {truck} will confirm your order shortly". NOTHING in the lifecycle is new; the
  // only change is that this one boolean goes false.
  // 🔴 THE DECISION DOES NOT COMPUTE STALENESS ITSELF, DELIBERATELY. The 30-second threshold lives
  // once, in the edge function that owns it (STALE_THRESHOLD_SECONDS), and this reads the decision
  // rather than re-deriving it.
  // ⚠️ AN EXPIRY, NOT A FLAG: a monitor that stops running cannot strand a truck here, because
  // the marker it wrote (now + 2h) simply lapses.
  // ⚠️ ABSENT / NULL / PAST MEANS NO EFFECT, so a caller that cannot supply it, or a mode-A truck,
  // behaves exactly as it did before this term existed.
  const noAutoAcceptUntil = offlineNoAutoAcceptUntil ?? null
  const vanOfflineNoAutoAccept = !!noAutoAcceptUntil && new Date(noAutoAcceptUntil).getTime() > Date.now()
  return !!(
    truck.auto_accept && allItemsAutoAccept && !anyForcesPending
    && !orderHasNotes
    && !vanOfflineNoAutoAccept
  )
}
