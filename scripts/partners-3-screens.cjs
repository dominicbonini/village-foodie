#!/usr/bin/env node
// scripts/partners-3-screens.cjs — partners-3 (16 November 2026): the screenshots in docs/partners-3/. BY HAND, against a running
// local server (default http://localhost:3000):   node scripts/partners-3-screens.cjs [base]
// No login and no database writes: Admin's requests are answered in the browser from the committed partners-3 import
// (docs/partners-3/import-*.json — the real imported organisations, with their channels) and NO codes (every partner "Needs offer"),
// except one labelled SAMPLE code for the drawer's code card; the signup page's Apply is answered with the new deal kinds.
require('./_disk-guard.cjs').guard(__filename) // disk-cleanup-1: refuses below 40 GB free, stops below 20 GB (docs/reference-manual.md, "Disk space")
require('./_harness-tmp.cjs') // tmp-cleanup-1: temp goes under $TMPDIR/hatchgrab-harness/ and is removed on exit ("Disk space")
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { chromium } = require(path.join(REPO, 'node_modules/playwright'))
const BASE = process.argv[2] || 'http://localhost:3000'
const SIGNUP_BASE = BASE.replace('//localhost', '//hatchgrab.localhost')
const OUT = path.join(REPO, 'docs/partners-3')

const rows = fs.readdirSync(OUT).filter(f => /^import-.*\.json$/.test(f)).flatMap(f => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'))).filter(r => !r.skipped)
const now = new Date().toISOString()
const partners = rows.map((r, i) => ({
  id: `p${i}`, name: r.name, type: r.type, country_code: r.cc, region: r.region, website: r.website, contact_name: null, contact_role: null,
  email: r.email, phone: null, linkedin_url: null, source: 'partners-3', status: r.status, priority: 'medium', next_follow_up_on: null,
  offered: null, outcome: null, notes: null, last_contacted_at: null, last_reply_at: null, created_at: now, updated_at: now,
  alternate_emails: r.alternates, language: r.lang, timezone: r.tz, verify_status: r.verify, verify_note: r.verifyNote, verify_evidence: r.evidence,
  sequence_step: null, sequence_stopped: null, auto_send: r.autoSend, do_not_contact: false,
  channel: r.channel, facebook_url: r.facebook, instagram_url: r.instagram, contact_form_url: r.contactForm, last_seen_active: r.lastSeen, members_estimate: r.members,
}))
const idOf = name => partners.find(p => p.name.startsWith(name)).id
const today = new Date().toISOString().slice(0, 10)
const SAMPLE = { id: 's1', code: 'SAMPLE-REFFEN', partner_id: idOf('Reffen'), deal_type: 'percent_off', deal_value: 20, deal_months: 6, deal_plan_key: 'pro', deal_currency: null,
  valid_until: null, max_uses: null, active: true, pct_year1: 15, pct_year2: 5, notes: 'SAMPLE for the screenshot', created_at: now }
const PAID = [{ key: 'payg', name: 'Pay as you go' }, { key: 'pro', name: 'Pro' }, { key: 'unlimited', name: 'Unlimited' }]
const RULES = { GB: 'allowed', IE: 'allowed', FR: 'allowed', BE: 'allowed', NL: 'allowed', ES: 'allowed', IT: 'allowed', SE: 'allowed', CH: 'allowed', US: 'allowed', AU: 'allowed', NZ: 'allowed', DE: 'manual_only', CA: 'manual_only' }
const overview = codes => ({ ok: true, codes, uses: {}, queue: [], lastSent: {}, rules: RULES, schedule: { approvalMode: true, dailyCap: 25 }, sentToday: 0, today, paidPlans: PAID })
const ledger = { ok: true, ledger: { codes: [], months: [] } }

async function admin(browser, w, h, codes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  const page = await ctx.newPage()
  await page.route('**/api/admin**', async route => {
    const u = new URL(route.request().url())
    const j = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
    if (u.pathname === '/api/admin') {
      const s = u.searchParams.get('section')
      if (s === 'discovery') return j({ discoveryTrucks: [] })
      if (s === 'demo_cleanup') return j({ lastRun: null })
      if (s === 'check_admin') return j({ isAdmin: true })
      return j({ trucks: [], operators: [], countrySettings: {}, plans: { plans: [], prices: [], features: [] } })
    }
    if (u.pathname === '/api/admin/partners') {
      const id = u.searchParams.get('id')
      if (id) return j({ ok: true, partner: partners.find(p => p.id === id), messages: [], events: [] })
      return j({ ok: true, partners })
    }
    if (u.pathname === '/api/admin/partners/programme') return j(u.searchParams.get('view') === 'ledger' ? ledger : overview(codes))
    return j({ ok: true })
  })
  await page.route('**/api/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"first_name":"Dominic"}' }))
  await page.goto(`${BASE}/admin?tab=partners`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-partners-table]', { timeout: 60000 })
  return { ctx, page }
}

