// app/api/admin/partners/mail-send/route.ts — send ONE free-form email to a partner (partners-1, 5 November 2026).
//
// 🔴 THE SAME SENDING PATH AS TRUCK OUTREACH, WITHOUT THE LADDER. The mailbox account (`accountForSend`), the From
// address and display name, the document → MIME builder (`buildMessage`), the attachment store, the SMTP send
// (`sendRow`), the Sent copy (`fileCopyAndRecord`, after the answer through `runAfter`), the idempotency key and the
// test path (`OUTREACH_TEST_RECIPIENT`) are the truck route's own functions, imported — not copies.
// What is NOT here, on purpose: templates, snippets, sequences, step guards, the plans PDF, demos, logos, screenshots
// and the contact log. A partner is not a prospect, and app/api/admin/outreach/mail-send/route.ts is not touched.
//
// 🔴 THE ORDER, as the truck route's: every refusal BEFORE the mail server is contacted; the row inserted as `sending`
// with its Message-ID (so a double submit collides on `idempotency_key`); the send; then the Sent copy.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { OUTREACH_FROM_ADDRESS } from '@/lib/outreach-mail-config'
import { sendRow, fileCopyAndRecord, deliver } from '@/lib/outreach-mail-deliver'
import { runAfter } from '@/lib/outreach-after'
import { buildMessage, newMessageId, type QuotedMessage } from '@/lib/outreach-mail-message'
import { sanitiseMailError } from '@/lib/outreach-mail-box'
import { messagesTableProbe, dbDetail } from '@/lib/outreach-messages-table'
import { readFromName } from '@/lib/outreach-settings-read'
import { validateDoc, docPlainText, literalTokenRefusal } from '@/lib/outreach-doc'
import { resolveAccounts, accountForSend, credentialsFor, accountOfRow } from '@/lib/outreach-mail-accounts'
import { retryRefusal } from '@/lib/outreach-send-rules'
import {
  ATTACHMENT_BUCKET, parseOutboundAttachments, attachmentSetRefusal, uploadRefusal, safeFilename, type OutboundAttachment,
} from '@/lib/outreach-attachments'
import { loadAttachments } from '@/lib/outreach-attachment-store'
import { sanitiseQuotedHtml } from '@/lib/outreach-quote-sanitise'
import { partnerSendRefusal, partnerStoragePath, pathBelongsToPartner } from '@/lib/partners'
import { applyPartnerAutoStatus } from '@/lib/partner-mail-poll'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const refuse = (message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, refusal: message, ...extra }, { status: 200 })

const DOWNLOAD_TTL_SECONDS = 300

/** The lower-cased address of every prospect marked do_not_contact — the existing do-not-contact list. */
async function doNotContactAddresses(): Promise<{ ok: true; set: Set<string> } | { ok: false }> {
  const { data, error } = await supabase.from('outreach_prospects')
    .select('do_not_contact, discovery_trucks(contact_email)').eq('do_not_contact', true)
  if (error) return { ok: false }
  const set = new Set<string>()
  for (const r of (data ?? []) as unknown as { discovery_trucks: { contact_email: string | null } | null }[]) {
    const e = (r.discovery_trucks?.contact_email ?? '').trim().toLowerCase()
    if (e) set.add(e)
  }
  return { ok: true, set }
}

