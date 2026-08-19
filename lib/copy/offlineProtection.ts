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

// ⚠️ NO LONGER RENDERED ANYWHERE, AND KEPT DELIBERATELY. It was the short amber line under the mode
// rows in Settings → Van. That card now carries the SAME full ⚠️ LEAD + BODY instruction the dashboard
// card does, above the modes rather than below them, so this shorter paraphrase would be a second,
// differently-worded warning about one thing. `grep -rn "OFFLINE_PROTECTION_REMINDER" app components`
// returns nothing; it is here so restoring that line is an import rather than a rewrite.
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
// 🔴 BOTH CARDS NOW SHOW THIS ONE CONSTANT — Settings → Van as well as the dashboard. It was reworded
// to say what the setting DECIDES: both cards present the two modes directly beneath it, so the line
// above them has to introduce a choice rather than name a topic.
// ⚠️ THE HAND-KEPT PAIRING WITH OFFLINE_PROTECTION_SWITCH_HELP IS OVER. That constant held the same
// sentence and had to be edited in step with this one; Settings → Van reads this one instead, so there
// is nothing left to keep in step. See its own note below.
export const OFFLINE_PROTECTION_CARD_DESCRIPTION =
  'Decides what happens to incoming orders when your device drops offline.'

// ── 🔴 WHAT THE FEATURE IS FOR, AND IT LEADS THE BOX. ─────────────────────────────────────────────
// The line above answers "what does this control DO"; this one answers "why would I turn it on". They
// were the same line doing both jobs, which left the box opening on a mechanism. This sits directly
// under the heading; CARD_DESCRIPTION moved DOWN to sit immediately above the two options, where it
// reads as their lead-in rather than as the box's summary.
// ⚠️ THE ORANGE WARNING SITS BETWEEN THEM AND DID NOT MOVE. Its position, wording and emphasis are
// exactly what they were.
export const OFFLINE_PROTECTION_PURPOSE =
  "If your device loses its connection, this stops orders arriving while you can't see them."

// THE SWITCH AND ITS TWO MODES -- VERBATIM, AND THIS BLOCK IS THE ONLY PLACE THEY LIVE.
// "Offline protection" now names the SWITCH. Pausing is one MODE of it, not the feature — which is why
// the four constants above stopped saying "paused" and started saying "takes over".
export const OFFLINE_PROTECTION_SWITCH_LABEL = 'Offline Order Protection'
// ⚠️ NO LONGER RENDERED ANYWHERE, AND KEPT DELIBERATELY, exactly as the REMINDER above is. Settings →
// Van was its only consumer and now uses OFFLINE_PROTECTION_CARD_DESCRIPTION, so the two surfaces read
// one sentence from one constant and cannot drift by hand any more.
// 🔴 IT IS THE OLD WORDING. Do not reintroduce it beside the new one — that is the drift this module
// exists to prevent. `grep -rn "OFFLINE_PROTECTION_SWITCH_HELP" app components` returns nothing.
export const OFFLINE_PROTECTION_SWITCH_HELP =
  'What happens when this van loses its connection.'

export const OFFLINE_MODE_PAUSE_LABEL = 'Pause Online Ordering'
export const OFFLINE_MODE_PAUSE_HELP =
  "Customers can't order until you're back online."

// "AUTO-ACCEPT" IS DELIBERATE HERE. It is the term the rest of the product uses for the same
// setting (Settings → Auto-accept), and consistency with it beats plainer wording. DO NOT REWORD IT.
export const OFFLINE_MODE_NO_AUTO_ACCEPT_LABEL = 'Keep taking orders, confirm them yourself'
// ⚠️ IT CARRIES THE AUTO-REJECT SENTENCE NOW. There were three lines explaining one idea — this, the
// picker's label, and a help line beneath the picker — and the third still offered "Off", which the
// picker no longer does. The third line is DELETED and its meaning merged here.
// 🔴 THE EM DASH IS U+2014 AND MUST STAY ONE. A hyphen or an en dash here is a silent substitution of
// exactly the kind the character census exists to catch.
export const OFFLINE_MODE_NO_AUTO_ACCEPT_HELP =
  "Auto-accept is turned off, so customers can still order but nothing is confirmed automatically. You'll confirm each one when you're back online \u2014 and anything still waiting is rejected automatically after your selected time, with the customer emailed to let them know."

