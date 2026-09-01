// ── THE ONE PLACE THAT WATCHES AUTH STATE. ───────────────────────────────────────────────────────────
// Before this module, `grep -rn "onAuthStateChange|TOKEN_REFRESHED|SIGNED_OUT"` over app/, lib/ and
// components/ returned ZERO HITS: the app never observed its own session. A refresh that failed for a
// non-retryable reason called `_removeSession()` inside auth-js (GoTrueClient.js:3975-3977), fired
// SIGNED_OUT into nothing, and the next request bounced to /login — mid-service, on a kitchen tablet.
//
// 🔴 THE RULE THIS ENCODES: an operator is signed out ONLY by choosing to be. An involuntary SIGNED_OUT
// never navigates. The screen keeps rendering exactly what it already has; a non-blocking banner offers
// "Sign in again" and the operator decides when. A board full of live orders is worth more than a
// correct-looking auth state.
//
// ⚠️ IT USES THE TWO CLIENTS THAT ALREADY EXIST — the cookie client on web, the Preferences-backed one
// natively. No third client is constructed here; a fourth auth store is the last thing this codebase
// needs (see lib/supabase-browser.ts, which is already one too many).
'use client'

import { isNativeApp } from '@/lib/native/device'
import { getNativeSupabase } from '@/lib/native/session'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/** What the banner needs to know. `null` = nothing to say. */
export type SessionAlert = null | {
  /** Why we are showing it. Internal — never rendered. */
  reason: 'signed_out_involuntary'
  /** Set once a recovery attempt has finished, so the UI can stop saying "checking". */
  recovered: false
}

type Listener = (alert: SessionAlert) => void

// ── 🔴 THE USER-INITIATED FLAG. SET EXPLICITLY, NEVER INFERRED. ──────────────────────────────────────
// auth-js fires the SAME `SIGNED_OUT` event for "the operator pressed Sign out" and "your refresh token
// was rejected". Nothing in the event distinguishes them, and there is no property that could — so it
// cannot be inferred, only declared. `beginUserSignOut()` is called by lib/native/signOut.ts, the single
// sign-out control every operator surface routes through (UserMenu, manage, admin), immediately BEFORE
// it calls auth.signOut(). Any SIGNED_OUT arriving without that flag is involuntary by definition.
//
// ⚠️ A MODULE FLAG, NOT sessionStorage. The event fires inside the same JS context, during the `await`
// in operatorSignOut, before either the hard `window.location` (web) or the `router.replace` (native).
// A storage round-trip would add a failure mode — a private-mode throw — to a path whose whole job is
// to be certain. The flag is deliberately NOT cleared on a timer: if a sign-out somehow never completes,
// the safe residue is "we think the user meant to", i.e. no banner, which is the quiet failure.
let userInitiatedSignOut = false

/** Called by the sign-out control BEFORE auth.signOut(). See the note above. */
export function beginUserSignOut(): void {
  userInitiatedSignOut = true
}

/** Test seam only — resets the flag so a suite can exercise both branches. */
export function __resetUserSignOutFlagForTests(): void {
  userInitiatedSignOut = false
}

// ── RECOVERY SCHEDULE ────────────────────────────────────────────────────────────────────────────────
// 🔴 WHY THESE NUMBERS. auth-js already retried the network case internally with 200/400/800ms backoff
// bounded at AUTO_REFRESH_TICK_DURATION_MS = 30s (GoTrueClient.js:3865-3881), so anything under ~30s
// duplicates work the library has already done and failed at. These delays cover the failure the library
// does NOT retry: a tablet whose wifi dropped and is coming back. A venue AP reconnect is typically
// seconds; a 4G handover can be tens of seconds. 2s catches an instant blip, 10s a reconnect, 45s a
// genuine outage that resolves. Total ~57s, then we stop and let the operator decide — a client that
// retries forever against a revoked token is a client hammering the auth server on every tablet at once.
const RECOVERY_DELAYS_MS = [2_000, 10_000, 45_000] as const

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/**
 * ⚠️ WHAT A RECOVERY ATTEMPT CAN AND CANNOT DO, STATED HONESTLY.
 * By the time SIGNED_OUT reaches us, auth-js has ALREADY run `_removeSession()` and cleared this
 * client's storage slot. So this cannot resurrect a session from a refresh token we no longer hold.
 * What it CAN recover is the case where the slot was repopulated by someone else between the failure and
 * now — the proxy writing a rotated cookie pair (proxy.ts:203-206 `carrySessionCookies`), or another tab
 * refreshing successfully. That is a real and common shape in a multi-tab operator setup, and it is the
 * only shape a client-side recovery can honestly claim.
 * Returns true if a session is present again.
 */
