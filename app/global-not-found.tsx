// cwv-2 (6 November 2026, docs/cwv-2-report.md §4): THE 404 FOR AN ADDRESS THAT MATCHES NO ROUTE (and every address proxy.ts sends here: a
// country address off HatchGrab, an address that is no country). With two root layouts there is no app/layout.tsx, so Next would answer
// such an address with its own bare page; `experimental.globalNotFound` (next.config.ts) makes it render this file instead.
// It is TODAY'S page: the app's root layout's document (html lang / dir / data-brand from the request, its stylesheet, PostHog and the
// session banner) around the app's not-found card (app/(app)/not-found.tsx, unchanged), on either host — with ONE difference, and it is
// deliberate: no fonts at all. Next attaches this file's font CSS chunk's preloads to EVERY route, so importing app/(app)/layout.tsx (or
// lib/script-fonts.ts, whose rules share Geist's chunk) here made every public page preload Geist again. No font of either draws a glyph
// on this card (it uses the system font, as on the public pages), so the page looks the same: scripts/cwv-2-proof compares it on both hosts.
import { headers } from 'next/headers'
import './(app)/globals.css'
import { CSPostHogProvider } from './(app)/providers'
import NotFound from './(app)/not-found'
import { SessionAlertBanner } from '@/components/auth/SessionAlertBanner'
import { isRtlLang } from '@/lib/public-script'
import { PAGE_LANG_HEADER, htmlLangOf } from '@/lib/page-lang'
import { rootMetadataFor, ROOT_VIEWPORT } from '@/lib/root-metadata'

export async function generateMetadata() {
  return rootMetadataFor((await headers()).get('host') || '')
}
export const viewport = ROOT_VIEWPORT

export default async function GlobalNotFound() {
  const requestHeaders = await headers()
  const host = requestHeaders.get('host') ?? undefined
  const lang = htmlLangOf(requestHeaders.get(PAGE_LANG_HEADER))
  const brand = host?.includes('hatchgrab') ? 'hatchgrab' : 'villagefoodie'
  return (
    <html lang={lang} data-brand={brand} {...(isRtlLang(lang) ? { dir: 'rtl' } : {})}>
      <body className="antialiased">
        <CSPostHogProvider host={host}>
          <NotFound />
          <SessionAlertBanner />
        </CSPostHogProvider>
      </body>
    </html>
  )
}
