'use client'

// components/dashboard/DemoLoopComplete.tsx
// The demo's behaviour-triggered signup prompt — fires when the visitor COMPLETES THE LOOP.
//
// ── WHY BEHAVIOUR, NOT TIME ────────────────────────────────────────────────────────────────────────
// A timer is the wrong signal: someone satisfied in 90 seconds gets nagged, someone genuinely engaged
// doesn't. The moment worth interrupting is the one where they've seen their own menu, ordered from it,
// and watched the order arrive on the board — peak conviction, and there is genuinely nothing left to
// discover. This fires exactly then, and the copy references what they just did so it reads as the product
// responding rather than a prompt going off.
//
// ── DETECTION: a persisted BASELINE of order keys ──────────────────────────────────────────────────
// "Order count went up since mount" breaks the moment they open the order page in the SAME tab — the
// dashboard remounts and their order is already part of the baseline. So the baseline is captured ONCE and
// persisted per token; any order key not in it means they made an order happen. Survives remounts, tab
// switches and reloads.
//
// It also fires for an operator-added walk-up. That's correct, not a leak: they still made an order appear
// and watched it arrive, and the copy holds either way.
//
// ── IN PLACE, NOT A MODAL ──────────────────────────────────────────────────────────────────────────
// Renders as a card at the top of the order board. They've just come back to watch the order land, so
// their eye is already here; a card that is simply THERE reads as responsive, where a modal firing as they
// return reads as being pounced on. The governing principle is removing fear, not adding pressure — and a
// modal would also block the exact thing they came to look at.
//
// "Not yet" SNOOZES for 10 minutes; it never dismisses permanently. Same reasoning as the save bar: this
// is the strongest prompt in the whole flow, and someone clicking it reflexively mid-exploration shouldn't
// lose it for good.

// ── FINDING THE ORDER, NOT JUST ANNOUNCING IT ──────────────────────────────────────────────────────
// The card used to say an order had arrived and leave them to hunt for it among ~37 seeded ones. The
// payoff of the whole demo required a search. It now NAMES the order (number, customer, total) and
// offers "Show me", which scrolls the board to that card and settles a ring on it.
//
// 🔴 WHICH order — the one key the BASELINE DIFF produced, never "the newest" and never a timestamp.
// The effect below already computes `keys.filter(k => !seen.has(k))` to decide whether to fire at all;
// that array IS the identity of what arrived, so the card keys off the same value that triggered it.
// Order ids and created_at are both unsafe here: the demo-event refresh can seed an order into the same
// window, and either heuristic would then point at the wrong card. The diff cannot — a seeded order
// that lands in the same tick appears as a SECOND fresh key, which is detectable (see `ambiguous`).

import { useState, useEffect } from 'react'
import { DemoGetStarted, SIGNUP_OFFER } from '@/components/DemoGetStarted'
import type { Order } from '@/components/dashboard/types'

const SNOOZE_MS = 10 * 60_000

/** How long to wait for a smooth scroll to settle when `scrollend` doesn't arrive (it is unsupported on
 *  older WebKit, and never fires at all if the board is already in view and nothing actually moves). */
const SCROLL_SETTLE_FALLBACK_MS = 900

