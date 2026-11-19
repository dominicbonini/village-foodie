// components/pricing/PlanTable.tsx — 🔴 THE ONE PLAN TABLE: /features, Manage › Billing (Stage B of the new pricing,
// docs/pricing-pages-report.md; the approved mockup "/features").
//
// Columns = the free trial (name + its length — trial-column-1), then the public active plans in sort_order (name + "{price} / month"),
// one highlighted column (lib/plan-offer.ts tableColumns). Then "WHAT YOU PAY"
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
import { planMoneyFormatOf, offersOnlineCardPayments, monthlyFeeBilling } from '@/lib/country-settings-types'
import { formatAmount, formatWholeAmount, pctLabel } from '@/lib/money-format'
import type { PlanCatalog } from '@/lib/plans'
import { tableColumns, tableGroups, tableCell, walkUpFree, type TableColumn } from '@/lib/plan-offer'
import { noteMarker } from '@/lib/feature-table'
export { planTableNotes } from '@/lib/feature-table'   // the rows' footnotes, for the surfaces under the table
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/planTable'
import '@/lib/i18n/catalog/planFeatures'
import './plan-table.css'
import { PlanTableHeadHeight } from './PlanTableHeadHeight'

/**
 * trial-column-1 (16 November 2026): LINE-BREAK CHANCES FOR A PHONE'S NARROW COLUMNS, as a zero-width space (U+200B) in the text.
 * Four plan columns leave ~63px each, and the last-resort break (plan-table.css `overflow-wrap: anywhere`) otherwise cut a word or
 * an amount wherever it ran out of room — "329 kr/må nad", "1 500 00 / 0 Ft", "HK$15,00 / 0". A browser breaks at a chance before
 * it breaks anywhere, so with these the line breaks after a slash, or between a number and its currency, never inside the digits.
 * Where the line fits, nothing shows. Only where needed: "£29 / month" (spaces already) and "£4,000" (a one-character symbol) get
 * none, so a GB or US page's text is exactly as before. A harness reads the text before with three replaces: "\u200b " → U+00A0,
 * "\u200b\u2009" → U+202F, then every other "\u200b" removed (scripts/_lp-trial-column-1.cjs).
 */
const ZWSP = '\u200b'
/** After a "/" that is not followed by a space: "329 kr/​månad", "31/​12/​2026". */
const slashBreaks = (s: string): string => s.replace(/\/(?=\S)/g, '/' + ZWSP)
/** Between a number and its currency: at the (no-break) space that separates them ("1 500 000​ Ft", "€​ 4.000"), or where a
 *  currency of two or more characters touches it ("HK$​15,000"). A digit run keeps its separators. A plain scan, no lookbehind
 *  (older iPad Safari cannot parse one). */
function amountBreaks(s: string): string {
  const num = (c: string) => /[\d.,'’]/.test(c)
  const gap = (c: string) => /[\u00a0\u202f ]/.test(c)
  const currencyRun = (from: number, step: 1 | -1) => { let n = 0; for (let j = from; j >= 0 && j < s.length && !num(s[j]) && !/\s/.test(s[j]); j += step) n++; return n }
  const boundary = (x: string, y: string) => num(x) !== num(y) && /\d/.test(x + y)
  let out = s[0] ?? ''
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1], c = s[i], n = s[i + 1] ?? ''
    // The gap itself: its no-break space becomes ZWSP + an ordinary space (a thin one for a narrow no-break space), which hangs at a
    // line's end — a no-break space left there took room and pushed "1 500 000" into the last-resort break again.
    if (gap(c) && n && !gap(a) && !gap(n) && boundary(a, n)) out += ZWSP + (c === '\u202f' ? '\u2009' : ' ')
    else out += (!gap(a) && !gap(c) && boundary(a, c) && (num(c) ? currencyRun(i - 1, -1) : currencyRun(i, 1)) >= 2 ? ZWSP : '') + c
  }
  return out
}

