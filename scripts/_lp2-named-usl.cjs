// scripts/_lp2-named-usl.cjs — THE US LAYOUT FIXES (18 October 2026, docs/us-layout-proposal-report.md), as NAMED code
// changes of scripts/_lp2-named.cjs. A MODULE, read only by scripts/_lp2-named.cjs (and so by language-phase-1a, -1b,
// -1c and -2, which compare BEFORE + the named changes with their AFTER).
//
// ⚠️ RE-PINNED (US layout fixes, 18 October 2026). BEFORE for this work is 4d72838; the product code is final. Every
// entry is ONE change of the brief, named by its id, and PRECISE: a transform of the BEFORE markup that writes exactly
// what the new code writes, scoped to the element the change touched, and REFUSING — leaving that element as BEFORE
// had it, so the comparison fails — whenever the BEFORE it expects is not exactly there. No view is LISTED, no BEFORE
// is recaptured, no view is skipped.
//
// Same shape as every entry of scripts/_lp2-named.cjs: { id, part, country, what, views(id), expect(before, id) }.
// The element-level transforms parse React's static markup (a strict parser: an unbalanced tag throws, and the view is
// then left as BEFORE had it).

const fs = require('fs')
const path = require('path')
const PART = 'US layout fixes (18 Oct 2026)'

// ══ markup helpers ══════════════════════════════════════════════════════════════════════════════════════════════
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
/** Every element of `s`: { tag, attrs, start, openEnd, closeStart, end, children, parent }. Throws on an unbalanced tag. */
function parse(s) {
  const root = { tag: '#root', start: 0, openEnd: 0, closeStart: s.length, end: s.length, attrs: '', children: [], parent: null }
  const all = []
  let cur = root
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s[^>]*?)?)(\/?)>/g
  let m
  while ((m = re.exec(s))) {
    if (m[0].startsWith('<!--')) continue
    if (m[1]) {
      if (cur.tag !== m[1].toLowerCase()) throw new Error(`unbalanced </${m[1]}> at ${m.index} (open: <${cur.tag}>)`)
      cur.closeStart = m.index; cur.end = m.index + m[0].length; cur = cur.parent; continue
    }
    const el = { tag: m[2].toLowerCase(), attrs: m[3] || '', start: m.index, openEnd: m.index + m[0].length, closeStart: m.index + m[0].length, end: m.index + m[0].length, children: [], parent: cur }
    cur.children.push(el); all.push(el)
    if (!m[4] && !VOID.has(el.tag)) cur = el
    // Raw-text elements: skip to their end tag (their content is not markup).
    if ((el.tag === 'script' || el.tag === 'style') && cur === el) {
      const close = s.indexOf(`</${el.tag}>`, el.openEnd)
      if (close < 0) throw new Error(`unclosed <${el.tag}>`)
      re.lastIndex = close
    }
  }
  if (cur !== root) throw new Error(`unclosed <${cur.tag}> at ${cur.start}`)
  return all
}
const classOf = el => ((/\sclass="([^"]*)"/.exec(el.attrs) || [])[1] ?? null)
const classIs = (el, c) => classOf(el) === c
const hasClasses = (el, ...cs) => { const c = (classOf(el) || '').split(/\s+/); return cs.every(x => c.includes(x)) }
const attrOf = (el, a) => { const m = new RegExp(`\\s${a}(?:="([^"]*)")?(?=\\s|/?$)`).exec(el.attrs); return m ? (m[1] ?? '') : null }
const within = (el, anc) => { for (let p = el.parent; p; p = p.parent) if (p === anc) return true; return false }
const outer = (s, el) => s.slice(el.start, el.end)
const inner = (s, el) => s.slice(el.openEnd, el.closeStart)
/** `el`'s opening tag with its class attribute replaced by `cls` (byte-exact otherwise). */
const openWithClass = (s, el, cls) => s.slice(el.start, el.openEnd).replace(/\sclass="[^"]*"/, ` class="${cls}"`)
/** Apply non-overlapping [start, end, text] edits to `s`. */
const splice = (s, edits) => { let out = s; for (const [a, b, t] of [...edits].sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + t + out.slice(b); return out }
/** React's text escaping (escapeTextForBrowser) and its inverse. */
const escText = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const decText = s => s.replace(/&(quot|#x27|lt|gt|amp);/g, (_, e) => ({ quot: '"', '#x27': "'", lt: '<', gt: '>', amp: '&' })[e])
/** Run an element-level transform over `s`, or return `s` untouched when it does not parse (the view then fails). */
const withTree = (s, fn) => { let all; try { all = parse(s) } catch { return s } return fn(all) }

/** A message's ICU select → { case: words }, from the AUTHORED en-GB catalogue: these keys are new since every frozen
 *  catalogue, and the frozen overlay keeps a new key at today's en-GB text.
 *  ⚠️ RE-PINNED, 19 October 2026 — us-rehearsal-fix-charge-parts (docs/us-dress-rehearsal-fixes-report.md): the select was
 *  `{tip, select, yes {…} other {…}}`; it is now `{parts, select, tax_fees_tip {…} tax_tip {…} fees_tip {…} fees {…} other {…}}`,
 *  named by the parts the fold adds up (lib/order-charge-lines.ts chargeParts). `wordsFor` picks the case the same way. */
const selectOf = (ns, key) => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '../messages/en-GB.json'), 'utf8'))
  const src = m[ns][key]
  const r = /^\{parts, select, ((?:[a-z_]+ \{[^{}]*\} ?)+)\}$/.exec(src)
  if (!r) throw new Error(`${ns}.${key} is not the parts select this transform knows: ${src}`)
  return Object.fromEntries([...r[1].matchAll(/([a-z_]+) \{([^{}]*)\}/g)].map(x => [x[1], x[2]]))
}
/** The words for a fold of these line kinds ('tax' | 'service_fee' | 'card_fee' | 'tip'), as chargeParts names them. */
const wordsFor = (ns, key, kinds) => {
  const sel = selectOf(ns, key)
  const parts = [kinds.includes('tax') && 'tax', (kinds.includes('service_fee') || kinds.includes('card_fee')) && 'fees', kinds.includes('tip') && 'tip'].filter(Boolean).join('_')
  return sel[parts] ?? sel.other
}
/** The frozen catalogue's kitchen / customer tip label (what F and every 1a/1b AFTER render with). */
const frozenTipLabel = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/language-phase-2-messages-before.json'), 'utf8')).charges.tip
/** "$1,234.56" → 123456 minor units, or null. Dollars only: the charge lines exist only on US orders. */
const dollarsToMinor = s => { const m = /^\$(\d{1,3}(?:,\d{3})*)\.(\d{2})$/.exec(s); return m ? Number(m[1].replace(/,/g, '')) * 100 + Number(m[2]) : null }
const minorToDollars = n => `$${Math.floor(n / 100).toLocaleString('en-US')}.${String(n % 100).padStart(2, '0')}`

