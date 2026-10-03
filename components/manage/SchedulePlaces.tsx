'use client'
// components/manage/SchedulePlaces.tsx
// The places a truck trades at: the list, the detail, and the hook that loads and seeds them.
//
// 🔴 WHAT THIS FILE IS NOW. It was a Schedule sub-tab pane. The Places pill is gone (3 October 2026):
// the list lives in the Add event modal's left pane, and the detail lives behind "Tidy up places"
// inside that same modal. So this file exports PIECES rather than a screen —
//   `usePlaces`     the load + seed + optimistic favourite, used by both surfaces
//   `PlaceList`     the search box, FAVOURITES / ALL PLACES, the star button
//   `PlaceDetail`   the five fields, Events here, and the three controls
//   `TidyUpPlaces`  list + detail + a way back
// — so the modal and Tidy up share the logic instead of each having a copy of it.
//
// ── 🔴 WHY A HOOK AND NOT A SECOND FETCH ──────────────────────────────────────────────────────────
// `sg_places` SEEDS before it answers. Two components each calling it would seed twice on one screen
// and race each other's reads. One hook, one owner of the list, and the star writes through it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Card, Input, Spinner } from '@/components/manage/primitives'
import { FeatureGate } from '@/components/FeatureGate'
import type { Plan } from '@/lib/features'
import { placeWhenLine, timeRangeLabel } from '@/lib/schedule-graphics/places'

export interface Place {
  id: string
  venue_id: string | null
  name: string
  short_name: string | null
  address: string | null
  area: string | null
  postcode: string | null
  is_favourite: boolean
  is_hidden: boolean
  merged_into_id: string | null
  next_event_date: string | null
  next_start_time: string | null
  next_end_time: string | null
  last_event_date: string | null
  last_start_time: string | null
  last_end_time: string | null
  traded_last_year: number
}

interface PlacesResponse { places?: Place[] }
export type Api = (action: string, extra?: Record<string, unknown>) => Promise<unknown>

const msgOf = (e: unknown, fallback: string): string => {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  return m || fallback
}

/** "Tue 13 Oct". ⚠️ Built from the 'YYYY-MM-DD' PARTS, never `new Date(str)`: a date-only string
 *  parsed as a Date is UTC midnight, which renders as the previous day west of here. */
export function shortDay(ymd: string | null): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

/** Re-exported so the modal has one import for the pair. The rule itself lives in the shared lib. */
export const timeRange = timeRangeLabel

/** The one muted line under a place's name — "Last: Tue 6 Oct · 17:00–20:00". */
export const placeSubLine = (p: Place): string => placeWhenLine(p, shortDay)

