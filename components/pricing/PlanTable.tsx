// components/pricing/PlanTable.tsx — 🔴 THE ONE PLAN TABLE: /features, Manage › Billing (Stage B of the new pricing,
// docs/pricing-pages-report.md; the approved mockup "/features").
//
// Columns = the public active plans in sort_order (name + "{price} / month"), one highlighted column. Then "WHAT YOU PAY"
// from public.plan_prices, and every feature row (lib/feature-table.ts), grouped, ✓ / — / "Coming soon" by each plan's
// switches in public.plan_features. Every amount is data and every word a message.
// ⛔ NO PLAN KEY, NAME OR NUMBER IS WRITTEN HERE.
// Server- and client-renderable (no hooks). Its words are the `planTable` / `planFeatures` messages in THE COUNTRY'S locale
// (`settings.locale`) — the same rule the frozen table followed; Billing passes its price mask. Styled by plan-table.css (not Tailwind — see that file), so it looks the same in the landing chrome and Manage.
// features-page-restore (20 October 2026): `variant="features"` is /features' look — the pre-Stage-B comparison table
// (components/landing/FeatureComparison.tsx at c6c44c9e): no card, the text ✓, the italic "Coming soon", orange sticky
// group headings, and a description under each capability row (`details`, the page's `featuresPage.detail` messages).
// Same columns, cells and rows; its styles are app/landing/landing.css's (the landing tokens). The default variant —
// Manage › Billing — renders exactly as before.
import type { CSSProperties, ReactNode } from 'react'
import type { CountrySettings } from '@/lib/country-settings-types'
import { planMoneyFormatOf } from '@/lib/country-settings-types'
import { formatAmount, formatWholeAmount, pctLabel } from '@/lib/money-format'
import type { PlanCatalog } from '@/lib/plans'
import { offerPlans, tableGroups, tableCell, walkUpFree, type OfferPlan } from '@/lib/plan-offer'
import { noteMarker } from '@/lib/feature-table'
export { planTableNotes } from '@/lib/feature-table'   // the rows' footnotes, for the surfaces under the table
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/planTable'
import '@/lib/i18n/catalog/planFeatures'
import './plan-table.css'
import { PlanTableHeadHeight } from './PlanTableHeadHeight'

