// app/api/orders/submit/route.ts
// Receives order from the frontend, saves to Supabase,
// fires WhatsApp to truck and email confirmation to customer

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { DiscountCode } from '@/lib/order-calculations'
import { loadPriceBook, repriceOrder, toMinor, type RepriceItem } from '@/lib/order-repricing'
import {
  computeEventUnitRows,
  buildItemCatMap,
  normaliseOrderLines,
} from '@/lib/slot-bookings'
import { buildCatConfigs } from '@/lib/prep-utils'
import { validateModifierSelection, hasUnsatisfiableRequiredGroup, selectedCountForGroup } from '@/lib/modifier-rules'
import { findSoldOutOption, checkOptionCeilingShortfall } from '@/lib/option-stock'
import { getNowMinsInTz, getLocalDateInTz } from '@/lib/time-utils'
import { isPreorderDeadlinePassed, isPreorderOpenYet, type PreorderConfig } from '@/lib/preorder'
import { canAccess } from '@/lib/features'
import { formatConfirmationEmail, formatNewOrderEmail, sendConfirmationEmail } from '@/lib/email'
import { isDemoIdentifier } from '@/lib/demo'
import { enforceStockLimits } from '@/lib/stock-availability'
import { sendOrderPendingPush } from '@/lib/apns'
// The Android mirror. Same signature, same return shape — see lib/fcm.ts's header. Aliased rather than
// wrapped so the two transports stay visibly separate at the call site below.
import { sendOrderPendingPush as sendOrderPendingPushFcm } from '@/lib/fcm'
import { acquireEventLock, releaseEventLock, checkStockShortfall, checkClosedCategories } from '@/lib/stock-guard'
import { eventKitchenCapacity, placeOrderInSlotLocked } from '@/lib/orders/place-in-slot'
// ── PHASE 2b: the card fork. See the block just above the event lock in POST. ──────────────────────
import { newOrderKey, createOrderDraft, getOrderDraft, markAuthorizationCancelled } from '@/lib/payments/order-drafts'
import { authorizeDraft, cancelAuthorization, stripeAccountForTruck } from '@/lib/payments/authorize'
import { captureOnConfirmation } from '@/lib/payments/capture'

/** 🔴 THE ONE SENTENCE A CUSTOMER READS WHEN A CARD ORDER CANNOT BE SET UP.
 *  It has three jobs and does them in this order: say nothing was charged (they are about to check
 *  their banking app), say the order was NOT placed (so they do not turn up expecting food), and offer
 *  the way forward that always works. Their basket is untouched on this path. */
const CARD_UNAVAILABLE_MESSAGE =
  'We could not set up card payment just now, so your order has not been placed and you have not been ' +
  'charged. Your basket is saved — please try again, or choose Pay at the truck.'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  name: string
  quantity: number
  unit_price: number
  modifiers?: { name: string; price: number }[]
  specialInstructions?: string
}

interface AppliedDeal {
  name: string
  price?: number
  slots: Record<string, string>
  slotModifiers?: Record<string, { name: string; price: number }[]>
  slotNotes?: Record<string, string>
}

// ─── WhatsApp message formatter ───────────────────────────────────────────────
//
// ⚠️ NO CALL SITE. A repo-wide grep finds exactly one occurrence of `formatWhatsAppOrder` — this
// definition. Nothing invokes it, so nothing it computes reaches anybody, and the money it reads has
// never been printed anywhere. It is left in place rather than deleted because removing an unused
// exportable formatter is not part of this change.
//
// 🔴 IF IT IS EVER WIRED UP, IT MUST BE HANDED THE REPRICED ARRAY. `params.items[].unit_price`,
// `params.discountAmt` and `params.total` are read straight out of whatever the caller passes, and the
// obvious caller — the request body — is exactly the client pricing this route no longer trusts. Pass
// `pricedItems` / `serverDiscountAmt` / `serverTotal` (see the reprice block in POST), never `items` /
// `discountAmt` / `total` from the body.
function formatWhatsAppOrder(params: {
  orderId: string
  truckName: string
  customerName: string
  customerPhone: string
  customerEmail: string
  slot: string | null
  eventDate: string
  items: OrderItem[]
  deals: AppliedDeal[]
  discountCode: string | null
  discountAmt: number
  total: number
  notes: string | null
}): string {
  const divider = '─────────────────────────────'
  const lines: string[] = [
    `*NEW ORDER — #${params.orderId}*`,
    `${params.truckName}`,
    params.slot ? `Collection: ${params.slot}` : `Date: ${params.eventDate}`,
    '',
    `*${params.customerName}*`,
    `📞 ${params.customerPhone}`,
    `📧 ${params.customerEmail}`,
    '',
  ]

  params.items.forEach(item => {
    const lineTotal = (item.unit_price * item.quantity).toFixed(2)
    lines.push(`  ${item.quantity}× ${item.name.padEnd(20)} £${lineTotal}`)
  })

  if (params.deals.length > 0) {
    lines.push('')
    params.deals.forEach(deal => {
      lines.push(`  🎁 ${deal.name}`)
      Object.entries(deal.slots).forEach(([, item]) => {
        if (item) lines.push(`     ${item}`)
      })
    })
  }

  lines.push(divider)

  if (params.discountCode && params.discountAmt > 0) {
    lines.push(`  Code ${params.discountCode}`.padEnd(28) + `-£${params.discountAmt.toFixed(2)}`)
  }

  lines.push(`  *TOTAL${' '.repeat(22)}£${params.total.toFixed(2)}*`)

  if (params.notes) {
    lines.push('')
    lines.push(`📝 ${params.notes}`)
  }

  lines.push('')
  lines.push(`Reply:`)
  lines.push(`  CONFIRM ${params.orderId}`)
  lines.push(`  REJECT ${params.orderId}`)
  lines.push(`  MODIFY ${params.orderId} SLOT`)
  lines.push(`  MODIFY ${params.orderId} ITEM [item] SUB [sub]`)
  lines.push(`  MODIFY ${params.orderId} ITEM [item] REMOVE`)

  return lines.join('\n')
}

// ─── Email confirmation formatter ─────────────────────────────────────────────
//
// ⚠️ `timeToMins`, `eventKitchenCapacity` and `placeOrderInSlotLocked` USED TO BE DECLARED HERE.
// They moved VERBATIM to lib/orders/place-in-slot.ts on 13 August 2026 and are imported above. The
// reason is not tidiness: the card path now creates its order from an authorised draft
// (lib/payments/promote-draft), and that order has to be PLACED by the same rules a pay-at-hatch
// order is. One engine, two callers — never two copies of a capacity decision.
// 🔴 THE BODIES DID NOT CHANGE. This path calls the same function it used to declare.


