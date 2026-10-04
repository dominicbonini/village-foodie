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
import { DraggableBox, Panel, Field, Check, SELECT, OptionalColour } from './WeeklyPost'
import { FONT_CHOICES } from '@/lib/weekly-post/font-list'
import {
  defaultEventNoteBox, scaleEventLayout, toggleIsAllowed, LAST_TOGGLE_MESSAGE,
  MAX_UPLOAD_BYTES, MIN_UPLOAD_SHORT_SIDE,
  type Align, type EventLayout, type TextBox,
} from '@/lib/weekly-post/layout'
import { averageSample } from '@/lib/weekly-post/contrast'

type BoxKey = 'date' | 'location' | 'time' | 'note'

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

/** ⚠️ Separate from `api` because the response is a PNG and carries its warnings in a header. */
async function renderPng(token: string, body: Record<string, unknown>) {
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
  return { url: URL.createObjectURL(blob), warnings, source: r.headers.get('X-Background-Source') || '' }
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

export function EventSetupScreen({ token, onCancel }: { token: string; onCancel?: () => void }) {
  const [loading, setLoading] = useState(true)
  const [standard, setStandard] = useState<EventDesign | null>(null)
  const [designs, setDesigns] = useState<PlaceDesignRow[]>([])
  const [places, setPlaces] = useState<PlaceRow[]>([])
  /* 🔴 WHICH DESIGN IS BEING EDITED. `null` is Standard; a string is a place id. One piece of state,
   * because every other panel on the screen is a view of this one choice — the picture, the boxes, the
   * preview and the save target all follow it, and a second "which place" flag would let them disagree. */
  const [current, setCurrent] = useState<string | null>(null)
  /* ⚠️ A PLACE PICKED FROM THE PICKER BUT NOT YET GIVEN ANYTHING. Nothing is written to the database
   * until the truck uploads a picture or switches the place to its own positions, so backing out of a
   * half-made design leaves nothing behind — and the saved list never names a design that does not
   * exist. It lives here, not on the server, for exactly that reason. */
  const [pending, setPending] = useState<PlaceRow[]>([])
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')
  const [layout, setLayout] = useState<EventLayout | null>(null)
  const [selected, setSelected] = useState<BoxKey>('date')
  const [preview, setPreview] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<{ where: string; message: string }[]>([])
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stageW, setStageW] = useState(0)

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
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Could not load', bad: true }) }
    finally { setLoading(false) }
  }, [token])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  // ── THE SELECTED DESIGN, AND EVERYTHING THAT FOLLOWS FROM IT ───────────────────────────────────
  const placeDesign = current ? designs.find(d => d.placeId === current) ?? null : null
  const pendingPlace = current ? pending.find(pl => pl.id === current) ?? null : null
  /* ⚠️ A SELECTED PLACE THAT IS NEITHER SAVED NOR PENDING MEANS THE DESIGN WAS JUST REMOVED under us;
   * falling back to Standard is the only state that can be drawn. */
  const onStandard = current !== null && !placeDesign && !pendingPlace
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
  const scale = canvasW && stageW ? stageW / canvasW : 1

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
    setSelected('date')
    setConfirmRemove(false)
  }, [current, layoutFor])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStageW(el.clientWidth))
    ro.observe(el)
    setStageW(el.clientWidth)
    return () => ro.disconnect()
  }, [bgUrl])

  /* 🔴 THE PREVIEW IS THE RENDERER'S PNG, debounced, exactly as the week setup — the outlines move at
   * once and the picture catches up. `designPlaceId` tells the server which design this is, so a place
   * design previews on its own picture, at its own size, with its own name in the location box. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const eventId = previewPick?.eventId
    if (!layout || !eventId) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const r = await renderPng(token, {
          action: 'event_render', eventId, layout,
          designPlaceId: current ?? undefined,
        })
        setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return r.url })
        setWarnings(r.warnings)
      } catch { /* the outlines still work; the picture is one request behind */ }
    }, 400)
  }, [layout, previewPick?.eventId, current, token])

  // ── the readability sampler (browser-side; see lib/weekly-post/contrast.ts) ─────────────────────
  const bgImg = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!bgUrl) { bgImg.current = null; return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { bgImg.current = img }
    img.onerror = () => { bgImg.current = null }
    img.src = bgUrl
  }, [bgUrl])

  const sampleUnder = useCallback((b: TextBox) => {
    const img = bgImg.current
    if (!img || !img.naturalWidth) return null
    try {
      const c = document.createElement('canvas')
      const w = Math.max(1, Math.min(64, Math.round(b.w / 8)))
      const h = Math.max(1, Math.min(64, Math.round(b.h / 8)))
      c.width = w; c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(img, b.x, b.y, Math.max(1, b.w), Math.max(1, b.h), 0, 0, w, h)
      return averageSample(ctx.getImageData(0, 0, w, h).data)
    } catch { return null }
  }, [])

  const patchBox = useCallback((key: BoxKey, patch: Partial<TextBox>, resample = false) => {
    setLayout(prev => {
      if (!prev) return prev
      const current0 = key === 'note' ? prev.note : (prev[key] as TextBox)
      if (!current0) return prev
      const next = { ...current0, ...patch } as TextBox
      if (resample) next.bgSample = sampleUnder(next)
      return { ...prev, [key]: next } as EventLayout
    })
  }, [sampleUnder])

  /**
   * Switch one of the three boxes on or off.
   *
   * 🔴 THE LAST ONE OF LOCATION AND TIME IS BLOCKED, with the reason said out loud. A cancelled event
   * says so in those two boxes — the place name struck through, and the word CANCELLED where the time
   * goes — so with both off a cancelled event would render as an ordinary poster telling customers to
   * come to something that is not happening. `toggleIsAllowed` is the same rule the validator enforces
   * on the server; this is here so the truck is told rather than refused after a save.
   */
  const toggleBox = (key: 'date' | 'location' | 'time', on: boolean) => {
    setLayout(prev => {
      if (!prev) return prev
      const next = { ...prev, [key]: { ...prev[key], enabled: on } } as EventLayout
      if (!toggleIsAllowed(next)) { setMsg({ text: LAST_TOGGLE_MESSAGE, bad: true }); return prev }
      setMsg(null)
      return next
    })
  }

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
      if (done.resetLayout) {
        setMsg({
          bad: false,
          text: stranded.length
            ? `New picture size — the boxes have been reset. These place pictures use the standard positions and are a different shape, so they won't be used until you replace them: ${stranded.map(s => s.name).join(', ')}.`
            : 'New picture size — the boxes have been reset to a starting position.',
        })
      }
      setCurrent(null)
      await load()
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

  const save = async () => {
    if (!layout) return
    setSaving(true); setMsg(null)
    try {
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
        <p className="font-bold text-slate-800">Set up your event post</p>
        <p className="text-sm text-slate-600 mt-1 max-w-prose">
          Upload the picture you use for a single event — your artwork with no date, place or time on it.
          HatchGrab adds those three for each event.
        </p>
        <label className="mt-4 inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
          <input type="file" accept="image/png,image/jpeg" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void uploadStandard(f) }} />
          {busy ? 'Uploading…' : 'Upload your picture'}
        </label>
        <p className="text-xs text-slate-400 mt-2">PNG or JPG, up to 10MB, at least {MIN_UPLOAD_SHORT_SIDE}px on the short side.</p>
        {msg && <p className={`text-sm mt-2 ${msg.bad ? 'text-red-600' : 'text-slate-600'}`}>{msg.text}</p>}
      </Card>
    )
  }

  const sel: TextBox | null = !layout ? null : selected === 'note' ? layout.note : (layout[selected] as TextBox)
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {previewPick?.label ?? 'The preview uses your next event.'}
        </p>
        <div className="flex items-center gap-2">
          {onCancel && <Btn label="Cancel" colour="slate" onClick={onCancel} />}
          <Btn label={saving ? 'Saving…' : 'Save design'} loading={saving}
            disabled={!editable} onClick={() => void save()} />
        </div>
      </div>

      <p className="md:hidden text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
        Best on a computer or iPad — the boxes are small to drag on a phone.
      </p>
      {msg && (
        <p className={`text-sm rounded-xl px-3 py-2 border ${msg.bad
          ? 'text-red-700 bg-red-50 border-red-200'
          : 'text-slate-600 bg-slate-50 border-slate-200'}`}>{msg.text}</p>
      )}
      {warnings.length > 0 && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {warnings.map((w, i) => <p key={i}>{w.message}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_280px] gap-4">
        {/* ── LEFT · THE DESIGNS ───────────────────────────────────────────────────────────────── */}
        {/* 🔴 ON A PHONE THE LIST BECOMES A DROPDOWN ABOVE THE PREVIEW. A truck with fifteen places
          * would otherwise scroll past fifteen rows to reach the picture they are editing, on the one
          * screen size where the picture is already the smallest. The breakpoint is the grid's own
          * `lg:` — no new one is introduced. */}
        <div className="space-y-3">
          <div className="lg:hidden">
            <Panel title="Design">
              <select value={current ?? ''} onChange={e => setCurrent(e.target.value || null)} className={SELECT}>
                {rows.map(r => <option key={r.id ?? 'standard'} value={r.id ?? ''}>{r.name}</option>)}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                {rows.find(r => r.id === current)?.status}
              </p>
              <button type="button" className="text-xs text-orange-700 font-bold mt-2"
                onClick={() => { setPicking(true); setSearch('') }}>+ Add a design for a place</button>
            </Panel>
          </div>

          <div className="hidden lg:block">
            <Panel title="Designs">
              {rows.map(r => (
                <button key={r.id ?? 'standard'} type="button" onClick={() => setCurrent(r.id)}
                  className={`block w-full text-left px-2 py-1.5 rounded-lg ${r.id === current
                    ? 'bg-orange-50 text-orange-700' : 'hover:bg-slate-50'}`}>
                  <span className={`block text-sm truncate ${r.id === current ? 'font-bold' : 'text-slate-700 font-semibold'}`}>
                    {r.id === null ? 'Standard' : r.name}
                  </span>
                  {/* ⚠️ ONE LINE OF STATUS PER DESIGN, from the server, so the list and the right-hand
                    * column cannot describe the same design differently. */}
                  <span className="block text-[11px] text-slate-400 leading-snug">{r.status}</span>
                </button>
              ))}
              <button type="button" className="text-xs text-orange-700 font-bold mt-2 px-2"
                onClick={() => { setPicking(true); setSearch('') }}>+ Add a design for a place</button>
            </Panel>
          </div>

          <Panel title="Text we add">
            <SelectBtn label="Date" active={selected === 'date'} onClick={() => setSelected('date')} />
            <SelectBtn label="Location" active={selected === 'location'} onClick={() => setSelected('location')} />
            <SelectBtn label="Time" active={selected === 'time'} onClick={() => setSelected('time')} />
            {layout?.note
              ? <>
                  <SelectBtn label="Note box" active={selected === 'note'} onClick={() => setSelected('note')} />
                  <button type="button" disabled={!editable} className="text-xs text-red-600 font-semibold mt-1 disabled:text-slate-300"
                    onClick={() => { setLayout(l => l ? { ...l, note: null } : l); setSelected('date') }}>Remove note box</button>
                </>
              : <button type="button" disabled={!editable} className="text-xs text-orange-700 font-bold mt-1 disabled:text-slate-300"
                  onClick={() => setLayout(l => l ? { ...l, note: defaultEventNoteBox(l) } : l)}>+ Add a note box</button>}
          </Panel>
        </div>

        {/* ── CENTRE · THE PICTURE ─────────────────────────────────────────────────────────────── */}
        <div>
          <div ref={stageRef} className="relative w-full select-none touch-none bg-slate-100 rounded-xl overflow-hidden"
            style={{ aspectRatio: `${canvasW || 1} / ${canvasH || 1}` }}>
            <img src={preview ?? bgUrl} alt="" className="absolute inset-0 w-full h-full object-contain" />
            {layout && (['date', 'location', 'time', 'note'] as BoxKey[]).map(key => {
              const b = key === 'note' ? layout.note : (layout[key] as TextBox)
              if (!b) return null
              /* 🔴 A SWITCHED-OFF BOX IS NOT SHOWN, because nothing is drawn for it. An outline over
               * empty artwork would have the truck arranging text that will never appear. */
              if (key !== 'note' && (layout[key] as { enabled?: boolean }).enabled === false) return null
              if (!editable) {
                /* A read-only outline: the positions come from Standard and are shown, not moved. */
                return (
                  <div key={key} className="absolute border border-dashed border-slate-400/70 rounded pointer-events-none"
                    style={{ left: b.x * scale, top: b.y * scale, width: b.w * scale, height: b.h * scale }} />
                )
              }
              return (
                <DraggableBox key={key} label={key} box={b} scale={scale} active={selected === key}
                  bounds={{ w: canvasW, h: canvasH }}
                  onSelect={() => setSelected(key)}
                  onChange={(patch, done) => patchBox(key, patch, done)} />
              )
            })}
          </div>
          {!previewPick?.eventId && (
            <p className="text-xs text-amber-700 mt-2">No events yet — add one and the preview will use it.</p>
          )}
          {!editable && (
            <p className="text-xs text-slate-500 mt-2">
              These positions come from your Standard design. Choose “Own for this place” to move them
              just for {currentName}.
            </p>
          )}
        </div>

        {/* ── RIGHT · THIS DESIGN ──────────────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <Panel title="Picture">
            <label className={`block text-xs font-bold cursor-pointer ${busy ? 'text-slate-400' : 'text-orange-700'}`}>
              <input type="file" accept="image/png,image/jpeg" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (current) void uploadPlace(current, f)
                  else void uploadStandard(f)
                }} />
              {busy ? 'Uploading…' : 'Replace'}
            </label>
            <p className="text-[11px] text-slate-400 mt-1">
              {current && !placeDesign?.imageUrl
                ? `Using your Standard picture (${standard.width}×${standard.height})`
                : `${canvasW}×${canvasH}`}
            </p>
            {current && mode === 'standard' && (
              <p className="text-[11px] text-slate-400 mt-1">Must be the same shape as your Standard picture.</p>
            )}
          </Panel>

          {current && (
            <Panel title="Text positions">
              {/* 🔴 THE TWO MODES, AND THE WHOLE POINT OF THIS STAGE. "Own for this place" lets a
                * differently laid-out picture — a venue's own artwork with its name already printed on
                * it — carry its own box positions instead of borrowing Standard's. */}
              <select value={mode} disabled={busy}
                onChange={e => void setMode(e.target.value as 'own' | 'standard')} className={SELECT}>
                <option value="standard">Same as Standard</option>
                <option value="own">Own for this place</option>
              </select>
            </Panel>
          )}

          <Panel title="Text we add">
            {/* 🔴 EACH BOX CAN BE SWITCHED OFF, ON EVERY DESIGN INCLUDING STANDARD. A picture that
              * already has the venue name on it needs the Location box gone, not moved off the edge. */}
            <Check label="Date" checked={layout?.date.enabled !== false}
              onChange={v => toggleBox('date', v)} />
            <Check label="Location" checked={layout?.location.enabled !== false}
              onChange={v => toggleBox('location', v)} />
            {layout?.location.enabled === false && (
              /* ⚠️ SAID OUT LOUD UNDER THE TOGGLE. Switching Location off is only correct when the place
               * name is already in the picture; a truck who switched it off by mistake would otherwise
               * post artwork that never says where they are. */
              <p className="text-[11px] text-slate-500 -mt-1 mb-1">
                The place name is in your picture — HatchGrab won’t add it.
              </p>
            )}
            <Check label="Time" checked={layout?.time.enabled !== false}
              onChange={v => toggleBox('time', v)} />
            {layout && !layout.note && (
              <button type="button" disabled={!editable} className="text-xs text-orange-700 font-bold mt-1 disabled:text-slate-300"
                onClick={() => setLayout(l => l ? { ...l, note: defaultEventNoteBox(l) } : l)}>+ Add a note box</button>
            )}
          </Panel>

          <Panel title="Time shows as">
            <select value={layout?.timeDisplay ?? 'from'} disabled={!editable}
              onChange={e => setLayout(l => l ? { ...l, timeDisplay: e.target.value as 'from' | 'range' } : l)}
              className={SELECT}>
              <option value="from">From 5pm</option>
              <option value="range">5pm – 9pm</option>
            </select>
          </Panel>

          {sel && editable && (
            <Panel title={selected === 'note' ? 'Note box' : `${selected[0].toUpperCase()}${selected.slice(1)} box`}>
              <Field label="Font">
                <select value={sel.fontId} onChange={e => patchBox(selected, { fontId: e.target.value })} className={SELECT}>
                  {FONT_CHOICES.map(f => <option key={f.id} value={f.id}>{f.family}</option>)}
                </select>
              </Field>
              <Field label="Size">
                <input type="number" min={6} max={canvasH} value={sel.fontSize}
                  onChange={e => patchBox(selected, { fontSize: Number(e.target.value) || sel.fontSize })} className={SELECT} />
              </Field>
              <Field label="Text colour">
                <input type="color" value={sel.color} onChange={e => patchBox(selected, { color: e.target.value })}
                  className="w-full h-8 rounded border border-slate-200" />
              </Field>
              <Field label="Alignment">
                <select value={sel.align} onChange={e => patchBox(selected, { align: e.target.value as Align })} className={SELECT}>
                  <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
                </select>
              </Field>
              <Check label="Capitals" checked={sel.caps} onChange={v => patchBox(selected, { caps: v })} />
              <Check label="Raised ordinals (16ᵗʰ)" checked={sel.raisedOrdinals} onChange={v => patchBox(selected, { raisedOrdinals: v })} />
              {selected === 'date' && layout && (
                <>
                  <Check label="Two lines" checked={layout.date.twoLines}
                    onChange={v => setLayout(l => l ? { ...l, date: { ...l.date, twoLines: v } } : l)} />
                  <OptionalColour label="Background behind the date" value={layout.date.bgTrading}
                    onChange={v => setLayout(l => l ? { ...l, date: { ...l.date, bgTrading: v } } : l)} />
                </>
              )}
            </Panel>
          )}

          {current && !onStandard && (
            <Panel title="This place">
              {confirmRemove
                ? <>
                    <p className="text-[11px] text-slate-600 mb-2">
                      Remove {currentName}’s picture and text positions? Events there will use your
                      Standard design.
                    </p>
                    <div className="flex gap-2">
                      <Btn label="Remove" colour="red" size="sm" onClick={() => void removeDesign()} />
                      <Btn label="Keep" colour="slate" size="sm" onClick={() => setConfirmRemove(false)} />
                    </div>
                  </>
                : <button type="button" className="text-xs text-red-600 font-semibold"
                    onClick={() => setConfirmRemove(true)}>Remove this place’s design</button>}
            </Panel>
          )}
        </div>
      </div>

      {/* ── THE PLACE PICKER ─────────────────────────────────────────────────────────────────────
        * ⚠️ THE SAME LIST AS ADD EVENT — favourites first, then by name, with a search — because it is
        * the same question ("which of my places?") and a truck should not have to learn it twice. The
        * order comes from the server so the two screens cannot drift apart. */}
      {picking && (
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

function SelectBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`block w-full text-left text-sm px-2 py-1.5 rounded-lg ${active ? 'bg-orange-50 text-orange-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>
      {label}
    </button>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE MODAL — "Post for this event"
// ════════════════════════════════════════════════════════════════════════════════════════════════

export function EventPostModal({ token, eventId, onClose, onNeedsSetup }: {
  token: string
  eventId: string
  onClose: () => void
  onNeedsSetup: () => void
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
  } | null>(null)
  const [choice, setChoice] = useState<string>('')
  const [png, setPng] = useState<string | null>(null)
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
        const r = await renderPng(token, { action: 'event_render', eventId, background: choice, note })
        if (!alive) return
        setPng(prev => { if (prev) URL.revokeObjectURL(prev); return r.url })
      } catch (e) { if (alive) setMsg(e instanceof Error ? e.message : 'Could not build the picture') }
    })()
    return () => { alive = false }
  }, [token, eventId, choice, note, info])

  const uploadOneOff = async (file: File) => {
    setBusy(true); setMsg(null)
    try {
      await uploadTo(token, file, 'one-off', { eventId })
      await load()
      /* 🔴 A ONE-OFF IS SELECTED AS SOON AS IT IS UPLOADED — the brief's rule, and the obvious reading
       * of the act: nobody uploads a picture for this event and then wants the default. */
      setChoice('event')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'The upload failed') }
    finally { setBusy(false) }
  }

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setMsg('Text copied.') }
    catch { setMsg('Could not copy — select the text and copy it by hand.') }
  }

  const download = () => {
    if (!png || !info) return
    const a = document.createElement('a')
    a.href = png
    a.download = `event-post-${info.event.date}.png`
    a.click()
  }

  /**
   * 🔴 TEXT TO THE CLIPBOARD FIRST, THEN THE SHEET. Instagram and Facebook take the image from a share
   * sheet and leave the caption to be pasted, so copying first makes the whole post one gesture — and
   * doing it afterwards is too late, because the sheet takes the page out of focus and the clipboard
   * write is refused.
   */
  const share = async () => {
    if (!png || !info) return
    try { await navigator.clipboard.writeText(info.text) } catch { /* the sheet still opens */ }
    try {
      const blob = await (await fetch(png)).blob()
      const file = new File([blob], `event-post-${info.event.date}.png`, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] })
        setMsg('Text copied — paste it into your post.')
        return
      }
    } catch { /* fall through to the download */ }
    download()
    setMsg('Text copied, and the picture has been downloaded.')
  }

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
                {/* 🔴 "DESIGN", NOT "BACKGROUND", because the choice now moves the text as well as the
                  * picture. A place with its own text positions brings both; choosing Standard at such
                  * a place takes Standard's picture AND Standard's positions, which is said below so
                  * the truck is not surprised by text that moved. */}
                <Panel title="Design">
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
                  <label className="block text-xs text-orange-700 font-bold cursor-pointer mt-1">
                    <input type="file" accept="image/png,image/jpeg" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) void uploadOneOff(f) }} />
                    {/* ⚠️ "REPLACE IT" ONCE ONE EXISTS. The radio above already reads "Upload one for
                      * this event only"; the same words twice would read as two different controls for
                      * the same thing. */}
                    {busy ? 'Uploading…'
                      : info.options.some(o => o.source === 'event') ? 'Replace it'
                      : 'Upload one for this event only'}
                  </label>
                </Panel>

                <Panel title="Note (this post only)">
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none" />
                </Panel>

                <Panel title="Post text">
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{info.text}</p>
                </Panel>

                <div className="flex flex-wrap gap-2">
                  <Btn label="Download image" onClick={download} />
                  <Btn label="Copy text" colour="slate" onClick={() => void copy(info.text)} />
                  <Btn label="Share" colour="slate" onClick={() => void share()} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
