// scripts/legal-follow-ups.cjs — the legal follow-ups (19 October 2026, docs/legal-follow-ups-report.md), proved on
// FIXTURES (the in-memory database of scripts/_fake-pg.cjs; nothing live, nothing sent). BEFORE is 8a5c4b5a.
//   5  the 12-month retention job: what it clears, what it keeps, NOT NULL handled, idempotent, drafts, purge called
//   9  CHECK 9: the platform-fee base (food_minor) never includes the tip
//   2  PostHog is cookieless
//   3  the service-fee notice beside the tax notice (none without a fee)
//   4  the privacy link on the order page, the confirmation page and every customer email footer
//   6  TERMS_VERSION from lib/legal.ts; the legal titles not doubled
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'legal-follow-ups' })
const { makeFakePg } = require('./_fake-pg.cjs')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 700)}` : ''}`) } }
const head = s => console.log(`\n${s}`)
const J = x => JSON.stringify(x)

;(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
  kit.setNow('2026-10-19T14:00:00Z')

  // ══ 5 · the retention job ═══════════════════════════════════════════════════════════════════════════
  head('5 · the 12-month retention job (lib/order-retention.ts, app/api/cron/order-retention)')
  {
    const R = await kit.bundle('lfu-retention', "export * from '@/lib/order-retention'")
    const now = new Date('2026-10-19T14:00:00Z'), cutoff = R.retentionCutoff(now)
    t('the cutoff is 12 calendar months before now (2025-10-19)', cutoff.toISOString() === '2025-10-19T14:00:00.000Z', cutoff.toISOString())
    const items = [{ name: 'Margherita', quantity: 1, unit_price: 9.5, modifiers: [{ name: 'Extra cheese', price: 1 }], specialInstructions: 'NUT ALLERGY — no pesto' }, { name: 'Coke', quantity: 2, unit_price: 2 }]
    const deals = [{ name: 'Lunch deal', price: 12, slots: { main: 'Margherita' }, slotNotes: { main: 'gluten free base please' } }]
    const order = (key, created, more = {}) => ({ order_key: key, truck_id: 'test-truck', id: key.slice(0, 2), created_at: created, customer_name: 'Sam Customer', customer_email: 'sam@example.test', customer_phone: '07700 900123',
      notes: 'Allergic to sesame', items: JSON.parse(J(items)), deals: JSON.parse(J(deals)), total: 21.5, total_minor: 2150, status: 'collected', ...more })
    const world = () => ({
      orders: [
        order('o1-old', '2025-09-01T12:00:00Z'),                                       // past the cutoff: cleared
        order('o2-new', '2026-10-01T12:00:00Z'),                                       // inside 12 months: untouched
        order('o3-old-nameless', '2025-10-05T12:00:00Z', { customer_name: '', customer_email: null, customer_phone: null, notes: null }),  // only per-dish notes left, inside the recheck window
        order('o4-already', '2025-01-01T12:00:00Z', { customer_name: '', customer_email: null, customer_phone: null, notes: null, items: [{ name: 'Coke', quantity: 1, unit_price: 2, specialInstructions: '' }], deals: null }),
      ],
      order_drafts: [
        { order_key: 'd1-promoted-old', truck_id: 'test-truck', created_at: '2025-09-01T12:00:00Z', promoted_at: '2025-09-01T12:01:00Z', customer_name: null, customer_email: null, customer_phone: null, notes: 'no onions', items: JSON.parse(J(items)), deals: null },
        { order_key: 'd2-promoted-new', truck_id: 'test-truck', created_at: '2026-10-01T12:00:00Z', promoted_at: '2026-10-01T12:01:00Z', customer_name: null, customer_email: null, customer_phone: null, notes: 'no onions', items: JSON.parse(J(items)), deals: null },
        { order_key: 'd3-never-promoted-old', truck_id: 'test-truck', created_at: '2025-09-01T12:00:00Z', promoted_at: null, customer_name: 'Ann', customer_email: 'ann@example.test', customer_phone: null, notes: 'x', items: [], deals: null },
      ],
      // ⚠️ ADDED (19 October 2026, Dominic): the WhatsApp logs — deleted, whole rows, once 12 months old. 503 old rows in
      // whatsapp_logs so the run crosses a batch (500); one old and one new in messages.
      whatsapp_logs: [
        ...Array.from({ length: 503 }, (_, i) => ({ id: `w-old-${String(i).padStart(3, '0')}`, truck_id: 'test-truck', customer_number: '447700900123', message_in: 'are you at the green on friday?', response_sent: 'Yes — 5pm to 9pm', created_at: '2025-09-01T12:00:00Z' })),
        { id: 'w-new', truck_id: 'test-truck', customer_number: '447700900123', message_in: 'and saturday?', response_sent: 'Yes', created_at: '2026-10-01T12:00:00Z' },
      ],
      messages: [
        { id: 1, order_id: '41', direction: 'outbound', channel: 'whatsapp', from_number: '447700900000', to_number: '447700900123', body: 'Your order is ready', created_at: '2025-08-01T12:00:00Z' },
        { id: 2, order_id: '42', direction: 'outbound', channel: 'whatsapp', from_number: '447700900000', to_number: '447700900123', body: 'Your order is ready', created_at: '2026-10-02T12:00:00Z' },
      ],
    })
    const pg = makeFakePg(world())
    let rpcCalls = []
    pg.rpc = async (fn) => { rpcCalls.push(fn); return { data: 2, error: null } }
    const r1 = await R.runOrderRetention(pg, now)
    const o = k => pg.tables.orders.find(x => x.order_key === k), d = k => pg.tables.order_drafts.find(x => x.order_key === k)
    const o1 = o('o1-old')
    t('an order past 12 months: name → "" (the column is NOT NULL), email and phone → null, the order note → null', o1.customer_name === '' && o1.customer_email === null && o1.customer_phone === null && o1.notes === null, o1)
    t('…each item\'s specialInstructions → "" and each deal\'s slotNotes → {}', o1.items[0].specialInstructions === '' && J(o1.deals[0].slotNotes) === '{}', { items: o1.items, deals: o1.deals })
    t('…and KEEPS the line items, modifiers, quantities, prices, deals and totals', o1.items[0].name === 'Margherita' && o1.items[0].modifiers[0].name === 'Extra cheese' && o1.items[1].quantity === 2 && o1.deals[0].slots.main === 'Margherita' && o1.total === 21.5 && o1.total_minor === 2150 && o1.status === 'collected')
    t('an order inside 12 months is not touched (byte for byte)', J(o('o2-new')) === J(world().orders[1]))
    t('a past order with no name left but a per-dish note (inside the 30-day recheck window) is cleared too', o('o3-old-nameless').items[0].specialInstructions === '' && J(o('o3-old-nameless').deals[0].slotNotes) === '{}')
    t('an order with nothing left to clear is not written at all (no needless write)', !pg.writes.some(w => w.table === 'orders' && J(w).includes('o4-already')))
    t('a PROMOTED draft past 12 months: its note and per-dish notes cleared (name, email and phone were already erased at promotion)', d('d1-promoted-old').notes === null && d('d1-promoted-old').items[0].specialInstructions === '')
    t('a promoted draft inside 12 months is not touched; a never-promoted draft is left to purge_order_drafts (not edited here)', d('d2-promoted-new').notes === 'no onions' && d('d3-never-promoted-old').customer_name === 'Ann')
    t('purge_order_drafts() is called on every run (abandoned drafts — nothing was scheduling it)', J(rpcCalls) === J(['purge_order_drafts']) && r1.draftsPurged === 2, rpcCalls)
    t('the run reports what it did', r1.ordersCleared === 2 && r1.draftsCleared === 1 && r1.failures.length === 0, r1)
    // ⚠️ ADDED (19 October 2026): the WhatsApp logs, privacy section 7's "12 months"
    t('WhatsApp logs past 12 months are DELETED — all 503 old whatsapp_logs rows (across two batches) and the old messages row', r1.whatsappLogsDeleted === 503 && r1.messagesDeleted === 1
      && J(pg.tables.whatsapp_logs.map(x => x.id)) === J(['w-new']) && J(pg.tables.messages.map(x => x.id)) === J([2]), { w: r1.whatsappLogsDeleted, m: r1.messagesDeleted })
    t('…and a WhatsApp row inside 12 months is not touched (byte for byte)', J(pg.tables.whatsapp_logs[0]) === J(world().whatsapp_logs[503]) && J(pg.tables.messages[0]) === J(world().messages[1]))
    const writesBefore = pg.writes.length
    const r2 = await R.runOrderRetention(pg, now)
    t('IDEMPOTENT: a second run clears nothing and writes no order or draft', r2.ordersCleared === 0 && r2.draftsCleared === 0 && pg.writes.slice(writesBefore).every(w => w.table !== 'orders' && w.table !== 'order_drafts'), r2)
    t('IDEMPOTENT: …and deletes no WhatsApp row', r2.whatsappLogsDeleted === 0 && r2.messagesDeleted === 0 && pg.tables.whatsapp_logs.length === 1 && pg.tables.messages.length === 1)
    t('the WhatsApp deletion is bounded like the rest (batches of RETENTION_BATCH, at most RETENTION_MAX_PER_RUN a run) and only by created_at', /\.lt\('created_at', cutoffIso\)\.order\('id', \{ ascending: true \}\)\.limit\(RETENTION_BATCH\)/.test(read('lib/order-retention.ts')) && /while \(deleted < RETENTION_MAX_PER_RUN\)/.test(read('lib/order-retention.ts')))
    {
      const policy = read('content/legal/privacy-policy.md')
      t('privacy section 7 states the WhatsApp period (Dominic\'s words) and the email provider\'s logs', policy.includes('- **WhatsApp messages your customers send a truck, and our automatic replies:** 12 months.')
        && policy.includes('\n\nOur email provider keeps delivery logs for a limited time under its own retention policy.\n\n'))
    }
    const src = read('lib/order-retention.ts'), route = read('app/api/cron/order-retention/route.ts'), vercel = JSON.parse(read('vercel.json'))
    // the route's database client, compared with an existing service-role cron's (the same client-construction block)
    const clientOf = src => (src.match(/const supabase = \w+\([\s\S]*?\n\)/) || [null])[0]
    t('the route is a daily Vercel cron with the CRON_SECRET / admin gate, on the service role', vercel.crons.some(c => c.path === '/api/cron/order-retention' && /^\d+ \d+ \* \* \*$/.test(c.schedule)) && /Bearer \$\{secret\}/.test(route) && clientOf(route) && clientOf(route) === clientOf(read('app/api/cron/cancel-stale-authorizations/route.ts')) && /runOrderRetention\(supabase\)/.test(route))
    t('the live query only reads rows that may still hold details (name, email, phone or note set, or inside the recheck window)', /customer_name\.neq\."",customer_email\.not\.is\.null,customer_phone\.not\.is\.null,notes\.not\.is\.null,created_at\.gte\."/.test(src))
  }

  // ══ 9 · CHECK 9 ════════════════════════════════════════════════════════════════════════════════════
  head('CHECK 9 · the platform-fee base (food_minor) never includes the tip')
  {
    const C = await kit.bundle('lfu-charges', "export { computeOrderCharges } from '@/lib/order-charges'")
    const rules = { taxInclusive: false, taxRateMilli: 6625, taxLabel: 'Sales tax', feesTaxed: false, serviceFee: { recipient: 'truck', bps: 300, fixedMinor: 30 }, surcharge: null, tipping: { presetsBps: [1000, 1500, 2000], customAllowed: true } }
    const r = C.computeOrderCharges({ foodMinor: 2400, rules, channel: 'online_card', tip: { kind: 'percent', bps: 1500 } })
    t('a $24.00 card order with a 15% tip: food_minor stays 2400; the tip (360) is its own field; the total adds it', r.snapshot.food_minor === 2400 && r.tipMinor === 360 && r.snapshot.tip_minor === 360 && r.totalMinor === 2400 + r.taxMinor + 360 + r.serviceFeeMinor, r)
    t('the submit route passes the FOOD after discount as foodMinor (never a total with a tip in it)', /const foodMinor = toMinor\(repriced\.calculation\.total\)/.test(read('app/api/orders/submit/route.ts')))
    t('no platform (application) fee is taken on any payment today', /NO application_fee_amount/.test(read('lib/payments/capture.ts')) && /NO application_fee_amount/.test(read('lib/payments/authorize.ts')))
  }

  // ══ 2 · PostHog ═══════════════════════════════════════════════════════════════════════════════════
  head('2 · PostHog is cookieless')
  {
    const p = read('app/providers.tsx')
    t("posthog.init sets persistence: 'memory' (no cookie, no localStorage)", /posthog\.init\([\s\S]*?persistence: 'memory',[\s\S]*?\}\)/.test(p))
    t('…and still never initialises on /embed, an operator\'s own domain, or the dashboard / manage / KDS', /!IS_EMBED_ENTRY && !IS_CUSTOM_HOST_ENTRY && !IS_CREDENTIAL_ENTRY/.test(p) && /disable_session_recording: true/.test(p))
  }

  // ══ 3 · 4 · the order page and the emails ══════════════════════════════════════════════════════════
  head('3 · 4 · the service-fee notice and the privacy links')
  {
    const op = read('app/trucks/[slug]/order/page.tsx')
    t('the fee notice exists only when the truck\'s online orders carry a fee (checkout?.serviceFee) — never for a UK truck', /const feeNoticeEl = checkout\?\.serviceFee \? \(/.test(op))
    t('…beside the tax notice, in both places it is shown (basket footer and checkout sheet)', (op.match(/\{taxNoticeEl\}\n\s*\{feeNoticeEl\}/g) || []).length === 2)
    const F = await kit.bundle('lfu-fee', "export { feePhrase } from '@/lib/fee-phrase'\nexport { translatorFor } from '@/lib/i18n/translator'\nexport { formatMinor } from '@/lib/money-format'\nimport '@/lib/i18n/catalog/order'")
    const usd = m => F.formatMinor(m, { currency: 'USD', locale: 'en-US' })
    const line = F.translatorFor('en-US', 'order')('serviceFeeNotice', { fee: F.feePhrase(300, 30, 'USD', usd) })
    t('…reading "Online card orders include a service fee of 3% + 30¢." for a 3% + 30¢ fee', line === 'Online card orders include a service fee of 3% + 30¢.', line)
    t('the privacy link sits under every "Place order" button (3) and on the confirmation page, opening /privacy in a new tab', (op.match(/\n\s*\{privacyLinkEl\}\n/g) || []).length === 3 && /<a href=\{PRIVACY_PATH\} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">\{t\('privacyLink'\)\}<\/a>/.test(op))
    const E = await kit.bundle('lfu-email', "export { formatConfirmationEmail } from '@/lib/email'\nexport { PRIVACY_URL } from '@/lib/email-privacy'")
    const MONEY = { currency: 'GBP', locale: 'en-GB' }, TIME = { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
    const em = E.formatConfirmationEmail({ money: MONEY, time: TIME, phoneCountry: 'GB', orderId: '7', orderKey: 'ok-7', truckName: 'Pizza Kitchen', customerName: 'Sam', items: [{ name: 'Margherita', quantity: 1, unit_price: 9.5, modifiers: [] }], deals: [], discountAmt: 0, total: 9.5, notes: null, slot: '12:30', autoAccepted: true, allowCancellation: false, baseUrl: 'https://www.hatchgrab.com', truckSlug: 'test-kitchen', eventDate: '2026-10-25' })
    t('customer confirmation email: "Privacy" links https://www.hatchgrab.com/privacy beside "Powered by HatchGrab" (HTML), and a "Privacy: …" line (text)', E.PRIVACY_URL === 'https://www.hatchgrab.com/privacy' && /Powered by <a href="https:\/\/hatchgrab\.com"[^>]*>HatchGrab<\/a> · <a href="https:\/\/www\.hatchgrab\.com\/privacy"[^>]*>Privacy<\/a>/.test(em.html) && /Powered by HatchGrab — hatchgrab\.com\nPrivacy: https:\/\/www\.hatchgrab\.com\/privacy/.test(em.text), em.text.slice(-200))
    const srcs = [read('lib/email.ts'), read('lib/orders/reject-order.ts'), read('app/api/dashboard/action/route.ts')].join('\n')
    t('every customer footer with "Powered by" carries it: confirmation/ready, refund, cancellation, event cancellation, rejection, operator cancel', (srcs.match(/privacyFooterHtml\(/g) || []).length === 5 && (srcs.match(/privacyFooterText\(/g) || []).length === 6)
  }

  // ══ 6 · small items ═══════════════════════════════════════════════════════════════════════════════
  head('6 · TERMS_VERSION and the legal titles')
  {
    // ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): the Terms of Service were re-dated 20 October 2026 (§4 edited), so
    // TERMS_VERSION is now '2026-10-20' — signup records the terms the operator actually accepted.
    // ⚠️ RE-PINNED (ireland-3, 21 October 2026): '2026-10-21', the Country-specific terms' new date (the latest of the three).
    // ⚠️ RE-PINNED (anz-terms, 22 October 2026): '2026-10-22', the Country-specific terms' new date (Australia and New Zealand).
    t("TERMS_VERSION is the documents' own: '2026-10-22', exported from lib/legal.ts and imported by the signup route", /export const TERMS_VERSION = '2026-10-22'/.test(read('lib/legal.ts')) && /import \{ TERMS_VERSION \} from '@\/lib\/legal'/.test(read('app/api/signup/route.ts')) && !/const TERMS_VERSION =/.test(read('app/api/signup/route.ts')))
    for (const [doc, title] of [['terms', 'Terms of Service — HatchGrab'], ['privacy', 'Privacy Policy — HatchGrab'], ['country-terms', 'Country-specific terms — HatchGrab']]) {
      // ⚠️ RE-PINNED (seo-fixes, 20 October 2026): the legal pages now export an async generateMetadata() (it adds the
      // canonical + og:url via lib/site-metadata.ts, which reads the request host) instead of a static `metadata`
      // object — same absolute title. next/headers is stubbed with an empty request (no host).
      const P = await kit.bundle(`lfu-title-${doc}`, `export { generateMetadata } from '@/app/(legal)/${doc}/page'`,
        { stubs: { 'next/headers': 'export async function headers() { return new Map() }\nexport async function cookies() { return { get() { return undefined }, getAll() { return [] } } }' } })
      const meta = await P.generateMetadata()
      t(`/${doc}'s title is absolute — "${title}", no "| HatchGrab" added`, meta?.title?.absolute === title, meta?.title)
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
