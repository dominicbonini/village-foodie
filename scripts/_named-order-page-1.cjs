// scripts/_named-order-page-1.cjs — ORDER-PAGE-1 (13 November 2026), the customer order page's three changes, as ONE NAMED code change.
// Read by scripts/_lp2-named.cjs (language-phase-1a/-1b/-1c/-2), which compares BEFORE + the named changes with AFTER.
//
// PRECISE: every transform rebuilds the new markup FROM THE OLD MARKUP'S OWN DATA (the event's date, range, Live label, venue,
// area, notes, the deals' names, pills, descriptions, prices and added lines) and the language's EXISTING words (messages/en-GB.json
// with en-US's overrides) — never from AFTER. Anything it does not recognise exactly is left as BEFORE had it, so the view fails.
//   1. EVENT BOX: TruckListCard `compact` (one row, "Change event" in the corner) → `stacked` (three lines: date · range · status /
//      pin + full venue and area / "Change event →" linking to /trucks/<slug>/order), notes kept below.
//   2. FORMULES: the "🎁 Meal deals" cards above the menu are removed; the menu gains a first chip and a first section with the same
//      word (emoji dropped), each formule a dish-like row (name, Save pill, description, price, the dish's Add / "N · Add" button)
//      with its added lines below it. The first chip is now the formules' (the active one by default).
//   3. FULL WIDTH ON PHONES: the menu card's classes, and the tab bar's / sticky sub-heading's matching negative margins.

const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const PART = 'order-page-1 (13 Nov 2026)'