// ══ the transforms ═════════════════════════════════════════════════════════════════════════════════════════════

// ── fix 2: TruckListCard's date / time column ──
const TLC_COMPACT_OPEN = '<div class="flex flex-col items-start gap-0.5 shrink-0 w-[112px]">'
const TLC_FULL_OPEN = '<div class="flex flex-row sm:flex-col items-center sm:items-start gap-2 sm:gap-0.5 shrink-0 sm:w-[140px]">'
const TLC_BLOCK = /(<div class="flex flex-col items-start gap-0\.5 shrink-0 w-\[112px\]">|<div class="flex flex-row sm:flex-col items-center sm:items-start gap-2 sm:gap-0\.5 shrink-0 sm:w-\[140px\]">)(<span class="text-\[13px\] sm:text-sm font-bold text-orange-600 leading-none">[^<]*<\/span>)<span class="flex items-center gap-2 text-\[12px\] font-bold text-slate-500 leading-none mt-0\.5"><span>([^<]*)<\/span>(?:<span class="inline-flex items-center gap-1 text-green-600"><span class="w-1\.5 h-1\.5 rounded-full bg-green-500 inline-block"><\/span>([^<]*)<\/span>)?<\/span><\/div>/g
const liveBadge = (cls, label) => `<span class="${cls} items-center gap-1 text-[12px] font-bold leading-none text-green-600"><span class="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>${label}</span>`
function tlcLiveOnDateLine(s) {
  if (!s.includes(TLC_COMPACT_OPEN) && !s.includes(TLC_FULL_OPEN)) return s
  return s.replace(TLC_BLOCK, (_, open, date, range, live) => {
    const compact = open === TLC_COMPACT_OPEN
    return (compact ? open.replace('w-[112px]', 'min-w-[112px]') : open)
      + `<span class="flex items-center gap-2 leading-none whitespace-nowrap">${date}${live !== undefined ? liveBadge(compact ? 'inline-flex' : 'hidden sm:inline-flex', live) : ''}</span>`
      + `<span class="text-[12px] font-bold text-slate-500 leading-none mt-0.5">${range}</span>`
      + (live !== undefined && !compact ? liveBadge('inline-flex sm:hidden mt-0.5', live) : '')
      + '</div>'
  })
    // compact only: the 80px corner reserve moves from the venue row to the venue name.
    .replace(/<div class="flex-1 min-w-0 flex flex-row items-center justify-between gap-3 pr-20">/g, '<div class="flex-1 min-w-0 flex flex-row items-center justify-between gap-3 ">')
    .replace(/(<h3 class="text-slate-800 text-\[14px\] sm:text-\[15px\] font-bold leading-tight group-hover:text-orange-600 transition-colors line-clamp-1)(">)/g, '$1 pr-20$2')
}

// ── fix 12: the order page's "Choose time" select, below 380px ──
const chooseTime = s => s.replace(/(<select class="w-full h-full min-h-\[68px\] rounded-2xl border-2 px-3)( py-3 [^"]*">[\s\S]*?<\/select><div class="pointer-events-none absolute right-3)( top-1\/2 -translate-y-1\/2 text-xs)/g,
  '$1 max-[379px]:pl-1.5 max-[379px]:pr-3.5$2 max-[379px]:right-2$3')

