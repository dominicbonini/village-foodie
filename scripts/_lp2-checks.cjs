// scripts/_lp2-checks.cjs — the checks of scripts/language-phase-2.cjs (Language Phase 2). A MODULE, not a harness.
//   gb      · F(GB) === BEFORE(GB) except the NAMED code changes; A(GB) vs F(GB) explained word by word by the changed
//             en-GB keys (printed per key, with the views each changes)
//   keys    · the en-GB key diff === scripts/fixtures/language-phase-2-gb-named.json
//   us      · F(US) === BEFORE(US) except the named Part 2 changes; every A(US) view that differs from BEFORE listed
//   words   · THE US-WORDS CHECK on every A(US) view
//   tickets · every US ticket's bytes fit their columns and are plain ASCII
const fs = require('fs'); const path = require('path')
const T = require('./_lp2-text.cjs')
const { NAMED } = require('./_lp2-named.cjs')

// ══ THE US WORDS ══════════════════════════════════════════════════════════════════════════════════════════════
const US_WORDS = [
  ['basket', /\bbasket/i], ['collect', /\bcollect(ion|ions|ed|ing|s)?\b/i], ['hatch', /\bhatch\b/i], ['van', /\bvans?\b/i],
  ['postcode', /postcode/i], ['mobile', /\bmobile\b/i], ['till', /\btill\b/i], ['takings', /takings/i], ['card machine', /card machine/i],
  ['contactless', /contactless/i], ['cancelled', /cancell(ed|ing)/i], ['authorise', /authoris/i], ['organise', /organis/i], ['colour', /colour/i],
  ['favourite', /favourite/i], ['TBC', /\bTBC\b/], ['part paid', /part paid/i], ['co.uk', /co\.uk/i], ['💷', /💷/u], ['£', /£/], ['Sept', /\bSept\b/],
]
/** Genuine exceptions — each with the view(s) it applies to and its reason. Kept tiny. A hit is allowed when its
 *  word, its view id and the text around it (`near`, matched against ±40 characters) all match. */
