'use client'
// components/manage/SchedulePlaces.tsx
// The places a truck trades at: the list, the detail, and the hook that loads and seeds them.
//
// 🔴 WHAT THIS FILE IS NOW. It was a Schedule sub-tab pane. The Places pill is gone (3 October 2026):
// the list lives in the Add event modal's left pane, and the detail lives behind "Tidy up places"
// inside that same modal. So this file exports PIECES rather than a screen —
//   `usePlaces`     the load + seed + optimistic favourite, used by both surfaces
//   `PlaceList`     the search box, FAVOURITES / ALL PLACES, the star button
//   `PlaceDetail`   the five fields, Events here, and the two controls (Favourite, Hide/Restore)
//   `TidyUpPlaces`  list + detail + a way back
// — so the modal and Tidy up share the logic instead of each having a copy of it.
//
// ── 🔴 WHY A HOOK AND NOT A SECOND FETCH ──────────────────────────────────────────────────────────
// `sg_places` SEEDS before it answers. Two components each calling it would seed twice on one screen
// and race each other's reads. One hook, one owner of the list, and the star writes through it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Card, Input, Spinner } from '@/components/manage/primitives'
/* ⛔ `FeatureGate`, `Plan`, `WEEKLY_POST_PLAN_REFUSAL` AND `WeeklyPostApp` WERE IMPORTED HERE. All four
 * belonged to `WeeklyPostPane`, which moved to components/manage/SocialPosts.tsx — see the tombstone
 * below. Nothing else in this file is gated or knows about a plan. */
import { placeWhenLine, timeRangeLabel } from '@/lib/schedule-graphics/places'

export interface Place {
  id: string
  venue_id: string | null
  /** The normalised venue name. Carried so the client can use the SHARED `placeForEvent` rule rather
   *  than a weaker two-identity copy of it — see the note at the API's `name_key` line. */
  name_key: string
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
  /* ══ 🔴 THE PLACES TAB'S OWN FIELDS (20261015, re-read 5 October 2026) ═══════════════════════════
   * All of them come from `sg_places`. ⚠️ EVERY ONE IS OPTIONAL, and absent is the honest
   * pre-migration answer: nothing stored, no post picture, no count. The Add event picker and Tidy up
   * read this same type and neither uses them, so nothing else had to change.
   *
   * ══ ⛔ "Automatic" WAS A CONTROL, AND IT IS GONE (5 October 2026) ═════════════════════════════════
   * It was the dropdown's first option — three states where an operator only ever wants one answer. The
   * Places tab is a PILL ROW now: a place is on exactly one type, and a place nobody has set shows the
   * one the history rule gives, as an ordinary selected pill.
   * 🔴 THE STORAGE DID NOT CHANGE, AND THAT MATTERS WHEN READING THESE THREE FIELDS. "Neither column
   * set" is still a real row state — it is what every place is until somebody presses a pill — and it
   * still means "the rule decides". What went is any way for the screen to SAY that, or to write it. */
  /** The STORED type for this place. null/absent ⇒ nothing stored, so the rule decides (§70.3).
   *  ⚠️ READ **AFTER** `usual_type_is_standard`, which outranks it. See that field. */
  usual_event_type_id?: string | null
  /* ══ 🔴 "STORED AS STANDARD" IS ITS OWN STATE (20261016) ═════════════════════════════════════════
   * ⛔ IT AND "NOTHING STORED" LOOKED IDENTICAL ON THE WIRE, and that was the bug: Standard is the
   * ABSENCE of a type (Standard IS the truck's own settings, §70.2), so there was no id to send and
   * choosing it wrote the same `null` that already meant "nothing stored". Two states, one encoding.
   * 20261016 adds the boolean. */
  /** TRUE ⇒ "always plain Standard here", a FIXED answer — as opposed to an unset row, whose answer
   *  changes as the truck trades. ⚠️ IT OUTRANKS `usual_event_type_id` — the same order the routes
   *  apply, so a row carrying both reads the same way on the screen and on the server. */
  usual_type_is_standard?: boolean
  /** 🔴 WHAT THE HISTORY RULE GIVES THIS PLACE RIGHT NOW, from the server's own rule — the SAME
   *  function Add event's pre-selection uses. It is what the pill row selects when nothing is stored,
   *  which is what makes the pill and Add event's choice the same answer.
   *  ⚠️ null ⇒ the history could not be read (or the migration is absent), and the pill row falls back
   *  to Standard — which is what the rule itself returns with no history, so the fallback is the rule's
   *  own answer rather than a guess. */
  usual_automatic_type_id?: string | null
  /** ⚠️ THE NAME IS NO LONGER RENDERED ANYWHERE. It existed to fill in "Automatic (Market)"; the pill
   *  row names the type from the truck's own types list instead, which is also where its colour comes
   *  from. Still returned, because `sg_places` reads it for free alongside the id. */
  usual_automatic_type_name?: string | null
  /** The place's POST picture (`truck_places.event_bg_path`) — the one the single-event poster draws,
   *  and the one "Picture for posts" in the Places tab uploads.
   *  ⛔ THERE IS NO LONGER ANY OTHER KIND. `place_pictures` — the per-place reference library — was
   *  deleted on 5 October 2026; the table is still in the database and is read by nothing. */
  event_bg_path?: string | null
  event_bg_width?: number | null
  event_bg_height?: number | null
  /** Lifetime traded events here — the "used N times" in the detail pane's heading.
   *  ⚠️ `traded_last_year` ABOVE IS NOW RENDERED NOWHERE. It was the "· N times in the last year"
   *  clause in the deleted "Events here" card. Still on the payload; nothing reads it. */
  used_count?: number
}

