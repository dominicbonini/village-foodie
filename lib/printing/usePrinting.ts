'use client'
// ── THE BRIDGE — WHERE THE PRINTING PIPELINE IS ACTUALLY CONNECTED (15 August 2026) ───────────────────
// Every piece of printing existed and NOTHING was joined: usePrintWatcher and createStubTransport had zero
// call sites, and the only consumer of mapOrderToTicket/renderTicket was a dev page that 404s in
// production. This file is the join, and it is deliberately the ONLY one — the dashboard mounts one hook
// and passes state to one card, so there is exactly one place where "when does a ticket print" is decided.
//
// ── 🔴 ONE SURFACE. THE DASHBOARD. NOT THE KDS. ───────────────────────────────────────────────────────
// The dedupe record is `hg_printed_keys_<token>` in Capacitor Preferences, which is DEVICE-LOCAL. There is
// no cross-device dedupe — no print_jobs table, no orders.printed_at, nothing server-side. So a second
// mounted watcher does not race the first, it DUPLICATES it: two devices at one event would each print
// every ticket, at the same moment, because the trigger mode is truck-level and both agree on when a
// ticket is due. Mounting this hook anywhere else is a paper bug, not a feature.
// ⚠️ multi_device_kds is a SOLD Max feature, so two devices is a supported configuration. Until a shared
// record exists, exactly one surface may print.
//
// ── THE TRANSPORT BOUNDARY, AND WHAT HAPPENS BELOW IT TODAY ──────────────────────────────────────────
// onPrint maps the real Order → TicketOrder, renders real ESC/POS bytes, and hands them to the app's one
// transport. The stub refuses (`ok: false`), which the watcher reads as outcome 'failed' — CERTAIN nothing
// came out — so the key never enters the printed set and the next tick re-selects the order.
// 🔴 THAT RETRY *IS* THE QUEUE. Nothing is lost and nothing is falsely marked printed. There is no second
// queue, no outbox kind and no timer beyond the watcher's own, deliberately: a ticket that failed is still
// DUE, and "still due" is a state the selector already computes from the orders themselves.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Preferences } from '@capacitor/preferences'
import { isNativeApp } from '@/lib/native/device'
import { usePrintWatcher, selectDueToPrint, type PrintAttempt, type PrintAttemptContext, type PrintTriggerMode } from '@/lib/printing/printWatcher'
import { mapOrderToTicket, reprintFromContext } from '@/lib/printing/mapOrderToTicket'
import { renderTicket, type PaperWidth } from '@/lib/printing/ticket'
import { getPrinterTransport, type PrinterStatus } from '@/lib/printing/transport'
import { reconnectStoredPrinter } from '@/lib/printing/bleTransport'
import { onAppResume } from '@/lib/native/app'
import type { Order, TruckData, TruckEvent } from '@/components/dashboard/types'
import type { LedgerRow } from '@/lib/payments/ledger'

/** The four DEVICE-local settings the printing card writes. Read here, never written. */
const K = { printer: 'hg_printer_name', lead: 'hg_print_lead_mins', paper: 'hg_paper_width', enabled: 'hg_print_enabled' } as const

