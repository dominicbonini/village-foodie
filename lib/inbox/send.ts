// lib/inbox/send.ts — 🔴 THE ONLY SEND IN ADMIN › INBOX: what happens when Dominic presses Send (inbox-1, 23 November 2026;
// docs/inbox-1-report.md). Called by app/api/admin/inbox/route.ts, action 'send', behind verifyAdmin — and by nothing else (no cron, no
// poll, no schedule: scripts/inbox-1.cjs's census). canAutoSend stays false (lib/enquiries/rules.ts).
//
// THE ORDER:
//   1 · the English as it stands, with any "Note:" lines removed (they never reach a customer);
//   2 · their language: an English reply goes as it is; otherwise the customer-language version — the draft's, if the English is exactly
//       what it was translated from, else 🔴 TRANSLATED AGAIN NOW (Dominic edited it by hand). No model → refused ("Translation isn't
//       switched on yet."), so with no Claude key only English replies can be sent;
//   3 · the send, through the EXISTING delivery:
//       • a prospect → app/api/admin/outreach/mail-send POST (from dominic@, threaded, logged as a reply, every refusal it has);
//       • a partner  → app/api/admin/partners/mail-send POST (from dominic@, threaded);
//       • an enquiry or customer → from hello@ (or the alias they wrote to, when 'enquiries_reply_from_alias' is true): the outreach
//         envelope (composeRaw / rawMailFor / smtpTransportOptions), a Message-ID of ours, In-Reply-To / References onto their email, the
//         SMTP send logged in with hello@'s own credentials, then the Sent copy in hello@'s Sent (fileSentCopy: found, or appended once);
//   4 · the record: the English beside the version sent (inbox_sent; an enquiry's outgoing message holds both too), and only now each of
//       Dominic's comments becomes a SUGGESTED reply_knowledge line (source 'note'), and a hand edit a suggested fact (source 'edit').
import nodemailer from 'nodemailer'
import type Mail from 'nodemailer/lib/mailer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { composeRaw, rawMailFor, smtpTransportOptions, type SendableRow } from '@/lib/outreach-mail-envelope'
import { buildMessage, newMessageId, replySubject, escapeHtml, classifySendFailure } from '@/lib/outreach-mail-message'
import { fileSentCopy, type SentCopyResult, type DeliverRow } from '@/lib/outreach-mail-deliver'
import { sanitiseMailError } from '@/lib/outreach-mail-box'
import { paragraphsFromPlain } from '@/lib/outreach-doc'
import { attachmentSetRefusal, parseOutboundAttachments, pathBelongsToProspect, type OutboundAttachment } from '@/lib/outreach-attachments'
import { pathBelongsToPartner } from '@/lib/partners'
import { loadAttachments } from '@/lib/outreach-attachment-store'
import { customerTextOf, suggestFromEdit, suggestFromComment, type SuggestedLine } from '@/lib/enquiries/learning'
import { translateFinal, type DraftDeps } from '@/lib/inbox/drafting'
import { isEnglish, languageName } from '@/lib/inbox/language'
import { sentNote, INBOX_WORDS, type InboxActionResult } from '@/lib/inbox/types'
import type { ThreadContext } from '@/lib/inbox/read-model'

export interface SendDeps extends DraftDeps {
  /** app/api/admin/outreach/mail-send POST, called as it is, with the admin's own request headers. */
  sendProspect(body: Record<string, unknown>): Promise<Record<string, unknown>>
  /** app/api/admin/partners/mail-send POST, the same way. */
  sendPartner(body: Record<string, unknown>): Promise<Record<string, unknown>>
  /** hello@'s login (lib/outreach-mail-accounts.ts accountForInboxReply), or null when it is not set here. */
  hello: { user: string; pass: string } | null
  /** The sender's display name (outreach_settings from_name), or null for the bare address. */
  fromName(): Promise<string | null>
  /** The SMTP send of composed bytes. Default: nodemailer over SMTP. The harness hands a fake transport. */
  transport?(raw: Buffer, mail: Mail.Options, login: { user: string; pass: string }): Promise<void>
  /** The Sent copy. Default: fileSentCopy into hello@'s Sent. */
  fileCopy?(row: DeliverRow, raw: Buffer, date: Date, login: { user: string; pass: string }): Promise<SentCopyResult>
}
export interface SendRequest { english: string; attachments: unknown; idempotencyKey: string | null }

