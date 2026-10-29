'use client'
// components/comparison/CostBlock.tsx — THE COST BLOCK (comparison-features-1, 29 October 2026). One component, built for
// later public use; today ONLY Admin › Pricing check › Customer preview renders it (no public page does). The numbers and
// every sentence come from lib/cost-block.ts (data + messages comparison.costBlock.*): this file only lays them out.
// Each bar is the tool's total monthly cost in two parts — Software fee and Card fees — with a legend, both amounts under
// the bar, the total "per month including card fees" and its share of sales. Customer-paid fees are a note, never a bar.
import type { CostBlockData, costBlockWords } from '@/lib/cost-block'
import type { VolumeKey } from '@/lib/pricing-check'

type Words = ReturnType<typeof costBlockWords>

export default function CostBlock({ data, words, onSize, calculatorHref }: { data: CostBlockData; words: Words; onSize: (k: VolumeKey) => void; calculatorHref: string | null }) {
  const max = Math.max(1, ...data.bars.map(b => b.totalMinor))
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" data-cost-block aria-labelledby="cost-block-title">
      <h3 id="cost-block-title" className="text-lg font-black text-slate-900">{words.title}</h3>
      <div className="mt-3" role="group" aria-label={words.sizesLabel}>
        <p className="text-xs font-semibold text-slate-500">{words.sizesLabel}</p>
        <div className="mt-1 grid grid-cols-3 gap-2" data-cost-sizes>
          {words.sizes.map(z => (
            <button key={z.key} type="button" aria-pressed={data.selected === z.key} onClick={() => onSize(z.key)} data-size={z.key}
              className={`rounded-xl border px-2 py-2 text-left ${data.selected === z.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}>
              <span className="block text-sm font-bold">{z.sales}</span>
              <span className={`block text-xs ${data.selected === z.key ? 'text-slate-300' : 'text-slate-500'}`}>{z.orders}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-700" data-cost-lead>{words.lead}</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600" data-cost-legend>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-orange-500" aria-hidden />{words.legend.software}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" aria-hidden />{words.legend.card}</span>
      </p>
      <ul className="mt-3 space-y-4" data-cost-bars>
        {words.bars.map(b => (
          <li key={b.key} data-cost-bar={b.us ? 'us' : 'rival'} data-software={Math.round(b.softwareMinor)} data-card={Math.round(b.cardMinor)} data-total={Math.round(b.totalMinor)}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className={`text-sm font-bold ${b.us ? 'text-orange-700' : 'text-slate-900'}`}>{b.tool}</span>
              <span className="text-sm font-black text-slate-900">{b.total} <span className="text-xs font-semibold text-slate-500">· {b.share}</span></span>
            </div>
            <div className="mt-1 flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${b.software}; ${b.card}`}>
              <span className={b.us ? 'bg-orange-500' : 'bg-orange-400'} style={{ width: `${(b.softwareMinor / max) * 100}%` }} />
              <span className="bg-slate-300" style={{ width: `${(b.cardMinor / max) * 100}%` }} />
            </div>
            <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-600"><span>{b.software}</span><span>{b.card}</span></p>
            {b.customer && <p className="mt-0.5 text-xs text-slate-500" data-customer-fee>{b.customer}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800" data-cost-summary>{words.summary}</p>
      <div className="mt-3 space-y-0.5 text-xs text-slate-500" data-cost-footnote>
        {words.footnote.map(l => <p key={l}>{l}</p>)}
        {calculatorHref && <p><a className="font-semibold text-orange-700 underline" href={calculatorHref}>{words.calculator}</a></p>}
      </div>
    </section>
  )
}
