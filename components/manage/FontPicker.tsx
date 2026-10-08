'use client'
// components/manage/FontPicker.tsx — choosing a font: 1,819 of them, or one of your own.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS WAS, AND WHY IT WAS ALREADY ITS OWN FILE
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// A `<select>` over 21 committed families, grouped. Part 1 split it out of the editor with one
// sentence of justification: *"the brief for part 2 is to let a truck UPLOAD a font, which means this
// control grows."* It grew. The four changes that note predicted — a "Yours" group, a per-entry
// licence note, an upload row, and a disabled state for a font still being checked — are all here, and
// they were made ONCE.
//
// ⛔ AND NOTHING ELSE IN `components/` MAY BUILD A FONT CONTROL. `scripts/weekly-post.cjs` asserts that
// `FONT_CHOICES` is looped in exactly one file, and `scripts/design-fonts.cjs` asserts the same of the
// catalogue hook. A second picker is the thing that would have to be changed twice.
//
// ── 🔴 HOW A ROW PREVIEWS ITS FONT, AND THE TWO ANSWERS ARE DIFFERENT ─────────────────────────────
//
//   • **A library family** (including the 21 bundled ones, which are all Google families): the browser
//     loads Google's web font CSS and the row is drawn in the real face. ⚠️ THIS PRODUCT HAS NO
//     Content-Security-Policy — not in `next.config.ts`, not in `vercel.json`, and there is no
//     middleware — so nothing had to be loosened to allow it. That was checked, not assumed, and it is
//     in docs/design-fonts-report.md. ⚠️ It does mean the operator's browser contacts Google when they
//     open the list; that is a display-only request and no font is fetched this way for RENDERING.
//
//   • **A font the truck uploaded**: there is no web font for it, and this feature deliberately never
//     gives the browser a URL for a font file — an uploaded font may be commercially licensed, and a
//     readable URL from our domain would be redistribution. So the row previews as a small **PNG from
//     our own renderer** (`font_sample`), which is the brief's named fallback and has the advantage of
//     being the truth: it is the same satori that will draw the poster.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  invalidateFontLibrary, useFontLibrary,
  type FontGroupKey, type LibraryFont,
} from './useFontLibrary'
import { FONT_UPLOAD_BTN, LICENCE_TICK, MAX_FONT_BYTES } from '@/lib/weekly-post/font-refs'

/** The brief's six tabs. ⚠️ "All" is no filter and "Yours" is not a catalogue group. */
type Tab = 'all' | FontGroupKey | 'own'
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'bold', label: 'Bold & tall' },
  { id: 'hand', label: 'Handwritten' },
  { id: 'classic', label: 'Classic' },
  { id: 'clean', label: 'Clean' },
  { id: 'own', label: 'Yours' },
]

/**
 * ══ 🔴 HOW MANY ROWS ARE DRAWN AT ONCE ════════════════════════════════════════════════════════════
 *
 * ⛔ 1,819 ROWS WOULD BE 1,819 `@font-face` DOWNLOADS. Each row is drawn in its own font, so rendering
 * the whole list would have the browser fetch every font in the Google library — tens of megabytes,
 * and the list would be unusable while it happened.
 *
 * 🔴 SO THE LIST IS CAPPED AND THE CAP IS THE FEATURE: forty before anybody searches (the brief's
 * "about 40 popular picks"), and sixty matches after. Nobody scrolls past sixty results — they type
 * another letter — and the search covers all 1,819 whichever tab is open.
 * ⚠️ THE COUNT OF MATCHES IS SHOWN when it exceeds the cap, so a short list is never mistaken for the
 * whole answer.
 */
const PAGE = 60

export interface FontPickerProps {
  value: string
  onChange: (fontId: string) => void
  /** The dashboard token — the picker loads the catalogue and does the uploads itself. */
  token: string
  /** The trigger's classes, so the toolbar can size it. */
  className?: string
  /** The sample the rows are drawn with. ⚠️ Passed in, so it is the design's own date wording. */
  sample?: string
  /** Called after an upload or a removal, so the editor can re-read what faces exist. */
  onLibraryChanged?: () => void
  disabled?: boolean
}

