'use client'
// ── PRINT TRIGGER — when a ticket prints (Phase A: logic only, the transport is a callback) ───────────
// A device-local watcher on the mounted iPad: every tick it scans un-printed DUE orders and "prints" each
// once. In Phase A `onPrint` routes to the preview/log; in Phase B it calls the native BT plugin.
//
// ── 🔴 THE FIELD IS `slot`, NOT `collection_time`. READ THIS BEFORE CHANGING IT. ─────────────────────
// This module asked for `collection_time` and the stored field on Order is **`slot`** — `collection_time`
// exists only on the `Slot` type. Passing real orders in gave `timeToMins(undefined) === null`, which the
// due rule reads as "ASAP ⇒ due now", so **EVERY ORDER PRINTED IMMEDIATELY**. `tsc` was silent because the
// field was optional and `Order` structurally satisfied the rest, and the dev harness hid it by
// hand-writing literal `collection_time` values that no real order has. Fixed 6 August 2026.
// ⚠️ The harness now feeds the watcher REAL `Order`-shaped objects so this class cannot hide there again.
//
// ── THE TWO TRIGGER MODES ────────────────────────────────────────────────────────────────────────────
//   'on_confirmed' — print as soon as the order is ACCEPTED.
//   'lead_time'    — print X minutes before the collection time. The existing behaviour, and the DEFAULT,
//                    so no truck's behaviour changes by upgrading.
//
// 🔴 BOTH MODES ANCHOR ON ACCEPTANCE, NEVER ON CREATION. `DEFAULT_ELIGIBLE` excludes 'pending', so an
// online order that has not been accepted never prints — and 'cancelled'/'rejected' are not in the list
// either, so a rejected order never prints. That guard is what stops a ticket being produced (and food
// started) for an order the operator is about to refuse. A walk-up is created 'confirmed', so mode
// 'on_confirmed' fires for it at creation; an online order fires at auto-accept or at the operator's tap.
//
// ── 🔴 THE RESULT CHANNEL — WHY 'unknown' IS A FIRST-CLASS OUTCOME ──────────────────────────────────
// `onPrint` used to return `void`, so success was not merely ignored — it was UNOBSERVABLE, and a key
// entered the printed set BEFORE the attempt. An order whose print failed was marked printed and could
// never print again. It now returns a PrintAttempt, and a key enters the printed set ONLY on 'printed'.
//
// THREE outcomes, and the third is the point:
//   'printed'  — paper came out. Record it; never print it again.
//   'failed'   — the transport is CERTAIN nothing came out (never connected, refused before any byte
//                left). The order stays due, and the next attempt is a FIRST ticket, not a reprint.
//   'unknown'  — a write failed PARTWAY, or the transport threw. Paper may or may not have come out and
//                nothing can tell us which (transport.ts's PrintResult is one boolean; on BLE a resolved
//                write means bytes left the PHONE, not that paper moved).
//
// 🔴 UNKNOWN IS NOT COLLAPSED INTO FAILED, AND A KITCHEN TREATS THEM DIFFERENTLY. Both leave the order
// due — because a duplicate ticket beats a missing one: a duplicate is visible on the rail and a human
// resolves it in seconds, whereas a missing ticket is invisible until the customer asks for food nobody
// started. But they differ in what the NEXT ticket says: after 'failed' the reprint marker is absent
// (nothing came out, so this is the first ticket); after 'unknown' the caller is told `mayDuplicate` and
// the ticket carries the POSSIBLE DUPLICATE banner. That distinction is the whole reason to keep three
// outcomes instead of two.
//
// ⚠️ A THROWN transport error is 'unknown', NOT 'failed'. A throw tells us the call did not complete; it
// tells us nothing about paper. Treating it as 'failed' would claim certainty we do not have — and in the
// direction that risks the invisible failure.
//
// ⚠️ NO RETRY, BACKOFF OR PACING IS BUILT HERE. Leaving a key out of the printed set means the next tick
// re-selects it, which is inherent to re-evaluation, not a retry policy. Attempt counts are recorded so a
// policy CAN be written; none is. That belongs with the transport.
import { useEffect, useRef } from 'react'
import { Preferences } from '@capacitor/preferences'