export function DemoLoopComplete({ token, orderKeys, orders, loaded, onHighlight }: {
  token: string
  /** Every order key currently on the board. */
  orderKeys: string[]
  /** The board's orders — used ONLY at render time, to look up the arrived order's number / customer /
   *  total for the card copy. Deliberately not in any effect's dependencies (see the `sig` note below). */
  orders: Order[]
  /** True once the first successful load has completed — without this an empty initial `orders` would be
   *  written as the baseline, making the seeded orders look like the visitor's own. */
  loaded: boolean
  /** Called with the order key once the scroll to it has FINISHED, so the parent can set the ring. Called
   *  with null on click, to clear a previous ring and let the CSS animation retrigger on a second press. */
  onHighlight?: (orderKey: string | null) => void
}) {
  const baseKey = `hg_demo_seen_orders_${token}`
  const stateKey = `hg_demo_loop_${token}`

  const [visible, setVisible] = useState(false)
  /** Every key the baseline diff found. Normally one — the order they just placed. */
  const [freshKeys, setFreshKeys] = useState<string[]>([])

  // The parent builds `orderKeys` with .map(), so it's a NEW array every render — depending on it directly
  // would re-run this effect (and re-arm its timer) on every render. Depend on a stable VALUE signature
  // instead and rebuild the keys inside, so the effect only runs when the board actually changes.
  const sig = orderKeys.join('|')

  useEffect(() => {
    if (typeof window === 'undefined' || !loaded || !sig) return
    const keys = sig.split('|')

    let baseline: string[] | null = null
    try {
      const raw = localStorage.getItem(baseKey)
      if (raw) baseline = JSON.parse(raw) as string[]
    } catch { /* unreadable → treated as unset below */ }

    // FIRST LOAD — record what was already on the board (the seeded service) and fire nothing.
    if (!baseline) {
      try { localStorage.setItem(baseKey, JSON.stringify(keys)) } catch { /* private mode */ }
      return
    }

    const seen = new Set(baseline)
    // Same condition as before — `filter(...).length === 0` is `!some(...)`. The array is kept rather
    // than discarded so the card can name and locate what arrived; the TRIGGER is unchanged.
    const fresh = keys.filter(k => !seen.has(k))
    if (fresh.length === 0) return                      // nothing new — loop not completed yet

    // Loop complete. Respect an active snooze, and re-arm so it returns without needing a reload.
    let snoozedUntil = 0
    try {
      const raw = localStorage.getItem(stateKey)
      if (raw?.startsWith('snooze:')) snoozedUntil = Number(raw.slice('snooze:'.length)) || 0
    } catch { /* ignore */ }

    const wait = Math.max(0, snoozedUntil - Date.now())
    const t = setTimeout(() => { setFreshKeys(fresh); setVisible(true) }, wait)
    return () => clearTimeout(t)
  }, [baseKey, stateKey, sig, loaded])

  const snooze = () => {
    try { localStorage.setItem(stateKey, `snooze:${Date.now() + SNOOZE_MS}`) } catch { /* private mode */ }
    setVisible(false)
    setTimeout(() => setVisible(true), SNOOZE_MS)
  }

  // The arrived order, resolved at RENDER time from the key the diff produced. `find` rather than an
  // index: the board re-sorts (sortByTimeThenId) and filters by status, so position is not identity.
  const arrived = freshKeys.length > 0 ? orders.find(o => o.order_key === freshKeys[0]) ?? null : null
  // More than one key went unseen in the same tick — a seeded order landing alongside theirs. We cannot
  // tell which is which, so we name nothing rather than name the wrong one.
  const ambiguous = freshKeys.length > 1

  const showMe = () => {
    if (!arrived) return
    const el = document.getElementById(`demo-order-${arrived.order_key}`)
    if (!el) return
    // Clear first so a second press re-runs the CSS animation (re-setting the same key would not).
    onHighlight?.(null)

    // HIGHLIGHT ON ARRIVAL AT THE CARD, NOT ON THE ORDER'S ARRIVAL. Pulsing while the card is still
    // off-screen spends the whole effect on nobody: they would scroll down to something already
    // finished. So the ring is armed by scroll COMPLETION.
    let done = false
    const settle = () => {
      if (done) return
      done = true
      document.removeEventListener('scrollend', settle, true)
      clearTimeout(timer)
      onHighlight?.(arrived.order_key)
    }
    // LISTENING ON document IN THE CAPTURE PHASE, not on window. The board scrolls inside the app
    // shell's <main …overflow-y-auto> (app/dashboard/[token]/page.tsx), so the scroll never reaches
    // window and a window listener would never fire. Scroll events don't bubble, but the capture path
    // runs regardless of bubbling, so one document-level capturing listener catches whichever element
    // actually moved.
    //
    // The timer is a genuine fallback, not a guess at the duration: `scrollend` is unsupported on older
    // WebKit, and it does not fire at all when the card is already in view and nothing moves.
    const timer = setTimeout(settle, SCROLL_SETTLE_FALLBACK_MS)
    document.addEventListener('scrollend', settle, true)

    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (!visible) return null

  return (
    <div className="bg-white border-2 border-orange-300 rounded-2xl px-4 py-4 mb-4 shadow-sm text-center">
      {/* The behavioural callback leads as an EYEBROW, not a heading — it's what earns the interruption,
          but it isn't the offer. The offer below is the shared SIGNUP_OFFER wording, identical to the
          modal this card's button opens, so the ask doesn't restate itself differently one click later. */}
      <p className="text-xs font-bold text-orange-600 uppercase tracking-wide">
        That&apos;s exactly how a real order arrives
      </p>

      {/* NAME IT, then offer to go to it. Rendered only when the diff gave exactly one key AND that
          order is still on the board — otherwise the eyebrow above stands alone, as it did before.
          Never a row of blanks: every field below is checked, not assumed. */}
      {arrived && !ambiguous && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <p className="text-sm text-slate-700">
            <span className="font-black text-slate-900">#{arrived.id}</span>
            {arrived.customer_name?.trim() ? <> · {arrived.customer_name.trim()}</> : null}
            {Number.isFinite(arrived.total) ? <> · <span className="font-bold">£{arrived.total.toFixed(2)}</span></> : null}
          </p>
          <button type="button" onClick={showMe}
            className="text-sm font-bold text-orange-600 hover:text-orange-700 underline underline-offset-2">
            Show me
          </button>
        </div>
      )}

      <p className="text-base font-black text-slate-900 mt-1.5">
        {SIGNUP_OFFER.heading}
      </p>
      <p className="text-sm text-slate-600 mt-1">
        {SIGNUP_OFFER.sub} No card needed, and nothing goes public until you say so.
      </p>
      <div className="mt-3 flex items-center justify-center gap-3">
        {/* SAME capture flow as the banner CTA — one path, two presentations, so they can't drift. */}
        <DemoGetStarted
          token={token}
          label="Save my menu"
          className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-black px-5 py-2.5 rounded-xl shadow-sm"
        />
        <button type="button" onClick={snooze}
          className="text-sm text-slate-500 hover:text-slate-700 font-medium">
          Not yet
        </button>
      </div>
    </div>
  )
}
