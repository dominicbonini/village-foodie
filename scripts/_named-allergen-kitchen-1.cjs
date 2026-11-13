// scripts/_named-allergen-kitchen-1.cjs — ALLERGEN-KITCHEN-1 (13 November 2026, docs/allergen-kitchen-1-report.md) as NAMED changes,
// for the harnesses that pin what this work changed. PRECISE: each `undo…` takes exactly this work's edit out (found exactly once)
// and returns null when it is not there exactly as written — so any OTHER change still fails the harness that uses it.
//   • THE AI MENU READER (lib/menu-extract.ts): "may contain" is never a dish allergen — the stated-data rule loses its
//     "may contain" note, a new rule sends those allergens to one top-level "may_contain" list, and the response format gains it.
'use strict'

const RULE_BEFORE = `- ALLERGENS ARE STATED-DATA ONLY (same discipline as spiciness below — do NOT guess): extract an allergen
  ONLY when the source menu STATES it — an explicit label ('GF', 'VG', 'contains nuts', 'N'), a listed
  ingredient that is itself an allergen, or an allergen / "contains" / "may contain" note. NEVER infer an
  allergen from the dish NAME alone or from what a dish "probably" contains. If there is NO stated allergen
  data for an item, leave its allergens array EMPTY — do not guess.`
const RULE_NOW = `- ALLERGENS ARE STATED-DATA ONLY (same discipline as spiciness below — do NOT guess): a dish's allergens are ONLY
  the allergens the source menu states the dish CONTAINS — an explicit label ('GF', 'VG', 'contains nuts', 'N'), a
  listed ingredient that is itself an allergen, or an allergen / "contains" note. NEVER infer an allergen from the
  dish NAME alone or from what a dish "probably" contains. If there is NO stated allergen data for an item, leave
  its allergens array EMPTY — do not guess.
- "MAY CONTAIN" IS NEVER A DISH ALLERGEN: a "may contain" / "may contain traces of" / "prepared in a kitchen that
  handles…" / "made in an environment with…" note — whether it is printed on one dish or for the whole menu — must
  NOT go into ANY dish's allergens. Put the allergen names it mentions (same vocabulary) in the ONE top-level
  "may_contain" list instead (empty when the menu has no such note).`
const FORMAT_BEFORE = `Response format:
{
  "categories": ["Mains", "Sides", "Drinks"],`
const FORMAT_NOW = `Response format:
{
  "categories": ["Mains", "Sides", "Drinks"],
  "may_contain": [],`

const once = (s, part) => typeof s === 'string' && s.split(part).length === 2

/** The AI menu-reader PROMPT (or lib/menu-extract.ts's source) with this work's two edits taken out; null if either is not there
 *  exactly once. */
function undoMenuPrompt(text) {
  if (once(text, RULE_NOW) && once(text, FORMAT_NOW)) return text.replace(RULE_NOW, RULE_BEFORE).replace(FORMAT_NOW, FORMAT_BEFORE)
  // …or the same prompt as it travels inside a JSON request body (newlines and quotes escaped)
  const esc = s => JSON.stringify(s).slice(1, -1)
  if (once(text, esc(RULE_NOW)) && once(text, esc(FORMAT_NOW))) return text.replace(esc(RULE_NOW), esc(RULE_BEFORE)).replace(esc(FORMAT_NOW), esc(FORMAT_BEFORE))
  return null
}

// lib/menu-extract.ts's SOURCE also gained the type field and its return (for harnesses that hash the whole file).
const TYPE_ADDED = `  /** allergen-kitchen-1 (13 November 2026): the menu's "may contain" / traces / "prepared in a kitchen that…" allergens, ONE
   *  menu-level list — never put into a dish's allergens. The import adds them to the truck's kitchen list at commit
   *  (trucks.allergen_kitchen_extra). The extractor always sets it (empty when the menu has no such note); a hand-built extraction
   *  (the demo's fallback) may leave it out. */
  may_contain?: string[]
`
const RETURN_ADDED = `      may_contain: Array.isArray(parsed.may_contain) ? parsed.may_contain.filter((a: unknown): a is string => typeof a === 'string') : [],
`
/** lib/menu-extract.ts's source with ALL of this work's edits taken out (the prompt's two, the type field, the return); null if any
 *  is not there exactly once. */
