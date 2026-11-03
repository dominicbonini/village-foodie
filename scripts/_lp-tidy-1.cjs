// scripts/_lp-tidy-1.cjs — tidy-1's named change to the public truck page ON THE HATCHGRAB HOST (3 November 2026; docs/tidy-1-report.md),
// for the harnesses that compare that page with a tree from before it. scripts/tidy-1.cjs §1 proves it, and that Village Foodie's truck
// page is byte-identical.
//
//   hgTruck(html)   the truck page as served on hatchgrab.com before tidy-1 → as served after it: the Tally script goes, and where Village
//                   Foodie's prompts showed (a UK truck), so do the floating weekly-schedule button and the footer's newsletter block
//                   (its title, text, call to action and "no spam" line) — every piece exactly once, or it throws. The footer's links stay.
//   ITEMS           for the harnesses that list named items per view (1e, 1e-tidy): parts/truck|<CC>|html* — PRECISE (hgTruck)
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const TALLY_SCRIPT = '<script data-src="https://tally.so/widgets/embed.js" data-strategy="afterInteractive"></script>'
const FLOATING = /<div class="fixed bottom-6 left-0 right-0 flex justify-center z-40 pointer-events-none"><button class="pointer-events-auto[^"]*">[\s\S]*?<\/button><\/div>/g
const NEWSLETTER = /<h3 class="text-white font-bold text-lg mb-2">[^<]*<\/h3><p class="text-sm mb-4">[^<]*<\/p><button class="inline-block bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-6 rounded-full transition-colors">[^<]*<\/button>/g
const NO_SPAM = /(<div class="text-\[10px\] mt-2 flex flex-col gap-2 items-center">)<p>[^<]*<\/p>/g

/** True on a tree with tidy-1 (the truck page takes `tally`). */
const LANDED = (() => { try { return /tally = true \}: \{/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'app/trucks/[slug]/TruckClient.tsx'), 'utf8')) } catch { return false } })()

const count = (s, re) => (s.match(re) || []).length
function hgTruck(html) {
  if (typeof html !== 'string') return html
  if (html.split(TALLY_SCRIPT).length !== 2) throw new Error('tidy-1: the truck page\'s Tally script is not there exactly once')
  const prompts = count(html, FLOATING)
  if (prompts > 1 || count(html, NEWSLETTER) !== prompts || count(html, NO_SPAM) !== prompts) throw new Error(`tidy-1: the weekly-schedule button, the newsletter block and the "no spam" line are not there together (${prompts} / ${count(html, NEWSLETTER)} / ${count(html, NO_SPAM)})`)
  return html.replace(TALLY_SCRIPT, '').replace(FLOATING, '').replace(NEWSLETTER, '').replace(NO_SPAM, '$1')
}

const { must } = require('./_lp-pricing-tidy.cjs')
const TRUCK_VIEWS = /^parts\/truck\|(GB|US)\|html/
const ITEMS = !LANDED ? [] : [
  { id: 'tidy-1-hg-truck-no-tally', what: '⚠️ RE-PINNED (tidy-1, 3 November 2026): the truck page on the HatchGrab host loads no Tally — its script goes, and on a UK truck so do Village Foodie’s floating weekly-schedule button and the footer’s newsletter block (form 81xAKx); the footer’s links stay — PRECISE (hgTruck); Village Foodie’s own truck page is byte-identical (scripts/tidy-1.cjs)',
    views: id => TRUCK_VIEWS.test(id), apply: (id, v) => must('tidy-1-hg-truck-no-tally', hgTruck)(v) },
]

module.exports = { LANDED, hgTruck, TRUCK_VIEWS, ITEMS, TALLY_SCRIPT }
