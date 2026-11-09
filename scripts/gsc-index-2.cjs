// scripts/gsc-index-2.cjs — gsc-index-2's proof (9 November 2026; docs/gsc-index-2-report.md): THE LEGAL HREFLANG CLUSTERS, THE
// LEGAL SITEMAP ENTRIES AND /support, AGAINST A REAL PRODUCTION BUILD ON LOCALHOST.
//
//   npx next build && node scripts/gsc-index-2.cjs                       # this checkout's build
//   node scripts/gsc-index-2.cjs --dir=<built checkout>                   # another checkout's build
//   node scripts/gsc-index-2.cjs --dir=<after> --before=<built checkout of the commit before>   # + §5, the before/after diff
//
// It starts `next start` on each build (a free port, 127.0.0.1 only), asks it as a HatchGrab host (hatchgrab.localhost), and stops
// it at the end. The build reads the country list the way the site does (its .env.local), so the clusters are the live ones.
//   0 · SOURCE: every translated page and every English page takes its hreflang from legalLanguages; the sitemap does too; the
//       /support rule sits beside the cross-host rule and is a 308
//   1 · SITEMAP: every legal URL is listed (English 3 + every translation the site serves), each with the full cluster as
//       xhtml:link, lastmod the English document's date, yearly, 0.3
//   2 · CLUSTERS: every member answers 200, is indexable (no noindex header or meta), is canonical to itself, and its <head> hreflang
//       is exactly its document's cluster, so each member lists every other (reciprocal) and itself; the code for a translation
//       is its own country's locale; an English-speaking country's address redirects and is listed nowhere
//   3 · the cluster's languages are exactly the non-English languages of the switched-on countries the country pages name
//   4 · /support → 308 → /contact on a HatchGrab host, the query kept; not on another host
//   5 · (with --before) BEFORE vs AFTER: every sitemap entry that is not a legal one is byte-identical; the English legal entries
//       gain only xhtml:links; the only new URLs are translated legal pages; the country, features, FAQ and comparison pages'
//       HTML is identical (build-specific asset names and ids masked)
// ⛔ NOT IN THE SWEEP (scripts/harnesses.json → excluded.server): it needs a completed `next build` and starts a server. A sweep
// that skipped it would report green for something nobody checked.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const http = require('http')
const net = require('net')
const { spawn } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const ORIGIN = 'https://www.hatchgrab.com'
const argOf = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || null
const AFTER_DIR = path.resolve(argOf('dir') || REPO)
const BEFORE_DIR = argOf('before') ? path.resolve(argOf('before')) : null

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600)}`) } }
const head = s => console.log(`\n── ${s}`)

// ── the server ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const servers = []
async function startServer(dir) {
  if (!fs.existsSync(path.join(dir, '.next', 'BUILD_ID'))) throw new Error(`no build in ${dir} (.next/BUILD_ID missing): run \`npx next build\` there first`)
  const port = await freePort()
  const bin = path.join(dir, 'node_modules', '.bin', 'next')
  const child = spawn(bin, ['start', '-p', String(port), '-H', '127.0.0.1'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'production' } })
  let log = ''; child.stdout.on('data', d => { log += d }); child.stderr.on('data', d => { log += d })
  servers.push(child)
  for (let i = 0; i < 120; i++) {
    try { const r = await get(port, '/robots.txt'); if (r.status === 200) return { port, child, log: () => log } } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500))
    if (child.exitCode !== null) throw new Error(`next start exited (${child.exitCode}) in ${dir}:\n${log.slice(-1500)}`)
  }
  throw new Error(`next start did not answer in 60 s (${dir}):\n${log.slice(-1500)}`)
}
const stopAll = () => { for (const c of servers) try { c.kill('SIGTERM') } catch { /* gone */ } }
process.on('exit', stopAll)

/** One request to the local build, as a HatchGrab host (or `host`), never following a redirect. 127.0.0.1 only. */
function get(port, pathname, host) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method: 'GET', headers: { host: host || `hatchgrab.localhost:${port}`, 'user-agent': 'gsc-index-2 harness' } }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', d => { body += d }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.setTimeout(60000, () => req.destroy(new Error(`timeout ${pathname}`)))
    req.on('error', reject); req.end()
  })
}
const localPath = abs => abs.startsWith(ORIGIN) ? (abs.slice(ORIGIN.length) || '/') : null

