#!/usr/bin/env node
// scripts/phone-parity.cjs — every UK phone number shape, before and after Phase 2C (docs/phone-numbers-report.md).
//
//   node scripts/phone-parity.cjs                    check the current code against the committed BEFORE snapshot
//   node scripts/phone-parity.cjs --capture <file>   write a snapshot of the current (pre-2C) code
//
// ── 🔴 THE METHOD ─────────────────────────────────────────────────────────────────────────────────────────
// The BEFORE snapshot was taken on the unchanged code, before the first edit of this phase. It holds, for a
// deterministic corpus of UK-shaped inputs (every real number type in every format a person types, the edge
// shapes, and a seeded sample of the old rule's whole language — 0 / 44 / +44 followed by 9–11 digits):
//   • whether isValidUKPhone accepted it (customer order form, setup wizard, setup API, Manage contact phone)
//   • the WhatsApp link a customer email builds from it (lib/email.ts, the confirmation's contact section)
//   • lib/whatsapp-hint.ts phoneWhatsApp — the wa.me number and the message hint
//   • lib/admin/truck-details.ts normaliseUkPhone (the admin display) and phoneDigits (the matcher)
//   • the Meta webhook's whatsapp_sender variants (app/api/webhooks/meta/whatsapp/route.ts)
// and the rendered UK order form and setup wizard, and a confirmation email with a WhatsApp contact.
// Nothing reaches a database, the network or an inbox.

const fs = require('fs'); const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'phone' })
const { REPO, h } = kit
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const argv = process.argv.slice(2)
const CAPTURE = argv.includes('--capture') ? argv[argv.indexOf('--capture') + 1] : null
const BEFORE_FILE = 'scripts/fixtures/phone-before.json'

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CORPUS — deterministic
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
const NSN = {
  'mobile 07700 900123 (Ofcom drama)': '7700900123', 'mobile 07380 736226': '7380736226', 'mobile 07911 123456': '7911123456',
  'London 020 7946 0958': '2079460958', 'Cambridge 01223 123456': '1223123456', 'Brampton 016977 2345 (9-digit)': '169772345',
  'Bolton 01204 123456': '1204123456', 'Leeds 0113 496 0000': '1134960000', 'freephone 0800 123 4567': '8001234567',
  'freephone 0800 123 456 (9-digit)': '800123456', '0300 123 4567': '3001234567', '0345 123 4567': '3451234567',
  '0870 123 4567': '8701234567', 'premium 0909 123 4567': '9091234567', 'personal 070 1234 5678': '7012345678',
  'pager 076 2412 3456': '7624123456', 'VoIP 056 1234 5678': '5612345678',
}
const wraps = n => {
  const a = n.slice(0, 4), b = n.slice(4)
  return {
    '0 compact': '0' + n, '0 spaced': `0${a} ${b}`, '0 dashed': `0${a}-${b}`, '(0) brackets': `(0${a}) ${b}`,
    '+44 compact': '+44' + n, '+44 spaced': `+44 ${a} ${b}`, '+44 (0)': `+44 (0)${a} ${b}`, '+44 0': `+44 0${a} ${b}`,
    '44 compact': '44' + n, '44 spaced': `44 ${a} ${b}`, '0044 compact': '0044' + n, '0044 spaced': `0044 ${a} ${b}`,
    dots: `0${a}.${b}`, padded: `  0${a} ${b}  `,
  }
}
const EDGE = ['', ' ', '07700 90012', '07700 9001234', '077009001234', '0770090012345', '0', '00000000000', '01111111111',
  '012345678901', '0123456789', '04123456789', '06123456789', '07700 900123 ext 4', '+44 7700 900123 (mob)', '447700900123',
  '+4407700900123', '+447700 900123', '7700900123', '++447700900123', '+44 20 7946 0958', '44-20-7946-0958',
  '020 7946 0958 0', '02079460958 ', '0044 7700 900123', 'tel: 07380 736226', '07380 736226 / 01223 123456']
