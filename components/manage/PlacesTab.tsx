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
import { Btn, Card, Input, Spinner } from '@/components/manage/primitives'
import { SUBCARD_HEADING } from '@/lib/ui-tokens'
/* ⛔ `Select`, `shortDay`, `PlacePicture`, `PlaceEventRow` AND `PRIVATE_CHIP` WERE ALL IMPORTED HERE
 * (5 October 2026). `Select` was the "Usual event type" dropdown, now a pill row; the other four served
 * "Events here" and "Your own pictures", which are deleted. The two types went with their routes. */
import {
  usePlaces, PlaceList, PlaceDetail,
  type Api, type Place,
} from './SchedulePlaces'
/* 🔴 "Standard", THE WORD, FROM THE ONE PLACE THAT DEFINES IT — Standard is not an `event_types` row,
 * so the name has no database to come from and was a literal in four files before this constant. */
import { STANDARD_TYPE_NAME } from '@/lib/event-types/read'
/* 🔴 THE GRID'S OWN COLOURS, so a type's dot is the same colour on the list as on the grid. Derived
 * from the type's index in the truck's list — see `colourFor`'s note on why it is not a column. */
import { colourFor, STANDARD_COLOUR } from '@/lib/event-types/types'
import { PLACE_TYPE_HELPER, POST_PICTURE_STANDARD_NOTE } from '@/lib/copy/serviceSettings'
/* 🔴 THE ONE BUILDER FOR A LINK INTO A MANAGE SECTION. The old "Add a picture for this place" link
 * was a bare `?section=weekly`, which dropped `?tab=` and landed on Billing. See that file's header. */
import { manageSectionHref } from '@/lib/manage-links'
import type { Plan } from '@/lib/features'
import { canAccess } from '@/lib/features'

/** 10MB, matching `MAX_UPLOAD_BYTES` in components/manage/EventPost.tsx and the route's own check.
 *  ⚠️ A COURTESY LIMIT: it refuses a doomed upload before the bytes move. The GUARD is the route's. */
const MAX_POST_PICTURE_BYTES = 10 * 1024 * 1024

const msgOf = (e: unknown, fallback: string): string => {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  return m || fallback
}

/* ⛔ `sizeLabel` WENT WITH "Your own pictures" (5 October 2026). It formatted a file size for that
 * list's rows; the post picture reports its DIMENSIONS, which is the figure that matters for a
 * picture a design is drawn on. */

/** A type the pin may point at, in the grid's order. */
export interface TypeChoice { id: string; name: string; kind?: 'custom' | 'private' }

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE USUAL EVENT TYPE
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴 THE PLACE'S EVENT TYPE — A PILL ROW, AND NO "Automatic" (5 October 2026, Dominic) ═══════════
 *
 * ⛔ THE DROPDOWN AND EVERY "Automatic (…)" OPTION ARE GONE. It offered three states where an
 * operator only ever wants one answer: *what type comes up when I pick this place?* "Automatic
 * (Market — last used here)" was an honest label for a mechanism, and a mechanism is not what the
 * question is about — so the row now shows the ANSWER, as an ordinary selected pill, and pressing a
 * different pill stores it.
 *
 * 🔴 A PLACE THAT HAS NEVER BEEN SET STILL SHOWS A SELECTED PILL, with no special label: the one the
 * existing history rule gives (Standard where there is no history). The server resolves that — it is
 * `usual_automatic_type_id` on the row, from the SAME function the Add event pre-selection uses — so
 * the pill an operator sees IS what Add event will pick, with or without a stored choice.
 * ⚠️ STORAGE IS UNCHANGED: `usual_type_is_standard` / `usual_event_type_id`, written by
 * `sg_place_usual_type`. What changed is that there is no longer a way to write "neither".
 *
 * ⛔ PRIVATE IS ONE OF THE PILLS, AND THAT IS DELIBERATE (confirmed 5 October 2026). A wedding venue
 * that only ever has private bookings should come up as Private. It is not a silent consequence: Add
 * event opens the purple panel with the full explanation, so the operator sees it before saving.
 *
 * ⚠️ A PRO TRUCK SEES STANDARD AND PRIVATE ONLY. Custom types are `event_types` (Max); the Private
 * type is `private_events` (Pro). The filter is on the key, not on the plan name.
 * ⚠️ THE PILL STYLING IS THE ADD EVENT ROW'S, deliberately duplicated rather than imported: that
 * control is `EventTypeSelect`, which owns the privacy panel, the "usual for this place" hint and a
 * `touched` ref for the form it lives in — none of which belongs on this screen. What is shared is the
 * SHAPE, and §4's density rules are what keep the two reading as one product.
 */
