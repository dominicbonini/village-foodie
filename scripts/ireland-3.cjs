// scripts/ireland-3.cjs — the Irish section of the Country-specific terms (21 October 2026, docs/ireland-3-report.md).
// Against the documents at 7fcd4fc9 (the commit this started from) and the draft in docs/ireland-2-report.md §2.1 at
// that commit, it proves:
//   1. content/legal/country-specific-terms.md is BEFORE with exactly two changes: the "Last updated" line (19 → 21
//      October 2026) and a `## Ireland` section appended after the United States one. The intro and the US section
//      are byte-identical; the Terms of Service and the Privacy Policy (the GB documents) are byte-identical;
//   2. the Ireland section is the §2.1 draft paragraph for paragraph, with only Dominic's named changes (21 October
//      2026): every [FLAG n] marker removed, "Our representative in the EU" left out, and the allergens paragraph saying
//      what the product does in Ireland (allergens against each dish; a card helps fill them in, never shown alone);
//   3. no "[FLAG" anywhere in content/legal;
//   4. lib/legal.ts: COUNTRY_TERMS_UPDATED moved with the page's line, TERMS_VERSION '2026-10-21' (the latest of the
//      three dates), PRIVACY_UPDATED and TERMS_UPDATED unchanged;
//   5. the page renders through the real renderer: BEFORE's HTML with the date changed, then the Ireland section.
// Reads files and git only; no database, no network.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'ireland-3' })
const BEFORE_REF = '7fcd4fc9'
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const before = f => execFileSync('git', ['show', `${BEFORE_REF}:${f}`], { cwd: REPO, encoding: 'utf8' })
let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) } }

const FILE = 'content/legal/country-specific-terms.md'
// ⚠️ RE-PINNED (anz-terms, 22 October 2026, docs/anz-terms-report.md): the page is now dated 22 October 2026, and the
// Australia and New Zealand sections follow Ireland's. The Ireland section is read up to `## Australia`; the date, the
// constants and the version are the current ones (scripts/anz-terms.cjs proves the Ireland section byte-identical to
// what ireland-3 published).
const DATE = '22 October 2026', VERSION = '2026-10-22'
const OLD_LINE = '**Last updated:** 19 October 2026', NEW_LINE = `**Last updated:** ${DATE}`
const paras = s => s.split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)

/** The approved allergens paragraph: the draft's, with two sentences before "HatchGrab shows exactly what you enter". */
const ALLERGEN_ADDED = 'In Ireland, HatchGrab shows allergens against each dish on your menu. You can upload an allergen card to help fill them in, but the card is not shown on its own in place of them. '

