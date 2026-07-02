'use client'
// Phase-A VALIDATION HARNESS (dev only) — visit /dev/ticket-preview.
// See the combined ticket at 58mm/80mm, tweak the config + due time, inspect the ESC/POS bytes, and
// simulate the "print when due" watcher — all WITHOUT a printer, a native plugin, or the DB migration.
import { useMemo, useState } from 'react'
import { TicketPreview } from '@/components/printing/TicketPreview'
import { renderTicket, type TicketOrder, type TicketConfig, type PaperWidth } from '@/lib/printing/ticket'
import { selectDueToPrint } from '@/lib/printing/printWatcher'

const SAMPLE: TicketOrder = {
  id: '17',
  customer_name: 'Jamie',
  customer_phone: '07700 900123',
  collection_time: '18:45',
  minutesUntilDue: 8,
  items: [
    { name: 'Sesame Prawn Toast', quantity: 1, modifiers: [{ name: 'extra chilli' }] },
    { name: 'Chicken wings Thai style', quantity: 2, specialInstructions: 'no peanuts' },
    { name: 'Spring Rolls', quantity: 1 },
  ],
  total: 24.5,
  truck_name: 'Real Thai Food',
  printedLabel: '18:37',
}

export default function TicketPreviewHarness() {
  const [paper, setPaper] = useState<PaperWidth>(80)
  const [showPhone, setShowPhone] = useState(true)
  const [due, setDue] = useState('18:45')
  const [leadMins, setLeadMins] = useState(10)
  const [nowMins, setNowMins] = useState(18 * 60 + 40) // 18:40

  const config: TicketConfig = { paper_width: paper, show_phone: showPhone }
  const order: TicketOrder = { ...SAMPLE, collection_time: due, minutesUntilDue: minsUntil(due, nowMins) }

  const bytes = useMemo(() => renderTicket(order, config), [order, config])
  const hex = useMemo(() => Array.from(bytes.slice(0, 64)).map(b => b.toString(16).padStart(2, '0')).join(' '), [bytes])

  // Simulate the watcher against a few orders (ASAP + scheduled).
  const watch = useMemo(() => {
    const orders = [
      { order_key: 'k-asap', collection_time: null as string | null, status: 'confirmed', label: '#A (ASAP)' },
      { order_key: 'k-soon', collection_time: minsToStr(nowMins + leadMins - 2), status: 'confirmed', label: `#B due ${minsToStr(nowMins + leadMins - 2)}` },
      { order_key: 'k-later', collection_time: minsToStr(nowMins + leadMins + 30), status: 'confirmed', label: `#C due ${minsToStr(nowMins + leadMins + 30)}` },
      { order_key: 'k-done', collection_time: minsToStr(nowMins), status: 'collected', label: '#D collected (ineligible)' },
    ]
    const dueNow = selectDueToPrint(orders, { nowMins, leadMins, printed: new Set() })
    return { orders, dueKeys: new Set(dueNow.map(o => o.order_key)) }
  }, [nowMins, leadMins])

  return (
    <div className="min-h-screen bg-slate-100 p-6 flex flex-col gap-6">
      <h1 className="text-lg font-bold text-slate-900">Kitchen ticket — Phase A preview (no printer)</h1>

      <div className="flex flex-wrap gap-4 items-end bg-white p-4 rounded-xl border text-sm">
        <label className="flex flex-col gap-1">Paper
          <select value={paper} onChange={e => setPaper(Number(e.target.value) as PaperWidth)} className="border rounded px-2 py-1">
            <option value={80}>80mm (48 col)</option>
            <option value={58}>58mm (32 col)</option>
          </select>
        </label>
        <label className="flex items-center gap-2">Show phone
          <input type="checkbox" checked={showPhone} onChange={e => setShowPhone(e.target.checked)} />
        </label>
        <label className="flex flex-col gap-1">Due time
          <input value={due} onChange={e => setDue(e.target.value)} className="border rounded px-2 py-1 w-24" placeholder="HH:MM" />
        </label>
        <label className="flex flex-col gap-1">Lead mins (N)
          <input type="number" value={leadMins} onChange={e => setLeadMins(Number(e.target.value) || 0)} className="border rounded px-2 py-1 w-20" />
        </label>
        <label className="flex flex-col gap-1">Now ({minsToStr(nowMins)})
          <input type="range" min={0} max={1439} value={nowMins} onChange={e => setNowMins(Number(e.target.value))} className="w-48" />
        </label>
      </div>

      <div className="flex flex-wrap gap-8">
        <div>
          <h2 className="text-xs font-bold text-slate-500 uppercase mb-2">Preview</h2>
          <TicketPreview order={order} config={config} />
        </div>

        <div className="flex flex-col gap-4 max-w-md">
          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase mb-1">ESC/POS bytes ({bytes.length} total — first 64 hex)</h2>
            <pre className="bg-slate-900 text-green-300 text-[10px] p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{hex}</pre>
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase mb-1">Watcher (now = {minsToStr(nowMins)}, N = {leadMins}m)</h2>
            <ul className="text-sm bg-white border rounded-lg divide-y">
              {watch.orders.map(o => (
                <li key={o.order_key} className={`px-3 py-1.5 flex justify-between ${watch.dueKeys.has(o.order_key) ? 'text-green-700 font-bold' : 'text-slate-500'}`}>
                  <span>{o.label}</span>
                  <span>{watch.dueKeys.has(o.order_key) ? '→ would PRINT' : '— waiting/ineligible'}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function minsToStr(m: number): string {
  const mm = ((m % 1440) + 1440) % 1440
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
}
function minsUntil(hhmm: string, nowMins: number): number | null {
  const mt = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!mt) return null
  return (parseInt(mt[1], 10) * 60 + parseInt(mt[2], 10)) - nowMins
}
