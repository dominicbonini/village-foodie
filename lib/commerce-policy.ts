// lib/commerce-policy.ts
// ONE predicate deciding whether this runtime may show a purchase call to action.
//
// ── THE RULE THIS ENCODES ────────────────────────────────────────────────────────────────────────────
// Apple App Store guideline 3.1.1 requires in-app purchase for anything that unlocks features inside the
// app, and 3.1.3 forbids buttons, links or calls to action pointing at an EXTERNAL purchase mechanism
// outside the US storefront. HatchGrab is UK. So inside the native iOS shell there must be no upgrade
// button, no "choose a plan", no mailto-to-upgrade and no link to a pricing surface.
//
// 🔴 ANDROID IS DELIBERATELY EXCLUDED FROM THIS RESTRICTION. Google permits steering users to an external
// purchase mechanism, so the Android shell keeps the full web behaviour. A predicate that merely asked
// `isNativePlatform()` would be true on Android as well and would silently strip the upgrade path from a
// platform that never required it — a product regression wearing a compliance justification.
//
// ⚠️ THE PREDICATE IS NAMED FOR THE REASON, NOT THE SYMPTOM. Call sites ask "am I allowed to show a
// purchase CTA", never "am I on iOS". That is why `getPlatform()` is NOT re-exported: if this were a
// platform check spread across a dozen files, the next person to change the policy would have to find and
// understand every one of them. There is one place to change, and it is this file.
//
// ── REVERSIBILITY ────────────────────────────────────────────────────────────────────────────────────
// The UK position may change (CMA consultation pending). If external purchase links become permitted in
// the UK storefront, this becomes `return true` and every gate in the app reopens at once. Do not
// re-scatter the platform test; that reversibility is the whole design.
import { Capacitor } from '@capacitor/core'

/**
 * True when this runtime may render a purchase call to action.
 *
 * FALSE in exactly one case: the native iOS shell. TRUE everywhere else — SSR, any browser, and native
 * Android — BY CONSTRUCTION rather than by enumeration: the function returns true unless it can
 * AFFIRMATIVELY establish both that it is running natively AND that the platform is iOS. Every uncertain
 * path (no Capacitor, web build, server render) falls through to true without being tested for.
 *
 * ⚠️ THE UNKNOWN CASE FAILS OPEN, AND THAT IS THE DELIBERATE DIRECTION. Failing closed would hide the
 * upgrade path from every web operator on any unexpected runtime — a live revenue and UX regression for
 * people the guideline does not apply to. Failing open costs nothing, because the one runtime that must
 * return false is the one runtime where Capacitor is guaranteed present and `getPlatform()` is exact.
 */
export function purchaseCtaAllowed(): boolean {
  // No Capacitor at all (server render, plain web build) → allowed.
  if (typeof Capacitor === 'undefined') return true
  // Browser, including the Capacitor web shim → allowed.
  if (!Capacitor.isNativePlatform()) return true
  // Native, but Android (or any future native platform) → allowed. Only iOS is restricted.
  return Capacitor.getPlatform() !== 'ios'
}
