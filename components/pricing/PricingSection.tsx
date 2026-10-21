// components/pricing/PricingSection.tsx — 🔴 THE LANDING PAGE'S PRICING SECTION, BUILT FROM THE PLAN DATA (Stage B of the
// new pricing, docs/pricing-pages-report.md; the approved mockup "pricing section").
//
// The trial banner, one card per PUBLIC ACTIVE plan in sort_order, the "Which plan is cheapest for me?" bar and the
// card-fee footnote. Every amount, name, subtitle, switch and the highlighted plan come from public.plans / plan_prices /
// plan_features (lib/plans.ts, read here through lib/plan-offer.ts); every word from the `pricing` messages.
// ⛔ NO PLAN KEY, NAME OR NUMBER IS WRITTEN HERE. A card's fee sentence is chosen by its price row's SHAPE, its extra
// bullets by what its plan switches on over the plan before it, and the bar's thresholds are solved from the prices.
// Server-rendered (no hooks): the landing page passes the translators. `cta` is the page's own "Try free" control.
import { Fragment, type ReactNode } from 'react'
import type { CountrySettings } from '@/lib/country-settings-types'
import { planMoneyFormatOf } from '@/lib/country-settings-types'
import { formatAmount, formatWholeAmount, pctLabel } from '@/lib/money-format'
import { cardFeeOnlineLabel } from '@/lib/card-fees'
import type { PlanCatalog } from '@/lib/plans'
import {
  offerPlans, offerTrialMonths, offerFallback, baseBullets, addedFeatureBullets, moneyBullets, cheapestBands,
  type OfferPlan,
} from '@/lib/plan-offer'

import { translatorFor } from '@/lib/i18n/translator'

type PricingT = ReturnType<typeof translatorFor<'pricing'>>
type PromptT = ReturnType<typeof translatorFor<'planPrompt'>>

export function feeLabel(bps: number, locale: string): string {
  return pctLabel(bps / 100, { locale })
}

