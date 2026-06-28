'use client'
// ══════════════════════════════════════════════════════════════
// <KitchenCapacityCategoryRow> — ONE category's cells for the kitchen-capacity GRID, shared by the
// manage Settings grid AND the import wizard's kitchen-setup grid.
//
// CRITICAL: this renders a React.Fragment of BARE grid CELLS — [name][BatchSizeSelect][PrepTimeSelect]
// [counts checkbox?] — NOT a wrapping <div className="grid">. The CALLER owns the grid container + the
// column template string, so the Settings total-capacity row (a sibling grid using the same template)
// stays aligned. If this ever wrapped its cells, that alignment would break.
//
// Presentational only (Stage-D discipline): data in, callbacks out, NO baked RPCs. Settings passes its
// updateCatField / toggleCatCapacity handlers; import passes setCategoryPrep mutators. The counts cell
// renders only when showCountsColumn (Settings true / import false).
// ══════════════════════════════════════════════════════════════
import { Fragment } from 'react'
import { PrepTimeSelect } from '@/components/PrepTimeSelect'
import { BatchSizeSelect } from '@/components/manage/KitchenCapacityEdit'

const CELL_SELECT_CLASS =
  'w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400'

export function KitchenCapacityCategoryRow({
  categoryName,
  batchSize,
  prepSecs,
  onBatchChange,
  onPrepChange,
  showCountsColumn = false,
  countsToward,
  locked,
  capDisabled,
  countsTitle,
  onCountsChange,
}: {
  categoryName: string
  batchSize: number | null | undefined
  prepSecs: number | null | undefined
  onBatchChange: (n: number | null) => void
  onPrepChange: (secs: number) => void
  // Counts-toward cell (Settings only) — gated by showCountsColumn.
  showCountsColumn?: boolean
  countsToward?: boolean
  locked?: boolean        // cooked (prep > 0) → checkbox forced checked + disabled
  capDisabled?: boolean   // locked OR no capacity set → checkbox disabled
  countsTitle?: string
  onCountsChange?: () => void
}) {
  return (
    <Fragment>
      <span className="min-w-0 truncate text-slate-700 font-medium text-sm">{categoryName}</span>
      <BatchSizeSelect
        ariaLabel={`${categoryName} items per batch`}
        valueSize={batchSize}
        onChange={onBatchChange}
        className={CELL_SELECT_CLASS} />
      <PrepTimeSelect
        valueSecs={prepSecs}
        ariaLabel={`${categoryName} prep time`}
        onChange={onPrepChange}
        className={CELL_SELECT_CLASS} />
      {showCountsColumn && (
        <label className={`flex items-center justify-center ${capDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`} title={countsTitle}>
          <input type="checkbox"
            checked={locked ? true : !!countsToward}
            disabled={capDisabled}
            onChange={() => onCountsChange?.()}
            className="w-4 h-4 accent-orange-600 cursor-pointer disabled:cursor-not-allowed" />
        </label>
      )}
    </Fragment>
  )
}
