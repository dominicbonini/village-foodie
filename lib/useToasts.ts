import { useState, useRef } from 'react'

// Shared STACKED-toast system (extracted verbatim from the dashboard). An array so rapid successive
// actions (e.g. marking 2-3 orders ready) each get their OWN toast + timer; each auto-dismisses on its
// own timer (toastTimers, keyed by id). dismissToast removes one; showToast PUSHES one (does not replace).
// Consumed by the dashboard now, KDS + manage later — pair with <ToastStack> for the render.

export type ToastAction = { label: string; run: () => void }
export type Toast = { id: number; msg: string; type: 'success' | 'error'; action?: ToastAction }
// showToast keeps the original signature so every existing caller is unchanged.
export type ShowToast = (
  msg: string,
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
