// scripts/_lp-trial-column-1.cjs — ⚠️ RE-PINNED (trial-column-1, 16 November 2026): THE NAMED CHANGES OF trial-column-1
// (docs/trial-column-1-report.md), for the older harnesses that compare a file, the /features page or the sitemap with a tree from
// BEFORE it. A MODULE. scripts/trial-column-1.cjs proves the work itself (the column, its cells, the layout in 28 languages).
//
// trial-column-1 put the FREE TRIAL in the plan table as its first column (lib/plan-offer.ts tableColumns; components/pricing/
// PlanTable.tsx; the plans PDF's table), let a phone's four narrow columns break long words and amounts cleanly (plan-table.css,
// landing.css, zero-width break chances in the text), highlighted the trial in Manage › Billing with "Ends {date}", and — on purpose —
// moved lib/marketing-meta.ts MARKETING_COPY_UPDATED to 2026-11-16 (35.ah-8), so each live country's landing and /features sitemap
// lastmod is at least that day. Each transform here is PRECISE: it throws (or returns null) when its anchor is not there, so a stale
// anchor fails a comparison, never hides it.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')

/** True on a tree with trial-column-1 (lib/plan-offer.ts has tableColumns). */
const LANDED = (() => { try { return /export function tableColumns\(/.test(fs.readFileSync(path.join(REPO, 'lib/plan-offer.ts'), 'utf8')) } catch { return false } })()

// ── the code: its recorded edits, put back exactly (the shape of scripts/_lp-pricing-copy-4.cjs undoCode) ────────────────────────
// scripts/fixtures/trial-column-1-code-edits.json: per file, [now, before] pairs (each with a line of context), made from the diff
// against the commit before and proven to give that commit's text exactly.
const CODE_EDITS = require('./fixtures/trial-column-1-code-edits.json')
const CODE_FILES = Object.keys(CODE_EDITS)
/** The file's text with trial-column-1's edits put back; null when one is not there exactly once (the caller leaves it changed). */
function undoCode(file, text) {
  if (!CODE_EDITS[file]) return text
  // ⚠️ RE-PINNED (plans-everywhere-1, 19 November 2026, docs/plans-everywhere-1-report.md): that round's later edits (the post-pay
  // plan wording, the card-only row) are taken back first — exactly, by scripts/_named-plans-everywhere-1.cjs — so this module's
  // recorded edits find their anchors as they were. Any other change still returns null.
  const pe1 = require('./_named-plans-everywhere-1.cjs').undoCode(file, text)
  if (pe1 === null) return null
  let out = pe1
  for (const [now, before] of CODE_EDITS[file]) { if (out.split(now).length !== 2) return null; out = out.split(now).join(before) }
  return out
}

// ── the rendered table: the trial column taken back out ──────────────────────────────────────────────────────────────────────────
/** The text's line-break marks taken back (components/pricing/PlanTable.tsx ZWSP): "​ " → U+00A0, "​ " → U+202F,
 *  then every other U+200B removed. */
const unbreak = s => String(s).replace(/​ /g, ' ').replace(/​ /g, ' ').replace(/​/g, '')

/**
 * A rendered plan table (/features' or Billing's HTML, or a page holding one) as it was before trial-column-1: the trial's header
 * cell and the first cell of every row removed, the grid's columns as they were, the break marks and the two new classes taken
 * back. PRECISE: throws unless exactly one table is found with a trial header, and every row loses exactly one cell.
 */
function tableBack(html) {
  const s = String(html)
  if ((s.match(/<div class="pt pt-(?:features|card)" role="table"/g) || []).length !== 1) throw new Error('trial-column-1-table: not exactly one plan table — stale anchor')
  const at = s.search(/<div class="pt pt-(?:features|card)" role="table"/)
  const head = /<div class="pt-col(?: pt-hl)? pt-trial" role="columnheader">(?:(?!<\/div>).)*<\/div>/
  if (!head.test(s.slice(at))) throw new Error('trial-column-1-table: no trial column — stale anchor')
  let t = s.slice(0, at) + s.slice(at).replace(head, '')
  // the grid (PlanTable --pt-cols): n columns now, n − 1 before, at their old sizes
  let cols = 0
  t = t.replace(/--pt-cols:minmax\(6\.5rem,1fr\) repeat\((\d+), minmax\(0, var\(--cmp-col\)\)\)/, (_, n) => { cols++; return `--pt-cols:minmax(0,1fr) repeat(${n - 1}, var(--cmp-col))` })
    .replace(/--pt-cols:minmax\(6\.5rem,1fr\) repeat\((\d+), minmax\(3\.5rem, 9\.5rem\)\)/, (_, n) => { cols++; return `--pt-cols:minmax(6.5rem,1fr) repeat(${n - 1}, minmax(4rem, 9.5rem))` })
  if (cols !== 1) throw new Error('trial-column-1-table: the grid\'s columns are not there — stale anchor')
  // every row: its first cell after the row header (a feature / money row's .pt-cell; a group row's empty cell)
  let rows = 0
  t = t.replace(/(<div class="pt-row(?: pt-group)?" role="row"><div class="pt-label" role="rowheader">(?:(?!<\/div>).)*<\/div>)<div class="[^"]*" role="cell">(?:(?!<\/div>).)*<\/div>/g, (_, lead) => { rows++; return lead })
  if (rows < 30) throw new Error(`trial-column-1-table: only ${rows} rows lost a cell — stale anchor`)
  return unbreak(t).replace(/<b class="pt-b pt-amt">/g, '<b class="pt-b">').replace(/<span class="pt-sentence">/g, '<span>')
}

// ── the sitemap: the copy date ───────────────────────────────────────────────────────────────────────────────────────────────────
const LASTMOD_NEW = '2026-11-16T00:00:00.000Z'
const COUNTRY_PAGE = /^https:\/\/www\.hatchgrab\.com\/[a-z]{2}(\/features)?$/
/** A sitemap (entries, or their JSON) with each live country's landing and /features lastmod moved to at least 2026-11-16 — the
 *  BEFORE side made today's. PRECISE: at least one entry must move. */
function sitemap(v) {
  if (typeof v === 'string') { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(sitemap(p)) } catch { /* not JSON */ } return v }
  if (!Array.isArray(v)) return v
  let moved = 0
  const out = v.map(e => {
    if (!e || !COUNTRY_PAGE.test(e.url || '')) return e
    const when = e.lastModified instanceof Date ? e.lastModified.toISOString() : e.lastModified
    if (typeof when !== 'string' || when >= LASTMOD_NEW) return e
    moved++
    return { ...e, lastModified: e.lastModified instanceof Date ? new Date(LASTMOD_NEW) : LASTMOD_NEW }
  })
  if (!moved) throw new Error('trial-column-1-sitemap: no country page lastmod to move (stale anchor)')
  return out
}
// In the shape the language-phase registries take (scripts/_lp1e-named.cjs, language-phase-1e-tidy.cjs). Applied after the earlier
// copy-date items (copy-truth-1, features-list-1, site-chrome-1), which move the same entries to their own days first.
const ITEMS = !LANDED ? [] : [
  { id: 'trial-column-1-sitemap-lastmod',
    what: '⚠️ RE-PINNED (trial-column-1, 16 November 2026): MARKETING_COPY_UPDATED 2026-11-16, so each live country\'s landing and /features sitemap lastmod is at least 2026-11-16. PRECISE: at least one entry moves',
    views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id),
    apply: (id, v) => sitemap(v) },
]

module.exports = { LANDED, CODE_FILES, undoCode, unbreak, tableBack, LASTMOD_NEW, sitemap, ITEMS }
