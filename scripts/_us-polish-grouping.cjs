// scripts/_us-polish-grouping.cjs — the named change us-polish-thousands-separators (US polish batch, 19 October 2026;
// docs/us-polish-batch-report.md) as ONE transform of a BEFORE string, shared by the harnesses that pin money output.
// A MODULE (listed under shared_modules in scripts/harnesses.json).
//
// lib/money-format.ts now groups every displayed amount: a symbol-led figure of 1,000 or more gains its separators
// ("£1234.56" → "£1,234.56", "$12345.67" → "$12,345.67"). On a printed ticket the figure sits right-aligned after a
// padded gap: the gap gives one space per comma back, so the line keeps its width; when the gap has no space to give
// (a row that would then wrap), the ticket keeps the ungrouped figure (lib/printing/ticket.ts `fitted`) — so does this.
// A hex string (a ticket's bytes) is read as latin-1 ("£" is 0xA3) and transformed the same way.
// 🔴 A CSV view is never passed through this (the Reports CSVs keep raw figures); callers exclude them by id.
const groupDigits = d => d.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
function groupString(s) {
  if (typeof s !== 'string') return s
  if (s.length >= 40 && s.length % 2 === 0 && /^[0-9a-f]+$/.test(s)) {
    const t = Buffer.from(s, 'hex').toString('latin1'), g = groupString(t)
    return g === t ? s : Buffer.from(g, 'latin1').toString('hex')
  }
  return s.replace(/( {2,})?(\+?)([£$\xa3])(-?)(\d{4,})((?:\.\d+)?)/g, (all, sp, plus, cur, minus, d, frac) => {
    const g = groupDigits(d), k = g.length - d.length
    if (sp === undefined) return plus + cur + minus + g + frac
    return sp.length > k ? sp.slice(k) + plus + cur + minus + g + frac : all
  })
}
module.exports = { groupString, groupDigits }
