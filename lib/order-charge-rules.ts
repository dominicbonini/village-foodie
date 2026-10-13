// lib/order-charge-rules.ts — 🔴 THE SERVER'S ANSWER TO "WHICH CHARGES APPLY TO THIS ORDER" (Phase 3
// foundations, docs/phase-3-foundations-report.md).
//
// From three sources, all server-side: the truck's country (country_settings), the truck, and the event.
// The browser sends only the tip choice; every rate, fee and switch is read here. The result goes to the
// pure engine in lib/order-charges.ts.
//
// ── PRECEDENCE ──────────────────────────────────────────────────────────────────────────────────────────
//   tax rule and name     the country (prices_include_tax, tax_label)
//   tax rate              the truck's ONE rate, `tax_rate_milli` (thousandths of a percent). Ignored where tax
//                         is included. ⛔ NO PER-EVENT OVERRIDE (Dominic, 13 October 2026): each truck has one
//                         rate, and `truck_events.tax_rate_bps` is retired — unread and unwritten.
//   tipping               the truck's tipping_enabled, else the country's tipping_enabled_default; the
//                         presets are always the country's.
//   service fee           off unless the country allows it AND (HatchGrab keeps it — the country's amount,
//                         which trucks cannot change — OR the truck keeps it and has it on, within the
//                         country's maximum).
//   card surcharge        ⚠️ ALWAYS OFF in Phase 3, whatever the country says. The engine supports it.
//   card fee payer        the truck's card_fee_payer (default 'truck').
//   platform fee          the country's platform_fee_enabled + platform_fee_pct. Never sent this phase.
//
// 🔴 GB: tax included, every add-on off → the grand total is the food, exactly as before Phase 3.
import 'server-only'
import type { CountrySettings } from '@/lib/country-settings-types'
import { countrySettingsForTruck } from '@/lib/country-settings'
import type { OrderChargeRules } from '@/lib/order-charges'

/** The truck columns the rules read (20261010_17). Every one is optional so a row read before the
 *  migration, or a narrow select, resolves to the defaults rather than failing. */
export interface TruckChargeFields {
  country?: string | null
  /** Thousandths of a percent (8.25 % = 8250). `tax_rate_bps` is retired (20261010_18) and never read. */
  tax_rate_milli?: number | null
  tipping_enabled?: boolean | null
  card_fee_payer?: string | null
  service_fee_enabled?: boolean | null
  service_fee_bps?: number | null
  service_fee_fixed_minor?: number | null
}

/** A country percentage (numeric(5,2), "as written": 15 = 15 %) → basis points. */
const pctToBps = (pct: number): number => Math.round(pct * 100)
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null)

/** PURE: the rules from the truck's country and the truck. Exported for the harness and for /api/menu. */
export function resolveChargeRules(
  country: CountrySettings,
  truck: TruckChargeFields,
): OrderChargeRules {
  const taxInclusive = country.pricesIncludeTax
  const taxRateMilli = taxInclusive ? null : int(truck.tax_rate_milli)

  let serviceFee: OrderChargeRules['serviceFee'] = null
  if (country.serviceFeeAllowed) {
    if (country.serviceFeeRecipient === 'hatchgrab') {
      const bps = country.serviceFeeHatchgrabBps ?? 0
      const fixedMinor = country.serviceFeeHatchgrabFixedMinor ?? 0
      if (bps > 0 || fixedMinor > 0) serviceFee = { recipient: 'hatchgrab', bps, fixedMinor }
    } else if (truck.service_fee_enabled === true) {
      // Within the country's maximum: a part the country gives no maximum for is not allowed at all.
      const bps = Math.min(int(truck.service_fee_bps) ?? 0, country.serviceFeeTruckMaxBps ?? 0)
      const fixedMinor = Math.min(int(truck.service_fee_fixed_minor) ?? 0, country.serviceFeeTruckMaxFixedMinor ?? 0)
      if (bps > 0 || fixedMinor > 0) serviceFee = { recipient: 'truck', bps, fixedMinor }
    }
  }

  const tippingOn = typeof truck.tipping_enabled === 'boolean' ? truck.tipping_enabled : country.tippingEnabledDefault
  const tipping = tippingOn ? { presetsBps: country.tipPresetsPct.map(pctToBps) } : null

  return {
    taxInclusive,
    taxLabel: country.taxLabel,
    taxRateMilli,
    feesTaxed: country.feesTaxed,
    serviceFee,
    tipping,
    surcharge: null,                     // ⚠️ OFF in Phase 3 — see the header
    cardFeePayer: truck.card_fee_payer === 'customer' ? 'customer' : 'truck',
    platformFee: country.platformFeeEnabled && country.platformFeePct !== null ? { bps: pctToBps(country.platformFeePct) } : null,
  }
}

/**
 * The rules for an order on this truck, read from the database: the truck's country (the cached loader)
 * and the truck row the caller already holds. No other read — there is no per-event rate.
 */
export async function loadChargeRules(
  truck: TruckChargeFields & { id: string },
): Promise<OrderChargeRules> {
  const country = await countrySettingsForTruck(truck)
  return resolveChargeRules(country, truck)
}
