// app/api/admin/outreach/mail-health/route.ts
// DIAGNOSE-ONLY. Can production log in to the outreach mailbox?
//
// Three independent LOGIN checks against Namecheap Private Email — SMTP 465 (implicit TLS), SMTP 587
// (STARTTLS) and IMAP 993 — run in sequence, each with its own ceiling, none able to throw past the
// handler. The answer is the point; nothing is sent, nothing is read, nothing is marked.
//
// ── 🔴 WHAT THIS ROUTE IS FORBIDDEN TO DO, AND HOW THAT IS ENFORCED ─────────────────────────────────
//   • IT CANNOT SEND. `transporter.verify()` is the only nodemailer call in this file; `sendMail` appears
//     nowhere in it. `verify()` opens the connection, says EHLO, authenticates and hangs up — the SMTP
//     conversation stops before MAIL FROM, so there is no envelope and no message to send.
//   • IT CANNOT READ A MESSAGE. `client.list()` enumerates folders and `client.status()` asks the server
//     for a count. Neither opens a mailbox. `mailboxOpen`, `fetch`, `search`, `download`,
//     `messageFlagsAdd` and `messageFlagsSet` appear nowhere in this file, so no message is fetched and
//     no \Seen flag can move — the failure mode that would make a diagnostic destructive.
//   • IT CANNOT LEAK THE CREDENTIAL. Every error goes through `sanitise` before it reaches the response,
//     and nothing in this file logs. See that function's own note.
//
// ⚠️ NO UI, NO STATE, NO WRITES. This route reads two environment variables and talks to a mail server.
// It touches no truck, no prospect, no template and no database row.
import { NextRequest, NextResponse } from 'next/server'
import nodemailer, { type Transporter } from 'nodemailer'
import { ImapFlow } from 'imapflow'
import { verifyAdmin } from '@/lib/auth/admin'
import {
  OUTREACH_MAIL_HOST,
  OUTREACH_SMTP_PORT_IMPLICIT_TLS,
  OUTREACH_SMTP_PORT_STARTTLS,
  OUTREACH_IMAP_PORT,
  OUTREACH_MAIL_CHECK_TIMEOUT_MS,
} from '@/lib/outreach-mail-config'

// Node, not Edge: nodemailer and imapflow open raw TLS sockets, which the Edge runtime has no API for.
export const runtime = 'nodejs'
// §35 — A ROUTE THAT BLOCKS FOR TENS OF SECONDS DECLARES ITS OWN `maxDuration`. Three 10-second checks in
// sequence is a 30-second worst case, and the platform default (~10–15s) would kill it mid-check and
// report a timeout that says nothing about the mailbox. 30 is the budget the checks are sized against.
export const maxDuration = 30
// A health check must never be served from a cache: the answer is about this moment.
export const dynamic = 'force-dynamic'

/** One check's verdict. `ms` is always present so a slow success and a fast failure are both readable. */
interface CheckResult {
  ok: boolean
  ms: number
  error: string | null
}

interface ImapCheckResult extends CheckResult {
  inboxMessages: number | null
  folders: { path: string; name: string; specialUse: string | null; flags: string[] }[]
}

/**
 * 🔴 THE ONLY ROUTE AN ERROR TAKES TO THE RESPONSE.
 *
 * A mail library's error object is a rich thing — `command`, `response`, the full server dialogue, and on
 * some failures the AUTH line that was sent. `authData`, `data` and `response` are exactly where a
 * password can surface, so none of them is read: this returns a code and a message and nothing else,
 * and the message is capped so a server that echoes a long line cannot smuggle one out inside it.
 *
 * ⚠️ IT IS ALSO WHY THIS FILE LOGS NOTHING AT ALL. A `console.error(err)` anywhere here would print the
 * whole object to the platform log, which is the same disclosure by a different door — and the username
 * is not logged either, because a mailbox address is the half of a credential pair that identifies the
 * person. The response tells the admin WHETHER it worked and the server's own words for why not; if more
 * is ever needed, it is a new decision, not a quiet widening of this one.
 */
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

/** Race a check against its own ceiling, so one unreachable port cannot spend the whole budget. */
async function withTimeout<T>(label: string, ms: number, run: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * SMTP LOGIN ONLY. `verify()` connects, EHLOs, authenticates and closes.
 * 🔴 There is no `sendMail` call in this function, this file, or anywhere added by this task.
 */
async function checkSmtp(port: number, starttls: boolean, user: string, pass: string): Promise<CheckResult> {
  const started = Date.now()
  let transporter: Transporter | null = null
  try {
    transporter = nodemailer.createTransport({
      host: OUTREACH_MAIL_HOST,
      port,
      // 465 is TLS from the first byte; 587 connects in the clear and upgrades. `requireTLS` makes the
      // upgrade mandatory, so a server that quietly declines STARTTLS is a FAILURE here rather than a
      // silent plaintext login — which is the answer this check exists to give.
      secure: !starttls,
      ...(starttls ? { requireTLS: true } : {}),
      auth: { user, pass },
      // Belt and braces on a library that can read attachments off disk and over the network. Nothing
      // here composes a message, but a transport that CANNOT reach the filesystem or fetch a URL is one
      // fewer thing to reason about if this file is ever extended.
      disableFileAccess: true,
      disableUrlAccess: true,
      // The library's own ceilings, inside the outer race, so a half-open socket is given up on too.
      connectionTimeout: OUTREACH_MAIL_CHECK_TIMEOUT_MS,
      greetingTimeout: OUTREACH_MAIL_CHECK_TIMEOUT_MS,
      socketTimeout: OUTREACH_MAIL_CHECK_TIMEOUT_MS,
      logger: false,
      debug: false,
    })
    await withTimeout(`smtp${port}`, OUTREACH_MAIL_CHECK_TIMEOUT_MS, () => transporter!.verify())
    return { ok: true, ms: Date.now() - started, error: null }
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: sanitise(err) }
  } finally {
    // `close()` does not throw, but it is pooled state and a leaked socket on a serverless invocation is
    // a real cost; guarded anyway so a close failure cannot become the route's answer.
    try { transporter?.close() } catch { /* nothing to report — the verdict is already decided */ }
  }
}

