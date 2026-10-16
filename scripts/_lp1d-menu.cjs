// scripts/_lp1d-menu.cjs — Language Phase 1d, area `menu`: Manage › Menu, rendered whole (full HTML) for a GB and a US
// truck in its meaningful states — the list (empty, populated, a category open, hidden-items warning), the category and
// item editors, delete confirmations, sub-categories, the import wizard's steps (upload, processing, offer, review page
// 1 and 2, allergens chooser / card / review, prep & kitchen, setup schedule and settings, done), the old allergen
// modal, the allergen wizard's modes (chooser, review list and table, card, card-only), ModifiersTab with ExtrasEditor
// and UpsellRulesSection, DealsTab (list, empty, editing), and the kitchen capacity section.
// A MODULE run by scripts/language-phase-1d.cjs. Every view runs on 756ca09 and on this tree (ctx.states skips a state
// name the code does not have; a new export is guarded).
const M_FILE = 'app/manage/[token]/page.tsx'

const CATS = [
  { id: 'c1', name: 'Pizzas', slug: 'pizzas', prep_secs: 480, batch_size: 4, allow_notes: true, default_stock: null, sort_order: 0, is_active: true, counts_toward_capacity: true },
  { id: 'c2', name: 'Sides', slug: 'sides', prep_secs: 120, batch_size: 0, allow_notes: false, default_stock: 20, sort_order: 1, is_active: true, counts_toward_capacity: true },
  { id: 'c3', name: 'Drinks', slug: 'drinks', prep_secs: 0, batch_size: 0, allow_notes: false, default_stock: null, sort_order: 2, is_active: true, counts_toward_capacity: false },
]
const item = (o) => ({ description: null, subcategory_id: null, subcategory: null, is_available: true, stock_count: null, default_stock: null, sort_order: 0, image_path: null,
  allergens: [], allergens_verified: true, dietary_info: [], spiciness: null, auto_accept: false, preorder_enabled: null, ...o })
const ITEMS = [
  item({ id: 'i1', name: 'Margherita', description: 'Tomato, mozzarella, basil', price: 9.5, category_id: 'c1', allergens: ['gluten', 'milk'], dietary_info: ['vegetarian'], sort_order: 0 }),
  item({ id: 'i2', name: 'Pepperoni', price: 11, category_id: 'c1', allergens: ['gluten', 'milk'], spiciness: 2, sort_order: 1, stock_count: 3, default_stock: 12 }),
  item({ id: 'i6', name: 'Nduja special', price: 12.5, category_id: 'c1', allergens: [], allergens_verified: false, sort_order: 2, subcategory_id: 'sc1' }),
  item({ id: 'i5', name: 'Garlic bread', price: 4, category_id: 'c2', allergens: ['gluten'], dietary_info: ['vegan'], is_available: false }),
  item({ id: 'i3', name: 'Coke', price: 1.8, category_id: 'c3' }),
]
const SUBCATS = [{ id: 'sc1', category_id: 'c1', name: 'Specials', sort_order: 0 }]
const GROUPS = [{ id: 'g1', name: 'Size', is_required: true, min_choices: 1, max_choices: 1 }, { id: 'g2', name: 'Extra toppings', is_required: false, min_choices: 0, max_choices: 3 }]
const opt = (id, g, name, p, s) => ({ id, group_id: g, name, price_adjustment: p, type: 'addon', sort_order: s, allergens: [], dietary_info: [], available: true, stock_count: null })
const OPTS = [opt('o1', 'g1', 'Regular', 0, 0), opt('o2', 'g1', 'Large', 2.5, 1), opt('o3', 'g2', 'Extra cheese', 1.25, 0), opt('o4', 'g2', 'Jalapeños', 0.75, 1)]
const ASSIGN = [{ menu_item_id: 'i1', group_id: 'g1' }, { menu_item_id: 'i1', group_id: 'g2' }, { menu_item_id: 'i2', group_id: 'g1' }]
const RULES = [{ id: 'u1', trigger_category: 'c1', suggest_category: 'c3', max_suggestions: 2, show_at_checkout: true }]
const BUNDLES = [
  { id: 'b1', name: 'Lunch deal', description: 'Any pizza and a drink', bundle_price: 12, original_price: 14.3, is_available: true, apply_to_new_events: true, start_time: '11:30', end_time: '14:00', slot_1_category: 'Pizzas', slot_2_category: 'Drinks', slot_3_category: null, slot_4_category: null, slot_5_category: null, slot_6_category: null },
  { id: 'b2', name: 'Family feast', description: null, bundle_price: 30, original_price: null, is_available: false, apply_to_new_events: false, start_time: null, end_time: null, slot_1_category: 'Pizzas', slot_2_category: 'Pizzas', slot_3_category: 'Sides', slot_4_category: null, slot_5_category: null, slot_6_category: null, stock_warning: 'Garlic bread is sold out' },
]
const IMPORT_RESULT = {
  categories: ['Pizzas', 'Mains'], existing_categories: ['Pizzas'],
  items: [
    { name: 'Margherita', price: 9.5, category: 'Pizzas', description: 'Classic', allergens: ['gluten', 'milk'], dietary: ['vegetarian'], _allergensChecked: true },
    { name: 'Calzone', price: 0, category: 'Pizzas', price_missing: true },
    { name: 'Pad Thai Chicken', price: 9, category: 'Mains', _variantOf: { key: 'pad-thai', baseName: 'Pad Thai', groupName: 'Protein', optionName: 'Chicken' } },
    { name: 'Pad Thai Prawn', price: 10.5, category: 'Mains', _variantOf: { key: 'pad-thai', baseName: 'Pad Thai', groupName: 'Protein', optionName: 'Prawn' } },
    { name: 'Burger', price: 8, category: 'Mains', modifierGroups: [{ name: 'Add-ons', options: [{ name: 'Cheese', price: 1, allergens: ['milk'] }, { name: 'Bacon', price: 1.5 }], isRequired: false, singleSelect: false }] },
  ],
}
const CARD_PARSE = { entries: [{ name: 'Margherita', allergens: ['gluten', 'milk'] }, { name: 'Mystery pie', allergens: ['eggs'] }], blanket: ['sesame'], cross_contamination: ['peanuts'], formatted_text: 'Margherita: gluten, milk\nMystery pie: eggs', summary: '2 dishes' }
const CARD_MATCH = { matched: [{ entry: { name: 'Margherita', allergens: ['gluten', 'milk'] }, dishId: 'i1' }], unmatched: [{ name: 'Mystery pie', allergens: ['eggs'] }], ambiguous: [] }

