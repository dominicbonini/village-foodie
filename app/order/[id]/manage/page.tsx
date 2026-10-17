'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { formatMajorOrBare, type MoneyFormat } from '@/lib/money-format'
import { formatSlot, timeSettingsOr, type TimeSettings } from '@/lib/time-utils'
import { eventTimeInstant } from '@/lib/event-window'
import { ChargeRows } from '@/components/ChargeRows'
import type { ChargeLineSource } from '@/lib/order-charge-lines'
import { useT, useTruckLocale } from '@/lib/i18n/use-t'
import { errorText } from '@/lib/i18n/customer-errors'
import '@/lib/i18n/catalog/orderStatus'
import '@/lib/i18n/catalog/errorsCustomer'

type OrderState = {
  /** 🔴 THE ORDER'S OWN currency and locale, from /api/orders/[id]. Missing ⇒ figures with no symbol. */
  money?: MoneyFormat | null
  /** 🔴 The truck's zone and display settings (Phase 2B), from /api/orders/[id]. */
  time?: TimeSettings | null
  id: string
  status: string
  customer_name: string
  slot: string | null
  event_date: string | null
  /** The order's event's times, when /api/orders/[id] sends them — so a slot past midnight on an overnight event reads
   *  as the next day's (lib/event-window.ts). Absent ⇒ the slot is on event_date, as before. */
  event_start_time?: string | null
  event_end_time?: string | null
  items: any[]
  deals: any[]
  total: number
  /** From the order row, never from a query parameter — see the API note. */
  payment_status: string | null
  truck_name: string | null
  venue_name: string | null
  allow_cancellation: boolean
  cancellation_cutoff_mins: number
  /** Phase 3 screens: the tax, fee and tip lines' source — absent for every UK order (see the API). */
  charges?: ChargeLineSource | null
}