/**
 * IMAP LOGIN ONLY, plus the two read-only interrogations the answer needs.
 * 🔴 `list()` enumerates folders and `status()` asks for a count. NEITHER OPENS A MAILBOX, so nothing is
 * fetched and no \Seen flag can move. There is no `mailboxOpen`, `fetch`, `search` or flag call here.
 */
async function checkImap(user: string, pass: string): Promise<ImapCheckResult> {
  const started = Date.now()
  const empty = { inboxMessages: null, folders: [] as ImapCheckResult['folders'] }
  const client = new ImapFlow({
    host: OUTREACH_MAIL_HOST,
    port: OUTREACH_IMAP_PORT,
    secure: true,
    auth: { user, pass },
    // 🔴 `false`, NOT a custom logger. ImapFlow's default logger writes the protocol dialogue to stdout,
    // and that dialogue contains the AUTH line. This is the single most important line in the file for
    // keeping the password out of the platform log.
    logger: false,
    emitLogs: false,
    // Nothing here waits on the server to volunteer anything, so IDLE is pure cost on a serverless
    // invocation — and it keeps a socket open past the work.
    disableAutoIdle: true,
    connectionTimeout: OUTREACH_MAIL_CHECK_TIMEOUT_MS,
    greetingTimeout: OUTREACH_MAIL_CHECK_TIMEOUT_MS,
    socketTimeout: OUTREACH_MAIL_CHECK_TIMEOUT_MS,
  })
  try {
    return await withTimeout(`imap${OUTREACH_IMAP_PORT}`, OUTREACH_MAIL_CHECK_TIMEOUT_MS, async () => {
      await client.connect()
      const listed = await client.list()
      // `status` returns `false` when the server refuses the command rather than throwing.
      const status = await client.status('INBOX', { messages: true })
      return {
        ok: true,
        ms: Date.now() - started,
        error: null,
        inboxMessages: status && typeof status.messages === 'number' ? status.messages : null,
        // Flattened to plain JSON: `flags` is a Set, which serialises to `{}` if handed to the response
        // as it is, and `specialUse` is optional.
        folders: listed.map(f => ({
          path: f.path,
          name: f.name,
          specialUse: f.specialUse ?? null,
          flags: Array.from(f.flags ?? []),
        })),
      }
    })
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: sanitise(err), ...empty }
  } finally {
    // LOGOUT, not a dropped socket: a clean QUIT leaves no half-open session on the mail server, and a
    // provider that counts concurrent connections will not hold one open against the next check.
    try { await client.logout() } catch { /* already gone, or never connected */ }
  }
}

export async function GET(req: NextRequest) {
  // 🔴 THE SAME GATE, AND THE SAME REFUSAL, AS /api/admin/outreach — `verifyAdmin`, answering 404 rather
  // than 401 so the route does not confirm its own existence to someone who cannot use it. Copying the
  // status as well as the helper is the point: a diagnostic that 401s where its neighbour 404s tells an
  // unauthenticated caller that there is something here.
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })

  const user = process.env.OUTREACH_MAIL_USER
  const password = process.env.OUTREACH_MAIL_PASSWORD
  const envPresent = { user: !!user, password: !!password }

  // ⚠️ BOOLEANS, AND NOTHING IS ATTEMPTED. Reporting the values — even the username — would put a
  // credential in an admin's browser history for no diagnostic gain: "is it set" is the whole question at
  // this stage, and a connection attempt with a missing half would fail for a reason that says nothing.
  if (!user || !password) {
    return NextResponse.json({
      region: process.env.VERCEL_REGION ?? null,
      envPresent,
    })
  }

  // IN SEQUENCE, not in parallel: three simultaneous logins from one IP is what a mail host's brute-force
  // heuristics are built to notice, and the whole point of this route is to be allowed to log in.
  const smtp465 = await checkSmtp(OUTREACH_SMTP_PORT_IMPLICIT_TLS, false, user, password)
  const smtp587 = await checkSmtp(OUTREACH_SMTP_PORT_STARTTLS, true, user, password)
  const imap = await checkImap(user, password)

  return NextResponse.json({
    region: process.env.VERCEL_REGION ?? null,
    envPresent,
    smtp465,
    smtp587,
    imap,
  })
}