/* ⛔ `PlacePicture` AND `PlaceEventRow` WERE DECLARED HERE (5 October 2026). They shaped the rows of
 * "Your own pictures" and of "Events here" — both panes, and the five `/api/manage` actions behind them,
 * are deleted. See the tombstone in app/api/manage/route.ts for why.
 * ⚠️ `Place.event_bg_path` IS A DIFFERENT THING AND STAYS. It is the ONE picture that reaches a poster,
 * it lives on `truck_places`, and "Picture for posts" in the Places tab uploads it through
 * /api/weekly-post. `place_pictures`, the table the deleted pane wrote to, is untouched in the database
 * and is now read by nothing. */

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

  /* ══ 🔴 THE ENDLESS SPINNER ON SCHEDULE › PLACES — THE CAUSE AND THE FIX (5 October 2026) ═════════
   * REPORTED: on localhost, Pizza Kitchen, Schedule › Places showed a spinner for ever.
   *
   * 🔴 THE CAUSE WAS THIS EFFECT'S DEPENDENCY LIST MEETING ITS OWN IN-FLIGHT GUARD.
   * `api` is declared as a plain function in the manage page's component body, so it is a NEW
   * REFERENCE ON EVERY RENDER — and it was in the deps. The page re-renders constantly (polling, a
   * dozen pieces of state), so every render:
   *     1. ran the cleanup, setting `cancelled = true` for the run that was in flight;
   *     2. re-ran the effect, which saw `inFlight.current === true` and RETURNED EARLY;
   *     3. let the original request resolve into a `cancelled` closure, so `setPlaces` never fired;
   *     4. cleared `inFlight` in `finally`.
   * `places` therefore stayed `null` — which IS the loading state — and the next render started the
   * whole cycle again. An endless spinner **and** a request storm, neither of which showed an error,
   * because nothing ever threw.
   * ⚠️ THE ADD EVENT MODAL GOT AWAY WITH IT because it is open for seconds at a time; the TAB sits
   * there while the page does everything else, which is why the tab is where it was seen.
   *
   * ✅ THREE CHANGES, AND EACH CLOSES A DIFFERENT HALF:
   *   • `api` IS HELD IN A REF and is OUT of the deps. A function identity is not a reason to re-run a
   *     fetch; what the effect depends on is "am I enabled" and "has somebody asked for a reload".
   *     (The page's own `api` is also wrapped in `useCallback` now, which fixes the churn at source —
   *     but this hook must not depend on a caller remembering to.)
   *   • `cancelled` NOW ONLY SUPPRESSES A SET AFTER A REAL TEARDOWN — unmount, or a reload that
   *     superseded this run — tracked by a run id rather than by a closure flag that any re-render
   *     could flip.
   *   • AND A RUN THAT SETTLES WITHOUT RESOLVING THE LIST IS AN ERROR, not a spinner. See `settled`.
   */
  const apiRef = useRef(api)
  useEffect(() => { apiRef.current = api }, [api])
  /** Which run is current. A resolved fetch writes only if its id is still the live one. */
  const runId = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const mine = ++runId.current
    inFlight.current = true
    ;(async () => {
      try {
        const r = (await apiRef.current('sg_places')) as PlacesResponse
        /* ⚠️ THE ID, NOT A BOOLEAN. A later run supersedes this one; a mere re-render does not. */
        if (runId.current !== mine) return
        setPlaces(r.places ?? [])
        setError(null)
      } catch (e: unknown) {
        if (runId.current !== mine) return
        /* ⚠️ `[]` AS WELL AS THE MESSAGE. The Add event form must stay usable with no places at all,
         * so the list resolves to empty rather than staying in a spinner for ever. */
        setPlaces([]); setError(msgOf(e, 'Couldn’t load places.'))
      } finally {
        if (runId.current === mine) inFlight.current = false
      }
    })()
    /* ⛔ NO CLEANUP FLAG. The old `return () => { cancelled = true }` is what made a re-render look
     * like an unmount. A superseded run is detected by `runId`, which only a NEW RUN changes. */
  }, [enabled, reloadKey])

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
  showHidden = false, starError, footer, emptyHint, typeLabelFor, hiddenSection = false,
}: {
  places: Place[]
  selectedId?: string | null
  onSelect: (p: Place) => void
  onFavourite: (p: Place, next: boolean) => void
  search: string
  onSearch: (v: string) => void
  /**
   * ⚠️ `showHidden` IS NOW ONLY FOR "Tidy up places" (5 October 2026). The PLACES TAB passes
   * `hiddenSection` instead and never hides a place from view — see that prop. Tidy up keeps the old
   * behaviour, byte for byte, because its list is a picker and a hidden place is not a target.
   */
  showHidden?: boolean
  starError?: string | null
  footer?: React.ReactNode
  emptyHint?: string
  /**
   * ── 🔴 THE PLACE'S EVENT TYPE, ON THE RIGHT OF ITS ROW (5 October 2026) ─────────────────────────
   * Returns the label to draw, or null for none. ⚠️ A FUNCTION, NOT A FIELD ON `Place`: the label
   * needs the truck's TYPE LIST to turn a stored id into a name and a colour, and this component is
   * shared with Tidy up — which has no type list and passes nothing, so its rows are unchanged.
   */
  typeLabelFor?: (p: Place) => React.ReactNode
  /**
   * ── 🔴 HIDDEN PLACES ARE NOT REMOVED FROM VIEW (5 October 2026, Dominic) ────────────────────────
   * True ⇒ hidden and merged places appear at the BOTTOM, under a "HIDDEN PLACES" heading, greyed,
   * with one line saying what that means and how to get one back.
   * ⛔ IT REPLACES THE "N hidden places · Show" FOOTER, which was a control an operator had to find
   * before they could discover that anything was there at all. A place an operator hid is still a
   * place they own; a list that silently omits it reads as "it is gone".
   * ⚠️ SEARCH COVERS THEM TOO, in their own section — so looking for a place finds it whether it is
   * hidden or not, which is the only behaviour that makes the section useful.
   */
  hiddenSection?: boolean
}) {
  const { favourites, others, hidden } = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matches = (p: Place) => !q
      || p.name.toLowerCase().includes(q)
      || String(p.short_name ?? '').toLowerCase().includes(q)
      || String(p.area ?? '').toLowerCase().includes(q)
      || String(p.postcode ?? '').toLowerCase().includes(q)
    const byName = (a: Place, b: Place) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' })
    /* ⚠️ `hiddenSection` MAKES RETIRED PLACES THEIR OWN GROUP rather than mixing them in: with it on,
     * the live groups exclude them and `hidden` collects them. `showHidden` (Tidy up's) still mixes
     * them into `others`, which is what that screen has always done. */
    const live = places.filter(p => ((hiddenSection ? !isRetired(p) : (showHidden || !isRetired(p)))) && matches(p))
    return {
      favourites: live.filter(p => p.is_favourite).sort(byName),
      others: live.filter(p => !p.is_favourite).sort(byName),
      hidden: hiddenSection ? places.filter(p => isRetired(p) && matches(p)).sort(byName) : [],
    }
  }, [places, search, showHidden, hiddenSection])

  const row = (p: Place, greyed = false) => (
    <li key={p.id} className={`flex items-stretch gap-1 ${greyed ? 'opacity-55' : ''}`}>
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
        {/* 🔴 THE NAME AND THE TYPE ON ONE LINE, with the name flexible and the type fixed. The name
            truncates; the type does not, because a half-written type name is worse than a truncated
            venue — the venue has its own sub-line underneath and the type has nothing else. */}
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
            {p.name}
            {isRetired(p) && (
              <span className="ml-1.5 text-xs font-bold text-slate-400">{p.merged_into_id ? '· merged' : '· hidden'}</span>
            )}
          </span>
          {typeLabelFor?.(p)}
        </span>
        <span className="block text-xs text-slate-400 truncate">{placeSubLine(p)}</span>
      </button>
    </li>
  )

  /* ⚠️ WITH `hiddenSection` ON, A TRUCK WHOSE ONLY PLACES ARE HIDDEN HAS SOMETHING TO SHOW — so
   * "nothing at all" must count them, or the hidden section would be suppressed by the empty hint. */
  const nothingAtAll = hiddenSection
    ? places.length === 0
    : places.filter(p => showHidden || !isRetired(p)).length === 0

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
        ) : favourites.length === 0 && others.length === 0 && hidden.length === 0 ? (
          // ⚠️ ONLY REACHABLE WITH A SEARCH TYPED — `nothingAtAll` covers the no-places case above, so
          // this can never be the thing an operator sees on opening the modal (bug 2).
          <p className="text-xs text-slate-400 py-3">Nothing matches “{search.trim()}”.</p>
        ) : (
          <>
            {favourites.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 pt-1 pb-0.5">Favourites</p>
                <ul className="divide-y divide-slate-100">{favourites.map(p => row(p))}</ul>
              </div>
            )}
            {others.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 pt-3 pb-0.5">All places</p>
                <ul className="divide-y divide-slate-100">{others.map(p => row(p))}</ul>
              </div>
            )}
            {/* ── 🔴 HIDDEN PLACES, AT THE BOTTOM, GREYED (5 October 2026) ─────────────────────────
              * ⚠️ THE SENTENCE IS TWO FACTS AND NOTHING ELSE: what hiding does (keeps them out of Add
              * event) and how to undo it (open one). The old footer said how MANY there were, which is
              * the one thing the section itself already shows. */}
            {hidden.length > 0 && (
              <div data-hidden-places>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 pt-3 pb-0.5">Hidden places</p>
                <p className="px-1 pb-1 text-[11px] leading-relaxed text-slate-400">{HIDDEN_PLACES_NOTE}</p>
                <ul className="divide-y divide-slate-100">{hidden.map(p => row(p, true))}</ul>
              </div>
            )}
          </>
        )}
      </div>

      {footer && <div className="shrink-0 border-t border-slate-100 p-3">{footer}</div>}
    </div>
  )
}

