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
// ── ⛔ WHAT LEFT THIS FILE ON 6 OCTOBER 2026 ───────────────────────────────────────────────────────
// THE WHOLE EDITOR. `SetupScreen` used to own a left list, a drag surface and a right-hand column of
// style controls — and `EventPost.tsx` owned a second copy of all three, which had already drifted
// (two background colours here, one there; switches there, none here). Both are now
// `components/manage/DesignEditor.tsx`, and `DraggableBox` moved to its own file.
//
// 🔴 WHAT THIS FILE STILL OWNS is the weekly post's own screens: the Weekly | Single event switch, the
// "upload your blank" card, and the MAKE screen — the week picker, the event ticks, the caption and
// the per-event posts. The editor is handed the weekly post's add-ons (the week heading, the row
// spacing, the days-off text, the filled example) as props.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
/* ⚠️ `Btn` IS NO LONGER IMPORTED HERE: the only two on this screen were Download and Share, and both
 * moved into `PostShareBar`. The remaining buttons are the text links in the side panels. */
import { Card } from './primitives'
/* ⚠️ ONE COPY MODULE FOR THE WHOLE SOCIAL TAB — §B8's line lives there with the rest. */
import { NEW_SHAPE_RESET } from '@/lib/copy/socialPosts'
import { DesignEditor, type AnyLayout } from './DesignEditor'
import {
  MAX_UPLOAD_BYTES, MIN_UPLOAD_SHORT_SIDE,
  type Layout,
} from '@/lib/weekly-post/layout'
import { DEFAULT_COUNTRY, type CountryCode } from '@/lib/weekly-post/locale'
/* ⚠️ §2 · THE POSTER'S OWN DAY SHAPE, not this screen's `WeekDayView`. The live stage draws through the
 * renderer's functions, so it needs the renderer's own type — and the route already sends exactly it. */
import type { WeekDay } from '@/lib/weekly-post/week-data'
import { weekLabel } from '@/lib/weekly-post/caption'
import { EventSetupScreen, EventPostModal } from './EventPost'
import { PostShareBar } from './PostShareBar'

interface LoadedDesign {
  width: number
  height: number
  layout: Layout
  blankUrl: string | null
  exampleUrl: string | null
}

/* 🔴 THE COUNTRY COMES FROM THE SERVER, THROUGH `countryForTruck()`, AND IS NEVER DECIDED HERE. A
 * component that defaulted to 'GB' itself would be a second place the product answers that question —
 * which is the whole point of `lib/weekly-post/locale.ts`. */

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
/* ⚠️ IT RETURNS THE `blob` AS WELL AS THE URL (6 October 2026). `PostShareBar` needs a `File` ready
 * BEFORE the operator taps Share — see that file's header — and the blob is already in hand here, so
 * handing it over costs nothing and removes the `fetch(png)` that used to happen inside the tap. */
