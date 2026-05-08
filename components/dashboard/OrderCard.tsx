'use client'
// components/dashboard/OrderCard.tsx

import { useState, useMemo } from 'react'
import type { Order, TruckData, Slot } from './types'
import { STATUS } from './types'
import { getCategoryTime } from './helpers'

export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="relative shrink-0 focus:outline-none">
      <div className={`w-12 h-6 rounded-full transition-colors ${on ? 'bg-green-500' : 'bg-slate-300'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-7' : 'translate-x-1'}`} />
      </div>
    </button>
  )
}

export function Btn({ label, colour, loading, onClick }: {
  label: string; colour: string; loading: boolean; onClick: () => void
}) {
  const colours: Record<string, string> = {
    green:  'bg-green-600 hover:bg-green-700 text-white',
    red:    'bg-red-500 hover:bg-red-600 text-white',
    blue:   'bg-blue-600 hover:bg-blue-700 text-white',
    slate:  'bg-slate-600 hover:bg-slate-700 text-white',
    orange: 'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200',
  }
  return (
    <button onClick={onClick} disabled={loading}
      className={`${colours[colour] || colours.slate} font-bold text-sm px-4 py-2.5 rounded-xl transition-colors active:scale-95 disabled:opacity-50 flex-1 min-w-[72px]`}>
      {loading ? '...' : label}
    </button>
  )
}

export function InlinePriceEditor({ price, quantity, onChange }: {
  price: number; quantity: number; onChange: (p: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(price.toFixed(2))
  if (editing) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-slate-400 text-xs">£</span>
        <input type="number" value={val} step="0.50" min="0" autoFocus
          onChange={e => setVal(e.target.value)}
          onBlur={() => { onChange(parseFloat(val) || 0); setEditing(false) }}
          onKeyDown={e => { if (e.key === 'Enter') { onChange(parseFloat(val) || 0); setEditing(false) } }}
          className="w-16 border border-orange-400 rounded-lg px-1.5 py-1 text-sm font-bold text-slate-900 focus:outline-none text-center" />
      </div>
    )
  }
  return (
    <button onClick={() => { setVal(price.toFixed(2)); setEditing(true) }}
      className="flex items-center gap-1.5 shrink-0 text-right group" title="Tap to override price">
      <span className="text-slate-700 font-bold text-sm">£{(price * quantity).toFixed(2)}</span>
      <span className="text-slate-300 group-hover:text-orange-400 transition-colors text-xs" aria-hidden>✏</span>
    </button>
  )
}

