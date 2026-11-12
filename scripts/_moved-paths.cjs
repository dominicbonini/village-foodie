// scripts/_moved-paths.cjs — cwv-2 (6 November 2026, docs/cwv-2-report.md §6): THE ROUTE MOVE, AS DATA. A MODULE, not a harness.
// cwv-2 split app/ into two root layouts with route groups: every app route moved, byte-identical, into app/(app)/ under today's root
// layout, and the public HatchGrab pages into app/(public)/ (the country pages under app/(public)/[country], the rest under
// app/(public)/(site)). URLs did not change. A harness that READS THE WORKING TREE names the new path; a harness that READS AN OLD
// COMMIT (`git show <rev>:<path>`) must name the path as it was in that commit — pathAt(rev, p) gives exactly that.
// Nothing here reads a database, the network or any .env file.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const { execFileSync } = require('child_process')
const path = require('path')
const REPO = path.resolve(__dirname, '..')

/** The move commit's prefixes, old → new (most specific first). A prefix is a whole path or a whole directory. */
const MOVES = [
  ['app/[country]/(legal)', 'app/(app)/[country]/(legal)'],
  ['app/[country]/page.tsx', 'app/(public)/[country]/page.tsx'],
  ['app/[country]/page', 'app/(public)/[country]/page'],   // an import specifier (no extension)
  ['app/[country]/features', 'app/(public)/[country]/features'],
  ['app/[country]/faq', 'app/(public)/[country]/faq'],
  ['app/[country]/compare', 'app/(public)/[country]/compare'],
  ['app/[country]/[section]', 'app/(public)/[country]/[section]'],
  ...['landing', '1ng7n4p5omux2gdk9kqvwz', 'features', 'faq', 'compare', 'about'].map(d => [`app/${d}`, `app/(public)/(site)/${d}`]),
  ...['admin', 'app', 'contact', '(legal)', 'dashboard', 'dev', 'docs', 'domain', 'forgot-password', 'hire', 'kds', 'login', 'manage', 'o', 'order',
    'p', 'reset-password', 'setup', 'signup', 'trucks', 'try', 'venues', 'verify-email',
    'layout.tsx', 'providers.tsx', 'globals.css', 'page.tsx', 'error.tsx', 'not-found.tsx',
    'layout', 'providers', 'page', 'error', 'not-found'].map(d => [`app/${d}`, `app/(app)/${d}`]),   // the last five: import specifiers
]

const swap = (p, from, to) => {
  const s = String(p)
  for (const pair of MOVES) {
    const a = pair[from], b = pair[to]
    if (s === a || s.startsWith(a + '/')) return b + s.slice(a.length)
  }
  return s
}
/** A pre-move path → where it is now (unchanged if it did not move). */
const nowPath = p => swap(p, 0, 1)
/** A post-move path → its name before the move (unchanged if it did not move). */
const beforePath = p => swap(p, 1, 0)

const exists = (rev, p) => { try { execFileSync('git', ['cat-file', '-e', `${rev}:${p}`], { cwd: REPO, stdio: 'ignore' }); return true } catch { return false } }
/** The path as it was AT `rev`: the post-move name if that commit has it, else its pre-move name. Either form may be passed. */
function pathAt(rev, p) {
  const now = nowPath(p)
  if (exists(rev, now)) return now
  const was = beforePath(now)
  return exists(rev, was) ? was : p
}

/** The move commit's only edits to moved files: one import line each, where a module it imports moved too. Exact strings, old → new. */
const MOVE_EDITS = {
  'app/(app)/kds/[kds_token]/page.tsx': [["\nimport KdsPage from '@/app/dashboard/[token]/kds/page'\n", "\nimport KdsPage from '@/app/(app)/dashboard/[token]/kds/page'\n"]],
  'app/(app)/contact/HatchGrabContact.tsx': [["\nimport '../landing/landing.css'\n", "\nimport '@/app/(public)/(site)/landing/landing.css'\n"]],
}

