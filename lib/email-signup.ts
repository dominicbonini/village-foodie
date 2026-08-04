// lib/email-signup.ts
// The two OPERATOR-FACING emails of the self-serve signup chain, and nothing else:
//   1. verification, sent by /api/signup at account creation
//   2. welcome, sent by /api/auth/verify-signup on the FIRST successful verification
//
// ── WHY THIS IS ITS OWN MODULE AND NOT lib/email.ts ────────────────────────────────────────────────
// 🔴 DELIBERATE ISOLATION. lib/email.ts's sendConfirmationEmail is shared with LIVE order and
// cancellation mail (Pizzeria Gusto trades on it). These two emails need two things it does not have —
// a reply-to header, and a from-address that must not fall back to villagefoodie.co.uk — and adding
// either to the shared helper would put a live send path in the blast radius of a signup change.
// So this module posts to Brevo directly, exactly as app/api/admin/create-operator/route.ts already
// does for the admin welcome email. Nothing in lib/email.ts is touched or read.
//
// ── NO SHARED HTML WRAPPER EXISTS ──────────────────────────────────────────────────────────────────
// There is no email-shell/renderEmail helper anywhere in the codebase — the admin welcome email
// hand-rolls its own <div>. The `shell()` below is that same visual vocabulary (Arial, #334155 body,
// 600px column, 180px logo, #ea580c CTA) factored out ONCE so these two emails cannot drift from each
// other. The admin one is left exactly as it is.

import { HATCHGRAB_LOGO_URL } from '@/lib/email-config'

// ⚠️ NOT LIVE YET. This mailbox must exist, and hatchgrab.com must be SPF/DKIM-verified in Brevo,
// before the first real send. Defined ONCE — both emails read it, neither inlines it.
export const HATCHGRAB_REPLY_TO = 'hello@hatchgrab.com'

// Operator-facing from-name is fixed; the address is env-driven per the existing convention
// (EMAIL_FROM_ADDRESS, the same var lib/email.ts reads).
// 🔴 The fallback is DELIBERATELY NOT villagefoodie.co.uk. With EMAIL_FROM_ADDRESS unset these two
// emails send from an as-yet-unverified domain and Brevo will reject them — see the report. That is
// the specified behaviour: this brand must not be introduced to operators under the old domain.
const FROM_NAME = 'HatchGrab'
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || HATCHGRAB_REPLY_TO

/** Truck names come from scraping and operator input — never interpolate them raw into HTML. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * First word of operators.name. That column is written at signup as the local part of the email
 * address (app/api/signup/route.ts), so this is usually a handle rather than a given name — it is
 * still the best thing we hold. Falls back to "there" so the greeting can never render "Hi ," or
 * "Hi undefined"; null-returning callers can then also drop the name from the subject line.
 */
export function firstNameFrom(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0]
  return first || null
}

export const GREETING_FALLBACK = 'there'
/** Used wherever the copy names the truck and we do not have one — the verification email is sent
 *  before any truck exists unless the account came from a demo. */
export const TRUCK_FALLBACK = 'your truck'

function shell(inner: string): string {
  return `
    <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;line-height:1.6;">
      <img src="${HATCHGRAB_LOGO_URL}" alt="HatchGrab"
           width="180" style="margin-bottom:24px;display:block;"/>
      ${inner}
    </div>
  `
}

function button(href: string, label: string): string {
  return `
      <p style="margin:28px 0;">
        <a href="${href}"
           style="background:#ea580c;color:white;padding:14px 28px;
                  text-decoration:none;border-radius:8px;font-weight:bold;
                  display:inline-block;">
          ${label}
        </a>
      </p>`
}

const SIGNOFF_HTML = `<p style="margin-top:28px;">Dominic<br/>Founder, HatchGrab</p>`
const SIGNOFF_TEXT = `Dominic\nFounder, HatchGrab`

/**
 * Posts one email to Brevo. NEVER THROWS — both call sites are on paths (account creation, email
 * verification) whose success must not depend on an email provider being reachable.
 * The 8s timeout is what makes "must not block" true rather than merely likely: without it a hung
 * Brevo connection would hold the verification redirect open for the platform's whole request budget.
 */
async function send(params: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.warn('[email-signup] BREVO_API_KEY not set — skipping email')
    return
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:      { name: FROM_NAME, email: FROM_ADDRESS },
        replyTo:     { email: HATCHGRAB_REPLY_TO },
        to:          [{ email: params.to }],
        subject:     params.subject,
        htmlContent: params.html,
        textContent: params.text,
      }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) console.error('[email-signup] Brevo send failed:', res.status, await res.text())
  } catch (err) {
    console.error('[email-signup] send error:', err)
    // Never throw.
  }
}

