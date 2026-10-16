#!/usr/bin/env node
// scripts/country-settings-parity.cjs — every price and fee string a UK reader sees, before and after the
// country_settings move (docs/country-settings-code-report.md).
//
//   node scripts/country-settings-parity.cjs                    check against the committed BEFORE snapshot
//   node scripts/country-settings-parity.cjs --capture <file>   write a snapshot of the current code
//   HG_PAGES=1 node scripts/country-settings-parity.cjs         also fetch / , /features and /compare from the
//                                                               dev server on localhost:3000 (it must be running)
//
// ── 🔴 THE V11.38 METHOD, AND WHY IT IS EXHAUSTIVE ───────────────────────────────────────────────────
// The snapshot is every exported price/fee value of lib/features.ts, lib/plan-features.ts and
// lib/landing-table.ts, the plans PDF's text, and the RENDERED TEXT of Manage → Billing (every plan, the
// matrix open, both upgrade targets, prices published and suppressed), Manage → Payments, and Admin's plan
// matrix and truck modal. Capturing only the strings expected to change would prove the intended change
// happened, not that everything else was left alone.
//
// 🔴 THE ALLOWED DIFFERENCES ARE NAMED, NOT PATTERN-MATCHED LOOSELY — three of them, listed at TEXT_RULES
// below (Part B's "UK cards"; Part C's Payments sentence and the empty /compare fee boxes). Every other
// byte must match.
//
// ── WHERE THE GB FIGURES COME FROM ────────────────────────────────────────────────────────────────────
// Parsed out of supabase/migrations/20261010_03_country_settings_seed_gb.sql — the seed that was run — not
// typed into this file. A hand copy here would prove the code agrees with the hand copy. The LIVE row is
// proved separately by the HG_PAGES pass: / , /features and /compare render through the real loader.
//
// ── HOW COMPONENTS ARE RENDERED ──────────────────────────────────────────────────────────────────────
// esbuild bundles the REAL file for node; a plugin appends `export { BillingTab }` (it is not exported)
// and patches useState defaults so renderToStaticMarkup shows the matrix / modal / loaded state. Every
// patch is checked for applying — a replace that finds nothing would silently measure the default state.
// The repo's own files are never written.

const fs = require('fs'); const path = require('path'); const http = require('http')
const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const argv = process.argv.slice(2)
const CAPTURE = argv.includes('--capture') ? argv[argv.indexOf('--capture') + 1] : null
const BEFORE_FILE = 'scripts/fixtures/country-settings-before.json'
const CACHE = path.join(REPO, 'node_modules/.cache/country-settings-parity')
fs.mkdirSync(CACHE, { recursive: true })

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// THE GB ROW, FROM THE SEED FILE — scripts/_country-settings-gb.cjs
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const { gbFromSeed } = require('./_country-settings-gb.cjs')
const GB = gbFromSeed()

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// BUNDLING
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const NAV_STUB = `export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} })
export const usePathname = () => '/'
export const useSearchParams = () => new URLSearchParams('')
export const useParams = () => ({})
export const notFound = () => { throw new Error('notFound') }
export const redirect = () => { throw new Error('redirect') }`

async function bundle(tag, entry, { patches = [], define = {} } = {}) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const applied = new Map(patches.map((p, i) => [i, false]))
  const plugin = {
    name: 'parity',
    setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'stub' }))
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'nav', namespace: 'stub' }))
      // The real DemoCta needs the landing's DemoModalProvider; the comparison measures prices, not that.
      b.onResolve({ filter: /components\/landing\/DemoUpload(\.tsx)?$/ }, () => ({ path: 'demo', namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({
        contents: a.path === 'nav' ? NAV_STUB
          : a.path === 'demo' ? "import React from 'react'\nexport function DemoCta(p) { return React.createElement('button', { className: p.className }, p.children) }\nexport function DemoModalProvider(p) { return p.children }\nexport function DemoModal() { return null }"
          : '',
        loader: 'js',
      }))
      const files = [...new Set(patches.map(p => path.join(REPO, p.file)))]
      for (const abs of files) {
        const esc = abs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        b.onLoad({ filter: new RegExp('^' + esc + '$') }, () => {
          let src = fs.readFileSync(abs, 'utf8')
          patches.forEach((p, i) => {
            if (path.join(REPO, p.file) !== abs) return
            if (p.append) { src += '\n' + p.append + '\n'; applied.set(i, true); return }
            if (src.includes(p.from)) { src = src.replace(p.from, p.to); applied.set(i, true) }
          })
          return { contents: src, loader: abs.endsWith('x') ? 'tsx' : 'ts' }
        })
      }
    },
  }
  const res = await esbuild.build({
    stdin: { contents: entry, resolveDir: REPO, loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', target: 'node20',
    logLevel: 'silent', alias: { '@': REPO },
    loader: { '.css': 'empty', '.svg': 'text', '.png': 'empty', '.jpg': 'empty' },
    external: ['react', 'react-dom', 'react/jsx-runtime', 'next', 'next/*', 'puppeteer-core', '@sparticuz/chromium'],
    define: { 'process.env.NODE_ENV': '"development"', ...define },
    plugins: [plugin],
  })
  patches.forEach((p, i) => {
    if (!applied.get(i) && !p.optional) throw new Error(`[${tag}] a patch did not apply in ${p.file}: ${JSON.stringify(p.from || p.append).slice(0, 120)}`)
  })
  const out = path.join(CACHE, `${tag}.cjs`)
  fs.writeFileSync(out, res.outputFiles[0].text)
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:9'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'harness-anon'
  delete require.cache[out]
  const quiet = console.error; const quietW = console.warn; const quietL = console.log
  console.error = () => {}; console.warn = () => {}; console.log = () => {}
  try { return require(out) } finally { console.error = quiet; console.warn = quietW; console.log = quietL }
}

