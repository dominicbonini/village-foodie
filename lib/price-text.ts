// lib/price-text.ts — a price word (or the pre-launch mask's stand-in) shown in a locale's words (moved out of
// lib/plan-features.ts, 19 October 2026; docs/plans-data-model-report.md). Not a plan fact.
import { PRICE_WORD, type PriceWordId } from '@/lib/price-words'
import { MASKED_PRICE } from '@/lib/pricing'
import { formatAmount, type MoneyFormat } from '@/lib/money-format'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/planFeatures'

// ── 🔴 THE PRICE WORDS, SHOWN. A cell or a price carries the PRICE_WORD's CODE (or lib/pricing.ts's MASKED_PRICE, the
// pre-launch mask's stand-in), never translated words, so the mask keeps recognising it by id. Only HERE, at display,
// does the code become the locale's word (`planFeatures.priceWord.<id>`). Anything else (an amount) passes through.
const PRICE_WORD_IDS = new Map<string, PriceWordId | 'masked'>([
  ...(Object.entries(PRICE_WORD) as [PriceWordId, string][]).map(([id, code]) => [code, id] as [string, PriceWordId]),
  [MASKED_PRICE, 'masked'],
])
/** A price cell or price as the locale shows it: a price word (or the mask's stand-in) in its words, an amount unchanged. */
export function priceText(val: string, locale: string | null | undefined): string {
  const id = PRICE_WORD_IDS.get(val)
  return id ? translatorFor(locale, 'planFeatures')(`priceWord.${id}`) : val
}

/** languages-1 (22 October 2026): "£29/mo" / "£29/month" in the locale's words (`planFeatures.perMonth`) — the display form of
 *  lib/money-format.ts perMonthLabel, whose "/mo" is English. Identical to it in every English locale. */
export function perMonthText(minor: number, f: MoneyFormat, unit: 'mo' | 'month' = 'mo'): string {
  return translatorFor(f.locale, 'planFeatures')(`perMonth.${unit}`, { amount: formatAmount(minor, f) })
}
