'use client'
// components/manage/WhereYouTrade.tsx — Manage › Settings › Where you trade (Phase 2D-1).
//
// The same three things the signup step asks, as settings: the country (READ-ONLY — it is tied to the truck's
// card payments), the town or city, and the time zone (only when the country has more than one). Words from
// lib/settings-copy.ts (WHERE_YOU_TRADE_COPY), shared with signup.
// 🔴 Saved through `update_trade_area`, which checks the town and zone together with lib/trade-area.ts — the
// check signup runs. A truck made before this phase has no town yet: nothing is sent until one is given, so
// changing the zone first never meets a "tell us your town" refusal.
import { useState } from 'react'
import { useCountrySettings } from '@/components/CountrySettingsProvider'
import { Card } from '@/components/manage/primitives'
import { TownInput, ZoneSelect, type BasePlace } from '@/components/setup/WhereBasedStep'
import { WHERE_YOU_TRADE_COPY as COPY } from '@/lib/settings-copy'

export interface TradeAreaTruck {
  timezone?: string | null
  base_place_id?: string | null; base_place_name?: string | null; base_region?: string | null
  base_lat?: number | string | null; base_lng?: number | string | null
}

const numOrNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))

export function WhereYouTrade<T extends TradeAreaTruck>({ truck, api, showToast, onTruckUpdate, readOnly = false }: {
  truck: T
  api: (action: string, extra?: Record<string, unknown>) => Promise<{ truck?: Partial<T> } | null | undefined>
  showToast: (msg: string, kind?: 'success' | 'error') => void
  onTruckUpdate: (partial: Partial<T>) => void
  readOnly?: boolean
}) {
  const cs = useCountrySettings()
  const [place, setPlace] = useState<BasePlace>({
    placeId: truck.base_place_id ?? null, name: truck.base_place_name ?? '', region: truck.base_region ?? null,
    lat: numOrNull(truck.base_lat), lng: numOrNull(truck.base_lng),
  })
  const [zone, setZone] = useState<string>(truck.timezone && cs.timezones.includes(truck.timezone) ? truck.timezone : cs.defaultTimezone)
  const [error, setError] = useState<string | null>(null)

  const save = async (next: { place?: BasePlace; zone?: string }) => {
    const p = next.place ?? place, z = next.zone ?? zone
    if (!p.name.trim()) return   // nothing to send until a town is given
    const same = p.name.trim() === (truck.base_place_name ?? '') && (p.placeId ?? null) === (truck.base_place_id ?? null)
      && z === (truck.timezone ?? cs.defaultTimezone)
    if (same) return
    try {
      const res = await api('update_trade_area', {
        timezone: z, base_place_id: p.placeId, base_place_name: p.name.trim(), base_region: p.region,
        base_lat: p.lat, base_lng: p.lng,
        // D22: only when the picked place carries one ('zip_state' countries) — a GB save is unchanged.
        ...(p.regionCode !== undefined ? { base_region_code: p.regionCode } : {}),
      })
      setError(null)
      if (res?.truck) onTruckUpdate(res.truck)
    } catch (e) {
      const msg = e instanceof Error ? e.message : null
      setError(msg)
      showToast(msg ?? 'Couldn’t save settings — please try again.', 'error')
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <p className="text-base font-bold text-slate-800">{COPY.settingsHeading}</p>
      <div>
        <p className="block text-xs font-bold text-slate-600 mb-1">{COPY.country.label}</p>
        <p className="text-sm text-slate-900">{cs.name}</p>
        <p className="text-slate-400 text-xs mt-0.5">{COPY.countryLocked}</p>
      </div>
      <div>
        <label htmlFor="trade-town" className="block text-xs font-bold text-slate-600 mb-1">{COPY.town.label}</label>
        {readOnly ? <p className="text-sm text-slate-900">{place.name || '—'}</p> : (
          <TownInput id="trade-town" country={cs.countryCode} value={place} onChange={setPlace} onCommit={p => save({ place: p })} />
        )}
      </div>
      {cs.timezones.length > 1 && (
        <div>
          <label htmlFor="trade-zone" className="block text-xs font-bold text-slate-600 mb-1">{COPY.timezone.label}</label>
          <ZoneSelect id="trade-zone" zones={cs.timezones} value={zone} onChange={z => { if (readOnly) return; setZone(z); save({ zone: z }) }} />
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </Card>
  )
}
