// scripts/whatsapp-approved-only-1.cjs — WhatsApp replies are grounded only on APPROVED events (whatsapp-approved-only-1).
//
// Runs the REAL lib/whatsapp/upcoming-events.ts fetchUpcomingTruckEvents on the in-memory database of scripts/_fake-pg.cjs
// (nothing live, no WhatsApp message, no Gemini call) and the REAL classifier prompt line (lib/whatsapp-classifier.ts
// formatEventForPrompt, exported for the bundle only by a patch). Fixture truck 'test-truck', Europe/London.
//
//   node scripts/whatsapp-approved-only-1.cjs
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✅ ${name}`) } else { fail++; console.log(`  ❌ ${name}${detail ? `\n       ${detail}` : ''}`) } }

;(async () => {
  const kit = require('./_render-kit.cjs')({ cacheTag: 'whatsapp-approved-only-1' })
  const { makeFakePg } = require('./_fake-pg.cjs')
  const WA = await kit.bundle('wa-approved-only',
    "export { fetchUpcomingTruckEvents, UPCOMING_EVENT_STATUSES } from '@/lib/whatsapp/upcoming-events'\nexport { __fmtEventForPrompt } from '@/lib/whatsapp-classifier'",
    { patches: [{ file: 'lib/whatsapp-classifier.ts', append: 'export { formatEventForPrompt as __fmtEventForPrompt }' }] })

  const TZ = 'Europe/London'
  kit.setNow('2026-11-10T12:00:00Z')   // Tuesday 10 November 2026, 12:00 GMT
  const row = (id, event_date, status, venue_name, more = {}) => ({ id, truck_id: 'test-truck', event_date, start_time: '17:00:00', end_time: '21:00:00',
    venue_name, town: 'Springfield', postcode: 'CB1 1AA', status, is_private: false, ...more })
  const world = events => makeFakePg({ truck_events: events })

  console.log('\n── the status list ──')
  t("UPCOMING_EVENT_STATUSES is exactly ['confirmed', 'open'] — the /api/events rule",
    JSON.stringify(WA.UPCOMING_EVENT_STATUSES) === JSON.stringify(['confirmed', 'open']), JSON.stringify(WA.UPCOMING_EVENT_STATUSES))
  const apiEvents = fs.readFileSync(path.join(REPO, 'app/api/events/route.ts'), 'utf8')
  t("/api/events still reads .in('status', ['confirmed', 'open'])", /\.in\('status', \['confirmed', 'open'\]\)/.test(apiEvents))

  console.log('\n── the scraped duplicate (the 13 November case) ──')
  {
    const pg = world([
      row('ev-conf', '2026-11-13', 'confirmed', 'Market Square'),
      row('ev-dup', '2026-11-13', 'unconfirmed', 'Market Sq (scraped)', { source: 'scraper' }),
      row('ev-open', '2026-11-10', 'open', 'Village Green'),
      row('ev-cancel', '2026-11-14', 'cancelled', 'Church Hall'),
      row('ev-other', '2026-11-13', 'confirmed', 'Elsewhere', { truck_id: 'other-truck' }),
    ])
    const rows = await kit.quietAsync(() => WA.fetchUpcomingTruckEvents(pg, 'test-truck', TZ))
    const ids = rows.map(r => r.id)
    t('the unconfirmed duplicate is left out', !ids.includes('ev-dup'), JSON.stringify(ids))
    t('the confirmed event on the same day still appears', ids.includes('ev-conf'), JSON.stringify(ids))
    t('the open (live) event still appears', ids.includes('ev-open'), JSON.stringify(ids))
    t('a cancelled event is still left out (unchanged)', !ids.includes('ev-cancel'))
    t("another truck's event is still left out (unchanged)", !ids.includes('ev-other'))
    t('the order is still by date: open 10 Nov, then confirmed 13 Nov', JSON.stringify(ids) === JSON.stringify(['ev-open', 'ev-conf']), JSON.stringify(ids))
  }

  console.log('\n── the limit: unconfirmed rows never take a place in the ten ──')
  {
    const unconf = Array.from({ length: 10 }, (_, i) => row(`u-${i}`, `2026-11-${String(11 + i).padStart(2, '0')}`, 'unconfirmed', `Scraped ${i}`))
    const conf = Array.from({ length: 3 }, (_, i) => row(`c-${i}`, `2026-11-${String(22 + i).padStart(2, '0')}`, 'confirmed', `Real ${i}`))
    const rows = await kit.quietAsync(() => WA.fetchUpcomingTruckEvents(world([...unconf, ...conf]), 'test-truck', TZ))
    const ids = rows.map(r => r.id)
    t('10 earlier unconfirmed + 3 later confirmed → exactly the 3 confirmed', JSON.stringify(ids) === JSON.stringify(['c-0', 'c-1', 'c-2']), JSON.stringify(ids))
    const many = Array.from({ length: 12 }, (_, i) => row(`m-${i}`, `2026-11-${String(11 + i).padStart(2, '0')}`, i % 2 ? 'open' : 'confirmed', `V${i}`))
    const r2 = await kit.quietAsync(() => WA.fetchUpcomingTruckEvents(world(many), 'test-truck', TZ))
    t('12 approved events → the limit still keeps 10 (unchanged)', r2.length === 10 && r2[0].id === 'm-0' && r2[9].id === 'm-9', JSON.stringify(r2.map(r => r.id)))
  }

  console.log('\n── a private approved event is still redacted, not dropped (unchanged) ──')
  {
    const rows = await kit.quietAsync(() => WA.fetchUpcomingTruckEvents(world([row('p-1', '2026-11-12', 'confirmed', 'Secret Barn', { is_private: true })]), 'test-truck', TZ))
    t('one row, venue "Private event", no town/postcode', rows.length === 1 && rows[0].venue_name !== 'Secret Barn' && rows[0].town === null && rows[0].postcode === null, JSON.stringify(rows))
  }

  console.log('\n── the prompt line (wording unchanged) ──')
  {
    const time = { timeZone: TZ, locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
    const ev = status => ({ event_date: '2026-11-13', start_time: '17:00:00', end_time: '21:00:00', venue_name: 'Market Square', town: 'Springfield', postcode: 'CB1 1AA', status })
    const conf = WA.__fmtEventForPrompt(ev('confirmed'), '2026-11-10', time)
    const open = WA.__fmtEventForPrompt(ev('open'), '2026-11-10', time)
    console.log(`       ${conf}`)
    t('a confirmed line ends [CONFIRMED], as before', /\[CONFIRMED\]$/.test(conf), conf)
    t('an open line is identical to a confirmed one, as before', open === conf, open)
    t('no [UNCONFIRMED] branch is left in the classifier', !/'UNCONFIRMED'/.test(fs.readFileSync(path.join(REPO, 'lib/whatsapp-classifier.ts'), 'utf8')))
  }

  console.log('\n── every caller reads through the one function ──')
  for (const f of ['app/api/webhooks/meta/whatsapp/route.ts', 'app/api/webhooks/whatsapp/route.ts', 'app/api/manage/whatsapp-preview/route.ts']) {
    const src = fs.readFileSync(path.join(REPO, f), 'utf8')
    t(`${f}: fetchUpcomingTruckEvents(supabase, truck.id, truckTime.timeZone), no truck_events query of its own`,
      /fetchUpcomingTruckEvents\(supabase, truck\.id, truckTime\.timeZone\)/.test(src) && !/from\('truck_events'\)/.test(src))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
