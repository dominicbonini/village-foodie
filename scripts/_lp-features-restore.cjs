// scripts/_lp-features-restore.cjs — ⚠️ RE-PINNED (features-page-restore, 20 October 2026): THE NAMED CHANGE OF
// features-page-restore, shared by the language-phase harnesses (1e, 1e-tidy; through scripts/_lp-stage-b.cjs featuresCheck),
// plans-data-model and marketing-country-parity. A MODULE (asserts nothing on its own).
//
// features-page-restore changed, ON PURPOSE, /features ONLY (app/features/page.tsx; also /uk/features, /us/features) — the
// Stage B page in the pre-Stage-B page's look:
//   R1 eyebrow   `<p class="eyebrow">{featuresPage.eyebrow}</p>` ("Compare") right before the one <h1> (h1 / lede / callout
//                unchanged);
//   R2 table     <PlanTable variant="features">: root `pt pt-card` → `pt pt-features`, `--pt-cols` minmax(4.4rem, 9.5rem)
//                → var(--cmp-col), and its FIRST child a hidden `<span hidden=""></span>` (PlanTableHeadHeight, server side);
//   R3 names     every money / capability row's label wrapped in `<span class="pt-name">`, and each CAPABILITY row followed
//                by `<span class="pt-desc">{featuresPage.detail.<rowId>}</span>` (rows in lib/feature-table.ts order;
//                en-US overrides six); the group rows untouched;
//   R4 tick      the ✓ cell's drawn <svg> → the text glyph "✓" (same span, same aria-label);
//   R5 money     every WHAT YOU PAY cell that is not "—" wrapped in `<span class="pt-val">`;
//   R6 notes     the footnotes' `<p class="price-note">…</p>` ×n → ONE `<div class="fn">` holding n plain `<p>…</p>`
//                (same words).
// Manage › Billing (the default variant) and the plans PDF are UNCHANGED (byte-identical — not handled here).
//
// HOW IT IS PROVEN — never "accept the diff": `restore(stageB, set)` is the PRECISE forward transform of a Stage-B-shaped
// /features (each step must apply exactly; a stale anchor throws). `proven(f)` maps F back loosely (`unrestore`) and then
// requires restore(unrestore(f)) === f BYTE FOR BYTE — so F is exactly the named change of a Stage-B-shaped page, which the
// caller then checks with its own (unchanged) Stage B checks.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const src = f => { try { return fs.readFileSync(path.join(REPO, f), 'utf8') } catch { return '' } }

/** True on a tree with features-page-restore (/features passes variant="features"; PlanTable renders `pt pt-features`). */
const LANDED = /variant="features"/.test(src('app/features/page.tsx')) && /pt pt-features/.test(src('components/pricing/PlanTable.tsx'))

const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
/** The capability rows' ids in table order: groups in FEATURE_GROUPS order, then rows in FEATURE_TABLE order (lib/feature-table.ts). */
function tableIds() {
  const s = src('lib/feature-table.ts')
  const g = /export const FEATURE_GROUPS[^=]*=\s*\[([^\]]*)\]/.exec(s), t = /export const FEATURE_TABLE[^=]*=\s*\[([\s\S]*?)\n\]/.exec(s)
  if (!g || !t) throw new Error('features-page-restore: lib/feature-table.ts FEATURE_GROUPS / FEATURE_TABLE not found (stale anchor)')
  const groups = [...g[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1])
  const rows = [...t[1].matchAll(/\{\s*id:\s*'([a-z_]+)',\s*group:\s*'([a-z_]+)'/g)].map(m => ({ id: m[1], group: m[2] }))
  return groups.flatMap(gr => rows.filter(r => r.group === gr).map(r => r.id))
}
/** The page's words per locale: en-GB is the base, en-US overrides (messages/*.json `featuresPage`). */
function wordSet(locale) {
  const read = f => { try { return JSON.parse(src(f)).featuresPage || {} } catch { return {} } }
  const gb = read('messages/en-GB.json'), us = locale === 'en-US' ? read('messages/en-US.json') : {}
  return { locale, eyebrow: us.eyebrow ?? gb.eyebrow, detail: { ...(gb.detail || {}), ...(us.detail || {}) } }
}
const SETS = () => [wordSet('en-GB'), wordSet('en-US')]

