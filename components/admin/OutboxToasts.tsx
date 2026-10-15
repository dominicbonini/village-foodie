'use client'
// components/admin/OutboxToasts.tsx — the toast for an instant Send, and the page's one outbox.
//
// 🔴 ONE OUTBOX PER TAB, NOT PER COMPONENT (15 October 2026, docs/outreach-instant-send-report.md). The
// compose window closes the moment Send is pressed, so the held send cannot belong to it: it lives here,
// at module scope, and survives moving between the prospect page and the outreach list. The toast is
// drawn by whichever of those two pages is on screen (they are never both mounted).
// ⚠️ THE TOAST IS THE ONLY PLACE A VERDICT IS SHOWN WHILE IT IS FRESH; the lasting record is the message
// row — a refusal or a failure is in Today's "Emails needing a look" with its reason.
import { useEffect, useSyncExternalStore } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { nativeAuthHeader } from '@/lib/native/session'
import { prospectPath } from '@/lib/outreach-queue'
import { createOutbox, type Outbox, type OutboxEntry } from '@/lib/outreach-outbox'

let shared: Outbox | null = null
/** The tab's outbox, made on first use in the browser. */
export function getOutbox(): Outbox {
  if (shared) return shared
  shared = createOutbox({
    post: async body => {
      const r = await fetch('/api/admin/outreach/mail-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() }, body: JSON.stringify(body),
      })
      return (await r.json().catch(() => ({ ok: false, refusal: `The server answered ${r.status}.` }))) as Record<string, unknown>
    },
    check: async (prospectId, rowId) => {
      const r = await fetch(`/api/admin/outreach/mail-send?prospect_id=${encodeURIComponent(prospectId)}`, { headers: { ...await nativeAuthHeader() } })
      const j = await r.json().catch(() => ({})) as { messages?: Record<string, unknown>[] }
      return (j.messages ?? []).find(m => m.id === rowId) ?? null
    },
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: h => window.clearTimeout(h as number),
  })
  return shared
}

const EMPTY: readonly OutboxEntry[] = []
/** Every entry, live. */
export function useOutbox(): readonly OutboxEntry[] {
  return useSyncExternalStore(
    fn => getOutbox().subscribe(fn),
    () => getOutbox().list(),
    () => EMPTY,
  )
}

export default function OutboxToasts() {
  const entries = useOutbox()
  const router = useRouter()
  const pathname = usePathname()

  // 🔴 A SENT TOAST GOES BY ITSELF; one with a notice, a refusal or an uncertain send stays until closed.
  useEffect(() => {
    const done = entries.filter(e => e.phase === 'sent' && !e.notice)
    if (!done.length) return
    const h = window.setTimeout(() => { for (const e of done) getOutbox().dismiss(e.key) }, 6_000)
    return () => window.clearTimeout(h)
  }, [entries])

  // ⚠️ Mounted by the prospect page and the outreach list, which are never on screen together.
  if (entries.length === 0) return null
  const who = (e: OutboxEntry) => e.prospectName ?? 'the prospect'
  const open = (e: OutboxEntry) => { if (pathname !== prospectPath(e.prospectId)) router.push(prospectPath(e.prospectId)) }

  return (
    <div className="fixed bottom-4 left-4 z-[60] flex flex-col gap-2 max-w-sm" role="status" aria-live="polite" data-outbox>
      {entries.map(e => (
        <div key={e.key} data-phase={e.phase}
          className={`rounded-lg shadow-lg px-3 py-2 text-sm ${e.phase === 'not_sent' ? 'bg-red-50 border border-red-300 text-red-900'
            : e.phase === 'uncertain' ? 'bg-amber-50 border border-amber-300 text-amber-900' : 'bg-slate-900 text-white'}`}>
          <div className="flex items-center gap-3">
            {e.phase === 'waiting' && (
              <>
                <span className="flex-1">{e.test ? 'Sending test…' : 'Sending…'}</span>
                {/* 🔴 UNDO: nothing has been sent; the compose window comes back exactly as it was. */}
                <button type="button" data-undo
                  onClick={() => { if (getOutbox().undo(e.key)) open(e) }}
                  className="font-bold underline underline-offset-2 hover:text-orange-200">Undo</button>
              </>
            )}
            {e.phase === 'sending' && <span className="flex-1">{e.test ? 'Sending test…' : 'Sending…'}</span>}
            {e.phase === 'sent' && <span className="flex-1">{e.message}</span>}
            {(e.phase === 'not_sent' || e.phase === 'uncertain') && (
              <span className="flex-1 font-bold">
                {e.phase === 'not_sent' ? 'Not sent' : 'May have been sent'} — see{' '}
                <a href={prospectPath(e.prospectId)} onClick={ev => { ev.preventDefault(); open(e) }}
                  className="underline underline-offset-2">{who(e)}</a>
              </span>
            )}
            {e.phase !== 'waiting' && e.phase !== 'sending' && (
              <button type="button" aria-label="Close" onClick={() => getOutbox().dismiss(e.key)}
                className="opacity-70 hover:opacity-100 font-bold">✕</button>
            )}
          </div>
          {(e.phase === 'not_sent' || e.phase === 'uncertain') && e.message && (
            <p className="mt-0.5 text-[12px]">{e.message}</p>
          )}
          {/* The smaller line: the email COUNTS AS SENT; a step after it did not complete. */}
          {e.phase === 'sent' && e.notice && <p className="mt-0.5 text-[12px] text-amber-200">{e.notice}</p>}
        </div>
      ))}
    </div>
  )
}
