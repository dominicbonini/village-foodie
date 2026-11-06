// lib/root-metadata.ts — cwv-2 (6 November 2026, docs/cwv-2-report.md §3): THE ROOT LAYOUT'S METADATA AND VIEWPORT, for the PUBLIC root
// layouts. app/(app)/layout.tsx keeps its own copy, byte-identical to before (the move commit moved it unchanged); this is the same
// metadata for a host, as a pure function, because the public layouts must not import that module (it brings Geist, the Supabase session
// banner, PostHog at load and every language's script fonts). scripts/cwv-2-local.cjs proves the rendered <head> is the same on every page.
import type { Metadata, Viewport } from 'next'
import { siteMetaFor, siteOpenGraph } from '@/lib/site-metadata'

export function rootMetadataFor(host: string): Metadata {
  const site = siteMetaFor(host)
  const { isHG, siteName, description, baseUrl, shareImage } = site
  return {
    metadataBase: new URL(baseUrl),
    manifest: '/manifest.json',
    title: { default: siteName, template: `%s | ${siteName}` },
    description,
    openGraph: siteOpenGraph(site),
    twitter: { card: 'summary_large_image', title: siteName, description, images: [shareImage.url] },
    icons: isHG
      ? {
          icon: [
            { url: '/favicon.ico?v=3', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
            { url: '/icons/icon-192.png?v=3', sizes: '192x192', type: 'image/png' },
            { url: '/icons/icon-512.png?v=3', sizes: '512x512', type: 'image/png' },
          ],
          apple: '/apple-touch-icon.png?v=3',
        }
      : {
          icon: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🚚%3C/text%3E%3C/svg%3E",
          apple: '/apple-touch-icon.png?v=3',
        },
  }
}

export const ROOT_VIEWPORT: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }
