'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { OrderCard } from '@/components/dashboard/OrderCard'
import { getAllDayCounts } from '@/components/dashboard/helpers'
import { supabaseBrowser } from '@/lib/supabase-browser'
import type { Order, TruckData } from '@/components/dashboard/types'

// View mode driven by ?view= query param
// /kds           → window view (default, for the main iPad at the hatch)
// /kds?view=cook → cook view (for a second tablet facing into the kitchen)
type KdsView = 'window' | 'cook'

export default function KdsPage() {
  const { token } = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const kdsView: KdsView = searchParams.get('view') === 'cook' ? 'cook' : 'window'

  const [truck, setTruck] = useState<TruckData | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [pausedUntil, setPausedUntil] = useState<string | null>(null)
  const [extraWaitMins, setExtraWaitMins] = useState(0)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // PIN auth — same pattern as main dashboard
  // Operators can bake the PIN into the bookmark URL: /kds?pin=1234
  const [pin, setPin] = useState(() => searchParams.get('pin') ?? '')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [requiresPin, setRequiresPin] = useState(false)

  const fetchAllRef = useRef<() => void>(() => {})

  const fetchAll = useCallback(async (currentPin = pin) => {
    if (!token) return
    try {
      const params = new URLSearchParams({ token })
      if (currentPin) params.set('pin', currentPin)
      const res = await fetch(`/api/dashboard?${params}`)
      const data = await res.json()

      if (res.status === 401) {
        if (data.requiresPin) {
          setRequiresPin(true)
          setLoading(false)
          return
        }
        throw new Error(data.error ?? 'Unauthorized')
      }

      if (!res.ok) throw new Error('Failed to fetch')

      setTruck(data.truck)
      setOrders(data.orders ?? [])
      setPausedUntil(data.truck?.paused_until ?? null)
      setExtraWaitMins(data.truck?.extra_wait_mins ?? 0)
      setRequiresPin(false)
    } catch (e) {
      console.error('[kds] fetchAll error:', e)
      setError('Could not load orders')
    } finally {
      setLoading(false)
    }
  }, [token, pin])

  useEffect(() => {
    fetchAllRef.current = fetchAll
  }, [fetchAll])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (truck?.name) document.title = `${truck.name} Kitchen`
  }, [truck?.name])

  // Realtime subscription (same pattern as main dashboard)
  useEffect(() => {
    if (!truck?.id) return

    const ordersChannel = supabaseBrowser
      .channel(`kds-orders:${truck.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `truck_id=eq.${truck.id}`,
      }, () => fetchAllRef.current())
      .subscribe()

    const truckChannel = supabaseBrowser
      .channel(`kds-truck:${truck.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'trucks',
        filter: `id=eq.${truck.id}`,
      }, () => fetchAllRef.current())
      .subscribe()

    const fallback = setInterval(() => fetchAllRef.current(), 60000)

    return () => {
      supabaseBrowser.removeChannel(ordersChannel)
      supabaseBrowser.removeChannel(truckChannel)
      clearInterval(fallback)
    }
  }, [truck?.id])

  const handleAction = useCallback(async (action: string, orderId: string) => {
    setActionLoading(`${action}-${orderId}`)
    await fetch('/api/dashboard/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pin, action, orderId }),
    })
    setActionLoading(null)
    fetchAllRef.current()
  }, [token, pin])

  const togglePause = useCallback(async () => {
    const isPaused = pausedUntil && new Date(pausedUntil) > new Date()
    const paused_until = isPaused
      ? null
      : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    await fetch('/api/dashboard/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pin, action: 'set_paused', paused_until }),
    })
    fetchAllRef.current()
  }, [token, pin, pausedUntil])

  const submitPin = async () => {
    setPinError('')
    const params = new URLSearchParams({ token, pin: pinInput })
    const res = await fetch(`/api/dashboard?${params}`)
    const data = await res.json()
    if (!res.ok) {
      setPinError('Incorrect PIN')
      return
    }
    setPin(pinInput)
    setTruck(data.truck)
    setOrders(data.orders ?? [])
    setPausedUntil(data.truck?.paused_until ?? null)
    setExtraWaitMins(data.truck?.extra_wait_mins ?? 0)
    setRequiresPin(false)
  }

  const isPaused = pausedUntil ? new Date(pausedUntil) > new Date() : false

  // KDS always uses window or cook — never solo (solo is for the mobile dashboard only)
  const cardViewMode = kdsView === 'cook' ? 'cook' : 'window'

  const kdsMode = truck?.kds_mode ?? false

  // Active orders: exclude collected, cancelled, and rejected
  const activeOrders = orders.filter(o =>
    !['collected', 'cancelled', 'rejected'].includes(o.status)
  )

  // Cook view: hide orders that are ready (cook's job is done)
  const cookOrders = activeOrders.filter(o => o.status !== 'ready')

  const displayOrders = kdsView === 'cook' ? cookOrders : activeOrders

  // Done orders: last 5 collected (window view only)
  const doneOrders = orders
    .filter(o => o.status === 'collected')
    .slice(0, 5)

  const allDayCounts = getAllDayCounts(activeOrders)
  const allDayPills = Object.entries(allDayCounts)

  if (loading) return (
    <div className="flex items-center justify-center h-screen text-slate-400 text-sm">
      Loading kitchen...
    </div>
  )

  // PIN prompt
  if (requiresPin) return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50 gap-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-80 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-slate-900 text-center">Enter PIN</h2>
        <input
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="PIN"
          value={pinInput}
          onChange={e => setPinInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitPin()}
          className="border border-slate-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-slate-300"
          autoFocus
        />
        {pinError && <p className="text-red-500 text-sm text-center">{pinError}</p>}
        <button
          onClick={submitPin}
          className="bg-slate-900 text-white rounded-xl py-3 font-medium hover:bg-slate-700 transition-colors"
        >
          Unlock
        </button>
      </div>
    </div>
  )

  if (error || !truck) return (
    <div className="flex items-center justify-center h-screen text-red-500 text-sm">
      {error ?? 'Truck not found'}
    </div>
  )

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="font-medium text-slate-900">{truck.name}</span>
          {kdsView === 'cook' && (
            <span className="text-xs bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
              Cook screen
            </span>
          )}
        </div>

        {/* Wait time */}
        {extraWaitMins > 0 && (
          <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-full">
            +{extraWaitMins} min wait
          </span>
        )}

        {/* Pause — window view only */}
        {kdsView === 'window' && (
          <button
            onClick={togglePause}
            className={`text-xs px-3 py-1.5 rounded-md border font-medium ${
              isPaused
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            {isPaused ? 'Paused — tap to resume' : 'Pause orders'}
          </button>
        )}

        {/* Link to cook screen — window view + full crew mode only */}
        {kdsView === 'window' && truck.crew_mode === 'full' && (
          <a
            href={`/dashboard/${token}/kds?view=cook${pin ? `&pin=${pin}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-slate-600 underline"
          >
            Open cook screen
          </a>
        )}
      </header>

      {/* ── To Make bar ── */}
      {allDayPills.length > 0 && kdsView === 'window' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0 overflow-x-auto">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide flex-shrink-0">
            To make
          </span>
          {allDayPills.map(([name, count]) => (
            <span
              key={name}
              className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-md whitespace-nowrap flex-shrink-0"
            >
              {count}× {name}
            </span>
          ))}
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Queue panel ── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto px-3 py-3 gap-3">

          {displayOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-slate-300 gap-2">
              <span className="text-4xl">✓</span>
              <span className="text-sm">Queue clear</span>
            </div>
          ) : (
            displayOrders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                truck={truck}
                slots={[]}
                actionLoading={actionLoading}
                onAction={handleAction}
                onEdit={() => {}}
                viewMode={cardViewMode}
                kdsMode={kdsMode}
              />
            ))
          )}

          {/* Done strip — window view only */}
          {kdsView === 'window' && doneOrders.length > 0 && (
            <div className="mt-2 border-t border-slate-200 pt-2">
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-1.5">
                Done today · {doneOrders.length}
              </div>
              {doneOrders.map(o => (
                <div key={o.id} className="flex justify-between items-center py-1 text-xs text-slate-400 border-t border-slate-100">
                  <span>#{o.id} · {o.customer_name}</span>
                  <span className="text-green-600">✓ paid</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
