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

/** Per-check ceiling. Three checks run in sequence inside a route whose own `maxDuration` is 30, so the
 *  worst case is 30s of checks against a 30s budget — the checks cannot outlive the handler and leave the
 *  platform to kill it mid-write. See §35: a route that blocks for tens of seconds declares its own. */
export const OUTREACH_MAIL_CHECK_TIMEOUT_MS = 10_000
