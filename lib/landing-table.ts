// lib/landing-table.ts
// 🔴 THE COMPARE TABLE'S RENDER RULES, EXTRACTED SO THERE IS EXACTLY ONE COPY.
//
// These lived as private constants inside app/landing/page.tsx. They moved here — MOVED, NOT REWRITTEN —
// when the printable/PDF view was added, because the alternative was a second copy of the same rules in
// the PDF renderer. The manual already records that failure mode with the standalone HTML artifact: a
// hand-built duplicate is correct on the day it is written and wrong the first time a row changes.
//
// ⚠️ THIS FILE HOLDS NO DATA. Every fact still comes from lib/plan-features.ts and lib/features.ts. What
// lives here is only the LANDING'S PRESENTATION OF IT: which plans get columns, what the Trial column
// resolves to, which rows the landing hides or renames, and the three cell glyphs. Billing and Admin
// render the same source WITHOUT these rules, which is why they are here and not there.
//
// 🔴 TWO PROTECTED STRINGS PASS THROUGH THIS FILE AND ARE BYTE-IDENTICAL TO WHAT THEY WERE:
//   1. 'Online ordering — Pay at Hatch' in trialFeatureValue() — an EXACT-MATCH JOIN KEY. The dash is an
//      EM DASH (U+2014). lib/plan-features.ts:185 and :401, app/admin/page.tsx:909 and
//      app/manage/[token]/page.tsx:11427 all match this literal. Normalising it to a hyphen silently
//      breaks the Trial column and the feature-key lookup, with no error.
//   2. The bare '—' returned by cellLabel() for a not-included cell — also an EM DASH, and
//      lib/pricing.ts's NON_SECRET_PRICE set matches it by exact string to exempt it from the pre-launch
//      price mask. A renderer that substitutes or normalises it must NEVER write back here.
// ⚠️ ANY PDF/PRINT PATH MUST TREAT THIS FILE AS READ-ONLY. Rendering may transform characters for
// display; it may not feed them back into the source.
import {
  PLAN_PRICES,
  type FeatureValue,
  type FeatureRow,
  type FeatureSection,
} from '@/lib/plan-features'

export const TABLE_PLANS = ['trial', 'starter', 'pro', 'max'] as const
export type TablePlan = (typeof TABLE_PLANS)[number]

export const PLAN_SUB: Record<TablePlan, string> = { trial: '', starter: 'free forever', pro: 'per truck / month', max: 'per truck / month' }
// Trial column shows just "Free" (not "Free trial" + a sub) — keeps the sticky header compact.
export const PLAN_PRICE_LABEL: Record<TablePlan, string> = { trial: 'Free', starter: PLAN_PRICES.starter, pro: PLAN_PRICES.pro, max: PLAN_PRICES.max }

// Trial mirrors Billing exactly: it includes everything Max has, and pay-at-hatch is always available. EXCEPT
// SMS order alerts — a paid add-on that isn't part of the free trial, so the Trial column shows "—" (not the
// Coming-soon marker Max/Pro carry).
export function trialFeatureValue(row: { name: string; max: FeatureValue }): FeatureValue {
  if (row.name === 'Online ordering — Pay at Hatch') return true
  if (row.name === 'SMS order alerts') return false
  return row.max
}

// RENDER-ONLY feature-row description overrides for the landing table, keyed by row name. The shared
// FEATURE_SECTIONS details (lib/plan-features.ts) are NOT modified — Billing/Admin keep the original text.
import { WHATSAPP_LIVE } from '@/lib/whatsapp-live'

export const DETAIL_OVERRIDES: Record<string, string> = {
  // 🔴 THIS STRING IS PRINTED BY THE LANDING TABLE AND THE PDF AND EXISTS IN NO ROW DEFINITION.
  // It overrides the shared detail in lib/plan-features.ts, so a grep of that file for "Android coming
  // soon" would have come back clean while the compare table and the PDF both still said it. That is
  // the exact class of miss the census was told to hunt for — a DERIVED label, not a matched one.
  // 🟢 "(Android coming soon)" removed 5 September 2026: the Android app is live on Google Play.
  'Offline Order Protection': "If you lose signal, online ordering pauses so customers can't place orders you won't see. The iPhone, iPad and Android app keeps you taking orders offline; the web dashboard needs a connection.",
  // 🔴 THE MERGED AUTO-REPLIES OVERRIDE WAS REMOVED 4 September 2026, WHEN WHATSAPP WENT LIVE.
  // It read: 'Auto-reply to enquiries about your menu and schedule on WhatsApp, Messenger and Instagram.'
  // That sentence described a MERGED row and is false of the WhatsApp row on its own — Messenger and
  // Instagram are unbuilt stubs. The row now falls back to its shared detail in lib/plan-features.ts,
  // which is already WhatsApp-specific. See NAME_OVERRIDES and HIDDEN_ROWS below for the other two
  // halves of the same undo.
  // 🔴 RESTORED WHILE THE SWITCH IS OFF (lib/whatsapp-live.ts). This is the production string at
  //    08ac368, verbatim — it describes the MERGED row that NAME_OVERRIDES and HIDDEN_ROWS below
  //    recreate in the same state, so all three move together or the table contradicts itself.
  ...(WHATSAPP_LIVE ? {} : {
    'WhatsApp auto-replies': 'Auto-reply to enquiries about your menu and schedule on WhatsApp, Messenger and Instagram.',
  }),
}