async function renderPng(token: string, body: Record<string, unknown>): Promise<{ url: string; blob: Blob; warnings: { where: string; message: string }[]; ms: number }> {
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
  return { url: URL.createObjectURL(blob), blob, warnings, ms: Number(r.headers.get('X-Render-Ms') || 0) }
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
  onAddPlacePictures, onDirtyChange, onSaver,
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
  /** 🔴 Part 3: opens Designs › Place pictures from the weekly design's picture toolbar. */
  onAddPlacePictures?: () => void
  /* 🔴 REPORTED SO A **SUB-TAB PILL** CAN ASK BEFORE IT NAVIGATES (9 October 2026). The pills live in
   * the page's bar, outside this screen; without this they would switch tab out from under an unsaved
   * design with no warning at all. ⚠️ Threaded straight through to `DesignEditor`, which owns the
   * comparison — this screen only passes it on. */
  onDirtyChange?: (dirty: boolean) => void
  /* 🔴 §B10 · THE EDITOR'S OWN SAVE, HANDED UP so the leave dialog can offer "Save and leave".
   * ⚠️ Threaded straight through to `DesignEditor`, which owns the layout — this screen only passes it
   * on, exactly as it passes `onDirtyChange`. */
  onSaver?: (save: (() => void | Promise<void>) | null) => void
}) {
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [design, setDesign] = useState<LoadedDesign | null>(null)
  const [mode, setMode] = useState<'setup' | 'post'>(initialMode ?? 'post')
  const [error, setError] = useState<string | null>(null)
  const [week, setWeek] = useState<'this' | 'next'>('this')
  const [days, setDays] = useState<WeekDayView[]>([])
  const [orderUrl, setOrderUrl] = useState<string | null>(null)
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY)
  /* 🔴 PART 3 · WHAT THE PLACE-PICTURE ITEM NEEDS, from the SAME `load` the design comes from. Both
   * are facts about the TRUCK rather than the design, so the editor is handed them rather than making
   * a second request for them. */
  const [hasLogo, setHasLogo] = useState(false)
  const [placesWithout, setPlacesWithout] = useState<{ without: number; total: number } | null>(null)
  /* ══ 🔴 §9 · "Show private events" — OFF BY DEFAULT, AND IT LIVES UP HERE ══════════════════════
   * ⛔ IT IS NOT LOCAL TO THE MAKE SCREEN, and that was the first attempt. The make screen's tick-list
   * of events comes from the `load` response, so a toggle held down there would change what the POSTER
   * contained while the list beside it still showed the old set — the operator ticking events off a
   * list that disagreed with the picture. It is lifted to the one component that calls `load`, exactly
   * as the week choice already is, so one request answers both.
   * ⚠️ AND THE SERVER DECIDES. This flag is sent; it is `buildWeekData` that leaves the events out.
   * Nothing is fetched and then hidden in the browser. */
  const [showPrivate, setShowPrivate] = useState(false)
  /** Which design the setup screen is editing. Post screens are unaffected. */
  /* 🔴 "Single event" IS THE DEFAULT (5 October 2026). It is the post a truck makes most often — one
   * per pitch, every week — where the weekly poster is made once and then rarely touched. Opening on
   * the rarer job made the common one a click away every time. */
  /* ⚠️ THE CALLER MAY NAME IT. Social posts › Designs has a box for the weekly design and a box for the
   * event design, so each opens this screen already on the one it is about. With no caller's choice the
   * default is unchanged. */
  const [designKind, setDesignKind] = useState<'week' | 'event'>(initialDesignKind ?? 'event')

  const load = useCallback(async (which?: 'this' | 'next', priv?: boolean) => {
    try {
      const r = await api(token, { action: 'load', week: which, showPrivate: priv === true })
      setMissingTable(!!r.missingTable)
      setDesign(r.design ?? null)
      setDays(r.week?.days ?? [])
      setWeek(r.week?.which ?? 'this')
      setOrderUrl(r.orderUrl ?? null)
      setCountry((r.country as CountryCode) ?? DEFAULT_COUNTRY)
      setHasLogo(r.hasLogo === true)
      setPlacesWithout((r.placesWithout as { without: number; total: number } | null) ?? null)
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
  useEffect(() => { void load(initialWeek, false) }, [load, initialWeek])

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
          ? <SetupScreen token={token} design={design} country={country} onDirtyChange={onDirtyChange}
              onSaver={onSaver}
              hasLogo={hasLogo} placesWithout={placesWithout} onAddPlacePictures={onAddPlacePictures}
              onDone={() => { void load(week, showPrivate) }}
              onCancel={onBack ?? (design ? () => setMode('post') : undefined)} />
          /* ⚠️ `EventSetupScreen` READS ITS OWN COUNTRY from `event_load`, so it is not passed one —
           * see its note. This screen's weekly half takes it from `load` above. */
          : <EventSetupScreen token={token} onSaver={onSaver}
              onCancel={onBack ?? (design ? () => setMode('post') : undefined)} />}
      </div>
    )
  }

  return <PostScreen token={token} truckName={truckName} design={design!} days={days} week={week}
    orderUrl={orderUrl} onWeek={w => { setWeek(w); void load(w, showPrivate) }}
    showPrivate={showPrivate}
    onShowPrivate={v => { setShowPrivate(v); void load(week, v) }}
    onEdit={() => setMode('setup')} error={error} />
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE SETUP SCREEN
// ════════════════════════════════════════════════════════════════════════════════════════════════

