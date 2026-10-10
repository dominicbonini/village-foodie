'use client'

// components/admin/ScreenshotsPanel.tsx
// ADMIN ONLY. Drop, pick or paste screenshots. Each one is classified and then filed: a SCHEDULE becomes
// events through /api/inbound-schedule (unchanged), a TRUCK-DETAILS screenshot fills the empty fields of
// the prospect it matches, or becomes a new hidden truck.
//
// 🔴 A TAB ON /admin, NOT A ROUTE. Same shape as components/admin/OutreachPanel.tsx: app/admin/page.tsx
// mounts this when adminTab === 'screenshots', so it fetches nothing until the tab is selected and there
// is no second URL to protect. It paints no screen of its own — no min-h-screen, no background, no <h1>
// (the tab bar names it) and no back link, because there is nowhere to go back to.
//
// ── 🔴 NO BUTTON. A FILE THAT ARRIVES IS ALREADY WORKING ────────────────────────────────────────────
// Adding a file enqueues it; the queue starts itself. There is no Upload/Extract control to press,
// because a second step is a second thing to forget with the tab already open.
//
// ⚠️ ONE AT A TIME, DELIBERATELY. `runningRef` gates the queue so exactly one request is in flight.
// The route retries only 429/503 and Gemini rate-limits per project, so firing eight images at once
// converts a slow batch into a failed one. Sequential is slower and finishes.
//
// ── 🔴 THE QUEUE LIVES IN THIS TAB, AND THE PAGE SAYS SO ────────────────────────────────────────────
// Processing is driven by this component, one request at a time. Closing or navigating away STOPS it —
// so the page states that in a line, and `beforeunload` asks before leaving while files are still
// waiting. The LOG is server-side and survives; the QUEUE is not.
//
// ── WHAT HAPPENS TO THE IMAGE ───────────────────────────────────────────────────────────────────────
// Nothing is stored server-side — no bucket, no object, no crop, no logo (route.ts holds the same note).
// The File lives in this list, in this tab, and nowhere else; the row thumbnail is an object URL over it.
// What IS persisted is one `screenshot_log` row per processed file: what it was, what happened, and the
// summary line. ⚠️ SO "NEEDS A LOOK" IS ACTIONABLE ONLY IN THIS SESSION — the extracted details were
// never stored, so after a reload the row is history and the screenshot has to be dropped again.
//
// ⚠️ THIS PANEL HAS NOT BEEN SEEN RENDERED BY ITS AUTHOR. V12.6 records that no agent session as an
// admin is obtainable — Dominic is the sole admin — so the extraction, matching and payload shaping were
// proven directly and the live UI was not. The report lists the steps for him to run by hand.
//
// 🔎 Gated by the same pattern as every other admin surface: the panel holds no gate of its own and
// defers to /api/admin/screenshot-events, which calls verifyAdmin. A non-admin POST returns 401.

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { nativeAuthHeader } from '@/lib/native/session'
import { prospectPath } from '@/lib/outreach-queue'
import {
  OUTCOME_CHIP, groupLogRows, chipCounts, failureKind, progressLine, lastProcessedLine,
  type LogRow, type ScreenshotOutcome,
} from '@/lib/admin/screenshot-log'
import type { TruckDetails } from '@/lib/admin/truck-details'
// Phase 2D-2: "These screenshots are from" — required, kept for the session, reset after 30 idle minutes.
import ScreenshotCountryPicker, { useScreenshotCountry, countryWithArticle, type PickerCountry } from '@/components/admin/ScreenshotCountryPicker'