// ── fix 10: the order page — the basket footer's folded charges, and the checkout sheet's sticky footer ──
const OP_BREAKDOWN = 'bg-slate-50 rounded-xl p-3 mb-2 space-y-1.5 border border-slate-100'
const OP_LINE = /^<div class="flex justify-between text-xs text-slate-600" data-charge-line="([a-z_]+)"><span>([\s\S]*?)<\/span><span class="tabular-nums">([^<]*)<\/span><\/div>$/
const OP_TOTAL = 'flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-1.5'
const FOLD_SVG = '<svg aria-hidden="true" class="w-3 h-3 text-slate-400 transition-transform " fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>'
function orderFooterFold(s) {
  if (!s.includes(OP_BREAKDOWN) || !s.includes('data-charge-line=')) return s
  return withTree(s, all => {
    const edits = []
    for (const box of all.filter(el => el.tag === 'div' && classIs(el, OP_BREAKDOWN))) {
      // The SHEET's copy sits in the summary's 40vh scroller and keeps every row; only the footer's copy folds.
      if (box.parent && classIs(box.parent, 'mt-2 max-h-[40vh] overflow-y-auto')) continue
      const kids = box.children
      const firstLine = kids.findIndex(k => attrOf(k, 'data-charge-line') !== null)
      if (firstLine < 0) continue   // no tax / fee / tip lines: the uncapped peek it always was
      const lines = kids.slice(firstLine, -1), total = kids[kids.length - 1]
      if (!classIs(total, OP_TOTAL) || !lines.every(l => OP_LINE.test(outer(s, l)))) return s   // not the BEFORE this knows: refuse
      const parsed = lines.map(l => OP_LINE.exec(outer(s, l)))
      if (parsed[0][1] !== 'subtotal') return s
      let charges = outer(s, lines[0]) + lines.slice(1).map(l => outer(s, l)).join('')
      if (lines.length >= 3) {   // FoldedChargeRows folds only two or more added lines
        const added = parsed.slice(1).map(p => dollarsToMinor(p[3]))
        if (added.some(x => x === null)) return s
        const words = wordsFor('charges', 'foldedCharges', parsed.slice(1).map(p => p[1]))
        charges = outer(s, lines[0]) + `<button type="button" aria-expanded="false" class="w-full flex justify-between text-xs text-slate-600" data-charge-fold="true"><span class="flex items-center gap-1">${escText(words)}${FOLD_SVG}</span><span class="tabular-nums">${minorToDollars(added.reduce((a, b) => a + b, 0))}</span></button>`
      }
      const items = s.slice(box.openEnd, kids[firstLine].start)
      edits.push([box.openEnd, box.closeStart, `<div class="max-h-[30vh] overflow-y-auto space-y-1.5" data-footer-breakdown="true">${items}</div>${charges}${outer(s, total)}`])
    }
    return splice(s, edits)
  })
}
const SHEET_TOTALS = /(<div class="mt-4 bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1" data-checkout-totals="true">)((?:<div class="flex justify-between text-xs text-slate-600" data-charge-line="[a-z_]+">[\s\S]*?<\/div>)+)<div class="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-1\.5">(<span>[^<]*<\/span><span>[^<]*<\/span>)<\/div><\/div>(<button (?:disabled="" )?class="w-full bg-orange-600 text-white font-black py-3\.5 px-6 rounded-xl text-base hover:bg-orange-700 transition-colors active:scale-\[0\.98\] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm) mt-5(">[^<]*<\/button><p class="text-center text-slate-400 text-xs mt-2">[^<]*<\/p>)/g
const SHEET_FOOTER_OPEN = '<div class="sticky z-10 -mx-5 px-5 pt-3 mt-4 bg-white border-t border-slate-200" data-sheet-footer="true" style="bottom:calc(-1 * max(8px, env(safe-area-inset-bottom)));padding-bottom:max(8px, env(safe-area-inset-bottom))">'
const sheetStickyFooter = s => s.replace(SHEET_TOTALS, (_, box, rows, totalRow, btn, rest) =>
  `${box}${rows}</div>${SHEET_FOOTER_OPEN}<div class="flex justify-between text-sm font-black text-slate-900">${totalRow}</div>${btn} mt-2${rest}</div>`)

// ── fix 11: Manage my order's Pickup row (12-hour) ──
const pickupRow = s => s.replace(/<div class="flex justify-between text-sm mb-1"><span class="text-slate-500">([^<]*)<\/span><span class="font-medium text-slate-900">([^<]*?)(?:<!-- -->)?(?: · ([^<]*))?<\/span><\/div>/, (whole, label, slot, venue) => {
  if (!/\d\u00a0(AM|PM)$/.test(slot)) return whole   // only the slot row of a 12-hour truck (the first such row: Pickup)
  return `<div class="flex justify-between gap-4 text-sm mb-1" data-pickup-row="true"><span class="text-slate-500 shrink-0">${label}</span><span class="font-medium text-slate-900 text-right min-w-0"><span class="block">${slot}</span>${venue !== undefined ? `<span class="block">${venue}</span>` : ''}</span></div>`
})

