#!/usr/bin/env node
// scripts/subtab-row.cjs
//
//   npx next build && node scripts/subtab-row.cjs        (NO DATABASE, NO LIVE TRUCK, NO SERVER)
//
// ── 🔴 WHAT THIS MEASURES, AND WHY A GREP COULD NOT ────────────────────────────────────────────────
//
// §1 · THE SUB-TAB ROW. Settings' eight pills come to 951px inside a 390px bar, so the row scrolls,
// and a pill that is already selected can sit hundreds of pixels past the right edge when the screen
// opens — 'Auto-replies' sat 400px past it, which is the reported bug. Two facts about rendered boxes:
//   • the row is ONE row (a wrap would be three on a phone, 125px of permanent sticky bar);
//   • the pill that is selected is inside the scrollport when the bar opens, and the row snaps to
//     pills without eating the bar's own 16px gutter.
// ⚠️ THE EDGE FADES THIS FILE USED TO MEASURE ARE GONE — Dominic asked for them off on 10 October. The
// checks went with them rather than being left asserting a thing nobody renders.
// ⛔ THE SCROLL LOGIC MEASURED HERE IS THE REAL MODULE — `lib/subtab-scroll.ts`, compiled with esbuild
// and loaded into the page. `SubTabBar` in app/manage/[token]/page.tsx calls that and nothing else, so
// this is not a look-alike: a change to the thresholds changes what this file measures.
//
// §2 · THE EVENT TYPES PHONE CARD. The three rule selects were pinned to `w-[130px]` and clipped their
// own options mid-word ("Set each pric", "Always rounc"), which is a claim about text layout that only
// a layout engine can answer — the class string looks fine either way.
//
// ⚠️ THE CLASS STRINGS AND THE COPY ARE LIFTED FROM THE REAL SOURCE, so a restyle breaks this file
// rather than quietly leaving it measuring a layout nobody is served.

const fs = require('fs')
const os = require('os')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8')

const PAGE = read('app/manage/[token]/page.tsx')
const UI = read('components/manage/EventTypes.tsx')
const COPY = read('lib/copy/serviceSettings.ts')

function lift(src, re, what) {
  const m = src.match(re)
  if (!m) throw new Error(`the fixture cannot be built: no ${what} found in the source`)
  return m[1]
}

/* ⚠️ `.next/static`, NOT `.next/dev`: the dev CSS is a different, unminified artefact and measuring
 * against it would measure something nobody is served. */
function appCss() {
  const root = path.join(REPO, '.next/static')
  if (!fs.existsSync(root)) throw new Error('no .next/static — run `npx next build` first')
  const files = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name)
    if (e.isDirectory()) walk(f); else if (e.name.endsWith('.css')) files.push(f)
  } }
  walk(root)
  const css = files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
  /* ══ ⛔ THE STALE-BUILD TRAP, WHICH HAS COST THIS WORKSTREAM FOUR SESSIONS ══════════════════════
   * Tailwind emits only the classes it finds in the source AT BUILD TIME, and an absent class does not
   * fail — it lays out differently. A build from before `snap-x` existed would render a bar with no
   * snap points and this file would report the snap check passing for the wrong reason.
   * ⛔ MATCHED LITERALLY, because the compiled selector escapes its own brackets. */
  const NEEDED = ['.snap-x', '.snap-proximity', '.snap-start', '.overflow-x-auto', '.w-max',
    '.scroll-pl-4', '.scrollbar-hide']
  const missing = NEEDED.filter(k => !css.includes(k))
  if (missing.length) {
    throw new Error('the compiled CSS is older than the components — no ' + missing.join(', ')
      + '. Run `npx next build`.')
  }
  return css
}

