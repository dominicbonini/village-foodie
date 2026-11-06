// app/reset-password/layout.tsx — legal-languages-1 (1 November 2026): the page in the language its email link asked for (?lang=), else
// the visitor's country's (lib/i18n/auth-locale.tsx). An English visitor's page is exactly as before (no wrapper).
import { AuthLocale } from '@/lib/i18n/auth-locale'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthLocale>{children}</AuthLocale>
}
