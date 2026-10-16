// scripts/_lp1d-checks.cjs — the checks of scripts/language-phase-1d.cjs (Language Phase 1d Part 1). A MODULE.
//   gb     · F(GB) === BEFORE(GB) except NAMED DIFFERENCE 1 (an API refusal / trade-area answer gains `code` and `params`,
//            last, proven per field) and the NAMED code changes (scripts/_lp1d-named.cjs); A(GB) vs F(GB): every word
//            difference is a changed en-GB key's own word change
//   keys   · the en-GB keys whose text differs between F and A === scripts/fixtures/language-phase-1d-gb-named.json; the
//            as-moved overlay is consistent
//   us     · F(US) === BEFORE(US) except named difference 1 and the named US changes; every A(US) view that differs
//            from BEFORE listed with its cause in scripts/fixtures/language-phase-1d-us-changed.txt
//   words  · THE US-WORDS CHECK on every in-scope A(US) view
//   smoke  · the OUT-OF-SCOPE views (area smoke, and Settings' Auto-replies / Account deletion sections): A === F ===
//            BEFORE, GB and US
//   api    · a count of the refusals that gained a code, per route
const fs = require('fs'); const path = require('path')
const T = require('./_lp2-text.cjs')
const { icuVariants } = require('./_lp2-checks.cjs')
const NAMED_MOD = require('./_lp1d-named.cjs')

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
]
/** Genuine exceptions — each scoped to its views and the text around it (±40 characters), with its reason. */
const ALLOW = [
  { word: 'van', views: /^(menu|schedule|settings|api)\/US\|/, near: /\b(Van 1|Big van|Little van)\b/, reason: 'fixture data: van NAMES stored on the fixture truck ("Van 1", "Big van") or typed in the add box ("Little van") — stored values are never changed' },
  { word: 'village (area label)', views: /^schedule\/US\|/, near: /Village Hall/, reason: 'fixture data: a venue NAME the operator typed ("Village Hall")' },
  { word: 'pub', views: /^schedule\/US\|eventTypes\|/, near: /\bPub\b/, reason: 'fixture data: an event type the operator SAVED, named "Pub" — stored values are never changed (new US trucks are offered "Bar")' },
  { word: 'co.uk', views: /^api\/US\|/, near: /villagefoodie\.co\.uk|hatchgrab\.test/, reason: 'an email ADDRESS (infrastructure, not words)' },
  { word: 'van', views: /^api\/US\|/, near: /\bVan [12]\b/, reason: 'fixture data: a stored van NAME in a response body ("Van 1", "Van 2")' },
  { word: 'starters/mains', views: /^menu\/US\|menuTab\|import\|/, near: /\bMains\b/, reason: 'fixture data: a CATEGORY NAME read from the operator’s own menu by the import ("Mains") — the operator’s words, shown back to them' },
  { word: 'starters/mains', views: /^settings\/US\|/, near: /\bStarter plan\b/, reason: 'the plan’s NAME ("Starter") — a product name, not the dish course' },
  { word: 'UK foods', views: /^settings\/US\|/, near: /Fish & Chips|Jacket Potatoes|Pie & Mash/, reason: 'the cuisine list (components/shared/CuisinePicker): STORED cuisine values a truck picks and the public site filters on — stored values are never changed (glossary rule); out of this phase’s brief' },
  { word: 'village (area label)', views: /./, near: /Village Foodie/, reason: 'the brand name "Village Foodie"' },
  { word: 'authorise', views: /^api\/US\|[^|]+\|(noToken|badToken|missing)$|^api\/US\|manage\|noUser$/, near: /Unauthorised/, reason: 'refused BEFORE the truck is known (no token / a bad token): no country to take a language from, so the English fallback is en-GB; the body’s `code` is what a screen renders, in its own locale (Phase 2’s rule)' },
  { word: '-ise', views: /^api\/US\|[^|]+\|(noToken|badToken|missing)$|^api\/US\|manage\|noUser$/, near: /Unauthorised/, reason: 'as "authorise" above: a refusal before the truck is known' },
  { word: 'meal deal', views: /^api\/US\|manageGET\|/, near: /Meal deal/, reason: 'fixture data: a deal NAME the operator saved ("Meal deal")' },
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
/** The views the US-words check reads: in-scope areas, Settings' page (out-of-scope sections already cut out). */
const inScopeForWords = id => /^(menu|schedule|settings|copy|api)\//.test(id) && !/\|oos\|/.test(id)
/** Out-of-scope views: must not change at all. */
const isSmoke = id => /^smoke\//.test(id) || /\|oos\|/.test(id)

// ══ NAMED DIFFERENCE 1 — a refusal gains `code` and `params`, last ═════════════════════════════════════════════
function messageFor(cat, locale, code, params) {
  const { createTranslator } = require(path.join(cat.REPO, 'node_modules/next-intl'))
  const merge = (b, o) => { const out = { ...b }; for (const [k, v] of Object.entries(o || {})) out[k] = v && typeof v === 'object' && out[k] && typeof out[k] === 'object' ? merge(out[k], v) : v; return out }
  const msgs = locale === 'en-US' ? merge(cat['en-GB'], cat['en-US']) : cat['en-GB']
  const out = []
  // Every namespace that has the code as a key — an errors namespace first (errorsManage, …), then any other.
  for (const ns of Object.keys(msgs).sort((x, y) => Number(!/^errors/i.test(x)) - Number(!/^errors/i.test(y)))) {
    let o = msgs[ns]; for (const part of String(code).split('.')) o = o && typeof o === 'object' ? o[part] : undefined
    if (typeof o !== 'string') continue
    try { out.push({ ns, text: createTranslator({ locale, messages: msgs, namespace: ns })(code, params || {}) }) } catch (e) { out.push({ ns, text: `ERROR ${e.message}` }) }
  }
  return out
}
/** BEFORE/AFTER bodies (JSON text). → null (byte-identical), or { named: true, problems: [] }. */
function named1(bText, aText, cat, locales) {
  if (bText === aText) return null
  let b, a
  try { b = JSON.parse(bText); a = JSON.parse(aText) } catch { return { named: false, problems: [`not JSON, and not byte-identical: ${bText.slice(0, 200)} · ${aText.slice(0, 200)}`] } }
  if (!(b && typeof b === 'object' && typeof b.error === 'string' && !('code' in b) && a && typeof a === 'object' && 'code' in a))
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
    else if (!r.some(x => x.text === b.error)) problems.push(`${loc}: the words for "${a.code}" (${r.map(x => `${x.ns}: ${JSON.stringify(x.text)}`).join(' · ')}) are not BEFORE's error ${JSON.stringify(b.error)}`)
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
    head('GB · F (this code, the 756ca09 words + as-moved) === BEFORE, except named difference 1 and the NAMED code changes')
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
        for (const k of keys) { if (!perKey.has(k)) perKey.set(k, new Set()); perKey.get(k).add(id) }
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
    head('GB · the en-GB keys whose text differs between F and A are exactly scripts/fixtures/language-phase-1d-gb-named.json')
    const named = fs.existsSync(GB_NAMED_FILE) ? JSON.parse(fs.readFileSync(GB_NAMED_FILE, 'utf8')) : null
    t('the named list exists (node scripts/language-phase-1d.cjs --write-gb-named)', !!named)
    if (named) {
      const extra = Object.keys(gbDiff).filter(k => !(k in named))
      const gone = Object.keys(named).filter(k => !(k in gbDiff))
      const moved = Object.keys(gbDiff).filter(k => k in named && (named[k].before !== gbDiff[k].before || named[k].after !== gbDiff[k].after))
      t(`every changed en-GB key is named (${Object.keys(gbDiff).length} changed)`, extra.length === 0, `not in the list: ${extra.join(', ')}`)
      t('every named key changed, as named', gone.length === 0 && moved.length === 0, `named but unchanged: ${gone.join(', ')} · different text: ${moved.join(', ')}`)
    }
    const unrecorded = Object.entries(gbDiff).filter(([, d]) => /WITHOUT a recorded fix/.test(d.kind)).map(([k, d]) => `${k} (${d.kind})`)
    t('every reworded en-GB key went through the helper as a GB fix (no 756ca09 key reworded silently)', unrecorded.length === 0, unrecorded.join(' · '))
    const deleted = Object.entries(gbDiff).filter(([, d]) => /deleted/.test(d.kind)).map(([k]) => k)
    if (deleted.length) console.log(`  ${deleted.length} ${W.BEFORE_REF} en-GB key(s) deleted (named in the list; their words live under a new key): ${deleted.join(', ')}`)
    const mp = W.movedProblems()
    t(`the as-moved overlay is consistent (${Object.keys(W.moved()).length} GB fixes)`, mp.length === 0, mp.join(' · '))
  }

  // ══ US ═════════════════════════════════════════════════════════════════════════════════════════════════════
  if (on('us')) {
    head('US · F (this code, the 756ca09 words) === BEFORE, except named difference 1 and the named US changes')
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
    const lines = [`# Language Phase 1d Part 1 — every in-scope US view that differs from BEFORE (${usIds.length} US views; ${changedUS.length} changed). Written by scripts/language-phase-1d.cjs.`,
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
    head('OUT OF SCOPE · Payments, Billing, Reports, Team, Social, WhatsApp, custom domain, account deletion — A === F === BEFORE')
    // ⚠️ RE-PINNED (Language Phase 1d Part 2) — WEAKER HERE, PROVEN THERE: these views are PART 2's surfaces, which Part 2
    // changes on purpose. Part 1's claim was "Part 1 left them alone" (BEFORE 756ca09 = Part 1's end). Here that is now
    // A === F (Part 1's words — 756ca09's pair vs 826471a's pair, on this code — change none of them), and F === BEFORE
    // is no longer required: scripts/language-phase-1d2.cjs proves every one of these surfaces against 826471a (= Part
    // 1's end, which this harness proved equal to 756ca09 for them), with named difference 1 and the named changes.
    const sm = ids.filter(isSmoke)
    let ok = 0, stillBefore = 0
    for (const id of sm) {
      if (same(BEFORE[id], F[id]) && same(BEFORE[id], A[id])) stillBefore++
      const good = same(F[id], A[id])
      if (good) ok++
      else t(`smoke · ${id}: Part 1's words leave it alone (F = A)`, false, `A ${firstDiff(F[id], A[id])}`)
    }
    t(`every out-of-scope view is unchanged by Part 1's words (F = A), GB and US (${ok}/${sm.length})`, ok === sm.length)
    console.log(`  ${sm.length} out-of-scope views (${sm.filter(i => !isUS(i)).length} GB, ${sm.filter(isUS).length} US) · ${ok} with F = A · ${stillBefore} still equal to BEFORE (756ca09); the rest are Part 2's changes, proven by language-phase-1d2`)
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
    if (distinct.size > limit) t(`US words · ${distinct.size - limit} more distinct hits (--all-hits; node_modules/.cache/lp1d-runs/us-words-hits.tsv)`, false)
    t(`US words · no UK-only word in any in-scope US view (${bad.length} hits, ${distinct.size} distinct)`, bad.length === 0)
  }
}

module.exports = { run, usHits, US_WORDS, ALLOW, named1, codeView, isSmoke, inScopeForWords }
