// components/landing/MarketingFrame.tsx — 🔴 THE ONE HEADER AND FOOTER FOR EVERY PUBLIC HATCHGRAB PAGE (faq-4, 2 November 2026,
// extracted from app/features/page.tsx; site-chrome-1, 5 November 2026, made the one wrapper for all of them — manual 35.ao-13).
// Every public HatchGrab page renders the landing's own nav (components/landing/LandingNav.tsx: logo → home, Upload menu, Log in) and
// footer (components/landing/LandingFooter.tsx) THROUGH THIS FILE, never its own copy: the landing, /features, /faq, /about, /compare,
// the comparison pages, /contact and the legal pages. It owns the visitor's language boundary, the demo modal, the `.hg-landing`
// chrome with its fonts and stylesheet, the nav and the footer.
//
// THREE SHAPES, because three pages have reasons of their own (each was byte-identical to its old inline frame when moved here):
//   • 'page' (default) — the content INSIDE `.hg-landing`: /features, /faq, /about, the comparison pages, /contact.
//   • 'landing' — the landing itself: `hg-hero-watch` (its header-CTA reveal), the nav's `ctaFirst` order, bare `#pricing` anchors
//     (no `landingHref`) and the demo modal inside the chrome.
//   • 'split' — the content OUTSIDE `.hg-landing`, between the nav and the footer: /compare (its calculator) and the legal pages
//     (prose). The sheet's `.hg-landing * { margin: 0; padding: 0 }` reset would flatten them; `chrome-nav-only` keeps the nav sticky.
//
// ⚠️ `landingHref` IS NOT OPTIONAL ON A CHILD ROUTE: the nav's logo and its Pricing link are bare fragments by default (`#pricing`),
// which on a sub-page would do nothing — so the nav gets the country's landing address (LandingNav.tsx's table).
// The footer gets the country's comparison column, its app flags (store-badges-1) and, only where the country's FAQ page has a
// question to show, the FAQ link (faq-4, lib/faq/public.ts faqHrefFor).
// ⛔ NOT for the focused flows (signup, login, password, verify, setup, the demo: a logo-only header that links home, no footer), and
// not for Manage, the dashboard, Admin, the KDS, ordering pages, embeds, custom domains or Village Foodie — nor for the legal pages
// INSIDE THE NATIVE APP, which keep their logo-only, link-free header (App Review 2.1 / 3.1.1; app/(legal)/layout.tsx).
import { createElement, type ReactNode } from 'react'
import { Archivo, Public_Sans, Courier_Prime } from 'next/font/google'
import { LandingNav } from '@/components/landing/LandingNav'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { DemoModalProvider, DemoModal } from '@/components/landing/DemoUpload'   // client children — the chrome's CTA
import { PageLocale } from '@/lib/i18n/page-locale'
import { pageSeedProps } from '@/lib/i18n/page-words'
import { localeOfCountry, type AppLocale } from '@/lib/i18n/locales'
import { comparisonFooter } from '@/lib/comparison-server'
import { appsOf } from '@/lib/comparison-flags'
import { faqHrefFor } from '@/lib/faq/public'
import type { VisitorCountry } from '@/lib/visitor-country'
import '@/app/landing/landing.css'

// Self-hosted, non-render-blocking — as the landing page. seo-fixes S7: --ticket is declared but not preloaded.
// cwv-1 (5 November 2026): Archivo's ITALIC is its own instance, declared but NOT preloaded. Only below-the-fold text uses it (the
// testimonial, its quote mark, the "how it works" numbers — landing.css), and its 38 KB preload competed with the first screen's CSS
// and upright fonts on a phone. Both instances declare the same family, "Archivo", so `var(--display)` with `font-style: italic` still
// draws Archivo Italic: the same file, the same pixels once it has loaded. No `variable` and no fallback face of its own — the upright
// instance's `--font-archivo` ("Archivo", "Archivo Fallback") is unchanged. next/font needs every call assigned to a module const; the
// italic's is never read (its @font-face is the whole point), hence the lint line.
const archivo = Archivo({ subsets: ['latin'], style: ['normal'], variable: '--font-archivo', display: 'swap' })
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const archivoItalic = Archivo({ subsets: ['latin'], style: ['italic'], display: 'swap', preload: false, adjustFontFallback: false })
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
const courierPrime = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-courier-prime', display: 'swap', preload: false })
const CHROME = `hg-landing ${archivo.variable} ${publicSans.variable} ${courierPrime.variable}`

