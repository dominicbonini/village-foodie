// lib/order-charge-rules.ts — 🔴 THE SERVER'S ANSWER TO "WHICH CHARGES APPLY TO THIS ORDER" (Phase 3
// foundations, docs/phase-3-foundations-report.md).
//
// From three sources, all server-side: the truck's country (country_settings), the truck, and the event.
// The browser sends only the tip choice; every rate, fee and switch is read here. The result goes to the
// pure engine in lib/order-charges.ts.
//
// ── PRECEDENCE ──────────────────────────────────────────────────────────────────────────────────────────
//   tax rule and name     the country (prices_include_tax, tax_label) — canada-1 (22 October 2026): where tax is added on
//                         top and the truck's base REGION carries a sales tax in its address format (lib/address-formats.ts
//                         `salesTax`: Ontario "HST" 13 %, Alberta "GST" 5 %…), that region's name instead
//   tax rate              the truck's ONE rate, `tax_rate_milli` (thousandths of a percent) — canada-1: else its region's
//                         rate. Ignored where tax is included. ⛔ NO PER-EVENT OVERRIDE (Dominic, 13 October 2026): each truck has one
//                         rate, and `truck_events.tax_rate_bps` is retired — unread and unwritten.
//   tipping               the truck's tipping_enabled, else the country's tipping_enabled_default; the
//                         presets are always the country's.
//   service fee           off unless the country allows it AND (HatchGrab keeps it — the country's amount,
//                         which trucks cannot change — OR the truck keeps it and has it on, within the
//                         country's maximum).
//   card surcharge        ⚠️ ALWAYS OFF in Phase 3, whatever the country says. The engine supports it.
//   card fee payer        the truck's card_fee_payer (default 'truck').
//   platform fee          the country's platform_fee_enabled (OFF) + the truck's EFFECTIVE PLAN's fee_bps in its
//                         country (public.plan_prices, lib/plans.ts). Never sent this phase. ⚠️ country_settings.
//                         platform_fee_pct is RETIRED (plans-data-model, Stage A) and is not read here.
//
// 🔴 GB: tax included, every add-on off → the grand total is the food, exactly as before Phase 3.
import 'server-only'
import type { CountrySettings } from '@/lib/country-settings-types'
import { countrySettingsForTruck } from '@/lib/country-settings'
import { truckPlanFeeBps } from '@/lib/plans-server'
import type { OrderChargeRules } from '@/lib/order-charges'
import { regionSalesTax, includedTaxOf } from '@/lib/address-formats'

/** The truck columns the rules read (20261010_17). Every one is optional so a row read before the
 *  migration, or a narrow select, resolves to the defaults rather than failing. */
export interface TruckChargeFields {
  country?: string | null
  /** Thousandths of a percent (8.25 % = 8250). `tax_rate_bps` is retired (20261010_18) and never read. */
  tax_rate_milli?: number | null
  /** canada-1: the truck's base region code ("ON") — its region's sales tax is the default rate and the line's name. */
  base_region_code?: string | null
  tipping_enabled?: boolean | null
  card_fee_payer?: string | null
  service_fee_enabled?: boolean | null
  service_fee_bps?: number | null
  service_fee_fixed_minor?: number | null
}

/** A country percentage (numeric(5,2), "as written": 15 = 15 %) → basis points. */
const pctToBps = (pct: number): number => Math.round(pct * 100)
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null)

/** PURE: the rules from the truck's country and the truck. Exported for the harness and for /api/menu.
 *  `platformFeeBps` is the truck's effective plan's fee (lib/plans.ts), used only while the country's switch is on. */
export function resolveChargeRules(
  country: CountrySettings,
  truck: TruckChargeFields,
  platformFeeBps: number | null = null,
): OrderChargeRules {
  const taxInclusive = country.pricesIncludeTax
  // canada-1: the region's tax is DATA on the country's address format; a region without it (every US state) changes nothing.
  const regionTax = taxInclusive ? null : regionSalesTax(country.addressFormat, truck.base_region_code)
  // france-1: a format whose prices INCLUDE a named tax (France's TVA) keeps a rate for the receipt's "dont TVA" line — the
  // truck's own, else the format's default. Nothing is added to a price for it. Every other inclusive country: null, as before.
  const includedTax = taxInclusive ? includedTaxOf(country.addressFormat) : null
  const taxRateMilli = taxInclusive ? (includedTax ? (int(truck.tax_rate_milli) ?? includedTax.milli) : null) : (int(truck.tax_rate_milli) ?? regionTax?.milli ?? null)

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
    taxLabel: regionTax?.label ?? includedTax?.label ?? country.taxLabel,
    taxRateMilli,
    feesTaxed: country.feesTaxed,
    serviceFee,
    tipping,
    surcharge: null,                     // ⚠️ OFF in Phase 3 — see the header
    cardFeePayer: truck.card_fee_payer === 'customer' ? 'customer' : 'truck',
    platformFee: country.platformFeeEnabled && platformFeeBps !== null ? { bps: platformFeeBps } : null,
  }
}

/**
 * The rules for an order on this truck, read from the database: the truck's country (the cached loader)
 * and the truck row the caller already holds. No other read — there is no per-event rate — except the truck's plan,
 * and only while the country's platform fee is switched on.
 */
export async function loadChargeRules(
  truck: TruckChargeFields & { id: string },
): Promise<OrderChargeRules> {
  const country = await countrySettingsForTruck(truck)
  // The plan's fee is read only while the country's platform fee is switched on (OFF everywhere this phase).
  const platformFeeBps = country.platformFeeEnabled ? await truckPlanFeeBps(truck.id, country.countryCode) : null
  return resolveChargeRules(country, truck, platformFeeBps)
}
