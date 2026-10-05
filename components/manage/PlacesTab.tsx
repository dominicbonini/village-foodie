'use client'

// components/manage/PlacesTab.tsx — Schedule › Places.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 TWO PANES, AND NO SECOND IMPLEMENTATION OF ANYTHING
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// The list on the left is `PlaceList`; the load, the seed and the optimistic favourite are
// `usePlaces`; every write goes through the SAME `sg_*` actions the Add event modal's "Tidy up
// places" uses. This file composes those pieces and adds the four things the tab has that Tidy up
// does not: the pinned usual type, the pictures pane, "Events here", and the thumbnail in the list.
//
// ⛔ "Tidy up places" IN ADD EVENT STAYS AND IS NOT A COPY. It calls `TidyUpPlaces`, which calls
// `PlaceList` and `PlaceDetail` — the same components, the same hook, the same actions. The brief is
// explicit about that, and it is why this file is a composition rather than a screen with its own
// fetches: two owners of `sg_places` would seed twice on one screen and race each other's reads.
//
// ⚠️ THE DENSITY IS THE EVENT TYPES GRID'S. Same label weights (regular, 14px), same section
// headings (bold small caps), same 36px control rows, and labels WRAP rather than truncate — the
// rules §4 established, so the two Schedule screens read as one product.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Card, Input, Select, Spinner } from '@/components/manage/primitives'
import { SUBCARD_HEADING } from '@/lib/ui-tokens'
import {
  usePlaces, PlaceList, PlaceDetail, shortDay,
  type Api, type Place, type PlacePicture, type PlaceEventRow,
} from './SchedulePlaces'
import { PRIVATE_CHIP } from '@/lib/private-events/copy'
import type { Plan } from '@/lib/features'
import { canAccess } from '@/lib/features'

/** 10MB, matching `place_pictures_bytes_sane` in 20261015 and the route's own check. */
const MAX_PLACE_PICTURE_BYTES = 10 * 1024 * 1024

const msgOf = (e: unknown, fallback: string): string => {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  return m || fallback
}