// RENDER-ONLY row-name overrides. Same contract as DETAIL_OVERRIDES above: the landing surfaces only.
// 🔴 EMPTIED 4 September 2026 — THE MERGE WAS UNDONE, EXACTLY AS THE GUARD BELOW REQUIRED.
// It held: 'WhatsApp auto-replies': 'WhatsApp, Messenger & Instagram auto-replies'. With the WhatsApp
// row now `pro: true, max: true` and the Messenger & Instagram row still `coming_soon`, that rename
// printed ONE row, named for all three channels, carrying WhatsApp's ticks — i.e. the landing table and
// the PDF advertised two unbuilt stubs as live. The rows no longer carry identical cell values, so the
// merge is no longer permissible. This restores the two-row shape the table had when WhatsApp was last
// the only live channel: 'WhatsApp auto-replies' ✓/✓ and a separate 'Messenger & Instagram
// auto-replies' reading Coming soon.
// ⚠️ Kept as an empty map rather than deleted: `rowName()` and both renderers import it.
export const NAME_OVERRIDES: Record<string, string> = WHATSAPP_LIVE ? {} : {
  // 🔴 THE MERGE, RESTORED WHILE THE SWITCH IS OFF — verbatim from 08ac368. Permissible ONLY because
  //    in this state both rows carry identical cells again (starter:false, pro/max 'coming_soon',
  //    footnote '4'), which is the precondition the comment above demands. Flipping the switch to true
  //    makes them diverge and empties this map in the same edit.
  'WhatsApp auto-replies': 'WhatsApp, Messenger & Instagram auto-replies',
}

// 🔴 ROWS THE LANDING TABLE DOES NOT PRINT. EMPTY SINCE 4 September 2026 — nothing is hidden.
// It held 'Messenger & Instagram auto-replies', merged into the WhatsApp row so the table carried one
// social auto-replies line instead of two. 🔴 THE MERGE'S OWN PRECONDITION FAILED AND THE UNDO IS WHAT
// THAT COMMENT DEMANDED. It read: "SAFE ONLY BECAUSE THE TWO ROWS CARRY IDENTICAL CELL VALUES (both
// starter:false, pro:'coming_soon', max:'coming_soon', both footnote 4). IF THEY EVER DIVERGE THIS MERGE
// BECOMES A LIE and must be undone: one row cannot show two different sets of ticks."
// They diverged: WhatsApp is now `pro: true, max: true` on footnote 6; Messenger & Instagram is still
// `coming_soon` on footnote 4. Hiding the second row while renaming the first would have printed one
// line reading "WhatsApp, Messenger & Instagram auto-replies" with a tick under Pro and Max — advertising
// two verify-handshake stubs as shipped, on the landing page AND in the PDF sent to prospects.
// ⚠️ The original reasoning for never merging at SOURCE still stands and is why this was a render-only
// override in the first place: merging in lib/plan-features.ts would drop 'instagram_messenger_replies'
// from the name→key map findPlanParityViolations walks, and would silently change Billing and Admin too.
// ⚠️ Kept as an empty Set rather than deleted: `visibleRows()` and both renderers import it.
export const HIDDEN_ROWS = new Set<string>(WHATSAPP_LIVE ? [] : [
  // 🔴 Hidden while the switch is off, so the merged row above prints ONE social auto-replies line —
  //    exactly as production does at 08ac368.
  'Messenger & Instagram auto-replies',
])

/** The rows the landing (and anything rendering the landing's view of the table) actually prints. */
export function visibleRows(section: FeatureSection): FeatureRow[] {
  return section.rows.filter(row => !HIDDEN_ROWS.has(row.name))
}

/** The row name as the landing prints it. */
export function rowName(row: { name: string }): string {
  return NAME_OVERRIDES[row.name] ?? row.name
}

/** The row description as the landing prints it, or '' when there is none. */
export function rowDetail(row: { name: string; detail?: string }): string {
  return DETAIL_OVERRIDES[row.name] ?? row.detail ?? ''
}

/** 🔴 THE THREE CELL GLYPHS, IN ONE PLACE. Mirrors Billing: ✓ / — / Coming soon.
 *  ⚠️ The '—' is an EM DASH and is protected — see the header. */
export function cellLabel(value: FeatureValue): string {
  if (value === true) return '✓'
  if (value === 'coming_soon') return 'Coming soon'
  return '—'
}
