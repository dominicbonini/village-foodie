// scripts/_named-longer-intervals.cjs — LONGER COLLECTION TIMES AND KITCHEN-CAPACITY STEPS (12 November 2026), as NAMED code
// changes. A MODULE, read by scripts/_lp2-named.cjs (language-phase-1a/-1b/-1c/-2) and scripts/_lp1d-named.cjs
// (language-phase-1d), which compare BEFORE + the named changes with their AFTER. Proven on its own by
// scripts/longer-intervals-1.cjs.
//
// Same shape as every entry there: { id, part, country, what, views(id), expect(before, id) }. Each transform is PRECISE:
// it rebuilds only a <select> (or an options array) whose options are EXACTLY the old list it expects, writes exactly what
// the new code writes, and otherwise leaves BEFORE alone — so any other difference still fails the comparison.

const PART = 'Longer collection times and capacity steps (12 Nov 2026)'
const PREP_NEW = [1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300, 3600]          // 20m … 60m
const WINDOW = [...Array.from({ length: 15 }, (_, i) => i + 1), 20, 25, 30, 35, 40, 45, 50, 55, 60]
const OLD_INTERVALS = [5, 10, 15, 20, 30]
const OPT = /<option value="([^"]*)"( selected="")?>([^<]*)<\/option>/g

/** Every <select …>…</select> whose body is options only → fn(options) → new options (or null to leave it). */
function eachSelect(html, fn) {
  return html.replace(/(<select\b[^>]*>)((?:<option value="[^"]*"(?: selected="")?>[^<]*<\/option>)+)(<\/select>)/g, (all, open, body, close) => {
    const opts = [...body.matchAll(OPT)].map(m => ({ value: m[1], selected: !!m[2], label: m[3] }))
    const next = fn(opts)
    return next ? open + next.map(o => `<option value="${o.value}"${o.selected ? ' selected=""' : ''}>${o.label}</option>`).join('') + close : all
  })
}
const nums = opts => opts.map(o => Number(o.value))
const eqList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

/** Collection-time selects: exactly 5, 10, 15, 20, 30 labelled "Every N …" → + 45, + 60, labelled the same way. */
function intervalSelect(opts) {
  if (!eqList(nums(opts), OLD_INTERVALS) || !opts.every(o => /^Every \d+ /.test(o.label) && o.label.includes(o.value))) return null
  const t30 = opts[4].label
  return [...opts, ...[45, 60].map(n => ({ value: String(n), selected: false, label: t30.replace('30', String(n)) }))]
}
/** Prep-time selects: the old grid (…, 840, 900 = "15m", plus at most one stored extra) → + 20m … 60m, sorted. */
function prepSelect(opts) {
  const v = nums(opts)
  if (![30, 300, 840, 900].every(x => v.includes(x)) || !v.every(x => Number.isInteger(x) && x % 30 === 0)) return null
  const o900 = opts.find(o => o.value === '900')
  if (!o900 || !/15/.test(o900.label)) return null
  const have = new Map(opts.map(o => [Number(o.value), o]))
  for (const s of PREP_NEW) if (!have.has(s)) have.set(s, { value: String(s), selected: false, label: o900.label.replace('15', String(s / 60)) })
  return [...have.entries()].sort((a, b) => a[0] - b[0]).map(([, o]) => o)
}
/** Capacity-window selects: 1 … 20 (+ a stored extra above 20) labelled "every Nm" → 1 … 15, 20 … 60 (+ the stored
 *  value if it is off that list), labelled the same way. */
function windowSelect(opts) {
  const v = nums(opts)
  const base = Array.from({ length: 20 }, (_, i) => i + 1)
  if (!eqList(v.slice(0, 20), base) || v.length > 21) return null
  const o1 = opts[0], o20 = opts[19]
  if (!/1m\b/.test(o1.label) || !/20m\b/.test(o20.label) || /item/i.test(o1.label)) return null
  const sel = opts.find(o => o.selected)
  const out = new Map(WINDOW.map(n => [n, opts.find(o => Number(o.value) === n) || { value: String(n), selected: false, label: o20.label.replace('20', String(n)) }]))
  if (sel && !out.has(Number(sel.value))) out.set(Number(sel.value), sel)
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([, o]) => o)
}
/** The copy view of prepTimeOptionsFor: an array of { secs, label } with 900 → + 1200 … 3600, sorted. */
function prepArray(v) {
  const isArr = a => Array.isArray(a) && a.length && a.every(x => x && typeof x.secs === 'number' && typeof x.label === 'string')
  const fix = a => {
    const o900 = a.find(x => x.secs === 900)
    if (!o900) return a
    const have = new Map(a.map(x => [x.secs, x]))
    for (const s of PREP_NEW) if (!have.has(s)) have.set(s, { secs: s, label: o900.label.replace('15', String(s / 60)) })
    return [...have.values()].sort((x, y) => x.secs - y.secs)
  }
  if (isArr(v)) return fix(v)
  // the bare constant PREP_TIME_OPTIONS: exactly the old 20 seconds-values → + 1200 … 3600
  const OLD_PREP = [...Array.from({ length: 10 }, (_, i) => (i + 1) * 30), ...Array.from({ length: 10 }, (_, i) => 360 + i * 60)]
  if (Array.isArray(v) && eqList(v, OLD_PREP)) return [...v, ...PREP_NEW]
  if (typeof v === 'string' && v === JSON.stringify(OLD_PREP)) return JSON.stringify([...OLD_PREP, ...PREP_NEW])
  if (typeof v === 'string' && v[0] === '[') {
    try { const p = JSON.parse(v); if (JSON.stringify(p) === v && isArr(p)) return JSON.stringify(fix(p)) } catch { /* not JSON */ }
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, prepArray(x)]))
  return v
}

