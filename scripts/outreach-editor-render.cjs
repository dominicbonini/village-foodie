#!/usr/bin/env node
// scripts/outreach-editor-render.cjs — RENDERS the composer's RichEmailEditor in Chromium and WebKit and
// drives it like a person. Required by scripts/outreach-editor-toolbar.cjs behind HG_RENDER=1; it is in
// the `needs_a_browser` group for the same reason outreach-templates-render.cjs is.
//   HG_RENDER=1 node scripts/outreach-editor-toolbar.cjs     ← the normal way in
//   node scripts/outreach-editor-render.cjs                  ← standalone, for working on it
//
// 🔴 WHY A BROWSER AT ALL. The bugs this guards are not in a pure function: a stale toolbar, a caret
// left in the wrong place, a stored mark, a Tab that nests. `tsc` and `next build` see none of them, and
// there is no jsdom in this repo. ProseMirror needs a real DOM to have state worth asserting about.
//
// ⚠️ IT BUNDLES THE REAL COMPONENT WITH esbuild (a devDependency added 1 October 2026) — not a copy of
// its logic. A test that re-implements the thing it tests agrees with itself.
//
// ── 🔴 THREE DRIVER BUGS ARE WRITTEN INTO THIS FILE, because each produced a confident FALSE FAILURE
//    and twice I was about to report one as a product bug:
//      ① a hand-built `document.createRange()` selection is NOT a ProseMirror selection — the editor
//         keeps its own, and `chain().focus()` restores THAT, so everything after it acted on a caret
//         the editor did not believe in. Five assertions failed in Chromium while WebKit passed them.
//      ② an unpaced `keyboard.press` loop races ProseMirror: a three-key selection came back as "ed",
//         and four assertions then failed about marks that were never applied.
//      ③ a plain click lands the caret MID-DOCUMENT, so "• List" swallowed the signature line, the new
//         empty item sat inside the list, and Enter split it instead of leaving it — the button reported
//         active and WAS RIGHT.
//    Hence: no DOM ranges, paced keystrokes, a known caret, and ONE FRESH PAGE PER BEHAVIOUR so a single
//    mis-step cannot cascade.
const fs = require('fs'); const os = require('os'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const esbuild = require(path.join(REPO, 'node_modules/esbuild'))

/** The harness page: the real component, with a parent that can re-render on demand. */
const ENTRY = `
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import RichEmailEditor from '@/components/admin/RichEmailEditor'
import { docFromTemplateText, type EmailDoc } from '@/lib/outreach-doc'
const SIG = {
  signatureLines: [{ text: 'Kind regards,' }, { text: '' }, { text: 'Dominic Bonini', bold: true }],
  optOut: 'Reply STOP and I will not contact you again.',
}
const TEMPLATE = docFromTemplateText('Hi George,\\n\\nI run villagefoodie.co.uk.\\n\\n{{signature}}\\n{{opt_out}}', SIG) as EmailDoc
declare global { interface Window { H: Record<string, unknown> } }
function Harness() {
  const [doc, setDoc] = useState<EmailDoc>(TEMPLATE)
  const [n, setN] = useState(0)
  // 🔴 \`poke\` HANDS THE SAME DOCUMENT BACK DOWN — the re-render that used to clobber a user's mark.
  window.H = { poke: () => setN(x => x + 1), n }
  return <div style={{ padding: 16, width: '100%' }}>
    <RichEmailEditor value={doc} onChange={d => setDoc(d)} signatureLines={SIG.signatureLines} optOut={SIG.optOut} />
  </div>
}
createRoot(document.getElementById('root')!).render(<Harness />)
`

/** Bundle the component (optionally with a source patch, for a broken variant). */
async function bundle(tag, patch) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ed-${tag}-`))
  let importPath = '@/components/admin/RichEmailEditor'
  if (patch) {
    const src = fs.readFileSync(path.join(REPO, 'components/admin/RichEmailEditor.tsx'), 'utf8')
    const out = patch(src)
    // 🔴 A PATCH THAT DID NOT APPLY PROVES NOTHING AND LOOKS LIKE A PASS.
    if (out === src) throw new Error(`${tag}: the variant patch did not apply — its anchor has drifted`)
    fs.mkdirSync(path.join(tmp, 'components/admin'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'components/admin/RichEmailEditor.tsx'), out)
    importPath = path.join(tmp, 'components/admin/RichEmailEditor')
  }
  fs.writeFileSync(path.join(tmp, 'entry.tsx'), ENTRY.replace('@/components/admin/RichEmailEditor', importPath))
  const outfile = path.join(tmp, 'bundle.js')
  await esbuild.build({
    entryPoints: [path.join(tmp, 'entry.tsx')], bundle: true, format: 'iife', jsx: 'automatic',
    outfile, absWorkingDir: REPO, alias: { '@': REPO },
    nodePaths: [path.join(REPO, 'node_modules')],
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
  })
  const css = (() => {
    // The real Tailwind bundle, for the layout measurement. Absent ⇒ layout is skipped, not guessed.
    const dir = path.join(REPO, '.next/static/chunks')
    if (!fs.existsSync(dir)) return null
    const hit = fs.readdirSync(dir).filter(f => f.endsWith('.css'))
      .map(f => ({ f, n: fs.statSync(path.join(dir, f)).size })).sort((a, b) => b.n - a.n)[0]
    return hit ? fs.readFileSync(path.join(dir, hit.f), 'utf8') : null
  })()
  return { js: fs.readFileSync(outfile, 'utf8'), css }
}

const page = (js, css, wrap) => `<!doctype html><html><head><meta charset="utf-8">`
  + `<meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<style>body{margin:0;font-family:system-ui}${css ?? ''}</style></head><body>`
  + (wrap ? `<div style="width:56vw;margin:0 auto"><div id="root"></div></div>` : `<div id="root"></div>`)
  + `<script>${js}</script></body></html>`

const BOLD_RE = /<(b|strong)[^>]*>([^<]*)<\/(b|strong)>/g
const boldTexts = h => [...h.matchAll(BOLD_RE)].map(m => m[2])

async function engines() {
  const puppeteer = require(path.join(REPO, 'node_modules/puppeteer'))
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  return [
    ['Chromium', async () => {
      const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
      return { b, np: async (w, h) => { const p = await b.newPage(); await p.setViewport({ width: w, height: h }); return p } }
    }],
    ['WebKit', async () => {
      const b = await webkit.launch()
      return { b, np: async (w, h) => (await b.newContext({ viewport: { width: w, height: h } })).newPage() }
    }],
  ]
}

/** ⚠️ PACED. See driver bug ② at the head of this file. */
async function shiftPress(p, key, n) {
  await p.keyboard.down('Shift')
  for (let i = 0; i < n; i++) { await p.keyboard.press(key); await new Promise(r => setTimeout(r, 60)) }
  await p.keyboard.up('Shift')
  await new Promise(r => setTimeout(r, 80))
}
/** Select the last n characters, verifying and retrying once if the engine dropped a key. */
async function selectBack(p, n, expect) {
  await shiftPress(p, 'ArrowLeft', n)
  let sel = await p.evaluate(() => String(getSelection()))
  if (sel !== expect) {
    await p.keyboard.press('ArrowRight'); await new Promise(r => setTimeout(r, 80))
    await shiftPress(p, 'ArrowLeft', n)
    sel = await p.evaluate(() => String(getSelection()))
  }
  return sel
}

async function measure() {
  const lines = []; let fails = 0
  const t = (ok, label, extra = '') => { lines.push(`${ok ? '✓' : '🔴'} ${label}${extra ? ' · ' + extra : ''}`); if (!ok) fails++ }
  const built = await bundle('real')
  const PAGE = page(built.js, null, false)

  for (const [eng, open] of await engines()) {
    const { b, np } = await open()
    lines.push(`── ${eng} ─────────────────────────────────────────────────────────────────`)
    const fresh = async () => {
      const p = await np(1280, 900)
      await p.setContent(PAGE, { waitUntil: 'load' })
      await p.waitForSelector('.ProseMirror')
      await new Promise(r => setTimeout(r, 400))
      return p
    }
    const html = p => p.evaluate(() => document.querySelector('.ProseMirror').innerHTML)
    const aria = (p, l) => p.evaluate(x => { const n = [...document.querySelectorAll('button')].find(y => y.textContent.trim() === x); return n ? n.getAttribute('aria-pressed') : 'NO BUTTON' }, l)
    const clickBtn = async (p, l) => { await p.evaluate(x => [...document.querySelectorAll('button')].find(y => y.textContent.trim() === x).click(), l); await new Promise(r => setTimeout(r, 180)) }
    /** ⚠️ A KNOWN CARET: the very end of the document. See driver bug ③. */
    const toEnd = async p => { await p.click('.ProseMirror'); for (let i = 0; i < 25; i++) await p.keyboard.press('ArrowDown'); await p.keyboard.press('End') }

    { // A · after a template loads
      const p = await fresh(); const h = await html(p)
      t(/Hi George,/.test(h), 'the template loaded')
      t(!boldTexts(h).some(x => /Hi George/.test(x)), 'the greeting is NOT bold', `bold runs: ${JSON.stringify(boldTexts(h))}`)
      t(await aria(p, 'B') === 'false', 'B is inactive before anything is typed')
      t(boldTexts(h).includes('Dominic Bonini'), 'the signature line IS still bold')
      await p.close()
    }
    { // B · typing on a fresh caret is plain
      const p = await fresh(); await p.click('.ProseMirror'); await p.keyboard.type('Zed')
      const h = await html(p)
      t(/Zed/.test(h) && !boldTexts(h).some(x => x.includes('Zed')), 'typing produces NO bold mark')
      await p.close()
    }
    { // C · bold sticks, including through the revert trigger
      const p = await fresh(); await p.click('.ProseMirror'); await p.keyboard.type('Zed')
      t(await selectBack(p, 3, 'Zed') === 'Zed', 'the word is selected by keyboard')
      await clickBtn(p, 'B')
      // ⚠️ CONTAINMENT, not equality: typing after a bold word EXTENDS the run, which is correct.
      const stuck = async () => boldTexts(await html(p)).some(x => x.includes('Zed'))
      t(await stuck(), 'bolding a word applies immediately')
      await new Promise(r => setTimeout(r, 5000))
      t(await stuck(), 'still bold after 5 seconds')
      await p.keyboard.press('ArrowRight'); await p.keyboard.type(' and more')
      t(await stuck(), 'still bold after typing elsewhere')
      await p.evaluate(() => document.querySelector('.ProseMirror').blur()); await new Promise(r => setTimeout(r, 250))
      await p.click('.ProseMirror')
      t(await stuck(), 'still bold after blur and refocus')
      await p.evaluate(() => window.H.poke()); await new Promise(r => setTimeout(r, 400))
      t(await stuck(), 'still bold after a parent re-render (the revert trigger)')
      await p.close()
    }
    { // D · lists, and Tab doing nothing
      const p = await fresh()
      await toEnd(p); await p.keyboard.press('Enter')
      await clickBtn(p, '• List')
      t(await aria(p, '• List') === 'true', 'the • List button reports ACTIVE inside a list')
      await p.keyboard.type('one'); await p.keyboard.press('Enter'); await p.keyboard.type('two')
      let h = await html(p)
      t(/<ul/.test(h) && (h.match(/<li/g) || []).length >= 2, 'Enter makes a new list item', `${(h.match(/<li/g) || []).length} items`)
      /* 🔴 TAB IS A NO-OP INSIDE A LIST (1 October 2026). Asserted as "the document is UNCHANGED" rather
       * than "no <ul> inside an <li>" — the latter would pass if Tab did something else destructive. */
      const before = h
      await p.keyboard.press('Tab'); await new Promise(r => setTimeout(r, 200)); h = await html(p)
      t(h === before, 'Tab inside a list item leaves the document UNCHANGED')
      t(!/<li[\s\S]*<ul/.test(h), '…and no list is nested inside an item')
      t(await p.evaluate(() => document.activeElement?.classList.contains('ProseMirror')), '…and focus stays in the editor')
      await shiftPress(p, 'Tab', 1); await new Promise(r => setTimeout(r, 200)); h = await html(p)
      t(h === before, 'Shift-Tab leaves the document UNCHANGED too')
      t(await p.evaluate(() => document.activeElement?.classList.contains('ProseMirror')), '…and focus still stays in the editor')
      await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 200))
      const tail = await p.evaluate(() => { const c = document.querySelector('.ProseMirror').children; return c[c.length - 1].tagName })
      t(tail === 'P', 'Enter on an empty item leaves the list', `last block <${tail.toLowerCase()}>`)
      t(await aria(p, '• List') === 'false', '…and the • List button reports INACTIVE again')
      await p.close()
    }
    { // D2 · B follows the caret on a selection-only move — the proven stale-state bug
      const p = await fresh()
      await toEnd(p); await p.keyboard.press('Enter'); await p.keyboard.type('bolded plain')
      await shiftPress(p, 'ArrowLeft', 12); await clickBtn(p, 'B')
      t(await aria(p, 'B') === 'true', 'B reports ACTIVE with the caret in bold text')
      for (let i = 0; i < 4; i++) { await p.keyboard.press('ArrowUp'); await new Promise(r => setTimeout(r, 60)) }
      await p.keyboard.press('Home'); await new Promise(r => setTimeout(r, 350))
      t(await aria(p, 'B') === 'false', '…and INACTIVE after a selection-only move out of it')
      await p.close()
    }
    { // E · the shortcuts, with the modifier this engine honours
      for (const [key, name] of [['KeyB', 'bold'], ['KeyI', 'italic']]) {
        const p = await fresh(); await p.click('.ProseMirror'); await p.keyboard.type('word')
        await new Promise(r => setTimeout(r, 120))
        if (await selectBack(p, 4, 'word') !== 'word') { t(false, `the ${name} shortcut test could select the word`); await p.close(); continue }
        let via = null
        for (const mod of ['Meta', 'Control']) {
          await p.keyboard.down(mod); await p.keyboard.press(key); await p.keyboard.up(mod)
          const h = await html(p)
          if (name === 'bold' ? boldTexts(h).includes('word') : /<(i|em)[^>]*>/.test(h)) { via = mod; break }
        }
        t(via !== null, `the ${name} keyboard shortcut works`, via ? `via ${via}+${key.slice(3)}` : 'neither Meta nor Control')
        await p.close()
      }
    }
    await b.close()
  }

  // ── THE TOOLBAR'S LAYOUT, in the composer's own column width ────────────────────────────────────
  if (!built.css) {
    lines.push('⚠️ LAYOUT SKIPPED — no built CSS in .next/static/chunks. Run `npx next build` first.')
  } else {
    const LPAGE = page(built.js, built.css, true)
    for (const [eng, open] of await engines()) {
      const { b, np } = await open()
      for (const [label, w] of [['16" MBP (1728)', 1728], ['27" monitor (2560)', 2560]]) {
        const p = await np(w, 1000)
        await p.setContent(LPAGE, { waitUntil: 'load' })
        await p.waitForSelector('.ProseMirror'); await new Promise(r => setTimeout(r, 400))
        const r = await p.evaluate(() => {
          const bar = document.querySelector('.ProseMirror').closest('.rounded-lg').querySelector('div')
          const btns = [...bar.querySelectorAll('button')]
          const box = bar.getBoundingClientRect()
          // ⚠️ ROWS CLUSTERED WITHIN 4px — exact tops differ by a fraction between engines, and counting
          // distinct values reported "2 rows" for a 40px bar demonstrably on one line.
          const tops = btns.map(x => x.getBoundingClientRect().top).sort((a, c) => a - c)
          const rows = tops.reduce((acc, v) => (acc.length && v - acc[acc.length - 1] < 4 ? acc : [...acc, v]), [])
          const clipped = btns.filter(x => { const q = x.getBoundingClientRect()
            return q.right > box.right + 1 || q.left < box.left - 1 || q.bottom > box.bottom + 1 })
          return { w: Math.round(box.width), h: Math.round(box.height), n: btns.length, rows: rows.length,
            clipped: clipped.map(x => x.textContent.trim()),
            docW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }
        })
        const ok = r.clipped.length === 0 && r.docW <= r.clientW + 1
        t(ok, `${eng} · ${label}`, `column ${r.w}px · ${r.n} buttons on ${r.rows} row(s), bar ${r.h}px`
          + (r.clipped.length ? ` · 🔴 clipped: ${r.clipped.join(', ')}` : '')
          + (r.docW > r.clientW + 1 ? ` · 🔴 page scrolls sideways ${r.docW}/${r.clientW}` : ''))
        await p.close()
      }
      await b.close()
    }
  }

  // ── BROKEN VARIANTS ────────────────────────────────────────────────────────────────────────────
  lines.push('── BROKEN VARIANTS: MUST reproduce ────────────────────────────────────────')
  // 🔴 V1 — Tab nests again, which is the shape validateDoc refuses.
  {
    const v = await bundle('nest', src => src.replace('    NoListIndent,\n', ''))
    const VP = page(v.js, null, false)
    for (const [eng, open] of await engines()) {
      const { b, np } = await open(); const p = await np(1280, 900)
      await p.setContent(VP, { waitUntil: 'load' })
      try { await p.waitForSelector('.ProseMirror', { timeout: 15000 }) }
      catch { t(false, `V1 ${eng}: the patched editor did not render — the variant is broken, not the fix`); await b.close(); continue }
      await new Promise(r => setTimeout(r, 400))
      const html2 = () => p.evaluate(() => document.querySelector('.ProseMirror').innerHTML)
      await p.click('.ProseMirror'); for (let i = 0; i < 25; i++) await p.keyboard.press('ArrowDown')
      await p.keyboard.press('End'); await p.keyboard.press('Enter')
      await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '• List').click())
      await new Promise(r => setTimeout(r, 200))
      await p.keyboard.type('one'); await p.keyboard.press('Enter'); await p.keyboard.type('two')
      await new Promise(r => setTimeout(r, 200))
      const before = await html2()
      await p.keyboard.press('Tab'); await new Promise(r => setTimeout(r, 250))
      const after = await html2()
      const nested = /<li[\s\S]*<ul/.test(after) && after !== before
      t(nested, `V1 ${eng}: removing NoListIndent makes Tab nest again`)
      await b.close()
    }
  }
  // 🔴 V2 — the toolbar reads isActive at render time, so it goes stale on a caret move.
  {
    const v = await bundle('stale', src => {
      const out = src.replace(/  const active = useEditorState\(\{[\s\S]*?\n  \}\) \?\? \{[^}]*\}\n/,
        "  const active = { bold: editor?.isActive('bold'), italic: editor?.isActive('italic'), small: editor?.isActive('small'), large: editor?.isActive('large'), bulletList: editor?.isActive('bulletList'), orderedList: editor?.isActive('orderedList'), link: editor?.isActive('link') } as Record<string, boolean>\n")
      if (out.includes('useEditorState({')) throw new Error('stale: the subscription was not removed')
      return out
    })
    const VP = page(v.js, null, false)
    for (const [eng, open] of await engines()) {
      const { b, np } = await open(); const p = await np(1280, 900)
      await p.setContent(VP, { waitUntil: 'load' })
      try { await p.waitForSelector('.ProseMirror', { timeout: 15000 }) }
      catch { t(false, `V2 ${eng}: the patched editor did not render`); await b.close(); continue }
      await new Promise(r => setTimeout(r, 400))
      const ariaB = () => p.evaluate(() => { const x = [...document.querySelectorAll('button')].find(y => y.textContent.trim() === 'B'); return x ? x.getAttribute('aria-pressed') : 'NONE' })
      await p.click('.ProseMirror'); for (let i = 0; i < 25; i++) await p.keyboard.press('ArrowDown')
      await p.keyboard.press('End'); await p.keyboard.press('Enter')
      await p.keyboard.type('bolded plain')
      await shiftPress(p, 'ArrowLeft', 12)
      await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'B').click())
      await new Promise(r => setTimeout(r, 250))
      const inBold = await ariaB()
      for (let i = 0; i < 4; i++) { await p.keyboard.press('ArrowUp'); await new Promise(r => setTimeout(r, 60)) }
      await p.keyboard.press('Home'); await new Promise(r => setTimeout(r, 350))
      const out2 = await ariaB()
      t(inBold === 'true' && out2 === 'true', `V2 ${eng}: without the subscription the B button goes stale on a caret move`)
      await b.close()
    }
  }
  return { lines, fails }
}

module.exports = { measure }

if (require.main === module) {
  measure().then(r => { for (const l of r.lines) console.log('  ' + l)
    console.log(r.fails === 0 ? '\n✅ the editor behaves as specified in both engines' : `\n🔴 ${r.fails} failure(s)`)
    process.exit(r.fails === 0 ? 0 : 1) })
}
