// components/manage/layout-choices.ts — the Manage layout choices still waiting on Dominic (US layout proposal, group C,
// 17 October 2026). Each is ONE constant so the answer is a one-word change, and so the render harness
// (scripts/us-layout-proposal/C/render.cjs) can flip it at bundle time to show both ways.
// ⚠️ A SEPARATE MODULE, NOT EXPORTS OF app/manage/[token]/page.tsx: a Next page may export only its own fields.

/** Fix 3 (audit C-01/C-02) — Schedule cards on a phone (<640px): the time range on its own line, the van on its own line
 *  and the action icons in a row beneath the details. ALWAYS on for a 12-hour truck. `false` = a 24-hour (GB) truck's
 *  cards stay exactly as they were; `true` = GB gets the same phone layout. */
export const SCHEDULE_CARD_STACK_GB: boolean = false

/** Fix 4 (audit C-05) — Import review, the phone card's heading: the time on its own line under the date. ALWAYS on for a
 *  12-hour truck. `false` = GB keeps "Wed 30th Sep · 11:30–22:45" on one line; `true` = GB gets the two-line heading. */
export const IMPORT_HEADING_STACK_GB: boolean = false

/** Fix 5 (audit C-03, and the GB minute boxes clipped 3–4px) — the event time control on a phone (<640px), in Add/Edit
 *  event (also Approve → Edit) and the Import review's phone cards. Wider screens keep the hour + minute selects.
 *  'select' (5A): one select per time showing the whole time — "10:45 PM" / "22:45" — in the editor's 5-minute step.
 *  'toggle' (5B): hour + minute selects, plus an AM/PM toggle for a 12-hour truck (a 24-hour truck keeps hour + minute). */
export const PHONE_TIME_PICKER: 'select' | 'toggle' = 'select'
