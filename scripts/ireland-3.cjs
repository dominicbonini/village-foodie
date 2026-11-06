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
// ⚠️ RE-PINNED (world-countries-2, 1 November 2026, docs/world-countries-2-report.md §1): the Terms of Service (§4), the
// Country-specific terms (eight countries appended, re-dated) and lib/legal.ts (two dates, TERMS_VERSION) are read as they were
// before world-countries-2 — scripts/_lp-world-countries-2.cjs asBefore() removes exactly its named change and throws if it is
// not there, so every other byte is still pinned here. The new text itself is proved by scripts/world-countries-2.cjs.
const read = f => require('./_lp-world-countries-2.cjs').asBefore(f, fs.readFileSync(path.join(REPO, f), 'utf8'))
const before = f => execFileSync('git', ['show', `${BEFORE_REF}:${require('./_moved-paths.cjs').pathAt(BEFORE_REF, f)}`], { cwd: REPO, encoding: 'utf8' })
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
  // ⚠️ RE-PINNED (demo-2b, 31 October 2026, docs/demo-2b-report.md): the privacy policy gained the demo section and its
  // date moved — it must now be its old self + EXACTLY that named change (scripts/_demo2b-privacy.cjs).
  t('content/legal/terms-and-conditions.md is byte-identical (the GB documents)', read('content/legal/terms-and-conditions.md') === before('content/legal/terms-and-conditions.md'))
  t('content/legal/privacy-policy.md is the GB document + only demo-2b\'s named change (the demo section, the date)', read('content/legal/privacy-policy.md') === require('./_demo2b-privacy.cjs').apply(before('content/legal/privacy-policy.md')))
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
  // ⚠️ RE-PINNED (legal-languages-1, 1 November 2026): content/legal now holds a folder per language (content/legal/<base>/, the
  // translations, proved by scripts/legal-languages-1.cjs); this check reads the English documents, the folder's FILES, as before.
  const files = fs.readdirSync(path.join(REPO, 'content/legal')).filter(f => fs.statSync(path.join(REPO, 'content/legal', f)).isFile())
  const flagged = files.filter(f => read(`content/legal/${f}`).includes('[FLAG'))
  t(`no "[FLAG" in any of content/legal's ${files.length} files`, files.length >= 3 && flagged.length === 0, flagged.join(', '))

  // ── 4 · the dates and the version ──
  console.log('\n── lib/legal.ts')
  const L = read('lib/legal.ts'), LB = before('lib/legal.ts')
  t(`COUNTRY_TERMS_UPDATED = '${DATE}', the page's own line`, L.includes(`export const COUNTRY_TERMS_UPDATED = '${DATE}'`))
  // ⚠️ RE-PINNED (demo-2b, 31 October 2026, docs/demo-2b-report.md): TERMS_VERSION moved on to '2026-10-31' with the Privacy
  // Policy's demo section (the latest of the three documents' dates; scripts/_lp-demo2b.cjs).
  const TV = require('./_lp-demo2b.cjs').TERMS_VERSION_NEW
  t(`TERMS_VERSION = demo-2b's '${TV}' (was '2026-10-20' at ${BEFORE_REF}; ${VERSION} after anz-terms): the latest of the three documents' dates`, L.includes(`export const TERMS_VERSION = '${TV}'`) && LB.includes("export const TERMS_VERSION = '2026-10-20'"))
  // ⚠️ RE-PINNED (demo-2b, 31 October 2026, docs/demo-2b-report.md): PRIVACY_UPDATED moved with the privacy policy's own
  // line (scripts/_demo2b-privacy.cjs) — it must read exactly demo-2b's date; TERMS_UPDATED is still unchanged.
  const D2B = require('./_demo2b-privacy.cjs')
  for (const k of ['PRIVACY_UPDATED', 'TERMS_UPDATED']) {
    const re = new RegExp(`export const ${k} = '[^']+'`)
    const want = k === 'PRIVACY_UPDATED' ? `export const PRIVACY_UPDATED = '${D2B.NEW_DATE}'` : re.exec(LB)?.[0]
    t(k === 'PRIVACY_UPDATED' ? `${k} = demo-2b's date (was ${D2B.OLD_DATE})` : `${k} unchanged`, re.exec(L)?.[0] === want && (k !== 'PRIVACY_UPDATED' || re.exec(LB)?.[0] === `export const PRIVACY_UPDATED = '${D2B.OLD_DATE}'`))
  }
  const strip = s => s.replace(/\/\*\*[\s\S]*?\*\//g, '')
  // ⚠️ RE-PINNED (legal-languages-1, 1 November 2026): lib/legal.ts gained the translated documents' addresses — two imports and one
  // block at the end of the file (legalPath and its helpers), every existing line unchanged. PRECISE: exactly those are taken out,
  // and the run fails if the block is not where it is named; everything else is still compared.
  const LL1_MARK = '\n// ══ legal-languages-1 (1 November 2026'
  const LL1_IMPORTS = "import { COUNTRY_PATH_SEGMENTS, HATCHGRAB_ORIGIN } from '@/lib/marketing-country'\nimport { LANGUAGE_BASES, isEnglish, overrideChain, resolveLocale, type AppLocale } from '@/lib/i18n/locales'\n\n"
  const withoutLL1 = x => { if (!x.includes(LL1_MARK) || !x.includes(LL1_IMPORTS)) throw new Error('legal-languages-1 block not found in lib/legal.ts'); return x.slice(0, x.indexOf(LL1_MARK)).replace(LL1_IMPORTS, '') }
  t('lib/legal.ts changed nothing else in code (doc comments aside)', strip(withoutLL1(L)).replace(`'${DATE}'`, "'19 October 2026'").replace(`'${TV}'`, "'2026-10-20'").replace(`PRIVACY_UPDATED = '${D2B.NEW_DATE}'`, `PRIVACY_UPDATED = '${D2B.OLD_DATE}'`) === strip(LB))

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
