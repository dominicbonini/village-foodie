// scripts/_lp1e-parts.cjs — the marketing PARTS for scripts/language-phase-1e.cjs, for GB and US (the US switched on in
// the fixture rows). A MODULE. View keys <part>|<GB|US>|<variant>.
//   calc     /compare's calculator (app/compare/CostComparison.tsx) in several input states — its useState hooks started
//            from the state (render-kit `states` patch; a name this code does not have is skipped and reported)
//   contact  app/contact/page.tsx on the HatchGrab host (HTML and tags); and on Village Foodie (out of scope: unchanged)
//   legal    the legal pages' CHROME — app/(legal)/layout.tsx around a placeholder (🔴 never the legal Markdown) — and the
//            privacy / terms tags
//   footer   components/Footer.tsx (the footer the public truck page renders on the HatchGrab host)
//   truck    the public truck page: app/trucks/[slug]/page.tsx's tags (the sheet read answered from a fixture), the
//            client page's HTML, and the SHARE text through the REAL click handler (`handleProfileShare`, reached by a
//            {from,to} patch on both codes; navigator.share records what it is handed) — a GB and a US fixture truck
//   pdf      the plans PDF: buildPlansPdfHtml(country), and the REAL generatePlansPdf(code) with a recording browser
//            (puppeteer stubbed): the HTML it prints, the @page size, and the options handed to page.pdf()
// 🔴 EVERY VIEW RUNS ON BOTH CODES.
const CALC = 'app/compare/CostComparison.tsx'
const CALC_STATES = ['hasSystem', 'days', 'trucks', 'staff', 'planOverride', 'gmv', 'feePctRaw', 'feePenceRaw', 'freeMonthsRaw', 'feeMode', 'trucksRaw']
const CALC_CASES = {
  default: {},
  hasSystem: { hasSystem: 'yes' },
  twoStaff: { hasSystem: 'yes', staff: 2, gmv: 6000, days: 5 },
  feesOnTop: { hasSystem: 'yes', staff: 1, feePctRaw: '2.5', feePenceRaw: '20', feeMode: 'ontop' },
  noSystem: { hasSystem: 'no', staff: 2, trucks: 3 },
  maxFree3: { hasSystem: 'yes', staff: 1, freeMonthsRaw: '3', planOverride: 'max', gmv: 12000 },
  zero: { hasSystem: 'yes', staff: 1, gmv: 0, feePctRaw: '0', feePenceRaw: '0', freeMonthsRaw: '0' },
  // COMPARE's named edge cases: an all-in per-order fee of 100p or more, a fractional typed fee, a fractional free-months count
  bigFee: { hasSystem: 'yes', staff: 1, feePctRaw: '3.1', feePenceRaw: '99' },
  bigFeeOnTop: { hasSystem: 'yes', staff: 2, feePctRaw: '3.1', feePenceRaw: '99', feeMode: 'ontop' },
  fracFee: { hasSystem: 'yes', staff: 1, feePctRaw: '1.5', feePenceRaw: '22.5' },
  fracFree: { hasSystem: 'no', staff: 1, freeMonthsRaw: '1.2345' },
  fracFreeYes: { hasSystem: 'yes', staff: 1, feePctRaw: '4.5', feePenceRaw: '20', freeMonthsRaw: '2.5' },
}
const TRUCKS = {
  GB: { slug: 'pizza-kitchen', name: 'Pizza Kitchen', type: 'Pizza', logo: '/logos/pizza-kitchen.png', country: 'GB' },
  US: { slug: 'taco-kitchen', name: 'Taco Kitchen', type: 'Mexican', logo: '/logos/taco-kitchen.png', country: 'US' },
}

