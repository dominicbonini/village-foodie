// scripts/_named-deals-order-1.cjs — DEALS-ORDER-1 (13 November 2026, docs/deals-order-1-report.md): Manage › Menu › Deals gains the
// category list's drag-to-reorder, as ONE NAMED code change for the harnesses that render that tab.
//
// PRECISE: rebuilt from BEFORE's own markup and the fixture's own deal ids, with the EXISTING words (messages/en-GB.json
// manageMenu.category.dragToReorder, en-US's override where it has one). Anything not recognised exactly is left as BEFORE had it,
// so the view fails.
//   Each formule card (`Card` with p-4) is wrapped in the drag row — <div draggable="true" class="transition-all duration-200"
//   data-deal-row="<id>"> — and its first row gains the six-dot handle (components/manage/ReorderDrag.tsx DragHandle) before the
//   name column. The drag handlers are event props, so they render nothing.
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')

let WORDS = null
/** "Drag to reorder" in the view's words: en-GB, or en-US's override. */
function title(cc) {
  if (!WORDS) {
    const gb = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8')).manageMenu.category.dragToReorder
    const usFile = path.join(REPO, 'messages/en-US.json')
    const us = (fs.existsSync(usFile) && JSON.parse(fs.readFileSync(usFile, 'utf8')).manageMenu?.category?.dragToReorder) || gb
    WORDS = { GB: gb, US: us }
  }
  return WORDS[cc]
}

const CARD = '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">'
const ROW = '<div class="flex items-start justify-between gap-3">'
const handle = t => `<div class="text-slate-600 hover:text-slate-900 cursor-grab active:cursor-grabbing text-xl font-bold select-none" title="${t}" draggable="false">⋮⋮</div>`

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

/** The deals list on one view's markup: the i-th formule card gets ids[i]. Unchanged when the card count is not ids.length. */
function dealsList(s, ids, cc) {
  if (typeof s !== 'string') return s
  const at = []
  for (let i = s.indexOf(CARD + ROW); i >= 0; i = s.indexOf(CARD + ROW, i + 1)) at.push(i)
  if (at.length !== ids.length) return s
  let out = s
  for (let k = at.length - 1; k >= 0; k--) {
    const i = at[k], e = divEnd(out, i)
    if (e < 0) return s
    const card = out.slice(i, e)
    const wrapped = `<div draggable="true" class="transition-all duration-200" data-deal-row="${ids[k]}">` +
      CARD + ROW + handle(title(cc)) + card.slice(CARD.length + ROW.length) + '</div>'
    out = out.slice(0, i) + wrapped + out.slice(e)
  }
  return out
}

/** The same change on a TEXT snapshot (tag-stripped, single-spaced): "⋮⋮ " before each formule's name, found exactly once each. */
function dealsText(t, names) {
  if (typeof t !== 'string') return t
  let out = t
  for (const n of names) {
    const was = ` ${n} `
    if (out.split(was).length !== 2) return t
    out = out.replace(was, ` ⋮⋮ ${n} `)
  }
  return out
}

// ── THE MENU API: the formules are read in the truck's order — four lines (two of comment, two `.order(…)`) added before the
// read's `.eq('truck_id', truck.id),`. For harnesses that pin app/api/menu to an older tree (cwv-2, costs-accounts-1): taking
// exactly those lines out, found exactly once, must give BASE's file — any other change to the route still fails.
const MENU_ROUTE = 'app/api/menu/[truckId]/route.ts'
const BASE = '391497fd'   // the tree this work's code started from (its two migrations aside)
const MENU_ADDED = "      .select('*, apply_to_new_events')\n" +
  "      // deals-order-1 (13 November 2026): THE TRUCK'S ORDER (Manage › Menu › Deals, drag to reorder). Every list of formules reads\n" +
  "      // this response — the order page's Formules tab and the dashboard's deals — and every filter below keeps the order.\n" +
  "      .order('sort_order', { ascending: true })\n" +
  "      .order('created_at', { ascending: true })\n" +
  "      .eq('truck_id', truck.id),\n"
const MENU_BEFORE = "      .select('*, apply_to_new_events')\n      .eq('truck_id', truck.id),\n"
/** The menu route's text with this work's four lines taken out, or null when they are not there exactly once. */
function undoMenu(text) {
  if (typeof text !== 'string' || text.split(MENU_ADDED).length !== 2) return null
  return text.replace(MENU_ADDED, MENU_BEFORE)
}

module.exports = { dealsList, dealsText, title, handle, CARD, ROW, MENU_ROUTE, BASE, undoMenu }
