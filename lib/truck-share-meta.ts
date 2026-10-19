// lib/truck-share-meta.ts — a truck page's link preview ON THE HATCHGRAB HOST (US polish batch, 19 October 2026;
// docs/us-polish-batch-report.md). Server-only: it reads the database.
//
// 🔴 FROM THE TRUCK ITSELF, NEVER THE GOOGLE SHEET. /trucks/[slug] used to take its preview name and logo from the
// Village Foodie Google Sheets CSV on EVERY host, branded "Village Foodie", with an og:url on villagefoodie.co.uk — so a
// HatchGrab truck's link previewed as the other brand, and a signed-up truck (not in the sheet) as "Food Truck | Village
// Foodie". On HatchGrab the preview now comes from:
//   • the truck's own HatchGrab row (trucks.slug) when it is public there (or, for the ORDER page, when it trades:
//     active and not excluded — the order page itself serves such a truck);
//   • else the discovery row the page itself draws (discovery_trucks, public on HatchGrab, its name slugging to the URL);
//   • else nothing truck-specific: a generic HatchGrab title, everything else inherited from the root layout.
// Image: the truck's own cover, else its logo, else HatchGrab's default share card (the root layout's file). Words: the
// truck's language (its country's locale). Brand: HatchGrab. URL: the page's own www.hatchgrab.com address.
// ⚠️ THE VILLAGE FOODIE HOST NEVER CALLS THIS — its preview is the page's original code, byte for byte.
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { createSlug } from '@/lib/utils'
import { formatImageUrl } from '@/lib/image-utils'
import { HATCHGRAB_ORIGIN } from '@/lib/marketing-country'
import { localeForTruck } from '@/lib/i18n/server-locale'
import { translatorFor } from '@/lib/i18n/translator'
import { isPublicOnHatchGrab, type OperatorTruckRow } from '@/lib/truck-header'
import '@/lib/i18n/catalog/truckPage'

/** The root layout's HatchGrab share card (app/layout.tsx), measured 1200×630. */
export const HATCHGRAB_SHARE_CARD = { url: `${HATCHGRAB_ORIGIN}/logos/hatchgrab-share-card.png`, width: 1200, height: 630 }
const SITE_NAME = 'HatchGrab'

type TruckRow = OperatorTruckRow & { country?: string | null; cover_image_path?: string | null }
interface Source { name: string; country: string | null; cover: string | null; logo: string | null }

const storageUrl = (path: string | null | undefined) => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  return path && base ? `${base}/storage/v1/object/public/truck-media/${path}` : null
}
/** A discovery image (formatImageUrl's "/logos/…" form, or a full URL) as an absolute HatchGrab URL. */
const absolute = (u: string | null | undefined) => (!u ? null : /^https?:\/\//i.test(u) ? u : `${HATCHGRAB_ORIGIN}${u.startsWith('/') ? '' : '/'}${u}`)

async function readTruck(slug: string): Promise<TruckRow | null> {
  try {
    const { data } = await supabase.from('trucks')
      .select('name, slug, country, logo_storage_path, cover_image_path, active, excluded, show_on_hg')
      .eq('slug', slug).maybeSingle()
    return (data as TruckRow | null) ?? null
  } catch {
    return null
  }
}

async function readDiscovery(slug: string): Promise<Source | null> {
  try {
    const { data } = await supabase.from('discovery_trucks').select('name, logo_url, photo_url, excluded, country').eq('show_on_hg', true)
    const row = (data as { name: string; logo_url: string | null; photo_url: string | null; excluded: boolean | null; country: string | null }[] | null)
      ?.find(r => !r.excluded && createSlug(r.name) === slug)
    if (!row) return null
    const logo = formatImageUrl(row.logo_url || null, 'logos'), photo = formatImageUrl(row.photo_url || null, 'photos')
    return { name: row.name, country: row.country ?? null, cover: absolute(photo), logo: absolute(logo) }
  } catch {
    return null
  }
}

/** Where a page's preview comes from, or null when the truck is not one HatchGrab shows. */
export async function shareSourceFor(slug: string, kind: 'page' | 'order'): Promise<Source | null> {
  const truck = await readTruck(slug)
  const trades = !!truck && truck.active === true && truck.excluded !== true
  if (truck?.name && (kind === 'order' ? trades : isPublicOnHatchGrab(truck))) {
    return { name: truck.name, country: truck.country ?? null, cover: storageUrl(truck.cover_image_path), logo: storageUrl(truck.logo_storage_path) }
  }
  return kind === 'page' ? readDiscovery(slug) : null
}

/** The HatchGrab preview of /trucks/<slug> (kind 'page') or /trucks/<slug>/order (kind 'order'). */
export async function hatchGrabTruckMetadata(slug: string, kind: 'page' | 'order'): Promise<Metadata> {
  const src = await shareSourceFor(slug, kind)
  const locale = await localeForTruck({ country: src?.country ?? null })
  const t = translatorFor(locale, 'truckPage')
  if (!src) return { title: t('meta.hgFallbackTitle') }   // the root layout's HatchGrab card, url and words stand
  const truck = src.name
  const title = kind === 'order' ? t('meta.orderTitle', { truck }) : truck
  const ogTitle = kind === 'order' ? t('meta.orderTitle', { truck }) : t('shareTitle', { truck })
  const description = kind === 'order' ? t('meta.orderDescription', { truck }) : t('shareText', { truck })
  const own = src.cover ?? src.logo
  const image = own ? { url: own, alt: t('meta.logoAlt', { truck }) } : { ...HATCHGRAB_SHARE_CARD, alt: t('meta.logoAlt', { truck }) }
  const url = `${HATCHGRAB_ORIGIN}/trucks/${slug}${kind === 'order' ? '/order' : ''}`
  return {
    title,
    description,
    openGraph: { title: ogTitle, description, url, siteName: SITE_NAME, images: [image], locale: locale.replace('-', '_'), type: 'website' },
    // A logo is square: the small card shows it whole. A cover or the HatchGrab card is wide: the large card.
    twitter: { card: !src.cover && src.logo ? 'summary' : 'summary_large_image', title: ogTitle, description, images: [image.url] },
  }
}
