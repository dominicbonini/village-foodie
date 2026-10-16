// lib/whatsapp/setup-machine.ts
// 🔴 THE SET UP BUTTON'S STATE, AS A PURE REDUCER. No React, no SDK, no network — so every transition
// below can be driven in a harness, including the ones a browser makes almost impossible to stage.
//
// ── WHAT WENT WRONG, AND WHY THIS IS A REDUCER RATHER THAN MORE useState ────────────────────────────
// The control had ONE boolean (`setupBusy`) and exactly ONE way out of it: the promise returned by
// `launchEmbeddedSignup` settling. That promise resolves only from inside Meta's `FB.login` callback.
// When Safari blocked the pop-up — or when the operator re-opened it through Safari's own "allow"
// affordance, so the SDK never held the window handle — that callback never fired, nothing settled, and
// the button read "Opening…" for ever with no way back. A single boolean could not express "waiting, but
// the operator may leave" because there was no event that meant it.
//
// ── THE TWO RULES THAT ARE EASY TO GET WRONG, STATED BEFORE THE CODE ────────────────────────────────
// 🔴 1. A SUCCESS IS NEVER DISCARDED. Not even from an attempt the operator abandoned with "Start again".
//       An authorisation code is single-use and represents a real account link that Meta has ALREADY
//       made; dropping it because our own bookkeeping moved on would strand the operator with a
//       connection they cannot see and cannot redo. Only closed/cancel/error from a superseded attempt
//       are ignored.
// 🔴 2. THE 20-SECOND TICK ADDS A HINT. IT DOES NOT ABANDON THE ATTEMPT. A genuine Embedded Signup runs
//       for minutes — business verification, number entry, an SMS code. A timeout that gave up would
//       break the normal case to tidy up the broken one.

export type SetupPhase =
  | 'preparing'    // the SDK is loading; the button is disabled and reads "Preparing…"
  | 'unavailable'  // the SDK could not load; the button stays disabled and the reason is shown
  | 'idle'         // ready to press
  | 'waiting'      // Meta's window is open (or should be); no request has been made
  | 'submitting'   // a code came back and the server is being told

export type NoticeTone = 'ok' | 'warn' | 'error'
/** 🔴 OUR OWN NOTICES ARE CODES (Language Phase 1d Part 2): `manageWhatsApp.notice.<code>`, worded by the screen in the
 *  truck's language. `text` is ONLY for words we did not write here and pass on as they came — the signup route's
 *  answer (already in the truck's language) or an exception's message. */
export type SetupNoticeCode =
  | 'sdkUnavailable' | 'sdkBlocked' | 'setupFailed' | 'setupFinished' | 'metaError' | 'closed'
  | 'disconnected' | 'disconnectedUnreachable'
export interface SetupNotice { tone: NoticeTone; code?: SetupNoticeCode; text?: string }

export interface SetupState {
  phase: SetupPhase
  /** The id of the LIVE attempt, or null when none is. */
  attempt: number | null
  /** The highest id ever issued. Kept across abandonment so a stale event can be recognised as stale. */
  lastAttempt: number
  /** The additive "it may have been blocked" line. Never replaces the standing instruction. */
  showPopupHint: boolean
  notice: SetupNotice | null
}

export type SetupEvent =
  | { type: 'sdk_ready' }
  | { type: 'sdk_failed'; code?: SetupNoticeCode; message?: string }
  | { type: 'clicked' }
  | { type: 'start_again' }
  | { type: 'waited_20s'; attempt: number }
  | { type: 'window_closed'; attempt: number }
  | { type: 'window_error'; attempt: number; code?: SetupNoticeCode; message?: string }
  | { type: 'succeeded'; attempt: number }
  | { type: 'submit_finished'; notice: SetupNotice }

export const INITIAL_SETUP_STATE: SetupState = {
  phase: 'preparing', attempt: null, lastAttempt: 0, showPopupHint: false, notice: null,
}

