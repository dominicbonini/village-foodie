// lib/outreach-mail-accounts.ts — WHICH MAILBOX, and the one place that decides.
//
// ── THE TWO ACCOUNTS ────────────────────────────────────────────────────────────────────────────────
// Until 29 September 2026 there was one mailbox: `hello@hatchgrab.com`, with `dominic@hatchgrab.com` as
// an alias on it. Dominic then created `dominic@` as a mailbox in its own right, and replies addressed
// to it now arrive THERE — in a mailbox the poll was not reading. So:
//
//   'dominic'  PRIMARY  — sends, files its Sent copy, and is polled for replies.
//   'hello'    LEGACY   — read-only, kept because every existing row's `mailbox`+`uid` points into it.
//
// 🔴 THE LEGACY ACCOUNT IS NEVER WRITTEN TO AGAIN once the primary is configured. No send, no APPEND.
// It is opened read-only so that an email imported in September still opens today and a chase can still
// quote it. `legacyIsReadOnly` is what the harness asserts, and `accountForSend` is why it holds: the
// send path asks for the PRIMARY account and cannot be handed the legacy one.
//
// ── 🔴 THE FALLBACK, AND WHY IT IS THE DEFAULT ─────────────────────────────────────────────────────
// If `OUTREACH_PRIMARY_USER` / `OUTREACH_PRIMARY_PASSWORD` are absent, everything behaves EXACTLY as it
// did before this file existed: `hello` does the sending, the filing, the polling and the reading, and
// every new row is written with `account: 'hello'`. That is deliberate. This deploy reaches production
// before Dominic has added the variables, and a feature that half-switches on deploy — sending from a
// mailbox whose password is not set — would break outreach for however long the gap is.
// ⚠️ THE SWITCH IS THEREFORE THE ENVIRONMENT VARIABLE, not the deploy. Adding it is the moment the
// primary takes over, and removing it is a complete rollback.
//
// ⚠️ THE FROM ADDRESS IS `dominic@hatchgrab.com` EITHER WAY. It was an alias on hello@ and it is now a
// mailbox; what changes is who LOGS IN, not who the mail is from. Recipients see no difference.

/** The stored `outreach_messages.account` values. The column has a CHECK on exactly these two. */
export const MAIL_ACCOUNTS = ['hello', 'dominic'] as const
export type MailAccount = (typeof MAIL_ACCOUNTS)[number]

export const LEGACY_ACCOUNT: MailAccount = 'hello'
export const PRIMARY_ACCOUNT: MailAccount = 'dominic'

export function isMailAccount(v: unknown): v is MailAccount {
  return typeof v === 'string' && (MAIL_ACCOUNTS as readonly string[]).includes(v)
}

export interface AccountCredentials {
  account: MailAccount
  user: string
  pass: string
}

/** Which env vars each account reads. Named here so the health check can report them without guessing. */
export const ACCOUNT_ENV: Record<MailAccount, { user: string; pass: string }> = {
  hello: { user: 'OUTREACH_MAIL_USER', pass: 'OUTREACH_MAIL_PASSWORD' },
  dominic: { user: 'OUTREACH_PRIMARY_USER', pass: 'OUTREACH_PRIMARY_PASSWORD' },
}

/** The environment, as a plain map, so the harness can supply one without touching `process.env`. */
export type EnvLike = Record<string, string | undefined>

function credsFrom(env: EnvLike, account: MailAccount): AccountCredentials | null {
  const names = ACCOUNT_ENV[account]
  const user = (env[names.user] ?? '').trim()
  const pass = env[names.pass] ?? ''
  if (!user || !pass) return null
  return { account, user, pass }
}

export interface AccountSet {
  /** Every account whose credentials are present, legacy first — the order the poll walks them in. */
  configured: AccountCredentials[]
  /**
   * 🔴 THE ACCOUNT THAT SENDS, FILES ITS SENT COPY AND OWNS NEW ROWS. `dominic` when its variables are
   * set; `hello` otherwise. Null only when NEITHER account is configured, which is the state every
   * caller already had to handle ("the mailbox credentials are not set on this environment").
   */
  primary: AccountCredentials | null
  /** True once `dominic` is configured — i.e. once `hello` has become read-only. */
  primaryConfigured: boolean
}

export function resolveAccounts(env: EnvLike = process.env as EnvLike): AccountSet {
  const hello = credsFrom(env, LEGACY_ACCOUNT)
  const dominic = credsFrom(env, PRIMARY_ACCOUNT)
  const configured = [hello, dominic].filter((c): c is AccountCredentials => c !== null)
  return {
    configured,
    // ⚠️ `dominic` WINS WHEN IT IS THERE. With neither, `primary` is null and callers refuse as before.
    primary: dominic ?? hello,
    primaryConfigured: dominic !== null,
  }
}

/** The credentials for one account, or null when that account is not configured on this environment. */
export function credentialsFor(set: AccountSet, account: MailAccount): AccountCredentials | null {
  return set.configured.find(c => c.account === account) ?? null
}

/**
 * The account a STORED ROW lives in.
 * 🔴 A ROW'S OWN ACCOUNT, NOT THE PRIMARY. `mailbox` + `uid` are meaningless outside the mailbox they
 * were read from: opening a September import against dominic@ would either find nothing or — worse —
 * find a DIFFERENT message that happens to hold that uid. Every read by uid goes through here.
 * ⚠️ A ROW WITH NO ACCOUNT IS LEGACY. The column is `NOT NULL` with no default, so this only arises
 * for a row read through an older code path or a hand-written one; `hello` is where those rows are.
 */
export function accountOfRow(row: { account?: string | null }): MailAccount {
  return isMailAccount(row?.account) ? row.account : LEGACY_ACCOUNT
}

/**
 * 🔴 THE SEND PATH CANNOT BE HANDED THE LEGACY ACCOUNT ONCE THE PRIMARY EXISTS. It asks for this, and
 * this returns the primary. There is no parameter to pass `hello` to a send, which is what makes
 * "the legacy account is never written to again" a property of the code rather than a rule to remember.
 */
export function accountForSend(set: AccountSet): AccountCredentials | null {
  return set.primary
}

/** True when `hello` must be treated as read-only: the primary is configured and it is not `hello`. */
export function legacyIsReadOnly(set: AccountSet): boolean {
  return set.primaryConfigured
}
