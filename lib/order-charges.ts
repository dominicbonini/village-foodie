// lib/order-charges.ts — 🔴 THE ONE PLACE AN ORDER'S TAX, TIP AND FEES ARE COMPUTED (Phase 3 foundations,
// docs/phase-3-foundations-report.md).
//
// PURE: no database, no clock, no browser. Integer MINOR UNITS in, integer minor units out. Every order
// path calls this (the customer submit, card and pay-at-the-truck; the walk-up; the operator edit; the
// pay-at-the-truck switch after a released hold), so there is one answer to "what does this order cost".
// The rules come from lib/order-charge-rules.ts (server only); the browser sends only the tip choice.
//
// ── THE DECISIONS IT CARRIES (docs/phases-3-6-audit-report.md) ───────────────────────────────────────────
//   D2  the TAX rate is thousandths of a percent (8.25 % = 8250, 8.875 % = 8875 — Option B, 13 October
//       2026, because a basis point cannot hold 8.875 %); tip and fee percentages stay basis points.
//   D3  ONE rounding per order, half away from zero — tax is rounded once, on the whole base.
//   D6  the discount comes off before tax: `foodMinor` is ALREADY after the discount.
//   D8  the service fee and surcharge are taxed only when the country says so.
//   D11 the tip is a percentage of food after discount, before tax. Never taxed.
//   D12 a custom tip is capped at 100 % of food.
//   D13 no online tip on a pay-at-the-truck order (nor on a walk-up).
//   D14 an operator edit keeps the tip's percentage, never above the original amount (`caps.tipMinor`).
//   D25 pay at the truck drops the service fee and the surcharge.
//   D26 the service fee is a percentage, a fixed amount or both, as ONE amount.
//
// ── 🔴 WHERE PRICES INCLUDE TAX (GB) ─────────────────────────────────────────────────────────────────────
// Tax is 0 and nothing is added. With every add-on off, the grand total IS the food, and the snapshot's
// only non-null values are food_minor, tax_inclusive (true), tax_label and card_fee_payer.

/** How the order is being paid for — it decides which charges can apply at all. */
export type ChargeChannel = 'online_card' | 'online_pay_at_truck' | 'walk_up'

/** The resolved rules for ONE order. Built by lib/order-charge-rules.ts; never from the browser. */
export interface OrderChargeRules {
  /** The country's rule: true = menu prices include tax (GB), so nothing is added on top. */
  taxInclusive: boolean
  /** The tax's name ('VAT', 'Sales tax'), snapshotted on the order. */
  taxLabel: string
  /** The rate added on top, thousandths of a percent (8.25 % = 8250). Null = none set (or tax included). */
  taxRateMilli: number | null
  /** D8: whether the service fee and surcharge are taxed too. */
  feesTaxed: boolean
  /** The online service fee, or null when none applies. */
  serviceFee: { recipient: 'truck' | 'hatchgrab'; bps: number; fixedMinor: number } | null
  /** Online tipping, or null when off. `presetsBps` are the country's choices. */
  tipping: { presetsBps: number[] } | null
  /** The card surcharge, or null. ⚠️ The resolver always returns null in Phase 3. */
  surcharge: { bps: number; fixedMinor: number } | null
  /** Who pays the card fee — the truck's setting. */
  cardFeePayer: 'truck' | 'customer'
  /** The platform fee, when the country switches it on. Never sent to Stripe in Phase 3. */
  platformFee: { bps: number } | null
}

/** What the customer chose: no tip, one of the country's percentages, or a custom amount. */
export type TipChoice =
  | { kind: 'none' }
  | { kind: 'percent'; bps: number }
  | { kind: 'amount'; minor: number }

/** The columns every order and draft stores (20261010_17). Snake case: these ARE the column names. */
export interface OrderChargeSnapshot {
  food_minor: number
  tax_minor: number
  tax_rate_milli: number | null
  tax_inclusive: boolean
  tax_label: string
  tip_minor: number
  tip_pct_bps: number | null
  service_fee_minor: number
  service_fee_recipient: 'truck' | 'hatchgrab' | null
  card_surcharge_minor: number
  card_funding: null
  card_fee_payer: 'truck' | 'customer'
  application_fee_minor: null
}

export interface OrderCharges {
  foodMinor: number
  taxMinor: number
  tipMinor: number
  serviceFeeMinor: number
  cardSurchargeMinor: number
  /** 🔴 THE GRAND TOTAL — what total_minor stores and what a card is authorised for. */
  totalMinor: number
  snapshot: OrderChargeSnapshot
}

export interface ChargeInput {
  /** Food after the discount (D6), minor units. A non-negative integer. */
  foodMinor: number
  rules: OrderChargeRules
  channel: ChargeChannel
  tip?: TipChoice | null
  /** An operator edit's ceilings (D14): the tip and service fee are never above what the order had. */
  caps?: { tipMinor?: number; serviceFeeMinor?: number }
}

