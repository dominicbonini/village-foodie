// scripts/allergen-kitchen-1.cjs — allergen-kitchen-1 (13 November 2026, docs/allergen-kitchen-1-report.md): "Contains" per dish +
// one "kitchen handles" list. SWEPT (no browser, no network, no database). The browser half is scripts/allergen-kitchen-1-live.cjs.
//   §1 lib/allergen-kitchen.ts — the kitchen list = (confirmed active dishes) ∪ (available extras) ∪ (the truck's own list); only the
//      country list's labels count (a dietary tag, a generic, another country's label never do); the customer's names and order.
//   §2 a card's blanket NEVER reaches a dish: the import's commit has no blanket merge, the "may be present" checkbox and its state
//      (cardBlanketOptIn, the dead stdBlanket) are gone, the card page shows the info line in the truck's words; the card's blanket
//      AND may_contain go to the kitchen list (standalone: staged for the last page; import: staged until commit).
//   §3 the AI menu reader: "may contain" is never a dish allergen — one menu-level may_contain list, carried to the commit.
//   §4 the server: update_settings allows the two new columns (owner/admin gate, country-list filter, the server's clock, audit
//      'kitchen' / kitchen_edit / kitchen_confirm); /api/menu returns kitchen_allergens (per-dish only) from the one definition.
//   §5 the words: every new key in every language base (placeholders kept), the removed keys gone everywhere, and the severe-allergy
//      line NEW in EVERY locale (no locale resolves to its old sentence).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
require('./_harness-tmp.cjs') // tmp-cleanup-1: temp goes under $TMPDIR/hatchgrab-harness/ and is removed on exit ("Disk space")
const fs = require('fs'); const os = require('os'); const path = require('path'); const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 700)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const J = JSON.stringify