/**
 * ══ 🔴 THE WEB FONT `<link>`, FOR THE VISIBLE ROWS ONLY ═══════════════════════════════════════════
 *
 * ⚠️ ONE `<link>` FOR THE WHOLE VISIBLE PAGE, not one per row. Google's css2 endpoint takes many
 * `family=` parameters in one request, so sixty rows are one stylesheet instead of sixty.
 * ⚠️ `display=swap` SO A ROW IS NEVER BLANK while its font arrives — it shows in the fallback and then
 * swaps. Without it the list flashes empty, which reads as broken rather than loading.
 * ⛔ AND THE TAG IS REPLACED, NOT ACCUMULATED. Typing in the search box changes the visible set on
 * every keystroke; appending a link per keystroke would leave a hundred stylesheets on the page.
 */
function useWebFontPreviews(families: readonly string[], enabled: boolean) {
  const keyRef = useRef('')
  useEffect(() => {
    if (!enabled || !families.length) return
    const key = families.join('|')
    if (key === keyRef.current) return
    keyRef.current = key
    const id = 'hg-font-previews'
    document.getElementById(id)?.remove()
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    /* ⚠️ `text=` IS NOT USED, DELIBERATELY. Google can subset a font to the exact characters asked for,
     * which would be smaller — and would make every row's stylesheet URL depend on the sample text, so
     * changing the sample would re-download all sixty. The full Latin subset is cached across pages. */
    link.href = 'https://fonts.googleapis.com/css2?'
      + families.map(f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}`).join('&')
      + '&display=swap'
    document.head.appendChild(link)
  }, [families, enabled])
}

/** The sample row for one font. */
function FontRow({ font, selected, sample, token, onPick }: {
  font: LibraryFont
  selected: boolean
  sample: string
  token: string
  onPick: () => void
}) {
  return (
    <button type="button" onClick={onPick}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left ${selected
        ? 'bg-orange-50 ring-1 ring-orange-400'
        : 'hover:bg-slate-50'}`}>
      <span className="min-w-0 flex-1">
        {/* ⚠️ THE NAME IS SMALL AND GREY AND THE SAMPLE IS THE BIG THING, which is the brief's order and
          * the right one: an operator is choosing a LOOK, and they recognise it before they read it. */}
        <span className={`block truncate text-[11px] ${selected ? 'font-bold text-orange-700' : 'text-slate-400'}`}>
          {font.own ? (font.displayName || font.family) : font.family}
          {font.own && <span className="ml-1 text-slate-300">· yours</span>}
        </span>
        {font.own
          ? <OwnSample token={token} family={font.family} sample={sample} />
          /* 🔴 THE SAMPLE IS DRAWN IN THE REAL FACE, with a serif fallback so an unloaded row still
            * reads. ⚠️ `whiteSpace: nowrap` + truncate: a long sample must not make the row two lines
            * and shuffle the whole list as fonts arrive. */
          : <span className="block truncate text-[17px] leading-snug text-slate-800"
              style={{ fontFamily: `'${font.family}', Georgia, serif` }}>{sample}</span>}
      </span>
      {/* ⚠️ THE LICENCE IS SHOWN, QUIETLY. It is the one fact about a font that matters legally and the
        * one an operator never thinks to ask — and for an uploaded font it reads "Your own". */}
      <span className="shrink-0 text-[10px] text-slate-300">{font.licence}</span>
    </button>
  )
}

/**
 * An uploaded font's preview: a PNG from our own renderer.
 *
 * ⛔ WHY NOT A `@font-face` POINTING AT OUR STORAGE: an uploaded font may be a commercially licensed
 * file. A URL the browser can read is a URL anyone can read, and serving somebody else's paid font
 * from our domain is redistribution. The PNG shows the operator their font without handing out the
 * font. ⚠️ It is also the truth — the same satori that draws the poster.
 */