/** Hidden or merged: out of the list unless the operator asks for them. */
export const isRetired = (p: Place): boolean => p.is_hidden || !!p.merged_into_id

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE HOOK — one owner of the list, and the only thing that seeds
// ════════════════════════════════════════════════════════════════════════════════════════════════
export function usePlaces(api: Api, enabled: boolean) {
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** A star that failed to save, shown as one short line rather than a toast. */
  const [starError, setStarError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const inFlight = useRef(false)

  /* 🔴 `places === null` IS "NEVER LOADED" and is therefore also the loading state — there is nothing
   * to store. A `setLoading(true)` in the effect body is a synchronous setState inside an effect
   * (cascading renders, and eslint's react-hooks/set-state-in-effect catches it). */
  const loading = enabled && places === null && !error

  useEffect(() => {
    if (!enabled || places !== null || inFlight.current) return
    inFlight.current = true
    let cancelled = false
    ;(async () => {
      try {
        const r = (await api('sg_places')) as PlacesResponse
        if (!cancelled) setPlaces(r.places ?? [])
      } catch (e: unknown) {
        // ⚠️ `[]` AS WELL AS THE MESSAGE. The Add event form must stay usable with no places at all,
        // so the list resolves to empty rather than staying in a spinner for ever.
        if (!cancelled) { setPlaces([]); setError(msgOf(e, 'Couldn’t load places.')) }
      } finally {
        inFlight.current = false
      }
    })()
    return () => { cancelled = true }
  }, [enabled, places, reloadKey, api])

  const reload = useCallback(() => { setPlaces(null); setError(null); setReloadKey(k => k + 1) }, [])

  /** Replace one row in place, without a refetch. */
  const patchLocal = useCallback((id: string, patch: Partial<Place>) => {
    setPlaces(prev => prev ? prev.map(p => p.id === id ? { ...p, ...patch } : p) : prev)
  }, [])

  /* ── 🔴 BUG 1: THE STAR TOGGLES IN PLACE ──────────────────────────────────────────────────────
   * It used to `await api(...)` and then `reload()`, which cleared the list to `null`, showed the
   * spinner and re-ran the whole seed — so pressing a star visibly reloaded the screen and lost the
   * operator's scroll position and search text. The write is a single boolean on one row; nothing
   * else on screen depends on it.
   * 🔴 OPTIMISTIC, THEN REVERTED ON FAILURE. The row moves between FAVOURITES and ALL PLACES
   * immediately. If the save fails the star goes back to what it was and ONE SHORT LINE says so —
   * not a toast, because a toast disappears and would leave a star showing a state the database
   * does not hold.
   * ⚠️ NO REFETCH EVEN ON SUCCESS. A reload here would re-seed, and seeding is a write. */
  const setFavourite = useCallback(async (p: Place, next: boolean) => {
    setStarError(null)
    patchLocal(p.id, { is_favourite: next })
    try {
      await api('sg_upsert_place', { id: p.id, is_favourite: next })
    } catch (e: unknown) {
      patchLocal(p.id, { is_favourite: p.is_favourite })
      setStarError(msgOf(e, `Couldn’t ${next ? 'add' : 'remove'} that favourite.`))
    }
  }, [api, patchLocal])

  return { places: places ?? [], loading, error, starError, reload, patchLocal, setFavourite }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE LIST
// ════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * 🔴 BOTH SECTIONS ARE ALWAYS SHOWN — that is bug 2. The Add event picker used to render favourites
 * only until "Show all places" was pressed, and when a truck had no favourites that meant an empty
 * list under a "No places match" line on an empty search. There is no `showAll` state here and no
 * such message: FAVOURITES and ALL PLACES are both rendered, and the only empty states are "nothing
 * matches your search" (with a search typed) and "no places yet" (with none at all).
 */
export function PlaceList({
  places, selectedId, onSelect, onFavourite, search, onSearch,
  showHidden = false, starError, footer, emptyHint,
}: {
  places: Place[]
  selectedId?: string | null
  onSelect: (p: Place) => void
  onFavourite: (p: Place, next: boolean) => void
  search: string
  onSearch: (v: string) => void
  showHidden?: boolean
  starError?: string | null
  footer?: React.ReactNode
  emptyHint?: string
}) {
  const { favourites, others } = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matches = (p: Place) => !q
      || p.name.toLowerCase().includes(q)
      || String(p.short_name ?? '').toLowerCase().includes(q)
      || String(p.area ?? '').toLowerCase().includes(q)
      || String(p.postcode ?? '').toLowerCase().includes(q)
    const byName = (a: Place, b: Place) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' })
    const visible = places.filter(p => (showHidden || !isRetired(p)) && matches(p))
    return {
      favourites: visible.filter(p => p.is_favourite).sort(byName),
      others: visible.filter(p => !p.is_favourite).sort(byName),
    }
  }, [places, search, showHidden])

  const row = (p: Place) => (
    <li key={p.id} className="flex items-stretch gap-1">
      {/* ⚠️ THE STAR IS ITS OWN BUTTON, not nested inside the row button — tapping it must toggle the
          favourite, not select the place. Nested buttons are invalid HTML, so they are siblings. */}
      <button
        type="button"
        onClick={() => onFavourite(p, !p.is_favourite)}
        aria-label={p.is_favourite ? `Remove ${p.name} from favourites` : `Add ${p.name} to favourites`}
        aria-pressed={p.is_favourite}
        className="px-1.5 text-base leading-none self-center text-orange-500 hover:scale-110 transition-transform"
      >
        {p.is_favourite ? '★' : '☆'}
      </button>
      <button type="button" onClick={() => onSelect(p)} aria-current={p.id === selectedId}
        className={`flex-1 min-w-0 text-left px-2 py-2 rounded-lg transition-colors ${
          p.id === selectedId ? 'bg-orange-50 ring-1 ring-orange-300' : 'hover:bg-slate-50'}`}>
        <span className="block text-sm font-bold text-slate-900 truncate">
          {p.name}
          {isRetired(p) && (
            <span className="ml-1.5 text-xs font-bold text-slate-400">{p.merged_into_id ? '· merged' : '· hidden'}</span>
          )}
        </span>
        <span className="block text-xs text-slate-400 truncate">{placeSubLine(p)}</span>
      </button>
    </li>
  )

  const nothingAtAll = places.filter(p => showHidden || !isRetired(p)).length === 0

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="p-3 pb-2 shrink-0">
        <Input label="Search places" value={search} onChange={onSearch}
          placeholder="Name, area or postcode" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        {/* 🔴 ONE SHORT LINE, NOT A TOAST — see `setFavourite`. */}
        {starError && <p className="text-xs text-red-500 mt-1">{starError}</p>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2">
        {nothingAtAll ? (
          <p className="text-xs text-slate-400 py-3">
            {emptyHint ?? 'No places yet. They appear here from your schedule.'}
          </p>
        ) : favourites.length === 0 && others.length === 0 ? (
          // ⚠️ ONLY REACHABLE WITH A SEARCH TYPED — `nothingAtAll` covers the no-places case above, so
          // this can never be the thing an operator sees on opening the modal (bug 2).
          <p className="text-xs text-slate-400 py-3">Nothing matches “{search.trim()}”.</p>
        ) : (
          <>
            {favourites.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 pt-1 pb-0.5">Favourites</p>
                <ul className="divide-y divide-slate-100">{favourites.map(row)}</ul>
              </div>
            )}
            {others.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 pt-3 pb-0.5">All places</p>
                <ul className="divide-y divide-slate-100">{others.map(row)}</ul>
              </div>
            )}
          </>
        )}
      </div>

      {footer && <div className="shrink-0 border-t border-slate-100 p-3">{footer}</div>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE DETAIL — reused by Tidy up, logic unchanged
// ════════════════════════════════════════════════════════════════════════════════════════════════
export function PlaceDetail({ place, places, api, showToast, onChanged }: {
  place: Place
  places: Place[]
  api: Api
  showToast: (msg: string, kind?: 'success' | 'error') => void
  onChanged: (keepId?: string | null) => void
}) {
  // ⚠️ LOCAL DRAFT STATE, SAVED ON BLUR. The caller gives this a `key` of the place id, so it remounts
  // when the selection changes and a draft can never leak from one place onto another.
  const [name, setName] = useState(place.name)
  const [shortName, setShortName] = useState(place.short_name ?? '')
  const [address, setAddress] = useState(place.address ?? '')
  const [area, setArea] = useState(place.area ?? '')
  const [postcode, setPostcode] = useState(place.postcode ?? '')
  const [merging, setMerging] = useState(false)
  const [mergeInto, setMergeInto] = useState('')
  const [busy, setBusy] = useState(false)

  const saveField = async (field: string, value: string, was: string | null) => {
    if (value.trim() === String(was ?? '').trim()) return
    try { await api('sg_upsert_place', { id: place.id, [field]: value }); onChanged() }
    catch (e: unknown) { showToast(msgOf(e, 'Couldn’t save'), 'error') }
  }

  const setFlag = async (patch: Record<string, boolean>, done: string) => {
    setBusy(true)
    try { await api('sg_upsert_place', { id: place.id, ...patch }); showToast(done, 'success'); onChanged() }
    catch (e: unknown) { showToast(msgOf(e, 'Couldn’t save'), 'error') }
    finally { setBusy(false) }
  }

  const doMerge = async () => {
    if (!mergeInto) return
    setBusy(true)
    try {
      const r = (await api('sg_merge_place', { id: place.id, into_id: mergeInto })) as { into_id?: string }
      setMerging(false); setMergeInto('')
      showToast('Places merged', 'success')
      // ⚠️ SELECT THE TARGET: the place that now has the events is the one to look at.
      onChanged(r?.into_id ?? null)
    } catch (e: unknown) { showToast(msgOf(e, 'Couldn’t merge those places'), 'error') }
    finally { setBusy(false) }
  }

  const mergeTargets = places
    .filter(p => p.id !== place.id && !isRetired(p))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' }))

  const nextLine = place.next_event_date
    ? `Next: ${shortDay(place.next_event_date)}${timeRange(place.next_start_time, place.next_end_time) ? ` · ${timeRange(place.next_start_time, place.next_end_time)}` : ''}`
    : 'Next: nothing booked'
  const lastLine = place.last_event_date
    ? `Last: ${shortDay(place.last_event_date)}${timeRange(place.last_start_time, place.last_end_time) ? ` · ${timeRange(place.last_start_time, place.last_end_time)}` : ''} · ${place.traded_last_year} time${place.traded_last_year === 1 ? '' : 's'} in the last year`
    : 'Last: never'

  return (
    <div className="space-y-4 min-w-0">
      <Card className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Name on posts" value={name} onChange={setName}
          onBlur={() => saveField('name', name, place.name)} />
        <Input label="Short name" value={shortName} onChange={setShortName}
          onBlur={() => saveField('short_name', shortName, place.short_name)} />
        <div className="sm:col-span-2">
          <Input label="Address" value={address} onChange={setAddress}
            onBlur={() => saveField('address', address, place.address)} />
        </div>
        <Input label="Area" value={area} onChange={setArea}
          onBlur={() => saveField('area', area, place.area)} />
        <Input label="Postcode" value={postcode} onChange={setPostcode}
          onBlur={() => saveField('postcode', postcode, place.postcode)}
          autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
      </Card>

      <Card className="p-4 space-y-1">
        <p className="text-sm font-black text-slate-900 mb-1">Events here</p>
        <p className="text-sm text-slate-700">{nextLine}</p>
        <p className="text-sm text-slate-500">{lastLine}</p>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Btn
          label={place.is_favourite ? '★ Favourite' : '☆ Favourite'}
          colour={place.is_favourite ? 'orange' : 'ghost'}
          size="sm" loading={busy}
          onClick={() => setFlag({ is_favourite: !place.is_favourite }, place.is_favourite ? 'Removed from favourites' : 'Added to favourites')}
        />
        <Btn label="Merge into another place" colour="ghost" size="sm"
          disabled={mergeTargets.length === 0} onClick={() => setMerging(m => !m)} />
        {isRetired(place) ? (
          // ⚠️ ONE CONTROL, ONE OUTCOME: restoring a merged place also un-merges it, or it would come
          // back into the list showing none of its own events (they all resolve to the target).
          <Btn label="Restore this place" colour="slate" size="sm" loading={busy}
            onClick={() => setFlag({ is_hidden: false }, 'Place restored')} />
        ) : (
          <Btn label="Hide this place" colour="ghost" size="sm" loading={busy}
            onClick={() => setFlag({ is_hidden: true }, 'Place hidden')} />
        )}
      </div>

      {merging && (
        <Card className="p-4 space-y-2">
          <label className="block text-xs font-bold text-slate-600">Merge “{place.name}” into</label>
          <select value={mergeInto} onChange={e => setMergeInto(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="">Choose a place</option>
            {mergeTargets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <p className="text-xs text-slate-400">Its events move across. No event is changed.</p>
          <div className="flex gap-2">
            <Btn label="Merge" size="sm" loading={busy} disabled={!mergeInto} onClick={doMerge} />
            <Btn label="Cancel" colour="ghost" size="sm" onClick={() => { setMerging(false); setMergeInto('') }} />
          </div>
        </Card>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// TIDY UP PLACES — the list and the detail, inside the Add event modal
// ════════════════════════════════════════════════════════════════════════════════════════════════
export function TidyUpPlaces({ ctl, api, showToast, onBack }: {
  ctl: ReturnType<typeof usePlaces>
  api: Api
  showToast: (msg: string, kind?: 'success' | 'error') => void
  onBack: () => void
}) {
  const [search, setSearch] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = ctl.places.find(p => p.id === selectedId)
    ?? ctl.places.find(p => !isRetired(p))
    ?? null
  const hiddenCount = ctl.places.filter(isRetired).length

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <button type="button" onClick={onBack}
        className="self-start text-xs font-bold text-orange-600 hover:text-orange-700 mb-2 shrink-0">
        ← Back to add event
      </button>
      {ctl.loading ? (
        <div className="py-12 flex justify-center"><Spinner /></div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[22rem_1fr] gap-4">
          <div className="min-h-0 border border-slate-200 rounded-2xl overflow-hidden flex flex-col max-md:max-h-72">
            <PlaceList
              places={ctl.places}
              selectedId={selected?.id ?? null}
              onSelect={p => setSelectedId(p.id)}
              onFavourite={ctl.setFavourite}
              search={search}
              onSearch={setSearch}
              showHidden={showHidden}
              starError={ctl.starError}
              footer={hiddenCount > 0 ? (
                /* 🔴 THE WAY BACK. Without it a hidden place is unreachable and hiding is a one-way door. */
                <button type="button" onClick={() => setShowHidden(h => !h)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700">
                  {showHidden ? 'Hide hidden places' : `Show hidden places (${hiddenCount})`}
                </button>
              ) : null}
            />
          </div>
          <div className="min-h-0 overflow-y-auto">
            {selected ? (
              <PlaceDetail key={selected.id} place={selected} places={ctl.places} api={api}
                showToast={showToast} onChanged={(id) => { ctl.reload(); if (id) setSelectedId(id) }} />
            ) : (
              <Card className="p-8 text-center"><p className="text-sm text-slate-400">Pick a place to tidy up.</p></Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE WEEKLY POST PANE — the only thing still gated, and still a placeholder
// ════════════════════════════════════════════════════════════════════════════════════════════════
export function WeeklyPostPane({ truck }: {
  truck: { plan: Plan; feature_overrides: Record<string, boolean> | null; trial_expires_at: string | null } | null
}) {
  return (
    <FeatureGate
      feature="schedule_graphics"
      plan={truck?.plan}
      overrides={truck?.feature_overrides}
      trialExpiresAt={truck?.trial_expires_at}
      upgradeMessage="The weekly post is on Pro and Max"
    >
      <Card className="p-8 text-center">
        <p className="text-3xl mb-2">🎨</p>
        <p className="font-bold text-slate-700">Your weekly post</p>
        <p className="text-sm text-slate-400 mt-1">Coming next</p>
      </Card>
    </FeatureGate>
  )
}