function undoMenuExtractSource(src) {
  const p = undoMenuPrompt(src)
  if (p === null || !once(p, TYPE_ADDED) || !once(p, RETURN_ADDED)) return null
  return p.replace(TYPE_ADDED, '').replace(RETURN_ADDED, '')
}

// ── THE CUSTOMER ORDER PAGE AND THE MENU API, AS EXACT TEXT ─────────────────────────────────────────────────────────────────────
// For harnesses that pin these files to an older tree (cwv-2, costs-accounts-1): [NOW, BEFORE] pairs, generated from
// `git diff 0ff41a35` (the tree this work's code started from) and proven by the round trip in undoFile — applying every pair gives
// 0ff41a35's file exactly. The order page: the pop-up's kitchen list, the extras' allergens, the kitchenNames import, the
// kitchen_allergens field type. The menu API: the country list for the kitchen list, and truck.kitchen_allergens.
const BASE = '0ff41a35'
const FILE_HUNKS = {
 "app/(app)/trucks/[slug]/order/page.tsx": [
  [
   "import '@/lib/i18n/catalog/errorsCustomer'\nimport { dietaryLabel } from '@/lib/dietary-label'\nimport { kitchenNames } from '@/lib/allergen-kitchen'   // allergen-kitchen-1: \"Allergens handled in this kitchen\", as the customer reads it\nimport { allergenLabel } from '@/lib/allergen-label'   // france-1: a stored allergen label in the page's language (English: as stored)   // languages-1: a stored dietary tag in the truck's language\n\n",
   "import '@/lib/i18n/catalog/errorsCustomer'\nimport { dietaryLabel } from '@/lib/dietary-label'\nimport { isEnglish } from '@/lib/i18n/locales'   // order-page-2: the allergen pop-up keeps English's old order\nimport { allergenLabel } from '@/lib/allergen-label'   // france-1: a stored allergen label in the page's language (English: as stored)   // languages-1: a stored dietary tag in the truck's language\n\n"
  ],
  [
   "interface ModifierGroup { id: string; name: string; hide_name?: boolean; options: ModifierOption[]; is_required?: boolean; min_choices?: number; max_choices?: number }\ninterface TruckMenu { categories?: Array<{ id: string; name: string; prep_secs?: number | null; batch_size?: number | null; allowNotes?: boolean; modifierGroups?: ModifierGroup[]; subcategories?: Array<{ id: string; name: string; sort_order?: number }> }>; items: MenuItem[]; upsell_rules: UpsellRule[]; bundles: Bundle[] }\ninterface TruckData { id: string; name: string; logo: string | null; mode: 'village' | 'pub'; venue_name: string | null; time_selection_enabled?: boolean; paused?: boolean; pauseReason?: 'manual' | 'offline' | 'account_closing' | null; extra_wait_mins?: number; plan: string; preordering_on?: boolean; allergen_info_url?: string | null; allergen_info_text?: string | null; allergen_display_mode?: 'per_dish' | 'card' | 'both' | null; kitchen_allergens?: string[]; ordering_available?: boolean; allergensVerified?: boolean; preorder_open_rule?: string | null;\n  /** 🔴 The truck's zone and how its times and dates look (Phase 2B) — from /api/menu. */\n  time?: TimeSettings | null;\n",
   "interface ModifierGroup { id: string; name: string; hide_name?: boolean; options: ModifierOption[]; is_required?: boolean; min_choices?: number; max_choices?: number }\ninterface TruckMenu { categories?: Array<{ id: string; name: string; prep_secs?: number | null; batch_size?: number | null; allowNotes?: boolean; modifierGroups?: ModifierGroup[]; subcategories?: Array<{ id: string; name: string; sort_order?: number }> }>; items: MenuItem[]; upsell_rules: UpsellRule[]; bundles: Bundle[] }\ninterface TruckData { id: string; name: string; logo: string | null; mode: 'village' | 'pub'; venue_name: string | null; time_selection_enabled?: boolean; paused?: boolean; pauseReason?: 'manual' | 'offline' | 'account_closing' | null; extra_wait_mins?: number; plan: string; preordering_on?: boolean; allergen_info_url?: string | null; allergen_info_text?: string | null; allergen_display_mode?: 'per_dish' | 'card' | 'both' | null; ordering_available?: boolean; allergensVerified?: boolean; preorder_open_rule?: string | null;\n  /** 🔴 The truck's zone and how its times and dates look (Phase 2B) — from /api/menu. */\n  time?: TimeSettings | null;\n"
  ],
  [
   "                                selected ? 'bg-orange-600 border-orange-600 text-white' : lock ? 'bg-slate-50 border-slate-200 text-slate-400 line-through cursor-not-allowed opacity-60' : `bg-white text-slate-700 hover:border-orange-300 ${isUnmet ? 'border-amber-300' : 'border-slate-200'}`\n                              }`}>\n                              {/* allergen-kitchen-1 (Dominic approved, reversing V7.8 §31): an extra's allergens under its name, small and orange,\n                                  translated — only when it has any, and only in per-dish mode (card mode shows the card instead). */}\n                              <span className=\"flex flex-col items-start leading-tight\">\n                                <span>{opt.name}</span>\n                                {truck?.allergen_display_mode !== 'card' && (opt.allergens?.length ?? 0) > 0 && (\n                                  <span className={`text-[11px] font-medium ${selected ? 'text-orange-100' : 'text-orange-600'}`} data-option-allergens>\n                                    {(opt.allergens || []).map(a => allergenLabel(a, pageLocale)).join(', ')}\n                                  </span>\n                                )}\n                              </span>\n                              {opt.price_adjustment > 0 && <span className={selected ? 'text-orange-200' : 'text-orange-500'}>+{amount(opt.price_adjustment)}</span>}\n                              {/* \"N left\" / sold-out (basket-aware) — shared badge, same thresholds as item stock. */}\n                              <OptionStockBadge remaining={rem} />\n                            </button>\n                          )\n",
   "                                selected ? 'bg-orange-600 border-orange-600 text-white' : lock ? 'bg-slate-50 border-slate-200 text-slate-400 line-through cursor-not-allowed opacity-60' : `bg-white text-slate-700 hover:border-orange-300 ${isUnmet ? 'border-amber-300' : 'border-slate-200'}`\n                              }`}>\n                              <span>{opt.name}</span>\n                              {opt.price_adjustment > 0 && <span className={selected ? 'text-orange-200' : 'text-orange-500'}>+{amount(opt.price_adjustment)}</span>}\n                              {/* \"N left\" / sold-out (basket-aware) — shared badge, same thresholds as item stock. */}\n                              <OptionStockBadge remaining={rem} />\n                              {/* Allergen chip removed from selection (V7.8 §31) — a single named ingredient is\n                                  self-evidently its allergen; the data still travels to the order + email (§25). */}\n                            </button>\n                          )\n"
  ],
  [
   "              const mode = truck?.allergen_display_mode\n              const showCard = mode === 'card' && !!(truck?.allergen_info_url || truck?.allergen_info_text)\n              // allergen-kitchen-1 (13 Nov 2026): per-dish mode lists \"Allergens handled in this kitchen\" — the server's kitchen list\n              // (/api/menu kitchen_allergens: confirmed active dishes ∪ available extras ∪ what the truck added; lib/allergen-kitchen.ts).\n              // Each name in the page's language, sorted as before (order-page-2: English by stored label, others by the shown name).\n              const kitchen = mode !== 'card' ? kitchenNames(truck?.kitchen_allergens ?? [], pageLocale) : []\n              if (!showCard && kitchen.length === 0) {\n                // Honest fallback — never invents data; directs to a human.\n                return (\n",
   "              const mode = truck?.allergen_display_mode\n              const showCard = mode === 'card' && !!(truck?.allergen_info_url || truck?.allergen_info_text)\n              const perItem = mode !== 'card'\n                ? [...new Set((menu?.items ?? []).flatMap(i => i.allergens ?? []))].sort()\n                : []\n              // order-page-2 (13 Nov 2026): each name in the page's language — the SAME allergenLabel(…, pageLocale) the dish\n              // chips use (it showed the stored English label: \"Celery\" on a French page). Names only; which allergens\n              // are listed is unchanged. Sorted by the shown name in the page's language; English keeps the old order exactly (a stable no-op sort).\n              const perItemShown = perItem.map(a => ({ a, label: allergenLabel(a, pageLocale) }))\n                .sort((x, y) => isEnglish(pageLocale) ? 0 : x.label.localeCompare(y.label, pageLocale))\n              if (!showCard && perItem.length === 0) {\n                // Honest fallback — never invents data; directs to a human.\n                return (\n"
  ],
  [
   "                    <p className=\"text-sm text-slate-600 whitespace-pre-wrap\">{truck.allergen_info_text}</p>\n                  )}\n                  {kitchen.length > 0 && (\n                    <div data-kitchen-allergens>\n                      <p className=\"text-xs font-semibold text-slate-500 mb-1\">{tOrder('kitchenHeading')}</p>\n                      <div className=\"flex flex-wrap gap-1\">\n                        {kitchen.map(label => (\n                          <span key={label} className=\"text-xs px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg\">{label}</span>\n                        ))}\n                      </div>\n                      <p className=\"text-xs text-slate-400 mt-1\">{tOrder('kitchenNote')}</p>\n                    </div>\n                  )}\n",
   "                    <p className=\"text-sm text-slate-600 whitespace-pre-wrap\">{truck.allergen_info_text}</p>\n                  )}\n                  {perItem.length > 0 && (\n                    <div>\n                      <p className=\"text-xs font-semibold text-slate-500 mb-1\">{tOrder('allergensUsed')}</p>\n                      <div className=\"flex flex-wrap gap-1\">\n                        {perItemShown.map(({ a, label }) => (\n                          <span key={a} className=\"text-xs px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg\">{label}</span>\n                        ))}\n                      </div>\n                      <p className=\"text-xs text-slate-400 mt-1\">{tOrder('allergensSeeEach')}</p>\n                    </div>\n                  )}\n"
  ]
 ],
 "app/api/menu/[truckId]/route.ts": [
  [
   "import { moneyFormatForTruck } from '@/lib/money-server'\nimport { countrySettingsForTruck } from '@/lib/country-settings'   // allergen-card-country\nimport { kitchenAllergens, type KitchenDish, type KitchenOption } from '@/lib/allergen-kitchen'   // allergen-kitchen-1\nimport type { AllergenSet } from '@/lib/allergens'\n// Phase 3 screens: what the order page needs to SHOW tax, a tip and a service fee (never to decide them).\nimport { loadChargeRules } from '@/lib/order-charge-rules'\n",
   "import { moneyFormatForTruck } from '@/lib/money-server'\nimport { countrySettingsForTruck } from '@/lib/country-settings'   // allergen-card-country\n// Phase 3 screens: what the order page needs to SHOW tax, a tip and a service fee (never to decide them).\nimport { loadChargeRules } from '@/lib/order-charge-rules'\n"
  ],
  [
   "  }\n  const allergenDisplayMode = ((truck.allergen_display_mode ?? null) === 'card' && !cardOnlyAllowed ? 'per_dish' : (truck.allergen_display_mode ?? null)) as 'per_dish' | 'card' | 'both' | null\n  // allergen-kitchen-1 (13 November 2026): the country's allergen list, for \"Allergens handled in this kitchen\" (per-dish mode only —\n  // card mode shows the card, so it is never read there). A country that cannot be read uses the UK list, as every allergen reader does.\n  let kitchenSet: AllergenSet = 'uk14'\n  if (allergenDisplayMode !== 'card') {\n    try { kitchenSet = (await countrySettingsForTruck(truck)).allergenSet } catch { kitchenSet = 'uk14' }\n  }\n\n  // Fetch all menu data from Supabase\n",
   "  }\n  const allergenDisplayMode = ((truck.allergen_display_mode ?? null) === 'card' && !cardOnlyAllowed ? 'per_dish' : (truck.allergen_display_mode ?? null)) as 'per_dish' | 'card' | 'both' | null\n\n  // Fetch all menu data from Supabase\n"
  ],
  [
   "      // the customer page treats it as 'both' (show whatever exists) for backward compatibility.\n      allergen_display_mode: allergenDisplayMode,   // allergen-card-country: 'card' read as 'per_dish' where the country does not allow it\n      // allergen-kitchen-1: \"Allergens handled in this kitchen\" — the truck's CONFIRMED active dishes ∪ its available extras ∪ the\n      // allergens it added (lib/allergen-kitchen.ts, the one definition). Labels of the country's list only, nothing else. Per-dish\n      // mode only (card mode: [] — the card is the display there).\n      kitchen_allergens: allergenDisplayMode === 'card' ? [] : kitchenAllergens({\n        dishes: (items || []) as KitchenDish[], options: (modifierOptions || []) as KitchenOption[],\n        extra: (truck as { allergen_kitchen_extra?: unknown }).allergen_kitchen_extra as unknown[] | null, allergenSet: kitchenSet,\n      }).all,\n      preorder_open_rule: ((truck as any).preorder_open_rule ?? null) as string | null,   // V8.3 calendar \"opens [date]\"\n      ordering_available: orderingAvailable,\n",
   "      // the customer page treats it as 'both' (show whatever exists) for backward compatibility.\n      allergen_display_mode: allergenDisplayMode,   // allergen-card-country: 'card' read as 'per_dish' where the country does not allow it\n      preorder_open_rule: ((truck as any).preorder_open_rule ?? null) as string | null,   // V8.3 calendar \"opens [date]\"\n      ordering_available: orderingAvailable,\n"
  ]
 ]
}
/** `text` (that file as it is now) with this work's edits taken out — 0ff41a35's file; null when any pair is not there exactly once. */
function undoFile(file, text) {
  const hunks = FILE_HUNKS[file]
  if (!hunks || typeof text !== 'string') return null
  let t = text
  for (const [now, before] of hunks) { if (t.split(now).length !== 2) return null; t = t.replace(now, before) }
  return t
}

