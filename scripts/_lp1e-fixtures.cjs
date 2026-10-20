// scripts/_lp1e-fixtures.cjs — the shared fixtures for scripts/language-phase-1e.cjs (Language Phase 1e: the HatchGrab
// MARKETING surfaces — landing, /features, /compare, the plans PDF, nav and footers, contact, the legal chrome, the public
// truck page, Billing's plan rows — into the message files with their US words; the /uk and /us country addresses and
// the country router in proxy.ts). A MODULE, not a harness.
//
// 🔴 EVERY VIEW RUNS ON BOTH CODES (eb7ed44 and this tree). A page that exists only after (app/[country]/…) is found with
//    fs.existsSync; a new export is guarded with typeof; one broken view never stops an area (ctx.safeAsync).
//
// THE REQUEST: next/headers is stubbed — headers() / cookies() answer from globalThis.__mcReq (host, x-vercel-ip-country,
// the hg_country cookie) exactly as scripts/marketing-country-parity.cjs does. THE DATABASE: the in-memory fake, holding
// the country_settings rows PARSED FROM THE SEED MIGRATIONS (scripts/_country-settings-gb.cjs) — GB, and the US either
// as seeded (switched OFF, production) or switched ON with fixture prices. Nothing reaches a database or the network:
// globalThis.fetch is replaced for the whole process by a fixture answerer that refuses every address it does not know.
const fs = require('fs'); const path = require('path')
const SEEDS = require('./_country-settings-gb.cjs')

const NOW = '2026-10-09T14:20:00.000Z'
const PLAN_ROWS = () => require('./_lp1c-fixtures.cjs').planTables()
const BEFORE_REF = 'eb7ed44'
const HG_HOST = 'www.hatchgrab.com'
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const GB = () => SEEDS.gbFromSeed()
const US_OFF = () => SEEDS.usFromSeed()
/** The US switched ON, with fixture prices (the seed leaves US prices undecided on purpose) — marketing-country-parity's. */
const US_ON = () => ({ ...SEEDS.usFromSeed(), enabled: true, starterMonthlyMinor: 3900, proMonthlyMinor: 5900, maxMonthlyMinor: 9900,
  proAllowanceMinor: 30000, maxAllowanceMinor: 100000, platformFeePct: 1.5 })
const ROWS = { off: () => [GB(), US_OFF()], on: () => [GB(), US_ON()] }

const FONT_NAMES = ['Archivo', 'Public_Sans', 'Courier_Prime', 'Geist', 'Geist_Mono', 'Inter']
const STUBS = {
  'next/font/google': FONT_NAMES.map(n => `export const ${n} = () => ({ variable: 'font-${n}', className: 'font-${n}', style: {} })`).join('\n'),
  'next/headers': `
    const H = () => globalThis.__mcReq || { headers: {}, cookies: {} }
    export async function headers() { const r = H(); return { get: k => r.headers[k.toLowerCase()] ?? null, has: k => k.toLowerCase() in r.headers } }
    export async function cookies() { const r = H(); return { get: k => (k in r.cookies ? { name: k, value: r.cookies[k] } : undefined), has: k => k in r.cookies, getAll: () => Object.entries(r.cookies).map(([name, value]) => ({ name, value })), set() {} } }
    export async function draftMode() { return { isEnabled: false } }`,
  'next/script': "import { createElement } from 'react'\nexport default function Script(p) { return createElement('script', { 'data-src': p.src || '', 'data-strategy': p.strategy || '' }) }",
  'next/dynamic': "export default function dynamic() { return function Dynamic() { return null } }",
  'posthog-js/react': "export const usePostHog = () => null\nexport function PostHogProvider(p) { return p.children }",
  // the public truck page's data hook (a Google-Sheet read in the browser): answered from the fixture
  '@/hooks/useVillageData': 'export function useVariant() { return null }\nexport function useVillageData() { return globalThis.__tcData || { loading: false, loadError: null, refetch() {}, mapEvents: [], allTrucks: [] } }',
  // the plans PDF's browser: records what it is handed, prints nothing
  'puppeteer-core': `export async function launch(o) { const rec = globalThis.__pdfRec = globalThis.__pdfRec || {}; rec.launch = true
    return { async newPage() { return { async setContent(html, opts) { rec.html = html; rec.setContent = opts }, async pdf(opts) { rec.pdf = opts; return new Uint8Array([37, 80, 68, 70]) } } }, async close() { rec.closed = true } } }
    export default { launch }`,
  '@sparticuz/chromium': 'export const args = []\nexport const defaultViewport = null\nexport const headless = true\nexport async function executablePath() { return "/harness/no-chromium" }\nexport default { args, defaultViewport, headless, executablePath }',
  'puppeteer': 'export async function launch() { throw new Error("no browser in this harness") }\nexport default { launch }',
}