function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Main POST handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      truckId,
      customerName,
      customerEmail,
      customerPhone,
      slot,
      eventDate,
      eventId,
      items,
      deals,
      discountCode,
      discountAmt,
      subtotal,
      total,
      notes,
      upsellEvents,
      // ── 🔴 THE ONLY CONFIRMATION VALUE THE SERVER CANNOT COMPUTE ────────────────────────────────
      // The "Around HH:MM" estimate the customer was SHOWN before pressing Place order. It is derived
      // in the BROWSER from the slots fetch (`backwardAsap || asapSlot || customerAsapTime`) and there
      // is no server equivalent — so the URL-reachable confirmation could never show it unless the
      // client sent it. `requested_slot` and the slot-moved comparison are both computed here and
      // simply were not persisted; this one genuinely had to arrive.
      // ⚠️ DISPLAY ONLY, AND IT MUST STAY SO. A client-produced number, the same class as the offline
      // outbox's `client_ts` ("display only — NEVER used for reconciliation"). It decides nothing:
      // not the slot, not capacity, not money. It is written to a column and read back onto one line
      // of a confirmation screen. Do not let it into any branch that matters.
      asapEstimate,
      // ── 🔴 PHASE 2b. THE ONE NEW REQUEST FIELD, AND IT IS AN INTENT, NEVER A CLAIM. ──────────────
      // `true` means "the customer chose to pay by card", nothing more. It does not assert that the
      // truck can take one — readiness is re-read server-side in lib/payments/authorize — and it moves
      // no money by itself. Absent (every existing client, and the whole pay-at-hatch flow) => the
      // order is created directly below, byte-identically to today.
      payByCard,
      // ── 🔴 THE KEY OF AN AUTHORISATION THIS ONE REPLACES. See the supersede block in the card fork.
      // Present only when the browser is already holding a live intent whose basket has since changed.
      supersedeOrderKey,
    } = body

    // ── Validate ──────────────────────────────────────────────────────────────
    if (!truckId || !customerName || !customerEmail || (!items?.length && !deals?.length)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ── Fetch truck (by slug or id) ───────────────────────────────────────────
    let truckQuery = await supabase
      .from('trucks')
      .select('*')
      .eq('slug', truckId)
      .eq('active', true)
      .single()

    if (truckQuery.error || !truckQuery.data) {
      truckQuery = await supabase
        .from('trucks')
        .select('*')
        .eq('id', truckId)
        .eq('active', true)
        .single()
    }

    const truck = truckQuery.data
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    // ── 🔴 ACCOUNT PENDING DELETION — ORDERING STOPS IMMEDIATELY ──────────────────────────────────
    // Read off the truck row already fetched above, so this costs NO extra query on the hottest path in
    // the product. `trucks.deletion_requested_at` is a derived enforcement cache of the authoritative
    // `operators.deletion_requested_at` — see 20260807_account_deletion_pending_state.sql.
    //
    // ⚠️ DELIBERATELY NOT `trucks.active`. Setting active=false would ALSO redirect the KDS to /login and
    // drop the truck from /dashboard, which breaks the requirement that the dashboard stays READABLE for
    // the whole 30 days. Ordering and readability are different questions and need different switches.
    //
    // 423 (Locked), matching the pause guard's own code — this is "temporarily not accepting orders", not
    // "no such truck". A 404 would be a lie the operator could not explain to a customer on the phone.
    if (truck.deletion_requested_at) {
      return NextResponse.json(
        { error: 'This business is no longer accepting online orders.', code: 'account_closing' },
        { status: 423 },
      )
    }

    // Demo trucks are exempt from the hidden-truck gate below and never send email — see both comments.
    const isDemoTruck = isDemoIdentifier(truck.id)

    // HIDDEN-TRUCK GATE. Discovery gating (show_on_vf/show_on_hg/excluded) only governs the MAP — the
    // customer menu and events APIs resolve any truck by slug/id with no visibility filter, and this route
    // previously checked `active` alone. So anyone who knew or guessed the slug could place a REAL order on
    // a truck that is hidden everywhere else: a demo truck, or an operator still in pre-trial setup mode.
    // `excluded` is the master hide — if it's set, the truck is not open for business. Checked here rather
    // than in the queries above so one condition covers both the slug and the id lookup. Deliberately the
    // SAME 404 as an unknown truck: a hidden truck should not confirm its own existence.
    //
    // DEMO EXEMPTION: a demo truck is excluded=true by construction, but ordering on it IS the demo — the
    // prospect opens their own QR/order link and watches the order land on the dashboard. Safe because the
    // gate exists to stop a STRANGER guessing a slug: a demo slug is 130 bits of random (not a guessable
    // name), the truck is absent from both discovery feeds, and every order dies with the truck at cleanup.
    // Scoped to the `demo-` prefix ONLY — a real hidden/pre-trial truck is gated exactly as before.
    if (truck.excluded === true && !isDemoTruck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    // Use the actual truck UUID for all subsequent queries
    const resolvedTruckId = truck.id

    // (Pause is EVENT-scoped — the per-event guard below reads truck_events.paused_until /
    // online_paused_until. The old truck-level guard here was removed: nothing writes
    // trucks.paused_until anymore, and a stale pre-migration value would have falsely 423'd
    // every event truck-wide.)

    // Pause guard — van level. Resolve the order's event by its eventId (event-scoped, like the
    // customer menu) so the van pause is enforced for the ACTUAL event. The old date +
    // .maybeSingle() lookup returned null on multi-event-same-date days (>1 row) and silently
    // SKIPPED the entire van guard → manual/offline van pause not enforced → orders slipped
    // through. Fall back to the date lookup only when no eventId was sent.
    let pauseEvent: { van_id: string | null; status: string | null; paused_until: string | null; online_paused_until: string | null } | null = null
    if (eventId) {
      const { data } = await supabase
        .from('truck_events')
        .select('van_id, status, paused_until, online_paused_until')
        .eq('id', eventId)
        .eq('truck_id', resolvedTruckId)
        .maybeSingle()
      pauseEvent = data
    } else {
      const pauseCheckDate = eventDate ?? new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('truck_events')
        .select('van_id, status, paused_until, online_paused_until')
        .eq('truck_id', resolvedTruckId)
        .eq('event_date', pauseCheckDate)
        .neq('status', 'cancelled')
        .maybeSingle()
      pauseEvent = data
    }

    // Event status guard — block orders for unconfirmed events
    if (pauseEvent?.status && !['confirmed', 'open'].includes(pauseEvent.status)) {
      return NextResponse.json(
        { error: 'This event is not available for ordering', event_status: pauseEvent.status },
        { status: 403 }
      )
    }

    // EVENT-scoped pause: read THIS event's own pause fields (truck/van pause no longer consulted).
    if (pauseEvent) {
      {
        const offlinePaused = pauseEvent.online_paused_until
          ? new Date(pauseEvent.online_paused_until) > new Date()
          : false
        const manualPaused = pauseEvent.paused_until
          ? new Date(pauseEvent.paused_until) > new Date()
          : false

        if (offlinePaused || manualPaused) {
          return NextResponse.json(
            {
              error: 'Orders are currently paused',
              paused: true,
              reason: offlinePaused ? 'offline' : 'manual',
            },
            { status: 423 }
          )
        }
      }
    }

    const orderLines = normaliseOrderLines(items, deals)
    const [itemCatMap, catConfigs] = await Promise.all([
      buildItemCatMap(supabase, resolvedTruckId),
      buildCatConfigs(supabase, resolvedTruckId),
    ])

    // NOTE: the old "slot full → 409" hard-block is removed for the customer path.
    // A full slot now never rejects — capacity is resolved at booking time by
    // placeOrderInSlotLocked (reassign to the first available later slot, else pending).
    // Non-capacity validation (payload/total/event) stays below, unchanged. The ONE 409
    // the customer path can return now is the atomic stock guard (out of stock), below.

    // ── Server-side total validation ──────────────────────────────────────────
    const { data: menuItems } = await supabase
      .from('menu_items_db')
      .select('name, price, auto_accept, preorder_enabled')
      .eq('truck_id', resolvedTruckId)

    // Per-item auto-accept rollup (reuses the read above — no extra fetch). An item flagged
    // auto_accept=false forces the WHOLE order into manual review even when the truck auto-accepts.
    // Keyed by name (same join basis as buildItemCatMap); an unknown/renamed name defaults to
    // allow (true) — never fail an order over a name miss (documented name-join limitation).
    const autoAcceptByName: Record<string, boolean> = {}
    ;(menuItems || []).forEach(m => { autoAcceptByName[m.name] = m.auto_accept !== false })

    // PRE-ORDER (Stage 4): per-item pre-order config, keyed by name (same basis as autoAcceptByName).
    // A past-deadline 'force_pending' item behaves like auto_accept=false for the rollup below — it
    // forces the WHOLE order pending. Evaluated event-tz at the rollup (where eventRow is resolved).
    // GLOBAL config (V7.8): `enabled` (inclusion) is per-ITEM; deadline type/value/action are the ONE
    // truck-level rule (trucks.preorder_*), constant across items. Helper untouched.
    const preorderByName: Record<string, PreorderConfig> = {}
    ;(menuItems || []).forEach((m: any) => {
      preorderByName[m.name] = {
        enabled: m.preorder_enabled, deadlineType: (truck as any).preorder_deadline_type,
        deadlineValue: (truck as any).preorder_deadline_value, pastAction: (truck as any).preorder_past_action,
      }
    })

    // (The `bundles_db` read lived here. Its only two consumers — `dealsForCalc` for the removed
    // validation, and `dealsWithPrice` for the confirmation email — are both gone, and loadPriceBook
    // reads the same table itself as the authority for bundle prices. Keeping it would have been a
    // second read of the same rows that decides nothing, and a place for a future edit to re-derive a
    // bundle price outside the engine. So the net cost of server pricing on this route is +3 queries,
    // not +4: the price book adds four, this removes one.)

    // (`dealsForCalc` lived here — it existed ONLY to feed the removed calculateOrderTotal call below.
    // The price book now resolves bundle prices itself, from the same bundles_db rows, so reconstructing
    // them here would be a second lookup that could drift from the one that decides the charge.)

    // Find discount code
    let discountCodeData = null
    if (discountCode) {
      const { data } = await supabase
        .from('discount_codes_db')
        .select('*')
        .eq('truck_id', resolvedTruckId)
        .eq('code', discountCode.toUpperCase())
        .eq('is_active', true)
        .single()
      discountCodeData = data
    }

    // ── 🔴 SERVER-AUTHORITATIVE PRICING. THE CLIENT'S MONEY FIELDS DECIDE NOTHING. ─────────────────
    // What arrives in `items` / `deals` says WHAT was selected — dish name, modifier names, quantity,
    // bundle name, slot fills. Every PRICE is resolved here, from this truck's live menu, via the SAME
    // engine the operator edit path uses (lib/order-repricing). There is no second implementation and
    // no arithmetic reimplemented at this call site: repriceOrder resolves, calculateOrderTotal combines.
    //
    // NO `stored` ARGUMENT — this order does not exist yet, so there is nothing to price-lock against
    // and every line resolves from the price book. (Price-lock is what protects an EXISTING order from
    // a later menu change; on a first placement the live menu IS the authority.)
    //
    // 🔴 THIS REPLACES A GUARD THAT COULD NEVER FIRE. What stood here compared the client's totals
    // against calculateOrderTotal(items, …) — but calculateOrderTotal reads `item.price` while this
    // route receives `item.unit_price`, so every line summed to NaN, every comparison was NaN > 0.01
    // (false), and validateOrderTotals returned valid for every order ever submitted. A guard that has
    // never rejected anything is worse than no guard: its presence ends the enquiry. It is gone, and
    // what replaces it does not compare the client's numbers at all — it discards them.
    //
    // ⚠️ THE CLIENT'S `subtotal` / `discountAmt` / `total` ARE NOW UNUSED ON THIS PATH. They are still
    // destructured (an older app build still sends them) and still ignored: nothing below reads them.
    //
    // ⚠️ `price_override` IS AN OPERATOR FIELD AND IS STRIPPED HERE. The walk-up panel may send one
    // (a hand-set line price — see app/api/dashboard/action/route.ts); a customer may not, and the
    // strip is what makes that structural rather than a rule someone has to remember. Stripped BEFORE
    // repricing because repriceOrder passes unknown keys through, so an unstripped one would land in
    // the stored row and read exactly like an operator's.
    const customerItems: RepriceItem[] = (items || []).map((it: RepriceItem) => {
      const copy = { ...it }
      delete copy.price_override
      delete copy.book_price
      return copy
    })
    // ── 🔴 THIS RUNS BEFORE THE STOCK GUARD, AND THAT IS ONLY SAFE FOR ONE REASON. ────────────────
    // The order of this route is: PRICE (here) → sold-out option backstop (:~830) → event lock →
    // checkClosedCategories → checkStockShortfall → checkOptionCeilingShortfall → INSERT. So an
    // unpriceable line refuses the order BEFORE anything has been asked about stock.
    //
    // 🔴 A SOLD-OUT ITEM MUST STILL PRICE, or the customer gets a "menu has changed" refusal in place
    // of "only 2 Margherita left" — during service, on a dish the truck deliberately ran down.
    // It does price, because loadPriceBook filters on truck_id and NOTHING else: not is_active, not
    // is_available, not available, not stock_count. Sold out is a STATE on a row that still exists, and
    // only a MISSING row (a deleted or renamed item) is unpriceable. See the header on loadPriceBook in
    // lib/order-repricing.ts, which carries the other half of this note.
    //
    // ⚠️ IF THAT EVER CHANGES, THIS ORDERING BECOMES A LIVE DEFECT. Either the price book must keep no
    // availability filter, or this block must move below checkStockShortfall. Do not change one end
    // without the other.
    const priceBook = await loadPriceBook(supabase, resolvedTruckId)
    const repriced = repriceOrder(
      customerItems,
      deals,
      priceBook,
      {},                               // no stored order — see above
      discountCodeData as DiscountCode | null,
    )

    // ── 🔴 AN UNPRICEABLE LINE FAILS THE ORDER. ────────────────────────────────────────────────────
    // `unresolved` means a dish, a modifier-on-that-dish, or a bundle whose name the live menu cannot
    // price. On the operator path that is a prompt (a human is standing there); here there is nobody to
    // ask, and the alternative — falling back to the advisory client figure — is precisely the client
    // pricing this change exists to remove. So it refuses.
    //
    // 🔴 NO NEW ERROR SURFACE. Deliberately the SAME `{ error, stock: true, items }` 409 the sold-out
    // guard below returns, because the order page's existing handler for it does exactly the right
    // thing: keeps the basket, re-fetches /api/menu, and lets the customer re-submit. A stale basket
    // against a changed menu is also, in practice, what causes this — the customer needs the menu they
    // are looking at refreshed, which is that branch's whole behaviour.
    // `items: []` — nothing is out of stock, so there is no per-item remaining to cap the basket to,
    // and capBasketToRemaining([]) is a no-op.
    //
    // 🔴 `menuChanged: true` IS THE DISCRIMINATOR, AND IT EXISTS BECAUSE THE TWO REFUSALS NEED THE SAME
    // HANDLING BUT DIFFERENT WORDS. The sold-out branch's notice reads "Sorry — {x} now. We've updated
    // your order — please review and confirm.", which is built to wrap a FRAGMENT ("only 2 Margherita
    // left") and which promises the basket was capped. Neither is true here: this message is a whole
    // sentence, and nothing on the basket was touched. Rather than reword a message the stock path
    // depends on, this flag lets the client render THIS one plainly. Do not drop it, and do not infer
    // the case from `items.length === 0` instead — checkStockShortfall never returns an empty array,
    // but that is its invariant to keep, not ours to lean on.
    //
    // ⚠️ THE COPY MUST NOT CLAIM ANYTHING WAS CHANGED ON THE CUSTOMER'S BEHALF. Nothing was: no line
    // removed, no quantity capped, no price rewritten. It states what happened and asks them to look.
    if (repriced.unresolved.length > 0) {
      const first = repriced.unresolved[0]
      console.error(
        `[submit] REFUSED — unpriceable on truck ${resolvedTruckId}: ` +
        repriced.unresolved.map(u => `${u.kind} "${u.name}"${u.on ? ` on "${u.on}"` : ''} (client said ${u.advisoryPrice})`).join('; '),
      )
      // A modifier is named with the dish it was on, because "Truffle Shavings" alone tells a customer
      // nothing about which line to look at.
      const label = first.kind === 'modifier' && first.on ? `${first.name} (on ${first.on})` : first.name
      return NextResponse.json(
        {
          error: `The menu has changed — ${label} is no longer available. Please check your order before placing it.`,
          stock: true,
          menuChanged: true,
          items: [],
        },
        { status: 409 },
      )
    }

    // The authoritative figures. PENCE FIRST, then pounds derived from the pence, so `total` and
    // `total_minor` are the same number by construction — the same ordering the edit path uses
    // (action/route.ts) and the reason a percentage code can't leave them 1p apart.
    const pricedItems = repriced.items
    const pricedDeals = repriced.deals
    const serverTotalMinor = toMinor(repriced.calculation.total)
    const serverTotal = serverTotalMinor / 100
    const serverSubtotal = repriced.calculation.subtotal
    const serverDiscountAmt = repriced.calculation.discountAmt

    // ── Resolve the event for this order ──────────────────────────────────────
    // Prefer the event_id the customer ordered against (unambiguous). Only fall back
    // to (truck_id, event_date) when no id was sent — and then take the earliest by
    // start_time via limit(1) so 2+ same-date events no longer collapse to null
    // (Section 5). van_id is selected so the order can be associated with the van.
    const orderEventDate = eventDate ?? new Date().toISOString().split('T')[0]

    // PRE-ORDER OPEN-WINDOW HARD GATE (V8.3): reject BEFORE booking if any line's pre-order-tagged item
    // hasn't OPENED yet (now < open). Server-enforced (not just menu-hidden) — the SAME isPreorderOpenYet
    // the menu API display uses, so display == enforcement (DRY linchpin). Date-based, event-tz (NEVER
    // device-local — BST lesson). Gated by plan + master toggle, like the deadline.
    {
      const poFeatureOn = canAccess(truck.plan, 'advance_preordering', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)
      const poActive = poFeatureOn && (truck as any).preorders_enabled !== false
      if (poActive) {
        const poNowDate = getLocalDateInTz((truck as any).timezone || 'Europe/London')
        const openYet = isPreorderOpenYet((truck as any).preorder_open_rule, orderEventDate, poNowDate)
        if (!openYet && orderLines.some(l => (menuItems || []).find((m: any) => m.name === l.name)?.preorder_enabled === true)) {
          return NextResponse.json({ error: 'Pre-orders for this event aren’t open yet — please check back when they open.', preorder_not_open: true }, { status: 403 })
        }
      }
    }
    // ⚠️ `offline_no_autoaccept_until` IS ADDED BY 20260818_offline_protection_mode.sql AND THIS IS A
    // NAMED SELECT — PostgREST answers 42703 for a column it cannot see and fails the whole statement,
    // which here means no event row and every order falling to the date fallback. MIGRATION FIRST.
    // 🔴 IT COSTS NOTHING: this select already runs, and one more column on it is not a round trip.
    const eventCols = 'id, start_time, end_time, venue_name, town, postcode, van_id, offline_no_autoaccept_until'
    let eventRow: {
      id: string; start_time: string | null; end_time: string | null
      venue_name: string | null; town: string | null; postcode: string | null; van_id: string | null
      offline_no_autoaccept_until?: string | null
    } | null = null
    if (eventId) {
      const { data } = await supabase
        .from('truck_events')
        .select(eventCols)
        .eq('id', eventId)
        .eq('truck_id', resolvedTruckId)
        .neq('status', 'cancelled')
        .maybeSingle()
      eventRow = data
    }
    if (!eventRow) {
      if (eventId) console.warn(`[submit] event_id ${eventId} not found for truck ${resolvedTruckId} — falling back to date`)
      const { data } = await supabase
        .from('truck_events')
        .select(eventCols)
        .eq('truck_id', resolvedTruckId)
        .eq('event_date', orderEventDate)
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (data && !eventId) {
        // No event_id was sent — date fallback in use. Warn if the date is ambiguous.
        const { count } = await supabase
          .from('truck_events')
          .select('id', { count: 'exact', head: true })
          .eq('truck_id', resolvedTruckId)
          .eq('event_date', orderEventDate)
          .neq('status', 'cancelled')
        if ((count ?? 0) > 1) console.warn(`[submit] no eventId sent and ${count} events on ${orderEventDate} for ${resolvedTruckId} — using earliest (${data.id})`)
      }
      eventRow = data
    }

    // ── Required-modifier completeness guard (A2, safety net) ──────────────────────────────
    // Belt-and-braces BEHIND the order modals: reject if a standalone line is missing a required
    // modifier-group selection (baskets persist across sessions; a group can become required after
    // an item was already added). Reuses lib/modifier-rules (validateModifierSelection) — no rule
    // logic reimplemented. FAIL-SAFE: any error resolving groups → log + PROCEED (the modal gate is
    // the primary enforcement; this guard must never reject a valid order due to its own failure).
    // Standalone `items` only — deal-slot constituents are out of A2 scope.
    try {
      const unmet: { item: string; soldOut?: boolean; group?: string; overMax?: number } | null = await (async () => {
        const { data: groupsRaw } = await supabase
          .from('modifier_groups')
          // hide_name is selected so the customer-facing ERROR can avoid the internal group name — see
          // the groupLabel helper below.
          .select('id, name, is_required, min_choices, max_choices, hide_name')
          .eq('truck_id', resolvedTruckId)
        // Groups we must validate: REQUIRED (min ≥ 1) and/or CAPPED ("choose up to N", max_choices < 99).
        // The 99 sentinel = "choose many" (unlimited) → nothing to enforce.
        const enforceIds = new Set((groupsRaw || [])
          .filter(g => g.is_required || (g.min_choices ?? 0) >= 1 || (g.max_choices ?? 99) < 99)
          .map(g => g.id))
        if (enforceIds.size === 0) return null // no required/capped groups → nothing to enforce

        // Stage B: resolve groups PER-ITEM via item_modifier_groups (menu_item_id → groups),
        // replacing the retired category_modifier_groups lookup. name→id keeps the same rename caveat
        // (a renamed dish can't be resolved → skipped, never a false reject). The link select is global
        // but filtered by enforceIds (truck-scoped) + this truck's item ids, so no cross-truck leak.
        const [{ data: itemLinks }, { data: optsRaw }, { data: itemRows }] = await Promise.all([
          supabase.from('item_modifier_groups').select('menu_item_id, group_id, excluded_option_ids'),
          supabase.from('modifier_options').select('id, group_id, name, price_adjustment, available, stock_count').in('group_id', Array.from(enforceIds)),
          supabase.from('menu_items_db').select('id, name').eq('truck_id', resolvedTruckId),
        ])
        const itemIdByName: Record<string, string> = {}
        ;(itemRows || []).forEach(i => { itemIdByName[i.name] = i.id })
        const groupsById = new Map((groupsRaw || []).map(g => [g.id, { ...g, options: (optsRaw || []).filter(o => o.group_id === g.id) }]))
        const groupsByItemId: Record<string, any[]> = {}
        ;(itemLinks || []).forEach(link => {
          if (!enforceIds.has(link.group_id)) return
          const g = groupsById.get(link.group_id); if (!g) return
          // Per-dish availability (model C): drop THIS dish's excluded options before any check, the
          // same filter the menu API's resolveGroup applies (drop option whose id ∈ excluded_option_ids).
          // A per-link copy avoids cross-contaminating other dishes that share the group. With this,
          // hasUnsatisfiableRequiredGroup (a required group with all options excluded for this dish →
          // options []), validateModifierSelection (min), and overMaxFor (max) all see the per-dish set.
          const excluded = new Set((link as { excluded_option_ids?: string[] }).excluded_option_ids || [])
          const scoped = excluded.size ? { ...g, options: (g.options as any[]).filter(o => !excluded.has(o.id)) } : g
          ;(groupsByItemId[link.menu_item_id] ||= []).push(scoped)
        })
        // Per-group MAX backstop ("choose up to N"): reject if a group has MORE than max_choices
        // selected. The client caps via toggleWithGroupRules, but a crafted client could over-submit.
        // Mirrors the required (min) guard; the 99 "many" sentinel is skipped.
        const overMaxFor = (groups: any[], selected: any[]): { group: string; max: number } | null => {
          for (const g of groups) {
            const max = g.max_choices ?? 99
            if (max < 99 && selectedCountForGroup(g, selected) > max) return { group: g.hide_name ? null : g.name, max }
          }
          return null
        }
        // 🔴 CUSTOMER-FACING LABEL. A group with hide_name (every variant-inferred one) carries an
        // INTERNAL name like "Mains - Protein 1" that the customer has never seen — the order page renders
        // those as "Choose an option" (trucks/[slug]/order/page.tsx:2283). Echoing the raw name into an
        // error would leak import machinery into a message a real customer reads.
        // This path used to be unreachable because inferred groups committed OPTIONAL; they are required
        // now, so it can fire. Returns null for a hidden group and the caller words it generically.
        type LabelledGroup = { id?: string; name?: string; hide_name?: boolean }
        const groupLabel = (g: LabelledGroup | undefined): string | null =>
          !g || g.hide_name ? null : (g.name ?? null)
        const findGroup = (gs: LabelledGroup[], id: string) => gs.find(g => g.id === id)

        for (const it of (items || [])) {
          const itemId = itemIdByName[it.name]
          if (!itemId) continue // unknown/renamed item → can't resolve → skip (never fail on a name miss)
          const groups = groupsByItemId[itemId] || []
          if (groups.length === 0) continue
          // §36 backstop: a required group with no selectable option → item is sold out (unorderable).
          if (hasUnsatisfiableRequiredGroup(groups)) return { item: it.name, soldOut: true }
          const selected = Array.isArray(it.modifiers) ? it.modifiers : []
          const { unmetGroupIds } = validateModifierSelection(groups, selected)
          if (unmetGroupIds.length > 0) return { item: it.name, group: groupLabel(findGroup(groups, unmetGroupIds[0])) ?? undefined }
          const over = overMaxFor(groups, selected)
          if (over) return { item: it.name, group: over.group ?? undefined, overMax: over.max }
        }
        // DEAL-SLOT items (§29 fix): a slot item with a required group must have it satisfied via
        // deal.slotModifiers[slotKey] — same resolution as standalone, validated per slot.
        for (const d of (deals || [])) {
          const slots = d?.slots || {}
          const slotMods = d?.slotModifiers || {}
          for (const slotKey of Object.keys(slots)) {
            const itemId = itemIdByName[slots[slotKey]]
            if (!itemId) continue // unknown/renamed slot item → skip (never fail on a name miss)
            const groups = groupsByItemId[itemId] || []
            if (groups.length === 0) continue
            if (hasUnsatisfiableRequiredGroup(groups)) return { item: slots[slotKey], soldOut: true }
            const selected = Array.isArray(slotMods[slotKey]) ? slotMods[slotKey] : []
            const { unmetGroupIds } = validateModifierSelection(groups, selected)
            if (unmetGroupIds.length > 0) return { item: slots[slotKey], group: groupLabel(findGroup(groups, unmetGroupIds[0])) ?? undefined }
            const over = overMaxFor(groups, selected)
            if (over) return { item: slots[slotKey], group: over.group ?? undefined, overMax: over.max }
          }
        }
        return null
      })()
      if (unmet) {
        return NextResponse.json(
          {
            error: unmet.soldOut
              ? `Sorry, ${unmet.item} is sold out.`
              : unmet.overMax != null
                ? `Please choose at most ${unmet.overMax} option${unmet.overMax !== 1 ? 's' : ''} for ${unmet.group ?? 'your choices'} (${unmet.item}).`
                : unmet.group
                  ? `Please choose ${unmet.group} for ${unmet.item}.`
                  // Hidden group → name the DISH, which the customer definitely recognises.
                  : `Please choose an option for ${unmet.item}.`,
            requiredModifier: true,
          },
          { status: 400 },
        )
      }
    } catch (err) {
      console.error('[submit] required-modifier guard error — proceeding (fail-safe):', err)
    }

    // ── Option sold-out backstop (D2) ──────────────────────────────────────────────────────
    // Catches a MANUALLY sold-out option (available=false) — which the atomic stock decrement below
    // does NOT (it only checks stock_count). The decrement remains the real oversell guard for the
    // shared count; this backstop covers manual sold-out + a stock-0 race. FAIL-OPEN (findSoldOutOption
    // returns null on its own error). Standalone-items + deal-slots, all selected options.
    {
      const soldOut = await findSoldOutOption(supabase, resolvedTruckId, items, deals, eventId)
      if (soldOut) {
        return NextResponse.json({ error: `Sorry, ${soldOut} just sold out.`, optionStock: true }, { status: 409 })
      }
    }

    // ── 🔴 THE CARD FORK. AUTHORISE FIRST; NO ORDER YET. ──────────────────────────────────────────
    // Everything above this line has run exactly as it always did: the truck, the pause and event-status
    // guards, server-side pricing, the pre-order gate, the required-modifier guard and the option
    // sold-out backstop. Everything BELOW it — the lock, the stock re-check, the slot claim, the INSERT,
    // the counter, the emails, the push — has not run and must not.
    //
    // 🔴 NOTHING IS RESERVED HERE. No lock is taken, no capacity is booked, no stock is counted, no
    // display number is consumed and no email is sent. A draft is a wish. The order is created only once
    // the money is authorised, by lib/payments/promote-draft, and by nothing else.
    //
    // ⚠️ THE FORK IS HERE AND NOT AT THE PRICING LINE, DELIBERATELY. Pricing finishes ~30 lines above,
    // but between there and here sit the pre-order open gate, the required-modifier completeness guard
    // and the option sold-out backstop — all of which REFUSE orders. Forking earlier would let a
    // customer authorise money for a basket that promotion would then have to refuse and refund. Every
    // refusal we can make before touching their card, we make before touching their card.
    //
    // ⚠️ OPT-IN, SO THE PAY-AT-HATCH PATH IS UNTOUCHED. `payByCard` is absent on every existing client
    // and on the whole pay-at-hatch flow, so this branch is not entered and execution continues into the
    // lock exactly as it does today. An older app build that never sends it keeps working unchanged.
    //
    // ⚠️ AND IT FALLS BACK RATHER THAN FAILING. If the truck cannot take a card right now — Stripe not
    // ready, the operator's kill switch on, a Stripe error — this does NOT refuse the order. It falls
    // through to the pay-at-hatch path below and the customer is told to pay at the truck, which is the
    // behaviour the page already has for a failed card start.
    if (payByCard === true) {
      // ── 🔴 ONE LIVE AUTHORISATION PER BASKET. CANCEL BEFORE CREATE, IN THIS REQUEST. ────────────
      // The browser sends the key of the intent it is already holding whenever the basket has moved
      // under it. That intent is for the OLD amount and must not survive: leaving it would put two
      // manual-capture holds against one basket, and the double-promotion guards are all per-DRAFT, so
      // if both were ever authorised BOTH would promote and the customer would get two orders.
      //
      // 🔴 CANCEL FIRST, AND REFUSE IF THE CANCEL FAILS. Creating the replacement first would open
      // exactly the window this exists to close. A failed cancel is a 503, not a "carry on" — the
      // customer sees the card-unavailable message, their basket is intact, and the sweep will release
      // the old hold at expiry. Refusing to authorise is always recoverable; two live holds are not.
      // ⚠️ Skipped silently when the draft is already promoted, already cancelled, or gone — all three
      // mean there is nothing live to supersede.
      if (typeof supersedeOrderKey === 'string' && supersedeOrderKey) {
        const prior = await getOrderDraft(supabase, supersedeOrderKey)
        if (prior && prior.payment_intent_id && !prior.promoted_at && !prior.authorization_cancelled_at) {
          const account = await stripeAccountForTruck(supabase, prior.truck_id)
          const cancelled = account
            ? await cancelAuthorization({ paymentIntentId: prior.payment_intent_id, stripeAccountId: account })
            : { ok: false, detail: 'no stripe account for the truck' }
          if (!cancelled.ok) {
            console.error(
              `[submit] 🔴 REFUSED to authorise: could not cancel the superseded intent ` +
              `pi=${prior.payment_intent_id} draft=${supersedeOrderKey} (${cancelled.detail}). NO second ` +
              `intent was created — two live holds for one basket is the one outcome this must never produce.`,
            )
            return NextResponse.json(
              { error: CARD_UNAVAILABLE_MESSAGE, cardUnavailable: true },
              { status: 503 },
            )
          }
          await markAuthorizationCancelled(supabase, supersedeOrderKey)
          console.log(
            `[submit] superseded draft=${supersedeOrderKey} pi=${prior.payment_intent_id} cancelled ` +
            `(${cancelled.detail ?? 'cancelled'}) — the basket changed; authorising the new one`,
          )
        }
      }

      const draftKey = newOrderKey()
      const created = await createOrderDraft(supabase, {
        orderKey:      draftKey,
        truckId:       resolvedTruckId,
        eventId:       eventRow?.id ?? null,
        vanId:         eventRow?.van_id ?? null,
        eventDate:     orderEventDate,
        requestedSlot: slot ?? null,
        orderType:     'collection',
        customerName:  customerName,
        customerEmail: customerEmail,
        customerPhone: customerPhone,
        // 🔴 THE SERVER-PRICED ARRAYS AND THE SERVER TOTALS. Never the request body's figures — server
        // pricing removed those, and the draft must carry the number that will be authorised.
        items:         pricedItems,
        deals:         deals ? pricedDeals : null,
        notes:         notes ?? null,
        discountCode:  discountCode ?? null,
        asapEstimate:  typeof asapEstimate === 'string' && asapEstimate.trim() ? asapEstimate.trim() : null,
        upsellEvents:  upsellEvents ?? null,
        subtotal:      serverSubtotal,
        discountAmt:   serverDiscountAmt,
        total:         serverTotal,
        totalMinor:    serverTotalMinor,
      })

      // ── 🔴 THERE IS NO FALL-THROUGH. A CARD ORDER THAT CANNOT BE AUTHORISED FAILS. ──────────────
      // This block used to `console.warn` and continue into the lock, placing an unpaid order with a
      // DIFFERENT order_key, sending a confirmation email and reserving stock — for a customer who had
      // not paid and had not been asked to. It fired on 12 August on every card order, because the
      // authorisation was broken in a way no truck configuration could have caused.
      // 🔴 THE FALL-BACK WAS THE DEFECT, NOT THE MITIGATION. "The order still gets placed" sounds kind
      // and is not: it reserves capacity nobody paid for, emails a confirmation for an order the
      // customer never completed, and hides a total failure of the payment path behind a success.
      // From here every failure below RETURNS. No order, no email, no lock, nothing reserved.
      if (!created.ok) {
        console.error(`[submit] draft not created for truck=${resolvedTruckId}: ${created.error}`)
        return NextResponse.json(
          { error: CARD_UNAVAILABLE_MESSAGE, cardUnavailable: true },
          { status: 503 },
        )
      }

      const auth = await authorizeDraft(supabase, {
        orderKey:    draftKey,
        truckId:     resolvedTruckId,
        amountMinor: serverTotalMinor,
      })

      if (!auth.ok) {
        console.error(
          `[submit] REFUSED card order for draft=${draftKey} truck=${resolvedTruckId} — ` +
          `${auth.reason}${auth.reason === 'error' ? `: ${auth.detail}` : ''}. NO order was created, no ` +
          `email sent and nothing reserved. The draft expires and is swept.`,
        )
        // ⚠️ 503, NOT 500. This is "the card system is unavailable right now", which is a temporary,
        // retryable condition and not a fault in the customer's order. The client shows the message and
        // KEEPS THE BASKET so they can switch to paying at the truck or try again.
        return NextResponse.json(
          { error: CARD_UNAVAILABLE_MESSAGE, cardUnavailable: true },
          { status: 503 },
        )
      }

      // 🔴 THE ONLY SUCCESSFUL EXIT ON THIS BRANCH, AND IT CREATES NO ORDER. The browser mounts a
      // Payment Element from `clientSecret`; Stripe authorises; the webhook promotes the draft.
      // ⚠️ `stripeAccount` is required by the client: a direct charge lives on the connected account, so
      // Stripe.js must be initialised with it or the Element cannot find the intent.
      return NextResponse.json({
        requiresAuthorization: true,
        orderKey:      draftKey,
        clientSecret:  auth.clientSecret,
        stripeAccount: auth.stripeAccount,
        total:         serverTotal,
      })
    }

    // ── Atomic stock guard + slot placement under ONE per-event lock (Stage 2, Option B) ──
    // The booking_locks mutex is HOISTED here (it used to live inside claimAvailableSlot) so the
    // stock re-check, the order INSERT, and the slot claim all run under a SINGLE lock — two
    // concurrent submits can't both read the same "N remaining" and both insert (oversell). The
    // stock check is BEFORE the insert → a shortfall returns 409 with NO half-written order (no
    // rollback). GUARANTEE: NO order is ever inserted without holding the lock AND passing the
    // stock check, so total sold can never exceed stock. On contention the caller WAITS within
    // acquireEventLock's retry budget (which absorbs the timing blip); only if the budget is
    // genuinely exhausted do we bail WITHOUT inserting and ask the client to retry — we never
    // fall back to a non-atomic insert.
    const lock = await acquireEventLock(resolvedTruckId, orderEventDate)
    const haveLock = lock.ok
    let order: { order_key: string } | null = null
    let orderId = ''
    const requestedSlot = slot ?? null
    let confirmedSlot: string | null = requestedSlot   // what the customer email shows (null = ASAP)
    let autoAccepted = false
    let slotChanged = false
    try {
      // Lock not acquired: either a real DB error or contention that outlasted the FULL 3s budget —
      // both genuine (the long budget absorbs normal 2-order contention, which now resolves silently
      // into the next-slot fit without ever reaching here). We must NOT place without the lock —
      // overselling would be possible. Bail non-destructively; the client re-submits (basket kept).
      if (!haveLock) {
        console.warn(`[submit] lock not acquired (${lock.ok ? '' : lock.reason}) for ${resolvedTruckId} / ${orderEventDate}`)
        return NextResponse.json(
          { error: 'We are handling a lot of orders right now — please try again', retry: true },
          { status: 409 },
        )
      }

      // (a) STOCK RE-CHECK — event-scoped, deal-inclusive (orderLines already flattens deal-slot
      //     constituents). Skipped when no resolved event. Customer HARD STOP: any requested qty over
      //     remaining → 409, NO row persisted (this is BEFORE the atomic RPC). Atomic: we hold the
      //     lock through [check → RPC], so a concurrent submit waits and then sees this order's insert.
      if (eventRow?.id) {
        // Category CLOSED gate (GATE model) — hard stop, checked first (more fundamental than a count
        // shortfall). Menu-hide alone is a bypass, so the closed category is enforced here at submit for
        // a stale client / crafted request. Honest rejection (not a faked remaining=0). No override on
        // the customer path — closed is closed.
        const closed = await checkClosedCategories(resolvedTruckId, eventRow.id, orderLines, itemCatMap)
        if (closed) {
          return NextResponse.json(
            { error: `${closed[0]} is closed for this event`, categoryClosed: true, categories: closed },
            { status: 409 },
          )
        }
        const shortfall = await checkStockShortfall(resolvedTruckId, eventRow.id, orderEventDate, orderLines, itemCatMap)
        if (shortfall) {
          return NextResponse.json(
            { error: 'Some items just sold out', stock: true, items: shortfall },
            { status: 409 },
          )
        }
        // Extras ceiling check (step 2) — SAME shared engine as items, no secondary axis. Pre-lock, like
        // the item check. Reuses the optionStock 409 response shape the client already handles.
        const optShort = await checkOptionCeilingShortfall(supabase, resolvedTruckId, eventRow.id, items, deals)
        if (optShort && optShort.length) {
          return NextResponse.json(
            { error: `Sorry, ${optShort[0].name} just sold out.`, optionStock: true, optionName: optShort[0].name },
            { status: 409 },
          )
        }
      }

      // (b) RESOLVE the slot (READ-ONLY; nothing is inserted yet, so NO self-exclude — the fit sees
      //     the true current occupancy WITHOUT this order, exactly as the old exclude-the-pre-insert
      //     workaround achieved). placeOrderInSlotLocked RESOLVES { booked, finalSlot } and files
      //     NOTHING — the atomic RPC does the single write. Never rejects: full → pending/unbooked.
      let finalSlot: string | null = requestedSlot
      let booked = false
      if (eventDate) {
        // Live kitchen_capacity (items) from the event's van — same source as the operator traffic
        // light, so customer placement and the dot agree on "full".
        const { kitchenCapacity, capacityWindowMins } = await eventKitchenCapacity(resolvedTruckId, eventDate, eventRow?.id ?? null)
        const claim = await placeOrderInSlotLocked(
          resolvedTruckId, eventDate, eventRow?.id ?? null, requestedSlot, orderLines, itemCatMap, catConfigs,
          eventRow?.start_time ?? null,
          eventRow?.end_time ?? null,
          truck.collection_interval_mins ?? 0,
          truck.slot_duration_mins ?? (truck.collection_interval_mins ?? 0),
          kitchenCapacity,
          capacityWindowMins,
          // NO excludeOrderKey: no order exists pre-resolve now (insert + book are atomic in the RPC).
        )
        if (claim.booked && claim.finalSlot) {
          booked = true
          // The SERVER-resolved boundary is authoritative (it knows if the requested slot was full and
          // bumped forward). It becomes order.slot (in the RPC) AND the production_slot_usage key, and
          // the customer-facing confirmedSlot — never null for a booked order.
          finalSlot = claim.finalSlot
          if (requestedSlot) {
            // Chosen slot: slotChanged drives the slotAdjustedFrom email box (Section 18 — reused).
            confirmedSlot = claim.finalSlot
            slotChanged = claim.finalSlot !== requestedSlot
          } else {
            // ASAP: confirmedSlot is the CUSTOMER-FACING value (on-screen, email, response). ASAP is
            // only a SELECTION shortcut — once placed, the order has a concrete allocated boundary and
            // the customer must SEE it. (slotChanged stays false: requestedSlot is null for ASAP, so
            // the "your slot was taken" amber path never fires.)
            confirmedSlot = claim.finalSlot
          }
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
          const preorderTz = (truck as any).timezone || 'Europe/London'
          const preorderFeatureOn = canAccess(
            truck.plan, 'advance_preordering', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null
          )
          let eventStartMins: number | null = null
          if (eventRow?.start_time) {
            const [sh, sm] = String(eventRow.start_time).split(':').map(Number)
            eventStartMins = (sh || 0) * 60 + (sm || 0)
          }
          // MASTER toggle (V7.8): truck-level preorders_enabled gates ALL pre-order effects. !== false
          // so null/pre-migration reads as ENABLED. Read-time gate only — per-item config persists.
          const preorderActive = preorderFeatureOn && eventStartMins != null
            && (truck as any).preorders_enabled !== false
          const preNowMins = getNowMinsInTz(preorderTz)
          const preNowDate = getLocalDateInTz(preorderTz)
          const anyForcesPending = preorderActive && orderLines.some(l => {
            const cfg = preorderByName[l.name]
            if (!cfg) return false
            const pre = isPreorderDeadlinePassed(cfg, orderEventDate, eventStartMins as number, preNowDate, preNowMins)
            return pre.isPreorder && pre.passed && pre.pastAction === 'force_pending'
          })
          // SAFETY — notes need review: a customer note (order-level OR any line's specialInstructions) is
          // where allergy requests land, so a truck with notes_require_review ON holds a NOTED order `pending`
          // for a human to read + accept instead of auto-confirming it unread. Same pending state an
          // auto_accept=false item already produces (NO new status; customer messaging unchanged). `!== false`
          // (not a bare truthy read) so a pre-migration/undefined column still REVIEWS — safe-by-default.
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
          // is still placed, the slot is still claimed and held by placeOrderInSlotLocked above, and the
          // customer still sees "Order received! — {truck} will confirm your order shortly". NOTHING in
          // the lifecycle is new; the only change is that this one boolean goes false.
          // 🔴 THE SUBMIT PATH DOES NOT COMPUTE STALENESS ITSELF, DELIBERATELY. The 30-second threshold
          // lives once, in the edge function that owns it (STALE_THRESHOLD_SECONDS), and this reads the
          // decision rather than re-deriving it — see Stage 1 Q2 of docs/offline-protection-modes-build.md.
          // ⚠️ AN EXPIRY, NOT A FLAG: a monitor that stops running cannot strand a truck here, because
          // the marker it wrote (now + 2h) simply lapses.
          // ⚠️ ABSENT / NULL / PAST MEANS NO EFFECT, so a pre-migration deploy and mode A are both identical
          // to today.
          const noAutoAcceptUntil = eventRow?.offline_no_autoaccept_until ?? null
          const vanOfflineNoAutoAccept = !!noAutoAcceptUntil && new Date(noAutoAcceptUntil).getTime() > Date.now()
          if (
            truck.auto_accept && allItemsAutoAccept && !anyForcesPending
            && !((truck as any).notes_require_review !== false && orderHasNotes)
            && !vanOfflineNoAutoAccept
          ) {
            autoAccepted = true
          }
        }
        // !claim.booked -> event full / lock contended -> finalSlot stays requestedSlot (or ASAP/null),
        // unbooked (p_unit_rows null below). Never rejected, never overfilled.
      }

      // (c) STATUS — pending unless auto-accepted above (only reachable when booked).
      const status = autoAccepted ? 'confirmed' : 'pending'

      // (d) UNIT ROWS — the production_slot_usage rows for THIS event AS IF this order were committed,
      //     computed by the EXISTING helpers (computeEventUnitRows → buildUnitsFromOrders), byte-
      //     identical to the old insert→rebuild. ONLY when booked + has event. Unbooked / no-event →
      //     NULL (NOT []) so the RPC's step-4 guard SKIPS the usage write → order persists unbooked,
      //     exactly like the old full-but-pending path.
      const unitRows = (booked && eventRow?.id)
        // Priced arrays, so the capacity board is computed from EXACTLY the lines about to be inserted.
        // Capacity reads names and quantities only — no money — so this is not a behaviour change; it
        // means there is one items array after the reprice point rather than two that could diverge.
        ? await computeEventUnitRows(supabase, resolvedTruckId, eventRow.id, { slot: finalSlot, items: pricedItems, deals: deals ? pricedDeals : null })
        : null

      // (e) ATOMIC PLACEMENT — display number + order INSERT + usage book in ONE transaction
      //     (place_order_atomic). Any failure RAISES → the WHOLE txn rolls back: no ghost order, no
      //     counter gap. (Option oversell is now the pre-lock CEILING check above — checkOptionCeiling-
      //     Shortfall — not an in-RPC pool draw.) p_order carries ONLY the plain order columns
      //     (id/slot/status/event_id/event_date/order_key are RPC params or DB defaults). Totals are
      //     numbers (RPC casts ::numeric); items/deals are jsonb; van_id is uuid-string-or-empty.
      //
      // 🔴 EVERY MONEY FIELD HERE IS SERVER-DERIVED. `items` and `deals` are the REPRICED arrays, so
      // orders.items[].unit_price and orders.items[].modifiers[].price are the price book's figures,
      // not the browser's; the three totals come from calculateOrderTotal via repriceOrder. Nothing on
      // this object is read from the request body except names, quantities, notes and contact details.
      // The RPC derives total_minor as round(total * 100) — which is why `total` must be the pence-
      // derived figure and not the raw float (see the reprice block above).
      const p_order = {
        customer_name:  customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        order_type:     'collection',
        items:          pricedItems,
        // `deals ? … : null` and NOT `?? null` — an empty array must keep storing as [], exactly as
        // `deals ?? null` did, because [] ?? null is []. Only a null/absent deals array stores null.
        deals:          deals ? pricedDeals : null,
        discount_code:  discountCode ?? null,
        subtotal:       serverSubtotal,
        discount_amt:   serverDiscountAmt,
        total:          serverTotal,
        notes:          notes ?? null,
        van_id:         eventRow?.van_id ?? null,
        payment_status: 'unpaid',
      }
      const { data: rpcData, error: rpcErr } = await supabase.rpc('place_order_atomic', {
        p_order,
        p_final_slot: finalSlot,
        p_status:     status,
        p_event_id:   eventRow?.id ?? null,
        p_truck_id:   resolvedTruckId,
        p_event_date: orderEventDate,
        p_unit_rows:  unitRows,
      })
      if (rpcErr || !rpcData) {
        // Rolled back — NOTHING persisted (no order, no usage, option stock restored, counter not
        // advanced). Mirrors the old "Failed to save order" 500; the client retries on a clean slate.
        console.error('place_order_atomic failed (rolled back, nothing persisted):', rpcErr)
        return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
      }
      orderId = String((rpcData as any).order_number)
      order = { order_key: (rpcData as any).order_key }
    } finally {
      if (haveLock) await releaseEventLock(resolvedTruckId, orderEventDate)
    }

    // Defensive narrowing: the only path to here is a successful RPC (every failure returned above),
    // so `order` is set — this guard satisfies the type and never fires in practice.
    if (!order) {
      return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
    }

    // ── 🔴 CAPTURE SITE 1 of 4: AUTO-ACCEPT ON THE PAY-AT-HATCH PATH, AND ONLY THAT PATH. ─────────
    // 🔴 THIS COMMENT USED TO CLAIM MORE THAN THE CODE DOES, AND THAT COST AN ORDER ITS CAPTURE.
    // It read: "Auto-accept writes 'confirmed' in the SAME INSERT as the order, inside
    // place_order_atomic, so there is no separate confirmation write to hook." That is true of a
    // pay-at-hatch order and FALSE of a card one. A CARD ORDER NEVER REACHES THIS LINE: its fork
    // returns at :820 with a client secret, 248 lines above here, and its order is created later by
    // lib/payments/promote-draft — which decides auto-accept itself and writes 'confirmed' itself.
    // So this site captures pay-at-hatch auto-accepts. The CARD auto-accept is capture site 4, in
    // promote-draft's step 8a, and the two are separate because the code paths are separate.
    // ⚠️ IF YOU ADD A THIRD WAY TO CREATE AN ORDER, IT NEEDS ITS OWN CAPTURE CALL. There is no shared
    // choke point below the fork; `grep -rn "captureOnConfirmation(" app lib` is the whole list.
    // 🔴 GATED ON `autoAccepted`, WHICH IS THE CONFIRMATION. An order that auto-accept declined is
    // `pending` and stays UNCAPTURED, exactly like any other pending order — it captures when a human
    // confirms it, at site 2 or 3.
    // ⚠️ A NO-OP FOR EVERY ORDER THAT REACHES IT, in practice: an order on this path has no
    // authorisation, so it costs one indexed read of order_drafts and out, with no Stripe call. The
    // call stays because "this path never has a draft" is a property of today's fork, not a guarantee.
    // ⚠️ AWAITED, and it cannot throw — captureOnConfirmation returns failures as values. The order is
    // already committed and booked by this line; nothing below can undo it.
    if (autoAccepted) {
      await captureOnConfirmation(supabase, {
        orderKey: order.order_key, truckId: resolvedTruckId, trigger: 'auto_accept',
      })
    }

    // ── placed_at — SET INSIDE place_order_atomic'S INSERT (phase 2) ────────────────────────────────
    // Phase 1 wrote it here, as a best-effort UPDATE right after the RPC returned, because the RPC's
    // INSERT column list is fixed SQL and phase 1 excluded touching it. That block is gone:
    // 20260804_place_order_atomic_placed_at.sql folds `placed_at => now()` into the insert, so the
    // customer path is one statement again and there is no window in which the row exists without it.
    // 🔴 STILL SERVER-MINTED, unchanged and on purpose. placed_at exists because an OFFLINE OPERATOR
    // order is inserted long after it was sold and only the taking device knows when. A customer order
    // is placed online, synchronously, inside that transaction — request time IS commit time — so
    // reading our own clock beats trusting a customer's phone. Do not start sending it from the client
    // on this path.

    // ── THE CONFIRMATION'S TWO STORED FIELDS — WRITTEN HERE, NOT IN THE RPC ─────────────────────────
    // `requested_slot` and `asap_estimate` exist so the confirmation screen can be reached by URL: a
    // card customer returning from Stripe has no component state, so every value it renders has to
    // survive a page load. See supabase/migrations/20260811_orders_confirmation_slot_fields.sql.
    //
    // 🔴 WHY AN UPDATE AFTER THE RPC AND NOT A CHANGE TO place_order_atomic — A DELIBERATE TRADE.
    // The RPC's INSERT column list is fixed SQL. Adding two columns to it means reproducing a ~90-line
    // money-path function to carry two DISPLAY strings, and a transcription error there does not break a
    // confirmation screen — it breaks every customer order. The risk is inverted against the reward.
    // ⚠️ THE PRECEDENT IS DIRECTLY ABOVE: `placed_at` was written exactly this way in phase 1 and folded
    // into the insert later, once the value had earned it. Same shape, same reasoning, same option to
    // fold these in later if they ever stop being display-only.
    // 🔴 THE COST, STATED: this is NOT atomic with the insert. There is a window in which the order
    // exists without these two fields.
    // AND THE COST IS ACCEPTABLE BECAUSE OF WHAT THEY ARE. A failure leaves both null, which is
    // EXACTLY what every row placed before today reads, and the confirmation already renders correctly
    // for null — it takes the plain "Collection time: HH:MM" branch. No money, no slot, no capacity
    // depends on either. So this is logged and NEVER thrown: the order is committed and the customer
    // must not see a failure for a cosmetic write.
    // ⚠️ `requested_slot` is null for an ASAP order by construction (`slot` arrives null), which is
    // correct — nothing was requested. `asap_estimate` is null for every chosen-slot order.
    {
      const confirmationFields = {
        requested_slot: requestedSlot,
        asap_estimate: typeof asapEstimate === 'string' && asapEstimate.trim() ? asapEstimate.trim() : null,
      }
      const { error: confErr } = await supabase
        .from('orders')
        .update(confirmationFields)
        .eq('order_key', order.order_key)
      if (confErr) {
        console.error(
          `[submit] confirmation fields not written for order_key=${order.order_key} — the order is SAVED ` +
          `and unaffected; the confirmation will show its plain slot line:`, confErr.message,
        )
      }
    }

    // ── Record upsell events ──────────────────────────────────────────────────
    if (upsellEvents?.length) {
      const eventRows = upsellEvents.map((e: any) => ({
        truck_id:         resolvedTruckId,
        // order_key (UUID) for stable identity. NOTE: upsell_events is not yet
        // provisioned in prod — this insert is fire-and-forget and currently no-ops.
        order_id:         order.order_key,
        event_date:       orderEventDate,
        rule_id:          e.rule_id || null,
        trigger_category: e.trigger_category,
        suggest_category: e.suggest_category,
        items_shown:      e.items_shown || [],
        items_added:      e.items_added || {},
        accepted:         !!e.accepted,
        total_value:      e.total_value || 0,
      }))
      supabase.from('upsell_events').insert(eventRows).then(({ error }) => {
        if (error) console.error('[submit] upsell_events insert failed:', error.message)
      })
    }

    // ── Enforce stock limits (update sold-out flags) — per-event (Phase 4) ────
    // Scoped to eventRow.id, the SAME event_id the guard used above, so an exhausted event marks
    // only itself. No-ops if the order had no resolvable event_id.
    try {
      if (eventRow?.id) await enforceStockLimits(supabase, resolvedTruckId, eventRow.id, itemCatMap)
    } catch (err) {
      console.error('[submit] stock limit enforcement failed:', err)
      // Never block the order — stock enforcement is best-effort
    }

    // ── Email to truck ────────────────────────────────────────────────────────
    // Gated by the operator's "Email me new orders" toggle (trucks.truck_order_email_enabled, default
    // true). `!== false` so a null/legacy value keeps it ON. ONLY this truck-facing notification is
    // gated — the customer confirmation below is untouched. Best-effort; never affects placement.
    try {
      const truckEmail = truck.contact_email
      // DEMO: never send. See the customer-email guard below for the full reasoning.
      if (truckEmail && !isDemoTruck && (truck as any).truck_order_email_enabled !== false) {
        const { subject, html, text } = formatNewOrderEmail({
          orderId,
          customerName,
          customerPhone,
          slot,
          // The SERVER-priced arrays and the SERVER total — the same figures just written to the row,
          // so the operator's "new order" email can never quote a price the order does not hold.
          items: pricedItems,
          deals: pricedDeals,
          total: serverTotal,
          notes: notes ?? null,
          venueName:     eventRow?.venue_name ?? null,
          venueTown:     eventRow?.town ?? null,
          venuePostcode: eventRow?.postcode ?? null,
          autoAccepted,
        })
        await sendConfirmationEmail({ to: truckEmail, subject, html, text, senderName: 'HatchGrab' })
      }
    } catch (err) {
      console.error('Truck email failed:', err)
    }

    // ── Email to customer ─────────────────────────────────────────────────────
    // BEST-EFFORT (post-save): the order is already SAVED (and booked) above, so the request MUST
    // succeed from the customer's view. Confirmation-email FORMATTING (dealsWithPrice +
    // formatConfirmationEmail) and SENDING must never 500 a saved order — a throw here would hit the
    // outer catch and tell the customer "Something went wrong" while the order sits on the dashboard
    // (duplicate-order / divergence hazard). Wrapped to mirror the operator-email block (above) and
    // the send below: log and continue to the success response. (Pre-save failures still 500 — only
    // POST-save steps are best-effort. Does NOT touch placement/booking/slot-usage/rollup.)
    // 🔴 DEMO: NEVER EMAIL. A demo's "customer" address is whatever the prospect typed into their own test
    // order — almost always fake or a throwaway. Sending produces hard bounces, which damage the shared
    // sender reputation for every REAL truck's confirmations, and Brevo Free is a 300/day shared cap that
    // stops sending SILENTLY once hit. The demo loses nothing: the order still saves, books a slot and
    // appears on the dashboard, which is the whole point of the loop. Guards the WHOLE block (not just the
    // send) so we don't build an email nobody receives.
    if (isDemoTruck) console.log(`[submit] demo truck ${truck.id} — customer + truck emails suppressed`)
    if (!isDemoTruck) try {
      // (`dealsWithPrice` lived here — it re-read bundles_db to give the EMAIL a server bundle price
      // while the stored row kept the client's. That split is gone: the row and the email now read the
      // same repriced array, so they cannot disagree.)
      const { subject, html, text } = formatConfirmationEmail({
        orderId,
        orderKey:     order.order_key,
        truckName:    truck.name,
        customerName,
        slot:         confirmedSlot,
        requestedSlot,
        slotChanged,
        items:        pricedItems,
        deals:        pricedDeals,
        discountAmt:  serverDiscountAmt,
        total:        serverTotal,
        notes:        notes ?? null,
        autoAccepted,
        venueName:              eventRow?.venue_name ?? null,
        venueTown:              eventRow?.town ?? null,
        venuePostcode:          eventRow?.postcode ?? null,
        preferredContactMethod: truck.preferred_contact_method ?? null,
        contactPhone:           truck.contact_phone ?? null,
        whatsappSender:         truck.whatsapp_sender ?? null,
        socialFacebook:         truck.social_facebook ?? null,
        socialInstagram:        truck.social_instagram ?? null,
        contactEmail:           truck.contact_email ?? null,
        allowCancellation:      truck.allow_customer_cancellation ?? true,
        cancellationCutoffMins: truck.cancellation_cutoff_mins ?? 30,
        baseUrl:                process.env.NEXT_PUBLIC_HATCHGRAB_URL,
        truckSlug:              truck.slug ?? undefined,
      })
      await sendConfirmationEmail({ to: customerEmail, subject, html, text, truckName: truck.name })
    } catch (emailErr) {
      // Non-fatal: the order is saved/booked — never fail the request over the confirmation email.
      console.error('Confirmation email failed (non-fatal, order saved):', emailErr)
    }

    // The truck's only operator-bound email per self-order is the 🔔 New order
    // notification sent above (formatNewOrderEmail) — never a copy of the customer
    // confirmation.

    // ── (Package 5) APNs "order needs confirming" push — SOLE order-notification source ─────────────
    // POST-save, fire-and-forget (mirrors the email blocks: MUST NOT block/hang or fail the saved order).
    // Fires ONLY when the order is pending (needs confirming) = !autoAccepted. Routes: order's event →
    // truck_events.van_id → van (van-level master pref) → van_devices (device opt-out + push_token). The
    // webview no longer fires a local notification (dupe removed at KDS), so this is the one alert per
    // pending order regardless of app foreground/background/closed. Null van / no enabled device / no
    // token / APNs-unconfigured → graceful no-op (order still saved + shown in-app). Invalid tokens
    // (BadDeviceToken/Unregistered) are cleared so we don't keep routing to dead devices.
    if (!autoAccepted) {
      try {
        const eid = eventRow?.id ?? null
        let vanId: string | null = null
        if (eid) {
          const { data: evVan } = await supabase.from('truck_events').select('van_id').eq('id', eid).single()
          vanId = (evVan?.van_id as string | null) ?? null
        }
        if (vanId) {
          // Van-level master toggle (default ON when no row).
          const { data: pref } = await supabase
            .from('van_notification_prefs').select('enabled').eq('van_id', vanId).eq('type', 'order_pending').maybeSingle()
          if (!pref || pref.enabled) {
            // ── ROUTED BY PLATFORM. THE APNs-ONLY ALLOWLIST IS GONE, AND ONLY BECAUSE A SENDER EXISTS ──
            // WHAT THE ALLOWLIST WAS FOR: sendOrderPendingPush POSTs to api.push.apple.com, which
            // understands Apple device tokens only. A non-Apple token (an FCM token from an Android
            // build) came back as BadDeviceToken → the invalidTokens cleanup below NULLed that row's
            // push_token, silently and permanently disabling push for that device. The allowlist existed
            // to stop that, and it was correct for exactly as long as there was nowhere else to send.
            // 🔴 IT COMES OFF IN THE SAME CHANGE THAT ADDS lib/fcm.ts AND NOT ONE COMMIT EARLIER. An
            // Android token selected by this query with no FCM sender behind it is the failure the
            // allowlist was written to prevent, reintroduced.
            // ⚠️ THE ALLOWLIST'S DEFAULT-DENY SURVIVES IT. Each platform is matched by NAME, never by
            // negation, so an unrecognised value routes NOWHERE instead of falling into whichever branch
            // happens to be the `else`. Capacitor's getPlatform() can also return 'web' (device.ts:69),
            // and a 'web' row must not be posted to APNs just because it is not 'android'.
            // ⚠️ platform NULL STILL ROUTES TO APNs, unchanged: legacy rows predate the column being
            // populated and are all iOS. That is the one implicit case, and it is the one the previous
            // filter also admitted by name.
            const { data: devices } = await supabase
              .from('van_devices').select('device_id, push_token, platform').eq('van_id', vanId).eq('notify_enabled', true).not('push_token', 'is', null)
            const allDevices = devices || []
            const iosTokens = allDevices.filter(d => d.platform === 'ios' || d.platform == null).map(d => d.push_token as string).filter(Boolean)
            const androidTokens = allDevices.filter(d => d.platform === 'android').map(d => d.push_token as string).filter(Boolean)
            const unroutable = allDevices.filter(d => d.platform != null && d.platform !== 'ios' && d.platform !== 'android')
            if (unroutable.length) {
              console.warn(`[push] ${unroutable.length} device(s) have a push_token but an unroutable platform (${[...new Set(unroutable.map(d => d.platform))].join(', ')}) — no sender exists, so nothing was sent and NO token was cleared.`)
            }
            // ── 🔴 ONE PLATFORM FAILING MUST NOT STOP THE OTHER ────────────────────────────────────────
            // Separate awaits in separate try/catch blocks, each collecting into the SAME invalidTokens
            // list. Neither sender throws by contract, but a contract is not an isolation boundary: an
            // import-time fault, an OOM in one transport or a future rewrite that does throw must not
            // cost the other platform its notification. A van running one iPad and one Android tablet
            // gets both alerts, or the one that worked, never neither.
            const invalidTokens: string[] = []
            if (iosTokens.length) {
              try {
                const res = await sendOrderPendingPush(iosTokens, { orderKey: order?.order_key ?? '', orderNumber: orderId, truckName: truck.name })
                invalidTokens.push(...res.invalidTokens)
              } catch (iosErr) { console.error('APNs push failed (non-fatal, Android unaffected):', iosErr) }
            }
            if (androidTokens.length) {
              try {
                const res = await sendOrderPendingPushFcm(androidTokens, { orderKey: order?.order_key ?? '', orderNumber: orderId, truckName: truck.name })
                invalidTokens.push(...res.invalidTokens)
              } catch (fcmErr) { console.error('FCM push failed (non-fatal, iOS unaffected):', fcmErr) }
            }
            // Unchanged in behaviour: one cleanup for both platforms, keyed on the token value itself, so
            // a dead Android token and a dead Apple token are cleared by the same statement. Skipped
            // entirely when both senders reported nothing dead — including the fcm.ts circuit-breaker
            // case, which deliberately reports zero rather than the whole fleet.
            if (invalidTokens.length) {
              await supabase.from('van_devices').update({ push_token: null }).in('push_token', invalidTokens)
            }
          }
        }
      } catch (pushErr) {
        console.error('Order-pending push failed (non-fatal, order saved):', pushErr)
      }
    }

    // ── Done ──────────────────────────────────────────────────────────────────
    return NextResponse.json({
      success:       true,
      orderId,
      // 🔴 THE ORDER KEY, RETURNED SO A CARD PAYMENT CAN REFERENCE THE ORDER THAT ALREADY EXISTS.
      // `orderId` is the human display number and is NOT unique across trucks; `order_key` is the uuid
      // every money path keys off — lib/payments/authorize puts it on the PaymentIntent, which carries it in
      // metadata, and the webhook finds the order by it. It is also the id /order/[id]/manage uses.
      orderKey:      order.order_key,
      truckName:     truck.name,
      slot:          confirmedSlot,
      requestedSlot,
      autoAccepted,
      slotChanged,
      // The SERVER total — what the row holds and what the customer will actually be charged. Echoing
      // the client's own figure back would have made a divergence invisible at exactly the moment it
      // mattered. (The in-memory confirmation renders from basket state, so this is not what the
      // customer sees on screen; the URL-reachable one reads the row. Both now agree with this.)
      total: serverTotal,
    })

  } catch (err: any) {
    console.error('Order submit error:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}