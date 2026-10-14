// The dashboard's language (Language Phase 0, docs/language-phase-0-report.md §1): the truck's country's locale,
// set by the page once the truck loads (useTruckLocale). The KDS below it has its own provider and namespaces.
import type { ReactNode } from 'react'
import { I18nProvider } from '@/lib/i18n/client'
import { NAMESPACES } from '@/lib/i18n/namespaces'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <I18nProvider namespaces={NAMESPACES.dashboard}>{children}</I18nProvider>
}