// ── fix 3: Manage › Schedule's event cards ──
const SC_ROW = 'flex items-start gap-4'
const SC_DATE = 'flex flex-col items-center justify-center w-12 flex-shrink-0 text-center pl-2'
const SC_DIVIDER = 'w-px bg-slate-100 self-stretch flex-shrink-0'
const SC_ACTIONS = 'flex items-center gap-1.5 flex-shrink-0 self-start'
function scheduleCards(s) {
  if (!s.includes(SC_DATE)) return s
  const out = withTree(s, all => {
    const edits = []
    for (const row of all.filter(el => el.tag === 'div' && classIs(el, SC_ROW) && el.children[0] && classIs(el.children[0], SC_DATE))) {
      let pending = false
      for (let p = row.parent; p; p = p.parent) if (hasClasses(p, 'border-l-4', 'border-l-amber-400')) pending = true
      edits.push([row.start, row.openEnd, openWithClass(s, row, `${SC_ROW} max-sm:grid max-sm:grid-cols-[3rem_1px_minmax(0,1fr)] max-sm:gap-x-4 max-sm:gap-y-2.5`)])
      const div = row.children[1]
      if (!div || !classIs(div, SC_DIVIDER)) return s
      if (!pending) edits.push([div.start, div.openEnd, openWithClass(s, div, `${SC_DIVIDER} max-sm:row-span-2`)])
      const acts = row.children.filter(k => classIs(k, SC_ACTIONS))
      if (pending ? acts.length : acts.length > 1) return s
      for (const a of acts) edits.push([a.start, a.openEnd, openWithClass(s, a, `${SC_ACTIONS} max-sm:col-start-3 max-sm:flex-wrap`).replace(/>$/, ' data-card-actions="true">')])
      // A van ("· Big van") on a card: not in any fixture this table reads — refuse rather than guess its new markup.
      const details = row.children[2]
      if (details && / · /.test(inner(s, details).replace(/<[^>]*>/g, '\u0000'))) return s
    }
    return splice(s, edits)
  })
  return out.replace(/(<span class="ml-1\.5 text-amber-700 bg-amber-50 border border-amber-200 rounded px-1\.5 py-0\.5 text-\[11px\] font-bold)(" data-overnight-hint="true">)/g, '$1 whitespace-nowrap$2')
}

// ── fixes 6, 7, 8, 10: the order card (components/dashboard/OrderCard.tsx) ──
const OC_COOK_ROW1 = 'flex items-baseline justify-between gap-1 font-medium text-sm'
const OC_COOK_ROW2 = 'flex items-center gap-1 font-medium text-sm mt-0.5'
const OC_COOK_NUM = 'text-3xl font-bold text-slate-900 truncate'
const OC_COOK_TIME = 'text-slate-600 flex-shrink-0 inline-flex items-center gap-1 ml-auto'
const OC_FULL_ROW1 = 'flex items-baseline justify-between gap-2'
const OC_FULL_LEFT = 'flex items-baseline gap-1.5 min-w-0'
const OC_FULL_RIGHT = 'flex items-baseline gap-1.5 flex-shrink-0'
const OC_FULL_ROW2 = 'flex items-center gap-2 font-medium text-sm mt-0.5'
const OC_BADGE = /^text-xs font-bold px-2 py-0\.5 rounded-full flex-shrink-0 (\S+ \S+)$/
const isBuzzer = el => el.tag === 'button' && hasClasses(el, 'flex-shrink-0', 'text-[10px]', 'font-black', 'rounded-full', 'border', 'whitespace-nowrap')
const isNameEl = el => (el.tag === 'button' && attrOf(el, 'title') !== null && hasClasses(el, 'group', 'inline-flex', 'items-baseline', 'gap-1', 'text-left'))
  || (el.tag === 'span' && hasClasses(el, 'truncate') && el.children.length === 0)
