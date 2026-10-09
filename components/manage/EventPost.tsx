'use client'
// components/manage/EventPost.tsx — the single-event post: its setup screen and its modal.
//
// ── 🔴 WHAT IS SHARED WITH THE WEEKLY POST, AND WHY IT IS SHARED ───────────────────────────────────
// Everything that decides what a poster looks like: the renderer, the fonts, the fit, the readability
// rule, "Powered by HatchGrab" and the layout validator. This file passes different data to the same
// machinery; it does not draw a poster of its own. The brief's instruction — "reuse them, do not fork
// them" — is the same rule stage 1 applied to `TruckListCard`, for the same reason: two implementations
// of "does this text fit" would disagree first on artwork a truck had already posted.
//
// What this file DOES own is the single-event screens: the Week | Single event switch, the per-place
// background list, and the modal that turns one event into one picture and one piece of text.
//
// ⚠️ `DraggableBox` IS IMPORTED FROM THE WEEKLY POST, not copied. The drag behaviour — pointer events,
// pointer capture, the clamp to the image, the `data-mode` handle rule — took three fixes to get right
// on touch, and a second copy would have to be fixed again.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Btn, Card } from './primitives'
import { Panel } from './WeeklyPost'
import { PostShareBar } from './PostShareBar'
import { DesignEditor, type AnyLayout } from './DesignEditor'
import {
  scaleEventLayout, MAX_UPLOAD_BYTES, MIN_UPLOAD_SHORT_SIDE,
  type EventLayout,
} from '@/lib/weekly-post/layout'
import { DEFAULT_COUNTRY, type CountryCode } from '@/lib/weekly-post/locale'
/* ⚠️ §2 · THE ONE EVENT THE LIVE STAGE DRAWS. It is the renderer's own type, and `event_preview_entry`
 * sends exactly it — built by the same `eventPostContext` the PNG is rendered from. */
import type { DayEntry } from '@/lib/weekly-post/week-data'
/* ⚠️ §6's TWO STRINGS. They live in lib/copy/socialPosts.ts beside the rest of this feature's wording
 * rather than inline, because the Locations screen says the same thing about the same slot and the two
 * must not drift. */
import { imageChoiceAlsoSave, IMAGE_CHOICE_ONE_OFF, NEW_SHAPE_RESET } from '@/lib/copy/socialPosts'
/* ⛔ `manageSectionHref` WAS IMPORTED HERE for the "a different picture for one place?" pointer,
 * which is deleted — see the tombstone further down. This screen links nowhere now. */

/* ⛔ `BoxKey` LIVED HERE AND IS NOW THE EDITOR'S `ItemKey` — which is a plain string, because the
 * list of items can grow ("Your own text" number 3) and a four-member union could not. */

/** What the preview is allowed to show for one design, decided server-side. */
interface PreviewPick {
  eventId: string | null
  /** Shown above the preview when the event is not the obvious one. null = nothing to explain. */
  label: string | null
  substituteName: boolean
}

/** A place in the "+ Add a design for a place" picker — the same list Add event offers. */
interface PlaceRow {
  id: string
  name: string
  fullName: string
  area: string | null
  isFavourite: boolean
  hasDesign: boolean
  preview: PreviewPick
}

/** A place that has a design: its own picture, and optionally its own text positions. */
interface PlaceDesignRow {
  placeId: string
  name: string
  fullName: string
  area: string | null
  mode: 'own' | 'standard'
  imageUrl: string | null
  width: number | null
  height: number | null
  layout: EventLayout | null
  fitsDefault: boolean
  status: string
  preview: PreviewPick
}

interface EventDesign {
  width: number
  height: number
  layout: EventLayout
  backgroundUrl: string | null
  status: string
  preview: PreviewPick
}

const api = async (token: string, body: Record<string, unknown>) => {
  const r = await fetch('/api/weekly-post', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...body }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Something went wrong')
  return j
}

/** ⚠️ Separate from `api` because the response is a PNG and carries its warnings in a header.
 *  ⚠️ IT RETURNS THE `blob` TOO (6 October 2026) — `PostShareBar` needs a `File` ready before the tap,
 *  and the blob is already here, so the `fetch(png)` that used to run inside the tap is gone. */
/* ⚠️ EXPORTED SINCE 10 OCTOBER so the Create-a-post tiles can show the REAL post rather than the blank
 * it is drawn on — see `EventPostTile` in SocialPosts.tsx. ⛔ ONE RENDER HELPER, NOT A SECOND COPY:
 * the tile and the modal must not be able to disagree about what the post looks like. */
export async function renderPng(token: string, body: Record<string, unknown>) {
  const r = await fetch('/api/weekly-post', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...body }),
  })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j.error || 'The preview could not be made')
  }
  const blob = await r.blob()
  let warnings: { where: string; message: string }[] = []
  try { warnings = JSON.parse(decodeURIComponent(r.headers.get('X-Render-Warnings') || '[]')) } catch { /* a header we can live without */ }
  return { url: URL.createObjectURL(blob), blob, warnings, source: r.headers.get('X-Background-Source') || '' }
}

/**
 * Upload a file to a slot and confirm it.
 *
 * 🔴 THE SERVER DECIDES, FROM THE BYTES. The size and type checks here are for speed — refusing a 40MB
 * file before it is uploaded — and the aspect-ratio rule is not checked here at all, because the only
 * honest answer comes from the real pixels of the stored object.
 */
