// scripts/us-polish-batch.cjs — the US polish batch (docs/us-polish-batch-report.md), proved on FIXTURES (the in-memory
// database of scripts/_fake-pg.cjs; nothing live, nothing sent). BEFORE is the same module with the changed files
// swapped for their source at 8a5c4b5a (the commit this batch started from), bundled side by side, so "byte-identical"
// compares real outputs of both codes.
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'us-polish-batch' })
const { makeFakePg, KEYS_AFTER, COUNTRY_DEFAULTS } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 900)}` : ''}`) } }
const head = s => console.log(`\n${s}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
// BEFORE is pinned to the commit this batch started from (not "HEAD", which moves when the batch is committed).
const BEFORE_REF = '8a5c4b5a'
const atHead = f => execFileSync('git', ['show', `${BEFORE_REF}:${f}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 })
const whole = (file, src) => ({ file, from: /^[\s\S]*$/, to: () => src })
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const J = x => JSON.stringify(x)

;(async () => {
  process.env.INBOUND_SCHEDULE_SECRET = 'harness-secret'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.NEXT_PUBLIC_HATCHGRAB_URL = 'https://www.hatchgrab.com'
  kit.setNow('2026-10-19T14:00:00Z'); kit.setDeviceTz('Europe/London')
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const GB_SETTINGS = snake(SEEDS.gbFromSeed()), US_SETTINGS = snake(SEEDS.usFromSeed())
  const clear = "\nexport { clearCountrySettingsCache } from '@/lib/country-settings'"

  // ════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · truck-page link previews (HatchGrab from the truck itself; Village Foodie byte for byte)')
  {
    const OUT = path.join(REPO, 'docs/us-polish'); fs.mkdirSync(OUT, { recursive: true })
    const HOSTS = { hg: 'www.hatchgrab.com', vf: 'www.villagefoodie.co.uk' }
    const HDR = "export async function headers() { if (globalThis.__host === undefined) throw new Error('no request'); return new Map([['host', globalThis.__host]]) }"
    const PAGE_STUBS = {
      'next/script': "export default function Script() { return null }",
      'next/dynamic': 'export default function dynamic() { return function Dynamic() { return null } }',
      'posthog-js/react': 'export const usePostHog = () => null',
      '@/hooks/useVillageData': 'export function useVillageData() { return globalThis.__tcData }',
      'next/headers': HDR,
    }
    const PG = 'app/trucks/[slug]/page.tsx', OL = 'app/trucks/[slug]/order/layout.tsx'
    const M = {
      A: await kit.bundle('usp-meta-a', `export { generateMetadata as page } from '@/${PG}'\nexport { generateMetadata as order } from '@/${OL}'` + clear, { stubs: PAGE_STUBS }),
      B: await kit.bundle('usp-meta-b', `export { generateMetadata as page } from '@/${PG}'\nexport { generateMetadata as order } from '@/${OL}'` + clear, { stubs: PAGE_STUBS, patches: [whole(PG, atHead(PG)), whole(OL, atHead(OL))] }),
    }
    let ROOT = null
    try {
      ROOT = await kit.bundle('usp-root-meta', "export { generateMetadata } from '@/app/layout'", { stubs: { 'next/font/google': 'export const Geist = () => ({ variable: "" }); export const Geist_Mono = () => ({ variable: "" })', './globals.css': '', './providers': 'export const CSPostHogProvider = p => p.children', 'next/headers': HDR } })
    } catch (e) { ROOT = { __err: String(e.message).slice(0, 300) } }
    t('the root layout\'s own generateMetadata is bundled for the merge (not a copy of it)', !ROOT.__err, ROOT.__err)
    const CSV = ['Name,a,b,c,d,e,f,g,h,Logo', 'Pizzeria Gusto,,,,,,,,,/logos/pizzeriagusto.jpg', 'Pizza Kitchen,,,,,,,,,/logos/bbpizza.jpg'].join('\n')
    globalThis.fetch = async url => { if (String(url).includes('docs.google.com')) return new Response(CSV, { status: 200 }); throw new Error('unexpected fetch ' + url) }
    const tr = (id, name, slug, cc, more = {}) => ({ id, name, slug, country: cc, timezone: null, active: true, excluded: false, show_on_vf: true, show_on_hg: true, logo_storage_path: null, cover_image_path: null, ...more })
    const world = () => ({
      trucks: [
        tr('t-gusto', 'Pizzeria Gusto', 'pizzeria-gusto', 'GB', { logo_storage_path: 't-gusto/logo.jpg' }),
        tr('t-new', 'Fenland Fryer', 'fenland-fryer', 'GB'),
        tr('test-truck-us', 'Pizza Kitchen US', 'test-kitchen-us', 'US', { logo_storage_path: 'test-truck-us/logo.jpg', cover_image_path: 'test-truck-us/cover.jpg' }),
        tr('t-hidden', 'Hidden Bites', 'hidden-bites', 'GB', { show_on_hg: false }),
        tr('test-truck', 'Pizza Kitchen', 'test-kitchen', 'GB', { show_on_hg: false, show_on_vf: false }),
      ],
      discovery_trucks: [
        { id: 'dt-gusto', name: 'Pizzeria Gusto', country: 'GB', show_on_hg: true, show_on_vf: true, excluded: false, logo_url: 'pizzeriagusto.jpg', photo_url: null, hatchgrab_truck_id: 't-gusto' },
        { id: 'dt-pk', name: 'Pizza Kitchen', country: 'GB', show_on_hg: true, show_on_vf: true, excluded: false, logo_url: 'bbpizza.jpg', photo_url: null, hatchgrab_truck_id: 'test-truck' },
      ],
      country_settings: [GB_SETTINGS, US_SETTINGS],
    })
    const meta = async (code, kind, host, slug) => {
      globalThis.__harnessDb = makeFakePg(world()); M[code].clearCountrySettingsCache?.()
      globalThis.__host = host
      // BEFORE's order layout exported no metadata at all: the page inherited the root's alone, i.e. {}.
      try { return typeof M[code][kind] === 'function' ? await kit.quietAsync(() => M[code][kind]({ params: Promise.resolve({ slug }) })) : {} } finally { delete globalThis.__host }
    }
    const root = async host => { globalThis.__host = host; try { return await ROOT.generateMetadata() } finally { delete globalThis.__host } }
    // Next's merge, for the fields a preview reads: a child title string goes through the root's template; a child's
    // openGraph / twitter REPLACE the root's whole object; metadataBase resolves a relative image.
    const resolve = (r, ...kids) => {
      let title = r.title.default, description = r.description, og = r.openGraph, tw = r.twitter
      for (const k of kids) {
        if (k.title !== undefined) title = typeof k.title === 'string' ? r.title.template.replace('%s', k.title) : (k.title.absolute ?? k.title.default)
        if (k.description !== undefined) description = k.description
        if (k.openGraph) og = k.openGraph
        if (k.twitter) tw = k.twitter
      }
      const abs = u => (u ? new URL(u, r.metadataBase).href : null)
      return { title, description, 'og:title': og.title ?? null, 'og:description': og.description ?? null, 'og:site_name': og.siteName ?? null, 'og:url': og.url ? abs(og.url) : null,
        'og:image': og.images?.[0] ? abs(og.images[0].url) : null, 'og:image:size': og.images?.[0]?.width ? `${og.images[0].width}x${og.images[0].height}` : null, 'og:locale': og.locale ?? null,
        'twitter:card': tw.card, 'twitter:title': tw.title ?? null, 'twitter:image': tw.images?.[0] ? abs(typeof tw.images[0] === 'string' ? tw.images[0] : tw.images[0].url) : null }
    }
    const FIX = [['Gusto-shaped (truck + discovery row + sheet row)', 'pizzeria-gusto'], ['signed-up GB truck, no discovery row', 'fenland-fryer'], ['US truck (hidden twin-shaped, made public in the fixture)', 'test-kitchen-us'],
      ['hidden GB truck', 'hidden-bites'], ['Pizza Kitchen-shaped by its discovery name', 'pizza-kitchen']]
    const table = []
    for (const [host, h] of Object.entries(HOSTS)) {
      const r = await root(h)
      for (const [label, slug] of FIX) for (const kind of ['page', 'order']) {
        const a = await meta('A', kind, h, slug), b = await meta('B', kind, h, slug)
        const A = resolve(r, a), B = resolve(r, b)
        table.push({ host, label, slug, kind, before: B, after: A, rawA: a, rawB: b })
        if (host === 'vf') t(`Village Foodie, ${label}, ${kind}: the page's metadata is BEFORE's byte for byte`, J(a) === J(b), { a, b })
      }
    }
    fs.writeFileSync(path.join(OUT, 'previews.json'), J(table.map(({ rawA, rawB, ...x }) => x)))
    const row = (slug, kind, host = 'hg') => table.find(x => x.slug === slug && x.kind === kind && x.host === host)
    const g = row('pizzeria-gusto', 'page'), n = row('fenland-fryer', 'page'), u = row('test-kitchen-us', 'page'), hid = row('hidden-bites', 'page')
    t('HatchGrab, Gusto-shaped: BEFORE was the Village Foodie brand — "Pizzeria Gusto | Village Foodie | HatchGrab", og:site_name "Village Foodie", og:url on villagefoodie.co.uk, the SHEET\'s logo',
      g.before.title === 'Pizzeria Gusto | Village Foodie | HatchGrab' && g.before['og:site_name'] === 'Village Foodie' && g.before['og:url'] === 'https://villagefoodie.co.uk/trucks/pizzeria-gusto' && g.before['og:image'] === 'https://villagefoodie.co.uk/logos/pizzeriagusto.jpg', g.before)
    t('…AFTER: "Pizzeria Gusto | HatchGrab", og:site_name HatchGrab, og:url www.hatchgrab.com/trucks/pizzeria-gusto, its OWN logo from truck-media, en_GB, the small card (a square logo)',
      g.after.title === 'Pizzeria Gusto | HatchGrab' && g.after['og:site_name'] === 'HatchGrab' && g.after['og:url'] === 'https://www.hatchgrab.com/trucks/pizzeria-gusto'
      && g.after['og:image'] === 'http://127.0.0.1:9/storage/v1/object/public/truck-media/t-gusto/logo.jpg' && g.after['og:locale'] === 'en_GB' && g.after['twitter:card'] === 'summary'
      && g.after['og:title'] === 'Pizzeria Gusto Schedule' && g.after.description === 'Check out where Pizzeria Gusto is pitching up next! 🚚', g.after)
    t('HatchGrab, signed-up GB truck: BEFORE "Food Truck | Village Foodie | HatchGrab" and the site root; AFTER "Fenland Fryer | HatchGrab", its own URL, the HatchGrab card (1200x630) — no logo, so the default',
      n.before.title === 'Food Truck | Village Foodie | HatchGrab' && n.before['og:url'] === 'https://www.hatchgrab.com/'
      && n.after.title === 'Fenland Fryer | HatchGrab' && n.after['og:url'] === 'https://www.hatchgrab.com/trucks/fenland-fryer' && n.after['og:image'] === 'https://www.hatchgrab.com/logos/hatchgrab-share-card.png' && n.after['og:image:size'] === '1200x630' && n.after['twitter:card'] === 'summary_large_image', { before: n.before, after: n.after })
    t('HatchGrab, US truck: in US English ("popping up", en_US), its own COVER (wide, the large card)',
      u.after.title === 'Pizza Kitchen US | HatchGrab' && u.after.description === 'Check out where Pizza Kitchen US is popping up next! 🚚' && u.after['og:locale'] === 'en_US'
      && u.after['og:image'] === 'http://127.0.0.1:9/storage/v1/object/public/truck-media/test-truck-us/cover.jpg' && u.after['twitter:card'] === 'summary_large_image', u.after)
    t('HatchGrab, a hidden truck: nothing about it — "Food truck | HatchGrab" and the root\'s HatchGrab card and words', hid.after.title === 'Food truck | HatchGrab' && hid.after['og:site_name'] === 'HatchGrab' && hid.after['og:image'] === 'https://www.hatchgrab.com/logos/hatchgrab-share-card.png' && !J(hid.after).includes('Hidden Bites'), hid.after)
    const pk = row('pizza-kitchen', 'page')
    t('HatchGrab, Pizza Kitchen-shaped (no public HatchGrab row; its discovery row is public there): from the discovery row, its own logo at www.hatchgrab.com/logos', pk.after.title === 'Pizza Kitchen | HatchGrab' && pk.after['og:image'] === 'https://www.hatchgrab.com/logos/bbpizza.jpg', pk.after)
    const go = row('pizzeria-gusto', 'order'), uo = row('test-kitchen-us', 'order'), ho = row('hidden-bites', 'order')
    t('HatchGrab order pages: BEFORE the root alone ("HatchGrab", the site root); AFTER "Order from Pizzeria Gusto | HatchGrab", /trucks/pizzeria-gusto/order, its logo',
      go.before.title === 'HatchGrab' && go.before['og:url'] === 'https://www.hatchgrab.com/' && go.after.title === 'Order from Pizzeria Gusto | HatchGrab' && go.after['og:url'] === 'https://www.hatchgrab.com/trucks/pizzeria-gusto/order' && go.after.description === 'Order ahead from Pizzeria Gusto and collect it at the truck.', go.after)
    t('…US order page in US English ("pick it up"); a hidden-but-trading truck\'s order page names it (its order page serves it)', uo.after.description === 'Order ahead from Pizza Kitchen US and pick it up at the truck.' && ho.after.title === 'Order from Hidden Bites | HatchGrab', { uo: uo.after, ho: ho.after })
    t('HatchGrab never reads the Google Sheet (no fetch on the HatchGrab host)', await (async () => { let hit = false; const f = globalThis.fetch; globalThis.fetch = async u => { hit = true; return f(u) }; await meta('A', 'page', HOSTS.hg, 'pizzeria-gusto'); globalThis.fetch = f; return !hit })())
    t('Village Foodie order pages: BEFORE\'s inherited preview (the layout adds nothing)', ['pizzeria-gusto', 'test-kitchen-us'].every(sl => J(row(sl, 'order', 'vf').after) === J(row(sl, 'order', 'vf').before)))

    // ── the preview cards, drawn (WhatsApp-style and Facebook-style), BEFORE and AFTER ──
    const LOCAL = u => {
      if (!u) return null
      const m = /\/logos\/([^/?#]+)$/.exec(u); if (m) return path.join(REPO, 'public/logos', decodeURIComponent(m[1]))
      if (/t-gusto\/logo\.jpg$/.test(u)) return path.join(REPO, 'public/logos/pizzeriagusto.jpg')
      if (/test-truck-us\/cover\.jpg$/.test(u)) return path.join(REPO, 'public/logos/hatchgrab-share-card.png')
      return null
    }
    const dataUri = f => { if (!f || !fs.existsSync(f)) return ''; const ext = path.extname(f).slice(1).replace('jpg', 'jpeg'); return `data:image/${ext};base64,${fs.readFileSync(f).toString('base64')}` }
    const esc = x => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const domain = u => { try { return new URL(u).host.replace(/^www\./, '') } catch { return '' } }
    const card = (m, style) => {
      const img = dataUri(LOCAL(m['og:image']))
      return style === 'whatsapp'
        ? `<div style="width:360px;background:#d9fdd3;border-radius:10px;padding:4px;font-family:-apple-system,Helvetica,sans-serif"><div style="background:#cfe9c6;border-radius:8px;overflow:hidden">${img ? `<img src="${img}" style="width:100%;height:188px;object-fit:cover;display:block">` : ''}<div style="padding:8px 10px"><div style="font-weight:600;font-size:14px;color:#111">${esc(m['og:title'] || m.title)}</div><div style="font-size:13px;color:#444;margin-top:2px">${esc(m['og:description'] || m.description)}</div><div style="font-size:12px;color:#667;margin-top:4px">${esc(domain(m['og:url'] || ''))}</div></div></div><div style="padding:6px 8px;font-size:14px;color:#0a58ca">${esc(m['og:url'])}</div></div>`
        : `<div style="width:500px;border:1px solid #dadde1;font-family:Helvetica,Arial,sans-serif;background:#fff">${img ? `<img src="${img}" style="width:100%;height:261px;object-fit:cover;display:block">` : '<div style="height:261px;background:#eee"></div>'}<div style="background:#f0f2f5;padding:10px 12px"><div style="font-size:12px;color:#65676b;text-transform:uppercase">${esc(domain(m['og:url'] || ''))}</div><div style="font-size:16px;font-weight:600;color:#050505;margin-top:3px">${esc(m['og:title'] || m.title)}</div><div style="font-size:14px;color:#65676b;margin-top:3px">${esc(m['og:description'] || m.description)}</div></div></div>`
    }
    const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
    const br = await webkit.launch(); const pg = await br.newPage({ viewport: { width: 1180, height: 700 } })
    for (const [slug, label] of [['pizzeria-gusto', 'gusto'], ['test-kitchen-us', 'us']]) {
      for (const style of ['whatsapp', 'facebook']) {
        const x = row(slug, 'page')
        await pg.setContent(`<body style="margin:16px;background:#fff;font-family:Helvetica"><div style="display:flex;gap:28px;align-items:flex-start"><div><div style="font:600 13px Helvetica;margin-bottom:6px">BEFORE — hatchgrab.com/trucks/${slug}</div>${card(x.before, style)}</div><div><div style="font:600 13px Helvetica;margin-bottom:6px">AFTER</div>${card(x.after, style)}</div></div></body>`)
        await pg.screenshot({ path: path.join(OUT, `preview-${label}-${style}.png`), fullPage: true })
      }
    }
    await br.close()
    t('preview cards drawn: docs/us-polish/preview-{gusto,us}-{whatsapp,facebook}.png', ['gusto', 'us'].every(l => ['whatsapp', 'facebook'].every(s => fs.existsSync(path.join(OUT, `preview-${l}-${s}.png`)))))
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · the state on emailed schedules (/api/inbound-schedule → truck_events.region)')
  {
    const STUBS = { '@/lib/email': 'export async function sendConfirmationEmail(m) { (globalThis.__emails = globalThis.__emails || []).push({ to: m.to, subject: m.subject }); return { ok: true } }' }
    const F = 'app/api/inbound-schedule/route.ts'
    const IN = { A: await kit.bundle('usp-inbound-a', `export { POST } from '@/${F}'` + clear, { stubs: STUBS }),
      B: await kit.bundle('usp-inbound-b', `export { POST } from '@/${F}'` + clear, { stubs: STUBS, patches: [whole(F, atHead(F))] }) }
    const world = () => ({
      trucks: [
        { id: 'test-truck', name: 'Pizza Kitchen', contact_email: 'pk@example.test', dashboard_token: 'tok-pk', timezone: 'Europe/London', country: 'GB', scraper_preference: 'auto', active: true, excluded: false, slug: 'test-kitchen' },
        { id: 'test-truck-us', name: 'Pizza Kitchen US', contact_email: 'pkus@example.test', dashboard_token: 'tok-us', timezone: 'America/New_York', country: 'US', scraper_preference: 'auto', active: true, excluded: false, slug: 'test-kitchen-us' },
      ],
      discovery_trucks: [], venues: [], discovery_events: [], truck_events: [], truck_vans: [], rejected_event_signatures: [], discovery_exclusion_terms: [],
      country_settings: [GB_SETTINGS, US_SETTINGS],
    })
    const run = async (code, body) => {
      const pg = makeFakePg(world(), { keys: KEYS_AFTER, defaults: COUNTRY_DEFAULTS }); globalThis.__harnessDb = pg; globalThis.__emails = []
      IN[code].clearCountrySettingsCache?.()
      const res = await kit.quietAsync(() => IN[code].POST(new NextRequest('http://127.0.0.1:3999/api/inbound-schedule', { method: 'POST', body: J({ secret: 'harness-secret', ...body }), headers: { 'content-type': 'application/json' } })))
      const ins = pg.writes.filter(w => w.table === 'truck_events')
      return { status: res.status, body: await res.json(), events: pg.tables.truck_events, writes: ins, all: pg.writes }
    }
    const strip = r => J({ status: r.status, body: r.body, events: r.events.map(({ region, ...e }) => e), writes: r.writes.map(w => J(w).replace(/,"region":"[A-Z]{2}"/g, '')), all: r.all.length })
    const US_ROWS = [
      { event_date: '25/10/2026', start_time: '11:30', end_time: '20:00', truck_name: 'Pizza Kitchen US', venue_name: 'Pier A Park', village: 'Hoboken', postcode: '07030', region: 'NJ', source: 'Admin Screenshot' },
      { event_date: '26/10/2026', start_time: '18:00', end_time: '22:00', truck_name: 'Pizza Kitchen US', venue_name: 'Hoboken Night Market', village: 'Hoboken', postcode: '07030', region: 'nj ', source: 'Admin Screenshot' },
      { event_date: '27/10/2026', start_time: '12:00', end_time: '14:00', truck_name: 'Pizza Kitchen US', venue_name: 'Washington St', village: 'Hoboken', postcode: '07030', source: 'Admin Screenshot' },
      { event_date: '28/10/2026', start_time: '12:00', end_time: '14:00', truck_name: 'Pizza Kitchen US', venue_name: 'Church Square Park', village: 'Hoboken', postcode: '07030', region: 'New Jersey', source: 'Admin Screenshot' },
    ]
    const usA = await run('A', { country: 'US', hatchgrab_truck_id: 'test-truck-us', events: US_ROWS })
    const usB = await run('B', { country: 'US', hatchgrab_truck_id: 'test-truck-us', events: US_ROWS })
    const reg = Object.fromEntries(usA.events.map(e => [e.venue_name, e.region ?? null]))
    t('US batch: "NJ" and " nj " are saved as region "NJ"', reg['Pier A Park'] === 'NJ' && reg['Hoboken Night Market'] === 'NJ', reg)
    t('US batch: a row with no state, and a row whose state is not two letters ("New Jersey"), save NO region (never inferred)', reg['Washington St'] === null && reg['Church Square Park'] === null && !usA.events.find(e => e.venue_name === 'Washington St').hasOwnProperty('region'), reg)
    t('US batch: everything else is BEFORE exactly (the same rows, columns, writes, email and response)', strip(usA) === strip(usB), { a: strip(usA).slice(0, 400), b: strip(usB).slice(0, 400) })
    const GB_ROWS = [
      { event_date: '25/10/2026', start_time: '17:00', end_time: '20:00', truck_name: 'Pizza Kitchen', venue_name: 'The Bell', village: 'Castle Hedingham', postcode: 'CO9 3EJ', source: 'URL' },
      { event_date: '26/10/2026', start_time: '17:00', end_time: '20:00', truck_name: 'Pizza Kitchen', venue_name: 'Five Bells', village: 'Burwell', region: 'Cambridgeshire', source: 'URL' },
      { event_date: '27/10/2026', start_time: '17:00', end_time: '20:00', truck_name: 'Pizza Kitchen', venue_name: 'Red Lion', village: 'Cambridge', region: 'CB', source: 'URL' },
    ]
    const gbA = await run('A', { hatchgrab_truck_id: 'test-truck', events: GB_ROWS }), gbB = await run('B', { hatchgrab_truck_id: 'test-truck', events: GB_ROWS })
    t('GB batch (no country = GB; a county, and even a two-letter "CB"): byte-identical to BEFORE — rows, writes, email, response; no region key', J(gbA) === J(gbB) && gbA.events.every(e => !('region' in e)) && gbA.events.length === 3, { a: J(gbA).slice(0, 300), b: J(gbB).slice(0, 300) })
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · thousands separators (displayed money); tickets keep their width; CSV and inputs raw')
  {
    const MF = { A: await kit.bundle('usp-money-a', "export * from '@/lib/money-format'\nexport { buildTicketLines } from '@/lib/printing/ticket'"),
      B: await kit.bundle('usp-money-b', "export * from '@/lib/money-format'\nexport { buildTicketLines } from '@/lib/printing/ticket'", { patches: [whole('lib/money-format.ts', atHead('lib/money-format.ts')), whole('lib/printing/ticket.ts', atHead('lib/printing/ticket.ts'))] }) }
    const GB = { currency: 'GBP', locale: 'en-GB' }, US = { currency: 'USD', locale: 'en-US' }
    t('£1,234.56 / $1,345.09 / £12,345.67 / $-1,000.00 (minus before the digits, as before)', MF.A.formatMajor(1234.56, GB) === '£1,234.56' && MF.A.formatMajor(1345.09, US) === '$1,345.09' && MF.A.formatMajor(12345.67, GB) === '£12,345.67' && MF.A.formatMajor(-1000, US) === '$-1,000.00')
    t('below 1,000 every figure is BEFORE\'s exactly (every penny 0.00–999.99, both currencies)', (() => { for (let i = -99999; i <= 99999; i++) for (const f of [GB, US]) if (MF.A.formatMajor(i / 100, f) !== MF.B.formatMajor(i / 100, f)) return false; return true })())
    t('grouping: false gives BEFORE\'s figure ("£1234.56") — what the CSVs use', MF.A.formatMajor(1234.56, GB, { grouping: false }) === MF.B.formatMajor(1234.56, GB) && MF.B.formatMajor(1234.56, GB) === '£1234.56')
    t('the box a price is TYPED into is untouched: editableAmount(1234.5) = "1234.50"', MF.A.editableAmount(1234.5, GB) === '1234.50' && MF.A.editableMinor(123456, US) === '1234.56')
    t('no format (the kitchen\'s bare fallback): "1,234.56", and "1234.56" with grouping off', MF.A.formatMajorOrBare(1234.56, null, 'harness') === '1,234.56' && MF.A.formatMajorOrBare(1234.56, null, 'harness', { grouping: false }) === '1234.56' && MF.A.formatMinorOrBare(-123456, null, 'harness') === '-1,234.56')
    // tickets, 58 mm (32 columns) and 80 mm (48), with four- and five-figure amounts
    const tk = (money, big, name = 'Margherita') => ({ id: '49', customer_name: 'Sam', items: [{ name, quantity: 1, unit_price: big, modifiers: [{ name: 'Extra cheese', price: big }] }],
      deals: [{ name: 'Family feast', price: big, slots: {} }], adjustments: [{ label: 'Subtotal', minor: Math.round(big * 300) }, { label: 'Sales tax 6.625%', minor: Math.round(big * 20) }],
      total: big * 3.2, showPaidStep: true, paymentStatus: 'unpaid', balanceMinor: Math.round(big * 320), money, locale: money.locale })
    const lines = (code, o, w) => MF[code].buildTicketLines(o, { paper_width: w }).filter(l => !l.divider && l.size !== 'large').map(l => l.text ?? '')
    let over = []
    for (const money of [GB, US]) for (const big of [1234.56, 12345.67]) for (const w of [58, 80]) {
      const L = lines('A', tk(money, big), w), cols = w === 58 ? 32 : 48
      over.push(...L.filter(x => x.length > cols).map(x => `${money.currency} ${big} ${w}mm: "${x}"`))
    }
    t('every money row of a 4- and 5-figure ticket fits 32 and 48 columns (GB and US; items, modifiers, deals, subtotal, "Sales tax 6.625%", TOTAL, TO PAY)', over.length === 0, over.join(' · '))
    const show = lines('A', tk(GB, 12345.67), 58)
    t('…e.g. 58 mm: "TOTAL                 £39,506.14" — grouped, 32 columns', show.some(x => x === 'TOTAL'.padEnd(32 - '£39,506.14'.length) + '£39,506.14'), show.join(' | '))
    // the fallback row: a label that fits beside "£1234.56" but not "£1,234.56"
    const tight = 'x'.repeat(32 - 1 - '1x '.length - '£1234.56'.length)
    const fb = lines('A', { ...tk(GB, 1234.56), items: [{ name: tight, quantity: 1, unit_price: 1234.56, modifiers: [] }], deals: [] }, 58)
    t('a row with room only for the ungrouped figure keeps it ("1x xxx… £1234.56" on ONE line) — the one place grouping yields, and only when it would wrap', fb.some(x => x.length === 32 && x.endsWith(' £1234.56') && x.startsWith('1x ')) && !fb.some(x => x.trim() === '£1,234.56'), fb.slice(0, 12).join(' | '))
    const before = lines('B', tk(GB, 1234.56), 80), after = lines('A', tk(GB, 1234.56), 80)
    t('a 4-figure ticket differs from BEFORE only by its separators (the line\'s width given back from the gap)', after.length === before.length && after.every((x, i) => x === require('./_us-polish-grouping.cjs').groupString(before[i])), before.map((x, i) => x === after[i] ? null : `${x} → ${after[i]}`).filter(Boolean).join(' · '))
    // the WhatsApp menu reply's price check reads a grouped figure as ONE figure
    const src = read('lib/whatsapp-classifier.ts')
    const m = /new RegExp\(`\$\{sym\}(\\\\s\?\(\?:[^`]+)`, 'g'\)/.exec(src)
    const re = m && new RegExp('£' + m[1].replace(/\\\\/g, '\\'), 'g')
    const quoted = re ? ('The Feast is £1,250.00 and a Margherita £9.50 — or £12'.match(re) || []).map(p => parseFloat(p.replace(/£|\s|,/g, '')).toFixed(2)) : []
    t('WhatsApp menu replies: "£1,250.00" is read as 1250.00 (not "£1"), "£9.50" and "£12" as before', J(quoted) === J(['1250.00', '9.50', '12.00']), J(quoted))
    // CSV: the Reports screen groups, its two CSVs never do (source: the CSV builders call csvMoney only)
    const mp = read('app/manage/[token]/page.tsx')
    const exp = mp.slice(mp.indexOf('const exportCSV = () => {'), mp.indexOf('const exportItemsCSV = () => {') + 1200)
    t('the Reports CSVs use csvMoney ({ grouping: false }) for every amount; the screen uses fmtMoney (grouped)', /function csvMoney\(n: number, f: MoneyFormat\) \{ return formatMajor\(n, f, \{ grouping: false \}\) \}/.test(mp)
      && !/[^v]orderMoney\(o, /.test(exp) && !/fmtMoney\(/.test(exp) && (exp.match(/csvOrderMoney\(o, /g) || []).length === 6 && (exp.match(/csvMoney\(r\./g) || []).length === 3, 'a CSV amount still goes through a grouped formatter')
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · refusal words from codes (onboarding and kitchen screens)')
  {
    const E = await kit.bundle('usp-errors', "export { errorText, errorTextIn } from '@/lib/i18n/customer-errors'\nexport { errorBody } from '@/lib/i18n/error-body'\nexport { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/errorsOnboarding'\nimport '@/lib/i18n/catalog/errorsKitchen'\nimport '@/lib/i18n/catalog/errorsManage'\nimport '@/lib/i18n/catalog/tradeArea'")
    const { parse, TYPE } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))
    const MSG = JSON.parse(read('messages/en-GB.json')), US_MSG = JSON.parse(read('messages/en-US.json'))
    const leaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v]] : leaves(v, p + k + '.')))
    const sample = src => { const out = {}; const walk = ast => { for (const el of ast) {
      if (el.type === TYPE.argument) out[el.value] ??= 'Harness'
      if (el.type === TYPE.number || el.type === TYPE.plural) out[el.value] = 2
      if (el.type === TYPE.select) out[el.value] ??= Object.keys(el.options).find(o => o !== 'other') ?? 'other'
      if (el.options) for (const o of Object.values(el.options)) walk(o.value)
      if (el.children) walk(el.children)
    } }; walk(parse(src, { ignoreTag: true })); return out }
    let gbSame = 0, gbDiff = [], usDiff = []
    for (const ns of ['errorsOnboarding', 'errorsKitchen', 'errorsManage', 'tradeArea']) {
      const tGB = E.translatorFor('en-GB', ns), tUS = E.translatorFor('en-US', ns)
      for (const [key, src] of leaves(MSG[ns])) {
        const params = sample(src)
        const gbBody = E.errorBody(ns, 'en-GB', key, params)
        // GB screen, GB body (every route on a GB truck, and every DEFAULT_LOCALE refusal): exactly the `error` it carried
        if (E.errorText(tGB, gbBody, 'FALLBACK') === gbBody.error) gbSame++; else gbDiff.push(`${ns}.${key}`)
        // US screen, en-GB body (a DEFAULT_LOCALE refusal): differs exactly where en-US overrides the key
        if (E.errorText(tUS, gbBody, 'FALLBACK') !== gbBody.error) usDiff.push(`${ns}.${key}`)
        // US screen, US body (a refusal worded in the truck's language): identical
        const usBody = E.errorBody(ns, 'en-US', key, params)
        if (E.errorText(tUS, usBody, 'FALLBACK') !== usBody.error) gbDiff.push(`${ns}.${key} (US body on a US screen)`)
      }
    }
    t(`GB: every refusal code in errorsOnboarding, errorsKitchen, errorsManage and tradeArea is worded exactly as the \`error\` the route sends (${gbSame} codes, with their params)`, gbDiff.length === 0, gbDiff.join(', '))
    const overrides = ['errorsOnboarding', 'errorsKitchen', 'errorsManage', 'tradeArea'].flatMap(ns => leaves(US_MSG[ns] || {}).map(([k]) => `${ns}.${k}`))
    t(`US: an en-GB-worded refusal reads differently on a US screen for EXACTLY the en-US overrides (${overrides.length}), and no other code`, J(usDiff.sort()) === J(overrides.sort()), { usDiff, overrides })
    // Which of those reach a switched screen worded in en-GB? Only the DEFAULT_LOCALE refusals of the routes they call.
    const defaults = f => [...read(f).matchAll(/(?:kitchenErrorBody|manageErrorBody|onboardingErrorBody|refuse)\(DEFAULT_LOCALE, '([a-z_]+)'/g)].map(m => m[1])
    const reach = {
      '/api/dashboard/action (dashboard toasts, edit, refund, intervals; the KDS; Add order)': ['errorsKitchen', defaults('app/api/dashboard/action/route.ts')],
      // the KDS words only the 401 refusals (its link check); a 403 there takes the keep-the-board path, unchanged
      '/api/dashboard (the KDS link check, 401)': ['errorsKitchen', [...read('app/api/dashboard/route.ts').matchAll(/kitchenErrorBody\(DEFAULT_LOCALE, '([a-z_]+)'[^\n]*status: 401/g)].map(m => m[1])],
      '/api/events/action (dashboard and KDS event menus)': ['errorsManage', defaults('app/api/events/action/route.ts')],
      '/api/manage (custom domain setup)': ['errorsManage', defaults('app/api/manage/route.ts')],
      'onboarding routes (signup, setup, countries, reset, demo, save-email, build-request, demo restart)': ['errorsOnboarding', ['app/api/signup/route.ts', 'app/api/setup/route.ts', 'app/api/setup/countries/route.ts', 'app/api/auth/reset-password/route.ts', 'app/api/demo/route.ts', 'app/api/demo/save-email/route.ts', 'app/api/demo/build-request/route.ts', 'app/api/demo/restart/route.ts'].flatMap(defaults)],
    }
    const usChanges = Object.entries(reach).flatMap(([where, [ns, codes]]) => [...new Set(codes)].filter(c => overrides.includes(`${ns}.${c}`)).map(c => `${where}: ${ns}.${c} "${MSG[ns][c]}" → "${US_MSG[ns][c]}"`))
    console.log('    named US wording changes on switched screens:\n      ' + (usChanges.join('\n      ') || '(none)'))
    t('the ONLY US wording change the switch makes: "Unauthorised" → "Unauthorized", when /api/dashboard/action refuses a session (401, worded in en-GB) on a US kitchen screen',
      usChanges.length === 1 && /\/api\/dashboard\/action.*errorsKitchen\.unauthorised "Unauthorised" → "Unauthorized"/.test(usChanges[0]), usChanges)
    t('a code the namespace does not have (a database error code on a last-resort body) falls back to the `error` — and with none, to the screen\'s own fallback', E.errorText(E.translatorFor('en-GB', 'errorsKitchen'), { error: 'duplicate key', code: '23505' }, 'X') === 'duplicate key' && E.errorText(E.translatorFor('en-GB', 'errorsKitchen'), {}, 'X') === 'X')
    t('/api/setup: errorTextIn reads errorsOnboarding, then tradeArea', (() => { const tE = E.translatorFor('en-US', 'errorsOnboarding'), tT = E.translatorFor('en-US', 'tradeArea'); const k = leaves(MSG.tradeArea)[0][0]; const b = E.errorBody('tradeArea', 'en-GB', k, sample(MSG.tradeArea[k])); return E.errorTextIn([tE, tT], b, 'X') === b.error && E.errorTextIn([tE, tT], E.errorBody('errorsOnboarding', 'en-GB', 'truck_name_missing', {}), 'X') === MSG.errorsOnboarding.truck_name_missing })())
    // every switched site, by source
    const SITES = [
      ['app/signup/page.tsx', "setError(errorText(tErr, data, t('errorFallback')))", "useT('errorsOnboarding')"],
      ['app/reset-password/page.tsx', "setError(errorText(tErr, data, t('errorFallback')))", "useT('errorsOnboarding')"],
      ['app/setup/page.tsx', "setError(errorTextIn([tErr, tTrade], data, t('createFailed')))", "useT('tradeArea')"],
      ['components/setup/WhereBasedStep.tsx', "errorText(tErr, error.server, t('countriesFailed'))", "useT('errorsOnboarding')"],
      ['components/DemoGetStarted.tsx', "errorTextIn([tErr, tTrade] as never[], e.server, t(`error.${e.code}`))", "translatorFor(wizardLocale, 'errorsOnboarding')"],
      ['components/landing/DemoUpload.tsx', "errorText(tErr, message.server, t(`error.${message.code}`))", "useT('errorsOnboarding')"],
      ['app/dashboard/[token]/page.tsx', "setRestartError(errorText(tErrO,data,tDash('demo.restartFailed')))", "useT('errorsKitchen'), tErrM=useT('errorsManage'), tErrO=useT('errorsOnboarding')"],
      ['app/dashboard/[token]/kds/page.tsx', "setError(errorText(tErrK, data, 'error.linkInvalid'))", "useT('errorsKitchen'), tErrM = useT('errorsManage')"],
      ['lib/native/useGatedActionResult.tsx', "throw new Error(errorText(tErrRef.current, data, ''))", "useT('errorsKitchen')"],
      ['components/dashboard/AddOrderPanel.tsx', "throw new Error(errorText(tErr, data, ''))", "useT('errorsKitchen')"],
      ['components/dashboard/CustomDomainSetup.tsx', "throw new Error(errorText(tErr, data, t('wizard.genericError')))", "useT('errorsManage')"],
    ]
    const missing = SITES.filter(([f, use, tr]) => !read(f).includes(use) || !read(f).includes(tr)).map(([f]) => f)
    t(`every switched screen words its refusal from code + params, in its route's namespace (${SITES.length} files)`, missing.length === 0, missing.join(', '))
    const dash = read('app/dashboard/[token]/page.tsx'), kds = read('app/dashboard/[token]/kds/page.tsx')
    t('dashboard: 5 event-menu throws use errorsManage; edit / busy / refund / intervals use errorsKitchen', (dash.match(/throw new Error\(errorText\(tErrM,data,''\)\)/g) || []).length === 5 && dash.includes("throw new Error(errorText(tErrK,data,''))") && dash.includes("errorText(tErrK,data,tDash('toast.editBusy'))") && dash.includes("message:errorText(tErrK,data,tDash('refund.failed'))") && dash.includes('msg=errorText(tErrK,await res.clone().json(),msg)'))
    t('KDS: 5 event-menu throws use errorsManage', (kds.match(/throw new Error\(errorText\(tErrM, data, ''\)\)/g) || []).length === 5)
    const left = ['app/signup/page.tsx', 'app/reset-password/page.tsx', 'app/setup/page.tsx', 'components/setup/WhereBasedStep.tsx', 'components/DemoGetStarted.tsx', 'components/landing/DemoUpload.tsx', 'app/dashboard/[token]/kds/page.tsx', 'lib/native/useGatedActionResult.tsx', 'components/dashboard/AddOrderPanel.tsx', 'components/dashboard/CustomDomainSetup.tsx']
      .filter(f => /(?:setError|setMessage|showToast|setRestartError)\([^)]*data\??\.error|throw new Error\(data\??\.error\)/.test(read(f)))
    t('no switched file still shows a route\'s raw `error` (the two never-shown buzzer/profile throws on the dashboard are left as they are)', left.length === 0, left.join(', '))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
