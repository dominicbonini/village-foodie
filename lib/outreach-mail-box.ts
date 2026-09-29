// lib/outreach-mail-box.ts — the IMAP operations the outreach routes share, and the guards that make
// them safe to call.
//
// 🔴 EVERY MAILBOX IS OPENED READ-ONLY EXCEPT ONE CALL. `openReadOnly` issues EXAMINE, which the SERVER
// then refuses to let set a flag. The single exception is `appendToSent`, which writes a COPY of a
// message this app has just sent — it adds, it never modifies, and it is the only function here that is
// not read-only. There is no move, no copy, no delete, no expunge and no flag call anywhere in this file.
//
// 🔴 AND EVERY WALK CHECKS THE COUNT FIRST. Archive and Spam are empty, and `fetch('1:*')` on an empty
// mailbox throws "Command failed" — that is exactly what produced the two errors in the first
// diagnostics run. An empty mailbox is not an error; it is a mailbox with nothing in it.
import { ImapFlow } from 'imapflow'
import {
  OUTREACH_MAIL_HOST, OUTREACH_IMAP_PORT, OUTREACH_SENT_MAILBOX,
} from '@/lib/outreach-mail-config'
import { findPart, attachmentsOf } from '@/lib/outreach-mail-format'

/** The subset of imapflow's body structure `findPart` walks. */
type StructureLike = Parameters<typeof findPart>[0]

/** Code + a capped message. The same shape as the other two routes; never a credential. */
export function sanitiseMailError(err: unknown): string {
  if (!err) return 'unknown error'
  const e = err as { code?: unknown; responseCode?: unknown; message?: unknown }
  const code = typeof e.code === 'string' ? e.code
    : typeof e.responseCode === 'number' ? String(e.responseCode)
    : null
  const raw = typeof e.message === 'string' ? e.message : String(err)
  return code ? `${code}: ${raw.slice(0, 200)}` : raw.slice(0, 200)
}

/** A connected client. The caller owns the logout. */
export function makeImapClient(user: string, pass: string): ImapFlow {
  return new ImapFlow({
    host: OUTREACH_MAIL_HOST,
    port: OUTREACH_IMAP_PORT,
    secure: true,
    auth: { user, pass },
    // The default logger prints the protocol dialogue, AUTH line included. Never on.
    logger: false,
    emitLogs: false,
    disableAutoIdle: true,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })
}

/** How many messages a mailbox holds, without opening it. `null` when the server refuses to say. */
export async function mailboxCount(client: ImapFlow, path: string): Promise<number | null> {
  try {
    const s = await client.status(path, { messages: true })
    return s && typeof s.messages === 'number' ? s.messages : null
  } catch { return null }
}

/**
 * A mailbox's count AND its uidvalidity, without opening it.
 *
 * 🔴 AN EMPTY FOLDER STILL NEEDS ITS uidvalidity. `withReadOnlyMailbox` deliberately does not open an
 * empty mailbox, so the poll never learned the uidvalidity of one — and therefore could not store a
 * watermark for it. That is why hello/Spam and hello/Archive reported "first look" on every run for
 * hours, and why the first message ever to arrive in one of them would have been baselined away.
 * STATUS answers both questions in the one command the count already costs.
 */
export async function mailboxStatus(
  client: ImapFlow, path: string,
): Promise<{ messages: number; uidvalidity: string } | null> {
  try {
    const s = await client.status(path, { messages: true, uidValidity: true })
    if (!s || typeof s.messages !== 'number') return null
    return { messages: s.messages, uidvalidity: String(s.uidValidity ?? '0') }
  } catch { return null }
}

/**
 * Run `fn` against a mailbox opened READ-ONLY, skipping the work entirely when it is empty.
 *
 * 🔴 THE COUNT CHECK IS THE POINT. `fetch('1:*')` against an empty mailbox throws "Command failed" — a
 * real error shape for a perfectly ordinary state — and that is what put two errors in the first
 * diagnostics run against empty Archive and Spam folders. Asking first costs one STATUS command.
 * Returns `{ skipped: true }` for an empty or unreadable mailbox so a caller can say so rather than
 * reporting a failure.
 */
export async function withReadOnlyMailbox<T>(
  client: ImapFlow,
  path: string,
  fn: (count: number) => Promise<T>,
): Promise<{ skipped: true; count: number } | { skipped: false; value: T; count: number }> {
  const count = await mailboxCount(client, path)
  if (count === null || count === 0) return { skipped: true, count: count ?? 0 }
  const lock = await client.getMailboxLock(path, { readOnly: true })
  try {
    return { skipped: false, value: await fn(count), count }
  } finally { lock.release() }
}

