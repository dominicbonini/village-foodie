// lib/whatsapp/alert-copy.ts
// The six WhatsApp alert emails, as PURE functions. No I/O, no clock, no environment: every input is an
// argument, so a harness can assert the exact words without a network and without a database.
//
// ── WHO EACH ONE IS FOR ─────────────────────────────────────────────────────────────────────────────
//   limit_80, limit_100, payment_blocked          → THE OPERATOR (trucks.contact_email)
//   token_refresh_failing, token_refresh_urgent,
//   token_invalid                                  → THE ADMIN (ADMIN_ALERT_TO)
// 🔴 THE SPLIT IS NOT COSMETIC. An operator can act on "you are running out of replies" and on "add a
// card to WhatsApp". An operator can do NOTHING about an OAuth token refresh failing — that is our
// plumbing, and telling them about it would be alarming noise about a problem they cannot touch.
// ⚠️ SO THE ADMIN EMAILS MAY NAME INTERNALS (truck id, error codes, expiry timestamps) and the operator
// emails MUST NOT. Keep that line where it is.

import { formatLimit } from '@/lib/whatsapp/copy'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/alertsOperator'

// 🔴 THE THREE OPERATOR EMAILS' SENTENCES ARE IN messages/en-GB.json `alertsOperator` (Language Phase 1b), read in the
// truck's language — the optional trailing `locale` (its country's; en-GB when absent). The markup stays here; a bold
// phrase is a <b> tag in its message. Each sentence serves both bodies: HTML (values escaped, <b> → <strong>) and
// text (raw values, tags dropped). The ADMIN emails below go to us, name internals, and stay in English here.
type AlertT = ReturnType<typeof translatorFor<'alertsOperator'>>
const strong = (c: string) => `<strong>${c}</strong>`
const plain = (c: string) => c

export interface AlertEmail { subject: string; html: string; text: string }

