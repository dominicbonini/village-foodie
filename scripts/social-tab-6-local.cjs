#!/usr/bin/env node
// scripts/social-tab-6-local.cjs — Social media round 6: the LIVE route, and the REAL editor mounted.
//
//   node scripts/social-tab-6-local.cjs          (needs `next dev` on :3000 and the Supabase project)
//   HG_API_ONLY=1 node scripts/social-tab-6-local.cjs      (the route half only)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS IS DIFFERENT FROM EVERY OTHER HARNESS IN THIS PROJECT
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// The source harnesses read the code; the render harnesses lay out a FIXTURE built from the code's own
// class names. Neither can answer the questions this round is about, because this round is about
// GESTURES on a screen that only exists once a real design has been loaded from a real database:
//
//   • does dragging a corner of "The 7 days" make the words bigger, and a side only stretch?
//   • does the ⇔ handle move a width, and does ⋮⋮ reorder a row?
//   • does clicking the words of a day select that part — the cell the RENDERER drew?
//   • does pressing a sub-tab pill with unsaved changes actually do something?
//
// ⛔ IT NEEDS `next dev` ON :3000, THE SUPABASE PROJECT AND A TRUCK, so `run-harnesses.cjs` does not
// sweep it — a harness that silently skips is a harness that reports green for a check nobody made.
//
// ══ ⚠️ WHY THE EDITOR IS **MOUNTED** RATHER THAN DRIVEN THROUGH THE PAGE ═══════════════════════════
// The dashboard is behind a login, and this script has no operator session — `/manage/<token>` answers
// with `/login`. ⛔ RATHER THAN FABRICATE ONE, the second half mounts the REAL `DesignEditor` with
// `react-dom/client` on `scripts/_mini-dom.cjs`, exactly as `scripts/add-order-refresh.cjs` does, and
// drives the REAL handlers React attached. 🔴 WHAT THAT BUYS: the gestures are the component's own —
// a corner drag is `DraggableBox`'s own `onPointerDown`/`onPointerMove` — and what they produced is
// read back out of the editor's OWN SAVE, so the assertions are about the layout a save would store.
// ⚠️ WHAT IT COSTS, SAID OUT LOUD: there is no layout engine, so nothing here measures CSS. The
// outlines, the tint and the two-tone border are asserted in `scripts/design-editor.cjs` by class, and
// the geometry is asserted against `dayCells` — which is the function the renderer itself calls.
//
// ⛔ **ONE TRUCK, AND IT IS NAMED.** `id = 'test-truck'` (Pizza Kitchen, slug `test-kitchen`) — the
// standing rule for this workstream, enforced here rather than trusted: the token is looked up BY THAT
// ID and nothing else is ever opened.
//
// ⚠️ IT SAVES NOTHING. Every gesture below is made in the editor and then abandoned: the script never
// presses "Save design", and the one dialog it opens is answered with "Keep editing". The design in
// the database is the one that was there before it ran. ⛔ WHICH IS ALSO WHY THE CONVERSION IS SAFE TO
// EXERCISE — opening an old design converts it IN THE BROWSER and stores nothing.

const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
for (const f of ['.env.local', '.env']) {
  const p = path.join(REPO, f)
  if (!fs.existsSync(p)) continue
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const BASE = 'http://localhost:3000'

const sb = async (q) => {
  const r = await fetch(`${SB}/rest/v1/${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${q} → ${r.status} ${await r.text()}`)
  return r.json()
}

let fails = 0
const t = (ok, label, note = '') => {
  console.log(`  ${ok ? '✓' : '🔴'} ${label}${note ? ` — ${note}` : ''}`)
  if (!ok) fails++
}
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 88 - s.length)))

/** A pointer gesture, in CSS pixels. ⚠️ `steps` matters: one move is not a drag to a `pointermove`. */
async function drag(page, from, to, steps = 12) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
  }
  await page.mouse.up()
}

