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
  defaultEventNoteBox, MAX_UPLOAD_BYTES, MIN_UPLOAD_SHORT_SIDE,
  type Align, type EventLayout, type TextBox,
} from '@/lib/weekly-post/layout'
import { averageSample } from '@/lib/weekly-post/contrast'

type BoxKey = 'date' | 'location' | 'time' | 'note'

interface PlaceRow {
  id: string
  name: string
  area: string | null
  isFavourite: boolean
  imageUrl: string | null
  width: number | null
  height: number | null
  fitsDefault: boolean
}

interface EventDesign {
  width: number
  height: number
  layout: EventLayout
  backgroundUrl: string | null
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
  const [design, setDesign] = useState<EventDesign | null>(null)
  const [layout, setLayout] = useState<EventLayout | null>(null)
  const [places, setPlaces] = useState<PlaceRow[]>([])
  const [nextEventId, setNextEventId] = useState<string | null>(null)
  const [selected, setSelected] = useState<BoxKey>('date')
  const [preview, setPreview] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<{ where: string; message: string }[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)

  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stageW, setStageW] = useState(0)
  const scale = design && stageW ? stageW / design.width : 1

  const load = useCallback(async () => {
    try {
      const r = await api(token, { action: 'event_load' })
      setDesign(r.design ?? null)
      setLayout(r.design?.layout ?? null)
      setPlaces(r.places ?? [])
      setNextEventId(r.nextEvents?.[0]?.id ?? null)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not load') }
    finally { setLoading(false) }
  }, [token])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStageW(el.clientWidth))
    ro.observe(el)
    setStageW(el.clientWidth)
    return () => ro.disconnect()
  }, [design?.backgroundUrl])

  /* 🔴 THE PREVIEW IS THE RENDERER'S PNG, debounced, exactly as the week setup — the outlines move at
   * once and the picture catches up. It uses the truck's NEXT UPCOMING EVENT, so what they are placing
   * boxes around is their own real wording rather than invented text of a length nothing will be. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!layout || !nextEventId) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const r = await renderPng(token, { action: 'event_render', eventId: nextEventId, layout })
        setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return r.url })
        setWarnings(r.warnings)
      } catch { /* the outlines still work; the picture is one request behind */ }
    }, 400)
  }, [layout, nextEventId, token])

  // ── the readability sampler (browser-side; see lib/weekly-post/contrast.ts) ─────────────────────
  const bgImg = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    const url = design?.backgroundUrl
    if (!url) { bgImg.current = null; return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { bgImg.current = img }
    img.onerror = () => { bgImg.current = null }
    img.src = url
  }, [design?.backgroundUrl])

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
      const current = key === 'note' ? prev.note : (prev[key] as TextBox)
      if (!current) return prev
      const next = { ...current, ...patch } as TextBox
      if (resample) next.bgSample = sampleUnder(next)
      return { ...prev, [key]: next } as EventLayout
    })
  }, [sampleUnder])

  const uploadDefault = async (file: File) => {
    setBusy(true); setMsg(null)
    try {
      const done = await uploadTo(token, file, 'event-default')
      setDesign({
        width: done.width as number, height: done.height as number,
        layout: done.layout as EventLayout, backgroundUrl: done.blankUrl as string,
      })
      setLayout(done.layout as EventLayout)
      const stranded = (done.strandedPlaces ?? []) as { name: string }[]
      /* 🔴 THE TRUCK IS TOLD WHICH PLACE PICTURES NO LONGER FIT, by name. They are kept, not deleted —
       * re-exporting a default is not a request to throw away per-place artwork. */
      if (done.resetLayout) {
        setMsg(stranded.length
          ? `New picture size — the boxes have been reset. These place pictures are a different shape and won't be used until you replace them: ${stranded.map(s => s.name).join(', ')}.`
          : 'New picture size — the boxes have been reset to a starting position.')
      }
      await load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'The upload failed') }
    finally { setBusy(false) }
  }

  const uploadPlace = async (placeId: string, file: File) => {
    setBusy(true); setMsg(null)
    try { await uploadTo(token, file, 'place', { placeId }); await load() }
    catch (e) { setMsg(e instanceof Error ? e.message : 'The upload failed') }
    finally { setBusy(false) }
  }

  const removePlace = async (placeId: string) => {
    setBusy(true)
    try { await api(token, { action: 'event_remove_place_bg', placeId }); await load() }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Could not remove') }
    finally { setBusy(false) }
  }

  const save = async () => {
    if (!layout) return
    setSaving(true)
    try { await api(token, { action: 'event_save_design', layout }); setMsg('Design saved.') }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save') }
    finally { setSaving(false) }
  }

  if (loading) return <Card className="p-8 text-center"><p className="text-sm text-slate-400">Loading…</p></Card>

  // ── no picture yet ──────────────────────────────────────────────────────────────────────────────
  if (!design || !layout) {
    return (
      <Card className="p-6">
        <p className="font-bold text-slate-800">Set up your event post</p>
        <p className="text-sm text-slate-600 mt-1 max-w-prose">
          Upload the picture you use for a single event — your artwork with no date, place or time on it.
          HatchGrab adds those three for each event.
        </p>
        <label className="mt-4 inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
          <input type="file" accept="image/png,image/jpeg" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void uploadDefault(f) }} />
          {busy ? 'Uploading…' : 'Upload your picture'}
        </label>
        <p className="text-xs text-slate-400 mt-2">PNG or JPG, up to 10MB, at least {MIN_UPLOAD_SHORT_SIDE}px on the short side.</p>
        {msg && <p className="text-sm text-red-600 mt-2">{msg}</p>}
      </Card>
    )
  }

  const sel: TextBox | null = selected === 'note' ? layout.note : (layout[selected] as TextBox)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">The preview uses your next event.</p>
        <div className="flex items-center gap-2">
          {onCancel && <Btn label="Cancel" colour="slate" onClick={onCancel} />}
          <Btn label={saving ? 'Saving…' : 'Save design'} loading={saving} onClick={() => void save()} />
        </div>
      </div>

      <p className="md:hidden text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
        Best on a computer or iPad — the boxes are small to drag on a phone.
      </p>
      {msg && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">{msg}</p>}
      {warnings.length > 0 && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {warnings.map((w, i) => <p key={i}>{w.message}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_280px] gap-4">
        {/* ── LEFT ─────────────────────────────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <Panel title="Background">
            <label className="block text-xs text-orange-700 font-bold cursor-pointer">
              <input type="file" accept="image/png,image/jpeg" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void uploadDefault(f) }} />
              {busy ? 'Uploading…' : 'Replace default picture'}
            </label>
            <p className="text-[11px] text-slate-400 mt-1">{design.width}×{design.height}</p>
          </Panel>

          <Panel title="Text we add">
            <SelectBtn label="Date" active={selected === 'date'} onClick={() => setSelected('date')} />
            <SelectBtn label="Location" active={selected === 'location'} onClick={() => setSelected('location')} />
            <SelectBtn label="Time" active={selected === 'time'} onClick={() => setSelected('time')} />
            {layout.note
              ? <>
                  <SelectBtn label="Note box" active={selected === 'note'} onClick={() => setSelected('note')} />
                  <button type="button" className="text-xs text-red-600 font-semibold mt-1"
                    onClick={() => { setLayout(l => l ? { ...l, note: null } : l); setSelected('date') }}>Remove note box</button>
                </>
              : <button type="button" className="text-xs text-orange-700 font-bold mt-1"
                  onClick={() => setLayout(l => l ? { ...l, note: defaultEventNoteBox(l) } : l)}>+ Add a note box</button>}
          </Panel>
        </div>

        {/* ── CENTRE ───────────────────────────────────────────────────────────────────────────── */}
        <div>
          <div ref={stageRef} className="relative w-full select-none touch-none bg-slate-100 rounded-xl overflow-hidden"
            style={{ aspectRatio: `${design.width} / ${design.height}` }}>
            <img src={preview ?? design.backgroundUrl ?? ''} alt="" className="absolute inset-0 w-full h-full object-contain" />
            {(['date', 'location', 'time', 'note'] as BoxKey[]).map(key => {
              const b = key === 'note' ? layout.note : (layout[key] as TextBox)
              if (!b) return null
              return (
                <DraggableBox key={key} label={key} box={b} scale={scale} active={selected === key}
                  bounds={{ w: design.width, h: design.height }}
                  onSelect={() => setSelected(key)}
                  onChange={(patch, done) => patchBox(key, patch, done)} />
              )
            })}
          </div>
          {!nextEventId && (
            <p className="text-xs text-amber-700 mt-2">No upcoming events — add one and the preview will use it.</p>
          )}
        </div>

        {/* ── RIGHT ────────────────────────────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <Panel title="Time shows as">
            <select value={layout.timeDisplay}
              onChange={e => setLayout(l => l ? { ...l, timeDisplay: e.target.value as 'from' | 'range' } : l)}
              className={SELECT}>
              <option value="from">From 5pm</option>
              <option value="range">5pm – 9pm</option>
            </select>
          </Panel>

          {sel && (
            <Panel title={selected === 'note' ? 'Note box' : `${selected[0].toUpperCase()}${selected.slice(1)} box`}>
              <Field label="Font">
                <select value={sel.fontId} onChange={e => patchBox(selected, { fontId: e.target.value })} className={SELECT}>
                  {FONT_CHOICES.map(f => <option key={f.id} value={f.id}>{f.family}</option>)}
                </select>
              </Field>
              <Field label="Size">
                <input type="number" min={6} max={design.height} value={sel.fontSize}
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
              {selected === 'date' && (
                <>
                  <Check label="Two lines" checked={layout.date.twoLines}
                    onChange={v => setLayout(l => l ? { ...l, date: { ...l.date, twoLines: v } } : l)} />
                  <OptionalColour label="Background behind the date" value={layout.date.bgTrading}
                    onChange={v => setLayout(l => l ? { ...l, date: { ...l.date, bgTrading: v } } : l)} />
                </>
              )}
            </Panel>
          )}

          <Panel title="Background for each place (optional)">
            <p className="text-[11px] text-slate-400 mb-2">
              Same size as your default. Used whenever you trade there.
            </p>
            {places.length === 0 && <p className="text-xs text-slate-400">No places yet.</p>}
            {places.map(pl => (
              <div key={pl.id} className="flex items-center gap-2 py-1.5 border-t border-slate-100 first:border-0">
                <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                  {pl.imageUrl
                    ? <img src={pl.imageUrl} alt="" className="w-full h-full object-cover" />
                    : <span className="text-slate-300 text-xs">—</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-700 truncate">{pl.isFavourite ? '★ ' : ''}{pl.name}</p>
                  {pl.imageUrl && !pl.fitsDefault && (
                    <p className="text-[11px] text-amber-700">Different shape — not used until replaced</p>
                  )}
                </div>
                <label className="text-[11px] font-bold text-orange-700 cursor-pointer shrink-0">
                  <input type="file" accept="image/png,image/jpeg" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) void uploadPlace(pl.id, f) }} />
                  {pl.imageUrl ? 'Change' : 'Add'}
                </label>
                {pl.imageUrl && (
                  <button type="button" onClick={() => void removePlace(pl.id)}
                    className="text-[11px] font-bold text-red-600 shrink-0">Remove</button>
                )}
              </div>
            ))}
          </Panel>
        </div>
      </div>
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
                <Panel title="Background">
                  {info.options.map(o => (
                    <label key={o.source} className="flex items-center gap-2 text-sm text-slate-700 py-1">
                      <input type="radio" name="bg" checked={choice === o.source} onChange={() => setChoice(o.source)} />
                      {o.label}
                    </label>
                  ))}
                  <label className="block text-xs text-orange-700 font-bold cursor-pointer mt-1">
                    <input type="file" accept="image/png,image/jpeg" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) void uploadOneOff(f) }} />
                    {busy ? 'Uploading…' : 'Upload one for this event only'}
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
