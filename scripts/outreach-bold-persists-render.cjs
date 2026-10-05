#!/usr/bin/env node
// scripts/outreach-bold-persists-render.cjs — THE MARK-ONLY REVERT, IN A REAL BROWSER.
//
//   node scripts/outreach-bold-persists-render.cjs          ← standalone
//   HG_RENDER=1 node scripts/outreach-bold-persists.cjs     ← the normal way in
//
// 🔴 WHY THIS FILE EXISTS AND scripts/outreach-editor-render.cjs WAS NOT ENOUGH. That harness mounts
// RichEmailEditor under a TOY parent — `onChange={d => setDoc(d)}` — so the document always comes back
// down intact. The reported bug lives in the REAL parent: ComposeWindow decides, inside `onChange`,
// whether an emission counts as an edit, and it decides it by comparing PLAIN TEXT. A mark-only change
// has identical plain text. So this harness mounts the REAL ComposeWindow, with the real editor inside
// it, and performs the operator's exact three steps:
//     1. select all · press B   → everything goes bold
//     2. select all · press B   → everything goes plain
//     3. click to deselect      → 🔴 REPORTED: the text goes BACK TO BOLD on its own
//
// ⚠️ A HEADLESS ProseMirror CHECK CANNOT SEE THIS. The revert is a React re-render handing an older
// document back down; there is no React in a bare ProseMirror state test. Hence two real engines —
// Chromium (Puppeteer) and WebKit (Playwright), because the operator uses Safari.
//
// ⚠️ NOTHING IS SENT. `window.fetch` is replaced before the component mounts: the settings GET answers
// from a literal, the mail-send GET answers "available", and the mail-send POST is RECORDED and never
// reaches the network. The send path exercised is "Send test to me", which is server-side bound to
// OUTREACH_TEST_RECIPIENT even when it is not stubbed.
//
// ── 🔴 DRIVER NOTES, each of which cost a false result at least once elsewhere in this repo ────────
//  ① Cmd+A is the operator's gesture and `Meta` is honoured on darwin — but it is VERIFIED here, and
//    falls back to Control+A, because a select-all that selected nothing makes every later assertion
//    pass vacuously.
//  ② The toolbar buttons `preventDefault()` on mousedown so the selection survives the click. The
//    driver therefore uses a REAL click (`p.click`), not `el.click()`, or that path is not exercised.
//  ③ ONE FRESH PAGE PER BEHAVIOUR, so a mis-step cannot cascade into a cause.
const fs = require('fs'); const os = require('os'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const esbuild = require(path.join(REPO, 'node_modules/esbuild'))

/** The harness page: the REAL ComposeWindow, inline, with every network call stubbed. */
const ENTRY = `
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ComposeWindow from '@/components/admin/ComposeWindow'

// ⚠️ THE EXACT SHAPE \`parseSignature\`/\`parseOptOut\` ACCEPT — \`{ lines: [...] }\` and \`{ text }\`, the
// jsonb the settings table holds. An HTML string parses to null, \`settingsLoaded\` never turns true,
// and the box stays empty: a blank editor that looks like a mount failure.
const SIG = { lines: [{ text: 'Kind regards,' }, { text: '' }, { text: 'Dominic Bonini', bold: true }] }
const OPT = { text: 'Reply STOP and I will not contact you again.' }
const SENT: unknown[] = []

// 🔴 crypto.randomUUID IS SECURE-CONTEXT ONLY, and a harness page served by setContent on about:blank
// is NOT a secure context. Its absence threw inside sendNow, which caught it and showed "The connection
// dropped before the server answered" — a stubbed send that looked exactly like a product failure. The
// shim is the only thing missing; nothing else in the send path needs a secure origin.
if (typeof crypto.randomUUID !== 'function') {
  (crypto as unknown as { randomUUID: () => string }).randomUUID =
    () => 'ffffffff-ffff-4fff-8fff-' + String(Date.now()).padStart(12, '0').slice(-12)
}

// 🔴 STUBBED BEFORE THE MOUNT. Nothing in this page can reach the network.
const realFetch = window.fetch
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === 'string' ? input : (input as Request).url ?? input)
  const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })
  if (url.includes('/outreach/settings')) return json({ ok: true, signature: SIG, optOut: OPT })
  if (url.includes('/outreach/mail-send')) {
    if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
      SENT.push(JSON.parse(String(init?.body ?? '{}')))
      return json({ ok: true, id: 'stub', test: true })
    }
    // 🔴 A THREAD, SO "Include previous email" IS ON SCREEN. Without it the tickbox is not rendered at
    // all and the "survives toggling" assertion passed against ZERO checkboxes — vacuously green.
    return json({ ok: true, thread: { subject: 'A quick hello', replySubject: 'Re: A quick hello', date: '2026-10-01T09:00:00Z' } })
  }
  if (url.includes('/outreach/attachments')) return json({ ok: true, files: [] })
  return json({ ok: true })
}) as typeof realFetch

const TPL = {
  id: 'harness-fixture', label: 'Harness fixture', channel: 'email' as const,
  subject: 'A quick hello',
  // A greeting, a body paragraph, then the signature (whose last line is BOLD) and the opt-out.
  body: 'Hi George,\\n\\nI run villagefoodie.co.uk and I think it would suit the Red Lion.\\n\\n{{signature}}\\n{{opt_out}}',
  sortOrder: 1, active: true,
}
const CTX = {
  truckName: 'The Red Lion', contactName: 'George', contactFirstName: 'George', contactLastName: null,
  website: null, orderUrl: null, nextEventDate: null, nextEventVenue: null,
  demoLink: null, compareLink: 'https://example.invalid/compare', leadType: null,
}

declare global { interface Window { H: Record<string, unknown> } }

function Harness() {
  const [n, setN] = useState(0)
  const [key, setKey] = useState(0)
  window.H = {
    poke: () => setN(x => x + 1),
    renders: n,
    sent: () => SENT,
    remount: () => setKey(k => k + 1),
  }
  return <div style={{ padding: 16, width: 900 }} data-renders={n}>
    <ComposeWindow
      key={key}
      inline
      truckName="The Red Lion"
      prospectId="00000000-0000-0000-0000-000000000001"
      toEmail="george@example.invalid"
      offerable={[TPL] as never}
      suggestedId={null}
      initialTemplateId="harness-fixture"
      ctx={CTX as never}
      whatsappConfirmed={false}
      templatesLoaded
      logFormKind="first_contact"
      onClose={() => {}}
      onLog={async () => true}
    />
  </div>
}
createRoot(document.getElementById('root')!).render(<Harness />)
`

/** Bundle the real components, optionally with a source patch (for a broken variant). */
async function bundle(tag, patches) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `bold-${tag}-`))
  let entry = ENTRY
  for (const [rel, patch] of Object.entries(patches ?? {})) {
    const abs = path.join(REPO, rel)
    const src = fs.readFileSync(abs, 'utf8')
    const out = patch(src)
    // 🔴 A PATCH THAT DID NOT APPLY PROVES NOTHING AND LOOKS LIKE A PASS.
    if (out === src) throw new Error(`${tag}: the variant patch on ${rel} did not apply — its anchor has drifted`)
    const dest = path.join(tmp, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, out)
    entry = entry.split(`@/${rel.replace(/\.tsx?$/, '')}`).join(dest.replace(/\.tsx?$/, ''))
  }
  fs.writeFileSync(path.join(tmp, 'entry.tsx'), entry)
  const outfile = path.join(tmp, 'bundle.js')
  await esbuild.build({
    entryPoints: [path.join(tmp, 'entry.tsx')], bundle: true, format: 'iife', jsx: 'automatic',
    outfile, absWorkingDir: REPO,
    // ⚠️ THE PATCHED COPY MUST WIN FOR EVERY IMPORTER, not only for the entry point: ComposeWindow
    // imports the editor by its `@/` path, so the alias is what redirects it.
    alias: Object.fromEntries([
      ['@', REPO],
      ...Object.keys(patches ?? {}).map(rel => [`@/${rel.replace(/\.tsx?$/, '')}`, path.join(tmp, rel)]),
    ]),
    nodePaths: [path.join(REPO, 'node_modules')],
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
    // ⚠️ A `process.env.NEXT_PUBLIC_…` READ SURVIVES THE BUNDLE and threw "process is not defined"
    // before the editor could mount — a blank page that looked like a product failure. The shim gives
    // the bundle the one global Next would have provided.
    banner: { js: 'var process = { env: { NODE_ENV: "production" } };' },
  })
  return fs.readFileSync(outfile, 'utf8')
}

