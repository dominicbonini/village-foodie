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

import { useState, useEffect } from 'react'
import { DemoGetStarted, SIGNUP_OFFER } from '@/components/DemoGetStarted'

const SNOOZE_MS = 10 * 60_000

export function DemoLoopComplete({ token, orderKeys, loaded }: {
  token: string
  /** Every order key currently on the board. */
  orderKeys: string[]
  /** True once the first successful load has completed — without this an empty initial `orders` would be
   *  written as the baseline, making the seeded orders look like the visitor's own. */
  loaded: boolean
}) {
  const baseKey = `hg_demo_seen_orders_${token}`
  const stateKey = `hg_demo_loop_${token}`

  const [visible, setVisible] = useState(false)

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
    if (!keys.some(k => !seen.has(k))) return           // nothing new — loop not completed yet

    // Loop complete. Respect an active snooze, and re-arm so it returns without needing a reload.
    let snoozedUntil = 0
    try {
      const raw = localStorage.getItem(stateKey)
      if (raw?.startsWith('snooze:')) snoozedUntil = Number(raw.slice('snooze:'.length)) || 0
    } catch { /* ignore */ }

    const wait = Math.max(0, snoozedUntil - Date.now())
    const t = setTimeout(() => setVisible(true), wait)
    return () => clearTimeout(t)
  }, [baseKey, stateKey, sig, loaded])

  const snooze = () => {
    try { localStorage.setItem(stateKey, `snooze:${Date.now() + SNOOZE_MS}`) } catch { /* private mode */ }
    setVisible(false)
    setTimeout(() => setVisible(true), SNOOZE_MS)
  }

  if (!visible) return null

  return (
    <div className="bg-white border-2 border-orange-300 rounded-2xl px-4 py-4 mb-4 shadow-sm">
      {/* The behavioural callback leads as an EYEBROW, not a heading — it's what earns the interruption,
          but it isn't the offer. The offer below is the shared SIGNUP_OFFER wording, identical to the
          modal this card's button opens, so the ask doesn't restate itself differently one click later. */}
      <p className="text-xs font-bold text-orange-600 uppercase tracking-wide">
        That&apos;s exactly how a real order arrives
      </p>
      <p className="text-base font-black text-slate-900 mt-1.5">
        {SIGNUP_OFFER.heading}
      </p>
      <p className="text-sm text-slate-600 mt-1">
        {SIGNUP_OFFER.sub} No card needed, and nothing goes public until you say so.
      </p>
      <div className="mt-3 flex items-center gap-3">
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
