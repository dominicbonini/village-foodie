'use client'
// components/manage/KitchenCapacitySection.tsx — Menu › Kitchen capacity.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A MOVE, NOT A REWRITE
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The grid, the Total-capacity row, the warning and the two explanatory paragraphs are the SAME JSX
// that stood in Settings › Kitchen, on each van's card. The wording is unchanged — the copy still
// comes from `lib/kitchen-capacity.ts`, the cells still come from `<KitchenCapacityCategoryRow>`, and
// the writes still go through `upsert_van_category` / `update_van_settings` exactly as they did.
//
// What is NEW is only the frame around it:
//   • a VAN PICKER, which replaces "one card per van" — and shows only when there is more than one;
//   • a "Same capacity as Van 1" switch for vans 2+, on its OWN flag.
//
// ── 🔴 WHY ITS OWN FLAG (`truck_vans.capacity_same_as_first_van`) ─────────────────────────────────
// Settings › Truck settings' "Same as Van 1" used to cover capacity along with everything else. With
// capacity on its own screen it needs its own switch, or two controls would share one column and each
// could silently undo the other. 20261010 adds the column and INITIALISES IT FROM THE OLD ONE, so
// every van behaves exactly as it did before.
//
// ── 🔴 A COPY, NEVER A LOOKUP ─────────────────────────────────────────────────────────────────────
// Switching on asks the server to copy the first van's capacity fields and category rows into this
// van; from then on its values are its OWN. Nothing on the order path resolves through the switch,
// which is what makes switching it off mean "stop following" rather than "revert".
//
// ── ⚠️ WHY THIS LOADS ITS OWN VANS ───────────────────────────────────────────────────────────────
// The table lived inside `SettingsTab`, which already held `vans`, `firstVanId` and the three write
// helpers. The Menu tab holds none of them, and threading eight of SettingsTab's internals through
// the Menu tab would couple two screens that have nothing else to say to each other. One `get_vans`
// call — the same call Settings makes — keeps this screen self-contained and the mount one line.

import { useCallback, useEffect, useState } from 'react'
import { KitchenCapacityCategoryRow } from '@/components/manage/KitchenCapacityCategoryRow'
import {
  KITCHEN_CAPACITY_DESC, KITCHEN_CAPACITY_EXAMPLE, KITCHEN_CAPACITY_WARNING,
  KITCHEN_CAPACITY_GRID, kitchenCapacityNeedsPrepWarning, formatPrepSecs,
} from '@/lib/kitchen-capacity'

/** Only what this screen reads from a category. The Menu tab already has these. */
export interface CapacityCategory {
  id: string
  name: string
  prep_secs: number
  batch_size: number
  counts_toward_capacity?: boolean | null
}

interface VanRow {
  id: string
  name: string
  kitchen_capacity: number | null
  capacity_window_mins?: number | null
  same_as_first_van?: boolean | null
  capacity_same_as_first_van?: boolean | null
  categorySettings?: { category_id: string; prep_secs: number | null; batch_size: number | null; counts_toward_capacity?: boolean | null }[]
}

