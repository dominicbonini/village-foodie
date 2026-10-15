// scripts/_lp1c-goLive.cjs — Language Phase 1c, area `goLive` (run by scripts/language-phase-1c.cjs;
// docs/language-phase-1c-report.md). For a GB and a US truck:
//   • THE GO-LIVE CHECKS (lib/go-live-checks.ts) — every check id, failing and passing, and every branch of its words
//     (one dish and many, a four-figure count, one uncapped van and several, an unnamed van, no categories vs none
//     prep-bearing, email confirmed / unconfirmed / unknown), as the words an operator would be shown: per issue its
//     code, title, detail and where, plus `ok`. Nothing renders them today (checkGoLive has no call site), so the
//     words themselves are the view.
//     ⚠️ AFTER, checkGoLive returns { code, params } and lib/go-live-text.ts is the one renderer of the words
//     (goLiveIssueText); BEFORE, the words were on the issue. The view is the same either way: code, title,
//     detail, where — in that order.
//   • THE WALKTHROUGH (lib/walkthrough.ts) rendered by its component (components/manage/Walkthrough.tsx) — every
//     step of the full tour, a manager's four-stop tour (no Billing tab), a narrow phone, and the closed state.
//   • MANAGE'S DONE SCREEN, the one other place the walkthrough's words appear (WALKTHROUGH_INTRO): MenuTab with the
//     import at 'done', in setup and not — only the done overlay is kept, so Phase 1d's words around it are not this
//     area's views.
// Nothing reaches a database or the network.
const fs = require('fs'); const path = require('path')

const WT = 'components/manage/Walkthrough.tsx'
const MANAGE = 'app/manage/[token]/page.tsx'

// ── go-live inputs ────────────────────────────────────────────────────────────────────────────────────
const VERIFIED = n => Array.from({ length: n }, () => ({ allergens_verified: true }))
const UNVERIFIED = n => Array.from({ length: n }, () => ({ allergens_verified: false }))
const PASS = {
  truck: { allergen_display_mode: 'per_dish', allergen_info_url: null, allergen_info_text: null },
  items: VERIFIED(4),
  vans: [{ name: 'Van 1', kitchen_capacity: 4 }],
  categories: [{ name: 'Pizzas', prep_secs: 300, batch_size: 2, counts_toward_capacity: true, is_active: true }],
  operatorEmailVerified: true,
}
const withTruck = t => ({ truck: { ...PASS.truck, ...t } })
const GO_LIVE_CASES = {
  pass: {},
  passCard: withTruck({ allergen_display_mode: 'card', allergen_info_url: 'https://example.test/allergens.pdf' }),
  passCardText: withTruck({ allergen_display_mode: 'card', allergen_info_text: 'Ask at the hatch' }),
  passBoth: { ...withTruck({ allergen_display_mode: 'both', allergen_info_text: 'Card' }) },
  passLegacyNull: { items: [{ allergens_verified: null }, { allergens_verified: true }] },
  passCountsOnly: { categories: [{ name: 'Wraps', prep_secs: 0, batch_size: 0, counts_toward_capacity: true }] },
  passOneActive: { categories: [{ name: 'Old', prep_secs: 0, counts_toward_capacity: false, is_active: true }, { name: 'Pizzas', prep_secs: 120, counts_toward_capacity: null }] },
  // allergens
  unanswered: withTruck({ allergen_display_mode: null }),
  unansweredWithUnverified: { ...withTruck({ allergen_display_mode: null }), items: UNVERIFIED(3) },
  cardMissing: withTruck({ allergen_display_mode: 'card' }),
  bothMissingAndUnverified: { ...withTruck({ allergen_display_mode: 'both' }), items: [...UNVERIFIED(2), ...VERIFIED(3)] },
  unverifiedOne: { items: [...UNVERIFIED(1), ...VERIFIED(3)] },
  unverifiedOneOfOne: { items: UNVERIFIED(1) },
  unverifiedTwo: { items: [...UNVERIFIED(2), ...VERIFIED(3)] },
  unverifiedMany: { items: [...UNVERIFIED(1000), ...VERIFIED(234)] },
  unverifiedCardMode: { ...withTruck({ allergen_display_mode: 'card', allergen_info_url: 'u' }), items: UNVERIFIED(5) },
  // vans
  noVan: { vans: [] },
  uncappedOne: { vans: [{ name: 'Van 1', kitchen_capacity: null }] },
  uncappedSome: { vans: [{ name: 'Van 1', kitchen_capacity: 4 }, { name: 'Festival <Van> & "Co"', kitchen_capacity: null }, { name: null, kitchen_capacity: null }, { name: '', kitchen_capacity: undefined }] },
  uncappedUnnamed: { vans: [{ kitchen_capacity: null }] },
  cappedZero: { vans: [{ name: 'Van 1', kitchen_capacity: 0 }] },
  // categories
  noCategories: { categories: [] },
  allInactive: { categories: [{ name: 'Pizzas', prep_secs: 300, counts_toward_capacity: true, is_active: false }] },
  noPrep: { categories: [{ name: 'Pizzas', prep_secs: 0, batch_size: 0, counts_toward_capacity: false }, { name: 'Drinks', prep_secs: null, counts_toward_capacity: null }] },
  // email
  emailFalse: { operatorEmailVerified: false },
  emailUndefined: { operatorEmailVerified: undefined },
  emailNull: { operatorEmailVerified: null },
  // everything at once — the order of the blockers
  everything: { ...withTruck({ allergen_display_mode: 'both' }), items: UNVERIFIED(7), vans: [{ name: 'Van A', kitchen_capacity: null }, { name: 'Van B', kitchen_capacity: null }], categories: [], operatorEmailVerified: undefined },
  everythingNoVan: { ...withTruck({ allergen_display_mode: null }), items: [], vans: [], categories: [{ name: 'X', prep_secs: 0, counts_toward_capacity: false }], operatorEmailVerified: false },
}

