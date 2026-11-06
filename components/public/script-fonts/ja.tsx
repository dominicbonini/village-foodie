'use client'
// components/public/script-fonts/ja.tsx — cwv-2 (6 November 2026, docs/cwv-2-report.md §3): ONE script font for the public pages, in a module
// of its own so its @font-face rules reach ONLY the pages in that language (components/public/ScriptFont.tsx loads it with next/dynamic;
// Next links its stylesheet only when it renders). The font call is lib/script-fonts.ts's, unchanged: the same family, files, subsets
// and fallback. Its variable is set on the <body> class `hg-script-ja` (lib/public-script.ts), the variable lib/script-fonts.ts's class
// carries in the app, from next/font's own family string — so the stacks in landing.css and public.css resolve exactly as they do today.
import { Noto_Sans_JP } from 'next/font/google'

const font = Noto_Sans_JP({ variable: '--font-script-ja', preload: false, display: 'swap' })

export default function ScriptFontFace() {
  return <style href="hg-script-ja" precedence="default">{`.hg-script-ja{--font-script-ja:${font.style.fontFamily}}`}</style>
}
