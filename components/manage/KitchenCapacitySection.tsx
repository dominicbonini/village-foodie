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
/* The shared Manage buttons — the confirm's Cancel / Yes pair. */
import { Btn, Toggle } from '@/components/manage/primitives'
/* 🔴 THE ANSWER'S ONE DEFINITION, shared with `add_van` on the server. */
import { capacityAllSame, capacityStragglers } from '@/lib/van-category-settings'
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
  const [busy, setBusy] = useState(false)
  /** The "No → Yes" confirm. Null = closed. */
  const [confirmAllSame, setConfirmAllSame] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api('get_vans')
      const list = ((r.vans ?? []) as VanRow[])
      setVans(list)
      setFirstVanId((r.firstVanId as string | null) ?? list[0]?.id ?? null)
      /* ⚠️ `perVanCategoriesAvailable` IS THE SAME GATE SETTINGS USED. false means the migration for
       * per-van category rows has not been applied, and the tickboxes must then be inert rather than
       * writing to a table that is not there. */
      setAvailable(r.perVanCategoriesAvailable !== false)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load your vans', 'error')
    } finally { setLoading(false) }
  }, [api, showToast])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const firstVan = vans.find(v => v.id === firstVanId) ?? vans[0] ?? null
  const others = vans.filter(v => v.id !== firstVan?.id)

  /**
   * ── 🔴 THE ANSWER IS READ, NEVER STORED ───────────────────────────────────────────────────────
   * There is no "same capacity for all vans" column, and there must not be: the answer IS "does every
   * non-first van follow the first van". A column would be a second source of truth that could
   * disagree with the flags it describes — and the flags are what the engine actually reads.
   *
   * 🔴 YES ONLY WHEN **EVERY** OTHER VAN FOLLOWS. Anything else reads No, including the mixed case
   * (some follow, some do not). Reading a mixed truck as Yes would show one box and silently leave a
   * van running different numbers behind it.
   * ⚠️ A ONE-VAN TRUCK IS VACUOUSLY YES, which is why its second van follows by default — the rule
   * `add_van` applies on the server, from the same reading.
   */
  const allSame = capacityAllSame(vans, firstVan?.id ?? null)
  /** The mixed case: reads No, but some vans are still following. */
  const stragglers = capacityStragglers(vans, firstVan?.id ?? null)

  /**
   * ── 🔴 NOTHING IS WRITTEN BECAUSE THE PAGE LOADED ─────────────────────────────────────────────
   * A mixed truck reads No and shows one box per van, but the vans that still follow have not been
   * unfollowed yet — and must not be, until the operator does something. Writing on mount would mean
   * opening a screen changed the database, which is the one thing a read-only visit must never do.
   *
   * 🔴 SO THE FIRST SAVE PAYS FOR IT. Before the first edit lands, every straggler is unfollowed —
   * keeping its copied values, which is what `on: false` does — so that the box the operator just
   * typed into is genuinely independent of the others. Without this, editing the first van's box
   * would fan out into vans that are shown as having their own.
   * ⚠️ IT RUNS BEFORE THE EDIT, NOT AFTER. Afterwards, the edit would already have fanned out.
   */
  const ensureIndependent = async () => {
    if (allSame || stragglers.length === 0) return
    for (const v of stragglers) await api('set_van_capacity_same_as_first', { vanId: v.id, on: false })
    await load()
  }

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
      await ensureIndependent()
      const res = await api('upsert_van_category', { vanId: v.id, categoryId: cat.id, ...patch })
      /* 🔴 THE FAN-OUT IS REFLECTED LOCALLY. When this van is the first van and the answer is Yes, the
       * server also wrote every van following its CAPACITY; without mirroring that, the other boxes
       * would show their old numbers until a reload. */
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
      await ensureIndependent()
      await api('update_van_settings', { vanId, [field]: value })
      if (vanId === firstVan?.id) await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error')
      await load()
    }
  }

  /**
   * ── 🔴 THE ANSWER CHANGES BY WRITING EVERY OTHER VAN'S FLAG ───────────────────────────────────
   * There is nothing else to write — the answer is the flags. `set_van_capacity_same_as_first` is the
   * same action the old per-van switch used, so turning it ON still COPIES the first van's capacity
   * and REPLACES its category rows, and turning it OFF still writes only the switch.
   *
   * 🔴 NO → YES REPLACES EVERY OTHER VAN'S NUMBERS, which is why it asks first. That is the only
   * destructive thing on this screen.
   * 🔴 YES → NO KEEPS EVERY VAN'S VALUES. They were copied, never looked up, so each van already holds
   * a complete set — "stop following" is all that is needed, and nothing has to be reverted to.
   * ⚠️ SEQUENTIAL. These write the same table for the same truck; firing them in parallel would have
   * N copies racing for no gain on a truck with two vans.
   */
  const setAllSame = async (on: boolean) => {
    setBusy(true)
    try {
      for (const v of others) await api('set_van_capacity_same_as_first', { vanId: v.id, on })
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error')
      await load()
    } finally { setBusy(false); setConfirmAllSame(false) }
  }

  if (loading) return <p className="text-sm text-slate-400 p-1">Loading…</p>
  if (!firstVan) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <p className="text-sm text-slate-600">Add a van in Settings › Truck settings to set your kitchen capacity.</p>
      </div>
    )
  }

  /** Which boxes to draw, and what to call each. Yes ⇒ one; No ⇒ one per van, first first. */
  const boxes = allSame
    ? [{ van: firstVan, title: vans.length > 1 ? 'All vans · Kitchen capacity' : 'Kitchen capacity' }]
    : [firstVan, ...others].map(v => ({ van: v, title: `${v.name} · Kitchen capacity` }))

  return (
    <div className="space-y-4" data-kitchen-capacity-section>
      {/* The lead line. ⚠️ NEW COPY, and it is the only new wording on this screen — the moved card's
          own paragraphs are unchanged below. */}
      <p className="text-sm text-slate-500">
        How many items your kitchen can make, so customers can only pick collection times you can meet.
      </p>

      {/* ── 🔴 ONE QUESTION, AND ONLY WITH MORE THAN ONE VAN ──────────────────────────────────────
        * The van picker and the per-van "Same capacity as …" switch are both GONE (Dominic,
        * 4 October 2026). The picker made the operator choose a van before they could see anything,
        * and the switch asked the same question once per van — so a three-van truck answered it twice
        * and could leave the two answers disagreeing.
        * 🔴 ONE VAN ⇒ NO QUESTION AT ALL. Every truck but a handful has one van, and a question with
        * one possible answer is furniture. */}
      {vans.length > 1 && (
        /* ── 🔴 THE SHARED SWITCH, AND THE SETTING-ROW SHAPE THE REST OF MANAGE USES ───────────────
          * Dominic, 4 October 2026: a Yes/No button pair "matches nothing else in Manage". It does
          * not — every on/off setting on these screens is the green `<Toggle>` on the right of a row,
          * and this question is an on/off setting like any other.
          * 🔴 IT IS SETTINGS' OWN COMPONENT, NOT A COPY. `Toggle` was a local function in page.tsx;
          * it moved to components/manage/primitives.tsx so that this row and Settings render the same
          * one. A second switch that merely looked the same is how two greens come to differ.
          * ⚠️ ON = "same for all vans" (the old Yes), OFF = one box per van (the old No). It still
          * defaults to ON, because `allSame` is vacuously true for a one-van truck and `add_van`
          * keeps it true as vans are added.
          * ⚠️ `bg-slate-50 border rounded-xl p-3` — the card shape Settings' own setting rows use. */
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">Same kitchen capacity for all vans?</p>
          </div>
          {/* 🔴 ON ASKS FIRST; OFF DOES NOT. Only one of them replaces anything. */}
          <Toggle
            on={allSame}
            disabled={busy}
            onToggle={() => { if (allSame) void setAllSame(false); else setConfirmAllSame(true) }}
          />
        </div>
      )}

      {boxes.map(({ van, title }) => (
        <CapacityBox key={van.id} van={van} title={title} categories={categories} available={available}
          effectiveVanCat={effectiveVanCat} writeVanCat={writeVanCat} updateVanSetting={updateVanSetting} />
      ))}

      {/* ── THE CONFIRM, FOR THE ONE DESTRUCTIVE ANSWER ──────────────────────────────────────── */}
      {confirmAllSame && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setConfirmAllSame(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3">
            <p className="font-bold text-slate-900">Same kitchen capacity for all vans?</p>
            <p className="text-sm text-slate-600">
              All vans will use {firstVan.name}’s kitchen capacity. Each van’s own numbers will be replaced.
            </p>
            <div className="flex gap-2 justify-end">
              <Btn label="Cancel" colour="slate" size="sm" onClick={() => setConfirmAllSame(false)} />
              <Btn label="Yes, use the same" size="sm" disabled={busy} onClick={() => void setAllSame(true)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * ══ ONE VAN'S CAPACITY BOX ════════════════════════════════════════════════════════════════════
 *
 * 🔴 EXTRACTED (4 October 2026) BECAUSE THE SCREEN NOW DRAWS ONE OR SEVERAL. Under "Yes" there is a
 * single box editing the first van, which the server fans out; under "No" there is one per van, each
 * writing its own. The markup inside is UNCHANGED from the card that moved out of Settings — the only
 * addition is `title`, which is the box's heading.
 *
 * ⚠️ `title` IS THE ONLY NEW WORDING: "All vans · Kitchen capacity" or "<van name> · Kitchen
 * capacity", both from the MenuCapacity2 board. A one-van truck keeps the plain "Kitchen capacity".
 */
function CapacityBox({ van, title, categories, available, effectiveVanCat, writeVanCat, updateVanSetting }: {
  van: VanRow
  title: string
  categories: CapacityCategory[]
  available: boolean
  effectiveVanCat: (v: VanRow, cat: CapacityCategory) => { prep_secs: number | null; batch_size: number | null; counts_toward_capacity: boolean }
  writeVanCat: (v: VanRow, cat: CapacityCategory, patch: Partial<{ prep_secs: number | null; batch_size: number | null; counts_toward_capacity: boolean }>) => Promise<void>
  updateVanSetting: (vanId: string, field: 'kitchen_capacity' | 'capacity_window_mins', value: number | null) => Promise<void>
}) {
  return (
    /* ══════════════════════════════════════════════════════════════════════════════════════════
       🔴 THE MOVED CARD — FROM HERE DOWN THE MARKUP AND THE WORDING ARE UNCHANGED
       Kitchen capacity — ONE aligned grid (V7.8 §42), matching the dashboard layout:
       CATEGORY · ITEMS · PREP · COUNTS TO TOTAL CAPACITY, with the Total-capacity ceiling row
       aligned under it via the SAME column template. Writes unchanged: writeVanCat
       (prep_secs/batch_size/counts_toward_capacity via upsert_van_category), updateVanSetting
       (kitchen_capacity / capacity_window_mins). Cooking cats (prep>0) lock-checked; instant cats
       toggle once a capacity is set. Window stays plain minutes (engine reads capacity_window_mins
       as minutes).
       ══════════════════════════════════════════════════════════════════════════════════════════ */
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
      <p className="text-sm font-bold text-slate-800 mb-3">{title}</p>
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
  )
}
