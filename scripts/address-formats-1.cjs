// scripts/address-formats-1.cjs — ADDRESS FORMATS, STAGE 1 (docs/address-formats-1-report.md).
//
// LOCALHOST ONLY. Nothing reaches a database or the network: the feeds read the in-memory database of
// scripts/_fake-pg.cjs, Brevo is a recorder in this process, and the render kit stubs everything else. Checks:
//   1  THE CONFIG — lib/address-formats.ts: six formats, every pattern compiles, every template token exists, every
//      region list well formed; the validator agrees; GB's AI lines are today's prompt lines verbatim.
//   2  THE CHECK = THE KEYS — the migration's CHECK lists exactly the config's keys; the loader accepts the keys AND the
//      legacy values ('postcode' → gb, 'zip_state' → us); an unknown value is refused (a list skips the row).
//   3  GB AND US BYTE-IDENTICAL — every formatter output, event card, email, calendar line, WhatsApp prompt line and
//      Add-event preview card for GB and US fixtures equals the snapshot taken from the code BEFORE this stage
//      (scripts/fixtures/address-formats-1-before.json, written by `--capture` on 21 October 2026, before any edit).
//   4  IE, AU, NZ, CA — the brief's fixture lines, in emails and on cards; regions from each format's own list.
//   5  THE FEEDS — /api/events, /api/embed/events and /api/discovery/events carry each event's `addressFormat`.
//
// `node scripts/address-formats-1.cjs --capture` rewrites the BEFORE snapshot from the CURRENT code. Run it only on the
// code before this stage; it exists so the snapshot's origin is reproducible from git.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'address-formats-1' })
const CAPTURE = process.argv.includes('--capture')
const SNAP_FILE = path.join(REPO, 'scripts/fixtures/address-formats-1-before.json')

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : ''}`) } }
const head = s => console.log(`\n${s}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

