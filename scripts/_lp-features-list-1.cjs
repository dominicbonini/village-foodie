// scripts/_lp-features-list-1.cjs — ⚠️ RE-PINNED (features-list-1, 4 November 2026): THE NAMED PUBLIC-PAGE CHANGE OF features-list-1
// (docs/features-list-1-report.md), shared by the harnesses that compare the sitemap with a BEFORE snapshot (plans-data-model,
// language-phase-1e through scripts/_lp1e-named.cjs, language-phase-1e-tidy). A MODULE.
//
// features-list-1 changed the /features table (three rows in, Advanced reporting out — proven by scripts/features-list-1.cjs, which
// also proves the landing pages and every byte of /features outside those rows identical to HEAD) and, ON PURPOSE,
// lib/marketing-meta.ts MARKETING_COPY_UPDATED '2026-11-02' → '2026-11-04' (35.aj-8), so each live country's landing and /features
// sitemap lastmod is at least 2026-11-04. That lastmod is the one change these older harnesses see.
// A PRECISE transform of the BEFORE side: it throws when no country page lastmod moves (a stale anchor).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')

/** True on a tree with features-list-1 (lib/marketing-meta.ts's copy date 2026-11-04 or later). */
const LANDED = (() => { try { const m = /MARKETING_COPY_UPDATED\s*=\s*'(\d{4}-\d{2}-\d{2})'/.exec(fs.readFileSync(path.join(REPO, 'lib/marketing-meta.ts'), 'utf8')); return !!m && m[1] >= '2026-11-04' } catch { return false } })()

const LASTMOD_NEW = '2026-11-04T00:00:00.000Z'
const COUNTRY_PAGE = /^https:\/\/www\.hatchgrab\.com\/[a-z]{2}(\/features)?$/

/** A sitemap (an array of entries, or its JSON string) with each live country's landing and /features lastmod moved to at least
 *  2026-11-04. PRECISE: at least one entry must move. */
function sitemap(v) {
  if (typeof v === 'string') { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(sitemap(p)) } catch { /* not JSON */ } return v }
  if (!Array.isArray(v)) return v
  let moved = 0
  const out = v.map(e => {
    if (!e || !COUNTRY_PAGE.test(e.url || '')) return e
    const at = e.lastModified instanceof Date ? e.lastModified.toISOString() : e.lastModified
    if (typeof at !== 'string' || at >= LASTMOD_NEW) return e
    moved++
    return { ...e, lastModified: e.lastModified instanceof Date ? new Date(LASTMOD_NEW) : LASTMOD_NEW }
  })
  if (!moved) throw new Error('features-list-1-sitemap: no country page lastmod to move (stale anchor)')
  return out
}

// The named items, in the shape the language-phase registries take (scripts/_lp1e-named.cjs, language-phase-1e-tidy.cjs).
// Applied AFTER copy-truth-1's item (which moves the same entries to 2026-11-02 first).
const ITEMS = !LANDED ? [] : [
  { id: 'features-list-1-sitemap-lastmod',
    what: '⚠️ RE-PINNED (features-list-1, 4 November 2026): MARKETING_COPY_UPDATED 2026-11-04, so each live country\'s landing and /features sitemap lastmod is at least 2026-11-04. PRECISE: at least one entry moves',
    views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id),
    apply: (id, v) => sitemap(v) },
]

// ── The /features table rows, for harnesses that pinned /features' HTML before features-list-1 (faq-4) or the message files a
// page bundles (contact-1). ────────────────────────────────────────────────────────────────────────────────────────────────
const { execFileSync } = require('child_process')
const BEFORE = '56250fcd'   // the commit before features-list-1
const NEW_IDS = ['documents_reminders', 'profit_per_event', 'accountant_reports']
const OLD_ID = 'advanced_reporting'
const beforeMessages = locale => JSON.parse(execFileSync('git', ['show', `${BEFORE}:messages/${locale}.json`], { cwd: REPO, maxBuffer: 64e6 }).toString())
const nowMessages = locale => JSON.parse(fs.readFileSync(path.join(REPO, `messages/${locale}.json`), 'utf8'))
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const ROW = /<div class="pt-row" role="row"><div class="pt-label" role="rowheader"><span class="pt-name">((?:(?!<\/span>).)*)<\/span><span class="pt-desc">((?:(?!<\/span>).)*)<\/span><\/div>(?:<div class="pt-cell[^"]*" role="cell">(?:(?!<\/div>).)*<\/div>)*<\/div>/g

/** /features' HTML as it was before features-list-1: the three new rows (contiguous, after Buzzer tracking) replaced by the old
 *  "Advanced reporting" row — a "Coming soon" row built from the next row (Tap to pay, also "Coming soon") with the old name and
 *  description (read from the commit before). PRECISE: throws unless exactly the three new rows are found, in order, followed by
 *  a "Coming soon" row. */
function featuresRowsBack(html, locale) {
  const now = nowMessages(locale), gb = nowMessages('en-GB'), old = beforeMessages(locale), oldGb = beforeMessages('en-GB')
  const nameNow = id => esc(now.planFeatures?.row?.[id]?.name || gb.planFeatures.row[id].name)
  const rows = [...String(html).matchAll(ROW)]
  const i = rows.findIndex(m => m[1] === nameNow(NEW_IDS[0]))
  if (i < 0 || NEW_IDS.some((id, k) => rows[i + k]?.[1] !== nameNow(id))) throw new Error(`features-list-1-rows: the three new rows are not there, in order (${locale}) — stale anchor`)
  const last = rows[i + 2], next = rows[i + 3]
  if (!next || !/pt-soon/.test(next[0]) || last.index + last[0].length !== next.index || rows[i + 1].index !== rows[i].index + rows[i][0].length || rows[i + 2].index !== rows[i + 1].index + rows[i + 1][0].length)
    throw new Error(`features-list-1-rows: the three rows are not contiguous and followed by a "Coming soon" row (${locale})`)
  const oldName = old.planFeatures?.row?.[OLD_ID]?.name || oldGb.planFeatures.row[OLD_ID].name
  const oldDesc = old.featuresPage?.detail?.[OLD_ID] || oldGb.featuresPage.detail[OLD_ID]
  const oldRow = next[0].replace(`<span class="pt-name">${next[1]}</span><span class="pt-desc">${next[2]}</span>`, `<span class="pt-name">${esc(oldName)}</span><span class="pt-desc">${esc(oldDesc)}</span>`)
  return html.slice(0, rows[i].index) + oldRow + html.slice(last.index + last[0].length)
}

/** True when a messages/ns/<locale>/{planFeatures,featuresPage}.json differs from its text at `baseText` only by features-list-1's
 *  rows (the three new ids in, advanced_reporting out). Any other change → false. */
function nsSameApartFromRows(file, baseText, nowText) {
  if (!/^messages\/ns\/[A-Za-z-]+\/(planFeatures|featuresPage)\.json$/.test(file) || baseText == null) return false
  const strip = t => { const o = JSON.parse(t); for (const id of [...NEW_IDS, OLD_ID]) { if (o.row) delete o.row[id]; if (o.detail) delete o.detail[id] } return JSON.stringify(o) }
  try { return strip(baseText) === strip(nowText) } catch { return false }
}

module.exports = { LANDED, LASTMOD_NEW, sitemap, ITEMS, featuresRowsBack, nsSameApartFromRows }
