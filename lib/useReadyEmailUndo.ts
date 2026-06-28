import { useEffect, useRef } from 'react'
import type { ShowToast } from './useToasts'

// Shared "mark ready" deferred-email + undo machinery (extracted verbatim from the dashboard). Owns the
// per-order email timers, the 4s schedule, the undo (cancel email + revert status), and the
// beforeunload/unmount sendBeacon flush. Page-specifics are injected:
//   - refetch:        re-fetch the orders after an undo (dashboard fetchAll / KDS fetchAllRef.current).
//   - onUndoRestore:  optional page-specific revert side-effect (dashboard un-strikes its prep pills; KDS
//                     has none — the order simply re-appears in the cook view on refetch).
// The server side (action/route.ts: ready+defer_email, send_ready_email, undo_ready) is already shared,
// so KDS becomes a second consumer with no server change.
export function useReadyEmailUndo(opts: {
  token: string
  pin: string
  showToast: ShowToast
  refetch: () => void
  onUndoRestore?: (orderKey: string) => void
}) {
  const { token, pin, showToast, refetch, onUndoRestore } = opts
  // Per-order deferred "ready" email timers — each Ready click fires the customer email after a 4s undo
  // window (independent of which toast is visible). undo clears the order's timer; tab-close flushes them.
  const pendingReadyEmails = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Fire the deferred customer "ready" email for one order. keepalive so it survives a near-simultaneous
  // navigation; the server guards on status==='ready' so a raced undo sends nothing.
  const sendReadyEmail = (orderKey: string) => {
    fetch('/api/dashboard/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ token, pin, action: 'send_ready_email', order_key: orderKey }) }).catch(() => {})
  }
  // Schedule the ready email 4s out (the undo window). Per-order timer so multiple readies each fire at
  // their own 4s, independent of which toast is currently visible. Re-readying clears the prior timer.
  const scheduleReadyEmail = (orderKey: string) => {
    const ex = pendingReadyEmails.current.get(orderKey); if (ex) clearTimeout(ex)
    const t = setTimeout(() => { pendingReadyEmails.current.delete(orderKey); sendReadyEmail(orderKey) }, 4000)
    pendingReadyEmails.current.set(orderKey, t)
  }
  // Undo a ready: cancel the pending email (clear+delete the timer → it never sends), revert the status
  // (undo_ready), and run any page-specific restore. Mirrors undo_collected (minus the slot rebuild —
  // ready never freed a slot).
  const undoReady = (orderKey: string, displayId: string | number) => {
    const t = pendingReadyEmails.current.get(orderKey); if (t) clearTimeout(t); pendingReadyEmails.current.delete(orderKey)
    onUndoRestore?.(orderKey)
    fetch('/api/dashboard/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, pin, action: 'undo_ready', order_key: orderKey }) }).then(() => refetch()).catch(() => {})
    showToast(`Order #${displayId} reverted`)
  }
  // FLUSH on tab-close / unmount: any still-pending ready email is sent IMMEDIATELY via sendBeacon (a
  // normal fetch would be killed mid-unload). Clearing the timer first prevents a double-send; the
  // server's status==='ready' guard is the backstop.
  useEffect(() => {
    const flush = () => {
      pendingReadyEmails.current.forEach((timerId, orderKey) => {
        clearTimeout(timerId)
        try { navigator.sendBeacon?.('/api/dashboard/action', new Blob([JSON.stringify({ token, pin, action: 'send_ready_email', order_key: orderKey })], { type: 'application/json' })) } catch {}
      })
      pendingReadyEmails.current.clear()
    }
    window.addEventListener('beforeunload', flush)
    return () => { window.removeEventListener('beforeunload', flush); flush() }
  }, [token, pin])

  return { scheduleReadyEmail, undoReady }
}
