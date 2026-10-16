// scripts/_lp1e-named.cjs — THE NAMED TABLE of scripts/language-phase-1e.cjs: every CODE change a marketing view may
// show between BEFORE (eb7ed44) and F (this code, eb7ed44's words), each a PRECISE transform of the BEFORE value. A
// MODULE. F must equal BEFORE with exactly the entries that touch it applied — never "close enough".
//
// The items Dominic named for the UK ("/uk equals BEFORE's / except …"):
//   metadataBase-www   app/layout.tsx's HatchGrab base is the www host: metadataBase https://hatchgrab.com/ → https://www.hatchgrab.com/,
//                      and the og:url a page INHERITS from the root (contact, legal, the truck page) https://hatchgrab.com → https://www.hatchgrab.com
//   country-canonical  canonical and og:url name the page's OWN country address (https://www.hatchgrab.com/uk, /uk/features,
//                      /uk/compare) instead of the router address ('/', '/features'); /compare, which had none, gains them
//                      (robots stays noindex)
//   hreflang           alternates.languages: every switched-on country with an address (en-GB → /uk…, en-US → /us… when the US
//                      is on) + x-default → the router address
//   og-locale-compare  /compare's og:locale names the page's country (it inherited the root's en_GB before)
//   links-country      the page's own marketing links point at its country's addresses: /features → /uk/features,
//                      /landing#pricing → /uk#pricing, /landing → /uk (the nav's logo, pricing and features links, the footer's)
//   sitemap-country    /sitemap.xml keeps / and /features and adds the country addresses (each switched-on country's landing and features)
//   testimonial-order  the landing testimonial's small line sits below the award (16 October 2026)
//   html-text-separators  React's empty `<!-- -->` between adjacent text nodes, removed from BOTH sides (see normalize)
// US views take the same transforms with /us (the US address) — and are LISTED besides (US behaviour; us-changed.txt).
const ORIGIN = 'https://www.hatchgrab.com'
const ROUTER = { landing: '/', features: '/features', compare: '/compare' }
const seg = cc => (cc === 'GB' ? 'uk' : 'us')
const countryPath = (cc, page) => (page === 'landing' ? `/${seg(cc)}` : `/${seg(cc)}/${page}`)
const clone = v => JSON.parse(JSON.stringify(v))
const parse = id => { const [area, rest] = [id.split('/')[0], id.split('/').slice(1).join('/')]; const [part, cc, variant] = rest.split('|'); return { area, part, cc, variant: variant || '' } }
const usOnOf = p => p.cc === 'US' ? !/usOff/.test(p.variant) : /usOn|cookieUS/.test(p.variant)

