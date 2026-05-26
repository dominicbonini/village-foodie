export function isHatchGrab(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname.includes('hatchgrab')
}

export function isVillageFoodie(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname.includes('villagefoodie')
}