async function attemptRecovery(client: ReturnType<typeof createSupabaseBrowserClient>): Promise<boolean> {
  for (const delay of RECOVERY_DELAYS_MS) {
    await sleep(delay)
    try {
      const { data } = await client.auth.getSession()
      if (data.session) return true
    } catch {
      // A throw here is a storage or transport fault, not an answer. Keep trying the remaining delays.
    }
  }
  return false
}

// ── SUBSCRIPTION ─────────────────────────────────────────────────────────────────────────────────────
let started = false
const listeners = new Set<Listener>()
let current: SessionAlert = null

function publish(next: SessionAlert): void {
  current = next
  listeners.forEach(fn => { try { fn(next) } catch { /* a listener threw — never let it stop the others */ } })
}

/** Current alert state, for a component mounting after the event fired. */
export function getSessionAlert(): SessionAlert { return current }

/** Subscribe. Fires immediately with the current value; returns an unsubscribe. */
export function subscribeSessionAlert(fn: Listener): () => void {
  listeners.add(fn)
  fn(current)
  return () => { listeners.delete(fn) }
}

/**
 * Start observing. Idempotent — safe to call from a component that remounts, and it deliberately does
 * NOT tear the subscription down: the whole point is to survive whatever the UI does.
 */
export function startSessionObserver(): void {
  if (started || typeof window === 'undefined') return
  started = true

  // ⚠️ THE RIGHT CLIENT FOR THE RUNTIME. Native auth lives in @capacitor/preferences under
  // `hg-native-auth`; web auth lives in cookies. Subscribing to the wrong one would observe a store the
  // operator's session is not in and report a signed-out state that is not real.
  const client = isNativeApp()
    ? (getNativeSupabase() as unknown as ReturnType<typeof createSupabaseBrowserClient>)
    : createSupabaseBrowserClient()

  client.auth.onAuthStateChange((event) => {
    switch (event) {
      case 'TOKEN_REFRESHED':
        // 🔴 THE HAPPY PATH IS ALSO A CLEARING PATH. A refresh that lands after a failure means whatever
        // was wrong has resolved — the banner must go, or it lies about the current state.
        publish(null)
        return

      case 'SIGNED_IN':
        // Covers the operator taking the banner's action, and a fresh login in another tab.
        publish(null)
        return

      case 'SIGNED_OUT': {
        // 🔴 THE WHOLE POINT. A sign-out the operator asked for is not our business — signOut.ts is
        // already navigating and a banner would flash on the way out.
        if (userInitiatedSignOut) return
        // Involuntary. Try to recover BEFORE saying anything: a banner that appears and disappears two
        // seconds later is worse than one that never appeared.
        void (async () => {
          const ok = await attemptRecovery(client)
          // ⚠️ Re-check the flag: the operator may have pressed Sign out DURING the recovery window,
          // in which case the honest state is "they chose to", not "something failed".
          if (ok || userInitiatedSignOut) { publish(null); return }
          publish({ reason: 'signed_out_involuntary', recovered: false })
        })()
        return
      }

      default:
        // INITIAL_SESSION, USER_UPDATED, PASSWORD_RECOVERY — nothing to do. Explicitly ignored rather
        // than swept into a default that would also swallow a future event worth handling.
        return
    }
  })
}
