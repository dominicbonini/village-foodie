// lib/i18n/app-config.d.ts — typed keys (Language Phase 0). messages/en-GB.json is the shape every translator is
// checked against: a key that is not in it is a COMPILE ERROR (proved by lib/i18n/typecheck.ts).
import type enGB from '@/messages/en-GB.json'
import type { AppLocale } from './locales'

declare module 'next-intl' {
  interface AppConfig {
    Locale: AppLocale
    Messages: typeof enGB
  }
}
