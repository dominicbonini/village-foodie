#!/usr/bin/env node
// scripts/register-payment-domain.cjs
//
// ── 🔴 ONE-OFF BACKFILL: REGISTER THE PAYMENT METHOD DOMAIN ON AN EXISTING CONNECTED ACCOUNT ───────
// Onboarding now does this automatically for every NEW account (app/api/stripe/connect, create_account).
// This is for accounts created BEFORE that existed, which have no registration and therefore silently
// show no Apple Pay and no Google Pay in the Payment Element.
//
// USAGE
//   node scripts/register-payment-domain.cjs acct_1U30w22fB4PPCw2D
//   node scripts/register-payment-domain.cjs acct_… --dry-run     # list only, write nothing
//   node scripts/register-payment-domain.cjs --all                # every operator with an account
//
// ✅ SAFE TO RUN TWICE. It lists first and only creates what is missing, which is Stripe's own guidance
// ("do not register a domain more than once per account"). A second run prints `already registered` and
// writes nothing at all.
//
// 🔴 SANDBOX ONLY, BY THE SAME GUARD THE APP USES. STRIPE_SECRET_KEY must start with sk_test_.
// ⚠️ AND THAT MATTERS FOR GOING LIVE: registering in LIVE mode also covers sandboxes, but registering in
// a SANDBOX DOES NOT COVER LIVE. When live accounts are switched on, this must be run again with a live
// key against every live connected account, or wallets will be missing in production.
//
// 🔴 THE PLATFORM ACCOUNT IS NOT THE ANSWER AND THIS DOES NOT TOUCH IT. These are DIRECT charges, so the
// truck's account is the merchant of record and the domain must be registered against THAT account.
// Registering it on the platform is the no-op that looks like the Dashboard toggle undoing itself.

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

// Load .env.local the same way the other scripts in here do — no dependency on dotenv.
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const Stripe = require(path.join(ROOT, 'node_modules/stripe'))
const { createClient } = require(path.join(ROOT, 'node_modules/@supabase/supabase-js'))

const KEY = process.env.STRIPE_SECRET_KEY
if (!KEY) { console.error('STRIPE_SECRET_KEY is not set'); process.exit(1) }
if (!KEY.startsWith('sk_test_')) {
  console.error('REFUSING: STRIPE_SECRET_KEY is not a sandbox key. Remove this guard deliberately when going live.')
  process.exit(1)
}

/** The host the Payment Element is served from. Mirrors paymentMethodDomains() in lib/stripe/connect.ts.
 *  ⚠️ www ONLY — hatchgrab.com answers 307 to www, so nothing renders on the bare host. */
function domains() {
  const raw = process.env.NEXT_PUBLIC_HATCHGRAB_URL
  if (!raw) return ['www.hatchgrab.com']
  try { return [new URL(raw).hostname] } catch { return ['www.hatchgrab.com'] }
}

const stripe = new Stripe(KEY)
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const all = args.includes('--all')
const explicit = args.filter(a => a.startsWith('acct_'))

async function accountIds() {
  if (explicit.length) return explicit
  if (!all) return []
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await supabase
    .from('operators').select('id, stripe_account_id').not('stripe_account_id', 'is', null)
  if (error) { console.error('could not read operators:', error.message); process.exit(1) }
  return (data || []).map(o => o.stripe_account_id)
}

;(async () => {
  const ids = await accountIds()
  if (!ids.length) {
    console.error('Nothing to do. Pass an acct_… id, or --all to do every operator with a connected account.')
    process.exit(1)
  }
  console.log(`${dryRun ? 'DRY RUN — ' : ''}domains: ${domains().join(', ')}`)
  console.log(`accounts: ${ids.length}`)
  console.log('')

  let registered = 0, already = 0, failed = 0

  for (const acct of ids) {
    for (const domain of domains()) {
      try {
        const existing = await stripe.paymentMethodDomains.list(
          { domain_name: domain, limit: 1 }, { stripeAccount: acct },
        )
        const found = existing.data[0]
        if (found) {
          already++
          console.log(`  ${acct}  ${domain}  ALREADY REGISTERED  id=${found.id} enabled=${found.enabled} applePay=${found.apple_pay.status} googlePay=${found.google_pay.status}`)
          continue
        }
        if (dryRun) {
          console.log(`  ${acct}  ${domain}  WOULD REGISTER (dry run — nothing written)`)
          continue
        }
        const created = await stripe.paymentMethodDomains.create(
          { domain_name: domain, enabled: true },
          // 🔴 THE Stripe-Account HEADER. Without it this registers on the PLATFORM and does nothing
          // for the truck.
          { stripeAccount: acct },
        )
        registered++
        console.log(`  ${acct}  ${domain}  REGISTERED  id=${created.id} enabled=${created.enabled} applePay=${created.apple_pay.status} googlePay=${created.google_pay.status}`)
      } catch (err) {
        failed++
        console.error(`  ${acct}  ${domain}  🔴 FAILED: ${err && err.message ? err.message : err}`)
      }
    }
  }

  console.log('')
  console.log(`registered=${registered} already=${already} failed=${failed}`)
  // ⚠️ A NON-ZERO EXIT ONLY ON A REAL FAILURE. "already registered" is the expected result of a rerun
  // and is a success.
  process.exit(failed ? 1 : 0)
})()
