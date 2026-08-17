import { useState, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'

// Shared STACKED-toast system (extracted verbatim from the dashboard). An array so rapid successive
// actions (e.g. marking 2-3 orders ready) each get their OWN toast + timer; each auto-dismisses on its
// own timer (toastTimers, keyed by id). dismissToast removes one; showToast PUSHES one (does not replace).
// Consumed by the dashboard now, KDS + manage later — pair with <ToastStack> for the render.

export type ToastAction = { label: string; run: () => void }
// ⚠️ `msg` is ReactNode, NOT string — WIDENED, never narrowed. `string` is a subtype of ReactNode, so
// every existing caller (all of which pass a template literal) compiles and renders exactly as before;
// this only ADMITS a fragment where a plain string used to be the only option. ToastStack already renders
// `{t.msg}` inside a span, so it needed no change at all.
//
// WHY: the ready toast has to show the buzzer number legibly, and the toast ground is `bg-green-600`
// with white text — 3.30:1, below the 4.5:1 floor for its 14px bold text. Putting the one number that
// cannot be re-derived at that ratio is not acceptable, and the fix is a solid-white pill around it
// (slate-900 on white = 17.85:1). A pill is markup, and markup cannot travel through a `string`.
export type Toast = { id: number; msg: ReactNode; type: 'success' | 'error'; action?: ToastAction }
// showToast keeps its parameter ORDER and defaults so every existing caller is unchanged.
export type ShowToast = (
  msg: ReactNode,
  type?: 'success' | 'error',
  opts?: { action?: ToastAction; duration?: number },
) => number

// ── 🔴 THE CAP. A TOAST MUST NEVER COVER AN ACTION CONTROL ON A KITCHEN SCREEN. ─────────────────────
// The stack is `fixed bottom-6 … flex-col gap-2 z-50` and grows UPWARD from the bottom of the viewport,
// which is exactly where a card's Confirm / Reject / Mark-paid row sits. `OrderCard` carries no z-index,
// so the bars are unconditionally on top of it. Six of them — one per accumulated push listener — buried
// the buttons on a live counter.
//
// WHY THREE. It is the largest number that still reads as "a few things happened" rather than a wall:
// three bars plus their gaps occupy roughly a fifth of an iPad's height from the bottom edge, leaving the
// card body and its action row visible. Two would silently swallow the third of three genuinely different
// messages — marking three orders ready in quick succession is a REAL sequence, not a defect, and each of
// those toasts carries its OWN Undo. One would make the Undo affordance unreliable. Three keeps every
// distinct action's Undo reachable while bounding the worst case.
// ⚠️ IT IS A CAP ON SIMULTANEOUS BARS, NOT A RATE LIMIT. Nothing is dropped that the operator could still
// have acted on: the oldest is also the one closest to expiring.
export const MAX_TOASTS = 3

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastIdRef = useRef(0)
  const toastTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const clearTimer = (id: number) => {
    const t = toastTimers.current.get(id); if (t) clearTimeout(t); toastTimers.current.delete(id)
  }

  // 🔴 MEMOISED, AND THAT IS A FIX RATHER THAN A TIDY-UP. `showToast` was a plain arrow re-created on every
  // render, which destabilised every `useCallback` that depends on it — `openOrderFromPush` → `runSetup` →
  // the push-registration effect — so that effect re-ran on EVERY DASHBOARD RENDER and each run raced the
  // listener latch. Six accumulated listeners turned one notification tap into six identical toasts. The
  // dependency chain is stable from here up.
  // ⚠️ `dismissToast` touches only refs and the state setter, both stable, so its dep array is genuinely
  // empty and `showToast` can depend on it safely.
  const dismissToast = useCallback((id: number) => {
    clearTimer(id)
    setToasts(prev => prev.filter(x => x.id !== id))
  }, [])

  const showToast: ShowToast = useCallback((msg, type = 'success', opts) => {
    const id = ++toastIdRef.current
    const next: Toast = { id, msg, type, action: opts?.action }
    setToasts(prev => {
      let list = prev
      // ── COLLAPSE IDENTICAL CONSECUTIVE MESSAGES ──────────────────────────────────────────────────
      // 🔴 IT REPLACES, IT DOES NOT DISCARD — which is what keeps the Undo correct. The newest toast's
      // `action` is the one kept, so "Order #12 ready" fired twice leaves ONE bar carrying the LATER
      // Undo rather than a stale closure over the earlier tap. Copy, type and duration are the incoming
      // toast's own and are untouched.
      // ⚠️ ONLY STRING-vs-STRING, AND ONLY AGAINST THE NEWEST BAR. A ReactNode cannot be compared by
      // value, so the buzzer-pill ready toast (a fragment) never collapses — it appends, exactly as
      // before. And "consecutive" means the last entry only: two DIFFERENT messages either side of a
      // repeat are all distinct events and all survive.
      // ⚠️ IDENTICAL COPY IMPLIES THE SAME ORDER — every one of these strings embeds `#{num}` — so
      // collapsing can never merge two different orders' toasts.
      const last = list[list.length - 1]
      if (last && last.type === type && typeof last.msg === 'string' && typeof msg === 'string' && last.msg === msg) {
        clearTimer(last.id)
        list = list.slice(0, -1)
      }
      list = [...list, next]
      // The cap. Oldest-first, and its timer goes with it so the map cannot grow unbounded.
      while (list.length > MAX_TOASTS) { clearTimer(list[0].id); list = list.slice(1) }
      return list
    })
    toastTimers.current.set(id, setTimeout(() => dismissToast(id), opts?.duration ?? 3500))
    return id
  }, [dismissToast])

  return { toasts, showToast, dismissToast }
}
