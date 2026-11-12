// scripts/_named-collection-anchor.cjs — COLLECTION TIMES COUNTED FROM THE EVENT'S START (collection-anchor-1, 12 November
// 2026), as a NAMED code change. Read by scripts/_lp2-named.cjs (language-phase-1a/-1b/-1c/-2) and scripts/money-sweep-parity.cjs,
// which compare BEFORE + the named changes with their AFTER. Proven on its own by scripts/longer-intervals-1.cjs §2.
//
// The one rendered difference in those fixtures: the customer order page's BACKUP time picker (used when /api/slots has no
// list) now takes the event's own times from generateCollectionTimes — start … end — where it listed every hour of the
// event × the interval's minutes and so ran on past the end. The fixtures' event is 17:00–21:00 every 10 minutes, so the
// old list ended "… 21:00, 21:10, 21:20, 21:30, 21:40, 21:50" and the new one ends at 21:00. PRECISE: exactly those five
// options, directly after the 21:00 option and directly before </select>, are dropped; anything else is left as BEFORE had
// it, so any other difference still fails.

const PART = 'Collection times from the event start (12 Nov 2026)'
const END = '21:00'
const PAST_END = ['21:10', '21:20', '21:30', '21:40', '21:50']

/** Markup: drop the five past-the-end options of the backup picker (any label — GB "21:10", US "9:10 PM"). */
function dropPastEnd(s) {
  if (!s.includes(`<option value="${END}"`)) return s
  const run = PAST_END.map(v => `<option value="${v}">[^<]*</option>`).join('')
  return s.replace(new RegExp(`(<option value="${END}"(?: selected="")?>[^<]*</option>)${run}(</select>)`, 'g'), '$1$2')
}

/** money-sweep-parity's BEFORE snapshot ({ text, attrs } per view): the same five times, on the orderPage views only — out
 *  of the text (" 21:00 21:10 … 21:50 ▾" → " 21:00 ▾") and out of attrs (the five `value=` entries right after value=21:00). */
function snapshotBefore(before) {
  const out = JSON.parse(JSON.stringify(before))
  let n = 0
  for (const v of Object.values(out.orderPage || {})) {
    if (!v || typeof v !== 'object') continue
    if (typeof v.text === 'string') v.text = v.text.replace(new RegExp(`( ${END})${PAST_END.map(t => ' ' + t).join('')}( ▾)`, 'g'), (_, a, b) => { n++; return a + b })
    if (Array.isArray(v.attrs)) {
      const i = v.attrs.indexOf(`value=${END}`)
      if (i >= 0 && PAST_END.every((t, k) => v.attrs[i + 1 + k] === `value=${t}`)) v.attrs.splice(i + 1, PAST_END.length)
    }
  }
  return { before: out, views: n }
}

function entries({ mapStrings }) {
  return [
    { id: 'collection-anchor-backup-ends-at-end', part: PART, country: 'both',
      what: 'The order page\'s backup time picker lists the event\'s own times from generateCollectionTimes (start, start + interval, … end) — the server\'s function — where it listed hours × minutes and ran past the end. Fixture event 17:00–21:00 at 10: the five options after 21:00 (21:10 … 21:50) are gone; nothing else in the select changes.',
      views: id => /orderPage/.test(id),
      expect: b => mapStrings(b, s => (s.includes('<select') ? dropPastEnd(s) : s)) },
  ]
}

module.exports = { entries, dropPastEnd, snapshotBefore, END, PAST_END }
