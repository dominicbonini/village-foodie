import { I18nProvider } from '@/lib/i18n/client'
import { NAMESPACES } from '@/lib/i18n/namespaces'

export default function KdsLayout({ children }: { children: React.ReactNode }) {
  return (
    // h-dvh, NOT h-screen. This was the one surface still on h-screen while every other operator page
    // uses h-dvh (the app-shell pattern S35 insists on). In the Capacitor shell the two agree - there is
    // no collapsing browser chrome - so this changes nothing on the iPad. It matters in MOBILE SAFARI,
    // where h-screen (100vh) is the LARGEST viewport, taller than what is actually visible while the
    // address bar is showing: the bottom of the board sat under the browser chrome and the shell's
    // overflow-hidden meant it could not be scrolled to. h-dvh tracks the real height.
    // The inner page keeps w-full h-full and fills this box, so nothing below needed to change.
    <div className="w-screen h-dvh overflow-hidden m-0 p-0">
      {/* Language Phase 0: the KDS's own provider — the truck's country's locale, KDS namespaces only. */}
      <I18nProvider namespaces={NAMESPACES.kds}>{children}</I18nProvider>
    </div>
  )
}