const s = (v: unknown) => (v == null ? '' : String(v))
const lower = (v: unknown) => s(v).trim().toLowerCase()
const enquiryPathOk = (path: string, enquiryId: string) => s(path).startsWith(`enquiries/${enquiryId}/`)
/** Where an enquiry's attachment lives in the private outreach bucket. */
export const enquiryStoragePath = (enquiryId: string, uuid: string, filename: string) => `enquiries/${enquiryId}/${uuid}-${filename}`

async function defaultTransport(raw: Buffer, mail: Mail.Options, login: { user: string; pass: string }) {
  const t = nodemailer.createTransport(smtpTransportOptions(login.user, login.pass))
  try { await t.sendMail(mail) } finally { try { t.close() } catch { /* sent or failed already */ } }
  void raw
}

/** Send. Returns the page's words for what happened. */
export async function sendReply(deps: SendDeps, ctx: ThreadContext, req: SendRequest): Promise<InboxActionResult> {
  const c = ctx.thread.conversation
  // 1 · the English, without Note: lines
  const english = customerTextOf(s(req.english)).trim()
  if (!english) return { ok: false, refusal: 'There is no reply to send.' }
  // 2 · their language
  const lang = ctx.thread.theirLanguage
  const inEnglish = isEnglish(lang)
  let customer = english
  if (!inEnglish) {
    const d = ctx.thread.draft
    if (d && d.customer && customerTextOf(s(d.translatedFrom)).trim() === english) customer = customerTextOf(d.customer).trim()
    else {
      const t = await translateFinal(deps, english, lang)
      if (!t.ok) return { ok: false, refusal: t.refusal === INBOX_WORDS.translationOff ? INBOX_WORDS.translationOff : t.refusal }
      customer = t.text.trim()
    }
    if (!customer) return { ok: false, refusal: 'The translation came back empty, so nothing was sent.' }
  }
  // the attachments: the CRM's own rule, and each file in this conversation's own folder
  const files = parseOutboundAttachments(req.attachments)
  const bad = attachmentSetRefusal(files)
  if (bad) return { ok: false, refusal: bad.refusal }
  const owns = (f: OutboundAttachment) => ctx.kind === 'prospect' ? pathBelongsToProspect(f.storagePath, ctx.id)
    : ctx.kind === 'partner' ? pathBelongsToPartner(f.storagePath, ctx.id) : enquiryPathOk(f.storagePath, ctx.id)
  if (!files.every(owns)) return { ok: false, refusal: 'One of those files does not belong to this conversation, so nothing was sent.' }

  // 3 · the send
  const doc = { type: 'doc' as const, content: paragraphsFromPlain(customer) }
  let from: string, outreachRowId: string | null = null, enquiryMessageId: string | null = null
  if (ctx.kind === 'prospect' || ctx.kind === 'partner') {
    const latest = ctx.latestRow
    const body: Record<string, unknown> = {
      action: 'send', reply_to_message_id: c.latestInboundId, to: s(latest.from_address), subject: s(latest.subject),
      document: doc, include_quote: ctx.kind === 'prospect' ? true : !!s(latest.html_body).trim(), ...(files.length ? { attachments: files } : {}),
      ...(req.idempotencyKey ? { idempotency_key: req.idempotencyKey } : {}),
      ...(ctx.kind === 'prospect' ? { prospect_id: ctx.id } : { partner_id: ctx.id }),
    }
    const r = ctx.kind === 'prospect' ? await deps.sendProspect(body) : await deps.sendPartner(body)
    if (r.ok !== true) return { ok: false, refusal: s(r.refusal ?? r.error ?? r.message) || 'That was not sent.' }
    if (r.status === 'failed' || r.status === 'uncertain') return { ok: false, refusal: s(r.message) || 'That was not sent.' }
    from = 'dominic@hatchgrab.com'
    outreachRowId = s(r.id) || null
  } else {
    const sent = await sendEnquiryReply(deps, ctx, { customer, english, language: lang, files, idempotencyKey: req.idempotencyKey })
    if (!sent.ok) return { ok: false, refusal: sent.refusal }
    from = sent.from; enquiryMessageId = sent.messageRowId
    if (sent.duplicate) return { ok: true, message: sentNote(languageName(lang), from, inEnglish), sentFrom: from, sentLanguage: lang }
  }

  // 4 · the record, then what Dominic taught it
  await deps.db.from('inbox_sent').insert({
    conversation_key: c.key, enquiry_id: ctx.kind === 'enquiry' ? ctx.id : null, source_message_id: c.latestInboundId,
    outreach_message_id: outreachRowId, enquiry_message_id: enquiryMessageId, language: /^[a-z]{2,3}(-[A-Z]{2})?$/.test(lang) ? lang : null,
    english_text: english.slice(0, 40000), sent_text: customer.slice(0, 40000), from_address: from,
  })
  await learnAfterSend(deps.db, ctx, english, deps.now())
  return { ok: true, message: sentNote(languageName(lang), from, inEnglish), sentFrom: from, sentLanguage: lang }
}

