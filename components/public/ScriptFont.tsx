'use client'
// components/public/ScriptFont.tsx — cwv-2 (6 November 2026, docs/cwv-2-report.md §3): THE PAGE'S OWN SCRIPT FONT, AND NO OTHER.
// Each script's font lives in its own module, imported here through next/dynamic. When the one for the page's language renders on the
// server, Next writes ITS stylesheet into the page's <head> (a render-blocking <link rel="stylesheet">, exactly like the layout CSS it
// replaces), and nothing else's; a Latin page renders none and carries no script-font rules at all. Server-rendered, so the first paint
// already has the font — no swap after hydration.
import dynamic from 'next/dynamic'
import type { ScriptKey } from '@/lib/public-script'

const FACES: Record<ScriptKey, React.ComponentType> = {
  'greek-cyrillic': dynamic(() => import('./script-fonts/greek-cyrillic')),
  ja: dynamic(() => import('./script-fonts/ja')),
  'zh-hk': dynamic(() => import('./script-fonts/zh-hk')),
  th: dynamic(() => import('./script-fonts/th')),
  ar: dynamic(() => import('./script-fonts/ar')),
}

export function ScriptFont({ script }: { script: ScriptKey }) {
  const Face = FACES[script]
  return <Face />
}
