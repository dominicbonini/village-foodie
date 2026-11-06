// app/[country]/faq/page.tsx — /faq AT ITS COUNTRY ADDRESS: /uk/faq, /de/faq … (faq-4, 2 November 2026).
// 🔴 THE SAME MODULE, NOT A COPY: app/faq/page.tsx reads `params.country` — as app/[country]/features/page.tsx does. A switched-off
// country's address → proxy.ts 302s it to /uk/faq; a country whose FAQ shows nothing → 404 (app/faq/page.tsx).
import { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'

export { default, generateMetadata } from '../../(site)/faq/page'

export const dynamic = 'force-dynamic'
export const dynamicParams = false
export function generateStaticParams() {
  return Object.values(COUNTRY_PATH_SEGMENTS).map(country => ({ country }))
}