/** nameEl(className) → nameEl(className + ' max-w-full'), wrapped in the 16-character keeper (OrderCard nameKeep). */
function nameKeep(s, el) {
  const isButton = el.tag === 'button'
  const nameSpan = isButton ? el.children.find(k => k.tag === 'span' && classIs(k, 'truncate')) : el
  if (!nameSpan || nameSpan.children.length) return null
  const chars = Array.from(decText(inner(s, nameSpan)))
  const keep = chars.length > 16 ? escText(`${chars.slice(0, 16).join('')}…`) : inner(s, nameSpan)
  const name = openWithClass(s, el, `${classOf(el)} max-w-full`) + s.slice(el.openEnd, el.end)
  return `<span class="flex-1 basis-0" data-name-keep="true"><span aria-hidden="true" class="flex gap-1 h-0 overflow-hidden invisible whitespace-nowrap"><span>${keep}</span>${isButton ? '<span class="text-[10px]">✉</span>' : ''}</span><span class="flex w-0 min-w-full">${name}</span></span>`
}
/** fix 6 (Cook): row 1 = number + buzzer left, badge right; time + countdown move to row 2 beside the name. */
function cookHeader(s, all) {
  const edits = []
  for (const r1 of all.filter(el => el.tag === 'div' && classIs(el, OC_COOK_ROW1))) {
    const sib = r1.parent.children, r2 = sib[sib.indexOf(r1) + 1]
    if (!r2 || !classIs(r2, OC_COOK_ROW2)) return null
    const k = [...r1.children]
    const num = k.shift(); if (!num || !classIs(num, OC_COOK_NUM)) return null
    const buzzer = k[0] && isBuzzer(k[0]) ? k.shift() : null
    const badge = k[0] && OC_BADGE.test(classOf(k[0]) || '') ? k.shift() : null
    const time = k.shift(); if (!time || !classIs(time, OC_COOK_TIME) || k.length) return null
    const [nm, tick, ...more] = r2.children
    if (!nm || !isNameEl(nm) || more.length || (tick && !(tick.tag === 'span' && classIs(tick, 'text-green-700 font-black text-xs ml-1')))) return null
    const kept = nameKeep(s, nm); if (kept === null) return null
    edits.push([r1.start, r2.end,
      '<div class="flex flex-wrap items-baseline justify-between gap-x-2 font-medium text-sm">'
      + `<div class="flex items-baseline gap-1.5 flex-shrink-0 -mr-2">${openWithClass(s, num, 'text-3xl font-bold text-slate-900 whitespace-nowrap')}${inner(s, num)}</span>${buzzer ? outer(s, buzzer) : ''}</div>`
      + (badge ? `<div class="flex items-baseline flex-shrink-0 ml-auto">${outer(s, badge)}</div>` : '')
      + '</div><div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium text-sm mt-0.5">'
      + kept + (tick ? `${openWithClass(s, tick, 'text-green-700 font-black text-xs')}${inner(s, tick)}</span>` : '') + outer(s, time) + '</div>'])
  }
  return edits
}
/** fix 6 (Full, FINAL per the lead, 18 Oct 2026): row 1 becomes `relative`; the number's cluster `flex-shrink-0` (was
 *  `min-w-0`); the right cluster is BEFORE's minus the badge, byte for byte; the badge, one size down, is a separate
 *  `absolute top-0 right-0 flex` span (data-kds-row1-badge) after it. */
