// scripts/_lp1e-checks.cjs — the checks of scripts/language-phase-1e.cjs (Language Phase 1e). A MODULE.
//   gb      · F(GB) === BEFORE(GB) except the NAMED items (scripts/_lp1e-named.cjs), each a precise transform; A(GB) vs F(GB):
//             every word difference is a changed en-GB key's own word change; /uk ignores the visitor's cookie
//   keys    · the en-GB keys whose text differs between F and A === scripts/fixtures/language-phase-1e-gb-named.json; the
//             as-moved overlay and the key moves are consistent; every en-US key exists in en-GB, differs, same ICU arguments
//   us      · F(US) vs BEFORE(US): the named transforms (with /us) or a LISTED US behaviour; every A(US) view that differs from
//             BEFORE listed with its cause in scripts/fixtures/language-phase-1e-us-changed.txt
//   words   · THE US-WORDS CHECK (Phase 2's and Part 1/2's lists + the marketing words) on every A(US) view, allow-list with reasons
//   router  · the router table against Dominic's spec; no loops; country pages 200 and never redirected; switched-off → 302 GB;
//             every path the router must not touch answers exactly as at eb7ed44
//   pdf     · the plans PDF: GB A4 (CSS @page and the browser option), US Letter; the printed HTML is the built HTML
//   shots   · US pages reference the -us screenshots (or none), GB pages the originals; files exist at the GB pixel sizes
//   literals· inline user-facing strings left in the marketing files (informational; ui-literals.cjs is the gate)
const fs = require('fs'); const path = require('path')
const T = require('./_lp2-text.cjs')
const { icuVariants } = require('./_lp2-checks.cjs')
const N = require('./_lp1e-named.cjs')
const R = require('./_lp1e-router.cjs')
const P2 = require('./_lp1d2-checks.cjs')