export async function GET(req: NextRequest) {
  // The partner's messages — what the outbox reads back after a send.
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  const partnerId = req.nextUrl.searchParams.get('partner_id') ?? ''
  if (!partnerId) return NextResponse.json({ error: 'partner_id required' }, { status: 400 })
  const { data, error } = await supabase.from('outreach_messages')
    .select('id, direction, status, is_test, source, subject, to_address, message_date, sent_copy, attempts, last_error, created_at')
    .eq('partner_id', partnerId).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, refusal: dbDetail(error) })
  return NextResponse.json({ ok: true, messages: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad body' }, { status: 400 }) }
  const action = String(body.action ?? 'send')
  const partnerId = String(body.partner_id ?? '')

  // ── ATTACHMENTS: a signed upload into the partner's own folder of the outreach bucket ────────────────
  if (action === 'signed_upload') {
    if (!partnerId) return NextResponse.json({ error: 'partner_id required' }, { status: 400 })
    const filename = safeFilename(String(body.filename ?? ''))
    const contentType = String(body.content_type ?? '')
    const size = Number(body.size ?? 0)
    const stop = uploadRefusal({ filename, contentType, size })
    if (stop) return refuse(stop.refusal)
    const path = partnerStoragePath(partnerId, crypto.randomUUID(), filename)
    const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path)
    if (error || !data) return refuse(`That file could not be prepared for upload (${error?.message ?? 'no signed URL'}).`)
    const attachment: OutboundAttachment = { filename, contentType, size, storagePath: path }
    return NextResponse.json({ ok: true, signedUrl: data.signedUrl, token: data.token, path, attachment })
  }
  if (action === 'signed_download') {
    const path = String(body.path ?? '')
    if (!pathBelongsToPartner(path, partnerId)) return refuse('That file does not belong to this partner.')
    const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, DOWNLOAD_TTL_SECONDS)
    if (error || !data) return refuse('That file could not be opened — it may have been removed.')
    return NextResponse.json({ ok: true, url: data.signedUrl, expiresIn: DOWNLOAD_TTL_SECONDS })
  }

  const probe = await messagesTableProbe(async () => {
    const { error } = await supabase.from('outreach_messages').select('id').limit(1)
    return { error }
  })
  if (!probe.ready) return refuse(probe.refusal)

  const accounts = resolveAccounts()
  const sender = accountForSend(accounts)
  if (!sender) return refuse('The mailbox credentials are not set on this environment, so nothing can be sent.')
  const isTest = body.is_test === true
  const testRecipient = process.env.OUTREACH_TEST_RECIPIENT
  if (isTest && !testRecipient) return refuse('OUTREACH_TEST_RECIPIENT is not set on this environment, so a test cannot be sent.')

  // ── RETRY — the same row, the same Message-ID, never a new one (a partner row only) ──────────────────
  if (action === 'retry') {
    const { data: existing } = await supabase.from('outreach_messages').select('*')
      .eq('id', String(body.message_row_id ?? '')).not('partner_id', 'is', null).maybeSingle()
    const row = existing as (Record<string, unknown> & { id: string; status: string; is_test: boolean; partner_id: string; attachments?: unknown }) | null
    if (!row) return refuse('That message is not in the log any more.')
    const stop = retryRefusal(row, body.confirm_uncertain === true)
    if (stop) return refuse(stop.refusal, stop.needsConfirm ? { needsConfirm: true } : {})
    const { data: pr } = await supabase.from('partner_orgs').select('email').eq('id', row.partner_id).maybeSingle()
    const dnc = await doNotContactAddresses()
    if (!dnc.ok) return refuse('The do-not-contact list could not be read, so nothing was sent.')
    const blocked = partnerSendRefusal({ partner: pr as { email: string | null } | null, to: String(row.to_address ?? ''), dncAddresses: dnc.set, isTest: row.is_test })
    if (blocked && !row.is_test) return refuse(blocked)
    const files = await loadAttachments(supabase, parseOutboundAttachments(row.attachments))
    if (!files.ok) return refuse(files.refusal)
    const creds = credentialsFor(accounts, accountOfRow(row as { account?: string | null }))
    if (!creds) return refuse('The credentials for that mailbox are not set on this environment.')
    const retried = await deliver(supabase,
      { ...(row as unknown as Parameters<typeof deliver>[1]), from_name: await readFromName(supabase), attachments: files.attachments },
      { mailUser: creds.user, mailPass: creds.pass, isTest: row.is_test, testRecipient })
    return NextResponse.json(retried.payload)
  }

  if (action !== 'send') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  if (!partnerId) return NextResponse.json({ error: 'partner_id required' }, { status: 400 })
  const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key : null

  if (idempotencyKey) {
    const { data: prior } = await supabase.from('outreach_messages')
      .select('id, status, sent_copy, last_error').eq('idempotency_key', idempotencyKey).maybeSingle()
    if (prior) return NextResponse.json({ ok: true, duplicate: true, ...(prior as object) })
  }

  const { data: pRow, error: pErr } = await supabase.from('partner_orgs')
    .select('id, name, email, status').eq('id', partnerId).maybeSingle()
  if (pErr || !pRow) return refuse('That partner could not be read.')
  const partner = pRow as { id: string; name: string; email: string | null; status: string }

  // ── A REPLY to one of the partner's own inbound messages (optional) ─────────────────────────────────
  let parent: { messageId: string; references: string | null; quoted: QuotedMessage; quote?: boolean } | null = null
  let toAddress = (partner.email ?? '').trim()
  const replyToId = typeof body.reply_to_message_id === 'string' ? body.reply_to_message_id : ''
  if (replyToId) {
    const { data: rp } = await supabase.from('outreach_messages')
      .select('id, partner_id, is_test, direction, message_id, "references", subject, from_address, to_address, message_date, html_body, text_body')
      .eq('id', replyToId).maybeSingle()
    const r = rp as { partner_id: string | null; is_test: boolean; direction: string; message_id: string; references: string | null; subject: string | null; from_address: string | null; to_address: string | null; message_date: string | null; html_body: string | null; text_body: string | null } | null
    if (!r || r.partner_id !== partnerId) return refuse('That message is not this partner’s, so the reply was not sent.')
    if (r.is_test) return refuse('That is a test send, so it cannot be replied to.')
    const quotedHtml = sanitiseQuotedHtml(r.html_body ?? '')
    const includeQuote = body.include_quote !== false
    if (includeQuote && !quotedHtml.trim()) return refuse('That message has no stored body to quote. Open it once, then reply.')
    // 🔴 THE RECIPIENT IS A CLOSED SET: the partner's own address, or the From of the message being answered.
    const wanted = (typeof body.to === 'string' && body.to.trim()) ? body.to.trim() : (r.direction === 'inbound' ? (r.from_address ?? '') : (r.to_address ?? ''))
    const allowed = [partner.email, r.direction === 'inbound' ? r.from_address : r.to_address].map(a => (a ?? '').trim().toLowerCase()).filter(Boolean)
    if (!allowed.includes(wanted.toLowerCase())) return refuse(`${wanted} is neither this partner’s address nor the sender of that message.`)
    toAddress = wanted
    parent = {
      messageId: r.message_id, references: r.references, quote: includeQuote,
      quoted: {
        fromAddress: r.from_address ?? toAddress, fromName: null,
        toAddress: r.to_address ?? OUTREACH_FROM_ADDRESS, toName: null,
        subject: r.subject ?? '', date: r.message_date ? new Date(r.message_date) : new Date(),
        html: quotedHtml, text: r.text_body,
      },
    }
  }

  // ── REFUSALS: do-not-contact, no address ────────────────────────────────────────────────────────────
  const dnc = await doNotContactAddresses()
  if (!dnc.ok) return refuse('The do-not-contact list could not be read, so nothing was sent.')
  const blocked = partnerSendRefusal({ partner, to: toAddress, dncAddresses: dnc.set, isTest })
  if (blocked) return refuse(blocked)

  // ── THE DOCUMENT — validated against the schema, never passed through (the truck route's own guard) ──
  const parsed = validateDoc(body.document)
  if (!parsed.ok) return refuse(`That message could not be sent — ${parsed.error}.`)
  const doc = parsed.doc
  if (!docPlainText(doc).trim()) return refuse('There is no message body to send.')
  const literal = literalTokenRefusal(doc)
  if (literal) return refuse(literal)
  const subjectIn = String(body.subject ?? '').trim()
  if (!parent && !subjectIn) return refuse('The email needs a subject.')

  // ── ATTACHMENTS — paths in, bytes read server-side; only from this partner's folder ─────────────────
  const declared = parseOutboundAttachments(body.attachments)
  if (declared.some(a => !pathBelongsToPartner(a.storagePath, partnerId))) return refuse('An attachment is not in this partner’s folder, so nothing was sent.')
  const tooBig = attachmentSetRefusal(declared)
  if (tooBig) return refuse(tooBig.refusal)
  const loaded = await loadAttachments(supabase, declared)
  if (!loaded.ok) return refuse(loaded.refusal)

  // ── THE ROW GOES IN FIRST, WITH ITS Message-ID ──────────────────────────────────────────────────────
  const fromName = await readFromName(supabase)
  const messageId = newMessageId()
  const built = buildMessage({ doc, subject: subjectIn, messageId, parent, fromName, locale: null })
  const recipient = isTest ? testRecipient! : toAddress
  const { data: inserted, error: insErr } = await supabase.from('outreach_messages').insert({
    partner_id: partnerId,
    direction: 'outbound', status: 'sending', is_test: isTest, source: 'system',
    account: sender.account,
    message_id: messageId, in_reply_to: built.inReplyTo, references: built.references,
    subject: built.subject, from_address: OUTREACH_FROM_ADDRESS, to_address: recipient,
    message_date: new Date().toISOString(),
    html_body: built.html, text_body: built.text, attempts: 0,
    attachments: declared,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  }).select('*').single()
  if (insErr || !inserted) {
    if ((insErr as { code?: string } | null)?.code === '23505' && idempotencyKey) {
      const { data: prior } = await supabase.from('outreach_messages')
        .select('id, status, sent_copy, last_error').eq('idempotency_key', idempotencyKey).maybeSingle()
      if (prior) return NextResponse.json({ ok: true, duplicate: true, ...(prior as object) })
    }
    return refuse(`The message could not be recorded, so nothing was sent — ${dbDetail(insErr)}`)
  }

  const row = inserted as Parameters<typeof sendRow>[1] & { id: string }
  const sendable = { ...row, attachments: loaded.attachments, from_name: fromName }
  const sent = await sendRow(supabase, sendable, { mailUser: sender.user, mailPass: sender.pass, isTest, testRecipient })
  if (sent.result.status !== 'sent' || !sent.raw) return NextResponse.json(sent.result.payload)

  // 🔴 A REAL SEND (never a test) is the partner's first email ⇒ `to_contact` → `contacted`, logged.
  if (!isTest) await applyPartnerAutoStatus(supabase, partnerId, 'send', { last_contacted_at: new Date().toISOString() })

  const raw = sent.raw
  const sentAt = sent.date ?? new Date()
  runAfter('Partner Sent copy', async () => {
    try {
      await fileCopyAndRecord(supabase, sendable, raw, sentAt, { mailUser: sender.user, mailPass: sender.pass })
    } catch (e) {
      await supabase.from('outreach_messages').update({ last_error: `post-send: the Sent copy — ${sanitiseMailError(e)}`, updated_at: new Date().toISOString() }).eq('id', row.id)
    }
  })
  return NextResponse.json({ ...sent.result.payload, sent_copy: 'pending', post_steps: 'after' })
}
