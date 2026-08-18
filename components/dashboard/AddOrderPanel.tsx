'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type {
  TruckData, TruckMenu, MenuItem, Slot, Bundle, BasketItem, AppliedDeal,
  ItemStock, CategoryStock, ModifierGroup, ModifierOption, Order,
} from '@/components/dashboard/types'
import { getAsapSlot, calcReadyTime, getCatConfig } from '@/components/dashboard/helpers'
import { isSlotPast } from '@/lib/slot-utils'
import { calcQueueAwareReadySecs, calcQueuePushSecs } from '@/lib/prep-utils'
import { earliestBackwardFitSlot, projectBackwardOccupancy, fitOrderBackward, backwardWindowStepMins, contributingProductionSlots } from '@/lib/slot-availability'
import { normaliseOrderLines } from '@/lib/slot-bookings'
import { buildSlotIndicators, type SlotIndicator } from '@/lib/slot-display'
import { InlinePriceEditor } from '@/components/dashboard/OrderCard'
import { DealsModal } from '@/components/dashboard/DealsModal'
import { BuzzerGrid } from '@/components/dashboard/BuzzerGrid'
import { calculateOrderTotal } from '@/lib/order-calculations'
import { isModifierAvailable } from '@/lib/modifier-utils'
import { toggleWithGroupRules, validateModifierSelection, minRequiredForGroup, sortGroupsRequiredFirst, groupRuleLabel } from '@/lib/modifier-rules'
import { OrderLineItem } from '@/components/dashboard/OrderLineItem'
import { calcStockRemaining, calcAddableRemaining } from '@/lib/stock-utils'
import { isOrderNonEmpty, consumeBasketItemsForDeal, dealConsumedCartKeys, tallyBasketOptionQtys, buildOptionStockByName, optionDrawBlocked, optionRemaining } from '@/lib/basket-utils'
import { OptionStockBadge } from '@/components/OptionStockBadge'
import { formatTime, localTodayIso, pickDefaultEventByTime, getNowMinsInTz, getLocalDateInTz } from '@/lib/time-utils'
import { fmtVenue } from '@/lib/event-display'
import { useAndroidBack } from '@/lib/native/backHandler'
import { gatedAction, nextProvisionalId, seedProvisionalSeq } from '@/lib/native/orderGate'
import { ORANGE_SOLID, ORANGE_OUTLINE } from '@/lib/ui-tokens'
import { resolvePaidStep } from '@/lib/payments/paid-step'
import { isNativeApp } from '@/lib/native/device'
import { newUuid } from '@/lib/native/outbox'
import { isOnline } from '@/lib/native/reachability'

// ─── helpers ─────────────────────────────────────────────────────────────────

function getAsapBaseTime(event: { event_date: string; start_time: string } | null): Date {
  if (!event) return new Date()
  const now = new Date()
  const todayStr = localTodayIso() // LOCAL date (s.7) — UTC must not treat a future event as today
  const [startH, startM] = (event.start_time || '00:00').split(':').map(Number)
  if (event.event_date > todayStr) {
    const [y, mo, d] = event.event_date.split('-').map(Number)
    return new Date(y, mo - 1, d, startH, startM, 0, 0)
  }
  if (event.event_date === todayStr) {
    const eventStart = new Date()
    eventStart.setHours(startH, startM, 0, 0)
    return now < eventStart ? eventStart : now
  }
  return now
}

function makeCartKey(itemName: string, mods: { name: string }[], notes?: string): string {
  const parts: string[] = []
  const modStr = [...mods].map(m => m.name).sort().join('|')
  if (modStr) parts.push(modStr)
  const noteStr = (notes || '').trim()
  if (noteStr) parts.push(`note:${noteStr}`)
  return parts.length > 0 ? `${itemName}::${parts.join('::')}` : itemName
}

type EventRecord = {
  id: string
  event_date: string
  start_time: string
  end_time: string
  venue_name?: string | null
  town?: string | null
  status?: string
}

/** "Village Hall - Wickhambrook", but skip town if already in venue name */

// ─── props ────────────────────────────────────────────────────────────────────

interface AddOrderPanelProps {
  truck: TruckData
  truckMenu: TruckMenu | null
  menuGroups: Record<string, MenuItem[]>
  itemStocks: ItemStock[]
  categoryStocks: CategoryStock[]
  categoryConfigs: Record<string, { secs: number; batch: number }>
  categoryAllowNotes: Record<string, boolean>
  orders: Order[]
  waitMinutes: number
  token: string
  pin: string
  todayEvent: EventRecord | null
  categoryOrder: string[]
  itemCategoryMap: Record<string, string>
  // WIDENED to accept the third `opts` argument (duration/action), never narrowed. The only caller
  // (app/dashboard/[token]/page.tsx) already passes useToasts' own showToast, so this changes nothing at
  // the call site — it stops the local type from hiding options the real function has always had.
  // Needed by the PAYMENT NOT RECORDED toast below, which must outlive the 3.5s default.
  showToast: (msg: string, type?: 'success' | 'error', opts?: { duration?: number }) => void
  onOrderPlaced: (optimistic?: Order) => void
  onOpenEvent?: (eventId: string) => void
  requestEventPickerOpen?: boolean
  onEventPickerOpened?: () => void
  onEventChange?: (eventId: string) => void
  controlledEvent?: EventRecord | null
  /** EVENT-SWITCH GATE (Option A): offline, only events whose data was loaded this session are switchable.
   *  isOffline false / isEventLoaded absent → no gating (online = every event switchable as today). */
  isOffline?: boolean
  /** OFFLINE advisory capacity for the active event, from the dashboard's SW-cached /api/dashboard inputs +
   *  the shared offlineOccupancy fold. The panel derives its capacityInputs/slots from this when its own
   *  /api/slots fetch is unavailable (offline) → advisory traffic lights instead of bare times, draining live
   *  as offline orders queue. Scoped by eventId (only the active event is cached offline). */
  offlineCapacity?: {
    eventId: string
    slots: Slot[]
    productionSlotUnits: Record<string, Record<string, number>>
    kitchenCapacity: number | null
    capacityWindowMins: number
    eventStartMins: number
    catConfigs: Record<string, { secs: number; batch: number }>
  } | null
  isEventLoaded?: (eventId: string) => boolean
  /** Always-mounted tab pattern (manual s.22): panel stays mounted, data effects
   *  only run while the tab is visible. Basket state survives tab switches. */
  isActive?: boolean
  /** DEMO: lock the EVENT controls (Change / Start / Restart) — SHOW them, but clicking opens the parent's
   *  explainer instead of mutating. Order submit + stock stay fully live (the demo's central loop). */
  isDemo?: boolean
  onLockedEventAction?: () => void
  /** The VAN's buzzer rack size, resolved server-side (lib/buzzer.ts). Null ⇒ this van has no buzzers
   *  and every buzzer affordance in this panel is absent — the confirm bar is byte-identical to before. */
  buzzerCount?: number | null
  /** RESOLVED per-event prompt (event override ?? van-has-buzzers). Gates ONLY the after-order prompt;
   *  the during-entry button is gated on buzzerCount alone, because assigning by hand is always valid. */
  buzzerPromptEnabled?: boolean
  /** 🔴 THE DASHBOARD'S OWN `saveBuzzer`, PASSED DOWN — not a second mechanism.
   *  This path used a raw `fetch`, so offline the buzzer number was silently LOST: a pager already in a
   *  customer's hand, with no record anywhere and nothing to re-derive it from. Reusing saveBuzzer gets
   *  the whole treatment for free — gatedAction(kind:'buzzer'), the durable outbox, the optimistic
   *  pendingWritesRef guard, planOptimisticBuzzer's full local effect (this order gains the number, any
   *  other order holding it loses it), and the queued-only `replay`/`placedAt` that lets the server
   *  arbitrate a two-device conflict on placed_at instead of last-writer-wins.
   *  ⚠️ Optional so the demo dashboard and any future caller that has no buzzers render unchanged. When
   *  absent this path is simply not offered — it is never silently downgraded back to a raw fetch. */
  onSaveBuzzer?: (orderKey: string, buzzerNumber: number | null) => Promise<void>
}

// ─── SCROLL LAYOUT (trucks.add_order_layout === 'scroll', V11.15) ─────────────────────────────────
// One continuous item list with sticky category headings. Nothing here runs for a truck on 'tabs' —
// the component is not mounted at all, so the default path has no code from this block in it.
//
// ── 🔴 THE CHIP BAR AND THE WHOLE SCROLL-SPY WERE REMOVED, 14 August 2026 ───────────────────────────
// Scroll mode used to render the tabs bar's chips as a jump-list with a scroll-spy: tap to scroll,
// scroll to re-highlight. That is gone. In scroll mode there are NO category buttons — navigation is
// scrolling — and the STICKY HEADING is the whole positional signal.
// ⚠️ SO THE HEADING'S PIN IS NOT DECORATION, IT IS THE FEATURE. The bar was the pinned element that
// told an operator which category they were in; taking it away without a pinned heading would leave a
// long list with no answer to "where am I". Do not un-stick the heading without putting something else
// pinned in its place.
// ⚠️ EVERYTHING THE CHIPS NEEDED WENT WITH THEM, deliberately, rather than being left running against
// nothing: the tap-lock and its safety timer, the arrival / touchstart / wheel / scrollend releases,
// the rAF-throttled spy, the scroller resolution (nearestScrollParent), the reduced-motion check, the
// measured bar height, the section ref map and the active-category state. The scroll listener was the
// SPY'S OWN — it was attached by this component, called only the spy and the lock release, and was
// shared with nothing else on this panel — so removing it removes no other behaviour.
// The tabs layout keeps its own chip bar, untouched, in the main component below.

/**
 * Sticky-headed sections for the continuous-scroll layout.
 *
 * 🔴 `cats` IS THE ONE ARRAY — the caller passes the same already-filtered `menuCats` the tabs layout
 * uses, which drops empty categories (Gusto's `Specials` holds 0 items and has never had a tab). With
 * the chips gone there is no second consumer to drift from, but the rule stands: never derive a
 * category list here.
 *
 * ⚠️ BOTH PANES MOUNT THIS AT ONCE. The tablet split is `hidden md:flex` and the phone column is
 * `md:hidden`, so at any width one instance is inside a `display:none` subtree. That instance now has
 * no state, no refs, no effects and no listeners, so it costs a render and nothing else.
 */
function ScrollMenuSections({ cats, categoryStocks, renderCategory }: {
  cats: string[]
  categoryStocks: CategoryStock[]
  renderCategory: (cat: string) => React.ReactNode
}) {
  return (
    <div>
      {cats.map(cat => {
        const closed = categoryStocks.find(s => s.category === cat)?.available === false
        return (
          <section key={cat} className="mb-4">
            {/* 🔴 STICKY AT `top-0` — THE TOP OF THE SCROLLING PANE, which is now the whole pinned
                stack inside it. It used to pin at the measured chip-bar height; with the bar gone
                there is nothing above it in the scroller, so the offset is 0 and the measurement it
                needed is gone with it. The event banner and the deals button sit OUTSIDE this
                scroller (they are the pane's `shrink-0` header in scroll mode), so they cannot
                overlap it.
                Sticky is scoped to this <section>, so each heading releases as its own category ends
                and the next takes over — the standard nested-sticky behaviour, and the only thing
                telling the operator where they are now that the chips are gone.
                ⚠️ COLOUR, SIZE, WEIGHT AND TRACKING ARE UNCHANGED: text-xs, font-black, uppercase,
                tracking-wide, text-orange-600, `py-1.5`, the translucent backdrop. 🔴 THE `-mx-1 px-1`
                THIS LINE USED TO NAME IS GONE — see the block immediately above the element for why it
                was the horizontal-overflow defect, and note that the pair CANCELLED, so removing both
                left the text where it was.
                z-10 (was z-[9], which existed solely to slide UNDER the chip bar's z-10).
                ⚠️ `bg-slate-50/95`, NOT `bg-white/95` — IT MUST MATCH THE PANE, NOT CONTRAST WITH IT.
                The app shell is `bg-slate-50` (app/dashboard/[token]/page.tsx) and neither pane sets a
                background, so the scroller behind this band is slate-50. A white band drew as a bright
                stripe across a grey pane at every heading — reported on Tikka Tonic. The item tiles are
                ALSO `bg-slate-50`, so they read by their border rather than their fill; the heading has
                no border and would have been the only white thing on the pane.
                ⚠️ STILL 95% + backdrop-blur, NOT transparent: it is sticky, so items scroll UNDERNEATH
                it and it has to occlude them. Matching the pane is what makes that invisible. */}
            {/* ── 🔴 THE BLEED IS GONE — `-mx-1 px-1` REMOVED. THIS IS THE OVERFLOW. ─────────────────
                This heading is the ONLY element in the whole one-page branch that is WIDER THAN ITS
                CONTAINING BLOCK: `-mx-1` pushed it 4px past each edge of a parent chain with NO
                horizontal padding to absorb it (section -> ScrollMenuSections root -> the
                `overflow-y-auto pb-24` scroller, none of which sets `px-`). A box with overflow on
                one axis computes the OTHER to `auto`, so that scroller became scrollable
                HORIZONTALLY by exactly those 8px. 🔴 THE PREVIOUS PASS EXONERATED THIS ON THE BOX
                MODEL — "<main>'s px-4 absorbs it" — WHICH IS THE WRONG PARENT. What has to absorb a
                negative margin is the box that establishes the width, not an ancestor several
                levels up outside the scroller.
                🔴 AND THE CUSTOMER ORDER PAGE PROVES IT, BECAUSE IT DOES THE SAME THING AND WORKS:
                its sticky subcategory heading carries a BIGGER bleed (`-mx-2 px-2 sm:-mx-4 sm:px-4`)
                and its own comment says that tracks "the card's `px-2 sm:px-4` so the band spans the
                padding and no further". Matched. Ours was not. The negative margin was never the
                defect — an UNMATCHED one inside a scroll container is.
                ⚠️ NOTHING ELSE CHANGES. The text still starts at the same x — it was `-4px` margin
                plus `4px` padding, which cancelled — and the band still spans the FULL width of the
                items it occludes, because that width is the container it now ends at. It is 4px
                narrower on each side than it was, and that 4px was outside the panel.
                🔴 STICKY IS UNTOUCHED: `sticky top-0 z-10` stays, the headings still pin and still
                release per section. No `overflow-x-hidden` anywhere — the width is removed, not
                hidden. */}
            <div className="sticky top-0 z-10 py-1.5 bg-slate-50/95 backdrop-blur-sm flex items-center gap-2">
              {/* 🔴 orange-600 — THE SAME VALUE AS THE PRIMARY BUTTONS' FILL, AND IT IS A DELIBERATE,
                  SIGHTED DECISION BY THE OPERATOR. DO NOT "CORRECT" IT TO 700.
                  This shipped as orange-700 first, on the contrast reasoning in lib/ui-tokens.ts (orange
                  TEXT on white is 700 there, because 600 as text is the same 3.59:1 as white-on-600).
                  Measured on white, from the Tailwind v4 OKLCH palette this project uses unmodified:
                    orange-600  #f54900  3.59:1  — below the 4.5:1 WCAG AA floor for normal text
                    orange-700  #ca3500  5.23:1  — passes
                  At text-xs (12px) this is NORMAL text, not large (large = 18.66px bold / 24px), so the
                  3:1 large-text allowance does not apply, and the slate-500 this replaced was 4.77:1.
                  ⚠️ SO THIS IS A KNOWN AA SHORTFALL, ACCEPTED ON PURPOSE. 700 was rejected on sight —
                  it read as a different, muddier colour rather than as the brand orange.
                  ⚠️ THE CHIP IT WAS MATCHED TO NO LONGER EXISTS IN THIS LAYOUT (the chips were removed
                  14 August 2026), so the "matches the active chip" half of that reasoning is now only
                  historical — it still matches the primary buttons, which is why it stands. Worth
                  re-weighing against the AA numbers above if this is ever revisited.
                  ⚠️ IT DIVERGES FROM ORANGE_OUTLINE (lib/ui-tokens.ts), which uses text-orange-700 for
                  orange text on white. That token is NOT changed by this: it governs BUTTON labels. */}
              <p className="text-xs font-black uppercase tracking-wide text-orange-600">{cat.charAt(0).toUpperCase() + cat.slice(1)}</p>
              {closed && <span aria-hidden>🔒</span>}
            </div>
            {/* The per-category closed notice rides WITH its section here. In tabs there is one banner
                for the one visible category; in a continuous list a single banner could not say which
                category it meant. */}
            {closed && (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                <span aria-hidden>🔒</span>
                <span>{cat.charAt(0).toUpperCase() + cat.slice(1)} is closed for online orders this event — hidden from customers. You can still add for the hatch; you&apos;ll be asked to confirm.</span>
              </div>
            )}
            {renderCategory(cat)}
          </section>
        )
      })}
    </div>
  )
}

// ─── component ───────────────────────────────────────────────────────────────