/** After a Send: every comment on this message → a suggested guidance line; a hand edit of the AI's English → a suggested fact. */
export async function learnAfterSend(db: SupabaseClient, ctx: ThreadContext, sentEnglish: string, now: Date): Promise<{ suggested: number }> {
  const c = ctx.thread.conversation
  const ref = c.ref ?? c.key
  const country = ctx.country
  let topics: string[] = []
  const { data: d } = await db.from('inbox_drafts').select('asks').eq('conversation_key', c.key).eq('source_message_id', c.latestInboundId).maybeSingle()
  const asks = (d as { asks?: { topics?: string[] }[] } | null)?.asks
  if (Array.isArray(asks)) topics = [...new Set(asks.flatMap(a => (Array.isArray(a.topics) ? a.topics : [])))]
  let suggested = 0
  const add = async (line: SuggestedLine | null): Promise<string | null> => {
    if (!line) return null
    const { data, error } = await db.from('reply_knowledge').insert({ ...line, status: 'suggested' }).select('id').single()
    if (error) return null
    suggested++
    return (data as { id: string }).id
  }
  const { data: cs } = await db.from('inbox_comments').select('id, comment').eq('conversation_key', c.key).eq('source_message_id', c.latestInboundId).is('sent_at', null)
  for (const row of (cs ?? []) as { id: string; comment: string }[]) {
    const id = await add(suggestFromComment(row.comment, { topics, ref, country }))
    await db.from('inbox_comments').update({ sent_at: now.toISOString(), ...(id ? { knowledge_id: id } : {}) }).eq('id', row.id)
  }
  if (ctx.aiEnglish && ctx.aiEnglish.trim() !== sentEnglish.trim()) await add(suggestFromEdit(ctx.aiEnglish, sentEnglish, { topics, country, ref }))
  return { suggested }
}