export function PricingSection({ catalog, settings, t, tPrompt, brand, featuresHref, cta }: {
  catalog: PlanCatalog
  settings: CountrySettings
  /** `pricing` messages, in the page's locale. */
  t: PricingT
  /** `planPrompt` messages — a feature's generic name when a plan adds one the cards have no bullet wording for. */
  tPrompt: PromptT
  /** The "Pay at Hatch" brand word, in the page's locale. */
  brand: string
  featuresHref: string
  /** The page's "Try free" control (the demo/signup entry point), given the button's class. */
  cta: (className: string, label: string) => ReactNode
}) {
  const money = planMoneyFormatOf(settings)   // anz-1: our prices name their dollar (A$, NZ$)
  const plans = offerPlans(catalog, settings.countryCode)
  const months = offerTrialMonths(catalog)
  const fallback = offerFallback(catalog, settings.countryCode)
  const bands = cheapestBands(plans, settings.currency)
  const b = (c: ReactNode) => <b>{c}</b>
  const fee = (p: OfferPlan) => feeLabel(p.feeBps, settings.locale)
  const whole = (minor: number) => formatWholeAmount(minor, money)
  const soonChip = <span className="soon-inline">{t('comingSoon')}</span>

  const feeSentence = (p: OfferPlan) => {
    if (p.shape === 'feeOnly') return t.rich('fee.feeOnly', { fee: fee(p), b })
    if (p.shape === 'included') return t.rich('fee.included', { included: whole(p.includedMinor as number), fee: fee(p), b })
    return t.rich('fee.noFee', { b })
  }
  // A feature's card wording (`pricing.added.<key>`), else its generic name — so a newly switched feature still shows.
  const featureWords = (f: string) => (t.has(`added.${f}` as never) ? t(`added.${f}` as never) : tPrompt(`features.${f}.name` as never))

  return (
    <>
      {months !== null && (
        <div className="trial-banner">
          <strong>{t('banner.title', { months })}</strong>
          <span>{t.rich('banner.body', { brand, fallback: fallback.plan.name, fallbackFree: fallback.free ? 'yes' : 'no', plan: (c: ReactNode) => <u>{c}</u> })}</span>
        </div>
      )}

      <div className="plans">
        {plans.map((p, i) => {
          const prev = i > 0 ? plans[i - 1] : null
          return (
            <div key={p.plan.key} className={`plan${p.highlighted ? ' hero-plan' : ''}`}>
              {p.highlighted && <span className="plan-tag">{t('card.mostTrucks')}</span>}
              <div className="plan-name">{p.plan.name}</div>
              {/* landing-mobile-tidy (Dominic, 21 October 2026): the subtitle wraps only at a SPACE — each word is held whole, so
                  "pre-orders" never breaks after its hyphen when the price sits beside it on a phone. */}
              {p.plan.subtitle && <div className="plan-who">{p.plan.subtitle.split(' ').map((w, j) => (
                <Fragment key={j}>{j > 0 && ' '}<span className="plan-word">{w}</span></Fragment>
              ))}</div>}
              {/* landing-mobile-tidy (21 October 2026): everything from the price down is ONE cell, so on a laptop the cards
                  can share their name and subtitle rows (landing.css, subgrid) and every price starts on the same line —
                  the reserved two-line subtitle height that did that job (and left the gap above the price) is gone. */}
              <div className="plan-body">
                <div className="plan-price"><span className="plan-amount">{formatAmount(p.monthlyMinor, money)}</span><span className="plan-per">{t('card.perTruckMonth')}</span></div>
                <div className="plan-fee">{feeSentence(p)}</div>
                <ul>
                  {prev === null ? (
                    <>
                      <li className="lead">{t('card.everything')}</li>
                      {baseBullets(catalog, p).map(k => <li key={k}>{t(`base.${k}` as never)}</li>)}
                    </>
                  ) : (
                    <>
                      <li className="lead">{t('card.everythingIn', { plan: prev.plan.name })}</li>
                      {addedFeatureBullets(catalog, p, prev).map(f => (
                        <li key={f.feature}>
                          {featureWords(f.feature)}{f.comingSoon && soonChip}
                          {f.sub.map(sub => (
                            <span key={sub.feature} className="li-sub">{featureWords(sub.feature)}{sub.comingSoon && soonChip}</span>
                          ))}
                        </li>
                      ))}
                      {moneyBullets(p).map(m => <li key={m}>{t(`money.${m}`)}</li>)}
                    </>
                  )}
                </ul>
                {prev === null && <p className="plan-more"><a href={featuresHref}>{t('card.seeEvery')}</a></p>}
                {cta(p.highlighted ? 'btn btn-primary' : 'btn btn-ghost', t('card.tryFree'))}
              </div>
            </div>
          )
        })}
      </div>

      {bands.length > 0 && (
        <div className="cheap-bar">
          <span className="cheap-head">
            <span className="cheap-title">{t('bar.title')}</span>
            <span className="cheap-sub">{t('bar.subtitle')}</span>
          </span>
          <span className="cheap-bands">
            {bands.length === 1
              ? <span className="cheap-band">{t.rich('bar.only', { plan: bands[0].plan.plan.name, b })}</span>
              : bands.map((band, i) => (
                <span key={band.plan.plan.key} className="cheap-band">
                  {i === 0
                    ? t.rich('bar.first', { to: whole(band.toMinor as number), plan: band.plan.plan.name, b })
                    : band.toMinor === null
                      ? t.rich('bar.last', { from: whole(band.fromMinor as number), plan: band.plan.plan.name, b })
                      : t.rich('bar.middle', { from: whole(band.fromMinor as number), to: whole(band.toMinor), plan: band.plan.plan.name, b })}
                </span>
              ))}
          </span>
        </div>
      )}

      <p className="price-note">{t('footnote', { cardFee: cardFeeOnlineLabel(settings), country: settings.shortName ?? settings.name })}</p>
    </>
  )
}
