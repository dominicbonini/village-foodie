import { useState, useRef } from 'react'
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

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastIdRef = useRef(0)
  const toastTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismissToast = (id: number) => {
    const t = toastTimers.current.get(id); if (t) clearTimeout(t); toastTimers.current.delete(id)
    setToasts(prev => prev.filter(x => x.id !== id))
  }
  const showToast: ShowToast = (msg, type = 'success', opts) => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, msg, type, action: opts?.action }])
    toastTimers.current.set(id, setTimeout(() => dismissToast(id), opts?.duration ?? 3500))
    return id
  }

  return { toasts, showToast, dismissToast }
}
