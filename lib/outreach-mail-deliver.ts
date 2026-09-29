// lib/outreach-mail-deliver.ts — sending bytes that already exist, and filing the copy.
//
// 🔴 THIS IS THE ONLY CODE THAT PUTS AN OUTREACH EMAIL ON A SOCKET. It was private to
// app/api/admin/outreach/mail-send/route.ts until the reply poll needed to retry a temporary failure;
// rather than copy it, it moved here and the route imports it. Three callers, one implementation:
//   • a manual Send,
//   • a manual Retry from the prospect's Emails list,
//   • the poll's automatic retry (temporary failures only — see lib/outreach-mail-poll-rules.ts).
//
// ⚠️ IT NEVER COMPOSES A NEW MESSAGE. Every caller hands it a row that already exists, with its own
// stored Message-ID and bodies, and `composeRaw` rebuilds exactly those bytes. Nothing in this file
// can create an email that Dominic did not write.
import nodemailer from 'nodemailer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { OUTREACH_SENT_MAILBOX } from '@/lib/outreach-mail-config'
import { smtpTransportOptions, mailFor, composeRaw, rawMailFor } from '@/lib/outreach-mail-envelope'
import { classifySendFailure } from '@/lib/outreach-mail-message'
import { makeImapClient, findInSent, appendToSent, sanitiseMailError } from '@/lib/outreach-mail-box'

/** The columns a send needs off an `outreach_messages` row. */
export interface DeliverRow {
  id: string
  /** 🔴 WHICH MAILBOX THIS MESSAGE BELONGS TO. A retry and a Save-to-Sent use the ROW'S account, not
   *  the primary — the copy has to go where the rest of that thread already is. */
  account?: string | null
  message_id: string
  in_reply_to: string | null
  references: string | null
  subject: string | null
  to_address: string | null
  message_date: string | null
  html_body: string | null
  text_body: string | null
  attempts: number
  is_test?: boolean
  /** Attached in-process from `outreach_settings`, never a column. */
  from_name?: string | null
}

/** How long to wait before asking Sent a second time. */
const SENT_REFETCH_DELAY_MS = 3_000

export interface SentCopyResult {
  sentCopy: 'server_filed' | 'appended' | 'absent'
  mailbox: string | null
  uid: number | null
  uidvalidity: string | null
  /** Why it is absent. Sanitised; never a credential. Empty when a copy was found or made. */
  reason: string
}

/**
 * Put a copy of a sent message in Sent — or say why there is not one.
 *
 * 🔴 THE SEQUENCE, AND WHY EACH STEP IS THERE:
 *   1. SEARCH Sent for the Message-ID. Namecheap files an authenticated submission itself, so the
 *      usual answer is yes and an APPEND would put a SECOND copy in Dominic's Sent folder.
 *   2. ⚠️ IF ABSENT, WAIT ~3 SECONDS AND ASK AGAIN. Server-side filing is not synchronous with the
 *      SMTP `250`; the first search can lose a race it was never going to win, and appending on that
 *      answer is how a duplicate appears a moment later.
 *   3. Still absent → APPEND the exact bytes that were sent, flagged `\Seen`.
 *
 * ⚠️ NEVER FATAL. The mail has gone; the copy is a convenience. Every failure is recorded as a reason
 * rather than raised, and the message row keeps `status: 'sent'`.
 */
export async function fileSentCopy(
  row: DeliverRow, raw: Buffer, date: Date,
  env: { mailUser: string; mailPass: string },
): Promise<SentCopyResult> {
  const miss = (reason: string): SentCopyResult =>
    ({ sentCopy: 'absent', mailbox: null, uid: null, uidvalidity: null, reason })
  const client = makeImapClient(env.mailUser, env.mailPass)
  try {
    await client.connect()
    let found = await findInSent(client, row.message_id)
    if (!found) {
      await new Promise(r => setTimeout(r, SENT_REFETCH_DELAY_MS))
      found = await findInSent(client, row.message_id)
    }
    if (found) {
      return { sentCopy: 'server_filed', mailbox: OUTREACH_SENT_MAILBOX, uid: found.uid, uidvalidity: found.uidValidity || null, reason: '' }
    }
    const appended = await appendToSent(client, raw, date)
    if (appended.ok) {
      return { sentCopy: 'appended', mailbox: OUTREACH_SENT_MAILBOX, uid: appended.uid, uidvalidity: null, reason: '' }
    }
    return miss(`append refused — ${appended.error}`)
  } catch (err) {
    return miss(sanitiseMailError(err))
  } finally {
    try { await client.logout() } catch { /* already gone */ }
  }
}