// ── the GB / US snapshot: the same calls before and after (old code ignores the new format arguments) ────────────
const GB_TIME = { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
const US_TIME = { timeZone: 'America/New_York', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' }
const GBP = { currency: 'GBP', locale: 'en-GB' }, USD = { currency: 'USD', locale: 'en-US' }
const PARTS = {
  gb: [
    { venueName: 'The Bell', town: 'Castle Hedingham', postcode: 'CO9 3EJ' },
    { venueName: 'The Bell', town: 'Castle Hedingham', postcode: null },
    { venueName: 'The Bell', town: null, postcode: 'CO9 3EJ' },
    { venueName: null, town: 'Lavenham', postcode: 'CO10 9QA' },
    { venueName: 'Lavenham Green', town: 'Lavenham', postcode: '' },
    { venueName: null, town: null, postcode: null },
  ],
  us: [
    { venueName: 'Pier A Park', town: 'Hoboken', region: 'NJ', postcode: '07030' },
    { venueName: 'Pier A Park', town: 'Hoboken', region: 'nj', postcode: '07030' },
    { venueName: 'Pier A Park', town: 'Hoboken', region: ' NJ ', postcode: null },
    { venueName: 'Pier A Park', town: 'Hoboken', region: null, postcode: '07030' },
    { venueName: 'Pier A Park', town: null, region: 'TX', postcode: '78701' },
    { venueName: null, town: 'Austin', region: 'TX', postcode: null },
    { venueName: 'Zilker Park', town: 'Austin', region: '', postcode: '78746' },
  ],
}
const items = [{ name: 'Margherita', quantity: 1, unit_price: 12, modifiers: [] }]
const mailBase = (cc) => ({
  orderId: '7', orderKey: 'ok-7', truckName: cc === 'us' ? 'Hoboken Slice' : 'Pizza Kitchen', customerName: 'Ann', slot: '12:30', items, deals: [], discountAmt: 0,
  total: 12, notes: null, autoAccepted: true, phoneCountry: cc === 'us' ? 'US' : 'GB', money: cc === 'us' ? USD : GBP, time: cc === 'us' ? US_TIME : GB_TIME,
  paymentState: 'hatch', addressFormat: cc,
})
const card = (cc, over = {}) => ({ id: `e-${cc}`, date: '25/10/2026', startTime: '11:30', endTime: '20:00', truckName: 'Pizza Kitchen', venueName: 'The Bell', village: 'Castle Hedingham',
  postcode: 'CO9 3EJ', status: 'confirmed', source: 'operator', addressFormat: cc, ...over })
const CARDS = {
  gb: [card('gb'), card('gb', { postcode: undefined }), card('gb', { venueName: 'Castle Hedingham Green' }), card('gb', { village: undefined })],
  us: [card('us', { venueName: 'Pier A Park', village: 'Hoboken', postcode: '07030', region: 'NJ' }), card('us', { venueName: 'Pier A Park', village: 'Hoboken', postcode: '07030' }),
    card('us', { venueName: 'Pier A Park', village: 'Hoboken', postcode: undefined, region: 'NJ' })],
}

async function snapshot() {
  const out = {}
  const A = await kit.bundle('af1-addr', "export * from '@/lib/event-address'\nexport { getFullLocation } from '@/lib/utils'")
  for (const cc of ['gb', 'us']) for (const [i, p] of PARTS[cc].entries()) {
    out[`line.${cc}.${i}`] = A.eventAddressLine(p, cc)
    out[`area.${cc}.${i}`] = A.eventAreaLineWithRegion({ town: p.town, region: p.region, postcode: p.postcode }, cc)
    out[`calendar.${cc}.${i}`] = A.getFullLocation({ venueName: p.venueName ?? '', village: p.town ?? undefined, postcode: p.postcode ?? undefined, region: p.region ?? undefined, addressFormat: cc })
  }
  const M = await kit.bundle('af1-mail', "export * as Mail from '@/lib/email'")
  const sent = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{"messageId":"h"}', { status: 201 }) }
  process.env.BREVO_API_KEY = 'address-formats-1-recorder'
  try {
    for (const cc of ['gb', 'us']) for (const [i, p] of PARTS[cc].entries()) {
      const v = { venueName: p.venueName, venueTown: p.town, venuePostcode: p.postcode, venueRegion: p.region }
      const conf = M.Mail.formatConfirmationEmail({ ...mailBase(cc), ...v })
      const ready = M.Mail.formatConfirmationEmail({ ...mailBase(cc), ...v, variant: 'ready' })
      const op = M.Mail.formatNewOrderEmail({ orderId: '7', customerName: 'Ann', slot: '12:30', items, deals: [], total: 12, notes: null, money: mailBase(cc).money, time: mailBase(cc).time, ...v, addressFormat: cc })
      out[`mail.confirmation.${cc}.${i}`] = conf.subject + '\n' + conf.html + '\n' + conf.text
      out[`mail.ready.${cc}.${i}`] = ready.subject + '\n' + ready.html + '\n' + ready.text
      out[`mail.operator.${cc}.${i}`] = op.subject + '\n' + op.html + '\n' + op.text
      sent.length = 0
      await M.Mail.sendEventCancellationEmail({ to: 'ann@example.test', customerName: 'Ann', orderId: '7', truckName: 'Pizza Kitchen', venueName: p.venueName, village: p.town, region: p.region,
        eventDate: '2026-10-25', note: null, paymentStatus: 'unpaid', time: mailBase(cc).time, addressFormat: cc })
      out[`mail.cancelled.${cc}.${i}`] = sent.map(s => s.subject + '\n' + s.htmlContent + '\n' + s.textContent).join('\n---\n')
    }
  } finally { globalThis.fetch = realFetch; delete process.env.BREVO_API_KEY }
  const C = await kit.bundle('af1-card', "export { default } from '@/components/TruckListCard'", { stubs: { 'posthog-js/react': 'export const usePostHog = () => null' } })
  for (const cc of ['gb', 'us']) for (const [i, ev] of CARDS[cc].entries()) {
    out[`card.${cc}.${i}`] = kit.renderStatic(kit.h(C.default, { event: ev, slug: 'pizza-kitchen', time: cc === 'us' ? US_TIME : GB_TIME }))
  }
  const W = await kit.bundle('af1-wa', "export * from '@/lib/whatsapp-classifier'", { patches: [{ file: 'lib/whatsapp-classifier.ts', append: 'export { formatEventForPrompt as __formatEventForPrompt }' }] })
  for (const cc of ['gb', 'us']) for (const [i, p] of PARTS[cc].entries()) {
    out[`whatsapp.${cc}.${i}`] = W.__formatEventForPrompt({ event_date: '2026-10-25', start_time: '11:30', end_time: '20:00', venue_name: p.venueName, town: p.town, postcode: p.postcode, status: 'confirmed' },
      '2026-10-24', cc === 'us' ? US_TIME : GB_TIME, cc)
  }
  const P = await kit.bundle('af1-preview', "export * from '@/lib/schedule-graphics/event-preview'")
  for (const cc of ['gb', 'us']) {
    const form = cc === 'us' ? { venue_name: 'Pier A Park', town: 'Hoboken', postcode: '07030', region: 'NJ', event_date: '2026-10-25', start_time: '11:30', end_time: '20:00' }
      : { venue_name: 'The Bell', town: 'Castle Hedingham', postcode: 'CO9 3EJ', event_date: '2026-10-25', start_time: '11:30', end_time: '20:00' }
    const ev = P.previewEventFromForm({ form, truckName: 'Pizza Kitchen', addressFormat: cc })
    out[`preview.${cc}`] = JSON.stringify(ev) + '\n' + kit.renderStatic(kit.h(C.default, { event: ev, slug: 'pizza-kitchen', time: cc === 'us' ? US_TIME : GB_TIME }))
  }
  return out
}

;(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.NEXT_PUBLIC_HATCHGRAB_URL = 'https://www.hatchgrab.com'
  kit.setNow('2026-10-21T10:00:00Z'); kit.setDeviceTz('Europe/London')

  if (CAPTURE) {
    const snap = await snapshot()
    fs.mkdirSync(path.dirname(SNAP_FILE), { recursive: true })
    fs.writeFileSync(SNAP_FILE, JSON.stringify({ captured: new Date().toISOString(), from: 'the code before address-formats-1 (21 October 2026)', outputs: snap }, null, 1) + '\n')
    console.log(`captured ${Object.keys(snap).length} outputs → ${path.relative(REPO, SNAP_FILE)}`)
    process.exit(0)
  }

  require('./_address-formats-1-after.cjs')({ kit, t, head, read, REPO, snapshot, SNAP_FILE, PARTS, mailBase, card })
    .then(() => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0) })
    .catch(e => { console.error(e); process.exit(1) })
})().catch(e => { console.error(e); process.exit(1) })
