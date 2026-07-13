'use client'
// Notifications — dashboard "Settings" tab, iPad-NATIVE only (renders null on web). Mirrors PrintingSettings:
// device-local prefs in Capacitor Preferences + a master permission request. THREE controls:
//   • Master "Allow notifications" → requests OS permission; when off the sub-toggles collapse.
//   • "New order alerts" — the SERVER PUSH (needs a connection + APNs config). The toggle writes
//     van_devices.notify_enabled (via /api/native/bind-device); actual delivery is DEFERRED (needs APNs
//     env + a physical device). Labelled "needs a connection".
//   • "Offline / paused alerts" — a LOCAL notification (device-generated) that fires when this device goes
//     offline. WORKS OFFLINE. Labelled accordingly.
import { useEffect, useState } from 'react'
import { Preferences } from '@capacitor/preferences'
import { isNativeApp, getDeviceId } from '@/lib/native/device'
import { Toggle } from '@/components/dashboard/OrderCard'
import { requestNotificationPermission, NOTIFY_KEYS } from '@/lib/native/notifications'

export function NotificationSettings({ token }: { token: string }) {
  const [ready, setReady] = useState(false)
  const [master, setMaster] = useState(false)          // OS permission granted + master on (this device)
  const [offlineAlerts, setOfflineAlerts] = useState(true)  // LOCAL offline/paused alerts (default ON)
  const [newOrder, setNewOrder] = useState(false)      // mirrors van_devices.notify_enabled (server push)
  const [notice, setNotice] = useState<string | null>(null) // user-facing message when permission is refused/unavailable

  useEffect(() => {
    if (!isNativeApp()) return
    let off = false
    void (async () => {
      const m = (await Preferences.get({ key: NOTIFY_KEYS.master })).value
      const o = (await Preferences.get({ key: NOTIFY_KEYS.offline })).value
      const n = (await Preferences.get({ key: NOTIFY_KEYS.neworder })).value
      if (off) return
      setMaster(m === 'true'); setOfflineAlerts(o !== 'false'); setNewOrder(n === 'true'); setReady(true)
    })()
    return () => { off = true }
  }, [])

  if (!isNativeApp() || !ready) return null

  const toggleMaster = async (v: boolean) => {
    setNotice(null)
    if (v) {
      // OS prompt — must be granted to turn on. requestNotificationPermission never throws (it try/catches
      // internally + returns false), but we guard here too so the toggle can NEVER surface a runtime error.
      let granted = false
      try { granted = await requestNotificationPermission() } catch { granted = false }
      if (!granted) {
        // Denied / unavailable → leave the toggle OFF and tell the operator how to fix it (iOS won't re-prompt
        // once denied — they must enable it in device Settings).
        setNotice('Notifications need to be enabled in your device Settings to turn this on.')
        return
      }
    }
    setMaster(v); await Preferences.set({ key: NOTIFY_KEYS.master, value: String(v) })
  }
  const toggleOffline = async (v: boolean) => { setOfflineAlerts(v); await Preferences.set({ key: NOTIFY_KEYS.offline, value: String(v) }) }
  const toggleNewOrder = async (v: boolean) => {
    setNewOrder(v); await Preferences.set({ key: NOTIFY_KEYS.neworder, value: String(v) })
    // Server-push opt-in: van_devices.notify_enabled (keyed on device_id). Best-effort; delivery is deferred
    // (needs APNs config + hardware). A failed write leaves the local UI state; re-toggling retries.
    try { await fetch('/api/native/bind-device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, device_id: getDeviceId(), notify_enabled: v }) }) } catch { /* offline / transient — retries on next toggle */ }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">🔔 Notifications</p>
          <p className="text-xs text-slate-500 mt-0.5">Alerts on this iPad. Turn on to choose which alerts you get.</p>
        </div>
        <Toggle on={master} onToggle={() => toggleMaster(!master)} />
      </div>

      {notice && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{notice}</p>
      )}

      {master && (
        <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
          <div className="flex items-start justify-between gap-3 pt-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">New order alerts</p>
              <p className="text-xs text-slate-500 mt-0.5">Get notified when a customer order needs confirming.</p>
            </div>
            <Toggle on={newOrder} onToggle={() => toggleNewOrder(!newOrder)} />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">Offline / paused alerts</p>
              <p className="text-xs text-slate-500 mt-0.5">Get notified when this device goes offline (and ordering pauses). <span className="text-green-600">Works offline.</span></p>
            </div>
            <Toggle on={offlineAlerts} onToggle={() => toggleOffline(!offlineAlerts)} />
          </div>
        </div>
      )}
    </div>
  )
}
