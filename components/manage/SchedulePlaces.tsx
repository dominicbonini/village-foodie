'use client'
// components/manage/SchedulePlaces.tsx
// Manage › Schedule › Places — the operator's own list of pitches, and the Weekly post placeholder.
//
// 🔴 WHAT REPLACED WHAT. This was `ScheduleGraphicsTab.tsx`, a top-level tab with three sections and a
// Facebook-groups card. Groups are gone from the product; the section lives inside Schedule now,
// because a place IS a schedule concept — the list is built from the truck's own events and feeds the
// Add event picker. The Weekly post pane is the only part still behind the `schedule_graphics` plan
// gate, and the only part that is still a placeholder.
//
// ── 🔴 WHY OPENING PLACES WRITES ──────────────────────────────────────────────────────────────────
// `sg_places` seeds a place per pitch in the truck's schedule before it answers. An operator should
// not type out places they already have twelve months of events for. It is idempotent in the
// DATABASE (`unique (truck_id, name_key)` + `on conflict do nothing`), so a refresh, a second tab or
// two devices produce one row — and it never touches a place that has been hidden or merged.
//
// ── PHONE FIRST ──────────────────────────────────────────────────────────────────────────────────
// One column (list, then the selected place below it) until `lg`, two after. ⚠️ `lg:` not `md:` — the
// detail pane carries a four-field card and the merge control, and 768px is not enough beside a list.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Btn, Card, Input, Spinner } from '@/components/manage/primitives'
import { FeatureGate } from '@/components/FeatureGate'
import type { Plan } from '@/lib/features'

