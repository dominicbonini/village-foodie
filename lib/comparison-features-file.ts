// lib/comparison-features-file.ts — the master feature list as shipped in data/comparison-features/features.json
// (comparison-features-1, 29 October 2026). The importer seeds public.comparison_features from this file; until it has
// (the table missing or still empty), the comparison pages and Pricing check read this same list, so a fresh deploy
// shows the right rows. Once the table has rows, the table wins (Admin's choices: checked, where it shows).
import file from '@/data/comparison-features/features.json'
import { featureOut, type ComparisonFeature } from '@/lib/comparison-features'

export const FILE_FEATURES: readonly ComparisonFeature[] = (file.features as unknown as Record<string, unknown>[]).map(featureOut)

/** The table's rows when it has any, else the file's list. */
export function featuresOrFile(rows: Record<string, unknown>[] | null | undefined): { features: ComparisonFeature[]; fromFile: boolean } {
  return rows && rows.length ? { features: rows.map(featureOut), fromFile: false } : { features: [...FILE_FEATURES], fromFile: true }
}
