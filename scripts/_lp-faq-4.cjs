// scripts/_lp-faq-4.cjs — faq-4's two deliberate changes to the marketing pages, as precise transforms for the harnesses that compare
// a page with a tree from before faq-4 (2 November 2026; docs/faq-4-report.md). scripts/faq-4.cjs proves both changes.
//
//   noFaqLink(html)    the footer's "FAQ" link (<a href="/<seg>/faq">…</a>, beside Pricing; only where that country's /faq has content)
//                      taken out — a no-op on a page without one
//   noLandingFaq(html) the landing page as faq-3's commits rendered it, with faq-3's FAQ taken out: the <section id="faq">, the FAQPage
//                      node of the JSON-LD @graph, and the final CTA's band flipped back (faq-3 swapped it to keep the white/wash
//                      alternation) — a no-op on a page without the section, so it can run on both sides
'use strict'

const noFaqLink = h => String(h).replace(/<a href="\/[a-z]{2}\/faq">[^<]*<\/a>/g, '')

function noLandingFaq(h) {
  h = String(h)
  if (!/<section id="faq"/.test(h)) return h
  h = h.replace(/<section id="faq"[^>]*>[\s\S]*?<\/section>/, '')
  h = h.replace(/<section id="try"( class="band")?>/, (_, band) => (band ? '<section id="try">' : '<section id="try" class="band">'))
  // The landing page writes its graph with a plain JSON.stringify, so parse → filter → stringify gives back the same bytes otherwise.
  return h.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (all, open, json, close) => {
    let g
    try { g = JSON.parse(json) } catch { return all }
    if (!Array.isArray(g['@graph']) || !g['@graph'].some(n => n['@type'] === 'FAQPage')) return all
    return open + JSON.stringify({ ...g, '@graph': g['@graph'].filter(n => n['@type'] !== 'FAQPage') }) + close
  })
}

module.exports = { noFaqLink, noLandingFaq }