/** Truck names come from operator input — never interpolate them raw into HTML. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The shell every one of these uses. Deliberately plain: these are notices, not marketing. */
function shell(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#334155;line-height:1.6">${bodyHtml}<p style="color:#94a3b8;font-size:13px;margin-top:28px">— HatchGrab</p></div>`
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="background:#ea580c;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block">${label}</a></p>`

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// OPERATOR EMAILS
// ════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * 80% of the monthly allowance used.
 * ⚠️ IT IS A HEADS-UP, NOT A PROBLEM. The tone matters: nothing has broken, nothing is required, and an
 * operator who reads this as an error will phone about it. It says what will happen and how to change it.
 */
export function limit80Email(p: {
  truckName: string; used: number; limit: number; resetLabel: string; manageUrl: string
}, locale?: string | null): AlertEmail {
  const t: AlertT = translatorFor(locale, 'alertsOperator')
  const limit = formatLimit(p.limit)
  const subject = t('limit80.subject')
  const html = shell(
    `<p>${t('hi', { name: esc(p.truckName) })}</p>
     <p>${t.markup('limit80.used', { used: String(p.used), limit, b: strong })}</p>
     <p>${t.markup('limit80.nothingStopped', { limit, reset: esc(p.resetLabel), b: strong })}</p>
     <p>${t('limit80.raise')}</p>
     ${button(p.manageUrl, t('limit80.button'))}`
  )
  const text = `${t('hi', { name: p.truckName })}

${t.markup('limit80.used', { used: String(p.used), limit, b: plain })}

${t.markup('limit80.nothingStopped', { limit, reset: p.resetLabel, b: plain })}

${t('limit80.raiseLink')}
${p.manageUrl}

— HatchGrab`
  return { subject, html, text }
}

/**
 * The allowance is gone and automatic replies have stopped for the month.
 * 🔴 THE SECOND PARAGRAPH IS THE IMPORTANT ONE AND MUST NOT BE CUT. An operator reading "WhatsApp has
 * paused" will reasonably assume customers can no longer reach them. They can. Messages still arrive;
 * only the AUTOMATIC REPLY has stopped. Leaving that unsaid invites a truck to think it is off the air.
 */
export function limit100Email(p: {
  truckName: string; limit: number; resetLabel: string; manageUrl: string
}, locale?: string | null): AlertEmail {
  const t: AlertT = translatorFor(locale, 'alertsOperator')
  const limit = formatLimit(p.limit)
  const subject = t('limit100.subject')
  const html = shell(
    `<p>${t('hi', { name: esc(p.truckName) })}</p>
     <p>${t('limit100.usedAll', { limit })}</p>
     <p>${t.markup('limit100.stillReach', { b: strong })}</p>
     <p>${t.markup('limit100.startAgain', { reset: esc(p.resetLabel), b: strong })}</p>
     ${button(p.manageUrl, t('limit100.button'))}`
  )
  const text = `${t('hi', { name: p.truckName })}

${t('limit100.usedAll', { limit })}

${t.markup('limit100.stillReach', { b: plain })}

${t('limit100.startAgainLink', { reset: p.resetLabel })}
${p.manageUrl}

— HatchGrab`
  return { subject, html, text }
}

/**
 * Meta refused a send for a billing reason (error 131042).
 * ⚠️ THIS IS THE OPERATOR'S OWN META ACCOUNT, NOT A HATCHGRAB BILL. Trucks that onboard through Embedded
 * Signup pay Meta directly, so the card is added in WhatsApp Manager and we cannot add it for them. The
 * copy has to make that clear without sounding like we are passing the buck.
 */
export function paymentBlockedEmail(p: {
  truckName: string; manageUrl: string; whatsappManagerUrl: string
}, locale?: string | null): AlertEmail {
  const t: AlertT = translatorFor(locale, 'alertsOperator')
  const subject = t('paymentBlocked.subject')
  const html = shell(
    `<p>${t('hi', { name: esc(p.truckName) })}</p>
     <p>${t('paymentBlocked.stopped')}</p>
     <p>${t.markup('paymentBlocked.stillMessage', { b: strong })}</p>
     <p>${t('paymentBlocked.payDirect')}</p>
     ${button(p.whatsappManagerUrl, t('paymentBlocked.button'))}
     <p style="color:#64748b;font-size:13px">${t.markup('paymentBlocked.settings', { url: p.manageUrl, link: c => `<a href="${p.manageUrl}" style="color:#ea580c">${c}</a>` })}</p>`
  )
  const text = `${t('hi', { name: p.truckName })}

${t('paymentBlocked.stopped')}

${t.markup('paymentBlocked.stillMessage', { b: plain })}

${t('paymentBlocked.payDirectLink')}
${p.whatsappManagerUrl}

${t.markup('paymentBlocked.settings', { url: p.manageUrl, link: plain })}

— HatchGrab`
  return { subject, html, text }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// ADMIN EMAILS — internals are fine here, and nowhere above
// ════════════════════════════════════════════════════════════════════════════════════════════════════

/** Shared body for the two refresh-failure emails, which differ only in urgency and subject. */
function refreshFailureBody(p: {
  truckName: string; truckId: string; daysLeft: number | null; code: number | null; subcode: number | null; urgent: boolean
}): { html: string; text: string } {
  const runway = p.daysLeft === null
    ? 'unknown — no expiry is recorded for this token'
    : p.daysLeft <= 0 ? 'none — the token has already passed its expiry'
    : `${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'}`
  // ⚠️ CODES, NOT MESSAGES. Meta's error prose on the refresh endpoint can echo the request, and the
  // request carries the token in its query string. See lib/whatsapp/meta-admin.ts.
  const codeLine = p.code === null ? 'Meta returned no error code (network failure or unreadable response).'
    : `Meta error code ${p.code}${p.subcode === null ? '' : ` / subcode ${p.subcode}`}.`
  const consequence = p.urgent
    ? 'When it expires, this truck stops sending and receiving WhatsApp until the operator reconnects by hand.'
    : 'There is still time for a later run to succeed, but it has not succeeded yet.'
  const html = shell(
    `<p>The daily token refresh failed for <strong>${esc(p.truckName)}</strong> (<code>${esc(p.truckId)}</code>).</p>
     <p>Time left on the current token: <strong>${runway}</strong>.</p>
     <p>${codeLine}</p>
     <p>${consequence}</p>`
  )
  const text = `The daily token refresh failed for ${p.truckName} (${p.truckId}).

Time left on the current token: ${runway}.

${codeLine}

${consequence}

— HatchGrab`
  return { html, text }
}

/** Refresh failed but the token still has comfortable runway. Informational. */
export function tokenRefreshFailingEmail(p: {
  truckName: string; truckId: string; daysLeft: number | null; code: number | null; subcode: number | null
}): AlertEmail {
  const body = refreshFailureBody({ ...p, urgent: false })
  return { subject: `WhatsApp token refresh failing — ${p.truckName}`, ...body }
}

/**
 * Refresh failed and the token is nearly gone.
 * 🔴 A DIFFERENT SUBJECT LINE IS THE ENTIRE POINT OF SPLITTING THESE TWO. Both land in the same inbox;
 * the subject is what decides whether it is opened today or on Monday.
 */
export function tokenRefreshUrgentEmail(p: {
  truckName: string; truckId: string; daysLeft: number | null; code: number | null; subcode: number | null
}): AlertEmail {
  const body = refreshFailureBody({ ...p, urgent: true })
  return { subject: `URGENT: WhatsApp token expiring — ${p.truckName}`, ...body }
}

/** Meta says the token is not valid. The connection is already down, or will be on the next send. */
export function tokenInvalidEmail(p: {
  truckName: string; truckId: string; code: number | null; subcode: number | null
}): AlertEmail {
  const codeLine = p.code === null ? 'Meta reported the token as not valid.'
    : `Meta error code ${p.code}${p.subcode === null ? '' : ` / subcode ${p.subcode}`}.`
  const html = shell(
    `<p>Meta reports the WhatsApp access token for <strong>${esc(p.truckName)}</strong> (<code>${esc(p.truckId)}</code>) as <strong>no longer valid</strong>.</p>
     <p>${codeLine}</p>
     <p>This truck cannot send WhatsApp replies. A refresh cannot fix an invalid token — the operator has to reconnect WhatsApp from their Settings page.</p>`
  )
  const text = `Meta reports the WhatsApp access token for ${p.truckName} (${p.truckId}) as no longer valid.

${codeLine}

This truck cannot send WhatsApp replies. A refresh cannot fix an invalid token — the operator has to reconnect WhatsApp from their Settings page.

— HatchGrab`
  return { subject: `WhatsApp token invalid — ${p.truckName}`, html, text }
}
