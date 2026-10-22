// lib/about-server.ts — whether the founder's photo is in this deployment (about-page, 22 October 2026; lib/about.ts says why
// the photo is optional). SERVER-ONLY: it reads the filesystem, at request time (the about and landing pages are dynamic).
import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import { HATCHGRAB_ORIGIN } from '@/lib/marketing-country'
import { ABOUT_PHOTO_PATH } from '@/lib/about'

/** True when public/about/dominic.jpg is in the deployment. */
export function aboutPhotoExists(): boolean {
  try { return fs.statSync(path.join(process.cwd(), 'public', ABOUT_PHOTO_PATH)).isFile() } catch { return false }
}

/** The photo's absolute URL for the JSON-LD (founder.image), or null when there is no photo. */
export function aboutPhotoUrl(): string | null {
  return aboutPhotoExists() ? `${HATCHGRAB_ORIGIN}${ABOUT_PHOTO_PATH}` : null
}