const SEC = '<section class="band features-page"><div class="wrap">'
const CARD_ROOT = /<div class="pt pt-card" role="table" style="--pt-cols:minmax\(0,1fr\) repeat\((\d+), minmax\(4\.4rem, 9\.5rem\)\)">/
const FEAT_ROOT = /<div class="pt pt-features" role="table" style="--pt-cols:minmax\(0,1fr\) repeat\((\d+), var\(--cmp-col\)\)"><span hidden=""><\/span>/
const cardRoot = n => `<div class="pt pt-card" role="table" style="--pt-cols:minmax(0,1fr) repeat(${n}, minmax(4.4rem, 9.5rem))">`
const featRoot = n => `<div class="pt pt-features" role="table" style="--pt-cols:minmax(0,1fr) repeat(${n}, var(--cmp-col))"><span hidden=""></span>`
// components/pricing/PlanTable.tsx `Check` (the drawn tick the card variant keeps), as React renders it.
const CHECK_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 L4.6 9 L10 3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
const ROW = /<div class="pt-row" role="row"><div class="pt-label" role="rowheader">(.*?)<\/div>((?:<div class="pt-cell(?: pt-hl)?" role="cell">.*?<\/div>)+)<\/div>/g
const CELL = /(<div class="pt-cell(?: pt-hl)?" role="cell">)(.*?)(<\/div>)/g
const NONE_CELL = /^<span class="pt-no" aria-label="[^"]*">—<\/span>$/
const RG_OPEN = '<div class="pt-rowgroup" role="rowgroup">'

/** The end (index after the closing tag) of the balanced <div …>…</div> that opens at `start`, or -1. */
function closeDiv(html, start) {
  const re = /<div\b|<\/div>/g; re.lastIndex = start; let d = 0
  for (let m; (m = re.exec(html));) { d += m[0] === '</div>' ? -1 : 1; if (d === 0) return m.index + m[0].length }
  return -1
}
const once = (s, x) => s.split(x).length - 1 === 1

/** A Stage-B-shaped /features (page or region holding its content section) → features-page-restore's. PRECISE; throws. */
function restore(html, set) {
  const fail = m => { throw new Error(`features-page-restore: ${m} (stale anchor)`) }
  if (typeof html !== 'string') fail('not HTML')
  if (!set || !set.eyebrow) fail('no featuresPage.eyebrow message')
  // R1 the eyebrow
  if (!once(html, SEC)) fail('not exactly one /features content section')
  const s = html.indexOf(SEC) + SEC.length
  if (!html.startsWith('<h1>', s) || html.includes('<p class="eyebrow">', s) && html.indexOf('<p class="eyebrow">', s) < html.indexOf('</section>', s)) fail('the section does not open on its <h1> alone')
  let v = html.slice(0, s) + `<p class="eyebrow">${escHtml(set.eyebrow)}</p>` + html.slice(s)
  // R2 the table root
  const r = CARD_ROOT.exec(v); if (!r || r.index < s || (v.match(new RegExp(CARD_ROOT.source, 'g')) || []).length !== 1) fail('not exactly one card plan table in the section')
  const te0 = closeDiv(v, r.index); if (te0 < 0) fail('the plan table does not close')
  let t = featRoot(r[1]) + v.slice(r.index + r[0].length, te0)
  // R3 + R5 the rows: the first rowgroup is WHAT YOU PAY (money rows); the others the capability rows, in table order
  const pay0 = t.indexOf(RG_OPEN); if (pay0 < 0) fail('no rowgroup')
  const pay1 = closeDiv(t, pay0)
  const ids = tableIds(); let money = 0, cap = 0
  t = t.replace(ROW, (m, label, cells, at) => {
    if (label.includes('pt-name')) fail('a row label already wrapped')
    const isMoney = at > pay0 && at < pay1
    if (isMoney) {
      money++
      const c = cells.replace(CELL, (x, a, inner, b) => (NONE_CELL.test(inner) ? x : `${a}<span class="pt-val">${inner}</span>${b}`))
      return `<div class="pt-row" role="row"><div class="pt-label" role="rowheader"><span class="pt-name">${label}</span></div>${c}</div>`
    }
    const id = ids[cap++]; if (!id) fail(`more capability rows than lib/feature-table.ts has (${ids.length})`)
    const d = set.detail[id]
    return `<div class="pt-row" role="row"><div class="pt-label" role="rowheader"><span class="pt-name">${label}</span>${d ? `<span class="pt-desc">${escHtml(d)}</span>` : ''}</div>${cells}</div>`
  })
  if (!money) fail('no WHAT YOU PAY rows')
  if (cap !== ids.length) fail(`${cap} capability rows, not lib/feature-table.ts's ${ids.length}`)
  // R4 the tick
  const ticks = t.split(CHECK_SVG).length - 1
  if (!ticks) fail('no drawn ✓ in the table')
  t = t.split(CHECK_SVG).join('✓')
  if (t.includes('<svg')) fail('another drawing in the table')
  v = v.slice(0, r.index) + t + v.slice(te0)
  // R6 the footnotes: the price-note paragraphs right after the table, up to the section's end
  const te = r.index + t.length
  const NOTE = /^<p class="price-note">(.*?)<\/p>/
  let at = te; const ps = []
  for (let m; (m = NOTE.exec(v.slice(at)));) { ps.push(m[1]); at += m[0].length }
  if (!ps.length) fail('no price-note footnote after the table')
  if (!v.startsWith('</div></section>', at)) fail('the footnotes are not the section\'s last content')
  v = v.slice(0, te) + `<div class="fn">${ps.map(p => `<p>${p}</p>`).join('')}</div>` + v.slice(at)
  return v
}

