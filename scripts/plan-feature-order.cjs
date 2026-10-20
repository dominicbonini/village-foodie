#!/usr/bin/env node
// scripts/plan-feature-order.cjs
//
//   node scripts/plan-feature-order.cjs      (NO NETWORK, NO DATABASE, NO BROWSER, NO LIVE TRUCK)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS GUARDS: THE ORDER OF THE PLAN FEATURE LIST, AND THE FACT THAT IT IS ONE LIST
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// `FEATURE_SECTIONS` in lib/plan-features.ts is rendered by the landing page's comparison table, by
// Billing, by Admin and by the plans PDF. ⛔ NOTHING CHECKED ITS ORDER, so a row could be moved — or
// could drift while a section was edited — and the only way to find out was to look at four screens.
//
// 🔴 TWO ADJACENCIES WERE ASKED FOR BY NAME (6 October 2026, Dominic), and they are what this pins:
//     'Private events'                 directly after 'Branded QR code'
//     'Custom event types & pricing'    directly after 'Schedule page on your own website'
//
// ⛔ AND THE INVARIANT THAT MAKES "ORDER ONLY" TRUE: the same 31 rows, with the same names, the same
// details, the same per-tier cells and the same footnotes as before the move. A reorder that quietly
// changed a cell would be a plan change, not a layout one.
//
// ⚠️ IT LOADS THE REAL MODULE. `lib/plan-features.ts` is TypeScript with an `@/` alias, so it is
// compiled to a temp directory with the repo's own tsc and `require`d — the same technique
// scripts/whatsapp-golive-parity-harness.cjs uses on the same file. Reading the source with a regex
// would be checking the shape of the text that produces the list rather than the list.

// ══ ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026) — THE WHOLE FILE ════════════════════════════════════════
// The frozen display copy (lib/legacy-pricing-display.ts, FEATURE_SECTIONS, its Starter/Pro/Max sections and per-tier
// cells) is DELETED. The ONE list is now `FEATURE_TABLE` in lib/feature-table.ts — capabilities, grouped RUN YOUR
// SERVICE / ONLINE ORDERS / MARKETING & AUTOMATION in the approved /features mockup's order, with NO plan in it. A cell
// is ✓ / — / coming soon by each plan's switches (public.plan_features via lib/plan-offer.ts tableCell). Rendered by
// components/pricing/PlanTable.tsx (/features AND Manage › Billing) and lib/plans-pdf.ts (the plans PDF).
// The claims are the same in kind: the order is pinned in full (so a reorder is a deliberate edit here), it is ONE list,
// nobody re-sorts it, and coming-soon has ONE mechanism. The 6 October adjacencies (Private events after Branded QR
// code; Custom event types after Schedule page) were SUPERSEDED by the approved mockup's order — pinned as it now is.
// It still LOADS THE REAL MODULES (compiled with the repo's tsc) and computes the cells on the seeded plan catalogue.

const fs = require('fs')
const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const { seedCatalog } = require('./_plans-catalog-fixture.cjs')

let pass = 0, fail = 0
const t = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label) } }
const head = (s) => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 92 - s.length)))
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8')
/** 🔴 COMMENTS STRIPPED BEFORE EVERY SOURCE ASSERTION — a comment must never decide a claim about code. */
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

// ── COMPILE AND LOAD THE REAL MODULES ─────────────────────────────────────────────────────────────
const c = compile(REPO, ['lib/feature-table.ts', 'lib/plan-offer.ts', 'lib/whatsapp-live.ts'], 'plan-order')
const { FEATURE_TABLE, FEATURE_GROUPS } = c.req('lib/feature-table.js')
const O = c.req('lib/plan-offer.js')
const { WHATSAPP_LIVE, MESSENGER_INSTAGRAM_LIVE } = c.req('lib/whatsapp-live.js')
const catalog = seedCatalog()
const GB = JSON.parse(read('messages/en-GB.json'))
const nameOf = (id) => GB.planFeatures?.row?.[id]?.name
const FT_SRC = read('lib/feature-table.ts')

