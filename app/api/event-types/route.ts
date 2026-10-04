// app/api/event-types/route.ts — event types: list, create, edit, reorder, delete, and assign.
//
// ── 🔴 ITS OWN ROUTE, NOT AN ACTION ON /api/manage ─────────────────────────────────────────────────
// For the reason app/api/weekly-post/route.ts gives for the same choice: /api/manage is a 3,000-line
// handler every operator write funnels through, and adding a seventh concern to it makes the one path
// that must never surprise a caller harder to reason about. The auth is the same token +
// `resolveTruckAccess` pattern, lifted rather than reinvented, and the merge cost is nil because this
// file is new.
//
// ── 🔴 THE PLAN GATE IS SERVER-SIDE ON EVERY ACTION ───────────────────────────────────────────────
// `FeatureGate` in the panel decides what is DRAWN; this decides what is DONE. Without the check here
// the whole feature is reachable by anyone holding a dashboard token and posting to this URL, and the
// UI gate would be decoration. `canAccess` is the same function the UI gate uses.
//
// ── 🔴 WHAT HAPPENS WHEN A TRUCK LOSES ACCESS (decision 4) ────────────────────────────────────────
// Reads still answer and every existing type keeps resolving, because `load` is NOT gated: an event
// that already has a type must go on behaving the same way, or a downgrade would silently change the
// service settings of events already in the diary. Every WRITE is refused, and `load` says
// `readOnly: true` so the panel can show the upgrade line instead of controls.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canAccess } from '@/lib/features'
/* 🔴 MAIN'S OWN VENUE NORMALISER, NOT A NEW ONE. `normalizeVenue` (lib/venue-signature.ts) is already
 * the matching function the scraped-event bridge dedups with, so "the same place" means here exactly
 * what it means there, and this build adds no second normaliser to main.
 * ⚠️ IT IS NOT THE SAME FUNCTION `truck_places.name_key` USES. That one — `normalisePlaceName` — lives
 * on the schedule-graphics branch, where places are a table. At the merge, "the usual type for this
 * place" should key on `truck_place_id` instead of on a normalised name, which removes this question
 * rather than answering it twice. Recorded in docs/event-types-stage1-report.md. */
import { normalizeVenue } from '@/lib/venue-signature'
import { getLocalDateInTz } from '@/lib/time-utils'
import {
  SERVICE_KEYS, MAX_TYPE_NAME, blankTypeValues, type ServiceKey,
  EVENT_OVERRIDE_COLUMNS,
} from '@/lib/event-types/types'
import { readTypesForTruck, countUpcomingByType, usualTypeForVenue } from '@/lib/event-types/read'
import { isIntervalChoice } from '@/lib/slot-interval-core'
import { readVanIntervalsForTruck } from '@/lib/slot-interval'
import { OFFLINE_PROTECTION_MODES } from '@/lib/copy/offlineProtection'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

type TruckRow = {
  id: string; name: string
  plan: string | null
  feature_overrides: Record<string, boolean> | null
  trial_expires_at: string | null
  takes_cash: boolean | null
}

async function getTruck(token: string): Promise<TruckRow | null> {
  const { data } = await supabase.from('trucks').select('*').eq('dashboard_token', token).single()
  return (data as TruckRow | null) ?? null
}

/** The gate. ⚠️ Returns the same message the panel shows, so a blocked call and a blocked screen agree. */
const UPGRADE_MESSAGE = 'Event types are part of the Max plan.'
const allowed = (truck: TruckRow): boolean =>
  canAccess(truck.plan as never, 'event_types', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)

/**
 * One setting from a request body, validated.
 *
 * 🔴 `undefined` MEANS "DO NOT TOUCH THIS KEY" AND `null` MEANS "SAME AS STANDARD". Those are two
 * different instructions and collapsing them would make a partial save wipe the settings it did not
 * mention — the rule `update_settings` follows for exactly this reason.
 * ⚠️ ANYTHING UNRECOGNISED BECOMES NULL, not an error. The vocabulary is three booleans and one of
 * five intervals; a value outside it cannot be honoured, and "same as Standard" is the only safe
 * reading of a value nobody can act on.
 */