/** EMAIL 1 — sent by /api/signup at account creation. Replaces the previous verification email. */
export async function sendSignupVerificationEmail(params: {
  to: string
  firstName: string | null
  truckName: string | null
  verifyUrl: string
}): Promise<void> {
  const who = params.firstName ?? GREETING_FALLBACK
  const truck = params.truckName ?? TRUCK_FALLBACK
  const url = params.verifyUrl

  const html = shell(`
      <p>Hi ${esc(who)},</p>
      <p>Thanks for setting up ${esc(truck)} on HatchGrab.</p>
      ${button(url, 'Confirm my email address')}
      <p>This is the address you'll log in with, and where order alerts go — so it's worth doing now.
         Once it's confirmed I'll send you everything you need to get going.</p>
      <p>You can carry on setting up in the meantime.</p>
      <p>Stuck on anything? Just reply to this — I answer these myself.</p>
      ${SIGNOFF_HTML}
      <p style="color:#64748b;font-size:13px;margin-top:28px;">
        If the button doesn't work, paste this in: ${url}</p>`)

  const text =
    `Hi ${who},\n\n` +
    `Thanks for setting up ${truck} on HatchGrab.\n\n` +
    `Confirm my email address: ${url}\n\n` +
    `This is the address you'll log in with, and where order alerts go — so it's worth doing now. ` +
    `Once it's confirmed I'll send you everything you need to get going.\n\n` +
    `You can carry on setting up in the meantime.\n\n` +
    `Stuck on anything? Just reply to this — I answer these myself.\n\n` +
    `${SIGNOFF_TEXT}\n\n` +
    `If the button doesn't work, paste this in: ${url}`

  await send({ to: params.to, subject: 'Confirm your email address', html, text })
}

/**
 * EMAIL 2 — sent by /api/auth/verify-signup on the FIRST successful verification only.
 *
 * 🔴 THE TRIAL PARAGRAPH IS DELIBERATELY ABSENT. The brief's copy included "It's completely free to
 * get going, and you choose which event starts your free trial…". As of 3 August 2026 a self-serve
 * operator is not on a trial in any sense the product implements: provisioning writes plan 'demo',
 * canAccess() applies its expiry check only to plan === 'trial' so 'demo' access never expires,
 * trial_expires_at is written as null by lib/provision-truck.ts and by nothing else, no nomination
 * mechanism exists, and nothing downgrades anyone. Writing that sentence would promise a mechanism
 * that is not there. It goes in here, unchanged, once trial nomination ships.
 */
export async function sendOperatorWelcomeEmail(params: {
  to: string
  firstName: string | null
  truckName: string | null
  manageUrl: string
}): Promise<void> {
  const who = params.firstName ?? GREETING_FALLBACK
  const truck = params.truckName ?? TRUCK_FALLBACK
  const url = params.manageUrl

  // Name in the subject only when we have one — "Welcome to HatchGrab, there" reads worse than none.
  const subject = params.firstName ? `Welcome to HatchGrab, ${params.firstName}` : 'Welcome to HatchGrab'

  const html = shell(`
      <p>Hi ${esc(who)},</p>
      <p>I'm really pleased to welcome ${esc(truck)} to HatchGrab.</p>
      <p>If you haven't already, setting up is straightforward and takes about fifteen minutes.</p>
      ${button(url, 'Open your dashboard')}
      <p style="color:#64748b;font-size:13px;">Your dashboard: ${url}<br/>
         Worth bookmarking. It works on any device.</p>
      <p>Just reply to this if you get stuck — I answer these myself.</p>
      <p>Looking forward to seeing ${esc(truck)} trading.</p>
      ${SIGNOFF_HTML}`)

  const text =
    `Hi ${who},\n\n` +
    `I'm really pleased to welcome ${truck} to HatchGrab.\n\n` +
    `If you haven't already, setting up is straightforward and takes about fifteen minutes.\n\n` +
    `Your dashboard: ${url}\n` +
    `Worth bookmarking. It works on any device.\n\n` +
    `Just reply to this if you get stuck — I answer these myself.\n\n` +
    `Looking forward to seeing ${truck} trading.\n\n` +
    `${SIGNOFF_TEXT}`

  await send({ to: params.to, subject, html, text })
}
