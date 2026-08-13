'use client'
// app/manage/[token]/page.tsx
// Truck management page — menu, modifiers, deals, schedule, settings

import { useState, useEffect, useCallback, useMemo, use, useRef, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { PLAN_META, canAccess, maxVans } from '@/lib/features'
import { OFFLINE_PROTECTION_EXPLAINER_LEAD, OFFLINE_PROTECTION_EXPLAINER_BODY, OFFLINE_PROTECTION_REMINDER } from '@/lib/copy/offlineProtection'
import { DEFAULT_STOCK_SCOPE_NOTE } from '@/lib/copy/stock'
import { minRequiredForGroup, sortGroupsRequiredFirst, groupRuleLabel } from '@/lib/modifier-rules'
import { useToasts, type ShowToast } from '@/lib/useToasts'
import { ToastStack } from '@/components/ToastStack'
import { isValidEmail, isValidUKPhone } from '@/lib/contact-validation'
import { PricingPolicyProvider, usePriceMask, usePricesVisible } from '@/components/PricingPolicy'
import { purchaseCtaAllowed } from '@/lib/commerce-policy'
import { DeleteAccountSection } from '@/components/manage/DeleteAccountSection'
import { PaymentsTab } from '@/components/manage/PaymentsTab'
// (No lib/legal import here by design — this page carries no legal links. They live in the account
//  dropdown, components/dashboard/UserMenu.tsx, which every role reaches. See the note at the foot of
//  SettingsTab, and lib/legal.ts for the surface list. If a link is ever added to this page, import the
//  routes from lib/legal.ts — never type them inline.)
import type { Plan, Feature } from '@/lib/features'
import { PLAN_PRICES, PLAN_DESCRIPTIONS, TRANSACTION_ROWS, FEATURE_SECTIONS, FOOTNOTES } from '@/lib/plan-features'
import { FeatureGate } from '@/components/FeatureGate'
import { KITCHEN_CAPACITY_DESC, KITCHEN_CAPACITY_EXAMPLE, KITCHEN_CAPACITY_NO_LIMIT, KITCHEN_CAPACITY_WARNING, KITCHEN_CAPACITY_GRID, kitchenCapacityNeedsPrepWarning, formatPrepSecs } from '@/lib/kitchen-capacity'
import { PrepTimeSelect } from '@/components/PrepTimeSelect'
import { describePreorderDeadline } from '@/lib/preorder'
import { groupBySubcategory } from '@/lib/basket-utils'
import type { TruckEvent } from '@/components/dashboard/types'
import { Tooltip } from '@/components/ui/Tooltip'
import { operatorSignOut } from '@/lib/native/signOut'
import { nativeAuthHeader } from '@/lib/native/session'   // native app sends its Bearer; {} on web (cookie path unchanged)
import { AppLink } from '@/components/native/AppLink'   // internal-route anchor: soft-nav in native, plain <a> on web
import { useDragDrop } from '@/lib/useDragDrop'
import { MenuUploadFields } from '@/components/menu/MenuUploadFields'
import { formatTime, getLocalDateInTz } from '@/lib/time-utils'
import { matchCardEntries, mergeAllergensUnion, cardEntryKey, type CardEntry, type DishRef, type CardMatchResult } from '@/lib/allergen-card-match'
import { isExcluded } from '@/lib/schedule-extract'
import { detectEventConflicts } from '@/lib/event-conflicts'
import UserMenu from '@/components/dashboard/UserMenu'
import { SpiceLevel } from '@/components/SpiceLevel'
import AppHeader from '@/components/shared/AppHeader'
import { configureStatusBar } from '@/lib/native/statusBar'
import { Spinner, Badge, Btn, Input, Card, EmptyState, AllergenToggles, DietaryToggles, AllergenModeChooser, OptionCardChooser, ALLERGEN_VOCAB, DIETARY_VOCAB } from '@/components/manage/primitives'
import { AllergenChip, DietaryChip } from '@/components/MenuAllergenChips'
import ExtrasEditor from '@/components/manage/ExtrasEditor'
import { BatchSizeSelect } from '@/components/manage/KitchenCapacityEdit'
import { KitchenCapacityCategoryRow } from '@/components/manage/KitchenCapacityCategoryRow'
import { SUBCARD_HEADING } from '@/lib/ui-tokens'
import { BUZZER_MAX_COUNT, BUZZER_DEFAULT_COUNT } from '@/lib/buzzer'
import { normaliseUrl, isScraperBlockedDomain } from '@/lib/url-normalise'
import { SETTING_COPY, TRIAL_NOT_STARTED_BY_EVENTS, TRIAL_NOT_STARTED_HEADING, TRIAL_NOT_STARTED_BILLING } from '@/lib/settings-copy'
import { Walkthrough } from '@/components/manage/Walkthrough'
import { WALKTHROUGH_STOPS, WALKTHROUGH_INTRO, readWalkthroughState, writeWalkthroughState, type WalkthroughState } from '@/lib/walkthrough'
import { VanFilter, matchesVanFilter, vanFilterLabel, vanFilterFilenameSuffix, VAN_FILTER_ALL, type VanFilterValue } from '@/components/manage/VanFilter'
import { HATCHGRAB_LOGO_PNG } from '@/lib/brand'

// ── Types ─────────────────────────────────────────────────────
interface Truck { id: string; name: string; slug: string | null; description: string | null; cuisine_type: string | null; logo_storage_path: string | null; logo: string | null; contact_email: string | null; contact_phone: string | null; social_instagram: string | null; social_facebook: string | null; website: string | null; whatsapp: string | null; phone_is_whatsapp: boolean; auto_accept: boolean; truck_order_email_enabled: boolean; dashboard_token: string; crew_mode: 'solo' | 'full'; kds_mode: boolean; keep_screen_on: boolean; plan: Plan; feature_overrides: Record<string, boolean> | null; trial_expires_at: string | null; hide_pricing?: boolean; whatsapp_sender: string | null; allergen_info_url: string | null; allergen_info_text: string | null; allergen_display_mode?: 'per_dish' | 'card' | 'both' | null; preferred_contact_method: string | null; allow_customer_cancellation: boolean; cancellation_cutoff_mins: number; default_auto_open: boolean; default_auto_close: boolean; qr_code_style?: 'standard' | 'branded'; truck_emoji?: string; scraper_preference?: 'auto' | 'manual' | 'both'; schedule_url?: string | null; preorders_enabled?: boolean; preorder_deadline_type?: 'hours_before' | 'daily_cutoff' | null; preorder_deadline_value?: number | null; preorder_past_action?: 'sold_out' | 'force_pending' | null; preorder_open_rule?: string | null; setup_step?: string | null; show_paid_step?: boolean; takes_cash?: boolean; completion_presses?: 'one' | 'two' | null }
interface Category { id: string; name: string; slug: string; prep_secs: number; batch_size: number; allow_notes: boolean; default_stock: number | null; sort_order: number; is_active: boolean; counts_toward_capacity?: boolean }
interface Item { id: string; name: string; description: string | null; price: number; category_id: string | null; subcategory_id?: string | null; subcategory?: string | null; is_available: boolean; stock_count: number | null; default_stock: number | null; sort_order: number; image_path: string | null; allergens: string[]; allergens_verified?: boolean; dietary_info: string[]; spiciness: number | null; auto_accept: boolean; preorder_enabled?: boolean | null; preorder_deadline_type?: 'hours_before' | 'daily_cutoff' | null; preorder_deadline_value?: number | null; preorder_past_action?: 'sold_out' | 'force_pending' | null }
interface Subcategory { id: string; category_id: string; name: string; sort_order: number }
interface ModifierGroup { id: string; name: string; is_required: boolean; min_choices: number; max_choices: number }
interface ModifierOption { id: string; group_id: string; name: string; price_adjustment: number; type: string; sort_order: number; allergens?: string[]; dietary_info?: string[]; available?: boolean; stock_count?: number | null }
interface Bundle { id: string; name: string; description: string | null; bundle_price: number; original_price: number | null; is_available: boolean; apply_to_new_events: boolean; start_time: string | null; end_time: string | null; slot_1_category: string | null; slot_2_category: string | null; slot_3_category: string | null; slot_4_category: string | null; slot_5_category: string | null; slot_6_category: string | null; stock_warning?: string | null }
interface Van { id: string; truck_id: string; name: string; kds_token: string; active: boolean; auto_pause_on_offline: boolean; show_cooking_step: boolean; order_ready_enabled: boolean; kitchen_capacity: number | null; capacity_window_mins?: number | null; buzzer_count?: number | null }
interface UpsellRule { id: string; trigger_category: string; suggest_category: string; max_suggestions: number; show_at_checkout: boolean }
interface TeamMember { id: string; email: string; name: string | null; role: 'owner' | 'manager' | 'staff'; accepted_at: string | null; auth_user_id: string | null; van_names?: string[] }

type Tab = 'menu' | 'modifiers' | 'deals' | 'reports' | 'schedule' | 'team' | 'settings' | 'payments' | 'billing'
type UserRole = 'owner' | 'manager' | 'staff'

// ── Helpers ────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

// ── N2: SCHEDULE-VERIFY MESSAGES, DEFINED ONCE ───────────────────────────────────────────────────────
// 🔴 THIS MAP WAS WRITTEN OUT TWICE, VERBATIM — once in the setup wizard's Route A and once in
// Settings' handleVerifyUrl. Two copies of five strings is five chances for the two surfaces to tell an
// operator different things about the same failure. One definition, both readers.
//
// The cases are deliberately separated by WHAT ACTUALLY HAPPENED, which is the fix N2 asks for:
//   malformed   — nothing was fetched. The address never parsed, so blaming the network is a lie.
//   unreachable — a real fetch failed: DNS, connection, certificate.
//   blocked     — the site answered and refused us.
//   no_content  — we loaded it and got nothing readable.
//   no_events   — we read it fine; the thing we were looking for was not on it.
const URL_MALFORMED_MSG = "That doesn't look like a web address. Try something like yourtruck.co.uk/events"
const VERIFY_MESSAGES: Record<string, string> = {
  malformed:     URL_MALFORMED_MSG,
  launch_failed: "Verification is temporarily unavailable. Please try again in a moment.",
  blocked:       "We couldn't access this site — it may be blocking automated checks. Try the page that lists your schedule, or add events manually.",
  unreachable:   "We couldn't reach this website. It may be down, or the address may be wrong.",
  no_content:    "We reached this page but couldn't read anything on it. Check it's publicly accessible.",
  no_events:     "We couldn't find any upcoming events on this page. Make sure the URL points directly to where your schedule is listed.",
}
function imgUrl(path: string | null) {
  if (!path) return null
  return `${SUPABASE_URL}/storage/v1/object/public/truck-media/${path}`
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ── Small UI components ────────────────────────────────────────
// Spinner / Badge / Btn / Input / Card / EmptyState + the allergen/dietary toggles now live in
// @/components/manage/primitives (imported above) so the manage page and <ExtrasEditor> share ONE
// definition. Usages below are unchanged.
// `disabled` is OPTIONAL and defaults to undefined, so every existing call site is unchanged. Added for
// the cash toggle, which must render visibly disabled (not hidden) when the separate paid step is off.
function Toggle({ on, onToggle, label, disabled }: { on: boolean; onToggle: () => void; label?: string; disabled?: boolean }) {
  return (
    <button onClick={onToggle} disabled={disabled} className="flex items-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed">
      <div className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-green-500' : 'bg-slate-300'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </div>
      {label && <span className="text-sm text-slate-600 font-medium group-hover:text-slate-900">{label}</span>}
    </button>
  )
}
const FOOD_EMOJI_CATEGORIES = [
  {
    label: 'Street food & fast food',
    emojis: ['🍕', '🍔', '🌮', '🌯', '🥙', '🌭', '🥪', '🍟', '🧆', '🫔', '🥡'],
  },
  {
    label: 'Meat & protein',
    emojis: ['🥩', '🍖', '🍗', '🥓', '🍳', '🥚', '🧀'],
  },
  {
    label: 'Fish & seafood',
    emojis: ['🐟', '🦐', '🦞', '🦀', '🦑', '🦪', '🍤'],
  },
  {
    label: 'World cuisine',
    emojis: ['🍜', '🍝', '🍛', '🍲', '🥘', '🫕', '🍱', '🍣', '🥟', '🍙', '🍚', '🍥', '🥮', '🍢', '🍡'],
  },
  {
    label: 'Bread & breakfast',
    emojis: ['🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🧇', '🥞', '🧈'],
  },
  {
    label: 'Sweet & dessert',
    emojis: ['🍰', '🎂', '🧁', '🍩', '🍪', '🍫', '🍬', '🍭', '🍮', '🍦', '🍨', '🍧', '🥧', '🍿'],
  },
  {
    label: 'Fruit & veg',
    emojis: ['🥗', '🌽', '🥦', '🥕', '🍅', '🫛', '🥬', '🥔', '🍠', '🧄', '🧅', '🍄', '🫒', '🥑', '🌶️', '🥜'],
  },
  {
    label: 'Drinks',
    emojis: ['☕', '🍵', '🫖', '🧃', '🥤', '🧋', '🥛', '🍺', '🥂', '🍷', '🥃', '🍹', '🧉', '🍾'],
  },
  {
    label: 'Utensils & dining',
    emojis: ['🍽️', '🍴', '🥢', '🥄', '🔪', '🫙', '🧂'],
  },
  {
    label: 'Truck & vibe',
    emojis: ['🚚', '🔥', '⭐', '✨', '🏆', '👨‍🍳', '🧑‍🍳', '🎪'],
  },
]

// ── Main page ──────────────────────────────────────────────────
export default function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('menu')
  const [allergenWizardOpen, setAllergenWizardOpen] = useState(false)   // Slice-3 allergen wizard overlay (lives in MenuTab)
  const [pendingVerifyEvents, setPendingVerifyEvents] = useState<any[] | null>(null)
  // ── T1: ONE TRIGGER, TWO CALLERS, AND A COMPLETION CALLBACK ONLY THE WIZARD SUPPLIES ─────────────
  // The editable "Events found on your website" modal lives in ScheduleTab and opens on
  // pendingVerifyEvents. Settings has always fed it; the setup wizard now feeds the SAME modal instead
  // of its own read-only list. No UI was copied — only the trigger is shared.
  //
  // 🔴 WHY BOTH CALLERS GO THROUGH ONE HANDLER RATHER THAN SETTINGS KEEPING setPendingVerifyEvents:
  // the callback has to be CLEARED, not just set. If Settings wrote pendingVerifyEvents directly, a
  // callback left over from a wizard run would still be sitting here — and a LATER Settings import,
  // months after setup, would call goToSettingsReview() and reopen the wizard's review step over a live
  // truck. Setting it on every trigger makes that unreachable rather than unlikely.
  const [afterEventsSaved, setAfterEventsSaved] = useState<(() => void) | null>(null)
  const handleVerifiedEvents = (events: unknown[], onSaved?: () => void) => {
    // The updater form is required: a bare setState(fn) would treat the function as an updater.
    setAfterEventsSaved(() => onSaved ?? null)
    setPendingVerifyEvents(events)
  }
  const [showTrialReminder, setShowTrialReminder] = useState(false)
  const [userRole, setUserRole] = useState<UserRole>('owner')
  const [truck, setTruck] = useState<Truck | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([])
  const [modifierOptions, setModifierOptions] = useState<ModifierOption[]>([])
  const [categoryModGroups, setCategoryModGroups] = useState<{category_id:string;group_id:string}[]>([])
  // Stage B: per-item modifier-group links (menu_item_id, group_id) — sole resolution source.
  const [itemModGroups, setItemModGroups] = useState<{menu_item_id:string;group_id:string;excluded_option_ids?:string[]}[]>([])
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [upsellRules, setUpsellRules] = useState<UpsellRule[]>([])
  const [loading, setLoading] = useState(true)
  // Shared stacked, action-capable toast system (lib/useToasts) — replaces the old single Toast. The
  // showToast signature (msg,type,opts?) is back-compatible with every existing (msg)/(msg,type) caller
  // and is threaded as a prop to the tabs (ScheduleTab's reject-undo uses opts.action).
  const { toasts, showToast, dismissToast } = useToasts()
  const [currentUserName, setCurrentUserName] = useState<string | null>(null)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [currentUserFirstName, setCurrentUserFirstName] = useState<string | null>(null)
  const [currentUserLastName, setCurrentUserLastName] = useState<string | null>(null)
  const [currentUserPhone, setCurrentUserPhone] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  // The truck's ACTUAL owner (trucks.operator_id → operators), so the Team owner row shows the
  // real owner rather than the session viewer. ownerAuthUserId drives the conditional "(you)".
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null)
  const [ownerAuthUserId, setOwnerAuthUserId] = useState<string | null>(null)
  const [pendingEmailChange, setPendingEmailChange] = useState<{ id: string; new_email: string; requested_at: string; expired_at: string } | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [editProfileName, setEditProfileName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  // Pending scraper-approval count → Schedule nav badge + "events to approve" banner.
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)
  // Banner is dismissible per-session but REAPPEARS when the count rises above the dismissed level
  // (i.e. new events arrived) — not dismissed-forever.
  const [bannerDismissedAtCount, setBannerDismissedAtCount] = useState<number | null>(null)
  // ── 🔴 STRIPE REQUIREMENTS → Payments nav badge + banner. SAME PATTERN AS THE TWO ABOVE. ─────────
  // A SERVER-SIDE boolean from `requirements.currently_due` / `past_due` / `disabled_reason`, fetched
  // once on mount exactly like pendingApprovalCount. It is NOT fed by Stripe's notification banner:
  // that banner lives inside an iframe that only exists on the Payments tab, so a cross-tab badge fed
  // by it would be silent precisely when the operator is on another tab — see lib/stripe/connect.ts
  // readAccountRequirements for the full reasoning. Do not reintroduce onNotificationsChange here.
  const [stripeActionRequired, setStripeActionRequired] = useState(false)
  const [stripeBannerDismissed, setStripeBannerDismissed] = useState(false)

  // ── K3/K4: THE WALKTHROUGH ────────────────────────────────────────────────────────────────────────
  // 🔴 THERE IS NO AUTO-OPEN PATH, AND THAT IS THE GUARANTEE. `walkthroughOpen` starts false and is only
  // ever set true by a click — the wizard's done screen (K2), the reminder strip below, or Settings →
  // Show me around (K4). No effect reads the stored state and opens anything. So an operator with no
  // localStorage key — every existing operator, Gusto and RTF included — sees nothing at all.
  const [walkthroughOpen, setWalkthroughOpen] = useState(false)
  // Read AFTER mount, never in a lazy initialiser: this page is server-rendered and localStorage does not
  // exist during that pass, so seeding from it would hydrate-mismatch. Starting null also means the strip
  // cannot flash before the real value arrives.
  const [walkthroughState, setWalkthroughStateLocal] = useState<WalkthroughState>(null)
  // localStorage does not exist during the server pass, so reading it in a lazy initialiser would
  // hydrate-mismatch. Post-mount is the only correct place, and one extra render of a strip that starts
  // hidden is the intended cost.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setWalkthroughStateLocal(readWalkthroughState(token)) }, [token])
  // Closing by ANY route — Done, Skip, Escape, click-outside — counts as completing it (K3).
  const closeWalkthrough = () => {
    setWalkthroughOpen(false)
    writeWalkthroughState(token, 'seen')
    setWalkthroughStateLocal('seen')
  }
  const openWalkthrough = () => setWalkthroughOpen(true)
  // K2: the done screen's three choices, resolved HERE so the page stays the single owner of the stored
  // state — MenuTab never writes localStorage itself and so cannot drift from the strip's condition.
  // 'now' stores nothing yet: closing the tour is what stores 'seen', so an operator who opens it and
  // immediately Escapes is still recorded as done rather than being offered it forever.
  const handleWalkthroughChoice = (choice: 'now' | 'later' | 'never') => {
    if (choice === 'now') { setWalkthroughOpen(true); return }
    const next: Exclude<WalkthroughState, null> = choice === 'later' ? 'remind' : 'seen'
    writeWalkthroughState(token, next)
    setWalkthroughStateLocal(next)
  }
  // 🔴 `=== 'remind'`, NOT `!== 'seen'`. The inverted test would render this strip for everyone who has
  // never interacted — i.e. every live operator — which is exactly what K4 forbids.
  // Also gated on setup being finished: mid-wizard the overlay is on top anyway and the offer belongs
  // on the done screen, not behind it.
  const showWalkthroughStrip = walkthroughState === 'remind'
    && !(truck?.setup_step != null && truck.setup_step !== 'done')
  const showApprovalBanner = pendingApprovalCount > 0 &&
    (bannerDismissedAtCount === null || pendingApprovalCount > bannerDismissedAtCount)

  // Allergen-verification warning: true when ANY menu item is unverified (allergens_verified === false —
  // e.g. AI-detected on import, not yet human-confirmed). While true, customers can't see that item's
  // allergen info (hidden server-side) + see an "ask staff" notice; this drives the 3-place operator nudge
  // (top banner, (!) on the Menu tab, Menu-tab header). Strict === false → legacy/null items don't trigger.
  // CARD-mode suppression: in card mode the per-dish unverified count is irrelevant (the card supplies the
  // allergen info), so these CROSS-TAB nudges (banner + Menu (!) badge) must stay quiet in card mode —
  // REGARDLESS of whether a card is saved yet. The "Review each dish's allergens" CTA is wrong for card
  // mode; the Menu-tab box owns the correct card-mode CTA ("add an allergen card" when none is saved).
  // Mirrors the customer per-dish gate (menu route :438, plain `!== 'card'`). PER-DISH mode is unchanged.
  const cardModeSetUp = (truck as any)?.allergen_display_mode === 'card'
  const allergensUnverified = !cardModeSetUp && items.some(i => (i as any).allergens_verified === false)


  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/manage?token=${token}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTruck(data.truck)
      setUserRole(data.userRole || 'owner')
      setCurrentUserId(data.currentUserId || null)
      setOwnerEmail(data.ownerEmail || null)
      setOwnerAuthUserId(data.ownerAuthUserId || null)
      setCategories(data.categories)
      setItems(data.items)
      setSubcategories(data.subcategories || [])
      setModifierGroups(data.modifierGroups)
      setModifierOptions(data.modifierOptions)
      setCategoryModGroups(data.categoryModGroups)
      setItemModGroups(data.itemModGroups || [])
      setBundles(data.bundles)
      setUpsellRules(data.upsellRules || [])
      setPendingEmailChange(data.pendingEmailChange || null)
    } catch (e: any) { showToast(e.message || 'Failed to load', 'error') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { load() }, [load])
  // Native: overlay the WebView under the status bar here too (not only the cold-launch /app call), so the
  // AppHeader fills the status-bar strip with no empty band. Self-guards native → no-op on web.
  useEffect(() => { void configureStatusBar() }, [])

  // Keep the truck's van(s) alive while the operator is on Manage — mirrors the dashboard/KDS
  // heartbeat (every 15s → /api/heartbeat) so a dashboard→Manage switch doesn't stop the only
  // heartbeat and trigger a FALSE offline-pause (the device is still online; orders still land).
  // No vanId → the route's no-vanId path stamps THIS truck's active vans (Manage's URL token IS the
  // dashboard_token). UNGATED on live-event (Manage isn't event-scoped) — harmless, the monitor only
  // pauses status='open' events, so heartbeating with no live event keeps the van fresh and pauses
  // nothing. navigator.onLine guard so a GENUINE connectivity loss on Manage still lets the van pause
  // (protection intact) — we only suppress the false positive from a same-device screen switch.
  // Single-van/single-truck fix; per-van attendance scoping is a logged backlog item.
  useEffect(() => {
    const sendHeartbeat = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      try {
        await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
      } catch {}
    }
    sendHeartbeat() // immediate ping on arriving at Manage (close the gap after the dashboard unmounts)
    const id = setInterval(sendHeartbeat, 15000)
    return () => clearInterval(id)
  }, [token])

  // Fetch the pending scraper-approval count on load so the badge/banner show without opening
  // Schedule. ScheduleTab keeps it live via onPendingCount after approve/reject. Upcoming only
  // (end not passed), source=scraper, status=unconfirmed — mirrors the Schedule "Needs approval" list.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/events/manage?token=${token}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !Array.isArray(d?.events)) return
        const now = new Date()
        const n = d.events.filter((e: any) =>
          e.status === 'unconfirmed' && e.source === 'scraper' &&
          (e.end_time ? now < new Date(`${e.event_date}T${e.end_time}`) : new Date(`${e.event_date}T23:59`) >= now)
        ).length
        setPendingApprovalCount(n)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [token])

  // ── 🔴 STRIPE REQUIREMENTS, ON MOUNT — the Payments badge's only source ─────────────────────────
  // Mirrors the pending-approval fetch above: one request on load, state set when it lands, badge and
  // banner derived from it. Nothing blocks on it and a failure leaves the badge simply absent.
  // ⚠️ THE ROUTE IS OWNER-ONLY AND SO IS THE PAYMENTS TAB, so a 403 here is the correct, expected
  // answer for a manager — they never see the tab, so they never need the badge. Swallowed silently.
  // ⚠️ It short-circuits server-side for a truck with no connected account, so this costs nothing for
  // the eleven trucks that have not connected.
  useEffect(() => {
    let cancelled = false
    fetch('/api/stripe/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'requirements' }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setStripeActionRequired(d.actionRequired === true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [token])

  // Read ?tab= query param on mount and activate that tab
  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab') as Tab | null
    const allTabIds: Tab[] = ['menu', 'modifiers', 'deals', 'reports', 'schedule', 'team', 'settings', 'payments', 'billing']
    if (tabParam && allTabIds.includes(tabParam)) setActiveTab(tabParam)
  }, [])

  // ── ?verify= — the signup confirmation outcome, surfaced here (A2) ────────────────────────────────
  // /api/auth/verify-signup now lands an operator who ALREADY has a truck on this page instead of on
  // /setup, so the outcome it used to report there has to be reported here. Same three statuses, same
  // meanings; /setup keeps its own copy of the banner for the no-truck case.
  // ⚠️ 'invalid' now gets a message on BOTH surfaces. It previously rendered NOTHING on /setup, so a
  // dead or malformed link looked like a normal page load and the operator was told nothing at all.
  //
  // 🔴 INERT WITHOUT THE PARAM. The whole effect early-returns when ?verify= is absent, which is every
  // page load for an existing operator — so Gusto and RTF never reach the toast or the URL rewrite.
  // Runs once on mount (empty deps): a remount cannot repeat it because the param is stripped below.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const verify = params.get('verify')
    if (!verify) return
    // ⚠️ NO RESEND IS PROMISED. There is no resend path for SIGNUP verification —
    // /api/auth/resend-verification reads `operator_email_changes`, the email-CHANGE table, which is a
    // different one. The earlier "we'll send you a fresh one" named a mechanism that does not exist.
    if (verify === 'ok') showToast('Email confirmed — thank you.', 'success')
    else if (verify === 'expired') showToast('That confirmation link has expired. Get in touch and we’ll sort it before you go live.', 'error')
    else showToast('That confirmation link didn’t work. Get in touch and we’ll sort it before you go live.', 'error')
    // Strip it once consumed so a reload or a remount cannot repeat the toast. replaceState, not a
    // router navigation: this is an address-bar rewrite with no re-render and no refetch.
    // ⚠️ Deliberately touches ONLY `verify` — ?import=demo and ?tab= are left exactly as they are.
    params.delete('verify')
    const qs = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Trial accounts default to billing tab on every page load
  // 🔴 NOT ON iOS (App Store 3.1.1/3.1.3) — opening straight onto the plan-and-upgrade surface is the
  // strongest purchase steer in the product. The tab stays REACHABLE on iOS (its matrix is permitted
  // information); it simply is not opened for them. Web and Android are byte-identical to before.
  // ⚠️ Dependency array deliberately unchanged — see the backlog; it is a separate known issue.
  useEffect(() => {
    if (truck?.plan === 'trial' && purchaseCtaAllowed()) setActiveTab('billing')
  }, [truck?.id])

  // Trial reminder popup — only within the final 2 months of the trial, then once per day.
  // Previously it appeared on every login regardless of how far out the trial end was (no
  // window gate) — e.g. ~2.4 months out. Now it stays hidden until now >= trial_end − 2 months
  // (Test Kitchen trial ends 23 Aug 2026 → shows from ~23 Jun 2026). The daily-dismiss
  // localStorage behaviour is kept on top (closing it won't re-show until the next day).
  // 🔴 SUPPRESSED ENTIRELY ON iOS (App Store 3.1.1/3.1.3). Gated here at the TRIGGER, not only at the
  // render, so the localStorage write never happens either — otherwise `hg_trial_reminder_shown` would be
  // stamped for a popup the operator never saw, and the day they opened the web dashboard instead it would
  // stay silent. A suppressed prompt must not consume its own once-per-day budget.
  useEffect(() => {
    if (!purchaseCtaAllowed()) return
    if (truck?.plan !== 'trial') return
    if (!truck.trial_expires_at) return
    const windowStart = new Date(truck.trial_expires_at)
    windowStart.setMonth(windowStart.getMonth() - 2)   // 2 months before trial end
    if (new Date() < windowStart) return                // too early — don't nag yet
    const key = 'hg_trial_reminder_shown'
    const lastShown = localStorage.getItem(key)
    const today = new Date().toDateString()
    if (lastShown !== today) {
      setShowTrialReminder(true)
      localStorage.setItem(key, today)
    }
  }, [truck?.plan, truck?.trial_expires_at])

  // Staff have no business on the manage page — send them to the dashboard
  useEffect(() => {
    if (userRole === 'staff') router.replace(`/dashboard/${token}`)
  }, [userRole, token, router])

  useEffect(() => {
    // Native app sends its Bearer so /api/auth/me resolves is_admin (+ identity) without a cookie → the
    // Admin link appears in the manage UserMenu too. Web: nativeAuthHeader() returns {} → cookie path unchanged.
    nativeAuthHeader().then(h => fetch('/api/auth/me', { headers: h })).then(r => r.json()).then(d => {
      setCurrentUserName(d.name ?? null)
      setCurrentUserEmail(d.email ?? null)
      setCurrentUserFirstName(d.first_name ?? null)
      setCurrentUserLastName(d.last_name ?? null)
      setCurrentUserPhone(d.phone ?? null)
      if (d.is_admin) setIsAdmin(true)
    }).catch(() => null)
  }, [])

  const handleSignOut = async () => {
    // Native-aware: app clears the native session + soft-routes in-app; web unchanged (cookie + hard nav).
    await operatorSignOut(router)
  }

  const saveProfile = async () => {
    if (!editProfileName.trim()) return
    setSavingProfile(true)
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
        body: JSON.stringify({ name: editProfileName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCurrentUserName(data.name)
      setShowProfileModal(false)
      showToast('Profile updated')
    } catch (e: any) {
      showToast(e.message || 'Failed to save', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  const api = async (action: string, extra: Record<string, any> = {}) => {
    const res = await fetch('/api/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action, ...extra }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed')
    return data
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3"><Spinner /><p className="text-slate-400 text-sm">Loading management console...</p></div>
    </div>
  )

  if (!truck) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-red-500 font-bold">Invalid or expired token</p>
    </div>
  )

  const allTabs: { id: Tab; label: string; icon: string; roles: UserRole[] }[] = [
    { id: 'menu',      label: 'Menu',      icon: truck?.truck_emoji || '🍕', roles: ['owner', 'manager'] },
    { id: 'schedule',  label: 'Schedule',  icon: '📅', roles: ['owner', 'manager'] },
    { id: 'deals',     label: 'Deals',     icon: '🎁', roles: ['owner', 'manager'] },
    { id: 'modifiers', label: 'Extras & Upsells', icon: '⚡', roles: ['owner', 'manager'] },
    { id: 'reports',   label: 'Reports',   icon: '📊', roles: ['owner', 'manager'] },
    { id: 'team',      label: 'Team',      icon: '👥', roles: ['owner', 'manager'] },
    { id: 'settings',  label: 'Settings',  icon: '🔧', roles: ['owner', 'manager'] },
    // 🔴 PAYMENTS — OWNER ONLY, AND IT MUST NOT INHERIT BILLING'S EXCLUSION.
    // The filter below carries `if (t.id === 'billing') return userRole === 'owner' && truck?.plan !== 'tester'`.
    // That rule is keyed on the ID `'billing'`, so this tab does NOT get the `plan !== 'tester'` test and
    // falls through to the generic `t.roles.includes(userRole)` arm — owner-only, every plan, tester
    // included. That is intended: a tester truck still needs to reach Connect onboarding.
    { id: 'payments',  label: 'Payments',  icon: '💷', roles: ['owner'] },
    { id: 'billing',   label: 'Billing',   icon: '💳', roles: ['owner'] },
  ]
  const tabs = allTabs.filter(t => {
    if (t.id === 'billing') return userRole === 'owner' && truck?.plan !== 'tester'
    return t.roles.includes(userRole)
  })

  // 🔴 ONE PROVIDER FOR THE WHOLE OPERATOR SURFACE. Wrapped here, at the highest point `truck` is
  // available, so BillingTab (17 price renders) and FeatureGate (a shared component with no truck
  // prop) both read the same policy without either being handed a boolean. A price added anywhere
  // below is masked correctly by default — see components/PricingPolicy.tsx for why that is the
  // whole point rather than a convenience.
  // ⚠️ `?? false` — an ABSENT column (pre-migration) means "follow the global flag", i.e. today's
  // behaviour. Not `?? true`; that default belongs to the context, for a different question.
  return (
    <PricingPolicyProvider hidePricing={truck.hide_pricing ?? false}>
    <div className="bg-slate-50 h-dvh flex flex-col overflow-hidden">{/* App-shell (KDS flex pattern): fixed-viewport column, bars are shrink-0, only <main> scrolls — keeps the header+tabs locked in the iPad WKWebView where stacked position:sticky-against-body-scroll was unreliable. Matches the dashboard. */}
      {/* Header */}
      {/* sticky={false}: this header is a shrink-0 flex child of an h-dvh overflow-hidden shell, so
          position:sticky can never apply an offset here — the root never scrolls and <main> is a SIBLING,
          not an ancestor. It becomes `relative`, keeping z-50 and the stacking context while dropping
          WebKit's sticky compositing hint. See AppHeader and docs/native-shell-report.md. */}
      <AppHeader
        sticky={false}
        truckName={truck.name}
        truckLogoUrl={truck.logo ?? null}
        subtitle="Management console"
      >
        <AppLink href={`/dashboard/${token}`}
          className="text-xs text-slate-400 hover:text-orange-400 font-bold transition-colors hidden sm:block">
          ← Orders dashboard
        </AppLink>
        <UserMenu
          operatorName={currentUserName || currentUserFirstName || ''}
          userEmail={currentUserEmail}
          token={token}
          showDashboardLink
          isAdmin={isAdmin}
        />
      </AppHeader>
      {/* Tabs — bg-slate-900 must match HEADER_BG in lib/brand.ts.
          Non-scrolling shrink-0 flex child (not sticky) → locked on every tab/browser incl. iPad WKWebView.
          overflow-x-auto stays on the inner row for narrow-width horizontal tab scroll. */}
      <div className="bg-slate-900 border-b border-slate-700 shrink-0 z-40">
        <div className={"w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto px-4 flex gap-1 overflow-x-auto"}>
          {tabs.map(t => (
            // K3: `data-tab-id` is the walkthrough's ANCHOR. It is a stable identifier, not a position —
            // the tour resolves `[data-tab-id="settings"]` at open time, so this bar can be reordered,
            // role-filtered or extended without touching lib/walkthrough.ts. Do not remove it.
            <button key={t.id} data-tab-id={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${activeTab === t.id ? 'border-orange-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
              <span>{t.icon}</span>
              {t.id === 'schedule' && pendingApprovalCount > 0 ? (
                // Pending: show the count inline in the same font, reading "Schedule (8)" in orange.
                <span className="text-orange-400">{t.label} ({pendingApprovalCount})</span>
              ) : t.id === 'payments' && stripeActionRequired ? (
                // Stripe needs something from the truck: the SAME orange-400 (!) treatment the Menu tab
                // uses for unverified allergens — a countless variant, because "how many requirements"
                // is not a number an operator can act on. No new formatting was invented.
                <span className="text-orange-400">{t.label} <span aria-label="Stripe needs your attention">(!)</span></span>
              ) : t.id === 'menu' && allergensUnverified ? (
                // Allergens unverified: a (!) on the Menu tab. Uses the SAME orange-400 treatment as the
                // Schedule needs-approval cue (consistency) — not amber.
                <span className="text-orange-400">{t.label} <span aria-label="allergens not set">(!)</span></span>
              ) : (
                t.label
              )}
            </button>
          ))}
        </div>
      </div>

      {/* The ONLY scroll container — flex-1 min-h-0 fills the shell and scrolls internally while the bars
          stay put. NO top padding on the scroller: a `position:sticky` child pins at the scroll container's
          CONTENT box, so padding-top here would become a permanent gap above any sticky header (the Billing
          plan/price row). The resting top gap lives on the inner `pt-6` wrapper as SCROLLABLE content
          instead, so `sticky top-0` pins FLUSH under the tabs — no magic offset, desktop + iPad WKWebView. */}
      <main className={"w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto flex-1 min-h-0 overflow-y-auto px-4 pb-6"}>
        <div className="pt-6">
        {/* ── K2: THE "REMIND ME LATER" STRIP ────────────────────────────────────────────────────────
            Left behind by the done screen's "Remind me later", and persistent until it is taken or
            dismissed — no timer, no timestamp, ONE boolean in the same per-truck localStorage key the
            walkthrough itself uses. Dismissing it stores 'seen', which is also what taking the tour
            stores: both mean "stop offering". */}
        {showWalkthroughStrip && (
          <div className="mb-4 bg-slate-900 text-white rounded-xl px-4 py-2.5 flex items-center gap-3">
            <span aria-hidden>🧭</span>
            <p className="text-sm font-semibold flex-1 min-w-0">Want a quick tour of your dashboard?</p>
            <button type="button" onClick={openWalkthrough}
              className="text-xs font-black bg-orange-600 hover:bg-orange-700 px-3 py-1.5 rounded-lg whitespace-nowrap">
              Show me around
            </button>
            <button type="button" aria-label="Dismiss"
              onClick={() => { writeWalkthroughState(token, 'seen'); setWalkthroughStateLocal('seen') }}
              className="text-slate-400 hover:text-white text-xl leading-none">×</button>
          </div>
        )}
        {/* Events-to-approve banner — cross-tab signal. NOT shown on the Schedule tab itself: there the
            "Needs your approval" section (ScheduleTab) is the surface, so a banner there would double it. */}
        {showApprovalBanner && activeTab !== 'schedule' && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-amber-500 text-lg shrink-0">📅</span>
            <p className="text-sm text-amber-800 flex-1">
              We found <strong>{pendingApprovalCount}</strong> event{pendingApprovalCount !== 1 ? 's' : ''} for you — review and approve before they go live.
            </p>
            <button onClick={() => setActiveTab('schedule')} className="text-xs font-bold text-amber-800 underline whitespace-nowrap">Review →</button>
            <button onClick={() => setBannerDismissedAtCount(pendingApprovalCount)} className="text-amber-400 hover:text-amber-600 text-sm font-bold leading-none shrink-0">✕</button>
          </div>
        )}
        {/* Allergens-not-verified banner — cross-tab signal on NON-Menu tabs only. On the Menu tab the
            highlighted allergen BOX (below) is the surface, so the banner is suppressed there (no double).
            "Review →" NAVIGATES to the Menu tab and does NOT auto-open the wizard — the operator opens it
            deliberately from the box's "Set up / review allergens" button. */}
        {allergensUnverified && activeTab !== 'menu' && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-amber-500 text-lg shrink-0">⚠️</span>
            <p className="text-sm text-amber-800 flex-1">
              <strong>Allergens not set</strong> — customers can&apos;t see allergen info until you verify it. Review each dish&apos;s allergens on the Menu tab.
            </p>
            <button onClick={() => setActiveTab('menu')} className="text-xs font-bold text-amber-800 underline whitespace-nowrap">Review →</button>
          </div>
        )}
        {/* Stripe-requirements banner — cross-tab signal, suppressed on the Payments tab itself, where
            Stripe's own notification banner is the surface and a second one would double it. Identical
            treatment to the two banners above: amber-50 / amber-200, icon, "Review →", ✕.
            ⚠️ DISMISS IS PER-SESSION AND SIMPLER THAN THE APPROVAL ONE, deliberately. That banner
            re-appears when the COUNT rises; this signal is a boolean, so there is no "more than before"
            to detect. Dismiss hides it until the page is reloaded — at which point the server is asked
            again, and if Stripe still wants something it comes back. */}
        {stripeActionRequired && !stripeBannerDismissed && activeTab !== 'payments' && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-amber-500 text-lg shrink-0">💷</span>
            <p className="text-sm text-amber-800 flex-1">
              <strong>Stripe needs something from you</strong> — card payments can stop until it&apos;s sorted.
            </p>
            <button onClick={() => setActiveTab('payments')} className="text-xs font-bold text-amber-800 underline whitespace-nowrap">Review →</button>
            <button onClick={() => setStripeBannerDismissed(true)} className="text-amber-400 hover:text-amber-600 text-sm font-bold leading-none shrink-0">✕</button>
          </div>
        )}
        {/* Mandatory fields banner */}
        {(() => {
          const missing = [
            !truck.name?.trim() && 'truck name',
            !truck.cuisine_type?.trim() && 'cuisine type',
            !truck.contact_email?.trim() && 'contact email',
            !truck.contact_phone?.trim() && 'contact phone',
          ].filter(Boolean) as string[]
          if (missing.length === 0) return null
          return (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <span className="text-amber-500 text-lg shrink-0">⚠</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Complete your profile</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Missing: {missing.join(', ')}.{' '}
                  <button onClick={() => setActiveTab('settings')} className="underline font-medium">Go to Settings →</button>
                </p>
              </div>
            </div>
          )
        })()}
        {activeTab === 'menu'      && <MenuTab      truck={truck} categories={categories} items={items} subcategories={subcategories} token={token} modifierGroups={modifierGroups} modifierOptions={modifierOptions} itemModGroups={itemModGroups} setItemModGroups={setItemModGroups} api={api} reload={load} showToast={showToast} allergenWizardOpen={allergenWizardOpen} onCloseAllergenWizard={() => { setAllergenWizardOpen(false); load() }} onOpenAllergenWizard={() => setAllergenWizardOpen(true)} canEditAllergens={userRole === 'owner' || isAdmin} onWalkthroughChoice={handleWalkthroughChoice} onVerifySuccess={handleVerifiedEvents} />}
        {activeTab === 'modifiers' && <ModifiersTab categories={categories} items={items} modifierGroups={modifierGroups} modifierOptions={modifierOptions} itemModGroups={itemModGroups} upsellRules={upsellRules} setModifierGroups={setModifierGroups} setModifierOptions={setModifierOptions} setItemModGroups={setItemModGroups} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'deals'     && <DealsTab     categories={categories} bundles={bundles} setBundles={setBundles} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'reports'   && <ReportsTab   truck={truck} api={api} />}
        <ScheduleTab isActive={activeTab === 'schedule'} truck={truck} token={token} bundles={bundles} categories={categories} api={api} reload={load} showToast={showToast} onSwitchTab={setActiveTab} pendingVerifyEvents={pendingVerifyEvents} onClearPendingVerify={() => setPendingVerifyEvents(null)} onPendingCount={setPendingApprovalCount} onEventsSaved={afterEventsSaved} />
        {activeTab === 'team'      && <TeamTab      truck={truck} token={token} api={api} reload={load} showToast={showToast}
          currentUserEmail={currentUserEmail}
          currentUserFirstName={currentUserFirstName}
          currentUserLastName={currentUserLastName}
          currentUserPhone={currentUserPhone}
          currentUserId={currentUserId}
          ownerEmail={ownerEmail}
          ownerAuthUserId={ownerAuthUserId}
          userRole={userRole}
          initialPendingEmailChange={pendingEmailChange}
          onProfileSaved={(firstName, lastName, phone) => {
            const fullName = `${firstName} ${lastName}`.trim()
            setCurrentUserName(fullName)
            setCurrentUserFirstName(firstName)
            setCurrentUserLastName(lastName)
            setCurrentUserPhone(phone)
          }}
        />}
        {activeTab === 'settings'  && <SettingsTab  userRole={userRole} truck={truck} token={token} api={api} reload={load} showToast={showToast} onVerifySuccess={handleVerifiedEvents} onSwitchTab={setActiveTab} categories={categories} items={items} subcategories={subcategories} onTruckUpdate={partial => setTruck(prev => prev ? { ...prev, ...partial } : prev)} onItemsPatch={(ids, patch) => setItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, ...patch } : i))} onCategoriesPatch={(ids, patch) => setCategories(prev => prev.map(c => ids.includes(c.id) ? { ...c, ...patch } : c))} onOpenWalkthrough={openWalkthrough} />}
        {activeTab === 'payments'  && <PaymentsTab  token={token} plan={truck?.plan} showToast={showToast} />}
        {activeTab === 'billing'   && <BillingTab   truck={truck} />}
        </div>
      </main>

      {/* K3: mounted at PAGE level, outside <main>, because it anchors to the TAB BAR — which is a
          sibling of <main> in the app-shell, not inside it. Rendered only while walkthroughOpen, which
          nothing but a click can set. */}
      {walkthroughOpen && <Walkthrough stops={WALKTHROUGH_STOPS} onClose={closeWalkthrough} />}

      <ToastStack toasts={toasts} dismissToast={dismissToast} />

      {/* Trial reminder popup — shown once per day.
          🔴 `purchaseCtaAllowed()` is the SECOND of two iOS guards; the trigger effect above already
          returns early, so `showTrialReminder` can never be true on iOS. Kept deliberately as a render-site
          guard: this popup's entire body is purchase copy ("Choose your plan before then...", "Upgrade
          here"), so if a future change ever sets the flag from somewhere else, the wrong default here is a
          submission-blocking screenshot rather than a cosmetic bug. */}
      {showTrialReminder && truck && purchaseCtaAllowed() && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl relative">
            <button
              onClick={() => setShowTrialReminder(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg leading-none">
              ✕
            </button>
            <div className="text-center mb-4">
              <div className="text-3xl mb-2">🎉</div>
              <h2 className="text-xl font-black text-slate-900">You&apos;re on a free trial</h2>
              <p className="text-sm text-slate-500 mt-1">
                Trial ends <span className="font-semibold text-orange-500">
                  {truck.trial_expires_at ? formatTrialEndDate(truck.trial_expires_at) : 'soon'}
                </span>
              </p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4 text-center">
              <p className="text-sm font-semibold text-orange-800">
                Full Max features + Pay at Hatch ordering — completely free*
              </p>
              <p className="text-sm text-orange-700 mt-1">
                You won&apos;t be charged anything until your trial ends on{' '}
                <strong>{truck.trial_expires_at ? formatTrialEndDate(truck.trial_expires_at) : 'soon'}</strong>.
                Choose your plan before then — if you don&apos;t, access will revert to the free Starter tier and some features will stop working.
              </p>
              <p className="text-xs text-orange-500 mt-2">
                *Standard card processing fees apply on online orders
              </p>
            </div>
            <button
              onClick={() => { setShowTrialReminder(false); setActiveTab('billing') }}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors">
              Upgrade here →
            </button>
          </div>
        </div>
      )}

      {/* Edit profile modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
             onClick={e => e.target === e.currentTarget && setShowProfileModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-slate-900">Edit profile</h3>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</label>
              <input
                type="text"
                value={editProfileName}
                onChange={e => setEditProfileName(e.target.value)}
                placeholder="Your name"
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={currentUserEmail || ''}
                disabled
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 text-slate-400"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowProfileModal(false)}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={saveProfile}
                disabled={!editProfileName.trim() || savingProfile}
                className="flex-1 bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-orange-700"
              >
                {savingProfile ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
    </PricingPolicyProvider>
  )
}

// ══════════════════════════════════════════════════════════════
// SHARED ALLERGEN / DIETARY TOGGLES + vocabulary now live in @/components/manage/primitives
// (imported above) so the dish editor, the modifier-option editor, the AI-import review modal AND
// <ExtrasEditor> share ONE source. Usages below are unchanged.
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// MENU TAB
// ══════════════════════════════════════════════════════════════
// 'offer' (slice C) — the demo→real handover asks BEFORE loading: "use the menu from your demo, or
// upload a different one?". It sits in front of 'review' on that route ONLY; every other entry to the
// wizard is unchanged and never passes through it.
// ⚠️ SAFE TO EXTEND: every consumer compares with `===` against a literal (:4008 :4032 :4043 :4245
// :4358 :4455 :4462 :4481 :4624). There is no `switch` on this type anywhere, so a new member cannot
// fall through a default — an unhandled value simply renders nothing.
// K1 adds 'settings' — the review screen, AFTER schedule and BEFORE done. It deliberately runs while
// setup_step is still set: finishSetup() (which writes 'done' and so flips inSetup false) is now called
// from THIS step's continue button rather than from the schedule step's, so the review is not gated out
// from under itself.
type ImportStep = 'idle' | 'upload' | 'processing' | 'offer' | 'review' | 'allergens' | 'prep' | 'saving' | 'schedule' | 'settings' | 'done'

// ── Variant-axis vocabulary for the deterministic regroup pass ───────────────────────────────
// The single varying token that makes two same-base dishes a VARIANT of one item (vs two different
// dishes). ONLY protein/size tokens qualify — a dish-TYPE word (e.g. Green/Red curry, a topping) does
// NOT, so those stay separate. Named + extensible: add a token here to teach the regroup detector a
// new variant word. Keys are lowercase single tokens; value is the axis they belong to.
const VARIANT_AXIS_TOKENS: Record<string, 'protein' | 'size'> = {
  beef: 'protein', chicken: 'protein', prawn: 'protein', prawns: 'protein', duck: 'protein',
  veg: 'protein', vegetable: 'protein', vegetarian: 'protein', tofu: 'protein', lamb: 'protein',
  pork: 'protein', fish: 'protein', salmon: 'protein', paneer: 'protein', halloumi: 'protein',
  mushroom: 'protein', shrimp: 'protein',
  small: 'size', regular: 'size', medium: 'size', large: 'size', sm: 'size', reg: 'size', lg: 'size',
}

// ══════════════════════════════════════════════════════════════════════════════════════
// ALLERGEN WIZARD (Slice 3 shell + Mode-1; Slice 4 adds Mode-2 card + Mode-3 both).
// SAFETY: the system must NEVER under-warn. Unconfirmed per-item allergens stay HIDDEN from
// customers (the deployed verified-gate in app/api/menu/[truckId]/route.ts does this). The
// wizard only FLIPS allergens_verified=true when the operator explicitly confirms a row — no
// auto-write, no bulk "confirm all". Confirm goes through the SHARED upsert_item path.
//
// MODE-2 (card) FOLDS IN the existing standalone card flow — the upload/text modal +
// process-allergens extractor + the trucks.allergen_info_text/url storage all live in MenuTab
// and are REUSED here (onAddCard opens the existing modal); this wizard does NOT duplicate them.
// In card mode per-item AI allergens are RETAINED but stay verified=false (hidden) — enabling
// per-dish later requires going through the review table + confirming each. The wizard never
// deletes per-item data and never reveals it without a row confirm.
//
// MODE-3 (both) runs Mode-1's review table then Mode-2's card, sequentially (reused, not rebuilt).
//
// Legacy generics: slice-1 removed 'Nuts'/'Shellfish' from the vocab. A row may still carry one
// (e.g. Gusto). We SHOW it and BLOCK confirm until the operator picks the precise allergen of
// that family — dropping a generic without a precise replacement would under-warn (fatal).
const GENERIC_REPLACEMENTS: Record<string, string[]> = {
  Nuts: ['Tree nuts', 'Peanuts'],
  Shellfish: ['Crustaceans', 'Molluscs'],
}
const isVocab = (a: string) => (ALLERGEN_VOCAB as readonly string[]).includes(a)
// EXACT, order-independent set-equality (safety-critical — drives allergen auto-re-verify). True ONLY when
// both arrays hold the same members, no more, no fewer. Length guard + every-member-present catches both
// "extra in a" and "extra in b" (toggle-built arrays have no dups, so length+membership is exact).
const setEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  const sb = new Set(b)
  return a.every(x => sb.has(x))
}

// Stable per-item id for STAGED import items (used as the allergen review's draft/snapshot/React key — NOT
// the array index, which is unsafe). Assigned once at parse + on manual add; survives importResult patches
// (spreads preserve it). Session-scoped counter (client-only).
let __impUidSeq = 0
const newImpUid = () => `imp-${++__impUidSeq}`
const withImpUids = (data: any) => (!data || !Array.isArray(data.items)) ? data
  : { ...data, items: data.items.map((it: any) => ({ ...it, _uid: it._uid ?? newImpUid() })) }

// #3: the legacy-generic "!" tooltip. Rendered via a PORTAL to document.body with position:fixed so it
// CANNOT be clipped by the matrix's overflow scroll container or occluded by neighbouring/frozen cells
// (z-[100], above everything). Positioned at the marker's on-screen rect on hover.
function WarnMarker({ text }: { text: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  return (
    <span
      className="inline-flex shrink-0"
      onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setPos({ x: r.left, y: r.bottom }) }}
      onMouseLeave={() => setPos(null)}
      aria-label={text}
    >
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-600 text-white text-[11px] font-black leading-none cursor-help">!</span>
      {pos && createPortal(
        <span className="fixed z-[100] max-w-[16rem] rounded-md bg-slate-900 text-white text-[11px] leading-snug px-2 py-1.5 shadow-lg whitespace-normal" style={{ left: pos.x, top: pos.y + 6 }}>{text}</span>,
        document.body,
      )}
    </span>
  )
}

// CARD-ONLY editor — the "show allergen card" display mode. SEPARATE from CardUploadPage (the per-dish
// extractor) so card-mode changes can NEVER leak into the per-dish path. NO process-allergens vocab parsing,
// NO chips. The textarea is the source of truth and is stored VERBATIM. An image upload calls the parent's
// onTranscribe (process-allergens?mode=transcribe → PROSE) which PRE-FILLS the textarea for the operator to
// review/edit — never auto-saved, never stored as an image. Used by BOTH the standalone wizard (mode 2) and
// the import wizard (card display mode).
function CardOnlyEditor({ value, onChange, onTranscribe, transcribing, canEdit = true }: {
  value: string; onChange: (t: string) => void
  onTranscribe: (file: File) => void
  transcribing: boolean
  canEdit?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
        <p className="text-sm font-bold text-amber-800">Your allergen card</p>
        <p className="text-xs text-amber-700 mt-0.5">Customers see this <span className="font-semibold">exactly as you write it</span> — nothing is rewritten. Type or paste below, or upload a photo/PDF and we’ll read the text in for you to check.</p>
      </div>
      {!canEdit ? (
        value
          ? <p className="text-sm text-slate-600 whitespace-pre-wrap border border-slate-200 rounded-xl p-3">{value}</p>
          : <p className="text-sm text-slate-400 italic">No allergen card yet.</p>
      ) : (
        <>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="e.g. All our fish & chips contain wheat and milk. Fryer is shared with items containing gluten and nuts. Vegan options available — ask staff."
            className="w-full h-44 border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <div className="flex items-center gap-3">
            <label className={`inline-flex items-center gap-2 text-sm font-semibold rounded-lg border border-slate-300 px-3 py-1.5 cursor-pointer hover:bg-slate-50 ${transcribing ? 'opacity-60 pointer-events-none' : ''}`}>
              {transcribing ? <><Spinner /> Reading image…</> : <>📷 Upload image / PDF</>}
              <input type="file" accept="image/*,application/pdf" className="sr-only"
                onChange={e => { const f = e.target.files?.[0]; if (f) onTranscribe(f); e.target.value = '' }} />
            </label>
            <p className="text-xs text-slate-400">We read the text off your image so you can review it — the image isn’t stored.</p>
          </div>
        </>
      )}
    </div>
  )
}

// SHARED card-upload page — consumed by BOTH the import wizard AND the standalone wizard (DRY). Generic over
// an opaque dishId: import passes index-as-string, standalone passes the committed uuid; the parent resolves
// it. The matcher/merge/safety differences live in the parent's onProcess/onAssign — this is pure UI.
type CardParse = { entries?: CardEntry[]; blanket?: string[]; cross_contamination?: string[]; formatted_text?: string; summary?: string; contains?: string[]; may_contain?: string[]; dietary_options?: string[]; additional_notes?: string }
function CardUploadPage({ perDish, anyDetected, parsed, processing, showUpload, onShowUpload, file, onFile, text, onText, onProcess, onCancelUpload, matchResult, resolvedKeys, dishes, onAssign, onDismiss, blanketOptIn, onBlanketToggle }: {
  perDish: boolean; anyDetected: boolean
  parsed: CardParse | null; processing: boolean
  showUpload: boolean; onShowUpload: () => void
  file: File | null; onFile: (f: File | null) => void
  text: string; onText: (t: string) => void
  onProcess: () => void; onCancelUpload: () => void
  matchResult: CardMatchResult | null; resolvedKeys: Set<string>
  dishes: { id: string; name: string }[]
  onAssign: (entry: CardEntry, dishId: string) => void; onDismiss: (entry: CardEntry) => void
  blanketOptIn: boolean; onBlanketToggle: (b: boolean) => void
}) {
  // Yes/No: uploading a card is OPTIONAL. Tri-state, defaults to NEITHER selected (null). The buttons stay
  // ALWAYS visible so the operator can switch between Yes/No; "Yes" reveals the upload UI inline BELOW the
  // (still-visible) buttons, "No" makes it clear they can just proceed via the footer. Reveal is driven by
  // this LOCAL state (not the showUpload prop) so the first Yes click reliably shows the box. DRY: both
  // wizards inherit this. UI-only — no change to matcher/merge/verified logic.
  const [cardChoice, setCardChoice] = useState<'yes' | 'no' | null>(null)
  const dishName = (id: string) => dishes.find(d => d.id === id)?.name || 'Dish'
  const pending = matchResult
    ? [...matchResult.unmatched.map(e => ({ entry: e, candidates: null as string[] | null })),
       ...matchResult.ambiguous.map(a => ({ entry: a.entry, candidates: a.candidateDishIds }))]
       .filter(x => !resolvedKeys.has(cardEntryKey(x.entry)))
    : []
  return (
    <>
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
        <p className="text-sm font-bold text-amber-800">Do you have an allergen card to upload?</p>
        <p className="text-xs text-amber-700 mt-0.5">
          {perDish
            ? <>Upload one and we’ll use it to build your dish allergens.{anyDetected ? ' Detected allergens will be visible on the next page where you confirm each dish.' : ''}</>
            : <>Upload the allergen card customers will see.</>}
        </p>
        {/* Yes/No — ALWAYS visible (until a card is parsed/processing) so the operator can switch choice.
            Default = neither selected. Yes reveals the upload UI below; No shows the proceed hint. */}
        {!parsed && !processing && (
          <div className="mt-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => { setCardChoice('yes'); onShowUpload() }}
                className={`px-5 py-1.5 rounded-lg text-sm font-bold border transition-colors ${cardChoice === 'yes' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-100'}`}>Yes</button>
              <button type="button" onClick={() => setCardChoice('no')}
                className={`px-5 py-1.5 rounded-lg text-sm font-bold border transition-colors ${cardChoice === 'no' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-100'}`}>No</button>
            </div>
            {cardChoice === 'no' && <p className="text-xs text-amber-700 font-semibold mt-2">No problem — you don’t need one. Continue with the button below.</p>}
          </div>
        )}
      </div>
      {!parsed ? (
        <div className="flex flex-col gap-3">
          {processing ? (
            <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Analysing card…</div>
          ) : cardChoice === 'yes' ? (
            /* YES expanded — the drag-drop + paste UI inline, BELOW the still-visible Yes/No. Dropzone and
               textarea share the SAME height (h-28) so they sit neatly and fit the fixed-height body. */
            <>
              <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-slate-200 hover:border-orange-300 hover:bg-orange-50/30 rounded-xl h-28 px-4 cursor-pointer transition-colors">
                <span className="text-2xl">{file ? '✅' : '📷'}</span>
                <span className="text-sm text-slate-500 text-center">{file ? file.name : 'Drag and drop or tap to choose'}</span>
                <span className="text-xs text-slate-400">Image or PDF</span>
                <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={e => onFile(e.target.files?.[0] || null)} />
              </label>
              <div className="flex items-center gap-3"><div className="flex-1 h-px bg-slate-200" /><span className="text-xs text-slate-400 font-medium">or</span><div className="flex-1 h-px bg-slate-200" /></div>
              <textarea value={text} onChange={e => onText(e.target.value)} placeholder="Paste your allergen card text here…" className="w-full h-28 border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <div><Btn label="Process card" disabled={!file && !text.trim()} onClick={onProcess} /></div>
            </>
          ) : null}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-bold text-slate-800">Card read ✓</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {(matchResult?.matched.length ?? 0)} matched to a dish.{pending.length > 0 && <> {pending.length} need your assignment.</>}
            </p>
          </div>
          {pending.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Couldn’t auto-match these — assign or dismiss</p>
              {pending.map((p, pi) => {
                const opts = p.candidates ?? dishes.map(d => d.id)
                return (
                  <div key={`${cardEntryKey(p.entry)}-${pi}`} className="border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">“{p.entry.name}”</span>
                      <span className="inline-flex flex-wrap gap-1">{p.entry.allergens.map(a => <AllergenChip key={a} label={a} />)}</span>
                    </div>
                    {p.candidates && <p className="text-[11px] text-amber-700 font-semibold">Ambiguous — matches several dishes; pick the right one.</p>}
                    <div className="flex items-center gap-2 flex-wrap">
                      <select defaultValue="" onChange={e => { const v = e.target.value; if (v !== '') onAssign(p.entry, v) }}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                        <option value="">Assign to dish…</option>
                        {opts.map(id => <option key={id} value={id}>{dishName(id)}</option>)}
                      </select>
                      <Btn label="Dismiss" colour="slate" size="sm" onClick={() => onDismiss(p.entry)} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {!!parsed.blanket?.length && (
            <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 cursor-pointer">
              <input type="checkbox" checked={blanketOptIn} onChange={e => onBlanketToggle(e.target.checked)} className="mt-0.5" />
              <span className="text-xs text-slate-600">
                The card says <strong>{parsed.blanket.join(', ')}</strong> may be present across <strong>all</strong> dishes.
                Add to every dish? (you’ll still confirm each) <span className="text-slate-400">— off by default</span>
              </span>
            </label>
          )}
          {!!parsed.cross_contamination?.length && (
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Kitchen notes (saved to your allergen info)</p>
              <ul className="list-disc pl-5 text-xs text-slate-600">{parsed.cross_contamination.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </>
  )
}

/**
 * The saved allergen card, as a panel: the summary text (expandable) and a link to the original file.
 *
 * ── 🔴 WHY IT IS A COMPONENT AND NOT TWO MORE COPIES OF THE SAME JSX ──────────────────────────────
 * This markup existed twice — the Menu tab and AllergenWizardModal below — and BOTH carried the same
 * defect: the whole panel was gated on the TEXT, with the file link nested inside it, so a truck holding
 * a card file and no summary text rendered an empty panel under a green "allergen card saved". One
 * definition, so that cannot drift again. ⚠️ The wizard has NOT been switched over — see the report; its
 * clamp, padding, heading and Replace button differ and changing them unseen would be a guess.
 *
 * ── ⚠️ READ-ONLY. IT WRITES NOTHING. ──────────────────────────────────────────────────────────────
 * No api() call, no setState on the truck, no allergen column touched. `expanded` is local view state
 * and dies with the component, deliberately: which panel someone left open is not a fact about the
 * truck, and persisting it would mean a write on a read.
 *
 * ── 🔴 "Show more" APPEARS ONLY WHEN THE TEXT IS GENUINELY CLIPPED ───────────────────────────────
 * Measured, not guessed. A character-count heuristic gets this wrong in both directions — a short wide
 * line and a long narrow one clamp differently — so the collapsed paragraph is asked whether its
 * scrollHeight exceeds its clientHeight. A ResizeObserver repeats that when the column changes width,
 * because a card that fits at one width can clip at another.
 */
function SavedAllergenCard({ text, url, clampClass, className = '' }: {
  text: string
  url: string
  /** A LITERAL Tailwind class ('line-clamp-3'), never interpolated — a computed class name is not
   *  generated at build time and would silently produce no clamp at all. */
  clampClass: string
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [clipped, setClipped] = useState(false)
  const textRef = useRef<HTMLParagraphElement | null>(null)

  useEffect(() => {
    const el = textRef.current
    // Only meaningful while collapsed: expanded, the clamp is off and the two heights always match.
    // `clipped` is left at its last collapsed reading so "Show less" survives the expansion.
    if (!el || expanded) return
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, expanded, clampClass])

  // Nothing saved at all — render nothing rather than an empty green box.
  if (!text && !url) return null

  return (
    <div className={`border border-green-100 bg-green-50 rounded-xl p-3 ${className}`}>
      {text ? (
        <>
          <p ref={textRef} className={`text-xs text-slate-600 whitespace-pre-wrap ${expanded ? '' : clampClass}`}>{text}</p>
          {(clipped || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="text-xs font-semibold text-green-700 hover:text-green-800 underline mt-1"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </>
      ) : (
        // 🔴 THE URL-ONLY CASE, WHICH USED TO RENDER AN EMPTY PANEL. A file is saved and no summary was
        // ever produced — usually an upload whose AI pass then failed. Say that, rather than showing a
        // green box with nothing in it.
        <p className="text-xs text-slate-600">
          A card file is saved for this truck, but no summary text was stored. Open the original to read it.
        </p>
      )}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-green-600 underline mt-1 inline-block">
          View original card
        </a>
      )}
    </div>
  )
}

function AllergenWizardModal({ items, categories, canEdit, onClose, onConfirmRow, onUndoRow, onEditUnverify, showToast, cardText, cardUrl, cardProcessing, onAddCard, onSetDisplayMode, initialMode = 0, initialReviewView = 'list', onProcessCard, onCardMerge, onBack, importStepper, onSaveCard, onTranscribeCard }: {
  items: Item[]; categories: Category[]
  canEdit: boolean                                                       // owner/admin — VIEW for all, EDIT/confirm only here (server also enforces)
  onClose: () => void
  onConfirmRow: (item: Item, allergens: string[], dietary: string[]) => Promise<void>
  onUndoRow: (item: Item, allergens: string[], dietary: string[], verified: boolean) => Promise<void>  // reverses a confirm (data + verified)
  onEditUnverify: (item: Item) => Promise<void>                          // flip verified=false on edit (data unchanged) until re-confirm
  showToast: ShowToast
  cardText: string; cardUrl: string; cardProcessing: boolean
  onAddCard: () => void                                                  // opens the existing (folded-in) card upload/text modal
  onSetDisplayMode: (mode: 'per_dish' | 'card' | 'both') => Promise<void>
  initialMode?: 0 | 1 | 2                                                // 0 chooser (default); 1 review directly (import per-item → skips re-choosing); 2 card
  // I2: which layout the mode-1 review OPENS in. Defaults to 'list', so every caller that does not ask
  // for anything keeps today's behaviour exactly — including the standalone wizard the Menu tab opens.
  // The import wizard passes 'table': it reviews a whole freshly-extracted menu at once, where the matrix
  // is the faster surface. Layout only; the operator flips it with the existing toggle and the data,
  // logic and confirm actions are identical in both.
  initialReviewView?: 'list' | 'table'
  // STANDALONE card→dish enrichment (#6). When provided, the per-dish branch shows a card-upload page that
  // matches the card against THESE (committed) items + merges via onCardMerge. Absent (import) → no card page.
  onProcessCard?: (file: File | null, text: string) => Promise<CardParse | null>   // → process-allergens (parent has token/api)
  onCardMerge?: (item: Item, union: string[]) => Promise<void>                       // → writeItemAllergens(item, union, …, verified=false, 'card')
  onBack?: () => void                                                                // IMPORT-only: review "← Back" returns to the import sub-step, NOT the wizard's own mode-0/mode-3
  importStepper?: React.ReactNode                                                     // IMPORT-only: the wizard's step-progress header (Menu·Extras·Allergens·Kitchen). Presence ⇒ import context (Next-rename + Next-disabled-until-all-confirmed). Standalone omits it.
  onSaveCard?: (text: string) => Promise<void>                                        // CARD-ONLY mode: persist the operator's VERBATIM card text to trucks.allergen_info_text (no extraction)
  onTranscribeCard?: (file: File) => Promise<string | null>                          // CARD-ONLY mode: image → faithful PROSE transcription (process-allergens?mode=transcribe); fills the editor
}) {
  // mode 0 = chooser; 1 = per-dish review; 2 = card; 3 = per-dish CARD-UPLOAD page (#6, standalone only)
  const [mode, setMode] = useState<0 | 1 | 2 | 3>(initialMode)
  // #4: the chooser is SELECT-then-Next (no auto-advance). Holds the operator's pick until they press Next.
  const [chooserMode, setChooserMode] = useState<'per_dish' | 'card' | null>(null)
  // #6 STANDALONE card→dish state (only used when onProcessCard/onCardMerge are provided). Matches the
  // parsed card against the COMMITTED `items` (exact-only) and merges via onCardMerge with a setEqual guard.
  const [stdCardParsed, setStdCardParsed] = useState<CardParse | null>(null)
  const [stdCardMatch, setStdCardMatch] = useState<CardMatchResult | null>(null)
  const [stdCardProcessing, setStdCardProcessing] = useState(false)
  const [stdShowUpload, setStdShowUpload] = useState(false)
  const [stdCardFile, setStdCardFile] = useState<File | null>(null)
  const [stdCardText, setStdCardText] = useState('')
  const [stdResolved, setStdResolved] = useState<Set<string>>(new Set())
  const [stdBlanket, setStdBlanket] = useState(false)
  // Apply ONE matched entry to a committed item: union, then write ONLY if it CHANGED (Correction 1 —
  // never needlessly flip an unchanged confirmed dish). Flips verified=false on a real change (re-confirm).
  const applyCardToCommitted = async (itemId: string, allergens: string[]) => {
    const item = items.find(i => i.id === itemId)
    if (!item || !onCardMerge) return
    const union = mergeAllergensUnion(item.allergens || [], allergens)
    if (!setEqual(union, item.allergens || [])) await onCardMerge(item, union)   // setEqual guard (Correction 1)
  }
  const handleStandaloneCardProcess = async () => {
    if (!onProcessCard) return
    setStdCardProcessing(true)
    try {
      const parsed = await onProcessCard(stdCardFile, stdCardText)
      if (!parsed) { showToast('Couldn’t read the allergen card — try again', 'error'); return }
      setStdCardParsed(parsed)
      const entries: CardEntry[] = Array.isArray(parsed.entries) ? parsed.entries.filter((e: any) => e && e.name && Array.isArray(e.allergens)) : []
      const m = matchCardEntries(entries, items.map(i => ({ id: i.id, name: i.name })))
      setStdCardMatch(m)
      for (const { entry, dishId } of m.matched) await applyCardToCommitted(dishId, entry.allergens)   // exact auto-apply (guarded)
      setStdResolved(new Set(m.matched.map(x => cardEntryKey(x.entry))))
      showToast(`Card read — ${m.matched.length} matched, ${m.unmatched.length + m.ambiguous.length} need assignment`, 'success')
    } catch { showToast('Couldn’t read the allergen card — try again', 'error') }
    finally { setStdCardProcessing(false) }
  }
  const assignStandaloneEntry = async (entry: CardEntry, dishId: string) => {
    await applyCardToCommitted(dishId, entry.allergens)
    setStdResolved(prev => new Set(prev).add(cardEntryKey(entry)))
  }
  const dismissStandaloneEntry = (entry: CardEntry) => setStdResolved(prev => new Set(prev).add(cardEntryKey(entry)))
  const [reviewView, setReviewView] = useState<'list' | 'table'>(initialReviewView) // mode-1 review layout (same data/logic)
  const [finishing, setFinishing] = useState(false)
  // Per-row editable draft (vocab-only allergens + dietary). Lazily seeded from the item.
  const [drafts, setDrafts] = useState<Record<string, { allergens: string[]; dietary: string[] }>>({})
  const [confirming, setConfirming] = useState<string | null>(null)
  const [sessionConfirmed, setSessionConfirmed] = useState<Set<string>>(new Set())
  // Per-row snapshot of the LAST-CONFIRMED selection (the exact vocab allergens[] + dietary[] that were
  // confirmed). The single source of truth for "differs from confirmed": we COMPARE the live draft to this
  // (setEqual) rather than tracking a one-way "an edit happened" flag — so toggling back to the exact
  // confirmed set auto-clears the "changed" state AND auto-restores verified=true. Replaces the old
  // one-way `editedSinceConfirm` Set entirely.
  const [confirmedSnapshot, setConfirmedSnapshot] = useState<Record<string, { allergens: string[]; dietary: string[] }>>({})
  // Option A: the WHOLE <thead> is ONE sticky unit (top:0), so the group row + label row have NO inter-layer
  // offset (gap eliminated structurally). The ONLY remaining offset is the category rows, which stick at the
  // measured thead height — one ResizeObserver, one number.
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const [headerH, setHeaderH] = useState(72)
  useEffect(() => {
    const el = theadRef.current
    if (!el) return
    const measure = () => setHeaderH(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [reviewView, mode, items.length])

  const seed = (item: Item) => ({
    allergens: (item.allergens || []).filter(isVocab),
    dietary: item.dietary_info || [],
  })
  const draftFor = (item: Item) => drafts[item.id] ?? seed(item)
  const patchDraft = (item: Item, patch: Partial<{ allergens: string[]; dietary: string[] }>) =>
    setDrafts(d => ({ ...d, [item.id]: { ...draftFor(item), ...patch } }))

  const confirmedCount = items.filter(i => i.allergens_verified !== false).length
  const allDone = items.length > 0 && confirmedCount === items.length

  // The allergens[] actually WRITTEN on confirm = the operator's vocab picks + any unknown non-vocab string
  // preserved (defensive over-warn); known generics are dropped, replaced by the precise picks. Shared by
  // handleConfirm AND the auto-restore path so both write byte-identical data.
  const writtenAllergens = (item: Item, draft: { allergens: string[]; dietary: string[] }) => {
    const unknownStale = (item.allergens || []).filter(a => !isVocab(a) && !GENERIC_REPLACEMENTS[a])
    return [...new Set([...draft.allergens, ...unknownStale])]
  }

  const handleConfirm = async (item: Item) => {
    const draft = draftFor(item)
    const written = writtenAllergens(item, draft)
    // Snapshot the PRIOR state (before the write) so Undo can fully reverse the upsert_item.
    const prev = { allergens: item.allergens || [], dietary: item.dietary_info || [], verified: item.allergens_verified !== false }
    setConfirming(item.id)
    try {
      await onConfirmRow(item, written, draft.dietary)
      setSessionConfirmed(s => new Set(s).add(item.id))
      // Snapshot the CONFIRMED draft selection — the baseline the live draft is compared against for
      // "changed"/auto-restore. (Vocab allergens + dietary, matching what draftFor returns.)
      setConfirmedSnapshot(s => ({ ...s, [item.id]: { allergens: draft.allergens, dietary: draft.dietary } }))
      // Named toast + Undo via the SHARED toast-undo system (lib/useToasts + ToastStack).
      showToast(`${item.name} confirmed`, 'success', {
        duration: 6000,
        action: { label: 'Undo', run: () => undoConfirm(item, prev) },
      })
    } finally {
      setConfirming(null)
    }
  }

  // Undo a confirm — reverse the write (restore prior allergens/dietary + prior verified) and return
  // the row to its unconfirmed UI (drop from sessionConfirmed; reset the draft to the prior selection).
  const undoConfirm = async (item: Item, prev: { allergens: string[]; dietary: string[]; verified: boolean }) => {
    try {
      await onUndoRow(item, prev.allergens, prev.dietary, prev.verified)
      setSessionConfirmed(s => { const n = new Set(s); n.delete(item.id); return n })
      // Drop the confirmed snapshot — the confirm is reversed, so there's no confirmed baseline to compare
      // to (the row returns to its prior, unconfirmed state; prev.verified is always false at confirm time).
      setConfirmedSnapshot(s => { const n = { ...s }; delete n[item.id]; return n })
      setDrafts(d => ({ ...d, [item.id]: { allergens: prev.allergens.filter(isVocab), dietary: prev.dietary } }))
    } catch { /* writeItemAllergens already reverted + toasted */ }
  }

  // The confirmed snapshot to COMPARE the live draft against: the explicit one stored at confirm time, or
  // — for a row that's verified with no explicit snapshot yet (confirmed in a PRIOR session) — its stored
  // verified data (vocab allergens + dietary, matching draftFor's representation). A never-confirmed,
  // unverified row has none → undefined (no baseline; auto-restore can't apply to it).
  const snapshotFor = (item: Item): { allergens: string[]; dietary: string[] } | undefined =>
    confirmedSnapshot[item.id]
    ?? (item.allergens_verified !== false
        ? { allergens: (item.allergens || []).filter(isVocab), dietary: item.dietary_info || [] }
        : undefined)
  // TRUE iff the row HAS a confirmed snapshot AND the live draft currently DIFFERS from it (exact,
  // order-independent set-equality on BOTH allergens and dietary). The single derived source for the
  // "changed"/amber/reverted UI — no one-way flag.
  const differsFromConfirmed = (item: Item) => {
    const snap = snapshotFor(item)
    if (!snap) return false
    const d = draftFor(item)
    return !(setEqual(d.allergens, snap.allergens) && setEqual(d.dietary, snap.dietary))
  }

  // A toggle on a row = an edit. We compare the resulting draft to the confirmed snapshot:
  //  • currently VERIFIED + now DIFFERS → flip to unconfirmed (verified=false in the DB, data unchanged)
  //    so the customer never sees an edited-but-unconfirmed selection; the operator must Confirm again.
  //    We also CAPTURE the snapshot we're leaving (for prior-session rows) so toggling back can restore it.
  //  • currently UNVERIFIED + now EXACTLY MATCHES the snapshot → AUTO-RESTORE verified=true (re-writes the
  //    confirmed data) — no explicit Confirm click needed; the customer sees the confirmed allergens again.
  const handleToggle = (item: Item, patch: Partial<{ allergens: string[]; dietary: string[] }>) => {
    if (!canEdit) return   // VIEW-only for non-owner/admin (server also rejects the write)
    const nextDraft = { ...draftFor(item), ...patch }   // the draft AFTER this toggle (setState is async)
    patchDraft(item, patch)   // #5: optimistic local draft → the tick + name pill update INSTANTLY
    const snap = snapshotFor(item)
    const matches = !!snap && setEqual(nextDraft.allergens, snap.allergens) && setEqual(nextDraft.dietary, snap.dietary)
    if (item.allergens_verified !== false) {
      // Verified → unverify ONLY if it now differs (a no-op toggle that lands back on the confirmed set
      // leaves it verified). Capture the leaving snapshot first so the round-trip back can auto-restore.
      if (!matches) {
        if (snap && !confirmedSnapshot[item.id]) setConfirmedSnapshot(s => (s[item.id] ? s : { ...s, [item.id]: snap }))
        setSessionConfirmed(s => { const n = new Set(s); n.delete(item.id); return n })
        // #5: DEFER the verified=false write (heavier parent re-render) one tick so the optimistic tick
        // paints first — same payload, just not blocking the click's paint. Data path unchanged.
        setTimeout(() => onEditUnverify(item), 0)
      }
    } else if (matches) {
      // Unverified, toggled back to the EXACT confirmed set → auto-re-verify (same write path as Confirm).
      const written = writtenAllergens(item, nextDraft)
      setSessionConfirmed(s => new Set(s).add(item.id))
      setTimeout(() => onConfirmRow(item, written, nextDraft.dietary), 0)
    }
    // else: unverified + still differs (or never-confirmed) → just the draft update; nothing to write.
  }

  // ── Per-row derived state + small shared render pieces (used by BOTH list and table views) ──
  const rowMeta = (item: Item) => {
    const draft = draftFor(item)
    const knownStale = (item.allergens || []).filter(a => !isVocab(a) && GENERIC_REPLACEMENTS[a])
    // `unresolved` = a detected generic with NO precise replacement picked yet. It now drives the WARNING
    // only — NOT a confirm block. WARN-but-allow: the operator can confirm with precise picks, or with
    // NONE (informed "no nuts" decision if the AI was wrong). The generic is dropped on confirm regardless.
    const unresolved = knownStale.filter(s => !GENERIC_REPLACEMENTS[s].some(p => draft.allergens.includes(p)))
    return {
      draft,
      knownStale,
      unresolved,
      canConfirm: true,                                     // confirm is NEVER blocked by a generic now
      verified: item.allergens_verified !== false,
      justConfirmed: sessionConfirmed.has(item.id),
    }
  }
  // Consequence-bearing warning text for an unresolved generic — the safety now lives in THIS text (the
  // operator is told that confirming with no precise pick = the dish shows as containing none of that family).
  const genericWarnText = (generics: string[]) => generics.map(s => {
    const fam = s.toLowerCase()
    return `“${s}” was detected but isn’t specific. Pick ${GENERIC_REPLACEMENTS[s].join(' and/or ')} if this dish contains ${fam} — or leave them unselected if it doesn’t.`
  }).join(' ')
  // Selected allergens/dietary as PILLS — REUSES the customer-page chip components (DRY: AllergenChip /
  // DietaryChip from @/components/MenuAllergenChips) so the operator previews exactly the customer view.
  // #9: rendered INLINE beside the dish name (not below) in the list view.
  const selectedPills = (draft: { allergens: string[]; dietary: string[] }) =>
    (draft.dietary.length > 0 || draft.allergens.length > 0) ? (
      <span className="inline-flex flex-wrap gap-1 align-middle">
        {draft.allergens.map(a => <AllergenChip key={a} label={a} />)}
        {draft.dietary.map(d => <DietaryChip key={d} label={d} />)}
      </span>
    ) : null
  // WARN (not block): shown while a detected generic is unresolved. The consequence text makes confirming
  // nut-free a deliberate, INFORMED choice — that's what keeps dropping the generic from under-warning.
  const staleWarn = (m: ReturnType<typeof rowMeta>) => m.unresolved.length === 0 ? null : (
    <p className="text-[11px] text-amber-700 font-semibold">⚠ {genericWarnText(m.unresolved)}</p>
  )
  const stateBadge = (m: ReturnType<typeof rowMeta>) =>
    m.justConfirmed && m.verified
      ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">✓ Confirmed</span>
      : m.verified
        ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">Confirmed</span>
        : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">Needs review</span>
  const confirmBtn = (item: Item, m: ReturnType<typeof rowMeta>) => {
    // #3: an edited-since-confirmed row reads "Confirm" (NOT "re-confirm") + a subtle "· changed" hint so
    // the operator sees why it needs confirming again. A verified row reads "Confirmed ✓" (disabled —
    // nothing to do; editing a toggle re-enables it). No "re-confirm" wording anywhere.
    const changed = differsFromConfirmed(item) && !m.verified
    return (
      // "· changed" hint STACKS below the Confirm button (keeps the Status column narrow; the row grows
      // only when the hint shows). items-center → button + hint CENTRED in the Status column (#1).
      <div className="flex flex-col items-center gap-0.5">
        <Btn
          label={confirming === item.id ? 'Confirming…' : m.verified ? 'Confirmed ✓' : 'Confirm'}
          colour={m.verified ? 'slate' : (m.canConfirm ? 'green' : 'slate')} size="sm" loading={confirming === item.id}
          disabled={!canEdit || m.verified || !m.canConfirm || confirming === item.id} onClick={() => handleConfirm(item)}
        />
        {changed && <span className="text-[10px] font-bold text-amber-600 leading-tight" title="Edited since you last confirmed — confirm again">· changed</span>}
      </div>
    )
  }
  const togglesBlock = (item: Item, draft: { allergens: string[]; dietary: string[] }) => (
    <>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Allergens</p>
      <AllergenToggles value={draft.allergens} onChange={next => handleToggle(item, { allergens: next })} />
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-2 mb-1">Dietary</p>
      <DietaryToggles value={draft.dietary} onChange={next => handleToggle(item, { dietary: next })} />
    </>
  )
  // #5: legacy-generic warning as a PROMINENT red "!" badge + a real (group-hover) tooltip with the full
  // text. Shows ONLY while unresolved (!m.canConfirm) — so it IS the block-until-precise signal; the
  // Confirm button stays disabled via m.canConfirm regardless. (Bug fixed: see report.)
  const warnMarker = (m: ReturnType<typeof rowMeta>) => {
    // WARN (not block): shown while a detected generic is unresolved; confirm is NOT gated. The tooltip
    // carries the consequence text. Renders via the portal WarnMarker (fixed tooltip, never clipped).
    if (m.unresolved.length === 0) return null
    return <WarnMarker text={genericWarnText(m.unresolved)} />
  }
  // Dishes in MENU ORDER, grouped by category (category order; uncategorised last). Shared by both views.
  const groupedItems = (() => {
    const byCat = new Map<string, Item[]>()
    items.forEach(i => { const k = i.category_id ?? '__none'; (byCat.get(k) ?? byCat.set(k, []).get(k)!).push(i) })
    return [
      ...categories.filter(c => byCat.has(c.id)).map(c => ({ name: c.name, rows: byCat.get(c.id)! })),
      ...(byCat.has('__none') ? [{ name: 'Uncategorised', rows: byCat.get('__none')! }] : []),
    ]
  })()

  // #5: SAVE & FINISH LATER — persists the chosen display mode, then closes. Per-row confirms were already
  // saved at confirm time (verified=true), and unconfirmed rows stay verified=false (hidden) — so partial
  // progress is fully persisted with NO requirement that every row be confirmed. On a save error we toast
  // and STAY OPEN (recoverable) rather than throwing/closing silently (#4: incomplete save must not throw).
  const finishWith = async (m: 'per_dish' | 'card' | 'both') => {
    setFinishing(true)
    try {
      await onSetDisplayMode(m)
      onClose()
    } catch (e: any) {
      showToast(e?.message || 'Couldn’t save — please try again', 'error')
    } finally {
      setFinishing(false)
    }
  }

  // CARD-ONLY finish: store the operator's VERBATIM text (no extraction), set display mode 'card', close.
  const [cardEditText, setCardEditText] = useState(cardText || '')
  const [cardTranscribing, setCardTranscribing] = useState(false)
  const transcribeCard = async (file: File) => {
    if (!onTranscribeCard) return
    setCardTranscribing(true)
    try { const t = await onTranscribeCard(file); if (t != null) setCardEditText(t) }
    catch { showToast('Couldn’t read that image — type or paste your card instead', 'error') }
    finally { setCardTranscribing(false) }
  }
  const finishCard = async () => {
    setFinishing(true)
    try {
      if (onSaveCard) await onSaveCard(cardEditText.trim())
      await onSetDisplayMode('card')
      onClose()
    } catch (e: any) {
      showToast(e?.message || 'Couldn’t save — please try again', 'error')
    } finally {
      setFinishing(false)
    }
  }

  const goBack = () => { setMode(0) }

  // ── Reusable Mode-1 review (shared by mode 1 and mode 3's review step) ────────────────────
  // Same data + per-row logic in BOTH layouts (re-confirm-on-edit, block-until-precise, toast/undo);
  // only the wrapper differs. The List ⇄ Table toggle picks the wrapper.
  const reviewHeader = (
    <div className="px-5 pt-4">
      <div className="flex items-center justify-between mb-1 gap-2">
        <p className="text-xs font-bold text-slate-600">{confirmedCount} of {items.length} confirmed</p>
        <div className="flex items-center gap-2">
          {allDone && <span className="text-xs font-bold text-green-600">✓ All confirmed</span>}
          {/* List ⇄ Table view toggle — layout only, same review data/logic. Slightly larger for clarity. */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-bold">
            <button onClick={() => setReviewView('list')} className={`px-4 py-1.5 ${reviewView === 'list' ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>List</button>
            <button onClick={() => setReviewView('table')} className={`px-4 py-1.5 ${reviewView === 'table' ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Table</button>
          </div>
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 transition-all" style={{ width: items.length ? `${(confirmedCount / items.length) * 100}%` : '0%' }} />
      </div>
      <p className="text-[11px] text-amber-700 mt-2">
        Detected from your menu — <strong>check these</strong>. Allergens stay hidden from customers until you confirm each dish.
      </p>
      {!canEdit && (
        <p className="text-[11px] text-slate-500 mt-1 font-semibold">👁 View only — only the owner can confirm or change allergens.</p>
      )}
    </div>
  )

  const reviewTable = (
    <>
      {reviewHeader}
      <div className="p-5 pt-3 overflow-y-auto flex-1 min-h-0">
        {items.length === 0 && <EmptyState icon="🍽️" title="No menu items" body="Add menu items first, then set their allergens here." />}

        {/* LIST view — one roomy card per dish, GROUPED BY CATEGORY in menu order (#7), no per-item
            category line (#8), selected pills INLINE beside the name (#9). */}
        {reviewView === 'list' && (
          <div className="flex flex-col gap-4">
            {groupedItems.map(g => (
              <div key={g.name} className="flex flex-col gap-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{g.name}</h4>
                {g.rows.map(item => {
                  const m = rowMeta(item)
                  return (
                    <div key={item.id} className="border border-slate-200 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-bold text-slate-900">{item.name}</span>
                          {selectedPills(m.draft)}
                        </div>
                        {stateBadge(m)}
                      </div>
                      {/* LIST: the explicit staleWarn paragraph is the single legacy-generic warning here
                          (room for the full text); the compact ! marker is TABLE-only to avoid doubling. */}
                      <div className="mb-2">{staleWarn(m)}</div>
                      {togglesBlock(item, m.draft)}
                      <div className="flex justify-end mt-3">{confirmBtn(item, m)}</div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* TABLE view — a category-grouped MATRIX: allergens (amber) + dietary (green) as COLUMN
            headers, dishes as rows, a tick per cell. Same per-row data/logic as the list (handleToggle,
            rowMeta, block-until-precise via confirmBtn's m.canConfirm) — only the layout differs.
            Horizontally scrollable (15 allergen + 6 dietary columns); the dish/confirm column is frozen
            left so the row label + Confirm stay visible while scrolling the wide matrix. */}
        {reviewView === 'table' && items.length > 0 && (() => {
          const A = ALLERGEN_VOCAB.length, D = DIETARY_VOCAB.length
          // Combined column list (allergens then dietary) — gives each column a stable index for the
          // alternating shading (#4) and one shared tick renderer.
          const COLUMNS = [
            ...ALLERGEN_VOCAB.map(label => ({ label, tone: 'allergen' as const })),
            ...DIETARY_VOCAB.map(label => ({ label, tone: 'diet' as const })),
          ]
          const stripe = (i: number) => (i % 2 ? 'bg-slate-50/70' : '')   // allergen column shading (tracking)
          const COL_W = 56                                                 // ONE uniform width for EVERY tag column (table-fixed enforces it → equal grid + consistent 2-line wrap)
          // #2: SINGLE SOURCE for the frozen Dish width — used by the colgroup, the Status sticky-left
          // offset, and TABLE_W, so they can't drift apart. Widened from 200 so long names fit.
          const DISH_COL_W = 252
          const STATUS_COL_W = 118                                         // #1: tight — fits "Confirmed ✓"; "· changed" stacks BELOW the button (doesn't widen the column)
          const STATUS_W = 'whitespace-nowrap'                            // keep the Confirm button on one line within its column
          // ONLY the LEFT border (not all four sides) — `border-l-slate-400`, NOT `border-slate-400` — so
          // the first dietary column gets a single boundary line and otherwise matches the other cells.
          const DIVIDER = 'border-l-2 border-l-slate-400'
          const TABLE_W = DISH_COL_W + STATUS_COL_W + COLUMNS.length * COL_W   // explicit width so table-layout:fixed ENGAGES (enforces the colgroup widths)
          // SIMPLE binary tick: ON = solid ✓, OFF = empty (no greyed/hover intermediate on the glyph).
          // #5(prev): the toggled cell on an edited-after-confirm row is highlighted amber. Dietary block
          // tinted green; cells bordered so allergen + dietary are uniformly BOXED (#7).
          const cell = (item: Item, m: ReturnType<typeof rowMeta>, c: { label: string; tone: 'allergen' | 'diet' }, i: number) => {
            const draftArr = c.tone === 'allergen' ? m.draft.allergens : m.draft.dietary
            const active = draftArr.includes(c.label)
            const next = active ? draftArr.filter(x => x !== c.label) : [...draftArr, c.label]
            const toggle = () => handleToggle(item, c.tone === 'allergen' ? { allergens: next } : { dietary: next })
            // Highlight the cell only if it differs from the CONFIRMED snapshot (the baseline), and only
            // while the row is in the "changed" (differs + unverified) state.
            const snap = snapshotFor(item)
            const snapHas = snap ? (c.tone === 'allergen' ? snap.allergens : snap.dietary).includes(c.label) : false
            const changedCell = differsFromConfirmed(item) && !m.verified && active !== snapHas
            const bg = changedCell ? 'bg-amber-200' : c.tone === 'diet' ? 'bg-green-50/40' : stripe(i)
            return (
              <td key={c.label} className={`p-0 text-center border-b border-r border-slate-100 ${bg} ${i === A ? DIVIDER : ''}`}>
                <button type="button" disabled={!canEdit} onClick={toggle} aria-pressed={active} aria-label={c.label}
                  className={`w-full h-11 flex items-center justify-center text-base font-bold ${active ? 'text-slate-800' : 'text-transparent'} ${canEdit && !active ? 'hover:bg-slate-100/70' : ''} ${canEdit ? '' : 'cursor-default'}`}>
                  ✓
                </button>
              </td>
            )
          }
          // (c) ONE measured offset: category rows stick at the thead height, with a 1px overlap so any
          // sub-pixel rounding tucks UNDER the sticky thead instead of showing a gap.
          const catTop = Math.ceil(headerH) - 1
          return (
            // The wrapper is the scroll container (both axes): the sticky <thead> holds the header on
            // vertical scroll AND the frozen columns hold on horizontal scroll.
            <div className="overflow-auto -mx-1 max-h-[60vh]">
              {/* table-fixed + explicit TABLE_W → uniform enforced columns. (b) border-separate +
                  border-spacing:0 → each cell paints its OWN borders (single-side: border-r + border-b),
                  which TRAVEL with sticky cells — no detached-border seams (no inset-shadow hack needed). */}
              <table className="table-fixed border-separate border-spacing-0 text-sm" style={{ width: TABLE_W }}>
                <colgroup>
                  <col style={{ width: DISH_COL_W }} />
                  <col style={{ width: STATUS_COL_W }} />
                  {COLUMNS.map(c => <col key={c.label} style={{ width: COL_W }} />)}
                </colgroup>
                {/* (a) the WHOLE thead is ONE sticky unit (top:0) → the group row + label row have NO
                    inter-layer offset, so the gap between them is gone by construction. */}
                <thead ref={theadRef} className="sticky top-0 z-30">
                  {/* group headers spanning the allergen + dietary blocks */}
                  <tr>
                    <th colSpan={2} className="sticky left-0 z-40 bg-white h-6 border-b border-r border-slate-200" />
                    <th colSpan={A} className="bg-amber-100 border-b border-r border-slate-200 text-center text-[11px] font-bold text-amber-700 uppercase tracking-wide py-1">Allergens</th>
                    <th colSpan={D} className={`bg-green-100 border-b border-r border-slate-200 ${DIVIDER} text-center text-[11px] font-bold text-green-700 uppercase tracking-wide py-1`}>Dietary</th>
                  </tr>
                  {/* per-column labels (horizontal, centred, hyphenated 2-line wrap). Dish frozen always;
                      Status frozen on sm+ only (req 2). */}
                  <tr>
                    <th style={{ width: DISH_COL_W }} className="sticky left-0 z-40 bg-white h-12 border-b border-r border-slate-200 text-left text-[11px] font-bold text-slate-900 uppercase tracking-wide px-2 align-bottom pb-2">Dish</th>
                    <th style={{ left: DISH_COL_W }} className={`static sm:sticky z-40 bg-white ${STATUS_W} h-12 border-b border-r border-slate-200 text-center text-[11px] font-bold text-slate-900 uppercase tracking-wide px-2 align-bottom pb-2`}>Status</th>
                    {COLUMNS.map((c, i) => (
                      <th key={c.label} className={`bg-white h-12 px-0.5 py-1 align-middle text-center text-[11px] font-bold text-slate-900 leading-tight hyphens-auto break-words border-b border-r border-slate-100 ${i === A ? DIVIDER : ''}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupedItems.map(g => (
                    <Fragment key={g.name}>
                      {/* category row — SPLIT into 3 cells so (a) the allergen|dietary DIVIDER continues
                          through it (a real border-l on the dietary segment, aligned with the dish-row
                          dividers) and (b) the LABEL pins to the frozen Dish+Status zone on horizontal
                          scroll. All sticky-TOP at catTop (1px overlap tucks under the thead); the label
                          cell is also sticky-LEFT so "MAINS" stays visible when scrolling right. */}
                      <tr>
                        {/* label cell z-[25] > the scrolling segments (z-20) so the pinned label is NEVER
                            covered by the grey allergen segment scrolling under it (the "MA…/DE…" clip). */}
                        <td colSpan={2} className="sticky left-0 z-[25] bg-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 py-1 border-t border-b border-r border-slate-200" style={{ top: catTop }}>{g.name}</td>
                        <td colSpan={A} className="sticky z-20 bg-slate-100 border-t border-b border-slate-200" style={{ top: catTop }} />
                        <td colSpan={D} className={`sticky z-20 bg-slate-100 border-t border-b border-slate-200 ${DIVIDER}`} style={{ top: catTop }} />
                      </tr>
                      {g.rows.map(item => {
                        const m = rowMeta(item)
                        const reverted = differsFromConfirmed(item) && !m.verified
                        return (
                          // ONE row per dish — name (+ red !) | Status/Confirm | tick cells.
                          <tr key={item.id}>
                            {/* frozen Dish (always). Real border-r travels under border-separate. z-10. */}
                            <td style={{ width: DISH_COL_W }} className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-2 py-2.5 align-top">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-900 truncate">{item.name}</span>
                                {warnMarker(m)}
                              </div>
                              <div className="mt-1">{selectedPills(m.draft)}</div>
                            </td>
                            {/* Status frozen on sm+ ONLY (req 2): on a narrow phone it scrolls so the
                                frozen pair (Dish+Status) doesn't fill the viewport. */}
                            <td style={{ left: DISH_COL_W }} className={`static sm:sticky z-10 ${STATUS_W} border-b border-r border-slate-200 px-2 py-2.5 align-middle text-center ${reverted ? 'bg-amber-50' : 'bg-white'}`}>
                              {confirmBtn(item, m)}
                            </td>
                            {COLUMNS.map((c, i) => cell(item, m, c, i))}
                          </tr>
                        )
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })()}
      </div>
    </>
  )

  // ── Reusable Mode-2 card panel (shared by mode 2 and mode 3's card step) ──────────────────
  // Drives the EXISTING (folded-in) card upload/text modal + process-allergens extractor via
  // onAddCard; reads the saved card from the truck-level props (cardText / cardUrl).
  const cardPanel = (
    <div className="p-5 overflow-y-auto flex flex-col gap-4">
      <p className="text-[11px] text-amber-700">
        Customers will see this card as the menu&apos;s allergen reference. Per-dish allergens stay hidden in card-only mode (your dish data is kept for if you switch to per-dish later).
      </p>
      {cardProcessing ? (
        <div className="border border-slate-200 rounded-xl p-6 flex items-center gap-3">
          <Spinner /><p className="text-sm text-slate-500">Reading allergen information…</p>
        </div>
      ) : cardText ? (
        <div className="border border-green-100 bg-green-50 rounded-xl p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-slate-900">🛡️ Allergen card saved</p>
          <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-6">{cardText}</p>
          {cardUrl && <a href={cardUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 underline">View original card</a>}
          {canEdit && <div><Btn label="Replace card" colour="slate" size="sm" onClick={onAddCard} /></div>}
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl p-6 flex flex-col items-center text-center gap-3">
          <div className="text-3xl">🛡️</div>
          <p className="text-xs text-slate-500 max-w-xs">Upload your allergen card (photo/PDF) or paste your allergen info — our AI structures it for customers.</p>
          {canEdit
            ? <Btn label="Add allergen card" onClick={onAddCard} />
            : <p className="text-[11px] text-slate-500 font-semibold">👁 View only — only the owner can add the allergen card.</p>}
        </div>
      )}
    </div>
  )

  const subtitle =
    mode === 0 ? 'Choose how customers see allergen info'
      : mode === 2 ? 'Add your allergen card'
        : mode === 3 ? 'Add an allergen card (optional)'
          : 'Check & confirm each dish'

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      {/* Unified shell — matches the import wizard shell (bg-black/60, items-center, shadow-2xl) so the
          Allergens review/chooser is visually identical to Menu/Extras/Kitchen. The matrix (Table) review
          uses a wider modal so the columns aren't cramped; everything else stays the compact 2xl. */}
      <div className={`bg-white rounded-2xl w-full shadow-2xl flex flex-col ${(mode === 1 && reviewView === 'table') ? 'max-w-6xl max-h-[90vh]' : 'max-w-2xl h-[70vh] max-h-[90vh]'}`}>
        {/* Header — #5: no top-left back arrow; navigation lives in the bottom button row. In the IMPORT
            context the import step-progress stepper replaces the standalone subtitle so the review reads as
            part of the wizard flow (Menu · Extras · Allergens · Kitchen setup). */}
        <div className="p-5 border-b border-slate-200 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">{importStepper ? 'Allergens' : 'Allergen setup'}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none flex-shrink-0">✕</button>
          </div>
          {importStepper ? importStepper : <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>

        {/* STEP 1 — mode chooser (2 MUTUALLY-EXCLUSIVE modes; "both" removed — one source of truth.
            Per-dish already yields a derivable card, so a separate maintained card+per-dish mode is gone). */}
        {mode === 0 && (
          <>
            <div className="p-5 overflow-y-auto flex-1 min-h-0">
              {/* DRY: the SHARED chooser (also used by the import Allergens step) — can't drift. #4: select then Next. */}
              <AllergenModeChooser value={chooserMode} onChange={setChooserMode} />
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end shrink-0">
              {/* per-dish → card-upload page (3) when card matching is wired (#6); else straight to review (1). card → 2. */}
              <Btn label="Next →" disabled={!chooserMode} onClick={() => setMode(chooserMode === 'card' ? 2 : (onProcessCard ? 3 : 1))} />
            </div>
          </>
        )}

        {/* MODE 3 — per-dish CARD-UPLOAD page (#6, standalone). Shared <CardUploadPage>; matches the card
            against COMMITTED items (exact-only) + merges (setEqual-guarded). Then → review (1). */}
        {mode === 3 && (
          <>
            <div className="p-5 overflow-y-auto flex-1 min-h-0 flex flex-col gap-4">
              <CardUploadPage
                perDish
                anyDetected={items.some(i => (i.allergens || []).length > 0)}
                parsed={stdCardParsed}
                processing={stdCardProcessing}
                showUpload={stdShowUpload}
                onShowUpload={() => setStdShowUpload(true)}
                file={stdCardFile}
                onFile={setStdCardFile}
                text={stdCardText}
                onText={setStdCardText}
                onProcess={handleStandaloneCardProcess}
                onCancelUpload={() => { setStdShowUpload(false); setStdCardFile(null); setStdCardText('') }}
                matchResult={stdCardMatch}
                resolvedKeys={stdResolved}
                dishes={items.map(i => ({ id: i.id, name: i.name }))}
                onAssign={(entry, dishId) => { void assignStandaloneEntry(entry, dishId) }}
                onDismiss={dismissStandaloneEntry}
                blanketOptIn={stdBlanket}
                onBlanketToggle={setStdBlanket}
              />
            </div>
            <div className="p-4 border-t border-slate-200 flex items-center gap-2 shrink-0">
              <Btn label="← Back" colour="slate" onClick={() => setMode(0)} />
              <div className="flex-1" />
              <Btn label="Next →" onClick={() => setMode(1)} />
            </div>
          </>
        )}

        {/* MODE 1 — per-dish review. #5: no top-left arrow; Back + Skip + Done at the BOTTOM. */}
        {mode === 1 && (
          <>
            {reviewTable}
            {canEdit ? (
              <div className="p-4 border-t border-slate-200 flex items-center gap-2 shrink-0">
                <Btn label="← Back" colour="slate" onClick={() => onBack ? onBack() : setMode(onProcessCard ? 3 : 0)} />
                <div className="flex-1" />
                {/* Skip = defer, save AS-IS (per-row confirms already persisted; this doesn't confirm anything).
                    ALWAYS available (the escape hatch) — never disabled, so the operator is never trapped when
                    "Next" is greyed pending all-confirmed. Wording ties to the active-gated visibility rule. */}
                <Btn label={importStepper ? 'Skip Allergen setup for now' : 'Skip for now'} colour="ghost" onClick={onClose} />
                {importStepper
                  ? /* IMPORT: "Next" — a wizard step; greyed until EVERY dish is confirmed (allDone). */
                    <Btn label={finishing ? 'Saving…' : 'Next →'} colour="green" loading={finishing} disabled={finishing || !allDone} onClick={() => finishWith('per_dish')} />
                  : <Btn label={finishing ? 'Saving…' : allDone ? 'Done' : 'Save & finish later'} colour={allDone ? 'green' : 'slate'} loading={finishing} disabled={finishing} onClick={() => finishWith('per_dish')} />}
              </div>
            ) : (
              <div className="p-4 border-t border-slate-200 flex justify-end shrink-0"><Btn label="Close" colour="slate" onClick={onClose} /></div>
            )}
            {canEdit && <p className="px-4 pb-3 -mt-1 text-[11px] text-slate-400">{importStepper && !allDone
              ? 'Confirm every dish to continue — or “Skip Allergen setup for now”.'
              : 'Skip defers — dishes you haven’t confirmed stay hidden from customers until their allergens are confirmed.'}</p>}
          </>
        )}

        {/* MODE 2 — CARD-ONLY editor (verbatim; NO extraction, NO chips). Stores the operator's text as-is. */}
        {mode === 2 && (
          <>
            <div className="p-5 overflow-y-auto flex-1 min-h-0">
              <CardOnlyEditor
                value={cardEditText}
                onChange={setCardEditText}
                onTranscribe={transcribeCard}
                transcribing={cardTranscribing}
                canEdit={canEdit}
              />
            </div>
            <div className="p-4 border-t border-slate-200 flex items-center gap-2 shrink-0">
              <Btn label="← Back" colour="slate" onClick={() => setMode(0)} />
              <div className="flex-1" />
              {canEdit
                ? <Btn label={finishing ? 'Saving…' : 'Finish'} colour="green" loading={finishing} disabled={!cardEditText.trim() || finishing} onClick={finishCard} />
                : <Btn label="Close" colour="slate" onClick={onClose} />}
            </div>
          </>
        )}

      </div>
    </div>
  )
}

function MenuTab({ truck, categories, items, subcategories, token, modifierGroups, modifierOptions, itemModGroups, setItemModGroups, api, reload, showToast, allergenWizardOpen, onCloseAllergenWizard, onOpenAllergenWizard, canEditAllergens, onWalkthroughChoice, onVerifySuccess }: {
  truck: Truck; categories: Category[]; items: Item[]; subcategories: Subcategory[]; token: string
  modifierGroups: ModifierGroup[]; modifierOptions: ModifierOption[]; itemModGroups: {menu_item_id:string;group_id:string;excluded_option_ids?:string[]}[]
  setItemModGroups: React.Dispatch<React.SetStateAction<{menu_item_id:string;group_id:string;excluded_option_ids?:string[]}[]>>
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: ShowToast
  allergenWizardOpen: boolean; onCloseAllergenWizard: () => void; onOpenAllergenWizard: () => void
  canEditAllergens: boolean   // owner/admin — gates the allergen edit affordances (server also enforces)
  /** K2: the done screen's three-way offer. The PAGE owns the stored state — this only reports the click. */
  onWalkthroughChoice: (choice: 'now' | 'later' | 'never') => void
  /** T1: hands verified events to the SAME editable modal Settings uses (ScheduleTab's), plus a
   *  completion callback so the wizard can advance itself once they are saved. */
  onVerifySuccess: (events: unknown[], onSaved?: () => void) => void
}) {
  // §54: an item's attached option groups, split required vs optional via the source-of-truth
  // minRequiredForGroup (is_required OR min_choices>=1). The manage-local ModifierGroup has no
  // `options`, so we spread {options:[]} for the helper (it only reads is_required/min_choices).
  // REQUIRED → teal option-names line after the price (with surcharges); OPTIONAL → sky group-title
  // badge in the tag row. Data already in scope (modifierOptions plumbed; no fetch).
  const groupsForItem = (itemId: string): ModifierGroup[] => itemModGroups
    .filter(x => x.menu_item_id === itemId)
    .map(x => modifierGroups.find(g => g.id === x.group_id))
    .filter((g): g is ModifierGroup => !!g)
  const requiredGroupsFor = (itemId: string) => groupsForItem(itemId).filter(g => minRequiredForGroup({ ...g, options: [] }) > 0)
  const optionalGroupsFor = (itemId: string) => groupsForItem(itemId).filter(g => minRequiredForGroup({ ...g, options: [] }) === 0)
  const [editingCat, setEditingCat] = useState<Partial<Category> | null>(categories[0] ? categories[0] as any : null)
  const [editingItem, setEditingItem] = useState<Partial<Item> | null>(null)
  const [deletingItem, setDeletingItem] = useState<Item | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingItemPhoto, setUploadingItemPhoto] = useState(false)
  // PRE-ORDER (V7.8 global-config): the item editor now has ONLY an include toggle (preorder_enabled);
  // timing/action live globally in Settings → Pre-orders. No per-item bulk picker here anymore.
  const preorderCan = canAccess(truck.plan, 'advance_preordering', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)

  // Optimistic local item state — mirrors `items` prop but updates instantly on toggle/delete
  const [localItems, setLocalItems] = useState<Item[]>(items)
  const prevItemsRef = useRef(items)
  if (prevItemsRef.current !== items) { prevItemsRef.current = items; setLocalItems(items) }

  // Optimistic local sub-category state — mirrors `subcategories` prop, updated instantly on
  // add/delete/reorder (display-only labels; no capacity/stock/prep).
  const [localSubcats, setLocalSubcats] = useState<Subcategory[]>(subcategories)
  const prevSubcatsRef = useRef(subcategories)
  if (prevSubcatsRef.current !== subcategories) { prevSubcatsRef.current = subcategories; setLocalSubcats(subcategories) }
  const [newSubcatName, setNewSubcatName] = useState('')
  const [subcatModalCat, setSubcatModalCat] = useState<string | null>(null)   // category_id whose "Manage sub-categories" modal is open
  const [editingSubcatId, setEditingSubcatId] = useState<string | null>(null) // sub-category row in tap-to-rename mode
  const [editingSubcatName, setEditingSubcatName] = useState('')              // rename text buffer

  // Sub-categories for a given category, sorted by sort_order.
  const subcatsFor = (categoryId: string | null | undefined) =>
    !categoryId ? [] : localSubcats.filter(s => s.category_id === categoryId).sort((a, b) => a.sort_order - b.sort_order)

  // Create (or reactivate) a sub-category in a category, refresh local state, return the saved row.
  const createSubcategory = async (categoryId: string, name: string): Promise<Subcategory | null> => {
    const trimmed = name.trim()
    if (!trimmed || !categoryId) return null
    try {
      const res = await api('upsert_subcategory', { category_id: categoryId, name: trimmed })
      const sc = res.subcategory as Subcategory
      if (sc) setLocalSubcats(prev => prev.some(s => s.id === sc.id) ? prev.map(s => s.id === sc.id ? sc : s) : [...prev, sc])
      return sc ?? null
    } catch (e: any) { showToast(e.message || 'Failed to add sub-category', 'error'); return null }
  }

  // Delete a sub-category (empty-guarded server-side); show a clear message when it has items.
  const deleteSubcategory = async (sc: Subcategory) => {
    try {
      const res = await api('delete_subcategory', { id: sc.id })
      if (res?.ok === false && res.error === 'not_empty') {
        showToast(`Move or remove its ${res.count} item${res.count === 1 ? '' : 's'} first`, 'error'); return
      }
      setLocalSubcats(prev => prev.filter(s => s.id !== sc.id))
    } catch (e: any) {
      showToast(e.message || 'Failed to delete sub-category', 'error')
    }
  }

  // Reorder by swapping an adjacent pair's sort_order (one update_subcategory_order call per row).
  const moveSubcat = async (categoryId: string, scId: string, dir: -1 | 1) => {
    const list = subcatsFor(categoryId)
    const idx = list.findIndex(s => s.id === scId)
    const swapIdx = idx + dir
    if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return
    const a = list[idx], b = list[swapIdx]
    setLocalSubcats(prev => prev.map(s => s.id === a.id ? { ...s, sort_order: b.sort_order } : s.id === b.id ? { ...s, sort_order: a.sort_order } : s))
    try {
      await api('update_subcategory_order', { id: a.id, sort_order: b.sort_order })
      await api('update_subcategory_order', { id: b.id, sort_order: a.sort_order })
    } catch (e: any) { showToast(e.message || 'Failed to reorder', 'error') }
  }

  // Rename a sub-category by id, refresh local state. Same upsert action as create (edit-by-id).
  const renameSubcategory = async (sc: Subcategory, name: string) => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === sc.name) { setEditingSubcatId(null); return }
    try {
      const res = await api('upsert_subcategory', { id: sc.id, name: trimmed })
      const updated = res.subcategory as Subcategory
      if (updated) setLocalSubcats(prev => prev.map(s => s.id === updated.id ? updated : s))
    } catch (e: any) { showToast(e.message || 'Failed to rename sub-category', 'error') }
    setEditingSubcatId(null)
  }
  const [importStep, setImportStep] = useState<ImportStep>('idle')
  // DEMO→REAL MIGRATION: set when this import was bootstrapped from a claimed demo's stored extraction
  // (deep-linked with ?import=demo from the setup wizard). It makes the ONE commit clear-before-retry, so
  // a retry after a partial commit repairs instead of duplicating. Never set for a normal operator import.
  const [demoImportMode, setDemoImportMode] = useState(false)
  // C3 — the confirmation beat, carried across the navigation that used to lose it. TRUE only from the
  // moment the ?import=demo bootstrap arrives until the operator leaves the first step, so it shows once
  // per arrival and never on a later reopen from "✨ Import menu". Set by the bootstrap (both routes),
  // cleared by every control that advances or exits.
  const [showSetupIntro, setShowSetupIntro] = useState(false)
  const demoImportTried = useRef(false)   // one-shot guard so the bootstrap can't re-fire on re-render
  // §65: the review is a 3-step wizard (1 Menu · 2 Extras · 3 Allergens). All edits live in
  // importResult, so stepping back/forward never loses progress — each step is just a different view.
  const [reviewStep, setReviewStep] = useState(1)
  // ── I1: CATEGORY EDITING IN THE REVIEW STEP ──────────────────────────────────────────────────────
  // ONE piece of state for both rename and add: `from` is the category being renamed, or '' when adding.
  // A category name can never be '' (validateCatName rejects it), so the two cases can share the slot
  // without a second flag and without the ambiguity a nullable "mode" field would carry.
  const [catEdit, setCatEdit] = useState<{ from: string; value: string } | null>(null)
  const [catEditError, setCatEditError] = useState<string | null>(null)
  // M4: the category pending deletion, and where its items should go. `moveTo` is '' until the operator
  // picks — an empty category needs no target and deletes straight away, so this state only ever holds
  // a name for the with-items case.
  const [catDeleting, setCatDeleting] = useState<{ name: string; moveTo: string } | null>(null)
  // ── Import ALLERGENS step (card→dish matching). The card-matched allergens are STAGED into importResult
  // items (menu-detected ∪ card, _allergensChecked stays false) → commit writes verified=false → the
  // existing allergen wizard opens POST-commit for row-by-row confirm (no forked review surface, no new
  // write path). NOTHING here makes anything customer-visible — that's the post-commit confirm's job.
  const [cardImportParsed, setCardImportParsed] = useState<{ entries?: CardEntry[]; blanket?: string[]; cross_contamination?: string[]; formatted_text?: string; summary?: string; contains?: string[]; may_contain?: string[]; dietary_options?: string[]; additional_notes?: string } | null>(null)
  const [cardImportMatch, setCardImportMatch] = useState<CardMatchResult | null>(null)
  const [cardImportProcessing, setCardImportProcessing] = useState(false)
  const [cardImportDone, setCardImportDone] = useState(false)                 // a card was parsed this import → open wizard post-commit + save the artifact
  const [cardBlanketOptIn, setCardBlanketOptIn] = useState(false)             // DEFAULT OFF — operator opts in to apply blanket may-contain to all dishes
  const [cardEntriesResolved, setCardEntriesResolved] = useState<Set<string>>(new Set())  // unmatched/ambiguous entry keys the operator has assigned or dismissed
  // Allergens step sub-screens: 'prompt' (detected + optional card upload) → 'chooser' (per-item vs card
  // DISPLAY mode — detection ≠ display; the detected data is retained-but-hidden regardless of choice).
  // Allergens step sub-screens: 'chooser' (structure: per-dish vs card) → 'card' (shared card-upload page,
  // both branches) → 'review' (per-dish staged review). Card branch skips 'review' (goes to Kitchen).
  const [allergenSubStep, setAllergenSubStep] = useState<'chooser' | 'card' | 'review'>('chooser')
  // The chosen DISPLAY mode, applied at commit (update_settings). null = operator skipped (no mode change;
  // detected data stays verified=false / retained-but-hidden, reviewable later from the Menu allergen card).
  const [pendingDisplayMode, setPendingDisplayMode] = useState<'per_dish' | 'card' | null>(null)
  // ── H2: EVERY WIZARD STEP OPENS AT THE TOP ────────────────────────────────────────────────────────
  // 🔴 THE SCROLL CONTAINER IS THE MODAL'S OWN BODY, NOT `<main>` AND NOT THE WINDOW. Every wizard step
  // is a `fixed inset-0` overlay, so it sits OUTSIDE the app-shell's scrolling `<main>` entirely — the
  // reference manual's `<main>`-has-no-top-padding contract is untouched by this and must stay that way.
  // Each step's body is its own `overflow-y-auto flex-1 min-h-0` div, and one ref serves all of them
  // because the steps are mutually exclusive on importStep — only ever one is mounted.
  //
  // Menu → Extras is the case that made this visible, and it is the hardest one: those two share ONE
  // mounted div (they differ only by reviewStep), so React never remounts it and the scroll offset from
  // the menu list survives into a much shorter Extras page — landing the operator mid-view with the
  // heading above the fold. Keying the effect on reviewStep and allergenSubStep as well as importStep is
  // what covers the same-element transitions; a remount-only fix would miss exactly the reported bug.
  const wizardScrollRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    // Nothing is mounted on the stepless screens (offer/upload/done) — optional-chained, not guarded.
    wizardScrollRef.current?.scrollTo({ top: 0 })
  }, [importStep, reviewStep, allergenSubStep])
  // Shared card upload inputs (file OR pasted text) — same affordances as the menu-import upload (DRY).
  const [cardImportFile, setCardImportFile] = useState<File | null>(null)
  const [cardImportText, setCardImportText] = useState('')
  const [showCardUpload, setShowCardUpload] = useState(false)   // the file/text inputs are revealed only after clicking "Upload allergen card"
  // CARD-ONLY display mode (import): the operator's VERBATIM card text + image-transcribe state. Separate
  // from the per-dish CardUploadPage state above so the card path never runs extraction. Saved verbatim at commit.
  const [importCardOnlyText, setImportCardOnlyText] = useState('')
  const [importCardOnlyTranscribing, setImportCardOnlyTranscribing] = useState(false)
  const [wizardInitialMode, setWizardInitialMode] = useState<0 | 1 | 2>(0)   // 1 → open the post-commit wizard straight at the per-dish review (import per-item), skipping its chooser
  // ── SCHEDULE STEP (SETUP MODE ONLY) — reached AFTER the menu is committed (commit-first). Wires the
  // EXISTING ScheduleTab flows into the wizard: verify-schedule-url (Route A), process-schedule +
  // upsert_event (Route B). Nothing here is critical — the menu is already durable; every route can be
  // left. State is local to the wizard; ScheduleTab is untouched.
  // Route C is DELIBERATELY STATELESS: it is explanatory copy + Continue, nothing more. It used to carry a
  // one-date manual form (venue/date/town/postcode/start/end + schedSaveManual); that was REMOVED — a wizard
  // step is the wrong place for a schedule manager and the Schedule tab already does this properly. Do not
  // reintroduce it here.
  const [scheduleRoute, setScheduleRoute] = useState<'chooser' | 'website' | 'photo' | 'manual'>('chooser')
  const [finishingSetup, setFinishingSetup] = useState(false)   // set setup_step='done' in flight
  // Route A (website)
  const [schedUrl, setSchedUrl] = useState('')
  const [schedVerifying, setSchedVerifying] = useState(false)
  const [schedVerifyError, setSchedVerifyError] = useState<string | null>(null)
  const [schedVerifiedEvents, setSchedVerifiedEvents] = useState<any[] | null>(null)   // display-only (Verify returns these; the scraper will pick them up)
  // Route B (photo/text)
  const [schedFile, setSchedFile] = useState<File | null>(null)
  const [schedText, setSchedText] = useState('')
  const [schedPhotoProcessing, setSchedPhotoProcessing] = useState(false)
  const [schedExtracted, setSchedExtracted] = useState<any[] | null>(null)
  const [schedSaving, setSchedSaving] = useState(false)
  // Route C (add my dates myself) — NO STATE. Copy + Continue only; see the note above.
  // §68 (Stage B): per-(virtual-group, category) expand state for the step-2 matrix (mirrors manage's catOpen).
  const [importCatOpen, setImportCatOpen] = useState<Record<string, boolean>>({})
  // Grouping chooser (step 2): per-row grouped|separate selection. Absent key = 'grouped' (default).
  const [groupingChoice, setGroupingChoice] = useState<Record<string, 'grouped' | 'separate'>>({})
  // Kitchen-setup Total capacity — held in IMPORT state + written to the van(s) ONLY at commit (NOT a
  // live van write: the van already exists, so a live write would change the truck's ceiling immediately
  // and leak past a Cancel/discard). Seeded from the van's current values at import load. `dirty` gates
  // the commit write so we don't clobber an unchanged value.
  const [importKitchenCapacity, setImportKitchenCapacity] = useState<{ kitchen_capacity: number | null; capacity_window_mins: number | null }>({ kitchen_capacity: null, capacity_window_mins: 5 })
  const [importVans, setImportVans] = useState<{ id: string; kitchen_capacity: number | null; capacity_window_mins: number | null }[]>([])
  // ── K1: THE SETTINGS REVIEW SCREEN ────────────────────────────────────────────────────────────────
  // 🔴 LIVE VALUES ONLY. These are seeded from a fresh `get_vans` read and from the truck row, never
  // from an assumed default — several of these columns' defaults are not recorded in the repo, and
  // rendering a guess as if it were the stored value is the one thing this screen must not do. Null
  // means "not loaded yet" and the row renders disabled rather than pretending.
  const [reviewVan, setReviewVan] = useState<{ id: string; kitchen_capacity: number | null; order_ready_enabled: boolean; buzzer_count: number | null } | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  // Truck-level mirrors, seeded from the live row. Optimistic: the write is fired and the mirror moves
  // with it, exactly as Settings' own rows do. MenuTab has no onTruckUpdate, so the parent `truck` is
  // refreshed by the normal reload on exit — these mirrors only need to survive this screen.
  const [reviewAllowCancel, setReviewAllowCancel] = useState<boolean>(truck.allow_customer_cancellation ?? true)
  const [reviewCancelMins, setReviewCancelMins] = useState<number>(truck.cancellation_cutoff_mins ?? 30)
  const [reviewAutoAccept, setReviewAutoAccept] = useState<boolean>(!!truck.auto_accept)
  // Load the van's LIVE values when the review screen opens. Uses the EXISTING `get_vans` action — no
  // new endpoint — and re-seeds the truck mirrors from the row we already hold, so re-entering the step
  // never shows a stale figure. Declared HERE, immediately after the state it writes: placed any higher
  // it reads setters before their declaration, which is a real TDZ hazard, not a lint quibble.
  useEffect(() => {
    if (importStep !== 'settings') return
    let alive = true
    // Seeding state on entry is the whole job of this effect — there is nowhere else the "step just
    // opened" moment exists.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewLoading(true)
    setReviewAllowCancel(truck.allow_customer_cancellation ?? true)
    setReviewCancelMins(truck.cancellation_cutoff_mins ?? 30)
    setReviewAutoAccept(!!truck.auto_accept)
    ;(async () => {
      try {
        const r = await api('get_vans')
        const v = (r.vans || [])[0]
        if (alive && v) setReviewVan({ id: v.id, kitchen_capacity: v.kitchen_capacity ?? null, order_ready_enabled: !!v.order_ready_enabled, buzzer_count: v.buzzer_count ?? null })
      } catch { /* non-fatal — the rows render disabled rather than guessing a value */ }
      finally { if (alive) setReviewLoading(false) }
    })()
    return () => { alive = false }
    // Fires on ENTERING the step only; the setters and api are stable for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importStep, truck.id])
  const [importKitchenDirty, setImportKitchenDirty] = useState(false)
  // X-close → discard-confirmation gate (covers all wizard steps).
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importText, setImportText] = useState('')
  const [importDoneSkipped, setImportDoneSkipped] = useState(0)
  const [categoryPrep, setCategoryPrep] = useState<Record<string, { prep_secs: number | null; batch_size: number | null; counts_toward?: boolean }>>({})

  const [importResult, setImportResult] = useState<{
    categories: string[]
    items: Array<{
      name: string; description?: string; price: number; category: string; price_missing?: boolean; _skip?: boolean;
      // Explicit "this one's free" decision — resolves the price gate for an item the AI read as £0/absent,
      // turning a silent £0 into a deliberate one. Internal to the wizard; commit-menu ignores it (a free
      // item is just price 0). Distinct from price_missing: price_missing = "couldn't read", _free = "read
      // it, meant it".
      _free?: boolean;
      // Manually-added (via "+ Add item") rows. An empty-name manual row is INCOMPLETE — excluded from
      // the commit + the count, marked in the UI, and blocks a second blank add. AI items never set this.
      _manual?: boolean;
      // Set when an AI-detected variant group was UN-GROUPED into separate items for review (so page 1 is
      // a uniform flat list). Carries the original group identity so page 2 can reconstruct the grouped
      // choice regardless of whether the variant token is a known protein/size word. Ignored by commit-menu.
      _variantOf?: { key: string; baseName: string; groupName: string; optionName: string };
      allergens?: string[]; dietary?: string[]; spiciness?: number | null;
      // Stage 1 (§26/§26a) per-item modifier-group proposal — operator-editable here, sent to commit-menu
      // in the payload (Stage 3 writes it). Options carry AI-detected allergens/dietary (§26a).
      modifierGroups?: Array<{
        name: string
        options: Array<{ name: string; price: number; allergens?: string[]; dietary?: string[]; _allergensChecked?: boolean }>
        isRequired?: boolean; singleSelect?: boolean; _inferredFromVariants?: boolean
      }>
      // CLIENT-ONLY allergen-verification flag (§26a silent-gap gate). Not persisted; commit-menu
      // ignores unknown fields. An empty allergen set with this unset reads as "NOT CHECKED".
      _allergensChecked?: boolean
    }>
    existing_categories: string[]
  } | null>(null)

  const { isDragging: isAllergenDragging, dragProps: allergenDragProps } = useDragDrop(
    (file) => handleAllergenUploadAndProcess(file),
    ['image/*', '.pdf']
  )

  const handleProcessMenu = async () => {
    // C3: they have acted on the first screen, so the arrival beat has done its job. Clearing it here
    // covers the TEMPLATE route (C2), whose first screen is 'upload' rather than the offer — without
    // this, a Back from review would show the beat a second time.
    setShowSetupIntro(false)
    setImportStep('processing')
    try {
      const fd = new FormData()
      fd.append('token', token)
      if (importFile) fd.append('file', importFile)
      if (importText) fd.append('text', importText)
      const res = await fetch('/api/manage/process-menu', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      // §66: auto-split price-conflicting groups into separate items, THEN un-group the remaining
      // AI variant groups → importResult holds EVERY dish as a flat separate item for review. Page 1
      // shows the flat list; page 2 re-derives the grouping suggestions on top.
      setImportResult(withImpUids(ungroupAiVariantsForReview(autoSplitConflicts(data))))
      setReviewStep(1)
      setGroupingChoice({}) // fresh import → all grouping rows default to grouped
      // Seed Total capacity from the van(s) — held in state, written to the van ONLY at commit.
      try {
        const r = await api('get_vans')
        const vs = (r.vans || []).map((v: any) => ({ id: v.id, kitchen_capacity: v.kitchen_capacity ?? null, capacity_window_mins: v.capacity_window_mins ?? null }))
        setImportVans(vs)
        setImportKitchenCapacity({ kitchen_capacity: vs[0]?.kitchen_capacity ?? null, capacity_window_mins: vs[0]?.capacity_window_mins ?? 5 })
      } catch { /* non-fatal — total-capacity row just starts at ∞ */ }
      setImportKitchenDirty(false)
      setImportStep('review')
    } catch (err) {
      console.error('Menu processing failed:', err)
      setImportStep('upload')
    }
  }

  // ── C4: ?import=demo MEANS "UNFINISHED", NOT "ABANDONED" ────────────────────────────────────────
  // 🔴 STRIPPED ON DELIBERATE EXIT ONLY — never on unmount, tab switch or any accidental dismissal.
  // That asymmetry is the whole design. MenuTab unmounts on a tab switch and takes every piece of wizard
  // state with it, and the bootstrap re-firing off this param is the ONLY route back to the demo
  // extraction (there is no other: `setDemoImportMode(true)` appears once in this file, and every other
  // entry point is a plain upload). So an ACCIDENT must leave the param in place to recover from, while
  // a DECISION — Cancel, or a completed commit — removes it so the operator gets a normal empty Menu tab
  // instead of the wizard reopening at them forever.
  // ⚠️ Removes ONLY the `import` key; ?tab= and anything else survive untouched. replaceState, not a
  // router navigation: an address-bar rewrite with no re-render and no refetch.
  const stripImportParam = () => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (!params.has('import')) return
    params.delete('import')
    const qs = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }

  // Reset ALL import state (post-commit OR on discard) so reopening starts fresh. No van write here —
  // the total-capacity write is deferred to commit, so a discard never touched the van (clean).
  const resetImportState = () => {
    setImportStep('idle')
    setImportResult(null)
    setDemoImportMode(false)
    setShowSetupIntro(false)   // C3 — the arrival beat never survives a reset
    setImportFile(null)
    setImportText('')
    setImportDoneSkipped(0)
    setCategoryPrep({})
    setGroupingChoice({})
    setImportCatOpen({})
    setReviewStep(1)
    setImportKitchenCapacity({ kitchen_capacity: null, capacity_window_mins: 5 })
    setImportVans([])
    setImportKitchenDirty(false)
    setCardImportParsed(null)
    setCardImportMatch(null)
    setCardImportProcessing(false)
    setCardImportDone(false)
    setCardBlanketOptIn(false)
    setCardEntriesResolved(new Set())
    setAllergenSubStep('chooser')
    setPendingDisplayMode(null)
    setCardImportFile(null)
    setCardImportText('')
    setImportCardOnlyText('')
    setImportCardOnlyTranscribing(false)
    setShowCardUpload(false)
    setShowDiscardConfirm(false)
    // Schedule step (setup mode)
    setScheduleRoute('chooser')
    setFinishingSetup(false)
    setSchedUrl(''); setSchedVerifying(false); setSchedVerifyError(null); setSchedVerifiedEvents(null)
    setSchedFile(null); setSchedText(''); setSchedPhotoProcessing(false); setSchedExtracted(null); setSchedSaving(false)
    // (Route C has no state to reset — it is explanatory copy + Continue.)
  }

  // ── H1: THE C3 GREEN LINE IS GONE — REPLACED BY THE WELCOME SCREEN ──────────────────────────────
  // Slice C put a one-line green beat ("Your account's ready — now let's add your menu.") at the top of
  // BOTH first screens. H1 replaces it with a proper welcome step, so the line is deleted rather than
  // kept alongside: two arrival greetings on one screen is worse than either alone.
  // 🔴 `showSetupIntro` ITSELF SURVIVES AND IS STILL THE ONLY FLAG. It now gates the welcome overlay
  // instead of the line — same setter, same clears, same once-per-arrival meaning, no second flag.
  // ⚠️ DemoGetStarted's "✅ Your account's ready" beat (components/DemoGetStarted.tsx:861) is a
  // DIFFERENT element on a different page and is deliberately LEFT ALONE — see the report.

  // ── AI-import review: proposal mutation helpers (Stage 2, client-side only) ──────────────────
  // Every edit mirrors the existing _skip/price pattern: an immutable setImportResult patch by index.
  const patchImportItem = (idx: number, patch: (it: any) => any) =>
    setImportResult(prev => prev ? { ...prev, items: prev.items.map((it, i) => i === idx ? patch(it) : it) } : prev)

  // ── I1: CATEGORY RENAME / ADD / REASSIGN — IN-MEMORY ONLY ────────────────────────────────────────
  // Nothing here touches the database. importResult is the whole model until the ONE existing commit,
  // exactly like every other edit on this screen (_skip, price, grouping) — no RPC, no new write path.
  //
  // 🔴 THE INVARIANT: every item's `category` string must be a member of `categories`. commit-menu
  // resolves an item's category by exact name (`categoryIdMap[item.category]`), and an item whose
  // category does not resolve is dropped by a bare `continue` — it does NOT appear in `failed[]` and is
  // only visible as `unaccounted` (lib/menu-commit.ts:9-11). So a rename that misses an item does not
  // show up as an error; the dish silently never arrives. That is why rename is written as ONE
  // setImportResult call that rewrites BOTH arrays from the same `prev` — there is no window in which
  // the two disagree, and no ordering between two setters to get wrong.
  const normaliseCatName = (s: string) => s.trim().replace(/\s+/g, ' ')
  /** Case- AND whitespace-insensitive identity: "Mains", "mains " and "MAINS" are one category. */
  const catKey = (s: string) => normaliseCatName(s).toLowerCase()
  /** null = acceptable; a string = the reason to show the operator. */
  const validateCatName = (name: string, exclude?: string): string | null => {
    const clean = normaliseCatName(name)
    if (!clean) return 'Give the category a name.'
    if (clean.length > 60) return 'That name is too long.'
    // Compared on catKey, so "mains " cannot be added beside "Mains" — which matters beyond tidiness:
    // commit-menu derives menu_categories.slug as name.toLowerCase().replace(/[^a-z0-9]+/g,'-'), so both
    // would resolve to the SAME slug and collide on menu_categories_truck_id_slug_key.
    const clash = (importResult?.categories || [])
      .some(c => catKey(c) === catKey(clean) && (exclude == null || catKey(c) !== catKey(exclude)))
    if (clash) return `There's already a category called "${clean}".`
    return null
  }
  const renameImportCategory = (from: string, to: string) =>
    setImportResult(prev => prev ? {
      ...prev,
      categories: prev.categories.map(c => c === from ? to : c),
      // Same update, same `prev` — the items move with the name or neither changes.
      items: prev.items.map(it => it.category === from ? { ...it, category: to } : it),
      // existing_categories is DELIBERATELY not rewritten: it records which names were already committed
      // on this truck, and a renamed category is no longer one of them. Leaving it alone is what makes
      // the teal "existing" chip disappear by itself.
    } : prev)
  const addImportCategory = (name: string) =>
    setImportResult(prev => prev ? { ...prev, categories: [...prev.categories, name] } : prev)

  // ── M2/M4: REASSIGNMENT, KEPT AS A NAMED CAPABILITY ──────────────────────────────────────────────
  // M2 removed the always-visible per-row dropdown, NOT the ability. This is that ability, named, with
  // exactly one caller: the delete-a-category flow below, which is the one moment an operator genuinely
  // has to say where dishes go.
  //
  // 🔴 IT WRITES `category` AND NOTHING ELSE. `{ ...it }` carries every other field through untouched —
  // including `_allergensChecked`. A dish the operator confirmed in the allergen step stays confirmed
  // when it changes category, which is what stops M4 quietly undoing M1's work.
  const reassignImportItem = (fromCategory: string, toCategory: string) =>
    setImportResult(prev => prev ? {
      ...prev,
      items: prev.items.map(it => it.category === fromCategory ? { ...it, category: toCategory } : it),
    } : prev)

  // ── M4: DELETE A CATEGORY (in-memory, like everything else on this screen) ───────────────────────
  // Removes the name from `categories` and, when asked, moves its items in the SAME setImportResult
  // call — the same one-update discipline the rename uses, for the same reason: an item left pointing
  // at a category that is no longer in the list is dropped by commitMenu's bare `continue`, with no
  // error and no entry in `failed[]`. One update means there is no window in which that can be true.
  const deleteImportCategory = (name: string, moveTo: string | null) =>
    setImportResult(prev => prev ? {
      ...prev,
      categories: prev.categories.filter(c => c !== name),
      items: moveTo
        ? prev.items.map(it => it.category === name ? { ...it, category: moveTo } : it)
        : prev.items,
    } : prev)
  /** Apply the open rename/add. Kept together so Enter, blur and the tick button cannot diverge. */
  const commitCatEdit = () => {
    if (!catEdit) return
    const { from, value } = catEdit
    const clean = normaliseCatName(value)
    if (from !== '' && clean === from) { setCatEdit(null); setCatEditError(null); return }   // untouched
    const err = validateCatName(value, from || undefined)
    if (err) { setCatEditError(err); return }                                                 // stay open
    if (from === '') addImportCategory(clean); else renameImportCategory(from, clean)
    setCatEdit(null); setCatEditError(null)
  }
  // NOTE: the per-item / per-option allergen SETTERS (setItemAllergens / confirmItemAllergens /
  // setOptionAllergens / confirmOptionAllergens + their patchGroup/patchOption helpers) were REMOVED
  // when the wizard dropped its allergen step. Allergens still IMPORT (AI detections) and still COMMIT
  // with allergens_verified=false; the deliberate verification moves to a Settings table. _allergensChecked
  // is still threaded onto items (always false now) so commit-menu can flag every imported item.
  // Ungroup an _inferredFromVariants group → replace the base item with one item per option
  // (name = base + option, price = base + delta, option allergens merged into the new dish allergens).
  const ungroupImportItem = (idx: number, gi: number) =>
    setImportResult(prev => {
      if (!prev) return prev
      const base = prev.items[idx]
      const grp = base.modifierGroups?.[gi]
      if (!grp) return prev
      const expanded = grp.options.map(o => ({
        name: `${base.name} ${o.name}`.trim(),
        description: base.description,
        price: Number((base.price + (o.price || 0)).toFixed(2)),
        category: base.category,
        allergens: Array.from(new Set([...(base.allergens || []), ...(o.allergens || [])])),
        dietary: Array.from(new Set([...(base.dietary || []), ...(o.dietary || [])])),
        spiciness: base.spiciness ?? null,
        modifierGroups: (base.modifierGroups || []).filter((_, gj) => gj !== gi),  // keep any OTHER groups
        _allergensChecked: false,  // reconstructed items must be re-verified
      }))
      return { ...prev, items: [...prev.items.slice(0, idx), ...expanded, ...prev.items.slice(idx + 1)] }
    })
  // NOTE: `allergenUnverified` + `importUncheckedItems` (the wizard's per-item allergen soft-gate
  // list) were REMOVED with the allergen step. There is no allergen verification in the wizard now —
  // every imported item commits allergens_verified=false and is flagged "allergens not set" in manage
  // until reviewed in Settings.

  // ── §64: PRICE-CONFLICT detection + resolution (review-time; mirrors the §26a allergen gate) ───────
  // The AI emits each option's SURCHARGE (delta above the dish's base = cheapest variant), never a
  // total — so a CONFLICT is the SAME option name carrying DIFFERENT surcharges across the dishes that
  // share it. Resolution mutates importResult IN REVIEW (no payload threading, NO commit change): the
  // conflict then naturally drops out of this list (exactly like the allergen list shrinking), which
  // gates Next + commit. Cheapest-as-base guarantees surcharges ≥ 0.
  const normName = (s: string) => String(s ?? '').trim().toLowerCase()
  // §66: dissolve a group across ALL carrying dishes into per-variant items (name = dish + option,
  // price = base + surcharge, allergens/dietary merged, group removed). PURE over an items array.
  // markConflict tags produced items so step 1 can show a subtle "kept separate — prices differed" note.
  const dissolveGroupInItems = (items: any[], normGroup: string, markConflict = false): any[] => {
    const out: any[] = []
    for (const it of items) {
      const gi = (it.modifierGroups || []).findIndex((g: any) => normName(g.name) === normGroup)
      if (gi < 0) { out.push(it); continue }
      const grp = (it.modifierGroups || [])[gi]
      for (const o of grp.options) {
        out.push({ ...it, name: `${it.name} ${o.name}`.trim(), price: Number(((it.price || 0) + (o.price || 0)).toFixed(2)),
          allergens: Array.from(new Set([...(it.allergens || []), ...(o.allergens || [])])),
          dietary: Array.from(new Set([...(it.dietary || []), ...(o.dietary || [])])),
          modifierGroups: (it.modifierGroups || []).filter((_: any, gj: number) => gj !== gi),
          _allergensChecked: false, ...(markConflict ? { _splitFromConflict: true } : {}) })
      }
    }
    return out
  }
  // §66: a PRICE CONFLICT = the SAME option name carrying DIFFERENT surcharges across the dishes that
  // share it → the conflicted GROUP names. Used to AUTO-split (no operator decision, no gate).
  const detectConflictGroups = (items: any[]): string[] => {
    const perKey = new Map<string, Set<number>>()
    const groupOfKey = new Map<string, string>()
    for (const it of items) {
      if (it._skip) continue
      for (const g of (it.modifierGroups || [])) {
        for (const o of (g.options || [])) {
          const ng = normName(g.name), key = `${ng} ${normName(o.name)}`
          if (!perKey.has(key)) perKey.set(key, new Set())
          perKey.get(key)!.add(typeof o.price === 'number' ? o.price : 0)
          groupOfKey.set(key, ng)
        }
      }
    }
    const groups = new Set<string>()
    for (const [key, set] of perKey) if (set.size > 1) groups.add(groupOfKey.get(key)!)
    return [...groups]
  }
  // §66: AUTO-resolve price conflicts to SEPARATE ITEMS at load — price-faithful, no gate. Consistent
  // options (same surcharge everywhere) stay as shared extras.
  const autoSplitConflicts = (data: any) => {
    const conflictGroups = detectConflictGroups(data?.items || [])
    if (conflictGroups.length === 0) return data
    let items = data.items
    for (const ng of conflictGroups) items = dissolveGroupInItems(items, ng, true)
    return { ...data, items }
  }
  // §66: the price-conflict panel/gate/"+£X for all" resolution were REMOVED — conflicts auto-split to
  // separate items at load (detectConflictGroups + autoSplitConflicts above); only the allergen gate remains.
  // Manual "Keep as separate items" (a legitimate preference on step 2) — dissolve the group via the
  // pure helper above (untagged).
  const splitImportGroup = (normGroup: string) =>
    setImportResult(prev => {
      if (!prev) return prev
      const out: any[] = []
      for (const it of prev.items) {
        const gi = (it.modifierGroups || []).findIndex((g: any) => normName(g.name) === normGroup)
        if (gi < 0) { out.push(it); continue }
        const grp = (it.modifierGroups || [])[gi]
        for (const o of grp.options) {
          out.push({ ...it, name: `${it.name} ${o.name}`.trim(), price: Number((it.price + (o.price || 0)).toFixed(2)),
            allergens: Array.from(new Set([...(it.allergens || []), ...(o.allergens || [])])),
            dietary: Array.from(new Set([...(it.dietary || []), ...(o.dietary || [])])),
            modifierGroups: (it.modifierGroups || []).filter((_: any, gj: number) => gj !== gi),
            _allergensChecked: false })
        }
      }
      return { ...prev, items: out }
    })

  // ── §68 (Stage B): VIRTUAL shared groups for the step-2 matrix ──────────────────────────────────
  // Import data is per-item modifierGroups by NAME (no DB ids, pre-commit). The matrix needs a shared-
  // group view, so dedupe by normalised name → one virtual group + the SUPERSET of options (union by
  // option name, MERGING per-option allergens/dietary — REQUIRED for Stage C). §66 guarantees surviving
  // groups have consistent option prices, so one price per option is valid. Recomputed each render;
  // handlers below mutate importResult (NO RPC — manage's RPC handlers are untouched).
  type ImpVOpt = { name: string; norm: string; price: number; allergens: string[]; dietary: string[] }
  type ImpVGroup = { name: string; norm: string; isRequired: boolean; singleSelect: boolean; options: ImpVOpt[] }
  const importVirtualGroups: ImpVGroup[] = (() => {
    const byName = new Map<string, ImpVGroup>()
    const optByKey = new Map<string, ImpVOpt>()
    for (const it of (importResult?.items || [])) {
      if (it._skip) continue
      for (const g of (it.modifierGroups || [])) {
        const gn = normName(g.name)
        let vg = byName.get(gn)
        if (!vg) { vg = { name: g.name, norm: gn, isRequired: false, singleSelect: false, options: [] }; byName.set(gn, vg) }
        if (g.isRequired === true) vg.isRequired = true
        if (g.singleSelect === true) vg.singleSelect = true
        for (const o of (g.options || [])) {
          const on = normName(o.name), key = `${gn} ${on}`
          let vo = optByKey.get(key)
          if (!vo) { vo = { name: o.name, norm: on, price: typeof o.price === 'number' ? o.price : 0, allergens: [], dietary: [] }; optByKey.set(key, vo); vg.options.push(vo) }
          // MERGE per-option allergens/dietary by union — Stage C depends on this surviving the dedupe.
          vo.allergens = Array.from(new Set([...vo.allergens, ...(o.allergens || [])]))
          vo.dietary = Array.from(new Set([...vo.dietary, ...(o.dietary || [])]))
        }
      }
    }
    return [...byName.values()]
  })()

  // ── DETERMINISTIC REGROUP PASS — detects variant sets the AI emitted as SEPARATE items ──────────
  // (e.g. "Tom Yum Prawn" + "Tom Yum Chicken" instead of one dish + a protein choice). STRUCTURAL predicate:
  // within ONE category, two+ UNGROUPED items whose names differ by EXACTLY ONE token, that token a
  // known protein/size axis token (VARIANT_AXIS_TOKENS) of the SAME axis. (No price cap — these are
  // SUGGESTIONS the operator confirms.) A dish-TYPE differing token (Green/Red curry) is NOT in the axis
  // list → NOT a candidate (verified non-merge).
  // Pure over a given items array (no React state) so the grouping chooser + commit can re-run it on
  // the latest items atomically.
  type RegroupMember = { idx: number; token: string; item: any }
  type RegroupCandidate = { key: string; baseName: string; category: string; axis: 'protein' | 'size'; members: RegroupMember[] }
  const computeRegroupCandidates = (items: any[]): RegroupCandidate[] => {
    const buckets = new Map<string, { baseTokens: string[]; category: string; axis: 'protein' | 'size'; members: RegroupMember[] }>()
    items.forEach((it: any, idx: number) => {
      if (it._skip) return
      if (it._variantOf) return // already reconstructed as an AI-origin grouping row — don't double-detect
      if ((it.modifierGroups || []).length > 0) return // already a grouped dish — not a loose variant
      const tokens = String(it.name || '').trim().split(/\s+/).filter(Boolean)
      if (tokens.length < 2) return // need a base + a varying token
      tokens.forEach((tok: string, i: number) => {
        const axis = VARIANT_AXIS_TOKENS[tok.toLowerCase()]
        if (!axis) return
        const baseTokens = tokens.filter((_: string, j: number) => j !== i)
        if (baseTokens.length === 0) return // base can't be empty (item literally named "Chicken")
        const key = `${normName(it.category || '')}|${baseTokens.join(' ').toLowerCase()}|${axis}`
        let b = buckets.get(key)
        if (!b) { b = { baseTokens, category: it.category, axis, members: [] }; buckets.set(key, b) }
        b.members.push({ idx, token: tok, item: it })
      })
    })
    const out: RegroupCandidate[] = []
    for (const [key, b] of buckets) {
      const byTok = new Map<string, RegroupMember>()
      for (const m of b.members) { const k = m.token.toLowerCase(); if (!byTok.has(k)) byTok.set(k, m) }
      const members = [...byTok.values()]
      if (members.length < 2) continue
      // No price-spread cap: the £1 cap was a guard from when regroup merged SILENTLY. It's now a
      // SUGGESTION on the two-box chooser (operator confirms each), so confirmation is the safety net —
      // any spread is safe to suggest (e.g. Springrolls Chicken/Veg/Prawn/Duck across £5.50–£7). The
      // STRUCTURAL guards (same base, single differing token, token in VARIANT_AXIS_TOKENS, same
      // category) still exclude non-variants like Green/Red Curry. Confirm math uses cheapest=base.
      out.push({ key, baseName: b.baseTokens.join(' '), category: b.category, axis: b.axis, members })
    }
    return out
  }

  // ── UN-GROUP AI VARIANT GROUPS FOR REVIEW ───────────────────────────────────────────────────────
  // Page 1 shows EVERY dish as a flat separate item. So at load we DISSOLVE each AI-detected variant
  // group (_inferredFromVariants) into its constituent items, TAGGING each with `_variantOf` (the
  // original group identity) so page 2 can reconstruct the grouped choice — regardless of whether the
  // variant token is a known protein/size word. importResult thus holds everything SEPARATE during
  // review (Back-stable; grouping is re-derived on page 2 + applied only at commit). Any OTHER (non-
  // variant "extras") groups stay on each constituent item untouched.
  const ungroupAiVariantsForReview = (data: any) => {
    if (!data || !Array.isArray(data.items)) return data
    const out: any[] = []
    for (const it of data.items) {
      const vg = (it.modifierGroups || []).find((g: any) => g._inferredFromVariants === true)
      if (!vg) { out.push(it); continue }
      // Rare: a dish carrying a variant group AND other (non-variant "extras") groups. Dissolving +
      // re-grouping would drop the extras, so leave such a dish grouped (it just isn't split on page 1).
      if ((it.modifierGroups || []).some((g: any) => g !== vg)) { out.push(it); continue }
      const baseName = it.name
      const basePrice = Number(it.price) || 0
      const groupKey = `${normName(it.category || '')}|${normName(baseName)}|${normName(vg.name)}`
      for (const o of (vg.options || [])) {
        out.push({
          name: `${baseName} ${o.name}`.trim(),
          description: it.description || undefined,
          price: Number((basePrice + (Number(o.price) || 0)).toFixed(2)),
          category: it.category,
          allergens: Array.from(new Set([...(it.allergens || []), ...(o.allergens || [])])),
          dietary: Array.from(new Set([...(it.dietary || []), ...(o.dietary || [])])),
          spiciness: it.spiciness ?? null,
          _allergensChecked: false,
          _variantOf: { key: groupKey, baseName, groupName: vg.name, optionName: o.name },
          modifierGroups: (it.modifierGroups || []).filter((g: any) => g !== vg), // keep any OTHER groups
        })
      }
    }
    return { ...data, items: out }
  }

  // ── GROUPING CHOOSER (step 2) — every row is a set of SEPARATE items that CAN be grouped into one
  // customisable dish. Sources: (1) AI-origin (items tagged `_variantOf`, reconstructed by tag) and
  // (2) regroup CANDIDATES (untagged separate items matched by base + protein/size axis token). Both
  // render identically (two boxes). The choice is tracked in `groupingChoice` (default 'grouped');
  // importResult is NEVER mutated by the chooser — buildGroupedItems() applies selections PURELY when
  // building the commit payload. computeGroupingRows is pure over an items array (render + commit), so
  // base/surcharge math always reads the CURRENT (page-1-edited) prices — never cached.
  type GroupingOpt = { name: string; surcharge: number; allergens: string[]; dietary: string[] }
  type GroupingRow = {
    key: string; source: 'ai' | 'candidate'; category: string; baseName: string; axisLabel: string
    basePrice: number; options: GroupingOpt[]; separateItems: { name: string; price: number }[]
    memberIdxs: number[]; groupedItem: any
  }
  // Build a row from a set of member indices that should group under one base name. Members are sorted
  // by price ASCENDING (cheapest/base first), ties broken alphabetically by option name — the SAME order
  // flows to the grouped chips, the separate-items list, AND the committed group's option order.
  const makeGroupingRow = (
    items: any[], key: string, source: 'ai' | 'candidate', category: string, baseName: string,
    axisLabel: string, groupName: string, members: { idx: number; optionName: string }[],
  ): GroupingRow => {
    const sorted = [...members].sort((a, b) => {
      const pa = Number(items[a.idx].price) || 0, pb = Number(items[b.idx].price) || 0
      if (pa !== pb) return pa - pb
      return a.optionName.localeCompare(b.optionName)
    })
    const memberItems = sorted.map(m => items[m.idx])
    const basePrice = Math.min(...memberItems.map((it: any) => Number(it.price) || 0))
    const base = memberItems.find((it: any) => (Number(it.price) || 0) === basePrice) || memberItems[0]
    const options: GroupingOpt[] = sorted.map(m => ({
      name: m.optionName,
      surcharge: Number(((Number(items[m.idx].price) || 0) - basePrice).toFixed(2)),
      // Options carry NO allergen/dietary data on import: per-option allergens are a FUTURE feature
      // (modifier_options has no verified flag), and copying the member item's allergens here BLED the
      // parent dish's tags onto every protein option (Chicken→Gluten/Molluscs/Vegetarian). Leave BLANK —
      // the dish-level union below (over-warn-safe) still warns for everything the dish can contain.
      allergens: [], dietary: [],
    }))
    const groupedItem = {
      name: baseName, description: base.description || undefined, price: basePrice,
      // ALLERGENS/DIETARY = UNION of ALL members (not base-only) — §74 over-warn-safe: a statutory allergen
      // on a non-cheapest member must NOT be dropped from the dish (base-only WAS an under-warn bug). Mirrors
      // the option→item union elsewhere (:1442/:1473/:1524/:1635). Base still drives PRICE only.
      category,
      allergens: [...new Set(memberItems.flatMap((it: any) => it.allergens || []))],
      dietary:   [...new Set(memberItems.flatMap((it: any) => it.dietary || []))],
      spiciness: base.spiciness ?? null,
      // ── 🔴 M1: THE PARENT'S CONFIRMATION IS DERIVED FROM ITS MEMBERS ─────────────────────────
      // This was the literal `false`, and it silently discarded real human work. The allergen step
      // reviews the UN-GROUPED rows; grouping happens later, in buildGroupedItems, which DELETES the
      // confirmed members and inserts this object in their place. With `false` hardcoded, every
      // grouped dish committed unverified however carefully its members had been checked — confirmed
      // in production on truck "village spice": 29 items committed, the 24 standalone ones verified,
      // and exactly the 5 grouped parents unverified and corrected by hand 23 minutes later.
      //
      // 🔴 THE SAFETY PROPERTY, WHICH THIS PRESERVES: nothing is ever marked verified that a human did
      // not verify. `every(… === true)` is an AND over the members, and each member's flag was set by
      // the operator confirming that row in the allergen step. So a true here means every dish folded
      // into this parent was individually confirmed by a person. A single unconfirmed member — or one
      // whose flag is undefined — makes the whole thing false. It cannot invent a confirmation.
      // Strict `=== true`, not truthiness, for exactly that reason.
      //
      // ⚠️ `memberItems.length > 0 &&` IS LOAD-BEARING, NOT DEFENSIVE PADDING. `[].every(...)` is
      // TRUE by definition, so without this guard a group that somehow arrived with no members would
      // commit as verified — a confirmation asserted about nothing at all. The one case where the
      // vacuous-truth default is exactly backwards from the safe one.
      //
      // Derived like every other field on this object — the allergens union two lines above is built
      // from the same memberItems, for the same reason: the parent must represent ALL of them.
      _allergensChecked: memberItems.length > 0 && memberItems.every(it => it._allergensChecked === true),
      modifierGroups: [{
        name: groupName,
        options: options.map(o => ({ name: o.name, price: o.surcharge, allergens: o.allergens, dietary: o.dietary })),
        // Inferred variant groups (protein/size) are structurally a MUST-CHOOSE-ONE → default required +
        // single-select (→ is_required / min_choices=1 / max_choices=1 at commit). A default, not a lock —
        // the operator can amend in the editor. Also makes the consolidation key uniform so groups that
        // differ only by (now-removed) bled option tags merge.
        isRequired: true, singleSelect: true, _inferredFromVariants: true,
      }],
    }
    return {
      key, source, category, baseName, axisLabel, basePrice, options,
      separateItems: sorted.map(m => ({ name: items[m.idx].name, price: Number(items[m.idx].price) || 0 })),
      memberIdxs: sorted.map(m => m.idx), groupedItem,
    }
  }
  const computeGroupingRows = (items: any[]): GroupingRow[] => {
    const rows: GroupingRow[] = []
    // (1) AI-origin: items tagged `_variantOf`, grouped by their stored group key.
    const aiBuckets = new Map<string, { idx: number; optionName: string }[]>()
    const aiMeta = new Map<string, { baseName: string; groupName: string; category: string }>()
    items.forEach((it: any, idx: number) => {
      if (it._skip || !it._variantOf) return
      const k = it._variantOf.key
      if (!aiBuckets.has(k)) { aiBuckets.set(k, []); aiMeta.set(k, { baseName: it._variantOf.baseName, groupName: it._variantOf.groupName, category: it.category }) }
      aiBuckets.get(k)!.push({ idx, optionName: it._variantOf.optionName })
    })
    for (const [k, members] of aiBuckets) {
      if (members.length < 2) continue
      const meta = aiMeta.get(k)!
      rows.push(makeGroupingRow(items, `ai|${k}`, 'ai', meta.category, meta.baseName, meta.groupName, meta.groupName, members))
    }
    // (2) Regroup CANDIDATES (untagged separate items the AI never grouped).
    for (const cand of computeRegroupCandidates(items)) {
      const members = cand.members.map(m => ({ idx: m.idx, optionName: m.token }))
      rows.push(makeGroupingRow(items, `cand|${cand.key}`, 'candidate', cand.category, cand.baseName, cand.axis, cand.axis === 'protein' ? 'Protein' : 'Size', members))
    }
    // ── CONTENT-CONSOLIDATION + STRUCTURED NAMING (import-grouping only) ───────────────────────────
    // The import models ONE inferred modifier group PER base dish, so N dishes offering the SAME options
    // at the SAME prices yield N near-duplicate groups. Consolidate by EXACT CONTENT: rows whose group is
    // identical on (category, option SET + per-option price, rules, per-option allergens/dietary) are ONE
    // logical group and get the SAME final name → commit-menu's name-dedup then collapses them into a
    // SINGLE modifier_groups row that every matching dish links to. Groups that differ on ANY of those
    // (e.g. Beef free vs Beef +£0.50) keep DISTINCT signatures and are numbered apart so they stay
    // separate — never the old name-collision over-merge across different prices.
    //
    // Allergens/dietary are PART of the key (stricter than options+price alone): a merge can therefore
    // NEVER drop an option's allergen onto another dish (over-warn-safe — worst case leaves a near-dup
    // unmerged, which is cosmetic). NAME is NOT part of the key — consolidation is by content, not by the
    // AI's group name. Each dish keeps its own option set intact (no superset / no cross-dish option
    // mixing). The operator sees none of this (machinery beneath the grouped/separate choice).
    const sortJoin = (xs: any) => (Array.isArray(xs) ? xs : []).map((s: any) => normName(String(s))).sort().join(',')
    const contentSig = (row: GroupingRow): string => {
      const g = row.groupedItem.modifierGroups[0]
      const opts = (g.options || []).map((o: any) => `${normName(o.name)}#${Number(o.price) || 0}#${sortJoin(o.allergens)}#${sortJoin(o.dietary)}`).sort()
      return JSON.stringify({ cat: normName(row.category || ''), opts, req: g.isRequired === true, single: g.singleSelect === true })
    }
    // (1) CONSOLIDATE — bucket rows by content signature; each DISTINCT signature = one logical shared group.
    const bySig = new Map<string, GroupingRow[]>()
    const sigOrder: string[] = []
    for (const row of rows) {
      const sig = contentSig(row)
      const arr = bySig.get(sig)
      if (arr) arr.push(row); else { bySig.set(sig, [row]); sigOrder.push(sig) }
    }
    // (2) NAME the distinct signatures: bucket by (category, base axis name). A lone signature → "Category -
    // Name"; 2+ DISTINCT signatures sharing a base name → "Category - Name 1/2/…" (first-seen order). All
    // rows of a signature get the SAME name → one shared group at commit.
    const sigBuckets = new Map<string, string[]>()   // (cat|baseName) → signatures, first-seen order
    for (const sig of sigOrder) {
      const r0 = bySig.get(sig)![0]
      const bkey = `${normName(r0.category || '')}|${normName(r0.groupedItem.modifierGroups[0].name)}`
      const arr = sigBuckets.get(bkey)
      if (arr) arr.push(sig); else sigBuckets.set(bkey, [sig])
    }
    for (const sigs of sigBuckets.values()) {
      const numbered = sigs.length > 1
      sigs.forEach((sig, i) => {
        const bucketRows = bySig.get(sig)!
        const cat = String(bucketRows[0].category || '').trim()
        const base = bucketRows[0].groupedItem.modifierGroups[0].name
        const prefix = cat ? `${cat} - ` : ''
        const finalName = `${prefix}${base}${numbered ? ` ${i + 1}` : ''}`
        bucketRows.forEach(r => { r.groupedItem.modifierGroups[0].name = finalName })
      })
    }
    return rows
  }
  const groupingRows = computeGroupingRows(importResult?.items || [])

  // ── DEMO→REAL MIGRATION BOOTSTRAP ─────────────────────────────────────────────────────────────────
  // When the setup wizard deep-links here with ?import=demo, pre-load the review step from the demo's
  // STORED extraction instead of a fresh upload. This is the whole reason the migration is a re-commit and
  // not a row copy: demo_sessions.extraction is byte-for-byte the shape process-menu returns (both are
  // extractMenu()), so it flows through the SAME transform the upload uses — and every downstream step
  // (grouped-vs-separate, the price gate, allergens, kitchen) runs unchanged. Nothing here is reachable
  // without the query param, so a normal operator open of Manage is completely untouched.
  //
  // Placed AFTER the transform helpers (autoSplitConflicts/ungroupAiVariantsForReview) so it references
  // them post-declaration. MenuTab mounts only after the parent finished loading, so `truck` is present.
  useEffect(() => {
    if (demoImportTried.current || !truck) return
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('import') !== 'demo') return
    demoImportTried.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/setup')            // GET → the operator's claimed demo extraction
        const data = await res.json()
        if (!data?.ok || !data.extraction) {
          // Distinguish the null cases the GET reports:
          //  • 'no_extraction' — they came from a demo but its menu is genuinely GONE (swept,
          //    pre-migration, or the persist failed). Say so, rather than a silent blank upload that
          //    reads as "we lost it". Copy unchanged.
          //  • 'template_withheld' (B2) — the payload is intact and deliberately not handed over,
          //    because it was a SAMPLE and was never theirs. 🔴 NO ERROR TOAST: nothing failed and
          //    nothing was lost, and apologising for a loss that did not happen fired on every sample
          //    signup, once per return to this tab. The true message — "you'll upload your own menu
          //    next" — belongs in the flow, not in an error, and is slice C's to place. Silent here.
          //  • 'no_claim' / anything else — no demo behind this signup; a normal upload is unremarkable.
          if (data?.reason === 'no_extraction') {
            showToast('Your demo menu is no longer available — please upload it again to carry on.', 'error')
          }
          // ── C2: THE TEMPLATE ROUTE — straight to the EXISTING upload step ───────────────────────
          // A sample demo has nothing to offer: the payload is intact but deliberately withheld (it was
          // never their menu), so there is no "use this one" to put in front of them. Open the wizard
          // where the work actually starts. No second upload UI — this is the same 'upload' step every
          // other import uses.
          // demoImportMode stays FALSE: whatever they upload has nothing to do with the demo, so the
          // commit must not clear-first.
          if (data?.reason === 'template_withheld') {
            setDemoImportMode(false)
            setShowSetupIntro(true)
            setImportStep('upload')
          }
          return
        }
        // SAME pipeline as handleProcessMenu — the extraction is the same shape process-menu returns.
        setImportResult(withImpUids(ungroupAiVariantsForReview(autoSplitConflicts(data.extraction))))
        setReviewStep(1)
        setGroupingChoice({})
        try {
          const r = await api('get_vans')
          const vs = (r.vans || []).map((v: { id: string; kitchen_capacity?: number | null; capacity_window_mins?: number | null }) =>
            ({ id: v.id, kitchen_capacity: v.kitchen_capacity ?? null, capacity_window_mins: v.capacity_window_mins ?? null }))
          setImportVans(vs)
          setImportKitchenCapacity({ kitchen_capacity: vs[0]?.kitchen_capacity ?? null, capacity_window_mins: vs[0]?.capacity_window_mins ?? 5 })
        } catch { /* non-fatal */ }
        setImportKitchenDirty(false)
        setDemoImportMode(true)
        setShowSetupIntro(true)
        // ── C1: ASK BEFORE LOADING ────────────────────────────────────────────────────────────────
        // Everything above is UNCHANGED — the extraction is parsed, the vans are read and
        // demoImportMode is set exactly as before. The ONLY difference is which step opens: 'offer'
        // instead of 'review'. Choosing "Use this menu" then does `setImportStep('review')` and nothing
        // else, so that branch lands in a state byte-identical to today's.
        setImportStep('offer')
      } catch (e) {
        console.error('[manage] demo import bootstrap failed:', e)
      }
    })()
    // One-shot, guarded by demoImportTried — the setters/api/helpers are stable for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truck, token])

  // ── PRICE GATE (🔴 applies to EVERY import, operator and demo) ────────────────────────────────────
  // Items whose price the AI couldn't read (menu-extract sets price_missing when the price is absent OR £0)
  // would otherwise commit at £0 — indistinguishable from a deliberately free item, and live on the menu.
  // That is a revenue bug for Gusto/RTF exactly as much as for a new signup, so the gate is on the shared
  // path, not scoped to onboarding.
  //
  // An item is UNRESOLVED when it is being committed (named, not skipped) and has neither a positive price
  // NOR an explicit "this one's free" decision (_free). The gate reads PRICE + _free directly rather than
  // the price_missing flag, so it can't disagree with what will actually be committed. price_missing still
  // drives the initial amber highlight; from then on the two agree because the row styling uses this too.
  //
  // ⚠️ For a normal import where the AI read every price, EVERY item has price > 0 → zero unresolved →
  // banner hidden, Next enabled → behaviour byte-identical to before this gate existed.
  const priceUnresolved = (it: { name?: string; price?: number; _skip?: boolean; _free?: boolean }) =>
    !it._skip && !!String(it.name || '').trim() && !(Number(it.price) > 0) && it._free !== true
  const unresolvedPrices = importResult ? importResult.items.filter(priceUnresolved) : []

  // ── H5: THE COMMITTABLE-ITEM SET, DEFINED ONCE ────────────────────────────────────────────────────
  // 🔴 ONE EXPRESSION, THREE READERS, SO THE NUMBERS CANNOT DISAGREE. `!_skip && name.trim()` was written
  // out verbatim in three places — the review header's "N items ready to add", the offer step's "we saved
  // N items", and the done screen's per-dish allergen check. The done screen now also reports the count
  // back to the operator ("Menu's in — N items"), and a fourth copy of a filter is a fourth chance for one
  // of them to drift and promise a number the next screen contradicts.
  // ⚠️ PURE EXTRACTION. The predicate is byte-for-byte what each site already used, so every existing
  // rendered number is unchanged — this is not a behaviour change for anyone.
  const committedImportItems = importResult
    ? importResult.items.filter(i => !i._skip && String(i.name || '').trim())
    : []
  // Categories derived from THAT SAME set, not from importResult.categories: a category whose every item
  // was unticked is not "a category the menu gained", and counting it would contradict the item figure
  // beside it.
  const committedImportCategoryCount = new Set(
    committedImportItems.map(i => String(i.category ?? '').trim()).filter(Boolean)
  ).size

  // ── WIZARD FLOW — the stepper + nav adapt to whether extras exist ────────────────────────────────
  // Extras step only appears when there ARE groupable dishes. Kitchen setup (the 'prep' importStep) is
  // now a visible step too. So: extras → "1 Menu · 2 Extras · 3 Kitchen setup"; none → "1 Menu · 2
  // Kitchen setup", and Menu's Next skips straight to Kitchen setup.
  const hasExtras = groupingRows.length > 0
  // ── SETUP-MODE SIGNAL ─────────────────────────────────────────────────────────────────────────────
  // TRUE only while a brand-new operator is still inside the signup→menu journey (arrived via the demo
  // modal / ?import=demo). Condition matches commit-menu (:35-36) EXACTLY: setup_step present and not 'done'.
  // setup_step is already on the truck row (getTruck selects '*'); only the Truck type needed the field.
  // 🔴 Every setup-only UI change below is gated on this — an existing operator (Gusto: setup_step NULL) hits
  // none of them, so their import is byte-for-byte today's.
  const inSetup = truck.setup_step != null && truck.setup_step !== 'done'
  // Allergens step is ALWAYS present (allergens are detected from the menu; the step also offers card upload
  // + "skip"). Order: Menu → Extras[if any] → Allergens → Kitchen setup.
  // Order: Menu → Extras → Allergens → Kitchen setup. The allergen review runs on STAGED data (importResult),
  // so it no longer needs committed items — Allergens sits before Kitchen, and the ONE atomic commit is at
  // Kitchen "Save". Nothing persists until then (abandon = nothing written).
  type WizKey = 'menu' | 'extras' | 'allergens' | 'kitchen' | 'schedule' | 'settings'
  const baseWizardSteps: { key: WizKey; label: string }[] = hasExtras
    ? [{ key: 'menu', label: 'Menu' }, { key: 'extras', label: 'Extras' }, { key: 'allergens', label: 'Allergens' }, { key: 'kitchen', label: 'Kitchen setup' }]
    : [{ key: 'menu', label: 'Menu' }, { key: 'allergens', label: 'Allergens' }, { key: 'kitchen', label: 'Kitchen setup' }]
  // Setup mode APPENDS "Schedule" after "Kitchen setup" (item 5). Existing operators (not inSetup) never see it,
  // so their stepper is byte-for-byte today's.
  // K1 appends "Settings" after "Schedule" — both are inSetup-only, so a non-setup operator's stepper is
  // still byte-for-byte today's.
  const wizardSteps: { key: WizKey; label: string }[] = inSetup
    ? [...baseWizardSteps, { key: 'schedule', label: 'Schedule' }, { key: 'settings', label: 'Settings' }]
    : baseWizardSteps
  // Advance to the Kitchen-setup ('prep') step. Seeds prep state for new categories WITHOUT clobbering
  // values already entered (so stepping back/forward is non-destructive).
  const goToKitchen = () => {
    if (!importResult) return
    const newCats = importResult.categories.filter(c => !importResult.existing_categories.includes(c))
    setCategoryPrep(prev => {
      const next = { ...prev }
      newCats.forEach(cat => { if (!(cat in next)) next[cat] = { prep_secs: null, batch_size: null } })
      return next
    })
    setImportStep('prep')
  }
  const goToAllergens = () => { if (importResult) { setAllergenSubStep('chooser'); setImportStep('allergens') } }
  // STRUCTURE choice → the shared card-upload page (both branches). Nothing commits — the menu commits ONCE
  // at Kitchen "Save". per-dish → the staged review (on importResult); card → straight to Kitchen.
  const chooseDisplayMode = (mode: 'per_dish' | 'card') => { setPendingDisplayMode(mode); setAllergenSubStep('card') }

  // ── STAGED allergen review (atomic): the EXISTING AllergenWizardModal review runs on importResult, NOT
  // committed rows. id = stable _uid; verified mirrors _allergensChecked; callbacks mutate importResult only
  // (no DB write). The single commit-menu at Kitchen maps _allergensChecked → allergens_verified atomically.
  const stagedCategories: Category[] = (importResult?.categories || []).map((name: string) => ({
    id: name, name, slug: name, prep_secs: 0, batch_size: 0, allow_notes: false, default_stock: null, sort_order: 0, is_active: true,
  }))
  const stagedItems: Item[] = (importResult?.items || []).map((it: any) => ({
    id: it._uid, name: it.name || '', description: it.description ?? null, price: Number(it.price) || 0,
    category_id: it.category ?? null, is_available: true, stock_count: null, default_stock: null, sort_order: 0,
    image_path: null, allergens: it.allergens || [], allergens_verified: it._allergensChecked === true,
    dietary_info: it.dietary || [], spiciness: it.spiciness ?? null, auto_accept: false,
  }))
  const patchStagedItem = (uid: string, patch: any) =>
    setImportResult(prev => prev ? { ...prev, items: prev.items.map((it: any) => it._uid === uid ? { ...it, ...patch } : it) } : prev)
  const stagedConfirm  = async (item: Item, allergens: string[], dietary: string[]) => patchStagedItem(item.id, { allergens, dietary, _allergensChecked: true })
  const stagedUndo     = async (item: Item, allergens: string[], dietary: string[], verified: boolean) => patchStagedItem(item.id, { allergens, dietary, _allergensChecked: verified })
  const stagedUnverify = async (item: Item) => patchStagedItem(item.id, { _allergensChecked: false })
  // After the card-upload page: per-dish → staged review; card → Kitchen (card display set at commit).
  const advanceFromCardPage = () => { if (pendingDisplayMode === 'per_dish') setAllergenSubStep('review'); else goToKitchen() }
  const goToStep = (key: WizKey) => {
    // 'schedule' is post-commit and reached only from the Kitchen "Save" success path — never jump to it from
    // the stepper (the menu isn't committed yet at earlier steps). Its pill is display-only.
    // Both post-commit steps are display-only pills for the same reason: they are reached only by
    // finishing the step before them, and jumping back to an earlier step from here would strand the
    // wizard with a committed menu and no route forward.
    if (key === 'schedule' || key === 'settings') return
    if (key === 'kitchen') { goToKitchen(); return }
    if (key === 'allergens') { goToAllergens(); return }
    setImportStep('review')
    setReviewStep(key === 'extras' ? 2 : 1)
  }
  const renderWizardStepper = (currentKey: WizKey) => {
    // In SETUP mode, prepend the completed "Your details" step so the operator sees ONE journey continuing —
    // not a second wizard restarting at 1. It renders as complete (green ✓) and is NOT clickable (they can't
    // go back to identity). The real steps then number from 2. When NOT inSetup the prefix is empty and the
    // output is byte-for-byte today's (same list, same i+1 numbering, same clickable markup).
    const prefix = inSetup ? [{ key: '__details__', label: 'Your details', done: true }] : []
    const all = [...prefix, ...wizardSteps.map(s => ({ key: s.key as string, label: s.label, done: false }))]
    // Extra classes ONLY in setup mode (the prepended pill can overflow the width); the non-setup path keeps
    // today's exact container/button/chevron classes so nothing changes for existing operators.
    const sk = inSetup ? ' shrink-0' : ''
    return (
      <div className={`flex items-center gap-1.5 mt-2${inSetup ? ' overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : ''}`}>
        {all.map((s, i) => (
          <Fragment key={s.key}>
            {s.done ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-green-700 bg-green-50 shrink-0">
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] bg-green-600 text-white">✓</span>
                {s.label}
              </span>
            ) : (
              <button type="button" onClick={() => goToStep(s.key as WizKey)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors${sk} ${currentKey === s.key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${currentKey === s.key ? 'bg-white text-slate-900' : 'bg-slate-200 text-slate-600'}`}>{i + 1}</span>
                {s.label}
              </button>
            )}
            {i < all.length - 1 && <span className={`text-slate-300 text-xs${sk}`}>›</span>}
          </Fragment>
        ))}
      </div>
    )
  }

  // ── K1: THE SETTINGS REVIEW SCREEN — ONE ARRAY, RENDERED GENERICALLY ─────────────────────────────
  // 🔴 ADDING AN ITEM MUST BE A DATA CHANGE, NOT A MARKUP CHANGE. The renderer below knows only about
  // `control` and the optional `secondary`; it has no idea what any particular row means. A fifth
  // setting is one more object in this array.
  //
  // 🔴 EVERY `currentValue` IS READ LIVE — from the `get_vans` response (reviewVan) or the truck row.
  // Nothing here hardcodes a default. That matters more than it looks: `kitchen_capacity` is left blank
  // at provision ON PURPOSE ("must be an active decision, not an inherited guess"), so a rendered "5"
  // would invent a ceiling nobody chose and quietly start promising collection times against it.
  //
  // ⚠️ ALL FOUR LIVE ON THE MANAGE → SETTINGS TAB — checked against the inventory, not assumed:
  //   capacity + order-ready → Settings → Your trucks;  cancellation → Settings → Contact Details;
  //   auto-accept → Settings → Order settings. `settingsAnchor` carries that location as text because
  //   Settings has no id anchors to link to; adding them would be UI work outside this slice.
  //
  // WRITES REUSE THE EXISTING ACTIONS, one per column's owner — no new endpoint:
  //   update_van_settings (van columns) · update_truck (allow_cancel/cutoff) · update_settings (auto_accept)
  type SetupReviewItem = {
    id: string
    label: string
    helpText: string
    currentValue: number | boolean | null
    control: 'capacity' | 'toggle'
    settingsAnchor: string
    disabled?: boolean
    onChange: (next: never) => void
    secondary?: {
      label: string
      /** Q4: the tail of a sentence the control sits inside, e.g. "…up to [30 minutes] before pickup". */
      suffix?: string
      value: number
      options: { value: number; label: string }[]
      visible: boolean
      onChange: (n: number) => void
    }
  }
  // One failure message for all three write paths. Never blocks: every row on this screen is optional,
  // so a failed save says so and leaves the operator on the step rather than trapping them.
  const reviewSaveFailed = (e: unknown) =>
    showToast(e instanceof Error && e.message ? e.message : "Couldn't save that — you can change it in Settings.", 'error')
  const saveVanReview = async (patch: Record<string, unknown>) => {
    if (!reviewVan) return
    try { await api('update_van_settings', { vanId: reviewVan.id, ...patch }) } catch (e) { reviewSaveFailed(e) }
  }
  const saveTruckReview = async (patch: Record<string, unknown>) => {
    try { await api('update_truck', { data: patch }) } catch (e) { reviewSaveFailed(e) }
  }
  // ⚠️ Q2: THE "TOTAL CAPACITY" ROW WAS REMOVED FROM HERE. It is already asked, in full and in context,
  // on the Kitchen-setup step two screens earlier — with the per-category grid that gives the number
  // its meaning. Asking again at the end read as a second, contradictory request. The Kitchen-setup
  // step and truck_vans.kitchen_capacity itself are untouched.
  //
  // 🔴 Q4: EVERY label AND helpText BELOW COMES FROM SETTING_COPY (lib/settings-copy.ts), which Manage →
  // Settings reads too. Do not type a string into this array — that is exactly how the "off by default"
  // line got here and then became false.
  const setupReviewItems: SetupReviewItem[] = [
    {
      id: 'allow_customer_cancellation',
      label: SETTING_COPY.allowCancellation.label,
      helpText: SETTING_COPY.allowCancellation.help,
      currentValue: reviewAllowCancel,
      control: 'toggle',
      settingsAnchor: 'Settings → Contact Details',
      onChange: ((next: boolean) => {
        setReviewAllowCancel(next)
        void saveTruckReview({ allow_customer_cancellation: next })
      }) as SetupReviewItem['onChange'],
      secondary: {
        label: SETTING_COPY.allowCancellation.cancelPrefix,
        suffix: SETTING_COPY.allowCancellation.cancelSuffix,
        value: reviewCancelMins,
        options: [
          { value: 15, label: '15 minutes' }, { value: 30, label: '30 minutes' },
          { value: 60, label: '60 minutes' }, { value: 120, label: '2 hours' },
        ],
        visible: reviewAllowCancel,
        onChange: (n: number) => { setReviewCancelMins(n); void saveTruckReview({ cancellation_cutoff_mins: n }) },
      },
    },
    {
      id: 'auto_accept',
      // ⚠️ THE ROW THAT PROVED WHY SETTING_COPY EXISTS. Its help text was hand-written here, said "Off
      // by default, so every order waits for you", and became false the day provisioning started
      // writing auto_accept:true. Rewriting it by hand a second time would only reset the clock; it now
      // reads the same constant Settings does and describes the setting rather than its default.
      label: SETTING_COPY.autoAccept.label,
      helpText: SETTING_COPY.autoAccept.help,
      currentValue: reviewAutoAccept,
      control: 'toggle',
      settingsAnchor: 'Settings → Order settings',
      onChange: ((next: boolean) => {
        setReviewAutoAccept(next)
        // update_settings takes TOP-LEVEL fields (not a `data` object) — the shape saveFormField uses.
        void (async () => {
          try { await api('update_settings', { auto_accept: next }) } catch (e) { reviewSaveFailed(e) }
        })()
      }) as SetupReviewItem['onChange'],
    },
    {
      id: 'order_ready_enabled',
      label: SETTING_COPY.orderReady.label,
      helpText: SETTING_COPY.orderReady.help,
      currentValue: reviewVan?.order_ready_enabled ?? null,
      control: 'toggle',
      settingsAnchor: 'Settings → Your trucks → Display settings',
      disabled: !reviewVan,
      onChange: ((next: boolean) => {
        setReviewVan(v => v ? { ...v, order_ready_enabled: next } : v)
        void saveVanReview({ order_ready_enabled: next })
      }) as SetupReviewItem['onChange'],
    },
    {
      // ── Q5: BUZZERS — THE POOL ONLY ───────────────────────────────────────────────────────────
      // 🔴 truck_vans.buzzer_count and NOTHING ELSE. The per-event PROMPT is truck_events.buzzer_prompt
      // and has no truck-level column at all — it is written only by the dashboard's
      // set_buzzer_prompt_override, per event, and expires by itself when the next event starts. There
      // is nothing on this screen it could honestly set, so it is absent rather than approximated.
      // Wording comes from Settings like every other row (SETTING_COPY.buzzers) — the pool DOES have a
      // Settings equivalent, so nothing had to be invented.
      // ⚠️ ALLOWLIST CHECKED: `buzzer_count` is in update_van_settings' destructured allowlist
      // (app/api/manage/route.ts) — an unlisted key there is silently dropped and the toggle would
      // appear to save while writing nothing. It is listed; this writes.
      id: 'buzzer_count',
      label: SETTING_COPY.buzzers.label,
      helpText: SETTING_COPY.buzzers.help,
      // The POOL is a number, but the question is a yes/no — non-null means "yes, and this many".
      currentValue: reviewVan ? reviewVan.buzzer_count != null : null,
      control: 'toggle',
      settingsAnchor: 'Settings → Your trucks → Display settings',
      disabled: !reviewVan,
      onChange: ((next: boolean) => {
        // Off ⇒ null (the feature is hidden entirely); on ⇒ the same default Settings offers.
        const n = next ? BUZZER_DEFAULT_COUNT : null
        setReviewVan(v => v ? { ...v, buzzer_count: n } : v)
        void saveVanReview({ buzzer_count: n })
      }) as SetupReviewItem['onChange'],
      secondary: {
        label: SETTING_COPY.buzzers.countLabel,
        value: reviewVan?.buzzer_count ?? BUZZER_DEFAULT_COUNT,
        options: Array.from({ length: BUZZER_MAX_COUNT }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
        visible: !!reviewVan && reviewVan.buzzer_count != null,
        onChange: (n: number) => {
          setReviewVan(v => v ? { ...v, buzzer_count: n } : v)
          void saveVanReview({ buzzer_count: n })
        },
      },
    },
  ]

  // ── H0b/H5: THE "ALLERGENS AREN'T SET" NOTICE, DEFINED ONCE ──────────────────────────────────────
  // 🔴 EXTRACTED, NOT REWRITTEN. This markup and copy are byte-for-byte what the done screen rendered
  // inline before H5; it is lifted here so H5's new heading reuses it BY REFERENCE and there is exactly
  // one copy of the string in the repo. Do not reword it and do not write a near-copy beside it — this
  // is a food-safety notice, and two versions of it drifting apart is how one of them ends up wrong.
  // ⚠️ The `inSetup` branch inside it is ALSO original: a setup operator has no Settings to be sent to
  // yet. Its firing CONDITION lives at the call site and is unchanged (see the done screen).
  const allergensNotSetNotice = (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left">
      <p className="text-xs font-bold text-amber-800">⚠ Allergens &amp; dietary aren&apos;t set yet</p>
      <p className="text-xs text-amber-700 mt-0.5">Review them {inSetup ? 'before going live' : 'in Settings before going live'}. Items are flagged &ldquo;allergens not set&rdquo; until you do.</p>
    </div>
  )

  // ── SCHEDULE STEP handlers (SETUP MODE) — wire the EXISTING flows; ScheduleTab is untouched ────────────
  // Facebook/Instagram rejection reused VERBATIM from Settings (:6577-6584).
  // V2: was a local copy whose `catch { return false }` failed OPEN. Both copies now call the one
  // shared guard, which fails CLOSED — see lib/url-normalise.ts.
  const schedIsBlockedDomain = isScraperBlockedDomain
  const SCHED_BLOCKED_DOMAIN_MSG = "Please use your website URL — Facebook and Instagram pages can't be scraped automatically."

  // Finish setup: setup_step='done' so inSetup goes false and the setup chrome stops haunting Manage. Single
  // scoped write (update_truck → .eq('id', truck.id)). Best-effort by posture (item 6): if it fails we still
  // move to the terminal 'done' screen so the operator is never trapped — but the setup chrome would reappear
  // on next load until a later successful write, so we surface the error.
  const finishSetup = async () => {
    setFinishingSetup(true)
    try {
      await api('update_truck', { data: { setup_step: 'done' } })
    } catch (e: any) {
      showToast(e?.message || "Couldn't mark setup complete — you can still continue.", 'error')
    } finally {
      setFinishingSetup(false)
      setImportStep('done')   // in setup mode 'done' does NOT auto-dismiss (item 2) — explicit exit only
    }
  }
  // FINISH-WITHOUT-EVENTS. Reached from Route A's post-verify "Continue →", Route C's "Continue →", and the
  // zero-events branch of schedSaveExtracted — every one of them a deliberate COMPLETION. NOT the header ×
  // any more: that is a dismissal and routes to the shared "Finish setting up later?" confirm like every
  // other step's ×, writing nothing. Do not re-point a dismiss control here. The separate footer "I'll do this later"
  // link was REMOVED: Route C is now the deliberate "later" path and produced an identical outcome, so two
  // differently-worded controls did the same thing. Keep this ONE function as every route's terminal move.
  // K1: the schedule step's terminal moves now land on the REVIEW SCREEN, not on 'done'. They must not
  // call finishSetup() — that writes setup_step:'done', which flips inSetup false and would unmount the
  // very step it was meant to open. finishSetup keeps its exact job and is called once, from the review
  // screen's "Looks good". No DB write happens here.
  const goToSettingsReview = () => { setImportStep('settings') }
  const skipSchedule = () => { goToSettingsReview() }

  // 🔴 MUTUAL EXCLUSIVITY — one route's in-progress state at a time. Wipes EVERY route's transient state (the
  // half-typed URL and the staged extracted events) so a switch can never leave a second route half-armed.
  // (Route C has no state to clear — it is copy + Continue.) NOTE: schedVerifiedEvents is included, but the
  // toggle below is LOCKED once it is set, so a switch never actually clears a completed verify — see
  // toggleScheduleRoute.
  const clearScheduleRoutes = () => {
    setSchedUrl(''); setSchedVerifying(false); setSchedVerifyError(null); setSchedVerifiedEvents(null)
    setSchedFile(null); setSchedText(''); setSchedPhotoProcessing(false); setSchedExtracted(null); setSchedSaving(false)
  }
  // Accordion toggle: open a different row, or collapse the open one — ANY switch clears the others' state so
  // exactly one route can ever be armed. 🔴 Once a URL has verified+enrolled (schedVerifiedEvents set) the
  // accordion is LOCKED: no switching, so a verified URL and photo-imported dates can never both be
  // submitted — the only forward move is the website row's own "Continue →". A verify is an actual write
  // (schedule_url + scraper_preference), so it cannot be silently discarded by switching away.
  const toggleScheduleRoute = (key: 'website' | 'photo' | 'manual') => {
    if (schedVerifiedEvents) return
    const next = scheduleRoute === key ? 'chooser' : key
    clearScheduleRoutes()
    setScheduleRoute(next)
  }

  // ROUTE A — verify the schedule URL, and ONLY on found:true enrol (schedule_url + scraper_preference:'auto'
  // together). Same endpoint + same reason→message mapping as Settings' handleVerifyUrl. No blur-save: a page
  // the scraper can't read must never be enrolled silently.
  const schedVerify = async () => {
    // N1: normalise BEFORE anything else. `www.yourtruck.co.uk/events` used to reach the server
    // scheme-less, be rejected by `!url.startsWith('http')` with a bare 400, and be reported as
    // "couldn't reach this website" — about a site nothing had tried to reach.
    // 🔴 This also repairs the blocked-domain guard: schedIsBlockedDomain reads `new URL(url).hostname`
    // inside a try/catch that returns FALSE on throw, so a scheme-less `www.facebook.com/…` was not
    // blocked — it was unparseable, and the guard failed open. It is now given a parseable URL.
    const url = normaliseUrl(schedUrl)
    if (!url) { setSchedVerifyError(URL_MALFORMED_MSG); return }
    if (schedIsBlockedDomain(url)) { setSchedVerifyError(SCHED_BLOCKED_DOMAIN_MSG); return }
    // Reflect the corrected address back into the field, so what was verified and what is on screen
    // are the same string — and the operator sees what we actually used.
    setSchedUrl(url)
    setSchedVerifying(true); setSchedVerifyError(null); setSchedVerifiedEvents(null)
    try {
      const res = await fetch('/api/manage/verify-schedule-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, url }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (data.found) {
        // 🔴 Enrol ONLY now — verification is the evidence the scraper can read this page.
        try {
          // (d) BOTH PROMISES ARE KEPT. The enrolment writes are unchanged: this page is watched from
          // here on. What changed is that the dates found TODAY are no longer thrown away.
          await api('update_truck', { data: { schedule_url: url, scraper_preference: 'auto' } })
          setSchedVerifiedEvents(data.events || [])
          // ── T1: THE SAME MODAL SETTINGS OPENS ───────────────────────────────────────────────
          // 🔴 This line replaces a read-only bullet list, and it is a TRIGGER, NOT A COPY. The
          // editable "Events found on your website" modal lives in ScheduleTab and opens on
          // pendingVerifyEvents; nothing about it was lifted, duplicated or re-implemented here.
          // LIVE EVIDENCE FOR WHY: truck `village-spice` finished this route on 4 Aug with
          // schedule_url set, scraper_preference 'auto', scraper_rule 'scroll_next' — and ZERO
          // truck_events rows. It enrolled and imported nothing.
          // The second argument is the wizard's completion callback: ScheduleTab's save has no idea
          // `importStep` exists, so without it the modal would close and the wizard would sit on the
          // schedule step with no forward move. Settings passes no second argument at all.
          onVerifySuccess(data.events || [], () => goToSettingsReview())
        } catch (e: any) {
          setSchedVerifyError(e?.message || "We read your schedule, but couldn't save it just now — try again.")
        }
        return
      }
      // N2: a 400 means the SERVER rejected the address without fetching anything, so "couldn't reach"
      // would be false. It maps to the malformed message like any other unparseable input.
      const reason: string = data.reason
        || (res.status >= 500 ? 'launch_failed' : res.status === 400 ? 'malformed' : 'unreachable')
      setSchedVerifyError(VERIFY_MESSAGES[reason] || VERIFY_MESSAGES.unreachable)
    } catch {
      // The verify request itself failed — our API or the operator's connection, not their address.
      setSchedVerifyError(VERIFY_MESSAGES.unreachable)
    } finally {
      setSchedVerifying(false)
    }
  }

  // ROUTE B — photo/text → process-schedule (parse only). Review, then save via the SAME upsert_event calls
  // saveExtractedEvents uses (no second save path). Does NOT set schedule_url / enrol (no URL to scrape).
  const schedProcessPhoto = async () => {
    if (!schedFile && !schedText.trim()) return
    setSchedPhotoProcessing(true)
    try {
      const fd = new FormData()
      if (schedFile) fd.append('file', schedFile)
      if (schedText) fd.append('text', schedText)
      fd.append('token', token)
      const res = await fetch('/api/manage/process-schedule', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({} as any))
      setSchedExtracted(data.events || [])
    } catch {
      showToast("Couldn't read that schedule — try a clearer photo or type your dates in.", 'error')
      setSchedExtracted([])
    } finally {
      setSchedPhotoProcessing(false)
    }
  }
  const schedSaveExtracted = async () => {
    const toSave = (schedExtracted || []).filter(e => e && (e.event_date || e.venue_name))
    if (toSave.length === 0) { skipSchedule(); return }
    setSchedSaving(true)
    try {
      for (const ev of toSave) {
        const parts = (ev.event_date || '').split('/')
        const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}` : ev.event_date
        const { lat, lng } = (ev.town || ev.postcode)
          ? await geocodeLocation(ev.venue_name || '', ev.town || '', ev.postcode || '')
          : { lat: null, lng: null }
        await api('upsert_event', {
          venue_name: ev.venue_name || '', town: ev.town || '', postcode: ev.postcode || '', address: ev.address || '',
          event_date: isoDate, start_time: ev.start_time || '', end_time: ev.end_time || '', notes: ev.notes || '',
          latitude: lat, longitude: lng, truck_id: truck.id,
        })
      }
      goToSettingsReview()   // K1 — was finishSetup(); the review screen now owns that call
    } catch (e: any) {
      showToast(e?.message || 'Failed to save events', 'error')
      setSchedSaving(false)   // stay so they can retry or skip
    }
  }

  // ROUTE C — no handler. Selecting it shows explanatory copy; its "Continue →" is skipSchedule, so the
  // outcome is exactly the no-events finish (setup_step='done', nothing written). The old one-date
  // upsert_event form lived here and was removed on purpose — see the state note at the top of this step.

  // ── Import ALLERGENS step handlers ────────────────────────────────────────────────────────────────
  // (cardEntryKey now lives in lib/allergen-card-match — shared by both wizards + CardUploadPage.)
  // Additive UNION merge into a STAGED import item (by index). Never subtractive; _allergensChecked stays
  // false so the dish commits verified=false and is reviewed. Uses the shared mergeAllergensUnion (lib).
  const mergeCardAllergensIntoItem = (idx: number, allergens: string[]) =>
    setImportResult(prev => prev ? { ...prev, items: prev.items.map((it: any, i: number) =>
      i === idx ? { ...it, allergens: mergeAllergensUnion(it.allergens || [], allergens), _allergensChecked: false } : it) } : prev)
  // Upload/paste a card → process-allergens → deterministic EXACT match against the staged dishes (keyed by
  // index) → AUTO-APPLY only the exact matches (union). No-match → unmatched list; multi → ambiguous list;
  // both surfaced for the operator to assign/dismiss. NOTHING non-exact is auto-applied.
  const handleImportCardProcess = async (file: File | null, text: string) => {
    if (!importResult) return
    setCardImportProcessing(true)
    try {
      const fd = new FormData()
      fd.append('token', token)
      if (file) fd.append('file', file)
      else fd.append('text', text)
      const res = await fetch('/api/manage/process-allergens', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data.ok) { showToast('Couldn’t read the allergen card — try again', 'error'); return }
      const parsed = data.allergens || {}
      setCardImportParsed(parsed)
      const entries: CardEntry[] = Array.isArray(parsed.entries) ? parsed.entries.filter((e: any) => e && e.name && Array.isArray(e.allergens)) : []
      const dishes: DishRef[] = importResult.items.map((it: any, i: number) => ({ id: String(i), name: String(it.name || '') }))
      const m = matchCardEntries(entries, dishes)
      setCardImportMatch(m)
      m.matched.forEach(({ entry, dishId }) => mergeCardAllergensIntoItem(Number(dishId), entry.allergens))   // exact only
      setCardEntriesResolved(new Set(m.matched.map(x => cardEntryKey(x.entry))))   // exact matches count as resolved
      setCardImportDone(true)
      showToast(`Card read — ${m.matched.length} matched, ${m.unmatched.length + m.ambiguous.length} need your assignment`, 'success')
    } catch { showToast('Couldn’t read the allergen card — try again', 'error') }
    finally { setCardImportProcessing(false) }
  }
  // CARD-ONLY (import): image → faithful PROSE transcription (no extraction/vocab) → pre-fills the editor.
  const transcribeImportCard = async (file: File) => {
    setImportCardOnlyTranscribing(true)
    try {
      const fd = new FormData(); fd.append('token', token); fd.append('mode', 'transcribe'); fd.append('file', file)
      const res = await fetch('/api/manage/process-allergens', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.ok && typeof data.text === 'string') setImportCardOnlyText(data.text)
      else showToast('Couldn’t read that image — type or paste your card instead', 'error')
    } catch { showToast('Couldn’t read that image — type or paste your card instead', 'error') }
    finally { setImportCardOnlyTranscribing(false) }
  }
  // Operator assigns an unmatched/ambiguous card entry to a specific dish → union into that dish, mark resolved.
  const assignCardEntry = (entry: CardEntry, dishIdx: number) => {
    mergeCardAllergensIntoItem(dishIdx, entry.allergens)
    setCardEntriesResolved(prev => new Set(prev).add(cardEntryKey(entry)))
  }
  // Operator dismisses a card entry (no dish) → mark resolved, attach nowhere (safe — never force a match).
  const dismissCardEntry = (entry: CardEntry) =>
    setCardEntriesResolved(prev => new Set(prev).add(cardEntryKey(entry)))

  // Build the COMMIT payload's items by applying every chooser selection — PURELY (returns a new array,
  // never mutates importResult). importResult always holds SEPARATE items during review (Back-stable),
  // so the only action is SYNTHESISE for rows chosen 'grouped' (default): remove the member items, add
  // the grouped item. 'separate' rows are left as-is (no-op). Base/surcharge are computed from the
  // CURRENT item prices, so page-1 price edits flow straight into the committed group.
  const buildGroupedItems = (items: any[]): any[] => {
    const rows = computeGroupingRows(items)
    const toRemove = new Set<number>()
    const toAdd: any[] = []
    for (const row of rows) {
      const choice = groupingChoice[row.key] ?? 'grouped'
      if (choice === 'grouped') {
        row.memberIdxs.forEach(i => toRemove.add(i))
        toAdd.push(row.groupedItem)
      }
    }
    const kept = items.filter((_, i) => !toRemove.has(i))
    return [...kept, ...toAdd]
  }

  const dishOffersGroup = (item: any, gnorm: string) => (item.modifierGroups || []).some((g: any) => normName(g.name) === gnorm)
  const dishHasOption = (item: any, gnorm: string, onorm: string) =>
    (item.modifierGroups || []).some((g: any) => normName(g.name) === gnorm && (g.options || []).some((o: any) => normName(o.name) === onorm))
  // Toggle whether a dish OFFERS a group (matrix "Offer" tick). Adding seeds the FULL superset of options.
  const toggleImportOffer = (itemIdx: number, vg: ImpVGroup) =>
    setImportResult(prev => prev ? { ...prev, items: prev.items.map((it, i) => {
      if (i !== itemIdx) return it
      if (dishOffersGroup(it, vg.norm)) return { ...it, modifierGroups: (it.modifierGroups || []).filter((g: any) => normName(g.name) !== vg.norm) }
      const newGroup = { name: vg.name, isRequired: vg.isRequired, singleSelect: vg.singleSelect,
        options: vg.options.map(o => ({ name: o.name, price: o.price, allergens: [...o.allergens], dietary: [...o.dietary], _allergensChecked: false })) }
      return { ...it, modifierGroups: [...(it.modifierGroups || []), newGroup] }
    }) } : prev)
  // Toggle a single option for an OFFERED dish (include ⇄ exclude). Required last-tick guard: can't
  // remove the last option of a required group for that dish.
  const toggleImportOption = (itemIdx: number, vg: ImpVGroup, vo: ImpVOpt) =>
    setImportResult(prev => prev ? { ...prev, items: prev.items.map((it, i) => {
      if (i !== itemIdx) return it
      return { ...it, modifierGroups: (it.modifierGroups || []).map((g: any) => {
        if (normName(g.name) !== vg.norm) return g
        const has = (g.options || []).some((o: any) => normName(o.name) === vo.norm)
        if (has) {
          if ((g.isRequired === true || vg.isRequired) && (g.options || []).length <= 1) return g  // last-tick guard
          return { ...g, options: (g.options || []).filter((o: any) => normName(o.name) !== vo.norm) }
        }
        return { ...g, options: [...(g.options || []), { name: vo.name, price: vo.price, allergens: [...vo.allergens], dietary: [...vo.dietary], _allergensChecked: false }] }
      }) }
    }) } : prev)
  // Selection-mode / Required — set on EVERY dish carrying the group (keeps the virtual group consistent).
  const setImportGroupRule = (vg: ImpVGroup, patch: { isRequired?: boolean; singleSelect?: boolean }) =>
    setImportResult(prev => prev ? { ...prev, items: prev.items.map(it => ({ ...it,
      modifierGroups: (it.modifierGroups || []).map((g: any) => normName(g.name) === vg.norm ? { ...g, ...patch } : g) })) } : prev)

  const handleCommitMenu = async () => {
    if (!importResult) return
    // The display mode chosen on the Allergens step (before Kitchen) — stable in state by commit time.
    const chosenDisplayMode = pendingDisplayMode
    // §69: allergens are NO LONGER a hard gate (price conflicts auto-split at §66). Unreviewed items
    // commit with allergens_verified=false → flagged "allergens not set" in manage for later. No block.
    setImportStep('saving')
    // Apply the grouping chooser's selections to the committed items (grouped → variant group, separate
    // → individual items). Pure transform — importResult itself is untouched. Empty-name rows (blank
    // "+ Add item" rows the operator never filled in) are EXCLUDED so they can't import as £0 nameless items.
    let itemsToCommit = buildGroupedItems(importResult.items).filter(it => String(it.name || '').trim())
    // Blanket "may contain X" — applied to EVERY dish ONLY if the operator opted in on the Allergens step
    // (default off). Additive union, verified=false (reviewed next). Never subtractive.
    const blanket = cardImportParsed?.blanket
    if (cardBlanketOptIn && blanket?.length) {
      itemsToCommit = itemsToCommit.map((it: any) => ({ ...it, allergens: mergeAllergensUnion(it.allergens || [], blanket), _allergensChecked: false }))
    }
    try {
      const res = await fetch('/api/manage/commit-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // clearFirst only in the demo→real migration — makes a retry after a partial commit repair rather
        // than duplicate. A normal operator import omits it (server default false → append, unchanged).
        body: JSON.stringify({ token, categories: importResult.categories, items: itemsToCommit, categoryPrep, clearFirst: demoImportMode }),
      })
      const data = await res.json()
      if (data.ok) {
        // DEFERRED Total-capacity write — fires ONLY now (commit), and only if the operator changed it
        // (don't clobber an unchanged ceiling). Applied truck-wide across the van(s). Best-effort.
        if (importKitchenDirty) {
          for (const v of importVans) {
            try { await api('update_van_settings', { vanId: v.id, kitchen_capacity: importKitchenCapacity.kitchen_capacity, capacity_window_mins: importKitchenCapacity.capacity_window_mins }) } catch { /* non-fatal */ }
          }
        }
        setImportDoneSkipped(data.skipped ?? 0)
        // Card artifact: persist the formatted card text (truck-level) so it's available as the card view —
        // best-effort, never blocks the import. Reuses the existing update_settings card path (no new path).
        if (cardImportDone && cardImportParsed) {
          const cardText = cardImportParsed.formatted_text || [
            cardImportParsed.summary,
            cardImportParsed.contains?.length ? `Contains: ${cardImportParsed.contains.join(', ')}` : null,
            cardImportParsed.may_contain?.length ? `May contain: ${cardImportParsed.may_contain.join(', ')}` : null,
            cardImportParsed.cross_contamination?.length ? cardImportParsed.cross_contamination.join('. ') : null,
            cardImportParsed.additional_notes,
          ].filter(Boolean).join('\n')
          if (cardText) { try { await api('update_settings', { allergen_info_text: cardText }) } catch { /* non-fatal */ } }
        }
        // CARD-ONLY display mode: store the operator's VERBATIM edited card text (NO extraction/vocab).
        // Mutually exclusive with the per-dish formatted_text path above (cardImportDone is per-dish-only).
        if (chosenDisplayMode === 'card' && importCardOnlyText.trim()) {
          try { await api('update_settings', { allergen_info_text: importCardOnlyText.trim() }) } catch { /* non-fatal */ }
        }
        // Apply the operator's chosen DISPLAY mode (decoupled from detection). null = skipped → leave the
        // existing mode. Detected data is committed verified=false regardless (retain-but-hide).
        if (chosenDisplayMode) { try { await api('update_settings', { allergen_display_mode: chosenDisplayMode }) } catch { /* non-fatal */ } }
        // The per-dish review already happened IN-FLOW on staged data → confirmed dishes commit verified=true
        // via _allergensChecked (atomic, here). No post-commit wizard auto-open.
        // COMMIT-FIRST: the menu is now durable. In SETUP mode a NEW, skippable step (Schedule) follows before
        // 'done'; abandoning it loses nothing. Existing operators (not inSetup) keep today's behaviour EXACTLY:
        // straight to 'done' + the 2.5s reset+reload auto-dismiss.
        // C4: the menu is committed — the handover is FINISHED, not interrupted, so the param goes.
        // Placed here (both branches below it) rather than in the auto-dismiss timeout, because the
        // setup route never reaches that timeout.
        stripImportParam()
        if (inSetup) {
          setImportStep('schedule')
        } else {
          setImportStep('done')
          setTimeout(() => {
            resetImportState()
            reload()
          }, 2500)
        }
      } else {
        // 🔴 THE MISSING ELSE (V8.5/V8.6 carried backlog). A 400 or {ok:false} does NOT throw, so without
        // this branch importStep stayed 'saving' forever — an indefinite spinner, no error, and the
        // operator never learns to retry (so clearFirst's retry path never runs). Land back on the Kitchen
        // step ('prep') — the same place the catch recovers to, and where the "Save" button lives — so they
        // can act. §10 Phase 1.7: an `else`, NOT a `finally` (a finally would clobber the success 'done').
        //
        // ⚠️ commit-menu is NON-TRANSACTIONAL and can return ok:false AFTER a partial write, so the copy
        // must not claim nothing saved. "couldn't be completed" + "some items may have saved" is honest;
        // clearFirst (demo migration) makes a clean retry safe, a plain operator retry may duplicate.
        console.error('Menu commit returned not-ok:', data)
        setImportStep('prep')
        showToast(
          data?.error
            ? `Couldn’t finish saving the menu: ${data.error}. Some items may already have saved — check your menu before retrying.`
            : 'Couldn’t finish saving the menu. Some items may already have saved — check your menu before retrying.',
          'error',
        )
      }
    } catch (err) {
      console.error('Menu commit failed:', err)
      setImportStep('prep')
    }
  }

  const uploadItemPhoto = async (file: File) => {
    if (!editingItem) return
    setUploadingItemPhoto(true)
    try {
      const { upload_url, path } = await api('get_upload_url', { filename: file.name, content_type: file.type })
      await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      // Unified auto-save: full-object upsert (not a sparse {id, image_path} — that coerced other
      // absent fields to null/default). In CREATE mode this stages onto editingItem until "Add item".
      await saveItemPatch({ image_path: path })
    } catch (err: any) { showToast(err.message || 'Upload failed', 'error') }
    finally { setUploadingItemPhoto(false) }
  }
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [allergenText, setAllergenText] = useState('')
  const [allergenUrl, setAllergenUrl] = useState(truck.allergen_info_url || '')
  const [allergenInfoText, setAllergenInfoText] = useState(truck.allergen_info_text || '')
  type AllergenStep = 'idle' | 'processing' | 'review'
  const [allergenStep, setAllergenStep] = useState<AllergenStep>('idle')
  const [allergenExtracted, setAllergenExtracted] = useState<any>(null)
  const [showAllergenModal, setShowAllergenModal] = useState(false)

  const handleAllergenUploadAndProcess = async (file: File) => {
    setAllergenStep('processing')
    try {
      const { upload_url, path } = await api('get_upload_url', { filename: file.name, content_type: file.type })
      await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${path}`
      setAllergenUrl(publicUrl)
      await api('update_settings', { allergen_info_url: publicUrl })
    } catch { /* file upload failure — continue with AI */ }

    const fd = new FormData()
    fd.append('token', token)
    fd.append('file', file)
    try {
      const res = await fetch('/api/manage/process-allergens', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.ok) { setAllergenExtracted(data.allergens); setAllergenStep('review') }
      else { setAllergenStep('idle'); showToast('AI processing failed', 'error') }
    } catch { setAllergenStep('idle'); showToast('Processing failed', 'error') }
  }

  const handleAllergenTextProcess = async (text: string) => {
    setAllergenStep('processing')
    const fd = new FormData()
    fd.append('token', token)
    fd.append('text', text)
    try {
      const res = await fetch('/api/manage/process-allergens', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.ok) { setAllergenExtracted(data.allergens); setAllergenStep('review') }
      else { setAllergenStep('idle'); showToast('AI processing failed', 'error') }
    } catch { setAllergenStep('idle'); showToast('Processing failed', 'error') }
  }

  const handleSaveAllergens = async () => {
    if (!allergenExtracted) return
    const formattedText = allergenExtracted.formatted_text || [
      allergenExtracted.summary,
      allergenExtracted.contains?.length ? `Contains: ${allergenExtracted.contains.join(', ')}` : null,
      allergenExtracted.may_contain?.length ? `May contain: ${allergenExtracted.may_contain.join(', ')}` : null,
      allergenExtracted.dietary_options?.length ? allergenExtracted.dietary_options.join('. ') : null,
      allergenExtracted.additional_notes,
    ].filter(Boolean).join('\n')
    try {
      await api('update_settings', { allergen_info_text: formattedText })
      setAllergenInfoText(formattedText)
      setAllergenStep('idle')
      setAllergenExtracted(null)
      setAllergenText('')
      setShowAllergenModal(false)
    } catch (e: any) { showToast(e.message || 'Save failed', 'error') }
  }

  const saveCat = async (overrides?: Partial<Category>) => {
    const data = { ...(editingCat || {}), ...overrides } as Partial<Category>
    if (!data?.name) return
    setSaving(true)
    try {
      await api('upsert_category', { id: data.id, name: data.name, prep_secs: data.prep_secs || 0, batch_size: data.batch_size || 0, allow_notes: !!(data as any).allow_notes, default_stock: (data as any).default_stock ?? null })
      if (!data.id) { setEditingCat(null) } // only close for new category modal
      reload()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  // ── Edit-item modal = ALL AUTO-SAVE (option A) ──────────────────────────────
  // EDIT mode (existing id): every field persists on blur/change via saveItemPatch — no Save/Cancel,
  // just Done. CREATE mode (no id yet): saveItem makes the row (name+price+category), then switches the
  // modal to EDIT mode IN PLACE so subsequent edits auto-save. §23: optimistic local update, NO reload
  // on field saves.
  const [savedShown, setSavedShown] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashSaved = () => {
    setSavedShown(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedShown(false), 1500)
  }

  // Persist one or more fields of the OPEN existing item. Sends the FULL merged item (NOT a sparse
  // patch): upsert_item coerces absent fields to null/default (subcategory_id, default_stock,
  // spiciness, auto_accept) — a sparse body would clobber them. Optimistic local update + revert.
  // CREATE mode (no id): stages into editingItem only — the row doesn't exist yet (saveItem makes it).
  const saveItemPatch = async (patch: Record<string, any>) => {
    if (!editingItem) return
    const next = { ...editingItem, ...patch } as Item
    setEditingItem(next)
    if (!next.id) return
    const prevLocal = localItems
    setLocalItems(list => list.map(i => i.id === next.id ? next : i))
    try { await api('upsert_item', next); flashSaved() }
    catch (e: any) { setLocalItems(prevLocal); showToast(e.message, 'error') }
  }

  // Allergen-wizard per-row confirm — writes an ARBITRARY item (not the open editingItem) via the
  // SAME shared upsert_item path as saveItemPatch / the edit-modal AllergenToggles. Sends the FULL
  // merged item (upsert_item coerces absent fields → null/default) with allergens + dietary_info +
  // allergens_verified=true. Flipping verified=true is the ONLY thing that reveals the item's
  // allergens to customers (deployed verified-gate in app/api/menu/[truckId]/route.ts). Optimistic
  // local update + revert; only fires on explicit operator confirm — never auto/batch.
  // Shared allergen writer for the wizard — sets allergens + dietary + verified via the SAME upsert_item
  // path as the edit modal. Optimistic + revert. No toast here (the wizard owns the named confirm toast
  // / undo); failures still surface an error toast + rethrow so the caller can react.
  const writeItemAllergens = async (item: Item, allergens: string[], dietary: string[], verified: boolean, source?: 'card') => {
    const next = { ...item, allergens, dietary_info: dietary, allergens_verified: verified } as Item
    const prevLocal = localItems
    setLocalItems(list => list.map(i => i.id === item.id ? next : i))
    // _allergenSource='card' → the audit logs 'card_match' (vs a manual 'edit'). Not a column — read + dropped server-side.
    try { await api('upsert_item', { ...next, ...(source ? { _allergenSource: source } : {}) }) }
    catch (e: any) { setLocalItems(prevLocal); showToast(e.message, 'error'); throw e }
  }

  // CREATE handler — validates the 3 required fields, inserts the row, then switches the modal to EDIT
  // mode IN PLACE (keep open, now with the server id) so auto-save takes over. Falls back to reload if
  // the insert didn't echo a row.
  const saveItem = async () => {
    if (!editingItem) return
    if (!editingItem.name?.trim()) { showToast('Item name is required', 'error'); return }
    if (!(Number(editingItem.price) > 0)) { showToast('Enter a price', 'error'); return }
    if (!editingItem.category_id) { showToast('Choose a category', 'error'); return }
    setSaving(true)
    try {
      const result = await api('upsert_item', editingItem)
      const saved = result.item as Item | undefined
      showToast('Item added')
      if (saved?.id) {
        setLocalItems(prev => [...prev, saved])
        setEditingItem(saved)                 // → EDIT mode: options section + per-field auto-save now active
        handleExpandCat(saved.category_id ?? null)
        flashSaved()
      } else {
        const catId = editingItem.category_id
        setEditingItem(null); await reload(); if (catId) handleExpandCat(catId)
      }
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  // ── Reverse view (Stage B, Part 4): toggle a modifier GROUP on/off for THIS dish ──
  // Instant-save, no save button, optimistic — writes the same item_modifier_groups link the
  // dish-picker uses, and patches the parent state so the Custom Extras picker reflects it.
  const toggleGroupForItem = async (menu_item_id: string, group_id: string, currentlyAttached: boolean) => {
    const attached = !currentlyAttached
    setItemModGroups(prev => attached
      ? [...prev, { menu_item_id, group_id }]
      : prev.filter(x => !(x.menu_item_id === menu_item_id && x.group_id === group_id)))
    try {
      await api('set_item_modifier_group', { group_id, menu_item_id, attached })
    } catch (e: any) {
      setItemModGroups(prev => attached
        ? prev.filter(x => !(x.menu_item_id === menu_item_id && x.group_id === group_id))
        : [...prev, { menu_item_id, group_id }])
      showToast(e.message, 'error')
    }
  }

  // ── Per-dish OPTION exclusions in the edit-item modal (phase 3b) — SAME backend/semantics as the
  // ModifiersTab matrix (set_item_group_excluded_options, opt-out). Mirrored here because it's a
  // separate component scope; both write the same excluded_option_ids so the two surfaces stay in sync.
  const excludedFor = (menu_item_id: string, group_id: string): string[] =>
    itemModGroups.find(x => x.menu_item_id === menu_item_id && x.group_id === group_id)?.excluded_option_ids || []

  // The options THIS dish actually offers in a group — group's options MINUS its per-dish exclusions.
  // Mirrors the menu API resolveGroup predicate (drop ids in excluded_option_ids) so the manage
  // menu-list line agrees with the order screens. Use this wherever manage LISTS a dish's offered
  // options (not where it shows all options with per-option tick/cell state — those stay full + flagged).
  const optionsForItemGroup = (itemId: string, group: { id: string }) => {
    const excluded = new Set(excludedFor(itemId, group.id))
    return modifierOptions.filter(o => o.group_id === group.id && !excluded.has(o.id))
  }

  const toggleItemOption = async (menu_item_id: string, group_id: string, option_id: string, currentlyIncluded: boolean) => {
    const cur = excludedFor(menu_item_id, group_id)
    const next = currentlyIncluded ? Array.from(new Set([...cur, option_id])) : cur.filter(id => id !== option_id)
    const prev = itemModGroups
    setItemModGroups(list => list.map(x =>
      x.menu_item_id === menu_item_id && x.group_id === group_id ? { ...x, excluded_option_ids: next } : x))
    try {
      await api('set_item_group_excluded_options', { group_id, menu_item_id, excluded_option_ids: next })
    } catch (e: any) {
      setItemModGroups(prev)
      showToast(e.message, 'error')
    }
  }

  // Expand a category and auto-load it into editingCat for inline settings
  const handleExpandCat = (catId: string | null) => {
    setExpandedCat(catId)
    if (catId) {
      const cat = categories.find(c => c.id === catId)
      if (cat) setEditingCat(cat as any)
    } else {
      setEditingCat(null)
    }
  }

  const handleDeleteCategory = async (cat: Category) => {
    const catItemCount = localItems.filter(i => i.category_id === cat.id).length
    const confirmMsg = catItemCount > 0
      ? `Delete "${cat.name}"? This will also delete ${catItemCount} item${catItemCount === 1 ? '' : 's'} in this category. This cannot be undone.`
      : `Delete "${cat.name}"? This cannot be undone.`
    if (!window.confirm(confirmMsg)) return
    try {
      if (catItemCount > 0) {
        await api('bulk_delete_items', { category_id: cat.id })
      }
      await api('delete_category', { id: cat.id })
      await reload()
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  const toggleItem = async (item: Item) => {
    const newAvail = !item.is_available
    setLocalItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: newAvail } : i))
    try {
      await api('toggle_item', { id: item.id, is_available: newAvail })
    } catch (e: any) {
      setLocalItems(prev => prev.map(i => i.id === item.id ? item : i))
      showToast(e.message, 'error')
    }
  }

  const confirmDeleteItem = async () => {
    if (!deletingItem) return
    const gone = deletingItem
    setLocalItems(prev => prev.filter(i => i.id !== gone.id))
    setDeletingItem(null)
    try {
      await api('delete_item', { id: gone.id })
      showToast('Item removed')
    } catch (e: any) {
      setLocalItems(prev => [...prev, gone])
      showToast(e.message, 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="mb-2">
        {/* Row 1: heading + Add category button */}
        <div className="flex items-start justify-between">
          <div>
            {/* Manage page section heading — use font-black text-slate-900 text-lg for all tab headings */}
            <h2 className="font-black text-slate-900 text-lg">Menu</h2>
            <p className="text-slate-400 text-sm mt-0.5">
              {categories.length} {categories.length === 1 ? 'category' : 'categories'} · {items.length} items
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end gap-0.5">
              <button onClick={() => setImportStep('upload')}
                className="flex items-center gap-2 px-4 py-2 border border-orange-200 text-orange-600 text-sm font-medium rounded-xl hover:bg-orange-50 transition-colors whitespace-nowrap">
                ✨ Import menu
              </button>
              <p className="text-xs text-slate-400">photo, PDF or text</p>
            </div>
            <div className="self-start">
              <Btn label="+ Add category" onClick={() => setEditingCat({ prep_secs: 0, batch_size: 0, allow_notes: false } as any)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── I5: "NOT VISIBLE TO CUSTOMERS" ────────────────────────────────────────────────────────────
          🔴 THE GATE THIS REPORTS IS CORRECT AND IS NOT BEING CHANGED. app/api/menu/[truckId]/route.ts
          hides any item with allergens_verified === false from the CUSTOMER menu whenever the display
          mode is not 'card' — and `null` is not 'card', so a truck that never picked a mode is in
          per-dish mode by default. Every imported item commits verified=false. Partial allergen data is
          more dangerous than none, so hiding is right; the defect is purely that the operator cannot
          tell, because their own dashboard passes `isDashboard` and shows everything.
          THE CONDITION IS THE SERVER'S, RESTATED: mode !== 'card' AND at least one item explicitly
          false. Strict === false, exactly as the route has it — legacy/null items are visible and must
          not be counted. It is derived from live props, so it clears itself the moment the last dish is
          confirmed or the operator switches to card mode; there is nothing to dismiss and nothing
          stored.
          ⚠️ DELIBERATELY UNGATED — a live truck in this state has an invisible menu and needs to know.
          Reuses onOpenAllergenWizard, the same entry point the section below already uses; no new path.
          On the WORDING: slice H's `allergensNotSetNotice` is not reused because it says a different
          thing ("allergens aren't set yet ... items are flagged"). It describes the flag; this
          describes the consequence. Reusing it would replace the one fact the operator is missing with
          the one they can already see — see the report. */}
      {(() => {
        const hiddenCount = (truck.allergen_display_mode ?? null) !== 'card'
          ? items.filter(i => i.allergens_verified === false).length
          : 0
        if (hiddenCount === 0) return null
        return (
          <div className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 flex items-start gap-3">
            <span className="text-red-500 text-lg shrink-0" aria-hidden>🚫</span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-red-900">
                {hiddenCount} {hiddenCount === 1 ? 'item is' : 'items are'} not visible to customers
              </p>
              <p className="text-xs text-red-800 mt-0.5">
                {hiddenCount === 1 ? 'It won’t appear' : 'They won’t appear'} on your ordering page until
                {hiddenCount === 1 ? ' its' : ' their'} allergens are confirmed — showing a dish with unchecked
                allergen info would read as &ldquo;allergen-free&rdquo;. You can still see
                {hiddenCount === 1 ? ' it' : ' them'} here.{' '}
                <button type="button" onClick={onOpenAllergenWizard} className="underline font-bold">
                  Confirm allergens →
                </button>
              </p>
            </div>
          </div>
        )
      })()}

      {/* Empty state / Category list */}
      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="text-5xl mb-4">✨</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Build your menu in seconds</h3>
          <p className="text-sm text-slate-500 text-center max-w-sm mb-2">
            Take a photo of your menu board, screenshot your existing menu, or drag in a PDF — our AI will extract everything and build your digital menu automatically.
          </p>
          <p className="text-xs text-slate-400 text-center max-w-xs mb-8">
            Works with photos, screenshots, PDFs and plain text. You can review and edit everything before it's saved.
          </p>
          <button onClick={() => setImportStep('upload')}
            className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white font-semibold rounded-xl text-sm hover:bg-orange-700 transition-colors shadow-sm">
            ✨ Import menu with AI
          </button>
          <button onClick={() => setEditingCat({ prep_secs: 0, batch_size: 0, allow_notes: false } as any)}
            className="mt-3 text-xs text-slate-400 hover:text-slate-600 underline">
            or add categories manually
          </button>
        </div>
      ) : null}

      {categories.map((cat, index) => {
        const catItems = localItems.filter(i => i.category_id === cat.id)
        const isOpen = expandedCat === cat.id
        return (
          <div
            key={cat.id}
            draggable
            onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/html', cat.id)
              const target = e.currentTarget as HTMLElement
              target.style.opacity = '0.5'
              target.style.border = '2px dashed #fb923c'
            }}
            onDragEnd={(e: React.DragEvent<HTMLDivElement>) => {
              const target = e.currentTarget as HTMLElement
              target.style.opacity = '1'
              target.style.border = ''
            }}
            onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              const target = e.currentTarget as HTMLElement
              target.style.borderTop = '3px solid #fb923c'
            }}
            onDragLeave={(e: React.DragEvent<HTMLDivElement>) => {
              const target = e.currentTarget as HTMLElement
              target.style.borderTop = ''
            }}
            onDrop={async (e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault()
              const target = e.currentTarget as HTMLElement
              target.style.borderTop = ''
              
              const draggedId = e.dataTransfer.getData('text/html')
              if (draggedId === cat.id) return
              
              const draggedIndex = categories.findIndex(c => c.id === draggedId)
              const targetIndex = index
              
              // Reorder categories array
              const newCategories = [...categories]
              const [removed] = newCategories.splice(draggedIndex, 1)
              newCategories.splice(targetIndex, 0, removed)
              
              // Update sort_order in database
              try {
                await Promise.all(
                  newCategories.map((c, i) => 
                    api('update_category_order', { id: c.id, sort_order: i + 1 })
                  )
                )
                reload()
                showToast('Category order updated')
              } catch (e: any) {
                showToast(e.message, 'error')
              }
            }}
            className="transition-all duration-200"
          >
            <Card>
            {/* Category header */}
            <div
              className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors cursor-pointer"
              onClick={() => handleExpandCat(isOpen ? null : cat.id)}>
              <div className="text-slate-600 hover:text-slate-900 cursor-grab active:cursor-grabbing text-xl font-bold select-none" title="Drag to reorder" draggable={false}>
                ⋮⋮
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-slate-900">{cat.name}</span>
                  <span className="text-slate-400 text-xs">{catItems.length} item{catItems.length !== 1 ? 's' : ''}</span>
                  {cat.prep_secs > 0 && (
                    <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {cat.prep_secs < 60 ? `${cat.prep_secs}s prep` : `${Math.round(cat.prep_secs / 60)}m prep`}
                    </span>
                  )}
                  {cat.batch_size > 0 && cat.batch_size < 999 && (
                    <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{cat.batch_size} at a time</span>
                  )}
                  {cat.default_stock != null && (
                    <span className="text-[11px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{cat.default_stock} per event</span>
                  )}
                  {cat.allow_notes && <span className="text-[11px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Notes on</span>}
                  {/* "Counts toward kitchen capacity" is configured in Settings → Kitchen capacity
                      (the tickbox list under the ceiling), not here — one place, no double-toggle.
                      A tiny read-only indicator for instant categories that are included: */}
                  {cat.prep_secs === 0 && cat.counts_toward_capacity && (
                    <span title="Counts toward the kitchen-capacity limit (set in Settings → Kitchen capacity)"
                      className="text-[11px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Counts toward capacity</span>
                  )}
                </div>
              </div>
              <div className="flex items-center shrink-0">
                <span className={`transition-transform inline-block text-slate-400 text-xs select-none ${isOpen ? 'rotate-90' : ''}`}>▶</span>
              </div>
            </div>

            {/* Inline category settings — visible when expanded and editingCat loaded */}
            {isOpen && editingCat?.id === cat.id && (
              <div className="border-t border-orange-100 bg-orange-50/40 px-4 py-3 space-y-2">
                {/* Row 1: Name + Allow notes toggle */}
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={editingCat.name || ''}
                    onChange={e => setEditingCat(p => ({...p!, name: e.target.value}))}
                    onBlur={() => saveCat()}
                    placeholder="Category name"
                    className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                  />
                  <div className="shrink-0">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Allow customer notes</span>
                      <Toggle
                        on={!!(editingCat as any).allow_notes}
                        onToggle={() => {
                          const newVal = !(editingCat as any).allow_notes
                          setEditingCat(p => ({...p!, allow_notes: newVal} as any))
                          saveCat({ allow_notes: newVal } as any)
                        }}
                      />
                    </label>
                    <p className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">Truck can always note; this is for customers</p>
                  </div>
                </div>
                {/* Row 2: Prep time + Batch size + Default stock */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Prep time</label>
                    {/* Shared prep dropdown (V7.8 §42) — same control as the dashboard. prep_secs in
                        SECONDS via saveCat({prep_secs}) (same upsert_category write); off-grid values
                        preserved (no snap). */}
                    <PrepTimeSelect
                      valueSecs={editingCat.prep_secs}
                      ariaLabel="Prep time"
                      onChange={secs => { setEditingCat(p => ({...p!, prep_secs: secs})); saveCat({ prep_secs: secs }) }}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                    <p className="text-xs text-slate-400 mt-1">Set to Instant for items like drinks or dips. These won&apos;t count toward kitchen capacity.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Batch size</label>
                    {/* Shared <BatchSizeSelect> dropdown (∞ + 1-20) — change-saves via saveCat (same path
                        as Prep), 0 = ∞ preserved (val ?? 0). Persistence unchanged vs the old free input. */}
                    <BatchSizeSelect
                      valueSize={editingCat.batch_size}
                      onChange={val => { setEditingCat(p => ({...p!, batch_size: val ?? 0})); saveCat({ batch_size: val ?? 0 }) }}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Default stock/event</label>
                    <input type="number" min="0" placeholder="e.g. 100"
                      value={(editingCat as any).default_stock ?? ''}
                      onChange={e => setEditingCat(p => ({...p!, default_stock: e.target.value === '' ? null : parseInt(e.target.value)} as any))}
                      onBlur={() => saveCat()}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                    <p className="text-[10px] text-slate-400 mt-0.5">Category-wide limit</p>
                  </div>
                </div>

                {/* Sub-categories — display-only headings within this category. Managed in a modal
                    (create/delete/rename/reorder are immediate); grouping is handled elsewhere. */}
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <button type="button"
                    onClick={() => { setNewSubcatName(''); setEditingSubcatId(null); setSubcatModalCat(cat.id) }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                    Manage sub-categories ({subcatsFor(cat.id).length})
                  </button>
                </div>
              </div>
            )}

            {/* Items */}
            {isOpen && (
              <div className="border-t border-slate-100">
                {/* Group the editor's item list by sub-category — ALL active sub-cats show as headings
                    here INCLUDING EMPTY ones; ungrouped items (subcategory_id null) render first with no
                    heading. Display-only (Phase 3); "+ Add item" stays category-level below. */}
                {groupBySubcategory(catItems, subcatsFor(cat.id)).map(group => (
                <div key={group.id ?? '__ungrouped'}>
                  {group.name && <p className="text-xs font-black text-orange-500 uppercase tracking-wider px-4 pt-2.5 pb-1">{group.name}{group.items.length === 0 ? ' · empty' : ''}</p>}
                  {group.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                    {/* Item image */}
                    <label className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity block" title="Click to upload photo">
                      {item.image_path
                        ? <img src={imgUrl(item.image_path)!} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-slate-300 text-lg">📷</div>
                      }
                      <input type="file" accept="image/*" className="sr-only" onChange={async e => {
                        const file = e.target.files?.[0]; if(!file) return
                        try {
                          const { upload_url, path } = await api('get_upload_url', { filename: file.name, content_type: file.type })
                          await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
                          await api('upsert_item', { id: item.id, image_path: path })
                          reload()
                          showToast('Photo updated')
                        } catch(err: any) { showToast(err.message, 'error') }
                      }} />
                    </label>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <p className="font-bold text-slate-900 text-sm truncate">{item.name}</p>
                        <span className="font-black text-orange-600 text-sm shrink-0">£{Number(item.price).toFixed(2)}</span>
                      </div>
                      {/* REQUIRED choices line (§54 rework) — its OWN row after the price (full-width on
                          mobile), OUTSIDE the tag row below. Lists each REQUIRED group's option names; a
                          surcharge shows only when price_adjustment > 0 ("Prawns (+£1.50)"), plain otherwise.
                          Multiple required groups join with " · ". Optional groups are NOT here — they render
                          as sky badges in the tag row. */}
                      {(() => {
                        const req = requiredGroupsFor(item.id)
                        if (req.length === 0) return null
                        const parts = req
                          .map(g => optionsForItemGroup(item.id, g)
                            .map(o => o.name + (o.price_adjustment > 0 ? ` (+£${o.price_adjustment.toFixed(2)})` : ''))
                            .join(', '))
                          .filter(s => s.length > 0)
                        return parts.length ? <p className="text-[11px] text-teal-700 mt-0.5">{parts.join(' · ')}</p> : null
                      })()}
                      {item.description && <p className="text-slate-400 text-xs truncate">{item.description}</p>}
                      {/* Allergen + dietary chips ONLY show on VERIFIED items — an unverified item shows
                          NO allergen/dietary chips (showing detected-but-unconfirmed chips would imply
                          they're set when they're not). The "N dishes need review" count lives once, in
                          the highlighted allergen box — NOT repeated per item. */}
                      {((item.allergens_verified !== false && ((item.dietary_info?.length ?? 0) > 0 || (item.allergens?.length ?? 0) > 0)) || item.default_stock != null || item.stock_count != null || item.spiciness != null || item.auto_accept === false || item.preorder_enabled === true || optionalGroupsFor(item.id).length > 0) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          <SpiceLevel value={item.spiciness} />
                          {/* Operator-only routing flag. Shown ALWAYS when set (so the operator sees it
                              persists), but dimmed when the truck's auto-accept is off (= set, not active
                              right now). NEVER rendered on the customer order page. */}
                          {item.auto_accept === false && (
                            <span className={`text-[10px] px-1.5 py-0.5 bg-rose-50 text-rose-700 rounded-md border border-rose-100 ${truck.auto_accept ? '' : 'opacity-50'}`}>Manual review</span>
                          )}
                          {item.allergens_verified !== false && item.dietary_info?.map(d => (
                            <span key={d} className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded-md border border-green-100">{d}</span>
                          ))}
                          {item.allergens_verified !== false && item.allergens?.map(a => (
                            <span key={a} className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-md border border-amber-100">{a}</span>
                          ))}
                          {item.default_stock != null && <Badge label={`${item.default_stock} per event`} colour="slate" />}
                          {item.stock_count != null && <Badge label={`Stock: ${item.stock_count}`} colour="orange" />}
                          {/* Pre-order inclusion flag (operator-only). Mirrors the "Manual review" dim
                              pattern: shown when set, dimmed when the truck's master pre-orders toggle is
                              OFF (included but globally inactive). Slate (NOT green — avoids the dietary clash). */}
                          {item.preorder_enabled === true && (
                            <span className={`text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded-md border border-slate-200 ${truck.preorders_enabled !== false ? '' : 'opacity-50'}`}>Pre-order</span>
                          )}
                          {/* OPTIONAL option groups (§54 rework) — sky badge showing the group title (e.g.
                              "Pizza Extras"), one per optional group. Required groups instead list their
                              options on the teal line after the price. Sky to stay clear of teal (required),
                              green (dietary), amber (allergen), and the slate pre-order pill. */}
                          {optionalGroupsFor(item.id).map(g => (
                            <span key={g.id} className="text-[10px] px-1.5 py-0.5 bg-sky-50 text-sky-700 rounded-md border border-sky-100">{g.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium hidden sm:inline ${item.is_available ? 'text-green-600' : 'text-slate-400'}`}>
                          {item.is_available ? 'Available' : 'Hidden'}
                        </span>
                        <Toggle on={item.is_available} onToggle={() => toggleItem(item)} />
                      </div>
                      <button onClick={() => setEditingItem(item)} className="text-slate-400 hover:text-orange-600 text-xs font-bold p-1.5 rounded-lg hover:bg-orange-50 transition-colors">✏️</button>
                      <button onClick={() => setDeletingItem(item)} className="text-slate-300 hover:text-red-500 text-xs p-1.5 rounded-lg hover:bg-red-50 transition-colors">🗑️</button>
                    </div>
                  </div>
                  ))}
                </div>
                ))}

                <div className="px-4 py-3">
                  <Btn label="+ Add item" size="sm" colour="ghost" onClick={() => setEditingItem({ category_id: cat.id, is_available: true, price: 0 })} />
                </div>
                <div className="px-4 pb-4">
                  <button
                    onClick={() => handleDeleteCategory(cat)}
                    className="mt-4 text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
                  >
                    🗑 Delete category
                  </button>
                </div>
              </div>
            )}
          </Card>
          </div>
        )
      })}

      {/* UNCATEGORIZED fallback bucket (safety net) — items with no category render NOWHERE in the
          category list above (it groups strictly by category_id), yet stay LIVE/orderable on the order
          screens. This trailing bucket makes them visible + editable in management so they're never
          invisible-but-live. Hidden when there are none. Editing one opens the now-category-required
          modal → saving re-homes it. */}
      {(() => {
        const uncategorized = localItems.filter(i => !i.category_id)
        if (uncategorized.length === 0) return null
        return (
          <Card>
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="font-bold text-slate-900">Uncategorized</p>
              <p className="text-xs text-amber-600 mt-0.5">⚠ No category set — pick one (✏️) so each shows in its section. They’re still live on the order screens until then.</p>
            </div>
            {uncategorized.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="font-bold text-slate-900 text-sm truncate">{item.name}</p>
                    <span className="font-black text-orange-600 text-sm shrink-0">£{Number(item.price).toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium hidden sm:inline ${item.is_available ? 'text-green-600' : 'text-slate-400'}`}>{item.is_available ? 'Available' : 'Hidden'}</span>
                    <Toggle on={item.is_available} onToggle={() => toggleItem(item)} />
                  </div>
                  <button onClick={() => setEditingItem(item)} className="text-slate-400 hover:text-orange-600 text-xs font-bold p-1.5 rounded-lg hover:bg-orange-50 transition-colors">✏️</button>
                  <button onClick={() => setDeletingItem(item)} className="text-slate-300 hover:text-red-500 text-xs p-1.5 rounded-lg hover:bg-red-50 transition-colors">🗑️</button>
                </div>
              </div>
            ))}
          </Card>
        )
      })()}

      {/* Add Category Modal — new categories only, existing use inline accordion above */}
      {editingCat && !editingCat.id && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => {}}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 mb-4">New category</h3>
            <div className="space-y-3">
              <Input label="Category name" required value={editingCat.name || ''} onChange={v => setEditingCat(p => ({...p!, name: v}))} placeholder="e.g. Pizza" />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Prep time</label>
                  <PrepTimeSelect
                    valueSecs={editingCat.prep_secs}
                    ariaLabel="Prep time"
                    onChange={secs => setEditingCat(p => ({...p!, prep_secs: secs}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  <p className="text-xs text-slate-400 mt-1">Set to Instant for items like drinks or dips. These won&apos;t count toward kitchen capacity.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Batch size</label>
                  {/* Shared <BatchSizeSelect> dropdown — updates the draft only (like Prep here); the
                      modal's Save button persists. 0 = ∞ preserved (val ?? 0). */}
                  <BatchSizeSelect
                    valueSize={editingCat.batch_size}
                    onChange={val => setEditingCat(p => ({...p!, batch_size: val ?? 0}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Default stock/event</label>
                  <input type="number" min="0" placeholder="e.g. 100"
                    value={(editingCat as any).default_stock ?? ''}
                    onChange={e => setEditingCat(p => ({...p!, default_stock: e.target.value === '' ? null : parseInt(e.target.value)} as any))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
              {/* TODO: ask operator if allow_notes during onboarding menu setup — see session notes May 2026 */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-slate-700">Allow customer notes per item</p>
                  <p className="text-xs text-slate-400">Lets customers add a note to each item (e.g. "no onion"). The truck can always add item notes regardless. All orders also have an order-level notes field.</p>
                </div>
                <Toggle on={!!(editingCat as any).allow_notes} onToggle={() => setEditingCat(p => ({...p!, allow_notes: !(p as any).allow_notes} as any))} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn label="Cancel" colour="slate" onClick={() => setEditingCat(null)} />
              <Btn label={saving ? 'Saving...' : 'Save'} loading={saving} onClick={saveCat} />
            </div>
          </div>
        </div>
      )}

      {/* Allergen wizard — opened from the "allergens not set" banners. Mode-1 per-row confirm goes
          through the shared upsert_item path (never auto/batch); Mode-2/3 FOLD IN the card flow below
          (the upload/review/processing modals are shared — the wizard's mode-2 opens them via
          setShowAllergenModal). The chosen display mode is persisted to trucks.allergen_display_mode. */}
      {allergenWizardOpen && (
        <AllergenWizardModal
          items={localItems}
          categories={categories}
          initialMode={wizardInitialMode}
          onClose={() => { setWizardInitialMode(0); onCloseAllergenWizard() }}
          canEdit={canEditAllergens}
          onConfirmRow={(item, allergens, dietary) => writeItemAllergens(item, allergens, dietary, true)}
          onUndoRow={(item, allergens, dietary, verified) => writeItemAllergens(item, allergens, dietary, verified)}
          onEditUnverify={(item) => writeItemAllergens(item, item.allergens || [], item.dietary_info || [], false)}
          showToast={showToast}
          cardText={allergenInfoText}
          cardUrl={allergenUrl}
          cardProcessing={allergenStep === 'processing'}
          onAddCard={() => setShowAllergenModal(true)}
          onSetDisplayMode={async (m) => { await api('update_settings', { allergen_display_mode: m }) }}
          onProcessCard={async (file, text) => {
            const fd = new FormData(); fd.append('token', token); if (file) fd.append('file', file); else fd.append('text', text)
            const res = await fetch('/api/manage/process-allergens', { method: 'POST', body: fd })
            const data = await res.json()
            return data.ok ? (data.allergens as CardParse) : null
          }}
          onCardMerge={(item, union) => writeItemAllergens(item, union, item.dietary_info || [], false, 'card')}
          onSaveCard={async (t) => { await api('update_settings', { allergen_info_text: t }); setAllergenInfoText(t) }}
          onTranscribeCard={async (file) => {
            const fd = new FormData(); fd.append('token', token); fd.append('mode', 'transcribe'); fd.append('file', file)
            const res = await fetch('/api/manage/process-allergens', { method: 'POST', body: fd })
            const data = await res.json()
            return data.ok ? (data.text as string) : null
          }}
        />
      )}

      {/* ── ALLERGEN SECTION (Slice C) — a permanent settings home on the Menu tab, reachable any time
             (not just via the "allergens not set" warning). Shows status + display mode, opens the wizard,
             and surfaces the saved card. EDIT affordances are owner/admin-only (canEditAllergens); all
             roles can VIEW. The card flow itself is folded into the wizard (one card UI); the shared
             upload/processing/review modals below are still rendered here because the wizard drives them. */}
      {/* "Allergens" SECTION heading — its own section on the Menu tab, mirroring the Menu's heading. */}
      <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mt-10 mb-2">Allergens</h2>
      {(() => {
        const unverifiedCount = localItems.filter(i => (i as any).allergens_verified === false).length
        // Empty menu: "0 unconfirmed" is vacuously true but "all dishes confirmed" reads as a false "done".
        // Show neutral build-menu copy instead — and don't nag (needsReview stays false until a dish exists).
        const noMenu = localItems.length === 0
        // Display mode collapsed to 2 (per-dish / card): 'both' + NULL legacy read as per-dish.
        const mode = (truck as any).allergen_display_mode as 'per_dish' | 'card' | 'both' | null
        const modeLabel = mode === 'card' ? 'Allergen card' : mode === 'per_dish' || mode === 'both' ? 'Per dish' : 'Not set'
        // CARD mode: the card IS the allergen info → the per-dish unverified count is irrelevant and must
        // NOT drive "N dishes need review" (mirrors the customer per-dish gate, menu route :438). Card mode
        // is "set up" once a card is saved; card mode WITHOUT a card prompts to ADD one (not "review dishes").
        const cardMode = mode === 'card'
        const hasCard = !!(allergenInfoText || allergenUrl)
        const cardNeedsCard = cardMode && !noMenu && !hasCard
        // Per-dish "needs review" fires ONLY in per-dish mode. `warn` drives the amber warning treatment.
        const needsReview = !cardMode && unverifiedCount > 0
        const warn = needsReview || cardNeedsCard
        return (
          // (#5) The BOX itself is the Menu-tab warning surface — amber warning treatment while any dish
          // needs review (replaces the removed top banner); calm slate once all confirmed.
          <div className={`rounded-2xl p-5 border-2 ${warn ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{warn ? '⚠️' : '🛡️'}</span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{warn ? 'Allergens not set' : 'Allergens'}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {noMenu
                      ? <span className="text-slate-500 font-semibold">Build your menu first — add dishes, then set up their allergens</span>
                      : <>
                          Display mode: <strong>{modeLabel}</strong>
                          {' · '}
                          {cardMode
                            ? (hasCard
                                ? <span className="text-green-600 font-semibold">allergen card saved</span>
                                : <span className="text-amber-700 font-semibold">add an allergen card so customers can see allergen info</span>)
                            : (needsReview
                                ? <span className="text-amber-700 font-semibold">{unverifiedCount} dish{unverifiedCount !== 1 ? 'es' : ''} need review — customers can&apos;t see allergen info until confirmed</span>
                                : <span className="text-green-600 font-semibold">all dishes confirmed</span>)}
                          {!cardMode && allergenInfoText ? ' · allergen card saved' : ''}
                        </>}
                  </p>
                </div>
              </div>
              {canEditAllergens
                ? <Btn label="Set up / review allergens" colour="orange" size="sm" icon="🛡️" disabled={noMenu} onClick={() => {
                    // T3: land on the per-dish TABLE when a display mode is already chosen — mode 1 is
                    // the confirmation table, mode 0 the card-vs-per-dish chooser. Re-asking a question
                    // the operator has answered is what made this feel like starting over. 'card' and
                    // null still land on the chooser, correctly: a card-mode truck has no per-dish table
                    // to review, and a null-mode truck genuinely has not chosen yet.
                    setWizardInitialMode(mode === 'per_dish' || mode === 'both' ? 1 : 0)
                    onOpenAllergenWizard()
                  }} />
                : <span className="text-[11px] text-slate-400 self-center">View only — only the owner can edit allergens</span>}
            </div>
            {/* Saved card preview (view always; replace is owner/admin via the wizard).
                ⚠️ THE GATE MOVED INTO THE COMPONENT, and that is the fix for the url-only truck: this
                read `{allergenInfoText && (…)}`, so a truck with a card FILE and no summary text showed
                the green "allergen card saved" line above and then nothing. SavedAllergenCard renders
                whichever of the two exists and returns null when neither does, so the panel and the
                indicator can no longer disagree. */}
            <SavedAllergenCard
              text={allergenInfoText}
              url={allergenUrl}
              clampClass="line-clamp-3"
              className="mt-3"
            />
          </div>
        )
      })()}

      {allergenStep === 'processing' && (
        <div className="border border-slate-200 rounded-2xl p-6 flex items-center gap-3 mt-8">
          <div className="w-5 h-5 border-2 border-orange-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-sm text-slate-500">Reading allergen information...</p>
        </div>
      )}

      {allergenStep === 'review' && allergenExtracted && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 flex flex-col gap-3 max-h-[90vh] overflow-y-auto">
            <p className="text-sm font-semibold text-slate-900">Extracted allergen information</p>

            {allergenExtracted.summary && (
              <p className="text-sm text-slate-600">{allergenExtracted.summary}</p>
            )}

            {allergenExtracted.contains?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Contains</p>
                <div className="flex flex-wrap gap-1">
                  {allergenExtracted.contains.map((a: string) => (
                    <span key={a} className="text-xs px-2 py-1 bg-red-50 border border-red-200 text-red-700 rounded-lg">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {allergenExtracted.may_contain?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">May contain</p>
                <div className="flex flex-wrap gap-1">
                  {allergenExtracted.may_contain.map((a: string) => (
                    <span key={a} className="text-xs px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {allergenExtracted.free_from?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Free from</p>
                <div className="flex flex-wrap gap-1">
                  {allergenExtracted.free_from.map((a: string) => (
                    <span key={a} className="text-xs px-2 py-1 bg-green-50 border border-green-200 text-green-700 rounded-lg">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {allergenExtracted.dietary_options?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Dietary options</p>
                <div className="flex flex-wrap gap-1">
                  {allergenExtracted.dietary_options.map((d: string) => (
                    <span key={d} className="text-xs px-2 py-1 bg-green-50 border border-green-200 text-green-700 rounded-lg">{d}</span>
                  ))}
                </div>
              </div>
            )}

            {allergenExtracted.additional_notes && (
              <p className="text-xs text-slate-500 italic">{allergenExtracted.additional_notes}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setAllergenStep('idle'); setAllergenExtracted(null); setShowAllergenModal(true) }}
                className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm hover:bg-slate-50">
                Try again
              </button>
              <button onClick={handleSaveAllergens}
                className="flex-1 bg-orange-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-orange-700">
                Save allergen info
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Allergen modal */}
      {showAllergenModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {allergenInfoText ? 'Update allergen info' : 'Add allergen info'}
              </h3>
              <button onClick={() => { setShowAllergenModal(false); setAllergenText('') }}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            <p className="text-sm text-slate-500">
              Upload your allergen card or paste your allergen information. Our AI will extract and structure it clearly for customers.
            </p>
            <label
              {...allergenDragProps}
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${isAllergenDragging ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50/30'}`}
            >
              <span className="text-3xl">{isAllergenDragging ? '📂' : '📋'}</span>
              <span className="text-sm text-slate-500 text-center">
                {isAllergenDragging ? 'Drop your allergen card here' : 'Drag and drop or tap to upload'}
              </span>
              <span className="text-xs text-slate-400">Image or PDF</span>
              <input type="file" accept="image/*,.pdf" className="sr-only"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setShowAllergenModal(false); handleAllergenUploadAndProcess(f) } }} />
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-xs text-slate-400">or type / paste</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>
            <textarea
              value={allergenText}
              onChange={e => setAllergenText(e.target.value)}
              placeholder="Paste your allergen information here..."
              rows={4}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowAllergenModal(false); setAllergenText('') }}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={() => { setShowAllergenModal(false); handleAllergenTextProcess(allergenText) }}
                disabled={!allergenText.trim()}
                className="flex-1 bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-orange-700">
                Extract with AI
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete item confirmation modal */}
      {deletingItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setDeletingItem(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 shadow-2xl">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Remove {deletingItem.name}?</h3>
              <p className="text-sm text-slate-500 mt-2">
                This item will be hidden from your menu immediately. It won't appear on the customer order page or in the Add Order panel.
              </p>
              <p className="text-xs text-slate-400 mt-2">
                Historical orders containing this item are preserved.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeletingItem(null)}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50">
                Keep item
              </button>
              <button onClick={confirmDeleteItem}
                className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-xl text-sm hover:bg-red-700">
                Remove item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage sub-categories modal — create/delete/rename/reorder are all immediate (no save step).
          Reads from localSubcats via subcatsFor(), so it re-renders live as the handlers update state. */}
      {subcatModalCat && (() => {
        const modalCat = categories.find(c => c.id === subcatModalCat)
        const modalSubcats = subcatsFor(subcatModalCat)
        return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setSubcatModalCat(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-slate-900 mb-4">Sub-categories — {modalCat?.name}</h3>
            <div className="space-y-1.5">
              {modalSubcats.map((sc, i, arr) => {
                const itemCount = localItems.filter(it => it.subcategory_id === sc.id).length
                return (
                  <div key={sc.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={i === 0} onClick={() => moveSubcat(subcatModalCat, sc.id, -1)}
                        className="border border-slate-200 rounded px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="Move up">↑</button>
                      <button type="button" disabled={i === arr.length - 1} onClick={() => moveSubcat(subcatModalCat, sc.id, 1)}
                        className="border border-slate-200 rounded px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="Move down">↓</button>
                    </div>
                    {editingSubcatId === sc.id ? (
                      <input autoFocus value={editingSubcatName}
                        onChange={e => setEditingSubcatName(e.target.value)}
                        onBlur={() => renameSubcategory(sc, editingSubcatName)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { renameSubcategory(sc, editingSubcatName) }
                          else if (e.key === 'Escape') { setEditingSubcatId(null) }
                        }}
                        className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                    ) : (
                      <button type="button" onClick={() => { setEditingSubcatId(sc.id); setEditingSubcatName(sc.name) }}
                        className="flex-1 text-left text-sm text-slate-700 truncate hover:text-orange-600" title="Tap to rename">{sc.name}</button>
                    )}
                    <span className="text-[10px] text-slate-400 flex-shrink-0">{itemCount === 0 ? 'empty' : `${itemCount} item${itemCount === 1 ? '' : 's'}`}</span>
                    <button type="button" onClick={() => deleteSubcategory(sc)} className="text-slate-400 hover:text-red-500 text-sm flex-shrink-0" title="Delete sub-category">🗑</button>
                  </div>
                )
              })}
              {modalSubcats.length === 0 && <p className="text-xs text-slate-400">No sub-categories yet</p>}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <input value={newSubcatName} onChange={e => setNewSubcatName(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && newSubcatName.trim()) { await createSubcategory(subcatModalCat, newSubcatName); setNewSubcatName('') }
                }}
                placeholder="Sub-category name"
                className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
              <button type="button" disabled={!newSubcatName.trim()}
                onClick={async () => { await createSubcategory(subcatModalCat, newSubcatName); setNewSubcatName('') }}
                className="flex-shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-orange-600 text-white disabled:opacity-40">+ Add sub-category</button>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn label="Done" colour="slate" onClick={() => setSubcatModalCat(null)} />
            </div>
          </div>
        </div>
        )
      })()}

      {/* Edit Item Modal — ALL AUTO-SAVE in edit mode (no Save/Cancel; just Done). Backdrop closes in
          EDIT mode (everything's saved → safe); in CREATE mode the backdrop is inert (use Cancel/×) so a
          half-filled new item isn't discarded by a stray click. X always closes. */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { if (editingItem.id) setEditingItem(null) }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-black text-slate-900">{editingItem.id ? 'Edit item' : 'New item'}</h3>
              <button onClick={() => setEditingItem(null)} aria-label="Close" className="text-slate-400 hover:text-slate-600 text-2xl leading-none -mt-1">×</button>
            </div>
            <p className="text-xs text-slate-400 mb-4">{editingItem.id ? 'Changes save automatically.' : 'Fill in the details, then add the item.'}</p>
            <div className="space-y-3">
              <Input label="Item name" required value={editingItem.name || ''}
                onChange={v => setEditingItem(p => ({...p!, name: v}))}
                onBlur={() => { if (editingItem.name?.trim()) saveItemPatch({ name: editingItem.name.trim() }) }}
                error={editingItem.id && !editingItem.name?.trim() ? 'Name is required' : ''}
                placeholder="e.g. Margherita" />
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Ingredients <span className="text-slate-400 font-normal">(optional)</span></label>
                <input value={editingItem.description || ''} onChange={e => setEditingItem(p => ({...p!, description: e.target.value}))}
                  onBlur={() => saveItemPatch({ description: editingItem.description ?? null })}
                  placeholder="e.g. Tomato, Mozzarella, Basil"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                <p className="text-slate-400 text-xs mt-0.5">Shown to customers on the order page</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Category <span className="text-red-500">*</span></label>
                <select value={editingItem.category_id || ''} onChange={e => {
                    const newCat = e.target.value || null
                    // On-change save (a select is a discrete choice). Clear the sub-category if it no
                    // longer belongs to the new category.
                    const stillValid = editingItem.subcategory_id && subcatsFor(newCat).some(s => s.id === editingItem.subcategory_id)
                    saveItemPatch({ category_id: newCat, subcategory_id: stillValid ? editingItem.subcategory_id : null })
                  }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                  {/* REQUIRED (no "No category"): a DISABLED placeholder shows when category_id is null
                      (e.g. a pre-existing stranded item) so it can't be left unset and doesn't masquerade
                      as the first real category. Column stays NULLABLE; the UI + Menu-tab fallback cover it. */}
                  <option value="" disabled>Select a category…</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Sub-category (optional, display-only) — a managed label that groups this item under a
                  heading within its category on the order screens. Dropdown of the selected category's
                  sub-categories. null = ungrouped. Phase 3 does the actual grouping. */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Sub-category <span className="text-slate-400 font-normal">(optional)</span></label>
                <select
                  value={editingItem.subcategory_id || ''}
                  onChange={e => saveItemPatch({ subcategory_id: e.target.value || null })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                  <option value="">— None —</option>
                  {subcatsFor(editingItem.category_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1">Groups this item under a heading within its category on the order screens — e.g. Meat Lovers, Veggie. Leave blank for none.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Price" required type="number" value={editingItem.price || ''}
                  onChange={v => setEditingItem(p => ({...p!, price: parseFloat(v) || 0}))}
                  onBlur={() => { if (Number(editingItem.price) > 0) saveItemPatch({ price: Number(editingItem.price) }) }}
                  error={editingItem.id && !(Number(editingItem.price) > 0) ? 'Enter a price' : ''}
                  placeholder="10.00" />
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Default stock per event <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="number" min="0" placeholder="e.g. 100"
                    value={(editingItem as any).default_stock ?? ''}
                    onChange={e => setEditingItem(p => ({...p!, default_stock: e.target.value === '' ? null : parseInt(e.target.value)} as any))}
                    onBlur={() => saveItemPatch({ default_stock: (editingItem as any).default_stock ?? null })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">{DEFAULT_STOCK_SCOPE_NOTE}</p>
                </div>
              </div>

              {/* ── Options offered on this dish (merged §53/3b) — ONE nested list. Each GROUP row is a
                  tick = ASSIGNMENT (toggleGroupForItem → set_item_modifier_group: ticked = group offered
                  on this dish). When ON, its OPTIONS show below as exclusion ticks (toggleItemOption →
                  set_item_group_excluded_options, opt-out: all ticked, untick to hide on this dish);
                  when OFF, options are hidden. Shows ALL the truck's groups (same scope as the old Custom
                  Extras pills) so any can be assigned here. Same RPCs/state as the Extras-tab matrix →
                  surfaces stay in sync. Assignment has no last-tick guard; options keep the required
                  last-tick guard. Instant-save, no reload (§23). Only for a saved dish (needs an id). */}
              {editingItem.id && (() => {
                const itemId = editingItem.id!
                if (modifierGroups.length === 0) {
                  return (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Options offered on this dish</label>
                      <p className="text-xs text-slate-400 mt-0.5">No option groups yet — create them in Extras &amp; Upsells.</p>
                    </div>
                  )
                }
                return (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Options offered on this dish</label>
                    <p className="text-xs text-slate-400 mt-0.5 mb-2">Tick a group to offer it on this dish, then choose which of its options to show.</p>
                    <div className="space-y-2.5">
                      {/* REQUIRED groups first (#3) via the shared sort; the rule label (#4/#5) via the
                          shared groupRuleLabel — same source as the order screens. */}
                      {sortGroupsRequiredFirst(modifierGroups.map(g => ({ ...g, options: [] }))).map(g => {
                        const assigned = itemModGroups.some(x => x.menu_item_id === itemId && x.group_id === g.id)
                        const opts = modifierOptions.filter(o => o.group_id === g.id).sort((a, b) => a.sort_order - b.sort_order)
                        const required = minRequiredForGroup(g as any) > 0
                        const excluded = new Set(excludedFor(itemId, g.id))
                        const includedCount = opts.filter(o => !excluded.has(o.id)).length
                        return (
                          <div key={g.id} className="rounded-xl border border-slate-100">
                            {/* Group tick = ASSIGNMENT */}
                            <button type="button" onClick={() => toggleGroupForItem(itemId, g.id, assigned)}
                              className="w-full flex items-center flex-wrap gap-x-2 gap-y-0.5 px-3 py-2 text-left active:scale-[0.99] transition-transform">
                              <span className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${assigned ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-slate-300 text-transparent'}`}>{assigned ? '✓' : ''}</span>
                              <span className="text-sm font-bold text-slate-800">{g.name}</span>
                              {/* Operator-facing rule label (audience='operator') — normal case (not uppercase)
                                  so the longer "Customer can choose up to N" reads naturally; row wraps if tight. */}
                              <span className="text-[10px] font-bold text-slate-400">{groupRuleLabel(g as any, 'operator')}</span>
                            </button>
                            {/* Options — only when the group is assigned to this dish. Left-packed (#2);
                                selected pill is soft green (#1), not solid heavy green. */}
                            {assigned && opts.length > 0 && (
                              <div className="px-3 pb-2.5 flex flex-wrap justify-start gap-2">
                                {opts.map(o => {
                                  const on = !excluded.has(o.id)
                                  const locked = required && on && includedCount <= 1
                                  return (
                                    <button key={o.id} type="button" disabled={locked}
                                      title={locked ? 'A required group needs at least one option for each dish' : (on ? 'Offered — tap to hide on this dish' : 'Hidden — tap to offer on this dish')}
                                      onClick={() => toggleItemOption(itemId, g.id, o.id, on)}
                                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${on ? 'bg-green-50 text-green-700 border-green-300' : 'bg-white text-slate-600 border-slate-200 hover:border-green-400'} ${locked ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}>
                                      {on ? '✓ ' : ''}{o.name}{o.price_adjustment > 0 ? ` +£${o.price_adjustment.toFixed(2)}` : ''}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* Spiciness — optional, display-only heat rating. None = null (renders nothing on the
                  order page). 1-3 → that many chilis. Best-effort prefilled by the AI import; editable here. */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Spiciness</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {([null, 1, 2, 3] as (number | null)[]).map(level => {
                    const active = ((editingItem as any).spiciness ?? null) === level
                    return (
                      <button key={String(level)} type="button"
                        onClick={() => saveItemPatch({ spiciness: level })}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${active ? 'bg-red-50 border-red-300 text-red-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                        {level === null ? 'None' : '🌶️'.repeat(level)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Allergens + Dietary — gated behind the wizard until the dish is SET UP. An UNSET item
                  (allergens_verified === false, e.g. imported + not yet reviewed) hides the pickers and
                  funnels to the allergen review (the wizard is the SETUP path — block-until-precise +
                  row-by-row confirm). A SET item (verified !== false) shows the editable toggles; editing
                  them flips the item back to needs-review (verified=false) until re-confirmed. Spiciness
                  and every other field stay editable regardless. */}
              {(editingItem as any).allergens_verified === false ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-800">Set up allergens for this dish in the allergen review.</p>
                  <p className="text-xs text-amber-700 mt-0.5">Open the “Set up / review allergens” box on the Menu tab — the wizard walks each dish through confirmation.</p>
                </div>
              ) : (
                <>
                  {/* Allergens */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Allergens</label>
                    <p className="text-xs text-slate-400 mt-0.5 mb-2">Select all that apply</p>
                    <AllergenToggles
                      value={(editingItem as any).allergens || []}
                      onChange={next => saveItemPatch({ allergens: next, allergens_verified: true })}
                    />
                  </div>

                  {/* Dietary */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dietary</label>
                    <div className="mt-2">
                      <DietaryToggles
                        value={(editingItem as any).dietary_info || []}
                        onChange={next => saveItemPatch({ dietary_info: next })}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Photo */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">Photo <span className="text-slate-400 font-normal">(optional)</span></label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden flex-shrink-0 bg-slate-50 flex items-center justify-center">
                    {editingItem.image_path
                      ? <img src={imgUrl(editingItem.image_path)!} alt={editingItem.name || ''} className="w-full h-full object-cover" />
                      : <span className="text-2xl">🍽️</span>
                    }
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                      {uploadingItemPhoto ? 'Uploading…' : editingItem.image_path ? 'Change photo' : 'Add photo'}
                      <input type="file" accept="image/*" className="sr-only" onChange={e => e.target.files?.[0] && uploadItemPhoto(e.target.files[0])} />
                    </label>
                    {editingItem.image_path && (
                      <button onClick={() => saveItemPatch({ image_path: null })} className="text-xs text-red-500 hover:text-red-700 text-left">
                        Remove photo
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1">Square photos work best. JPG or PNG.</p>
              </div>

              {/* Auto-accept (per item) — UI control removed; menu_items.auto_accept column + the submit
                  pipeline read (orders/submit) are intentionally retained. editingItem still carries the
                  stored auto_accept value, so Save (upsert_item) preserves it untouched. Re-add the toggle
                  here to restore editing. */}

              {/* ── PRE-ORDERS include toggle (V7.8 global-config) — per-item stores ONLY preorder_enabled
                  (inclusion). The deadline timing/action is the ONE global rule set in Settings → Pre-orders
                  (trucks.preorder_*), so there are NO per-item timing controls here (single-source). Saved
                  via the footer Save → upsert_item (preorder_enabled only). Plan-gated. */}
              {preorderCan && (() => {
                const pe = (editingItem as any).preorder_enabled === true
                return (
                  <div className="border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pre-order item</label>
                        <p className="text-xs text-slate-400 mt-0.5">Include this item in pre-orders. Timing &amp; rule are set globally in Settings → Pre-orders.</p>
                      </div>
                      <button type="button" aria-pressed={pe}
                        onClick={() => saveItemPatch({ preorder_enabled: !pe })}
                        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${pe ? 'bg-green-500' : 'bg-slate-300'}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${pe ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="flex gap-2 mt-4 items-center">
              {editingItem.id ? (
                /* EDIT mode: everything auto-saves → just Done (close). The "✓ Saved" cue flashes on
                   each field save; the header's "Changes save automatically" is the standing reassurance. */
                <>
                  <span className={`text-xs font-medium text-green-600 mr-auto transition-opacity duration-300 ${savedShown ? 'opacity-100' : 'opacity-0'}`}>✓ Saved</span>
                  <Btn label="Done" onClick={() => setEditingItem(null)} />
                </>
              ) : (
                /* CREATE mode: one explicit "Add item" step (needs name+price+category) — then the modal
                   switches to EDIT mode and auto-save takes over. Cancel discards the un-created item. */
                <>
                  <Btn label="Cancel" colour="slate" onClick={() => setEditingItem(null)} />
                  <Btn label={saving ? 'Adding…' : 'Add item'} loading={saving} disabled={!editingItem.name?.trim() || !(Number(editingItem.price) > 0) || !editingItem.category_id} onClick={saveItem} />
                </>
              )}
            </div>
          </div>
        </div>
      )}


      {/* ── H1: THE WELCOME SCREEN — first open on Manage after signup ────────────────────────────
          ONE PIECE OF MARKUP FOR BOTH ROUTES. It renders as an overlay ABOVE whichever first screen the
          slice-C bootstrap already chose (offer for the extraction route, upload for the template
          route) rather than as a step of its own, and that is deliberate on three counts:
            • "Let's go" does NOT decide where to go — it only stops covering the screen slice C
              already picked. That decision stays exactly where C1/C2 put it, untouched.
            • It needs NO new ImportStep and NO second flag: `showSetupIntro` is the same flag that
              gated the green line it replaces, set once by the bootstrap and cleared by every control
              that advances or exits.
            • Because only the bootstrap sets that flag, a RE-ENTRY from the Menu tab's "✨ Import
              menu" never shows this — which is the whole point (H3).
          z-[55] sits above the wizard modals (z-50) and below the discard confirm (z-[60]), so the
          stacking order of everything that already existed is unchanged.
          🔴 NO STEPPER HERE — this screen precedes the flow it would be indicating (H4).
          `inSetup` is belt-and-braces: showSetupIntro is unreachable outside a setup arrival, but the
          gate makes that structural rather than incidental. */}
      {showSetupIntro && inSetup && (importStep === 'offer' || importStep === 'upload') && (
        <div className="fixed inset-0 bg-black/60 z-[55] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-slate-900 text-lg mb-2">Welcome to HatchGrab</h3>
            {/* Fallback: an operator truck's name is required at creation (/api/setup enforces >= 2
                chars), so this cannot normally be empty — "Your truck" keeps the sentence grammatical
                rather than rendering " is set up." if it ever is. */}
            <p className="text-sm text-slate-600 mb-1">
              {truck.name?.trim() || 'Your truck'} is set up. Next we&apos;ll add your menu, then your first event.
            </p>
            <p className="text-sm text-slate-500 mb-5">You can stop and come back whenever.</p>
            <button type="button" onClick={() => setShowSetupIntro(false)}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black py-3 rounded-xl text-sm">
              Let&apos;s go
            </button>
          </div>
        </div>
      )}

      {/* ── C1: THE OFFER STEP — demo→real handover, extraction route only ─────────────────────────
          Reached ONLY from the ?import=demo bootstrap when /api/setup GET returned an extraction. Same
          overlay treatment as every other step (fixed inset-0 bg-black/60 z-50) and the same max-w-md
          card as 'upload', so it reads as the wizard opening rather than a new surface.
          The count is computed with the SAME expression the review step's header uses, so the number
          promised here cannot disagree with the number they then see (nothing is skipped yet, so both
          resolve to the named-item count). */}
      {/* 🔴 T4: `!showSetupIntro` — THE WELCOME AND THIS STEP MUST NOT BOTH MOUNT.
          Slice H rendered the welcome as an overlay ABOVE this step (z-[55] over z-50), deliberately,
          so that "Let's go" only had to stop covering a screen slice C had already chosen. That was a
          stacking answer to a sequencing question, and the result was two overlays alive at once: the
          welcome in front, the wizard visibly behind it. Not fixed by raising a z-index — BOTH BEING
          MOUNTED IS THE BUG. Gating the step on the flag makes them strictly sequential: the welcome
          alone, then "Let's go" clears showSetupIntro, and only then does this render.
          The step STATE is still set by the bootstrap, so slice C's offer-vs-upload decision is
          untouched — it is simply not painted until the welcome is done with. */}
      {importStep === 'offer' && importResult && !showSetupIntro && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            {/* H4: the stepper, gated on inSetup — see the upload step for why. The offer step has no
                position of its own in wizardSteps (it decides what FEEDS step 1), so it shows 'menu'. */}
            {inSetup && <div className="mb-3">{renderWizardStepper('menu')}</div>}
            <h3 className="font-black text-slate-900 mb-1">Use the menu from your demo?</h3>
            <p className="text-slate-400 text-sm mb-5">
              We saved the menu you uploaded — {committedImportItems.length} items.
              Use it as your starting point, or upload a different one.
            </p>
            <div className="flex flex-col gap-2">
              {/* PRIMARY — exactly today's behaviour. The extraction, the vans and demoImportMode were
                  all set by the bootstrap already; this only opens the step they used to open directly,
                  so the resulting state is byte-identical to before slice C. */}
              <button type="button" onClick={() => { setShowSetupIntro(false); setImportStep('review') }}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black py-3 rounded-xl text-sm">
                Use this menu
              </button>
              {/* SECONDARY — a different menu. 🔴 demoImportMode goes FALSE so the eventual commit does
                  NOT clear-first: clearFirst exists to make the demo re-commit repairable, and firing it
                  for a menu that has nothing to do with the demo would wipe rows on an unrelated import. */}
              <button type="button" onClick={() => { setShowSetupIntro(false); setDemoImportMode(false); setImportStep('upload') }}
                className="w-full border border-slate-200 text-slate-600 font-semibold py-3 rounded-xl text-sm hover:bg-slate-50">
                Upload a different menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Import — Upload modal */}
      {/* T4: same gate as the offer step above — see its note. `showSetupIntro` is only ever true
          during a setup arrival, so for every existing operator this reads `!false` and the upload
          step renders exactly as it always has. */}
      {importStep === 'upload' && !showSetupIntro && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            {/* ── H4: THE STEPPER, GATED ON inSetup ──────────────────────────────────────────────────
                🔴 THIS SCREEN IS SHARED WITH EVERY EXISTING OPERATOR. Gusto and RTF open it from the
                Menu tab's "✨ Import menu" every time they re-import, and they have never had a step
                indicator here. Ungated, this would put new chrome on a live operator's screen for no
                reason — the gate is what makes H4 a setup-only change. Same array, same component, no
                second step list. */}
            {inSetup && <div className="mb-3">{renderWizardStepper('menu')}</div>}
            <h3 className="font-black text-slate-900 mb-1">Import your menu</h3>
            <p className="text-slate-400 text-sm mb-5">Upload a photo of your menu board, a screenshot, a PDF, or paste your menu as text. Our AI reads it and builds your digital menu — you review everything before it saves.</p>
            {/* SHARED with the public demo modal — components/menu/MenuUploadFields.tsx. Extracted so
                there is ONE dropzone; two would drift. */}
            <MenuUploadFields
              file={importFile} onFile={setImportFile}
              text={importText} onText={setImportText}
            />
            <div className="flex gap-2 mt-5">
              {/* ── C5: CONFIRM, THEN CLEAR EVERYTHING ────────────────────────────────────────────
                  This used to set 'idle' and clear only importFile + importText, leaving importResult,
                  groupingChoice, categoryPrep, importKitchenCapacity and every per-item _skip / _free /
                  _allergensChecked flag in place — so Cancel followed by a fresh import could carry
                  decisions across from the abandoned one.
                  🔴 _allergensChecked IS THE REASON THIS EXISTS. The commit maps it to
                  `allergens_verified`, which gates whether a dish is visible to customers in per-dish
                  mode. A stale confirmation surviving into a DIFFERENT menu would mark a dish verified
                  that nobody verified — a food-safety claim made by leftover state.
                  resetImportState() is the existing full clear (setImportResult(null) takes the
                  per-item flags with it); calling it is what makes this correct rather than listing a
                  longer subset that would drift the next time a field is added.
                  The confirm fires only when there is review work to lose — a Cancel from a freshly
                  opened upload step is unchanged, with no dialog.
                  ⚠️ SHARED CODE: Gusto and RTF reach this too, and both changes apply to them. That is
                  intended — it is the same bug for them.
                  C4: this is a DELIBERATE exit, so the param goes. */}
              {/* ── H3: "I'LL DO THIS LATER" — LABEL ONLY, AND ONLY IN SETUP ──────────────────────
                  On the sample-menu route this button is the operator's honest exit: they have nothing
                  to import yet and "Cancel" reads as abandoning the account they just made. The
                  BEHAVIOUR is deliberately untouched — same handler, same confirmed-cancel path, same
                  full resetImportState() + stripImportParam(). It closes the wizard back to Manage; it
                  does NOT skip forward to another wizard step, and it writes nothing.
                  The confirm is already conditional on `importResult`, which is null on this route
                  (nothing has been processed), so no dialog appears — exactly as specified.
                  ⚠️ Gusto and RTF are not inSetup, so they keep the string "Cancel" verbatim. */}
              <Btn label={inSetup ? "I'll do this later" : 'Cancel'} colour="slate" onClick={() => {
                if (importResult && !window.confirm('Cancel this import? Your review of this menu will be discarded.')) return
                resetImportState()
                stripImportParam()
              }} />
              <Btn
                label="Process menu"
                disabled={!importFile && !importText.trim()}
                onClick={handleProcessMenu}
              />
            </div>
          </div>
        </div>
      )}

      {/* AI Import — Processing spinner */}
      {importStep === 'processing' && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="font-black text-slate-900 mb-1">Analysing your menu</p>
            <p className="text-slate-400 text-sm">AI is reading and categorising your items…</p>
          </div>
        </div>
      )}

      {/* AI Import — Review screen */}
      {importStep === 'review' && importResult && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col h-[70vh] max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-black text-slate-900">Review imported menu</h3>
                <button type="button" onClick={() => setShowDiscardConfirm(true)} aria-label="Close import"
                  className="text-slate-400 hover:text-slate-600 text-2xl leading-none -mt-1 flex-shrink-0">×</button>
              </div>
              {/* Stepper — adapts to the flow: "Menu · Extras · Kitchen setup" (extras detected) or
                  "Menu · Kitchen setup" (none). Kitchen setup is the 'prep' step, now visible here.
                  Click to jump; progress persists in importResult/categoryPrep. */}
              {renderWizardStepper(reviewStep === 2 ? 'extras' : 'menu')}
            </div>
            {/* Sticky fix: padding is HORIZONTAL only here (px-6). Vertical padding lives on each step's
                inner wrapper (py-6) so it SCROLLS AWAY instead of forming a fixed strip above the scrollport
                — a sticky `top-0` header then pins FLUSH to the scroll area's visual top (no 24px gap, no
                item bleeding above the header). Mirrors the step-2 matrix scroller (zero top padding). */}
            <div ref={wizardScrollRef} className="overflow-y-auto flex-1 px-6 min-h-0">

              {/* ─ STEP 1 — MENU ITEMS (clean): name + price inline-editable, category headers,
                   DETECTED allergens as read-only tags only (no grids, no "NOT CHECKED"). ─ */}
              {reviewStep === 1 && (
                /* NO flex `gap` (gap renders above each block, offsetting the sticky pin); spacing is
                   per-block margin (mb-6). py-6 here gives the vertical breathing room that the scroller
                   no longer adds — and being inside the scroll content it scrolls away, so the sticky
                   header pins flush to the scrollport top. */
                <div className="flex flex-col py-6">
                  <div className="mb-6">
                    {/* H5: reads the shared committable set — same predicate as before, now the same
                        expression the done screen's count uses, so the two cannot disagree. */}
                    <p className="text-slate-600 text-sm">{committedImportItems.length} items ready to add. Uncheck any you don&apos;t want.</p>
                    <p className="text-xs text-slate-500 mt-0.5">Names, prices, extras, allergens and dietary info can all be edited anytime {inSetup ? 'later' : 'in Settings'}.</p>
                  </div>
                  {/* PRICE BANNER — lives INSIDE the scroll content (not sticky) but sits at the top of it,
                      and the count keeps it accurate as rows are resolved. Framed as "we couldn't read
                      these", not "you did something wrong": the AI missed a price, and the fix is one tap. */}
                  {unresolvedPrices.length > 0 && (
                    <div className="mb-6 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
                      <p className="text-sm font-bold text-amber-900">
                        {unresolvedPrices.length} item{unresolvedPrices.length === 1 ? '' : 's'} had no price we could read
                      </p>
                      <p className="text-xs text-amber-800 mt-0.5">
                        Set a price for each, or mark it free — otherwise it would go live at £0. You can&apos;t
                        continue until these are sorted.
                      </p>
                    </div>
                  )}
                  {importResult.categories.map(cat => {
                    const catItems = importResult.items.filter(i => i.category === cat)
                    // I1: an EMPTY category now renders its header instead of vanishing. It has to — a
                    // category the operator has just added has no items yet, and a section you cannot see
                    // is one you cannot move items into. It is also more honest for the pre-existing case:
                    // an item-less extraction category was always COMMITTED (commit-menu iterates the
                    // `categories` array, not the items), it was simply never shown here.
                    const isExisting = importResult.existing_categories.includes(cat)
                    const editingThis = catEdit?.from === cat
                    return (
                      <div key={cat} className="mb-6 last:mb-0">
                        {/* §67 point 5: category header sticks to the top of the scroll area while its section is in view. */}
                        <div className="sticky top-0 z-20 bg-white flex items-center gap-2 mb-2 py-2 border-b border-slate-100">
                          {editingThis ? (
                            <input autoFocus value={catEdit.value} aria-label={`Rename category ${cat}`}
                              onChange={e => { setCatEdit({ from: cat, value: e.target.value }); setCatEditError(null) }}
                              onBlur={commitCatEdit}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); commitCatEdit() }
                                if (e.key === 'Escape') { setCatEdit(null); setCatEditError(null) }
                              }}
                              className="text-base font-bold text-slate-900 tracking-tight bg-transparent border-b border-orange-400 focus:outline-none py-0.5 min-w-0 flex-1" />
                          ) : (
                            <h4 className="text-base font-bold text-slate-900 tracking-tight">{cat}</h4>
                          )}
                          {/* RENAME is blocked for a category that is ALREADY COMMITTED on this truck.
                              commit-menu has no rename path — it matches by slug/name and REUSES — so
                              renaming "Sides" here would create a second category and leave the original,
                              with its already-live items, behind. Renaming those belongs in the menu
                              editor, which can actually update the row. New categories rename freely. */}
                          {/* M3: was `text-slate-300 … text-xs` — a grey pencil at 12px that read as
                              decoration. Now brand-orange at 16px with a hover background, so it reads
                              as a control. Same handler, same behaviour; visibility only. */}
                          {!editingThis && (
                            isExisting ? null : (
                              <button type="button" aria-label={`Rename ${cat}`} title="Rename category"
                                onClick={() => { setCatEdit({ from: cat, value: cat }); setCatEditError(null) }}
                                className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded px-1.5 py-0.5 text-base leading-none flex-shrink-0">✎</button>
                            )
                          )}
                          {/* ── M4: DELETE ──────────────────────────────────────────────────────────
                              🔴 HIDDEN ON THE LAST REMAINING CATEGORY, rather than allowed-and-handled.
                              commitMenu drops any item whose category will not resolve — by a bare
                              `continue` that never reaches `failed[]` — so deleting the only category
                              would discard the entire menu with no error anywhere. There is no target
                              to move the items to, so there is no safe version of the action; not
                              offering it is the honest answer. Title says why.
                              ⚠️ ALSO HIDDEN for an already-committed category: this list is the import
                              PAYLOAD, so removing an "existing" name only stops this import touching
                              it — the committed category and its live items would remain. A control
                              labelled Delete that does not delete is worse than no control. Same
                              reasoning as the rename block above. */}
                          {!editingThis && !isExisting && (
                            importResult.categories.length > 1 ? (
                              <button type="button" aria-label={`Delete ${cat}`} title="Delete category"
                                onClick={() => setCatDeleting({ name: cat, moveTo: '' })}
                                className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded px-1.5 py-0.5 text-base leading-none flex-shrink-0">✕</button>
                            ) : (
                              <span title="Your menu needs at least one category" aria-hidden
                                className="text-slate-200 px-1.5 py-0.5 text-base leading-none flex-shrink-0 cursor-not-allowed">✕</span>
                            )
                          )}
                          <span className="text-xs text-slate-400">{catItems.filter(i => !i._skip).length} of {catItems.length}</span>
                          {isExisting && <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">existing</span>}
                        </div>
                        {editingThis && catEditError && <p className="text-[11px] text-red-600 -mt-1 mb-2">{catEditError}</p>}
                        {/* M4: the reassignment panel — the ONLY place a category dropdown appears now.
                            An EMPTY category never gets here: its delete button below runs immediately. */}
                        {catDeleting?.name === cat && (
                          <div className="mb-3 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3">
                            {catItems.length === 0 ? (
                              <>
                                <p className="text-sm font-bold text-red-900">Delete &ldquo;{cat}&rdquo;?</p>
                                <p className="text-xs text-red-800 mt-0.5">It has no items, so nothing is lost.</p>
                                <div className="flex gap-2 mt-3">
                                  <button type="button" onClick={() => { deleteImportCategory(cat, null); setCatDeleting(null) }}
                                    className="text-xs font-black bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg">Delete</button>
                                  <button type="button" onClick={() => setCatDeleting(null)}
                                    className="text-xs font-bold text-slate-600 px-3 py-1.5 rounded-lg hover:bg-white">Cancel</button>
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-bold text-red-900">
                                  Where should {catItems.length} item{catItems.length === 1 ? '' : 's'} go?
                                </p>
                                <p className="text-xs text-red-800 mt-0.5">
                                  Deleting &ldquo;{cat}&rdquo; needs somewhere to move its dishes — items with no category
                                  are not imported.
                                </p>
                                <div className="flex flex-wrap items-center gap-2 mt-3">
                                  <select value={catDeleting.moveTo}
                                    aria-label={`Move items from ${cat} to`}
                                    onChange={e => setCatDeleting({ name: cat, moveTo: e.target.value })}
                                    className="text-sm bg-white border border-red-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400">
                                    <option value="">Choose a category…</option>
                                    {importResult.categories.filter(c => c !== cat).map(c => (
                                      <option key={c} value={c}>{c}</option>
                                    ))}
                                  </select>
                                  {/* Disabled until a target is chosen — the guard that makes the
                                      "items with no category are dropped" failure unreachable. */}
                                  <button type="button" disabled={!catDeleting.moveTo}
                                    onClick={() => {
                                      // Two functional updaters in ONE handler: React applies them in
                                      // order, so the items are moved before the name is removed and
                                      // no render ever sees an item pointing at a missing category.
                                      // Each function does exactly one thing — the move is the M2
                                      // capability being genuinely reused, not re-implemented here.
                                      reassignImportItem(cat, catDeleting.moveTo)
                                      deleteImportCategory(cat, null)
                                      setCatDeleting(null)
                                    }}
                                    className="text-xs font-black bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg">
                                    Move &amp; delete
                                  </button>
                                  <button type="button" onClick={() => setCatDeleting(null)}
                                    className="text-xs font-bold text-slate-600 px-3 py-1.5 rounded-lg hover:bg-white">Cancel</button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        <div className="flex flex-col divide-y divide-slate-100">
                          {catItems.map(item => {
                            const globalIdx = importResult.items.indexOf(item)
                            // A manually-added row with no name yet is INCOMPLETE — it won't be committed.
                            const incomplete = !!item._manual && !String(item.name || '').trim()
                            return (
                              <div key={globalIdx} className={`flex items-center gap-3 py-2.5 transition-opacity ${item._skip ? 'opacity-40' : ''}`}>
                                <button type="button" onClick={() => patchImportItem(globalIdx, it => ({ ...it, _skip: !it._skip }))}
                                  className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${item._skip ? 'border-slate-300 bg-white' : 'border-orange-500 bg-orange-500'}`}>
                                  {!item._skip && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                </button>
                                <div className="flex-1 min-w-0">
                                  {/* §67 point 1: persistent underline + pencil so the name clearly reads as editable. */}
                                  <div className="flex items-center gap-1">
                                    <input value={item.name} placeholder="Item name" onChange={e => patchImportItem(globalIdx, it => ({ ...it, name: e.target.value }))}
                                      className={`w-full text-sm font-semibold text-slate-900 bg-transparent border-b focus:border-orange-400 focus:outline-none py-0.5 ${incomplete ? 'border-amber-400' : 'border-slate-200 hover:border-slate-400'}`} />
                                    {/* M3: was `text-slate-300 text-xs`. Same element, same job — it is
                                        a hint attached to the always-editable name input beside it, not
                                        a button — but at orange-600/16px it is actually noticeable, and
                                        it now matches the category pencil so the two read as one idea. */}
                                    <span aria-hidden className="text-orange-600 text-base leading-none flex-shrink-0">✎</span>
                                  </div>
                                  {incomplete && <p className="text-[11px] text-amber-600 mt-0.5">Enter a name to add this item — empty rows aren&apos;t imported.</p>}
                                  {item.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{item.description}</p>}
                                  {/* ⚠️ M2: THE PER-ROW CATEGORY DROPDOWN WAS REMOVED FROM HERE.
                                      Slice I put a `<select>` on every row; on a 37-item menu that is 37
                                      dropdowns competing with the names and prices the operator is
                                      actually reviewing. The CAPABILITY is intact — see
                                      reassignImportItem — and is now surfaced only at the one moment it
                                      is needed: deleting a category that still holds items (M4). */}
                                  {/* Page 1 is a uniform FLAT list of individual dishes — no options/grouping
                                      indicator (AI variant groups are un-grouped into separate lines here;
                                      grouping is purely a page-2 decision). */}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {/* "This one's free" — turns £0 from an accident into a DECISION. Shown only
                                      while the item is unresolved, so a normal priced item never sees it.
                                      Ticking it resolves the row; typing a positive price below clears it. */}
                                  {priceUnresolved(item) && (
                                    <button type="button" onClick={() => patchImportItem(globalIdx, it => ({ ...it, _free: true, price: 0, price_missing: false }))}
                                      className="text-[11px] font-semibold text-slate-400 hover:text-orange-600 underline whitespace-nowrap">
                                      free?
                                    </button>
                                  )}
                                  {item._free === true ? (
                                    <button type="button" onClick={() => patchImportItem(globalIdx, it => ({ ...it, _free: false, price_missing: true }))}
                                      className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-1 whitespace-nowrap">
                                      Free ✕
                                    </button>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <span className="text-sm text-slate-400">£</span>
                                      {/* value stays EMPTY for an unresolved item — never "0.00", which invites
                                          skimming past it as if it were correct. */}
                                      <input type="number" step="0.50" value={Number(item.price) > 0 ? item.price : ''} placeholder="0.00"
                                        onChange={e => { const v = parseFloat(e.target.value); patchImportItem(globalIdx, it => ({ ...it, price: v > 0 ? v : 0, price_missing: !(v > 0), _free: v > 0 ? false : it._free })) }}
                                        className={`w-16 text-sm text-right rounded-lg px-2 py-1 border focus:outline-none focus:ring-1 focus:ring-orange-400 ${priceUnresolved(item) ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {/* §66 point 1: add a dish the AI missed — slots into importResult with this category.
                            Best-practice guard: a manual row needs a NAME to count/commit; don't let a second
                            blank row stack until the current one is named. */}
                        {(() => {
                          const hasBlankManual = catItems.some(i => i._manual && !String(i.name || '').trim())
                          return (
                            <button type="button" disabled={hasBlankManual}
                              title={hasBlankManual ? 'Name the new item before adding another' : undefined}
                              onClick={() => { if (hasBlankManual) return; setImportResult(prev => prev ? { ...prev, items: [...prev.items, { name: '', price: 0, price_missing: true, category: cat, allergens: [], dietary: [], _allergensChecked: false, _manual: true, _uid: newImpUid() }] } : prev) }}
                              className={`mt-2 text-xs font-bold ${hasBlankManual ? 'text-slate-300 cursor-not-allowed' : 'text-orange-600 hover:text-orange-700'}`}>+ Add item</button>
                          )
                        })()}
                      </div>
                    )
                  })}
                  {/* ── I1: ADD A CATEGORY ────────────────────────────────────────────────────────
                      Sits after the last category, mirroring "+ Add item"'s placement at the end of
                      each one. Add-then-assign: the new (empty) section renders immediately above,
                      and items move into it from any row's category select. */}
                  <div className="mt-4">
                    {catEdit?.from === '' ? (
                      <>
                        <input autoFocus value={catEdit.value} placeholder="Category name" aria-label="New category name"
                          onChange={e => { setCatEdit({ from: '', value: e.target.value }); setCatEditError(null) }}
                          onBlur={commitCatEdit}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitCatEdit() }
                            if (e.key === 'Escape') { setCatEdit(null); setCatEditError(null) }
                          }}
                          className="w-full max-w-xs text-sm font-semibold text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
                        {catEditError && <p className="text-[11px] text-red-600 mt-1">{catEditError}</p>}
                      </>
                    ) : (
                      <button type="button" onClick={() => { setCatEdit({ from: '', value: '' }); setCatEditError(null) }}
                        className="text-xs font-bold text-orange-600 hover:text-orange-700">+ Add category</button>
                    )}
                  </div>
                </div>
              )}

              {/* ─ STEP 2 — CUSTOM EXTRAS (menu-price display; split = "keep separate"). ─ */}
              {reviewStep === 2 && hasExtras && (
                /* TWO-BOX GROUPING CHOOSER — only dishes WITH a variant grouping appear here (AI-detected
                   variant groups + regroup candidates). Each row = grouped vs separate, grouped pre-selected.
                   The per-dish offer/option MATRIX returns later on the shared component — NOT this build. */
                /* py-6: vertical breathing room (the scroller is px-6 only) — matches step 1. */
                <div className="flex flex-col gap-5 py-6">
                  <p className="text-sm text-slate-600">Some dishes can be set up as <span className="font-semibold">one customisable item</span> or kept as <span className="font-semibold">separate dishes</span>. Choose how each should appear. You can change this{inSetup ? ' later' : ' later in Settings'}.</p>
                  {groupingRows.length === 0 ? (
                    <p className="text-sm text-slate-500">No groupable dishes — every item is a standalone dish.</p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {groupingRows.map(row => {
                        const choice = groupingChoice[row.key] ?? 'grouped'
                        const boxCls = (active: boolean) => `text-left rounded-xl border-2 p-3 transition-colors ${active ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-200' : 'border-slate-200 bg-white hover:border-slate-300'}`
                        return (
                          <div key={row.key} className="rounded-xl border border-slate-200 p-3">
                            <p className="text-sm font-bold text-slate-800 mb-2">{row.baseName} <span className="text-xs font-medium text-slate-400">· {row.axisLabel} choice</span></p>
                            <div className="grid grid-cols-2 gap-3">
                              {/* LEFT — Grouped (customisable) */}
                              <button type="button" onClick={() => setGroupingChoice(c => ({ ...c, [row.key]: 'grouped' }))} className={boxCls(choice === 'grouped')}>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Grouped · one item, customer chooses</p>
                                <p className="text-sm font-bold text-slate-900">{row.baseName} <span className="text-slate-500 font-medium">£{row.basePrice.toFixed(2)}</span></p>
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {row.options.map(o => (
                                    <span key={o.name} className="text-[11px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">{o.name}{o.surcharge > 0 ? ` +£${o.surcharge.toFixed(2)}` : ''}</span>
                                  ))}
                                </div>
                              </button>
                              {/* RIGHT — Separate items */}
                              <button type="button" onClick={() => setGroupingChoice(c => ({ ...c, [row.key]: 'separate' }))} className={boxCls(choice === 'separate')}>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Separate menu items</p>
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                  {row.separateItems.map(s => (
                                    <p key={s.name} className="text-xs text-slate-700 truncate">{s.name} <span className="text-slate-400">£{s.price.toFixed(2)}</span></p>
                                  ))}
                                </div>
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* The allergen step (former step 3) was removed. Allergens still import (AI detections)
                  and commit flagged (allergens_verified=false) for later review in Settings — no UI here. */}

            </div>
            <div className="p-5 border-t border-slate-100 flex items-center gap-2 shrink-0">
              <Btn label={reviewStep > 1 ? '← Back' : 'Back'} colour="slate" onClick={() => reviewStep > 1 ? setReviewStep(reviewStep - 1) : setImportStep('upload')} />
              <div className="flex-1" />
              {/* "Next →" everywhere — Kitchen setup (prep) follows, so neither review step is the final
                 action. Menu → Extras (if any) else straight to Kitchen setup; Extras → Kitchen setup.
                 The final commit lives on the Kitchen-setup step. */}
              {reviewStep === 1 ? (
                // Gated: the price banner above explains why. Disabled until every unread price is a price
                // or an explicit "free". Only step 1 is gated — unresolved prices can only exist here.
                <Btn label="Next →" disabled={unresolvedPrices.length > 0}
                  onClick={() => { if (unresolvedPrices.length > 0) return; if (hasExtras) setReviewStep(2); else goToAllergens() }} />
              ) : (
                <Btn label="Next →" onClick={goToAllergens} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Import — ALLERGENS step (STAGED + atomic). chooser → shared card-upload page → per-dish staged
          review (the EXISTING wizard on importResult). NOTHING commits here — the one atomic commit is at
          Kitchen "Save". Abandon = nothing persists. */}
      {importStep === 'allergens' && importResult && (() => {
        const namedDishes = importResult.items
          .map((it: any, i: number) => ({ i, name: String(it.name || '').trim() }))
          .filter(d => d.name)
        const m = cardImportMatch
        const pending = m ? [...m.unmatched.map(e => ({ entry: e, candidates: null as number[] | null })),
                             ...m.ambiguous.map(a => ({ entry: a.entry, candidates: a.candidateDishIds.map(Number) }))]
                             .filter(x => !cardEntriesResolved.has(cardEntryKey(x.entry))) : []
        const dishName = (idx: number) => String(importResult.items[idx]?.name || `Dish ${idx + 1}`)
        const anyDetected = importResult.items.some((it: any) => (it.allergens || []).length > 0)
        // REVIEW sub-state → reuse the standalone AllergenWizardModal on STAGED data (in-flow, pre-commit).
        // Confirms mutate importResult only; the atomic commit at Kitchen maps _allergensChecked → verified.
        // I2: it opens as the TABLE (initialReviewView). Reached ONLY when the operator has already chosen
        // "show allergens against each dish" on the chooser — the card-only branch returns before here, so
        // card mode is untouched. Not gated on inSetup: `reviewView` is component-local useState with no
        // persistence anywhere, so there is no stored preference to override — see the report.
        if (allergenSubStep === 'review') {
          return (
            <AllergenWizardModal
              items={stagedItems}
              categories={stagedCategories}
              initialMode={1}
              initialReviewView="table"
              canEdit={canEditAllergens}
              onConfirmRow={stagedConfirm}
              onUndoRow={stagedUndo}
              onEditUnverify={stagedUnverify}
              showToast={showToast}
              cardText={cardImportParsed?.formatted_text || ''}
              cardUrl=""
              cardProcessing={cardImportProcessing}
              onAddCard={() => setAllergenSubStep('card')}
              onSetDisplayMode={async () => { /* mode already chosen on the chooser; staged */ }}
              onClose={goToKitchen}
              onBack={() => setAllergenSubStep('card')}
              importStepper={renderWizardStepper('allergens')}
            />
          )
        }
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col h-[70vh] max-h-[90vh]">
              <div className="p-5 border-b border-slate-100 shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-black text-slate-900">Allergens</h3>
                  <button type="button" onClick={() => setShowDiscardConfirm(true)} aria-label="Close import"
                    className="text-slate-400 hover:text-slate-600 text-2xl leading-none -mt-1 flex-shrink-0">×</button>
                </div>
                {renderWizardStepper('allergens')}
              </div>
              {/* #1: min-height so the allergens page matches the other wizard pages (not noticeably smaller). */}
              <div ref={wizardScrollRef} className="p-5 overflow-y-auto flex-1 flex flex-col gap-4 min-h-0">
              {allergenSubStep === 'chooser' ? (
              /* STRUCTURE choice FIRST — the shared chooser (identical to the standalone wizard's mode 0). */
              <div className="flex flex-col gap-3">
                {/* #3 PROMINENT detection notice — reuses the app's AMBER notice pattern (bg-amber-50
                    border-amber-200 rounded-xl), same as the CardUploadPage notice + the cross-tab banners. */}
                {anyDetected && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                    <p className="text-xs text-amber-800 font-semibold">We detected allergens from your menu. Choose how to show them below.</p>
                  </div>
                )}
                <p className="text-sm font-bold text-slate-900">How do you want to show allergens to customers?</p>
                {/* #4 controlled — select a mode, then "Next" (footer) advances. No auto-advance. */}
                <AllergenModeChooser value={pendingDisplayMode} onChange={setPendingDisplayMode} />
              </div>
              ) : pendingDisplayMode === 'card' ? (
              /* CARD-ONLY editor — verbatim, NO extraction/vocab. SEPARATE from CardUploadPage so the card
                 path can't leak into per-dish. Saved verbatim at commit (handleCommitMenu). */
              <CardOnlyEditor
                value={importCardOnlyText}
                onChange={setImportCardOnlyText}
                onTranscribe={transcribeImportCard}
                transcribing={importCardOnlyTranscribing}
                canEdit={canEditAllergens}
              />
              ) : (
              /* SHARED <CardUploadPage> — DRY: the SAME component the standalone wizard uses. Import passes
                 staged-index dishIds + the staged match/merge handlers. */
              <CardUploadPage
                perDish={pendingDisplayMode === 'per_dish'}
                anyDetected={anyDetected}
                parsed={cardImportParsed}
                processing={cardImportProcessing}
                showUpload={showCardUpload}
                onShowUpload={() => setShowCardUpload(true)}
                file={cardImportFile}
                onFile={setCardImportFile}
                text={cardImportText}
                onText={setCardImportText}
                onProcess={() => handleImportCardProcess(cardImportFile, cardImportText)}
                onCancelUpload={() => { setShowCardUpload(false); setCardImportFile(null); setCardImportText('') }}
                matchResult={cardImportMatch}
                resolvedKeys={cardEntriesResolved}
                dishes={importResult.items.map((it: any, i: number) => ({ id: String(i), name: String(it.name || '').trim() })).filter(d => d.name)}
                onAssign={(entry, dishId) => assignCardEntry(entry, Number(dishId))}
                onDismiss={dismissCardEntry}
                blanketOptIn={cardBlanketOptIn}
                onBlanketToggle={setCardBlanketOptIn}
              />
              )}
            </div>
            <div className="p-5 border-t border-slate-100 flex items-center gap-2 shrink-0">
              <Btn label="← Back" colour="slate" onClick={() => allergenSubStep === 'card' ? setAllergenSubStep('chooser') : (hasExtras ? (setImportStep('review'), setReviewStep(2)) : (setImportStep('review'), setReviewStep(1)))} />
              <div className="flex-1" />
              {/* Skip the WHOLE allergen setup → Kitchen. NOTHING commits here (Kitchen "Save" is the commit). */}
              <Btn label="Skip Allergen setup for now" colour="ghost" onClick={goToKitchen} />
              {/* #4: chooser needs an explicit Next (select a mode first); card page advances to review/Kitchen. */}
              {allergenSubStep === 'chooser'
                ? <Btn label="Next →" disabled={!pendingDisplayMode} onClick={() => setAllergenSubStep('card')} />
                : <Btn label="Next →" onClick={advanceFromCardPage} />}
            </div>
            </div>
          </div>
        )
      })()}

      {/* AI Import — Prep time */}
      {(importStep === 'prep' || importStep === 'saving') && importResult && (() => {
        const newCats = importResult.categories.filter(c => !importResult.existing_categories.includes(c))
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            {/* Same shell as the review modal (max-w-2xl shadow-2xl flex flex-col max-h-[90vh]) so the
                Extras → Kitchen-setup transition keeps the SAME width — no shrink, feels connected. */}
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col h-[70vh] max-h-[90vh]">
              <div className="p-5 border-b border-slate-100 shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-black text-slate-900">Kitchen setup</h3>
                  <button type="button" onClick={() => setShowDiscardConfirm(true)} aria-label="Close import"
                    className="text-slate-400 hover:text-slate-600 text-2xl leading-none -mt-1 flex-shrink-0">×</button>
                </div>
                <p className="text-slate-500 text-sm mt-0.5">Help customers know how long to wait — you can always change these later.</p>
                {/* Same wizard stepper as the review modal, now highlighting Kitchen setup. */}
                {renderWizardStepper('kitchen')}
              </div>

              {/* Copy = the SAME shared constants Settings shows under its Kitchen capacity section
                  (KITCHEN_CAPACITY_DESC + KITCHEN_CAPACITY_EXAMPLE in lib/kitchen-capacity.ts) — one source,
                  no drift. (The old pizza-walkthrough KITCHEN_SETUP_EXPLAINER is now unused — sweep later.) */}
              <div className="mx-5 mt-4 mb-0 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex-shrink-0">
                <p className="text-xs font-semibold text-blue-700 mb-2">How kitchen capacity works</p>
                <p className="text-xs text-blue-600 mb-1.5">{KITCHEN_CAPACITY_DESC}</p>
                <p className="text-xs text-blue-500 mb-1.5">{KITCHEN_CAPACITY_EXAMPLE}</p>
                {/* I3: the third briefed line. Rendered HERE ONLY — the Settings and dashboard capacity
                    cards keep their existing two paragraphs, because adding a line to those surfaces
                    would be a UI change outside this item's scope. The constant is shared so that when
                    they do want it, there is nothing to re-type. */}
                <p className="text-xs text-blue-500">{KITCHEN_CAPACITY_NO_LIMIT}</p>
              </div>

              <div ref={wizardScrollRef} className="overflow-y-auto flex-1 p-5 min-h-0">
                {newCats.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">All categories already exist — no times to set.</p>
                ) : (
                  // Settings-style GRID — SAME 4-col template as Settings (Category | Items | Prep |
                  // Counts to total capacity). Cells come from the shared <KitchenCapacityCategoryRow>
                  // (Fragment-of-cells); all edits are in-memory (setCategoryPrep, NO RPC) — committed
                  // with the categories. The counts column mirrors Settings exactly (cooked → checked+
                  // disabled / auto-counts; instant → tickable only once a total capacity is set).
                  <div className={`${KITCHEN_CAPACITY_GRID} gap-y-2 items-center`}>
                    <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">Category</span>
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Items</span>
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Prep</span>
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 text-center leading-tight" title="Which categories count toward the total capacity. Cooked categories always count; tick instant ones (sides, dips, drinks) to include them.">Counts to total capacity</span>
                    {newCats.map(cat => {
                      const prep = categoryPrep[cat] || { prep_secs: null, batch_size: null }
                      const hasCap = importKitchenCapacity.kitchen_capacity != null
                      const locked = (prep.prep_secs ?? 0) > 0      // cooked → force-counted (engine auto-counts)
                      const capDisabled = locked || !hasCap         // instant tickable only once a ceiling is set
                      return (
                        <KitchenCapacityCategoryRow
                          key={cat}
                          categoryName={cat}
                          prepSecs={prep.prep_secs}
                          batchSize={prep.batch_size}
                          onPrepChange={secs => setCategoryPrep(prev => ({ ...prev, [cat]: { ...prev[cat], prep_secs: secs } }))}
                          onBatchChange={n => setCategoryPrep(prev => ({ ...prev, [cat]: { ...prev[cat], batch_size: n } }))}
                          showCountsColumn
                          countsToward={prep.counts_toward}
                          locked={locked}
                          capDisabled={capDisabled}
                          countsTitle={locked
                            ? 'Cooked — always counts (its prep & batch set the pace)'
                            : !hasCap ? 'Set a capacity to choose which categories count'
                            : 'Tick to include this instant category (sides, dips, drinks) in the shared per-window limit'}
                          onCountsChange={() => { if (!locked && hasCap) setCategoryPrep(prev => ({ ...prev, [cat]: { ...prev[cat], counts_toward: !prev[cat]?.counts_toward } })) }}
                        />
                      )
                    })}
                  </div>
                )}

                {/* Total capacity — mirrors Settings (ceiling + window), SAME 4-col template as the
                    category grid so it aligns (empty 4th cell under the Counts column, like Settings).
                    HELD IN STATE — written to the van(s) ONLY at commit (deferred; see importKitchenCapacity). */}
                <div className={`${KITCHEN_CAPACITY_GRID} items-center mt-4 pt-2.5 border-t border-slate-100`}>
                  <span className="text-sm font-semibold text-slate-800 min-w-0">Total capacity</span>
                  <BatchSizeSelect
                    ariaLabel="Total capacity (items)"
                    valueSize={importKitchenCapacity.kitchen_capacity}
                    onChange={n => { setImportKitchenCapacity(c => ({ ...c, kitchen_capacity: n })); setImportKitchenDirty(true) }}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  <select
                    value={importKitchenCapacity.capacity_window_mins ?? 5}
                    aria-label="Capacity window (minutes)"
                    disabled={importKitchenCapacity.kitchen_capacity == null}
                    onChange={e => { setImportKitchenCapacity(c => ({ ...c, capacity_window_mins: parseInt(e.target.value) })); setImportKitchenDirty(true) }}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50">
                    {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>every {formatPrepSecs(n * 60)}</option>
                    ))}
                  </select>
                  <span/>
                </div>
                {importKitchenCapacity.kitchen_capacity == null && (
                  <p className="text-xs text-slate-400 mt-1.5 px-0.5">Set a total capacity to cap how many items the kitchen takes on per window. Leave at ∞ for no limit.</p>
                )}
              </div>

              <div className="p-5 border-t border-slate-100 flex gap-2 shrink-0">
                <Btn label="← Back" colour="slate" onClick={() => setImportStep('allergens')} disabled={importStep === 'saving'} />
                <div className="flex-1" />
                {/* Kitchen is the FINAL step → the ONE atomic commit (items + categories + prep + reviewed
                    allergens). Nothing was written before this. */}
                {/* Setup mode: Schedule follows, so this reads "Next →" like the other steps (it STILL commits
                    the menu — commit-first — then advances to Schedule). Not inSetup: it's the terminal commit,
                    so the label stays "Save & add to menu" exactly as today. */}
                <Btn label={inSetup ? 'Next →' : 'Save & add to menu'} onClick={() => handleCommitMenu()} loading={importStep === 'saving'} />
              </div>
            </div>
          </div>
        )
      })()}

      {/* AI Import — SCHEDULE (SETUP MODE ONLY). Post-commit: the menu is durable, this is skippable. Same
          shell/header/stepper as the other steps.
          🔴 The × is a DISMISSAL, not a completion: it routes to the SAME "Finish setting up later?" confirm
          as every other step's × (setShowDiscardConfirm → resetImportState on accept), so it writes NOTHING —
          setup_step is left intact, inSetup stays true, and the setup chrome survives. It used to call
          skipSchedule directly, silently writing setup_step='done' with no confirm and no route back: the same
          control behaving differently on the last step of the same wizard.
          DISTINCT BY DESIGN: Route C's "Continue →" DOES write setup_step='done' — choosing "I'll add my dates
          myself" is a deliberate completion, not a dismissal. Dismiss ≠ finish; keep the two apart.
          `disabled={finishingSetup}` is retained (the other steps don't need it): it stops the confirm being
          opened while a Continue's finishSetup is in flight, where resetImportState and that call's
          `finally { setImportStep('done') }` would race and re-show the done screen after dismissal. */}
      {importStep === 'schedule' && inSetup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col h-[70vh] max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-black text-slate-900">Add my schedule</h3>
                <button type="button" onClick={() => setShowDiscardConfirm(true)} aria-label="Close import" disabled={finishingSetup}
                  className="text-slate-400 hover:text-slate-600 text-2xl leading-none -mt-1 flex-shrink-0 disabled:opacity-40">×</button>
              </div>
              <p className="text-slate-500 text-sm mt-0.5">If your schedule lives on your website we can keep it up to date automatically — or add your dates yourself.</p>
              {/* T2: the reassurance sits on the step where the worry arises — an operator adding dates
                  reasonably assumes that is what starts a clock. ⚠️ It describes a mechanism that is
                  NOT built; the constant's own comment explains why it ships anyway. */}
              <p className="text-xs text-slate-500 mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                {TRIAL_NOT_STARTED_BY_EVENTS}
              </p>
              {renderWizardStepper('schedule')}
            </div>

            {/* PLAIN RADIO CHOOSER + INLINE ACCORDION — the three options stay visible; selecting one EXPANDS
                its content in place (no full-view swap, no Back). Rendered by the SHARED OptionCardChooser so
                these cards and the allergen step's chooser can't drift. NO EMOJI here (showEmoji defaults off).
                Each route's own forward action lives inside its section — there is no separate skip control:
                Route C IS the "later" path, so a second differently-worded control would duplicate it. */}
            <div ref={wizardScrollRef} className="overflow-y-auto flex-1 p-5 min-h-0">
              <OptionCardChooser<'website' | 'photo' | 'manual'>
                chevron
                value={scheduleRoute === 'chooser' ? null : scheduleRoute}
                onChange={toggleScheduleRoute}
                options={[
                  {
                    key: 'website',
                    title: 'My schedule is on my website',
                    desc: "We'll check it regularly and send new dates for your approval.",
                    // Once a URL is verified+enrolled the OTHER rows LOCK (can't stack a second route on top).
                    // The open website row itself stays put; toggleScheduleRoute no-ops while verified.
                    disabled: !!schedVerifiedEvents && scheduleRoute !== 'website',
                    // ROUTE A — URL + Verify inline (same row + button-to-the-right layout as the Manage page).
                    body: (
                      <div className="flex flex-col gap-3">
                          <div className="flex gap-2">
                            <input
                              type="url" value={schedUrl}
                              onChange={e => { setSchedUrl(e.target.value); setSchedVerifyError(null) }}
                              placeholder="https://yourtruck.co.uk/events"
                              disabled={schedVerifying || !!schedVerifiedEvents}
                              className={`flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${(schedVerifying || schedVerifiedEvents) ? 'opacity-60' : ''}`} />
                            <button type="button" onClick={schedVerify} disabled={!schedUrl.trim() || schedVerifying || !!schedVerifiedEvents}
                              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
                              {schedVerifying
                                ? <><div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" />Checking…</>
                                : 'Verify'}
                            </button>
                          </div>
                          {schedVerifying && (
                            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                              <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin shrink-0 mt-0.5" />
                              <div>
                                <p className="text-sm font-semibold text-amber-800">Checking your website…</p>
                                <p className="text-xs text-amber-700 mt-0.5">This can take up to 2 minutes — please keep this open.</p>
                              </div>
                            </div>
                          )}
                          {!schedVerifying && schedVerifyError && <p className="text-xs text-red-500">{schedVerifyError}</p>}
                          {/* ── T1(f): REDUCED TO THE ENROLMENT CONFIRMATION ────────────────────────
                              This panel used to carry the whole result: a count, a five-date preview,
                              and "we'll send new dates for your approval". All three were written for a
                              route that imported NOTHING. Now the modal opens over this with the dates
                              themselves, editable — so the preview duplicates it, and "we'll send them
                              for your approval later" actively contradicts the import happening in
                              front of them. What is left is the one thing the modal does NOT say: the
                              page is now watched from here on. */}
                          {schedVerifiedEvents && (
                            <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                              <p className="text-sm font-bold text-green-800">✓ We can read your schedule</p>
                              <p className="text-xs text-green-700 mt-0.5">
                                We&apos;ll keep checking this page and send any new dates for your approval.
                              </p>
                              <div className="mt-3"><Btn label="Continue →" onClick={skipSchedule} loading={finishingSetup} /></div>
                            </div>
                          )}
                          {!schedVerifiedEvents && <p className="text-xs text-slate-500">Your own website — not a Facebook or Instagram page.</p>}
                      </div>
                    ),
                  },
                  {
                    key: 'photo',
                    title: 'Upload a photo of my schedule',
                    desc: "Snap or paste your dates — we'll read them in for you to check.",
                    disabled: !!schedVerifiedEvents && scheduleRoute !== 'photo',
                    // ROUTE B — photo/text → read → review → save (same upsert_event path).
                    body: (
                      <div className="flex flex-col gap-3">
                          {!schedExtracted ? (
                            <>
                              <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-slate-200 hover:border-orange-300 hover:bg-orange-50/30 rounded-xl h-28 px-4 cursor-pointer transition-colors">
                                <span className="text-2xl">{schedFile ? '✅' : '📷'}</span>
                                <span className="text-sm text-slate-500 text-center">{schedFile ? schedFile.name : 'Drag and drop or tap to choose'}</span>
                                <span className="text-xs text-slate-400">Image or PDF</span>
                                <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={e => setSchedFile(e.target.files?.[0] || null)} />
                              </label>
                              <div className="flex items-center gap-3"><div className="flex-1 h-px bg-slate-200" /><span className="text-xs text-slate-400 font-medium">or</span><div className="flex-1 h-px bg-slate-200" /></div>
                              <textarea value={schedText} onChange={e => setSchedText(e.target.value)} placeholder="Paste your dates here…" className="w-full h-24 border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400" />
                              <div><Btn label="Read schedule" onClick={schedProcessPhoto} loading={schedPhotoProcessing} disabled={!schedFile && !schedText.trim()} /></div>
                            </>
                          ) : schedExtracted.length === 0 ? (
                            <>
                              <p className="text-sm text-slate-500">We couldn&apos;t find any dates in that — try a clearer photo, or add a date yourself.</p>
                              <div><Btn label="Try again" colour="slate" onClick={() => setSchedExtracted(null)} /></div>
                            </>
                          ) : (
                            <>
                              <p className="text-sm text-slate-600">{schedExtracted.length} date{schedExtracted.length !== 1 ? 's' : ''} found — these will be added to your schedule.</p>
                              <ul className="flex flex-col gap-1.5">
                                {schedExtracted.map((ev: any, i: number) => (
                                  <li key={i} className="text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-2">
                                    <span className="font-semibold">{ev.event_date || 'Date TBC'}</span>{ev.venue_name ? ` · ${ev.venue_name}` : ''}{ev.start_time ? ` · ${ev.start_time}${ev.end_time ? `–${ev.end_time}` : ''}` : ''}
                                  </li>
                                ))}
                              </ul>
                              <div><Btn label={`Save ${schedExtracted.length} date${schedExtracted.length !== 1 ? 's' : ''}`} onClick={schedSaveExtracted} loading={schedSaving} /></div>
                            </>
                          )}
                      </div>
                    ),
                  },
                  {
                    key: 'manual',
                    title: "I'll add my dates myself",
                    desc: 'Add them later in the Schedule tab — nothing to do now.',
                    disabled: !!schedVerifiedEvents && scheduleRoute !== 'manual',
                    // ROUTE C — EXPLANATORY COPY ONLY. No form, no write, no handler: "Continue →" is
                    // skipSchedule, so this finishes setup exactly as the old skip link did (setup_step='done',
                    // no events). This is the deliberate "later" path — do not grow a schedule manager here.
                    body: (
                      <div className="flex flex-col gap-3">
                        <p className="text-sm text-slate-600">No problem. You can add and manage your dates any time from the Schedule tab in your account.</p>
                        <div><Btn label="Continue →" onClick={skipSchedule} loading={finishingSetup} /></div>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── K1: THE SETTINGS REVIEW SCREEN ─────────────────────────────────────────────────────────
          Between Schedule and Done. Same modal shell, same scroller (wizardScrollRef → H2 scroll-to-top),
          same stepper as every other step.
          🔴 inSetup-GATED like the rest of the wizard, and reachable only from the schedule step —
          `importStep` never takes this value on any other path, so no existing operator can land here.
          NOTHING IS MANDATORY: every row is optional and "Looks good" is always enabled. */}
      {importStep === 'settings' && inSetup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col h-[70vh] max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-black text-slate-900">A few settings to check</h3>
                <button type="button" onClick={() => setShowDiscardConfirm(true)} aria-label="Close import"
                  className="text-slate-400 hover:text-slate-600 text-2xl leading-none -mt-1 flex-shrink-0">×</button>
              </div>
              <p className="text-slate-500 text-sm mt-0.5">
                We&apos;ve set you up with some common settings. Worth a quick look — you can change any of
                these later in Settings.
              </p>
              {renderWizardStepper('settings')}
            </div>

            <div ref={wizardScrollRef} className="overflow-y-auto flex-1 p-5 min-h-0 space-y-3">
              {/* GENERIC RENDERER — it reads `control` and `secondary` and knows nothing else about any
                  row. Adding a fifth setting means one more object in setupReviewItems. */}
              {setupReviewItems.map(item => (
                <div key={item.id} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{item.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.helpText}</p>
                    </div>
                    <div className="shrink-0">
                      {item.control === 'toggle' ? (
                        <Toggle
                          on={item.currentValue === true}
                          disabled={item.disabled}
                          onToggle={() => (item.onChange as (v: boolean) => void)(item.currentValue !== true)}
                        />
                      ) : (
                        // The SAME no-limit affordance the kitchen-setup step uses — ∞ for null, never a
                        // pre-filled number. BatchSizeSelect maps '' ⇄ null, so blank stays blank.
                        <BatchSizeSelect
                          ariaLabel={item.label}
                          valueSize={typeof item.currentValue === 'number' ? item.currentValue : null}
                          disabled={item.disabled}
                          onChange={n => (item.onChange as (v: number | null) => void)(n)}
                          className="border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50"
                        />
                      )}
                    </div>
                  </div>
                  {item.secondary && item.secondary.visible && (
                    <div className="flex items-center gap-2 mt-3 pl-4">
                      <span className="text-xs text-slate-600">{item.secondary.label}</span>
                      <select
                        value={item.secondary.value}
                        aria-label={`${item.label} — ${item.secondary.label}`}
                        onChange={e => item.secondary!.onChange(parseInt(e.target.value))}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                      >
                        {item.secondary.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {/* Q4: the tail comes from the row's own data — it was hardcoded "before their
                          pickup time", which is only true of the cancellation row and would have been
                          nonsense beneath the buzzer count. */}
                      {item.secondary.suffix && <span className="text-xs text-slate-600">{item.secondary.suffix}</span>}
                    </div>
                  )}
                  <p className="text-[11px] text-slate-400 mt-2">{item.settingsAnchor}</p>
                </div>
              ))}
              {reviewLoading && <p className="text-xs text-slate-400">Loading your current settings…</p>}
            </div>

            <div className="p-5 border-t border-slate-100 flex gap-2 shrink-0">
              <div className="flex-1" />
              {/* The ONLY caller of finishSetup() now — this is where setup_step becomes 'done'. */}
              <Btn label="Looks good →" loading={finishingSetup} onClick={() => { void finishSetup() }} />
            </div>
          </div>
        </div>
      )}

      {/* AI Import — Done */}
      {importStep === 'done' && (() => {
        // 🔴 The allergen notice is GATED ON ACTUAL STATE — it must NOT tell a compliant operator "allergens
        // aren't set". Keyed on the COMMITTED display mode (pendingDisplayMode → written to
        // trucks.allergen_display_mode at commit, :2413/:2464) AND per-dish confirmation:
        //   • mode === 'card'     → allergen setup is COMPLETE (a card is provided + shown to customers). The
        //                           card path never sets per-dish _allergensChecked, so it must NOT be judged by
        //                           it. → allergensComplete = true → NO notice.
        //   • mode === 'per_dish' → complete ONLY if every committed dish (named, not skipped) carries
        //                           `_allergensChecked === true` (the same flag the commit maps to
        //                           allergens_verified). An unconfirmed per-dish import STILL warns.
        //   • anything else       → genuinely unknown/indeterminate (e.g. the allergen step was skipped, mode
        //                           null). FAIL LOUD → allergensComplete = false → SHOW the notice.
        // Not gated on inSetup — a correctness fix for every import (Gusto included).
        const mode = pendingDisplayMode   // the committed allergen_display_mode ('per_dish' | 'card' | null)
        // H5: the shared committable set (defined once, above) replaces an inline copy of the identical
        // filter. It is `[]` rather than `null` when importResult is null, and the `length > 0` guard
        // below already made those two cases behave the same — so this judges exactly what it did before.
        const committed = committedImportItems
        const perDishAllConfirmed = committed.length > 0 && committed.every((it: any) => it._allergensChecked === true)
        const allergensComplete = mode === 'card' ? true : mode === 'per_dish' ? perDishAllConfirmed : false
        const n = committed.length
        const m = committedImportCategoryCount
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
              {/* H4: the stepper on the done screen, gated on inSetup — Gusto and RTF have never had one
                  here. 'schedule' is the step they have just come from (finishSetup is only reachable
                  from it), so the last pill reads as current rather than as somewhere still to go. */}
              {inSetup && <div className="mb-4 flex justify-center">{renderWizardStepper('schedule')}</div>}
              {/* ── H5: WHAT THEY ACTUALLY GOT ────────────────────────────────────────────────────
                  The old "✅ / Menu imported! / Your items have been added to the menu." said nothing a
                  number could not say better. `n` is the SHARED committable count — the same expression
                  the review header's "N items ready to add" uses — so the figure promised on the way in
                  cannot contradict the figure reported on the way out.
                  🔴 SETUP ONLY. This screen is shared with every existing operator's import, so the old
                  copy is kept verbatim for them; only a setup arrival sees the new line. */}
              {/* Q8: the heading is now the CELEBRATION — this is the end of the whole wizard, not a
                  file-import receipt. The item/category count survives underneath as the evidence
                  (H5's shared `n`, the same expression the review header uses), so nothing is lost.
                  Q9: the Manage-vs-Dashboard line, the same constant the walkthrough opens with —
                  they are about to be offered a tour of one of those two places and should know
                  which. The three walkthrough buttons below are UNTOUCHED. */}
              {inSetup ? (
                <>
                  <p className="text-5xl mb-3">🎉</p>
                  <p className="font-black text-slate-900 text-lg mb-1">You&apos;re all set!</p>
                  <p className="text-slate-500 text-sm">
                    {n} item{n === 1 ? '' : 's'} across {m} categor{m === 1 ? 'y' : 'ies'}.
                  </p>
                  <p className="text-xs text-slate-500 mt-3 text-left bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    {WALKTHROUGH_INTRO}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-5xl mb-4">✅</p>
                  <p className="font-black text-slate-900 mb-1">Menu imported!</p>
                  <p className="text-slate-400 text-sm">Your items have been added to the menu.</p>
                </>
              )}
              {importDoneSkipped > 0 && (
                <p className="text-sm text-slate-400 mt-1">
                  {importDoneSkipped} duplicate{importDoneSkipped !== 1 ? 's' : ''} skipped
                </p>
              )}
              {/* Shown ONLY when the allergen setup isn't complete: card mode = complete; per_dish = complete
                  only if every dish confirmed; unknown/skipped = fail-loud (show).
                  🔴 H5: the notice itself is the ONE shared constant (see its definition) — reused by
                  reference, not re-typed. This CONDITION is untouched. */}
              {!allergensComplete && allergensNotSetNotice}
              {/* SETUP MODE: 'done' is reached after the schedule step and must NOT auto-dismiss (item 2) —
                  the 2.5s reset+reload only runs on the NON-setup commit path. Explicit exit only. */}
              {/* ── K2: THE WALKTHROUGH OFFER ────────────────────────────────────────────────────
                  Replaces the single "Go to my dashboard →" exit. All three choices exit the wizard the
                  same way (resetImportState + reload); they differ only in what is recorded.
                  The choice is reported UP — the page owns the stored state, so this component cannot
                  write a value the reminder strip's condition disagrees with.
                  ⚠️ Order matters on "Show me around": the choice fires FIRST so walkthroughOpen is
                  already true when this overlay unmounts, leaving the tour over a live Manage page. */}
              {inSetup && (
                <div className="mt-5 flex flex-col gap-2">
                  <button type="button"
                    onClick={() => { onWalkthroughChoice('now'); resetImportState(); reload() }}
                    className="w-full bg-orange-600 text-white font-black py-3 rounded-xl text-sm hover:bg-orange-700">
                    Show me around
                  </button>
                  <button type="button"
                    onClick={() => { onWalkthroughChoice('later'); resetImportState(); reload() }}
                    className="w-full border border-slate-200 text-slate-600 font-semibold py-2.5 rounded-xl text-sm hover:bg-slate-50">
                    Remind me later
                  </button>
                  <button type="button"
                    onClick={() => { onWalkthroughChoice('never'); resetImportState(); reload() }}
                    className="w-full text-slate-400 font-semibold py-1.5 text-xs hover:text-slate-600">
                    I&apos;ll explore myself
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Discard confirmation — the X on any wizard step routes here (not an immediate close). Discard
          resets ALL import state (fresh on reopen); nothing was written to the van (capacity is deferred
          to commit), so a discard is a clean in-memory throwaway. z-[60] sits above the wizard modals.
          In SETUP mode the SAME action (resetImportState — no DB write) leaves the account + truck +
          setup_step intact, so the copy is a "finish later" reassurance + how to come back, NOT a scary
          "your changes won't be saved" (which badly understates: a new operator would be stranded with a
          truck and no menu). Existing operators (not inSetup) see today's discard copy unchanged. */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
            {inSetup ? (
              <>
                <p className="font-black text-slate-900 mb-1">Finish setting up later?</p>
                <p className="text-sm text-slate-500 mb-4">Your account and truck are saved — nothing is lost. You can add your menu any time: sign in and tap <span className="font-semibold">Import menu</span> on your menu screen to pick up right here.</p>
                <div className="flex gap-2 justify-center">
                  <Btn label="Keep going" colour="slate" onClick={() => setShowDiscardConfirm(false)} />
                  <Btn label="Finish later" colour="orange" onClick={resetImportState} />
                </div>
              </>
            ) : (
              <>
                <p className="font-black text-slate-900 mb-1">Discard this import?</p>
                <p className="text-sm text-slate-500 mb-4">Your changes won&apos;t be saved — the imported items, prep times and kitchen capacity won&apos;t be added.</p>
                <div className="flex gap-2 justify-center">
                  <Btn label="Keep editing" colour="slate" onClick={() => setShowDiscardConfirm(false)} />
                  <Btn label="Discard" colour="red" onClick={resetImportState} />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// UPSELL RULES SECTION (used inside MenuTab)
// ══════════════════════════════════════════════════════════════
function UpsellRulesSection({ initialRules, categories, api, showToast, adding, setAdding }: {
  initialRules: UpsellRule[]
  categories: Category[]
  api: (a: string, e?: any) => Promise<any>
  showToast: ShowToast
  adding: boolean
  setAdding: (v: boolean) => void
}) {
  // Seeded from the initial /api/manage load (no deferred fetch → renders instantly like the rest of the
  // tab). Mutations below update this local state optimistically; re-sync if the parent reloads.
  const [rules, setRules] = useState<UpsellRule[]>(initialRules)
  useEffect(() => { setRules(initialRules) }, [initialRules])
  const [newTrigger, setNewTrigger] = useState('')
  const [newSuggest, setNewSuggest] = useState('')
  // When set, the inline form is editing this existing rule (vs. adding a new one).
  const [editingId, setEditingId] = useState<string | null>(null)

  const saveRule = async () => {
    if (!newTrigger || !newSuggest || newTrigger === newSuggest) return
    const editing = editingId ? rules.find(r => r.id === editingId) : undefined
    try {
      const data = await api('upsert_upsell_rule', {
        id: editingId ?? undefined,
        trigger_category: newTrigger,
        suggest_category: newSuggest,
        max_suggestions: editing?.max_suggestions ?? 3,
        show_at_checkout: editing?.show_at_checkout ?? true,
      })
      setRules(prev => editingId ? prev.map(r => r.id === editingId ? data.rule : r) : [...prev, data.rule])
      setNewTrigger(''); setNewSuggest(''); setEditingId(null); setAdding(false)
      showToast(editingId ? 'Upsell rule updated' : 'Upsell rule added')
    } catch (e: any) { showToast(e.message, 'error') }
  }

  const startEdit = (rule: UpsellRule) => {
    setNewTrigger(rule.trigger_category)
    setNewSuggest(rule.suggest_category)
    setEditingId(rule.id)
    setAdding(true)
  }

  const deleteRule = async (rule: UpsellRule) => {
    if (!window.confirm(`Remove upsell rule "${rule.trigger_category} → ${rule.suggest_category}"?`)) return
    setRules(prev => prev.filter(r => r.id !== rule.id))
    try {
      await api('delete_upsell_rule', { id: rule.id })
      showToast('Rule removed')
    } catch (e: any) {
      setRules(prev => [...prev, rule])
      showToast(e.message, 'error')
    }
  }

  const catNames = categories.map(c => c.name)

  return (
    <Card className="p-4">
      {adding && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">When customer adds…</label>
              <select value={newTrigger} onChange={e => setNewTrigger(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="">Choose category</option>
                {catNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Suggest items from…</label>
              <select value={newSuggest} onChange={e => setNewSuggest(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="">Choose category</option>
                {catNames.filter(n => n !== newTrigger).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Btn label="Cancel" colour="slate" onClick={() => { setAdding(false); setNewTrigger(''); setNewSuggest(''); setEditingId(null) }} />
            <Btn label={editingId ? 'Save changes' : 'Add rule'} onClick={saveRule} />
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-slate-400 text-sm">No upsell rules yet.</p>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {rule.trigger_category} → {rule.suggest_category}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Up to {rule.max_suggestions} items suggested</p>
              </div>
              {/* show_at_checkout column exists in DB but is unused — all rules are inline */}
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => startEdit(rule)}
                  className="text-slate-400 hover:text-orange-500 text-sm px-1.5 py-1 rounded hover:bg-orange-50">
                  ✏️
                </button>
                <button onClick={() => deleteRule(rule)}
                  className="text-slate-400 hover:text-red-500 text-sm px-1.5 py-1 rounded hover:bg-red-50">
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ══════════════════════════════════════════════════════════════
// MODIFIERS TAB
// ══════════════════════════════════════════════════════════════
function ModifiersTab({ categories, items, modifierGroups, modifierOptions, itemModGroups, upsellRules, setModifierGroups, setModifierOptions, setItemModGroups, api, reload, showToast }: {
  categories: Category[]; items: Item[]; modifierGroups: ModifierGroup[]; modifierOptions: ModifierOption[]
  itemModGroups: {menu_item_id:string;group_id:string;excluded_option_ids?:string[]}[]
  upsellRules: UpsellRule[]
  setModifierGroups: React.Dispatch<React.SetStateAction<ModifierGroup[]>>
  setModifierOptions: React.Dispatch<React.SetStateAction<ModifierOption[]>>
  setItemModGroups: React.Dispatch<React.SetStateAction<{menu_item_id:string;group_id:string;excluded_option_ids?:string[]}[]>>
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: ShowToast
}) {
  // Upsell "add rule" form visibility — lifted from UpsellRulesSection for header button
  const [upsellAdding, setUpsellAdding] = useState(false)

  // §20/§23 optimism lives in the PARENT's state (modifierGroups/modifierOptions/itemModGroups).
  // This tab is conditionally rendered (manage:461) → it UNMOUNTS on tab switch, which previously
  // destroyed a local optimistic copy and re-seeded from a stale prop on remount (created groups
  // vanished). The parent does NOT unmount, so writing optimistically to the parent here (no
  // reload(), no spinner) keeps every create/edit/delete alive across tab switches.
  //
  // Stage D: the Custom Extras EDITOR (group cards, selection rules, options, per-dish matrix) is now
  // the shared <ExtrasEditor> presentational component. It owns ALL ephemeral UI state internally;
  // these handlers are the CALLER callbacks it fires. The optimistic merge + rollback STAYS HERE (the
  // byte-identical guarantee) — the component never touches the canonical lists.

  // ── Create new group — returns the inserted row so the component can open it. Throws on error so
  //    the component keeps its modal open. ───────────────────────────────────────
  const onCreateGroup = async ({ name }: { name: string }) => {
    try {
      const result = await api('upsert_modifier_group', { name, is_required: false, min_choices: 0, max_choices: 99 })
      const g = result.group
      if (g?.id) setModifierGroups(gs => [...gs, g]) // optimistic append (no reload)
      showToast('Group created')
      return g as ModifierGroup
    } catch (e: any) { showToast(e.message, 'error'); throw e }
  }

  // ── Update group — ONE path for rename + selection rules (both upsert_modifier_group). A rename
  //    (patch.name set) keeps existing min/max; a rules change re-derives min from Required + clamps
  //    ≤ max. Optimistic patch + persist without reload. Revert on error. ─────────
  const onUpdateGroup = async (group: ModifierGroup, patch: { name?: string; is_required?: boolean; max_choices?: number }) => {
    const isRename = patch.name !== undefined
    const name = patch.name ?? group.name
    const is_required = patch.is_required ?? group.is_required
    const max_choices = patch.max_choices ?? group.max_choices ?? 99
    let min_choices = group.min_choices
    if (!isRename) {
      min_choices = is_required ? 1 : 0
      if (min_choices > max_choices) min_choices = max_choices
    }
    const prev = modifierGroups
    setModifierGroups(gs => gs.map(g => g.id === group.id ? { ...g, name, is_required, min_choices, max_choices } : g))
    try {
      await api('upsert_modifier_group', { id: group.id, name, is_required, min_choices, max_choices })
      if (isRename) showToast('Group renamed')
    } catch (e: any) { setModifierGroups(prev); showToast(e.message, 'error') }
  }

  // ── Delete group — confirm + optimistic removal + persist without reload. Revert both on error. ──
  const onDeleteGroup = async (group: ModifierGroup) => {
    if (!window.confirm(`Delete "${group.name}"? All options will be removed and it will be unassigned from all categories.`)) return
    const prevG = modifierGroups, prevO = modifierOptions
    setModifierGroups(gs => gs.filter(g => g.id !== group.id))
    setModifierOptions(os => os.filter(o => o.group_id !== group.id))
    try {
      await api('delete_modifier_group', { id: group.id })
      showToast('Group deleted')
    } catch (e: any) { setModifierGroups(prevG); setModifierOptions(prevO); showToast(e.message, 'error') }
  }

  // ── Per-dish ASSIGNMENT (Offer tick) — optimistic flip, single link in/out. ────
  const toggleItemAssign = async (menu_item_id: string, group_id: string, currentlyAttached: boolean) => {
    const attached = !currentlyAttached
    setItemModGroups(prev => attached
      ? [...prev, { menu_item_id, group_id }]
      : prev.filter(x => !(x.menu_item_id === menu_item_id && x.group_id === group_id)))
    try {
      await api('set_item_modifier_group', { group_id, menu_item_id, attached })
    } catch (e: any) {
      // Revert just this toggle.
      setItemModGroups(prev => attached
        ? prev.filter(x => !(x.menu_item_id === menu_item_id && x.group_id === group_id))
        : [...prev, { menu_item_id, group_id }])
      showToast(e.message, 'error')
    }
  }

  // ── Per-dish OPTION exclusions (phase 2 matrix) — opt-out, optimistic, no reload ──
  // excluded_option_ids lives on the (dish,group) link. excludedFor reads it; toggleItemOption flips
  // one option in/out of the exclusion list and persists via set_item_group_excluded_options.
  const excludedFor = (menu_item_id: string, group_id: string): string[] =>
    itemModGroups.find(x => x.menu_item_id === menu_item_id && x.group_id === group_id)?.excluded_option_ids || []

  const toggleItemOption = async (menu_item_id: string, group_id: string, option_id: string, currentlyIncluded: boolean) => {
    const cur = excludedFor(menu_item_id, group_id)
    // Included → exclude (add id); excluded → include (remove id).
    const next = currentlyIncluded ? Array.from(new Set([...cur, option_id])) : cur.filter(id => id !== option_id)
    const prev = itemModGroups
    // §23: optimistic patch of THIS link's array, persist without reload (box stays open). Revert on error.
    setItemModGroups(list => list.map(x =>
      x.menu_item_id === menu_item_id && x.group_id === group_id ? { ...x, excluded_option_ids: next } : x))
    try {
      await api('set_item_group_excluded_options', { group_id, menu_item_id, excluded_option_ids: next })
    } catch (e: any) {
      setItemModGroups(prev)
      showToast(e.message, 'error')
    }
  }

  // ── Option save — the component coerces its price buffer → number and hands us the draft. Patch
  //    from the RESPONSE (a new option needs its server id), no reload. Throws on error so the
  //    component keeps its modal open. ────────────────────────────────────────────
  const onSaveOption = async (draft: Partial<ModifierOption>) => {
    const isEdit = !!draft.id
    const prevO = modifierOptions
    try {
      const result = await api('upsert_modifier_option', draft)
      const saved = result.option
      if (isEdit) setModifierOptions(os => os.map(o => o.id === draft.id ? { ...o, ...saved } : o))
      else if (saved?.id) setModifierOptions(os => [...os, saved])
      showToast(isEdit ? 'Option updated' : 'Option added')
    } catch (e: any) { setModifierOptions(prevO); showToast(e.message, 'error'); throw e }
  }

  // ── Option delete — optimistic removal; no reload (card stays open). Revert on error. ──
  const onDeleteOption = async (opt: ModifierOption) => {
    const prevO = modifierOptions
    setModifierOptions(os => os.filter(o => o.id !== opt.id))
    try { await api('delete_modifier_option', { id: opt.id }); showToast('Option removed') }
    catch (e: any) { setModifierOptions(prevO); showToast(e.message, 'error') }
  }

  return (
    <div>
      {/* ── Section 1: Upsells ─────────────────────────────────────────────── */}
      {/* Section heading — match this pattern for all manage page sections */}
      <div className="flex items-center justify-between mb-4">
        <div>
          {/* Manage page section heading — use font-black text-slate-900 text-lg for all tab headings */}
          <h2 className="font-black text-slate-900 text-lg">Upsells</h2>
          <p className="text-slate-400 text-sm mt-0.5">Nudge customers to add something extra. When someone orders from one category, suggest items from another — a drink with a pizza, a sauce with a burger.</p>
        </div>
        {!upsellAdding && <Btn label="+ Add upsell" onClick={() => setUpsellAdding(true)} />}
      </div>

      <UpsellRulesSection initialRules={upsellRules} categories={categories} api={api} showToast={showToast} adding={upsellAdding} setAdding={setUpsellAdding} />

      {/* ── Section 2: Custom Extras ────────────────────────────────────────── */}
      {/* Stage D: the entire Custom Extras editor (heading, add-group, group cards, selection rules,
          options, per-dish matrix, new-group + option modals) is now the shared <ExtrasEditor>. It owns
          all ephemeral UI state; the callbacks below keep the optimistic merge/rollback HERE (manage is
          byte-identical). Manage passes ALL callbacks → every affordance renders. */}
      <ExtrasEditor
        groups={modifierGroups}
        options={modifierOptions}
        items={items}
        categories={categories}
        assignments={itemModGroups}
        showToast={showToast}
        audience="operator"
        onCreateGroup={onCreateGroup}
        onUpdateGroup={onUpdateGroup}
        onDeleteGroup={onDeleteGroup}
        onSaveOption={onSaveOption}
        onDeleteOption={onDeleteOption}
        onToggleAssign={toggleItemAssign}
        onToggleOption={toggleItemOption}
      />

    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// DEALS TAB
// ══════════════════════════════════════════════════════════════
function DealsTab({ categories, bundles, setBundles, api, reload, showToast }: {
  categories: Category[]; bundles: Bundle[]; setBundles: React.Dispatch<React.SetStateAction<Bundle[]>>
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: ShowToast
}) {
  const [editing, setEditing] = useState<Partial<Bundle> | null>(null)
  const [saving, setSaving] = useState(false)

  const emptyBundle: Partial<Bundle> = { is_available: true, apply_to_new_events: true, bundle_price: 0, slot_1_category: null, slot_2_category: null, slot_3_category: null, slot_4_category: null, slot_5_category: null, slot_6_category: null }

  const save = async () => {
    if (!editing?.name || !editing?.bundle_price) return
    setSaving(true)
    try {
      await api('upsert_bundle', editing)
      showToast(editing.id ? 'Deal updated' : 'Deal created')
      setEditing(null); reload()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Remove this deal?')) return
    try { await api('delete_bundle', { id }); reload(); showToast('Deal removed') }
    catch (e: any) { showToast(e.message, 'error') }
  }

  const slotKeys = ['slot_1_category','slot_2_category','slot_3_category','slot_4_category','slot_5_category','slot_6_category'] as const
  const activeSlotsOf = (b: Partial<Bundle>) => slotKeys.filter(k => b[k]).map(k => b[k]!)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-slate-900 text-lg">Deals</h2>
          <p className="text-slate-400 text-sm">{bundles.length} deal{bundles.length !== 1 ? 's' : ''} configured</p>
        </div>
        <Btn label="+ New deal" onClick={() => setEditing(emptyBundle)} />
      </div>

      {bundles.length === 0 && (
        <EmptyState icon="🎁" title="No deals yet" body='Create a bundle deal like "Lunch Deal — any pizza + drink + dip for £12"' />
      )}

      {bundles.map(bundle => {
        const slots = activeSlotsOf(bundle)
        return (
          <Card key={bundle.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-black text-slate-900">{bundle.name}</p>
                  <Badge label={bundle.is_available ? 'Active' : 'Off'} colour={bundle.is_available ? 'green' : 'slate'} />
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    bundle.apply_to_new_events
                      ? 'bg-teal-50 text-teal-700 border-teal-100'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {bundle.apply_to_new_events ? 'Auto-apply' : 'Manual'}
                  </span>
                </div>
                {bundle.description && <p className="text-slate-400 text-xs mt-0.5">{bundle.description}</p>}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="font-black text-orange-600">£{bundle.bundle_price.toFixed(2)}</span>
                  {bundle.original_price && <span className="text-slate-400 text-xs line-through">£{bundle.original_price.toFixed(2)}</span>}
                  {(bundle.start_time || bundle.end_time) && (
                    <span className="text-xs text-slate-400">{[bundle.start_time, bundle.end_time].filter(Boolean).join(' – ')}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {slots.map((s, i) => <Badge key={i} label={s} colour="orange" />)}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Btn label="Edit" size="sm" colour="ghost" onClick={() => setEditing(bundle)} />
                <Btn label="Delete" size="sm" colour="red" onClick={() => del(bundle.id)} />
              </div>
            </div>

            {bundle.stock_warning && (
              <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                <span className="text-amber-500 flex-shrink-0 text-sm">⚠️</span>
                <p className="text-xs text-amber-700">Currently hidden from customers — {bundle.stock_warning}</p>
              </div>
            )}
          </Card>
        )
      })}

      {editing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => {}}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-slate-900 mb-4">{editing.id ? 'Edit deal' : 'New deal'}</h3>
            <div className="space-y-3">
              <Input label="Deal name" required value={editing.name || ''} onChange={v => setEditing(p => ({...p!, name: v}))} placeholder='e.g. Lunch Deal' />
              <Input label="Description" value={editing.description || ''} onChange={v => setEditing(p => ({...p!, description: v}))} placeholder='Any pizza + drink + dip' />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Deal price" required type="number" value={editing.bundle_price || ''} onChange={v => setEditing(p => ({...p!, bundle_price: parseFloat(v) || 0}))} placeholder="12.00" />
                <Input label="Original price" type="number" value={editing.original_price ?? ''} onChange={v => setEditing(p => ({...p!, original_price: v === '' ? null : parseFloat(v)}))} placeholder="leave blank = auto" hint="blank = calculate from items" />
              </div>

              <div>
                <p className="text-xs font-bold text-slate-600 mb-2">Item slots (categories required for this deal)</p>
                {slotKeys.map((k, i) => (
                  <div key={k} className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-slate-400 w-12 shrink-0">Slot {i + 1}</span>
                    <select value={editing[k] || ''} onChange={e => setEditing(p => ({...p!, [k]: e.target.value || null}))}
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                      <option value="">— Not used —</option>
                      {categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-sm font-bold text-slate-700">Deal active</span>
                <Toggle on={!!editing.is_available} onToggle={() => setEditing(p => ({...p!, is_available: !p!.is_available}))} />
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Apply to events</p>
                <p className="text-xs text-slate-400 mt-0.5 mb-3">Choose whether this deal is automatically applied to your events</p>
                <div className="flex flex-col gap-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="apply_to_new_events"
                      checked={editing.apply_to_new_events === true}
                      onChange={() => setEditing(p => p ? { ...p, apply_to_new_events: true } : p)}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-800">Apply to all future events automatically</p>
                      <p className="text-xs text-slate-500">This deal will be active on every new event you create. You can still turn it off for specific events in Schedule.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="apply_to_new_events"
                      checked={editing.apply_to_new_events === false}
                      onChange={() => setEditing(p => p ? { ...p, apply_to_new_events: false } : p)}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-800">Select manually per event</p>
                      <p className="text-xs text-slate-500">This deal won't appear on events unless you enable it in the Schedule tab.</p>
                    </div>
                  </label>
                </div>
                {editing.apply_to_new_events && (
                  <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    <p className="text-xs text-amber-700">This deal will be added to new events. For existing events, go to Schedule to manage deals per event.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn label="Cancel" colour="slate" onClick={() => setEditing(null)} />
              <Btn label={saving ? 'Saving...' : 'Save deal'} loading={saving} onClick={save} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SCHEDULE TAB (merged schedule CRUD + live event operations)
// ══════════════════════════════════════════════════════════════
async function geocodeLocation(
  venueName: string,
  town: string,
  postcode: string
): Promise<{ lat: number | null; lng: number | null }> {
  try {
    const res = await fetch('/api/manage/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueName, town, postcode }),
    })
    const data = await res.json()
    return { lat: data.lat, lng: data.lng }
  } catch {
    return { lat: null, lng: null }
  }
}
function EventStatusBadge({ status, event_date, end_time }: { status: TruckEvent['status']; event_date: string; end_time: string }) {
  const isPast = end_time ? new Date() > new Date(`${event_date}T${end_time}`) : false
  if (status === 'cancelled') return (
    <span className="text-xs font-semibold text-slate-400">Cancelled</span>
  )
  if (isPast) return (
    <span className="text-xs font-semibold text-slate-400">Finished</span>
  )
  if (status === 'unconfirmed') return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
      <span className="inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />Unconfirmed
    </span>
  )
  if (status === 'confirmed') return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-600">
      <span className="inline-block w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />Confirmed
    </span>
  )
  if (status === 'open') return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
      <span className="inline-block w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />Open now
    </span>
  )
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
      <span className="inline-block w-2 h-2 rounded-full bg-slate-300 flex-shrink-0" />Closed
    </span>
  )
}

type EditingEvent = { id?: string; venue_name: string; town: string; postcode: string; address: string; event_date: string; start_time: string; end_time: string; notes: string; truck_id?: string; van_id?: string | null }

const SCHEDULE_TIME_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const totalMins = 7 * 60 + i * 30
  const h = Math.floor(totalMins / 60).toString().padStart(2, '0')
  const m = (totalMins % 60).toString().padStart(2, '0')
  return `${h}:${m}`
})

function applyStartTimeChange(newStart: string, currentEnd: string): { start_time: string; end_time: string } {
  if (!newStart) return { start_time: '', end_time: currentEnd }
  if (!currentEnd) {
    const [h, m] = newStart.split(':').map(Number)
    const clamped = Math.min(h * 60 + m + 180, 23 * 60)
    const autoEnd = `${Math.floor(clamped / 60).toString().padStart(2, '0')}:${(clamped % 60).toString().padStart(2, '0')}`
    return { start_time: newStart, end_time: autoEnd }
  }
  if (currentEnd <= newStart) return { start_time: newStart, end_time: '' }
  return { start_time: newStart, end_time: currentEnd }
}

function ScheduleTab({ isActive, truck, token, bundles, categories, api, reload, showToast, onSwitchTab, pendingVerifyEvents, onClearPendingVerify, onPendingCount, onEventsSaved }: {
  isActive: boolean; truck: Truck; token: string; bundles: Bundle[]; categories: Category[]
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: ShowToast
  onSwitchTab: (tab: Tab) => void
  pendingVerifyEvents?: any[] | null
  /** T1: fired after a SUCCESSFUL extracted-events save, and only when a caller supplied one.
   *  🔴 OPTIONAL, AND SETTINGS DOES NOT PASS IT. Settings' handleVerifyUrl calls onVerifySuccess with a
   *  single argument, so the page stores null and this arrives null — `onEventsSaved?.()` is then a
   *  no-op and Settings' save path runs exactly as it always has. Only the setup wizard supplies one,
   *  to advance itself to the settings-review step. */
  onEventsSaved?: (() => void) | null
  onClearPendingVerify?: () => void
  onPendingCount?: (n: number) => void
}) {
  const [events, setEvents] = useState<TruckEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [showEventCancelModal, setShowEventCancelModal] = useState(false)
  const [cancellingEvent, setCancellingEvent] = useState<TruckEvent | null>(null)
  const [eventCancelReason, setEventCancelReason] = useState('')
  const [eventCancelNote, setEventCancelNote] = useState('')
  const [affectedOrderCount, setAffectedOrderCount] = useState(0)
  const [editingEvent, setEditingEvent] = useState<EditingEvent | null>(null)
  const [editingEventConfirmOnSave, setEditingEventConfirmOnSave] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [editSaving, setEditSaving] = useState(false)
  const [vans, setVans] = useState<{ id: string; name: string }[]>([])
  // TRANSIENT VIEW STATE — a filter is a way of looking, not a setting. Deliberately NOT persisted to the
  // DB, localStorage or the URL: an operator who filters to Van 2 to check tomorrow must not come back
  // later to a schedule that silently hides half their events. Per-surface, and it resets on remount.
  const [vanFilter, setVanFilter] = useState<VanFilterValue>(VAN_FILTER_ALL)
  const [addMode, setAddMode] = useState<'manual' | 'upload'>('manual')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadText, setUploadText] = useState('')
  const [uploadProcessing, setUploadProcessing] = useState(false)
  const [extractedEvents, setExtractedEvents] = useState<any[]>([])
  const [editedEvents, setEditedEvents] = useState<any[]>([])
  const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set())
  const [editingEventIdx, setEditingEventIdx] = useState<number | null>(null)
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set())
  const [focusedEventIds, setFocusedEventIds] = useState<Set<string>>(new Set())
  const [savingExtracted, setSavingExtracted] = useState(false)
  const [exclusionTerms, setExclusionTerms] = useState<string[]>([])
  const [exclusionList, setExclusionList] = useState<{ id: string; term: string }[]>([])
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importModalTitle, setImportModalTitle] = useState('Import schedule')
  const { isDragging: isScheduleDragging, dragProps: scheduleDragProps } = useDragDrop(
    (file) => setUploadFile(file),
    ['image/*', '.pdf']
  )

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true)
    try {
      const res = await fetch(`/api/events/manage?token=${token}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEvents(data.events)
    } catch (e: any) { showToast(e.message || 'Failed to load events', 'error') }
    finally { setLoadingEvents(false) }
  }, [token])

  useEffect(() => { if (isActive) loadEvents() }, [isActive, loadEvents])
  // Keep the parent's Schedule badge/banner count live after approve/reject (optimistic setEvents).
  // Upcoming scraper-unconfirmed only — mirrors the "Needs your approval" list. Past-check inlined
  // (isPastEvent is defined later in render). Skipped while still loading (avoid a transient 0).
  useEffect(() => {
    if (!onPendingCount || loadingEvents) return
    const now = new Date()
    const n = events.filter(e =>
      e.status === 'unconfirmed' && e.source === 'scraper' &&
      (e.end_time ? now < new Date(`${e.event_date}T${e.end_time}`) : new Date(`${e.event_date}T23:59`) >= now)
    ).length
    onPendingCount(n)
  }, [events, loadingEvents, onPendingCount])
  useEffect(() => { if (isActive) api('get_vans').then(r => setVans((r.vans || []).map((v: any) => ({ id: v.id, name: v.name })))).catch(() => {}) }, [isActive])
  useEffect(() => {
    if (!isActive) return
    api('get_exclusion_terms').then(r => {
      const list = (r.terms || []) as { id: string; term: string }[]
      setExclusionList(list)
      setExclusionTerms(list.map((t: { id: string; term: string }) => t.term))
    }).catch(() => {})
  }, [isActive])

  useEffect(() => {
    if (!pendingVerifyEvents?.length) return
    const _seedToday = new Date().toISOString().split('T')[0]
    const evs = pendingVerifyEvents.map((e: any, i: number) => {
      const _p = (e.event_date || '').split('/')
      const _iso = _p.length === 3 ? `${_p[2]}-${_p[1].padStart(2,'0')}-${_p[0].padStart(2,'0')}` : ''
      return {
        ...e,
        id: `ev-${i}-${Date.now()}`,
        selected: !(_iso && _iso < _seedToday),
        _missingDate: !e.event_date,
        _missingVenue: !e.venue_name,
        _missingTime: !e.start_time || !e.end_time,
        _originalDate: e.event_date,
      }
    })
    setExtractedEvents(evs)
    setEditedEvents(evs)
    setSelectedEvents(new Set(evs.map((_: any, i: number) => i)))
    setExpandedEventIds(new Set())
    setFocusedEventIds(new Set(evs.filter((e: any) => e._missingDate || e._missingVenue || e._missingTime).map((e: any) => e.id)))
    setImportModalTitle('Events found on your website')
    setShowImportModal(true)
    onClearPendingVerify?.()
  }, [pendingVerifyEvents])

  const recentEvents = useMemo(() => {
    const seen = new Set<string>()
    return [...events]
      .filter(e => e.status === 'confirmed' || e.status === 'open')
      .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
      .filter(e => {
        const key = `${e.venue_name}-${e.town}`.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 5)
  }, [events])

  const venueSuggestions = useMemo(() => {
    const seen = new Set<string>()
    return [...events]
      .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
      .filter(e => {
        if (!e.venue_name) return false
        const key = e.venue_name.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 10)
      .map(e => ({
        venue_name: e.venue_name,
        town: e.town,
        postcode: e.postcode,
        address: e.address,
        start_time: e.start_time,
        end_time: e.end_time,
      }))
  }, [events])

  const handleCopyEvent = (event: TruckEvent) => {
    setEditingEvent({
      id: undefined,
      event_date: '',
      start_time: event.start_time?.substring(0, 5) || '',
      end_time: event.end_time?.substring(0, 5) || '',
      venue_name: event.venue_name || '',
      town: event.town || '',
      postcode: event.postcode || '',
      address: event.address || '',
      notes: '',
      van_id: event.van_id || null,
      truck_id: truck.id,
    })
    setFormErrors({})
    setTimeout(() => {
      document.getElementById('add-event-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const validateEventForm = (form: EditingEvent) => {
    const errors: Record<string, string> = {}
    if (!form.event_date) errors.event_date = 'Date is required'
    if (!form.venue_name?.trim()) errors.venue_name = 'Venue name is required'
    if (!form.start_time) errors.start_time = 'Start time is required'
    if (!form.end_time) errors.end_time = 'End time is required'
    if (vans.length > 1 && !form.van_id) errors.van_id = 'Please select a truck'
    return errors
  }

  const closeAddModal = () => {
    setEditingEvent(null)
    setEditingEventConfirmOnSave(false)
    setFormErrors({})
    setExtractedEvents([])
    setEditedEvents([])
    setSelectedEvents(new Set())
    setEditingEventIdx(null)
    setExpandedEventIds(new Set())
    setFocusedEventIds(new Set())
    setUploadFile(null)
    setUploadText('')
  }

  const closeImportModal = () => {
    setShowImportModal(false)
    setImportModalTitle('Import schedule')
    setUploadFile(null)
    setUploadText('')
    setExtractedEvents([])
    setEditedEvents([])
    setSelectedEvents(new Set())
    setEditingEventIdx(null)
    setExpandedEventIds(new Set())
    setFocusedEventIds(new Set())
  }

  const saveEdit = async () => {
    if (!editingEvent) return
    const errors = validateEventForm(editingEvent)
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return }
    setFormErrors({})
    setEditSaving(true)
    try {
      const { lat, lng } = await geocodeLocation(
        editingEvent.venue_name,
        editingEvent.town,
        editingEvent.postcode
      )
      if (lat === null || lng === null) {
        console.warn('Geocoding returned null for event:', editingEvent.venue_name, editingEvent.postcode)
      }
      await api('upsert_event', { ...editingEvent, latitude: lat, longitude: lng })
      if (editingEventConfirmOnSave && editingEvent.id) {
        await handleConfirmEvent(editingEvent.id)
        setEditingEventConfirmOnSave(false)
      } else {
        showToast(editingEvent.id ? 'Event updated' : 'Event added')
      }
      closeAddModal()
      await loadEvents()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setEditSaving(false) }
  }

  const processUpload = async () => {
    setUploadProcessing(true)
    const fd = new FormData()
    if (uploadFile) fd.append('file', uploadFile)
    if (uploadText) fd.append('text', uploadText)
    fd.append('token', token)
    const res = await fetch('/api/manage/process-schedule', { method: 'POST', body: fd })
    const data = await res.json()
    const raw = data.events || []
    const _seedToday = new Date().toISOString().split('T')[0]
    const evs = raw.map((e: any, i: number) => {
      const _p = (e.event_date || '').split('/')
      const _iso = _p.length === 3 ? `${_p[2]}-${_p[1].padStart(2,'0')}-${_p[0].padStart(2,'0')}` : ''
      return {
        ...e,
        id: `ev-${i}-${Date.now()}`,
        selected: !(_iso && _iso < _seedToday),
        _missingDate: !e.event_date,
        _missingVenue: !e.venue_name,
        _missingTime: !e.start_time || !e.end_time,
        _originalDate: e.event_date,
      }
    })
    setExtractedEvents(evs)
    setEditedEvents(evs)
    setSelectedEvents(new Set(evs.map((_: any, i: number) => i)))
    setExpandedEventIds(new Set())
    setFocusedEventIds(new Set(evs.filter((e: any) => e._missingDate || e._missingVenue || e._missingTime).map((e: any) => e.id)))
    setUploadProcessing(false)
  }

  const saveExtractedEvents = async (eventsToSave?: any[]) => {
    const toSave = eventsToSave ?? extractedEvents
    setSavingExtracted(true)
    try {
      for (const ev of toSave) {
        const parts = (ev.event_date || '').split('/')
        const isoDate = parts.length === 3
          ? `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
          : ev.event_date

        const { lat, lng } = (ev.town || ev.postcode)
          ? await geocodeLocation(ev.venue_name || '', ev.town || '', ev.postcode || '')
          : { lat: null, lng: null }

        if (lat === null || lng === null) {
          console.warn('Geocoding returned null for extracted event:', ev.venue_name)
        }

        await api('upsert_event', {
          venue_name: ev.venue_name || '',
          town: ev.town || '',
          postcode: ev.postcode || '',
          address: ev.address || '',
          event_date: isoDate,
          start_time: ev.start_time || '',
          end_time: ev.end_time || '',
          notes: ev.notes || '',
          latitude: lat,
          longitude: lng,
          truck_id: editingEvent?.truck_id || truck.id,
        })
      }
      const count = toSave.length
      await loadEvents()
      closeAddModal()
      setShowImportModal(false)
      showToast(`${count} event${count !== 1 ? 's' : ''} saved`)
      // T1: the ONLY line added to this function. Undefined/null for Settings (see the prop's note), so
      // for Gusto and RTF this is `undefined?.()` — evaluated, no-op, nothing else about the save
      // touched. Placed AFTER the toast so the wizard advances only once the events are genuinely in.
      onEventsSaved?.()
    } catch (e: any) { showToast(e.message || 'Failed to save events', 'error') }
    finally { setSavingExtracted(false) }
  }

  const handleConfirmEvent = async (eventId: string) => {
    // LIVE-TIME GATE (UX): a null-time event can't go live (server enforces too). Instead of a blocked
    // error, route the operator to Edit & Approve with the time field flagged — graceful, never broken.
    const evForTime = events.find(e => e.id === eventId)
    const openForFix = (ev: typeof evForTime, errors: Record<string, string>) => {
      if (!ev) return
      setEditingEventConfirmOnSave(true)
      setFormErrors(errors)
      setEditingEvent({ id: ev.id, venue_name: ev.venue_name, town: ev.town || '', postcode: ev.postcode || '', address: ev.address || '', event_date: ev.event_date, start_time: ev.start_time ? ev.start_time.substring(0, 5) : '', end_time: ev.end_time ? ev.end_time.substring(0, 5) : '', notes: ev.notes || '', truck_id: ev.truck_id || truck.id, van_id: ev.van_id || null })
    }
    if (evForTime && (!evForTime.start_time || !evForTime.end_time)) {
      showToast('Add a start and end time before approving — this event needs a time to go live.', 'error')
      openForFix(evForTime, { start_time: !evForTime.start_time ? 'Add a start time' : '', end_time: !evForTime.end_time ? 'Add an end time' : '' })
      return
    }
    // ── 🔴 LIVE-VAN GATE (UX) — SAME TREATMENT AS THE TIME GATE ABOVE ──────────────────────────────
    // 🔴 MANDATORY ONLY WHEN THERE IS A CHOICE. `vans.length > 1` is the same condition the edit modal
    // already uses to render the van selector at all: a one-van truck is never shown the field and is
    // never asked, because the SERVER auto-assigns its sole active van on confirm (getSoleActiveVanId).
    // Blocking a single-van truck would demand a choice the product does not offer it.
    // ⚠️ `vans` here is the truck's van list as Manage already holds it; the selector below reads the
    // same array, so the gate and the field can never disagree about whether there is a choice.
    //
    // 🔴 THIS IS NOT COSMETIC. `van_id` resolves KITCHEN CAPACITY at read time — with it null,
    // `kitchenCapacity` is null and lib/slot-availability.ts treats that as UNLIMITED, so a confirmed
    // van-less event takes orders with no capacity enforcement at all. Nine such events existed on
    // test-truck when this gate was written.
    // ⚠️ The server enforces the same rule and is the actual guard; this exists so the operator gets the
    // field flagged in Edit & Approve rather than a rejected request.
    if (evForTime && !evForTime.van_id && vans.length > 1) {
      showToast('Choose which truck is working this event before approving.', 'error')
      openForFix(evForTime, { van_id: 'Choose which truck is working this event' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/events/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'confirm',
          eventId,
          payload: {
            auto_open: truck.default_auto_open ?? true,
            auto_close: truck.default_auto_close ?? true,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, status: 'confirmed' as const } : e))
      showToast('Event confirmed')
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  // Conflict acknowledge gate: the event id whose Approve has been clicked while a conflict exists,
  // so the card shows the explicit "approve anyway" acknowledgement (warn-with-friction, not block).
  const [conflictAckId, setConflictAckId] = useState<string | null>(null)

  // Reject is now ONE click (no inline confirm) — immediate reject + a 5s undo toast. The rejected event
  // object is held in the toast closure so undo can re-insert it + call restore_rejected.
  const doRejectEvent = async (event: TruckEvent) => {
    setSaving(true)
    try {
      const res = await fetch('/api/events/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // suppress: true → server stores the event's scraped signature so it won't re-surface (Stage 3).
        body: JSON.stringify({ token, action: 'cancel', eventId: event.id, payload: { auto_open: false, auto_close: false, suppress: true } }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEvents(prev => prev.filter(e => e.id !== event.id))
      showToast('Event rejected', 'success', { duration: 5000, action: { label: '↩ Undo', run: () => undoRejectEvent(event) } })
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const handleRejectScrapedEvent = (event: TruckEvent) => doRejectEvent(event)

  // Undo a reject: restore_rejected reverts status 'cancelled'→'unconfirmed' AND deletes the suppress-
  // signature (so the event survives the next scrape — the non-negotiable). Then re-insert it optimistically
  // (the render re-sorts by date); a NULL signature would otherwise re-suppress it on the next scrape.
  const undoRejectEvent = async (event: TruckEvent) => {
    try {
      const res = await fetch('/api/events/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'restore_rejected', eventId: event.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEvents(prev => prev.some(e => e.id === event.id) ? prev : [...prev, { ...event, status: 'unconfirmed' as const }])
      showToast('Event restored')
    } catch (e: any) { showToast(e.message || 'Failed to restore', 'error') }
  }

  const openEventCancelModal = async (event: TruckEvent) => {
    setCancellingEvent(event)
    setAffectedOrderCount(0)
    setShowEventCancelModal(true)
    try {
      const res = await fetch(`/api/events/affected-orders?eventId=${event.id}&token=${token}`)
      const data = await res.json()
      if (res.ok) setAffectedOrderCount(data.count ?? 0)
    } catch { /* silently fail — modal still works, count just shows 0 */ }
  }

  const confirmCancelEvent = async () => {
    if (!cancellingEvent) return
    setShowEventCancelModal(false)
    try {
      const res = await fetch('/api/events/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'cancel',
          eventId: cancellingEvent.id,
          payload: { cancellationReason: eventCancelReason, cancellationNote: eventCancelNote },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEvents(prev => prev.filter(e => e.id !== cancellingEvent.id))
      const cancelled = data.cancelledOrders ?? 0
      showToast(cancelled > 0
        ? `Event cancelled · ${cancelled} order${cancelled !== 1 ? 's' : ''} cancelled`
        : 'Event cancelled')
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setCancellingEvent(null); setEventCancelReason(''); setEventCancelNote('') }
  }

  const handleEventDealToggle = async (eventId: string, bundleId: string, active: boolean) => {
    setEvents(prev => prev.map(e => {
      if (e.id !== eventId) return e
      const existing = e.event_deals?.find(d => d.bundle_id === bundleId)
      const updated = existing
        ? e.event_deals!.map(d => d.bundle_id === bundleId ? { ...d, active, overridden: true } : d)
        : [...(e.event_deals || []), { bundle_id: bundleId, active, overridden: true }]
      return { ...e, event_deals: updated }
    }))
    await api('update_event_deal', { eventId, bundleId, active })
  }

  const renderEvent = (event: TruckEvent, pending = false) => {
    const isPast = isPastEvent(event) || event.status === 'cancelled'
    // READ-TIME conflict check (no new column): for ANY event being CONFIRMED — the scraper approval
    // card (pending=true) AND the operator-added "Needs confirmation" card (pending=false, the inline
    // Confirm button). Both are status 'unconfirmed' candidates; the helper compares them against
    // existing same-date confirmed/open events and is source-agnostic. See lib/event-conflicts.ts.
    // Complementary to the inbound-schedule scrape dedup (untouched).
    const conflicts = event.status === 'unconfirmed' ? detectEventConflicts(event, events) : []
    const dateObj = new Date(event.event_date + 'T00:00:00')
    const dayName = dateObj.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()
    const dayNum = dateObj.getDate()
    const month = dateObj.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()

    return (
      <Card key={event.id}>
        <div className="px-4 py-3">
          {/* Main row: date | venue | status | actions */}
          <div className="flex items-start gap-4">

            {/* Date column — fixed width, calendar-style */}
            <div className="flex flex-col items-center justify-center w-12 flex-shrink-0 text-center pl-2">
              <span className="text-[10px] font-bold text-slate-400 leading-none">{dayName}</span>
              <span className="text-2xl font-black text-orange-600 leading-tight">{dayNum}</span>
              <span className="text-[10px] font-bold text-slate-400 leading-none">{month}</span>
            </div>

            {/* Divider */}
            <div className="w-px bg-slate-100 self-stretch flex-shrink-0" />

            {/* Venue / area & postcode / time — 3 lines */}
            <div className="flex-1 min-w-0">
              {/* Line 1: venue name (+ status) */}
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-slate-900">{event.venue_name}</p>
                <EventStatusBadge status={event.status} event_date={event.event_date} end_time={event.end_time} />
              </div>
              {/* Line 2: area & postcode */}
              {(event.town || event.postcode) && (
                <p className="text-xs text-slate-500 mt-0.5">{[event.town, event.postcode].filter(Boolean).join(' · ')}</p>
              )}
              {/* Line 3: time (+ van / truck) */}
              <p className="text-sm font-semibold text-slate-700 mt-0.5">
                {event.start_time && event.end_time && `${formatTime(event.start_time)}–${formatTime(event.end_time)}`}
                {/* ⚠ Time needed — a pending event with no time can't go live; flag it so the operator fixes it. */}
                {(!event.start_time || !event.end_time) && event.status === 'unconfirmed' && (
                  <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-[11px] font-bold">⚠ Time needed</span>
                )}
                {vans.length > 1 && event.van_id && ` · ${vans.find(v => v.id === event.van_id)?.name || ''}`}
              </p>
              {event.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">📝 {event.notes}</p>}
            </div>

            {/* Actions — confirmed cards keep their compact icon buttons right-aligned here.
                Pending (Approve/Edit/Reject) render in a full-width row BELOW the main row (see below),
                so the venue/area/time block above gets the full card width. */}
            {!pending && (
              <div className="flex items-center gap-1.5 flex-shrink-0 self-start">
                <>
                  {event.status === 'unconfirmed' && (
                    // SAME acknowledge gate as the scraper Approve button: with a conflict the first
                    // click reveals "confirm anyway" in the banner below (warn-with-friction); no
                    // conflict → confirms immediately. Keyed on event.id so cards don't collide.
                    <button disabled={!event.start_time || !event.end_time} title={(!event.start_time || !event.end_time) ? 'Set a time first' : undefined} onClick={() => { if (conflicts.length > 0 && conflictAckId !== event.id) { setConflictAckId(event.id) } else { handleConfirmEvent(event.id) } }} className="text-xs font-semibold text-green-700 border border-green-300 bg-white rounded-lg px-2 py-1.5 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed">
                      <span className="sm:hidden">✓</span>
                      <span className="hidden sm:inline">Confirm</span>
                    </button>
                  )}
                  <button onClick={() => { setAddMode('manual'); setExtractedEvents([]); handleCopyEvent(event) }} className="text-xs font-semibold text-slate-600 border border-slate-200 bg-white rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <span className="sm:hidden">⧉</span>
                    <span className="hidden sm:inline">Copy</span>
                  </button>
                  {!isPast && (
                    <>
                      <button onClick={() => { setFormErrors({}); setEditingEvent({ id: event.id, venue_name: event.venue_name, town: event.town || '', postcode: event.postcode || '', address: event.address || '', event_date: event.event_date, start_time: event.start_time ? event.start_time.substring(0, 5) : '', end_time: event.end_time ? event.end_time.substring(0, 5) : '', notes: event.notes || '', truck_id: event.truck_id || truck.id, van_id: event.van_id || null }) }} className="text-xs font-semibold text-slate-600 border border-slate-200 bg-white rounded-lg px-2 py-1.5 hover:bg-slate-50">
                        <span className="sm:hidden">✏</span>
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                      <button onClick={() => openEventCancelModal(event)} className="text-xs font-semibold text-red-600 border border-red-200 bg-white rounded-lg px-2 py-1.5 hover:bg-red-50">
                        <span className="sm:hidden">✕</span>
                        <span className="hidden sm:inline">Cancel</span>
                      </button>
                    </>
                  )}
                </>
              </div>
            )}

            {/* Pending (Approve/Edit/Reject) — DESKTOP: compact, right-aligned in the main row (keeps
                the card short). MOBILE keeps the full-width row below (sm:hidden there). Same handlers
                as that row, including the conflict-acknowledge gate on Approve. */}
            {pending && (
              <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0 self-start">
                <button disabled={!event.start_time || !event.end_time} title={(!event.start_time || !event.end_time) ? 'Set a time first' : undefined} onClick={() => { if (conflicts.length > 0 && conflictAckId !== event.id) { setConflictAckId(event.id) } else { handleConfirmEvent(event.id) } }} className="text-xs font-semibold text-green-700 border border-green-300 bg-white rounded-lg px-2 py-1.5 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed">Approve</button>
                {!isPast && (
                  <button onClick={() => { setEditingEventConfirmOnSave(true); setFormErrors({}); setEditingEvent({ id: event.id, venue_name: event.venue_name, town: event.town || '', postcode: event.postcode || '', address: event.address || '', event_date: event.event_date, start_time: event.start_time ? event.start_time.substring(0, 5) : '', end_time: event.end_time ? event.end_time.substring(0, 5) : '', notes: event.notes || '', truck_id: event.truck_id || truck.id, van_id: event.van_id || null }) }} className="text-xs font-semibold text-slate-600 border border-slate-200 bg-white rounded-lg px-2 py-1.5 hover:bg-slate-50">Edit</button>
                )}
                <button onClick={() => handleRejectScrapedEvent(event)} className="text-xs font-semibold text-red-600 border border-red-200 bg-white rounded-lg px-2 py-1.5 hover:bg-red-50">Reject</button>
              </div>
            )}
          </div>

          {/* Conflict warning — shown when this unconfirmed event (scraper card OR operator-added
              card) clashes with an existing confirmed/open event. `conflicts` is non-empty only for
              status 'unconfirmed', so this is NOT gated on `pending` — it renders below the main row
              for BOTH card types. Lists each conflicting event's details (venue/date/time/postcode)
              for side-by-side comparison; the Approve/Confirm action requires an explicit acknowledge
              (warn-with-friction, never hard-blocked). */}
          {conflicts.length > 0 && (
            <div className="mt-3 px-3 py-2.5 bg-amber-50 border border-amber-300 rounded-lg text-sm">
              <p className="font-bold text-amber-800 mb-1.5">⚠️ Possible conflict{conflicts.length !== 1 ? 's' : ''} — review before {pending ? 'approving' : 'confirming'}</p>
              <div className="space-y-2">
                {conflicts.map((c, i) => (
                  <div key={`${c.event.id}-${i}`} className="text-amber-900">
                    <p>{c.message}</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Already on your schedule: <strong>{c.event.venue_name || 'Unnamed venue'}</strong>
                      {` · ${new Date(`${c.event.event_date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                      {(c.event.start_time || c.event.end_time) ? ` · ${(c.event.start_time || '').slice(0, 5)}–${(c.event.end_time || '').slice(0, 5)}` : ''}
                      {c.event.postcode ? ` · ${c.event.postcode}` : ''}
                      {` (${c.event.status})`}
                    </p>
                  </div>
                ))}
              </div>
              {conflictAckId === event.id && (
                <div className="flex flex-wrap gap-2 mt-2.5">
                  <button onClick={() => { handleConfirmEvent(event.id); setConflictAckId(null) }} className="text-xs font-semibold px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700">Yes, these are different events — {pending ? 'approve' : 'confirm'} anyway</button>
                  <button onClick={() => setConflictAckId(null)} className="text-xs font-medium px-3 py-1.5 border border-amber-300 bg-white rounded-lg hover:bg-amber-100">Cancel</button>
                </div>
              )}
            </div>
          )}

          {/* Pending approval actions — MOBILE ONLY now (sm:hidden): full-width row beneath the text,
              flex-1 buttons, ≥16px text (iOS rule). On desktop these live compact in the main row above
              (hidden sm:flex), so the card stays short. */}
          {pending && (
            <div className="flex sm:hidden gap-2 mt-3">
              {/* Approve: with a conflict, the FIRST click reveals the acknowledge in the banner
                  above (warn-with-friction); the explicit "approve anyway" there confirms. No conflict
                  → confirms immediately. */}
              <button disabled={!event.start_time || !event.end_time} title={(!event.start_time || !event.end_time) ? 'Set a time first' : undefined} onClick={() => { if (conflicts.length > 0 && conflictAckId !== event.id) { setConflictAckId(event.id) } else { handleConfirmEvent(event.id) } }} className="flex-1 sm:flex-none text-center text-base sm:text-xs font-semibold text-green-700 border border-green-300 bg-white rounded-lg px-3 py-2 sm:py-1.5 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed">Approve</button>
              {!isPast && (
                <button onClick={() => { setEditingEventConfirmOnSave(true); setFormErrors({}); setEditingEvent({ id: event.id, venue_name: event.venue_name, town: event.town || '', postcode: event.postcode || '', address: event.address || '', event_date: event.event_date, start_time: event.start_time ? event.start_time.substring(0, 5) : '', end_time: event.end_time ? event.end_time.substring(0, 5) : '', notes: event.notes || '', truck_id: event.truck_id || truck.id, van_id: event.van_id || null }) }} className="flex-1 sm:flex-none text-center text-base sm:text-xs font-semibold text-slate-600 border border-slate-200 bg-white rounded-lg px-3 py-2 sm:py-1.5 hover:bg-slate-50">Edit</button>
              )}
              <button onClick={() => handleRejectScrapedEvent(event)} className="flex-1 sm:flex-none text-center text-base sm:text-xs font-semibold text-red-600 border border-red-200 bg-white rounded-lg px-3 py-2 sm:py-1.5 hover:bg-red-50">Reject</button>
            </div>
          )}

          {/* Deals — collapsed by default, expand on tap */}
          {!isPast && bundles.length > 0 && (() => {
            const activeDeals = bundles.filter(bundle => {
              const eventDeal = event.event_deals?.find(d => d.bundle_id === bundle.id)
              return eventDeal ? eventDeal.active : bundle.apply_to_new_events
            })
            const hiddenDeals = activeDeals.filter(b => b.stock_warning)
            const dealNames = activeDeals.map(b => b.name).join(' · ')
            const dealLabel = activeDeals.length === 0
              ? 'No deals active'
              : `${activeDeals.length} deal${activeDeals.length !== 1 ? 's' : ''} active · ${dealNames}${hiddenDeals.length > 0 ? ` · ${hiddenDeals.length} hidden` : ''}`

            return (
              <details className="mt-2 border-t border-slate-50 pt-2 group">
                <summary className="text-xs text-slate-400 cursor-pointer select-none hover:text-slate-600 list-none flex items-center gap-1">
                  <span className="transition-transform group-open:rotate-90 inline-block text-slate-300">▶</span>
                  <span>{dealLabel}</span>
                </summary>
                <div className="mt-2 space-y-1">
                  {bundles.map(bundle => {
                    const eventDeal = event.event_deals?.find(d => d.bundle_id === bundle.id)
                    const isActive = eventDeal ? eventDeal.active : bundle.apply_to_new_events
                    return (
                      <div key={bundle.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-700 truncate">{bundle.name}</span>
                            <span className="text-xs text-slate-400">£{bundle.bundle_price.toFixed(2)}</span>
                            {bundle.stock_warning && <span className="text-xs text-amber-600">⚠️ Stock</span>}
                          </div>
                          {bundle.stock_warning && <p className="text-xs text-amber-600 mt-0.5">Hidden — {bundle.stock_warning}</p>}
                        </div>
                        <button
                          onClick={() => handleEventDealToggle(event.id, bundle.id, !isActive)}
                          className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ml-3 ${isActive ? 'bg-green-500' : 'bg-slate-300'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isActive ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </details>
            )
          })()}
        </div>
      </Card>
    )
  }

  const filteredVenueSuggestions = editingEvent?.venue_name
    ? venueSuggestions.filter(v => v.venue_name.toLowerCase().includes(editingEvent.venue_name.toLowerCase()))
    : venueSuggestions

  if (loadingEvents && isActive) return (
    <div className="flex items-center justify-center py-12"><Spinner /></div>
  )

  const now = new Date()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  // isPastEvent uses new Date(`${event.event_date}T${event.end_time}`) — local time parse
  // Do NOT use new Date(event.event_date) — that parses as UTC midnight and breaks
  // today's date comparison in BST (and any UTC+ timezone)
  // DB status is never auto-written after event ends — all past detection is client-side
  const isPastEvent = (e: TruckEvent) =>
    e.end_time ? now > new Date(`${e.event_date}T${e.end_time}`) : new Date(e.event_date) < today
  // Single-truck console: events are already token-scoped to this truck (events/manage). No truck filter.
  // ── VAN FILTER — CLIENT-SIDE, APPLIED ONCE, HERE (V9.6) ───────────────────────────────────────────
  // Filtering the ALREADY-FETCHED array rather than refetching: the events are all in memory, the filter
  // is a view concern, and a refetch would put a network round-trip behind a dropdown that should feel
  // instant. One filter here feeds BOTH `upcoming` and `past`, so every downstream list (open,
  // scraper-unconfirmed, operator-unconfirmed, confirmed, other, past) narrows consistently — there is
  // no second place to forget.
  // 🔴 `events` ITSELF IS DELIBERATELY NOT FILTERED. Two consumers must see the whole truck:
  //   • detectEventConflicts(event, events) — a double-booking against a van you have filtered OUT is
  //     still a double-booking. Filtering here would hide exactly the conflict worth seeing.
  //   • the onPendingCount effect feeding the parent's Schedule badge — a view filter must never change
  //     a count that says "these need your attention".
  const vanFilteredEvents = events.filter(e => matchesVanFilter(e.van_id, vanFilter))
  const hasUnassignedEvents = events.some(e => !e.van_id)
  const upcoming = vanFilteredEvents.filter(e => e.status !== 'cancelled' && !isPastEvent(e))
  // Past events list most-recent FIRST (descending), working backwards. Upcoming/confirmed stay
  // soonest-first (ascending, source order) — deliberately not re-sorted here.
  const past = vanFilteredEvents
    .filter(e => isPastEvent(e) || e.status === 'cancelled')
    .sort((a, b) => {
      const ka = `${a.event_date}T${a.end_time || a.start_time || '00:00'}`
      const kb = `${b.event_date}T${b.end_time || b.start_time || '00:00'}`
      return kb.localeCompare(ka)
    })
  const unconfirmedEvents = upcoming.filter(e => e.status === 'unconfirmed')
  const scraperUnconfirmed = unconfirmedEvents.filter(e => e.source === 'scraper')
  const operatorUnconfirmed = unconfirmedEvents.filter(e => e.source !== 'scraper')
  const confirmedEvents = upcoming.filter(e => e.status === 'confirmed')
  const openEvents = upcoming.filter(e => e.status === 'open')
  const otherUpcoming = upcoming.filter(e => !['unconfirmed', 'confirmed', 'open'].includes(e.status))

  const renderScheduleReview = (onCancel: () => void) => {
    const isEv = (e: any) => !e.event_date || !e.venue_name || !e.start_time
    const needsAttention = (e: any) => !e.event_date || !e.venue_name || !e.start_time || !e.end_time

    const todayStr = new Date().toISOString().split('T')[0]
    const parseDDMMYYYY = (s: string): string => {
      if (!s) return ''
      const [d, m, y] = s.split('/')
      if (!d || !m || !y) return ''
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
    }
    const sortByDate = (evs: any[]) => [...evs].sort((a, b) => {
      const ia = parseDDMMYYYY(a.event_date), ib = parseDDMMYYYY(b.event_date)
      if (!ia) return 1; if (!ib) return -1
      return ia.localeCompare(ib)
    })

    const includedEvents = editedEvents.filter(ev => !isExcluded(ev.venue_name || '', exclusionTerms))
    const excludedEvents = editedEvents.filter(ev => isExcluded(ev.venue_name || '', exclusionTerms))

    const futureIncluded = includedEvents.filter(ev => {
      const iso = parseDDMMYYYY(ev._originalDate ?? ev.event_date)
      return !iso || iso >= todayStr
    })
    const historicalIncluded = includedEvents.filter(ev => {
      const iso = parseDDMMYYYY(ev._originalDate ?? ev.event_date)
      return iso && iso < todayStr
    })
    const sortedFuture = sortByDate(futureIncluded)
    const sortedHistorical = sortByDate(historicalIncluded)

    const selectedEvts = includedEvents.filter(e => e.selected)
    const incompleteSelected = selectedEvts.filter(isEv)
    const attentionSelected = selectedEvts.filter(needsAttention)
    const saveCount = selectedEvts.filter(e => !isEv(e)).length
    const canSave = incompleteSelected.length === 0 && saveCount > 0

    const updateEvent = (id: string, patch: any) => {
      setEditedEvents(prev => prev.map(e => {
        if (e.id !== id) return e
        if ('event_date' in patch) {
          const iso = parseDDMMYYYY(patch.event_date)
          const updated = { ...e, ...patch }
          if (iso && iso >= todayStr) updated.selected = true
          else if (iso && iso < todayStr) updated.selected = false
          return updated
        }
        if ('start_time' in patch) {
          const { start_time, end_time } = applyStartTimeChange(patch.start_time, e.end_time)
          return { ...e, ...patch, start_time, end_time }
        }
        return { ...e, ...patch }
      }))
    }
    const toggleSelected = (id: string) =>
      setEditedEvents(prev => prev.map(e => e.id === id ? { ...e, selected: !e.selected } : e))
    const setPendingDelete = (id: string, value: boolean) =>
      setEditedEvents(prev => prev.map(e => e.id === id ? { ...e, _pendingDelete: value } : e))
    const removeEvent = (id: string) =>
      setEditedEvents(prev => prev.filter(e => e.id !== id))
    const handleDeleteWithExclusion = async (ev: any) => {
      try {
        const res = await api('add_exclusion_term', { term: ev.venue_name })
        setExclusionList(prev => [...prev, { id: res.id ?? '', term: ev.venue_name }])
        setExclusionTerms(prev => [...prev, ev.venue_name])
        removeEvent(ev.id)
        showToast('Removed and excluded from future imports')
      } catch { removeEvent(ev.id) }
    }
    const handleDeleteOnly = (ev: any) => removeEvent(ev.id)
    const handleAddBack = async (ev: any) => {
      const match = exclusionList.find(t => t.term === ev.venue_name || isExcluded(ev.venue_name, [t.term]))
      if (match?.id) {
        try { await api('remove_exclusion_term', { id: match.id }) } catch { /* continue */ }
      }
      if (match?.term) {
        setExclusionTerms(prev => prev.filter(t => t !== match.term))
        setExclusionList(prev => prev.filter(t => t.term !== match.term))
      }
      showToast('Added back — exclusion removed')
    }
    const expandToEdit = (id: string) =>
      setExpandedEventIds(prev => { const n = new Set(prev); n.add(id); return n })

    const getFriendlyDate = (ev: any) => {
      const p = (ev.event_date || '').split('/')
      if (p.length !== 3) return ev.event_date || ''
      const d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const day = d.getDate()
      const nth = (day > 3 && day < 21) ? 'th' : ['th','st','nd','rd','th','th','th','th','th','th'][day % 10]
      return `${days[d.getDay()]} ${day}${nth} ${months[d.getMonth()]}`
    }
    const getDateVal = (ev: any) => {
      const p = (ev.event_date || '').split('/')
      return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : ev.event_date || ''
    }
    const getMissingLabel = (ev: any) => {
      if (!ev.event_date) return 'Add date'
      if (!ev.venue_name) return 'Add venue'
      if (!ev.start_time) return 'Add start time'
      if (!ev.end_time) return 'Add end time'
      return ''
    }

    const TrashBtn = ({ id }: { id: string }) => (
      <button type="button" onClick={() => setPendingDelete(id, true)} className="text-slate-400 hover:text-red-600" aria-label="Remove">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    )
    const Checkbox = ({ id, checked, disabled }: { id: string; checked: boolean; disabled?: boolean }) => (
      <button type="button" onClick={disabled ? undefined : () => toggleSelected(id)} className={`w-[18px] h-[18px] rounded border-2 flex-shrink-0 flex items-center justify-center ${checked ? 'bg-orange-600 border-orange-600' : 'border-slate-300 bg-white'} ${disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`} aria-label={checked ? 'Deselect' : 'Select'}>
        {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </button>
    )

    return (
      <div className="flex flex-col gap-3">
        {attentionSelected.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <span className="text-amber-600">⚠</span>
            <span className="text-sm text-amber-700 font-medium">
              {attentionSelected.length} event{attentionSelected.length !== 1 ? 's' : ''} need{attentionSelected.length === 1 ? 's' : ''} attention before saving
            </span>
          </div>
        )}

        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-2">
          {(() => {
            const renderMobileCard = (ev: any, isHistorical: boolean) => {
            const canEdit = ev.selected || isHistorical
            const rowAmber = !ev.event_date || !ev.venue_name || !ev.start_time || !ev.end_time
            const stateC = expandedEventIds.has(ev.id)
            const stateB = focusedEventIds.has(ev.id) && !stateC
            const dateLabel = getFriendlyDate(ev)
            const timeLabel = ev.start_time
              ? `${formatTime(ev.start_time)}${ev.end_time ? `–${formatTime(ev.end_time)}` : ''}`
              : null
            const dateVal = getDateVal(ev)

            const fieldCls = (amber: boolean) => `bg-white border rounded-lg px-3 py-2.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-400 ${amber ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`
            const endTimeOptions = ev.start_time ? SCHEDULE_TIME_OPTIONS.filter(t => t > ev.start_time) : SCHEDULE_TIME_OPTIONS
            const timePair = (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-xs font-medium mb-1 block ${!ev.start_time ? 'text-amber-600' : 'text-slate-500'}`}>Start time</label>
                  <select value={ev.start_time || ''} onChange={e => updateEvent(ev.id, { start_time: e.target.value })} className={fieldCls(!ev.start_time)}>
                    <option value="">— : —</option>
                    {SCHEDULE_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`text-xs font-medium mb-1 block ${!ev.end_time ? 'text-amber-600' : 'text-slate-500'}`}>End time</label>
                  <select value={ev.end_time || ''} onChange={e => updateEvent(ev.id, { end_time: e.target.value })} className={fieldCls(!ev.end_time)}>
                    <option value="">— : —</option>
                    {endTimeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            )

            return (
              <div key={ev.id}
                className={`border border-slate-200 overflow-hidden ${stateB ? 'border-l-[3px] border-l-amber-400' : ''} ${!ev.selected && !isHistorical ? 'opacity-40' : ''} ${isHistorical ? 'opacity-70' : ''}`}
                style={{ borderRadius: stateB ? '0 10px 10px 0' : '10px' }}>

                {/* Summary — always visible */}
                <div className="flex items-start gap-2 p-3">
                  <Checkbox id={ev.id} checked={ev.selected} disabled={isHistorical && !ev.selected} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold leading-snug ${!ev.start_time || !ev.event_date ? 'text-amber-600' : 'text-slate-900'}`}>
                          {ev.event_date ? dateLabel : 'No date'}{timeLabel ? ` · ${timeLabel}` : ' · time missing'}
                        </p>
                        <p className="text-sm text-slate-900 break-words">{ev.venue_name || <span className="text-amber-600">Add venue</span>}</p>
                        {(ev.town || ev.postcode) && <p className="text-xs text-slate-500">{[ev.town, ev.postcode].filter(Boolean).join(' · ')}</p>}
                      </div>
                      <div className="flex items-center flex-shrink-0 pt-0.5">
                        {/* Edit in State A and State B — not in State C */}
                        {!stateC && (
                          <>
                            <button type="button" disabled={!canEdit} onClick={() => expandToEdit(ev.id)} className={`text-xs font-medium text-slate-600 border border-slate-200 rounded px-2.5 py-1 leading-5 ${!canEdit ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50'}`}>
                              Edit
                            </button>
                            <span className="mx-3 text-slate-200 select-none">|</span>
                          </>
                        )}
                        <TrashBtn id={ev.id} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* State B — only the fields that were missing on load (snapshotted flags) */}
                {stateB && canEdit && (
                  <div className="border-t border-slate-100 px-3 pb-3 pt-2 space-y-3">
                    {ev._missingDate && (
                      <div className="relative">
                        <label className={`text-xs font-medium mb-1 block ${!ev.event_date ? 'text-amber-600' : 'text-slate-500'}`}>Date</label>
                        <div onClick={() => { const el = document.getElementById(`m-date-${ev.id}`) as HTMLInputElement | null; el?.showPicker?.() || el?.click() }} className={`w-full border rounded-lg px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between ${!ev.event_date ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                          <span className={ev.event_date ? 'text-slate-800 font-medium' : 'text-amber-600'}>{dateLabel || 'Select date'}</span>
                          <span className="text-slate-400 text-xs">📅</span>
                        </div>
                        <input id={`m-date-${ev.id}`} type="date" value={dateVal} onChange={e => { const d = e.target.value.split('-'); updateEvent(ev.id, { event_date: d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : e.target.value }) }} className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" />
                      </div>
                    )}
                    {ev._missingVenue && (
                      <div>
                        <label className={`text-xs font-medium mb-1 block ${!ev.venue_name ? 'text-amber-600' : 'text-slate-500'}`}>Venue</label>
                        <input type="text" value={ev.venue_name || ''} onChange={e => updateEvent(ev.id, { venue_name: e.target.value })} placeholder="Venue name" className={fieldCls(!ev.venue_name)} />
                      </div>
                    )}
                    {ev._missingTime && timePair}
                    {vans.length > 1 && !ev.van_id && (
                      <div>
                        <label className={`text-xs font-medium mb-1 block ${!ev.van_id ? 'text-amber-600' : 'text-slate-500'}`}>Van</label>
                        <select value={ev.van_id || ''} onChange={e => updateEvent(ev.id, { van_id: e.target.value || undefined })} className={fieldCls(!ev.van_id)}>
                          <option value="">Select a van</option>
                          {vans.map(van => <option key={van.id} value={van.id}>{van.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* State C — all fields, no Done button */}
                {stateC && canEdit && (
                  <div className="border-t border-slate-100 px-3 pb-3 pt-2 space-y-3">
                    <div className="relative">
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Date</label>
                      <div onClick={() => { const el = document.getElementById(`m-date-${ev.id}`) as HTMLInputElement | null; el?.showPicker?.() || el?.click() }} className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between">
                        <span className={ev.event_date ? 'text-slate-800 font-medium' : 'text-slate-400'}>{dateLabel || 'Select date'}</span>
                        <span className="text-slate-400 text-xs">📅</span>
                      </div>
                      <input id={`m-date-${ev.id}`} type="date" value={dateVal} onChange={e => { const d = e.target.value.split('-'); updateEvent(ev.id, { event_date: d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : e.target.value }) }} className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Venue</label>
                      <input type="text" value={ev.venue_name || ''} onChange={e => updateEvent(ev.id, { venue_name: e.target.value })} placeholder="Venue name" className={fieldCls(!ev.venue_name)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Area</label>
                      <input type="text" value={ev.town || ''} onChange={e => updateEvent(ev.id, { town: e.target.value })} placeholder="Area" className={fieldCls(false)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Postcode</label>
                      <input type="text" value={ev.postcode || ''} onChange={e => updateEvent(ev.id, { postcode: e.target.value.toUpperCase() })} placeholder="Postcode" className={`${fieldCls(false)} uppercase`} />
                    </div>
                    {timePair}
                    {vans.length > 1 && (
                      <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Van</label>
                        <select value={ev.van_id || ''} onChange={e => updateEvent(ev.id, { van_id: e.target.value || undefined })} className={fieldCls(false)}>
                          <option value="">Select a van</option>
                          {vans.map(van => <option key={van.id} value={van.id}>{van.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              {/* Pending-delete confirmation */}
              {ev._pendingDelete && (
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 text-sm text-slate-600">
                  <p className="font-medium mb-2">Exclude &ldquo;{ev.venue_name}&rdquo; from future imports?</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleDeleteWithExclusion(ev)} className="text-xs font-medium px-3 py-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900">
                      Yes, exclude
                    </button>
                    <button type="button" onClick={() => handleDeleteOnly(ev)} className="text-xs font-medium px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50">
                      Just remove this one
                    </button>
                    <button type="button" onClick={() => setPendingDelete(ev.id, false)} className="text-xs text-slate-400 px-2 py-1.5 hover:text-slate-600 ml-auto">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              </div>
            )
            } // end renderMobileCard

            return (
              <>
                {sortedFuture.map(ev => renderMobileCard(ev, false))}
                {sortedHistorical.length > 0 && (
                  <div className="mt-2">
                    <div className="px-1 mb-1.5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Past dates — update to save</p>
                      <p className="text-xs text-slate-400 mt-0.5">These events have already passed. Update the date to a future date to include them.</p>
                    </div>
                    {sortedHistorical.map(ev => renderMobileCard(ev, true))}
                  </div>
                )}
              </>
            )
          })()}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '32px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '220px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              {vans.length > 1 && <col style={{ width: '120px' }} />}
              <col style={{ width: '36px' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-2" />
                <th className="text-xs font-medium text-slate-500 text-left px-1.5 pb-2">Date</th>
                <th className="text-xs font-medium text-slate-500 text-left px-1.5 pb-2">Venue</th>
                <th className="text-xs font-medium text-slate-500 text-left px-1.5 pb-2">Area</th>
                <th className="text-xs font-medium text-slate-500 text-left px-1.5 pb-2">Postcode</th>
                <th className="text-xs font-medium text-slate-500 text-left px-1.5 pb-2">Start</th>
                <th className="text-xs font-medium text-slate-500 text-left px-1.5 pb-2">End</th>
                {vans.length > 1 && <th className="text-xs font-medium text-slate-500 text-left px-1.5 pb-2">Van</th>}
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {(() => {
                const renderDesktopRow = (ev: any, isHistorical: boolean) => {
                const incomplete = isEv(ev)
                const rowAmber = !ev.event_date || !ev.venue_name || !ev.start_time || !ev.end_time
                const missingDate = !ev.event_date
                const missingVenue = !ev.venue_name
                const missingStart = !ev.start_time
                const missingEnd = !ev.end_time
                const dateVal = getDateVal(ev)
                const dateLabel = getFriendlyDate(ev)
                const ci = (missing: boolean) => `bg-transparent border-b text-sm text-slate-900 px-1.5 py-2 w-full rounded-none focus:outline-none ${missing ? 'border-b-amber-400 bg-amber-50' : 'border-b-slate-200 hover:border-b-slate-400 hover:bg-slate-50 focus:border-b-orange-500 focus:bg-slate-50 focus:rounded'}`
                const endTimeOptions = ev.start_time ? SCHEDULE_TIME_OPTIONS.filter(t => t > ev.start_time) : SCHEDULE_TIME_OPTIONS
                return (
                  <Fragment key={ev.id}>
                  <tr className={`${rowAmber ? 'bg-amber-50' : isHistorical ? 'bg-slate-50' : 'bg-white'} ${!ev.selected && !isHistorical ? 'opacity-35' : ''} ${isHistorical ? 'opacity-70' : ''}`}>
                    <td className="px-2 py-1 align-middle">
                      <Checkbox id={ev.id} checked={ev.selected} disabled={isHistorical && !ev.selected} />
                    </td>
                    <td className="px-0 py-0 align-middle" style={{ pointerEvents: isHistorical || ev.selected ? 'auto' : 'none' }}>
                      <div className="relative">
                        <div onClick={() => { const el = document.getElementById(`d-date-${ev.id}`) as HTMLInputElement | null; el?.showPicker?.() || el?.click() }} className={`text-sm px-1.5 cursor-pointer flex items-center ${missingDate ? 'text-amber-600 bg-amber-50 border-b border-amber-400' : 'text-slate-900 hover:bg-slate-50 border-b border-b-slate-200 hover:border-b-slate-400'}`} style={{ minHeight: '48px' }}>
                          {dateLabel || <span className="italic text-xs text-amber-400">Add date</span>}
                        </div>
                        <input id={`d-date-${ev.id}`} type="date" value={dateVal} onChange={e => { const d = e.target.value.split('-'); updateEvent(ev.id, { event_date: d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : e.target.value }) }} className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" />
                      </div>
                    </td>
                    <td className="px-0 py-0 align-middle" style={{ pointerEvents: isHistorical || ev.selected ? 'auto' : 'none' }}>
                      <input type="text" value={ev.venue_name || ''} onChange={e => updateEvent(ev.id, { venue_name: e.target.value })} placeholder="Venue name" className={ci(missingVenue)} style={{ minHeight: '48px' }} />
                    </td>
                    <td className="px-0 py-0 align-middle" style={{ pointerEvents: isHistorical || ev.selected ? 'auto' : 'none' }}>
                      <input type="text" value={ev.town || ''} onChange={e => updateEvent(ev.id, { town: e.target.value })} placeholder="Area" className={ci(false)} style={{ minHeight: '48px' }} />
                    </td>
                    <td className="px-0 py-0 align-middle" style={{ pointerEvents: isHistorical || ev.selected ? 'auto' : 'none' }}>
                      <input type="text" value={ev.postcode || ''} onChange={e => updateEvent(ev.id, { postcode: e.target.value.toUpperCase() })} placeholder="CB22 5EJ" className={`${ci(false)} uppercase`} style={{ minHeight: '48px' }} />
                    </td>
                    <td className="px-0 py-0 align-middle" style={{ pointerEvents: isHistorical || ev.selected ? 'auto' : 'none' }}>
                      <select value={ev.start_time || ''} onChange={e => updateEvent(ev.id, { start_time: e.target.value })} className={ci(missingStart)} style={{ minHeight: '48px' }}>
                        <option value="">—:—</option>
                        {SCHEDULE_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-0 py-0 align-middle" style={{ pointerEvents: isHistorical || ev.selected ? 'auto' : 'none' }}>
                      <select value={ev.end_time || ''} onChange={e => updateEvent(ev.id, { end_time: e.target.value })} className={ci(missingEnd)} style={{ minHeight: '48px' }}>
                        <option value="">—:—</option>
                        {endTimeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    {vans.length > 1 && (
                      <td className="px-0 py-0 align-middle" style={{ pointerEvents: isHistorical || ev.selected ? 'auto' : 'none' }}>
                        <select value={ev.van_id || ''} onChange={e => updateEvent(ev.id, { van_id: e.target.value || undefined })} className={`${ci(false)} bg-transparent`} style={{ minHeight: '48px' }}>
                          <option value="">Select</option>
                          {vans.map(van => <option key={van.id} value={van.id}>{van.name}</option>)}
                        </select>
                      </td>
                    )}
                    <td className="px-2 py-1 align-middle text-center">
                      <TrashBtn id={ev.id} />
                    </td>
                  </tr>
                  {ev._pendingDelete ? (
                    <tr>
                      <td colSpan={vans.length > 1 ? 9 : 8} className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-sm text-slate-600">
                        <span className="font-medium mr-3">Exclude &ldquo;{ev.venue_name}&rdquo; from future imports?</span>
                        <button type="button" onClick={() => handleDeleteWithExclusion(ev)} className="text-xs font-medium px-2.5 py-1 bg-slate-800 text-white rounded-lg hover:bg-slate-900 mr-2">Yes, exclude</button>
                        <button type="button" onClick={() => handleDeleteOnly(ev)} className="text-xs font-medium px-2.5 py-1 border border-slate-200 rounded-lg hover:bg-white mr-2">Just remove</button>
                        <button type="button" onClick={() => setPendingDelete(ev.id, false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                )
                } // end renderDesktopRow
                return sortedFuture.map(ev => renderDesktopRow(ev, false))
              })()}
            </tbody>
            {sortedHistorical.length > 0 && (
              <>
                <tbody>
                  <tr>
                    <td colSpan={vans.length > 1 ? 9 : 8} className="pt-4 pb-1 px-1.5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Past dates — update to save</p>
                    </td>
                  </tr>
                </tbody>
                <tbody>
                  {sortedHistorical.map(ev => (() => {
                    const incomplete = isEv(ev)
                    const rowAmber = !ev.event_date || !ev.venue_name || !ev.start_time || !ev.end_time
                    const missingDate = !ev.event_date
                    const missingVenue = !ev.venue_name
                    const missingStart = !ev.start_time
                    const missingEnd = !ev.end_time
                    const dateVal = getDateVal(ev)
                    const dateLabel = getFriendlyDate(ev)
                    const ci = (missing: boolean) => `bg-transparent border-b text-sm text-slate-900 px-1.5 py-2 w-full rounded-none focus:outline-none ${missing ? 'border-b-amber-400 bg-amber-50' : 'border-b-slate-200 hover:border-b-slate-400 hover:bg-slate-50 focus:border-b-orange-500 focus:bg-slate-50 focus:rounded'}`
                    const endTimeOptions = ev.start_time ? SCHEDULE_TIME_OPTIONS.filter(t => t > ev.start_time) : SCHEDULE_TIME_OPTIONS
                    return (
                      <Fragment key={ev.id}>
                      <tr className={`bg-slate-50 opacity-70`}>
                        <td className="px-2 py-1 align-middle">
                          <Checkbox id={ev.id} checked={ev.selected} disabled={!ev.selected} />
                        </td>
                        <td className="px-0 py-0 align-middle">
                          <div className="relative">
                            <div onClick={() => { const el = document.getElementById(`d-date-${ev.id}`) as HTMLInputElement | null; el?.showPicker?.() || el?.click() }} className={`text-sm px-1.5 cursor-pointer flex items-center ${missingDate ? 'text-amber-600 bg-amber-50 border-b border-amber-400' : 'text-slate-900 hover:bg-slate-50 border-b border-b-slate-200 hover:border-b-slate-400'}`} style={{ minHeight: '48px' }}>
                              {dateLabel || <span className="italic text-xs text-amber-400">Add date</span>}
                            </div>
                            <input id={`d-date-${ev.id}`} type="date" value={dateVal} onChange={e => { const d = e.target.value.split('-'); updateEvent(ev.id, { event_date: d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : e.target.value }) }} className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" />
                          </div>
                        </td>
                        <td className="px-0 py-0 align-middle"><input type="text" value={ev.venue_name || ''} onChange={e => updateEvent(ev.id, { venue_name: e.target.value })} placeholder="Venue name" className={ci(missingVenue)} style={{ minHeight: '48px' }} /></td>
                        <td className="px-0 py-0 align-middle"><input type="text" value={ev.town || ''} onChange={e => updateEvent(ev.id, { town: e.target.value })} placeholder="Area" className={ci(false)} style={{ minHeight: '48px' }} /></td>
                        <td className="px-0 py-0 align-middle"><input type="text" value={ev.postcode || ''} onChange={e => updateEvent(ev.id, { postcode: e.target.value.toUpperCase() })} placeholder="CB22 5EJ" className={`${ci(false)} uppercase`} style={{ minHeight: '48px' }} /></td>
                        <td className="px-0 py-0 align-middle">
                          <select value={ev.start_time || ''} onChange={e => updateEvent(ev.id, { start_time: e.target.value })} className={ci(missingStart)} style={{ minHeight: '48px' }}>
                            <option value="">—:—</option>
                            {SCHEDULE_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-0 py-0 align-middle">
                          <select value={ev.end_time || ''} onChange={e => updateEvent(ev.id, { end_time: e.target.value })} className={ci(missingEnd)} style={{ minHeight: '48px' }}>
                            <option value="">—:—</option>
                            {endTimeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        {vans.length > 1 && (
                          <td className="px-0 py-0 align-middle">
                            <select value={ev.van_id || ''} onChange={e => updateEvent(ev.id, { van_id: e.target.value || undefined })} className={`${ci(false)} bg-transparent`} style={{ minHeight: '48px' }}>
                              <option value="">Select</option>
                              {vans.map(van => <option key={van.id} value={van.id}>{van.name}</option>)}
                            </select>
                          </td>
                        )}
                        <td className="px-2 py-1 align-middle text-center">
                          <TrashBtn id={ev.id} />
                        </td>
                      </tr>
                      </Fragment>
                    )
                  })())}
                </tbody>
              </>
            )}
          </table>
        </div>

        {/* Footer */}
        {/* Excluded events — collapsed by default */}
        {excludedEvents.length > 0 && (
          <details className="border border-slate-200 rounded-xl overflow-hidden">
            <summary className="px-4 py-3 text-sm font-medium text-slate-500 cursor-pointer select-none list-none flex items-center justify-between hover:bg-slate-50">
              <span>{excludedEvents.length} excluded — previously flagged as not an event</span>
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </summary>
            <div className="divide-y divide-slate-100">
              {excludedEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-3 px-4 py-3 bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-500 line-through">{ev.venue_name}</p>
                    <p className="text-xs text-slate-400">{ev.event_date}{ev.town ? ` · ${ev.town}` : ''}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddBack(ev)}
                    className="shrink-0 text-xs font-medium text-orange-600 hover:text-orange-700 px-3 py-1.5 border border-orange-200 rounded-lg hover:bg-orange-50 whitespace-nowrap"
                  >
                    Add back
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="flex flex-col-reverse gap-2 pt-1 md:flex-row md:justify-end">
          <button type="button" onClick={onCancel} className="w-full md:w-auto border border-slate-200 text-slate-600 py-2.5 px-4 rounded-xl text-sm">Cancel</button>
          {canSave ? (
            <button type="button" onClick={() => saveExtractedEvents(selectedEvts.filter(e => !isEv(e)))} disabled={savingExtracted} className="w-full md:w-auto bg-orange-600 text-white font-medium py-2.5 px-4 rounded-xl text-sm disabled:opacity-40">
              {savingExtracted ? 'Saving...' : `Save ${saveCount} event${saveCount !== 1 ? 's' : ''}`}
            </button>
          ) : (
            <button type="button" disabled className="w-full md:w-auto bg-slate-100 text-slate-400 font-medium py-2.5 px-4 rounded-xl text-sm cursor-not-allowed">
              Fix {incompleteSelected.length} event{incompleteSelected.length !== 1 ? 's' : ''} first
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
    {isActive && (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-slate-900 text-lg">Schedule</h2>
          <p className="text-slate-400 text-sm">{upcoming.length} upcoming</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end gap-0.5">
            <button onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2 border border-orange-200 text-orange-600 text-sm font-medium rounded-xl hover:bg-orange-50 transition-colors">
              ✨ Import schedule
            </button>
            <p className="text-xs text-slate-400">photo, PDF or text</p>
          </div>
          <div className="self-start">
            <Btn label="+ Add event" onClick={() => {
              const lastEv = [...events].filter(e => e.start_time && e.end_time).sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())[0]
              setFormErrors({})
              setEditingEvent({ venue_name: '', town: '', postcode: '', address: '', event_date: '', start_time: lastEv?.start_time?.substring(0, 5) || '', end_time: lastEv?.end_time?.substring(0, 5) || '', notes: '', truck_id: truck.id })
              setAddMode('manual'); setExtractedEvents([])
            }} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {truck.scraper_preference === 'auto' || truck.scraper_preference === 'both'
            ? 'Finding events automatically from your website'
            : "You're managing your schedule manually"}
          {' · '}
          <button onClick={() => onSwitchTab('settings')} className="text-orange-600 hover:underline font-medium">
            Change in Settings
          </button>
        </p>
        {/* Renders NOTHING for a single-van truck — the gate lives inside VanFilter, so this row is
            byte-identical to before for Gusto and every other one-van operator. */}
        <VanFilter vans={vans} value={vanFilter} onChange={setVanFilter} showUnassigned={hasUnassignedEvents} />
      </div>

      {upcoming.length === 0 && (
        <EmptyState icon="🗓️" title="No upcoming events" body="Events scraped from your social media and booking calendar will appear here for you to confirm" />
      )}

      {openEvents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Open now</p>
          {openEvents.map(e => renderEvent(e))}
        </div>
      )}

      {scraperUnconfirmed.length > 0 && (
        <div className="space-y-2">
          <div className="mb-1">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Needs your approval</p>
            <p className="text-sm text-slate-600 mt-0.5">
              We found {scraperUnconfirmed.length} event{scraperUnconfirmed.length !== 1 ? 's' : ''} for you — review and approve before they go live.
            </p>
          </div>
          {scraperUnconfirmed.map(event => (
            <div key={event.id} className="border-l-4 border-l-amber-400 bg-white border border-slate-200 rounded-2xl overflow-hidden">
              {renderEvent(event, true)}
            </div>
          ))}
        </div>
      )}

      {operatorUnconfirmed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Needs confirmation</p>
          {operatorUnconfirmed.map(e => renderEvent(e))}
        </div>
      )}

      {confirmedEvents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Confirmed</p>
          {confirmedEvents.map(e => renderEvent(e))}
        </div>
      )}

      {otherUpcoming.length > 0 && (
        <div className="space-y-2">{otherUpcoming.map(e => renderEvent(e))}</div>
      )}

      {past.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowPast(p => !p)}
            className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
          >
            <span className={`transition-transform inline-block ${showPast ? 'rotate-90' : ''}`}>▶</span>
            <span>Past events ({past.length})</span>
          </button>
          {showPast && (
            <div className="mt-3 space-y-2">{past.map(e => renderEvent(e))}</div>
          )}
        </div>
      )}

      {editingEvent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center lg:items-start lg:pt-8 justify-center p-4">
          <div className={`bg-white rounded-2xl p-5 sm:p-6 pb-8 sm:pb-8 w-full shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y ${extractedEvents.length > 0 ? 'md:max-w-[980px]' : 'max-w-sm sm:max-w-lg lg:max-w-2xl overflow-x-hidden'}`}>
            <h3 className="font-black text-slate-900 mb-4">
              {editingEvent.id ? 'Edit event' : addMode === 'upload' ? 'Import schedule' : 'Add event'}
            </h3>

            {/* Recent events quick-copy — new events only */}
            {!editingEvent.id && recentEvents.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Copy a recent event</p>
                <div className="flex flex-col gap-2">
                  {recentEvents.map(event => (
                    <button
                      key={event.id}
                      onClick={() => handleCopyEvent(event)}
                      className="flex items-center justify-between w-full px-3 py-2.5 border border-slate-200 rounded-xl hover:border-orange-300 hover:bg-orange-50 transition-colors text-left group"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{event.venue_name}{event.town ? `, ${event.town}` : ''}</p>
                        <p className="text-xs text-slate-400">{fmtDate(event.event_date)} · {formatTime(event.start_time)}–{formatTime(event.end_time)}</p>
                      </div>
                      <span className="text-xs text-orange-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">Copy →</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="text-xs text-slate-400">or add manually</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
              </div>
            )}

            {/* Mode toggle — new events only */}
            {!editingEvent.id && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => { setAddMode('manual'); setExtractedEvents([]) }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium ${addMode === 'manual' ? 'bg-orange-600 text-white' : 'border border-slate-200 text-slate-600'}`}
                >
                  Add manually
                </button>
                <button
                  onClick={() => setAddMode('upload')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium ${addMode === 'upload' ? 'bg-orange-600 text-white' : 'border border-slate-200 text-slate-600'}`}
                >
                  Upload schedule
                </button>
              </div>
            )}

            {/* Manual form */}
            {(editingEvent.id || addMode === 'manual') && (
              <div id="add-event-form" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Date<span className="text-red-400 ml-0.5">*</span></label>
                  <div className="relative">
                    <div onClick={() => { const el = document.getElementById('date-input-event') as HTMLInputElement | null; el?.showPicker?.() || el?.click() }} className={`w-full border rounded-xl px-3 py-2 text-sm cursor-pointer flex items-center justify-between bg-white ${formErrors.event_date ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}>
                      <span className={editingEvent.event_date ? 'text-slate-900 font-medium' : 'text-slate-400'}>
                        {editingEvent.event_date ? (() => { const p = editingEvent.event_date.split('-'); if (p.length !== 3) return editingEvent.event_date; const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])); const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const day = d.getDate(); const nth = (day > 3 && day < 21) ? 'th' : ['th','st','nd','rd','th','th','th','th','th','th'][day % 10]; return `${days[d.getDay()]} ${day}${nth} ${months[d.getMonth()]}` })() : 'Select date'}
                      </span>
                      <span className="text-slate-400 text-xs">📅</span>
                    </div>
                    <input id="date-input-event" type="date" value={editingEvent.event_date} onChange={e => { setEditingEvent(p => ({...p!, event_date: e.target.value})); if (formErrors.event_date) setFormErrors(p => ({...p, event_date: ''})) }} className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" />
                  </div>
                  {formErrors.event_date && <p className="text-xs text-red-500 mt-1">{formErrors.event_date}</p>}
                </div>
                <div className="sm:col-span-2 relative">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Venue name <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={editingEvent.venue_name}
                    onChange={e => { setEditingEvent(p => ({ ...p!, venue_name: e.target.value })); setShowVenueSuggestions(true); if (formErrors.venue_name) setFormErrors(p => ({ ...p, venue_name: '' })) }}
                    onFocus={() => setShowVenueSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowVenueSuggestions(false), 150)}
                    placeholder="e.g. The Crown"
                    className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${formErrors.venue_name ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                  />
                  {showVenueSuggestions && filteredVenueSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
                      {filteredVenueSuggestions.map((venue, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setEditingEvent(p => ({ ...p!, venue_name: venue.venue_name, town: venue.town || p!.town, postcode: venue.postcode || p!.postcode, address: venue.address || p!.address, start_time: venue.start_time?.substring(0, 5) || p!.start_time, end_time: venue.end_time?.substring(0, 5) || p!.end_time }))
                            setShowVenueSuggestions(false)
                            if (formErrors.venue_name) setFormErrors(p => ({ ...p, venue_name: '' }))
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                        >
                          <p className="text-sm font-medium text-slate-800">{venue.venue_name}</p>
                          <p className="text-xs text-slate-400">
                            {[venue.town, venue.postcode].filter(Boolean).join(' · ')}
                            {venue.start_time ? ` · ${formatTime(venue.start_time)}–${formatTime(venue.end_time || '')}` : ''}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  {formErrors.venue_name && <p className="text-xs text-red-500 mt-1">{formErrors.venue_name}</p>}
                </div>
                {/* ADDRESS FIELDS — order and labels are locale-specific.
                    UK format: street address → village/town + postcode
                    Future: extract to addressFieldConfig(locale) to support US/EU formats */}
                <div className="sm:col-span-2">
                  <Input label="Full address (optional)" value={editingEvent.address} onChange={v => setEditingEvent(p => ({...p!, address: v}))} placeholder="e.g. 123 High St, Wickhambrook" />
                </div>
                <div>
                  <Input label="Area (village, town or city)" value={editingEvent.town} onChange={v => setEditingEvent(p => ({...p!, town: v}))} placeholder="e.g. Wickhambrook" />
                </div>
                <Input label="Postcode" value={editingEvent.postcode} onChange={v => setEditingEvent(p => ({...p!, postcode: v}))} placeholder="e.g. CB8 8PD" />
                <div className="sm:col-span-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Start time<span className="text-red-400 ml-0.5">*</span></label>
                    <select value={editingEvent.start_time}
                      onChange={e => {
                        const { start_time, end_time } = applyStartTimeChange(e.target.value, editingEvent.end_time)
                        setEditingEvent(p => ({ ...p!, start_time, end_time }))
                        if (formErrors.start_time) setFormErrors(p => ({ ...p, start_time: '' }))
                      }}
                      className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${formErrors.start_time ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}>
                      <option value="">Select</option>
                      {SCHEDULE_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {formErrors.start_time && <p className="text-xs text-red-500 mt-1">{formErrors.start_time}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">End time<span className="text-red-400 ml-0.5">*</span></label>
                    <select value={editingEvent.end_time}
                      onChange={e => { setEditingEvent(p => ({ ...p!, end_time: e.target.value })); if (formErrors.end_time) setFormErrors(p => ({ ...p, end_time: '' })) }}
                      className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${formErrors.end_time ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}>
                      <option value="">Select</option>
                      {(editingEvent.start_time ? SCHEDULE_TIME_OPTIONS.filter(t => t > editingEvent.start_time) : SCHEDULE_TIME_OPTIONS).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {formErrors.end_time && <p className="text-xs text-red-500 mt-1">{formErrors.end_time}</p>}
                  </div>
                </div>
                {vans.length > 1 && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-600 mb-1">Truck <span className="text-red-500">*</span></label>
                    <select
                      value={editingEvent.van_id || ''}
                      onChange={e => { setEditingEvent(p => ({ ...p!, van_id: e.target.value || null })); if (formErrors.van_id) setFormErrors(p => ({ ...p, van_id: '' })) }}
                      className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${formErrors.van_id ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                    >
                      <option value="">Select a truck</option>
                      {vans.map(van => (
                        <option key={van.id} value={van.id}>{van.name}</option>
                      ))}
                    </select>
                    {formErrors.van_id && <p className="text-xs text-red-500 mt-1">{formErrors.van_id}</p>}
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Notes</label>
                  <textarea value={editingEvent.notes} onChange={e => setEditingEvent(p => ({...p!, notes: e.target.value}))} placeholder="e.g. Park in the main car park" rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
                </div>
                <div className="sm:col-span-2 flex gap-2 pt-1">
                  <Btn label="Cancel" colour="slate" onClick={closeAddModal} />
                  <Btn label={editSaving ? 'Saving...' : editingEvent.id ? 'Save changes' : 'Add event'} loading={editSaving} onClick={saveEdit} />
                </div>
              </div>
            )}

            {/* Upload mode — new events only */}
            {!editingEvent.id && addMode === 'upload' && (
              <div className="flex flex-col gap-4">
                {extractedEvents.length === 0 && (
                  <>
                    <p className="text-sm text-slate-500">
                      Upload a screenshot, photo, or PDF of your schedule — or paste the text below.
                      Our AI will extract your events for you to review.
                    </p>

                    <label
                      {...scheduleDragProps}
                      className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${isScheduleDragging ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50/30'}`}
                    >
                      <span className="text-3xl">{isScheduleDragging ? '📂' : uploadFile ? '✅' : '📷'}</span>
                      <span className="text-sm text-slate-500 text-center">
                        {isScheduleDragging ? 'Drop your schedule here' : uploadFile ? uploadFile.name : 'Drag and drop or tap to choose'}
                      </span>
                      {!isScheduleDragging && !uploadFile && (
                        <span className="text-xs text-slate-400">Image or PDF</span>
                      )}
                      <input type="file" accept="image/*,.pdf" className="sr-only" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                    </label>

                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Or paste schedule text
                      </label>
                      <textarea
                        value={uploadText}
                        onChange={e => setUploadText(e.target.value)}
                        placeholder="Paste your schedule here e.g. Saturday 14th June, The Crown, Wickhambrook, 5pm-9pm"
                        rows={4}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                    </div>

                    <button
                      onClick={processUpload}
                      disabled={(!uploadFile && !uploadText) || uploadProcessing}
                      className="w-full bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
                    >
                      {uploadProcessing ? 'Analysing...' : 'Process schedule'}
                    </button>
                  </>
                )}

                {extractedEvents.length > 0 && renderScheduleReview(closeAddModal)}

                {extractedEvents.length === 0 && (
                  <button onClick={closeAddModal} className="text-sm text-slate-400 hover:text-slate-600 text-center">
                    Cancel
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showEventCancelModal && cancellingEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Cancel this event?</h3>
              <p className="text-sm text-slate-500 mt-1">
                {cancellingEvent.venue_name}{cancellingEvent.town ? `, ${cancellingEvent.town}` : ''}
                {' · '}
                {fmtDate(cancellingEvent.event_date)}
                {cancellingEvent.start_time && cancellingEvent.end_time
                  ? ` · ${formatTime(cancellingEvent.start_time)}–${formatTime(cancellingEvent.end_time)}`
                  : ''}
              </p>
              {affectedOrderCount > 0 && (
                <p className="text-sm font-medium text-red-600 mt-2">
                  {affectedOrderCount} order{affectedOrderCount !== 1 ? 's' : ''} will be cancelled and customers notified.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reason — optional</label>
              <select value={eventCancelReason} onChange={e => setEventCancelReason(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                <option value="">Select a reason</option>
                <option value="Vehicle breakdown">Vehicle breakdown</option>
                <option value="Weather">Weather</option>
                <option value="Venue issue">Venue issue</option>
                <option value="Personal emergency">Personal emergency</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Message to customers — optional</label>
              <textarea
                value={eventCancelNote}
                onChange={e => setEventCancelNote(e.target.value)}
                placeholder="e.g. Sorry, our trailer broke down on the way to the venue..."
                rows={3}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowEventCancelModal(false); setEventCancelReason(''); setEventCancelNote('') }}
                className="flex-1 border border-slate-200 text-slate-600 font-medium py-3 rounded-xl text-sm"
              >
                Keep event
              </button>
              <button
                onClick={() => confirmCancelEvent()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm"
              >
                Cancel event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    )}
    {/* Import modal — rendered outside the isActive gate so it can open from any tab */}
    {showImportModal && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
        <div className={`bg-white rounded-2xl p-5 sm:p-6 w-full shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y ${extractedEvents.length > 0 ? 'md:max-w-[980px]' : 'max-w-sm sm:max-w-lg'}`}>
          <h3 className="font-black text-slate-900 mb-4">{importModalTitle}</h3>
          <div className="flex flex-col gap-4">
            {extractedEvents.length === 0 && (
              <>
                <p className="text-sm text-slate-500">
                  Upload a screenshot, photo, or PDF of your schedule — or paste the text below.
                  Our AI will extract your events for you to review.
                </p>

                <label
                  {...scheduleDragProps}
                  className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${isScheduleDragging ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50/30'}`}
                >
                  <span className="text-3xl">{isScheduleDragging ? '📂' : uploadFile ? '✅' : '📷'}</span>
                  <span className="text-sm text-slate-500 text-center">
                    {isScheduleDragging ? 'Drop your schedule here' : uploadFile ? uploadFile.name : 'Drag and drop or tap to choose'}
                  </span>
                  {!isScheduleDragging && !uploadFile && (
                    <span className="text-xs text-slate-400">Image or PDF</span>
                  )}
                  <input type="file" accept="image/*,.pdf" className="sr-only" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                </label>

                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Or paste schedule text
                  </label>
                  <textarea
                    value={uploadText}
                    onChange={e => setUploadText(e.target.value)}
                    placeholder="Paste your schedule here e.g. Saturday 14th June, The Crown, Wickhambrook, 5pm-9pm"
                    rows={4}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>

                <button
                  onClick={processUpload}
                  disabled={(!uploadFile && !uploadText) || uploadProcessing}
                  className="w-full bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
                >
                  {uploadProcessing ? 'Analysing...' : 'Process schedule'}
                </button>
              </>
            )}

            {extractedEvents.length > 0 && renderScheduleReview(closeImportModal)}

            {extractedEvents.length === 0 && (
              <button onClick={closeImportModal} className="text-sm text-slate-400 hover:text-slate-600 text-center">
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    )}
  </>
  )
}

// ══════════════════════════════════════════════════════════════
// SETTINGS TAB
// ══════════════════════════════════════════════════════════════
function SettingsTab({ userRole, truck, token, api, reload, showToast, onVerifySuccess, onSwitchTab, categories, items, subcategories, onTruckUpdate, onItemsPatch, onCategoriesPatch, onOpenWalkthrough }: {
  /** 🔴 OWNER-ONLY gating for the danger zone at the bottom. The Settings TAB itself is owner+manager,
   *  so this is the existing role value narrowed one step further — not a new check. */
  userRole: UserRole
  truck: Truck; token: string
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: ShowToast
  onVerifySuccess: (events: any[]) => void
  onSwitchTab: (tab: Tab) => void
  categories: Category[]
  items: Item[]
  subcategories: Subcategory[]
  onItemsPatch: (ids: string[], patch: Partial<Item>) => void
  // Partial-merge categories in the parent (§42 capacity grid) — sibling of onItemsPatch; optimistic
  // per-row updates with NO reload() (reload→Spinner→unmounts this tab, the §23 "iPhone" violation).
  onCategoriesPatch: (ids: string[], patch: Partial<Category>) => void
  // Push a freshly-saved value up to the parent `truck` so a remount (tab-switch / reload spinner)
  // re-seeds `form` and the local mirrors from the NEW value instead of the stale original.
  onTruckUpdate: (partial: Partial<Truck>) => void
  /** K4: the re-open entry point. Opens the page-level walkthrough; stores nothing itself. */
  onOpenWalkthrough: () => void
}) {
  const [form, setForm] = useState({ ...truck })
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [crewMode, setCrewMode] = useState<'solo' | 'full'>(truck.crew_mode ?? 'solo')
  const [kdsMode, setKdsMode] = useState<boolean>(truck.kds_mode ?? false)
  const [displayMode, setDisplayMode] = useState<'list' | 'grid'>((truck as any).display_mode ?? 'list')
  const [whatsappSender, setWhatsappSender] = useState(truck.whatsapp_sender ?? '')
  const [preferredContact, setPreferredContact] = useState(truck.preferred_contact_method ?? '')
  const [allowCancellation, setAllowCancellation] = useState(truck.allow_customer_cancellation ?? true)
  const [cancellationCutoff, setCancellationCutoff] = useState(truck.cancellation_cutoff_mins ?? 30)
  const [vans, setVans] = useState<Van[]>([])
  const [addingVan, setAddingVan] = useState(false)
  const [newVanName, setNewVanName] = useState('')
  const [renamingVanId, setRenamingVanId] = useState<string | null>(null)
  const [renameVanName, setRenameVanName] = useState('')
  const [showAutoPauseInfo, setShowAutoPauseInfo] = useState<string | null>(null)
  const [deletingVan, setDeletingVan] = useState<Van | null>(null)
  const [showVanBillingModal, setShowVanBillingModal] = useState(false)
  const [showVanUpgradeModal, setShowVanUpgradeModal] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [generatingQR, setGeneratingQR] = useState(false)
  const [copiedOrderLink, setCopiedOrderLink] = useState(false)
  // ── T5: BRANDED BY DEFAULT WHEN THERE IS A LOGO — DURING SETUP ONLY ──────────────────────────────
  // 🔴 THIS IS A RENDER-TIME DEFAULT, NOT A STORED ONE, AND IT CANNOT BE ANYTHING ELSE.
  // `trucks.qr_code_style` is NOT NULL DEFAULT 'standard' (20260…_qr_code_style.sql), so it is never
  // null — there is no "unset" value to distinguish an operator who deliberately chose Standard from
  // one who has never touched the control. Both read 'standard'.
  //
  // ⚠️ WHICH IS WHY IT IS SCOPED TO SETUP. Applied to every truck, this would silently re-select
  // Branded for an operator who had deliberately picked Standard, every time they opened Settings —
  // overriding a real choice because the schema cannot record that it was one. `setup_step` present and
  // not 'done' means the truck is still being built and has made no such choice yet. Gusto and RTF have
  // setup_step NULL, so this branch is unreachable for them and their stored value always wins.
  //
  // Also gated on the FEATURE: branded is Pro/Max (`branded_qr_code`), and defaulting a Starter truck
  // to an option its own UI renders disabled would be a broken-looking screen. A setup operator is on
  // plan 'trial' with a null expiry (was 'demo' before 4 August), which canAccess reads as not-started
  // and grants the trial feature set — which includes branded_qr_code. The intended case still passes.
  //
  // No logo ⇒ standard, unchanged. The value is not written until the operator clicks — this only
  // changes which radio is pre-selected.
  const [qrCodeStyle, setQrCodeStyle] = useState<'standard' | 'branded'>(() => {
    const stored = truck.qr_code_style ?? 'standard'
    const stillInSetup = truck.setup_step != null && truck.setup_step !== 'done'
    const canBrand = canAccess(truck.plan, 'branded_qr_code', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)
    if (stored === 'standard' && stillInSetup && canBrand && truck.logo_storage_path) return 'branded'
    return stored
  })
  const [settingsExclusionList, setSettingsExclusionList] = useState<{ id: string; term: string }[]>([])
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  // PRE-ORDERS (V7.8 global-config): single-source — the deadline rule lives ONCE on the truck row
  // (gType/gVal/gAction → update_truck); per-item stores ONLY inclusion (preorder_enabled → the trimmed
  // set_item_preorder_bulk). The popup is a pure inclusion picker.
  const preorderCan = canAccess(truck.plan, 'advance_preordering', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)
  const [poSel, setPoSel] = useState<Set<string>>(new Set())
  const [poModalOpen, setPoModalOpen] = useState(false)
  // MASTER toggle (§47): local mirror of truck.preorders_enabled, written via the update_truck path.
  const [preordersOn, setPreordersOn] = useState<boolean>((truck as any).preorders_enabled !== false)
  const saveMaster = async (v: boolean) => {
    setPreordersOn(v) // optimistic
    try { await api('update_truck', { data: { preorders_enabled: v } }); onTruckUpdate({ preorders_enabled: v } as any) }
    catch (e: any) { setPreordersOn(!v); showToast(e.message, 'error') }
  }
  // GLOBAL config — the ONE rule on the truck row (trucks.preorder_*), read by both effects. Written
  // via update_truck (single-source: never per-item). Local mirror initialised from the truck.
  const [gType, setGType] = useState<'hours_before' | 'daily_cutoff'>(((truck as any).preorder_deadline_type as any) || 'hours_before')
  const [gVal, setGVal] = useState<number>((truck as any).preorder_deadline_value ?? 2)
  const [gAction, setGAction] = useState<'sold_out' | 'force_pending'>(((truck as any).preorder_past_action as any) || 'sold_out')
  // OPEN-WINDOW rule (V8.3): WHEN pre-ordering opens (9 fixed options). Default 'on_confirm' (from approval).
  const [gOpen, setGOpen] = useState<string>(((truck as any).preorder_open_rule as string) || 'on_confirm')
  const saveOpenRule = async (v: string) => {
    setGOpen(v) // optimistic
    try { await api('update_truck', { data: { preorder_open_rule: v } }); onTruckUpdate({ preorder_open_rule: v } as any) }
    catch (e: any) { showToast(e.message, 'error') }
  }
  const saveGlobalCfg = async (patch: Partial<{ type: 'hours_before' | 'daily_cutoff'; value: number; action: 'sold_out' | 'force_pending' }>) => {
    const type = patch.type ?? gType
    const value = patch.value ?? (patch.type ? (patch.type === 'daily_cutoff' ? 720 : 2) : gVal)
    const action = patch.action ?? gAction
    setGType(type); setGVal(value); setGAction(action) // optimistic
    try {
      await api('update_truck', { data: { preorder_deadline_type: type, preorder_deadline_value: value, preorder_past_action: action } })
      onTruckUpdate({ preorder_deadline_type: type, preorder_deadline_value: value, preorder_past_action: action } as any)
    } catch (e: any) { showToast(e.message, 'error') }
  }
  // Item INCLUSION toggle — writes ONLY preorder_enabled (the trimmed bulk), then reload so page + item
  // editor mirror. No per-item timing/action is ever written (single-source on the truck).
  // OPTIMISTIC, no-refresh (§23 "iPhone" rule): patch the parent items in place so the checkbox flips
  // instantly + the item editor mirrors — NO reload() (reload sets loading→Spinner→unmounts this tab,
  // closing the popup). Background write; revert the patch + toast on error. Modal stays open.
  const setItemIncluded = async (id: string, enabled: boolean) => {
    onItemsPatch([id], { preorder_enabled: enabled })
    try { await api('set_item_preorder_bulk', { menu_item_ids: [id], preorder_enabled: enabled }) }
    catch (e: any) { onItemsPatch([id], { preorder_enabled: !enabled }); showToast(e.message, 'error') }
  }
  // Group select-all/deselect — optimistic patch of all the group's items, one bulk write, revert on error.
  const setGroupIncluded = async (ids: string[], enabled: boolean) => {
    onItemsPatch(ids, { preorder_enabled: enabled })
    try { await api('set_item_preorder_bulk', { menu_item_ids: ids, preorder_enabled: enabled }) }
    catch (e: any) { onItemsPatch(ids, { preorder_enabled: !enabled }); showToast(e.message, 'error') }
  }

  useEffect(() => {
    api('get_vans').then(r => setVans(r.vans || [])).catch(() => {})
    api('get_exclusion_terms').then(r => setSettingsExclusionList(r.terms || [])).catch(() => {})
  }, [])

  // V2: the second of the two identical copies — now the one shared guard, failing closed.
  const isBlockedDomain = isScraperBlockedDomain
  const BLOCKED_DOMAIN_MSG = "Please use your website URL — Facebook and Instagram pages can't be scraped automatically."

  const handleVerifyUrl = async () => {
    // N1: identical treatment to the setup wizard's Route A — one helper, so the two surfaces cannot
    // disagree about what counts as a usable address. See the note on schedVerify for why this also
    // repairs the blocked-domain guard, which failed OPEN on an unparseable string.
    const url = normaliseUrl(form.schedule_url)
    if (!url) { setVerifyError(URL_MALFORMED_MSG); return }
    if (isBlockedDomain(url)) {
      setVerifyError(BLOCKED_DOMAIN_MSG)
      return
    }
    // Show the operator the address that was actually verified, and persist that one on success.
    setForm(p => ({ ...p, schedule_url: url }))
    setVerifying(true)
    setVerifyError(null)
    try {
      const res = await fetch('/api/manage/verify-schedule-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, url }),
      })
      const data = await res.json().catch(() => ({} as any))
      console.log('[verify]', { status: res.status, found: data.found, eventCount: data.events?.length, reason: data.reason, navStatus: data.status, error: data.error })
      if (data.found) {
        onVerifySuccess(data.events)
        return
      }
      // Accurate, distinct messaging per outcome (was: blocks + launch-fail + unreachable all said
      // "couldn't reach", wrongly blaming a valid URL). Unknown / unexpected server error (>=500)
      // → treat as OUR problem, not the URL.
      // N2: a 400 is the server refusing to fetch at all, so it is a malformed address, not a network
      // failure. The message map is now the one shared definition at module scope.
      const reason: string = data.reason
        || (res.status >= 500 ? 'launch_failed' : res.status === 400 ? 'malformed' : 'unreachable')
      setVerifyError(VERIFY_MESSAGES[reason] || VERIFY_MESSAGES.unreachable)
    } catch {
      // The verify request itself failed (network/our API) — genuinely couldn't complete the check.
      setVerifyError(VERIFY_MESSAGES.unreachable)
    } finally {
      setVerifying(false)
    }
  }

  const orderUrl = truck.slug
    ? `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order`
    : null

  const handleCopyOrderLink = async () => {
    if (!orderUrl) return
    try {
      await navigator.clipboard.writeText(orderUrl)
      setCopiedOrderLink(true)
      setTimeout(() => setCopiedOrderLink(false), 2000)
    } catch { /* clipboard permission denied — fail silently */ }
  }

  const handleGenerateQR = async () => {
    if (!orderUrl) return
    setGeneratingQR(true)
    try {
      const { generateQRCodePNG } = await import('@/lib/generateQRCode')
      const showBrandedQr = can('branded_qr_code') && qrCodeStyle === 'branded'
      const dataUrl = await generateQRCodePNG({
        url: orderUrl,
        logoUrl: showBrandedQr && truck.logo_storage_path
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${truck.logo_storage_path}`
          : null,
        truckName: truck.name,
        // Imported constant, not a hardcoded path: this line read '/logos/hatchgrab.png' — an asset that
        // NEVER EXISTED — so loadImageViaBlobUrl returned null and the poster silently fell back to the
        // text "Powered by HatchGrab". The real asset is '/logos/hatchgrab-logo.png'. ⚠️ The text fallback
        // in lib/generateQRCode.ts is DELIBERATELY KEPT: it is what makes a missing/failed image a
        // degraded poster rather than a blank corner.
        hatchgrabLogoUrl: `${window.location.origin}${HATCHGRAB_LOGO_PNG}`,
      })
      setQrDataUrl(dataUrl)
    } catch (err) {
      console.error('QR generation failed:', err)
    }
    setGeneratingQR(false)
  }

  const can = (feature: Feature) => canAccess(
    truck.plan,
    feature,
    truck.feature_overrides ?? {},
    truck.trial_expires_at ?? null
  )

  // £/month for each additional van beyond included count
  // TODO: Wire to Stripe billing API when payments are integrated.
  const VAN_ADDON_PRICE: Record<string, number> = { starter: 0, pro: 29, max: 49, trial: 0 }
  // Per-truck masking, same policy the Billing tab uses. Was a direct `maskPrice` import, which had no
  // truck context and would have shown a suppressed operator a real add-on price the moment the global
  // flag flipped.
  const vanPx = usePriceMask()
  const INCLUDED_VANS: Record<string, number> = { starter: 1, pro: 2, max: 999, trial: 999 }

  const handleAddVanClick = () => {
    const confirmed = window.confirm(
      "Adding an additional truck will be charged as an add-on to your subscription.\n\nThis will be reflected in your next billing cycle.\n\nDo you want to continue?"
    )
    if (!confirmed) return
    const included = INCLUDED_VANS[truck.plan] ?? 1
    const addonPrice = VAN_ADDON_PRICE[truck.plan] ?? 0
    if (vans.length >= included) {
      if (addonPrice > 0) {
        setShowVanBillingModal(true)
      } else if (truck.plan === 'starter') {
        setShowVanUpgradeModal(true)
      } else {
        setAddingVan(true)
      }
    } else {
      setAddingVan(true)
    }
  }

  const saveSetting = async (key: string, value: string | boolean | number | null) => {
    try {
      await api('update_truck', { data: { [key]: value } })
      // update_truck returns only { ok }, so merge the just-written key/value into the parent `truck`
      // locally (it's exactly what the server accepted) — keeps it fresh so a remount re-seeds the
      // local mirrors (preferredContact / allowCancellation / cancellationCutoff …) from the NEW value.
      onTruckUpdate({ [key]: value } as Partial<Truck>)
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  // Auto-replies WhatsApp sender — saves on blur (like the rest of Settings) AND on the button.
  // The ref guards the blur→click double-fire (clicking the button blurs the input first) and skips
  // pointless writes when nothing changed, so the operator gets exactly one success toast.
  const lastSavedSender = useRef(truck.whatsapp_sender ?? '')
  const saveWhatsappSender = async () => {
    if (whatsappSender === lastSavedSender.current) return
    try {
      await api('update_truck', { data: { whatsapp_sender: whatsappSender } })
      lastSavedSender.current = whatsappSender
      onTruckUpdate({ whatsapp_sender: whatsappSender })
      showToast('WhatsApp number saved')
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  const saveFormField = async (overrides?: Record<string, unknown>) => {
    try {
      // update_settings returns the updated row ({ truck }); push it up so the parent `truck` is
      // authoritative-fresh and a remount doesn't revert the field to the stale original value.
      const res = await api('update_settings', { ...form, ...overrides })
      if (res?.truck) onTruckUpdate(res.truck)
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  // ── Contact Details: validation (shared with the customer order screen) + the WhatsApp tick ──
  const contactEmailErr = (form.contact_email || '').trim() !== '' && !isValidEmail(form.contact_email || '')
  const contactPhoneErr = (form.contact_phone || '').trim() !== '' && !isValidUKPhone(form.contact_phone || '')
  // Customer-facing `whatsapp` = the phone number WHEN "this number is on WhatsApp" is ticked; else ''.
  // Cleared value is '' (NOT null) because trucks.whatsapp is NOT NULL with a '' default — writing null
  // 400s the settings save on untick. '' and null read identically (nothing reads this column for
  // null-vs-empty; the WhatsApp gate uses phone_is_whatsapp && contact_phone). Distinct from
  // whatsapp_sender (Auto-replies/Connect) — never touched here.
  const waFromPhone = (phone: string | null, isWa: boolean) => (isWa && (phone || '').trim() ? phone : '')

  // Phone onBlur: persist phone AND keep `whatsapp` synced to it while the tick is on (no drift).
  const saveContactPhone = () =>
    saveFormField({ whatsapp: waFromPhone(form.contact_phone, !!form.phone_is_whatsapp) })

  // Tick toggle: set the flag + sync/clear `whatsapp`. On UNTICK, if WhatsApp was the preferred method
  // it falls back to a valid one (can't keep preferred=whatsapp with no WhatsApp number).
  const togglePhoneIsWhatsapp = (checked: boolean) => {
    const wa = waFromPhone(form.contact_phone, checked)
    setForm(p => ({ ...p, phone_is_whatsapp: checked, whatsapp: wa }))
    saveFormField({ phone_is_whatsapp: checked, whatsapp: wa })
    if (!checked && preferredContact === 'whatsapp') {
      const fallback = (form.contact_email || '').trim() ? 'email' : ((form.contact_phone || '').trim() ? 'phone' : '')
      setPreferredContact(fallback)
      saveSetting('preferred_contact_method', fallback || null)
    }
  }
  // True when WhatsApp is a usable customer contact method (ticked + a phone present).
  const whatsappUsable = !!form.phone_is_whatsapp && !!(form.contact_phone || '').trim()

  // ── THE RESOLVED COMPLETION SETTING, ONE PLACE ON THIS PAGE ────────────────────────────────────
  // Read by the "Completing an unpaid order" radio AND by the cash row's enable gate, so those two
  // cannot disagree about what this truck is doing.
  // 🔴 THE FALLBACK IS `show_paid_step`, NOT A CONSTANT — the SAME expression lib/payments/paid-step.ts
  // uses. Before the column is backfilled it arrives undefined, and `?? 'one'` would show every
  // two-press truck as one-press, i.e. Settings lying about live behaviour for the length of the
  // deploy window. Do not simplify it; see the resolver for the full reasoning.
  const completionPresses: 'one' | 'two' =
    form.completion_presses ?? (form.show_paid_step === true ? 'two' : 'one')

  const handleDisplayModeChange = async (value: 'list' | 'grid') => {
    setDisplayMode(value)
    try { await api('update_truck', { data: { display_mode: value } }) }
    catch (err: any) { showToast(err.message, 'error') }
  }

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true)
    try {
      const { upload_url, path } = await api('get_upload_url', { filename: file.name, content_type: file.type })
      await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      setForm(p => ({ ...p, logo_storage_path: path }))
      await api('update_settings', { logo_storage_path: path })
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setUploadingLogo(false) }
  }

  const copyKdsLink = async (kdsToken: string) => {
    await navigator.clipboard.writeText(`https://www.hatchgrab.com/kds/${kdsToken}`)
    showToast('Order screen link copied')
  }

  const saveNewVan = async () => {
    try {
      const result = await api('add_van', { name: newVanName })
      if (result.van) {
        setVans(prev => [...prev, result.van])
        setAddingVan(false)
        setNewVanName('')
      }
    } catch (e: any) { showToast(e.message, 'error') }
  }

  const confirmRenameVan = async (vanId: string) => {
    if (!renameVanName.trim()) return
    try {
      await api('rename_van', { vanId, name: renameVanName })
      setVans(prev => prev.map(v => v.id === vanId ? { ...v, name: renameVanName.trim() } : v))
      setRenamingVanId(null)
      setRenameVanName('')
    } catch (e: any) { showToast(e.message, 'error') }
  }

  const confirmDeleteVan = async () => {
    if (!deletingVan) return
    try {
      await api('delete_van', { vanId: deletingVan.id })
      setVans(prev => prev.filter(v => v.id !== deletingVan.id))
      setDeletingVan(null)
      showToast(`${deletingVan.name} removed`)
    } catch (e: any) { showToast(e.message, 'error') }
  }

  const handleToggleAutoPause = async (vanId: string, enabled: boolean) => {
    setVans(prev => prev.map(v => v.id === vanId ? { ...v, auto_pause_on_offline: enabled } : v))
    if (enabled) {
      setShowAutoPauseInfo(vanId)
    } else {
      setShowAutoPauseInfo(null)
    }
    await api('update_van_settings', { vanId, autoPauseOnOffline: enabled })
  }

  const updateVanSetting = async (
    vanId: string,
    field: 'show_cooking_step' | 'auto_pause_on_offline' | 'order_ready_enabled' | 'kitchen_capacity' | 'capacity_window_mins' | 'buzzer_count',
    value: boolean | number | null
  ) => {
    setVans(prev => prev.map(v => v.id === vanId ? { ...v, [field]: value } : v))
    await api('update_van_settings', { vanId, [field]: value })
  }

  // Toggle a NO-PREP category's "counts toward kitchen capacity" flag from the capacity tickbox list.
  // OPTIMISTIC (§23 "iPhone" rule): patch the parent categories state instantly, write in the
  // background, revert on error — NO reload() (reload→Spinner→unmounts this tab). Payload unchanged.
  const toggleCatCapacity = async (cat: Category, newVal: boolean) => {
    const prior = cat.counts_toward_capacity   // capture PRE-patch value for a clean revert
    onCategoriesPatch([cat.id], { counts_toward_capacity: newVal })
    try {
      await api('upsert_category', {
        id: cat.id, name: cat.name, prep_secs: cat.prep_secs, batch_size: cat.batch_size,
        allow_notes: cat.allow_notes, default_stock: cat.default_stock, sort_order: cat.sort_order,
        counts_toward_capacity: newVal,
      })
    } catch (e: any) {
      onCategoriesPatch([cat.id], { counts_toward_capacity: prior })
      showToast(e.message, 'error')
    }
  }

  // Per-category prep/batch write for the Kitchen-capacity grid (V7.8 §42) — SAME upsert_category
  // payload (no new endpoint). OPTIMISTIC like toggleCatCapacity: patch the parent categories state
  // instantly, write in the background, revert on error — NO reload(). prep_secs in SECONDS,
  // batch_size as-is (0 = ∞, Manage convention). The payload + the revert both derive from cat.* (the
  // pre-write prop row), so a failed write restores the prior value, not a post-patch one.
  const updateCatField = async (cat: Category, patch: Partial<Category>) => {
    // Prior values of ONLY the patched fields, read from the pre-patch prop row (for a clean revert).
    const prior = Object.fromEntries(Object.keys(patch).map(k => [k, (cat as any)[k]])) as Partial<Category>
    onCategoriesPatch([cat.id], patch)
    try {
      await api('upsert_category', {
        id: cat.id, name: cat.name, prep_secs: cat.prep_secs, batch_size: cat.batch_size,
        allow_notes: cat.allow_notes, default_stock: cat.default_stock, sort_order: cat.sort_order,
        counts_toward_capacity: cat.counts_toward_capacity,
        ...patch,
      })
    } catch (e: any) {
      onCategoriesPatch([cat.id], prior)
      showToast(e.message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="font-black text-slate-900 text-lg">Settings</h2>

      {/* ── K4: THE WALKTHROUGH RE-OPEN ENTRY POINT ────────────────────────────────────────────────
          🔴 MOVED TO THE TOP, 10 August 2026 (operator review). It sat as the LAST card, after "Your
          trucks", at the bottom of the longest page in the product — and **nobody scrolls to find an
          onboarding tour**. An entry point that has to be hunted for is not an entry point.
          🔴 STILL A HOLDING PLACE, NOT A HOME, and the original reasoning is unchanged: there is
          nowhere natural on Manage — no footer, no help surface — and UserMenu is shared with the
          dashboard and the KDS, so anything added there appears on all three. **It MOVES to the help
          centre the day one exists.** Being at the top makes it findable; it does not make it the
          right home.
          ⚠️ THE OTHER TWO ENTRY POINTS ARE UNTOUCHED and neither needed moving: the reminder STRIP is
          already at the top of the page (above the tabs), and the wizard's "Show me around" is a
          choice inside the completion overlay, not a page element.
          It stores nothing: opening from here does not change the seen-state until the tour is closed,
          which is the same rule as every other entry point. */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-800">New to HatchGrab?</p>
            <p className="text-xs text-slate-500 mt-0.5">A quick tour of what lives on each tab. Takes about a minute.</p>
          </div>
          <button type="button" onClick={onOpenWalkthrough}
            className="shrink-0 text-xs font-bold px-3 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50">
            Show me around
          </button>
        </div>
      </Card>

      {/* Logo */}
      <Card className="p-4">
        <p className="text-base font-bold text-slate-800 mb-3">Logo</p>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
            {form.logo_storage_path
              ? <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${form.logo_storage_path}`} alt="" className="w-full h-full object-cover" />
              : <span className="text-3xl">🚚</span>
            }
          </div>
          <div>
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              {uploadingLogo ? 'Uploading…' : 'Upload logo'}
              <input type="file" accept="image/*" className="sr-only" onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            </label>
            <p className="text-xs text-slate-400 mt-1">PNG or JPG, square recommended</p>
          </div>
        </div>
      </Card>

      {/* Truck details */}
      <Card className="p-4 space-y-3">
        <p className="text-base font-bold text-slate-800">Truck details</p>
        <Input label="Truck name" required value={form.name} onChange={v => setForm(p => ({...p, name: v}))} onBlur={() => saveFormField()} />
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Description</label>
          <textarea value={form.description || ''} onChange={e => setForm(p => ({...p, description: e.target.value}))} onBlur={() => saveFormField()} placeholder="Tell customers about your food..."
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" rows={3} />
        </div>
        <Input label="Cuisine type" required value={form.cuisine_type || ''} onChange={v => setForm(p => ({...p, cuisine_type: v}))} onBlur={() => saveFormField()} placeholder="e.g. Italian, Thai, Burgers" />

        {/* Menu icon */}
        <div className="mt-1">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500 block mb-2">
            Menu icon
          </label>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{form.truck_emoji || '🍕'}</span>
            <button
              onClick={() => setShowEmojiPicker(true)}
              className="text-sm text-orange-500 hover:text-orange-600 font-medium underline underline-offset-2">
              Change emoji
            </button>
          </div>
        </div>
      </Card>

      {/* Contact (merged: business contact + customer contact) */}
      <Card className="p-4 space-y-3">
        <div>
          <p className="text-base font-bold text-slate-800">Contact Details</p>
          <p className="text-xs text-slate-400 mt-0.5">How customers reach you about their order (shown on order confirmations) and where you receive new-order alerts. For your personal account details, go to Team → My profile.</p>
        </div>
        <Input label="Email" required type="email" value={form.contact_email || ''} onChange={v => setForm(p => ({...p, contact_email: v}))} onBlur={() => saveFormField()} placeholder="hello@yourtruck.com" error={contactEmailErr ? 'Please enter a valid email (e.g. hello@yourtruck.com)' : undefined} />
        <p className="text-xs text-slate-400 -mt-1.5">Where you receive new-order notifications — and shown to customers on their confirmation when “Email” is the preferred method below.</p>
        <Input label="Phone" required type="tel" value={form.contact_phone || ''} onChange={v => setForm(p => ({...p, contact_phone: v}))} onBlur={saveContactPhone} placeholder="07700 900123" error={contactPhoneErr ? 'Please enter a valid UK phone (e.g. 07700 900123)' : undefined} />
        {/* "This number is on WhatsApp" — ties the customer-facing `whatsapp` to the phone (no double
            entry) and gates WhatsApp as a preferred method below. */}
        <label className="flex items-center gap-2 text-sm text-slate-600 -mt-1 cursor-pointer">
          <input type="checkbox" checked={!!form.phone_is_whatsapp} onChange={e => togglePhoneIsWhatsapp(e.target.checked)} className="w-4 h-4 accent-orange-600 cursor-pointer" />
          This number is on WhatsApp
        </label>

        {/* Preferred contact method — WhatsApp gated on the tick above (customer-facing whatsapp = phone) */}
        <div className="pt-3 border-t border-slate-100">
          {['facebook', 'messenger', 'instagram'].includes(preferredContact) && (
            <p className="text-xs text-slate-500 italic mb-2">Your previous contact method is no longer available. Please select a new one.</p>
          )}
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-600 w-36 flex-shrink-0">Preferred method</label>
            <select
              value={['facebook', 'messenger', 'instagram'].includes(preferredContact) ? '' : preferredContact}
              onChange={async e => {
                const val = e.target.value
                setPreferredContact(val)
                await saveSetting('preferred_contact_method', val || null)
              }}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Not specified</option>
              {(!!form.contact_email?.trim() || preferredContact === 'email') && <option value="email">Email</option>}
              {(!!form.contact_phone?.trim() || preferredContact === 'phone') && <option value="phone">Phone</option>}
              {(whatsappUsable || preferredContact === 'whatsapp') && <option value="whatsapp">WhatsApp</option>}
            </select>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">How customers should contact you about their order — shown on their confirmation email.</p>
          {!form.contact_email?.trim() && !form.contact_phone?.trim() && (
            <p className="text-xs text-slate-400 mt-1">Add an email or phone above to offer a contact method.</p>
          )}
          {preferredContact === 'whatsapp' && !whatsappUsable && (
            <p className="text-xs text-amber-600 mt-1">⚠️ Tick “This number is on WhatsApp” on the Phone field to use WhatsApp.</p>
          )}
        </div>

        {/* Cancellation policy */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div>
            <p className="text-sm text-slate-700">{SETTING_COPY.allowCancellation.label}</p>
            <p className="text-sm text-slate-700 mt-0.5">
              {SETTING_COPY.allowCancellation.cancelPrefix}{' '}
              <select
                value={cancellationCutoff}
                onChange={async e => {
                  const val = parseInt(e.target.value)
                  setCancellationCutoff(val)
                  await saveSetting('cancellation_cutoff_mins', val)
                }}
                className="border-b border-slate-300 text-xs px-1 bg-transparent"
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">60 minutes</option>
                <option value="120">2 hours</option>
              </select>
              {' '}{SETTING_COPY.allowCancellation.cancelSuffix}
            </p>
          </div>
          <Toggle
            on={allowCancellation}
            onToggle={async () => { const next = !allowCancellation; setAllowCancellation(next); await saveSetting('allow_customer_cancellation', next) }}
          />
        </div>
      </Card>

      {/* Online presence & social */}
      <Card className="p-4 space-y-3">
        <p className="text-base font-bold text-slate-800">Online presence &amp; social</p>

        {/* Website */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-600 w-24 flex-shrink-0">Website</label>
          <input
            type="text"
            value={form.website || ''}
            onChange={e => setForm(p => ({...p, website: e.target.value}))}
            onBlur={() => {
              // N1: normalised on save for the same reason as the schedule URL, and because this value
              // is RENDERED AS AN href on two customer-facing pages. Both of those already carry their
              // own `startsWith('http') ? … : 'https://' + …` patch — the same fix, written twice, at
              // the display end. Storing a real URL is what makes a third copy unnecessary.
              // ⚠️ An unrecognisable string is LEFT AS TYPED and still saved: this field is free text
              // an operator may fill however they like, nothing fetches it, and refusing to save it
              // would be a new obstacle where there was none. Only a plausible address is corrected.
              const val = normaliseUrl(form.website)
              if (val && val !== form.website) {
                setForm(p => ({ ...p, website: val }))
                saveFormField({ website: val })
              } else {
                saveFormField()
              }
            }}
            placeholder="https://yourtruck.co.uk"
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        {/* Auto-replies subsection */}
        <div className="border-t border-slate-100 pt-4 mt-1">
          <p className="text-sm font-bold text-slate-700 mb-0.5">Auto-replies</p>
          <p className="text-xs text-slate-400 mb-3">Requires Business accounts on each platform.</p>

          <div className="space-y-3">
            {/* WhatsApp */}
            <div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600 w-20 flex-shrink-0">WhatsApp</label>
                {can('whatsapp_replies') ? (
                  <>
                    <input
                      type="tel"
                      value={whatsappSender}
                      onChange={e => setWhatsappSender(e.target.value)}
                      onBlur={saveWhatsappSender}
                      placeholder="+447700900000"
                      className="flex-1 min-w-0 truncate border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    {/* ── RELABELLED AND RESTYLED, 10 August 2026 (operator review) — COSMETIC ONLY ──
                        🔴 BEHAVIOUR IS BYTE-IDENTICAL. Same `onClick={saveWhatsappSender}`, same
                        save-on-blur beside it, same handler, same request. **It does not connect
                        anything and must not be made to look as though it does** — the label is the
                        operator's word for the step they will wire up separately, not a claim about
                        state. If a real connection is built later, that is when a connected/disconnected
                        state belongs here; adding one now would be a label asserting a state nobody
                        checked (§35).
                        ⚠️ WAS `bg-teal-600 text-white ... rounded-xl` — a one-off on this page: teal
                        appears elsewhere only as a pale chip/background (`bg-teal-50`), never as a
                        button fill. It now uses the page's OWN small-button class, copied verbatim from
                        the three existing instances of it, so it matches every other inline action
                        beside an input rather than standing out as a different kind of thing. */}
                    <button
                      onClick={saveWhatsappSender}
                      className="flex-shrink-0 text-xs px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
                    >
                      Connect
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="tel"
                      disabled
                      placeholder="+447700900000"
                      className="flex-1 min-w-0 truncate border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
                    />
                    <FeatureGate
                      feature="whatsapp_replies"
                      plan={truck.plan}
                      overrides={truck.feature_overrides}
                      trialExpiresAt={truck.trial_expires_at}
                      showUpgrade={true}
                    />
                  </>
                )}
              </div>
              {/* Distinguishes this from the customer-facing contact number (Contact Details → Phone). */}
              <p className="text-xs text-slate-400 mt-1.5 sm:pl-[5.5rem]">
                The WhatsApp Business number used to send automated replies to customers (set up with the WhatsApp Business API). This is separate from your contact number above.
              </p>
            </div>

            {/* Messenger */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600 w-20 flex-shrink-0">Messenger</label>
              <input
                type="text"
                disabled
                placeholder="Coming soon"
                className="flex-1 min-w-0 truncate border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
              />
              <button
                disabled
                className="flex-shrink-0 text-xs px-2.5 py-1.5 border border-slate-200 text-slate-400 rounded-xl whitespace-nowrap cursor-not-allowed"
              >
                Connect
              </button>
            </div>

            {/* Instagram */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600 w-20 flex-shrink-0">Instagram</label>
              <input
                type="text"
                disabled
                value=""
                placeholder="Coming soon"
                className="flex-1 min-w-0 truncate border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
              />
              <button
                disabled
                className="flex-shrink-0 text-xs px-2.5 py-1.5 border border-slate-200 text-slate-400 rounded-xl whitespace-nowrap cursor-not-allowed"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Your schedule */}
      <Card className="p-4 space-y-4">
        <p className="text-base font-bold text-slate-800">Your schedule</p>
        <div className="space-y-2">
          {([
            { value: 'manual', label: "I'll add events myself" },
            { value: 'auto',   label: 'Find my events automatically',    desc: "Tell us where you post your schedule and we'll check it for you, sending any events we find for your approval. This needs to be your own website — not a Facebook or Instagram page." },
          ] as { value: 'auto' | 'manual'; label: string; desc?: string }[]).map(opt => {
            const pref = form.scraper_preference ?? 'manual'
            const selected = pref === opt.value || (opt.value === 'auto' && pref === 'both')
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setForm(p => ({ ...p, scraper_preference: opt.value }))
                  saveSetting('scraper_preference', opt.value)
                }}
                className={`w-full text-left border rounded-xl p-4 transition-colors ${selected ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${selected ? 'border-orange-500' : 'border-slate-300'}`}>
                    {selected && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{opt.label}</p>
                    {opt.desc && <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        {/* Clarifier — applies to BOTH options: found events always come for approval, nothing
            goes live until confirmed (so a "I'll add events myself" truck isn't surprised). */}
        <p className="text-xs text-slate-500">
          Either way, if we find your events listed elsewhere, we&apos;ll still send these to you for approval. Nothing goes live until you confirm it.
        </p>
        {['auto', 'both'].includes(form.scraper_preference ?? 'manual') && (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-800">Where do you post your schedule?</p>
            <div className="flex gap-2">
              <input
                type="url"
                value={form.schedule_url ?? ''}
                onChange={e => { setForm(p => ({ ...p, schedule_url: e.target.value })); setVerifyError(null) }}
                onBlur={e => {
                  // N1: the blur-save normalises too, not just the Verify button. Otherwise an operator
                  // who typed `www.…` and tabbed away would have the scheme-less string SAVED and later
                  // handed to the scraper, which is the same failure one step further downstream.
                  const raw = e.target.value.trim()
                  if (!raw) { setVerifyError(null); saveSetting('schedule_url', null); return }
                  const val = normaliseUrl(raw)
                  if (!val) { setVerifyError(URL_MALFORMED_MSG); return }
                  setForm(p => ({ ...p, schedule_url: val }))
                  if (isBlockedDomain(val)) {
                    setVerifyError(BLOCKED_DOMAIN_MSG)
                  } else {
                    setVerifyError(null)
                    saveSetting('schedule_url', val)
                  }
                }}
                placeholder="https://yourtruck.co.uk/events"
                disabled={verifying}
                className={`flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${verifying ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <button
                type="button"
                onClick={handleVerifyUrl}
                disabled={!form.schedule_url?.trim() || verifying}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {verifying
                  ? <><div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" />Checking...</>
                  : 'Verify'}
              </button>
            </div>
            {verifying && (
              <div className="mt-1 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <svg className="animate-spin h-4 w-4 text-amber-600 shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Checking your website...</p>
                  <p className="text-xs text-amber-700 mt-0.5">This can take up to 2 minutes — please keep this page open and don't close the tab.</p>
                </div>
              </div>
            )}
            {!verifying && verifyError && <p className="text-xs text-red-500">{verifyError}</p>}
            <p className="text-xs text-slate-500">Your website where customers can see your upcoming events — not a Facebook or Instagram page</p>
          </div>
        )}
      </Card>

      {/* Import exclusions */}
      {settingsExclusionList.length > 0 && (
        <Card className="p-4 space-y-3">
          <div>
            <p className="text-base font-bold text-slate-800">Import exclusions</p>
            <p className="text-xs text-slate-500 mt-0.5">These terms are automatically filtered out when importing your schedule. Remove any that were added by mistake.</p>
          </div>
          <div className="space-y-1.5">
            {settingsExclusionList.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-sm text-slate-700">{item.term}</span>
                <button
                  type="button"
                  onClick={async () => {
                    if (item.id) {
                      try { await api('remove_exclusion_term', { id: item.id }) } catch { /* continue */ }
                    }
                    setSettingsExclusionList(prev => prev.filter(t => t.id !== item.id))
                  }}
                  className="text-slate-400 hover:text-red-600 transition-colors ml-3"
                  aria-label={`Remove exclusion for ${item.term}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* QR Code */}
      <Card className="p-4">
        <p className="text-base font-bold text-slate-800 mb-1">Order QR code</p>
        <p className="text-xs text-slate-500 mb-4">
          Print or display this code so customers can scan and pre-order.
          Place it at your hatch, on your van, or share it online.
        </p>
        {orderUrl ? (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-4">
            <p className="text-sm text-slate-600 flex-1 truncate font-mono">{orderUrl}</p>
            <button
              onClick={handleCopyOrderLink}
              className="text-xs text-orange-600 font-semibold flex-shrink-0 hover:text-orange-700"
            >
              {copiedOrderLink ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400 mb-4">No order URL — slug not set</p>
        )}
        {/* QR code style selector */}
        <div className="mb-4 space-y-2">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">QR code style</p>
          {/* Standard — available to all tiers. Custom radio dot (w-4/h-4 orange) — matches the schedule
              selector + the rest of the page (was a native accent-orange radio, a different size). */}
          <button
            type="button"
            onClick={() => { setQrCodeStyle('standard'); setQrDataUrl(null); saveSetting('qr_code_style', 'standard') }}
            className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${qrCodeStyle === 'standard' ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
          >
            <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${qrCodeStyle === 'standard' ? 'border-orange-500' : 'border-slate-300'}`}>{qrCodeStyle === 'standard' && <span className="w-2 h-2 rounded-full bg-orange-500" />}</span>
            <div>
              <p className="text-sm font-semibold text-slate-800">Standard QR code</p>
            </div>
          </button>

          {/* Branded — Pro/Max only */}
          {can('branded_qr_code') ? (
            <button
              type="button"
              onClick={() => { setQrCodeStyle('branded'); setQrDataUrl(null); saveSetting('qr_code_style', 'branded') }}
              className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${qrCodeStyle === 'branded' ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${qrCodeStyle === 'branded' ? 'border-orange-500' : 'border-slate-300'}`}>{qrCodeStyle === 'branded' && <span className="w-2 h-2 rounded-full bg-orange-500" />}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">Branded QR code</p>
                <p className="text-xs text-slate-400">Your logo shown in the middle of the QR code</p>
              </div>
              {truck.logo_storage_path && (
                <img
                  src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${truck.logo_storage_path}`}
                  alt="Logo preview"
                  className="w-8 h-8 rounded-md object-contain border border-slate-100 shrink-0"
                />
              )}
              {!truck.logo_storage_path && (
                <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium shrink-0">No logo</span>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 opacity-50 cursor-not-allowed">
              <span className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">Branded QR code</p>
                <p className="text-xs text-slate-400">Your logo shown in the middle of the QR code</p>
              </div>
              <FeatureGate
                feature="branded_qr_code"
                plan={truck.plan}
                overrides={truck.feature_overrides}
                trialExpiresAt={truck.trial_expires_at}
                showUpgrade={true}
              />
            </div>
          )}
        </div>

        {orderUrl && (qrDataUrl ? (
          <div className="flex flex-col items-center gap-4">
            <img
              src={qrDataUrl}
              alt="Order QR code"
              className="w-48 h-auto rounded-xl border border-slate-100 shadow-sm"
            />
            <div className="flex gap-3 w-full">
              <a
                href={qrDataUrl}
                download={`${truck.name.toLowerCase().replace(/\s+/g, '-')}-qr.png`}
                className="flex-1 flex items-center justify-center gap-2
                           px-4 py-2.5 bg-orange-600 text-white text-sm
                           font-medium rounded-xl"
              >
                Download PNG
              </a>
              <button
                onClick={() => setQrDataUrl(null)}
                className="px-4 py-2.5 border border-slate-200 text-slate-600
                           text-sm rounded-xl"
              >
                Regenerate
              </button>
            </div>
            <p className="text-xs text-slate-400 self-start">{orderUrl}</p>
          </div>
        ) : (
          <button
            onClick={handleGenerateQR}
            disabled={generatingQR}
            className="w-full bg-orange-600 text-white font-semibold
                       py-3 rounded-xl text-sm disabled:opacity-40"
          >
            {generatingQR ? 'Generating...' : 'Generate QR code'}
          </button>
        ))}
      </Card>

      {/* Orders */}
      <Card className="p-4 space-y-3">
        <p className="text-base font-bold text-slate-800">Order settings</p>
        {/* Auto-accept + its dependent "review notes" sub-option read as ONE group (notes-review only applies
            when auto-accept is on — the block below is already conditional on it). Neutral sub-panel, same
            treatment as Sounds. Toggles use the shared <Toggle> (canonical w-11/h-6/teal) — no bespoke inline. */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 divide-y divide-slate-200/70">
          <div className="pb-3">
            <p className={SUBCARD_HEADING}>Accepting orders</p>
            <p className="text-xs text-slate-500 mt-0.5">What happens when a new order arrives.</p>
          </div>
          <div className="flex items-center justify-between gap-3 pb-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">{SETTING_COPY.autoAccept.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{SETTING_COPY.autoAccept.help}</p>
            </div>
            <Toggle on={!!form.auto_accept} onToggle={() => { const next = !form.auto_accept; setForm(p => ({...p, auto_accept: next})); saveFormField({ auto_accept: next }) }} />
          </div>
          {/* Nested sub-option — meaningful only when auto-accept is ON. Same truck-level column the dashboard
              live-toggle writes → the two surfaces mirror on next load. DIRECT polarity: ON = notes_require_review
              = hold NOTED orders for review; default ON (?? true) so a pre-migration/undefined read still reviews. */}
          {/* pl-4 indents the whole sub-block as a CHILD of auto-accept (only enabled when it's on). */}
          {form.auto_accept && (
            <div className="py-3 pl-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
                ⚠ Slot capacity limits still apply — full slots are never auto-confirmed
              </div>
              <div className="flex items-center justify-between gap-3 mt-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Review orders with notes before accepting</p>
                  <p className="text-xs text-slate-500 mt-0.5">When on, an order with a customer note (e.g. an allergy) waits for you to read and accept instead of auto-confirming. Recommended on.</p>
                </div>
                <Toggle on={(form as any).notes_require_review ?? true} onToggle={() => { const next = !((form as any).notes_require_review ?? true); setForm(p => ({...p, notes_require_review: next} as any)); saveFormField({ notes_require_review: next }) }} />
              </div>
            </div>
          )}
        </div>

        {/* SOUNDS PANEL REMOVED (V9.5). Sound config is PER-DEVICE (localStorage, lib/sound-prefs.ts) and
            the dashboard's own Sounds panel is the live control. This panel only ever set the SEED for
            devices that had never loaded, which made it misleading here.
            🔴 trucks.sound_config, the /api/dashboard projection and the update_settings allowlist entry
            are all DELIBERATELY RETAINED — the column is still the seed source. Removing the UI does not
            remove the seed. The full retirement precondition lives in lib/sound-prefs.ts's header. */}

        {/* ── NOTIFICATIONS — same sub-panel treatment as its three siblings in this card. It was the one
            LOOSE row left in Order settings, which made it read as an afterthought hanging off the
            auto-accept group rather than as its own setting. Presentation only: same key, same
            saveSetting call, same `!== false` default.
            Truck-facing order-notification email toggle. Gates ONLY the email the truck receives on a new
            order (formatNewOrderEmail → truck.contact_email) — NOT the customer's confirmation/ready emails. */}
        <div className="pt-3 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 divide-y divide-slate-200/70">
            <div className="pb-3">
              <p className={SUBCARD_HEADING}>Notifications</p>
              <p className="text-xs text-slate-500 mt-0.5">How you hear about new orders.</p>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Email order notifications</p>
                <p className="text-xs text-slate-500 mt-0.5">When on, an email is sent to {truck.contact_email || "the truck's contact email"} for every new order. Customer order emails are sent either way.</p>
              </div>
              <Toggle
                on={(form as any).truck_order_email_enabled !== false}
                onToggle={() => { const next = (form as any).truck_order_email_enabled !== false ? false : true; setForm(p => ({...p, truck_order_email_enabled: next} as any)); saveSetting('truck_order_email_enabled', next) }}
              />
            </div>
          </div>
        </div>

        {/* ── TAKING PAYMENT (V9.5) — one neutral sub-panel, same treatment as Sounds and the
            auto-accept group, so the two payment settings read as a grouped section rather than loose
            rows at the bottom of the card.
            ⚠️ SIBLINGS INSIDE A GROUP, NOT NESTED. They answer different questions — "WHEN do we take
            money" (show_paid_step, which the dashboard can override per event) and "HOW does it arrive"
            (takes_cash, truck-level, no override). The cash split was briefly rendered as a CHILD of the
            paid step; that implied a dependency which does not exist. Do not reintroduce the nesting.
            Both resolved only by lib/payments/paid-step.ts.
            ⚠️ Both keys must stay on update_truck's `allowed` list (app/api/manage/route.ts:854) — that
            list SILENTLY DROPS anything not on it, so a missing key means the toggle appears to save,
            returns {ok:true}, and writes nothing. This regrouping changes no key and no save path. */}
        <div className="pt-3 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 divide-y divide-slate-200/70">
            <div className="pb-3">
              <p className={SUBCARD_HEADING}>Taking payment</p>
              <p className="text-xs text-slate-500 mt-0.5">How your team records money for each order.</p>
            </div>
            {/* ── SETTING 1 — trucks.show_paid_step, RELABELLED (10 August 2026) ─────────────────────
                Same column, same save path, same per-event override. Only the words changed, because
                the old ones ("Separate paid step — splits Paid & collected into Mark paid then
                Collected") described the COMPLETION behaviour, which is now its own setting below.
                What this column actually controls is the Add Order panel: on, it offers a Confirm
                button so an order can be placed unpaid; off, the panel only takes payment.
                ⚠️ THE NOTE IS DELIBERATELY NOT ELABORATED. "It doesn't affect online orders" is true
                whatever state online orders arrive in — and Stripe is being integrated, after which they
                will arrive PAID. A sentence describing what state they arrive in today would go stale at
                exactly the moment nobody remembers to come back and change it. Leave it as it is. */}
            <div className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Take orders without payment</p>
                <p className="text-xs text-slate-500 mt-0.5">Adds a Confirm button when you add an order yourself, so you can place it now and take payment later. Turn this on if you take phone or advance orders.</p>
                <p className="text-xs text-slate-400 mt-1">This only affects orders you add. It doesn&apos;t affect online orders.</p>
              </div>
              <Toggle
                on={(form as any).show_paid_step === true}
                onToggle={() => { const next = (form as any).show_paid_step !== true; setForm(p => ({...p, show_paid_step: next} as any)); saveSetting('show_paid_step', next) }}
              />
            </div>
            {/* ── SETTING 2 — trucks.completion_presses (NEW, 10 August 2026) ────────────────────────
                🔴 A SIBLING, NOT A CHILD, AND IT MUST NEVER BE DISABLED BY THE SETTING ABOVE.
                It looks like a dependency and is not. "Take orders without payment" decides whether the
                Add Order panel can place an order unpaid; this decides how an unpaid order is COMPLETED.
                Unpaid orders arrive from the CUSTOMER PATH regardless — every truck has them — so
                greying this out when the setting above is off would hide the control for a case that
                still happens every day. The cash row below IS a genuine dependency and is treated as
                one; this is not, and the two must not be made to look alike.
                ⚠️ It reads slightly oddly in this group, and that is worth knowing rather than papering
                over: the group now holds two independent top-level settings plus one nested dependent,
                so the indentation below no longer means "depends on the row directly above" but
                "depends on this group". Reported rather than resolved.
                RADIO, not a toggle: two named alternatives that each need their own explanation, which
                is the deals "Apply to events" pattern in this same file — the page's existing shape for
                exactly this. A toggle would need a single label that reads true in one direction only.
                ⚠️ `completion_presses` must stay on update_truck's `allowed` list
                (app/api/manage/route.ts) — that list SILENTLY DROPS unlisted keys, so a missing entry
                means this appears to save, returns {ok:true}, and writes nothing. */}
            <div className="py-3">
              <p className="text-sm font-semibold text-slate-800">Completing an unpaid order</p>
              <p className="text-xs text-slate-500 mt-0.5">What happens when an unpaid order is ready to hand over.</p>
              <div className="flex flex-col gap-2 mt-2">
                {([
                  // ── 🔴 THE BUTTON NAMES HERE ARE QUOTED FROM THE CODE, NOT DESCRIBED ────────────
                  // “Mark paid & collected”, “Mark paid” and “Collected” are the EXACT `label` strings
                  // OrderCard renders (components/dashboard/OrderCard.tsx — the one-press branch, the
                  // two-press unpaid branch and the effectivePaid branch). Copy that names a button an
                  // operator cannot find sends them looking for it, so **verify these against the code
                  // before editing either side**, and change the copy to match the button — never the
                  // button to match the copy.
                  // ⚠️ TWO RENDERED VARIANTS THIS COPY DELIBERATELY DOES NOT NAME, because they are
                  // conditional and naming them here would make the common case unreadable: a PART-PAID
                  // order reads “Mark £X.XX paid” instead of “Mark paid”, and with "Do you take cash?"
                  // on, the two-press money button splits into “💷 Cash” / “💳 Card”. The cash row below
                  // is where that second one is explained.
                  // ⚠️ CURLY QUOTES, matching how this file already names a button inline (the paid-step
                  // and cash rows both do it). Not a new convention.
                  ['one', 'One press (“Mark paid & collected”)',
                   'Best when you take the money as you hand the food over. You get a single button, “Mark paid & collected”, which records the payment and clears the order together.'],
                  ['two', 'Two presses (“Mark paid” & “Collected”)',
                   'Best when payment and handover happen at different moments — someone pays at the hatch, then collects when it’s ready. You get two buttons: “Mark paid” first, then “Collected” when they take the food.'],
                ] as const).map(([v, lbl, help]) => (
                  /* 🔴 SHAPE COPIED VERBATIM FROM "Past the deadline" IN THIS SAME FILE — the page's
                     EXISTING two-option-with-descriptions control (button + drawn radio + font-medium
                     label over a text-xs help line). It replaced a native <input type="radio">, which
                     was mine and was wrong: it rendered in the browser's own accent rather than this
                     page's, so it read as a foreign control in a card of matched ones.
                     ⚠️ ORANGE HERE IS NOT AN INTRODUCTION, IT IS THIS PAGE'S SELECTED STATE. On Manage,
                     orange is the selection/focus colour throughout — focus:ring-orange-400 on every
                     input, accent-orange-600 on checkboxes, and border-orange-500 / bg-orange-500 on
                     exactly this radio. The reserved-meaning rule for orange ("a MONEY action") belongs
                     to the ORDER CARD's vocabulary, a different surface with a different palette. */
                  <button type="button" key={v}
                    onClick={() => { setForm(p => ({...p, completion_presses: v})); saveSetting('completion_presses', v) }}
                    className="w-full text-left flex items-start gap-2 cursor-pointer">
                    {/* Absent ⇒ resolve from show_paid_step, the SAME fallback lib/payments/paid-step.ts
                        uses, so this shows what the cards are actually doing before the column has been
                        backfilled. Never `?? 'one'` — that would render two-press trucks as one-press
                        for the length of the deploy window. */}
                    <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${completionPresses === v ? 'border-orange-500' : 'border-slate-300'}`}>{completionPresses === v && <span className="w-2 h-2 rounded-full bg-orange-500" />}</span>
                    <span className="text-sm">
                      <span className="font-medium text-slate-700">{lbl}</span>
                      <span className="block text-xs text-slate-400">{help}</span>
                      {/* ⚠️ THE SEPARATE BUTTON-NAMES LINE WAS REMOVED, NOT LOST. It rendered
                          “Mark paid & collected” / “Mark paid” then “Collected” beneath the
                          description — and the description now names those buttons in its own
                          sentence, so the line repeated it verbatim on the row directly below.
                          One fact, one place. The names still have to match the code; see the note
                          on the options array above. */}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {/* ── 🔴 DE-NESTED AGAIN ON 10 AUGUST 2026, AND NOT BY REVERSING THE RULE BELOW ──────────
                READ THIS BEFORE RE-INDENTING IT. The V9.6 note that follows is KEPT because its rule is
                still right; what changed is that the rule now points the other way.
                THE RULE: "structure should show the DEPENDENCY, not the semantics." Correct, and it is
                what put `pl-4` here when the cash split had exactly ONE parent (the paid step).
                WHAT CHANGED: the cash split now has TWO parents. It renders in two places, and after the
                settings were split those places answer to different settings — the Add Order panel's
                "Take payment" button splits on show_paid_step, and the ORDER CARD's "Mark paid" button
                splits on completion_presses === 'two'. Indentation is a SINGLE-PARENT notation: it can
                only point at the row directly above it, which is now "Completing an unpaid order" —
                only one of the two ways to unlock this. So the indent had stopped showing the
                dependency and started asserting a WRONG one. Applying the rule removes the indent.
                WHAT CARRIES THE DEPENDENCY INSTEAD: the disabled state plus the inline note, which now
                NAMES BOTH PARENTS. That is the other half of the V9.6 instruction — "structure shows
                the relationship, the text explains it. Both, not either" — with the half that can no
                longer be true dropped rather than left to mislead.
                ⚠️ SO THE GROUP IS NOW FLAT: two independent settings and one dependent, all at the same
                level, with the dependent saying in words what it depends on. If the cash split ever goes
                back to a single parent, re-indent it and restore the note below.
                ── the V9.6 reasoning, retained ──────────────────────────────────────────────────────
                ⚠️ THESE TWO WERE DELIBERATELY DE-NESTED ONCE, AND THAT WAS REVERSED ON A LAYOUT ARGUMENT.
                The de-nesting rationale — "they answer different questions: WHEN do we take money vs HOW
                does it arrive" — is still true and is still in the git history, which is exactly why this
                note exists. It was the WRONG TEST. Two settings can answer different questions and still
                have one DEPEND on the other, and structure should show the DEPENDENCY, not the semantics.
                THE DEPENDENCY IS DRIVEN BY LAYOUT AS MUCH AS BY MEANING. With the paid step OFF, one tap
                means "paid AND collected" — which is why the button reads `Paid & collected`. Splitting
                that into Cash/Card would make each button ALSO collect, but "Cash" does not say so, and
                the honest label `Cash & collected` needs ~110px against a 72px label box at the 240px KDS
                column. **There is no honest way to render the split when the button also collects.** So a
                truck wanting the split turns the paid step on — that step is what creates the moment where
                "how did they pay" is a separate question from "have they got their food".
                INDENT + TYPE SCALE copied from the notes-review sub-option above (pl-4, same
                text-sm/text-xs pair), NOT invented — one nesting treatment per card.
                ⚠️ Unlike that sub-option, this one is NOT conditionally rendered. It stays visible and
                goes DISABLED with the reason inline: structure shows the relationship, the text explains
                it. Both, not either. An operator who cannot find this setting is why it exists on two
                surfaces at all. */}
            <div className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Do you take cash?</p>
                <p className="text-xs text-slate-500 mt-0.5">Splits the payment button into "Cash" and "Card" so your takings reconcile against the till. You can turn this on for a single event from the dashboard.</p>
                {/* ── 🔴 THE GATE NOW HAS TWO PARENTS, AND IT HAD TO (10 August 2026) ─────────────
                    The cash split renders in two places, and after the settings were split those two
                    places answer to DIFFERENT settings:
                      • the Add Order panel's "Take payment" button splits when show_paid_step is on;
                      • the ORDER CARD's "Mark paid" button splits when completion_presses is 'two'.
                    Leaving this disabled on `show_paid_step !== true` alone would have been a real
                    defect introduced by this change: a truck with entry payment-only but a TWO-press
                    completion has a live "Mark paid" button that this control would refuse to split.
                    So the condition is the OR of the two, and the split is inert only when neither
                    surface can reach it — which is exactly the state it was inert in before.
                    ⚠️ The card's ONE-press button is still never split, and the reasoning above stands
                    unchanged: "Cash" that also collects cannot be labelled honestly at a 240px column.
                    ⚠️ DOES NOT auto-enable either parent. toggleOfflineProtection silently enabling
                    keep-screen-on is already recorded in the manual as a defect; one is enough.
                    ⚠️ DOES NOT write takes_cash=false when it becomes inert. The stored value is left
                    exactly as the operator set it and simply renders inert — never mutate what the
                    operator chose in order to tidy state. Re-enabling either parent restores it. */}
                {/* 🔴 THE GATE IS GONE — 10 August 2026. The cash split is now ALWAYS reachable, and
                    keeping a condition here would disable a toggle whose button is live on screen.
                    The Add Order confirm bar was rebuilt so that it ALWAYS offers a payment button:
                    with "Take orders without payment" OFF that is the single button, with it ON it is
                    the primary one. So the split has a live parent in every configuration, and the
                    previous OR condition ("paid step on, or completion set to two presses") is stale —
                    it would have disabled this for the nine trucks on OFF + one press, every one of
                    which now has a payment button in Add Order.
                    ⚠️ THE CARD'S ONE-PRESS BUTTON IS STILL NEVER SPLIT — `Cash & collected` cannot be
                    labelled honestly at a 240px KDS column. The split reaches the Add Order bar in all
                    states, and the card's `Mark paid` only under two presses. That asymmetry is
                    deliberate and unchanged. */}
              </div>
              <Toggle
                on={(form as any).takes_cash === true}
                onToggle={() => { const next = (form as any).takes_cash !== true; setForm(p => ({...p, takes_cash: next} as any)); saveSetting('takes_cash', next) }}
              />
            </div>
          </div>
        </div>

        {/* ── OPENING AND CLOSING — same sub-panel treatment. These two were loose rows describing one
            thing (when an event starts and stops taking online orders), so they group. Presentation
            only: same columns, same saveSetting calls, same defaults. */}
        <div className="pt-3 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 divide-y divide-slate-200/70">
            <div className="pb-3">
              <p className={SUBCARD_HEADING}>Opening and closing</p>
              <p className="text-xs text-slate-500 mt-0.5">When your events start and stop taking online orders.</p>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Open for orders automatically</p>
                <p className="text-xs text-slate-500 mt-0.5">Events open for online orders at your event start time</p>
              </div>
              <Toggle
                on={form.default_auto_open}
                onToggle={() => { const next = !form.default_auto_open; setForm(p => ({...p, default_auto_open: next})); saveSetting('default_auto_open', next) }}
              />
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Close for orders automatically</p>
                <p className="text-xs text-slate-500 mt-0.5">Events stop taking orders at your event end time</p>
              </div>
              <Toggle
                on={form.default_auto_close}
                onToggle={() => { const next = !form.default_auto_close; setForm(p => ({...p, default_auto_close: next})); saveSetting('default_auto_close', next) }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* ── PRE-ORDERS (V7.8 global-config) — plan-gated; hidden off-plan. SINGLE-SOURCE: the deadline
          RULE lives ONCE on the truck (gType/gVal/gAction → update_truck), applied to every included
          item; per-item stores ONLY inclusion (preorder_enabled → trimmed set_item_preorder_bulk).
          PAGE = master toggle + the one global-config block (stable deadline control + radio action) +
          a read-only list of included items + "Configure items". POPUP = category → sub-category → item
          inclusion picker (select-all per level). No per-item timing anywhere. Reuses loaded items +
          category sort_order; daily_cutoff = minutes-of-day (no UI tz math). */}
      {preorderCan && (() => {
        const groups = [
          ...categories.map(c => ({ id: c.id, name: c.name, items: items.filter(i => i.category_id === c.id) })),
          { id: '__uncat__', name: 'Uncategorized', items: items.filter(i => !i.category_id) },
        ].filter(g => g.items.length > 0)
        const includedCount = items.filter(i => i.preorder_enabled === true).length
        const cutoffStr = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
        const ruleSummary = `${describePreorderDeadline({ enabled: true, deadlineType: gType, deadlineValue: gVal, pastAction: gAction })} · ${gAction === 'force_pending' ? 'needs approval' : 'sold out'}`
        return (
          <Card className="p-4">
            {/* Card header (the master toggle moved down to the "Pre-order rule" line). */}
            <div>
              <p className="text-base font-bold text-slate-800">Pre-orders</p>
              <p className="text-xs text-slate-400 mt-0.5">Let customers order ahead of an event. Set when pre-orders open and the deadline rules below — these apply only to the items you select.</p>
            </div>

            {/* GLOBAL CONFIG — the ONE rule (truck row via update_truck). Stable deadline control + radios. */}
            <div className="mt-4">
              {/* OPEN-WINDOW (V8.3): when customers can START pre-ordering — Opens FIRST, 9 fixed options. */}
              <p className="text-sm font-semibold text-slate-800 mb-2">When pre-orders open</p>
              <select value={gOpen} onChange={e => saveOpenRule(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 mb-3">
                <option value="on_confirm">As soon as event is confirmed</option>
                <option value="7d">7 days before</option>
                <option value="6d">6 days before</option>
                <option value="5d">5 days before</option>
                <option value="4d">4 days before</option>
                <option value="3d">3 days before</option>
                <option value="2d">2 days before</option>
                <option value="1d">1 day before</option>
                <option value="day_of">On day of event</option>
              </select>
              {/* "Pre-order deadline" heading (prominent — matches the other section headings) + the master
                  toggle on the SAME line; explanatory + scope text below. */}
              <div className="flex items-center justify-between gap-3 mt-1">
                <p className="text-sm font-semibold text-slate-800">Pre-order deadline</p>
                <Toggle on={preordersOn} onToggle={() => saveMaster(!preordersOn)} />
              </div>
              <p className="text-xs text-slate-400 mt-0.5 mb-2">Set pre-order rules to prevent ordering of items after a specified time.</p>
              {/* Deadline + past-action dim when off; Opens + the toggle stay crisp. */}
              <div className={preordersOn ? '' : 'opacity-50'}>
              <label className="block text-xs font-bold text-slate-600 mb-1">Deadline</label>
              <div className="flex items-center gap-2 mb-3">
                <select value={gType} onChange={e => saveGlobalCfg({ type: e.target.value as any })}
                  className="border border-slate-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="hours_before">Hours before event</option>
                  <option value="daily_cutoff">Daily cutoff time</option>
                </select>
                {/* fixed slot — both controls live here; only one shows → no reflow on type switch */}
                <div className="w-32 flex-shrink-0">
                  <select value={gVal} onChange={e => saveGlobalCfg({ value: parseInt(e.target.value) })}
                    className={gType === 'hours_before' ? 'w-full border border-slate-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400' : 'hidden'}>
                    {Array.from({ length: 48 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{h} hour{h !== 1 ? 's' : ''}</option>)}
                  </select>
                  <input type="time" value={cutoffStr(gVal)} onChange={e => { const [h, m] = e.target.value.split(':').map(Number); saveGlobalCfg({ value: (h || 0) * 60 + (m || 0) }) }}
                    className={gType === 'daily_cutoff' ? 'w-full border border-slate-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400' : 'hidden'} />
                </div>
              </div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Past the deadline</label>
              <div className="space-y-1.5">
                {([['sold_out', 'Mark sold out', "Customers can't order it after the deadline."],
                   ['force_pending', 'Allow, require approval', "Customers can still order, but the order needs your approval (won't auto-accept)."]] as const).map(([v, lbl, help]) => (
                  <button type="button" key={v} onClick={() => saveGlobalCfg({ action: v })} className="w-full text-left flex items-start gap-2 cursor-pointer">
                    <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${gAction === v ? 'border-orange-500' : 'border-slate-300'}`}>{gAction === v && <span className="w-2 h-2 rounded-full bg-orange-500" />}</span>
                    <span className="text-sm"><span className="font-medium text-slate-700">{lbl}</span><span className="block text-xs text-slate-400">{help}</span></span>
                  </button>
                ))}
              </div>
              </div>
            </div>

            {/* INCLUDED ITEMS (read-only) + Configure button — the summary shows the GLOBAL rule. */}
            <div className={`mt-4 pt-3 border-t border-slate-100 ${preordersOn ? '' : 'opacity-50'}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-slate-800">Pre-order items <span className="font-normal text-slate-400">({includedCount})</span></p>
                <button type="button" onClick={() => setPoModalOpen(true)}
                  className="text-xs px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700">Configure items</button>
              </div>
              {includedCount === 0
                ? <p className={preordersOn ? 'text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2' : 'text-xs text-slate-400'}>No items selected yet — “Configure items” to add some.</p>
                : (
                  <>
                    <p className="text-xs text-slate-400 mb-2">All selected items use the rule above: <span className="text-slate-600">{ruleSummary}</span>.</p>
                    <div className="space-y-2">
                      {groups.map(g => {
                        const inc = g.items.filter(i => i.preorder_enabled === true)
                        if (inc.length === 0) return null
                        return (
                          <div key={g.id}>
                            <span className="text-[11px] font-bold uppercase tracking-wide text-orange-600">{g.name}</span>
                            <p className="text-sm text-slate-600 truncate">{inc.map(i => i.name).join(', ')}</p>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
            </div>

            {/* POPUP — pure INCLUSION picker: category → sub-category → item, select-all per level.
                Writes ONLY preorder_enabled via setItemIncluded / set_item_preorder_bulk (enabled-only). */}
            {poModalOpen && (
              <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPoModalOpen(false)}>
                <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <h3 className="font-black text-slate-900 mb-1">Choose pre-order items</h3>
                  <p className="text-xs text-slate-400 mb-4">Tick which items are pre-order. They all use the global rule ({ruleSummary}).</p>
                  <div className="space-y-4">
                    {groups.map(g => {
                      const gIds = g.items.map(i => i.id)
                      const gAllOn = gIds.length > 0 && g.items.every(i => i.preorder_enabled === true)
                      const subGroups = groupBySubcategory(g.items, subcategories.filter(s => s.category_id === g.id))
                      return (
                        <div key={g.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-orange-600">{g.name}</span>
                            <button type="button" onClick={() => setGroupIncluded(gIds, !gAllOn)}
                              className="text-[11px] font-semibold text-orange-600">{gAllOn ? 'Deselect all' : 'Select all'}</button>
                          </div>
                          {subGroups.filter(sg => sg.items.length > 0).map(sg => {
                            const sgIds = sg.items.map(i => i.id)
                            const sgAllOn = sg.items.every(i => i.preorder_enabled === true)
                            return (
                              <div key={sg.id ?? '__none__'} className="mt-1.5 ml-1">
                                {sg.name && (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{sg.name}</span>
                                    <button type="button" onClick={() => setGroupIncluded(sgIds, !sgAllOn)}
                                      className="text-[10px] font-semibold text-slate-400 hover:text-orange-600">{sgAllOn ? 'Deselect' : 'Select all'}</button>
                                  </div>
                                )}
                                <div className="space-y-1 mt-1">
                                  {sg.items.map(it => {
                                    const on = it.preorder_enabled === true
                                    return (
                                      <label key={it.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="checkbox" checked={on} onChange={() => setItemIncluded(it.id, !on)} className="w-4 h-4 accent-orange-600" />
                                        <span className="truncate text-slate-700">{it.name}</span>
                                      </label>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-end mt-5">
                    <button type="button" onClick={() => setPoModalOpen(false)} className="text-sm font-semibold px-3 py-2 rounded-lg bg-slate-800 text-white">Done</button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )
      })()}


      {/* Your trucks */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-slate-800">Your trucks</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage your trucks. Each has its own order screen and settings.
            </p>
          </div>
          <button
            onClick={handleAddVanClick}
            className="text-xs px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
          >
            + Add truck
          </button>
        </div>

        {vans.map(van => (
          <div key={van.id} className="mt-4 border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between py-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-900">{van.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setRenamingVanId(van.id); setRenameVanName(van.name) }}
                  className="text-xs px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                >
                  Rename
                </button>
                {vans.length > 1 && (
                  <button
                    onClick={() => setDeletingVan(van)}
                    className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Offline Order Protection card */}
            <div className={`mt-2 rounded-xl border p-3 transition-colors ${
              van.auto_pause_on_offline
                ? 'border-teal-200 bg-teal-50'
                : 'border-slate-100 bg-slate-50'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${
                    van.auto_pause_on_offline ? 'text-teal-800' : 'text-slate-800'
                  }`}>
                    Offline order protection
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {van.auto_pause_on_offline
                      ? 'Enabled — online orders pause if kitchen device loses connection'
                      : 'Disabled — online orders continue even if kitchen device goes offline'
                    }
                  </p>
                </div>
                <button
                  onClick={() => handleToggleAutoPause(van.id, !van.auto_pause_on_offline)}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 mt-0.5 ${
                    van.auto_pause_on_offline ? 'bg-green-500' : 'bg-slate-300'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    van.auto_pause_on_offline ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {van.auto_pause_on_offline && (
                <p className="mt-2 text-xs font-semibold text-amber-700">
                  {OFFLINE_PROTECTION_REMINDER}
                </p>
              )}

              {van.auto_pause_on_offline && showAutoPauseInfo === van.id && (
                <div className="mt-3 pt-3 border-t border-teal-200">
                  <p className="text-xs text-teal-700">
                    <strong>{OFFLINE_PROTECTION_EXPLAINER_LEAD}</strong> {OFFLINE_PROTECTION_EXPLAINER_BODY}
                  </p>
                  <button
                    onClick={() => setShowAutoPauseInfo(null)}
                    className="mt-3 w-full py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg"
                  >
                    Got it
                  </button>
                </div>
              )}
            </div>
            {/* ── VAN-SPECIFIC DISPLAY SETTINGS — its own sub-panel, a SIBLING of Offline order
                protection and Kitchen capacity rather than a rule-separated run of rows. Display
                settings and Kitchen capacity were previously ONE div under a single heading, so the
                capacity grid read as part of "Display settings"; they are separate concerns (what the
                order screen shows vs. how fast the kitchen can cook) and now box separately.
                Presentation only — same rows, same updateVanSetting calls, same defaults. */}
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-3">
              <p className={SUBCARD_HEADING}>Display settings</p>

              {/* Stage 1 (order-ready redesign): the "Show cooking step" toggle was REMOVED here — the
                  cooking step is now ALWAYS on (the KDS cook-view gate + OrderCard cook-mode were
                  de-coupled from show_cooking_step). The show_cooking_step column, the update_van_settings
                  handler for it, and the Van.show_cooking_step field are KEPT DORMANT so re-adding this
                  toggle later is just restoring this JSX + reverting those two reads. */}

              {/* Order-ready step — the TRUCK DEFAULT (order_ready_enabled). Per-event overrides live on
                  the dashboard's Menu & Stock tab. Stage 4 of the order-ready redesign. */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{SETTING_COPY.orderReady.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{SETTING_COPY.orderReady.help}</p>
                </div>
                <button
                  onClick={() => updateVanSetting(van.id, 'order_ready_enabled', !van.order_ready_enabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${
                    van.order_ready_enabled ? 'bg-green-500' : 'bg-slate-300'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    van.order_ready_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* ── BUZZERS — VAN-LEVEL, because they are physical stock in one vehicle ──────────────
                  ⚠️ Writes truck_vans.buzzer_count via update_van_settings, NOT a trucks column. A
                  two-van truck can have buzzers in one and not the other, and kitchen_capacity /
                  order_ready_enabled already put per-vehicle service settings here.
                  ⚠️ update_van_settings' destructure is an ALLOWLIST that drops unlisted keys silently
                  (app/api/manage/route.ts) — `buzzer_count` was added there AND to get_vans' named
                  select in the same change, or this would appear to save and write nothing.
                  Render/save shape copied from the "Order-ready step" row directly above and from the
                  show_paid_step / takes_cash pair in Order settings: label + explanation on the left,
                  toggle on the right, optimistic setVans then the write. The count select is nested
                  beneath as a CHILD because it is meaningless without the toggle — the same nesting
                  treatment as "Do you take cash?" under the paid step. */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{SETTING_COPY.buzzers.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {SETTING_COPY.buzzers.help}
                  </p>
                </div>
                <button
                  onClick={() => updateVanSetting(van.id, 'buzzer_count', van.buzzer_count == null ? BUZZER_DEFAULT_COUNT : null)}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${
                    van.buzzer_count != null ? 'bg-green-500' : 'bg-slate-300'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    van.buzzer_count != null ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              {/* CONDITIONALLY RENDERED, unlike the cash row's disabled-with-a-reason treatment: there
                  is no useful thing to say about a count when the van has no buzzers, and a disabled
                  1-20 select showing "10" would read as a stored value that is not stored. */}
              {van.buzzer_count != null && (
                <div className="flex items-center justify-between gap-3 pl-4">
                  <p className="text-sm text-slate-700">{SETTING_COPY.buzzers.countLabel}</p>
                  <select
                    value={van.buzzer_count}
                    aria-label="Number of buzzers"
                    onChange={e => updateVanSetting(van.id, 'buzzer_count', parseInt(e.target.value))}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    {/* 1..BUZZER_MAX_COUNT, plus the stored value if it is somehow outside that range —
                        the same append idiom the dashboard's capacity-window select uses, so an
                        out-of-range stored value is shown rather than silently coerced. */}
                    {Array.from({ length: BUZZER_MAX_COUNT }, (_, i) => i + 1)
                      .concat(van.buzzer_count > BUZZER_MAX_COUNT ? [van.buzzer_count] : [])
                      .map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Kitchen capacity — ONE aligned grid (V7.8 §42), matching the dashboard layout:
                CATEGORY · ITEMS · PREP · COUNTS TO TOTAL CAPACITY, with the Total-capacity ceiling row
                aligned under it via the SAME column template. Writes unchanged: updateCatField
                (prep_secs/batch_size via upsert_category), toggleCatCapacity (counts_toward_capacity),
                updateVanSetting (kitchen_capacity / capacity_window_mins). Cooking cats (prep>0)
                lock-checked; instant cats toggle once a capacity is set. Window stays plain minutes
                (engine reads capacity_window_mins as minutes). PrepTimeSelect off-grid-preserving. */}
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className={`${SUBCARD_HEADING} mb-3`}>Kitchen capacity</p>
              {categories.length > 0 && (
                <div className={`${KITCHEN_CAPACITY_GRID} gap-y-2 items-center`}>
                  <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">Category</span>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Items</span>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Prep</span>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 text-center leading-tight" title="Which categories count toward the total capacity. Cooked categories always count; tick instant ones (sides, dips, drinks) to include them.">Counts to total capacity</span>
                  {categories.map(cat => {
                    const hasCap = van.kitchen_capacity != null
                    const locked = cat.prep_secs > 0
                    const capDisabled = locked || !hasCap
                    // Shared <KitchenCapacityCategoryRow> (Fragment-of-cells) — the grid CONTAINER +
                    // header + total-capacity row stay inline (unchanged), so template-driven alignment
                    // is preserved. RPC writes stay HERE (updateCatField / toggleCatCapacity).
                    return (
                      <KitchenCapacityCategoryRow
                        key={cat.id}
                        categoryName={cat.name}
                        batchSize={cat.batch_size}
                        prepSecs={cat.prep_secs}
                        onBatchChange={val => updateCatField(cat, { batch_size: val ?? 0 })}
                        onPrepChange={secs => updateCatField(cat, { prep_secs: secs })}
                        showCountsColumn
                        countsToward={cat.counts_toward_capacity}
                        locked={locked}
                        capDisabled={capDisabled}
                        countsTitle={locked
                          ? 'Cooked — always counts (its prep & batch set the pace)'
                          : !hasCap ? 'Set a capacity to choose which categories count'
                          : 'Tick to include this instant category (sides, dips, drinks) in the shared per-window limit'}
                        onCountsChange={() => { if (!locked && hasCap) toggleCatCapacity(cat, !cat.counts_toward_capacity) }}
                      />
                    )
                  })}
                </div>
              )}
              {/* Total-capacity ceiling — SAME column template ⇒ aligns under the categories. ITEMS
                  column = kitchen_capacity ceiling, PREP column = window (plain minutes). */}
              <div className={`${KITCHEN_CAPACITY_GRID} items-center ${categories.length>0?'mt-2 pt-2.5 border-t border-slate-100':''}`}>
                <span className="text-sm font-semibold text-slate-800 min-w-0">Total capacity</span>
                <select
                  value={van.kitchen_capacity ?? ''}
                  aria-label="Total capacity (items)"
                  onChange={e => updateVanSetting(van.id, 'kitchen_capacity', e.target.value === '' ? null : parseInt(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">∞</option>
                  {Array.from({length:20},(_,i)=>i+1).map(n=>(
                    <option key={n} value={n}>{n} item{n!==1?'s':''}</option>
                  ))}
                </select>
                <select
                  value={van.capacity_window_mins ?? 5}
                  aria-label="Capacity window (minutes)"
                  disabled={van.kitchen_capacity == null}
                  onChange={e => updateVanSetting(van.id, 'capacity_window_mins', parseInt(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50">
                  {Array.from({length:20},(_,i)=>i+1).concat(((van.capacity_window_mins??5)>20)?[van.capacity_window_mins as number]:[]).map(n=>(
                    <option key={n} value={n}>every {formatPrepSecs(n*60)}</option>
                  ))}
                </select>
                <span/>
              </div>
              {van.kitchen_capacity == null && categories.length > 0 && (
                <p className="text-xs text-slate-400 mt-1.5">Set a capacity to choose which categories count.</p>
              )}
              {kitchenCapacityNeedsPrepWarning(van.kitchen_capacity, categories)&&(
                <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{KITCHEN_CAPACITY_WARNING}</div>
              )}
              <p className="text-xs text-slate-400 mt-2">{KITCHEN_CAPACITY_DESC}</p>
              <p className="text-xs text-slate-400 mt-1">{KITCHEN_CAPACITY_EXAMPLE}</p>
            </div>

            {renamingVanId === van.id && (
              <div className="mt-2 mb-2 flex gap-2">
                <input
                  type="text"
                  value={renameVanName}
                  onChange={e => setRenameVanName(e.target.value)}
                  autoFocus
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                />
                <button
                  onClick={() => confirmRenameVan(van.id)}
                  disabled={!renameVanName.trim()}
                  className="px-3 py-2 bg-orange-600 text-white text-sm font-medium rounded-xl disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  onClick={() => { setRenamingVanId(null); setRenameVanName('') }}
                  className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}

        {addingVan && (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newVanName}
              onChange={e => setNewVanName(e.target.value)}
              placeholder="e.g. Van 2, Festival Van"
              autoFocus
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm"
            />
            <button
              onClick={saveNewVan}
              disabled={!newVanName.trim()}
              className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-xl disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={() => { setAddingVan(false); setNewVanName('') }}
              className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl"
            >
              Cancel
            </button>
          </div>
        )}
      </Card>


      {/* Remove van confirmation modal */}
      {deletingVan && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Remove {deletingVan.name}?</h3>
              <p className="text-sm text-slate-500 mt-2">
                This van will be removed from your account and will no longer
                appear on your dashboard or in future events.
              </p>
              <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1.5">
                <p className="text-xs text-slate-600">
                  <span className="font-semibold">✓ Preserved:</span> All historical orders, sales data, and reports are kept permanently.
                </p>
                <p className="text-xs text-slate-600">
                  <span className="font-semibold">✓ Preserved:</span> Past event records linked to this van are unaffected.
                </p>
                <p className="text-xs text-red-600">
                  <span className="font-semibold">✕ Removed:</span> The van&apos;s kitchen screen link and settings will be deactivated.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingVan(null)}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50"
              >
                Keep van
              </button>
              <button
                onClick={confirmDeleteVan}
                className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-xl text-sm hover:bg-red-700"
              >
                Remove van
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Van billing modal */}
      {showVanBillingModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Add another truck</h3>
              <p className="text-sm text-slate-500 mt-2">
                Your {truck.plan === 'pro' ? 'Pro' : 'Max'} plan includes{' '}
                {truck.plan === 'pro' ? '2 trucks' : 'unlimited trucks'}.
                Adding an additional truck costs{' '}
                <strong>{vanPx(`£${VAN_ADDON_PRICE[truck.plan]}/month`)}</strong>{' '}
                and will be added to your next billing cycle.
              </p>
              <div className="mt-3 bg-slate-50 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-500">
                  ⚠️ Note: Billing adjustment is processed manually during early access.
                  You will receive a confirmation email within 24 hours.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowVanBillingModal(false)}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowVanBillingModal(false); setAddingVan(true) }}
                className="flex-1 bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm hover:bg-orange-700"
              >
                Add truck — {vanPx(`£${VAN_ADDON_PRICE[truck.plan]}/mo`)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Van upgrade modal (starter plan) */}
      {showVanUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-slate-900">Upgrade to add more vans</h3>
            <p className="text-sm text-slate-500">
              The Starter plan includes 1 van. Upgrade to Pro or Max to add additional vans.
            </p>
            {/* 🔴 iOS (App Store 3.1.1/3.1.3): the "View plans" CTA is suppressed, the EXPLANATION is not.
                An operator who hits the van limit still has to be told why the button did nothing — a
                silent no-op is a worse product than a limit with a reason. Cancel keeps `flex-1`, so as
                the only child it fills the row and no empty half is left behind.
                ⚠️ href repointed /pricing → ?tab=billing on ALL platforms: /pricing has never existed and
                this link has been a 404 for every operator since it shipped. See the report. */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowVanUpgradeModal(false)}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              {purchaseCtaAllowed() && (
                <a
                  href="?tab=billing"
                  className="flex-1 bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm text-center hover:bg-orange-700"
                >
                  View plans
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 text-center pb-2">Changes save automatically</p>

      {/* Emoji picker popup */}
      {showEmojiPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Choose your icon</h3>
              <button
                onClick={() => setShowEmojiPicker(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4">
              {FOOD_EMOJI_CATEGORIES.map(({ label, emojis }) => (
                <div key={label}>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                    {label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {emojis.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => {
                          setForm(f => ({ ...f, truck_emoji: emoji }))
                          saveFormField({ truck_emoji: emoji })
                          setShowEmojiPicker(false)
                        }}
                        className={`text-2xl p-1.5 rounded-lg transition-colors ${
                          form.truck_emoji === emoji
                            ? 'bg-orange-100 ring-2 ring-orange-400'
                            : 'hover:bg-slate-100'
                        }`}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 🔴 DANGER ZONE — LAST, OWNER ONLY ──────────────────────────────────────────────────────
          The Settings tab is owner+manager; this narrows to OWNER, so a manager sees nothing at all —
          not a disabled control, which would only advertise the action and invite a support ticket.
          Bottom of the tab: findable by scrolling (5.1.1(v) wants a reasonable path) without sitting
          anywhere near the settings an operator changes routinely. */}
      {userRole === 'owner' && <DeleteAccountSection truckName={truck?.name ?? ''} showToast={showToast} />}

      {/* ── 🔴 THERE IS NO LEGAL CARD HERE, AND THAT IS DELIBERATE — 10 August 2026. ────────────────
          A "Legal" card briefly sat at the foot of this tab, after the danger zone. It was removed the
          same day: Manage → Settings is owner/manager only (`staff` are redirected out of this page
          entirely, and appear in no tab's `roles` array), so putting the privacy policy here left STAFF
          WITH NO IN-APP ROUTE — a Guideline 5.1.1(i) failure, not a preference.
          🔴 THE LINKS LIVE IN THE ACCOUNT DROPDOWN — components/dashboard/UserMenu.tsx — which renders
          on the DASHBOARD for every role. ONE consistent location, reached the same way by owner,
          manager and staff. Do not add a second copy here: two locations was the thing the operator
          ruled against, and a duplicate is what drifts. See lib/legal.ts for the full surface list. */}
    </div>
  )
}

const formatTrialEndDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

// ── BillingTab ──────────────────────────────────────────────────
// TODO: Replace upgrade modal with Stripe Checkout/Customer Portal when Stripe Connect billing is implemented
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hello@villagefoodie.co.uk'

function BillingTab({ truck }: { truck: Truck | null }) {
  // 🔴 ABOVE the `if (!truck) return null` guard below — hooks must run in the same order on every
  // render, and these need no truck (the policy arrives by context). ⚠️ The three `useState` calls further
  // down are BELOW that guard and are a PRE-EXISTING rules-of-hooks violation; they are left exactly as
  // they are rather than moved, because relocating live billing state is not this task. Do not "tidy" these
  // two down to join them.
  const px = usePriceMask()
  // Footnote 2 does not MASK a value, it substitutes a whole different sentence, so it needs the raw
  // question rather than the masking function.
  const pricesVisible = usePricesVisible()
  if (!truck) return null
  const currentPlan = truck.plan
  // ── Z1: WHICH COLUMNS THE MATRIX SHOWS ──────────────────────────────────────────────────────────
  // 🔴 `showTrialColumn` REPLACES `trialActive` HERE, and the difference is the NULL case.
  // `trialActive` meant "a trial that is running NOW" — non-null AND future. Self-serve signup
  // provisions plan 'trial' with a NULL expiry (the trial has not STARTED), so under the old
  // condition the Trial column was hidden from the one operator with the most reason to look at it:
  // the person deciding whether what they have is worth paying for.
  //
  // The rule is "has the trial not ENDED", which is a different question from "is it running":
  //   NULL   → not started → SHOW   (the fix)
  //   future → running     → SHOW   (unchanged)
  //   past   → ended       → HIDE   (unchanged)
  //
  // ⚠️ `trialActive` WAS REMOVED, NOT LEFT BESIDE THIS. Its only three readers were this literal and
  // the two spacer rows below, all of which are the same layout decision — so a second condition
  // would have been dead code, and worse, the spacers MUST agree with the column count or every
  // section-header row misaligns by one cell. One condition, three readers, no way for them to
  // disagree.
  // ⚠️ NO TYPE WIDENING NEEDED: this changes WHEN 'trial' is included, never WHICH values can appear.
  // The union stays exactly as it was, and still cannot express 'demo' or 'tester' — deliberately.
  const showTrialColumn = truck.plan === 'trial' &&
    (truck.trial_expires_at === null || new Date(truck.trial_expires_at) > new Date())
  const billingPlans: readonly ('trial' | 'starter' | 'pro' | 'max')[] = showTrialColumn
    ? (['trial', 'starter', 'pro', 'max'] as const)
    : (['starter', 'pro', 'max'] as const)
  const isCurrent = (p: 'trial' | 'starter' | 'pro' | 'max') =>
    p === truck.plan
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [upgradeTarget, setUpgradeTarget] = useState<'pro' | 'max'>('max')
  const [showMatrix, setShowMatrix] = useState(false)
  const openUpgrade = (target: 'pro' | 'max') => { setUpgradeTarget(target); setShowUpgradeModal(true) }
  const plan = truck.plan

  // Pricing gate (shared with FeatureGate + the van add-on) — concrete prices show as "TBC" unless the
  // GLOBAL flag NEXT_PUBLIC_PRICING_PUBLISHED is 'true' AND this truck is not individually suppressed
  // (trucks.hide_pricing). Free / 0% / Pay at Hatch / Lifetime stay visible either way. Plan structure and
  // feature rows are unaffected. See lib/pricing.ts and components/PricingPolicy.tsx.
  // 🔴 The truck reaches this via context, not a prop — every price below is masked correctly without any
  // of the 17 call sites knowing which truck is on screen.

  const matrixContent = (
    <>
      {/* Plan columns header with prices — sticks to the TOP of the scrolling <main> (top-0) so the
          plan/price columns stay visible while scrolling the feature rows. <main> is the app-shell's
          scroll container and already sits directly under the fixed header+tabs, so the OLD top-[95px]
          body-scroll offset is wrong here (it stuck the header mid-screen in the iPad WKWebView). z-30
          keeps it above the rows; bg-white hides rows scrolling beneath. */}
      {/* Columns are equal height (so their bottom border-b-2 lines align) by matching per-column CONTENT
          height with items-START — NOT items-stretch, which just padded the shorter columns with empty
          space below their border, dropping every line down to the tallest column. */}
      <div className="flex items-start justify-between mb-2 sticky top-0 z-30 bg-white pt-2">
        <div className="flex-1" />
        {billingPlans.map(p => (
          <div key={p} className={`w-14 sm:w-28 text-center pb-3 border-b-2 ${
            isCurrent(p) ? 'border-orange-500' : 'border-slate-100'
          }`}>
            <p className={`text-[10px] sm:text-xs font-semibold uppercase tracking-widest ${
              isCurrent(p) ? 'text-orange-500' : 'text-slate-400'
            }`}>{p}</p>
            {/* ── 🔴 text-[13px] AND whitespace-nowrap ON MOBILE. THIS IS THE "£29/mo£49/mo" FIX. ─────
                The column is `w-14` (56px) and the price was `text-base` (16px) bold, at which "£29/mo"
                measures about 56.5px — wider than the column it sits in, with no space character to
                wrap on. So it overflowed into its neighbour and the two prices ran together. 13px puts
                it at about 46px with ~5px clear either side; `whitespace-nowrap` makes the no-wrap
                explicit rather than accidental.
                ⚠️ ADAPTED, NOT COPIED. The landing table solves the same problem with `--cmp-col:
                3.6rem` and a `.78rem` price in its own stylesheet; that is its typography, not this
                page's. What is shared here is the DIAGNOSIS — a price must fit its column and must not
                wrap — not the numbers. `sm:text-xl` is untouched, so nothing changes from 640px up. */}
            <p className={`text-[13px] sm:text-xl font-bold mt-1 whitespace-nowrap ${
              isCurrent(p) ? 'text-orange-600' : 'text-slate-900'
            }`}>{px(p === 'trial' ? 'Free' : PLAN_PRICES[p])}</p>
            <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
              {/* ── 🔴 THE TRIAL COLUMN'S RULE LINES UP NOW, AND THE COMPENSATION DANCE IS GONE. ──────
                  This read `{p === 'trial' ? <span className="invisible">&nbsp;</span> : …}` — ONE
                  invisible line against the others' two, chosen to offset the fact that "Free trial"
                  wrapped to two lines at 56px while "£29/mo" did not. Two variables cancelling each
                  other is why the border-b-2 under Free trial still sat off the others' line: it only
                  balances if both wrap exactly as predicted, at every width and every font metric.
                  🔴 BOTH VARIABLES ARE REMOVED INSTEAD OF BALANCED. The price is now one line in EVERY
                  column ("Free" for trial, matching the landing table's own PLAN_PRICE_LABEL, which
                  shows "Free" rather than "Free trial" for the same reason), and the placeholder is now
                  the SAME STRING as the real subtitle, merely invisible — so it wraps identically, at
                  any width, under any font. The four columns cannot disagree in height.
                  ⚠️ The trial END DATE is unaffected and still shown by the reminder banner and the
                  "won't be charged until" line — this is the column header, not the trial's terms. */}
              {p === 'trial'
                ? <span className="invisible" aria-hidden="true">per truck / month</span>
                : <span>per truck / month</span>}
            </p>
          </div>
        ))}
      </div>
      {/* Transaction fees */}
      <div className="mb-2">
        <div className="flex items-center py-2 border-t-2 border-slate-100 mt-3">
          <span className="flex-1 text-xs font-bold text-slate-900 uppercase tracking-wider">Transaction fees</span>
          {showTrialColumn && <div className="w-14 sm:w-28" />}<div className="w-14 sm:w-28" /><div className="w-14 sm:w-28" /><div className="w-14 sm:w-28" />
        </div>
        {TRANSACTION_ROWS.map(row => (
          <div key={row.name} className="flex items-start py-2.5 border-t border-slate-100">
            <div className="flex-1 pr-4">
              {/* ⚠️ NO pl-3 HERE EITHER. This carried the same `pl-3 sm:pl-0` the feature titles did —
                  12px of left padding on mobile only — and it is removed the same way: deleted, not
                  cancelled by an offset somewhere else. Every label in this table, fee and feature
                  alike, now starts at its row's content edge, which is where the feature descriptions
                  have always started. */}
              <div className="text-sm font-medium text-slate-800">
                {row.name}
                {row.footnote && <sup className="text-slate-500 text-[10px] ml-0.5">{row.footnote}</sup>}
              </div>
            </div>
            {billingPlans.map(p => (
              <div key={p} className={`w-14 sm:w-28 text-center text-xs sm:text-sm font-semibold leading-snug ${
                isCurrent(p) ? 'text-orange-600' : 'text-slate-600'
              }`}>
                {/* 🔴 `row.cells[p]` — THE TRIAL COLUMN NOW READS TRIAL DATA. This line used to read
                    `p === 'trial' ? row.values.starter : …`, borrowing STARTER's cells because the
                    shared constant had no trial column to read. That is why Billing told a trial
                    operator their online orders were "Pay at Hatch" while the landing page said
                    "Unlimited / Free" — a trial carries MAX's feature set (lib/features.ts:
                    `TRIAL_FEATURES = [...MAX_FEATURES]`), so online payments are included, and this
                    page's own trial banner already said "completely free*". The landing page was right;
                    the fallback was never a claim anyone made. */}
                {px(row.cells[p])}
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* Feature sections */}
      {FEATURE_SECTIONS.map(section => (
        <div key={section.title} className="mb-2">
          <div className="flex items-center py-2 border-t-2 border-slate-100 mt-3">
            <span className="flex-1 text-xs font-bold text-slate-900 uppercase tracking-wider">
              {section.title}
            </span>
            {showTrialColumn && <div className="w-14 sm:w-28" />}<div className="w-14 sm:w-28" /><div className="w-14 sm:w-28" /><div className="w-14 sm:w-28" />
          </div>
          {section.rows.map(row => (
            <div key={row.name} className="flex items-center py-2 border-t border-slate-100">
              <div className="flex-1 pr-4">
                {/* ── 🔴 NO pl-3 HERE. THE INDENT WAS REMOVED, NOT CANCELLED. ────────────────────────
                    This read `text-sm text-slate-800 pl-3 sm:pl-0`. That `pl-3` put 12px of left
                    padding on the TITLE ONLY, on mobile only — the description `<p>` below is its
                    sibling inside the same `flex-1 pr-4` wrapper and has never had any left padding, so
                    the two did not share a left edge at any width below sm:. Nothing compensating was
                    added; the padding that produced the offset is simply gone, and both elements now
                    start at the wrapper's content edge, as they do at sm: and above and as they always
                    do on the landing page (`.cmp2-label` sets `padding-right` only, and `.f-name` /
                    `.f-desc` are plain blocks with no inset of their own).
                    ── ⚠️ font-semibold ADDED TO MATCH THE LANDING PAGE'S WEIGHT, NOT ITS SIZE. ───────
                    This div carried NO font-weight class at all, so it rendered at 400 while the
                    landing page's `.f-name` is `font-weight: 600`. `font-semibold` is 600 — the same
                    weight, reached through Manage's own scale. `text-sm` and `text-slate-800` are
                    deliberately UNCHANGED: the two pages size and colour text differently on purpose. */}
                <div className="text-sm font-semibold text-slate-800">
                  {row.name}
                  {row.footnote && <sup className="text-slate-500 text-[10px] ml-0.5">{row.footnote}</sup>}
                </div>
                {row.detail && <p className="text-xs text-slate-600 mt-0.5">{row.detail}</p>}
              </div>
              {billingPlans.map(p => {
                const val = p === 'trial'
                  ? (row.name === 'Online ordering — Pay at Hatch' ? true : row.max)
                  : row[p as 'starter' | 'pro' | 'max']
                return (
                  <div key={p} className="w-14 sm:w-28 text-center">
                    {val === true && (
                      <span className={`text-sm font-semibold ${isCurrent(p) ? 'text-orange-500' : 'text-slate-500'}`}>✓</span>
                    )}
                    {val === false && (
                      <span className="text-slate-300 text-sm">—</span>
                    )}
                    {val === 'coming_soon' && (
                      <span className="text-xs text-slate-400 italic leading-tight">Coming soon</span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ))}
    </>
  )

  const footnotesContent = (
    <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-1.5">
      {FOOTNOTES.map(f => (
        <p key={f.number} className="text-xs text-slate-700">
          <sup>{f.number}</sup> {pricesVisible || f.number !== '2'
            ? f.text
            : 'Online payments are powered by Stripe Connect. Platform and card processing fees are TBC and will be confirmed at launch.'}
        </p>
      ))}
    </div>
  )

  const billingCard = (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <p className="text-sm font-semibold text-slate-900 mb-4">Billing & payments</p>
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-amber-500 flex-shrink-0 mt-0.5">⚙️</span>
        <div>
          <p className="text-sm font-medium text-amber-800">Payment setup coming soon</p>
          <p className="text-xs text-amber-700 mt-0.5">
            We&apos;re setting up our payment system. During early access, billing is handled manually.
            We&apos;ll contact you when automated billing is ready.
          </p>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          {truck.name} · {PLAN_META[currentPlan]?.name ?? currentPlan} plan{truck.trial_expires_at ? ' (trial)' : ''}
        </p>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">

      {/* TRIAL: payment capture is urgent — show ABOVE the matrix */}
      {plan === 'trial' && (
        <>
          <div className="bg-white border-0 shadow-none rounded-none px-0 sm:border sm:border-slate-200 sm:shadow-sm sm:rounded-2xl sm:px-6 py-6">
            <div className="mb-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Current plan</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {PLAN_META[currentPlan]?.name ?? currentPlan}
              </p>
              <p className="text-sm text-slate-700 mt-0.5">{px(PLAN_PRICES[currentPlan])}</p>
              <p className="text-sm text-slate-700 mt-0.5">{PLAN_DESCRIPTIONS[currentPlan]}</p>
              {truck.trial_expires_at && (
                <p className="text-xs text-amber-600 mt-1">
                  Trial ends {formatDate(truck.trial_expires_at)}
                </p>
              )}
            </div>
            <div className="rounded-xl p-4 bg-orange-50 border border-orange-200">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                <div>
                  {/* ── Y3: NOT-STARTED vs RUNNING ────────────────────────────────────────────
                      🔴 The null fallback used to read "Your trial ends soon" — false and alarming for
                      a self-serve operator whose trial has NOT STARTED, and the state every one of
                      them is now provisioned into (plan 'trial', trial_expires_at null).
                      The second line was ALSO wrong in that state, though only half: "You're on Max
                      features" is TRUE (canAccess grants the trial set on a null expiry), but "choose
                      a plan before your trial ends" points at an ending that has not begun.
                      ⚠️ THE DATED BRANCH IS BYTE-IDENTICAL to what Gusto and RTF read today. */}
                  <p className="text-sm font-bold text-slate-900">
                    {truck.trial_expires_at
                      ? `Your trial ends ${formatDate(truck.trial_expires_at)}`
                      : TRIAL_NOT_STARTED_HEADING}
                  </p>
                  {/* 🔴 iOS (App Store 3.1.1/3.1.3) — the dated branch is SPLIT, not gated whole.
                      "You're on Max features." is a FACT about the account and must survive; "Choose a plan
                      before your trial ends to keep access." is an instruction to buy, on a screen where iOS
                      has no way to buy, so it goes.
                      ⚠️ THE WEB STRING IS ONE UNTOUCHED LITERAL, not two halves concatenated. Assembling it
                      from pieces would put a space boundary between them that nothing tests, and this is the
                      sentence the manual records as byte-identical to what Gusto and RTF read today. The
                      shorter iOS-only string is the second literal; web and Android never evaluate it.
                      ⚠️ NOT-STARTED branch untouched — TRIAL_NOT_STARTED_BILLING already contains no
                      instruction to buy, so it needs no gate on either platform. */}
                  <p className="text-xs text-slate-600 mt-0.5">
                    {truck.trial_expires_at
                      ? (purchaseCtaAllowed()
                          ? "You're on Max features. Choose a plan before your trial ends to keep access."
                          : "You're on Max features.")
                      : TRIAL_NOT_STARTED_BILLING}
                  </p>
                </div>
                {/* 🔴 iOS (App Store 3.1.1/3.1.3): the two upgrade buttons are suppressed. The whole
                    BUTTON COLUMN is gated rather than each button, so nothing is left holding an empty
                    flex child — the text block beside it becomes the sole child of the row and fills it. */}
                {purchaseCtaAllowed() && (
                  <div className="flex flex-col gap-2 sm:flex-shrink-0">
                    <button
                      onClick={() => openUpgrade('max')}
                      className="w-full sm:w-auto px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-xl whitespace-nowrap hover:bg-orange-700 transition-colors"
                    >
                      Upgrade to Max — {px('£49/mo')}
                    </button>
                    <button
                      onClick={() => openUpgrade('pro')}
                      className="w-full sm:w-auto px-4 py-2 border border-orange-300 text-orange-600 text-sm font-medium rounded-xl whitespace-nowrap hover:bg-orange-50 transition-colors"
                    >
                      Choose Pro — {px('£29/mo')}
                    </button>
                  </div>
                )}
              </div>
            </div>
            {/* 🔴 iOS (App Store 3.1.1/3.1.3): the WHOLE reassurance block goes, container and all.
                On iOS there is no charging mechanism reachable at all, so a promise about WHEN charging
                begins describes something the operator cannot see, act on or verify. Half of it would read
                stranger than none.
                ⚠️ THE CONTAINER IS GATED, NOT JUST THE CHARGING PARAGRAPH — and that deliberately takes the
                "*Standard card processing fees" footnote with it. That line is an asterisk with no
                antecedent once the sentence above it is gone: left behind it would be a lone centred grey
                footnote marking nothing, which is exactly the orphan the no-empty-shells rule exists for.
                Gating the fragment also takes its `mt-3` / `mt-1` spacing, so no dangling vertical gap is
                left between the trial card and billingCard.
                ✅ The trial END DATE survives — it renders twice above, in the "Trial ends {date}" line and
                the "Your trial ends {date}" heading, neither of which is touched here. An iOS operator is
                never left without knowing when access lapses.
                🔴 NO REPLACEMENT COPY IS ADDED. Pointing at hatchgrab.com to manage a plan is the precise
                thing 3.1.3 prohibits outside the US storefront — it would be worse than what is removed. */}
            {truck.trial_expires_at && purchaseCtaAllowed() && (
              <>
                <p className="text-xs text-center text-slate-500 mt-3">
                  🔒 You won&apos;t be charged anything until your trial ends on{' '}
                  {formatTrialEndDate(truck.trial_expires_at)}.
                  Automated billing activates at the end of your trial — cancel anytime before then at no cost.
                </p>
                <p className="text-xs text-center text-slate-400 mt-1">
                  *Standard card processing fees apply on online orders
                </p>
              </>
            )}
          </div>
          {/* 🔴 iOS (App Store 3.1.1/3.1.3): "set up payment" is an instruction to buy, so it is suppressed.
              ⚠️ The `-mt-3` that pulls this line up to the card above it goes WITH the line — leaving the
              paragraph out but its negative margin behind would collapse the gap between the trial card and
              billingCard on iOS only. */}
          {purchaseCtaAllowed() && (
            <p className="text-xs text-amber-600 font-medium -mt-3">
              ⏱ Set up payment before your trial ends to keep access
            </p>
          )}
          {billingCard}
          <div className="bg-white border-0 shadow-none rounded-none px-0 sm:border sm:border-slate-200 sm:shadow-sm sm:rounded-2xl sm:px-6 py-6">
            {matrixContent}
            {footnotesContent}
          </div>
        </>
      )}

      {/* STARTER: upgrade prompt + payment ready below */}
      {plan === 'starter' && (
        <>
          <div className="bg-white border-0 shadow-none rounded-none px-0 sm:border sm:border-slate-200 sm:shadow-sm sm:rounded-2xl sm:px-6 py-6">
            <div className="mb-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Current plan</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {PLAN_META[currentPlan]?.name ?? currentPlan}
              </p>
              <p className="text-sm text-slate-700 mt-0.5">{px(PLAN_PRICES[currentPlan])}</p>
              <p className="text-sm text-slate-700 mt-0.5">{PLAN_DESCRIPTIONS[currentPlan]}</p>
            </div>
            {/* 🔴 iOS (App Store 3.1.1/3.1.3): the ENTIRE panel is gated, heading included. Gating only the
                two buttons would leave a bordered grey box containing the words "Upgrade your plan" and
                nothing else — an empty shell that reads as a broken screen and still says "upgrade".
                What a Starter operator keeps on iOS: their current plan above, and the full feature matrix
                below, which shows exactly what each tier includes. */}
            {purchaseCtaAllowed() && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-sm font-bold text-slate-900 mb-3">Upgrade your plan</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => openUpgrade('pro')}
                    className="flex-1 py-2.5 border border-orange-200 text-orange-600 text-sm font-semibold rounded-xl hover:bg-orange-50 transition-colors"
                  >
                    Pro — {px('£29/mo')}
                  </button>
                  <button
                    onClick={() => openUpgrade('max')}
                    className="flex-1 py-2.5 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-700 transition-colors"
                  >
                    Max — {px('£49/mo')}
                  </button>
                </div>
              </div>
            )}
          </div>
          {billingCard}
          <div className="bg-white border-0 shadow-none rounded-none px-0 sm:border sm:border-slate-200 sm:shadow-sm sm:rounded-2xl sm:px-6 py-6">
            {matrixContent}
            {footnotesContent}
          </div>
        </>
      )}

      {/* PRO / MAX: already paying — minimal friction */}
      {(plan === 'pro' || plan === 'max') && (
        <>
          <div className="bg-white border-0 shadow-none rounded-none px-0 sm:border sm:border-slate-200 sm:shadow-sm sm:rounded-2xl sm:px-6 py-6">
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Current plan</p>
              <p className="text-2xl font-black text-slate-900">
                {plan === 'pro' ? 'Pro' : 'Max'}
              </p>
              <p className="text-sm text-slate-500 mt-0.5">
                {px(plan === 'pro' ? '£29/mo' : '£49/mo')} per truck · renews automatically
              </p>
            </div>
            <div className="mb-6">
              <button
                onClick={() => setShowMatrix(!showMatrix)}
                className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                {showMatrix ? '▲ Hide' : '▼ Compare all plans'}
              </button>
              {showMatrix && matrixContent}
            </div>
            {footnotesContent}
          </div>
          {billingCard}
        </>
      )}

      {/* Upgrade interest modal.
          🔴 SUPPRESSED ENTIRELY ON iOS (App Store 3.1.1/3.1.3) — this modal IS the external purchase
          mechanism the guideline names: its primary action is a `mailto:` that leaves the app with a
          pre-filled upgrade request. Nothing in it is informational, so nothing survives the gate.
          ⚠️ SECOND GUARD, deliberately. All four `openUpgrade()` callers are already suppressed above, so
          `showUpgradeModal` cannot become true on iOS today. It is gated here as well because this is the
          single highest-risk element in the app for review, and a future fifth caller must not be able to
          surface it by omission. */}
      {showUpgradeModal && purchaseCtaAllowed() && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Upgrade to {upgradeTarget === 'max' ? 'Max' : 'Pro'}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {upgradeTarget === 'max'
                  ? `${px('£49/month')} — High-volume operations & festivals`
                  : `${px('£29/month')} — Busy trucks scaling pre-orders`
                }
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-sm text-slate-700">
                We&apos;re setting up automated billing. To upgrade now, drop us a message and we&apos;ll get you set up within 24 hours.
              </p>
            </div>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Upgrade to ${upgradeTarget === 'max' ? 'Max' : 'Pro'} — ${truck.name}&body=Hi, I'd like to upgrade ${truck.name} to the ${upgradeTarget === 'max' ? `Max (${px('£49/mo')})` : `Pro (${px('£29/mo')})`} plan.`}
              className="w-full py-3 bg-orange-600 text-white text-sm font-semibold rounded-xl text-center hover:bg-orange-700 transition-colors"
            >
              Email us to upgrade
            </a>
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="w-full py-3 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ReportsTab ──────────────────────────────────────────────────
interface ReportData {
  totalOrders?: number
  totalRevenue?: number
  avgOrder?: number
  topItems?: Array<{ name: string; qty: number; revenue: number }>
  dealsRedeemed?: number
  dealSavings?: number
  upsellRevenue?: number
  whatsappStats?: { total: number; handled: number; misses: number } | null
  orders?: Array<any>
  /** Keyed by EVENT ID (V9.6, was event_date). Carries van_id so the van filter can select events. */
  eventsMap?: Record<string, { venue_name: string | null; town: string | null; van_id: string | null }>
  /** Date-keyed fallback, first-wins — labels orders whose event_id is NULL exactly as before. */
  eventsByDate?: Record<string, { venue_name: string | null; town: string | null }>
  itemCategories?: Record<string, string>
  categoryOrder?: string[]
}
interface RecentEvent { id: string; venue_name: string | null; event_date: string; status: string }

function fmtGBP(n: number) { return `£${n.toFixed(2)}` }

type ExplodedItem = {
  orderId: string; dateStr: string; eventStr: string; timePlaced: string
  collectionTime: string; customerName: string; orderType: string; orderTotal: number
  itemLabel: string; qty: number; basePrice: number; modStr: string; noteStr: string; itemTotal: number
}
function explodeOrderItems(
  orders: any[],
  // V9.6: a RESOLVER, not the raw map — the caller now owns the id-then-date fallback so all three
  // label sites (this CSV, the orders CSV, the on-screen history) resolve venues identically.
  resolveEvent: (o: any) => { venue_name: string | null; town: string | null } | null
): ExplodedItem[] {
  const rows: ExplodedItem[] = []
  for (const o of orders) {
    const createdAt = o.created_at ? new Date(o.created_at) : null
    const dateStr = createdAt
      ? `${String(createdAt.getDate()).padStart(2, '0')}/${String(createdAt.getMonth() + 1).padStart(2, '0')}/${createdAt.getFullYear()}`
      : ''
    const timePlaced = createdAt
      ? formatTime(`${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`)
      : ''
    const ev = resolveEvent(o)
    const eventStr = ev ? [ev.venue_name, ev.town].filter(Boolean).join(', ') : 'Unknown event'
    const collectionTime = o.slot ? formatTime(o.slot) : 'ASAP'
    const customerName = (o.customer_name && o.customer_name !== 'Walk-up') ? o.customer_name : 'Unknown'
    const orderType = o.customer_email ? 'Customer online' : 'Placed by truck'
    const dealItemMap: Record<string, string> = {}
    for (const d of (Array.isArray(o.deals) ? o.deals : []))
      for (const itemName of Object.values(d.slots || {}))
        if (itemName && !dealItemMap[itemName as string]) dealItemMap[itemName as string] = d.name
    for (const item of (Array.isArray(o.items) ? o.items : [])) {
      const dealName = dealItemMap[item.name]
      const qty = item.quantity || 1
      const modSum = (item.modifiers || []).reduce((s: number, m: any) => s + (m.price || 0), 0)
      rows.push({
        orderId: o.id, dateStr, eventStr, timePlaced, collectionTime, customerName, orderType, orderTotal: o.total || 0,
        itemLabel: dealName ? `🎁 ${item.name} (${dealName})` : item.name,
        qty,
        basePrice: (item.unit_price || 0) - modSum,
        modStr: (item.modifiers || []).filter((m: any) => m.price > 0).map((m: any) => `${m.name} +£${m.price.toFixed(2)}`).join('; '),
        noteStr: item.specialInstructions || '',
        itemTotal: (item.unit_price || 0) * qty,
      })
    }
  }
  return rows
}

function ReportsTab({ truck, api }: { truck: Truck | null; api: (a: string, e?: any) => Promise<any> }) {
  const hasAdvanced = truck
    ? canAccess(truck.plan, 'advanced_reporting', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)
    : false
  const isoDate = (offset: number) => {
    const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().split('T')[0]
  }
  // Reports are past/present only — cap the date pickers at TRUCK-LOCAL today (not device-local, so a
  // near-midnight viewer in another tz can't pick the truck's "tomorrow"). max= blocks the picker UI; the
  // onChange clamp blocks keyboard-typed dates too.
  const todayLocal = getLocalDateInTz((truck as any)?.timezone ?? 'Europe/London')
  const clampPast = (v: string) => (v && v > todayLocal ? todayLocal : v)
  const [filterMode, setFilterMode] = useState<'date' | 'event'>(hasAdvanced ? 'date' : 'event')
  const [itemView, setItemView] = useState<'orders' | 'items'>('orders')
  // Mobile order-history: which order rows are tap-expanded (desktop shows the full table, no expand).
  const [expandedOrders, setExpandedOrders] = useState<Set<string | number>>(new Set())
  const toggleOrderExpand = (id: string | number) => setExpandedOrders(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const [dateFrom, setDateFrom] = useState(() => isoDate(-7))
  const [dateTo, setDateTo]     = useState(() => isoDate(-1))
  const [reportEventId, setReportEventId] = useState('')
  const [reportData, setReportData] = useState<ReportData | null | undefined>(undefined)
  const [reportLoaded, setReportLoaded] = useState(false)
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([])
  const [loading, setLoading] = useState(false)
  // Same shape as ScheduleTab: vans for the filter, and TRANSIENT filter state — per-surface, reset on
  // remount, never written to the DB, localStorage or the URL. A filter is a view, not a setting.
  const [vans, setVans] = useState<{ id: string; name: string }[]>([])
  const [vanFilter, setVanFilter] = useState<VanFilterValue>(VAN_FILTER_ALL)

  useEffect(() => {
    api('get_vans').then(r => setVans((r.vans || []).map((v: any) => ({ id: v.id, name: v.name })))).catch(() => {})
    api('get_recent_events').then(r => setRecentEvents(r.events || [])).catch(() => {})
    if (hasAdvanced) loadReport()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const loadReport = async (from = dateFrom, to = dateTo, eventId = reportEventId, mode = filterMode) => {
    setLoading(true)
    try {
      const r = await api('get_report', {
        dateFrom: mode === 'date' ? from : undefined,
        dateTo:   mode === 'date' ? to   : undefined,
        eventId:  mode === 'event' && eventId ? eventId : undefined,
      })
      setReportData(r.report ?? null)
    } catch { setReportData(null) }
    finally { setLoading(false); setReportLoaded(true) }
  }

  // ── Client-side derived breakdowns ─────────────────────────────
  const eventsMap: Record<string, { venue_name: string | null; town: string | null; van_id: string | null }> = reportData?.eventsMap ?? {}
  const eventsByDate: Record<string, { venue_name: string | null; town: string | null }> = reportData?.eventsByDate ?? {}
  // ONE venue resolver for all three label sites. Event ID first (correct on multi-event dates), falling
  // back to the date map so an order with a NULL event_id labels exactly as it did before V9.6.
  const resolveEvent = (o: any) => eventsMap[o?.event_id] ?? eventsByDate[o?.event_date] ?? null

  // ── 🔴 THE VAN FILTER SELECTS EVENTS, NOT ORDERS (V9.6) ──────────────────────────────────────────
  // An order is in scope IFF ITS EVENT IS. Every order of a selected event is included WHOLE — nothing is
  // apportioned, nothing is split.
  // 🔴 orders.van_id IS NOT USED HERE AND MUST NOT BE. It is a KDS ROUTING field with no accounting
  // meaning: NULL on ~78% of live orders, because the walk-up path never stamps it while the customer
  // path does. Filtering money by it would drop three quarters of the revenue out of every van's total.
  // (That NULL rate is a real data-quality issue — for a different pass. It is not the report's business.)
  //
  // ⚠️ AN ORDER WITH NO event_id IS IN NO VAN'S REPORT — NOT EVEN "Unassigned". "Unassigned" means an
  // EVENT that has no van; an order with no EVENT is a different thing, and folding the two together
  // would invent a bucket that misrepresents both. Such orders appear under "All trucks" ONLY, which is
  // the default, so they are never hidden from an unfiltered report — but they ARE unreachable while a
  // van filter is active. That is stated, not silent.
  const orderInScope = (o: any) => {
    if (vanFilter === VAN_FILTER_ALL) return true
    const ev = eventsMap[o?.event_id]
    if (!ev) return false
    return matchesVanFilter(ev.van_id, vanFilter)
  }
  const allOrders: any[] = reportData?.orders ?? []
  // Filtered ONCE, here. Every breakdown below (revenue, top items, deals, item view, both CSVs, the
  // order history table) derives from `orders`, so they all narrow together and none can disagree.
  const orders: any[] = allOrders.filter(orderInScope)
  const hasUnassignedEvents = Object.values(eventsMap).some(e => !e.van_id)

  const revenueBreakdown = useMemo(() => {
    // Only count revenue from orders that weren't cancelled/rejected
    const revenueOrders = orders.filter((o: any) => !['cancelled', 'rejected'].includes(o.status))
    const itemCategories = reportData?.itemCategories ?? {}
    const categoryOrder = reportData?.categoryOrder ?? []
    let dealRev = 0, mods = 0
    const catBase: Record<string, number> = {}   // non-deal menu-item base revenue, grouped by category
    for (const o of revenueOrders) {
      const dealItemNames = new Set<string>()
      for (const d of (Array.isArray(o.deals) ? o.deals : [])) {
        dealRev += d.price || 0
        for (const itemName of Object.values(d.slots || {})) if (itemName) dealItemNames.add(itemName as string)
      }
      for (const item of (Array.isArray(o.items) ? o.items : [])) {
        const qty = item.quantity || 1
        // unit_price = base_menu_price + sum(mod.price); upcharges = sum(mod.price × qty).
        const modSum = (item.modifiers || []).reduce((s: number, m: any) => s + (m.price || 0), 0)
        mods += modSum * qty
        if (dealItemNames.has(item.name)) continue   // deal member → its value is in the deal price
        const cat = itemCategories[item.name] || 'Other'
        catBase[cat] = (catBase[cat] || 0) + ((item.unit_price || 0) - modSum) * qty
      }
    }
    const total = revenueOrders.reduce((s: number, o: any) => s + (o.total || 0), 0)
    const base = total - dealRev - mods   // authoritative menu-items residual
    // Reconcile: categories MUST sum to `base` (so categories + dealRev + mods === total). Any drift
    // (e.g. deal-member modifiers, which `mods` counts but the category loop skips) is absorbed into 'Other'.
    const drift = base - Object.values(catBase).reduce((s, v) => s + v, 0)
    if (Math.abs(drift) > 0.005) catBase['Other'] = (catBase['Other'] || 0) + drift
    const ordered = [
      ...categoryOrder.filter((c: string) => catBase[c] !== undefined),
      ...Object.keys(catBase).filter((c: string) => !categoryOrder.includes(c)).sort(),
    ]
    const categories = ordered.map((name) => ({ name, revenue: catBase[name] })).filter((c) => Math.abs(c.revenue) > 0.005)
    return { categories, base, dealRev, mods, total }
  }, [orders, reportData]) // eslint-disable-line react-hooks/exhaustive-deps

  const dealBreakdown = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {}
    for (const o of orders)
      for (const d of (Array.isArray(o.deals) ? o.deals : [])) {
        if (!d.name) continue
        if (!map[d.name]) map[d.name] = { count: 0, revenue: 0 }
        map[d.name].count += 1; map[d.name].revenue += d.price || 0
      }
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count)
  }, [orders]) // eslint-disable-line react-hooks/exhaustive-deps

  const modifierBreakdown = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {}
    for (const o of orders)
      for (const item of (Array.isArray(o.items) ? o.items : []))
        for (const m of (item.modifiers || [])) {
          if (!m.name) continue
          if (!map[m.name]) map[m.name] = { count: 0, revenue: 0 }
          map[m.name].count += item.quantity || 1
          map[m.name].revenue += (m.price || 0) * (item.quantity || 1)
        }
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue)
  }, [orders]) // eslint-disable-line react-hooks/exhaustive-deps

  const customerNotes = useMemo(() => {
    const map: Record<string, number> = {}
    for (const o of orders)
      for (const item of (Array.isArray(o.items) ? o.items : [])) {
        const note = (item.specialInstructions || '').trim()
        if (note) map[note] = (map[note] || 0) + 1
      }
    return Object.entries(map).map(([note, count]) => ({ note, count })).sort((a, b) => b.count - a.count)
  }, [orders]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Report header context ────────────────────────────────────────
  const reportHeader = useMemo(() => {
    if (!orders.length || filterMode !== 'event' || !reportEventId) return null
    const ev = recentEvents.find(e => e.id === reportEventId)
    const dateStr = ev?.event_date
      ? new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      : ''
    return [ev?.venue_name, dateStr].filter(Boolean).join(' · ')
  }, [orders, filterMode, reportEventId, recentEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── VAN SCOPE IN THE FILENAME (V9.6) ─────────────────────────────────────────────────────────────
  // The on-screen chip states the scope, but a CSV outlives the session and gets emailed on, so the scope
  // has to travel WITH the file. FILENAME ONLY, deliberately — a scope row inside the CSV would break
  // every parser that expects the header on line 1 (Excel, Sheets, and any script an operator's
  // accountant has). The filename carries the same information and costs nothing to read.
  // '' for "All trucks" AND for any single-van truck, so an unfiltered export keeps today's filename
  // exactly and nothing changes for Gusto.
  const vanSuffix = vanFilterFilenameSuffix(vans, vanFilter)
  const csvFilename = filterMode === 'date'
    ? `orders-${dateFrom}-to-${dateTo}${vanSuffix}.csv`
    : `orders-event-${reportEventId}${vanSuffix}.csv`
  const itemsCsvFilename = filterMode === 'date'
    ? `items-${dateFrom}-to-${dateTo}${vanSuffix}.csv`
    : `items-event-${reportEventId}${vanSuffix}.csv`

  const exportCSV = () => {
    if (!orders.length) return
    const headers = ['Order ID', 'Date', 'Event', 'Time placed', 'Collection time', 'Customer name', 'Order type', 'Items', 'Deals', 'Modifiers', 'Notes', 'Total']
    const rows = orders.map((o: any) => {
      const createdAt = o.created_at ? new Date(o.created_at) : null
      const dateStr = createdAt
        ? `${String(createdAt.getDate()).padStart(2, '0')}/${String(createdAt.getMonth() + 1).padStart(2, '0')}/${createdAt.getFullYear()}`
        : ''
      const timePlaced = createdAt
        ? formatTime(`${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`)
        : ''
      const ev = resolveEvent(o)
      const eventStr = ev ? [ev.venue_name, ev.town].filter(Boolean).join(', ') : 'Unknown event'
      const collectionTime = o.slot ? formatTime(o.slot) : 'ASAP'
      const customerName = (o.customer_name && o.customer_name !== 'Walk-up') ? o.customer_name : 'Unknown'
      // customer_email IS NULL is the best available signal for operator-placed orders (no source column yet)
      const orderType = o.customer_email ? 'Customer online' : 'Placed by truck'
      const itemStr = (Array.isArray(o.items) ? o.items : []).map((i: any) => `${i.quantity || 1}× ${i.name}`).join('; ')
      const dealStr = (Array.isArray(o.deals) ? o.deals : []).map((d: any) => d.name).join('; ')
      const modStr  = (Array.isArray(o.items) ? o.items : []).flatMap((i: any) => (i.modifiers || []).filter((m: any) => m.price > 0).map((m: any) => `${m.name} +£${m.price.toFixed(2)}`)).join('; ')
      const noteStr = (Array.isArray(o.items) ? o.items : []).map((i: any) => i.specialInstructions).filter(Boolean).join('; ')
      return [o.id, dateStr, eventStr, timePlaced, collectionTime, customerName, orderType, itemStr, dealStr, modStr, noteStr, fmtGBP(o.total || 0)]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
    })
    const csv = [headers.map(h => `"${h}"`), ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = csvFilename
    a.click(); URL.revokeObjectURL(url)
  }

  const exportItemsCSV = () => {
    if (!orders.length) return
    const headers = ['Order ID', 'Date', 'Event', 'Time placed', 'Collection time', 'Customer name', 'Order type', 'Item name', 'Qty', 'Unit price', 'Modifiers', 'Notes', 'Item total', 'Order total']
    const rows = explodeOrderItems(orders, resolveEvent).map(r =>
      [r.orderId, r.dateStr, r.eventStr, r.timePlaced, r.collectionTime, r.customerName, r.orderType,
       r.itemLabel, String(r.qty), fmtGBP(r.basePrice), r.modStr, r.noteStr, fmtGBP(r.itemTotal), fmtGBP(r.orderTotal)]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
    )
    const csv = [headers.map(h => `"${h}"`), ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = itemsCsvFilename
    a.click(); URL.revokeObjectURL(url)
  }

  // Shared column cell classes — used by both Orders and Items views. Lower-priority columns are
  // hidden on mobile (hidden sm:block) so the Items view fits without the total being cut off; the
  // Orders desktop row is itself hidden sm:flex (mobile uses the compact card), so this only affects
  // the Items view on mobile. Desktop (sm:) unchanged.
  const colId    = 'font-mono text-slate-400 flex-shrink-0 w-10'
  const colDate  = 'text-slate-400 flex-shrink-0 w-10 hidden sm:block'
  const colVenue = 'text-slate-500 flex-shrink-0 w-24 truncate hidden sm:block'
  const colTime  = 'text-slate-400 flex-shrink-0 w-10 hidden sm:block'
  const colType  = (online: boolean) => `flex-shrink-0 w-14 font-medium hidden sm:block ${online ? 'text-blue-600' : 'text-slate-500'}`
  const colCust  = 'text-slate-600 flex-shrink-0 w-16 truncate'
  const colTotal = 'font-medium text-slate-900 flex-shrink-0'
  const colMuted = 'text-slate-400 flex-shrink-0'

  return (
    <div className="flex flex-col gap-5">
      {/* ── Filter bar ── */}
      {/* Mobile toolbar — three rows */}
      <div className="sm:hidden space-y-2">
        {/* Row 1: filter toggles (Pro/Max) + View report */}
        <div className="flex items-center gap-2">
          {hasAdvanced && (
            <>
              <button onClick={() => setFilterMode('date')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterMode === 'date' ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                📅 Date range
              </button>
              <button onClick={() => setFilterMode('event')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterMode === 'event' ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                📍 Event
              </button>
            </>
          )}
          <button onClick={() => loadReport()} disabled={loading || (filterMode === 'event' && !reportEventId)}
            className="ml-auto px-3 py-1.5 bg-orange-600 text-white text-sm font-medium rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50 whitespace-nowrap">
            {loading ? 'Loading…' : 'View report'}
          </button>
        </div>
        {/* Row 2: filter inputs */}
        {filterMode === 'date' ? (
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} max={todayLocal} onChange={e => setDateFrom(clampPast(e.target.value))}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" />
            <span className="text-sm text-slate-400 flex-shrink-0">to</span>
            <input type="date" value={dateTo} max={todayLocal} onChange={e => setDateTo(clampPast(e.target.value))}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" />
          </div>
        ) : (
          <select value={reportEventId}
            onChange={e => { const id = e.target.value; setReportEventId(id); if (id) loadReport(undefined, undefined, id, 'event') }}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
            <option value="">Select an event…</option>
            {recentEvents.map(ev => {
              const evDate = new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
              return <option key={ev.id} value={ev.id}>{ev.venue_name || 'Event'} · {evDate}</option>
            })}
          </select>
        )}
        {/* Row 3: results actions */}
        <div className={`flex items-center gap-2 ${orders.length === 0 ? 'invisible' : ''}`}>
          <button onClick={() => setItemView('orders')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${itemView === 'orders' ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            📋 Orders
          </button>
          <button onClick={() => setItemView('items')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${itemView === 'items' ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            📦 Items
          </button>
          <button onClick={itemView === 'orders' ? exportCSV : exportItemsCSV}
            disabled={orders.length === 0}
            className="ml-auto p-2 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors text-base leading-none">
            ⬇
          </button>
        </div>
      </div>
      {/* Desktop toolbar — rearranged (CSS/layout only; same handlers + button styles). Row 1 = filter
          group (left: mode toggle over a FIXED-HEIGHT input area) | stacked actions (right: View report
          over Export CSV). Row 2 = a hairline divider + the Orders/Items view toggle on its own row. */}
      <div className="hidden sm:flex flex-col gap-3">
        {/* Single row: filter group (left) | Show toggle (centered middle) | stacked actions (right).
            justify-between distributes the free space so the toggle sits centered between the two. */}
        <div className="flex items-start justify-between gap-4">
          {/* LEFT: filter-mode toggle on top, then the FIXED-HEIGHT input area below */}
          <div className="flex flex-col gap-2">
            {/* Filter mode toggle — Pro/Max only */}
            {hasAdvanced && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Filter by</span>
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                  <button onClick={() => setFilterMode('date')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterMode === 'date' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                    📅 Date range
                  </button>
                  <button onClick={() => setFilterMode('event')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterMode === 'event' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                    📍 Event
                  </button>
                </div>
              </div>
            )}
            {/* FIXED-HEIGHT input area — the Date-range inputs OR the Event dropdown occupy the SAME
                reserved height (min-height), so switching mode never shifts anything below it. */}
            <div className="flex items-center gap-2" style={{ minHeight: '44px' }}>
              {filterMode === 'date' ? (
                <>
                  <input type="date" value={dateFrom} max={todayLocal} onChange={e => setDateFrom(clampPast(e.target.value))}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white flex-shrink-0" />
                  <span className="text-sm text-slate-400 flex-shrink-0">to</span>
                  <input type="date" value={dateTo} max={todayLocal} onChange={e => setDateTo(clampPast(e.target.value))}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white flex-shrink-0" />
                </>
              ) : (
                <select value={reportEventId}
                  onChange={e => { const id = e.target.value; setReportEventId(id); if (id) loadReport(undefined, undefined, id, 'event') }}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white w-[320px]">
                  <option value="">Select an event…</option>
                  {recentEvents.map(ev => {
                    const evDate = new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                    return <option key={ev.id} value={ev.id}>{ev.venue_name || 'Event'} · {evDate}</option>
                  })}
                </select>
              )}
            </div>
          </div>
          {/* VAN FILTER — renders NOTHING for a single-van truck (gate is inside VanFilter), so this row
              is unchanged for Gusto and every other one-van operator. Sits with the other view controls
              because it IS one: it narrows which events the report covers, client-side. */}
          <div className="flex-shrink-0 self-start flex items-center gap-2 h-10">
            <VanFilter vans={vans} value={vanFilter} onChange={setVanFilter} showUnassigned={hasUnassignedEvents} />
          </div>
          {/* MIDDLE: Show [Orders | Items] view toggle — TOP-aligned (self-start) so it sits inline on the
              top button line with the "Filter by" toggle (left) and "View report" (right). */}
          <div className={`flex-shrink-0 self-start flex items-center gap-2 h-10 ${orders.length === 0 ? 'invisible' : ''}`}>
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Show</span>
            <button onClick={() => setItemView('orders')}
              className={`${itemView === 'orders' ? 'bg-slate-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium' : 'border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50'}`}>
              📋 Orders
            </button>
            <button onClick={() => setItemView('items')}
              className={`${itemView === 'items' ? 'bg-slate-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium' : 'border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50'}`}>
              📦 Items
            </button>
          </div>
          {/* RIGHT: View report (primary) stacked over Export CSV (secondary), equal width, right-aligned */}
          <div className="flex-shrink-0 flex flex-col gap-2 w-[150px]">
            <button onClick={() => loadReport()} disabled={loading || (filterMode === 'event' && !reportEventId)}
              className="h-10 w-full px-4 bg-orange-600 text-white text-sm font-medium rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50">
              {loading ? 'Loading…' : 'View report'}
            </button>
            <button onClick={itemView === 'orders' ? exportCSV : exportItemsCSV}
              disabled={orders.length === 0}
              className={`h-10 w-full px-4 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors ${orders.length === 0 ? 'invisible' : ''}`}>
              ⬇ Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* ── No data states ── */}
      {reportData === null && reportLoaded && (
        <p className="text-sm text-slate-400 text-center py-10">No orders found for this period.</p>
      )}
      {filterMode === 'event' && !reportEventId && !reportLoaded && (
        <p className="text-sm text-slate-400 text-center py-10">Select an event above to view its report.</p>
      )}

      {orders.length > 0 && (
        <>
          {/* ── Summary line ── */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            {reportHeader && (
              <p className="text-xs text-slate-500 mb-0.5">{reportHeader}</p>
            )}
            {/* 🔴 THE ACTIVE SCOPE TRAVELS WITH THE NUMBERS. A filtered report screenshotted or printed
                must never read as a whole-truck total, so the van label sits ON the totals line, not only
                in the dropdown above it. Rendered whenever the truck has >1 van — including "All trucks",
                because "no chip" would then be ambiguous between "unfiltered" and "single-van truck".
                ⚠️ reportHeader (the venue · date line above) exists in EVENT mode only, so the totals line
                is the one place present in both modes. */}
            <p className="text-base font-bold text-slate-900">
              {orders.length} order{orders.length !== 1 ? 's' : ''} · {fmtGBP(revenueBreakdown.total)}
              {vans.length > 1 && (
                <span className="ml-2 align-middle inline-block text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-0.5">
                  {vanFilterLabel(vans, vanFilter)}
                </span>
              )}
            </p>
          </div>

          {/* ── Advanced analytics (Pro/Max only) ── */}
          {hasAdvanced && (
            <>
              {/* Revenue breakdown */}
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-slate-900 mb-3">Revenue breakdown</p>
                <div className="space-y-2">
                  {/* Menu-item revenue SPLIT per category (sums to the old "Menu items" total). */}
                  {revenueBreakdown.categories.map((c) => (
                    <div key={c.name} className="flex justify-between text-sm">
                      <span className="text-slate-600">{c.name}</span>
                      <span className="font-medium text-slate-900">{fmtGBP(c.revenue)}</span>
                    </div>
                  ))}
                  {revenueBreakdown.dealRev > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Deal revenue</span>
                      <span className="font-medium text-slate-900">{fmtGBP(revenueBreakdown.dealRev)}</span>
                    </div>
                  )}
                  {revenueBreakdown.mods > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Modifier upcharges</span>
                      <span className="font-medium text-slate-900">{fmtGBP(revenueBreakdown.mods)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold border-t border-slate-100 pt-2 mt-1">
                    <span className="text-slate-900">Total</span>
                    <span className="text-slate-900">{fmtGBP(revenueBreakdown.total)}</span>
                  </div>
                </div>
              </div>

              {/* Items sold */}
              {reportData?.topItems && reportData.topItems.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-slate-900 mb-3">Items sold</p>
                  <table className="w-full table-fixed text-sm">
                    <colgroup><col className="w-8" /><col /><col className="w-12" /><col className="w-20" /></colgroup>
                    <thead>
                      <tr className="text-xs text-slate-400 border-b border-slate-100">
                        <th className="font-medium text-left py-1">#</th>
                        <th className="font-medium text-left py-1">Item</th>
                        <th className="font-medium text-right py-1">Qty</th>
                        <th className="font-medium text-right py-1">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.topItems.map((item, i) => (
                        <tr key={i} className="border-b border-slate-50 last:border-0">
                          <td className="py-1.5 text-xs text-slate-300">{i + 1}</td>
                          <td className="py-1.5 text-slate-700 truncate">{item.name}</td>
                          <td className="py-1.5 text-right text-slate-400 tabular-nums">{item.qty}</td>
                          <td className="py-1.5 text-right font-medium text-slate-900 tabular-nums">{fmtGBP(item.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Deals */}
              {dealBreakdown.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-slate-900 mb-3">Deals</p>
                  <div className="space-y-1">
                    {dealBreakdown.map((d, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-slate-700">{d.name}</span>
                          <span className="text-xs text-slate-400">{d.count}×</span>
                        </div>
                        <span className="text-sm font-medium text-slate-900">{fmtGBP(d.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Customisations */}
              {(modifierBreakdown.length > 0 || customerNotes.length > 0) && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-slate-900 mb-3">Customisations</p>
                  {modifierBreakdown.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Paid modifiers</p>
                      <table className="w-full table-fixed text-sm mb-4">
                        <colgroup><col className="w-8" /><col /><col className="w-12" /><col className="w-20" /></colgroup>
                        <thead>
                          <tr className="text-xs text-slate-400 border-b border-slate-100">
                            <th className="font-medium text-left py-1">#</th>
                            <th className="font-medium text-left py-1">Modifier</th>
                            <th className="font-medium text-right py-1">Qty</th>
                            <th className="font-medium text-right py-1">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {modifierBreakdown.map((m, i) => (
                            <tr key={i} className="border-b border-slate-50 last:border-0">
                              <td className="py-1.5 text-xs text-slate-300">{i + 1}</td>
                              <td className="py-1.5 text-slate-700 truncate">{m.name}</td>
                              <td className="py-1.5 text-right text-slate-400 tabular-nums">{m.count}</td>
                              <td className="py-1.5 text-right font-medium text-slate-900 tabular-nums">{fmtGBP(m.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                  {customerNotes.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Customer notes</p>
                      <div className="space-y-1">
                        {customerNotes.map((n, i) => (
                          <div key={i} className="flex items-center justify-between py-1">
                            <span className="text-sm text-slate-600 italic">"{n.note}"</span>
                            {n.count > 1 && <span className="text-xs text-slate-400">{n.count}×</span>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Results table ── desktop = fixed-column grid (# | Date | Time | Channel | Item | Qty |
              Total), no overlap; venue+customer dropped on-screen (still in the CSV). Date = dd/mm/yy,
              Time = own column (mobile shows just dd/mm). Items view groups each DEAL as a parent row
              (deal name + single deal price) with indented member items (no per-item price). */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-900 mb-3">{itemView === 'orders' ? 'Order breakdown' : 'Item breakdown'}</p>
            {/* Desktop fixed-column header (shared by both views) */}
            <div className="hidden sm:grid grid-cols-[2.5rem_4.5rem_3.5rem_5rem_1fr_2.5rem_5rem] gap-2 text-xs font-medium text-slate-400 border-b border-slate-100 pb-1.5">
              <span>#</span><span>Date</span><span>Time</span><span>Channel</span><span>Item</span><span className="text-right">Qty</span><span className="text-right">Total</span>
            </div>

            {itemView === 'orders' && (
              <div className="space-y-0.5">
                {orders.map((o: any) => {
                  const createdAt = o.created_at ? new Date(o.created_at) : null
                  const dd = createdAt ? String(createdAt.getDate()).padStart(2, '0') : ''
                  const mm = createdAt ? String(createdAt.getMonth() + 1).padStart(2, '0') : ''
                  const dateShort = createdAt ? `${dd}/${mm}` : ''                                                  // mobile
                  const dateFull = createdAt ? `${dd}/${mm}/${String(createdAt.getFullYear()).slice(2)}` : ''       // desktop dd/mm/yy
                  const timePlaced = createdAt
                    ? formatTime(`${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`)
                    : ''
                  const ev = resolveEvent(o)
                  const venueName = ev?.venue_name ?? null
                  const orderType = o.customer_email ? 'Online' : 'Walk-up'
                  const customerLabel = (o.customer_name && o.customer_name !== 'Walk-up') ? o.customer_name : '—'
                  const itemSummary = (Array.isArray(o.items) ? o.items : [])
                    .map((i: any) => `${i.quantity || 1}× ${i.name}`).join(', ')
                  const qtyTotal = (Array.isArray(o.items) ? o.items : []).reduce((s: number, i: any) => s + (i.quantity || 1), 0)
                  const isCancelled = o.status === 'cancelled' || o.status === 'rejected'
                  const isExpanded = expandedOrders.has(o.order_key)
                  return (
                    <div key={o.order_key} className={`border-b border-slate-50 last:border-0 ${isCancelled ? 'opacity-50' : ''}`}>
                      {/* Desktop: fixed-column grid row (no overlap). Channel = one default colour (Online no longer blue). */}
                      <div className="hidden sm:grid grid-cols-[2.5rem_4.5rem_3.5rem_5rem_1fr_2.5rem_5rem] gap-2 items-center py-2 text-xs">
                        <span className="font-mono text-slate-400 truncate">#{o.id}</span>
                        <span className="text-slate-400 tabular-nums truncate">{dateFull}</span>
                        <span className="text-slate-400 tabular-nums truncate">{timePlaced}</span>
                        <span className="font-medium text-slate-500 truncate">{orderType}</span>
                        <span className="text-slate-600 truncate min-w-0">{itemSummary}</span>
                        <span className="text-right text-slate-400 tabular-nums">{qtyTotal}</span>
                        <span className="text-right font-medium text-slate-900 tabular-nums">{fmtGBP(o.total || 0)}</span>
                      </div>
                      {/* Mobile: compact glance row (#N · dd/mm | total) + tap-to-expand. */}
                      <div className="sm:hidden text-xs">
                        <button onClick={() => toggleOrderExpand(o.order_key)}
                          className="w-full flex items-center justify-between gap-2 py-2.5 text-left text-sm">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-slate-300 flex-shrink-0 text-[10px] transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                            <span className="font-mono font-semibold text-orange-500 flex-shrink-0">#{o.id}</span>
                            <span className="text-slate-500 truncate">{dateShort}</span>
                          </span>
                          <span className="font-bold text-slate-900 flex-shrink-0">{fmtGBP(o.total || 0)}</span>
                        </button>
                        {isExpanded && (
                          <div className="pb-2.5 pl-5 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-slate-500 font-medium">{orderType}</span>
                              <span className="text-slate-400">· {timePlaced}</span>
                              {customerLabel !== '—' && <span className="text-slate-600">{customerLabel}</span>}
                              {venueName && <span className="text-slate-400">· {venueName}</span>}
                            </div>
                            <div className="space-y-0.5">
                              {(Array.isArray(o.items) ? o.items : []).map((i: any, idx: number) => {
                                const mods = Array.isArray(i.modifiers) && i.modifiers.length > 0
                                  ? ` (${i.modifiers.map((m: any) => m.name).join(', ')})` : ''
                                return (
                                  <div key={idx} className="flex items-baseline justify-between gap-2">
                                    <span className="text-slate-700 min-w-0">{i.quantity || 1}× {i.name}{mods}</span>
                                    <span className="text-slate-400 flex-shrink-0 tabular-nums">{fmtGBP(i.unit_price || 0)}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {itemView === 'items' && (() => {
              // Build display rows grouping each deal as a PARENT (deal name + single deal price) with its
              // member items indented beneath (no per-item price). Non-deal items render flat. The CSV
              // export keeps the full per-item data (explodeOrderItems) — unaffected by this display grouping.
              type GRow = { key: string; kind: 'deal' | 'member' | 'item'; firstOfOrder: boolean
                orderId?: any; dateFull?: string; time?: string; channel?: string; name: string; qty: number; total: number | null }
              const grouped: GRow[] = []
              for (const o of orders) {
                const createdAt = o.created_at ? new Date(o.created_at) : null
                const dd = createdAt ? String(createdAt.getDate()).padStart(2, '0') : ''
                const mm = createdAt ? String(createdAt.getMonth() + 1).padStart(2, '0') : ''
                const dateFull = createdAt ? `${dd}/${mm}/${String(createdAt.getFullYear()).slice(2)}` : ''
                const time = createdAt ? formatTime(`${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`) : ''
                const channel = o.customer_email ? 'Online' : 'Walk-up'
                const items = Array.isArray(o.items) ? o.items : []
                const deals = Array.isArray(o.deals) ? o.deals : []
                const dealMemberNames = new Set<string>()
                for (const d of deals) for (const n of Object.values(d.slots || {})) if (n) dealMemberNames.add(n as string)
                let first = true
                for (const d of deals) {
                  const memberNames = Object.values(d.slots || {}).filter(Boolean) as string[]
                  grouped.push({ key: `${o.order_key}-deal-${d.name}`, kind: 'deal', firstOfOrder: first, orderId: o.id, dateFull, time, channel, name: `🎁 ${d.name}`, qty: 0, total: d.price || 0 })
                  first = false
                  for (const item of items) {
                    if (memberNames.includes(item.name)) {
                      grouped.push({ key: `${o.order_key}-m-${item.name}`, kind: 'member', firstOfOrder: false, name: item.name, qty: item.quantity || 1, total: null })
                    }
                  }
                }
                for (const item of items) {
                  if (dealMemberNames.has(item.name)) continue
                  grouped.push({ key: `${o.order_key}-i-${item.name}`, kind: 'item', firstOfOrder: first, orderId: o.id, dateFull, time, channel, name: item.name, qty: item.quantity || 1, total: (item.unit_price || 0) * (item.quantity || 1) })
                  first = false
                }
              }
              return (
                <div>
                  {/* Desktop fixed-column grid */}
                  <div className="hidden sm:block">
                    {grouped.map((r) => (
                      <div key={r.key} className={`grid grid-cols-[2.5rem_4.5rem_3.5rem_5rem_1fr_2.5rem_5rem] gap-2 items-center py-2 text-xs ${r.firstOfOrder ? 'border-t border-slate-100' : ''} ${r.kind === 'deal' ? 'bg-orange-50' : ''}`}>
                        <span className="font-mono text-orange-400 truncate">{r.kind === 'member' ? '' : `#${r.orderId}`}</span>
                        <span className="text-slate-400 tabular-nums truncate">{r.dateFull || ''}</span>
                        <span className="text-slate-400 tabular-nums truncate">{r.time || ''}</span>
                        <span className="font-medium text-slate-500 truncate">{r.channel || ''}</span>
                        <span className={`truncate min-w-0 ${r.kind === 'member' ? 'pl-4 text-slate-500' : r.kind === 'deal' ? 'font-medium text-slate-800' : 'text-slate-700'}`}>{r.kind === 'member' ? '↳ ' : ''}{r.name}</span>
                        <span className="text-right text-slate-400 tabular-nums">{r.kind === 'deal' ? '' : r.qty}</span>
                        <span className="text-right tabular-nums">{r.total === null ? <span className="text-slate-300">—</span> : <span className="font-medium text-slate-900">{fmtGBP(r.total)}</span>}</span>
                      </div>
                    ))}
                  </div>
                  {/* Mobile: stacked (deal parent + indented members, then items) */}
                  <div className="sm:hidden divide-y divide-slate-50">
                    {grouped.map((r) => (
                      <div key={r.key} className={`flex items-center justify-between gap-2 py-2 text-xs ${r.kind === 'deal' ? 'bg-orange-50' : ''}`}>
                        <span className={`truncate min-w-0 ${r.kind === 'member' ? 'pl-4 text-slate-500' : r.kind === 'deal' ? 'font-medium text-slate-800' : 'text-slate-700'}`}>{r.kind === 'member' ? `↳ ${r.qty}× ${r.name}` : r.kind === 'deal' ? r.name : `${r.qty}× ${r.name}`}</span>
                        <span className="flex-shrink-0 tabular-nums">{r.total === null ? <span className="text-slate-300">—</span> : <span className="font-medium text-slate-900">{fmtGBP(r.total)}</span>}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* ── Pro feature placeholder (Starter only) ── */}
          {!hasAdvanced && (
            <div className="rounded-xl border border-slate-200 p-6 opacity-60">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-slate-700">Revenue breakdown & analytics</span>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Pro feature</span>
              </div>
              <p className="text-sm text-slate-400">
                Date range reporting, revenue breakdown, deal performance, items sold ranking, hourly sales patterns, and event ROI comparison. Available on Pro and Max.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── TeamTab ────────────────────────────────────────────────────
type PendingEmailChange = { id: string; new_email: string; requested_at: string; expired_at: string }

function TeamTab({ truck, token, api, reload, showToast, currentUserEmail, currentUserFirstName, currentUserLastName, currentUserPhone, currentUserId, ownerEmail, ownerAuthUserId, userRole, initialPendingEmailChange, onProfileSaved }: {
  truck: Truck; token: string
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: ShowToast
  currentUserEmail: string | null; currentUserFirstName: string | null; currentUserLastName: string | null; currentUserPhone: string | null
  currentUserId: string | null; ownerEmail: string | null; ownerAuthUserId: string | null; userRole: 'owner' | 'manager' | 'staff'
  initialPendingEmailChange: PendingEmailChange | null
  onProfileSaved: (firstName: string, lastName: string, phone: string | null) => void
}) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [vans, setVans] = useState<Van[]>([])
  const [invitingMember, setInvitingMember] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'owner' | 'manager' | 'staff'>('staff')
  const [inviteVanIds, setInviteVanIds] = useState<string[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [editingOwnProfile, setEditingOwnProfile] = useState(false)
  const [ownProfileFirstName, setOwnProfileFirstName] = useState('')
  const [ownProfileLastName, setOwnProfileLastName] = useState('')
  const [ownProfilePhone, setOwnProfilePhone] = useState('')
  const [ownProfileEmail, setOwnProfileEmail] = useState('')
  const [pendingEmailChange, setPendingEmailChange] = useState<PendingEmailChange | null>(initialPendingEmailChange)
  const [resendingVerification, setResendingVerification] = useState(false)
  const [cancellingEmailChange, setCancellingEmailChange] = useState(false)
  const [savingOwnProfile, setSavingOwnProfile] = useState(false)

  const saveOwnProfile = async () => {
    if (!ownProfileFirstName.trim() || !ownProfileLastName.trim()) return
    setSavingOwnProfile(true)
    try {
      const fullName = `${ownProfileFirstName.trim()} ${ownProfileLastName.trim()}`
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
        body: JSON.stringify({
          first_name: ownProfileFirstName.trim(),
          last_name: ownProfileLastName.trim(),
          name: fullName,
          phone: ownProfilePhone.trim() || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')

      if (ownProfileEmail.trim() && ownProfileEmail.trim() !== currentUserEmail) {
        const emailRes = await fetch('/api/auth/change-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
          body: JSON.stringify({ newEmail: ownProfileEmail.trim() }),
        })
        const emailData = await emailRes.json()
        if (emailData.ok) {
          setPendingEmailChange({
            id: emailData.changeId,
            new_email: ownProfileEmail.trim(),
            requested_at: new Date().toISOString(),
            expired_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          })
          showToast('Verification email sent')
        } else {
          showToast(emailData.error || 'Email change failed', 'error')
        }
      }

      onProfileSaved(ownProfileFirstName.trim(), ownProfileLastName.trim(), ownProfilePhone.trim() || null)
      setEditingOwnProfile(false)
      showToast('Profile updated')
    } catch {
      showToast('Failed to save profile', 'error')
    } finally {
      setSavingOwnProfile(false)
    }
  }

  const handleResendVerification = async (changeId: string) => {
    setResendingVerification(true)
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
        body: JSON.stringify({ changeId }),
      })
      const data = await res.json()
      if (data.ok) {
        showToast('Verification email resent — check your inbox')
      } else {
        showToast(data.error || 'Failed to resend', 'error')
      }
    } finally {
      setResendingVerification(false)
    }
  }

  const handleCancelEmailChange = async () => {
    if (!pendingEmailChange) return
    setCancellingEmailChange(true)
    try {
      const res = await fetch('/api/auth/cancel-email-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
        body: JSON.stringify({ changeId: pendingEmailChange.id }),
      })
      const data = await res.json()
      if (data.ok) {
        setPendingEmailChange(null)
        showToast('Email change cancelled')
      } else {
        showToast(data.error || 'Failed to cancel', 'error')
      }
    } catch {
      showToast('Failed to cancel', 'error')
    } finally {
      setCancellingEmailChange(false)
    }
  }

  const loadTeam = useCallback(async () => {
    try {
      const [teamResult, vansResult] = await Promise.all([
        api('get_team'),
        api('get_vans'),
      ])
      setTeamMembers(teamResult.members || [])
      setVans(vansResult.vans || [])
    } catch {}
  }, [])

  useEffect(() => { loadTeam() }, [loadTeam])

  const openInviteModal = () => {
    setEditingMember(null)
    setInviteName(''); setInviteEmail(''); setInviteRole('staff')
    // Pre-select the only van if there's just one
    setInviteVanIds(vans.length === 1 ? [vans[0].id] : [])
    setInvitingMember(true)
  }

  const editMember = (member: TeamMember) => {
    setEditingMember(member)
    setInviteName(member.name || '')
    setInviteEmail(member.email)
    setInviteRole(member.role)
    const matchedVanIds = vans
      .filter(v => member.van_names?.includes(v.name))
      .map(v => v.id)
    setInviteVanIds(matchedVanIds)
    setInvitingMember(true)
  }

  const closeModal = () => {
    setInvitingMember(false)
    setEditingMember(null)
    setInviteName(''); setInviteEmail(''); setInviteRole('staff'); setInviteVanIds([])
  }

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviteLoading(true)
    try {
      if (editingMember) {
        await api('update_member', {
          memberId: editingMember.id,
          name: inviteName,
          role: inviteRole,
          van_ids: inviteVanIds,
        })
        showToast('Member updated')
      } else {
        await api('invite_team_member', {
          name: inviteName,
          email: inviteEmail,
          role: inviteRole,
          vanIds: inviteVanIds,
        })
        showToast('Invite sent')
      }
      await loadTeam()
      closeModal()
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally {
      setInviteLoading(false)
    }
  }

  const removeMember = async (memberId: string) => {
    if (!window.confirm('Remove this team member?')) return
    try {
      await api('remove_team_member', { memberId })
      setTeamMembers(prev => prev.filter(m => m.id !== memberId))
      showToast('Member removed')
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  const canEdit = (member: TeamMember) => {
    if (userRole === 'owner') return true
    if (userRole === 'manager') return member.role === 'staff'
    if (userRole === 'staff') return member.auth_user_id === currentUserId
    return false
  }

  const canRemove = (member: TeamMember) => {
    if (userRole === 'owner') return true
    if (userRole === 'manager') return member.role === 'staff'
    return false
  }

  // True only when the SESSION viewer is the truck's actual owner (not an admin/other viewing).
  // Drives the owner-row "(you)" badge AND whether the owner-row Edit (own-profile) button shows —
  // a non-owner must not see/act on the owner's identity here.
  const isViewerOwner = !!currentUserId && currentUserId === ownerAuthUserId

  const visibleMembers = teamMembers.filter(member => {
    if (userRole === 'owner' || userRole === 'manager') return true
    return member.auth_user_id === currentUserId
  })

  const invitableRoles: Array<'owner' | 'manager' | 'staff'> = userRole === 'owner'
    ? ['manager', 'staff']
    : ['staff']

  return (
    <div className="flex flex-col gap-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Team members</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Invite staff to access the order screen and take orders
          </p>
        </div>
        {userRole !== 'staff' && (
          <button
            onClick={openInviteModal}
            className="text-xs px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
          >
            + Invite member
          </button>
        )}
      </div>

      <Card className="p-4">
        {/* Owner row — always shown */}
        <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
          <div>
            <p className="text-sm font-medium text-slate-900">
              {(() => {
                // The owner row reflects the truck's ACTUAL owner (trucks.operator_id → ownerEmail),
                // NOT the session viewer. "(you)" only when the viewer IS the owner. When the viewer
                // is the owner we can show their full name; otherwise only the owner's email is known.
                const display = isViewerOwner && currentUserFirstName && currentUserLastName
                  ? `${currentUserFirstName} ${currentUserLastName}`
                  : (ownerEmail || truck.contact_email || '—')
                return `${display}${isViewerOwner ? ' (you)' : ''}`
              })()}
            </p>
            <p className="text-xs text-slate-400">Owner · All vans</p>
          </div>
          {/* Edit (own-profile) shown ONLY to the owner — a non-owner viewer (e.g. admin) must not
              act on the owner's identity, and this button edits the viewer's OWN profile. */}
          {isViewerOwner && (
            <button
              onClick={() => {
                setOwnProfileFirstName(currentUserFirstName || '')
                setOwnProfileLastName(currentUserLastName || '')
                setOwnProfilePhone(currentUserPhone || '')
                setOwnProfileEmail(currentUserEmail || '')
                setEditingOwnProfile(true)
              }}
              className="text-xs px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
            >
              Edit
            </button>
          )}
        </div>

        {pendingEmailChange && !editingOwnProfile && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-amber-800">⏳ Awaiting verification</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Verification sent to <strong>{pendingEmailChange.new_email}</strong>. Check your inbox.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <button
                onClick={() => handleResendVerification(pendingEmailChange.id)}
                disabled={resendingVerification || cancellingEmailChange}
                className="text-xs text-amber-700 font-semibold underline disabled:opacity-50"
              >
                {resendingVerification ? 'Sending...' : 'Resend'}
              </button>
              <button
                onClick={handleCancelEmailChange}
                disabled={cancellingEmailChange || resendingVerification}
                className="text-xs text-slate-500 underline disabled:opacity-50"
              >
                {cancellingEmailChange ? 'Cancelling...' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {editingOwnProfile && (
          <div className="bg-slate-50 rounded-xl p-4 flex flex-col gap-3 mt-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">My profile</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">First name *</label>
                <input
                  type="text"
                  value={ownProfileFirstName}
                  onChange={e => setOwnProfileFirstName(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Last name *</label>
                <input
                  type="text"
                  value={ownProfileLastName}
                  onChange={e => setOwnProfileLastName(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</label>
              <input
                type="tel"
                value={ownProfilePhone}
                onChange={e => setOwnProfilePhone(e.target.value)}
                placeholder="+44 7700 900000"
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={ownProfileEmail}
                onChange={e => setOwnProfileEmail(e.target.value)}
                disabled={!!pendingEmailChange}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-400"
              />
              {pendingEmailChange ? (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-amber-800">⏳ Awaiting verification</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Verification sent to <strong>{pendingEmailChange.new_email}</strong>. Check your inbox.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleResendVerification(pendingEmailChange.id)}
                      disabled={resendingVerification || cancellingEmailChange}
                      className="text-xs text-amber-700 font-semibold underline disabled:opacity-50"
                    >
                      {resendingVerification ? 'Sending...' : 'Resend'}
                    </button>
                    <button
                      onClick={handleCancelEmailChange}
                      disabled={cancellingEmailChange || resendingVerification}
                      className="text-xs text-slate-500 underline disabled:opacity-50"
                    >
                      {cancellingEmailChange ? 'Cancelling...' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ) : ownProfileEmail !== currentUserEmail && (
                <p className="text-xs text-amber-600 mt-1">
                  A verification link will be sent to this address. Your current email remains active until verified.
                </p>
              )}
            </div>

            <p className="text-xs text-slate-600 bg-white border border-slate-100 rounded-lg px-3 py-2">
              Your personal details are private and never shown to customers. They're used for account management and billing verification.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setEditingOwnProfile(false)}
                className="flex-1 border border-slate-200 text-slate-600 py-2 rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveOwnProfile}
                disabled={!ownProfileFirstName.trim() || !ownProfileLastName.trim() || savingOwnProfile}
                className="flex-1 bg-orange-600 text-white font-semibold py-2 rounded-xl text-sm disabled:opacity-40"
              >
                {savingOwnProfile ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Team member rows */}
        {visibleMembers.map(member => (
          <div key={member.id} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
            <div>
              <p className="text-sm font-medium text-slate-900">
                {member.name || member.email}
              </p>
              <p className="text-xs text-slate-400">
                {member.role === 'manager' ? 'Manager' : 'Staff'}
                {' · '}
                {member.van_names?.length
                  ? member.van_names.join(', ')
                  : 'All trucks'}
                {!member.accepted_at && ' · Invite pending'}
              </p>
            </div>
            <div className="flex gap-2">
              {canEdit(member) && (
                <button
                  onClick={() => editMember(member)}
                  className="text-xs px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                >
                  Edit
                </button>
              )}
              {canRemove(member) && (
                <button
                  onClick={() => removeMember(member.id)}
                  className="text-xs px-2.5 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}

        {visibleMembers.length === 0 && (
          <p className="text-xs text-slate-400 py-3 text-center">No team members yet</p>
        )}
      </Card>

      {/* Invite / edit modal */}
      {invitingMember && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
             onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingMember ? 'Edit team member' : 'Invite team member'}
            </h3>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</label>
              <input
                type="text"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="e.g. Sarah"
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="sarah@example.com"
                disabled={!!editingMember}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as 'owner' | 'manager' | 'staff')}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              >
                {invitableRoles.includes('staff') && (
                  <option value="staff">Staff — Take orders and manage the kitchen</option>
                )}
                {invitableRoles.includes('manager') && (
                  <option value="manager">Manager — Full access including menu and settings</option>
                )}
                {invitableRoles.includes('owner') && (
                  <option value="owner">Owner — Full access including team and billing</option>
                )}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Truck access</label>
              {vans.length === 1 ? (
                <label className="flex items-center gap-2 py-1.5 opacity-60 cursor-not-allowed">
                  <input type="checkbox" checked disabled />
                  <span className="text-sm text-slate-700">{vans[0].name} <span className="text-slate-400">(only truck)</span></span>
                </label>
              ) : (
                <>
                  {vans.map(van => (
                    <label key={van.id} className="flex items-center gap-2 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={inviteVanIds.includes(van.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setInviteVanIds(prev => [...prev, van.id])
                          } else {
                            setInviteVanIds(prev => prev.filter(id => id !== van.id))
                          }
                        }}
                      />
                      <span className="text-sm text-slate-700">{van.name}</span>
                    </label>
                  ))}
                  {vans.length > 1 && inviteVanIds.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">Select at least one truck</p>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={sendInvite}
                disabled={!inviteEmail || inviteLoading || (vans.length > 1 && inviteVanIds.length === 0)}
                className="flex-1 bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-orange-700"
              >
                {inviteLoading ? 'Saving...' : editingMember ? 'Save changes' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}