interface Place {
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
type Api = (action: string, extra?: Record<string, unknown>) => Promise<unknown>

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

/** "17:00–20:00", or '' when the event carries no times. */
export function timeRange(start: string | null, end: string | null): string {
  const t = (v: string | null) => (v ? String(v).slice(0, 5) : '')
  const a = t(start), b = t(end)
  if (!a && !b) return ''
  return b ? `${a}–${b}` : a
}

/** The one muted line under a place's name in the list. */
export function placeSubLine(p: Place): string {
  if (p.next_event_date) return `Next: ${shortDay(p.next_event_date)}`
  if (p.last_event_date) return `Last: ${shortDay(p.last_event_date)}`
  return 'No events yet'
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE WEEKLY POST PANE — the only thing still gated, and still a placeholder
// ════════════════════════════════════════════════════════════════════════════════════════════════
export function WeeklyPostPane({ truck }: {
  truck: { plan: Plan; feature_overrides: Record<string, boolean> | null; trial_expires_at: string | null } | null
}) {
  return (
    /* 🔴 THE GATE WRAPS THIS PANE AND NOTHING ELSE. In stage 1 it wrapped Places too; Places is how an
       operator keeps their own schedule tidy, which every plan pays for. A locked plan still SEES this
       sub-tab with one upgrade line — `FeatureGate` supplies the wording, the plan name and the App
       Store CTA suppression, so no call site restates them. */
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

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PLACES
// ════════════════════════════════════════════════════════════════════════════════════════════════
export function SchedulePlaces({ api, showToast }: {
  api: Api
  showToast: (msg: string, kind?: 'success' | 'error') => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [places, setPlaces] = useState<Place[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [keepId, setKeepId] = useState<string | null>(null)

  /* ── 🔴 AN ASYNC IIFE WITH A `cancelled` FLAG, the pattern PaymentsTab uses. Setting state
   * SYNCHRONOUSLY in an effect body triggers cascading renders (eslint's
   * react-hooks/set-state-in-effect says so), and the flag stops a setState landing after the
   * operator has switched sub-tab. ⚠️ `loading` STARTS true so the spinner shows without an effect
   * writing it. */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = (await api('sg_places')) as PlacesResponse
        if (cancelled) return
        const rows = r.places ?? []
        setPlaces(rows)
        setSelectedId(prev => {
          const want = keepId ?? prev
          return want && rows.some(p => p.id === want) ? want : (rows.find(p => !p.is_hidden)?.id ?? null)
        })
      } catch (e: unknown) {
        if (!cancelled) setError(msgOf(e, 'Couldn’t load places.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // ⚠️ `keepId` IS READ, NOT WATCHED — `reloadKey` is what asks for a read, and `reload` sets both.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, reloadKey])

  const reload = useCallback((id?: string | null) => {
    setKeepId(id ?? null); setLoading(true); setError(null); setReloadKey(k => k + 1)
  }, [])

  /* 🔴 THE LIST ORDER AND THE TWO GROUPS. Favourites first, each group alphabetical; a merged place is
   * never in the list (it is the same pitch as its target, so showing both shows one thing twice) and
   * a hidden one only under "Show hidden places". */
  const { favourites, others, hiddenCount } = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matches = (p: Place) => !q
      || p.name.toLowerCase().includes(q)
      || String(p.short_name ?? '').toLowerCase().includes(q)
      || String(p.area ?? '').toLowerCase().includes(q)
      || String(p.postcode ?? '').toLowerCase().includes(q)
    const byName = (a: Place, b: Place) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' })
    const retired = (p: Place) => p.is_hidden || !!p.merged_into_id
    const visible = places.filter(p => (showHidden || !retired(p)) && matches(p))
    return {
      favourites: visible.filter(p => p.is_favourite).sort(byName),
      others: visible.filter(p => !p.is_favourite).sort(byName),
      hiddenCount: places.filter(retired).length,
    }
  }, [places, search, showHidden])

  const selected = places.find(p => p.id === selectedId) ?? null

  const addPlace = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      const r = (await api('sg_upsert_place', { name })) as { id?: string | null }
      setNewName(''); setAdding(false)
      reload(r?.id ?? null)
      showToast('Place added', 'success')
    } catch (e: unknown) { showToast(msgOf(e, 'Couldn’t add that place'), 'error') }
  }

  const toggleFavourite = async (p: Place) => {
    try {
      await api('sg_upsert_place', { id: p.id, is_favourite: !p.is_favourite })
      reload(p.id)
    } catch (e: unknown) { showToast(msgOf(e, 'Couldn’t change that'), 'error') }
  }

  if (loading) return <div className="py-12 flex justify-center"><Spinner /></div>

  if (error) {
    return (
      <Card className="p-6">
        <p className="text-sm font-bold text-red-600">{error}</p>
        <div className="mt-3"><Btn label="Try again" colour="slate" size="sm" onClick={() => reload(selectedId)} /></div>
      </Card>
    )
  }

  const row = (p: Place) => (
    <li key={p.id} className="flex items-stretch gap-1">
      {/* ⚠️ THE STAR IS ITS OWN BUTTON, not part of the row button — tapping it must toggle the
          favourite, not select the place. Nested buttons are invalid HTML, so they are siblings. */}
      <button
        onClick={() => toggleFavourite(p)}
        aria-label={p.is_favourite ? `Unfavourite ${p.name}` : `Favourite ${p.name}`}
        aria-pressed={p.is_favourite}
        className="px-1.5 text-base leading-none self-center text-orange-500 hover:scale-110 transition-transform"
      >
        {p.is_favourite ? '★' : '☆'}
      </button>
      <button onClick={() => setSelectedId(p.id)} aria-current={p.id === selectedId}
        className={`flex-1 min-w-0 text-left px-2 py-2 rounded-lg transition-colors ${
          p.id === selectedId ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
        <span className="block text-sm font-bold text-slate-900 truncate">
          {p.name}
          {(p.is_hidden || p.merged_into_id) && (
            <span className="ml-1.5 text-xs font-bold text-slate-400">{p.merged_into_id ? '· merged' : '· hidden'}</span>
          )}
        </span>
        <span className="block text-xs text-slate-400 truncate">{placeSubLine(p)}</span>
      </button>
    </li>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-4 items-start">

      {/* ── THE LIST ──────────────────────────────────────────────────────────────────────────── */}
      <Card className="p-3 space-y-2">
        <Input label="Search" value={search} onChange={setSearch} placeholder="Place, area or postcode"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        {adding ? (
          <div className="space-y-2 pt-1">
            <Input label="Place name" value={newName} onChange={setNewName} placeholder="Lavenham Village Hall" />
            <div className="flex gap-2">
              <Btn label="Add" size="sm" onClick={addPlace} disabled={!newName.trim()} />
              <Btn label="Cancel" colour="ghost" size="sm" onClick={() => { setAdding(false); setNewName('') }} />
            </div>
          </div>
        ) : (
          <Btn label="+ New place" colour="slate" size="sm" onClick={() => setAdding(true)} />
        )}

        {places.length === 0 ? (
          // ⚠️ NAMES THE CAUSE. An empty list almost always means an empty schedule, not a broken
          // feature, so it says so rather than offering a bare "no places".
          <p className="text-xs text-slate-400 px-1 py-3">
            No places yet. Places appear here from your schedule, or add one above.
          </p>
        ) : (
          <>
            {favourites.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 pt-1">Favourites</p>
                <ul className="divide-y divide-slate-100">{favourites.map(row)}</ul>
              </div>
            )}
            {others.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 pt-2">
                  {favourites.length > 0 ? 'Other places' : 'Places'}
                </p>
                <ul className="divide-y divide-slate-100">{others.map(row)}</ul>
              </div>
            )}
            {favourites.length === 0 && others.length === 0 && (
              <p className="px-1 py-3 text-xs text-slate-400">Nothing matches “{search.trim()}”.</p>
            )}
          </>
        )}

        {/* 🔴 THE WAY BACK. Without this a hidden place is unreachable and hiding is a one-way door. */}
        {hiddenCount > 0 && (
          <button onClick={() => setShowHidden(h => !h)}
            className="w-full text-left text-xs font-bold text-slate-500 hover:text-slate-700 px-1 pt-2 border-t border-slate-100">
            {showHidden ? 'Hide hidden places' : `Show hidden places (${hiddenCount})`}
          </button>
        )}
      </Card>

      {/* ── THE DETAIL ────────────────────────────────────────────────────────────────────────── */}
      {selected ? (
        <PlaceDetail
          key={selected.id}
          place={selected}
          places={places}
          api={api}
          showToast={showToast}
          onChanged={(id) => reload(id ?? selected.id)}
        />
      ) : (
        <Card className="p-8 text-center">
          <p className="text-sm text-slate-400">Pick a place to see its events.</p>
        </Card>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE DETAIL
// ════════════════════════════════════════════════════════════════════════════════════════════════
function PlaceDetail({ place, places, api, showToast, onChanged }: {
  place: Place
  places: Place[]
  api: Api
  showToast: (msg: string, kind?: 'success' | 'error') => void
  onChanged: (keepId?: string | null) => void
}) {
  // ⚠️ LOCAL DRAFT STATE, SAVED ON BLUR. `key={selected.id}` remounts this when the selection changes,
  // so a draft can never leak from one place onto another.
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
      // ⚠️ SELECT THE TARGET, not the merged place: the one the operator is now looking at is the one
      // that has the events. The merged row leaves the list in the same reload.
      onChanged(r?.into_id ?? null)
    } catch (e: unknown) { showToast(msgOf(e, 'Couldn’t merge those places'), 'error') }
    finally { setBusy(false) }
  }

  /* 🔴 YOU CANNOT MERGE INTO A PLACE THAT IS ITSELF GONE, or into this one. The server refuses all
   * three cases through the shared `mergeRefusal`; the list simply does not offer them, so the
   * refusal is a backstop rather than the thing the operator meets. */
  const mergeTargets = places
    .filter(p => p.id !== place.id && !p.is_hidden && !p.merged_into_id)
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' }))

  const nextLine = place.next_event_date
    ? `Next: ${shortDay(place.next_event_date)}${timeRange(place.next_start_time, place.next_end_time) ? ` · ${timeRange(place.next_start_time, place.next_end_time)}` : ''}`
    : 'Next: nothing booked'
  const lastLine = place.last_event_date
    ? `Last: ${shortDay(place.last_event_date)}${timeRange(place.last_start_time, place.last_end_time) ? ` · ${timeRange(place.last_start_time, place.last_end_time)}` : ''} · ${place.traded_last_year} time${place.traded_last_year === 1 ? '' : 's'} in the last year`
    : 'Last: never'

  return (
    <div className="space-y-4 min-w-0">
      {/* CARD 1 — the identity */}
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

      {/* CARD 2 — events here */}
      <Card className="p-4 space-y-1">
        <p className="text-sm font-black text-slate-900 mb-1">Events here</p>
        <p className="text-sm text-slate-700">{nextLine}</p>
        <p className="text-sm text-slate-500">{lastLine}</p>
      </Card>

      {/* THE THREE CONTROLS */}
      <div className="flex flex-wrap gap-2">
        <Btn
          label={place.is_favourite ? '★ Favourite' : '☆ Favourite'}
          colour={place.is_favourite ? 'orange' : 'ghost'}
          size="sm" loading={busy}
          onClick={() => setFlag({ is_favourite: !place.is_favourite }, place.is_favourite ? 'Removed from favourites' : 'Added to favourites')}
        />
        <Btn label="Merge into another place" colour="ghost" size="sm"
          disabled={mergeTargets.length === 0} onClick={() => setMerging(m => !m)} />
        {place.is_hidden || place.merged_into_id ? (
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