/**
 * ══ 🔴 WHICH TYPE A PLACE IS ON — ONE DERIVATION, READ BY THE PILLS **AND** THE LIST ═══════════════
 *
 * `null` ⇒ Standard. A uuid ⇒ that type.
 *
 * ⚠️ `usual_type_is_standard` IS READ FIRST, matching the server's own order
 * (`is_standard ? Standard : (id ?? rule)`), so a row that somehow carries both reads the same way on
 * both sides of the wire.
 * ⚠️ `usual_automatic_type_id` IS THE HISTORY RULE'S ANSWER, resolved by the route from the SAME
 * function Add event's pre-selection uses — which is what makes the pill, the list label and what Add
 * event will actually pick the same answer on a place nobody has set.
 * ⚠️ ABSENT (an old payload, or a failed history read) FALLS BACK TO STANDARD — which is what the rule
 * itself returns with no history, so the fallback is the rule's own answer rather than a guess.
 * ⛔ IT IS A FUNCTION, NOT TWO COPIES OF `?? ??`. The list label and the selected pill disagreeing
 * about one place would be the exact defect the dropdown had: a control showing one type while another
 * was stored behind it.
 */
export function placeTypeId(place: Place): string | null {
  return place.usual_type_is_standard === true ? null
    : place.usual_event_type_id ?? place.usual_automatic_type_id ?? null
}

