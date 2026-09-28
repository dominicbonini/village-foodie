// lib/outreach-mail-config.ts — where Dominic's outreach mailbox lives.
//
// 🔴 A CONSTANT, NOT AN ENVIRONMENT VARIABLE, AND THAT IS DELIBERATE. The host is not a secret and it is
// not per-environment: `dominic@hatchgrab.com` is a Namecheap Private Email mailbox and it is reached at
// `mail.privateemail.com` from a laptop, from preview and from production alike. Putting it in the
// environment would add a value that can differ between them for no reason anyone could act on, and a
// missing one would fail at runtime rather than at compile time.
//
// ⚠️ THE CREDENTIALS ARE NOT HERE. `OUTREACH_MAIL_USER` and `OUTREACH_MAIL_PASSWORD` are Production-only
// environment variables and are read where they are used. Nothing in this file is secret, and nothing
// secret may be added to it.
//
// ⚠️ THIS IS THE OUTREACH MAILBOX ONLY. Transactional email — order confirmations, ready emails, the
// cancellation mail — goes through Brevo and does not come near this host. See §52.

/** Namecheap Private Email, for both SMTP and IMAP. */
export const OUTREACH_MAIL_HOST = 'mail.privateemail.com'

/** SMTP, implicit TLS from the first byte. The port Namecheap documents first. */
export const OUTREACH_SMTP_PORT_IMPLICIT_TLS = 465

/** SMTP, plaintext connect then STARTTLS. Checked as well as 465 because a host that blocks one often
 *  allows the other, and knowing WHICH works is the point of the health check. */
export const OUTREACH_SMTP_PORT_STARTTLS = 587

/** IMAP over TLS. */
export const OUTREACH_IMAP_PORT = 993

// ── 🔴 WHO THE MAIL COMES FROM, WHICH IS NOT WHO LOGS IN ────────────────────────────────────────────
// The LOGIN is `OUTREACH_MAIL_USER` — hello@hatchgrab.com, the real mailbox. Mail is sent FROM
// dominic@hatchgrab.com, an ALIAS on it, which is what Outlook already does through this account. The
// two are deliberately different values: changing who the mail appears to come from must not mean
// changing the credential, and a future second alias is a constant here rather than a new secret.

/** The envelope and header From. An alias on the mailbox that `OUTREACH_MAIL_USER` authenticates as. */
export const OUTREACH_FROM_ADDRESS = 'dominic@hatchgrab.com'

/** 🔴 EMPTY MEANS THE BARE ADDRESS, and that is the measured state, not an omission. Dominic's Outlook
 *  sends with no display name, which is why its own quote header renders
 *  `dominic@hatchgrab.com <dominic@hatchgrab.com>`. A name added here would make every new message
 *  visibly unlike the ones already in the thread. */
export const OUTREACH_FROM_NAME = ''

/** The port outreach is SENT on. 587 also authenticates (proven by the health check) and is the fallback
 *  if 465 is ever blocked, but nothing chooses between them at runtime: one port, one behaviour to reason
 *  about, and a change here is a change anyone can see. */
export const OUTREACH_SMTP_SEND_PORT = OUTREACH_SMTP_PORT_IMPLICIT_TLS

/** The EHLO/HELO name. The sending domain, not the machine's hostname — a Vercel container's hostname is
 *  meaningless to a receiving server and looks like a botnet to a spam filter. */
export const OUTREACH_SMTP_EHLO_NAME = 'hatchgrab.com'

/** The mailbox a system-sent copy is filed in, and the folders the importer walks. */
export const OUTREACH_SENT_MAILBOX = 'Sent'
export const OUTREACH_IMPORT_MAILBOXES = ['Sent', 'INBOX', 'Archive', 'Spam'] as const

/** 🔴 THE DAILY CEILING ON REAL SENDS. Not a rate limit for the mail host's benefit — a guard against a
 *  loop or a mis-click turning a manual outreach tool into a bulk sender overnight. Counts NON-TEST
 *  outbound rows in the Europe/London calendar day. */
export const OUTREACH_DAILY_SEND_CAP = 30

/** The zone every "today" in outreach is measured in. */
export const OUTREACH_TZ = 'Europe/London'

/** Per-check ceiling. Three checks run in sequence inside a route whose own `maxDuration` is 30, so the
 *  worst case is 30s of checks against a 30s budget — the checks cannot outlive the handler and leave the
 *  platform to kill it mid-write. See §35: a route that blocks for tens of seconds declares its own. */
export const OUTREACH_MAIL_CHECK_TIMEOUT_MS = 10_000