/** The <div …> element starting at `start` in `html`, through its matching close tag. */
function elementAt(html, start) {
  if (start < 0) return 'MISSING'
  const re = /<div\b|<\/div>/g; re.lastIndex = start; let d = 0, m
  while ((m = re.exec(html))) { if (m[0] === '</div>') { d--; if (d === 0) return html.slice(start, re.lastIndex) } else d++ }
  return 'UNBALANCED'
}

async function views(ctx) {
  const { kit, h, html, REPO, GB, US } = ctx
  // The AFTER code has one renderer for the go-live words; BEFORE (accbb61) put them on the issue.
  const HAS_TEXT = fs.existsSync(path.join(REPO, 'lib/go-live-text.ts'))
  const G = await kit.bundle('lp1c-golive', "export * from '@/lib/go-live-checks'\n" + (HAS_TEXT ? "export * from '@/lib/go-live-text'\n" : ''))
  const W = await kit.bundle('lp1c-walkthrough', [
    `export { Walkthrough } from '@/${WT}'`,
    "export * from '@/lib/walkthrough'",
    "export { I18nContext } from '@/lib/i18n/use-t'",
  ].join('\n') + '\n', { patches: [{ file: WT, states: ['index', 'box'] }] })
  const M = await kit.bundle('lp1c-golive-manage', [
    "export { CountrySettingsProvider } from '@/components/CountrySettingsProvider'",
    "export { MoneyProvider } from '@/components/MoneyContext'",
    "export { I18nContext } from '@/lib/i18n/use-t'",
    `export { MenuTab } from '@/${MANAGE}'`,
  ].join('\n') + '\n', {
    patches: [
      { file: MANAGE, append: 'export { MenuTab }' },
      { file: MANAGE, states: ['importStep', 'pendingDisplayMode', 'importResult', 'importDoneSkipped'] },
    ],
  })
  const seed = require('./_country-settings-gb.cjs')

  const out = {}
  for (const C of [GB, US]) {
    const cc = C.cc
    const locale = cc === 'US' ? 'en-US' : 'en-GB'
    const i18n = (m, el) => (cc === 'US' ? h(m.I18nContext.Provider, { value: { locale, setLocale() {} } }, el) : el)

    // ══ go-live checks ══════════════════════════════════════════════════════════════════════════════
    const words = issue => (HAS_TEXT
      ? { code: issue.code, ...G.goLiveIssueText(issue, locale) }
      : { code: issue.code, title: issue.title, detail: issue.detail, where: issue.where })
    for (const [k, over] of Object.entries(GO_LIVE_CASES)) {
      const input = { ...PASS, ...over }
      const r = G.checkGoLive(input)
      out[`${cc}|check|${k}`] = JSON.stringify({ ok: r.ok, blockers: r.blockers.map(words), unknown: r.unknown.map(words) })
    }

    // ══ the walkthrough ═════════════════════════════════════════════════════════════════════════════
    const BOX = { top: 120, left: 200, width: 90, height: 40 }
    const tour = (key, stops, index, box, width = 1024) => {
      globalThis.window = { innerWidth: width }
      try { out[`${cc}|walkthrough|${key}`] = html({ index, box }, i18n(W, h(W.Walkthrough, { stops, onClose() {} }))) }
      finally { delete globalThis.window }
    }
    const all = W.WALKTHROUGH_STOPS
    all.forEach((s, i) => tour(`all|${i}|${s.id}`, all, i, BOX))
    const manager = all.filter(s => s.id !== 'billing')
    manager.forEach((s, i) => tour(`manager|${i}|${s.id}`, manager, i, BOX))
    tour('phone|0', all, 0, { top: 60, left: 280, width: 70, height: 36 }, 320)
    tour('phone|last', all, all.length - 1, { top: 60, left: 280, width: 70, height: 36 }, 320)
    tour('unmeasured', all, 0, null)
    out[`${cc}|walkthrough|stops`] = JSON.stringify(all.map(s => ({ id: s.id, tabIds: s.tabIds })))

    // ══ Manage's done screen — WALKTHROUGH_INTRO in setup; not shown outside setup ══════════════════
    const settings = cc === 'US' ? seed.usFromSeed() : seed.gbFromSeed()
    const importResult = {
      categories: ['Pizzas', 'Sides'],
      items: [
        { name: 'Margherita', price: 9.5, category: 'Pizzas', _allergensChecked: true },
        { name: 'Pepperoni', price: 11, category: 'Pizzas', _allergensChecked: true },
        { name: 'Garlic bread', price: 4, category: 'Sides', _allergensChecked: true },
      ],
    }
    for (const [k, setupStep] of [['setup', 'schedule'], ['existing', null]]) {
      const truck = { ...C.TRUCK, setup_step: setupStep, allergen_display_mode: 'per_dish' }
      const el = h(M.CountrySettingsProvider, { settings }, h(M.MoneyProvider, { fmt: C.fmt }, i18n(M, h(M.MenuTab, {
        truck, categories: [], items: [], subcategories: [], token: 'harness', modifierGroups: [], modifierOptions: [], itemModGroups: [],
        setItemModGroups() {}, api: async () => ({}), reload() {}, showToast() {}, allergenWizardOpen: false, onCloseAllergenWizard() {},
        onOpenAllergenWizard() {}, canEditAllergens: true, onWalkthroughChoice() {}, onVerifySuccess() {},
      }))))
      const page = html({ importStep: 'done', pendingDisplayMode: 'per_dish', importResult, importDoneSkipped: 0 }, el)
      const start = page.indexOf('<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"><div class="bg-white rounded-2xl p-8 w-full max-w-sm')
      out[`${cc}|manageDone|${k}`] = page.startsWith('ERROR') ? page : elementAt(page, start)
    }
  }
  return out
}

