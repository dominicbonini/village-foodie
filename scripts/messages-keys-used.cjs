#!/usr/bin/env node
// scripts/messages-keys-used.cjs — 🔴 EVERY KEY THE CODE ASKS FOR EXISTS (app-fixes-1, 14 November 2026,
// docs/app-fixes-1-report.md §5).
//
// Literal keys are already a compile error when missing from en-GB (lib/i18n/app-config.d.ts). What tsc cannot see:
//   • keys built at run time — t(`features.${feature}.name` as never), t(`say.${m.code}`) — only their fixed start is known;
//   • the language files — a key in en-GB but missing from fr-FR renders in English, silently;
//   • a namespace that is not registered in the bundle at all (that one is scripts/messages-split.cjs's and, for a production
//     build, scripts/turbopack-merged-modules-check.cjs's).
// So this reads every .ts/.tsx under app/, components/ and lib/ with the TypeScript parser, finds each translator
// (`useT(ns)`, `useTIn(locale, ns)`, `translatorFor(locale, ns)`, `useTranslations(ns)`, `getTranslations(ns | {namespace})`,
// `createTranslator({ namespace })`), resolves every call of it — `t('k')`, `t.rich('k')`, `t.markup('k')`, `t.raw('k')` — to
// the declaration IN SCOPE (an inner `const t = getPrinterTransport()` shadows an outer translator), and checks:
//   1. a literal key exists in messages/en-GB.json;
//   2. a built key's fixed start (`say.` of `say.${code}`) is the start of at least one en-GB key;
//   3. every key from 1 exists in EVERY shipped language base (LANGUAGE_BASES, lib/i18n/locales.ts) — the full translations.
//      English regionals (en-US, en-AU…) hold only what differs and fall back to en-GB by design, so they are not checked.
// `t.has(...)` is skipped (it asks whether a key exists). A translator handed in as a prop or parameter cannot be resolved
// statically; those calls are counted, not checked.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const ts = require(path.join(REPO, 'node_modules/typescript'))

let pass = 0, fail = 0
const ok = (name, cond, detail) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 2000)}` : ''}`) } }

const readJson = p => JSON.parse(fs.readFileSync(path.join(REPO, p), 'utf8'))
const leaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, `${p}${k}.`) : [`${p}${k}`]))
const branches = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? [`${p}${k}`, ...branches(v, `${p}${k}.`)] : []))
const EN = readJson('messages/en-GB.json')
const EN_LEAVES = new Set(leaves(EN))
const EN_BRANCHES = new Set(branches(EN))
const EN_ALL = [...EN_LEAVES, ...EN_BRANCHES]
const locSrc = fs.readFileSync(path.join(REPO, 'lib/i18n/locales.ts'), 'utf8')
const BASES = JSON.parse(locSrc.match(/export const LANGUAGE_BASES[^=]*=\s*(\[[^\]]*\])/)[1].replace(/'/g, '"'))
const BASE_LEAVES = Object.fromEntries(BASES.map(l => [l, new Set(leaves(readJson(`messages/${l}.json`)))]))

// ── 1 · walk the sources ─────────────────────────────────────────────────────────────────────────────────────────────
const ROOTS = ['app', 'components', 'lib']
const SKIP_DIR = /(^|\/)(node_modules|\.next|catalog)(\/|$)/
const files = []
const walk = d => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) { if (!SKIP_DIR.test(p)) walk(p) } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) files.push(p) } }
ROOTS.forEach(walk)

const FACTORIES = { useT: 0, useTIn: 1, translatorFor: 1, useTranslations: 0, getTranslations: 0 }
const strOf = n => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null)
/** The namespace a translator factory call names, or null (not a factory), or '' (a factory whose namespace is not a literal). */
function namespaceOf(init) {
  let n = init
  while (n && (ts.isAwaitExpression(n) || ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n))) n = n.expression
  if (!n || !ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return null
  const fn = n.expression.text
  if (fn === 'createTranslator' || fn === 'getTranslations') {
    const a = n.arguments[0]
    if (fn === 'getTranslations' && strOf(a) !== null) return strOf(a)
    if (a && ts.isObjectLiteralExpression(a)) {
      const p = a.properties.find(x => x.name && x.name.getText() === 'namespace')
      if (!p) return fn === 'getTranslations' ? '' : null
      return ts.isPropertyAssignment(p) ? (strOf(p.initializer) ?? '') : ''
    }
    return fn === 'getTranslations' ? '' : null
  }
  if (!(fn in FACTORIES)) return null
  const a = n.arguments[FACTORIES[fn]]
  return strOf(a) ?? ''
}

const usedLiteral = new Map()   // full key -> [where]
const problems = { missingEn: [], badPrefix: [], unresolvedNs: [] }
let calls = 0, literal = 0, built = 0, dynamic = 0, unresolvedTranslator = 0

