'use client'
// components/manage/WeeklyPost.tsx — the weekly post: the setup screen and the post screen.
//
// ── 🔴 ONE RENDERER, AND THIS FILE DOES NOT DRAW THE POSTER ────────────────────────────────────────
// Everything the operator sees of their poster — in setup and on the post screen — is a PNG from
// /api/weekly-post, produced by lib/weekly-post/render.ts. There is no HTML imitation anywhere in this
// file. The brief's reason is exact and worth restating: what they approve must be what they download,
// and a CSS lookalike drifts from the renderer the first time either is touched, silently, on artwork
// that goes out to a truck's customers.
//
// What this file DOES draw is the dashed OUTLINES on top of that PNG: they move instantly under the
// finger or mouse, and a debounced request re-renders the picture underneath. So dragging is immediate
// and the truth arrives a moment later, rather than every drag waiting on a round trip.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, Btn } from './primitives'
// ⚠️ `font-list`, NOT `fonts`: this is a client component and `fonts` reads the filesystem.
import { FONT_CHOICES } from '@/lib/weekly-post/font-list'
import {
  defaultNoteBox, MAX_UPLOAD_BYTES, MIN_UPLOAD_SHORT_SIDE,
  type Align, type Layout, type TextBox,
} from '@/lib/weekly-post/layout'
import { averageSample } from '@/lib/weekly-post/contrast'
import { weekLabel } from '@/lib/weekly-post/caption'
import { EventSetupScreen, EventPostModal } from './EventPost'

type BoxKey = 'heading' | 'date' | 'location' | 'time' | 'note'

interface LoadedDesign {
  width: number
  height: number
  layout: Layout
  blankUrl: string | null
  exampleUrl: string | null
}

interface WeekDayView {
  date: string
  entries: { eventId: string; name: string; town: string | null; time: string; status: string }[]
  isDayOff: boolean
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

/* ⚠️ THE RENDER CALL IS SEPARATE because the response is a PNG, not JSON, and it carries its warnings
 * in a header. Treating it like the others would make `r.json()` throw on a valid image. */
async function renderPng(token: string, body: Record<string, unknown>): Promise<{ url: string; warnings: { where: string; message: string }[]; ms: number }> {
  const r = await fetch('/api/weekly-post', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, action: 'render', ...body }),
  })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j.error || 'The preview could not be made')
  }
  const blob = await r.blob()
  let warnings: { where: string; message: string }[] = []
  try { warnings = JSON.parse(decodeURIComponent(r.headers.get('X-Render-Warnings') || '[]')) } catch { /* a header we can live without */ }
  return { url: URL.createObjectURL(blob), warnings, ms: Number(r.headers.get('X-Render-Ms') || 0) }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE ENTRY POINT
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴 THREE OPTIONAL PROPS, SO SOCIAL POSTS CAN OPEN THIS SCREEN AT A PLACE (6 October 2026) ══════
 *
 * ⛔ THE SCREEN ITSELF IS UNCHANGED. Social posts is a set of boxes that OPEN the existing make and
 * setup flows; it does not reimplement either. What it needed was a way to say *which* of the two, and
 * for the week picker to open on the week the operator chose in the box — otherwise they would pick
 * "Next week" and arrive on this week.
 *
 * @param initialMode     'setup' opens Edit design; 'post' (the default) opens the make screen.
 * @param initialWeek     which week the post screen loads first.
 * @param hideKindSwitch  hides the Weekly | Single event switch. Social posts › Designs has a box for
 *                        each, so the switch would be a second way to answer a question already asked.
 * @param onBack          replaces this screen's Cancel with the caller's back link.
 */