// ── parsing ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const unesc = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const attr = (tag, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag); return m ? unesc(m[1]) : null }
function headOf(html) {
  const h = html.slice(0, Math.max(0, html.indexOf('</head>')) || html.length)
  const out = { canonical: null, languages: {}, robots: [] }
  for (const m of h.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attr(m[0], 'rel') || '').toLowerCase()
    if (rel === 'canonical') out.canonical = attr(m[0], 'href')
    else if (rel === 'alternate' && attr(m[0], 'hreflang')) out.languages[attr(m[0], 'hreflang')] = attr(m[0], 'href')
  }
  for (const m of h.matchAll(/<meta\b[^>]*>/gi)) if (['robots', 'googlebot'].includes((attr(m[0], 'name') || '').toLowerCase())) out.robots.push(attr(m[0], 'content') || '')
  return out
}
function sitemapOf(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => {
    const b = m[1]
    const one = k => { const r = new RegExp(`<${k}>([^<]*)</${k}>`).exec(b); return r ? unesc(r[1]) : null }
    const languages = {}
    for (const l of b.matchAll(/<xhtml:link\b[^>]*>/g)) languages[attr(l[0], 'hreflang')] = attr(l[0], 'href')
    return { raw: m[0], loc: one('loc'), lastmod: one('lastmod'), changefreq: one('changefreq'), priority: one('priority'), languages }
  })
}
const sameMap = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())
const LEGAL_RE = /^https:\/\/www\.hatchgrab\.com(\/[a-z]{2})?\/(privacy|terms|country-terms)$/
const DOCS = ['privacy', 'terms', 'country-terms']

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}

