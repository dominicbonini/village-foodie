// app/api/admin/outreach/mail-diagnostics/route.ts
// DIAGNOSE-ONLY. What do Dominic's real Outlook-sent outreach emails look like, and which prospect does
// each message in the mailbox belong to?
//
// Two answers in one pass:
//   A · every prospect with an email contact, its log, the Sent messages addressed to it, and any replies
//       from it in INBOX / Archive / Spam, counted separately.
//   B · up to two Sent messages — one first contact, one chase — captured as headers, MIME tree and a
//       SKELETON of the HTML and plain bodies: all markup verbatim, every body text node replaced by its
//       length. The format is the point; the words are not.
//
// ── 🔴 WHAT THIS ROUTE IS FORBIDDEN TO DO, AND HOW THAT IS ENFORCED ─────────────────────────────────
//   • IT CANNOT SEND. There is no nodemailer import and no `sendMail` anywhere in this file.
//   • IT CANNOT CHANGE A FLAG. Every mailbox is opened `{ readOnly: true }` — IMAP EXAMINE, which the
//     SERVER itself refuses to let set \Seen — and every body read goes through `client.fetch`, which
//     emits `BODY.PEEK[…]` (imapflow's own `commands/fetch.js`: "PEEK avoids marking messages as
//     \Seen"). Two independent guarantees, one of them the server's. `messageFlagsAdd`, `messageFlagsSet`
//     and `messageFlagsRemove` appear nowhere here.
//   • IT CANNOT MOVE OR DESTROY ANYTHING. No `append`, `messageMove`, `messageCopy`, `messageDelete` or
//     `expunge` call exists in this file.
//   • IT CANNOT WRITE TO THE DATABASE. The only Supabase calls are `.select()`. No insert, update,
//     upsert, delete or rpc.
//   • IT CANNOT LEAK THE CREDENTIAL. `sanitise` is the only route an error takes to the response,
//     `logger: false` on the client, and the file contains no `console.*`.
//   • IT NEVER DOWNLOADS AN ATTACHMENT. Attachment metadata comes from the body STRUCTURE; no attachment
//     part is ever fetched.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ImapFlow } from 'imapflow'
import { verifyAdmin } from '@/lib/auth/admin'
import { OUTREACH_MAIL_HOST, OUTREACH_IMAP_PORT } from '@/lib/outreach-mail-config'
import { withReadOnlyMailbox } from '@/lib/outreach-mail-box'
import {
  parseHeaderBlock, redactReceivedIps, mimeTreeFrom, attachmentsOf, findPart,
  skeletoniseHtml, skeletonisePlain, addressesOf, sameDay,
  type RawHeader, type MimeNode,
} from '@/lib/outreach-mail-format'

export const runtime = 'nodejs'
// §35 — this opens six mailboxes and walks them. 60s is the budget the caps below are sized against.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// The SAME server-side client app/api/admin/outreach/route.ts uses. Read-only here by discipline, not by
// key: the service role can write, and the proof that nothing does is that `.select()` is the only verb.
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** Mailboxes to read, and what each is for. `Sent` is the format source; the rest are where a reply lands. */
const SENT_BOX = 'Sent'
const REPLY_BOXES = { inbox: 'INBOX', archive: 'Archive', spam: 'Spam' } as const
/** A ceiling per mailbox, so one large folder cannot spend the whole 60s. Reported when it bites. */
const MAX_MESSAGES_PER_BOX = 2000
/** The signature phrase and the ladder kinds live in lib/outreach — not restated here. */
const CHASE_KINDS = new Set(['2_chase_1', '3_chase_2', '4_final_chase'])

/** Identical to mail-health's: code + a capped message, and nothing that can carry a credential. */
function sanitise(err: unknown): string {
  if (!err) return 'unknown error'
  const e = err as { code?: unknown; responseCode?: unknown; message?: unknown }
  const code = typeof e.code === 'string' ? e.code
    : typeof e.responseCode === 'number' ? String(e.responseCode)
    : null
  const raw = typeof e.message === 'string' ? e.message : String(err)
  const message = raw.slice(0, 200)
  return code ? `${code}: ${message}` : message
}

interface SentMessage {
  uid: number
  date: string | null
  subject: string | null
  messageId: string | null
  inReplyTo: string | null
  references: string | null
  hasAttachments: boolean
  attachments: { filename: string | null; contentType: string; size: number | null }[]
  /** Internal only — the recipients this message was matched on. Not returned. */
  recipients: string[]
}
interface ReplyMessage {
  date: string | null
  subject: string | null
  messageId: string | null
  inReplyTo: string | null
  from: string[]
}

const iso = (d: unknown): string | null =>
  d instanceof Date ? d.toISOString() : typeof d === 'string' && d ? new Date(d).toISOString() : null

