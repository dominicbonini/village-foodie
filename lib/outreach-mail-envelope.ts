// lib/outreach-mail-envelope.ts — the exact nodemailer options an outreach send uses.
//
// 🔴 THIS EXISTS SO THE HARNESS CAN BUILD THE REAL MESSAGE. `scripts/outreach-mail-send.cjs` hands
// `mailFor()` to a nodemailer `streamTransport`, which composes the RFC822 bytes without opening a
// socket, and then reads the header block off those bytes. If the route built its own object inline, the
// harness would be checking a lookalike and the thing that actually leaves the building would be unproven.
import nodemailer from 'nodemailer'
import type Mail from 'nodemailer/lib/mailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import {
  OUTREACH_MAIL_HOST, OUTREACH_SMTP_SEND_PORT, OUTREACH_SMTP_EHLO_NAME,
  OUTREACH_FROM_ADDRESS, OUTREACH_FROM_NAME,
} from '@/lib/outreach-mail-config'

export interface SendableRow {
  message_id: string
  /** The sender's display name for this message, or null for the bare address. */
  from_name?: string | null
  in_reply_to: string | null
  references: string | null
  subject: string | null
  to_address: string | null
  message_date: string | null
  html_body: string | null
  text_body: string | null
}

export function smtpTransportOptions(user: string, pass: string): SMTPTransport.Options {
  return {
    host: OUTREACH_MAIL_HOST,
    port: OUTREACH_SMTP_SEND_PORT,
    secure: true,
    // ⚠️ THE EHLO NAME IS OUR DOMAIN, not the Vercel container's hostname. A greeting that does not match
    // the sending domain is a spam signal, and the container's name changes on every deploy.
    name: OUTREACH_SMTP_EHLO_NAME,
    auth: { user, pass },
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  }
}

/**
 * The message itself.
 *
 * 🔴 NOTHING IS ADDED THAT SAYS "GENERATED". The premise of the feature is that these are the same
 * personal emails Dominic was sending by hand from Outlook, and a single machine header — an X-Mailer, a
 * List-Unsubscribe, a campaign id — undoes that for every recipient and every spam filter that reads it.
 * `lib/outreach-mail-message.ts#ALLOWED_HEADERS` is the list, and `scripts/outreach-mail-send.cjs` reads
 * the composed bytes to prove the message carries nothing outside it.
 * ⚠️ `xMailer: false` IS A GUARD, NOT A FIX. nodemailer 10 only stamps X-Mailer when it is ASKED to
 * (`mailer/mail-message.js#setMailerHeader` returns early on a falsy `data.xMailer`), so today this
 * changes nothing — it is here so that a default coming back, or a transport-level default being set
 * somewhere else, cannot quietly sign Dominic's emails.
 */
export function mailFor(row: SendableRow): Mail.Options {
  // 🔴 THE DISPLAY NAME IS DATA, AND nodemailer DOES THE QUOTING. A name containing a comma, a quote
  // or a non-ASCII character each need different treatment in an RFC5322 header — `Bonini, Dominic`
  // must be quoted or the comma reads as an address separator, and an accented name needs encoded-word
  // form. Handing over `{ name, address }` lets the library that knows those rules apply them; building
  // the string here would be a fourth reimplementation of a spec that is easy to get subtly wrong.
  // ⚠️ AN EMPTY NAME FALLS BACK TO THE BARE ADDRESS — the behaviour that shipped before the setting
  // existed. This never refuses.
  const name = (row.from_name ?? OUTREACH_FROM_NAME ?? '').trim()
  return {
    from: name ? { name, address: OUTREACH_FROM_ADDRESS } : OUTREACH_FROM_ADDRESS,
    to: row.to_address ?? '',
    subject: row.subject ?? '',
    messageId: row.message_id,
    ...(row.in_reply_to ? { inReplyTo: row.in_reply_to } : {}),
    ...(row.references ? { references: row.references } : {}),
    html: row.html_body ?? '',
    text: row.text_body ?? '',
    date: row.message_date ? new Date(row.message_date) : new Date(),
    xMailer: false,
  }
}

/**
 * 🔴 COMPOSE THE RFC822 BYTES ONCE, AND SEND EXACTLY THOSE BYTES.
 *
 * ── THE DEFECT THIS FIXES ──────────────────────────────────────────────────────────────────────────
 * `deliver` used to read the composed message off the send's own result:
 *
 *     const info = await transporter.sendMail(mail)
 *     raw = (info as { message?: Buffer }).message ?? null      // ← ALWAYS null over SMTP
 *     …
 *     } else if (raw) { await appendToSent(client, raw, …) }    // ← therefore never reached
 *
 * `info.message` is set by the **stream** transport and by no other
 * (`nodemailer/dist/cjs/stream-transport/index.js`: `message: Buffer.concat(chunks, chunklen)`). The
 * SMTP transport's info carries `accepted`, `rejected`, `response`, `messageId` and `envelope` — and
 * no `message`. So after a real send `raw` was null, the APPEND branch was skipped silently, and
 * because `appendToSent` was never called there was no error to record: `sent_copy = 'absent'`,
 * `last_error = null`. 🧪 That is exactly the row Dominic found.
 *
 * ⚠️ IT WAS INVISIBLE TO THE HARNESS BY CONSTRUCTION. The harness composes with `streamTransport`
 * precisely so it can read the bytes — the one transport where that field IS populated. The test was
 * passing on the only configuration in which the production code path could not fail.
 *
 * ── AND WHY THE BYTES MUST BE THE SAME BYTES ───────────────────────────────────────────────────────
 * Composing twice — once to send, once to file — produces two different messages: `Date` moves, and a
 * boundary string is random per composition. The Sent copy would then differ from what the prospect
 * received, in a way nobody would notice until a thread failed to match. So: compose once here, hand
 * the same Buffer to SMTP as `raw`, and APPEND that same Buffer.
 */
export async function composeRaw(row: SendableRow): Promise<Buffer> {
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' })
  const info = await composer.sendMail(mailFor(row))
  const msg = (info as { message?: Buffer }).message
  if (!msg) throw new Error('the message could not be composed')
  return Buffer.isBuffer(msg) ? msg : Buffer.from(String(msg))
}

/**
 * The SMTP send of pre-composed bytes.
 * ⚠️ `envelope` IS EXPLICIT because `raw` bypasses the header-derived envelope: nodemailer is handed
 * bytes, not fields, so MAIL FROM and RCPT TO must be stated or there is nobody to deliver to.
 */
export function rawMailFor(raw: Buffer, row: SendableRow): Mail.Options {
  return {
    raw,
    envelope: { from: OUTREACH_FROM_ADDRESS, to: [row.to_address ?? ''] },
  }
}
