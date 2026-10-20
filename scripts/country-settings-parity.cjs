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
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): lib/plan-features.ts and lib/landing-table.ts are DELETED
  // and the display half of lib/features.ts (PLAN_META, planPrice, planMonthlyMinor) moved with them — unchanged, frozen —
  // into lib/legacy-pricing-display.ts. F, P and T all read that one file now; the values must be byte-identical.
  const LEGACY = fs.existsSync(path.join(REPO, 'lib/legacy-pricing-display.ts'))
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): lib/legacy-pricing-display.ts is DELETED too (named change B1,
  // STAGE B NAMED below). Its leaves (PLAN_META … PLAN_SUB, parity) have no module left to read; what remains of this
  // view is the money formatter's samples and the van add-on from the catalogue (A2), both still compared.
  if (!LEGACY && STAGE_B) {
    const mb = await bundle('modules', `
    export * as L from '@/lib/plans'
    export * as M from '@/lib/money-format'
  `)
    const money = { currency: GB.currency, locale: GB.locale }
    const v = { api: 'settings' }
    v.samples = {
      perMonth: [0, 2900, 2950, 4900, 999].map(n => mb.M.perMonthLabel(n, money)),
      allowance: [150000, 200000, 100000, 50000, 99900].map(n => mb.M.formatWholeAmount(n, money)),
      pct: [0.99, 1.5, 1.4, 1, 0, 4.5, 2.25, 12.5].map(n => mb.M.pctLabel(n, money)),
      fee: [[1.5, 20], [1.4, 10], [0, 5], [2.25, 99]].map(([pct, f]) => mb.M.feeLabel({ pct, fixedMinor: f }, money)),
    }
    v.VAN_ADDON_CATALOG = Object.fromEntries(CATALOG.plans.map(p => {
      const minor = mb.L.extraVanMonthlyMinor({ plan: p.key, trial_expires_at: null }, CATALOG, 'GB')
      return [p.key, minor > 0 ? { month: mb.M.perMonthLabel(minor, money, 'month'), mo: mb.M.perMonthLabel(minor, money) } : null]
    }))
    return v
  }
  const m = await bundle('modules', LEGACY ? `
    export * as F from '@/lib/legacy-pricing-display'
    export * as L from '@/lib/plans'
    ${fs.existsSync(path.join(REPO, 'lib/money-format.ts')) ? "export * as M from '@/lib/money-format'" : 'export const M = null'}
  ` : `
    export * as F from '@/lib/features'
    export * as P from '@/lib/plan-features'
    export * as T from '@/lib/landing-table'
    ${fs.existsSync(path.join(REPO, 'lib/money-format.ts')) ? "export * as M from '@/lib/money-format'" : 'export const M = null'}
  `)
  const { F, M, L } = m
  const P = LEGACY ? F : m.P, T = LEGACY ? F : m.T
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
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): findPlanParityViolations is DELETED (it compared the frozen
  // tier cells with tiered gates, and there are no tiered gates any more). Its BEFORE value was [] (no violation); with
  // nothing left to violate, [] is still the honest answer — so the leaf is kept and pinned to [].
  v.parity = typeof P.findPlanParityViolations === 'function' ? P.findPlanParityViolations() : []
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
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the van add-on is the truck's plan's
  // plan_prices.extra_van_monthly_minor now (lib/plans.ts extraVanMonthlyMinor, as the page calls it), on the SEEDED
  // catalogue (scripts/_plans-catalog-fixture.cjs). Starter / Max no longer exist; the plans are payg / pro / unlimited.
  // Recorded under VAN_ADDON_CATALOG and compared by NAME in STAGE_A_NAMED below (VAN_ADDON itself is that named change).
  if (L) {
    const cat = require('./_plans-catalog-fixture.cjs').seedCatalog(REPO)
    v.VAN_ADDON_CATALOG = Object.fromEntries(cat.plans.map(p => {
      const minor = L.extraVanMonthlyMinor({ plan: p.key, trial_expires_at: null }, cat, 'GB')
      return [p.key, minor > 0 ? { month: M.perMonthLabel(minor, money, 'month'), mo: M.perMonthLabel(minor, money) } : null]
    }))
    return v
  }
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
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): buildPlansPdfHtml(settings, catalog) — the PDF reads the plan
  // catalogue (the SEEDED one here). Its content is rewritten on purpose (named change B2, STAGE B NAMED below).
  const html = m.PDF.buildPlansPdfHtml.length >= 2 ? m.PDF.buildPlansPdfHtml(GB, CATALOG) : m.PDF.buildPlansPdfHtml.length >= 1 ? m.PDF.buildPlansPdfHtml(GB) : m.PDF.buildPlansPdfHtml()
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
// ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): Manage reads the plan catalogue from PlanCatalogProvider
// (usePlanCatalog throws without one). The renders are wrapped in it, on the SEEDED catalogue
// (scripts/_plans-catalog-fixture.cjs — parsed from supabase/migrations/20261024_plans.sql).
const STAGE_A = fs.existsSync(path.join(REPO, 'components/PlanCatalogProvider.tsx'))
const CATALOG = STAGE_A ? require('./_plans-catalog-fixture.cjs').seedCatalog(REPO) : null
// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): Stage B is present when the one plan table and the offer
// helpers exist (lib/plan-offer.ts, components/pricing/PlanTable.tsx). See STAGE B NAMED below.
const STAGE_B = fs.existsSync(path.join(REPO, 'lib/plan-offer.ts')) && fs.existsSync(path.join(REPO, 'components/pricing/PlanTable.tsx'))
function withProviders(m, hidePricing, el) {
  const R = React()
  let tree = R.createElement(m.PricingPolicyProvider, { hidePricing }, el)
  if (m.CountrySettingsProvider) tree = R.createElement(m.CountrySettingsProvider, { settings: GB }, tree)
  if (m.PlanCatalogProvider && CATALOG) tree = R.createElement(m.PlanCatalogProvider, { catalog: CATALOG }, tree)
  return tree
}
const PAGE_FILE = 'app/manage/[token]/page.tsx'
const providerExports = () => `export { PricingPolicyProvider } from '@/components/PricingPolicy'\n`
  + (hasProvider() ? `export { CountrySettingsProvider } from '@/components/CountrySettingsProvider'\n` : '')
  + (STAGE_A ? `export { PlanCatalogProvider } from '@/components/PlanCatalogProvider'\n` : '')
// ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): trucks hold public.plans keys now. Each BEFORE column's
// render is compared with the render of the plan that now stands in that column's place (the old key stays the
// snapshot key): trial → trial, starter → payg, pro → pro, max → unlimited.
const OLD_TO_NEW = { trial: 'trial', starter: 'payg', pro: 'pro', max: 'unlimited' }

async function billingView(published) {
  const out = {}
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): `showMatrix` is GONE (the comparison table always shows)
  // and the upgrade target is any public plan key (`useState<string>('')`). Same renders, the new state.
  if (STAGE_A) {
    for (const target of ['pro', 'max']) {
      const m = await bundle(`billing-${published}-${target}`, `export * from '@/app/manage/[token]/page'\n` + providerExports(), {
        define: { 'process.env.NEXT_PUBLIC_PRICING_PUBLISHED': published ? '"true"' : '"false"' },
        patches: [
          { file: PAGE_FILE, from: 'const [showUpgradeModal, setShowUpgradeModal] = useState(false)', to: 'const [showUpgradeModal, setShowUpgradeModal] = useState(true)' },
          { file: PAGE_FILE, from: "const [upgradeTarget, setUpgradeTarget] = useState<string>('')", to: `const [upgradeTarget, setUpgradeTarget] = useState<string>('${OLD_TO_NEW[target]}')` },
          { file: PAGE_FILE, append: 'export { BillingTab }' },
        ],
      })
      for (const plan of ['trial', 'starter', 'pro', 'max']) {
        for (const hide of [false, true]) {
          const truck = { id: 'test-truck', name: 'Pizza Kitchen', plan: OLD_TO_NEW[plan], trial_expires_at: null, country: 'GB', currency: 'GBP', hide_pricing: hide }
          out[`${plan}|target=${target}|hide=${hide}`] = textOf(renderStatic(withProviders(m, hide, React().createElement(m.BillingTab, { truck }))))
        }
      }
    }
    return out
  }
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
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): PaymentsTab takes `features` (a FeatureAccessView —
// Manage passes useFeatures(truck)), and shows the Pay at Hatch upgrade prompt only when the PLAN switches it off. Each
// column passes the view of its stand-in plan (OLD_TO_NEW) on the SEEDED catalogue: every seeded plan allows Pay at Hatch
// (payg's pay_at_hatch_allowed is TRUE since 20261025), so no prompt appears and the words must stay identical.
const STAGE_A2 = fs.existsSync(path.join(REPO, 'lib/useFeatures.ts'))
async function paymentsView() {
  const m = await bundle('payments', `export * from '@/components/manage/PaymentsTab'\n` + providerExports()
    + (STAGE_A2 ? `export { featureAccessView } from '@/lib/useFeatures'\n` : ''), {
    patches: [{ file: 'components/manage/PaymentsTab.tsx', from: 'const [loading, setLoading] = useState(true)', to: 'const [loading, setLoading] = useState(false)' }],
  })
  const out = {}
  for (const plan of ['starter', 'pro', 'max', 'trial']) {
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the prop `plan` is now `onTrial` (the effective plan's
    // isTrial) — the trial column passes true, the others false. The words must be identical.
    const props = STAGE_A ? { token: 'harness', onTrial: plan === 'trial', showToast: () => {} } : { token: 'harness', plan, showToast: () => {} }
    if (STAGE_A2) props.features = m.featureAccessView({ plan: OLD_TO_NEW[plan], trial_expires_at: null, feature_overrides: {}, country: 'GB' }, CATALOG, 'GB')
    out[plan] = textOf(renderStatic(withProviders(m, false, React().createElement(m.PaymentsTab, props))))
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
      // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the plans the admin API returns, pre-loaded (seed).
      // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the catalogue state's empty default gained
      // `features: []` (PlanCatalog.features); CATALOG (the seed fixture) now carries plan_features as well.
      ...(STAGE_A ? [{ file: A, from: STAGE_A2 ? 'const [plans, setPlans] = useState<PlanCatalog>({ plans: [], prices: [], features: [] })' : 'const [plans, setPlans] = useState<PlanCatalog>({ plans: [], prices: [] })', to: `const [plans, setPlans] = useState<PlanCatalog>(${JSON.stringify(CATALOG)} as any)` }] : []),
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
  const TRUCKS = n => ({ file: C, from: 'const [trucks, setTrucks] = useState(1)', to: `const [trucks, setTrucks] = useState(${n})` })
  const GMV = n => ({ file: C, from: 'useState(2500)', to: `useState(${n})` })
  // 🔴 Part C: the boxes start EMPTY now. To compare the RESULTS like for like with the snapshot (taken when
  // the page prefilled 4.5% + 20p), the operator types those same figures. The empty default itself is
  // proved by the /compare page capture and by compare-no-system.cjs.
  const TYPED = [
    { file: C, from: "const [feePctRaw, setFeePctRaw] = useState('')", to: "const [feePctRaw, setFeePctRaw] = useState('4.5')" },
    { file: C, from: "const [feePenceRaw, setFeePenceRaw] = useState('')", to: "const [feePenceRaw, setFeePenceRaw] = useState('20')" },
  ]
  // ⚠️ RE-PINNED (compare-tidy, 20 October 2026): the staff question is removed with its `staff` useState
  // (`useState<1 | 2 | null>(null)` no longer exists), so no case sets it. The keys keep their BEFORE names (`staff=…`) so
  // each render is still compared with its own snapshot; the staff answer is simply no longer an input (C1, below).
  const cases = {
    'yes|staff=1|trucks=1|gmv=2500': [SYS('yes')],
    'yes|staff=2|trucks=3|gmv=6000': [SYS('yes'), TRUCKS(3), GMV(6000)],
    'no|staff=1|trucks=1|gmv=2500': [SYS('no')],
    'no|staff=1|trucks=1|gmv=1000': [SYS('no'), GMV(1000)],
  }
  const out = {}
  for (const [k, patches] of Object.entries(cases)) {
    const m = await bundle(`compare-${Object.keys(out).length}`, `export { default as CostComparison } from '@/app/compare/CostComparison'`, { patches: [...patches, ...TYPED] })
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): CostComparison takes the plan catalogue (`catalog`, the
    // SEEDED one); the plan it suggests is the cheapest at the volume (named change B4, STAGE B NAMED below).
    out[k] = textOf(renderStatic(React().createElement(m.CostComparison, STAGE_B ? { settings: GB, catalog: CATALOG } : { settings: GB })))
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
// ══ ⚠️ RE-PINNED (Language Phase 1e): the plan rows, plan descriptions, footnotes, the PDF and /compare moved their words
// into messages/ (planFeatures, planMeta, plansPdf, compare) with NAMED GB wrong-English fixes. Those fixes are applied
// here as sentence-piece rules DERIVED from scripts/fixtures/language-phase-1e-gb-named.json — the list
// scripts/language-phase-1e.cjs proves equal to the actual en-GB diff (F's words → A's words) — so this list cannot excuse
// a sentence nobody named. Each fix is split at its ICU arguments and tags; every literal piece that differs is one rule
// (as moved → fixed). They apply in every section (all of them render these shared words). Plus ONE named code change:
//   1e-transaction-row-id   the three fee rows carry their id first (`walkup`, `onlineIncluded`, `feeAfter`) — read by id;
//   1e-section-id           the three feature sections carry their id (`starter`, `pro`, `max`) — words by id.
const LP1E_ROW_IDS = ['walkup', 'onlineIncluded', 'feeAfter']
const LP1E_RULES = (() => {
  const file = 'scripts/fixtures/language-phase-1e-gb-named.json'
  if (!fs.existsSync(path.join(REPO, file))) return []
  const named = JSON.parse(read(file))
  const pieces = s => s.split(/\{[^{}]*\}|<[^>]+>/g).map(x => x.replace(/\s+/g, ' ').trim())
  const out = []
  for (const [k, { before, after }] of Object.entries(named)) {
    if (typeof before !== 'string' || typeof after !== 'string') continue
    const b = pieces(before), a = pieces(after)
    if (b.length !== a.length) { out.push([k, before.replace(/\s+/g, ' ').trim(), after.replace(/\s+/g, ' ').trim()]); continue }
    b.forEach((x, i) => { if (x !== a[i] && x) out.push([k, x, a[i]]) })
  }
  return out.sort((x, y) => y[1].length - x[1].length)   // longest first, so a whole sentence wins over a piece of it
})()
const lp1eApply = x => { for (const [, from, to] of LP1E_RULES) x = x.split(from).join(to); return x }
const allowedChange = (b, a, at = '') => {
  if (at.startsWith('admin') || at === '.text' && typeof a === 'string' && a.includes('✉️ Templates' + ADMIN_NEW_TAB)) {
    if (typeof a === 'string' && a.includes('✉️ Templates' + ADMIN_NEW_TAB)) a = a.replace('✉️ Templates' + ADMIN_NEW_TAB, '✉️ Templates')
    if (a === b) return true
  }
  if (typeof b !== 'string' || typeof a !== 'string') return false
  let x = b
  for (const [from, to] of TEXT_RULES) x = from instanceof RegExp ? x.replace(from, to) : x.split(from).join(to)
  x = lp1d2Apply(x)   // ⚠️ RE-PINNED (Language Phase 1d Part 2): only in billing / payments — see LP1D2_RULES
  x = lp1eApply(x)    // ⚠️ RE-PINNED (Language Phase 1e): the named marketing GB fixes — see LP1E_RULES
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
    // ⚠️ RE-PINNED (Language Phase 1e): named code change 1e-transaction-row-id — the fee rows gained their id, nothing else.
    if (!(k in before) && k === 'id' && /\.TRANSACTION_ROWS\.([0-2])$/.test(at) && after[k] === LP1E_ROW_IDS[Number(/\.([0-2])$/.exec(at)[1])]) { out.allowed.push(`${at}.${k}`); continue }
    //   1e-section-id   …and the three feature sections carry their id (`starter`, `pro`, `max` — PlanSectionId), nothing else.
    if (!(k in before) && k === 'id' && /\.FEATURE_SECTIONS\.([0-2])$/.test(at) && after[k] === ['starter', 'pro', 'max'][Number(/\.([0-2])$/.exec(at)[1])]) { out.allowed.push(`${at}.${k}`); continue }
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): named code change stageA-footnote-id — the five footnotes
    // carry their id (walkupFees / onlineFees / kitchenDevice / autoReplies / printing; PRICE_FOOTNOTE_ID reads it), nothing else.
    if (!(k in before) && k === 'id' && STAGE_A && /\.FOOTNOTES\.([0-4])$/.test(at) && after[k] === STAGE_A_FOOTNOTE_IDS[Number(/\.([0-4])$/.exec(at)[1])]) { out.allowed.push(`${at}.${k}`); continue }
    if (!(k in before)) { out.bad.push({ at: `${at}.${k}`, before: '(missing)', after: after[k] }); continue }
    diff(before[k], after[k], `${at}.${k}`, out, norm)
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026) — THE STAGE A NAMED DIFFERENCES (docs/plans-data-model-report.md)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Plans became data (public.plans / public.plan_prices). The frozen display copy (lib/legacy-pricing-display.ts) keeps
// every PUBLIC price surface byte-identical — so modules, the PDF, Payments, /compare AND Billing's comparison table are
// still compared leaf for leaf. What changed ON PURPOSE, and is therefore compared BY NAME, not byte for byte:
//   A1 modules.FOOTNOTES[n].id         the footnotes gained ids (see diff above);
//   A2 modules.VAN_ADDON               the van add-on is the plan's plan_prices.extra_van_monthly_minor (VAN_ADDON_CATALOG),
//                                      checked against the seeded rows; Pro's price (£29/month) must be unchanged;
//   A3 billing, OUTSIDE the table      the plan card is one data-driven card for every plan (catalogue name, plan_prices
//                                      price, "Change your plan" buttons for the other public plans), the ▲ Hide toggle is
//                                      gone (the table always shows), and the switch modal + URL-encoded mailto are new.
//                                      The comparison TABLE + footnotes (header row → footnote 5) is compared leaf for leaf;
//   A4 admin                           the plan matrix is replaced by the plans table; the truck modal's plan selector lists
//                                      the catalogue plans and gains the promotional-price block. The tab bar and the rest
//                                      of the truck modal (text and attrs) are compared exactly;
//   A5 LP1D2 rules upgradeModal.body / mailBody   the modal's words were rewritten ("switch"), and the modal is part of A3.
const STAGE_A_FOOTNOTE_IDS = ['walkupFees', 'onlineFees', 'kitchenDevice', 'autoReplies', 'printing']
const STAGE_A_RETIRED_LP1D2 = ['manageBilling.upgradeModal.body', 'manageBilling.upgradeModal.mailBody']
const MATRIX_END = ['Compatible printers listed in our help centre.', 'Get in touch for the list of compatible printers.']
/** Billing's comparison table + footnotes, as text: from the first column header to the end of footnote 5. */
function matrixOf(text) {
  const m = /(?:^| )((?:trial|Trial|starter|Starter) Free per truck \/ month)/.exec(text)
  const ends = MATRIX_END.map(e => [text.indexOf(e), e]).filter(([i]) => i >= 0)
  if (!m || !ends.length) return null
  const [i, e] = ends[0]
  return text.slice(m.index + (m[0].startsWith(' ') ? 1 : 0), i + e.length)
}
const ADMIN_PROMO_ATTRS = ['placeholder=e.g. 49', 'value=', 'value=', 'placeholder=e.g. Launch offer', 'value=']
const ADMIN_PROMO_TEXT = / Promotional monthly price Price a month Until \(inclusive\) Note Standard price on [^:]+: [^ ]+ a month\. Leave empty for the standard price\./
function adminParts(t, isAfter) {
  const text = isAfter ? t.text.replace('✉️ Templates' + ADMIN_NEW_TAB, '✉️ Templates') : t.text
  const tabsEnd = text.indexOf('✉️ Templates') + '✉️ Templates'.length
  const tail = text.slice(text.indexOf(' Active Hide pricing'))
  let attrs = t.attrs
  if (isAfter) { const i = attrs.indexOf(ADMIN_PROMO_ATTRS[0]); if (i >= 0 && JSON.stringify(attrs.slice(i, i + 5)) === JSON.stringify(ADMIN_PROMO_ATTRS)) attrs = [...attrs.slice(0, i), ...attrs.slice(i + 5)] }
  return { tabs: text.slice(0, tabsEnd), modalTail: isAfter ? tail.replace(ADMIN_PROMO_TEXT, '') : tail, attrs }
}
/** The two sides of one section, with the named Stage A parts taken out (they are checked in stageAChecks). */
function stageAView(sec, b, a) {
  if (!STAGE_A) return [b, a]
  if (STAGE_B) { const r = stageBView(sec, b, a); if (r) return r }
  if (sec === 'modules') {
    const b2 = { ...b }, a2 = { ...a }; delete b2.VAN_ADDON; delete a2.VAN_ADDON_CATALOG; return [b2, a2]
  }
  if (sec === 'billing') {
    const map = (x) => Object.fromEntries(Object.entries(x).map(([pub, renders]) =>
      [pub, Object.fromEntries(Object.entries(renders).map(([k, v]) => [k, { matrix: matrixOf(v.text) }]))]))
    return [map(b), map(a)]
  }
  if (sec === 'admin') return [adminParts(b, false), adminParts(a, true)]
  return [b, a]
}
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026) — THE STAGE B NAMED DIFFERENCES (docs/pricing-pages-report.md)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Stage B deleted the frozen display copy and drew every public price surface from the plan catalogue. What changed ON
// PURPOSE, and is therefore checked BY NAME (stageBChecks) instead of byte for byte — nothing else is excused:
//   B1 modules                       lib/legacy-pricing-display.ts is DELETED: its leaves (PLAN_META … PLAN_SUB, parity)
//                                    are retired. The formatter samples are still compared leaf for leaf; the van add-on
//                                    stays named change A2;
//   B2 pdf                           the plans PDF is rewritten: banner, cards, cheapest bar, THE plan table, footnote;
//   B3 billing, the table            Billing's frozen matrix + five footnotes are replaced by <PlanTable> + the pricing
//                                    footnote — the SAME table text the PDF prints. Outside the table, A3 still holds;
//   B4 compare                       the calculator suggests the plan cheapest at the volume (not the staff answer), with
//                                    the new fee-shape words; the free-months default is the trial's months (3).
// Payments and admin are still compared exactly as before (Stage A's named admin parts aside).
const STAGE_B_RETIRED_MODULE_KEYS = ['PLAN_META', 'PLAN_PRICES', 'PLAN_DESCRIPTIONS', 'PLAN_MONTHLY_MINOR', 'PLAN_ONLINE_ALLOWANCE',
  'PLATFORM_FEE_PCT', 'PLATFORM_FEE_LABEL', 'PLAN_ALLOWANCES', 'CARD_FEES', 'CARD_FEE_ONLINE_LABEL', 'CARD_FEE_IN_PERSON_LABEL',
  'TAP_TO_PAY_SURCHARGE_LABEL', 'TRANSACTION_ROWS', 'FOOTNOTES', 'FEATURE_SECTIONS', 'PLAN_PRICE_LABEL', 'PLAN_SUB', 'parity']
const NAMED_B = name => ({ named: name })
function stageBView(sec, b, a) {
  if (sec === 'modules') {
    const b2 = { ...b }, a2 = { ...a }
    for (const k of STAGE_B_RETIRED_MODULE_KEYS) delete b2[k]
    delete b2.VAN_ADDON; delete a2.VAN_ADDON_CATALOG   // A2, as in Stage A
    return [b2, a2]
  }
  if (sec === 'pdf') return [NAMED_B('B2'), NAMED_B('B2')]
  if (sec === 'billing') return [NAMED_B('B3'), NAMED_B('B3')]
  if (sec === 'compare') {
    // B4 — only the middle (from "We suggest" to the results) is named; the questions before it and the small print after
    // it are still compared (with the earlier named rules), and the attrs too, with "Months free" BEFORE read as the trial.
    // ⚠️ RE-PINNED (compare-tidy, 20 October 2026): C1 — named transforms, asserted in compareTidyChecks: BEFORE's head
    // loses the staff card (" 3 How many people work the van? One Two or more"); AFTER's head loses the orders card, which
    // now sits BEFORE "We suggest" (the panel moved into it) and is checked by name. What remains of both heads (intro,
    // questions 1 and 2) is still compared byte for byte.
    const map = (x, isBefore) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, {
      head: isBefore ? v.text.slice(0, v.text.indexOf(' We suggest ')).replace(COMPARE_TIDY_STAFF_CARD, '')
        : v.text.slice(0, v.text.indexOf(' We suggest ')).replace(COMPARE_TIDY_ORDERS_CARD, ''),
      tail: v.text.slice(v.text.indexOf(' Estimates based on ')),
      // ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): C2 — the months-free input is gone, so BEFORE's pair
      // ("aria-label=Months free", "value=1") is dropped (asserted present in compareTidyChecks) instead of read as the trial.
      attrs: isBefore ? (COMPARE_TIDY_2 ? dropMonthsFree(v.attrs)
        : v.attrs.map((y, i) => v.attrs[i - 1] === 'aria-label=Months free' && y === 'value=1' ? `value=${STAGE_B_TRIAL_MONTHS()}` : y)) : v.attrs,
    }]))
    return [map(b, true), map(a, false)]
  }
  return null
}
// ⚠️ RE-PINNED (compare-tidy, 20 October 2026) — C1, the /compare tidy (docs/compare-tidy-report.md): the staff question
// is removed (card, buttons, "Everyone gets their own login."), the "We suggest" panel moved into the orders card right
// after its "£X included…" line, nothing waits on a staff answer, and the cards are renumbered 1 system, 2 trucks,
// 3 orders, 4 fee / trading days, 5 months free.
const COMPARE_TIDY_STAFF_CARD = / 3 How many people work (?:the van|across your vans)\? One Two or more$/
const COMPARE_TIDY_ORDERS_CARD = / 3 (?:Online orders per month, per truck|How much do you think you’d take online, per month, per truck\?) .*$/
// The orders card, as it now reads up to the panel: its title, the slider, the caption, then the "£X included…" / fee line
// (one of compare.orders.feeOnly | overAllowance | insideAllowance | noFee, plus acrossFleet at more than one truck).
const COMPARE_TIDY_FEE_LINE = new RegExp(' ~\\d+ orders £[0-9,]+ (?:Only orders placed through your ordering page — not cash or card at the window\\.|A rough guess is fine — pre-orders and queue-skippers, not cash or card at the window\\.) '
  + '(?:[0-9.]+% on every online card order — £[0-9,.]+ a month per truck\\.|£[0-9,]+ of online orders included per truck\\. The £[0-9,]+ above is charged at [0-9.]+% — £[0-9,.]+ a month each\\.'
  + '|Inside the £[0-9,]+ of online orders included — nothing on top of the plan\\.|Unlimited online orders included — nothing on top of the plan\\.)(?: Across \\d+ trucks: £[0-9,]+ a month\\.)?$')
// ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026) — C2: the months-free QUESTION is removed (card 5, its input and side
// text); the months are `freeMonthsOverride ?? offerTrialMonths(catalog) ?? 0` (no override here → the seeded trial), so
// every months figure in the results is the data default. Cards now run 1–4 on each path.
const COMPARE_TIDY_2 = /freeMonthsOverride/.test(read('app/compare/CostComparison.tsx'))
const MONTHS_FREE_PAIR = ['aria-label=Months free', 'value=1']
const monthsFreeAt = a => a.findIndex((x, i) => x === MONTHS_FREE_PAIR[0] && a[i + 1] === MONTHS_FREE_PAIR[1])
const dropMonthsFree = a => { const i = monthsFreeAt(a); return i < 0 ? ['(compare-tidy-2: no Months free pair in BEFORE)', ...a] : [...a.slice(0, i), ...a.slice(i + 2)] }
/** C1, asserted on this run's renders. Returns the failures. */
function compareTidyChecks(snap, before) {
  const bad = []
  const ck = (name, ok) => { if (!ok) bad.push(name) }
  for (const [k, v] of Object.entries(snap.compare)) {
    const t = v.text, no = k.startsWith('no|')
    ck(`C1 ${k}: BEFORE had the staff card (the removal is not vacuous)`, COMPARE_TIDY_STAFF_CARD.test(before.compare[k].text.slice(0, before.compare[k].text.indexOf(' We suggest '))))
    ck(`C1 ${k}: no staff question, no "Two or more", no "own login"`, !/How many people work|Two or more|Everyone gets their own login/.test(t))
    const head = t.slice(0, t.indexOf(' We suggest '))
    ck(`C1 ${k}: the orders card is question 3, and the panel follows its "£X included…" / fee line`,
      COMPARE_TIDY_ORDERS_CARD.test(head) && COMPARE_TIDY_FEE_LINE.test(head))
    const step4 = no ? ' 4 How many days a week do you trade? ' : ' 4 What do you pay per order now? '
    const iS = t.indexOf(' We suggest '), i4 = t.indexOf(step4)
    // ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): C2 — no months-free card: 4 is the last question on each path.
    ck(`C1/C2 ${k}: renumbered — the panel, then 4 ${no ? 'trading days' : 'fee'}, and no months-free card`, iS > 0 && i4 > iS
      && (!COMPARE_TIDY_2 || (!/Your introductory offer|how many months free\?|No plan fee, no service fee|Paying from day one/.test(t) && !v.attrs.includes('aria-label=Months free'))))
    if (COMPARE_TIDY_2) ck(`C2 ${k}: BEFORE had the months-free input (the removal is not vacuous)`, monthsFreeAt(before.compare[k].attrs) >= 0)
    ck(`C1 ${k}: the results render on question 1 alone`, t.includes(no ? 'See what it costs ↓' : 'See your saving ↓'))
  }
  return bad
}
const STAGE_B_RETIRED_LP1D2 = ['manageBilling.notStarted.body']
const STAGE_B_TRIAL_MONTHS = () => (CATALOG.plans.find(p => p.isSignupDefault && p.isTrial) || {}).trialMonths
/** The public plans, sort order, with their GB price row (the harness's own reading of the seed, not lib/plan-offer). */
const offerB = () => CATALOG.plans.filter(p => p.isPublic && p.active).sort((x, y) => x.sortOrder - y.sortOrder)
  .map(p => ({ p, r: CATALOG.prices.find(r => r.planKey === p.key && r.countryCode === 'GB') })).filter(x => x.r)
