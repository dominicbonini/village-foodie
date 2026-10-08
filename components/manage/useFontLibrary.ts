'use client'
// components/manage/useFontLibrary.ts — the font library, fetched once per page.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY A HOOK AND NOT A FETCH INSIDE THE PICKER
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// TWO things need this data and they are in different places on the screen:
//   • **the picker**, which lists 1,819 families; and
//   • **the toolbar's Bold and Italic buttons**, which must appear only when the CHOSEN family has
//     those files — and they sit beside the picker, not inside it.
//
// ⛔ SO IT CANNOT LIVE IN THE PICKER. A picker that owned the data would have to publish it upwards
// through a callback, and the toolbar would be drawing buttons from a copy that arrives one render
// after the thing it describes — which is how a Bold button ends up visible for a single-weight
// family for one frame, or hidden for a family that has one.
//
// 🔴 AND THE REQUEST IS CACHED AT MODULE SCOPE, NOT IN STATE. `DesignEditor` is REMOUNTED whenever the
// design being edited changes (its `key` is the design id and the canvas size — part 1, §7), so a
// hook that fetched in an effect would re-fetch ~99KB every time the operator switched from Standard
// to a place's design. The promise is kept here and shared.

import { useCallback, useEffect, useState } from 'react'
import { FALLBACK_FONT_ID } from '@/lib/weekly-post/font-refs'

export type FontGroupKey = 'bold' | 'hand' | 'classic' | 'clean'

export interface LibraryFont {
  id: string
  family: string
  group: FontGroupKey
  licence: string
  hasBold: boolean
  hasItalic: boolean
  /** true = the truck uploaded this one. ⚠️ Decides the "Yours" tab AND how it is previewed. */
  own: boolean
  /** Uploaded fonts only: the name the operator chose, which may differ from the font's own. */
  displayName?: string
}

export interface FontLibrary {
  loading: boolean
  error: string | null
  /** Every library family, already in popularity order, plus the truck's own at the front. */
  all: LibraryFont[]
  byId: Map<string, LibraryFont>
  /** The ~40 chosen picks, in order. See `POPULAR_PICKS` in lib/weekly-post/font-catalogue.ts. */
  popular: LibraryFont[]
  /** The truck's uploads, grouped into families. */
  own: LibraryFont[]
  /** Ids this truck has already used in a saved design, most-recent-looking first. */
  recent: LibraryFont[]
  /** How many library fonts there are — for "Search 1,819 fonts". 🔴 Never hard-coded. */
  count: number
  reload: () => void
}

/** The wire shape — `cataloguePayload()` in lib/weekly-post/font-catalogue.ts, plus the truck's own. */
interface Payload {
  count: number
  families: Array<[string, string, FontGroupKey, string, 0 | 1, 0 | 1]>
  popular: string[]
  own: Array<{ id: string; family: string; displayName: string; hasBold: boolean; hasItalic: boolean; faces: string[] }>
  recent: string[]
}

/* ⚠️ KEYED BY TOKEN. One browser tab is one truck, but a developer switching between two dashboard
 * tokens in the same tab must not be shown the first truck's uploaded fonts. */
const cache = new Map<string, Promise<Payload>>()

const fetchPayload = (token: string): Promise<Payload> => {
  const hit = cache.get(token)
  if (hit) return hit
  const p = (async () => {
    const r = await fetch('/api/weekly-post', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'font_catalogue' }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'The font library could not be loaded')
    return j as Payload
  })()
  /* ⚠️ A FAILED REQUEST IS NOT CACHED. Caching the rejection would make one network blip permanent for
   * the life of the page, and the picker's "Try again" would do nothing. */
  p.catch(() => cache.delete(token))
  cache.set(token, p)
  return p
}

/** After an upload or a removal. ⚠️ Clears the shared promise so every mounted picker re-reads. */
export const invalidateFontLibrary = (token: string) => { cache.delete(token) }

const empty: Omit<FontLibrary, 'reload'> = {
  loading: true, error: null, all: [], byId: new Map(), popular: [], own: [], recent: [], count: 0,
}

export function useFontLibrary(token: string): FontLibrary {
  const [state, setState] = useState<Omit<FontLibrary, 'reload'>>(empty)
  const [nonce, setNonce] = useState(0)

  /* ⚠️ NO `react-hooks/set-state-in-effect` DISABLE IS NEEDED HERE, and that is worth noting because
   * every other load in Manage carries one. Both `setState` calls are inside an async IIFE AFTER an
   * `await`, so the rule — which only objects to a setState in the effect's synchronous body — does
   * not fire. A disable comment that suppresses nothing is a comment that looks like a known hazard. */
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const p = await fetchPayload(token)
        if (!alive) return
        const own: LibraryFont[] = p.own.map(o => ({
          id: o.id, family: o.family, displayName: o.displayName, group: 'clean',
          licence: 'Your own', hasBold: o.hasBold, hasItalic: o.hasItalic, own: true,
        }))
        const lib: LibraryFont[] = p.families.map(([id, family, group, licence, b, i]) => ({
          id, family, group, licence, hasBold: b === 1, hasItalic: i === 1, own: false,
        }))
        /* 🔴 THE TRUCK'S OWN FONTS COME FIRST IN `all`, so a search for their own name finds it before
         * 1,819 of Google's. They also have their own tab; this is about the search. */
        const all = [...own, ...lib]
        const byId = new Map(all.map(f => [f.id, f]))
        setState({
          loading: false, error: null, all, byId, count: p.count, own,
          popular: p.popular.map(id => byId.get(id)).filter((f): f is LibraryFont => !!f),
          recent: p.recent.map(id => byId.get(id)).filter((f): f is LibraryFont => !!f),
        })
      } catch (e) {
        if (!alive) return
        setState({ ...empty, loading: false, error: e instanceof Error ? e.message : 'Could not load fonts' })
      }
    })()
    return () => { alive = false }
  }, [token, nonce])

  const reload = useCallback(() => { invalidateFontLibrary(token); setNonce(n => n + 1) }, [token])
  return { ...state, reload }
}

/**
 * What the toolbar needs to know about the chosen family.
 *
 * 🔴 IT ANSWERS "SHOW THE BOLD BUTTON?" AND "SHOW THE ITALIC BUTTON?" FROM THE SAME DATA THE PICKER
 * LISTS, which is the point of hoisting the fetch. ⛔ AND IT ERRS TOWARDS SHOWING THEM WHILE THE
 * LIBRARY IS STILL LOADING: a control that appears a moment after the font is chosen reads as the
 * screen catching up, where one that vanishes reads as the setting being taken away.
 *
 * ⚠️ `italic` IS STILL OFFERED FOR A FAMILY WITH NO ITALIC FILE **only** when nothing is known yet.
 * Once the library has loaded, a family without one does not get the button — because the renderer
 * would draw the 12° shear, and part 1 shipped that as a fallback rather than a feature.
 */
export function faceSupport(lib: FontLibrary, fontId: string): { bold: boolean; italic: boolean } {
  if (lib.loading) return { bold: true, italic: true }
  const f = lib.byId.get(fontId)
  if (!f) {
    /* ⚠️ AN UNKNOWN ID IS A FONT THAT HAS GONE — a deleted upload a design still names. The renderer
     * falls back to Oswald, which has a bold and no italic, so that is what is offered. */
    const fallback = lib.byId.get(FALLBACK_FONT_ID)
    return { bold: fallback?.hasBold ?? true, italic: false }
  }
  return { bold: f.hasBold, italic: f.hasItalic }
}
