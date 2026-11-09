// scripts/_lp-jp-nav-1.cjs — jp-nav-1's one deliberate change to the marketing pages, as a precise transform for the harnesses that
// compare a page with a tree from before it (9 November 2026; docs/compare-ux-1-report.md §12). scripts/jp-nav-1.cjs proves the change
// and that it is the only zero-width space in any messages file.
//
//   noBreak(html)   the Japanese nav label's break opportunity taken out: "メニューを" + U+200B + "アップロード" → "メニューをアップロード"
//                   — a no-op on any page that is not Japanese
'use strict'

const noBreak = h => String(h).split('メニューを​アップロード').join('メニューをアップロード')

module.exports = { noBreak }