/** features-page-restore's /features → a Stage-B-shaped one (LOOSE: the proof is that restore() gives F back exactly). */
function unrestore(html) {
  let v = html
  const s = v.indexOf(SEC); if (s < 0) throw new Error('features-page-restore: F has no /features content section')
  const e = s + SEC.length, ey = /^<p class="eyebrow">[^<]*<\/p>/.exec(v.slice(e))
  if (ey) v = v.slice(0, e) + v.slice(e + ey[0].length)
  v = v.replace(FEAT_ROOT, (m, n) => cardRoot(n))
  v = v.replace(/<div class="pt-label" role="rowheader"><span class="pt-name">((?:(?!<\/div>).)*?)<\/span>(?:<span class="pt-desc">[^<]*<\/span>)?<\/div>/g, '<div class="pt-label" role="rowheader">$1</div>')
  v = v.replace(/(<span class="pt-yes" aria-label="[^"]*">)✓<\/span>/g, `$1${CHECK_SVG}</span>`)
  v = v.replace(/<span class="pt-val">((?:(?!<\/div>).)*?)<\/span>(?=<\/div>)/g, '$1')
  v = v.replace(/<div class="fn">((?:<p>(?:(?!<\/p>).)*<\/p>)+)<\/div>(?=<\/div><\/section>)/, (m, ps) => ps.replace(/<p>/g, '<p class="price-note">'))
  return v
}

const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `@${i}: expected …${JSON.stringify(a.slice(Math.max(0, i - 80), i + 120))}\n        got      …${JSON.stringify(b.slice(Math.max(0, i - 80), i + 120))}` }
/**
 * F (a page or region with /features' content section) → { stageB, locale } when F is EXACTLY restore(stageB, words) for
 * the page's words; else { problems }. Words: a GB page (£ column prices) the en-GB set only; a US page the en-US set, or
 * the en-GB base where the capture's en-US catalogue has no `featuresPage` (language-phase-1e's F: eb7ed44's words).
 */
function proven(f) {
  if (typeof f !== 'string') return { problems: ['features-page-restore: not HTML'] }
  let g; try { g = unrestore(f) } catch (e) { return { problems: [e.message] } }
  const gb = /<span class="pt-col-price">£/.test(f)
  const sets = SETS().filter(x => !gb || x.locale === 'en-GB')
  const tries = []
  for (const set of sets) {
    let out; try { out = restore(g, set) } catch (e) { tries.push(`${set.locale}: ${e.message}`); continue }
    if (out === f) return { stageB: g, locale: set.locale }
    tries.push(`${set.locale}: F is not exactly the named change of a Stage-B-shaped /features ${firstDiff(out, f)}`)
  }
  return { problems: tries.map(x => `features-page-restore ${x}`) }
}

module.exports = { LANDED, restore, unrestore, proven, tableIds, wordSet, CHECK_SVG, escHtml }