export async function GET(req: NextRequest) {
  // The SAME gate and the SAME refusal as /api/admin/outreach and mail-health — 404, so the route does
  // not confirm its own existence to someone who cannot use it.
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })

  const errors: { step: string; error: string }[] = []
  const fail = (step: string, err: unknown) => { errors.push({ step, error: sanitise(err) }) }

  const user = process.env.OUTREACH_MAIL_USER
  const password = process.env.OUTREACH_MAIL_PASSWORD
  if (!user || !password) {
    return NextResponse.json({
      region: process.env.VERCEL_REGION ?? null,
      generatedAt: new Date().toISOString(),
      envPresent: { user: !!user, password: !!password },
      prospects: [], samples: [],
      errors: [{ step: 'env', error: 'OUTREACH_MAIL_USER or OUTREACH_MAIL_PASSWORD is not set' }],
    })
  }

  // ── 1 · THE CONTACT LOG (SELECT only) ───────────────────────────────────────────────────────────
  // Every email contact, newest first. `channel = 'email'` is the filter the brief names.
  type ContactRow = { prospect_id: string; contacted_at: string | null; direction: string | null; kind: string | null }
  let contacts: ContactRow[] = []
  try {
    const { data, error } = await supabase
      .from('outreach_contacts')
      .select('prospect_id, contacted_at, direction, kind')
      .eq('channel', 'email')
      .order('contacted_at', { ascending: false })
    if (error) throw error
    contacts = (data ?? []) as ContactRow[]
  } catch (err) { fail('contacts', err) }

  const byProspect = new Map<string, ContactRow[]>()
  for (const c of contacts) {
    if (!c.prospect_id) continue
    const list = byProspect.get(c.prospect_id) ?? []
    list.push(c); byProspect.set(c.prospect_id, list)
  }

  // ── 2 · THE PROSPECTS AND THEIR ADDRESSES (SELECT only) ─────────────────────────────────────────
  // 🔴 `contact_email` LIVES ON discovery_trucks, NOT ON THE PROSPECT — the same embed and the same
  // column app/api/admin/outreach/route.ts reads and writes. Not guessed.
  type ProspectRow = { id: string; discovery_truck_id: string | null; discovery_trucks: { name: string | null; contact_email: string | null } | null }
  let prospectRows: ProspectRow[] = []
  if (byProspect.size > 0) {
    try {
      const { data, error } = await supabase
        .from('outreach_prospects')
        .select('id, discovery_truck_id, discovery_trucks(name, contact_email)')
        .in('id', Array.from(byProspect.keys()))
      if (error) throw error
      prospectRows = (data ?? []) as unknown as ProspectRow[]
    } catch (err) { fail('prospects', err) }
  }

  // ── 3 · THE MAILBOX — ONE CONNECTION, SEQUENTIAL, EVERY BOX READ-ONLY ───────────────────────────
  const client = new ImapFlow({
    host: OUTREACH_MAIL_HOST,
    port: OUTREACH_IMAP_PORT,
    secure: true,
    auth: { user, pass: password },
    // The default logger prints the protocol dialogue, AUTH line included. Never on.
    logger: false,
    emitLogs: false,
    disableAutoIdle: true,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })

  const sent: SentMessage[] = []
  const replies: Record<keyof typeof REPLY_BOXES, ReplyMessage[]> = { inbox: [], archive: [], spam: [] }
  const capped: string[] = []
  /** Reported rather than errored: an empty Archive or Spam is the normal state, not a fault. */
  const emptyBoxes: string[] = []
  /** uid → body structure, kept for Part B so the samples need no second walk of the folder. */
  const sentStructure = new Map<number, Parameters<typeof mimeTreeFrom>[0]>()
  let connected = false

  try {
    await client.connect()
    connected = true

    // ── Sent: the format source, and the "who was written to" index ──────────────────────────────
    try {
      // 🔴 readOnly: true ⇒ IMAP EXAMINE. The server will not let this session set a flag.
      // ⚠️ AND THE COUNT IS CHECKED FIRST — see `withReadOnlyMailbox`. `fetch('1:*')` on an EMPTY
      // mailbox throws "Command failed", which is what produced this route's two errors on its first
      // run against empty Archive and Spam folders. An empty mailbox is a state, not a failure.
      const lock = await client.getMailboxLock(SENT_BOX, { readOnly: true })
      try {
        let n = 0
        // `fetch` emits BODY.PEEK[…]; envelope and bodyStructure are metadata commands that touch no flag.
        for await (const msg of client.fetch('1:*', { uid: true, envelope: true, bodyStructure: true })) {
          if (n++ >= MAX_MESSAGES_PER_BOX) { capped.push(SENT_BOX); break }
          const env = msg.envelope
          const struct = msg.bodyStructure as Parameters<typeof mimeTreeFrom>[0] | undefined
          const atts = struct ? attachmentsOf(struct) : []
          if (struct) sentStructure.set(msg.uid, struct)
          sent.push({
            uid: msg.uid,
            date: iso(env?.date),
            subject: env?.subject ?? null,
            messageId: env?.messageId ?? null,
            inReplyTo: env?.inReplyTo ?? null,
            // `references` is not on the envelope; it is read per-sample in Part B from the headers.
            references: null,
            hasAttachments: atts.length > 0,
            attachments: atts,
            recipients: [...addressesOf(env?.to), ...addressesOf(env?.cc)],
          })
        }
      } finally { lock.release() }
    } catch (err) { fail(`mailbox:${SENT_BOX}`, err) }

    // ── The three places a reply can be ───────────────────────────────────────────────────────────
    for (const [key, path] of Object.entries(REPLY_BOXES) as [keyof typeof REPLY_BOXES, string][]) {
      try {
        // 🔴 THE SAME GUARD THE SENDING CODE USES. Archive and Spam are empty, and asking for their
        // messages threw. `withReadOnlyMailbox` checks the count, opens read-only, and reports a skip.
        const res = await withReadOnlyMailbox(client, path, async () => {
          let n = 0
          for await (const msg of client.fetch('1:*', { uid: true, envelope: true })) {
            if (n++ >= MAX_MESSAGES_PER_BOX) { capped.push(path); break }
            const env = msg.envelope
            replies[key].push({
              date: iso(env?.date),
              subject: env?.subject ?? null,
              messageId: env?.messageId ?? null,
              inReplyTo: env?.inReplyTo ?? null,
              from: addressesOf(env?.from),
            })
          }
          return true
        })
        if (res.skipped) emptyBoxes.push(path)
      } catch (err) { fail(`mailbox:${path}`, err) }
    }

    // ── 4 · PART A — one row per prospect ────────────────────────────────────────────────────────
    const prospects = prospectRows.map(p => {
      const log = (byProspect.get(p.id) ?? []).map(c => ({
        contacted_at: c.contacted_at, direction: c.direction, kind: c.kind,
      }))
      const name = p.discovery_trucks?.name ?? null
      const raw = p.discovery_trucks?.contact_email ?? null
      const email = raw ? raw.trim().toLowerCase() : null
      if (!email) {
        // 🔴 SAID, NOT SKIPPED. A prospect logged as emailed with no address on its truck is the most
        // interesting row in the report, not one to drop quietly.
        return { prospect_id: p.id, name, email: null, noEmailAddress: true, log, sent: [], replies: { inbox: [], archive: [], spam: [] } }
      }
      const theirs = sent.filter(m => m.recipients.includes(email))
      return {
        prospect_id: p.id, name, email, noEmailAddress: false, log,
        sent: theirs.map(({ recipients, ...m }) => { void recipients; return m }),
        replies: {
          inbox: replies.inbox.filter(r => r.from.includes(email)).map(({ from, ...r }) => { void from; return r }),
          archive: replies.archive.filter(r => r.from.includes(email)).map(({ from, ...r }) => { void from; return r }),
          spam: replies.spam.filter(r => r.from.includes(email)).map(({ from, ...r }) => { void from; return r }),
        },
      }
    })

    // ── 5 · PART B — up to two format samples ────────────────────────────────────────────────────
    // 🔴 MATCHED BY ADDRESS AND DAY, NEVER BY LOG ORDER. `contacted_at` on a manually dated row is
    // midnight, so two rows on one day carry the same instant and their order says nothing.
    // `firstOnly` — 🔴 A FIRST CONTACT HAS NO PARENT. Matching on the log date alone picked chases
    // logged on the same day as something else, and a chase is not a specimen of a first contact: it
    // carries a quote block and a Re: subject, which is the opposite of what that sample is for.
    const pick = (wanted: (kind: string | null) => boolean, firstOnly = false) => {
      let best: { uid: number; date: string | null } | null = null
      for (const p of prospects) {
        if (!p.email) continue
        const days = p.log.filter(l => wanted(l.kind)).map(l => l.contacted_at)
        for (const m of p.sent) {
          if (firstOnly && m.inReplyTo) continue
          if (!days.some(d => sameDay(d, m.date))) continue
          if (!best || (m.date ?? '') > (best.date ?? '')) best = { uid: m.uid, date: m.date }
        }
      }
      return best
    }
    const wanted = [
      { label: '1_first_contact', hit: pick(k => k === '1_first_contact', true) },
      { label: 'chase', hit: pick(k => !!k && CHASE_KINDS.has(k)) },
    ].filter(w => w.hit) as { label: string; hit: { uid: number; date: string | null } }[]

    const samples: unknown[] = []
    if (wanted.length) {
      try {
        const lock = await client.getMailboxLock(SENT_BOX, { readOnly: true })
        try {
          for (const w of wanted) {
            try {
              const struct = sentStructure.get(w.hit.uid)
              const html = struct ? findPart(struct, 'text/html') : null
              const plain = struct ? findPart(struct, 'text/plain') : null
              // ⚠️ ONE fetch per sample, by UID, asking for the header block and the two text parts ONLY.
              // No attachment part is named, so none is transferred. Every one of these is BODY.PEEK[…].
              const parts = [
                'HEADER',
                ...(html ? [html.part] : []),
                ...(plain ? [plain.part] : []),
              ]
              const msg = await client.fetchOne(String(w.hit.uid), { uid: true, bodyParts: parts }, { uid: true })
              const bp = (msg && typeof msg === 'object' && 'bodyParts' in msg
                ? (msg as { bodyParts?: Map<string, Buffer> }).bodyParts
                : undefined) ?? new Map<string, Buffer>()
              const decode = (key: string | undefined, encoding: string | null, charset: string | null): string | null => {
                if (!key) return null
                const buf = bp.get(key.toLowerCase()) ?? bp.get(key)
                if (!buf) return null
                const enc = (encoding ?? '').toLowerCase()
                const bytes = enc === 'base64' ? Buffer.from(buf.toString('ascii'), 'base64')
                  : enc === 'quoted-printable' ? Buffer.from(
                      buf.toString('binary').replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))),
                      'binary')
                  : buf
                const cs = (charset ?? 'utf-8').toLowerCase()
                try { return new TextDecoder(cs).decode(bytes) } catch { return bytes.toString('utf8') }
              }
              // 🔴 THE KEY IS NOT 'header'. imapflow keys `bodyParts` by the section it actually
              // asked for, and for a whole-header fetch that is the empty string — so
              // `bp.get('header')` missed every time and every sample came back `headers: []`. Every
              // plausible spelling is tried, and then any single entry that LOOKS like a header block,
              // so a future imapflow change cannot silently empty this again.
              const looksLikeHeaders = (b: Buffer | undefined) =>
                !!b && /^[A-Za-z-]+:/m.test(b.toString('utf8').slice(0, 400))
              let headerBuf = bp.get('header') ?? bp.get('HEADER') ?? bp.get('') ?? bp.get('text')
              if (!looksLikeHeaders(headerBuf)) {
                for (const [, v] of bp) if (looksLikeHeaders(v)) { headerBuf = v; break }
              }
              const rawHeaders = headerBuf?.toString('utf8') ?? ''
              const headers: RawHeader[] = redactReceivedIps(parseHeaderBlock(rawHeaders))
              const htmlRaw = decode(html?.part, html?.encoding ?? null, html?.charset ?? null)
              const plainRaw = decode(plain?.part, plain?.encoding ?? null, plain?.charset ?? null)
              const htmlSkel = htmlRaw ? skeletoniseHtml(htmlRaw) : null
              const plainSkel = plainRaw ? skeletonisePlain(plainRaw) : null
              const mimeTree: MimeNode | null = struct ? mimeTreeFrom(struct) : null
              samples.push({
                label: w.label,
                uid: w.hit.uid,
                date: w.hit.date,
                headers,
                mimeTree,
                htmlSkeleton: htmlSkel?.text ?? null,
                htmlSkeletonCapped: htmlSkel?.capped ?? false,
                plainSkeleton: plainSkel?.text ?? null,
                plainSkeletonCapped: plainSkel?.capped ?? false,
              })
            } catch (err) { fail(`sample:${w.label}`, err) }
          }
        } finally { lock.release() }
      } catch (err) { fail('samples', err) }
    }

    return NextResponse.json({
      region: process.env.VERCEL_REGION ?? null,
      generatedAt: new Date().toISOString(),
      counts: { sent: sent.length, inbox: replies.inbox.length, archive: replies.archive.length, spam: replies.spam.length },
      cappedMailboxes: capped,
      emptyMailboxes: emptyBoxes,
      prospects,
      samples,
      errors,
    })
  } catch (err) {
    fail('imap', err)
    return NextResponse.json({
      region: process.env.VERCEL_REGION ?? null,
      generatedAt: new Date().toISOString(),
      prospects: [], samples: [], errors,
    })
  } finally {
    // LOGOUT, not a dropped socket, so no half-open session is left on the mail server.
    if (connected) { try { await client.logout() } catch { /* already gone */ } }
  }
}
