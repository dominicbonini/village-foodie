'use client'

// components/admin/ScreenshotsPanel.tsx
// ADMIN ONLY. Drop, pick or paste event screenshots; each is read by Gemini, filtered, and written
// through /api/inbound-schedule. Replaces the Apps Script's Drive-folder path.
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
// ── WHAT HAPPENS TO THE IMAGE ───────────────────────────────────────────────────────────────────────
// Nothing is stored server-side — no bucket, no object (route.ts holds the same note). The File lives
// in this list, in this tab, and nowhere else. A row that finished cleanly clears itself after a few
// seconds; a row that FAILED, extracted nothing, or had rows dropped STAYS, because those are the ones
// worth a second look. Every row has an ✕ regardless, and leaving the tab discards the lot.
//
// ⚠️ THIS PANEL HAS NOT BEEN SEEN RENDERED. V12.6 records that no agent session as an admin is
// obtainable — Dominic is the sole admin and minting a test credential is blocked — so the extraction,
// the filters and the payload shaping were proven directly (docs/screenshot-upload-build-report.md) and
// the UI was not. Treat its layout as unverified until he opens it.
//
// 🔎 Gated by the same pattern as every other admin surface: the panel holds no gate of its own and
// defers to /api/admin/screenshot-events, which calls verifyAdmin. A non-admin POST returns 401.

import { useState, useRef, useEffect, useCallback } from 'react'
import { nativeAuthHeader } from '@/lib/native/session'

type Dropped = { event: Record<string, string>; reason: string }
type FileResult = {
  fileName: string; extracted: number; kept: number
  dropped: Dropped[]; written: number | null; bridged: number | null; error: string | null
}
type Item = {
  id: string
  file: File
  name: string
  status: 'queued' | 'running' | 'done' | 'error'
  result: FileResult | null
  error: string | null
}

// A finished row is only self-clearing when there is NOTHING on it to read: it wrote at least one event,
// dropped none, and errored not at all. Anything else is the admin's business and stays put.
const isClean = (i: Item) =>
  i.status === 'done' && !i.error && !!i.result && !i.result.error
  && i.result.dropped.length === 0 && (i.result.written ?? 0) > 0

