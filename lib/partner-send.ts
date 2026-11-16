// lib/partner-send.ts — partners-2 (16 November 2026, docs/partners-2-report.md): SEND ONE EMAIL TO A PARTNER — the one path
// both Admin's partner compose (app/api/admin/partners/mail-send) and the scheduled sender (app/api/cron/partner-sends) use.
// Moved here from the partners-1 route BYTE FOR BYTE in behaviour: the same refusals, the same order, the same row, the same
// SMTP send and Sent copy (the truck route's own functions, imported — not copies).
//
// 🔴 THE ORDER: every refusal BEFORE the mail server is contacted; the row inserted as `sending` with its Message-ID (a double
// submit collides on idempotency_key); the send; then the Sent copy, after the answer.
// partners-2 adds two things, both off unless asked for: `requireOptOut` (the scheduled sender requires the opt-out line, as
// truck outreach does — a hand-written partner email is exempt, as before), and `partnerDnc` (a partner marked do_not_contact
// is refused like a do-not-contact prospect's address).
import type { SupabaseClient } from '@supabase/supabase-js'
import { OUTREACH_FROM_ADDRESS } from '@/lib/outreach-mail-config'
import { sendRow, fileCopyAndRecord } from '@/lib/outreach-mail-deliver'
import { runAfter } from '@/lib/outreach-after'
import { buildMessage, newMessageId, type QuotedMessage } from '@/lib/outreach-mail-message'
import { sanitiseMailError } from '@/lib/outreach-mail-box'
import { dbDetail } from '@/lib/outreach-messages-table'
import { readFromName } from '@/lib/outreach-settings-read'
import { validateDoc, docPlainText, literalTokenRefusal, optOutBlock } from '@/lib/outreach-doc'
import { parseOutboundAttachments, attachmentSetRefusal } from '@/lib/outreach-attachments'
import { loadAttachments } from '@/lib/outreach-attachment-store'
import { partnerSendRefusal, pathBelongsToPartner } from '@/lib/partners'
import { applyPartnerAutoStatus } from '@/lib/partner-mail-poll'

/** The lower-cased address of every prospect marked do_not_contact AND every partner marked do_not_contact — the one list. */
export async function doNotContactAddresses(supabase: SupabaseClient): Promise<{ ok: true; set: Set<string> } | { ok: false }> {
  const [{ data, error }, { data: partners, error: pErr }] = await Promise.all([
    supabase.from('outreach_prospects').select('do_not_contact, discovery_trucks(contact_email)').eq('do_not_contact', true),
    supabase.from('partner_orgs').select('email, alternate_emails').eq('do_not_contact', true),
  ])
  if (error) return { ok: false }
  const set = new Set<string>()
  for (const r of (data ?? []) as unknown as { discovery_trucks: { contact_email: string | null } | null }[]) {
    const e = (r.discovery_trucks?.contact_email ?? '').trim().toLowerCase()
    if (e) set.add(e)
  }
  // partners-2: a partner's opt-out joins the same list (before 20261104 the column does not exist — the prospects alone, as before).
  if (!pErr) for (const p of (partners ?? []) as { email: string | null; alternate_emails: string[] | null }[]) {
    for (const e of [p.email, ...(p.alternate_emails ?? [])]) { const k = (e ?? '').trim().toLowerCase(); if (k) set.add(k) }
  }
  return { ok: true, set }
}

export interface PartnerSendInput {
  partner: { id: string; name: string; email: string | null; status: string }
  toAddress: string
  subject: string
  document: unknown
  parent: { messageId: string; references: string | null; quoted: QuotedMessage; quote?: boolean } | null
  isTest: boolean
  testRecipient?: string
  attachments: unknown
  idempotencyKey: string | null
  sender: { account: string; user: string; pass: string }
  /** The scheduled sender: the opt-out sentence the document must carry (truck outreach's rule). Omitted = not required. */
  requireOptOut?: string | null
}
export type PartnerSendResult =
  | { kind: 'refused'; refusal: string }
  | { kind: 'done'; payload: Record<string, unknown>; sent: boolean; rowId?: string }

