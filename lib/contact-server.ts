// lib/contact-server.ts — 🔴 POST /api/contact's work, with its database, rate limits and email sender passed in (contact-1,
// 2 November 2026; docs/contact-1-report.md). app/api/contact/route.ts wires the real ones; scripts/contact-1.cjs passes fakes, so
// no test ever reaches the database, Upstash or Brevo.
//
// THE ORDER, AND WHY:
//   1 · the trap field filled, or the form sent under 3 seconds after the page rendered (or with a forged timestamp) → a bot:
//       answer "sent" (it learns nothing), store nothing, send nothing, spend no rate limit;
//   2 · validate every field with the browser's own rules (lib/contact.ts validateContact);
//   3 · rate limits: 5 an hour per IP address, 20 a day per email address (lib/ratelimit.ts);
//   4 · SAVE FIRST. A failed save is the error answer — never a pretend success, because the message would be lost;
//   5 · then email it to the support inbox through Brevo, Reply-To the visitor. A failed send keeps the row as email_status
//       'failed', logs why, and still answers "sent": the message is safe in the table, and the hourly job
//       (app/api/cron/demo-cleanup) retries it up to 3 more times (retryContactEmails).
// No auto-reply goes to the visitor. Everything sent to us is English (35.an-20: staff-facing).
//
// CONTACT_IP_SALT (server-only, .env.local and Vercel) salts the IP hash and signs the render timestamp. Without it the form still
// works — a real message is never refused for our configuration — but no IP hash is stored and the timing check cannot run; both are
// logged on every message so the gap is visible.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { HATCHGRAB_ORIGIN } from '@/lib/marketing-country'
import { HATCHGRAB_REPLY_TO } from '@/lib/email-signup'
import { CONTACT_MIN_MS, CONTACT_TRAP_FIELD, contactFieldsFrom, validateContact, type ContactResult, type ContactTopic } from '@/lib/contact'

/** The row as stored (supabase/migrations/20261061_contact_1.sql). */
export interface ContactRow {
  id: string; created_at: string; topic: ContactTopic; name: string; email: string; business_name: string | null; message: string
  country: string | null; locale: string | null; page_path: string; ip_hash: string | null
  email_status: 'sent' | 'failed' | null; provider_message_id: string | null; email_attempts: number
}
export interface ContactMail { to: string; replyTo: string; subject: string; text: string; html: string }
export type SendResult = { ok: true; messageId: string | null } | { ok: false; error: string }

export interface ContactDeps {
  insert(row: ContactRow): Promise<{ error: string | null }>
  update(id: string, patch: Partial<ContactRow>): Promise<{ error: string | null }>
  /** true = under the limit. The route fails OPEN on an Upstash error, as every other limiter here does. */
  limitIp(key: string): Promise<boolean>
  limitEmail(key: string): Promise<boolean>
  send(mail: ContactMail): Promise<SendResult>
  now(): Date
  newId(): string
  secret: string | null
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void
}

// ── the render timestamp ────────────────────────────────────────────────────────────────────────────────────────────────
const signOf = (secret: string, ts: string) => createHmac('sha256', secret).update(`contact-render:${ts}`).digest('hex')
/** "<ms>.<hmac>" — rendered into the form by the page, sent back with the message. Unsigned ("<ms>.") without the secret. */
export function contactRenderToken(now: Date, secret: string | null = contactSecret()): string {
  const ts = String(now.getTime())
  return `${ts}.${secret ? signOf(secret, ts) : ''}`
}
/** 'ok' · 'fast' (under 3 seconds, or from the future) · 'forged' (no valid signature) · 'unchecked' (no secret here). */
export function checkRenderToken(token: unknown, now: Date, secret: string | null): 'ok' | 'fast' | 'forged' | 'unchecked' {
  if (!secret) return 'unchecked'
  const m = typeof token === 'string' ? /^(\d{10,16})\.([0-9a-f]{64})$/.exec(token) : null
  if (!m) return 'forged'
  const want = Buffer.from(signOf(secret, m[1]), 'hex'), got = Buffer.from(m[2], 'hex')
  if (want.length !== got.length || !timingSafeEqual(want, got)) return 'forged'
  const age = now.getTime() - Number(m[1])
  return age < CONTACT_MIN_MS ? 'fast' : 'ok'
}

