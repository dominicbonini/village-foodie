// lib/demo-menu-carry.ts — demo-claim-2 (9 November 2026, docs/demo-claim-2-report.md).
//
// THE DEMO → REAL MENU CARRY-OVER, SERVER-SIDE, AT ACCOUNT CREATION.
// Before this, a claimed demo's menu reached the real truck ONLY through the ?import=demo review on the browser tab that
// signed up. An operator who verified their email and carried on on a phone (Le Roi du Churrasco, 9 Nov — docs/
// demo-claim-1-report.md) landed on an empty menu, with their uploaded menu sitting in the claimed demo. Decision
// (Dominic, demo-claim-2): when someone signs up from a demo built from their OWN menu, the menu is saved to the real
// truck when the truck is created, whatever device they continue on. No review first; they edit in Manage afterwards.
//
// CALLED FROM ONE PLACE: /api/setup `create_truck` — the one request where a claim (written earlier, by /api/signup)
// and the real truck meet — for a new truck AND for the resumed one (a retry, or /setup on a second device), so a
// carry-over that did not happen the first time is attempted again there.
//
// 🔴 THE RULES, each enforced below and proved by scripts/demo-claim-2.cjs:
//   • ONLY extraction_source 'upload' — a sample (template) menu was never theirs and must NEVER land on a real truck.
//   • ONLY onto a truck still IN SETUP that has NO menu items at all (active or not) — never over a menu, never a live truck.
//   • NEVER TWICE — demo_sessions.menu_carry_status is taken with a conditional update (null → 'started', or a past
//     'failed' → 'started'), so two concurrent create_truck calls cannot both commit; 'done' is final.
//   • THE SAME DECISIONS AS THE REVIEW ACCEPTED WITHOUT CHANGES — lib/menu-import-review.ts `acceptReviewDefaults`,
//     committed through the one commit path (lib/menu-commit.ts). Allergens commit unverified, so Manage's existing
//     "allergens not set" warnings show. The one decision the review never makes by default — a dish with no price —
//     is committed HIDDEN (is_available = false): kept for the operator to price, never on sale at 0.
//   • NEVER FAILS SIGNUP — every outcome is returned, none thrown. A failed commit is wiped (the truck had no menu and
//     the lock is ours, so everything on it is ours), recorded as 'failed' with its reason, and logged; the ?import=demo
//     offer then remains the fallback.
//
// ── THE REVIEW STILL HAPPENS (demo-claim-2 correction, same day) ──────────────────────────────────────────────────
// The carry-over is the SAFETY NET, not a replacement for the review. Every carry-over (done, or failed onto an empty
// truck) leaves menu_review_status = 'pending', and the review is driven from THAT saved state — not from ?import=demo
// or a browser tab — so it appears on any device and surface while setup is unfinished (Manage reads it through
// /api/manage `menu_review_state`; the dashboard, where the native app lands, sends a pending operator to Manage).
//   • untouched since carry-over (fingerprint equal) → the usual offer and review; confirming re-commits CLEAR-FIRST,
//     replacing the carried menu with the reviewed one (commit-menu then records 'reviewed');
//   • edited by hand since (fingerprint differs) → "check your menu" against the SAVED menu: nothing is re-committed,
//     so their edits can never be overwritten; "Looks good" records 'reviewed';
//   • dismissed ("Finish later") → 'dismissed'. Reviewed or dismissed, it never appears again; never reviewed, the menu
//     simply stays as carried.
/* eslint-disable @typescript-eslint/no-explicit-any -- the fingerprint reads untyped PostgREST rows and normalises every field itself */
import type { SupabaseClient } from '@supabase/supabase-js'
import { commitMenu, clearMenu, type CommitMenuResult } from '@/lib/menu-commit'
import { acceptReviewDefaults } from '@/lib/menu-import-review'
import type { Actor } from '@/lib/allergen-audit'

export type CarrySkipReason =
  | 'no_claim'          // the operator did not come from a demo
  | 'not_upload'        // a sample (template) demo — never carried
  | 'no_extraction'     // the payload is gone (swept, pre-migration, or never persisted)
  | 'already_carried'   // menu_carry_status = 'done'
  | 'not_in_setup'      // the target truck is finished setup (or unknown) — never write over a live truck
  | 'truck_has_menu'    // the target truck already has menu items
  | 'locked'            // another request holds the carry-over
  | 'empty'             // the extraction holds nothing to commit
  | 'unavailable'       // the session could not be read (e.g. 20261084 not run yet)

