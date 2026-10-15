// lib/outreach-outbox.ts — Send is instant: held for five seconds with Undo, then sent once.
//
// 🔴 WHAT IT IS (15 October 2026, docs/outreach-instant-send-report.md). Pressing Send closes the compose
// window at once and puts the message here. For five seconds it is only HELD — "Sending… Undo" — and
// Undo hands back exactly what was in the window. Then the request goes out, carrying the idempotency
// key made at the press, so a retry or a second press can never send twice (the server refuses a repeat
// key). The SERVER still decides: every guard runs there, before the mail server is contacted.
// ⚠️ THE HOLD LIVES IN THIS PAGE. Closing the tab inside the five seconds sends nothing — the same as Undo.
// ⚠️ PURE OF REACT AND OF fetch. Timers, the request and the follow-up read are passed in, so the harness
// can stand on either side of the five seconds without waiting for them.
import { notSentLine, postSendState } from '@/lib/outreach-refusal'

export const UNDO_MS = 5_000
/** When to ask the row whether the Sent copy and the contact log (which run after the answer) finished. */
export const POST_SEND_CHECKS_MS = [4_000, 9_000, 20_000, 40_000]

export type OutboxPhase = 'waiting' | 'sending' | 'sent' | 'not_sent' | 'uncertain'

export interface OutboxEntry {
  /** The idempotency key — made when Send was pressed, and the entry's identity. */
  key: string
  prospectId: string
  prospectName: string | null
  test: boolean
  subject: string
  /** Who it is going to, for the toast and the "Sending…" row. */
  to: string | null
  /** The send request, exactly as the compose window built it. */
  request: Record<string, unknown>
  /** What Undo gives back to the compose window. Opaque here. */
  snapshot: unknown
  phase: OutboxPhase
  /** The sentence the toast shows once the server has answered. */
  message: string | null
  /** The smaller line: sent, but a step after the send did not complete. */
  notice: string | null
  /** The `outreach_messages` row the server answered with. */
  rowId: string | null
  queuedAt: number
}

export interface OutboxDeps {
  post: (body: Record<string, unknown>) => Promise<Record<string, unknown>>
  /** Read one message row back, for the after-send notice. Absent ⇒ no notice is looked for. */
  check?: (prospectId: string, rowId: string) => Promise<Record<string, unknown> | null>
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (h: unknown) => void
  now?: () => number
  delayMs?: number
  checksMs?: number[]
}

/**
 * 🔴 THE SERVER'S ANSWER, IN ONE PLACE. Every shape the route can return, and what the toast says.
 * ⚠️ `duplicate` is the repeat-key answer: the FIRST send's status, never a second email.
 */
export function verdictOf(json: Record<string, unknown>, test: boolean, to: string | null):
  { phase: Exclude<OutboxPhase, 'waiting' | 'sending'>; message: string; rowId: string | null } {
  const rowId = typeof json.id === 'string' ? json.id : null
  const status = typeof json.status === 'string' ? json.status : null
  if (json.duplicate === true) {
    if (status === 'sent') return { phase: 'sent', message: 'Already sent — this exact send went once.', rowId }
    if (status === 'refused' || status === 'failed') return { phase: 'not_sent', message: notSentLine(String(json.last_error ?? 'it was refused')), rowId }
    return { phase: 'uncertain', message: 'May have been sent — check the prospect before sending again.', rowId }
  }
  if (json.needsConfirm === true) {
    return { phase: 'not_sent', message: `${notSentLine(String(json.refusal ?? 'a warning needs your OK'))} — answer it on the prospect (Send anyway).`, rowId }
  }
  if (json.ok !== true) {
    if (status === 'uncertain') return { phase: 'uncertain', message: 'May have been sent — check your Sent folder before retrying.', rowId }
    if (status === 'failed') return { phase: 'not_sent', message: notSentLine(`the mail server refused it${json.error ? ` (${String(json.error)})` : ''}`), rowId }
    return { phase: 'not_sent', message: notSentLine(String(json.refusal ?? json.message ?? 'it was refused')), rowId }
  }
  return { phase: 'sent', message: test ? 'Test sent to your own address.' : `Sent${to ? ` to ${to}` : ''}.`, rowId }
}

