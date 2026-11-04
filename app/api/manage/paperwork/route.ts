// app/api/manage/paperwork/route.ts — Manage › Paperwork (paperwork-1, 4 November 2026, docs/paperwork-1-report.md).
//
// ── ITS OWN ROUTE, LIKE app/api/event-types and app/api/weekly-post ──────────────────────────────────────────────────
// /api/manage is a 3,000-line handler every operator write funnels through; a document store is a concern of its own.
// 🔴 THE ACCESS CHECK IS NOT A COPY: `resolveTruckAccessWith` (lib/truck-access.ts) is the function /api/manage itself calls —
// moved there unchanged — so the token says which truck and the SESSION (cookie, or the app's Bearer) says who; no session,
// no access. Staff are refused (insurance and certificates are for the owner and managers).
// 🔴 THE FEATURE GATE IS SERVER-SIDE ON EVERY ACTION (`paperwork`, lib/features.ts): override → effective plan → allowed.
// 🔴 NOTHING IS SAVED FROM THE AI ALONE: `read` fills a draft the screen shows; only `save` makes a document current.
//
// Actions (POST JSON { token, action, … }):
//   load · upload_url · read · cancel_upload · save · update · delete · file_url · share · revoke
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveTruckAccessWith } from '@/lib/truck-access'
import { featureRefusal } from '@/lib/plan-refusal'
import { manageErrorBody, type ManageErrorCode, type ManageErrorParams } from '@/lib/i18n/manage-errors'
import { localeForTruck } from '@/lib/i18n/server-locale'
import { translatorFor } from '@/lib/i18n/translator'
import { DEFAULT_LOCALE, type AppLocale } from '@/lib/i18n/locales'
import { truckTimeSettings } from '@/lib/truck-time'
import { getLocalDateInTz, instantOfLocal } from '@/lib/time-utils'
import { paperworkSendRatelimit } from '@/lib/ratelimit'
import {
  ACCEPTED_MIME, MAX_FILE_BYTES, MAX_MESSAGE_CHARS, MAX_ORGANISER_EMAILS, SHARE_MAX_DAYS, addDays, isYmd, parseOrganiserEmails, typesForCountry,
  EXTENSION, checkedDetails, type DraftDetails, type StoredMime,
} from '@/lib/paperwork/model'
import { sniffMime } from '@/lib/paperwork/sniff'
import { heicToJpeg } from '@/lib/paperwork/heic'
import { readDocumentWithAi, PAPERWORK_MODEL } from '@/lib/paperwork/ai-read'
import { newShareToken, sharePageUrl } from '@/lib/paperwork/share'
import { sendShareEmail } from '@/lib/paperwork/email'
import {
  readTypeRows, listDocuments, getDocument, createPending, patchDocument, signedUploadUrl, downloadFile, uploadFile, removeFiles,
  signedFileUrl, downloadName, saveDocument, deleteDocument, cancelPending, listShares, createShare, revokeShare, type DocRow,
} from '@/lib/paperwork/store'
import '@/lib/i18n/catalog/paperwork'

export const dynamic = 'force-dynamic'
/** A PDF read by the model takes ~10–30 s; the per-attempt timeout is 60 s (lib/paperwork/ai-read.ts). */
export const maxDuration = 120

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
type Truck = Record<string, unknown> & { id: string; operator_id: string | null; name: string | null; country: string | null; currency: string | null; contact_email: string | null; feature_overrides: Record<string, boolean> | null; plan: string | null; trial_expires_at: string | null }
const BASE = () => (process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? 'https://www.hatchgrab.com').replace(/\/$/, '')
const str = (v: unknown, max: number): string | null => { if (typeof v !== 'string') return null; const s = v.replace(/\s+/g, ' ').trim(); return s ? s.slice(0, max) : null }

