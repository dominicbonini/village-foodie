// scripts/_legal-followups-named.cjs — the named change legal-followups-privacy-link (19 October 2026;
// docs/legal-follow-ups-report.md) as ONE transform of a BEFORE string, shared by the harnesses that pin customer
// emails and the order page. A MODULE (listed under shared_modules in scripts/harnesses.json).
//   • a customer email's footer: " · Privacy" (a link to https://www.hatchgrab.com/privacy) after "Powered by HatchGrab"
//     in the HTML; "Privacy: https://www.hatchgrab.com/privacy" in the text — on its own line where the footer is on its
//     own line, after a space where the footer ends a one-line text (lib/email-privacy.ts);
//   • the order page: a small "Privacy" link under each "Place order" (after the pay line that sits under it), and under
//     the confirmation page's "Back to …" link.
// PRECISE: exact markup, built the way the code builds it. Nothing else moves.
const URL = 'https://www.hatchgrab.com/privacy'
const LINK_HTML = ` · <a href="${URL}" style="color:inherit;text-decoration:underline">Privacy</a>`
const PAGE_LINK = '<a href="/privacy" target="_blank" rel="noopener noreferrer" class="underline hover:text-slate-600">Privacy</a>'
function emailPrivacy(s) {
  if (typeof s !== 'string' || s.includes(URL)) return s
  return s
    .replace(/(Powered by <a href="https:\/\/hatchgrab\.com"[^>]*>HatchGrab<\/a>)/g, `$1${LINK_HTML}`)
    .replace(/(Powered by HatchGrab · hatchgrab\.com)(<\/p>)/g, `$1${LINK_HTML}$2`)
    .replace(/(\n)(Powered by HatchGrab — hatchgrab\.com)/g, `$1$2\nPrivacy: ${URL}`)
    .replace(/([^\n])( Powered by HatchGrab — hatchgrab\.com)/g, `$1$2 Privacy: ${URL}`)
}
function orderPagePrivacy(s) {
  if (typeof s !== 'string' || s.includes('href="/privacy"')) return s
  return s
    .replace(/(<p class="text-center text-slate-400 text-xs mt-2">[^<]*<\/p>)/g, `$1<p class="text-center text-slate-400 text-xs mt-1">${PAGE_LINK}</p>`)
    .replace(/(<a href="\/trucks\/[^"]+\/order" class="block w-full bg-slate-900 [^"]*">[^<]*<\/a>)/g, `$1<p class="text-slate-400 text-xs mt-4">${PAGE_LINK}</p>`)
}
const both = s => orderPagePrivacy(emailPrivacy(s))
/** The other direction, for harnesses that pin TAG-STRIPPED text: an AFTER string with exactly what the link added taken
 *  out — the markup above, the text-email "Privacy: <url>", and, once tags are stripped, the word " Privacy" (after
 *  " ·" in an email footer). Callers apply it only where BEFORE never says "Privacy". */
function unPrivacy(s) {
  if (typeof s !== 'string') return s
  return s.split(LINK_HTML).join('')
    .split(`\nPrivacy: ${URL}`).join('').split(` Privacy: ${URL}`).join('')
    .split(`<p class="text-center text-slate-400 text-xs mt-1">${PAGE_LINK}</p>`).join('')
    .split(`<p class="text-slate-400 text-xs mt-4">${PAGE_LINK}</p>`).join('')
    .replace(/ · Privacy(?= |$)/g, '').replace(/ Privacy(?= |$)/g, '')
}
module.exports = { emailPrivacy, orderPagePrivacy, both, unPrivacy, URL }
