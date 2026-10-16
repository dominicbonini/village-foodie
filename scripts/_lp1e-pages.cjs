// scripts/_lp1e-pages.cjs — the MARKETING PAGES for scripts/language-phase-1e.cjs: the landing page, /features and
// /compare, each as FULL server-rendered HTML (React's static prerender, which awaits async server components as Next
// does) and its METADATA (title, description, canonical, og:url, og:locale, hreflang alternates, robots, images — the
// root layout's and every segment's, merged as Next merges them) with the JSON-LD the page carries. A MODULE.
//
// 🔴 "/uk EQUALS BEFORE'S /" IS A DIRECT COMPARISON. The same view key is rendered by:
//   BEFORE (eb7ed44)  the page module that served the address then — app/landing/page.tsx (/), app/features/page.tsx,
//                     app/compare/page.tsx — with the country it RESOLVED: GB with no country input; US with the
//                     hg_country=US cookie and the US switched on in the fixture rows;
//   AFTER (this tree) the COUNTRY page module (app/[country]/page.tsx, …/features, …/compare) with params
//                     { country: 'uk' } / { country: 'us' } — or the old module, the same way, while it does not exist.
// View keys: <page>|<GB|US>|<variant>
//   html / meta                 US switched OFF (production) for GB; switched ON for US
//   html-usOn / meta-usOn       GB with the US switched ON (the UK page must not move when the US opens)
//   html-cookieUS (after only)  /uk with hg_country=US and the US on — a country address ignores the cookie
//   html-usOff / meta-usOff     the US page's own render with the US switched OFF (the router 302s it to GB first;
//                               recorded, compared with nothing — BEFORE has no /us)
const PAGES = ['landing', 'features', 'compare']
const OLD = { landing: 'app/landing/page.tsx', features: 'app/features/page.tsx', compare: 'app/compare/page.tsx' }
const NEW = { landing: 'app/[country]/page.tsx', features: 'app/[country]/features/page.tsx', compare: 'app/[country]/compare/page.tsx' }
const OLD_LAYOUTS = { landing: ['app/landing/layout.tsx'], features: [], compare: [] }
const NEW_LAYOUTS = { landing: ['app/[country]/layout.tsx'], features: ['app/[country]/layout.tsx', 'app/[country]/features/layout.tsx'], compare: ['app/[country]/layout.tsx', 'app/[country]/compare/layout.tsx'] }
const slugOf = cc => (cc === 'GB' ? 'uk' : 'us')

async function views(ctx) {
  const { h, exists, bundle, prerender, withReq, mergeMeta, metaOf, jsonLd, ROWS, safeAsync } = ctx
  const out = {}
  const modOf = async (file) => bundle(`m-${file.replace(/[^a-z0-9]+/gi, '-')}`, `export * from '@/${file.replace(/\.tsx?$/, '')}'\nexport { default } from '@/${file.replace(/\.tsx?$/, '')}'`)
  const metaModOf = async (file) => bundle(`meta-${file.replace(/[^a-z0-9]+/gi, '-')}`, `export * from '@/${file.replace(/\.tsx?$/, '')}'`)
  const root = await metaModOf('app/layout.tsx')

  /** Which module serves page `p` for country `cc` on this code, with which props and which request. */
  function route(p, cc, { usOn, cookie } = {}) {
    if (exists(NEW[p])) {
      return { file: NEW[p], layouts: NEW_LAYOUTS[p].filter(exists), country: true,
        props: { params: Promise.resolve({ country: slugOf(cc) }), searchParams: Promise.resolve({}) },
        req: { rows: usOn ? ROWS.on() : ROWS.off(), ...(cookie ? { cookie } : {}) } }
    }
    return { file: OLD[p], layouts: OLD_LAYOUTS[p].filter(exists), country: false,
      props: { params: Promise.resolve({}), searchParams: Promise.resolve({}) },
      req: { rows: usOn ? ROWS.on() : ROWS.off(), ...(cc === 'US' ? { cookie: 'US' } : cookie ? { cookie } : {}) } }
  }
  async function render(p, cc, opts) {
    const r = route(p, cc, opts)
    const M = await modOf(r.file)
    return withReq(r.req, async () => {
      const html = await prerender(h(M.default, r.props))
      return html
    })
  }
  async function meta(p, cc, opts) {
    const r = route(p, cc, opts)
    const M = await metaModOf(r.file)
    const layouts = []
    for (const f of r.layouts) layouts.push(await metaModOf(f))
    return withReq(r.req, async () => {
      const chain = [await metaOf(root, {})]
      for (const L of layouts) chain.push(await metaOf(L, { params: r.props.params }, mergeMeta(chain)))
      chain.push(await metaOf(M, r.props, mergeMeta(chain)))   // `parent`: what the segments above resolved to
      return { merged: mergeMeta(chain) }
    })
  }

  for (const p of PAGES) {
    for (const cc of ['GB', 'US']) {
      const base = { usOn: cc === 'US' }
      await safeAsync(out, `${p}|${cc}|html`, () => render(p, cc, base))
      await safeAsync(out, `${p}|${cc}|meta`, async () => ({ ...(await meta(p, cc, base)), ld: jsonLd(out[`${p}|${cc}|html`]) }))
    }
    await safeAsync(out, `${p}|GB|html-usOn`, () => render(p, 'GB', { usOn: true }))
    await safeAsync(out, `${p}|GB|meta-usOn`, async () => ({ ...(await meta(p, 'GB', { usOn: true })), ld: jsonLd(out[`${p}|GB|html-usOn`]) }))
    if (exists(NEW[p])) {
      await safeAsync(out, `${p}|GB|html-cookieUS`, () => render(p, 'GB', { usOn: true, cookie: 'US' }))
      // the page's own BACKSTOP (lib/visitor-country.ts redirect() — the proxy 302s first): recorded as REDIRECT
      const backstop = fn => async () => { try { return await fn() } catch (e) { if (String(e && e.message) === 'redirect') return 'REDIRECT (the page’s own redirect() backstop)'; throw e } }
      await safeAsync(out, `${p}|US|html-usOff`, backstop(() => render(p, 'US', { usOn: false })))
      await safeAsync(out, `${p}|US|meta-usOff`, backstop(async () => meta(p, 'US', { usOn: false })))
    }
  }
  // the unlisted preview re-exports the landing (BEFORE); its module, rendered as the landing's GB
  if (exists('app/1ng7n4p5omux2gdk9kqvwz/page.tsx')) {
    await safeAsync(out, 'preview|GB|source', async () => ctx.src('app/1ng7n4p5omux2gdk9kqvwz/page.tsx').replace(/^\s*\/\/.*$/gm, '').trim())
  }
  return out
}

module.exports = { views, PAGES, OLD, NEW, slugOf }