function PlaceTypePills({
  place, types, canTypes, canPrivate, disabled, onSave,
}: {
  place: Place
  types: TypeChoice[]
  canTypes: boolean
  canPrivate: boolean
  disabled?: boolean
  /** `'standard'` ⇒ Standard · a uuid ⇒ that type. ⛔ There is no "clear" any more. */
  onSave: (typeId: string) => void
}) {
  /* 🔴 THE SAME DERIVATION THE LIST LABEL USES — see `placeTypeId`. */
  const selectedId = placeTypeId(place)

  const privateType = types.find(t => t.kind === 'private') ?? null
  const customTypes = types.filter(t => t.kind !== 'private')

  const pill = (key: string, label: string, on: boolean, kind: 'standard' | 'private' | 'custom', value: string) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={() => { if (!on) onSave(value) }}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
        on
          ? kind === 'private'
            ? 'border-purple-400 bg-purple-100 text-purple-900'
            : 'border-slate-900 bg-slate-900 text-white'
          : kind === 'private'
            ? 'border-purple-300 bg-white text-purple-700 hover:bg-purple-50'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
    >
      {kind === 'private' && <span aria-hidden="true">🔒</span>}
      {label}
    </button>
  )

  return (
    <div data-place-type-pills-wrap className="min-w-0">
      <p className="mb-1 block text-xs font-bold text-slate-600">Event type</p>
      {/* ⚠️ A `radiogroup`, NOT A LIST OF BUTTONS — exactly one is selected, which is what a radio
          group means to a screen reader and to a keyboard. */}
      <div role="radiogroup" aria-label={`Event type for ${place.name}`}
        data-place-type-pills className="flex flex-wrap gap-1.5">
        {/* 🔴 STANDARD FIRST, THEN PRIVATE, THEN THE CUSTOM TYPES — the same order the Event types
            grid and the Add event pill row use, so a truck finds a type in the same place on all three. */}
        {pill('standard', STANDARD_TYPE_NAME, selectedId === null, 'standard', 'standard')}
        {privateType && canPrivate
          && pill(privateType.id, privateType.name, selectedId === privateType.id, 'private', privateType.id)}
        {canTypes && customTypes.map(t =>
          pill(t.id, t.name, selectedId === t.id, 'custom', t.id))}
      </div>
      {/* ⛔ ONE SENTENCE, AND IT IS ABOUT THE CONSEQUENCE, NOT THE MECHANISM. The old helper line
          explained what "Automatic" meant; there is no Automatic, so what is left to say is what this
          row DOES. */}
      <p className="mt-1.5 text-[11px] text-slate-500">{PLACE_TYPE_HELPER}</p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PICTURE FOR POSTS
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴 "Picture for posts" — ONE PICTURE, UPLOADED IN PLACE (5 October 2026, Dominic) ═════════════
 *
 * ⛔ "Your own pictures" IS DELETED ENTIRELY — the whole second half of this pane, and the four
 * `sg_place_picture_*` routes behind it. It was a reference library (a photo of the pitch, where to
 * park, the venue's artwork) that nothing read: it fed no post, no screen and no export, and its own
 * copy had to say so in capitals every time it was drawn. A feature whose description is mostly a
 * warning about what it is not is a feature nobody asked for.
 * ⚠️ `public.place_pictures` IS LEFT IN THE DATABASE, UNTOUCHED. Dropping a table is a migration this
 * change does not need, and any rows an operator uploaded are theirs. Nothing reads it now.
 *
 * ── 🔴 AND THE POST PICTURE IS UPLOADED **HERE**, NOT BEHIND A LINK ───────────────────────────────
 * It used to be a sentence and a link into Social posts › Single event, on the grounds that a second
 * drag surface would be a second set of the three pointer bugs that one had. That reasoning holds for
 * the TEXT POSITIONS and not for the UPLOAD: choosing a file is not a drag surface. So the upload is
 * in place and "Text positions" is still the link.
 *
 * ⚠️ IT IS THE EXISTING FLOW, NOT A SECOND ONE: `upload_url` → PUT → `confirm_upload` with
 * `which: 'place'` and this place's id, on /api/weekly-post — the same three calls
 * `components/manage/EventPost.tsx` makes, so the shape check against the standard design, the 10MB
 * cap, the PNG/JPG rule and the storage path are all the server's existing ones.
 * ⛔ THE SHAPE CHECK IS THE SERVER'S AND ONLY THE SERVER'S. A picture whose aspect ratio differs from
 * the standard design is refused with a sentence that names both shapes, and the only honest source
 * for that is the real pixels of the stored object. The size and type checks here are a courtesy that
 * saves a doomed upload.
 *
 * ⚠️ THE ROUTE IS /api/weekly-post, WHICH IS GATED ON `schedule_graphics` (Max) AS WELL AS ON THE
 * PREVIEW KEY. A Pro truck holding the preview key therefore sees this section and is refused on
 * upload, with the route's own sentence — which is correct and is shown rather than hidden: posts are
 * a Max feature and this picture only exists for a post.
 */
function PostPicturePane({
  place, token, showToast, disabled, onChanged,
}: {
  place: Place
  /** 🔴 THE DASHBOARD TOKEN, because this pane talks to /api/weekly-post — NOT to /api/manage, which
   *  is what the `api` prop everywhere else in this file posts to. Two routes, two callers. */
  token: string
  showToast: (msg: string, kind?: 'success' | 'error') => void
  disabled?: boolean
  /** Re-read the places list, so the thumbnail and the size follow the upload. */
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const post = useCallback(async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const r = await fetch('/api/weekly-post', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...body }),
    })
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
    /* 🔴 THE SERVER'S OWN SENTENCE, SHOWN AS IT CAME BACK. The refusals here are specific — the wrong
     * shape names both shapes, a Pro truck is told posts are on Max — and replacing any of them with
     * "something went wrong" would strip the only part an operator can act on. */
    if (!r.ok) throw new Error(String(j.error ?? 'That did not work.'))
    return j
  }, [token])

  const upload = async (file: File) => {
    /* ⚠️ A COURTESY, NOT THE GUARD. It saves a doomed 30MB upload; the guard is the route's. */
    if (file.size > MAX_POST_PICTURE_BYTES) {
      showToast(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 10MB.`, 'error'); return
    }
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      showToast('Please choose a PNG or JPG.', 'error'); return
    }
    setBusy(true)
    try {
      const ext = file.type.includes('png') ? 'png' : 'jpg'
      const slot = await post({ action: 'upload_url', which: 'place', ext })
      const put = await fetch(String(slot.uploadUrl), {
        method: 'PUT', body: file, headers: { 'Content-Type': file.type },
      })
      if (!put.ok) throw new Error('The upload did not complete.')
      const done = await post({ action: 'confirm_upload', path: slot.path, which: 'place', placeId: place.id })
      /* ⚠️ THE SERVER MAY HAVE RESET THIS PLACE'S TEXT BOXES — a different shape makes the old
       * coordinates meaningless, and it returns the layout it stored. Said out loud rather than
       * letting the boxes appear to have moved on their own. */
      showToast(done.layout ? 'Picture saved — the text positions were reset to the standard ones.' : 'Picture saved', 'success')
      onChanged()
    } catch (e: unknown) {
      showToast(msgOf(e, 'Couldn’t save that picture.'), 'error')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = async () => {
    /* ⚠️ CONFIRMED, BECAUSE IT DELETES A FILE and sends this place's posts back to the standard
     * design. The operator may have no other copy of the picture. */
    if (!window.confirm(`Remove the picture for “${place.name}”? Event posts here will use your standard design again.`)) return
    setBusy(true)
    try {
      await post({ action: 'event_remove_place_design', placeId: place.id })
      showToast('Picture removed', 'success')
      onChanged()
    } catch (e: unknown) {
      showToast(msgOf(e, 'Couldn’t remove that picture.'), 'error')
    } finally { setBusy(false) }
  }

  const has = !!place.event_bg_path
  const dims = place.event_bg_width && place.event_bg_height
    ? `${place.event_bg_width}×${place.event_bg_height}`
    : null

  /* ══ 🔴 THE THUMBNAIL NEEDS A SIGNED URL, AND `sg_places` CANNOT GIVE ONE ═════════════════════
   * `/api/manage` returns `event_bg_path` — a storage path, not something an `<img>` can load. The
   * bucket is private, so a URL has to be signed, and the ONE action that already signs a place's
   * post picture is `event_load` on /api/weekly-post.
   * ⚠️ SO THAT IS WHAT IS CALLED, RATHER THAN A NEW ROUTE ACTION FOR ONE URL. It is not cheap (it
   * also reads up to 200 events each way for the setup screen's previews), which is why it runs ONCE,
   * only when this place HAS a picture, and is re-run only after an upload — never on a place that has
   * nothing to show.
   * ⚠️ A HIDDEN PLACE IS NOT IN `designs` (that list is the visible places), so a hidden place with a
   * picture gets no URL. That is why the failure is a LABELLED TILE and not a broken image: the pane
   * still says, in words, that there is a picture and what shape it is. */
  /* 🔴 THE PATH IS STORED **WITH** THE URL, and the URL shown is DERIVED by comparing the two. That is
   * not bookkeeping — it is what makes the clearing case correct without a second `setState`. Removing
   * the picture sets `event_bg_path` to null on the next reload, the paths stop matching, and the
   * thumbnail goes on that render. Holding a bare URL would have needed an effect to clear it, which is
   * a cascading render and is one frame of the OLD picture under the words "Standard design". */
  const [signedFor, setSignedFor] = useState<{ path: string; url: string | null } | null>(null)
  useEffect(() => {
    const path = place.event_bg_path
    if (!path) return
    let live = true
    void (async () => {
      try {
        const j = await post({ action: 'event_load' }) as {
          designs?: { placeId?: string; imageUrl?: string | null }[]
        }
        const mine = (j.designs ?? []).find(d => d.placeId === place.id)
        if (live) setSignedFor({ path, url: mine?.imageUrl ?? null })
      } catch {
        /* ⚠️ SILENT, AND DELIBERATELY SO. A missing thumbnail is cosmetic; the pane's words are not
         * wrong without it, and a red toast for a picture that failed to PREVIEW would read as if the
         * picture itself had gone. The upload and remove paths do show their errors. */
        if (live) setSignedFor({ path, url: null })
      }
    })()
    return () => { live = false }
    /* ⚠️ `place.event_bg_path` IS A DEPENDENCY, NOT JUST THE ID — replacing a picture keeps the place
     * the same and must still re-sign, or the thumbnail would stay on the old image. */
  }, [place.id, place.event_bg_path, post])
  const url = signedFor && signedFor.path === place.event_bg_path ? signedFor.url : null

  return (
    <Card className="p-4 space-y-3" data-post-picture>
      <p className={SUBCARD_HEADING}>Picture for posts</p>

      <div className="flex items-start gap-3">
        {/* ⚠️ A LABELLED PLACEHOLDER, NOT AN EMPTY GREY SQUARE. "Standard design" says what this place
            is using; a blank tile says only that something is missing. */}
        {has ? (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-center text-[9px] font-semibold leading-tight text-slate-500">
            {url
              /* eslint-disable-next-line @next/next/no-img-element -- a signed, expiring Supabase URL;
                 next/image would need the host in `remotePatterns` and would proxy a private object. */
              ? <img src={url} alt="" className="h-full w-full object-cover" />
              : 'Your picture'}
          </div>
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-1 text-center text-[9px] font-semibold leading-tight text-slate-500">
            Standard design
          </div>
        )}
        <div className="min-w-0 flex-1">
          {has ? (
            <p className="text-xs text-slate-600">Set{dims ? ` · ${dims}` : ''}</p>
          ) : (
            <p className="text-[11px] leading-relaxed text-slate-500">{POST_PICTURE_STANDARD_NOTE}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* 🔴 THE UPLOAD IS A LABEL WRAPPING A HIDDEN INPUT, which is the only way to style a file
                picker — and it is the same idiom the Add event import control uses.
                ⛔ NOT A `<label>` AROUND ANYTHING ELSE. A label forwards a click anywhere inside it to
                its first labelable descendant, which is how the outreach composer's B button came to
                fire on every click in the message body (§65). It wraps the input and the text, and
                nothing else — no buttons inside it. */}
            <label className={`inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 ${
              disabled || busy ? 'pointer-events-none opacity-50' : ''}`}>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
              {busy ? 'Working…' : has ? 'Replace' : 'Upload a picture for this place'}
            </label>

            {has && (
              <>
                {/* 🔴 "Text positions" IS STILL A LINK, and that is the part of the old reasoning that
                    survives: the drag surface lives in Social posts › Single event with its three
                    pointer fixes, and a second one here would be a second set of those bugs.
                    ⛔ IT GOES THROUGH `manageSectionHref`, SO IT CARRIES ITS TAB. The old link was a
                    bare `?section=weekly`, which dropped `?tab=` and landed on Billing — see the note
                    at the head of lib/manage-links.ts. */}
                <a href={manageSectionHref('weekly')}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Text positions
                </a>
                <button type="button" disabled={disabled || busy} onClick={() => void remove()}
                  className="inline-flex items-center rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                  Remove
                </button>
              </>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">PNG or JPG, up to 10MB, the same shape as your standard design.</p>
        </div>
      </div>
    </Card>
  )
}

export function PlacesTab({
  api, showToast, token, plan, featureOverrides, trialExpiresAt, types, editable = true,
}: {
  api: Api
  showToast: (msg: string, kind?: 'success' | 'error') => void
  /** 🔴 THE DASHBOARD TOKEN — for "Picture for posts" ONLY, which talks to /api/weekly-post rather
   *  than to /api/manage. Everything else on this tab goes through `api`. */
  token: string
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
  /* ⛔ `showHidden` IS GONE (5 October 2026). It was a filter: hidden places were OFF the screen until
   * an operator found a footer row and pressed it. The list has a HIDDEN PLACES section now, always
   * drawn, so there is no state to be in — see `hiddenSection` on `PlaceList`. */
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const canTypes = canAccess(plan, 'event_types', featureOverrides ?? {}, trialExpiresAt)
  const canPrivate = canAccess(plan, 'private_events', featureOverrides ?? {}, trialExpiresAt)

  const visible = useMemo(
    () => ctl.places.filter(p => !p.is_hidden && !p.merged_into_id),
    [ctl.places],
  )
  /* ⛔ `hiddenCount` WENT WITH THE FOOTER. The count was the footer's whole content ("3 hidden places ·
   * Show"); the section replaces it with the two things an operator needs — that hidden places stay out
   * of Add event, and that opening one restores it. See `HIDDEN_PLACES_NOTE`. */

  /* 🔴 THE SELECTION DEFAULTS TO THE FIRST PLACE, so the right pane is never an empty frame on a
   * truck that has places. ⚠️ ONLY WHEN NOTHING IS SELECTED — it must not fight the operator. */
  const selected = useMemo(
    () => ctl.places.find(p => p.id === selectedId) ?? visible[0] ?? null,
    [ctl.places, selectedId, visible],
  )

  /* ══ 🔴 THE TYPE ON EACH LIST ROW (5 October 2026, Dominic) ════════════════════════════════════
   * A colour dot and the type's name, or a purple lock and "Private" — the same two marks the Event
   * types grid puts beside a column heading, so a type is recognisable by sight on both screens.
   *
   * 🔴 THE COLOUR IS `colourFor(index in `types`)`, WHICH IS THE GRID'S OWN INDEX. `types` here is
   * `placeTypeChoices`, built straight from `/api/event-types` `load` — the same array, in the same
   * order, that the grid runs `colourFor` over. Any other index would give one type two colours.
   * ⚠️ NO LABEL AT ALL FOR AN ID THAT IS NOT IN `types` — a type deleted since the pin was written, or
   * a types read that failed. A dot with no name says nothing; "Standard" would be a LIE, because
   * Standard is `null` and this place has an id. The pill row degrades the same way, to Standard alone.
   * ⚠️ STANDARD IS LABELLED, not left blank. "This place is on Standard" is an answer; an empty cell
   * reads as "nobody has set this", which stopped being a state when Automatic went.
   * ⚠️ IT IS `useCallback` BECAUSE `PlaceList` TAKES IT AS A PROP and re-renders on every keystroke in
   * the search box; an inline arrow would be a new function on each of those. */
  const typeLabelFor = useCallback((p: Place): React.ReactNode => {
    const id = placeTypeId(p)
    if (id === null) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: STANDARD_COLOUR }} />
          {STANDARD_TYPE_NAME}
        </span>
      )
    }
    const i = types.findIndex(t => t.id === id)
    if (i < 0) return null
    const t = types[i]
    if (t.kind === 'private') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700">
          <span aria-hidden="true">🔒</span>{t.name}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
        <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: colourFor(i) }} />
        {t.name}
      </span>
    )
  }, [types])

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
   * Save the place's type. `'standard'` ⇒ Standard · a uuid ⇒ that type.
   * ⛔ THERE IS NO `null` ANY MORE. `null` meant "Automatic", and Automatic is gone — a pill row has
   * no way to say "neither", which is the point of it. The ROUTE still accepts null (it is what
   * `clearOwn` and any older caller send) and the storage is unchanged.
   * 🔴 BOTH FIELDS ARE PATCHED LOCALLY, TOGETHER, exactly as the route writes both columns together.
   * Patching only one would reproduce the bug this fixes: pick Standard over a pinned Private and the
   * control would show Standard while the stale id was still in the list behind it.
   */
  const savePin = async (typeId: string) => {
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

          {/* ══ 🔴 THE SHARED LIST, WITH TWO THINGS THIS TAB ADDS (5 October 2026) ═══════════════
            * `typeLabelFor` puts the place's event type on the right of its row, and `hiddenSection`
            * keeps hidden places ON THE SCREEN, in their own group at the bottom.
            * ⛔ `showHidden` IS NOT PASSED ANY MORE, and there is no footer. Those were one mechanism:
            * a count you had to press to reveal a list. A place an operator hid is still one of their
            * places — the question they open this screen with is "where did The Crown go?", and a
            * screen that answers it only after a hunt is a screen that has hidden the answer too.
            * ⚠️ "Tidy up places" IN ADD EVENT KEEPS `showHidden`. It is a different job — a short
            * working pass where a long greyed tail is noise — and the prop is still there for it. */}
          <PlaceList
            places={ctl.places}
            selectedId={selected?.id ?? null}
            onSelect={p => setSelectedId(p.id)}
            onFavourite={ctl.setFavourite}
            search={search}
            onSearch={setSearch}
            hiddenSection
            typeLabelFor={typeLabelFor}
            starError={ctl.starError}
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
                    <PlaceTypePills
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
              {/* ══ 🔴 `key` IS NOT DECORATION HERE — IT WAS A DATA BUG (found 5 October 2026) ════════
                * `PlaceDetail` keeps the five fields as LOCAL DRAFT STATE and saves them ON BLUR, which
                * only works because the caller remounts it per place. This mount had no `key`, so
                * selecting a second place reused the component: the pane showed the FIRST place's name,
                * short name, address, area and postcode, and blurring any of them would have written
                * them onto the second place. "Tidy up places" always had the key (see its mount in
                * SchedulePlaces.tsx) — this tab simply never got it.
                * ⛔ SO DO NOT REMOVE IT, and do not add a sixth field to that component on the
                * assumption that its state follows its props. It does not; the remount is the mechanism. */}
              <PlaceDetail key={selected.id} place={selected} api={api} showToast={showToast}
                onChanged={() => ctl.reload()} />

              {/* ⛔ "Events here" IS GONE — BOTH BOXES (5 October 2026). One sat under the fields and
                * one at the bottom of the page, and between them they printed the next event, the last
                * event and a count of a place's events on the screen whose job is the place's SETTINGS.
                * The schedule is one tab away and is the real answer to all three. Its route,
                * `sg_place_events`, went with it.
                * ⛔ "Your own pictures" IS GONE TOO. See the note on `PostPicturePane`. */}
              <PostPicturePane place={selected} token={token} showToast={showToast}
                disabled={!editable} onChanged={() => ctl.reload()} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
