// scripts/_lp1e-router.cjs — THE COUNTRY ROUTER for scripts/language-phase-1e.cjs: the REAL proxy (proxy.ts, its
// `proxy` export) run with a real NextRequest. A MODULE. Every view is one request: { status, kind, location, rewrite,
// cookies set, and — for a redirect — the chain followed (≤ 5 hops, carrying the cookies it sets) }.
//
// STUBBED, exactly as the other harnesses stub them, and nothing else: '@supabase/ssr' (a session client whose
// getUser() says "no user" — the marketing paths are public), '@/lib/ratelimit' (every limiter says yes; the bundle's
// NODE_ENV is "development", so the proxy skips them anyway), the database (the in-memory fake holding the seed's
// country_settings rows, the US switched ON or OFF). next/server is the real one. Nothing reaches the network.
//
// View keys: router|X|<host> <path?query> c=<hg_country> ip=<x-vercel-ip-country> us=<on|off>
// 🔴 RUNS ON BOTH CODES. At eb7ed44 the router paths were a rewrite (/) and a 308 (/landing) — the named change; every
//    path the router must not touch is compared with eb7ed44 as the same response.
const ROUTER_PATHS = ['/', '/landing', '/features', '/compare', '/1ng7n4p5omux2gdk9kqvwz']
const COUNTRY_PAGES = ['/uk', '/us', '/uk/features', '/us/features', '/uk/compare', '/us/compare']
const ROUTER_INPUTS = [
  { q: '' }, { q: '?country=US' }, { q: '?country=GB' }, { q: '?country=XX' }, { q: '?country=us' },
  { q: '', cookie: 'US' }, { q: '', cookie: 'GB' }, { q: '', cookie: 'XX' },
  { q: '', ip: 'US' }, { q: '', ip: 'GB' }, { q: '', ip: 'FR' },
  { q: '', cookie: 'GB', ip: 'US' }, { q: '', cookie: 'US', ip: 'GB' },
  { q: '?country=GB', cookie: 'US' }, { q: '?country=US', cookie: 'GB' }, { q: '?country=US', ip: 'GB' },
  { q: '?utm_source=mail&ref=a%20b' }, { q: '?country=US&utm_source=mail' }, { q: '?utm_source=mail&country=GB', cookie: 'US' },
]
const COUNTRY_INPUTS = [{ q: '' }, { q: '', cookie: 'US' }, { q: '', cookie: 'GB' }, { q: '?country=GB' }, { q: '?country=US' }, { q: '?utm_source=mail' }, { q: '', ip: 'US' }]
const ODD_PATHS = ['/UK', '/uk/', '/gb', '/uk/landing', '/us/pricing', '/en-us', '/landing/x', '/features/x']
const HG = 'www.hatchgrab.com', VF = 'www.villagefoodie.co.uk', CUSTOM = 'order.pizzakitchen.example'
const UNTOUCHED = [
  [HG, ['/trucks', '/trucks/pizza-kitchen', '/order/abc', '/manage/abc', '/dashboard', '/dashboard/demo-abc123', '/kds/abc', '/app', '/api/menu', '/api/manage', '/contact', '/privacy', '/terms', '/login', '/signup', '/setup', '/hire', '/sitemap.xml', '/robots.txt', '/o/abc', '/p/abc']],
  [VF, ['/', '/landing', '/landing?country=US', '/features', '/compare', '/uk', '/us', '/uk/features', '/dashboard', '/manage/abc', '/trucks/pizza-kitchen', '/venues/x', '/contact', '/api/menu', '/1ng7n4p5omux2gdk9kqvwz']],
  [CUSTOM, ['/', '/uk', '/landing', '/features', '/api/menu', '/.well-known/acme-challenge/x', '/dashboard']],
  ['hatchgrab.com', ['/', '/uk', '/landing']],
  ['preview-abc.hatchgrab.vercel.app', ['/', '/us']],
]