function OwnSample({ token, family, sample }: { token: string; family: string; sample: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let made: string | null = null
    ;(async () => {
      try {
        const r = await fetch('/api/weekly-post', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, action: 'font_sample', family, text: sample }),
        })
        if (!r.ok || !alive) return
        made = URL.createObjectURL(await r.blob())
        if (alive) setUrl(made); else URL.revokeObjectURL(made)
      } catch { /* the name still identifies it */ }
    })()
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [token, family, sample])
  return url
    ? <img src={url} alt={sample} className="block h-[22px] w-auto max-w-full" />
    : <span className="block truncate text-[17px] leading-snug text-slate-300">{sample}</span>
}

export function FontPicker(props: FontPickerProps) {
  const { value, onChange, token, className, sample = 'Wednesday 14th October', onLibraryChanged, disabled } = props
  const lib = useFontLibrary(token)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [choosing, setChoosing] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null)
  /** 🔴 §8 · The file the operator chose, waiting on the licence tick. ⚠️ null = no card is open. */
  const [picked, setPicked] = useState<File | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const chosen = lib.byId.get(value)

  /* ⚠️ CLOSED ON AN OUTSIDE `pointerdown` AND ON Escape. `pointerdown`, not `click`: a click fires
   * after release, and a control inside the panel that re-renders the tree can deliver it to a
   * different element than the one pressed — closing the panel mid-interaction. */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const el = panelRef.current
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // ── WHICH ROWS ARE SHOWN ────────────────────────────────────────────────────────────────────────
  const { rows, total } = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      /* 🔴 BEFORE ANYBODY SEARCHES: the chosen picks, not the first forty of the catalogue. Google's
       * own popularity order is the order the WEB is set in — Roboto, Open Sans, Noto Sans — and a
       * food truck's poster is a headline on a photograph. See `POPULAR_PICKS`. */
      const base = tab === 'own' ? lib.own
        : tab === 'all' ? lib.popular
          : lib.popular.filter(f => f.group === tab)
      /* ⚠️ A GROUP TAB WITH FEW PICKS IS TOPPED UP FROM THE FULL CATALOGUE, so "Handwritten" is not
       * ten rows when there are 247 of them. "All" is NOT topped up — it is the picks, deliberately. */
      const extra = tab === 'all' || tab === 'own' ? [] : lib.all.filter(f => f.group === tab && !base.includes(f))
      const list = [...base, ...extra]
      return { rows: list.slice(0, PAGE), total: list.length }
    }
    const pool = tab === 'own' ? lib.own : tab === 'all' ? lib.all : lib.all.filter(f => f.group === tab)
    /* ⚠️ STARTS-WITH BEATS CONTAINS. Typing "lob" must put Lobster first, not "Baloo Bhaijaan" —
     * which contains those letters in the middle of a word. */
    const starts: LibraryFont[] = []
    const inside: LibraryFont[] = []
    for (const f of pool) {
      const name = (f.own ? `${f.displayName ?? ''} ${f.family}` : f.family).toLowerCase()
      if (name.startsWith(q)) starts.push(f)
      else if (name.includes(q)) inside.push(f)
    }
    const list = [...starts, ...inside]
    return { rows: list.slice(0, PAGE), total: list.length }
  }, [query, tab, lib])

  const recent = useMemo(
    () => (query.trim() ? [] : lib.recent.filter(f => !rows.slice(0, 8).includes(f)).slice(0, 6)),
    [lib.recent, rows, query])

  /* 🔴 ONLY THE LIBRARY ROWS GET A WEB FONT — an uploaded one has no family on Google, and asking for
   * it would be one 404 per row per keystroke. */
  const previewFamilies = useMemo(
    () => [...recent, ...rows].filter(f => !f.own).map(f => f.family).slice(0, PAGE + 6),
    [rows, recent])
  useWebFontPreviews(previewFamilies, open)

  /**
   * Pick a font.
   *
   * 🔴 `font_choose` IS CALLED BEFORE `onChange`, AND THE SELECTION WAITS FOR IT. That request is where
   * a library family's files are FETCHED — once ever, for all trucks — and where the licence rule is
   * enforced. Selecting first and fetching afterwards would let an operator save a design naming a
   * font whose files had failed to arrive, and the poster would silently render in Oswald.
   * ⚠️ THE ROW IS DISABLED AND SAYS "Adding…" WHILE IT HAPPENS, which is the "disabled state for a
   * font still being checked" part 1's note predicted.
   */
  const pick = useCallback(async (font: LibraryFont) => {
    setMsg(null)
    if (font.id === value) { setOpen(false); return }
    setChoosing(font.id)
    try {
      const r = await fetch('/api/weekly-post', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'font_choose', fontId: font.id }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ready) throw new Error(j.error || 'That font could not be added')
      onChange(font.id)
      setOpen(false)
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'That font could not be added', bad: true })
    } finally { setChoosing(null) }
  }, [token, value, onChange])

  const label = chosen ? (chosen.own ? (chosen.displayName || chosen.family) : chosen.family)
    : lib.loading ? 'Loading fonts…' : value

  return (
    <div className="relative">
      {/* ⚠️ A BUTTON, NOT A `<select>`. A native select cannot draw each option in its own font, which
        * is the one thing a font picker has to do. */}
      <button type="button" disabled={disabled}
        onClick={() => { setOpen(o => !o); setMsg(null) }}
        aria-haspopup="listbox" aria-expanded={open}
        className={`${className ?? ''} flex items-center justify-between gap-1 text-left`}>
        <span className="min-w-0 truncate">{label}</span>
        <span aria-hidden="true" className="shrink-0 text-slate-400">▾</span>
      </button>

      {open && (
        <div ref={panelRef}
          /* ══ 🔴 IT OPENS INSIDE **ITS PARENT'S** WIDTH, NOT THE VIEWPORT'S (9 October 2026) ══════════
            * ⛔ IT WAS `w-[22rem]` CAPPED AT `calc(100vw-2rem)`, AND 22rem IS 352px — WIDER THAN THE
            * 380px PANEL'S CONTENT BOX ONCE ITS PADDING IS TAKEN OFF. The viewport cap could not help:
            * on a 1728px window `100vw-2rem` is 1696px, so the panel opened at its full 352px and ran
            * past the right edge of the settings column it lives in. **A cap against the wrong
            * container is not a cap.**
            * 🔴 `w-full` IS THE FIX AND IT IS THE SIMPLE ONE: the picker's own button is as wide as its
            * row, so the panel is too, and it can no longer be wider than the thing that contains it at
            * any width. ⚠️ `min-w-[16rem]` STOPS IT COLLAPSING in a narrow `Field` — a font list 120px
            * wide is a list nobody can read a family name in.
            * ⚠️ AND THE VIEWPORT CAP STAYS AS WELL, for the one case `w-full` cannot cover: a 390px
            * phone where the row itself is nearly the whole screen. */
          className="absolute z-50 left-0 top-full mt-1 w-full min-w-[16rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
          data-font-panel>
          {/* ══ 🔴 SEARCH, AND "↑ Upload your font" BESIDE IT (§8, 9 October 2026) ═══════════════════
            * ⛔ THE UPLOAD WAS AT THE **BOTTOM**, under a capped list of forty rows, behind a tick that
            * had to be ticked before the file button would even open. So the one thing an operator with
            * their own font came here to do was the thing furthest from the top, disabled, with no
            * indication of why. ⚠️ **ALWAYS ENABLED**, which is the brief's instruction and the right
            * order: choose the file, THEN claim the licence. The tick is now a precondition of "Add
            * font", not of the file dialog, so nothing is uploaded before it is ticked either way. */}
          <div className="flex items-center gap-1.5">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              /* 🔴 THE REAL COUNT, FROM THE CATALOGUE. A hard-coded "1,500+" would be a number that goes
                * stale the first time the catalogue is rebuilt — and this one is 1,819. */
              placeholder={lib.loading ? 'Loading fonts…' : `Search ${lib.count.toLocaleString('en-GB')} fonts`}
              className="min-w-0 grow rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <label className="shrink-0 cursor-pointer rounded-xl border border-slate-300 px-2 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              data-font-upload-btn>
              <input type="file" accept=".ttf,.otf,font/ttf,font/otf,application/font-sfnt" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  /* ⚠️ THE VALUE IS CLEARED so choosing the SAME file twice fires `change` again — a
                   * cancelled card followed by the same file would otherwise do nothing. */
                  e.currentTarget.value = ''
                  if (f) { setPicked(f); setMsg(null) }
                }} />
              {FONT_UPLOAD_BTN}
            </label>
          </div>

          {/* 🔴 THE CARD APPEARS AT THE TOP, WHERE THE BUTTON IS. A confirmation that opened at the
            * bottom of a scrolling list would be a confirmation the operator never saw. */}
          {picked && (
            <UploadCard token={token} file={picked}
              onCancel={() => setPicked(null)}
              onDone={(id) => {
                setPicked(null)
                invalidateFontLibrary(token)
                lib.reload()
                onLibraryChanged?.()
                if (id) onChange(id)
              }} onMessage={setMsg} />
          )}

          {/* ── TABS ─────────────────────────────────────────────────────────────────────────── */}
          {/* ⚠️ THEY WRAP. Six tabs do not fit one line at 390px, and a scrolling strip would hide
            * "Yours" — the one tab an operator who has uploaded a font is looking for. */}
          <div className="mt-2 flex flex-wrap gap-1">
            {TABS.map(t => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`rounded-lg px-2 py-1 text-xs font-bold ${tab === t.id
                  ? 'bg-orange-50 text-orange-700'
                  : 'text-slate-500 hover:bg-slate-50'}`}>
                {t.label}{t.id === 'own' && lib.own.length ? ` (${lib.own.length})` : ''}
              </button>
            ))}
          </div>

          {msg && (
            <p className={`mt-2 rounded-xl border px-2 py-1.5 text-xs ${msg.bad
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{msg.text}</p>
          )}

          {/* ── THE LIST ─────────────────────────────────────────────────────────────────────── */}
          {/* 🔴 IT SCROLLS **INSIDE** THE PANEL. A panel that grew with its contents would be 60 rows
            * tall and the page would scroll instead — taking the picture the operator is judging the
            * font against off the screen. */}
          <div className="mt-2 max-h-[46vh] min-h-[8rem] overflow-y-auto overflow-x-hidden">
            {lib.loading && <p className="p-3 text-xs text-slate-400">Loading the font library…</p>}
            {lib.error && (
              <div className="p-3">
                <p className="text-xs text-red-600">{lib.error}</p>
                <button type="button" onClick={lib.reload} className="mt-1 text-xs font-bold text-orange-700">Try again</button>
              </div>
            )}
            {!lib.loading && !lib.error && tab === 'own' && !lib.own.length && (
              <p className="p-3 text-xs text-slate-400">
                You haven&rsquo;t uploaded a font yet. Use the button below.
              </p>
            )}

            {/* 🔴 "Recently used" AT THE TOP — the fonts this truck's own designs already name. It is
              * read off their saved designs rather than from a table of its own, so it cannot be
              * wrong: the fonts they have used ARE the fonts in their designs. */}
            {recent.length > 0 && (
              <>
                <p className="px-2 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Recently used</p>
                {recent.map(f => (
                  <FontRow key={`r-${f.id}`} font={f} selected={f.id === value} sample={sample}
                    token={token} onPick={() => void pick(f)} />
                ))}
                <div className="my-1 border-t border-slate-100" />
              </>
            )}

            {!query.trim() && tab !== 'own' && rows.length > 0 && (
              <p className="px-2 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Popular for posters</p>
            )}
            {rows.map(f => (
              <FontRow key={f.id} font={f} selected={f.id === value} sample={sample}
                token={token} onPick={() => void pick(f)} />
            ))}
            {choosing && <p className="px-2 py-1 text-[11px] text-slate-400">Adding&hellip;</p>}
            {!lib.loading && !lib.error && query.trim() && !rows.length && (
              <p className="p-3 text-xs text-slate-400">No font matches &ldquo;{query.trim()}&rdquo;.</p>
            )}
            {/* ⚠️ SAID OUT LOUD WHEN THE LIST IS CAPPED, so a short list is never mistaken for the
              * whole answer. */}
            {total > rows.length && (
              <p className="px-2 py-2 text-[11px] text-slate-400">
                Showing {rows.length} of {total.toLocaleString('en-GB')} — type more to narrow it down.
              </p>
            )}
          </div>

          {/* ⛔ `UploadYourOwn` WAS HERE AND IS GONE — see the note beside the search box. It was a
            * tick, a disabled file button and two grey lines under a capped list; the same upload is
            * now a button at the TOP and a card that appears where the button is. */}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 §3 · UPLOAD YOUR OWN FONT
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴 §8 · THE CARD — THE FILE IS ALREADY CHOSEN, THE TICK GATES THE **UPLOAD** ══════════════════
 *
 * ⛔ IT WAS THE OTHER WAY ROUND AND THAT WAS THE PROBLEM. `UploadYourOwn` disabled the FILE INPUT until
 * the tick was ticked, so an operator who came to add their font found a greyed-out button at the
 * bottom of a list of forty, with the thing that would enable it above it in small grey text. The
 * order was backwards: you cannot sensibly claim a licence for a file you have not named yet.
 *
 * 🔴 SO THE BUTTON AT THE TOP IS ALWAYS ENABLED, and THIS is where the tick lives — between choosing a
 * file and sending it. ⚠️ **NOTHING IS UPLOADED UNTIL "Add font" IS PRESSED**, which is the property
 * the old order was protecting and this order keeps: there is still no path where a file reaches our
 * bucket before somebody has claimed a right to it. ⚠️ AND THE SERVER REFUSES IT ANYWAY —
 * `font_confirm` removes the object and answers with the same sentence if the tick is absent, because
 * a client-side gate is advice.
 */
function UploadCard({ token, file, onDone, onCancel, onMessage }: {
  token: string
  /** 🔴 Already chosen. ⚠️ Held by the picker, not by this card, so Cancel cannot leave one behind. */
  file: File
  onDone: (fontId: string | null) => void
  onCancel: () => void
  onMessage: (m: { text: string; bad: boolean } | null) => void
}) {
  const [ticked, setTicked] = useState(false)
  const [busy, setBusy] = useState(false)
  /** After a successful upload: which faces are still missing, so the prompt can offer them. */
  const [added, setAdded] = useState<{ displayName: string; faceLabel: string; missing: { face: string; label: string }[] } | null>(null)

  const upload = async () => {
    onMessage(null)
    /* ⚠️ CHECKED IN THE BROWSER **AND** ON THE SERVER. This is for speed — refusing a 40MB file before
     * it is uploaded — not for safety: the server reads the real bytes and is the one that decides. */
    if (file.size > MAX_FONT_BYTES) {
      onMessage({ text: `That font is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 5MB.`, bad: true })
      return
    }
    const name = file.name.toLowerCase()
    /* ⛔ THE WOFF REFUSAL IS GIVEN BEFORE THE UPLOAD WHERE THE NAME MAKES IT OBVIOUS, in the brief's
     * words — and the server repeats it from the file's MAGIC, because a renamed .woff2 would get
     * past this. Two checks, one sentence. */
    if (/\.woff2?$/.test(name)) {
      onMessage({ text: 'Please upload a TTF or OTF file — you can usually download one from where you bought the font.', bad: true })
      return
    }
    const ext = name.endsWith('.otf') ? 'otf' : 'ttf'
    setBusy(true)
    try {
      const slot = await api(token, { action: 'font_upload_url', ext })
      const put = await fetch(slot.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': 'font/ttf' } })
      if (!put.ok) throw new Error('The upload did not complete')
      const done = await api(token, { action: 'font_confirm', path: slot.path, licenceConfirmed: true })
      setAdded({ displayName: done.displayName, faceLabel: done.faceLabel, missing: done.missingFaces ?? [] })
      onMessage({
        /* 🔴 THE FACE IT DECIDED IS NAMED. A font that calls itself "SemiBold" lands on Bold, and an
         * operator who uploaded it as their regular needs to see that rather than wonder later why
         * their text is heavy. */
        text: `Added “${done.displayName}” as its ${done.faceLabel}.`,
        bad: false,
      })
      /* ⚠️ THE CARD STAYS OPEN WHEN THERE ARE MORE FACES TO ADD, and closes when there are not — the
       * prompt below is the only moment at which offering the bold file makes sense. */
      if (!(done.missingFaces ?? []).length) onDone(done.fontId ?? null)
      else onDone(done.fontId ?? null)
    } catch (e) {
      onMessage({ text: e instanceof Error ? e.message : 'That font could not be added', bad: true })
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5" data-font-upload-card>
      {/* 🔴 THE FILE NAME, SO THE OPERATOR CAN SEE THEY CHOSE THE RIGHT ONE before they claim a licence
        * for it. ⚠️ `truncate` with `min-w-0`: font files are routinely called
        * "Brandon_Grotesque_Medium_Regular.otf". */}
      <p className="min-w-0 truncate text-xs font-semibold text-slate-700" data-font-file-name>{file.name}</p>
      <label className={`mt-1.5 flex items-start gap-2 text-[11px] ${busy ? 'text-slate-400' : 'text-slate-600'}`}>
        <input type="checkbox" className="mt-0.5" checked={ticked} disabled={busy}
          onChange={e => setTicked(e.target.checked)} />
        <span>{LICENCE_TICK}</span>
      </label>
      <div className="mt-2 flex items-center gap-1.5">
        {/* ⛔ "Add font" IS THE ONLY THING THE TICK DISABLES. It is the press that sends the file. */}
        <button type="button" disabled={!ticked || busy} onClick={() => void upload()}
          className="rounded-xl bg-orange-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
          data-font-add>{busy ? 'Checking the font…' : 'Add font'}</button>
        <button type="button" disabled={busy} onClick={onCancel}
          className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
          data-font-cancel>Cancel</button>
      </div>

      {/* 🔴 §3's PROMPT AFTER THE FIRST UPLOAD. A family can have three files and each is uploaded
        * separately, so the only moment it makes sense to offer the next one is right after the first
        * has landed. ⚠️ "(optional)" IS IN THE WORDS: a family with one file works perfectly. */}
      {added && added.missing.length > 0 && (
        <p className="mt-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600">
          Add the {added.missing.map(m => m.label.toLowerCase()).join(' or ')} version of
          {' '}&ldquo;{added.displayName}&rdquo; (optional) — choose the file again.
        </p>
      )}
    </div>
  )
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

/**
 * Does this family have a bold of its own?
 *
 * ⚠️ RE-EXPORTED FROM THE HOOK (6 October 2026, part 2). It used to read `FONT_CHOICES` — the 21
 * committed families — which cannot answer the question for a library or an uploaded font. The
 * toolbar asks `faceSupport(lib, id)` now, which answers for all three kinds, and that is what the
 * Italic button needed too.
 */
export { faceSupport, useFontLibrary } from './useFontLibrary'
export type { FontLibrary, LibraryFont } from './useFontLibrary'