export type CarryOutcome =
  | { status: 'carried'; demoTruckId: string; inserted: number; hidden: string[]; groups: number }
  | { status: 'skipped'; reason: CarrySkipReason; demoTruckId?: string }
  | { status: 'failed'; demoTruckId: string; error: string }

/** The carry-over writes as the signed-up owner when the route knows them, else as the system (the backfill). */
export type CarryActor = Actor

/** Injected for the harness's failed-commit case only. Production always uses lib/menu-commit's commitMenu. */
export interface CarryDeps { commit?: typeof commitMenu }

const log = (msg: string) => console.log(`[demo-carry] ${msg}`)
const warn = (msg: string) => console.warn(`[demo-carry] ${msg}`)

/** A short, single-line reason for the session row and the log. */
function describeFailure(r: CommitMenuResult): string {
  const first = r.failed[0]
  const parts = [`inserted ${r.inserted}/${r.submitted}`]
  if (r.failed.length) parts.push(`${r.failed.length} failed (first: ${first.type} "${first.name}": ${first.error})`)
  if (r.unaccounted) parts.push(`${r.unaccounted} unaccounted`)
  return parts.join(', ').slice(0, 500)
}

/**
 * Carry the operator's claimed demo menu onto `truck`. Never throws; the outcome says what happened and why.
 * `operatorId` scopes the claim exactly as /api/setup GET does: the operator's MOST RECENT claimed session.
 */
