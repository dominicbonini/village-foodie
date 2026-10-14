// lib/walk-up.ts — 🔴 THE NAME A WALK-UP ORDER IS STORED UNDER, AND THE ONE WAY TO ASK "IS THIS THE WALK-UP
// DEFAULT?" (Language Phase 0, docs/language-phase-0-report.md §2).
//
// PURE. An order taken at the window with no name is saved with `customer_name = 'Walk-up'` (the dashboard,
// Add order and the action route all write it), and Reports, the CSVs and the ticket then treat that stored
// value as "no real name". It is STORED DATA — existing rows hold exactly this string — so the constant must
// never be reworded or translated; what a screen SHOWS for a walk-up is display text and lives elsewhere.

/** The `orders.customer_name` written for a walk-up order with no name. ⛔ Stored data: never change it. */
export const WALK_UP_NAME = 'Walk-up'

/** Is this stored customer name the walk-up default (rather than a name someone typed)? */
export const isWalkUp = (customerName: string | null | undefined): boolean => customerName === WALK_UP_NAME
