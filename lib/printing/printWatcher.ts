'use client'
// ── "Print when due" scheduling (Phase A — logic only; the transport is a callback, NOT the plugin) ─────
// A device-local watcher on the mounted iPad: every tick it scans un-printed DUE orders and "prints" each
// once. In Phase A `onPrint` routes to the preview/log; in Phase B it calls the native BT plugin. Dedup is
// enforced here so an order fires ONCE, never on every tick.
//
// DUE RULE (one rule for ASAP + scheduled): print when `now >= collection_time − leadMins`. ASAP orders have
// an imminent collection_time → they fire ~immediately; scheduled pre-orders fire N-min-before their future
// time. `now` and `collection_time` are compared as MINUTES-OF-DAY in the EVENT timezone (the caller supplies
// nowMins via §31 tz helpers) so there's no UTC/BST drift.
import { useEffect, useRef } from 'react'

const DEFAULT_ELIGIBLE = ['confirmed', 'cooking', 'ready']

interface DueOrder { order_key: string; collection_time?: string | null; status: string }

/** "HH:MM" (event tz) → minutes-of-day, or null (ASAP / unparseable ⇒ treat as due now). */
export function timeToMins(hhmm?: string | null): number | null {
  if (!hhmm) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

/** PURE: the orders that should print right now (unit-testable — pass nowMins + the printed set). */
export function selectDueToPrint<T extends DueOrder>(
  orders: T[],
  opts: { nowMins: number; leadMins: number; printed: Set<string>; eligible?: string[] },
): T[] {
  const eligible = opts.eligible ?? DEFAULT_ELIGIBLE
  return orders.filter(o => {
    if (opts.printed.has(o.order_key)) return false          // dedup — printed once already
    if (!eligible.includes(o.status)) return false
    const due = timeToMins(o.collection_time)
    if (due == null) return true                             // ASAP / no time ⇒ due now
    return opts.nowMins >= due - opts.leadMins
  })
}

/** The watcher hook. `nowMins()` returns the current minutes-of-day in the EVENT timezone. `onPrint` is the
 *  transport seam — preview/log in Phase A, the plugin in Phase B. `seedPrinted` pre-loads already-printed
 *  keys (e.g. from server `printed_at` + the Preferences printed-set) so a restart doesn't reprint. */
export function usePrintWatcher<T extends DueOrder>(args: {
  orders: T[]
  leadMins: number
  nowMins: () => number
  onPrint: (order: T) => void
  eligible?: string[]
  enabled?: boolean
  seedPrinted?: Iterable<string>
  intervalMs?: number
}): void {
  const { orders, leadMins, nowMins, onPrint, eligible, enabled = true, seedPrinted, intervalMs = 20000 } = args
  const printed = useRef<Set<string>>(new Set(seedPrinted ?? []))
  const ordersRef = useRef(orders); ordersRef.current = orders
  const onPrintRef = useRef(onPrint); onPrintRef.current = onPrint
  const nowRef = useRef(nowMins); nowRef.current = nowMins

  useEffect(() => {
    if (!enabled) return
    const tick = () => {
      const due = selectDueToPrint(ordersRef.current, { nowMins: nowRef.current(), leadMins, printed: printed.current, eligible })
      for (const o of due) { printed.current.add(o.order_key); onPrintRef.current(o) }
    }
    tick()                                                   // fire immediately, then on the interval
    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
    // eligible is a stable literal from the caller; leadMins/enabled/intervalMs are the meaningful deps.
  }, [enabled, leadMins, intervalMs, eligible])
}