export function WeeklyPostApp({
  token, truckName, initialMode, initialWeek, initialDesignKind, hideKindSwitch, onBack,
}: {
  token: string
  truckName: string
  initialMode?: 'setup' | 'post'
  initialWeek?: 'this' | 'next'
  initialDesignKind?: 'week' | 'event'
  /* 🔴 HIDDEN WITH A CLASS, NOT REMOVED, DELIBERATELY. The switch is the only thing in its row;
   * dropping the row would change the gap above the card, so the two routes into this screen would be
   * different heights. `designKind` is still honoured. */
  hideKindSwitch?: boolean
  onBack?: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [design, setDesign] = useState<LoadedDesign | null>(null)
  const [mode, setMode] = useState<'setup' | 'post'>(initialMode ?? 'post')
  const [error, setError] = useState<string | null>(null)
  const [week, setWeek] = useState<'this' | 'next'>('this')
  const [days, setDays] = useState<WeekDayView[]>([])
  const [orderUrl, setOrderUrl] = useState<string | null>(null)
  /** Which design the setup screen is editing. Post screens are unaffected. */
  /* 🔴 "Single event" IS THE DEFAULT (5 October 2026). It is the post a truck makes most often — one
   * per pitch, every week — where the weekly poster is made once and then rarely touched. Opening on
   * the rarer job made the common one a click away every time. */
  /* ⚠️ THE CALLER MAY NAME IT. Social posts › Designs has a box for the weekly design and a box for the
   * event design, so each opens this screen already on the one it is about. With no caller's choice the
   * default is unchanged. */
  const [designKind, setDesignKind] = useState<'week' | 'event'>(initialDesignKind ?? 'event')

  const load = useCallback(async (which?: 'this' | 'next') => {
    try {
      const r = await api(token, { action: 'load', week: which })
      setMissingTable(!!r.missingTable)
      setDesign(r.design ?? null)
      setDays(r.week?.days ?? [])
      setWeek(r.week?.which ?? 'this')
      setOrderUrl(r.orderUrl ?? null)
      /* 🔴 NO DESIGN ⇒ THE SETUP SCREEN, AUTOMATICALLY — the brief's "shown automatically the first
       * time". A post screen with nothing to post from would be a dead end. */
      /* ⚠️ THE CALLER'S CHOICE WINS WHERE THERE IS A DESIGN. With no design there is nothing to post
       * from, so setup is still forced — a post screen with no picture is a dead end whoever opened it. */
      setMode(r.design ? (initialMode ?? 'post') : 'setup')
      setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
    finally { setLoading(false) }
  }, [token, initialMode])

  /* ⚠️ `react-hooks/set-state-in-effect` IS DISABLED HERE, DELIBERATELY AND NARROWLY. The rule's
   * advice — "subscribe to an external system and set state in its callback" — is exactly what this
   * does: the external system is the server, the callback is the awaited response. The setState calls
   * are inside `load`, after an await, so there is no cascading render; the rule is static and cannot
   * see past the call. The same pattern and the same disable appear elsewhere in Manage. */
  /* ⚠️ `initialWeek` IS PASSED TO THE FIRST LOAD, not set afterwards. Loading this week and then
   * reloading next week would show the operator a week they did not ask for, briefly, every time. */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(initialWeek) }, [load, initialWeek])

  if (loading) return <Card className="p-8 text-center"><p className="text-sm text-slate-400">Loading…</p></Card>

  if (missingTable) {
    return (
      <Card className="p-6">
        <p className="font-bold text-slate-800">The weekly post needs a database update</p>
        <p className="text-sm text-slate-500 mt-1">
          The design table has not been created yet. Once the migration has been applied this screen will work.
        </p>
      </Card>
    )
  }

  /* ══ 🔴 THE Week | Single event SWITCH (stage 2) ═══════════════════════════════════
   * ⚠️ IT IS ONLY IN SETUP. The two designs are edited in the same place — Weekly post › Edit design —
   * because they are the same job (place text on your own picture) and a truck should not have to find
   * two screens for it. The POST screens stay separate: a weekly post is made here, a single-event post
   * is made from the event it is about. */
  if (mode === 'setup') {
    return (
      <div className="space-y-3">
        {/* ══ 🔴 ONE HEADING PER VIEW, AND IT IS THE CARD'S (5 October 2026) ════════════════════
          * ⛔ THE OUTER <h2> IS GONE. It rendered "Set up your weekly post" as a large bold page
          * heading while `SetupScreen`'s card rendered the SAME WORDS below it — the weekly view said
          * it twice. The card's heading is the one that survives, and it now uses the event card's
          * style (`font-bold text-slate-800`), which Dominic confirmed is the right one.
          * ⚠️ THE EDITING SCREENS CARRY NO HEADING AT ALL, as they already did — see the note above
          * the toolbar below. Only the two "nothing uploaded yet" cards name the job. */}
        <div className={`flex flex-wrap items-center justify-end gap-2${hideKindSwitch ? ' hidden' : ''}`}>
          {/* 🔴 "Single event" FIRST, AND SELECTED BY DEFAULT. "Week (7 days)" became "Weekly": the
            * parenthetical explained a format nobody was confused about, and it made the two options
            * read as different kinds of thing rather than two choices of the same kind. */}
          <div role="tablist" aria-label="Which design" className="inline-flex rounded-xl border border-slate-200 overflow-hidden">
            {([['event', 'Single event'], ['week', 'Weekly']] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={designKind === k}
                onClick={() => setDesignKind(k)}
                className={`text-xs font-bold px-3 py-1.5 ${designKind === k ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {/* ⚠️ `onBack` REPLACES Cancel WHEN THE CALLER HAS ITS OWN WAY OUT. Social posts opens this as a
            full page under a "‹ Designs" link, and a Cancel that dropped the operator onto the weekly
            POST screen — a screen they did not ask for — would be two exits that disagree. */}
        {designKind === 'week'
          ? <SetupScreen token={token} design={design} onDone={() => { void load(week) }}
              onCancel={onBack ?? (design ? () => setMode('post') : undefined)} />
          : <EventSetupScreen token={token} onCancel={onBack ?? (design ? () => setMode('post') : undefined)} />}
      </div>
    )
  }

  return <PostScreen token={token} truckName={truckName} design={design!} days={days} week={week}
    orderUrl={orderUrl} onWeek={w => { setWeek(w); void load(w) }} onEdit={() => setMode('setup')} error={error} />
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE SETUP SCREEN
// ════════════════════════════════════════════════════════════════════════════════════════════════

function SetupScreen({ token, design, onDone, onCancel }: {
  token: string
  design: LoadedDesign | null
  onDone: () => void
  onCancel?: () => void
}) {
  const [layout, setLayout] = useState<Layout | null>(design?.layout ?? null)
  const [blankUrl, setBlankUrl] = useState<string | null>(design?.blankUrl ?? null)
  const [exampleUrl, setExampleUrl] = useState<string | null>(design?.exampleUrl ?? null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(design ? { w: design.width, h: design.height } : null)
  const [selected, setSelected] = useState<BoxKey>('date')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<{ where: string; message: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showExample, setShowExample] = useState(false)

  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stageW, setStageW] = useState(0)

  /* ⚠️ THE EDITOR SCALE NEVER REACHES STORAGE. Boxes are stored in the blank's own pixels; this is the
   * only place the on-screen size is known, and every drag converts back through it. A design made on
   * a phone therefore renders identically to one made on a desktop. */
  const scale = size && stageW ? stageW / size.w : 1

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStageW(el.clientWidth))
    ro.observe(el)
    setStageW(el.clientWidth)
    return () => ro.disconnect()
  }, [blankUrl])

  // ── the debounced preview ───────────────────────────────────────────────────────────────────────
  /* 🔴 DEBOUNCED WHILE DRAGGING, AND THE OUTLINES DO NOT WAIT FOR IT. Every drag would otherwise be a
   * round trip and a repaint, which on a touch screen feels broken. The outline moves at once; the
   * picture catches up when the finger stops. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestPreview = useCallback((l: Layout, isBusy: boolean) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const r = await renderPng(token, { layout: l, busy: isBusy })
        setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return r.url })
        setWarnings(r.warnings)
      } catch { /* the outlines still work; the picture is one request behind */ }
    }, 400)
  }, [token])

  useEffect(() => { if (layout) requestPreview(layout, busy) }, [layout, busy, requestPreview])

  // ── the readability sampler ─────────────────────────────────────────────────────────────────────
  /* 🔴 SAMPLING HAPPENS HERE BECAUSE ONLY THE BROWSER HAS A DECODER for both PNG and JPG. The server
   * has none (no sharp, no canvas), so the editor samples the blank under each box and stores the
   * average in the design; the renderer decides from it. lib/weekly-post/contrast.ts sets this out.
   * ⚠️ IT FAILS QUIETLY TO "no sample". A cross-origin blank taints the canvas and `getImageData`
   * throws — in which case the renderer adds no shadow at all rather than guessing a background and
   * altering someone's artwork on no evidence. */
  const blankImg = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!blankUrl) { blankImg.current = null; return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { blankImg.current = img }
    img.onerror = () => { blankImg.current = null }
    img.src = blankUrl
  }, [blankUrl])

  const sampleUnder = useCallback((b: TextBox): { r: number; g: number; b: number } | null => {
    const img = blankImg.current
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
      return { ...prev, [key]: next } as Layout
    })
  }, [sampleUnder])

  // ── uploading ───────────────────────────────────────────────────────────────────────────────────
  const upload = async (file: File, which: 'blank' | 'example') => {
    setMsg(null)
    /* ⚠️ CHECKED IN THE BROWSER **AND** ON THE SERVER. This check is for speed — refusing a 40MB file
     * before it is uploaded — not for safety: the server reads the real bytes and is the one that
     * decides, because a client check is advice. */
    if (file.size > MAX_UPLOAD_BYTES) { setMsg(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 10MB.`); return }
    if (!/^image\/(png|jpe?g)$/.test(file.type)) { setMsg('Please choose a PNG or JPG.'); return }
    setUploading(true)
    try {
      const ext = file.type.includes('png') ? 'png' : 'jpg'
      const slot = await api(token, { action: 'upload_url', which, ext })
      const put = await fetch(slot.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!put.ok) throw new Error('The upload did not complete')
      const done = await api(token, { action: 'confirm_upload', path: slot.path, which })
      if (which === 'blank') {
        setSize({ w: done.width, h: done.height })
        setLayout(done.layout)
        setBlankUrl(done.blankUrl)
        if (done.resetLayout) setMsg('New image size — the boxes have been reset to a starting position.')
      } else {
        setExampleUrl(done.exampleUrl)
        setShowExample(true)
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'The upload failed') }
    finally { setUploading(false) }
  }

  const save = async () => {
    if (!layout) return
    setSaving(true)
    try {
      const r = await api(token, { action: 'save_design', layout })
      setMsg(r.warning ?? 'Design saved.')
      onDone()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save') }
    finally { setSaving(false) }
  }

  // ── no blank yet ────────────────────────────────────────────────────────────────────────────────
  if (!layout || !size || !blankUrl) {
    return (
      <Card className="p-6">
        {/* 🔴 THE SAME SIZE AND WEIGHT AS "Set up your event post" (EventPost.tsx) — one style for the
          * two cards that do the same job. It was `text-lg font-black`, which is why it read as a
          * second page heading under the outer one. */}
        <p className="font-bold text-slate-800">Set up your weekly post</p>
        <p className="text-sm text-slate-600 mt-1 max-w-prose">
          Upload the blank version of the weekly schedule graphic you already make — the same design,
          with your own text boxes removed. HatchGrab fills in the week from your schedule.
        </p>
        {/* 🔴 THE CANVA NOTE IS THE WHOLE ONBOARDING. Operators make these in Canva and have no idea
            what "a blank" means until it is spelled out in Canva's own words. */}
        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-sm font-bold text-slate-800">How to export a blank from Canva</p>
          <ol className="text-sm text-slate-600 mt-1 list-decimal ml-5 space-y-0.5">
            <li>Open your usual weekly schedule design.</li>
            <li>Delete the text boxes with the dates, places and times — leave the background and headings you want to keep.</li>
            <li>Share › Download › PNG.</li>
          </ol>
        </div>
        <label className="mt-4 inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
          <input type="file" accept="image/png,image/jpeg" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f, 'blank') }} />
          {uploading ? 'Uploading…' : 'Upload your blank image'}
        </label>
        <p className="text-xs text-slate-400 mt-2">PNG or JPG, up to 10MB, at least {MIN_UPLOAD_SHORT_SIDE}px on the short side.</p>
        {msg && <p className="text-sm text-red-600 mt-2">{msg}</p>}
      </Card>
    )
  }

  const sel: TextBox | null = selected === 'note' ? layout.note : (layout[selected] as TextBox)

  return (
    <div className="space-y-4">
      {/* ⚠️ NO <h2> HERE ANY MORE — the Week | Single event switch above owns the title, so the two
          designs' setup screens carry one heading between them rather than one each. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setBusy(b => !b)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${busy ? 'border-orange-500 text-orange-700 bg-orange-50' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            Preview a busy week
          </button>
          {onCancel && <Btn label="Cancel" colour="slate" onClick={onCancel} />}
          <Btn label={saving ? 'Saving…' : 'Save design'} loading={saving} onClick={() => void save()} />
        </div>
      </div>

      {/* ⚠️ A PHONE IS TOLD, NOT BLOCKED. Dragging a box on a 390px screen is unpleasant but it works,
          and refusing to show the screen would strand an operator who only has a phone. */}
      <p className="md:hidden text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
        Best on a computer or iPad — the boxes are small to drag on a phone.
      </p>
      {msg && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">{msg}</p>}
      {warnings.length > 0 && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {warnings.map((w, i) => <p key={i}>{w.where === 'heading' || w.where === 'note' ? '' : `${w.where}: `}{w.message}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_260px] gap-4">
        {/* ── LEFT: what to place ─────────────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <Panel title="Your design">
            <label className="block text-xs text-orange-700 font-bold cursor-pointer">
              <input type="file" accept="image/png,image/jpeg" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f, 'blank') }} />
              {uploading ? 'Uploading…' : 'Replace blank image'}
            </label>
            <label className="block text-xs text-orange-700 font-bold cursor-pointer mt-2">
              <input type="file" accept="image/png,image/jpeg" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f, 'example') }} />
              {exampleUrl ? 'Replace filled example' : 'Add a filled example'}
            </label>
            {exampleUrl && (
              <label className="flex items-center gap-2 mt-2 text-xs text-slate-600">
                <input type="checkbox" checked={showExample} onChange={e => setShowExample(e.target.checked)} />
                Show example faintly
              </label>
            )}
          </Panel>

          <Panel title="Heading">
            <SelectBoxButton label="Heading" active={selected === 'heading'} onClick={() => setSelected('heading')} />
          </Panel>

          <Panel title="Each day row">
            <p className="text-[11px] text-slate-400 mb-1">Place row 1&apos;s three boxes. The other six days copy it.</p>
            <SelectBoxButton label="Date" active={selected === 'date'} onClick={() => setSelected('date')} />
            <SelectBoxButton label="Location" active={selected === 'location'} onClick={() => setSelected('location')} />
            <SelectBoxButton label="Time" active={selected === 'time'} onClick={() => setSelected('time')} />
          </Panel>

          <Panel title="Note">
            {layout.note
              ? <>
                  <SelectBoxButton label="Note box" active={selected === 'note'} onClick={() => setSelected('note')} />
                  <button type="button" className="text-xs text-red-600 font-semibold mt-1"
                    onClick={() => { setLayout(l => l ? { ...l, note: null } : l); setSelected('date') }}>Remove note box</button>
                </>
              : <button type="button" className="text-xs text-orange-700 font-bold"
                  onClick={() => setLayout(l => l ? { ...l, note: defaultNoteBox(l) } : l)}>+ Add a note box</button>}
            <p className="text-[11px] text-slate-400 mt-1">A note box only shows when the week has a note.</p>
          </Panel>
        </div>

        {/* ── CENTRE: the real render, with draggable outlines on top ─────────────────────────── */}
        <div>
          <div ref={stageRef} className="relative w-full select-none touch-none bg-slate-100 rounded-xl overflow-hidden"
            style={{ aspectRatio: `${size.w} / ${size.h}` }}>
            {/* 🔴 THE PICTURE IS THE RENDERER'S PNG. Until the first one arrives the blank itself is
                shown, so the stage is never empty. */}
            <img src={preview ?? blankUrl} alt="" className="absolute inset-0 w-full h-full object-contain" />
            {showExample && exampleUrl && (
              <img src={exampleUrl} alt="" className="absolute inset-0 w-full h-full object-contain opacity-30 pointer-events-none" />
            )}
            {/* The six copied rows, shown faintly so the spacing can be judged. Not interactive. */}
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="absolute border border-dashed border-white/25 pointer-events-none"
                style={{
                  left: layout.date.x * scale, top: (layout.date.y + layout.rowSpacing * i) * scale,
                  width: (layout.time.x + layout.time.w - layout.date.x) * scale, height: layout.date.h * scale,
                }} />
            ))}
            {(['heading', 'date', 'location', 'time', 'note'] as BoxKey[]).map(key => {
              const b = key === 'note' ? layout.note : (layout[key] as TextBox)
              if (!b) return null
              return (
                <DraggableBox key={key} label={key} box={b} scale={scale} active={selected === key}
                  bounds={size}
                  onSelect={() => setSelected(key)}
                  onChange={(patch, done) => patchBox(key, patch, done)} />
              )
            })}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Place row 1&apos;s three boxes: Date · Location · Time. The other six days copy it.
          </p>
        </div>

        {/* ── RIGHT: the selected box's controls ──────────────────────────────────────────────── */}
        <div className="space-y-3">
          {sel && (
            <Panel title={selected === 'date' ? 'Date box' : selected === 'location' ? 'Location box' : selected === 'time' ? 'Time box' : selected === 'note' ? 'Note box' : 'Heading'}>
              <Field label="Font">
                <select value={sel.fontId} onChange={e => patchBox(selected, { fontId: e.target.value })} className={SELECT}>
                  {FONT_CHOICES.map(f => <option key={f.id} value={f.id}>{f.family}</option>)}
                </select>
              </Field>
              <Field label="Size">
                <input type="number" min={6} max={size.h} value={sel.fontSize}
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
              <Check label="Raised ordinals (28ᵗʰ)" checked={sel.raisedOrdinals} onChange={v => patchBox(selected, { raisedOrdinals: v })} />
              {selected === 'date' && (
                <>
                  <Check label="Two lines" checked={layout.date.twoLines}
                    onChange={v => setLayout(l => l ? { ...l, date: { ...l.date, twoLines: v } } : l)} />
                  <OptionalColour label="Background on trading days" value={layout.date.bgTrading}
                    onChange={v => setLayout(l => l ? { ...l, date: { ...l.date, bgTrading: v } } : l)} />
                  <OptionalColour label="Background on days off" value={layout.date.bgDayOff}
                    onChange={v => setLayout(l => l ? { ...l, date: { ...l.date, bgDayOff: v } } : l)} />
                </>
              )}
              {selected === 'heading' && (
                <Field label="Heading text">
                  <input value={layout.heading.text}
                    onChange={e => setLayout(l => l ? { ...l, heading: { ...l.heading, text: e.target.value } } : l)}
                    className={SELECT} />
                  <p className="text-[11px] text-slate-400 mt-0.5">Use {'{start}'} and {'{end}'} for the week&apos;s dates.</p>
                </Field>
              )}
            </Panel>
          )}

          <Panel title="Days off">
            <Field label="Location shows">
              <input value={layout.daysOffText}
                onChange={e => setLayout(l => l ? { ...l, daysOffText: e.target.value } : l)} className={SELECT} />
            </Field>
          </Panel>

          <Panel title="Rows">
            <Field label="Spacing between days (px)">
              <input type="number" min={1} max={size.h} value={layout.rowSpacing}
                onChange={e => setLayout(l => l ? { ...l, rowSpacing: Number(e.target.value) || l.rowSpacing } : l)} className={SELECT} />
            </Field>
            <p className="text-[11px] text-slate-400">Days run Monday to Sunday.</p>
          </Panel>

          <Panel title="Times & text">
            <Field label="Times show as">
              <select value={layout.timeStyle} onChange={e => setLayout(l => l ? { ...l, timeStyle: e.target.value as '12h' | '24h' } : l)} className={SELECT}>
                <option value="12h">5pm – 8pm</option>
                <option value="24h">17:00 – 20:00</option>
              </select>
            </Field>
            <Check label="Keep text readable" checked={layout.keepReadable}
              onChange={v => setLayout(l => l ? { ...l, keepReadable: v } : l)} />
            <Check label="Show cancelled events" checked={layout.showCancelled}
              onChange={v => setLayout(l => l ? { ...l, showCancelled: v } : l)} />
          </Panel>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE DRAGGABLE OUTLINE
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * 🔴 POINTER EVENTS, NOT MOUSE EVENTS. One set of handlers covers mouse, trackpad, pen and touch, and
 * `setPointerCapture` keeps the drag attached to this element even when the finger leaves it — which
 * on a small box is most of the drag. Mouse handlers plus a separate touch path would be two
 * implementations of the same gesture, and the touch one is the one that gets tested last.
 *
 * ⚠️ `touch-action: none` ON THE STAGE is what stops the browser treating a drag as a page scroll. A
 * `preventDefault` in the handler is too late: by then the gesture has been claimed.
 *
 * ⚠️ THE BOX IS CLAMPED TO THE IMAGE. The validator refuses a box that reaches outside, so letting one
 * be dragged there would produce a design that cannot be saved and an error at the end of the work.
 */
export function DraggableBox({ label, box, scale, active, bounds, onSelect, onChange }: {
  label: string
  box: TextBox
  scale: number
  active: boolean
  bounds: { w: number; h: number }
  onSelect: () => void
  onChange: (patch: Partial<TextBox>, done: boolean) => void
}) {
  const start = useRef<{ px: number; py: number; box: TextBox; mode: 'move' | 'nw' | 'ne' | 'sw' | 'se' } | null>(null)

  /* ⚠️ THE MODE COMES OFF `data-mode`, NOT FROM A CLOSURE PER HANDLE. Writing
   * `onPointerDown={e => begin(e, m)}` inside the handles' `.map()` creates a new function per handle
   * per render that reaches a ref — which React Compiler's lint rejects ("Passing a ref to a function
   * may read its value during render"). One handler reading the attribute has no closure to capture,
   * and it is also what makes all five pointer handlers below identical. */
  const begin = (e: React.PointerEvent) => {
    e.stopPropagation()
    onSelect()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const mode = (el.dataset.mode as 'move' | 'nw' | 'ne' | 'sw' | 'se') || 'move'
    start.current = { px: e.clientX, py: e.clientY, box, mode }
  }

  const move = (e: React.PointerEvent) => {
    const s = start.current
    if (!s) return
    const dx = (e.clientX - s.px) / scale
    const dy = (e.clientY - s.py) / scale
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)))
    if (s.mode === 'move') {
      onChange({
        x: clamp(s.box.x + dx, 0, bounds.w - s.box.w),
        y: clamp(s.box.y + dy, 0, bounds.h - s.box.h),
      }, false)
      return
    }
    /* ⚠️ A MINIMUM OF 8px EACH WAY, matching the validator's floor. A box dragged to zero would be
     * saveable-looking and then rejected. */
    const MIN = 8
    let { x, y, w, h } = s.box
    if (s.mode === 'se') { w = clamp(s.box.w + dx, MIN, bounds.w - x); h = clamp(s.box.h + dy, MIN, bounds.h - y) }
    if (s.mode === 'sw') { const nx = clamp(s.box.x + dx, 0, s.box.x + s.box.w - MIN); w = s.box.x + s.box.w - nx; x = nx; h = clamp(s.box.h + dy, MIN, bounds.h - y) }
    if (s.mode === 'ne') { const ny = clamp(s.box.y + dy, 0, s.box.y + s.box.h - MIN); h = s.box.y + s.box.h - ny; y = ny; w = clamp(s.box.w + dx, MIN, bounds.w - x) }
    if (s.mode === 'nw') {
      const nx = clamp(s.box.x + dx, 0, s.box.x + s.box.w - MIN)
      const ny = clamp(s.box.y + dy, 0, s.box.y + s.box.h - MIN)
      w = s.box.x + s.box.w - nx; h = s.box.y + s.box.h - ny; x = nx; y = ny
    }
    onChange({ x, y, w, h }, false)
  }

  /* 🔴 THE BACKGROUND IS RE-SAMPLED ON RELEASE, NOT ON EVERY MOVE. Sampling is a canvas draw and a
   * `getImageData` per frame otherwise, and the answer only matters once the box has stopped. */
  const end = () => { if (start.current) { start.current = null; onChange({}, true) } }

  const HANDLE = 'absolute w-6 h-6 -m-3 rounded-full bg-white border-2 border-orange-500 shadow touch-none'
  return (
    <div
      data-mode="move"
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className={`absolute touch-none cursor-move border-2 border-dashed ${active ? 'border-orange-500 bg-orange-500/10' : 'border-white/70'}`}
      style={{ left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale }}
    >
      <span className={`absolute -top-5 left-0 text-[10px] font-bold px-1 rounded ${active ? 'bg-orange-500 text-white' : 'bg-black/50 text-white'}`}>{label}</span>
      {active && (['nw', 'ne', 'sw', 'se'] as const).map(m => (
        <span key={m} className={HANDLE} data-mode={m}
          style={{
            left: m === 'nw' || m === 'sw' ? 0 : '100%',
            top: m === 'nw' || m === 'ne' ? 0 : '100%',
          }}
          onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE POST SCREEN
// ════════════════════════════════════════════════════════════════════════════════════════════════

function PostScreen({ token, truckName, design, days, week, orderUrl, onWeek, onEdit, error }: {
  token: string
  truckName: string
  design: LoadedDesign
  days: WeekDayView[]
  week: 'this' | 'next'
  orderUrl: string | null
  onWeek: (w: 'this' | 'next') => void
  onEdit: () => void
  error: string | null
}) {
  const [excluded, setExcluded] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [showCancelled, setShowCancelled] = useState(design.layout.showCancelled)
  const [png, setPng] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<{ where: string; message: string }[]>([])
  const [caption, setCaption] = useState('')
  const [perEvent, setPerEvent] = useState<{ eventId: string; date: string; name: string; status: string; text: string }[]>([])
  const [busyMsg, setBusyMsg] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  /** The event whose single-event post modal is open, if any. */
  const [postEventId, setPostEventId] = useState<string | null>(null)

  const allEvents = useMemo(
    () => days.flatMap(d => d.entries.map(e => ({ ...e, date: d.date }))),
    [days])

  const refresh = useCallback(async () => {
    setRendering(true)
    try {
      const layout = { ...design.layout, showCancelled }
      const [img, caps] = await Promise.all([
        renderPng(token, { week, excluded, note, layout }),
        api(token, { action: 'captions', week, excluded, note }),
      ])
      setPng(prev => { if (prev) URL.revokeObjectURL(prev); return img.url })
      setWarnings(img.warnings)
      setCaption(caps.caption ?? '')
      setPerEvent(caps.perEvent ?? [])
    } catch (e) { setBusyMsg(e instanceof Error ? e.message : 'Could not build the post') }
    finally { setRendering(false) }
  }, [token, week, excluded, note, showCancelled, design.layout])

  /* ⚠️ SAME NARROW DISABLE, SAME REASON as the load effect above: the state is set after an awaited
   * render and caption request, not synchronously in the effect body. */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh() }, [refresh])

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setBusyMsg(`${what} copied.`) }
    catch { setBusyMsg('Could not copy — select the text and copy it by hand.') }
  }

  /**
   * 🔴 SHARE: THE CAPTION GOES TO THE CLIPBOARD FIRST, THEN THE SHEET OPENS. Instagram and Facebook
   * both take the image from the share sheet and leave the caption to be pasted, so copying first is
   * what makes the whole post one gesture. Doing it afterwards would be too late — the sheet takes the
   * page out of focus and the clipboard write is refused.
   * ⚠️ FILE SHARING IS FEATURE-DETECTED with `canShare({ files })`, not assumed from the user agent.
   * Where it is unsupported this falls back to a download plus "caption copied", which is the brief's
   * rule and is also what desktop Safari needs.
   */
  const share = async () => {
    if (!png) return
    try { await navigator.clipboard.writeText(caption) } catch { /* the sheet still opens */ }
    try {
      const blob = await (await fetch(png)).blob()
      const file = new File([blob], `weekly-post-${week}.png`, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] })
        setBusyMsg('Caption copied — paste it into your post.')
        return
      }
    } catch { /* fall through to the download */ }
    download()
    setBusyMsg('Caption copied, and the image has been downloaded.')
  }

  const download = () => {
    if (!png) return
    const a = document.createElement('a')
    a.href = png
    a.download = `weekly-post-${week}.png`
    a.click()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black text-slate-900">Your weekly post</h2>
        <button type="button" onClick={onEdit} className="text-xs font-bold text-orange-700">Edit design</button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {busyMsg && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">{busyMsg}</p>}
      {warnings.length > 0 && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {warnings.map((w, i) => <p key={i}>{w.where}: {w.message}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            {(['this', 'next'] as const).map(w => (
              <button key={w} type="button" onClick={() => onWeek(w)}
                className={`text-sm font-bold px-3 py-1.5 rounded-lg border ${week === w ? 'border-orange-500 text-orange-700 bg-orange-50' : 'border-slate-200 text-slate-600'}`}>
                {w === 'this' ? 'This week' : 'Next week'}
              </button>
            ))}
            <span className="text-xs text-slate-400">{days[0] ? `w/c ${weekLabel(days[0].date)}` : ''}</span>
          </div>

          <div className="relative rounded-xl overflow-hidden bg-slate-100" style={{ aspectRatio: `${design.width} / ${design.height}` }}>
            {png
              ? <img src={png} alt="Your weekly post" className="absolute inset-0 w-full h-full object-contain" />
              : <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Building your post…</div>}
            {rendering && png && <div className="absolute top-2 right-2 text-[11px] bg-black/60 text-white px-2 py-0.5 rounded">Updating…</div>}
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <Btn label="Download image" onClick={download} />
            <Btn label="Share" colour="slate" onClick={() => void share()} />
          </div>
        </div>

        <div className="space-y-3">
          <Panel title="This week’s events">
            {allEvents.length === 0 && <p className="text-xs text-slate-400">No events this week.</p>}
            {allEvents.map(e => (
              <label key={e.eventId} className="flex items-start gap-2 text-sm text-slate-700 py-1">
                <input type="checkbox" className="mt-1" checked={!excluded.includes(e.eventId)}
                  onChange={ev => setExcluded(x => ev.target.checked ? x.filter(i => i !== e.eventId) : [...x, e.eventId])} />
                <span className="min-w-0">
                  <span className="font-semibold">{e.name}</span>
                  <span className="text-xs text-slate-400 block">{e.date}{e.status === 'cancelled' ? ' · cancelled' : ''}</span>
                </span>
              </label>
            ))}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
              <span className="text-sm text-slate-700">Show cancelled events</span>
              <Toggle on={showCancelled} onToggle={() => setShowCancelled(v => !v)} />
            </div>
          </Panel>

          <Panel title="Note">
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="e.g. Pre-order for collection"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none" />
            <p className="text-[11px] text-slate-400 mt-0.5">Shows in the caption, and in the note box if you placed one.</p>
          </Panel>

          <Panel title="Caption for your page">
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={7}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            <button type="button" onClick={() => void copy(caption, 'Caption')}
              className="text-xs font-bold text-orange-700 mt-1">Copy caption</button>
          </Panel>

          <Panel title="Post for each event">
            {perEvent.length === 0 && <p className="text-xs text-slate-400">Nothing to post this week.</p>}
            {perEvent.map(p => (
              <div key={p.eventId} className="border-t border-slate-100 pt-2 mt-2 first:border-0 first:pt-0 first:mt-0">
                <p className="text-xs font-bold text-slate-700">{p.name}</p>
                <p className="text-xs text-slate-500 whitespace-pre-wrap mt-0.5">{p.text}</p>
                {/* ══ 🔴 STAGE 2 FIXES docs/weekly-post-stage1-report.md §9.3 ════════════════════
                    THE BUG, RECORDED AT THE TIME: "Share" did exactly what "Copy text" did, because
                    there was no per-event image to share and a share sheet carrying only text is worse
                    than a copy. Two buttons doing one thing is a UI that lies about what it offers.
                    🔴 THERE IS NOW AN IMAGE. **Image** opens the single-event post modal for this event;
                    **Share** opens the same modal and starts its share, so what leaves the phone is the
                    picture AND the text. The modal owns both because it is where the background choice
                    lives — sharing from here would have to re-derive which picture this event uses, and
                    that rule lives in one place on the server. */}
                <div className="flex gap-3 mt-1">
                  <button type="button" onClick={() => void copy(p.text, 'Text')} className="text-xs font-bold text-orange-700">Copy text</button>
                  <button type="button" onClick={() => setPostEventId(p.eventId)} className="text-xs font-bold text-orange-700">Image</button>
                  <button type="button" onClick={() => setPostEventId(p.eventId)} className="text-xs font-bold text-orange-700">Share</button>
                </div>
              </div>
            ))}
            {!orderUrl && <p className="text-[11px] text-amber-700 mt-2">No ordering link yet — set your truck’s web address in Settings.</p>}
          </Panel>
        </div>
      </div>
      <p className="text-[11px] text-slate-400">{truckName}</p>

      {/* ⚠️ THE MODAL IS RENDERED HERE, not inside the list, so one is open at a time and closing it
          cannot leave a second mounted behind it. */}
      {postEventId && (
        <EventPostModal token={token} eventId={postEventId}
          onClose={() => setPostEventId(null)}
          onNeedsSetup={() => { setPostEventId(null); onEdit() }} />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SMALL SHARED PIECES
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 EXPORTED FOR THE SINGLE-EVENT POST (stage 2). `components/manage/EventPost.tsx` builds the same
// kind of screen — a picture with draggable text boxes and a column of style controls — and imports
// these rather than copying them. `DraggableBox` especially: its pointer handling took three fixes to
// get right on touch (pointer capture, the clamp to the image, the `data-mode` rule that avoids a ref
// in a per-item closure), and a second copy would have to be fixed again.

export const SELECT = 'w-full border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400'

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">{title}</p>
      {children}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <label className="block text-xs font-bold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 py-0.5">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

/** A colour that can be off. ⚠️ Off is `null`, not '#000000' — the panel is optional on the poster. */
export function OptionalColour({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="mb-2">
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600 mb-1">
        <input type="checkbox" checked={value !== null} onChange={e => onChange(e.target.checked ? '#000000' : null)} />
        {label}
      </label>
      {value !== null && (
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-full h-8 rounded border border-slate-200" />
      )}
    </div>
  )
}

/**
 * ⚠️ A LOCAL SWITCH, because `primitives.tsx` has no `Toggle` — the one the rest of Manage uses is
 * defined inside page.tsx and is not exported. Copying its markup here is the smaller wrong than
 * exporting a component out of a 14,000-line page file as a side effect of this build; it is noted so
 * the two can be unified deliberately rather than by accident.
 */
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on} className="shrink-0">
      <div className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-green-500' : 'bg-slate-300'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </div>
    </button>
  )
}

function SelectBoxButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`block w-full text-left text-sm px-2 py-1.5 rounded-lg ${active ? 'bg-orange-50 text-orange-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>
      {label}
    </button>
  )
}
