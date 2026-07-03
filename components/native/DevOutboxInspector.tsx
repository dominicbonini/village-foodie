'use client'
// ── DEV-ONLY OUTBOX INSPECTOR ─────────────────────────────────────────────────────────────────────────
// A live view of the durable offline outbox (hg_outbox_* in Preferences) so we can SEE stuck/poison ops
// instead of guessing. dev/non-production + isNativeApp gated (renders null otherwise — never ships to
// operators). Floating pill bottom-RIGHT (DevOfflineToggle is bottom-left). Polls every 1.5s so you can
// watch an op change state across a drain. Read-only except:
//   • Clear outbox — wipes ALL hg_outbox_* ops. SAFE: an op's server effect is already applied (idempotent
//     replay), so clearing only drops local bookkeeping. Use it to clear poison ops from earlier testing.
import { useEffect, useState, useCallback } from 'react'
import { isNativeApp } from '@/lib/native/device'
import { listOps, clearAllOps, type OutboxOp } from '@/lib/native/outbox'

const IS_PROD = process.env.NODE_ENV === 'production'

export function DevOutboxInspector() {
  const [ops, setOps] = useState<OutboxOp[]>([])
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async () => { setOps(await listOps()) }, [])

  useEffect(() => {
    if (IS_PROD || !isNativeApp()) return
    void refresh()
    const id = setInterval(() => { void refresh() }, 1500)   // live
    return () => clearInterval(id)
  }, [refresh])

  if (IS_PROD || !isNativeApp()) return null

  const stateColor = (s: OutboxOp['state']) =>
    s === 'conflict' ? 'text-red-400' : s === 'syncing' ? 'text-amber-300' : 'text-slate-300'
  const actionOf = (o: OutboxOp) => String((o.body as Record<string, unknown>)?.action ?? '—')

  return (
    <div className="fixed right-2 z-[9999] max-w-[92vw]" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
      {open ? (
        <div className="w-[330px] max-h-[55vh] overflow-y-auto rounded-xl border border-slate-600 bg-slate-900/95 p-2 text-[11px] text-slate-200 shadow-2xl">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-black">📦 Outbox ({ops.length})</span>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => void refresh()} className="text-slate-400" aria-label="Refresh">↻</button>
              <button type="button" onClick={() => { void (async () => { await clearAllOps(); await refresh() })() }}
                className="font-bold text-red-400">Clear</button>
              <button type="button" onClick={() => setOpen(false)} className="font-bold text-slate-400" aria-label="Close">✕</button>
            </div>
          </div>
          {ops.length === 0 ? (
            <p className="py-1 text-slate-500">empty ✓</p>
          ) : ops.map(o => (
            <div key={o.op_id} className="border-t border-slate-700 py-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{o.kind} · {actionOf(o)}</span>
                <span className={`font-bold ${stateColor(o.state)}`}>{o.state} ×{o.attempts}</span>
              </div>
              <div className="truncate text-slate-400">key {o.order_key.slice(0, 8)} · op {o.op_id.slice(0, 6)} · seq {o.seq}{o.provisional_id ? ` · #${o.provisional_id}` : ''}</div>
              {o.last_error && <div className="truncate text-red-300">⚠ {o.last_error}</div>}
            </div>
          ))}
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className={`rounded-full border px-3 py-1.5 text-xs font-black shadow-lg ${
            ops.some(o => o.state === 'conflict') ? 'border-red-500 bg-red-600 text-white'
            : ops.length > 0 ? 'border-amber-500 bg-amber-500 text-white'
            : 'border-slate-600 bg-slate-800/90 text-slate-200'
          }`}>
          📦 {ops.length}
        </button>
      )}
    </div>
  )
}
