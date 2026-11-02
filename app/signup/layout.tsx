// app/signup/layout.tsx — the /signup page's <head> (the page itself is a client component, which cannot export metadata).
// 🔴 seo-fixes S2 + S1 (20 October 2026, docs/seo-fixes-report.md): NOINDEX (Dominic's decision; links are still
// followed), and its canonical and og:url are its HatchGrab www address on every host. ⛔ NO TITLE OR DESCRIPTION HERE —
// they stay the root layout's, unchanged.
import type { Metadata } from 'next'
import { ownUrlMetadata } from '@/lib/site-metadata'
import { AuthLocale } from '@/lib/i18n/auth-locale'
import { TrialMonthsProvider } from '@/lib/trial-months'
import { getPlanCatalog } from '@/lib/plans-server'
import { offerTrialMonths } from '@/lib/plan-offer'

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: true }, ...(await ownUrlMetadata('/signup')) }
}

// legal-languages-1 (1 November 2026): in the visitor's language (lib/i18n/auth-locale.tsx); an English visitor's page is as before.
// copy-truth-1 (2 November 2026): the trial's length (plans.trial_months) for the page's subtitle, read here on the server; a failed
// read names no length rather than failing the page.
export default async function Layout({ children }: { children: React.ReactNode }) {
  let months: number | null = null
  try { months = offerTrialMonths(await getPlanCatalog()) } catch { months = null }
  return <AuthLocale><TrialMonthsProvider months={months}>{children}</TrialMonthsProvider></AuthLocale>
}