// ── MANAGE MARKUP (Language Phase identity views): PRECISE transforms of BEFORE's markup → this work's, with the existing words ──
const fs = require('fs'); const path = require('path'); const os = require('os')
const REPO = path.resolve(__dirname, '..')
let WORDS = null
const words = cc => {
  if (!WORDS) {
    const gb = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8'))
    const us = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-US.json'), 'utf8'))
    const pick = (o, k) => k.split('.').reduce((a, b) => (a == null ? a : a[b]), o)
    const w = (o, k) => pick(o, k) ?? pick(gb, k)
    const mk = o => ({ recipeWizard: w(o, 'manageAllergens.wizard.recipeOnly'), recipeItem: w(o, 'manageMenu.item.recipeOnly'), kitchenLine: w(o, 'manageMenu.allergens.kitchenLine'),
      kitchenEdit: w(o, 'manageMenu.allergens.kitchenEdit'), blanketInfo: w(o, 'manageAllergens.cardUpload.blanketInfo'), viewOnly: w(o, 'manageMenu.allergens.viewOnly'),
      modeCard: w(o, 'manageMenu.allergens.modeCard'), buildFirst: w(o, 'manageMenu.allergens.buildFirst'), itemAllergens: w(o, 'manageMenu.item.allergens') })
    WORDS = { GB: mk(gb), US: mk(us) }
  }
  return WORDS[cc]
}
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The kitchen list a fixture's dishes and extras give (lib/allergen-kitchen.ts itself, bundled once), as the Menu tab names it. */
let LIB = null
function kitchenList(dishes, options, extra, locale) {
  if (!LIB) {
    const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-ak1n-'))
    fs.writeFileSync(path.join(dir, 'e.ts'), "export * from '@/lib/allergen-kitchen'\n")
    esbuild.buildSync({ entryPoints: [path.join(dir, 'e.ts')], bundle: true, outfile: path.join(dir, 'b.cjs'), platform: 'node', format: 'cjs', logLevel: 'error', alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')] })
    LIB = require(path.join(dir, 'b.cjs'))
  }
  return LIB.kitchenNames(LIB.kitchenAllergens({ dishes, options, extra, allergenSet: 'uk14' }).all, locale).join(', ') || '—'
}

/** Manage › Menu › Allergens: "Kitchen also handles: {list} · Edit" after the "Display mode…" line — per-dish mode with a menu only;
 *  Edit only where the section offers "Set up / review allergens" (not view-only). `list` = the fixture's kitchen list. */
function menuKitchenLine(s, cc, list) {
  if (typeof s !== 'string') return s
  const W = words(cc)
  const open = '<h3 class="text-sm font-bold text-slate-900">'
  const at = s.indexOf(open)
  if (at < 0) return s
  const p0 = s.indexOf('<p class="text-xs text-slate-500 mt-0.5">', at)
  const p1 = p0 < 0 ? -1 : s.indexOf('</p>', p0)
  if (p1 < 0) return s
  const para = s.slice(p0, p1)
  if (para.includes(esc(W.buildFirst)) || para.includes(`<strong>${esc(W.modeCard)}</strong>`)) return s   // no menu / card mode: no line
  const sectionEnd = s.indexOf('<h2', p1) < 0 ? s.length : s.indexOf('<h2', p1)
  const viewOnly = s.slice(p1, sectionEnd).includes(esc(W.viewOnly))
  const line = `<p class="text-xs text-slate-500 mt-1" data-kitchen-line="true">${esc(W.kitchenLine.replace('{list}', list))}` +
    (viewOnly ? '' : ` · <button type="button" class="font-semibold text-orange-600 underline hover:text-orange-700" data-kitchen-edit="true">${esc(W.kitchenEdit)}</button>`) + '</p>'
  return s.slice(0, p1 + 4) + line + s.slice(p1 + 4)
}

/** The wizard's review footer and the import's Allergens-step footer: Back + the main button on one row, Skip a centred text link. */
const SKIP_LINK = t => `<div class="mt-2 text-center"><button type="button" class="text-xs font-semibold text-slate-500 underline hover:text-slate-700">${t}</button></div>`
const BTN = '<button(?: disabled="")? class="[^"]*">[^<]*</button>'
function footers(s) {
  if (typeof s !== 'string') return s
  return s
    .replace(new RegExp(`<div class="p-4 border-t border-slate-200 flex items-center gap-2 shrink-0">((?:<button class="bg-slate-100[^"]*">[^<]*</button>)?)<div class="flex-1"></div><button class="hover:bg-slate-100 text-slate-600 border border-slate-200 [^"]*">([^<]*)</button>(${BTN})</div>`, 'g'),
      (_, back, skip, main) => `<div class="px-4 pt-4 pb-2 border-t border-slate-200 shrink-0"><div class="flex items-center gap-2">${back}<div class="flex-1"></div>${main}</div>${SKIP_LINK(skip)}</div>`)
    .replace(new RegExp(`<div class="p-5 border-t border-slate-100 flex items-center gap-2 shrink-0">(${BTN})<div class="flex-1"></div><button class="hover:bg-slate-100 text-slate-600 border border-slate-200 [^"]*">([^<]*)</button>(${BTN})</div>`, 'g'),
      (_, back, skip, main) => `<div class="px-5 pt-4 pb-3 border-t border-slate-100 shrink-0"><div class="flex items-center gap-2">${back}<div class="flex-1"></div>${main}</div>${SKIP_LINK(skip)}</div>`)
}

/** "Only what's in this dish's recipe." under "Allergens": the review list, the table's ALLERGENS header, the item editor. */
function recipeLines(s, cc) {
  if (typeof s !== 'string') return s
  const W = words(cc)
  return s
    .replace(/<p class="text-\[10px\] font-semibold text-slate-400 uppercase tracking-wide mb-1">([^<]*)<\/p>/g,
      (_, label) => `<p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">${label}</p><p class="text-[11px] text-slate-400 mb-1">${esc(W.recipeWizard)}</p>`)
    .replace(/(<th col[sS]pan="\d+" class="bg-amber-100 border-b border-r border-slate-200 text-center text-\[11px\] font-bold text-amber-700 uppercase tracking-wide py-1">[^<]*)<\/th>/g,
      (_, head) => `${head}<span class="block text-[10px] font-medium normal-case tracking-normal text-amber-700/80">${esc(W.recipeWizard)}</span></th>`)
    .replace(new RegExp(`(<label class="text-xs font-semibold text-slate-500 uppercase tracking-wide">${reEsc(esc(W.itemAllergens))}</label>)(<p class="text-xs text-slate-400 mt-0\\.5 mb-2">)`, 'g'),
      (_, label, next) => `${label}<p class="text-xs text-slate-400 mt-0.5">${esc(W.recipeItem)}</p>${next}`)
}

/** The card page: the "may be present across all dishes" checkbox becomes the info line (no checkbox), names translated (English: as stored). */
function blanketLine(s, cc) {
  if (typeof s !== 'string') return s
  const W = words(cc)
  return s.replace(/<label class="flex items-start gap-2 rounded-xl border border-slate-200 p-3 cursor-pointer"><input type="checkbox" class="mt-0\.5"\/?>(?:<\/input>)?<span class="text-xs text-slate-600">[\s\S]*?<strong>([^<]*)<\/strong>[\s\S]*?<\/span><\/label>/g,
    (_, list) => `<p class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800" data-blanket-info="true">${esc(W.blanketInfo.replace('{list}', list.replace(/&amp;/g, '&')))}</p>`)
}

// ── THE CUSTOMER ORDER PAGE (Language Phase identity views) ───────────────────────────────────────────────────────────────────
// The words BEFORE these views were captured with (0ff41a35's message files) → today's; and the markup changes, PRECISE.
let OLD = null
const oldWords = cc => {
  if (!OLD) {
    const { execFileSync } = require('child_process')
    const at = f => JSON.parse(execFileSync('git', ['show', `${BASE}:messages/${f}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 }))
    const gb = at('en-GB.json'), us = at('en-US.json')
    const o = (x, k) => x.order?.[k] ?? gb.order[k]
    OLD = { GB: { used: gb.order.allergensUsed, see: gb.order.allergensSeeEach, severe: gb.order.allergenSevere }, US: { used: o(us, 'allergensUsed'), see: o(us, 'allergensSeeEach'), severe: o(us, 'allergenSevere') } }
  }
  return OLD[cc]
}
const newOrderWords = cc => {
  const gb = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8')).order
  const us = { ...gb, ...(JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-US.json'), 'utf8')).order || {}) }
  const w = cc === 'US' ? us : gb
  return { heading: w.kitchenHeading, note: w.kitchenNote, severe: w.allergenSevere }
}
/** The Allergen info pop-up (per-dish): "Allergens used in this menu" + the dishes' union + "See each dish…" → "Allergens handled in
 *  this kitchen" + the kitchen list (the same chips: this fixture's kitchen list is its dishes' Gluten, Dairy) + the new note. An extra's
 *  name is wrapped for its allergens line (none here: no fixture extra has any). */
function orderPageView(s, cc) {
  if (typeof s !== 'string') return s
  const o = oldWords(cc), n = newOrderWords(cc)
  let out = s.replace(`<div><p class="text-xs font-semibold text-slate-500 mb-1">${esc(o.used)}</p><div class="flex flex-wrap gap-1">`,
    `<div data-kitchen-allergens="true"><p class="text-xs font-semibold text-slate-500 mb-1">${esc(n.heading)}</p><div class="flex flex-wrap gap-1">`)
  out = out.replace(`<p class="text-xs text-slate-400 mt-1">${esc(o.see)}</p>`, `<p class="text-xs text-slate-400 mt-1">${esc(n.note)}</p>`)
  // (the severe-allergy line's NEW sentence is a word change, not markup: these views render an existing key in its frozen words, and
  //  the word itself is checked by the harnesses' word checks — order.allergenSevere is named as reworded there.)
  out = out.replace(/(<button(?: disabled="")? class="flex items-center gap-1\.5 text-sm font-bold px-3\.5 py-2 transition-all active:scale-95 border-2 rounded-xl[^"]*">)<span>([^<]*)<\/span>/g,
    (_, btn, name) => `${btn}<span class="flex flex-col items-start leading-tight"><span>${name}</span></span>`)
  return out
}

/** Every Manage change at once (order matters only in that each acts on its own markup). */
function manageView(s, cc, list) { return menuKitchenLine(blanketLine(recipeLines(footers(s), cc), cc), cc, list) }

module.exports = { undoMenuPrompt, undoMenuExtractSource, undoFile, FILE_HUNKS, BASE, RULE_BEFORE, RULE_NOW, FORMAT_BEFORE, FORMAT_NOW,
  kitchenList, menuKitchenLine, footers, recipeLines, blanketLine, manageView, orderPageView, words, esc, reEsc }