function rnd(len, seed) { let s = seed, o = ''; for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) % 2147483648; o += s % 10 } return o }
function corpus() {
  const out = []
  for (const [label, n] of Object.entries(NSN)) for (const [w, p] of Object.entries(wraps(n))) out.push({ label: `${label} · ${w}`, input: p })
  for (const p of EDGE) out.push({ label: 'edge', input: p })
  // the old rule's language, seeded: prefix × NSN length × every 2-digit lead × 5
  for (const pre of ['0', '44', '+44']) for (let len = 9; len <= 11; len++) for (let lead = 0; lead < 100; lead++) for (let k = 0; k < 5; k++)
    out.push({ label: `sample ${pre}|${len}`, input: pre + String(lead).padStart(2, '0') + rnd(len - 2, lead * 977 + len * 13 + k + pre.length * 7919) })
  // near-misses: 6–14 digits after 0, a few each
  for (let len = 5; len <= 13; len++) for (let k = 0; k < 20; k++) out.push({ label: `length 0+${len}`, input: '0' + rnd(len, len * 31 + k) })
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO INLINE PIECES OF OLD CODE, AS REFERENCES — each asserted to be VERBATIM in the HEAD tree, so the
// reference is the real pre-2C code, not a reconstruction.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
const { execFileSync } = require('child_process')
const headOf = f => execFileSync('git', ['show', `HEAD:${f}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 })
const OLD_EMAIL_LINES = [
  "const digits = raw.replace(/\\D/g, '')",
  "const intl = digits.startsWith('44') ? digits : digits.startsWith('0') ? `44${digits.slice(1)}` : `44${digits}`",
  "return { label: `WhatsApp us: ${raw}`, value: `https://wa.me/${intl}`, isLink: true }",
]
const oldEmailLink = raw => { const digits = raw.replace(/\D/g, ''); const intl = digits.startsWith('44') ? digits : digits.startsWith('0') ? `44${digits.slice(1)}` : `44${digits}`; return `https://wa.me/${intl}` }
const OLD_WEBHOOK_LINES = [
  "const digits = displayPhoneNumber.replace(/\\D/g, '')",
  "`+${digits}`,",
  "digits,",
  "digits.startsWith('44') ? `0${digits.slice(2)}` : null,",
]
const oldWebhookVariants = displayPhoneNumber => { const digits = displayPhoneNumber.replace(/\D/g, ''); return [`+${digits}`, digits, digits.startsWith('44') ? `0${digits.slice(2)}` : null].filter(v => v !== null) }
function assertHeadVerbatim() {
  const em = headOf('lib/email.ts'), wh = headOf('app/api/webhooks/meta/whatsapp/route.ts')
  for (const l of OLD_EMAIL_LINES) if (!em.includes(l)) throw new Error(`reference drift: HEAD lib/email.ts no longer holds: ${l}`)
  for (const l of OLD_WEBHOOK_LINES) if (!wh.includes(l)) throw new Error(`reference drift: HEAD webhook no longer holds: ${l}`)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE SCREENS — the customer order form and the setup wizard, rendered as a UK browser
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
const FMT = { currency: 'GBP', locale: 'en-GB' }
const GB_TS = { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
let ui
async function uiBundles() {
  if (ui) return ui
  const OP = 'app/trucks/[slug]/order/page.tsx', SETUP = 'app/setup/page.tsx'
  ui = {
    op: await kit.bundle('op', `export { default as OrderPage } from '@/${OP}'`, { patches: [
      { file: OP, states: ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'formSheetOpen', 'availableSlots', 'phone', 'name', 'email'] },
      { file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' },
    ] }),
    // Phase 2D-1: the phone box is on the page's SECOND step now ('identity'), and its copy is the chosen
    // country's, from the countries list the shared step fetches (components/setup/WhereBasedStep.tsx).
    setup: await kit.bundle('setup', `export { default as Setup } from '@/${SETUP}'`, { patches: [
      { file: SETUP, states: ['checking', 'contactPhone', 'name', 'stage', 'baseChoice'] },
      { file: 'components/setup/WhereBasedStep.tsx', states: ['state'] },
    ] }),
    email: await kit.bundle('email', `export * as E from '@/lib/email'`),
  }
  return ui
}
const MENU = { categories: [{ id: 'c1', name: 'Pizzas' }], items: [{ id: 'i1', name: 'Margherita', price: 9.5, category: 'Pizzas', available: true, modifierGroups: [] }], upsell_rules: [], bundles: [], codes: [] }
const EVENT = { id: 'ev-1', date: '09/10/2026', date_iso: '2026-10-09', date_friendly: 'X', start_time: '12:00', end_time: '23:59', venue_name: 'The Green', village: 'Harnessville', notes: '', status: 'open', collection_interval_mins: 10 }
const SCREEN_PHONES = ['', '07700 900123', '+44 7700 900123', '447380736226', '123', '07700 9001234', '+1 201 555 0123']
const EMAIL_PHONES = ['07380736226', '07380 736226', '+44 7380 736226', '447380736226', '+44 (0)7380 736226', '0044 7380 736226', '02079460958']
async function screens(opTruck, emailExtra, setupState = {}, phones = SCREEN_PHONES, emailPhones = EMAIL_PHONES) {
  const m = await uiBundles()
  kit.setNow('2026-10-09T14:20:00.000Z'); kit.setDeviceTz('Europe/London')
  const out = {}
  const basket = [{ menuItem: MENU.items[0], quantity: 1, modifiers: [], specialInstructions: '', cartKey: 'k1' }]
  for (const p of phones) {
    const r = kit.renderWith({ truck: opTruck, menu: MENU, events: [EVENT], event: EVENT, eventLoading: false, loading: false, basket, formSheetOpen: true, availableSlots: [], phone: p, name: 'Sam', email: 'sam@example.test' }, h(m.op.OrderPage, { params: { slug: 'test-kitchen' } }))
    const i = r.text.indexOf('Phone number')
    out[`order|${p}`] = { field: r.text.slice(i, i + 160), placeholders: r.attrs.filter(a => a.startsWith('placeholder=')) }
  }
  // setupState.phoneCopy (the old state) → the chosen country carrying that copy, on the truck step.
  const { phoneCopy, ...restSetup } = setupState
  const chosen = phoneCopy ? { code: phoneCopy.phoneCountry, name: phoneCopy.phoneCountry, shortName: phoneCopy.short_name, timezones: [], defaultTimezone: '', phone: phoneCopy, flag: null } : null
  const s = kit.renderWith({ checking: false, contactPhone: '', name: 'Pizza Kitchen', stage: 'identity',
    ...(chosen ? { baseChoice: { country: chosen.code, timezone: '', place: { placeId: null, name: 'Sudbury', region: null, lat: null, lng: null } },
      state: { countries: [chosen], guess: { code: chosen.code, fromLocation: false } } } : {}), ...restSetup }, h(m.setup.Setup))
  // 🟡 NAMED UK DIFFERENCE (Phase 2D-1): the stepper gains "1. Where you’re based" (the others renumber) and the
  // truck step gains a Back button. Both are removed here so everything else on the screen is compared as before.
  const setupText = s.text.replace('1. Where you’re based › 2. Your truck › 3. Your menu › 4. First event', '1. Your truck › 2. Your menu › 3. First event').replace(/ Back Continue$/, ' Continue')
  out.setup = { text: setupText, placeholders: s.attrs.filter(a => a.startsWith('placeholder=')) }
  // the confirmation email's WhatsApp contact line, for the shapes a truck's contact phone takes
  for (const p of emailPhones) {
    const e = m.email.E.formatConfirmationEmail({ orderId: '40', orderKey: 'k', truckName: 'Pizza Kitchen', customerName: 'Sam', slot: '18:30', items: [{ name: 'Margherita', quantity: 1, unit_price: 9.5, modifiers: [] }], deals: [], discountAmt: 0, total: 9.5, notes: null, venueName: 'The Green', venueTown: 'Harnessville', allowCancellation: false, cancellationCutoffMins: 0, baseUrl: 'https://www.hatchgrab.com', truckSlug: 'test-kitchen', variant: 'confirmation', autoAccepted: true, money: FMT, time: GB_TS, preferredContactMethod: 'whatsapp', contactPhone: p, ...emailExtra })
    out[`email|${p}`] = { html: e.html, text: e.text }
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// CAPTURE — the pre-2C code (isValidUKPhone and the three normalisers as they stand)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
async function captureBefore() {
  assertHeadVerbatim()
  const libs = await kit.bundle('libs-before', [
    `export { isValidUKPhone } from '@/lib/contact-validation'`,
    `export { phoneWhatsApp } from '@/lib/whatsapp-hint'`,
    `export { normaliseUkPhone, phoneDigits } from '@/lib/admin/truck-details'`,
  ].join('\n'))
  const rows = corpus().map(({ label, input }) => ({
    label, input,
    valid: libs.isValidUKPhone(input),
    emailLink: input ? oldEmailLink(input) : null,
    hint: libs.phoneWhatsApp(input, 'Cash, Card, WhatsApp'),
    details: libs.normaliseUkPhone(input),
    digits: libs.phoneDigits(input),
    webhook: oldWebhookVariants(input),
  }))
  const opTruck = { id: 'test-truck', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro', ordering_available: true, card_payments_ready: false, money: FMT, time: GB_TS, country: 'GB' }
  return { rows, screens: await screens(opTruck, {}) }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// AFTER — the Phase 2C code, against the BEFORE snapshot
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// The settings the new copy reads, from the migration that seeds them (never typed in here).
function phoneSeeds() {
  const sql = read('supabase/migrations/20261010_11_country_settings_phone_copy.sql')
  const out = {}
  for (const m of sql.matchAll(/set (short_name|phone_example)\s*=\s*'([^']*)'\s*where country_code = '([A-Z]{2})'/g)) (out[m[3]] ??= {})[m[1]] = m[2]
  return out
}
// phone_check: every row's value after 20261010_12 is its default — the same parser the other harnesses use.
const copyFor = (code, seeds) => ({ phoneCountry: code, short_name: seeds[code].short_name, phone_example: seeds[code].phone_example, phoneCheck: require('./_country-settings-gb.cjs').phoneCheckDefault() })

// ── THE ALLOWED DIFFERENCES — Dominic, 10 October 2026: "Use libphonenumber's length check ('possible') for
// every country … Newly refused 12-digit national numbers and numbers followed by text are accepted as the
// new behaviour; name them in the harness as allowed differences." Each class below is named, and a row that
// moves without matching one fails the run. The classifier reads digits only to SAY which class a row is in;
// the product code has no such rule.
const digitsOf = s => (s || '').replace(/[^\d+]/g, '')
const hasText = s => /[^\d\s+().\-]/.test(s || '')   // anything but digits and the usual punctuation
let LP
const otherCountry = s => { try { const d = digitsOf(s); const intl = d.startsWith('+') ? d : d.startsWith('00') ? '+' + d.slice(2) : '+' + d; const p = LP.parsePhoneNumberFromString(intl); return p?.country ?? null } catch { return null } }
const REFUSED = [
  { id: 'R1', why: 'a national number with 11 digits after the 0 (or after +44 / 44) — one more than any UK number has', test: r => /^(0|\+?44)\d{11}$/.test(digitsOf(r.input)) },
  { id: 'R2', why: 'words or other characters around the number ("(mob)", "tel:", "ext", "/" between two numbers)', test: r => hasText(r.input) },
  { id: 'R3', why: 'a string starting 00 that is not a real international number (00 is the international prefix)', test: r => /^00/.test(digitsOf(r.input)) },
  { id: 'R4', why: 'a 9-digit number in the Isle of Man / Jersey / Guernsey ranges, which share +44 but need 10 digits', test: r => ['IM', 'JE', 'GG'].includes(otherCountry(r.input)) },
]
const ACCEPTED = [
  { id: 'A1', why: 'a real number written with 0044 (the international prefix), which the old length rule refused', test: r => /^0044/.test(digitsOf(r.input)) },
  { id: 'A2', why: 'a number from another country written with + (a visiting customer) — or 00 and its country code', test: r => { const c = otherCountry(r.input); return /^(\+|00)/.test(digitsOf(r.input)) && c && c !== 'GB' } },
  { id: 'A3', why: 'a short number of a length the UK plan allows (0 + 6–8 digits, e.g. a 7-digit 0800 or a local number)', test: r => /^0\d{6,8}$/.test(digitsOf(r.input)) },
  { id: 'A4', why: 'a UK number written without its leading 0 ("7700 900123")', test: r => /^[1-9]\d{8,9}$/.test(digitsOf(r.input)) },
]
const LINK = [
  { id: 'L1', why: 'a stray 0 after +44 / 44 ("+44 (0)7380 …"): the old link kept it (wa.me/4407…, which cannot open); now the real number', test: r => /^\+?440/.test(digitsOf(r.input)) },
  { id: 'L2', why: 'a string starting 00: the old link prefixed it with 44; now read as international, or no link', test: r => /^00/.test(digitsOf(r.input)) },
  { id: 'L3', why: 'an extension or words with the number: the old link folded them into the digits; now the number alone', test: r => hasText(r.input) },
  { id: 'N1', why: "a number in no allocated UK range (the library has no format for it, e.g. 010…): its national form has no leading 0, so the webhook's third variant and the admin display drop it", test: r => { try { const p = LP.parsePhoneNumberFromString(r.input, 'GB'); return !!p && p.formatNational() === p.nationalNumber } catch { return false } } },
]
function classify(rules, r) { return rules.find(x => x.test(r))?.id ?? null }

async function checkAfter() {
  const fails = [], tally = {}
  const note = (id, input) => { (tally[id] ??= []).push(input) }
  LP = require(path.join(REPO, 'node_modules/libphonenumber-js/min'))
  const B = JSON.parse(read(BEFORE_FILE))
  const seeds = phoneSeeds()
  if (seeds.GB?.short_name !== 'UK' || seeds.GB?.phone_example !== '07700 900123') fails.push(`the GB seed is not UK / 07700 900123: ${JSON.stringify(seeds.GB)}`)
  if (seeds.US?.short_name !== 'US' || seeds.US?.phone_example !== '(201) 555-0123') fails.push(`the US seed is not US / (201) 555-0123: ${JSON.stringify(seeds.US)}`)
  const GB = copyFor('GB', seeds), US = copyFor('US', seeds)
  const L = await kit.bundle('libs-after', [
    `export * as P from '@/lib/phone'`, `export { phoneWhatsApp } from '@/lib/whatsapp-hint'`,
    `export { normaliseUkPhone, phoneDigits } from '@/lib/admin/truck-details'`,
  ].join('\n'))
  const newWebhook = d => { const digits = d.replace(/\D/g, ''); return [`+${digits}`, digits, L.P.nationalDigitsOfInternational(digits)].filter(v => v !== null) }
  // ── 1 · the corpus
  for (const r of B.rows) {
    const valid = L.P.isPlausiblePhone(r.input, 'GB', 'length')
    if (valid !== r.valid) {
      const id = classify(r.valid ? REFUSED : ACCEPTED, r)
      if (!id) fails.push(`${r.valid ? 'newly REFUSED' : 'newly ACCEPTED'} and no allowance names it: ${JSON.stringify(r.input)} (${r.label})`)
      else note(id, r.input)
      if (!r.valid && id === 'A3' && !LP.isPossiblePhoneNumber(r.input, 'GB')) fails.push(`A3 row not plausible?? ${r.input}`)
    }
    if (!(valid && r.valid)) continue
    // stored form: every surface stores the raw input — nothing to compare but that the module never rewrites it
    // link forms (email, hint, webhook) — byte-identical unless a named class
    const link = L.P.phoneLinkDigits(r.input, 'GB')
    if (`https://wa.me/${link}` !== r.emailLink) { const id = classify(LINK, r); if (!id) fails.push(`email link moved: ${JSON.stringify(r.input)} ${r.emailLink} → ${link}`); else note(id, r.input) }
    const hint = L.phoneWhatsApp(r.input, 'Cash, Card, WhatsApp', 'GB')
    if (JSON.stringify(hint) !== JSON.stringify(r.hint)) {
      const id = classify(LINK, r)
      const onlyWa = ['cleanPhone', 'hasPhone', 'acceptsWhatsApp'].every(k => hint[k] === r.hint[k])
      if (!id || !onlyWa) fails.push(`whatsapp hint moved: ${JSON.stringify(r.input)} ${JSON.stringify(r.hint)} → ${JSON.stringify(hint)}`)
    }
    const wh = newWebhook(r.input)
    if (JSON.stringify(wh) !== JSON.stringify(r.webhook)) { const id = classify(LINK, r); if (!id) fails.push(`webhook variants moved: ${JSON.stringify(r.input)} ${JSON.stringify(r.webhook)} → ${JSON.stringify(wh)}`); else note(`W:${id}`, r.input) }
  }
  // admin truck-detail display (normaliseUkPhone) and the matcher (phoneDigits): every row the old code wrote
  // must be written identically; a row it no longer writes must be a named refusal class
  for (const r of B.rows) {
    const det = L.normaliseUkPhone(r.input, 'GB')
    if (JSON.stringify(det) !== JSON.stringify(r.details)) {
      const wrote = r.details.mobile || r.details.landline
      const D1 = !wrote && /^44\d{9}$/.test(digitsOf(r.input))   // 44 + 9 digits, no '+': the old display needed 12 digits to read 44 as the country
      const id = D1 ? 'D1' : wrote ? (classify(REFUSED, r) || classify(LINK, r)) : (classify(ACCEPTED, r) || classify(LINK, r))
      if (!id) fails.push(`admin truck-detail display moved: ${JSON.stringify(r.input)} ${JSON.stringify(r.details)} → ${JSON.stringify(det)}`)
      else note(`D:${id}`, r.input)
    }
    const dg = L.phoneDigits(r.input, 'GB')
    if (dg !== r.digits) { const id = classify(REFUSED, r) || classify(ACCEPTED, r) || classify(LINK, r) || (r.digits && !/^0/.test(r.digits) ? 'M1' : null); if (!id) fails.push(`matcher digits moved: ${JSON.stringify(r.input)} ${r.digits} → ${dg}`); else note(`M:${id}`, r.input) }
  }
  // ── 2 · the copy: GB reads exactly as each surface did
  const OLD = { mobile: 'Please enter a valid UK mobile (e.g. 07700 900123)', phone: 'Please enter a valid UK phone (e.g. 07700 900123)', phone_number: 'Enter a valid UK phone number (e.g. 07700 900123).' }
  for (const [k, v] of Object.entries(OLD)) if (L.P.phoneErrorMessage(k, GB) !== v) fails.push(`GB ${k} message: "${L.P.phoneErrorMessage(k, GB)}" ≠ today's "${v}"`)
  for (const [f, re] of [
    // Language Phase 1a: the order page passes its language, and the placeholder's "e.g. " is a message around the
    // same example — still the truck's country's (docs/language-phase-1a-report.md).
    ['app/trucks/[slug]/order/page.tsx', /phoneErrorMessage\('mobile', pagePhone, pageLocale\)/], ['app/trucks/[slug]/order/page.tsx', /placeholder=\{phonePlaceholder\(pagePhone\) && tOrder\('phonePlaceholder', \{ example: phonePlaceholder\(pagePhone\) \}\)\}/],
    ['app/manage/[token]/page.tsx', /phoneErrorMessage\('phone', phoneCopy\)/], ['app/manage/[token]/page.tsx', /placeholder=\{phonePlaceholder\(phoneCopy\)\}/],
    ['app/setup/page.tsx', /phoneErrorMessage\('phone_number', phoneCopy\)/], ['app/setup/page.tsx', /placeholder=\{phonePlaceholder\(phoneCopy\)\}/],
    // Phase 2D-1: the demo modal words its box from the CHOSEN country (signupPhone), and the API from the chosen row.
    ['components/DemoGetStarted.tsx', /phoneErrorMessage\('phone_number', signupPhone\)/], ['components/DemoGetStarted.tsx', /placeholder=\{phonePlaceholder\(signupPhone\)\}/],
    ['app/api/setup/route.ts', /const signupPhone = phoneCopyOf\(countryRow\)[\s\S]{0,200}phoneErrorMessage\('phone_number', signupPhone\)/],
  ]) if (!re.test(read(f))) fails.push(`${f} no longer words its phone box from the settings: ${re}`)
  // ── 3 · the rendered screens and emails, against BEFORE
  const opTruck = { id: 'test-truck', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro', ordering_available: true, card_payments_ready: false, money: FMT, time: GB_TS, country: 'GB', phone: GB }
  const after = await screens(opTruck, { phoneCountry: 'GB' }, { phoneCopy: GB })
  for (const [k, v] of Object.entries(B.screens)) {
    if (JSON.stringify(after[k]) === JSON.stringify(v)) continue
    const input = k.startsWith('email|') ? k.slice(6) : null
    if (input && classify(LINK, { input })) { note(`E:${classify(LINK, { input })}`, input); continue }
    if (k.startsWith('order|')) {
      // the order form's message follows the corpus verdict for that input — so a move must be a named class
      const row = B.rows.find(x => x.input === k.slice(6)) ?? { input: k.slice(6), valid: !/Please enter/.test(v.field) }
      const id = classify(row.valid ? REFUSED : ACCEPTED, row)
      const nowValid = !/Please enter/.test(after[k].field)
      if (id && nowValid !== row.valid && JSON.stringify(after[k].placeholders) === JSON.stringify(v.placeholders)) { note(`S:${id}`, k); continue }
    }
    fails.push(`screen moved: ${k}\n     before ${JSON.stringify(v).slice(0, 300)}\n     after  ${JSON.stringify(after[k]).slice(0, 300)}`)
  }
  // ── 4 · a US truck
  const us = [], usOk = (label, ok, d) => { if (!ok) fails.push(`US: ${label}${d === undefined ? '' : ' — ' + JSON.stringify(d)}`); else us.push(label) }
  const usForms = ['(201) 555-0123', '201-555-0123', '+1 201 555 0123', '2015550123']
  usOk('the four ways of writing (201) 555-0123 are accepted', usForms.every(p => L.P.isPlausiblePhone(p, 'US', 'length')), usForms.map(p => L.P.isPlausiblePhone(p, 'US', 'length')))
  usOk('…and give one link form, 12015550123', usForms.every(p => L.P.phoneLinkDigits(p, 'US') === '12015550123'), usForms.map(p => L.P.phoneLinkDigits(p, 'US')))
  usOk('a UK number with +44 is accepted on a US truck (a visitor)', L.P.isPlausiblePhone('+44 7380 736226', 'US', 'length') && L.P.phoneLinkDigits('+44 7380 736226', 'US') === '447380736226')
  const bad = ['555-0123', '12345', '201 555 01234 5', '07700 900123']
  usOk('clearly invalid US numbers are refused', bad.every(p => !L.P.isPlausiblePhone(p, 'US', 'length')), bad.map(p => L.P.isPlausiblePhone(p, 'US', 'length')))
  usOk('the US message', L.P.phoneErrorMessage('mobile', US) === 'Please enter a valid US mobile (e.g. (201) 555-0123)', L.P.phoneErrorMessage('mobile', US))
  usOk('the US example passes its own check', L.P.isPlausiblePhone(US.phone_example, 'US', 'length'))
  const usTruck = { ...opTruck, country: 'US', phone: US, money: { currency: 'USD', locale: 'en-US' } }
  const usScreens = await screens(usTruck, { phoneCountry: 'US', money: { currency: 'USD', locale: 'en-US' } }, { phoneCopy: US }, ['555-0123', '(201) 555-0123', '+44 7380 736226'], ['(201) 555-0123'])
  usOk('the order form refuses 555-0123 with the US message', usScreens['order|555-0123'].field.includes('Please enter a valid US mobile (e.g. (201) 555-0123)'), usScreens['order|555-0123'].field)
  usOk('…accepts (201) 555-0123 and +44 7380 736226 with no message', !/Please enter/.test(usScreens['order|(201) 555-0123'].field) && !/Please enter/.test(usScreens['order|+44 7380 736226'].field))
  usOk('…and shows the US placeholder', usScreens['order|(201) 555-0123'].placeholders.includes('placeholder=e.g. (201) 555-0123'), usScreens['order|(201) 555-0123'].placeholders)
  usOk('the setup page shows the US placeholder', usScreens.setup.placeholders.includes('placeholder=(201) 555-0123'), usScreens.setup.placeholders)
  usOk("a US truck's WhatsApp email link is wa.me/12015550123", /wa\.me\/12015550123"/.test(usScreens['email|(201) 555-0123'].html))
  // ── 5 · the per-country check setting (20261010_12): 'length' is everything above; 'strict' and 'off'
  const modes = [], modeOk = (label, ok, d) => { if (!ok) fails.push(`phone_check: ${label}${d === undefined ? '' : ' — ' + JSON.stringify(d)}`); else modes.push(label) }
  modeOk("the seeded default is 'length'", GB.phoneCheck === 'length' && US.phoneCheck === 'length', [GB.phoneCheck, US.phoneCheck])
  modeOk("'strict' refuses 07700 900123 for GB (a drama number, not a real one)", !L.P.isPlausiblePhone('07700 900123', 'GB', 'strict'))
  modeOk("'strict' accepts 07380 736226 for GB", L.P.isPlausiblePhone('07380 736226', 'GB', 'strict'))
  modeOk("'strict' checks a + visitor in its own country: +1 201 555 0123 on a GB truck", L.P.isPlausiblePhone('+1 201 555 0123', 'GB', 'strict') && !L.P.isPlausiblePhone('+1 201 555 01', 'GB', 'strict'))
  modeOk("'off' accepts \"abc\"", L.P.isPlausiblePhone('abc', 'GB', 'off'))
  modeOk("'off' still refuses empty (the caller decides optional)", !L.P.isPlausiblePhone('', 'GB', 'off') && !L.P.isPlausiblePhone('   ', 'GB', 'off'))
  modeOk("links are unchanged by the mode: an unparseable number simply has no link", L.P.phoneLinkDigits('abc', 'GB') === null && L.P.phoneLinkDigits('07380 736226', 'GB') === '447380736226')
  for (const [f, re] of [['app/trucks/[slug]/order/page.tsx', /isPlausiblePhone\(phone, pagePhone\.phoneCountry, pagePhone\.phoneCheck\)/],
    ['app/manage/[token]/page.tsx', /isPlausiblePhone\(form\.contact_phone \|\| '', phoneCopy\.phoneCountry, phoneCopy\.phoneCheck\)/],
    ['app/setup/page.tsx', /isPlausiblePhone\(contactPhone, phoneCopy\.phoneCountry, phoneCopy\.phoneCheck\)/],
    ['components/DemoGetStarted.tsx', /isPlausiblePhone\(contactPhone, signupPhone\.phoneCountry, signupPhone\.phoneCheck\)/],
    ['app/api/setup/route.ts', /isPlausiblePhone\(contactPhone, signupPhone\.phoneCountry, signupPhone\.phoneCheck\)/]])
    modeOk(`${f} passes the mode from settings`, re.test(read(f)))
  usOk('the webhook national variant of a US number', JSON.stringify(newWebhook('12015550123')) === JSON.stringify(['+12015550123', '12015550123', '2015550123']), newWebhook('12015550123'))
  return { fails, tally, us, modes }
}

module.exports = { corpus, kit, screens, uiBundles, oldEmailLink, oldWebhookVariants, assertHeadVerbatim, NSN, EDGE, checkAfter, phoneSeeds, REFUSED, ACCEPTED, LINK }

if (require.main === module) {
  ;(async () => {
    if (CAPTURE) { const snap = await captureBefore(); fs.writeFileSync(path.resolve(CAPTURE), JSON.stringify(snap, null, 1)); console.log(`captured ${snap.rows.length} corpus rows + ${Object.keys(snap.screens).length} screens → ${CAPTURE}`); return }
    const r = await checkAfter()
    const B = JSON.parse(read(BEFORE_FILE))
    console.log(`GB: ${B.rows.length} corpus inputs and ${Object.keys(B.screens).length} screens/emails compared with ${BEFORE_FILE}`)
    for (const rule of [...REFUSED, ...ACCEPTED, ...LINK, { id: 'M1', why: "the admin matcher only (phoneDigits, never shown or stored): a number with no leading 0 was compared as typed (e.g. +1 415 …); now every number is compared in its national form" }, { id: 'D1', why: "admin truck-detail display only: '44' + a 9-digit national number written without '+' (e.g. 44 1697 72345) — the old display needed 12 digits before it read 44 as the country code (while the old validator already accepted it); now written like +44 1697 72345" }]) {
      const rows = r.tally[rule.id] || []
      console.log(`  ${rule.id} ${String(rows.length).padStart(4)} — ${rule.why}${rows.length ? `  e.g. ${rows.slice(0, 3).map(x => JSON.stringify(x)).join(', ')}` : ''}`)
    }
    for (const [k, v] of Object.entries(r.tally).filter(([k]) => k.includes(':'))) console.log(`  ${k.padEnd(6)} ${String(v.length).padStart(4)} (the same classes, seen in ${k[0] === 'D' ? 'the admin truck-detail display' : k[0] === 'M' ? 'the matcher digits' : k[0] === 'E' ? 'the rendered email' : k[0] === 'W' ? 'the webhook variants' : 'a rendered screen'})`)
    console.log(`US: ${r.us.length} checks — ${r.us.join('; ')}`)
    console.log(`phone_check (20261010_12): ${r.modes.length} checks — ${r.modes.join('; ')}`)
    if (r.fails.length) { console.error(`\n🔴 ${r.fails.length} failure(s):\n` + r.fails.slice(0, 40).map(f => '  ✗ ' + f).join('\n')); process.exit(1) }
    console.log('\n✅ phone-parity: every UK number accepted, stored and linked as before, apart from the named classes; US correct')
  })().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
}