/** The bare interval constants (INTERVAL_CHOICES, TYPE_INTERVAL_CHOICES): exactly [5,10,15,20,30] → + 45, 60. */
function intervalArray(v) {
  if (Array.isArray(v) && eqList(v, OLD_INTERVALS)) return [...v, 45, 60]
  if (typeof v === 'string' && v === JSON.stringify(OLD_INTERVALS)) return JSON.stringify([...OLD_INTERVALS, 45, 60])
  if (v && typeof v === 'object' && !Array.isArray(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, intervalArray(x)]))
  return v
}
/** language-phase-1d only: its BEFORE predates refusal codes, so a Manage refusal it names must ALSO gain the code and params
 *  the route now sends, last — exactly `refuse('collection_interval_choices', 400, { choices })` (app/api/manage/route.ts). */
function withRefusalCode(v) {
  if (Array.isArray(v)) return v.map(withRefusalCode)
  if (!v || typeof v !== 'object') return v
  return Object.fromEntries(Object.entries(v).map(([k, x]) => {
    if (k === 'body' && typeof x === 'string' && x[0] === '{') {
      try {
        const p = JSON.parse(x)
        if (JSON.stringify(p) === x && Object.keys(p).length === 1 && /every 5, 10, 15, 20, 30, 45, 60 minutes\.$/.test(p.error || ''))
          return [k, JSON.stringify({ ...p, code: 'collection_interval_choices', params: { choices: '5, 10, 15, 20, 30, 45, 60' } })]
      } catch { /* not JSON */ }
      return [k, x]
    }
    return [k, withRefusalCode(x)]
  }))
}

function entries({ mapStrings, refusalCodes = false }) {
  return [
    { id: 'longer-intervals-collection-45-60', part: PART, country: 'both',
      what: 'lib/slot-interval-core.ts INTERVAL_CHOICES gains 45 and 60: every Collection-times <select> (Manage › Settings, the dashboard, event types, event overrides) that offered exactly 5/10/15/20/30 now also offers "Every 45 …" and "Every 60 …", worded like its 30. Nothing else in the select.',
      views: () => true,
      expect: b => intervalArray(mapStrings(b, s => (s.includes('<select') ? eachSelect(s, intervalSelect) : s))) },
    { id: 'longer-intervals-refusal-choices', part: PART, country: 'both',
      what: 'The refusal for a collection time off the list names the choices from INTERVAL_CHOICES: "…every 5, 10, 15, 20, 30 minutes." → "…every 5, 10, 15, 20, 30, 45, 60 minutes." (and the same in the refusal\'s params). The refused value and every other word unchanged.',
      views: () => true,
      expect: (b, id) => {
        const w = mapStrings(b, s => s.replace(/\b5, 10, 15, 20, 30\b(?!, 45)/g, '5, 10, 15, 20, 30, 45, 60'))
        return refusalCodes && /^api\/(GB|US)\|manage\|/.test(id || '') ? withRefusalCode(w) : w
      } },
    { id: 'longer-intervals-prep-to-60', part: PART, country: 'both',
      what: 'lib/kitchen-capacity.ts PREP_TIME_OPTIONS gains 20m … 60m in 5-minute steps after 15m: every prep-time <select> (and the prepTimeOptionsFor list) adds those options, labelled like its 15m, in order; an extra a category already held stays, once.',
      views: () => true,
      expect: b => prepArray(mapStrings(b, s => (s.includes('<select') ? eachSelect(s, prepSelect) : s))) },
    { id: 'longer-intervals-window-to-60', part: PART, country: 'both',
      what: 'The capacity-window <select> beside Total capacity reads CAPACITY_WINDOW_OPTIONS: 1 … 15 minutes, then 20, 25 … 60 (was 1 … 20). 16–19 leave the list unless the van already holds one (then it stays, selected). Labelled like its 20.',
      views: () => true,
      expect: b => mapStrings(b, s => (s.includes('<select') ? eachSelect(s, windowSelect) : s)) },
  ]
}

module.exports = { entries, intervalSelect, prepSelect, windowSelect, prepArray }