export async function MarketingFrame({ visitor, children, variant = 'page', locale, after }: {
  visitor: VisitorCountry
  children: ReactNode
  variant?: 'page' | 'landing' | 'split'
  /** The chrome's language when it is not the country's: the English legal documents (en-GB, the language they are written in). */
  locale?: AppLocale
  /** Rendered after the demo modal's provider, inside the language boundary — a page's own JSON-LD that sat there. */
  after?: ReactNode
}) {
  const settings = visitor.settings
  const words = locale ?? settings.locale
  const comparison = await comparisonFooter(settings.countryCode, words)
  const apps = await appsOf(settings.countryCode)
  const faqHref = await faqHrefFor(settings)
  const landing = variant === 'landing'
  // The landing's own anchors are bare (`#pricing`); every other page links back to the country's landing.
  const landingHref = landing ? undefined : visitor.paths.landing
  const nav = <LandingNav {...(landing ? { ctaFirst: true } : { landingHref })} featuresHref={visitor.paths.features} locale={words} />
  const footer = (
    <LandingFooter {...(landing ? {} : { landingHref })} featuresHref={visitor.paths.features} country={visitor.menu} locale={words} comparison={comparison}
      apps={apps} faqHref={faqHref} />
  )
  // 🔴 THE ELEMENT TREE IS EXACTLY THE SHAPE EACH PAGE HAD INLINE, because React's generated ids (the country menu's
  // `aria-controls`, useId) follow the tree's shape: the page's own elements are spread in AS SIBLINGS of the nav and footer (never a
  // nested array), and `after` is a second child of the language boundary only when a page has one. Changing either renumbers the ids
  // of every page (scripts/site-chrome-1.cjs compares every page with the commit before).
  // The page's children AS GIVEN — including its `false` / `null` slots (the landing's `{showTestimonial && …}`): those count as
  // positions too, so they are spread in untouched (React.Children.toArray would drop them and renumber every country but GB).
  const content: ReactNode[] = Array.isArray(children) ? children : [children]
  const modal = <DemoModal />
  const body = landing
    // 🔴 `hg-hero-watch` IS THE LANDING-ONLY SCOPE FOR THE HEADER-CTA REVEAL, rendered on the server so the button is hidden in the
    // first paint (app/landing/page.tsx). The modal sits inside the chrome here, as it always has on the landing.
    ? createElement('div', { className: CHROME.replace('hg-landing ', 'hg-landing hg-hero-watch ') }, nav, ...content, footer, modal)
    : variant === 'split'
      // 🔴 `chrome-nav-only` (display: contents) IS WHAT KEEPS THE NAV STICKY: a sticky element only travels inside its parent's
      // box, and this wrapper generates none (landing.css; app/compare/page.tsx's note). The modal is mounted ONCE, outside
      // `.hg-landing`: it portals to document.body and brings its own tokens via `hg-demo-modal`.
      ? [<div key="n" className={`${CHROME} chrome-nav-only`}>{nav}</div>, ...content, <div key="f" className={CHROME}>{footer}</div>, modal]
      // Mounted ONCE — the nav's CTA drives this one instance, OUTSIDE `.hg-landing` (it portals to document.body).
      : [createElement('div', { key: 'c', className: CHROME }, nav, ...content, footer), modal]
  const provider = createElement(DemoModalProvider, null, ...(Array.isArray(body) ? body : [body]))
  const lang = { locale: locale ?? localeOfCountry(settings), ...pageSeedProps(words, 'marketing') }
  return after === undefined ? <PageLocale {...lang}>{provider}</PageLocale> : <PageLocale {...lang}>{provider}{after}</PageLocale>
}
