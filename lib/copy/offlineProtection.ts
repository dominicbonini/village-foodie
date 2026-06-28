// Canonical user-facing copy for the "Offline order protection" feature.
//
// Single source of truth so every surface (Settings → Van card, the dashboard enable/disable
// popups, the dashboard on-screen card, the KDS warning) stays consistent. A future wording
// change is one edit here.
//
// Accuracy rules baked in (see §58/§59 audits):
//   - Say "may be paused" / "may pause", never "will pause" / "pause automatically" as an absolute
//     guarantee — a backgrounded-but-open tab does not reliably pause (no visibilitychange handler).
//   - No timings or mechanism (no heartbeat / 15s / 30s) — describe the screen-presence model only.
// These are presentational strings; they must not encode behaviour. Do not add timings here.

// Long body shown in Settings → Van (the dismissable explainer). Split so the imperative lead can
// render bold (safety-critical instruction) while staying DRY. LEAD is the bolded instruction; BODY
// is the plain consequence.
export const OFFLINE_PROTECTION_EXPLAINER_LEAD =
  'You must keep your dashboard or kitchen screen on and online during service.'
export const OFFLINE_PROTECTION_EXPLAINER_BODY =
  'If the screen goes off, the device loses internet, or you switch to another website, customer ordering may be paused.'
// Combined paragraph (LEAD + BODY) for any surface that wants the explainer as a single string.
export const OFFLINE_PROTECTION_EXPLAINER =
  `${OFFLINE_PROTECTION_EXPLAINER_LEAD} ${OFFLINE_PROTECTION_EXPLAINER_BODY}`

// Short persistent reminder shown in Settings → Van whenever the feature is ON.
export const OFFLINE_PROTECTION_REMINDER =
  '⚠️ Keep your dashboard or kitchen screen on and online during service, or customer ordering may be paused.'

// Dashboard enable confirm (window.confirm body). Keeps the "Make sure Screen On is enabled"
// nudge — even though enabling auto-applies keep-screen-on, the line makes the operator think
// about it. Fixes the prior "will pause automatically" → "may pause automatically".
export const OFFLINE_PROTECTION_ENABLE_CONFIRM =
  'Offline protection enabled.\n\nTo keep orders flowing, your screen must stay on. If this device loses connection, online orders may pause automatically.\n\nMake sure Screen On is enabled.'

// Dashboard disable confirm (window.confirm body). Already accurate — centralised verbatim.
export const OFFLINE_PROTECTION_DISABLE_CONFIRM =
  'Disable offline protection for this event?\n\nIf this device loses connection, online orders will continue — customers may place orders you cannot see. Only disable if you have a reliable connection.'

// Dashboard on-screen card — brief "what it does" description (line 1). The dashboard card is
// INTENTIONALLY tighter than the Settings card: a one-line description here, then the REMINDER as the
// single orange ⚠️ instruction (line 2). It does NOT use the fuller EXPLAINER lead+body (that stays
// Settings-only). The Settings card and this card differ on purpose.
export const OFFLINE_PROTECTION_CARD_DESCRIPTION =
  'Pauses online orders if this device goes offline'
