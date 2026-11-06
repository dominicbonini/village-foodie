// The confirmation and status pages' language (Language Phase 0, docs/language-phase-0-report.md §1): the
// truck's language — its country's locale, from the order's own settings once loaded (useTruckLocale).
import type { ReactNode } from 'react'
import { I18nProvider } from '@/lib/i18n/client'
import { NAMESPACES } from '@/lib/i18n/namespaces'

export default function OrderStatusLayout({ children }: { children: ReactNode }) {
  return <I18nProvider namespaces={NAMESPACES.confirmation}>{children}</I18nProvider>
}
