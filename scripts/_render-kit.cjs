// scripts/_render-kit.cjs — the machinery a rendering harness needs, in one place (a MODULE, not a harness:
// listed under shared_modules in scripts/harnesses.json). First used by scripts/time-dates-parity.cjs.
//
//   const kit = require('./_render-kit.cjs')({ cacheTag: 'time-dates' })
//   kit.setNow('2026-10-09T14:20:00Z'); kit.setDeviceTz('Europe/London')
//   const m = await kit.bundle('tag', `export * from '@/lib/x'`, { patches })
//
// ── WHAT IS STUBBED, AND WHY NOTHING REACHES A DATABASE OR THE NETWORK ──────────────────────────────────
// `@/lib/supabase` and `@supabase/supabase-js` resolve to stand-ins that hand back `globalThis.__harnessDb`
// (an in-memory table set, see fakeDb) or, when none is set, a proxy that THROWS on any use. `server-only`
// is empty, `next/navigation` is a stub whose search params come from `globalThis.__msSearch`, and
// `next/image` / `next/link` are a plain <img> / <a>.
//
// ── THE CLOCK ─────────────────────────────────────────────────────────────────────────────────────────
// `Date` is replaced, for the whole process, by a subclass whose "now" is `kit.setNow()`'s instant. The
// device's time zone is `process.env.TZ`, which Node re-reads when it is assigned (`kit.setDeviceTz`), so
// one run can render a UK browser (Europe/London) and a Vercel server (UTC) at the same instant.

const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')

// ── THE FROZEN CATALOGUE SWITCH (Language Phase 2, scripts/_lp2-frozen.cjs) ─────────────────────────────
// HG_MESSAGES_FROZEN=<frozen en-GB.json> makes every bundle read "the AFTER code with the BEFORE words": each
// `@/messages/ns/en-GB/<ns>.json` / `@/messages/en-GB.json` import resolves to the current catalogue with every key
// the frozen file has set back to its frozen value, and the en-US ones to {}. HG_MESSAGES_SOURCE=1 resolves them
// from the authored messages/*.json as they stand (what split-messages would generate). Off → the files on disk.
// A plugin's onResolve sees the import BEFORE esbuild's `alias` option rewrites '@' (checked on esbuild's own
// build), so these imports never reach the alias. Each switch state bundles into its own cache directory, and
// HG_KIT_CACHE_SUFFIX separates runs that must not share one (language-phase-2's BEFORE / F / A captures).
const LP2 = require('./_lp2-frozen.cjs')