/** The real module, compiled for a browser. ⛔ Not re-implemented here — see the header. */
function scrollerJs() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const out = esbuild.buildSync({
    entryPoints: [path.join(REPO, 'lib/subtab-scroll.ts')],
    bundle: true, write: false, format: 'iife', globalName: 'SubTabScroll', target: 'safari15',
  })
  return out.outputFiles[0].text
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// THE FIXTURES
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const HEAD = (css) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style>
<style>html,body{margin:0;padding:0}</style>
</head><body class="bg-slate-50">`

/* 🔴 SETTINGS' OWN EIGHT SECTIONS, read out of the page so the fixture cannot drift to seven. */
function settingsPills() {
  const block = lift(PAGE, /const SETTINGS_SECTIONS([\s\S]*?)\n\]/, 'the Settings sections')
  const labels = [...block.matchAll(/label: '([^']+)'/g)].map(m => m[1])
  if (labels.length < 6) throw new Error(`only ${labels.length} Settings pills found — the fixture would not overflow`)
  return labels
}

/**
 * One sub-tab bar, built out of the page's own three class strings and the real `SubTabBar` markup.
 *
 * @param active which pill is `aria-selected` — the point of the "scrolled into view" claim.
 */
function barFixture(css, js, { pills, active = 0 }) {
  const bar = lift(PAGE, /const SUBTAB_BAR = '(.+?)'/, 'the sub-tab bar')
  const row = lift(PAGE, /const SUBTAB_ROW = '(.+?)'/, 'the sub-tab row')
  const btn = lift(PAGE, /const subtabBtn = \(on: boolean\) =>\n\s*`(.+?)\$\{/s, 'the pill')
  const on = lift(PAGE, /on \? '(bg-slate-900 text-white)'/, 'the selected pill')
  const off = lift(PAGE, /: '(bg-slate-100 text-slate-700 hover:bg-slate-200)'\}`/, 'the unselected pill')
  return `${HEAD(css)}
<div id="page" class="px-4">
  <div role="tablist" aria-label="Settings sections" data-subtab-bar id="bar" class="${bar}">
    <div id="row" class="${row}">
      ${pills.map((p, i) => `<button role="tab" aria-selected="${i === active}" data-pill="${i}" class="${btn}${i === active ? on : off}">${p}</button>`).join('\n      ')}
    </div>
  </div>
  <div style="height:400px"></div>
</div>
<script>${js}</script>
<script>window.__teardown = SubTabScroll.attachSubTabScroller(document.getElementById('bar'))</script>
</body></html>`
}

/**
 * ── 🔴 §2 · THE EVENT TYPES PHONE CARD'S PRICE BLOCK ──────────────────────────────────────────────
 *
 * @param mode 'none' ⇒ "Set each price myself": the list is open, with NO button and no Amount/Rounding.
 *             'add_pct' ⇒ a rule: Amount and Rounding show, and the list is behind one full-width button.
 */
function cardFixture(css, { mode, open = false, owns = 2 }) {
  const control = lift(read('lib/ui-tokens.ts'), /export const CONTROL_BOX =\n\s*'(.+?)'/, 'the control box')
  const heading = lift(COPY, /export const PRICE_ITEMS_HEADING = '(.+?)'/, 'the item-prices heading')
  const openLbl = lift(COPY, /export const PRICE_ITEMS_OPEN = '(.+?)'/, 'the open button')
  const closeLbl = lift(COPY, /export const PRICE_ITEMS_CLOSE = '(.+?)'/, 'the close button')
  const btnCls = lift(UI, /data-phone-items\n\s*onClick=\{\(\) => setPhoneItems\(v => !v\)\}\n\s*className="(.+?)"/, 'the item-prices button')
  const headCls = lift(UI, /className="(.+?)" data-phone-items-heading>/, 'the item-prices heading class')
  const labelCls = lift(UI, /<span className="(mb-1 block text-xs font-bold text-slate-600)">\{PRICE_SETTING_LABELS\.price_mode\}/, 'the stacked label')
  const un = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))

  /* ⚠️ THE OPTION TEXT IS THE POINT OF THIS FIXTURE: "Set each price myself" and "Always round up" are
   * the two longest options either select has, and both were clipped mid-word at 130px. */
  const MODES = [['add_gbp', '+ £'], ['add_pct', '+ %'], ['sub_gbp', '− £'], ['sub_pct', '− %'], ['none', 'Set each price myself']]
  const ROUNDS = [['none', 'None'], ['nearest_1', 'Nearest £1'], ['up_1', 'Always round up']]
  const sel = (id, opts, value) => `<select id="${id}" class="${control} w-full">${opts.map(([v, l]) => `<option value="${v}"${v === value ? ' selected' : ''}>${l}</option>`).join('')}</select>`
  const rule = mode !== 'none'
  const listOpen = mode === 'none' || open
  return `${HEAD(css)}
