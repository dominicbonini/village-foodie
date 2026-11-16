#!/usr/bin/env node
// scripts/partners-2.cjs — partners-2 (16 November 2026, docs/partners-2-report.md): the partner programme's rules. Swept.
// No network, no database, NOTHING SENT: the modules are bundled with esbuild and run against a fake database (a TEST truck's
// signup is a sandboxed flow here), and the scheduler is driven by a dry-run clock.
//   node scripts/partners-2.cjs
'use strict'
const fs = require('fs')
const path = require('path')
const Module = require('module')
const REPO = path.resolve(__dirname, '..')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)

// ── a fake database: tables of rows; select / filters / insert / update / upsert, enough for the code under test ───────────────
function fakeDb(tables) {
  const log = []
  const from = table => {
    const q = { table, filters: [], op: 'select', values: null, single: false, head: false, limit: null, order: null, onConflict: null }
    const rows = () => (tables[table] = tables[table] || [])
    const match = r => q.filters.every(([op, c, v]) => op === 'eq' ? r[c] === v : op === 'in' ? v.includes(r[c]) : op === 'is' ? r[c] === v
      : op === 'gte' ? String(r[c]) >= String(v) : op === 'lte' ? String(r[c]) <= String(v) : op === 'ilike' ? String(r[c]).toUpperCase() === String(v).replace(/\\/g, '').toUpperCase()
      : op === 'not_is' ? r[c] !== v : true)
    const b = {
      select(cols, opt) { if (q.op === 'select') q.cols = cols; if (opt && opt.head) q.head = true; return b },
      eq(c, v) { q.filters.push(['eq', c, v]); return b }, in(c, v) { q.filters.push(['in', c, v]); return b },
      is(c, v) { q.filters.push(['is', c, v]); return b }, gte(c, v) { q.filters.push(['gte', c, v]); return b },
      lte(c, v) { q.filters.push(['lte', c, v]); return b }, ilike(c, v) { q.filters.push(['ilike', c, v]); return b },
      not(c, op, v) { q.filters.push(['not_is', c, v]); return b },
      order(c, o) { q.order = [c, o && o.ascending === false ? -1 : 1]; return b }, limit(n) { q.limit = n; return b },
      maybeSingle() { q.single = 'maybe'; return b }, single() { q.single = 'one'; return b },
      insert(v) { q.op = 'insert'; q.values = Array.isArray(v) ? v : [v]; return b },
      update(v) { q.op = 'update'; q.values = v; return b },
      upsert(v, o) { q.op = 'upsert'; q.values = Array.isArray(v) ? v : [v]; q.onConflict = o && o.onConflict; return b },
      then(res, rej) {
        log.push({ table, op: q.op, filters: q.filters, values: q.values })
        let data
        if (q.op === 'insert') { const made = q.values.map(v => ({ id: `id-${Math.random().toString(36).slice(2)}`, created_at: new Date().toISOString(), ...v })); rows().push(...made); data = made }
        else if (q.op === 'update') { data = rows().filter(match); for (const r of data) Object.assign(r, q.values) }
        else if (q.op === 'upsert') {
          const keys = (q.onConflict || 'id').split(',')
          data = q.values.map(v => { const hit = rows().find(r => keys.every(k => r[k] === v[k])); if (hit) return Object.assign(hit, v); const n = { id: `id-${Math.random().toString(36).slice(2)}`, ...v }; rows().push(n); return n })
        } else {
          data = rows().filter(match)
          if (q.order) data = [...data].sort((a, c) => (String(a[q.order[0]]) < String(c[q.order[0]]) ? -1 : 1) * q.order[1])
          if (q.limit) data = data.slice(0, q.limit)
          if (table === 'partner_codes' && q.cols && q.cols.includes('partner_orgs(')) data = data.map(r => ({ ...r, partner_orgs: (tables.partner_orgs || []).find(p => p.id === r.partner_id) || null }))
        }
        let out = { data, error: null, count: data.length }
        if (q.head) out = { data: null, error: null, count: data.length }
        else if (q.single === 'maybe') out = { data: data[0] ?? null, error: null }
        else if (q.single === 'one') out = data[0] ? { data: data[0], error: null } : { data: null, error: { message: 'no row' } }
        return Promise.resolve(out).then(res, rej)
      },
    }
    return b
  }
  return { from, log, tables }
}