export const contactSecret = (): string | null => process.env.CONTACT_IP_SALT || null
/** sha256 of the salted address; null without the salt (nothing unsalted is ever stored). */
export const ipHashOf = (ip: string | null, salt: string | null): string | null => (ip && salt ? createHash('sha256').update(`${salt}:${ip}`).digest('hex') : null)

// ── the email to us (English: 35.an-20) ───────────────────────────────────────────────────────────────────────────────
export const TOPIC_EN: Record<ContactTopic, string> = { question: 'A question about HatchGrab', account: 'Help with my account', comparison: 'A correction to a comparison page', other: 'Something else' }
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ').trim()
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
function englishName(type: 'region' | 'language', code: string | null): string {
  if (!code) return 'unknown'
  try { return new Intl.DisplayNames(['en'], { type }).of(code) ?? code } catch { return code }
}
/** "Monday 2 November 2026 at 19:30:05 GMT" — UK time, whatever the server's zone. */
export const ukTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'full', timeStyle: 'long' }).format(new Date(iso))

export const supportInbox = () => process.env.NEXT_PUBLIC_SUPPORT_EMAIL || HATCHGRAB_REPLY_TO

export function contactMail(row: ContactRow, to: string = supportInbox()): ContactMail {
  const country = englishName('region', row.country), language = englishName('language', row.locale ? row.locale.split('-')[0] : null)
  const subject = oneLine(`[HatchGrab contact] ${TOPIC_EN[row.topic]} — ${row.name} (${country}, ${language})`)
  const text = [
    `Topic: ${TOPIC_EN[row.topic]}`,
    `Name: ${row.name}`,
    `Email: ${row.email}`,
    `Truck or business name: ${row.business_name || '—'}`,
    `Country: ${country}${row.country ? ` (${row.country})` : ''}`,
    `Language: ${language}${row.locale ? ` (${row.locale})` : ''}`,
    `Sent from: ${HATCHGRAB_ORIGIN}${row.page_path}`,
    `Time: ${ukTime(row.created_at)}`,
    '',
    'Message:',
    row.message,
    '',
    `Reply to this email to answer ${row.name} at ${row.email}. (Message ${row.id})`,
  ].join('\n')
  // The HTML part is the same text, escaped, nothing else — no markup from the visitor can reach the inbox.
  const html = `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;color:#334155;line-height:1.5">${esc(text)}</pre>`
  return { to, replyTo: row.email, subject, text, html }
}