function SetupScreen({ token, design, country, hasLogo, placesWithout, onAddPlacePictures, onDone, onCancel, onDirtyChange, onSaver }: {
  token: string
  design: LoadedDesign | null
  country: CountryCode
  hasLogo: boolean
  placesWithout: { without: number; total: number } | null
  onAddPlacePictures?: () => void
  onDone: () => void
  onCancel?: () => void
  /** ⚠️ Threaded straight through to `DesignEditor`, which owns the comparison. */
  onDirtyChange?: (dirty: boolean) => void
  /** ⚠️ Threaded straight through too — see `WeeklyPostApp`. */
  onSaver?: (save: (() => void | Promise<void>) | null) => void
}) {
  const [blankUrl, setBlankUrl] = useState<string | null>(design?.blankUrl ?? null)
  /* ⚠️ STILL SET BY THE UPLOAD PATH, WHICH IS UNTOUCHED (§B7) — only the panel that showed it over the
   * preview has gone, so nothing reads it any more. ⛔ KEPT RATHER THAN DELETED because the endpoint,
   * the stored file and `design.exampleUrl` all still exist: this is the one line that would have to
   * come back if the feature is given a door again. */
  const [exampleUrl, setExampleUrl] = useState<string | null>(design?.exampleUrl ?? null)
  void exampleUrl
  const [size, setSize] = useState<{ w: number; h: number } | null>(design ? { w: design.width, h: design.height } : null)
  const [layout, setLayout] = useState<Layout | null>(design?.layout ?? null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null)
  /* ══ 🔴 §B8 · A MESSAGE THAT FADES ════════════════════════════════════════════════════════════
   * ⚠️ SEPARATE FROM `msg`, which is the screen's permanent slot ("Design saved.", "The upload
   * failed") and must not disappear on a timer. ⛔ THE TIMER IS CLEARED ON UNMOUNT and on a second
   * flash, or a slow operator uploading twice would be left with a message that outlives its own
   * reason by five seconds. */
  const [flash, setFlashText] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setFlash = useCallback((text: string) => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setFlashText(text)
    flashTimer.current = setTimeout(() => { setFlashText(null); flashTimer.current = null }, 5000)
  }, [])
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])
  /* 🔴 "Preview with" REPLACES THE OLD "Preview a busy week" BUTTON. It was a toggle that changed what
   * the picture showed and said nothing about what it was showing instead; one select naming all three
   * ("This week", "Next week", "A busy week") is the same feature with the answer written on it.
   * ⚠️ "A busy week" IS WEEK **DATA**, NOT A SECOND DRAWING PATH — a 60-character place name, a stacked
   * Saturday, a cancelled day and a day off, through this same renderer, so what it shows is true. */
  const [previewWith, setPreviewWith] = useState('this')

  /* ══ 🔴 §2 · THE WEEK THE LIVE TEXT SAYS — FETCHED ONCE PER "Preview with" ═══════════════════════
   *
   * ⛔ THE EDITOR CANNOT INVENT IT. It has the layout, so it knows where every box is and what it looks
   * like; it does not know that Thursday is Cavendish at 5pm. That is this screen's week, and this
   * screen is the one that loads it.
   * ⚠️ ONE REQUEST WHEN THE OPERATOR CHANGES THE CHOICE, AND NOT ONE PER EDIT. The whole point of §2
   * is that moving a box costs no round trip; fetching the week per drag would have put the round trip
   * straight back. ⛔ AND IT IS THE **SAME ACTION THE PNG IS RENDERED FROM** (`load`, with the same
   * `week`), so the live words and the file a truck posts are one answer.
   * ⛔ **`showPrivate` IS NOT SENT, AND THAT IS PARITY RATHER THAN AN OVERSIGHT.** The design preview's
   * own PNG (`renderPreview` → the `render` action) does not send it either, so the server leaves
   * private bookings out of both. The tick that shows them lives on the POST screen, which is where
   * the operator decides what a particular post says.
   * ⚠️ A FAILURE IS SILENT AND LEAVES IT `null`, which the editor reads as "fall back to the PNG".
   */
  /* 🔴 **IT CARRIES THE CHOICE IT IS FOR.** Switching from This week to Next week leaves the old answer
   * in state until the new one lands, and without the key the stage would draw LAST week's dates for a
   * moment — the exact bug §2 exists to remove, reintroduced one layer up. ⚠️ A MISMATCH READS AS "not
   * loaded", so nothing has to be cleared and this effect sets no state synchronously. */
  const [liveWeek, setLiveWeek] = useState<
    { which: string; days: WeekDay[]; start: string; end: string } | null
  >(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const r = await api(token, {
          action: 'load',
          week: previewWith === 'next' ? 'next' : 'this',
        })
        if (!alive || !r.week) return
        setLiveWeek({
          which: previewWith,
          days: (r.week.days ?? []) as WeekDay[],
          start: String(r.week.start), end: String(r.week.end),
        })
      } catch { /* the stage falls back to the PNG, which is what it drew before §2 */ }
    })()
    return () => { alive = false }
  }, [token, previewWith])

  /* ⚠️ THE EDITOR IS REMOUNTED WHEN THE PICTURE CHANGES SHAPE, by its key. A new blank resets the
   * boxes server-side, and the editor holds the undo history — carrying a history of positions that
   * were measured against a different canvas would let ⌘Z put a box outside the new picture. */
  const editorKey = `${size?.w ?? 0}x${size?.h ?? 0}`

  // ── uploading ───────────────────────────────────────────────────────────────────────────────────
  const upload = async (file: File, which: 'blank' | 'example') => {
    setMsg(null)
    /* ⚠️ CHECKED IN THE BROWSER **AND** ON THE SERVER. This check is for speed — refusing a 40MB file
     * before it is uploaded — not for safety: the server reads the real bytes and is the one that
     * decides, because a client check is advice. */
    if (file.size > MAX_UPLOAD_BYTES) { setMsg({ text: `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 10MB.`, bad: true }); return }
    if (!/^image\/(png|jpe?g)$/.test(file.type)) { setMsg({ text: 'Please choose a PNG or JPG.', bad: true }); return }
    setUploading(true)
    try {
      const ext = file.type.includes('png') ? 'png' : 'jpg'
      const slot = await api(token, { action: 'upload_url', which, ext })
      const put = await fetch(slot.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!put.ok) throw new Error('The upload did not complete')
      const done = await api(token, { action: 'confirm_upload', path: slot.path, which })
      if (which === 'blank') {
        /* ══ 🔴 §B8 · SAID ONLY WHEN IT IS TRUE, AND ONLY FOR FIVE SECONDS ══════════════════════════
         * ⛔ IT WAS SHOWN WHENEVER THE SERVER SAID `resetLayout` — which it says for any new blank of a
         * different SIZE, including a re-export of the same artwork at a higher resolution, where the
         * boxes land exactly where they were. So a line claiming the operator's work had moved appeared
         * when nothing had, and it stayed on the screen until something else replaced it.
         * 🔴 TWO CONDITIONS, BOTH CHECKED HERE: the new picture is a different SHAPE (the ratio moved by
         * more than 1%, the same tolerance the rest of this product uses), AND the boxes really are not
         * where they were. ⚠️ THE SECOND IS COMPARED AGAINST THE **OLD** LAYOUT, which this screen still
         * holds — the server cannot answer it, because it does not know what was on screen. */
        const before = size, oldLayout = layout
        const shapeChanged = !before
          || Math.abs((before.w / Math.max(1, before.h)) - (done.width / Math.max(1, done.height))) > 0.01
        const boxesMoved = !oldLayout || JSON.stringify([
          oldLayout.date, oldLayout.location, oldLayout.time, oldLayout.heading, oldLayout.days ?? null,
        ]) !== JSON.stringify([
          done.layout.date, done.layout.location, done.layout.time, done.layout.heading, done.layout.days ?? null,
        ])
        setSize({ w: done.width, h: done.height })
        setLayout(done.layout)
        setBlankUrl(done.blankUrl)
        if (done.resetLayout && shapeChanged && boxesMoved) setFlash(NEW_SHAPE_RESET)
      } else {
        setExampleUrl(done.exampleUrl)
      }
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'The upload failed', bad: true }) }
    finally { setUploading(false) }
  }

  const save = async (next: AnyLayout) => {
    setSaving(true)
    try {
      const r = await api(token, { action: 'save_design', layout: next })
      setMsg({ text: r.warning ?? 'Design saved.', bad: false })
      onDone()
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Could not save', bad: true }) }
    finally { setSaving(false) }
  }

  /* ⚠️ `useCallback` SO THE EDITOR'S DEBOUNCED PREVIEW EFFECT DOES NOT RE-FIRE ON EVERY RENDER. The
   * effect depends on this function; a new identity each render would restart the 400ms timer
   * continuously and the picture would never arrive. */
  const renderPreview = useCallback(async (l: AnyLayout, which: string) => {
    const r = await renderPng(token, {
      layout: l,
      week: which === 'next' ? 'next' : 'this',
      busy: which === 'busy',
    })
    return { url: r.url, warnings: r.warnings }
  }, [token])

  // ── no blank yet ────────────────────────────────────────────────────────────────────────────────
  if (!layout || !size || !blankUrl) {
    return (
      <Card className="p-6">
        {/* 🔴 THE SAME SIZE AND WEIGHT AS "Set up your single event post" (EventPost.tsx) — one style
          * for the two cards that do the same job. */}
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
        {msg && <p className="text-sm text-red-600 mt-2">{msg.text}</p>}
      </Card>
    )
  }

  return (
    <>
      {/* ⚠️ A PHONE IS TOLD, NOT BLOCKED. Dragging a box on a 390px screen is unpleasant but it works,
          and refusing to show the screen would strand an operator who only has a phone. */}
      <p className="min-[900px]:hidden text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
        Best on a computer or iPad — the boxes are small to drag on a phone.
      </p>
      {/* ⛔ THE "Filled example" PANEL WAS A `footer` ON THIS EDITOR AND IS GONE — §B7. It uploaded a
        * finished poster and showed it at 30% over the preview so boxes could be lined up against the
        * real thing. ⚠️ THE PREVIEW **IS** THE REAL THING NOW: the stage draws the renderer's PNG for
        * the chosen week, with this truck's own place names in it, so a faint second poster on top of a
        * true one was two answers to one question. ⛔ THE UPLOAD ENDPOINT AND THE STORED FILE ARE
        * UNTOUCHED — a capability that lost its door, named in docs/social-tab-6-report.md. */}
      {/* ⚠️ ABOVE THE EDITOR AND IN ITS OWN SLOT, so it cannot push the poster down when it appears
        * and leave a gap when it goes: the row is only in the tree while there is something in it, and
        * it is the only thing in this screen that times out. */}
      {flash && (
        <p data-flash className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {flash}
        </p>
      )}
      <DesignEditor
        onDirtyChange={onDirtyChange}
        onSaver={onSaver}
        key={editorKey}
        token={token}
        hasLogo={hasLogo}
        placesWithout={placesWithout}
        onAddPlacePictures={onAddPlacePictures ?? (onCancel ?? onDone)}
        designName="Weekly post design"
        backLabel={onCancel ? '‹ Designs' : '‹ Back'}
        onBack={onCancel ?? onDone}
        initialLayout={layout}
        country={country}
        background={{ url: blankUrl, width: size.w, height: size.h }}
        onReplacePicture={f => void upload(f, 'blank')}
        replacing={uploading}
        pictureNote="Your picture without any date or place on it. We add those."
        /* ⛔ "A busy week" IS GONE — §B2 (10 October 2026). It rendered a FABRICATED week — a
           60-character place name, a stacked Saturday, a cancelled day — so a design could be checked
           against the worst case. ⚠️ IT WAS REAL AND IT WAS USEFUL, and it is still a server capability
           (`busy: true` on the render action). What it is not is a week this truck HAS: two of the
           three choices showed their schedule and one showed somebody else's. */
        previewOptions={[
          { id: 'this', label: 'This week' },
          { id: 'next', label: 'Next week' },
        ]}
        previewWith={previewWith}
        onPreviewWith={setPreviewWith}
        renderPreview={renderPreview}
        /* 🔴 §2 · WHAT THE LIVE TEXT SAYS. ⚠️ NO NOTE: the weekly design is set up once and a note is
         * written per POST, on the post screen — so the design preview has none, exactly as the PNG
         * this replaced had none. */
        liveData={liveWeek && liveWeek.which === previewWith
          ? { kind: 'week', days: liveWeek.days, start: liveWeek.start, end: liveWeek.end, note: null }
          : null}
        onSave={l => void save(l)}
        saving={saving}
        onCancel={onCancel ?? onDone}
        message={msg}
      />
    </>
  )
}

