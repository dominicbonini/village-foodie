'use client'
// components/TruckTimeContext.tsx — the truck's TimeSettings for the screens under Manage (Phase 2B).
//
// 🔴 ONE VALUE, FROM THE SERVER: /api/manage sends `truck.time` (lib/truck-time.ts — trucks.timezone,
// else its country's default zone, plus the country's locale, 12/24-hour, date order and week start).
// The Manage page provides it once; a component below it that is not handed `truck` asks here instead
// of naming a zone or a locale of its own.
// ⚠️ Outside a provider, or before the truck has loaded, `useTruckTime` answers the UK's settings with a
// warning (lib/time-utils `timeSettingsOr`) — the one documented fallback, for pre-build payloads.
import { createContext, useContext } from 'react'
import { timeSettingsOr, type TimeSettings } from '@/lib/time-utils'

export const TruckTimeContext = createContext<TimeSettings | null>(null)

export function useTruckTime(): TimeSettings {
  return timeSettingsOr(useContext(TruckTimeContext), 'manage')
}
