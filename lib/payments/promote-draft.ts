// lib/payments/promote-draft.ts
// 🔴 THE ONLY PLACE AN ORDER IS CREATED FROM A DRAFT. One function, two callers:
//   • app/api/webhooks/stripe        — the AUTHORITATIVE trigger. Fires whether or not the customer
//                                      ever comes back to the site.
//   • app/api/payments/return        — the OPTIMISATION. Fires while the customer is watching, so the
//                                      order exists by the time the confirmation renders.
// Whichever arrives first wins. The loser learns it lost and does nothing, without erroring.
//
// ── WHAT PROMOTION IS ───────────────────────────────────────────────────────────────────────────────
// A draft is a wish; an authorisation is a commitment. Promotion is the moment the commitment turns into
// an order, and it is the FIRST moment this system reserves anything: until it runs, no capacity is
// booked, no stock is counted, no display number is consumed and no email has been sent.
//
// ── 🔴 THE FOUR BINDING PHASES RUN AGAIN, INSIDE THE LOCK, AND THAT IS THE POINT ────────────────────
// They ran once before the draft was written, advisory, to avoid taking money for an order that was
// obviously impossible. That answer is stale by the time the customer has typed their card number:
// other people have been ordering. So closed-category, stock, option-ceiling and the slot fit all run
// AGAIN here, under the per-event lock, exactly as app/api/orders/submit runs them — because a check
// that is not held under the lock through to the insert is a check two concurrent orders can both pass.
//
// ── 🔴 AND IF THEY FAIL, SOMEONE HAS PAID FOR SOMETHING WE CANNOT SERVE ─────────────────────────────
// That is the case this whole design exists to handle honestly. No order is created, the authorisation
// is CANCELLED immediately (a hold released, never a charge refunded), the draft records why, and the
// customer — if one is present — is told plainly that no money was taken. See the caller in
// app/api/payments/return for the exact words they read.
//
// ── WHY NOT place_order_atomic ──────────────────────────────────────────────────────────────────────
// 🔴 IT CANNOT WRITE THE DRAFT'S order_key. Its INSERT column list is fixed SQL that does not include
// order_key, so the row takes the `gen_random_uuid()` column default — and the whole correlation chain
// (Stripe metadata → webhook → ledger) depends on the order carrying the key the draft minted. Changing
// that function is out of scope by instruction, and duplicating ~90 lines of money-path SQL into a
// near-identical second RPC is exactly the transcription risk its own migration header warns about.
// ⚠️ SO PROMOTION USES THE WALK-UP PATH'S SHAPE INSTEAD, which already supplies an order_key on INSERT
// and is shipped, load-bearing code: nextOrderId() under the lock → INSERT with the supplied key →
// rebuildProductionSlotUsage(). Both writes happen under the SAME event lock, so the oversell guarantee
// is unchanged: nothing is inserted without the lock and without passing the stock check.
// 🔴 THE COST, STATED: the order INSERT and the capacity write are two statements, not one transaction.
// A failure between them leaves a real order whose capacity row is stale — which is EXACTLY the walk-up
// path's existing behaviour, documented there as "reported, NOT rolled back", and self-heals on the next
// rebuild. Losing the order would be far worse than a stale board.
import type { SupabaseClient } from '@supabase/supabase-js'
import { claimOrderDraft, erasePii, markPromotionFailed, markAuthorizationCancelled, type OrderDraftRow } from '@/lib/payments/order-drafts'
import { cancelAuthorization, stripeAccountForTruck } from '@/lib/payments/authorize'
import { acquireEventLock, releaseEventLock, checkStockShortfall, checkClosedCategories } from '@/lib/stock-guard'
import { checkOptionCeilingShortfall, findSoldOutOption } from '@/lib/option-stock'
import { buildItemCatMap, normaliseOrderLines, rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { buildCatConfigs } from '@/lib/prep-utils'
import { eventKitchenCapacity, placeOrderInSlotLocked } from '@/lib/orders/place-in-slot'
import { nextOrderId } from '@/lib/order-utils'
import { enforceStockLimits } from '@/lib/stock-availability'
import { formatConfirmationEmail, formatNewOrderEmail, sendConfirmationEmail } from '@/lib/email'
import { isDemoIdentifier } from '@/lib/demo'
import { toMinor } from '@/lib/order-repricing'

export type PromoteResult =
  /** An order now exists for this draft — created by this call. */
  | { status: 'promoted'; orderKey: string; orderId: string; truckSlug: string | null; confirmedSlot: string | null }
  /** Someone else got there first, or there is no such draft. NOT an error. */
  | { status: 'already'; orderKey: string }
  /** The re-check refused. The authorisation has been cancelled; no order and no money. */
  | { status: 'refused'; orderKey: string; reason: string; customerMessage: string; cancelled: boolean }
  /** We could not complete promotion for a reason that is OURS, not the customer's. Retryable. */
  | { status: 'error'; orderKey: string; detail: string }

/**
 * 🔴 CANCEL THE HOLD, THEN RECORD IT. In that order, always.
 * Marking first and failing to cancel would leave money held with a row claiming it was released — and
 * the sweep, which looks for uncancelled authorisations, would never look at it again.
 */
async function releaseHold(
  supabase: SupabaseClient,
  draft: Pick<OrderDraftRow, 'order_key' | 'truck_id' | 'payment_intent_id'>,
): Promise<boolean> {
  if (!draft.payment_intent_id) return true   // nothing was ever authorised
  const account = await stripeAccountForTruck(supabase, draft.truck_id)
  if (!account) {
    console.error(
      `[promote] 🔴 CANNOT CANCEL pi=${draft.payment_intent_id} for draft=${draft.order_key} — no Stripe ` +
      `account for truck ${draft.truck_id}. A hold may remain on a customer's card. Reconcile by hand.`,
    )
    return false
  }
  const res = await cancelAuthorization({ paymentIntentId: draft.payment_intent_id, stripeAccountId: account })
  if (!res.ok) {
    console.error(
      `[promote] 🔴 CANCEL FAILED pi=${draft.payment_intent_id} draft=${draft.order_key}: ${res.detail}. ` +
      `The hold may still be on the customer's card — the sweep will retry.`,
    )
    return false
  }
  await markAuthorizationCancelled(supabase, draft.order_key)
  console.log(`[promote] hold released pi=${draft.payment_intent_id} draft=${draft.order_key} (${res.detail ?? 'cancelled'})`)
  return true
}

/**
 * Turn an authorised draft into an order.
 *
 * @param trigger which caller this is — logged, so "did the webhook or the redirect win" is answerable
 *                from the logs rather than by inference.
 */
export async function promoteDraft(
  supabase: SupabaseClient,
  orderKey: string,
  trigger: 'webhook' | 'redirect',
): Promise<PromoteResult> {
  // ── 1. CLAIM. The constraint that makes double-promotion impossible. ───────────────────────────
  // A conditional UPDATE guarded on `promoted_at is null`. Two concurrent claims serialise on the row
  // lock: the winner gets the row, the loser gets null and NO error. Nothing below this line runs twice
  // for one draft.
  // ⚠️ THE RETURNED ROW CARRIES THE CUSTOMER'S DETAILS, and it only does so because claimOrderDraft
  // reads before it claims — see the defect note there. The erasure happens at step 7b, after the order
  // exists, not here.
  const draft = await claimOrderDraft(supabase, orderKey)
  if (!draft) {
    console.log(`[promote:${trigger}] draft=${orderKey} not claimed — already promoted, or no such draft`)
    return { status: 'already', orderKey }
  }

  // ⚠️ FROM HERE THE DRAFT IS CLAIMED AND CANNOT BE CLAIMED AGAIN. Every exit below must either create
  // the order or release the hold — a claimed draft that does neither is money held against nothing.
  try {
    const { data: truck } = await supabase.from('trucks').select('*').eq('id', draft.truck_id).single()
    if (!truck) {
      await markPromotionFailed(supabase, orderKey, 'truck_missing')
      const cancelled = await releaseHold(supabase, draft)
      return { status: 'refused', orderKey, reason: 'truck_missing', cancelled,
               customerMessage: 'This truck is no longer taking orders. No money has been taken.' }
    }

    const eventDate = draft.event_date ?? new Date().toISOString().split('T')[0]
    const items = draft.items as unknown[]
    const deals = (draft.deals ?? null) as unknown[] | null
    const orderLines = normaliseOrderLines(items as never, deals as never)

    const [itemCatMap, catConfigs] = await Promise.all([
      buildItemCatMap(supabase, draft.truck_id),
      buildCatConfigs(supabase, draft.truck_id),
    ])

    // Per-item auto-accept + the event row, read exactly as app/api/orders/submit reads them.
    const { data: menuItems } = await supabase
      .from('menu_items_db')
      .select('name, auto_accept')
      .eq('truck_id', draft.truck_id)
    const autoAcceptByName: Record<string, boolean> = {}
    ;(menuItems || []).forEach(m => { autoAcceptByName[m.name] = m.auto_accept !== false })

    let eventRow: { id: string; start_time: string | null; end_time: string | null; venue_name: string | null
                    town: string | null; postcode: string | null; van_id: string | null } | null = null
    if (draft.event_id) {
      const { data } = await supabase
        .from('truck_events')
        .select('id, start_time, end_time, venue_name, town, postcode, van_id')
        .eq('id', draft.event_id)
        .eq('truck_id', draft.truck_id)
        .neq('status', 'cancelled')
        .maybeSingle()
      eventRow = data
    }

    // ── 2. THE OPTION SOLD-OUT BACKSTOP, pre-lock, as submit runs it. ──────────────────────────
    const soldOutOption = await findSoldOutOption(supabase, draft.truck_id, items as never, deals as never, draft.event_id)
    if (soldOutOption) {
      await markPromotionFailed(supabase, orderKey, `option_sold_out: ${soldOutOption}`)
      const cancelled = await releaseHold(supabase, draft)
      return { status: 'refused', orderKey, reason: `option_sold_out: ${soldOutOption}`, cancelled,
               customerMessage: `Sorry — ${soldOutOption} sold out while you were paying, so we could not place your order. No money has been taken.` }
    }

    // ── 3. THE LOCK. Everything binding happens inside it. ─────────────────────────────────────
    const lock = await acquireEventLock(draft.truck_id, eventDate)
    if (!lock.ok) {
      // 🔴 NOT A REFUSAL — OURS, AND RETRYABLE. Contention is not the customer's fault and their money is
      // still legitimately held. The draft is left CLAIMED, which means the other trigger will not retry
      // it either, so this returns `error` and the caller decides. The sweep is the final backstop: if
      // nothing ever promotes it, the hold is cancelled when it expires.
      console.warn(`[promote:${trigger}] lock not acquired for ${draft.truck_id}/${eventDate} — draft=${orderKey} left claimed`)
      return { status: 'error', orderKey, detail: 'lock contention' }
    }

    let orderId = ''
    let confirmedSlot: string | null = draft.requested_slot
    let slotChanged = false
    let autoAccepted = false

    try {
      if (eventRow?.id) {
        const closed = await checkClosedCategories(draft.truck_id, eventRow.id, orderLines, itemCatMap)
        if (closed) {
          await markPromotionFailed(supabase, orderKey, `category_closed: ${closed.join(', ')}`)
          const cancelled = await releaseHold(supabase, draft)
          return { status: 'refused', orderKey, reason: `category_closed: ${closed[0]}`, cancelled,
                   customerMessage: `Sorry — ${closed[0]} closed while you were paying, so we could not place your order. No money has been taken.` }
        }
        const shortfall = await checkStockShortfall(draft.truck_id, eventRow.id, eventDate, orderLines, itemCatMap)
        if (shortfall) {
          const names = shortfall.map(s => s.name).join(', ')
          await markPromotionFailed(supabase, orderKey, `stock: ${names}`)
          const cancelled = await releaseHold(supabase, draft)
          return { status: 'refused', orderKey, reason: `stock: ${names}`, cancelled,
                   customerMessage: `Sorry — ${shortfall[0].name} sold out while you were paying, so we could not place your order. No money has been taken.` }
        }
        const optShort = await checkOptionCeilingShortfall(supabase, draft.truck_id, eventRow.id, items as never, deals as never)
        if (optShort && optShort.length) {
          await markPromotionFailed(supabase, orderKey, `option_ceiling: ${optShort[0].name}`)
          const cancelled = await releaseHold(supabase, draft)
          return { status: 'refused', orderKey, reason: `option_ceiling: ${optShort[0].name}`, cancelled,
                   customerMessage: `Sorry — ${optShort[0].name} sold out while you were paying, so we could not place your order. No money has been taken.` }
        }
      }

      // ── 4. SLOT. The SAME engine the pay-at-hatch path uses (lib/orders/place-in-slot), so a card
      //      customer and a cash customer with the same basket are placed identically.
      //      ⚠️ A FULL EVENT IS NOT A REFUSAL. booked=false means pending+unbooked, exactly as it does on
      //      the pay-at-hatch path — the customer is never rejected for capacity, only for stock.
      let finalSlot: string | null = draft.requested_slot
      let booked = false
      if (draft.event_date) {
        const { kitchenCapacity, capacityWindowMins } = await eventKitchenCapacity(draft.truck_id, draft.event_date, eventRow?.id ?? null)
        const claim = await placeOrderInSlotLocked(
          draft.truck_id, draft.event_date, eventRow?.id ?? null, draft.requested_slot, orderLines,
          itemCatMap, catConfigs,
          eventRow?.start_time ?? null, eventRow?.end_time ?? null,
          truck.collection_interval_mins ?? 0,
          truck.slot_duration_mins ?? (truck.collection_interval_mins ?? 0),
          kitchenCapacity, capacityWindowMins,
        )
        if (claim.booked && claim.finalSlot) {
          booked = true
          finalSlot = claim.finalSlot
          confirmedSlot = claim.finalSlot
          slotChanged = !!draft.requested_slot && claim.finalSlot !== draft.requested_slot
          // ⚠️ AUTO-ACCEPT IS UNCHANGED, AND CAPTURE DOES NOT FOLLOW IT HERE. An order that stays pending
          // is pending and UNCAPTURED — capture follows confirmation, in a later phase. Nothing in this
          // file captures anything, whatever this flag says.
          const allItemsAutoAccept = orderLines.every(l => autoAcceptByName[l.name] !== false)
          const orderHasNotes =
            !!(draft.notes && draft.notes.trim()) ||
            (Array.isArray(items) && items.some(i => {
              const si = (i as { specialInstructions?: unknown })?.specialInstructions
              return typeof si === 'string' && si.trim().length > 0
            })) ||
            (Array.isArray(deals) && deals.some(d =>
              Object.values((d as { slotNotes?: Record<string, unknown> })?.slotNotes ?? {})
                .some(n => typeof n === 'string' && n.trim().length > 0)))
          const notesRequireReview = (truck as { notes_require_review?: boolean }).notes_require_review !== false
          if (truck.auto_accept && allItemsAutoAccept && !(notesRequireReview && orderHasNotes)) {
            autoAccepted = true
          }
        }
      }

      // ── 5. THE DISPLAY NUMBER, under the lock, from the same counter every other order uses. ────
      try {
        orderId = await nextOrderId(eventRow?.id ?? null, draft.truck_id)
      } catch (err) {
        console.error(`[promote:${trigger}] order counter failed for draft=${orderKey}:`, err instanceof Error ? err.message : err)
        return { status: 'error', orderKey, detail: 'order counter failed' }
      }

      // ── 6. THE INSERT, CARRYING THE DRAFT'S OWN order_key. ─────────────────────────────────────
      // 🔴 THIS IS WHY THE KEY WAS MINTED EARLY. Stripe already holds it in metadata; the ledger will key
      // its idempotency off the PaymentIntent; the confirmation URL already points at it. Supplying it
      // here is the same thing the offline walk-up path does every day.
      // ⚠️ payment_status stays 'unpaid'. NOTHING HAS BEEN CAPTURED. The money is held, not taken, and
      // the ledger — which is the only thing that may say otherwise — is untouched by this file.
      const { data: inserted, error: insertErr } = await supabase
        .from('orders')
        .insert({
          order_key:      draft.order_key,
          id:             orderId,
          truck_id:       draft.truck_id,
          customer_name:  draft.customer_name,
          customer_email: draft.customer_email,
          customer_phone: draft.customer_phone,
          order_type:     draft.order_type ?? 'collection',
          table_ref:      draft.table_ref,
          slot:           finalSlot,
          requested_slot: draft.requested_slot,
          asap_estimate:  draft.asap_estimate,
          event_date:     eventDate,
          event_id:       eventRow?.id ?? null,
          van_id:         eventRow?.van_id ?? draft.van_id ?? null,
          items:          draft.items,
          deals:          draft.deals,
          extras:         draft.extras,
          bundle:         draft.bundle,
          discount_code:  draft.discount_code,
          subtotal:       draft.subtotal,
          discount_amt:   draft.discount_amt,
          total:          draft.total,
          total_minor:    draft.total_minor ?? toMinor(draft.total),
          notes:          draft.notes,
          status:         autoAccepted ? 'confirmed' : 'pending',
          payment_status: 'unpaid',
          // ⚠️ SERVER-MINTED, matching the customer path's rule. This IS the moment of sale for a card
          // order: the request that creates it is the request that commits it.
          placed_at:      new Date().toISOString(),
        })
        .select('order_key')
        .single()

      if (insertErr || !inserted) {
        // 🔴 THE MONEY IS STILL HELD AND THERE IS NO ORDER. Refuse honestly and release it — leaving a
        // hold against nothing is the one outcome this design must never produce.
        console.error(`[promote:${trigger}] 🔴 INSERT FAILED for draft=${orderKey}:`, insertErr?.message)
        await markPromotionFailed(supabase, orderKey, `insert_failed: ${insertErr?.message ?? 'unknown'}`)
        const cancelled = await releaseHold(supabase, draft)
        return { status: 'refused', orderKey, reason: 'insert_failed', cancelled,
                 customerMessage: 'Sorry — we could not place your order. No money has been taken.' }
      }

      // ── 7a. 🔴 THE ORDER EXISTS. ERASE THE DRAFT'S COPY OF THE CUSTOMER'S DETAILS. ─────────────
      // Only now: the order holds them from this point, so the draft must not. Deliberately after the
      // insert rather than inside the claim — erasing earlier destroys the only copy a failed promotion
      // would need to reconstruct the order.
      await erasePii(supabase, draft.order_key)

      // ── 7b. CAPACITY. Rebuilt from the live orders, deterministic and idempotent — the SAME call the
      //      walk-up path makes after its insert. Under the same lock, so the count includes this order
      //      and nothing concurrent can interleave.
      //      ⚠️ REPORTED, NOT ROLLED BACK: the order is saved and correct. A stale board self-heals on
      //      the next rebuild; losing the order would not.
      if (eventRow?.id && booked) {
        try {
          await rebuildProductionSlotUsage(supabase, draft.truck_id, eventDate)
        } catch (err) {
          console.error(`[promote:${trigger}] capacity rebuild failed (ORDER WAS SAVED) for ${orderKey}:`, err)
        }
      }
    } finally {
      await releaseEventLock(draft.truck_id, eventDate)
    }

    // ── 8. EVERYTHING BELOW IS POST-SAVE AND BEST-EFFORT. The order exists; nothing here may undo it.
    try {
      if (eventRow?.id) await enforceStockLimits(supabase, draft.truck_id, eventRow.id, itemCatMap)
    } catch (err) {
      console.error(`[promote:${trigger}] stock limit enforcement failed:`, err)
    }

    const isDemoTruck = isDemoIdentifier(truck.id)

    // ── 9. THE CONFIRMATION EMAIL. It sends HERE and only here for a card order — which is the whole
    //      point: under order-first it went out before anyone had entered a card number, so an abandoned
    //      checkout left a customer holding a confirmation for an order nobody paid for.
    if (!isDemoTruck && draft.customer_email) {
      try {
        const { subject, html, text } = formatConfirmationEmail({
          orderId,
          orderKey:     draft.order_key,
          truckName:    truck.name,
          customerName: draft.customer_name ?? '',
          slot:         confirmedSlot,
          requestedSlot: draft.requested_slot,
          slotChanged,
          items:        draft.items as never,
          deals:        (draft.deals ?? []) as never,
          discountAmt:  draft.discount_amt ?? 0,
          total:        draft.total,
          notes:        draft.notes ?? null,
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
        await sendConfirmationEmail({ to: draft.customer_email, subject, html, text, truckName: truck.name })
      } catch (emailErr) {
        console.error(`[promote:${trigger}] confirmation email failed (non-fatal, order saved):`, emailErr)
      }
    }

    // The truck's own "new order" notification, gated by the same toggle the pay-at-hatch path uses.
    if (!isDemoTruck && truck.contact_email && (truck as { truck_order_email_enabled?: boolean }).truck_order_email_enabled !== false) {
      try {
        const { subject, html, text } = formatNewOrderEmail({
          orderId,
          customerName:  draft.customer_name ?? '',
          customerPhone: draft.customer_phone ?? null,
          slot:          confirmedSlot,
          items:         draft.items as never,
          deals:         (draft.deals ?? []) as never,
          total:         draft.total,
          notes:         draft.notes ?? null,
          venueName:     eventRow?.venue_name ?? null,
          venueTown:     eventRow?.town ?? null,
          venuePostcode: eventRow?.postcode ?? null,
          autoAccepted,
        })
        await sendConfirmationEmail({ to: truck.contact_email, subject, html, text, senderName: 'HatchGrab' })
      } catch (err) {
        console.error(`[promote:${trigger}] truck email failed (non-fatal, order saved):`, err)
      }
    }

    console.log(
      `[promote:${trigger}] PROMOTED draft=${orderKey} -> order #${orderId} truck=${draft.truck_id} ` +
      `slot=${confirmedSlot ?? 'ASAP'} status=${autoAccepted ? 'confirmed' : 'pending'} (UNCAPTURED)`,
    )
    return { status: 'promoted', orderKey, orderId, truckSlug: truck.slug ?? null, confirmedSlot }
  } catch (err) {
    // 🔴 THE DRAFT IS CLAIMED AND WE DO NOT KNOW WHETHER AN ORDER EXISTS. Do NOT cancel the hold here:
    // cancelling money for an order that may have been created is worse than a hold that the sweep will
    // resolve. Loud, named, and left for a human plus the sweep.
    console.error(
      `[promote:${trigger}] 🔴 UNEXPECTED FAILURE for draft=${orderKey} — the draft is CLAIMED and the ` +
      `authorisation is NOT cancelled. Check whether an order exists before touching the hold:`,
      err instanceof Error ? err.message : err,
    )
    return { status: 'error', orderKey, detail: err instanceof Error ? err.message : 'unknown' }
  }
}
