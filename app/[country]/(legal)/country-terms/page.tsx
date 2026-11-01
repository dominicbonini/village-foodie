// app/[country]/(legal)/country-terms/page.tsx — legal-languages-1 (1 November 2026): the 'country-terms' document in the country's language
// (components/legal/translated-legal.tsx). The English, governing, page is app/(legal)/country-terms.
import { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'
import { legalPage, legalMetadata } from '@/components/legal/translated-legal'

export const dynamic = 'force-dynamic'
export const dynamicParams = false
export function generateStaticParams() {
  return Object.values(COUNTRY_PATH_SEGMENTS).map(country => ({ country }))
}
export const generateMetadata = legalMetadata('country-terms')
export default legalPage('country-terms')
