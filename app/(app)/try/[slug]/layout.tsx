// app/try/[slug]/layout.tsx — demo-2 (30 October 2026, docs/demo-2-report.md): the demo walkthrough's layout.
// Only the walkthrough's message namespaces go to the browser (lib/i18n/namespaces.ts `walkthrough`); the page switches
// to the demo truck's language once it knows it, as the order page does. The page is never indexed.
import type { Metadata } from 'next'
import { I18nProvider } from '@/lib/i18n/client'
import { NAMESPACES } from '@/lib/i18n/namespaces'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'HatchGrab demo', robots: { index: false, follow: false } }

export default function WalkthroughLayout({ children }: { children: React.ReactNode }) {
  return <I18nProvider namespaces={NAMESPACES.walkthrough}>{children}</I18nProvider>
}
