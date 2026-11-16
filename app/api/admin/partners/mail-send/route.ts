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
import { deliver } from '@/lib/outreach-mail-deliver'
import { type QuotedMessage } from '@/lib/outreach-mail-message'
import { messagesTableProbe, dbDetail } from '@/lib/outreach-messages-table'
import { readFromName } from '@/lib/outreach-settings-read'
import { resolveAccounts, accountForSend, credentialsFor, accountOfRow } from '@/lib/outreach-mail-accounts'
import { retryRefusal } from '@/lib/outreach-send-rules'
import {
  ATTACHMENT_BUCKET, parseOutboundAttachments, uploadRefusal, safeFilename, type OutboundAttachment,
} from '@/lib/outreach-attachments'
import { loadAttachments } from '@/lib/outreach-attachment-store'
import { sanitiseQuotedHtml } from '@/lib/outreach-quote-sanitise'
import { partnerSendRefusal, partnerStoragePath, pathBelongsToPartner } from '@/lib/partners'
import { sendPartnerEmail, doNotContactAddresses } from '@/lib/partner-send'   // partners-2: the send path, shared with the scheduler

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const refuse = (message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, refusal: message, ...extra }, { status: 200 })

const DOWNLOAD_TTL_SECONDS = 300

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
    const dnc = await doNotContactAddresses(supabase)
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

  // ── THE SEND: refusals, the document, attachments, the row, SMTP, the Sent copy — lib/partner-send.ts (partners-2 moved it
  // there unchanged, so the scheduled sender uses the same path) ──────────────────────────────────────────────────────────────
  const result = await sendPartnerEmail(supabase, {
    partner, toAddress, subject: String(body.subject ?? ''), document: body.document, parent, isTest, testRecipient,
    attachments: body.attachments, idempotencyKey, sender,
  })
  if (result.kind === 'refused') return refuse(result.refusal)
  return NextResponse.json(result.payload)
}
