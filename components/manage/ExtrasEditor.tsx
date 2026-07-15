'use client'
// ══════════════════════════════════════════════════════════════
// <ExtrasEditor> — shared presentational editor for Custom Extras (modifier groups + options +
// per-dish matrix). Extracted VERBATIM from the manage ModifiersTab (app/manage/[token]/page.tsx)
// so manage and the import wizard render the same UI from ONE source.
//
// DISCIPLINE: this component is STATELESS w.r.t. the canonical lists. It takes data in (groups /
// options / items / categories / assignments) and fires callbacks; the CALLER owns the optimistic
// merge + rollback + persistence. It owns ONLY ephemeral UI state (which card is open, which option
// is being edited, the price buffer, matrix-modal/rename/new-group state). This is what keeps the
// manage page byte-identical after extraction.
//
// CAPABILITY GATING: each mutating affordance is hidden when its callback is undefined, so a caller
// can pass a subset (the import wizard will). Manage passes ALL callbacks → every control renders.
// ══════════════════════════════════════════════════════════════
import { useState, Fragment } from 'react'
import { minRequiredForGroup } from '@/lib/modifier-rules'
import { DEFAULT_STOCK_SCOPE_NOTE } from '@/lib/copy/stock'
import { Card, Badge, EmptyState, Input, Btn, AllergenToggles, DietaryToggles } from './primitives'

export interface ExtrasEditorGroup { id: string; name: string; is_required: boolean; min_choices: number; max_choices: number }
export interface ExtrasEditorOption { id: string; group_id: string; name: string; price_adjustment: number; type: string; sort_order: number; allergens?: string[]; dietary_info?: string[]; available?: boolean; stock_count?: number | null }
export interface ExtrasEditorItem { id: string; name: string; category_id: string | null }
export interface ExtrasEditorCategory { id: string; name: string }
export interface ExtrasEditorAssignment { menu_item_id: string; group_id: string; excluded_option_ids?: string[] }

export interface ExtrasEditorProps {
  groups: ExtrasEditorGroup[]
  options: ExtrasEditorOption[]
  items: ExtrasEditorItem[]
  categories: ExtrasEditorCategory[]
  assignments: ExtrasEditorAssignment[]
  showToast: (m: string, t?: any) => void
  // Reserved for label phrasing when groupRuleLabel is wired in (not referenced by this region yet).
  audience?: 'operator' | 'customer'
  // Header copy — defaults match the manage Custom Extras section.
  title?: string
  description?: string
  note?: string
  addLabel?: string
  // Mutation callbacks. CALLER persists + does the optimistic merge/rollback. Undefined → that
  // affordance is hidden (capability gating).
  onCreateGroup?: (draft: { name: string }) => Promise<ExtrasEditorGroup | null | void>
  onUpdateGroup?: (group: ExtrasEditorGroup, patch: { name?: string; is_required?: boolean; max_choices?: number }) => Promise<void>
  onDeleteGroup?: (group: ExtrasEditorGroup) => Promise<void>
  onSaveOption?: (draft: Partial<ExtrasEditorOption>) => Promise<void>
  onDeleteOption?: (opt: ExtrasEditorOption) => Promise<void>
  onToggleAssign?: (itemId: string, groupId: string, currentlyAttached: boolean) => Promise<void>
  onToggleOption?: (itemId: string, groupId: string, optionId: string, currentlyIncluded: boolean) => Promise<void>
}

