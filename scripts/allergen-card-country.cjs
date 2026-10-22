// scripts/allergen-card-country.cjs — ALLERGEN CARD ON ITS OWN, PER COUNTRY (docs/allergen-card-country-report.md).
//
// LOCALHOST ONLY. Nothing reaches a database or the network: the routes read the in-memory database of
// scripts/_fake-pg.cjs, and the Manage renders are the language-phase-1d kit's (scripts/_lp1d-fixtures.cjs). Checks:
//   1  THE DATA — the migration adds country_settings.allergen_card_only_allowed (not null, default true) and sets IE
//      false; the loader selects and requires it (a boolean, both values); Admin › Countries has the toggle row, and the
//      form round-trips both values (and refuses anything else); the seed helper gives every fixture row the default.
//   2  THE WIZARD — setting ON (GB): page 1 (the card-or-per-dish question) as before. OFF (IE): it opens on page 2
//      ("Do you have an allergen card to upload?"), with no "Show an allergen card" and no Back to page 1; without the
//      card page it opens on the review, also with no way back to page 1.
//   3  THE IMPORT FLOW (the menu set-up from the landing page / signup) — OFF: the Allergens step opens on the card page,
//      per dish; its Back leaves the step (source, and the rendered step).
//   4  THE API — POST /api/manage update_settings refuses a CHANGE to 'card' for an IE truck (400,
//      allergen_card_not_allowed, nothing written); allows per_dish; allows 'card' for GB; and an IE truck already on
//      'card' still saves its other settings.
//   5  THE ORDER PAGE — GET /api/menu: an IE truck saved as 'card' is served per dish (unconfirmed dishes hidden, mode
//      'per_dish'); a GB 'card' truck is served exactly as before.
//   6  MANAGE — an IE truck saved as 'card': the Allergens card reads "Per dish" with a notice asking it to confirm.
//   7  GB AND US BYTE-IDENTICAL — the wizard (every page), the Menu tab (card mode, the import's Allergens step) and
//      /api/menu, rendered by today's code and by the same code with this workstream's edits reverted (patches), equal.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'allergen-card-country' })
const LP = require('./_lp1d-fixtures.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const { makeFakePg } = require('./_fake-pg.cjs')

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 700) : JSON.stringify(detail).slice(0, 700)}` : ''}`) } }
const head = s => console.log(`\n${s}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const text = s => String(s).replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const MSG = JSON.parse(read('messages/en-GB.json'))
const W_MSG = MSG.manageAllergens, P_MSG = MSG.managePrimitives.allergenMode

// ── the edits of this workstream, reverted (BEFORE = today's code without them) ────────────────────────────────────
const M_FILE = 'app/manage/[token]/page.tsx'
const REVERT_MANAGE = [
  { from: `  // allergen-card-country (21 October 2026): where the truck's country does not allow an allergen card on its own
  // (country_settings.allergen_card_only_allowed — off for Ireland), there is no page 1 (the card-or-per-dish
  // question): the wizard opens on page 2, "Do you have an allergen card to upload?", and nothing leads back to page 1.
  // On everywhere else, and outside a provider: exactly as before.
  const cardOnlyAllowed = useOptionalCountrySettings()?.allergenCardOnlyAllowed !== false
`, to: '' },
  { from: 'useState<0 | 1 | 2 | 3>(initialMode === 0 && !cardOnlyAllowed ? (onProcessCard ? 3 : 1) : initialMode)', to: 'useState<0 | 1 | 2 | 3>(initialMode)' },
  { from: `              {/* allergen-card-country: no page 1 to go back to where an allergen card on its own is not allowed. */}
              {cardOnlyAllowed && <Btn label={t('wizard.nav.back')} colour="slate" onClick={() => setMode(0)} />}`, to: `              <Btn label={t('wizard.nav.back')} colour="slate" onClick={() => setMode(0)} />` },
  { from: `{(onBack || onProcessCard || cardOnlyAllowed) && <Btn label={t('wizard.nav.back')} colour="slate" onClick={() => onBack ? onBack() : setMode(onProcessCard ? 3 : 0)} />}`,
    to: `<Btn label={t('wizard.nav.back')} colour="slate" onClick={() => onBack ? onBack() : setMode(onProcessCard ? 3 : 0)} />` },
  { from: /\n  \/\/ allergen-card-country \(21 October 2026\): where the truck's country does not allow an allergen card on its own\n  \/\/ \(country_settings\.allergen_card_only_allowed — off for Ireland\), the import's Allergens step[\s\S]*?const menuCardOnlyAllowed = useOptionalCountrySettings\(\)\?\.allergenCardOnlyAllowed !== false/, to: '' },
  { from: /  const goToAllergens = \(\) => \{\n    if \(!importResult\) return\n[\s\S]*?\n    setImportStep\('allergens'\)\n  \}/, to: "  const goToAllergens = () => { if (importResult) { setAllergenSubStep('chooser'); setImportStep('allergens') } }" },
  { from: "allergenSubStep === 'card' && menuCardOnlyAllowed ? setAllergenSubStep('chooser')", to: "allergenSubStep === 'card' ? setAllergenSubStep('chooser')" },
  { from: "        const hiddenCount = ((truck.allergen_display_mode ?? null) !== 'card' || !menuCardOnlyAllowed)   // allergen-card-country", to: "        const hiddenCount = (truck.allergen_display_mode ?? null) !== 'card'" },
  { from: /        const storedMode = \(truck as any\)\.allergen_display_mode as 'per_dish' \| 'card' \| 'both' \| null\n[\s\S]*?        const mode = cardNotAllowed \? 'per_dish' : storedMode\n/, to: "        const mode = (truck as any).allergen_display_mode as 'per_dish' | 'card' | 'both' | null\n" },
  { from: /\n                  \{\/\* allergen-card-country: the stored card-only mode is not allowed where this truck trades — say so\. \*\/\}\n                  \{cardNotAllowed && <p[^\n]*<\/p>\}/, to: '' },
].map(p => ({ file: M_FILE, ...p }))
const MENU_ROUTE = 'app/api/menu/[truckId]/route.ts'
const REVERT_MENU = [
  { from: /\n  \/\/ ── allergen-card-country \(21 October 2026\) ─+\n[\s\S]*?  const allergenDisplayMode = [^\n]*\n/, to: '\n' },
  { from: "        const perDish = (allergenDisplayMode as string | null) !== 'card'   // allergen-card-country: the effective mode", to: "        const perDish = ((truck.allergen_display_mode ?? null) as string) !== 'card'" },
  { from: "      allergen_display_mode: allergenDisplayMode,   // allergen-card-country: 'card' read as 'per_dish' where the country does not allow it", to: "      allergen_display_mode: (truck.allergen_display_mode ?? null) as 'per_dish' | 'card' | 'both' | null," },
  { from: "      allergensVerified: (allergenDisplayMode === 'card' && !!(truck.allergen_info_url || truck.allergen_info_text))", to: "      allergensVerified: ((truck.allergen_display_mode ?? null) === 'card' && !!(truck.allergen_info_url || truck.allergen_info_text))" },
].map(p => ({ file: MENU_ROUTE, ...p }))

;(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.NEXT_PUBLIC_HATCHGRAB_URL = 'https://www.hatchgrab.com'
  const ctx = LP.context(kit, REPO)
  const { h, html, inManage, GB, US } = ctx
  const IE = { ...GB, cc: 'IE', settings: { ...GB.settings, countryCode: 'IE', name: 'Ireland', shortName: 'Ireland', currency: 'EUR', locale: 'en-IE', allergenCardOnlyAllowed: false }, truck: { ...GB.truck, country: 'IE' } }

  // ══ 1 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · the data: the column, the loader, Admin › Countries')
  const mig = read('supabase/migrations/20261029_allergen_card_only.sql')
  t('the migration adds allergen_card_only_allowed boolean NOT NULL DEFAULT true, and sets Ireland false (only Ireland)',
    /add column if not exists allergen_card_only_allowed boolean not null default true;/.test(mig)
    && /update public\.country_settings set allergen_card_only_allowed = false[^;]*where country_code = 'IE';/.test(mig) && (mig.match(/allergen_card_only_allowed = false/g) || []).length === 1)
  const L = await kit.bundle('acc-lib', "export { mapCountryRow, COUNTRY_SETTINGS_COLUMNS } from '@/lib/country-settings'\nexport * as Form from '@/lib/admin/country-form'\nexport * as Act from '@/lib/admin/country-actions'")
  const gbRow = snake(SEEDS.gbFromSeed())
  t('the seed helper gives every fixture row the migration\'s default (true)', SEEDS.gbFromSeed().allergenCardOnlyAllowed === true && SEEDS.usFromSeed().allergenCardOnlyAllowed === true)
  t('the loader selects the column by name', L.COUNTRY_SETTINGS_COLUMNS.includes('allergen_card_only_allowed'))
  const mapped = v => { try { return L.mapCountryRow({ ...gbRow, allergen_card_only_allowed: v }).allergenCardOnlyAllowed } catch (e) { return 'THROWS' } }
  t('the loader reads both values (true, false) and refuses anything else (missing, null, "false")', mapped(true) === true && mapped(false) === false
    && mapped(undefined) === 'THROWS' && mapped(null) === 'THROWS' && mapped('false') === 'THROWS')
  const ieRow = { ...SEEDS.gbFromSeed(), countryCode: 'IE', name: 'Ireland', currency: 'EUR', allergenCardOnlyAllowed: false }
  const form = L.Form.rowToForm(ieRow)
  t('Admin form (Ireland column): the toggle reads OFF for Ireland', form.allergenCardOnlyAllowed === false)
  const vOff = L.Form.formToValues(form, { truckCount: 0, storedCurrency: 'EUR', countryCode: 'IE' })
  const vOn = L.Form.formToValues({ ...form, allergenCardOnlyAllowed: true }, { truckCount: 0, storedCurrency: 'EUR', countryCode: 'IE' })
  t('…a save writes allergen_card_only_allowed false, and true when switched back on (both values valid)',
    vOff.values?.allergenCardOnlyAllowed === false && L.Act.valuesToColumns(vOff.values).allergen_card_only_allowed === false
    && vOn.values?.allergenCardOnlyAllowed === true && L.Act.valuesToColumns(vOn.values).allergen_card_only_allowed === true, { off: vOff.errors, on: vOn.errors })
  t('…and a posted form whose toggle is not a boolean is refused', L.Form.asCountryForm({ ...form, allergenCardOnlyAllowed: 'no' }) === null && L.Form.asCountryForm(form) !== null)
  const tab = read('components/admin/CountriesTab.tsx')
  t('Admin › Countries has ONE toggle row "Allergen card on its own", with a one-line explanation',
    (tab.match(/label: 'Allergen card on its own', hint: 'Off where the law needs allergens shown against each dish', cell: code => toggle\(code, 'allergenCardOnlyAllowed'/g) || []).length === 1)
  t('no country code decides it in code: no "IE" anywhere this workstream reads the setting',
    ![M_FILE, MENU_ROUTE, 'app/api/manage/route.ts'].map(read).join('\n').split('\n').filter(l => /allergenCardOnlyAllowed|CardOnlyAllowed|cardNotAllowed|allergen_card_not_allowed/.test(l)).some(l => /'IE'|"IE"/.test(l)))

  // ══ 2 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · the wizard (Manage › Menu › Allergens)')
  const ST = ctx.states(M_FILE, ['mode', 'chooserMode', 'reviewView', 'stdShowUpload', 'stdCardParsed', 'stdCardMatch', 'drafts', 'sessionConfirmed', 'cardEditText',
    'importStep', 'importResult', 'reviewStep', 'allergenSubStep', 'pendingDisplayMode', 'showCardUpload', 'expandedCat', 'editingCat'])
  const bundleManage = (tag, extra = []) => kit.bundle(tag, [`export { MenuTab, AllergenWizardModal } from '@/${M_FILE}'`, LP.PROVIDERS].join('\n'), {
    patches: [
      { file: M_FILE, append: 'export { MenuTab, AllergenWizardModal }' },
      { file: M_FILE, from: "import { createPortal } from 'react-dom'", to: 'const createPortal = (el: any) => el' },
      ...extra,
      { file: M_FILE, states: ST },
    ],
  })
  const NOW = await bundleManage('acc-manage-now'), BEFORE = await bundleManage('acc-manage-before', REVERT_MANAGE)
  const api = async () => ({}), noop = () => {}
  const ITEMS = [{ id: 'i1', name: 'Margherita', category_id: 'c1', price: 12, allergens: ['Gluten', 'Dairy'], dietary: [], allergens_verified: true, is_available: true },
    { id: 'i2', name: 'Pad Thai', category_id: 'c1', price: 11, allergens: ['Peanuts'], dietary: [], allergens_verified: false, is_available: true }]
  const CATS = [{ id: 'c1', name: 'Mains', sort_order: 0 }]
  const wizProps = (o = {}) => ({ items: ITEMS, categories: CATS, canEdit: true, onClose: noop, onConfirmRow: api, onUndoRow: api, onEditUnverify: api, showToast: noop,
    cardText: '', cardUrl: '', cardProcessing: false, onAddCard: noop, onSetDisplayMode: api, initialMode: 0, initialReviewView: 'list', onProcessCard: api, onCardMerge: api, ...o })
  const wiz = (M, C, st = {}, o) => html(st, inManage(M, C, h(M.AllergenWizardModal, wizProps(o))))
  const gbWiz = text(wiz(NOW, GB)), ieWiz = text(wiz(NOW, IE))
  t(`ON (GB): page 1 — "${P_MSG.perDishTitle}" and "${P_MSG.cardTitle}"`, gbWiz.includes(P_MSG.perDishTitle) && gbWiz.includes(P_MSG.cardTitle) && !gbWiz.includes(W_MSG.cardUpload.question))
  t(`OFF (IE): it opens on page 2 — "${W_MSG.cardUpload.question}" — with no "${P_MSG.cardTitle}" and no per-dish chooser`,
    ieWiz.includes(W_MSG.cardUpload.question) && !ieWiz.includes(P_MSG.cardTitle) && !ieWiz.includes(P_MSG.perDishTitle), ieWiz.slice(0, 400))
  const backWord = W_MSG.wizard.nav.back
  const hasBack = s => new RegExp(`>\\s*${backWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<`).test(s)
  t(`OFF: page 2 has no "${backWord}" (there is no page 1); ON: it does`, !hasBack(wiz(NOW, IE)) && hasBack(wiz(NOW, GB, { mode: 3 })))
  const ieNoCardPage = text(wiz(NOW, IE, {}, { onProcessCard: undefined, onCardMerge: undefined }))
  t('OFF without the card page (no onProcessCard): it opens straight on the per-dish review, with no Back to page 1',
    ieNoCardPage.includes('Margherita') && !ieNoCardPage.includes(P_MSG.cardTitle) && !hasBack(wiz(NOW, IE, {}, { onProcessCard: undefined, onCardMerge: undefined })))
  t('OFF: the review (page 3) keeps its Back — to page 2', hasBack(wiz(NOW, IE, { mode: 1 })))
  t('OFF: an uploaded card still builds the per-dish allergens (page 2 is the per-dish card page, as today)', wiz(NOW, IE).includes(W_MSG.cardUpload.question) && /perDish\s*\n?\s*anyDetected/.test(read(M_FILE).slice(read(M_FILE).indexOf('MODE 3 — per-dish CARD-UPLOAD page'))))

  // ══ 3 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · the import flow (menu set-up from the landing page / signup)')
  const src = read(M_FILE)
  t('OFF: entering the Allergens step sets per dish and opens the card page (no chooser); ON: the chooser, as before',
    /const goToAllergens = \(\) => \{\n    if \(!importResult\) return\n    if \(menuCardOnlyAllowed\) setAllergenSubStep\('chooser'\)\n    else \{ setPendingDisplayMode\('per_dish'\); setAllergenSubStep\('card'\) \}/.test(src))
  t('OFF: the card page\'s Back leaves the step (to the review), never to the chooser', src.includes("onClick={() => allergenSubStep === 'card' && menuCardOnlyAllowed ? setAllergenSubStep('chooser') : (hasExtras"))
  const IMPORT_RESULT = { categories: ['Mains'], existing_categories: [], items: [{ name: 'Margherita', category: 'Mains', price: 12, allergens: ['Gluten'] }], extras: [] }
  const menuProps = (C, o = {}) => ({ truck: { ...C.truck }, categories: CATS, items: ITEMS, subcategories: [], token: 'harness', modifierGroups: [], modifierOptions: [], itemModGroups: [],
    setItemModGroups: noop, api, reload: noop, showToast: noop, allergenWizardOpen: false, onCloseAllergenWizard: noop, onOpenAllergenWizard: noop, canEditAllergens: true,
    onWalkthroughChoice: noop, onVerifySuccess: noop, ...o })
  const menu = (M, C, st, o) => html({ editingCat: null, ...st }, inManage(M, C, h(M.MenuTab, menuProps(C, o))))
  const ieCardStep = text(menu(NOW, IE, { importStep: 'allergens', importResult: IMPORT_RESULT, allergenSubStep: 'card', pendingDisplayMode: 'per_dish' }))
  t('OFF: the Allergens step\'s card page renders for an IE truck (per dish), with no card-only choice on it', ieCardStep.includes(W_MSG.cardUpload.question) && !ieCardStep.includes(P_MSG.cardTitle))

  // ══ 4 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · the API: /api/manage update_settings')
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const ACCESS = { file: 'app/api/manage/route.ts', from: /const access = await resolveTruckAccess\(req, truck\)/g, to: "const access = { ok: true as const, role: 'owner' as const, userId: null, operatorId: null, via: 'harness' } as any" }
  const R = await kit.bundle('acc-manage-route', "export { POST } from '@/app/api/manage/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", {
    patches: [ACCESS],
    stubs: { '@/lib/supabase/server': 'export async function createSupabaseServerClient() { return { auth: { getUser: async () => ({ data: { user: null }, error: null }) } } }' },
  })
  const ieDbRow = snake({ ...SEEDS.gbFromSeed(), countryCode: 'IE', name: 'Ireland', shortName: 'Ireland', currency: 'EUR', locale: 'en-IE', enabled: false, allergenCardOnlyAllowed: false })
  const CS = [gbRow, snake(SEEDS.usFromSeed()), ieDbRow]
  const truckRow = (cc, mode) => ({ id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', dashboard_token: 'tok', operator_id: 'op-1', country: cc, timezone: cc === 'IE' ? 'Europe/Dublin' : 'Europe/London',
    plan: 'pro', feature_overrides: {}, trial_expires_at: null, currency: cc === 'IE' ? 'EUR' : 'GBP', allergen_display_mode: mode, allergen_info_text: null, allergen_info_url: null, contact_email: 'k@example.test' })
  const post = async (cc, mode, body) => {
    const db = makeFakePg({ country_settings: CS, trucks: [truckRow(cc, mode)], operators: [{ id: 'op-1', auth_user_id: 'u-1', is_admin: false }], truck_users: [], allergen_change_log: [], audit_log: [] }, {})
    globalThis.__harnessDb = db; R.clearCountrySettingsCache?.()
    const res = await kit.quietAsync(() => R.POST(new NextRequest('http://127.0.0.1/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'tok', action: 'update_settings', ...body }) })))
    const stored = (db.tables?.trucks || db.trucks || [])[0]
    return { status: res.status, body: await res.json().catch(() => null), stored: stored?.allergen_display_mode }
  }
  const r1 = await post('IE', 'per_dish', { allergen_display_mode: 'card' })
  t(`IE truck → 'card': refused 400, code allergen_card_not_allowed, "${MSG.errorsManage.allergen_card_not_allowed.slice(0, 60)}…", nothing written`,
    r1.status === 400 && r1.body?.code === 'allergen_card_not_allowed' && r1.body?.error === MSG.errorsManage.allergen_card_not_allowed && r1.stored !== 'card', r1)
  const r2 = await post('IE', null, { allergen_display_mode: 'per_dish' })
  t('IE truck → per_dish: saved', r2.status === 200 && r2.body?.truck?.allergen_display_mode === 'per_dish', r2)
  const r3 = await post('GB', 'per_dish', { allergen_display_mode: 'card' })
  t('GB truck → card: saved, as before', r3.status === 200 && r3.body?.truck?.allergen_display_mode === 'card', r3)
  const r4 = await post('IE', 'card', { allergen_display_mode: 'card', contact_email: 'new@example.test' })
  t('IE truck ALREADY on card, saving its other settings with the whole form: saved (only a CHANGE to card is refused)', r4.status === 200 && r4.body?.truck?.contact_email === 'new@example.test', r4)

  // ══ 5 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · the order page: /api/menu')
  const menuEntry = `export { GET } from '@/${MENU_ROUTE.replace(/\.ts$/, '')}'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'`
  const MN = await kit.bundle('acc-menu-now', menuEntry), MB = await kit.bundle('acc-menu-before', menuEntry, { patches: REVERT_MENU })
  const CAT = require('./_plans-catalog-fixture.cjs').seedCatalog(REPO)
  const menuDb = (cc, mode) => makeFakePg({
    plans: CAT.plans.map(snake), plan_prices: CAT.prices.map(snake), plan_features: CAT.features.map(snake),
    country_settings: CS,
    trucks: [{ ...truckRow(cc, mode), active: true, excluded: false, show_on_hg: false, order_link_hg: true, allergen_info_text: mode === 'card' ? 'Ask us about allergens.' : null }],
    menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Mains', sort_order: 0, is_active: true }],
    menu_items_db: [
      { id: 'i1', truck_id: 'test-truck', category_id: 'c1', name: 'Margherita', price: 12, allergens: ['Gluten', 'Dairy'], dietary: [], allergens_verified: true, is_available: true, is_active: true, sort_order: 0, menu_categories: { name: 'Mains' } },
      { id: 'i2', truck_id: 'test-truck', category_id: 'c1', name: 'Pad Thai', price: 11, allergens: ['Peanuts'], dietary: [], allergens_verified: false, is_available: true, is_active: true, sort_order: 1, menu_categories: { name: 'Mains' } }],
  }, {})
  const getMenu = async (M, cc, mode) => {
    globalThis.__harnessDb = menuDb(cc, mode); M.clearCountrySettingsCache?.()
    const res = await kit.quietAsync(() => M.GET(new NextRequest('http://127.0.0.1/api/menu/test-truck'), { params: Promise.resolve({ truckId: 'test-truck' }) }))
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  const ieCard = await getMenu(MN, 'IE', 'card')
  const names = b => JSON.stringify(b?.menu ?? b?.items ?? b).match(/"name":"(Margherita|Pad Thai)"/g) || []
  t('IE truck saved as card → served per dish: mode "per_dish", the unconfirmed dish hidden (the per-dish rule)',
    ieCard.status === 200 && ieCard.body?.truck?.allergen_display_mode === 'per_dish' && names(ieCard.body).some(n => n.includes('Margherita')) && !names(ieCard.body).some(n => n.includes('Pad Thai')),
    { status: ieCard.status, mode: ieCard.body?.truck?.allergen_display_mode, names: names(ieCard.body), err: ieCard.body?.error })
  for (const [cc, mode] of [['GB', 'card'], ['GB', 'per_dish'], ['GB', null]]) {
    const a = await getMenu(MN, cc, mode), b = await getMenu(MB, cc, mode)
    t(`${cc} ${mode ?? 'unset'}: /api/menu byte-identical to the code without this workstream`, a.status === 200 && JSON.stringify(a) === JSON.stringify(b), { a: JSON.stringify(a).slice(0, 200), b: JSON.stringify(b).slice(0, 200) })
  }

  // ══ 6 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · Manage: an IE truck still saved as card')
  const ieCardMenu = text(menu(NOW, IE, {}, { truck: { ...IE.truck, allergen_display_mode: 'card', allergen_info_text: 'Ask staff about allergens.' } }))
  const MM = MSG.manageMenu.allergens
  t(`the Allergens card reads "${MM.modePerDish}" and shows the notice "${MM.cardNotAllowed.slice(0, 50)}…"`,
    ieCardMenu.includes(MM.cardNotAllowed) && ieCardMenu.includes(MM.modePerDish) && !ieCardMenu.includes(MM.addCard), ieCardMenu.slice(ieCardMenu.indexOf('Display mode') - 50, ieCardMenu.indexOf('Display mode') + 300))

  // ══ 7 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · GB and US byte-identical (today\'s code vs the code without this workstream)')
  const VIEWS = [
    ['wizard|chooser', (M, C) => wiz(M, C)],
    ['wizard|chooser|card', (M, C) => wiz(M, C, { chooserMode: 'card' })],
    ['wizard|cardPage', (M, C) => wiz(M, C, { mode: 3 })],
    ['wizard|review', (M, C) => wiz(M, C, { mode: 1 })],
    ['wizard|review|noCardPage', (M, C) => wiz(M, C, { mode: 1 }, { onProcessCard: undefined, onCardMerge: undefined })],
    ['wizard|card', (M, C) => wiz(M, C, { mode: 2 })],
    ['menu|list', (M, C) => menu(M, C, {})],
    ['menu|cardMode', (M, C) => menu(M, C, {}, { truck: { ...C.truck, allergen_display_mode: 'card', allergen_info_text: 'Ask staff about allergens.' } })],
    ['menu|cardMode|noCard', (M, C) => menu(M, C, {}, { truck: { ...C.truck, allergen_display_mode: 'card' } })],
    ...['chooser', 'card', 'review'].map(sub => [`menu|import|allergens|${sub}`, (M, C) => menu(M, C, { importStep: 'allergens', importResult: IMPORT_RESULT, allergenSubStep: sub, pendingDisplayMode: sub === 'card' ? 'card' : 'per_dish' })]),
  ]
  for (const C of [GB, US]) {
    const diff = VIEWS.filter(([, f]) => f(NOW, C) !== f(BEFORE, C)).map(([k]) => k)
    const errs = VIEWS.filter(([, f]) => /^ERROR/.test(f(NOW, C))).map(([k]) => k)
    t(`${C.cc}: ${VIEWS.length} views (wizard pages, Menu tab, the import's Allergens step) byte-identical`, diff.length === 0 && errs.length === 0, { diff, errs })
  }

  // The comparison can fail: for Ireland the reverted code shows page 1 and today's does not, and /api/menu differs.
  const ieBefore = text(wiz(BEFORE, IE)), ieMenuBefore = await getMenu(MB, 'IE', 'card')
  t('…and the reverted code really is the old code: for Ireland it still shows page 1, and serves the card mode',
    ieBefore.includes(P_MSG.cardTitle) && !text(wiz(NOW, IE)).includes(P_MSG.cardTitle) && ieMenuBefore.body?.truck?.allergen_display_mode === 'card')

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
