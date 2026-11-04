// app/docs/[token]/page.tsx — THE ORGANISER'S PAGE (paperwork-1, 4 November 2026, docs/paperwork-1-report.md).
//
// A truck sent its documents to an event organiser from Manage › Paperwork; the email links here. The token IS the access
// (192 random bits, lib/paperwork/share.ts), it EXPIRES and the truck can TURN IT OFF.
// 🔴 ALWAYS THE CURRENT VERSION: a share names document TYPES, so a renewed certificate shows here by itself.
// 🔴 THE ONLY THING RECORDED ABOUT THE ORGANISER: the first time it was opened and how many times (paperwork_share_viewed).
// ⚠️ REGISTRATIONS, LIKE /p/<token>:
//   • `/docs/(.*)` in vercel.json — X-Robots-Tag noindex, nofollow and Cache-Control private, no-store (and `metadata` here);
//   • `/docs/` in proxy.ts's `isGeneralPublic` — a public page that reads the database must be metered;
//   • NOT in the sitemap, /llms.txt or hreflang (none of them lists it; scripts/paperwork-1.cjs asserts that).
// In the TRUCK's language (localeForTruck); `dir="rtl"` only for Arabic.
import { createClient } from '@supabase/supabase-js'
import { resolveOrganiserLink } from '@/lib/paperwork/organiser'
import { translatorFor } from '@/lib/i18n/translator'
import { localeForTruck } from '@/lib/i18n/server-locale'
import { truckTimeSettings } from '@/lib/truck-time'
import { formatLongDate, localDateOfInstant } from '@/lib/time-utils'
import { resolveTruckLogo } from '@/lib/truck-logo'
import '@/lib/i18n/catalog/paperwork'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

export default async function OrganiserPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params
  const token = decodeURIComponent(raw || '')
  const db = admin()
  const link = await resolveOrganiserLink(db, token, true)
  const locale = await localeForTruck({ country: link.truck?.country ?? null })
  const t = translatorFor(locale, 'paperwork')
  const shell = (children: React.ReactNode) => (
    <main lang={locale} dir={locale === 'ar-AE' ? 'rtl' : undefined} className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-xl">{children}</div>
    </main>
  )

  if (link.kind === 'dead') {
    return shell(
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm" data-organiser="expired">
        <h1 className="text-lg font-semibold text-slate-900">{t('page.expiredTitle')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {link.truck ? t('page.expiredBody', { truck: link.truck.name }) : t('page.expiredBodyUnknown')}
        </p>
      </div>,
    )
  }

  const { truck, share, docs, types } = link
  const time = await truckTimeSettings({ timezone: truck.timezone, country: truck.country })
  const logo = await resolveTruckLogo(db, truck.id, truck.logoStoragePath)
  const until = localDateOfInstant(new Date(Date.parse(share.expiresAt) - 1).toISOString(), time.timeZone)
  const base = `/docs/${encodeURIComponent(token)}`
  const dateOf = (d: (typeof docs)[number]) => {
    if (!d.expiresOn) return t('line.noExpiry')
    const label = types.find(x => x.key === d.typeKey)?.dateLabel
    return label === 'review_by' ? t('line.reviewBy', { date: formatLongDate(d.expiresOn, time) }) : t('line.expires', { date: formatLongDate(d.expiresOn, time) })
  }
  return shell(
    <div data-organiser="live">
      <header className="flex items-center gap-4">
        {logo ? <img src={logo} alt="" className="h-14 w-14 rounded-xl border border-slate-200 bg-white object-contain" /> : null}
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('page.title', { truck: truck.name })}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('page.intro', { truck: truck.name })}</p>
        </div>
      </header>
      {docs.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{t('page.none')}</p>
      ) : (
        <>
          <ul className="mt-6 space-y-3">
            {docs.map(d => {
              const name = d.typeKey ? t(`types.${d.typeKey}` as never) : (d.customName ?? '')
              return (
                <li key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-doc={d.id}>
                  <p className="font-semibold text-slate-900">{name}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{[d.issuer, dateOf(d)].filter(Boolean).join(' · ')}</p>
                  <div className="mt-3 flex gap-2">
                    <a href={`${base}/file/${d.id}`} target="_blank" rel="noopener noreferrer"
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">{t('page.view')}</a>
                    <a href={`${base}/file/${d.id}?download=1`}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">{t('page.download')}</a>
                  </div>
                </li>
              )
            })}
          </ul>
          <a href={`${base}/all`} className="mt-5 block rounded-xl bg-orange-500 px-5 py-3 text-center font-bold text-white hover:bg-orange-600">{t('page.downloadAll')}</a>
        </>
      )}
      <p className="mt-5 text-sm text-slate-500">{t('page.until', { date: formatLongDate(until, time) })}</p>
      <p className="mt-8 text-xs text-slate-400">{t('page.sharedWith')}</p>
    </div>,
  )
}
