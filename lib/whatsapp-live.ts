// lib/whatsapp-live.ts
// 🔴 THE SINGLE WHATSAPP SWITCH. One value, read by every surface that says whether WhatsApp auto-replies
// are live: the landing page, the pricing matrix, the landing table, and Manage → Settings.
//
// ── WHY THIS FILE EXISTS, RATHER THAN THE FLAG STAYING IN THE MANAGE PAGE ────────────────────────────
// `WHATSAPP_LIVE` was declared in app/manage/[token]/page.tsx. It could not stay there and also govern the
// landing copy: that page ALREADY imports FEATURE_SECTIONS and FOOTNOTES from lib/plan-features.ts
// (page.tsx:36), and lib/landing-table.ts and app/landing/page.tsx import from lib/plan-features.ts too.
// A flag defined in the page and read by the lib would be a cycle (lib → app page → lib).
// 🔴 THIS IS THE SAME FLAG, MOVED. It is NOT a second switch, and there must never be a second one —
// the whole point is that one value decides what every surface says.
//
// ⚠️ WHAT IT DOES NOT DO. It does not gate ACCESS. `canAccess('pro','whatsapp_replies')` is decided by
// lib/features.ts, which is unchanged and already grants the feature to Pro and Max. This flag decides
// only what the product SAYS about WhatsApp, plus whether the Manage → Settings connect control is
// interactive. Turning it on grants nobody anything they did not already have.
//
// ⚠️ IT IS A BUILD-TIME CONSTANT, NOT AN ENV VAR. Flipping it needs an edit, a commit and a deploy —
// there is no runtime toggle. That is deliberate: the copy has to change with it, and copy lives in code.

/**
 * `false` → every surface says WhatsApp auto-replies are COMING SOON, byte-identical to what
 * production rendered at 08ac368.
 * `true`  → every surface says WhatsApp is live: the matrix row ticks Pro and Max on footnote 6, the
 * landing tile and Pro-card bullet drop their badges, and the Settings connect control becomes editable.
 */
export const WHATSAPP_LIVE: boolean = false
