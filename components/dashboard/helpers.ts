// components/dashboard/helpers.ts
// Re-exports shared prep/slot utilities from lib/
// Keeps existing dashboard imports working without changes

export { getAsapSlot } from '@/lib/slot-utils'

export {
  getCatConfig,
  catCookSecs,
  calcReadySecs,
  calcReadyTime,
  calcMinsFromNow,
  getCategoryTime,
  DEFAULT_CAT_CONFIG,
} from '@/lib/prep-utils'

export type { CatConfig } from '@/lib/prep-utils'

// getBundleSlotCats stays here — dashboard-specific
export function getBundleSlotCats(b: any): string[] {
  return [
    b.slot_1_category, b.slot_2_category, b.slot_3_category,
    b.slot_4_category, b.slot_5_category, b.slot_6_category
  ].filter((s): s is string => !!s)
}