let WORDS = null
function words(cc) {
  if (!WORDS) {
    const gb = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8')).order
    const usFile = path.join(REPO, 'messages/en-US.json')
    const us = { ...gb, ...((fs.existsSync(usFile) ? JSON.parse(fs.readFileSync(usFile, 'utf8')).order : null) || {}) }
    WORDS = { GB: gb, US: us }
  }
  const o = WORDS[cc]
  return { deals: o.mealDeals.replace(/^[^\p{L}\p{N}]+/u, ''), add: o.add, addMore: n => o.addMore.replace('{count}', String(n)), addDeal: o.addDeal, addAnother: o.addAnotherDeal,
    // a blocked deal button's words → the dish button's words for the same state (closed / set-up pending / paused)
    blocked: { [o.orderingClosed]: o.closed, [o.setupPending]: o.setupPending, [o.orderingPaused]: o.paused } }
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The end index (exclusive) of the element whose open tag starts at `start` — balanced on <div>…</div>. */
function divEnd(s, start) {
  const re = /<div\b[^>]*>|<\/div>/g
  re.lastIndex = start
  let depth = 0, m
  while ((m = re.exec(s))) {
    if (m[0].startsWith('</')) { depth--; if (depth === 0) return m.index + m[0].length }
    else depth++
  }
  return -1
}

// ── 1 · THE EVENT BOX ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const CARD_OPEN = '<div class="bg-white rounded-xl shadow-sm border border-slate-200 hover:border-orange-200 transition-colors relative px-3 py-2 mb-2">'
const CARD_RE = new RegExp('^' + esc(CARD_OPEN) +
  '(?:<div class="absolute top-2 right-2 z-10"><a href="([^"]*)" class="text-orange-600 text-xs font-bold hover:underline">([^<]*)</a></div>)?' +
  esc('<div class="flex flex-row items-center gap-3"><div class="flex flex-col items-start gap-0.5 shrink-0 min-w-[112px]"><span class="flex items-center gap-2 leading-none whitespace-nowrap"><span class="text-[13px] sm:text-sm font-bold text-orange-600 leading-none">') +
  '([^<]*)</span>((?:<span class="inline-flex items-center gap-1 text-\\[12px\\] font-bold leading-none text-green-600"><span class="w-1\\.5 h-1\\.5 rounded-full bg-green-500 inline-block"></span>[^<]*</span>)?)</span>' +
  esc('<span class="text-[12px] font-bold text-slate-500 leading-none mt-0.5">') + '([^<]*)</span></div>' +
  esc('<div class="flex-1 min-w-0 flex flex-row items-center justify-between gap-3 "><div class="flex-1 min-w-0">') +
  '(?:<a href="([^"]*)" class="group block min-w-0 cursor-pointer">|<div class="block min-w-0">)' +
  '<h3 class="[^"]*line-clamp-1 pr-20">([^<]*)</h3>' +
  '(?:<p class="text-slate-400 text-\\[11px\\] sm:text-xs font-medium leading-tight mt-0\\.5 truncate">([^<]*)</p>)?' +
  '(?:</a>|</div>)</div></div></div>([\\s\\S]*)</div>$')
const PIN = '<svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 mt-px shrink-0 text-orange-500"><path fill-rule="evenodd" d="M10 18s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10Zm0-7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" clip-rule="evenodd"></path></svg>'
function eventBox(s) {
  const at = s.indexOf(CARD_OPEN)
  if (at < 0) return s
  const end = divEnd(s, at)
  if (end < 0) return s
  const m = s.slice(at, end).match(CARD_RE)
  if (!m) return s
  const [, chHref, chText, date, live, range, venueHref, name, area, notes] = m
  const loc = `<span class="block text-slate-800 text-[14px] sm:text-[15px] font-bold leading-snug break-words">${name}</span>` +
    (area ? `<span class="block text-slate-500 text-[12px] sm:text-xs font-medium leading-snug break-words mt-0.5">${area}</span>` : '')
  const out = '<div class="bg-white rounded-xl shadow-sm border border-slate-200 px-3 py-2.5 mb-2" data-event-box="true">' +
    `<div class="flex flex-wrap items-center gap-x-2 gap-y-1 leading-none"><span class="text-[13px] sm:text-sm font-bold text-orange-600 leading-none whitespace-nowrap">${date}</span><span class="text-[12px] font-bold text-slate-500 leading-none whitespace-nowrap">${range}</span>${live}</div>` +
    `<div class="flex items-start gap-1.5 mt-2 min-w-0">${PIN}${venueHref !== undefined ? `<a href="${venueHref}" class="min-w-0 flex-1 hover:text-orange-600">${loc}</a>` : `<div class="min-w-0 flex-1">${loc}</div>`}</div>` +
    (chHref !== undefined ? `<div class="mt-2"><a href="${chHref.replace(/\/$/, '')}/order" class="text-orange-600 text-xs font-bold hover:underline">${chText} <span aria-hidden="true">→</span></a></div>` : '') +
    notes + '</div>'
  return s.slice(0, at) + out + s.slice(end)
}

// ── 2 · FORMULES ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const DEALS_OPEN_RE = /<div class="mb-4"><h2 class="text-xs font-black text-orange-600 uppercase tracking-widest mb-2 px-1">([^<]*)<\/h2><div class="space-y-2">/
const DEAL_CARD = '<div class="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden">'
const PILL = '<span class="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">'
const HEAD_RE = new RegExp('^' + esc(DEAL_CARD + '<div class="px-4 py-3.5"><div class="flex items-start justify-between gap-2 mb-2"><div class="flex-1"><div class="flex items-center gap-2 flex-wrap"><p class="font-black text-slate-900 text-sm">') +
  '([^<]*)</p>((?:' + esc(PILL) + '[^<]*</span>)*)</div>' + esc('<p class="text-slate-500 text-xs mt-0.5">') + '([^<]*)</p></div>' +
  esc('<p class="font-black text-orange-600 text-lg shrink-0">') + '([^<]*)</p></div>' +
  '<button (disabled="" )?class="w-full font-bold text-sm py-2 rounded-xl transition-colors active:scale-95 (?:bg-orange-600 text-white hover:bg-orange-700|bg-slate-200 text-slate-400 cursor-not-allowed)">([^<]*)</button></div>([\\s\\S]*)</div>$')
const ADDED_RE = new RegExp(esc('<div class="border-t border-orange-100 px-4 py-3 bg-orange-50"><div class="flex items-center justify-between gap-2"><div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><p class="text-xs font-black text-orange-700">') +
  '([^<]*)</p>((?:' + esc(PILL) + '[^<]*</span>)?)</div>' + esc('<p class="text-xs text-slate-600 mt-0.5 truncate">') + '([^<]*)</p></div>' +
  esc('<button class="text-[10px] text-orange-400 hover:text-orange-600 font-bold shrink-0">') + '([^<]*)</button></div></div>', 'g')
function formuleRow(card, w) {
  const m = card.match(HEAD_RE)
  if (!m) return null
  const [, name, pills, desc, price, disabled, btn, addedHtml] = m
  const blocked = disabled ? w.blocked[btn] : null
  if (disabled ? !blocked : (btn !== w.addDeal && btn !== w.addAnother)) return null   // an unknown button: refuse
  const saves = [...pills.matchAll(/<span [^>]*>([^<]*)<\/span>/g)].map(x => x[1])
  const save = saves[0] && !/applied/i.test(saves[0]) ? saves[0] : null
  const added = [...addedHtml.matchAll(ADDED_RE)]
  if (added.map(x => x[0]).join('') !== addedHtml) return null                // anything else in the card: refuse
  const n = added.length
  const btnCls = blocked ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : n > 0 ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-orange-600 text-white hover:bg-orange-700'
  let row = '<div data-formule="true"><div class="py-3"><div class="flex flex-wrap items-center gap-2 min-w-0">' +
    `<p class="font-bold text-sm leading-snug break-words min-w-0 text-slate-900">${name}</p>` +
    (save ? `<span class="text-[0.625rem] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">${save}</span>` : '') + '</div>' +
    (desc ? `<p class="text-slate-500 text-sm mt-1 leading-snug">${desc}</p>` : '') +
    `<div class="flex items-center justify-between gap-2 mt-2 min-w-0"><span class="font-bold text-sm text-slate-700">${price}</span><button ${blocked ? 'disabled="" ' : ''}class="shrink-0 font-bold text-xs px-3 py-1.5 rounded-lg transition-colors active:scale-95 ${btnCls}">${blocked || (n > 0 ? w.addMore(n) : w.add)}</button></div></div>`
  if (n > 0) {
    row += '<div class="pl-3 pb-2 space-y-1 -mt-2">' + added.map(([, label, pill, sum, remove]) =>
      `<div class="flex items-start justify-between gap-2 py-1.5"><div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><p class="text-xs font-black text-orange-700">${label}</p>${pill}</div><p class="text-sm text-slate-700 break-words mt-0.5">${sum}</p></div><button class="text-xs text-orange-500 hover:text-orange-700 font-bold shrink-0 py-0.5">${remove}</button></div>`).join('') + '</div>'
  }
  return row + '</div>'
}
function formules(s, cc) {
  const m = s.match(DEALS_OPEN_RE)
  if (!m) return s
  // 🔴 THE WORDS THE VIEW WAS RENDERED WITH, read off its own deals heading: a harness may render a US page with en-GB's words
  // (language-phase-1a's F) or en-US's (language-phase-2's A). The set whose `mealDeals` IS that heading is the one used.
  const sets = [words(cc), words(cc === 'US' ? 'GB' : 'US')]
  const w = sets.find(x => (WORDS[x === sets[0] ? cc : (cc === 'US' ? 'GB' : 'US')].mealDeals) === m[1])
  if (!w) return s
  const at = m.index, end = divEnd(s, at)
  const block = s.slice(at, end)
  // the cards, one by one
  const rows = []
  let i = block.indexOf(DEAL_CARD)
  while (i >= 0) {
    const e = divEnd(block, i)
    const row = formuleRow(block.slice(i, e), w)
    if (row === null) return s
    rows.push(row)
    i = block.indexOf(DEAL_CARD, e)
  }
  if (!rows.length) return s
  let rest = s.slice(0, at) + s.slice(end)
  // the chip bar: a first, active chip; the old first chip goes inactive
  const BAR = '<div class="flex gap-1.5 overflow-x-auto scrollbar-hide">'
  const CHIP = 'shrink-0 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-black uppercase tracking-wide transition-colors active:scale-95 '
  const b = rest.indexOf(BAR, at)
  if (b < 0) return s                                                          // a one-category menu (no chip bar): not in these fixtures — refuse
  const barEnd = rest.indexOf('</div>', b)
  const chips = rest.slice(b + BAR.length, barEnd).replace(`class="${CHIP}bg-orange-600 text-white"`, `class="${CHIP}bg-slate-100 text-slate-600 hover:bg-slate-200"`)
  rest = rest.slice(0, b) + BAR + `<button class="${CHIP}bg-orange-600 text-white">${w.deals}</button>` + chips + rest.slice(barEnd)
  // the first section: formules, with the same scroll margin as the categories
  const sec = rest.slice(b).match(/<div style="scroll-margin-top:([^"]*)" class="mb-4 last:mb-0">/)
  if (!sec) return s
  const p = b + sec.index
  rest = rest.slice(0, p) + `<div style="scroll-margin-top:${sec[1]}" class="mb-4 last:mb-0" data-formules="true"><p class="text-sm font-black text-orange-600 uppercase tracking-wider pt-1 pb-2">${w.deals}</p><div class="divide-y divide-slate-200">${rows.join('')}</div></div>` + rest.slice(p)
  return rest
}

