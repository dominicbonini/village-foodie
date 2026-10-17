// scripts/_lp1d2-checks.cjs — the checks of scripts/language-phase-1d2.cjs (Language Phase 1d Part 2). A MODULE.
//   gb     · F(GB) === BEFORE(GB) except NAMED DIFFERENCE 1 (an API refusal gains `code` and `params`, last, proven per
//            field) and the NAMED code changes (scripts/_lp1d2-named.cjs); A(GB) vs F(GB): every word difference is a
//            changed en-GB key's own word change
//   keys   · the en-GB keys whose text differs between F and A === scripts/fixtures/language-phase-1d2-gb-named.json; the
//            as-moved overlay is consistent
//   us     · F(US) === BEFORE(US) except named difference 1 and the named US changes; every A(US) view that differs
//            from BEFORE listed with its cause in scripts/fixtures/language-phase-1d2-us-changed.txt
//   words  · THE US-WORDS CHECK on every in-scope A(US) view (Phase 2's and Part 1's lists, extended for Part 2)
//   legal  · every LEGAL key (moved byte-identical) has NO en-US override
//   bytes  · the GB Reports CSV (bytes) and the GB poster render source: F === BEFORE and A === F, except named
//   smoke  · OUT OF SCOPE (Part 1's tabs, the dashboard): BEFORE === F === A, GB and US, except named shared fixes
//   api    · a count of the refusals that gained a code, per route
const fs = require('fs'); const path = require('path')
const T = require('./_lp2-text.cjs')
const { icuVariants } = require('./_lp2-checks.cjs')
const NAMED_MOD = require('./_lp1d2-named.cjs')

// ══ THE US WORDS (Phase 2's list, extended for Manage) ══════════════════════════════════════════════════════════
const OK_ISE = /^(disable[ds]?|otherwise|promise[sd]?|premise[sd]?|raise[sd]?|raising|praise[sd]?|rise|arise|advise[sd]?|advising|exercise[sd]?|surprise[sd]?|expertise|wise|noise|poise|cruise|franchise|merchandise|compromise[sd]?|enterprise[sd]?|precise|concise|paradise|disguise[sd]?|devise[sd]?|revise[sd]?|revising|supervise[sd]?|televise[sd]?|despise[sd]?|reprise|liaise|bruise[sd]?|turquoise|treatise|appraise[sd]?|demise|excise|incise|apprise|comprise[sd]?|comprising|improvise[sd]?|sunrise|this|his|visible|invisible|crisis|basis|analysis|emphasis|thesis|tennis|noise|chemise|anise|valise|reprised)$/i
const US_WORDS = [
  ['basket', /\bbasket/i], ['collect', /\bcollect(ion|ions|ed|ing|s)?\b/i], ['hatch', /\bhatch\b/i], ['van', /\bvans?\b/i],
  ['postcode', /postcode/i], ['mobile', /\bmobile\b/i], ['till', /\btill\b/i], ['takings', /takings/i], ['card machine', /card machine/i],
  ['contactless', /contactless/i], ['cancelled', /cancell(ed|ing)/i], ['authorise', /authoris/i], ['organise', /organis/i],
  ['colour', /colour/i], ['centre', /centre/i], ['favourite', /favourite/i], ['grey', /\bgrey/i], ['licence', /licence/i],
  ['TBC', /\bTBC\b/], ['part paid', /part paid/i], ['co.uk', /co\.uk/i], ['💷', /💷/u], ['£', /£/], ['Sept', /\bSept\b/],
  ['village (area label)', /\(village, town or city\)|\bvillage\b/i], ['car park', /car park/i], ['pub', /\bpubs?\b/i], ['private hire', /private hire/i],
  ['fete', /\bf[eê]tes?\b/i], ['tick', /\btick(ed|s|box|boxes)?\b|\buntick/i], ['straight away', /straight away/i],
  ['trade (operating)', /\btrad(e|es|ed|ing)\b/i], ['do you do', /do you do\b/i], ['-ise', /\b\w+is(e|ed|es|ing|ation|ations|able)\b/i],
  ['have a look', /have a look/i], ['tidy up', /tidy up/i], ['carry on', /carry on/i], ['meal deal', /meal deals?/i],
  ['starters/mains', /\bstarters?\b|\bmains\b/i], ['queue', /\bqueue\b/i], ['week commencing', /week commencing/i],
  ['UK foods', /fish (&|and) chips|jacket potato|pie (&|and) mash/i],
  // ── Language Phase 1d Part 2 additions (Payments, Reports, Social posts and posters, WhatsApp, account) ──
  ['no trading today', /no trading today/i], ['enquiry', /enquir(y|ies|ed|ing)/i], ['fancy some', /\bfancy some/i],
  ['Monday to Sunday', /Monday (to|–|-) Sunday/i], ['analyse', /\banalys(e|ed|es|ing)\b/i], ['sort it', /\bsort (it|this|that)( out)?\b/i],
  ['drop us a message', /drop us an? /i], ['come back to you', /come back to you/i], ['move it across', /move (it|them) across/i],
  ['fortnight', /fortnight/i], ['needs X adding', /\bneeds? \w+ adding\b/i], ['whilst', /\bwhilst\b/i],
]
/** Genuine exceptions — each scoped to its views and the text around it (±40 characters), with its reason. Filled as
 *  the hits are read; every one is a stored value, a brand, an address, or a legal sentence kept GB on purpose. */
