// scripts/_lp2-extra.cjs — Language Phase 2's OWN views (docs/language-phase-2-report.md), the ones Phase 1a/1b/1c's
// harnesses do not render. A MODULE, run by scripts/language-phase-2.cjs exactly as a 1b/1c area is: `views(ctx)` →
// { key: value }, captured in BEFORE (a clean worktree of 460ba55) and AFTER, for a GB and a US fixture.
//
//   GB|preorder|… / US|preorder|…   lib/preorder.ts formatPreorderLabel at nine clock times, the same day and an earlier
//                                    day, both states; formatPreorderOpenLabel for every open rule — with the truck's
//                                    settings (the 5th argument: its locale on 460ba55, its TimeSettings after Phase 2).
//   …|card|…                        components/TruckListCard.tsx (full HTML) on a September and an October date.
//   …|inbound|…                     app/api/inbound-schedule/route.ts — the review email's date (`fmtDate`), see below.
//   …|manage|reports|…              app/manage/[token]/page.tsx ReportsTab — the event picker's labels (full HTML).
//   …|manage|schedule|…             app/manage/[token]/page.tsx ScheduleTab — the event cards' date blocks (full HTML).
//   …|rows|demo|…                   lib/provision-demo.ts — the rows a demo is provisioned with (scripts/_fake-pg.cjs),
//                                    asked for in the country (`country`, Phase 2; 460ba55 ignores it → the GB demo).
//   …|rows|truck|…                  lib/provision-truck.ts — the rows a new truck is provisioned with.
//
// 🔴 EVERY VIEW RUNS ON BOTH CODES. An argument the old code does not take is ignored by it; a signature that changed
// meaning (formatPreorderLabel's 5th argument) is read from the source, never guessed.
// ⚠️ THE INBOUND EMAIL is built inside the route's POST, after a discovery-gate write, in a closure. The smallest
// piece that carries the label is its `fmtDate`: the expression is read from the route's source as it stands and
// evaluated with the same imports, so a change to it (formatYmd → formatYmdShortMonth) is what this renders.
// (The demo save-email and account-deletion emails are rendered whole by scripts/_lp1c-api.cjs — `…|save-email|ok*`,
// `…|deletion|post|ok*` — and language-phase-2 compares those views too.)
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')

const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const GB_ROW = () => SEEDS.gbFromSeed()
const US_ON = () => ({ ...SEEDS.usFromSeed(), enabled: true, starterMonthlyMinor: 3900, proMonthlyMinor: 5900, maxMonthlyMinor: 9900, proAllowanceMinor: 30000, maxAllowanceMinor: 100000, platformFeePct: 1.5 })
const MANAGE = 'app/manage/[token]/page.tsx'
const DATES = { sep: '2026-09-05', oct: '2026-10-10' }

const CRYPTO_STUB = [
  "import * as real from 'node:crypto'",
  "export * from 'node:crypto'",
  "export function randomBytes(n) { const g = globalThis; const s = (g.__lpRandN = (g.__lpRandN || 0) + 1); const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (i * 37 + 11 + s * 13) & 255; return b }",
  "export function randomUUID() { const g = globalThis; const s = (g.__lpUuidN = (g.__lpUuidN || 0) + 1); return '00000000-0000-4000-8000-' + String(s).padStart(12, '0') }",
  'export default { ...real, randomBytes, randomUUID }',
].join('\n')