module.exports = function renderKit({ cacheTag }) {
  const sw = LP2.mode()
  const CACHE = path.join(REPO, 'node_modules/.cache', cacheTag + (sw ? (sw.mode === 'frozen' ? '-frozen' : '-source') : '') + (process.env.HG_KIT_CACHE_SUFFIX ? `-${process.env.HG_KIT_CACHE_SUFFIX}` : ''))
  fs.mkdirSync(CACHE, { recursive: true })

  // ── clock ──
  const RealDate = Date
  let NOW = RealDate.now()
  if (!globalThis.__kitDateInstalled) {
    globalThis.Date = class extends RealDate {
      constructor(...a) { super(...(a.length ? a : [globalThis.__kitNow ?? RealDate.now()])) }
      static now() { return globalThis.__kitNow ?? RealDate.now() }
    }
    globalThis.__kitDateInstalled = true
  }
  const setNow = iso => { NOW = RealDate.parse(iso); globalThis.__kitNow = NOW }
  const setDeviceTz = tz => { process.env.TZ = tz }
  // ── the device's LOCALE, for a date call that names none (`d.toLocaleTimeString()`). Node's own default is
  // en-US; a UK browser's is en-GB, which is what the device these harnesses stand in for would use.
  if (!globalThis.__kitLocaleInstalled) {
    for (const fn of ['toLocaleTimeString', 'toLocaleDateString', 'toLocaleString']) {
      const orig = RealDate.prototype[fn]
      RealDate.prototype[fn] = function (loc, opts) { return orig.call(this, loc === undefined ? (globalThis.__kitDeviceLocale || 'en-GB') : loc, opts) }
    }
    globalThis.__kitLocaleInstalled = true
  }
  const setDeviceLocale = loc => { globalThis.__kitDeviceLocale = loc }

  // ── bundling ──
  const NAV_STUB = `export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} })
export const usePathname = () => globalThis.__kitPathname ?? '/'   // seo-fixes: a harness may set the path (default '/', as before)
export const useSearchParams = () => new URLSearchParams(globalThis.__msSearch || '')
export const useParams = () => (globalThis.__msParams || { id: 'harness-order', slug: 'test-kitchen', token: 'harness' })
export const notFound = () => { throw new Error('notFound') }
export const redirect = (to) => { const e = new Error('redirect'); e.redirectTo = to; throw e }   // ireland-1: the target rides on the error (message unchanged)`
  const DB_STUB = "export const supabase = new Proxy({}, { get(_, k) { const db = globalThis.__harnessDb; if (db) return db[k]; throw new Error('no database in this harness') } })"
  // Every export of the database library is a function returning a client that resolves the fixture database
  // AT USE TIME — a module that builds its client at load (most routes do) still reads the run's tables.
  const DBLIB_STUB = "const lazy = new Proxy({}, { get(_, k) { const db = globalThis.__harnessDb; if (db) return db[k]; throw new Error('no database in this harness') } })\nmodule.exports = Object.create(new Proxy({}, { get: (_, k) => (typeof k === 'symbol' ? undefined : () => lazy) }))"

  // A patch {file, states: [...]} starts those useState hooks from globalThis.__ms when it holds the name.
  const MS_USE = "const __msUse = (k, p) => (globalThis.__ms && Object.prototype.hasOwnProperty.call(globalThis.__ms, k) ? [globalThis.__ms[k], p[1]] : p);\n"
  function wrapStates(src, names, file) {
    for (const name of names) {
      const re = new RegExp(`const\\s*\\[\\s*${name}\\s*,\\s*\\w+\\s*\\]\\s*=\\s*useState`, 'g')
      let m, hits = 0, out = '', last = 0
      while ((m = re.exec(src))) {
        let i = m.index + m[0].length
        const callStart = i - 'useState'.length
        if (src[i] === '<') {
          let d = 0
          for (; i < src.length; i++) {
            if (src[i] === '<') d++
            else if (src[i] === '>' && src[i - 1] !== '=') { d--; if (d === 0) { i++; break } }
          }
        }
        if (src[i] !== '(') throw new Error(`[${file}] useState for '${name}' has no call after it`)
        let d = 0, q = null
        for (; i < src.length; i++) {
          const c = src[i]
          if (q) { if (c === '\\') i++; else if (c === q) q = null; continue }
          if (c === "'" || c === '"' || c === '`') q = c
          else if (c === '(') d++
          else if (c === ')') { d--; if (d === 0) { i++; break } }
        }
        out += src.slice(last, callStart) + `__msUse('${name}', ` + src.slice(callStart, i) + ')'
        last = i; hits++
      }
      if (!hits) throw new Error(`[${file}] no useState found for '${name}'`)
      src = out + src.slice(last)
    }
    return src
  }

  let bundleN = 0
  // `stubs`: { 'module/name': 'export … source' } — a module answered with the given source (e.g.
  // next/font/google and next/headers, which only exist inside Next's own compiler and request scope).
  async function bundle(tag, entry, { patches = [], define = {}, alias = {}, stubs = {} } = {}) {
    const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
    const applied = new Map(patches.map((p, i) => [i, false]))
    const plugin = {
      name: 'render-kit',
      setup(b) {
        b.onResolve({ filter: /(^|\/)messages\/(ns\/)?en-(GB|US)(\/[A-Za-z0-9]+)?\.json$/ }, a => {
          const abs = LP2.resolveMessages(a.path)
          return abs ? { path: abs } : undefined
        })
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'stub' }))
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'nav', namespace: 'stub' }))
        b.onResolve({ filter: /^next\/(image|link)$/ }, a => ({ path: a.path, namespace: 'stub' }))
        b.onResolve({ filter: /(^@\/|\/)lib\/supabase(\.ts)?$/ }, () => ({ path: 'db', namespace: 'stub' }))
        b.onResolve({ filter: /^@supabase\/supabase-js$|^https:\/\/esm\.sh\/@supabase\/supabase-js/ }, () => ({ path: 'dblib', namespace: 'stub' }))
        for (const name of Object.keys(stubs)) {
          b.onResolve({ filter: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }, () => ({ path: 'custom:' + name, namespace: 'stub' }))
        }
        for (const [from, to] of Object.entries(alias)) {
          b.onResolve({ filter: new RegExp('^' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }, () => ({ path: path.join(REPO, to) }))
        }
        b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({
          contents: a.path.startsWith('custom:') ? stubs[a.path.slice(7)]
            : a.path === 'nav' ? NAV_STUB
            : a.path === 'next/image' ? "import { createElement } from 'react'\nexport default function Image(p) { return createElement('img', { alt: p.alt, src: typeof p.src === 'string' ? p.src : '' }) }"
            : a.path === 'next/link' ? "import { createElement } from 'react'\nexport default function Link({ href, children, className }) { return createElement('a', { href: typeof href === 'string' ? href : '', className }, children) }"
            : a.path === 'db' ? DB_STUB
            : a.path === 'dblib' ? DBLIB_STUB
            : '',
          loader: 'js',
        }))
        const files = [...new Set(patches.map(p => path.join(REPO, p.file)))]
        for (const abs of files) {
          const esc = abs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          b.onLoad({ filter: new RegExp('^' + esc + '$') }, () => {
            let src = fs.readFileSync(abs, 'utf8')
            patches.forEach((p, i) => {
              if (path.join(REPO, p.file) !== abs) return
              if (p.states) { src = wrapStates(src, p.states, p.file) + '\n' + MS_USE; applied.set(i, true); return }
              if (p.append) { src += '\n' + p.append + '\n'; applied.set(i, true); return }
              const from = p.from instanceof RegExp ? p.from : null
              if (from ? from.test(src) : src.includes(p.from)) { src = from ? src.replace(from, p.to) : src.replace(p.from, p.to); applied.set(i, true) }
            })
            return { contents: src, loader: abs.endsWith('x') ? 'tsx' : 'ts' }
          })
        }
      },
    }
    const res = await esbuild.build({
      stdin: { contents: entry, resolveDir: REPO, loader: 'tsx' },
      bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', target: 'node20',
      logLevel: 'silent', alias: { '@': REPO },
      loader: { '.css': 'empty', '.svg': 'text', '.png': 'empty', '.jpg': 'empty' },
      external: ['react', 'react-dom', 'react/jsx-runtime', 'next', 'next/*', 'puppeteer-core', '@sparticuz/chromium'],
      define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_PRICING_PUBLISHED': '"true"', ...define },
      plugins: [plugin],
    })
    patches.forEach((p, i) => {
      if (!applied.get(i) && !p.optional) throw new Error(`[${tag}] a patch did not apply in ${p.file}: ${String(p.from || p.append || p.states).slice(0, 140)}`)
    })
    const out = path.join(CACHE, `${tag}-${bundleN++}.cjs`)
    fs.writeFileSync(out, res.outputFiles[0].text)
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:9'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'harness-anon'
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:9'
    return quiet(() => require(out))
  }

  // ── rendering ──
  const React = () => require(path.join(REPO, 'node_modules/react'))
  const h = (...a) => React().createElement(...a)
  function quiet(fn) {
    const q = [console.error, console.warn, console.log]
    console.error = () => {}; console.warn = () => {}; console.log = () => {}
    try { return fn() } finally { [console.error, console.warn, console.log] = q }
  }
  async function quietAsync(fn) {
    const q = [console.error, console.warn, console.log]
    console.error = () => {}; console.warn = () => {}; console.log = () => {}
    try { return await fn() } finally { [console.error, console.warn, console.log] = q }
  }
  function renderStatic(el) {
    const { renderToStaticMarkup } = require(path.join(REPO, 'node_modules/react-dom/server'))
    return quiet(() => renderToStaticMarkup(el))
  }
  function textOf(html) {
    const ents = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&pound;/g, '£')
    const attrs = [...html.matchAll(/\s(value|placeholder|aria-label|title|alt|href|min|max)="([^"]*)"/g)].map(m => `${m[1]}=${ents(m[2])}`)
    return { text: ents(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(), attrs }
  }
  function renderWith(state, el, search) {
    globalThis.__ms = state
    if (search != null) globalThis.__msSearch = search
    try { return textOf(renderStatic(el)) } finally { delete globalThis.__ms; if (search != null) delete globalThis.__msSearch }
  }

  // ── an in-memory database that honours the filters a query states, and records every write ──
  function fakeDb(tables, writes = []) {
    const cmp = (a, b) => (a == null || b == null ? NaN : (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0))
    const from = t => {
      const filters = []; let op = 'select', payload = null, single = null, limitN = null, orderBy = null
      const c = {
        select() { return c },
        eq(k, v) { filters.push(r => String(r[k]) === String(v)); return c },
        neq(k, v) { filters.push(r => String(r[k]) !== String(v)); return c },
        lt(k, v) { filters.push(r => cmp(r[k], v) < 0); return c },
        lte(k, v) { filters.push(r => cmp(r[k], v) <= 0); return c },
        gt(k, v) { filters.push(r => cmp(r[k], v) > 0); return c },
        gte(k, v) { filters.push(r => cmp(r[k], v) >= 0); return c },
        in(k, vs) { filters.push(r => vs.map(String).includes(String(r[k]))); return c },
        is(k, v) { filters.push(r => (r[k] ?? null) === v); return c },
        not() { return c },
        or(expr) {
          const parts = String(expr).split(',').map(p => p.split('.'))
          filters.push(r => parts.some(([k, o, ...rest]) => {
            const v = rest.join('.')
            if (o === 'is' && v === 'null') return r[k] == null
            if (o === 'eq') return String(r[k]) === v
            if (o === 'lt') return cmp(r[k], v) < 0
            if (o === 'lte') return cmp(r[k], v) <= 0
            if (o === 'gt') return cmp(r[k], v) > 0
            if (o === 'gte') return cmp(r[k], v) >= 0
            return false
          }))
          return c
        },
        order(k, o) { orderBy = { k, asc: !o || o.ascending !== false }; return c },
        limit(n) { limitN = n; return c },
        range() { return c },
        update(p) { op = 'update'; payload = p; return c },
        insert(p) { op = 'insert'; payload = p; return c },
        upsert(p) { op = 'upsert'; payload = p; return c },
        delete() { op = 'delete'; return c },
        maybeSingle() { single = 'maybe'; return c },
        single() { single = 'one'; return c },
        then(res, rej) {
          let rows = (tables[t] || []).filter(r => filters.every(fn => fn(r)))
          if (orderBy) rows = rows.slice().sort((a, b) => (orderBy.asc ? 1 : -1) * cmp(a[orderBy.k], b[orderBy.k]))
          if (limitN != null) rows = rows.slice(0, limitN)
          if (op !== 'select') {
            writes.push({ table: t, op, patch: payload, ids: rows.map(r => r.id ?? null) })
            return Promise.resolve({ data: op === 'insert' ? payload : null, error: null }).then(res, rej)
          }
          const data = single ? (rows[0] ?? null) : rows
          const error = single === 'one' && !rows.length ? { message: 'no rows', code: 'PGRST116' } : null
          return Promise.resolve({ data, error, count: rows.length }).then(res, rej)
        },
      }
      return c
    }
    return { from, rpc: async () => ({ data: null, error: null }), channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} }
  }

  return { REPO, CACHE, setNow, setDeviceTz, setDeviceLocale, bundle, h, React, renderStatic, textOf, renderWith, fakeDb, quiet, quietAsync, wrapStates }
}