async function views(ctx) {
  const { bundle, withReq, ROWS, safeAsync, REPO, exists } = ctx
  const out = {}
  const path = require('path')
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  if (!exists('proxy.ts')) { out['router|X|bundle'] = 'ERROR no proxy.ts'; return out }
  let P
  try {
    P = await bundle('proxy', "export * from '@/proxy'", {
      stubs: {
        '@supabase/ssr': "export function createServerClient(url, key, opts) { return { auth: { async getUser() { return { data: { user: null }, error: null } } } } }",
        '@/lib/ratelimit': ['ratelimit', 'strictRatelimit', 'eventsRatelimit', 'embedRatelimit', 'customHostRatelimit', 'domainCheckRatelimit', 'demoRatelimit', 'signupRatelimit', 'signupEmailRatelimit', 'domainPreflightRatelimit']
          .map(n => `export const ${n} = { async limit() { return { success: true, remaining: 99, limit: 100, reset: 0 } } }`).join('\n'),
      },
    })
  } catch (e) { out['router|X|bundle'] = 'ERROR ' + String(e.message).slice(0, 400); return out }
  const proxy = P.proxy || P.default
  if (typeof proxy !== 'function') { out['router|X|bundle'] = 'ERROR proxy.ts exports no proxy function'; return out }

  const parseSetCookie = res => (typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []).map(c => c.replace(/;\s*expires=[^;]+/i, ''))
  async function once(host, url, cookies, ip) {
    const headers = { host }
    if (ip) headers['x-vercel-ip-country'] = ip
    const ck = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
    if (ck) headers.cookie = ck
    const req = new NextRequest(new URL(url, `https://${host}`), { headers })
    const res = await ctx.kit.quietAsync(() => proxy(req))
    const loc = res.headers.get('location')
    const rewrite = res.headers.get('x-middleware-rewrite')
    const next = res.headers.get('x-middleware-next')
    const kind = loc ? 'redirect' : rewrite ? 'rewrite' : next ? 'next' : 'response'
    const strip = u => { if (!u) return null; try { const x = new URL(u); return x.host === host ? `${x.pathname}${x.search}` : x.href } catch { return u } }
    return { status: res.status, kind, location: strip(loc), rewrite: strip(rewrite), setCookie: parseSetCookie(res).filter(c => !/^sb-/.test(c)) }
  }
  async function visit(host, url, { cookie, ip, usOn }) {
    return withReq({ rows: usOn ? ROWS.on() : ROWS.off() }, async () => {
      const cookies = cookie ? { hg_country: cookie } : {}
      const first = await once(host, url, cookies, ip)
      if (first.kind !== 'redirect') return first
      const chain = []; let cur = first, seen = new Set([url]), off = null
      for (let i = 0; i < 5 && cur.kind === 'redirect'; i++) {
        for (const c of cur.setCookie) { const m = /^([^=]+)=([^;]*)/.exec(c); if (m) cookies[m[1]] = m[2] }
        const nextUrl = cur.location
        if (!nextUrl || /^https?:/.test(nextUrl) && !nextUrl.includes(host)) { chain.push({ offHost: nextUrl }); off = nextUrl; break }
        const loop = seen.has(nextUrl); seen.add(nextUrl)
        cur = await once(host, nextUrl, cookies, ip)
        chain.push({ url: nextUrl, status: cur.status, kind: cur.kind, location: cur.location, ...(loop ? { LOOP: true } : {}) })
        if (loop) break
      }
      return { ...first, chain, ends: off ? `off-host ${off}` : cur.kind === 'redirect' ? 'STILL REDIRECTING AFTER 5' : `${cur.kind} ${chain.length ? chain[chain.length - 1].url : url}` }
    })
  }
  const label = (host, url, { cookie, ip, usOn }) => `router|X|${host} ${url} c=${cookie || '-'} ip=${ip || '-'} us=${usOn ? 'on' : 'off'}`
  for (const usOn of [false, true]) {
    for (const p of ROUTER_PATHS) for (const i of ROUTER_INPUTS) {
      const o = { cookie: i.cookie, ip: i.ip, usOn }
      await safeAsync(out, label(HG, p + i.q, o), () => visit(HG, p + i.q, o))
    }
    for (const p of COUNTRY_PAGES) for (const i of COUNTRY_INPUTS) {
      const o = { cookie: i.cookie, ip: i.ip, usOn }
      await safeAsync(out, label(HG, p + i.q, o), () => visit(HG, p + i.q, o))
    }
    for (const p of ODD_PATHS) await safeAsync(out, label(HG, p, { usOn }), () => visit(HG, p, { usOn }))
    for (const [host, paths] of UNTOUCHED) for (const p of paths) {
      for (const i of [{}, { cookie: 'US', ip: 'US' }]) {
        const o = { ...i, usOn }
        await safeAsync(out, label(host, p, o), () => visit(host, p, o))
      }
    }
  }
  // ══ THE DEMO BOUNCES (Language Phase 1e tidy) — /api/demo/return and /demo/<ref> with a refused token/ref send the visitor to
  // the landing with ?demo=…#try. The REAL route handlers run (the refusal returns before any database read); the view is
  // their Location (with its #fragment) and where the proxy then leaves the visitor. Code where a handler is missing
  // records ERROR, which the comparison names.
  const DEMO = [['api/demo/return', 'demoReturn', '/api/demo/return?t=nope'], ['demo/[ref]', 'demoRef', '/demo/NOT%20A%20REF']]
  for (const [route, tag, url] of DEMO) {
    if (!exists(`app/${route}/route.ts`)) continue
    let R
    try { R = await bundle(tag, `export { GET } from '@/app/${route}/route'`) } catch (e) { out[`router|X|${tag} bundle`] = 'ERROR ' + String(e.message).slice(0, 300); continue }
    for (const usOn of [false, true]) for (const [host, i] of [[HG, {}], [HG, { cookie: 'US' }], [HG, { ip: 'US' }], [VF, {}]]) {
      const o = { ...i, usOn }
      await safeAsync(out, `router|X|${host} ${tag} ${url} c=${i.cookie || '-'} ip=${i.ip || '-'} us=${usOn ? 'on' : 'off'}`, () => withReq({ rows: usOn ? ROWS.on() : ROWS.off() }, async () => {
        const headers = { host }
        if (i.ip) headers['x-vercel-ip-country'] = i.ip
        if (i.cookie) headers.cookie = `hg_country=${i.cookie}`
        const req = new NextRequest(new URL(url, `https://${host}`), { headers })
        const res = await ctx.kit.quietAsync(() => R.GET(req, { params: Promise.resolve({ ref: 'NOT A REF' }) }))
        const loc = res.headers.get('location')
        let where = loc
        try { const x = new URL(loc); where = x.host === host ? `${x.pathname}${x.search}${x.hash}` : x.href } catch { /* as sent */ }
        const then = where && where.startsWith('/') ? await visit(host, where.replace(/#.*$/, ''), o) : null
        return { status: res.status, location: where, then: then && { kind: then.kind, location: then.location, ends: then.ends || null } }
      }))
    }
  }
  return out
}

module.exports = { views, ROUTER_PATHS, COUNTRY_PAGES, ROUTER_INPUTS, COUNTRY_INPUTS, ODD_PATHS, UNTOUCHED, HG, VF, CUSTOM }