async function views(ctx) {
  const { kit, h, html, GB, US, read } = ctx
  const out = {}
  const safe = (k, fn) => { try { out[k] = fn() } catch (e) { out[k] = 'ERROR ' + String(e && e.message || e).slice(0, 300) } }

  // ══ 1 · PRE-ORDER LABELS ═════════════════════════════════════════════════════════════════════════════════
  const P = await kit.bundle('lp2-preorder', "export * as P from '@/lib/preorder'")
  const preSrc = read('lib/preorder.ts')
  // 460ba55: (…, locale = 'en-GB'). Phase 2: (…, ts?: TimeSettings | null). Read from the source.
  const takesSettings = /export function formatPreorderLabel\([^)]*\bts\??\s*:\s*TimeSettings/.test(preSrc)
  const openTakesSettings = /export function formatPreorderOpenLabel\([^)]*\bts\??\s*:\s*TimeSettings/.test(preSrc)
  for (const C of [GB, US]) {
    const cc = C.cc
    const arg = takesSettings ? C.time : C.time.locale
    const openArg = openTakesSettings ? C.time : C.time.locale
    for (const mins of [0, 1, 75, 599, 720, 765, 990, 1050, 1439]) for (const st of ['before', 'closed_pending']) {
      safe(`${cc}|preorder|${mins}|${st}|same`, () => P.P.formatPreorderLabel(st, mins, DATES.oct, DATES.oct, arg))
      safe(`${cc}|preorder|${mins}|${st}|dayBefore`, () => P.P.formatPreorderLabel(st, mins, '2026-10-09', DATES.oct, arg))
      safe(`${cc}|preorder|${mins}|${st}|september`, () => P.P.formatPreorderLabel(st, mins, '2026-09-04', DATES.sep, arg))
    }
    for (const r of ['on_confirm', 'day_of', '1d', '2d', '3d', '4d', '5d', '6d', '7d', 'bogus', null]) {
      safe(`${cc}|preorderOpen|${r}|oct`, () => P.P.formatPreorderOpenLabel(r, DATES.oct, openArg))
      safe(`${cc}|preorderOpen|${r}|sep`, () => P.P.formatPreorderOpenLabel(r, '2026-09-09', openArg))
    }
  }

  // ══ 2 · THE "Sept" SURFACES ══════════════════════════════════════════════════════════════════════════════
  // TruckListCard — the order page's and the profile's event card, on the truck's clock.
  const UI = await kit.bundle('lp2-card', "export { default as TruckListCard } from '@/components/TruckListCard'\nexport { I18nContext } from '@/lib/i18n/use-t'")
  const wrap = (cc, el) => (UI.I18nContext ? h(UI.I18nContext.Provider, { value: { locale: cc === 'US' ? 'en-US' : 'en-GB', setLocale() {} } }, el) : el)
  for (const C of [GB, US]) {
    const cc = C.cc
    for (const [mon, ymd] of Object.entries(DATES)) {
      const [y, m, d] = ymd.split('-')
      const ev = { id: `ev-${mon}`, date: `${d}/${m}/${y}`, startTime: '17:00', endTime: '21:00', truckName: 'Pizza Kitchen', venueName: 'The Green',
        village: 'Harnessville', status: 'confirmed', notes: 'By the pond', source: 'operator' }
      out[`${cc}|card|${mon}|full`] = html(null, wrap(cc, h(UI.TruckListCard, { event: ev, slug: 'test-kitchen', time: C.time, forceOrderButton: true })))
      out[`${cc}|card|${mon}|compact`] = html(null, wrap(cc, h(UI.TruckListCard, { event: ev, slug: 'test-kitchen', time: C.time, hideOrderButton: true, compact: true })))
    }
  }

  // The inbound-schedule review email's date: the route's own `fmtDate` expression, evaluated as written.
  {
    const src = read('app/api/inbound-schedule/route.ts')
    const m = /const fmtDate = \((\w+)(?::\s*string)?\)\s*=>\s*([^\n]+)/.exec(src)
    if (!m) { for (const cc of ['GB', 'US']) out[`${cc}|inbound|fmtDate`] = 'ERROR the route has no `const fmtDate = (iso) => …` line' }
    else {
      const tu = read('lib/time-utils.ts')
      const exported = new Set([...tu.matchAll(/export (?:function|const) (\w+)/g)].map(x => x[1]))
      const used = [...new Set([...m[2].matchAll(/\b([A-Za-z_]\w*)\s*\(/g)].map(x => x[1]))].filter(n => exported.has(n))
      const F = await kit.bundle('lp2-inbound', `import { ${used.join(', ')} } from '@/lib/time-utils'\nexport const fmtDate = (${m[1]}: string, ts: any) => ${m[2]}`)
      for (const C of [GB, US]) for (const [mon, ymd] of Object.entries({ ...DATES, sepWed: '2026-09-30' })) safe(`${C.cc}|inbound|fmtDate|${mon}`, () => F.fmtDate(ymd, C.time))
    }
  }

  // Manage: Reports' event picker and the Schedule tab's event cards — the page's own components, full HTML.
  {
    let M = null
    try {
      M = await kit.bundle('lp2-manage', [
        `export { ReportsTab, ScheduleTab } from '@/${MANAGE}'`, "export { I18nContext } from '@/lib/i18n/use-t'",
        "export { CountrySettingsProvider } from '@/components/CountrySettingsProvider'", "export { MoneyProvider } from '@/components/MoneyContext'",
        "export { TruckTimeContext } from '@/components/TruckTimeContext'",
      ].join('\n'), {
        patches: [
          { file: MANAGE, append: 'export { ReportsTab, ScheduleTab }' },
          { file: MANAGE, states: ['filterMode', 'recentEvents', 'reportEventId', 'events', 'loadingEvents', 'showPast'] },
        ],
      })
    } catch (e) { for (const cc of ['GB', 'US']) out[`${cc}|manage|bundle`] = 'ERROR ' + String(e.message).slice(0, 300) }
    if (M) for (const C of [GB, US]) {
      const cc = C.cc
      const truck = { ...C.TRUCK, timezone: C.time.timeZone, country: cc, plan: 'max', features: {}, feature_overrides: {} }
      const api = async () => ({})
      const recent = [{ id: 'e-sep', event_date: DATES.sep, venue_name: 'The Green' }, { id: 'e-oct', event_date: DATES.oct, venue_name: 'The Market' }]
      const settings = cc === 'US' ? { ...US_ON() } : GB_ROW()
      const W = el => h(M.CountrySettingsProvider, { settings }, h(M.MoneyProvider, { fmt: C.fmt }, h(M.TruckTimeContext.Provider, { value: C.time },
        M.I18nContext ? h(M.I18nContext.Provider, { value: { locale: cc === 'US' ? 'en-US' : 'en-GB', setLocale() {} } }, el) : el)))
      out[`${cc}|manage|reports|picker`] = html({ filterMode: 'event', recentEvents: recent, reportEventId: '' }, W(h(M.ReportsTab, { truck, api })))
      const events = [
        { id: 'e-sep', truck_id: 'test-truck', event_date: DATES.sep, start_time: '17:00', end_time: '21:00', venue_name: 'The Green', town: 'Harnessville', status: 'confirmed', source: 'operator' },
        { id: 'e-oct', truck_id: 'test-truck', event_date: DATES.oct, start_time: '17:00', end_time: '21:00', venue_name: 'The Market', town: 'Harnessville', status: 'unconfirmed', source: 'scraper' },
      ]
      out[`${cc}|manage|schedule|cards`] = html({ events, loadingEvents: false, showPast: true }, W(h(M.ScheduleTab, {
        isActive: true, section: 'events', onSectionChange() {}, onOpenSocial() {}, truck, token: 'harness', bundles: [], categories: [], notices: null,
        api, showToast() {}, onTruckUpdate() {}, onVerifySuccess() {}, onSwitchTab() {}, pendingVerifyEvents: [], onClearPendingVerify() {},
        onPendingCount() {}, onEventsSaved() {},
      })))
    }
  }

  // ══ 3 · THE ROWS A DEMO AND A NEW TRUCK ARE PROVISIONED WITH ═════════════════════════════════════════════
  const lib = await kit.bundle('lp2-provision', [
    "export { provisionDemo } from '@/lib/provision-demo'",
    "export { provisionTruck } from '@/lib/provision-truck'",
    "export { DEMO_TEMPLATES, getDemoTemplate } from '@/lib/demo-templates'",
    "export { clearCountrySettingsCache } from '@/lib/country-settings'",
  ].join('\n'), {
    stubs: {
      crypto: CRYPTO_STUB,
      '@/lib/demo-logo': `export async function copyDemoLogo() { return { logoStoragePath: null, source: { kind: 'none' }, error: null, cleared: false } }
        export function demoLogoUpToDate() { return true }`,
    },
    patches: [{ file: 'lib/menu-extract.ts', from: 'export async function extractMenu(', to: 'export async function extractMenu(...__a: any[]): Promise<any> { const f = (globalThis as any).__extract; if (f) return f(...__a); return (__realExtractMenu as any)(...__a) }\nasync function __realExtractMenu(' }],
  })
  const KEYS = { demo_sessions: [['truck_id']], slot_capacity: [['truck_id', 'event_date', 'slot']], production_slot_usage: [['truck_id', 'event_id', 'production_slot']] }
  const runRows = async (key, fn) => {
    const pg = makeFakePg({ country_settings: [GB_ROW(), US_ON()].map(snake), trucks: [], truck_vans: [] }, { keys: KEYS, defaults: { menu_items_db: { is_active: true } } })
    const from = pg.from.bind(pg)
    pg.from = t => {   // the seeder's `menu_categories!category_id(…)` embed, resolved from the stored categories (as _lp1c-demo does)
      const c = from(t)
      if (t !== 'menu_items_db') return c
      let embed = false
      const select = c.select.bind(c), then = c.then.bind(c)
      c.select = (cols, ...rest) => { embed = /menu_categories/.test(String(cols || '')); return select(cols, ...rest) }
      c.then = (res, rej) => then(r => (embed && r && Array.isArray(r.data)
        ? { ...r, data: r.data.map(row => ({ ...row, menu_categories: (pg.tables.menu_categories || []).find(x => x.id === row.category_id) ?? null })) }
        : r)).then(res, rej)
      return c
    }
    globalThis.__harnessDb = pg
    globalThis.__lpRandN = 0; globalThis.__lpUuidN = 0
    lib.clearCountrySettingsCache()
    let result = null, error = null
    try { result = await kit.quietAsync(() => fn(pg)) } catch (e) { error = { name: e && e.name, message: e && e.message } } finally { delete globalThis.__harnessDb; delete globalThis.__extract }
    const tables = Object.fromEntries(Object.keys(pg.tables).sort().filter(t => t !== 'country_settings').map(t => [t, pg.tables[t]]))
    out[key] = JSON.stringify({ result, error, writes: pg.writes, tables })
  }
  const NOW = new Date(ctx.FIX.NOW)
  for (const C of [GB, US]) {
    const cc = C.cc
    // A demo asked for in the country (Phase 2's `country`; 460ba55 builds every demo in GB and ignores it).
    for (const id of ['pizza', 'burgers', 'curries']) await runRows(`${cc}|rows|demo|${id}`, pg => lib.provisionDemo(pg, { template: lib.getDemoTemplate(id), now: NOW, country: cc }))
    await runRows(`${cc}|rows|demo|outreach`, pg => lib.provisionDemo(pg, { template: lib.getDemoTemplate('pizza'), now: NOW, name: 'Harness Pizza Co', discoveryTruckId: 'dt-harness', country: cc, kitchen: { intervalMins: 10, prepSecs: 360, batchSize: 3 } }))
    // A new truck in the country: the first van's default name, a named van, a demo profile.
    await runRows(`${cc}|rows|truck|operator`, pg => lib.provisionTruck(pg, { kind: 'operator', name: 'Harness Kitchen', country: cc }))
    await runRows(`${cc}|rows|truck|namedVan`, pg => lib.provisionTruck(pg, { kind: 'operator', name: 'Harness Kitchen', country: cc, van: { name: 'Big Van' } }))
    await runRows(`${cc}|rows|truck|demo`, pg => lib.provisionTruck(pg, { kind: 'demo', country: cc, van: { kitchen_capacity: null } }))
  }
  return out
}

module.exports = { views }
