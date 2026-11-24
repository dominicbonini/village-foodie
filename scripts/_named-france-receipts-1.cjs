// scripts/_named-france-receipts-1.cjs (france-receipts-1, 24 November 2026, docs/france-receipts-1-report.md): the NAMED DIFFERENCE this
// work makes to the three approved customer outputs, for the harnesses that compare an output with a BEFORE capture. Each function takes
// exactly france-receipts-1's insertions OUT of an AFTER value — found where they must be, counted — so the rest is compared as before.
// Its own proof, against this work's starting commit, is scripts/france-receipts-1.cjs §A.
//
//   stripEmail(email)        the customer confirmation email ({ html, text, … }): the receipt part (" · Receipt no. N") and the date-of-sale
//                            line after the order number, the 293 B row under the total, the business block above "Powered by"; the text
//                            part's receipt / date lines under the title. → { email, n } (n = how many order-number insertions were found).
//   stripTicketLines(lines)  the ticket's line model: the receipt block — after a divider (its own, or the notes' closing rule), the receipt
//                            number, the date of sale and the business details — directly above the centred footer. → { lines, n }.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'

/** A date of sale as lib/receipt.ts writes it: a numeric date, a space, a clock ("24/11/2026 12:41", "11/24/2026 6:41 PM", "24.11.2026 12:41"). */
const SOLD_AT = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\.? \d{1,2}[:.h]\d{2}(?:[\s  ]?(?:AM|PM|am|pm|a\.m\.|p\.m\.))?$/
const DATE_SPAN = /(letter-spacing:0\.06em">[^<]*?)(?: · [^<]*)?<br><span style="font-size:12px;font-weight:400;letter-spacing:0;text-transform:none">([^<]*)<\/span>(<\/p>)/
const BUSINESS_DIV = /\n {2}<div style="margin-top:16px;padding-top:12px;border-top:1px solid #f1f5f9;font-size:11px;line-height:1\.5;color:#94a3b8;text-align:center">\n {4}[\s\S]*?\n {2}<\/div>\n(?=\n {2}<p style="text-align:center;margin-top:20px)/
const FRANCHISE_ROW = /<tr><td colspan="2" style="padding:4px 0;font-size:12px;color:#94a3b8">TVA non applicable, art\. 293 B du CGI<\/td><\/tr>/

function stripEmail(email) {
  if (!email || typeof email.html !== 'string') return { email, n: 0 }
  let n = 0
  const html = email.html
    .replace(DATE_SPAN, (_, a, date, c) => { if (SOLD_AT.test(date)) { n++; return a + c } return _ })
    .replace(BUSINESS_DIV, '').replace(FRANCHISE_ROW, '')
  let text = email.text
  if (typeof text === 'string') {
    const ls = text.split('\n')
    if (SOLD_AT.test(ls[1] ?? '')) ls.splice(1, 1)
    else if (SOLD_AT.test(ls[2] ?? '')) ls.splice(1, 2)
    text = ls.join('\n')
  }
  return { email: { ...email, html, ...(typeof text === 'string' ? { text } : {}) }, n }
}

function stripTicketLines(lines) {
  if (!Array.isArray(lines)) return { lines, n: 0 }
  // The footer is the run of centred lines at the very END (the truck's name, "printed …"); a reprint banner at the top is centred too.
  let end = lines.length
  while (end > 0 && lines[end - 1] && lines[end - 1].align === 'center' && !lines[end - 1].divider) end--
  let j = end - 1
  while (j >= 0 && lines[j] && !lines[j].divider && !lines[j].bold && !lines[j].invert && !lines[j].size && typeof lines[j].text === 'string' && lines[j].text.trim()) j--
  if (j < 0 || !lines[j]?.divider || j === end - 1) return { lines, n: 0 }
  // A plain block between a divider and the centred footer can only be the receipt block: without it the line above the footer is the
  // payment line or TOTAL (bold), an included-tax line under TOTAL (bold above it, no divider), or the notes' closing rule itself.
  const notesRule = lines[j - 1] && lines[j - 1].invert
  return { lines: [...lines.slice(0, notesRule ? j + 1 : j), ...lines.slice(end)], n: 1 }
}

module.exports = { SOLD_AT, stripEmail, stripTicketLines }