type Dropped = { event: Record<string, string>; reason: string }
type Candidate = { prospect_id: string; truck_id: string; name: string | null }
type FileResult = {
  fileName: string
  kind: string | null
  outcome: ScreenshotOutcome
  summary: string | null
  extracted: number; kept: number; dropped: Dropped[]
  written: number | null; bridged: number | null
  prospectId: string | null; truckId: string | null
  candidates: Candidate[] | null
  details: TruckDetails | null
  error: string | null
  warnings: string[]
  /** 'held_country' only: the screenshot looks like another country; nothing has been written. */
  held?: {
    chosen: string; chosenName: string; detected: string; detectedName: string; detectedKnown: boolean
    confidence: 'high' | 'medium'; reasons: string; events: Record<string, string>[]
  } | null
}
type Item = {
  id: string
  file: File
  name: string
  previewUrl: string
  status: 'queued' | 'running' | 'done' | 'error'
  result: FileResult | null
  error: string | null
  /** Set once a "Needs a look" row has been decided, so its buttons go away. */
  decided: string | null
  /** 🔴 The country chosen WHEN THIS FILE WAS QUEUED — changing the picker mid-batch does not relabel it. */
  country: string
}

/** 🔴 EVERY CHIP'S COLOURS ARE WRITTEN OUT, NOT BUILT. Tailwind only ships classes it can see as text. */
const CHIP_CLASS: Record<ScreenshotOutcome, string> = {
  schedule: 'bg-indigo-100 text-indigo-800',
  updated: 'bg-green-100 text-green-800',
  new_truck: 'bg-blue-100 text-blue-800',
  nothing_new: 'bg-slate-100 text-slate-600',
  needs_a_look: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-700',
  held_country: 'bg-amber-100 text-amber-800',
}

const FILTERS: ('all' | ScreenshotOutcome)[] = [
  'all', 'schedule', 'held_country', 'updated', 'new_truck', 'nothing_new', 'needs_a_look', 'failed',
]
const FILTER_LABEL: Record<'all' | ScreenshotOutcome, string> = { all: 'All', ...OUTCOME_CHIP }