/** Statuses that mean "this order has been ACCEPTED and should be made". Excludes pending/cancelled/rejected.
 *  🔴 'modified' BELONGS BY THIS LIST'S OWN DEFINITION and was missing: it means accepted AND CHANGED SINCE,
 *  which is an order the kitchen must make — and the one most worth putting on paper, because it is the one
 *  whose contents differ from whatever the cook last saw. Without it an operator who edited an order before
 *  it printed never got a ticket for it, in either trigger mode, silently. */
const DEFAULT_ELIGIBLE = ['confirmed', 'modified', 'cooking', 'ready']

export type PrintTriggerMode = 'on_confirmed' | 'lead_time'

/** What an attempt did to paper. See the header for why 'unknown' is not merged into 'failed'. */
export type PrintOutcome = 'printed' | 'failed' | 'unknown'

/** What `onPrint` returns. `error` is for the record and the dev inspector, never for the ticket. */
export interface PrintAttempt { outcome: PrintOutcome; error?: string }

/** Handed to `onPrint` so the caller can mark the ticket. 🔴 `mayDuplicate` is the ONLY thing the ticket
 *  renderer needs from the attempt history: it is true iff some earlier attempt for this order ended
 *  'unknown', i.e. paper may already exist. It stays true once set — a later clean 'failed' does not
 *  clear it, because the possible earlier sheet is still out there. */
export interface PrintAttemptContext {
  /** 1 on the first attempt for this order. */
  attempt: number
  /** How the previous attempt ended; undefined on the first attempt. */
  priorOutcome?: Exclude<PrintOutcome, 'printed'>
  mayDuplicate: boolean
}

/** 🔴 `slot` — the field a real `Order` actually carries. See the header. */
interface DueOrder { order_key: string; slot?: string | null; status: string }

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
  opts: { mode: PrintTriggerMode; nowMins: number; leadMins: number; printed: Set<string>; eligible?: string[] },
): T[] {
  const eligible = opts.eligible ?? DEFAULT_ELIGIBLE
  return orders.filter(o => {
    if (opts.printed.has(o.order_key)) return false          // dedup — printed once already
    if (!eligible.includes(o.status)) return false           // 🔴 not accepted (or rejected) ⇒ never print
    // ON CONFIRMED — acceptance IS the trigger; the collection time is irrelevant.
    // ⚠️ An advance pre-order therefore prints when it is ACCEPTED, which can be hours before collection.
    // That is the mode's defining property, and the Settings card states it in the option itself.
    if (opts.mode === 'on_confirmed') return true
    // LEAD TIME — one rule for ASAP and scheduled: print when now >= slot − leadMins. ASAP orders have no
    // parseable slot ⇒ due now.
    const due = timeToMins(o.slot)
    if (due == null) return true
    return opts.nowMins >= due - opts.leadMins
  })
}

