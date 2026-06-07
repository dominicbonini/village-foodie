'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type OrderState = {
  id: string
  status: string
  customer_name: string
  slot: string | null
  event_date: string | null
  items: any[]
  deals: any[]
  total: number
  truck_name: string | null
  venue_name: string | null
  allow_cancellation: boolean
  cancellation_cutoff_mins: number
}

export default function ManageOrderPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<OrderState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    // [id] is the order_key UUID — globally unique, no ?truck= needed
    fetch(`/api/orders/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setOrder(data)
      })
      .catch(() => setError('Could not load order'))
      .finally(() => setLoading(false))
  }, [id])

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this order?')) return
    setCancelling(true)
    const res = await fetch('/api/orders/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_key: id }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to cancel order')
    } else {
      setCancelled(true)
    }
    setCancelling(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading your order...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-sm">
          <div className="text-3xl mb-3">😕</div>
          <h2 className="font-bold text-slate-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    )
  }

  if (cancelled) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-sm">
          <div className="text-3xl mb-3">✓</div>
          <h2 className="font-bold text-slate-900 mb-2">Order cancelled</h2>
          <p className="text-sm text-slate-500">
            Your order has been cancelled. If you paid online, a refund will be processed within 5–10 business days.
          </p>
        </div>
      </div>
    )
  }

  if (!order) return null

  const isPastCutoff = (): boolean => {
    if (!order.slot || !order.event_date || !order.cancellation_cutoff_mins) return false
    const slotTime = new Date(`${order.event_date}T${order.slot}`)
    const cutoff = new Date(slotTime.getTime() - order.cancellation_cutoff_mins * 60 * 1000)
    return new Date() > cutoff
  }

  const canCancel =
    order.allow_cancellation &&
    ['pending', 'confirmed'].includes(order.status) &&
    !isPastCutoff()

  const statusLabel = () => {
    if (order.status === 'cancelled') return 'This order has already been cancelled.'
    if (order.status === 'ready' || order.status === 'collected')
      return 'This order can no longer be cancelled.'
    if (isPastCutoff()) return 'The cancellation window has passed.'
    return 'Cancellations are not accepted for this order.'
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-sm overflow-hidden">

        {/* Header */}
        <div className="bg-slate-900 px-6 py-4">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">
            {order.truck_name}
          </p>
          <h1 className="text-white font-black text-xl mt-0.5">
            Order #{order.id}
          </h1>
        </div>

        {/* Order details */}
        <div className="px-6 py-4 border-b border-slate-100">
          {order.slot && (
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-500">Pickup</span>
              <span className="font-medium text-slate-900">
                {order.slot}{order.venue_name ? ` · ${order.venue_name}` : ''}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Status</span>
            <span className={`font-medium capitalize ${
              order.status === 'cancelled' ? 'text-red-500' :
              order.status === 'ready' ? 'text-green-500' :
              'text-slate-900'
            }`}>
              {order.status}
            </span>
          </div>
        </div>

        {/* Items */}
        <div className="px-6 py-4 border-b border-slate-100">
          {(order.items || []).map((item: any, i: number) => (
            <div key={i} className="flex justify-between text-sm py-1">
              <span className="text-slate-700">
                {item.quantity}× {item.name}
              </span>
              <span className="text-slate-500">
                £{((item.unit_price ?? item.price ?? 0) * (item.quantity || 1)).toFixed(2)}
              </span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-slate-100">
            <span>Total</span>
            <span>£{(order.total ?? 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Cancel section */}
        <div className="px-6 py-4">
          {canCancel ? (
            <>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-colors">
                {cancelling ? 'Cancelling...' : 'Cancel order'}
              </button>
              {order.cancellation_cutoff_mins > 0 && (
                <p className="text-xs text-slate-400 text-center mt-2">
                  Cancellations accepted up to {order.cancellation_cutoff_mins} minutes before pickup
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400 text-center">{statusLabel()}</p>
          )}
        </div>

      </div>
    </div>
  )
}
