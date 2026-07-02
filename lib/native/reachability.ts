'use client'
// ── Phase-1 REACHABILITY detection ────────────────────────────────────────────────────────────────────
// "Can we actually reach the server right now?" — NOT navigator.onLine (which is true on a connected-but-
// dead uplink). A lightweight periodic health-check (HEAD /api/ping) with DEBOUNCE thresholds so a momentary
// blip never flips the operator into offline mode (mirrors the 30s server heartbeat-staleness window; ties to
// the earlier false-pause concern). @capacitor/network events are used only as an INSTANT hint that then
// forces a check.
//
// Note: the true source of offline-for-a-WRITE is the reactive gate (a failed mutation enqueues immediately);
// this module drives the BANNER + the online↔offline TRANSITIONS (offline→online triggers replay).
import { addNetworkListener } from '@/lib/native/network'

const PING_URL = '/api/ping'
const INTERVAL_MS = 10_000
const TIMEOUT_MS = 3_000
const FAIL_THRESHOLD = 3   // consecutive failures (~30s) before declaring OFFLINE — debounces blips
const OK_THRESHOLD = 1     // one success flips back to ONLINE (fast recovery → prompt replay)

type Listener = (online: boolean) => void

let online = true
let consecutiveFails = 0
let consecutiveOks = 0
let timer: ReturnType<typeof setInterval> | null = null
let removeNet: (() => void) | null = null
let started = false
const listeners = new Set<Listener>()

async function ping(): Promise<boolean> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${PING_URL}?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store', signal: ctrl.signal })
    return res.ok
  } catch { return false } finally { clearTimeout(t) }
}

function emit() { for (const l of listeners) l(online) }

async function check() {
  const ok = await ping()
  if (ok) {
    consecutiveOks++; consecutiveFails = 0
    if (!online && consecutiveOks >= OK_THRESHOLD) { online = true; emit() }
  } else {
    consecutiveFails++; consecutiveOks = 0
    if (online && consecutiveFails >= FAIL_THRESHOLD) { online = false; emit() }
  }
}

/** Begin periodic reachability checks. Idempotent. Returns current known state synchronously via isOnline(). */
export function startReachability(): void {
  if (started || typeof window === 'undefined') return
  started = true
  void check()
  timer = setInterval(() => { void check() }, INTERVAL_MS)
  // Network up/down is an instant HINT → force an immediate check (up = maybe reachable → replay fast;
  // down = almost certainly offline → let the check confirm within one tick).
  removeNet = addNetworkListener(() => { void check() })
}

export function stopReachability(): void {
  if (timer) { clearInterval(timer); timer = null }
  if (removeNet) { removeNet(); removeNet = null }
  started = false
}

export function isOnline(): boolean { return online }

/** Subscribe to online↔offline transitions. Returns an unsubscribe fn. Fires immediately with current state. */
export function onReachabilityChange(fn: Listener): () => void {
  listeners.add(fn)
  fn(online)
  return () => { listeners.delete(fn) }
}