/** <PlanTable>'s text, from its header row (every public plan, "<name> <price> / month") to the end of its last row. */
function tableOfB(text) {
  const head = offerB().map(({ p }) => p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' (?:£[0-9,.]+|TBC) / month').join(' ')
  const m = new RegExp('(?:^| )(' + head + ' What you pay )').exec(text)
  if (!m) return null
  const start = m.index + (m[0].startsWith(' ') ? 1 : 0)
  const ends = [' * Plus ', ' Small print '].map(e => text.indexOf(e, start)).filter(i => i > 0)
  return ends.length ? text.slice(start, Math.min(...ends)) : null
}
const FOOTNOTE_B = /\* Plus \w+’s card processing on online card orders \(currently (1\.5% \+ 20p|TBC) in the UK\), paid to \w+, not HatchGrab\. Walk-up orders use your own card reader — HatchGrab charges 0%\./
/** The Stage B named differences, asserted. Returns the failures. */
function stageBChecks(snap, before) {
  const bad = []
  const ck = (name, ok) => { if (!ok) bad.push(name) }
  const pounds = minor => '£' + (minor / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })
  const offer = offerB()
  // B1 · the frozen display module is gone, and so are the two it replaced
  ck('B1 lib/legacy-pricing-display.ts, lib/plan-features.ts and lib/landing-table.ts are gone',
    ['lib/legacy-pricing-display.ts', 'lib/plan-features.ts', 'lib/landing-table.ts'].every(f => !fs.existsSync(path.join(REPO, f))))
  ck('B1 the retired leaves were in BEFORE (the retirement is not vacuous)', STAGE_B_RETIRED_MODULE_KEYS.every(k => k in before.modules))
  // B2 · the PDF: banner, cards (every public plan with its GB price), cheapest bar, THE plan table, footnote, date stamp
  const pdf = snap.pdf.text
  const trial = STAGE_B_TRIAL_MONTHS()
  ck('B2 PDF: the banner names the trial months', pdf.includes(`Your first ${trial} months are completely free`))
  ck('B2 PDF: a card per public plan, in order, with its GB monthly price',
    offer.every(({ p, r }) => pdf.includes(`${p.name} ${p.subtitle ? p.subtitle + ' ' : ''}${pounds(r.monthlyMinor)} per truck / month`)))
  ck('B2 PDF: the cheapest bar', pdf.includes('Which plan is cheapest for me?'))
  ck('B2 PDF: the plan table, its header from the catalogue', !!tableOfB(pdf))
  ck('B2 PDF: the pricing footnote (card processing, GB figures)', FOOTNOTE_B.test(pdf) && pdf.includes('(currently 1.5% + 20p in the UK)'))
  ck('B2 PDF: the date stamp is still there', pdf.includes('Generated <date>'))
  // B3 · Billing: the table is the PDF's table (one PlanTable) where prices show, masked where they do not; the footnote
  const pdfTable = tableOfB(pdf)
  for (const [pub, renders] of Object.entries(snap.billing)) {
    for (const [k, v] of Object.entries(renders)) {
      const visible = pub === 'published' && !k.endsWith('hide=true')
      const t = tableOfB(v.text)
      ck(`B3 ${pub}/${k}: the plan table is there`, !!t)
      if (!t) continue
      // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): a ZERO is never masked (PlanTable `zeroOr` — "£0 / month"
      // and "0%" are no secret; the plan card above already says "Free"), so "masked" means no NON-zero amount shows.
      ck(`B3 ${pub}/${k}: ${visible ? 'the same table text the PDF prints' : 'every non-zero amount masked (only £0 / 0% show)'}`, visible ? t === pdfTable : !/£(?!0\b)\d/.test(t) && !/(?<![\d.])(?!0%)\d+(\.\d+)?%/.test(t) && t.includes('TBC'))
      ck(`B3 ${pub}/${k}: the pricing footnote follows the table`, FOOTNOTE_B.test(v.text) && v.text.includes(visible ? '(currently 1.5% + 20p in the UK)' : '(currently TBC in the UK)'))
      ck(`B3 ${pub}/${k}: none of the five old footnotes`, !/Compatible printers listed|Get in touch for the list of compatible printers|Online payments powered by/.test(v.text))
    }
  }
  const gbMsgs = JSON.parse(read('messages/en-GB.json'))
  // ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): the not-started body is GONE — the heading alone. The key
  // manageBilling.notStarted.body is deleted (notStarted.heading remains, and is rendered), and neither its Stage B text
  // nor its earlier text is rendered anywhere in Billing.
  const nsHead = gbMsgs.manageBilling.notStarted.heading, billingFlat = JSON.stringify(snap.billing)
  ck('B3 notStarted.body is deleted (the heading alone is rendered, no body)', !('body' in gbMsgs.manageBilling.notStarted) && typeof nsHead === 'string' && billingFlat.includes(nsHead)
    && !billingFlat.includes('Your free trial hasn’t started yet.') && !billingFlat.includes('nothing is counting down'))
  // B4 · /compare: the cheapest plan at the volume, every other public plan offered, the trial as the free-months default
  const cost = ({ r }, minor) => r.includedOnlineMinor === null ? r.monthlyMinor : r.monthlyMinor + (r.feeBps / 10000) * Math.max(0, minor - r.includedOnlineMinor)
  for (const [k, v] of Object.entries(snap.compare)) {
    const gmv = Number(/gmv=([0-9]+)/.exec(k)[1]) * 100
    let best = null
    for (const o of offer) if (!best || cost(o, gmv) < cost(best, gmv) - 1e-9) best = o
    ck(`B4 ${k}: suggests ${best.p.name} (cheapest at ${pounds(gmv)})`, v.text.includes(` We suggest ${best.p.name} `))
    ck(`B4 ${k}: offers every other public plan`, offer.filter(o => o !== best).every(o => v.text.includes(`Use ${o.p.name} instead`)))
    // ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): there is no months input any more (C2) — the months in the RESULTS
    // are the data default (the seeded trial): No path "first N months" + "Months 1–N £0 — on us"; Yes path year one =
    // the plan's monthly cost × fleet × (12 − N), restated here from the seed.
    if (COMPARE_TIDY_2) {
      const fleet = Number(/trucks=([0-9]+)/.exec(k)[1]), y1 = Math.round(cost(best, gmv) / 100 * fleet * (12 - trial))
      ck(`B4 ${k}: no months input; the results use the trial's ${trial} months (the data default)`, !v.attrs.includes('aria-label=Months free') && (k.startsWith('no|')
        ? v.text.includes(`And your first ${trial} months are on us.`) && v.text.includes(`Months 1–${trial} £0 — on us`)
        : v.text.includes(`With HatchGrab £${y1.toLocaleString('en-GB')} in year one`)))
    } else {
      const i = v.attrs.indexOf('aria-label=Months free')
      ck(`B4 ${k}: the free-months default is the trial's ${trial}`, i >= 0 && v.attrs[i + 1] === `value=${trial}`)
      ck(`B4 ${k}: the free months are named in the results`, v.text.includes(`first ${trial} months`) || v.text.includes('Year one'))
    }
  }
  return bad
}

