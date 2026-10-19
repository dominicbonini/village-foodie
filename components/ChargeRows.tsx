'use client'
// components/ChargeRows.tsx — the tax, service fee and tip rows on the customer's screens (Phase 3 screens,
// docs/phase-3-screens-report.md): the order page's totals, the in-page confirmation and the status page.
// The lines come from lib/order-charge-lines.ts, the ONE list every surface draws. 🔴 For a UK order the list
// is empty and this renders NOTHING — not even a wrapper — so those screens are byte-identical.
import { chargeLinesFor, chargeParts, type ChargeLineSource } from '@/lib/order-charge-lines'
import { useAppLocale } from '@/lib/i18n/use-t'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/charges'

export function ChargeRows({ charges, amount, textClass = 'text-xs' }: {
  charges: ChargeLineSource | null | undefined
  /** The screen's own money formatter, in major units. */
  amount: (major: number) => string
  /** The row size, so the rows sit in each screen's own type scale. */
  textClass?: string
}) {
  const lines = chargeLinesFor(charges, 'customer', useAppLocale())
  if (!lines.length) return null
  return (
    <>
      {lines.map(l => (
        <div key={l.key} className={`flex justify-between ${textClass} text-slate-600`} data-charge-line={l.key}>
          <span>
            {l.label}
            {/* The rate is small and grey — "Sales tax 8.25%", "Tip 15%". */}
            {l.rate && <span className="ml-1 text-[11px] text-slate-400">{l.rate}</span>}
          </span>
          <span className="tabular-nums">{amount(l.minor / 100)}</span>
        </div>
      ))}
    </>
  )
}

/**
 * ── US layout fix 10 (A-04): THE ORDER PAGE'S BASKET FOOTER FOLDS TAX, FEE AND TIP INTO ONE ROW ──
 * Subtotal, then ONE row — "Tax, fees & tip $x.xx" when there is a tip, "Tax & fees $x.xx" when not (Dominic, 18
 * October 2026; the dashboard card's summary line says the same) — which expands on tap to the lines it adds up,
 * indented under it. 🔴 FOLDED ONLY WHEN THERE ARE TWO OR MORE such lines — a single "Sales tax
 * 8.875%" says more than "Tax & fees" would, so it is drawn as ChargeRows draws it. A UK order has no lines and this
 * renders NOTHING, exactly like ChargeRows.
 */
export function FoldedChargeRows({ charges, amount, expanded, onToggle, textClass = 'text-xs' }: {
  charges: ChargeLineSource | null | undefined
  amount: (major: number) => string
  /** Whether the folded lines are open; the screen owns the state. */
  expanded: boolean
  onToggle: () => void
  textClass?: string
}) {
  // The words: `charges.foldedCharges`, read the way chargeLinesFor reads its labels (translatorFor, the screen's locale).
  const locale = useAppLocale()
  const t = translatorFor(locale, 'charges')
  const lines = chargeLinesFor(charges, 'customer', locale)
  if (lines.length < 3) return <ChargeRows charges={charges} amount={amount} textClass={textClass} />
  const [subtotal, ...added] = lines
  const addedMinor = added.reduce((s, l) => s + l.minor, 0)
  return (
    <>
      <div className={`flex justify-between ${textClass} text-slate-600`} data-charge-line={subtotal.key}>
        <span>{subtotal.label}</span>
        <span className="tabular-nums">{amount(subtotal.minor / 100)}</span>
      </div>
      <button type="button" onClick={onToggle} aria-expanded={expanded}
        className={`w-full flex justify-between ${textClass} text-slate-600`} data-charge-fold>
        <span className="flex items-center gap-1">
          {t('foldedCharges', { parts: chargeParts(added) })}
          <svg aria-hidden="true" className={`w-3 h-3 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
        <span className="tabular-nums">{amount(addedMinor / 100)}</span>
      </button>
      {expanded && added.map(l => (
        <div key={l.key} className={`flex justify-between ${textClass} text-slate-500 pl-3`} data-charge-line={l.key}>
          <span>
            {l.label}
            {l.rate && <span className="ml-1 text-[11px] text-slate-400">{l.rate}</span>}
          </span>
          <span className="tabular-nums">{amount(l.minor / 100)}</span>
        </div>
      ))}
    </>
  )
}