// ── 🔴 DEDUP MUST SURVIVE A RELOAD ──────────────────────────────────────────────────────────────────
// It used to be `useRef<Set<string>>` — IN MEMORY ONLY. Reloading the page, switching tabs, or the
// WebView content process being killed reset it, and the next tick reprinted EVERY already-printed order.
// On a physical printer mid-service that is paper everywhere, and it is worse in 'on_confirmed' mode
// where every accepted order in the day is simultaneously eligible.
// Now persisted to Capacitor Preferences — the same durable device store the outbox and the printing
// settings use, which survives reload, tab switch and process death.
//
// 🔴 AND THE FIRST RUN MUST NOT PRINT THE BACKLOG. On a first run — or after a MODE CHANGE, which makes a
// different set of orders eligible — the watcher PRIMES: it absorbs everything currently due into the
// printed set and prints NOTHING. Without this, turning printing on (or switching to 'on_confirmed')
// would print the entire day's accepted orders in one burst. The stored record carries the mode it was
// primed under, so a mode change is detected and re-primes rather than replaying history.
//
// 🔴 `keys` NOW MEANS "PAPER CAME OUT", NOT "WE TRIED". A key is added on outcome 'printed' and on
// nothing else. Everything that did not succeed lives in `unsettled` instead, which carries what the
// bare key list could not: how many attempts, how the last one ended, and — the load-bearing one —
// whether any attempt ever ended 'unknown', which is what puts the POSSIBLE DUPLICATE banner on the
// next ticket.
const PRINTED_KEY_PREFIX = 'hg_printed_keys_'

/** An order that has been attempted and has NOT successfully printed. */
interface UnsettledRecord {
  attempts: number
  lastOutcome: Exclude<PrintOutcome, 'printed'>
  lastError?: string
  /** 🔴 Sticky. Once an attempt ends 'unknown', paper may exist for this order forever after. */
  everUnknown: boolean
}

interface PrintedRecord {
  mode: PrintTriggerMode
  /** SUCCESSFUL prints only. */
  keys: string[]
  /** Attempted-but-not-printed, keyed by order_key. Optional so an older record still loads. */
  unsettled?: Record<string, UnsettledRecord>
}

async function loadPrinted(storageKey: string): Promise<PrintedRecord | null> {
  try {
    const raw = (await Preferences.get({ key: PRINTED_KEY_PREFIX + storageKey })).value
    if (!raw) return null
    const parsed = JSON.parse(raw) as PrintedRecord
    return Array.isArray(parsed?.keys) ? parsed : null
  } catch { return null }
}

async function savePrinted(storageKey: string, rec: PrintedRecord): Promise<void> {
  // ⚠️ Best-effort. A failed write means a later reload may reprint — visible and recoverable — whereas
  // throwing here would break the watcher entirely. Logged so it is not silent.
  try { await Preferences.set({ key: PRINTED_KEY_PREFIX + storageKey, value: JSON.stringify(rec) }) }
  catch (e) { console.warn('[print] could not persist the printed set:', e) }
}

/** The watcher hook. `nowMins()` returns the current minutes-of-day in the EVENT timezone. `onPrint` is the
 *  transport seam — preview/log in Phase A, the plugin in Phase B.
 *  `storageKey` scopes the durable printed-set to a truck/device (pass the dashboard token). */