/** The thirteen snapshot columns, in the migration's order (20261010_17) — on orders AND order_drafts. */
export const ORDER_CHARGE_COLUMNS = [
  'food_minor', 'tax_minor', 'tax_rate_milli', 'tax_inclusive', 'tax_label', 'tip_minor', 'tip_pct_bps',
  'service_fee_minor', 'service_fee_recipient', 'card_surcharge_minor', 'card_funding', 'card_fee_payer',
  'application_fee_minor',
] as const satisfies readonly (keyof OrderChargeSnapshot)[]

/**
 * A stored row's snapshot columns, copied verbatim — how promotion carries a draft's charges onto its order
 * (never re-derived: the customer was authorised for exactly these). A column the row lacks is left out,
 * so the order takes the column's default.
 */
export function chargeColumnsOf(row: Record<string, unknown>): Partial<OrderChargeSnapshot> {
  const out: Record<string, unknown> = {}
  for (const c of ORDER_CHARGE_COLUMNS) if (c in row) out[c] = row[c]
  return out as Partial<OrderChargeSnapshot>
}

const BPS = 10000
/** Thousandths of a percent in one whole: 100 % = 100000. */
const MILLI = 100000

/** `n × part / whole`, rounded ONCE, half away from zero (D3). Integer arithmetic throughout: the only
 *  division is the last step, so there is no float drift to round away. */
function applyRatio(n: number, part: number, whole: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(part)) throw new RangeError(`[order-charges] needs integers (got ${n}, ${part})`)
  const p = n * part
  if (!Number.isSafeInteger(p)) throw new RangeError(`[order-charges] ${n} × ${part} is too large`)
  const sign = p < 0 ? -1 : 1
  const a = Math.abs(p)
  return sign * Math.floor((2 * a + whole) / (2 * whole))
}
/** `n × bps / 10000` — tips, service fees and the platform fee. */
export const applyBps = (n: number, bps: number): number => applyRatio(n, bps, BPS)
/** `n × milli / 100000` — the sales tax rate (8.875 % = 8875). */
export const applyMilli = (n: number, milli: number): number => applyRatio(n, milli, MILLI)

const isMinor = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0

/**
 * Is this tip choice one the rules allow a CUSTOMER to make? A percentage must be one of the country's
 * presets; an amount must be a whole, non-negative number of minor units (the 100 % cap is the engine's).
 * The submit route asks this before pricing; an operator edit does not (it keeps what was chosen).
 */
export function tipChoiceAllowed(choice: TipChoice, rules: OrderChargeRules): boolean {
  if (choice.kind === 'none') return true
  if (!rules.tipping) return false
  if (choice.kind === 'percent') return rules.tipping.presetsBps.includes(choice.bps)
  return isMinor(choice.minor)
}

/** Read a tip choice off an untrusted request body. Absent → null; malformed → 'invalid'. */
export function parseTipChoice(raw: unknown): TipChoice | null | 'invalid' {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'object') return 'invalid'
  const o = raw as Record<string, unknown>
  if (o.kind === 'none') return { kind: 'none' }
  if (o.kind === 'percent' && Number.isSafeInteger(o.bps) && (o.bps as number) >= 0 && (o.bps as number) <= BPS) return { kind: 'percent', bps: o.bps as number }
  if (o.kind === 'amount' && isMinor(o.minor)) return { kind: 'amount', minor: o.minor as number }
  return 'invalid'
}

