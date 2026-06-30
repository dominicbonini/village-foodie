'use client'
// components/dashboard/OrderCard.tsx

import { useState, useEffect } from 'react'
import type { Order, TruckData, Slot, TruckEvent } from './types'
import { STATUS } from './types'
import { getCategoryTime, getTicketAge, getSlotOffset, getCombinedUrgency, getHeaderStyle, resolveCollectionTime, getOrderCookSecs, cookAmberLeadMins } from './helpers'
import type { CatConfig } from '@/lib/prep-utils'

export type ViewMode = 'solo' | 'window' | 'cook'

// Per-item tap-to-mark-done (the "8× Anchovies (2/8)" progress ticking on Window/Solo line items).
// DISABLED per product decision 2026-06 — operators read an order, make it, and tap "Mark paid & done";
// they don't tick individual items. Flip to `true` to restore the full behaviour (Window + Solo).
// The struckUnits/tapItem/allStruck code is RETAINED but unreachable when this is false, so re-enabling
// is just this one flag — nothing to re-implement.
const ITEM_TICK_ENABLED = false

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
    dark:   'bg-slate-800 hover:bg-slate-900 text-white',
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
          className="w-16 border border-orange-400 rounded-lg px-1.5 py-1 text-sm font-bold text-slate-900 focus:outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
      </div>
    )
  }
  return (
    <button onClick={() => { setVal(price.toFixed(2)); setEditing(true) }}
      className="flex items-center gap-1.5 shrink-0 text-right group" title="Tap to override price">
      <span className="text-slate-900 font-bold text-sm">£{(price * quantity).toFixed(2)}</span>
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
  event,
  slots,
  actionLoading,
  onAction,
  onEdit,
  categoryOrder,
  itemCategoryMap,
  catConfigs,
  viewMode = 'solo',
  kdsMode = false,
  showCookingStep = false,
  effectiveOrderReady = false,
  pendingSync = false,
}: {
  order: Order
  truck: TruckData | null
  event?: TruckEvent | null
  slots: Slot[]
  actionLoading: string | null
  onAction: (action: string, orderKey: string) => void
  onEdit: (order: Order) => void
  categoryOrder?: string[]
  itemCategoryMap?: Record<string, string>
  /** Per-category cook config (prep_secs/batch_size, keyed by lowercased category name)
   *  — drives the PREP-AWARE green→amber threshold. Absent ⇒ the card falls back to the
   *  old fixed 5-min amber lead (getCombinedUrgency's default). */
  catConfigs?: Record<string, CatConfig>
  viewMode?: ViewMode
  kdsMode?: boolean
  /** Van "show cooking step" preference — when false the cook view skips the intermediate
   *  "Start cooking" stage (confirmed → ready directly). Defaults off. */
  showCookingStep?: boolean
  /** Order-ready redesign (stage 3): resolved server-side (effectiveOrderReady = event override ?? van
   *  default ?? false). Gates the orders-screen (solo) Ready button — NOT the email (model A: the email
   *  always fires on ready). Defaults off. */
  effectiveOrderReady?: boolean
  pendingSync?: boolean
}) {
  // Cards always show their content — the collapse/triangle was removed (it only made the box look empty).
  const expanded = true
  const [struckUnits, setStruckUnits] = useState<Record<number, number>>({})
  const [showContact, setShowContact] = useState(false)

  // Resolve the effective collection time via the shared resolver (Manual s.6):
  // an explicit slot for timed orders, the event-date-aware ASAP base for
  // null-slot (ASAP/walk-up) orders. Local-time construction lives in the helper
  // (Manual s.7). slotDt is now non-null for ASAP orders whenever the event is
  // known, so urgency and the displayed time become date-aware instead of falling
  // back to ticket age.
  const slotDt = resolveCollectionTime(order, event ?? null)

  // HH:MM to show on the card — the resolved time, so an ASAP order reads "17:00"
  // instead of nothing/"658m".
  const timeLabel = slotDt
    ? `${String(slotDt.getHours()).padStart(2, '0')}:${String(slotDt.getMinutes()).padStart(2, '0')}`
    : ''

  const computeOffset = () => slotDt ? getSlotOffset(slotDt) : -999

  const [slotOffset, setSlotOffset] = useState(computeOffset)

  // Client-side clock tick (ALL view modes incl. the orders-screen 'solo'): bump the
  // resolved "now" every 15s so the relative countdown ("in Xm") AND the prep-aware
  // green→amber→red colour advance in real time as the wall clock passes — no interaction,
  // no data refetch, no network. This lives INSIDE the card on purpose: it re-renders ONLY
  // this card, so the parent list / sort (sortByTimeThenId) / keys never recompute on a
  // tick → cards never reorder, flicker, or reload; only the time text + colour class
  // change. The 60s data poll (fetchAll) is separate and untouched — poll = data freshness,
  // tick = clock advance. 15s is ample for minute-granular display (≤15s threshold lag)
  // without re-rendering wastefully. Cleared on unmount (no leak).
  useEffect(() => {
    const id = setInterval(() => setSlotOffset(computeOffset()), 15000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.slot, order.event_date, event?.event_date, event?.start_time])

  // Prep-aware amber lead: amber fires when the slot is within (this order's cook time +
  // buffer) — so a long-cook order goes amber early enough to start it, and a no-cook one
  // only ~2 min out. Falls back to the helper's fixed 5-min default when configs aren't
  // supplied (cookSecs null) so colour never regresses if catConfigs is missing.
  const cookSecs = catConfigs ? getOrderCookSecs(order.items, itemCategoryMap ?? {}, catConfigs) : null
  const amberLeadMins = cookSecs == null ? undefined : cookAmberLeadMins(cookSecs)
  const urgencyState = order.status === 'ready'
    ? 'ready'   as const
    : order.status === 'cooking'
    ? 'cooking' as const
    : getCombinedUrgency(slotDt, order.created_at, amberLeadMins)
  const headerCls = getHeaderStyle(urgencyState)
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

  const isLoading = (action: string) => actionLoading === `${action}-${order.order_key}`
  const showPrices = viewMode !== 'cook'

  type CookLine = { name: string; quantity: number; modifiers?: { name: string; price: number }[]; note?: string; dealName?: string; dealPrice?: number }
  const itemGroups: { cat: string; lines: CookLine[] }[] = (() => {
    const allLines: CookLine[] = [
      ...sortedItems.map(item => ({
        name: item.name, quantity: item.quantity,
        modifiers: item.modifiers, note: item.specialInstructions,
      })),
      ...(order.deals ?? []).flatMap(d =>
        Object.entries(d.slots)
          .filter(([, v]) => v)
          .map(([cat, itemName]) => ({
            name: itemName as string, quantity: 1,
            modifiers: (d.slotModifiers || {})[cat] || undefined,
            note: (d.slotNotes || {})[cat] || undefined,
            dealName: d.name,
            dealPrice: d.price,
          }))
      ),
    ]
    const buckets = new Map<string, CookLine[]>()
    ;(categoryOrder || []).forEach(cat => buckets.set(cat, []))
    buckets.set('__other__', [])
    allLines.forEach(line => {
      const cat = itemCategoryMap?.[line.name]
      const key = cat && buckets.has(cat) ? cat : '__other__'
      buckets.get(key)!.push(line)
    })
    buckets.forEach(lines => lines.sort((a, b) => a.name.localeCompare(b.name)))
    return [...buckets.entries()]
      .filter(([, lines]) => lines.length > 0)
      .map(([cat, lines]) => ({ cat, lines }))
  })()

  const standaloneGroups = (() => {
    const buckets = new Map<string, (typeof sortedItems)[number][]>()
    ;(categoryOrder || []).forEach(cat => buckets.set(cat, []))
    buckets.set('__other__', [])
    sortedItems.forEach(item => {
      const cat = itemCategoryMap?.[item.name]
      const key = cat && buckets.has(cat) ? cat : '__other__'
      buckets.get(key)!.push(item)
    })
    return [...buckets.entries()]
      .filter(([, lines]) => lines.length > 0)
      .map(([cat, lines]) => ({ cat, lines }))
  })()

  const offsetLabel = (() => {
    if (!slotDt) return `${getTicketAge(order.created_at)}m`
    if (slotOffset < -1440) return null
    if (slotOffset < -60) return `in ${Math.round(Math.abs(slotOffset) / 60)}h`
    if (slotOffset < 0) return `in ${Math.abs(slotOffset)}m`
    if (slotOffset === 0) return 'now'
    return `${slotOffset}m late`
  })()
  // Overdue (slot passed by ≥1 min) → the offset label renders as a RED PILL. Purely the lateness
  // indicator; the CARD background colour logic (§72) is unchanged (a ready card stays green).
  const isLate = !!slotDt && slotOffset >= 1

  // ── Button sets per viewMode ────────────────────────────────────────────────

  const renderButtons = () => {
    if (pendingSync) {
      return (
        <div className="flex items-center gap-2 py-3 text-slate-400 text-sm justify-center">
          <span>⏳</span>
          <span>Syncing…</span>
        </div>
      )
    }

    if (order.status === 'pending') {
      return (
        <>
          <Btn label="✓ Confirm" colour="green" loading={isLoading('confirm')} onClick={() => onAction('confirm', order.order_key)} />
          <Btn label="✗ Reject"  colour="red"   loading={isLoading('reject')}  onClick={() => onAction('reject', order.order_key)} />
        </>
      )
    }

    if (viewMode === 'cook') {
      if (['confirmed', 'modified'].includes(order.status)) {
        // Stage 1 (order-ready redesign): the cooking step is now ALWAYS on in cook mode — DE-COUPLED
        // from show_cooking_step (was `kdsMode && showCookingStep`). To re-add the "Show cooking step"
        // toggle later, restore `&& showCookingStep` here. Cook mode shows Start cooking → Ready.
        return kdsMode ? (
          <>
            <Btn label="Start cooking" colour="amber" loading={isLoading('cooking')} onClick={() => onAction('cooking', order.order_key)} />
            <Btn label="Ready"         colour="green" loading={isLoading('ready')}   onClick={() => onAction('ready', order.order_key)} />
          </>
        ) : (
          <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
        )
      }
      if (order.status === 'cooking') {
        return (
          <>
            <span className="flex-1 text-amber-700 font-bold text-sm flex items-center">🔥 Cooking…</span>
            <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
          </>
        )
      }
      return null
    }

    if (viewMode === 'window') {
      if (!kdsMode) {
        if (['confirmed', 'modified'].includes(order.status)) {
          return <Btn label="Mark paid & done" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
        }
        if (order.status === 'ready') {
          return <Btn label="Mark paid & done" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
        }
      } else {
        // Cooking gate active
        if (['confirmed', 'modified'].includes(order.status)) {
          return (
            <>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">⏳ Waiting</span>
              <button disabled className="flex-1 bg-slate-200 text-slate-400 font-bold py-3 rounded-xl text-sm cursor-not-allowed">Mark paid & done</button>
            </>
          )
        }
        if (order.status === 'cooking') {
          return (
            <>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">🔥 Cooking…</span>
              <button disabled className="flex-1 bg-slate-200 text-slate-400 font-bold py-3 rounded-xl text-sm cursor-not-allowed">Mark paid & done</button>
            </>
          )
        }
        if (order.status === 'ready') {
          return <Btn label="Mark paid & done" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
        }
      }
    }

    // solo mode (default — the operator ORDERS screen). The order-READY step shows when pub mode OR the
    // resolved order-ready setting is on (effectiveOrderReady = event override ?? van default, computed in
    // /api/dashboard — stage 3 re-point off show_cooking_step). When enabled: confirmed → Ready (fires the
    // customer ready-email — model A: email ALWAYS fires on ready, NOT gated) → "Mark paid & done". When
    // off, the current one-tap complete is unchanged.
    const readyStepEnabled = isPub || effectiveOrderReady
    if (['confirmed', 'modified'].includes(order.status)) {
      return readyStepEnabled
        ? <Btn label={`${truck?.truck_emoji || "🍕"} Ready`} colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
        : <Btn label="Mark paid & done" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
    }
    if (order.status === 'ready') {
      return <Btn label="Mark paid & done" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
    }
    if (order.status === 'collected') {
      return <Btn label="↩ Undo" colour="slate" loading={isLoading('undo_collected')} onClick={() => onAction('undo_collected', order.order_key)} />
    }
    return null
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={`w-full bg-white rounded-2xl overflow-hidden shadow-sm border transition-opacity flex flex-col ${allStruck ? 'opacity-50' : ''} ${pendingSync ? 'border-amber-300' : 'border-slate-200'}`}>

      {/* Full-width coloured header — age-driven */}
      {viewMode === 'cook' ? (
        /* Cook: non-interactive two-line header, no collapse */
        <div className={`w-full px-3 py-2 ${headerCls}`}>
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-lg font-bold text-slate-900 truncate">#{order.id}</span>
            <span className="text-xs text-slate-600 flex-shrink-0 inline-flex items-center gap-1">
              {timeLabel}
              {offsetLabel && (isLate
                ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-600 text-white">{offsetLabel}</span>
                : <>{` · ${offsetLabel}`}</>)}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-slate-600 truncate">{order.customer_name}</span>
            {(order.customer_email || order.customer_phone) && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowContact(v => !v) }}
                className="text-[11px] text-slate-400 hover:text-orange-500 border border-slate-200 rounded px-1.5 py-0.5 transition-colors">
                Contact
              </button>
            )}
            {allStruck && <span className="text-green-700 font-black text-xs ml-1">✓</span>}
          </div>
        </div>
      ) : (
        /* Window / solo: header (non-collapsing — content always shown). Window uses Cook's compact
           px-3 py-2 for KDS grid density; Solo keeps its roomier px-4 py-3 (gate is 'window'-only). */
        <div className={`w-full text-left ${viewMode === 'window' ? 'px-3 py-2' : 'px-4 py-3'} ${headerCls}`}>
          {viewMode === 'solo' ? (
            /* Solo (dashboard + mobile): two-row header. Row 1 is the identity+WHEN cluster — #order
               and the collection TIME together and prominent (the time is key info, so it sits beside
               the big order#, not demoted), then the status badge; offset/✓ go right. Row 2 gives the
               customer NAME the flex space (flex-1 min-w-0) so it shows in full and only ellipsis-
               truncates as a last resort — Contact + PRICE are flex-shrink-0 so they keep their size
               and never crowd the name out (the "Dom"→"D…" fix). Price is now the only number on the
               right of row 2, so time and price are no longer stacked in the same corner. */
            <>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold flex-shrink-0">#{order.id}</span>
                {timeLabel && <span className="text-lg font-bold flex-shrink-0">· {timeLabel}</span>}
                {/* The status badge moved DOWN to row 2 (between channel/name and price) so this top
                    row has room for the lateness readout without clipping. Late = a RED PILL; otherwise
                    the plain "in Xm"/age readout. */}
                {(offsetLabel !== null || allStruck) && (
                  <div className="flex items-center gap-1.5 font-medium text-sm ml-auto flex-shrink-0">
                    {offsetLabel !== null && (isLate
                      ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-600 text-white">{offsetLabel}</span>
                      : <span className="opacity-70">{offsetLabel}</span>)}
                    {allStruck && <span className="font-black text-xs opacity-70">✓</span>}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm opacity-70 truncate min-w-0 flex-1">{order.customer_name}</span>
                {(order.customer_email || order.customer_phone) && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setShowContact(v => !v) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setShowContact(v => !v) } }}
                    className="text-[11px] text-slate-400 hover:text-orange-500 border border-slate-200 rounded px-1.5 py-0.5 transition-colors cursor-pointer flex-shrink-0">
                    Contact
                  </span>
                )}
                {/* Status BADGE (moved here from row 1) — sits between channel/name and price. Same
                    condition as before: shown for modified/cooking/ready (incl. the blue "Ready"),
                    suppressed for the baseline confirmed/pending the section heading already says. This
                    is the status BADGE, NOT the Ready ACTION button (that stays in the bottom row). */}
                {!['confirmed', 'pending'].includes(order.status) && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>{s.label}</span>
                )}
                <span className="font-bold text-sm flex-shrink-0">£{Number(order.total).toFixed(2)}</span>
              </div>
            </>
          ) : (
            /* Window (KDS): TWO-ROW header (was a single cramped row that truncated name + clipped
               price at the dense 240px column). Row 1 = the glance numbers (#order / £total); Row 2 =
               metadata (name + Contact + time + lateness). */
            <>
              {/* Row 1 — order # (left) + total (right) */}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-3xl font-bold">#{order.id}</span>
                <div className="flex items-baseline gap-1.5 flex-shrink-0">
                  <span className="font-bold text-base">£{Number(order.total).toFixed(2)}</span>
                  {allStruck && <span className="font-black text-xs opacity-70">✓</span>}
                </div>
              </div>
              {/* Row 2 — customer name + Contact + time + lateness */}
              <div className="flex items-center gap-2 font-medium text-sm mt-0.5">
                <span className="opacity-80 truncate min-w-0">{order.customer_name}</span>
                {(order.customer_email || order.customer_phone) && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setShowContact(v => !v) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setShowContact(v => !v) } }}
                    className="text-[11px] text-slate-400 hover:text-orange-500 border border-slate-200 rounded px-1.5 py-0.5 transition-colors font-normal cursor-pointer flex-shrink-0">
                    Contact
                  </span>
                )}
                {timeLabel && <span className="opacity-70 flex-shrink-0 ml-auto">{timeLabel}</span>}
                {offsetLabel !== null && (isLate
                  ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-600 text-white flex-shrink-0">{offsetLabel}</span>
                  : <span className="opacity-50 flex-shrink-0">· {offsetLabel}</span>)}
              </div>
            </>
          )}
        </div>
      )}

      {showContact && (
        <div className="px-4 py-2 bg-white border-t border-slate-100 text-xs space-y-0.5">
          {order.customer_email && (
            <a href={`mailto:${order.customer_email}`} className="block text-orange-500 hover:text-orange-600">
              ✉ {order.customer_email}
            </a>
          )}
          {order.customer_phone && (
            <a href={`tel:${order.customer_phone}`} className="block text-orange-500 hover:text-orange-600">
              📱 {order.customer_phone}
            </a>
          )}
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-3 pt-2 bg-slate-50 flex flex-col flex-1">

          {/* ── Items: cook view vs window/solo view ── */}
          {viewMode === 'cook' ? (
            <div className="mb-2">
              {itemGroups.map(({ cat, lines }, gi) => (
                <div key={cat}>
                  <div className={`flex items-center gap-2 mb-1 ${gi > 0 ? 'mt-3' : ''}`}>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                      {cat === '__other__' ? 'Other' : cat}
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  {lines.map((line, j) => (
                    <div key={j} className="mb-0.5">
                      <p className="text-sm font-normal text-slate-900">{line.quantity}× {line.name}</p>
                      {(line.modifiers?.length || line.note) && (
                        <div className="pl-3">
                          {line.modifiers?.map(m => (
                            <p key={m.name} className="text-xs text-slate-500">+ {m.name}</p>
                          ))}
                          {line.note && <p className="text-xs text-slate-500 italic">📝 {line.note}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            /* Window / solo: DEALS FIRST (deal blocks + leading "Deals" divider) THEN the standalone
               items by category. Cook view is untouched — it DISSOLVES deals into category batches via
               itemGroups (Section 8); this deals-first reorder is operator-order-card only. */
            <div className="mb-2">
              {standaloneGroups.length > 0 && (order.deals ?? []).length > 0 && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Deals</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
              )}

              {(order.deals ?? []).map((deal, di) => (
                <div key={di} className="mb-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-normal text-slate-900 flex-1">🎁 {deal.name}</span>
                    <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900">
                      {deal.price != null ? `£${Number(deal.price).toFixed(2)}` : ''}
                    </span>
                  </div>
                  {Object.entries(deal.slots).filter(([, v]) => v).map(([slotCat, itemName]) => {
                    const mods = (deal.slotModifiers ?? {})[slotCat] ?? []
                    const note = (deal.slotNotes ?? {})[slotCat]
                    return (
                      <div key={slotCat} className="pl-4 mt-0.5">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="flex-1 font-normal text-slate-900">1× {itemName}</span>
                          <span className="w-16 flex-shrink-0" />
                        </div>
                        {(mods.length > 0 || note) && (
                          <div className="pl-3 flex flex-col gap-y-0.5">
                            {mods.map(m => (
                              <div key={m.name} className="flex items-baseline justify-between gap-2">
                                <span className="flex-1 text-xs text-slate-500">+ {m.name}</span>
                                {m.price > 0 && <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-700">+£{m.price.toFixed(2)}</span>}
                              </div>
                            ))}
                            {note && <span className="text-xs text-slate-500 italic">📝 {note}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}

              {standaloneGroups.map(({ cat, lines }, gi) => (
                <div key={cat}>
                  <div className={`flex items-center gap-2 mb-1 ${gi > 0 || (order.deals ?? []).length > 0 ? 'mt-3' : ''}`}>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                      {cat === '__other__' ? 'Other' : cat}
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  {lines.map((line, j) => {
                    const itemIndex = sortedItems.findIndex(it => it.name === line.name)
                    // All struck/done state is gated on ITEM_TICK_ENABLED — when off these stay 0/false,
                    // so the item renders plain (name + price, no highlight/count/strike/✓) and the
                    // <button> is non-interactive. struckUnits/tapItem remain referenced (just unreached).
                    const struck = ITEM_TICK_ENABLED && itemIndex >= 0 ? Math.min(struckUnits[itemIndex] || 0, line.quantity) : 0
                    const allDone = ITEM_TICK_ENABLED && struck >= line.quantity
                    const partDone = ITEM_TICK_ENABLED && struck > 0 && !allDone
                    return (
                      <div key={j}>
                        <button
                          onClick={ITEM_TICK_ENABLED ? () => itemIndex >= 0 && tapItem(itemIndex, line.quantity) : undefined}
                          className={`w-full flex justify-between items-baseline gap-2 ${viewMode === 'solo' || viewMode === 'window' ? 'text-sm' : 'text-base'} rounded py-1.5 text-left ${
                            ITEM_TICK_ENABLED
                              ? `transition-all active:scale-[0.99] select-none ${allDone ? 'opacity-40' : partDone ? 'bg-orange-50' : 'hover:bg-orange-50'}`
                              : 'cursor-default'
                          }`}>
                          <span className={`flex-1 font-normal transition-all ${allDone ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {line.quantity}× {line.name}
                            {partDone && <span className="text-orange-500 text-xs font-black ml-1.5">({struck}/{line.quantity})</span>}
                          </span>
                          {allDone
                            ? <span className="text-right tabular-nums w-16 flex-shrink-0 text-xs text-green-500 font-bold">✓</span>
                            : <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900">£{(line.unit_price * line.quantity).toFixed(2)}</span>
                          }
                        </button>
                        {(line.modifiers?.length || line.specialInstructions) && (
                          <div className="pl-4 -mt-0.5 mb-0.5 flex flex-col gap-y-0.5">
                            {line.modifiers?.map(m => (
                              <div key={m.name} className="flex items-baseline justify-between gap-2">
                                <span className="flex-1 text-xs text-slate-500">+ {m.name}</span>
                                {m.price > 0 && <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-700">+£{m.price.toFixed(2)}</span>}
                              </div>
                            ))}
                            {line.specialInstructions && (
                              <span className="text-xs text-slate-500 italic">📝 {line.specialInstructions}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Order notes */}
          {order.notes && (
            <div className="bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 mx-3 mb-2 rounded-md flex items-start gap-2 text-sm">
              <span className="flex-shrink-0 mt-0.5">📝</span>
              <span>{order.notes}</span>
            </div>
          )}

          {/* Quick time adjust — pending, non-cook only */}
          {order.status === 'pending' && order.slot && viewMode !== 'cook' && (
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs text-slate-400 font-medium shrink-0">Adjust time:</span>
              {[5, 10, 20].map(mins => (
                <button key={mins}
                  onClick={() => onAction(`adjust_slot_+${mins}`, order.order_key)}
                  className="text-xs bg-slate-100 hover:bg-orange-100 hover:text-orange-700 text-slate-600 font-bold px-2 py-1 rounded-lg transition-colors active:scale-95">
                  +{mins}m
                </button>
              ))}
              <span className="text-xs text-slate-300 ml-1">→ new time sent to customer</span>
            </div>
          )}

          {/* Action buttons — rarely-used Edit/Cancel sit ABOVE as de-emphasised GHOST buttons
              (transparent, light border, muted text — visually quiet but kept full-width + py-2.5
              so they stay iPad-tappable). The primary action (Mark paid & done / Ready / Confirm+
              Reject) is the prominent full-width button at the BOTTOM — the most-reachable target.
              Behaviour unchanged: same onEdit / onAction('cancel') / loading. */}
          <div className="flex flex-col gap-2 mt-auto">
            {viewMode === 'solo' && (['pending', 'confirmed', 'modified'].includes(order.status) || ['confirmed', 'modified', 'ready'].includes(order.status)) && (
              <div className="flex gap-2">
                {['pending', 'confirmed', 'modified'].includes(order.status) && (
                  <button onClick={() => onEdit(order)}
                    className="flex-1 font-semibold text-xs text-slate-500 bg-transparent border border-slate-200 hover:bg-slate-50 py-2.5 rounded-lg transition-colors active:scale-95">
                    ✏ Edit
                  </button>
                )}
                {['confirmed', 'modified', 'ready'].includes(order.status) && (
                  <button onClick={() => onAction('cancel', order.order_key)} disabled={isLoading('cancel')}
                    className="flex-1 font-semibold text-xs text-red-400 bg-transparent border border-red-100 hover:bg-red-50 py-2.5 rounded-lg transition-colors active:scale-95 disabled:opacity-50">
                    {isLoading('cancel') ? '...' : '✕ Cancel'}
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-2">
              {renderButtons()}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