// The words: messages/en-GB.json `orderStatus`, and `errorsCustomer` for a refusal's code (Language Phase 1a).
export default function ManageOrderPage() {
  const { id } = useParams<{ id: string }>()
  const t = useT('orderStatus')
  const tErr = useT('errorsCustomer')
  const [order, setOrder] = useState<OrderState | null>(null)
  useTruckLocale(order?.time?.locale)   // Language Phase 0: the truck's language, from the order's own settings
  const amount = (major: number) => formatMajorOrBare(major, order?.money, 'order receipt')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // A refusal's code and values beside its text (Language Phase 1a). The words are looked up when the error
  // renders, so the load effect below needs no translator — and an effect-set fallback is a CODE (`loadFailed`).
  const [errorCode, setErrorCode] = useState<{ code?: unknown; params?: unknown } | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    // [id] is the order_key UUID — globally unique, no ?truck= needed
    fetch(`/api/orders/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setErrorCode(data) }
        else setOrder(data)
      })
      .catch(() => setError('loadFailed'))
      .finally(() => setLoading(false))
  }, [id])

  const handleCancel = async () => {
    if (!confirm(t('confirmCancel'))) return
    setCancelling(true)
    const res = await fetch('/api/orders/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_key: id }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(errorText(tErr, data, t('cancelFailed')))
      setErrorCode(null)
    } else {
      setCancelled(true)
    }
    setCancelling(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">{t('loading')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-sm">
          <div className="text-3xl mb-3">😕</div>
          <h2 className="font-bold text-slate-900 mb-2">{t('errorTitle')}</h2>
          <p className="text-sm text-slate-500">{errorCode ? errorText(tErr, { ...errorCode, error }, error) : t.has(error as never) ? t(error as never) : error}</p>
        </div>
      </div>
    )
  }

  if (cancelled) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-sm">
          <div className="text-3xl mb-3">✓</div>
          <h2 className="font-bold text-slate-900 mb-2">{t('cancelledTitle')}</h2>
          {/* ── 🔴 REWRITTEN 10 August 2026, BEFORE THE FIRST CARD PAYMENT EXISTED ────────────────
              It read: "If you paid online, a refund will be processed within 5-10 business days."
              Both halves were promises HatchGrab cannot keep, and they were harmless only because no
              online payment existed. This build makes them false.
              🔴 WE ARE NEVER MERCHANT OF RECORD. Card payments are DIRECT charges on the truck's own
              Stripe account — the money never passes through HatchGrab, so we cannot return it. The
              published terms already assign refunds to the truck; that sentence contradicted them.
              🔴 NO TIMEFRAME. "5-10 business days" is the card networks' settlement window, quoted as
              though it were our commitment. We control neither when the truck issues a refund nor how
              long the customer's bank takes to show it.
              ⚠️ IT STILL ANSWERS THE QUESTION THE CUSTOMER HAS. Saying nothing about money would be
              worse than over-promising: it names who to ask, which is the one thing they need. */}
          <p className="text-sm text-slate-500">
            {t('cancelledBody', { withTruck: order?.truck_name ? 'yes' : 'no', truck: order?.truck_name ?? '' })}
          </p>
        </div>
      </div>
    )
  }

  if (!order) return null
  const ts = timeSettingsOr(order.time, 'order receipt')

  const isPastCutoff = (): boolean => {
    if (!order.slot || !order.event_date || !order.cancellation_cutoff_mins) return false
    // The slot is the truck's wall clock (Phase 2B) — not the customer's device's.
    // An overnight event's after-midnight slot is the NEXT day's (lib/event-window.ts); without its times, event_date.
    const slotTime = eventTimeInstant(order.event_date, order.event_start_time, order.event_end_time, order.slot, ts.timeZone)
    const cutoff = new Date(slotTime - order.cancellation_cutoff_mins * 60 * 1000)
    return new Date() > cutoff
  }

  // 'modified' is an edited-but-live order and belongs here — it must match the server's allow-list in
  // app/api/orders/cancel/route.ts exactly, or the button and the endpoint disagree and one of them lies.
  const canCancel =
    order.allow_cancellation &&
    ['pending', 'confirmed', 'modified'].includes(order.status) &&
    !isPastCutoff()

  // ── 🔴 THE TWO STATUSES WHERE THERE IS NOTHING LEFT TO PAY FOR. ────────────────────────────────
  // An order that was refused or called off will never be served, so "Pay at the truck" — which every
  // non-'paid' order used to print — is an instruction to walk to a window for food nobody is cooking.
  // ⚠️ IT IS A POSITIVE TEST, NOT A LIST OF EXCEPTIONS. Every OTHER status keeps today's line: a
  // pending, confirmed, modified, cooking, ready or collected order genuinely does still pay at the
  // truck, and this must not touch any of them.
  const isTerminalUnfulfilled = order.status === 'rejected' || order.status === 'cancelled'

  // Every branch names a REASON, and the order they are tested in is the order a customer would ask them.
  // The final line is the truck-policy sentence and must only be reached when the truck has genuinely
  // switched cancellation off — it used to catch 'modified' as well, telling a customer whose truck DOES
  // accept cancellations that it does not.
  const statusLabel = () => {
    if (order.status === 'cancelled') return t('statusCancelled')
    // 🔴 REJECTED IS A DIFFERENT EVENT FROM CANCELLED AND SAYS SO. It used to reach the fall-through and
    // be told only that it could no longer be cancelled — true, and an answer to a question the customer
    // had not asked. Tested here, above the cutoff and policy branches, because being refused outranks
    // both: the cancellation window is irrelevant to an order nobody is going to make.
    // ⚠️ IT PROMISES NOTHING. No refund, no timeframe, no "we will be in touch" — the same discipline the
    // cancelled screen's own comment settled on, for the same reason: HatchGrab is never merchant of
    // record and cannot keep any of those promises. The money is answered by the Payment row above.
    if (order.status === 'rejected') return t('statusRejected')
    if (order.status === 'ready' || order.status === 'collected')
      return t('statusTooLate')
    if (isPastCutoff()) return t('statusWindowPassed')
    if (!order.allow_cancellation) return t('statusNoCancellations')
    // Any remaining status (rejected, or one added later) is genuinely past cancelling. Same wording as
    // the server's 409 for the same case, so the two layers cannot say different things.
    return t('statusTooLate')
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
            {t('orderNumber', { id: order.id })}
          </h1>
        </div>

        {/* Order details */}
        <div className="px-6 py-4 border-b border-slate-100">
          {order.slot && (
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-500">{t('pickup')}</span>
              <span className="font-medium text-slate-900">
                {formatSlot(order.slot, ts)}{order.venue_name ? ` · ${order.venue_name}` : ''}
              </span>
            </div>
          )}
          {/* ── 🔴 WHAT THE CUSTOMER IS TOLD ABOUT MONEY, FROM THE ORDER ROW ───────────────────────
              A card payment no longer lands here at all — it is taken in-page on the order form and
              the customer goes to ?confirm=. This page is the "Cancel your order" email link. The rule
              it was written for still governs it: what a customer is told about money comes from the
              ROW, never the URL — a `?paid=1` in the address bar is a claim they could type themselves,
              and the row is written by the webhook from Stripe's own event.
              ⚠️ 'unpaid' IS NOT AN ERROR STATE. It is every Pay-at-Hatch order ever placed, so it is
              rendered plainly rather than in red — it says what to do, not that something went wrong. */}
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-500">{t('payment')}</span>
            <span className={`font-medium ${order.payment_status === 'paid' ? 'text-green-600' : 'text-slate-900'}`}>
              {/* ── 🔴 'paid' IS TESTED FIRST AND ITS BRANCH IS UNTOUCHED. MONEY THAT MOVED IS NEVER DENIED. ──
                  🔴 AND THE NEW SENTENCE IS GATED ON 'unpaid', NOT ON "not paid". Those are different
                  questions once a REFUND exists: a cancelled order that was charged and refunded reads
                  'refunded', and telling that customer "You have not been charged" would be false about
                  money that really did leave their account. 'unpaid' is the only value that means
                  nothing ever moved, which is the only ground this sentence can stand on without the
                  draft data this page deliberately does not fetch.
                  ⚠️ SO 'refunded', 'refund_due' AND 'part_paid' STILL FALL TO THE OLD LINE. That line is
                  wrong for them too, but it is wrong in a way that predates this change and needs copy
                  nobody has written; it is recorded rather than guessed at. */}
              {order.payment_status === 'paid'
                ? t('paidByCard')
                : isTerminalUnfulfilled && order.payment_status === 'unpaid'
                  ? t('notCharged')
                  : t('payAtTruck')}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">{t('status')}</span>
            {/* 🔴 'rejected' JOINS 'cancelled' ON THE EXISTING RED, rather than getting a colour of its
                own: they are the two ways an order ends without being served, and the convention here
                already reads red as terminal and green as good news. */}
            <span className={`font-medium capitalize ${
              order.status === 'cancelled' || order.status === 'rejected' ? 'text-red-500' :
              order.status === 'ready' ? 'text-green-500' :
              'text-slate-900'
            }`}>
              {/* The status's name (CSS still capitalises it — listed for the languages where that is wrong). */}
              {t.has(`statusName.${order.status}` as never) ? t(`statusName.${order.status}` as never) : order.status}
            </span>
          </div>
        </div>

        {/* Items */}
        <div className="px-6 py-4 border-b border-slate-100">
          {(order.items || []).map((item: any, i: number) => (
            <div key={i} className="flex justify-between text-sm py-1">
              <span className="text-slate-700">
                {t('itemLine', { quantity: String(item.quantity), name: String(item.name) })}
              </span>
              <span className="text-slate-500">
                {amount((item.unit_price ?? item.price ?? 0) * (item.quantity || 1))}
              </span>
            </div>
          ))}
          {/* Phase 3 screens: Subtotal, tax, fee and tip — nothing at all for a UK order. */}
          <ChargeRows charges={order.charges} amount={amount} textClass="text-sm py-0.5" />
          <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-slate-100">
            <span>{t('total')}</span>
            <span>{amount(order.total ?? 0)}</span>
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
                {cancelling ? t('cancelling') : t('cancelOrder')}
              </button>
              {order.cancellation_cutoff_mins > 0 && (
                <p className="text-xs text-slate-400 text-center mt-2">
                  {t('cutoffNote', { n: order.cancellation_cutoff_mins, count: String(order.cancellation_cutoff_mins) })}
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
