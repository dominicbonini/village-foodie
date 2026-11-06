// scripts/cwv-2-proof/ — cwv-2 (6 November 2026, docs/cwv-2-report.md §7): THE PROOFS THAT NEED BUILDS. By hand, never swept: two production
// builds (HEAD and this work) in worktrees with no .env file, both against the stand-in database (scripts/_perf-1-standin.cjs), each
// `next start`ed, with hostproxy.cjs in front for the HatchGrab host, the Village Foodie host and the native app user agent.
// Nothing here reads a database, the live site or any .env file (lh-run.cjs reads the live site only when given its address).
// node compare.cjs <capA> <capB> [--keys regex] — status/location equal; body equal after chunk-name normalisation; else canonical (scripts stripped, head as set).
const fs = require('fs'), path = require('path')
const [A, B] = process.argv.slice(2); const only = process.argv.includes('--keys') ? new RegExp(process.argv[process.argv.indexOf('--keys') + 1]) : null
const norm = s => s.replace(/\/_next\/static\/(chunks|media|css)\/[^"' )\\]+/g, '/_next/static/$1/X')
  .replace(/"buildId":"[^"]+"|\\"b\\":\\"[^\\]+\\"/g, 'BUILD').replace(/<!--[A-Za-z0-9_-]{20,22}-->/g, '')
  .replace(/_R_[A-Za-z0-9]+_/g, (() => { const m = new Map(); return id => (m.has(id) || m.set(id, 'RID' + m.size), m.get(id)) })()).replace(/[a-z_]+_[0-9a-f]{6,8}-module__[A-Za-z0-9_-]{6}__(variable|className)/g, 'FONTCLASS_$1')
const canon = s => { const n = norm(s).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''); const m = n.match(/<head>([\s\S]*?)<\/head>/); const head = m ? m[1].match(/<[^>]+>[^<]*(<\/(title|style)>)?/g) || [] : []
  return { head: head.sort().join('\n'), body: n.replace(/<head>[\s\S]*?<\/head>/, '') } }
const ia = JSON.parse(fs.readFileSync(path.join(A, 'index.json'))), ib = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(B, 'index.json'))).map(x => [x.key, x]))
const tally = { raw: 0, norm: 0, canon: 0, diff: 0 }, diffs = []
for (const a of ia) { if (only && !only.test(a.key)) continue
  const b = ib[a.key]; if (!b) { diffs.push([a.key, 'missing']); tally.diff++; continue }
  if (a.status !== b.status || a.location !== b.location) { diffs.push([a.key, `status ${a.status}${a.location} → ${b.status}${b.location}`]); tally.diff++; continue }
  let best = 'diff'
  for (const pass of [2, 1]) {
    const x = fs.readFileSync(path.join(A, `${a.key}.${pass}.html`), 'utf8'), y = fs.readFileSync(path.join(B, `${a.key}.${pass}.html`), 'utf8')
    for (const pb of [2, 1]) { const y2 = fs.readFileSync(path.join(B, `${a.key}.${pb}.html`), 'utf8')
      if (x === y2) { best = 'raw'; break }
      if (norm(x) === norm(y2) && best !== 'raw') best = 'norm'
      const cx = canon(x), cy = canon(y2); if (best === 'diff' && cx.head === cy.head && cx.body === cy.body) best = 'canon' }
    if (best !== 'diff') break }
  tally[best]++; if (best === 'diff') diffs.push([a.key, a.status])
}
console.log(JSON.stringify(tally)); for (const d of diffs) console.log('  DIFF', d.join(' '))