const ids = FEATURE_TABLE.map(r => r.id)
const at = (id) => ids.indexOf(id)
const groupOf = (id) => FEATURE_TABLE[at(id)]?.group

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE ADJACENCIES OF THE APPROVED MOCKUP
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · the event rows sit together, in ONLINE ORDERS')

{
  /* 🔴 ASSERTED AS `index + 1`, NOT AS "somewhere after" — a row that drifted one place would satisfy a `>` test. */
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026 — Dominic): 'Custom event types & pricing' moved to the BOTTOM
  // of Online orders; 'Schedule page on your own website' now follows 'Private events'.
  for (const [row, anchor] of [
    ['private_events', 'auto_accept'],
    ['embed_schedule', 'private_events'],
    ['event_types', 'schedule_import'],
  ]) {
    t(`🔴 '${nameOf(row)}' is directly after '${nameOf(anchor)}'`, at(anchor) >= 0 && at(row) === at(anchor) + 1)
    t(`⛔ …and in the same group ('${groupOf(row)}')`, groupOf(row) === groupOf(anchor))
  }
  t("⚠️ 'Private events' and 'Custom event types & pricing' are ONLINE ORDERS rows",
    groupOf('private_events') === 'online' && groupOf('event_types') === 'online')
  t("🔴 'Custom event types & pricing' is the LAST Online orders row", (rows => rows[rows.length - 1].id === 'event_types')(FEATURE_TABLE.filter(r => r.group === 'online')))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE FULL LIST — ids, words, gates, coming-soon — AND THE CELLS IT PRODUCES
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · the same rows, the same words, the same gates')

