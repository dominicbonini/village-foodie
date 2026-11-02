// lib/indexnow.ts — 🔴 IndexNow: telling Bing (and through it ChatGPT search and Copilot) which of our pages changed
// (faq-2-seo-geo-2 B6, 2 November 2026; docs/faq-2-seo-geo-2-report.md).
//
// THE KEY is public by design: IndexNow proves we own a host by fetching https://<host>/<key>.txt, which must contain the key —
// public/07509b28087e749402ef79858216bd5a.txt, served at the root of both hosts.
// WHO SUBMITS:
//   • after every production deploy — .github/workflows/indexnow.yml (on push to main, it waits for the Vercel deployment),
//     every URL in both sitemaps (scripts/indexnow/main.ts);
//   • after an Admin › FAQ change to published content — app/api/admin/faq/route.ts, the FAQ pages that have content (faq-4);
//   • after a translation run that wrote rows — scripts/faq-translate/main.ts, the FAQ pages in those languages (faq-4).
// ⛔ NEVER A NOINDEX OR REDIRECTING URL: the deploy run probes every URL first (probeVerdict) and drops any that does not answer
// 200 itself, says noindex (header or meta) or names another canonical. The FAQ and translation submissions name only switched-on
// countries' FAQ pages that have content (faq-4), which are 200, self-canonical and indexable by construction.
// Every response is logged. A failed submission never fails the thing that asked for it.
import { HATCHGRAB_ORIGIN, countryPagePath } from '@/lib/marketing-country'
import { overrideChain, type AppLocale } from '@/lib/i18n/locales'

export const INDEXNOW_KEY = '07509b28087e749402ef79858216bd5a'
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

/** One request body per host (IndexNow takes up to 10,000 URLs of ONE host per request). */
export function indexNowPayloads(urls: string[]): { host: string; key: string; keyLocation: string; urlList: string[] }[] {
  const byHost = new Map<string, Set<string>>()
  for (const u of urls) {
    let host: string
    try { const p = new URL(u); if (p.protocol !== 'https:') continue; host = p.host } catch { continue }
    byHost.set(host, (byHost.get(host) ?? new Set()).add(u))
  }
  return [...byHost].map(([host, set]) => ({ host, key: INDEXNOW_KEY, keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`, urlList: [...set].slice(0, 10000) }))
}

export interface SubmitResult { host: string; count: number; status: number | null; body: string }

/** Submit the URLs; one POST per host. Never throws: a network failure is a result with status null. */
export async function submitIndexNow(urls: string[], opts: { fetchImpl?: typeof fetch; log?: (s: string) => void } = {}): Promise<SubmitResult[]> {
  const f = opts.fetchImpl ?? fetch
  const out: SubmitResult[] = []
  for (const p of indexNowPayloads(urls)) {
    let status: number | null = null, body = ''
    try {
      const r = await f(INDEXNOW_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(p) })
      status = r.status
      body = (await r.text()).slice(0, 300)
    } catch (e) { body = e instanceof Error ? e.message : String(e) }
    out.push({ host: p.host, count: p.urlList.length, status, body })
    opts.log?.(`[indexnow] ${p.host}: ${p.urlList.length} URL(s) → ${status ?? 'network error'}${body ? ` ${body}` : ''}`)
  }
  return out
}

/** Is this URL fit to submit? It must answer 200 itself (no redirect), say no noindex in its X-Robots-Tag or robots meta, and name
 *  no other canonical. Returns null when fit, else why not. Pure: the caller fetched it (with redirects not followed). */
export function probeVerdict(url: string, status: number, xRobots: string | null, html: string | null): string | null {
  if (status !== 200) return `answers ${status}`
  if (xRobots && /noindex/i.test(xRobots)) return `X-Robots-Tag: ${xRobots}`
  if (html) {
    const meta = /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ?? /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']robots["']/i.exec(html)?.[1]
    if (meta && /noindex/i.test(meta)) return `robots meta: ${meta}`
    const canon = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i.exec(html)?.[1]
    if (canon && canon !== url) return `canonical is ${canon}`
  }
  return null
}

/** The FAQ pages (faq-4: the FAQ is its own page, /<country>/faq — no longer the landing page's) of the switched-on countries whose
 *  page language reads any of `locales` (a translation in de-DE changes the German, Austrian, Swiss and Liechtenstein pages: their
 *  locale chain includes de-DE). `locales: 'all'` → every one. The caller passes only countries whose FAQ page has content (a 404 is
 *  never submitted). */
export function faqUrlsFor(countries: { countryCode: string; locale: string; enabled: boolean }[], locales: string[] | 'all'): string[] {
  const out: string[] = []
  for (const c of countries) {
    if (!c.enabled) continue
    const path = countryPagePath(c.countryCode, 'faq')
    if (!path) continue
    const chain = [...overrideChain(c.locale as AppLocale), c.locale]
    if (locales === 'all' || locales.some(l => chain.includes(l))) out.push(HATCHGRAB_ORIGIN + path)
  }
  return [...new Set(out)]
}