async function uploadTo(
  token: string, file: File, which: string, extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 10MB.`)
  if (!/^image\/(png|jpe?g)$/.test(file.type)) throw new Error('Please choose a PNG or JPG.')
  const ext = file.type.includes('png') ? 'png' : 'jpg'
  const slot = await api(token, { action: 'upload_url', which, ext })
  const put = await fetch(slot.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
  if (!put.ok) throw new Error('The upload did not complete')
  return api(token, { action: 'confirm_upload', path: slot.path, which, ...extra })
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE SETUP SCREEN
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴 TWO OPTIONAL PROPS, SO SOCIAL POSTS CAN OPEN THIS SCREEN FOCUSED (6 October 2026) ═══════════
 *
 * ⛔ THE SCREEN, THE DRAG SURFACE AND EVERY SAVE PATH ARE UNCHANGED. Social posts › Designs has a box
 * for the Standard design and a box for the places, and each opens THIS screen on the one it is about.
 * Building a second place-design editor would have meant a second drag surface — the one whose pointer
 * handling took three fixes — so what was added is a way to say which design, not a second way to edit.
 *
 * @param onlyStandard  edit Standard alone: the Designs list and the "+ Add a design for a place"
 *                      picker are hidden, because Box 3 on Designs is now that list.
 * @param onlyPlaceId   edit ONE place: the same, with `current` locked to that place. The page chrome
 *                      (the back link, the name, "Make post for …") belongs to the caller.
 */
export function EventSetupScreen({ token, onCancel, onlyStandard, onlyPlaceId, onDirtyChange, onSaver, onPictureChanged }: {
  token: string
  onCancel?: () => void
  onlyStandard?: boolean
  onlyPlaceId?: string
  /* 🔴 REPORTED SO A **SUB-TAB PILL** CAN ASK BEFORE IT NAVIGATES (9 October 2026). The pills live in
   * the page's bar, outside this screen; without this they would switch tab out from under an unsaved
   * design with no warning at all. ⚠️ Threaded straight through to `DesignEditor`, which owns the
   * comparison — this screen only passes it on. */
  onDirtyChange?: (dirty: boolean) => void
  /* 🔴 §B10 · THE EDITOR'S SAVE, HANDED UP so the leave dialog can offer "Save and leave". ⚠️ Threaded
   * straight through to `DesignEditor`, exactly as `onDirtyChange` is. */
  onSaver?: (save: (() => void | Promise<void>) | null) => void
  /* ══ 🔴 THE PICTURE HAS CHANGED — TOLD AT ONCE, NOT ON THE WAY OUT (10 October 2026) ═════════════
   * ⛔ **DOMINIC: "I changed the background image, went back to the designs page and it showed the old
   * one still. It did update a little later."** This screen reloads itself after an upload; the LIST
   * that mounted it was never told, so pressing "‹ Designs" switched the view immediately and the old
   * signed URL stayed on screen until the parent's own reload landed. ⚠️ Fired on a confirmed upload,
   * after this screen's own `load()`, so the parent re-reads a server that is already correct. */
  onPictureChanged?: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [standard, setStandard] = useState<EventDesign | null>(null)
  const [designs, setDesigns] = useState<PlaceDesignRow[]>([])
  const [places, setPlaces] = useState<PlaceRow[]>([])
  /* 🔴 WHICH DESIGN IS BEING EDITED. `null` is Standard; a string is a place id. One piece of state,
   * because every other panel on the screen is a view of this one choice — the picture, the boxes, the
   * preview and the save target all follow it, and a second "which place" flag would let them disagree. */
  /* ⚠️ SEEDED FROM `onlyPlaceId` WHEN THE CALLER NAMED ONE, so the screen opens on that place rather
   * than on Standard and then jumping. It is still state, because the unfocused screen still switches. */
  const [current, setCurrent] = useState<string | null>(onlyPlaceId ?? null)
  /* ⚠️ A PLACE PICKED FROM THE PICKER BUT NOT YET GIVEN ANYTHING. Nothing is written to the database
   * until the truck uploads a picture or switches the place to its own positions, so backing out of a
   * half-made design leaves nothing behind — and the saved list never names a design that does not
   * exist. It lives here, not on the server, for exactly that reason. */
  const [pending, setPending] = useState<PlaceRow[]>([])
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')
  const [layout, setLayout] = useState<EventLayout | null>(null)
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null)
  /* ══ 🔴 §B8 · A MESSAGE THAT FADES — the same pattern as the weekly screen's ════════════════════
   * ⚠️ SEPARATE FROM `msg`, which is permanent ("Design saved.", a refusal) and must not vanish on a
   * timer. ⛔ THE TIMER IS CLEARED on a second flash and on unmount. */
  const [flash, setFlashText] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setFlash = useCallback((text: string) => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setFlashText(text)
    flashTimer.current = setTimeout(() => { setFlashText(null); flashTimer.current = null }, 5000)
  }, [])
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  /* ══ 🔴 "Preview with": THE EVENTS THIS DESIGN CAN BE JUDGED AGAINST ══════════════════════════
   * ⛔ IT USED TO BE ONE EVENT THE SERVER CHOSE, with a line of explanation when it was not the
   * obvious one. That was the whole feature: an operator who wanted to see their design against the
   * festival next month could not. The server still CHOOSES the default — a place design previews on
   * an event at that place — and now also returns the next few, so the choice exists. */
  const [previewEvents, setPreviewEvents] = useState<{ id: string; label: string }[]>([])
  const [previewWith, setPreviewWith] = useState('')
  /* 🔴 THE COUNTRY COMES OUT OF `event_load`, FROM `countryForTruck()`. ⛔ IT IS NOT A PROP: this
   * screen is opened from three places (the Weekly | Single event switch, Social posts › Designs box 2,
   * and a place's own page) and threading it through all three would be three chances to pass the
   * wrong one, for a value every one of them would have to get from the same request this already
   * makes. A component must never default it itself — that is why it starts at the table's own
   * default and is overwritten by the first response. */
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY)
  /** 🔴 Part 3 · see the same pair in `WeeklyPost.tsx` — facts about the truck, from this same read. */
  const [hasLogo, setHasLogo] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api(token, { action: 'event_load' })
      setStandard(r.design ?? null)
      setDesigns((r.designs ?? []) as PlaceDesignRow[])
      setPlaces((r.places ?? []) as PlaceRow[])
      /* ⚠️ A PENDING PLACE THAT NOW HAS A REAL DESIGN IS DROPPED FROM `pending`, or it would appear in
       * the list twice — once as itself and once as the saved row. */
      setPending(prev => prev.filter(pl =>
        !((r.designs ?? []) as PlaceDesignRow[]).some(d => d.placeId === pl.id)))
      setPreviewEvents((r.previewEvents ?? []) as { id: string; label: string }[])
      setCountry((r.country as CountryCode) ?? DEFAULT_COUNTRY)
      setHasLogo(r.hasLogo === true)
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Could not load', bad: true }) }
    finally { setLoading(false) }
  }, [token])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  // ── THE SELECTED DESIGN, AND EVERYTHING THAT FOLLOWS FROM IT ───────────────────────────────────
  const placeDesign = current ? designs.find(d => d.placeId === current) ?? null : null
  /* ⚠️ `places` IS CONSULTED TOO, for a place opened by id with nothing saved yet — it is in the
   * truck's place list even though it is in neither `designs` nor `pending`. Without this the heading
   * would read "This place". */
  const pendingPlace = current
    ? (pending.find(pl => pl.id === current) ?? (onlyPlaceId === current ? places.find(pl => pl.id === current) ?? null : null))
    : null
  /* ⚠️ A SELECTED PLACE THAT IS NEITHER SAVED NOR PENDING MEANS THE DESIGN WAS JUST REMOVED under us;
   * falling back to Standard is the only state that can be drawn. */
  /* ⛔ A PLACE OPENED FROM Designs HAS NOTHING SAVED YET WHEN IT IS "Give own design". `event_load`
   * will not list it (that list is places that HAVE something), and `pending` is seeded from the picker
   * — which this route does not use. So a named place with no row counts as pending, which is exactly
   * what the picker's own entry means: chosen, nothing written. */
  const focusPending = !!onlyPlaceId && !placeDesign
  const onStandard = current !== null && !placeDesign && !pendingPlace && !focusPending
  const mode: 'own' | 'standard' = current === null
    ? 'own'
    : (placeDesign?.mode ?? 'standard')

  /* 🔴 THE CANVAS IS THE PICTURE THAT WILL ACTUALLY BE DRAWN ON — the place's own when it has one, and
   * Standard's otherwise. Every box coordinate on this screen is in this canvas's pixels, so getting
   * this wrong moves every box the truck places. */
  const canvasW = (current && placeDesign?.imageUrl && placeDesign.width) || standard?.width || 0
  const canvasH = (current && placeDesign?.imageUrl && placeDesign.height) || standard?.height || 0
  const bgUrl = (current && placeDesign?.imageUrl) || standard?.backgroundUrl || ''
  const previewPick: PreviewPick | null = current
    ? (placeDesign?.preview ?? pendingPlace?.preview ?? null)
    : (standard?.preview ?? null)
  /* 🔴 THE BOXES ARE ONLY DRAGGABLE WHERE DRAGGING THEM MEANS SOMETHING. A place on "Same as Standard"
   * is showing Standard's boxes; letting them be dragged here would either edit Standard from a screen
   * that says "Sudbury", or throw the drag away on save. Neither is honest, so they are shown and not
   * moved, with a line saying why and how to change it. */
  const editable = current === null || mode === 'own'

  /* The layout for whichever design is selected. A place on Standard's positions shows Standard's
   * boxes, scaled to its own picture — the same scaling the server would apply if it switched to own. */
  const layoutFor = useCallback((placeId: string | null): EventLayout | null => {
    if (!standard) return null
    if (placeId === null) return standard.layout
    const d = designs.find(x => x.placeId === placeId)
    if (d?.mode === 'own' && d.layout) return d.layout
    const w = (d?.imageUrl && d.width) || standard.width
    const h = (d?.imageUrl && d.height) || standard.height
    return scaleEventLayout(standard.layout, w, h) ?? standard.layout
  }, [standard, designs])

  /* ⚠️ THE EDITOR'S BOXES FOLLOW THE SELECTED DESIGN. Keyed on `current` and on the loaded designs, so
   * selecting a place, or a save coming back, re-seeds the boxes from the right design rather than
   * leaving the previous one's coordinates on a different canvas. */
  /* ⚠️ THE DISABLE IS PER-LINE AND DELIBERATE, as on the load effect above. The editor's boxes
   * are state because they are dragged, but WHICH design they belong to is a prop-like input; React has
   * no "reset state when this changes" primitive short of remounting, and remounting the editor would
   * throw away the stage's measured width and the sampler's decoded image on every click in the list. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayout(layoutFor(current))
    setConfirmRemove(false)
  }, [current, layoutFor])

  /* 🔴 THE DEFAULT PREVIEW EVENT IS THE SERVER'S CHOICE, RE-SEEDED PER DESIGN. A place's design should
   * open on an event AT that place — which is a decision about the truck's schedule, and so is made
   * once on the server and not re-derived here. The operator can then pick any of the others.
   * ⚠️ IT IS STILL STATE, so their choice survives a drag; the effect only re-seeds it when the design
   * being edited changes. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewWith(previewPick?.eventId ?? '')
  }, [previewPick?.eventId])

  /* 🔴 THE PREVIEW IS THE RENDERER'S PNG. `designPlaceId` tells the server which design this is, so a
   * place design previews on its own picture, at its own size, with its own name in the location box.
   * ⚠️ THE DEBOUNCE LIVES IN THE EDITOR NOW, not here — one 400ms timer for all three screens. */
  /* ══ 🔴 §2 · THE EVENT THE LIVE TEXT SAYS — FETCHED ONCE PER "Preview with" ══════════════════════
   * ⚠️ `designPlaceId` TRAVELS WITH IT, so a place's design previews with that place's own name in the
   * venue box — exactly as its PNG does, through the same substitution on the server.
   * ⛔ A FAILURE IS SILENT AND LEAVES IT `null`, which the editor reads as "fall back to the PNG": a
   * private booking is refused for a single post, and that refusal must not empty the stage. */
  /* 🔴 **IT CARRIES THE ID AND THE DESIGN IT IS FOR, AND THAT IS NOT BOOKKEEPING.** Switching from one
   * preview event to another leaves the old answer in state until the new one lands — so without the
   * key the stage would draw LAST event's words for a moment, which is the exact bug §2 exists to
   * remove, reintroduced one layer up. ⚠️ IT ALSO MEANS NOTHING HAS TO BE **CLEARED**: a mismatch reads
   * as "not loaded", so there is no synchronous `setState` in this effect at all. */
  const [liveEvent, setLiveEvent] = useState<
    { id: string; forPlace: string | null; entry: DayEntry; date: string } | null
  >(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      if (!previewWith) return
      try {
        const r = await api(token, {
          action: 'event_preview_entry',
          eventId: previewWith,
          designPlaceId: current ?? undefined,
        })
        if (alive && r.entry) {
          setLiveEvent({
            id: previewWith, forPlace: current ?? null,
            entry: r.entry as DayEntry, date: String(r.date),
          })
        }
      } catch { /* the stage falls back to the PNG, which is what it drew before §2 */ }
    })()
    return () => { alive = false }
  }, [token, previewWith, current])

  const renderPreview = useCallback(async (l: AnyLayout, eventId: string) => {
    if (!eventId) return null
    const r = await renderPng(token, {
      action: 'event_render', eventId, layout: l,
      designPlaceId: current ?? undefined,
    })
    return { url: r.url, warnings: r.warnings }
  }, [token, current])

  /* ⛔ `toggleBox` LIVED HERE AND IS NOW THE EDITOR'S. The last-toggle rule (keep either Place or Time
   * on, or a cancelled event reads as an ordinary poster) applies to all three design screens, so it
   * belongs in the one component they share — and `validateLayout` enforces it for the weekly post as
   * well as `validateEventLayout` does for this one. Keeping a copy here would have been a second
   * answer to one rule on one of the two screens that uses it. */

  // ── PICTURES ───────────────────────────────────────────────────────────────────────────────────
  const uploadStandard = async (file: File) => {
    setBusy(true); setMsg(null)
    try {
      const done = await uploadTo(token, file, 'event-default')
      const stranded = (done.strandedPlaces ?? []) as { name: string }[]
      /* 🔴 THE TRUCK IS TOLD WHICH PLACE PICTURES NO LONGER FIT, by name. They are kept, not deleted —
       * re-exporting a Standard picture is not a request to throw away per-place artwork.
       * ⚠️ ONLY PLACES ON STANDARD'S POSITIONS CAN BE STRANDED THIS WAY; a place with its own positions
       * is measured against its own picture, so a new Standard shape cannot invalidate it. */
      /* ══ 🔴 §B8 · ONLY WHEN THE SHAPE REALLY CHANGED ════════════════════════════════════════════
       * ⛔ `resetLayout` IS TRUE FOR ANY NEW PICTURE OF A DIFFERENT **SIZE**, including a re-export of
       * the same artwork at a higher resolution — where `scaleEventLayout` carries every box across and
       * nothing has moved at all. Saying "the boxes have been reset" then is a claim the operator can
       * check and find false. ⚠️ THE STRANDED-PLACES SENTENCE IS A DIFFERENT MESSAGE AND KEEPS ITS OWN
       * SLOT: it names artwork that will not be used, which is not a transient notice. */
      /* ⚠️ `Number(...)` BECAUSE `uploadTo` IS TYPED AS A BAG OF JSON. The server sends numbers; the
       * cast says so at the one place that does arithmetic on them. */
      const newW = Number(done.width), newH = Number(done.height)
      const shapeChanged = Number.isFinite(newW) && Number.isFinite(newH) && newW > 0 && newH > 0 && !!standard
        && Math.abs((standard.width / Math.max(1, standard.height)) - (newW / Math.max(1, newH))) > 0.01
      if (stranded.length) {
        setMsg({
          bad: false,
          text: `These place pictures use the standard positions and are a different shape, so they won’t be used until you replace them: ${stranded.map(s => s.name).join(', ')}.`,
        })
      } else if (done.resetLayout && shapeChanged) {
        setFlash(NEW_SHAPE_RESET)
      }
      setCurrent(null)
      await load()
      onPictureChanged?.()
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'The upload failed', bad: true }) }
    finally { setBusy(false) }
  }

  const uploadPlace = async (placeId: string, file: File) => {
    setBusy(true); setMsg(null)
    try {
      const done = await uploadTo(token, file, 'place', { placeId })
      /* ⚠️ THE SERVER MAY HAVE RESET THIS PLACE'S BOXES — a different shape makes the old coordinates
       * meaningless. It returns the layout it stored, and `load()` brings it back; the message says so
       * rather than letting the boxes appear to move on their own. */
      if (done.layout) setMsg({ text: 'Picture replaced.', bad: false })
      await load()
      onPictureChanged?.()
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'The upload failed', bad: true }) }
    finally { setBusy(false) }
  }

  const setMode = async (next: 'own' | 'standard') => {
    if (!current) return
    setBusy(true); setMsg(null)
    try {
      await api(token, { action: 'event_place_mode', placeId: current, mode: next })
      await load()
    } catch (e) {
      /* 🔴 THE REFUSAL IS SHOWN AS IT CAME BACK. "Own → Standard" on a differently shaped picture is
       * refused with a sentence that says what to do about it, and inventing a shorter one here would
       * give the truck less than the server already told us. */
      setMsg({ text: e instanceof Error ? e.message : 'Could not change that', bad: true })
    }
    finally { setBusy(false) }
  }

  const removeDesign = async () => {
    if (!current) return
    setBusy(true); setMsg(null)
    try {
      if (placeDesign) await api(token, { action: 'event_remove_place_design', placeId: current })
      setPending(prev => prev.filter(pl => pl.id !== current))
      setCurrent(null)
      await load()
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Could not remove', bad: true }) }
    finally { setBusy(false); setConfirmRemove(false) }
  }

  const save = async (next: AnyLayout) => {
    setSaving(true); setMsg(null)
    try {
      const layout = next
      if (current === null) await api(token, { action: 'event_save_design', layout })
      else await api(token, { action: 'event_place_save_layout', placeId: current, layout })
      setMsg({ text: 'Design saved.', bad: false })
      await load()
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Could not save', bad: true }) }
    finally { setSaving(false) }
  }

  if (loading) return <Card className="p-8 text-center"><p className="text-sm text-slate-400">Loading…</p></Card>

  // ── no picture yet ──────────────────────────────────────────────────────────────────────────────
  if (!standard) {
    return (
      <Card className="p-6">
        {/* ⚠️ "single event post", MATCHING THE BOX ON Designs THAT OPENS THIS CARD. */}
        <p className="font-bold text-slate-800">Set up your single event post</p>
        {/* ⚠️ "those three" BECAME "those" (5 October 2026). The sentence already lists the three
          * things, so counting them again made the reader go back and check. */}
        <p className="text-sm text-slate-600 mt-1 max-w-prose">
          Upload the picture you use for a single event — your artwork with no date, place or time on it.
          HatchGrab adds those for each event.
        </p>
        <label className="mt-4 inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
          <input type="file" accept="image/png,image/jpeg" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void uploadStandard(f) }} />
          {busy ? 'Uploading…' : 'Upload your picture'}
        </label>
        <p className="text-xs text-slate-400 mt-2">PNG or JPG, up to 10MB, at least {MIN_UPLOAD_SHORT_SIDE}px on the short side.</p>
        {/* ══ ⛔ THE "a different picture for one place?" POINTER IS GONE (6 October 2026) ═══════════
          * It pointed at the Places tab, which no longer exists — and a truck reading this card is
          * already ON the screen that answers it: this is Social posts › Designs, and Box 3 of that
          * screen is the list of places and their own pictures. A sentence pointing at the room you
          * are standing in is a sentence that makes an operator look for another room.
          * ⛔ AND IT LEFT A TOMBSTONE THAT BROKE A CHECK. The 5 October note quoted the old
          * `href="?section=places"`, and `scripts/places-tab.cjs` §6 tested RAW source for that string
          * — so the comment satisfied the assertion and it passed green for a day on a link that had
          * already been changed. `codeOf` first; it is in that harness's own header. */}
        {msg && <p className={`text-sm mt-2 ${msg.bad ? 'text-red-600' : 'text-slate-600'}`}>{msg.text}</p>}
      </Card>
    )
  }

  const currentName = current
    ? (placeDesign?.name ?? pendingPlace?.name ?? 'This place')
    : 'Standard'

  /** The designs list: Standard first, then every place that has one, then anything pending. */
  const rows: Array<{ id: string | null; name: string; status: string }> = [
    { id: null, name: 'Standard', status: 'Used at every other place' },
    ...designs.map(d => ({ id: d.placeId, name: d.name, status: d.status })),
    ...pending.map(pl => ({ id: pl.id, name: pl.name, status: 'No picture yet — using Standard' })),
  ]

  const pickable = places
    .filter(pl => !pl.hasDesign && !pending.some(p => p.id === pl.id))
    .filter(pl => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return pl.name.toLowerCase().includes(q) || pl.fullName.toLowerCase().includes(q)
        || String(pl.area ?? '').toLowerCase().includes(q)
    })

  /* ⚠️ THE EDITOR IS REMOUNTED PER DESIGN **AND** PER CANVAS SIZE. It holds the undo history and the
   * boxes; carrying either across a switch from Standard to a place with a differently shaped picture
   * would let ⌘Z put a box outside the picture it is now over. The key is the one that changes. */
  const editorKey = `${current ?? 'standard'}:${canvasW}x${canvasH}:${mode}`

  return (
    <div className="space-y-3">
      {/* ⚠️ A PHONE IS TOLD, NOT BLOCKED. Dragging a box on a 390px screen is unpleasant but it works,
          and refusing to show the screen would strand an operator who only has a phone. */}
      <p className="min-[900px]:hidden text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
        Best on a computer or iPad — the boxes are small to drag on a phone.
      </p>

      {/* ══ 🔴 THE DESIGNS LIST IS A PILL ROW ABOVE THE EDITOR NOW ═══════════════════════════════
        * ⛔ IT USED TO BE THE LEFT-HAND COLUMN — and the left-hand column is the TEXT list in the
        * shared editor, which is the thing an operator touches on every edit. A list of designs is
        * touched once, when they arrive; a row of pills across the top is the right weight for it and
        * is the same pattern the Places screen already uses for a short list of things to pick between.
        * ⚠️ HIDDEN IN BOTH FOCUSED MODES. On Social posts › Designs it would be a second copy of Box 3
        * — the same question asked twice on one screen, free to answer differently — and in the place
        * editor it would offer a way out of the page the operator is standing on, past its back link. */}
      {!onlyStandard && !onlyPlaceId && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Designs</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {rows.map(r => (
              <button key={r.id ?? 'standard'} type="button" onClick={() => setCurrent(r.id)}
                title={r.status}
                className={`h-8 px-3 inline-flex items-center rounded-lg border text-sm font-bold ${r.id === current
                  ? 'border-orange-500 text-orange-700 bg-orange-50'
                  : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'}`}>
                {r.id === null ? 'Standard' : r.name}
              </button>
            ))}
            <button type="button" className="h-8 px-3 text-xs text-orange-700 font-bold"
              onClick={() => { setPicking(true); setSearch('') }}>+ Add a design for a place</button>
          </div>
          {/* ⚠️ ONE LINE OF STATUS, FROM THE SERVER, so the row and the editor cannot describe the
            * same design differently. */}
          <p className="text-[11px] text-slate-400 mt-2">{rows.find(r => r.id === current)?.status}</p>
        </div>
      )}

      {flash && (
        <p data-flash className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {flash}
        </p>
      )}

      {layout && canvasW > 0 && canvasH > 0 && (
        <DesignEditor
          onDirtyChange={onDirtyChange}
          onSaver={onSaver}
          key={editorKey}
          token={token}
          designName={current ? `${currentName} · event post design` : 'Single event post design'}
          backLabel={onCancel ? '‹ Designs' : '‹ Back'}
          onBack={onCancel ?? (() => setCurrent(null))}
          initialLayout={layout}
          country={country}
          hasLogo={hasLogo}
          background={{ url: bgUrl, width: canvasW, height: canvasH }}
          onReplacePicture={f => { if (current) void uploadPlace(current, f); else void uploadStandard(f) }}
          replacing={busy}
          pictureNote="Your picture without any date or place on it. We add those."
          previewOptions={previewEvents}
          previewWith={previewWith}
          onPreviewWith={setPreviewWith}
          renderPreview={renderPreview}
          /* 🔴 §2 · WHAT THE LIVE TEXT SAYS. ⚠️ NO NOTE: a note is typed per POST in the modal, so the
           * design preview has none — exactly as the PNG this replaced had none. */
          liveData={liveEvent && liveEvent.id === previewWith && liveEvent.forPlace === (current ?? null)
            ? { kind: 'event', entry: liveEvent.entry, date: liveEvent.date, note: null }
            : null}
          onSave={l => void save(l)}
          saving={saving}
          onCancel={onCancel ?? (() => setCurrent(null))}
          readOnly={!editable}
          /* ⚠️ `onSave` TAKES THE EDITOR'S OWN LAYOUT, not this component's `layout` state. The editor
           * owns the undo history and therefore the live boxes; reading the stale copy here would save
           * whatever the design looked like when the editor was mounted. */
          message={msg}
          scope={current ? {
            mode,
            onMode: m => void setMode(m),
            busy,
            placeName: currentName,
          } : undefined}
          footer={
            /* ⛔ IN THE PLACE EDITOR THE CALLER OWNS THE REMOVE. Social posts puts it at the bottom of
             * the page as "Use Standard design here instead", which is what removing it MEANS — and two
             * controls for one irreversible act, with two different confirms, is how one of them ends
             * up with the wrong wording. */
            current && !onStandard && !onlyPlaceId ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">This place</p>
                {confirmRemove
                  ? <>
                      <p className="text-[11px] text-slate-600 mb-2">
                        Remove {currentName}&rsquo;s picture and text positions? Events there will use your
                        Standard design.
                      </p>
                      <div className="flex gap-2">
                        <Btn label="Remove" colour="red" size="sm" onClick={() => void removeDesign()} />
                        <Btn label="Keep" colour="slate" size="sm" onClick={() => setConfirmRemove(false)} />
                      </div>
                    </>
                  : <button type="button" className="text-xs text-red-600 font-semibold"
                      onClick={() => setConfirmRemove(true)}>Remove this place&rsquo;s design</button>}
              </div>
            ) : null
          }
        />
      )}

      {!previewPick?.eventId && (
        <p className="text-xs text-amber-700">No events yet — add one and the preview will use it.</p>
      )}

      {/* ── THE PLACE PICKER ─────────────────────────────────────────────────────────────────────
        * ⚠️ THE SAME LIST AS ADD EVENT — favourites first, then by name, with a search — because it is
        * the same question ("which of my places?") and a truck should not have to learn it twice. The
        * order comes from the server so the two screens cannot drift apart. */}
      {picking && !onlyStandard && !onlyPlaceId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setPicking(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100">
              <p className="font-bold text-slate-800 text-sm">Add a design for a place</p>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search places"
                className="mt-2 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div className="overflow-y-auto p-2">
              {pickable.length === 0 && (
                <p className="text-xs text-slate-400 p-2">
                  {places.length === 0 ? 'No places yet.' : 'Every place already has a design.'}
                </p>
              )}
              {pickable.map(pl => (
                <button key={pl.id} type="button"
                  className="block w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50"
                  onClick={() => {
                    setPending(prev => [...prev, pl])
                    setCurrent(pl.id)
                    setPicking(false)
                  }}>
                  <span className="block text-sm font-semibold text-slate-700 truncate">
                    {pl.isFavourite ? '★ ' : ''}{pl.name}
                  </span>
                  {pl.area && <span className="block text-[11px] text-slate-400">{pl.area}</span>}
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-slate-100 flex justify-end">
              <Btn label="Cancel" colour="slate" size="sm" onClick={() => setPicking(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


/* ⛔ `SelectBtn` IS GONE WITH THE LEFT-HAND COLUMN IT BELONGED TO. The shared editor's item list
 * draws its own rows — with a switch and a live sample, which this had neither of. */

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE MODAL — "Post for this event"
// ════════════════════════════════════════════════════════════════════════════════════════════════

export function EventPostModal({ token, eventId, onClose, onNeedsSetup, captionOverride }: {
  token: string
  eventId: string
  onClose: () => void
  onNeedsSetup: () => void
  /**
   * ══ 🔴 THE CAPTION THE OPERATOR TYPED ON THE Create a post CARD (9 October 2026) ════════════════
   *
   * ⛔ WITHOUT THIS THE EDITABLE CAPTION BOX WOULD BE A LIE. It sits on the card above the button, it
   * is prefilled from the template, and the brief says typing in it changes the caption for THIS post
   * — so if the modal went on using its own `info.text`, the operator's words would be visible right
   * up to the moment they pressed Share and then silently discarded.
   * ⚠️ `undefined` MEANS "USE THE SERVER'S", which is what every other door into this modal passes:
   * Schedule › Events' own "Make post" has no caption box in front of it. ⛔ AND AN EMPTY STRING IS
   * NOT undefined — a truck who deliberately cleared the box gets an empty caption, not the template
   * back. The two states are different and `??` would collapse them.
   */
  captionOverride?: string
}) {
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<{
    hasDesign: boolean
    event: { date: string; name: string; town: string | null; time: string; status: string }
    options: { source: string; path: string; label: string }[]
    chosen: string
    /** Whose text positions this event gets — 'place' when the place has its own. */
    layoutSource: 'standard' | 'place'
    placeName: string
    text: string
    /** 🔴 The location this post is about, or null for a private booking. §6's tick box names it. */
    placeId?: string | null
  } | null>(null)
  const [choice, setChoice] = useState<string>('')
  /* ══ 🔴 §6 · "Also save it for <location>" ═════════════════════════════════════════════════════
   * ⛔ IT IS READ AT **UPLOAD** TIME, NOT AT RENDER TIME, so it has to be ticked before the file is
   * chosen — which is why it sits directly above the upload link rather than beside the radio. The
   * server writes a `place_pictures` row for the SAME object and points the location's event slot at
   * it; the one-off row is still written too, so this post keeps its own image either way.
   * ⚠️ IT IS NOT A SETTING AND IS NOT REMEMBERED. Each upload asks again, because "save this one" is a
   * statement about one file. */
  const [alsoSave, setAlsoSave] = useState(false)
  const [png, setPng] = useState<string | null>(null)
  /** The same picture as `png`, as the blob it came from — the share bar builds its `File` from this. */
  const [pngBlob, setPngBlob] = useState<Blob | null>(null)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api(token, { action: 'event_post', eventId })
      if (!r.hasDesign) { onNeedsSetup(); return }
      setInfo(r)
      setChoice(r.chosen)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not load') }
    finally { setLoading(false) }
  }, [token, eventId, onNeedsSetup])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!info || !choice) return
    let alive = true
    ;(async () => {
      try {
        /* ⛔ `placePictureId` IS NO LONGER SENT — the picture chooser went with the library model. A
         * location has one event image, and `background: choice` already says whether this post uses
         * it, the standard design, or a one-off. The server no longer reads the parameter either. */
        const r = await renderPng(token, { action: 'event_render', eventId, background: choice, note })
        if (!alive) return
        setPng(prev => { if (prev) URL.revokeObjectURL(prev); return r.url })
        /* ⚠️ FROM THE SAME RESPONSE as the URL, so Share and Download cannot disagree. */
        setPngBlob(r.blob)
      } catch (e) { if (alive) setMsg(e instanceof Error ? e.message : 'Could not build the picture') }
    })()
    return () => { alive = false }
  }, [token, eventId, choice, note, info])

  const uploadOneOff = async (file: File) => {
    setBusy(true); setMsg(null)
    /* ⚠️ THE TICK IS CLEARED AFTER THE UPLOAD, below, whether it succeeded or not — see the `finally`.
     * A box that stayed ticked would quietly re-save the NEXT upload against the location too. */
    try {
      await uploadTo(token, file, 'one-off', { eventId, alsoSaveForPlace: alsoSave, fileName: file.name })
      await load()
      /* 🔴 A ONE-OFF IS SELECTED AS SOON AS IT IS UPLOADED — the brief's rule, and the obvious reading
       * of the act: nobody uploads a picture for this event and then wants the default. */
      setChoice('event')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'The upload failed') }
    finally { setBusy(false); setAlsoSave(false) }
  }

  /* ⛔ `copy()` IS GONE TOO. Its one caller was the "Copy text" button in the row below, which is now
   * the share bar's "Copy caption" — and that bar does the copy itself, without an `await` before it,
   * for the same activation reason the share does. */

  /* ⛔ `share()` AND `download()` ARE GONE FROM THIS FILE. The `share()` that was here downloaded the
   * picture on a Mac instead of opening the share sheet, and the weekly post had the SAME function
   * with the SAME bug — which is how one report would have become two fixes. Both now call
   * components/manage/PostShareBar.tsx, the only caller of `navigator.share` on either screen. */

  /**
   * 🔴 **THE ONE POST TEXT.** The operator's, if they typed one on the Create a post card; the
   * server's otherwise.
   * ⛔ `!== undefined`, NOT `||` AND NOT `??`. A truck who deliberately emptied the caption box gets
   * an empty caption; `||` would hand them the template back and `??` would too if the prop were ever
   * null. The three states — not offered, offered and empty, offered and typed — are different.
   * ⚠️ READ IN TWO PLACES (the preview and the share bar) FROM ONE `const`, so what is shown and what
   * is copied cannot differ.
   */
  const postText = captionOverride !== undefined ? captionOverride : (info?.text ?? '')

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] md:h-[86vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="shrink-0 flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-3 border-b border-slate-200">
          <div className="min-w-0">
            <h3 className="font-black text-slate-900">Post for this event</h3>
            {info && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {info.event.date} · {info.event.name}{info.event.time ? ` · ${info.event.time}` : ''}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">✕</button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4">
          {loading && <p className="text-sm text-slate-400">Loading…</p>}
          {msg && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-3">{msg}</p>}
          {info && (
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px] gap-4">
              <div className="rounded-xl overflow-hidden bg-slate-100 relative" style={{ aspectRatio: '4 / 5' }}>
                {png
                  ? <img src={png} alt="Your event post" className="absolute inset-0 w-full h-full object-contain" />
                  : <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Building…</div>}
              </div>

              <div className="space-y-3">
                {/* ══ 🔴 "Image" — 7 October 2026, §6 ═════════════════════════════════════════════
                  * ⛔ IT WAS "Design", and before that "Background". "Design" was right while a
                  * location could have one, because choosing Standard moved the TEXT as well as the
                  * picture. A location has no design now — it has at most two IMAGES — so the heading
                  * names what is being chosen and the one case where the text moves too is still said
                  * in words directly below, where it is true.
                  * ⚠️ THE OPTIONS' OWN LABELS COME FROM THE SERVER and say "<Location>'s photo" or
                  * "<Location>'s poster" depending on whether the design has a photo space. The client
                  * does not decide which word, so the label and the render cannot disagree. */}
                <Panel title="Image">
                  {info.options.map(o => (
                    <label key={o.source} className="flex items-center gap-2 text-sm text-slate-700 py-1">
                      <input type="radio" name="bg" checked={choice === o.source} onChange={() => setChoice(o.source)} />
                      {o.label}
                    </label>
                  ))}
                  {/* ⚠️ ONLY SAID WHERE IT IS TRUE: the place has its own positions and Standard has
                    * been chosen instead, so what is on screen is not this place's usual layout. */}
                  {choice === 'default' && info.layoutSource === 'place' && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Standard’s picture and Standard’s text positions — not {info.placeName}’s.
                    </p>
                  )}
                  {/* ══ 🔴 "Also save it for <location>" — AND IT IS **ABOVE** THE UPLOAD LINK ══════
                    * ⛔ NOT BESIDE THE RADIO, AND THAT IS NOT A LAYOUT PREFERENCE. The flag is read at
                    * upload time, so it has to be ticked BEFORE the file is chosen; under the link it
                    * would be a box an operator ticks after the thing it affects has already happened.
                    * ⚠️ ONLY WHERE THERE IS A LOCATION TO SAVE AGAINST. A private booking sends no
                    * `placeId` — the privacy rule holds without a second test here. */}
                  {info.placeId && (
                    <label className="mt-2 flex items-start gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={alsoSave} disabled={busy}
                        onChange={e => setAlsoSave(e.target.checked)} data-also-save
                        className="mt-0.5" />
                      <span>{imageChoiceAlsoSave(info.placeName)}</span>
                    </label>
                  )}
                  <label className="block text-xs text-orange-700 font-bold cursor-pointer mt-1">
                    <input type="file" accept="image/png,image/jpeg" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) void uploadOneOff(f) }} />
                    {/* ⚠️ "REPLACE IT" ONCE ONE EXISTS. The radio above already reads "Upload one for
                      * this post only"; the same words twice would read as two different controls for
                      * the same thing. */}
                    {busy ? 'Uploading…'
                      : info.options.some(o => o.source === 'event') ? 'Replace it'
                      : IMAGE_CHOICE_ONE_OFF}
                  </label>
                </Panel>

                {/* ══ ⛔ THE PICTURE CHOOSER IS GONE — 7 October 2026, §6 ══════════════════════════
                  * It drew a tile per picture in this location's library with the Main one ringed, and
                  * it existed because a location could have several and only one was used
                  * automatically. 🔴 A LOCATION HAS ONE EVENT IMAGE NOW, so there is nothing to choose
                  * between: the choice is which SOURCE — this location's, the standard design, or an
                  * upload for this post only — and that is the radio group above. */}

                <Panel title="Note (this post only)">
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none" />
                </Panel>

                <Panel title="Post text">
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{postText}</p>
                </Panel>

                {/* 🔴 THE SHARED BAR — the same one the weekly post uses. */}
                {/* 🔴 THE SHARE BAR GETS `postText`, WHICH IS THE OPERATOR'S IF THEY TYPED ONE. The
                  * preview above it reads from the same value, so what is shown and what is copied
                  * cannot differ — which is the whole reason it is one `const` and not two reads. */}
                <PostShareBar blob={pngBlob} url={png}
                  fileName={`event-post-${info.event.date}.png`}
                  caption={postText} captionWord="Post text" onStatus={setMsg} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
