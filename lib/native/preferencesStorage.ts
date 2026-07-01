// Supabase auth `storage` adapter backed by @capacitor/preferences instead of localStorage.
//
// WHY: in a WKWebView remote-URL shell, localStorage is NOT reliably durable across a hard navigation
// (/login → /app → dashboard) or a cold app-kill — the web view can hand back a fresh/empty localStorage,
// so getNativeSupabase()'s session silently vanishes → hasNativeSession() goes false → bounce to /login →
// login writes a new localStorage session that again doesn't survive → infinite login loop. @capacitor/
// preferences persists to native storage (UserDefaults on iOS), which survives navigations and cold-kills.
//
// Supabase's `storage` option accepts an async getItem/setItem/removeItem trio; Preferences' API is already
// async and returns/takes plain strings, so it maps 1:1. This is used ONLY by the native client; web uses
// its own cookie/@supabase-ssr client and never touches this.
import { Preferences } from '@capacitor/preferences'

export const preferencesAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const { value } = await Preferences.get({ key })
    return value ?? null
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await Preferences.set({ key, value })
  },
  removeItem: async (key: string): Promise<void> => {
    await Preferences.remove({ key })
  },
}