function cleanValue(key: ServiceKey, raw: unknown): boolean | number | string | null {
  if (key === 'collection_interval_mins') {
    const n = typeof raw === 'number' ? raw : Number(raw)
    return isIntervalChoice(n) ? n : null
  }
  /* 🔴 THE MODE'S VOCABULARY IS THE COPY MODULE'S, not a pair of literals written here. Anything else
   * becomes NULL ("same as Standard"), which is also what the database CHECK would allow. */
  if (key === 'offline_protection_mode') {
    return OFFLINE_PROTECTION_MODES.some(m => m.value === raw) ? String(raw) : null
  }
  /* 🔴 5-30, THE SAME BOUNDS the van column's CHECK, this type's CHECK and `set_offline_protection`
   * all use. The picker's six values are a UI affordance; any integer in range is accepted, exactly
   * as the van column accepts one. */
  if (key === 'offline_auto_reject_mins') {
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isInteger(n) && n >= 5 && n <= 30 ? n : null
  }
  return raw === true ? true : raw === false ? false : null
}

const cleanName = (raw: unknown): string =>
  String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TYPE_NAME)

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const token = String(body.token ?? '')
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })
  const truck = await getTruck(token)
  if (!truck) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const action = String(body.action ?? '')
  const canWrite = allowed(truck)

  /* 🔴 ONE GUARD, APPLIED TO EVERY ACTION BUT `load`. Listing the write actions rather than the read
   * one means a NEW action added later is refused by default instead of being accidentally open. */
  if (action !== 'load' && !canWrite) {
    return NextResponse.json({ error: UPGRADE_MESSAGE, upgrade: true }, { status: 403 })
  }

  // ── LOAD ────────────────────────────────────────────────────────────────────────────────────────
  if (action === 'load') {
    const { ok, types } = await readTypesForTruck(supabase, truck.id)
    const counts = await countUpcomingByType(supabase, truck.id, getLocalDateInTz())

    /* ── STANDARD'S OWN VALUES, SO THE FIRST COLUMN CAN SHOW THEM ───────────────────────────────
     * 🔴 STANDARD IS NOT A ROW. It is the absence of a type, so its values are read from where they
     * actually live: the truck for cash, and the VANS for the mark-ready step, the buzzer rack and the
     * collection grid.
     * ⚠️ THE VANS MAY DISAGREE, and the screen says "Set per van" when they do rather than picking
     * one and presenting it as the truck's setup. A truck with two vans configured differently has no
     * single Standard for those settings, and inventing one would be a lie on the one column that is
     * meant to be the truth. */
    /* 🔴 TWO READS, AND THE SPLIT IS NOT TIDINESS — IT IS A RULE WITH A HARNESS BEHIND IT.
     * `scripts/slot-interval-van-list-tolerance.cjs` scans every file for a `truck_vans` select that
     * names `collection_interval_mins` ALONGSIDE other van fields, and refuses it: one 42703 on the
     * interval column would fail the WHOLE statement and take the other fields down with it. The
     * intervals therefore come from `readVanIntervalsForTruck`, which is the ONE probed reader for
     * them and degrades to "every van reads 5" on its own. This select names no interval column.
     * ⚠️ THE FIRST DRAFT OF THIS HANDLER SELECTED ALL THREE TOGETHER and that harness caught it. */
    const [{ data: vans }, vanGrids] = await Promise.all([
      supabase.from('truck_vans')
        /* ⚠️ STILL NO INTERVAL COLUMN HERE — scripts/slot-interval-van-list-tolerance.cjs refuses a
         * `truck_vans` select that mixes `collection_interval_mins` with other van fields, because one
         * 42703 would fail the whole statement. The grid comes from `readVanIntervalsForTruck` below. */
        .select('id, order_ready_enabled, buzzer_count, auto_pause_on_offline, offline_protection_mode')
        .eq('truck_id', truck.id).eq('active', true),
      readVanIntervalsForTruck(supabase, truck.id),
    ])

    const vanRows = (vans as {
      id: string; order_ready_enabled?: boolean | null; buzzer_count?: number | null
      auto_pause_on_offline?: boolean | null; offline_protection_mode?: string | null
    }[] | null) ?? []
    const distinct = <T,>(pick: (v: typeof vanRows[number]) => T): { same: boolean; value: T | null } => {
      if (vanRows.length === 0) return { same: true, value: null }
      const first = pick(vanRows[0])
      return { same: vanRows.every(v => pick(v) === first), value: first }
    }
    const ready = distinct(v => v.order_ready_enabled ?? false)
    const rack = distinct(v => (v.buzzer_count ?? null) !== null)
    /* ⚠️ OFFLINE PROTECTION'S STANDARD IS THE VAN'S SWITCH AND MODE TOGETHER, summarised as one
     * string because the modal shows it as one row. "Set per van" when the vans disagree on either. */
    const offSwitch = distinct(v => v.auto_pause_on_offline === true)
    const offMode = distinct(v => (v.offline_protection_mode ?? 'pause'))
    /* ⚠️ THE CUSTOMER GRID, NOT THE OPERATOR ONE — a type sets only the customer grid, so Standard's
     * column must show the same thing a type would be replacing. */
    const gridValues = vanRows.map(v => vanGrids.byVanId.get(v.id)?.customer ?? 5)
    const grid = {
      same: gridValues.length === 0 || gridValues.every(g => g === gridValues[0]),
      value: gridValues.length ? gridValues[0] : null,
    }

    return NextResponse.json({
      missingTable: !ok,
      readOnly: !canWrite,
      upgradeMessage: canWrite ? null : UPGRADE_MESSAGE,
      types: types.map(t => ({ ...t, upcoming: counts[t.id] ?? 0 })),
      /* What the Standard column shows. `perVan: true` ⇒ the screen prints "Set per van". */
      standard: {
        /* ⚠️ THE BUZZER PROMPT'S DEFAULT IS "this van has a rack", not a column — lib/buzzer.ts's
         * rule. So Standard shows On when every van has buzzers, Off when none does, per-van when
         * they differ. */
        buzzer_prompt: { value: rack.value === true, perVan: !rack.same },
        takes_cash: { value: truck.takes_cash ?? false, perVan: false },
        order_ready: { value: ready.value === true, perVan: !ready.same },
        offline_protection: {
          enabled: offSwitch.value === true,
          mode: offMode.value ?? 'pause',
          perVan: !offSwitch.same || !offMode.same,
        },
        collection_interval_mins: { value: grid.value ?? 5, perVan: !grid.same },
      },
    })
  }

  // ── CREATE ──────────────────────────────────────────────────────────────────────────────────────
  if (action === 'create') {
    const name = cleanName(body.name)
    if (!name) return NextResponse.json({ error: 'Give the type a name.' }, { status: 400 })

    /* ⚠️ THE NEXT SORT VALUE IS READ, NOT COUNTED. A truck who deleted their second of three types has
     * sort values 0 and 2; counting rows would hand the new type 2 as well and the order would depend
     * on which row the database returned first. */
    const { data: last } = await supabase
      .from('event_types').select('sort_order').eq('truck_id', truck.id)
      .order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const sort_order = ((last as { sort_order?: number } | null)?.sort_order ?? -1) + 1

    /* 🔴 A NEW TYPE IS A COPY OF STANDARD — every value null, i.e. "same as Standard" — unless the
     * caller sent a suggestion's values. So creating one changes nothing until it is edited, which is
     * what the "+ New event type" panel promises. */
    const values: Record<string, unknown> = {}
    for (const k of SERVICE_KEYS) {
      values[k] = body.values && typeof body.values === 'object'
        ? cleanValue(k, (body.values as Record<string, unknown>)[k])
        : blankTypeValues()[k]
    }

    const { data, error } = await supabase
      .from('event_types')
      .insert({ truck_id: truck.id, name, sort_order, ...values })
      .select('id')
      .single()
    if (error) {
      /* 23505 is the (truck_id, lower(name)) unique index. It is the one error an operator can cause
       * by hand, so it gets a sentence rather than a code. */
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: `You already have a type called “${name}”.` }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true, id: (data as { id: string }).id })
  }

  // ── UPDATE one setting, or the name ─────────────────────────────────────────────────────────────
  if (action === 'update') {
    const id = String(body.id ?? '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    /* ⚠️ AN ALLOWLIST, AND NOTHING SPREADS `body`. A client PATCHing `truck_id` or `id` is dropped
     * rather than honoured — the same discipline `sg_upsert_place` and `update_settings` follow. */
    const patch: Record<string, unknown> = {}
    if ('name' in body) {
      const name = cleanName(body.name)
      if (!name) return NextResponse.json({ error: 'Give the type a name.' }, { status: 400 })
      patch.name = name
    }
    for (const k of SERVICE_KEYS) {
      /* 🔴 `in` AND NOT A TRUTHINESS TEST. `null` is a real value here ("same as Standard") and so is
       * `false`; only an ABSENT key means "leave this setting alone". */
      if (k in body) patch[k] = cleanValue(k, body[k])
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })
    patch.updated_at = new Date().toISOString()

    const { error } = await supabase
      .from('event_types').update(patch).eq('id', id).eq('truck_id', truck.id)
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: `You already have a type called “${patch.name}”.` }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  // ── REORDER ─────────────────────────────────────────────────────────────────────────────────────
  if (action === 'reorder') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
    if (!ids.length) return NextResponse.json({ error: 'ids required' }, { status: 400 })
    /* ⚠️ ONE UPDATE PER ROW, EACH SCOPED BY truck_id. An upsert of the whole list would need every
     * column (name is NOT NULL) and would let a caller rewrite a name through the reorder path. */
    for (let i = 0; i < ids.length; i++) {
      await supabase.from('event_types')
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq('id', ids[i]).eq('truck_id', truck.id)
    }
    return NextResponse.json({ ok: true })
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    const id = String(body.id ?? '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    /* 🔴 ITS EVENTS BECOME STANDARD, AND THE DATABASE DOES IT. `event_type_id` is
     * `on delete set null`, so no bulk update runs here and no event is lost — which is exactly what
     * the delete confirm on the panel says happens.
     * ⚠️ NOTHING IS WRITTEN BACK ONTO THOSE EVENTS. Their service settings return to the van and truck
     * defaults, and any hand change the truck made on one of them is still there, because a hand
     * change was never a type value. */
    const { error } = await supabase.from('event_types').delete().eq('id', id).eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // ── ASSIGN a type to one event, from the dashboard or the Add event modal ───────────────────────
  if (action === 'assign') {
    const eventId = String(body.eventId ?? '')
    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
    const rawType = body.typeId === null || body.typeId === '' ? null : String(body.typeId ?? '')

    /* The event must be this truck's. ⚠️ Checked by a read rather than trusted, because `eventId`
     * arrives from a client. */
    const { data: ev } = await supabase
      .from('truck_events').select('id').eq('id', eventId).eq('truck_id', truck.id).maybeSingle()
    if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    let typeId: string | null = null
    if (rawType) {
      const { data: t } = await supabase
        .from('event_types').select('id').eq('id', rawType).eq('truck_id', truck.id).maybeSingle()
      if (!t) return NextResponse.json({ error: 'Event type not found' }, { status: 404 })
      typeId = String((t as { id: string }).id)
    }

    /* 🔴 ONE COLUMN WRITE. That is the whole of switching an event's type, including on a LIVE event:
     * nothing was copied onto the event, so there is nothing to re-apply and nothing to unwind, and
     * every hand change the truck made on this event is still there and still wins. */
    const patch: Record<string, unknown> = { event_type_id: typeId, updated_at: new Date().toISOString() }

    /* ── "CLEAR MY CHANGES AND USE <TYPE> EXACTLY" (decision 2) ──────────────────────────────────
     * 🔴 IT CLEARS EXACTLY THE COLUMNS A TYPE CAN SET, derived from SERVICE_KEYS so it cannot fall out
     * of step when stage 3 adds a setting. Every other per-event setting — the pause, the extra wait,
     * the paid step, the offline rules, the completion presses — is left exactly as the truck left it,
     * because a type does not set them and clearing them would be destroying work for no reason.
     * ⚠️ `order_ready_source` IS CLEARED ALONGSIDE `order_ready_override`, or the row would say "the
     * truck chose this" about a value that is now NULL. */
    if (body.clearOwn === true) {
      for (const k of SERVICE_KEYS) for (const col of EVENT_OVERRIDE_COLUMNS[k]) patch[col] = null
      patch.order_ready_source = null
    }

    const { error } = await supabase
      .from('truck_events').update(patch).eq('id', eventId).eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, typeId })
  }

  // ── THE USUAL TYPE FOR A PLACE (decision 5) ────────────────────────────────────────────────────
  if (action === 'usual_for_venue') {
    /* 🔴 WORKED OUT WHEN NEEDED, FROM THE TRUCK'S OWN HISTORY — no defaults table to keep in step and
     * nothing to migrate when a venue is renamed. `normalisePlaceName` is the ONE matching function
     * `truck_places.name_key` is defined as, so this screen and the places list agree about what "the
     * same place" means. */
    const { ok, typeId } = await usualTypeForVenue(
      supabase, truck.id, typeof body.venueName === 'string' ? body.venueName : null, normalizeVenue,
    )
    return NextResponse.json({ ok, typeId })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
