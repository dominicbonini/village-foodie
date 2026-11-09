// scripts/_lp-jp-nav-1.cjs — jp-nav-1's one deliberate change to the marketing pages, as a precise transform for the harnesses that
// compare a page with a tree from before it (9 November 2026; docs/compare-ux-1-report.md §12). scripts/jp-nav-1.cjs proves the change
// and that it is the only zero-width space in any messages file.
//
//   noBreak(html)   the Japanese nav label's break opportunity taken out: "メニューを" + U+200B + "アップロード" → "メニューをアップロード"
//                   — a no-op on any page that is not Japanese
//   cssAsBefore(css) landing.css with jp-nav-2's Japanese-only nav rules taken out (9 November 2026: "ログイン" never shrinks below its
//                   text; below 360px the Japanese nav tightened) — exactly its comment-and-rule in the ≤639px block and its own ≤359px
//                   block, so every other byte is still compared
'use strict'

const noBreak = h => String(h).split('メニューを​アップロード').join('メニューをアップロード')

const JP2_IN_639 = /  \/\* jp-nav-2 \(9 November 2026\): Japanese's "ログイン" may not shrink[\s\S]*?\n  :root:lang\(ja\) \.hg-landing \.nav-only-sm \{ flex-shrink: 0; \}\n/
const JP2_359 = /\/\* jp-nav-2: below 360px a Japanese nav is tightened[\s\S]*?\*\/\n@media\(max-width:359px\)\{\n  :root:lang\(ja\) \.hg-landing \.nav-in \{ gap: \.5rem; \}\n  :root:lang\(ja\) \.hg-landing \.nav-cta \{ padding-inline: \.35rem; \}\n  :root:lang\(ja\) \.hg-landing \.nav-only-sm \{ padding-inline: \.25rem; \}\n\}\n/
const cssAsBefore = css => String(css).replace(JP2_IN_639, '').replace(JP2_359, '')

module.exports = { noBreak, cssAsBefore }
