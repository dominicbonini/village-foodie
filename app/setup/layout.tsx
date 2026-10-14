// The setup wizard's language (Language Phase 0, docs/language-phase-0-report.md §1): the chosen country's
// locale (useTruckLocale in the wizard), en-GB until a country is chosen.
import type { ReactNode } from 'react'
import { I18nProvider } from '@/lib/i18n/client'
import { NAMESPACES } from '@/lib/i18n/namespaces'

export default function SetupLayout({ children }: { children: ReactNode }) {
  return <I18nProvider namespaces={NAMESPACES.setup}>{children}</I18nProvider>
}
