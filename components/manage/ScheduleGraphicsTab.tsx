'use client'
// components/manage/ScheduleGraphicsTab.tsx
// Manage → Schedule graphics. STAGE 1 ONLY: the section shell, the plan gate, and the
// "Places & groups" screen. Design and This week are deliberately placeholders.
//
// ── 🔴 WHAT IS AND IS NOT HERE ────────────────────────────────────────────────────────────────────
// Stage 2 is the design upload and the image generator; stage 3 is the posting checklist. Neither is
// started. The two placeholder panels exist because the approved mockup has three tabs — a section
// that silently had one tab now and three later would teach the operator the wrong shape.
//
// ── 🔴 WHY OPENING THIS TAB WRITES ────────────────────────────────────────────────────────────────
// `sg_places` seeds a place row per pitch in the truck's schedule before it answers. An operator should
// not have to type out places they already have twelve months of events for. The seed is idempotent in
// the DATABASE (unique (truck_id, name_key) + `on conflict do nothing`), so a refresh, a second tab or
// two devices produce one row — see lib/schedule-graphics/places.ts and the migration's own note.
//
// ── PHONE FIRST ──────────────────────────────────────────────────────────────────────────────────
// Operators use this on a phone at the hatch and on an iPad in the van. The two panes are ONE column
// on a phone (list, then the selected place below it) and two from `lg`. ⚠️ `lg:` not `md:` — the
// detail pane carries a three-input add row, and 768px is not enough for it beside a list.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Btn, Card, Input, Spinner } from '@/components/manage/primitives'
import { FeatureGate } from '@/components/FeatureGate'
import { canAccess, type Plan } from '@/lib/features'
import { WORDING_TOKENS } from '@/lib/schedule-graphics/places'

type Section = 'design' | 'week' | 'places'

/* ⚠️ `unknown`, NOT `any`. The page's `api` helper returns parsed JSON, which is genuinely unknown at
 * this boundary — so it is narrowed ONCE, where it is read, rather than spreading `any` through every
 * caller. The cast is to a declared shape the route actually returns. */
type Api = (action: string, extra?: Record<string, unknown>) => Promise<unknown>

interface PlacesResponse { places?: Place[]; defaultWording?: string }
interface UpsertResponse { id?: string | null }

/** The message off a thrown value, without assuming it is an Error. */
const msgOf = (e: unknown, fallback: string): string => {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  return m || fallback
}

interface Group { id: string; place_id: string; name: string; url: string; rules: string | null; sort_order: number }
interface Place {
  id: string
  venue_id: string | null
  name: string
  short_name: string | null
  address: string | null
  postcode: string | null
  group_post_wording: string | null
  next_event_date: string | null
  groups: Group[]
}

/** "Tue 13 Oct" — the muted line's date. ⚠️ Built from the 'YYYY-MM-DD' PARTS, never `new Date(str)`:
 *  a date-only string parsed as a Date is UTC midnight, which renders as the previous day west of us. */
function shortDay(ymd: string | null): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(dt)
}