export default function ExtrasEditor({
  groups, options, items, categories, assignments, showToast,
  title = 'Custom Extras',
  description = 'Add paid or free options customers can choose when ordering — e.g. Extra Cheese +£1.50, No Onion £0',
  note = 'Create a group of options and assign it to a menu category. All items in that category will offer those options when customers order.',
  addLabel = '+ Add customisation',
  onCreateGroup, onUpdateGroup, onDeleteGroup, onSaveOption, onDeleteOption, onToggleAssign, onToggleOption,
}: ExtrasEditorProps) {
  // ── Ephemeral UI state (owned here; never leaks to the caller) ────────────────
  const [newGroupName, setNewGroupName] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [savingGroup, setSavingGroup] = useState(false)

  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [savingRename, setSavingRename] = useState(false)

  const [editingOption, setEditingOption] = useState<Partial<ExtrasEditorOption> | null>(null)
  const [priceInput, setPriceInput] = useState('')
  const [savingOption, setSavingOption] = useState(false)

  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [catOpen, setCatOpen] = useState<Record<string, boolean>>({})
  const [matrixModalGroupId, setMatrixModalGroupId] = useState<string | null>(null)

  // Capability flags
  const canAddGroup = !!onCreateGroup
  const canEditGroup = !!onUpdateGroup
  const canDeleteGroup = !!onDeleteGroup
  const canSaveOption = !!onSaveOption
  const canDeleteOption = !!onDeleteOption

  // ── Create new group ──────────────────────────────────────────────────────────
  // Caller persists + optimistically appends; it RETURNS the created group so we can open it. On
  // error the caller toasts/throws → we keep the modal open.
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !onCreateGroup) return
    setSavingGroup(true)
    try {
      const g = await onCreateGroup({ name: newGroupName.trim() })
      setShowNewGroup(false)
      setNewGroupName('')
      if (g && (g as ExtrasEditorGroup).id) setExpandedGroup((g as ExtrasEditorGroup).id)
    } catch { /* caller toasts; keep modal open */ }
    finally { setSavingGroup(false) }
  }

  // ── Rename (inline) ─────────────────────────────────────────────────────────
  const startRename = (group: ExtrasEditorGroup) => {
    setRenamingGroupId(group.id)
    setRenameValue(group.name)
  }
  const commitRename = async (group: ExtrasEditorGroup) => {
    const newName = renameValue.trim()
    if (!newName || newName === group.name) { setRenamingGroupId(null); return }
    setSavingRename(true)
    setRenamingGroupId(null)
    try { await onUpdateGroup?.(group, { name: newName }) }
    finally { setSavingRename(false) }
  }

  // ── Selection rules (Required + Choose one/many) — caller derives min_choices + clamps. ────────
  const rules = (group: ExtrasEditorGroup, patch: { is_required?: boolean; max_choices?: number }) => {
    onUpdateGroup?.(group, patch)
  }

  // ── Option save — coerce the price STRING buffer → number here (only place). Caller persists. ──
  const handleSaveOption = async () => {
    if (!editingOption?.name || !editingOption.group_id) return
    const parsedPrice = parseFloat(priceInput)
    const price_adjustment = Number.isFinite(parsedPrice) ? parsedPrice : 0
    setSavingOption(true)
    try {
      await onSaveOption?.({ ...editingOption, price_adjustment })
      setEditingOption(null)
    } catch { /* caller toasts + reverts; keep modal open */ }
    finally { setSavingOption(false) }
  }

  // Per-(dish,group) excluded option ids — reads the assignments prop.
  const excludedFor = (menu_item_id: string, group_id: string): string[] =>
    assignments.find(x => x.menu_item_id === menu_item_id && x.group_id === group_id)?.excluded_option_ids || []

  return (
    <>
      {/* ── Section heading ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-10 mb-4">
        <div>
          <h2 className="font-black text-slate-900 text-lg">{title}</h2>
          <p className="text-slate-400 text-sm mt-0.5">{description}</p>
        </div>
        {canAddGroup && <Btn label={addLabel} onClick={() => { setShowNewGroup(true); setNewGroupName('') }} />}
      </div>
      <p className="text-xs text-slate-400 mb-4">{note}</p>

      <div className="space-y-4">
      {groups.length === 0 && (
        <EmptyState icon="⚙️" title="No custom extras yet" body='Create a group like "Pizza extras" and add options like "Extra Cheese +£1.00"' />
      )}

      {groups.map(group => {
        const opts = options.filter(o => o.group_id === group.id).sort((a, b) => a.sort_order - b.sort_order)
        const attachedCount = assignments.filter(x => x.group_id === group.id).length
        const isOpen = expandedGroup === group.id
        const isRenaming = renamingGroupId === group.id

        return (
          <Card key={group.id}>
            {/* ── Collapsed header — chevron is the only toggle ── */}
            <div
              className="flex items-center gap-3 p-4 cursor-pointer select-none"
              onClick={() => !isRenaming && setExpandedGroup(isOpen ? null : group.id)}
            >
              <div className="flex-1 min-w-0">
                {!isOpen && <p className="font-black text-slate-900">{group.name}</p>}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-slate-400 text-xs">{opts.length} option{opts.length !== 1 ? 's' : ''}</span>
                  {attachedCount > 0 && <Badge label={`${attachedCount} dish${attachedCount !== 1 ? 'es' : ''}`} colour="green" />}
                </div>
              </div>
              <span className={`transition-transform inline-block text-slate-400 text-xs flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
            </div>

            {isOpen && (
              <div className="border-t border-slate-100 p-4 space-y-5">

                {/* ── Expanded header: Rename + Delete ── */}
                <div className="flex items-center justify-between gap-3 -mt-1">
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(group)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(group); if (e.key === 'Escape') setRenamingGroupId(null) }}
                      className="flex-1 border border-orange-400 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
                      disabled={savingRename}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <p className="font-black text-slate-900 text-base truncate flex-1">{group.name}</p>
                  )}
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {!isRenaming && canEditGroup && (
                      <button
                        onClick={() => startRename(group)}
                        className="text-xs text-slate-500 hover:text-orange-600 font-bold px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                      >
                        Rename
                      </button>
                    )}
                    {canDeleteGroup && (
                      <button
                        onClick={() => onDeleteGroup?.(group)}
                        className="text-slate-400 hover:text-red-500 px-1.5 py-1 rounded-lg hover:bg-red-50 transition-colors text-sm"
                        title="Delete group"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Selection rules: Required + Choose one/many ── */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!group.is_required}
                      onChange={e => rules(group, { is_required: e.target.checked })}
                      className="w-4 h-4 accent-orange-500"
                    />
                    <span className="text-sm font-medium text-slate-700">Required</span>
                    <span className="text-xs text-slate-400">(customer must choose)</span>
                  </label>
                  {/* Option (A) control: TWO buttons — "Choose one" (max 1, radio) + "Choose multiple"
                      (max > 1) — plus a dropdown ENABLED ONLY under "Choose multiple" (greyed/disabled
                      under "Choose one"). Clicking "Choose multiple" from "one" defaults to max 2.
                      Dropdown values: "Up to 2"…"Up to 10" → max N; "Unlimited" → 99 sentinel.
                      The caller derives min from Required + clamps. */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-400 mr-1">Selection:</span>
                    {(() => {
                      const m = group.max_choices ?? 99
                      const isOne = m === 1
                      const btn = (active: boolean) => `text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${active ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`
                      return (
                        <>
                          <button type="button" onClick={() => rules(group, { max_choices: 1 })} className={btn(isOne)}>Choose one</button>
                          <button type="button" onClick={() => { if (isOne) rules(group, { max_choices: 2 }) }} className={btn(!isOne)}>Choose multiple</button>
                          <select
                            aria-label="Maximum choices"
                            disabled={isOne}
                            value={isOne ? '' : String(m)}
                            onChange={e => { const v = e.target.value; if (v) rules(group, { max_choices: v === '99' ? 99 : parseInt(v) }) }}
                            className={`text-xs font-bold px-2 py-1.5 rounded-lg border bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-orange-400 ${isOne ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-900 text-slate-900'}`}>
                            {isOne && <option value="" disabled>—</option>}
                            {Array.from({ length: 9 }, (_, i) => i + 2).map(n => <option key={n} value={n}>Up to {n}</option>)}
                            <option value="99">Unlimited</option>
                          </select>
                        </>
                      )
                    })()}
                  </div>
                </div>

                {/* ── Options ── */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Options</p>
                  {opts.map(opt => (
                    <div key={opt.id} className="flex items-center gap-2 py-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${opt.type === 'remove' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>{opt.type}</span>
                      <span className="flex-1 text-sm text-slate-800 font-medium">{opt.name}</span>
                      {/* Sold-out / stock at-a-glance (D1/D2). Sold out = manual (available=false) OR stock 0. */}
                      {(opt.available === false || opt.stock_count === 0) && <span className="text-[10px] font-bold bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full">Sold out</span>}
                      {opt.available !== false && opt.stock_count != null && opt.stock_count > 0 && <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{opt.stock_count} left</span>}
                      <span className="text-sm font-bold text-orange-600">{opt.price_adjustment > 0 ? `+£${opt.price_adjustment.toFixed(2)}` : opt.price_adjustment < 0 ? `-£${Math.abs(opt.price_adjustment).toFixed(2)}` : 'Free'}</span>
                      {canSaveOption && <button onClick={() => { setEditingOption(opt); setPriceInput(opt.price_adjustment ? String(opt.price_adjustment) : '') }} className="text-slate-300 hover:text-orange-500 text-xs px-1.5 py-0.5 rounded hover:bg-orange-50">✏️</button>}
                      {canDeleteOption && <button onClick={() => onDeleteOption?.(opt)} className="text-slate-300 hover:text-red-500 text-xs px-1.5 py-0.5 rounded hover:bg-red-50">🗑️</button>}
                    </div>
                  ))}
                  {canSaveOption && (
                    <button
                      onClick={() => { setEditingOption({ group_id: group.id, type: 'add', price_adjustment: 0, sort_order: opts.length }); setPriceInput('') }}
                      className="text-xs text-orange-600 font-bold hover:text-orange-700 mt-1"
                    >
                      + Add option
                    </button>
                  )}
                </div>

                {/* ── Per-dish summary (read-only) — which dishes offer this group; a "*" flags dishes
                    that hide some options. The full edit (assignment + option ticks) lives in the matrix
                    MODAL behind "Edit per-dish options" so the card stays compact. Same data/callbacks as
                    the edit-item modal → all surfaces stay in sync. */}
                <div onClick={e => e.stopPropagation()}>
                  {(() => {
                    const linkedIds = new Set(assignments.filter(x => x.group_id === group.id).map(x => x.menu_item_id))
                    const offered = items.filter(i => linkedIds.has(i.id))
                    const excNames = (itemId: string) => {
                      const exc = new Set(excludedFor(itemId, group.id))
                      return opts.filter(o => exc.has(o.id)).map(o => o.name)
                    }
                    const withExc = offered.filter(i => excNames(i.id).length > 0)
                    // Collapse the "Offered on" list by category so a whole-category extra reads "Pizza" rather
                    // than 18 dish names. Same cats shape as the matrix. Per category with ≥1 offered dish:
                    // fully-covered (n===m) → just the name; partial → "Category (n of m)" for big categories
                    // (m>4) or the dish names for small ones. A "*" on a collapsed name flags that some dish in
                    // it hides options (the per-dish detail is still printed by the withExc block below).
                    const summaryCats = [
                      ...categories.map(c => ({ id: c.id, name: c.name, items: items.filter(i => i.category_id === c.id) })),
                      { id: '__uncat__', name: 'Uncategorized', items: items.filter(i => !i.category_id) },
                    ]
                    const chunks: string[] = []
                    for (const cat of summaryCats) {
                      const inCat = cat.items.filter(i => linkedIds.has(i.id))
                      if (inCat.length === 0) continue
                      const n = inCat.length, m = cat.items.length
                      const catStar = inCat.some(i => excNames(i.id).length > 0) ? ' *' : ''
                      if (n === m) chunks.push(`${cat.name}${catStar}`)
                      else if (m > 4) chunks.push(`${cat.name} (${n} of ${m})${catStar}`)
                      else chunks.push(inCat.map(i => `${i.name}${excNames(i.id).length ? ' *' : ''}`).join(', '))
                    }
                    return (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Offered on</p>
                          <button onClick={() => setMatrixModalGroupId(group.id)} className="text-xs font-bold text-orange-600 hover:text-orange-700">Edit per-dish options</button>
                        </div>
                        {offered.length === 0 ? (
                          <p className="text-xs text-slate-400">Not offered on any dish yet.</p>
                        ) : (
                          <>
                            <p className="text-xs text-slate-600">{chunks.join(' · ')}</p>
                            {withExc.map(i => (
                              <p key={i.id} className="text-[10px] text-orange-500 mt-0.5">* {i.name}: {excNames(i.id).join(', ')} hidden</p>
                            ))}
                          </>
                        )}
                      </>
                    )
                  })()}
                </div>

                {/* Matrix MODAL — full combined matrix (Offer tick = assignment; option cells = include/
                    exclude, live only when offered; required last-tick guard). ONE table with collapsible
                    category sub-header rows so every category's columns ALIGN; table-layout fixed + a shared
                    colgroup pins the Dish/Offer/option columns to the same x. Default expand = category has
                    ≥1 offering dish. Standard modal (backdrop / × closes); edits persist live (caller's
                    optimistic callbacks, no reload — §23). */}
                {matrixModalGroupId === group.id && (() => {
                  const linkedIds = new Set(assignments.filter(x => x.group_id === group.id).map(x => x.menu_item_id))
                  const required = minRequiredForGroup({ ...group, options: [] } as any) > 0
                  const cats = [
                    ...categories.map(c => ({ id: c.id, name: c.name, items: items.filter(i => i.category_id === c.id) })),
                    { id: '__uncat__', name: 'Uncategorized', items: items.filter(i => !i.category_id) },
                  ].filter(c => c.items.length > 0)
                  const tickBtn = (on: boolean, disabled: boolean, locked: boolean, title: string, onClick: () => void) => (
                    <button type="button" disabled={disabled} title={title} onClick={onClick}
                      className={`w-5 h-5 rounded border inline-flex items-center justify-center transition-colors ${disabled && !locked ? 'bg-slate-50 border-slate-200 text-transparent cursor-not-allowed opacity-50' : on ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-slate-300 text-transparent hover:border-green-400'} ${locked ? 'opacity-50 cursor-not-allowed' : disabled ? '' : 'active:scale-95'}`}>
                      {on ? '✓' : ''}
                    </button>
                  )
                  return (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setMatrixModalGroupId(null)}>
                      <div className="bg-white rounded-2xl p-5 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-black text-slate-900">{group.name} — per-dish options</h3>
                          <button onClick={() => setMatrixModalGroupId(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
                        </div>
                        <p className="text-xs text-slate-400 mb-3">Tick &quot;Include&quot; to add the group to a dish, then tick which options it shows. Saves instantly.</p>
                        <div className="overflow-x-auto">
                          {/* Fixed layout + a shared colgroup pin every category's columns to the same x. The
                              Dish col gets an EXPLICIT width so it can't collapse (which overlapped the headers
                              and clipped dish names); min-width = Dish + Include + options so many-option grids
                              scroll horizontally (wrapper is overflow-x-auto) rather than crushing columns. */}
                          <table className="text-xs border-collapse w-full" style={{ tableLayout: 'fixed', minWidth: 200 + 56 + opts.length * 76 }}>
                            <colgroup>
                              <col style={{ width: 200 }} />
                              <col style={{ width: 56 }} />
                              {opts.map(o => <col key={o.id} style={{ width: 76 }} />)}
                            </colgroup>
                            <thead>
                              <tr>
                                <th className="text-left font-bold text-slate-400 uppercase tracking-wide pb-1.5 pr-3">Dish</th>
                                <th className="text-center font-bold text-slate-400 uppercase tracking-wide pb-1.5 px-2">Include</th>
                                {opts.map(o => (
                                  <th key={o.id} className="text-center font-bold text-slate-600 pb-1.5 px-1 leading-tight">
                                    {o.name}{o.price_adjustment > 0 && <span className="text-orange-500"> +£{o.price_adjustment.toFixed(2)}</span>}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {cats.map(cat => {
                                const offeringCount = cat.items.filter(i => linkedIds.has(i.id)).length
                                const key = `${group.id}:${cat.id}`
                                const open = key in catOpen ? catOpen[key] : offeringCount > 0
                                return (
                                  <Fragment key={cat.id}>
                                    <tr className="cursor-pointer" onClick={() => setCatOpen(s => ({ ...s, [key]: !open }))}>
                                      <td colSpan={opts.length + 2} className="pt-3 pb-1">
                                        <span className="flex items-center justify-between">
                                          <span className="flex items-center gap-2">
                                            {/* Select-all-in-category: tri-state (all ✓ / partial – / none). Offers the
                                                group on every dish in the category in one tap (or clears all when full).
                                                stopPropagation so it doesn't also collapse the category row. */}
                                            {onToggleAssign && (() => {
                                              const allOn = cat.items.length > 0 && offeringCount === cat.items.length
                                              const partial = offeringCount > 0 && !allOn
                                              return (
                                                <button type="button"
                                                  title={allOn ? `Remove ${group.name} from all ${cat.name}` : `Offer ${group.name} on all ${cat.name}`}
                                                  onClick={e => {
                                                    e.stopPropagation()
                                                    if (allOn) cat.items.forEach(it => { if (linkedIds.has(it.id)) onToggleAssign?.(it.id, group.id, true) })
                                                    else cat.items.forEach(it => { if (!linkedIds.has(it.id)) onToggleAssign?.(it.id, group.id, false) })
                                                  }}
                                                  className={`w-4 h-4 rounded border inline-flex items-center justify-center text-[10px] leading-none transition-colors ${allOn ? 'bg-green-600 border-green-600 text-white' : partial ? 'bg-green-100 border-green-400 text-green-700' : 'bg-white border-slate-300 text-transparent hover:border-green-400'}`}>
                                                  {allOn ? '✓' : partial ? '–' : ''}
                                                </button>
                                              )
                                            })()}
                                            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wide">{cat.name}</span>
                                          </span>
                                          <span className="flex items-center gap-2"><span className="text-[10px] font-bold text-slate-400">{offeringCount} of {cat.items.length} offer this</span><span className="text-slate-400">{open ? '▾' : '▸'}</span></span>
                                        </span>
                                      </td>
                                    </tr>
                                    {open && cat.items.map(it => {
                                      const offered = linkedIds.has(it.id)
                                      const excluded = new Set(excludedFor(it.id, group.id))
                                      const includedCount = opts.filter(o => !excluded.has(o.id)).length
                                      return (
                                        <tr key={it.id} className="border-t border-slate-50">
                                          <td className="py-1.5 pr-3 text-slate-700 font-medium truncate" title={it.name}>{it.name}</td>
                                          <td className="text-center py-1.5 px-2">
                                            {tickBtn(offered, false, false,
                                              offered ? 'Offered — click to remove the group from this dish' : 'Not offered — click to add',
                                              () => onToggleAssign?.(it.id, group.id, offered))}
                                          </td>
                                          {opts.map(o => {
                                            const on = offered && !excluded.has(o.id)
                                            const locked = offered && required && on && includedCount <= 1
                                            const disabled = !offered || locked
                                            return (
                                              <td key={o.id} className="text-center py-1.5 px-1">
                                                {tickBtn(on, disabled, locked,
                                                  !offered ? 'Add the group to this dish first' : locked ? 'A required group needs at least one option for each dish' : (on ? 'Offered — click to remove' : 'Not offered — click to add'),
                                                  () => onToggleOption?.(it.id, group.id, o.id, on))}
                                              </td>
                                            )
                                          })}
                                        </tr>
                                      )
                                    })}
                                  </Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )
                })()}

              </div>
            )}
          </Card>
        )
      })}

      </div>{/* end space-y-4 group list */}

      {/* New group modal — name only */}
      {showNewGroup && canAddGroup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 mb-4">New custom extra</h3>
            <Input
              label="Group name"
              required
              value={newGroupName}
              onChange={v => setNewGroupName(v)}
              placeholder='e.g. Pizza extras'
            />
            <div className="flex gap-2 mt-4">
              <Btn label="Cancel" colour="slate" onClick={() => { setShowNewGroup(false); setNewGroupName('') }} />
              <Btn label={savingGroup ? 'Saving...' : 'Save'} loading={savingGroup} onClick={handleCreateGroup} />
            </div>
          </div>
        </div>
      )}

      {/* Edit Option Modal */}
      {editingOption && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => {}}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 mb-4">{editingOption.id ? 'Edit option' : 'New option'}</h3>
            <div className="space-y-3">
              <Input label="Option name" required value={editingOption.name || ''} onChange={v => setEditingOption(p => ({...p!, name: v}))} placeholder='e.g. Extra Cheese' />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Type</label>
                  <select value={editingOption.type || 'add'} onChange={e => setEditingOption(p => ({...p!, type: e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                    <option value="add">Add</option>
                    <option value="remove">Remove</option>
                  </select>
                </div>
                <Input label="Price adjustment (£)" type="text" inputMode="decimal" value={priceInput} onChange={setPriceInput} placeholder="0" hint="0 = free" />
              </div>

              {/* Sold-out + stock (Stage D1). Sold out → available=false → option hides for
                  customers + operator (existing isModifierAvailable filter). Stock count is a shared
                  pool (one supply across all dishes using this option); in D1 it is informational/
                  editable only — the runtime decrement that consumes it is D2. */}
              <div className="grid grid-cols-2 gap-3 items-start">
                <label className="flex items-center gap-2 cursor-pointer pt-5">
                  <input
                    type="checkbox"
                    checked={(editingOption as any).available === false}
                    onChange={e => setEditingOption(p => ({ ...p!, available: !e.target.checked } as any))}
                    className="w-4 h-4 accent-orange-500"
                  />
                  <span className="text-sm font-medium text-slate-700">Sold out</span>
                </label>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Stock count <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input
                    type="number" min="0" inputMode="numeric" placeholder="∞ untracked"
                    value={(editingOption as any).stock_count ?? ''}
                    onChange={e => setEditingOption(p => ({ ...p!, stock_count: e.target.value === '' ? null : parseInt(e.target.value) } as any))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">{DEFAULT_STOCK_SCOPE_NOTE}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Shared pool across all dishes using this option.</p>
                </div>
              </div>

              {/* Per-option allergens (Stage C) — INDEPENDENT of the dish; e.g. prawn = Shellfish.
                  Shown to the customer at selection + carried to basket/ticket/email. Reuses the
                  item-editor toggle pattern. */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Allergens</label>
                <p className="text-xs text-slate-400 mt-0.5 mb-2">This option's own allergens (separate from the dish)</p>
                <AllergenToggles
                  value={(editingOption as any).allergens || []}
                  onChange={next => setEditingOption(prev => prev ? { ...prev, allergens: next } as any : prev)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dietary</label>
                <div className="mt-2">
                  <DietaryToggles
                    value={(editingOption as any).dietary_info || []}
                    onChange={next => setEditingOption(prev => prev ? { ...prev, dietary_info: next } as any : prev)}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn label="Cancel" colour="slate" onClick={() => setEditingOption(null)} />
              <Btn label={savingOption ? 'Saving...' : 'Save'} loading={savingOption} onClick={handleSaveOption} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
