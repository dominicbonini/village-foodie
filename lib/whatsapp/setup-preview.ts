// lib/whatsapp/setup-preview.ts
// 🔴 THE PREVIEW GATE. One boolean, decided from `trucks.feature_overrides` alone.
//
// ── WHY THIS IS NOT A FEATURE AND DOES NOT GO THROUGH canAccess ─────────────────────────────────────
// `canAccess` consults PLAN_FEATURES, and `TRIAL_FEATURES = [...MAX_FEATURES]` (lib/features.ts). Both
// live trucks are plan 'trial'. So the moment a key is added to any plan list, EVERY trial truck —
// Pizzeria Gusto included — inherits it. A preview that switches itself on for the only trading truck
// is not a preview. This helper therefore reads the per-truck override map DIRECTLY and never asks
// `canAccess` anything.
//
// 🔴 AND THE KEY MUST NEVER BE ADDED TO A PLAN LIST. There is no entry for it in lib/features.ts, and
// adding one would defeat this file entirely. `feature_overrides` is admin-owned: app/api/manage's
// `update_truck` allowlist deliberately excludes it (see its comment — "gating state is never writable
// by a credential the gated party holds"), so a token holder cannot grant themselves this.
//
// ⚠️ STRICT `=== true`, NOT TRUTHINESS, AND THE DIFFERENCE IS THE POINT. `feature_overrides` is a jsonb
// column edited by hand in an admin console; the realistic mistake is the STRING "true", which is
// truthy and would silently switch a live truck's WhatsApp row into an interactive control. A string,
// 1, "yes", or the key merely being present all return false.

/** The override key. Declared once so a caller cannot misspell it into a silent false. */
export const WHATSAPP_SETUP_PREVIEW_KEY = 'whatsapp_setup_preview'

/**
 * True ONLY when `overrides` is a plain object carrying `whatsapp_setup_preview: true` as a real boolean.
 *
 * ⚠️ Accepts `unknown` on purpose: the value arrives as jsonb from Postgres and as JSON over the wire,
 * so a caller cannot promise its shape. Null, undefined, arrays and non-objects all return false rather
 * than throwing — a gate that can throw is a gate that can take a page down.
 */
export function hasWhatsAppSetupPreview(overrides: unknown): boolean {
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) return false
  return (overrides as Record<string, unknown>)[WHATSAPP_SETUP_PREVIEW_KEY] === true
}
