// app/(public)/(site)/layout.tsx — cwv-2 (6 November 2026, docs/cwv-2-report.md §3): THE ROOT LAYOUT OF THE PUBLIC PAGES WITHOUT A COUNTRY
// IN THEIR ADDRESS — /about, and the router addresses (/landing, /features, /faq, /compare) and the unlisted landing preview.
// Lean (components/public/PublicDocument.tsx), and request-aware exactly like the app's root layout: these pages are rendered per request
// (they read the visitor's country), so the layout reads the same three things the app's does — the host (brand and metadata) and the
// page language proxy.ts sets (x-hg-page-lang).
import { headers } from 'next/headers'
import { PAGE_LANG_HEADER, htmlLangOf } from '@/lib/page-lang'
import { rootMetadataFor, ROOT_VIEWPORT } from '@/lib/root-metadata'
import { PublicDocument } from '@/components/public/PublicDocument'

export async function generateMetadata() {
  return rootMetadataFor((await headers()).get('host') || '')
}
export const viewport = ROOT_VIEWPORT

export default async function SiteRootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers()
  const host = h.get('host') ?? undefined
  return (
    <PublicDocument lang={htmlLangOf(h.get(PAGE_LANG_HEADER))} brand={host?.includes('hatchgrab') ? 'hatchgrab' : 'villagefoodie'}>
      {children}
    </PublicDocument>
  )
}