/**
 * ── 🔴 WHAT "HIDDEN" MEANS, IN TWO FACTS ─────────────────────────────────────────────────────────
 * ⛔ IT DOES NOT SAY HOW MANY THERE ARE. The old footer did — "3 hidden places · Show" — and the count
 * is the one thing the section itself already shows. What an operator cannot see is the CONSEQUENCE
 * (they are out of Add event) and the WAY BACK (open one), which is what this says.
 */
const HIDDEN_PLACES_NOTE = 'Hidden places stay out of Add event. Open one to restore it.'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE DETAIL — reused by Tidy up, logic unchanged
// ════════════════════════════════════════════════════════════════════════════════════════════════
export function PlaceDetail({ place, api, showToast, onChanged }: {
  place: Place
  /* ⛔ `places` IS GONE WITH THE MERGE BUTTON (October 2026). It was here only to build the list of
   * merge targets; keeping an unused prop would have the next reader looking for what reads it. The
   * SERVER's merge is untouched — see the note above `doMerge`'s removal in
   * docs/event-post-per-place-report.md §Part 2.3. */
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

  /* ── ⛔ "MERGE INTO ANOTHER PLACE" IS GONE FROM THIS SCREEN (October 2026) ────────────────────
   * The button, its target list and its confirm card have been removed on instruction. What has NOT
   * been removed is the server: `sg_merge_place` in app/api/manage/route.ts still works, and
   * `merged_into_id` is still resolved by `resolvePlaceMerge`/`placeForEvent`, so every row merged
   * before today keeps behaving exactly as it did — its events still resolve to the target, and
   * "Restore this place" still un-merges it (`is_hidden: false` clears `merged_into_id`).
   * ⚠️ `sg_merge_place` NOW HAS NO CALLER IN THE APP. It is listed as unreachable in
   * docs/event-post-per-place-report.md rather than deleted, because deleting it would also delete the
   * only way back for a truck who needs a merge undone by hand.
   */

  /* ⛔ `nextLine` / `lastLine` WENT WITH THE "Events here" CARD (5 October 2026). They were two string
   * expressions over fields `sg_places` already returns — no read of their own — and the LIST still
   * shows the same facts through `placeSubLine`, which is where an operator looks for them. */

  return (
    <div className="space-y-4 min-w-0">
      {/* ── 🔴 THE TWO LONG FIELDS GET A ROW EACH ──────────────────────────────────────────────────
        * "Name on posts" and "Address" are the two that hold a long value — a venue name like
        * "The Bull & Butcher, Wickhambrook Green" is comfortably past 40 characters, and sharing a row
        * put it in a half-width box where the end of the name scrolled out of sight while being typed.
        * They are `sm:col-span-2`, so from the first breakpoint upwards each has the full width.
        * ⚠️ THE OTHER THREE ARE SHORT AND STAY IN PAIRS. A short name, an area and a postcode are all
        * well under a line; giving each its own row would make a five-field card scroll for no reason. */}
      <Card className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* ══ 🔴 THE TWO NAME LABELS WERE THE WRONG WAY ROUND (decided 6 October 2026, Dominic) ═════
          * ⛔ `name` WAS LABELLED "Name on posts" AND IT IS NOT THE FIELD A POST PRINTS.
          * `locationName()` in lib/weekly-post/week-data.ts reads `short_name` FIRST and falls back to
          * `name` — so filling in the field labelled "Short name" silently stopped the poster printing
          * the field labelled "Name on posts". The label was a lie about the one thing it names.
          * 🔴 LABELS ONLY. No column, no data, no save path changed: `saveField('name', …)` and
          * `saveField('short_name', …)` are untouched, and `scripts/places-tab.cjs` §4 now asserts
          * which label is bound to which field so they cannot drift apart again.
          * ⚠️ THE PLACE DESIGN EDITOR'S "Name on posts" IS BOUND TO `short_name` AND STAYS THAT WAY —
          * it was right; this card was the one that disagreed with the renderer.
          * ══ 🔴 AND "Name on posts" IS **"Venue name"** SINCE 9 OCTOBER 2026 ════════════════════════
          * ⛔ A LABEL ONLY, ON THE SAME FIELD. The old wording was accurate and unhelpful: it told the
          * operator WHERE the value goes rather than WHAT it is, and with the social screen's own copy
          * of the field now removed, this card is the one editor — so it has to name the thing. ⚠️ The
          * poster's own item is called "Venue" too, and "Area" beside it is the field below. One word
          * for one thing, on both screens. */}
        <div className="sm:col-span-2 min-w-0">
          <Input label="Full name" value={name} onChange={setName}
            onBlur={() => saveField('name', name, place.name)} />
        </div>
        <div className="sm:col-span-2 min-w-0">
          <Input label="Address" value={address} onChange={setAddress}
            onBlur={() => saveField('address', address, place.address)} />
        </div>
        <Input label="Venue name" value={shortName} onChange={setShortName}
          onBlur={() => saveField('short_name', shortName, place.short_name)}
          hint="Leave blank to use the full name." />
        <Input label="Area" value={area} onChange={setArea}
          onBlur={() => saveField('area', area, place.area)} />
        <Input label="Postcode" value={postcode} onChange={setPostcode}
          onBlur={() => saveField('postcode', postcode, place.postcode)}
          autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
      </Card>

      {/* ══ ⛔ THE "Events here" CARD AND THE "Favourite" BUTTON ARE DELETED (5 October 2026) ═══════
        * • **Events here** — "Next: …" and "Last: … · N times in the last year" — went because the
        *   Places tab had TWO of them: this card, and a second one at the bottom of the page listing
        *   the actual rows. Two boxes under one heading, on one screen, is the kind of duplication
        *   that makes a reader doubt both. `sg_place_events`, which only the other one used, is
        *   deleted with it; these three lines needed no read at all — they are fields on the row.
        *   ⚠️ `next_event_date` / `last_event_date` / `traded_last_year` ARE STILL RETURNED by
        *   `sg_places` and are still read by `placeSubLine` in the LIST, which is where an operator
        *   actually looks for "when was I last here".
        * • **Favourite** — the star in the list already does it, on every row, without opening a
        *   place. Two controls for one boolean, and the star is the one an operator finds.
        *   ⚠️ `onFavourite` / `setFavourite` / the star are untouched.
        * ⛔ BOTH REMOVALS REACH "Tidy up places", WHICH SHARES THIS COMPONENT, and that is correct:
        *   Tidy up's list carries the same star, and its job is naming and merging places rather than
        *   reading their diary. */}
      <div className="flex flex-wrap gap-2">
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
              <PlaceDetail key={selected.id} place={selected} api={api}
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

/* ══ ⛔ `WeeklyPostPane` WAS HERE (6 October 2026) ════════════════════════════════════════════════
 * It was the Social posts section's whole mount: a `FeatureGate` on `schedule_graphics` around
 * `WeeklyPostApp`. The section is `components/manage/SocialPosts.tsx` now — two areas and six boxes —
 * and it keeps the gate, per BOX rather than around the page, because the brief asks for the locked
 * state inside the weekly box.
 * ⚠️ `WEEKLY_POST_PLAN_REFUSAL` IS STILL THE ONE SENTENCE. It moved with the gate, not with a copy.
 */