const ALLOW = [
  { word: 'co.uk', views: /./, near: /hello@villagefoodie\.co\.uk/, reason: 'the sender / reply-to ADDRESS of every email (lib/email-config.ts HATCHGRAB_SENDER) — infrastructure, not words; changing it is a mail-domain decision, not a language one' },
  { word: 'van', views: /^(1c\/setup\/US\|provision\|operator\|van|2\/extra\/US\|rows\|truck\|namedVan)$/, near: /Big Van/, reason: 'fixture data: a van name the operator TYPED ("  Big Van  ") — provisionTruck keeps a given name as given' },
  { word: 'van', views: /^(1b\/(kds|native|dashboard|components)|1c\/(goLive|demo))\/US\|/, near: /\b(Van 1|Van 2|Big van)\b/, reason: 'fixture data: a van NAME stored on the fixture truck (truck_vans.name "Van 1" / "Big van" in scripts/_lp1b-*.cjs, scripts/_lp1c-*.cjs; the 1c demo rows are a GB-built demo moved to the US). A US truck provisioned after Phase 2 gets "Truck 1" (proven in 2/extra/US|rows|truck|*)' },
  { word: 'van', views: /^1c\/goLive\/US\|check\|/, near: /Van A, Van B/, reason: 'fixture data: the go-live fixture’s van NAMES ("Van A", "Van B") inside the capacity sentence' },
  { word: 'van', views: /^1b\/components\/US\|cancel\|/, near: /Sorry, the van broke down/, reason: 'fixture data: the note the OPERATOR typed into the event-cancel box (scripts/_lp1b-components.cjs)' },
  { word: 'van', views: /^1c\/setup\/US\|provision\|operator\|noVan$/, near: /No van created — slot_capacity/, reason: 'a developer warning provisionTruck returns to its caller for the log (`result.warnings`); /api/setup passes it through and no screen shows it' },
  { word: 'collect', views: /^1b\/printing\/ticket\|US\|[^|]+\|noTruck\|/, near: /COLLECT/, reason: 'the mapper’s NO-TRUCK robustness case: with no truck there is no country to take a language from, so the ticket is en-GB. The app always passes the truck (mapOrderToTicket gets truck.time.locale), and every US ticket that has one prints PICKUP' },
  { word: 'authorise', views: /^(1b\/api\/US\|(action\|badToken|printing\|(get|post)NoToken|bind\|(get|post)BadToken)|1c\/api\/US\|(cancel-email-change\|noUser|change-email\|noUser|resend-verification\|(noUser|notOwner)))$/, near: /Unauthorised/, reason: 'refused BEFORE the truck is known (no token, a bad token, no signed-in user): there is no country to take a language from, so the body’s English fallback is en-GB. Its `code` ("unauthorised") is what a screen renders, in the screen’s own locale' },
  { word: 'cancelled', views: /^1c\/api\/US\|deletion\|post\|okNoTrucks$/, near: /cannot be cancelled/, reason: 'an owner with NO truck: no country to take a language from, so the deletion email is en-GB (the default locale), as named in P2-deletion-email-date' },
  { word: 'cancelled', views: /^1a\/statusPage\/US\|cancelError$/, near: /This order can no longer be cancelled/, reason: 'fixture data: the state is seeded with the cancel route’s English `error` string verbatim (scripts/language-phase-1a.cjs `cancelError`); a US truck’s route answers in en-US' },
  { word: 'collect', views: /^1b\/kds\/US\|action\|gate\|serverError$/, near: /Order already collected/, reason: 'fixture data: a stubbed SERVER reply’s `error` text (scripts/_lp1b-kds.cjs) shown as the toast' },
  { word: 'cancelled', views: /^1b\/dashboard\/US\|handler\|openEvent\|failMsg$/, near: /Event is cancelled/, reason: 'fixture data: a stubbed SERVER reply’s `error` text (scripts/_lp1b-dashboard.cjs) shown as the toast' },
  { word: 'cancelled', views: /^1b\/kds\/US\|action\|event\|(startFails|cancelFails)$/, near: /Event is cancelled|Already cancelled/, reason: 'fixture data: a stubbed SERVER reply’s `error` text (scripts/_lp1b-kds.cjs)' },
  { word: 'postcode', views: /^2\/extra\/US\|manage\|/, near: /postcode/, reason: 'Manage is not a Phase 2 surface (its words move in a later phase): these views are here only for their DATE labels ("Sep", the US order)' },
  { word: '£', views: /^1b\/components\/US\|(reject|stored\|reject)\|/, near: /£43\.90/, reason: 'fixture data: the reject modal is handed its total as a literal prop (" · £43.90", scripts/_lp1b-components.cjs rejectProps); the screens pass the order’s own formatted total' },
]
const PAY_AT_HATCH = /Pay at Hatch/g   // the brand name, in every country

function usHits(id, value) {
  const hits = []
  for (const { path: p, text } of T.visible(value)) {
    const s = text.replace(PAY_AT_HATCH, '            ')
    for (const [word, re] of US_WORDS) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
      let m
      while ((m = g.exec(s))) {
        const near = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ')
        const allow = ALLOW.find(a => a.word === word && a.views.test(id) && a.near.test(near))
        hits.push({ id, path: p, word, match: m[0], near, allow, full: text })
        if (!m[0].length) g.lastIndex++
      }
    }
  }
  return hits
}