export function ScheduleGraphicsTab({ truck, api, showToast }: {
  truck: { plan: Plan; feature_overrides: Record<string, boolean> | null; trial_expires_at: string | null } | null
  api: Api
  showToast: (msg: string, kind?: 'success' | 'error') => void
}) {
  const [section, setSection] = useState<Section>('places')

  const allowed = canAccess(
    truck?.plan ?? 'starter', 'schedule_graphics',
    truck?.feature_overrides ?? {}, truck?.trial_expires_at ?? null,
  )

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-black text-slate-900">Schedule graphics</h2>

      {/* The three section tabs. ⚠️ A `role="tablist"` row, not the page's own tab bar — this sits
          INSIDE the Manage tab and must not read as a second level of the same navigation. */}
      <div role="tablist" aria-label="Schedule graphics sections" className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {([['design', 'Design'], ['week', 'This week'], ['places', 'Places & groups']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={section === id} onClick={() => setSection(id)}
            className={`px-3 py-2 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${
              section === id ? 'border-orange-500 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 🔴 THE GATE WRAPS THE CONTENT, NOT THE TAB. A locked plan sees the section and its tabs with a
          short upgrade message under them — the brief's "locked plans see the tab, not an error".
          `FeatureGate` is the same component every other gated surface uses, so the message, the plan
          name and the App Store CTA suppression are all inherited rather than re-stated here. */}
      <FeatureGate
        feature="schedule_graphics"
        plan={truck?.plan}
        overrides={truck?.feature_overrides}
        trialExpiresAt={truck?.trial_expires_at}
        upgradeMessage="Schedule graphics is on Pro and Max"
      >
        {section === 'design' && <ComingNext what="Your design" />}
        {section === 'week'   && <ComingNext what="This week's graphic" />}
        {section === 'places' && allowed && <PlacesAndGroups api={api} showToast={showToast} />}
      </FeatureGate>
    </div>
  )
}

function ComingNext({ what }: { what: string }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-3xl mb-2">🎨</p>
      <p className="font-bold text-slate-700">{what}</p>
      <p className="text-sm text-slate-400 mt-1">Coming next</p>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PLACES & GROUPS
// ════════════════════════════════════════════════════════════════════════════════════════════════
function PlacesAndGroups({ api, showToast }: {
  api: Api
  showToast: (msg: string, kind?: 'success' | 'error') => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [places, setPlaces] = useState<Place[]>([])
  const [defaultWording, setDefaultWording] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  /** Bumped to ask for a fresh read; `keepId` is the place to stay on across it. */
  const [reloadKey, setReloadKey] = useState(0)
  const [keepId, setKeepId] = useState<string | null>(null)

  /* ── 🔴 THE LOAD IS AN ASYNC IIFE WITH A `cancelled` FLAG, which is the pattern PaymentsTab uses,
   * and it is not a style choice. Setting state SYNCHRONOUSLY in an effect body triggers cascading
   * renders (eslint's react-hooks/set-state-in-effect says so, and it caught exactly that here); the
   * flag additionally stops a setState landing after the operator has switched tab — the warning
   * nobody sees in development and everybody sees in a log.
   * ⚠️ `loading` STARTS true, so the spinner shows before the first read without an effect writing it. */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = (await api('sg_places')) as PlacesResponse
        if (cancelled) return
        const rows: Place[] = r.places ?? []
        setPlaces(rows)
        setDefaultWording(String(r.defaultWording ?? ''))
        // ⚠️ THE SELECTION SURVIVES A RELOAD when the place is still there. Resetting to the first row
        // after every save would throw the operator back to the top of the list mid-edit.
        setSelectedId(prev => {
          const want = keepId ?? prev
          return want && rows.some(p => p.id === want) ? want : (rows[0]?.id ?? null)
        })
      } catch (e: unknown) {
        if (!cancelled) setError(msgOf(e, 'Couldn’t load places.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // ⚠️ `keepId` IS READ, NOT WATCHED. Changing which place to keep must not by itself trigger a
    // read — `reloadKey` is what asks for one, and `reload` sets the two together.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, reloadKey])

  /** Ask for a fresh read, staying on `id`. Called from event handlers, never from an effect. */
  const reload = useCallback((id?: string | null) => {
    setKeepId(id ?? null)
    setLoading(true)
    setError(null)
    setReloadKey(k => k + 1)
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return places
    return places.filter(p =>
      p.name.toLowerCase().includes(q)
      || String(p.short_name ?? '').toLowerCase().includes(q)
      || String(p.postcode ?? '').toLowerCase().includes(q))
  }, [places, search])

  const selected = places.find(p => p.id === selectedId) ?? null

  const addPlace = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      const r = (await api('sg_upsert_place', { name })) as UpsertResponse
      setNewName(''); setAdding(false)
      reload(r?.id ?? null)
      showToast('Place added', 'success')
    } catch (e: unknown) { showToast(msgOf(e, 'Couldn’t add that place'), 'error') }
  }

  if (loading) return <div className="py-12 flex justify-center"><Spinner /></div>

  if (error) {
    return (
      <Card className="p-6">
        <p className="text-sm font-bold text-red-600">{error}</p>
        <div className="mt-3"><Btn label="Try again" colour="slate" size="sm" onClick={() => reload(selectedId)} /></div>
      </Card>
    )
  }

  return (
    // 🔴 ONE COLUMN UNTIL `lg`, THEN TWO. On a phone the list comes first and the selected place's
    // cards sit under it — which is also the order a person reads them in.
    <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-4 items-start">

      {/* ── THE LIST ──────────────────────────────────────────────────────────────────────────── */}
      <Card className="p-3 space-y-2">
        <Input label="Search" value={search} onChange={setSearch} placeholder="Place or postcode"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        {adding ? (
          <div className="space-y-2 pt-1">
            <Input label="Place name" value={newName} onChange={setNewName} placeholder="Lavenham Village Hall" />
            <div className="flex gap-2">
              <Btn label="Add" size="sm" onClick={addPlace} disabled={!newName.trim()} />
              <Btn label="Cancel" colour="ghost" size="sm" onClick={() => { setAdding(false); setNewName('') }} />
            </div>
          </div>
        ) : (
          <Btn label="+ New place" colour="slate" size="sm" onClick={() => setAdding(true)} />
        )}

        {places.length === 0 ? (
          // ⚠️ NAMES THE CAUSE. An empty list here almost always means the schedule is empty, not that
          // the feature is broken — so it says so rather than offering a bare "no places".
          <p className="text-xs text-slate-400 px-1 py-3">
            No places yet. Places appear here from your schedule, or add one above.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 -mx-1">
            {filtered.map(p => {
              const n = p.groups.length
              const next = shortDay(p.next_event_date)
              return (
                <li key={p.id}>
                  <button onClick={() => setSelectedId(p.id)}
                    aria-current={p.id === selectedId}
                    className={`w-full text-left px-2 py-2 rounded-lg transition-colors ${
                      p.id === selectedId ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
                    <span className="block text-sm font-bold text-slate-900 truncate">{p.name}</span>
                    {n === 0 ? (
                      // The accent colour, per the mockup: no groups is the thing to go and fix.
                      <span className="block text-xs font-bold text-orange-600">No groups yet</span>
                    ) : (
                      <span className="block text-xs text-slate-400 truncate">
                        {n} group{n === 1 ? '' : 's'}{next ? ` · next: ${next}` : ''}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
            {filtered.length === 0 && (
              <li className="px-2 py-3 text-xs text-slate-400">Nothing matches “{search.trim()}”.</li>
            )}
          </ul>
        )}
      </Card>

      {/* ── THE DETAIL ────────────────────────────────────────────────────────────────────────── */}
      {selected ? (
        <PlaceDetail
          key={selected.id}
          place={selected}
          defaultWording={defaultWording}
          api={api}
          showToast={showToast}
          onChanged={() => reload(selected.id)}
        />
      ) : (
        <Card className="p-8 text-center">
          <p className="text-sm text-slate-400">Pick a place to add its Facebook groups.</p>
        </Card>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE THREE CARDS
// ════════════════════════════════════════════════════════════════════════════════════════════════
function PlaceDetail({ place, defaultWording, api, showToast, onChanged }: {
  place: Place
  defaultWording: string
  api: Api
  showToast: (msg: string, kind?: 'success' | 'error') => void
  onChanged: () => void
}) {
  // ⚠️ LOCAL DRAFT STATE, SAVED ON BLUR. `key={selected.id}` on this component remounts it when the
  // selection changes, so a draft can never leak from one place onto another — which is the bug a
  // single shared draft object produces the first time somebody clicks a second place mid-edit.
  const [name, setName] = useState(place.name)
  const [shortName, setShortName] = useState(place.short_name ?? '')
  const [address, setAddress] = useState(place.address ?? '')
  const [postcode, setPostcode] = useState(place.postcode ?? '')
  const [wording, setWording] = useState(place.group_post_wording ?? '')

  const saveField = async (field: string, value: string, was: string | null) => {
    if (value.trim() === String(was ?? '').trim()) return
    try {
      await api('sg_upsert_place', { id: place.id, [field]: value })
      onChanged()
    } catch (e: unknown) { showToast(msgOf(e, 'Couldn’t save'), 'error') }
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* CARD 1 — the identity */}
      <Card className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Name on posts" value={name} onChange={setName}
          onBlur={() => saveField('name', name, place.name)} />
        <Input label="Short name" value={shortName} onChange={setShortName}
          onBlur={() => saveField('short_name', shortName, place.short_name)} />
        <Input label="Address" value={address} onChange={setAddress}
          onBlur={() => saveField('address', address, place.address)} />
        <Input label="Postcode" value={postcode} onChange={setPostcode}
          onBlur={() => saveField('postcode', postcode, place.postcode)}
          autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
      </Card>

      {/* CARD 2 — the groups */}
      <GroupsCard place={place} api={api} showToast={showToast} onChanged={onChanged} />

      {/* CARD 3 — the wording */}
      <Card className="p-4 space-y-2">
        <p className="text-sm font-black text-slate-900">Wording for group posts</p>
        <textarea
          value={wording}
          onChange={e => setWording(e.target.value)}
          onBlur={() => saveField('group_post_wording', wording, place.group_post_wording)}
          rows={3}
          /* 🔴 THE PLACEHOLDER IS THE TRUCK'S OWN DEFAULT, resolved on the server by
             `effectiveGroupPostWording`. That is what makes "blank = the default" visible rather than a
             rule the operator has to be told: an empty box SHOWS the words it will fall back to. */
          placeholder={defaultWording}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <p className="text-xs text-slate-400">{WORDING_TOKENS.join(' · ')}</p>
      </Card>
    </div>
  )
}

function GroupsCard({ place, api, showToast, onChanged }: {
  place: Place
  api: Api
  showToast: (msg: string, kind?: 'success' | 'error') => void
  onChanged: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [rules, setRules] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = () => { setEditingId(null); setUrl(''); setName(''); setRules('') }

  const submit = async () => {
    if (!name.trim() || !url.trim()) return
    setBusy(true)
    try {
      await api('sg_upsert_group', { place_id: place.id, id: editingId ?? undefined, name, url, rules })
      reset(); onChanged()
    } catch (e: unknown) { showToast(msgOf(e, 'Couldn’t save that group'), 'error') }
    finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    setBusy(true)
    try { await api('sg_delete_group', { id }); reset(); onChanged() }
    catch (e: unknown) { showToast(msgOf(e, 'Couldn’t remove that group'), 'error') }
    finally { setBusy(false) }
  }

  return (
    <Card className="p-4 space-y-3">
      <p className="text-sm font-black text-slate-900">Facebook groups</p>

      {place.groups.length === 0 && (
        <p className="text-xs text-slate-400">None yet. Paste a group link below.</p>
      )}

      <ul className="divide-y divide-slate-100">
        {place.groups.map(g => (
          <li key={g.id} className="py-2">
            {editingId === g.id ? (
              // ⚠️ EDIT IS THE SAME THREE FIELDS AS THE ADD ROW, in place. A separate modal would be a
              // second form to keep in step with the first.
              <div className="space-y-2">
                <Input label="Group link" value={url} onChange={setUrl} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                <Input label="Group name" value={name} onChange={setName} />
                <Input label="Rules (optional)" value={rules} onChange={setRules} />
                <div className="flex flex-wrap gap-2">
                  <Btn label="Save" size="sm" loading={busy} onClick={submit} disabled={!name.trim() || !url.trim()} />
                  <Btn label="Cancel" colour="ghost" size="sm" onClick={reset} />
                  {/* 🔴 REMOVE LIVES INSIDE EDIT, NOT ON THE ROW. The mockup's row carries Open and Edit
                      only, and a delete sitting next to an Open button that opens Facebook is one
                      mis-tap from losing a group. Putting it behind Edit keeps the row as approved
                      while leaving the operator a way out of a wrong paste. */}
                  <Btn label="Remove" colour="red" size="sm" loading={busy} onClick={() => remove(g.id)} />
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">{g.name}</p>
                  <p className="text-xs text-slate-400 truncate">{g.url}</p>
                  {g.rules && <p className="text-xs font-bold text-slate-600 mt-0.5">{g.rules}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {/* ⚠️ `rel="noopener noreferrer"` ON A NEW TAB TO A THIRD-PARTY SITE. Without
                      `noopener` the opened page gets a handle on this one via window.opener. */}
                  <a href={g.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100">
                    Open
                  </a>
                  <Btn label="Edit" colour="ghost" size="sm"
                    onClick={() => { setEditingId(g.id); setUrl(g.url); setName(g.name); setRules(g.rules ?? '') }} />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* THE ADD ROW — three inputs and a button, per the mockup. Stacked on a phone, three across
          from `sm`, because a pasted Facebook URL needs the width. */}
      {editingId === null && (
        <div className="pt-1 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input label="Paste group link" value={url} onChange={setUrl}
              placeholder="facebook.com/groups/…" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            <Input label="Group name" value={name} onChange={setName} placeholder="Lavenham Noticeboard" />
            <Input label="Rules (optional)" value={rules} onChange={setRules} placeholder="Business posts Fridays only" />
          </div>
          <Btn label="Add" size="sm" loading={busy} onClick={submit} disabled={!name.trim() || !url.trim()} />
        </div>
      )}
    </Card>
  )
}