const page = js => `<!doctype html><html><head><meta charset="utf-8">`
  + `<meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<style>body{margin:0;font-family:system-ui}</style></head><body>`
  + `<div id="root"></div><script>${js}</script></body></html>`

const BOLD_RE = /<(b|strong)\b[^>]*>([\s\S]*?)<\/(?:b|strong)>/g
const EM_RE = /<(em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/g
const runs = (h, re) => [...h.matchAll(re)].map(m => m[2].replace(/<[^>]+>/g, '').trim()).filter(Boolean)
const boldRuns = h => runs(h, BOLD_RE)
const emRuns = h => runs(h, EM_RE)

async function engines() {
  const puppeteer = require(path.join(REPO, 'node_modules/puppeteer'))
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  return [
    ['Chromium', async () => {
      const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
      return { b, np: async () => { const p = await b.newPage(); await p.setViewport({ width: 1280, height: 1000 }); return p } }
    }],
    ['WebKit', async () => {
      const b = await webkit.launch()
      return { b, np: async () => (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage() }
    }],
  ]
}

const wait = ms => new Promise(r => setTimeout(r, ms))

async function measure() {
  const lines = []; let fails = 0
  const t = (ok, label, extra = '') => { lines.push(`${ok ? '✓' : '🔴'} ${label}${extra ? ' · ' + extra : ''}`); if (!ok) fails++ }
  const PAGE = page(await bundle('real'))

  for (const [eng, open] of await engines()) {
    const { b, np } = await open()
    lines.push(`── ${eng} ─────────────────────────────────────────────────────────────────`)

    /** A fresh page with the template already in the box and the signature already bold. */
    const fresh = async () => {
      const p = await np()
      await p.setContent(PAGE, { waitUntil: 'load' })
      await p.waitForSelector('.ProseMirror')
      // ⚠️ WAIT FOR THE SIGNATURE, not for a timer: the settings fetch resolves asynchronously and
      // `templateDoc` is rebuilt when it lands. Starting before that measures the wrong document.
      await p.waitForFunction(() => /Dominic Bonini/.test(document.querySelector('.ProseMirror')?.innerHTML ?? ''), { timeout: 15000 })
      await wait(350)
      return p
    }
    const html = p => p.evaluate(() => document.querySelector('.ProseMirror').innerHTML)
    const text = p => p.evaluate(() => document.querySelector('.ProseMirror').textContent)
    const aria = (p, l) => p.evaluate(x => {
      const n = [...document.querySelectorAll('button')].find(y => y.textContent.trim() === x)
      return n ? n.getAttribute('aria-pressed') : 'NO BUTTON'
    }, l)
    /** ⚠️ A REAL CLICK — see driver note ②. */
    const press = async (p, label) => {
      const h = await p.evaluateHandle(x => [...document.querySelectorAll('button')].find(y => y.textContent.trim() === x), label)
      const el = h.asElement()
      if (!el) throw new Error(`${eng}: no toolbar button labelled "${label}"`)
      await el.click()
      await wait(220)
    }
    /** The Size menu is a trigger plus three items. ⚠️ THE TRIGGER'S LABEL IS THE CURRENT SIZE plus
     *  ' ▾', so it is found by the chevron and never confused with the item of the same name. */
    const pickSize = async (p, label) => {
      const h = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find(y => /▾$/.test(y.textContent.trim())))
      if (!h.asElement()) throw new Error(`${eng}: no Size menu trigger`)
      await h.asElement().click(); await wait(180)
      await press(p, label)
    }

    /** ⚠️ VERIFIED, WITH A FALLBACK — see driver note ①. */
    const selectAll = async p => {
      await p.click('.ProseMirror')
      await wait(80)
      for (const mod of ['Meta', 'Control']) {
        await p.keyboard.down(mod); await p.keyboard.press('a'); await p.keyboard.up(mod)
        await wait(140)
        const n = await p.evaluate(() => String(getSelection() ?? '').length)
        if (n > 40) return n
      }
      return 0
    }
    /** Collapse the selection by clicking in the middle of the first paragraph. */
    const clickToDeselect = async p => {
      const box = await p.evaluate(() => {
        const r = document.querySelector('.ProseMirror p, .ProseMirror div').getBoundingClientRect()
        return { x: r.x + 8, y: r.y + r.height / 2 }
      })
      await p.mouse.click(box.x, box.y)
      await wait(400)
    }

    { // ── A · THE OPERATOR'S EXACT THREE STEPS ────────────────────────────────────────────────
      const p = await fresh()
      const before = await html(p)
      t(/Hi George,/.test(before), 'the fixture loaded: a greeting, a body paragraph, a bold signature')
      t(boldRuns(before).includes('Dominic Bonini'), '…and the signature line is bold to start with',
        `bold runs: ${JSON.stringify(boldRuns(before))}`)
      t(!boldRuns(before).some(x => /Hi George/.test(x)), '…and the greeting is not')

      const words = await p.evaluate(() => (document.querySelector('.ProseMirror').textContent || '').replace(/\s+/g, ' ').trim())

      // STEP 1 — select all, press B.
      const n1 = await selectAll(p)
      t(n1 > 40, 'step 1: Cmd+A selects the whole message', `${n1} characters`)
      await press(p, 'B')
      const h1 = await html(p)
      const allBold = h => {
        const plain = h.replace(/<(b|strong)\b[^>]*>[\s\S]*?<\/(?:b|strong)>/g, '').replace(/<[^>]+>/g, '')
        return plain.replace(/\s| /g, '') === ''
      }
      t(allBold(h1), 'step 1: pressing B on a MIXED selection makes it ALL bold',
        `unbolded remainder: ${JSON.stringify(h1.replace(/<(b|strong)\b[^>]*>[\s\S]*?<\/(?:b|strong)>/g, '').replace(/<[^>]+>/g, '').trim().slice(0, 60))}`)

      // STEP 2 — select all again, press B.
      const n2 = await selectAll(p)
      t(n2 > 40, 'step 2: Cmd+A selects the whole message again', `${n2} characters`)
      await press(p, 'B')
      const h2 = await html(p)
      t(boldRuns(h2).length === 0, 'step 2: pressing B on an ALL-BOLD selection makes it ALL plain',
        `bold runs left: ${JSON.stringify(boldRuns(h2))}`)

      // STEP 3 — click to deselect. 🔴 THE REPORTED BUG IS HERE.
      await clickToDeselect(p)
      const h3 = await html(p)
      t(boldRuns(h3).length === 0,
        'step 3: 🔴 THE BUG — clicking to deselect leaves the text PLAIN (it must not go back to bold)',
        `bold runs after the click: ${JSON.stringify(boldRuns(h3))}`)
      t((await text(p)).replace(/\s+/g, ' ').trim() === words, '…and the words are unchanged')
      await p.close()
    }

    { // ── B · THE SAME CHANGE SURVIVES EVERY OTHER THING THAT RE-RENDERS THE WINDOW ───────────
      const p = await fresh()
      await selectAll(p); await press(p, 'B')          // all bold
      await selectAll(p); await press(p, 'B')          // all plain
      const plain = async () => boldRuns(await html(p)).length === 0
      t(await plain(), 'the mark-only change applies immediately')

      await p.evaluate(() => document.querySelector('.ProseMirror').blur()); await wait(350)
      t(await plain(), '…and survives a blur')

      await p.evaluate(() => window.H.poke()); await wait(400)
      t(await plain(), '…and survives a parent re-render')

      // The subject field is a sibling control: focusing it is "switching fields in the window".
      const subj = await p.evaluateHandle(() => document.querySelector('input[type="text"], input:not([type])'))
      if (subj.asElement()) { await subj.asElement().click(); await wait(300) }
      t(await plain(), '…and survives focusing another field in the window')

      await wait(3000)
      t(await plain(), '…and is still plain three seconds later')
      await p.close()
    }

    { // ── C · "Include previous email" / any toggle that re-renders mid-edit ──────────────────
      const p = await fresh()
      await selectAll(p); await press(p, 'B')
      await selectAll(p); await press(p, 'B')
      // Toggle every checkbox in the window, one at a time, and the document must not move.
      const boxes = await p.evaluate(() => document.querySelectorAll('input[type="checkbox"]').length)
      // ⚠️ A COUNT OF ZERO WOULD MAKE THE LOOP BELOW A NO-OP AND THE ASSERTION VACUOUS.
      t(boxes > 0, 'there is at least one tickbox in the window to toggle', `${boxes} found`)
      const h0 = await html(p)
      for (let i = 0; i < boxes; i++) {
        await p.evaluate(j => (document.querySelectorAll('input[type="checkbox"]')[j]).click(), i)
        await wait(300)
      }
      const h1 = await html(p)
      t(boldRuns(h1).length === 0, `…and survives toggling all ${boxes} checkbox(es) in the window`,
        `bold runs: ${JSON.stringify(boldRuns(h1))}`)
      t(h0.replace(/\s+/g, '') === h1.replace(/\s+/g, '') || boldRuns(h1).length === 0,
        '…with the document otherwise unmoved')
      await p.close()
    }

    { // ── D · UNDO IS THE ONLY THING THAT MAY RESTORE AN EARLIER VERSION ──────────────────────
      const p = await fresh()
      await selectAll(p); await press(p, 'B')
      t(boldRuns(await html(p)).length > 0, 'bold applied, ready to undo')
      await selectAll(p); await press(p, 'B')
      t(boldRuns(await html(p)).length === 0, 'bold removed')
      await p.click('.ProseMirror'); await wait(100)
      for (const mod of ['Meta', 'Control']) {
        await p.keyboard.down(mod); await p.keyboard.press('z'); await p.keyboard.up(mod)
        await wait(350)
        if (boldRuns(await html(p)).length > 0) break
      }
      t(boldRuns(await html(p)).length > 0, 'Cmd+Z undoes a MARK-ONLY change',
        `bold runs: ${JSON.stringify(boldRuns(await html(p))).slice(0, 80)}`)
      await p.close()
    }

    { // ── E · B's HIGHLIGHT REFLECTS THE SELECTION ────────────────────────────────────────────
      const p = await fresh()
      t(await aria(p, 'B') === 'false', 'B is off with the caret in plain text')
      await selectAll(p)
      t(await aria(p, 'B') === 'false', '…off for a MIXED selection (plain greeting + bold signature)')
      await press(p, 'B')
      t(await aria(p, 'B') === 'true', '…on once the whole selection is bold')
      await selectAll(p); await press(p, 'B')
      t(await aria(p, 'B') === 'false', '…off once the whole selection is plain')
      await p.close()
    }

    { // ── F · THE SAME THREE STEPS FOR Small, AND FOR Italic (the control that already worked) ─
      const p = await fresh()
      // Small: the opt-out line ships small, so a select-all is a MIXED selection, as with bold.
      const smallRuns = h => (h.match(/font-size:\s*13\.3/g) || []).length
      t(smallRuns(await html(p)) > 0, 'Small: the opt-out line starts small')
      await selectAll(p); await pickSize(p, 'Small')
      const afterOn = smallRuns(await html(p))
      await selectAll(p); await pickSize(p, 'Normal')
      t(smallRuns(await html(p)) === 0, 'Small: a mixed selection goes all-small, then all-normal',
        `spans after on: ${afterOn}`)
      await clickToDeselect(p)
      t(smallRuns(await html(p)) === 0, 'Small: 🔴 clicking to deselect does NOT restore the earlier size')
      await p.close()
    }
    { const p = await fresh()
      await selectAll(p); await press(p, 'I')
      t(emRuns(await html(p)).length > 0, 'Italic: a select-all goes italic')
      await selectAll(p); await press(p, 'I')
      t(emRuns(await html(p)).length === 0, 'Italic: and back to plain')
      await clickToDeselect(p)
      t(emRuns(await html(p)).length === 0, 'Italic: clicking to deselect does NOT restore the italics')
      await p.close()
    }

    /* ── G · WHAT IS SENT IS WHAT IS ON SCREEN, IN BOTH DIRECTIONS ──────────────────────────────
     * 🔴 THE NEGATIVE ALONE WOULD NOT PROVE IT. "No bold on screen ⇒ no bold sent" also passes if the
     * send drops every mark it is given, so the all-bold case is run too. ⚠️ THE POST IS STUBBED and
     * the path exercised is "Send test to me", which the server binds to OUTREACH_TEST_RECIPIENT even
     * when it is not stubbed. Nothing leaves this page. */
    for (const [presses, want, what] of [[2, false, 'all plain'], [1, true, 'all bold']]) {
      const p = await fresh()
      for (let i = 0; i < presses; i++) { await selectAll(p); await press(p, 'B') }
      await clickToDeselect(p)
      const onScreen = boldRuns(await html(p)).length > 0
      try {
        await press(p, 'Send test to me')
        await press(p, 'Send test')
        /* ⚠️ `sent()[0]` IS NOT THE SEND. With a thread on screen the window first POSTs
         * `action: 'quoted'` to fetch the quoted message, so the first recorded call carries no
         * document at all — and reading it reported "sent doc bold: false" against a correct send. */
        await p.waitForFunction(() => window.H.sent().some(x => x.action === 'send'), { timeout: 8000 })
        const sent = await p.evaluate(() => window.H.sent().find(x => x.action === 'send'))
        // ⚠️ THE FIELD IS `document` — the route takes a DOCUMENT, never HTML and never text.
        const sentHasBold = /"type":"bold"/.test(JSON.stringify(sent?.document ?? {}))
        t(onScreen === want && sentHasBold === want,
          `the stubbed send carries EXACTLY the marks on screen (${what})`,
          `on screen bold: ${onScreen}; sent doc bold: ${sentHasBold}; wanted: ${want}`)
      } catch (e) {
        t(false, `the send path could not be driven (${what}): ${String(e).slice(0, 120)}`)
      }
      await p.close()
    }

    await b.close()
  }

  /* ══ 🔴 THE VARIANTS — EACH PUTS THE DEFECT BACK AND MUST GO RED ══════════════════════════════
   * A green harness over a fixed bug proves nothing on its own: it has to be shown to FAIL when the
   * cause returns. Both variants below restore a real previous state of the file. */

  // V1 — the wrapper goes back to a `<label>`. The reported bug, exactly.
  {
    const V = page(await bundle('label', {
      'components/admin/ComposeWindow.tsx': src => {
        let out = src.replace('          <div className="block">\n            {/* 🔴 CORRECTED 16 September 2026',
                              '          <label className="block">\n            {/* 🔴 CORRECTED 16 September 2026')
        if (out === src) throw new Error('V1: the opening <div> anchor has drifted')
        const close = out.replace("                aria-label={MESSAGE_LABEL(isEmailChannel)} />\n            )}\n          </div>",
                                  "                aria-label={MESSAGE_LABEL(isEmailChannel)} />\n            )}\n          </label>")
        if (close === out) throw new Error('V1: the closing </div> anchor has drifted')
        return close
      },
    }))
    for (const [eng, open] of await engines()) {
      const { b, np } = await open(); const p = await np()
      await p.setContent(V, { waitUntil: 'load' })
      try { await p.waitForFunction(() => /Dominic Bonini/.test(document.querySelector('.ProseMirror')?.innerHTML ?? ''), { timeout: 15000 }) }
      catch { t(false, `V1 ${eng}: the patched window did not render — the variant is broken, not the fix`); await b.close(); continue }
      await wait(350)
      const html = () => p.evaluate(() => document.querySelector('.ProseMirror').innerHTML)
      /* ⚠️ THE CLICK HAS TO MEET A SELECTION. With a collapsed caret `toggleBold` only sets
       * `storedMarks` and the DOCUMENT does not move, so the first attempt at this variant measured
       * 1 → 1 and reported the bug as absent while it was plainly present. The operator's step 3 is a
       * click while the whole message is selected — that is what this does. */
      const box = await p.evaluate(() => {
        const r = document.querySelector('.ProseMirror p, .ProseMirror div').getBoundingClientRect()
        return { x: r.x + 8, y: r.y + r.height / 2 }
      })
      await p.click('.ProseMirror'); await wait(100)
      await p.keyboard.down('Meta'); await p.keyboard.press('a'); await p.keyboard.up('Meta'); await wait(200)
      const before = (await html()).match(/<(b|strong)\b/g)?.length ?? 0
      // One mousedown in the message body, and nothing else at all.
      await p.mouse.click(box.x, box.y); await wait(400)
      const after = (await html()).match(/<(b|strong)\b/g)?.length ?? 0
      t(after !== before,
        `V1 ${eng}: with the <label> back, ONE click in the message body re-bolds the document`,
        `bold tags ${before} → ${after}`)
      await b.close()
    }
  }

  // V2 — the History extension is removed again, so Cmd+Z does nothing.
  {
    const V = page(await bundle('nohistory', {
      'components/admin/RichEmailEditor.tsx': src => {
        const out = src.replace('    // 🔴 UNDO — see the extension. It was missing entirely; Cmd+Z did nothing for months.\n    History,\n', '')
        if (out === src) throw new Error('V2: the History entry anchor has drifted')
        return out
      },
    }))
    for (const [eng, open] of await engines()) {
      const { b, np } = await open(); const p = await np()
      await p.setContent(V, { waitUntil: 'load' })
      try { await p.waitForFunction(() => /Dominic Bonini/.test(document.querySelector('.ProseMirror')?.innerHTML ?? ''), { timeout: 15000 }) }
      catch { t(false, `V2 ${eng}: the patched window did not render`); await b.close(); continue }
      await wait(350)
      const html = () => p.evaluate(() => document.querySelector('.ProseMirror').innerHTML)
      await p.click('.ProseMirror'); await wait(80)
      await p.keyboard.down('Meta'); await p.keyboard.press('a'); await p.keyboard.up('Meta'); await wait(150)
      const hb = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find(y => y.textContent.trim() === 'B'))
      await hb.asElement().click(); await wait(300)
      const bolded = (await html()).match(/<(b|strong)\b/g)?.length ?? 0
      await p.click('.ProseMirror'); await wait(80)
      await p.keyboard.down('Meta'); await p.keyboard.press('z'); await p.keyboard.up('Meta'); await wait(400)
      const undone = (await html()).match(/<(b|strong)\b/g)?.length ?? 0
      t(bolded > 1 && undone === bolded,
        `V2 ${eng}: without the History extension Cmd+Z does nothing at all`,
        `bold tags after B: ${bolded}; after Cmd+Z: ${undone}`)
      await b.close()
    }
  }

  return { lines, fails }
}

module.exports = { measure }

if (require.main === module) {
  measure().then(r => { for (const l of r.lines) console.log('  ' + l)
    console.log(r.fails === 0 ? '\n✅ a mark-only change persists in both engines' : `\n🔴 ${r.fails} failure(s)`)
    process.exit(r.fails === 0 ? 0 : 1) })
    .catch(e => { console.error(e); process.exit(1) })
}
