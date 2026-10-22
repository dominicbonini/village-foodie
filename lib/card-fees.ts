// lib/card-fees.ts — STRIPE'S card fees as quoted for one country (moved out of lib/plan-features.ts, 19 October 2026;
// docs/plans-data-model-report.md). Not a plan fact: the same for every plan. Read from country_settings' card_fee_*
// columns, which are NOT retired.
import { moneyFormatOf, type CountrySettings } from '@/lib/country-settings-types'
import { feeLabel, smallFeeLabel } from '@/lib/money-format'
import { translatorFor } from '@/lib/i18n/translator'
import { isEnglish } from '@/lib/i18n/locales'
import '@/lib/i18n/catalog/planFeatures'

// ── CARD PROCESSING FEES ────────────────────────────────────────────────────────────────────────────
// 🔴 THESE ARE STRIPE'S FEES, NOT OURS. HatchGrab does not set them, cannot guarantee them, and a truck's
// actual rate is confirmed by Stripe during their own onboarding. Never render these as fixed or as ours.
// PROVENANCE (GB): verified 6 August 2026 from multiple SECONDARY sources, NOT from stripe.com — which is
// why every rendered string carries a hedge ("currently" / "~"). The hedging is load-bearing.
// ⚠️ The in-person rate applies to a narrower set of cards than the domestic online rate, and cards
// issued elsewhere cost MORE — say so wherever it is rendered. The Tap to Pay charge is ADDITIONAL and
// must be stated separately, never folded into the headline in-person rate.
export function cardFees(s: CountrySettings): {
  online: { pct: number; fixedMinor: number }
  inPerson: { pct: number; fixedMinor: number }
  tapToPayFixedMinor: number
} {
  return {
    online: { pct: s.cardFeeOnlinePct, fixedMinor: s.cardFeeOnlineFixedMinor },
    inPerson: { pct: s.cardFeeInPersonPct, fixedMinor: s.cardFeeInPersonFixedMinor },
    tapToPayFixedMinor: s.tapToPayFixedMinor,
  }
}

/** "1.5% + 20p" */
export const cardFeeOnlineLabel = (s: CountrySettings): string => feeLabel(cardFees(s).online, moneyFormatOf(s))
/** "1.4% + 10p" */
export const cardFeeInPersonLabel = (s: CountrySettings): string => feeLabel(cardFees(s).inPerson, moneyFormatOf(s))
/** "10p" */
export const tapToPaySurchargeLabel = (s: CountrySettings): string => smallFeeLabel(cardFees(s).tapToPayFixedMinor, moneyFormatOf(s))

// ── 🔴 WHICH CARDS THE QUOTED RATES ARE FOR (decided 10 October 2026) ─────────────────────────────────
// ONLINE sentences say "standard " + the label, so the UK still reads "standard UK cards" exactly.
// IN-PERSON sentences say the label alone, so "UK and EEA cards" became "UK cards" — the ONE accepted
// visible change for UK trucks in the move to country_settings.
// ⚠️ Language Phase 1e: the planFeatures sentences say "standard {region}" whole; this fragment remains for the landing
// page's own sentences until they move (it is the message `planFeatures.cardRegionOnline`).
// france-1 (22 October 2026): the label stays ENGLISH in country_settings ("EEA cards", the rows' convention) and is shown in a
// language's own words by id — `planFeatures.cardRegion.<letters of the label>` ("EEA cards" → `EEAcards` → « cartes de l’EEE »);
// an unknown label as stored. ⛔ Every English locale shows exactly the stored label: nothing is looked up.
type Loose = { has(key: string): boolean; (key: string, v?: Record<string, string>): string }
export function cardRegionLabel(s: CountrySettings): string {
  if (isEnglish(s.locale)) return s.cardFeeRegionLabel
  const t = translatorFor(s.locale, 'planFeatures') as unknown as Loose
  const key = `cardRegion.${String(s.cardFeeRegionLabel ?? '').replace(/[^A-Za-z]/g, '')}`
  return t.has(key) ? t(key) : s.cardFeeRegionLabel
}
export const cardRegionOnline = (s: CountrySettings): string => translatorFor(s.locale, 'planFeatures')('cardRegionOnline', { region: cardRegionLabel(s) })
export const cardRegionInPerson = (s: CountrySettings): string => cardRegionLabel(s)