export function usePrintWatcher<T extends DueOrder>(args: {
  orders: T[]
  mode: PrintTriggerMode
  leadMins: number
  nowMins: () => number
  /** 🔴 Returns what happened to PAPER. See PrintOutcome. `ctx.mayDuplicate` is what the caller feeds to
   *  the ticket's reprint marker. May be sync or async; the pump awaits it either way. */
  onPrint: (order: T, ctx: PrintAttemptContext) => Promise<PrintAttempt> | PrintAttempt
  storageKey: string
  eligible?: string[]
  enabled?: boolean
  intervalMs?: number
}): void {
  const { orders, mode, leadMins, nowMins, onPrint, storageKey, eligible, enabled = true, intervalMs = 20000 } = args
  const printed = useRef<Set<string>>(new Set())
  const unsettled = useRef<Record<string, UnsettledRecord>>({})
  const ready = useRef(false)                       // false until the durable set is loaded/primed
  const inFlight = useRef(false)                    // a printer is ONE serial device — see the pump note
  const ordersRef = useRef(orders); ordersRef.current = orders
  const onPrintRef = useRef(onPrint); onPrintRef.current = onPrint
  const nowRef = useRef(nowMins); nowRef.current = nowMins

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    ready.current = false
    inFlight.current = false
    printed.current = new Set()
    unsettled.current = {}

    // ── THE PUMP — SEQUENTIAL, AND NOT OPTIONAL ────────────────────────────────────────────────────
    // `onPrint` is now awaited, so the old fire-and-forget `for` loop would issue every write at once
    // into a SINGLE SERIAL DEVICE. And a tick that outlives its interval would overlap the next one and
    // attempt the same order twice concurrently. `inFlight` prevents both.
    // ⚠️ This is a correctness consequence of the async signature, NOT the pacing policy — there is no
    // delay, no backoff and no cap here. Those come with the transport.
    const tick = async () => {
      if (!ready.current || inFlight.current) return   // never print before the durable set is resolved
      const due = selectDueToPrint(ordersRef.current, { mode, nowMins: nowRef.current(), leadMins, printed: printed.current, eligible })
      if (!due.length) return
      inFlight.current = true
      try {
        for (const o of due) {
          if (cancelled) return
          const prior = unsettled.current[o.order_key]
          const ctx: PrintAttemptContext = {
            attempt: (prior?.attempts ?? 0) + 1,
            priorOutcome: prior?.lastOutcome,
            mayDuplicate: prior?.everUnknown ?? false,
          }
          let res: PrintAttempt
          try {
            res = await onPrintRef.current(o, ctx)
          } catch (e) {
            // 🔴 A THROW IS 'unknown', NEVER 'failed'. It says the call did not complete; it says nothing
            // about paper. Calling it 'failed' would claim certainty we do not have, in the direction
            // that risks the invisible failure.
            res = { outcome: 'unknown', error: e instanceof Error ? e.message : 'thrown (no result)' }
          }
          if (res.outcome === 'printed') {
            printed.current.add(o.order_key)          // 🔴 THE ONLY PLACE A KEY ENTERS ON A PRINT
            delete unsettled.current[o.order_key]
          } else {
            unsettled.current[o.order_key] = {
              attempts: ctx.attempt,
              lastOutcome: res.outcome,
              lastError: res.error,
              everUnknown: (prior?.everUnknown ?? false) || res.outcome === 'unknown',
            }
          }
        }
        await savePrinted(storageKey, { mode, keys: [...printed.current], unsettled: unsettled.current })
      } finally {
        inFlight.current = false
      }
    }

    void (async () => {
      const rec = await loadPrinted(storageKey)
      if (cancelled) return
      if (rec && rec.mode === mode) {
        printed.current = new Set(rec.keys)         // resume — reload/tab-switch/process-kill safe
        unsettled.current = { ...(rec.unsettled ?? {}) }   // 🔴 `everUnknown` MUST survive a reload
      } else {
        // 🔴 PRIME: first run, or the mode changed. Absorb everything currently due WITHOUT printing.
        // ⚠️ THIS IS THE ONE DELIBERATE EXCEPTION to "a key enters only on a successful print", and it
        // is UNRESOLVED, not settled. Priming and flush-on-connect are the same event — a set of already
        // due orders at the moment printing becomes possible — with opposite intended outcomes, and
        // nothing in the order data distinguishes them. Resolving it needs a REAL connection state,
        // which does not exist (transport.ts's only `status()` hard-codes `connected: true`). Left as an
        // open decision in docs/printing-report.md. DO NOT resolve it here as a side effect of a tidy.
        const due = selectDueToPrint(ordersRef.current, { mode, nowMins: nowRef.current(), leadMins, printed: new Set(), eligible })
        printed.current = new Set(due.map(o => o.order_key))
        await savePrinted(storageKey, { mode, keys: [...printed.current], unsettled: {} })
      }
      ready.current = true
      void tick()                                   // then run normally
    })()

    const id = setInterval(() => { void tick() }, intervalMs)
    return () => { cancelled = true; clearInterval(id) }
    // eligible is a stable literal from the caller; the rest are the meaningful deps.
  }, [enabled, mode, leadMins, intervalMs, storageKey, eligible])
}