/** 🔴 THE ENGINE. Food after discount + rules + channel + tip → every charge, the grand total and the snapshot. */
export function computeOrderCharges(input: ChargeInput): OrderCharges {
  const { foodMinor, rules, channel } = input
  if (!isMinor(foodMinor)) throw new RangeError(`[order-charges] foodMinor must be a non-negative integer (got ${foodMinor})`)
  const online = channel === 'online_card'

  // ── service fee (online card only; D25 drops it for pay at the truck; never on a walk-up) ──
  let serviceFeeMinor = 0
  if (online && rules.serviceFee) {
    serviceFeeMinor = applyBps(foodMinor, rules.serviceFee.bps) + rules.serviceFee.fixedMinor
    if (input.caps?.serviceFeeMinor !== undefined) serviceFeeMinor = Math.min(serviceFeeMinor, input.caps.serviceFeeMinor)
  }

  // ── card surcharge (online card only). ⚠️ Always off in Phase 3 — the resolver returns null. ──
  let cardSurchargeMinor = 0
  if (online && rules.surcharge) cardSurchargeMinor = applyBps(foodMinor, rules.surcharge.bps) + rules.surcharge.fixedMinor

  // ── tip (online card only, tipping on; D11–D14) ──
  let tipMinor = 0
  let tipPctBps: number | null = null
  const tip = input.tip
  if (online && rules.tipping && tip && tip.kind !== 'none') {
    if (tip.kind === 'percent') {
      tipMinor = applyBps(foodMinor, tip.bps)
      tipPctBps = tip.bps
    } else {
      tipMinor = Math.min(tip.minor, foodMinor)                        // D12: at most 100 % of food
    }
    if (input.caps?.tipMinor !== undefined) tipMinor = Math.min(tipMinor, input.caps.tipMinor)   // D14
    if (tipMinor === 0) tipPctBps = null
  }

  // ── tax (D3: once; D6: food is after the discount; D8: fees only when the country says) ──
  let taxMinor = 0
  // france-1: an INCLUSIVE rate (France's TVA) is kept on the snapshot for the receipt's "dont TVA" line and never added;
  // every other inclusive country's rules carry no rate, so its snapshot is exactly as before (null).
  const taxRateMilli = rules.taxRateMilli
  if (!rules.taxInclusive && taxRateMilli) {
    const base = foodMinor + (rules.feesTaxed ? serviceFeeMinor + cardSurchargeMinor : 0)
    taxMinor = applyMilli(base, taxRateMilli)
  }

  const totalMinor = foodMinor + taxMinor + tipMinor + serviceFeeMinor + cardSurchargeMinor
  return {
    foodMinor, taxMinor, tipMinor, serviceFeeMinor, cardSurchargeMinor, totalMinor,
    snapshot: {
      food_minor: foodMinor,
      tax_minor: taxMinor,
      tax_rate_milli: taxRateMilli,
      tax_inclusive: rules.taxInclusive,
      tax_label: rules.taxLabel,
      tip_minor: tipMinor,
      tip_pct_bps: tipPctBps,
      service_fee_minor: serviceFeeMinor,
      // 🔴 Written only when a service fee actually applies to this order.
      service_fee_recipient: serviceFeeMinor > 0 && rules.serviceFee ? rules.serviceFee.recipient : null,
      card_surcharge_minor: cardSurchargeMinor,
      card_funding: null,                 // not known until a card is read — Phase 4
      card_fee_payer: rules.cardFeePayer,
      application_fee_minor: null,        // D19: taken at capture — not this phase
    },
  }
}

/**
 * The platform fee this order WOULD carry (D18: a share of food_minor; D19: taken at capture). Null when
 * the country has it off. ⚠️ NOTHING CALLS THIS IN PHASE 3 except the harness — no route sends
 * `application_fee_amount`, and no order stores one.
 */
export function wouldBeApplicationFeeMinor(foodMinor: number, rules: OrderChargeRules): number | null {
  return rules.platformFee ? applyBps(foodMinor, rules.platformFee.bps) : null
}

/** The stored order's snapshot columns, as an order or draft row holds them (all optional: an order
 *  placed before Phase 3 has none). */
export interface StoredCharges {
  food_minor?: number | null
  tax_minor?: number | null
  tax_rate_milli?: number | null
  tax_inclusive?: boolean | null
  tax_label?: string | null
  tip_minor?: number | null
  tip_pct_bps?: number | null
  service_fee_minor?: number | null
  service_fee_recipient?: string | null
  card_surcharge_minor?: number | null
  card_fee_payer?: string | null
}

/**
 * The rules an EXISTING order is re-priced under: today's (from the resolver), with the order's own
 * snapshot winning for tax (D4 — the rate, label and rule it was priced under) and for who pays the card
 * fee. An order placed before Phase 3 has no snapshot and takes today's rules whole.
 */
export function rulesForStoredOrder(current: OrderChargeRules, stored: StoredCharges): OrderChargeRules {
  if (stored.tax_inclusive === null || stored.tax_inclusive === undefined) return current
  return {
    ...current,
    taxInclusive: stored.tax_inclusive,
    taxLabel: stored.tax_label ?? current.taxLabel,
    // france-1: an inclusive order keeps the rate it was priced under too (null for every inclusive order before France).
    taxRateMilli: stored.tax_rate_milli ?? null,
    cardFeePayer: stored.card_fee_payer === 'customer' ? 'customer' : stored.card_fee_payer === 'truck' ? 'truck' : current.cardFeePayer,
  }
}

/**
 * 🔴 AN OPERATOR EDIT'S RE-PRICE. The edit never ADDS a charge the order did not have: an order with no
 * online tip, fee or surcharge is re-priced as an in-person order (tax only), whatever today's rules say.
 * One that had them keeps them, recomputed on the new food:
 *   • the tip keeps its percentage, capped at the original amount (D14); a custom tip keeps its amount,
 *     capped at 100 % of the new food (D12) and at the original;
 *   • the service fee is recomputed under today's rules, capped at the original amount;
 *   • tax uses the order's own snapshot (D4).
 */
