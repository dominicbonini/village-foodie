// ── PER-DEVICE SOUND CONFIG (V9.5) ──────────────────────────────────────────────────────────────────
// WHICH sounds fire is now a DEVICE preference, not a truck one. The kitchen iPad and the owner's pocket
// phone want different sounds, and a truck-wide policy forces them to agree. Same reasoning that moved
// keep-screen-on in V9.0: these settings are PHYSICAL — they belong to the screen in front of you.
// Recorded decision: reference-manual.md V9.0 backlog. localStorage, not a table — the sound is played
// CLIENT-side, so nothing server-side ever needs to know it.
//
// ── 🔴 SEED-ON-FIRST-LOAD — THIS IS WHAT PRESERVES A CONFIGURED TRUCK ───────────────────────────────
// Pizzeria Gusto has deliberately configured {"order_due":true,"new_orders":"all"} — BOTH keys away from
// the default. A device that finds no local config MUST seed from trucks.sound_config and persist that.
// It must NOT fall back to DEFAULT_SOUND_CONFIG while the truck column still holds a value: that would
// silently reset a real operator's settings on the first load after deploy.
// After seeding, localStorage is authoritative for that device and changing it NEVER writes back to
// trucks. The truck column becomes a one-way seed.
//
// ── ⚠️ THE WRITE IS NOT SWALLOWED, DELIBERATELY ─────────────────────────────────────────────────────
// keep-screen-on wrapped exactly this write in `try{…}catch{}`. That is why "I turned it off and it came
// back" was possible: a failed write means the pref never persists, the next load finds nothing, and it
// re-seeds forever with no signal anywhere. writeSoundConfig returns a boolean AND logs loudly, and the
// seed path logs a distinct message naming the consequence. A silent failure here is the bug.
//
// ── RETIREMENT PLAN (do NOT do this yet) ────────────────────────────────────────────────────────────
// trucks.sound_config, set_sound_config, and the update_settings allowlist entry all STAY for now,
// because this file reads the column as its seed source. They can only be retired once EVERY device has
// loaded at least once since this deploy — a device that has not loaded yet would seed from nothing and
// silently get DEFAULT_SOUND_CONFIG instead of the truck's real settings. Retirement is a later release
// with that precondition, not a cleanup to fold into this one.
import { DEFAULT_SOUND_CONFIG, type SoundConfig, type NewOrdersSound } from '@/components/dashboard/types'

/** Per-TOKEN so two trucks on one iPad don't collide — the same shape as `hg_keepawake_${token}`.
 *  ONE key per device, shared by the dashboard and the KDS: "which sounds fire" is one concept in one
 *  place (V9.0). The separate MASTER mute keys (hg_sound_ / hg_kds_sound_) are unchanged and stay
 *  per-surface, because muting is physical to the screen you are standing at. */
export const soundConfigKey = (token: string) => `hg_soundcfg_${token}`

function isNewOrders(v: unknown): v is NewOrdersSound {
  return v === 'needs_confirming' || v === 'all' || v === 'off'
}

/** Narrow an unknown blob to a SoundConfig, or null. Guards against a hand-edited/legacy localStorage
 *  value silently disabling sound — an unparseable entry is treated as absent, so it re-seeds. */
function coerce(v: unknown): SoundConfig | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!isNewOrders(o.new_orders)) return null
  return { new_orders: o.new_orders, order_due: o.order_due === true }
}

/** This device's stored config, or null if it has never seeded (or the stored value is unusable). */
export function readSoundConfig(token: string): SoundConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(soundConfigKey(token))
    if (raw === null) return null
    return coerce(JSON.parse(raw))
  } catch (e) {
    console.error(`[sound-prefs] could not READ ${soundConfigKey(token)} — this device will re-seed:`, e)
    return null
  }
}

/**
 * Persist this device's config. Returns TRUE on success.
 * ⚠️ NOT silent on failure — see the header. A caller that ignores the return value is fine (the value
 * is still live in React state for this session) but the log is the only signal that it will not survive
 * a reload.
 */
export function writeSoundConfig(token: string, cfg: SoundConfig): boolean {
  if (typeof window === 'undefined') return false
  try {
    localStorage.setItem(soundConfigKey(token), JSON.stringify(cfg))
    return true
  } catch (e) {
    console.error(
      `[sound-prefs] FAILED to write ${soundConfigKey(token)} — this device's sound settings will NOT ` +
      `survive a reload and will re-seed from trucks.sound_config on the next load:`, e,
    )
    return false
  }
}

/**
 * Seed this device from the truck's column, ONCE, and persist it.
 *
 * 🔴 Call this only when readSoundConfig() returned null AND the truck's value has actually arrived.
 * `truckCfg` undefined means the dashboard payload has not loaded yet — seeding from
 * DEFAULT_SOUND_CONFIG in that window is exactly the reset this function exists to prevent, so the
 * caller must wait rather than pass a default.
 */
export function seedSoundConfig(token: string, truckCfg: SoundConfig | null | undefined): SoundConfig {
  const seeded = coerce(truckCfg) ?? DEFAULT_SOUND_CONFIG
  const ok = writeSoundConfig(token, seeded)
  if (!ok) {
    console.error(`[sound-prefs] seed for ${token} did not persist — it will re-seed on every load until the write succeeds.`)
  }
  return seeded
}

/**
 * The value a consumer should use, given what this device has stored and what the truck column says.
 * ONE resolution point, so the dashboard, the KDS and the Settings panel cannot disagree.
 *   stored  → authoritative (this device has seeded and possibly diverged)
 *   no store, truck value present → the truck value (the pre-seed window; seeding happens separately)
 *   neither → DEFAULT_SOUND_CONFIG (a brand-new truck whose column is somehow absent)
 */
export function effectiveSoundConfig(
  stored: SoundConfig | null,
  truckCfg: SoundConfig | null | undefined,
): SoundConfig {
  return stored ?? coerce(truckCfg) ?? DEFAULT_SOUND_CONFIG
}