/** The message shown when Meta's window closed with nothing done. UNCHANGED from before this rewrite. */
export const CLOSED_NOTICE: SetupNotice = { tone: 'warn', code: 'closed' }

/** A notice from an event: its code when it carries one, and any words passed on as they came. */
const noticeOf = (tone: NoticeTone, e: { code?: SetupNoticeCode; message?: string }): SetupNotice => ({
  tone,
  ...(e.code ? { code: e.code } : {}),
  ...(e.message !== undefined ? { text: e.message } : {}),
})

/** True when this event belongs to the attempt currently live. A stale attempt's closure is not news. */
const isLive = (s: SetupState, attempt: number): boolean => s.attempt !== null && s.attempt === attempt

export function setupReducer(state: SetupState, event: SetupEvent): SetupState {
  switch (event.type) {
    case 'sdk_ready':
      // ⚠️ Only from `preparing`. A late resolve must not yank a waiting operator back to idle.
      return state.phase === 'preparing' ? { ...state, phase: 'idle' } : state

    case 'sdk_failed':
      return state.phase === 'preparing'
        ? { ...state, phase: 'unavailable', notice: noticeOf('error', event) }
        : state

    case 'clicked': {
      // Pressing while a window is already open is re-entrancy, not a new attempt.
      if (state.phase !== 'idle') return state
      const attempt = state.lastAttempt + 1
      return { ...state, phase: 'waiting', attempt, lastAttempt: attempt, showPopupHint: false, notice: null }
    }

    case 'start_again':
      // 🔴 NO REQUEST, NOTHING ALARMING. The operator is telling us the window is not there; that is not
      // an error and must not read as one. The attempt id is retired (`attempt: null`) while
      // `lastAttempt` stays, so anything that arrives late for it is recognisably superseded.
      if (state.phase !== 'waiting') return state
      return { ...state, phase: 'idle', attempt: null, showPopupHint: false, notice: null }

    case 'waited_20s':
      // 🔴 ADDS THE HINT, STAYS WAITING. See rule 2 in the header.
      if (state.phase !== 'waiting' || !isLive(state, event.attempt)) return state
      return { ...state, showPopupHint: true }

    case 'window_closed':
      if (state.phase !== 'waiting' || !isLive(state, event.attempt)) return state
      return { ...state, phase: 'idle', attempt: null, showPopupHint: false, notice: CLOSED_NOTICE }

    case 'window_error':
      if (state.phase !== 'waiting' || !isLive(state, event.attempt)) return state
      return {
        ...state, phase: 'idle', attempt: null, showPopupHint: false,
        notice: noticeOf('error', event),
      }

    case 'succeeded':
      // 🔴 NO `isLive` TEST, AND THAT IS THE POINT. See rule 1 in the header. A code that arrives after
      // "Start again" is still a real account link; it is processed, and the phase says so.
      if (state.phase === 'submitting') return state
      return { ...state, phase: 'submitting', attempt: event.attempt, showPopupHint: false, notice: null }

    case 'submit_finished':
      return { ...state, phase: 'idle', attempt: null, showPopupHint: false, notice: event.notice }

    default:
      return state
  }
}

/** The button's label, derived — so the label cannot drift from the state that decides it. A key of
 *  `manageWhatsApp.setup.button` (Language Phase 1d Part 2); the screen supplies the words. */
export type SetupButtonLabelKey = 'preparing' | 'unavailable' | 'waiting' | 'finishing' | 'reconnect' | 'setUp'
export function setupButtonLabelKey(state: SetupState, offerReauthorise: boolean): SetupButtonLabelKey {
  switch (state.phase) {
    case 'preparing':  return 'preparing'
    case 'unavailable': return 'unavailable'
    case 'waiting':    return 'waiting'
    case 'submitting': return 'finishing'
    default:           return offerReauthorise ? 'reconnect' : 'setUp'
  }
}

/** Disabled whenever pressing it could do nothing useful or something twice. */
export const setupButtonDisabled = (state: SetupState): boolean => state.phase !== 'idle'