/** "1.4 MB" / "860 KB". ⚠️ Decimal, because that is what an operator's file manager shows them. */
function sizeLabel(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1000))} KB`
}

/** A type the pin may point at, in the grid's order. */
export interface TypeChoice { id: string; name: string; kind?: 'custom' | 'private' }

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE USUAL EVENT TYPE
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ── 🔴 "Automatic (<type> — last used here)" IS THE FIRST OPTION, AND IT IS TODAY'S RULE ──────────
 *
 * NULL means Automatic, and Automatic is the EXISTING behaviour: the newest event at this place
 * supplies the type (§70.3). So the first option is not a special mode — it is what every place does
 * now, named so an operator can choose to stop doing it.
 *
 * 🔴 THE OPTION NAMES WHAT AUTOMATIC CURRENTLY RESOLVES TO. "Automatic" alone tells the operator
 * nothing about what will come up when they add an event here; "Automatic (Market — last used here)"
 * tells them, and makes pinning an informed choice rather than a guess.
 * ⚠️ AND IT SAYS "Standard" WHEN THERE IS NO HISTORY, because that is what the rule returns — not a
 * blank, which would read as "we don't know".
 *
 * ⛔ PRIVATE IS IN THE LIST, AND THAT IS DELIBERATE (confirmed 5 October 2026). A wedding venue that
 * only ever has private bookings should come up as Private. It is not a silent consequence: Add event
 * opens the purple panel with the full explanation, so the operator sees it before saving — and the
 * automatic rule already behaves this way, because a place whose last event was private pre-selects
 * Private anyway. The pin only makes that deliberate.
 *
 * ⚠️ A PRO TRUCK SEES STANDARD AND PRIVATE ONLY. Custom types are `event_types` (Max); the Private
 * type is `private_events` (Pro). The filter is on the key, not on the plan name.
 */
function UsualTypeSelect({
  place, types, canTypes, canPrivate, disabled, onSave,
}: {
  place: Place
  types: TypeChoice[]
  canTypes: boolean
  canPrivate: boolean
  disabled?: boolean
  /** `null` ⇒ Automatic · `'standard'` ⇒ pinned to Standard · a uuid ⇒ pinned to that type. */
  onSave: (typeId: string | null) => void
}) {
  /* ══ 🔴 "Automatic (…)" NAMES WHAT IT ACTUALLY RESOLVES TO (5 October 2026) ═════════════════════
   * It used to read "Automatic (Standard — last used here)" for EVERY place, always: the component
   * took an `automaticName` prop whose only caller returned the literal 'Standard', because
   * `sg_places` did not return the last event's type. For a wedding venue whose last three bookings
   * were Private that parenthetical was simply false — on the screen whose job is to say what will
   * happen.
   * 🔴 THE ROUTE RESOLVES IT NOW, with the SAME function the Add event pre-selection uses
   * (`readPlaceTypeHistory`), and sends `usual_automatic_type_name` per place. One rule, one answer.
   * ⚠️ A null NAME MEANS THE HISTORY READ FAILED (or the migration is absent), and the option then
   * says plain "Automatic" rather than guessing "Standard" — a wrong parenthetical is worse than
   * none, because it is the thing the operator is deciding against. */
  const autoName = place.usual_automatic_type_name
  const options = useMemo(() => {
    const out = [{
      value: '',
      label: autoName ? `Automatic (${autoName} — last used here)` : 'Automatic (what you used last time)',
    }]
    out.push({ value: 'standard', label: 'Standard' })
    for (const t of types) {
      if (t.kind === 'private' ? !canPrivate : !canTypes) continue
      out.push({ value: t.id, label: t.name })
    }
    return out
  }, [types, autoName, canTypes, canPrivate])

  /* ══ 🔴 "Pinned to Standard" IS A REAL, STORED STATE NOW (20261016) ═════════════════════════════
   * ⛔ IT WAS NOT. Standard is the ABSENCE of a type — Standard IS the truck's own settings (§70.2) —
   * so there was no id to store, and choosing Standard wrote `null`, which `usual_event_type_id`
   * already uses for Automatic. The operator picked Standard and watched the control come back saying
   * Automatic, with nothing on screen to explain it.
   * 🔴 `truck_places.usual_type_is_standard` (20261016) is that second column. The two states are
   * genuinely different: Automatic's answer CHANGES as the truck trades; Standard's is FIXED.
   * ⚠️ THE BOOLEAN IS READ FIRST, matching the server's resolution order
   * (`is_standard ? Standard : (id ?? the rule)`), so a row that somehow carries both reads as
   * Standard on the screen and on the server rather than differently on each. */
  const value = place.usual_type_is_standard === true
    ? 'standard'
    : (place.usual_event_type_id ?? '')

  /** The sentence under the control — one per state, and each says what Add event will do. */
  const note = place.usual_type_is_standard === true
    ? 'Add event will pre-select Standard here, whatever you used last time.'
    : place.usual_event_type_id
      ? 'Add event will pre-select this type here.'
      : autoName
        ? `Add event follows what you used last time — ${autoName} today.`
        : 'Add event follows what you used last time here.'

  return (
    <div className="min-w-0">
      <label className="block text-xs font-bold text-slate-600 mb-1">Usual event type</label>
      <Select
        className="w-full"
        ariaLabel={`Usual event type for ${place.name}`}
        value={value}
        disabled={disabled}
        options={options}
        /* ⚠️ `''` IS AUTOMATIC AND BECOMES null; `'standard'` TRAVELS AS ITSELF. It used to be mapped
         * to null here, which is what made the two states indistinguishable on the wire. */
        onChange={v => onSave(v === '' ? null : v)}
      />
      <p className="mt-1 text-[11px] text-slate-500">{note}</p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PICTURES FOR THIS PLACE
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ── ⛔ TWO KINDS OF PICTURE, AND THE DIFFERENCE IS THE WHOLE PANE ─────────────────────────────────
 *
 *  1. THE POST PICTURE — `truck_places.event_bg_path`, ONE per place, with text positions placed on
 *     it (`event_layout`). This is what a single-event poster for this place draws. Replace and Text
 *     positions are the EXISTING flows, in Social posts › Single event; this pane links to them
 *     rather than re-implementing them, because the text-position editor is a drag surface whose
 *     pointer handling took three fixes to get right (its own file says so).
 *
 *  2. THE EXTRA PICTURES — `place_pictures`, as many as they like, for the truck's OWN use: a photo
 *     of the pitch, a copy of the venue's artwork, a map of where to park. ⛔ THEY NEVER REACH A
 *     POSTER, and `scripts/places-tab.cjs` proves it by searching the poster code for the table.
 *
 * 🔴 THE PANE SAYS WHICH IS WHICH, IN WORDS. Two galleries of thumbnails with no explanation is how
 * an operator uploads a parking map and then wonders why it is behind Friday's dates.
 */
function PicturesPane({
  place, api, showToast, disabled,
}: {
  place: Place
  api: Api
  showToast: (msg: string, kind?: 'success' | 'error') => void
  disabled?: boolean
}) {
  const [pics, setPics] = useState<PlacePicture[] | null>(null)
  const [available, setAvailable] = useState(true)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  /* ⚠️ `reloadKey` RATHER THAN CALLING A `useCallback` FROM THE EFFECT. A `void load()` in the effect
   * body is a synchronous setState during commit, which `react-hooks/set-state-in-effect` refuses and
   * which causes a second render on every mount. The effect owns the fetch and a counter re-runs it;
   * the same shape `usePlaces` already uses for its own reload. */
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const r = await api('sg_place_pictures', { placeId: place.id }) as
          { pictures?: PlacePicture[]; available?: boolean }
        if (!live) return
        setPics(r.pictures ?? [])
        setAvailable(r.available !== false)
      } catch {
        /* ⚠️ AN EMPTY PANE, NOT AN ERROR CARD. The rest of the Places tab works without this. */
        if (live) setPics([])
      }
    })()
    return () => { live = false }
  }, [api, place.id, reloadKey])

  /* ── 🔴 THE UPLOAD IS THREE STEPS, AND THE ORDER IS THE SAFE ONE ────────────────────────────────
   * 1. ask the server for a signed URL — the PATH is built server-side and starts with the truck id,
   *    because a signed upload URL is authority over exactly the path it names;
   * 2. PUT the bytes straight to storage, so a 10MB file never passes through a route handler;
   * 3. tell the server to record it — and the server re-reads the REAL bytes from storage rather than
   *    trusting the size the browser reported.
   * ⚠️ THE CLIENT-SIDE SIZE CHECK IS A COURTESY, not the guard: it saves a doomed 30MB upload. The
   * guard is in the route and in the table's CHECK. */
  const upload = async (file: File) => {
    if (file.size > MAX_PLACE_PICTURE_BYTES) {
      showToast('Pictures must be under 10MB.', 'error'); return
    }
    const ext = /\.jpe?g$/i.test(file.name) ? 'jpg' : 'png'
    setBusy(true)
    try {
      const u = await api('sg_place_picture_url', { placeId: place.id, ext }) as { uploadUrl: string; path: string }
      const put = await fetch(u.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'image/png' } })
      if (!put.ok) throw new Error('The upload failed.')
      await api('sg_place_picture_save', { placeId: place.id, path: u.path, fileName: file.name })
      reload()
      showToast('Picture added', 'success')
    } catch (e: unknown) {
      showToast(msgOf(e, 'Couldn’t add that picture.'), 'error')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = async (pic: PlacePicture) => {
    /* ⚠️ CONFIRMED, BECAUSE IT DELETES A FILE. The operator may have no other copy of it. */
    if (!window.confirm(`Remove “${pic.file_name}”? This deletes the picture.`)) return
    setBusy(true)
    try {
      await api('sg_place_picture_remove', { id: pic.id })
      reload()
    } catch (e: unknown) {
      showToast(msgOf(e, 'Couldn’t remove that picture.'), 'error')
    } finally { setBusy(false) }
  }

  return (
    <Card className="p-4 space-y-3">
      <p className={SUBCARD_HEADING}>Pictures for this place</p>

      {/* ── 1 · THE POST PICTURE ───────────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="text-sm text-slate-800">Event post picture</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          The picture a single-event post for this place is drawn on. HatchGrab puts the date, place
          and time on top of it.
        </p>
        <div className="mt-2 flex items-center gap-3">
          {/* ⚠️ A GREY PLACEHOLDER RATHER THAN NOTHING, so the row has the same shape either way. */}
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-600">
              {place.event_bg_path
                ? `Set${place.event_bg_width && place.event_bg_height ? ` · ${place.event_bg_width}×${place.event_bg_height}` : ''}`
                : 'Using the standard design'}
            </p>
            {/* 🔴 LINKS TO THE EXISTING FLOW, NOT A SECOND ONE. Replace and Text positions live in
              * Social posts › Single event, where the drag surface and its three pointer fixes already
              * are. A second editor here would be a second set of those bugs. */}
            <a href="?section=weekly"
              className="mt-1 inline-block text-xs font-semibold text-orange-700 underline hover:no-underline">
              {place.event_bg_path ? 'Replace or move the text' : 'Add a picture for this place'}
            </a>
          </div>
        </div>
      </div>

      {/* ── 2 · THE EXTRA PICTURES ─────────────────────────────────────────────────────────────── */}
      <div>
        <p className="text-sm text-slate-800">Your own pictures</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          {/* ⛔ SAID IN WORDS, EVERY TIME. This is the sentence that stops a parking map ending up
            * behind Friday's dates. */}
          For your reference only — a photo of the pitch, where to park, the venue’s own artwork.
          These are never used on a post.
        </p>

        {!available ? (
          <p className="mt-2 text-[11px] text-slate-400">
            Your own pictures aren’t switched on yet.
          </p>
        ) : pics === null ? (
          <div className="mt-2"><Spinner /></div>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {pics.map(pic => (
              <li key={pic.id} className="flex items-center gap-2.5 rounded-lg border border-slate-200 p-2">
                {/* ⚠️ A SHORT-LIVED SIGNED URL FROM A PRIVATE BUCKET. `next/image` would proxy it
                    through a loader that cannot see the bucket, so this stays a plain <img>. */}
                {pic.url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={pic.url} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                  : <div className="h-12 w-12 shrink-0 rounded bg-slate-100" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-slate-800">{pic.file_name}</p>
                  <p className="text-[11px] text-slate-400">
                    {sizeLabel(pic.bytes)}{pic.width && pic.height ? ` · ${pic.width}×${pic.height}` : ''}
                  </p>
                </div>
                {pic.url && (
                  <a href={pic.url} download={pic.file_name}
                    className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                    Download
                  </a>
                )}
                <button type="button" disabled={disabled || busy} onClick={() => void remove(pic)}
                  className="shrink-0 rounded-lg border border-red-300 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                  Remove
                </button>
              </li>
            ))}

            {/* ── THE ADD TILE ─────────────────────────────────────────────────────────────────── */}
            <li>
              <label className={`flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 p-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 ${
                disabled || busy ? 'pointer-events-none opacity-50' : ''}`}>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
                {busy ? 'Working…' : '+ Add a picture'}
              </label>
              <p className="mt-1 text-[11px] text-slate-400">PNG or JPG, up to 10MB.</p>
            </li>
          </ul>
        )}
      </div>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// EVENTS HERE
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The next upcoming and the recent past at this place.
 * ⚠️ PRIVATE EVENTS ARE SHOWN, WITH A CHIP. This is the truck's own screen; the redaction is a
 * property of the PUBLIC feeds (§73), not of the data. Hiding them here would leave an operator
 * unable to see their own week.
 */
function EventsHere({ place, api }: { place: Place; api: Api }) {
  const [rows, setRows] = useState<PlaceEventRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const r = await api('sg_place_events', { placeId: place.id }) as
          { events?: PlaceEventRow[]; total?: number }
        if (live) { setRows(r.events ?? []); setTotal(r.total ?? 0) }
      } catch { if (live) setRows([]) }
    })()
    return () => { live = false }
  }, [api, place.id])

  const shown = showAll ? (rows ?? []) : (rows ?? []).slice(0, 5)

  return (
    <Card className="p-4">
      <p className={SUBCARD_HEADING}>Events here</p>
      {rows === null ? <div className="mt-2"><Spinner /></div>
        : rows.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nothing booked, and nothing traded yet.</p>
          : (
            <>
              <ul className="mt-2 divide-y divide-slate-100">
                {shown.map(e => (
                  <li key={e.id} className="flex items-center gap-2 py-1.5">
                    <span className="w-24 shrink-0 text-xs font-semibold text-slate-800">{shortDay(e.date)}</span>
                    <span className="min-w-0 flex-1 text-xs text-slate-500">
                      {e.startTime && e.endTime ? `${e.startTime.slice(0, 5)}–${e.endTime.slice(0, 5)}` : '—'}
                    </span>
                    {e.isPrivate && (
                      <span className="shrink-0 rounded-full border border-purple-300 bg-purple-50 px-1.5 py-px text-[10px] font-bold text-purple-700">
                        🔒{PRIVATE_CHIP}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-slate-600">
                      {e.kind === 'upcoming'
                        ? 'Upcoming'
                        : `${e.orders ?? 0} order${(e.orders ?? 0) === 1 ? '' : 's'}`}
                    </span>
                  </li>
                ))}
              </ul>
              {!showAll && total > shown.length && (
                <button type="button" onClick={() => setShowAll(true)}
                  className="mt-2 text-xs font-semibold text-orange-700 underline hover:no-underline">
                  See all {total}
                </button>
              )}
            </>
          )}
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE TAB
// ════════════════════════════════════════════════════════════════════════════════════════════════

export function PlacesTab({
  api, showToast, plan, featureOverrides, trialExpiresAt, types, editable = true,
}: {
  api: Api
  showToast: (msg: string, kind?: 'success' | 'error') => void
  plan: Plan
  featureOverrides: Record<string, boolean> | null
  trialExpiresAt: string | null
  /** The truck's types, in the grid's order (Private first). */
  types: TypeChoice[]
  editable?: boolean
}) {
  const ctl = usePlaces(api, true)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const canTypes = canAccess(plan, 'event_types', featureOverrides ?? {}, trialExpiresAt)
  const canPrivate = canAccess(plan, 'private_events', featureOverrides ?? {}, trialExpiresAt)

  const visible = useMemo(
    () => ctl.places.filter(p => !p.is_hidden && !p.merged_into_id),
    [ctl.places],
  )
  const hiddenCount = ctl.places.length - visible.length

  /* 🔴 THE SELECTION DEFAULTS TO THE FIRST PLACE, so the right pane is never an empty frame on a
   * truck that has places. ⚠️ ONLY WHEN NOTHING IS SELECTED — it must not fight the operator. */
  const selected = useMemo(
    () => ctl.places.find(p => p.id === selectedId) ?? visible[0] ?? null,
    [ctl.places, selectedId, visible],
  )

  /* ⛔ `automaticNameFor` IS GONE (5 October 2026). It returned the literal 'Standard' for every
   * place, because `sg_places` did not report what Automatic resolves to — so the control's
   * parenthetical was a hardcoded word pretending to be an answer. The route resolves it now, with
   * the same function the Add event pre-selection uses, and sends it per place. */

  const addPlace = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      const r = await api('sg_upsert_place', { name }) as { id?: string | null }
      setAdding(false); setNewName('')
      ctl.reload()
      if (r.id) setSelectedId(r.id)
      showToast('Place added', 'success')
    } catch (e: unknown) {
      showToast(msgOf(e, 'Couldn’t add that place.'), 'error')
    }
  }

  /**
   * Save the pin. `null` ⇒ Automatic · `'standard'` ⇒ Standard · a uuid ⇒ that type.
   * 🔴 BOTH FIELDS ARE PATCHED LOCALLY, TOGETHER, exactly as the route writes both columns together.
   * Patching only one would reproduce the bug this fixes: pick Standard over a pinned Private and the
   * control would show Standard while the stale id was still in the list behind it.
   */
  const savePin = async (typeId: string | null) => {
    if (!selected) return
    const isStd = typeId === 'standard'
    const next = { usual_event_type_id: isStd ? null : typeId, usual_type_is_standard: isStd }
    /* ⚠️ OPTIMISTIC, THEN RELOADED. The select must not snap back while the write is in flight — the
     * same reasoning `setFavourite` records for the star. */
    ctl.patchLocal(selected.id, next)
    try {
      await api('sg_place_usual_type', { placeId: selected.id, typeId })
    } catch (e: unknown) {
      ctl.patchLocal(selected.id, {
        usual_event_type_id: selected.usual_event_type_id ?? null,
        usual_type_is_standard: selected.usual_type_is_standard === true,
      })
      showToast(msgOf(e, 'Couldn’t save the usual event type.'), 'error')
    }
  }

  /* ══ 🔴 A FAILURE SHOWS A SENTENCE AND A RETRY — NEVER AN ENDLESS SPINNER (5 October 2026) ════════
   * ⛔ THE SPINNER USED TO BE THE ONLY OTHER STATE, and when the load was stranded at `null` (see the
   * cause in `usePlaces`) it was the ONLY state the operator ever saw. A spinner is a promise that
   * something is still happening; when nothing is, it is a lie that cannot be dismissed.
   * 🔴 SO THERE ARE THREE STATES NOW, AND THE THIRD IS NEW: loading, failed-with-a-way-out, and
   * loaded. `ctl.error` is set by the hook's catch; `Retry` is `ctl.reload()`, which is the same path
   * the rest of the tab uses after a write.
   * ⚠️ THE ERROR CARD REPLACES THE PANES rather than sitting above them: with no places loaded there
   * is nothing for the two panes to show, and an empty list under an error reads as "you have no
   * places" — which is a different and more alarming statement than "we could not load them". */
  if (ctl.error && ctl.places.length === 0) {
    return (
      <Card className="p-6">
        <p className={SUBCARD_HEADING}>Places</p>
        <p className="mt-2 text-sm text-slate-700">{ctl.error}</p>
        <p className="mt-1 text-xs text-slate-500">
          Your places are worked out from your schedule, so nothing has been lost — this is a read that
          did not come back.
        </p>
        <Btn label="Retry" colour="orange" size="sm" onClick={() => ctl.reload()} />
      </Card>
    )
  }
  if (ctl.loading) return <div className="p-8 text-center"><Spinner /></div>

  return (
    <div className="space-y-3">
      {/* ⚠️ STILL SHOWN WHEN SOME PLACES DID LOAD — a partial failure after a write must not be
          silent, and in that case the panes below are worth keeping on screen. */}
      {ctl.error && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-red-600">
          {ctl.error}
          <button type="button" onClick={() => ctl.reload()}
            className="font-semibold underline hover:no-underline">Retry</button>
        </p>
      )}

      {/* ── 🔴 TWO PANES FROM `md` UP, ONE COLUMN BELOW IT ──────────────────────────────────────
        * On a phone the list is the screen and selecting a place replaces it — the same shape the
        * Event types grid takes (`md:hidden` picker above a single column), so the two Schedule
        * screens behave the same way on the device an operator actually holds. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[300px_1fr]">
        {/* ── LEFT: the list ─────────────────────────────────────────────────────────────────── */}
        <Card className="min-h-0 overflow-hidden p-0 md:max-h-[70vh]">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-3">
            <p className={SUBCARD_HEADING}>Places</p>
            <Btn label="+ Add place" colour="ghost" size="sm" disabled={!editable}
              onClick={() => setAdding(true)} />
          </div>

          {adding && (
            <div className="border-b border-slate-100 p-3">
              <Input label="Place name" value={newName} onChange={setNewName}
                placeholder="e.g. The Crown" />
              <div className="mt-2 flex justify-end gap-2">
                <Btn label="Cancel" colour="slate" size="sm" onClick={() => { setAdding(false); setNewName('') }} />
                <Btn label="Add" colour="orange" size="sm" disabled={!newName.trim()} onClick={() => void addPlace()} />
              </div>
            </div>
          )}

          {/* 🔴 THE SHARED LIST. `showHidden` is what the "N hidden places · Show" row below toggles —
            * the same prop Tidy up passes, so hidden places behave identically on both screens. */}
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
              /* ⚠️ A ROW, NOT A FILTER CONTROL. Hidden places are not a view an operator works in —
               * they are somewhere to go and get one back, which is why this says how many there are
               * and nothing else. "Restore" is in the detail pane, exactly as Tidy up has it. */
              <button type="button" onClick={() => setShowHidden(v => !v)}
                className="text-xs font-semibold text-slate-600 underline hover:no-underline">
                {hiddenCount} hidden place{hiddenCount === 1 ? '' : 's'} · {showHidden ? 'Hide' : 'Show'}
              </button>
            ) : null}
          />
        </Card>

        {/* ── RIGHT: the selected place ──────────────────────────────────────────────────────── */}
        <div className="min-w-0">
          {!selected ? (
            <Card className="p-6">
              <p className="text-sm text-slate-500">
                No places yet. They appear here from your schedule, or add one on the left.
              </p>
            </Card>
          ) : (
            /* ⚠️ `key` IS THE PLACE ID, so every draft field inside remounts when the selection
             * changes — a half-typed name can never leak from one place onto another. The rule
             * `PlaceDetail` already records for itself. */
            <div key={selected.id} className="space-y-3">
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-900">{selected.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      used {selected.used_count ?? 0} time{(selected.used_count ?? 0) === 1 ? '' : 's'}
                      {selected.area ? ` · ${selected.area}` : ''}
                    </p>
                  </div>
                  {/* 🔴 Hide/Restore IS IN THE HEADER HERE, because this pane is the place rather than
                    * a form about it. The ACTION is `PlaceDetail`'s own `sg_upsert_place` write — the
                    * button below in the shared detail does the same thing, and both are kept so Tidy
                    * up is unchanged. */}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <UsualTypeSelect
                      place={selected}
                      types={types}
                      canTypes={canTypes}
                      canPrivate={canPrivate}
                      disabled={!editable}
                      onSave={v => void savePin(v)}
                    />
                  </div>
                </div>
              </Card>

              {/* 🔴 THE SHARED DETAIL — the five fields, Events here (next/last), Favourite and
                * Hide/Restore. Unchanged, and still the only writer of those fields. */}
              <PlaceDetail place={selected} api={api} showToast={showToast}
                onChanged={() => ctl.reload()} />

              <PicturesPane place={selected} api={api} showToast={showToast} disabled={!editable} />

              <EventsHere place={selected} api={api} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