/**
 * Is a copy of this Message-ID already in Sent?
 *
 * Namecheap files an authenticated submission itself, so the usual answer is yes and an APPEND would
 * produce a DUPLICATE in Dominic's Sent folder. Asking first is what stops that. Read-only throughout.
 */
export async function findInSent(client: ImapFlow, messageId: string): Promise<{ uid: number; uidValidity: string } | null> {
  const count = await mailboxCount(client, OUTREACH_SENT_MAILBOX)
  if (!count) return null
  const lock = await client.getMailboxLock(OUTREACH_SENT_MAILBOX, { readOnly: true })
  try {
    // SEARCH on the header — the one IMAP command that answers this without reading a body.
    const hits = await client.search({ header: { 'message-id': messageId } }, { uid: true })
    if (!hits || !Array.isArray(hits) || hits.length === 0) return null
    const uid = hits[hits.length - 1]
    const mb = client.mailbox
    const uidValidity = mb && typeof mb === 'object' && 'uidValidity' in mb ? String(mb.uidValidity) : ''
    return { uid: Number(uid), uidValidity }
  } catch { return null } finally { lock.release() }
}

/**
 * APPEND a copy of a message this app sent into Sent, marked `\Seen`.
 *
 * ⚠️ THE ONLY NON-READ-ONLY CALL IN THIS FILE, AND IT ONLY EVER ADDS. It writes a new message; it does
 * not touch an existing one. It is called only after `findInSent` has said the server did not file a
 * copy itself, and never for an inbound message.
 * 🔴 A FAILURE HERE NEVER FAILS THE SEND. The mail has gone; the copy is a convenience. The caller
 * records `sent_copy: 'absent'` and shows "not in Sent folder" on that message.
 */
export async function appendToSent(client: ImapFlow, raw: Buffer | string, date: Date): Promise<{ ok: true; uid: number | null } | { ok: false; error: string }> {
  try {
    const res = await client.append(OUTREACH_SENT_MAILBOX, raw, ['\\Seen'], date)
    const uid = res && typeof res === 'object' && 'uid' in res ? Number((res as { uid?: unknown }).uid) : null
    return { ok: true, uid: Number.isFinite(uid) ? uid : null }
  } catch (err) {
    return { ok: false, error: sanitiseMailError(err) }
  }
}

/**
 * The HTML (and plain) body of one message, by uid, READ-ONLY.
 *
 * 🔴 THIS IS WHAT LETS A CHASE QUOTE AN EMAIL THIS APP DID NOT SEND. The importer stores an Outlook
 * message's headers but not its body — the body stays in the mailbox, where it already is. When a chase
 * replies to one, the quote block needs that body, so it is read here: EXAMINE, and `fetch` emits
 * `BODY.PEEK[…]`, so the message is not marked seen by being quoted.
 */
export async function fetchBodiesByUid(
  client: ImapFlow,
  path: string,
  uid: number,
): Promise<{ html: string | null; text: string | null }> {
  const empty = { html: null, text: null }
  const count = await mailboxCount(client, path)
  if (!count) return empty
  const lock = await client.getMailboxLock(path, { readOnly: true })
  try {
    const msg = await client.fetchOne(String(uid), { uid: true, bodyStructure: true }, { uid: true })
    if (!msg || typeof msg !== 'object' || !('bodyStructure' in msg)) return empty
    const struct = (msg as { bodyStructure?: unknown }).bodyStructure as StructureLike | undefined
    if (!struct) return empty
    const html = findPart(struct, 'text/html')
    const text = findPart(struct, 'text/plain')
    const parts = [html?.part, text?.part].filter((v): v is string => !!v)
    if (!parts.length) return empty
    const full = await client.fetchOne(String(uid), { uid: true, bodyParts: parts }, { uid: true })
    const bp = (full && typeof full === 'object' && 'bodyParts' in full
      ? (full as { bodyParts?: Map<string, Buffer> }).bodyParts
      : undefined) ?? new Map<string, Buffer>()
    const decode = (part: string | undefined, encoding: string | null, charset: string | null): string | null => {
      if (!part) return null
      const buf = bp.get(part.toLowerCase()) ?? bp.get(part)
      if (!buf) return null
      const enc = (encoding ?? '').toLowerCase()
      const bytes = enc === 'base64' ? Buffer.from(buf.toString('ascii'), 'base64')
        : enc === 'quoted-printable' ? Buffer.from(
            buf.toString('binary').replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))),
            'binary')
        : buf
      try { return new TextDecoder((charset ?? 'utf-8').toLowerCase()).decode(bytes) } catch { return bytes.toString('utf8') }
    }
    return {
      html: decode(html?.part, html?.encoding ?? null, html?.charset ?? null),
      text: decode(text?.part, text?.encoding ?? null, text?.charset ?? null),
    }
  } catch { return empty } finally { lock.release() }
}

