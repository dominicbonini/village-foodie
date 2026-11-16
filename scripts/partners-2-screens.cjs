#!/usr/bin/env node
// scripts/partners-2-screens.cjs — partners-2 (16 November 2026): the screenshots in docs/partners-2/. BY HAND, against a running
// local server (default http://localhost:3000):   node scripts/partners-2-screens.cjs [base]
// No login and no database writes: the admin page's requests are answered in the browser from the committed import
// (docs/partners-2/import-rows.json — the real imported organisations) plus SAMPLE codes, queue and ledger data (labelled as
// samples in the report); the signup page's Apply is answered valid / invalid / expired. Nothing is sent.
require('./_disk-guard.cjs').guard(__filename) // disk-cleanup-1: refuses below 40 GB free, stops below 20 GB (docs/reference-manual.md, "Disk space")
require('./_harness-tmp.cjs') // tmp-cleanup-1: temp goes under $TMPDIR/hatchgrab-harness/ and is removed on exit ("Disk space")
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { chromium } = require(path.join(REPO, 'node_modules/playwright'))
const BASE = process.argv[2] || 'http://localhost:3000'
// The account pages take ?lang= only on a HatchGrab host (proxy.ts isHatchGrab) — hatchgrab.localhost is one and resolves locally.
const SIGNUP_BASE = BASE.replace('//localhost', '//hatchgrab.localhost')
const OUT = path.join(REPO, 'docs/partners-2')

const rows = JSON.parse(fs.readFileSync(path.join(OUT, 'import-rows.json'), 'utf8'))
const now = new Date().toISOString()
const partners = rows.map((r, i) => ({
  id: `p${i}`, name: r.name, type: r.type, country_code: r.cc, region: r.region, website: r.website, contact_name: null, contact_role: null,
  email: r.email, phone: null, linkedin_url: null, source: 'gemini-2026-11-16', status: r.status, priority: 'medium', next_follow_up_on: null,
  offered: null, outcome: null, notes: null, last_contacted_at: null, last_reply_at: null, created_at: now, updated_at: now,
  alternate_emails: r.alternates, language: r.lang, timezone: r.tz, verify_status: r.verify, verify_note: r.verifyNote, verify_evidence: r.evidence,
  sequence_step: null, sequence_stopped: null, auto_send: r.autoSend, do_not_contact: false,
}))
const idOf = name => partners.find(p => p.name.startsWith(name)).id
const SAMPLE_CODES = [
  { id: 'c1', code: 'NCASS26', partner_id: idOf('NCASS'), deal_type: 'extra_trial_months', deal_value: 2, deal_months: null, valid_until: '2027-06-30', max_uses: 200, active: true, pct_year1: 20, pct_year2: 10, notes: null },
  { id: 'c2', code: 'SFEM20', partner_id: idOf('Street Food En Mouvement (National'), deal_type: 'percent_off', deal_value: 20, deal_months: 6, valid_until: null, max_uses: null, active: true, pct_year1: 20, pct_year2: 10, notes: null },
  { id: 'c3', code: 'AMFVG', partner_id: idOf('Australian Mobile'), deal_type: 'extra_trial_months', deal_value: 1, deal_months: null, valid_until: null, max_uses: null, active: true, pct_year1: 15, pct_year2: 0, notes: null },
]
const RULES = { GB: 'allowed', IE: 'allowed', FR: 'allowed', BE: 'allowed', NL: 'allowed', ES: 'allowed', IT: 'allowed', SE: 'allowed', CH: 'allowed', US: 'allowed', AU: 'allowed', NZ: 'allowed', DE: 'manual_only', CA: 'manual_only' }
const today = new Date().toISOString().slice(0, 10)
// The sample queue's day: the next Tuesday (sends only go Tue–Thu).
const tue = (() => { const d = new Date(`${today}T12:00:00Z`); do { d.setUTCDate(d.getUTCDate() + 1) } while (d.getUTCDay() !== 2); return d.toISOString().slice(0, 10) })()
const overview = { ok: true, codes: SAMPLE_CODES, uses: { c1: 3, c2: 1, c3: 0 }, queue: [{ partner_id: idOf('NCASS'), step: '1_first_contact', scheduled_at: `${tue}T09:30:00Z`, status: 'planned' }],
  lastSent: {}, rules: RULES, schedule: { approvalMode: true, dailyCap: 25 }, sentToday: 4, today }
const queue = { ok: true, stored: [], plan: { sendDay: tue, cap: 25, sentToday: 4, approvalMode: true, later: [{ name: 'Food Truck Association of Georgia (FTAG)', reason: 'not_today', nextDay: today }],
  planned: [
    { partnerId: idOf('NCASS'), name: 'NCASS (Nationwide Caterers Association)', email: 'info@ncass.org.uk', language: 'en', step: '1_first_contact', at: `${tue}T09:30:00Z`, tz: 'Europe/London', template: 'partner-assoc-1_first_contact-en', status: 'planned', problem: 'No approved template yet (partner-assoc-1_first_contact-en)', preview: null },
    { partnerId: idOf('Street Food En Mouvement (National'), name: 'Street Food En Mouvement (National HQ)', email: 'bureau@streetfoodenmouvement.fr', language: 'fr', step: '1_first_contact', at: `${tue}T08:36:00Z`, tz: 'Europe/Paris', template: 'partner-assoc-1_first_contact-fr', status: 'planned', problem: 'No approved template yet (partner-assoc-1_first_contact-fr)', preview: null },
    { partnerId: idOf('Richmond'), name: 'Richmond Food Truck Association (RFTA)', email: 'info@richmondfoodtruckassociation.org', language: 'en', step: '1_first_contact', at: `${tue}T14:30:00Z`, tz: 'America/New_York', template: 'partner-assoc-1_first_contact-en', status: 'planned', problem: 'No approved template yet (partner-assoc-1_first_contact-en)', preview: null },
  ] } }