// ── 🔴 THE AUTO-REJECT DELAY. ONLY MEANINGFUL IN no_auto_accept MODE. ─────────────────────────────
// In `pause` the customer gate is shut server-side, so no order can be waiting and there is nothing for
// a delay to act on. Both surfaces render this ONLY when no_auto_accept is the resolved mode.
// 🔴 NULL MEANS OFF AT THE DATABASE AND IN THE SWEEP, AND EVERY VAN STORES NULL. That has not changed
// and must not: nothing rejects automatically for a van nobody has touched. What changed is the UI —
// the picker no longer OFFERS off, so an operator setting this mode has to choose. There is no fallback
// number anywhere; `?? unset` is the whole rule, mirroring the MODE's own event-override ?? van-default
// ?? fallback chain.
// ⚠️ IT READS INTO THE DROPDOWN AS ONE SENTENCE: "Reject orders waiting longer than [15 mins]". The
// label used to be a heading with a separate paragraph under it; the paragraph is gone (see the option
// description above) and this now does the whole job.
export const OFFLINE_AUTO_REJECT_LABEL = 'Reject orders waiting longer than'
// 🔴 THERE IS NO "OFF" OPTION, AND ITS ABSENCE IS THE POINT. An operator who chooses "Keep taking
// orders, confirm them yourself" MUST choose a delay: without one an order placed while the van is
// offline can sit indefinitely and the customer never learns it was not accepted — which is the outcome
// this whole feature exists to prevent.
// ⚠️ THIS IS A UI RULE ONLY. NULL still means off in the database and in the sweep, and every van stores
// NULL today. Nothing is backfilled, no column default is added, and nothing is written on render — the
// requirement bites only when an operator touches the control. See the placeholder below.
// ⚠️ THERE IS NO UNCHOSEN STATE EITHER. The picker opens on the default below rather than on a
// placeholder: an operator turning this mode on gets a working delay, not a second decision to make.
// 🔴 THE DEFAULT IS WRITTEN WHEN THE MODE IS CHOSEN, NOT ON RENDER. Selecting "Keep taking orders,
// confirm them yourself" IS the operator interaction, and that is when a van with no stored delay gets
// one. A van nobody touches keeps NULL and nothing auto-rejects for it — no backfill, no column default.
export const OFFLINE_AUTO_REJECT_DEFAULT_MINS = 15

// ── THE LABELS ARE PLAIN MINUTES. THE RANGE FORM WAS TRIED AND DROPPED. ─────────────────────────
// They read "5-10 min", "10-15 min" for one pass, because the sweep runs every five minutes and a
// setting of N therefore rejects an order somewhere between N and N+5 minutes old. Dominic chose plain
// minutes instead, and that is the operator-facing decision: a menu of overlapping ranges is harder to
// choose from than a menu of numbers.
// 🔴 THE UNDERLYING FACT IS UNCHANGED AND IS RECORDED HERE RATHER THAN LOST: the stored value is a
// FLOOR, never a deadline. An order is never rejected sooner than the number shown, and may be rejected
// up to five minutes later, because the sweep is a scheduled pass and not a timer.
// ⚠️ SO NOTHING ELSE IN THIS FEATURE MAY PHRASE IT AS A COUNTDOWN. The help line below says "waiting
// longer than this" and deliberately promises no moment — do not add "in exactly" or a live countdown
// anywhere; that is the "resuming in ~119 min" mistake, a backstop reported as a prediction.
export const OFFLINE_AUTO_REJECT_OPTIONS = [5, 10, 15, 20, 25, 30] as const
/** "5 mins" for 5. The stored value IS the number shown — a floor, not a deadline. */
export function offlineAutoRejectLabel(mins: number): string {
  return `${mins} mins`
}

/** The two modes, in the order they render. One array so manage and the dashboard cannot drift. */
export const OFFLINE_PROTECTION_MODES = [
  { value: 'pause' as const, label: OFFLINE_MODE_PAUSE_LABEL, help: OFFLINE_MODE_PAUSE_HELP },
  { value: 'no_auto_accept' as const, label: OFFLINE_MODE_NO_AUTO_ACCEPT_LABEL, help: OFFLINE_MODE_NO_AUTO_ACCEPT_HELP },
]
export type OfflineProtectionMode = (typeof OFFLINE_PROTECTION_MODES)[number]['value']