;(async () => {
  // ── 1 · the file is BEFORE + the date + the Ireland section ──
  console.log(`\n── ${FILE}`)
  const B = before(FILE), A = read(FILE)
  const cut = A.indexOf('\n## Ireland\n')
  t('there is one `## Ireland` heading, after the United States section', cut > A.indexOf('## United States') && A.indexOf('\n## Ireland\n', cut + 1) === -1)
  t(`BEFORE had "${OLD_LINE}" once; AFTER has "${NEW_LINE}" once and not the old line`, B.split(OLD_LINE).length === 2 && A.split(NEW_LINE).length === 2 && !A.includes(OLD_LINE))
  const head = A.slice(0, cut)   // up to and including the US section's last newline; A[cut] is the blank line
  t('everything before `## Ireland` is BEFORE byte for byte, with only the "Last updated" line changed', head === B.replace(OLD_LINE, NEW_LINE), `${head.length} vs ${B.length} bytes`)
  const usB = B.slice(B.indexOf('## United States')), usA = A.slice(A.indexOf('## United States'), cut)
  t(`the United States section is byte-identical (${Buffer.byteLength(usA)} bytes)`, usA === usB)
  for (const f of ['content/legal/terms-and-conditions.md', 'content/legal/privacy-policy.md']) t(`${f} is byte-identical (the GB documents)`, read(f) === before(f))
  t('the file ends with one newline, as BEFORE did', A.endsWith('.\n') && !A.endsWith('\n\n') && B.endsWith('.\n'))

  // ── 2 · the Ireland section is the approved draft ──
  console.log('\n── the Ireland section against docs/ireland-2-report.md §2.1')
  const rep = before('docs/ireland-2-report.md')
  const draftBlock = rep.slice(rep.indexOf('### 2.1 The draft'), rep.indexOf('### 2.2'))
  const quoted = draftBlock.split('\n').filter(l => l.startsWith('>')).map(l => l.replace(/^> ?/, '')).join('\n')
  const draft = paras(quoted)
  const EU_REP = '**Our representative in the EU.**'
  t('the draft (at BEFORE) has the EU representative paragraph and [FLAG n] markers to remove', draft.some(p => p.startsWith(EU_REP)) && /\[FLAG \d+\]/.test(quoted))
  const allergenAt = draft.findIndex(p => p.startsWith('**Allergens.**'))
  const expected = draft.filter(p => !p.startsWith(EU_REP)).map(p => p.replace(/ ?\*\*\[FLAG \d+\]\*\*/g, '').trim())
    .map(p => (p.startsWith('**Allergens.**') ? p.replace('HatchGrab shows exactly what you enter', ALLERGEN_ADDED + 'HatchGrab shows exactly what you enter') : p))
  const ieEnd = A.indexOf('\n## Australia\n') === -1 ? A.length : A.indexOf('\n## Australia\n')
  const ie = paras(A.slice(cut + 1, ieEnd))
  const diff = expected.map((p, i) => (p === ie[i] ? null : i)).filter(i => i !== null)
  t(`the section is the draft, paragraph for paragraph (${expected.length}), flags removed, EU representative left out`, ie.length === expected.length && diff.length === 0, diff.length ? `first difference at ${diff[0]}:\n        want ${expected[diff[0]]}\n        got  ${ie[diff[0]]}` : `${ie.length} vs ${expected.length}`)
  t('it keeps the draft\'s shape: `## Ireland`, "For food truck operators", "Privacy, for everyone in Ireland"', JSON.stringify(ie.filter(p => p.startsWith('#'))) === JSON.stringify(['## Ireland', '### For food truck operators', '### Privacy, for everyone in Ireland']))
  t('"Where your data is kept" is kept, without its flag', ie.some(p => p.startsWith('**Where your data is kept.**') && !p.includes('FLAG')))
  t('no EU representative paragraph and no "representative" anywhere in the section', !ie.some(p => /representative/i.test(p)))
  const allergen = ie.find(p => p.startsWith('**Allergens.**')) || ''
  t('allergens: shown against each dish; a card can be uploaded to help fill them in; never shown on its own', allergenAt >= 0 && /shows allergens against each dish/.test(allergen) && /upload an allergen card to help fill them in/.test(allergen) && /not shown on its own/.test(allergen))
  t('Irish/UK spelling in the section (recognises, not -izes)', /recognises/.test(A.slice(cut, ieEnd)) && !/recogniz|organiz|authoriz|behavior\b/.test(A.slice(cut, ieEnd)))

  // ── 3 · no flag left anywhere ──
  console.log('\n── content/legal')
  const files = fs.readdirSync(path.join(REPO, 'content/legal'))
  const flagged = files.filter(f => read(`content/legal/${f}`).includes('[FLAG'))
  t(`no "[FLAG" in any of content/legal's ${files.length} files`, files.length >= 3 && flagged.length === 0, flagged.join(', '))

  // ── 4 · the dates and the version ──
  console.log('\n── lib/legal.ts')
  const L = read('lib/legal.ts'), LB = before('lib/legal.ts')
  t(`COUNTRY_TERMS_UPDATED = '${DATE}', the page's own line`, L.includes(`export const COUNTRY_TERMS_UPDATED = '${DATE}'`))
  t(`TERMS_VERSION = '${VERSION}' (was '2026-10-20' at ${BEFORE_REF}): the latest of the three documents' dates`, L.includes(`export const TERMS_VERSION = '${VERSION}'`) && LB.includes("export const TERMS_VERSION = '2026-10-20'"))
  for (const k of ['PRIVACY_UPDATED', 'TERMS_UPDATED']) {
    const re = new RegExp(`export const ${k} = '[^']+'`)
    t(`${k} unchanged`, re.exec(L)?.[0] === re.exec(LB)?.[0])
  }
  const strip = s => s.replace(/\/\*\*[\s\S]*?\*\//g, '')
  t('lib/legal.ts changed nothing else in code (doc comments aside)', strip(L).replace(`'${DATE}'`, "'19 October 2026'").replace(`'${VERSION}'`, "'2026-10-20'") === strip(LB))

  // ── 5 · the rendered page ──
  console.log('\n── /country-terms, through the real renderer')
  const R = await kit.bundle('legal-md-html', "export { renderLegalMarkdownHtml } from '@/lib/legal-markdown-html'")
  const hB = R.renderLegalMarkdownHtml(B), hA = R.renderLegalMarkdownHtml(A), hIe = R.renderLegalMarkdownHtml(A.slice(cut + 1, ieEnd))
  t('the page\'s HTML is BEFORE\'s with the date changed, then the Ireland section\'s (then any later country\'s)', hA.startsWith(hB.replace('19 October 2026', DATE) + hIe), `${hA.length} vs ${hB.length}+${hIe.length}`)
  const flat = x => x.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&#x2019;/g, "'").replace(/\s+/g, '')
  const words = s => s.replace(/\*\*/g, '').replace(/^#+ /gm, '').replace(/\s+/g, '')
  const missing = ie.map(words).filter(p => !flat(hA).includes(p))
  t(`every Ireland paragraph is on the page (${ie.length})`, missing.length === 0, missing.slice(0, 2).join(' · '))
  t('the headings render in order: United States, then Ireland', /<h2[^>]*>United States<\/h2>[\s\S]*<h2[^>]*>Ireland<\/h2>/.test(hA))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
