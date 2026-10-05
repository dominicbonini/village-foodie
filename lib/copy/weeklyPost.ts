// lib/copy/weeklyPost.ts — the weekly post's plan sentence, defined once.
//
// ── 🔴 WHY THIS FILE EXISTS, AND IT IS A CORRECTION NOT A TIDY-UP (5 October 2026) ────────────────
// The sentence was written out TWICE — in app/api/weekly-post/route.ts's refusal and in
// components/manage/SchedulePlaces.tsx's `upgradeMessage` — and both copies said **"Pro and Max"**
// about a key that is in `MAX_FEATURES` alone. `canAccess('pro', 'schedule_graphics', {}, null)` is
// FALSE, proved by calling it for all four plans. So a Pro truck was told the weekly post came with
// their plan and then refused it, on both surfaces, in the same words.
//
// 🔴 TWO COPIES OF ONE CLAIM IS TWO CHANCES TO BE WRONG ABOUT IT, and they were both wrong the same
// way — which is the argument for the module, not merely for the fix.
//
// ⛔ IT IS NOT IN THE ROUTE. The first attempt exported it from app/api/weekly-post/route.ts and
// imported it into the component, which pulled the route's server-only dependencies into the client
// bundle and failed the Turbopack build with two errors out of @vercel/og. A string shared between a
// route and a component belongs in lib/copy/, which is what this directory is for.
//
// ⚠️ TRIAL, TESTER AND DEMO ALSO PASS THE GATE, because `TRIAL_FEATURES` spreads `MAX_FEATURES`. The
// sentence names the plan a paying truck would buy, which is what an upgrade prompt is for — the same
// convention `lib/plan-features.ts` follows for every other row.

/**
 * What a truck without `schedule_graphics` is told, on the screen and by the route.
 * ⚠️ `scripts/places-posts-gating.cjs` pins this wording AND asserts the key is Max-only, so the
 * sentence and the gate cannot drift apart again.
 */
export const WEEKLY_POST_PLAN_REFUSAL = 'The weekly post is on Max'