/** What the screen gets for a document: never the storage path, never what the AI read. */
const view = (d: DocRow) => ({
  id: d.id, typeKey: d.typeKey, customName: d.customName, issuer: d.issuer, issuedOn: d.issuedOn, expiresOn: d.expiresOn,
  nameOnDocument: d.nameOnDocument, coverAmountMinor: d.coverAmountMinor, currency: d.currency, mime: d.mime, sizeBytes: d.sizeBytes,
  status: d.status, supersededBy: d.supersededBy, createdAt: d.createdAt,
})

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'bad_request'), { status: 400 }) }
  const token = String(body.token ?? '')
  if (!token) return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'token_required'), { status: 401 })
  const supabase = db()
  const { data: truckRow } = await supabase.from('trucks').select('*').eq('dashboard_token', token).maybeSingle()
  if (!truckRow) return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'invalid_token'), { status: 401 })
  const truck = truckRow as Truck
  let localeRead: Promise<AppLocale> | null = null
  const locale = () => (localeRead ??= localeForTruck(truck))
  const refuse = async (code: ManageErrorCode, status: number, params: ManageErrorParams = {}) => NextResponse.json(manageErrorBody(await locale(), code, params), { status })

  const access = await resolveTruckAccessWith(supabase, req, truck)
  if (!access.ok) return refuse(access.code, access.status)
  if (access.role === 'staff') return refuse('insufficient_permissions', 403)
  const gate = await featureRefusal(truck, 'paperwork', await locale())
  if (gate) return refuse(gate.code, 403, gate.params)

  const action = String(body.action ?? '')
  const time = await truckTimeSettings(truck)
  const today = getLocalDateInTz(time.timeZone)
  const types = typesForCountry(await readTypeRows(supabase), truck.country)
  const docId = typeof body.documentId === 'string' ? body.documentId : ''

  try {
    // ── load: the list, the history, the links sent, the upcoming events ─────────────────────────────────────────
    if (action === 'load') {
      const [docs, sent, events, owner] = await Promise.all([
        listDocuments(supabase, truck.id),
        listShares(supabase, truck.id),
        supabase.from('truck_events').select('id, event_date, venue_name, private_name, town, is_private').eq('truck_id', truck.id)
          .gte('event_date', today).not('status', 'in', '(cancelled,rejected)').order('event_date').limit(60),
        truck.operator_id ? supabase.from('operators').select('name, first_name, last_name').eq('id', truck.operator_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      const o = (owner.data ?? null) as Record<string, string | null> | null
      const eventName = (e: Record<string, unknown>) => String((e.is_private && e.private_name) || e.venue_name || e.town || '')
      const eventsList = ((events.data ?? []) as Record<string, unknown>[]).map(e => ({ id: String(e.id), date: String(e.event_date), name: eventName(e) }))
      return NextResponse.json({
        today, types, currency: truck.currency ?? null,
        truckNames: [truck.name, o?.name, [o?.first_name, o?.last_name].filter(Boolean).join(' ')].filter(Boolean),
        documents: docs.map(view),
        events: eventsList,
        shares: sent.shares.map(sh => ({
          id: sh.id, emails: sh.organiserEmails, createdAt: sh.createdAt, expiresAt: sh.expiresAt, revokedAt: sh.revokedAt,
          firstOpenedAt: sh.firstOpenedAt, viewCount: sh.viewCount, eventId: sh.eventId,
          items: sent.items.filter(i => i.shareId === sh.id).sort((a, b) => a.position - b.position).map(i => ({ typeKey: i.typeKey, documentId: i.documentId })),
        })),
      })
    }

    // ── upload_url: a pending row and a signed URL the browser PUTs the file to (it never passes through this function) ─
    if (action === 'upload_url') {
      const size = Number(body.size ?? 0)
      const declared = String(body.contentType ?? '')
      if (!(size > 0) || size > MAX_FILE_BYTES) return refuse('paperwork_file_too_big', 413)
      if (declared && !([...ACCEPTED_MIME, 'image/heif'] as string[]).includes(declared)) return refuse('paperwork_file_type', 415)
      const { id, path } = await createPending(supabase, truck.id, str(body.filename, 200) ?? 'upload')
      return NextResponse.json({ documentId: id, uploadUrl: await signedUploadUrl(supabase, path) })
    }

    // ── read: check the bytes, convert HEIC, ask the AI — and return a DRAFT; the document stays pending ─────────────
    if (action === 'read') {
      const doc = docId ? await getDocument(supabase, truck.id, docId) : null
      if (!doc || doc.status !== 'pending' || !doc.storagePath) return refuse('paperwork_not_found', 404)
      const bytes = await downloadFile(supabase, doc.storagePath)
      if (!bytes) { await cancelPending(supabase, truck.id, doc.id); return refuse('paperwork_upload_failed', 400) }
      if (bytes.length > MAX_FILE_BYTES) { await cancelPending(supabase, truck.id, doc.id); return refuse('paperwork_file_too_big', 413) }
      const sniffed = sniffMime(bytes)
      if (!sniffed) { await cancelPending(supabase, truck.id, doc.id); return refuse('paperwork_file_type', 415) }
      let stored: { bytes: Uint8Array; mime: StoredMime; path: string } = { bytes, mime: sniffed === 'image/heic' ? 'image/jpeg' : sniffed, path: doc.storagePath }
      if (sniffed === 'image/heic') {
        let jpeg: Uint8Array
        try { jpeg = await heicToJpeg(bytes) } catch { await cancelPending(supabase, truck.id, doc.id); return refuse('paperwork_file_type', 415) }
        const path = doc.storagePath.replace(/\.(heic|heif)$/i, '').replace(/\.[^./]*$/, '') + '.jpg'
        await uploadFile(supabase, path, jpeg, 'image/jpeg')
        if (path !== doc.storagePath) await removeFiles(supabase, [doc.storagePath])
        stored = { bytes: jpeg, mime: 'image/jpeg', path }
      } else if (!new RegExp(`\\.${EXTENSION[stored.mime]}$`, 'i').test(stored.path) && !(stored.mime === 'image/jpeg' && /\.jpe?g$/i.test(stored.path))) {
        // The name says one thing and the bytes another: the stored copy is named after what it IS.
        const path = stored.path.replace(/\.[^./]*$/, '') + `.${EXTENSION[stored.mime]}`
        await uploadFile(supabase, path, bytes, stored.mime); await removeFiles(supabase, [stored.path]); stored.path = path
      }
      const en = translatorFor('en-GB', 'paperwork')
      const ai = await readDocumentWithAi({ bytes: stored.bytes, mime: stored.mime }, types.map(t => ({ key: t.key, name: en(`types.${t.key}` as never), dateLabel: t.dateLabel })), truck.currency ?? null)
      if (!ai.ok) console.warn(`[paperwork] AI read failed for a ${stored.mime} (${truck.id}): ${ai.reason}`)
      await patchDocument(supabase, truck.id, doc.id, {
        mime: stored.mime, size_bytes: stored.bytes.length, storage_path: stored.path,
        ai_extracted: ai.ok ? { model: PAPERWORK_MODEL, at: new Date().toISOString(), ok: true, details: ai.details, confidence: ai.confidence, raw: ai.raw }
          : { model: PAPERWORK_MODEL, at: new Date().toISOString(), ok: false, reason: ai.reason.slice(0, 300) },
      })
      const empty: DraftDetails = { typeKey: null, customName: null, issuer: null, issuedOn: null, expiresOn: null, nameOnDocument: null, coverAmountMinor: null, currency: null }
      return NextResponse.json({ documentId: doc.id, read: ai.ok, draft: ai.ok ? ai.details : empty, confidence: ai.ok ? ai.confidence : null, mime: stored.mime })
    }

    if (action === 'cancel_upload') {
      await cancelPending(supabase, truck.id, docId)
      return NextResponse.json({ ok: true })
    }

    // ── save: the truck pressed Save — the document becomes current; a document of the same type becomes history ─────
    if (action === 'save' || action === 'update') {
      const doc = docId ? await getDocument(supabase, truck.id, docId) : null
      if (!doc || (action === 'save' ? doc.status !== 'pending' : doc.status !== 'current')) return refuse('paperwork_not_found', 404)
      const details = checkedDetails(body.details, types)
      if (!details) return refuse('paperwork_bad_details', 400)
      const replaces = action === 'save' && typeof body.replaces === 'string' ? body.replaces : null
      if (replaces) { const r = await getDocument(supabase, truck.id, replaces); if (!r || r.status !== 'current') return refuse('paperwork_not_found', 404) }
      await saveDocument(supabase, truck.id, doc.id, details, replaces)
      if (action === 'update' && doc.expiresOn === details.expiresOn) {
        // An edit that keeps the date keeps its reminders where they were (no stage is sent twice).
        await patchDocument(supabase, truck.id, doc.id, { reminder_stage: doc.reminderStage, reminder_expires_on: doc.reminderExpiresOn })
      }
      return NextResponse.json({ ok: true, document: view((await getDocument(supabase, truck.id, doc.id))!) })
    }

    if (action === 'delete') {
      const r = docId ? await deleteDocument(supabase, truck.id, docId) : null
      if (!r) return refuse('paperwork_not_found', 404)
      return NextResponse.json({ ok: true, ...r })
    }

    // ── file_url: a 5-minute link to open (inline) or download one of the truck's files ─────────────────────────────
    if (action === 'file_url') {
      const doc = docId ? await getDocument(supabase, truck.id, docId) : null
      if (!doc || !doc.storagePath || (doc.status !== 'current' && doc.status !== 'superseded')) return refuse('paperwork_not_found', 404)
      const t = translatorFor(await locale(), 'paperwork')
      const label = doc.typeKey ? t(`types.${doc.typeKey}` as never) : (doc.customName ?? 'document')
      const url = await signedFileUrl(supabase, doc.storagePath, body.download ? downloadName(label, doc.mime) : null)
      return url ? NextResponse.json({ url, mime: doc.mime }) : refuse('paperwork_not_found', 404)
    }

    // ── share: a link for organisers, and one email to each of them ────────────────────────────────────────────────
    if (action === 'share') {
      const { emails, invalid } = parseOrganiserEmails(String(body.emails ?? ''))
      if (!emails.length || invalid.length || emails.length > MAX_ORGANISER_EMAILS) return refuse('paperwork_bad_details', 400)
      const until = String(body.until ?? '')
      if (!isYmd(until) || until <= today || until > addDays(today, SHARE_MAX_DAYS)) return refuse('paperwork_bad_details', 400)
      const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE_CHARS) || null : null
      const all = await listDocuments(supabase, truck.id)
      const current = all.filter(d => d.status === 'current')
      const wanted = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]).slice(0, 50) : []
      const items: { typeKey: string | null; documentId: string | null }[] = []
      for (const it of wanted) {
        const tk = typeof it.typeKey === 'string' ? it.typeKey : null, id = typeof it.documentId === 'string' ? it.documentId : null
        if (tk && current.some(d => d.typeKey === tk)) items.push({ typeKey: tk, documentId: null })
        else if (id && current.some(d => d.id === id && !d.typeKey)) items.push({ typeKey: null, documentId: id })
        else return refuse('paperwork_bad_details', 400)
      }
      if (!items.length) return refuse('paperwork_bad_details', 400)
      let eventName: string | null = null, eventId: string | null = null
      if (typeof body.eventId === 'string' && body.eventId) {
        const { data: ev } = await supabase.from('truck_events').select('id, venue_name, private_name, town, is_private').eq('truck_id', truck.id).eq('id', body.eventId).maybeSingle()
        if (!ev) return refuse('paperwork_bad_details', 400)
        eventId = String(ev.id); eventName = String((ev.is_private && ev.private_name) || ev.venue_name || ev.town || '') || null
      }
      // 🔴 RATE LIMIT, FAIL CLOSED: a limiter outage never becomes unlimited mail from our sender.
      try {
        const lim = await paperworkSendRatelimit.limit(`send:${truck.id}`)
        if (!lim.success) return refuse('paperwork_send_limit', 429)
      } catch (e) {
        console.error('[paperwork] rate limiter unavailable — refusing the send (fail closed):', e instanceof Error ? e.message : e)
        return refuse('paperwork_send_limit', 429)
      }
      const expiresAt = new Date(instantOfLocal(addDays(until, 1), '00:00', time.timeZone)).toISOString()
      const shareToken = newShareToken()
      const share = await createShare(supabase, { truckId: truck.id, token: shareToken, emails, message, eventId, expiresAt }, items)
      const t = translatorFor(await locale(), 'paperwork')
      const docs = items.map(it => current.find(d => (it.typeKey ? d.typeKey === it.typeKey : d.id === it.documentId))!).map(d => ({
        name: d.typeKey ? t(`types.${d.typeKey}` as never) : (d.customName ?? ''), expiresOn: d.expiresOn,
        dateLabel: (types.find(x => x.key === d.typeKey)?.dateLabel ?? 'expires') as 'expires' | 'review_by',
      }))
      const loc = await locale()
      const results = await Promise.all(emails.map(to => sendShareEmail({
        to, truckName: truck.name ?? '', replyTo: truck.contact_email ?? null, locale: loc, time, docs, message, eventName,
        url: sharePageUrl(BASE(), shareToken), until,
      })))
      const sentTo = emails.filter((_, i) => results[i].sent)
      if (!sentTo.length) {
        console.error(`[paperwork] share email failed for ${truck.id}: ${results.map(r => r.reason).join('; ')}`)
        await supabase.from('document_shares').delete().eq('id', share.id)
        return refuse('paperwork_send_failed', 502)
      }
      return NextResponse.json({ ok: true, shareId: share.id, sentTo, failed: emails.filter((_, i) => !results[i].sent) })
    }

    if (action === 'revoke') {
      const ok = typeof body.shareId === 'string' && await revokeShare(supabase, truck.id, body.shareId)
      return ok ? NextResponse.json({ ok: true }) : refuse('paperwork_not_found', 404)
    }

    return refuse('bad_request', 400)
  } catch (e) {
    console.error(`[paperwork] ${action} failed for ${truck.id}:`, e instanceof Error ? e.message : e)
    return refuse(action === 'upload_url' || action === 'read' ? 'paperwork_upload_failed' : 'paperwork_bad_details', 500)
  }
}