/** The new state of every named part, asserted. Returns the failures. */
function stageAChecks(snap, before) {
  const bad = []
  const ck = (name, ok) => { if (!ok) bad.push(name) }
  const gbPrice = key => CATALOG.prices.find(r => r.planKey === key && r.countryCode === 'GB') || null
  const plan = key => CATALOG.plans.find(p => p.key === key)
  const pounds = minor => '£' + (minor / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })
  // A2 · the van add-on from the seeded plan_prices rows
  const van = snap.modules.VAN_ADDON_CATALOG || {}
  ck('A2 VAN_ADDON_CATALOG is the seeded extra-van price of every plan', CATALOG.plans.every(p => {
    const r = gbPrice(p.key), minor = r ? r.extraVanMonthlyMinor : 0
    return minor > 0 ? van[p.key] && van[p.key].month === `${pounds(minor)}/month` && van[p.key].mo === `${pounds(minor)}/mo` : van[p.key] === null
  }))
  ck('A2 Pro\'s van add-on is unchanged (£29/month)', JSON.stringify(van.pro) === JSON.stringify(before.modules.VAN_ADDON.pro))
  // A3 · billing outside the table
  for (const [pub, renders] of Object.entries(snap.billing)) {
    for (const [k, v] of Object.entries(renders)) {
      const [old, tgt, hideS] = k.split('|'); const hide = hideS === 'hide=true'
      const key = OLD_TO_NEW[old], target = OLD_TO_NEW[tgt.replace('target=', '')]
      const visible = pub === 'published' && !hide
      const label = row => { const r = gbPrice(row.key); const m = r ? r.monthlyMinor : null
        return m === null || m === 0 ? 'Free' : visible ? `${pounds(m)}/mo` : 'TBC' }
      const p = plan(key)
      // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the table is <PlanTable> now (B3) — found by tableOfB.
      ck(`A3 ${pub}/${k}: the table is there (always shown)`, STAGE_B ? !!tableOfB(v.text) : !!matrixOf(v.text))
      ck(`A3 ${pub}/${k}: no ▲ Hide toggle`, !v.text.includes('▲'))
      ck(`A3 ${pub}/${k}: "Current plan ${p.name} ${label(p)}"`, v.text.startsWith(`Current plan ${p.name} ${label(p)} `))
      ck(`A3 ${pub}/${k}: a button for every other public plan, with its plan_prices price`,
        CATALOG.plans.filter(x => x.isPublic && x.active && x.key !== key).every(x => v.text.includes(`${x.name} — ${label(x)}`)))
      ck(`A3 ${pub}/${k}: the billing card names the plan`, v.text.includes(`Pizza Kitchen · ${p.name} plan`))
      if (target !== key) {
        const tp = plan(target)
        const mail = (v.attrs.find(x => x.startsWith('href=mailto:')) || '')
        const q = mail.split('?')[1] || ''
        const subj = decodeURIComponent((q.match(/subject=([^&]*)/) || [])[1] || '')
        ck(`A3 ${pub}/${k}: the switch modal for ${tp.name}, its mailto URL-encoded`,
          v.text.includes(`Switch to ${tp.name}`) && subj === `Switch to ${tp.name} — Pizza Kitchen` && !/\s/.test(q))
      }
    }
  }
  // A4 · admin: the plans table in sort order, GB prices from the seed; the selector lists the active plans
  const at = snap.admin.text
  ck('A4 the old plan matrix is gone', !at.includes('Feature Starter Free Trial'))
  const ordered = [...CATALOG.plans].sort((x, y) => x.sortOrder - y.sortOrder)
  let from = at.indexOf('GB · monthly · included · fee above · extra van')
  ck('A4 the plans table has its GB column', from >= 0)
  for (const p of ordered) {
    const r = gbPrice(p.key)
    const want = `${p.name} ${p.key} ·` + (r ? '' : '')
    const i = at.indexOf(want, from); ck(`A4 plans table row ${p.key} in sort order`, i > from); if (i > from) from = i
    if (r) ck(`A4 plans table ${p.key}: GB ${pounds(r.monthlyMinor)} · ${r.includedOnlineMinor === null ? 'unlimited' : pounds(r.includedOnlineMinor)} · ${r.feeBps / 100}% · ${pounds(r.extraVanMonthlyMinor)}`,
      at.includes(`${pounds(r.monthlyMinor)} · ${r.includedOnlineMinor === null ? 'unlimited' : pounds(r.includedOnlineMinor)} · ${r.feeBps / 100}% · ${pounds(r.extraVanMonthlyMinor)}`))
  }
  ck('A4 the truck modal\'s plan selector lists the active plans in order',
    at.includes(' test-kitchen Plan ' + ordered.filter(p => p.active).map(p => p.name).join(' ') + ' Active Hide pricing'))
  ck('A4 the promotional-price block (the one new modal block) is there, quoting Pro\'s GB price',
    ADMIN_PROMO_TEXT.test(at) && at.includes(`Standard price on Pro: ${pounds(gbPrice('pro').monthlyMinor)} a month.`))
  // A5 · the modal's rewritten words are the catalogue's, and in the render
  const gbMsgs = JSON.parse(read('messages/en-GB.json'))
  const body = gbMsgs.manageBilling.upgradeModal.body
  ck('A5 the switch modal shows the catalogue\'s upgradeModal.body', JSON.stringify(snap.billing).includes(body))
  return bad
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
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): PLAN_META is deleted (B1) and rule (b)'s headers are gone with
  // the old matrix (B3) — there are no plan names to map, so rule (b) is retired (PLAN_NAMES stays null).
  PLAN_NAMES = snap.modules.PLAN_META ? Object.fromEntries(Object.entries(snap.modules.PLAN_META).map(([p, m]) => [p, m.name])) : null
  for (const s of sections) {
    SECTION = s
    const [bv, av] = stageAView(s, before[s], snap[s])   // ⚠️ RE-PINNED (plans-data-model, Stage A) — see STAGE A NAMED
    const d = diff(bv, av, '', undefined, s === 'pages' ? normPages : undefined)
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
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the five old footnotes are retired with the frozen display
  // module (B1/B3) — footnote 1 no longer exists to read "on UK cards". What still holds is that the old wording
  // (" on UK and EEA cards") is in NO render of this run.
  const fn1 = snap.modules.FOOTNOTES ? ((snap.modules.FOOTNOTES.find(f => f.number === '1') || {}).text || '') : null
  const happened = fn1 === null ? (STAGE_B && !JSON.stringify(snap).includes(ALLOWED_FROM)) : fn1.includes(ALLOWED_TO) && !fn1.includes(ALLOWED_FROM)
  const isAfter = snap.modules.api === 'settings'
  if (isAfter && !happened) { fails++; console.log('✗ the in-person wording did not change in footnote 1 — the one allowed difference is missing') }
  else if (isAfter && fn1 === null) console.log('✓ allowed change 1 holds (footnote 1 is retired by Stage B; " on UK and EEA cards" is in no render)')
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
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): A5 — the modal's two rules are retired (its words were
    // rewritten to "switch"); stageAChecks proves the new body is the catalogue's and is rendered.
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): manageBilling.notStarted.body is rewritten by Stage B ("Your
    // free trial hasn’t started yet.") — its rule is retired; stageBChecks proves the new body is the catalogue's and rendered.
    const live = r => !(STAGE_A && STAGE_A_RETIRED_LP1D2.includes(r[0])) && !(STAGE_B && STAGE_B_RETIRED_LP1D2.includes(r[0]))
    const unproved = lp1d2RulesProved().filter(live)
    const flat = sec => JSON.stringify(snap[sec])
    const absent = Object.entries(LP1D2_RULES).flatMap(([sec, rules]) => rules.filter(live).filter(([, from, to]) => !flat(sec).includes(to) || flat(sec).includes(from)).map(r => r[0]))
    const billingText = Object.values(snap.billing.published).map(v => v.text).join(' ')
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): rule (b)'s headers went with the old matrix (B3) — vacuous now.
    const headersOk = STAGE_B ? !/ (trial|starter|pro|max) (Free|TBC|£[0-9,.]+\/mo) per truck \/ month/.test(billingText) : ['trial', 'starter', 'pro', 'max'].every(p => typeof PLAN_NAMES[p] === 'string' && PLAN_NAMES[p] !== p
      && new RegExp(` ${PLAN_NAMES[p]} (Free|TBC|£[0-9,.]+/mo) per truck / month`).test(billingText))
      && !/ (trial|starter|pro|max) (Free|TBC|£[0-9,.]+\/mo) per truck \/ month/.test(billingText)
    if (isAfter && (unproved.length || absent.length || !headersOk)) {
      fails++
      console.log(`✗ Language Phase 1d Part 2's named changes: unproved ${JSON.stringify(unproved.map(r => r[0]))} · not in the render ${JSON.stringify(absent)} · plan headers ${headersOk}`)
    } else if (isAfter) console.log(`✓ Language Phase 1d Part 2's named changes are proved against the catalogue and present (${Object.values(LP1D2_RULES).flat().length} GB sentence fixes; plan headers print PLAN_META names)`)
  }
  // ⚠️ RE-PINNED (Language Phase 1e): the derived rules are not vacuous — at least one fixed piece is in the render and its
  // as-moved piece is not, in every section that shows a plan row (modules, pdf, billing).
  if (isAfter) {
    const all = JSON.stringify(snap)
    const seen = LP1E_RULES.filter(([, from, to]) => all.includes(to) && !all.includes(from))
    if (!LP1E_RULES.length || !seen.length) { fails++; console.log(`✗ Language Phase 1e's named GB fixes: ${LP1E_RULES.length} rules, none present in the render`) }
    else console.log(`✓ Language Phase 1e's named GB fixes: ${LP1E_RULES.length} rules derived from scripts/fixtures/language-phase-1e-gb-named.json, ${seen.length} present in these renders`)
  }
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the Stage B named differences, asserted (see STAGE B NAMED).
  if (STAGE_B) {
    const sb = stageBChecks(snap, before)
    if (sb.length) { fails++; console.log(`✗ Stage B's named differences: ${sb.length} check(s) failed`); for (const n of sb.slice(0, 12)) console.log('    ✗ ' + n) }
    else console.log('✓ Stage B\'s named differences (B1–B4) hold: legacy display module gone, the new PDF, Billing\'s PlanTable = the PDF\'s table + the pricing footnote, /compare suggests the cheapest plan with the trial as free months')
  }
  // ⚠️ RE-PINNED (compare-tidy, 20 October 2026): C1 asserted (see COMPARE_TIDY above).
  if (STAGE_B) {
    const ct = compareTidyChecks(snap, before)
    if (ct.length) { fails++; console.log(`✗ compare-tidy's named differences (C1): ${ct.length} check(s) failed`); for (const n of ct.slice(0, 12)) console.log('    ✗ ' + n) }
    else console.log('✓ compare-tidy\'s named differences (C1) hold: no staff question, the panel inside the orders card, renumbered 1–4 with no months-free card (C2), results on question 1 alone')
  }
  if (STAGE_A) {
    const sa = stageAChecks(snap, before)
    if (sa.length) { fails++; console.log(`✗ Stage A's named differences: ${sa.length} check(s) failed`); for (const n of sa.slice(0, 12)) console.log('    ✗ ' + n) }
    else console.log('✓ Stage A\'s named differences (A1–A5) hold: footnote ids, van add-on from plan_prices, the data-driven plan card + switch modal, the admin plans table + promo block, the modal\'s new words')
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
