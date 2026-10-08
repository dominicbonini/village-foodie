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
 * What a truck without `schedule_graphics` is told, on the screen and by every route.
 *
 * ══ 🔴 "Pro", NOT "Max" — CHANGED AT LAUNCH (10 October 2026) ═════════════════════════════════════
 * ⛔ THE KEY MOVED FROM `MAX_FEATURES` TO `PRO_FEATURES`, so the old sentence — "The weekly post is on
 * Max" — became the mirror image of the mistake this file was created to fix: it would send a Starter
 * truck to buy the wrong plan, and it would tell a Pro truck the feature is not on their plan when it
 * is. ⚠️ THE SENTENCE NAMES THE CHEAPEST PLAN THAT INCLUDES IT, which is what an upgrade prompt is for
 * and what `lib/plan-features.ts` does for every other row.
 * ⚠️ IT SAYS "Social media posts", THE NAME ON THE PRICING TABLE, rather than "the weekly post" — the
 * one key now gates the whole tab (weekly posts, single event posts, designs and location settings),
 * so naming only one of them would be a smaller promise than the gate makes.
 * 🔴 `scripts/places-posts-gating.cjs` PINS THIS WORDING AND ASSERTS THE KEY'S TIERS, so the sentence
 * and the gate cannot drift apart again — and it is now used by `/api/weekly-post`, `/api/manage` and
 * the screen, so there is one claim in one place.
 */
export const WEEKLY_POST_PLAN_REFUSAL = 'Social media posts are on Pro and Max'
