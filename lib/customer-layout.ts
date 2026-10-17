// lib/customer-layout.ts — layout switches for the customer's screens (US layout proposal, group A, 17 October 2026).
//
// ⚠️ OPEN QUESTION TO DOMINIC (fix 11): the Manage-my-order Pickup row's new layout — a gap after the label, the time
// and the venue each on their own line, right-aligned — is built for every 12-hour (US) order. Whether a 24-hour (GB)
// order gets it too is undecided: GB's row fits on one line today, so giving it the new layout changes a GB screen
// that has no GB bug. FALSE = only 12-hour orders get it and GB is unchanged; TRUE = GB too.
export const MANAGE_PICKUP_STACK_GB = false
