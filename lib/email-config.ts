import { HATCHGRAB_LOGO_PNG } from '@/lib/brand'

// ── 🔴 email-sender-1 (9 November 2026, docs/email-sender-1-report.md): EVERY HATCHGRAB EMAIL IS SENT FROM hatchgrab.com ──
// A French prospect's signup/demo emails arrived from hello@villagefoodie.co.uk. hatchgrab.com has been authenticated in Brevo
// since 31 October 2026 (manual V16.10), so the old domain is gone from every HatchGrab path:
//   • HatchGrab's own emails (operator, demo, account, admin notices): From "HatchGrab" <hello@hatchgrab.com>, Reply-To the same.
//   • a truck's emails to its customers (orders, ready, cancellations, refunds, review requests, paperwork shares):
//     From "<truck name>" (or "<truck> via HatchGrab") <donotreply@hatchgrab.com>. Their Reply-To is unchanged in purpose: none on
//     order mail, the truck's own address where one is held, otherwise hello@hatchgrab.com (where the old From would have taken it).
// ⚠️ THE ADDRESSES ARE CODE, NOT ENV. EMAIL_FROM_ADDRESS and NEXT_PUBLIC_SUPPORT_EMAIL are no longer read for a sender: an env
// value cannot put villagefoodie.co.uk back on a From line. scripts/email-sender-1.cjs (in the sweep) fails if any HatchGrab
// email path names a villagefoodie.co.uk sender or reply-to.
export const HATCHGRAB_HELLO = 'hello@hatchgrab.com'
export const HATCHGRAB_NOREPLY = 'donotreply@hatchgrab.com'

// Operator-facing emails — HatchGrab brand. `replyTo` is also where the admin notices go (deletion requests, demo build requests,
// the demo-cleanup and deletion-due digests), and the support address the deletion screen shows.
export const HATCHGRAB_SENDER = {
  name: 'HatchGrab',
  email: HATCHGRAB_HELLO,
  replyTo: HATCHGRAB_HELLO,
}

// Consumer-facing emails — Village Foodie brand. Stays on villagefoodie.co.uk, the only sender that may. ⚠️ No code sends with it
// today (email-sender-1 inventory); scripts/email-sender-1.cjs keeps it out of every HatchGrab email path.
export const VILLAGE_FOODIE_SENDER = {
  name: 'Village Foodie',
  email: 'donotreply@villagefoodie.co.uk',
  replyTo: 'hello@villagefoodie.co.uk',
}

// Truck-branded emails (order confirmations to customers) — use the truck's own name
export function truckSender(truckName: string) {
  return {
    name: truckName,
    email: HATCHGRAB_NOREPLY,
    replyTo: HATCHGRAB_HELLO,
  }
}

/** The Brevo `sender` (and `replyTo`) for a mail sent under the From name `name` — lib/email.ts's two senders. HatchGrab's own
 *  name → hello@hatchgrab.com, Reply-To the same; any other name is a truck's → donotreply@hatchgrab.com and no Reply-To (as
 *  those emails have always had). */
export function brevoFrom(name: string): { sender: { name: string; email: string }; replyTo?: { email: string } } {
  return name === HATCHGRAB_SENDER.name
    ? { sender: { name, email: HATCHGRAB_SENDER.email }, replyTo: { email: HATCHGRAB_SENDER.replyTo } }
    : { sender: { name, email: HATCHGRAB_NOREPLY } }
}

// ⚠️ PNG, NOT SVG, AND THAT IS LOAD-BEARING: email clients do not render SVG. HATCHGRAB_LOGO_PNG is the
// raster variant (640×161); the SVG constants in lib/brand.ts are for the web only. Never swap this.
// The path is imported so it cannot drift from the other call site again — see the note in lib/brand.ts.
// ABSOLUTE URL is required: an email has no origin to resolve a root-relative path against.
export const HATCHGRAB_LOGO_URL =
  `${process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? 'https://www.hatchgrab.com'}${HATCHGRAB_LOGO_PNG}`

export const VF_LOGO_URL =
  `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://villagefoodie.co.uk'}/logos/village-foodie-logo-v2.png`