export async function carryClaimedDemoMenu(
  supabase: SupabaseClient,
  operatorId: string,
  truck: { id: string },
  actor: CarryActor,
  deps: CarryDeps = {},
): Promise<CarryOutcome> {
  const commit = deps.commit ?? commitMenu
  try {
    // ── 1. THE CLAIM — the same selection rule as /api/setup GET (most recent claim wins) ──────────────────────
    const { data: session, error: sErr } = await supabase
      .from('demo_sessions')
      .select('truck_id, extraction, extraction_source, menu_carry_status')
      .eq('claimed_by_operator_id', operatorId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (sErr) { warn(`claim read failed for operator ${operatorId} (${sErr.message}) — is 20261084 run?`); return { status: 'skipped', reason: 'unavailable' } }
    if (!session) return { status: 'skipped', reason: 'no_claim' }
    const demoTruckId = String(session.truck_id)
    // 🔴 A SAMPLE NEVER LANDS ON A REAL TRUCK. Strictly 'upload' — a null/unknown source is not "theirs" either.
    if (session.extraction_source !== 'upload') return { status: 'skipped', reason: 'not_upload', demoTruckId }
    if (!session.extraction) return { status: 'skipped', reason: 'no_extraction', demoTruckId }
    if (session.menu_carry_status === 'done') return { status: 'skipped', reason: 'already_carried', demoTruckId }

    // ── 2. THE TARGET — in setup, and no menu items at all ──────────────────────────────────────────────────────
    const { data: target } = await supabase.from('trucks').select('id, setup_step').eq('id', truck.id).maybeSingle()
    if (!target || target.setup_step == null || target.setup_step === 'done') return { status: 'skipped', reason: 'not_in_setup', demoTruckId }
    const hasItems = async () => {
      const { data, count } = await supabase.from('menu_items_db').select('id', { count: 'exact', head: true }).eq('truck_id', truck.id)
      return (count ?? (Array.isArray(data) ? data.length : 0)) > 0
    }
    if (await hasItems()) return { status: 'skipped', reason: 'truck_has_menu', demoTruckId }

    // ── 3. THE LOCK — conditional, so exactly one request carries ──────────────────────────────────────────────
    const lockPatch = { menu_carry_status: 'started', menu_carry_at: new Date().toISOString(), menu_carry_truck_id: truck.id, menu_carry_note: null }
    const take = async (from: null | 'failed') => {
      let q = supabase.from('demo_sessions').update(lockPatch).eq('truck_id', demoTruckId).eq('claimed_by_operator_id', operatorId)
      q = from === null ? q.is('menu_carry_status', null) : q.eq('menu_carry_status', from)
      const { data } = await q.select('truck_id')
      return Array.isArray(data) && data.length > 0
    }
    if (!(await take(null)) && !(await take('failed'))) return { status: 'skipped', reason: 'locked', demoTruckId }
    const finish = async (status: 'done' | 'failed' | null, note: string | null) => {
      // A finished attempt (done, or failed onto the truck it left empty) owes the operator a review: 'pending', with the
      // fingerprint of the menu as it now stands, so the review can later tell "untouched" from "edited by hand".
      const owesReview = status === 'done' || status === 'failed'
      const fingerprint = owesReview ? await menuFingerprint(supabase, truck.id) : null
      const { error } = await supabase.from('demo_sessions')
        .update({
          menu_carry_status: status, menu_carry_at: new Date().toISOString(), menu_carry_note: note,
          ...(owesReview ? { menu_carry_fingerprint: fingerprint, menu_review_status: 'pending', menu_reviewed_at: null } : {}),
        })
        .eq('truck_id', demoTruckId)
      if (error) warn(`could not record carry status ${status} for ${demoTruckId}: ${error.message}`)
    }
    // Re-checked under the lock: a menu that arrived between the first check and the lock is never written over.
    if (await hasItems()) { await finish(null, null); return { status: 'skipped', reason: 'truck_has_menu', demoTruckId } }

    // ── 4. THE REVIEW, ACCEPTED WITHOUT CHANGES ────────────────────────────────────────────────────────────────
    const payload = acceptReviewDefaults(session.extraction)
    if (payload.items.length === 0) { await finish(null, null); return { status: 'skipped', reason: 'empty', demoTruckId } }

    // ── 5. COMMIT through the one commit path ──────────────────────────────────────────────────────────────────
    let result: CommitMenuResult | null = null
    let error: string | null = null
    try {
      result = await commit(supabase, truck, { categories: payload.categories, items: payload.items, categoryPrep: payload.categoryPrep }, actor)
      if (!result.ok || result.unaccounted > 0 || result.inserted === 0) error = describeFailure(result)
    } catch (e) {
      error = e instanceof Error ? e.message : 'commit threw'
    }
    if (error) {
      // The truck had NO menu items and the lock is ours, so every menu row on it now is this commit's: wipe them, so
      // the fallback offer (and its clearFirst re-commit) starts from the empty truck the operator expects.
      try { await clearMenu(supabase, truck.id) } catch (e) { warn(`could not clear the partial carry-over on ${truck.id}: ${e instanceof Error ? e.message : e}`) }
      await finish('failed', error)
      warn(`FAILED ${demoTruckId} → ${truck.id}: ${error} — the ?import=demo offer remains the fallback`)
      return { status: 'failed', demoTruckId, error }
    }

    // ── 6. PRICE GATE — a dish with no price is kept, HIDDEN, for the operator to price ────────────────────────
    const hidden = payload.unpricedNames
    if (hidden.length) {
      const { error: hErr } = await supabase.from('menu_items_db').update({ is_available: false })
        .eq('truck_id', truck.id).in('name', hidden)
      if (hErr) warn(`could not hide ${hidden.length} unpriced item(s) on ${truck.id}: ${hErr.message}`)
    }

    const note = `carried ${result!.inserted} item(s)${hidden.length ? `, ${hidden.length} hidden (no price)` : ''}`
    await finish('done', note)
    log(`${demoTruckId} → ${truck.id}: ${note}`)
    return { status: 'carried', demoTruckId, inserted: result!.inserted, hidden, groups: result!.groupsCreated }
  } catch (e) {
    // Belt and braces: nothing above should throw past its own handling, and signup must never see it if it does.
    warn(`unexpected error for operator ${operatorId} → ${truck.id}: ${e instanceof Error ? e.message : e}`)
    return { status: 'skipped', reason: 'unavailable' }
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE FINGERPRINT — "has the operator touched the carried menu?"
// A stable digest of what an operator can change through Manage and what commitMenu writes: categories, items, extras
// groups, their options and links. Ids, timestamps and stock counts are left out (they are not edits). Every value is
// normalised (`?? default`, Number(), sorted arrays) so the same menu read from Postgres or from a fixture gives the same
// string. Computed right after the carry-over and again whenever the review is about to be offered.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export async function menuFingerprint(supabase: SupabaseClient, truckId: string): Promise<string> {
  const [cats, items, groups] = await Promise.all([
    // `*`, not a named list: this is a DIGEST of the rows, not a capacity read (scripts/van-category-settings.cjs keeps
    // order-acceptance's category reads to one resolver; this one decides nothing about capacity).
    supabase.from('menu_categories').select('*').eq('truck_id', truckId),
    supabase.from('menu_items_db').select('id, name, description, price, category_id, is_available, is_active, allergens, allergens_verified, dietary_info, spiciness, sort_order, image_path, subcategory_id').eq('truck_id', truckId),
    supabase.from('modifier_groups').select('id, name, is_required, min_choices, max_choices, hide_name').eq('truck_id', truckId),
  ])
  const catRows = (cats.data ?? []) as any[]
  const itemRows = (items.data ?? []) as any[]
  const groupRows = (groups.data ?? []) as any[]
  const groupIds = groupRows.map(g => g.id)
  const itemIds = itemRows.map(i => i.id)
  const [opts, links] = await Promise.all([
    groupIds.length ? supabase.from('modifier_options').select('id, group_id, name, price_adjustment, available, is_active, sort_order').in('group_id', groupIds) : Promise.resolve({ data: [] as any[] }),
    itemIds.length ? supabase.from('item_modifier_groups').select('menu_item_id, group_id, excluded_option_ids').in('menu_item_id', itemIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const optRows = ((opts as any).data ?? []) as any[]
  const linkRows = ((links as any).data ?? []) as any[]
  const catName = new Map(catRows.map(c => [String(c.id), String(c.name ?? '')]))
  const groupName = new Map(groupRows.map(g => [String(g.id), String(g.name ?? '')]))
  const itemName = new Map(itemRows.map(i => [String(i.id), String(i.name ?? '')]))
  const optName = new Map(optRows.map(o => [String(o.id), String(o.name ?? '')]))
  const num = (v: unknown, d = 0) => (v == null || v === '' ? d : Number(v))
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).sort() : [])
  const sortBy = (xs: any[]) => xs.map(x => JSON.stringify(x)).sort()
  const shape = {
    c: sortBy(catRows.map(c => [c.name ?? '', c.is_active ?? true, num(c.prep_secs), num(c.batch_size), c.counts_toward_capacity ?? false, num(c.sort_order)])),
    i: sortBy(itemRows.map(i => [i.name ?? '', i.description ?? null, num(i.price), catName.get(String(i.category_id)) ?? null,
      i.is_available ?? true, i.is_active ?? true, arr(i.allergens), i.allergens_verified ?? false, arr(i.dietary_info),
      i.spiciness ?? null, num(i.sort_order), i.image_path ?? null, i.subcategory_id ?? null])),
    g: sortBy(groupRows.map(g => [g.name ?? '', g.is_required ?? false, num(g.min_choices), num(g.max_choices, 99), g.hide_name ?? false])),
    o: sortBy(optRows.map(o => [groupName.get(String(o.group_id)) ?? null, o.name ?? '', num(o.price_adjustment), o.available ?? true, o.is_active ?? true, num(o.sort_order)])),
    l: sortBy(linkRows.map(l => [itemName.get(String(l.menu_item_id)) ?? null, groupName.get(String(l.group_id)) ?? null,
      (Array.isArray(l.excluded_option_ids) ? l.excluded_option_ids : []).map((id: unknown) => optName.get(String(id)) ?? String(id)).sort()])),
  }
  // A short, stable digest (FNV-1a, 64-bit as two 32-bit halves) — no crypto import, so this runs anywhere the lib does.
  const text = JSON.stringify(shape)
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let k = 0; k < text.length; k++) {
    const ch = text.charCodeAt(k)
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ ch, 0x811c9dc5) >>> 0
  }
  return `v1:${itemRows.length}:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE REVIEW STATE — read and written by the TRUCK (Manage and the dashboard know the truck), on any device.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export type MenuReviewState =
  | { state: 'none' }                                    // no carried menu owes this truck a review
  | { state: 'closed'; status: 'reviewed' | 'dismissed' } // done with — never shown again
  | { state: 'offer'; extraction: unknown }              // untouched since carry-over: the usual offer + review, clear-first
  | { state: 'check' }                                   // edited by hand since: "check your menu", nothing re-committed

/** The most recent demo session whose menu was carried to `truckId`. */
async function carriedSessionFor(supabase: SupabaseClient, truckId: string) {
  const { data, error } = await supabase.from('demo_sessions')
    .select('truck_id, extraction, extraction_source, menu_carry_status, menu_carry_fingerprint, menu_review_status')
    .eq('menu_carry_truck_id', truckId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) { warn(`review state read failed for ${truckId}: ${error.message}`); return null }
  return data
}

export async function readMenuReview(supabase: SupabaseClient, truckId: string): Promise<MenuReviewState> {
  const s = await carriedSessionFor(supabase, truckId)
  if (!s) return { state: 'none' }
  if (s.menu_review_status === 'reviewed' || s.menu_review_status === 'dismissed') return { state: 'closed', status: s.menu_review_status }
  if (s.menu_review_status !== 'pending') return { state: 'none' }
  // Only while setup is unfinished — a finished truck is never handed a setup review.
  const { data: t } = await supabase.from('trucks').select('setup_step').eq('id', truckId).maybeSingle()
  if (!t || t.setup_step == null || t.setup_step === 'done') return { state: 'none' }
  // 🔴 Belt and braces: a sample menu is never offered, whatever the row says.
  if (s.extraction_source !== 'upload' || !s.extraction) return { state: 'none' }
  const now = await menuFingerprint(supabase, truckId)
  if (s.menu_carry_status === 'done') {
    return now === s.menu_carry_fingerprint ? { state: 'offer', extraction: s.extraction } : { state: 'check' }
  }
  // A carry-over that failed (or never finished) left the truck empty. Offer the review only while it still is: a menu
  // they have since built themselves is theirs, not the demo's, and is neither replaced nor "checked".
  const { count, data } = await supabase.from('menu_items_db').select('id', { count: 'exact', head: true }).eq('truck_id', truckId)
  const items = count ?? (Array.isArray(data) ? data.length : 0)
  return items === 0 ? { state: 'offer', extraction: s.extraction } : { state: 'none' }
}

/** Close the pending review for `truckId`. Only a PENDING review changes, so a repeat call is a no-op. */
export async function closeMenuReview(supabase: SupabaseClient, truckId: string, status: 'reviewed' | 'dismissed'): Promise<boolean> {
  const { data, error } = await supabase.from('demo_sessions')
    .update({ menu_review_status: status, menu_reviewed_at: new Date().toISOString() })
    .eq('menu_carry_truck_id', truckId).eq('menu_review_status', 'pending')
    .select('truck_id')
  if (error) { warn(`could not close the review for ${truckId} (${status}): ${error.message}`); return false }
  const changed = Array.isArray(data) && data.length > 0
  if (changed) log(`review ${status} for ${truckId}`)
  return changed
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE LOGO — the one other thing a demo can hold that is the truck's own (demo-claim-2 step 2, docs/demo-claim-2-report.md)
// Only a BRANDED (outreach) demo has one: lib/demo-logo.ts gives it the business's own logo, in truck-media. A landing
// demo has none, and the sign-up modal's own logo upload (written after create_truck, in the same browser) still wins,
// because this runs first and only fills a truck that has NO logo. The object is COPIED into the real truck's own folder
// (the `<truck.id>/<timestamp>-<name>` shape every upload uses), never pointed at: the demo, its folder and the
// discovery row's object can all go without taking the real truck's logo with them. Best-effort, never throws.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export async function carryClaimedDemoLogo(supabase: SupabaseClient, operatorId: string, truck: { id: string }): Promise<string | null> {
  try {
    const { data: session } = await supabase.from('demo_sessions').select('truck_id')
      .eq('claimed_by_operator_id', operatorId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!session) return null
    const [{ data: demo }, { data: real }] = await Promise.all([
      supabase.from('trucks').select('logo_storage_path').eq('id', session.truck_id).maybeSingle(),
      supabase.from('trucks').select('logo_storage_path, setup_step').eq('id', truck.id).maybeSingle(),
    ])
    const from = typeof demo?.logo_storage_path === 'string' ? demo.logo_storage_path : null
    if (!from || !real || real.logo_storage_path || real.setup_step == null || real.setup_step === 'done') return null
    const name = (from.split('/').pop() || 'logo').replace(/^\d+-/, '')
    const to = `${truck.id}/${Date.now()}-${name}`
    const { error: cErr } = await supabase.storage.from('truck-media').copy(from, to)
    if (cErr) { warn(`logo copy ${from} → ${to} failed: ${cErr.message}`); return null }
    const { error: uErr } = await supabase.from('trucks').update({ logo_storage_path: to }).eq('id', truck.id).is('logo_storage_path', null)
    if (uErr) { warn(`logo write for ${truck.id} failed: ${uErr.message}`); return null }
    log(`logo carried ${session.truck_id} → ${truck.id}`)
    return to
  } catch (e) {
    warn(`logo carry for ${truck.id} threw: ${e instanceof Error ? e.message : e}`)
    return null
  }
}
