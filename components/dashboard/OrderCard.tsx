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
    green:    'bg-green-600 hover:bg-green-700 text-white',
    red:      'bg-red-500 hover:bg-red-600 text-white',
    blue:     'bg-blue-600 hover:bg-blue-700 text-white',
    slate:    'bg-slate-600 hover:bg-slate-700 text-white',
    teal:     'bg-teal-600 hover:bg-teal-700 text-white',
    orange:   'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200',
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

  const sortedItems = [...order.items].sort((a, b) =>
    getCategoryTime(b.name) - getCategoryTime(a.name)
  )

  const totalUnits = sortedItems.reduce((s, item) => s + item.quantity, 0)
  const struckTotal = sortedItems.reduce((s, item, i) => s + Math.min(struckUnits[i] || 0, item.quantity), 0)
  const allStruck = struckTotal >= totalUnits && totalUnits > 0

  const tapItem = (i: number, qty: number) => {
    setStruckUnits(prev => {
      const current = prev[i] || 0
      return { ...prev, [i]: current >= qty ? 0 : current + 1 }
    })
  }

  const itemsSubtotal = order.items.reduce((s, i) => s + i.unit_price * i.quantity, 0)
  const dealDiscount = itemsSubtotal - Number(order.total)
  const hasDeal = order.deals && order.deals.length > 0 && dealDiscount > 0.005

  return (
    <div className={`bg-white rounded-2xl overflow-hidden border shadow-sm transition-opacity ${borderClass} ${allStruck ? 'opacity-50' : ''}`}>
      {urgency === 'overdue' && <div className="bg-red-500 text-white text-[11px] font-black text-center py-1">⚠ OVERDUE</div>}
      {urgency === 'urgent' && <div className="bg-yellow-400 text-yellow-900 text-[11px] font-black text-center py-1">⏰ DUE SOON</div>}

      <button onClick={() => setExpanded(e => !e)} className="w-full text-left px-4 py-3 active:bg-slate-50 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
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
            <span className="text-slate-600 font-bold text-sm truncate max-w-[130px]">{order.customer_name}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {allStruck && <span className="text-green-600 text-xs font-black">Ready ✓</span>}
            <span className="font-black text-slate-900">£{Number(order.total).toFixed(2)}</span>
            <span className="text-slate-400 text-xs">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t border-slate-100 pt-2 bg-slate-50">

          <div className="space-y-px mb-2">
            {sortedItems.map((item, i) => {
              const struck = Math.min(struckUnits[i] || 0, item.quantity)
              const allDone = struck >= item.quantity
              const partDone = struck > 0 && !allDone
              return (
                <button key={i}
                  onClick={() => tapItem(i, item.quantity)}
                  className={`w-full flex justify-between items-center text-sm rounded px-2 py-1 -mx-2 transition-all active:scale-[0.99] select-none text-left ${
                    allDone ? 'opacity-40' : partDone ? 'bg-orange-50' : 'hover:bg-orange-50'
                  }`}>
                  <span className={`font-medium transition-all ${allDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                    {item.quantity}× {item.name}
                    {partDone && (
                      <span className="text-orange-500 text-xs font-black ml-1.5 not-italic">({struck}/{item.quantity})</span>
                    )}
                  </span>
                  <span className={`text-xs shrink-0 ml-2 ${allDone ? 'text-green-500 font-bold' : 'text-slate-400'}`}>
                    {allDone ? '✓' : `£${(item.unit_price * item.quantity).toFixed(2)}`}
                  </span>
                </button>
              )
            })}
          </div>

          {hasDeal && (
            <div className="border-t border-slate-200 pt-1 mb-1 space-y-0.5">
              {order.deals!.map((d, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-green-600 font-bold">🎁 {d.name} <span className="font-normal text-green-500">({Object.values(d.slots).filter(Boolean).join(', ')})</span></span>
                  <span className="text-green-600 font-bold shrink-0 ml-2">-£{dealDiscount.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Total</span>
                <span>£{Number(order.total).toFixed(2)}</span>
              </div>
            </div>
          )}

          {order.notes && (
            <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-1.5 text-xs text-orange-700 mb-2 font-medium">
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
            {order.status === 'confirmed' && !isPub && <Btn label="✓ Collected" colour="teal" loading={actionLoading === `collected-${order.id}`} onClick={() => onAction('collected', order.id)} />}
            {order.status === 'ready' && <Btn label="✓ Collected" colour="teal" loading={actionLoading === `collected-${order.id}`} onClick={() => onAction('collected', order.id)} />}
            {order.status === 'collected' && <Btn label="↩ Undo" colour="slate" loading={actionLoading === `undo_collected-${order.id}`} onClick={() => onAction('undo_collected', order.id)} />}
            {['pending', 'confirmed', 'modified'].includes(order.status) && <Btn label="✏ Edit" colour="orange" loading={false} onClick={() => onEdit(order)} />}
          </div>
        </div>
      )}
    </div>
  )
}