/**
 * One whole message for the View panel: its bodies and the NAMES of its attachments.
 *
 * 🔴 READ-ONLY, AND NOTHING IS DOWNLOADED THAT IS NOT SHOWN. The mailbox is opened with EXAMINE and
 * `fetch` emits `BODY.PEEK[…]`, so opening an email here does not mark it read in Outlook. Only the
 * text/html and text/plain parts are named in the fetch, so an attachment never crosses the wire —
 * the list of names and sizes comes from the BODYSTRUCTURE, which is metadata the server already sent.
 *
 * ⚠️ A uid IS MEANINGLESS WITHOUT ITS uidvalidity, AND THIS SAYS SO RATHER THAN SHOWING NOTHING. If
 * the mailbox has been recreated (uidvalidity changed) or the message has been moved or deleted, the
 * uid either points at a different message or at none. Both are reported in words — "showing nothing"
 * would look like an empty email, which is the one thing it must not look like.
 */
export async function fetchMessageForView(
  client: ImapFlow,
  path: string,
  uid: number,
  storedUidValidity: number | null,
): Promise<
  | { ok: true; html: string | null; text: string | null; attachments: { filename: string | null; contentType: string; size: number | null }[] }
  | { ok: false; error: string }
> {
  const count = await mailboxCount(client, path)
  if (!count) return { ok: false, error: `The ${path} folder is empty, so that email is no longer there.` }
  const lock = await client.getMailboxLock(path, { readOnly: true })
  try {
    const mb = client.mailbox
    const live = mb && typeof mb === 'object' && 'uidValidity' in mb ? Number(mb.uidValidity) : null
    if (storedUidValidity != null && live != null && String(live) !== String(storedUidValidity)) {
      return { ok: false, error: `The ${path} folder has been rebuilt since this was recorded (uidvalidity changed), so the stored reference no longer points at this email. Run Import past emails to re-record it.` }
    }
    const msg = await client.fetchOne(String(uid), { uid: true, bodyStructure: true }, { uid: true })
    if (!msg || typeof msg !== 'object' || !('bodyStructure' in msg)) {
      return { ok: false, error: `That email is no longer at its recorded place in ${path} — it has been moved or deleted. Run Import past emails to find it again.` }
    }
    const struct = (msg as { bodyStructure?: unknown }).bodyStructure as StructureLike | undefined
    if (!struct) return { ok: false, error: 'The mail server returned no structure for that email.' }
    const attachments = attachmentsOf(struct)
    const bodies = await fetchBodiesByUidLocked(client, uid, struct)
    return { ok: true, html: bodies.html, text: bodies.text, attachments }
  } catch (err) {
    return { ok: false, error: sanitiseMailError(err) }
  } finally { lock.release() }
}

/** The body read, with the mailbox ALREADY open. Shared with `fetchBodiesByUid`, which opens it. */
async function fetchBodiesByUidLocked(
  client: ImapFlow, uid: number, struct: StructureLike,
): Promise<{ html: string | null; text: string | null }> {
  const html = findPart(struct, 'text/html')
  const text = findPart(struct, 'text/plain')
  const parts = [html?.part, text?.part].filter((v): v is string => !!v)
  if (!parts.length) return { html: null, text: null }
  const full = await client.fetchOne(String(uid), { uid: true, bodyParts: parts }, { uid: true })
  const bp = (full && typeof full === 'object' && 'bodyParts' in full
    ? (full as { bodyParts?: Map<string, Buffer> }).bodyParts
    : undefined) ?? new Map<string, Buffer>()
  return {
    html: decodePart(bp, html?.part, html?.encoding ?? null, html?.charset ?? null),
    text: decodePart(bp, text?.part, text?.encoding ?? null, text?.charset ?? null),
  }
}

/** base64 / quoted-printable / 7bit, then the declared charset. Shared by both readers. */
export function decodePart(
  bp: Map<string, Buffer>, part: string | undefined, encoding: string | null, charset: string | null,
): string | null {
  if (!part) return null
  const buf = bp.get(part.toLowerCase()) ?? bp.get(part)
  if (!buf) return null
  const enc = (encoding ?? '').toLowerCase()
  const bytes = enc === 'base64' ? Buffer.from(buf.toString('ascii'), 'base64')
    : enc === 'quoted-printable' ? Buffer.from(
        buf.toString('binary').replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))),
        'binary')
    : buf
  try { return new TextDecoder((charset ?? 'utf-8').toLowerCase()).decode(bytes) } catch { return bytes.toString('utf8') }
}