export interface Outbox {
  queue(input: Omit<OutboxEntry, 'phase' | 'message' | 'notice' | 'rowId' | 'queuedAt'>): OutboxEntry
  /** True when the send was still held and is now cancelled. False once it has gone out. */
  undo(key: string): boolean
  dismiss(key: string): void
  list(): readonly OutboxEntry[]
  subscribe(fn: () => void): () => void
  /** Undo's hand-back, for whichever compose window is (or will be) on that prospect. */
  onRestore(fn: (entry: OutboxEntry) => void): () => void
  takeRestore(prospectId: string): OutboxEntry | null
  /** Look without taking — for a lazy React initialiser, which StrictMode may run twice. */
  peekRestore(prospectId: string): OutboxEntry | null
  /** Called with each entry the moment the server has answered for it. */
  onSettled(fn: (entry: OutboxEntry) => void): () => void
}

export function createOutbox(deps: OutboxDeps): Outbox {
  const delay = deps.delayMs ?? UNDO_MS
  const now = deps.now ?? (() => Date.now())
  let entries: OutboxEntry[] = []
  const timers = new Map<string, unknown>()
  const listeners = new Set<() => void>()
  const restoreListeners = new Set<(e: OutboxEntry) => void>()
  const settledListeners = new Set<(e: OutboxEntry) => void>()
  const restores = new Map<string, OutboxEntry>()

  const emit = () => { for (const l of listeners) l() }
  const patch = (key: string, p: Partial<OutboxEntry>) => {
    entries = entries.map(e => (e.key === key ? { ...e, ...p } : e))
    emit()
  }
  const get = (key: string) => entries.find(e => e.key === key) ?? null

  const followUp = (key: string, i = 0) => {
    const e = get(key); const checks = deps.checksMs ?? POST_SEND_CHECKS_MS
    if (!e || !e.rowId || !deps.check || i >= checks.length) return
    deps.setTimer(async () => {
      const cur = get(key)
      if (!cur || !cur.rowId) return
      let row: Record<string, unknown> | null = null
      try { row = await deps.check!(cur.prospectId, cur.rowId) } catch { row = null }
      const st = row ? postSendState(row) : { done: false, notice: null }
      if (st.notice) patch(key, { notice: st.notice })
      if (!st.done) followUp(key, i + 1)
    }, checks[i])
  }

  const fire = async (key: string) => {
    timers.delete(key)
    const e = get(key)
    if (!e || e.phase !== 'waiting') return
    patch(key, { phase: 'sending' })
    let v: ReturnType<typeof verdictOf>
    try {
      v = verdictOf(await deps.post(e.request), e.test, e.to)
    } catch {
      // 🔴 A DEAD CONNECTION SAYS NOTHING ABOUT THE EMAIL — the row is the truth, so look before resending.
      v = { phase: 'uncertain', message: 'The connection dropped before the server answered. It may have been sent — check the prospect before sending again.', rowId: null }
    }
    patch(key, { phase: v.phase, message: v.message, rowId: v.rowId })
    const settled = get(key)
    if (settled) for (const l of settledListeners) l(settled)
    if (v.phase === 'sent') followUp(key)
  }

  return {
    queue(input) {
      const entry: OutboxEntry = { ...input, phase: 'waiting', message: null, notice: null, rowId: null, queuedAt: now() }
      entries = [...entries.filter(e => e.key !== entry.key), entry]
      timers.set(entry.key, deps.setTimer(() => { void fire(entry.key) }, delay))
      emit()
      return entry
    },
    undo(key) {
      const e = get(key)
      if (!e || e.phase !== 'waiting') return false
      const h = timers.get(key)
      if (h !== undefined) deps.clearTimer(h)
      timers.delete(key)
      entries = entries.filter(x => x.key !== key)
      restores.set(e.prospectId, e)
      emit()
      for (const l of restoreListeners) l(e)
      return true
    },
    dismiss(key) { entries = entries.filter(e => e.key !== key || e.phase === 'waiting' || e.phase === 'sending'); emit() },
    list: () => entries,
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
    onRestore(fn) { restoreListeners.add(fn); return () => { restoreListeners.delete(fn) } },
    takeRestore(prospectId) { const e = restores.get(prospectId) ?? null; restores.delete(prospectId); return e },
    peekRestore: prospectId => restores.get(prospectId) ?? null,
    onSettled(fn) { settledListeners.add(fn); return () => { settledListeners.delete(fn) } },
  }
}