export function KitchenCapacitySection({ categories, api, showToast }: {
  categories: CapacityCategory[]
  api: (action: string, extra?: Record<string, unknown>) => Promise<Record<string, unknown>>
  showToast: (msg: string, kind?: 'success' | 'error') => void
}) {
  const [vans, setVans] = useState<VanRow[]>([])
  const [firstVanId, setFirstVanId] = useState<string | null>(null)
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [selectedVanId, setSelectedVanId] = useState<string | null>(null)
  const [savingSwitch, setSavingSwitch] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await api('get_vans')
      const list = ((r.vans ?? []) as VanRow[])
      setVans(list)
      const first = (r.firstVanId as string | null) ?? list[0]?.id ?? null
      setFirstVanId(first)
      /* ⚠️ `perVanCategoriesAvailable` IS THE SAME GATE SETTINGS USED. false means the migration for
       * per-van category rows has not been applied, and the tickboxes must then be inert rather than
       * writing to a table that is not there. */
      setAvailable(r.perVanCategoriesAvailable !== false)
      setSelectedVanId(prev => (prev && list.some(v => v.id === prev)) ? prev : first)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load your vans', 'error')
    } finally { setLoading(false) }
  }, [api, showToast])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const van = vans.find(v => v.id === selectedVanId) ?? null

  /* ── THE THREE WRITE HELPERS, LIFTED FROM SettingsTab UNCHANGED IN BEHAVIOUR ──────────────────── */

  /** This van's own values, or the category's — the same resolution the server uses. */
  const effectiveVanCat = (v: VanRow, cat: CapacityCategory) => {
    const own = (v.categorySettings || []).find(r => r.category_id === cat.id)
    return own
      ? { prep_secs: own.prep_secs, batch_size: own.batch_size, counts_toward_capacity: !!own.counts_toward_capacity }
      : { prep_secs: cat.prep_secs, batch_size: cat.batch_size, counts_toward_capacity: !!cat.counts_toward_capacity }
  }

  const patchVanCat = (vanId: string, categoryId: string, next: { prep_secs: number | null; batch_size: number | null; counts_toward_capacity: boolean }) => {
    setVans(prev => prev.map(v => {
      if (v.id !== vanId) return v
      const rows = (v.categorySettings || []).filter(r => r.category_id !== categoryId)
      return { ...v, categorySettings: [...rows, { category_id: categoryId, ...next }] }
    }))
  }

  const writeVanCat = async (
    v: VanRow, cat: CapacityCategory,
    patch: Partial<{ prep_secs: number | null; batch_size: number | null; counts_toward_capacity: boolean }>,
  ) => {
    const prior = (v.categorySettings || []).find(r => r.category_id === cat.id) ?? null
    const next = { ...effectiveVanCat(v, cat), ...patch }
    patchVanCat(v.id, cat.id, next)
    try {
      const res = await api('upsert_van_category', { vanId: v.id, categoryId: cat.id, ...patch })
      /* 🔴 THE FAN-OUT IS REFLECTED LOCALLY. When this van is the first van, the server also wrote
       * every van following its CAPACITY; without mirroring that, switching the picker to one of them
       * would show its old numbers until a reload. */
      const fannedTo: string[] = Array.isArray(res?.fannedTo) ? res.fannedTo as string[] : []
      for (const fid of fannedTo) patchVanCat(fid, cat.id, next)
    } catch (e) {
      setVans(prev => prev.map(x => {
        if (x.id !== v.id) return x
        const rows = (x.categorySettings || []).filter(r => r.category_id !== cat.id)
        return { ...x, categorySettings: prior ? [...rows, prior] : rows }
      }))
      showToast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  const updateVanSetting = async (vanId: string, field: 'kitchen_capacity' | 'capacity_window_mins', value: number | null) => {
    setVans(prev => prev.map(v => v.id === vanId ? { ...v, [field]: value } : v))
    /* 🔴 THE SERVER FANS THESE OUT to the vans following this one's capacity, in the same request.
     * Reloading afterwards is what shows that on the other vans without a second write path. */
    try {
      await api('update_van_settings', { vanId, [field]: value })
      if (vanId === firstVanId) await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error')
      await load()
    }
  }

  const setCapacitySameAsFirst = async (v: VanRow, on: boolean) => {
    setSavingSwitch(v.id)
    try {
      await api('set_van_capacity_same_as_first', { vanId: v.id, on })
      /* ⚠️ A FULL RELOAD, because turning it ON copies fields AND replaces rows server-side. An
       * optimistic patch would have to reproduce the copy, and the two could disagree. */
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error')
    } finally { setSavingSwitch(null) }
  }

  if (loading) return <p className="text-sm text-slate-400 p-1">Loading…</p>
  if (!van) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <p className="text-sm text-slate-600">Add a van in Settings › Truck settings to set your kitchen capacity.</p>
      </div>
    )
  }

  const firstVanName = vans.find(v => v.id === firstVanId)?.name ?? 'the first van'
  const isFollowing = !!van.capacity_same_as_first_van && van.id !== firstVanId

  return (
    <div className="space-y-4" data-kitchen-capacity-section>
      {/* The lead line. ⚠️ NEW COPY, and it is the only new wording on this screen — the moved card's
          own paragraphs are unchanged below. */}
      <p className="text-sm text-slate-500">
        How many items your kitchen can make, so customers can only pick collection times you can meet.
      </p>

      {/* ── THE VAN PICKER — ONLY WITH MORE THAN ONE VAN ─────────────────────────────────────────
        * 🔴 ONE VAN ⇒ NO PICKER. A select with one option is a control that asks a question with one
        * answer, and every truck but a handful has exactly one van. */}
      {vans.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-4">
          <label className="text-sm font-semibold text-slate-800" htmlFor="capacity-van">Van</label>
          <select id="capacity-van" value={selectedVanId ?? ''} onChange={e => setSelectedVanId(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 h-10 text-sm font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
            {vans.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      )}

      {/* ── "SAME CAPACITY AS <first van>" — VANS 2+ ONLY ───────────────────────────────────────
        * ⚠️ COLLAPSED, NOT DISABLED, while it is on — the same choice Settings' switch makes, for the
        * same reason: a greyed-out number invites "is that this van's or Van 1's?", and the answer
        * would be "both", which no control can express. */}
      {available && firstVanId && van.id !== firstVanId && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">Same capacity as {firstVanName}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {isFollowing
                ? `This van uses ${firstVanName}’s capacity. Changes there are copied here.`
                : `Copy ${firstVanName}’s capacity and keep it in step.`}
            </p>
          </div>
          <button type="button" role="switch" aria-checked={isFollowing}
            aria-label={`Same capacity as ${firstVanName}`}
            disabled={savingSwitch === van.id}
            onClick={() => { if (savingSwitch !== van.id) void setCapacitySameAsFirst(van, !isFollowing) }}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
              isFollowing ? 'bg-orange-600' : 'bg-slate-300'}`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              isFollowing ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════════════════════
          🔴 THE MOVED CARD — FROM HERE DOWN THE MARKUP AND THE WORDING ARE UNCHANGED
          Kitchen capacity — ONE aligned grid (V7.8 §42), matching the dashboard layout:
          CATEGORY · ITEMS · PREP · COUNTS TO TOTAL CAPACITY, with the Total-capacity ceiling row
          aligned under it via the SAME column template. Writes unchanged: writeVanCat
          (prep_secs/batch_size/counts_toward_capacity via upsert_van_category), updateVanSetting
          (kitchen_capacity / capacity_window_mins). Cooking cats (prep>0) lock-checked; instant cats
          toggle once a capacity is set. Window stays plain minutes (engine reads capacity_window_mins
          as minutes).
          ⚠️ HIDDEN WHILE THE SWITCH IS ON — that is the collapse, and it is the only reason this is
          conditional.
          ══════════════════════════════════════════════════════════════════════════════════════════ */}
      {!isFollowing && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p className="text-sm font-bold text-slate-800 mb-3">Kitchen capacity</p>
          {categories.length > 0 && (
            <div className={`${KITCHEN_CAPACITY_GRID} gap-y-2 items-center`}>
              <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">Category</span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Items</span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Prep</span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 text-center leading-tight" title="Which categories count toward the total capacity. Cooked categories always count; tick instant ones (sides, dips, drinks) to include them.">Counts to total capacity</span>
              {categories.map(cat => {
                const eff = effectiveVanCat(van, cat)
                const hasCap = van.kitchen_capacity != null
                const locked = (eff.prep_secs ?? 0) > 0
                const capDisabled = locked || !hasCap || !available
                return (
                  <KitchenCapacityCategoryRow
                    key={cat.id}
                    categoryName={cat.name}
                    batchSize={eff.batch_size ?? 0}
                    prepSecs={eff.prep_secs ?? 0}
                    onBatchChange={val => void writeVanCat(van, cat, { batch_size: val ?? 0 })}
                    onPrepChange={secs => void writeVanCat(van, cat, { prep_secs: secs })}
                    showCountsColumn
                    countsToward={eff.counts_toward_capacity}
                    locked={locked}
                    capDisabled={capDisabled}
                    countsTitle={locked
                      ? 'Cooked — always counts (its prep & batch set the pace)'
                      : !hasCap ? 'Set a capacity to choose which categories count'
                      : !available ? 'Unavailable until the database is updated'
                      : 'Tick to include this instant category (sides, dips, drinks) in the shared per-window limit'}
                    onCountsChange={() => { if (!locked && hasCap && available) void writeVanCat(van, cat, { counts_toward_capacity: !eff.counts_toward_capacity }) }}
                  />
                )
              })}
            </div>
          )}
          {/* Total-capacity ceiling — SAME column template ⇒ aligns under the categories. ITEMS
              column = kitchen_capacity ceiling, PREP column = window (plain minutes). */}
          <div className={`${KITCHEN_CAPACITY_GRID} items-center ${categories.length > 0 ? 'mt-2 pt-2.5 border-t border-slate-100' : ''}`}>
            <span className="text-sm font-semibold text-slate-800 min-w-0">Total capacity</span>
            <select
              value={van.kitchen_capacity ?? ''}
              aria-label="Total capacity (items)"
              onChange={e => void updateVanSetting(van.id, 'kitchen_capacity', e.target.value === '' ? null : parseInt(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
              <option value="">∞</option>
              {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n} item{n !== 1 ? 's' : ''}</option>
              ))}
            </select>
            <select
              value={van.capacity_window_mins ?? 5}
              aria-label="Capacity window (minutes)"
              disabled={van.kitchen_capacity == null}
              onChange={e => void updateVanSetting(van.id, 'capacity_window_mins', parseInt(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50">
              {Array.from({ length: 20 }, (_, i) => i + 1).concat(((van.capacity_window_mins ?? 5) > 20) ? [van.capacity_window_mins as number] : []).map(n => (
                <option key={n} value={n}>every {formatPrepSecs(n * 60)}</option>
              ))}
            </select>
            <span />
          </div>
          {van.kitchen_capacity == null && categories.length > 0 && (
            <p className="text-xs text-slate-400 mt-1.5">Set a capacity to choose which categories count.</p>
          )}
          {kitchenCapacityNeedsPrepWarning(van.kitchen_capacity, categories) && (
            <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{KITCHEN_CAPACITY_WARNING}</div>
          )}
          <p className="text-xs text-slate-400 mt-2">{KITCHEN_CAPACITY_DESC}</p>
          <p className="text-xs text-slate-400 mt-1">{KITCHEN_CAPACITY_EXAMPLE}</p>
        </div>
      )}
    </div>
  )
}
