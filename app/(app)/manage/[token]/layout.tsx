// Manage's language (Language Phase 0, docs/language-phase-0-report.md §1): the truck's country's locale, set by
// the page once its settings load (useTruckLocale), with only Manage's message namespaces sent to the browser.
import type { ReactNode } from 'react'
import { I18nProvider } from '@/lib/i18n/client'
import { NAMESPACES } from '@/lib/i18n/namespaces'

export default function ManageLayout({ children }: { children: ReactNode }) {
  return <I18nProvider namespaces={NAMESPACES.manage}>{children}</I18nProvider>
}