const NAMED = [
  {
    id: 'metadataBase-www', what: 'app/layout.tsx: the HatchGrab metadataBase (and the og:url pages inherit from it) is the www host',
    views: id => /\|meta/.test(id) && /^(pages|parts)\//.test(id),
    apply(id, v) {
      const m = v && v.merged ? v.merged : v
      if (!m || typeof m !== 'object') return v
      if (m.metadataBase === 'https://hatchgrab.com/') m.metadataBase = 'https://www.hatchgrab.com/'
      if (m.openGraph && m.openGraph.url === 'https://hatchgrab.com') m.openGraph.url = 'https://www.hatchgrab.com'
      return v
    },
  },
  {
    id: 'country-canonical', what: 'canonical and og:url name the page’s own country address (/compare gains them)',
    views: id => /^pages\/(landing|features|compare)\|(GB|US)\|meta/.test(id),
    apply(id, v) {
      const p = parse(id), m = v.merged, to = ORIGIN + countryPath(p.cc, p.part)
      if (p.part === 'compare') {
        m.alternates = { canonical: to }
        m.openGraph = { ...(m.openGraph || {}), url: to }
      } else {
        if (m.alternates && m.alternates.canonical === ORIGIN + ROUTER[p.part]) m.alternates.canonical = to
        if (m.openGraph && m.openGraph.url === ORIGIN + ROUTER[p.part]) m.openGraph.url = to
      }
      return v
    },
  },
  {
    id: 'hreflang', what: 'alternates.languages: en-GB → /uk…, en-US → /us… (US switched on only), x-default → the router address',
    views: id => /^pages\/(landing|features|compare)\|(GB|US)\|meta/.test(id),
    apply(id, v) {
      const p = parse(id), m = v.merged
      const languages = { 'en-GB': ORIGIN + countryPath('GB', p.part) }
      if (usOnOf(p)) languages['en-US'] = ORIGIN + countryPath('US', p.part)
      languages['x-default'] = ORIGIN + ROUTER[p.part]
      m.alternates = { ...(m.alternates || {}), languages }
      return v
    },
  },
  {
    id: 'og-locale-compare', what: '/compare’s og:locale names its country (it inherited the root’s en_GB)',
    views: id => /^pages\/compare\|(GB|US)\|meta/.test(id),
    apply(id, v) { const p = parse(id); v.merged.openGraph = { ...(v.merged.openGraph || {}), locale: p.cc === 'US' ? 'en_US' : 'en_GB' }; return v },
  },
  {
    id: 'links-country', what: 'the page’s marketing links name its country’s addresses (/features → /uk/features, /landing#pricing → /uk#pricing, /landing → /uk)',
    views: id => /^pages\/(landing|features|compare)\|(GB|US)\|html/.test(id),
    apply(id, v) {
      if (typeof v !== 'string') return v
      const p = parse(id)
      return v.replace(/href="\/features"/g, `href="${countryPath(p.cc, 'features')}"`)
        .replace(/href="\/landing#pricing"/g, `href="${countryPath(p.cc, 'landing')}#pricing"`)
        .replace(/href="\/landing"/g, `href="${countryPath(p.cc, 'landing')}"`)
        .replace(/href="\/compare"/g, `href="${countryPath(p.cc, 'compare')}"`)
    },
  },
  {
    id: 'sitemap-country', what: '/sitemap.xml keeps / and /features and adds each switched-on country’s landing and features address (GB always; /compare stays out)',
    views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id),
    apply(id, v) {
      if (!Array.isArray(v)) return v
      const p = parse(id), live = ['GB', ...(usOnOf(p) || /usOn/.test(p.variant) ? ['US'] : [])]
      const tpl = page => v.find(e => e.url === ORIGIN + ROUTER[page])
      // the router addresses stay (x-default), the country addresses follow them
      return [...v, ...live.flatMap(cc => ['landing', 'features'].map(page => ({ ...clone(tpl(page)), url: ORIGIN + countryPath(cc, page) })))]
    },
  },
  {
    id: 'testimonial-order', what: 'the landing testimonial’s small line moves BELOW the award (business → award → people; Dominic, 16 October 2026), with an inline 0.35rem top margin',
    views: id => /^pages\/landing\|GB\|html/.test(id),
    apply(id, v) {
      if (typeof v !== 'string') return v
      return v.replace(/<span class="quote-role">([\s\S]*?)<\/span>(<span class="quote-cred"[^>]*>[\s\S]*?<span class="cred-scope"[^>]*>[\s\S]*?<\/span><\/span>)/,
        (m, role, cred) => `${cred}<span class="quote-role" style="margin-top:0.35rem">${role}</span>`)
    },
  },
  // ── COMPARE's named GB code changes (the calculator's edge cases) ──
  {
    id: 'compare-allin-money', what: '/compare “all in” per-order total via smallFeeLabel: 100p or more shows money (“4.6% + 119p” → “4.6% + £1.19”); a fractional typed fee is rounded (“22.5p” → “23p”)',
    views: id => /^parts\/calc\|GB\|/.test(id) || /^pages\/compare\|GB\|html/.test(id),
    apply(id, v) {
      if (typeof v !== 'string') return v
      return v.replace(/(so you actually pay <strong[^>]*>[0-9.]+% \+ )([0-9]+(?:\.[0-9]+)?)p(<\/strong>)/g, (m, a, n, b) => {
        const p = Math.round(Number(n))
        return `${a}${p >= 100 ? `£${(p / 100).toFixed(2)}` : `${p}p`}${b}`
      })
    },
  },
  {
    id: 'compare-free-months-icu', what: '/compare “your first {n} months” and the “Months 1–{n}” line: a typed fractional count is printed by ICU # (at most 3 decimals: “1.2345” → “1.235”)',
    views: id => /^parts\/calc\|GB\|/.test(id),
    apply(id, v) {
      if (typeof v !== 'string') return v
      const f = n => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 }).format(Number(n))
      return v.replace(/(your first )([0-9]+\.[0-9]{4,})( months)/g, (m, a, n, b) => `${a}${f(n)}${b}`)
        .replace(/(>Months 1–)([0-9]+\.[0-9]{4,})(<)/g, (m, a, n, b) => `${a}${f(n)}${b}`)
    },
  },
]

/** US code behaviours (LISTED, not transformed: a US view changes by design), each with the agent that made it. */
const US_BEHAVIOUR = [
  [/^pages\/landing\|US\|html/, 'LANDING/SCREENSHOTS/CHROME: the -us screenshots, the Gusto testimonial GB-only, “Everything in Starter, plus” when Starter is priced, the locale-free App Store link'],
  [/^pages\/(features|compare)\|US\|html/, 'FEATURES/COMPARE/CHROME: US cents and percentages, US footnote dates, the locale-free App Store link'],
  [/^parts\/calc\|US\|/, 'COMPARE: ¢ minor-unit suffix, feeLabel “2.9% + 30¢”, pctLabel / Intl percentages'],
  [/^parts\/pdf\|US\|/, 'FEATURES: US Letter page (@page size letter, format Letter), US footnote dates'],
  [/^billing\/billing\|US\|/, 'FEATURES: footnote 4’s dates via formatLongDate (“October 1, 2026”), the US price mask “TBD”'],
  [/^parts\/truck\|US\|meta/, 'CHROME: the truck page’s tags in the truck’s country (og:locale en_US)'],
]
const usBehaviour = id => (US_BEHAVIOUR.find(([re]) => re.test(id)) || [null, 'US behaviour (unclassified)'])[1]

/** 🔴 html-text-separators — the ONE normalisation, applied to BOTH sides of an HTML view and named wherever it is needed:
 *  React's EMPTY comment `<!-- -->` between two adjacent text nodes. It renders nothing; it appears or disappears when a
 *  JSX text run becomes one message (`~{n} orders`) or a literal next to an expression (`<Check /> {t('…')}`). Exactly
 *  that 8-character string is removed — no other markup, text or whitespace is touched. */
const SEP = /<!-- -->/g
const normalize = v => (typeof v === 'string' ? v.replace(SEP, '') : v)

/** BEFORE value of view `id` → { expected, touched: [named ids whose transform changed it] }. */
function apply(id, before) {
  let v = clone(before); const touched = []
  for (const e of NAMED) {
    if (!e.views(id)) continue
    const prev = JSON.stringify(v)
    v = e.apply(id, v)
    if (JSON.stringify(v) !== prev) touched.push(e.id)
  }
  return { expected: v, touched }
}

module.exports = { NAMED, apply, normalize, SEP, US_BEHAVIOUR, usBehaviour, ORIGIN, ROUTER, countryPath, seg, parse }