/**
 * The SMTP send, the status write and the Sent copy.
 * 🔴 SHARED BY THREE CALLERS NOW: a manual send, a manual retry, and the poll's automatic retry of a
 * temporary failure. It was a private function in the send route until 29 September 2026; the poll
 * needed it, and a second copy of "send these bytes and record what happened" is the last thing this
 * feature needs. It takes its Supabase client as a parameter rather than closing over a module-level
 * one, so nothing here assumes which route it is running in.
 */
export interface DeliverResult {
  ok: boolean
  status: 'sent' | 'failed' | 'uncertain'
  payload: Record<string, unknown>
}

export async function deliver(
  supabase: SupabaseClient,
  row: DeliverRow,
  env: { mailUser: string; mailPass: string; isTest: boolean; testRecipient?: string },
): Promise<DeliverResult> {
  // 🔴 BOTH FROM `lib/outreach-mail-envelope`, which is what the harness composes its bytes from.
  const transporter = nodemailer.createTransport(smtpTransportOptions(env.mailUser, env.mailPass))
  const mail = mailFor(row)
  let raw: Buffer
  try {
    raw = await composeRaw(row)
  } catch (err) {
    // Composition happens before the socket, so nothing has been sent and `failed` is the honest word.
    await supabase.from('outreach_messages')
      .update({ status: 'failed', last_error: `compose: ${sanitiseMailError(err)}`, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    return { ok: false, status: 'failed', payload: {
      ok: false, id: row.id, status: 'failed',
      error: sanitiseMailError(err), message: 'That message could not be built, so nothing was sent.',
    } }
  }
  await supabase.from('outreach_messages')
    .update({ status: 'sending', attempts: (row.attempts ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq('id', row.id)

  try {
    // 🔴 THE EXACT BYTES THAT WILL BE FILED ARE THE EXACT BYTES THAT GO. See `composeRaw` for the
    // defect this replaces: the old code read `info.message` off the SMTP result, where that field
    // does not exist, so `raw` was always null and no copy was ever appended.
    await transporter.sendMail(rawMailFor(raw, row))
    await supabase.from('outreach_messages')
      .update({ status: 'sent', last_error: null, updated_at: new Date().toISOString() }).eq('id', row.id)
  } catch (err) {
    const outcome = classifySendFailure(err)
    await supabase.from('outreach_messages')
      .update({ status: outcome, last_error: sanitiseMailError(err), updated_at: new Date().toISOString() }).eq('id', row.id)
    try { transporter.close() } catch { /* the verdict is already decided */ }
    return { ok: false, status: outcome, payload: {
      ok: false, id: row.id, status: outcome,
      error: sanitiseMailError(err),
      message: outcome === 'uncertain'
        ? 'May have been sent — check your Sent folder before retrying.'
        : 'That was refused by the mail server.',
    } }
  }
  try { transporter.close() } catch { /* sent already */ }

  const copy = await fileSentCopy(row, raw, (mail.date as Date) ?? new Date(), env)
  await supabase.from('outreach_messages').update({
    sent_copy: copy.sentCopy, mailbox: copy.mailbox, uid: copy.uid, uidvalidity: copy.uidvalidity,
    // 🔴 A MISSING COPY NOW SAYS WHY. `sent_copy: 'absent'` with `last_error: null` was the shape of
    // the defect: nothing had even been attempted, so nothing had failed. An absent copy records its
    // reason; a successful one clears the field rather than leaving a stale one behind.
    ...(copy.sentCopy === 'absent' ? { last_error: `sent copy: ${copy.reason}` } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', row.id)
  const sentCopy = copy.sentCopy

  return { ok: true, status: 'sent', payload: {
    ok: true, id: row.id, status: 'sent', sent_copy: sentCopy,
    subject: row.subject, threaded: !!row.in_reply_to,
    ...(sentCopy === 'absent' ? { note: 'Sent, but not in your Sent folder.' } : {}),
  } }
}