/** Two-digit clock, event-local. The watcher's contract asks for minutes-of-day. */
function nowMinsLocal(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/** "18:37" for the ticket's printed-at stamp. */
function stampNow(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export interface PrintingState {
  /** True only when the plan allows it, the device pref is on, and this is the native app. */
  active: boolean
  /** The transport's own answer. `connected` is false in Phase A and carries a reason. */
  status: PrinterStatus
  /** Orders due to print that have not printed. 🔴 The number an operator needs when nothing is connected. */
  waitingCount: number
}

/**
 * Mount ONCE, on the operator dashboard only.
 *
 * Returns what the printing card needs to tell the truth to an operator: whether printing is running,
 * what the transport says, and how many tickets are waiting.
 */
export function usePrinting(args: {
  token: string
  orders: Order[]
  truck: TruckData | null | undefined
  event: TruckEvent | null | undefined
  /** `payments[order_key]` from /api/dashboard — the same rows the order card reads. */
  payments: Record<string, LedgerRow[] | undefined>
  /** `heldAuthorisations` from /api/dashboard — an uncaptured hold writes no ledger row. */
  heldAuthorisations: Set<string>
  /** canAccess(plan, 'ticket_printing', …), resolved by the caller so the gate stays in one place. */
  canPrint: boolean
  mode: PrintTriggerMode
}): PrintingState {
  const { token, orders, truck, event, payments, heldAuthorisations, canPrint, mode } = args

  const [enabled, setEnabled] = useState(false)
  const [lead, setLead] = useState(10)
  const [paper, setPaper] = useState<PaperWidth>(80)
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<PrinterStatus>({ connected: false })

  // Refs so onPrint never goes stale without re-subscribing the watcher's interval.
  const ordersRef = useRef(orders); ordersRef.current = orders
  const truckRef = useRef(truck); truckRef.current = truck
  const eventRef = useRef(event); eventRef.current = event
  const paymentsRef = useRef(payments); paymentsRef.current = payments
  const heldRef = useRef(heldAuthorisations); heldRef.current = heldAuthorisations
  const paperRef = useRef(paper); paperRef.current = paper

  // ── SETTINGS: READ ONLY. The card owns these keys; this hook must never write them, or two writers
  // would race on one value. Re-read on mount only — a change made in the card takes effect on the next
  // dashboard load, which is the same contract the card's own state has.
  useEffect(() => {
    if (!isNativeApp()) { setReady(true); return }
    let off = false
    void (async () => {
      const en = (await Preferences.get({ key: K.enabled })).value
      const l = parseInt((await Preferences.get({ key: K.lead })).value ?? '10', 10)
      const w = parseInt((await Preferences.get({ key: K.paper })).value ?? '80', 10)
      if (off) return
      setEnabled(en === 'true')
      setLead(Number.isFinite(l) ? l : 10)
      setPaper(w === 58 ? 58 : 80)
      setReady(true)
    })()
    return () => { off = true }
  }, [])

  // 🔴 THE THREE GATES, ALL REQUIRED. Native app (a browser has no printer), the PLAN (printing is Max),
  // and the device's own On/Off. Any false and the watcher does not run at all — not "runs and does
  // nothing", which would still burn a timer and still write the durable set.
  const active = isNativeApp() && canPrint && enabled && ready

  // Poll the transport for status. Cheap (the stub answers from memory) and it is what lets the card say
  // WHY nothing is connected rather than showing a bare false.
  useEffect(() => {
    if (!active) return
    let off = false
    const read = async () => {
      try {
        const s = await getPrinterTransport().status()
        if (!off) setStatus(s)
      } catch {
        if (!off) setStatus({ connected: false, detail: 'The printer connection could not be checked' })
      }
    }
    void read()
    const id = setInterval(() => { void read() }, 20000)
    return () => { off = true; clearInterval(id) }
  }, [active])

  // ── 🔴 RECONNECT ON RESUME ──────────────────────────────────────────────────────────────────────────
  // A BLE link does not survive backgrounding. Without this, an operator who switches apps for thirty
  // seconds comes back to a printer that LOOKS paired (the name is stored) and is not connected, and the
  // first ticket after that fails. Best-effort and silent: if it cannot reconnect, status() keeps saying
  // "not connected" and the card keeps saying so — a failed background reconnect is not an event the
  // operator caused and must not interrupt them.
  useEffect(() => {
    if (!active) return
    const off = onAppResume(() => {
      void (async () => {
        try {
          await reconnectStoredPrinter(getPrinterTransport())
          setStatus(await getPrinterTransport().status())
        } catch { /* status stays false, which is the truth */ }
      })()
    })
    return off
  }, [active])

  // ── onPrint — THE TRANSPORT BOUNDARY ────────────────────────────────────────────────────────────────
  // 🔴 THE TICKET IS RENDERED EVEN THOUGH NOTHING CAN PRINT IT, DELIBERATELY. Wiring that stops short of
  // the renderer would leave the mapper and the encoder exactly as unexercised as they are today, and the
  // first real ESC/POS byte would be produced on the day hardware arrives — the worst day to discover a
  // mapping bug. Rendering here means a real Order goes through the real mapper on every attempt.
  // ⚠️ A THROW FROM THE MAPPER OR THE RENDERER IS 'failed', NOT 'unknown'. Nothing reached the transport,
  // so nothing reached paper; calling it 'unknown' would put a POSSIBLE DUPLICATE banner on the next
  // ticket for a sheet that was never even attempted.
  const onPrint = useCallback(async (order: Order, ctx: PrintAttemptContext): Promise<PrintAttempt> => {
    let bytes: Uint8Array
    try {
      const ticket = mapOrderToTicket({
        order,
        truck: truckRef.current,
        event: eventRef.current,
        ledgerRows: paymentsRef.current[order.order_key] ?? [],
        printedLabel: stampNow(),
        reprint: reprintFromContext(ctx) ?? null,
        heldAuthorisation: heldRef.current.has(order.order_key),
      })
      bytes = renderTicket(ticket, { paper_width: paperRef.current })
    } catch (e) {
      return { outcome: 'failed', error: e instanceof Error ? `render: ${e.message}` : 'render failed' }
    }
    // Below this line the bytes exist and only the device can fail.
    try {
      const res = await getPrinterTransport().sendBytes(bytes)
      if (res.ok) return { outcome: 'printed' }
      // 🔴 A REFUSAL IS 'failed' — the transport is certain nothing came out. The stub always lands here.
      return { outcome: 'failed', error: res.error }
    } catch (e) {
      // 🔴 A THROW IS 'unknown'. The write may have gone out partway; only the transport could know, and
      // it did not answer. The next ticket carries the possible-duplicate banner.
      return { outcome: 'unknown', error: e instanceof Error ? e.message : 'transport threw' }
    }
  }, [])

  // ── THE WATCHER. One timer, its own 20s interval — no second clock is introduced anywhere. ──────────
  usePrintWatcher<Order>({
    orders,
    mode,
    leadMins: lead,
    nowMins: nowMinsLocal,
    onPrint,
    storageKey: token,
    enabled: active,
  })

  // What the card shows. Uses the SAME pure selector the watcher uses, so the count and the decision can
  // never disagree — but with an empty printed-set it is "due", not "due and unprinted", so it is an
  // upper bound while a device has already printed some. Honest for the case it exists for: nothing
  // connected, therefore nothing printed, therefore every due order is waiting.
  const waitingCount = useMemo(() => {
    if (!active) return 0
    return selectDueToPrint(orders, { mode, nowMins: nowMinsLocal(), leadMins: lead, printed: new Set<string>() }).length
  }, [active, orders, mode, lead])

  return { active, status, waitingCount }
}
