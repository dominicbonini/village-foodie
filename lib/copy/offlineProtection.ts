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
  'If the screen goes off, the device loses internet, or you switch to another website, offline protection takes over — either pausing ordering or turning auto-accept off, whichever you chose.'
// Combined paragraph (LEAD + BODY) for any surface that wants the explainer as a single string.
export const OFFLINE_PROTECTION_EXPLAINER =
  `${OFFLINE_PROTECTION_EXPLAINER_LEAD} ${OFFLINE_PROTECTION_EXPLAINER_BODY}`

// Short persistent reminder shown in Settings → Van whenever the feature is ON.
export const OFFLINE_PROTECTION_REMINDER =
  '⚠️ Keep your dashboard or kitchen screen on and online during service, or offline protection may take over.'

// Dashboard enable confirm (window.confirm body). Keeps the "Make sure Screen On is enabled"
// nudge — even though enabling auto-applies keep-screen-on, the line makes the operator think
// about it. Fixes the prior "will pause automatically" → "may pause automatically".
export const OFFLINE_PROTECTION_ENABLE_CONFIRM =
  'Offline protection enabled.\n\nTo keep orders flowing, your screen must stay on. If this device loses connection, offline protection takes over in the mode you chose.\n\nMake sure Screen On is enabled on this device.'

// Dashboard disable confirm (window.confirm body). Already accurate — centralised verbatim.
export const OFFLINE_PROTECTION_DISABLE_CONFIRM =
  'Disable offline protection for this event?\n\nIf this device loses connection, online orders will continue — customers may place orders you cannot see. Only disable if you have a reliable connection.'

// Dashboard on-screen card — brief "what it does" description (line 1). The dashboard card is
// INTENTIONALLY tighter than the Settings card: a one-line description here, then the REMINDER as the
// single orange ⚠️ instruction (line 2). It does NOT use the fuller EXPLAINER lead+body (that stays
// Settings-only). The Settings card and this card differ on purpose.
// ⚠️ THE SAME SENTENCE AS OFFLINE_PROTECTION_SWITCH_HELP BELOW, written out rather than referenced
// because that constant is declared after this one and a `const` cannot be read before its declaration.
// If either changes, change both.
export const OFFLINE_PROTECTION_CARD_DESCRIPTION =
  'What happens when this van loses its connection.'

// THE SWITCH AND ITS TWO MODES -- VERBATIM, AND THIS BLOCK IS THE ONLY PLACE THEY LIVE.
// "Offline protection" now names the SWITCH. Pausing is one MODE of it, not the feature — which is why
// the four constants above stopped saying "paused" and started saying "takes over".
export const OFFLINE_PROTECTION_SWITCH_LABEL = 'Offline Order Protection'
export const OFFLINE_PROTECTION_SWITCH_HELP =
  'What happens when this van loses its connection.'

export const OFFLINE_MODE_PAUSE_LABEL = 'Pause Online Ordering'
export const OFFLINE_MODE_PAUSE_HELP =
  "Customers can't order until you're back online."

// "AUTO-ACCEPT" IS DELIBERATE HERE. It is the term the rest of the product uses for the same
// setting (Settings → Auto-accept), and consistency with it beats plainer wording. DO NOT REWORD IT.
export const OFFLINE_MODE_NO_AUTO_ACCEPT_LABEL = 'Keep taking orders, confirm them yourself'
export const OFFLINE_MODE_NO_AUTO_ACCEPT_HELP =
  "Auto-accept is turned off, so customers can still order but nothing is confirmed automatically. You'll confirm each one when you're back online."

/** The two modes, in the order they render. One array so manage and the dashboard cannot drift. */
export const OFFLINE_PROTECTION_MODES = [
  { value: 'pause' as const, label: OFFLINE_MODE_PAUSE_LABEL, help: OFFLINE_MODE_PAUSE_HELP },
  { value: 'no_auto_accept' as const, label: OFFLINE_MODE_NO_AUTO_ACCEPT_LABEL, help: OFFLINE_MODE_NO_AUTO_ACCEPT_HELP },
]
export type OfflineProtectionMode = (typeof OFFLINE_PROTECTION_MODES)[number]['value']