/* ══ ⛔ `DraggableBox` LIVED HERE AND NOW LIVES IN `components/manage/DraggableBox.tsx` ═══════════
 * It was exported out of this file — a file about the weekly post — for the event screen to import,
 * which made the weekly post the owner of the drag surface for every design screen in the product.
 * With ONE shared editor there is no owning screen, so it has its own file, and it gained snapping to
 * the centre of the picture while it was moving. ⚠️ THERE IS STILL EXACTLY ONE OF IT: its pointer
 * handling took three fixes to get right on touch and a second copy would have to be fixed again. */

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE POST SCREEN
// ════════════════════════════════════════════════════════════════════════════════════════════════

function PostScreen({ token, truckName, design, days, week, orderUrl, onWeek, showPrivate, onShowPrivate, onEdit, error }: {
  token: string
  truckName: string
  design: LoadedDesign
  days: WeekDayView[]
  week: 'this' | 'next'
  orderUrl: string | null
  onWeek: (w: 'this' | 'next') => void
  /** §9 · off by default. ⚠️ Owned by `WeeklyPostApp`, because changing it re-asks the server. */
  showPrivate: boolean
  onShowPrivate: (v: boolean) => void
  onEdit: () => void
  error: string | null
}) {
  const [excluded, setExcluded] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [showCancelled, setShowCancelled] = useState(design.layout.showCancelled)
  const [png, setPng] = useState<string | null>(null)
  /** The same picture as `png`, as the blob it came from — the share bar builds its `File` from this. */
  const [pngBlob, setPngBlob] = useState<Blob | null>(null)
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
      /* ⚠️ `showPrivate` TRAVELS WITH BOTH REQUESTS. The poster and the caption describe the same week;
       * sending it to one and not the other would produce a picture with a private booking on it and a
       * caption that did not mention it — or the reverse, which is worse. */
      const [img, caps] = await Promise.all([
        renderPng(token, { week, excluded, note, layout, showPrivate }),
        api(token, { action: 'captions', week, excluded, note, showPrivate }),
      ])
      setPng(prev => { if (prev) URL.revokeObjectURL(prev); return img.url })
      /* ⚠️ SET TOGETHER WITH THE URL, from the same response, so the bar can never offer a Share of
       * one picture and a Download of another. */
      setPngBlob(img.blob)
      setWarnings(img.warnings)
      setCaption(caps.caption ?? '')
      setPerEvent(caps.perEvent ?? [])
    } catch (e) { setBusyMsg(e instanceof Error ? e.message : 'Could not build the post') }
    finally { setRendering(false) }
  }, [token, week, excluded, note, showCancelled, showPrivate, design.layout])

  /* ⚠️ SAME NARROW DISABLE, SAME REASON as the load effect above: the state is set after an awaited
   * render and caption request, not synchronously in the effect body. */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh() }, [refresh])

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setBusyMsg(`${what} copied.`) }
    catch { setBusyMsg('Could not copy — select the text and copy it by hand.') }
  }

  /* ⛔ `share()` AND `download()` ARE GONE FROM THIS FILE, both of them, and not because they were
   * tidy to remove: the `share()` that was here is the one that downloaded on a Mac, and the single
   * event post had the SAME function with the SAME bug. One report, one fix — see
   * components/manage/PostShareBar.tsx, which owns both and is now the only caller of
   * `navigator.share` on this screen. */

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

          {/* 🔴 ONE SHARE BAR, SHARED WITH THE SINGLE EVENT POST. The `share()` that used to live here
            * downloaded the picture on a Mac — see components/manage/PostShareBar.tsx. */}
          <div className="mt-3">
            <PostShareBar blob={pngBlob} url={png} fileName={`weekly-post-${week}.png`}
              caption={caption} onStatus={setBusyMsg} />
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
            {/* ══ 🔴 §9 · "Show private events" — OFF BY DEFAULT ════════════════════════════════════
              * ⛔ OFF IS THE DEFAULT AND IT IS NOT A PREFERENCE, IT IS THE SAFE DIRECTION. A private
              * booking is a wedding or a works party; it belongs on the truck's own poster only if they
              * deliberately put it there. Defaulting to ON would have published it the first time
              * anyone pressed Download, before they had seen the toggle.
              * ⚠️ WHEN ON, THE ROW SAYS "Private event" WITH ITS DATE AND TIMES AND NOTHING ELSE — no
              * place, no town, no place picture. That is not enforced here: `locationName` and
              * `townLine` in week-data.ts return the label and `null`, which is the same rule the
              * PUBLIC schedule page obeys, so the poster cannot leak what the schedule will not. */}
            <div className="flex items-start justify-between gap-2 mt-2 pt-2 border-t border-slate-100">
              <span className="min-w-0">
                <span className="block text-sm text-slate-700">Show private events</span>
                <span className="block text-[11px] text-slate-400 leading-snug">
                  They show as “Private event” with the date and times — never the place.
                </span>
              </span>
              <Toggle on={showPrivate} onToggle={() => onShowPrivate(!showPrivate)} />
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
            {/* ══ ⛔ THE SECOND "Copy caption" IS GONE — 7 October 2026, §7 ════════════════════════
              * `PostShareBar` already carries one, and the two were not equivalent: the bar's copies
              * WITHOUT an `await` in front of it, which is what keeps the clipboard write inside
              * WebKit's transient-activation window. This one went through `copy()`, an async helper —
              * so on Safari the more prominent of the two buttons was the less reliable one.
              * 🔴 ONE CONTROL, AND IT IS THE ONE THAT WORKS. The textarea is still editable, and an
              * edit made here is what the bar copies. */}
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

/* ══ ⛔ `Field`, `Check` AND `OptionalColour` ARE GONE ═════════════════════════════════════════════
 * They were this file's style-column furniture, exported so the event screen's style column could use
 * them. Both columns are now the shared editor's toolbar, whose controls live in
 * `components/manage/DesignEditorBits.tsx` — `CheckRow`, `OptionalColourRow`, `Slider`, `Stepper` and
 * `ColourField`. ⚠️ `ColourField` IS NOT A RENAME OF `OptionalColour`: it fixes the bug that was in
 * both old screens, where a bare `<input type="color">` rendered as an EMPTY well in Safari, so a
 * design with white text showed no colour at all until the picker was opened. */

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

/* ⛔ `SelectBoxButton` IS GONE WITH THE LEFT-HAND COLUMN IT BELONGED TO — see the note where `Field`
 * and `Check` used to be. */
