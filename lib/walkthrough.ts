// lib/walkthrough.ts
// The dashboard walkthrough: its stop definitions and its per-device seen-state. No 'use client' and no
// server imports — the stops are plain data and the state helpers are localStorage wrappers, so both the
// Manage page and the Walkthrough component can import this without pulling anything else in.
//
// ── WHY localStorage AND NOT A COLUMN ────────────────────────────────────────────────────────────────
// This follows the settled pattern in this codebase, not a shortcut: keep_screen_on and sound_config were
// both MOVED OUT of the database to per-device storage, because "have I been shown this on THIS screen"
// is a property of the device, not of the truck. An operator on an iPad in the van and a laptop at home
// is two different people as far as an orientation tour is concerned. It also means zero migrations.
//
// 🔴 THE ABSENCE OF A KEY MEANS "DO NOTHING", NEVER "SHOW IT".
// Every existing operator — Pizzeria Gusto, Real Thai Food — has no key for their truck and never will
// until they click something. `readWalkthroughState` returns null for them, and NOTHING in this module
// or its callers turns null into an open walkthrough: the overlay is rendered only from an explicit
// click, and the reminder strip tests `=== 'remind'` rather than `!== 'seen'`. Those two facts are the
// whole guarantee; keep them if you change this.

/** Per-truck, per-device. Keyed on the dashboard token so two trucks on one laptop are independent. */
export function walkthroughKey(token: string): string {
  return `hg_walkthrough_${token}`
}

/**
 * `'seen'`   — taken or dismissed. Offer nothing further; the Settings entry still re-opens it.
 * `'remind'` — "Remind me later". Show the strip at the top of Manage until taken or dismissed.
 * `null`     — never interacted with. **Do nothing.** This is every existing operator.
 */
export type WalkthroughState = 'seen' | 'remind' | null

export function readWalkthroughState(token: string): WalkthroughState {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(walkthroughKey(token))
    return v === 'seen' || v === 'remind' ? v : null
  } catch {
    return null   // private mode / storage disabled → behave exactly like "never interacted"
  }
}

export function writeWalkthroughState(token: string, value: Exclude<WalkthroughState, null>): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(walkthroughKey(token), value) } catch { /* private mode — it will ask again */ }
}

// ── THE STOPS ────────────────────────────────────────────────────────────────────────────────────────
// 🔴 ANCHORED BY TAB ID, NOT BY POSITION. Each stop names the tab(s) it points at and the component
// resolves them with `[data-tab-id="..."]` at open time. Nothing here knows or cares that Menu is first
// or that Billing is last, so the tab bar can be reordered, filtered by role, or have a tab added
// without touching this file. A stop whose tabs are all absent is SKIPPED — see the component.
//
// 🔴 NO NAVIGATION. Every stop points at the tab bar from wherever the operator already is. The
// walkthrough never calls setActiveTab, so there is no state to preserve, nothing to restore if it is
// closed halfway, and no way for it to strand someone on a tab they did not choose.

export interface WalkthroughStop {
  id: string
  /** Tab ids from the Manage tab bar. More than one ⇒ the highlight spans them all. */
  tabIds: string[]
  title: string
  body: string
}

export const WALKTHROUGH_STOPS: WalkthroughStop[] = [
  {
    id: 'menu',
    tabIds: ['menu'],
    title: 'Menu',
    body: "Your dishes, prices and allergens. Change anything here and it's live straight away.",
  },
  {
    id: 'schedule',
    tabIds: ['schedule'],
    title: 'Schedule',
    body: "Where and when you're trading. Add an event here and customers can order for it.",
  },
  {
    id: 'settings',
    tabIds: ['settings'],
    title: 'Settings',
    body: "Your truck's details, how customers pay, and your kitchen's capacity.",
  },
  {
    id: 'billing',
    tabIds: ['billing'],
    title: 'Billing',
    body: 'Where your plan, billing and feature information lives.',
  },
  {
    id: 'build',
    tabIds: ['deals', 'modifiers'],
    title: 'Deals and Extras & Upsells',
    // ⚠️ THE ORIGINAL DRAFT OF THIS LINE ENDED "…nothing you do here goes live until you want it to."
    // That clause was FALSE and was withdrawn before shipping. Verified against the code, for whoever
    // edits this next:
    //   • A new deal is created with `apply_to_new_events: true` (DealsTab's emptyBundle). The customer
    //     menu route, finding no event_deals rows for the event, falls back to
    //     `filteredBundles.filter(b => b.apply_to_new_events)` — so it shows on the next open or
    //     confirmed event immediately.
    //   • An upsell rule is fetched with `.from('upsell_rules').select('*').eq('truck_id', …)` and NO
    //     visibility filter whatsoever, then rendered by the customer order page. It is live the moment
    //     it saves.
    // Both tabs PUBLISH ON SAVE. Do not reintroduce any form of "this is only a draft" here.
    body: 'Deals, upsells and customisations live in these tabs — have a play around.',
  },
]