function fullRow1(s, all) {
  const edits = []
  for (const r1 of all.filter(el => el.tag === 'div' && classIs(el, OC_FULL_ROW1) && el.children.length === 2 && classIs(el.children[0], OC_FULL_LEFT))) {
    const [left, right] = r1.children
    if (!classIs(right, OC_FULL_RIGHT)) return null
    const first = right.children[0]
    const bm = first && OC_BADGE.exec(classOf(first) || '')
    edits.push([r1.start, r1.openEnd, openWithClass(s, r1, `relative ${OC_FULL_ROW1}`)])
    edits.push([left.start, left.openEnd, openWithClass(s, left, 'flex items-baseline gap-1.5 flex-shrink-0')])
    if (bm) {
      if (first.start !== right.openEnd) return null
      edits.push([first.start, first.end, ''])
      edits.push([right.end, right.end, `<span class="absolute top-0 right-0 flex" data-kds-row1-badge="true">${openWithClass(s, first, `text-[10px] font-bold leading-none px-1.5 py-px rounded-full flex-shrink-0 ${bm[1]}`)}${inner(s, first)}</span></span>`])
    }
  }
  return edits
}
/** fix 7 (Full, 12-hour): row 2 wraps before the name loses its first 16 characters; time + countdown one group. */
function fullRow2(s, all) {
  const edits = []
  // Row 1 as BEFORE had it, or as us-layout-fix-6-kds-full-badge (earlier in the table) left it.
  const isRow1 = el => el.tag === 'div' && (classIs(el, OC_FULL_ROW1) || classIs(el, `relative ${OC_FULL_ROW1}`)) && el.children.length >= 2
    && (classIs(el.children[0], OC_FULL_LEFT) || classIs(el.children[0], 'flex items-baseline gap-1.5 flex-shrink-0'))
  for (const r1 of all.filter(isRow1)) {
    const sib = r1.parent.children, r2 = sib[sib.indexOf(r1) + 1]
    if (!r2 || !classIs(r2, OC_FULL_ROW2)) return null
    const [nm, ...rest] = r2.children
    if (!nm || !isNameEl(nm)) return null
    const kept = nameKeep(s, nm); if (kept === null) return null
    const group = rest.map(x => {
      const c = classOf(x)
      if (c === 'opacity-70 flex-shrink-0 ml-auto') return `${openWithClass(s, x, 'opacity-70')}${inner(s, x)}</span>`
      if (c === 'opacity-50 flex-shrink-0') return `${openWithClass(s, x, 'opacity-50')}${inner(s, x)}</span>`
      if (c === 'text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-600 text-white flex-shrink-0') return `${openWithClass(s, x, 'text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-600 text-white')}${inner(s, x)}</span>`
      return null
    })
    if (group.includes(null)) return null
    edits.push([r2.start, r2.end, `<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium text-sm mt-0.5">${kept}<span class="flex items-center gap-2 flex-shrink-0 ml-auto">${group.join('')}</span></div>`])
  }
  return edits
}
/** fix 10 (cards): the charge lines — ONE summary button on the dashboard card (solo), none on a KDS ticket (window). */
const OC_CHARGES = 'mx-3 mb-2 px-1 space-y-0.5 text-xs text-slate-600'
const OC_CHARGE_LINE = /^<div class="flex justify-between gap-2"><span>([\s\S]*?)<\/span><span class="tabular-nums">([^<]*)<\/span><\/div>$/
function cardCharges(s, all) {
  const edits = []
  const tip = escText(frozenTipLabel())
  for (const box of all.filter(el => el.tag === 'div' && classIs(el, OC_CHARGES) && attrOf(el, 'data-charge-lines') !== null)) {
    let card = box.parent
    while (card && !(card.tag === 'div' && hasClasses(card, 'w-full', 'bg-white', 'rounded-2xl', 'overflow-hidden', 'flex', 'flex-col'))) card = card.parent
    if (!card) return null
    // The header: the card's first `w-full` div that is not a centred marker banner above it (the failure marker,
    // "Last update didn't sync": `w-full … text-center`).
    const header = card.children.find(k => k.tag === 'div' && hasClasses(k, 'w-full') && !hasClasses(k, 'text-center'))
    if (!header) return null
    const solo = /^<div class="[^"]*"><div class="(?:flex items-center gap-2|flex flex-wrap items-center gap-x-2 gap-y-1)"><span class="text-2xl font-bold flex-shrink-0">#/.test(s.slice(header.start, header.start + 400))
    // The KDS ticket (window arm) — and the Cook arm, which draws the lines only where amounts are not hidden (the
    // dashboard set to Cook): the new code draws them on the solo card ONLY (`cardStyle === 'solo'`).
    const notSolo = /<span class="text-3xl font-bold text-slate-900(?: truncate| whitespace-nowrap)?">#/.test(s.slice(header.start, header.end))
    if (solo === notSolo) return null
    if (notSolo) { edits.push([box.start, box.end, '']); continue }
    const lines = box.children.map(l => OC_CHARGE_LINE.exec(outer(s, l)))
    if (lines.some(l => !l) || s.slice(box.openEnd, box.closeStart) !== box.children.map(l => outer(s, l)).join('')) return null
    const added = lines.slice(1).map(l => dollarsToMinor(l[2]))
    if (!added.length || added.some(x => x === null)) return null
    // us-rehearsal-fix-charge-parts: ONE added line is drawn plainly (that line, marked as the summary, no fold, no
    // Subtotal); two or more fold, named by their kinds — read off the frozen labels (anything else is the tax's own label).
    const fr = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/language-phase-2-messages-before.json'), 'utf8')).charges
    const kindOf = l => { const label = decText(l[1].split('<')[0]); return label === decText(tip) ? 'tip' : label === fr.serviceFee ? 'service_fee' : label === fr.cardFee ? 'card_fee' : 'tax' }
    if (added.length === 1) {
      const only = outer(s, box.children[1])
      edits.push([box.openEnd, box.closeStart, only.replace('<div class="flex justify-between gap-2">', '<div class="flex justify-between gap-2" data-charge-summary="true">')])
      continue
    }
    const words = wordsFor('orderCard', 'chargesSummary', lines.slice(1).map(kindOf))
    edits.push([box.openEnd, box.closeStart, `<button type="button" aria-expanded="false" class="w-full flex justify-between gap-2 text-left" data-charge-summary="true"><span>${escText(words)} <span class="text-slate-400" aria-hidden="true">▾</span></span><span class="tabular-nums">${minorToDollars(added.reduce((a, b) => a + b, 0))}</span></button>`])
  }
  return edits
}
/** Runs element-level card transforms; any refusal (null) leaves the whole string as BEFORE had it. */
const cardTransform = (...fns) => s => withTree(s, all => {
  const edits = []
  for (const fn of fns) { const e = fn(s, all); if (e === null) return s; edits.push(...e) }
  return splice(s, edits)
})
const OC_MARK = s => s.includes('rounded-2xl overflow-hidden shadow-sm border transition-opacity flex flex-col')

