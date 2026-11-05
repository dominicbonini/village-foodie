// scripts/_site-chrome-1-render.cjs — site-chrome-1 (5 November 2026, docs/site-chrome-1-report.md): server-renders the public pages this
// work touches (the landing, /features, /about, /compare, the comparison page, /contact, the legal pages in English and translated,
// in the web and in the native app) over the fixture world, with no network and no database. A MODULE (shared_modules in
// scripts/harnesses.json), required by scripts/site-chrome-1.cjs and scripts/site-chrome-1-screens.cjs; it asserts nothing.
// It must run in an OLDER tree too (a HEAD worktree's "before"), so it only names routes and props that exist on both sides.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const LP1E = require('./_lp1e-fixtures.cjs')
const WF = require('./_world-countries-1-fixtures.cjs')
const FIX = require('./fixtures/faq-3-rows.json')

const ROWS = () => WF.rowsWith(WF.WORLD)
const FAQ = () => JSON.parse(JSON.stringify({ faq_sections: FIX.faq_sections, faq_items: FIX.faq_items, faq_translations: [] }))
const APP_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 HatchGrabNativeApp'

function renderer(kit, REPO) {
  const ctx = LP1E.context(kit, REPO)
  const wf = WF.renderer(kit, 'sc1-tables')
  const mods = {}
  const mod = (tag, entry) => (mods[tag] ||= ctx.bundle(`sc1-${tag}`, `${entry}\nexport { clearPlanCatalogCache as __p } from '@/lib/plans-server'`))
  async function run(el, { ua = null, ip = 'GB', host = null } = {}) {
    const info = console.info; console.info = () => {}
    try {
      return await kit.quietAsync(() => ctx.withReq({ rows: ROWS(), ip, ...(host ? { host } : {}), tables: { ...wf.tables, ...FAQ() } }, async () => {
        if (ua) globalThis.__mcReq.headers['user-agent'] = ua
        return String(await ctx.prerender(el))
      }))
    } finally { console.info = info }
  }
  const sp = (o = {}) => Promise.resolve(o)
  const PAGES = {
    landing: async seg => { const M = await mod('landing', "export { default as Page } from '@/app/landing/page'"); M.__p?.(); return run(kit.h(M.Page, { params: Promise.resolve({ country: seg }), searchParams: sp() })) },
    features: async seg => { const M = await mod('features', "export { default as Page } from '@/app/features/page'"); M.__p?.(); return run(kit.h(M.Page, { params: Promise.resolve({ country: seg }), searchParams: sp() })) },
    about: async (ip = 'GB') => { const M = await mod('about', "export { default as Page } from '@/app/about/page'"); return run(kit.h(M.Page, { searchParams: sp() }), { ip }) },
    compare: async seg => { const M = await mod('compare', "export { default as Page } from '@/app/compare/page'"); M.__p?.(); return run(kit.h(M.Page, { params: Promise.resolve({ country: seg }), searchParams: sp() })) },
    contact: async (ip = 'GB') => { const M = await mod('contact', "export { default as Page } from '@/app/contact/page'"); return run(kit.h(M.Page, { searchParams: sp() }), { ip }) },
    legal: async (doc, { ua = null, ip = 'GB', host = null } = {}) => {
      const M = await mod('legal', "export { default as Layout } from '@/app/(legal)/layout'\nexport { default as privacy } from '@/app/(legal)/privacy/page'\nexport { default as terms } from '@/app/(legal)/terms/page'\nexport { default as countryTerms } from '@/app/(legal)/country-terms/page'")
      return run(kit.h(M.Layout, { children: kit.h(M[doc]) }), { ua, ip, host })
    },
    legalIn: async (seg, doc, { ua = null } = {}) => {
      const M = await mod('legalIn', "export { default as Layout } from '@/app/[country]/(legal)/layout'\nexport { default as privacy } from '@/app/[country]/(legal)/privacy/page'\nexport { default as terms } from '@/app/[country]/(legal)/terms/page'\nexport { default as countryTerms } from '@/app/[country]/(legal)/country-terms/page'")
      const params = Promise.resolve({ country: seg })
      return run(kit.h(M.Layout, { params, children: kit.h(M[doc], { params }) }), { ua })
    },
  }
  return { ctx, PAGES, ROWS, APP_UA }
}

module.exports = { renderer, APP_UA }
