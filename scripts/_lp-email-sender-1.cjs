// scripts/_lp-email-sender-1.cjs — email-sender-1's NAMED CHANGES (9 November 2026; docs/email-sender-1-report.md), for the older
// harnesses that compare an email (or the deletion screen) with a capture taken before it. A MODULE (shared_modules in
// scripts/harnesses.json): scripts/email-sender-1.cjs proves the work itself; this file lets every older comparison name exactly
// what changed and nothing else.
//
//   email-sender-1-hatchgrab-sender   HatchGrab's own emails: From hello@villagefoodie.co.uk (or, for the email-change routes,
//                                     NEXT_PUBLIC_SUPPORT_EMAIL — the 1c fixture's support@hatchgrab.test) → hello@hatchgrab.com;
//                                     a Reply-To of hello@villagefoodie.co.uk → hello@hatchgrab.com; the email-change routes and the
//                                     deletion request gain Reply-To hello@hatchgrab.com; an admin copy addressed to the old
//                                     inbox (HATCHGRAB_SENDER.replyTo) now goes to hello@hatchgrab.com.
//   email-sender-1-truck-sender       a truck's email to its customer: From donotreply@villagefoodie.co.uk → donotreply@hatchgrab.com.
//   email-sender-1-deletion-address   the account-deletion screen's support address (HATCHGRAB_SENDER.replyTo) reads hello@hatchgrab.com.
// PRECISE: each transform changes only those values, and returns its input untouched where they are absent (the view then fails).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')

const OLD_HELLO = 'hello@villagefoodie.co.uk'
const OLD_NOREPLY = 'donotreply@villagefoodie.co.uk'
const HELLO = 'hello@hatchgrab.com'
const NOREPLY = 'donotreply@hatchgrab.com'
const FIXTURE_SUPPORT = 'support@hatchgrab.test'    // scripts/_lp1c-api.cjs's NEXT_PUBLIC_SUPPORT_EMAIL

/** True on a tree with email-sender-1 (lib/email-config.ts names HATCHGRAB_NOREPLY). */
const LANDED = (() => { try { return /export const HATCHGRAB_NOREPLY = 'donotreply@hatchgrab\.com'/.test(fs.readFileSync(path.join(__dirname, '..', 'lib/email-config.ts'), 'utf8')) } catch { return false } })()

/** Apply `fn` to a value that may be a JSON string of itself (as the 1c captures hold some views). */
function viaJson(v, fn) {
  if (typeof v === 'string' && (v[0] === '{' || v[0] === '[')) {
    try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(fn(p)) } catch { /* not JSON */ }
    return v
  }
  return fn(v)
}

// ── 1c's API captures: { …, sends: [{ from, to, replyTo, subject, html, text }] } (scripts/_lp1c-api.cjs) ───────────────────────
const API_VIEWS = /^1c\/api\/(GB|US)\|(save-email|deletion\|post|forgot-password|change-email|resend-verification|build-request)\|/
const GAINS_REPLY_TO = /^1c\/api\/(GB|US)\|(change-email|resend-verification|deletion\|post)\|/
const FROM_ENV = /^1c\/api\/(GB|US)\|(change-email|resend-verification)\|/
function oneSend(s, id) {
  if (!s || typeof s !== 'object' || !s.from) return s
  const r = { ...s }
  if (s.from.name === 'HatchGrab' && (s.from.email === OLD_HELLO || (s.from.email === FIXTURE_SUPPORT && FROM_ENV.test(id)))) r.from = { ...s.from, email: HELLO }
  if (s.replyTo && s.replyTo.email === OLD_HELLO) r.replyTo = { ...s.replyTo, email: HELLO }
  else if (s.replyTo === null && GAINS_REPLY_TO.test(id) && r.from.email === HELLO) r.replyTo = { email: HELLO }
  if (Array.isArray(s.to)) r.to = s.to.map(x => (x && x.email === OLD_HELLO ? { ...x, email: HELLO } : x))
  return r
}
function apiSends(v, id) {
  return viaJson(v, o => (o && typeof o === 'object' && Array.isArray(o.sends) ? { ...o, sends: o.sends.map(s => oneSend(s, id)) } : o))
}

// ── a Brevo request body (us-rehearsal-fixes records them): a truck's From on the old domain → donotreply@hatchgrab.com ─────────
function brevoBody(b) {
  if (!b || typeof b !== 'object' || !b.sender || b.sender.email !== OLD_NOREPLY || b.sender.name === 'HatchGrab' || 'replyTo' in b) return b
  return { ...b, sender: { ...b.sender, email: NOREPLY } }
}

// ── the deletion screen (components/manage/DeleteAccountSection.tsx SUPPORT_EMAIL) ───────────────────────────────────────────────
function deletionAddress(html) {
  if (typeof html !== 'string' || !html.includes(`mailto:${OLD_HELLO}`)) return html
  return html.split(`mailto:${OLD_HELLO}`).join(`mailto:${HELLO}`).split(`>${OLD_HELLO}</a>`).join(`>${HELLO}</a>`)
}

/** Entries in scripts/_lp2-named.cjs's shape (language-phase-2 and the 1c harness read that table). */
const LP2_ENTRIES = !LANDED ? [] : [
  { id: 'email-sender-1-hatchgrab-sender', part: 'email-sender-1 (9 Nov 2026)', country: 'both',
    what: '⚠️ RE-PINNED (email-sender-1, 9 November 2026): HatchGrab\'s own emails are From hello@hatchgrab.com (was hello@villagefoodie.co.uk, or NEXT_PUBLIC_SUPPORT_EMAIL for the email-change routes), Reply-To hello@hatchgrab.com (added on the email-change and deletion emails), and the admin copies go to hello@hatchgrab.com — PRECISE (scripts/_lp-email-sender-1.cjs)',
    views: id => API_VIEWS.test(id), expect: (b, id) => apiSends(b, id) },
]
/** Entries in scripts/_lp1d2-named.cjs's shape (view ids `<area>/<GB|US>|…`). */
const LP1D2_ENTRIES = !LANDED ? [] : [
  { id: 'email-sender-1-deletion-address', country: 'both', agent: 'email-sender-1 (9 Nov 2026)',
    what: '⚠️ RE-PINNED (email-sender-1, 9 November 2026): the account-deletion screen\'s support address (HATCHGRAB_SENDER.replyTo) reads hello@hatchgrab.com, in its mailto: link and its text — PRECISE',
    views: id => /^wada\/(GB|US)\|(settings\|deletion|delete\|)/.test(id),
    expect: b => require('./_lp2-named.cjs').mapStrings(b, deletionAddress) },
]

module.exports = { LANDED, LP2_ENTRIES, LP1D2_ENTRIES, apiSends, brevoBody, deletionAddress, OLD_HELLO, OLD_NOREPLY, HELLO, NOREPLY }