export default function ScreenshotsPanel() {
  const [items, setItems] = useState<Item[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const [totalWritten, setTotalWritten] = useState(0)
  const runningRef = useRef(false)

  const add = useCallback((incoming: FileList | File[] | null) => {
    const list = Array.from(incoming ?? []).filter(f => f.size > 0 && f.type.startsWith('image/'))
    if (!list.length) return
    setFatal(null)
    setItems(prev => [...prev, ...list.map(f => ({
      // crypto.randomUUID is available in every browser this ships to and in the iOS WKWebView.
      id: crypto.randomUUID(), file: f, name: f.name || 'pasted image',
      status: 'queued' as const, result: null, error: null,
    }))])
  }, [])

  const remove = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }, [])

  // ── THE QUEUE ─────────────────────────────────────────────────────────────────────────────────────
  // Re-runs on every `items` change and takes the first queued row. `runningRef` (a ref, not state, so
  // it updates synchronously and cannot be double-entered by two renders) keeps that to one at a time.
  useEffect(() => {
    if (runningRef.current) return
    const next = items.find(i => i.status === 'queued')
    if (!next) return
    runningRef.current = true

    ;(async () => {
      setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'running' } : i))
      let patch: Partial<Item>
      try {
        const fd = new FormData()
        fd.append('files', next.file, next.name)
        const res = await fetch('/api/admin/screenshot-events', {
          method: 'POST', headers: { ...await nativeAuthHeader() }, body: fd,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          // A 401 or a failed exclusion read is about the BATCH, not this file — surface it at the top
          // as well, or it reads as one bad screenshot when it is the whole surface being unavailable.
          if (res.status === 401 || res.status === 500) setFatal(data?.error ?? `Request failed (${res.status})`)
          patch = { status: 'error', error: data?.error ?? `Request failed (${res.status})` }
        } else {
          const r: FileResult | undefined = data?.results?.[0]
          if (r?.written) setTotalWritten(t => t + (r.written ?? 0))
          patch = { status: r?.error ? 'error' : 'done', result: r ?? null, error: r?.error ?? null }
        }
      } catch (e: any) {
        patch = { status: 'error', error: e?.message ?? 'Upload failed' }
      } finally {
        runningRef.current = false
      }
      setItems(prev => prev.map(i => i.id === next.id ? { ...i, ...patch } : i))
    })()
  }, [items])

  // Clean rows clear themselves. Separate effect so the queue above stays about the queue; the timer is
  // cleared on unmount, so leaving the tab mid-countdown cannot set state on a gone component.
  useEffect(() => {
    const clean = items.filter(isClean)
    if (!clean.length) return
    const t = setTimeout(() => setItems(prev => prev.filter(i => !isClean(i))), 6000)
    return () => clearTimeout(t)
  }, [items])

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

  const pending = items.filter(i => i.status === 'queued' || i.status === 'running').length

  return (
    <div className="text-slate-900">
      <div className="max-w-3xl">
        <p className="text-sm text-slate-500">
          Drop, paste or pick schedule screenshots. Each one starts reading as soon as it lands — there is
          nothing to press. Images are not stored anywhere; the events are written as discovery events.
        </p>

        {/* ── THE DROP ZONE ──────────────────────────────────────────────────────────────────────────
            🔴 A <label> WRAPPING THE INPUT, not a div with an onClick. The label makes the whole zone
            the input's own click target, which is what keeps the iOS system panel reachable by tapping
            anywhere in it — a synthetic .click() on a hidden input is the pattern that gets blocked.
            ⚠️ dragOver needs preventDefault on BOTH dragover and drop or the browser navigates to the
            dropped file instead of handing it over. */}
        <label
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); add(e.dataTransfer.files) }}
          className={`mt-5 block cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? 'border-orange-500 bg-orange-50' : 'border-slate-300 bg-white hover:border-orange-400'
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
            ⚠️ `multiple` is new relative to the existing inputs but changes none of the above — it is a
            property of the same system panel.
            🔎 The value is cleared after every change so re-adding THE SAME FILE fires onChange again.
          */}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { add(e.target.files); e.currentTarget.value = '' }}
          />
          <p className="text-sm font-bold text-slate-700">Drop screenshots here</p>
          <p className="mt-1 text-xs text-slate-500">or tap to choose · ⌘V to paste</p>
        </label>

        {fatal && <p className="mt-4 text-sm text-red-600 font-semibold">{fatal}</p>}

        {(pending > 0 || totalWritten > 0) && (
          <p className="mt-4 text-xs font-semibold text-slate-500">
            {pending > 0 && <>{pending} waiting · </>}
            {totalWritten} event{totalWritten === 1 ? '' : 's'} written this session
          </p>
        )}

        {/* ── THE LIST ───────────────────────────────────────────────────────────────────────────────
            🔴 Every dropped row is shown WITH ITS REASON — a silent drop is indistinguishable from the
            model not seeing the row, which is the fault this surface exists to fix. */}
        {items.map(item => {
          const r = item.result
          return (
            <div key={item.id} className="mt-3 border border-slate-200 rounded-xl bg-white p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-bold text-sm break-all">{item.name}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-bold ${
                    item.status === 'error' ? 'text-red-600'
                      : item.status === 'running' ? 'text-orange-600'
                      : item.status === 'queued' ? 'text-slate-400'
                      : (r?.written ?? 0) > 0 ? 'text-green-700' : 'text-amber-600'
                  }`}>
                    {item.status === 'queued' ? 'waiting'
                      : item.status === 'running' ? 'reading…'
                      : item.status === 'error' ? 'FAILED'
                      : (r?.written ?? 0) > 0 ? `${r?.written} written` : 'nothing written'}
                  </span>
                  {/* Deleting a RUNNING row drops it from the list; the request already in flight is not
                      cancelled and may still write. Said plainly rather than pretending it aborts. */}
                  <button
                    onClick={() => remove(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="text-slate-400 hover:text-red-600 text-sm font-bold leading-none"
                  >✕</button>
                </div>
              </div>

              {r && (
                <p className="mt-1 text-xs text-slate-500">
                  {r.extracted} extracted · {r.kept} kept · {r.dropped.length} dropped
                  {r.bridged != null && r.bridged > 0 ? ` · ${r.bridged} bridged to an operator` : ''}
                </p>
              )}
              {item.error && <p className="mt-2 text-xs text-red-600 break-words">{item.error}</p>}
              {r && r.dropped.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {r.dropped.map((d, j) => (
                    <li key={j} className="text-xs text-slate-600">
                      <span className="text-amber-600">dropped</span>{' '}
                      {d.event?.truck_name || '(no truck)'} @ {d.event?.venue_name || '(no venue)'} — {d.reason}
                    </li>
                  ))}
                </ul>
              )}
              {item.status === 'done' && !item.error && r?.extracted === 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  The model returned no events for this image. Nothing was stored — try a clearer crop,
                  drop it again, or add the events by hand.
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
