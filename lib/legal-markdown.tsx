// lib/legal-markdown.tsx
// A DELIBERATELY TINY MARKDOWN RENDERER, FOR THE LEGAL DOCUMENTS ONLY.
//
// ── WHY NOT react-markdown ────────────────────────────────────────────────────────────────────────────
// No markdown dependency exists in this project and adding one for two static pages means a parser, a
// GFM plugin and their transitive tree shipped to a public route, to render a construct set that is
// FULLY ENUMERABLE. These two documents use exactly six block types and one inline type, verified by
// counting every construct in both files: no links, no code, no blockquotes, no ordered lists, no nested
// lists, no italics. A dependency would be more code, not less.
//
// ── 🔴 WHY NOT HAND-CONVERT THE MARKDOWN TO JSX ───────────────────────────────────────────────────────
// Because that creates a SECOND COPY of legal text that must be kept in step with the first by hand —
// the exact failure mode this codebase records over and over (three drifted DemoModeBanners, two drifted
// PLAN_PRICES, the landing page's render-time overrides). It would also make every future amendment a
// transcription exercise on a document where a dropped "not" is a legal problem.
// The .md files in content/legal/ ARE the source of truth. The page reads them. An amendment is an edit
// to one file, and nothing has to be re-typed.
//
// ── WHAT IT SUPPORTS, AND NOTHING ELSE ───────────────────────────────────────────────────────────────
// BLOCK:  # h1 · ## h2 · ### h3 · --- rule · | tables | · - lists · paragraphs
// INLINE: **bold**
// ⚠️ Anything else passes through as LITERAL TEXT rather than being silently dropped. That is the correct
// failure direction for legal copy: an unrendered construct is visible and reportable, a swallowed clause
// is not. If a future amendment introduces a link or an ordered list, it will render as plain text and
// look wrong — which is the signal to extend this file.
import React from 'react'

/** `**bold**` → <strong>. Everything else is emitted verbatim, including emoji and punctuation.
 *  🔴 SPLIT-AND-REJOIN, NOT REGEX-REPLACE: every segment of the original string is emitted exactly once,
 *  so no character can be lost. An unmatched `**` simply renders as itself. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const parts = text.split('**')
  return parts.map((seg, i) =>
    // Odd indices sit between a pair of `**` ⇒ bold. A trailing unmatched `**` leaves a final even
    // segment, which renders plain — the literal asterisks are then visible rather than eaten.
    i % 2 === 1
      ? <strong key={`${keyBase}-b${i}`}>{seg}</strong>
      : <React.Fragment key={`${keyBase}-t${i}`}>{seg}</React.Fragment>,
  )
}

/** Render one legal markdown document. */
export function renderLegalMarkdown(src: string): React.ReactNode[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Blank
    if (!line.trim()) { i++; continue }

    // Horizontal rule — `---` ALONE on a line. Checked before the table branch so a table's own
    // `| --- |` separator (which starts with `|`) can never be mistaken for one.
    if (line.trim() === '---') { out.push(<hr key={`k${key++}`} className="my-8 border-slate-200" />); i++; continue }

    // Headings
    if (line.startsWith('### ')) { out.push(<h3 key={`k${key++}`} className="text-sm font-bold text-slate-900 mt-6 mb-2">{inline(line.slice(4), `k${key}`)}</h3>); i++; continue }
    if (line.startsWith('## '))  { out.push(<h2 key={`k${key++}`} className="text-base font-bold text-slate-900 mt-8 mb-3">{inline(line.slice(3), `k${key}`)}</h2>); i++; continue }
    if (line.startsWith('# '))   { out.push(<h1 key={`k${key++}`} className="text-2xl font-black text-slate-900 mb-4">{inline(line.slice(2), `k${key}`)}</h1>); i++; continue }

    // Table — consecutive lines starting `|`. Row 2 is the `| --- |` separator and is DISCARDED (it is
    // formatting, not content); row 1 is the header.
    if (line.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i].replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim()))
        i++
      }
      const [head, , ...body] = rows
      out.push(
        // overflow-x-auto: a 2-3 column table on a narrow phone must scroll rather than force the PAGE
        // to scroll sideways.
        <div key={`k${key++}`} className="my-4 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr>{head.map((c, ci) => (
                <th key={ci} className="border-b border-slate-300 py-2 pr-4 font-bold text-slate-900 align-top">{inline(c, `h${key}-${ci}`)}</th>
              ))}</tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>{r.map((c, ci) => (
                  <td key={ci} className="border-b border-slate-100 py-2 pr-4 align-top">{inline(c, `d${key}-${ri}-${ci}`)}</td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // Unordered list — consecutive `- ` lines.
    if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) { items.push(lines[i].slice(2)); i++ }
      out.push(
        <ul key={`k${key++}`} className="list-disc pl-5 space-y-2 my-4">
          {items.map((it, ii) => <li key={ii}>{inline(it, `l${key}-${ii}`)}</li>)}
        </ul>,
      )
      continue
    }

    // Paragraph — consume to the next blank line or block start, joined with spaces (markdown's own
    // soft-wrap rule).
    const para: string[] = []
    while (
      i < lines.length && lines[i].trim() &&
      !lines[i].startsWith('#') && !lines[i].startsWith('|') && !lines[i].startsWith('- ') &&
      lines[i].trim() !== '---'
    ) { para.push(lines[i].trim()); i++ }
    out.push(<p key={`k${key++}`} className="my-3">{inline(para.join(' '), `p${key}`)}</p>)
  }

  return out
}
