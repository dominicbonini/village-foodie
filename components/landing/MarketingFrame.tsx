// components/landing/MarketingFrame.tsx — 🔴 THE MARKETING SUB-PAGES' FRAME, ONE DEFINITION (faq-4, 2 November 2026;
// docs/faq-4-report.md). EXTRACTED FROM app/features/page.tsx — moved, not rewritten — so /<country>/features and /<country>/faq share
// the same page frame: the visitor's language boundary, the demo modal, the `.hg-landing` chrome with its fonts, the nav, the footer.
// /features renders byte-identically through it (scripts/faq-4.cjs).
//
// ⚠️ `landingHref` IS NOT OPTIONAL ON A CHILD ROUTE: the nav's logo and its Pricing link are bare fragments by default (`#pricing`),
// which on a sub-page would do nothing — so the nav gets the country's landing address (LandingNav.tsx's table).
// The footer gets the country's comparison column, its app flags (store-badges-1) and, only where the country's FAQ page has a
// question to show, the FAQ link (faq-4, lib/faq/public.ts faqHrefFor).
import type { ReactNode } from 'react'
import { Archivo, Public_Sans, Courier_Prime } from 'next/font/google'
import { LandingNav } from '@/components/landing/LandingNav'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { DemoModalProvider, DemoModal } from '@/components/landing/DemoUpload'   // client children — the chrome's CTA
import { PageLocale } from '@/lib/i18n/page-locale'
import { pageSeedProps } from '@/lib/i18n/page-words'
import { localeOfCountry } from '@/lib/i18n/locales'
import { comparisonFooter } from '@/lib/comparison-server'
import { appsOf } from '@/lib/comparison-flags'
import { faqHrefFor } from '@/lib/faq/public'
import type { VisitorCountry } from '@/lib/visitor-country'

// Self-hosted, non-render-blocking — as the landing page. seo-fixes S7: --ticket is declared but not preloaded.
const archivo = Archivo({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-archivo', display: 'swap' })
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
const courierPrime = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-courier-prime', display: 'swap', preload: false })
const CHROME = `hg-landing ${archivo.variable} ${publicSans.variable} ${courierPrime.variable}`

export async function MarketingFrame({ visitor, children }: { visitor: VisitorCountry; children: ReactNode }) {
  const settings = visitor.settings
  return (
    <PageLocale locale={localeOfCountry(settings)} {...pageSeedProps(settings.locale, 'marketing')}>
    <DemoModalProvider>
      <div className={CHROME}>
        <LandingNav landingHref={visitor.paths.landing} featuresHref={visitor.paths.features} locale={settings.locale} />
        {children}
        <LandingFooter landingHref={visitor.paths.landing} featuresHref={visitor.paths.features} country={visitor.menu} locale={settings.locale} comparison={await comparisonFooter(settings.countryCode, settings.locale)}
          apps={await appsOf(settings.countryCode)} faqHref={await faqHrefFor(settings)} />
      </div>
      {/* Mounted ONCE — the nav's CTA drives this one instance. It portals to document.body, so it is deliberately OUTSIDE
          `.hg-landing` and brings its own tokens via `hg-demo-modal`. */}
      <DemoModal />
    </DemoModalProvider>
    </PageLocale>
  )
}
