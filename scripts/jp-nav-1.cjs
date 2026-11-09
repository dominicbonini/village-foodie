#!/usr/bin/env node
// scripts/jp-nav-1.cjs — jp-nav-1 (9 November 2026; docs/compare-ux-1-report.md §12). The Japanese nav button at phone widths. Japanese
// and Chinese labels wrap only where the label has a break opportunity (`word-break: keep-all`, world-countries-1, so "ログイン" never
// splits as "ログイ / ン"), and "メニューをアップロード" had none — so below 640px the button could not wrap and every JP page but the
// landing scrolled sideways at 320–390px. The fix is ONE invisible break opportunity in the Japanese label: a zero-width space after
// "メニューを". Proves, against the real messages, stylesheet and component (no network, no build):
//   1 · ja-JP's short CTA is "メニューを" + U+200B + "アップロード" (and its generated namespace file the same); no other language's nav
//       label, and no other Japanese string, gained a zero-width space
//   2 · the rule that makes it the ONLY break is still there: keep-all for ja / zh below 640px, labels allowed to wrap on non-English pages
//   3 · the nav renders the label with the break, in the short span only (the full label, from 640px, is unchanged)
//   jp-nav-2 (9 November 2026, in §2): "ログイン" never shrinks below its text on a Japanese page, and below 360px the Japanese nav is
//       tightened (gap and side padding, never the text size) — Japanese only
// The pixels (before / after at 320, 360, 375, 390; every other country's screens identical): scripts/jp-nav-1-shots.cjs, by hand.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'jp-nav-1' })
const REPO = kit.REPO

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const leaves = (o, p = '') => Object.entries(o ?? {}).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, p ? `${p}.${k}` : k) : [[p ? `${p}.${k}` : k, v]]))
const ZW = '​'

;(async () => {
  console.log('── 1 · the label')
  const ja = JSON.parse(read('messages/ja-JP.json'))
  t('ja-JP landingNav.ctaShort is "メニューを" + U+200B + "アップロード"', ja.landingNav.ctaShort === `メニューを${ZW}アップロード`, ja.landingNav.ctaShort)
  t('…and the generated namespace file says the same', JSON.parse(read('messages/ns/ja-JP/landingNav.json')).ctaShort === `メニューを${ZW}アップロード`)
  t('…the full label (from 640px) is unchanged: "メニューをアップロード →"', ja.landingNav.cta === 'メニューをアップロード →')
  const jaOthers = leaves(ja).filter(([k, v]) => typeof v === 'string' && v.includes(ZW) && k !== 'landingNav.ctaShort').map(([k]) => k)
  t('no other Japanese string has a zero-width space', !jaOthers.length, jaOthers)
  const others = fs.readdirSync(path.join(REPO, 'messages')).filter(f => f.endsWith('.json') && f !== 'ja-JP.json').filter(f => read(`messages/${f}`).includes(ZW) || /\\u200[bB]/.test(read(`messages/${f}`)))
  t('no other language\'s messages file has one', !others.length, others)

  console.log('\n── 2 · the rule that makes it the only break')
  const css = read('app/(public)/(site)/landing/landing.css')
  const block = /@media\(max-width:639px\)\{[\s\S]*?\n\}/.exec(css)?.[0] ?? ''
  t('below 640px a non-English page\'s nav buttons may wrap (white-space: normal)', /:root:not\(:lang\(en\)\) \.hg-landing \.nav-r \.btn \{ white-space: normal;/.test(block))
  t('…and Japanese and Chinese keep words whole (keep-all) — "ログイン" never splits', /:root:is\(:lang\(ja\), :lang\(zh\)\) \.hg-landing \.nav-r \.btn \{ word-break: keep-all; \}/.test(block))
  // jp-nav-2 (9 November 2026): "ログイン" never shrinks below its text on a Japanese page; below 360px the Japanese nav is tightened
  // (gap, side padding — never the text size) so the two-line button's label stays inside the button. Japanese only.
  t('jp-nav-2: on a Japanese page "ログイン" never shrinks below its text (flex-shrink: 0, below 640px)', /:root:lang\(ja\) \.hg-landing \.nav-only-sm \{ flex-shrink: 0; \}/.test(block))
  const b359 = /@media\(max-width:359px\)\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
  t('jp-nav-2: below 360px a Japanese nav tightens its gap and side padding, never its text size', /:root:lang\(ja\) \.hg-landing \.nav-in \{ gap: \.5rem; \}/.test(b359) && /:root:lang\(ja\) \.hg-landing \.nav-cta \{ padding-inline: \.35rem; \}/.test(b359) && /:root:lang\(ja\) \.hg-landing \.nav-only-sm \{ padding-inline: \.25rem; \}/.test(b359) && !/font-size/.test(b359))
  const jpRules = (css.match(/[^{}]*:lang\(ja\)[^{}]*\{[^{}]*\}/g) || []).map(r => r.trim().replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
  t('jp-nav-2: every rule it added names :lang(ja) alone — no other language matches it', jpRules.filter(r => /nav-only-sm|nav-in|nav-cta/.test(r) && !/:is\(/.test(r)).every(r => /^:root:lang\(ja\) /.test(r)) && jpRules.filter(r => /nav-only-sm|nav-in \{|nav-cta \{/.test(r)).length === 4, jpRules)

  console.log('\n── 3 · the nav renders it')
  const M = await kit.bundle('jp-nav-1', "export { LandingNav } from '@/components/landing/LandingNav'\nexport { DemoModalProvider } from '@/components/landing/DemoUpload'")
  const nav = locale => kit.renderStatic(kit.h(M.DemoModalProvider, null, kit.h(M.LandingNav, { locale })))   // as the page wraps it
  const html = nav('ja-JP')
  t('the short span carries the break; the full span does not', html.includes(`<span class="cta-short">メニューを${ZW}アップロード</span>`) && html.includes('<span class="cta-full">メニューをアップロード →</span>'), (/<span class="cta-[^<]*<\/span>/g.exec(html) || [''])[0])
  const en = nav('en-GB')
  t('an English nav has no zero-width space', !en.includes(ZW))

  console.log(`\n${fail ? '🔴' : '✅'} jp-nav-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
