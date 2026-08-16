// ── ANDROID HARDWARE BACK ────────────────────────────────────────────────────────────────────────
// 🔴 WHAT WAS WRONG, AND IT IS NOT WHAT IT LOOKS LIKE. Capacitor's own AppPlugin registers an ENABLED
// OnBackPressedCallback and CONSUMES the press, so back never closed the app — that part was fine. What
// it does instead, with no JS listener, is:
//     if (!hasListeners(EVENT_BACK_BUTTON)) { if (webView.canGoBack()) webView.goBack() }
// This is a remote-URL Next.js SPA where router.push pushes history entries, so canGoBack() is true on
// essentially every operator screen — and MODALS ARE REACT STATE, NOT HISTORY. So a back press over an
// open modal did not dismiss it: it navigated the PAGE UNDERNEATH away and took the modal's state with
// it. On the KDS one stray edge-swipe lost the board mid-service.
//
// ── 🔴 THE DESIGN DECISION THAT MAKES THIS SAFE TO ADOPT INCREMENTALLY ──────────────────────────────
// THE FALLBACK IS "DO NOTHING". NOT router.back(), NOT exitApp(), NOT goBack(). Nothing.
// Registering ANY listener replaces Capacitor's goBack() branch entirely (see the source above — the
// else-branch fires instead), so the moment this module is live, an UNHANDLED press stops destroying
// the page and becomes inert.
// ⚠️ THAT INVERTS THE USUAL COVERAGE RISK. A modal this registry does not know about is not made worse
// by a partial rollout — back over it goes from "throws the screen away" to "does nothing". Inert is a
// poor experience; destructive is a defect. So surfaces can be wired one at a time without a window in
// which some screen is worse than it was.
//
// ── WHY A REGISTRY AND NOT A LISTENER PER SURFACE ───────────────────────────────────────────────────
// `App.addListener('backButton')` is global. Several listeners would ALL fire on one press, and two
// surfaces mounted at once would each close something. One listener, one LIFO stack, first handler
// wins — so precedence is expressed by registration order and by each surface's own ordered list.
//
// ⚠️ ANDROID ONLY, AND NOTHING HERE CHANGES iOS. `backButton` has no iOS emitter: the event is fired
// from AppPlugin.java's OnBackPressedCallback and there is no counterpart in AppPlugin.swift. The
// plugin's own docs describe it as the Android hardware/gesture back. Registering on iOS is therefore
// inert rather than guarded — no `getPlatform()` test is needed and none is written, which keeps this
// module free of a platform branch that could drift.
import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'

/** Returns true if this resolver handled the press. The first to return true wins; nothing else runs. */
type BackResolver = () => boolean

// LIFO. The last surface to mount is asked first, which is what a stack of screens should do.
const resolvers: BackResolver[] = []
let listenerAttached = false
let detach: (() => void) | undefined

/**
 * Attach the ONE listener, lazily, on the first registration.
 *
 * ⚠️ SET AFTER A SUCCESSFUL ATTACH, DELIBERATELY, NOT BEFORE — the same reasoning as lib/native/push.ts:
 * if attaching throws, the flag stays false and the next registration retries. Set-first would
 * permanently leave the app with no handler after one transient failure, which is the bug this fixes.
 */
function ensureListener(): void {
  if (listenerAttached) return
  if (!Capacitor.isNativePlatform()) return
  import('@capacitor/app')
    .then(({ App }) => {
      // 🔴 `canGoBack` IS DELIBERATELY IGNORED. It arrives on the event and it is exactly the wrong
      // signal here: it is true on nearly every operator screen precisely BECAUSE router.push pushed a
      // history entry, and acting on it is what threw the page away. Whether there is history to burn
      // has no bearing on whether a modal is open.
      const handlePromise = App.addListener('backButton', () => {
        for (let i = resolvers.length - 1; i >= 0; i--) {
          try {
            if (resolvers[i]()) return
          } catch (err) {
            // A throwing resolver must not take the whole handler down and must not fall through to
            // some other surface's dismissal. Skip it and keep looking.
            console.error('[back] resolver threw, skipping:', err)
          }
        }
        // 🔴 NOTHING HANDLED IT. DO NOTHING. No navigation, no exit. See the header.
      })
      Promise.resolve(handlePromise).then((handle: { remove: () => void }) => {
        detach = () => { try { handle.remove() } catch {} }
      })
      listenerAttached = true
    })
    .catch(() => {})
}

/**
 * Register this surface's dismissables with the hardware back button.
 *
 * @param entries ORDERED, INNERMOST FIRST. Each is [isOpen, close]. The first open one is closed and
 *                the press is consumed. ⚠️ THE ORDER IS THE NESTING: a sheet opened from a modal must
 *                come BEFORE that modal in the array, or back closes the outer one and strands the
 *                inner. Match the z-index order and it is right.
 *
 * ⚠️ THE ENTRIES ARE READ THROUGH A REF, NOT CAPTURED. The resolver is registered once per mount, but
 * it reads the LATEST entries every time it runs — so a modal that opened after mount is still seen.
 * Capturing the array in the closure would freeze it at first render and the handler would believe
 * every modal was shut.
 */
export function useAndroidBack(entries: Array<[boolean, () => void]>): void {
  const latest = useRef(entries)
  latest.current = entries

  useEffect(() => {
    const resolver: BackResolver = () => {
      for (const [isOpen, close] of latest.current) {
        if (isOpen) { close(); return true }
      }
      return false
    }
    resolvers.push(resolver)
    ensureListener()
    return () => {
      const i = resolvers.indexOf(resolver)
      if (i !== -1) resolvers.splice(i, 1)
      // ⚠️ The listener is NOT removed when the stack empties. Attaching is asynchronous (a dynamic
      // import), so a detach-on-empty would race a remount and could leave the app with Capacitor's
      // destructive goBack() branch restored. One idle listener over an empty stack does nothing.
      void detach
    }
  }, [])
}
