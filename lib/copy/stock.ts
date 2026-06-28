// Canonical user-facing copy for DEFAULT (template) stock fields in manage → Settings.
//
// Single source of truth so the menu-item editor (app/manage/[token]/page.tsx) and the extras
// option editor (components/manage/ExtrasEditor.tsx) describe the scope identically. A future
// wording change is one edit here.
//
// Accuracy rules baked in (matches the live-default + per-event-override model — see §61 / EXTRAS
// STOCK in the reference manual):
//   - Changing the DEFAULT updates every event that does NOT have its own dashboard amount (those
//     events read the default LIVE). It is NOT a snapshot and is NOT future-only.
//   - Events the operator has set a specific amount for on their dashboard KEEP that value.
//   - Per-event amounts are set on that event's dashboard (Menu & Stock), which this note points to.
// Presentational string only — it must not encode or change any stock behaviour.
export const DEFAULT_STOCK_SCOPE_NOTE =
  'Default for every event. To set a different amount for one event, change it on that event’s dashboard — events you’ve already set there keep their own amount.'
