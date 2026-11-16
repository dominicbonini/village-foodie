// scripts/_named-partners-2.cjs — partners-2 (16 November 2026, docs/partners-2-report.md): ITS EDITS TO FILES OTHER HARNESSES PIN,
// NAMED, so their byte-identity proofs can put them back — and the structural proof of the signup / demo code field.
//
//   undoCode(file, src) — the file with partners-2's edits taken back EXACTLY (null if one is not there exactly once, which leaves
//     the file "changed" and fails the proof that asked). The old text is read from BASE, the commit before partners-2's code.
//   proveCodeField(exp, f) — a rendered signup or demo-details view: with the new field (<div data-partner-code>) replaced by the
//     old one from BEFORE, the view is byte-identical; and the new field holds the label, the same input (id, max 40, the same
//     placeholder and value), an Apply button, and no answer yet.
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const BASE = 'f5640f13'     // the last commit before partners-2's code (its first code commit is 9cc5edea)
const show = f => execFileSync('git', ['show', `${BASE}:${f}`], { cwd: REPO, maxBuffer: 64e6 }).toString()

/** The block of lines from the line containing `startNeedle` to the first line that is exactly `endLine` (inclusive). */
function blockOf(src, startNeedle, endLine) {
  const at = src.indexOf(startNeedle)
  if (at < 0 || src.indexOf(startNeedle, at + 1) >= 0) return null
  const start = src.lastIndexOf('\n', at) + 1
  const end = src.indexOf(`\n${endLine}\n`, at)
  return end < 0 ? null : src.slice(start, end + endLine.length + 2)
}
const once = (src, needle) => { const i = src.indexOf(needle); return i >= 0 && src.indexOf(needle, i + 1) < 0 }

const EDITS = {
  'proxy.ts': src => {
    const now = "  p.startsWith('/docs/') ||\n  // ── partners-2 (16 November 2026): THE SIGNUP PAGE'S \"APPLY\""
    if (!once(src, now)) return null
    const end = src.indexOf("  p === '/api/signup/code'\n", src.indexOf(now))
    if (end < 0) return null
    return src.slice(0, src.indexOf(now)) + "  p.startsWith('/docs/')\n" + src.slice(end + "  p === '/api/signup/code'\n".length)
  },
  'app/api/signup/route.ts': src => {
    const imp = "import { recordRedemption } from '@/lib/partner-codes-server'   // partners-2\n"
    const blk = blockOf(src, '// ── partners-2 (16 November 2026): A PARTNER CODE', '  if (signupPromoCode) await recordRedemption(supabase, operator.id, signupPromoCode)')
    if (!once(src, imp) || !blk) return null
    return src.replace(imp, '').replace(blk, '')
  },
  'app/(app)/signup/page.tsx': src => {
    const imp = "import PartnerCodeField from '@/components/PartnerCodeField'   // partners-2\n"
    const blk = blockOf(src, '{/* ⛔ UPDATED (partners-2, 16 November 2026)', '          }} />')
    const old = blockOf(show('app/(app)/signup/page.tsx'), "{t.rich('codeLabel'", '          </div>')
    const oldOpen = old && show('app/(app)/signup/page.tsx').lastIndexOf('          <div>\n', show('app/(app)/signup/page.tsx').indexOf(old))
    if (!once(src, imp) || !blk || !old) return null
    const before = show('app/(app)/signup/page.tsx')
    const oldBlock = before.slice(oldOpen, before.indexOf(old) + old.length)
    return src.replace(imp, '').replace(blk, oldBlock)
  },
  'components/DemoGetStarted.tsx': src => {
    const imp = "import PartnerCodeField from '@/components/PartnerCodeField'   // partners-2\n"
    const blk = blockOf(src, '{/* ⛔ UPDATED (partners-2, 16 November 2026)', '                  }} />')
    const before = show('components/DemoGetStarted.tsx')
    const at = before.indexOf('<label htmlFor="demo-promo"')
    if (!once(src, imp) || !blk || at < 0) return null
    const oldStart = before.lastIndexOf('                  <div>\n', at)
    const oldEnd = before.indexOf('                  </div>\n', at) + '                  </div>\n'.length
    return src.replace(imp, '').replace(blk, before.slice(oldStart, oldEnd))
  },
  'app/(app)/admin/page.tsx': src => {
    const type = "  /** partners-2: the partner code it signed up with (from /api/admin), or absent. */\n  referred_code?: string | null\n"
    const badge = blockOf(src, '{/* partners-2: the partner code this truck signed up with', '                          )}')
    if (!once(src, type) || !badge) return null
    return src.replace(type, '').replace(badge, '')
  },
}
const CODE_FILES = Object.keys(EDITS)