const React = () => require(path.join(REPO, 'node_modules/react'))
const renderStatic = el => {
  const { renderToStaticMarkup } = require(path.join(REPO, 'node_modules/react-dom/server'))
  const quiet = console.error; console.error = () => {}
  try { return renderToStaticMarkup(el) } finally { console.error = quiet }
}

// Visible text, plus the attribute values a reader also sees (input values, mailto bodies, labels).
function textOf(html) {
  const ents = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'").replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…')
  const ld = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].trim())
  // ⚠️ `<!-- -->` (React's SSR separator between adjacent text nodes) is read as a SPACE, like every other
  // tag, and that is deliberate: the BEFORE fixture was captured this way, and both sides must be read the
  // same way to be comparable. Where it lands before punctuation, normPages below accounts for it.
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const attrs = [...body.matchAll(/\s(value|placeholder|aria-label|title|alt|href)="([^"]*)"/g)]
    .filter(m => m[1] !== 'href' || m[2].startsWith('mailto:'))
    .map(m => `${m[1]}=${ents(m[2])}`)
  const text = ents(body.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  return { text, attrs, ld }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE MODULES — every exported price/fee value, in ONE shape whichever API is present
// ══════════════════════════════════════════════════════════════════════════════════════════════════
async function moduleView() {
  const m = await bundle('modules', `
    export * as F from '@/lib/features'
    export * as P from '@/lib/plan-features'
    export * as T from '@/lib/landing-table'
    ${fs.existsSync(path.join(REPO, 'lib/money-format.ts')) ? "export * as M from '@/lib/money-format'" : 'export const M = null'}
  `)
  const { F, P, T, M } = m
  const after = typeof P.planPrices === 'function'
  const plans = Object.keys(F.PLAN_META)
  const v = {}
  v.api = after ? 'settings' : 'constants'
  v.PLAN_META = Object.fromEntries(plans.map(p => [p, {
    name: F.PLAN_META[p].name,
    price: after ? F.planPrice(p, GB) : F.PLAN_META[p].price,
    description: F.PLAN_META[p].description,
  }]))
  v.PLAN_PRICES = after ? P.planPrices(GB) : P.PLAN_PRICES
  v.PLAN_DESCRIPTIONS = P.PLAN_DESCRIPTIONS
  v.PLAN_MONTHLY_MINOR = after
    ? { starter: F.planMonthlyMinor('starter', GB), pro: F.planMonthlyMinor('pro', GB), max: F.planMonthlyMinor('max', GB) }
    : { ...F.PLAN_MONTHLY_PENCE }
  const allowance = after ? P.planOnlineAllowance(GB) : P.PLAN_ONLINE_ALLOWANCE
  v.PLAN_ONLINE_ALLOWANCE = Object.fromEntries(Object.entries(allowance).map(([k, a]) => [k, a.kind === 'amount' ? { kind: a.kind, minor: after ? a.minor : a.pence } : { kind: a.kind }]))
  v.PLATFORM_FEE_PCT = after ? P.platformFeeOverAllowance(GB).pct : P.PLATFORM_FEE_OVER_ALLOWANCE.pct
  v.PLATFORM_FEE_LABEL = after ? P.platformFeeLabel(GB) : P.PLATFORM_FEE_LABEL
  v.PLAN_ALLOWANCES = after ? P.planAllowances(GB) : P.PLAN_ALLOWANCES
  const cf = after ? P.cardFees(GB) : P.CARD_FEES
  v.CARD_FEES = after
    ? { onlinePct: cf.online.pct, onlineFixedMinor: cf.online.fixedMinor, inPersonPct: cf.inPerson.pct, inPersonFixedMinor: cf.inPerson.fixedMinor, tapToPayFixedMinor: cf.tapToPayFixedMinor }
    : { onlinePct: cf.online.pct, onlineFixedMinor: cf.online.pence, inPersonPct: cf.inPerson.pct, inPersonFixedMinor: cf.inPerson.pence, tapToPayFixedMinor: cf.tapToPaySurchargePence }
  v.CARD_FEE_ONLINE_LABEL = after ? P.cardFeeOnlineLabel(GB) : P.CARD_FEE_ONLINE_LABEL
  v.CARD_FEE_IN_PERSON_LABEL = after ? P.cardFeeInPersonLabel(GB) : P.CARD_FEE_IN_PERSON_LABEL
  v.TAP_TO_PAY_SURCHARGE_LABEL = after ? P.tapToPaySurchargeLabel(GB) : P.TAP_TO_PAY_SURCHARGE_LABEL
  v.TRANSACTION_ROWS = after ? P.transactionRows(GB) : P.TRANSACTION_ROWS
  v.FOOTNOTES = after ? P.footnotes(GB) : P.FOOTNOTES
  // Language Phase 0 (14 October 2026): each row gained a code `id` — a lookup key that is never displayed
  // (scripts/language-phase-0.cjs checks it). The snapshot compares what the rows SAY, so the id is left out.
  v.FEATURE_SECTIONS = P.FEATURE_SECTIONS.map(sec => ({ ...sec, rows: sec.rows.map(r => { const row = { ...r }; delete row.id; return row }) }))
  v.PLAN_PRICE_LABEL = after ? T.planPriceLabels(GB) : T.PLAN_PRICE_LABEL
  v.PLAN_SUB = T.PLAN_SUB
  v.parity = P.findPlanParityViolations()
  // The helpers on the inputs the app gives them, plus the neighbours a price change would produce.
  const money = { currency: GB.currency, locale: GB.locale }
  v.samples = {
    perMonth: [0, 2900, 2950, 4900, 999].map(n => after ? M.perMonthLabel(n, money) : F.planPriceLabel(n)),
    allowance: [150000, 200000, 100000, 50000, 99900].map(n => after ? M.formatWholeAmount(n, money) : P.allowanceAmountLabel(n)),
    pct: [0.99, 1.5, 1.4, 1, 0, 4.5, 2.25, 12.5].map(n => after ? M.pctLabel(n, money) : P.pctLabel({ pct: n })),
    fee: [[1.5, 20], [1.4, 10], [0, 5], [2.25, 99]].map(([pct, f]) => after ? M.feeLabel({ pct, fixedMinor: f }, money) : P.feeLabel({ pct, pence: f })),
  }
  // The van add-on: a raw-number map in the page before; the plan's monthly price from settings after.
  const page = read('app/manage/[token]/page.tsx')
  const lit = page.match(/const VAN_ADDON_PRICE: Record<string, number> = \{([^}]*)\}/)
  const van = {}
  for (const plan of ['starter', 'pro', 'max', 'trial']) {
    let minor
    if (lit) {
      const n = Number((lit[1].match(new RegExp(plan + ':\\s*(\\d+)')) || [])[1] ?? 0)
      minor = n * 100
      van[plan] = n > 0 ? { month: `£${n}/month`, mo: `£${n}/mo` } : null
    } else {
      minor = P.vanAddonMonthlyMinor(plan, GB)
      van[plan] = minor > 0 ? { month: M.perMonthLabel(minor, money, 'month'), mo: M.perMonthLabel(minor, money) } : null
    }
  }
  v.VAN_ADDON = van
  return v
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE PLANS PDF — its HTML, as text
// ══════════════════════════════════════════════════════════════════════════════════════════════════
async function pdfView() {
  const m = await bundle('pdf', `export * as PDF from '@/lib/plans-pdf'`)
  const html = m.PDF.buildPlansPdfHtml.length >= 1 ? m.PDF.buildPlansPdfHtml(GB) : m.PDF.buildPlansPdfHtml()
  const t = textOf(html)
  t.text = genDate(t.text)
  return t
}
// The PDF stamps the day it was made — "Generated 2026-10-09" (ISO, from plans-pdf.ts). Both sides are read
// with the stamp taken out, so the snapshot stays valid tomorrow. (The old pattern looked for "9 October
// 2026", which the PDF has never printed, so a run on any day but the capture day failed on the date.)
function genDate(text) {
  return text.replace(/Generated (?:[0-9]{1,2} [A-Za-z]+ [0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/g, 'Generated <date>')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · MANAGE → BILLING, every plan, matrix open, both upgrade targets, prices on and suppressed
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const CS_PROVIDER = 'components/CountrySettingsProvider.tsx'
const hasProvider = () => fs.existsSync(path.join(REPO, CS_PROVIDER))
function withProviders(m, hidePricing, el) {
  const R = React()
  let tree = R.createElement(m.PricingPolicyProvider, { hidePricing }, el)
  if (m.CountrySettingsProvider) tree = R.createElement(m.CountrySettingsProvider, { settings: GB }, tree)
  return tree
}
const PAGE_FILE = 'app/manage/[token]/page.tsx'
const providerExports = () => `export { PricingPolicyProvider } from '@/components/PricingPolicy'\n`
  + (hasProvider() ? `export { CountrySettingsProvider } from '@/components/CountrySettingsProvider'\n` : '')

async function billingView(published) {
  const out = {}
  for (const target of ['pro', 'max']) {
    const m = await bundle(`billing-${published}-${target}`, `export * from '@/app/manage/[token]/page'\n` + providerExports(), {
      define: { 'process.env.NEXT_PUBLIC_PRICING_PUBLISHED': published ? '"true"' : '"false"' },
      patches: [
        { file: PAGE_FILE, from: 'const [showMatrix, setShowMatrix] = useState(false)', to: 'const [showMatrix, setShowMatrix] = useState(true)' },
        { file: PAGE_FILE, from: 'const [showUpgradeModal, setShowUpgradeModal] = useState(false)', to: 'const [showUpgradeModal, setShowUpgradeModal] = useState(true)' },
        { file: PAGE_FILE, from: "const [upgradeTarget, setUpgradeTarget] = useState<'pro' | 'max'>('max')", to: `const [upgradeTarget, setUpgradeTarget] = useState<'pro' | 'max'>('${target}')` },
        { file: PAGE_FILE, append: 'export { BillingTab }' },
      ],
    })
    for (const plan of ['trial', 'starter', 'pro', 'max']) {
      for (const hide of [false, true]) {
        const truck = { id: 'test-truck', name: 'Pizza Kitchen', plan, trial_expires_at: null, country: 'GB', currency: 'GBP', hide_pricing: hide }
        out[`${plan}|target=${target}|hide=${hide}`] = textOf(renderStatic(withProviders(m, hide, React().createElement(m.BillingTab, { truck }))))
      }
    }
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · MANAGE → PAYMENTS, loaded
// ══════════════════════════════════════════════════════════════════════════════════════════════════
async function paymentsView() {
  const m = await bundle('payments', `export * from '@/components/manage/PaymentsTab'\n` + providerExports(), {
    patches: [{ file: 'components/manage/PaymentsTab.tsx', from: 'const [loading, setLoading] = useState(true)', to: 'const [loading, setLoading] = useState(false)' }],
  })
  const out = {}
  for (const plan of ['starter', 'pro', 'max', 'trial']) {
    out[plan] = textOf(renderStatic(withProviders(m, false, React().createElement(m.PaymentsTab, { token: 'harness', plan, showToast: () => {} }))))
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · ADMIN — the plan matrix (features tab) and one truck's edit modal
// ══════════════════════════════════════════════════════════════════════════════════════════════════
async function adminView() {
  const A = 'app/admin/page.tsx'
  const truck = {
    id: 'test-truck', slug: 'test-kitchen', name: 'Pizza Kitchen', plan: 'pro', country: 'GB', currency: 'GBP',
    operator_id: null, is_active: true, feature_overrides: {}, trial_expires_at: null, lifetime_discount_pct: 20,
    lifetime_discount_note: 'harness', hide_pricing: false, created_at: '2026-10-01T00:00:00Z',
  }
  const m = await bundle('admin', `export { default as AdminPage } from '@/app/admin/page'`, {
    define: { 'process.env.NEXT_PUBLIC_PRICING_PUBLISHED': '"true"' },
    patches: [
      { file: A, from: 'const [checkingSession, setCheckingSession] = useState(true)', to: 'const [checkingSession, setCheckingSession] = useState(false)' },
      { file: A, from: "const [adminTab, setAdminTab] = useState<AdminTab>('trucks')", to: "const [adminTab, setAdminTab] = useState<AdminTab>('features')" },
      { file: A, from: 'const [editingTruck, setEditingTruck] = useState<AdminTruck | null>(null)', to: `const [editingTruck, setEditingTruck] = useState<AdminTruck | null>(${JSON.stringify(truck)} as any)` },
      // After the move only: the settings the admin API returns, pre-loaded.
      { file: A, optional: true, from: 'const [countrySettings, setCountrySettings] = useState<Record<string, CountrySettings>>({})', to: `const [countrySettings, setCountrySettings] = useState<Record<string, CountrySettings>>({ GB: ${JSON.stringify(GB)} } as any)` },
    ],
  })
  const t = textOf(renderStatic(React().createElement(m.AdminPage)))
  return t
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 5b · /compare — the RESULTS, which the initial render does not show (they follow the questions)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
async function compareView() {
  const C = 'app/compare/CostComparison.tsx'
  const SYS = v => ({ file: C, from: "useState<'yes' | 'no' | null>(null)", to: `useState<'yes' | 'no' | null>('${v}')` })
  const STAFF = n => ({ file: C, from: 'useState<1 | 2 | null>(null)', to: `useState<1 | 2 | null>(${n})` })
  const TRUCKS = n => ({ file: C, from: 'const [trucks, setTrucks] = useState(1)', to: `const [trucks, setTrucks] = useState(${n})` })
  const GMV = n => ({ file: C, from: 'useState(2500)', to: `useState(${n})` })
  // 🔴 Part C: the boxes start EMPTY now. To compare the RESULTS like for like with the snapshot (taken when
  // the page prefilled 4.5% + 20p), the operator types those same figures. The empty default itself is
  // proved by the /compare page capture and by compare-no-system.cjs.
  const TYPED = [
    { file: C, from: "const [feePctRaw, setFeePctRaw] = useState('')", to: "const [feePctRaw, setFeePctRaw] = useState('4.5')" },
    { file: C, from: "const [feePenceRaw, setFeePenceRaw] = useState('')", to: "const [feePenceRaw, setFeePenceRaw] = useState('20')" },
  ]
  const cases = {
    'yes|staff=1|trucks=1|gmv=2500': [SYS('yes'), STAFF(1)],
    'yes|staff=2|trucks=3|gmv=6000': [SYS('yes'), STAFF(2), TRUCKS(3), GMV(6000)],
    'no|staff=1|trucks=1|gmv=2500': [SYS('no'), STAFF(1)],
    'no|staff=1|trucks=1|gmv=1000': [SYS('no'), STAFF(1), GMV(1000)],
  }
  const out = {}
  for (const [k, patches] of Object.entries(cases)) {
    const m = await bundle(`compare-${Object.keys(out).length}`, `export { default as CostComparison } from '@/app/compare/CostComparison'`, { patches: [...patches, ...TYPED] })
    out[k] = textOf(renderStatic(React().createElement(m.CostComparison, { settings: GB })))
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 6 · THE PUBLIC PAGES, THROUGH THE REAL LOADER (dev server, HatchGrab host)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
function getLocal(p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: 3000, path: p, headers: { Host: 'www.hatchgrab.com' }, timeout: 180000 }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', d => { body += d }); res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject); req.on('timeout', () => { req.destroy(new Error('timeout')) })
  })
}
async function pagesView() {
  const out = {}
  for (const p of ['/', '/features', '/compare']) {
    const r = await getLocal(p)
    if (r.status !== 200) throw new Error(`${p} returned ${r.status} from the dev server`)
    const t = textOf(r.body)
    t.text = t.text.replace(/© ?[0-9]{4}/g, '© <year>')
    out[p] = t
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 7 · THE FORMATTER IN EVERY ENGINE THAT RUNS IT (HG_BROWSERS=1 — needs local Chromium and WebKit)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE MANUAL'S V11.38 WARNING, MEASURED RATHER THAN AVOIDED: "a locale formatter is not deterministic
// across runtimes" — a trimmed-ICU build prints "£1500" where a full one prints "£1,500". lib/money-format.ts
// is built on Intl, so the SAME calls are made in Node (the server render) and in Chromium and WebKit (the
// client render, i.e. hydration) and every string must agree. A disagreement would show as a hydration
// mismatch on every price.
const FORMAT_CALLS = `[
  ['perMonth GB 2900', M.perMonthLabel(2900, GB)], ['perMonth GB 2950', M.perMonthLabel(2950, GB)],
  ['perMonth GB month', M.perMonthLabel(4900, GB, 'month')], ['whole GB 150000', M.formatWholeAmount(150000, GB)],
  ['whole GB 200000', M.formatWholeAmount(200000, GB)], ['pct 0.99', M.pctLabel(0.99, GB)], ['pct 1.5', M.pctLabel(1.5, GB)],
  ['fee GB online', M.feeLabel({ pct: 1.5, fixedMinor: 20 }, GB)], ['fee GB in person', M.feeLabel({ pct: 1.4, fixedMinor: 10 }, GB)],
  ['small GB 10', M.smallFeeLabel(10, GB)], ['symbol GB', M.currencySymbol(GB)],
  ['perMonth US 2900', M.perMonthLabel(2900, US)], ['whole US 150000', M.formatWholeAmount(150000, US)],
  ['fee US online', M.feeLabel({ pct: 2.9, fixedMinor: 30 }, US)], ['small US 5', M.smallFeeLabel(5, US)],
  ['symbol US', M.currencySymbol(US)], ['pct US 2.7', M.pctLabel(2.7, US)],
]`
async function formatterView() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const js = esbuild.buildSync({ entryPoints: [path.join(REPO, 'lib/money-format.ts')], bundle: true, write: false,
    format: 'iife', globalName: 'M', target: 'safari15' }).outputFiles[0].text
  const run = `(() => { ${js}; const GB = { currency: 'GBP', locale: 'en-GB' }; const US = { currency: 'USD', locale: 'en-US' }; return ${FORMAT_CALLS} })()`
  const out = { node: eval(run) }   // eslint-disable-line no-eval
  const pw = require('playwright')
  for (const engine of ['chromium', 'webkit']) {
    const b = await pw[engine].launch()
    try { const page = await b.newPage(); out[engine] = await page.evaluate(run) } finally { await b.close() }
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// COMPARE
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE ALLOWED DIFFERENCES, NAMED — Part B's one and Part C's two, and nothing else:
//   1. Part B  · in-person card wording   " on UK and EEA cards"                  → " on UK cards"
//   2. Part C  · Payments, both places    "Cards issued outside the UK and EEA cost more." → "Other cards may cost more."
//   3. Part C  · /compare's fee boxes start EMPTY (no competitor prefill) with neutral placeholders —
//                handled on the `attrs` arrays below, because it is an input value, not text.
const ALLOWED_FROM = ' on UK and EEA cards'
const ALLOWED_TO = ' on UK cards'
const TEXT_RULES = [
  [ALLOWED_FROM, ALLOWED_TO],
  ['Cards issued outside the UK and EEA cost more.', 'Other cards may cost more.'],
  // 3 (its one text consequence) · with the fee box EMPTY, /compare's "their own fee" explanation — which
  // exists only when a typed all-in rate exceeds card processing — has nothing to explain, so it is absent.
  [/ Card processing of [0-9.]+ ?% \+ [0-9]+ ?p is inside that, and you'd pay it anywhere\. Their own fee is [0-9.]+ ?%\./g, ''],
]
// ⚠️ NOT A WORDING CHANGE, AND NAMED SEPARATELY: Part C item 1 adds a "Countries" tab to Admin's tab bar.
// It is the brief's own deliverable, it appears ONLY in the admin render, and only as that one label right
// after "Templates" — so the admin text is compared with exactly that label taken out, and must then be
// byte-identical (or differ only by the wording rules above).
const ADMIN_NEW_TAB = ' 🌍 Countries'
// ⚠️ RE-PINNED (Language Phase 1d Part 2): Manage › Billing and Manage › Payments moved their words into messages/
// (`manageBilling`, `managePayments`), and Part 2 named three kinds of change there — NOTHING ELSE is excused, and each
// applies ONLY inside its own section (the billing renders, the payments renders):
//   (a) GB wrong-English fixes, each a whole sentence (or the static part of one) as it was and as it is, listed below
//       sentence by sentence — straight ' → ’, and the trial note's " - " → " — ". Each `to` is checked against the
//       en-GB catalogue (it must be the key's text now) and each `from` against Part 2's as-moved record
//       (scripts/fixtures/language-phase-1d2-gb-moved.json), so this list cannot excuse a sentence nobody named;
//   (b) named code change 1d2-billing-plan-header (scripts/_lp1d2-named.cjs): the plan comparison's column header prints
//       the plan's NAME from PLAN_META instead of its id ("starter" → "Starter"; the header is CSS-uppercased either
//       way). Only a header followed by its own price cell ("<id> <price> per truck / month") is touched, and the names
//       come from the modules section of this same run (PLAN_META), not typed here.
//   The mailto body (an `attrs` leaf) carries fix (a)'s "I'd" too, so the billing `attrs` comparison applies (a) as well.
const LP1D2_RULES = {
  billing: [
    ['manageBilling.notStarted.body', 'You choose which event starts your free trial - until then, nothing is counting down.', 'You choose which event starts your free trial — until then, nothing is counting down.'],
    ['manageBilling.upgradeModal.body', "We're setting up automated billing. To upgrade now, drop us a message and we'll get you set up within 24 hours.", 'We’re setting up automated billing. To upgrade now, drop us a message and we’ll get you set up within 24 hours.'],
    ['manageBilling.upgradeModal.mailBody', "Hi, I'd like to upgrade ", 'Hi, I’d like to upgrade '],
  ],
  payments: [
    ['managePayments.state.not_connected.body', "Takes about 10 minutes. You'll need your bank details and ID.", 'Takes about 10 minutes. You’ll need your bank details and ID.'],
    ['managePayments.online.feeLine', "HatchGrab's own fee on online orders depends on your plan — see Billing.", 'HatchGrab’s own fee on online orders depends on your plan — see Billing.'],
    ['managePayments.walkUp.ownTerminalHelp', "Nothing to set up — only your provider's own fees apply.", 'Nothing to set up — only your provider’s own fees apply.'],
    ['managePayments.trialNote', "Setting this up doesn't start your subscription or charge you anything today. It's how your customers pay you — your plan is separate.", 'Setting this up doesn’t start your subscription or charge you anything today. It’s how your customers pay you — your plan is separate.'],
  ],
}
let SECTION = ''          // the section being compared (set by the main loop), so (a) and (b) stay in their own section
let PLAN_NAMES = null     // { trial: 'Trial', … } from this run's PLAN_META
const lp1d2Rules = () => LP1D2_RULES[SECTION] || []
function lp1d2Apply(x) {
  for (const [, from, to] of lp1d2Rules()) x = x.split(from).join(to)
  if (SECTION === 'billing' && PLAN_NAMES) {
    x = x.replace(/(^| )(trial|starter|pro|max)( (?:Free|TBC|£[0-9,.]+\/mo) per truck \/ month)/g, (m, a, p, c) => a + PLAN_NAMES[p] + c)
  }
  return x
}
/** The (a) list's own proof: every `to` is the en-GB key's text now and every `from` its as-moved text (both may be the
 *  static part of a message with {placeholders}). Returns the rules that fail. */
function lp1d2RulesProved() {
  const gb = JSON.parse(read('messages/en-GB.json'))
  const moved = JSON.parse(read('scripts/fixtures/language-phase-1d2-gb-moved.json'))
  const get = k => k.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), gb)
  return Object.values(LP1D2_RULES).flat().filter(([k, from, to]) => !(typeof get(k) === 'string' && get(k).includes(to.trimEnd())
    && typeof moved[k] === 'string' && moved[k].includes(from.trimEnd())))
}
const allowedChange = (b, a, at = '') => {
  if (at.startsWith('admin') || at === '.text' && typeof a === 'string' && a.includes('✉️ Templates' + ADMIN_NEW_TAB)) {
    if (typeof a === 'string' && a.includes('✉️ Templates' + ADMIN_NEW_TAB)) a = a.replace('✉️ Templates' + ADMIN_NEW_TAB, '✉️ Templates')
    if (a === b) return true
  }
  if (typeof b !== 'string' || typeof a !== 'string') return false
  let x = b
  for (const [from, to] of TEXT_RULES) x = from instanceof RegExp ? x.replace(from, to) : x.split(from).join(to)
  x = lp1d2Apply(x)   // ⚠️ RE-PINNED (Language Phase 1d Part 2): only in billing / payments — see LP1D2_RULES
  return x !== b && x === a
}
// 3 · the prefill: the two boxes held "4.5" and "20" and now hold "", and they gained two placeholders.
const NEW_PLACEHOLDERS = ['placeholder=Your rate', 'placeholder=Your fee']
// Either the boxes are empty (the page's own default) or the operator typed the old figures back in (the
// compare section does, to compare results like for like); the two new placeholders are the only addition.
const attrsAllowed = (b, a) => {
  if (!Array.isArray(b) || !Array.isArray(a)) return false
  const after = JSON.stringify(a.filter(x => !NEW_PLACEHOLDERS.includes(x)))
  const emptied = JSON.stringify(b.map(x => (x === 'value=4.5' || x === 'value=20') ? 'value=' : x))
  // ⚠️ RE-PINNED (Language Phase 1d Part 2): + the billing mailto body's named "I'd" → "I’d" (LP1D2_RULES; billing only).
  const fixed = JSON.stringify(b.map(x => typeof x === 'string' ? lp1d2Apply(x) : x))
  return after === JSON.stringify(b) || after === emptied || (lp1d2Rules().length > 0 && fixed !== JSON.stringify(b) && JSON.stringify(a) === fixed)
}

// ⚠️ FOR THE DEV-SERVER PAGES ONLY: space before closing punctuation is not compared. React's SSR puts a
// `<!-- -->` separator between adjacent text nodes, which textOf reads as a space, so where a literal
// became an interpolation the old page reads "£2,000." and the new one "£2,000 ." — the browser renders
// neither space. Measured when this was added: the landing differed by exactly four such spaces and was
// otherwise byte-identical. Everything else — every word, figure and symbol — is compared.
const normPages = v => typeof v === 'string' ? v.replace(/\s+([.,;:!?)])/g, '$1').replace(/\(\s+/g, '(') : v

function diff(before, after, at = '', out = { same: 0, allowed: [], bad: [] }, norm = v => v) {
  if (at.endsWith('.attrs')) {
    if (JSON.stringify(before) === JSON.stringify(after)) out.same++
    else if (attrsAllowed(before, after)) out.allowed.push(at)
    else out.bad.push({ at, before, after })
    return out
  }
  if (typeof before !== 'object' || before === null || typeof after !== 'object' || after === null) {
    before = norm(before); after = norm(after)
    if (JSON.stringify(before) === JSON.stringify(after)) out.same++
    else if (allowedChange(before, after, at)) out.allowed.push(at)
    else out.bad.push({ at, before, after })
    return out
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const k of keys) {
    if (at === '' && k === 'api') continue
    if (!(k in after)) { out.bad.push({ at: `${at}.${k}`, before: before[k], after: '(missing)' }); continue }
    if (!(k in before)) { out.bad.push({ at: `${at}.${k}`, before: '(missing)', after: after[k] }); continue }
    diff(before[k], after[k], `${at}.${k}`, out, norm)
  }
  return out
}

;(async () => {
  const snap = { gb: GB, modules: await moduleView(), pdf: await pdfView(), billing: { published: await billingView(true), unpublished: await billingView(false) },
    payments: await paymentsView(), admin: await adminView(), compare: await compareView() }
  if (process.env.HG_PAGES === '1') snap.pages = await pagesView()

  if (CAPTURE) {
    fs.writeFileSync(path.resolve(CAPTURE), JSON.stringify(snap, null, 2))
    console.log(`captured (${snap.modules.api}) → ${CAPTURE}${snap.pages ? ' — with pages' : ' — WITHOUT pages (set HG_PAGES=1)'}`)
    return
  }

  const before = JSON.parse(read(BEFORE_FILE))
  if (before.pdf && typeof before.pdf.text === 'string') before.pdf.text = genDate(before.pdf.text)
  let fails = 0
  const sections = ['modules', 'pdf', 'billing', 'payments', 'admin', 'compare'].concat(snap.pages ? ['pages'] : [])
  // ⚠️ RE-PINNED (Language Phase 1d Part 2): the plan names for rule (b), from this run's PLAN_META.
  PLAN_NAMES = Object.fromEntries(Object.entries(snap.modules.PLAN_META).map(([p, m]) => [p, m.name]))
  for (const s of sections) {
    SECTION = s
    const d = diff(before[s], snap[s], '', undefined, s === 'pages' ? normPages : undefined)
    SECTION = ''
    const ok = d.bad.length === 0
    if (!ok) fails++
    console.log(`${ok ? '✓' : '✗'} ${s}: ${d.same} identical leaves, ${d.allowed.length} with an allowed change${ok ? '' : `, ${d.bad.length} DIFFERENT`}`)
    for (const a of d.allowed.slice(0, 6)) console.log(`    · allowed: ${a}`)
    if (d.allowed.length > 6) console.log(`    · allowed: … ${d.allowed.length - 6} more`)
    for (const b of d.bad.slice(0, 8)) console.log(`    ✗ ${b.at}\n        before: ${JSON.stringify(b.before).slice(0, 300)}\n        after:  ${JSON.stringify(b.after).slice(0, 300)}`)
  }
  if (!snap.pages) console.log('· pages: skipped — run with HG_PAGES=1 and the dev server on :3000 to prove the LIVE row')
  if (process.env.HG_BROWSERS === '1' && snap.modules.api === 'settings') {
    const f = await formatterView()
    const ref = JSON.stringify(f.node)
    const agree = ['chromium', 'webkit'].every(e => JSON.stringify(f[e]) === ref)
    const gbOk = f.node.find(x => x[0] === 'whole GB 150000')[1] === '£1,500' && f.node.find(x => x[0] === 'fee GB online')[1] === '1.5% + 20p'
    if (!agree || !gbOk) fails++
    console.log(`${agree && gbOk ? '✓' : '✗'} formatter: ${f.node.length} labels identical in Node, Chromium and WebKit${agree ? '' : ' — THEY DISAGREE'}`)
    for (const [k, v] of f.node) if (/US|symbol/.test(k)) console.log(`    · ${k}: ${v}`)
    if (!agree) for (const e of ['chromium', 'webkit']) console.log(`    ${e}: ${JSON.stringify(f[e])}`)
  } else console.log('· formatter: cross-engine check skipped — run with HG_BROWSERS=1')
  // The allowed change must actually have happened where the in-person rate is quoted, or the check is vacuous.
  const fn1 = (snap.modules.FOOTNOTES.find(f => f.number === '1') || {}).text || ''
  const happened = fn1.includes(ALLOWED_TO) && !fn1.includes(ALLOWED_FROM)
  const isAfter = snap.modules.api === 'settings'
  if (isAfter && !happened) { fails++; console.log('✗ the in-person wording did not change in footnote 1 — the one allowed difference is missing') }
  else if (isAfter) console.log('✓ allowed change 1 is present (footnote 1 reads "on UK cards")')
  // …and Part C's two, or the checks above are vacuous.
  const payText = Object.values(snap.payments).map(p => p.text).join(' ')
  const payOk = payText.includes('Other cards may cost more.') && !payText.includes('Cards issued outside')
  if (isAfter && !payOk) { fails++; console.log('✗ the Payments sentence did not change — allowed change 2 is missing') }
  else if (isAfter) console.log('✓ allowed change 2 is present (Payments: "Other cards may cost more.", both places)')
  // ⚠️ RE-PINNED (Language Phase 1d Part 2): the named Part 2 changes are PROVED and PRESENT, or the excuse is vacuous —
  // each sentence pair matches the catalogue (to = en-GB now, from = as moved), each `to` is in its section's render
  // and no `from` is, and the billing headers print the four PLAN_META names.
  {
    const unproved = lp1d2RulesProved()
    const flat = sec => JSON.stringify(snap[sec])
    const absent = Object.entries(LP1D2_RULES).flatMap(([sec, rules]) => rules.filter(([, from, to]) => !flat(sec).includes(to) || flat(sec).includes(from)).map(r => r[0]))
    const billingText = Object.values(snap.billing.published).map(v => v.text).join(' ')
    const headersOk = ['trial', 'starter', 'pro', 'max'].every(p => typeof PLAN_NAMES[p] === 'string' && PLAN_NAMES[p] !== p
      && new RegExp(` ${PLAN_NAMES[p]} (Free|TBC|£[0-9,.]+/mo) per truck / month`).test(billingText))
      && !/ (trial|starter|pro|max) (Free|TBC|£[0-9,.]+\/mo) per truck \/ month/.test(billingText)
    if (isAfter && (unproved.length || absent.length || !headersOk)) {
      fails++
      console.log(`✗ Language Phase 1d Part 2's named changes: unproved ${JSON.stringify(unproved.map(r => r[0]))} · not in the render ${JSON.stringify(absent)} · plan headers ${headersOk}`)
    } else if (isAfter) console.log(`✓ Language Phase 1d Part 2's named changes are proved against the catalogue and present (${Object.values(LP1D2_RULES).flat().length} GB sentence fixes; plan headers print PLAN_META names)`)
  }
  if (snap.pages) {
    const cmp = snap.pages['/compare'].attrs
    const emptyOk = !cmp.includes('value=4.5') && !cmp.includes('value=20') && NEW_PLACEHOLDERS.every(p => cmp.includes(p))
    if (!emptyOk) { fails++; console.log('✗ /compare still prefills a fee — allowed change 3 is missing') }
    else console.log('✓ allowed change 3 is present (/compare: both fee boxes empty, neutral placeholders)')
  }
  console.log(fails ? `\n🔴 ${fails} section(s) differ` : `\n✅ all sections identical except the three allowed changes (api: ${snap.modules.api})`)
  process.exit(fails ? 1 : 0)
})().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
