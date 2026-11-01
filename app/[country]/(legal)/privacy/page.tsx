// app/[country]/(legal)/privacy/page.tsx — legal-languages-1 (1 November 2026): the 'privacy' document in the country's language
// (components/legal/translated-legal.tsx). The English, governing, page is app/(legal)/privacy.
import { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'
import { legalPage, legalMetadata } from '@/components/legal/translated-legal'

export const dynamic = 'force-dynamic'
export const dynamicParams = false
export function generateStaticParams() {
  return Object.values(COUNTRY_PATH_SEGMENTS).map(country => ({ country }))
}
export const generateMetadata = legalMetadata('privacy')
export default legalPage('privacy')
