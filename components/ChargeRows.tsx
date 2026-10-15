'use client'
// components/ChargeRows.tsx — the tax, service fee and tip rows on the customer's screens (Phase 3 screens,
// docs/phase-3-screens-report.md): the order page's totals, the in-page confirmation and the status page.
// The lines come from lib/order-charge-lines.ts, the ONE list every surface draws. 🔴 For a UK order the list
// is empty and this renders NOTHING — not even a wrapper — so those screens are byte-identical.
import { chargeLinesFor, type ChargeLineSource } from '@/lib/order-charge-lines'
import { useAppLocale } from '@/lib/i18n/use-t'

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
