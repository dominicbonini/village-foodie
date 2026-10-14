import { I18nProvider } from '@/lib/i18n/client'
import { NAMESPACES } from '@/lib/i18n/namespaces'

export default function VanKdsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen h-screen overflow-hidden m-0 p-0">
      {/* Language Phase 0: the KDS's provider — the truck's country's locale, KDS namespaces only. */}
      <I18nProvider namespaces={NAMESPACES.kds}>{children}</I18nProvider>
    </div>
  )
}
