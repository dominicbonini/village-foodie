'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, use } from 'react';
import { soldOutRefusalMessage } from '@/lib/payments/sold-out-copy';
import { isValidEmail, isValidUKPhone } from '@/lib/contact-validation'
import { isDemoIdentifier, displayTruckName } from '@/lib/demo'
import { DemoModeBanner } from '@/components/DemoModeBanner'
import { DemoGetStarted } from '@/components/DemoGetStarted'
import { getBundleSlotCategories as getSlotCats, calculateDealOriginalPrice as calcOrigPrice } from '@/lib/deal-utils'
import { DealsModal } from '@/components/dashboard/DealsModal'
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { calculateOrderTotal, calculateDealOriginalPrice, formatModifiers } from '@/lib/order-calculations';
import { OrderLineItem } from '@/components/dashboard/OrderLineItem';
import TruckListCard from '@/components/TruckListCard';
import { SpiceLevel } from '@/components/SpiceLevel';
import { AllergenChip, DietaryChip } from '@/components/MenuAllergenChips';
import type { VillageEvent } from '@/types';
import { cleanupDealsForItem, groupByCategory, groupBySubcategory, consumeBasketItemsForDeal, dealConsumedCartKeys, tallyBasketOptionQtys, buildOptionStockByName, optionDrawBlocked, optionRemaining } from '@/lib/basket-utils';
import { calcAddableRemaining } from '@/lib/stock-utils';
import { OptionStockBadge } from '@/components/OptionStockBadge';
import { getAsapSlot, isSlotPast } from '@/lib/slot-utils';
import { projectBackwardOccupancy, fitOrderBackward, earliestBackwardFitSlot } from '@/lib/slot-availability';
import { getCatConfig, catCookSecs, calcQueueAwareReadySecs } from '@/lib/prep-utils';
import { hasFeature } from '@/lib/features';
import { formatTime, localTodayIso, getNowMinsInTz, getLocalDateInTz } from '@/lib/time-utils';
import { preorderOpenDate, formatPreorderOpenLabel } from '@/lib/preorder';
import { isModifierAvailable } from '@/lib/modifier-utils';
import { toggleWithGroupRules, validateModifierSelection, minRequiredForGroup, sortGroupsRequiredFirst, groupRuleLabel } from '@/lib/modifier-rules';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  name: string; description?: string; price: number; available?: boolean; category: string; subcategory_id?: string | null; stock_remaining?: number | null; stock_bound?: 'item' | 'category' | null; item_remaining?: number | null; category_remaining?: number | null; image?: string | null; photo_url?: string | null; allergens?: string[]; dietary?: string[]; spiciness?: number | null; modifierGroups?: ModifierGroup[]; preorderLabel?: string | null; preorderState?: 'before' | 'closed_pending' | 'not_open_yet' | null
}
interface UpsellRule {
  id: string; trigger_category: string; suggest_category: string; max_suggestions: number; show_at_checkout: boolean
}
interface Bundle {
  name: string; description: string
  original_price: number | null  // null = calculate dynamically from slot items
  bundle_price: number
  available: boolean
  start_time: string | null; end_time: string | null
  slot_1_category: string | null; slot_2_category: string | null
  slot_3_category: string | null; slot_4_category: string | null
  slot_5_category: string | null; slot_6_category: string | null
}
interface DiscountCode { code: string; type: 'pct' | 'fixed'; value: number; active: boolean }
interface ModifierOption { id: string; name: string; price_adjustment: number; available?: boolean; allergens?: string[]; dietary?: string[]; stock_count?: number | null }
interface ModifierGroup { id: string; name: string; hide_name?: boolean; options: ModifierOption[]; is_required?: boolean; min_choices?: number; max_choices?: number }
interface TruckMenu { categories?: Array<{ id: string; name: string; prep_secs?: number | null; batch_size?: number | null; allowNotes?: boolean; modifierGroups?: ModifierGroup[]; subcategories?: Array<{ id: string; name: string; sort_order?: number }> }>; items: MenuItem[]; upsell_rules: UpsellRule[]; bundles: Bundle[]; codes: DiscountCode[] }
interface TruckData { id: string; name: string; logo: string | null; mode: 'village' | 'pub'; venue_name: string | null; time_selection_enabled?: boolean; paused?: boolean; pauseReason?: 'manual' | 'offline' | 'account_closing' | null; extra_wait_mins?: number; plan: 'starter' | 'pro' | 'max'; allergen_info_url?: string | null; allergen_info_text?: string | null; allergen_display_mode?: 'per_dish' | 'card' | 'both' | null; ordering_available?: boolean; allergensVerified?: boolean; preorder_open_rule?: string | null;
  /** 🔴 Whether to OFFER a card option, from /api/menu. Absent/false ⇒ Pay-at-Hatch, silently, exactly
   *  as before. A RENDERING HINT ONLY — lib/payments/authorize re-reads readiness server-side. */
  card_payments_ready?: boolean }
interface EventData {
  id: string            // truck_events.id — the event the customer is ordering against
  date: string          // dd/mm/yyyy
  date_iso: string      // yyyy-mm-dd
  date_friendly: string
  start_time: string
  end_time: string
  venue_name: string
  village: string
  postcode?: string
  notes: string
  status?: string       // 'open' = operator-started/auto-opened = LIVE; else Pre-order. From /api/events.
  opened_at?: string | null
}

interface BasketItem {
  menuItem: MenuItem
  quantity: number
  modifiers: { name: string; price: number; allergens?: string[]; dietary?: string[] }[]
  specialInstructions: string
  cartKey: string
}
interface AppliedDeal { bundle: Bundle; slots: Record<string, string>; itemsTakenFromBasket: string[]; modifierExtra?: number; slotModifiers?: Record<string, { name: string; price: number }[]>; slotNotes?: Record<string, string> }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBundleAvailabilityMessage(b: Bundle): string | null {
  if (!b.start_time && !b.end_time) return null
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  if (b.start_time) {
    const [h, m] = b.start_time.split(':').map(Number)
    if (cur < h * 60 + m) return `Available from ${formatTime(b.start_time)}`
  }
  if (b.end_time) {
    const [h, m] = b.end_time.split(':').map(Number)
    if (cur > h * 60 + m) return `Available until ${formatTime(b.end_time)} — no longer available`
  }
  return null
}

// Calculate the original price for a deal dynamically from chosen slot items
function calcDealOriginalPrice(deal: AppliedDeal, menuItems: MenuItem[]): number {
  // If the bundle has a fixed original_price, use it
  if (deal.bundle.original_price !== null && deal.bundle.original_price > 0) {
    return deal.bundle.original_price
  }
  // Otherwise use shared utility to calculate from slots
  return calcOrigPrice(deal.slots, menuItems)
}

// ── 🔴 STRIPE.JS, LOADED FROM STRIPE'S OWN CDN. NOT AN npm PACKAGE, AND NOT BY CHOICE. ─────────────
// Stripe REQUIRES js.stripe.com to be the source: bundling Stripe.js breaks PCI scope and Stripe will
// not support it. `@stripe/stripe-js` is a ~2kB loader around exactly this script tag, and
// `@stripe/react-stripe-js` is a context wrapper around `elements.create()`. Neither is in package.json,
// and neither is needed — this build adds ZERO dependencies and talks to the same global object those
// packages would have handed back.
//
// ⚠️ ONE PROMISE, MEMOISED AT MODULE SCOPE. Mounting the Element twice (a re-render, a retry after a
// decline) must not inject a second script tag; every caller awaits the same load.
/** The slice of Stripe.js this page uses. Structural, hand-written, and deliberately narrow: there is no
 *  npm package to import types from, and a wide `any` on a money path is exactly what a type is for. */
type StripeElement = { mount: (el: HTMLElement) => void; unmount: () => void; on: (ev: string, fn: () => void) => void }
type StripeElements = { create: (kind: string, opts?: Record<string, unknown>) => StripeElement }
type StripeJs = {
  elements: (opts: Record<string, unknown>) => StripeElements
  confirmPayment: (opts: Record<string, unknown>) => Promise<{ error?: { code?: string; message?: string } }>
}
type StripeCtorFn = (pk: string, opts?: { stripeAccount?: string }) => StripeJs

let stripeJsPromise: Promise<StripeCtorFn> | null = null
function loadStripeJs(): Promise<StripeCtorFn> {
  if (stripeJsPromise) return stripeJsPromise
  stripeJsPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('no window')); return }
    const w = window as unknown as { Stripe?: StripeCtorFn }
    if (w.Stripe) { resolve(w.Stripe); return }
    const existing = document.querySelector('script[src^="https://js.stripe.com/v3"]') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve((window as unknown as { Stripe: StripeCtorFn }).Stripe))
      existing.addEventListener('error', () => reject(new Error('Stripe.js failed to load')))
      return
    }
    const el = document.createElement('script')
    el.src = 'https://js.stripe.com/v3/'
    el.async = true
    el.onload = () => resolve((window as unknown as { Stripe: StripeCtorFn }).Stripe)
    el.onerror = () => reject(new Error('Stripe.js failed to load'))
    document.head.appendChild(el)
  })
  return stripeJsPromise
}

/** What the server hands back when a card order needs authorising. No order exists while this is set. */
type PendingPayment = {
  clientSecret: string
  /** 🔴 THE BASKET THIS AUTHORISATION IS FOR. Compared on reopen: same ⇒ re-present it, different ⇒
   *  cancel it and authorise afresh. An intent is for one amount and one order; presenting it against
   *  anything else would charge the wrong thing. */
  fingerprint: string
  /** The connected account the intent lives on. Stripe.js MUST be initialised with it (direct charge). */
  stripeAccount: string
  /** The DRAFT's key — which becomes the order's key on promotion, so it is also the confirmation URL. */
  orderKey: string
  totalPence: number
}

const HOURS = Array.from({ length: 13 }, (_, i) => String(i + 9).padStart(2, '0'))
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Shared pre-order label for a GROUP (category or sub-category): returns the label only when EVERY
// available item in the group is an enabled pre-order item of the SAME state. Config is global so the
// per-item strings are identical — the group label is just that shared string. null ⇒ render per-item
// labels only. Sold-out (available:false) items are hidden, so they don't block the group label.
function groupPreorderLabel(
  items: Array<{ available?: boolean }>,
): { label: string; state: 'before' | 'closed_pending' | 'not_open_yet' } | null {
  const avail = items.filter(it => (it.available ?? true))
  if (avail.length === 0) return null
  const read = (it: unknown) => it as { preorderLabel?: string | null; preorderState?: 'before' | 'closed_pending' | 'not_open_yet' | null }
  const label = read(avail[0]).preorderLabel ?? null
  const state = read(avail[0]).preorderState ?? null
  if (!label || !state) return null
  const allSame = avail.every(it => (read(it).preorderLabel ?? null) === label && (read(it).preorderState ?? null) === state)
  return allSame ? { label, state } : null
}

function makeCartKey(itemName: string, mods: { name: string }[], notes?: string): string {
  const parts: string[] = []
  const modStr = [...mods].map(m => m.name).sort().join('|')
  if (modStr) parts.push(modStr)
  const noteStr = (notes || '').trim()
  if (noteStr) parts.push(`note:${noteStr}`)
  return parts.length > 0 ? `${itemName}::${parts.join('::')}` : itemName
}

