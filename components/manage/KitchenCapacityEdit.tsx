'use client'
// ══════════════════════════════════════════════════════════════
// Shared kitchen-capacity controls (Phase 2). Presentational ONLY — data in, callbacks out, NO baked
// RPCs/persistence (the caller owns optimism + writes, exactly like the Stage-D ExtrasEditor).
//
// TWO exports, because the three surfaces have DIFFERENT layouts:
//   • <KitchenCapacityEdit> — a self-contained BLOCK (badge + prep row + batch row + optional
//     counts-toward + instant note). Used by the IMPORT wizard's Kitchen-setup step (a per-category
//     block). Gives import the canonical PrepTimeSelect + batch look so it mimics the Settings design.
//   • <BatchSizeSelect> — the batch <select> atom (∞ + 1..20 + off-grid preservation). The
//     manage Settings + dashboard kitchen rows are MULTI-COLUMN GRIDS aligned to sibling rows (the
//     capacity-ceiling row), so a bundled block can't drop in without breaking that alignment — those
//     surfaces share the ATOMS (PrepTimeSelect, already shared, + this BatchSizeSelect) instead.
// ══════════════════════════════════════════════════════════════
import { PrepTimeSelect } from '@/components/PrepTimeSelect'

const SELECT_CLASS =
  'border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400'

/**
 * Batch-size <select> — "∞" (no limit → null) + 1..20, with off-grid preservation (a stored value
 * > 20 is added as a selectable extra so it can be shown without snapping). Mirrors the existing
 * dashboard / manage-settings batch selects exactly, so swapping them in is byte-identical.
 */
export function BatchSizeSelect({
  valueSize,
  onChange,
  className = SELECT_CLASS,
  ariaLabel = 'Items per batch',
  disabled,
}: {
  valueSize: number | null | undefined
  onChange: (n: number | null) => void
  className?: string
  ariaLabel?: string
  disabled?: boolean
}) {
  const v = !valueSize || valueSize === 0 ? '' : valueSize
  const opts = Array.from({ length: 20 }, (_, i) => i + 1).concat(valueSize && valueSize > 20 ? [valueSize] : [])
  return (
    <select
      value={v}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={e => onChange(e.target.value === '' ? null : parseInt(e.target.value))}
      className={className}
    >
      <option value="">∞</option>
      {opts.map(n => (
        <option key={n} value={n}>{n} item{n !== 1 ? 's' : ''}</option>
      ))}
    </select>
  )
}

/**
 * Self-contained per-category kitchen-capacity block: optional Instant/Cooked badge, "Prep time per
 * order" (shared PrepTimeSelect), "Items at a time" (BatchSizeSelect), optional "counts toward
 * capacity" checkbox (dashboard-only — gated by showCountsToward), and an optional instant note.
 * No persistence — the caller wires onPrepChange / onBatchChange / onCountsChange to its own
 * optimistic+RPC (manage/dashboard) or in-memory (import) handlers.
 */
export function KitchenCapacityEdit({
  categoryName,
  prepSecs,
  batchSize,
  onPrepChange,
  onBatchChange,
  showBadge = true,
  showInstantNote = true,
  showCountsToward = false,
  countsToward,
  onCountsChange,
  countsDisabled,
  countsTitle,
  prepClassName = SELECT_CLASS,
  batchClassName = SELECT_CLASS,
}: {
  categoryName?: string
  prepSecs: number | null | undefined
  batchSize: number | null | undefined
  onPrepChange: (secs: number) => void
  onBatchChange: (n: number | null) => void
  showBadge?: boolean
  showInstantNote?: boolean
  showCountsToward?: boolean
  countsToward?: boolean
  onCountsChange?: () => void
  countsDisabled?: boolean
  countsTitle?: string
  prepClassName?: string
  batchClassName?: string
}) {
  const cooked = (Number(prepSecs) || 0) > 0
  return (
    <div className="space-y-3">
      {showBadge && (
        <div className="flex items-center gap-2">
          {categoryName && <p className="text-sm font-bold text-slate-900">{categoryName}</p>}
          {cooked ? (
            <span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-600 border border-orange-100 rounded-full">🔥 Cooked</span>
          ) : (
            <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 border border-green-100 rounded-full">⚡ Instant</span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-700">Prep time per order</p>
          <p className="text-xs text-slate-400">How long one order takes to prepare</p>
        </div>
        <PrepTimeSelect valueSecs={prepSecs} onChange={onPrepChange} className={prepClassName} ariaLabel={`${categoryName || ''} prep time`.trim()} />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-700">Items at a time</p>
          <p className="text-xs text-slate-400">How many items your kitchen can cook simultaneously</p>
        </div>
        <BatchSizeSelect valueSize={batchSize} onChange={onBatchChange} className={batchClassName} ariaLabel={`${categoryName || ''} items per batch`.trim()} />
      </div>
      {showCountsToward && (
        <label className={`flex items-center gap-2 ${countsDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`} title={countsTitle}>
          <input
            type="checkbox"
            checked={!!countsToward}
            disabled={countsDisabled}
            onChange={() => onCountsChange?.()}
            className="w-4 h-4 accent-orange-600 cursor-pointer disabled:cursor-not-allowed"
          />
          <span className="text-sm text-slate-700">Counts toward capacity</span>
        </label>
      )}
      {showInstantNote && !cooked && (
        <p className="text-xs text-slate-400">Instant items don&apos;t count towards kitchen capacity — customers receive them immediately.</p>
      )}
    </div>
  )
}