/** One send through Brevo, from the verified hello@hatchgrab.com sender. Never throws. */
export async function brevoSend(mail: ContactMail, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) return { ok: false, error: 'BREVO_API_KEY not set' }
  try {
    const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'HatchGrab', email: HATCHGRAB_REPLY_TO },
        to: [{ email: mail.to }],
        replyTo: { email: mail.replyTo },
        subject: mail.subject,
        textContent: mail.text,
        htmlContent: mail.html,
      }),
      signal: AbortSignal.timeout(8_000),
    })
    const body = await res.text()
    if (!res.ok) return { ok: false, error: `Brevo ${res.status}: ${body.slice(0, 300)}` }
    let messageId: string | null = null
    try { messageId = (JSON.parse(body) as { messageId?: string }).messageId ?? null } catch { /* 201 with no JSON body */ }
    return { ok: true, messageId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── the submission ─────────────────────────────────────────────────────────────────────────────────────────────────────
const COUNTRY_RE = /^[A-Z]{2}$/, LOCALE_RE = /^[a-z]{2}-[A-Z]{2}$/
const pathOf = (v: unknown) => (typeof v === 'string' && /^\/[^\s]{0,499}$/.test(v) ? v : '/contact')
const keyOf = (s: string) => createHash('sha256').update(s).digest('hex')

export async function submitContact(raw: unknown, ip: string | null, deps: ContactDeps): Promise<{ status: number; body: ContactResult }> {
  const log = deps.log ?? ((l, m) => console[l](m))
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { status: 400, body: { ok: false, code: 'failed' } }
  const body = raw as Record<string, unknown>
  const now = deps.now()

  // 1 · bots: the trap, then the clock. "Sent", nothing stored, nothing spent.
  if (typeof body[CONTACT_TRAP_FIELD] === 'string' && (body[CONTACT_TRAP_FIELD] as string).trim()) {
    log('info', '[contact] trap field filled — treated as a bot, nothing stored')
    return { status: 200, body: { ok: true } }
  }
  const clock = checkRenderToken(body.rendered, now, deps.secret)
  if (clock === 'fast' || clock === 'forged') {
    log('info', `[contact] render timestamp ${clock} — treated as a bot, nothing stored`)
    return { status: 200, body: { ok: true } }
  }

  // 2 · the same rules as the browser
  const f = contactFieldsFrom(body)
  const fields = validateContact(f)
  if (Object.keys(fields).length) return { status: 400, body: { ok: false, code: 'invalid', fields } }

  // 3 · 5 an hour per address, 20 a day per email
  const ipHash = ipHashOf(ip, deps.secret)
  if (ip && !(await deps.limitIp(ipHash ?? keyOf(`ip:${ip}`)))) return { status: 429, body: { ok: false, code: 'rate_limited' } }
  if (!(await deps.limitEmail(keyOf(`email:${f.email.toLowerCase()}`)))) return { status: 429, body: { ok: false, code: 'rate_limited' } }

  // 4 · save first
  const row: ContactRow = {
    id: deps.newId(), created_at: now.toISOString(), topic: f.topic, name: f.name, email: f.email, business_name: f.business || null,
    message: f.message, country: typeof body.country === 'string' && COUNTRY_RE.test(body.country) ? body.country : null,
    locale: typeof body.locale === 'string' && LOCALE_RE.test(body.locale) ? body.locale : null, page_path: pathOf(body.page),
    ip_hash: ipHash, email_status: null, provider_message_id: null, email_attempts: 0,
  }
  if (clock === 'unchecked') log('warn', '[contact] CONTACT_IP_SALT is not set: no timing check and no IP hash for this message')
  const saved = await deps.insert(row)
  if (saved.error) {
    log('error', `[contact] could not save a message (${row.id}): ${saved.error}`)
    return { status: 500, body: { ok: false, code: 'failed' } }
  }

  // 5 · then email it; a failed send keeps the row for the retry
  await deliver(row, deps, log)
  return { status: 200, body: { ok: true } }
}

/** Send one saved row and record the outcome on it. */
async function deliver(row: ContactRow, deps: Pick<ContactDeps, 'send' | 'update'>, log: NonNullable<ContactDeps['log']>): Promise<boolean> {
  const sent = await deps.send(contactMail(row))
  const attempts = row.email_attempts + 1
  const patch: Partial<ContactRow> = sent.ok
    ? { email_status: 'sent', provider_message_id: sent.messageId, email_attempts: attempts }
    : { email_status: 'failed', email_attempts: attempts }
  if (!sent.ok) log('error', `[contact] email failed for message ${row.id} (attempt ${attempts}): ${sent.error} — kept as 'failed'`)
  const { error } = await deps.update(row.id, patch)
  if (error) log('error', `[contact] could not record the send result for ${row.id}: ${error}`)
  return sent.ok
}

// ── the retry (the hourly job) ────────────────────────────────────────────────────────────────────────────────────────
/** The first send plus up to 3 retries. */
export const CONTACT_MAX_ATTEMPTS = 4
/** A row still unsent this long after it was saved lost its first send (the function stopped between save and send). */
export const CONTACT_STUCK_MINUTES = 10
export const CONTACT_RETRY_BATCH = 20

export interface RetryDeps extends Pick<ContactDeps, 'send' | 'update' | 'now' | 'log'> {
  /** The rows to retry: email_status 'failed' (or never set and older than CONTACT_STUCK_MINUTES), under CONTACT_MAX_ATTEMPTS. */
  pending(stuckBeforeIso: string): Promise<ContactRow[]>
}
export async function retryContactEmails(deps: RetryDeps): Promise<{ tried: number; sent: number }> {
  const log = deps.log ?? ((l, m) => console[l](m))
  const stuckBefore = new Date(deps.now().getTime() - CONTACT_STUCK_MINUTES * 60_000).toISOString()
  const rows = (await deps.pending(stuckBefore)).filter(r => r.email_attempts < CONTACT_MAX_ATTEMPTS && r.email_status !== 'sent').slice(0, CONTACT_RETRY_BATCH)
  let sent = 0
  for (const r of rows) if (await deliver(r, deps, log)) sent++
  if (rows.length) log('info', `[contact] retried ${rows.length} unsent message(s): ${sent} sent`)
  return { tried: rows.length, sent }
}
