// lib/billing/gate.ts — billing-1: WHAT BILLING CHANGES ON THE LIVE PATHS. SERVER ONLY.
//   • /api/menu and /api/orders/submit ask `billingGateForTruck`: is online ordering paused by billing, and does billing
//     allow Pay at Hatch? (lib/billing/rules.ts says when.)
//   • lib/payments/capture.ts asks `applicationFeeAtCapture`: the fee to take from this online payment, or null.
//
// 🔴 OFF MEANS BYTE-IDENTICAL. While platform_switches.billing_enabled is false the gate answers { paused: false,
// payAtHatch: true } and the fee is null — before any other read — so every response is exactly what it was before billing
// existed. The switch is read once a minute per server instance (one tiny select), never per request.
// 🔴 A FAILURE NEVER PAUSES A TRUCK. If billing's own reads fail while the switch is on, the gate answers as if billing
// were off and logs it: a truck must not stop taking orders because our database hiccupped.
import 'server-only'
import type { PlanCatalog } from '@/lib/plans'
import {
  onlineOrderingPausedByBilling, payAtHatchAllowedByBilling, arrangementOf, billableOf, inTrial, applicationFeeFor, periodOf, periodBounds,
  previousPeriod, planLevelAt,
} from '@/lib/billing/rules'
import { platformFeeOn } from '@/lib/country-settings-types'
import { minorDigits } from '@/lib/money-format'
import { billingContextFor } from '@/lib/billing/engine'
import { serverBillingStore } from '@/lib/billing/store'

const SWITCH_TTL_MS = 60_000
let switchCache: { at: number; on: boolean } | null = null

/** Is billing switched on? Cached for a minute; a failed read is OFF. */
export async function billingSwitchOn(): Promise<boolean> {
  const now = Date.now()
  if (switchCache && now - switchCache.at < SWITCH_TTL_MS) return switchCache.on
  let on = false
  try { on = (await (await serverBillingStore()).switches()).enabled } catch { on = false }
  switchCache = { at: now, on }
  return on
}

export interface BillingGate {
  /** Billing pauses ONLINE ordering (the existing "not taking orders" state). Walk-ups and the kitchen are never paused. */
  onlineOrderingPaused: boolean
  /** Billing allows Pay at Hatch (the plan's switch still applies on top). */
  payAtHatchAllowed: boolean
  /** billing-2: billing allows CARD payment online. False for a post-pay truck ("At the truck, when they collect" — Manage ›
   *  Billing), whose customers pay at the truck; the Stripe readiness check still applies on top. */
  cardPaymentsAllowed: boolean
}
export const BILLING_GATE_OFF: BillingGate = { onlineOrderingPaused: false, payAtHatchAllowed: true, cardPaymentsAllowed: true }

/** The gate for one truck. Any truck row will do — it is re-read narrowly by id when the switch is on. */
export async function billingGateForTruck(truck: { id: string }, catalog: PlanCatalog, now: Date = new Date()): Promise<BillingGate> {
  if (!(await billingSwitchOn())) return BILLING_GATE_OFF
  try {
    const store = await serverBillingStore()
    const stored = await store.truck(truck.id)
    if (!stored) return BILLING_GATE_OFF
    const ctx = await billingContextFor(store, stored, catalog, now)
    const postPay = billableOf(ctx).billable && arrangementOf(ctx)?.postPay === true
    return { onlineOrderingPaused: onlineOrderingPausedByBilling(ctx), payAtHatchAllowed: payAtHatchAllowedByBilling(ctx), cardPaymentsAllowed: !postPay }
  } catch (err) {
    console.error(`[billing/gate] 🔴 could not read billing for truck=${truck.id} — answering as if billing were off:`, err instanceof Error ? err.message : err)
    return BILLING_GATE_OFF
  }
}

/**
 * 🔴 THE APPLICATION FEE FOR THIS ONLINE PAYMENT, or null (send none — absence, never zero).
 * Only when: billing is on · the truck is billable and past its trial · its arrangement takes the fee from the payment
 * (model (a), not post-pay) · platformFeeOn(country) (35.an-17) · the plan has a fee and the order is above the allowance.
 * The amount is the order's line of the month's allocation (lib/billing/rules.ts applicationFeeFor), capped at what is
 * being captured. Never throws: a failure is null (no fee) and a log line — the month-end then bills it instead.
 */
export async function applicationFeeAtCapture(a: { orderKey: string; truckId: string; captureMinor: number; now?: Date; catalog: PlanCatalog }): Promise<number | null> {
  if (!(await billingSwitchOn())) return null
  const now = a.now ?? new Date()
  try {
    const store = await serverBillingStore()
    const truck = await store.truck(a.truckId)
    if (!truck) return null
    const ctx = await billingContextFor(store, truck, a.catalog, now)
    if (!billableOf(ctx).billable || inTrial(truck, a.catalog, now)) return null
    const arr = arrangementOf(ctx)
    if (!arr?.feeFromPayment || !platformFeeOn(ctx.country)) return null
    // The ORDER'S month (placed_at, truck's zone) — an order placed just before midnight on the 31st and captured after it
    // belongs to the month it was placed in. This month first, then the previous one.
    const tz = truck.timezone || 'Europe/London'
    let orders: Awaited<ReturnType<typeof store.usageOrders>> = []
    let self: (typeof orders)[number] | undefined
    for (const period of [periodOf(now, tz), previousPeriod(periodOf(now, tz))]) {
      const { start, end } = periodBounds(period, tz)
      orders = await store.usageOrders(truck.id, start, end)
      self = orders.find(o => o.orderKey === a.orderKey)
      if (self) break
    }
    if (!self) return null
    // Each order at the plan in force when it was placed (plan history — the same pricing the month-end uses).
    const pin = { truck, history: await store.planHistory(truck.id), catalog: a.catalog, countryCode: truck.country, tz }
    const priceOf = (o: { placedAt: string }) => {
      const lv = planLevelAt(pin, Date.parse(o.placedAt))
      return lv.trialling ? null : { allowanceMinor: lv.price ? lv.price.includedOnlineMinor : null, feeBps: lv.price ? lv.price.feeBps : 0, planKey: lv.planKey }
    }
    if (!priceOf(self)?.feeBps) return null
    const fee = applicationFeeFor({
      earlier: orders.filter(o => o.orderKey !== a.orderKey && Date.parse(o.placedAt) <= Date.parse(self.placedAt)),
      order: { ...self, paidOnline: true }, priceOf, roundDown: minorDigits(truck.currency) === 0,
    })
    const capped = Math.min(fee, Math.max(0, a.captureMinor))
    return capped > 0 ? capped : null
  } catch (err) {
    console.error(`[billing/gate] 🔴 could not compute the application fee for order_key=${a.orderKey} — none sent; the month-end bills it:`, err instanceof Error ? err.message : err)
    return null
  }
}

/** For the harness: forget the cached switch. */
export function __resetBillingSwitchCache(): void { switchCache = null }
