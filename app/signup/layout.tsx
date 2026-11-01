// app/signup/layout.tsx — the /signup page's <head> (the page itself is a client component, which cannot export metadata).
// 🔴 seo-fixes S2 + S1 (20 October 2026, docs/seo-fixes-report.md): NOINDEX (Dominic's decision; links are still
// followed), and its canonical and og:url are its HatchGrab www address on every host. ⛔ NO TITLE OR DESCRIPTION HERE —
// they stay the root layout's, unchanged.
import type { Metadata } from 'next'
import { ownUrlMetadata } from '@/lib/site-metadata'
import { AuthLocale } from '@/lib/i18n/auth-locale'

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: true }, ...(await ownUrlMetadata('/signup')) }
}

// legal-languages-1 (1 November 2026): in the visitor's language (lib/i18n/auth-locale.tsx); an English visitor's page is as before.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthLocale>{children}</AuthLocale>
}
