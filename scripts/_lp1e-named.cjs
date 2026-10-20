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
//   sitemap-country    /sitemap.xml lists the country addresses (each switched-on country's landing and features); the tidy dropped / and /features
//   legal-logo-country the legal pages' logo links to the visitor's country page (Language Phase 1e tidy)
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
    id: 'sitemap-country', what: '/sitemap.xml lists each switched-on country’s landing and features address (GB always; /compare stays out) in place of / and /features, which are now the router’s 302s (Language Phase 1e tidy dropped them)',
    views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id),
    apply(id, v) {
      if (!Array.isArray(v)) return v
      const p = parse(id), live = ['GB', ...(usOnOf(p) || /usOn/.test(p.variant) ? ['US'] : [])]
      const tpl = page => v.find(e => e.url === ORIGIN + ROUTER[page])
      // each country address takes the frequency and priority its router address had; the router addresses go
      const country = live.flatMap(cc => ['landing', 'features'].map(page => ({ ...clone(tpl(page)), url: ORIGIN + countryPath(cc, page) })))
      return [...v.filter(e => e.url !== ORIGIN + ROUTER.landing && e.url !== ORIGIN + ROUTER.features), ...country]
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
  {
    id: 'legal-logo-country', what: 'the legal pages’ logo links to the visitor’s country page (/landing → /uk, /us) — the router’s own decision made on the server, no hop (Language Phase 1e tidy)',
    views: id => /^parts\/legal\|(GB|US)\|chrome/.test(id),
    apply(id, v) {
      if (typeof v !== 'string') return v
      return v.replace(/href="\/landing"/g, `href="${countryPath(parse(id).cc, 'landing')}"`)
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
  // us-polish-hg-truck-preview (19 October 2026) — defined below with its reason; applied here after metadataBase-www.
  { id: 'us-polish-hg-truck-preview', what: 'see US_POLISH_HG_TRUCK_PREVIEW', views: id => US_POLISH_HG_TRUCK_PREVIEW.views(id), apply: (id, v) => US_POLISH_HG_TRUCK_PREVIEW.apply(id, v) },
  // legal-country-terms-link (19 October 2026) — defined below with its reason.
  { id: 'legal-country-terms-link', what: 'see LEGAL_COUNTRY_TERMS_LINK', views: id => LEGAL_COUNTRY_TERMS_LINK.views(id), apply: (id, v) => LEGAL_COUNTRY_TERMS_LINK.apply(id, v) },
  // legal-titles-absolute (19 October 2026) — defined below with its reason.
  { id: 'legal-titles-absolute', what: 'see LEGAL_TITLES_ABSOLUTE', views: id => LEGAL_TITLES_ABSOLUTE.views(id), apply: (id, v) => LEGAL_TITLES_ABSOLUTE.apply(id, v) },
]

/** ⚠️ RE-PINNED, 18 October 2026 (US layout fixes, /Users/dominicbonini/dev/usl-out/REPIN-BRIEF.md) — a NAMED transform kept
 *  OUTSIDE `NAMED` (so scripts/language-phase-1e.cjs, which lists US views rather than transforming them, is untouched) and
 *  reused by scripts/language-phase-0.cjs and scripts/language-phase-1e-tidy.cjs for the ONE view it names.
 *  us-layout-fix-13-us-landing-bands (app/landing/page.tsx; the US landing has no testimonial): pricing loses `band`, the final
 *  CTA gains it, and `.switch-block` gets an inline wash background. Exact substrings, each must be found exactly once;
 *  GB landing HTML stays byte-identical (the views regex names the US landing only — `|US|html`, not `-usOff`, which renders
 *  the GB page with its testimonial). */
const US_LAYOUT_FIX_13 = {
  id: 'us-layout-fix-13-us-landing-bands', what: 'US landing (no testimonial): #pricing loses class="band", #try gains it, .switch-block gets style="background:var(--wash)"',
  views: id => /(^|\/)(pages\/)?landing\|US\|html$/.test(id),
  EDITS: [
    ['<section id="pricing" class="band">', '<section id="pricing">'],
    ['<div class="switch-block">', '<div class="switch-block" style="background:var(--wash)">'],
    ['<section id="try">', '<section id="try" class="band">'],
  ],
  apply(id, v) {
    if (typeof v !== 'string') return v
    for (const [a, b] of this.EDITS) {
      if (v.split(a).length !== 2) throw new Error(`${this.id}: "${a}" is not in ${id} exactly once`)
      v = v.replace(a, b)
    }
    return v
  },
}

/** ⚠️ RE-PINNED, 19 October 2026 (US polish batch, docs/us-polish-batch-report.md) — us-polish-hg-truck-preview: on the
 *  HatchGrab host a truck page's preview comes from the truck itself (lib/truck-share-meta.ts), never the Google Sheet.
 *  The fixture's truck row has no `active` / `show_on_hg` (it is not public on HatchGrab) and there is no discovery row,
 *  so — correctly — nothing about it is published: the page's title is "Food truck" (root template → "Food truck |
 *  HatchGrab") and every other tag is the root layout's own (its description, og:*, the HatchGrab share card, twitter:*).
 *  PRECISE: exactly those fields are set; metadataBase, manifest and icons are BEFORE's. Used by scripts/language-phase-1e.cjs
 *  (NAMED, below) and scripts/language-phase-1e-tidy.cjs. The truck-specific HatchGrab preview is proved by
 *  scripts/us-polish-batch.cjs §1. */
const US_POLISH_HG_TRUCK_PREVIEW = {
  id: 'us-polish-hg-truck-preview', what: 'HatchGrab truck page preview from the truck itself: a truck not public on HatchGrab previews generically ("Food truck | HatchGrab", the root layout\'s tags)',
  views: id => /^parts\/truck\|(GB|US)\|meta$/.test(id),
  apply(id, v) {
    const m = v && v.merged ? v.merged : v
    if (!m || typeof m !== 'object') return v
    const description = 'The food truck management platform', image = `${ORIGIN}/logos/hatchgrab-share-card.png`
    m.title = 'Food truck | HatchGrab'
    m.description = description
    m.openGraph = { title: 'HatchGrab', description, url: ORIGIN, siteName: 'HatchGrab', images: [{ url: image, width: 1200, height: 630, alt: 'HatchGrab Logo' }], locale: 'en_GB', type: 'website' }
    m.twitter = { card: 'summary_large_image', title: 'HatchGrab', description, images: [image] }
    return v
  },
}

/** ⚠️ RE-PINNED, 19 October 2026 (US legal draft, docs/us-legal-draft-report.md) — legal-country-terms-link: the legal
 *  footer gains ONE link, "Country terms" → /country-terms (the page of each country's extra rules, which forms part of the
 *  terms and the privacy policy), between Terms and Contact. PRECISE: that one anchor, with the footer's own classes,
 *  inserted after the Terms link (found exactly once). Used by scripts/language-phase-1e.cjs and -tidy.cjs. */
const LEGAL_COUNTRY_TERMS_LINK = {
  id: 'legal-country-terms-link', what: 'the legal footer: "Country terms" → /country-terms, after Terms',
  views: id => /^parts\/legal\|(GB|US)\|chrome$/.test(id),
  FROM: '<a href="/terms" class="hover:text-slate-800 underline">Terms</a>',
  apply(id, v) {
    if (typeof v !== 'string') return v
    if (v.split(this.FROM).length !== 2) throw new Error(`${this.id}: the Terms link is not in ${id} exactly once`)
    return v.replace(this.FROM, this.FROM + '<a href="/country-terms" class="hover:text-slate-800 underline">Country terms</a>')
  },
}

/** ⚠️ RE-PINNED, 19 October 2026 (legal follow-ups, docs/legal-follow-ups-report.md) — legal-titles-absolute: the Terms and
 *  Privacy pages' titles already end "— HatchGrab", so the root layout's "%s | HatchGrab" template doubled it ("Privacy
 *  Policy — HatchGrab | HatchGrab"). They are now `title: { absolute }`. PRECISE: the title loses exactly the trailing
 *  " | HatchGrab", and only where it ends "— HatchGrab | HatchGrab"; every other tag is BEFORE's. */
const LEGAL_TITLES_ABSOLUTE = {
  id: 'legal-titles-absolute', what: 'the Terms and Privacy titles lose the doubled " | HatchGrab" ("Privacy Policy — HatchGrab")',
  views: id => /^parts\/legal\|(GB|US)\|meta-(privacy|terms)$/.test(id),
  apply(id, v) {
    const m = v && v.merged ? v.merged : v
    if (!m || typeof m !== 'object' || typeof m.title !== 'string' || !/ — HatchGrab \| HatchGrab$/.test(m.title)) throw new Error(`${this.id}: ${id}'s title does not end "— HatchGrab | HatchGrab"`)
    m.title = m.title.replace(/ \| HatchGrab$/, '')
    return v
  },
}

/** US code behaviours (LISTED, not transformed: a US view changes by design), each with the agent that made it. */
const US_BEHAVIOUR = [
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the one SEO change, on the US /features too.
  [/^pages\/features\|US\|meta/, 'PRICING (Stage B): /features’s description names the catalogue’s plans and the trial’s months (pricing-b-features-description, precise on GB)'],
  [/^pages\/landing\|US\|html/, 'LANDING/SCREENSHOTS/CHROME: the -us screenshots, the Gusto testimonial GB-only, “Everything in Starter, plus” when Starter is priced, the locale-free App Store link'],
  [/^pages\/(features|compare)\|US\|html/, 'FEATURES/COMPARE/CHROME: US cents and percentages, US footnote dates, the locale-free App Store link'],
  [/^parts\/calc\|US\|/, 'COMPARE: ¢ minor-unit suffix, feeLabel “2.9% + 30¢”, pctLabel / Intl percentages'],
  [/^parts\/pdf\|US\|/, 'FEATURES: US Letter page (@page size letter, format Letter), US footnote dates'],
  [/^billing\/billing\|US\|/, 'FEATURES: footnote 4’s dates via formatLongDate (“October 1, 2026”), the US price mask “TBD”'],
  [/^parts\/truck\|US\|meta/, 'CHROME: the truck page’s tags in the truck’s country (og:locale en_US)'],
  [/^parts\/legal\|US\|chrome/, 'US LEGAL DRAFT (19 Oct 2026): the legal footer’s “Country terms” link (legal-country-terms-link, precise on GB)'],
  [/^parts\/(footer|truck)\|US\|html/, 'TIDY: Village Foodie’s discovery prompts are hidden for a truck outside GB (the newsletter, the weekly-schedule button, Hire / Add my Business / Truck Directory, the claim links)'],
]
const usBehaviour = id => (US_BEHAVIOUR.find(([re]) => re.test(id)) || [null, 'US behaviour (unclassified)'])[1]

/** 🔴 html-text-separators — the ONE normalisation, applied to BOTH sides of an HTML view and named wherever it is needed:
 *  React's EMPTY comment `<!-- -->` between two adjacent text nodes. It renders nothing; it appears or disappears when a
 *  JSX text run becomes one message (`~{n} orders`) or a literal next to an expression (`<Check /> {t('…')}`). Exactly
 *  that 8-character string is removed — no other markup, text or whitespace is touched. */
const SEP = /<!-- -->/g
const normalize = v => (typeof v === 'string' ? v.replace(SEP, '') : v)

// ══ ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026, docs/plans-data-model-report.md) ══════════════════════
// Manage › Billing is ONE data-driven plan card above the frozen comparison table. STRUCTURAL, by the SAME proof Part 2
// names (scripts/_lp1d2-named.cjs makeBillingProof, one copy): the card names the effective plan, the table is BEFORE's
// byte for byte (exact / no column highlighted / BEFORE pro|matrix's), the modal is the catalogue's, iOS has no purchase
// panel. Here BEFORE is eb7ed44's (this harness's own capture) + this table's named transforms. GB only: the US Billing
// views stay LISTED (US behaviour), as before.
let BILL_BEFORE = null
const billBefore = () => (BILL_BEFORE ||= JSON.parse(require('zlib').gunzipSync(require('fs').readFileSync(require('path').join(__dirname, 'fixtures/language-phase-1e-before/billing.json.gz')))).views)
const PLANS_BILLING_CARD = {
  id: 'plans-billing-plan-card',
  what: '⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): Manage › Billing — one data-driven plan card for every plan above the frozen comparison table. STRUCTURAL (scripts/_lp1d2-named.cjs makeBillingProof): the card names the effective plan (an old starter / max key or a past end date → Pay as you go); the table is BEFORE’s byte for byte (exact for trial / pro, no column highlighted for starter / max, BEFORE pro|matrix’s where BEFORE showed none); the switch modal is the catalogue’s; iOS shows no purchase panel. scripts/plans-data-model.cjs proves the same table claims on its own captures.',
  views: id => /^billing\/billing\|GB\|(trial|starter|pro|max|tester)(\||$)/.test(id),
  apply: (id, v) => v,
  proveWith: (exp, f, id) => require('./_lp1d2-named.cjs').makeBillingProof(cc => apply(`billing/billing|${cc}|pro|matrix`, billBefore()[`billing|${cc}|pro|matrix`]).expected)(exp, f, id),
}
NAMED.push(PLANS_BILLING_CARD)

// ══ ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026, docs/pricing-pages-report.md) ═══════════════════════════════
// Stage B's views, by the shared proofs in scripts/_lp-stage-b.cjs: each REGION Stage B replaced is cut from BEFORE (+ the
// named items above) and from F at the same anchors, everything else byte-identical (html-text-separators normalised on
// both sides, as this table always does); F's region checked for what Stage B put there. GB views here; the US views
// stay LISTED (US_BEHAVIOUR below).
const STAGE_B = require('./_lp-stage-b.cjs')
const sbProof = proof => (exp, f) => proof(normalize(exp), normalize(f))
NAMED.push(
  { id: 'pricing-b-landing-pricing', what: 'Stage B: the landing’s #pricing — banner → plan cards from the catalogue → cheapest bar → footnote (the old lede, cards, “Compare all features” and price-foot gone). STRUCTURAL: the section after its h2 cut from both; the rest byte-identical.',
    views: id => STAGE_B.LANDED && /^pages\/landing\|GB\|html/.test(id), apply: (id, v) => v, proveWith: sbProof(STAGE_B.landingPricing) },
  { id: 'pricing-b-features-page', what: 'Stage B: /features — h1, lede, callout, THE plan table (the catalogue’s public plans, its highlighted plan), the pricing footnote. STRUCTURAL: the body between the nav and the footer cut from both; head, nav and footer byte-identical.',
    views: id => STAGE_B.LANDED && /^pages\/features\|GB\|html/.test(id), apply: (id, v) => v, proveWith: sbProof(STAGE_B.featuresPage) },
  { id: 'pricing-b-features-description', what: 'Stage B — THE ONE SEO change: /features’s description names the catalogue’s public plans and the trial’s months (“… — Pay as you go, Pro and Unlimited, with fees and allowances. Your first 3 months include everything.”). Titles, canonicals, hreflang, robots and og:url unchanged. PRECISE.',
    views: id => STAGE_B.LANDED && /^pages\/features\|(GB|US)\|meta/.test(id), apply: (id, v) => STAGE_B.featuresDescription(v, parse(id).cc === 'US' ? 'en-US' : 'en-GB') },
  { id: 'pricing-b-compare-calc', what: 'Stage B: /compare’s calculator — the suggested plan is the cheapest at the volume (lib/plan-offer cheapestAt), the allowance sentence and the results come from the catalogue, the free-months default is the trial’s months. STRUCTURAL: those regions cut from both; every step, question, input and label byte-identical.',
    views: id => STAGE_B.LANDED && (/^parts\/calc\|GB\|/.test(id) || /^pages\/compare\|GB\|html/.test(id)), apply: (id, v) => v, proveWith: sbProof(STAGE_B.calcProof) },
  { id: 'pricing-b-plans-pdf', what: 'Stage B: the plans PDF — banner, cards, cheapest bar, THE plan table, footnote (buildPlansPdfHtml(settings, catalog)). STRUCTURAL: the stylesheet after @page and the content between the doc head and the closing paragraph cut from both; the frame byte-identical.',
    views: id => STAGE_B.LANDED && /^parts\/pdf\|GB\|html$/.test(id), apply: (id, v) => v, proveWith: sbProof(STAGE_B.plansPdf) },
)

// ══ ⚠️ RE-PINNED (seo-fixes, 20 October 2026, docs/seo-fixes-report.md) ══════════════════════════════════════════════════
// seo-fixes changed nothing visible but markup and tags these views read: the always-rendered country menu, the lazy store
// badges, the landing's JSON-LD @graph, /compare's title and description, the canonical + og:url of /contact and the legal
// pages, the sitemap. Each a PRECISE transform of BEFORE (+ the items above), one copy in scripts/_lp-seo-fixes.cjs.
// Applied on GB and US views alike (the six US views seo-fixes touched equal BEFORE + these items exactly; no US_BEHAVIOUR entry).
for (const e of require('./_lp-seo-fixes.cjs').ITEMS) NAMED.push({ id: e.id, what: e.what, views: e.views, apply: (id, v) => e.apply(id, v) })
// ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): the re-dated Terms — the sitemap's /terms lastmod 2026-10-20. PRECISE, after
// seo-s5-sitemap, GB and US; one copy in scripts/_lp-pricing-tidy.cjs (the plan table's footnotes and Billing's not-started
// heading sit inside Stage B's structural proofs above; no other view here changed).
for (const e of require('./_lp-pricing-tidy.cjs').ITEMS) NAMED.push({ id: e.id, what: e.what, views: e.views, apply: (id, v) => e.apply(id, v) })

/** BEFORE value of view `id` → { expected, touched: [named ids whose transform changed it] }. */
// ⚠️ RE-PINNED (plans-data-model, Stage A): an entry with `proveWith` adds `matches(f)` → { ok, problems } — its own
// structural proof, run on top of `expected`; it is listed in `touched` whenever it applies.
function apply(id, before) {
  let v = clone(before); const touched = []
  const provers = []
  for (const e of NAMED) {
    if (!e.views(id)) continue
    if (e.proveWith) { provers.push(e); continue }
    const prev = JSON.stringify(v)
    v = e.apply(id, v)
    if (JSON.stringify(v) !== prev) touched.push(e.id)
  }
  const out = { expected: v, touched }
  if (provers.length) {
    for (const e of provers) touched.push(e.id)
    const exp = v
    out.matches = f => { const rs = provers.map(e => e.proveWith(exp, f, id)); return { ok: rs.every(r => r.ok), problems: rs.flatMap(r => r.problems || []) } }
  }
  return out
}

module.exports = { NAMED, US_LAYOUT_FIX_13, US_POLISH_HG_TRUCK_PREVIEW, LEGAL_COUNTRY_TERMS_LINK, LEGAL_TITLES_ABSOLUTE, apply, normalize, SEP, US_BEHAVIOUR, usBehaviour, ORIGIN, ROUTER, countryPath, seg, parse }