const ALLOW = [
  { word: 'village (area label)', views: /./, near: /Village Foodie/, reason: 'the brand name "Village Foodie"' },
  { word: 'co.uk', views: /./, near: /villagefoodie\.co\.uk|hatchgrab\.co\.uk/, reason: 'an email or web ADDRESS (infrastructure, not words)' },
  { word: 'authorise', views: /^api\/US\|[^|]+\|(noToken|badToken|missing|noUser)/, near: /Unauthorised/, reason: 'refused BEFORE the truck is known (no token / a bad token / no user): no country to take a language from, so the English fallback is en-GB; the body’s `code` is what a screen renders, in its own locale (Phase 2’s rule)' },
  { word: '-ise', views: /^api\/US\|[^|]+\|(noToken|badToken|missing|noUser)/, near: /Unauthorised/, reason: 'as "authorise" above: a refusal before the truck is known' },
  { word: 'van', views: /^[a-z]+\/US\|/, near: /\b(Van 1|Van 2|Big van|Little van|Pasta Van)\b/, reason: 'fixture data: van / truck NAMES stored on the fixture account ("Van 1", "Big van", "Pasta Van") — stored values are never changed' },
  { word: 'village (area label)', views: /^(poster|social|api|wada|shell)\/US\|/, near: /Village Hall/, reason: 'fixture data: a venue NAME the operator saved ("Lavenham Village Hall") — stored values are never changed' },
  // ── Billing: the plan-comparison rows and prices are lib/plan-features.ts / lib/features.ts / lib/pricing.ts, SHARED with
  //    the marketing pages — their words move with marketing (Language Phase 1e), not here (lead's decision).
  ...['hatch', 'grey', 'collect', 'straight away', 'centre', 'meal deal', 'enquiry', 'card machine', 'authorise', '-ise', 'TBC'].map(word => ({
    word, views: /^shell\/US\|billing\|/, near: /./, reason: 'Billing’s plan-comparison rows and price placeholder ("TBC") come from lib/plan-features.ts / lib/features.ts / lib/pricing.ts, SHARED with the marketing pages — moved with marketing in Language Phase 1e (lead’s decision)' })),
  { word: 'starters/mains', views: /^[a-z]+\/US\|/, near: /\bStarter( plan| tier| \$| TBC| Free| —|\b)/, reason: 'the plan’s NAME ("Starter") — a product name, not the dish course' },
  // ── Posters: a STORED design keeps the words its owner saved ("Week commencing", "No trading today") — never changed
  { word: 'week commencing', views: /^poster\/US\|(weekly\|(stored|days\.stored)|locale\|headingRuns)/, near: /week commencing/i, reason: 'a STORED poster design (the fixture saved "Week commencing {start} to {end}" as its heading) — stored values are never changed; only the DEFAULT offered to a US truck is "Week of {start}"' },
  { word: 'no trading today', views: /^poster\/US\|weekly\|(stored|days\.stored)/, near: /No trading today/, reason: 'a STORED poster design (its saved days-off text) — stored values are never changed; the US default is "Closed today"' },
  { word: 'trade (operating)', views: /^poster\/US\|weekly\|(stored|days\.stored)/, near: /No trading today/, reason: 'as above: the stored days-off text "No trading today"' },
  { word: 'cancelled', views: /^poster\/US\|caption\|week\.weekCaption$/, near: /CANCELLED, sorry/, reason: 'lib/weekly-post/caption.ts weekCaption() has NO caller in app/ or components/ (the route and screens build the caption from caption-template’s {day-list}, which says "CANCELED" for a US truck) — rendered here only for completeness' },
  // ── WhatsApp preview: what the operator TYPED and what the AI answered (rule 10: AI output is not our words)
  { word: 'do you do', views: /^wada\/US\|preview\|(typing|result\|)/, near: /Do you do (pepperoni|gluten-free bases)\?/, reason: 'fixture data: the question the operator TYPED into the preview box (the placeholder itself reads “Do you have pepperoni?”)' },
  { word: '£', views: /^wada\/US\|preview\|result\|/, near: /£11\.50/, reason: 'the AI reply the harness’s canned model answer gives — AI output, not our words (rule 10)' },
  { word: 'hatch', views: /^wada\/US\|preview\|result\|/, near: /ask us at the hatch/, reason: 'the AI reply the harness’s canned model answer gives — AI output, not our words (rule 10)' },
  { word: 'co.uk', views: /^(wada|api)\/US\|/, near: /123-reg\.co\.uk/, reason: '123 Reg’s own help-page ADDRESS (the provider’s URL, not our words)' },
]
const PAY_AT_HATCH = /Pay at Hatch/g
function usHits(id, value) {
  const hits = []
  for (const { path: p, text } of T.visible(value)) {
    const s = text.replace(PAY_AT_HATCH, '            ')
    for (const [word, re] of US_WORDS) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
      let m
      while ((m = g.exec(s))) {
        if (!m[0].length) { g.lastIndex++; continue }
        if (word === '-ise' && OK_ISE.test(m[0])) continue
        const near = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ')
        const allow = ALLOW.find(a => a.word === word && a.views.test(id) && a.near.test(near))
        hits.push({ id, path: p, word, match: m[0], near, allow })
      }
    }
  }
  return hits
}
/** The views the US-words check reads: every in-scope area (not smoke, not an `|oos|` view). */
const inScopeForWords = id => !/^smoke-/.test(id) && !/\|oos\|/.test(id)
/** Out-of-scope views (Part 1's tabs, the dashboard, `|oos|` views): must not change, except named shared fixes. */
const isSmoke = id => /^smoke-/.test(id) || /\|oos\|/.test(id)
/** The in-scope .tsx files whose inline strings the `literals` section lists (ui-literals.cjs's counting rule). */
const LITERAL_FILES = ['app/manage/[token]/page.tsx', ...['PaymentsTab', 'ChargesCard', 'TakingPaymentPanel', 'SocialPosts', 'EventPost', 'PostShareBar', 'LivePoster', 'WeeklyPost',
  'DesignEditor', 'DesignEditorBits', 'FontPicker', 'DraggableBox', 'DeleteAccountSection', 'ImageDropSlot'].map(n => `components/manage/${n}.tsx`),
  'components/dashboard/CustomDomainSetup.tsx', 'components/dashboard/CopyButton.tsx']