async function load() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const out = await esbuild.build({
    stdin: { contents: [
      "export * as C from '@/lib/partner-codes'", "export * as S from '@/lib/partner-send-schedule'",
      "export * as P from '@/lib/partner-programme'", "export * as CS from '@/lib/partner-codes-server'", "export * as T from '@/lib/partner-template'",
    ].join(';'), resolveDir: REPO, loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node20', alias: { '@': REPO }, logLevel: 'silent',
  })
  const m = new Module(path.join(REPO, 'scripts/__partners-2-bundle.cjs'))
  m.paths = Module._nodeModulePaths(REPO)
  m._compile(out.outputFiles[0].text, m.id)
  return m.exports
}

;(async () => {
  const { C, S, P, CS, T } = await load()
  const code = (o = {}) => ({ id: 'c1', code: 'NCASS26', partnerId: 'p1', partnerName: 'NCASS', dealType: 'extra_trial_months', dealValue: 2, dealMonths: null,
    validUntil: null, maxUses: null, uses: 0, active: true, pctYear1: 20, pctYear2: 10, basis: 'plan_fees', ...o })

  head('1 · code validation')
  t('a code is matched without case or spaces ("ncass 26" = NCASS26)', C.normaliseCode(' ncass 26 ') === 'NCASS26')
  t('a live code is ok', C.codeState(code(), '2026-11-16') === 'ok')
  t('no such code → invalid ("That code isn\'t valid.")', C.codeState(null, '2026-11-16') === 'invalid')
  t('an inactive code → invalid', C.codeState(code({ active: false }), '2026-11-16') === 'invalid')
  t('a used-up code → invalid', C.codeState(code({ maxUses: 3, uses: 3 }), '2026-11-16') === 'invalid')
  t('past its last day → expired ("That code has expired.")', C.codeState(code({ validUntil: '2026-11-15' }), '2026-11-16') === 'expired')
  t('…its last day itself still works (inclusive)', C.codeState(code({ validUntil: '2026-11-16' }), '2026-11-16') === 'ok')
  t('the deal in words: "2 extra months free" / "20% off for 6 months" / "1 extra month free"',
    C.dealTextEn(code()) === '2 extra months free' && C.dealTextEn(code({ dealType: 'percent_off', dealValue: 20, dealMonths: 6 })) === '20% off for 6 months' && C.dealTextEn(code({ dealValue: 1 })) === '1 extra month free')

  head('2 · deal application (the existing plan mechanisms)')
  // A trial ending 23:59:59 London on 16 Feb 2027 (GMT) + 2 months → 16 Apr 2027 23:59:59 London (BST) = 22:59:59Z.
  t('extra months: the trial end moves on by N calendar months, end of that day in the truck\'s zone (across DST)',
    C.extendedTrialEnd('2027-02-16T23:59:59.000Z', code(), 'Europe/London') === '2027-04-16T22:59:59.000Z', C.extendedTrialEnd('2027-02-16T23:59:59.000Z', code(), 'Europe/London'))
  const ov = C.percentOffOverride(4900, code({ dealType: 'percent_off', dealValue: 20, dealMonths: 6 }), '2026-11-16')
  t('percent off: £49.00 less 20% = £39.20 a month, until the day before 6 months on (inclusive, as truckPlanPrice reads it)', ov.minor === 3920 && ov.until === '2027-05-15', ov)

  head('3 · a TEST truck signs up with a code (sandboxed: a fake database, nothing real touched)')
  const base = () => ({
    partner_orgs: [{ id: 'p1', name: 'NCASS' }],
    partner_codes: [
      { id: 'c1', code: 'NCASS26', partner_id: 'p1', deal_type: 'extra_trial_months', deal_value: 2, deal_months: null, valid_until: null, max_uses: null, active: true, pct_year1: 20, pct_year2: 10, basis: 'plan_fees' },
      { id: 'c2', code: 'SAVE20', partner_id: 'p1', deal_type: 'percent_off', deal_value: 20, deal_months: 6, valid_until: null, max_uses: null, active: true, pct_year1: 20, pct_year2: 0, basis: 'plan_fees' },
      { id: 'c3', code: 'OLD', partner_id: 'p1', deal_type: 'extra_trial_months', deal_value: 1, deal_months: null, valid_until: '2026-01-01', max_uses: null, active: true, pct_year1: 10, pct_year2: 0, basis: 'plan_fees' },
    ],
    partner_code_redemptions: [],
    trucks: [{ id: 'test-truck', trial_expires_at: '2027-02-16T23:59:59.000Z', timezone: 'Europe/London', referred_partner_code_id: null }],
  })
  {
    const db = fakeDb(base())
    const ok = await CS.recordRedemption(db, 'op-test', 'ncass26', new Date('2026-11-16T12:00:00Z'))
    t('signup with a live code records the redemption (with the deal as it stood)', ok && db.tables.partner_code_redemptions.length === 1 && db.tables.partner_code_redemptions[0].deal_value === 2)
    const outcome = await CS.applyPartnerDeal(db, 'op-test', { id: 'test-truck' }, new Date('2026-11-16T12:05:00Z'))
    const truck = db.tables.trucks[0], red = db.tables.partner_code_redemptions[0]
    t('the truck\'s creation applies it: 2 extra months on the trial end', outcome === 'applied' && truck.trial_expires_at === '2027-04-16T22:59:59.000Z', { outcome, truck })
    t('…and attributes the truck to the code, and records what was applied', truck.referred_partner_code_id === 'c1' && red.truck_id === 'test-truck' && red.trial_extended_to === '2027-04-16T22:59:59.000Z' && !!red.applied_at)
    const again = await CS.applyPartnerDeal(db, 'op-test', { id: 'test-truck' })
    t('applying twice changes nothing (\'already\')', again === 'already' && truck.trial_expires_at === '2027-04-16T22:59:59.000Z')
  }
  {
    const db = fakeDb(base())
    t('an expired code is not recorded (signup goes on without it)', !(await CS.recordRedemption(db, 'op-x', 'OLD', new Date('2026-11-16T12:00:00Z'))) && !db.tables.partner_code_redemptions.length)
    t('an unknown code is not recorded', !(await CS.recordRedemption(db, 'op-x', 'NOPE123')) && !db.tables.partner_code_redemptions.length)
    t('Apply reports expired / invalid / ok', (await CS.checkCode(db, 'OLD', new Date('2026-11-16'))).state === 'expired' && (await CS.checkCode(db, 'zz9')).state === 'invalid' && (await CS.checkCode(db, 'Save 20')).state === 'ok')
  }
  {
    const db = fakeDb(base())
    await CS.recordRedemption(db, 'op-p', 'SAVE20')
    const o = await CS.applyPartnerDeal(db, 'op-p', { id: 'test-truck' })
    t('a percent-off code: recorded and attributed, no price override written yet (awaiting Dominic\'s decision, §3.3)',
      o === 'recorded_pending' && db.tables.trucks[0].referred_partner_code_id === 'c2' && db.tables.trucks[0].plan_price_override_minor === undefined
      && /awaiting the decision/.test(db.tables.partner_code_redemptions[0].apply_note))
  }

  head('4 · attribution is set once and never changed')
  {
    const tables = base(); tables.trucks[0].referred_partner_code_id = 'c9'
    const db = fakeDb(tables)
    await CS.recordRedemption(db, 'op-y', 'NCASS26')
    await CS.applyPartnerDeal(db, 'op-y', { id: 'test-truck' })
    t('a truck already attributed keeps its code (the deal still applies)', db.tables.trucks[0].referred_partner_code_id === 'c9')
  }
  const mig = fs.readFileSync(path.join(REPO, 'supabase/migrations/20261104_partners_2.sql'), 'utf8')
  t('the database refuses a change: trigger trucks_referred_code_immutable raises when a set code is changed (or cleared)',
    /create trigger trucks_referred_code_immutable before update of referred_partner_code_id on public\.trucks/.test(mig)
    && /if old\.referred_partner_code_id is not null and new\.referred_partner_code_id is distinct from old\.referred_partner_code_id then\s+raise exception/.test(mig))

  head('5 · the schedule: the recipient\'s time zone, Tue–Thu 09:30–11:30, across DST')
  const iso = n => new Date(n).toISOString()
  t('London, Tue 31 Mar 2026 (BST began 29 Mar): 09:30 local = 08:30Z', iso(S.windowOn('2026-03-31', 'Europe/London').start) === '2026-03-31T08:30:00.000Z')
  t('London, Tue 27 Oct 2026 (GMT from 25 Oct): 09:30 local = 09:30Z', iso(S.windowOn('2026-10-27', 'Europe/London').start) === '2026-10-27T09:30:00.000Z')
  t('New York, Tue 10 Mar 2026 (EDT began 8 Mar): 09:30 local = 13:30Z', iso(S.windowOn('2026-03-10', 'America/New_York').start) === '2026-03-10T13:30:00.000Z')
  t('New York, Tue 3 Nov 2026 (EST from 1 Nov): 09:30 local = 14:30Z', iso(S.windowOn('2026-11-03', 'America/New_York').start) === '2026-11-03T14:30:00.000Z')
  t('Sydney, Tue 7 Apr 2026 (AEST from 5 Apr): 09:30 local = 23:30Z the day before', iso(S.windowOn('2026-04-07', 'Australia/Sydney').start) === '2026-04-06T23:30:00.000Z')
  t('a Friday rolls to the next Tuesday; a Saturday or Sunday never sends', S.nextWindowDay('2026-11-20') === '2026-11-24' && S.nextWindowDay('2026-11-21') === '2026-11-24' && S.nextWindowDay('2026-11-22') === '2026-11-24')
  {
    const now = new Date('2026-11-17T07:00:00Z')       // Tue 17 Nov, 07:00 London
    const due = [{ id: 'gb1', tz: 'Europe/London', dueYmd: '2026-11-17' }, { id: 'gb2', tz: 'Europe/London', dueYmd: '2026-11-17' }, { id: 'us1', tz: 'America/New_York', dueYmd: '2026-11-17' }]
    const low = S.planToday(due, { now, sentToday: 0, rand: () => 0 }), high = S.planToday(due, { now, sentToday: 0, rand: () => 1 })
    const gap = p => (Date.parse(p.planned[1].at) - Date.parse(p.planned[0].at)) / 60000
    t('the first London send is 09:30 local; the next 3 minutes later (rand 0) — or 8 (rand 1)', low.planned[0].at === '2026-11-17T09:30:00.000Z' && gap(low) === 3 && gap(high) === 8, low.planned)
    t('the New York send is in New York\'s window (09:30 EST = 14:30Z)', low.planned.find(p => p.id === 'us1')?.at === '2026-11-17T14:30:00.000Z')
    const capped = S.planToday(due, { now, sentToday: 24, cap: 25, rand: () => 0 })
    t('🔴 the cap is shared: 24 already sent today (trucks + partners) → only 1 more planned, the rest wait', capped.planned.length === 1 && capped.later.filter(l => l.reason === 'cap').length === 2)
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `gb${i}`, tz: 'Europe/London', dueYmd: '2026-11-17' }))
    const full = S.planToday(many, { now, sentToday: 0, cap: 100, rand: () => 1 })
    t('never past the window: 2 hours at 8-minute spacing fits 16; the rest move to the next window', full.planned.length === 16 && full.planned.every(p => p.at <= '2026-11-17T11:30:00.000Z') && full.later.every(l => l.reason === 'window_full'))
    t('cap 25 holds even with room in the windows', S.planToday(many, { now, sentToday: 0, cap: 25, rand: () => 0 }).planned.length === 25)
  }

  head('6 · who is sent to automatically (only ✓, never manual-only, never software platforms)')
  const pp = (o = {}) => ({ id: 'x', name: 'X', type: 'association', country_code: 'GB', language: 'en', timezone: 'Europe/London', email: 'a@b.org', status: 'to_contact',
    verify_status: 'verified', auto_send: true, do_not_contact: false, sequence_step: null, sequence_stopped: null, contact_name: null, ...o })
  t('a verified UK association → eligible, first contact next', P.ineligible(pp(), 'allowed') === null && P.nextStep(pp()) === '1_first_contact')
  t('🔴 Germany / Canada (manual_only) → never queued, shows "You send"', P.ineligible(pp({ country_code: 'DE' }), 'manual_only') === 'manual_only' && P.nextSendLabel(pp({ country_code: 'CA' }), 'manual_only', null) === 'You send')
  t('a country with no rule is manual_only', P.ineligible(pp({ country_code: 'XX' }), null) === 'manual_only')
  t('? unverified and ✗ dropped → never automatic ("Manual only")', P.ineligible(pp({ verify_status: 'unverified' }), 'allowed') === 'not_verified' && P.ineligible(pp({ verify_status: 'dropped' }), 'allowed') === 'not_verified' && P.nextSendLabel(pp({ verify_status: 'unverified' }), 'allowed', null) === 'Manual only')
  t('a software platform → never automatic', P.ineligible(pp({ type: 'software_platform' }), 'allowed') === 'software_platform')
  t('opted out / stopped / replied → never automatic', P.ineligible(pp({ do_not_contact: true }), 'allowed') === 'do_not_contact' && P.ineligible(pp({ sequence_stopped: 'reply' }), 'allowed') === 'stopped' && P.ineligible(pp({ status: 'replied' }), 'allowed') === 'status')
  t('the ladder is the truck ladder: first → chase 1 (+3) → chase 2 (+7) → final (+14) → done',
    P.nextStep(pp({ sequence_step: '1_first_contact' })) === '2_chase_1' && P.gapBefore('2_chase_1') === 3 && P.gapBefore('3_chase_2') === 7 && P.gapBefore('4_final_chase') === 14 && P.nextStep(pp({ sequence_step: '4_final_chase' })) === null)
  t('the template is chosen by audience, step and language', P.templateSlugFor(pp({ type: 'collective', language: 'fr' }), '2_chase_1') === 'partner-assoc-2_chase_1-fr' && P.templateSlugFor(pp({ type: 'media' }), '1_first_contact') === 'partner-dir-1_first_contact-en')
  {
    const db = fakeDb({
      outreach_settings: [{ key: 'send_schedule', value: { approval_mode: true, daily_cap: 25 } }],
      outreach_country_rules: [{ country_code: 'GB', cold_email: 'allowed' }, { country_code: 'DE', cold_email: 'manual_only' }, { country_code: 'US', cold_email: 'allowed' }],
      outreach_messages: [], outreach_send_queue: [],
      partner_orgs: [pp({ id: 'gb', name: 'GB assoc' }), pp({ id: 'de', name: 'DE assoc', country_code: 'DE', timezone: 'Europe/Berlin' }),
        pp({ id: 'sw', name: 'Platform', type: 'software_platform', country_code: 'US' }), pp({ id: 'uv', name: 'Unverified', verify_status: 'unverified' }),
        pp({ id: 'us', name: 'US assoc', country_code: 'US', timezone: 'America/New_York' })],
    })
    const plan = await P.planQueue(db, new Date('2026-11-17T07:00:00Z'), { write: true, rand: () => 0 })
    const ids = plan.planned.map(p => p.partnerId).sort()
    t('🔴 the day\'s plan holds only the eligible (GB, US) — never DE (manual_only), the platform or the unverified', JSON.stringify(ids) === '["gb","us"]', ids)
    t('…and it is written to outreach_send_queue as planned (approval mode ON: nothing goes until approved)', db.tables.outreach_send_queue.length === 2 && db.tables.outreach_send_queue.every(r => r.status === 'planned') && plan.approvalMode === true)
    const n = await P.approveToday(db, new Date('2026-11-17T07:30:00Z'))
    t('"Approve today\'s sends" approves today\'s planned rows', n === 2 && db.tables.outreach_send_queue.every(r => r.status === 'approved'))

    head('7 · stop on reply, bounce or opt-out')
    await P.stopSequence(db, 'gb', 'reply')
    const gb = db.tables.partner_orgs.find(p => p.id === 'gb')
    t('a reply stops the sequence and cancels what is queued', gb.sequence_stopped === 'reply' && db.tables.outreach_send_queue.find(r => r.partner_id === 'gb').status === 'cancelled')
    t('…so it is never planned again', P.ineligible(gb, 'allowed') === 'stopped')
    await P.stopSequence(db, 'us', 'opt_out')
    t('an opt-out also marks the partner do_not_contact (the suppression list)', db.tables.partner_orgs.find(p => p.id === 'us').do_not_contact === true)
  }
  const poll = fs.readFileSync(path.join(REPO, 'lib/partner-mail-poll.ts'), 'utf8')
  t('the reply poller stops a partner\'s sequence on a reply and on a bounce', /stopSequence\(supabase, partnerId, 'reply'\)/.test(poll) && /stopSequence\(supabase, partnerId, 'bounce'\)/.test(poll))
  const send = fs.readFileSync(path.join(REPO, 'lib/partner-send.ts'), 'utf8')
  t('the suppression list is shared: a do-not-contact partner\'s addresses join the prospects\' list', /from\('partner_orgs'\)\.select\('email, alternate_emails'\)\.eq\('do_not_contact', true\)/.test(send))

  head('8 · the sender (nothing is sent by this harness)')
  const cron = fs.readFileSync(path.join(REPO, 'app/api/cron/partner-sends/route.ts'), 'utf8')
  t('approval mode ON → only approved rows go', /settings\.approvalMode \? \['approved'\] : \['approved', 'planned'\]/.test(cron))
  t('the shared cap and the 3-minute spacing are checked before anything else', /sent\.count >= settings\.dailyCap/.test(cron) && /SPACING_MIN\.min \* 60_000/.test(cron))
  t('eligibility is checked again at send time, and the opt-out line is required', /const why = ineligible\(partner/.test(cron) && /requireOptOut: os\.values\.optOut\?\.text \?\? null/.test(cron))
  t('no template → nothing sent (none exists until Dominic signs the wording off)', /no approved template "\$\{slug\}" yet/.test(cron))
  t('a dry run never reaches the mail server (now= only with dry_run=1)', /if \(dryRun\) return done\(\{ action: 'would_send'/.test(cron) && /now= only with dry_run=1/.test(cron)
    && cron.indexOf("if (dryRun) return done({ action: 'would_send'") < cron.indexOf('sendPartnerEmail(supabase'))
  t('US emails carry the postal address (CAN-SPAM)', T.withPostalAddress('Hi\n\n{{opt_out}}', 'HatchGrab Ltd, Rosedale', 'US') === 'Hi\n\nHatchGrab Ltd, Rosedale\n\n{{opt_out}}' && T.withPostalAddress('Hi', 'X', 'GB') === 'Hi')
  t('a merge field with no value is refused, never sent blank', T.renderPartnerText('Hi {{contact_name}}, {{org}}', { org: 'NCASS' }).ok === false)
  t('…unless the template gives a fallback: "Hi {{contact_name|there}}" → "Hi there"; a name wins over it',
    T.renderPartnerText('Hi {{contact_name|there}},', {}).text === 'Hi there,' && T.renderPartnerText('Hi {{contact_name|there}},', { contact_name: 'Demi' }).text === 'Hi Demi,')

  console.log(fail ? `\n🔴 ${fail} CHECK(S) FAILED (${pass} passed)` : `\n✅ all ${pass} passed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
