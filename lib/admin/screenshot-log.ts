// lib/admin/screenshot-log.ts
//
// The persistent screenshot log, and the rule for when an outage emails Dominic. Pure functions only.
//
// ── 🔴 WHAT IS AND IS NOT RECORDED ───────────────────────────────────────────────────────────────────
// One row per PROCESSED screenshot: when, the file's name and size, what it was classified as, what
// happened, the one-line summary the results row shows, the ids it touched, how many events were
// written, and the error text if any. NO IMAGE — the tab still stores nothing server-side, which is the
// standing rule of this surface — and no extracted personal data beyond what the summary already shows.
// ⚠️ THE SUMMARY ITSELF NAMES AN EMAIL AND A PHONE NUMBER ("Added email a@b.com, mobile 07400 049108"),
// because it is the line the admin reads. That is the one place contact data lands in this table, it is
// the same string shown on screen, and the table is service-role only. Said plainly here so nobody
// later believes the table is free of personal data.
//
// ── 🔴 WHY THE ALERT RULE IS A PURE FUNCTION OVER TIMESTAMPS ────────────────────────────────────────
// This reuses the one existing "alert once per outage" pattern in the repo: `decideAdminAlert` in
// lib/custom-domain/check.ts:157. That one keeps NO "alerted" flag either — it derives the transition
// from `last_ok_at` vs `last_checked_at`, because a flag is state that can be left set after a deploy,
// a retry or a manual fix. Same shape here: the log's own rows are the state, and the question
// "has an alert gone out since the last success?" is answered by reading two timestamps off it.

export const SCREENSHOT_OUTCOMES = [
  'schedule', 'updated', 'new_truck', 'nothing_new', 'needs_a_look', 'failed',
] as const
export type ScreenshotOutcome = (typeof SCREENSHOT_OUTCOMES)[number]

/** 'reading' is a CLIENT-ONLY state — a row in flight has not been processed, so it is never logged. */
export const OUTCOME_CHIP: Record<ScreenshotOutcome, string> = {
  schedule: 'Schedule',
  updated: 'Updated',
  new_truck: 'New truck',
  nothing_new: 'Nothing new',
  needs_a_look: 'Needs a look',
  failed: 'Failed',
}

export type LogRow = {
  id: string
  created_at: string
  file_name: string | null
  file_size: number | null
  kind: string | null                 // schedule | truck_details | both | neither
  outcome: ScreenshotOutcome
  summary: string | null
  prospect_id: string | null
  truck_id: string | null
  events_written: number | null
  error: string | null
  alerted_at: string | null
}

/* ─────────────────────────── 1. GROUPING AND COUNTS FOR THE LIST ─────────────────────────── */

export const LOG_WINDOW_DAYS = 7
export const LOG_RETENTION_DAYS = 90

const dayKey = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Today's rows first, then "Earlier" — the last 7 days, newest first.
 * ⚠️ "TODAY" IS THE VIEWER'S LOCAL DAY, not UTC. The admin reads this at 22:51 UK time; a UTC day
 * boundary would move half an evening's work into "Earlier" during BST.
 * ⚠️ A row OLDER than the window is dropped from the list but is still in the table — the list is a
 * view, not the retention rule.
 */
export function groupLogRows(rows: LogRow[], now: Date = new Date()): { today: LogRow[]; earlier: LogRow[] } {
  const todayKey = dayKey(now.toISOString())
  const cutoff = now.getTime() - LOG_WINDOW_DAYS * 86400000
  const sorted = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  const today: LogRow[] = []
  const earlier: LogRow[] = []
  for (const r of sorted) {
    const t = new Date(r.created_at).getTime()
    if (Number.isNaN(t)) continue
    if (dayKey(r.created_at) === todayKey) today.push(r)
    else if (t >= cutoff) earlier.push(r)
  }
  return { today, earlier }
}