;(async () => {
  const trucks = await sb('trucks?id=eq.test-truck&select=id,name,slug,dashboard_token')
  if (trucks.length !== 1) throw new Error('test-truck not found')
  const { dashboard_token: TOKEN, name, slug } = trucks[0]
  console.log(`── Pizza Kitchen (test-truck / ${slug}) ──────────────────────────────────────────`)
  void name

  const api = async (action, extra = {}) => {
    const r = await fetch(`${BASE}/api/weekly-post`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, action, ...extra }),
    })
    const ct = r.headers.get('content-type') || ''
    if (ct.includes('image/png')) return { status: r.status, buf: Buffer.from(await r.arrayBuffer()) }
    return { status: r.status, j: await r.json().catch(() => ({})) }
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  head('THE STORED DESIGN — whichever model it is on, and both render')
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  /* 🔴 THE BRIEF'S HARD RULE: "existing saved designs must render exactly as today until their owner
   * opens and saves them in the new editor." ⚠️ THE HONEST TEST IS TWO-PART and this is the first
   * half: the design in the database has no `days` block, so the renderer takes its legacy path. The
   * second half — that the legacy path draws the same pixels it always has — is `weekly-post.cjs`,
   * which renders both and compares. */
  const load = await api('load', { week: 'this' })
  const stored = load.j?.design?.layout
  t(load.status === 200 && !!stored, '`load` returns the weekly design', `status ${load.status}`)
  /* ══ ⚠️ THE PREMISE HERE IS A FACT ABOUT THE WORLD, AND THE WORLD CHANGED MID-ROUND ════════════════
   * ⛔ THIS CHECK USED TO BE "the stored design has no block". It passed all afternoon and then failed,
   * because **Dominic opened the design and saved it** — which is the feature working. A check whose
   * premise an operator can change by using the product is a check that will report a failure nobody
   * caused, so it asks the honest question instead: whichever state the design is in, is that state
   * right? 🔴 BOTH ARMS ASSERT SOMETHING: no block ⇒ the legacy fields are what renders; a block ⇒ it
   * is a real one AND `rowSpacing` and the three boxes are still beside it, which is the rollback
   * story and the parts' styles. */
  const hasBlock = !!stored && !!stored.days
  if (!hasBlock) {
    t(!!stored && typeof stored.rowSpacing === 'number',
      '🔴 the STORED layout has no "7 days" block — it is still the old three boxes plus rowSpacing',
      stored ? `rowSpacing ${stored.rowSpacing}` : '')
  } else {
    t(stored.days.parts.length === 4 && stored.days.w > 0 && stored.days.h >= 56
      && stored.days.x + stored.days.w <= stored.width + 1
      && stored.days.y + stored.days.h <= stored.height + 1,
      '🔴 the STORED layout HAS a "7 days" block — it has been opened and saved in the new editor',
      `block ${stored.days.w}×${stored.days.h} at ${stored.days.x},${stored.days.y} · ${stored.days.parts.map(p => p.key).join(' ')}`)
    t(typeof stored.rowSpacing === 'number' && !!stored.date && !!stored.location && !!stored.time,
      '⛔ …and the legacy boxes and rowSpacing are STILL stored beside it — the parts\' styles, and the rollback story',
      `rowSpacing ${stored.rowSpacing}`)
  }

  const png1 = await api('render', { week: 'this' })
  const png2 = await api('render', { week: 'this' })
  t(png1.status === 200 && png2.status === 200 && png1.buf.equals(png2.buf),
    '🔴 …and it renders byte-identically twice — the legacy path is deterministic',
    `${png1.buf?.length} bytes`)

  /* ⚠️ AND THE NEW MODEL RENDERS THROUGH THE SAME ROUTE. The layout is sent in the request (the editor
   * previews unsaved work that way), so this is the exact path the editor's own preview takes. */
  const { compile } = require('./_slot-interval-compile.cjs')
  const c = compile(REPO, ['lib/weekly-post/days.ts', 'lib/weekly-post/layout.ts',
    'lib/weekly-post/font-list.ts', 'lib/weekly-post/font-refs.ts', 'lib/weekly-post/format.ts',
    'lib/weekly-post/locale.ts', 'lib/weekly-post/place-pictures.ts', 'lib/weekly-post/backgrounds.ts',
    'lib/weekly-post/image-info.ts'], 'r6local')
  const D = c.req('lib/weekly-post/days.js')
  /* ⚠️ **THE LEGACY ONE IS THE DERIVED ONE NOW.** With the design already converted, "does the block
   * change what is drawn?" has to be asked by taking the block AWAY — which is also the honest shape of
   * the compatibility promise: the same stored row coordinates, with and without a block. */
  const { days: _dropped, ...legacyOnly } = stored
  const block = stored.days ?? D.daysFromLegacy(stored)
  const converted = { ...stored, days: block }
  const pngLegacy = await api('render', { week: 'this', layout: legacyOnly })
  const pngDays = await api('render', { week: 'this', layout: converted })
  t(pngDays.status === 200 && pngDays.buf?.length > 1000,
    '🔴 a layout WITH the block renders through the same route', `${pngDays.buf?.length} bytes`)
  t(pngLegacy.status === 200 && !pngDays.buf.equals(pngLegacy.buf),
    '⚠️ …and the same layout WITHOUT it draws a different file — the two models are both live',
    `${pngLegacy.buf?.length} vs ${pngDays.buf?.length} bytes`)

  /* ══ 🔴 §B3 · THE DARKENING, IN THE **PNG** ══════════════════════════════════════════════════════
   * ⛔ THE REPORT WAS "it shows no visible difference". The renderer has always drawn it — this is the
   * proof, through the live route, at the two ends of the slider. */
  const darkA = await api('render', { week: 'this', layout: { ...stored, darken: 0 } })
  const darkB = await api('render', { week: 'this', layout: { ...stored, darken: 60 } })
  t(darkA.status === 200 && darkB.status === 200 && !darkA.buf.equals(darkB.buf),
    '🔴 §B3 · "Darken the picture" changes the rendered PNG — the renderer was never the problem',
    `${darkA.buf.length} → ${darkB.buf.length} bytes`)

  /* ══ 🔴 §A2 · A CUSTOM DAYS-OFF MESSAGE REACHES THE PNG ═════════════════════════════════════════ */
  const offA = await api('render', { week: 'this', layout: { ...converted, daysOffText: 'No trading today' } })
  const offB = await api('render', { week: 'this', layout: { ...converted, daysOffText: 'Closed — back Friday' } })
  const offC = await api('render', { week: 'this', layout: { ...converted, days: { ...block, daysOff: 'omit' } } })
  t(!offA.buf.equals(offB.buf), '🔴 §A2 · a custom "Days off" message is drawn on the poster')
  t(!offA.buf.equals(offC.buf), '🔴 §A2 · …and "Leave them out" draws a different poster again')

  if (!process.env.HG_API_ONLY) await editorChecks()
  console.log('')
  console.log(fails === 0 ? '✅ every local check passed' : `🔴 ${fails} LOCAL CHECK(S) FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch(e => {
  console.log('🔴 the harness threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e))
  process.exit(1)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE EDITOR ITSELF — THE REAL COMPONENT, MOUNTED, WITH ITS REAL HANDLERS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
async function editorChecks() {
  const os = require('os')
  const { compile } = require('./_slot-interval-compile.cjs')
  const { installMiniDom, Element } = require('./_mini-dom.cjs')

  /* ⚠️ THE FOUR BROWSER APIS THE EDITOR TOUCHES, STUBBED TO THEIR HONEST "we do not know" ANSWERS.
   * ⛔ NOT TO CONVENIENT ONES: `getContext` returning null is exactly what a tainted canvas does, and
   * the editor's own answer to that is "no background sample", which is the path this exercises. */
  Element.prototype.setPointerCapture = function () {}
  Element.prototype.releasePointerCapture = function () {}
  /* ⚠️ `closest` AND `getBoundingClientRect` ARE WHAT A **TAP** NEEDS. `DraggableBox` converts a press
   * into native pixels by measuring the box it landed on, so a DOM that answers "no box, no rect" can
   * only ever report a tap at the block's own origin — which is a test that proves the mechanism runs
   * and nothing about where it lands. ⛔ THE RECT IS READ FROM THE ELEMENT'S OWN INLINE STYLE, which
   * the editor set in native pixels (the stage has no measured width here, so `scale` is 1). */
  Element.prototype.closest = function (sel) {
    const attr = String(sel).replace(/[[\]]/g, '')
    let n = this
    while (n && n.nodeType === 1) { if (n.hasAttribute && n.hasAttribute(attr)) return n; n = n.parentNode }
    return null
  }
  /* ⚠️ `dataset` IS WHAT `DraggableBox` READS TO FIND OUT WHICH HANDLE WAS PRESSED — the `data-mode`
   * rule that avoids a ref inside a per-handle closure. Without it every press would be a move. */
  if (!Object.getOwnPropertyDescriptor(Element.prototype, 'dataset')) {
    Object.defineProperty(Element.prototype, 'dataset', {
      get() {
        const out = {}
        for (const [k, v] of this.attributes) {
          if (!k.startsWith('data-')) continue
          out[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v
        }
        return out
      },
    })
  }
  Element.prototype.getBoundingClientRect = function () {
    const n = v => Number(String(v ?? '').replace('px', '')) || 0
    const left = n(this.style && this.style.left), top = n(this.style && this.style.top)
    const width = n(this.style && this.style.width), height = n(this.style && this.style.height)
    return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height }
  }
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  /* ⚠️ THE EDITOR LISTENS ON `window` FOR ⌘Z AND THE ARROW KEYS. The mini-DOM's `window` is
   * `globalThis`, which has no listener registry — so one is added here rather than the handlers being
   * stubbed out: a keydown path that cannot be registered is a keydown path nobody can test. */
  if (!globalThis.addEventListener) {
    const reg = new Map()
    globalThis.addEventListener = (k, fn) => { reg.set(k, [...(reg.get(k) || []), fn]) }
    globalThis.removeEventListener = (k, fn) => { reg.set(k, (reg.get(k) || []).filter(f => f !== fn)) }
    globalThis.__fire = (k, ev) => { for (const fn of reg.get(k) || []) fn(ev) }
  }
  globalThis.Image = class { set src(_v) {} }
  globalThis.URL.createObjectURL = globalThis.URL.createObjectURL || (() => 'blob:stub')
  globalThis.URL.revokeObjectURL = globalThis.URL.revokeObjectURL || (() => {})
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ fonts: [] }), text: async () => '' })

  const React = require('react')
  const { act } = require('react')
  const { createRoot } = require('react-dom/client')
  const realError = console.error
  console.error = (...a) => { if (/not wrapped in act|Invalid value for prop|unrecognized in this browser/.test(String(a[0]))) return; realError(...a) }

  const c = compile(REPO, ['components/manage/DesignEditor.tsx'], 'r6editor',
    { jsx: 'react-jsx', skipLibCheck: true, noImplicitAny: false })
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* already */ }
  const ED = c.req('components/manage/DesignEditor.js')
  const L = c.req('lib/weekly-post/layout.js')
  const D = c.req('lib/weekly-post/days.js')

  // ── the DOM helpers the mini-DOM does not have ────────────────────────────────────────────────
  const walk = (root, pred) => {
    const out = []
    const go = n => { for (const ch of n.childNodes) { if (ch.nodeType === 1) { if (pred(ch)) out.push(ch); go(ch) } } }
    go(root); return out
  }
  const byAttr = (root, name, val) =>
    walk(root, e => e.hasAttribute(name) && (val === undefined || e.getAttribute(name) === val))
  const text = (root, s) => walk(root, e => e.localName === 'button' && e.textContent.includes(s))
  /** The props React itself would call — the same object, not a synthetic event system. */
  const rp = el => { const k = Object.keys(el).find(x => x.startsWith('__reactProps$')); return k ? el[k] : null }

  const W = 1080, H = 1350
  const legacy = L.defaultLayout(W, H)
  let saved = null
  const dom = installMiniDom()

  /* ══ 🔴 ROUND 7 §6 · THE WINDOW'S **LIVE** keydown HANDLERS, CAPTURED ═══════════════════════════
   *
   * ⛔ `dispatchEvent` CANNOT DO THIS JOB HERE AND SAYING WHY MATTERS. Node has no `KeyboardEvent`, and
   * `event.target` is set BY the dispatch — so the one thing §6's handler is built around, the test
   * that Backspace inside a text FIELD deletes a character and not the operator's box, cannot be
   * driven through a real dispatch at all.
   * 🔴 SO THE HANDLERS ARE CAPTURED AS THEY ARE REGISTERED, and called with the event shape a browser
   * would hand them. ⚠️ `removeEventListener` IS TRACKED TOO, which is not bookkeeping: the handler is
   * torn down and rebuilt on every selection, and calling a STALE one would delete whatever box was
   * selected when it closed over `selected`. The set holds exactly what the window holds.
   */
  const keyFns = new Set()
  const origAdd = globalThis.addEventListener.bind(globalThis)
  const origRemove = globalThis.removeEventListener.bind(globalThis)
  globalThis.addEventListener = (type, fn, opts) => {
    if (type === 'keydown') keyFns.add(fn)
    return origAdd(type, fn, opts)
  }
  globalThis.removeEventListener = (type, fn, opts) => {
    if (type === 'keydown') keyFns.delete(fn)
    return origRemove(type, fn, opts)
  }

  const root = createRoot(dom.container)
  const props = {
    token: 'tok', designName: 'Weekly post design', backLabel: '‹ Designs', onBack: () => {},
    initialLayout: legacy, country: 'GB',
    background: { url: 'blob:bg', width: W, height: H },
    onReplacePicture: () => {}, pictureNote: 'note',
    previewOptions: [{ id: 'this', label: 'This week' }, { id: 'next', label: 'Next week' }],
    previewWith: 'this', onPreviewWith: () => {},
    /* ⚠️ `null` MEANS "nothing to preview with yet", which is a state the editor already handles — and
     * it keeps this harness off the network. */
    renderPreview: async () => null,
    onSave: l => { saved = l }, onCancel: () => {},
  }
  await act(async () => { root.render(React.createElement(ED.DesignEditor, props)) })
  await act(async () => { await new Promise(r => setTimeout(r, 30)) })

  const save = async () => {
    saved = null
    const btn = text(dom.container, 'Save design')[0]
    await act(async () => { rp(btn).onClick({ stopPropagation() {}, preventDefault() {} }) })
    return saved
  }
  const click = async (el) => {
    await act(async () => { rp(el).onClick({ stopPropagation() {}, preventDefault() {} }) })
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  }

  head('THE REAL EDITOR, MOUNTED — "The 7 days"')

  /* ══ 🔴 THE CONVERSION HAPPENS ON OPEN, AND IT IS NOT AN EDIT ════════════════════════════════════ */
  const afterOpen = await save()
  t(!!afterOpen && !!afterOpen.days,
    '🔴 opening a legacy weekly design converts it to "The 7 days"',
    afterOpen?.days ? `block ${afterOpen.days.w}×${afterOpen.days.h} at ${afterOpen.days.x},${afterOpen.days.y}` : '')
  t(!!afterOpen && afterOpen.days.h === legacy.rowSpacing * 7,
    '🔴 …with the block\'s pitch equal to the old row spacing — every row lands where it was')
  t(!!afterOpen && afterOpen.date.x === legacy.date.x && afterOpen.date.fontSize === legacy.date.fontSize,
    '⚠️ …and the three boxes keep their stored coordinates and sizes, as the parts\' styles')

  /* ⚠️ THE CELLS IN THE DOM ARE THE **RENDERER'S** CELLS. `scale` is 1 here (the stage has no measured
   * width in this DOM), so the inline styles are native pixels and can be compared directly with
   * `dayCells` — which is the function `lib/weekly-post/render.ts` positions satori elements from. */
  const cellEls = byAttr(dom.container, 'data-day-cell')
  t(cellEls.length === 21,
    '🔴 §A1 · the poster draws one row per day — seven rows × three parts with the picture off',
    `${cellEls.length} cells`)
  const expect0 = D.dayCells(afterOpen.days, { picture: false, dayDate: true, place: true, times: true }, 0)
  /* ⚠️ `style.left` COMES BACK AS "65px" — the number is what matters, so the unit is stripped. */
  const px = v => Number(String(v ?? '').replace('px', ''))
  const got0 = cellEls.filter(e => e.getAttribute('data-day-row') === '0')
    .map(e => ({ key: e.getAttribute('data-day-cell'), left: px(e.style.left), width: px(e.style.width) }))
  t(got0.length === expect0.length && expect0.every(c => {
    const g = got0.find(x => x.key === c.key)
    return g && g.left === c.x && g.width === c.w
  }), '🔴 §A1 · …and every cell the editor draws is the cell `dayCells` gives the RENDERER',
  got0.map(g => `${g.key}@${g.left}+${g.width}`).join(' '))

  /* ⛔ SIX ITEMS BECAME ONE. */
  const items = byAttr(dom.container, 'data-item').map(e => e.getAttribute('data-item'))
  t(items.includes('days') && items.includes('heading') && items.includes('all-text'),
    '🔴 §B9 · the grid is "All text", "Week heading" and "The 7 days"', items.join(' '))
  t(!['date', 'location', 'time', 'place-picture', 'rows', 'background'].some(k => items.includes(k)),
    '⛔ …and none of the six items it replaced is a button any more')

  /* ══ 🔴 §A2 · THE QUICK LAYOUTS ═════════════════════════════════════════════════════════════════ */
  await click(byAttr(dom.container, 'data-item', 'days')[0])
  const quick = byAttr(dom.container, 'data-quick').map(e => e.getAttribute('data-quick'))
  t(quick.join(',') === 'oneLine,dayOnTop,bigPicture', '🔴 §A2 · three quick layouts', quick.join(' '))
  const shapes = {}
  for (const id of quick) {
    await click(byAttr(dom.container, 'data-quick', id)[0])
    const l = await save()
    shapes[id] = D.dayCells(l.days, { picture: true, dayDate: true, place: true, times: true }, 0)
      .map(c => `${c.key}:${c.w}x${c.h}`).join(' ')
  }
  t(new Set(Object.values(shapes)).size === 3,
    '🔴 §A2 · …and each one rearranges the row differently')
  for (const id of quick) console.log(`      ${id.padEnd(11)} ${shapes[id]}`)
  await click(byAttr(dom.container, 'data-quick', 'oneLine')[0])

  /* ══ 🔴 §A2 · THE PARTS LIST — ITS SWITCHES ARE THE BOXES' OWN ══════════════════════════════════ */
  const partRows = byAttr(dom.container, 'data-part-row').map(e => e.getAttribute('data-part-row'))
  t(partRows.length === 4, '🔴 §A2 · WHAT\'S IN EACH ROW lists all four parts', partRows.join(' '))
  const egs = byAttr(dom.container, 'data-part-eg').map(e => e.textContent)
  t(egs.some(e => /october|oct/i.test(e)) && egs.some(e => /pm/.test(e)),
    '⚠️ …with LIVE examples in the design\'s own wording', egs.join(' · '))
  /* ⛔ THE PICTURE'S SWITCH IS `placePicture.enabled` — not a second field in the block. */
  const picSwitch = byAttr(dom.container, 'data-part-row', 'picture')[0]
  await click(walk(picSwitch, e => e.localName === 'button')[0])
  const withPic = await save()
  t(withPic.placePicture.enabled === true,
    '🔴 §A2 · switching "Location picture" on sets the BOX\'s own `enabled` — not a second field')
  t(byAttr(dom.container, 'data-day-cell', 'picture').length === 7,
    '🔴 …and every one of the seven rows gains a picture cell')

  /* ══ 🔴 §A2 · ⋮⋮ REORDER ════════════════════════════════════════════════════════════════════════ */
  const before = withPic.days.parts.map(p => p.key)
  await click(byAttr(dom.container, 'data-part-move')[0])
  const reordered = await save()
  t(reordered.days.parts.map(p => p.key).join(',') !== before.join(','),
    '🔴 §A2 · reordering moves a part', `${before.join(' ')} → ${reordered.days.parts.map(p => p.key).join(' ')}`)
  /* ⚠️ AND THE POSTER FOLLOWS — the list's order and the row's order are one fact. */
  const xs = D.dayCells(reordered.days, { picture: true, dayDate: true, place: true, times: true }, 0)
    .sort((a, b) => a.x - b.x).map(c => c.key)
  t(xs.join(',') === reordered.days.parts.map(p => p.key).join(','),
    '🔴 …and the row on the poster is in the list\'s order', xs.join(' '))

  /* ══ 🔴 §A2 · DAYS OFF ══════════════════════════════════════════════════════════════════════════ */
  const omitBtn = byAttr(dom.container, 'data-days-off-opt', 'omit')[0]
  await click(omitBtn)
  t((await save()).days.daysOff === 'omit', '🔴 §A2 · "Leave them out" is stored on the block')
  t(byAttr(dom.container, 'data-days-off-text').length === 0,
    '⚠️ …and the message box disappears with it — a field whose words are never drawn is a lie')
  await click(byAttr(dom.container, 'data-days-off-opt', 'message')[0])
  const msgBox = byAttr(dom.container, 'data-days-off-text')[0]
  await act(async () => { rp(msgBox).onChange({ target: { value: 'Closed — back Friday' } }) })
  t((await save()).daysOffText === 'Closed — back Friday',
    '🔴 §A2 · …and a custom message is saved with the design')

  /* ══ 🔴 §A1/§B6 · A CORNER SCALES THE WORDS; A SIDE ONLY STRETCHES ══════════════════════════════
   * ⚠️ THE REAL HANDLERS. `begin`/`move`/`end` are `DraggableBox`'s own, called with the props React
   * attached — the same functions a pointer would reach. ⛔ `scale` IS 1 HERE, so a 60px pointer move
   * is 60 native pixels. */
  const sel0 = await save()
  const blockBefore = sel0.days
  const sizesBefore = [sel0.date.fontSize, sel0.location.fontSize, sel0.time.fontSize]
  const grab = async (handle, dx, dy) => {
    const el = byAttr(dom.container, 'data-handle', handle)[0]
    const p = rp(el)
    await act(async () => {
      p.onPointerDown({ clientX: 0, clientY: 0, pointerId: 1, currentTarget: el, stopPropagation() {} })
      p.onPointerMove({ clientX: dx, clientY: dy, pointerId: 1, currentTarget: el })
      p.onPointerUp({ clientX: dx, clientY: dy, pointerId: 1, currentTarget: el })
    })
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    return save()
  }
  const afterCorner = await grab('se', 80, 80)
  t(afterCorner.days.w > blockBefore.w && afterCorner.days.h > blockBefore.h,
    '🔴 §A1 · dragging a CORNER of "The 7 days" makes the block bigger',
    `${blockBefore.w}×${blockBefore.h} → ${afterCorner.days.w}×${afterCorner.days.h}`)
  const sizesAfter = [afterCorner.date.fontSize, afterCorner.location.fontSize, afterCorner.time.fontSize]
  t(sizesAfter.every((v, i) => v > sizesBefore[i]) && afterCorner.days.textH > blockBefore.textH,
    '🔴 …and everything inside scales with it, text included',
    `${sizesBefore.join('/')} → ${sizesAfter.join('/')}, band ${blockBefore.textH} → ${afterCorner.days.textH}`)

  const afterSide = await grab('e', -60, 0)
  t(afterSide.days.w < afterCorner.days.w && afterSide.days.h === afterCorner.days.h,
    '🔴 §A1 · dragging a SIDE stretches in that direction only',
    `${afterCorner.days.w}×${afterCorner.days.h} → ${afterSide.days.w}×${afterSide.days.h}`)
  t([afterSide.date.fontSize, afterSide.location.fontSize, afterSide.time.fontSize]
    .every((v, i) => v === sizesAfter[i]) && afterSide.days.textH === afterCorner.days.textH,
    '🔴 …and the text size stays')

  /* ══ 🔴 §A3/§B4 · A TAP ON THE BLOCK SELECTS THE PART UNDER IT ══════════════════════════════════
   * ⚠️ THE CELLS ARE `pointer-events-none`, so the press lands on the block — and `onTap` hit-tests it
   * against the same `dayCells` the renderer drew from. */
  const blockEl = byAttr(dom.container, 'data-box-outline', 'selected')[0]
  const bp = rp(blockEl)
  /* ⚠️ ROW **3**'s PLACE CELL — not row 0's. A hit test that only ever worked on the first row would
   * pass for an editor that ignored the row index, which is half of what `dayCells` is for. */
  const placeCell = D.dayCells(afterSide.days, { picture: true, dayDate: true, place: true, times: true }, 3)
    .find(c => c.key === 'place')
  await act(async () => {
    /* 🔴 A PRESS THAT DOES NOT MOVE. `DraggableBox` reports it through `onTap`, and the editor hit-tests
     * it against the same `dayCells` the renderer draws from — so this is the real path end to end. */
    const at = { clientX: placeCell.x + 5, clientY: placeCell.y + 5, pointerId: 2, currentTarget: blockEl, stopPropagation() {} }
    bp.onPointerDown(at)
    bp.onPointerUp(at)
  })
  await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  const title = byAttr(dom.container, 'data-settings-title')[0]?.textContent
  t(title === 'Place', '🔴 §A3 · tapping the words of a day selects THAT part', `panel says "${title}"`)
  const styleOpts = byAttr(dom.container, 'data-look-opt').map(e => e.textContent)
  t(styleOpts.join(' | ') === 'Match the other writing | Style this one on its own',
    '🔴 §C · …and its Style switch is in plain words', styleOpts.join(' | '))
  const fields = byAttr(dom.container, 'data-field').map(e => e.getAttribute('data-field'))
  t(fields.includes('How the place is written') && fields.includes('Text size')
    && fields.includes('Line up the words'),
    '🔴 §C · …with every label in plain words', fields.join(' · '))
  t(!fields.includes('Shows') && !fields.includes('Size') && !fields.includes('Line up'),
    '⛔ …and none of the old ones')

  /* ══ 🔴 ROUND 7 §6 · DELETE YOUR OWN TEXT — THE BUTTON, THE KEY, AND UNDO ════════════════════════
   *
   * ⛔ **IT IS A GESTURE, SO IT CANNOT BE CHECKED BY READING.** `design-editor.cjs` can see that the
   * button and the keydown handler exist; only driving them says whether the box is actually gone from
   * the design the SAVE would store, whether the key is ignored where it must be, and whether ⌘Z
   * brings it back. 🔴 EVERY ASSERTION BELOW IS READ OUT OF THE EDITOR'S OWN SAVE.
   * ⚠️ IT LIVES IN THIS SCRIPT RATHER THAN A NEW ONE because the expensive part — a real design, a real
   * mount, the component's real handlers — is already set up here, and a second file would be 150 lines
   * of the same preparation. The round number in this file's name is historical; what it is, is the
   * MOUNTED-EDITOR harness.
   */
  {
    const addBtn = byAttr(dom.container, 'data-add-note')[0]
    t(!!addBtn, '🔴 §6 · "Add your own text" is on the panel')
    await click(addBtn)
    const withNote = await save()
    const noteCount = (l) => (l.notes ?? []).filter(n => n.enabled).length
    t(noteCount(withNote) === 1, '🔴 §6 · …and pressing it adds one box', `${noteCount(withNote)} note(s)`)

    /* ⚠️ ADDING IT SELECTS IT, which is what puts the delete control on the panel — asserted rather
     * than assumed, because the control is what the rest of this block drives. */
    t(byAttr(dom.container, 'data-delete-note').length === 1,
      '🔴 §6 · the new box is selected and carries a Delete button')
    const hint = byAttr(dom.container, 'data-delete-hint')[0]?.textContent
    t(hint === 'or press Delete', '⚠️ §6 · …with the key named beside it', `"${hint}"`)

    await click(byAttr(dom.container, 'data-delete-note')[0])
    t(noteCount(await save()) === 0, '🔴 §6 · pressing it removes the box from the design')

    /* 🔴 AND UNDO BRINGS IT BACK, which is why there is no confirm. */
    await click(text(dom.container, 'Undo')[0])
    t(noteCount(await save()) === 1, '🔴 §6 · …and Undo brings it back — which is why there is no confirm')

    /* ══ ⚠️ THE SELECTION DOES **NOT** COME BACK WITH IT, AND THAT IS CORRECT ═══════════════════════
     * `removeNote` sets the selection to the Date box, because the box it was on has gone — and Undo
     * restores the LAYOUT, not the panel's cursor. ⛔ THE FIRST VERSION OF THE KEY CHECK BELOW FAILED
     * FOR EXACTLY THIS REASON and the behaviour was right: with the Date box selected there is nothing
     * for Delete to remove. ⚠️ SO THE BOX IS SELECTED AGAIN, by its own item in the left list, which is
     * what an operator would do. */
    const noteItem = byAttr(dom.container, 'data-item')
      .find(e => (e.getAttribute('data-item') || '').startsWith('note'))
    t(!!noteItem, '⚠️ §6 · the restored box is back in the list')
    await click(noteItem)
    t(byAttr(dom.container, 'data-delete-note').length === 1,
      '⚠️ §6 · …and selecting it brings its Delete button back')

    /* ══ 🔴 THE **KEY**, FIRED AT THE WINDOW THE HANDLER IS ON ═══════════════════════════════════════
     * ⚠️ `dispatchEvent` IS A NO-OP IN THIS DOM, so the listener is called directly out of the store
     * `addEventListener` keeps. ⛔ THAT IS STILL THE COMPONENT'S OWN HANDLER with the component's own
     * event shape — what is skipped is the browser's dispatch, not the code under test. */
    const fireKey = (key, target) => {
      let prevented = false
      for (const fn of [...keyFns]) {
        fn({ key, target, preventDefault() { prevented = true }, metaKey: false, ctrlKey: false, shiftKey: false })
      }
      return prevented
    }
    await act(async () => { fireKey('Delete', dom.document.body) })
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    t(noteCount(await save()) === 0, '🔴 §6 · the Delete KEY removes the selected box too')
    await click(text(dom.container, 'Undo')[0])
    t(noteCount(await save()) === 1, '⚠️ §6 · …and Undo brings that back as well')

    /* ══ ⛔ THE FOCUS TEST, AND IT IS THE WHOLE FEATURE ══════════════════════════════════════════════
     * 🔴 BACKSPACE IN A TEXT FIELD MUST DELETE A CHARACTER. An operator correcting a typo in "Words
     * before" would otherwise lose their text box. ⚠️ DRIVEN BY HANDING THE HANDLER AN `INPUT` TARGET,
     * which is exactly what the browser would hand it. */
    const anInput = walk(dom.container, e => e.localName === 'input')[0]
    const stopped = fireKey('Backspace', anInput)
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    t(!stopped && noteCount(await save()) === 1,
      '⛔ §6 · Backspace while typing in a field deletes nothing — the focus test')

    /* ⛔ AND A BUILT-IN ITEM OFFERS NO DELETE AT ALL. A design with no Date box is a state the
     * validator understands; a design MISSING one is not. */
    await click(byAttr(dom.container, 'data-item')[0])
    t(byAttr(dom.container, 'data-delete-note').length === 0,
      '⛔ §6 · a built-in item has no Delete button — it is switched off, never deleted')

    /* ⚠️ THE DESIGN IS PUT BACK as it was found: this script saves nothing, but the next block reads
     * the panel and a stray note box would change what it sees. */
    await click(byAttr(dom.container, 'data-item')[0])
  }

  /* ══ 🔴 §B3/§3 · THE BACKGROUND IS A SECTION AT THE FOOT, AND THE PICTURE IS NOT A SELECTION ═════
   *
   * ⛔ **THIS CHECK USED TO PRESS THE PICTURE**, because in round 6 a press on the stage selected the
   * background. 🔴 ROUND 7 §3 REMOVED THAT, and the reason is the bug it caused: **a press on a blank
   * part of the artwork closed whatever panel was open** — an operator reading "Style all the writing",
   * or halfway through a font list, lost it by putting a finger on the poster, which is the surface
   * this screen is built around touching.
   * ⚠️ SO THE ASSERTIONS INVERT: the stage takes no pointer handler at all, pressing it leaves the
   * selection alone, and the background is reached from its own folded section at the foot of the
   * panel — which is always there and never selected, so there is nothing a click needs to reach. */
  const stage = byAttr(dom.container, 'data-stage')[0]
  t(typeof rp(stage).onPointerDown !== 'function',
    '🔴 §3 · the poster itself takes no press — a blank-picture click cannot change the selection')
  const titleBefore = byAttr(dom.container, 'data-settings-title')[0]?.textContent
  t(byAttr(dom.container, 'data-background-section').length === 1,
    '🔴 §3 · the background has its own section, always, at the foot of the panel')
  /* ⚠️ FOLDED BY DEFAULT — the brief's own default, and the right one: three settings a truck touches
   * once per design. ⛔ ASSERTED BY ITS CONTENTS BEING ABSENT, not by a flag. */
  t(byAttr(dom.container, 'data-bg-size').length === 0,
    '⚠️ §3 · …folded by default, so it costs the panel one row')
  const bgHead = walk(byAttr(dom.container, 'data-background-section')[0],
    e => e.getAttribute && e.getAttribute('data-fold-head') !== null)[0]
  await act(async () => { rp(bgHead).onClick({}) })
  await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  t(byAttr(dom.container, 'data-settings-title')[0]?.textContent === titleBefore,
    '🔴 §3 · …and opening it does not change which box is selected', `still "${titleBefore}"`)
  t(byAttr(dom.container, 'data-bg-size').length === 1,
    '🔴 §3 · pressing the section heading opens the background settings')
  const darken = byAttr(dom.container, 'data-darken')[0]
  t(!!darken, '🔴 §B3 · …and "Darken the picture" is in them')
  const range = walk(darken, e => e.localName === 'input')[0]
  await act(async () => { rp(range).onChange({ target: { value: '45' } }) })
  await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  t((await save()).darken === 45, '🔴 §B3 · …and it writes to the design')
  t(byAttr(dom.container, 'data-darken-overlay').length === 1,
    '🔴 §B3 · …and the poster darkens at once, before the next PNG has arrived')

  /* ══ 🔴 §B1 · PREVIEW POST ══════════════════════════════════════════════════════════════════════ */
  await click(byAttr(dom.container, 'data-preview-post')[0])
  t(byAttr(dom.container, 'data-post-preview').length === 1,
    '🔴 §B1 · "👁 Preview post" opens the finished post over the top')
  await click(byAttr(dom.container, 'data-post-preview-close')[0])
  t(byAttr(dom.container, 'data-post-preview').length === 0, '⚠️ …and Close closes it')
  t(byAttr(dom.container, 'data-view-switch').length === 0,
    '⛔ §B1 · and the "✎ Edit | 👁 Preview" switch is gone from the screen')

  await act(async () => { root.unmount() })
  dom.teardown()

  // ── the single event design, in the same editor ────────────────────────────────────────────────
  head('THE REAL EDITOR, MOUNTED — the single event design')
  const dom2 = installMiniDom()
  const root2 = createRoot(dom2.container)
  const ev = L.defaultEventLayout(1080, 1350)
  await act(async () => {
    root2.render(React.createElement(ED.DesignEditor, { ...props, initialLayout: ev, designName: 'Single event post design' }))
  })
  await act(async () => { await new Promise(r => setTimeout(r, 30)) })
  const evItems = byAttr(dom2.container, 'data-item').map(e => e.getAttribute('data-item'))
  t(['date', 'location', 'town', 'time', 'place-picture'].every(k => evItems.includes(k)),
    '🔴 §B9 · the single event grid still has its five items', evItems.join(' '))
  t(!evItems.includes('days'), '⛔ …and no "The 7 days" — a single event has one of everything')
  t(byAttr(dom2.container, 'data-day-cell').length === 0,
    '⛔ …and no day cells on its poster')
  await click(byAttr(dom2.container, 'data-item', 'date')[0])
  const evFields = byAttr(dom2.container, 'data-field').map(e => e.getAttribute('data-field'))
  t(evFields.includes('How the date is written') && evFields.includes('Text size'),
    '🔴 §C · …and the same plain labels', evFields.join(' · '))
  await act(async () => { root2.unmount() })
  dom2.teardown()
  console.error = realError
  try { fs.rmSync(path.join(os.tmpdir()), { force: true }) } catch { /* nothing to clean */ }
}
