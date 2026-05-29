// SINGLE SOURCE OF TRUTH for time display — always use this, never raw DB times
// DB stores HH:MM:SS — this strips seconds for all customer and operator surfaces
/** Strip seconds from HH:MM:SS → HH:MM. Safe on HH:MM too. */
export function formatTime(time: string): string {
  return time?.slice(0, 5) ?? ''
}