// ══ THE US WORDS: Part 2's list + the marketing words (Language Phase 1e) ════════════════════════════════════════
const US_WORDS = [
  ...P2.US_WORDS,
  ['mobile catering', /mobile catering/i], ['pitching up', /\bpitch(es|ing)?( up)?\b/i], ['queues', /\bqueues\b|queues? of people/i],
  ['public liability', /public liability/i], ['getting going', /getting going/i], ['fill in the form', /fill in the form/i],
  ['the lot', /\bthe lot\b/i], ['hire a food truck', /\bhire\b/i], ['help centre', /help centre/i],
  ['pence', /\bpence\b|\b\d+p\b/i],
]
const OK_ISE = /^(disable[ds]?|otherwise|promise[sd]?|premise[sd]?|raise[sd]?|raising|praise[sd]?|rise|arise|advise[sd]?|advising|exercise[sd]?|surprise[sd]?|expertise|wise|noise|poise|cruise|franchise|merchandise|compromise[sd]?|enterprise[sd]?|precise|concise|paradise|disguise[sd]?|devise[sd]?|revise[sd]?|revising|supervise[sd]?|televise[sd]?|despise[sd]?|reprise|liaise|bruise[sd]?|turquoise|treatise|appraise[sd]?|demise|excise|incise|apprise|comprise[sd]?|comprising|improvise[sd]?|sunrise|this|his|visible|invisible|crisis|basis|analysis|emphasis|thesis|tennis|chemise|anise|valise|reprised)$/i
/** Genuine exceptions — each scoped to its views and the text around it (±40 characters), with its reason. */
const ALLOW = [
  { word: 'village (area label)', views: /./, near: /Village Foodie/, reason: 'the brand name "Village Foodie"' },
  { word: 'co.uk', views: /./, near: /villagefoodie\.co\.uk|hatchgrab\.co\.uk/, reason: 'an email or web ADDRESS (infrastructure, not words)' },
  { word: 'starters/mains', views: /./, near: /\bStarter( plan| tier| \$| TBD| Free| —|\b)/, reason: 'the plan’s NAME ("Starter") — a product name, not the dish course' },
  { word: 'hatch', views: /./, near: /HatchGrab/, reason: 'the brand "HatchGrab"' },
  { word: 'collect', views: /./, near: /stamp cards — collected and redeemed/, reason: 'loyalty STAMPS are collected (US English too) — not a customer pickup' },
  { word: 'collect', views: /^parts\/legal\|US\|meta-privacy$/, near: /collects and uses personal data/, reason: 'data COLLECTION in the privacy page’s description (US English too; the legal pages’ wording is Dominic’s legal decision)' },
]
const PAY_AT_HATCH = /Pay at Hatch/g
function usHits(id, value) {
  const hits = []
  for (const { path: p, text } of T.visible(value)) {
    const s = text.replace(PAY_AT_HATCH, '            ').replace(/HatchGrab/g, '#########')
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
const MARKETING_FILES = ['app/landing/page.tsx', 'app/features/page.tsx', 'app/compare/page.tsx', 'app/compare/CostComparison.tsx',
  'components/landing/FeatureComparison.tsx', 'components/landing/LandingNav.tsx', 'components/landing/LandingFooter.tsx', 'components/landing/CountryMenu.tsx',
  'components/landing/DemoUpload.tsx', 'app/contact/page.tsx', 'app/contact/HatchGrabContact.tsx', 'app/(legal)/layout.tsx', 'components/Footer.tsx', 'app/trucks/[slug]/page.tsx']

const HOLE = '\u0001'
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const holeRe = (s, anchored) => new RegExp((anchored ? '^' : '') + s.split(HOLE).map(esc).join('.*?') + (anchored ? '$' : ''), 's')

async function run(ctx) {
  const { t, head, BEFORE, F, A, ids, isUS, isGB, area, same, firstDiff, W, REPO, SECTIONS, GB_NAMED_FILE, US_CHANGED_FILE, RUNS, BEFORE_REF } = ctx
  const on = s => SECTIONS.includes(s)
  const { parse, TYPE } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))
  fs.mkdirSync(RUNS, { recursive: true })
  const claimed = new Map([...N.NAMED.map(e => [e.id, []]), ['html-text-separators', []]])
  ctx.hunkKeys = new Map()
  const viewIds = ids.filter(i => area(i) !== 'router')

  /** F vs BEFORE for one country: identical, or BEFORE + exactly the named transforms that touch it. */
  const codeCheck = (cc, { listUS = false } = {}) => {
    let identical = 0, named = 0
    const listed = []
    for (const id of viewIds.filter(i => (cc === 'US' ? isUS(i) : isGB(i)))) {
      if (!(id in F)) continue
      const b = BEFORE[id], f = F[id]
      if (same(b, f)) { identical++; continue }
      const n = N.apply(id, b)
      // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): a STRUCTURAL named item (`matches`, e.g. Billing's
      // data-driven plan card) is proven by its own proof instead of byte equality.
      if (n.matches) {
        const pr = n.matches(f)
        if (pr.ok) { named++; for (const e of n.touched) claimed.get(e).push(id); continue }
        if (!listUS) { t(`${cc} · ${id}: F === BEFORE + ${n.touched.join(' + ')} (structural)`, false, pr.problems.join('\n      ')); continue }
      }
      if (same(n.expected, f)) { named++; for (const e of n.touched) claimed.get(e).push(id); continue }
      if (typeof f === 'string' && N.normalize(n.expected) === N.normalize(f)) {
        named++; for (const e of [...n.touched, 'html-text-separators']) claimed.get(e).push(id); continue
      }
      if (listUS) { listed.push({ id, touched: n.touched, diff: firstDiff(n.expected, f) }); continue }
      t(`${cc} · ${id}: F === BEFORE${n.touched.length ? ` + ${n.touched.join(' + ')}` : ''}`, false, `expected (BEFORE${n.touched.length ? ' + named' : ''}) vs F ${firstDiff(n.expected, f)}`)
    }
    return { identical, named, listed }
  }

  // ══ GB ═════════════════════════════════════════════════════════════════════════════════════════════════════
  const gbDiff = W.gbKeyDiff()
  if (on('gb')) {
    head(`GB · F (this code, the ${BEFORE_REF} words + as-moved) === BEFORE, except the NAMED items`)
    const r = codeCheck('GB')
    console.log(`  ${r.identical} views byte-identical · ${r.named} views equal to BEFORE + their named item(s)`)
    const gbViews = viewIds.filter(isGB)
    t(`GB · every GB view is BEFORE or BEFORE + named (${r.identical + r.named}/${gbViews.length})`, r.identical + r.named === gbViews.length)

    head('US OFF · a /us page reached anyway (a stale proxy cache) falls back by its own redirect() — the proxy’s 302 is the proof in ROUTER')
    for (const p of ['landing', 'features', 'compare']) for (const v of ['html', 'meta']) {
      const k = `pages/${p}|US|${v}-usOff`
      if (k in A) t(`US off · ${k}: the page redirects (backstop)`, /^REDIRECT/.test(String(A[k])), String(A[k]).slice(0, 200))
    }
    head('GB · /uk is the address’s country — the visitor’s cookie and the US switch do not move it')
    for (const p of ['landing', 'features', 'compare']) {
      const k = `pages/${p}|GB|html-cookieUS`, k2 = `pages/${p}|GB|html-usOn`
      if (k in A) t(`GB · /uk${p === 'landing' ? '' : '/' + p} with hg_country=US (US on) === without the cookie`, same(A[k], A[k2]), firstDiff(A[k2], A[k]))
    }

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
      const pieceKeys = whole.filter(w => w.vb.some((vb, i) => {
        const va = w.va[i]; if (va == null) return false
        const pb = vb.split(HOLE), pa = va.split(HOLE)
        return pb.length === pa.length && pb.some((x, j) => x.trim() && x !== pa[j] && del.includes(x) && del.replace(x, pa[j]) === ins)
      })).map(w => w.key)
      if (pieceKeys.length) return [...new Set(pieceKeys)]
      for (let c = 1; c <= 3; c++) {
        const L = hk.before.slice(-c).join(' '), Rr = hk.after.slice(0, c).join(' ')
        const bx = [L, del, Rr].filter(Boolean).join(' '), ax = [L, ins, Rr].filter(Boolean).join(' ')
        const keys = whole.filter(w => w.vb.some(v => holeRe(v, false).test(bx) || v.replace(/\u0001/g, '').includes(bx)) && w.va.some(v => holeRe(v, false).test(ax) || v.replace(/\u0001/g, '').includes(ax))).map(w => w.key)
        if (keys.length) return keys
      }
      return []
    }
    const perKey = new Map()
    let viewsChanged = 0, hunksExplained = 0
    const unexplained = []
    for (const id of Object.keys(A).filter(i => isGB(i) && area(i) !== 'router')) {
      if (!(id in F) || same(A[id], F[id])) continue
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
        for (const k of keys) { ctx.hunkKeys.get(id).add(k); if (!perKey.has(k)) perKey.set(k, new Set()); perKey.get(k).add(id) }
      }
    }
    for (const u of unexplained.slice(0, 60)) t(`GB · ${u.id}: the change is a changed key's own words`, false, `"${u.hk.before.join(' ')} [${u.hk.del.join(' ')} → ${u.hk.ins.join(' ')}] ${u.hk.after.join(' ')}"`)
    if (unexplained.length > 60) t(`GB · ${unexplained.length - 60} more unexplained hunks`, false)
    t(`GB · every word difference between A and F is explained by a changed key (${hunksExplained} hunks in ${viewsChanged} views)`, unexplained.length === 0, `${unexplained.length} unexplained`)
    const silent = changed.map(([k]) => k).filter(k => !perKey.has(k))
    console.log(`  ${changed.length} en-GB keys changed text between F and A · ${perKey.size} change a GB view this harness renders · ${silent.length} change none of them${silent.length ? ` (${silent.slice(0, 12).join(', ')}${silent.length > 12 ? ' …' : ''})` : ''}`)
    fs.writeFileSync(path.join(RUNS, 'gb-per-key.txt'), [...perKey].sort().map(([k, s]) => `${k}\t${s.size}\t${[...s].join(' ')}`).join('\n') + '\n')
    ctx.gbStats = { identical: r.identical, named: r.named, total: gbViews.length, keys: changed.length, reach: perKey.size, viewsChanged, hunksExplained }
  }

  // ══ the en-GB key list, the overlays, the en-US keys ═══════════════════════════════════════════════════════
  if (on('keys')) {
    head('GB · the en-GB keys whose text differs between F and A are exactly scripts/fixtures/language-phase-1e-gb-named.json')
    const named = fs.existsSync(GB_NAMED_FILE) ? JSON.parse(fs.readFileSync(GB_NAMED_FILE, 'utf8')) : null
    t('the named list exists (node scripts/language-phase-1e.cjs --write-gb-named)', !!named)
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the keys Stage A reworded or removed are Stage A's, not
    // Phase 1e's — exempt from the 1e list, but each must be EXACTLY what scripts/fixtures/plans-stage-a-messages.json
    // records (W.gbKeyDiff marks a key only on an exact match), and every key that file names that eb7ed44 had must show.
    const stageA = Object.keys(gbDiff).filter(k => W.isStageA(gbDiff[k]))
    const sa = W.LP2.stageA()['en-GB'], at0 = W.flat(W.LP2.readJson(W.FROZEN_GB))
    // ⚠️ RE-PINNED (address-formats-2, 21 October 2026): address-formats-2's rewordings are shown at their NEW text in every
    // frozen catalogue (scripts/_lp2-frozen.cjs af2AfterTree — their arguments changed with the code), so they do not differ
    // between F and A; each must then be exactly its recorded `after` in both.
    const af2 = W.LP2.stageAF2()['en-GB'].reworded || {}
    const af2Ok = k => k in af2 && !(k in gbDiff) && W.flat(W.LP2.readJson(require('path').join(W.LP2.REPO, 'messages/en-GB.json')))[k] === af2[k].after
    const saMissing = [...Object.keys(sa.reworded || {}), ...Object.keys(sa.removed || {})].filter(k => k in at0 && !stageA.includes(k) && !af2Ok(k))
    t(`the en-GB keys Stage A reworded / removed differ exactly as recorded (${stageA.length}: ${stageA.filter(k => gbDiff[k].after != null).length} reworded, ${stageA.filter(k => gbDiff[k].after == null).length} removed)`, saMissing.length === 0, `not as recorded: ${saMissing.join(', ')}`)
    if (named) {
      // ⚠️ RE-PINNED (ireland-1, 20 October 2026): ireland-1's two exact tradeArea rewordings (W.isIE1) are not 1e's.
      const extra = Object.keys(gbDiff).filter(k => !(k in named) && !W.isStageA(gbDiff[k]) && !W.isIE1(gbDiff[k]))
      const ie1 = Object.keys(W.IE1_REWORDED)
      t(`ireland-1's tradeArea rewordings differ exactly as recorded (${ie1.length})`, ie1.every(k => W.isIE1(gbDiff[k])), ie1.filter(k => !W.isIE1(gbDiff[k])).map(k => `${k}: ${JSON.stringify(gbDiff[k] || null)}`).join(' · '))
      // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): a named key a plan stage REMOVED (W.LP2.stageA().removed —
      // Stage B deleted e.g. landing.pricing.summary, planFeatures.footnote.n1, planMeta.description.trial) has no text left
      // to differ: it must be absent from messages/en-GB.json instead (as scripts/_lp1d-checks.cjs does for Stage A).
      const aNow = W.flat(W.catalogues('A')['en-GB'])
      const removedNamed = Object.keys(named).filter(k => !(k in gbDiff) && k in (sa.removed || {}))
      t(`the named keys a plan stage removed are absent from messages/en-GB.json (${removedNamed.length})`, removedNamed.every(k => !(k in aNow)), removedNamed.filter(k => k in aNow).join(', '))
      const gone = Object.keys(named).filter(k => !(k in gbDiff) && !removedNamed.includes(k))
      const moved = Object.keys(gbDiff).filter(k => k in named && (named[k].before !== gbDiff[k].before || named[k].after !== gbDiff[k].after))
      t(`every changed en-GB key is named (${Object.keys(gbDiff).length} changed)`, extra.length === 0, `not in the list: ${extra.join(', ')}`)
      t('every named key changed, as named', gone.length === 0 && moved.length === 0, `named but unchanged: ${gone.join(', ')} · different text: ${moved.join(', ')}`)
    }
    const unrecorded = Object.entries(gbDiff).filter(([, d]) => /WITHOUT a recorded fix/.test(d.kind)).map(([k, d]) => `${k} (${d.kind})`)
    t(`every reworded en-GB key went through the helper as a GB fix (no ${BEFORE_REF} key reworded silently)`, unrecorded.length === 0, unrecorded.join(' · '))
    const deleted = Object.entries(gbDiff).filter(([, d]) => /deleted|MOVED/.test(d.kind)).map(([k, d]) => `${k} (${d.kind})`)
    if (deleted.length) console.log(`  ${deleted.length} ${BEFORE_REF} en-GB key(s) deleted or moved: ${deleted.join(', ')}`)
    const km = W.keyMoveProblems()
    t(`every key MOVED between namespaces keeps its words (${Object.keys(W.moves1e()).length} moves)`, km.length === 0, km.join(' · '))
    const mp = W.movedProblems()
    t(`the as-moved overlay is consistent (${Object.keys(W.moved()).length} GB fixes)`, mp.length === 0, mp.join(' · '))
    // every en-US key exists in en-GB, differs from it, and keeps the same ICU arguments and tags
    const gb = W.flat(W.catalogues('A')['en-GB']), us = W.flat(W.catalogues('A')['en-US'])
    const argsOf = s => { try { const out = new Set(); const walk = els => { for (const e of els) { if (e.value && typeof e.value === 'string' && e.type !== TYPE.literal) out.add(`${e.type}:${e.value}`); if (e.children) walk(e.children); if (e.options) for (const o of Object.values(e.options)) walk(o.value) } }; walk(parse(s, { ignoreTag: false })); return [...out].sort().join(',') } catch (e) { return `PARSE ERROR ${e.message}` } }
    const badUS = []
    const ud = W.usDiff()
    for (const k of [...Object.keys(ud.added), ...Object.keys(ud.changed)]) {
      if (!(k in gb)) badUS.push(`${k}: no en-GB key`)
      else if (gb[k] === us[k]) badUS.push(`${k}: en-US equals en-GB`)
      else if (argsOf(gb[k]) !== argsOf(us[k])) badUS.push(`${k}: arguments differ (${argsOf(gb[k])} vs ${argsOf(us[k])})`)
    }
    t(`every en-US key added or changed since ${BEFORE_REF} exists in en-GB, differs, and has the same arguments and tags (${Object.keys(ud.added).length} added, ${Object.keys(ud.changed).length} changed, ${Object.keys(ud.removed).length} removed)`, badUS.length === 0, badUS.join(' · '))
    ctx.usDiff = ud
  }

  // ══ US ═════════════════════════════════════════════════════════════════════════════════════════════════════
  if (on('us')) {
    head(`US · F (this code, the ${BEFORE_REF} words) vs BEFORE — the named items (with /us), or LISTED as US behaviour`)
    const r = codeCheck('US', { listUS: true })
    console.log(`  ${r.identical} views byte-identical · ${r.named} equal to BEFORE + their named item(s) · ${r.listed.length} LISTED as changed by US code behaviour`)
    const byPart = {}
    for (const x of r.listed) { const k = x.id.split('|')[0]; byPart[k] = (byPart[k] || 0) + 1 }
    for (const [k, n] of Object.entries(byPart)) console.log(`    ${k.padEnd(20)} ${n}`)
    const unclassified = r.listed.filter(x => /unclassified/.test(N.usBehaviour(x.id))).map(x => x.id)
    t(`US · every LISTED US code change has a named US behaviour (${r.listed.length})`, unclassified.length === 0, unclassified.join(', '))
    head(`US · A vs BEFORE — every view that changed, listed with its cause`)
    const usIds = viewIds.filter(isUS)
    const changedUS = usIds.filter(i => i in A && !same(BEFORE[i], A[i]))
    const totals = {}, byArea = {}
    const sub = id => id.split('|')[0]
    for (const id of usIds) totals[sub(id)] = (totals[sub(id)] || 0) + 1
    for (const id of changedUS) byArea[sub(id)] = (byArea[sub(id)] || 0) + 1
    for (const a of Object.keys(totals).sort()) console.log(`  ${a.padEnd(22)} ${String(byArea[a] || 0).padStart(4)} of ${totals[a]} US views changed`)
    const listedIds = new Set(r.listed.map(x => x.id))
    const lines = [`# Language Phase 1e — every US view that differs from BEFORE (${BEFORE_REF}) (${usIds.length} US views; ${changedUS.length} changed). Written by scripts/language-phase-1e.cjs.`,
      '# view id\twhy (code: a named item / US code behaviour; words: the en-US words and moved messages)']
    for (const id of changedUS) {
      const n = N.apply(id, BEFORE[id])
      const code = !same(BEFORE[id], F[id])
      const why = !code ? 'words' : `code: ${[...n.touched, ...(listedIds.has(id) ? [`US behaviour — ${N.usBehaviour(id)}`] : [])].join(' + ') || 'UNNAMED'}`
      lines.push(`${id}\t${why}${code && !same(F[id], A[id]) ? ' + words' : ''}`)
    }
    fs.writeFileSync(US_CHANGED_FILE, lines.join('\n') + '\n')
    console.log(`  ${changedUS.length} US views changed in all → ${path.relative(REPO, US_CHANGED_FILE)}`)
    ctx.usStats = { views: usIds.length, changed: changedUS.length, listed: r.listed.length, named: r.named, identical: r.identical }
  }
  if (on('gb') || on('us')) {
    head('the NAMED table — each item claims the views it changed')
    for (const e of [...N.NAMED, { id: 'html-text-separators', what: 'React’s empty <!-- --> between adjacent text nodes (invisible), removed from both sides' }]) {
      const v = claimed.get(e.id), gbN = v.filter(isGB).length, usN = v.filter(isUS).length
      console.log(`  ${v.length ? '·' : '⚠️'} ${e.id}: GB ${gbN}, US ${usN} view(s) — ${e.what}${v.length ? '' : ' — NONE (not landed, or stale)'}`)
    }
    ctx.namedClaims = Object.fromEntries([...claimed].map(([k, v]) => [k, { gb: v.filter(isGB).length, us: v.filter(isUS).length }]))
  }

  // ══ THE US-WORDS CHECK ═════════════════════════════════════════════════════════════════════════════════════
  if (on('words')) {
    head('US · THE US-WORDS CHECK — every A(US) view (pages, parts, Billing), what a person sees')
    // ⚠️ NOT the tidy's `-discoveryOn` CONTROLS (scripts/_lp1e-parts.cjs): they force Village Foodie's prompts back on so
    // scripts/language-phase-1e-tidy.cjs can prove those prompts are the only difference — no visitor ever sees them.
    const usIds = Object.keys(A).filter(i => isUS(i) && area(i) !== 'router' && !/\|(html|meta)-usOff$/.test(i) && !/-discoveryOn$/.test(i))
    const all = usIds.flatMap(id => usHits(id, A[id]))
    const bad = all.filter(h => !h.allow), allowed = all.filter(h => h.allow)
    const byWord = {}
    for (const h of bad) { byWord[h.word] = byWord[h.word] || { n: 0, views: new Set() }; byWord[h.word].n++; byWord[h.word].views.add(h.id) }
    const allowedBy = {}
    for (const h of allowed) allowedBy[h.allow.reason] = (allowedBy[h.allow.reason] || 0) + 1
    console.log(`  ${usIds.length} US views read · ${all.length} hits · ${allowed.length} allowed · ${bad.length} to fix`)
    for (const [r, n] of Object.entries(allowedBy)) console.log(`    allowed ${String(n).padStart(4)} — ${r.slice(0, 160)}`)
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
    if (distinct.size > limit) t(`US words · ${distinct.size - limit} more distinct hits (--all-hits; node_modules/.cache/lp1e-runs/us-words-hits.tsv)`, false)
    t(`US words · no UK-only word in any US view (${bad.length} hits, ${distinct.size} distinct)`, bad.length === 0)
    ctx.wordStats = { views: usIds.length, hits: all.length, allowed: allowed.length, bad: bad.length, allowedBy }
  }

  // ══ THE ROUTER ═════════════════════════════════════════════════════════════════════════════════════════════
  if (on('router')) {
    head('ROUTER · the real proxy (proxy.ts) — the table against the spec; no loops; country pages; paths it must not touch')
    const rv = Object.keys(A).filter(i => area(i) === 'router')
    const bundleErr = A['router/router|X|bundle']
    t('the proxy bundles and runs', !bundleErr, bundleErr)
    const parseKey = id => { const m = /^router\/router\|X\|(\S+) (\S+) c=(\S+) ip=(\S+) us=(on|off)$/.exec(id); return m && { host: m[1], url: m[2], cookie: m[3] === '-' ? null : m[3], ip: m[4] === '-' ? null : m[4], usOn: m[5] === 'on' } }
    const SEG = { GB: 'uk', US: 'us' }
    const PAGE_OF = { '/': '', '/landing': '', '/1ng7n4p5omux2gdk9kqvwz': '', '/features': '/features', '/compare': '/compare' }
    /** Dominic's spec, written here from the brief — not read from the code under test. */
    const expectRouter = k => {
      const u = new URL(k.url, 'https://x'); const enabled = k.usOn ? ['GB', 'US'] : ['GB']
      const q = (u.searchParams.get('country') || '').trim().toUpperCase(), c = (k.cookie || '').toUpperCase(), ip = (k.ip || '').toUpperCase()
      let code = 'GB', fromQuery = false
      if (enabled.includes(q)) { code = q; fromQuery = true } else if (enabled.includes(c)) code = c; else if (enabled.includes(ip)) code = ip
      u.searchParams.delete('country')
      const rest = u.searchParams.toString()
      return { status: 302, location: `/${SEG[code]}${PAGE_OF[u.pathname]}${rest ? `?${rest}` : ''}`, remember: fromQuery ? code : null }
    }
    const table = []
    let routerOk = 0, countryOk = 0, untouchedOk = 0, oddOk = 0
    for (const id of rv) {
      const k = parseKey(id); if (!k) continue
      const v = A[id]
      if (typeof v === 'string') { t(`router · ${id}`, false, v); continue }
      const u = new URL(k.url, 'https://x')
      const loops = v.chain && v.chain.some(c => c.LOOP), endless = v.ends && /STILL REDIRECTING/.test(v.ends)
      t(`router · ${k.host} ${k.url} c=${k.cookie || '-'} ip=${k.ip || '-'} us=${k.usOn ? 'on' : 'off'}: no redirect loop`, !loops && !endless, JSON.stringify(v.chain))
      const isHG = k.host === R.HG
      if (isHG && u.pathname in PAGE_OF) {
        const e = expectRouter(k)
        const cookieSet = (v.setCookie || []).find(c => /^hg_country=/.test(c))
        const cookieOk = e.remember ? cookieSet && cookieSet.startsWith(`hg_country=${e.remember};`) && /Path=\//i.test(cookieSet) && /SameSite=lax/i.test(cookieSet) && /Max-Age=\d+/i.test(cookieSet) : !cookieSet
        const ends = v.chain && v.chain.length === 1 && v.chain[0].kind === 'next' && v.chain[0].status === 200
        const ok = v.status === e.status && v.location === e.location && cookieOk && ends
        if (ok) routerOk++
        t(`router · ${k.url} c=${k.cookie || '-'} ip=${k.ip || '-'} us=${k.usOn ? 'on' : 'off'} → ${e.status} ${e.location}${e.remember ? ` + hg_country=${e.remember}` : ''}, then 200`, ok, `got ${v.status} ${v.location} cookies ${JSON.stringify(v.setCookie)} chain ${JSON.stringify(v.chain)}`)
        table.push([`${k.url}`, `${k.cookie ? `cookie ${k.cookie}` : ''}${k.ip ? `${k.cookie ? ' + ' : ''}IP ${k.ip}` : ''}` || '—', k.usOn ? 'on' : 'off', `${v.status} → ${v.location}${cookieSet ? ` (sets ${cookieSet.split(';')[0]})` : ''}`])
      } else if (isHG && R.COUNTRY_PAGES.includes(u.pathname)) {
        const isUSPage = u.pathname.startsWith('/us')
        if (isUSPage && !k.usOn) {
          u.searchParams.delete('country'); const rest = u.searchParams.toString()
          const want = u.pathname.replace(/^\/us/, '/uk') + (rest ? `?${rest}` : '')
          const ok = v.status === 302 && v.location === want && !(v.setCookie || []).some(c => /^hg_country=/.test(c)) && v.chain.length === 1 && v.chain[0].kind === 'next'
          if (ok) countryOk++
          t(`router · ${k.url} c=${k.cookie || '-'} ip=${k.ip || '-'} (US OFF) → 302 ${want}, then 200`, ok, JSON.stringify(v))
          table.push([k.url, `${k.cookie ? `cookie ${k.cookie}` : ''}${k.ip ? `IP ${k.ip}` : ''}` || '—', 'off', `${v.status} → ${v.location}`])
        } else {
          const ok = v.status === 200 && v.kind === 'next' && !v.location
          if (ok) countryOk++
          t(`router · ${k.url} c=${k.cookie || '-'} ip=${k.ip || '-'} us=${k.usOn ? 'on' : 'off'} → 200, never redirected`, ok, JSON.stringify(v))
          if (!k.cookie && !k.ip && !u.search) table.push([k.url, '—', k.usOn ? 'on' : 'off', `${v.status} (${v.kind})`])
        }
      } else if (isHG && R.ODD_PATHS.includes(k.url)) {
        const ok = v.status < 500 && !loops
        if (ok) oddOk++
        t(`router · odd path ${k.url} us=${k.usOn ? 'on' : 'off'}: answered (${v.status} ${v.kind}${v.location ? ' ' + v.location : ''})`, ok)
      } else {
        const b = BEFORE[id]
        const strip = x => x && typeof x === 'object' ? { status: x.status, kind: x.kind, location: x.location, rewrite: x.rewrite, setCookie: x.setCookie, ends: x.ends || null } : x
        // the one named exception: /landing on hatchgrab.com (the apex) is a router path there too
        const ok = same(strip(b), strip(v))
        if (ok) untouchedOk++
        t(`router · untouched ${k.host} ${k.url} c=${k.cookie || '-'} us=${k.usOn ? 'on' : 'off'}: same response as ${BEFORE_REF}`, ok || (/hatchgrab/.test(k.host) && k.url.split('?')[0] in PAGE_OF) || (/hatchgrab/.test(k.host) && R.COUNTRY_PAGES.includes(k.url.split('?')[0])),
          `BEFORE ${JSON.stringify(strip(b))}\n      AFTER  ${JSON.stringify(strip(v))}`)
      }
    }
    console.log(`  ${rv.length} router views · ${routerOk} router-path answers as specified · ${countryOk} country-page answers · ${untouchedOk} untouched paths same as ${BEFORE_REF} · ${oddOk} odd paths answered`)
    // HatchGrab apex + preview hosts: the router runs there too (isHatchGrab is host.includes('hatchgrab'))
    for (const id of rv) {
      const k = parseKey(id); if (!k || k.host === R.HG || !/hatchgrab/.test(k.host)) continue
      const v = A[id], path0 = k.url.split('?')[0]
      if (path0 in PAGE_OF) t(`router · ${k.host} ${k.url} us=${k.usOn ? 'on' : 'off'}: routed like www (302 → a country page on the same host)`, v.status === 302 && /^\/(uk|us)(\/|$|\?)/.test(v.location || ''), JSON.stringify(v))
    }
    fs.writeFileSync(path.join(RUNS, 'router-table.tsv'), 'path\tinputs\tUS\tanswer\n' + table.map(r => r.join('\t')).join('\n') + '\n')
    ctx.routerTable = table
    ctx.routerStats = { views: rv.length, routerOk, countryOk, untouchedOk, oddOk }
    // BEFORE → AFTER for the router paths themselves (the named change)
    for (const p of ['/', '/landing', '/features', '/compare', '/1ng7n4p5omux2gdk9kqvwz']) {
      const id = `router/router|X|${R.HG} ${p} c=- ip=- us=off`
      if (BEFORE[id] && A[id]) console.log(`    ${p.padEnd(26)} BEFORE ${BEFORE[id].status} ${BEFORE[id].kind}${BEFORE[id].rewrite ? ' → ' + BEFORE[id].rewrite : BEFORE[id].location ? ' → ' + BEFORE[id].location : ''}  ·  AFTER ${A[id].status} ${A[id].kind}${A[id].location ? ' → ' + A[id].location : ''}`)
    }
  }

  // ══ THE PLANS PDF ══════════════════════════════════════════════════════════════════════════════════════════
  if (on('pdf')) {
    head('PDF · GB on A4, US on US Letter — the CSS @page size and the option the real generator hands the browser')
    for (const [cc, size] of [['GB', 'A4'], ['US', 'Letter']]) {
      const pr = A[`parts/pdf|${cc}|print`]
      if (!pr || typeof pr === 'string') { t(`pdf · ${cc}: printed`, false, String(pr)); continue }
      t(`pdf · ${cc}: @page size ${size}`, String(pr.cssPageSize).toLowerCase() === size.toLowerCase(), pr.cssPageSize)
      t(`pdf · ${cc}: page.pdf({ format: '${size}' })`, String(pr.pdf && pr.pdf.format).toLowerCase() === size.toLowerCase(), JSON.stringify(pr.pdf))
      t(`pdf · ${cc}: the printed HTML is buildPlansPdfHtml's, and the browser is closed`, pr.printedHtmlEqualsBuild && pr.closed, JSON.stringify(pr))
      ctx[`pdf${cc}`] = { css: pr.cssPageSize, format: pr.pdf && pr.pdf.format }
    }
    const gbB = BEFORE['parts/pdf|GB|print'], gbA = A['parts/pdf|GB|print']
    t('pdf · GB print options byte-identical to BEFORE', same(gbB, gbA), firstDiff(gbB, gbA))
  }

  // ══ SCREENSHOTS ════════════════════════════════════════════════════════════════════════════════════════════
  if (on('shots')) {
    head('SCREENSHOTS · US pages show the -us images (or none); GB pages the originals; files at the GB pixel sizes')
    const png = f => { const b = fs.readFileSync(f); return b.toString('ascii', 1, 4) === 'PNG' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null }
    const imgs = html => [...String(html).matchAll(/(?:src|href)="(\/screenshots\/[^"?]+)"/g)].map(m => m[1])
    const gbShots = new Set(imgs(A['pages/landing|GB|html']))
    const beforeShots = new Set(imgs(BEFORE['pages/landing|GB|html']))
    t(`shots · GB landing references exactly BEFORE's screenshots (${[...beforeShots].join(', ')})`, same([...gbShots].sort(), [...beforeShots].sort()), [...gbShots].join(', '))
    const usShots = new Set(imgs(A['pages/landing|US|html']))
    const nonUS = [...usShots].filter(s => !/-us\.(png|jpg|webp)$/.test(s))
    console.log(`  US landing references: ${[...usShots].join(', ') || 'none'}`)
    t('shots · the US landing references only -us screenshots (or none)', nonUS.length === 0, `GB images on the US page: ${nonUS.join(', ')}`)
    for (const s of usShots) {
      const f = path.join(REPO, 'public', s)
      const gbTwin = path.join(REPO, 'public', s.replace(/-us(\.[a-z]+)$/, '$1'))
      t(`shots · ${s} exists`, fs.existsSync(f))
      if (fs.existsSync(f) && fs.existsSync(gbTwin) && /\.png$/.test(f)) {
        const a = png(f), b = png(gbTwin)
        t(`shots · ${s} is ${b && `${b.w}×${b.h}`} like its GB image`, a && b && a.w === b.w && a.h === b.h, `${a && `${a.w}×${a.h}`} vs ${b && `${b.w}×${b.h}`}`)
      }
    }
    ctx.shots = { gb: [...gbShots], us: [...usShots] }

    head('APP STORE · GB pages keep the UK listing byte-identical; US pages link the locale-free listing (lib/app-badges appStoreUrlFor)')
    const UK_STORE = 'https://apps.apple.com/gb/app/hatchgrab/id6803543106', FREE_STORE = 'https://apps.apple.com/app/id6803543106'
    for (const p of ['landing', 'features', 'compare']) {
      const g = String(A[`pages/${p}|GB|html`] || ''), u = String(A[`pages/${p}|US|html`] || ''), b = String(BEFORE[`pages/${p}|GB|html`] || '')
      if (!b.includes(UK_STORE)) continue
      t(`app store · ${p} GB: the UK listing, as before`, g.includes(UK_STORE) && !g.includes(FREE_STORE))
      t(`app store · ${p} US: the locale-free listing, never the UK one`, u.includes(FREE_STORE) && !u.includes(UK_STORE))
    }
  }

  // ══ UI-LITERALS (informational) ════════════════════════════════════════════════════════════════════════════
  if (on('literals')) {
    head('UI-LITERALS · inline user-facing strings left in the marketing files (informational — ui-literals.cjs is the gate)')
    const ts = require(path.join(REPO, 'node_modules/typescript'))
    const PROPS = new Set(['placeholder', 'title', 'label', 'aria-label', 'alt'])
    const base = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/ui-literals-baseline.json'), 'utf8')).counts
    ctx.literals = {}
    for (const f of MARKETING_FILES) {
      if (!fs.existsSync(path.join(REPO, f))) continue
      const sf = ts.createSourceFile(f, fs.readFileSync(path.join(REPO, f), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const out = []
      const literal = e => e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && /[A-Za-z]/.test(e.text)
      const visit = node => {
        if (ts.isJsxText(node) && /[A-Za-z]/.test(node.getText())) out.push(node.getText().replace(/\s+/g, ' ').trim())
        else if (ts.isJsxAttribute(node) && PROPS.has(node.name.getText())) {
          const v = node.initializer
          const e = literal(v) ? v : v && ts.isJsxExpression(v) && literal(v.expression) ? v.expression : null
          if (e) out.push(`${node.name.getText()}="${e.text}"`)
        }
        ts.forEachChild(node, visit)
      }
      visit(sf)
      ctx.literals[f] = { before: base[f], now: out.length }
      console.log(`  ${f}: ${base[f] ?? '—'} → ${out.length}${out.length ? ` (${out.slice(0, 6).map(x => x.slice(0, 40)).join(' | ')}${out.length > 6 ? ' …' : ''})` : ''}`)
    }
  }
}

module.exports = { run, usHits, US_WORDS, ALLOW, MARKETING_FILES }