// ══ the entries ═════════════════════════════════════════════════════════════════════════════════════════════════
function entries({ mapStrings, isTicketView }) {
  const strings = fn => b => mapStrings(b, s => fn(s))
  return [
    // ── us-layout-fix-1-nbsp ──
    { id: 'us-layout-fix-1-nbsp', part: PART, country: 'US',
      what: 'lib/time-utils.ts: en-US clockOf writes a NO-BREAK SPACE (U+00A0) before AM/PM ("6:30 PM"), and a 12-hour formatTimeRange a no-break space before its dash ("5:00 PM – 9:30 PM"), so a time is never split across lines. Every US string with a 12-hour time the code writes (screens, emails, WhatsApp replies, previews). The printed ticket folds U+00A0 back to a space (lib/printing/ticket.ts FOLD): ticket views are not claimed (their bytes are LISTED by P2-us-clock-tickets and fit-checked). 24-hour (GB) output byte-identical (not claimed, and proven unchanged).',
      views: id => !isTicketView(id),
      expect: strings(s => s
        .replace(/\b(\d{1,2}:\d{2}) (AM|PM)\b/g, '$1\u00a0$2')
        .replace(/\b(\d{1,2}:\d{2}\u00a0(?:AM|PM)) – (?=\d{1,2}:\d{2}\u00a0(?:AM|PM)\b)/g, '$1\u00a0– ')) },
    { id: 'us-layout-fix-1-nbsp-fixture-finish-early', part: PART, country: 'US',
      what: 'FIXTURE, not product — the exception to us-layout-fix-1-nbsp: the "end early?" confirm’s time is the fixture’s own state (scripts/_lp1b-dashboard.cjs / _lp1b-kds.cjs finishConfirm.endTime: "9:00 PM" / "3:00 PM", typed with an ASCII space), not a time the code formatted, so it keeps its ASCII space. Only that sentence’s time, only in the two finishEarly views.',
      views: id => /^1b\/(dashboard\/US\|modal\|finishEarly|kds\/US\|finishEarly)$/.test(id),
      expect: strings(s => s.replace(/(scheduled to finish until )(\d{1,2}:\d{2})\u00a0(AM|PM)\b/g, '$1$2 $3')) },

    // ── us-layout-fix-2-live-on-date-line ──
    { id: 'us-layout-fix-2-live-on-date-line', part: PART, country: 'both',
      what: 'components/TruckListCard.tsx: "● Live" moves from the range line to the DATE line (a LiveBadge span in a new `flex items-center gap-2 leading-none whitespace-nowrap` span around the date); the range is alone on its line (`text-[12px] font-bold text-slate-500 leading-none mt-0.5`, no inner span); on the full card a phone-only LiveBadge (`inline-flex sm:hidden mt-0.5`) follows the range and the date-line one is `hidden sm:inline-flex`. Compact: the column is `min-w-[112px]` (was `w-[112px]`) and `pr-20` moves from the venue row to the venue <h3>. GB and US: every TruckListCard (the order page’s event header and chooser, Phase 2’s card views). Rebuilt from BEFORE’s date, range and Live label; nothing else in the view changes.',
      views: id => /^1a\/orderPage\//.test(id) || /^2\/extra\/(GB|US)\|card\|/.test(id),
      expect: strings(tlcLiveOnDateLine) },

    // ── us-layout-fix-12-choose-time ──
    { id: 'us-layout-fix-12-choose-time', part: PART, country: 'both',
      what: 'The order page’s "Choose time" select, below 380px: `max-[379px]:pl-1.5 max-[379px]:pr-3.5` after its `px-3`, and its ▾ `max-[379px]:right-2` after `right-3`. Only that select and the ▾ right after it; GB and US.',
      views: id => /^1a\/orderPage\//.test(id),
      expect: strings(chooseTime) },

    // ── us-layout-fix-10-charges-fold (order page) ──
    { id: 'us-layout-fix-10-charges-fold-order-footer', part: PART, country: 'US',
      what: 'The order page’s basket FOOTER breakdown (orderBreakdown(true)) on a basket with tax / fee / tip lines: its item lines wrap in `max-h-[30vh] overflow-y-auto space-y-1.5` (data-footer-breakdown), Subtotal stays, and with two or more added lines they fold into ONE button row "Tax, fees & tip" (a tip line) / "Tax & fees" (charges.foldedCharges) with their sum, closed (FoldedChargeRows). The sheet’s summary copy (inside its 40vh scroller) is unchanged. No lines (GB): unchanged.',
      views: id => /^1a\/orderPage\/US\|/.test(id),
      expect: strings(orderFooterFold) },
    { id: 'us-layout-fix-10-charges-fold-sheet-footer', part: PART, country: 'US',
      what: 'The checkout sheet with the totals box (a truck with tax / fee / tip lines): the box loses its Total row, and Total (without its top border) + Place order (`mt-2`, was `mt-5`) + the pay line move into a sticky footer (data-sheet-footer). Rebuilt from BEFORE’s Total, button and pay line.',
      views: id => /^1a\/orderPage\/US\|/.test(id),
      expect: strings(sheetStickyFooter) },

    // ── us-layout-fix-11-pickup-row ──
    { id: 'us-layout-fix-11-pickup-row', part: PART, country: 'US',
      what: 'Manage my order (app/order/[id]/manage), 12-hour truck: the Pickup row gains `gap-4` and data-pickup-row, its label `shrink-0`, and the value is right-aligned (`text-right min-w-0`) with the time and the venue each a `block` line (was "6:30 PM · The Green" on one line).',
      views: id => /^1a\/statusPage\/US\|/.test(id),
      expect: strings(pickupRow) },

    // ── us-layout-fix-3-schedule-phone-cards ──
    { id: 'us-layout-fix-3-schedule-phone-cards', part: PART, country: 'both',
      what: 'Manage › Schedule’s event cards, every truck: the main row gains `max-sm:grid max-sm:grid-cols-[3rem_1px_minmax(0,1fr)] max-sm:gap-x-4 max-sm:gap-y-2.5`; on a card that is not "Needs your approval" the divider gains `max-sm:row-span-2` and the actions div `max-sm:col-start-3 max-sm:flex-wrap` + data-card-actions; the overnight chip gains `whitespace-nowrap`. (The van line is not in these fixtures — a card with a van is refused, not guessed.)',
      views: id => /^2\/extra\/(GB|US)\|manage\|schedule\|/.test(id),
      expect: strings(scheduleCards) },

    // ── the order card ──
    { id: 'us-layout-fix-6-kds-cook-header', part: PART, country: 'both',
      what: 'KDS Cook header (OrderCard cook arm), every truck: row 1 = `flex flex-wrap … gap-x-2` with the number (`whitespace-nowrap`, was `truncate`) + buzzer in a `flex-shrink-0 -mr-2` cluster and the status badge in its own `ml-auto` div; the time + countdown move to row 2 (`flex flex-wrap items-center gap-x-2 gap-y-0.5 …`) after the name, which takes the 16-character keeper (nameKeep: an invisible copy of its first 16 characters, + ✉ when it has contact details) and `max-w-full`; the ✓ loses `ml-1`.',
      views: id => /^1b\/(components|kds|dashboard)\//.test(id),
      expect: strings(s => (OC_MARK(s) ? cardTransform(cookHeader)(s) : s)) },
    { id: 'us-layout-fix-6-kds-full-badge', part: PART, country: 'both',
      what: 'KDS Full and list tickets (OrderCard window arm), every truck — FINAL (the lead, 18 Oct 2026): row 1 is `relative flex items-baseline justify-between gap-2`; the number’s cluster `flex items-baseline gap-1.5 flex-shrink-0` (was `min-w-0`); the right cluster is BEFORE’s markup MINUS the status badge, byte for byte (total, PAID, ✓ untouched); the badge, one size down (`text-[10px] font-bold leading-none px-1.5 py-px rounded-full flex-shrink-0 <colours>`, was `text-xs font-bold px-2 py-0.5 …`, same colours and words), is a separate `<span class="absolute top-0 right-0 flex" data-kds-row1-badge>` right after the right cluster. A ticket without a badge only gains `relative` and the cluster class.',
      views: id => /^1b\/(components|kds|dashboard)\//.test(id),
      expect: strings(s => (OC_MARK(s) ? cardTransform(fullRow1)(s) : s)) },
    { id: 'us-layout-fix-7-kds-name-16', part: PART, country: 'US',
      what: 'KDS Full row 2 on a 12-hour truck: `flex flex-wrap items-center gap-x-2 gap-y-0.5 …`; the name takes the 16-character keeper (as Cook’s) and `max-w-full`; the time and countdown / late pill are one `flex items-center gap-2 flex-shrink-0 ml-auto` group (each loses its own `flex-shrink-0` / `ml-auto`). 24-hour (GB): unchanged.',
      views: id => /^1b\/(components|kds|dashboard)\/US\|/.test(id),
      expect: strings(s => (OC_MARK(s) ? cardTransform(fullRow2)(s) : s)) },
    { id: 'us-layout-fix-8-card-row1-wrap', part: PART, country: 'both',
      what: 'The dashboard order card’s row 1 (OrderCard solo arm), every truck: `flex items-center gap-2` → `flex flex-wrap items-center gap-x-2 gap-y-1` (the row whose first child is the `text-2xl` order number). Nothing else.',
      views: id => /^1b\/(components|kds|dashboard)\//.test(id),
      expect: strings(s => s.replace(/<div class="flex items-center gap-2">(<span class="text-2xl font-bold flex-shrink-0">#)/g, '<div class="flex flex-wrap items-center gap-x-2 gap-y-1">$1')) },
    { id: 'us-layout-fix-10-charges-fold-card', part: PART, country: 'US',
      what: 'OrderCard’s charge lines (US orders only): on the dashboard card (solo) the Subtotal / tax / fee / tip rows become ONE button "Tax, fees & tip ▾ $x.xx" (a tip line) / "Tax & fees ▾ $x.xx" (orderCard.chargesSummary) — the sum of every line but Subtotal — closed; on a KDS ticket (window) NO money lines at all (the block is gone; total and PAID stay in the header) — and none on a Cook-style card either (the dashboard set to Cook, where amounts are not hidden: the new code draws the block for the solo card only). GB orders have no lines: unchanged.',
      views: id => /^1b\/(components|kds|dashboard)\/US\|/.test(id),
      expect: strings(s => (OC_MARK(s) ? cardTransform(cardCharges)(s) : s)) },
    { id: 'us-layout-fix-9-sidebar-wide-time', part: PART, country: 'US',
      what: 'components/dashboard/DayLoadStrip.tsx, the sidebar list, 12-hour truck: each row’s time column `w-16` (was `w-10`). Only the `text-xs font-bold text-slate-600 tabular-nums w-10 flex-shrink-0` time span; 24-hour (GB) keeps `w-10` (not claimed, proven unchanged).',
      views: id => /^1b\/components\/US\|dayLoad\|/.test(id),
      expect: strings(s => s.replace(/<span class="text-xs font-bold text-slate-600 tabular-nums w-10 flex-shrink-0">/g, '<span class="text-xs font-bold text-slate-600 tabular-nums w-16 flex-shrink-0">')) },
  ]
}

module.exports = { entries }