function load() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-ak1-'))
  const entry = path.join(dir, 'e.ts')
  fs.writeFileSync(entry, `export * from '@/lib/allergen-kitchen'\nexport { translatorFor } from '@/lib/i18n/translator'\nexport { LOCALES, LANGUAGE_BASES, isEnglish } from '@/lib/i18n/locales'\nexport { allergenVocab } from '@/lib/allergens'\nimport '@/lib/i18n/catalog/order'\nimport '@/lib/i18n/catalog/manageAllergens'\nimport '@/lib/i18n/catalog/manageMenu'\n`)
  esbuild.buildSync({ entryPoints: [entry], bundle: true, outfile: path.join(dir, 'b.cjs'), platform: 'node', format: 'cjs', logLevel: 'error', alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')] })
  return require(path.join(dir, 'b.cjs'))
}
const K = load()

head('1 · lib/allergen-kitchen.ts — the one definition')
{
  const dishes = [
    { allergens: ['Gluten', 'Dairy', 'Lactose'], allergens_verified: true },            // confirmed (Lactose: not in the UK 14 → dropped)
    { allergens: ['Fish'], allergens_verified: null },                                  // legacy null → counts (as the customer route)
    { allergens: ['Celery'], allergens_verified: false },                               // unconfirmed → does NOT count
    { allergens: ['Mustard'], allergens_verified: true, is_active: false },             // inactive → does NOT count
    { allergens: ['Nuts', 'Vegan'], allergens_verified: true },                          // a generic and a dietary tag → never count
  ]
  const options = [
    { allergens: ['Eggs'], available: true },
    { allergens: ['Lupin'], available: false },                                         // unavailable extra → does NOT count
    { allergens: ['Soy'] },                                                              // available by default
  ]
  const r = K.kitchenAllergens({ dishes, options, extra: ['Sesame', 'Dairy', 'Vegetarian', 'Milk', 42], allergenSet: 'uk14' })
  t(`fromMenu = confirmed active dishes ∪ available extras, UK-14 labels only, in the list's order: ${r.fromMenu.join(', ')}`, J(r.fromMenu) === J(['Gluten', 'Eggs', 'Fish', 'Soy', 'Dairy']), r)
  t(`added = the truck's own list, UK-14 labels only (Vegetarian, the US "Milk" and a number dropped): ${r.added.join(', ')}`, J(r.added) === J(['Dairy', 'Sesame']), r)
  t(`all = their union, once each, in the list's order: ${r.all.join(', ')}`, J(r.all) === J(['Gluten', 'Eggs', 'Fish', 'Soy', 'Dairy', 'Sesame']), r)
  const us = K.kitchenAllergens({ dishes: [{ allergens: ['Milk', 'Dairy', 'Wheat'] }], options: [], extra: ['Sesame'], allergenSet: 'us9' })
  t(`the country's list decides: a US truck counts Milk/Wheat/Sesame, not the UK "Dairy": ${us.all.join(', ')}`, J(us.all) === J(['Milk', 'Wheat', 'Sesame']), us)
  const empty = K.kitchenAllergens({ dishes: [], options: [], extra: null, allergenSet: undefined })
  t('nothing confirmed, nothing added → an empty list (the pop-up then says "Allergen info not provided")', J(empty.all) === '[]')
  t(`English names keep the stored A→Z order: ${K.kitchenNames(['Sesame', 'Dairy', 'Gluten', 'Dairy'], 'en-GB').join(', ')}`, J(K.kitchenNames(['Sesame', 'Dairy', 'Gluten', 'Dairy'], 'en-GB')) === J(['Dairy', 'Gluten', 'Sesame']))
  const fr = K.kitchenNames(['Sesame', 'Dairy', 'Gluten', 'Tree nuts'], 'fr-FR')
  t(`French names, sorted by the shown name: ${fr.join(', ')}`, J(fr) === J([...fr].sort((a, b) => a.localeCompare(b, 'fr-FR'))) && fr.includes('Lait') && fr.includes('Fruits à coque'), fr)
}

head('2 · a card\'s blanket NEVER reaches a dish')
const PAGE = read('app/(app)/manage/[token]/page.tsx')
{
  const commit = PAGE.slice(PAGE.indexOf('const handleCommitMenu = async'), PAGE.indexOf('const handleCommitMenu = async') + 6000)
  t('the import commit has no blanket merge (no mergeAllergensUnion, no `blanket` applied to itemsToCommit)', !/mergeAllergensUnion/.test(commit) && !/itemsToCommit\s*=\s*itemsToCommit\.map\([^)]*blanket/.test(commit) && !/cardImportParsed\?\.blanket\s*\n\s*if/.test(commit))
  t('the "may be present across all dishes" checkbox state is gone (cardBlanketOptIn, stdBlanket, blanketOptIn, onBlanketToggle)', !/cardBlanketOptIn|stdBlanket\b|setStdBlanket|blanketOptIn|onBlanketToggle/.test(PAGE))
  const cup = PAGE.slice(PAGE.indexOf('function CardUploadPage('), PAGE.indexOf('function SavedAllergenCard('))
  t('the card page shows the info line, no checkbox, with the names in the truck\'s words (allergenLabel)', !/type="checkbox"/.test(cup) && /t\('cardUpload\.blanketInfo', \{ list: parsed\.blanket\.map\(a => allergenLabel\(a, cardLocale\)\)\.join\(', '\) \}\)/.test(cup))
  t('mergeAllergensUnion is still used ONLY for a card\'s per-dish ENTRIES (a named dish\'s allergens), never with blanket',
    (PAGE.match(/mergeAllergensUnion\(/g) || []).length === 2 && !/mergeAllergensUnion\([^)]*blanket/.test(PAGE))
  t('standalone wizard: the card\'s blanket + may_contain are staged for the last page (stdKitchenStaged), country-list labels only',
    /setStdKitchenStaged\(onlyListed\(\[\.\.\.\(parsed\.blanket \|\| \[\]\), \.\.\.\(parsed\.may_contain \|\| \[\]\)\], allergenSet\)\)/.test(PAGE))
  t('import: the card\'s blanket + may_contain and the menu\'s may_contain are staged (importKitchenStaged) and written to the kitchen list after the commit',
    /const importKitchenStaged = onlyListed\(\[\.\.\.\(cardImportParsed\?\.blanket \|\| \[\]\), \.\.\.\(cardImportParsed\?\.may_contain \|\| \[\]\), \.\.\.importMenuMayContain\], menuAllergenSet\)/.test(PAGE)
    && /api\('update_settings', \{ allergen_kitchen_extra: importKitchenFinal, allergens_confirmed_at: true \}\)/.test(PAGE)
    && /api\('update_settings', \{ allergen_kitchen_extra: next \}\)/.test(PAGE))
  t('the card\'s may_contain still reaches the saved card text, as before (manageMenuImport.allergenCardText.mayContain)', /ti\('allergenCardText\.mayContain'/.test(PAGE))
}

head('3 · the AI menu reader')
{
  const ME = read('lib/menu-extract.ts')
  t('the old rule that took a "may contain" note into a dish\'s allergens is gone', !/allergen \/ "contains" \/ "may contain" note/.test(ME))
  t('"MAY CONTAIN" IS NEVER A DISH ALLERGEN — a menu-level "may_contain" list instead', /"MAY CONTAIN" IS NEVER A DISH ALLERGEN/.test(ME) && /"may_contain": \[\],/.test(ME))
  t('the extractor returns may_contain (strings only)', /may_contain: Array\.isArray\(parsed\.may_contain\) \? parsed\.may_contain\.filter/.test(ME))
  t('the import keeps it for the commit (process-menu and the demo extraction)', /setImportMenuMayContain\(Array\.isArray\(data\.may_contain\)/.test(PAGE) && /setImportMenuMayContain\(Array\.isArray\(extraction\?\.may_contain\)/.test(PAGE))
}

head('4 · the server')
{
  const R = read('app/api/manage/route.ts')
  const us = R.slice(R.indexOf("if (action === 'update_settings')"), R.indexOf("if (action === 'get_upload_url')"))
  t('update_settings allows allergen_kitchen_extra and allergens_confirmed_at', /'allergen_kitchen_extra', 'allergens_confirmed_at',/.test(us))
  t('…keeps only the country list\'s labels (onlyListed) and stamps the confirmation with the SERVER\'s clock', /onlyListed\(Array\.isArray\(safeData\.allergen_kitchen_extra\)/.test(us) && /safeData\.allergens_confirmed_at = new Date\(\)\.toISOString\(\)/.test(us))
  t('…owner/admin only (the allergen gate) when the list changes or the confirmation is sent', /if \(\(touchedAllergenKeys\.length \|\| kitchenChanged \|\| kitchenConfirmed\) && !canEditAllergens\) return allergenForbidden\(\)/.test(us))
  t('…audited: field \'kitchen\', change_type kitchen_edit / kitchen_confirm', /change_type: 'kitchen_edit' as const, field: 'kitchen' as const/.test(us) && /change_type: 'kitchen_confirm' as const, field: 'kitchen' as const/.test(us)
    && /'kitchen_edit' \| 'kitchen_confirm'/.test(read('lib/allergen-audit.ts')))
  const M = read('app/api/menu/[truckId]/route.ts')
  t('/api/menu returns kitchen_allergens from the one definition, per-dish only ([] in card mode)', /kitchen_allergens: allergenDisplayMode === 'card' \? \[\] : kitchenAllergens\(\{/.test(M))
  t('/api/menu still sends each extra\'s allergens (what the dish pop-up shows) and nothing new besides allergens', /allergens: \(o\.allergens as string\[\]\) \|\| \[\],/.test(M))
  const MIG = read('supabase/migrations/20261101_allergen_kitchen.sql')
  t('migration 20261101: the two columns, the audit field CHECK with \'kitchen\', no backfill', /add column if not exists allergen_kitchen_extra text\[\] not null default '\{\}'/.test(MIG) && /add column if not exists allergens_confirmed_at timestamptz null/.test(MIG)
    && /'card', 'kitchen'/.test(MIG) && !/\bupdate public\./.test(MIG))
}

head('5 · the words, in every language')
{
  const NEW = ['manageAllergens.wizard.recipeOnly', 'manageAllergens.wizard.tooMany', 'manageMenu.item.recipeOnly', 'manageMenu.item.tooMany', 'manageAllergens.wizard.subtitle.kitchen',
    'manageAllergens.kitchen.title', 'manageAllergens.kitchen.body', 'manageAllergens.kitchen.legendDishes', 'manageAllergens.kitchen.legendAdded', 'manageAllergens.kitchen.customersSee',
    'manageAllergens.kitchen.confirm', 'manageAllergens.cardUpload.blanketInfo', 'manageMenu.allergens.kitchenLine', 'manageMenu.allergens.kitchenEdit', 'order.kitchenHeading', 'order.kitchenNote', 'order.allergenSevere']
  const REMOVED = ['manageAllergens.cardUpload.blanket', 'order.allergensUsed', 'order.allergensSeeEach']
  const L = (o, k) => k.split('.').reduce((a, b) => (a == null ? a : a[b]), o)
  const msg = l => JSON.parse(read(`messages/${l}.json`))
  const en = msg('en-GB')
  const missing = [], placeholders = []
  for (const base of K.LANGUAGE_BASES) {
    const o = msg(base)
    for (const k of NEW) {
      const v = L(o, k)
      if (typeof v !== 'string' || !v.trim()) { missing.push(`${base}:${k}`); continue }
      for (const ph of (L(en, k).match(/\{(count|list)\}/g) || [])) if (!v.includes(ph.slice(0, -1))) placeholders.push(`${base}:${k}:${ph}`)
    }
  }
  t(`every new key is in every language base (${K.LANGUAGE_BASES.length} bases × ${NEW.length} keys)`, missing.length === 0, missing.slice(0, 20))
  t('every {count} / {list} placeholder is kept', placeholders.length === 0, placeholders.slice(0, 20))
  const files = fs.readdirSync(path.join(REPO, 'messages')).filter(f => f.endsWith('.json'))
  const left = files.flatMap(f => REMOVED.filter(k => L(JSON.parse(read(`messages/${f}`)), k) !== undefined).map(k => `${f}:${k}`))
  t(`the removed keys are gone from all ${files.length} locale files (${REMOVED.join(', ')})`, left.length === 0, left)
  // The approved words, with the house apostrophe (’): en-GB and fr-FR write ’ throughout, and french-1 forbids a straight one in French.
  const house = s => s.replace(/'/g, '’')
  t('en-GB and fr-FR carry exactly the approved words, with the house apostrophe (two samples)', L(en, 'order.allergenSevere') === 'If you have a food allergy, please contact the truck before ordering.'
    && L(msg('fr-FR'), 'order.allergenSevere') === house("En cas d'allergie alimentaire, contactez le commerçant avant de commander.")
    && L(en, 'manageAllergens.wizard.recipeOnly') === house("Only what's in this dish's recipe."))
  // The severe-allergy line, NEW in EVERY locale: what each locale resolves to (its chain) is not the sentence it resolved to before.
  const BEFORE = '0ff41a35'
  const old = new Map()
  for (const f of files) { try { old.set(f.replace('.json', ''), JSON.parse(execFileSync('git', ['show', `${BEFORE}:messages/${f}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 }))) } catch { /* a file added since */ } }
  const resolveOld = l => { let cur = l; const seen = new Set(); while (cur && !seen.has(cur)) { seen.add(cur); const v = L(old.get(cur), 'order.allergenSevere'); if (typeof v === 'string') return v; cur = cur.startsWith('en-') && cur !== 'en-GB' ? 'en-GB' : null } return L(old.get('en-GB'), 'order.allergenSevere') }
  const stale = []
  for (const l of K.LOCALES) {
    const now = K.translatorFor(l, 'order')('allergenSevere')
    if (!now || now === resolveOld(l) || /severe allergy|allergie (grave|sévère)/i.test(now)) stale.push(`${l}: ${now}`)
  }
  t(`the severe-allergy line is the NEW sentence in all ${K.LOCALES.length} locales (none resolves to its old one)`, stale.length === 0, stale.slice(0, 12))
}

console.log(`\n${fail ? '🔴 ' + fail + ' FAILED, ' + pass + ' passed' : '✅ allergen-kitchen-1: all ' + pass + ' passed'}`)
process.exit(fail ? 1 : 0)
