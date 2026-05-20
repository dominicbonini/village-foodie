'use client'
// components/dashboard/OrderCard.tsx

import { useState, useEffect } from 'react'
import type { Order, TruckData, Slot } from './types'
import { STATUS } from './types'
import { getCategoryTime, getTicketAge, getSlotOffset, getAgeState, getHeaderStyle, hasDealItems } from './helpers'

export type ViewMode = 'solo' | 'window' | 'cook'

// ── Shared UI primitives ──────────────────────────────────────────────────────

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
    teal:   'bg-teal-600 hover:bg-teal-700 text-white',
    slate:  'bg-slate-500 hover:bg-slate-600 text-white',
    amber:  'bg-amber-500 hover:bg-amber-600 text-white',
    orange: 'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200',
  }
  return (
    <button onClick={onClick} disabled={loading}
      className={`${colours[colour] || colours.slate} font-bold text-sm px-4 py-3 rounded-xl transition-colors active:scale-95 disabled:opacity-50 flex-1 min-w-[72px]`}>
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

function addMinsToSlot(slot: string, mins: number): string {
  const [h, m] = slot.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// ── OrderCard ─────────────────────────────────────────────────────────────────

export function OrderCard({
  order,
  truck,
  slots,
  actionLoading,
  onAction,
  onEdit,
  categoryOrder,
  viewMode = 'solo',
  kdsMode = false,
}: {
  order: Order
  truck: TruckData | null
  slots: Slot[]
  actionLoading: string | null
  onAction: (action: string, orderId: string) => void
  onEdit: (order: Order) => void
  categoryOrder?: string[]
  viewMode?: ViewMode
  kdsMode?: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const [struckUnits, setStruckUnits] = useState<Record<number, number>>({})

  // Build slot datetime once — null for slotless (walk-up) orders
  const slotDt = order.slot && order.event_date
    ? new Date(`${order.event_date}T${order.slot}:00`)
    : null

  const computeOffset = () => slotDt ? getSlotOffset(slotDt) : -999

  const [slotOffset, setSlotOffset] = useState(computeOffset)

  // Tick every minute so the header and badge stay live
  useEffect(() => {
    const id = setInterval(() => setSlotOffset(computeOffset()), 60000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.slot, order.event_date])

  const ageState  = getAgeState(slotOffset)
  const headerCls = getHeaderStyle(ageState)
  const s         = STATUS[order.status] || STATUS.pending
  const isPub     = truck?.mode === 'pub'

  const sortedItems = [...order.items].sort((a, b) =>
    getCategoryTime(b.name) - getCategoryTime(a.name)
  )

  const totalUnits = sortedItems.reduce((sum, item) => sum + item.quantity, 0)
  const struckTotal = sortedItems.reduce((sum, item, i) => sum + Math.min(struckUnits[i] || 0, item.quantity), 0)
  const allStruck = struckTotal >= totalUnits && totalUnits > 0

  const tapItem = (i: number, qty: number) => {
    setStruckUnits(prev => {
      const current = prev[i] || 0
      return { ...prev, [i]: current >= qty ? 0 : current + 1 }
    })
  }

  const hasDeal = hasDealItems(order)
  const isLoading = (action: string) => actionLoading === `${action}-${order.id}`

  // ── Button sets per viewMode ────────────────────────────────────────────────

  const renderButtons = () => {
    if (order.status === 'pending') {
      return (
        <>
          <Btn label="✓ Confirm" colour="green" loading={isLoading('confirm')} onClick={() => onAction('confirm', order.id)} />
          <Btn label="✗ Reject"  colour="red"   loading={isLoading('reject')}  onClick={() => onAction('reject', order.id)} />
        </>
      )
    }

    if (viewMode === 'cook') {
      if (['confirmed', 'modified'].includes(order.status)) {
        return kdsMode ? (
          <>
            <Btn label="Start cooking" colour="amber" loading={isLoading('cooking')} onClick={() => onAction('cooking', order.id)} />
            <Btn label="Ready"         colour="green" loading={isLoading('ready')}   onClick={() => onAction('ready', order.id)} />
          </>
        ) : (
          <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.id)} />
        )
      }
      if (order.status === 'cooking') {
        return (
          <>
            <span className="flex-1 text-amber-700 font-bold text-sm flex items-center">🔥 Cooking…</span>
            <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.id)} />
          </>
        )
      }
      return null
    }

    if (viewMode === 'window') {
      if (!kdsMode) {
        // No cooking gate — immediate collect
        if (['confirmed', 'modified', 'ready'].includes(order.status)) {
          return <Btn label="Mark paid & done" colour="teal" loading={isLoading('collected')} onClick={() => onAction('collected', order.id)} />
        }
      } else {
        // Cooking gate active
        if (['confirmed', 'modified'].includes(order.status)) {
          return (
            <>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">⏳ Waiting</span>
              <button disabled className="flex-1 bg-teal-200 text-teal-400 font-bold py-3 rounded-xl text-sm cursor-not-allowed">Mark paid & done</button>
            </>
          )
        }
        if (order.status === 'cooking') {
          return (
            <>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">🔥 Cooking…</span>
              <button disabled className="flex-1 bg-teal-200 text-teal-400 font-bold py-3 rounded-xl text-sm cursor-not-allowed">Mark paid & done</button>
            </>
          )
        }
        if (order.status === 'ready') {
          return (
            <>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">✓ Ready</span>
              <Btn label="Mark paid & done" colour="teal" loading={isLoading('collected')} onClick={() => onAction('collected', order.id)} />
            </>
          )
        }
      }
    }

    // solo mode (default) — preserve isPub behaviour for backwards compat
    if (['confirmed', 'modified'].includes(order.status)) {
      return isPub
        ? <Btn label="🍕 Ready" colour="blue" loading={isLoading('ready')} onClick={() => onAction('ready', order.id)} />
        : <Btn label="Mark paid & done" colour="teal" loading={isLoading('collected')} onClick={() => onAction('collected', order.id)} />
    }
    if (order.status === 'ready') {
      return <Btn label="Mark paid & done" colour="teal" loading={isLoading('collected')} onClick={() => onAction('collected', order.id)} />
    }
    if (order.status === 'collected') {
      return <Btn label="↩ Undo" colour="slate" loading={isLoading('undo_collected')} onClick={() => onAction('undo_collected', order.id)} />
    }
    return null
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={`bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 transition-opacity ${allStruck ? 'opacity-50' : ''}`}>

      {/* Full-width coloured header — age-driven */}
      <button onClick={() => setExpanded(e => !e)} className={`w-full text-left px-4 py-3 ${headerCls} transition-colors active:opacity-80`}>
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold">#{order.id}</span>
          <div className="flex items-center gap-2 font-medium text-sm">
            {order.slot && <span>{order.slot}</span>}
            <span className="opacity-70">·{' '}
              {!slotDt
                ? `${getTicketAge(order.created_at)} min`
                : slotOffset < 0
                  ? `in ${Math.abs(slotOffset)} min`
                  : slotOffset === 0
                    ? 'due now'
                    : `${slotOffset} min late`}
            </span>
            {allStruck && <span className="text-green-700 font-black text-xs">✓</span>}
            <span className="text-xs opacity-50">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
          <span className="text-sm opacity-70 truncate max-w-[160px]">{order.customer_name}</span>
          {viewMode !== 'cook' && (
            <span className="ml-auto font-bold text-sm">£{Number(order.total).toFixed(2)}</span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-2 bg-slate-50">

          {/* Standalone items */}
          <div className="space-y-px mb-2">
            {sortedItems.map((item, i) => {
              const struck = Math.min(struckUnits[i] || 0, item.quantity)
              const allDone = struck >= item.quantity
              const partDone = struck > 0 && !allDone
              return (
                <div key={i}>
                  <button
                    onClick={() => tapItem(i, item.quantity)}
                    className={`w-full flex justify-between items-center text-sm rounded px-2 py-1 -mx-2 transition-all active:scale-[0.99] select-none text-left ${
                      allDone ? 'opacity-40' : partDone ? 'bg-orange-50' : 'hover:bg-orange-50'
                    }`}>
                    <span className={`font-medium transition-all ${allDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {item.quantity}× {item.name}
                      {partDone && <span className="text-orange-500 text-xs font-black ml-1.5">({struck}/{item.quantity})</span>}
                    </span>
                    <span className={`text-xs shrink-0 ml-2 ${allDone ? 'text-green-500 font-bold' : 'text-slate-400'}`}>
                      {allDone ? '✓' : `£${(item.unit_price * item.quantity).toFixed(2)}`}
                    </span>
                  </button>
                  {(item.modifiers?.length || item.specialInstructions) && (
                    <div className="pl-4 -mt-0.5 mb-0.5 flex flex-wrap gap-x-2">
                      {item.modifiers?.map(m => (
                        <span key={m.name} className="text-[10px] text-orange-500 font-medium">+ {m.name}</span>
                      ))}
                      {item.specialInstructions && (
                        <span className="text-[10px] text-slate-400 italic">📝 {item.specialInstructions}</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Deals — bracketed group with amber left-border */}
          {hasDeal && (
            <div className="border-l-2 border-amber-300 pl-3 ml-1 mb-2 space-y-2">
              {order.deals!.map((d, i) => {
                const sortedSlotEntries = Object.entries(d.slots).sort(([a], [b]) => {
                  if (!categoryOrder) return 0
                  const ai = categoryOrder.findIndex(c => c.toLowerCase() === a.toLowerCase())
                  const bi = categoryOrder.findIndex(c => c.toLowerCase() === b.toLowerCase())
                  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
                })
                return (
                  <div key={i}>
                    <p className="text-[10px] uppercase tracking-wide text-amber-700 font-bold mb-0.5">🎁 {d.name}</p>
                    <p className="text-xs text-slate-700 font-medium">
                      {sortedSlotEntries.filter(([, v]) => v).map(([, v]) => v).join(', ')}
                    </p>
                    {sortedSlotEntries.map(([cat, itemName]) => {
                      if (!itemName) return null
                      const mods = (d.slotModifiers || {})[cat] || []
                      const note = (d.slotNotes || {})[cat]
                      if (!mods.length && !note) return null
                      return (
                        <div key={cat} className="pl-2 mt-0.5">
                          {mods.map(m => <p key={m.name} className="text-[10px] text-orange-500 leading-tight">+ {m.name}{m.price > 0 ? ` +£${m.price.toFixed(2)}` : ''}</p>)}
                          {note && <p className="text-[10px] text-slate-400 italic leading-tight">📝 {note}</p>}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* Allergy / order notes — RED treatment */}
          {order.notes && (
            <div className="bg-red-50 border border-red-300 text-red-800 font-medium px-3 py-2 mb-2 rounded-md flex items-center gap-2">
              <span className="shrink-0">⚠</span>
              <span className="text-sm">{order.notes}</span>
            </div>
          )}

          {/* Quick time adjust — pending, non-cook only */}
          {order.status === 'pending' && order.slot && viewMode !== 'cook' && (
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs text-slate-400 font-medium shrink-0">Adjust time:</span>
              {[5, 10, 20].map(mins => (
                <button key={mins}
                  onClick={() => onAction(`adjust_slot_+${mins}`, order.id)}
                  className="text-xs bg-slate-100 hover:bg-orange-100 hover:text-orange-700 text-slate-600 font-bold px-2 py-1 rounded-lg transition-colors active:scale-95">
                  +{mins}m
                </button>
              ))}
              <span className="text-xs text-slate-300 ml-1">→ new time sent to customer</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {renderButtons()}
            {viewMode !== 'cook' && ['pending', 'confirmed', 'modified'].includes(order.status) && (
              <Btn label="✏ Edit" colour="orange" loading={false} onClick={() => onEdit(order)} />
            )}
            {viewMode !== 'cook' && ['confirmed', 'modified', 'ready'].includes(order.status) && (
              <Btn label="✕ Cancel" colour="red" loading={isLoading('cancel')} onClick={() => onAction('cancel', order.id)} />
            )}
          </div>

        </div>
      )}
    </div>
  )
}