// ── 3 · FULL WIDTH ON PHONES ──────────────────────────────────────────────────────────────────────────────────────────────────
function fullWidth(s) {
  return s
    .replace('<div class="bg-white rounded-2xl shadow-sm border border-slate-200 px-2 sm:px-4 py-4 mb-4">', '<div class="bg-white -mx-4 sm:mx-0 border-y sm:border border-slate-200 sm:rounded-2xl sm:shadow-sm px-4 py-4 mb-4" data-menu="true">')
    .replace('class="sticky z-30 -mx-2 px-2 sm:-mx-4 sm:px-4 py-2 mb-2 bg-white border-b border-slate-100"', 'class="sticky z-30 -mx-4 px-4 py-2 mb-2 bg-white border-b border-slate-100"')
    .replace(/class="sticky z-20 -mx-2 px-2 sm:-mx-4 sm:px-4 py-2 /g, 'class="sticky z-20 -mx-4 px-4 py-2 ')
}

/** money-sweep-parity's TEXT leaves (the page's words, tag-stripped, single-spaced): the same change, as text.
 *  • "<date> Live <range> " (BEFORE, after us-layout-fix-2) → "<date> <range> Live ": the event box's line 1 is date · range · status.
 *  • "🎁 Meal deals <deals…> Menu ⓘ Allergen Info <chips> <first heading>" → "Menu ⓘ Allergen Info Meal deals <chips> Meal deals
 *    <deals…> <first heading>": the deals move inside the menu (a chip and a section, the word without its emoji), the
 *    "✓ N applied" badge goes, and the button reads the dish's words (Add / "N · Add" / the blocked state's word). */
function snapshotText(t) {
  let out = t.replace(/(\b\w{3} \d{1,2} \w{3}) (Live) (\d{1,2}:\d{2}(?:\u00a0?[AP]M)? – \d{1,2}:\d{2}(?:\u00a0?[AP]M)?) /, '$1 $3 $2 ')
  for (const cc of ['GB', 'US']) {
    const W = words(cc), o = WORDS[cc]
    const head = o.mealDeals + ' '
    const i = out.indexOf(head)
    if (i < 0) continue
    const menuAt = out.indexOf(' ' + o.menu + ' ⓘ ', i)
    if (menuAt < 0) return t
    let body = out.slice(i + head.length, menuAt)
    const applied = body.match(/ ✓ (\d+) applied/)
    body = body.replace(/ ✓ \d+ applied/g, '')
    if (body.includes(W.addAnother)) { if (!applied) return t; body = body.replace(W.addAnother, W.addMore(applied[1])) }
    else if (body.includes(W.addDeal)) body = body.replace(W.addDeal, W.add)
    else { const k = Object.keys(W.blocked).find(x => body.includes(x)); if (!k) return t; body = body.replace(k, W.blocked[k]) }
    const after = out.slice(menuAt + 1)                                      // "Menu ⓘ Allergen Info Pizzas Drinks Sides Pizzas …"
    const m = after.match(/^(\S+ ⓘ [^ ]+ [^ ]+ )(\S+)/)                      // the menu head, then the first chip
    if (!m) return t
    const first = m[2]
    const sec = after.indexOf(' ' + first + ' ', m[0].length)                 // the first category's heading
    if (sec < 0) return t
    out = out.slice(0, i) + m[1] + W.deals + ' ' + after.slice(m[1].length, sec) + ' ' + W.deals + ' ' + body + after.slice(sec)
    return out
  }
  return out
}

/** The whole change on one order-page view's markup. Order matters: the formules are moved before the menu card's tag changes. */
function orderPage(s, cc) { return fullWidth(formules(eventBox(s), cc)) }

function entries({ mapStrings }) {
  return [
    { id: 'order-page-1', part: PART, country: 'both',
      what: 'The customer order page (app/(app)/trucks/[slug]/order/page.tsx, components/TruckListCard.tsx `stacked`): the event box becomes three lines — date · range · status, a pin and the full venue and area (wrapping, never clipped), "Change event →" to /trucks/<slug>/order (it went to /trucks/<slug>, the discovery profile, "Food truck not found") — with the notes below; the "🎁 Meal deals" cards above the menu move INTO it as its first chip and section, each formule a dish-like row with the dish\'s Add / "N · Add" button and its added lines; the menu card is full width on phones (its classes and the tab bar\'s / sticky sub-heading\'s mirrors). PRECISE: rebuilt from BEFORE\'s own data and the existing words.',
      views: id => /^1a\/orderPage\/(GB|US)\|/.test(id),
      expect: (b, id) => { const cc = /\/US\|/.test(id) ? 'US' : 'GB'; return mapStrings(b, x => (typeof x === 'string' && x.includes('<') ? orderPage(x, cc) : x)) } },
  ]
}

module.exports = { entries, orderPage, eventBox, formules, fullWidth, words, snapshotText }
