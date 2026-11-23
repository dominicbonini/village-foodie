// lib/item-rates.ts — france-vat-1 (24 November 2026, docs/france-vat-1-report.md): Manage › Payments › "Item rates".
//
// PURE AND CLIENT-SAFE. The quick-choice rates a country's dropdowns offer, and the truck's default rate as the card and the
// popup show it. The rates are thousandths of a percent, as everywhere (10 % = 10000).
import { includedTaxOf, regionSalesTax } from '@/lib/address-formats'

/** The country's common rates where we know them (Dominic, 24 November 2026). Every other country: "Default" and "Other…" only. */
export const QUICK_RATES: Readonly<Record<string, readonly number[]>> = {
  FR: [5500, 10000, 20000],
  GB: [0, 5000, 20000],
}
export const quickRatesFor = (countryCode: string | null | undefined): readonly number[] => QUICK_RATES[String(countryCode ?? '').toUpperCase()] ?? []

/**
 * The truck's DEFAULT rate — what a dish with no rate of its own is sold at — exactly as lib/order-charge-rules.ts resolves it:
 * the truck's own rate, else the address format's included default (France 10 %), else (tax added on top) its region's rate.
 * null = no rate ("No VAT" where prices include tax; nothing added where tax is added).
 */
export function defaultRateOf(
  c: { pricesIncludeTax: boolean; addressFormat?: string | null },
  truck: { tax_rate_milli?: number | null; base_region_code?: string | null },
): number | null {
  const own = typeof truck.tax_rate_milli === 'number' && Number.isSafeInteger(truck.tax_rate_milli) && truck.tax_rate_milli >= 0 ? truck.tax_rate_milli : null
  if (c.pricesIncludeTax) return own ?? includedTaxOf(c.addressFormat ?? null)?.milli ?? null
  return own ?? regionSalesTax(c.addressFormat ?? null, truck.base_region_code ?? null)?.milli ?? null
}

/** How many dishes use a rate other than the default — the card's hint. */
export const itemsOffDefault = (items: readonly { tax_rate_milli: number | null }[], defaultRate: number | null): number =>
  items.filter(i => i.tax_rate_milli !== null && i.tax_rate_milli !== defaultRate).length
