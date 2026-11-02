// scripts/indexnow/main.ts — after a production deploy, submit every sitemap URL to IndexNow (faq-2-seo-geo-2 B6, 2 November
// 2026). Run by .github/workflows/indexnow.yml once the Vercel deployment of the pushed commit is live, through
// scripts/competitor-check/run.mjs (which bundles a .ts entry with esbuild):
//
//   node scripts/competitor-check/run.mjs scripts/indexnow/main.ts [--dry-run] [--sitemap URL ...]
//
// Every URL is probed first (redirects NOT followed) and left out unless it answers 200 itself, says no noindex (X-Robots-Tag or
// robots meta) and names no other canonical (lib/indexnow.ts probeVerdict). Each left-out URL is logged with its reason; each
// IndexNow response is logged. --dry-run probes and prints, and submits nothing. No secret is needed: the key is public by design.
import { submitIndexNow, probeVerdict } from '@/lib/indexnow'

const SITEMAPS = ['https://www.hatchgrab.com/sitemap.xml', 'https://www.villagefoodie.co.uk/sitemap.xml']

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const given = process.argv.flatMap((a, i, all) => (a === '--sitemap' && all[i + 1] ? [all[i + 1]] : []))
  const sitemaps = given.length ? given : SITEMAPS
  const urls: string[] = []
  for (const s of sitemaps) {
    const r = await fetch(s, { redirect: 'manual' })
    if (r.status !== 200) { console.log(`[indexnow] ${s} answered ${r.status} — skipped`); continue }
    const xml = await r.text()
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
    console.log(`[indexnow] ${s}: ${locs.length} URL(s)`)
    urls.push(...locs)
  }
  const fit: string[] = []
  for (const u of [...new Set(urls)]) {
    let verdict: string | null
    try {
      const r = await fetch(u, { redirect: 'manual' })
      const html = r.status === 200 && (r.headers.get('content-type') ?? '').includes('html') ? await r.text() : null
      verdict = probeVerdict(u, r.status, r.headers.get('x-robots-tag'), html)
    } catch (e) { verdict = `fetch failed: ${e instanceof Error ? e.message : e}` }
    if (verdict) console.log(`[indexnow] left out ${u} — ${verdict}`)
    else fit.push(u)
  }
  console.log(`[indexnow] ${fit.length} of ${urls.length} URL(s) fit to submit${dryRun ? ' (dry run: nothing submitted)' : ''}`)
  if (dryRun || !fit.length) return
  const res = await submitIndexNow(fit, { log: s => console.log(s) })
  // 200 and 202 are accepted; anything else is logged above. A rejection never fails the deploy it follows.
  if (res.some(r => r.status === null || r.status >= 400)) console.log('[indexnow] at least one host was not accepted — see the lines above')
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
