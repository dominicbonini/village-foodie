// lib/site-metadata.ts — 🔴 THE SITE-WIDE <head> DEFAULTS, PER HOST, IN ONE PLACE (seo-fixes S1 + N6, 20 October 2026;
// docs/seo-fixes-report.md).
//
// app/layout.tsx's generateMetadata built these inline. They moved here so a page that needs its OWN canonical and
// og:url (the legal, contact, signup and login pages — S1) can set them without rebuilding the share card: Next REPLACES
// a parent's `openGraph` wholesale when a segment sets one, so the page spreads `siteOpenGraph(host)` and changes `url`
// alone — every other og field stays exactly what the root layout gives every other page.
// 🔴 N6: the Village Foodie host's base URL is its WWW host (BRANDS.VILLAGE_FOODIE.domain) — the host its sitemap has
// always listed — so og:url and the sitemap agree. It was the apex.
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { BRANDS } from '@/lib/brand'
import { HATCHGRAB_ORIGIN } from '@/lib/marketing-country'

export interface SiteMeta {
  isHG: boolean
  siteName: string
  description: string
  baseUrl: string
  shareImage: { url: string; width: number; height: number }
}

export function siteMetaFor(host: string): SiteMeta {
  const isHG = host.includes('hatchgrab')
  return {
    isHG,
    siteName: isHG ? BRANDS.HATCHGRAB.name : BRANDS.VILLAGE_FOODIE.name,
    description: isHG
      ? 'The food truck management platform'
      : 'Find local food trucks and pop-ups visiting villages near you.',
    baseUrl: isHG ? HATCHGRAB_ORIGIN : `https://${BRANDS.VILLAGE_FOODIE.domain}`,
    shareImage: isHG
      ? { url: `https://${host}/logos/hatchgrab-share-card.png`, width: 1200, height: 630 }
      : { url: '/logos/village-foodie logo-sharing.png', width: 1200, height: 630 },
  }
}

/** The root layout's Open Graph block for a host (its `url` is the site root). */
export function siteOpenGraph(m: SiteMeta): NonNullable<Metadata['openGraph']> {
  return {
    title: m.siteName,
    description: m.description,
    url: m.baseUrl,
    siteName: m.siteName,
    images: [{ url: m.shareImage.url, width: m.shareImage.width, height: m.shareImage.height, alt: `${m.siteName} Logo` }],
    locale: 'en_GB',
    type: 'website',
  }
}

/**
 * S1: a HatchGrab page's canonical and og:url — `https://www.hatchgrab.com<path>` on EVERY host (the Village Foodie
 * host serves the same document; the canonical names the HatchGrab copy). The rest of the og block is the host's default.
 */
export async function ownUrlMetadata(path: string): Promise<Pick<Metadata, 'alternates' | 'openGraph'>> {
  const host = (await headers()).get('host') ?? ''
  const url = HATCHGRAB_ORIGIN + path
  return { alternates: { canonical: url }, openGraph: { ...siteOpenGraph(siteMetaFor(host)), url } }
}

/**
 * pricing-tidy (20 October 2026, decision 2 of docs/seo-fixes-report.md): a page that is the SERVING HOST's own — canonical
 * and og:url on that host's base URL (Village Foodie: https://www.villagefoodie.co.uk<path>). Used for /contact on the
 * Village Foodie host, which is a different, VF-branded page and so names itself.
 */
export async function hostUrlMetadata(path: string): Promise<Pick<Metadata, 'alternates' | 'openGraph'>> {
  const host = (await headers()).get('host') ?? ''
  const site = siteMetaFor(host)
  const url = site.baseUrl + path
  return { alternates: { canonical: url }, openGraph: { ...siteOpenGraph(site), url } }
}