const timeOf = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function ScreenshotsPanel() {
  const [items, setItems] = useState<Item[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [logRows, setLogRows] = useState<LogRow[]>([])
  const [migrationNotes, setMigrationNotes] = useState<string[]>([])
  const [hasLog, setHasLog] = useState(true)
  const [lastProcessedAt, setLastProcessedAt] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | ScreenshotOutcome>('all')
  const [countries, setCountries] = useState<PickerCountry[]>([])
  const pick = useScreenshotCountry()
  const countryName = (code: string | null) => countries.find(c => c.code === code)?.name ?? code ?? ''
  const runningRef = useRef(false)
  /** 🔴 RESET TO 0 ON EVERY SUCCESS. Three in a row is an outage; three in a day is not. */
  const consecutiveRef = useRef(0)

  const loadLog = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/screenshot-events', { headers: { ...await nativeAuthHeader() } })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return
      setLogRows(Array.isArray(data?.rows) ? data.rows : [])
      setMigrationNotes(Array.isArray(data?.migrationNotes) ? data.migrationNotes : [])
      setHasLog(data?.hasLog !== false)
      if (Array.isArray(data?.countries)) setCountries(data.countries)
      const newest = (data?.rows ?? [])[0]
      if (newest?.created_at) setLastProcessedAt(newest.created_at)
    } catch { /* the log is a convenience; its absence must not break the tab */ }
  }, [])

  useEffect(() => { void loadLog() }, [loadLog])

  // 🔴 THE ONE GUARD: drop, pick and paste all come through here, and none is accepted until a country is
  // chosen (Phase 2D-2). Each file is stamped with the country at this moment.
  const add = useCallback((incoming: FileList | File[] | null) => {
    if (!pick.code) return
    const list = Array.from(incoming ?? []).filter(f => f.size > 0 && f.type.startsWith('image/'))
    if (!list.length) return
    setFatal(null)
    const country = pick.code
    pick.touch()
    setItems(prev => [...prev, ...list.map(f => ({
      // crypto.randomUUID is available in every browser this ships to and in the iOS WKWebView.
      id: crypto.randomUUID(), file: f, name: f.name || 'pasted image',
      previewUrl: URL.createObjectURL(f),
      status: 'queued' as const, result: null, error: null, decided: null, country,
    }))])
  }, [pick])

  const remove = useCallback((id: string) => {
    setItems(prev => {
      const gone = prev.find(i => i.id === id)
      if (gone) URL.revokeObjectURL(gone.previewUrl)
      return prev.filter(i => i.id !== id)
    })
  }, [])

  // ⚠️ Revoke every object URL on unmount, or leaving the tab leaks the whole batch's images.
  useEffect(() => () => { items.forEach(i => URL.revokeObjectURL(i.previewUrl)) }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── THE QUEUE ─────────────────────────────────────────────────────────────────────────────────────
  // Re-runs on every `items` change and takes the first queued row. `runningRef` (a ref, not state, so
  // it updates synchronously and cannot be double-entered by two renders) keeps that to one at a time.
  // 🔴 GATED ON `paused`: a complete failure stops the queue where it is. Nothing is discarded — the rows
  // stay `queued` and Retry starts them again.
  useEffect(() => {
    if (runningRef.current || paused) return
    const next = items.find(i => i.status === 'queued')
    if (!next) return
    runningRef.current = true

    ;(async () => {
      setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'running' } : i))
      const waiting = items.filter(i => i.status === 'queued').length - 1
      let patch: Partial<Item>
      try {
        const fd = new FormData()
        fd.append('files', next.file, next.name)
        fd.append('waiting', String(Math.max(0, waiting)))
        fd.append('consecutiveNonContent', String(consecutiveRef.current))
        fd.append('country', next.country)
        const res = await fetch('/api/admin/screenshot-events', {
          method: 'POST', headers: { ...await nativeAuthHeader() }, body: fd,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          // A 401, or a failure that is about the whole surface rather than this file, belongs at the top
          // as well — otherwise it reads as one bad screenshot when it is the system being unavailable.
          const msg = data?.error ?? `Request failed (${res.status})`
          if (res.status === 401 || res.status >= 500) setFatal(msg)
          if (data?.paused || res.status >= 500) { setPaused(true); setBanner(data?.banner ?? msg) }
          consecutiveRef.current += 1
          patch = { status: 'error', error: msg }
        } else {
          const r: FileResult | undefined = data?.results?.[0]
          if (Array.isArray(data?.migrationNotes)) setMigrationNotes(data.migrationNotes)
          if (data?.hasLog === false) setHasLog(false)
          if (data?.paused) { setPaused(true); setBanner(data?.banner ?? 'Processing has paused.') }
          // 🔴 THE COUNTER MOVES ON THE KIND OF FAILURE, not on failure. A screenshot the model simply
          // could not read is a content failure and must never push the tab towards an outage alert.
          if (r?.error && failureKind(r.error) !== 'content') consecutiveRef.current += 1
          else if (!r?.error) consecutiveRef.current = 0
          setLastProcessedAt(new Date().toISOString())
          patch = { status: r?.error ? 'error' : 'done', result: r ?? null, error: r?.error ?? null }
        }
      } catch (e) {
        consecutiveRef.current += 1
        patch = { status: 'error', error: e instanceof Error ? e.message : 'Upload failed' }
      } finally {
        runningRef.current = false
      }
      setItems(prev => prev.map(i => i.id === next.id ? { ...i, ...patch } : i))
      void loadLog()
    })()
  }, [items, paused, loadLog])

  // Paste is how a screenshot usually arrives — ⌘⇧4 then ⌘V, with no file on disk at all. Bound to the
  // window while this tab is mounted, and removed with it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) { e.preventDefault(); add(files) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [add])

  const queued = items.filter(i => i.status === 'queued').length
  const running = items.some(i => i.status === 'running')
  const finished = items.filter(i => i.status === 'done' || i.status === 'error').length
  const pending = queued + (running ? 1 : 0)

  // 🔴 ASK BEFORE LEAVING WITH WORK STILL QUEUED. The queue is this tab; closing it stops processing.
  // ⚠️ `returnValue` AND a return value: Safari honours one, Chromium the other.
  useEffect(() => {
    if (pending === 0) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; return '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending])

  const retry = useCallback(() => {
    setPaused(false); setBanner(null); setFatal(null)
    consecutiveRef.current = 0
    setItems(prev => prev.map(i => i.status === 'error' ? { ...i, status: 'queued', error: null, result: null } : i))
  }, [])

  const decide = useCallback(async (item: Item, action: 'same_truck' | 'add_as_new', prospectId?: string) => {
    const details = item.result?.details
    if (!details) return
    pick.touch()
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, decided: 'working' } : i))
    try {
      const res = await fetch('/api/admin/screenshot-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
        body: JSON.stringify({ action, details, prospectId, fileName: item.name, fileSize: item.file.size, country: item.country }),
      })
      const data = await res.json().catch(() => ({}))
      setItems(prev => prev.map(i => i.id === item.id
        ? res.ok
          ? { ...i, decided: data?.summary ?? 'done', result: i.result ? { ...i.result, outcome: data?.outcome ?? i.result.outcome, summary: data?.summary ?? i.result.summary, prospectId: data?.prospectId ?? null } : i.result }
          : { ...i, decided: null, error: data?.error ?? `Request failed (${res.status})` }
        : i))
      void loadLog()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed'
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, decided: null, error: msg } : i))
    }
  }, [loadLog, pick])

  // ── "Check country" (Phase 2D-2): Add as {detected} / Keep as {chosen} re-submit the returned events with
  // that country. Nothing was stored meanwhile; Dismiss writes nothing at all.
  const confirmCountry = useCallback(async (item: Item, country: string) => {
    const held = item.result?.held
    if (!held) return
    pick.touch()
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, decided: 'working' } : i))
    try {
      const res = await fetch('/api/admin/screenshot-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
        body: JSON.stringify({ action: 'country_confirm', country, events: held.events, fileName: item.name, fileSize: item.file.size }),
      })
      const data = await res.json().catch(() => ({}))
      setItems(prev => prev.map(i => i.id === item.id
        ? res.ok
          ? { ...i, decided: data?.summary ?? 'done', result: i.result ? { ...i.result, outcome: 'schedule', summary: data?.summary ?? i.result.summary, dropped: Array.isArray(data?.dropped) ? data.dropped : i.result.dropped } : i.result }
          : { ...i, decided: null, error: data?.error ?? `Request failed (${res.status})` }
        : i))
      void loadLog()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed'
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, decided: null, error: msg } : i))
    }
  }, [loadLog, pick])
  const dismissHeld = useCallback((item: Item) => {
    pick.touch()
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, decided: 'Dismissed — nothing added' } : i))
  }, [pick])

  /** Thumbnails for log rows, keyed by file name — the log holds no image, this session does. */
  const previews = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of items) m.set(i.name, i.previewUrl)
    return m
  }, [items])

  const grouped = useMemo(() => groupLogRows(logRows), [logRows])
  const counts = useMemo(() => chipCounts(logRows), [logRows])
  const show = useCallback((r: LogRow) => filter === 'all' || r.outcome === filter, [filter])
  const progress = progressLine({ finished, running, total: items.length })
  const lastLine = lastProcessedLine(lastProcessedAt)

  return (
    <div className="text-slate-900">
      <div className="max-w-6xl">
        <p className="text-sm text-slate-500">
          Drop, paste or pick screenshots — a truck&apos;s schedule, or its contact details from a Facebook
          page. Each one starts reading as soon as it lands; there is nothing to press. Images are never
          stored.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Reading happens in this browser tab — if you close it or navigate away, the queue stops.
        </p>

        {/* ── "These screenshots are from" — required before anything can be added (Phase 2D-2). ── */}
        <ScreenshotCountryPicker countries={countries} code={pick.code} resetsAt={pick.resetsAt}
          onChoose={code => pick.choose(code)} />

        {/* ── THE OUTAGE BANNER ────────────────────────────────────────────────────────────────────── */}
        {banner && (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4">
            <p className="text-sm font-bold text-red-800">Processing has paused</p>
            <p className="mt-1 text-sm text-red-700">{banner}</p>
            <button
              onClick={retry}
              className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
            >Retry</button>
          </div>
        )}

        {migrationNotes.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
            {migrationNotes.map(n => (
              <p key={n} className="text-xs font-semibold text-amber-900">{n}</p>
            ))}
          </div>
        )}

        {/* ── THE DROP ZONE ──────────────────────────────────────────────────────────────────────────
            🔴 A <label> WRAPPING THE INPUT, not a div with an onClick. The label makes the whole zone
            the input's own click target, which is what keeps the iOS system panel reachable by tapping
            anywhere in it — a synthetic .click() on a hidden input is the pattern that gets blocked.
            ⚠️ dragOver needs preventDefault on BOTH dragover and drop or the browser navigates to the
            dropped file instead of handing it over. */}
        <label
          data-drop-zone={pick.code ? 'open' : 'closed'}
          aria-disabled={!pick.code}
          onDragOver={e => { e.preventDefault(); if (pick.code) setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); add(e.dataTransfer.files) }}
          className={`mt-5 block rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            !pick.code ? 'cursor-not-allowed border-slate-200 bg-slate-50'
              : dragOver ? 'cursor-pointer border-orange-500 bg-orange-50' : 'cursor-pointer border-slate-300 bg-white hover:border-orange-400'
          }`}
        >
          {/*
            🔴 THE INPUT ATTRIBUTES ARE LOAD-BEARING FOR iOS, AND THESE THREE FACTS DECIDE THEM:
              • `accept="image/*"` — WebKit raises its OWN panel (Photo Library / Take Photo / Choose File)
                for any file input accepting image/*. No Capacitor plugin is involved; the app has none.
              • NO `capture` ATTRIBUTE. None of the fourteen existing file inputs carries one, and that is
                what keeps the flow on the OUT-OF-PROCESS pickers, which V12.6 :21569 records as
                DEVICE-TESTED and needing no usage description.
              • NO `video/*`. V12.6 :21563 — "none accepts video/*, which is the only reason no microphone
                key was needed". Adding it would need NSMicrophoneUsageDescription and a new build.
            Meet all three and this ships as a WEB DEPLOY: no plugin, no Info.plist change, no App Store
            submission. NSCameraUsageDescription is already present (Info.plist:45) for the camera branch.
            🔎 The value is cleared after every change so re-adding THE SAME FILE fires onChange again.
          */}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={!pick.code}
            className="hidden"
            onChange={e => { add(e.target.files); e.currentTarget.value = '' }}
          />
          {/* 🔴 CLOSED UNTIL A COUNTRY IS CHOSEN (Phase 2D-2): greyed, the input disabled, and add() refuses anyway. */}
          {!pick.code ? (
            <>
              <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" className="mx-auto text-slate-300">
                <rect x="3" y="4" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="8.5" cy="9.5" r="1.6" fill="currentColor" />
                <path d="M4 17l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              <p className="mt-2 text-sm font-bold text-slate-400">Choose a country first</p>
              <p className="mt-1 text-xs text-slate-400">Then drop, paste or pick screenshots here</p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-700">
                Drop, paste or pick screenshots from <strong>{countryWithArticle(countryName(pick.code))}</strong>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                as many as you like at once · or tap to choose · ⌘V to paste
              </p>
            </>
          )}
        </label>

        {fatal && <p className="mt-4 text-sm text-red-600 font-semibold">{fatal}</p>}

        {/* ── IS IT RUNNING ─────────────────────────────────────────────────────────────────────────── */}
        {(progress || lastLine) && (
          <p className="mt-4 text-xs font-semibold text-slate-600">
            {progress}
            {progress && lastLine ? ' · ' : ''}
            {lastLine}
          </p>
        )}

        {/* ── FILTER CHIPS ──────────────────────────────────────────────────────────────────────────── */}
        {logRows.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {FILTERS.map(f => {
              const n = counts[f]
              if (f !== 'all' && n === 0) return null
              const on = filter === f
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    on ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-400'
                  }`}
                >{FILTER_LABEL[f]} {n}</button>
              )
            })}
          </div>
        )}

        {/* ── ROWS STILL IN FLIGHT. They are not in the log yet: nothing has happened to them. ─────── */}
        {items.filter(i => i.status === 'queued' || i.status === 'running').map(item => (
          <div key={item.id} className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.previewUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
            <span className="w-44 shrink-0 truncate text-sm font-bold text-slate-400">
              {item.status === 'running' ? 'Reading…' : 'Waiting'}
            </span>
            <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${
              item.status === 'running' ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-400'
            }`}>{item.status === 'running' ? 'Reading' : 'Queued'}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-400">{item.name}</span>
            <button
              onClick={() => remove(item.id)}
              aria-label={`Remove ${item.name}`}
              className="shrink-0 text-sm font-bold leading-none text-slate-400 hover:text-red-600"
            >✕</button>
          </div>
        ))}

        {/* ── THIS SESSION'S FINISHED ROWS. Shown from the session because only here are the extracted
            details still in memory, which is what "Same truck" and "Add as new" need. ─────────────── */}
        {items.filter(i => i.status === 'done' || i.status === 'error').map(item => {
          const r = item.result
          const outcome: ScreenshotOutcome = item.status === 'error' ? 'failed' : (r?.outcome ?? 'failed')
          if (filter !== 'all' && outcome !== filter) return null
          return (
            <div key={item.id} data-outcome={outcome} className={`mt-3 rounded-xl p-3 ${
              outcome === 'held_country' && !item.decided ? 'border-2 border-[#d97706] bg-[#fffbeb]'
                : outcome === 'needs_a_look' ? 'border border-amber-200 bg-amber-50' : 'border border-slate-200 bg-white'
            }`}>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.previewUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                <span className="w-44 shrink-0 truncate text-sm font-bold">
                  {r?.prospectId
                    ? <a href={prospectPath(r.prospectId)} className="text-orange-700 hover:underline">{r.details?.name || item.name}</a>
                    : (r?.details?.name || (outcome === 'held_country' ? r?.held?.events?.[0]?.truck_name : null) || item.name)}
                </span>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${CHIP_CLASS[outcome]}`}>
                  {OUTCOME_CHIP[outcome]}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-sm text-slate-600"
                  title={item.decided && item.decided !== 'working' ? item.decided : (outcome === 'held_country' ? item.name : (r?.summary ?? item.error ?? ''))}
                >
                  {item.decided && item.decided !== 'working' ? item.decided : (outcome === 'held_country' ? item.name : (r?.summary ?? item.error ?? ''))}
                </span>
                <button
                  onClick={() => remove(item.id)}
                  aria-label={`Remove ${item.name}`}
                  className="shrink-0 text-sm font-bold leading-none text-slate-400 hover:text-red-600"
                >✕</button>
              </div>

              {/* 🔴 THE TWO ONE-CLICK ACTIONS. Only while this session still holds the details. */}
              {outcome === 'needs_a_look' && !item.decided && (
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-14">
                  {(r?.candidates ?? []).map(c => (
                    <button
                      key={c.prospect_id}
                      onClick={() => decide(item, 'same_truck', c.prospect_id)}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                    >Same truck{(r?.candidates?.length ?? 0) > 1 ? ` — ${c.name ?? 'unnamed'}` : ''}</button>
                  ))}
                  <button
                    onClick={() => decide(item, 'add_as_new')}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-500"
                  >Add as new</button>
                </div>
              )}
              {/* 🔴 "CHECK COUNTRY" (Phase 2D-2): nothing is written until Add or Keep is pressed. */}
              {outcome === 'held_country' && r?.held && !item.decided && (
                <div className="mt-2 pl-14" data-held>
                  <p className="text-sm text-amber-900">
                    This looks like {countryWithArticle(r.held.detectedName)}, not {countryWithArticle(r.held.chosenName)}
                    {r.held.reasons ? `: ${r.held.reasons}` : ''}. Nothing has been added yet.
                  </p>
                  <p className="mt-2 text-xs font-bold text-slate-700">{r.held.events.length} event{r.held.events.length === 1 ? '' : 's'} found:</p>
                  <ul className="mt-1 space-y-0.5">
                    {r.held.events.slice(0, 3).map((e, j) => (
                      <li key={j} className="text-xs text-slate-600">
                        {e.event_date}{e.start_time ? ` ${e.start_time}` : ''} · {e.venue_name || '(no venue)'}{e.village ? `, ${e.village}` : ''}{e.state ? `, ${e.state}` : ''}
                      </li>
                    ))}
                    {r.held.events.length > 3 && <li className="text-xs text-slate-400">and {r.held.events.length - 3} more</li>}
                  </ul>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {r.held.detectedKnown && (
                      <button onClick={() => confirmCountry(item, r.held!.detected)}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
                      >Add as {r.held.detectedName}</button>
                    )}
                    <button onClick={() => confirmCountry(item, r.held!.chosen)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-500"
                    >Keep as {r.held.chosenName}</button>
                    <button onClick={() => dismissHeld(item)}
                      className="px-2 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
                    >Dismiss</button>
                  </div>
                  {!r.held.detectedKnown && (
                    <p className="mt-2 text-xs text-slate-500">{r.held.detectedName} isn’t one of our countries yet, so these can’t be added as {r.held.detectedName}.</p>
                  )}
                </div>
              )}
              {item.decided === 'working' && <p className="mt-2 pl-14 text-xs text-slate-500">Saving…</p>}


              {/* The schedule half's detail, unchanged in meaning: every drop is shown WITH ITS REASON. */}
              {r && r.dropped.length > 0 && (
                <ul className="mt-2 space-y-1 pl-14">
                  {r.dropped.map((d, j) => (
                    <li key={j} className="text-xs text-slate-600">
                      <span className="text-amber-600">dropped</span>{' '}
                      {d.event?.truck_name || '(no truck)'} @ {d.event?.venue_name || '(no venue)'} — {d.reason}
                    </li>
                  ))}
                </ul>
              )}
              {r && r.warnings.length > 0 && r.warnings.map((w, j) => (
                <p key={j} className="mt-1 pl-14 text-xs text-amber-700">{w}</p>
              ))}
              {item.error && <p className="mt-2 pl-14 text-xs text-red-600 break-words">{item.error}</p>}
            </div>
          )
        })}

        {/* ── THE LOG: today, then earlier. 🔴 The list the brief asked for reads from the table, so it
            survives a reload; this session's rows above carry the buttons. ─────────────────────────── */}
        {!hasLog && items.length === 0 && (
          <p className="mt-6 text-xs text-slate-500">
            No history is kept yet — run the screenshot-log migration to keep one. Processing works either way.
          </p>
        )}
        {(['today', 'earlier'] as const).map(section => {
          const rows = grouped[section].filter(show)
          if (rows.length === 0) return null
          return (
            <div key={section} className="mt-6">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {section === 'today' ? 'Today' : 'Earlier'}
              </h3>
              <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {rows.map(r => (
                  <div key={r.id} className="flex items-center gap-3 border-b border-slate-100 p-3 last:border-b-0">
                    {previews.has(r.file_name ?? '')
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={previews.get(r.file_name ?? '')} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                      : <div className="h-11 w-11 shrink-0 rounded-lg bg-slate-100" />}
                    <span className="w-44 shrink-0 truncate text-sm font-bold">
                      {r.prospect_id
                        ? <a href={prospectPath(r.prospect_id)} className="text-orange-700 hover:underline">{r.file_name ?? 'screenshot'}</a>
                        : (r.file_name ?? 'screenshot')}
                    </span>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${CHIP_CLASS[r.outcome] ?? CHIP_CLASS.nothing_new}`}>
                      {OUTCOME_CHIP[r.outcome] ?? r.outcome}
                    </span>
                    {/* 🔴 `truncate` IS LOAD-BEARING, NOT DECORATION. 🧪 Measured at 1728 and 2560 in
                        Chromium and WebKit: a summary naming every filled field plus a kept conflict is
                        ~260 characters and wrapped this row to 125px — three lines. The brief asks for a
                        one-line summary, so the line is clipped and `title` keeps the whole text
                        reachable. The log row holds the full string either way. */}
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-600" title={r.summary ?? r.error ?? ''}>{r.summary ?? r.error ?? ''}</span>
                    <span className="shrink-0 text-xs text-slate-400">{timeOf(r.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
