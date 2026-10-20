// app/login/layout.tsx — the /login page's <head> (the page itself is a client component, which cannot export metadata).
// 🔴 seo-fixes S2 + S1 (20 October 2026, docs/seo-fixes-report.md): NOINDEX (Dominic's decision; links are still
// followed), and its canonical and og:url are its HatchGrab www address on every host. ⛔ NO TITLE OR DESCRIPTION HERE —
// they stay the root layout's, unchanged.
import type { Metadata } from 'next'
import { ownUrlMetadata } from '@/lib/site-metadata'

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: true }, ...(await ownUrlMetadata('/login')) }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