/** AFTER only: the words left the code they were in, and go-live-checks stayed import-free. */
async function after(ctx) {
  const { t, head, read } = ctx
  head('goLive · the words live in the message files, and go-live-checks stays pure')
  const code = src => src.split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n')
  const G = code(read('lib/go-live-checks.ts'))
  t('lib/go-live-checks.ts imports nothing (PURE BY DESIGN — the audit script and the gate rely on it)', !/^\s*import\s/m.test(G))
  t('lib/go-live-checks.ts carries no title / detail / where words', !/\b(title|detail|where):\s*['"`]/.test(G))
  const W = code(read('lib/walkthrough.ts'))
  t('lib/walkthrough.ts carries no stop title / body and no intro constant', !/\b(title|body):\s*['"`]/.test(W) && !/WALKTHROUGH_INTRO/.test(W))
  const C = read('components/manage/Walkthrough.tsx')
  t('Walkthrough.tsx reads the walkthrough namespace and imports its catalog', /useT\('walkthrough'\)/.test(C) && /import '@\/lib\/i18n\/catalog\/walkthrough'/.test(C))
  t('Walkthrough.tsx has no inline button words left', !/>\s*(Skip|← Back|Done|Next →)\s*</.test(C) && !/'(Done|Next →|Dashboard walkthrough)'/.test(C))
  const M = read('app/manage/[token]/page.tsx')
  t('Manage renders the intro through WalkthroughIntro (WALKTHROUGH_INTRO is gone)', /<WalkthroughIntro \/>/.test(M) && !/WALKTHROUGH_INTRO/.test(M))
  const T = read('lib/go-live-text.ts')
  t('go-live-text.ts imports the goLive catalog', /import '@\/lib\/i18n\/catalog\/goLive'/.test(T))
}

module.exports = { views, after }