/** The enquiry send: from hello@ (or the alias), threaded onto their email, the copy filed in hello@'s Sent. */
async function sendEnquiryReply(deps: SendDeps, ctx: ThreadContext, o: { customer: string; english: string; language: string; files: OutboundAttachment[]; idempotencyKey: string | null }):
  Promise<{ ok: true; from: string; messageRowId: string; duplicate?: boolean } | { ok: false; refusal: string }> {
  const login = deps.hello
  if (!login) return { ok: false, refusal: 'The hello@ mailbox credentials are not set on this environment, so nothing can be sent.' }
  const c = ctx.thread.conversation
  const e = ctx.enquiry ?? {}
  const latest = ctx.latestRow
  const from = ctx.thread.from
  const to = lower(e.email)
  if (!to || !to.includes('@')) return { ok: false, refusal: 'This enquiry has no address to answer, so nothing was sent.' }
  if (o.idempotencyKey) {
    const { data: prior } = await deps.db.from('enquiry_messages').select('id, send_status').eq('idempotency_key', o.idempotencyKey).maybeSingle()
    if (prior) return { ok: true, from, messageRowId: s((prior as { id: string }).id), duplicate: true }
  }
  const loaded = await loadAttachments(deps.db, o.files)
  if (!loaded.ok) return { ok: false, refusal: loaded.refusal }
  const now = deps.now()
  const fromName = await deps.fromName()
  const theirId = s(latest.mail_message_id)
  const parent = theirId ? {
    messageId: theirId, references: s(latest.references) || null, quote: true,
    quoted: {
      fromAddress: to, fromName: s(e.name) || null, toAddress: s(latest.to_address) || from, toName: null, subject: s(latest.subject),
      date: latest.received_at ? new Date(s(latest.received_at)) : now,
      html: s(latest.original_text).split(/\n/).map(l => `<div>${escapeHtml(l) || '<br>'}</div>`).join(''), text: s(latest.original_text),
    },
  } : null
  const built = buildMessage({
    // a contact-form enquiry starts a new thread; its subject carries the ENQ ref, so an answer back joins it (lib/enquiries/rules.ts threadFor)
    subject: `HatchGrab — ${s(e.ref)}`, messageId: newMessageId(), doc: { type: 'doc', content: paragraphsFromPlain(o.customer) }, fromName, parent,
  })
  const subject = parent ? replySubject(s(latest.subject)) : built.subject
  const { data: ins, error } = await deps.db.from('enquiry_messages').insert({
    enquiry_id: ctx.id, direction: 'out', original_text: o.customer.slice(0, 20000), original_language: /^[a-z]{2,3}(-[A-Z]{2})?$/.test(o.language) ? o.language : null,
    english_text: o.english.slice(0, 40000), subject: subject.slice(0, 1000), mail_message_id: built.messageId, in_reply_to: built.inReplyTo, references: built.references,
    mailbox: 'hello/Sent', uid: null, received_at: now.toISOString(), to_address: to, from_address: from, send_status: 'sending', attempts: 1,
    idempotency_key: o.idempotencyKey, attachments: o.files,
  }).select('id').single()
  if (error) {
    if ((error as { code?: string }).code === '23505') return { ok: true, from, messageRowId: '', duplicate: true }
    return { ok: false, refusal: `The reply could not be recorded, so nothing was sent (${error.message}).` }
  }
  const rowId = (ins as { id: string }).id
  const row: SendableRow & DeliverRow = {
    id: rowId, message_id: built.messageId, in_reply_to: built.inReplyTo, references: built.references, subject, to_address: to,
    message_date: now.toISOString(), html_body: built.html, text_body: built.text, attempts: 1, from_name: fromName,
    attachments: loaded.attachments, send_from_address: from,
  }
  let raw: Buffer
  try { raw = await composeRaw(row) } catch (err) {
    await deps.db.from('enquiry_messages').update({ send_status: 'failed', last_error: `compose: ${sanitiseMailError(err)}`.slice(0, 2000), updated_at: new Date().toISOString() }).eq('id', rowId)
    return { ok: false, refusal: 'That message could not be built, so nothing was sent.' }
  }
  try {
    await (deps.transport ?? defaultTransport)(raw, rawMailFor(raw, row), login)
  } catch (err) {
    const outcome = classifySendFailure(err)
    await deps.db.from('enquiry_messages').update({ send_status: outcome, last_error: sanitiseMailError(err).slice(0, 2000), updated_at: new Date().toISOString() }).eq('id', rowId)
    return { ok: false, refusal: outcome === 'uncertain' ? 'May have been sent — check hello@’s Sent folder before sending again.' : 'That was refused by the mail server, so nothing was sent.' }
  }
  await deps.db.from('enquiry_messages').update({ send_status: 'sent', last_error: null, updated_at: new Date().toISOString() }).eq('id', rowId)
  await deps.db.from('enquiries').update({ status: 'answered', snoozed_until: null, updated_at: new Date().toISOString() }).eq('id', ctx.id)
  // the Sent copy — never fatal: the mail has gone
  try {
    const copy = await (deps.fileCopy ?? ((r, b, d, l) => fileSentCopy(r, b, d, { mailUser: l.user, mailPass: l.pass })))(row, raw, now, login)
    await deps.db.from('enquiry_messages').update({ sent_copy: copy.sentCopy, uid: copy.uid, ...(copy.sentCopy === 'absent' ? { last_error: `sent copy: ${copy.reason}`.slice(0, 2000) } : {}), updated_at: new Date().toISOString() }).eq('id', rowId)
  } catch (err) {
    await deps.db.from('enquiry_messages').update({ sent_copy: 'absent', last_error: `sent copy: ${sanitiseMailError(err)}`.slice(0, 2000) }).eq('id', rowId)
  }
  void c
  return { ok: true, from, messageRowId: rowId }
}
