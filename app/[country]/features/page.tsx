// app/[country]/features/page.tsx — /features AT ITS COUNTRY ADDRESS: /uk/features, /us/features (Language Phase 1e).
// 🔴 THE SAME MODULE, NOT A COPY: app/features/page.tsx reads `params.country`. See app/[country]/page.tsx for the
// segment rules (uk/us only, 404 otherwise, switched-off → proxy.ts 302 to the GB page).
import { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'

export { default, generateMetadata } from '../../features/page'

export const dynamic = 'force-dynamic'
export const dynamicParams = false
export function generateStaticParams() {
  return Object.values(COUNTRY_PATH_SEGMENTS).map(country => ({ country }))
}