async function views(ctx) {
  const { kit, h, html, states, GB, US, inManage, PROVIDERS } = ctx
  const out = {}
  const ST = states(M_FILE, ['editingCat', 'editingItem', 'deletingItem', 'saving', 'subcatModalCat', 'importStep', 'reviewStep', 'importResult', 'catEdit', 'catEditError',
    'catDeleting', 'allergenSubStep', 'pendingDisplayMode', 'cardImportParsed', 'cardImportMatch', 'showCardUpload', 'cardImportProcessing', 'showDiscardConfirm',
    'importDoneSkipped', 'categoryPrep', 'importKitchenCapacity', 'scheduleRoute', 'schedVerifyError', 'schedVerifiedEvents', 'schedExtracted', 'showSetupIntro',
    'groupingChoice', 'importCatOpen', 'expandedCat', 'allergenStep', 'allergenExtracted', 'showAllergenModal', 'savedShown', 'demoImportMode', 'reviewVan',
    'mode', 'chooserMode', 'reviewView', 'stdShowUpload', 'stdCardParsed', 'stdCardMatch', 'drafts', 'sessionConfirmed', 'cardEditText',
    'rules', 'newTrigger', 'newSuggest', 'editingId', 'upsellAdding', 'editing', 'cardChoice', 'expanded'])
  let M
  try {
    M = await kit.bundle('lp1d-menu', [
      `export { MenuTab, ModifiersTab, DealsTab, UpsellRulesSection, AllergenWizardModal, CardUploadPage, SavedAllergenCard, CardOnlyEditor } from '@/${M_FILE}'`,
      "export { default as ExtrasEditor } from '@/components/manage/ExtrasEditor'",
      "export * as KC from '@/components/manage/KitchenCapacitySection'",
      PROVIDERS,
    ].join('\n'), {
      patches: [
        { file: M_FILE, append: 'export { MenuTab, ModifiersTab, DealsTab, UpsellRulesSection, AllergenWizardModal, CardUploadPage, SavedAllergenCard, CardOnlyEditor }' },
        { file: M_FILE, from: "import { createPortal } from 'react-dom'", to: 'const createPortal = (el: any) => el' },
        { file: M_FILE, states: ST },
        { file: 'components/manage/KitchenCapacitySection.tsx', states: states('components/manage/KitchenCapacitySection.tsx', ['vans', 'firstVanId', 'available', 'loading', 'busy', 'confirmAllSame']) },
        { file: 'components/manage/ExtrasEditor.tsx', states: states('components/manage/ExtrasEditor.tsx', ['expandedGroup', 'editingOption', 'priceInput', 'catOpen']) },
      ],
    })
  } catch (e) { for (const cc of ['GB', 'US']) out[`${cc}|bundle`] = 'ERROR ' + String(e.message).slice(0, 300); return out }
  const noop = () => {}
  const api = async () => ({})

  for (const C of [GB, US]) {
    const cc = C.cc
    const W = el => inManage(M, C, el)
    const truck = { ...C.truck }
    const menuProps = (o = {}) => ({ truck, categories: CATS, items: ITEMS, subcategories: SUBCATS, token: 'harness', modifierGroups: GROUPS, modifierOptions: OPTS, itemModGroups: ASSIGN,
      setItemModGroups: noop, api, reload: noop, showToast: noop, allergenWizardOpen: false, onCloseAllergenWizard: noop, onOpenAllergenWizard: noop, canEditAllergens: true,
      onWalkthroughChoice: noop, onVerifySuccess: noop, ...o })
    const menu = (k, st, o) => { out[`${cc}|menuTab|${k}`] = html({ editingCat: null, ...st }, W(h(M.MenuTab, menuProps(o)))) }
    // ── the list ──
    menu('list', {})
    menu('list|open', { expandedCat: 'c1' })
    menu('list|openSides', { expandedCat: 'c2' })
    menu('empty', {}, { categories: [], items: [], subcategories: [] })
    menu('cardMode', {}, { truck: { ...truck, allergen_display_mode: 'card', allergen_info_text: 'Ask staff about allergens.' } })
    menu('noEdit', { expandedCat: 'c1' }, { canEditAllergens: false })
    // ── editors ──
    menu('editCat|new', { editingCat: { prep_secs: 0, batch_size: 0, allow_notes: false } })
    menu('editCat|existing', { editingCat: CATS[0], expandedCat: 'c1' })
    menu('editItem|new', { editingItem: { category_id: 'c1', price: 0 } })
    menu('editItem|existing', { editingItem: ITEMS[0], savedShown: true })
    menu('editItem|spicy', { editingItem: ITEMS[1] })
    menu('deleteItem', { deletingItem: ITEMS[1] })
    menu('subcats', { subcatModalCat: 'c1' })
    menu('import|catRename', { importStep: 'review', importResult: IMPORT_RESULT, reviewStep: 1, catEdit: { from: 'Mains', value: 'Main dishes' } })
    menu('import|catRename|error', { importStep: 'review', importResult: IMPORT_RESULT, reviewStep: 1, catEdit: { from: 'Mains', value: 'Pizzas' }, catEditError: 'A category with that name already exists' })
    menu('import|catNew', { importStep: 'review', importResult: IMPORT_RESULT, reviewStep: 1, catEdit: { from: '', value: '' } })
    menu('import|catDelete', { importStep: 'review', importResult: IMPORT_RESULT, reviewStep: 1, catDeleting: { name: 'Mains', moveTo: 'Pizzas' } })
    // ── the old allergen modal ──
    menu('allergen|processing', { showAllergenModal: true, allergenStep: 'processing' })
    menu('allergen|review', { showAllergenModal: true, allergenStep: 'review', allergenExtracted: CARD_PARSE })
    menu('allergen|idle', { showAllergenModal: true, allergenStep: 'idle' })
    // ── the import wizard ──
    menu('import|upload', { importStep: 'upload' })
    menu('import|processing', { importStep: 'processing' })
    menu('import|offer', { importStep: 'offer', importResult: IMPORT_RESULT })
    menu('import|review1', { importStep: 'review', importResult: IMPORT_RESULT, reviewStep: 1 })
    menu('import|review2', { importStep: 'review', importResult: IMPORT_RESULT, reviewStep: 2, groupingChoice: { 'pad-thai': 'grouped' } })
    menu('import|review1|open', { importStep: 'review', importResult: IMPORT_RESULT, reviewStep: 1, importCatOpen: { Pizzas: true, Mains: true } })
    menu('import|discard', { importStep: 'review', importResult: IMPORT_RESULT, reviewStep: 1, showDiscardConfirm: true })
    for (const sub of ['chooser', 'card', 'review']) menu(`import|allergens|${sub}`, { importStep: 'allergens', importResult: IMPORT_RESULT, allergenSubStep: sub, pendingDisplayMode: sub === 'card' ? 'card' : 'per_dish' })
    menu('import|allergens|cardParsed', { importStep: 'allergens', importResult: IMPORT_RESULT, allergenSubStep: 'card', pendingDisplayMode: 'card', showCardUpload: true, cardImportParsed: CARD_PARSE, cardImportMatch: CARD_MATCH })
    menu('import|prep', { importStep: 'prep', importResult: IMPORT_RESULT, categoryPrep: { Pizzas: { prep_secs: 480, batch_size: 4 }, Mains: { prep_secs: null, batch_size: null } }, importKitchenCapacity: { kitchen_capacity: 6, capacity_window_mins: 10 } })
    menu('import|saving', { importStep: 'saving', importResult: IMPORT_RESULT })
    menu('import|done', { importStep: 'done', importResult: IMPORT_RESULT, importDoneSkipped: 1, pendingDisplayMode: 'per_dish' })
    const setupTruck = { ...truck, setup_step: 'menu' }
    menu('setup|intro', { importStep: 'offer', showSetupIntro: true, importResult: IMPORT_RESULT }, { truck: setupTruck })
    for (const r of ['chooser', 'website', 'photo', 'manual']) menu(`setup|schedule|${r}`, { importStep: 'schedule', scheduleRoute: r }, { truck: setupTruck })
    menu('setup|schedule|verifyError', { importStep: 'schedule', scheduleRoute: 'website', schedVerifyError: 'We couldn’t find any events on that page.' }, { truck: setupTruck })
    menu('setup|schedule|verified', { importStep: 'schedule', scheduleRoute: 'website', schedVerifiedEvents: [{ date: '2026-10-17', venue: 'The Green', town: 'Harnessville', start_time: '17:00', end_time: '21:00' }] }, { truck: setupTruck })
    menu('setup|schedule|extracted', { importStep: 'schedule', scheduleRoute: 'photo', schedExtracted: [{ date: '2026-10-17', venue_name: 'The Green', town: 'Harnessville', start_time: '17:00', end_time: '21:00' }] }, { truck: setupTruck })
    menu('setup|settings', { importStep: 'settings', reviewVan: { id: 'v1', kitchen_capacity: 6, order_ready_enabled: true, buzzer_count: 0 } }, { truck: setupTruck })
    menu('setup|done', { importStep: 'done', importResult: IMPORT_RESULT, importDoneSkipped: 0, pendingDisplayMode: 'per_dish' }, { truck: { ...truck, setup_step: 'schedule' } })

    // ── the allergen wizard ──
    const wizProps = (o = {}) => ({ items: ITEMS, categories: CATS, canEdit: true, onClose: noop, onConfirmRow: api, onUndoRow: api, onEditUnverify: api, showToast: noop,
      cardText: '', cardUrl: '', cardProcessing: false, onAddCard: noop, onSetDisplayMode: api, initialMode: 0, initialReviewView: 'list', onProcessCard: api, onCardMerge: api, ...o })
    const wiz = (k, st, o) => { out[`${cc}|wizard|${k}`] = html(st, W(h(M.AllergenWizardModal, wizProps(o)))) }
    wiz('chooser', {})
    wiz('chooser|perDish', { chooserMode: 'per_dish' })
    wiz('chooser|card', { chooserMode: 'card' })
    wiz('review|list', { mode: 1 })
    wiz('review|table', { mode: 1, reviewView: 'table' })
    wiz('review|confirmed', { mode: 1, sessionConfirmed: new Set(['i1']) })
    wiz('card', { mode: 2 })
    wiz('card|withText', { mode: 2 }, { cardText: 'Margherita: gluten, milk', cardUrl: 'https://example.test/card.pdf' })
    wiz('card|upload', { mode: 2, stdShowUpload: true })
    wiz('card|parsed', { mode: 2, stdCardParsed: CARD_PARSE, stdCardMatch: CARD_MATCH })
    wiz('mode3', { mode: 3 })
    wiz('import', { mode: 1 }, { importStepper: h('div', null, 'stepper'), onBack: noop })
    wiz('readOnly', { mode: 1 }, { canEdit: false })
    wiz('cardOnly', { mode: 2 }, { onSaveCard: api, onTranscribeCard: api, cardText: 'Ask staff' })
    if (M.SavedAllergenCard) out[`${cc}|savedCard`] = html({ expanded: true }, W(h(M.SavedAllergenCard, { text: 'Margherita: gluten, milk\nGarlic bread: gluten', url: 'https://example.test/card.pdf', clampClass: 'line-clamp-3' })))

    // ── extras & upsells ──
    const modProps = (o = {}) => ({ categories: CATS, items: ITEMS, modifierGroups: GROUPS, modifierOptions: OPTS, itemModGroups: ASSIGN, upsellRules: RULES,
      setModifierGroups: noop, setModifierOptions: noop, setItemModGroups: noop, api, reload: noop, showToast: noop, ...o })
    out[`${cc}|extras|list`] = html({}, W(h(M.ModifiersTab, modProps())))
    out[`${cc}|extras|open`] = html({ expandedGroup: 'g2', catOpen: { c1: true } }, W(h(M.ModifiersTab, modProps())))
    out[`${cc}|extras|editOption`] = html({ expandedGroup: 'g2', editingOption: OPTS[2], priceInput: '1.25' }, W(h(M.ModifiersTab, modProps())))
    out[`${cc}|extras|empty`] = html({}, W(h(M.ModifiersTab, modProps({ modifierGroups: [], modifierOptions: [], itemModGroups: [], upsellRules: [] }))))
    out[`${cc}|extras|upsellAdding`] = html({ upsellAdding: true }, W(h(M.ModifiersTab, modProps())))
    out[`${cc}|upsell|adding`] = html({ newTrigger: 'c1', newSuggest: 'c3' }, W(h(M.UpsellRulesSection, { initialRules: RULES, categories: CATS, api, showToast: noop, adding: true, setAdding: noop })))
    out[`${cc}|upsell|editing`] = html({ editingId: 'u1' }, W(h(M.UpsellRulesSection, { initialRules: RULES, categories: CATS, api, showToast: noop, adding: false, setAdding: noop })))
    out[`${cc}|upsell|empty`] = html({}, W(h(M.UpsellRulesSection, { initialRules: [], categories: CATS, api, showToast: noop, adding: false, setAdding: noop })))

    // ── deals ──
    const dealProps = (o = {}) => ({ categories: CATS, bundles: BUNDLES, setBundles: noop, api, reload: noop, showToast: noop, ...o })
    out[`${cc}|deals|list`] = html({}, W(h(M.DealsTab, dealProps())))
    out[`${cc}|deals|empty`] = html({}, W(h(M.DealsTab, dealProps({ bundles: [] }))))
    out[`${cc}|deals|new`] = html({ editing: { name: '', bundle_price: 0, is_available: true, apply_to_new_events: true, slot_1_category: null } }, W(h(M.DealsTab, dealProps())))
    out[`${cc}|deals|edit`] = html({ editing: BUNDLES[0] }, W(h(M.DealsTab, dealProps())))

    // ── kitchen capacity (Menu › Kitchen capacity) ──
    const KC = M.KC && M.KC.KitchenCapacitySection
    if (KC) {
      const vans = [{ id: 'v1', name: 'Van 1', kitchen_capacity: 6, capacity_window_mins: 10, categorySettings: [], same_as_first_van: false, capacity_same_as_first_van: false },
        { id: 'v2', name: 'Big van', kitchen_capacity: null, capacity_window_mins: null, categorySettings: [{ category_id: 'c1', prep_secs: 300, batch_size: 6, counts_toward_capacity: true }], same_as_first_van: false, capacity_same_as_first_van: true }]
      const kc = (k, st) => { out[`${cc}|capacity|${k}`] = html({ loading: false, available: true, firstVanId: 'v1', ...st }, W(h(KC, { categories: CATS, api, showToast: noop }))) }
      kc('oneVan', { vans: vans.slice(0, 1) })
      kc('twoVans', { vans })
      kc('confirmAllSame', { vans, confirmAllSame: true })
      kc('unavailable', { vans: vans.slice(0, 1), available: false })
      kc('loading', { loading: true, vans: [] })
    }
  }
  return out
}

module.exports = { views, CATS, ITEMS, SUBCATS, GROUPS, OPTS, ASSIGN, RULES, BUNDLES }