// ══ ICU variants of a message, for explaining a word change ═════════════════════════════════════════════════
const HOLE = '\u0001'
function icuVariants(src, parse, TYPE) {
  let ast; try { ast = parse(src) } catch { return [src] }
  const walk = (els, tagMode) => {
    let outs = ['']
    for (const el of els) {
      if (el.type === TYPE.literal) outs = outs.map(o => o + el.value)
      else if (el.type === TYPE.pound || el.type === TYPE.argument || el.type === TYPE.number || el.type === TYPE.date || el.type === TYPE.time) outs = outs.map(o => o + HOLE)
      else if (el.type === TYPE.tag) { const inner = walk(el.children, tagMode); const sep = tagMode ? ' ' : ''; outs = outs.flatMap(o => inner.map(i => o + sep + i + sep)) }
      else if (el.type === TYPE.select || el.type === TYPE.plural) { const opts = Object.values(el.options).flatMap(o => walk(o.value, tagMode)); outs = outs.flatMap(o => opts.map(x => o + x)) }
      if (outs.length > 48) outs = outs.slice(0, 48)
    }
    return outs
  }
  return [...new Set([...walk(ast, true), ...walk(ast, false)].map(s => s.replace(/\s+/g, ' ').trim()))]
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const holeRe = (s, anchored) => new RegExp((anchored ? '^' : '') + s.split(HOLE).map(esc).join('.*?') + (anchored ? '$' : ''), 's')

async function run(ctx) {
  const { t, head, BEFORE, F, A, ids, isUS, area, same, firstDiff, LP2, REPO, SECTIONS, GB_NAMED_FILE, US_CHANGED_FILE } = ctx
  const on = s => SECTIONS.includes(s)
  const { parse, TYPE } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))

  /** The named entries for a view, and the expected F value (null when an entry only LISTS the view). */
  const namedFor = (id, before) => require('./_lp2-named.cjs').apply(id, before)
  const claimed = new Map(NAMED.map(e => [e.id, []]))
  const codeCheck = (cc) => {
    let identical = 0, named = 0
    const listed = []
    for (const id of ids.filter(i => (cc === 'US') === isUS(i))) {
      if (!(id in F)) continue
      const b = BEFORE[id], f = F[id]
      const n = namedFor(id, b)
      if (n.listed) {
        if (!same(b, f)) { listed.push(id); for (const e of n.entries.filter(e => !e.expect)) claimed.get(e.id).push(id) }
        else identical++
        continue
      }
      if (same(b, f) && same(n.expected, b)) { identical++; continue }
      for (const e of n.touched) claimed.get(e).push(id)
      if (!n.touched.length) { t(`${cc} · ${id}: F === BEFORE (no named code change applies)`, same(b, f), firstDiff(b, f)); continue }
      const ok = same(n.expected, f)
      if (ok) named++
      t(`${cc} · ${id}: F === BEFORE with ONLY the named change(s) ${n.touched.join(' + ')}`, ok, `expected (BEFORE + named) vs F ${firstDiff(n.expected, f)}`)
    }
    return { identical, named, listed }
  }

  // ══ GB ═════════════════════════════════════════════════════════════════════════════════════════════════════
  const gbDiff = LP2.gbKeyDiff()
  if (on('gb')) {
    head('GB · F (this code, the BEFORE words) === BEFORE, except the NAMED code changes')
    const r = codeCheck('GB')
    console.log(`  ${r.identical} views byte-identical · ${r.named} views equal to BEFORE + their named change(s)`)

    head('GB · A vs F — every difference is a changed en-GB key’s own word change')
    const changed = Object.entries(gbDiff).filter(([, d]) => d.before != null && d.after != null)
    const patterns = []   // { key, del: RegExp, ins: RegExp } anchored hunks, and the whole variants for context matches
    const whole = []
    for (const [key, d] of changed) {
      const vb = icuVariants(d.before, parse, TYPE), va = icuVariants(d.after, parse, TYPE)
      whole.push({ key, vb, va })
      for (const x of vb) for (const y of va) for (const hk of T.wordDiff(x, y)) {
        patterns.push({ key, del: holeRe(hk.del.join(' '), true), ins: holeRe(hk.ins.join(' '), true) })
      }
    }
    const explain = hk => {
      const del = hk.del.join(' '), ins = hk.ins.join(' ')
      const direct = patterns.filter(p => p.del.test(del) && p.ins.test(ins)).map(p => p.key)
      if (direct.length) return [...new Set(direct)]
      // The same change with up to three unchanged words either side, found inside one key's before and after texts.
      for (let c = 1; c <= 3; c++) {
        const L = hk.before.slice(-c).join(' '), R = hk.after.slice(0, c).join(' ')
        const bx = [L, del, R].filter(Boolean).join(' '), ax = [L, ins, R].filter(Boolean).join(' ')
        const keys = whole.filter(w => w.vb.some(v => holeRe(v, false).test(bx) || v.replace(/\u0001/g, '').includes(bx)) && w.va.some(v => holeRe(v, false).test(ax) || v.replace(/\u0001/g, '').includes(ax))).map(w => w.key)
        if (keys.length) return keys
      }
      // A change the keys make inside a word they wrote ("Info" → "info"), matched against a key's own hunks by text.
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
    console.log(`  ${changed.length} en-GB keys changed text · ${perKey.size} change a GB view this harness renders · ${silent.length} change none of them (a surface no fixture reaches)`)
    if (ctx.argv.includes('--per-key')) for (const [k, s] of [...perKey].sort()) console.log(`    ${k}: ${s.size} view(s) — ${[...s].slice(0, 6).join(', ')}${s.size > 6 ? ' …' : ''}`)
    fs.writeFileSync(path.join(REPO, 'node_modules/.cache/lp2-runs/gb-per-key.txt'), [...perKey].sort().map(([k, s]) => `${k}\t${s.size}\t${[...s].join(' ')}`).join('\n') + '\n')
    console.log('  (per key, the views it changes: node_modules/.cache/lp2-runs/gb-per-key.txt; --per-key prints them)')
  }

  // ══ the en-GB key list ═════════════════════════════════════════════════════════════════════════════════════
  if (on('keys')) {
    head('GB · the en-GB keys that changed are exactly scripts/fixtures/language-phase-2-gb-named.json')
    const named = fs.existsSync(GB_NAMED_FILE) ? JSON.parse(fs.readFileSync(GB_NAMED_FILE, 'utf8')) : null
    t('the named list exists (node scripts/language-phase-2.cjs --write-gb-named)', !!named)
    if (named) {
      const extra = Object.keys(gbDiff).filter(k => !(k in named))
      const gone = Object.keys(named).filter(k => !(k in gbDiff))
      const moved = Object.keys(gbDiff).filter(k => k in named && (named[k].before !== gbDiff[k].before || named[k].after !== gbDiff[k].after))
      t(`every changed en-GB key is named (${Object.keys(gbDiff).length} changed)`, extra.length === 0, `not in the list: ${extra.join(', ')}`)
      t('every named key changed, as named', gone.length === 0 && moved.length === 0, `named but unchanged: ${gone.join(', ')} · different text: ${moved.join(', ')}`)
    }
  }

  // ══ US ═════════════════════════════════════════════════════════════════════════════════════════════════════
  if (on('us')) {
    head('US · F (this code, the BEFORE words) === BEFORE, except the named Part 2 changes')
    const r = codeCheck('US')
    console.log(`  ${r.identical} views byte-identical · ${r.named} equal to BEFORE + their named change(s) · ${r.listed.length} LISTED as changed by Part 2`)
    head('US · A vs BEFORE — every view that changed, listed')
    const changedUS = ids.filter(i => isUS(i) && i in A && !same(BEFORE[i], A[i]))
    const byArea = {}
    for (const id of changedUS) byArea[area(id)] = (byArea[area(id)] || 0) + 1
    const totals = {}
    for (const id of ids.filter(isUS)) totals[area(id)] = (totals[area(id)] || 0) + 1
    for (const a of Object.keys(totals).sort()) console.log(`  ${a.padEnd(18)} ${String(byArea[a] || 0).padStart(4)} of ${totals[a]} US views changed`)
    const lines = [`# Language Phase 2 — every US view that differs from BEFORE (${ctx.ids.filter(isUS).length} US views; ${changedUS.length} changed). Written by scripts/language-phase-2.cjs.`,
      '# view id\twhy (named code change in F, or words only)']
    for (const id of changedUS) {
      const n = namedFor(id, BEFORE[id])
      const code = !same(BEFORE[id], F[id])
      lines.push(`${id}\t${code ? `code: ${(n.listed ? n.entries.filter(e => !e.expect).map(e => e.id) : n.touched || []).join('+') || 'UNNAMED'}` : 'words'}${code && !same(F[id], A[id]) ? ' + words' : ''}`)
    }
    fs.writeFileSync(US_CHANGED_FILE, lines.join('\n') + '\n')
    console.log(`  ${changedUS.length} US views changed in all → ${path.relative(REPO, US_CHANGED_FILE)}`)
  }
  if (on('gb') && on('us')) {
    head('the named code changes — each claims the views it changed')
    for (const e of NAMED) {
      const n = claimed.get(e.id).length
      console.log(`  ${n ? '·' : '⚠️'} ${e.id} (${e.country}${e.expect ? '' : ', LISTED'}): ${n} view(s)${n ? ` — ${claimed.get(e.id).slice(0, 4).join(', ')}${n > 4 ? ' …' : ''}` : ' — none changed (not landed, or stale)'}`)
    }
  }

  // ══ THE US-WORDS CHECK ═════════════════════════════════════════════════════════════════════════════════════
  if (on('words')) {
    head('US · THE US-WORDS CHECK — every A(US) view, what a person sees')
    const usIds = Object.keys(A).filter(isUS)
    const all = usIds.flatMap(id => usHits(id, A[id]))
    const bad = all.filter(h => !h.allow), allowed = all.filter(h => h.allow)
    const byWord = {}
    for (const h of bad) { byWord[h.word] = byWord[h.word] || { n: 0, views: new Set() }; byWord[h.word].n++; byWord[h.word].views.add(h.id) }
    console.log(`  ${usIds.length} US views read · ${all.length} hits · ${allowed.length} allowed (${[...new Set(allowed.map(h => h.word))].join(', ') || 'none'}) · ${bad.length} to fix`)
    for (const [w, x] of Object.entries(byWord).sort((a, b) => b[1].n - a[1].n)) console.log(`    ${w.padEnd(13)} ${String(x.n).padStart(5)} hits in ${x.views.size} views`)
    // WHERE EACH HIT COMES FROM: the message key(s) whose own text (as the US sees it — en-GB with en-US over it)
    // carries the word in that sentence; else it is not a message — code, or the fixture's own data.
    const cat = LP2.catalogues({ mode: 'source' })
    const merge = (b, o) => { const out = { ...b }; for (const [k, v] of Object.entries(o || {})) out[k] = v && typeof v === 'object' && out[k] && typeof out[k] === 'object' ? merge(out[k], v) : v; return out }
    const index = msgs => {
      const out = []
      for (const [key, src] of LP2.leaves(msgs)) for (const v of icuVariants(src, parse, TYPE)) for (const seg of v.split(HOLE)) {
        const sg = seg.replace(/\s+/g, ' ').trim()
        if (sg.length >= 4) out.push({ key, seg: sg })
      }
      return out
    }
    const usIndex = index(merge(cat['en-GB'], cat['en-US'])), gbIndex = index(cat['en-GB'])
    const usOver = new Set(LP2.leaves(cat['en-US']).map(([k]) => k))
    /** The key(s) with the LONGEST segment that carries the word and is in the hit's text. */
    const best = (idx, h, re) => {
      const text = h.full.replace(/\s+/g, ' ')
      const m = idx.filter(x => re.test(x.seg) && text.includes(x.seg))
      if (!m.length) return null
      const L = Math.max(...m.map(x => x.seg.length))
      return [...new Set(m.filter(x => x.seg.length === L).map(x => x.key))]
    }
    const sourceOf = h => {
      const re = new RegExp(US_WORDS.find(([w]) => w === h.word)[1].source, US_WORDS.find(([w]) => w === h.word)[1].flags.replace('g', ''))
      const us = best(usIndex, h, re)
      if (us) return us.map(k => `${k}${usOver.has(k) ? ' (en-US override still says it)' : ''}`)
      const gb = best(gbIndex, h, re)
      // The en-GB words although en-US overrides the key: this surface was rendered without the en-US locale.
      if (gb) return gb.map(k => `${k} (en-GB words shown: en-US overrides it, but this view got no en-US locale)`)
      return null
    }
    for (const h of bad) h.keys = sourceOf(h)
    const bySource = {}
    for (const h of bad) {
      const src = h.keys ? h.keys.join(' | ') : `(not a message) ${area(h.id)}`
      const k = `${h.word}\t${src}`
      bySource[k] = bySource[k] || { n: 0, views: new Set(), eg: h.near }
      bySource[k].n++; bySource[k].views.add(h.id)
    }
    fs.writeFileSync(path.join(REPO, 'node_modules/.cache/lp2-runs/us-words-by-source.tsv'), 'word\tsource (message key, or the view area when it is not a message)\thits\tviews\texample\n'
      + Object.entries(bySource).sort((a, b) => a[0].localeCompare(b[0])).map(([k, x]) => `${k}\t${x.n}\t${x.views.size}\t${x.eg}`).join('\n') + '\n')
    const notMsg = bad.filter(h => !h.keys)
    console.log(`  by source: ${Object.keys(bySource).length} (word, source) pairs — ${bad.length - notMsg.length} hits come from message keys, ${notMsg.length} from code or fixture data → node_modules/.cache/lp2-runs/us-words-by-source.tsv`)
    const report = bad.map(h => `${h.word}\t${h.id}\t${h.path}\t${h.keys ? h.keys.join(' | ') : '(not a message)'}\t${h.near}`)
    fs.writeFileSync(path.join(REPO, 'node_modules/.cache/lp2-runs/us-words-hits.tsv'), 'word\tview\tpath\tsource\tcontext\n' + report.join('\n') + '\n')
    // distinct sentences, so the list a words agent reads is short
    const distinct = new Map()
    for (const h of bad) { const k = `${h.word}\t${h.near.trim()}`; if (!distinct.has(k)) distinct.set(k, []); distinct.get(k).push(h.id) }
    const limit = ctx.argv.includes('--all-hits') ? Infinity : 80
    let shown = 0
    for (const [k, vs] of distinct) {
      if (shown++ >= limit) break
      const [w, near] = k.split('\t')
      t(`US words · "${w}" in ${vs.length} view(s) e.g. ${vs[0]}`, false, `…${near}…`)
    }
    if (distinct.size > limit) t(`US words · ${distinct.size - limit} more distinct hits (--all-hits; full list node_modules/.cache/lp2-runs/us-words-hits.tsv)`, false)
    t(`US words · no UK-only word in any US view (${bad.length} hits, ${distinct.size} distinct)`, bad.length === 0)
  }

  // ══ US TICKETS ═════════════════════════════════════════════════════════════════════════════════════════════
  if (on('tickets')) {
    head('US · tickets — every US ticket view at 58 mm (32 columns) and 80 mm (48), double width counted; plain ASCII')
    // The checker can fail: a 33-character line at 58 mm, a double-width 25-character one at 80 mm, and a "£".
    {
      const enc = (lines) => '1b40' + lines.map(([txt, big]) => `1d21${big ? '11' : '00'}` + Buffer.from(txt, 'latin1').toString('hex') + '0a').join('')
      const r = T.escpos(enc([['x'.repeat(33), false], ['y'.repeat(25), true], ['£4.00', false]]))
      t('the ticket reader sees a too-long line, a too-long double-width line and a non-ASCII byte (self-test)',
        r.lines[0].text.length * r.lines[0].mult > 32 && r.lines[1].text.length * r.lines[1].mult > 48 && r.bad.length === 1, JSON.stringify(r))
    }
    let tickets = 0, widths = new Set(), printed = 0, widest = { 58: 0, 80: 0 }
    for (const id of Object.keys(A).filter(isUS)) {
      for (const v of T.flat(A[id]).filter(x => x.ticket)) {
        const w = /\|(58|80)(\||$)/.exec(id)
        if (!w) { t(`${id}: the ticket's paper width is in its view id`, false); continue }
        tickets++; widths.add(w[1])
        const cols = w[1] === '58' ? 32 : 48
        printed += v.ticket.lines.length
        for (const l of v.ticket.lines) widest[w[1]] = Math.max(widest[w[1]], l.text.length * l.mult)
        const over = v.ticket.lines.filter(l => l.text.length * l.mult > cols)
        t(`${id}${v.path ? ` ${v.path}` : ''}: every printed line fits ${cols} columns`, over.length === 0, over.map(l => `${JSON.stringify(l.text)} ×${l.mult} = ${l.text.length * l.mult}`).join(' · '))
        t(`${id}${v.path ? ` ${v.path}` : ''}: every byte is plain ASCII or an ESC/POS command`, v.ticket.bad.length === 0, v.ticket.bad.slice(0, 5).join(' · '))
      }
    }
    t(`US tickets rendered at both widths (${tickets} tickets: ${[...widths].sort().join(' and ')} mm)`, widths.has('58') && widths.has('80') && tickets > 100, tickets)
    console.log(`  ${tickets} US tickets (${printed} printed lines) read from their bytes · widest line ${widest[58]}/32 columns at 58 mm, ${widest[80]}/48 at 80 mm`)
    const tk = (LP2.catalogues({ mode: 'source' })['en-US'] || {}).ticket || {}
    const nonAscii = LP2.leaves(tk).filter(([, v]) => /[^\x20-\x7e]/.test(v))
    t(`every en-US ticket message is plain ASCII (${LP2.leaves(tk).length})`, nonAscii.length === 0, nonAscii.map(([k, v]) => `${k}: ${v}`).join(' · '))
  }
}

module.exports = { run, usHits, icuVariants, US_WORDS, ALLOW }