export function chargesForEdit(newFoodMinor: number, current: OrderChargeRules, stored: StoredCharges): OrderCharges {
  const rules = rulesForStoredOrder(current, stored)
  const oldTip = stored.tip_minor ?? 0
  const oldFee = stored.service_fee_minor ?? 0
  const oldSurcharge = stored.card_surcharge_minor ?? 0
  const hadOnline = oldTip > 0 || oldFee > 0 || oldSurcharge > 0
  if (!hadOnline) return computeOrderCharges({ foodMinor: newFoodMinor, rules, channel: 'walk_up' })
  const tip: TipChoice = oldTip === 0 ? { kind: 'none' }
    : stored.tip_pct_bps != null ? { kind: 'percent', bps: stored.tip_pct_bps }
    : { kind: 'amount', minor: oldTip }
  return computeOrderCharges({
    foodMinor: newFoodMinor,
    rules: {
      ...rules,
      // The order's tip was allowed when it was placed; an edit keeps it even if tipping has since changed.
      tipping: oldTip > 0 ? (rules.tipping ?? { presetsBps: [] }) : null,
      serviceFee: oldFee > 0 ? rules.serviceFee : null,
      surcharge: oldSurcharge > 0 ? rules.surcharge : null,
    },
    channel: 'online_card',
    tip,
    caps: { tipMinor: oldTip, serviceFeeMinor: oldFee },
  })
}

/**
 * 🔴 THE PAY-AT-THE-TRUCK SWITCH (D25, D13). A card order whose hold was released and is now being paid at
 * the hatch: the service fee, the surcharge and the online tip come off, and tax is recomputed on the food
 * alone under the order's OWN snapshot (D4) — nothing else is needed, so today's rules are not read.
 * Null when there is nothing to drop (every GB order, every walk-up): the order is written ONLY when this
 * returns something.
 */
export function chargesForHatchSwitch(stored: StoredCharges): OrderCharges | null {
  const drop = (stored.tip_minor ?? 0) + (stored.service_fee_minor ?? 0) + (stored.card_surcharge_minor ?? 0)
  if (drop === 0 || stored.food_minor == null || stored.tax_inclusive == null) return null
  const rules: OrderChargeRules = {
    taxInclusive: stored.tax_inclusive,
    taxLabel: stored.tax_label ?? '',
    taxRateMilli: stored.tax_rate_milli ?? null,   // france-1: an inclusive order's rate is only ever worded, never added
    feesTaxed: false,                    // no fee or surcharge is left to tax
    serviceFee: null, tipping: null, surcharge: null,
    cardFeePayer: stored.card_fee_payer === 'customer' ? 'customer' : 'truck',
    platformFee: null,
  }
  return computeOrderCharges({ foodMinor: stored.food_minor, rules, channel: 'online_pay_at_truck' })
}

/**
 * 🔴 THE RULES THE CUSTOMER'S PAGE NEEDS, AND NO MORE (Phase 3 screens). Sent by /api/menu as ONE key,
 * `truck.checkout`, and only when something on the page would use it — so a UK truck's menu response is
 * unchanged. The browser rebuilds `OrderChargeRules` from it to SHOW amounts; the server stays the only
 * authority and re-prices everything on submit (the browser sends only the tip choice).
 * ⚠️ NO surcharge, card-fee payer or platform fee: none of them is shown to a customer this phase.
 */
export interface CheckoutRules {
  taxInclusive: boolean
  taxLabel: string
  taxRateMilli: number | null
  feesTaxed: boolean
  /** The service fee a CARD order carries, or null. Never on pay at the truck. */
  serviceFee: { recipient: 'truck' | 'hatchgrab'; bps: number; fixedMinor: number } | null
  tipping: { presetsBps: number[] } | null
}

/** The page's rules, or null when the page would show nothing new (every UK truck today). */
export function checkoutRulesFrom(rules: OrderChargeRules): CheckoutRules | null {
  const anything = !rules.taxInclusive || !!rules.tipping || !!rules.serviceFee
  if (!anything) return null
  return {
    taxInclusive: rules.taxInclusive, taxLabel: rules.taxLabel, taxRateMilli: rules.taxRateMilli,
    feesTaxed: rules.feesTaxed, serviceFee: rules.serviceFee, tipping: rules.tipping,
  }
}

/** Back to engine rules, in the browser. */
export function rulesFromCheckout(c: CheckoutRules): OrderChargeRules {
  return {
    taxInclusive: c.taxInclusive, taxLabel: c.taxLabel, taxRateMilli: c.taxRateMilli, feesTaxed: c.feesTaxed,
    serviceFee: c.serviceFee, tipping: c.tipping, surcharge: null, cardFeePayer: 'truck', platformFee: null,
  }
}
