// lib/outreach-queue.ts — the list a prospect page was opened FROM, and the way back to it.
//
// 🔴 A FULL PAGE LOSES WHAT A MODAL KEPT FOR FREE. The modal sat on top of the list, so ‹ › could walk
// `visible` and closing it put the operator back exactly where they were. A route change throws all of
// that away — the filters, the sort, the tab, the scroll position and the very notion of "the next
// one". This module is what carries it across, and it is deliberately the ONLY thing that does.
//
// 🔴 sessionStorage, NOT A QUERY STRING. A list of 231 ids does not belong in a URL, and the queue is
// per-tab working state rather than an address: a link someone pastes to a colleague should open that
// prospect, not claim a queue that colleague never built.
// ⚠️ THE STORE IS INJECTED so the harness can run this with a plain object — and so a browser with
// storage disabled degrades to "no queue" instead of throwing on every navigation.

/** The two methods this module uses. `sessionStorage` satisfies it; so does a Map-backed fake. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const QUEUE_KEY = 'hg.outreach.queue.v1'
export const RETURN_KEY = 'hg.outreach.return.v1'
/** ⚠️ localStorage, not session: which timeline chip is selected is a preference, not working state. */
export const TIMELINE_PREF_KEY = 'hg.outreach.timelineFilter.v1'
/** Which of the Templates tab's two views was open last. ⚠️ Per browser, like the filter above. */
export const TEMPLATES_VIEW_KEY = 'hg.outreach.templatesView.v1'

export interface QueueState {
  /** What the queue IS, in the words the end-of-queue message uses: "Replies waiting", "the list". */
  label: string
  /** Prospect ids, in the order they were on screen. */
  ids: string[]
  /** Where Back goes. Always an in-app path. */
  returnTo: string
}

export interface ReturnState {
  /** 'today' | 'all' — the tab the list was on. */
  tab: string
  /** Where the page was scrolled to. Restored on the way back. */
  scrollY: number
}

const readJson = <T,>(store: StorageLike | null | undefined, key: string): T | null => {
  if (!store) return null
  try {
    const raw = store.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}
const writeJson = (store: StorageLike | null | undefined, key: string, value: unknown): void => {
  if (!store) return
  try { store.setItem(key, JSON.stringify(value)) } catch { /* storage disabled: no queue, no crash */ }
}

export function saveQueue(store: StorageLike | null | undefined, q: QueueState): void {
  writeJson(store, QUEUE_KEY, q)
}

/**
 * The queue, if there is one.
 * ⚠️ IT IS VALIDATED, NOT TRUSTED. sessionStorage is a string somebody could have edited; a malformed
 * value must read as "no queue" rather than crash the page it was supposed to help.
 */
export function readQueue(store: StorageLike | null | undefined): QueueState | null {
  const q = readJson<Partial<QueueState>>(store, QUEUE_KEY)
  if (!q || !Array.isArray(q.ids) || typeof q.returnTo !== 'string') return null
  const ids = q.ids.filter((v): v is string => typeof v === 'string')
  if (!ids.length) return null
  // ⚠️ THE FALLBACK IS THE LIST'S REAL NAME. A stored queue with no label can only have come from
  // the prospect table, which is what "All prospects" is called on screen.
  return { label: typeof q.label === 'string' && q.label ? q.label : 'All prospects', ids, returnTo: q.returnTo }
}

export function saveReturn(store: StorageLike | null | undefined, r: ReturnState): void {
  writeJson(store, RETURN_KEY, r)
}

export function readReturn(store: StorageLike | null | undefined): ReturnState | null {
  const r = readJson<Partial<ReturnState>>(store, RETURN_KEY)
  if (!r || typeof r.tab !== 'string') return null
  return { tab: r.tab, scrollY: typeof r.scrollY === 'number' ? r.scrollY : 0 }
}

/**
 * "3 of 12" — one-based, and null when this prospect is not in the queue at all.
 * ⚠️ NOT IN THE QUEUE IS A REAL STATE, not an error: a prospect opened by URL, or one whose row has
 * since been filtered out. The header shows no counter rather than a wrong one.
 */
export function queuePosition(ids: readonly string[], id: string): { index: number; total: number } | null {
  const i = ids.indexOf(id)
  if (i < 0) return null
  return { index: i + 1, total: ids.length }
}

/** The ids either side, for ‹ › and J/K. Null at each end — the queue does not wrap. */
export function neighbours(ids: readonly string[], id: string): { prev: string | null; next: string | null } {
  const i = ids.indexOf(id)
  if (i < 0) return { prev: null, next: null }
  return { prev: i > 0 ? ids[i - 1] : null, next: i < ids.length - 1 ? ids[i + 1] : null }
}

/** Where a prospect page lives. One definition, so no caller composes this path by hand. */
export const prospectPath = (id: string): string => `/admin/outreach/p/${encodeURIComponent(id)}`