/** Counts for the filter chips, over exactly the rows the list is showing. */
export function chipCounts(rows: LogRow[]): Record<'all' | ScreenshotOutcome, number> {
  const out = {
    all: rows.length, schedule: 0, updated: 0, new_truck: 0, nothing_new: 0, needs_a_look: 0, failed: 0,
  }
  for (const r of rows) if (r.outcome in OUTCOME_CHIP) out[r.outcome]++
  return out
}

/* ─────────────────────────── 2. SIMPLE VERSUS COMPLETE FAILURE ─────────────────────────── */

export type FailureKind = 'content' | 'transport' | 'auth_or_quota' | 'database' | 'migration'

/**
 * 🔴 WHAT KIND OF WRONG IS THIS. The split decides whether Dominic's phone buzzes.
 *
 * 'content'        — this image. Unreadable, no details in it, a safety filter, unparseable JSON.
 * 'transport'      — the call failed for a reason that is not about the image: 5xx, 503, a socket.
 *                    ONE of these is simple; three in a row is an outage.
 * 'auth_or_quota'  — the key is wrong or the quota is gone. Nothing will work until it is fixed.
 * 'database'       — a write failed. Nothing will work.
 * 'migration'      — a column or table this path needs is not there yet.
 *
 * ⚠️ MATCHED ON THE MESSAGE, AND ORDERED MOST-SPECIFIC FIRST, because the messages come from three
 * different places (our own throws, Gemini's HTTP text, PostgREST). A 429 is quota, not transport,
 * even though it arrives as an HTTP status like one.
 */
export function failureKind(message: string | null | undefined): FailureKind {
  const m = String(message ?? '').toLowerCase()
  if (!m) return 'content'
  if (m.includes('migration')) return 'migration'
  if (/\b(401|403|429)\b/.test(m) || m.includes('api key') || m.includes('api_key')
    || m.includes('quota') || m.includes('permission_denied') || m.includes('resource_exhausted')
    || m.includes('unauthenticated') || m.includes('billing')) return 'auth_or_quota'
  if (m.includes('could not read') || m.includes('insert') || m.includes('postgrest')
    || m.includes('database') || /\[\d{5}\]/.test(m)) return 'database'
  if (/\b(5\d{2})\b/.test(m) || m.includes('after 3 attempts') || m.includes('fetch failed')
    || m.includes('timeout') || m.includes('socket') || m.includes('econnreset')) return 'transport'
  return 'content'
}

/** Three consecutive non-content failures is an outage, per the brief. */
export const CONSECUTIVE_LIMIT = 3

export type FailureVerdict =
  | { severity: 'simple'; kind: FailureKind }
  | { severity: 'complete'; kind: FailureKind; reason: string }

/**
 * 🔴 `consecutiveNonContent` IS THE COUNT INCLUDING THIS FAILURE, and the caller resets it to 0 on every
 * success. A counter that only ever goes up would turn the third failure of the day into an outage even
 * with fifty successes between them.
 */
export function classifyFailure(message: string | null | undefined, consecutiveNonContent: number): FailureVerdict {
  const kind = failureKind(message)
  if (kind === 'auth_or_quota') return { severity: 'complete', kind, reason: 'Google would not accept the request — the Gemini API key or its quota needs looking at.' }
  if (kind === 'database') return { severity: 'complete', kind, reason: 'A database write failed, so nothing can be filed.' }
  if (kind === 'migration') return { severity: 'complete', kind, reason: 'A migration this tab needs has not been run yet.' }
  if (kind !== 'content' && consecutiveNonContent >= CONSECUTIVE_LIMIT) {
    return { severity: 'complete', kind, reason: `${consecutiveNonContent} files in a row failed for a reason that is not about their contents.` }
  }
  return { severity: 'simple', kind }
}

/* ─────────────────────────── 3. ONE EMAIL PER OUTAGE ─────────────────────────── */

/** 🔴 A CONSTANT, NOT AN ENV VAR, for the reason `ADMIN_ALERT_TO` is one (lib/custom-domain/alert.ts:20). */
export const SCREENSHOT_ALERT_TO = 'dominic@hatchgrab.com'
export const SCREENSHOT_ALERT_SUBJECT = 'HatchGrab screenshots: processing stopped'