export function OrderCard({ order, truck, slots, actionLoading, onAction, onEdit }: {
  order: Order
  truck: TruckData | null
  slots: Slot[]
  actionLoading: string | null
  onAction: (action: string, orderId: string) => void
  onEdit: (order: Order) => void
}) {
  const [expanded, setExpanded] = useState(true)
  // Track struck units per item index (0 = none struck, n = n units struck)
  const [struckUnits, setStruckUnits] = useState<Record<number, number>>({})
  const s = STATUS[order.status] || STATUS.pending
  const isPub = truck?.mode === 'pub'

  const urgency = useMemo(() => {
    if (!order.slot || !['pending', 'confirmed'].includes(order.status)) return 'normal'
    const [h, m] = order.slot.split(':').map(Number)
    const diff = (h * 60 + m) - (new Date().getHours() * 60 + new Date().getMinutes())
    if (diff <= 0) return 'overdue'
    if (diff <= 10) return 'urgent'
    return 'normal'
  }, [order.slot, order.status])

  const borderClass = urgency === 'overdue' ? 'border-red-500'
    : urgency === 'urgent' ? 'border-yellow-400'
    : order.status === 'pending' ? 'border-orange-400'
    : 'border-slate-200'

  // Sort items: hot items first (by prep time desc)
  const sortedItems = [...order.items].sort((a, b) =>
    getCategoryTime(b.name) - getCategoryTime(a.name)
  )

  // All items fully struck = card ready to collect
  const allStruck = sortedItems.every((item, i) => (struckUnits[i] || 0) >= item.quantity)

  const tapUnit = (i: number, qty: number) => {
    setStruckUnits(prev => {
      const current = prev[i] || 0
      // Tap cycles: 0 → 1 → 2 → ... → qty → 0
      const next = current >= qty ? 0 : current + 1
      return { ...prev, [i]: next }
    })
  }

  return (
    <div className={`bg-white rounded-2xl overflow-hidden border shadow-sm transition-opacity ${borderClass} ${allStruck ? 'opacity-60' : ''}`}>
      {urgency === 'overdue' && <div className="bg-red-500 text-white text-[11px] font-black text-center py-1">⚠ OVERDUE</div>}
      {urgency === 'urgent' && <div className="bg-yellow-400 text-yellow-900 text-[11px] font-black text-center py-1">⏰ DUE SOON</div>}

      <button onClick={() => setExpanded(e => !e)} className="w-full text-left p-4 active:bg-slate-50 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-slate-900">#{order.id}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
              {order.slot && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  urgency === 'overdue' ? 'bg-red-100 text-red-700'
                  : urgency === 'urgent' ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-slate-100 text-slate-500'}`}>
                  🕐 {order.slot}
                </span>
              )}
              <span className="text-slate-600 font-bold text-sm truncate max-w-[140px]">{order.customer_name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {allStruck && <span className="text-green-600 text-xs font-black">Ready ✓</span>}
            <span className="font-black text-slate-900">£{Number(order.total).toFixed(2)}</span>
            <span className="text-slate-400 text-xs">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 bg-slate-50">

          {/* Items — each unit is a separate tappable row */}
          {/* Tap once per unit prepared. All units struck = item done. */}
          <div className="mb-3 space-y-0">
            {sortedItems.map((item, i) => {
              const struck = struckUnits[i] || 0
              const allItemDone = struck >= item.quantity

              // Each quantity unit gets its own row
              return Array.from({ length: item.quantity }).map((_, unitIdx) => {
                const unitStruck = unitIdx < struck
                return (
                  <button key={`${i}-${unitIdx}`}
                    onClick={() => tapUnit(i, item.quantity)}
                    className={`w-full flex justify-between items-center text-sm rounded-lg px-2 py-1.5 -mx-2 transition-all active:scale-[0.99] select-none ${
                      unitStruck ? 'opacity-40 bg-slate-100' : 'hover:bg-orange-50'
                    }`}>
                    <span className={`font-medium text-left transition-all ${unitStruck ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {item.name}
                    </span>
                    <span className={`text-xs ml-2 shrink-0 ${unitStruck ? 'text-green-500 font-bold' : 'text-slate-400'}`}>
                      {unitStruck ? '✓' : `£${item.unit_price.toFixed(2)}`}
                    </span>
                  </button>
                )
              })
            })}
            {order.deals?.map((d, i) => (
              <p key={i} className="text-xs text-orange-600 font-bold px-2 pt-1">
                🎁 {d.name}: {Object.values(d.slots).filter(Boolean).join(', ')}
              </p>
            ))}
          </div>

          {order.notes && (
            <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs text-orange-700 mb-3 font-medium">
              📝 {order.notes}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {order.status === 'pending' && (
              <>
                <Btn label="✓ Confirm" colour="green" loading={actionLoading === `confirm-${order.id}`} onClick={() => onAction('confirm', order.id)} />
                <Btn label="✗ Reject" colour="red" loading={actionLoading === `reject-${order.id}`} onClick={() => onAction('reject', order.id)} />
              </>
            )}
            {order.status === 'confirmed' && isPub && <Btn label="🍕 Ready" colour="blue" loading={actionLoading === `ready-${order.id}`} onClick={() => onAction('ready', order.id)} />}
            {order.status === 'confirmed' && !isPub && <Btn label="✓ Collected" colour="slate" loading={actionLoading === `collected-${order.id}`} onClick={() => onAction('collected', order.id)} />}
            {order.status === 'ready' && <Btn label="✓ Collected" colour="slate" loading={actionLoading === `collected-${order.id}`} onClick={() => onAction('collected', order.id)} />}
            {order.status === 'collected' && <Btn label="↩ Undo" colour="slate" loading={actionLoading === `undo_collected-${order.id}`} onClick={() => onAction('undo_collected', order.id)} />}
            {['pending', 'confirmed', 'modified'].includes(order.status) && <Btn label="✏ Edit" colour="orange" loading={false} onClick={() => onEdit(order)} />}
          </div>
        </div>
      )}
    </div>
  )
}