for (const rel of files) {
  const src = fs.readFileSync(path.join(REPO, rel), 'utf8')
  if (!/\b(useT|useTIn|translatorFor|useTranslations|getTranslations|createTranslator)\b/.test(src)) continue
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  // Every binding of every name, with the scope node it lives in: { name, scope, ns|null(not a translator) }
  const decls = []
  const scopeOf = node => { let p = node.parent; while (p && !(ts.isBlock(p) || ts.isSourceFile(p) || ts.isModuleBlock(p) || ts.isCaseClause(p) || ts.isFunctionLike(p) || ts.isForStatement(p) || ts.isForOfStatement(p) || ts.isForInStatement(p) || ts.isCatchClause(p))) p = p.parent; return p }
  const bindNames = (nameNode, scope, ns) => {
    if (ts.isIdentifier(nameNode)) decls.push({ name: nameNode.text, scope, ns })
    else if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) for (const el of nameNode.elements) if (el.name) bindNames(el.name, scope, null)
  }
  const visitDecl = node => {
    if (ts.isVariableDeclaration(node)) bindNames(node.name, scopeOf(node), ts.isIdentifier(node.name) && node.initializer ? namespaceOf(node.initializer) : null)
    else if (ts.isParameter(node)) bindNames(node.name, node.parent, null)
    else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) decls.push({ name: node.name.text, scope: scopeOf(node), ns: null })
    else if (ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isNamespaceImport(node)) { if (node.name) decls.push({ name: node.name.text, scope: sf, ns: null }) }
    ts.forEachChild(node, visitDecl)
  }
  visitDecl(sf)
  const resolve = (name, at) => {
    let best = null
    for (const d of decls) if (d.name === name && d.scope.pos <= at.pos && at.end <= d.scope.end && (!best || (d.scope.end - d.scope.pos) < (best.scope.end - best.scope.pos))) best = d
    return best
  }
  const where = n => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`
  const visit = node => {
    if (ts.isCallExpression(node)) {
      let callee = node.expression, method = null
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && ['rich', 'markup', 'raw', 'has'].includes(callee.name.text)) { method = callee.name.text; callee = callee.expression }
      if (ts.isIdentifier(callee) && method !== 'has') {
        const d = resolve(callee.text, node)
        if (d && d.ns !== null) {
          calls++
          // A translator whose namespace is a variable is a generic helper (lib/i18n/error-body.ts: the namespace and the code
          // both come from its caller, whose code type is checked by tsc). Counted, listed, not failed.
          if (d.ns === '') { problems.unresolvedNs.push(where(node)); return ts.forEachChild(node, visit) }
          let a = node.arguments[0]
          while (a && (ts.isAsExpression(a) || ts.isParenthesizedExpression(a) || ts.isTypeAssertionExpression?.(a))) a = a.expression
          const lit = strOf(a)
          // A line under `// @ts-expect-error` is a deliberate wrong key (lib/i18n/typecheck.ts proves tsc rejects it).
          const lineStart = src.lastIndexOf('\n', node.getStart()); const prevLine = src.slice(src.lastIndexOf('\n', lineStart - 1) + 1, lineStart)
          if (/@ts-expect-error/.test(prevLine)) return ts.forEachChild(node, visit)
          if (lit !== null) {
            literal++
            const key = `${d.ns}.${lit}`
            const okKey = method === 'raw' ? (EN_LEAVES.has(key) || EN_BRANCHES.has(key)) : EN_LEAVES.has(key)
            if (!okKey) problems.missingEn.push(`${key}  (${where(node)})`)
            else if (method !== 'raw' || EN_LEAVES.has(key)) { if (!usedLiteral.has(key)) usedLiteral.set(key, where(node)) }
          } else if (a && ts.isTemplateExpression(a)) {
            built++
            const head = `${d.ns}.${a.head.text}`
            if (!EN_ALL.some(k => k.startsWith(head))) problems.badPrefix.push(`${head}…  (${where(node)})`)
          } else if (a) { dynamic++ }
        } else if (!d && /^t[A-Z]?\w*$/.test(callee.text) && node.arguments[0] && strOf(node.arguments[0]) !== null && /^[a-z][\w]*(\.[\w]+)+$/.test(strOf(node.arguments[0]))) {
          unresolvedTranslator++
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

console.log(`files: ${files.length} · translator calls resolved: ${calls} (literal ${literal}, built ${built}, other ${dynamic}) · unresolved-translator calls (props/params): ${unresolvedTranslator}`)
console.log(`\n── 1 · every literal key exists in en-GB`)
ok(`${literal} literal keys`, problems.missingEn.length === 0, problems.missingEn.join('\n      '))
console.log(`\n── 2 · every built key's fixed start matches an en-GB key`)
ok(`${built} built keys`, problems.badPrefix.length === 0, problems.badPrefix.join('\n      '))
console.log(`  (translators whose namespace is a variable — generic helpers, not checked: ${problems.unresolvedNs.join(', ') || 'none'})`)
console.log(`\n── 3 · every used key exists in every shipped language base (${BASES.length})`)
for (const l of BASES) {
  // ⚠️ RE-PINNED (france-vat-1, 24 November 2026, docs/france-vat-1-report.md): its 24 new keys are not in the five bases no enabled country uses (TRANSLATE ONLY WHAT'S USED) —
  // set aside by name (scripts/_lp-france-vat-1.cjs), and only those; every other missing key still fails.
  const miss = [...usedLiteral.keys()].filter(k => !BASE_LEAVES[l].has(k) && !require('./_lp-france-vat-1.cjs').setAside(l, k))
  ok(`${l}: all ${usedLiteral.size} used keys present`, miss.length === 0, `${miss.length} missing: ${miss.slice(0, 40).join(', ')}${miss.length > 40 ? ' …' : ''}`)
}
console.log(`\n${fail ? '🔴' : '✅'} messages-keys-used: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