export type AlertState = {
  /** When a file last processed without a complete failure. Null = never. */
  lastSuccessAt: string | null
  /** When an alert was last sent. Null = never. */
  lastAlertAt: string | null
}

/**
 * Should this complete failure send an email?
 *
 * 🔴 ONE PER OUTAGE, AND THE NEXT ONE CAN ONLY FIRE AFTER A SUCCESS. Both halves are the brief's.
 * An alert is due when no alert has gone out since the last successful file:
 *   • never alerted                        → due
 *   • alerted, and a success came after it → due (this is a new outage)
 *   • alerted, and no success since        → NOT due (same outage, still broken)
 *
 * ⚠️ NO SUCCESS EVER RECORDED AND AN ALERT ALREADY SENT ⇒ NOT DUE. The very first outage on a fresh
 * install would otherwise alert on every file forever, since there is no success to compare against.
 * This is the same reasoning as `decideAdminAlert`'s "no previous check ⇒ not crossed before" branch,
 * with the comparison the other way round.
 */
export function alertIsDue(state: AlertState): boolean {
  if (!state.lastAlertAt) return true
  if (!state.lastSuccessAt) return false
  return new Date(state.lastSuccessAt).getTime() > new Date(state.lastAlertAt).getTime()
}

/** Derive the alert state from the log rows themselves — see the module header on why there is no flag. */
export function alertStateFrom(rows: LogRow[]): AlertState {
  let lastSuccessAt: string | null = null
  let lastAlertAt: string | null = null
  for (const r of rows) {
    if (r.outcome !== 'failed' && (!lastSuccessAt || r.created_at > lastSuccessAt)) lastSuccessAt = r.created_at
    if (r.alerted_at && (!lastAlertAt || r.alerted_at > lastAlertAt)) lastAlertAt = r.alerted_at
  }
  return { lastSuccessAt, lastAlertAt }
}

/**
 * The alert email. Plain words, the time, and how many files are waiting — nothing else, and no image.
 * ⚠️ `waiting` IS THE QUEUE LENGTH THE BROWSER REPORTS. The server cannot know it: the queue lives in
 * the tab. It is passed in, and when it is absent the sentence is left out rather than guessed.
 */
export function screenshotAlertEmail(args: { reason: string; at: Date; waiting: number | null }): { subject: string; text: string; html: string } {
  const time = args.at.toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })
  const lines = [
    'Screenshot processing has paused.',
    '',
    args.reason,
    '',
    `Time: ${time}`,
  ]
  if (args.waiting !== null) lines.push(`Files still waiting: ${args.waiting}`)
  lines.push('', 'Open the Screenshots tab in the admin console to retry.')
  const text = lines.join('\n')
  const html = lines.map(l => (l === '' ? '<p></p>' : `<p style="margin:0 0 8px">${escapeHtml(l)}</p>`)).join('')
  return { subject: SCREENSHOT_ALERT_SUBJECT, text, html }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/* ─────────────────────────── 4. THE "IS IT RUNNING" LINE ─────────────────────────── */

/**
 * "Processing 3 of 12 · 9 waiting" — built here so the wording has one owner and the harness can pin it.
 * ⚠️ `done` IS 1-BASED FOR DISPLAY: while the third file is in flight, 2 are finished, and the line must
 * read "Processing 3 of 12", not 2.
 */
export function progressLine(args: { finished: number; running: boolean; total: number }): string | null {
  const { finished, running, total } = args
  if (total === 0) return null
  if (!running) return null
  const waiting = Math.max(0, total - finished - 1)
  const parts = [`Processing ${finished + 1} of ${total}`]
  if (waiting > 0) parts.push(`${waiting} waiting`)
  return parts.join(' · ')
}

/** "Last processed 22:51" — local time, or null when nothing has processed yet. */
export function lastProcessedLine(at: string | Date | null): string | null {
  if (!at) return null
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) return null
  return `Last processed ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}