const fs = require('fs')
const show = (rev, p) => (exists(rev, p) ? execFileSync('git', ['cat-file', 'blob', `${rev}:${p}`], { cwd: REPO, maxBuffer: 1 << 28 }).toString('latin1') : null)
const tracked = (args) => execFileSync('git', args, { cwd: REPO, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean)
/**
 * `git diff --name-only <rev> -- <paths>` for the WORKING TREE, made blind to the route move and nothing else: the files (tracked now,
 * or at `rev`) under `paths` — either form — whose working-tree content differs from the same file at `rev`, read there under the name
 * it had then, after the move commit's own import-line edits (MOVE_EDITS) are applied. A file that only moved is unchanged; a file
 * added or deleted since `rev` is changed. Paths are returned in their current form.
 */
/** cwv-2's one deliberate change to a file other harnesses pin as "unchanged": the country pages' host gate in proxy.ts (built-ahead
 *  pages cannot read the host). `changedSince(rev, paths, { cwv2: true })` compares proxy.ts with exactly that block taken out. */
const CWV2_PROXY_BLOCK = /\n  \/\/ ── cwv-2 \(6 November 2026[\s\S]*?\n  \}\n\n/
const G2 = require('./_lp-gsc-index-2.cjs')
const B1 = require('./_lp-billing-1.cjs')   // billing-1 (10 November 2026): its named edits, taken back exactly
const PC4 = require('./_lp-pricing-copy-4.cjs')   // pricing-copy-4 (12 November 2026): its recorded code edits, taken back exactly
function changedSince(rev, paths, { cwv2 = false } = {}) {
  const now = [...new Set(paths.map(nowPath))]
  const files = new Set([...tracked(['ls-files', '--', ...now]), ...tracked(['ls-tree', '-r', '--name-only', rev, '--', ...new Set(now.map(beforePath))]).map(nowPath)])
  const changed = []
  for (const f of [...files].sort()) {
    const abs = path.join(REPO, f)
    let cur = fs.existsSync(abs) ? fs.readFileSync(abs).toString('latin1') : null
    if (cwv2 && f === 'proxy.ts' && cur) cur = Buffer.from(Buffer.from(cur, 'latin1').toString('utf8').replace(CWV2_PROXY_BLOCK, '\n').replace("import { isOwnOneSegment } from '@/lib/top-level-routes'\n", ''), 'utf8').toString('latin1')
    // ⚠️ RE-PINNED (gsc-index-2, 9 November 2026): against a revision from before gsc-index-2, its named edits (proxy.ts's /support
    // block, the English legal pages' hreflang) are taken back exactly (scripts/_lp-gsc-index-2.cjs asBefore; it throws if one is
    // not there exactly once), so every other byte is still compared.
    if (cur && G2.FILES.includes(f) && G2.LANDED && show(rev, 'scripts/_lp-gsc-index-2.cjs') === null) cur = Buffer.from(G2.asBefore(f, Buffer.from(cur, 'latin1').toString('utf8')), 'utf8').toString('latin1')
    // ⚠️ RE-PINNED (billing-1, 10 November 2026): against a revision from before billing-1, its committed edits (the billing gate in
    // the menu and submit routes, the fee at capture and on refunds, the ledger's optional fee fields) are reverse-applied exactly
    // (scripts/_lp-billing-1.cjs asBefore; it throws if they are not there exactly), so every other byte is still compared.
    // ⚠️ RE-PINNED (pricing-copy-4, 12 November 2026; docs/pricing-copy-4-report.md): against a revision from before pricing-copy-4, its
    // recorded edits (the payment model in the two settings modules; Manage › Billing's footnote shown only in a card country) are put back
    // exactly FIRST (scripts/_lp-pricing-copy-4.cjs undoCode — null if one is not there exactly once, which leaves the file changed), so
    // billing-1's reverse patch then meets the text it was made against and every other byte is still compared.
    if (cur && PC4.CODE_FILES.includes(f) && show(rev, 'scripts/_lp-pricing-copy-4.cjs') === null) { const u = PC4.undoCode(f, Buffer.from(cur, 'latin1').toString('utf8')); if (u !== null) cur = Buffer.from(u, 'utf8').toString('latin1') }
    if (cur && B1.LANDED && B1.FILES.includes(f) && show(rev, 'lib/billing/rules.ts') === null) { const b = B1.asBefore(f, Buffer.from(cur, 'latin1').toString('utf8')); cur = b === null ? null : Buffer.from(b, 'utf8').toString('latin1') }
    let then = show(rev, f) ?? show(rev, beforePath(f))
    if (then !== null) for (const [a, b] of MOVE_EDITS[f] || []) then = then.split(a).join(b)
    if (cur !== then) changed.push(f)
  }
  return changed
}

module.exports = { MOVES, MOVE_EDITS, nowPath, beforePath, pathAt, changedSince }