/** The byte views: the Reports CSV and the poster render source. */
const isBytes = id => /^reports\/[A-Z]{2}\|csv\|/.test(id) || /^poster\//.test(id)

// ══ NAMED DIFFERENCE 1 — a refusal gains `code` and `params`, last ═════════════════════════════════════════════
const CODE_HOMES = { customDomain: ['apex.'] }
function messageFor(cat, locale, code, params) {
  const { createTranslator } = require(path.join(cat.REPO, 'node_modules/next-intl'))
  const merge = (b, o) => { const out = { ...b }; for (const [k, v] of Object.entries(o || {})) out[k] = v && typeof v === 'object' && out[k] && typeof out[k] === 'object' ? merge(out[k], v) : v; return out }
  const msgs = locale === 'en-US' ? merge(cat['en-GB'], cat['en-US']) : cat['en-GB']
  const out = []
  // Every namespace that has the code as a key — an errors namespace first (errorsManage, …), then any other.
  for (const ns of Object.keys(msgs).sort((x, y) => Number(!/^errors/i.test(x)) - Number(!/^errors/i.test(y)))) {
    // A code's words live at <ns>.<code>, or — for a family that keeps its words under one prefix — at a CODE_HOMES prefix
    // (the custom-domain address refusals: customDomain.apex.<reason>).
    for (const pre of ['', ...(CODE_HOMES[ns] || [])]) {
      let o = msgs[ns]; for (const part of `${pre}${code}`.split('.')) o = o && typeof o === 'object' ? o[part] : undefined
      if (typeof o !== 'string') continue
      try { out.push({ ns, text: createTranslator({ locale, messages: msgs, namespace: ns })(`${pre}${code}`, params || {}) }) } catch (e) { out.push({ ns, text: `ERROR ${e.message}` }) }
    }
  }
  return out
}
/** BEFORE/AFTER bodies (JSON text). → null (byte-identical), or { named: true, problems: [] }. */
function named1(bText, aText, cat, locales) {
  if (bText === aText) return null
  let b, a
  try { b = JSON.parse(bText); a = JSON.parse(aText) } catch { return { named: false, problems: [`not JSON, and not byte-identical: ${bText.slice(0, 200)} · ${aText.slice(0, 200)}`] } }
  // The sentence a refusal carries: `error`, or — for the custom-domain answers shaped { ok: false, reason, message } —
  // `message` (Part 2: named difference 1 reaches those too).
  const said = b && typeof b === 'object' ? (typeof b.error === 'string' ? b.error : b.ok === false && typeof b.message === 'string' ? b.message : null) : null
  if (!(said != null && !('code' in b) && a && typeof a === 'object' && 'code' in a))
    return { named: false, problems: [`not a refusal that gained a code — must be byte-identical:\n      BEFORE ${bText.slice(0, 300)}\n      AFTER  ${aText.slice(0, 300)}`] }
  const problems = []
  if (!aText.startsWith(bText.slice(0, -1) + ',')) problems.push(`the BEFORE body is not the exact prefix: BEFORE ${bText} · AFTER ${aText}`)
  const bk = Object.keys(b), ak = Object.keys(a)
  if (JSON.stringify(ak.slice(0, bk.length)) !== JSON.stringify(bk) || !bk.every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]))) problems.push(`a BEFORE field changed or moved: ${aText}`)
  const added = ak.slice(bk.length)
  if (!(JSON.stringify(added) === '["code","params"]' || JSON.stringify(added) === '["code"]')) problems.push(`the fields added are not code and params, last: ${added.join(',')}`)
  if (typeof a.code !== 'string') problems.push(`code is not a string: ${JSON.stringify(a.code)}`)
  if (a.params !== undefined && !(a.params && typeof a.params === 'object' && !Array.isArray(a.params) && Object.values(a.params).every(v => typeof v === 'string' || typeof v === 'number')))
    problems.push(`params is not an object of strings and numbers: ${JSON.stringify(a.params)}`)
  if (typeof a.code === 'string') for (const loc of locales) {
    const r = messageFor(cat, loc, a.code, a.params)
    if (!r.length) problems.push(`"${a.code}" is no message in any namespace`)
    else if (!r.some(x => x.text === said)) problems.push(`${loc}: the words for "${a.code}" (${r.map(x => `${x.ns}: ${JSON.stringify(x.text)}`).join(' · ')}) are not BEFORE's sentence ${JSON.stringify(said)}`)
  }
  return { named: true, problems, code: a.code }
}
/** An api view (status/body/writes…) or a trade-area answer (JSON text) compared under named difference 1. */
function codeView(id, B, F, cat, locales) {
  if (typeof B === 'string' && typeof F === 'string' && /^[{[]/.test(B)) return named1(B, F, cat, locales)
  if (!B || typeof B !== 'object' || !F || typeof F !== 'object' || !('body' in B)) return undefined
  const problems = []
  for (const f of Object.keys(B)) if (f !== 'body' && JSON.stringify(B[f]) !== JSON.stringify(F[f])) problems.push(`${f} changed: BEFORE ${JSON.stringify(B[f]).slice(0, 300)} · AFTER ${JSON.stringify(F[f]).slice(0, 300)}`)
  const r = named1(B.body, F.body, cat, locales)
  if (!r) return problems.length ? { named: false, problems } : null
  return { named: r.named, problems: [...problems, ...r.problems], code: r.code }
}

const HOLE = '\u0001'
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const holeRe = (s, anchored) => new RegExp((anchored ? '^' : '') + s.split(HOLE).map(esc).join('.*?') + (anchored ? '$' : ''), 's')

async function run(ctx) {
  const { t, head, BEFORE, F, A, ids, isUS, area, same, firstDiff, W, REPO, SECTIONS, GB_NAMED_FILE, US_CHANGED_FILE, RUNS } = ctx
  const on = s => SECTIONS.includes(s)
  const { parse, TYPE } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))
  const catF = { ...W.catalogues('F'), REPO }
  fs.mkdirSync(RUNS, { recursive: true })

  const claimed = new Map(NAMED_MOD.NAMED.map(e => [e.id, []]))
  ctx.hunkKeys = new Map()   // GB view id → the changed keys that explain its A-vs-F hunks
  ctx.hunkSets = new Map()   // GB view id → per hunk, the keys that could explain it
  const codes = { GB: new Map(), US: new Map() }
  /** F vs BEFORE for one country: identical, named difference 1, or a named code change. */
  const codeCheck = cc => {
    let identical = 0, named = 0, n1 = 0
    const listed = []
    for (const id of ids.filter(i => (cc === 'US') === isUS(i) && !isSmoke(i))) {
      if (!(id in F)) continue
      const b = BEFORE[id], f = F[id]
      const n0 = NAMED_MOD.apply(id, b)
      const cv = n0.listed || n0.touched.length ? undefined : codeView(id, b, f, catF, cc === 'US' ? ['en-GB', 'en-US'] : ['en-GB'])
      if (cv !== undefined) {
        if (cv === null) { identical++; continue }
        t(`${cc} · ${id}: ${cv.named ? 'only `code` and `params` added (named difference 1)' : 'byte-identical'}`, cv.problems.length === 0, cv.problems.join('\n      '))
        if (cv.named && !cv.problems.length) { n1++; const r = id.split('|')[1]; codes[cc].set(r, (codes[cc].get(r) || 0) + 1) }
        continue
      }
      const n = NAMED_MOD.apply(id, b)
      if (n.listed) {
        if (!same(b, f)) { listed.push(id); for (const e of n.entries.filter(e => !e.expect && !e.prove)) claimed.get(e.id).push(id) } else identical++
        continue
      }
      if (same(b, f) && same(n.expected, b)) { identical++; continue }
      for (const e of n.touched) claimed.get(e).push(id)
      if (!n.touched.length) { t(`${cc} · ${id}: F === BEFORE (no named code change applies)`, same(b, f), firstDiff(b, f)); continue }
      // ⚠️ RE-PINNED (pending-card fix, 16 Oct 2026, docs/private-event-approval-fix-report.md): a structural named change
      // (pending-card-layout, `n.matches`) is proven by its own proof instead of byte equality; every other view as before.
      const pr = n.matches ? n.matches(f) : null
      const ok = pr ? pr.ok : same(n.expected, f)
      if (ok) named++
      t(`${cc} · ${id}: F === BEFORE with ONLY the named change(s) ${n.touched.join(' + ')}`, ok, pr ? pr.problems.join('\n      ') : `expected (BEFORE + named) vs F ${firstDiff(n.expected, f)}`)
    }
    return { identical, named, n1, listed }
  }

  // ══ GB ═════════════════════════════════════════════════════════════════════════════════════════════════════
  const gbDiff = W.gbKeyDiff()
  if (on('gb')) {
    head('GB · F (this code, the 826471a words + as-moved) === BEFORE, except named difference 1 and the NAMED code changes')
    const r = codeCheck('GB')
    console.log(`  ${r.identical} views byte-identical · ${r.n1} refusals with only code/params added · ${r.named} views equal to BEFORE + their named change(s)`)

    head('GB · A vs F — every difference is a changed en-GB key’s own word change')
    const changed = Object.entries(gbDiff).filter(([, d]) => d.before != null && d.after != null)
    const patterns = [], whole = []
    for (const [key, d] of changed) {
      const vb = icuVariants(d.before, parse, TYPE), va = icuVariants(d.after, parse, TYPE)
      whole.push({ key, vb, va })
      for (const x of vb) for (const y of va) for (const hk of T.wordDiff(x, y)) patterns.push({ key, del: holeRe(hk.del.join(' '), true), ins: holeRe(hk.ins.join(' '), true) })
    }
    const explain = hk => {
      const del = hk.del.join(' '), ins = hk.ins.join(' ')
      const direct = patterns.filter(p => p.del.test(del) && p.ins.test(ins)).map(p => p.key)
      if (direct.length) return [...new Set(direct)]
      // A hunk that splits a message at a value (a quote mark around {note} wraps the customer's words, so the diff sees
      // `"Cut` → `“Cut` and `please"` → `please”`): explained when it is exactly one literal piece of a changed key
      // swapped for the same piece of its new text, the rest of the hunk untouched.
      const pieceKeys = whole.filter(w => w.vb.some((vb, i) => {
        const va = w.va[i]; if (va == null) return false
        const pb = vb.split(HOLE), pa = va.split(HOLE)
        return pb.length === pa.length && pb.some((x, j) => x.trim() && x !== pa[j] && del.includes(x) && del.replace(x, pa[j]) === ins)
      })).map(w => w.key)
      if (pieceKeys.length) return [...new Set(pieceKeys)]
      for (let c = 1; c <= 3; c++) {
        const L = hk.before.slice(-c).join(' '), R = hk.after.slice(0, c).join(' ')
        const bx = [L, del, R].filter(Boolean).join(' '), ax = [L, ins, R].filter(Boolean).join(' ')
        const keys = whole.filter(w => w.vb.some(v => holeRe(v, false).test(bx) || v.replace(/\u0001/g, '').includes(bx)) && w.va.some(v => holeRe(v, false).test(ax) || v.replace(/\u0001/g, '').includes(ax))).map(w => w.key)
        if (keys.length) return keys
      }
      return []
    }
    const perKey = new Map()
    let viewsChanged = 0, hunksExplained = 0
    const unexplained = []
    for (const id of ids.filter(i => !isUS(i))) {
      if (!(id in A) || !(id in F) || same(A[id], F[id])) continue
      viewsChanged++
      const fa = T.flat(F[id]), aa = T.flat(A[id])
      const pairs = fa.length === aa.length && fa.every((x, i) => x.path === aa[i].path)
        ? fa.map((x, i) => [x.text, aa[i].text]).filter(([x, y]) => x !== y)
        : [[fa.map(x => x.text).join(' \n '), aa.map(x => x.text).join(' \n ')]]
      for (const [x, y] of pairs) for (const hk of T.wordDiff(x, y)) {
        const keys = explain(hk)
        if (!keys.length) { unexplained.push({ id, hk }); continue }
        hunksExplained++
        if (!ctx.hunkKeys.has(id)) ctx.hunkKeys.set(id, new Set())
        if (!ctx.hunkSets.has(id)) ctx.hunkSets.set(id, [])
        ctx.hunkSets.get(id).push(keys)   // the keys that could explain THIS hunk (any one suffices)
        for (const k of keys) { ctx.hunkKeys.get(id).add(k); if (!perKey.has(k)) perKey.set(k, new Set()); perKey.get(k).add(id) }
      }
    }
    for (const u of unexplained.slice(0, 60)) t(`GB · ${u.id}: the change is a changed key's own words`, false, `"${u.hk.before.join(' ')} [${u.hk.del.join(' ')} → ${u.hk.ins.join(' ')}] ${u.hk.after.join(' ')}"`)
    if (unexplained.length > 60) t(`GB · ${unexplained.length - 60} more unexplained hunks`, false)
    t(`GB · every word difference between A and F is explained by a changed key (${hunksExplained} hunks in ${viewsChanged} views)`, unexplained.length === 0, `${unexplained.length} unexplained`)
    const silent = changed.map(([k]) => k).filter(k => !perKey.has(k))
    console.log(`  ${changed.length} en-GB keys changed text between F and A · ${perKey.size} change a GB view this harness renders · ${silent.length} change none of them${silent.length ? ` (${silent.slice(0, 12).join(', ')}${silent.length > 12 ? ' …' : ''})` : ''}`)
    fs.writeFileSync(path.join(RUNS, 'gb-per-key.txt'), [...perKey].sort().map(([k, s]) => `${k}\t${s.size}\t${[...s].join(' ')}`).join('\n') + '\n')
  }

  // ══ the en-GB key list ═════════════════════════════════════════════════════════════════════════════════════
  if (on('keys')) {
    head('GB · the en-GB keys whose text differs between F and A are exactly scripts/fixtures/language-phase-1d2-gb-named.json')
    const named = fs.existsSync(GB_NAMED_FILE) ? JSON.parse(fs.readFileSync(GB_NAMED_FILE, 'utf8')) : null
    t('the named list exists (node scripts/language-phase-1d2.cjs --write-gb-named)', !!named)
    if (named) {
      const extra = Object.keys(gbDiff).filter(k => !(k in named))
      const gone = Object.keys(named).filter(k => !(k in gbDiff))
      const moved = Object.keys(gbDiff).filter(k => k in named && (named[k].before !== gbDiff[k].before || named[k].after !== gbDiff[k].after))
      t(`every changed en-GB key is named (${Object.keys(gbDiff).length} changed)`, extra.length === 0, `not in the list: ${extra.join(', ')}`)
      t('every named key changed, as named', gone.length === 0 && moved.length === 0, `named but unchanged: ${gone.join(', ')} · different text: ${moved.join(', ')}`)
    }
    const unrecorded = Object.entries(gbDiff).filter(([, d]) => /WITHOUT a recorded fix/.test(d.kind)).map(([k, d]) => `${k} (${d.kind})`)
    t('every reworded en-GB key went through the helper as a GB fix (no 826471a key reworded silently)', unrecorded.length === 0, unrecorded.join(' · '))
    const deleted = Object.entries(gbDiff).filter(([, d]) => /deleted/.test(d.kind)).map(([k]) => k)
    if (deleted.length) console.log(`  ${deleted.length} ${W.BEFORE_REF} en-GB key(s) deleted (named in the list; their words live under a new key): ${deleted.join(', ')}`)
    const km = W.keyMoveProblems()
    t(`every key MOVED between namespaces keeps its words, GB and US (${Object.keys(W.part2Moves ? W.part2Moves() : W.LP2.keyMoves()).length} moves)`, km.length === 0, km.join(' · '))
    const mp = W.movedProblems()
    t(`the as-moved overlay is consistent (${Object.keys(W.moved()).length} GB fixes)`, mp.length === 0, mp.join(' · '))
  }

  // ══ US ═════════════════════════════════════════════════════════════════════════════════════════════════════
  if (on('us')) {
    head('US · F (this code, the 826471a words) === BEFORE, except named difference 1 and the named US changes')
    const r = codeCheck('US')
    console.log(`  ${r.identical} views byte-identical · ${r.n1} refusals with only code/params added · ${r.named} equal to BEFORE + their named change(s) · ${r.listed.length} LISTED as changed by a named US behaviour`)
    head('US · A vs BEFORE — every view that changed, listed with its cause')
    const usIds = ids.filter(i => isUS(i) && !isSmoke(i))
    const changedUS = usIds.filter(i => i in A && !same(BEFORE[i], A[i]))
    const totals = {}, byArea = {}
    const sub = id => `${area(id)} ${id.split('|')[1]}`
    for (const id of usIds) totals[sub(id)] = (totals[sub(id)] || 0) + 1
    for (const id of changedUS) byArea[sub(id)] = (byArea[sub(id)] || 0) + 1
    for (const a of Object.keys(totals).sort()) console.log(`  ${a.padEnd(28)} ${String(byArea[a] || 0).padStart(4)} of ${totals[a]} US views changed`)
    const lines = [`# Language Phase 1d Part 2 — every in-scope US view that differs from BEFORE (826471a) (${usIds.length} US views; ${changedUS.length} changed). Written by scripts/language-phase-1d2.cjs.`,
      '# view id\twhy (code: named difference 1 / a named code change; words: the en-US words and moved messages)']
    for (const id of changedUS) {
      const cv = codeView(id, BEFORE[id], F[id], catF, ['en-GB', 'en-US'])
      const n = NAMED_MOD.apply(id, BEFORE[id])
      const code = !same(BEFORE[id], F[id])
      const why = !code ? 'words' : cv && cv.named ? `code: named difference 1 (${cv.code})` : `code: ${(n.listed ? n.entries.filter(e => !e.expect && !e.prove).map(e => e.id) : n.touched || []).join('+') || 'UNNAMED'}`
      lines.push(`${id}\t${why}${code && !same(F[id], A[id]) ? ' + words' : ''}`)
    }
    fs.writeFileSync(US_CHANGED_FILE, lines.join('\n') + '\n')
    console.log(`  ${changedUS.length} US views changed in all → ${path.relative(REPO, US_CHANGED_FILE)}`)
  }
  if (on('gb') && on('us')) {
    head('the named code changes — each claims the views it changed')
    if (!NAMED_MOD.NAMED.length) console.log('  (none named yet)')
    for (const e of NAMED_MOD.NAMED) {
      // ⚠️ RE-PINNED (pending-card fix, 16 Oct 2026): the structural entry claims OUT-OF-SCOPE views only — counted in the smoke section.
      if (e.prove) { console.log(`  · ${e.id} (${e.country}, STRUCTURAL — pending-card proof): out-of-scope views only — claimed and proven in the smoke section below`); continue }
      // ⚠️ RE-PINNED (events that run past midnight, 17 October 2026, docs/midnight-and-format-fixes-report.md): a PRECISE
      // entry that claims only smoke views (`smokeOnly`) is proven there, byte for byte — not "stale" here.
      if (e.smokeOnly) { console.log(`  · ${e.id} (${e.country}, PRECISE): out-of-scope views only — claimed and proven in the smoke section below`); continue }
      const n = claimed.get(e.id).length
      console.log(`  ${n ? '·' : '⚠️'} ${e.id} (${e.country}${e.expect ? '' : e.prove ? ', STRUCTURAL — pending-card proof' : ', LISTED'}): ${n} view(s)${n ? ` — ${claimed.get(e.id).slice(0, 4).join(', ')}${n > 4 ? ' …' : ''}` : ' — none changed (not landed, or stale)'}`)
    }
  }
  if (on('api')) {
    head('API · refusals that gained a code (named difference 1), by route')
    for (const cc of ['GB', 'US']) console.log(`  ${cc}: ${[...codes[cc]].map(([r, n]) => `${r} ${n}`).join(' · ') || 'none yet'}`)
  }

  // ══ OUT OF SCOPE ═══════════════════════════════════════════════════════════════════════════════════════════
  if (on('smoke')) {
    head('OUT OF SCOPE · Part 1’s tabs (Menu, Schedule, Settings’ other sections) and the dashboard — BEFORE === F === A, except named shared changes')
    const sm = ids.filter(isSmoke)
    const shared = NAMED_MOD.SMOKE_SHARED || []
    let ok = 0, namedCode = 0, namedWords = 0
    const sharedHits = new Map(shared.map(x => [x.id, 0]))
    const structural = new Map(NAMED_MOD.NAMED.filter(e => e.prove).map(e => [e.id, []]))   // ⚠️ RE-PINNED (pending-card fix, 16 Oct 2026)
    for (const id of sm) {
      if (!(id in F) || !(id in A)) continue   // reported above ("still rendered")
      const b = BEFORE[id], f = F[id], a = A[id]
      // F vs BEFORE: identical, or exactly a named code change (precise)
      const n = NAMED_MOD.apply(id, b)
      // ⚠️ RE-PINNED (pending-card fix, 16 Oct 2026, docs/private-event-approval-fix-report.md): a structural named change
      // (pending-card-layout, `n.matches`) is proven by its own proof instead of byte equality; every other view as before.
      const pr = !n.listed && n.touched.length && n.matches && !same(b, f) ? n.matches(f) : null
      const fOk = same(b, f) || (!n.listed && n.touched.length && (pr ? pr.ok : same(n.expected, f)))
      if (!fOk) { t(`smoke · ${id}: F === BEFORE${n.touched.length ? ` + ${n.touched.join(' + ')}` : ''}`, false, pr ? pr.problems.join('\n      ') : `F ${firstDiff(n.listed || !n.touched.length ? b : n.expected, f)}`); continue }
      if (!same(b, f)) { namedCode++; for (const e of n.touched) if (structural.has(e)) structural.get(e).push(id) }
      if (same(f, a)) { ok++; continue }
      // A vs F: only a named SHARED word change (a key both surfaces read), GB proven key by key, US listed by view
      const entries = shared.filter(x => x.views.test(id))
      let good = false
      if (!isUS(id)) {
        const sets = ctx.hunkSets.get(id)
        const match = k => entries.some(x => x.keys.some(p => (p.endsWith('*') ? k.startsWith(p.slice(0, -1)) : p === k)))
        good = !!sets && sets.length > 0 && sets.every(ks => ks.some(match))   // every hunk is one of the named shared keys
      } else good = entries.some(x => x.us)
      if (good) { ok++; namedWords++; for (const x of entries) sharedHits.set(x.id, sharedHits.get(x.id) + 1) }
      else t(`smoke · ${id}: A === F (or a named shared change)`, false, `${ctx.hunkKeys.get(id) ? `keys: ${[...ctx.hunkKeys.get(id)].join(', ')} · ` : ''}${firstDiff(f, a)}`)
    }
    t(`every out-of-scope view is unchanged in F and A, GB and US, except named shared changes (${ok}/${sm.length})`, ok === sm.length)
    console.log(`  ${sm.length} out-of-scope views (${sm.filter(i => !isUS(i)).length} GB, ${sm.filter(isUS).length} US) · ${ok} pass · ${namedCode} equal BEFORE + a named code change · ${namedWords} changed by a named shared word change`)
    for (const x of shared) console.log(`    shared · ${x.id}: ${sharedHits.get(x.id)} view(s) — ${x.what}`)
    for (const [k, v] of structural) console.log(`    structural · ${k}: ${v.length} view(s) proven by the pending-card proof${v.length ? ` — ${v.slice(0, 3).join(', ')}${v.length > 3 ? ' …' : ''}` : ' — ⚠️ none (stale?)'}`)
  }

  // ══ LEGAL WORDING ══════════════════════════════════════════════════════════════════════════════════════════
  if (on('legal')) {
    head('LEGAL · the legal-wording keys moved byte-identical and have NO en-US override (Dominic’s legal decision pending)')
    const legal = W.legalKeys()
    const us = Object.fromEntries(W.LP2.leaves(W.catalogues('A')['en-US']))
    const gbF = Object.fromEntries(W.LP2.leaves(W.catalogues('F')['en-GB'])), gbA = Object.fromEntries(W.LP2.leaves(W.catalogues('A')['en-GB']))
    for (const k of legal) {
      t(`legal · ${k}: no en-US override`, !(k in us), `en-US has ${JSON.stringify(us[k])}`)
      t(`legal · ${k}: GB text not reworded (F === A)`, gbF[k] === gbA[k], `${JSON.stringify(gbF[k])} → ${JSON.stringify(gbA[k])}`)
    }
    const missing = W.LEGAL_NAMED.filter(k => !(k in gbA))
    t(`every named legal key exists (${W.LEGAL_NAMED.length} named)`, missing.length === 0, missing.join(', '))
    console.log(`  ${legal.length} legal key(s): ${legal.join(', ') || 'none yet'}`)
    ctx.legal = legal
  }

  // ══ BYTES: the Reports CSV and the poster render source ═══════════════════════════════════════════════════
  if (on('bytes')) {
    head('BYTES · GB Reports CSV and GB poster render source: F === BEFORE and A === F, except named')
    const groups = { csv: ids.filter(i => /^reports\/GB\|csv\|/.test(i)), poster: ids.filter(i => /^poster\/GB\|/.test(i)) }
    for (const [g, list] of Object.entries(groups)) {
      let fSame = 0, fNamed = 0, aSame = 0
      const aChanged = []
      for (const id of list) {
        if (same(BEFORE[id], F[id])) fSame++
        else { const n = NAMED_MOD.apply(id, BEFORE[id]); if (!n.listed && n.touched.length && same(n.expected, F[id])) fNamed++ }
        if (same(F[id], A[id])) aSame++; else aChanged.push(id)
      }
      const named = aChanged.filter(id => ctx.hunkKeys.has(id))
      t(`GB ${g}: every view F === BEFORE or BEFORE + a named change (${fSame} identical, ${fNamed} named, of ${list.length})`, fSame + fNamed === list.length)
      t(`GB ${g}: every A ≠ F view is a named GB fix (${aChanged.length} changed, ${named.length} explained)`, named.length === aChanged.length, aChanged.filter(id => !ctx.hunkKeys.has(id)).join(', '))
      console.log(`  ${g}: ${list.length} GB views · F: ${fSame} byte-identical + ${fNamed} named · A: ${aSame} identical to F, ${aChanged.length} changed by named GB fixes${aChanged.length ? ` (${[...new Set(aChanged.flatMap(id => [...(ctx.hunkKeys.get(id) || [])]))].join(', ')})` : ''}`)
      ctx[`bytes_${g}`] = { n: list.length, fSame, fNamed, aSame, aChanged: aChanged.length }
    }
  }

  // ══ UI-LITERALS: what is still inline in the in-scope files (the ui-literals.cjs count, listed) ════════════
  if (on('literals')) {
    head('UI-LITERALS · inline user-facing strings left in the in-scope files (goal 0 except brand names and symbols)')
    const ts = require(path.join(REPO, 'node_modules/typescript'))
    const PROPS = new Set(['placeholder', 'title', 'label', 'aria-label', 'alt'])
    const list = f => {
      const sf = ts.createSourceFile(f, fs.readFileSync(path.join(REPO, f), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const out = []
      const literal = e => e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && /[A-Za-z]/.test(e.text)
      const visit = node => {
        if (ts.isJsxText(node) && /[A-Za-z]/.test(node.getText())) out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: node.getText().replace(/\s+/g, ' ').trim() })
        else if (ts.isJsxAttribute(node) && PROPS.has(node.name.getText())) {
          const v = node.initializer
          const e = literal(v) ? v : v && ts.isJsxExpression(v) && literal(v.expression) ? v.expression : null
          if (e) out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: `${node.name.getText()}="${e.text}"` })
        }
        ts.forEachChild(node, visit)
      }
      visit(sf)
      return out
    }
    const base = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/ui-literals-baseline.json'), 'utf8')).counts
    const BRAND = /^(HatchGrab|Pay at Hatch|Village Foodie|Stripe|WhatsApp|Meta|Google|Instagram|Facebook|Messenger|GoDaddy|Cloudflare|Wix|123 Reg|DNS|CNAME|TTL|QR|PNG|CSV|JPG|URL|HTTPS?|Aa|AM|PM)\b[\s\S]{0,0}$|^[^A-Za-z]*[A-Za-z]?[^A-Za-z]*$/
    ctx.literals = {}
    for (const f of LITERAL_FILES) {
      if (!fs.existsSync(path.join(REPO, f))) continue
      const left = list(f)
      const real = left.filter(x => !BRAND.test(x.text.replace(/^\w[\w-]*="|"$/g, '')))
      ctx.literals[f] = { before: base[f], now: left.length, left }
      console.log(`  ${f}: ${base[f] ?? '—'} → ${left.length}${left.length ? ` (${real.length} not a brand/symbol)` : ''}`)
      for (const x of left.slice(0, 40)) console.log(`      :${x.line}  ${x.text.slice(0, 110)}`)
      if (left.length > 40) console.log(`      … ${left.length - 40} more`)
    }
  }

  // ══ THE US-WORDS CHECK ═════════════════════════════════════════════════════════════════════════════════════
  if (on('words')) {
    head('US · THE US-WORDS CHECK — every in-scope A(US) view, what a person sees')
    // ⚠️ A COPY-MODULE CONSTANT that is the same for GB and US is locale-blind BY DESIGN (the copy modules read
    // translatorFor(DEFAULT_LOCALE, …) for their English constants): it is not a US view. Where a US screen shows those
    // words, that screen's own view is read here and carries the hit.
    const localeBlind = id => /^copy\/US\|/.test(id) && JSON.stringify(A[id]) === JSON.stringify(A[id.replace('copy/US|', 'copy/GB|')])
    const blind = Object.keys(A).filter(i => isUS(i) && inScopeForWords(i) && localeBlind(i))
    console.log(`  ${blind.length} copy/US views skipped: locale-blind constants equal to their GB view (${blind.map(i => i.split('|').slice(1, 3).join('.')).slice(0, 12).join(', ')}${blind.length > 12 ? ' …' : ''})`)
    const usIds = Object.keys(A).filter(i => isUS(i) && inScopeForWords(i) && !localeBlind(i))
    const all = usIds.flatMap(id => usHits(id, A[id]))
    const bad = all.filter(h => !h.allow), allowed = all.filter(h => h.allow)
    const byWord = {}
    for (const h of bad) { byWord[h.word] = byWord[h.word] || { n: 0, views: new Set() }; byWord[h.word].n++; byWord[h.word].views.add(h.id) }
    const allowedBy = {}
    for (const h of allowed) allowedBy[h.allow.reason] = (allowedBy[h.allow.reason] || 0) + 1
    console.log(`  ${usIds.length} US views read · ${all.length} hits · ${allowed.length} allowed · ${bad.length} to fix`)
    for (const [r, n] of Object.entries(allowedBy)) console.log(`    allowed ${String(n).padStart(4)} — ${r.slice(0, 140)}`)
    for (const [w, x] of Object.entries(byWord).sort((a, b) => b[1].n - a[1].n)) console.log(`    ${w.padEnd(22)} ${String(x.n).padStart(5)} hits in ${x.views.size} views`)
    fs.writeFileSync(path.join(RUNS, 'us-words-hits.tsv'), 'word\tview\tpath\tcontext\n' + bad.map(h => `${h.word}\t${h.id}\t${h.path}\t${h.near}`).join('\n') + '\n')
    const distinct = new Map()
    for (const h of bad) { const k = `${h.word}\t${h.near.trim()}`; if (!distinct.has(k)) distinct.set(k, []); distinct.get(k).push(h.id) }
    const limit = ctx.argv.includes('--all-hits') ? Infinity : 80
    let shown = 0
    for (const [k, vs] of distinct) {
      if (shown++ >= limit) break
      const [w, near] = k.split('\t')
      t(`US words · "${w}" in ${vs.length} view(s) e.g. ${vs[0]}`, false, `…${near}…`)
    }
    if (distinct.size > limit) t(`US words · ${distinct.size - limit} more distinct hits (--all-hits; node_modules/.cache/lp1d2-runs/us-words-hits.tsv)`, false)
    t(`US words · no UK-only word in any in-scope US view (${bad.length} hits, ${distinct.size} distinct)`, bad.length === 0)
  }
}

module.exports = { run, usHits, US_WORDS, ALLOW, named1, codeView, isSmoke, isBytes, inScopeForWords, LITERAL_FILES }