{
  /* 🔴 THE FULL LIST, PINNED BY NAME (en-GB words). ⛔ NOT A COUNT: a count is satisfied by swapping two rows for two others. */
  const EXPECTED = [
    ['run', [
      'Walk-up order processing', 'iPhone, iPad and Android kitchen app', 'Multi-device kitchen sync', 'Multi-user access',
      'Offline order protection', 'Kitchen ticket printing', 'Universal web dashboard', 'Meal deals & upsells',
      'Instant sold-out toggle', 'Automated stock countdown', 'Buzzer tracking', 'Advanced reporting',
      'Take payment on your phone', 'Customer-facing display',
    ]],
    ['online', [
      // ⚠️ RE-PINNED (Stage B, Dominic, 20 October 2026): no 'Online ordering — Pay at Hatch' row; custom event types last.
      'Online payments', 'Advance pre-ordering', 'Pre-order deadline',
      'Customer time slot selection', 'Kitchen capacity management', 'Auto-accept online orders', 'Private events',
      'Schedule page on your own website', 'QR code', 'Branded QR code',
      'Discovery map listing', 'Automatic schedule import', 'Custom event types & pricing',
    ]],
    ['marketing', [
      'Social media posts', 'WhatsApp auto-replies', 'Messenger & Instagram auto-replies', 'SMS order alerts',
      'Digital loyalty stamp cards',
    ]],
  ]
  const actual = O.tableGroups().map(g => [g.group, g.rows.map(r => nameOf(r.id))])
  t('🔴 every group, and every row in it, is where it is expected to be (the approved /features mockup)',
    JSON.stringify(actual) === JSON.stringify(EXPECTED))
  if (JSON.stringify(actual) !== JSON.stringify(EXPECTED)) {
    console.log('      GOT:\n' + actual.map(([s, rs]) => `      ── ${s}\n` + rs.map(r => `         ${r}`).join('\n')).join('\n'))
  }
  t('⚠️ the groups are RUN / ONLINE / MARKETING, in that order', JSON.stringify(FEATURE_GROUPS) === JSON.stringify(['run', 'online', 'marketing']))

  /* 🔴 NO ROW WAS LOST OR GAINED — 32 (the old 33 less 'Online ordering — Pay at Hatch', removed on Dominic's request,
     20 October 2026), whatever the WhatsApp flag (the flag decides "coming soon", not the row). */
  t('🔴 the list is 32 rows, with no duplicate id and no duplicate name, and every row has its words (en-GB)',
    FEATURE_TABLE.length === 32 && new Set(ids).size === ids.length && new Set(ids.map(nameOf)).size === ids.length
    && ids.every(id => typeof nameOf(id) === 'string' && nameOf(id).length > 0))

  /* ⛔ NO PLAN APPEARS IN THE LIST — no plan key and no per-plan cell. Which plan has a row is data. */
  const code = codeOf(FT_SRC)
  t('⛔ lib/feature-table.ts names no plan and carries no per-plan cell',
    !/\b(starter|pro|max|payg|unlimited|trial|demo)\s*:/.test(code) && !/'(starter|pro|max|payg|unlimited)'/.test(code)
    // ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): a row may also carry `note` (a footnote marker, not a plan cell) —
    // exactly two rows do: 'Kitchen ticket printing' → 'printing', 'WhatsApp auto-replies' → 'whatsapp'.
    && FEATURE_TABLE.every(r => Object.keys(r).every(k => ['id', 'group', 'feature', 'comingSoon', 'note'].includes(k)))
    && JSON.stringify(FEATURE_TABLE.filter(r => 'note' in r).map(r => [r.id, r.note])) === JSON.stringify([['ticket_printing', 'printing'], ['whatsapp_auto_replies', 'whatsapp']]))
  t('⛔ …and no row → feature parity map or guard is left (the gate IS the row\'s `feature`)', !/findPlanParityViolations|ROW_FEATURE_MAP/.test(code))

  /* 🔴 THE CELLS, COMPUTED BY THE REAL tableCell ON THE SEEDED CATALOGUE (GB). */
  const plans = O.offerPlans(catalog, 'GB')
  const row = (id) => FEATURE_TABLE[at(id)]
  const cells = (id) => plans.map(p => O.tableCell(catalog, row(id), p)).join('/')
  t(`⚠️ the table's columns are the public plans in sort_order: ${plans.map(p => p.plan.key).join(', ')}`,
    plans.length >= 2 && plans.every((p, i) => i === 0 || p.plan.sortOrder > plans[i - 1].plan.sortOrder))
  t(`🔴 'Private events' is ✓ on every plan (${cells('private_events')})`, plans.every(p => O.tableCell(catalog, row('private_events'), p) === 'on'))
  t(`🔴 'Custom event types & pricing' is — on the first plan and ✓ after (${cells('event_types')}) — payg's event_types is off (Stage B migration)`,
    cells('event_types') === ['off', ...plans.slice(1).map(() => 'on')].join('/'))
  t(`🔴 'Social media posts' is gated by schedule_graphics, NOT coming soon, — on the first plan (${cells('social_media_posts')})`,
    row('social_media_posts').feature === 'schedule_graphics' && !row('social_media_posts').comingSoon
    && cells('social_media_posts') === ['off', ...plans.slice(1).map(() => 'on')].join('/'))
  t(`⚠️ 'WhatsApp auto-replies' follows WHATSAPP_LIVE (${WHATSAPP_LIVE}) for coming soon (${cells('whatsapp_auto_replies')})`,
    row('whatsapp_auto_replies').comingSoon === !WHATSAPP_LIVE)
  t(`⚠️ 'Messenger & Instagram auto-replies' follows MESSENGER_INSTAGRAM_LIVE (${MESSENGER_INSTAGRAM_LIVE}) (${cells('messenger_instagram_replies')})`,
    row('messenger_instagram_replies').comingSoon === !MESSENGER_INSTAGRAM_LIVE)
  t('⚠️ a plan that switches a feature off shows — even on a coming-soon row (off beats soon)',
    O.tableCell(catalog, row('messenger_instagram_replies'), plans[0]) === 'off')

  /* ⛔ THERE IS EXACTLY ONE COMING-SOON MECHANISM — the row's `comingSoon` flag, turned into 'soon' by tableCell. */
  const soonRows = FEATURE_TABLE.filter(r => r.comingSoon).map(r => r.id)
  t(`⛔ exactly ONE coming-soon mechanism — the row flag (${soonRows.join(', ')}) — and no 'coming_soon' cell value anywhere`,
    !/'coming_soon'/.test(code) && soonRows.every(id => plans.some(p => O.tableCell(catalog, row(id), p) === 'soon')))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · IT IS ONE LIST, AND EVERY SURFACE READS IT
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · one source, and nobody re-sorts it on the way to a screen')

{
  t('⛔ the frozen display copy is gone (lib/legacy-pricing-display.ts, lib/landing-table.ts, components/landing/FeatureComparison.tsx)',
    ['lib/legacy-pricing-display.ts', 'lib/landing-table.ts', 'lib/plan-features.ts', 'components/landing/FeatureComparison.tsx'].every(f => !fs.existsSync(path.join(REPO, f))))
  /* 🔴 THE RENDERERS, BY NAME — each iterates tableGroups() and asks tableCell for every cell. */
  const RENDERERS = [
    'components/pricing/PlanTable.tsx',   // /features AND Manage › Billing
    'lib/plans-pdf.ts',                   // the plans PDF
  ]
  for (const f of RENDERERS) {
    const code = codeOf(read(f))
    t(`🔴 ${f} renders tableGroups() rows with tableCell from lib/plan-offer`,
      /from '@\/lib\/plan-offer'/.test(code) && /tableGroups\(\)\.map\(/.test(code) && /g\.rows\.map\(/.test(code) && /tableCell\(catalog, r, p\)/.test(code))
    t(`⚠️ …and draws all three cell states (${f})`, /=== 'off'/.test(code) && /=== 'soon'/.test(code) && /cell\.comingSoon/.test(code))
  }
  t('🔴 /features and Manage › Billing render THE SAME component (<PlanTable …>)',
    /<PlanTable catalog=\{catalog\}/.test(codeOf(read('app/features/page.tsx'))) && /<PlanTable catalog=\{catalog\}/.test(codeOf(read('app/manage/[token]/page.tsx'))))
  t('⛔ …and app/landing/page.tsx renders no feature table (the cards are PricingSection)',
    !/tableGroups|FEATURE_TABLE|<PlanTable/.test(codeOf(read('app/landing/page.tsx'))))
  t('⛔ …and app/admin/page.tsx draws no feature matrix (it lists public.plans)', !/tableGroups|FEATURE_TABLE|<PlanTable|legacy-pricing-display/.test(codeOf(read('app/admin/page.tsx'))))
  /* ⛔ AND NONE OF THEM SORTS IT. tableGroups FILTERS by group, which preserves order. */
  for (const f of RENDERERS.concat(['lib/feature-table.ts', 'lib/plan-offer.ts'])) {
    const src = codeOf(read(f))
    t(`⛔ …and does not re-sort the rows (${f})`, !/FEATURE_TABLE[\s\S]{0,200}?\.sort\(/.test(src) && !/\.rows[\s\S]{0,80}?\.sort\(/.test(src))
  }
  t('⚠️ tableGroups filters FEATURE_TABLE by group and does not reorder',
    /return FEATURE_GROUPS\.map\(group => \(\{ group, rows: FEATURE_TABLE\.filter\(r => r\.group === group\) \}\)\)/.test(read('lib/plan-offer.ts')))
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────────────────────────
console.log('')
if (fail === 0) console.log(`✅ all ${pass} passed`)
else console.log(`🔴 ${fail} CHECK(S) FAILED  (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