const ledger = { ok: true, ledger: { partnerId: idOf('NCASS'), payments: [], codes: [{ codeId: 'c1', code: 'NCASS26', trucks: [{ id: 't1', name: 'Sample Street Kitchen' }, { id: 't2', name: 'Sample Wood-Fired' }], owed: [] }],
  months: [{ month: today.slice(0, 7), currency: 'GBP', owedMinor: 0, paidMinor: 0, outstandingMinor: 0 }] } }

async function admin(browser, w, h) {
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
    if (u.pathname === '/api/admin/partners/programme') {
      const v = u.searchParams.get('view')
      return j(v === 'queue' ? queue : v === 'ledger' ? ledger : overview)
    }
    return j({ ok: true })
  })
  await page.route('**/api/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"first_name":"Dominic"}' }))
  await page.goto(`${BASE}/admin?tab=partners`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-partners-table]', { timeout: 60000 })
  return { ctx, page }
}

async function signup(browser, { w, h, lang, answer, tag, app }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2,
    ...(app ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 HatchGrabNativeApp' } : {}) })
  const page = await ctx.newPage()
  await page.route('**/api/signup/code', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer) }))
  await page.goto(`${SIGNUP_BASE}/signup${lang ? `?lang=${lang}` : ''}`, { waitUntil: 'networkidle' })
  const input = page.locator('#signup-code')
  await input.scrollIntoViewIfNeeded()
  await input.fill(answer.ok ? 'NCASS26' : answer.reason === 'expired' ? 'SUMMER25' : 'NOPE')
  await page.locator('[data-partner-code] button').click()
  await page.waitForSelector(answer.ok ? '[data-code-applied]' : '[data-code-error]', { timeout: 15000 })
  const box = await page.locator('form').first().boundingBox()
  await page.screenshot({ path: path.join(OUT, `signup-${tag}.png`), ...(box ? { clip: { x: 0, y: Math.max(0, box.y - 16), width: w, height: Math.min(box.height + 32, 1400) } } : { fullPage: true }) })
  console.log('  shot', `signup-${tag}.png`)
  await ctx.close()
}

;(async () => {
  const browser = await chromium.launch()
  // ── Admin › Partners at a laptop (1280) and a desktop (1680) width ──
  for (const [w, label] of [[1280, 'laptop'], [1680, 'desktop']]) {
    const { ctx, page } = await admin(browser, w, 900)
    await page.screenshot({ path: path.join(OUT, `partners-table-${label}.png`) }); console.log('  shot', `partners-table-${label}.png`)
    if (label === 'laptop') {
      await page.locator('[data-queue-button]').click(); await page.waitForSelector('[data-queue-item]')
      await page.locator('[data-queue-panel]').screenshot({ path: path.join(OUT, 'send-queue.png') }); console.log('  shot send-queue.png')
      await page.locator('button', { hasText: /^Codes$/ }).click(); await page.waitForSelector('[data-codes-panel]')
      await page.locator('[data-codes-panel]').screenshot({ path: path.join(OUT, 'codes-panel.png') }); console.log('  shot codes-panel.png')
      await page.locator('[data-code-card]').first().screenshot({ path: path.join(OUT, 'code-card.png') }); console.log('  shot code-card.png')
      await page.locator('button', { hasText: /^Codes$/ }).click()
      await page.locator('[data-partner-row]', { hasText: 'NCASS' }).click(); await page.waitForSelector('[data-partner-drawer] [data-ledger]')
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(OUT, 'partner-detail.png') }); console.log('  shot partner-detail.png')
    }
    await ctx.close()
  }
  // ── the signup page: valid / invalid / expired, phone (390) and desktop, en-GB and fr-FR, and inside the app ──
  const answers = { valid: { ok: true, code: 'NCASS26', deal: { kind: 'extraMonths', months: 2 }, partner: 'NCASS' }, invalid: { ok: false, reason: 'invalid' }, expired: { ok: false, reason: 'expired' } }
  for (const lang of ['', 'fr-FR']) for (const [w, h, dev] of [[390, 844, '390'], [1280, 900, 'desktop']]) for (const k of Object.keys(answers)) {
    await signup(browser, { w, h, lang, answer: answers[k], tag: `${k}-${dev}-${lang || 'en-GB'}` })
  }
  await signup(browser, { w: 390, h: 844, lang: '', answer: { ok: true, code: 'SFEM20', deal: { kind: 'percentOff', pct: 20, months: 6 }, partner: 'Street Food En Mouvement' }, tag: 'valid-percent-390-en-GB' })
  await signup(browser, { w: 390, h: 844, lang: '', answer: answers.valid, tag: 'app-valid-390-en-GB', app: true })
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