const Check = () => (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2 6.5 L4.6 9 L10 3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function PlanTable({ catalog, settings, highlight, px = v => v, stickyTop, variant = 'card', details }: {
  catalog: PlanCatalog
  settings: CountrySettings
  /** The plan key whose column is highlighted: /features the data's highlighted plan, Billing the truck's effective plan. */
  highlight: string | null
  /** A mask for amounts (Billing's price mask); identity on the public pages. */
  px?: (written: string) => string
  /** Where the sticky header pins (a CSS length); default the top of the scroll container. */
  stickyTop?: string
  /** 'card' (Manage › Billing: the bordered card) or 'features' (/features: the pre-Stage-B comparison look). */
  variant?: 'card' | 'features'
  /** 'features' only: a description per capability row, by row id (the page's `featuresPage.detail` messages). */
  details?: Record<string, string>
}) {
  const f = variant === 'features'
  const t = translatorFor(settings.locale, 'planTable')
  const tRow = translatorFor(settings.locale, 'planFeatures')
  const money = planMoneyFormatOf(settings)   // native-prices: our prices in the country's own form ("$49" in New Zealand)
  const plans = offerPlans(catalog, settings.countryCode)
  // A ZERO is never masked (it is no secret — the plan card above Billing's table already says "Free"); every other
  // amount goes through the caller's mask.
  const zeroOr = (minor: number, written: string) => (minor === 0 ? written : px(written))
  const fee = (p: OfferPlan) => zeroOr(p.feeBps, pctLabel(p.feeBps / 100, settings))
  const whole = (minor: number) => px(formatWholeAmount(minor, money))
  const b = (c: ReactNode) => <b className="pt-b">{c}</b>
  const hl = (p: OfferPlan) => (p.plan.key === highlight ? ' pt-hl' : '')
  const style = {
    // /features: the old table's fixed plan columns (`--cmp-col`, landing.css), so the row names keep their room.
    // Billing (features-followups, 20 October 2026): the name column has a FLOOR (6.5rem). With `minmax(0,1fr)` the grid grew
    // the plan columns to their 9.5rem maximum before the name column got any space, so on a phone the names had 0px and
    // broke one letter per line. The plan columns may now go down to 4rem (was 4.4rem), so floor + three columns fit a
    // 320px phone; plan-table.css sets the header a size smaller below 480px so the longest name fits. Wherever the plan
    // columns reach 9.5rem (every desktop and tablet width) the widths are exactly as before.
    '--pt-cols': f ? `minmax(0,1fr) repeat(${plans.length}, var(--cmp-col))` : `minmax(6.5rem,1fr) repeat(${plans.length}, minmax(4rem, 9.5rem))`,
    ...(stickyTop ? { '--pt-top': stickyTop } : {}),
  } as CSSProperties
  const soon = <span className="pt-soon">{t('cell.comingSoon')}</span>
  const none = <span className="pt-no" aria-label={t('cell.none')}>—</span>
  // /features prints the old table's text tick ("✓"), as the PDF does; Billing keeps the drawn one.
  const yes = <span className="pt-yes" aria-label={t('cell.yes')}>{f ? '✓' : <Check />}</span>
  // /features: a money cell reads in the old table's value style (`.pt-val`), one line of weight.
  const val = (c: ReactNode) => (f ? <span className="pt-val">{c}</span> : c)
  // /features: the row name in its own span (`.pt-name`) with the description under it (`.pt-desc`); the card variant
  // passes the label through untouched.
  const name = (label: ReactNode, detail?: string) => (f
    ? <><span className="pt-name">{label}</span>{detail && <span className="pt-desc">{detail}</span>}</>
    : label)

  const Row = ({ label, cells }: { label: ReactNode; cells: ReactNode[] }) => (
    <div className="pt-row" role="row">
      <div className="pt-label" role="rowheader">{label}</div>
      {cells.map((c, i) => <div key={plans[i].plan.key} className={`pt-cell${hl(plans[i])}`} role="cell">{c}</div>)}
    </div>
  )
  const Group = ({ label }: { label: string }) => (
    <div className="pt-row pt-group" role="row">
      <div className="pt-label" role="rowheader">{label}</div>
      {plans.map(p => <div key={p.plan.key} className={hl(p).trim()} role="cell" />)}
    </div>
  )

  return (
    <div className={f ? 'pt pt-features' : 'pt pt-card'} role="table" style={style}>
      {f && <PlanTableHeadHeight />}
      <div className="pt-row pt-head" role="row">
        <div className="pt-col-spacer" />
        {plans.map(p => (
          <div key={p.plan.key} className={`pt-col${hl(p)}`} role="columnheader">
            <span className="pt-col-name">{p.plan.name}</span>
            <span className="pt-col-price">{t('perMonth', { price: zeroOr(p.monthlyMinor, formatAmount(p.monthlyMinor, money)) })}</span>
          </div>
        ))}
      </div>

      <div className="pt-rowgroup" role="rowgroup">
        <Group label={t('group.pay')} />
        <Row label={name(t('pay.included'))} cells={plans.map(p => (
          p.shape === 'feeOnly' ? none : p.includedMinor === null ? val(b(t('cell.unlimited'))) : val(b(whole(p.includedMinor)))
        ))} />
        <Row label={name(t('pay.fee'))} cells={plans.map(p => val(
          p.shape === 'noFee' ? b(pctLabel(0, settings))
            : p.shape === 'included' ? <span>{t.rich('cell.feeAbove', { fee: fee(p), included: whole(p.includedMinor as number), b })}</span>
              : b(fee(p))
        ))} />
        <Row label={name(t('pay.walkUp'))} cells={plans.map(p => (walkUpFree(catalog, p) ? val(b(t('cell.free'))) : none))} />
      </div>

      {tableGroups().map(g => (
        <div key={g.group} className="pt-rowgroup" role="rowgroup">
          <Group label={t(`group.${g.group}` as never)} />
          {g.rows.map(r => (
            <Row key={r.id} label={name(r.note
              ? <span>{tRow(`row.${r.id}.name` as never)}<sup className="pt-sup">{noteMarker(r.note)}</sup></span>
              : tRow(`row.${r.id}.name` as never), details?.[r.id])} cells={plans.map(p => {
              const c = tableCell(catalog, r, p)
              return c === 'off' ? none : c === 'soon' ? soon : yes
            })} />
          ))}
        </div>
      ))}
    </div>
  )
}