// Adapter: order-page EventData → the shared VillageEvent shape TruckListCard renders, so the order
// page's event cards match the truck profile page exactly (DRY — one card component, one look).
function eventToVillage(e: EventData, truckName: string): VillageEvent {
  return {
    id: e.id,
    date: e.date,                 // dd/mm/yyyy — what TruckListCard's formatStandardDate expects
    startTime: e.start_time,
    endTime: e.end_time,
    truckName,
    venueName: e.venue_name,
    village: e.village || undefined,
    postcode: e.postcode || undefined,   // "village · POSTCODE" line — matches the profile card
    status: e.status,             // 'open' ⇒ the "● Live" badge
    notes: e.notes || undefined,
    source: 'operator',           // /api/events returns confirmed/open OPERATOR events
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

// 🔴 TWO MESSAGES FOR "OUR ROUTE DID NOT ANSWER", BECAUSE THE CUSTOMER'S SITUATION IS NOT THE SAME.
// Established by walking app/api/orders/submit/route.ts, not assumed:
//
//   PAY AT THE TRUCK — this route INSERTS the order row itself. A timeout after that point leaves a
//   real, ordinary-looking order on the operator's board while the customer was told nothing. Telling
//   them it failed would send them to re-order food the kitchen is already making.
//
//   CARD — `if (payByCard === true)` (:743-857) is a CLOSED BRANCH: all four exits are `return`s, and
//   the terminal one at :850 is unconditional. ":846 THE ONLY SUCCESSFUL EXIT ON THIS BRANCH, AND IT
//   CREATES NO ORDER." So no order row can exist, and because the response never arrived the browser
//   never mounted the Payment Element — the intent is created but never confirmed, so no money moves.
//   ⚠ THE ROUTE'S OWN COMMENT AT :739-742 SAYS IT "falls through to the pay-at-hatch path" when a card
//   cannot be taken. IT DOES NOT — both failure paths return a 503 (:819, :840). The comment is stale.
//   The claim below depends on that, which is why it was walked rather than read.
//
// 🔴 AND THE STRONG CLAIM IS WITHHELD ON A RETRY. `payment` is set only after a PREVIOUS submit
// returned a clientSecret (:2107), so when it is non-null the customer has already been shown a Payment
// Element and may have paid on it — the supersede logic explicitly handles a `prior.promoted_at`
// (:758), i.e. an already-paid draft. In that case we cannot say no money moved, so we do not.
const SUBMIT_UNCONFIRMED_CARD =
  'We couldn’t place your order. You haven’t been charged and no order was created — please try again.'
const SUBMIT_UNCONFIRMED_CHECK =
  'We couldn’t confirm your order went through. It may already be on the truck’s screen — please check with them before ordering again.'

export default function OrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  // A demo truck's SLUG carries the `demo-` prefix (lib/demo.ts), so the page needs no extra data.
  const isDemo = isDemoIdentifier(slug)
  // Per-event deep-link (hatchgrab "Order now" flow). ?event_id present → scope the page to that
  // one truck_events row (single-event card + "Change"). Absent → the order-entry schedule:
  // a single-event truck auto-selects; a multi-event truck shows the picker to choose from.
  const searchParams = useSearchParams()
  const eventIdParam = searchParams.get('event_id')
  // ── 🔴 THE CONFIRMATION DEEP-LINK. `?confirm=<order_key>` ────────────────────────────────────────
  // Present ⇒ this page render is a RECEIPT, not an order form. It is read from the SAME searchParams
  // object `event_id` already uses, so nothing about how this component reads the query string changes
  // and no Suspense boundary is introduced.
  // 🔴 IT IS AN IDENTIFIER, NOT A CLAIM. It says WHICH order to show and nothing else — never that the
  // order is paid, never that it exists, never that it belongs to this truck. All three are answered by
  // the server. This is the lesson of `?paid=1` on /order/[id]/manage, which was written into a URL and
  // then correctly ignored by every reader.
  const confirmOrderKey = searchParams.get('confirm')
  // 🔴 THE REFUSAL MESSAGE, CARRIED BACK FROM /api/payments/return. The server composed it; this only
  // reads it. Present ONLY when an authorisation was taken and the order could not be placed — the
  // authorisation has already been cancelled by then, which is what the sentence tells the customer.
  const paymentFailedParam = searchParams.get('payment_failed')

  // SAFETY NET ONLY — the spy lock is released by ARRIVAL, by touch/wheel, and by scrollend; this
  // fires only if none of those happen (e.g. a scrollIntoView that silently does nothing). Generous
  // on purpose: with the real exits handled directly a late release costs nothing, whereas a tight
  // timer would reintroduce the mid-flight re-arm it exists to prevent.
  const SPY_LOCK_SAFETY_MS = 2000

  // ── THE STICKY STACK ────────────────────────────────────────────────────────────────────────────
  // Bars pin in this order, each offset by everything above it:
  //   page header      sticky top-0            h-[60px]   z-50   (Hdr)
  //   DEMO MODE banner sticky top-[60px]       ~46px      z-40   (demo only — Hdr)
  //   status banners   sticky HEADER_H(+demo)             z-40   (time-not-set / closed / paused)
  //   category tabs    sticky HEADER_H(+demo)  61px       z-30   (multi-category menus only)
  //   subcat headings  sticky the above + 61px            z-20
  // Everything below the banner used to be hardcoded at top-[60px] / top-[121px], which counted the
  // header but NOT the demo banner — so in demo every one of those bars pinned UNDERNEATH the banner
  // and its first line was clipped. NON-DEMO IS UNAFFECTED: demoBannerH contributes 0, and the values
  // resolve to exactly the 60 / 121 they always were.
  const HEADER_H = 60   // Hdr's h-[60px]
  const TABBAR_H = 61   // py-2 (16) + min-h-[44px] button + 1px border
  const demoBannerRef = useRef<HTMLDivElement | null>(null)
  // MEASURED, not hardcoded. The banner is 46px today (py-2 ×2 + min-h-[1.75rem] + border-b-2), but every
  // one of those is a rem, so OS/browser text scaling changes it — the same class of bug the header logo
  // was pinned to fixed px for (see Hdr). 46 is the first-paint fallback so the offset is right before the
  // observer fires, then measurement takes over and self-corrects if the banner is ever restyled.
  const [demoBannerH, setDemoBannerH] = useState(46)
  useEffect(() => {
    const el = demoBannerRef.current
    if (!isDemo || !el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setDemoBannerH(el.getBoundingClientRect().height))
    ro.observe(el)
    setDemoBannerH(el.getBoundingClientRect().height)
    return () => ro.disconnect()
  }, [isDemo])
  const stickyTop = HEADER_H + (isDemo ? demoBannerH : 0)

  // ── A1 FIX: THE STATUS BANNERS AND THE CHIP BAR ARE NOW MEASURED TOO ────────────────────────────
  // 🔴 `stickyTop` ABOVE IS UNCHANGED AND MUST STAY THAT WAY. It is where the STATUS BANNERS pin, so
  // folding their own height into it would pin them below themselves — a feedback loop, not a fix.
  // The bug was one level down: the CHIP BAR also pinned at `stickyTop`, in the same band as the
  // banners and at a LOWER z-index (z-30 vs z-40), so whenever a closed / paused / time-not-set
  // banner was showing it drew straight over the pinned chip bar. Live on Pizzeria Gusto today.
  // So there are now three pin lines, each the one above it plus what that one occupies:
  //   stickyTop   = header + demo banner            → where the STATUS BANNERS pin (unchanged)
  //   chipBarTop  = stickyTop + statusBannerH       → where the CHIP BAR pins        (the A1 fix)
  //   pinnedTop   = chipBarTop + tabBarH (if shown) → the readable top: sub-headings and jump targets
  // ⚠️ THREE REFS, NOT ONE WRAPPER. Wrapping the banners in a div would make that div their sticky
  // containing block, so each would stop sticking once the wrapper scrolled past — it would break the
  // banners to measure them. They are measured individually and SUMMED.
  // ⚠️ THE SUM IS THE SAFE DIRECTION when two banners are somehow live at once (time-not-set AND
  // paused is reachable). They pin at the same offset, so they overlap and the true band is the max,
  // not the sum — an over-estimate leaves a GAP above a heading, an under-estimate hides it behind a
  // banner. That banner-on-banner overlap is a separate pre-existing defect and is NOT fixed here.
  const timeBannerRef = useRef<HTMLDivElement | null>(null)
  const closedBannerRef = useRef<HTMLDivElement | null>(null)
  const pausedBannerRef = useRef<HTMLDivElement | null>(null)
  const tabBarRef = useRef<HTMLDivElement | null>(null)
  const [statusBannerH, setStatusBannerH] = useState(0)
  // ⚠️ TABBAR_H (61) IS THE FIRST-PAINT FALLBACK ONLY, NOT THE VALUE. The bar's button is
  // `min-h-[44px]` and its padding is rem, so OS text scaling moves it — the same class of bug
  // demoBannerH is measured for, left behind in this one constant. Measurement takes over on mount.
  const [tabBarH, setTabBarH] = useState(TABBAR_H)
  const chipBarTop = stickyTop + statusBannerH

  const [truck, setTruck] = useState<TruckData | null>(null)
  // CUSTOMER-FACING name — the stored name minus any trailing "(code)". A demo truck is stored as
  // "Demo Kitchen (ce1kh2)" so concurrent demos stay tellable apart in admin and in the DB; the code is
  // meaningless to a customer and reads as a serial number on a business. Display only — nothing here
  // writes trucks.name. See displayTruckName in lib/demo.ts. Use this EVERYWHERE the customer sees the
  // name on this page; `truck.name` stays the raw value for anything that isn't display.
  const truckName = displayTruckName(truck?.name)
  const [menu, setMenu] = useState<TruckMenu | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)  // customer menu category tab

  const [showAllergenModal, setShowAllergenModal] = useState(false)
  const [events, setEvents] = useState<EventData[]>([])
  const [event, setEvent] = useState<EventData | null>(null)
  // ⚠️ INITIALISED FROM THE PARAM, not set inside the effect below. A confirmation render never loads
  // events, so it must not start in a loading state — and doing that here rather than with a setState
  // in the effect avoids a cascading render (react-hooks/set-state-in-effect).
  const [eventLoading, setEventLoading] = useState(!confirmOrderKey)
  const [noEvents, setNoEvents] = useState(false)
  // Events fetch FAILED (after auto-retries) — set only on the failure paths, so the render shows a
  // "couldn't load — tap to retry" card instead of a silent blank body. Bumping reloadKey re-runs
  // the events effect (the Retry button); success clears eventsError.
  const [eventsError, setEventsError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Non-destructive "orders paused" notice on a submit 423 — keeps the basket + order UI
  // (unlike `error`, which renders the page-replacing error view).
  const [pauseNotice, setPauseNotice] = useState<string | null>(null)
  // Non-destructive "just sold out" notice on a submit 409 (atomic stock guard) — keeps the
  // basket (capped to what's left) so the customer can review + re-submit. Customer hard stop.
  const [stockNotice, setStockNotice] = useState<string | null>(null)
  // 🔴 SEPARATE FROM stockNotice ON PURPOSE, AND NOT A SECOND ERROR SURFACE — the SAME 409, the same
  // handler, the same menu re-fetch. It exists only because stockNotice is rendered INSIDE a sentence
  // ("Sorry — … now. We've updated your order …") that is written for a fragment and promises a
  // basket capping. A menu-change refusal caps nothing and arrives as a complete sentence, so it must
  // render on its own. Sharing the state would have meant rewording the stock notice, which is correct
  // as it stands and which real customers see far more often.
  const [menuChangedNotice, setMenuChangedNotice] = useState<string | null>(null)
  // 🔴 THE SOLD-OUT REFUSAL ON THE PAY-AT-HATCH PATH, AND IT IS A WHOLE SENTENCE LIKE THE CARD ONE.
  // Separate from stockNotice because that one is a FRAGMENT inside "Sorry — {x} now. We've updated your
  // order — please review and confirm", written for a CAP ("only 2 left"), and separate from
  // menuChangedNotice because that describes a different event. Rendered at the TOP of the sheet beside
  // the card refusal, for the same reason: a refusal the customer must act on cannot be below the fold.
  const [soldOutNotice, setSoldOutNotice] = useState<string | null>(null)
  // 🔴 THE ONE MESSAGE THAT REACHES A CUSTOMER WHOSE CARD WAS AUTHORISED FOR AN ORDER WE COULD NOT
  // PLACE. Set from the `payment_failed` query parameter that /api/payments/return redirects with, and
  // never composed here: the server built the sentence, so the webhook path logs the identical wording.
  // ⚠️ SEPARATE FROM THE OTHER NOTICES because it is not about the basket. Nothing was capped and
  // nothing sold out on this page — money was authorised elsewhere and released, and the sentence has
  // to lead with that.
  // ⚠️ SEEDED FROM THE URL IN THE INITIALISER, not in an effect — calling setState in an effect body
  // trips react-hooks/set-state-in-effect and causes a cascading render. Same shape as confirmLoading.
  const [paymentFailedNotice, setPaymentFailedNotice] = useState<string | null>(paymentFailedParam)

  // ── 🔴 THE IN-PAGE CARD PAYMENT. THREE STAGES AND NOTHING ELSE. ─────────────────────────────────
  //   idle        no card payment in flight (also the state after a success, which navigates away)
  //   mounting    we have a client secret; Stripe.js is loading and the Element is being mounted
  //   ready       the Element is on screen and the customer can pay
  //   authorising confirmPayment is in flight — the ONE state where the button must be inert
  //   failed      declined, or the setup failed. THE BASKET SURVIVES; they can retry or pay at the truck
  // ⚠️ `payment` being non-null is what gates the four background behaviours below (poll, tick, slots on
  // focus return, and the slots fetch itself) — see each of them.
  const [payment, setPayment] = useState<PendingPayment | null>(null)
  const [payStage, setPayStage] = useState<'idle' | 'mounting' | 'ready' | 'authorising' | 'failed'>('idle')
  const [payError, setPayError] = useState<string | null>(null)
  // Stripe's own objects, held in refs rather than state: they are not rendered and must not re-trigger
  // the mount effect.
  const stripeRef = useRef<StripeJs | null>(null)
  const elementsRef = useRef<StripeElements | null>(null)

  // ── 🔴 THE PAYMENT STAGE IS SEPARATE FROM THE AUTHORISATION IT SHOWS. ───────────────────────────
  // `payment` is the AUTHORISATION — a client secret and a PaymentIntent that exist at Stripe and cost
  // real money to replace. `stageOpen` is merely whether the customer is LOOKING at it.
  // 🔴 CLOSING THE STAGE MUST NOT DESTROY THE AUTHORISATION. That is the entire reopen fix: the old code
  // had one flag doing both jobs, so any close either threw the intent away or (worse, and what actually
  // happened) left it behind with a detached Element and an enabled Pay button.
  const [stageOpen, setStageOpen] = useState(false)

  // 🔴 THE HOST NODE IS STATE, NOT A REF, AND THAT IS THE FIX FOR "IT DID NOT RE-MOUNT". ────────────
  // A `useRef` is invisible to the dependency array: when the stage closed and reopened, React created a
  // BRAND-NEW div and quietly repointed the ref, and the mount effect — keyed on the client secret,
  // which had not changed — never re-ran. The customer got an empty box with a live Pay button.
  // A callback ref writing to STATE makes the node's identity a real dependency: a new div is a new
  // value, the effect re-runs, and the Element mounts into the node that is actually on screen. Setting
  // it to null on detach is what fires the teardown.
  const [paymentBoxEl, setPaymentBoxEl] = useState<HTMLDivElement | null>(null)

  // 🔴 THE PAY BUTTON'S ONE PRECONDITION. Set ONLY by Stripe's own `ready` event, cleared ONLY by the
  // single teardown. Never inferred from `payStage`, which is about the flow rather than the DOM — it
  // was a stale `payStage: 'ready'` over a detached Element that turned a cosmetic bug into a failed
  // payment attempt.
  const [elementReady, setElementReady] = useState(false)
  // ── 🔴 GATE 1 of 4 — THE IN-MEMORY BASKET, AND IT NEEDED NO GATE AT ALL. ───────────────────────
  // The earlier audit listed the basket as unmount-dependent: hosted Checkout navigated the browser away
  // with `window.location.href`, the component unmounted, and `basket` — plain React state, never
  // persisted — was gone. A customer whose card declined at Stripe came back to an empty page.
  // 🔴 MOVING THE CARD FORM IN-PAGE REMOVES THE CAUSE RATHER THAN COMPENSATING FOR IT. There is no
  // navigation on the ordinary card path, so the component never unmounts and the basket simply stays.
  // A decline leaves the Element mounted, the basket intact and the customer able to press again.
  // ⚠️ The only navigation left is the SUCCESS one, to ?confirm= — where the basket is meant to be gone.
  // "Check again" in-place re-fetch state (pause banner) — never reloads, never clears the basket.
  const [rechecking, setRechecking] = useState(false)
  // Event finished EARLY (status='closed'/'cancelled') while the customer was already on the page —
  // set by the /api/menu poll (real-time catch-up) AND the submit-403 safety net. Folds into
  // isOrderingBlocked. Status-driven, alongside the clock-based isEventClosed backstop.
  const [eventEnded, setEventEnded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  // ── PAY BY CARD ──────────────────────────────────────────────────────────────────────────────────
  // ⚠️ DEFAULTS TRUE, BUT ONLY EVER READ ALONGSIDE `truck.card_payments_ready`. On every truck that has
  // not completed Stripe onboarding — all of them today — the choice is never rendered and this value
  // never reaches the submit path, so the page behaves exactly as it did before.
  const [payByCard, setPayByCard] = useState(true)
  /** Set when the order was placed but the card step could not start. NEVER silent — see the confirmation. */
  const [cardFallbackNotice, setCardFallbackNotice] = useState(false)
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null)
  const [submittedAutoAccepted, setSubmittedAutoAccepted] = useState(false)
  const [submittedConfirmedSlot, setSubmittedConfirmedSlot] = useState<string | null>(null)
  const [submittedRequestedSlot, setSubmittedRequestedSlot] = useState<string | null>(null)
  const [submittedSlotChanged, setSubmittedSlotChanged] = useState(false)
  // The ASAP estimate the customer SAW on screen at submit ("Around HH:MM"), captured for ASAP orders
  // so the confirmation can say "the HH:MM we estimated wasn't available" when the booked slot differs.
  const [submittedAsapEstimate, setSubmittedAsapEstimate] = useState<string | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  // STAGE 1 (basket peek) starts COLLAPSED — it expands on demand rather than starting open.
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  // STAGE 2 (commit): the order FORM opens as a bottom-sheet overlay only at commit. Default closed.
  // ── 🔴 EXCEPT WHEN THE CUSTOMER ARRIVES ON A REFUSAL. ──────────────────────────────────────────
  // paymentFailedNotice renders INSIDE this sheet, beside the stock and menu-change notices — which is
  // right, and which means that on a fresh document (Stripe redirected for 3DS, so the page was rebuilt)
  // the sentence exists in state and renders nowhere until the customer happens to open the sheet.
  // Seeding it open is what makes "the message survived" true on screen rather than only in the URL.
  // ⚠️ SEEDED IN THE INITIALISER, not an effect — the same rule paymentFailedNotice itself follows.
  // ⚠️ NOTHING ELSE OPENS IT: absent the parameter this is the `false` it has always been.
  const [formSheetOpen, setFormSheetOpen] = useState(!!paymentFailedParam)
  /** The sheet's scroll container. Only ever used to put a refusal in front of the customer — the sheet
   *  keeps its scroll position across steps, so a notice at the top can otherwise arrive off screen. */
  const sheetScrollRef = useRef<HTMLDivElement | null>(null)

  /** 🔴 THE PAYMENT STEP IS ON SCREEN — which now means the SHEET is open AND the step is selected.
   *  It is a step inside the sheet, so closing the sheet hides it exactly as closing it hides the review;
   *  `stageOpen` survives, so reopening the sheet returns the customer to the card form rather than
   *  dropping them back to a review they had already left.
   *  ⚠️ THE ELEMENT'S LIFECYCLE DOES NOT READ THIS. It reads `paymentBoxEl`, the host node itself — which
   *  is what makes every close route, including the sheet's, go through the one teardown. */
  const payingInSheet = formSheetOpen && stageOpen && payment !== null

  /** 🔴 TRUE ONLY WHILE THE PAYMENT STAGE IS ON SCREEN — NOT merely while an authorisation is held.
   *  The two came apart when closing the stage stopped destroying the intent: a customer who backs out
   *  to edit their basket is on the ORDER FORM, where the slot refresh, the clock tick and the menu
   *  poll all need to work again. Gating on `payment` alone would freeze the form for the rest of the
   *  session. The one flag every background behaviour checks. */
  const paying = payingInSheet
  // ⚠️ A REF ALONGSIDE THE BOOLEAN. `fetchSlots` is a plain function re-created every render, but it is
  // captured by the visibilitychange listener's closure, which is only re-attached when ITS deps change.
  // A ref is read live at call time, so the gate cannot go stale inside a stale closure.
  const payingRef = useRef(false)
  useEffect(() => { payingRef.current = paying }, [paying])

  // The form sheet's own review-summary state — EXPANDED by default so the customer sees what they're
  // confirming on open (food-truck orders are small). A max-h cap on the summary (see render) keeps a
  // rare large order from burying the form. Customer can still collapse it. Separate from footer peek.
  const [sheetSummaryExpanded, setSheetSummaryExpanded] = useState(true)
  const [footerHeight, setFooterHeight] = useState(0)
  const footerRef = useRef<HTMLDivElement>(null)
  // ⚠️ `viewportH` WAS HERE AND IS GONE (B6). Its only reader was menuMinHeight, which A2 replaced
  // with a `dvh` min-height in CSS — so no JS height is derived from window.innerHeight any more and
  // there is nothing left for an iOS address-bar collapse to invalidate. `bumpMeasure` replaces it:
  // resize/orientationchange force a render so the pinned bands are re-MEASURED rather than recomputed.
  const [, bumpMeasure] = useState(0)
  // ⚠️ `menuTopRef` AND `categoryScrollMounted` WERE HERE AND ARE GONE. They existed only for the
  // tab-change scroll pin, which filtering made possible (one anchor served every category). The jump
  // now targets the tapped SECTION, so a single shared anchor has nothing to point at. Removed rather
  // than left dangling — see the jump + spy block below.

  // ── B1 / B4: JUMP + SCROLL-SPY ──────────────────────────────────────────────────────────────────
  // 🔴 THIS REPLACED THE OLD TAB-CHANGE `window.scrollTo`, which existed because the tabs FILTERED:
  // every category started at the same place, so the pin always scrolled to one fixed anchor
  // (`menuTopRef`). With every category in one list they start at different places, so the jump has
  // to target the tapped SECTION. The old effect's demo fix is preserved and generalised — it scrolled
  // to `stickyTop`, and `pinnedTop` below is that same number plus the two bands it never counted.
  //
  // ⚠️ ONE NUMBER, TWO CONSUMERS. `pinnedTop` is both the CSS `scroll-margin-top` on each section and
  // the JS pin line the spy compares against. They cannot disagree, which is the whole reason the
  // jump uses scrollIntoView (the browser applies scroll-margin-top itself) instead of arithmetic.
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  /** The chip bar's INNER scrolling box (the `overflow-x-auto` row) and the chip buttons in it.
   *  ⚠️ NOT `tabBarRef` — that is the OUTER sticky wrapper, which does not scroll. Measuring or
   *  scrolling the wrapper would do nothing at all, silently. */
  const chipScrollRef = useRef<HTMLDivElement | null>(null)
  const chipRefs = useRef<Map<string, HTMLElement>>(new Map())
  /** Pending rAF for the chip-bar auto-scroll — see the effect for why it is coalesced. */
  const chipRafRef = useRef(0)
  /** The scrollY a chip tap asked for. Non-null exactly while locked. */
  const spyTargetRef = useRef<number | null>(null)
  const spyTimerRef = useRef<number | null>(null)
  const spyRafRef = useRef(0)
  /** Live copy of the values the scroll handler needs, so the listener can mount ONCE with no deps
   *  and never be torn down and re-attached as categories load or the pinned band is re-measured. */
  const spyStateRef = useRef<{ cats: string[]; pinnedTop: number }>({ cats: [], pinnedTop: 60 })

  const releaseSpyLock = useCallback(() => {
    spyTargetRef.current = null
    if (spyTimerRef.current !== null) { window.clearTimeout(spyTimerRef.current); spyTimerRef.current = null }
  }, [])

  const onScrollSpy = useCallback(() => {
    const { cats, pinnedTop: line } = spyStateRef.current
    if (cats.length < 2) return
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
    // 🔴 LOCKED while our own smooth scroll is in flight: letting the spy run would repaint the active
    // chip for every category the page passes THROUGH, so the tapped chip lights, flickers through its
    // neighbours, then settles. Released on ARRIVAL (or at the bottom, where a target past the end of
    // the document can never be reached), on touch/wheel, and on scrollend — the timer is only a net.
    if (spyTargetRef.current !== null) {
      if (Math.abs(window.scrollY - spyTargetRef.current) > 2 && !atBottom()) return
      releaseSpyLock()
    }
    if (spyRafRef.current) return
    spyRafRef.current = requestAnimationFrame(() => {
      spyRafRef.current = 0
      // BOTTOM CLAMP: a short LAST category cannot always bring its heading up to the pin line, so the
      // plain rule would leave its chip permanently unlit. At the bottom of the page it IS what you
      // are looking at. (A2's trailing min-height makes this rare; it is not made redundant by it.)
      if (atBottom()) { setActiveCategory(cats[cats.length - 1] ?? null); return }
      let current = cats[0] ?? null
      for (const cat of cats) {
        const el = sectionRefs.current.get(cat)
        if (!el) continue
        if (el.getBoundingClientRect().top <= line + 1) current = cat
        else break
      }
      setActiveCategory(current)
    })
  }, [releaseSpyLock])

  /** Tap a chip: scroll that section's top to just below everything pinned. */
  const jumpToCategory = useCallback((cat: string) => {
    setActiveCategory(cat)                       // light the chip on the TAP, not when the scroll lands
    const el = sectionRefs.current.get(cat)
    if (!el) return
    const target = Math.max(0, window.scrollY + el.getBoundingClientRect().top - spyStateRef.current.pinnedTop)
    releaseSpyLock()
    // ⚠️ ALREADY THERE ⇒ DO NOT LOCK. scrollIntoView to the current position emits no scroll event, so
    // a lock taken here would have no arrival to release it and would sit until the net expired.
    if (Math.abs(target - window.scrollY) > 2) {
      spyTargetRef.current = target
      spyTimerRef.current = window.setTimeout(releaseSpyLock, SPY_LOCK_SAFETY_MS)
    }
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [releaseSpyLock])

  useEffect(() => releaseSpyLock, [releaseSpyLock])

  // Sync padding synchronously after every render — fires before paint so the
  // expanded footer and the updated paddingBottom are always drawn together.
  useLayoutEffect(() => {
    if (!footerRef.current) return
    const h = Math.ceil(footerRef.current.offsetHeight)
    if (h !== footerHeight) setFooterHeight(h)
  })

  // A1: measure the pinned bands, in the SAME shape the footer above uses (layout effect, no dep
  // array, runs after every render, guarded so it cannot loop). No dep array is deliberate: a banner
  // mounting or unmounting is a render, so this catches every appearance without having to enumerate
  // the conditions that produce one — which are computed hundreds of lines below this hook.
  useLayoutEffect(() => {
    const banners = [timeBannerRef.current, closedBannerRef.current, pausedBannerRef.current]
      .filter((el): el is HTMLDivElement => el !== null)
    const total = banners.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0)
    setStatusBannerH(prev => (Math.abs(prev - total) < 0.5 ? prev : total))
    const bar = tabBarRef.current
    if (bar) {
      const h = bar.getBoundingClientRect().height
      setTabBarH(prev => (Math.abs(prev - h) < 0.5 ? prev : h))
    }
  })

  // ResizeObserver as backup for orientation changes / window resize events
  // that happen outside a React render cycle.
  useEffect(() => {
    if (!footerRef.current) return
    const el = footerRef.current
    const observer = new ResizeObserver(() => {
      setFooterHeight(Math.ceil(el.offsetHeight))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 🔴 B6 — NOTHING ON THIS PAGE COMPUTES A HEIGHT FROM `window.innerHeight` ANY MORE.
  // It used to seed `viewportH`, whose only reader was menuMinHeight (see A2, now `dvh` in CSS).
  // iOS Safari collapses its address bar mid-gesture and fires `resize` for it, so any JS height
  // derived from innerHeight changed the document *while the customer was scrolling*. The resize
  // listener is kept but now only forces a re-render, which makes the layout effect above RE-MEASURE
  // the real elements. Measuring beats computing: an element's height is whatever the address bar
  // has just done to it.
  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 120)
      onScrollSpy()
    }
    const onResize = () => bumpMeasure(n => n + 1)
    const takeOver = () => releaseSpyLock()
    window.addEventListener('scroll', onScroll, { passive: true })
    // 🔴 THE CUSTOMER ALWAYS WINS. A touch or wheel during our own smooth scroll means they have taken
    // over, so the spy lock ends there and then and follows THEIR scroll — the case a timer-only
    // release serves worst (it keeps asserting the tapped chip while the page moves elsewhere).
    window.addEventListener('touchstart', takeOver, { passive: true })
    window.addEventListener('wheel', takeOver, { passive: true })
    window.addEventListener('scrollend', takeOver)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('touchstart', takeOver)
      window.removeEventListener('wheel', takeOver)
      window.removeEventListener('scrollend', takeOver)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [onScrollSpy, releaseSpyLock])

  const [basket, setBasket] = useState<BasketItem[]>([])
  const [appliedDeals, setAppliedDeals] = useState<AppliedDeal[]>([])
  const [dealModalOpen, setDealModalOpen] = useState(false)
  const [selectedBundleForModal, setSelectedBundleForModal] = useState<Bundle | null>(null)
  const [itemModal, setItemModal] = useState<{ item: MenuItem; modGroups: ModifierGroup[]; upsells: MenuItem[]; editCartKey?: string } | null>(null)
  const [modalMods, setModalMods] = useState<{ name: string; price: number; allergens?: string[]; dietary?: string[] }[]>([])
  const [modalNotes, setModalNotes] = useState('')
  // Upsells STAGED in the modal (like modalMods) — selected names, committed on "Add to basket".
  const [modalUpsells, setModalUpsells] = useState<string[]>([])
  const [discountInput, setDiscountInput] = useState('')
  const [appliedCode, setAppliedCode] = useState<DiscountCode | null>(null)
  const [discountError, setDiscountError] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [slotHour, setSlotHour] = useState('')
  const [slotMinute, setSlotMinute] = useState('')
  const [availableSlots, setAvailableSlots] = useState<{collection_time:string;available:boolean;remaining:number;is_past:boolean;too_soon:boolean;is_grace:boolean}[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  // Event timezone from /api/slots (default 'Europe/London'); now/ASAP/past all derive in this tz.
  const [eventTz, setEventTz] = useState('Europe/London')
  // Live clock tick (every 30s) so ASAP + the selectable list RE-DERIVE as time passes — never
  // cached at fetch. `asapSlot` is now a useMemo (below), NOT useState (the staleness bug).
  const [nowTick, setNowTick] = useState(0)
  const [asapChosen, setAsapChosen] = useState(true)
  const [queueByCat, setQueueByCat] = useState<Record<string,number>>({})
  const [serverCatConfigs, setServerCatConfigs] = useState<Record<string,{secs:number;batch:number}>>({})
  // Backward-occupancy inputs from /api/slots — for the client-side basket-aware fit overlay
  // (hard-blocks a slot the customer's order can't fit; no override on the customer surface).
  const [capacityInputs, setCapacityInputs] = useState<{productionSlotUnits:Record<string,Record<string,number>>;kitchenCapacity:number|null;capacityWindowMins?:number;eventStartMins:number}|null>(null)
  const [notes, setNotes] = useState('')

  // ── 🔴 THE CONFIRMATION BRANCH'S OWN STATE — SEPARATE FROM THE FORM'S, ON PURPOSE ────────────────
  // It has its own `loading` and `error` because it sits ABOVE the page's, and must not share them: the
  // page's `loading` is owned by the menu fetch, which this branch switches off. Three small values
  // rather than reusing three big ones, so neither path can put the other into a state it cannot leave.
  const [confirmOrder, setConfirmOrder] = useState<any | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(!!confirmOrderKey)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const selectedSlot = slotHour && slotMinute ? `${slotHour}:${slotMinute}` : ''

  // Calculate available hours from event times (customer-facing only)
  const availableHours = useMemo(() => {
    if (!event?.start_time || !event?.end_time) {
      // Fallback if no event hours: 10:00-23:00
      return Array.from({length:14}, (_,i) => String(i+10).padStart(2,'0'))
    }
    
    const [startH] = event.start_time.split(':').map(Number)
    const [endH] = event.end_time.split(':').map(Number)
    
    const hours = []
    for (let h = startH; h <= endH; h++) {
      hours.push(String(h).padStart(2, '0'))
    }
    return hours
  }, [event])

  // Filter minutes based on first/last hour of event
  const availableMinutes = useMemo(() => {
    const allMinutes = ['00','05','10','15','20','25','30','35','40','45','50','55']
    
    if (!event?.start_time || !event?.end_time || !slotHour) {
      return allMinutes
    }
    
    const [startH, startM] = event.start_time.split(':').map(Number)
    const [endH, endM] = event.end_time.split(':').map(Number)
    const selectedH = parseInt(slotHour)
    
    // First hour: filter out minutes before start
    if (selectedH === startH) {
      return allMinutes.filter(m => parseInt(m) >= startM)
    }
    
    // Last hour: filter out minutes after end
    if (selectedH === endH) {
      return allMinutes.filter(m => parseInt(m) <= endM)
    }
    
    // Middle hours: all minutes available
    return allMinutes
  }, [event, slotHour])

  // Fetch available slots (must use date_iso yyyy-mm-dd to match orders.event_date in Supabase)
  const fetchSlots = async (truckId: string, dateIso: string, startTime?: string, endTime?: string, eventId?: string) => {
    // ⚠️ GATED OFF FOR THE CONFIRMATION, AT THE FUNCTION rather than at each of its two callers — the
    // slots effect and the visibilitychange handler — so neither can be added to without remembering.
    // A receipt shows a slot that is already booked; there is nothing left to choose.
    if (confirmOrderKey) return
    // ── 🔴 GATE 2 of 4 — AND THE ONE A 3DS MODAL TRIPS. ──────────────────────────────────────────
    // Stripe's 3DS challenge is an overlay that takes focus, which fires `visibilitychange` when the
    // customer returns to the page. That handler calls this function. Under the old hosted Checkout the
    // page had unmounted and there was nothing to trip; in-page there is, and a slots refetch landing
    // mid-authorisation can move `availableSlots` — and with it the ASAP estimate and the selectable
    // list — underneath a payment that was priced against the old one.
    // Gated at the FUNCTION, not at its callers, so neither the effect nor the visibilitychange handler
    // can be added to without inheriting this.
    if (payingRef.current) return
    setLoadingSlots(true)
    try {
      const p = new URLSearchParams({ date: dateIso })
      if (startTime) p.set('start', startTime)
      if (endTime) p.set('end', endTime)
      // event_id scopes the slot capacity to THIS event (re-key fix) — date is the fallback.
      if (eventId) p.set('event_id', eventId)
      const res = await fetch(`/api/slots/${truckId}?${p}`, { cache: 'no-store' })
      // Same parse-before-check as the submit path had. Nothing customer-visible came of it — the catch
      // below swallows it into "no slots" — but an explicit guard is what stops that being luck.
      if (!res.ok) throw new Error('slots unavailable')
      const data = await res.json()
      const slots = data.slots || []
      setAvailableSlots(slots)
      setQueueByCat(data.queueByCat || {})
      setServerCatConfigs(data.catConfigs || {})
      setCapacityInputs(data.capacityInputs ?? null)
      if (data.tz) setEventTz(data.tz) // event timezone for live ASAP/isSlotPast (default London)
      // asapSlot is no longer cached here — it's derived live from availableSlots + the tick (below).
    } catch { setAvailableSlots([]) }
    finally { setLoadingSlots(false) }
  }

  const eventDateIso = event?.date_iso ?? new Date().toISOString().split('T')[0]

  // Live clock tick — re-derive ASAP + the selectable list every 30s WITHOUT refetching, so a page
  // left open never shows a stale/past ASAP. (The fix for: ASAP cached at load = 10:00 at 10:04.)
  useEffect(() => {
    // ⚠️ GATED OFF FOR THE CONFIRMATION. This tick exists to keep the ASAP estimate honest on a form
    // left open; a receipt has no ASAP to recompute, and a perpetual 30s re-render of a static screen
    // is pure waste on a customer's phone.
    if (confirmOrderKey) return
    // ── 🔴 GATE 3 of 4. The tick re-derives the ASAP estimate every 30s. Mid-authorisation that would
    // change the collection time displayed beside a card form the customer is filling in — and the
    // draft was already priced and slotted against the value they agreed to. Frozen while paying.
    if (paying) return
    const id = setInterval(() => setNowTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [confirmOrderKey, paying])

  // ASAP collection time — DERIVED LIVE (was useState set once at fetch). Recomputes on every tick,
  // slot change, or tz change, so it always reflects the CURRENT time in the event's timezone.
  // nowTick is intentionally a dependency (forces the re-derive); getAsapSlot reads getNowMinsInTz.
  const asapSlot = useMemo(
    () => getAsapSlot(availableSlots, eventDateIso, eventTz)?.collection_time ?? null,
    [availableSlots, eventDateIso, eventTz, nowTick],
  )

  // Reload slot availability whenever truck/event is known or customer returns to the tab
  useEffect(() => {
    if (!truck?.id) return
    fetchSlots(truck.id, eventDateIso, event?.start_time, event?.end_time, event?.id)
  }, [truck?.id, eventDateIso, event?.start_time, event?.end_time, event?.id])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && truck?.id) {
        fetchSlots(truck.id, eventDateIso, event?.start_time, event?.end_time, event?.id)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [truck?.id, eventDateIso, event?.start_time, event?.end_time])

  // ── 🔴 THE CONFIRMATION FETCH — THE ONLY REQUEST THIS BRANCH MAKES ──────────────────────────────
  // One order row. Not a menu, not an event list, not slots. Every other fetch on this page is gated
  // off when `confirmOrderKey` is present (see each effect below), because a receipt does not need a
  // menu to render and a customer who has just paid should not wait on one.
  //
  // 🔴 `?truck=${slug}` IS THE SCOPING, AND IT IS WHY THE PARAMETER WAS ADDED TO THAT ROUTE. The
  // order_key is an unguessable UUID, so an unscoped read is not a leak — but this page renders the
  // order under THIS truck's name and logo, and an order_key from another truck would put one truck's
  // order under another truck's header. The server compares and 404s; the client does not decide it.
  // ⚠️ THE EMAIL LINK'S CONSUMER IS UNAFFECTED: the parameter is optional, and /order/[id]/manage does
  // not send it, so that route behaves exactly as before for the "Cancel your order" link.
  useEffect(() => {
    if (!confirmOrderKey) return
    // ⚠️ NO SYNCHRONOUS setState HERE. `confirmLoading` is initialised to `!!confirmOrderKey`, so this
    // path already starts in the right state and a setState in the effect body would only cause a
    // cascading render (react-hooks/set-state-in-effect). Every state change below is in a callback.
    let cancelled = false
    // ── 🔴 IT WAITS FOR PROMOTION. A CUSTOMER WHO HAS PAID MUST NEVER BE SHOWN AN ERROR. ──────────
    // Under authorize-then-capture the order does NOT exist when the customer lands here: they have
    // authorised, and the webhook is promoting the draft into an order. That takes a moment, and a 404
    // in that window means "not yet", not "never".
    // So a 404 is RETRIED, briefly and a bounded number of times, and only a run of them is an error.
    // ⚠️ THE COST, ACCEPTED: a genuinely bogus order key now takes ~8s to report "not found" instead of
    // being instant. That is the right way round — the common case is a paying customer, and telling one
    // of those their order does not exist would be the worst screen in the product.
    // ⚠️ Deliberately a fixed short interval rather than a backoff: promotion either lands in the first
    // few seconds or something is wrong, and a backoff would only lengthen the wrong answer.
    // ── 🔴 THE WINDOW IS 60 SECONDS, AND IT IS SET FROM A MEASURED ORDER. ───────────────────────
    // It was 8 attempts at 1s = ~8 seconds, and a real Apple Pay order missed it: the customer was told
    // "We couldn't find that order" for an order that arrived moments later.
    // THE MEASUREMENT (order 18, 12 August): draft 16:38:55 -> Stripe stamped the authorisation
    // 16:39:18 -> webhook received 16:39:19.6 -> order row 16:39:42.3.
    //   1. 22.4s of that was the CUSTOMER at the card sheet. Not our latency, and not what this bounds —
    //     they are not looking at the confirmation yet.
    //   2. 🔴 22.7s IS OURS: webhook receipt to order row. That is the number this must cover.
    // 60s is ~2.6x the measured worst case, which leaves room for a slower cold start without being so
    // long that a genuinely bad key hangs the screen. 30 retries at 2s rather than 60 at 1s: the first
    // attempt is immediate and usually succeeds, so the interval only costs the waiting case, and half
    // the requests is politer to a phone on poor coverage.
    // ⚠️ THE COST, ACCEPTED: a bogus order key now takes ~60s to report "not found" instead of ~8s. That
    // is the right way round — the common case is a customer who has paid, and telling one of those
    // their order does not exist is the worst screen in the product.
    let attempt = 0
    const MAX_ATTEMPTS = 30
    const RETRY_MS = 2000
    const run = () => fetch(`/api/orders/${confirmOrderKey}?truck=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(async r => {
        if (cancelled) return
        if (r.status === 404 && attempt < MAX_ATTEMPTS) {
          attempt++
          // ⚠️ NOT an error state — `confirmLoading` stays true, so the screen keeps saying it is
          // loading rather than flashing a failure and correcting itself.
          setTimeout(() => { if (!cancelled) void run() }, RETRY_MS)
          return
        }
        if (!r.ok) {
          // ⚠️ ONE MESSAGE FOR "no such order" AND "wrong truck", because the server deliberately
          // returns the same 404 for both — a customer asking about an order on the wrong truck must
          // not learn whether it exists elsewhere. Same reasoning as the hidden-truck gate in submit.
          setConfirmError('We couldn’t find that order.')
          setConfirmLoading(false)
          return
        }
        const d = await r.json()
        if (cancelled) return
        // ⚠️ A CANCELLED ORDER IS NOT A CONFIRMATION. Rendering "Order confirmed!" over a cancelled row
        // would be actively wrong, so it is refused here with copy that says what happened rather than
        // pretending the order is missing.
        if (d?.status === 'cancelled') {
          setConfirmError('This order has been cancelled.')
          setConfirmLoading(false)
          return
        }
        // ⚠️ AND NEITHER IS A REJECTED ORDER, FOR THE SAME REASON, ONE STATUS LATER. Without this it
        // fell through to the receipt, where `autoAccepted` is `status === 'confirmed'` — false for a
        // rejected row — so the screen read "Order received! {truck} will confirm your order shortly."
        // That is a promise about the future of an order the truck has already refused.
        // 🔴 SAME MECHANISM, SAME SHAPE: one status test, `setConfirmError`, and out. It renders through
        // the existing 😕 branch below with its "Back to truck page" link; no new component, and the
        // 'cancelled' guard above is untouched.
        if (d?.status === 'rejected') {
          setConfirmError('This order was not accepted by the truck.')
          setConfirmLoading(false)
          return
        }
        setConfirmOrder(d)
        setConfirmLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setConfirmError('We couldn’t load that order.')
        setConfirmLoading(false)
      })
    void run()
    return () => { cancelled = true }
  }, [confirmOrderKey, slug])

  // Load upcoming events for this truck
  useEffect(() => {
    // ⚠️ GATED OFF FOR THE CONFIRMATION. A receipt needs no event list, and this fetch is on the STRICT
    // rate-limit tier — a customer refreshing their receipt must not spend that budget.
    if (confirmOrderKey) return   // `eventLoading` already initialised false for this path
    // Initial events load WITH bounded auto-retry (3 attempts, 1s then 2s backoff). A transient
    // cold-start/blip self-heals silently; only an exhausted-retry failure surfaces eventsError so
    // the render shows the retry card (never a silent blank). `cancelled` (cleanup) prevents a stale
    // loop from setState-ing after unmount or a slug/reloadKey change. Re-runs when reloadKey is
    // bumped by the Retry button. SUCCESS PATH unchanged from before (filter + setEvents/setNoEvents).
    let cancelled = false
    const loadEvents = async () => {
      setEventsError(false)
      setEventLoading(true)
      const backoffMs = [1000, 2000] // waits BEFORE retry attempts 2 and 3
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(`/api/events?truck=${slug}`)
          // ── 🔴 A 429 IS A REFUSAL, NOT A BLIP. IT MUST NOT BE RETRIED. ──────────────────────────
          // The backoff loop below exists for a transient failure — a cold start, a dropped packet —
          // where trying again is likely to work. A 429 is the server saying the budget for this
          // window is already spent, so retrying spends more of a budget it has just told us is empty
          // AND makes the refusal last longer. On 11 August this loop turned one refusal into three,
          // and the Retry button turned each tap into three more: eight 429s in fifty seconds.
          // Stop immediately, surface the card, and let the window refill.
          if (res.status === 429) {
            if (cancelled) return
            setEventsError(true)
            setEventLoading(false)
            return
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          if (cancelled) return
          if (data.events && data.events.length > 0) {
            const now = new Date()
            const cutoff = new Date()
            cutoff.setDate(cutoff.getDate() + 14)
            const upcoming = data.events.filter((e: EventData) => {
              // Exclude events whose end time has passed — local time parse per engineering manual
              if (e.date_iso && e.end_time && now >= new Date(`${e.date_iso}T${e.end_time}`)) return false
              const [d, m, y] = e.date.split('/').map(Number)
              return new Date(y, m-1, d) <= cutoff
            })
            if (upcoming.length > 0) {
              setEvents(upcoming)
              // Selection is derived from ?event_id in the effect below — don't pre-select here.
            } else {
              setNoEvents(true)
            }
          } else {
            setNoEvents(true)
          }
          setEventsError(false)
          setEventLoading(false)
          return // success — stop retrying
        } catch {
          if (cancelled) return
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, backoffMs[attempt]))
            if (cancelled) return
            continue // retry
          }
          // All attempts exhausted → surface the retry card (no silent blank).
          setEventsError(true)
          setEventLoading(false)
        }
      }
    }
    loadEvents()
    return () => { cancelled = true }
  }, [slug, reloadKey])

  // Derive the selected event from ?event_id (the deep-link). With a valid id → scope to it;
  // without → auto-select the only event (single-event truck), else leave unselected so the
  // picker (the order-entry schedule) is shown. Reset the slot when the scope changes so no
  // slot from a previously-viewed event lingers. Re-runs on Link navigation (param change).
  useEffect(() => {
    if (!events.length) { setEvent(null); return }
    // 2a — DEMO skips event selection entirely. A demo truck has exactly one event by construction, so
    // the chooser would be a one-option question; forcing events[0] also means a transient multi-event
    // state can never strand a visitor on a picker they have no way to reason about.
    const next = isDemo
      ? (events.find(e => e.id === eventIdParam) ?? events[0])
      : eventIdParam
        ? (events.find(e => e.id === eventIdParam) ?? null)
        : (events.length === 1 ? events[0] : null)
    setEvent(next)
    setSlotHour(''); setSlotMinute('')
  }, [eventIdParam, events, isDemo])


  // Non-destructive menu re-fetch (truck.paused/pauseReason + menu) — reused by the initial load
  // AND the pause banner's "Check again". Updates state in place; NEVER reloads, NEVER touches the
  // basket. Scopes deals/pause/ordering_available to the SELECTED event (cross-event fix).
  const refetchMenu = useCallback(async () => {
    const menuUrl = event?.id ? `/api/menu/${slug}?event_id=${event.id}` : `/api/menu/${slug}`
    const r = await fetch(menuUrl, { cache: 'no-store' })
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${r.status}`)
    }
    const data = await r.json()
    setTruck(data.truck)
    setMenu(data.menu)
  }, [slug, event?.id])

  useEffect(() => {
    // 🔴 GATED OFF FOR THE CONFIRMATION, AND THIS IS THE ONE THAT MATTERS. This fetch OWNS `loading`
    // via its .finally(), so leaving it on would be harmless (the confirmation branch returns above the
    // loading check) but wasteful — a full menu, deals and upsell payload fetched to render a receipt.
    // ⚠️ `loading` therefore stays TRUE forever on this path. That is safe ONLY because the confirmation
    // branch sits above the loading check; if it were ever moved below, this page would hang. The comment
    // at that branch says the same thing from the other side. Do not move one without the other.
    if (confirmOrderKey) return
    // Initial load: page-replacing error on failure (first paint has no basket to protect yet).
    refetchMenu()
      .catch((err: any) => {
        console.error('[ORDER FORM] Menu fetch error:', err?.message || err)
        setError('This truck is not currently taking orders.')
      })
      .finally(() => setLoading(false))
  }, [refetchMenu])

  // Real-time catch-up for the ALREADY-LOADED customer: poll the SELECTED event's /api/menu (the
  // same status-aware source as the initial load / "Check again" — no new system) every 30s so a
  // status='closed' (operator finished, possibly early) blocks ordering WITHOUT a submit attempt.
  // On ok: refresh truck pause/ordering_available (also catches a pause that started while loaded).
  // On a 404 with a closed/cancelled event_status (or ordering_available:false): flip eventEnded.
  // NON-DESTRUCTIVE: never touches the basket; a transient failure is ignored (retry next tick).
  // Stops once eventEnded (terminal) or when there's no selected event (the chooser view).
  useEffect(() => {
    // ⚠️ GATED OFF FOR THE CONFIRMATION. This poll watches for an event closing so the FORM can stop
    // taking orders. A receipt is already placed; nothing it shows can be invalidated by the event
    // ending, and it would otherwise poll indefinitely on a screen the customer may leave open.
    if (confirmOrderKey) return
    // ── 🔴 GATE 4 of 4. This poll can set `eventEnded`, which blocks ordering and replaces the form.
    // Firing it while a card form is on screen would tear the Element out from under a customer who is
    // mid-payment — and an authorisation already in flight would still succeed at Stripe, leaving money
    // held against a draft whose page has just told the customer the event is closed. Paused while
    // paying; it resumes if they abandon the card and go back to the form.
    if (paying) return
    if (!event?.id || eventEnded) return
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/menu/${slug}?event_id=${event.id}`, { cache: 'no-store' })
        if (r.ok) {
          const data = await r.json()
          setTruck(data.truck) // refresh paused/pauseReason/ordering_available; basket untouched
          return
        }
        const body = await r.json().catch(() => ({}))
        if (r.status === 404 && (body?.event_status === 'closed' || body?.event_status === 'cancelled' || body?.ordering_available === false)) {
          setEventEnded(true)
        }
      } catch { /* transient (offline/blip) — keep current state, try next tick */ }
    }, 30000)
    return () => clearInterval(id)
  }, [event?.id, eventEnded, slug, paying])

  // ── Basket ──────────────────────────────────────────────────────────────────

  // Option shared-pool gate (D2): would one more of `optNames` exceed any option's BASKET-WIDE pool?
  // Returns the blocked option name (else null). Untracked options never block. Customer cannot
  // oversell (no override) — same as item stock; the submit-time atomic draw is the hard backstop.
  const optionAddBlocked = (optNames: string[]): string | null => {
    if (!optNames.length) return null
    const tally = tallyBasketOptionQtys(basket.map(b => ({ quantity: b.quantity, modifiers: b.modifiers })))
    const stockMap = buildOptionStockByName((menu?.items as any[]) || [])
    return optionDrawBlocked(tally, optNames, stockMap, 1)
  }

  // Basket-aware remaining for a modal option pill (display agrees with the §28 gate). null = untracked.
  const optionRemainingFor = (optName: string, stockCount: number | null | undefined): number | null =>
    optionRemaining(stockCount, tallyBasketOptionQtys(basket.map(b => ({ quantity: b.quantity, modifiers: b.modifiers })))[optName] || 0)

  const addItem = (item: MenuItem, mods: { name: string; price: number; allergens?: string[]; dietary?: string[] }[] = [], notes = '', source: 'direct' | 'upsell' = 'direct') => {
    // Option pool guard (basket-wide) — no-op if a chosen option's shared pool is exhausted.
    if (optionAddBlocked(mods.map(m => m.name))) return
    const key = makeCartKey(item.name, mods, notes)
    setBasket(prev => {
      const ex = prev.find(b => b.cartKey === key)
      if (item.stock_remaining != null) {
        const totalQty = prev.filter(b => b.menuItem.name === item.name).reduce((s, b) => s + b.quantity, 0)
        if (totalQty >= item.stock_remaining) return prev
      }
      if (ex) return prev.map(b => b.cartKey === key ? { ...b, quantity: b.quantity + 1 } : b)
      return [...prev, { menuItem: item, quantity: 1, modifiers: mods, specialInstructions: notes, cartKey: key, source }]
    })
  }

  const removeItem = (cartKey: string) => {
    const entry = basket.find(b => b.cartKey === cartKey)
    if (!entry) return
    const isLastVariant = basket.filter(b => b.menuItem.name === entry.menuItem.name).length === 1 && entry.quantity === 1
    if (isLastVariant) setAppliedDeals(prev => cleanupDealsForItem(prev, entry.menuItem.name))
    setBasket(prev => {
      const ex = prev.find(b => b.cartKey === cartKey)
      if (!ex) return prev
      if (ex.quantity === 1) return prev.filter(b => b.cartKey !== cartKey)
      return prev.map(b => b.cartKey === cartKey ? { ...b, quantity: b.quantity - 1 } : b)
    })
  }

  // Cap basket lines to the server's authoritative remaining (submit-409 stock guard). For each
  // over-ordered item, trim quantity across its variant lines (from the last) until total ≤
  // remaining; drop any line that hits 0. Deal-routed items aren't trimmed here — the server
  // re-rejects on resubmit, so oversell is still impossible.
  const capBasketToRemaining = (shortItems: { name: string; remaining: number }[]) => {
    if (!shortItems.length) return
    setBasket(prev => {
      let next = [...prev]
      for (const { name, remaining } of shortItems) {
        const total = next.filter(b => b.menuItem.name === name).reduce((s, b) => s + b.quantity, 0)
        let excess = total - Math.max(0, remaining)
        if (excess <= 0) continue
        for (let i = next.length - 1; i >= 0 && excess > 0; i--) {
          if (next[i].menuItem.name !== name) continue
          const take = Math.min(next[i].quantity, excess)
          next[i] = { ...next[i], quantity: next[i].quantity - take }
          excess -= take
        }
      }
      return next.filter(b => b.quantity > 0)
    })
  }

  // ── 🔴 TAKE THE SOLD-OUT LINES OUT, AND SAY WHAT WENT. ────────────────────────────────────────
  // ── WHY THIS WRAPS capBasketToRemaining RATHER THAN REPLACING IT ────────────────────────────────
  // capBasketToRemaining IS the right home for the item half and is called unchanged: it caps to the
  // server's own `remaining`, drops a line that reaches zero, and touches nothing else in the basket.
  // What it deliberately does NOT do is deals — its own comment says so — and a deal is exactly the case
  // that cannot be left alone. So the deal half is added AROUND it rather than inside it, and the item
  // behaviour every pay-at-hatch customer already gets is byte-identical.
  //
  // ── 🔴 A DEAL LOSES ITS WHOLE BUNDLE, NOT ONE SLOT, AND THAT IS A CHOICE ────────────────────────
  // A bundle is priced and served as a unit: a Meal Deal with an empty slot is not a cheaper Meal Deal,
  // it is not orderable at all, and the server would refuse the very next attempt for the same reason.
  // Removing just the constituent would leave the customer in a loop they cannot see the cause of. So
  // the deal goes, and the sentence NAMES it so they can re-add it with a different choice — the deal
  // picker is two taps away and every other deal is untouched.
  //
  // ⚠️ USED BY BOTH REFUSAL PATHS. The pay-at-hatch 409 and the card refusal are the same defect from
  // two directions, so they share this and cannot drift.
  const applySoldOutRemoval = (shortItems: { name: string; remaining: number }[]) => {
    const gone = shortItems.filter(s => Math.max(0, s.remaining) === 0).map(s => s.name)
    // What the basket WILL hold once the state updates land — computed here, from the values this
    // render already has, because the copy has to name what went and setState answers too late.
    const keptItems = basket.filter(b => {
      const short = shortItems.find(s => s.name === b.menuItem.name)
      return !short || Math.max(0, short.remaining) > 0
    })
    const doomedDeals = appliedDeals.filter(d =>
      Object.values(d.slots || {}).some(n => n && gone.includes(String(n))))
    const removedItems = basket.filter(b => gone.includes(b.menuItem.name)).map(b => b.menuItem.name)
    const removedDeals = doomedDeals.map(d => d.bundle.name)

    capBasketToRemaining(shortItems)
    if (doomedDeals.length) {
      setAppliedDeals(prev => prev.filter(d =>
        !Object.values(d.slots || {}).some(n => n && gone.includes(String(n)))))
    }

    const removed = [...new Set([...removedItems, ...removedDeals.map(n => `your ${n} deal`)])]
    const emptied = removed.length > 0
      && keptItems.length === 0
      && appliedDeals.length - doomedDeals.length === 0
    return { removed, emptied }
  }

  // Total qty across all variants of an item (for UI badge and stock checks)
  const getQty = (itemName: string) => basket.filter(b => b.menuItem.name === itemName).reduce((s, b) => s + b.quantity, 0)

  // Item modal helpers
  const openItemModal = (item: MenuItem, modGroups: ModifierGroup[], upsells: MenuItem[] = [], editCartKey?: string) => {
    // editCartKey set → EDIT mode (variant-row ✏️): prefill mods+notes from the existing line. ALWAYS written
    // into itemModal (value or undefined) so an ADD-open can never inherit a stale edit key. Upsells: never
    // staged in edit.
    const editLine = editCartKey ? basket.find(b => b.cartKey === editCartKey) : undefined
    setItemModal({ item, modGroups, upsells, editCartKey })
    setModalMods(editLine?.modifiers ?? [])
    setModalNotes(editLine?.specialInstructions ?? '')
    setModalUpsells([])
  }

  // Group-aware toggle: single-select groups (max_choices===1) deselect siblings (radio), multi
  // respects any max cap — all via the shared lib/modifier-rules helper (one source of truth).
  const toggleModalMod = (opt: ModifierOption, group: ModifierGroup) => {
    setModalMods(prev => toggleWithGroupRules(prev, opt, group))
  }

  // Toggle a staged upsell (select/deselect) — mirrors toggleModalMod; committed on confirm.
  const toggleModalUpsell = (name: string) => {
    setModalUpsells(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }

  const confirmAddFromModal = () => {
    if (!itemModal) return
    // Required-group gate (A1) — applies to BOTH add and edit (an edit that unsets a required option blocks).
    if (validateModifierSelection(itemModal.modGroups, modalMods).unmetGroupIds.length > 0) return

    // ── EDIT MODE (variant-row ✏️) — remove the old line + re-create the variant, carrying its quantity
    //    INVISIBLY. ONE atomic basket update (operator remove-and-re-add shape): no-op / merge-on-collision /
    //    replace-preserving-qty. Upsells are NEVER committed in edit. ──
    if (itemModal.editCartKey) {
      const editKey = itemModal.editCartKey
      const target = basket.find(b => b.cartKey === editKey)
      if (target) {
        // Client option-pool guard for NET-NEW options only (the removed old line frees its own; unchanged
        // options net to zero). Matches addItem's silent no-op on a blocked pool; the server submit-check
        // remains the authoritative backstop.
        const oldNames = new Set(target.modifiers.map(m => m.name))
        const netNew = modalMods.filter(m => !oldNames.has(m.name)).map(m => m.name)
        if (netNew.length && optionAddBlocked(netNew)) return   // blocked → keep the modal open, no change
        const newKey = makeCartKey(itemModal.item.name, modalMods, modalNotes)
        if (newKey !== editKey) {                                // newKey === editKey → NO-OP, basket untouched
          setBasket(prev => {
            const idx = prev.findIndex(b => b.cartKey === editKey)
            if (idx < 0) return prev
            const t = prev[idx]
            const cIdx = prev.findIndex((b, i) => i !== idx && b.cartKey === newKey)
            if (cIdx >= 0)   // COLLISION → fold qty into the existing line, drop the edited one
              return prev.map((b, i) => (i === cIdx ? { ...b, quantity: b.quantity + t.quantity } : b)).filter((_, i) => i !== idx)
            // NO COLLISION → replace the edited line, PRESERVING its quantity (block edit, no split)
            return prev.map((b, i) => (i === idx ? { ...t, modifiers: modalMods, specialInstructions: modalNotes, cartKey: newKey } : b))
          })
        }
      }
      setItemModal(null); setModalMods([]); setModalNotes(''); setModalUpsells([])
      return
    }

    // ── ADD MODE (BYTE-IDENTICAL to before) ──
    addItem(itemModal.item, modalMods, modalNotes)
    // Commit selected upsells ONCE here (not on tap) — each as its OWN-category basket line
    // (capacity-correct: drink ≠ pizza windows), tagged source:'upsell'.
    itemModal.upsells
      .filter(u => modalUpsells.includes(u.name))
      .forEach(u => addItem(u, [], '', 'upsell'))
    setItemModal(null)
    setModalMods([])
    setModalNotes('')
    setModalUpsells([])
  }

  // Required-group enforcement for the open item modal (recomputed each render off the live
  // selection). Drives both the per-group "unmet" highlight and the Add-to-basket disable.
  const modalUnmetGroupIds = itemModal
    ? validateModifierSelection(itemModal.modGroups, modalMods).unmetGroupIds
    : []

  // ── Grouped menu ────────────────────────────────────────────────────────────
  const groupedMenu = useMemo(() => {
    if (!menu) return []
    return groupByCategory(menu.items, menu.categories?.map(c => c.name))
  }, [menu])

  // 🔴 B2 — THE ONE ARRAY. Both the chips and the sections map over `menuCategories`, and it is
  // derived from `groupedMenu`, which is built from `menu.items` — the POST-FILTER list. NEVER
  // iterate `menu.categories` here: that is the raw category table, and the customer's menu is not
  // the operator's. The server drops a whole category when it is disabled, and in per-dish allergen
  // mode it drops items whose allergens are unconfirmed, so a category can hold items for the
  // operator and none for the customer. groupByCategory only emits categories that HAVE items, so
  // Pizzeria Gusto's empty `Specials` has never had a chip and must never gain a heading. Two
  // derivations would put an empty heading in the list and shift every jump target after it.
  const menuCategories = useMemo(() => groupedMenu.map(([cat]) => cat), [groupedMenu])
  // 🔴 B5 — A SINGLE-CATEGORY TRUCK RENDERS NO CHIP BAR, so nothing may be offset by its height.
  // The chip bar is gated on `length > 1` in the render; this mirrors that gate exactly. Getting it
  // wrong puts a bar's worth of dead space above every heading on a one-category menu.
  const hasChipBar = menuCategories.length > 1
  // THE READABLE TOP: everything pinned, measured. Used as the sections' CSS scroll-margin-top AND as
  // the spy's pin line — one number, so a heading cannot land somewhere the spy disagrees with.
  const pinnedTop = chipBarTop + (hasChipBar ? tabBarH : 0)
  // ⚠️ `selectedCategory` IS NOW A HIGHLIGHT, NOT A FILTER. It no longer decides what renders — every
  // category renders — it decides which chip is orange. The self-heal is kept: a category that
  // disappears on a menu reload must not leave a chip lit that no longer exists.
  const selectedCategory = (activeCategory && menuCategories.includes(activeCategory)) ? activeCategory : (menuCategories[0] ?? null)

  // Feed the scroll handler without re-attaching it. Runs after every render, so the spy always reads
  // the current categories and the current measured pin line.
  useEffect(() => { spyStateRef.current = { cats: menuCategories, pinnedTop } })

  // ── KEEP THE ACTIVE CHIP VISIBLE IN THE BAR ──────────────────────────────────────────────────────
  // With five categories the chip row overflows horizontally, so the spy can light a chip that is
  // scrolled out of sight — on Gusto, reaching Dough Balls highlights something the customer cannot
  // see. This nudges the BAR (never the page) just far enough to bring it back.
  //
  // 🔴 IT DOES NOT CENTRE, AND THAT IS THE WHOLE DESIGN. Centring on every spy change would make the
  // bar twitch continuously while someone scrolls a long category — 23 pizzas would be 23 little
  // animations. The rule is: already fully visible ⇒ DO NOTHING; clipped right ⇒ bring it to the right
  // edge; clipped left ⇒ bring it to the left edge. The bar is STILL unless it has something to fix.
  //
  // 🔴 NOT `scrollIntoView`. Even `block: 'nearest', inline: 'nearest'` walks ANCESTORS: it is defined
  // to scroll every scrollable box up to the viewport, so it can move the PAGE vertically — yanking
  // the menu out from under someone who is reading it — whenever the bar is not already perfectly in
  // view (mid-pin, address bar collapsing, a status banner appearing). Setting the bar's own
  // `scrollLeft` cannot touch anything but the bar. This was a considered choice, not an assumption.
  //
  // 🔴 IT RESPECTS THE EXISTING SPY LOCK, and adds no second one. `selectedCategory` is the only
  // input, and during a chip-tap jump the spy is locked, so the active category changes ONCE (to the
  // tapped chip) instead of stepping through every category in transit. The bar therefore makes one
  // correction for the chip you tapped, not one per category the page flies past.
  //
  // ⚠️ COALESCED, SO A FAST FLICK CANNOT QUEUE ANIMATIONS. A flick can change the active category
  // several times in a few frames. Each change cancels the previous pending frame (`cancelAnimationFrame`)
  // and the work is done at frame time from the CURRENT DOM, so only the final category is ever acted
  // on. Two things then guarantee it settles correctly rather than animating through each one: at most
  // one `scrollTo` is issued per frame, and a new scroll on the same box supersedes an in-flight smooth
  // scroll rather than being appended to it.
  useEffect(() => {
    if (!selectedCategory) return
    if (chipRafRef.current) cancelAnimationFrame(chipRafRef.current)
    chipRafRef.current = requestAnimationFrame(() => {
      chipRafRef.current = 0
      const bar = chipScrollRef.current
      const chip = chipRefs.current.get(selectedCategory)
      if (!bar || !chip) return
      // No overflow ⇒ every chip is already visible ⇒ there is nothing this could correct. A bar that
      // fits must never move.
      if (bar.scrollWidth <= bar.clientWidth + 1) return
      const barRect = bar.getBoundingClientRect()
      const chipRect = chip.getBoundingClientRect()
      if (barRect.width === 0) return                       // not laid out / hidden — nothing to measure
      // Breathing room so the chip does not sit flush against the edge and read as half-cut.
      const MARGIN = 12
      let delta = 0
      if (chipRect.left < barRect.left + MARGIN) {
        delta = chipRect.left - barRect.left - MARGIN        // clipped LEFT  → bring to the left edge
      } else if (chipRect.right > barRect.right - MARGIN) {
        delta = chipRect.right - barRect.right + MARGIN      // clipped RIGHT → bring to the right edge
      } else {
        return                                               // 🔴 FULLY VISIBLE → DO NOTHING
      }
      const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      bar.scrollTo({ left: bar.scrollLeft + delta, behavior: reduce ? 'auto' : 'smooth' })
    })
    return () => { if (chipRafRef.current) { cancelAnimationFrame(chipRafRef.current); chipRafRef.current = 0 } }
  }, [selectedCategory])

  // ── Upsells ─────────────────────────────────────────────────────────────────
  // Inline upsells — item-specific, shown immediately when a matching item is in basket
  const getItemUpsells = (item: MenuItem): MenuItem[] => {
    if (!menu) return []
    const rules = menu.upsell_rules.filter(r => r.trigger_category === item.category)
    const suggestions: MenuItem[] = []
    for (const rule of rules) {
      const matchedItems = menu.items.filter(i =>
        // Show ALL configured available upsells every time, regardless of basket contents (NO
        // basket-wide exclusion — that depleted the list across parents). The modal's modalUpsells
        // staged toggle starts empty per open and is basket-independent, so an upsell already in the
        // basket (from another pizza or the Dips tab) shows UNSELECTED here; toggling never touches
        // other lines. Per-parent staged choice, committed as normal basket lines on close.
        i.category === rule.suggest_category &&
        i.available
      ).slice(0, rule.max_suggestions)
      suggestions.push(...matchedItems)
    }
    return suggestions
  }

  const upsellSuggestions = useMemo(() => {
    if (!menu) return []
    const basketCats = new Set(basket.map(b => b.menuItem.category))
    const seen = new Set<string>()
    const result: MenuItem[] = []
    for (const b of basket) {
      for (const rule of menu.upsell_rules.filter(r => r.trigger_category === b.menuItem.category)) {
        if (basketCats.has(rule.suggest_category)) continue
        menu.items.filter(i => i.category === rule.suggest_category && !seen.has(i.name))
          .slice(0, rule.max_suggestions)
          .forEach(c => { seen.add(c.name); result.push(c) })
      }
    }
    return result
  }, [basket, menu])

  // ── Deals ───────────────────────────────────────────────────────────────────
  const maxDealsApplicable = (bundle: Bundle) => {
    if (!menu) return 0
    const slots = getSlotCats(bundle)
    if (!slots.length) return 0
    return Math.min(...slots.map((cat: string) =>
      basket.filter(b => b.menuItem.category === cat).reduce((s, b) => s + b.quantity, 0)
    ))
  }

  const dealsApplied = (bundle: Bundle) => appliedDeals.filter(d => d.bundle.name === bundle.name).length

  const addDeal = (bundle: Bundle) => {
    setSelectedBundleForModal(bundle)
    setDealModalOpen(true)
  }

  const handleApplyDeal = (deal: any, slots: Record<string, string>, price: number, discount: number, rawSlots: Record<string, string>, modifierExtra: number, slotModifiers: Record<string, { name: string; price: number }[]>, slotNotes: Record<string, string>) => {
    const itemsTakenFromBasket: string[] = dealConsumedCartKeys(rawSlots)
    setBasket(prev => consumeBasketItemsForDeal(prev, rawSlots))

    setAppliedDeals(prev => [...prev, { bundle: deal, slots, itemsTakenFromBasket, modifierExtra, slotModifiers, slotNotes }])
    setDealModalOpen(false)
  }

  const removeDeal = (i: number) => {
    const deal = appliedDeals[i]
    if (deal.itemsTakenFromBasket.length > 0) {
      setBasket(prev => prev.filter(b => !deal.itemsTakenFromBasket.includes(b.cartKey)))
    }
    setAppliedDeals(prev => prev.filter((_, idx) => idx !== i))
  }


  const getSlotOptions = (cat: string) => basket.filter(b => b.menuItem.category === cat).map(b => b.menuItem)

  // ── Totals ──────────────────────────────────────────────────────────────────
  const { itemsTotal, dealsTotal, dealSavings, subtotal, discountAmt, total } = useMemo(() => {
    return calculateOrderTotal(
      basket.map(b => ({
        name: b.menuItem.name,
        price: b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0),
        quantity: b.quantity,
      })),
      appliedDeals.map(d => ({ bundle: d.bundle, slots: d.slots, modifierExtra: d.modifierExtra })),
      menu?.items || [],
      appliedCode
    )
  }, [basket, appliedDeals, appliedCode, menu])

  const hasItems = basket.length > 0 || appliedDeals.length > 0
  const totalItems = basket.reduce((s, b) => s + b.quantity, 0)
  // ── A2 FIX: THE LAST CATEGORY MUST ALWAYS REACH THE TOP ─────────────────────────────────────────
  // 🔴 THE OLD RULE WAS RIGHT FOR TABS AND WRONG FOR ONE LIST. It was
  //     minHeight: max(0, viewportH - 121)   on the WHOLE list
  // which padded a short category out to a viewport so its tabs could pin. Its own comment called it
  // self-cancelling — "inert once the category's content exceeds it" — and with every category
  // rendered at once the combined list ALWAYS exceeds it, so the padding silently became 0 exactly
  // when it was needed. The last category could then never be scrolled to the pin line: its chip
  // would be untappable-to and, with a spy, permanently unlit.
  // THE FIX MOVES THE FLOOR FROM THE LIST TO THE LAST SECTION. `lastSectionMinHeight` below makes the
  // FINAL section at least as tall as the readable area, so there is always a screen's worth of
  // scroll beneath its heading. Still self-cancelling — a long last category exceeds it and the
  // min-height is inert — but it can no longer be cancelled by the categories ABOVE it.
  // 🔴 B6 — IT IS `dvh`, NOT JS. `100dvh` is the DYNAMIC viewport height: the browser tracks the iOS
  // address bar itself, so the value is correct through a collapse instead of being recomputed from a
  // stale `window.innerHeight` mid-gesture. The two subtracted terms are measured element heights.
  const lastSectionMinHeight = `calc(100dvh - ${Math.round(pinnedTop)}px - ${Math.round(footerHeight)}px)`

  // Shared order breakdown (deal lines + item lines + discount + total). Rendered in BOTH the footer
  // basket peek AND the form-sheet review summary so the two can never drift. DISPLAY-ONLY — no
  // add/remove here; quantity edits happen on the menu cards (close the sheet to change).
  const orderBreakdownEl = (
    <div className="bg-slate-50 rounded-xl p-3 mb-2 space-y-1.5 border border-slate-100">
      {/* Deals first */}
      {appliedDeals.map((deal, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs">
            <span className="font-semibold uppercase tracking-wide text-slate-500">🎁 {deal.bundle.name}</span>
            <span className="text-slate-700 font-medium">£{deal.bundle.bundle_price.toFixed(2)}</span>
          </div>
          {Object.keys(deal.slots).sort().map(slotKey => {
            const itemName = deal.slots[slotKey]
            if (!itemName) return null
            const mods = deal.slotModifiers?.[slotKey] || []
            const note = deal.slotNotes?.[slotKey]
            return (
              <div key={slotKey}>
                <div className="pl-3 text-xs text-slate-600">{itemName}</div>
                {mods.map(m => (
                  <div key={m.name} className="flex justify-between pl-6 text-[10px] text-slate-400">
                    <span>{m.name}</span>
                    {m.price > 0 && <span>+£{m.price.toFixed(2)}</span>}
                  </div>
                ))}
                {note && <div className="pl-6 text-[10px] text-slate-400 italic">📝 {note}</div>}
              </div>
            )
          })}
        </div>
      ))}
      {/* Standalone items GROUPED by category — category headings in the truck's configured order
          (menu.categories), items within each group in basket tap/insertion order. Unknown
          categories (not in config) trail at the end so no item is ever dropped. */}
      {(() => {
        const catOrder = menu?.categories?.map(c => c.name) ?? []
        const byCat = new Map<string, BasketItem[]>()
        for (const b of basket) {
          const cat = b.menuItem.category
          if (!byCat.has(cat)) byCat.set(cat, [])
          byCat.get(cat)!.push(b)
        }
        const orderedCats = [
          ...catOrder.filter(c => byCat.has(c)),
          ...[...byCat.keys()].filter(c => !catOrder.includes(c)),
        ]
        return orderedCats.map(cat => (
          <div key={cat}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{cat}</p>
            <div className="pl-3">
              {byCat.get(cat)!.map(b => (
                <OrderLineItem
                  key={b.cartKey}
                  name={b.menuItem.name}
                  quantity={b.quantity}
                  unitPrice={b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0)}
                  basePrice={b.menuItem.price}
                  modifiers={b.modifiers}
                  specialInstructions={b.specialInstructions}
                  variant="customer"
                />
              ))}
            </div>
          </div>
        ))
      })()}
      {discountAmt > 0 && (
        <div className="flex justify-between text-xs">
          <span className="text-green-600">Code: {appliedCode?.code}</span>
          <span className="text-green-600 font-medium">-£{discountAmt.toFixed(2)}</span>
        </div>
      )}
      <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-1.5">
        <span>Total</span><span>£{total.toFixed(2)}</span>
      </div>
    </div>
  )

  // ── Queue-aware ASAP time (pre-order, queue-aware) ───────────────────────────
  // Uses same batch logic as truck dashboard calcQueueAwareReadyTime.
  // New items placed after existing queue:
  //   totalQty = queueByCat[cat] + newItems[cat]
  //   finalBatch = ceil(totalQty / batchSize)
  //   prepTime = finalBatch × prepSecs
  // If batch 2 has space, new items slot in — finish with batch 2.
  // If full, spill into batch 3.
  const customerAsapTime = useMemo(() => {
    if (!event?.start_time) return asapSlot

    const [startH, startM] = event.start_time.split(':').map(Number)
    const eventStartMins = startH * 60 + startM
    const extraWait = truck?.extra_wait_mins ?? 0

    const catConfigs: Record<string, { secs: number; batch: number }> =
      Object.keys(serverCatConfigs).length > 0
        ? serverCatConfigs
        : Object.fromEntries(
            (menu?.categories || []).map(c => [
              c.name.toLowerCase(),
              { secs: c.prep_secs ?? 0, batch: c.batch_size ?? 1 }
            ])
          )

    const todayIso = getLocalDateInTz(eventTz) // event-tz date — a future LOCAL event is never "today"
    const isToday = eventDateIso === todayIso
    const nowMins = getNowMinsInTz(eventTz) // event tz, NOT device time — agrees with the slot floors
    const beforeEvent = !isToday || nowMins < eventStartMins

    if (!menu) {
      if (!extraWait) return asapSlot || event.start_time
      const rounded = Math.round((eventStartMins + extraWait) / 5) * 5
      return `${String(Math.floor(rounded/60)).padStart(2,'0')}:${String(rounded%60).padStart(2,'0')}`
    }

    // Count basket items by category
    const newByCat: Record<string, number> = {}
    basket.forEach(b => {
      const cat = b.menuItem.category?.toLowerCase() || 'mains'
      newByCat[cat] = (newByCat[cat] || 0) + b.quantity
    })
    appliedDeals.forEach(d => {
      Object.values(d.slots).filter(Boolean).forEach(name => {
        const item = menu.items.find(m => m.name === name)
        const cat = item?.category?.toLowerCase() || 'mains'
        newByCat[cat] = (newByCat[cat] || 0) + 1
      })
    })

    // Global-ceiling lead: COUNTED items (cooking + ticked-instant) need ceil(total / capacity)
    // capacity windows, so the order can't be ready before (windows − 1) × capacityStep after it
    // starts. This is the ONLY way counted-INSTANT items advance the estimate — they contribute
    // nothing to the per-category prep loop below (secs 0). Mirrors the engine's capacity math so
    // "Around HH:MM" tracks the placeable slot; backwardAsap stays authoritative when present.
    let extraCeilingMins = 0
    const cap = capacityInputs?.kitchenCapacity ?? null
    const capStep = Math.max(1, Math.round(capacityInputs?.capacityWindowMins ?? 5))
    if (cap != null && cap > 0 && hasItems) {
      let totalCounted = 0
      for (const [cat, qty] of Object.entries(newByCat)) {
        const cfg = catConfigs[cat] as { secs: number; batch: number; countsToCapacity?: boolean } | undefined
        if (!cfg) continue
        if (cfg.secs || cfg.countsToCapacity) totalCounted += qty
      }
      extraCeilingMins = Math.max(0, Math.ceil(totalCounted / cap) - 1) * capStep
    }

    let asapMins: number

    if (beforeEvent) {
      // Pre-event model: batch 1 is pre-cooked and ready at event start.
      // Each batch beyond the first adds one prep cycle on top of event start.
      // When basket is empty, simulate +1 per queued category so we show the
      // realistic "next order ready at" time rather than the raw event start.
      let extraBatchMins = 0
      const catsToCheck = hasItems
        ? Object.keys(newByCat)
        : Object.keys(queueByCat)
      for (const cat of catsToCheck) {
        const newQty = hasItems ? (newByCat[cat] || 0) : 1
        const cfg = catConfigs[cat] || { secs: 0, batch: 1 }
        if (!cfg.secs) continue
        const totalQty = (queueByCat[cat] || 0) + newQty
        const totalBatches = Math.ceil(totalQty / cfg.batch)
        const mins = Math.ceil(Math.max(0, totalBatches - 1) * cfg.secs / 60)
        extraBatchMins = Math.max(extraBatchMins, mins)
      }
      asapMins = eventStartMins + Math.max(extraBatchMins, extraCeilingMins) + extraWait
    } else {
      // During / after event: now + full prep time for all batches in queue (or the ceiling lead).
      const prepMins = Math.ceil(calcQueueAwareReadySecs(newByCat, queueByCat, catConfigs, 0) / 60)
      asapMins = Math.max(eventStartMins, nowMins + Math.max(prepMins, extraCeilingMins) + extraWait)
    }

    if (asapMins === eventStartMins && extraWait === 0) return event.start_time

    const roundedMins = Math.ceil(asapMins / 5) * 5 // ceil-to-grid (next 5-min slot), never round DOWN below the floor
    const h = Math.floor(roundedMins / 60)
    const m = roundedMins % 60
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`

  }, [basket, appliedDeals, menu, event, asapSlot, hasItems, queueByCat, serverCatConfigs, truck, eventDateIso, capacityInputs, eventTz, nowTick])

  // Convert HH:MM to total minutes for comparison
  const toMins = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }

  // ── Backward-occupancy fit (Stage 2): which slots can't fit the current order ──
  // The customer is HARD-BLOCKED from a slot whose backward cooking windows (ending at it)
  // can't hold the order (no spare, or run-off-front) — no override on this surface. Uses
  // the SAME engine (fitOrderBackward) as the operator/server, fed by /api/slots capacityInputs.
  const basketByCat = useMemo(() => {
    const m: Record<string, number> = {}
    basket.forEach(b => { const c = b.menuItem.category?.toLowerCase() || 'mains'; m[c] = (m[c] || 0) + b.quantity })
    appliedDeals.forEach(d => Object.values(d.slots).filter(Boolean).forEach(name => {
      const item = menu?.items.find(mi => mi.name === name)
      const c = item?.category?.toLowerCase() || 'mains'
      m[c] = (m[c] || 0) + 1
    }))
    return m
  }, [basket, appliedDeals, menu])

  const unfittableSlots = useMemo(() => {
    const out = new Set<string>()
    if (!capacityInputs || Object.keys(basketByCat).length === 0) return out
    const back = projectBackwardOccupancy(
      capacityInputs.productionSlotUnits || {},
      serverCatConfigs,
      capacityInputs.eventStartMins,
      capacityInputs.kitchenCapacity,
      capacityInputs.capacityWindowMins ?? 5,
    )
    // NOW-CLAMP (today only — mins-of-day would mis-compare for a future-date event): a basket can't
    // fit a slot whose cooking windows extend before now. void nowTick forces a live re-derive.
    void nowTick
    const nowClamp = eventDateIso === getLocalDateInTz(eventTz) ? getNowMinsInTz(eventTz) : Number.NEGATIVE_INFINITY
    for (const s of availableSlots) {
      const fit = fitOrderBackward(back, toMins(s.collection_time), basketByCat, serverCatConfigs, capacityInputs.kitchenCapacity, capacityInputs.eventStartMins, capacityInputs.capacityWindowMins ?? 5, nowClamp, (capacityInputs.productionSlotUnits || {})[s.collection_time] || {})
      if (!fit.fits) out.add(s.collection_time)
    }
    return out
  }, [capacityInputs, basketByCat, serverCatConfigs, availableSlots, eventTz, eventDateIso, nowTick])

  // Backward-fit ASAP (Stage 3): the earliest slot the order actually fits — the SAME
  // engine the picker/server use, so the displayed "Around HH:MM" and the auto-booked slot
  // agree. Null (no basket / no capacity data) ⇒ fall back to the queue-based estimate.
  const backwardAsap = useMemo(() => {
    if (!capacityInputs || Object.keys(basketByCat).length === 0) return null
    // Time-eligible candidates only (past / too-soon / grace), NOT capacity-filtered: feed every
    // such slot so earliestBackwardFitSlot can reach a worst-case-vetoed-but-actually-fits slot
    // (e.g. anchovies at a pizza-full 6pm with ceiling spare). Capacity is decided category-aware
    // inside fitOrderBackward; the !too_soon filter preserves the lead/ASAP floor.
    const avail = availableSlots.filter(s => !isSlotPast(s, eventTz, eventDateIso) && !s.too_soon && !s.is_grace)
    // NOW-CLAMP (today only): the backward-fit ASAP can't place cooking windows before now.
    const nowClamp = eventDateIso === getLocalDateInTz(eventTz) ? getNowMinsInTz(eventTz) : Number.NEGATIVE_INFINITY
    return earliestBackwardFitSlot(
      avail.map(s => ({ collection_time: s.collection_time, production_slot: s.collection_time })),
      capacityInputs.productionSlotUnits || {},
      serverCatConfigs,
      capacityInputs.kitchenCapacity,
      capacityInputs.eventStartMins,
      basketByCat,
      Number.NEGATIVE_INFINITY,
      capacityInputs.capacityWindowMins ?? 5,
      nowClamp,
    )
  }, [capacityInputs, basketByCat, serverCatConfigs, availableSlots, eventTz, eventDateIso, nowTick])

  // ASAP is selected by DEFAULT (asapChosen initial = true) and submits as slot=null,
  // so there's nothing to auto-populate on load — the selection no longer depends on a
  // concrete slotHour/Minute being filled in. This is the fix for "looks selected but
  // can't place" and for the basket recompute clearing ASAP.

  // Snap only an EXPLICITLY chosen specific time back to ASAP if a basket change pushes
  // the ready time past it. ASAP itself is never touched here — it persists through
  // basket edits; only the "Around …" estimate (customerAsapTime) updates.
  useEffect(() => {
    if (asapChosen) return
    if (!selectedSlot || !customerAsapTime) return
    if (toMins(selectedSlot) < toMins(customerAsapTime)) {
      setAsapChosen(true)
      setSlotHour(''); setSlotMinute('')
    }
  }, [customerAsapTime]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyCode = () => {
    if (!menu) return
    const found = menu.codes.find(c => c.code === discountInput.trim().toUpperCase())
    if (found) { setAppliedCode(found); setDiscountError('') }
    else { setAppliedCode(null); setDiscountError('Code not recognised') }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  // Light, permissive contact-format validation (Part B). Email stays REQUIRED; phone stays
  // OPTIONAL (we don't send SMS, so requiring it is friction for data we can't act on). We only
  // block on a CLEARLY-invalid format — err toward accepting edge cases, no double-entry.
  //  - email: plausible x@y.z (one @, a dot in the domain). Empty ⇒ invalid (it's required).
  //  - phone: empty is fine; if given, strip spaces/dashes/brackets then accept a UK-ish number
  //    (0… or +44/44… followed by 9–11 digits). Permissive on purpose.
  const emailValid = isValidEmail(email)
  const phoneValid = phone.trim() === '' || isValidUKPhone(phone)
  // Inline-error visibility: only nag once the field has invalid CONTENT (never on empty).
  const emailError = email.trim() !== '' && !emailValid
  const phoneError = phone.trim() !== '' && !phoneValid

  const handleSubmitClick = () => submitOrder({})

  // ── 🔴 THE ONE MOUNT AND THE ONE TEARDOWN. THERE IS NO SECOND OF EITHER. ───────────────────────
  // MOUNT: `el.mount(paymentBoxEl)` below — the only call to `.mount()` in this file.
  // TEARDOWN: `el.unmount()` in this effect's cleanup — the only call to `.unmount()` in this file.
  //
  // 🔴 HOW A THIRD PATH IS RULED OUT, AND IT IS NOT DISCIPLINE. React runs an effect's cleanup before
  // every re-run and once on unmount. Both things that can close this stage change a DEPENDENCY:
  //   1. closing the stage      → the overlay unmounts → the callback ref fires with null
  //                              → `paymentBoxEl` becomes null → cleanup runs
  //   2. replacing the payment  → `payment.clientSecret` changes → cleanup runs, then the new mount
  // So teardown is not something a close has to REMEMBER to do; it is what React does when the inputs
  // change. A future close that forgets to call anything still tears down, because to close at all it
  // must remove the node or clear the payment. THAT is the guarantee — no reachable close can skip it.
  //
  // ⚠️ `elementReady` IS CLEARED IN THE CLEANUP, and that is the whole defence for the Pay button.
  // A torn-down Element cannot leave a button enabled behind it.
  useEffect(() => {
    if (!payment?.clientSecret || !paymentBoxEl) return
    let cancelled = false
    let mounted: StripeElement | null = null
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!pk) {
      // ⚠️ REPORTED VIA THE SAME REJECTION PATH AS EVERY OTHER SETUP FAILURE, not by calling setState in
      // the effect body — a synchronous setState there is a cascading render.
      console.error('[order] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set — cannot mount the card form')
    }
    ;(pk ? loadStripeJs() : Promise.reject(new Error('no publishable key')))
      .then(StripeCtor => {
        if (cancelled || !pk) return
        const stripe = StripeCtor(pk, { stripeAccount: payment.stripeAccount })
        // Appearance only — no behaviour.
        const elements = stripe.elements({
          clientSecret: payment.clientSecret,
          appearance: { theme: 'flat', variables: { colorPrimary: '#f97316', borderRadius: '12px', fontFamily: 'inherit' } },
        })
        // ⚠️ WALLETS ON. Apple Pay and Google Pay render as native buttons where the browser and device
        // support them AND the domain is registered with Stripe (a Dashboard action, not code).
        const el = elements.create('payment', {
          layout: { type: 'accordion', defaultCollapsed: false, radios: true, spacedAccordionItems: false },
          wallets: { applePay: 'auto', googlePay: 'auto' },
        })
        el.mount(paymentBoxEl)                       // ← THE ONE MOUNT
        mounted = el
        el.on('ready', () => { if (!cancelled) setElementReady(true) })
        stripeRef.current = stripe
        elementsRef.current = elements
      })
      .catch(err => {
        console.error('[order] Stripe.js failed to load:', err)
        if (cancelled) return
        setPayError('We could not load the card form — check your connection and try again. Your basket is saved, and you have not been charged.')
        setPayStage('failed')
      })
    return () => {
      cancelled = true
      // ← THE ONE TEARDOWN. Guarded because a load that never resolved has nothing to unmount, and
      // wrapped because Stripe throws if the node has already gone — which must not break a cleanup.
      try { mounted?.unmount() } catch { /* already detached — nothing to undo */ }
      mounted = null
      stripeRef.current = null
      elementsRef.current = null
      setElementReady(false)
    }
  }, [payment?.clientSecret, payment?.stripeAccount, paymentBoxEl])

  // ── 🔴 CONFIRM. THE ONE PLACE MONEY IS AUTHORISED. ──────────────────────────────────────────────
  const confirmCardPayment = async () => {
    const stripe = stripeRef.current
    const elements = elementsRef.current
    // ⚠️ `elementReady` IS IN THE GUARD, not just on the button. A keyboard Enter, a double-tap that
    // lands between renders, or any future caller must hit the same precondition the button shows.
    if (!stripe || !elements || !payment || !elementReady) return
    setPayStage('authorising')
    setPayError(null)
    // ── 🔴 THE RETURN GOES THROUGH THE PROMOTER, NOT STRAIGHT TO THE CONFIRMATION. ────────────────
    // This pointed at `?confirm=` directly, which made /api/payments/return unreachable — nothing else
    // in the codebase names it — so the webhook has promoted every card order alone since the Payment
    // Element shipped, detached, on an invocation the runtime is free to suspend. Order 25 waited 23.5s
    // for its order row because of it.
    // 🔴 THE CUSTOMER LANDS IN EXACTLY THE SAME PLACE. Every exit from that route 303s to
    // `${base}/trucks/${truck}/order?confirm=${draft}` — character for character the URL this line
    // used to build — having promoted the draft on the way. Nothing about the confirmation screen,
    // its polling, or its rendering changes.
    // ⚠️ `payment.orderKey` IS THE DRAFT KEY, which is also the order's key. Both names are the same
    // uuid by construction; the route takes it as `draft` because at that moment no order exists yet.
    const returnUrl = `${window.location.origin}/api/payments/return?draft=${encodeURIComponent(payment.orderKey)}&truck=${encodeURIComponent(slug)}`
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      })
      if (result.error) {
        // ⚠️ DECLINED, OR THE DETAILS WERE WRONG. NOT page-replacing: the basket, the slot and the
        // customer's details are all still here, and the Element stays mounted so they can correct the
        // card and press again. Stripe's own message is shown — it is written for customers.
        console.error('[order] authorisation failed:', result.error.code, result.error.message)
        setPayError(result.error.message || 'That payment could not be authorised. No money has been taken — please try another card, or choose Pay at the truck.')
        setPayStage('failed')
        return
      }
      // ── 🔴 AUTHORISED, AND THE PAGE IS STILL STANDING. DO NOT THROW IT AWAY TO ASK A QUESTION. ──
      // Manual capture ⇒ `requires_capture`: money HELD, not taken. `redirect: 'if_required'` means
      // Stripe did NOT navigate for an ordinary card, so at this instant the customer is still here with
      // their basket, their slot, their details and their event in memory. This used to assign
      // `window.location.href` unconditionally, which destroyed all of it before knowing whether it
      // needed to — and when promotion REFUSED, the customer was rebuilt on a fresh document with no
      // event, no basket, and one sentence in the query string. They landed on the event picker.
      // 🔴 SO ASK FIRST. Same route, same promotion, same `after()` continuation — `json=1` only changes
      // the SHAPE of the answer. A refusal is then rendered in place, by the notice the pay-at-hatch
      // refusal has always used, with the basket untouched and editable.
      // ⚠️ ANY FAILURE TO ASK FALLS BACK TO THE NAVIGATION THIS REPLACES. A network blip must not strand
      // a customer whose card is authorised: the route is idempotent (promoteDraft claims once), so
      // going there for real is always safe.
      let outcome: { outcome?: string; orderKey?: string; message?: string; soldOut?: string[] } | null = null
      try {
        const r = await fetch(`${returnUrl}&json=1`, { cache: 'no-store' })
        outcome = r.ok ? await r.json() : null
      } catch (fetchErr) {
        console.error('[order] could not read the promotion outcome — falling back to the redirect:', fetchErr)
      }
      if (!outcome?.outcome) { window.location.href = returnUrl; return }

      if (outcome.outcome === 'refused') {
        // 🔴 THE SAME PLACE, THE SAME PANEL, THE SAME AFFORDANCES AS A SOLD-OUT PAY-AT-HATCH REFUSAL.
        // paymentFailedNotice already exists and already renders the server's sentence whole, beside the
        // stock notice, inside the order sheet. Nothing new is rendered and no copy is written here.
        // ⚠️ THE AUTHORISATION IS GONE — promoteDraft cancelled it before replying — so `payment` is
        // dropped rather than kept. Keeping it would re-present a dead intent on the next tap; clearing
        // it makes the card button submit afresh, which is what "retryable" has to mean here.
        setPayment(null)
        setPayStage('idle')
        setPayError(null)
        setStageOpen(false)
        // ── 🔴 TAKE THE SOLD-OUT LINES OUT RATHER THAN ASKING THE CUSTOMER TO FIND THEM. ───────────
        // The server names them (`soldOut`), the page owns the basket, and only the page can say what
        // was in it. So the sentence is composed of two halves: the SERVER'S, rendered whole and
        // unchanged — it is the one that says no money was taken, and promoteDraft is fenced off — and
        // the PAGE'S, which is the only half that can be true about a basket the server never saw.
        // ⚠️ AND THE SERVER HALF STILL READS CORRECTLY ALONE. The redirect leg (Stripe sent the browser
        // away for 3DS) rebuilds this page with no basket to edit, seeds the notice from the query
        // string, and appends nothing — which is right, because nothing was removed there.
        applySoldOutRemoval((outcome.soldOut ?? []).map(name => ({ name, remaining: 0 })))
        // 🔴 THE SERVER'S SENTENCE, WHOLE AND ALONE. It already names every line and already says the
        // money is untouched — lib/payments/sold-out-copy writes it once for all three routes, so there
        // is nothing left for the page to append and nothing that can drift out of step with it.
        setPaymentFailedNotice(outcome.message || 'We could not place your order. No money has been taken.')
        // The sheet may be scrolled to wherever the card form was. The refusal is the only thing on
        // screen that matters now, and it renders at the top of the sheet — so go there.
        sheetScrollRef.current?.scrollTo({ top: 0 })
        // The item that sold out must disappear from the menu they are looking at — the same re-fetch
        // the stock-409 branch does, for the same reason.
        if (event?.id) {
          fetch(`/api/menu/${slug}?event_id=${event.id}`, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.menu) { setMenu(d.menu); if (d.truck) setTruck(d.truck) } })
            .catch(() => null)
        }
        return
      }

      // 'confirmed' (the order exists) or 'pending' (promotion still running) — both go to the
      // confirmation screen, which is where the basket is MEANT to be gone, and which polls a pending
      // order in exactly as it does today.
      window.location.href = `${window.location.origin}/trucks/${encodeURIComponent(slug)}/order?confirm=${encodeURIComponent(outcome.orderKey || payment.orderKey)}`
    } catch (err) {
      console.error('[order] confirmPayment threw:', err)
      setPayError('Something went wrong taking that payment. No money has been taken — please try again, or choose Pay at the truck.')
      setPayStage('failed')
    }
  }

  // ── 🔴 CLOSING THE STAGE KEEPS THE AUTHORISATION. ───────────────────────────────────────────────
  // The customer is going back to look at their order, not abandoning payment. The PaymentIntent is
  // still `requires_payment_method` and still the right amount, so it is kept and re-presented when
  // they return — which is what makes reopen cost no second draft and no second intent.
  // ⚠️ IT DOES NOT TOUCH THE ELEMENT. Closing the stage unmounts the overlay, which detaches the host
  // node, which fires the ONE teardown. Doing it here as well would be a second path.
  const closePaymentStage = () => { setStageOpen(false); setPayStage('idle'); setPayError(null) }

  // ── 🔴 THE BASKET FINGERPRINT — HOW "DID IT CHANGE" IS DECIDED. ─────────────────────────────────
  // An authorisation is for a fixed AMOUNT on a fixed order. If any of that moved while the stage was
  // closed, the held intent is for the wrong thing and must not be presented.
  // ⚠️ NOT THE TOTAL ALONE. Two different baskets can come to the same money — swap a £6.50 item for
  // another £6.50 item and the price is identical while the order is not, and the draft carries the
  // LINES, not just the sum. So the fingerprint is the composition: every line with its modifiers and
  // quantity, every deal, the slot, the discount code and the total.
  // ⚠️ Deliberately built from the same values the submit body sends, so it cannot describe a basket
  // different from the one the server would price.
  const basketFingerprint = useMemo(() => JSON.stringify({
    i: basket.map(b => [b.menuItem.name, b.quantity, (b.modifiers || []).map(m => m.name).sort(), b.specialInstructions || '']),
    d: appliedDeals.map(d => [d.bundle.name, d.slots, d.slotModifiers, d.slotNotes]),
    s: asapChosen ? null : (selectedSlot || null),
    c: appliedCode?.code || null,
    t: Math.round(total * 100),
    e: event?.id ?? null,
  }), [basket, appliedDeals, asapChosen, selectedSlot, appliedCode, total, event?.id])

  // ── 🔴 THE CARD BUTTON. THE ONE DECISION POINT: REOPEN, OR AUTHORISE AFRESH. ────────────────────
  // Reopen is free and must be preferred; a fresh authorisation costs a draft and a PaymentIntent, and
  // leaves the previous one to be cancelled.
  const openCardPayment = () => {
    // 🔴 SAME BASKET, LIVE AUTHORISATION ⇒ JUST SHOW IT AGAIN. No fetch, no draft, no intent. The
    // client secret is still held, the Element re-mounts against it, and the customer pays.
    if (payment && payment.fingerprint === basketFingerprint) {
      setPayError(null)
      setPayStage('mounting')
      setStageOpen(true)
      return
    }
    // ⚠️ EITHER no authorisation yet, OR the basket moved under one. submitOrder decides which, and
    // carries the superseded key so the server cancels before it creates. See its card branch.
    void submitOrder({})
  }

  const submitOrder = async (extra: { upsellEvents?: any[] } = {}) => {
    if (!truck || !menu || !name || !email || !hasItems || !event) return
    // Block a clearly-invalid email or (if provided) phone — permissive format guard (Part B).
    if (!emailValid || !phoneValid) return
    // ASAP (asapChosen) is a genuine active choice — it submits slot=null and the
    // server resolves the earliest ready window. A specific time requires selectedSlot.
    if (truck.mode === 'village' && !selectedSlot && !asapChosen) return
    setSubmitting(true)
    setPauseNotice(null)
    setStockNotice(null)
    // Cleared alongside the other two, for the same reason: a notice from the PREVIOUS attempt must
    // not sit under the one this attempt produces. Without it a customer who fixed a menu-change and
    // then hit a sold-out line would read both panels and not know which one still applies.
    setMenuChangedNotice(null)
    setSoldOutNotice(null)
    setPaymentFailedNotice(null)
    try {
      // 🔴 CAPTURED AT SEND TIME, NOT READ AT RESPONSE TIME. `payByCard` is state (:425) and the radio
      // at :3630 can move it while the request is in flight, so reading it in the failure branch could
      // describe a branch the customer switched to AFTER submitting. This is the value actually sent.
      const sentByCard = !!(payByCard && truck?.card_payments_ready)
      // A prior card attempt means a Payment Element has already been shown and may have been paid on
      // — see the SUBMIT_UNCONFIRMED_CARD note. Captured here for the same reason.
      const hadPriorPayment = !!payment?.orderKey
      const res = await fetch('/api/orders/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truckId: slug, customerName: name, customerEmail: email, customerPhone: phone,
          slot: asapChosen ? null : (selectedSlot || null), eventDate: eventDateIso, eventId: event?.id ?? null,
          items: basket.map(b => ({
            name: b.menuItem.name,
            quantity: b.quantity,
            unit_price: b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0),
            modifiers: b.modifiers.length > 0 ? b.modifiers : undefined,
            specialInstructions: b.specialInstructions || undefined,
            source: (b as any).source || 'direct',
          })),
          deals: appliedDeals.map(d => ({ name: d.bundle.name, slots: d.slots, slotModifiers: d.slotModifiers, slotNotes: d.slotNotes, price: d.bundle.bundle_price })),
          discountCode: appliedCode?.code || null,
          subtotal: subtotal, discountAmt: discountAmt, total, notes: notes || null,
          upsellEvents: extra.upsellEvents || [],
          // ── 🔴 THE ONE CONFIRMATION VALUE THE SERVER CANNOT COMPUTE ────────────────────────────
          // The "Around HH:MM" the customer is looking at as they press this button. Derived here from
          // the slots fetch and nowhere else — the server has no equivalent, so without this field the
          // URL-reachable confirmation could never show it. Same precedence as the ASAP button itself.
          // ⚠️ DISPLAY ONLY. It decides nothing: not the slot, not capacity, not money. The server
          // stores it on the row and reads it back onto one line of the receipt.
          asapEstimate: asapChosen ? (backwardAsap || asapSlot || customerAsapTime || null) : null,
          // ── 🔴 AUTHORIZE-THEN-CAPTURE. AN INTENT, NOT A CLAIM. ────────────────────────────────────
          // `true` says only "this customer chose to pay by card". The server re-reads readiness and,
          // if it holds, writes a DRAFT and authorises instead of creating an order — so an abandoned
          // card form no longer leaves an unpaid order holding a slot. If the truck cannot take a card
          // the server falls through and places the order unpaid, exactly as before.
          // ⚠️ ANDed with `card_payments_ready` here only to avoid a pointless server round-trip on a
          // truck that plainly cannot take one; the server never trusts this value.
          payByCard: sentByCard,
          // 🔴 ONE LIVE AUTHORISATION PER BASKET. If we are holding one and the basket has since moved,
          // its key rides along so the SERVER cancels it before creating the replacement — cancel-then-
          // create, in one request, so there is never a moment when two intents are live for one basket.
          // Null on a first attempt, which is every ordinary order.
          supersedeOrderKey: payment?.orderKey ?? null,
        }),
      })
      // 🔴 CHECK THE BODY BEFORE TRUSTING IT. This was a bare `await res.json()`, so a response that
      // is not JSON — a platform 504/502, whose body is an HTML error page — threw a SyntaxError that
      // landed in the catch at the end of this function and was shown to the customer verbatim:
      //     Unexpected token '<', "<!DOCTYPE "... is not valid JSON
      // on a page-replacing error screen, mid-checkout.
      // ⚠️ `null` ONLY WHEN THE BODY IS NOT JSON — NOT on every non-ok. The 423 (paused) and 403
      // (event ended) branches below are non-ok responses that DO carry JSON and must keep working
      // exactly as they do; this changes only the case where our route never answered at all.
      const data = await res.json().catch(() => null)
      if (data === null) throw new Error(sentByCard && !hadPriorPayment ? SUBMIT_UNCONFIRMED_CARD : SUBMIT_UNCONFIRMED_CHECK)
      // Paused (423): non-destructive — keep the basket + order UI, show a dismissible notice,
      // and let the customer wait and re-submit. Do NOT setError (page-replacing) or clear basket.
      if (res.status === 423 || data?.paused) {
        setPauseNotice('Orders are paused right now — please check back shortly. Your order is saved here.')
        return
      }
      // Event ended (403, server status guard): the operator finished the event (possibly early).
      // Safety net for a customer who didn't catch the poll — block ordering with a clear notice
      // instead of a silent failure. Folds into isOrderingBlocked via the sticky "closed" banner.
      if (res.status === 403 && (data?.event_status === 'closed' || data?.event_status === 'cancelled')) {
        setEventEnded(true)
        setPauseNotice(null)
        return
      }
      // Lock contention past the retry budget (very rare, sustained load): the server did NOT
      // insert (no-oversell guarantee). Non-destructive — keep the basket, ask to re-submit.
      if (res.status === 409 && data?.retry) {
        setPauseNotice('We are handling a lot of orders right now — please tap Place order again in a moment. Your order is saved here.')
        return
      }
      // Out of stock (409, atomic guard): non-destructive HARD STOP — cap the basket to what's
      // actually left, refresh availability, show a warning, and let the customer re-submit.
      // Mirrors the pause-423 pattern (keep basket, never page-replacing). Customer can't exceed.
      if (res.status === 409 && data?.stock) {
        const shortItems: { name: string; remaining: number }[] = Array.isArray(data.items) ? data.items : []
        // ⚠️ capBasketToRemaining IS STILL WHAT CAPS THE ITEMS — this wraps it to take out a DEAL whose
        // constituent is gone, which it deliberately never did, and to report what went. Same defect as
        // the card path, so the same helper: a deal left standing with a sold-out slot is refused again
        // on the next attempt, and the customer cannot see why.
        applySoldOutRemoval(shortItems)
        // ── ⚠️ ONE HANDLER, THREE REFUSALS, AND THEY ARE NOT THE SAME SENTENCE ──────────────────────
        // This branch answers the sold-out guard AND the server's unpriceable-line refusal, because
        // everything they NEED is identical: keep the basket, re-fetch the menu, let the customer
        // re-submit. What differs is the words.
        // 🔴 SOLD OUT (remaining 0) IS THE SAME EVENT THE CARD PATH REPORTS, so it now reads the same
        // sentence, from the same builder, in the same position — one wording for one item, several
        // items, or a basket the removal emptied. ⚠️ WITHOUT THE MONEY CLAUSE: nothing was ever paid on
        // this path, and "we have not taken any money" answers a question this customer did not have.
        // 🔴 A CAP IS NOT A SELL-OUT AND KEEPS ITS OWN WORDS. `remaining: 2` means the line was REDUCED,
        // not removed, so the shared sentence ("We've removed it") would be a plain untruth. That case
        // renders exactly the fragment it always did.
        // ⚠️ A MIXED RESPONSE (one line at 0, another capped to 2) reports the sell-out, because that is
        // the one the customer cannot fix by looking — the capped line's new quantity is on screen.
        const soldOutNames = shortItems.filter(s => Math.max(0, s.remaining) === 0).map(s => s.name)
        const soldOutSentence = soldOutRefusalMessage(soldOutNames, 'ordering')
        if (data.menuChanged) {
          setMenuChangedNotice(
            typeof data.error === 'string' && data.error
              ? data.error
              : 'The menu has changed. Please check your order before placing it.'
          )
        } else if (soldOutSentence) {
          setSoldOutNotice(soldOutSentence)
        } else {
          setStockNotice(
            shortItems.length
              ? shortItems.map(s => `only ${s.remaining} ${s.name} left`).join(', ')
              : 'some items just sold out'
          )
        }
        // Refresh stock_remaining badges from the authoritative menu read.
        if (event?.id) {
          fetch(`/api/menu/${slug}?event_id=${event.id}`, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.menu) { setMenu(d.menu); if (d.truck) setTruck(d.truck) } })
            .catch(() => null)
        }
        // The notices render at the top of the sheet; the customer pressed a button at the bottom of it.
        sheetScrollRef.current?.scrollTo({ top: 0 })
        return
      }
      // ── 🔴 CARD PAYMENT COULD NOT BE SET UP. NO ORDER EXISTS AND NONE WILL. ─────────────────────
      // The server refused rather than quietly placing an unpaid order — see the note at the card fork
      // in /api/orders/submit for why the old fall-back was the defect and not the mitigation.
      // ⚠️ NON-DESTRUCTIVE, LIKE THE PAUSE AND STOCK BRANCHES: the basket is untouched, the sheet stays
      // open, and the customer can switch to Pay at the truck or try again. The server composed the
      // sentence; it is rendered whole.
      if (res.status === 503 && data?.cardUnavailable) {
        setPayError(typeof data.error === 'string' && data.error
          ? data.error
          : 'We could not set up card payment just now, so your order has not been placed and you have not been charged.')
        setPayStage('failed')
        return
      }
      if (!res.ok) throw new Error(data.error || 'Order failed')

      // ── 🔴 AUTHORISE FIRST: NO ORDER EXISTS YET, AND THAT IS THE POINT. ──────────────────────────
      // The server priced the basket, wrote a draft and created a PaymentIntent with manual capture.
      // Nothing is reserved: no slot, no stock, no order number, no email. The order is created only
      // once the money is authorised, by the webhook.
      // 🔴 THE CUSTOMER DOES NOT LEAVE THE SITE. The Payment Element mounts in this page, on this
      // component, with the basket still in memory — which is what makes a declined card recoverable.
      // The hosted Checkout that used to live here is gone; there is no `window.location.href` on the
      // ordinary card path any more, and therefore no unmount.
      if (data.requiresAuthorization && data.clientSecret) {
        setPayment({
          clientSecret:  data.clientSecret as string,
          stripeAccount: data.stripeAccount as string,
          orderKey:      data.orderKey as string,
          totalPence:    Math.round(Number(data.total ?? 0) * 100),
          // Stamped with the basket it was authorised FOR, so a later reopen can tell "show this again"
          // from "this is for a basket that no longer exists".
          fingerprint:   basketFingerprint,
        })
        setPayStage('mounting')
        setPayError(null)
        setStageOpen(true)
        return
      }

      setSubmittedOrderId(data.orderId)
      setSubmittedAutoAccepted(!!data.autoAccepted)
      setSubmittedConfirmedSlot(data.slot ?? null)
      setSubmittedRequestedSlot(data.requestedSlot ?? (selectedSlot || null))
      setSubmittedSlotChanged(!!data.slotChanged)
      // ASAP only: capture the on-screen estimate (same precedence as the ASAP button) so the
      // confirmation can flag a silent bump (server has no "requested" slot for ASAP → slotChanged=false).
      setSubmittedAsapEstimate(asapChosen ? (backwardAsap || asapSlot || customerAsapTime || null) : null)
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally { setSubmitting(false) }
  }

  // ── States ──────────────────────────────────────────────────────────────────

  // ── 🔴 THE URL-REACHABLE CONFIRMATION. IT SITS FIRST, ABOVE EVERY OTHER BRANCH, DELIBERATELY. ─────
  // A customer returning from Stripe has no component state, so `?confirm=<order_key>` is how they get
  // the same screen a pay-at-hatch customer sees. Both render <OrderConfirmation>; only the data source
  // differs.
  //
  // 🔴 WHY IT IS ABOVE `loading`, `error` AND THE FEATURE GATE — AND NOT NEXT TO `if (submitted)`,
  // WHICH IS WHERE IT LOGICALLY BELONGS. Each of the three below would swallow it, and each failure is
  // worse than the last:
  //   - `loading` (the next line) is set false ONLY by the menu fetch's .finally(). This screen renders
  //     no menu, and the fetch is gated off for it (see the effects), so `loading` would never clear —
  //     a customer who has just paid would sit on "Loading menu..." indefinitely.
  //   - `error && !submitted` fires on any menu-fetch failure with "This truck is not currently taking
  //     orders." A paid customer must not be told the truck is closed.
  //   - 🔴 THE FEATURE GATE IS THE WORST ONE. `advance_preordering` is NOT held by plan 'starter', so on
  //     a starter truck this branch would render "Online ordering not available" — to a customer holding
  //     a receipt for an order that truck has just taken and been paid for. The gate is correct about
  //     placing NEW orders and has no business judging a completed one.
  // ⚠️ THE COST OF SITTING FIRST is that this branch owns its own loading and error states. That is the
  // right way round: it needs one order row and nothing else, so it should not wait on, or fail with,
  // machinery it does not use.
  if (confirmOrderKey) {
    if (confirmLoading) {
      return <Shell><Hdr slug={slug} truck={null} scrolled={false} showBack={false} /><div className="flex-1 flex items-center justify-center"><p className="text-slate-400 animate-pulse font-medium">Loading your order...</p></div></Shell>
    }
    // ⚠️ THE SAME 😕 PATTERN THE REST OF THE PRODUCT USES for a customer-facing dead end — the order
    // page's own error branch below and /order/[id]/manage both render exactly this shape. Not a new
    // treatment, and deliberately not a 404 page: the customer has a way back to the truck.
    if (confirmError || !confirmOrder) {
      return (
        <Shell><Hdr slug={slug} truck={null} scrolled={false} />
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-4 mx-auto">😕</div>
              <p className="text-slate-600 font-medium">{confirmError || 'We couldn&apos;t find that order.'}</p>
              <a href={`/trucks/${slug}/order`} className="mt-4 inline-block text-orange-600 font-bold hover:underline">← Back to truck page</a>
            </div>
          </div>
        </Shell>
      )
    }
    return (
      <OrderConfirmation
        slug={slug}
        // A minimal truck object for the header — name and logo are all <Hdr> reads. NOT the `truck`
        // state, which is populated by the menu fetch this branch deliberately never makes.
        truck={{ ...(truck ?? {} as TruckData), name: confirmOrder.truck_name ?? '', logo: confirmOrder.truck_logo ?? null } as TruckData}
        truckName={displayTruckName(confirmOrder.truck_name)}
        orderId={confirmOrder.id ?? null}
        // The row's own status IS the auto-accept answer: place_order_atomic writes 'confirmed' or
        // 'pending' in the INSERT, so there is nothing else to consult.
        autoAccepted={confirmOrder.status === 'confirmed'}
        confirmedSlot={confirmOrder.slot ?? null}
        requestedSlot={confirmOrder.requested_slot ?? null}
        // 🔴 DERIVED, NOT STORED. There is no `slot_changed` column on purpose — the comparison IS the
        // fact, and a stored copy could disagree with it. See the migration header.
        slotChanged={!!confirmOrder.requested_slot && confirmOrder.requested_slot !== confirmOrder.slot}
        asapEstimate={confirmOrder.asap_estimate ?? null}
        preferredSlot={confirmOrder.slot ?? null}
        lines={(confirmOrder.items ?? []).map((it: any, i: number) => ({
          key: `${it?.name ?? 'item'}-${i}`,
          name: String(it?.name ?? ''),
          quantity: Number(it?.quantity ?? 0),
          // Stored `unit_price` already INCLUDES modifiers (the repo-wide convention), so basePrice is
          // reconstructed by subtracting them — the same relationship the in-memory path builds forwards.
          unitPrice: Number(it?.unit_price ?? 0),
          basePrice: Number(it?.unit_price ?? 0) - (it?.modifiers ?? []).reduce((s: number, m: any) => s + Number(m?.price ?? 0), 0),
          modifiers: (it?.modifiers ?? []).map((m: any) => ({ name: String(m?.name ?? ''), price: Number(m?.price ?? 0) })),
          specialInstructions: it?.specialInstructions || undefined,
        }))}
        // ⚠️ SAVINGS ARE NOT SHOWN ON THIS PATH, AND THAT IS RECORDED RATHER THAN PAPERED OVER. The
        // in-memory path computes them live from the menu (`calcDealOriginalPrice`); reproducing that
        // here would mean fetching a menu that may have changed since the order — the price-book audit
        // found three Gusto dishes renamed or deleted under existing orders. A figure that might differ
        // from the one the customer was shown is worse than no figure, so `saving: 0` suppresses the
        // line entirely (`deal.saving > 0` guards it). `orders.deal_savings` exists and would settle
        // this, but the customer path does not populate it — a separate piece of work.
        deals={(confirmOrder.deals ?? []).map((d: any) => ({
          name: String(d?.name ?? ''),
          bundlePrice: Number(d?.price ?? 0),
          saving: 0,
          slots: (d?.slots ?? {}) as Record<string, string>,
          slotModifiers: (d?.slotModifiers ?? {}) as Record<string, { name: string; price: number }[]>,
          slotNotes: (d?.slotNotes ?? {}) as Record<string, string>,
        }))}
        total={Number(confirmOrder.total ?? 0)}
        // 🔴 THE ORDER'S OWN STATE. Written by the webhook from Stripe's event, never by this page and
        // never from the URL — a `?confirm=` in the address bar says WHICH order, never that it is paid.
        paymentStatus={confirmOrder.payment_status ?? 'unpaid'}
        email={confirmOrder.customer_email ?? null}
        // False by construction: a customer who arrived here from Stripe did start a card payment, so
        // the "we couldn't start the card payment" notice cannot be true for them.
        cardFallbackNotice={false}
      />
    )
  }

  if (loading) return <Shell><Hdr slug={slug} truck={null} scrolled={false} /><div className="flex-1 flex items-center justify-center"><p className="text-slate-400 animate-pulse font-medium">Loading menu...</p></div></Shell>

  if (error && !submitted) return (
    <Shell><Hdr slug={slug} truck={truck} scrolled={false} />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-4 mx-auto">😕</div>
          <p className="text-slate-600 font-medium">{error}</p>
          <a href={`/trucks/${slug}/order`} className="mt-4 inline-block text-orange-600 font-bold hover:underline">← Back to truck page</a>
        </div>
      </div>
    </Shell>
  )

  if (truck && !hasFeature(truck.plan, 'advance_preordering')) {
    return (
      <Shell>
        <Hdr slug={slug} truck={truck} scrolled={false} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-4 mx-auto">🚚</div>
            <p className="font-bold text-slate-900 mb-1">Online ordering not available</p>
            <p className="text-slate-500 text-sm">This truck takes walk-up orders at the hatch.</p>
            <a href={`/trucks/${slug}/order`} className="mt-4 inline-block text-orange-600 font-bold hover:underline">← Back</a>
          </div>
        </div>
      </Shell>
    )
  }

  // ── 🔴 THE CONFIRMATION, IN-MEMORY PATH — UNCHANGED IN BEHAVIOUR ──────────────────────────────────
  // Reached exactly as before: submitOrder sets these values and flips `submitted`, and this early
  // return fires. No fetch, no URL, no navigation. The MARKUP now lives in <OrderConfirmation> so the
  // card path cannot drift from it — see that component's header.
  // ⚠️ `paymentStatus="unpaid"` reproduces the hardcoded "Pay at the truck" string this screen has
  // always shown here. The order was created moments ago on this very request and is unpaid by
  // construction, so this is a statement of fact rather than a default.
  // ⚠️ The basket/deal mapping below is the SAME arithmetic the inline JSX did — `unitPrice` still
  // includes modifiers and `saving` is still original-minus-bundle, floored at zero.
  if (submitted) return (
    <OrderConfirmation
      slug={slug}
      truck={truck}
      truckName={truckName}
      orderId={submittedOrderId}
      autoAccepted={submittedAutoAccepted}
      confirmedSlot={submittedConfirmedSlot}
      requestedSlot={submittedRequestedSlot}
      slotChanged={submittedSlotChanged}
      asapEstimate={submittedAsapEstimate}
      preferredSlot={selectedSlot || null}
      lines={basket.map(b => ({
        key: b.cartKey,
        name: b.menuItem.name,
        quantity: b.quantity,
        unitPrice: b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0),
        basePrice: b.menuItem.price,
        modifiers: b.modifiers,
        specialInstructions: b.specialInstructions,
      }))}
      deals={appliedDeals.map(deal => {
        const origPrice = calcDealOriginalPrice(deal, menu?.items || [])
        return {
          name: deal.bundle.name,
          bundlePrice: deal.bundle.bundle_price,
          saving: origPrice > deal.bundle.bundle_price ? origPrice - deal.bundle.bundle_price : 0,
          slots: deal.slots,
          slotModifiers: deal.slotModifiers ?? {},
          slotNotes: deal.slotNotes ?? {},
        }
      })}
      total={total}
      paymentStatus="unpaid"
      email={email}
      cardFallbackNotice={cardFallbackNotice}
    />
  )

  // ── Main form ───────────────────────────────────────────────────────────────
  const isPaused = !!truck?.paused

  // Block ordering after event end time (only applies to today's event)
  const isEventClosed = (() => {
    if (!event?.end_time || !event?.date_iso) return false
    const todayIso = localTodayIso() // local date (s.7) — don't mark a future event "closed"
    if (event.date_iso !== todayIso) return false
    const [endH, endM] = event.end_time.split(':').map(Number)
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
    return nowMins > endH * 60 + endM
  })()

  // Closed = clock backstop (isEventClosed, past published end) OR status-driven (eventEnded, operator
  // finished — possibly early). Either blocks ordering, matching the server's status guard + the
  // finished-early promise.
  const isClosed = isEventClosed || eventEnded
  // ORDERING GATE / CRASH GUARD: a null-time event is not orderable. The server already returns
  // ordering_available:false for it, but we ALSO gate on the event's own times here so a null-time event
  // can NEVER render the ordering flow regardless of how it loaded — a graceful "not available yet" state,
  // never the (fake-windowed) ordering UI, never a crash. (All the start/end .split sites are already
  // null-guarded; this stops the silent 10:00–23:00 fallback path from being orderable.)
  const orderingTimeNotSet = !!event && (!event.start_time || !event.end_time)
  const isOrderingBlocked = isPaused || isClosed || orderingTimeNotSet

  // Shown in place of the event card when the events fetch failed (after auto-retries) — friendly,
  // not alarming, with a Retry that re-runs the events effect (setReloadKey bump). Used by both the
  // eventsError branch AND the catch-all, so the event section is NEVER a silent blank.
  // ── 🔴 THE COPY NAMES EVENTS, BECAUSE EVENTS IS WHAT FAILED. ────────────────────────────────────
  // It used to read "We couldn't load the menu right now" and "Please check your connection", and both
  // were false in the one incident this card has ever had: /api/menu returned 200 throughout, and the
  // connection was fine — the server answered, with a refusal we had issued ourselves. Naming the wrong
  // subsystem is worse than being vague, because it sends whoever investigates to the wrong route; that
  // sentence cost a full audit. And blaming the customer's connection for our own rate limit is simply
  // untrue. This wording is true for BOTH causes this card can have — a rate-limit refusal and a genuine
  // network failure — which is why it names neither.
  const eventsRetryCard = (
    <div className="mt-3 bg-slate-100 rounded-xl px-4 py-4 text-center">
      <p className="text-slate-600 text-sm font-medium">We couldn&apos;t load this truck&apos;s events.</p>
      <p className="text-slate-400 text-xs mt-0.5 mb-3">Give it a moment, then tap to try again.</p>
      <button
        onClick={() => setReloadKey(k => k + 1)}
        disabled={eventLoading}
        className="inline-block bg-orange-600 text-white font-bold px-5 py-2 rounded-lg text-sm hover:bg-orange-700 disabled:opacity-60"
      >
        {eventLoading ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  )

  return (
    <Shell>
      <Hdr slug={slug} truck={truck} scrolled={isScrolled} bannerRef={demoBannerRef} />

      {/* Time-not-set banner — a null-time event can't be ordered against (engine needs the times). Shown
          INSTEAD of treating it as orderable; intentional + reassuring, never a broken/crash screen. */}
      {orderingTimeNotSet && !isClosed && (
        <div ref={timeBannerRef} style={{ top: stickyTop }} className="sticky z-40 bg-slate-800 text-white px-4 py-3 shadow-md">
          <div className="max-w-lg mx-auto">
            <p className="font-black text-sm">Ordering isn’t available for this event yet</p>
            <p className="text-xs text-slate-300 mt-0.5">The truck hasn’t set the event time yet — please check with them directly. You’ll be able to order here once it’s set.</p>
          </div>
        </div>
      )}

      {/* Event closed banner — clock end (isEventClosed) OR operator finished (eventEnded, incl. early).
          DEMO gets a different SECOND LINE only: the heading, the container, the sticky offset and the
          real-customer copy are all untouched, so a live truck's closed page is byte-for-byte what it was.

          WHY DEMO NEEDS ITS OWN LINE: a demo event is provisioned auto_close:false, so its window simply
          elapses with the event still 'open' and this clock backstop fires. Until now /api/dashboard
          silently rolled the window forward on every dashboard load and the page healed itself; that roll
          is gone (it breached the per-slot capacity ceiling and carried the visitor's own test order into
          the next day — see lib/demo-restart.ts). So an elapsed demo now genuinely stays closed, and this
          is the surface the welcome popup explicitly sends people to. "We hope to see you next time!" is
          the wrong thing to say to someone evaluating the product: it reads as the demo being over, when
          in fact a new service is one button away on the dashboard.

          ⚠️ NO RESTART CONTROL HERE, and NO LINK. Starting a service is an OPERATOR action and this is the
          customer view. And a link is not buildable: a demo's slug and dashboard_token are generated
          INDEPENDENTLY (lib/provision-truck.ts:171-179 — "leaking one must not hand over the others"), so
          this page holds the slug and cannot derive the dashboard URL. Exposing the token through a
          customer-facing response to make a link possible would weaken that boundary for real trucks too.
          Hence the copy names the dashboard without pretending to navigate there — see the report. */}
      {isClosed && (
        <div ref={closedBannerRef} style={{ top: stickyTop }} className="sticky z-40 bg-slate-800 text-white px-4 py-3 shadow-md">
          <div className="max-w-lg mx-auto">
            <p className="font-black text-sm">Ordering has closed</p>
            <p className="text-xs text-slate-300 mt-0.5">
              {isDemo
                ? 'This demo service has ended — that’s the event window running out, exactly as a real one would. Open your demo dashboard again and choose "Start a new service" to set up a fresh one. Your menu stays as it is.'
                : eventEnded && !isEventClosed
                ? 'This event has ended — no more orders are being taken.'
                : `Online ordering for this event ended at ${formatTime(event?.end_time || '')}. We hope to see you next time!`}
            </p>
          </div>
        </div>
      )}

      {/* Paused banner — stays visible while scrolling. Gated on `event` (a specific event is
          selected, i.e. the single-event order view) so it NEVER renders on the event-chooser
          screen. truck.paused/pauseReason reflect the SELECTED event (/api/menu is fetched with
          its event_id + refreshed by the catch-up poll), so this shows only for the event the
          customer is actually ordering from. A pre-order event can't be offline-paused (the monitor
          only pauses live status='open' events), so it never shows the offline variant. */}
      {event && isPaused && !isClosed && (
        <div ref={pausedBannerRef} style={{ top: stickyTop }} className="sticky z-40 bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="flex items-start gap-3 max-w-lg mx-auto">
            <span className="text-xl flex-shrink-0">
              {truck?.pauseReason === 'account_closing' ? '🚫' : truck?.pauseReason === 'offline' ? '📡' : '⏸️'}
            </span>
            <div className="flex-1">
              {/* 🔴 'account_closing' IS NOT A PAUSE AND MUST NOT READ LIKE ONE. The other two say
                  "temporarily" and "check back shortly" — for a business that is closing its account
                  those are false promises to a customer who would keep returning to an order page that
                  is never coming back. Distinct copy, and no "try again" invitation. */}
              <p className="text-sm font-semibold text-amber-800">
                {truck?.pauseReason === 'account_closing'
                  ? 'This business is no longer taking online orders'
                  : truck?.pauseReason === 'offline'
                    ? 'Online ordering temporarily unavailable'
                    : 'Orders are temporarily paused'
                }
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {truck?.pauseReason === 'account_closing'
                  ? 'Online ordering has closed. Please contact them directly if you need to get in touch.'
                  : truck?.pauseReason === 'offline'
                    ? "We're having a connection issue but you can still order at the window. Check back soon!"
                    : 'Check back shortly or order at the window when you arrive.'
                }
              </p>
            </div>
            <button
              onClick={async () => { setRechecking(true); try { await refetchMenu() } catch { /* keep banner + basket */ } finally { setRechecking(false) } }}
              disabled={rechecking}
              className="text-xs text-amber-700 font-medium underline flex-shrink-0 mt-0.5 disabled:opacity-60"
            >
              {rechecking ? 'Checking…' : 'Check again'}
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-6" style={{ paddingBottom: `${footerHeight + 8}px` }}>

        {/* Unconfirmed event — ordering blocked */}
        {truck?.ordering_available === false && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="text-5xl mb-4">🕐</div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Orders not open yet</h2>
            <p className="text-sm text-slate-500 max-w-xs">
              {truckName} hasn&apos;t confirmed this event yet. Check back closer to the date or follow them on social media for updates.
            </p>
          </div>
        )}

        <div className={truck?.ordering_available === false ? 'hidden' : ''}>

        {/* Truck hero — logo, name, event details */}
        <div className="text-center mb-5">
          {/* ⚠ NO PLACEHOLDER WHEN THERE IS NO LOGO. This used to fall back to a 🚚 emoji in an orange
              circle, which reads as a stand-in for a truck that has not finished setting up rather than
              as branding. A truck without a logo now shows its NAME and nothing else. */}
          {truck?.logo && (
            <Image
              src={truck.logo}
              alt={truckName}
              width={96}
              height={96}
              className="w-24 h-24 object-contain rounded-full border border-slate-200 shadow-md bg-white mx-auto mb-4"
            />
          )}
          <h1 className="text-2xl font-black text-slate-900">
            Order from {truckName}
          </h1>
          {/* Event details card.
              2b — HIDDEN IN DEMO. The whole block is the event card OR the chooser, and neither means
              anything here: a demo event is a synthetic "Demo event · 11:30–14:00" window with no venue.
              Selection still happens in the effect above, so ordering works — only the display is gone. */}
          {isDemo ? null : eventLoading ? (
            <div className="mt-3 bg-slate-100 rounded-xl px-4 py-3 animate-pulse">
              <p className="text-slate-400 text-sm">Loading events...</p>
            </div>
          ) : eventsError ? (
            eventsRetryCard
          ) : noEvents ? (
            <div className="mt-3 bg-slate-100 rounded-xl px-4 py-3">
              <p className="text-slate-500 text-sm font-medium">No upcoming events in the next 2 weeks</p>
              <p className="text-slate-400 text-xs mt-0.5">Check back soon or visit the truck page for updates</p>
            </div>
          ) : events.length > 0 ? (
            <div className="mt-3 text-left">
              {event ? (
                // Scoped to ONE event (deep-linked ?event_id, or the only event). Single-event header
                // using the SAME card as the truck profile (TruckListCard) — DRY, identical look — with
                // the CTA hidden (already ordering for this event). "Change" returns to the profile
                // chooser when there are alternatives.
                <TruckListCard
                  event={eventToVillage(event, truckName)}
                  slug={slug}
                  hideOrderButton
                  compact
                  cornerAction={events.length > 1 && (
                    <Link href={`/trucks/${slug}`} className="text-orange-600 text-xs font-bold hover:underline">
                      Change event
                    </Link>
                  )}
                />
              ) : (
                // No event selected → the ORDER-ENTRY SCHEDULE: pick a confirmed event. The SAME
                // TruckListCard as the truck profile; its Pre-order / Order now CTA deep-links to
                // ?event_id=<truck_events.id>. Only confirmed/open events are returned by /api/events.
                <>
                  <p className="text-xs font-black text-orange-600 uppercase tracking-wider mb-2 text-center">Choose which event to order for</p>
                  {events.map((e) => {
                    // V8.3 calendar: "Pre-orders open [date]" under the card when this event's open is still
                    // in the FUTURE (rule + event date, derived — no new data). Don't fork TruckListCard.
                    const poOpenDate = preorderOpenDate(truck?.preorder_open_rule, e.date_iso)
                    const poNotOpenYet = poOpenDate != null && localTodayIso() < poOpenDate
                    const poLabel = poNotOpenYet ? formatPreorderOpenLabel(truck?.preorder_open_rule, e.date_iso) : null
                    return (
                      <div key={e.id}>
                        <TruckListCard event={eventToVillage(e, truckName)} slug={slug} forceOrderButton />
                        {poLabel && <p className="text-[11px] text-amber-700 font-semibold text-center mt-1 mb-2">⏳ {poLabel}</p>}
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          ) : (
            // Belt-and-braces: not loading, no error flag, no events, not noEvents — only reachable
            // via a failure that slipped past the flags. NEVER a silent blank → show the retry card.
            eventsRetryCard
          )}
        </div>

        {/* Ordering UI (deals + menu) renders only once an event is scoped — until then the
            block above is the order-entry schedule. Picking an event (?event_id) reveals this. */}
        {event && (<>

        {/* MEAL DEALS — flat cards, before menu, hidden if none available */}
        {menu && menu.bundles.filter(b => b.available).length > 0 && (
          <div className="mb-4">
            <h2 className="text-xs font-black text-orange-600 uppercase tracking-widest mb-2 px-1">🎁 Meal deals</h2>
            <div className="space-y-2">
              {menu.bundles.filter(b => b.available).map(bundle => {
                const applied = dealsApplied(bundle)
                const slots = getSlotCats(bundle)
                const saving = bundle.original_price !== null && bundle.original_price > 0
                  ? bundle.original_price - bundle.bundle_price : null

                return (
                  <div key={bundle.name} className="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3.5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-slate-900 text-sm">{bundle.name}</p>
                            {saving !== null && saving > 0 && (
                              <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">Save £{saving.toFixed(2)}</span>
                            )}
                            {applied > 0 && (
                              <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">✓ {applied} applied</span>
                            )}
                          </div>
                          <p className="text-slate-500 text-xs mt-0.5">{bundle.description}</p>
                        </div>
                        <p className="font-black text-orange-600 text-lg shrink-0">£{bundle.bundle_price.toFixed(2)}</p>
                      </div>
                      <button onClick={() => !isOrderingBlocked && addDeal(bundle)} disabled={isOrderingBlocked}
                        className={`w-full font-bold text-sm py-2 rounded-xl transition-colors active:scale-95 ${isOrderingBlocked ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-orange-600 text-white hover:bg-orange-700'}`}>
                        {isOrderingBlocked ? (isClosed ? 'Ordering closed' : orderingTimeNotSet ? 'Set-up pending' : 'Ordering paused') : applied === 0 ? 'Add deal' : '+ Add another deal'}
                      </button>
                    </div>
                    {/* Applied deal instances - compact summary */}
                    {appliedDeals
                      .filter(deal => deal.bundle.name === bundle.name)
                      .map((deal, localIdx) => {
                        const dynOrig = calcDealOriginalPrice(deal, menu.items)
                        const dynSaving = dynOrig > 0 ? Math.max(0, dynOrig - deal.bundle.bundle_price) : null
                        const globalIdx = appliedDeals.indexOf(deal)
                        const itemsSummary = Object.entries(deal.slots)
                          .filter(([, itemName]) => itemName)
                          .map(([cat, itemName]) => {
                            const mods = deal.slotModifiers?.[cat]
                            return mods?.length ? `${itemName} (+ ${mods.map(m => m.name).join(', ')})` : itemName
                          })
                          .join(' + ')
                        
                        return (
                          <div key={globalIdx} className="border-t border-orange-100 px-4 py-3 bg-orange-50">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-xs font-black text-orange-700">
                                    {appliedDeals.filter(d => d.bundle.name === bundle.name).length > 1 
                                      ? `Deal ${localIdx + 1}` 
                                      : 'Your deal'}
                                  </p>
                                  {dynSaving !== null && dynSaving > 0 && (
                                    <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">Save £{dynSaving.toFixed(2)}</span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 mt-0.5 truncate">{itemsSummary}</p>
                              </div>
                              <button onClick={() => removeDeal(globalIdx)} className="text-[10px] text-orange-400 hover:text-orange-600 font-bold shrink-0">Remove</button>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* (The old "allergens not verified — ask staff" banner was removed — replaced by the
            always-present "Allergen Info" link in the Menu header below, which shows confirmed info
            per display_mode or an honest "not provided — ask the truck" message. Unconfirmed per-item
            allergen chips remain hidden server-side by the verified-gate.) */}

        {/* MENU — grouped by category */}
        {/* ── 🔴 px-2 ON PHONES, px-4 FROM sm: UP. PADDING ONLY — THE FRAME STAYS. ──────────────────
            At 390px the chrome around an item row was 66px: 32px from main's px-4, 32px from this
            card's px-4 and 2px of border. Half of this card's share comes back, taking a row from
            324px to 340px. The BORDER, BACKGROUND, RADIUS AND SHADOW ARE UNTOUCHED, deliberately:
            this card is white on a bg-slate-50 page and the sticky basket bar below it is ALSO white
            (bg-white border-t border-slate-200, fixed bottom-0), so that contrast plus this border is
            the only thing separating the menu from it. Removing the frame would save 2px and cost the
            separation.
            ⚠️ px-2 AND NOT px-0. 8px is what keeps the item text, the thumbnail and the Add button
            clear of a rounded-2xl (16px) corner. px-0 would reclaim 16px more and put content against
            the border at the radius, which reads as a bug even when the arithmetic is right.
            ⚠️ NOTHING CHANGES AT sm: (640px) AND ABOVE. main is max-w-lg (512px), so from 512px up the
            page is already a centred column with empty slate-50 either side — there is no width to
            reclaim there, only the inset to lose. The breakpoint is sm: because it is the ONLY
            breakpoint this file already uses (Hdr), and 640px sits above the 512px cap so every
            viewport that is already width-capped keeps today's look exactly. */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-2 sm:px-4 py-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Menu</h2>
            {/* Allergen Info — ALWAYS present (consistent, predictable entry point in every mode/state).
                The modal resolves what to show by display_mode: confirmed card and/or confirmed per-item
                allergens, or an honest "not provided — ask the truck" message when nothing is confirmed.
                Never shows unconfirmed data (per-item is verified-gated server-side). */}
            <button
              onClick={() => setShowAllergenModal(true)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 underline"
            >
              ⓘ Allergen Info
            </button>
          </div>
          {/* Top-level category tabs — sticky below the page header (h-[60px]). Tap to filter to one
              category; subcategory headers (below) are preserved within it. Finger-sized (≥44px),
              horizontal-scroll on narrow. -mx-N px-N makes the white bar span the menu card's padding. */}
          {/* ── ⚠️ THE NEGATIVE MARGIN IS A MIRROR OF THE CARD'S PADDING, NOT A CHOICE OF ITS OWN ────
              It read `-mx-4 px-4` while the card was `px-4` at every width. The card is now `px-2
              sm:px-4`, so this pair MOVES WITH IT — a stale `-mx-4` against a `px-2` card would pull
              this white bar 8px OUTSIDE the border on each side, spilling over the rounded corners
              while it is pinned.
              🔴 NOTHING ABOUT THE STRIP ITSELF IS CHANGED. Same `overflow-x-auto scrollbar-hide`, same
              `gap-1.5`, same `min-h-[44px] px-4` buttons; no fade, no snap, no scrollbar, no wrap. The
              track still measures exactly the card's content width, as it always has — it grows by the
              16px the card gave back, which is a consequence of the card's padding rather than a change
              to this element's own rules. The clip stays the scroll affordance. */}
          {/* 🔴 A1: `chipBarTop`, NOT `stickyTop`. This bar used to pin at the SAME offset as the status
              banners above it and at a lower z-index (z-30 vs their z-40), so a closed / paused /
              time-not-set banner drew straight over it and the chips vanished — live on Gusto today.
              chipBarTop = stickyTop + the banners' MEASURED height, so it now pins beneath them.
              🔴 B1: the chips no longer FILTER. Every category renders; a tap jumps. Styling, sizing,
              `min-h-[44px]`, the horizontal scroll and the negative-margin mirror are all untouched —
              only the handler and the offset changed. */}
          {hasChipBar && (
            <div ref={tabBarRef} style={{ top: chipBarTop }} className="sticky z-30 -mx-2 px-2 sm:-mx-4 sm:px-4 py-2 mb-2 bg-white border-b border-slate-100">
              <div ref={chipScrollRef} className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {menuCategories.map(cat => (
                  <button
                    key={cat}
                    ref={el => { if (el) chipRefs.current.set(cat, el); else chipRefs.current.delete(cat) }}
                    onClick={() => jumpToCategory(cat)}
                    className={`shrink-0 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-black uppercase tracking-wide transition-colors active:scale-95 ${
                      cat === selectedCategory ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cap(cat)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* ⚠️ THE OLD MIN-HEIGHT WRAPPER IS GONE — see A2. It padded the WHOLE list to a viewport,
              which the combined list always exceeds, so it silently became 0. The floor moved onto the
              LAST SECTION, below. */}
          <div>
          {/* 🔴 B1/B2: EVERY category renders. The old `.filter(… === selectedCategory)` is gone — that
              was the tabs. The array is `groupedMenu`, the same post-filter source the chips map over. */}
          {groupedMenu.map(([category, items], catIndex) => {
            const subGroups = groupBySubcategory(items, menu?.categories?.find(c => c.name === category)?.subcategories).filter(g => g.items.length > 0)
            // Category-level pre-order label — only when the category is FLAT (no named sub-category
            // headings to carry it), so the category + sub-category sites never double up. Shared
            // string when every available item in the category is an enabled pre-order item.
            const catPreorder = subGroups.some(g => g.name) ? null : groupPreorderLabel(items)
            const isLastCategory = catIndex === groupedMenu.length - 1
            return (
            // divide-y here borders BETWEEN subcategory group wrappers, so the last item before a
            // subcategory header gets a separator (the per-group divide-y below only draws between
            // items WITHIN a group, dropping the boundary line). No leading line (first group) and no
            // trailing line (category's final item) — divide-y only borders between siblings.
            // 🔴 `scrollMarginTop` IS THE SAME `pinnedTop` THE SPY USES AS ITS PIN LINE. The jump calls
            // scrollIntoView and lets the BROWSER apply this, rather than doing the arithmetic itself —
            // so "where a heading lands" and "where the spy thinks the line is" are one number, and a
            // re-measure moves both together. A2's floor is on the last section only.
            <div
              key={category}
              ref={el => { if (el) sectionRefs.current.set(category, el); else sectionRefs.current.delete(category) }}
              style={{ scrollMarginTop: pinnedTop, ...(isLastCategory ? { minHeight: lastSectionMinHeight } : {}) }}
              className="mb-4 last:mb-0"
            >
              {/* 🔴 B3: THE CATEGORY HEADING IS DELIBERATELY NOT STICKY, AND THAT IS A DECISION.
                  The highlighted CHIP is the parent indicator — it names the section you are in and
                  shows its neighbours, which a pinned heading does not. Two pinned levels (chips +
                  category) plus the header would eat roughly a third of a phone viewport before any
                  food. ⚠️ SUB-CATEGORY HEADINGS STAY STICKY, as they are today: deep inside a long
                  category they are the only thing naming the group you are reading, and the chip above
                  carries the parent. So a sticky child under a non-sticky parent is intended here.
                  ⚠️ Rendered only when there is more than one category — a one-category menu needs no
                  divider and must look exactly as it does today (B5). */}
              {hasChipBar && (
                <p className="text-sm font-black text-orange-600 uppercase tracking-wider pt-1 pb-2">{cap(category)}</p>
              )}
              {/* ⚠️ `divide-y` MOVED FROM THE SECTION DIV ONTO THIS WRAPPER, and it is not cosmetic
                  fiddling: divide-y borders BETWEEN SIBLINGS, so leaving it on the section would have
                  made the new category heading a sibling and drawn a rule under it that has never been
                  there. Same children, same borders between them as before. */}
              <div className="divide-y divide-slate-200">
              {catPreorder && (
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {/* ⚠️ The category NAME here is now conditional: the heading above already says it
                      whenever there is more than one category, and printing it twice reads as a bug.
                      On a ONE-category menu that heading is not rendered (B5), so this keeps it. */}
                  {!hasChipBar && <span className="text-xs font-bold text-slate-500">{cap(category)}</span>}
                  {/* Group cue pill — matches the per-item pill style; flex-wrap drops it below on narrow screens. */}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${catPreorder.state === 'closed_pending' ? 'bg-amber-100 text-amber-800' : 'bg-amber-50 text-amber-700'}`}>
                    {catPreorder.label}
                  </span>
                </div>
              )}
              {subGroups.map(group => (
              <div key={group.id ?? '__ungrouped'}>
                {/* Sub-category heading — only a NAMED group with items (Phase 3 order-screen rule);
                    the ungrouped (null) group renders no heading, and empty sub-cats are not shown.
                    STICKY (B1): pins directly beneath the category tab bar as you scroll within a
                    category, swapping to the next subcategory as it arrives (native nested-sticky —
                    each header's containing block is its own group <div>, so when a group scrolls out
                    its header leaves with it and the next group's header takes over). Offset =
                    stickyTop (the 60px page header, PLUS the DEMO MODE banner when it's there — see the
                    sticky-stack note at the top of this component) + TABBAR_H. When there's ONE category
                    the tab bar isn't rendered, so the header pins flush at stickyTop. Outside demo these
                    resolve to the same 121 / 60 they were hardcoded to. z-20 sits BELOW the tab bar
                    (z-30) and the page header bars (z-40) and ABOVE the items. -mx-N px-N + bg-white
                    make it an opaque full-bleed band (matching the tab bar) so items don't bleed through.
                    ⚠️ THE SAME MIRROR AS THE TAB BAR, for the same reason and with the same values: it
                    tracks the card's `px-2 sm:px-4` so the band spans the padding and no further. These
                    two are the only elements in the card that break out of it, and they must agree. */}
                {/* 🔴 `pinnedTop`, which IS the old expression with the two missing bands added:
                    it was `menuCategories.length > 1 ? stickyTop + TABBAR_H : stickyTop`, and
                    pinnedTop = stickyTop + statusBannerH + (hasChipBar ? tabBarH : 0). The
                    single-category branch (B5) is preserved inside pinnedTop, not lost here. */}
                {group.name && (
                  <p style={{ top: pinnedTop }} className="sticky z-20 -mx-2 px-2 sm:-mx-4 sm:px-4 py-2 bg-white text-sm font-black text-orange-500 uppercase tracking-wider">
                    {cap(group.name)}
                    {/* Sub-category pre-order pill — shown when every available item in THIS group is an
                        enabled pre-order item (shared global string). inline-block + whitespace-nowrap so
                        it wraps below the name as an intact unit on narrow screens. normal-case (the
                        heading is uppercase; the pill reads as a note). Matches the per-item pill style. */}
                    {(() => {
                      const gp = groupPreorderLabel(group.items)
                      return gp ? <span className={`ml-2 inline-block align-middle normal-case tracking-normal rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${gp.state === 'closed_pending' ? 'bg-amber-100 text-amber-800' : 'bg-amber-50 text-amber-700'}`}>{gp.label}</span> : null
                    })()}
                  </p>
                )}
                <div className="divide-y divide-slate-200">
                {group.items.map(item => {
                  const qty = getQty(item.name)
                  const isSoldOut = !(item.available ?? true)
                  // Cross-category upsells for this item (resolved regardless of qty so they show
                  // in the modal as you add). Rendered ONLY in the item modal now (not inline).
                  const itemUpsells = getItemUpsells(item)
                  // Stage B: per-item groups are the SOLE source (kills the fragile category name-match).
                  // The grouped item is typed by basket-utils' MenuItem (no modifierGroups) — the menu
                  // API attaches them at runtime, so read via a localized cast (same as spiciness below).
                  const catModGroups = (item as { modifierGroups?: ModifierGroup[] }).modifierGroups || []
                  const hasModifiers = catModGroups.length > 0
                  const catAllowNotes = menu?.categories?.find(c => c.name.toLowerCase() === item.category.toLowerCase())?.allowNotes ?? false
                  // Open the modal when the category has EXTRAS or UPSELLS or NOTES — so a
                  // suggestion/notes-only category still surfaces them (was extras-only).
                  const opensModal = hasModifiers || itemUpsells.length > 0 || catAllowNotes
                  const itemVariants = basket.filter(b => b.menuItem.name === item.name)
                  const directEntry = !hasModifiers ? itemVariants.find(b => b.modifiers.length === 0) : undefined
                  // ONE rule with the submit gate (calcAddableRemaining ⟷ checkCeilingShortfall): how many
                  // MORE fit, folding THIS order's basket per axis. itemBasketQty = this item's qty; catBasketQty
                  // = the whole category's in-progress qty (basketByCat, deal-slots already folded) — so a
                  // category cap can't be over-filled by adding 4 of each item. addable<=0 ⟺ the + disables.
                  const catBasketQty = basketByCat[item.category?.toLowerCase() || 'mains'] || 0
                  const { addable: stockAddable, bound: stockBoundEff } = calcAddableRemaining({
                    itemRem: item.item_remaining ?? null,
                    catRem: item.category_remaining ?? null,
                    itemBasketQty: qty,
                    catBasketQty,
                  })
                  const atStockLimit = stockAddable !== null && stockAddable <= 0
                  // Display-only heat rating. The grouped item is typed by basket-utils' MenuItem (no
                  // spiciness, deliberately — it must not enter basket/order shapes); read the runtime
                  // value the menu API carries via a localized cast.
                  const itemSpiciness = (item as { spiciness?: number | null }).spiciness ?? null
                  // Pre-order label — server-computed (event-tz, GLOBAL config). Read via a localized
                  // cast (same as spiciness): the grouped item is basket-utils' MenuItem, the menu API
                  // attaches the field at runtime. NO client-side time — render the string as-is.
                  const itemPreorderLabel = (item as { preorderLabel?: string | null }).preorderLabel ?? null
                  const itemPreorderState = (item as { preorderState?: 'before' | 'closed_pending' | 'not_open_yet' | null }).preorderState ?? null
                  return (
                    <div key={item.name} className={isSoldOut ? 'opacity-60' : ''}>
                    {/* py-3 item-content wrapper (Option B): a TOP LINE, then a FULL-WIDTH description
                        + chips block below it, so the description escapes the narrow flex-1 column. */}
                    <div className="py-3">
                    {/* ── TWO-COLUMN ROW (replaces "Option B", 1 September 2026) ────────────────────
                        WAS: a TOP LINE (thumbnail + name) with the description, chips, price and Add
                        as FULL-WIDTH siblings BELOW it, so they cleared the thumbnail's right edge.
                        That was a deliberate decision — its stated reason was "so the description
                        escapes the narrow flex-1 column" — and it is being reversed knowingly: the
                        thumbnail was 64px, and beside it sat a single line of name, leaving the
                        space to its right unused while everything else wrapped underneath.
                        NOW: ONE flexible text column on the LEFT holding name, description, chips,
                        the required-group preview, price and Add — and an 80px image column on the
                        RIGHT, present only when the item has a photo. The text column is the thing that
                        must survive — see min-w-0 below.
                        ⚠️ items-start, NOT items-center: the thumbnail must sit level with the item
                        NAME, not float mid-row. items-center would centre an 80px image against a
                        five-line text column and no two rows would agree. */}
                    <div className="flex items-start gap-3 w-full min-w-0">
                      {/* TEXT COLUMN — FIRST, so its left edge is the card's own on EVERY row.
                          min-w-0 is load-bearing: without it a long unbroken word (a dish name with no
                          spaces) sets the flex base size and pushes the image off the row.
                          🔴 flex-col + self-stretch SO THE PRICE CAN BE PINNED TO THE BOTTOM. Without
                          this the column is only as tall as its text, so on a row whose RIGHT column
                          (80px image + 8px + 28px button = 116px) is taller, the price sat ~22px above
                          the row's bottom while the Add button sat on it — the price stopped sharing a
                          baseline with the button. MEASURED at 430px before the fix: row bottom 3123,
                          button bottom 3123, price bottom ~3101.
                          ⚠️ Children stack exactly as they did as blocks (a flex column stretches them
                          to full width, which is what block layout already did). */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <p className={`font-bold text-sm leading-snug break-words min-w-0 ${isSoldOut ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{item.name}</p>
                          {/* Pre-order pill (server-computed label, §51) — PROMINENT beside the name.
                              flex-wrap drops it to its own line on narrow screens; whitespace-nowrap keeps
                              "Pre-order by 16:30, Sat 27 Jun" intact (wraps as a unit, never mid-text).
                              'before' reuses the allergen-tag amber (bg-amber-50 text-amber-700) to sit in
                              the warm tag family. NOTE: 'closed_pending' is a DARKER amber (bg-amber-100
                              text-amber-800) — moot today (global action is sold_out, so the item vanishes
                              and no closed_pending label shows), but kept distinct so it won't read as
                              identical to 'before' if force_pending is re-enabled. */}
                          {itemPreorderLabel && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${itemPreorderState === 'closed_pending' ? 'bg-amber-100 text-amber-800' : 'bg-amber-50 text-amber-700'}`}>
                              {itemPreorderLabel}
                            </span>
                          )}
                          {isSoldOut && (
                            <span className="text-[0.625rem] font-black text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">Sold out</span>
                          )}
                          {!isSoldOut && stockAddable != null && stockAddable <= 10 && (() => {
                            // Badge = what you can still ADD (remaining − your basket, per binding axis), so
                            // badge/+-disable/submit-gate are one number: "0 left" ⟺ + disabled ⟺ the gate
                            // would reject the next unit. Copy varies by the binding axis: 'category' phrases
                            // against the category noun so it can't be misread as "3 of THIS item" when every
                            // item in the category shares the same count (e.g. 18 pizzas all "3 left").
                            const n = stockAddable
                            const noun = stockBoundEff === 'category' && item.category ? ` ${item.category.toLowerCase()}` : ''
                            return (
                              <span className={`text-[0.625rem] font-bold px-1.5 py-0.5 rounded-full border ${n <= 3 ? 'text-red-600 bg-red-50 border-red-200' : 'text-orange-600 bg-orange-50 border-orange-200'}`}>
                                {n <= 3 ? `Only ${n}${noun} left!` : `${n}${noun} left`}
                              </span>
                            )
                          })()}
                        </div>
                    {/* Description + chips — NOW INSIDE the text column (they were siblings of the
                        top line under "Option B"). The two closing </div>s that ended the text
                        column and the row here have moved to just after the price/Add baseline.
                        Chip font stays rem (text-[0.625rem]) so it scales with the OS "Larger Text"
                        setting — unchanged by this restructure. */}
                    {/* 🔴 slate-500 AND text-sm, NOT slate-400 AND text-xs. A dish description is the one
                        line that decides an order — "hot 38hr makhani sauce on top" is the difference
                        between two chip dishes — and at 12px in slate-400 it measures about 2.8:1 against
                        white, under the 4.5:1 WCAG AA floor for body text. slate-500 clears it, and the
                        step to 14px is the same size the modal already uses for the same sentence.
                        ⚠️ IT REMAINS SECONDARY. The dish NAME is font-bold slate-900 and the price is
                        black; this is one step up from invisible, not a competing headline. */}
                    {item.description && <p className="text-slate-500 text-sm mt-1 leading-snug">{item.description}</p>}
                    {/* Per-item allergen chips hidden in 'card' mode (the card is the reference there);
                        shown in 'per_dish'/'both'/legacy(null). Dietary + spice always show (not the
                        card's domain). Allergens are still server-side verified-gated regardless. */}
                    {((item.dietary?.length ?? 0) > 0 || (truck?.allergen_display_mode !== 'card' && (item.allergens?.length ?? 0) > 0) || (itemSpiciness ?? 0) > 0) && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        <SpiceLevel value={itemSpiciness} />
                        {item.dietary?.map((d: string) => (
                          <DietaryChip key={d} label={d} />
                        ))}
                        {truck?.allergen_display_mode !== 'card' && item.allergens?.map((a: string) => (
                          <AllergenChip key={a} label={a} />
                        ))}
                      </div>
                    )}
                    {/* REQUIRED-group preview (display-only teaser) — shows the choices a customer will
                        pick in the modal, with the option's delta price + LIVE STANDING stock ("N left",
                        NOT basket-aware — the item isn't in the basket yet; basket-aware lives in the modal
                        §29). Required groups ONLY (optional extras stay hidden until the modal). Tapping Add
                        still opens the modal; this never lets you select from the list. */}
                    {(() => {
                      // Required groups only; AVAILABLE options only (filter sold-out like the modal —
                      // a struck-through option on a teaser line is noise). A group whose options are ALL
                      // sold out renders no line (no dangling "Protein:"). Standing stock, not basket-aware.
                      const previewGroups = sortGroupsRequiredFirst(catModGroups)
                        .filter(g => minRequiredForGroup(g) > 0)
                        .map(g => ({ ...g, options: g.options.filter(isModifierAvailable) }))
                        .filter(g => g.options.length > 0)
                      if (previewGroups.length === 0) return null
                      return (
                        <div className="mt-1.5 space-y-0.5">
                          {previewGroups.map(g => (
                            /* 🔴 text-xs AND slate-500, NOT text-[0.625rem] AND slate-400. These are the
                               CHOICES THE CUSTOMER IS ABOUT TO MAKE — "Chicken Tikka (M)", "+£3.00" — and
                               at 10px in slate-400 they measured about 2.8:1 against white, under the
                               4.5:1 WCAG AA floor, on the smallest type anywhere on the card. slate-500
                               clears the floor and 12px is one rem step, still rem-based so it scales
                               with the OS "Larger Text" setting.
                               ⚠️ STILL ONE STEP BELOW THE DESCRIPTION, which is text-sm in the same
                               slate-500. The hierarchy is name > description > options, and the size
                               carries it now that the colour no longer can. */
                            <p key={g.id} className="text-xs text-slate-500 leading-snug flex flex-wrap items-center gap-x-1 gap-y-0.5">
                              {/* ── 🔴 THE LEADER: THE GROUP'S NAME, OR "Choose:" WHEN IT HAS NONE. ──
                                  hide_name (inferred custom-extra) groups carry an internal "Category -
                                  Name N" name that is never shown, so before this they had NO leader at
                                  all and the line opened straight onto the options — indistinguishable
                                  from a description of what is in the dish.
                                  ⚠️ "Choose" IS THIS PAGE'S OWN VERB FOR "YOU MUST PICK ONE", NOT A NEW
                                  COINAGE. It appears in every other place the page asks for a decision:
                                    :3130  <span className="text-xs font-black text-slate-300">Choose time</span>
                                    :3356  {group.hide_name ? 'Choose an option' : group.name}   (the modal)
                                    :3424  'Choose required options'                (the blocked CTA)
                                  The trailing colon is the idiom this very line already used for a named
                                  group, so both branches read the same shape. */}
                              <span className="font-semibold text-slate-600">{g.hide_name ? 'Choose:' : `${g.name}:`}</span>
                              {/* ── 🔴 "Required · Choose one" IS GONE. THE OPTIONS CARRY IT INSTEAD. ──
                                  That label said too much: on this list EVERY group is required (the
                                  previewGroups filter above is `minRequiredForGroup(g) > 0`), so
                                  "Required" was printed on every modifier item on the menu and therefore
                                  distinguished nothing — the same argument that keeps amber off this
                                  line. groupRuleLabel still owns that wording in the modal, where the
                                  cap and the unmet state actually vary; it is simply not this line's job.
                                  🔴 WHAT REPLACES IT IS WEIGHT, NOT WORDS. The options go from normal
                                  slate-500 — the same treatment as the DESCRIPTION two lines above, which
                                  is exactly why they read as one — to font-semibold slate-700. That is
                                  the modal's own idiom for a thing you pick, one step down:
                                    :3371  `text-sm font-bold ... bg-white text-slate-700`   (option chips)
                                  Semibold rather than bold because this is a teaser, not a control.
                                  ⚠️ NO AMBER AND NO BOX, both settled earlier: every group here is unmet
                                  so amber would carry no information and would collide with the amber-50
                                  warning banners on this scroll, and a container would cost 26px inside
                                  a row that was widened by 16px. Weight costs nothing. */}
                              {g.options.map((opt, i) => (
                                <span key={opt.id} className="inline-flex items-center gap-1 font-semibold text-slate-700">
                                  {/* ⚠️ The separator stays LIGHTER than the text it divides — slate-400,
                                      one step up from slate-300 so it does not vanish beside darker
                                      options, but never competing with them. It now also does the work of
                                      "or": between two emphasised alternatives it reads as a divider, not
                                      as the comma of a list of ingredients. */}
                                  {i > 0 && <span className="text-slate-400 font-normal">·</span>}
                                  <span>{opt.name}{opt.price_adjustment > 0 ? ` +£${opt.price_adjustment.toFixed(2)}` : ''}</span>
                                  <OptionStockBadge remaining={opt.stock_count ?? null} />
                                </span>
                              ))}
                            </p>
                          ))}
                        </div>
                      )
                    })()}
                      </div>{/* end text column */}
                      {/* IMAGE COLUMN — ON THE RIGHT (1 September 2026). RENDERED ONLY WHEN THERE IS
                          A PHOTO: no placeholder, no spacer.
                          🔴 THIS REVERSES THE LEFT-HAND PLACEMENT BUILT EARLIER THE SAME DAY, AND THE
                          REASONING IS KEPT RATHER THAN REPLACED. Left-hand was correct only if every row
                          had a photo. MEASURED: 27 of 29 items on a real menu have none, so a left image
                          gave the list TWO left edges — 25px on photo-less rows, 117px on photo rows —
                          and the vertical spine of the list was lost. With the image on the RIGHT the
                          name, description, chips and price start at the SAME left edge on every row,
                          photo or not. 🔴 THAT ALIGNMENT IS THE POINT: anything that reintroduces a
                          second left edge defeats this change.
                          ⚠️ The Add button STAYS at the text column's right edge (price left / Add right,
                          the canonical layout recorded below). It is NOT beside the image and NOT under
                          it — on a photo row the button sits just left of the thumbnail, on a photo-less
                          row at the row's right edge. Sizes were measured at 320px before choosing.
                          ⚠️ width/height ATTRIBUTES as well as the classes: they bound the element even
                          if the stylesheet has not applied — the failure an unstyled <img> shows as a
                          full-viewport-width image that scrolls the row sideways. */}
                      {/* 🔴 ONE RENDER PATH. This column is ALWAYS rendered — on a photo-less row it
                          simply holds no image. The Add/stepper is therefore written ONCE and mounted in
                          ONE place, so its right edge is the ROW's right edge on every row. A conditional
                          that put the button in the text column when there is no photo would be two
                          render paths for one control, and they would drift.
                          • items-end  — the button (48px) right-aligns with the 80px image.
                          • self-stretch + mt-auto on the button — the column spans the row height and the
                            button is pushed to its BOTTOM, so it lands on the price's baseline instead of
                            floating directly under the thumbnail mid-row.
                          • shrink-0   — the column never compresses; the text column absorbs narrowing. */}
                        {item.photo_url && (
                        <img
                          src={item.photo_url}
                          alt={item.name}
                          width={80}
                          height={80}
                          className="w-20 h-20 max-w-[80px] rounded-xl object-cover shrink-0 border border-slate-100"
                        />
                        )}
                    </div>{/* end two-column row */}
                    {/* 🔴 BOTTOM LINE — FULL ROW WIDTH, ALWAYS RENDERED, ONE INSTANCE.
                        PRICE left, Add/stepper right. This is the structure that satisfies BOTH edges at
                        once, and it took three attempts to find:
                          • Add inside the TEXT column  -> its right edge was the text column's, so on a
                            photo row it sat ~92px left of a photo-less row. Two right edges.
                          • Add in a persistent RIGHT column beside the image -> one right edge, but that
                            column reserved ~60px of width for its FULL height, so on a photo-less row the
                            description stopped short of the screen edge. MEASURED and rejected.
                          • ✅ Add on its OWN full-width line BELOW the image -> price left and button right
                            are both the ROW's edges on every row, and the text above spans the full width
                            whenever there is no photo.
                        ⚠️ The button is rendered ONCE, here. There is no photo/no-photo branch for it, so
                        there is nothing to drift. Add/stepper LOGIC is untouched — relocated only.
                        ⚠️ A left-aligned price gives a clean edge down the list (vs a ragged
                        right-aligned price beside variable-length names). */}
                    <div className="flex items-center justify-between gap-2 mt-2 min-w-0">
                      <span className={`font-bold text-sm ${isSoldOut ? 'text-slate-400' : 'text-slate-700'}`}>£{item.price.toFixed(2)}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {isSoldOut ? (
                          <span className="text-xs text-slate-400 font-medium px-3 py-1.5">Sold out</span>
                        ) : (hasModifiers || catAllowNotes) ? (
                          // MODIFIER items AND notes-enabled items → persistent modal button, so every add
                          // reopens the modal and can carry a DIFFERENT variant/note → distinct cartKey → its
                          // own per-variant +/− row below. No-modifier + notes-DISABLED items fall through to
                          // the stepper (plain +/− quantity — nothing to customise, no pointless modal).
                          <button
                            onClick={() => !isOrderingBlocked && openItemModal(item, catModGroups, itemUpsells)}
                            disabled={isOrderingBlocked || atStockLimit}
                            className={`font-bold text-xs px-3 py-1.5 rounded-lg transition-colors active:scale-95 ${
                              isOrderingBlocked ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              : atStockLimit ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                              : qty > 0 ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                              : 'bg-orange-600 text-white hover:bg-orange-700'
                            }`}>
                            {isOrderingBlocked ? (isClosed ? 'Closed' : orderingTimeNotSet ? 'Set-up pending' : 'Paused') : qty > 0 ? `${qty} · Add` : 'Add'}
                          </button>
                        ) : qty > 0 ? (
                          <>
                            {/* Basket read-only while paused/closed: − and + both inert (basket stays visible). */}
                            {isOrderingBlocked ? (
                              <button disabled className="w-7 h-7 rounded-lg bg-slate-100 text-slate-300 font-black text-sm cursor-not-allowed">−</button>
                            ) : (
                              <QBtn onClick={() => removeItem(directEntry?.cartKey ?? makeCartKey(item.name, []))} label="−" />
                            )}
                            <span className="w-5 text-center font-black text-slate-900 text-sm">{qty}</span>
                            {isOrderingBlocked || atStockLimit ? (
                              <button disabled className="w-7 h-7 rounded-lg bg-slate-100 text-slate-300 font-black text-sm cursor-not-allowed">+</button>
                            ) : (
                              <QBtn onClick={() => addItem(item, [], directEntry?.specialInstructions || '')} label="+" accent />
                            )}
                          </>
                        ) : (
                          // qty 0 → first add. For a no-modifier upsell/notes item, open the modal
                          // ONCE so the upsell/notes prompt surfaces on entry; otherwise add directly.
                          // After this (qty > 0) the stepper above takes over — subsequent +/− adjust
                          // the base item quantity directly, never re-prompting the upsell per unit.
                          <button onClick={() => !isOrderingBlocked && (opensModal ? openItemModal(item, catModGroups, itemUpsells) : addItem(item))} disabled={isOrderingBlocked}
                            className={`font-bold text-xs px-3 py-1.5 rounded-lg transition-colors active:scale-95 ${isOrderingBlocked ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-orange-600 text-white hover:bg-orange-700'}`}>
                            {isOrderingBlocked ? (isClosed ? 'Closed' : orderingTimeNotSet ? 'Set-up pending' : 'Paused') : 'Add'}
                          </button>
                        )}
                      </div>
                    </div>
                    </div>{/* end py-3 item-content wrapper */}

                    {/* Per-variant basket rows — modifier items AND notes-enabled items (each note = its own line).
                        ── VERTICAL RHYTHM MATCHED TO THE OPERATOR ROW, 15 August 2026 ──────────────────
                        DEVICE-OBSERVED on iPhone: with the orange box gone these rows sat too far from the
                        item they belong to. Measured against components/dashboard/AddOrderPanel.tsx, which
                        is the same control on the operator screen:
                                          BEFORE   OPERATOR   NOW
                          above 1st row     20px      10px    10px
                          between rows      22px      16px    16px
                          below last row    16px      14px    14px
                        THREE CLASSES CARRY IT: the row went py-2 -> py-1.5 (matching the operator), the
                        list gap went space-y-1.5 -> space-y-1, and `-mt-2` pulls the list up through the
                        item wrapper's py-3 bottom padding.
                        WHY -mt-2 RATHER THAN A SMALLER py ON THE ITEM: that py-3 is the ITEM's own padding
                        and every item has it, expanded or not. Trimming it would move every row on the
                        menu to fix a gap that only exists under an expanded one.
                        ⚠️ ABOVE (10px) IS DELIBERATELY TIGHTER THAN BELOW (14px), exactly as the operator's
                        is. Symmetrical spacing is what made the row read as floating between two items;
                        being nearer the thing above it is what says it belongs to it. */}
                    {(hasModifiers || catAllowNotes) && itemVariants.length > 0 && (
                      <div className="pl-2 pb-2 space-y-1 -mt-2">
                        {itemVariants.map(v => {
                          const modSum = v.modifiers.reduce((s, m) => s + m.price, 0)
                          const modLabel = formatModifiers(v.modifiers)
                          const subLabel = [modLabel, v.specialInstructions].filter(Boolean).join(' · ')
                          // Option shared-pool gate (D2): disable "+" if one more of this variant's
                          // options would exceed the basket-wide pool (in addition to the item gate).
                          const optBlockedName = optionAddBlocked(v.modifiers.map(m => m.name))
                          const plusBlocked = isOrderingBlocked || atStockLimit || !!optBlockedName
                          return (
                            /* ── THE ORANGE BOX WAS REMOVED HERE, 15 August 2026 ─────────────────────
                               This row used to be bg-orange-50 + border-orange-100 + rounded-xl, i.e. a
                               tinted card inside the menu list. The OPERATOR's equivalent row
                               (components/dashboard/AddOrderPanel.tsx, the per-line rows) has no fill, no
                               border and no radius — its controls sit on the row's own background — and
                               the two surfaces are now matched on that point.
                               PADDING: px-3 became pl-3. A box needs even inset; a bare row does not, and
                               the right inset was holding the price away from the row edge, which is not
                               what the operator row does.
                               ⚠️ py-2 WAS KEPT AT FIRST AND WAS WRONG — on a real iPhone it left the row
                               reading as detached from its item. It is now py-1.5, matching the operator
                               exactly; the measured arithmetic is on the list wrapper above.
                               ⚠️ NOTHING ELSE WAS RESTYLED. The +/- keep their orange treatment, the
                               children keep their order, and every handler is untouched — see the report
                               for the differences that were left deliberately. */
                            <div key={v.cartKey} className="flex items-center gap-2 pl-3 py-1.5">
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => !isOrderingBlocked && removeItem(v.cartKey)} disabled={isOrderingBlocked} className="w-6 h-6 rounded-full bg-white border border-orange-200 flex items-center justify-center font-bold text-orange-600 hover:bg-orange-100 text-sm leading-none disabled:opacity-40">−</button>
                                <span className="w-5 text-center font-black text-slate-900 text-sm">{v.quantity}</span>
                                <button onClick={() => !plusBlocked && addItem(v.menuItem, v.modifiers, v.specialInstructions)} disabled={plusBlocked}
                                  className="w-6 h-6 rounded-full bg-orange-600 flex items-center justify-center font-bold text-white hover:bg-orange-700 text-sm leading-none disabled:opacity-40">+</button>
                              </div>
                              {/* STACK extras + note (one per line, break-words — NEVER truncate a customer's
                                  own choices). Note last (📝, muted italic). ✏️ opens the modal in EDIT mode for
                                  THIS line so extras AND note are editable. Pencil on every variant row. */}
                              <div className="flex-1 min-w-0">
                                {v.modifiers.map(m => (
                                  <p key={m.name} className="text-sm text-slate-700 break-words">{m.name}{m.price > 0 ? ` +£${m.price.toFixed(2)}` : ''}</p>
                                ))}
                                {v.specialInstructions && <p className="text-sm italic text-slate-400 break-words">📝 {v.specialInstructions}</p>}
                                {/* (Removed) the 'Add note' / 'Customise' placeholder that used to fill this
                                    space when a line had neither extras nor a note. It READ AS A BUTTON and
                                    was not one — the tappable thing is the ✏️ to its right, which is always
                                    there. This column now shows only what the customer actually chose, and
                                    is simply empty when they chose nothing. */}
                              </div>
                              <button onClick={() => !isOrderingBlocked && openItemModal(item, catModGroups, itemUpsells, v.cartKey)}
                                disabled={isOrderingBlocked} aria-label="Edit"
                                className="shrink-0 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center text-slate-400 active:scale-95 disabled:opacity-40">✏️</button>
                              {optBlockedName && <span className="text-[10px] font-bold text-orange-600 shrink-0">{buildOptionStockByName((menu?.items as any[]) || [])[optBlockedName]} {optBlockedName} left</span>}
                              <span className="text-xs font-bold text-slate-700 shrink-0">£{((item.price + modSum) * v.quantity).toFixed(2)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* (Removed) the old single-note affordance for plain notes items — the per-variant rows
                        above now show each note editable in place (per-line pencil), so it no longer renders
                        a duplicate note row below. */}

                    {/* Upsells now live in the item modal ("Goes well with") — not inline. */}
                    </div>
                  )
                })}
                </div>
              </div>
              ))}
              </div>{/* end divide-y wrapper */}
            </div>
            )
          })}
          </div>
        </div>



        {/* STAGE 2 — the order FORM as a bottom-sheet overlay (commit step). Reuses the item-modal
            idiom; renders only when formSheetOpen, at z-[60] ABOVE the z-50 footer (the backdrop
            covers the footer). The form JSX is unchanged — bound to top-level state, so it works
            anywhere. Opening/closing only toggles formSheetOpen; basket + field values are untouched. */}
        {formSheetOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          {/* ── 🔴 THE BACKDROP CLOSES THE REVIEW. IT DOES NOT CLOSE THE PAYMENT STEP. ──────────────
              ── WHAT IT COST ─────────────────────────────────────────────────────────────────────
              A customer had typed their card details, caught the backdrop with a thumb, and reopened
              to empty fields. Nothing else was lost — the basket, the slot, their name, email and the
              authorisation itself all survive a close — but the card box is Stripe's iframe, and every
              close route destroys the host div, which is EXACTLY the mechanism the teardown guarantee
              depends on. So the details cannot be preserved, and the close must not happen by accident.
              🔴 AND THE SAME TAP COULD FIRE MID-AUTHORISATION. This handler had no `payStage` guard at
              all, so a tap outside the sheet during `confirmPayment` tore the Element down while the
              call was in flight — the precise outcome the ✕ below is gated against, in a window the
              comment beside it asserted was unreachable.
              ── WHY NOT "ASK FIRST" ───────────────────────────────────────────────────────────────
              ⚠️ Asking requires knowing that something WAS typed, and the Payment Element's `change`
              payload is not something this build can quote a key list for — see the report. A confirm
              that fires on an untouched form trains customers to dismiss it; one that fails to fire
              loses the details anyway. And a dialog over a bottom sheet, mid-payment, on a phone, is a
              second modal to escape from.
              ⚠️ THE CUSTOMER IS NEVER TRAPPED. Two deliberate exits are on screen and unscrolled at the
              top of this same sheet: "← Back to my order" (which keeps the authorisation) and the ✕.
              Both survive this change; only the accidental region stopped acting on a mis-tap.
              ⚠️ THE REVIEW STEP IS UNCHANGED. `payingInSheet` is false there, so a backdrop tap closes
              the sheet exactly as it always has — nothing is lost on that step, and this is the tap a
              customer expects to work. */}
          <div className="absolute inset-0 bg-black/40"
            onClick={() => { if (!payingInSheet) setFormSheetOpen(false) }} />
          <div ref={sheetScrollRef} className="relative bg-white rounded-t-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
            <div className="px-5 pt-5 pb-5">
              {/* ⚠️ THE SHEET'S OWN CHROME, KEPT. The payment step is a step INSIDE this sheet, not a
                  screen over it, so the title changes and the ✕ stays where it has always been.
                  🔴 THE ✕ IS HIDDEN MID-AUTHORISATION, for the same reason the Back control is:
                  dismissing the sheet while confirmPayment is in flight would leave the customer on the
                  menu with a hold being placed behind them.
                  🔴 CORRECTION. This comment used to end "It is the only close route that could
                  otherwise fire during those two seconds." That was TRUE of the ✕ and FALSE as a
                  statement about the sheet: the BACKDROP above had no guard of any kind and could fire
                  throughout. It is guarded now — and more tightly than this control, because it also
                  refuses on the payment step when nothing is being authorised. See the note there.
                  ⚠️ THE ✕ KEEPS THE LOOSER GUARD DELIBERATELY. It is a deliberate, aimed control and it
                  is one of the two ways out of the payment step; gating it as tightly as the backdrop
                  would leave a customer with only the Back control. */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-slate-900 text-lg leading-snug">
                  {payingInSheet ? 'Pay by card' : 'Complete your order'}
                </h3>
                {payStage !== 'authorising' && (
                  <button onClick={() => setFormSheetOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">✕</button>
                )}
              </div>

              {/* ── 🔴 THE PAYMENT-REFUSED NOTICE, AND IT IS THE FIRST THING IN THE SHEET. ────────────
                  RED, NOT AMBER, AND DELIBERATELY: every other notice on this page is "adjust your
                  basket and try again"; this one is "your card was authorised, it has been released, and
                  you have no order". The server's sentence is rendered whole, and the page appends only
                  what IT knows — which lines it removed and what to do next.
                  🔴 IT USED TO SIT BESIDE THE OTHER SUBMIT-TIME NOTICES, ~300 LINES LOWER, DIRECTLY
                  ABOVE THE PLACE ORDER BUTTON. That is the right home for a refusal the customer caused
                  by pressing that button — they are already looking at it. This one arrives from
                  somewhere else entirely (a promotion that ran after they paid, or a fresh document
                  Stripe redirected them onto), so the sheet can be scrolled anywhere or freshly opened,
                  and on a laptop it landed below the fold. Now it is above every step, before the
                  header's own content, and nothing can push it down.
                  ⚠️ IT PUSHES NOTHING IMPORTANT OFF SCREEN. The sheet scrolls (max-h-[90vh],
                  overflow-y-auto) and the notice is three lines at its longest; the review, the fields
                  and the Place order button all keep their order and are reached by the same scroll. It
                  renders ONLY when there is a refusal to report, so an ordinary order sees the sheet it
                  has always seen. ⚠️ Dismissible, and cleared by the next submit, exactly as before. */}
              {paymentFailedNotice && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
                  <p className="flex-1 text-red-800 text-sm font-medium">{paymentFailedNotice}</p>
                  <button onClick={() => setPaymentFailedNotice(null)} className="text-red-400 hover:text-red-600 text-sm font-bold leading-none mt-0.5">✕</button>
                </div>
              )}

              {/* ── 🔴 THE SAME REFUSAL ON THE PAY-AT-HATCH PATH, IN THE SAME PLACE. ──────────────────
                  It rendered ~290 lines below, above Place order — which is where the customer is
                  looking when a CAP is reported, and is not where they are looking after a sell-out has
                  emptied lines out of a basket they must now check. Above every step, like the card one.
                  ⚠️ AMBER, NOT RED, AND THAT IS THE ONE DELIBERATE DIFFERENCE. Red on this page means
                  "your card was authorised and released"; nothing was authorised here. Same panel
                  vocabulary as the stock and menu-change notices it sits above.
                  ⚠️ It pushes nothing off screen: the sheet scrolls, the panel is two lines, and it
                  renders only when there is a refusal. */}
              {soldOutNotice && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
                  <p className="flex-1 text-amber-800 text-sm font-medium">{soldOutNotice}</p>
                  <button onClick={() => setSoldOutNotice(null)} className="text-amber-400 hover:text-amber-600 text-sm font-bold leading-none mt-0.5">✕</button>
                </div>
              )}

              {/* ── 🔴 THE PAYMENT STEP. INSIDE THE SHEET, REPLACING THE REVIEW, NOT COVERING IT. ────
                  It sits immediately under the sheet's own header, so the card fields are the FIRST
                  thing in the sheet and there is nothing to scroll past to reach them. The review
                  content below is hidden, not unmounted, so returning to it costs nothing and no field
                  loses its value.
                  🔴 AND THE ELEMENT'S HOST STILL CANNOT BE DESTROYED WITHOUT TEARING DOWN. Being inside
                  the sheet is safe — it was never the location that caused the old defect. The host is
                  published into STATE by a callback ref, so the sheet's ✕ and its backdrop detach the
                  node, the ref fires with null, `paymentBoxEl` changes, and React runs the effect's
                  cleanup. Every close is a dependency change; there is no close that is not. */}
              {payingInSheet && payment && (
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-4">
                    {/* ⚠️ HIDDEN MID-AUTHORISATION, exactly like the ✕ above. */}
                    {payStage !== 'authorising' ? (
                      <button onClick={e => { e.preventDefault(); closePaymentStage() }}
                        className="text-slate-500 hover:text-slate-800 text-sm font-bold flex items-center gap-1.5 -ml-1 px-1 py-1">
                        ← Back to my order
                      </button>
                    ) : <span className="text-sm font-bold text-slate-400">Authorising…</span>}
                    <span className="text-lg font-black text-slate-900 tabular-nums">£{(payment.totalPence / 100).toFixed(2)}</span>
                  </div>

                  {/* Skeleton while Stripe.js loads and the Element builds. Driven by `elementReady` —
                      the same fact the Pay button reads, so the two can never disagree. */}
                  {!elementReady && (
                    <div className="animate-pulse space-y-2" aria-live="polite">
                      <div className="h-12 bg-slate-100 rounded-lg" />
                      <div className="h-12 bg-slate-100 rounded-lg" />
                      <div className="h-12 bg-slate-100 rounded-lg" />
                      <p className="text-xs text-slate-400 pt-1">Loading secure card form…</p>
                    </div>
                  )}

                  {/* 🔴 THE ELEMENT'S HOST, AND THE ONLY ONE. `setPaymentBoxEl` is a callback ref: it
                      publishes this node into state, which is what makes the mount effect re-run when
                      the div is recreated, and what fires the single teardown when it is detached.
                      Hidden under the skeleton, never conditionally removed while the step is open —
                      unmounting it on a decline would destroy the card details just typed. */}
                  <div ref={setPaymentBoxEl} className={elementReady ? '' : 'hidden'} />

                  {payStage === 'failed' && payError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4">
                      <p className="text-red-800 text-sm font-medium">{payError}</p>
                    </div>
                  )}

                  {/* 🔴 THE ONE PRECONDITION: A MOUNTED ELEMENT. `elementReady` is set by Stripe's own
                      `ready` event and cleared by the single teardown, so it cannot outlive the Element
                      it describes. `payStage !== 'authorising'` stops a second press mid-confirm. */}
                  <button onClick={e => { e.preventDefault(); void confirmCardPayment() }}
                    disabled={!elementReady || payStage === 'authorising'}
                    className="w-full bg-orange-600 text-white font-black py-4 px-6 rounded-xl text-base hover:bg-orange-700 transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm mt-4">
                    {payStage === 'authorising' ? 'Authorising…'
                      : !elementReady ? 'Preparing…'
                      : payStage === 'failed' ? `Try again · £${(payment.totalPence / 100).toFixed(2)}`
                      : `Pay £${(payment.totalPence / 100).toFixed(2)}`}
                  </button>
                  <p className="text-[11px] text-slate-400 text-center mt-3 leading-relaxed">
                    Your card is held, not charged, until {truck?.name ?? 'the truck'} confirms your order.
                  </p>
                </div>
              )}

              {/* ── 🔴 THE REVIEW, HIDDEN RATHER THAN UNMOUNTED WHILE PAYING. ────────────────────────
                  `hidden` is `display:none`, so it takes no space and the card form sits at the top of
                  the sheet with nothing to scroll past — while every field keeps its value and its
                  focus state, and Back is instant. Unmounting it would re-run the whole review tree for
                  no benefit. ⚠️ A BARE WRAPPER: the parent is `px-5 pt-5 pb-5` with no flex and no
                  space-y, so an extra block-level div changes no spacing anywhere. */}
              <div className={payingInSheet ? 'hidden' : ''}>

              {/* ORDER REVIEW SUMMARY — COLLAPSED by default so a large order can't bury the form
                  fields below. One-line "{N} items · £{total} ⌄"; tap to reveal the full list (the
                  same shared orderBreakdownEl as the footer peek). Display-only. */}
              {hasItems && (
                <div className="mb-4">
                  <button
                    onClick={() => setSheetSummaryExpanded(e => !e)}
                    className="w-full flex items-center justify-between group"
                  >
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                      {(() => { const n = totalItems + appliedDeals.length; return `${n} item${n !== 1 ? 's' : ''}` })()}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-slate-900 text-sm">£{total.toFixed(2)}</span>
                      <svg className={`w-4 h-4 text-slate-400 transition-transform ${sheetSummaryExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {/* Height cap (sheet ONLY): a small 2–4 item order shows fully with no scroll; a
                      large order scrolls WITHIN this 40vh box so the collection-time + name/email
                      fields stay reachable below. The footer peek is uncapped (unchanged). */}
                  {sheetSummaryExpanded && <div className="mt-2 max-h-[40vh] overflow-y-auto">{orderBreakdownEl}</div>}
                </div>
              )}

        {/* COLLECTION TIME */}
        {truck?.mode === 'village' && (
          <Sec title="Collection time">
            {loadingSlots ? (
              <p className="text-slate-400 text-sm animate-pulse">Loading available times...</p>
            ) : (
              <>
                <div className="flex gap-3 items-stretch">

                  {/* LEFT: ASAP button */}
                  {(() => {
                    // ASAP display precedence (V7.1): backwardAsap (capacity-fit earliest, basket) →
                    // asapSlot (getAsapSlot = earliest pickable, empty basket) → customerAsapTime (a
                    // pure ESTIMATE, last resort only when there's no real slot). asapSlot now ranks
                    // ABOVE the estimate so "Around HH:MM" equals the earliest selectable slot — both
                    // derive from the one prep floor. (Was: estimate ahead of asapSlot → the divergence.)
                    const asapTime = backwardAsap || asapSlot || customerAsapTime || (availableHours.length > 0
                      ? `${availableHours[0]}:${availableMinutes[0] || '00'}`
                      : null)
                    const isSelected = asapChosen

                    return (
                      <button
                        onClick={() => {
                          // ASAP is selected as a first-class choice (submits null) —
                          // clear any concrete time so the highlight + submit agree.
                          setAsapChosen(true)
                          setSlotHour(''); setSlotMinute('')
                        }}
                        disabled={!asapTime}
                        className={`flex-1 flex flex-col items-center justify-center px-3 py-3 rounded-2xl border-2 font-bold transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-orange-600 border-orange-600 text-white'
                            : asapTime
                              ? 'bg-white border-slate-200 text-slate-700 hover:border-orange-300 hover:bg-orange-50'
                              : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                        }`}>
                        <span className="text-sm font-black">⚡ ASAP</span>
                        {/* Show the concrete earliest-fitting time ONLY once the basket has items —
                            an empty basket's "earliest" (event open) is misleading and jumps the moment
                            an item is added. Display-only; the ASAP value/computation is unchanged. */}
                        {(hasItems || !asapTime) && (
                          <span className={`text-xs mt-0.5 ${isSelected ? 'text-orange-100' : 'text-orange-400'}`}>
                            {asapTime ? `Around ${formatTime(asapTime)}` : 'Unavailable'}
                          </span>
                        )}
                      </button>
                    )
                  })()}

                  {/* RIGHT: Choose time button / dropdown */}
                  <div className="flex-1">
                    {truck?.time_selection_enabled ? (() => {
                      // ASAP display precedence (V7.1): real slot (backwardAsap → asapSlot) before the
                      // customerAsapTime ESTIMATE, so the picker floor == the displayed ASAP.
                      const asapTime = backwardAsap || asapSlot || customerAsapTime || (availableHours.length > 0 ? `${availableHours[0]}:${availableMinutes[0] || '00'}` : null)
                      const hasChosenTime = !asapChosen && selectedSlot

                      return (
                        <div className="relative h-full">
                          <select
                            value={hasChosenTime ? selectedSlot : ''}
                            onChange={e => {
                              const val = e.target.value
                              if (val) {
                                setAsapChosen(false)
                                const [h, m] = val.split(':')
                                setSlotHour(h); setSlotMinute(m)
                              } else {
                                // Deselect a specific time — back to ASAP (submits null).
                                setAsapChosen(true)
                                setSlotHour(''); setSlotMinute('')
                              }
                            }}
                            className={`w-full h-full min-h-[68px] rounded-2xl border-2 px-3 py-3 text-sm font-bold appearance-none text-center cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-orange-400 ${
                              hasChosenTime
                                ? 'bg-orange-600 border-orange-600 text-white'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-orange-300'
                            }`}>
                            <option value="">Choose time</option>
                            {availableSlots.length > 0
                              ? availableSlots
                                  .filter(s => {
                                    // Non-capacity gates (unchanged behaviour) — past, too-soon (below
                                    // the lead/ASAP floor), and grace (strictly after end_time, operator-
                                    // only "After closing"). These were previously bundled inside
                                    // s.available; now explicit so the CAPACITY decision below can be
                                    // basket-aware. 16:00 is is_grace:false (kept); 16:05+ excluded.
                                    // PAST: ALWAYS live (isSlotPast in the event tz) — never the
                                    // cached server is_past flag (stale once the clock advances).
                                    if (isSlotPast(s, eventTz, eventDateIso)) return false
                                    if (s.too_soon) return false // prep-time constraint (not a clock one) — server flag is fine
                                    if (s.is_grace) return false
                                    // CAPACITY — basket-aware when the customer has a basket: gate on the
                                    // category-aware fitOrderBackward result (unfittableSlots), NOT the
                                    // server's basket-agnostic worst-case s.available. So a window the
                                    // worst-case dot vetoes (e.g. pizza-full 6pm) is still offered when
                                    // THIS order fits the ceiling spare (anchovies: 4 pizzas + 2 = 6 ≤ 6),
                                    // and still hidden when it doesn't (a pizza: batch full). Empty basket
                                    // ⇒ keep the server worst-case default (nothing to fit yet).
                                    if (Object.keys(basketByCat).length > 0) {
                                      if (unfittableSlots.has(s.collection_time)) return false
                                    } else if (!s.available) {
                                      return false
                                    }
                                    // Only show slots at or after the ASAP time
                                    if (asapTime) return toMins(s.collection_time) >= toMins(asapTime)
                                    return true
                                  })
                                  .map(slot => (
                                    <option key={slot.collection_time} value={slot.collection_time}>
                                      {slot.collection_time}
                                    </option>
                                  ))
                              : availableHours.flatMap(h =>
                                  availableMinutes
                                    .filter(m => {
                                      const time = `${h}:${m}`
                                      if (!asapTime) return true
                                      return toMins(time) >= toMins(asapTime)
                                    })
                                    .map(m => {
                                      const time = `${h}:${m}`
                                      return <option key={time} value={time}>{time}</option>
                                    })
                                )
                            }
                          </select>
                          <div className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs ${hasChosenTime ? 'text-white' : 'text-slate-400'}`}>▾</div>
                        </div>
                      )
                    })() : (
                      // Free tier: greyed out, no badge
                      <div className="w-full h-full min-h-[68px] rounded-2xl border-2 border-slate-100 bg-slate-50 flex flex-col items-center justify-center px-3 py-3">
                        <span className="text-xs font-black text-slate-300">Choose time</span>
                        <span className="text-[10px] text-slate-300 mt-0.5">ASAP only</span>
                      </div>
                    )}
                  </div>

                </div>

                {/* Confirmation */}
                {selectedSlot
                  ? <p className="text-green-600 text-xs font-bold mt-2">✓ Collection time: {selectedSlot}</p>
                  : <p className="text-slate-400 text-xs mt-2">Select ASAP or choose a specific time</p>
                }
              </>
            )}
          </Sec>
        )}

        {/* YOUR DETAILS */}
        <Sec title="Your details">
          <div className="space-y-3">
            {/* 2d — the fields stay EDITABLE and functional: /api/orders/submit requires customerEmail, so
                the order genuinely can't be placed without one. But nothing is ever sent — the demo-truck
                guard in submit + dashboard/action blocks every send site. Say so plainly rather than
                letting someone hesitate over handing us their address. */}
            {isDemo && (
              <p className="text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2">
                This is a real form, so it needs an email to place the order — but nothing is sent. No
                confirmation, no messages, nothing leaves the system.
              </p>
            )}
            <Fld label="Name" required><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sarah" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" /></Fld>
            <Fld label="Email" required note={isDemo ? 'not used in the demo' : 'confirmation sent here'}><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. sarah@email.com" className={`w-full border rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 bg-white ${emailError ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:ring-orange-400'}`} />{emailError && <p className="text-red-500 text-xs mt-1">Please enter a valid email (e.g. sarah@email.com)</p>}</Fld>
            <Fld label="Phone number" note="optional"><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 07700 900123" className={`w-full border rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 bg-white ${phoneError ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:ring-orange-400'}`} />{phoneError && <p className="text-red-500 text-xs mt-1">Please enter a valid UK mobile (e.g. 07700 900123)</p>}</Fld>
            <Fld label="Special instructions" note="optional"><textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
                placeholder="Allergies, no onion, extra crispy…"
                rows={3}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none"
              /></Fld>
          </div>
        </Sec>

              {/* Submit-time notices (paused 423 / lock 409 / stock 409) — co-located with the
                  place-order action so they surface INSIDE the sheet (the footer is hidden behind it
                  during submit). Non-destructive: basket kept, customer retries in place. */}
              {pauseNotice && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-4 flex items-start gap-2">
                  <p className="flex-1 text-amber-800 text-sm font-medium">⏸ {pauseNotice}</p>
                  <button onClick={() => setPauseNotice(null)} className="text-amber-400 hover:text-amber-600 text-sm font-bold leading-none mt-0.5">✕</button>
                </div>
              )}

              {stockNotice && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-4 flex items-start gap-2">
                  <p className="flex-1 text-amber-800 text-sm font-medium">Sorry — {stockNotice} now. We&apos;ve updated your order — please review and confirm.</p>
                  <button onClick={() => setStockNotice(null)} className="text-amber-400 hover:text-amber-600 text-sm font-bold leading-none mt-0.5">✕</button>
                </div>
              )}

              {/* 🔴 THE SERVER'S SENTENCE, RENDERED WHOLE. No "Sorry — " prefix, no " now." suffix, and
                  no "We've updated your order" — because nothing was updated. Same panel styling and
                  same dismiss affordance as the stock notice above, so it reads as the same class of
                  message; only the wrapping differs, which is the entire point of it being separate. */}
              {menuChangedNotice && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-4 flex items-start gap-2">
                  <p className="flex-1 text-amber-800 text-sm font-medium">{menuChangedNotice}</p>
                  <button onClick={() => setMenuChangedNotice(null)} className="text-amber-400 hover:text-amber-600 text-sm font-bold leading-none mt-0.5">✕</button>
                </div>
              )}

              {/* PLACE ORDER — the actual submit. Carries the SAME full validation gate that was on
                  the footer button (name/email/phone/slot etc.), relocated verbatim. */}
              {/* 🔴 ONE BUTTON, TWO DESTINATIONS, AND THE CARD ONE IS NOT ALWAYS A SUBMIT. `openCardPayment`
                  re-presents a live authorisation for an unchanged basket without touching the server;
                  only a first attempt or a changed basket calls submitOrder. Pay-at-hatch is untouched
                  and still goes straight to handleSubmitClick. */}
              <button onClick={e => { e.preventDefault(); if (payByCard && truck?.card_payments_ready) openCardPayment(); else handleSubmitClick() }}
                disabled={submitting || isOrderingBlocked || !hasItems || !name || !emailValid || !phoneValid || (truck?.mode === 'village' && !selectedSlot && !asapChosen) || (!eventLoading && !event)}
                className="w-full bg-orange-600 text-white font-black py-3.5 px-6 rounded-xl text-base hover:bg-orange-700 transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm mt-5">
                {submitting ? 'Placing order...' : isClosed ? 'Ordering has closed' : isPaused ? 'Ordering paused' : orderingTimeNotSet ? 'Set-up pending' : !eventLoading && !event ? 'No event available' : 'Place order'}
              </button>
              {/* ── 🔴 THE CARD CHOICE. RENDERED ONLY WHEN THE TRUCK'S OPERATOR IS ACTUALLY READY. ──
                  `card_payments_ready` is false for every truck whose operator has not completed Stripe
                  onboarding, so this block does not exist for any of them and the line below is the
                  page exactly as it was. That is the "silent fallback" rule: never a card option that
                  then fails, and no explanation of a thing that is not on offer.
                  ⚠️ Stacked rows in the existing radio vocabulary — a filled circle in a ring — not a
                  native <input>, matching the pattern used across Manage. */}
              {truck?.card_payments_ready && (
                <div className="mt-4 space-y-1.5">
                  {([
                    { key: true,  label: 'Pay now by card', hint: 'Secure payment through Stripe' },
                    { key: false, label: 'Pay at the truck', hint: 'No card details needed' },
                  ] as const).map(opt => (
                    <button
                      key={String(opt.key)}
                      type="button"
                      onClick={() => setPayByCard(opt.key)}
                      className="w-full flex items-start gap-2 text-left"
                    >
                      <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        payByCard === opt.key ? 'border-orange-500' : 'border-slate-300'
                      }`}>
                        {payByCard === opt.key && <span className="w-2 h-2 rounded-full bg-orange-500" />}
                      </span>
                      <span className="text-sm min-w-0">
                        <span className="font-medium text-slate-700">{opt.label}</span>
                        <span className="block text-xs text-slate-400">{opt.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {/* ⚠️ The original line, unchanged, for every truck that cannot take cards — and replaced
                  only when a card is both available and chosen, so it never describes the wrong thing.
                  🔴 "on the next screen" IS GONE. There is no next screen: the card form opens HERE,
                  on this page, and saying otherwise would promise a navigation that no longer happens. */}
              <p className="text-center text-slate-400 text-xs mt-2">
                {truck?.card_payments_ready && payByCard
                  ? 'You’ll pay securely by card on this page · Apple Pay and Google Pay supported'
                  : 'Pay at the truck on collection · No card details needed'}
              </p>
              </div>{/* end review, hidden while paying */}

            </div>
          </div>
        </div>
        )}

        </>)}{/* end event-scoped ordering UI */}

      </div>{/* end ordering_available wrapper */}

      </main>

      {/* STICKY FOOTER with expandable summary — only once an event is scoped (not on the
          order-entry schedule, where there's nothing to total yet). */}
      {event && (
      <div ref={footerRef} className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-xl px-4 pt-3 pb-2 z-50" style={{paddingBottom: 'max(8px, env(safe-area-inset-bottom))'}}>
        <div className="max-w-lg mx-auto">

          {hasItems && (
            <div className="mb-3">
              {/* Collapsed / expanded toggle */}
              <button
                onClick={() => setSummaryExpanded(e => !e)}
                className="w-full flex items-center justify-between mb-2 group"
              >
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  {(() => { const n = totalItems + appliedDeals.length; return `${n} item${n !== 1 ? 's' : ''}` })()}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-slate-900 text-sm">£{total.toFixed(2)}</span>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${summaryExpanded ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded breakdown — shared element (see orderBreakdownEl), also used in the sheet. */}
              {summaryExpanded && orderBreakdownEl}
            </div>
          )}

          {!hasItems && <p className="text-center text-slate-400 text-xs font-medium mb-2">Add items from the menu to place an order</p>}

          {/* STAGE 2 trigger — the footer button now OPENS the form sheet (commit step). Gated ONLY
              on hasItems + ordering-not-blocked; name/email/slot are filled INSIDE the sheet, so they
              no longer gate here. The pause/stock submit-notices and the actual place-order button
              moved into the sheet (the footer is hidden behind it during submit). */}
          <button onClick={e => { e.preventDefault(); setFormSheetOpen(true) }}
            disabled={isOrderingBlocked || !hasItems || (!eventLoading && !event)}
            className="w-full bg-orange-600 text-white font-black py-3.5 px-6 rounded-xl text-base hover:bg-orange-700 transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
            {isClosed ? 'Ordering has closed' : isPaused ? 'Ordering paused' : orderingTimeNotSet ? 'Set-up pending' : !eventLoading && !event ? 'No event available' : 'Review & order →'}
          </button>
          {/* ── 🔴 THIS LINE WAS UNGATED, AND ITS SIBLING EIGHT ROWS ABOVE IS NOT. ──────────────────
              It read "Pay at the truck on collection · No card details needed" for EVERY customer on
              EVERY truck, including one about to authorise a card — the second half of it flatly
              contradicted the card form that opens on the next tap. The review sheet's copy at ~:2984
              already branches on `card_payments_ready`; this footer was simply never updated with it.
              ⚠️ IT BRANCHES ON THE TRUCK, NOT ON `payByCard`. The card-or-cash choice is made INSIDE
              the review sheet, so at this point the customer has not chosen and this line must be true
              either way — hence "or", and no claim about what details are or are not needed.
              ⚠️ A truck that cannot take cards keeps the original sentence, character for character. */}
          <p className="text-center text-slate-400 text-xs mt-1">
            {truck?.card_payments_ready
              ? 'Pay by card or at the truck'
              : 'Pay at the truck on collection · No card details needed'}
          </p>
        </div>
      </div>
      )}

      {/* Item Modal — modifier selection before adding to basket */}
      {itemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setItemModal(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl pb-safe max-h-[90vh] overflow-y-auto">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-black text-slate-900 text-lg leading-snug">{itemModal.item.name}</h3>
                  {/* The SAME sentence as the list row above, so it takes the same colour — it was already
                      text-sm here; only the contrast was short. */}
                  {itemModal.item.description && <p className="text-slate-500 text-sm mt-0.5">{itemModal.item.description}</p>}
                </div>
                <button onClick={() => setItemModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none ml-4 mt-0.5">✕</button>
              </div>

              <div className="space-y-4">
                {sortGroupsRequiredFirst(itemModal.modGroups).map(group => {
                  const isUnmet = modalUnmetGroupIds.includes(group.id)
                  // Rule label beside the group name — shared groupRuleLabel (ONE source across the manage
                  // modal + both order screens): "Required · Choose up to N" / "Required" / "Optional · …" /
                  // "Optional". Required+unmet turns it AMBER (the sole unmet cue); the cap wording is
                  // unchanged from before.
                  const ruleHint = groupRuleLabel(group)
                  return (
                    <div key={group.id}>
                      <p className="text-xs font-black uppercase tracking-wider mb-2">
                        {/* hide_name: AI-import-inferred custom-extra groups carry an internal
                            "Category - Name N" name — never shown to customers; a generic prompt
                            stands in. Manual / AI-extras groups (hide_name false) show their real name. */}
                        <span className="text-slate-500">{group.hide_name ? 'Choose an option' : group.name}</span>
                        {ruleHint && (
                          <span className={`ml-2 font-bold ${isUnmet ? 'text-amber-600' : 'text-slate-400'}`}>· {ruleHint}</span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {group.options.filter(isModifierAvailable).map(opt => {
                          const selected = modalMods.some(m => m.name === opt.name)
                          // Basket-aware remaining (§28 gate, mirrored). Sold-out (pool drawn to 0 by the
                          // basket) → unselectable; a SELECTED option stays toggleable so it can be deselected.
                          const rem = optionRemainingFor(opt.name, opt.stock_count)
                          const soldOut = rem != null && rem <= 0
                          const lock = soldOut && !selected
                          return (
                            <button key={opt.id} onClick={() => { if (!lock) toggleModalMod(opt, group) }} disabled={lock}
                              className={`flex items-center gap-1.5 text-sm font-bold px-3.5 py-2 transition-all active:scale-95 border-2 rounded-xl ${
                                selected ? 'bg-orange-600 border-orange-600 text-white' : lock ? 'bg-slate-50 border-slate-200 text-slate-400 line-through cursor-not-allowed opacity-60' : `bg-white text-slate-700 hover:border-orange-300 ${isUnmet ? 'border-amber-300' : 'border-slate-200'}`
                              }`}>
                              <span>{opt.name}</span>
                              {opt.price_adjustment > 0 && <span className={selected ? 'text-orange-200' : 'text-orange-500'}>+£{opt.price_adjustment.toFixed(2)}</span>}
                              {/* "N left" / sold-out (basket-aware) — shared badge, same thresholds as item stock. */}
                              <OptionStockBadge remaining={rem} />
                              {/* Allergen chip removed from selection (V7.8 §31) — a single named ingredient is
                                  self-evidently its allergen; the data still travels to the order + email (§25). */}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {/* GOES WELL WITH — cross-category upsells, added as STANDARD own-category basket
                    items (not modifiers). Same compact pill style as PIZZA EXTRAS above (only the
                    section heading frames them as a cross-category nudge). Tap TOGGLES selection (like an
                    extra) — staged in modalUpsells and committed on "Add to basket"; the button total
                    below reflects the selection. */}
                {!itemModal.editCartKey && itemModal.upsells.length > 0 && (
                  <div>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Goes well with</p>
                    <div className="flex flex-wrap gap-2">
                      {itemModal.upsells.map(u => {
                        const selected = modalUpsells.includes(u.name)
                        return (
                          <button key={u.name} onClick={() => toggleModalUpsell(u.name)}
                            className={`flex items-center gap-1.5 text-sm font-bold px-3.5 py-2 rounded-xl border-2 transition-all active:scale-95 ${
                              selected ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-orange-300'
                            }`}>
                            <span>{selected ? '✓ ' : ''}{u.name}</span>
                            <span className={selected ? 'text-orange-200' : 'text-orange-500'}>+£{u.price.toFixed(2)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {(menu?.categories?.find(c => c.name === itemModal.item.category)?.allowNotes ?? false) && (
                  <ItemNoteInput value={modalNotes} onChange={setModalNotes} />
                )}
              </div>
            </div>

            <div className="px-5 pb-5 pt-2 border-t border-slate-100">
              <button onClick={confirmAddFromModal}
                disabled={modalUnmetGroupIds.length > 0}
                className="w-full bg-orange-600 text-white font-black py-3.5 rounded-xl text-base hover:bg-orange-700 transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
                {modalUnmetGroupIds.length > 0
                  ? 'Choose required options'
                  : `${itemModal.editCartKey ? 'Save' : 'Add to basket'} · £${(
                      itemModal.item.price
                      + modalMods.reduce((s, m) => s + m.price, 0)
                      + (itemModal.editCartKey ? 0 : itemModal.upsells.filter(u => modalUpsells.includes(u.name)).reduce((s, u) => s + u.price, 0))
                    ).toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deals Modal */}
      {dealModalOpen && selectedBundleForModal && menu && (
        <DealsModal
          bundles={[selectedBundleForModal]}
          menuItems={menu.items}
          menuCategories={menu.categories}
          basketItems={basket.map(b => ({
            name: b.menuItem.name,
            quantity: b.quantity,
            unit_price: b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0),
            cartKey: b.cartKey,
            modifiers: b.modifiers,
            specialInstructions: b.specialInstructions || undefined,
          }))}
          existingDeals={appliedDeals}
          onApply={handleApplyDeal}
          onClose={() => setDealModalOpen(false)}
        />
      )}

      {/* Allergen information modal */}
      {showAllergenModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Allergen information</h3>
              <button onClick={() => setShowAllergenModal(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            {(() => {
              // Resolve what to show by display_mode (2 modes now; 'both' + null legacy → per-dish — one
              // source of truth). card → the opaque card only. per_dish/both/null → the per-item allergen
              // union (the "derived card"), verified-gated server-side so ONLY confirmed ones appear.
              const mode = truck?.allergen_display_mode
              const showCard = mode === 'card' && !!(truck?.allergen_info_url || truck?.allergen_info_text)
              const perItem = mode !== 'card'
                ? [...new Set((menu?.items ?? []).flatMap(i => i.allergens ?? []))].sort()
                : []
              if (!showCard && perItem.length === 0) {
                // Honest fallback — never invents data; directs to a human.
                return (
                  <p className="text-sm text-slate-600">
                    Allergen info not provided — please confirm directly with the truck.
                  </p>
                )
              }
              return (
                <>
                  {showCard && truck?.allergen_info_url && (
                    <a href={truck.allergen_info_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3
                                 text-sm text-orange-700 font-medium hover:bg-orange-100">
                      📎 View allergen card (PDF/image)
                    </a>
                  )}
                  {showCard && truck?.allergen_info_text && (
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{truck.allergen_info_text}</p>
                  )}
                  {perItem.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1">Allergens used in this menu</p>
                      <div className="flex flex-wrap gap-1">
                        {perItem.map(a => (
                          <span key={a} className="text-xs px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg">{a}</span>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">See each dish for its specific allergens.</p>
                    </div>
                  )}
                </>
              )
            })()}
            <p className="text-xs text-slate-400">
              If you have a severe allergy, please contact the vendor directly before ordering.
            </p>
          </div>
        </div>
      )}

    </Shell>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// ── 🔴 THE CONFIRMATION — ONE COMPONENT, TWO WAYS IN ────────────────────────────────────────────────
// This is the markup that used to live inline under `if (submitted)`. It was EXTRACTED, not copied, and
// that distinction is the whole point of the change: a card customer returning from Stripe and a
// pay-at-hatch customer who never left must see the SAME screen, and the only way to guarantee that over
// time is for there to be one copy of it.
//
// 🔴 IF YOU EVER NEED TO CHANGE THIS SCREEN FOR ONE PATH ONLY, YOU HAVE FOUND A PRODUCT QUESTION, NOT A
// TECHNICAL ONE. Add a prop and branch inside; do not fork the component. Two copies would drift within
// a release, and the drift would be invisible because only one of the two is reachable in normal use.
//
// ── THE TWO CALLERS, AND WHY THE PROPS LOOK LIKE THIS ──────────────────────────────────────────────
//   IN-MEMORY  (pay-at-hatch, unchanged): the page maps its live `basket` / `appliedDeals` into the
//              shapes below. It reaches here by exactly the same path it always did — `setSubmitted(true)`
//              then an early return — with no fetch and no URL.
//   BY URL     (a card customer, new): the page fetches the order by order_key and maps `orders.items` /
//              `orders.deals` into the SAME shapes.
// ⚠️ THE PROPS ARE NORMALISED ON PURPOSE. `basket` holds `BasketItem` objects with a nested `menuItem`;
// the database holds flat JSONB. Neither shape belongs in the markup, so both callers map to a third
// that is neither — which is what stops the component learning about either source.
//
// ⚠️ PURE. No hooks, no fetches, no effects. Everything it renders arrives as a prop, so it can be
// exercised against a database row without a browser — and it was.

/** One receipt line, normalised. Both callers map into this; the markup knows nothing else. */
export interface ConfirmationLine {
  key: string
  name: string
  quantity: number
  /** INCLUDING modifiers — the repo-wide convention for unit_price. */
  unitPrice: number
  basePrice: number
  modifiers: { name: string; price: number }[]
  specialInstructions?: string
}

/** One applied deal, normalised. `saving` is precomputed by the caller — see the note on each call site. */
export interface ConfirmationDeal {
  name: string
  bundlePrice: number
  saving: number
  slots: Record<string, string>
  slotModifiers: Record<string, { name: string; price: number }[]>
  slotNotes: Record<string, string>
}

function OrderConfirmation({
  slug, truck, truckName, orderId, autoAccepted,
  confirmedSlot, requestedSlot, slotChanged, asapEstimate, preferredSlot,
  lines, deals, total, paymentStatus, email, cardFallbackNotice,
}: {
  slug: string
  truck: TruckData | null
  truckName: string
  orderId: string | null
  autoAccepted: boolean
  confirmedSlot: string | null
  requestedSlot: string | null
  slotChanged: boolean
  asapEstimate: string | null
  /** The slot to show on the PENDING branch when nothing is confirmed yet. */
  preferredSlot: string | null
  lines: ConfirmationLine[]
  deals: ConfirmationDeal[]
  total: number
  /** 🔴 THE ORDER'S OWN payment_status, never a truck setting. See the payment line below. */
  paymentStatus: string | null
  email: string | null
  cardFallbackNotice: boolean
}) {
  // ASAP silently bumped: the customer chose ASAP (no chosen slot, so server slotChanged=false), but the
  // booked slot differs from the "Around HH:MM" estimate they saw. Compare via formatTime so a
  // seconds/format mismatch doesn't false-trigger. MOVED HERE WITH THE MARKUP IT DRIVES — it was computed
  // in the page body and read only here, so it belongs to this component, not to the page.
  const asapMoved =
    !!asapEstimate && !!confirmedSlot &&
    formatTime(asapEstimate) !== formatTime(confirmedSlot)

  return (
    <Shell><Hdr slug={slug} truck={truck} scrolled={false} showBack={false} />
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✓</div>
          <h2 className="text-2xl font-black text-slate-900 mb-1">{autoAccepted ? 'Order confirmed!' : 'Order received!'}</h2>
          <p className="text-slate-500 mb-3 text-sm">
            {autoAccepted
              ? <>Thanks! We&apos;ve received your order and it&apos;ll be ready soon.</>
              : <><span className="font-semibold text-slate-700">{truckName}</span> will confirm your order shortly.</>
            }
          </p>

          {orderId && <p className="text-slate-400 text-sm mb-3">Order #{orderId}</p>}

          {/* Collection time — promoted above the receipt */}
          {(confirmedSlot || preferredSlot) && (
            autoAccepted && confirmedSlot ? (
              <div className={`rounded-xl p-3 mb-4 text-sm text-center border ${(slotChanged || asapMoved) ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100'}`}>
                {slotChanged && requestedSlot ? (
                  // Time-moved: collection time is the prominent headline; the reason is small supporting
                  // text. Subtle amber (not error) — it's a confirmed order at a slightly different time.
                  <>
                    <p className="font-black text-amber-900 text-base">Ready at {confirmedSlot}</p>
                    <p className="text-amber-700 text-xs mt-0.5">Your {requestedSlot} slot was just taken — this is the next available time.</p>
                  </>
                ) : asapMoved ? (
                  <>
                    <p className="font-black text-amber-900 text-base">Ready at {confirmedSlot}</p>
                    <p className="text-amber-700 text-xs mt-0.5">Slightly later than the {formatTime(asapEstimate!)} we estimated.</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-green-800 mb-0.5">Collection time: {confirmedSlot}</p>
                    <p className="text-green-700 text-xs">See you at the hatch!</p>
                  </>
                )}
              </div>
            ) : (preferredSlot || confirmedSlot) ? (
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4 text-sm text-left">
                {/* Preferred (pending) collection time is the prominent headline; the moved reason +
                    "truck will confirm" are smaller supporting lines. Reads as confirmed-at-a-time, not error. */}
                <p className="font-black text-orange-800 text-base">Preferred collection: {asapMoved ? confirmedSlot : (preferredSlot || confirmedSlot)}</p>
                {asapMoved && (
                  <p className="text-orange-600 text-xs mt-0.5">Slightly later than the {formatTime(asapEstimate!)} we estimated.</p>
                )}
                <p className="text-orange-600 text-xs mt-0.5">{truckName} will confirm your collection time when they accept your order.</p>
              </div>
            ) : null
          )}

          <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2 mb-4 border border-slate-100">
            {lines.map(l => (
              <OrderLineItem
                key={l.key}
                name={l.name}
                quantity={l.quantity}
                unitPrice={l.unitPrice}
                basePrice={l.basePrice}
                modifiers={l.modifiers}
                specialInstructions={l.specialInstructions}
                variant="customer"
              />
            ))}
            {deals.map((deal, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">
                    🎁 {deal.name}
                    {deal.saving > 0 && <span className="ml-1.5 text-green-600 font-medium">save £{deal.saving.toFixed(2)}</span>}
                  </span>
                  <span className="font-medium text-slate-700">£{deal.bundlePrice.toFixed(2)}</span>
                </div>
                {Object.keys(deal.slots).sort().map(slotKey => {
                  const itemName = deal.slots[slotKey]
                  if (!itemName) return null
                  const mods = deal.slotModifiers?.[slotKey] || []
                  const note = deal.slotNotes?.[slotKey]
                  return (
                    <div key={slotKey}>
                      <div className="pl-3 text-xs text-slate-400">{itemName}</div>
                      {mods.map(m => (
                        <div key={m.name} className="flex justify-between pl-6 text-xs text-slate-400">
                          <span>{m.name}</span>
                          {m.price > 0 && <span>+£{m.price.toFixed(2)}</span>}
                        </div>
                      ))}
                      {note && <div className="pl-6 text-xs text-slate-400 italic">📝 {note}</div>}
                    </div>
                  )
                })}
              </div>
            ))}
            <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
              <span className="font-black text-slate-900">Total</span>
              <span className="font-black text-slate-900">£{total.toFixed(2)}</span>
            </div>
          </div>

          {/* ── 🔴 THE PAYMENT LINE — FROM THE ORDER'S OWN STATE, NEVER FROM A TRUCK SETTING ────────
              This used to be the hardcoded string "Pay at the truck", which was correct while the only
              way to reach this screen was pay-at-hatch. It now reads `payment_status` off the ORDER, so
              an order paid online lands on the paid branch every time — whatever the truck's settings
              say, whatever the customer chose, and whether they arrived here in memory or by URL.
              ⚠️ THE PAY-AT-HATCH PATH IS UNCHANGED: it passes 'unpaid' (the order was created moments
              ago and is unpaid by construction), which renders the identical original string.
              ⚠️ `part_paid` and `refunded` are legal values on this column and both fall to the
              not-paid branch, which is the safe direction: it tells a customer to expect to pay rather
              than telling them they are square when they are not. */}
          <div className="flex justify-between text-sm mb-4">
            <span className="text-slate-500">Payment</span>
            {paymentStatus === 'paid' ? (
              <span className="font-bold text-green-600">Paid by card</span>
            ) : (
              <span className="font-bold text-slate-700">Pay at the truck</span>
            )}
          </div>

          {/* ── 🔴 THE ORDER IS PLACED BUT THE CARD STEP DID NOT START ─────────────────────────────
              Reached only on the card path when Stripe could not be started. The customer chose to pay
              now and is not paying now, so they are TOLD. Leaving the line above saying "Pay at the
              truck" with no explanation would be technically true and actively misleading.
              ⚠️ It is FALSE on the URL path by construction — a customer who arrived here from Stripe
              did start a card payment, so the notice cannot be true for them. */}
          {cardFallbackNotice && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-4 text-left">
              <p className="text-xs text-amber-700">
                We couldn&apos;t start the card payment, so your order is set to pay at the truck instead.
                Your order is placed — nothing has been charged.
              </p>
            </div>
          )}

          {email && <p className="text-slate-400 text-xs mb-6">Confirmation sent to {email}</p>}
          {/* Slug-based truck route (Manual s.7). Targets the truck's own order/menu
             page, the only customer route that resolves by slug for a HatchGrab truck
             (/trucks/[slug] is the discovery profile and 404s for operator-only trucks).
             🔴 A FULL NAVIGATION (<a>), NOT A <Link>, AND NOW FOR TWO REASONS. It always reloaded a
             fresh form because the confirmation shared this URL. It ALSO now drops the ?confirm=
             parameter and clears the in-memory basket — a soft navigation would leave both in place,
             and a customer would return to the form with an order they have already placed still in it. */}
          <a href={`/trucks/${slug}/order`} className="block w-full bg-slate-900 text-white font-bold py-3 px-6 rounded-xl hover:bg-slate-800 transition-colors">
            Back to {truckName}
          </a>
        </div>
      </div>
    </Shell>
  )
}

// Shared note input used on basket lines (compact) and in the modifier popup (full)
function ItemNoteInput({
  value, onChange, compact = false, onBlur, onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  compact?: boolean
  onBlur?: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  if (compact) {
    return (
      <input
        autoFocus
        type="text"
        maxLength={60}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder="Any requests? e.g. no onions"
        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
      />
    )
  }
  return (
    <div>
      <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
        Any requests? <span className="font-normal normal-case text-slate-400">— optional</span>
      </p>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value.slice(0, 60))}
        placeholder="e.g. no onions, extra crispy"
        rows={2}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none"
      />
      <p className="text-right text-[10px] text-slate-400 mt-0.5">{value.length}/60</p>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 flex flex-col">{children}</div>
}

function Hdr({ slug, truck, scrolled, showBack = true, bannerRef }: { slug: string; truck: TruckData | null; scrolled: boolean; showBack?: boolean; bannerRef?: React.Ref<HTMLDivElement> }) {
  // DEMO banner lives HERE, not at each render path: <Hdr> is the one component every state of this page
  // goes through (loading, error, no-event, ended, and the live menu), so one insertion covers all five and
  // a future sixth can't miss it. A demo truck's SLUG carries the `demo-` prefix (lib/demo.ts), so the page
  // needs no extra data to know. Sticky directly under the 60px header so it stays visible while scrolling
  // a long menu — a demo indicator that scrolls away isn't doing its job. Calm, matching the dashboard.
  const isDemo = isDemoIdentifier(slug)
  // Customer-facing name — trailing "(code)" stripped for display only. See lib/demo.ts.
  const truckName = displayTruckName(truck?.name)
  return (
    <>
    <header className="bg-slate-900 text-white py-3 px-4 sticky top-0 z-50 shadow-md h-[60px] flex items-center">
      <div className="max-w-6xl mx-auto flex justify-between items-center w-full relative">

        {/* Left — the brand mark, always visible */}
        <Link href="/" className="flex items-center transition-opacity hover:opacity-90 shrink-0 z-20">
          {/* 🔴 TWO MARKS, ONE SHOWN. `data-brand` on <html> (app/layout.tsx, from the request host)
              hides the other in app/globals.css, so the right one is in the FIRST painted frame.
              hatchgrab.com gets the HatchGrab wordmark; villagefoodie.co.uk keeps the Village Foodie one.
              ⚠ PLAIN <img> FOR THE WORDMARK, NOT next/image: the source is an SVG and next/image would
              need `dangerouslyAllowSVG`, deliberately not enabled (components/brand/HatchGrabWordmark.tsx).
              ⚠ 141x31 IS THE 4.548:1 CROP RATIO lib/brand.ts requires; any other pair distorts it. WHITE
              variant because this header is bg-slate-900. */}
          <Image src="/logos/village-foodie-logo-v2.png" alt="Village Foodie" width={140} height={42} className="brand-mark-vf object-contain w-[110px] sm:w-[140px]" priority />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/hatchgrab-wordmark-white.svg" alt="HatchGrab" width={141} height={31} className="brand-mark-hg object-contain w-[110px] sm:w-[140px]" />
        </Link>

        {/* Centre — truck logo + name, absolutely positioned so it never pushes logo or Back */}
        {truck && (
          <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${scrolled ? 'opacity-100' : 'opacity-0'}`}>
            {/* px-[115px] sm:px-[145px] reserves ≥ the VF logo width (110px mobile / 140px sm) so the
                centred block can never overlap the left logo. Logo capped to FIXED px (w-[40px]/[48px],
                its current size) so it no longer scales with OS text and grows into the VF zone. */}
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 px-[115px] sm:px-[145px] w-full">
              {/* ⚠ NO EMOJI PLACEHOLDER — see the note on the large logo above. With no logo the centred
                  block is just the name; the flex `gap` collapses on its own with a single child. */}
              {truck.logo && (
                <Image src={truck.logo} alt={truckName} width={48} height={48} className="w-[40px] h-[40px] sm:w-[48px] sm:h-[48px] object-contain rounded-full bg-white shadow-sm shrink-0" />
              )}
              <h1 className="text-[13px] sm:text-[15px] font-bold sm:font-black tracking-tight leading-tight truncate max-w-[110px] sm:max-w-xs">
                {truckName}
              </h1>
            </div>
          </div>
        )}

        {/* Right — Back link. Hidden on the confirmation screen (showBack=false), where
           the bottom "Back to {truck}" button is the single action. Targets the truck's
           own order page by slug (Manual s.7) — /trucks/[slug] is the discovery profile
           and 404s for a HatchGrab-only tenant. Full navigation (<a>) so it lands on a
           fresh menu even from the error/unavailable states (same URL otherwise). */}
        {showBack && truck && (
          <a href={`/trucks/${slug}/order`} className="text-slate-400 hover:text-white text-xs font-bold transition-colors shrink-0 z-20">
            ← Back
          </a>
        )}

      </div>
    </header>
    {/* Shared with the dashboard and the KDS — components/DemoModeBanner.tsx. Sticky under the 60px header
        (this page isn't a flex shell), so it stays visible while scrolling a long menu. */}
    {isDemo && <DemoModeBanner innerRef={bannerRef} className="sticky top-[60px] z-40 shadow-sm" action={<DemoGetStarted slug={slug} />} />}
    </>
  )
}


function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-4 mb-4">
      <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">{title}</h2>
      {children}
    </div>
  )
}

function Fld({ label, required, note, children }: { label: string; required?: boolean; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        {note && <span className="text-slate-400 font-normal ml-1">— {note}</span>}
      </label>
      {children}
    </div>
  )
}

function QBtn({ onClick, label, accent }: { onClick: () => void; label: string; accent?: boolean }) {
  return (
    <button onClick={onClick} className={`w-7 h-7 rounded-full border flex items-center justify-center text-base font-bold transition-colors active:scale-90 ${accent ? 'border-orange-400 text-orange-600 hover:bg-orange-50' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
  )
}