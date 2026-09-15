// lib/outreach-globals.ts
// ── 🔴 GLOBAL PLACEHOLDER DEFAULTS — VALUES THE OPERATOR STATES ONCE ────────────────────────────────
//
// THE PROBLEM. `[[my rate]]` appears in 4 of the 5 seeded templates. `placeholder_defaults` already
// stores a default per placeholder, but it is stored PER TEMPLATE — so "set my rate" means typing the
// same figure into four rows, and changing it means editing four rows again. That is not "once".
//
// 🔴 WHY localStorage AND NOT A TABLE, STATED PLAINLY WITH ITS COST.
//   • A settings table is the "right" answer in general, and it is a SECOND migration on top of the
//     template-tagging one. This task authorises one.
//   • The obvious no-migration alternative — parking the value in some template's own
//     `placeholder_defaults` — is forbidden outright: no template row may be written without sign-off.
//   • An env var cannot be changed without a redeploy, which is the opposite of "set it once, change it
//     when your rate changes".
//   • This console has ONE operator on his own machine, and the admin UI already persists state this
//     way (`hg.outreach.filter.v1`).
// ⚠️ THE COST, NOT SOFTENED: it is PER BROWSER. Open the console on another machine or clear site data
// and the global is gone — the per-template defaults and the typed-per-truck path both still work, so
// nothing breaks, but the figure has to be re-entered. If that bites, a settings table is the upgrade
// and `defaultFillsOf` already takes the layer as an argument, so only the READ moves.
//
// 🔴 IT SHIPS EMPTY. Nothing here seeds a rate or any other value.

export const OUTREACH_GLOBALS_KEY = 'hg.outreach.globals.v1'

/** A plain `{ "[[name]] without brackets": "value" }` map. Anything unparseable is discarded. */
export type OutreachGlobals = Record<string, string>

/**
 * Read the stored globals. Never throws: a private window, cleared site data or a hand-edited blob all
 * yield `{}` rather than breaking the compose window.
 * ⚠️ VALIDATED, NOT TRUSTED — localStorage is user-editable and survives deploys, the same posture the
 * filter blob already takes. Only string→string entries survive.
 */
export function readOutreachGlobals(): OutreachGlobals {
  if (typeof window === 'undefined') return {}          // SSR: there is no storage to read
  try {
    const raw = window.localStorage.getItem(OUTREACH_GLOBALS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: OutreachGlobals = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v
    }
    return out
  } catch { return {} }
}

/** Write the globals, dropping blanks so clearing a field removes the entry rather than storing ''. */
export function writeOutreachGlobals(next: OutreachGlobals): void {
  if (typeof window === 'undefined') return
  const clean: OutreachGlobals = {}
  for (const [k, v] of Object.entries(next)) if (v && v.trim()) clean[k] = v
  try { window.localStorage.setItem(OUTREACH_GLOBALS_KEY, JSON.stringify(clean)) } catch { /* ignore */ }
}