export function AddOrderPanel({
  truck, truckMenu, menuGroups,
  itemStocks, categoryStocks, categoryConfigs, categoryAllowNotes,
  orders, waitMinutes, token, pin, todayEvent,
  categoryOrder, itemCategoryMap,
  showToast, onOrderPlaced, onOpenEvent,
  requestEventPickerOpen, onEventPickerOpened,
  onEventChange, controlledEvent,
  isOffline = false, offlineCapacity = null, isEventLoaded,
  isActive = true,
  isDemo = false, onLockedEventAction,
  buzzerCount = null, buzzerPromptEnabled = false, onSaveBuzzer,
}: AddOrderPanelProps) {

  // ── order state ─────────────────────────────────────────────────────────────
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualNotes, setManualNotes] = useState('')
  const [manualSlot, setManualSlot] = useState('')
  // Operator Add Order: which top-level category tab is selected (null ⇒ default to the first).
  const [activeMenuCat, setActiveMenuCat] = useState<string | null>(null)
  const [manualItems, setManualItems] = useState<BasketItem[]>([])
  const [appliedDeals, setAppliedDeals] = useState<AppliedDeal[]>([])
  const [loading, setLoading] = useState(false)

  // ── event / slot state ──────────────────────────────────────────────────────
  const [manualEvent, setManualEvent] = useState<EventRecord | null>(todayEvent)

  // Seed THIS EVENT'S offline provisional counter so offline numbers continue from that event's highest
  // known order (orders 1-3 → offline N4) instead of restarting at 1 or continuing another event's run.
  // Native only; still monotonic — seedProvisionalSeq only ever RAISES, within this event's key.
  // 🔴 FILTERED TO `manualEvent`, AND THAT FILTER IS LOAD-BEARING. The `orders` prop is the dashboard's
  // UNSCOPED list (page.tsx passes `orders`, not `eventOrders`), so seeding an event's key from all of
  // them would carry the highest number across every event straight back in — exactly the defect the
  // per-event key exists to remove. No event selected ⇒ nothing to seed from, so the no-event key is
  // left alone rather than seeded with a foreign maximum.
  // 🔴 DECLARED HERE, BELOW `manualEvent`, NOT WITH THE OTHER EFFECTS ABOVE. The dep array is evaluated
  // during render, so referencing `manualEvent` from its old position (above the useState) would be a
  // TDZ ReferenceError on every render, not a stale value.
  // id letter prefix is stripped ("N5"→5, "4"→4).
  useEffect(() => {
    if (!isNativeApp()) return
    if (!manualEvent?.id) return
    const highest = orders
      .filter(o => o.event_id === manualEvent.id)
      .reduce((m, o) => Math.max(m, parseInt(String(o.id).replace(/^\D+/, ''), 10) || 0), 0)
    void seedProvisionalSeq(manualEvent.id, highest)
  }, [orders, manualEvent])
  const [apiSlots, setApiSlots] = useState<Slot[]>([])   // raw /api/slots; `manualSlots` below derives the offline fallback
  // Event timezone from /api/slots (default London); ASAP + isSlotPast derive in this tz.
  const [eventTz, setEventTz] = useState('Europe/London')
  // Live 30s tick → re-render so manualAsapSlot + the dropdown's isSlotPast re-evaluate as the clock
  // advances even without a refetch (a just-passed slot drops out automatically). Value unused — the
  // re-render it triggers is the point.
  const [, setNowTick] = useState(0)
  const [apiQueueByCat, setApiQueueByCat] = useState<Record<string, number>>({})
  // Engine inputs from /api/slots so the dot/modal can recompute basket-inclusive
  // tones with the SAME buildSlotAvailability the server traffic-light uses.
  const [apiCapacityInputs, setApiCapacityInputs] = useState<{
    productionSlotUnits: Record<string, Record<string, number>>
    kitchenCapacity: number | null
    capacityWindowMins?: number
    eventStartMins: number
    eventEndMins: number | null
    earliestCollectionMins: number
    date: string
    nowMins: number
    windowSecs: number
  } | null>(null)
  // Server catConfigs from /api/slots — the SAME complete object the customer page feeds the
  // engine. It carries countsToCapacity (mapped from counts_toward_capacity at /api/slots:155);
  // the flag-less `categoryConfigs` prop does NOT, which is why instant items never counted on
  // the operator path. Typed {secs,batch} (countsToCapacity is optional on CatConfig and read at
  // runtime), identical to the customer page's serverCatConfigs.
  const [apiCatConfigs, setApiCatConfigs] = useState<Record<string, { secs: number; batch: number }>>({})
  // ── EFFECTIVE inputs: authoritative /api/slots when present, else the dashboard's cached ADVISORY
  //    offlineCapacity for THIS event (offline / pre-first-fetch). All consumers below read these derived
  //    consts unchanged, so the offline fallback flows everywhere AND drains live as offlineCapacity re-folds.
  const offlineForThisEvent = offlineCapacity && (!manualEvent || offlineCapacity.eventId === manualEvent.id) ? offlineCapacity : null
  const manualSlots: Slot[] = apiSlots.length ? apiSlots : (offlineForThisEvent?.slots ?? [])
  const capacityInputs = apiCapacityInputs ?? (offlineForThisEvent ? {
    productionSlotUnits: offlineForThisEvent.productionSlotUnits,
    kitchenCapacity: offlineForThisEvent.kitchenCapacity,
    capacityWindowMins: offlineForThisEvent.capacityWindowMins,
    eventStartMins: offlineForThisEvent.eventStartMins,
    eventEndMins: null, earliestCollectionMins: 0, date: '', nowMins: 0, windowSecs: 0,   // unused by the panel
  } : null)
  const serverCatConfigs = Object.keys(apiCatConfigs).length ? apiCatConfigs : (offlineForThisEvent?.catConfigs ?? {})
  const [showEventPicker, setShowEventPicker] = useState(false)
  const [upcomingEvents, setUpcomingEvents] = useState<EventRecord[]>([])
  // ── 🔴 liveEvent — THE FRESH VERSION OF WHICHEVER EVENT manualEvent NAMES (V9.6) ─────────────────
  // THE BUG THIS CLOSES: manualEvent is a PRIVATE COPY, seeded once by `useState(todayEvent)`. Its
  // re-sync effect is keyed on `controlledEvent?.id` AND early-returns when the id matches, so a change
  // to a field on the SAME event (a paid-step or cash override toggled in dashboard Settings) never
  // reached it. The panel is hidden via CSS and never unmounted — deliberately, so the basket survives
  // a tab switch — so only a full page refresh ever refreshed the copy.
  // Two fields had already been patched through that hole one at a time (`status` had its own effect);
  // this was the third. So: stop copying VALUES, and read them live.
  //
  // ⚠️ IDENTITY vs VALUES — the distinction the whole fix turns on:
  //   • manualEvent still decides WHICH event the order is for. Unchanged. It is how an operator takes a
  //     phone pre-order for Saturday while looking at Friday, and it is what keeps the basket alive.
  //   • liveEvent is the SAME event, with FRESH FIELDS. It never changes which event is selected.
  // 🔴 Resolving against controlledEvent alone would be WRONG: the payment is recorded against the event
  // the ORDER is for, so a settings lookup must follow manualEvent's identity, not the dashboard's.
  //
  // Precedence, freshest first:
  //   1. controlledEvent when it names the same event — the parent re-fetches it via fetchAll() on every
  //      poll and after every settings save, so it is the only genuinely live source here.
  //   2. this panel's own upcomingEvents entry — fetched when the event picker loaded. Fresher than the
  //      mount-time copy for an event the operator picked later.
  //   3. manualEvent itself — right identity, possibly stale fields. Never null-ier than before.
  // ⚠️ CASE 2/3 CAN STILL BE STALE, and there is no live source for them in this component:
  // `upcomingEvents` here is LOCAL STATE (fetched once when empty), not a prop. This does not affect the
  // reported bug — the operator toggling a setting is on the dashboard's active event, which is case 1 —
  // but if a non-active event's settings ever need to be live, the fix is to pass the PARENT's
  // upcomingEvents down as a prop rather than to add another sync effect.
  const liveEvent: EventRecord | null = !manualEvent
    ? (controlledEvent ?? null)
    : (controlledEvent?.id === manualEvent.id ? controlledEvent : null)
      ?? upcomingEvents.find(e => e.id === manualEvent.id)
      ?? manualEvent
  const [eventsLoading, setEventsLoading] = useState(false)
  // True once a fetch has SUCCEEDED at least once — so "No events" only shows
  // after a confirmed-empty load, never on cold start or a failed fetch (S5).
  const [eventsLoaded, setEventsLoaded] = useState(false)

  // ── item modifier modal ─────────────────────────────────────────────────────
  const [itemModal, setItemModal] = useState<{ item: MenuItem; modGroups: ModifierGroup[]; editCartKey?: string } | null>(null)
  const [modalMods, setModalMods] = useState<{ name: string; price: number; allergens?: string[]; dietary?: string[] }[]>([])
  const [modalNotes, setModalNotes] = useState('')

  // ── deal modal ──────────────────────────────────────────────────────────────
  const [showDealsModal, setShowDealsModal] = useState(false)
  const [activeDealBundle, setActiveDealBundle] = useState<Bundle | null>(null)

  // ── slot capacity confirmation ──────────────────────────────────────────────
  // Set only when the kitchen genuinely CAN'T produce the order by the chosen slot (per the
  // SAME engine the traffic-light/booking use). `reason` = a human sentence ("too soon to make
  // N Pizza by 18:05"). A slot the order fits selects silently — no nag.

  // ── BUZZERS (phase 1, online only) ──────────────────────────────────────────
  // manualBuzzer = the number chosen DURING entry (null = none). It rides into the insert payload, so
  // the number is on the row from the very first read rather than needing a second write.
  const [manualBuzzer, setManualBuzzer] = useState<number | null>(null)
  const [showBuzzerPicker, setShowBuzzerPicker] = useState(false)
  // The AFTER-ORDER PROMPT. Holds the just-placed order's identity while the blocking grid is up.
  // `resolve` is the promise handle submitManual awaits on — see the prompt block in submitManual.
  const [buzzerPrompt, setBuzzerPrompt] = useState<{ orderKey: string; orderId: string; resolve: () => void } | null>(null)
  const [savingPromptBuzzer, setSavingPromptBuzzer] = useState(false)

  // ── phone bottom sheet ──────────────────────────────────────────────────────
  const [showOrderSheet, setShowOrderSheet] = useState(false)
  // OVER-CAPACITY CONFIRMATION. Set at SUBMIT time (never at slot-select — that trigger was removed in
  // 448130f as operator friction and stays removed) when the fresh fit check fails. Holds everything the
  // modal renders; `override` carries the stock-override flag through the re-entry so accepting here
  // can't silently drop a stock decision the operator already made. Null ⇒ no modal.
  const [capacityConfirm, setCapacityConfirm] = useState<{
    slot: string
    /** 'filled' = the window got worse while they were building the order; 'over' = it already was, or
     *  this basket is what tips it; 'toosoon' = a LEAD failure, not a capacity one (see the copy). */
    variant: 'over' | 'filled' | 'toosoon'
    /** Start of the cooking window span this order occupies, "HH:MM". Null ⇒ no cooking load. */
    windowFrom: string | null
    /** The binding constraint, already resolved from fit.bound_by. */
    bind: { kind: 'ceiling'; limit: number; needed: number }
        | { kind: 'category'; cat: string; limit: number; needed: number }
        | { kind: 'lead' }
    unitWord: string
    /** Orders collecting at the slots that feed this window, with their OWN quantities.
     *  🔴 NOT an attribution of spilled units — see contributingProductionSlots. */
    contributors: Array<{ id: string; slot: string; qty: number }>
    /** TRUE when the projection came from CACHED inputs because the device was offline. The modal says
     *  so: a stale check can MISS a breach (an order placed since the last poll is invisible to it), so
     *  the operator must know the answer is provisional rather than authoritative. */
    stale?: boolean
    thisOrderQty: number
    override: boolean
  } | null>(null)

  // ── 🔴 ANDROID HARDWARE BACK — AND THIS IS THE SURFACE THAT HOLDS UNFINISHED WORK ──────────────
  // ORDERED INNERMOST FIRST. Every entry below dismisses EXACTLY what tapping outside that overlay
  // already does today, so back is not a new way to lose anything — it is the existing dismissal
  // reached by a different gesture.
  //
  // 🔴 THE BASKET IS NEVER TOUCHED. Closing the order sheet returns to the menu with every line
  // intact; closing the item modal discards only the modifiers chosen for THAT item, which is what
  // its own backdrop tap already does (`onClick={() => setItemModal(null)}` on that overlay).
  // Nothing here clears `manualItems`, and no entry submits anything.
  // ⚠️ `capacityConfirm` is a DECISION modal — dismissing it is the CANCEL arm, never the "place it
  // anyway" arm. Back must never become a way to commit an order past a capacity warning.
  // ⚠️ DECLARED HERE, BELOW ALL FOUR useState CALLS, AND THAT IS LOAD-BEARING: the array is built
  // during render, not inside a closure, so a placement above any of them is a temporal-dead-zone
  // error. tsc caught exactly that on the first attempt.
  useAndroidBack([
    [!!capacityConfirm, () => setCapacityConfirm(null)],
    [!!itemModal, () => setItemModal(null)],
    [showEventPicker, () => setShowEventPicker(false)],
    [showOrderSheet, () => setShowOrderSheet(false)],
  ])

  // ── derived ─────────────────────────────────────────────────────────────────
  const manualAsapSlot = getAsapSlot(manualSlots, manualEvent?.event_date, eventTz)
  const availableDeals = (truckMenu?.bundles || []).filter(b => b.available)

  const calculation = useMemo(() => calculateOrderTotal(
    manualItems.map(item => ({ name: item.name, price: item.unit_price, quantity: item.quantity })),
    appliedDeals,
    truckMenu?.items || [],
    null,
  ), [manualItems, appliedDeals, truckMenu])

  const { itemsTotal: manualItemsSubtotal, dealSavings, total: manualTotal } = calculation

  // In-progress basket as items-by-category INCLUDING deal constituents (deals[].slots),
  // mirroring the customer page. ONE conversion, reused by the ASAP estimate (#2), the
  // tail-completion slot (#3), and the capacity fit-check — so the deal's cookable items
  // are counted everywhere. Instant categories land here too but are ignored downstream
  // (projection: secs 0; fit-check: no rateByCat entry).
  const basketByCat = useMemo(() => {
    const itemCatMap: Record<string, string> = {}
    ;(truckMenu?.items || []).forEach(i => { itemCatMap[i.name] = (i.category || 'mains').toLowerCase() })
    const byCat: Record<string, number> = {}
    manualItems.forEach(i => { const c = itemCatMap[i.name] || 'mains'; byCat[c] = (byCat[c] || 0) + i.quantity })
    appliedDeals.forEach(d => Object.values(d.slots || {}).filter(Boolean).forEach(name => {
      const c = itemCatMap[String(name)] || 'mains'; byCat[c] = (byCat[c] || 0) + 1
    }))
    return byCat
  }, [manualItems, appliedDeals, truckMenu])

  // Single formula for both pre-event and live: queue from API, new items from basket.
  // Base time = max(now, eventStart) so pre-event orders anchor to event start correctly.
  const queueAware = useMemo(() => {
    if (!manualItems.length && !appliedDeals.length) return { readyTime: '', minsFromNow: 0 }
    const newByCat = basketByCat
    // Prep (kitchen-set) + operator extra-wait is the truth — NO phantom +120s buffer.
    // (waitMinutes is the deliberate operator control; the max(30,…) floor stays in the helper.)
    const totalSecs = calcQueueAwareReadySecs(newByCat, apiQueueByCat, categoryConfigs, waitMinutes * 60)
    if (totalSecs === 0) return { readyTime: '', minsFromNow: 0 }
    // Unified ASAP formula (manual s.6): max(now + totalSecs, eventStart + pushSecs).
    // - now + totalSecs: live-service term — full prep from now, nothing pre-prepped.
    // - eventStart + pushSecs: pre-prep term — batch 1 ready AT event start, this
    //   order's final batch lands (batches-1) cycles later. Empty queue ⇒ push 0 ⇒
    //   exactly event start (never eventStart + prep, per the manual rule).
    // Future date: now-term is today, so eventStart+push wins (queue-aware fix).
    // Today pre-start: continuous crossover, queue-aware, old empty-queue behaviour.
    // Underway: base=now and totalSecs > pushSecs always, so now+totalSecs wins —
    // identical to the pre-fix path. No step at the event-start boundary.
    const base = getAsapBaseTime(manualEvent)
    const t = new Date(Math.max(
      Date.now() + totalSecs * 1000,
      base.getTime() + calcQueuePushSecs(newByCat, apiQueueByCat, categoryConfigs) * 1000,
    ))
    return {
      readyTime: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
      minsFromNow: Math.max(0, Math.ceil((t.getTime() - Date.now()) / 60000)),
    }
  }, [manualItems, appliedDeals, basketByCat, apiQueueByCat, manualEvent, categoryConfigs, waitMinutes])

  // Dots + pick-slot indicator: per-window OVEN OCCUPANCY via the SHARED helper
  // (lib/slot-display) — the SAME projection→tone/label mapping the Edit Order picker
  // uses, so the two surfaces can never diverge. Keyed by collection_time. windowSecs
  // comes from the slot config (rate scaling, never 5).
  const slotIndicators = useMemo(() => {
    if (!capacityInputs || !manualSlots.length) return new Map<string, SlotIndicator>()
    return buildSlotIndicators(
      manualSlots,
      capacityInputs.productionSlotUnits || {},
      serverCatConfigs,
      capacityInputs.kitchenCapacity ?? null,
      capacityInputs.eventStartMins,
      categoryOrder,
      capacityInputs.capacityWindowMins ?? 5,
    )
  }, [capacityInputs, manualSlots, serverCatConfigs, categoryOrder])

  const slotIndicatorFor = (s: Slot): SlotIndicator =>
    slotIndicators.get(s.collection_time) ?? { tone: 'green', emoji: '🟢', label: '', overTotal: 0, occ: null }

  // ASAP "ready around" slot — the BASKET-AWARE earliest BACKWARD-FITTING slot (Stage 3):
  // the earliest collection slot whose cooking windows have room for this order, via the SAME
  // fitOrderBackward engine the picker/server use (no forward tail). The one place the
  // in-progress basket influences the display, and it now agrees with what the picker offers.
  const asapResult = useMemo(() => {
    if (!manualSlots.length || !capacityInputs) return { slot: manualAsapSlot, noFit: false }
    const asapStart = manualAsapSlot?.collection_time ?? manualSlots.find(s => !s.is_grace)?.collection_time
    if (!asapStart) return { slot: manualAsapSlot, noFit: false }
    const [sh, sm] = asapStart.split(':').map(Number)
    // NOW-CLAMP (today only — mins-of-day would mis-compare for a future-date event): the operator
    // ASAP can't place cooking windows before now, so a large order pushes out by its real cook span.
    const nowClamp = manualEvent?.event_date === getLocalDateInTz(eventTz)
      ? getNowMinsInTz(eventTz)
      : Number.NEGATIVE_INFINITY
    const fitTime = earliestBackwardFitSlot(
      manualSlots.map(s => ({ collection_time: s.collection_time, production_slot: s.production_slot })),
      capacityInputs.productionSlotUnits || {},
      serverCatConfigs,
      capacityInputs.kitchenCapacity ?? null,
      capacityInputs.eventStartMins,
      basketByCat,
      (sh || 0) * 60 + (sm || 0),
      capacityInputs.capacityWindowMins ?? 5,
      nowClamp,
    )
    const fitSlot = fitTime ? manualSlots.find(s => s.collection_time === fitTime) : null
    // noFit = there IS a basket but the engine found NO genuinely-fitting slot all day (truly full /
    // over capacity). With the window-scoped ceiling fix this is rare (only a genuinely full day),
    // not the old "any earlier breach reds out everything". The placement slot still falls back so the
    // operator can override ONTO it (the override confirm fires), but the DISPLAY must tell the truth —
    // never a basket-blind "ASAP — 16:40".
    const hasBasket = Object.keys(basketByCat).length > 0
    return {
      slot: fitSlot ?? manualSlots.find(s => !s.is_grace && s.available) ?? manualAsapSlot,
      noFit: hasBasket && !fitSlot,
    }
  }, [manualSlots, capacityInputs, serverCatConfigs, basketByCat, manualAsapSlot, eventTz, manualEvent])
  const adjustedAsapSlot = asapResult.slot
  const asapNoFit = asapResult.noFit

  // "Ready around" (DISPLAY-ONLY readout — NOT placement): must ALWAYS agree with the ASAP slot, which
  // is the engine's load + kitchen-capacity-ceiling-aware earliest-ready (adjustedAsapSlot →
  // earliestBackwardFitSlot). So ready is ANCHORED to that slot (fitReadyTime), shown honest-early ONLY
  // when the slot is late purely by GRIDDING (food genuinely done before the gridded mark, light queue).
  //  • fitReadyTime = the engine's backward-fit collection slot — load + ceiling aware, the authoritative
  //    earliest the food can ACTUALLY be ready. Taken only once there's a basket (an empty order "fits"
  //    every slot).
  //  • queueAware = ungridded now+prep / eventStart+push. It models per-category batch throughput but is
  //    BLIND to the global concurrency ceiling, so under load it UNDER-counts (e.g. a 7th dessert trips
  //    the ceiling → the slot moves 17:10→17:15 but queueAware stays 17:10). It is therefore only safe to
  //    surface when it AGREES with the engine's reasoning.
  // DISCRIMINATOR (gridding vs load): grid queueAware UP to its own collection slot. If that equals the
  // engine slot, the gap is PURE GRIDDING ⇒ show honest-early (the ungridded queueAware, ≤ the slot). If
  // the engine slot is LATER than gridded-queueAware, something queueAware can't see (existing load OR the
  // order's own size tripping a window/capacity ceiling) pushed the slot ⇒ ready FOLLOWS the slot. Either
  // way ready ≈ the slot and NEVER exceeds it. The dropdown/submit slot (:504/:591) is unchanged — this
  // only changes what the readout READS. Fallback to queueAware/calcReadyTime only when there's no fit slot.
  const hasBasketForReady = manualItems.length > 0 || appliedDeals.length > 0
  const fitReadyTime = (hasBasketForReady && capacityInputs) ? (adjustedAsapSlot?.collection_time || null) : null
  const readyToMins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
  // The collection slot that gridding the honest queueAware estimate UP lands on (earliest slot ≥ it).
  const queueAwareGridSlot = queueAware.readyTime
    ? (manualSlots
        .map(s => s.collection_time)
        .filter(t => readyToMins(t) >= readyToMins(queueAware.readyTime))
        .sort((a, b) => readyToMins(a) - readyToMins(b))[0] ?? null)
    : null
  const readyTime = !fitReadyTime
    ? (queueAware.readyTime || calcReadyTime(manualItems, waitMinutes * 60, truckMenu?.items, categoryConfigs))
    : (queueAware.readyTime && queueAwareGridSlot === fitReadyTime)
      ? queueAware.readyTime   // gridding-only gap ⇒ honest-early (food done before the gridded slot)
      : fitReadyTime           // load/ceiling pushed the slot past queueAware ⇒ ready follows the slot
  // "~N mins" wait — derived from the now-consistent readyTime so the number agrees with the shown time
  // (never more minutes than the slot implies). When honest-early won, reuse queueAware's sub-minute-
  // precise count; when ready followed the engine slot (or a calcReadyTime fallback), compute from that HH:MM.
  // (Only rendered on the same-day branch; future-day shows a date label, not a wait.)
  const readyMinsFromNow = (readyTime && readyTime === queueAware.readyTime)
    ? queueAware.minsFromNow
    : readyTime
    ? (() => {
        const nowM = new Date().getHours() * 60 + new Date().getMinutes()
        return Math.max(0, readyToMins(readyTime) - nowM)
      })()
    : queueAware.minsFromNow

  const isEventEnded = manualEvent ? (() => {
    const today = localTodayIso() // LOCAL date (s.7) — pairs with the local end_time check below
    if (manualEvent.event_date > today) return false
    if (manualEvent.event_date < today) return true
    const [h, m] = manualEvent.end_time.split(':').map(Number)
    return new Date().getHours() * 60 + new Date().getMinutes() > h * 60 + m
  })() : false

  const hasItems = isOrderNonEmpty(manualItems, appliedDeals)
  const totalItemCount = manualItems.reduce((s, i) => s + i.quantity, 0) + appliedDeals.length

  // ── fetch events / slots ────────────────────────────────────────────────────


  const fetchUpcomingEvents = useCallback(async () => {
    if (!token) return
    setEventsLoading(true)
    try {
      const res = await fetch(`/api/events/manage?token=${token}&upcoming=true`)
      if (!res.ok) return // S5: never setState from a failed fetch (e.g. 429)
      const data = await res.json()
      if (!Array.isArray(data.events)) return // malformed body — don't blank the list
      const mapped: EventRecord[] = data.events
        .filter((ev: any) => ['confirmed', 'open', 'closed'].includes(ev.status))
        .map((ev: any) => ({
          id: ev.id,
          event_date: ev.event_date,
          start_time: ev.start_time || '',
          end_time: ev.end_time || '',
          venue_name: ev.venue_name || null,
          town: ev.town || null,
          status: ev.status,
        }))
      // Set even when empty: a confirmed 200 with zero events is a legit empty.
      setUpcomingEvents(mapped)
      setEventsLoaded(true)
    } catch { /* S5: swallow — a failed/aborted fetch must not wipe the list */ }
    finally { setEventsLoading(false) }
  }, [token])

  const fetchManualSlots = useCallback(async (eventDate: string, startTime?: string, endTime?: string, eventId?: string) => {
    if (!truck?.id) return
    try {
      const p = new URLSearchParams({ date: eventDate })
      if (startTime) p.set('start', startTime)
      if (endTime) p.set('end', endTime)
      // event_id scopes the panel's capacity projection to THIS event (re-key fix).
      if (eventId) p.set('event_id', eventId)
      const res = await fetch(`/api/slots/${truck.id}?${p}`)
      const data = await res.json()
      setApiSlots(data.slots || [])
      setApiQueueByCat(data.queueByCat || {})
      setApiCapacityInputs(data.capacityInputs ?? null)
      setApiCatConfigs(data.catConfigs || {})
      if (data.tz) setEventTz(data.tz)
      // Null the raw /api/slots state on failure (offline). NOT bare times — the derived `manualSlots`/
      // `capacityInputs` fall back to the cached advisory `offlineCapacity`, so the picker keeps its lights.
    } catch { setApiSlots([]); setApiQueueByCat({}); setApiCapacityInputs(null); setApiCatConfigs({}) }
  }, [truck?.id])

  // Live 30s tick so the ASAP label + the dropdown's isSlotPast re-evaluate as time passes.
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  // Category tabs sticky offset — now a plain `top-0`. The OLD measured `--addorder-sticky-top` (event-bar
  // bottom) assumed MOBILE used WINDOW scroll, so the header had to offset below the sticky chrome. The KDS
  // app-shell (h-dvh flex-col; the header/tabs/event-bar are shrink-0 OUTSIDE the single <main> scroller)
  // eliminated that path: on EVERY width the category header lives inside <main>, so `top-0` pins it flush at
  // the top of the scroller — i.e. right below the fixed chrome — exactly the pre-app-shell mobile look. The
  // measured offset double-counted the chrome height (shifted the header down ~145px) → removed.

  useEffect(() => {
    if (!isActive) return
    fetchUpcomingEvents()
  }, [fetchUpcomingEvents, isActive])

  // Open the picker reusing the already-loaded events for an INSTANT list. Only
  // fetch when we have nothing cached (cold start, or a prior failed load) and
  // aren't already loading — so rapid re-opens never trigger redundant fetches
  // and never flash an empty list.
  const openEventPicker = useCallback(() => {
    // DEMO HARD STOP (§3: styling is not enforcement). Switching events is locked; open the explainer
    // instead of the picker. Belt-and-braces with the swapped onClick below.
    if (isDemo) { onLockedEventAction?.(); return }
    if (upcomingEvents.length === 0 && !eventsLoading) fetchUpcomingEvents()
    setShowEventPicker(true)
  }, [isDemo, onLockedEventAction, upcomingEvents.length, eventsLoading, fetchUpcomingEvents])

  useEffect(() => {
    if (!requestEventPickerOpen) return
    openEventPicker()
    onEventPickerOpened?.()
  }, [requestEventPickerOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync manualEvent when the dashboard switches to a different event
  // isActive in deps: re-sync on tab activation if the event changed while hidden
  useEffect(() => {
    if (!isActive) return
    if (!controlledEvent) return
    if (controlledEvent.id === manualEvent?.id) return // tab switch / identical re-selection
    // Operator ruling (supersedes the V6.4 persist-on-event-change rule): a genuine
    // event CHANGE resets the in-progress basket + customer fields. manualEvent here is
    // still the PREVIOUS event (setManualEvent below hasn't applied) — reset only when
    // there was a prior event that differs, never on the first sync. Reset BEFORE the
    // slot re-fetch so no slot from the old event lingers selected.
    if (manualEvent && manualEvent.id !== controlledEvent.id) resetManual()
    setManualEvent(controlledEvent)
    fetchManualSlots(controlledEvent.event_date, controlledEvent.start_time, controlledEvent.end_time, controlledEvent.id)
    setManualSlot('')
  }, [controlledEvent?.id, isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  // RECONNECT: fetchManualSlots is keyed on manualEvent id/date/times, so if the panel stays OPEN on the same
  // event across a reconnect it won't refire on its own → refetch authoritative /api/slots when we come back
  // online, replacing the advisory offlineCapacity view with server truth. (The strip corrects via reseedRef.)
  const wasOfflineRef = useRef(isOffline)
  useEffect(() => {
    if (wasOfflineRef.current && !isOffline && isActive && manualEvent) {
      fetchManualSlots(manualEvent.event_date, manualEvent.start_time, manualEvent.end_time, manualEvent.id)
    }
    wasOfflineRef.current = isOffline
  }, [isOffline, isActive, manualEvent, fetchManualSlots])

  // ── ⚠️ THE status-ONLY SYNC EFFECT THAT USED TO LIVE HERE IS GONE (V9.6) ────────────────────────
  // It existed to patch ONE field (`status`) through the hole described at `liveEvent` below. Every
  // server-owned field read now goes through `liveEvent`, which is always fresh, so there is nothing
  // left for it to patch — keeping it would have re-introduced a copy of a value we already read live.
  // 🔴 DO NOT ADD A REPLACEMENT FOR THE NEXT FIELD. If a server-owned field reads stale, the fix is to
  // read it from `liveEvent`, not to add a fourth sync effect. That pattern is what produced this bug.

  useEffect(() => {
    if (manualEvent || upcomingEvents.length === 0) return
    // Status-INDEPENDENT default (cross-event fix): current-by-time, else earliest upcoming —
    // never "the single today event" by UTC date, which could seat a stale-live event. The
    // dashboard's controlledEvent (activeEvent) remains the authoritative driver via the sync
    // effect above; this is only the no-controlledEvent cold-start default.
    setManualEvent(pickDefaultEventByTime(upcomingEvents))
  }, [upcomingEvents])

  useEffect(() => {
    if (!isActive) return
    if (manualEvent?.event_date) {
      fetchManualSlots(manualEvent.event_date, manualEvent.start_time, manualEvent.end_time, manualEvent.id)
    }
  }, [manualEvent?.id, manualEvent?.event_date, manualEvent?.start_time, manualEvent?.end_time, fetchManualSlots, isActive])

  // ── item manipulation ───────────────────────────────────────────────────────
  // Option shared-pool pre-warning (D2): would drawing one more of `optNames` exceed any option's
  // BASKET-WIDE pool? Returns the blocked option name (else null). Untracked options never block.
  // The submit-time atomic draw is the real guard; this is the iPhone-settings-style pre-warn.
  const optionAddBlocked = (optNames: string[]): string | null => {
    if (!optNames.length) return null
    const tally = tallyBasketOptionQtys(manualItems.map(i => ({ quantity: i.quantity, modifiers: i.modifiers })))
    const stockMap = buildOptionStockByName(truckMenu?.items || [])
    return optionDrawBlocked(tally, optNames, stockMap, 1)
  }

  // Basket-aware remaining for a modal option pill (display agrees with the §28 gate). null = untracked.
  const optionRemainingFor = (optName: string, stockCount: number | null | undefined): number | null =>
    optionRemaining(stockCount, tallyBasketOptionQtys(manualItems.map(i => ({ quantity: i.quantity, modifiers: i.modifiers })))[optName] || 0)

  const addManualItem = (item: MenuItem, mods: { name: string; price: number; allergens?: string[]; dietary?: string[] }[] = [], notes = '') => {
    const blocked = optionAddBlocked(mods.map(m => m.name))
    if (blocked) { showToast(`Only ${buildOptionStockByName(truckMenu?.items || [])[blocked]} ${blocked} left — shared across all dishes`, 'error'); return }
    const key = makeCartKey(item.name, mods, notes)
    const unitPrice = item.price + mods.reduce((s, m) => s + m.price, 0)
    setManualItems(prev => {
      const ex = prev.find(i => i.cartKey === key)
      if (ex) return prev.map(i => i.cartKey === key ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { name: item.name, quantity: 1, unit_price: unitPrice, modifiers: mods, specialInstructions: notes || undefined, cartKey: key }]
    })
  }

  const adjustManualQty = (cartKey: string, delta: number) => {
    if (delta > 0) {
      const line = manualItems.find(i => (i.cartKey || i.name) === cartKey)
      const blocked = optionAddBlocked((line?.modifiers || []).map(m => m.name))
      if (blocked) { showToast(`Only ${buildOptionStockByName(truckMenu?.items || [])[blocked]} ${blocked} left — shared across all dishes`, 'error'); return }
    }
    setManualItems(prev =>
      prev.map(i => (i.cartKey || i.name) === cartKey ? { ...i, quantity: i.quantity + delta } : i).filter(i => i.quantity > 0)
    )
  }

  const openManualItemModal = (item: MenuItem, modGroups: ModifierGroup[], editCartKey?: string) => {
    const existing = editCartKey ? manualItems.find(i => (i.cartKey || i.name) === editCartKey) : undefined
setItemModal({ item, modGroups, editCartKey })
    setModalMods(existing?.modifiers || [])
    setModalNotes(existing?.specialInstructions || '')
  }

  // Required-modifier gate at the ADD point: an item with a REQUIRED group MUST go through the modal
  // (where the A2 gate runs) — a bare quick-add would bypass it and land an unsatisfied line. OPTIONAL
  // extras still quick-add (the modal is not forced for them). Mirrors the customer page, which always
  // opens the modal for modifier items. modifierGroups is per-item (Stage B), available on the tile.
  const addOrCustomise = (item: MenuItem) => {
    const groups = item.modifierGroups || []
    const hasRequired = groups.some(g => g.is_required || (g.min_choices ?? 0) >= 1)
    if (hasRequired) openManualItemModal(item, groups) // fresh add (no editCartKey)
    else addManualItem(item)
  }

  // Group-aware toggle (A2) — single-select groups deselect siblings (radio), multi respects any
  // max cap, via the SAME shared lib/modifier-rules helper the customer modal uses (A1). One source
  // of truth — no duplicated rule logic.
  const toggleModalMod = (opt: ModifierOption, group: ModifierGroup) => {
    setModalMods(prev => toggleWithGroupRules(prev, opt, group))
  }

  // Required-group enforcement for the open modal (recomputed each render off the live selection) —
  // drives the per-group "unmet" highlight AND the Add/Save disable. Applies to BOTH add and edit-save.
  const modalUnmetGroupIds = itemModal
    ? validateModifierSelection(itemModal.modGroups, modalMods).unmetGroupIds
    : []

  const confirmAddFromModal = () => {
    if (!itemModal) return
    // Required-group gate (A2) — blocks both a new add AND an edit re-save (a line saved before a
    // group became required seeds empty → unmet → operator must choose before saving). Defense-in-
    // depth; the Add/Save button is also disabled while unmet.
    if (validateModifierSelection(itemModal.modGroups, modalMods).unmetGroupIds.length > 0) return
    const newKey = makeCartKey(itemModal.item.name, modalMods, modalNotes)
    const newUnitPrice = itemModal.item.price + modalMods.reduce((s, m) => s + m.price, 0)
    if (itemModal.editCartKey) {
      setManualItems(prev => {
        const editEntry = prev.find(i => (i.cartKey || i.name) === itemModal.editCartKey)
        if (!editEntry) return prev
        const without = prev.filter(i => (i.cartKey || i.name) !== itemModal.editCartKey)
        const collision = without.find(i => i.cartKey === newKey)
        if (collision) return without.map(i => i.cartKey === newKey ? { ...i, quantity: i.quantity + editEntry.quantity } : i)
        // ⚠️ `price_override: undefined` IS LOAD-BEARING. This spreads the existing line, so an
        // override set before the modifiers were changed would survive onto a line whose composition
        // — and therefore whose correct price — is now different, and the server would honour it. The
        // operator re-prices the new line if they still want to; the old figure does not follow it.
        return without.concat({ ...editEntry, modifiers: modalMods, specialInstructions: modalNotes || undefined, unit_price: newUnitPrice, price_override: undefined, cartKey: newKey })
      })
    } else {
      addManualItem(itemModal.item, modalMods, modalNotes)
    }
    setItemModal(null); setModalMods([]); setModalNotes('')
  }

  const resetManual = () => {
    setManualName(''); setManualEmail(''); setManualPhone(''); setManualNotes('')
    setManualSlot(''); setManualItems([]); setAppliedDeals([])
    setActiveDealBundle(null)
    // The buzzer choice is per-order, exactly like the payment choice below it. Nothing carries over —
    // the next order starts with no buzzer and either gets one during entry or via the prompt.
    setManualBuzzer(null)
    // Clear the per-order payment choice. Nothing is remembered between orders by design — the next
    // order presents both actions again with neither pre-selected.
    takePaymentRef.current = false
    paymentMethodRef.current = null
  }

  // ── slot change handler ─────────────────────────────────────────────────────
  // Operator can pick ANY visible slot (manual s.10). The ONLY confirmation is capacity
  // Operator picks a slot → place at it directly, no confirmation. The traffic-light dots already
  // show each slot's load + per-category label, so the operator reads them and makes their own call;
  // the over-capacity "This slot is too full … Use anyway?" modal was removed (operator-only friction,
  // Dominic 2026-06). The CUSTOMER path is unaffected — it's hard-blocked server-side by the same fit
  // check (an over-capacity/too-soon slot is never offered to a customer); this only drops the operator
  // prompt. Empty value clears the selection.
  const handleSlotChange = (value: string) => {
    setManualSlot(value)
  }

  // ── PAID STEP (V9.4) ────────────────────────────────────────────────────────
  // Whether THIS order takes money now. Seeded from the truck default and reset to it after every
  // submit (see resetManual). Entirely inert when the truck has not opted in: showPaidStep false means
  // the confirm bar renders exactly as it did before, and `paymentTaken` is never sent.
  // Resolved by the SHARED helper against the event this order is being placed into — never inline.
  // ⚠️ Reads `liveEvent`, NOT `manualEvent` — see the note at liveEvent. Same event, fresh fields:
  // a walk-up added to Saturday's festival still gets SATURDAY's setting even if the operator is
  // looking at the dashboard on Friday, because liveEvent preserves manualEvent's IDENTITY and only
  // refreshes its VALUES.
  const { showPaidStep, takesCash } = resolvePaidStep(truck, liveEvent as any)
  // 🔴 NO REMEMBERED DEFAULT — open-check semantics. Walk-ups and phone orders come through THIS panel
  // with OPPOSITE payment timings, so any truck-level default is wrong about half the time and the
  // operator has to check and flip on every order anyway — worse than no default at all. Instead the
  // confirm bar offers TWO equal actions and the operator picks one per order, at the moment of sale,
  // which is what they are doing regardless.
  // A REF, not state: it is set at the instant of the tap and read inside submitManual, so it survives
  // the override/re-submit recursion (submitManual(true, true) retries) without threading a parameter
  // through three call sites, and it never triggers a render or looks like a sticky selection.
  const takePaymentRef = useRef(false)

  /** The server total the operator confirmed when a line could not be priced from the menu. A REF for
   *  the same reason takePaymentRef is one: it must survive the re-submit recursion without threading
   *  another parameter through submitManual's signature. Echoed back so the server confirms the exact
   *  figure the operator was shown, not whatever it happens to compute on the second pass. Cleared on
   *  every fresh submit so a stale acknowledgement can never authorise a different total. */
  const confirmUnresolvedTotalRef = useRef<number | null>(null)
  // 🔴 WHICH button is submitting — NOT just "is something submitting". `loading` is one shared boolean,
  // so both confirm buttons read it and BOTH switched to "Confirming…". Only the pressed one should say
  // that; the other must simply disable with its label intact, or the operator cannot tell which action
  // they actually triggered at the moment it matters most.
  // State, not a ref: this drives a LABEL, and a ref change does not re-render.
  const [submitting, setSubmitting] = useState<'take' | 'take-cash' | 'take-card' | 'plain' | null>(null)
  /** WHICH tender, when the truck splits cash from card. Null when it does not — the payment is still
   *  taken, its method simply is not recorded, which is the honest value. Ref for the same reason as
   *  takePaymentRef: it must survive the override/re-submit recursion. */
  // ── 🔴 WHAT THE PLAIN "Take payment" BUTTON RECORDS: `card`, ALWAYS ──────────────────────────
  // Both plain mounts used to set this to `null`, so a walk-up order paid at the hatch booked a ledger
  // row that said nothing about how the money arrived — while the SAME truck's "Mark paid" on an order
  // card recorded `card`. Two paid presses, two answers, one truck.
  // 🔴 THE RULE, AND IT NO LONGER CONSULTS `takes_cash`: an explicit Cash press records `cash`, an
  // explicit Card press records `card`, and a PLAIN press records `card`. `takes_cash` adds a BUTTON;
  // it does not change what the plain button MEANS. An operator with a Cash button in front of them who
  // presses plain instead has taken a card payment, and that is the honest reading.
  // ⚠️ THIS PANEL CANNOT CREATE A STRIPE-SETTLED ORDER — there is no Stripe path in this file at all
  // (its only "stripe" is the word in a comment about a colour band). Every order it books is money
  // taken at the hatch, `channel: 'in_person_other'`, so nothing here can reach an `online` row.
  // ⚠️ `null` REMAINS REACHABLE AND MUST: it is what rides when `takePaymentRef` is false, i.e. an
  // order saved UNPAID, where no payment row is written at all.
  const paymentMethodRef = useRef<'cash' | 'card' | null>(null)
  // 🔴 THE MODAL'S WORDS, NOT A SECOND VOCABULARY. `PaymentActionsModal` prints `Paid in cash` and
  // `Paid on your card machine`; `useGatedActionResult` reuses the lower-case forms for its toasts, and
  // so does this. One fact, one set of words, three surfaces.
  const paidPhrase = () => {
    if (!takePaymentRef.current) return ''
    const m = paymentMethodRef.current
    return m === 'cash' ? ' — paid in cash' : m === 'card' ? ' — paid on your card machine' : ''
  }

  // ── submit ──────────────────────────────────────────────────────────────────
  // override=false: normal submit, runs the atomic stock check. On a shortfall the server
  // returns 409 {stock} WITHOUT inserting — we show the real remaining and let the operator
  // choose. override=true (resubmit after "Proceed anyway"): the operator has SEEN the shortfall
  // and deliberately oversells — the server still runs the check, then inserts past it.
  // capacityAck: the operator pressed "Place it anyway" on the over-capacity modal. Distinct from
  // skipFitCheck (a re-entry guard) because it is PERSISTED — it becomes orders.capacity_ack_at, so a
  // deliberate, informed over-capacity placement is later distinguishable from one that arrived via an
  // offline collision. Never set by any other path.
  const submitManual = async (override = false, skipFitCheck = false, capacityAck = false) => {
    if (!hasItems) return
    const effectiveSlot = manualSlot || adjustedAsapSlot?.collection_time || null

    // ── Confirm-time LIVE capacity check (advisory — never blocks) ───────────────
    // FRESH /api/slots read (no-store) → run the SAME backward-fit engine the customer
    // page uses (projectBackwardOccupancy + fitOrderBackward, mirroring its `unfittableSlots`
    // memo) against the CHOSEN slot for THIS exact basket. The manual path books-as-chosen by
    // design, so this is purely advisory: if the basket doesn't fit, warn so the operator can
    // override (book anyway, maybe moving another customer) or cancel and re-pick. The check
    // fetch is for the CHECK ONLY — it does NOT touch the visible slot state (the post-submit
    // refetch below still refreshes the dots). FAILS OPEN — a flaky/missing check never stops a
    // manual order. skipFitCheck re-entry (the "use anyway" path + the stock-override re-entry)
    // avoids re-looping the prompt. Null/ASAP-unresolved slot → nothing to check.
    // -- THE FIT CHECK NO LONGER STOPS AT THE DEVICE'S CONNECTION -----------------------------------
    // IT USED TO READ `... && isOnline()`, so an order placed offline never consulted capacity at all:
    // no modal, no `capacity_ack_at`, and two customers could hold the same slot with nobody told. The
    // check belongs wherever an order ENTERS THE QUEUE, not wherever the device happens to be online.
    // ONLINE IS UNCHANGED, BYTE FOR BYTE: the fresh no-store `/api/slots` read below still runs and its
    // result still drives the modal. OFFLINE now falls back to the SAME cached inputs the capacity strip
    // in this panel already renders from -- `capacityInputs` and `serverCatConfigs`, which the panel
    // already resolves as `apiCapacityInputs ?? offlineForThisEvent`. No new data source, no new fetch.
    // NOTE: THE OFFLINE ANSWER IS PROVISIONAL AND THE MODAL SAYS SO. Cached occupancy is as fresh as the
    // last successful poll and cannot see orders placed since -- by a customer, or on another device.
    // It can therefore MISS a breach. It cannot invent one that the cached data does not show.
    // NOTE: NO CACHED INPUTS => NO CHECK, exactly as before. An offline device that has never loaded this
    // event has nothing to project from, and a check with no data must not pretend to have run.
    if (!skipFitCheck && effectiveSlot && manualEvent) {
      try {
        let ci: { productionSlotUnits?: Record<string, Record<string, number>>; kitchenCapacity?: number | null; eventStartMins: number; capacityWindowMins?: number } | null = null
        let freshCfgs: Record<string, { secs: number; batch: number }> = {}
        let stale = false
        if (isOnline()) {
          const p = new URLSearchParams({ date: manualEvent.event_date })
          if (manualEvent.start_time) p.set('start', manualEvent.start_time)
          if (manualEvent.end_time) p.set('end', manualEvent.end_time)
          if (manualEvent.id) p.set('event_id', manualEvent.id)
          const checkRes = await fetch(`/api/slots/${truck.id}?${p}`, { cache: 'no-store' })
          const checkData = await checkRes.json()
          ci = checkData.capacityInputs
          freshCfgs = checkData.catConfigs || {}
        } else if (capacityInputs) {
          ci = capacityInputs
          freshCfgs = serverCatConfigs as Record<string, { secs: number; batch: number }>
          stale = true
        }
        if (ci) {
          const back = projectBackwardOccupancy(
            ci.productionSlotUnits || {},
            freshCfgs,
            ci.eventStartMins,
            ci.kitchenCapacity ?? null,
            ci.capacityWindowMins ?? 5,
          )
          // SAME now-clamp rule the panel/customer page use: now-mins for a today event,
          // -Infinity for a future-dated event (mins-of-day would mis-compare across days).
          const nowClamp = manualEvent.event_date === getLocalDateInTz(eventTz)
            ? getNowMinsInTz(eventTz)
            : Number.NEGATIVE_INFINITY
          const fit = fitOrderBackward(
            back,
            readyToMins(effectiveSlot),
            basketByCat,
            freshCfgs,
            ci.kitchenCapacity ?? null,
            ci.eventStartMins,
            ci.capacityWindowMins ?? 5,
            nowClamp,
            (ci.productionSlotUnits || {})[effectiveSlot] || {},
          )
          if (!fit.fits) {
            const slotMins = readyToMins(effectiveSlot)
            const capWord = (c: string) => c.charAt(0).toUpperCase() + c.slice(1)
            const isCounted = (cat: string) => {
              const cf = freshCfgs[(cat || '').toLowerCase()] as { secs?: number; countsToCapacity?: boolean } | undefined
              return !!(cf && (cf.secs || cf.countsToCapacity))
            }

            // ── WHICH COPY? Compare LIKE WITH LIKE ────────────────────────────────────────────
            // `slotIndicators` is the basket-agnostic window state the operator has been LOOKING AT —
            // capacityInputs has no poll and no realtime invalidation, so it genuinely is what was on
            // screen when they picked. Measure the same thing from THIS fresh read. Worse now than
            // then ⇒ the board moved under them ⇒ "filled up". Otherwise ⇒ "over capacity": either it
            // already was when they chose it, or this basket is what tips it — in both cases nothing
            // changed while they worked, so blaming another order would be a lie.
            const seenTone = slotIndicators.get(effectiveSlot)?.tone ?? 'green'
            const freshStep = backwardWindowStepMins(freshCfgs)
            const freshW = back.pileByStart.get(slotMins) ?? back.byStart.get(slotMins - freshStep) ?? null
            const freshTone = freshW?.tone ?? 'green'

            // ── THE BINDING CONSTRAINT, from fit.bound_by (previously computed and discarded) ──
            // "too soon (insufficient lead)" | "global ceiling" | "<Cat> used/batch".
            const bb = fit.bound_by ?? ''
            const catMatch = bb.match(/^(.+?) (\d+)\/(\d+)$/)
            const bind: NonNullable<typeof capacityConfirm>['bind'] =
              bb.startsWith('too soon')
                ? { kind: 'lead' }
                : catMatch
                  ? { kind: 'category', cat: catMatch[1], limit: Number(catMatch[3]), needed: Number(catMatch[2]) }
                  : { kind: 'ceiling', limit: ci.kitchenCapacity ?? 0, needed: fit.peak }

            // Unit noun: only honest when the basket's counted load is a SINGLE category —
            // kitchen_capacity is a global item ceiling across every cooked category, so naming one
            // category's word for a mixed basket would misdescribe the limit.
            const cookedCats = Object.keys(basketByCat).filter(isCounted)
            const singleCat = cookedCats.length === 1 ? cookedCats[0] : null
            const thisOrderQty = cookedCats.reduce((s, c) => s + (basketByCat[c] || 0), 0)
            const unitWord = singleCat
              ? (thisOrderQty === 1 ? capWord(singleCat) : `${capWord(singleCat)}s`).toLowerCase()
              : 'items'

            // ── CONTRIBUTING ORDERS (variant 'over' only) ─────────────────────────────────────
            // 🔴 BY COLLECTION SLOT, with each order's OWN quantity. productionSlotUnits is a per-slot
            // aggregate, so a unit that spilled backward out of a later slot belongs to every order at
            // that slot JOINTLY — there is nothing anywhere that could attribute it to one of them.
            // We therefore never say which order supplied which unit, only who is cooking in the span.
            const spanFrom = fit.spanFromMins ?? (slotMins - freshStep)
            const feedSlots = new Set(contributingProductionSlots(
              ci.productionSlotUnits || {}, freshCfgs, spanFrom, slotMins, ci.capacityWindowMins ?? 5,
            ))
            const OCCUPYING = new Set(['pending', 'confirmed', 'modified', 'cooking'])
            const contributors = (orders || [])
              .filter(o => o.slot && feedSlots.has(o.slot) && OCCUPYING.has(o.status)
                && (!manualEvent?.id || !o.event_id || o.event_id === manualEvent.id))
              .map(o => ({
                id: String(o.id),
                slot: o.slot as string,
                // Deal constituents counted via the SAME shared extractor every capacity path uses.
                qty: normaliseOrderLines(o.items || [], o.deals ?? null)
                  .reduce((s, l) => s + (isCounted(itemCategoryMap[l.name] || '') ? l.quantity : 0), 0),
              }))
              .filter(c => c.qty > 0)
              .sort((a, b) => a.slot.localeCompare(b.slot) || a.id.localeCompare(b.id))

            const fmtMins = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 1440) + 1440) % 1440 % 60).padStart(2, '0')}`

            setCapacityConfirm({
              slot: effectiveSlot,
              variant: bind.kind === 'lead' ? 'toosoon' : (seenTone !== 'red' && freshTone === 'red') ? 'filled' : 'over',
              windowFrom: fit.spanFromMins != null ? fmtMins(fit.spanFromMins) : null,
              bind,
              unitWord,
              contributors,
              thisOrderQty,
              override,
              stale,
            })
            return // NOTHING is submitted — the modal's buttons decide.
          }
        }
      } catch { /* FAIL OPEN — a flaky check must never block a manual order */ }
    }

    setLoading(true)
    setSubmitting(takePaymentRef.current ? (paymentMethodRef.current ? `take-${paymentMethodRef.current}` as const : 'take') : 'plain')
    try {
      // Client-mint the identity so an OFFLINE create is idempotent on replay (order_key) and carries a
      // stable device-prefixed provisional number until the server assigns the real one.
      const orderKey = newUuid()
      const provisional = isOnline() ? '' : await nextProvisionalId(manualEvent?.id ?? null)
      // ── placed_at — CLIENT-MINTED AT THE MOMENT OF COMMIT ────────────────────────────────────────
      // Minted HERE, beside order_key, for the same reason order_key is: this is the instant the
      // operator committed, and it is the only instant the server can never reconstruct. created_at is
      // when the ROW was inserted — for an order taken offline and replayed later that is the sync
      // time, hours after the sale. Null-safe end to end: the column is nullable with no default and
      // no backfill, and every reader falls back to created_at when it is absent.
      const placedAt = new Date().toISOString()
      const manualOrder = {
        order_key: orderKey,
        placedAt,
        // Buzzer chosen DURING entry via the grid button below. Null ⇒ none chosen, which is what makes
        // the after-order prompt fire (when the event override is on).
        buzzerNumber: manualBuzzer,
        // Offline → send the device-prefixed provisional (e.g. 'M3') so the server KEEPS it as the permanent
        // display id (skips its counter) → no renumber on sync. Online → '' → null → server assigns normally.
        provisional_id: provisional || null,
        customerName: manualName,
        customerPhone: manualPhone || null,
        customerEmail: manualEmail || null,
        slot: effectiveSlot,
        items: manualItems,
        deals: appliedDeals.map(d => ({
          name: d.bundle.name,
          slots: d.slots,
          slotModifiers: d.slotModifiers,
          slotNotes: d.slotNotes,
          price: d.bundle.bundle_price,
        })),
        // dealSavings is NOTIONAL ("saved vs buying the deal's items à la carte") — it is NOT money
        // deducted from what the customer pays (manualTotal already IS the deal price). It used to be
        // sent as discountAmt and stored in orders.discount_amt, where every reader treats it as money
        // off: the edit path subtracted it AGAIN from the total, and the confirmation email printed it
        // as a discount line. It now travels in its own field → orders.deal_savings, and discountAmt
        // is a true zero here because a walk-up carries no discount code.
        discountAmt: 0,
        dealSavings,
        total: manualTotal,
        subtotal: manualItemsSubtotal,
        notes: manualNotes || null,
        event_id: manualEvent?.id || null,
        event_date: manualEvent?.event_date || null,
        override,
        // The operator was shown the over-capacity modal and chose "Place it anyway". Persisted as
        // orders.capacity_ack_at so an INFORMED over-capacity placement is later distinguishable from
        // one that arrived unattended (offline collision / sync race). Nothing reads it yet.
        capacityAcknowledged: capacityAck,
        // Present ONLY on a re-submit after the operator confirmed a total for lines the menu could
        // not price (409 needsPriceConfirm, below). Null on every normal submit.
        confirmUnresolvedTotal: confirmUnresolvedTotalRef.current,
        // ── 🔴 THE `showPaidStep ? … : false` GATE IS GONE, AND ITS REMOVAL IS HALF THE FIX ──────────
        // It read `paymentTaken: showPaidStep ? takePaymentRef.current : false`, which forced FALSE
        // whenever "Take orders without payment" was OFF — so the one state that means "we ALWAYS take
        // payment at order time" was the one state that could never record one. The button said
        // `Confirm order · £X` and the payload said `paymentTaken: false`, and they agreed with each
        // other while both contradicting the setting.
        // 🔴 THE VALUE NOW COMES FROM THE BUTTON THE OPERATOR PRESSED, and nothing else. Both settings
        // legitimately take payment here — OFF always, ON via the primary button — so there is no truck
        // configuration under which a `true` from this panel should be refused. The server's matching
        // re-check was removed for the same reason; see app/api/dashboard/action/route.ts.
        // ⚠️ `takePaymentRef` is set by EVERY button in the confirm bar before it calls submitManual, so
        // it can never carry a stale value from a previous press. The unpaid button sets it false.
        paymentTaken: takePaymentRef.current,
        paymentMethod: takePaymentRef.current ? paymentMethodRef.current : null,
      }
      // 🔴 ONE-SHOT, CONSUMED THE MOMENT IT IS READ. An acknowledgement authorises ONE total on ONE
      // submit. Left set, it would ride silently onto the next order and could authorise a figure the
      // operator never saw. If this submit comes back needing a price confirmation again — a stock
      // override re-submit, say — the operator is asked again, which is the correct cost.
      confirmUnresolvedTotalRef.current = null
      // Through the offline GATE: online → normal write; native + unreachable → durable outbox + queued.
      const result = await gatedAction({
        url: '/api/dashboard/action',
        kind: 'create', order_key: orderKey, provisional_id: provisional, online: isOnline(),
        body: { token, pin, action: 'manual', manualOrder },
      })
      // OFFLINE → durably queued. Optimistically add to the isolated device-queued list so the walk-up shows
      // now (cleared on the reconnect drain; the merge NEVER touches fetchAll). Skip the online-only 409
      // override flow + stock decrement below.
      if (result.queued) {
        // ── 🔴 THE PLACEHOLDER FOLLOWS THE QUEUE DECISION, NOT A SEPARATE CONNECTIVITY GUESS ──────────
        // DEVICE-CONFIRMED 14 August 2026: a bare '#' card and a '#N7' card on screen at the same time.
        // TWO things decided the same outcome and disagreed. `isOnline()` at :1031 decided the NUMBER;
        // `gatedAction` decided whether the order QUEUED — and it has TWO routes into queue(): the
        // known-offline check on `online === false`, and a CATCH on a thrown fetch. Reachability needs
        // three consecutive failed pings (~30s) to flip, so inside that window the app believes it is
        // online (no placeholder minted, `provisional === ''`) while the POST is already failing and the
        // order queues anyway. The card then rendered `#{order.id}` over an empty string: a bare '#'.
        // 🔴 `result.queued` IS THE AUTHORITY, because it is the thing that queued it. One decision, one
        // answer — and it is available here, before the optimistic object exists.
        // ⚠️ FALLBACK ONLY. `provisional || …` keeps route 1 EXACTLY as it was: when reachability had
        // already flipped, the number minted at :1031 is the one that went into the queued body, and it
        // must stay the one shown or the card would disagree with what the server will keep.
        // ⚠️ THE ROUTE-2 NUMBER IS DISPLAY-ONLY, AND THAT ASYMMETRY IS DELIBERATE. The body was built at
        // :1039 and is already in the outbox carrying `provisional_id: null`, so on replay the server
        // assigns an ordinary sequential number — a route-2 order shows 'N8' now and '#7' after sync,
        // where a route-1 order keeps its N permanently. Changing that would mean rewriting a queued
        // payload, which is the outbox's business and out of scope here.
        // 🔴 NOTHING HERE IS LOAD-BEARING. `order_key` (minted at :1030) is the identity key and is
        // untouched; `id` is the human display number and is never a lookup key.
        const displayId = provisional || await nextProvisionalId(manualEvent?.id ?? null)
        const optimistic = {
          id: displayId, order_key: orderKey,
          customer_name: manualName || 'Walk-up', customer_phone: manualPhone || null, customer_email: manualEmail || null,
          slot: effectiveSlot, event_date: manualEvent?.event_date ?? null, event_id: manualEvent?.id ?? null,
          van_id: null, status: 'confirmed', items: manualItems, deals: manualOrder.deals,
          subtotal: manualItemsSubtotal, total: manualTotal, notes: manualNotes || null,
          // 🔴 DERIVED FROM THE SAME VALUE THAT WAS QUEUED, NOT A LITERAL (14 August 2026). This read
          // `payment_status: 'unpaid'` — a hardcoded string, eight lines after `paymentTaken` was
          // captured at :1093 and queued correctly at :1102. The payload was always right; only this
          // object said otherwise. Reading `manualOrder.paymentTaken` means the local object and the
          // outbox body cannot diverge, because they are now the same value.
          // 🔴 THIS ALONE DOES NOT MAKE THE CARD RENDER AS PAID, AND MUST NOT BE READ AS THE FIX FOR
          // THAT. OrderCard decides paid-ness from `getOrderBalance(order, ledgerRows)`, whose
          // BalanceableOrder type is `{ total_minor?, total? }` — it never reads payment_status at all.
          // Offline there are no ledger rows, so the balance is still the full total and "Mark paid"
          // still renders. See docs/offline-paid-state-report.md.
          // ⚠️ types.ts records that payment_status is a DERIVED CACHE that "must never be hand-written",
          // and this line hand-writes it either way. It is corrected here rather than removed because
          // removing a field from the optimistic object is a wider change than this task allows.
          order_type: 'collection', payment_status: manualOrder.paymentTaken ? 'paid' : 'unpaid', created_at: new Date().toISOString(),
        } as unknown as Order
        onOrderPlaced(optimistic)
        // Same value as the card, for the same reason: on route 2 this read "Order  saved" with a hole
        // where the number belongs.
        // ⚠️ THE SYNC CLAUSE IS GONE ON PURPOSE (14 August 2026): OfflineBanner says "will sync when you're
        // back online" persistently, with a count. The toast's job is IDENTITY — which order was saved.
        // ⚠️ THE METHOD RIDES BESIDE THE IDENTITY, IN PaymentActionsModal's OWN WORDS — `paid in cash` /
        //    `paid on your card machine`. Silent when nothing was recorded (an unpaid save), which is
        //    the string this line always was.
        showToast(`Order ${displayId} saved${paidPhrase()}`, 'success')
        resetManual(); setShowOrderSheet(false); setLoading(false); setSubmitting(null)
        return
      }
      const data = result.data ?? {}
      // Lock contention past the budget (rare): server did NOT insert — keep the order, retry.
      if (result.status === 409 && data?.retry) {
        showToast('Busy right now — tap Confirm again in a moment', 'error')
        return
      }
      // Category CLOSED: the operator turned this category off for the event (online orders closed). They
      // can still add for the HATCH via the informed override (same shape as the stock override). Checked
      // before the stock branch — it's a hard stop, not a shortfall.
      if (result.status === 409 && data?.categoryClosed) {
        const cats: string[] = Array.isArray(data.categories) ? data.categories : []
        const detail = cats.length ? `${cats.join(', ')} ${cats.length > 1 ? 'are' : 'is'} closed for this event.` : 'A category is closed for this event.'
        const proceed = window.confirm(`${detail}\n\nAdd anyway (for the hatch)?\n\nOK = add anyway   ·   Cancel = edit the order`)
        if (proceed) { await submitManual(true, true); return }
        return // Edit/Cancel — keep the order in the panel
      }
      // Stock shortfall: the atomic check RAN and reported the real remaining. INFORMED override
      // — operator proceeds anyway (deliberate oversell) or cancels to edit. Not inserted yet.
      if (result.status === 409 && data?.stock) {
        const shortItems: { name: string; remaining: number }[] = Array.isArray(data.items) ? data.items : []
        const detail = shortItems.length
          ? shortItems.map(s => `${s.name}: only ${s.remaining} left`).join('\n')
          : 'Some items are low on stock'
        const proceed = window.confirm(`${detail}\n\nProceed anyway (oversell)?\n\nOK = proceed anyway   ·   Cancel = edit the order`)
        // skipFitCheck=true: the fit check already ran (and passed/was overridden) before this
        // POST — re-entry for the stock override must not re-prompt the fit modal.
        if (proceed) { await submitManual(true, true); return }
        return // Edit/Cancel — keep the order in the panel for adjustment, not inserted
      }
      // ── 🔴 A LINE THE MENU CANNOT PRICE ────────────────────────────────────────────────────────
      // The server prices every line from this truck's menu. A name it cannot find there — a dish
      // renamed or deleted since this basket was built, an extra no longer offered on that dish — has
      // no authoritative price, so rather than guessing (which would be the client pricing the order
      // again) it reports what it could not price and the total it WOULD store, and asks. An operator
      // is standing here, so this is a question; the customer path, where nobody is, refuses instead.
      // Nothing was inserted — the basket is intact either way.
      // ⚠️ A hand-set price is NOT an unresolved: the operator answering is the answer.
      if (result.status === 409 && data?.needsPriceConfirm) {
        const list: { kind: string; name: string; on?: string }[] = Array.isArray(data.unresolved) ? data.unresolved : []
        const detail = list.length
          ? list.map(u => `${u.name}${u.on ? ` (on ${u.on})` : ''} — not on the menu`).join('\n')
          : 'Something on this order is no longer on the menu'
        const proceed = window.confirm(`${detail}\n\nSave at £${Number(data.total ?? 0).toFixed(2)}?\n\nOK = save at this total   ·   Cancel = edit the order`)
        if (proceed) {
          confirmUnresolvedTotalRef.current = Number(data.total ?? 0)
          // skipFitCheck=true for the same reason the stock override passes it: the fit check already
          // ran before this POST and must not re-prompt. `override` is carried through unchanged —
          // this is a pricing answer, not a stock decision, and must not silently authorise an oversell.
          await submitManual(override, true)
          return
        }
        return // Edit/Cancel — keep the order in the panel, nothing written
      }
      // Option shared-pool shortfall (D2): a tracked modifier option ran out. SHARED POOL — overriding
      // oversells it across ALL dishes that use it (not just this one). Same override→re-submit shape.
      if (result.status === 409 && data?.optionStock) {
        const opt = data.optionName || 'an option'
        const proceed = window.confirm(`Only a limited amount of "${opt}" left — and it's shared across ALL dishes that use it.\n\nProceed anyway (oversell)?\n\nOK = proceed anyway   ·   Cancel = edit the order`)
        if (proceed) { await submitManual(true, true); return }
        return // Edit/Cancel — keep the order in the panel
      }
      // WEB offline: the gate couldn't reach the server (fetch threw → no HTTP status, and nothing was
      // queued). The web dashboard has NO durable outbox, so instead of the bare "Failed" toast, be explicit:
      // the order was NOT sent and the basket stays in this panel (no resetManual on this path) so the operator
      // can retry on reconnect WITHOUT re-entering it. Do NOT imply durability — a refresh/navigation loses it.
      // (Native never reaches here: the gate queues to the outbox and returns result.queued, handled above.)
      if (!isNativeApp() && !result.queued && result.status == null) {
        showToast("Couldn't reach the server — you appear to be offline. The order was NOT sent. Keep this panel open and retry when you reconnect.", 'error')
        return
      }
      if (!result.ok) throw new Error(data.error)
      // ── "Take payment £X" WENT THROUGH; THE MONEY DID NOT ────────────────────────────────────────
      // 🔴 THE THIRD paymentWarning PRODUCER, and the one whose lie lasts longest. The walk-up
      // paid-at-order path fails OPEN on the ledger write (action/route.ts:~1237): the ORDER is created
      // and only the charge is lost, so the operator who just took £X at the counter sees "confirmed"
      // and a card with no PAID chip. Nothing said the money was not recorded.
      // ⚠️ REPLACES the confirmation toast rather than following it — same rule as the dashboard's
      // completion toast. The order really was created; saying so in green alongside a red warning is
      // how an operator ends up reading only the green one.
      // The card marker is the durable half: this order stays ON the board, so the next poll renders
      // ⚠ PAYMENT NOT RECORDED on its card with a repair beside it. No new alerting mechanism here.
      if (data.paymentWarning) {
        showToast(`⚠ Order #${data.orderId} added — PAYMENT NOT RECORDED. Take payment again on the order card.`, 'error', { duration: 20000 })
      } else {
        showToast(`Order #${data.orderId} confirmed${paidPhrase()}`)
      }
      if (manualItems.length) {
        const categoryMap: Record<string, string> = {}
        manualItems.forEach(item => {
          const mi = truckMenu?.items.find(m => m.name === item.name)
          if (mi) categoryMap[item.name] = mi.category
        })
        await fetch('/api/dashboard/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, pin, action: 'decrement_stock', items: manualItems, categoryMap }),
        }).catch(() => null)
      }
      // ── AFTER-ORDER BUZZER PROMPT ────────────────────────────────────────────────────────────────
      // 🔴 FIRED HERE, AFTER THE SUCCESS TOAST AND BEFORE resetManual(), AND THE POSITION IS THE POINT.
      // The operator still has the order in front of them — the basket, the name, the total are all
      // still on screen — so "which buzzer did you just hand them" is a question about something they
      // can still see. Move it below resetManual() and they are staring at an empty panel; move it
      // above the toast and they have no confirmation the order even saved.
      //
      // 🔴 BLOCKING, WITH NO BACKDROP DISMISS. A mis-tap outside the modal during a rush is the exact
      // failure this exists to prevent: a pager handed over with no record of which one. The only two
      // exits are picking a number and pressing "No buzzer", and BOTH are active choices.
      // ⚠️ The escape reads "No buzzer", NEVER "Skip" — no skip affordance exists anywhere in this app,
      // and "skip" frames a made decision as something left undone.
      //
      // CREATION ONLY. The edit path never re-prompts: an operator amending an order has not just
      // handed over a new pager, and a modal on every edit would be noise.
      //
      // Conditions: the van has buzzers AND this event prompts AND no buzzer was chosen during entry.
      // A failure inside the prompt must never strand the panel — the whole block is best-effort and
      // the flow continues to resetManual() regardless.
      if (buzzerCount != null && buzzerPromptEnabled && manualBuzzer == null && data?.orderId) {
        try {
          await new Promise<void>(resolve => {
            setBuzzerPrompt({ orderKey, orderId: String(data.orderId), resolve })
          })
        } catch { /* never block the reset on the prompt's own failure */ }
      }

      resetManual()
      setShowOrderSheet(false)
      if (manualEvent) {
        await fetchManualSlots(manualEvent.event_date, manualEvent.start_time, manualEvent.end_time)
      }
      onOrderPlaced()
    } catch (err: any) {
      showToast(err.message || 'Failed', 'error')
    } finally {
      setLoading(false)
      setSubmitting(null)
    }
  }

  // ── shared JSX pieces ───────────────────────────────────────────────────────

  // ── THE SLOT <select> LOOK — SHARED BY BOTH BRANCHES ────────────────────────────────────────────
  // 🔴 appearance-none IS WHY THIS EXISTS. The class list already said rounded-xl, the same as the
  // customer-name input and the buzzer button beside it — but a native <select> on macOS/desktop keeps
  // the OS control chrome, and that chrome's own corner radius WINS over border-radius. So the box
  // rendered squarer than everything around it on desktop while looking correct on iOS, which does not
  // apply that chrome. appearance-none drops it and lets rounded-xl actually take effect.
  // ⚠️ Dropping the native chrome also drops the native dropdown arrow, so one is supplied here as a
  // background SVG rather than a wrapper element: the select is a flex child (flex-1 min-w-0) in the
  // time+buzzer row, and wrapping it would move that sizing onto a div and re-open the width work.
  // pl-3 pr-9 (was px-3) reserves the arrow's column so a long option label can never run under it.
  // Defined once and used by BOTH branches below — they were already byte-identical and must stay so.
  const SLOT_SELECT_CLASS = 'flex-1 min-w-0 appearance-none border border-slate-200 rounded-xl pl-3 pr-9 py-3 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400'
  const SLOT_SELECT_STYLE: React.CSSProperties = {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%2364748b' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.75rem center',
    backgroundSize: '1.1rem',
  }

  const slotSelector = (
    <div>
      {/* ── TIME + BUZZER SHARE ONE ROW ───────────────────────────────────────────────────────────
          items-stretch, so both controls are exactly the height of the taller one — the buzzer button
          can never end up a shorter target than the select it sits beside.
          🔴 TOUCH TARGET: both are px-3 py-3 text-sm ⇒ 20px line + 24px padding + 2px border = 46px,
          and the button additionally carries an explicit min-h-[44px] floor so no future text or font
          change can take it under the 44px minimum. This is tapped mid-service on an iPad.
          WIDTHS: the select is flex-1 min-w-0 (takes everything left over and is allowed to shrink);
          the button is shrink-0 (keeps its natural ~110px and never compresses). The select therefore
          gives up width, never the touch target. */}
      <div className="flex items-stretch gap-2">
      {manualSlots.length > 0 ? (
        <select
          value={manualSlot}
          onChange={e => handleSlotChange(e.target.value)}
          className={SLOT_SELECT_CLASS}
          style={SLOT_SELECT_STYLE}
        >
          {/* Show the concrete earliest-fitting time ONLY once the basket has items — empty-basket
              "earliest" (event open) is misleading and jumps as soon as an item is added. Display-only. */}
          <option value="">⚡ ASAP{asapNoFit ? ' — over capacity (no slot fits)' : (hasItems && adjustedAsapSlot) ? ` — ${adjustedAsapSlot.collection_time}` : ''}</option>
          {/* PAST = the SINGLE live source of truth isSlotPast(eventTz) — never the cached server
              is_past flag (stale once the clock advances; on Vercel it's UTC, an hour off in BST).
              Operators see every slot from NOW including the imminent next one (isSlotPast excludes
              only genuinely-elapsed slots, no +5 grace); too-soon/full slots stay visible with their
              traffic-light. */}
          {manualSlots.filter(s => s.is_grace || !isSlotPast(s, eventTz, manualEvent?.event_date)).map(s => {
            if (s.is_grace) return <option key={s.collection_time} value={s.collection_time}>⚠️ {s.collection_time} · After closing</option>
            const ind = slotIndicatorFor(s)
            // ❗ = this window is STRICTLY OVER the ceiling, not merely full. Red alone conflates the
            // two (tone goes red at conc >= ceiling), so an at-capacity slot and an over-subscribed
            // one were indistinguishable. A permanent property of the slot's load — it does NOT clear
            // when an operator acknowledges a placement. Mark only, no wording, by design.
            return <option key={s.collection_time} value={s.collection_time}>{s.collection_time} {ind.emoji}{ind.overTotal > 0 ? '❗' : ''}{ind.label ? ` ${ind.label}` : ''}</option>
          })}
        </select>
      ) : (
        <select
          value={manualSlot}
          onChange={e => setManualSlot(e.target.value)}
          className={SLOT_SELECT_CLASS}
          style={SLOT_SELECT_STYLE}
        >
          <option value="">⚡ ASAP</option>
          {(() => {
            const startMins = manualEvent ? (() => { const [h, m] = manualEvent.start_time.split(':').map(Number); return h * 60 + m })() : 10 * 60
            const endMins = manualEvent ? (() => { const [h, m] = manualEvent.end_time.split(':').map(Number); return h * 60 + m })() : 22 * 60 + 30
            const opts: string[] = []
            for (let t = startMins; t <= endMins; t += 5) {
              opts.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
            }
            // Same INVARIANT as the capacity dropdown: never offer a slot before now (this fallback
            // previously had NO past filter — a past time was selectable). isSlotPast in the event tz.
            return opts
              .filter(time => !isSlotPast({ collection_time: time }, eventTz, manualEvent?.event_date))
              .map(time => <option key={time} value={time}>{time}</option>)
          })()}
        </select>
      )}
      {/* ── BUZZER, DURING ENTRY ─────────────────────────────────────────────────────────────────
          Gated on buzzerCount alone (NOT buzzerPromptEnabled): assigning by hand is always valid, and
          an event that has turned the automatic prompt off has not stopped handing out buzzers.
          Neutral until set, then it states the number and switches to the same white-on-slate chip
          treatment the order card uses — one visual language for "this order has buzzer N", not two.
          shrink-0 + whitespace-nowrap + min-h-[44px]: it keeps its natural width and its full height at
          every viewport, so a narrow screen costs the SELECT width, never this touch target. */}
      {buzzerCount != null && (
        <button
          type="button"
          onClick={() => setShowBuzzerPicker(true)}
          className={`shrink-0 min-h-[44px] whitespace-nowrap rounded-xl px-3 py-3 text-sm font-semibold border transition-colors ${
            manualBuzzer != null
              ? 'bg-white text-slate-900 border-slate-300'
              : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
          }`}
        >
          {manualBuzzer != null ? `🔔 Buzzer ${manualBuzzer}` : '🔔 + Buzzer'}
        </button>
      )}
      </div>
      {/* ASAP-only: the ready estimate is meaningless once a specific slot is picked
          (manualSlot set). manualSlot === '' is the ASAP/default state (the "ASAP — {time}"
          option's value=""), the same truth the dropdown uses — no new source. */}
      {!manualSlot && asapNoFit ? (
        // Engine found NO genuinely-fitting slot all day (truly over capacity). Tell the truth — do
        // NOT show a basket-blind "around 16:40". The operator can still pick a specific slot + override.
        <p className="text-xs text-red-600 font-semibold mt-1.5">⚠ Over capacity — no slot fits this order</p>
      ) : !manualSlot && readyTime && (() => {
        const isFutureDay = manualEvent && manualEvent.event_date > localTodayIso()
        const dateLabel = isFutureDay
          ? new Date(manualEvent!.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
          : null
        // Sub-label time + minutes come from `readyTime`/`readyMinsFromNow`, anchored to the engine's
        // ASAP slot (adjustedAsapSlot): ready ALWAYS agrees with the dropdown slot — equal to it when
        // load/ceiling set the slot, or honest-early (the ungridded estimate ≤ the slot) only when the
        // slot is late purely by gridding. Falls back to the queue-batch estimate when there's no fit slot.
        const m = readyMinsFromNow
        const wait = m < 60
          ? `~${m} min${m !== 1 ? 's' : ''}`
          : `~${Math.round(m / 30) / 2} hr${Math.round(m / 30) / 2 !== 1 ? 's' : ''}`
        return isFutureDay ? (
          <div className="mt-2 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
            <span className="text-teal-600 text-base">⚡</span>
            <div>
              <p className="text-sm font-black text-teal-800">Ready around {readyTime}</p>
              <p className="text-xs text-teal-600 font-medium">{dateLabel}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-green-600 font-medium mt-1.5">⚡ {wait} · around {readyTime}</p>
        )
      })()}
    </div>
  )

  const contactDetails = (
    <details className="text-xs text-slate-400">
      <summary className="cursor-pointer select-none py-1">+ Add email / phone / notes</summary>
      <div className="mt-2 flex flex-col gap-2">
        <input type="email" placeholder="Email for receipt" value={manualEmail}
          onChange={e => setManualEmail(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
        <input type="tel" placeholder="Phone number" value={manualPhone}
          onChange={e => setManualPhone(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
        <textarea placeholder="Order notes" value={manualNotes} onChange={e => setManualNotes(e.target.value)}
          rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
      </div>
    </details>
  )

  const submitPanel = (
    <div className="border-t border-slate-200 p-4 flex flex-col gap-3 bg-white shrink-0">
      {hasItems && (
        <div className="flex justify-between text-base font-semibold text-slate-900">
          <span>Total</span>
          <span>£{manualTotal.toFixed(2)}</span>
        </div>
      )}
      <input
        type="text"
        placeholder="Customer name — optional"
        value={manualName}
        onChange={e => setManualName(e.target.value)}
        className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
      />
      {slotSelector}
      {contactDetails}
      {/* ── PAYMENT DECISION — TAKING PAYMENT IS THE DEFAULT, PLACING UNPAID IS THE OPTION ─────────
          🔴 REBUILT 10 August 2026. THE OLD BAR WAS INVERTED, AND THIS IS THE DEFECT IT CAUSED.
          With "Take orders without payment" OFF it rendered ONE button reading `Confirm order · £X`
          that created the order and recorded NOTHING — so turning the setting OFF produced an order
          taken WITHOUT payment, the exact inverse of what the setting says. The operator hit it in
          testing and had to go to the order card afterwards to mark it paid and collected.
          The client half was only half the bug: `paymentTaken: showPaidStep ? … : false` (see
          submitManual) forced FALSE whenever the setting was off, and the SERVER re-checked
          `showPaidStep` before booking, so even a client that sent true would have been refused.
          BOTH gates are gone; see the note at each.
          ── WHAT IT DOES NOW ────────────────────────────────────────────────────────────────────
          OFF  → ONE button, and it TAKES PAYMENT. There is deliberately NO route to place an unpaid
                 order from this panel: the truck has said they always take payment at order time.
                 ⚠️ ACCEPTED CONSEQUENCE, ruled on by the operator — a truck that takes phone
                 pre-orders turns the setting ON. Do NOT add a third state or a workaround here.
          ON   → TWO buttons. The payment one is PRIMARY (solid); the unpaid one is SECONDARY
                 (outline) and says what it does and does not do.
          ── LABELS: THE BUTTON MUST SAY WHICH ONE TAKES MONEY ───────────────────────────────────
          `Confirm order` was the whole problem — it sounds like the primary action and says nothing
          about payment, so on a two-button bar it read as the safe default. The payment button keeps
          "Take payment" over the amount — that shape is unchanged and already correct.
          🔴 THE SECONDARY IS **"Place order"**, AND IT IS DELIBERATELY SHORT. DO NOT LENGTHEN IT.
          It was briefly "Place order, pay later"; that was DEFENSIVE, and the defence is unnecessary
          because it never stands alone — **it sits beside "Take payment £10.00", and the contrast
          carries the meaning: one button names a price, the other does not.** An operator who has
          turned "Take orders without payment" ON knows what they configured. The longer label also
          cost width in a row that is tight on a phone.
          ⚠️ AND IT IS NOT "Confirm order", which is what it will drift back to if anyone shortens it
          without reading this. Two reasons, both live: "confirm" reads as THE primary action, which is
          the inversion this bar was rebuilt to remove; and **"Confirm" is the customer-order flow's own
          word for accepting an order into the queue** (the order card's `✓ Confirm`, the pending
          bucket), so it already means something else in this product. "Place order" is unambiguous
          next to a button that names a price.
          ⚠️ THE AMOUNT STAYS STACKED UNDER THE LABEL, not inline: it cannot clip at narrow widths.
          A ROW, not a stack of full-width primaries — two stacked primaries create a "which is the
          default?" problem and put the second target under the thumb's travel from the first.
          🔴 ONE PRESS = ONE SERVER ACTION, ONE REQUEST, ONE OUTBOX OP. Every button here calls
          `submitManual`, which makes ONE `gatedAction({ kind: 'create' })` carrying `paymentTaken`;
          the server creates the order and books the ledger row inside the SAME handler. Nothing here
          dispatches a payment op alongside a create — the outbox skips a conflicted op and continues,
          so a create that landed beside a payment that conflicted would leave an unpaid order looking
          paid. Do not split this into two dispatches. */}
      {showPaidStep ? (
        <div className="flex gap-2">
          <button
            onClick={() => { takePaymentRef.current = false; void submitManual() }}
            disabled={loading || !hasItems || !manualEvent}
            className={`flex-1 min-w-0 ${ORANGE_OUTLINE} font-semibold py-3 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]`}
          >
            {submitting === 'plain' ? 'Confirming…' : !manualEvent ? 'Select an event' : 'Place order'}
          </button>
          {takesCash ? (
            /* CASH/CARD — both blue (both are money actions; no fourth colour), one tap each, no modal.
               Distinct `submitting` keys keep the pending label per button. The amount rides on BOTH
               because this bar has the width the order card does not. */
            <>
              <button
                onClick={() => { takePaymentRef.current = true; paymentMethodRef.current = 'cash'; void submitManual() }}
                disabled={loading || !hasItems || !manualEvent}
                className={`flex-1 min-w-0 ${ORANGE_SOLID} font-semibold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98] flex flex-col items-center justify-center leading-tight`}
              >
                {submitting === 'take-cash' ? <span className="text-sm">Confirming…</span> : (
                  <><span className="text-sm">💷 Cash</span><span className="text-base font-black">£{manualTotal.toFixed(2)}</span></>
                )}
              </button>
              <button
                onClick={() => { takePaymentRef.current = true; paymentMethodRef.current = 'card'; void submitManual() }}
                disabled={loading || !hasItems || !manualEvent}
                className={`flex-1 min-w-0 ${ORANGE_SOLID} font-semibold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98] flex flex-col items-center justify-center leading-tight`}
              >
                {submitting === 'take-card' ? <span className="text-sm">Confirming…</span> : (
                  <><span className="text-sm">💳 Card</span><span className="text-base font-black">£{manualTotal.toFixed(2)}</span></>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={() => { takePaymentRef.current = true; paymentMethodRef.current = 'card'; void submitManual() }}
              disabled={loading || !hasItems || !manualEvent}
              className={`flex-1 min-w-0 ${ORANGE_SOLID} font-semibold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98] flex flex-col items-center justify-center leading-tight`}
            >
              {submitting === 'take' ? <span className="text-sm">Confirming…</span> : (
                <><span className="text-sm">Take payment</span><span className="text-base font-black">£{manualTotal.toFixed(2)}</span></>
              )}
            </button>
          )}
        </div>
      ) : takesCash ? (
        /* OFF + cash/card — still ONE ACT, offered as two one-tap choices, exactly as the ON branch
           and the order card do it. Both create the order AND record the payment; they differ only in
           the `method` recorded. Same solid colour, distinguished by ICON, never by colour. */
        <div className="flex gap-2">
          <button
            onClick={() => { takePaymentRef.current = true; paymentMethodRef.current = 'cash'; void submitManual() }}
            disabled={loading || !hasItems || !manualEvent}
            className={`flex-1 min-w-0 ${ORANGE_SOLID} font-semibold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98] flex flex-col items-center justify-center leading-tight`}
          >
            {submitting === 'take-cash' ? <span className="text-sm">Confirming…</span> : !manualEvent ? <span className="text-sm">Select an event</span> : (
              <><span className="text-sm">💷 Cash</span><span className="text-base font-black">£{manualTotal.toFixed(2)}</span></>
            )}
          </button>
          <button
            onClick={() => { takePaymentRef.current = true; paymentMethodRef.current = 'card'; void submitManual() }}
            disabled={loading || !hasItems || !manualEvent}
            className={`flex-1 min-w-0 ${ORANGE_SOLID} font-semibold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98] flex flex-col items-center justify-center leading-tight`}
          >
            {submitting === 'take-card' ? <span className="text-sm">Confirming…</span> : !manualEvent ? <span className="text-sm">Select an event</span> : (
              <><span className="text-sm">💳 Card</span><span className="text-base font-black">£{manualTotal.toFixed(2)}</span></>
            )}
          </button>
        </div>
      ) : (
        /* 🔴 OFF — THE SINGLE BUTTON TAKES PAYMENT. It used to read `Confirm order · £X` and record
           nothing, which is the inversion this rebuild fixes: with the setting OFF the truck has said
           they always take payment at order time, so the one button must do both.
           ⚠️ `takePaymentRef.current = true` is what the old branch was missing — it called
           `submitManual()` bare, leaving the ref at whatever the last press set it to and the
           `paymentTaken` expression forcing false anyway.
           The label names the ACT and the AMOUNT, matching the primary button in the ON branch, so an
           operator moving between the two states meets the same words for the same outcome. */
        <button
          onClick={() => { takePaymentRef.current = true; paymentMethodRef.current = 'card'; void submitManual() }}
          disabled={loading || !hasItems || !manualEvent}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-4 rounded-xl text-base disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
        >
          {loading ? 'Confirming...' : !manualEvent ? 'Select an event to confirm' : `Take payment${manualTotal > 0 ? ` £${manualTotal.toFixed(2)}` : ''}`}
        </button>
      )}
    </div>
  )

  const cartLines = (
    <div className="space-y-1">
      {/* Deals first — always with category header */}
      {appliedDeals.length > 0 && (
        <p className="text-[10px] font-black text-orange-500 uppercase tracking-wide mb-1">Deals</p>
      )}
      {appliedDeals.map((d, i) => (
        <div key={i} className="py-1">
          {/* Deal header — same visual weight as standalone item rows */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <span className="text-sm font-bold text-slate-900 truncate">🎁 {d.bundle.name}</span>
              <button
                onClick={() => {
                  if (d.itemsTakenFromBasket?.length > 0) {
                    setManualItems(prev => prev.filter(item => !d.itemsTakenFromBasket.includes(item.cartKey || item.name)))
                  }
                  setAppliedDeals(prev => prev.filter((_, n) => n !== i))
                }}
                className="text-slate-300 hover:text-red-500 ml-1 text-sm leading-none shrink-0"
              >×</button>
            </div>
            <InlinePriceEditor
              price={d.bundle.bundle_price}
              quantity={1}
              onChange={p => setAppliedDeals(prev => prev.map((deal, idx) =>
                idx === i ? { ...deal, bundle: { ...deal.bundle, bundle_price: p } } : deal
              ))}
            />
          </div>
          {/* Constituent items — indented, muted */}
          {Object.keys(d.slots).sort().map(slotKey => {
            const itemName = d.slots[slotKey]
            if (!itemName) return null
            const mods = d.slotModifiers?.[slotKey] || []
            const note = d.slotNotes?.[slotKey]
            return (
              <div key={slotKey}>
                <div className="pl-4 text-xs text-slate-500">{itemName}</div>
                {mods.map(m => (
                  <div key={m.name} className="flex justify-between pl-8 text-xs text-slate-400">
                    <span>{m.name}</span>
                    {m.price > 0 && <span className="text-slate-500">+£{m.price.toFixed(2)}</span>}
                  </div>
                ))}
                {note && <div className="pl-8 text-xs text-slate-400 italic">📝 {note}</div>}
              </div>
            )
          })}
        </div>
      ))}
      {/* Items — sorted by menu category order, always show category header */}
      {(() => {
        const grouped: Record<string, BasketItem[]> = {}
        manualItems.forEach(item => {
          const cat = truckMenu?.items.find(m => m.name === item.name)?.category || 'other'
          if (!grouped[cat]) grouped[cat] = []
          grouped[cat].push(item)
        })
        const sortedCats = [
          ...categoryOrder.filter(cat => grouped[cat]),
          ...Object.keys(grouped).filter(cat => !categoryOrder.includes(cat)),
        ]
        return sortedCats.map(cat => (
          <div key={cat}>
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-wide mb-1 mt-2 first:mt-0">{cat}</p>
            {grouped[cat].map(item => {
              const rowKey = item.cartKey || item.name
              const fullMenuItem = truckMenu?.items.find(m => m.name === item.name)
              // Stage B: per-item groups are the sole source (replaces category name-match).
              const itemCatModGroups = fullMenuItem?.modifierGroups || []
              // Edit shows on EVERY line — the truck can ALWAYS add notes (asymmetric model, backlog #2), so
              // this is no longer gated on the category allow_notes flag (now customer-only). Guard on
              // fullMenuItem only because the modal needs the item to open. Items with extras also edit extras.
              const showCustomise = !!fullMenuItem
              // Option shared-pool gate (D2): disable "+" if one more of this line's options would
              // exceed the basket-wide pool. Reuses the item "max" affordance.
              const optBlocked = optionAddBlocked((item.modifiers || []).map(m => m.name))
              return (
                <div key={rowKey} className="flex items-start gap-2 py-1">
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <button onClick={() => adjustManualQty(rowKey, -1)} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-red-100 hover:text-red-600 text-sm leading-none">−</button>
                    <span className="w-5 text-center font-black text-sm text-slate-900">{item.quantity}</span>
                    {/* Option-pool limit feedback is the DISABLED "+" + its tooltip (consistent with how
                        items behave on the basket line — no static "max" label on this confirmation surface;
                        the count lives in the add modal §29). V7.8 §32 removed the basket-line "max" badge. */}
                    <button onClick={() => adjustManualQty(rowKey, 1)} disabled={!!optBlocked} title={optBlocked ? `Only ${buildOptionStockByName(truckMenu?.items || [])[optBlocked]} ${optBlocked} left (shared)` : undefined} className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm leading-none ${optBlocked ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-slate-200 hover:bg-orange-100 hover:text-orange-600'}`}>+</button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <OrderLineItem
                      name={item.name}
                      quantity={item.quantity}
                      unitPrice={item.unit_price}
                      modifiers={item.modifiers}
                      specialInstructions={item.specialInstructions}
                      variant="operator"
                      nameSuffix={showCustomise ? (
                        <button onClick={() => openManualItemModal(fullMenuItem!, itemCatModGroups, rowKey)}
                          className="text-[10px] font-bold text-orange-500 border border-orange-200 rounded-md px-1.5 py-0.5 hover:bg-orange-50 shrink-0">
                          ✏ Edit
                        </button>
                      ) : undefined}
                      rightSlot={
                        /* 🔴 THE OPERATOR PRICE OVERRIDE. Writes BOTH fields, on purpose.
                           `unit_price` keeps this panel's running total, line totals and payment
                           button correct with no other change — every one of them reads it.
                           `price_override` is the DECLARATION: it tells the server this figure was
                           set by a human, so the server prices the line from the menu like every
                           other and then honours this instead, and stores it as an override rather
                           than as an ordinary price. Without the second field the server cannot tell
                           a deliberate £4 pizza from a stale or crafted one. */
                        <InlinePriceEditor price={item.unit_price} quantity={item.quantity}
                          onChange={p => setManualItems(prev => prev.map(i => (i.cartKey || i.name) === rowKey ? { ...i, unit_price: p, price_override: p } : i))} />
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ))
      })()}
    </div>
  )

  // ── Operator Add Order menu navigation ──────────────────────────────────────
  // Top-level category TABS (no long scroll) + FLAT alphabetical items. Subcategory headings are
  // NOT used on THIS screen (the customer order page + Menu & Stock editor still group by subcategory
  // — that feature/data is untouched). Same category ordering both render paths used.
  const menuCats = [
    ...categoryOrder.filter(cat => menuGroups[cat]?.length),
    ...Object.keys(menuGroups).filter(cat => !categoryOrder.includes(cat) && menuGroups[cat]?.length),
  ]
  // Default to the first category; self-heal if the active tab disappears (menu reload / now-empty cat).
  const selectedMenuCat = (activeMenuCat && menuCats.includes(activeMenuCat)) ? activeMenuCat : (menuCats[0] ?? null)
  // FLAT sort, structured for a FUTURE "featured / bestseller" tier: items with a higher `sort_priority`
  // (or a `featured` flag) float to the TOP in priority order; the REST are alphabetical by name. No such
  // column exists on menu_items_db today, so both read undefined ⇒ priority 0 for all ⇒ PURE ALPHABETICAL
  // now (the current ask). To enable later: add `sort_priority int` (or `featured boolean`) to
  // menu_items_db, surface it on the MenuItem type + /api/menu select — the comparator already honours it,
  // featured floats up, the rest stay alphabetical, NO re-architecting.
  const sortMenuItems = (items: MenuItem[]) => {
    const priorityOf = (i: MenuItem) => {
      const f = i as { sort_priority?: number; featured?: boolean }
      return Number(f.sort_priority ?? (f.featured ? 1 : 0)) || 0
    }
    return [...items].sort((a, b) => priorityOf(b) - priorityOf(a) || a.name.localeCompare(b.name))
  }
  // Sticky, finger-sized (≥44px) category tab bar. Horizontal-scrolls on a narrow width — never off-screen.
  const categoryTabs = menuCats.length > 1 ? (
    <div className="sticky top-0 z-10 bg-white pt-3 pb-2 mb-2 border-b border-slate-100">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {menuCats.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveMenuCat(cat)}
            className={`shrink-0 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-black uppercase tracking-wide transition-colors active:scale-95 ${
              cat === selectedMenuCat ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}{categoryStocks.find(s => s.category === cat)?.available === false && ' 🔒'}
          </button>
        ))}
      </div>
    </div>
  ) : null

  // Per-event category closed (GATE): items stay tappable so staff can add for the hatch (the submit
  // override prompts "add anyway?"); this banner + the tab 🔒 make the closed state unmistakable.
  const selectedCatClosed = !!selectedMenuCat && categoryStocks.find(s => s.category === selectedMenuCat)?.available === false
  const closedBanner = selectedCatClosed ? (
    <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
      <span aria-hidden>🔒</span>
      <span>{(selectedMenuCat as string).charAt(0).toUpperCase() + (selectedMenuCat as string).slice(1)} is closed for online orders this event — hidden from customers. You can still add for the hatch; you&apos;ll be asked to confirm.</span>
    </div>
  ) : null

  // ── ONE COPY OF EACH ITEM RENDERER, CALLED PER CATEGORY ───────────────────────────────────────────
  // Extracted so the tabs layout and the scroll layout share it. Both used to read `selectedMenuCat`
  // directly; they now take the category as an argument, which is the ONLY change to their bodies.
  // ⚠️ In tabs mode the argument is `selectedMenuCat`, so the rendered output is identical.
  // 🔴 `catSt` and `catBasketQty` are the reason this had to be a parameter rather than a closure: both
  // are per-CATEGORY values computed inside a per-ITEM loop, so in a continuous list they would have
  // been the selected category's stock for every section — wrong "N left" on every tile but one.
  const renderGridItems = (cat: string) => (
        <div className="grid gap-2 grid-cols-2 @sm:grid-cols-3">
          {/* UNIFORM TILE GRID (Square/Toast/Clover POS pattern): equal-width tiles in clean columns, so
              tap targets are consistent and the whitespace reads as an intentional grid. Column count is
              DELIBERATE per orientation and driven by the PANEL width (this menu column is `@container`),
              NOT the viewport — the panel is only 58% of the screen, so viewport `lg:` breakpoints would
              misfire. `@sm` = 24rem/384px container width: iPad landscape panel (~684pt) and portrait
              panel (~476pt) both clear it ⇒ 3 comfortable columns in BOTH orientations (~212pt / ~143pt
              tiles). Below a 384px panel it drops to grid-cols-2 as a graceful floor (phone uses the
              separate menuList, so it never forces oversized tiles). NO reflow on selection: the grid
              track widths are fixed by the container, and the quantity is an ABSOLUTE corner badge (adds
              no width), so selecting only recolours a tile — neighbours can't shift. */}
          {sortMenuItems(menuGroups[cat] || []).map(item => {
            const stock = itemStocks.find(s => s.name === item.name)
            // Sold-out mirrors the SERVER rule (menu route AND-composition): menu-level flag OFF
            // (item.available — standing Settings availability) OR per-event override OFF
            // (stock.available — the sold-out-for-tonight toggle). Read from the SAME optimistically-
            // updated itemStocks slice the stock count uses, so a toggle reflects instantly instead of
            // lagging the 60s menu poll. No event override row ⇒ stock.available undefined ⇒ menu flag wins.
            const isSoldOut = !(item.available ?? true) || stock?.available === false
            const catSt = categoryStocks.find(s => s.category === cat)
            const itemRem = calcStockRemaining(stock?.stock_count ?? null, stock?.orders_count ?? 0)
            const catRem = calcStockRemaining(catSt?.stock_count ?? null, catSt?.orders_count ?? 0)
            const totalInBasket = manualItems.filter(i => i.name === item.name).reduce((s, i) => s + i.quantity, 0)
            // ONE rule with the submit gate (calcAddableRemaining ⟷ checkCeilingShortfall): fold THIS order's
            // basket per axis. catBasketQty = the whole category's in-progress qty (basketByCat, deal slots
            // already folded), so a category cap can't be over-filled by adding 4 of each item. addable = what
            // you can still add; addable<=0 disables the +. (totalInBasket kept for the count pill / lines.)
            const catBasketQty = basketByCat[cat.toLowerCase()] || 0
            const { addable } = calcAddableRemaining({ itemRem, catRem, itemBasketQty: totalInBasket, catBasketQty })
            const isLow = !isSoldOut && addable !== null && addable <= 10
            const atStockLimit = addable !== null && addable <= 0
            if (isSoldOut) return (
              <div key={item.name} className="flex flex-col items-start justify-center gap-0.5 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 cursor-not-allowed opacity-60 min-h-[56px]">
                <span className="text-xs text-slate-500 line-through leading-tight">{item.name}</span>
                <span className="text-[10px] text-red-400 font-bold">sold out</span>
              </div>
            )
            return (
              <button
                key={item.name}
                onClick={() => !atStockLimit && addOrCustomise(item)}
                disabled={atStockLimit}
                className={`relative flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all min-h-[56px] ${
                  atStockLimit ? 'opacity-50 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400'
                  : totalInBasket > 0 ? 'bg-orange-600 border-orange-600 text-white active:scale-95'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-orange-300 hover:bg-white active:scale-95'
                }`}
              >
                {/* Quantity as an ABSOLUTE corner badge — out of the text flow, so it never shifts the name or
                    changes the box width. With the fixed-column grid, selecting an item changes ONLY the
                    colour + this badge: the grid can't reflow, and the resting name sits hard-LEFT with no
                    reserved indent. `pr-6` reserves the corner (constant in both states → no shift) so a long,
                    wrapping name can't run under the badge. */}
                {totalInBasket > 0 && (
                  <span className={`absolute top-1.5 right-2 text-[11px] font-black tabular-nums ${atStockLimit ? 'text-slate-500' : 'text-white/90'}`}>{totalInBasket}×</span>
                )}
                <span className="pr-6 text-left leading-tight">{item.name}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-normal ${atStockLimit ? 'text-slate-400' : totalInBasket > 0 ? 'text-orange-200' : 'text-slate-400'}`}>£{item.price.toFixed(2)}</span>
                  {atStockLimit && <span className="text-[10px] text-red-500 font-black">max</span>}
                  {!atStockLimit && isLow && <span className={`text-[10px] font-black ${totalInBasket > 0 ? 'text-white' : 'text-orange-500'}`}>({addable} left)</span>}
                </div>
              </button>
            )
          })}
        </div>
  )

  const renderListItems = (cat: string) => (
        <div>
          {sortMenuItems(menuGroups[cat] || []).map(item => {
            const stock = itemStocks.find(s => s.name === item.name)
            // Sold-out mirrors the SERVER rule (menu route AND-composition): menu-level flag OFF
            // (item.available — standing Settings availability) OR per-event override OFF
            // (stock.available — the sold-out-for-tonight toggle). Read from the SAME optimistically-
            // updated itemStocks slice the stock count uses, so a toggle reflects instantly instead of
            // lagging the 60s menu poll. No event override row ⇒ stock.available undefined ⇒ menu flag wins.
            const isSoldOut = !(item.available ?? true) || stock?.available === false
            const catSt = categoryStocks.find(s => s.category === cat)
            const itemRem = calcStockRemaining(stock?.stock_count ?? null, stock?.orders_count ?? 0)
            const catRem = calcStockRemaining(catSt?.stock_count ?? null, catSt?.orders_count ?? 0)
            const totalInBasket = manualItems.filter(i => i.name === item.name).reduce((s, i) => s + i.quantity, 0)
            // ONE rule with the submit gate (calcAddableRemaining ⟷ checkCeilingShortfall): fold THIS order's
            // basket per axis. catBasketQty = the whole category's in-progress qty (basketByCat, deal slots
            // already folded), so a category cap can't be over-filled by adding 4 of each item. addable = what
            // you can still add; addable<=0 disables the +. (totalInBasket kept for the count pill / lines.)
            const catBasketQty = basketByCat[cat.toLowerCase()] || 0
            const { addable } = calcAddableRemaining({ itemRem, catRem, itemBasketQty: totalInBasket, catBasketQty })
            const isLow = !isSoldOut && addable !== null && addable <= 10
            const atStockLimit = addable !== null && addable <= 0
            // PER-LINE mobile menu (mirrors Review-order / cartLines): the ADD row's "+" quick-adds a base unit
            // (or opens the modal for a required-group item — addOrCustomise, BYTE-IDENTICAL). Each existing
            // cart LINE of this item then renders as its own row with a cartKey-bound stepper + its extras/notes
            // shown + Edit. Displayed == controlled → nothing strands, and the tile never shows a lying sum.
            const lines = manualItems.filter(i => i.name === item.name)
            const itemModGroups = item.modifierGroups || []
            // Edit shows on EVERY line — the truck can ALWAYS add notes (asymmetric model, backlog #2), and
            // items with extras also get their extras in the modal. (allow_notes is now CUSTOMER-only.)
            return (
              <div key={item.name} className={`py-2 border-b border-slate-50 ${isSoldOut ? 'opacity-60' : ''}`}>
                {/* ADD row — name/price/stock + base "+" quick-add (unchanged addOrCustomise: plain add, or the
                    modal for a required-group item). Adds another BASE unit; per-line rows below own the rest. */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isSoldOut ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400">£{item.price.toFixed(2)}</span>
                      {isSoldOut && <span className="text-[10px] text-red-400 font-bold">sold out</span>}
                      {!isSoldOut && atStockLimit && <span className="text-[10px] text-red-500 font-black">max reached</span>}
                      {!atStockLimit && isLow && <span className="text-[10px] text-orange-500 font-black">{addable} left</span>}
                    </div>
                  </div>
                  {!isSoldOut && (
                    <button
                      onClick={() => !atStockLimit && addOrCustomise(item)}
                      disabled={atStockLimit}
                      title="Add"
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xl leading-none shrink-0 ${atStockLimit ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-orange-100 text-orange-600 active:scale-90'}`}
                    >+</button>
                  )}
                </div>
                {/* PER-LINE rows (operator MOBILE only) — each cart line, keyed by cartKey. ONE compact,
                    vertically-centred row: [stepper] | customisation + note (stacked) | Edit | price. Bespoke
                    inline layout (NOT the shared OrderLineItem, which stacks each mod/note on its own row —
                    too many rows on a phone); desktop cart + Review keep OrderLineItem. Stepper bound to THAT
                    line (adjustManualQty); Edit opens the modal in EDIT mode with this line's cartKey. */}
                {lines.map(line => {
                  const rowKey = line.cartKey || line.name
                  const optBlocked = optionAddBlocked((line.modifiers || []).map(m => m.name))
                  const modLabel = (line.modifiers || []).map(m => `${m.name}${m.price > 0 ? ` +£${m.price.toFixed(2)}` : ''}`).join(', ')
                  const note = line.specialInstructions
                  return (
                    <div key={rowKey} className="flex items-center gap-2 py-1.5 pl-3 mt-1">
                      {/* Stepper (left) */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => adjustManualQty(rowKey, -1)} className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-red-100 hover:text-red-600 text-sm leading-none active:scale-90">−</button>
                        <span className="w-5 text-center font-black text-sm text-slate-900">{line.quantity}</span>
                        <button onClick={() => adjustManualQty(rowKey, 1)} disabled={!!optBlocked} title={optBlocked ? `Only ${buildOptionStockByName(truckMenu?.items || [])[optBlocked]} ${optBlocked} left (shared)` : undefined} className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm leading-none active:scale-90 ${optBlocked ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-slate-200 hover:bg-orange-100 hover:text-orange-600'}`}>+</button>
                      </div>
                      {/* Detail block — STACK each extra on its own line + note beneath (break-words, NEVER
                          truncate: the operator must see exactly what was chosen). rem type sizes scale w/ OS. */}
                      <div className="flex-1 min-w-0">
                        {(line.modifiers || []).map(m => (
                          <p key={m.name} className="text-sm text-slate-700 break-words">{m.name}{m.price > 0 ? ` +£${m.price.toFixed(2)}` : ''}</p>
                        ))}
                        {note && <p className="text-sm italic text-slate-400 break-words">📝 {note}</p>}
                      </div>
                      {/* Edit — PENCIL only (dropped the "Edit" text: horizontal space is scarce and was
                          driving the truncation). Padded ~44px tap target so operator speed isn't hurt.
                          Vertically centred against the detail block, beside the price. */}
                      <button onClick={() => openManualItemModal(item, itemModGroups, rowKey)} aria-label="Edit"
                        className="shrink-0 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center text-slate-400 active:scale-95">✏️</button>
                      {/* Price (right) */}
                      <span className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">£{(line.unit_price * line.quantity).toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
  )

  // ── LAYOUT SWITCH — trucks.add_order_layout ────────────────────────────────────────────────────
  // 🔴 ANYTHING THAT IS NOT EXACTLY 'scroll' IS 'tabs'. Absent (before the migration runs), null, or an
  // unrecognised value all take the path every truck is on today, so Pizzeria Gusto's screen cannot
  // change without its operator picking the other option in Manage > Settings. The identical expression
  // is in the Manage control, so the two surfaces cannot show different answers.
  const addOrderLayout: 'tabs' | 'scroll' = truck?.add_order_layout === 'scroll' ? 'scroll' : 'tabs'

  // ⚠️ `menuCats` IS PASSED STRAIGHT THROUGH — the chips and the sections inside ScrollMenuSections both
  // map over this one array. Do not recompute a category list at either site.
  const menuGrid = addOrderLayout === 'scroll' ? (
    <ScrollMenuSections cats={menuCats} categoryStocks={categoryStocks} renderCategory={renderGridItems} />
  ) : (
    <div>
      {categoryTabs}
      {closedBanner}
      {selectedMenuCat && renderGridItems(selectedMenuCat)}
    </div>
  )

  const menuList = addOrderLayout === 'scroll' ? (
    <ScrollMenuSections cats={menuCats} categoryStocks={categoryStocks} renderCategory={renderListItems} />
  ) : (
    <div>
      {categoryTabs}
      {closedBanner}
      {selectedMenuCat && renderListItems(selectedMenuCat)}
    </div>
  )

  const dealsButton = availableDeals.length > 0 ? (
    <button
      onClick={() => {
        if (availableDeals.length === 1) { setActiveDealBundle(availableDeals[0]); setShowDealsModal(true) }
        else { setActiveDealBundle(null); setShowDealsModal(true) }
      }}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-orange-300 text-orange-600 hover:bg-orange-50 transition-colors text-sm font-bold active:scale-[0.99] mb-4"
    >
      <span>🎁</span>
      <span>{appliedDeals.length > 0 ? '+ Add another deal' : '+ Apply a deal'}</span>
      {appliedDeals.length > 0 && <span className="text-xs text-orange-400 font-normal">({appliedDeals.length} applied)</span>}
    </button>
  ) : null

  // status read via liveEvent — the dedicated status-sync effect is gone (see the note where it was).
  const eventBanner = liveEvent?.status !== 'open' ? (
    <div className="hidden sm:block mb-4">
      {manualEvent ? (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {(manualEvent.venue_name || manualEvent.town) && (
                <p className="text-sm font-bold text-orange-900 truncate">
                  {fmtVenue(manualEvent.venue_name, manualEvent.town)}
                </p>
              )}
              <p className="text-xs text-orange-600 truncate">{(() => {
                const t = new Date().toISOString().split('T')[0]
                const tmrw = new Date(Date.now() + 86400000).toISOString().split('T')[0]
                const d = manualEvent.event_date
                const label = d === t ? 'Today' : d === tmrw ? 'Tomorrow' : new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                return `${label} · ${formatTime(manualEvent.start_time)}–${formatTime(manualEvent.end_time)}`
              })()}</p>
            </div>
            {/* Change event — SHOWN but locked in demo (opens the explainer via openEventPicker's guard). */}
            <button onClick={openEventPicker}
              className={`text-xs font-bold rounded-lg px-2.5 py-1 shrink-0 ${isDemo ? 'text-slate-400 border border-slate-300 cursor-pointer' : 'text-orange-600 border border-orange-300 hover:bg-orange-100 active:scale-95'}`}>
              {isDemo && <span aria-hidden>🔒 </span>}Change
            </button>
          </div>
          {(liveEvent?.status === 'confirmed' || liveEvent?.status === 'closed') && onOpenEvent && (
            // Start / Restart — SHOWN but locked in demo: clicking opens the explainer, never mutates
            // (openEvent in the parent also hard-stops on isDemo as the handler-level backstop).
            <button
              onClick={() => isDemo ? onLockedEventAction?.() : onOpenEvent(manualEvent.id)}
              className={`mt-2 w-full font-bold py-2.5 rounded-xl text-sm transition-all ${isDemo ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-pointer' : 'bg-orange-600 text-white hover:bg-orange-700 active:scale-[0.98]'}`}>
              {isDemo && <span aria-hidden>🔒 </span>}{liveEvent?.status === 'closed' ? 'Restart Event' : 'Start Event'}
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-500">⚠️</span>
            <p className="text-sm font-medium text-amber-800">No event selected</p>
          </div>
          <button onClick={openEventPicker}
            className="text-sm font-semibold text-amber-700 border border-amber-300 bg-white rounded-lg px-3 py-1.5 hover:bg-amber-50 whitespace-nowrap">
            Select event
          </button>
        </div>
      )}
      {isEventEnded && (
        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          ⚠️ This event has ended — you're adding an order after close. Make sure you've selected the right event.
        </div>
      )}
    </div>
  ) : null

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── iPad / desktop: two-column split ── */}
      <div className="hidden md:flex flex-1 min-h-0 -mx-4">

        {/* LEFT — scrollable menu.
            🔴 TWO SHAPES, AND THE 'tabs' ONE IS THE ORIGINAL ELEMENT UNCHANGED. In tabs the pane is a
            single scroller with the event banner and deals button INSIDE it, scrolling away with the
            items — exactly as today, so a truck on the default cannot see a layout change.
            In scroll the pane becomes a flex column: banner + deals `shrink-0` at the top, the menu
            `flex-1 min-h-0 overflow-y-auto` beneath. Start Event is an ACTION, not content, and in a
            list that never ends there is no natural moment for it to come back.
            ⚠️ `@container` MOVES ONTO THE SCROLLER in that shape, because the tiles' `@sm:grid-cols-3`
            is resolved against the nearest container — leaving it on the outer div would still work but
            would measure a box the tiles no longer live in. Padding is split (`px-4 pt-4` / `px-4 pb-4`)
            so the visible inset is the old `p-4` on both halves.
            ⚠️ The RIGHT pane is untouched in both shapes: the cart keeps its own scroller and the
            submit panel stays outside it. Nothing here can make the cart scroll with the items. */}
        {addOrderLayout === 'scroll' ? (
          <div className="w-[58%] flex flex-col min-h-0 border-r border-slate-200">
            <div className="shrink-0 px-4 pt-4">
              {eventBanner}
              {dealsButton}
            </div>
            <div className="@container flex-1 min-h-0 overflow-y-auto px-4 pb-4">
              {truckMenu ? menuGrid : <p className="text-slate-400 text-sm animate-pulse">Loading menu…</p>}
            </div>
          </div>
        ) : (
          <div className="@container w-[58%] min-h-0 overflow-y-auto border-r border-slate-200 p-4">
            {eventBanner}
            {dealsButton}
            {truckMenu ? menuGrid : <p className="text-slate-400 text-sm animate-pulse">Loading menu…</p>}
          </div>
        )}

        {/* RIGHT — cart + submit */}
        <div className="w-[42%] flex flex-col min-h-0 bg-white overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {hasItems ? cartLines : (
              <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-2 select-none">
                <span className="text-4xl">🛒</span>
                <span className="text-sm">Tap items to build order</span>
              </div>
            )}
          </div>
          {submitPanel}
        </div>
      </div>

      {/* ── Phone: single column — the same two shapes, same reasoning as the pane above.
          ⚠️ `pb-24` MOVES ONTO THE SCROLLER in the scroll shape: it is clearance for the fixed bottom
          bar, so it has to sit on the element that scrolls under it, not on a static wrapper.
          ⚠️ On a true phone `eventBanner` is `hidden sm:block` and renders nothing, so the pinned
          header there is the deals button alone (or, with no deals, nothing at all — an empty
          `shrink-0` div of zero height, which is why it needs no conditional). */}
      {addOrderLayout === 'scroll' ? (
        /* ── 🔴 `min-w-0` ON BOTH, AND ONLY THIS SHAPE HAS THE PROBLEM IT SOLVES ────────────────────
           A flex child's `min-width` is `auto`, which means IT CANNOT SHRINK BELOW ITS CONTENT. The
           TABS shape below is a single `overflow-y-auto` box, and a box with overflow on one axis
           computes the other to `auto` too — so it is a scroll container that ABSORBS any wide
           descendant. This shape is a `flex flex-col` whose header child is a PLAIN `shrink-0` div
           with no overflow of its own: a wide descendant there is not absorbed, and the column above
           it cannot shrink to the viewport either. That is the only structural difference between the
           two layouts, and it is the one that matches the hardware evidence.
           🔴 `min-w-0` REMOVES THE WIDTH, IT DOES NOT HIDE IT — the boxes may now shrink to their
           container instead of being forced open by content. No `overflow-x-hidden` anywhere.
           ⚠️ INERT UNLESS SOMETHING IS ACTUALLY FORCING WIDTH. If nothing is, this changes nothing and
           the defect is elsewhere — see docs/add-order-overflow-fix-report.md, which states plainly
           that the wide DESCENDANT was never demonstrated, only the mechanism that would let one
           escape. ⚠️ BOTH BRANCHES ARE `md:hidden`, so nothing at 768px and above can be affected. */
        <div className="md:hidden flex-1 min-h-0 min-w-0 flex flex-col">
          <div className="shrink-0 min-w-0">
            {eventBanner}
            {dealsButton}
          </div>
          {/* ⚠️ `scrollbar-hide` HIDES THE BAR, NEVER THE SCROLLING. The utility (app/globals.css:58)
              sets `scrollbar-width: none` and the WebKit pseudo-element to `display: none` and nothing
              else — the box is still `overflow-y-auto`, so the wheel, the swipe, the keyboard and the
              scroll position all behave exactly as they did. It is the same utility the customer order
              page uses on its category row, so this is the file's existing answer to this, not a new one.
              ⚠️ SCOPED TO THIS ONE-PAGE SCROLLER. The tabs layout's box is untouched — it was not what
              was asked about, and a truck on that layout sees exactly what it saw yesterday. */}
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto scrollbar-hide pb-24">
            {truckMenu ? menuList : <p className="text-slate-400 text-sm animate-pulse">Loading menu…</p>}
          </div>
        </div>
      ) : (
        <div className="md:hidden flex-1 min-h-0 overflow-y-auto pb-24">
          {eventBanner}
          {dealsButton}
          {truckMenu ? menuList : <p className="text-slate-400 text-sm animate-pulse">Loading menu…</p>}
        </div>
      )}

      {/* ── Phone: sticky bottom bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 flex items-center justify-between gap-3 z-20">
        <div>
          <p className="text-sm font-bold text-slate-900">£{manualTotal.toFixed(2)}</p>
          <p className="text-xs text-slate-400">{totalItemCount} item{totalItemCount !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowOrderSheet(true)}
          disabled={!hasItems}
          className="flex-1 max-w-xs bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 active:scale-95"
        >
          Review order →
        </button>
      </div>

      {/* ── Phone: bottom sheet ── */}
      {showOrderSheet && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end" onClick={() => setShowOrderSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full bg-white rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
              <p className="font-black text-slate-900">Confirm order</p>
              <button onClick={() => setShowOrderSheet(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold w-8 h-8 flex items-center justify-center">✕</button>
            </div>
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 max-h-48 overflow-y-auto">
              {cartLines}
            </div>
            {submitPanel}
          </div>
        </div>
      )}

      {/* ── BUZZER GRID (a) — DURING ENTRY ────────────────────────────────────────────────────────
          Non-blocking: the operator opened it deliberately, so a backdrop tap closes it. The order row
          does not exist yet, so targetOrderKey is '' — every number held by a REAL order belongs to
          someone else, which is correct. The PENDING selection travels in `currentNumber`: the grid
          renders it in the taken state ("This order") so reopening the picker cannot show a number as
          free after the operator has chosen it. The chosen number rides into the insert payload. */}
      {showBuzzerPicker && buzzerCount != null && (
        <BuzzerGrid
          open
          buzzerCount={buzzerCount}
          orders={orders}
          eventId={manualEvent?.id ?? null}
          targetOrderKey=""
          targetOrderId=""
          currentNumber={manualBuzzer}
          // keepOpen is the grid's own "this order already had a buzzer when I opened" flag. A FIRST
          // pick assigns and closes as before; once one is set, switching and deselecting both leave
          // the picker up so the operator can see the change, and Done closes it.
          onAssign={(n, keepOpen) => { setManualBuzzer(n); if (!keepOpen) setShowBuzzerPicker(false) }}
          onClose={() => setShowBuzzerPicker(false)}
        />
      )}

      {/* ── BUZZER GRID (b) — THE AFTER-ORDER PROMPT ──────────────────────────────────────────────
          🔴 blocking: no backdrop dismiss, no ✕, "No buzzer" is the only non-assigning exit and it is
          an ACTIVE CHOICE. See the fire site in submitManual for why it sits where it does.
          Both exits resolve the awaited promise so submitManual continues to resetManual(); a failed
          write still resolves — the order is placed and the operator can assign from the card. */}
      {buzzerPrompt && buzzerCount != null && (
        <BuzzerGrid
          open
          blocking
          buzzerCount={buzzerCount}
          orders={orders}
          eventId={manualEvent?.id ?? null}
          targetOrderKey={buzzerPrompt.orderKey}
          targetOrderId={buzzerPrompt.orderId}
          currentNumber={null}
          saving={savingPromptBuzzer}
          onAssign={async (n) => {
            const p = buzzerPrompt
            if (n == null) { setBuzzerPrompt(null); p.resolve(); return }
            setSavingPromptBuzzer(true)
            try {
              // 🔴 ROUTED THROUGH THE DASHBOARD'S saveBuzzer — was a raw fetch, which lost the number
              // offline. set_buzzer writes buzzer_number and NOTHING else; deliberately not `edit`,
              // which would force status:'modified', re-book capacity and email the customer.
              // ⚠️ saveBuzzer owns the toast on both the online and the queued path, so this branch
              // deliberately shows none of its own — two toasts for one tap was the alternative.
              if (!onSaveBuzzer) throw new Error('buzzer save unavailable')
              await onSaveBuzzer(p.orderKey, n)
            } catch {
              // The ORDER IS ALREADY PLACED. Say what failed and let the flow finish — trapping the
              // operator in a modal over a buzzer write would be worse than the missing number.
              showToast('Could not save the buzzer number — add it from the order card', 'error')
            } finally {
              setSavingPromptBuzzer(false)
              setBuzzerPrompt(null)
              p.resolve()
            }
          }}
          onClose={() => { const p = buzzerPrompt; setBuzzerPrompt(null); p.resolve() }}
        />
      )}

      {/* ── Over-capacity confirmation ──────────────────────────────────────────────────────────
          Fires at SUBMIT, off the fresh cache:'no-store' read — never at slot-select (that trigger
          was removed in 448130f and stays removed). Replaces a native window.confirm() that showed
          one fixed sentence and threw away fit.bound_by. INFORMED CONSENT, not a block: the operator
          can always proceed, and their choice is recorded (capacity_ack_at). Nothing has been
          submitted at this point — both buttons decide. */}
      {capacityConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 pt-5 pb-5">
              <h3 className="font-black text-slate-900 text-lg mb-1">
                {capacityConfirm.variant === 'toosoon'
                  ? `${capacityConfirm.slot} is too soon`
                  : capacityConfirm.variant === 'filled'
                    ? `${capacityConfirm.slot} has filled up`
                    : `${capacityConfirm.slot} is over capacity`}
              </h3>

              {capacityConfirm.variant === 'filled' && (
                <p className="text-sm text-slate-600 mb-2">Another order came in while you were adding this one.</p>
              )}

              <p className="text-sm text-slate-600">
                {capacityConfirm.bind.kind === 'lead'
                  ? `There isn't enough time to make this order by ${capacityConfirm.slot}.`
                  : capacityConfirm.bind.kind === 'category'
                    ? `${capacityConfirm.bind.cat} can be made ${capacityConfirm.bind.limit} at a time.${capacityConfirm.windowFrom ? ` Around ${capacityConfirm.windowFrom}–${capacityConfirm.slot}` : ' Here'} it would need ${capacityConfirm.bind.needed}.`
                    : `The oven holds ${capacityConfirm.bind.limit} ${capacityConfirm.unitWord} at a time.${capacityConfirm.windowFrom ? ` Around ${capacityConfirm.windowFrom}–${capacityConfirm.slot}` : ' Here'} it would be making ${capacityConfirm.bind.needed}.`}
              </p>

              {/* Orders already cooking in that window, BY COLLECTION SLOT with their own quantities.
                  Deliberately not an attribution of which order caused the overage — see the 🔴 note
                  in contributingProductionSlots. Variant 'over' only: on 'filled' the point is that
                  something arrived late, and on 'toosoon' the list is meaningless. */}
              {/* THE PROVISIONAL NOTE -- offline placements only. The check ran against the last data
                  this device pulled, so it can miss an order placed since. Never shown online, where the
                  read is fresh and no-store. */}
              {capacityConfirm.stale && (
                <p className="mt-3 text-xs font-semibold text-amber-700">
                  Checked against the last data this device downloaded -- you&apos;re offline, so a newer order may not be counted.
                </p>
              )}
              {capacityConfirm.variant === 'over' && capacityConfirm.contributors.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3 space-y-1">
                  {capacityConfirm.contributors.map(c => (
                    <div key={`${c.slot}-${c.id}`} className="flex justify-between text-sm text-slate-600">
                      <span>#{c.id} · {c.slot}</span>
                      <span className="tabular-nums">{c.qty}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-black text-slate-900 pt-1">
                    <span>This order</span>
                    <span className="tabular-nums">{capacityConfirm.thisOrderQty} {capacityConfirm.unitWord}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => { setManualSlot(''); setCapacityConfirm(null) }}
                  className="flex-1 bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 text-sm"
                >Pick another time</button>
                <button
                  type="button"
                  onClick={() => {
                    const ov = capacityConfirm.override
                    setCapacityConfirm(null)
                    // skipFitCheck=true so the modal can't re-loop; capacityAck=true so the decision
                    // is persisted. `ov` carries any stock override already granted.
                    void submitManual(ov, true, true)
                  }}
                  className="flex-1 bg-orange-600 text-white font-bold py-3 rounded-xl hover:bg-orange-700 text-sm"
                >Place it anyway</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Item modifier modal ── */}
      {itemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setItemModal(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-black text-slate-900 text-lg">{itemModal.item.name}</h3>
                  <p className="text-slate-400 text-sm">£{itemModal.item.price.toFixed(2)} base</p>
                </div>
                <button onClick={() => setItemModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none ml-4 mt-0.5">✕</button>
              </div>
              <div className="space-y-4">
                {sortGroupsRequiredFirst(itemModal.modGroups).map(group => {
                  const isUnmet = modalUnmetGroupIds.includes(group.id)
                  // Shared groupRuleLabel (ONE source across manage modal + both order screens). Amber
                  // colour is the sole unmet cue (mirrors the customer order page).
                  const ruleHint = groupRuleLabel(group)
                  return (
                    <div key={group.id}>
                      <p className="text-xs font-black uppercase tracking-wider mb-2">
                        <span className="text-slate-500">{group.name}</span>
                        {ruleHint && (
                          <span className={`ml-2 font-bold ${isUnmet ? 'text-amber-600' : 'text-slate-400'}`}>· {ruleHint}</span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {group.options.filter(isModifierAvailable).map((opt: ModifierOption) => {
                          const selected = modalMods.some(m => m.name === opt.name)
                          // Basket-aware remaining (§28 gate, mirrored to display). Sold-out when the
                          // basket already drew the pool to 0 — unselectable, but a SELECTED option stays
                          // toggleable so it can be deselected.
                          const rem = optionRemainingFor(opt.name, opt.stock_count)
                          const soldOut = rem != null && rem <= 0
                          const lock = soldOut && !selected
                          return (
                            <button key={opt.id} onClick={() => { if (!lock) toggleModalMod(opt, group) }} disabled={lock}
                              className={`flex items-center gap-1.5 text-sm font-bold px-3.5 py-2 transition-all active:scale-95 border-2 rounded-xl ${selected ? 'bg-orange-600 border-orange-600 text-white' : lock ? 'bg-slate-50 border-slate-200 text-slate-400 line-through cursor-not-allowed opacity-60' : `bg-white text-slate-700 hover:border-orange-300 ${isUnmet ? 'border-amber-300' : 'border-slate-200'}`}`}>
                              <span>{opt.name}</span>
                              {opt.price_adjustment > 0 && <span className={selected ? 'text-orange-200' : 'text-orange-500'}>+£{opt.price_adjustment.toFixed(2)}</span>}
                              {/* "N left" / sold-out (basket-aware) — shared badge, same thresholds as item stock. */}
                              <OptionStockBadge remaining={rem} />
                              {/* Per-option allergens (Stage C) NOT shown on the operator selection (V7.8 §25) —
                                  the operator knows their menu; still carried onto the line for the email. */}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {/* TRUCK notes are ALWAYS available (asymmetric model, backlog #2): un-gated from the category
                    allow_notes flag, which now controls CUSTOMER notes only. The operator may need to note an
                    allergy / "no onions" / "extra crispy" on ANY item regardless of config. For a no-extras item
                    (e.g. a drink) this is the modal's only body row → it renders cleanly on its own. */}
                <div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Note <span className="font-normal normal-case text-slate-400">— optional</span></p>
                  <textarea value={modalNotes} onChange={e => setModalNotes(e.target.value.slice(0, 60))}
                    placeholder="e.g. No onions, well done…" rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none" />
                  <p className="text-right text-[10px] text-slate-400 mt-0.5">{modalNotes.length}/60</p>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 pt-2 border-t border-slate-100">
              <button onClick={confirmAddFromModal}
                disabled={modalUnmetGroupIds.length > 0}
                className="w-full bg-orange-600 text-white font-black py-3.5 rounded-xl hover:bg-orange-700 transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
                {modalUnmetGroupIds.length > 0
                  ? 'Choose required options'
                  : `${itemModal.editCartKey ? 'Save changes' : 'Add'} · £${(itemModal.item.price + modalMods.reduce((s, m) => s + m.price, 0)).toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Deals modal ── */}
      {showDealsModal && (
        <DealsModal
          bundles={activeDealBundle ? [activeDealBundle] : availableDeals}
          menuItems={truckMenu?.items || []}
          menuCategories={truckMenu?.categories || []}
          basketItems={manualItems.map(i => ({ name: i.name, quantity: i.quantity, unit_price: i.unit_price, cartKey: i.cartKey, modifiers: i.modifiers, specialInstructions: i.specialInstructions }))}
          existingDeals={appliedDeals}
          onApply={(deal, slots, price, discount, rawSlots, modifierExtra, slotModifiers, slotNotes) => {
            const itemsTakenFromBasket = dealConsumedCartKeys(rawSlots)
            setManualItems(prev => consumeBasketItemsForDeal(prev, rawSlots))
            setAppliedDeals(prev => [...prev, {
              bundle: { ...deal, available: true, start_time: deal.start_time ?? null, end_time: deal.end_time ?? null },
              slots, itemsTakenFromBasket, modifierExtra, slotModifiers, slotNotes,
            }])
            setShowDealsModal(false)
            setActiveDealBundle(null)
          }}
          onClose={() => { setShowDealsModal(false); setActiveDealBundle(null) }}
        />
      )}


      {/* ── Event picker sheet ── */}
      {showEventPicker && (() => {
        const todayIso = new Date().toISOString().split('T')[0]
        const fmtEvDate = (d: string) => {
          const tmrw = new Date(Date.now() + 86400000).toISOString().split('T')[0]
          if (d === todayIso) return 'Today'
          if (d === tmrw) return 'Tomorrow'
          return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        }
        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowEventPicker(false)}>
            <div className="bg-white rounded-2xl w-full max-w-sm mx-auto max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
                <p className="font-black text-slate-900 text-base">Select event</p>
                <button onClick={() => setShowEventPicker(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
              <div className="p-3 space-y-2">
                {upcomingEvents.length > 0
                  ? upcomingEvents.map(ev => {
                    const isSelected = manualEvent?.id === ev.id
                    const isFuture = ev.event_date > todayIso
                    // EVENT-SWITCH GATE: offline, an event not loaded this session has no cached data → block
                    // switching to it (grey + disabled + "Reconnect to load"). Online / current event → allowed.
                    const blocked = isOffline && !isSelected && !!isEventLoaded && !isEventLoaded(ev.id)
                    return (
                      <button key={ev.id} disabled={blocked}
                        onClick={() => { if (blocked) return; if (manualEvent && manualEvent.id !== ev.id) resetManual(); setManualEvent(ev); setShowEventPicker(false); fetchManualSlots(ev.event_date, ev.start_time, ev.end_time, ev.id); setManualSlot(''); onEventChange?.(ev.id) }}
                        className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${blocked ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed' : isSelected ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-200 hover:bg-orange-50/50'}`}>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900 flex-1">{fmtEvDate(ev.event_date)} · {formatTime(ev.start_time)}–{formatTime(ev.end_time)}</p>
                          {blocked && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 flex-shrink-0">📴 Reconnect to load</span>}
                          {ev.status === 'closed' && <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 flex-shrink-0">● Finished</span>}
                          {ev.status === 'open' && <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 flex-shrink-0">● Live</span>}
                          {isFuture && ev.status !== 'closed' && ev.status !== 'open' && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 flex-shrink-0">Future</span>}
                        </div>
                        {(ev.venue_name || ev.town) && <p className="text-xs text-slate-500 mt-0.5">{fmtVenue(ev.venue_name, ev.town)}</p>}
                        {isSelected && <span className="text-[10px] font-black text-orange-600 uppercase tracking-wide">Selected</span>}
                      </button>
                    )
                  })
                  : (eventsLoading || !eventsLoaded)
                    // S5: skeleton while loading OR before any successful load (incl.
                    // a failed fetch) — never flash "No events" in those states.
                    ? [0, 1, 2].map(i => <div key={i} className="h-[58px] rounded-xl bg-slate-100 animate-pulse" />)
                    // Only after a confirmed-empty successful load:
                    : <p className="text-sm text-slate-400 text-center py-6">No upcoming events found</p>}
              </div>

              {/* Warning when a future event is selected */}
              {manualEvent && manualEvent.event_date > todayIso && (
                <div className="mx-3 mb-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <span className="text-amber-500 flex-shrink-0 text-sm">⚠️</span>
                  <p className="text-xs text-amber-700">
                    {fmtEvDate(manualEvent.event_date)} event selected. Orders will appear on the order screen when the event opens.
                  </p>
                </div>
              )}

              {/* Info when today's confirmed (not yet open) event is selected */}
              {manualEvent && manualEvent.event_date === todayIso && liveEvent?.status === 'confirmed' && (
                <div className="mx-3 mb-2 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                  <span className="text-blue-500 flex-shrink-0 text-sm">ℹ️</span>
                  <p className="text-xs text-blue-700">
                    Today's event — not yet open for orders. Orders will be queued and visible when you open the event.
                  </p>
                </div>
              )}

              <div className="p-3 border-t border-slate-100">
                <button onClick={() => setShowEventPicker(false)} className="w-full border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 font-medium hover:bg-slate-50">Done</button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