<div id="page" class="p-4">
  <div id="card" class="rounded-2xl border border-slate-200 p-4 space-y-2 bg-white">
    <div class="py-1.5 pl-4">
      <span class="${labelCls}">Price change</span>
      ${sel('modesel', MODES, mode)}
    </div>
    ${rule ? `
    <div class="py-1.5 pl-4">
      <span class="${labelCls}">Amount</span>
      <input id="amount" class="${control} w-full" value="10"/>
    </div>
    <div id="roundrow" class="py-1.5 pl-4">
      <span class="${labelCls}">Rounding</span>
      ${sel('roundsel', ROUNDS, 'up_1')}
    </div>` : ''}
    ${mode === 'none'
      ? `<p class="${headCls}" id="itemsheading">${heading}</p>`
      : `<div class="pl-4 pb-1 pt-1"><button type="button" id="itemsbtn" class="${btnCls}">${un(open ? closeLbl : openLbl)}</button></div>`}
    ${owns > 0 ? `<p id="owncount" class="pl-4 pb-1 text-[11px] text-slate-400">${owns} items have their own price</p>` : ''}
    ${listOpen ? `<div id="itemlist" class="pl-4 pb-1">
      <p class="pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">PIZZAS</p>
      ${['Margherita', 'Nduja, honey and smoked scamorza'].map(n => `
      <div class="flex items-center justify-between gap-2 border-t border-slate-100 py-1.5">
        <span class="min-w-0 flex-1 text-[13px] leading-tight text-slate-700">${n}</span>
        <span class="w-[130px] shrink-0"><button class="${control} w-full text-left">£12.00</button></span>
      </div>`).join('')}
    </div>` : ''}
  </div>
</div></body></html>`
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// THE RUN
// ══════════════════════════════════════════════════════════════════════════════════════════════════

let pass = 0, fail = 0
const t = (ok, msg) => { if (ok) { pass++; console.log(`  ✓ ${msg}`) } else { fail++; console.log(`  🔴 ${msg}`) } }
const head = (s) => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 86 - s.length))}`)

async function engines() {
  const out = []
  try {
    const { webkit } = require('playwright')
    const b = await webkit.launch()
    out.push({ name: 'WebKit', browser: b, page: await b.newPage(), vp: (p, w, h) => p.setViewportSize({ width: w, height: h }) })
  } catch (e) { out.push({ name: 'WebKit', skip: String(e.message).split('\n')[0].slice(0, 110) }) }
  try {
    const { chromium } = require('playwright')
    const b = await chromium.launch()
    out.push({ name: 'Chromium', browser: b, page: await b.newPage(), vp: (p, w, h) => p.setViewportSize({ width: w, height: h }) })
  } catch (e) { out.push({ name: 'Chromium', skip: String(e.message).split('\n')[0].slice(0, 110) }) }
  return out
}

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'subtab-'))
const write = (name, html) => { const p = path.join(DIR, name); fs.writeFileSync(p, html); return 'file://' + p }

/** Everything the bar claims, read off the rendered boxes. */
const BAR_PROBE = `(() => {
  const bar = document.getElementById('bar')
  const row = document.getElementById('row')
  const pills = [...row.querySelectorAll('[data-pill]')].map(el => {
    const b = el.getBoundingClientRect()
    return { i: Number(el.dataset.pill), top: Math.round(b.top), left: Math.round(b.left), right: Math.round(b.right) }
  })
  const bb = bar.getBoundingClientRect()
  return {
    barH: Math.round(bb.height), barTop: Math.round(bb.top), barLeft: Math.round(bb.left), barRight: Math.round(bb.right),
    scrollLeft: Math.round(bar.scrollLeft), scrollW: Math.round(bar.scrollWidth), clientW: Math.round(bar.clientWidth),
    rows: new Set(pills.map(p => p.top)).size,
    pills,
    snapType: getComputedStyle(bar).scrollSnapType,
    /* 🔴 THE SCROLLBAR'S OWN HEIGHT, which is the honest measure of "is a track painted": a classic
     * (non-overlay) scrollbar takes layout room, so offsetHeight - clientHeight is its height — MINUS
     * THE BORDERS, which offsetHeight includes and clientHeight does not. ⛔ WITHOUT THAT THE BAR'S OWN
     * bottom border READS AS A 1px TRACK, which is what the first run of this check reported. It is 0
     * on an overlay engine either way, which is why the computed property is read as well. */
    barGutter: (() => {
      const cs = getComputedStyle(bar)
      const b = parseFloat(cs.borderTopWidth || '0') + parseFloat(cs.borderBottomWidth || '0')
      return Math.round(bar.offsetHeight - bar.clientHeight - b)
    })(),
    scrollbarWidth: getComputedStyle(bar).scrollbarWidth,
    pillSnap: getComputedStyle(row.querySelector('[data-pill]')).scrollSnapAlign,
    docScrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }
})()`

