#!/usr/bin/env node
// scripts/partners-1-screens.cjs — Admin › Partners (partners-1) in a real browser, FIXTURE DATA ONLY.
//   node scripts/partners-1-screens.cjs
//
// The REAL tab (components/admin/PartnersTab.tsx) is bundled for the browser with the app's own Tailwind CSS
// (app/globals.css through @tailwindcss/postcss), and every fetch is answered here from fixtures — no dev server, no
// database, no mailbox, nothing leaves the machine. A send is never made: the compose window is opened, not sent.
// Writes docs/partners-1/<engine>-<shot>-<width>.png at a laptop (1440×900) and a large monitor (2560×1440), and FAILS
// if a page scrolls sideways, logs an error, or a shot's marker is missing.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const os = require('os'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const OUT = path.join(REPO, 'docs/partners-1')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 600)}` : '')) } }

const day = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const base = { region: null, website: null, contact_role: null, phone: null, linkedin_url: null, source: null, offered: null, outcome: null, notes: null,
  last_contacted_at: null, last_reply_at: null, created_at: '2026-11-01T09:00:00Z', updated_at: '2026-11-01T09:00:00Z' }
const PARTNERS = [
  { ...base, id: 'p1', name: 'Nationwide Caterers Association', type: 'association', country_code: 'GB', region: 'UK-wide', website: 'ncass.org.uk', contact_name: 'Sam Patel', contact_role: 'Membership lead',
    email: 'sam@assoc.example', phone: '0121 000 0000', source: 'Trade show, Oct 2026', status: 'replied', priority: 'high', next_follow_up_on: day(0),
    offered: '3 months free for members, a co-branded guide', outcome: null, notes: 'Wants numbers on how many members already take card payments.', last_contacted_at: '2026-11-03T10:05:00Z', last_reply_at: '2026-11-04T08:40:00Z' },
  { ...base, id: 'p2', name: 'Foodies Festival', type: 'organiser', country_code: 'GB', contact_name: 'Jo Lee', email: 'jo@festival.example', status: 'contacted', priority: 'high', next_follow_up_on: day(-3) },
  { ...base, id: 'p3', name: 'Street Food Ireland', type: 'association', country_code: 'IE', contact_name: 'Aoife Byrne', email: 'aoife@sfi.example', status: 'to_contact', priority: 'medium', next_follow_up_on: day(2) },
  { ...base, id: 'p4', name: 'Mobile Kitchen Consultants', type: 'consultant', country_code: 'GB', email: 'hello@mkc.example', status: 'in_talks', priority: 'medium', next_follow_up_on: day(7) },
  { ...base, id: 'p5', name: 'Van Fit-Out Co', type: 'supplier', country_code: 'GB', email: null, status: 'to_contact', priority: 'low', next_follow_up_on: null },
  { ...base, id: 'p6', name: 'Eat Local Directory', type: 'directory', country_code: 'AU', email: 'list@eatlocal.example', status: 'partner', priority: 'low', next_follow_up_on: day(30) },
  { ...base, id: 'p7', name: 'Food Trade Weekly', type: 'press', country_code: 'GB', email: 'news@ftw.example', status: 'not_now', priority: 'low', next_follow_up_on: day(60) },
]
const MESSAGES = [
  { id: 'e3', direction: 'inbound', status: 'received', is_test: false, source: 'poll', subject: 'Re: HatchGrab for NCASS members', from_address: 'sam@assoc.example', to_address: 'dominic@hatchgrab.com',
    message_date: '2026-11-04T08:40:00Z', created_at: '2026-11-04T08:40:00Z', preview: 'Thanks Dominic — this is interesting. Could you send numbers on how many of our members already take card payments?', has_body: true, attachment_count: 0 },
  { id: 'e2', direction: 'outbound', status: 'sent', is_test: false, source: 'system', subject: 'HatchGrab for NCASS members', from_address: 'dominic@hatchgrab.com', to_address: 'sam@assoc.example',
    message_date: '2026-11-03T10:05:00Z', created_at: '2026-11-03T10:05:00Z', preview: 'Hi Sam, good to meet you at the trade show. As promised, here is the idea: three months free for your members…', has_body: true, attachment_count: 1 },
]
const EVENTS = [
  { id: 'v2', kind: 'status', body: null, from_status: 'contacted', to_status: 'replied', created_at: '2026-11-04T08:41:00Z' },
  { id: 'v1', kind: 'status', body: null, from_status: 'to_contact', to_status: 'contacted', created_at: '2026-11-03T10:05:01Z' },
  { id: 'v0', kind: 'note', body: 'Met Sam at the trade show — keen, but wants proof members will use it.', from_status: null, to_status: null, created_at: '2026-10-28T16:00:00Z' },
]
const EMAIL_HTML = '<div style="font-family:Aptos,Arial,sans-serif;font-size:12pt"><p>Thanks Dominic — this is interesting.</p><p>Could you send numbers on how many of our members already take card payments? If we can show that, I can put it in the December newsletter.</p><p>Best,<br>Sam</p></div>'