async function main() {
  // ── 0 · source ──
  head('0 · SOURCE: one cluster builder, used everywhere; /support beside the cross-host rule')
  const src = f => fs.readFileSync(path.join(AFTER_DIR, f), 'utf8')
  const tl = src('components/legal/translated-legal.tsx')
  t('translated-legal.tsx exports legalLanguages(doc)', /export async function legalLanguages\(doc: LegalDoc\)/.test(tl))
  t('legalMetadata takes its hreflang from legalLanguages (the three-entry set is gone)', /languages: await legalLanguages\(doc\)/.test(tl) && !/\[locale\]: url, 'en-GB'/.test(tl))
  t('legalLanguages applies the redirect tests: switched on, has an address, not English, has a translation file',
    /!row\.enabled \|\| !COUNTRY_PATH_SEGMENTS\[row\.countryCode\]/.test(tl) && /!legalBaseOf\(locale\) \|\| !legalDocumentSource\(doc, \{ country: row\.countryCode, locale \}\)\.translatedInto/.test(tl))
  for (const doc of DOCS) {
    const p = src(`app/(app)/(legal)/${doc}/page.tsx`)
    t(`English /${doc}: hreflang from legalLanguages('${doc}'), canonical kept from ownUrlMetadata`, p.includes(`alternates: { ...own.alternates, languages: await legalLanguages('${doc}') }`) && /const own = await ownUrlMetadata\(/.test(p))
  }
  const sm = src('app/sitemap.ts')
  t('the sitemap reads the same clusters (legalLanguages)', sm.includes("import { legalLanguages } from '@/components/legal/translated-legal'") && sm.includes("privacy: await legalLanguages('privacy')"))
  const px = src('proxy.ts')
  const iCross = px.indexOf('if (crossHost) return NextResponse.redirect(crossHost, 308)'), iSup = px.indexOf("isHatchGrab(host) && pathname === '/support'")
  t("proxy.ts: /support → /contact right after the cross-host rule, HatchGrab hosts only, 308", iCross > 0 && iSup > iCross && iSup - iCross < 900 && /new URL\('\/contact', request\.url\); to\.search = request\.nextUrl\.search\s*\/\/[^\n]*\n\s*return NextResponse\.redirect\(to, 308\)/.test(px))

  // ── the build ──
  const after = await startServer(AFTER_DIR)
  console.log(`\n   after: ${AFTER_DIR} on 127.0.0.1:${after.port}`)
  const smr = await get(after.port, '/sitemap.xml')
  t('sitemap.xml answers 200', smr.status === 200, smr.status)
  const entries = sitemapOf(smr.body)
  const legal = entries.filter(e => LEGAL_RE.test(e.loc))

  // ── 1 · sitemap ──
  head('1 · SITEMAP: every legal URL, with its cluster, its date, yearly, 0.3')
  const english = Object.fromEntries(DOCS.map(d => [d, entries.find(e => e.loc === `${ORIGIN}/${d}`)]))
  for (const doc of DOCS) t(`/${doc} is listed`, !!english[doc])
  const cluster = Object.fromEntries(DOCS.map(d => [d, english[d] ? english[d].languages : {}]))
  for (const doc of DOCS) {
    const c = cluster[doc]
    const members = [...new Set(Object.values(c))]
    t(`${doc}: the cluster names en-GB and x-default → the English page`, c['en-GB'] === `${ORIGIN}/${doc}` && c['x-default'] === `${ORIGIN}/${doc}`, c)
    t(`${doc}: one URL per locale (no address under two codes)`, members.length === Object.keys(c).length - 1, Object.keys(c).length)
    const listed = legal.filter(e => e.loc.endsWith(`/${doc}`)).map(e => e.loc).sort()
    t(`${doc}: the sitemap lists exactly the cluster's members (${members.length})`, JSON.stringify(listed) === JSON.stringify(members.slice().sort()), { listed: listed.length, members: members.length })
    for (const e of legal.filter(x => x.loc.endsWith(`/${doc}`))) {
      t(`${e.loc}: xhtml:links are the cluster`, sameMap(e.languages, c))
      t(`${e.loc}: lastmod = the English document's (${english[doc] && english[doc].lastmod})`, !!e.lastmod && e.lastmod === (english[doc] && english[doc].lastmod), e.lastmod)
      t(`${e.loc}: yearly, 0.3`, e.changefreq === 'yearly' && e.priority === '0.3', [e.changefreq, e.priority])
    }
  }
  console.log(`   legal URLs in the sitemap: ${legal.length} (English ${legal.filter(e => !/\/[a-z]{2}\/[a-z-]+$/.test(e.loc)).length}, translations ${legal.filter(e => /\/[a-z]{2}\/[a-z-]+$/.test(e.loc)).length}); all URLs: ${entries.length}`)

  // ── 2 · clusters, live ──
  head('2 · CLUSTERS: every member 200, indexable, self-canonical, and declares the whole cluster')
  const members = DOCS.flatMap(doc => [...new Set(Object.values(cluster[doc]))].map(url => ({ doc, url })))
  const pages = await pool(members, 6, async m => ({ ...m, r: await get(after.port, localPath(m.url)) }))
  for (const { doc, url, r } of pages) {
    const h = headOf(r.body)
    const noindex = String(r.headers['x-robots-tag'] || '').includes('noindex') || h.robots.some(x => x.includes('noindex'))
    t(`${url}: 200`, r.status === 200, r.status)
    t(`${url}: indexable`, !noindex, [r.headers['x-robots-tag'], h.robots])
    t(`${url}: canonical is itself`, h.canonical === url, h.canonical)
    t(`${url}: <head> hreflang is exactly the ${doc} cluster (lists every member and itself)`, sameMap(h.languages, cluster[doc]),
      { onlyHead: Object.entries(h.languages).filter(([k, v]) => cluster[doc][k] !== v), onlyCluster: Object.entries(cluster[doc]).filter(([k, v]) => h.languages[k] !== v) })
  }
  // the pairwise check, stated as Google applies it: A names B ⇒ B names A, under the code A uses for B
  const headOfUrl = Object.fromEntries(pages.map(p => [p.url, headOf(p.r.body).languages]))
  let oneWay = 0
  for (const [a, la] of Object.entries(headOfUrl)) for (const [code, b] of Object.entries(la)) {
    if (code === 'x-default' || b === a) continue
    const lb = headOfUrl[b]; const selfCode = Object.keys(la).find(k => la[k] === a)
    if (!lb || lb[selfCode] !== a || lb[code] !== b) oneWay++
  }
  t('no one-way hreflang pair among all legal pages (A → B ⇒ B → A, same codes)', oneWay === 0, oneWay)
  for (const doc of DOCS) for (const [code, url] of Object.entries(cluster[doc])) {
    if (code === 'en-GB' || code === 'x-default') continue
    const seg = (/^https:\/\/www\.hatchgrab\.com\/([a-z]{2})\//.exec(url) || [])[1]
    const region = (/^[a-z]{2,3}-([A-Z]{2})$/.exec(code) || [])[1]
    t(`${doc} ${code}: listed at its own country's address (/${seg})`, !!seg && !!region && region.toLowerCase() === seg, { code, url })
  }
  for (const seg of ['uk', 'us', 'ie', 'au']) {
    const r = await get(after.port, `/${seg}/privacy`)
    t(`/${seg}/privacy (English-speaking) redirects to /privacy and is in no cluster`, r.status >= 300 && r.status < 400 && /\/privacy$/.test(r.headers.location || '') && !Object.values(cluster.privacy).includes(`${ORIGIN}/${seg}/privacy`), [r.status, r.headers.location])
  }

  // ── 3 · the cluster's languages = the switched-on non-English countries ──
  head('3 · the translations are exactly the switched-on, non-English countries the country pages name')
  const homes = entries.find(e => e.loc === `${ORIGIN}/uk`)
  t('/uk is listed with its hreflang', !!homes && Object.keys(homes.languages).length > 1)
  if (homes) {
    const want = Object.keys(homes.languages).filter(k => k !== 'x-default' && !k.startsWith('en-')).sort()
    for (const doc of DOCS) {
      const got = Object.keys(cluster[doc]).filter(k => k !== 'x-default' && k !== 'en-GB').sort()
      t(`${doc}: translated languages (${got.length}) = the country pages' non-English languages (${want.length})`, JSON.stringify(got) === JSON.stringify(want), { missing: want.filter(x => !got.includes(x)), extra: got.filter(x => !want.includes(x)) })
    }
  }

  // ── 4 · /support ──
  head('4 · /support → 308 → /contact, the query kept, on a HatchGrab host only')
  for (const [p, to] of [['/support', '/contact'], ['/support?topic=billing&x=1', '/contact?topic=billing&x=1']]) {
    const r = await get(after.port, p)
    const loc = r.headers.location || ''
    t(`${p} → 308 ${to}`, r.status === 308 && (loc === to || loc.replace(/^https?:\/\/[^/]+/, '') === to), [r.status, loc])
  }
  const c = await get(after.port, '/contact')
  t('/contact itself answers 200', c.status === 200, c.status)
  const vf = await get(after.port, '/support', `villagefoodie.localhost:${after.port}`)
  t('/support on a Village Foodie host is not sent to /contact', !(vf.status === 308 && /\/contact/.test(vf.headers.location || '')), [vf.status, vf.headers.location])
  const sub = await get(after.port, '/support/team')
  t('/support/team is not redirected (the rule is the one path)', !(sub.status === 308 && /\/contact/.test(sub.headers.location || '')), [sub.status, sub.headers.location])

  // ── 5 · before / after ──
  if (BEFORE_DIR) {
    head('5 · BEFORE vs AFTER: only the legal entries change')
    const before = await startServer(BEFORE_DIR)
    console.log(`   before: ${BEFORE_DIR} on 127.0.0.1:${before.port}`)
    const bEntries = sitemapOf((await get(before.port, '/sitemap.xml')).body)
    const bBy = Object.fromEntries(bEntries.map(e => [e.loc, e])), aBy = Object.fromEntries(entries.map(e => [e.loc, e]))
    const removed = bEntries.filter(e => !aBy[e.loc]).map(e => e.loc)
    const added = entries.filter(e => !bBy[e.loc]).map(e => e.loc)
    t('no URL left the sitemap', removed.length === 0, removed)
    t(`every added URL is a translated legal page (${added.length})`, added.length > 0 && added.every(u => /^https:\/\/www\.hatchgrab\.com\/[a-z]{2}\/(privacy|terms|country-terms)$/.test(u)), added.filter(u => !/\/[a-z]{2}\/(privacy|terms|country-terms)$/.test(u)))
    let changed = []
    for (const e of bEntries) {
      const a = aBy[e.loc]; if (!a) continue
      if (LEGAL_RE.test(e.loc)) {
        const strip = raw => raw.replace(/\s*<xhtml:link\b[^>]*\/>/g, '')
        t(`${e.loc}: unchanged apart from the added xhtml:links`, strip(a.raw) === strip(e.raw) && Object.keys(e.languages).length === 0 && Object.keys(a.languages).length > 2)
      } else if (a.raw !== e.raw) changed.push(e.loc)
    }
    t(`every non-legal sitemap entry is byte-identical (${bEntries.filter(e => !LEGAL_RE.test(e.loc)).length})`, changed.length === 0, changed)
    t('the sitemap is in the same order, the new entries at the end', JSON.stringify(entries.slice(0, bEntries.length).map(e => e.loc)) === JSON.stringify(bEntries.map(e => e.loc)))
    // The country, features, FAQ and comparison pages (+ /contact, /about), compared as two parts:
    //   • the DOCUMENT, with its scripts taken out: identical;
    //   • the React PAYLOAD (the self.__next_f.push strings, joined): identical as a SET of rows. A prerendered page's payload is
    //     streamed in an order fixed at build time, and that order (with the row numbers it assigns, and where it cuts the stream
    //     into pushes) differs between two builds of the same code.
    // In both: each build's own id (.next/BUILD_ID) and the asset names (/_next/static/…, dpl_…) are masked, and the build-id comment
    // after <!DOCTYPE> is dropped (a page regenerated in the background after its 300 s leaves it out). Masking runs after the pushes
    // are joined, because a push boundary can cut a file name in two.
    const idOf = dir => fs.readFileSync(path.join(dir, '.next', 'BUILD_ID'), 'utf8').trim()
    const mask = (text, id) => text.split(id).join('BUILD_ID')
      .replace(/\/_next\/static\/[^"'\s)\\]+/g, '/_next/static/…')
      .replace(/dpl_[A-Za-z0-9]+/g, 'dpl_…')
      .replace(/nonce="[^"]*"/g, 'nonce="…"')
      .replace(/(\\?"rendered\\?":\\?")\d+\.[0-9a-f]+/g, '$1…')   // /contact's form token: the time it was served + its signature
    const docOf = (html, id) => mask(html.replace(/<script\b[\s\S]*?<\/script>/g, '<script/>').replace(/(<script\/>)+/g, '<script/>')
      .replace(/^<!DOCTYPE html><!--[^>]*-->/, '<!DOCTYPE html>'), id)
    const rowsOf = (html, id) => mask([...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g)].map(m => m[1]).join(''), id)
      .replace(/[0-9a-f]+:T([0-9a-f]+),/g, '\\n#:T$1,')        // a text row (length-prefixed) can start mid-line,
      .replace(/[0-9a-f]{1,3}:(?=\[|\{|I\[|\\")/g, '\\n')         // and so can any row, straight after the one before it
      .split('\\n').map(r => r.replace(/^[0-9a-f]+:/, '').replace(/\$(L|@|F|Q|W|K|B|Y|h|T|n|D|E|S|i|k|l)?[0-9a-f]+\b/g, '$#'))
      .filter(Boolean).sort().join('\n')
    const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return { at: i, before: a.slice(Math.max(0, i - 80), i + 160), after: b.slice(Math.max(0, i - 80), i + 160) } }
    const pagesToCompare = bEntries.filter(e => !LEGAL_RE.test(e.loc)).map(e => e.loc)
    const diffs = []
    // The same Host for both builds: a page that reads it (/contact's og:image) would otherwise differ by the port.
    const H = 'hatchgrab.localhost:3000'
    await pool(pagesToCompare, 4, async url => {
      const [rb, ra] = [await get(before.port, localPath(url), H), await get(after.port, localPath(url), H)]
      if (rb.status !== ra.status) return diffs.push({ url, why: `status ${rb.status} → ${ra.status}` })
      const [ib, ia] = [idOf(BEFORE_DIR), idOf(AFTER_DIR)]
      const [db, da] = [docOf(rb.body, ib), docOf(ra.body, ia)]
      if (db !== da) return diffs.push({ url, why: 'document', ...firstDiff(db, da) })
      const [pb, pa] = [rowsOf(rb.body, ib), rowsOf(ra.body, ia)]
      if (pb !== pa) return diffs.push({ url, why: 'payload rows', ...firstDiff(pb, pa) })
    })
    t(`the ${pagesToCompare.length} country / features / FAQ / comparison / contact / about pages render the same HTML`, diffs.length === 0, diffs.slice(0, 3))
  } else console.log('\n── 5 · BEFORE vs AFTER: not run (pass --before=<built checkout of the commit before>)')

  console.log(`\n${fail ? '🔴' : '✅'} gsc-index-2: ${pass} passed, ${fail} failed`)
  stopAll()
  process.exit(fail ? 1 : 0)
}
main().catch(e => { console.log(`\n🔴 gsc-index-2: ${e.stack || e}`); stopAll(); process.exit(1) })
