'use client'
// components/admin/ConfirmDeleteDialog.tsx
//
// 🔴 THIS IS A MOVE, NOT A SECOND DIALOG. It is the media-delete confirmation that has been live in
// OutreachPanel, lifted out verbatim so the events table can use the SAME one. The alternative was a
// second implementation, and app manual §51.7 records what that costs: a "reuse" that was really a
// fourth independent copy. Two destructive confirmations that drift apart is exactly that mistake.
//
// WHAT CHANGED IN THE MOVE: the hard-coded `kind: 'logo' | 'photo'` became `title` / `confirmLabel`, and
// the fixed sentence "This cannot be undone." became `children`, because the events caller needs a
// DIFFERENT sentence for a future-dated row. Nothing else moved: focus, Escape, backdrop, the busy lock
// and the in-place error are byte-for-byte the behaviour the media path already had.
//
// 🔴 HOW ESCAPE IS KEPT FROM CLOSING THE MODAL UNDERNEATH. A parent modal listens with
// `window.addEventListener('keydown', onKey)` — BUBBLE phase at window. This dialog listens on the same
// target with `{ capture: true }`. The capture phase at window runs BEFORE any bubble-phase listener on
// window, whatever order they registered in, so this one always sees Escape first and calls
// `stopPropagation()`, which ends the event before the parent's listener is ever reached.
// ⚠️ Registration order is NOT relied on — that would be a coin toss between two window listeners.
import { useEffect, useRef, useState, type ReactNode } from 'react'

export default function ConfirmDeleteDialog({
  title, confirmLabel, busyLabel = 'Deleting…', children, onCancel, onConfirm,
}: {
  title: string
  confirmLabel: string
  busyLabel?: string
  children: ReactNode
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Cancel is the safe default and takes focus on open, so Enter and Space do the harmless thing.
  useEffect(() => { cancelRef.current?.focus() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  const run = async () => {
    if (busy) return
    setBusy(true); setErr(null)
    try { await onConfirm() }
    catch (e: any) {
      // 🔴 THE SERVER'S OWN SENTENCE IS SHOWN IN PLACE, IN FULL. A refused delete is the path least
      // likely to be exercised, so it must not degrade to a generic "failed" or close silently.
      setErr(e?.message || 'Could not remove it.')
      setBusy(false)
      return
    }
    setBusy(false)
  }

  return (
    // z-[70] clears a parent modal (z-50) and the toast (z-[60]).
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"
      onClick={onCancel} role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-del-title"
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
        <h4 id="confirm-del-title" className="text-base font-semibold text-slate-900">{title}</h4>
        {children}

        {err && (
          <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 whitespace-pre-wrap">
            {err}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button ref={cancelRef} onClick={onCancel}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400">
            Cancel
          </button>
          <button onClick={run} disabled={busy}
            className="text-sm font-bold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-400">
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
