// scripts/ireland-2.cjs — IRELAND, STAGE IE-2: THE /compare FEE BOX UNIT (docs/ireland-2-report.md).
//
// LOCALHOST ONLY. Nothing reaches a database or the network: the country rows are fixtures (the GB/US seed rows, and an IE
// row with the values of the ireland-1 SQL, switched ON here so /ie/compare renders), the plan catalogue is the seed's
// plus IE prices, and the render kit stubs everything else. Checks:
//   1  THE UNIT — /compare's "per order" fee box shows the registry's minor-unit sign: GB "p", US "¢", and now IE "c"
//      (it was empty: minorUnitSuffix is null for EUR, whose SENTENCES write "€0.25").
//   2  GB AND US BYTE-IDENTICAL — /uk/compare and /us/compare rendered by today's code and by the same code with the box
//      reading minorUnitSuffix (the code before ireland-2) are the same bytes; /ie/compare differs only by that "c".
//   3  THE HELPERS AGREE — for every registry currency that writes a small fee in its minor unit, minorUnitSign ===
//      minorUnitSuffix, so no GB/US/CA/AU/NZ box can change; EUR and the not-yet-used European currencies gain a sign.
//   4  AN IRISH FIXTURE TRUCK, THE NON-PAYMENT PATH (the test-truck checklist's checks, run on fixtures): the customer's
//      confirmation, ready and refund emails, the printed ticket, the allergen list. € amounts, 24-hour Dublin times,
//      "Pay at the truck on collection", uk14. No database, no network: Brevo is a recorder in this process.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const kit = require('./_render-kit.cjs')({ cacheTag: 'ireland-2' })
const { REPO, h } = kit
const LP1E = require('./_lp1e-fixtures.cjs')
const { seedCatalog } = require('./_plans-catalog-fixture.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

/** The IE row — the values of the ireland-1 SQL (live since 21 Oct, switched off); switched ON here to render /ie/compare. */
const IE = (enabled) => ({
  ...LP1E.GB(), countryCode: 'IE', name: 'Ireland', enabled, currency: 'EUR', locale: 'en-IE', phoneCountryCode: '353',
  timezones: ['Europe/Dublin'], defaultTimezone: 'Europe/Dublin',
  starterMonthlyMinor: null, proMonthlyMinor: null, maxMonthlyMinor: null, proAllowanceMinor: null, maxAllowanceMinor: null, platformFeePct: null,
  cardFeeOnlinePct: 1.5, cardFeeOnlineFixedMinor: 25, cardFeeInPersonPct: 1.4, cardFeeInPersonFixedMinor: 10, tapToPayFixedMinor: 10,
  cardFeeRegionLabel: 'EEA cards', shortName: 'Ireland', phoneExample: '085 123 4567', updatedBy: 'europe-readiness draft',
})
const CATALOG = (() => {
  const c = seedCatalog(REPO)
  for (const p of c.prices.filter(p => p.countryCode === 'GB')) c.prices.push({ ...p, countryCode: 'IE' })
  return c
})()
const tables = { plans: CATALOG.plans.map(snake), plan_prices: CATALOG.prices.map(snake), plan_features: CATALOG.features.map(snake) }
const ROWS = () => [LP1E.GB(), LP1E.US_ON(), IE(true)]

// The box's unit span, as the page renders it (the only element with this exact class list that follows the fee input).
const UNIT = /<input[^>]*aria-label="(?:Pence|Cents) per order"[^>]*\/?>(?:<!-- -->)?<span class="pl-1 text-lg font-bold text-slate-400">([^<]*)<\/span>/
// The code before ireland-2: the box read minorUnitSuffix.
const BEFORE = [
  { file: 'app/compare/CostComparison.tsx', from: 'pctLabel, minorUnitSign, type MoneyFormat }', to: 'pctLabel, minorUnitSuffix, type MoneyFormat }' },
  { file: 'app/compare/CostComparison.tsx', from: '{minorUnitSign(fmt.currency) ?? \'\'}', to: '{minorUnitSuffix(fmt.currency) ?? \'\'}' },
]

;(async () => {
  const ctx = LP1E.context(kit, REPO)
  const entry = `export { default } from '@/app/[country]/compare/page'\nexport { clearPlanCatalogCache as __clearPlans } from '@/lib/plans-server'\nexport { clearCountrySettingsCache as __clearCs } from '@/lib/country-settings'`
  const NOW = await ctx.bundle('ie2-compare-now', entry)
  const OLD = await ctx.bundle('ie2-compare-before', entry, { patches: BEFORE })
  const render = (M, seg) => ctx.withReq({ rows: ROWS(), tables }, async () => {
    M.__clearPlans(); M.__clearCs?.()
    return ctx.prerender(h(M.default, { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) }))
  })
  const R = {}
  for (const seg of ['uk', 'us', 'ie']) R[seg] = { now: await render(NOW, seg), before: await render(OLD, seg) }

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · THE UNIT — the "per order" box shows p / ¢ / c')
  const unit = html => (String(html).match(UNIT) || [])[1]
  for (const [seg, want] of [['uk', 'p'], ['us', '¢'], ['ie', 'c']]) {
    t(`/${seg}/compare: the fee box's unit is "${want}"`, unit(R[seg].now) === want, { found: unit(R[seg].now) })
  }
  t('before ireland-2, /ie/compare\'s box had no unit (the bug this fixes)', unit(R.ie.before) === '', { found: unit(R.ie.before) })
  t('/ie/compare still writes the card fee as "€0.25" in its sentences (EUR stays shortFee "amount")',
    /1\.5% \+ €0\.25/.test(String(R.ie.now)) && !/\b25c\b/.test(String(R.ie.now)))

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · GB AND US BYTE-IDENTICAL — today\'s code vs the box reading minorUnitSuffix')
  for (const seg of ['uk', 'us']) {
    t(`/${seg}/compare: the same bytes before and after (${String(R[seg].now).length} chars, sha ${sha(String(R[seg].now))})`,
      !!R[seg].now && R[seg].now === R[seg].before, { now: sha(String(R[seg].now)), before: sha(String(R[seg].before)) })
  }
  const ieNow = String(R.ie.now), ieBefore = String(R.ie.before)
  t('/ie/compare: the only difference is the unit "c" in that one span',
    ieNow !== ieBefore && ieNow.replace(UNIT, m => m.replace(/>c<\/span>$/, '></span>')) === ieBefore)

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · THE HELPERS AGREE — minorUnitSign = minorUnitSuffix wherever a sentence uses the minor unit')
  const M = await ctx.bundle('ie2-money', "export { minorUnitSign, minorUnitSuffix } from '@/lib/money-format'\nexport { CURRENCY_CODES } from '@/lib/currencies'")
  const codes = [...(M.CURRENCY_CODES ?? [])]
  const differ = codes.filter(c => M.minorUnitSign(c) !== M.minorUnitSuffix(c))
  const minorStyle = codes.filter(c => M.minorUnitSuffix(c) !== null)
  t(`the registry lists 14 currencies (${codes.join(' ')})`, codes.length === 14, codes)
  t(`every "minor" currency's box keeps its sign (${minorStyle.map(c => `${c} ${M.minorUnitSign(c)}`).join(', ')})`,
    minorStyle.length > 0 && minorStyle.every(c => M.minorUnitSign(c) === M.minorUnitSuffix(c)) && minorStyle.includes('GBP') && minorStyle.includes('USD'))
  t(`the box changes only where a sentence writes an amount: ${differ.map(c => `${c} → "${M.minorUnitSign(c)}"`).join(', ')} (EUR among them; GBP and USD not)`,
    differ.includes('EUR') && !differ.includes('GBP') && !differ.includes('USD') && differ.every(c => M.minorUnitSuffix(c) === null && !!M.minorUnitSign(c)), differ)

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · AN IRISH FIXTURE TRUCK — emails, the printed ticket, allergens (no database, no network)')
  const EUR = { currency: 'EUR', locale: 'en-IE' }
  const TIME = { timeZone: 'Europe/Dublin', locale: 'en-IE', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
  const W = await ctx.bundle('ie2-walk', [
    "export * as Mail from '@/lib/email'",
    "export * as T from '@/lib/printing/ticket'",
    "export { mapOrderToTicket } from '@/lib/printing/mapOrderToTicket'",
    "export { allergenVocab } from '@/lib/allergens'",
  ].join('\n'))
  const items = [{ name: 'Margherita', quantity: 1, unit_price: 12, modifiers: [] }, { name: 'Supreme', quantity: 1, unit_price: 16, modifiers: [] }]
  const base = { orderId: '3', orderKey: 'ok-ie-3', truckName: 'Pizza Kitchen IE', customerName: 'Aoife', slot: '13:30', items, deals: [], discountAmt: 0,
    total: 28, notes: null, autoAccepted: true, phoneCountry: 'IE', money: EUR, time: TIME, venueName: "People's Park", venueTown: 'Limerick', paymentState: 'hatch' }
  const conf = W.Mail.formatConfirmationEmail(base)
  const ready = W.Mail.formatConfirmationEmail({ ...base, variant: 'ready' })
  const noForeign = s => !/£|\$\d/.test(s)
  t(`confirmation: "${conf.subject}" — €12.00, €16.00, €28.00; collection 13:30; "Pay at the truck on collection"; no £ or $`,
    ['€12.00', '€16.00', '€28.00', '13:30', 'Pay at the truck on collection'].every(x => conf.text.includes(x) || conf.html.includes(x)) && noForeign(conf.text + conf.html),
    conf.text.slice(0, 700))
  t(`ready: "${ready.subject}" — the same € lines, no collection-time box`, ready.text.includes('€28.00') && noForeign(ready.text + ready.html), ready.text.slice(0, 400))
  // The refund email is only built inside its sender: Brevo is replaced by a recorder in THIS process (no network).
  const sent = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), body: JSON.parse(init.body) }); return new Response('{"messageId":"harness"}', { status: 201 }) }
  process.env.BREVO_API_KEY = 'harness-recorder-not-a-key'
  try { await W.Mail.sendRefundEmail({ to: 'aoife@example.test', customerName: 'Aoife', orderId: '3', truckName: 'Pizza Kitchen IE', amountMinor: 1600, chargedMinor: 2800, money: EUR }) }
  finally { globalThis.fetch = realFetch; delete process.env.BREVO_API_KEY }
  const rf = sent[0]?.body
  t(`refund (partial): "${rf?.subject}" — €16.00 refunded, €12.00 remaining; sent nowhere (recorded)`,
    sent.length === 1 && sent[0].url.includes('brevo') && /€16\.00/.test(rf?.htmlContent ?? '') && /€12\.00/.test(rf?.htmlContent ?? '') && noForeign(rf?.htmlContent ?? ''), rf?.textContent)
  const order = { id: '3', order_key: 'ok-ie-3', customer_name: 'Aoife', customer_phone: null, slot: '13:30', buzzer_number: null, items, deals: [], notes: null,
    total: 28, total_minor: 2800, currency: 'EUR', country: 'IE', status: 'confirmed', payment_status: 'unpaid' }
  const truck = { name: 'Pizza Kitchen IE', money: { ...EUR, localeByCountry: { IE: 'en-IE' } }, time: TIME }
  const ticket = W.mapOrderToTicket({ order, truck, event: null, ledgerRows: [], printedLabel: '13:01' })
  const lines = W.T.buildTicketLines(ticket, { paper_width: 58 }).map(l => l.text ?? (l.divider ? '----' : ''))
  const bytes = Array.from(W.T.renderTicket(ticket, { paper_width: 58 }))
  t(`ticket, 58 mm: "${lines.find(l => /^TOTAL/.test(l))}", collection "${lines.find(l => /13:30/.test(l))}", no non-ASCII byte (the printer can't print €)`,
    lines.some(l => /^TOTAL\s+EUR 28\.00$/.test(l)) && lines.some(l => /13:30/.test(l)) && !lines.some(l => /€|£|\$/.test(l)) && bytes.every(b => b < 128),
    lines.join(' | '))
  const vocab = W.allergenVocab(IE(true).allergenSet)
  t(`allergens: the IE row's set is uk14 — the 14 (${vocab.join(', ')})`, IE(true).allergenSet === 'uk14' && vocab.length === 14 && vocab.includes('Celery') && vocab.includes('Lupin'))
  if (process.env.IE2_WALK_OUT) {   // optional: what the walk produced, for the report
    fs.mkdirSync(process.env.IE2_WALK_OUT, { recursive: true })
    fs.writeFileSync(path.join(process.env.IE2_WALK_OUT, 'confirmation.txt'), `${conf.subject}\n\n${conf.text}`)
    fs.writeFileSync(path.join(process.env.IE2_WALK_OUT, 'confirmation.html'), conf.html)
    fs.writeFileSync(path.join(process.env.IE2_WALK_OUT, 'ready.txt'), `${ready.subject}\n\n${ready.text}`)
    fs.writeFileSync(path.join(process.env.IE2_WALK_OUT, 'refund.txt'), `${rf?.subject}\n\n${rf?.textContent}`)
    fs.writeFileSync(path.join(process.env.IE2_WALK_OUT, 'ticket-58mm.txt'), lines.join('\n'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
