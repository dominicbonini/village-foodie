// lib/outreach-refusal.ts — a send the server declined, recorded so the prospect can be flagged.
//
// 🔴 WHY THIS EXISTS (15 October 2026, docs/outreach-instant-send-report.md). Send is instant with Undo:
// the compose window has closed by the time the server answers, so a refusal can no longer be shown IN the
// window. It is recorded as an `outreach_messages` row with status `refused` and lands in the Today
// screen's existing "Emails needing a look" list — the one place outbound problems already go.
// ⚠️ A REFUSED ROW IS NOT AN EMAIL. Nothing was sent: the guards' prior sends, the last-email date, the
// pairing and the thread parent all leave it out, and Retry never takes it (Retry skips the guards).
// ⚠️ PURE. No database; the route does the writes.

export interface RefusalGuard { id: string; kind: string; message: string }
export interface StoredRefusal {
  reason: string
  /** The guard sentences exactly as the compose window showed them; non-empty ⇒ "Send anyway" is offered. */
  guards: RefusalGuard[]
  /** The send request, re-submitted by "Send anyway" through every guard again. */
  request: Record<string, unknown>
}

/** The fields of a send request that make up the message. Nothing else is stored. */
const REQUEST_KEYS = ['subject', 'kind', 'document', 'attachments', 'reply_to_message_id', 'to', 'include_quote', 'is_test'] as const
export function storedRequestOf(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of REQUEST_KEYS) if (body[k] !== undefined) out[k] = body[k]
  return out
}

/** "Not sent: …" — the one sentence the Today list, the timeline and the toast all show. */
export function notSentLine(reason: string): string {
  const r = String(reason ?? '').trim().replace(/\.$/, '')
  return r ? `Not sent: ${r}` : 'Not sent'
}

/** A stored `refusal` value, or null when it is not one. */
export function parseRefusal(v: unknown): StoredRefusal | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.reason !== 'string') return null
  const guards = Array.isArray(o.guards)
    ? (o.guards as unknown[]).filter((g): g is RefusalGuard => !!g && typeof g === 'object'
      && typeof (g as RefusalGuard).id === 'string' && typeof (g as RefusalGuard).message === 'string')
    : []
  const request = o.request && typeof o.request === 'object' ? o.request as Record<string, unknown> : {}
  return { reason: o.reason, guards, request }
}

/**
 * 🔴 WHAT HAPPENED AFTER THE SEND, from the message row. The send answers before the Sent copy and the
 * contact log run, so the toast asks the row a moment later. `done` is false until both have finished.
 *   notice — the smaller line: the email COUNTS AS SENT, and this step did not complete.
 */
export function postSendState(row: {
  status?: string | null; is_test?: boolean | null; sent_copy?: string | null
  last_error?: string | null; contact_id?: string | null
}): { done: boolean; notice: string | null } {
  if (row.status !== 'sent') return { done: true, notice: null }
  const err = String(row.last_error ?? '')
  const copyDone = row.sent_copy === 'server_filed' || row.sent_copy === 'appended' || err.startsWith('sent copy:')
  const logDone = row.is_test === true || !!row.contact_id || err.startsWith('sent, not logged')
  const notices: string[] = []
  if (err.startsWith('sent copy:')) notices.push('it is not in your Sent folder (use Save to Sent on the prospect)')
  if (err.startsWith('sent, not logged')) notices.push('it was not logged as a contact (use “log it” on the prospect)')
  if (err.startsWith('post-send:')) notices.push(`a step after sending failed — ${err.replace(/^post-send:\s*/, '')}`)
  return { done: (copyDone && logDone) || err.startsWith('post-send:'), notice: notices.length ? `Sent — but ${notices.join(', and ')}.` : null }
}