async function signup(browser, { w, h, lang, answer, tag }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.route('**/api/signup/code', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer) }))
  await page.goto(`${SIGNUP_BASE}/signup${lang ? `?lang=${lang}` : ''}`, { waitUntil: 'networkidle' })
  const input = page.locator('#signup-code')
  await input.scrollIntoViewIfNeeded()
  await input.fill(answer.code)
  await page.locator('[data-partner-code] button').click()
  await page.waitForSelector('[data-code-applied]', { timeout: 15000 })
  await page.locator('[data-partner-code]').screenshot({ path: path.join(OUT, `signup-${tag}.png`) })
  console.log('  shot', `signup-${tag}.png`)
  await ctx.close()
}

;(async () => {
  const browser = await chromium.launch()
  {
    const { ctx, page } = await admin(browser, 1280, 900, [])
    await page.screenshot({ path: path.join(OUT, 'partners-table-needs-offer.png') }); console.log('  shot partners-table-needs-offer.png')
    await page.locator('[data-partner-row]', { hasText: 'Street Food Park Bratislava' }).click(); await page.waitForSelector('[data-partner-drawer] [data-code-form]')
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(OUT, 'partner-drawer-new-code.png') }); console.log('  shot partner-drawer-new-code.png')
    await page.locator('[data-code-form] select[aria-label="Deal"]').selectOption('fixed_price')
    await page.locator('[data-code-form]').screenshot({ path: path.join(OUT, 'code-form-fixed-price.png') }); console.log('  shot code-form-fixed-price.png')
    await ctx.close()
  }
  {
    const { ctx, page } = await admin(browser, 1280, 900, [SAMPLE])
    await page.locator('[data-partner-row]', { hasText: 'Reffen' }).click(); await page.waitForSelector('[data-partner-drawer] [data-code-card]')
    await page.locator('[data-partner-drawer] [data-code-card]').first().screenshot({ path: path.join(OUT, 'code-card-percent-plan.png') }); console.log('  shot code-card-percent-plan.png')
    await ctx.close()
  }
  const pct = { ok: true, code: 'SAMPLE20', deal: { kind: 'percentOff', pct: 20, months: 6, planName: 'Pro' }, partner: 'Reffen' }
  const fixedEn = { ok: true, code: 'SAMPLE19', deal: { kind: 'fixedPrice', months: 3, planName: 'Unlimited', price: '£19' }, partner: 'NCASS' }
  const fixedFr = { ok: true, code: 'SAMPLE19', deal: { kind: 'fixedPrice', months: 3, planName: 'Illimité', price: '19 €' }, partner: 'Street Food En Mouvement' }
  await signup(browser, { w: 390, h: 844, lang: '', answer: pct, tag: 'percent-plan-390-en-GB' })
  await signup(browser, { w: 390, h: 844, lang: '', answer: fixedEn, tag: 'fixed-price-390-en-GB' })
  await signup(browser, { w: 390, h: 844, lang: 'fr-FR', answer: fixedFr, tag: 'fixed-price-390-fr-FR' })
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