function undoCode(file, src) {
  if (!EDITS[file]) return src
  try { return EDITS[file](src) } catch { return null }
}

// ── the rendered field ───────────────────────────────────────────────────────────────────────────────────────────────────────
// A view's HTML may be raw, or sit inside a JSON string (the demo wizard's views): its quotes are then escaped (\"). Every needle
// below is built with the view's own quote form `q`.
const quoteOf = html => (html.includes('data-partner-code="true"') || html.includes('maxLength="40"') ? '"' : '\\"')
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The <div data-partner-code="true"> element in `html` (balanced), or null. */
function fieldOf(html, q = quoteOf(html)) {
  const open = `<div data-partner-code=${q}true${q}>`
  const at = html.indexOf(open)
  if (at < 0 || html.indexOf(open, at + 1) >= 0) return null
  let depth = 0, i = at
  while (i < html.length) {
    const nextOpen = html.indexOf('<div', i + 1), nextClose = html.indexOf('</div>', i + 1)
    if (nextClose < 0) return null
    if (nextOpen >= 0 && nextOpen < nextClose) { depth++; i = nextOpen } else { if (depth === 0) return { start: at, end: nextClose + 6 }; depth--; i = nextClose }
  }
  return null
}
/** BEFORE's old field: the <div> holding the label and the max-40 code input. */
function oldFieldOf(html, q = quoteOf(html)) {
  const inp = html.search(new RegExp(`<input[^>]*maxLength=${esc(q)}40${esc(q)}[^>]*>`))
  if (inp < 0) return null
  const start = html.lastIndexOf('<div><label', inp)
  const end = html.indexOf('</div>', inp)
  return start < 0 || end < 0 ? null : { start, end: end + 6 }
}
const attr = (tag, name, q) => { const m = tag.match(new RegExp(`\\s${name}=${esc(q)}(.*?)${esc(q)}`)); return m ? m[1] : null }

function proveCodeField(exp, f) {
  if (typeof exp !== 'string' || typeof f !== 'string') return { ok: false, problems: ['not an HTML view'] }
  const q = quoteOf(f)
  const nf = fieldOf(f, q), of = oldFieldOf(exp, q)
  // A view the field is not on (another wizard step): it must simply be unchanged.
  if (!nf && !of) return f === exp ? { ok: true, problems: [] } : { ok: false, problems: ['no code field, and the view changed'] }
  if (!nf) return { ok: false, problems: ['no partner-code field in the view'] }
  if (!of) return { ok: false, problems: ['no old code field in BEFORE'] }
  const problems = []
  const swapped = f.slice(0, nf.start) + exp.slice(of.start, of.end) + f.slice(nf.end)
  if (swapped !== exp) problems.push('with the new field swapped for the old one, the view is not byte-identical to BEFORE')
  const field = f.slice(nf.start, nf.end), oldField = exp.slice(of.start, of.end)
  const newInput = (field.match(/<input[^>]*>/) || [''])[0], oldInput = (oldField.match(/<input[^>]*>/) || [''])[0]
  if (attr(newInput, 'maxLength', q) !== '40') problems.push('the input is not max 40')
  if (attr(newInput, 'placeholder', q) !== attr(oldInput, 'placeholder', q)) problems.push('the placeholder changed')
  if (attr(newInput, 'value', q) !== attr(oldInput, 'value', q)) problems.push('the typed value changed')
  if (attr(oldInput, 'id', q) && attr(newInput, 'id', q) !== attr(oldInput, 'id', q)) problems.push('the input id changed')
  if (!new RegExp(`<button type=${esc(q)}button${esc(q)}[^>]*>[^<]+</button>`).test(field)) problems.push('no Apply button')
  if (/data-code-applied|data-code-error/.test(field)) problems.push('an answer is showing before Apply')
  if (!/<label[^>]*>[^<]*(code|Code)/.test(field)) problems.push('no code label')
  return { ok: !problems.length, problems }
}

const LANDED = (() => { try { return fs.readFileSync(path.join(REPO, 'components/PartnerCodeField.tsx'), 'utf8').includes('data-partner-code') } catch { return false } })()

module.exports = { BASE, CODE_FILES, undoCode, proveCodeField, fieldOf, LANDED }
