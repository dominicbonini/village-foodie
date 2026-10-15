'use client'
// Shared, display-only spiciness badge. value 1-3 → that many chili icons; null/0/invalid → nothing.
// Matches the dietary/allergen chip pattern (rounded, rem font so it scales with the OS "Larger Text"
// setting). NOT customer-selectable, never part of basket/order/deal/ticket logic — display only.

import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/menuBadges'

// The words: messages/en-GB.json `menuBadges.spiceLevel` (Language Phase 1a).
export function SpiceLevel({ value, className = '' }: { value?: number | null; className?: string }) {
  const t = useT('menuBadges')
  const n = Number(value)
  if (![1, 2, 3].includes(n)) return null
  return (
    <span
      className={`inline-flex items-center text-[0.625rem] px-1.5 py-0.5 bg-red-50 text-red-700 rounded-md font-medium ${className}`}
      title={t('spiceLevel', { level: String(n), max: '3' })}
      aria-label={t('spiceLevel', { level: String(n), max: '3' })}
    >
      {'🌶️'.repeat(n)}
    </span>
  )
}