const Check = () => (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2 6.5 L4.6 9 L10 3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function PlanTable({ catalog, settings, highlight, px = v => v, stickyTop, variant = 'card', details, trialEnds }: {
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
  /** trial-column-1: the truck's trial end date, already written in the truck's date style — Manage › Billing passes it for a truck
   *  on its trial, and the trial column then reads "Ends {date}" instead of its length. Absent everywhere else. */
  trialEnds?: string | null
}) {
  const f = variant === 'features'
  const t = translatorFor(settings.locale, 'planTable')
  const tRow = translatorFor(settings.locale, 'planFeatures')
  const money = planMoneyFormatOf(settings)   // native-prices: our prices in the country's own form ("$49" in New Zealand)
  const plans = tableColumns(catalog, settings.countryCode)
  // A ZERO is never masked (it is no secret — the plan card above Billing's table already says "Free"); every other
  // amount goes through the caller's mask.
  const zeroOr = (minor: number, written: string) => (minor === 0 ? written : px(written))
  const fee = (p: TableColumn) => zeroOr(p.feeBps, pctLabel(p.feeBps / 100, settings))
  const whole = (minor: number) => px(formatWholeAmount(minor, money))
  const b = (c: ReactNode) => <b className="pt-b">{c}</b>
  const hl = (p: TableColumn) => (p.plan.key === highlight ? ' pt-hl' : '')
  const style = {
    // /features: the old table's fixed plan columns (`--cmp-col`, landing.css), so the row names keep their room.
    // Billing (features-followups, 20 October 2026): the name column has a FLOOR (6.5rem). With `minmax(0,1fr)` the grid grew
    // the plan columns to their 9.5rem maximum before the name column got any space, so on a phone the names had 0px and
    // broke one letter per line. The plan columns may now go down to 4rem (was 4.4rem), so floor + three columns fit a
    // 320px phone; plan-table.css sets the header a size smaller below 480px so the longest name fits. Wherever the plan
    // columns reach 9.5rem (every desktop and tablet width) the widths are exactly as before.
    // trial-column-1 (16 November 2026): FOUR COLUMNS (the trial + three plans) MUST FIT A 390px PHONE WITHOUT A SIDEWAYS SCROLL —
    // the table can never sit in an overflow-x box (its sticky header would stop pinning; app/(public)/(site)/landing/landing.css's
    // note). So the plan columns may now SHRINK when the row is short of room, and only then: their floor is lower (Billing 3.5rem,
    // was 4rem; /features 0, was the fixed --cmp-col) and the name column keeps a floor of its own (6.5rem — Billing's as before;
    // on /features it is what lets "management" fit whole). The grid grows every plan column to its maximum before the name column takes the rest, so wherever the
    // columns fitted before they are exactly the width they were; on a phone with four they share what is left equally.
    '--pt-cols': f ? `minmax(6.5rem,1fr) repeat(${plans.length}, minmax(0, var(--cmp-col)))` : `minmax(6.5rem,1fr) repeat(${plans.length}, minmax(3.5rem, 9.5rem))`,
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
          <div key={p.plan.key} className={`pt-col${hl(p)}${p.trial ? ' pt-trial' : ''}`} role="columnheader">
            <span className="pt-col-name">{p.plan.name}</span>
            {/* trial-column-1: the trial's line is its length ("3 months"), or on Billing for a truck on its trial "Ends {date}";
                a trial row with no length and no date has no line. A plan's line is its price, as before. */}
            {p.trial
              ? (trialEnds && p.plan.key === highlight
                ? <span className="pt-col-price">{slashBreaks(t('trial.ends', { date: trialEnds }))}</span>
                : p.trial.months ? <span className="pt-col-price">{t('trial.length', { months: p.trial.months })}</span> : null)
              : <span className="pt-col-price">{slashBreaks(t('perMonth', { price: zeroOr(p.monthlyMinor, formatAmount(p.monthlyMinor, money)) }))}</span>}
          </div>
        ))}
      </div>

      <div className="pt-rowgroup" role="rowgroup">
        <Group label={t('group.pay')} />
        <Row label={name(t('pay.included'))} cells={plans.map(p => (
          p.shape === 'feeOnly' ? none : p.includedMinor === null ? val(b(t('cell.unlimited'))) : val(<b className="pt-b pt-amt">{amountBreaks(whole(p.includedMinor))}</b>)
        ))} />
        {/* pricing-copy-4: the asterisk points at the card-fee footnote, which only a card country shows (offersOnlineCardPayments).
            plans-everywhere-1: where our fee is billed monthly (monthlyFeeBilling) and a column charges one, the row reads "HatchGrab fee
            on pre-orders, billed monthly", with the same asterisk rule. */}
        <Row label={name(monthlyFeeBilling(settings) && plans.some(p => p.shape !== 'noFee')
          ? t('pay.feeMonthly', { mark: offersOnlineCardPayments(settings) ? '*' : '' })
          : t(offersOnlineCardPayments(settings) ? 'pay.fee' : 'pay.feeNoMark'))} cells={plans.map(p => val(
          p.shape === 'noFee' ? b(pctLabel(0, settings))
            : p.shape === 'included' ? <span className="pt-sentence">{t.rich('cell.feeAbove', { fee: fee(p), included: amountBreaks(whole(p.includedMinor as number)), b })}</span>
              : b(fee(p))
        ))} />
        <Row label={name(t('pay.walkUp'))} cells={plans.map(p => (walkUpFree(catalog, p) ? val(b(t('cell.free'))) : none))} />
      </div>

      {/* plans-everywhere-1: no card-only row ("Online payments") where trucks can't take online card payments. */}
      {tableGroups({ cards: offersOnlineCardPayments(settings) }).map(g => (
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