// ── no network: every address answered from the fixture or refused ──
const SHEET_CSV = [
  'Name,Type,c2,c3,c4,c5,c6,c7,c8,Logo',
  'Pizza Kitchen,Pizza,,,,,,,,/logos/pizza-kitchen.png',
  'Taco Kitchen,Mexican,,,,,,,,/logos/taco-kitchen.png',
].join('\n')
function installNoNetwork() {
  if (globalThis.__lp1eNet) return
  globalThis.__lp1eNet = true
  globalThis.fetch = async url => {
    const u = String(url && url.url || url)
    if (/docs\.google\.com\/spreadsheets/.test(u)) return { ok: true, status: 200, text: async () => SHEET_CSV, json: async () => ({}) }
    throw new Error(`no network in this harness: ${u.slice(0, 80)}`)
  }
}

function context(kit, REPO) {
  installNoNetwork()
  const { h } = kit
  const exists = f => fs.existsSync(path.join(REPO, f))
  const src = f => (exists(f) ? fs.readFileSync(path.join(REPO, f), 'utf8') : '')
  const skipped = []
  const safeAsync = async (out, key, fn) => { try { out[key] = await fn() } catch (e) { out[key] = 'ERROR ' + String(e && e.message || e).slice(0, 300) } }
  const bundles = {}
  // Every bundle carries its OWN copy of lib/country-settings (and its 60 s cache): each one exports the clear, and every
  // request clears every bundle made so far, so each fixture's rows are read fresh by whichever copy reads them.
  const clears = []
  const bundle = async (tag, entry, opts = {}) => (bundles[tag] ||= kit.bundle(tag, `${entry}\nexport { clearCountrySettingsCache as __lp1eClearCS } from '@/lib/country-settings'\nexport { I18nContext as __lp1eI18n } from '@/lib/i18n/use-t'`, { ...opts, stubs: { ...STUBS, ...(opts.stubs || {}) } })
    .then(M => { if (M && typeof M.__lp1eClearCS === 'function') clears.push(M.__lp1eClearCS); return M }))

  async function prerender(el) {
    const { prerenderToNodeStream } = require(path.join(REPO, 'node_modules/react-dom/static'))
    return kit.quietAsync(async () => {
      const { prelude } = await prerenderToNodeStream(el)
      let s = ''; for await (const c of prelude) s += c
      return s
    })
  }
  /** Runs `fn` with this request (host / ip / cookie) and these country rows in the fake database. */
  async function withReq({ rows = ROWS.off(), host = HG_HOST, ip = null, cookie = null, tables = {} } = {}, fn) {
    kit.setNow(NOW); kit.setDeviceTz('Europe/London')
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the marketing pages, /compare and the plans PDF read the
    // plan catalogue now, so the database also holds public.plans / plan_prices / plan_features AS THE MIGRATIONS SEED
    // THEM (scripts/_lp1c-fixtures.cjs planTables) — fixture input, overridable per request through `tables`.
    globalThis.__harnessDb = kit.fakeDb({ country_settings: rows.map(snake), trucks: [], ...PLAN_ROWS(), ...tables })
    globalThis.__mcReq = { headers: { host, ...(ip ? { 'x-vercel-ip-country': ip } : {}) }, cookies: cookie ? { hg_country: cookie } : {} }
    try {
      for (const c of clears) c()
      return await fn()
    } finally { delete globalThis.__harnessDb; delete globalThis.__mcReq }
  }
  /** The client components' language: the I18n context in `locale` — 🔴 THE CONTEXT OBJECT OF THE BUNDLE `M` THE COMPONENT
   *  CAME FROM (each bundle has its own copy of lib/i18n/use-t; a provider from another bundle is invisible to it). */
  async function inLocale(locale, el, M) {
    const C = M && M.__lp1eI18n
    return C ? h(C.Provider, { value: { locale, setLocale() {} } }, el) : el
  }

  // ── METADATA, as Next resolves it (the subset the marketing pages use) ──
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof URL)
  const plain = v => JSON.parse(JSON.stringify(v, (k, x) => (x instanceof URL ? `URL(${x.href})` : x)))
  /** Layout metadata objects (root first) and the page's, merged: a segment's top-level key REPLACES its parent's
   *  (Next: "nested fields such as openGraph and robots defined in a segment overwrite the parent's"); a string title takes
   *  the nearest parent template; relative URLs resolve against metadataBase. The raw objects travel too. */
  function mergeMeta(chain) {
    const merged = {}; let template = null
    for (const m of chain) {
      if (!m) continue
      for (const [k, v] of Object.entries(m)) {
        if (k === 'title') {
          if (typeof v === 'string') merged.title = template ? template.replace('%s', v) : v
          else if (isObj(v)) merged.title = v.absolute ?? (template && v.default ? v.default : v.default ?? merged.title)
          if (isObj(v) && v.template) template = v.template
          continue
        }
        merged[k] = v
      }
    }
    const base = merged.metadataBase instanceof URL ? merged.metadataBase : (typeof merged.metadataBase === 'string' ? new URL(merged.metadataBase) : null)
    const abs = u => (typeof u === 'string' && base && !/^[a-z]+:/i.test(u) ? new URL(u, base).href : u instanceof URL ? u.href : u)
    const out = plain({ ...merged, metadataBase: base ? base.href : null })
    if (out.alternates) {
      if (out.alternates.canonical) out.alternates.canonical = abs(merged.alternates.canonical)
      if (out.alternates.languages) for (const [l, u] of Object.entries(merged.alternates.languages)) out.alternates.languages[l] = abs(u)
    }
    if (out.openGraph) {
      if (out.openGraph.url) out.openGraph.url = abs(merged.openGraph.url)
      if (Array.isArray(out.openGraph.images)) out.openGraph.images = merged.openGraph.images.map(i => (typeof i === 'string' ? abs(i) : { ...plain(i), url: abs(i.url) }))
    }
    if (out.twitter && Array.isArray(out.twitter.images)) out.twitter.images = merged.twitter.images.map(i => (typeof i === 'string' ? abs(i) : { ...plain(i), url: abs(i.url) }))
    return out
  }
  /** A module's metadata: generateMetadata(props) or the static `metadata` export (null when neither). */
  async function metaOf(M, props, parent = {}) {
    if (M && typeof M.generateMetadata === 'function') return M.generateMetadata(props, Promise.resolve(parent))
    return (M && M.metadata) || null
  }
  /** The JSON-LD blocks a rendered page carries. */
  const jsonLd = html => [...String(html).matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => { try { return JSON.parse(m[1]) } catch { return m[1] } })

  const ctx = { kit, h, REPO, exists, src, skipped, safeAsync, bundle, prerender, withReq, inLocale, mergeMeta, metaOf, plain, jsonLd, ROWS, GB, US_ON, US_OFF, snake, NOW, BEFORE_REF, HG_HOST, STUBS }
  ctx.textOf = html => kit.textOf(html)
  return ctx
}

module.exports = { context, NOW, BEFORE_REF, HG_HOST, ROWS, GB, US_ON, US_OFF, snake, STUBS, SHEET_CSV, installNoNetwork }