async function css() {
  const postcss = (await import(path.join(REPO, 'node_modules/postcss/lib/postcss.mjs'))).default
  const tw = (await import(require.resolve('@tailwindcss/postcss', { paths: [REPO] }))).default
  const from = path.join(REPO, 'app/globals.css')
  const r = await postcss([tw({ base: REPO })]).process(fs.readFileSync(from, 'utf8').replace(/@import "leaflet[^"]*";/, ''), { from })
  return r.css
}

async function bundle() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-partners1s-'))
  const entry = path.join(dir, 'entry.tsx')
  fs.writeFileSync(entry, `import { createRoot } from 'react-dom/client'
import PartnersTab from '@/components/admin/PartnersTab'
const PARTNERS = ${JSON.stringify(PARTNERS)}
const DETAIL = { ok: true, messages: ${JSON.stringify(MESSAGES)}, events: ${JSON.stringify(EVENTS)} }
if (typeof crypto.randomUUID !== 'function') { (crypto as unknown as { randomUUID: () => string }).randomUUID = () => 'ffffffff-ffff-4fff-8fff-000000000001' }
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === 'string' ? input : (input as Request).url ?? input)
  const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })
  if (url.includes('/outreach/settings')) return json({ ok: true, signature: { lines: [{ text: 'Kind regards,' }, { text: 'Dominic' }, { text: '' }, { text: 'Dominic Bonini', bold: true }, { text: 'Founder, HatchGrab' }] }, optOut: { text: 'Reply no thanks and I will not contact you again.' } })
  if (url.includes('/outreach/mail-send')) return json({ ok: true, from: 'sam@assoc.example', subject: 'Re: HatchGrab for NCASS members', attachments: [], html: ${JSON.stringify(EMAIL_HTML)}, text: null })
  if (url.startsWith('/api/admin/partners?id=')) { const id = new URL(url, 'http://x').searchParams.get('id'); return json({ ...DETAIL, partner: PARTNERS.find((p: { id: string }) => p.id === id), ...(id === 'p1' ? {} : { messages: [], events: [] }) }) }
  if (url === '/api/admin/partners') return json({ ok: true, partners: PARTNERS })
  if ((init?.method ?? 'GET').toUpperCase() === 'POST') throw new Error('the screenshot run never posts')
  return json({ ok: true })
}) as typeof window.fetch
createRoot(document.getElementById('root')!).render(<div className="w-full px-8 py-4"><PartnersTab /></div>)
setTimeout(() => document.documentElement.setAttribute('data-ready', '1'), 500)`)
  const r = await esbuild.build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2020', logLevel: 'error',
    alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')], define: { 'process.env.NODE_ENV': '"production"' }, banner: { js: 'window.process = window.process || { env: {} };' } })
  fs.rmSync(dir, { recursive: true, force: true })
  return r.outputFiles[0].text
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const [styles, js] = await Promise.all([css(), bundle()])
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><style>body{background:#F8FAFC;margin:0;font-family:-apple-system,system-ui,sans-serif}</style></head><body><div style="height:96px;background:#0f172a"></div><div id="root"></div><script>${js.replace(/<\/script>/g, '<\\/script>')}</script></body></html>`
  const pw = require(path.join(REPO, 'node_modules/playwright'))
  for (const engine of ['chromium', 'webkit']) {
    const browser = await pw[engine].launch()
    try {
      for (const [width, height, label] of [[1440, 900, 'laptop'], [2560, 1440, 'monitor']]) {
        const ctx = await browser.newContext({ viewport: { width, height } })
        const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message))
        await page.setContent(html, { waitUntil: 'load' }); await page.waitForSelector('html[data-ready]'); await page.waitForSelector('[data-partner-row]')
        const shot = name => path.join(OUT, `${engine}-${name}-${width}.png`)
        const sideways = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
        // 1 · the list and the selected organisation with its timeline
        await page.locator('[data-partner-row]', { hasText: 'Nationwide Caterers' }).click()
        await page.waitForSelector('[data-timeline-email]')
        const a = await page.evaluate(() => ({ rows: document.querySelectorAll('[data-partner-row]').length, emails: document.querySelectorAll('[data-timeline-email]').length,
          events: document.querySelectorAll('[data-timeline-event]').length, write: !!document.querySelector('[data-write-email]'), note: !!document.querySelector('[data-add-note]'),
          writeVisible: (() => { const r = document.querySelector('[data-write-email]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })() }))
        t(`${engine} ${label}: 7 partners listed; 2 emails + 3 events on the timeline; Write email and Add note on screen; no sideways scroll`,
          a.rows === 7 && a.emails === 2 && a.events === 3 && a.write && a.note && a.writeVisible && !(await sideways()) && !errors.length, { ...a, errors })
        await page.screenshot({ path: shot('detail') })
        // 2 · the Due filter
        await page.click('[data-due-filter]')
        const due = await page.evaluate(() => document.querySelectorAll('[data-partner-row]').length)
        t(`${engine} ${label}: Due shows the 2 partners due today or overdue`, due === 2, due)
        await page.click('[data-due-filter]')
        // 3 · Write email — the free-form composer, inline above the timeline
        await page.click('[data-write-email]')
        await page.waitForFunction(() => /Dominic Bonini/.test(document.querySelector('[data-partner-compose] .ProseMirror')?.innerHTML ?? ''))
        const c = await page.evaluate(() => {
          const box = document.querySelector('[data-partner-compose]')
          const ed = box.querySelector('.ProseMirror').getBoundingClientRect()
          return { template: /\bTemplate\b/.test(box.innerText), plans: /Plans PDF/.test(box.innerText), editorH: Math.round(ed.height), editorW: Math.round(ed.width) }
        })
        t(`${engine} ${label}: the composer has no Template chips or Plans PDF; the editor is ${c.editorW}×${c.editorH}px`, !c.template && !c.plans && c.editorW > 600 && !(await sideways()), c)
        await page.screenshot({ path: shot('compose') })
        // 4 · the reply, read in the reading panel
        await page.locator('[data-timeline-email]', { hasText: 'Re: HatchGrab for NCASS members' }).click()
        await page.waitForSelector('aside[role="dialog"] iframe')
        await page.waitForTimeout(400)
        const r = await page.evaluate(() => { const a = document.querySelector('aside[role="dialog"]'); return { w: Math.round(a.getBoundingClientRect().width), reply: /Reply/.test(a.innerText) } })
        t(`${engine} ${label}: the reply opens in the reading panel (${r.w}px wide) with a Reply button`, r.reply && r.w > 600 && !errors.length, { ...r, errors })
        await page.screenshot({ path: shot('reading') })
        await ctx.close()
      }
    } finally { await browser.close() }
  }
  console.log(fail === 0 ? `\n✅ ${pass} checks — screenshots in docs/partners-1/` : `\n🔴 ${fail} failure(s)`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.log(`🔴 ${e && e.stack || e}`); process.exit(1) })