async function views(ctx) {
  const { h, kit, bundle, prerender, withReq, inLocale, mergeMeta, metaOf, ROWS, GB, US_ON, safeAsync, src, exists, skipped } = ctx
  const out = {}
  const locale = cc => (cc === 'US' ? 'en-US' : 'en-GB')
  const settingsOf = cc => (cc === 'US' ? US_ON() : GB())
  const reqOf = cc => (cc === 'US' ? { rows: ROWS.on(), cookie: 'US' } : { rows: ROWS.off() })
  const root = await bundle('meta-root', "export * from '@/app/layout'")

  // ══ calc ══
  const have = CALC_STATES.filter(n => new RegExp(`const\\s*\\[\\s*${n}\\s*,`).test(src(CALC)))
  for (const n of CALC_STATES) if (!have.includes(n)) skipped.push(`${CALC}:${n}`)
  const C = await bundle('calc', "export { default as CostComparison } from '@/app/compare/CostComparison'\nexport { DemoModalProvider } from '@/components/landing/DemoUpload'", { patches: [{ file: CALC, states: have }] })
  for (const cc of ['GB', 'US']) {
    for (const [name, st] of Object.entries(CALC_CASES)) {
      await safeAsync(out, `calc|${cc}|${name}`, async () => withReq(reqOf(cc), async () => {
        const state = Object.fromEntries(Object.entries(st).filter(([k]) => have.includes(k)))
        globalThis.__ms = state
        try { return kit.renderStatic(await inLocale(locale(cc), h(C.DemoModalProvider, null, h(C.CostComparison, { settings: settingsOf(cc), locale: locale(cc) })), C)) } finally { delete globalThis.__ms }
      }))
    }
  }

  // ══ contact ══
  const CT = await bundle('contact', "export * from '@/app/contact/page'\nexport { default } from '@/app/contact/page'")
  for (const cc of ['GB', 'US']) {
    await safeAsync(out, `contact|${cc}|html`, () => withReq(reqOf(cc), async () => prerender(await inLocale(locale(cc), h(CT.default, {}), CT))))
    await safeAsync(out, `contact|${cc}|meta`, () => withReq(reqOf(cc), async () => mergeMeta([await metaOf(root, {}), await metaOf(CT, {}, mergeMeta([await metaOf(root, {})]))])))
  }
  await safeAsync(out, 'contact|GB|villagefoodie', () => withReq({ rows: ROWS.off(), host: 'www.villagefoodie.co.uk' }, async () => prerender(h(CT.default, {}))))

  // ══ legal chrome ══
  const LG = await bundle('legal', "export { default as LegalLayout } from '@/app/(legal)/layout'")
  for (const cc of ['GB', 'US']) {
    await safeAsync(out, `legal|${cc}|chrome`, () => withReq(reqOf(cc), async () => prerender(await inLocale(locale(cc), h(LG.LegalLayout, null, h('i', { 'data-legal-body': 'the legal Markdown is not ours to change' })), LG))))
    for (const doc of ['privacy', 'terms']) {
      const P = await bundle(`legal-${doc}`, `export * from '@/app/(legal)/${doc}/page'`)
      await safeAsync(out, `legal|${cc}|meta-${doc}`, () => withReq(reqOf(cc), async () => mergeMeta([await metaOf(root, {}), await metaOf(P, {}, mergeMeta([await metaOf(root, {})]))])))
    }
  }

  // ══ the HatchGrab footer ══
  const FT = await bundle('footer', "export { default as Footer } from '@/components/Footer'")
  for (const cc of ['GB', 'US']) {
    await safeAsync(out, `footer|${cc}|html`, () => withReq(reqOf(cc), async () => kit.renderStatic(await inLocale(locale(cc), h(FT.Footer, { onOpenTally() {} }), FT))))
  }

  // ══ the public truck page ══
  const TCF = 'app/trucks/[slug]/TruckClient.tsx'
  const TP = await bundle('truck-page', "export * from '@/app/trucks/[slug]/page'\nexport { default } from '@/app/trucks/[slug]/page'", {
    patches: [{ file: TCF, from: 'const handleProfileShare = async () => {', to: 'const handleProfileShare = ((globalThis as any).__tcH ||= {}).share = async () => {', optional: true }],
  })
  for (const cc of ['GB', 'US']) {
    const T = TRUCKS[cc]
    const truckRow = { id: `truck-${cc}`, slug: T.slug, name: T.name, country: T.country, logo_url: T.logo, is_active: true }
    const req = { ...reqOf(cc), tables: { trucks: [truckRow] } }
    const props = { params: Promise.resolve({ slug: T.slug }) }
    await safeAsync(out, `truck|${cc}|meta`, () => withReq(req, async () => mergeMeta([await metaOf(root, {}), await metaOf(TP, props, mergeMeta([await metaOf(root, {})]))])))
    const data = { loading: false, loadError: null, refetch() {}, mapEvents: [],
      allTrucks: [{ cleanKey: T.slug, rawName: T.name, type: T.type, logoUrl: T.logo, menuUrl: '', phoneNumber: '', websiteUrl: '', orderUrl: null, country: T.country }] }
    // the PAGE renders (it looks the truck's country up by slug and hands TruckClient its locale), as Next serves it
    await safeAsync(out, `truck|${cc}|html`, () => withReq(req, async () => {
      globalThis.__tcData = data; globalThis.__tcH = {}
      try { return await prerender(h(TP.default, props)) } finally { delete globalThis.__tcData }
    }))
    await safeAsync(out, `truck|${cc}|share`, () => withReq(req, async () => {
      globalThis.__tcData = data; globalThis.__tcH = {}
      const rec = { shared: [], copied: [], alerts: [] }
      const nav = { share: async d => { rec.shared.push(d) }, canShare: () => true, clipboard: { writeText: async s => { rec.copied.push(s) } } }
      const prevNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), prevWin = globalThis.window, prevAlert = globalThis.alert
      try {
        await prerender(h(TP.default, props))   // the render leaves the share handler of THIS truck's closure
        Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true })
        globalThis.window = { location: { href: `https://www.hatchgrab.com/trucks/${T.slug}`, hostname: 'www.hatchgrab.com', origin: 'https://www.hatchgrab.com' }, addEventListener() {}, removeEventListener() {} }
        globalThis.alert = m => rec.alerts.push(m)
        const fn = globalThis.__tcH && globalThis.__tcH.share
        if (!fn) return 'NO SHARE HANDLER (the {from,to} patch did not apply on this code)'
        await fn()
        return rec
      } finally {
        delete globalThis.__tcData
        if (prevNav) Object.defineProperty(globalThis, 'navigator', prevNav); else delete globalThis.navigator
        if (prevWin === undefined) delete globalThis.window; else globalThis.window = prevWin
        if (prevAlert === undefined) delete globalThis.alert; else globalThis.alert = prevAlert
      }
    }))
  }

  // ══ the sitemap (HatchGrab: the country addresses since Phase 1e; Village Foodie: unchanged) ══
  if (exists('app/sitemap.ts')) {
    const SM = await bundle('sitemap', "export { default as sitemap } from '@/app/sitemap'")
    await safeAsync(out, 'sitemap|GB|hatchgrab', () => withReq({ rows: ROWS.off() }, async () => ctx.plain(await SM.sitemap())))
    await safeAsync(out, 'sitemap|US|hatchgrab-usOn', () => withReq({ rows: ROWS.on() }, async () => ctx.plain(await SM.sitemap())))
    await safeAsync(out, 'sitemap|GB|villagefoodie', () => withReq({ rows: ROWS.off(), host: 'www.villagefoodie.co.uk' }, async () => ctx.plain(await SM.sitemap())))
  }

  // ══ the plans PDF ══
  const PDF = await bundle('pdf', "export * as PDF from '@/lib/plans-pdf'")
  for (const cc of ['GB', 'US']) {
    await safeAsync(out, `pdf|${cc}|html`, () => withReq(reqOf(cc), async () => PDF.PDF.buildPlansPdfHtml(settingsOf(cc))))
    await safeAsync(out, `pdf|${cc}|print`, () => withReq(reqOf(cc), async () => {
      globalThis.__pdfRec = {}
      const bytes = await PDF.PDF.generatePlansPdf(cc)
      const rec = globalThis.__pdfRec; delete globalThis.__pdfRec
      const page = /@page\s*\{\s*size:\s*([^;]+);/.exec(rec.html || '')
      return { pdf: rec.pdf, setContent: rec.setContent, closed: !!rec.closed, bytes: bytes && bytes.length,
        cssPageSize: page ? page[1].trim() : null, printedHtmlEqualsBuild: rec.html === PDF.PDF.buildPlansPdfHtml(settingsOf(cc)) }
    }))
  }
  void exists
  return out
}

module.exports = { views, CALC_CASES, TRUCKS }