export async function sendPartnerEmail(supabase: SupabaseClient, input: PartnerSendInput): Promise<PartnerSendResult> {
  const { partner, isTest } = input
  const refuse = (refusal: string): PartnerSendResult => ({ kind: 'refused', refusal })
  // ── REFUSALS: do-not-contact, no address ──────────────────────────────────────────────────────────────
  const dnc = await doNotContactAddresses(supabase)
  if (!dnc.ok) return refuse('The do-not-contact list could not be read, so nothing was sent.')
  const blocked = partnerSendRefusal({ partner, to: input.toAddress, dncAddresses: dnc.set, isTest })
  if (blocked) return refuse(blocked)

  // ── THE DOCUMENT — validated against the schema, never passed through (the truck route's own guard) ──
  const parsed = validateDoc(input.document)
  if (!parsed.ok) return refuse(`That message could not be sent — ${parsed.error}.`)
  const doc = parsed.doc
  if (!docPlainText(doc).trim()) return refuse('There is no message body to send.')
  const literal = literalTokenRefusal(doc)
  if (literal) return refuse(literal)
  if (input.requireOptOut !== undefined && !isTest) {
    const missing = optOutBlock(doc, input.requireOptOut)
    if (missing) return refuse(`The opt-out line is missing (${missing}), so nothing was sent.`)
  }
  const subjectIn = input.subject.trim()
  if (!input.parent && !subjectIn) return refuse('The email needs a subject.')

  // ── ATTACHMENTS — paths in, bytes read server-side; only from this partner's folder ─────────────────
  const declared = parseOutboundAttachments(input.attachments)
  if (declared.some(a => !pathBelongsToPartner(a.storagePath, partner.id))) return refuse('An attachment is not in this partner’s folder, so nothing was sent.')
  const tooBig = attachmentSetRefusal(declared)
  if (tooBig) return refuse(tooBig.refusal)
  const loaded = await loadAttachments(supabase, declared)
  if (!loaded.ok) return refuse(loaded.refusal)

  // ── THE ROW GOES IN FIRST, WITH ITS Message-ID ──────────────────────────────────────────────────────
  const fromName = await readFromName(supabase)
  const messageId = newMessageId()
  const built = buildMessage({ doc, subject: subjectIn, messageId, parent: input.parent, fromName, locale: null })
  const recipient = isTest ? input.testRecipient! : input.toAddress
  const { data: inserted, error: insErr } = await supabase.from('outreach_messages').insert({
    partner_id: partner.id,
    direction: 'outbound', status: 'sending', is_test: isTest, source: 'system',
    account: input.sender.account,
    message_id: messageId, in_reply_to: built.inReplyTo, references: built.references,
    subject: built.subject, from_address: OUTREACH_FROM_ADDRESS, to_address: recipient,
    message_date: new Date().toISOString(),
    html_body: built.html, text_body: built.text, attempts: 0,
    attachments: declared,
    ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
  }).select('*').single()
  if (insErr || !inserted) {
    if ((insErr as { code?: string } | null)?.code === '23505' && input.idempotencyKey) {
      const { data: prior } = await supabase.from('outreach_messages')
        .select('id, status, sent_copy, last_error').eq('idempotency_key', input.idempotencyKey).maybeSingle()
      if (prior) return { kind: 'done', payload: { ok: true, duplicate: true, ...(prior as object) }, sent: false }
    }
    return refuse(`The message could not be recorded, so nothing was sent — ${dbDetail(insErr)}`)
  }

  const row = inserted as Parameters<typeof sendRow>[1] & { id: string }
  const sendable = { ...row, attachments: loaded.attachments, from_name: fromName }
  const creds = { mailUser: input.sender.user, mailPass: input.sender.pass }
  const sent = await sendRow(supabase, sendable, { ...creds, isTest, testRecipient: input.testRecipient })
  if (sent.result.status !== 'sent' || !sent.raw) return { kind: 'done', payload: sent.result.payload as Record<string, unknown>, sent: false, rowId: row.id }

  // 🔴 A REAL SEND (never a test) is the partner's first email ⇒ `to_contact` → `contacted`, logged.
  if (!isTest) await applyPartnerAutoStatus(supabase, partner.id, 'send', { last_contacted_at: new Date().toISOString() })

  const raw = sent.raw
  const sentAt = sent.date ?? new Date()
  runAfter('Partner Sent copy', async () => {
    try {
      await fileCopyAndRecord(supabase, sendable, raw, sentAt, creds)
    } catch (e) {
      await supabase.from('outreach_messages').update({ last_error: `post-send: the Sent copy — ${sanitiseMailError(e)}`, updated_at: new Date().toISOString() }).eq('id', row.id)
    }
  })
  return { kind: 'done', payload: { ...(sent.result.payload as Record<string, unknown>), sent_copy: 'pending', post_steps: 'after' }, sent: true, rowId: row.id }
}