;(async () => {
  const css = appCss()
  const js = scrollerJs()
  const pills = settingsPills()
  console.log(`  ⚠️ ${pills.length} Settings pills, the real \`lib/subtab-scroll.ts\` (${(js.length / 1024).toFixed(1)}KB), and the compiled app CSS`)

  const engs = await engines()
  let measured = 0
  for (const eng of engs) {
    if (eng.skip) { console.log(`  ⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
    measured++
    const page = eng.page

    // ══════════════════════════════════════════════════════════════════════════════════════════════
    // §1 · THE SUB-TAB ROW
    // ══════════════════════════════════════════════════════════════════════════════════════════════
    for (const [w, h] of [[390, 844], [430, 932]]) {
      head(`${eng.name} · §1 · the sub-tab row at ${w}×${h}`)
      await eng.vp(page, w, h)
      await page.goto(write(`bar-${w}-${eng.name}.html`, barFixture(css, js, { pills, active: 0 })))
      await page.waitForTimeout(300)
      const m = await page.evaluate(BAR_PROBE)

      /* 🔴 ONE ROW. ⛔ THE WRAP MADE THIS THREE, which is 125px of sticky bar on an 844px screen —
       * 15% of the phone, permanently, and the reason it was reverted. */
      t(m.rows === 1, `${eng.name} ${w}: the pills are on ONE row (${m.rows})`)
      t(m.barH <= 56, `${eng.name} ${w}: …so the sticky bar stays short (${m.barH}px)`)
      /* ⚠️ AND THERE REALLY IS SOMETHING TO SCROLL, or every claim below is vacuous. */
      t(m.scrollW > m.clientW + 10,
        `${eng.name} ${w}: the row overflows the bar, which is why it needs saying (${m.scrollW} in ${m.clientW})`)
      /* ⛔ THE PAGE ITSELF MUST NOT SCROLL SIDEWAYS — the overflow belongs to the bar. */
      t(m.docScrollW <= m.innerW + 1, `${eng.name} ${w}: …and the PAGE does not scroll sideways (${m.docScrollW} in ${m.innerW})`)

      /* ⚠️ SNAP POINTS — so a swipe settles with a pill's edge against the bar's, not halfway through
       * one. ⛔ A BROWSER MAY COMPUTE THIS AS JUST "x": `proximity` is the spec's default strictness,
       * so it is not echoed back, and asserting the word would be asserting a serialisation. What must
       * NOT be there is `mandatory` — it would fight the scroll-into-view below and re-snap away from
       * the position it had just set. */
      t(/\bx\b/.test(m.snapType) && !/mandatory/.test(m.snapType),
        `${eng.name} ${w}: the row snaps to pills when swiped, and not mandatorily (scroll-snap-type: ${m.snapType})`)
      t(m.pillSnap === 'start', `${eng.name} ${w}: …at each pill's start edge (${m.pillSnap})`)

      /* ══ 🔴 NO SCROLLBAR TRACK OVER THE PILLS ═══════════════════════════════════════════════════
       * ⛔ **IT IS THE APP THAT PAINTS ONE, NOT THE WEBSITE.** Mobile Safari uses overlay scrollbars
       * that fade out when nothing is moving; the Capacitor WKWebView can keep a persistent grey
       * track, and the bar already has a `border-b` in the same two pixels. ⚠️ NEITHER ENGINE HERE
       * REPRODUCES THAT BY DEFAULT, so this measures the two things that are true wherever it runs:
       * the scroller costs no layout height to a track, and the property that suppresses one really
       * is applied. The `::-webkit-scrollbar` half is asserted in the compiled CSS by `NEEDED`. */
      t(m.barGutter === 0,
        `${eng.name} ${w}: the row costs no height to a scrollbar track (${m.barGutter}px)`)
      t(m.scrollbarWidth === 'none',
        `${eng.name} ${w}: …and the track is suppressed, not merely invisible here (scrollbar-width: ${m.scrollbarWidth})`)

      // ── the selected pill is the LAST one: it must be in view on open ───────────────────────────
      await page.goto(write(`bar-last-${w}-${eng.name}.html`, barFixture(css, js, { pills, active: pills.length - 1 })))
      await page.waitForTimeout(300)
      const last = await page.evaluate(BAR_PROBE)
      const sel = last.pills[last.pills.length - 1]
      /* 🔴 THE REPORTED BUG, TURNED INTO A MEASUREMENT. "Auto-replies" is the seventh of eight; with no
       * scroll on open its pill sits ~400px past the right edge and the operator never learns it is
       * there. ⚠️ ASSERTED AS THE PILL'S BOX AGAINST THE BAR'S, not as a scrollLeft value. */
      t(sel.left >= last.barLeft - 1 && sel.right <= last.barRight + 1,
        `${eng.name} ${w}: the SELECTED pill (the last of ${pills.length}) is in view on open (${sel.left}–${sel.right} in ${last.barLeft}–${last.barRight})`)
      t(last.scrollLeft > 0, `${eng.name} ${w}: …because the bar scrolled itself to it (scrollLeft ${last.scrollLeft})`)
    }

    // ── AND AT DESKTOP WIDTHS NOTHING OF THIS SHOWS ────────────────────────────────────────────────
    for (const [w, h] of [[1100, 800], [1728, 1000]]) {
      head(`${eng.name} · §1 · the desktop bar at ${w}×${h} is what it was`)
      await eng.vp(page, w, h)
      await page.goto(write(`bar-${w}-${eng.name}.html`, barFixture(css, js, { pills, active: 0 })))
      await page.waitForTimeout(300)
      const m = await page.evaluate(BAR_PROBE)
      t(m.rows === 1 && m.scrollW <= m.clientW + 1,
        `${eng.name} ${w}: all ${pills.length} pills fit on one row with nothing to scroll (${m.scrollW} in ${m.clientW})`)
      t(m.scrollLeft === 0, `${eng.name} ${w}: …and nothing scrolled itself (scrollLeft ${m.scrollLeft})`)
    }

    // ══════════════════════════════════════════════════════════════════════════════════════════════
    // §2 · THE EVENT TYPES PHONE CARD
    // ══════════════════════════════════════════════════════════════════════════════════════════════
    for (const [w, h] of [[390, 844], [430, 932]]) {
      head(`${eng.name} · §2 · Event types' price block at ${w}×${h}`)
      await eng.vp(page, w, h)

      // ── "Set each price myself": the list, straight away, with no button and no Amount/Rounding ──
      await page.goto(write(`card-none-${w}-${eng.name}.html`, cardFixture(css, { mode: 'none' })))
      await page.waitForTimeout(80)
      const none = await page.evaluate(`(() => {
        const q = (id) => document.getElementById(id)
        const sel = q('modesel')
        const r = sel.getBoundingClientRect()
        const card = q('card').getBoundingClientRect()
        return {
          heading: !!q('itemsheading'), btn: !!q('itemsbtn'), list: !!q('itemlist'),
          amount: !!q('amount'), rounding: !!q('roundrow'),
          own: (q('owncount') || {}).textContent || null,
          selW: Math.round(r.width), cardW: Math.round(card.width),
          selText: sel.options[sel.selectedIndex].text,
          docScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
        }
      })()`)
      t(none.list && none.heading && !none.btn,
        `${eng.name} ${w}: "Set each price myself" shows the item list straight away, under a heading and with NO button`)
      /* ⛔ AMOUNT AND ROUNDING ARE GONE IN THIS MODE. `applyPriceRule` reads the amount only inside the
       * four add/subtract branches, so in this mode the box cannot change a single price. */
      t(!none.amount && !none.rounding,
        `${eng.name} ${w}: …and Amount and Rounding are hidden, because neither can change a price here`)
      t(none.own === '2 items have their own price',
        `${eng.name} ${w}: the override count is plain words ("${none.own}")`)
      t(none.docScrollW <= none.innerW + 1, `${eng.name} ${w}: …and the page does not scroll sideways`)

      // ── A RULE MODE: the button, which opens the same list ────────────────────────────────────────
      await page.goto(write(`card-pct-${w}-${eng.name}.html`, cardFixture(css, { mode: 'add_pct' })))
      await page.waitForTimeout(80)
      const pct = await page.evaluate(`(() => {
        const q = (id) => document.getElementById(id)
        const b = q('itemsbtn').getBoundingClientRect()
        const inner = q('card').getBoundingClientRect()
        const sel = q('modesel')
        return {
          btn: (q('itemsbtn').textContent || '').trim(), list: !!q('itemlist'),
          amount: !!q('amount'), rounding: !!q('roundrow'),
          btnW: Math.round(b.width), cardW: Math.round(inner.width),
          /* "fits" is scrollWidth <= clientWidth on the SELECT: a clipped option overflows its box
             rather than wrapping, which is exactly what "Set each pric" was. */
          selOver: sel.scrollWidth - sel.clientWidth,
          roundOver: (() => { const r = q('roundsel'); return r.scrollWidth - r.clientWidth })(),
        }
      })()`)
      t(!pct.list && /See or change/.test(pct.btn),
        `${eng.name} ${w}: a rule mode folds the list behind one button ("${pct.btn}")`)
      /* ⚠️ FULL WIDTH OF THE CARD'S CONTENT, which is what makes it a button rather than a badge. The
       * card is `p-4` and the block is `pl-4`, so the button is the card minus 48px. */
      t(pct.btnW >= pct.cardW - 56,
        `${eng.name} ${w}: …and that button is full width (${pct.btnW}px of ${pct.cardW}px)`)
      t(pct.amount && pct.rounding,
        `${eng.name} ${w}: …with Amount and Rounding shown, because here they do change prices`)

      // ── opened ────────────────────────────────────────────────────────────────────────────────────
      await page.goto(write(`card-pct-open-${w}-${eng.name}.html`, cardFixture(css, { mode: 'add_pct', open: true })))
      await page.waitForTimeout(80)
      const opened = await page.evaluate(`(() => ({
        list: !!document.getElementById('itemlist'),
        btn: (document.getElementById('itemsbtn').textContent || '').trim(),
      }))()`)
      t(opened.list && /Hide item prices/.test(opened.btn),
        `${eng.name} ${w}: pressing it opens the list and the button becomes "${opened.btn}"`)

      /* ══ 🔴 THE REPORTED SYMPTOM: "Set each pric", "Always rounc" ═══════════════════════════════
       * ⛔ BOTH SELECTS HELD THE LONGEST OPTION EITHER HAS, AT 130px, AND CLIPPED IT MID-WORD. The
       * label is above the control now and the control is the full width of the card. */
      t(pct.selOver <= 0 && pct.roundOver <= 0,
        `${eng.name} ${w}: neither select clips its longest option (mode ${pct.selOver}px over, rounding ${pct.roundOver}px over)`)
      t(none.selText === 'Set each price myself' && none.selW >= none.cardW - 56,
        `${eng.name} ${w}: …and "${none.selText}" is shown in full, in a ${none.selW}px control`)
    }

    // ══════════════════════════════════════════════════════════════════════════════════════════════
    // THE CONTROL
    // ══════════════════════════════════════════════════════════════════════════════════════════════
    /* ⛔ IT BREAKS THE ONE THING §1 IS FOR: bringing the selected pill into view. The LAST pill is
     * selected, exactly as in the claim above — but `aria-selected` is stripped before the scroller
     * runs, so the module cannot find it and never scrolls. ⚠️ THE PILL MUST THEN BE OFF SCREEN, which
     * is the state the operator reported: 'Auto-replies' 400px past the right edge of a 390px phone
     * with nothing bringing it back. ⛔ WITHOUT THIS, "the pill is in view" would also be satisfied by
     * a bar that never needed to scroll at all, and the check would pass for the wrong reason. */
    head(`${eng.name} · CONTROL`)
    await eng.vp(page, 390, 844)
    const broken = barFixture(css, js, { pills, active: pills.length - 1 })
      .replace('<script>window.__teardown',
        '<script>document.querySelectorAll(\'[role="tab"]\').forEach(e => e.removeAttribute("aria-selected"))</script>\n<script>window.__teardown')
    await page.goto(write(`bar-ctl-${eng.name}.html`, broken))
    await page.waitForTimeout(300)
    const ctl = await page.evaluate(BAR_PROBE)
    const lastPill = ctl.pills[ctl.pills.length - 1]
    t(ctl.scrollLeft === 0 && lastPill.left > ctl.barRight,
      `${eng.name} CONTROL: with the scroller unable to find the selected pill it stays ${lastPill.left - ctl.barRight}px past the right edge (scrollLeft ${ctl.scrollLeft}) — so "the pill is in view" is a measurement`)

    await eng.browser.close()
  }

  console.log('')
  if (!measured) { console.log('🔴 NO ENGINE WAS AVAILABLE — nothing was measured'); process.exit(1) }
  if (fail) { console.log(`🔴 ${fail} CHECK(S) FAILED`); process.exit(1) }
  console.log(`✅ all ${pass} passed, in ${measured} engine(s)`)
})().catch(e => { console.error(e); process.exit(1) })
