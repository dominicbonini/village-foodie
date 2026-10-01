// app/api/admin/screenshot-events/route.ts
//
// ADMIN ONLY. Drop a screenshot; it is classified, extracted and filed. Two kinds are understood:
// SCHEDULES (events for the trucks named in them — the behaviour that shipped first, unchanged) and
// TRUCK DETAILS (a Facebook page's contact panel, an About page — matched to a prospect and used to fill
// its empty fields). Replaces the Apps Script's processFoodTruckScreenshots. ⚠️ The Apps Script path is
// NOT removed and keeps running until its trigger is turned off; this writes `source = 'Admin Screenshot'`
// so the two stay separable in the data.
//
// ── 🔴 CLASSIFY FIRST, AND THE SCHEDULE PATH IS AN ALLOW-LIST ───────────────────────────────────────
// /api/inbound-schedule EMAILS the operator of a linked truck (that route, :233-293, awaited). A Facebook
// page screenshot is covered in post timestamps — "20 September at 18:18" — which a schedule prompt reads
// as events. So a details screenshot reaching that route emails a real person about events that never
// existed. `shouldRunSchedule` (lib/admin/truck-details.ts) is the one gate and it names the two classes
// allowed through rather than the one excluded.
// 🔴 THE SCHEDULE PATH ITSELF IS BYTE-IDENTICAL. Same `buildScreenshotPrompt`, same
// `parseScreenshotEvents`, same `filterScreenshotEvents`, same `toInboundEvents`, same POST body. The
// classification is a SEPARATE, cheaper call placed in front of it, precisely so none of that changed.
//
// ── 🔴 NOTHING IS STORED SERVER-SIDE EXCEPT A LOG LINE ──────────────────────────────────────────────
// The image is read from the request, passed to Gemini, and dropped when the request ends. No bucket, no
// object, no retention — and with logo extraction dropped, no crop either. What IS now persisted is one
// `screenshot_log` row per processed file: what it was, what happened, and the one-line summary. No image.
// ⚠️ THE BROWSER STILL HOLDS THE FILE, which is what makes a failed row re-runnable; the log is a record,
// not the queue.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { sendConfirmationEmail } from '@/lib/email'
import { addNote } from '@/lib/outreach-events'
import {
  buildScreenshotPrompt, parseScreenshotEvents, filterScreenshotEvents, toInboundEvents,
  type DroppedEvent,
} from '@/lib/admin/screenshot-events'
import {
  buildClassifyPrompt, parseClassification, shouldRunSchedule, shouldRunTruckDetails,
  buildTruckDetailsPrompt, parseTruckDetails, detailsAreEmpty, matchProspect, planFill, planIsEmpty,
  updatedSummary, newTruckSummary, type Classification, type TruckDetails, type MatchRow,
} from '@/lib/admin/truck-details'
import {
  applyFill, createHiddenTruckWithProspect, type TruckWriteDb,
} from '@/lib/admin/truck-details-write'
import {
  classifyFailure, alertIsDue, alertStateFrom, screenshotAlertEmail, SCREENSHOT_ALERT_TO,
  LOG_WINDOW_DAYS, type LogRow, type ScreenshotOutcome,
} from '@/lib/admin/screenshot-log'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`

export const MIGRATION_SOCIAL = 'run the facebook/instagram migration first'
export const MIGRATION_LOG = 'run the screenshot-log migration first'

/**
 * Retry shape taken from the Apps Script (orig :645-661): retry ONLY on 429/503, back off, and give up
 * after a bounded number of attempts. ⚠️ Three attempts and a shorter backoff, not five and 15s+15s —
 * this runs inside a serverless request with a wall-clock limit.
 * ⚠️ THE STATUS IS KEPT IN THE MESSAGE ON PURPOSE. `failureKind` reads it to tell a quota failure (429,
 * an outage) from a transport one (503, one bad file), so stripping it would merge two different alerts.
 */
async function callGemini(base64: string, mimeType: string, prompt: string): Promise<string> {
  const body = {
    contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  }
  let lastErr = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(GEMINI_URL('gemini-2.5-flash'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (res.ok) {
      const json = await res.json()
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
      // The Apps Script throws its own message here (orig :667) because an empty candidate list is what a
      // safety-filter block looks like. Same distinction kept: "no events" and "refused to answer" differ.
      if (!text) throw new Error('Gemini returned no candidates — the image may have triggered a safety filter')
      return text
    }
    lastErr = `Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`
    if (res.status !== 429 && res.status !== 503) throw new Error(lastErr)
    await new Promise(r => setTimeout(r, attempt * 2000))
  }
  throw new Error(`${lastErr} (after 3 attempts)`)
}

/* ─────────────────────────── CAPABILITY PROBES ─────────────────────────── */

/**
 * 🔴 BOTH MIGRATIONS ARE APPLIED BY HAND, so the page must work before they are run. Same probe shape as
 * `columnExists` (api/admin/outreach/route.ts:169) and the `outreach_events.updated_at` probe
 * (api/admin/outreach/timeline/route.ts:230): ask for the thing, and read the error.
 * ⚠️ ONE PROBE FOR THE PAIR of social columns — they ship in one migration, so they are present or absent
 * together, and two probes would be two round trips to learn one fact.
 */
async function socialColumnsReady(): Promise<boolean> {
  const { error } = await supabase.from('discovery_trucks').select('facebook_url, instagram_url').limit(1)
  return !error
}

async function logTableReady(): Promise<boolean> {
  const { error } = await supabase.from('screenshot_log').select('id').limit(1)
  return !error
}

/* ─────────────────────────── THE LOG ─────────────────────────── */

type LogInput = {
  fileName: string
  fileSize: number | null
  kind: Classification | null
  outcome: ScreenshotOutcome
  summary: string | null
  prospectId: string | null
  truckId: string | null
  eventsWritten: number | null
  error: string | null
  alertedAt: string | null
}

/**
 * ⚠️ A FAILED LOG WRITE NEVER FAILS THE FILE. The screenshot has already been processed and its result is
 * already going back to the browser; refusing it because the history line did not land would throw away
 * real work to protect a record of it.
 */
async function writeLog(hasLog: boolean, row: LogInput): Promise<string | null> {
  if (!hasLog) return null
  const { data, error } = await supabase.from('screenshot_log').insert({
    file_name: row.fileName,
    file_size: row.fileSize,
    kind: row.kind,
    outcome: row.outcome,
    summary: row.summary,
    prospect_id: row.prospectId,
    truck_id: row.truckId,
    events_written: row.eventsWritten,
    error: row.error,
    alerted_at: row.alertedAt,
  }).select('id').single()
  if (error) {
    console.error('[screenshot-events] log write failed:', error.message)
    return null
  }
  return (data as { id?: string } | null)?.id ?? null
}

async function recentLog(hasLog: boolean): Promise<LogRow[]> {
  if (!hasLog) return []
  const since = new Date(Date.now() - LOG_WINDOW_DAYS * 86400000).toISOString()
  const { data, error } = await supabase.from('screenshot_log')
    .select('id, created_at, file_name, file_size, kind, outcome, summary, prospect_id, truck_id, events_written, error, alerted_at')
    .gte('created_at', since).order('created_at', { ascending: false }).limit(500)
  if (error) {
    console.error('[screenshot-events] log read failed:', error.message)
    return []
  }
  return (data ?? []) as LogRow[]
}

/**
 * Send the outage email, at most once per outage.
 *
 * 🔴 WITHOUT THE LOG TABLE, NO EMAIL IS SENT — a banner only. The once-per-outage latch IS the log (see
 * lib/admin/screenshot-log.ts's header on why there is no flag), so with no table there is nothing to
 * read and the alternative would be one email per file, which is the exact failure the brief names and
 * the harness's broken variant catches. The banner still says what is wrong, and the first thing it says
 * to do is run the migration.
 * ⚠️ IT NEVER THROWS. Same rule as `sendAdminDomainAlert` (lib/custom-domain/alert.ts:5-7): a mail
 * failure must not turn a processed file into a 500.
 */
async function alertIfDue(hasLog: boolean, reason: string, waiting: number | null): Promise<string | null> {
  if (!hasLog) return null
  const state = alertStateFrom(await recentLog(true))
  if (!alertIsDue(state)) return null
  const mail = screenshotAlertEmail({ reason, at: new Date(), waiting })
  try {
    await sendConfirmationEmail({
      to: SCREENSHOT_ALERT_TO, subject: mail.subject, html: mail.html, text: mail.text,
      senderName: 'HatchGrab',
    })
    console.warn(`[screenshot-events] outage alert sent: ${reason}`)
    return new Date().toISOString()
  } catch (e) {
    console.error('[screenshot-events] outage alert FAILED to send:', e instanceof Error ? e.message : String(e))
    return null
  }
}

/* ─────────────────────────── THE WRITE ADAPTER ─────────────────────────── */

/** The one place the adapter in lib/admin/truck-details-write.ts is bound to a real client. */
const db: TruckWriteDb = {
  async insertTruck(row) {
    const { data, error } = await supabase.from('discovery_trucks').insert(row).select('id').single()
    return { id: (data as { id?: string } | null)?.id ?? null, error: error ? error.message : null }
  },
  async deleteTruck(id) {
    const { error } = await supabase.from('discovery_trucks').delete().eq('id', id)
    return { error: error ? error.message : null }
  },
  async insertProspect(row) {
    const { data, error } = await supabase.from('outreach_prospects').insert(row).select('id').single()
    return { id: (data as { id?: string } | null)?.id ?? null, error: error ? error.message : null }
  },
  async updateTruck(id, patch) {
    const { error } = await supabase.from('discovery_trucks').update(patch).eq('id', id)
    return { error: error ? error.message : null }
  },
  async getProspectNotes(id) {
    const { data, error } = await supabase.from('outreach_prospects').select('notes').eq('id', id).single()
    return { notes: (data as { notes?: string | null } | null)?.notes ?? null, error: error ? error.message : null }
  },
  async setProspectNotes(id, notes) {
    const { error } = await supabase.from('outreach_prospects').update({ notes }).eq('id', id)
    return { error: error ? error.message : null }
  },
  async recordHistory(prospectId, body) {
    const r = await addNote(supabase, prospectId, body)
    return { error: r.error }
  },
}

/* ─────────────────────────── MATCH CANDIDATES ─────────────────────────── */

/**
 * Every prospect with its truck, shaped for `matchProspect`.
 * ⚠️ THE SOCIAL COLUMNS ARE ONLY SELECTED WHEN THEY EXIST — asking for a column PostgREST does not know
 * returns error 42703 for the WHOLE query, which would empty the candidate list and turn every screenshot
 * into a new truck. That is precisely the shape of the bug this repo already fixed once on the send path.
 */
async function matchRows(hasSocial: boolean): Promise<{ rows: MatchRow[]; error: string | null }> {
  const truckCols = ['id', 'name', 'contact_email', 'phone', 'mobile', 'website']
  if (hasSocial) truckCols.push('facebook_url', 'instagram_url')
  const { data, error } = await supabase
    .from('outreach_prospects')
    .select(`id, truck:discovery_trucks!outreach_prospects_discovery_truck_id_fkey (${truckCols.join(', ')})`)
  if (error) return { rows: [], error: error.message }
  // ⚠️ The embed comes back as an object on each prospect; typed here rather than cast to `any`, so a
  // column renamed in the select above is a compile error and not a silent `undefined`.
  type Embedded = {
    id: string
    truck: {
      id?: string; name?: string | null; contact_email?: string | null; phone?: string | null
      mobile?: string | null; website?: string | null
      facebook_url?: string | null; instagram_url?: string | null
    } | null
  }
  const rows: MatchRow[] = []
  for (const p of (data ?? []) as unknown as Embedded[]) {
    const t = p.truck
    if (!t?.id) continue
    rows.push({
      prospect_id: p.id, truck_id: t.id, name: t.name ?? null,
      contact_email: t.contact_email ?? null, phone: t.phone ?? null, mobile: t.mobile ?? null,
      website: t.website ?? null,
      facebook_url: t.facebook_url ?? null, instagram_url: t.instagram_url ?? null,
    })
  }
  return { rows, error: null }
}

/* ─────────────────────────── RESULT SHAPE ─────────────────────────── */

type FileResult = {
  fileName: string
  kind: Classification | null
  outcome: ScreenshotOutcome
  summary: string | null
  // The schedule half, unchanged in meaning from the first version of this route.
  extracted: number
  kept: number
  dropped: DroppedEvent[]
  written: number | null
  bridged: number | null
  // The details half.
  prospectId: string | null
  truckId: string | null
  /** Set only for 'needs_a_look': what the admin chooses between, and the details to apply. */
  candidates: { prospect_id: string; truck_id: string; name: string | null }[] | null
  details: TruckDetails | null
  error: string | null
  warnings: string[]
}

const emptyResult = (fileName: string): FileResult => ({
  fileName, kind: null, outcome: 'failed', summary: null,
  extracted: 0, kept: 0, dropped: [], written: null, bridged: null,
  prospectId: null, truckId: null, candidates: null, details: null, error: null, warnings: [],
})

/* ─────────────────────────── GET: the log ─────────────────────────── */

export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const [hasLog, hasSocial] = await Promise.all([logTableReady(), socialColumnsReady()])
  const rows = await recentLog(hasLog)
  return NextResponse.json({
    ok: true, hasLog, hasSocial, rows,
    migrationNotes: [
      ...(hasLog ? [] : [MIGRATION_LOG]),
      ...(hasSocial ? [] : [MIGRATION_SOCIAL]),
    ],
  })
}

/* ─────────────────────────── POST ─────────────────────────── */

export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // A JSON body is a DECISION on a "Needs a look" row, not a new screenshot.
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return decide(req)

  const form = await req.formData()
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files supplied' }, { status: 400 })
  }
  // The browser owns the queue, so only the browser knows these two.
  const waiting = Number(form.get('waiting') ?? '') || null
  const consecutive = Number(form.get('consecutiveNonContent') ?? '') || 0

  const [hasLog, hasSocial] = await Promise.all([logTableReady(), socialColumnsReady()])

  // 🔎 The GLOBAL exclusion list, read from discovery_exclusion_terms — the table the deployed
  // EXCLUSIONS_FROM switch reads. `term_key` is the pre-normalised value; comparing it with
  // normalizeVenue/venuesFuzzyMatch is the scraper's own rule.
  // ⚠️ A read failure here is FATAL for the batch rather than silently proceeding with an empty set — an
  // empty exclusion list does not fail, it quietly admits quiz nights and TBC as trucks.
  const { data: termRows, error: termErr } = await supabase
    .from('discovery_exclusion_terms').select('term_key').limit(10000)
  if (termErr) {
    const reason = `The exclusion list could not be read, so nothing can be extracted safely: ${termErr.message}`
    const alertedAt = await alertIfDue(hasLog, reason, waiting)
    return NextResponse.json({ error: reason, paused: true, banner: reason, alerted: !!alertedAt }, { status: 500 })
  }
  const termKeys = (termRows ?? []).map(r => r.term_key).filter(Boolean) as string[]

  const schedulePrompt = buildScreenshotPrompt(new Date())
  const results: FileResult[] = []
  let paused = false
  let banner: string | null = null
  let alerted = false

  for (const file of files) {
    const result = emptyResult(file.name)
    let logged: LogInput | null = null
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const base64 = buffer.toString('base64')
      const mime = file.type || 'image/jpeg'

      // ── 1. CLASSIFY. One cheap call, in front of everything. ─────────────────────────────────────
      const kind = parseClassification(await callGemini(base64, mime, buildClassifyPrompt()))
      result.kind = kind

      // ── 2. SCHEDULE — only for 'schedule' or 'both', and otherwise untouched from the first version ──
      if (shouldRunSchedule(kind)) {
        const raw = await callGemini(base64, mime, schedulePrompt)
        const parsed = parseScreenshotEvents(raw)
        result.extracted = parsed.length
        const { kept, dropped } = filterScreenshotEvents(parsed, termKeys)
        result.kept = kept.length
        result.dropped = dropped
        if (kept.length > 0) {
          const origin = process.env.HATCHGRAB_API_URL || new URL(req.url).origin
          const res = await fetch(`${origin}/api/inbound-schedule`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              secret: process.env.INBOUND_SCHEDULE_SECRET,
              events: toInboundEvents(kept, file.name),
            }),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(`inbound-schedule returned ${res.status}: ${body?.error ?? ''}`)
          result.written = body?.inserted ?? null
          result.bridged = body?.bridged ?? null
        } else {
          result.written = 0
        }
        result.outcome = 'schedule'
        result.summary = `${result.written ?? 0} events added`
      }

      // ── 3. TRUCK DETAILS ────────────────────────────────────────────────────────────────────────
      if (shouldRunTruckDetails(kind)) {
        if (!hasSocial) {
          // 🔴 WRITES NOTHING. Not a partial fill without the social columns: a run that fills email now
          // and the Facebook link "later" has no later — the screenshot is gone.
          throw new Error(`This screenshot has truck details, but the facebook_url/instagram_url columns do not exist yet — ${MIGRATION_SOCIAL}. Nothing was written.`)
        }
        const details = parseTruckDetails(await callGemini(base64, mime, buildTruckDetailsPrompt()))
        result.details = details

        if (detailsAreEmpty(details)) {
          result.outcome = 'nothing_new'
          result.summary = 'No contact details could be read from this screenshot'
        } else {
          const { rows, error: mErr } = await matchRows(hasSocial)
          if (mErr) throw new Error(`The prospect list could not be read: ${mErr}`)
          const match = matchProspect(details, rows)

          if (match.kind === 'definite') {
            const plan = planFill(details, {
              contact_email: match.row.contact_email, mobile: match.row.mobile, phone: match.row.phone,
              website: match.row.website, facebook_url: match.row.facebook_url,
              instagram_url: match.row.instagram_url,
            })
            if (planIsEmpty(plan) && plan.kept.length === 0) {
              result.outcome = 'nothing_new'
              result.summary = `Already had everything this screenshot shows · ${match.why}`
              result.prospectId = match.row.prospect_id
              result.truckId = match.row.truck_id
            } else {
              const summary = updatedSummary(plan, match.on)
              const applied = await applyFill(db, match.row, plan, `Filled from a screenshot — ${summary}`)
              if (!applied.ok) throw new Error(`The prospect could not be updated: ${applied.error}`)
              result.outcome = Object.keys(plan.fills).length > 0 || plan.areaNote ? 'updated' : 'nothing_new'
              result.summary = summary
              result.prospectId = match.row.prospect_id
              result.truckId = match.row.truck_id
              result.warnings = applied.warnings
            }
          } else if (match.kind === 'needs_a_look') {
            result.outcome = 'needs_a_look'
            result.summary = match.why
            result.candidates = match.candidates.map(c => ({ prospect_id: c.prospect_id, truck_id: c.truck_id, name: c.name }))
          } else {
            const summary = newTruckSummary(details)
            const created = await createHiddenTruckWithProspect(db, details, `Added from a screenshot — ${summary}`)
            if (!created.ok) throw new Error(`The new truck could not be created: ${created.error}`)
            result.outcome = 'new_truck'
            result.summary = summary
            result.prospectId = created.prospectId
            result.truckId = created.truckId
            result.warnings = created.warnings
          }
        }
      }

      if (kind === 'neither') {
        result.outcome = 'nothing_new'
        result.summary = 'Not a schedule or a contact-details screenshot — nothing to do'
      }

      logged = {
        fileName: file.name, fileSize: file.size, kind, outcome: result.outcome, summary: result.summary,
        prospectId: result.prospectId, truckId: result.truckId,
        eventsWritten: shouldRunSchedule(kind) ? (result.written ?? 0) : null,
        error: null, alertedAt: null,
      }
    } catch (err) {
      // 🔴 A THROW IS REPORTED, NOT SWALLOWED. Whether the BATCH continues now depends on how bad it is.
      const message = err instanceof Error ? err.message : String(err)
      result.error = message
      result.outcome = 'failed'
      result.summary = result.summary ?? null
      const verdict = classifyFailure(message, consecutive + 1)
      let alertedAt: string | null = null
      if (verdict.severity === 'complete') {
        paused = true
        banner = verdict.reason
        alertedAt = await alertIfDue(hasLog, verdict.reason, waiting)
        if (alertedAt) alerted = true
      }
      logged = {
        fileName: file.name, fileSize: file.size, kind: result.kind, outcome: 'failed',
        summary: result.summary, prospectId: null, truckId: null,
        eventsWritten: null, error: message, alertedAt,
      }
    }
    if (logged) await writeLog(hasLog, logged)
    results.push(result)
    // 🔴 A COMPLETE FAILURE STOPS THE BATCH HERE. The remaining files stay queued in the browser; nothing
    // is lost and nothing more is attempted against a system that cannot serve it.
    if (paused) break
  }

  return NextResponse.json({
    ok: true, results, paused, banner, alerted,
    hasLog, hasSocial,
    migrationNotes: [...(hasLog ? [] : [MIGRATION_LOG]), ...(hasSocial ? [] : [MIGRATION_SOCIAL])],
  })
}

/* ─────────────────────────── "Needs a look" DECISIONS ─────────────────────────── */

/**
 * The two one-click actions on a "Needs a look" row: "Same truck" applies the details as a definite
 * match, "Add as new" creates the hidden truck.
 *
 * 🔴 THE DETAILS COME FROM THE BROWSER, AND THAT IS WHY THEY ARE RE-NORMALISED HERE. The extracted values
 * were sent to the client with the row; a client could return anything. `parseTruckDetails` is run again
 * over them, so every value written by this path has been through the same normalisers as one that never
 * left the server — a raw, unnormalised URL cannot be stored by posting it here.
 */
async function decide(req: NextRequest) {
  const body = await req.json().catch(() => null) as
    { action?: string; details?: unknown; prospectId?: string; truckId?: string; fileName?: string; fileSize?: number } | null
  if (!body) return NextResponse.json({ error: 'Unreadable request' }, { status: 400 })

  const hasSocial = await socialColumnsReady()
  if (!hasSocial) return NextResponse.json({ error: `${MIGRATION_SOCIAL}. Nothing was written.` }, { status: 409 })
  const hasLog = await logTableReady()

  // Re-normalise through the same front door. See the note above. ⚠️ Every field is read as an optional
  // string from an UNTRUSTED object — typed as Partial rather than cast to `any`, so the shape the client
  // is allowed to send is written down here.
  const sent: Partial<Record<keyof TruckDetails, string>> =
    (body.details && typeof body.details === 'object') ? body.details as Partial<Record<keyof TruckDetails, string>> : {}
  const details = parseTruckDetails(JSON.stringify({
    name: sent.name ?? '',
    email: sent.contact_email ?? '',
    phone: sent.mobile || sent.phone || '',
    website: sent.website ?? '',
    facebook: sent.facebook_url ?? '',
    instagram: sent.instagram_url ?? '',
    area: sent.area ?? '',
  }))
  // ⚠️ A mobile and a landline cannot both survive the round trip above — `phone` takes one string. Both
  // are carried explicitly so a prospect that showed two numbers does not silently lose one.
  const reDetails: TruckDetails = {
    ...details,
    mobile: details.mobile ?? parseTruckDetails(JSON.stringify({ phone: sent.mobile ?? '' })).mobile,
    phone: details.phone ?? parseTruckDetails(JSON.stringify({ phone: sent.phone ?? '' })).phone,
  }

  const fileName = String(body.fileName ?? 'decision')
  const fileSize = Number.isFinite(body.fileSize) ? Number(body.fileSize) : null

  if (body.action === 'add_as_new') {
    const summary = newTruckSummary(reDetails)
    const created = await createHiddenTruckWithProspect(db, reDetails, `Added from a screenshot — ${summary}`)
    if (!created.ok) return NextResponse.json({ error: created.error }, { status: 500 })
    await writeLog(hasLog, {
      fileName, fileSize, kind: 'truck_details', outcome: 'new_truck', summary,
      prospectId: created.prospectId, truckId: created.truckId, eventsWritten: null, error: null, alertedAt: null,
    })
    return NextResponse.json({ ok: true, outcome: 'new_truck', summary, prospectId: created.prospectId, truckId: created.truckId, warnings: created.warnings })
  }

  if (body.action === 'same_truck') {
    if (!body.prospectId) return NextResponse.json({ error: 'No prospect was chosen' }, { status: 400 })
    const { rows, error } = await matchRows(hasSocial)
    if (error) return NextResponse.json({ error: `The prospect list could not be read: ${error}` }, { status: 500 })
    const row = rows.find(r => r.prospect_id === body.prospectId)
    if (!row) return NextResponse.json({ error: 'That prospect could not be found' }, { status: 404 })
    const plan = planFill(reDetails, {
      contact_email: row.contact_email, mobile: row.mobile, phone: row.phone,
      website: row.website, facebook_url: row.facebook_url, instagram_url: row.instagram_url,
    })
    if (planIsEmpty(plan) && plan.kept.length === 0) {
      const summary = 'Already had everything this screenshot shows · confirmed by hand'
      await writeLog(hasLog, {
        fileName, fileSize, kind: 'truck_details', outcome: 'nothing_new', summary,
        prospectId: row.prospect_id, truckId: row.truck_id, eventsWritten: null, error: null, alertedAt: null,
      })
      return NextResponse.json({ ok: true, outcome: 'nothing_new', summary, prospectId: row.prospect_id, truckId: row.truck_id, warnings: [] })
    }
    // ⚠️ 'name' as the key: the admin asserted the identity, so the summary says so rather than naming a
    // field that did not actually match.
    const summary = `${updatedSummary(plan, 'name').replace(/ · matched on name$/, '')} · confirmed by hand`
    const applied = await applyFill(db, row, plan, `Filled from a screenshot — ${summary}`)
    if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: 500 })
    await writeLog(hasLog, {
      fileName, fileSize, kind: 'truck_details', outcome: 'updated', summary,
      prospectId: row.prospect_id, truckId: row.truck_id, eventsWritten: null, error: null, alertedAt: null,
    })
    return NextResponse.json({ ok: true, outcome: 'updated', summary, prospectId: row.prospect_id, truckId: row.truck_id, warnings: applied.warnings })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
