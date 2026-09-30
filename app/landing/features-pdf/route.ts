// app/landing/features-pdf/route.ts
// 🔴 THE FEATURES COMPARISON AS A PDF, GENERATED FROM THE SAME SOURCE THE LANDING TABLE RENDERS.
// GET /landing/features-pdf  ->  application/pdf
//
// ── 🔴 IT IS GENERATED FROM lib/plan-features.ts, NEVER FROM A COPY OF THE MARKUP ───────────────────
// (The generation itself is `lib/plans-pdf.ts` from 30 September 2026 — see the import below. The
// paragraph that follows describes what that module does, and is kept here because it is the reason
// this route exists at all.)
// Every row, price, fee, allowance and footnote below is read at request time from FEATURE_SECTIONS,
// TRANSACTION_ROWS, PLAN_ALLOWANCES, PLAN_PRICES and FOOTNOTES, and the landing's presentation rules
// (which plans get columns, what Trial resolves to, which rows are hidden or renamed, the three cell
// glyphs) come from lib/landing-table.ts — THE SAME MODULE app/landing/page.tsx imports. Add a row to
// the matrix and it appears here on the next request with nothing to update.
// ⚠️ THE FAILURE THIS AVOIDS IS RECORDED: the manual's standalone HTML artifact was a hand-built copy
// of this table, correct the day it was written and wrong the first time a row changed. A PDF is worse
// than a web page for that, because it is forwarded and kept.
//
// ── 🔴 IT DOES NOT INHERIT app/landing/layout.tsx, AND THAT IS THE POINT OF THE CHECK BELOW ─────────
// A Next.js layout wraps PAGES. A Route Handler renders no React and is never wrapped by one, so being
// filed under app/landing/ buys this file NOTHING. (The cost comparison used to be the counter-example
// here: it really did inherit the gate as a child route — until it moved to /compare on 2 September 2026
// and had to have that gate written out by hand. Same lesson, from the other direction.) The gate here is therefore EXPLICIT and deliberately
// uses `verifyAdmin`, the same canonical check app/landing/layout.tsx uses, so the two cannot diverge.
// 🔴 IF THIS CHECK IS DELETED THE WHOLE PRICED FEATURE MATRIX BECOMES A PUBLIC DOWNLOAD. Nothing else
// stands between this URL and the internet.
import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/admin'
// 🔴 THE DOCUMENT ITSELF MOVED TO lib/plans-pdf.ts ON 30 SEPTEMBER 2026, UNCHANGED, so outreach's
// "Plans PDF" attach button generates the SAME file this route downloads. Everything this file kept
// is what makes it a ROUTE: the admin gate, the filename header, and the cache policy.
// ⚠️ A Route Handler cannot export helpers — Next refuses any export that is not a handler — so the
// shared code could not simply be exported from here.
import { generatePlansPdf } from '@/lib/plans-pdf'
import { plansPdfFilename } from '@/lib/outreach-attachments'

export const dynamic = 'force-dynamic'
// Chromium cold-starts and renders. The established launcher in app/api/manage/verify-schedule-url
// sits on the same budget; this does strictly less work than a scrape.
export const maxDuration = 60

export async function GET() {
  // 🔴 THE GATE. See the header: this is NOT inherited, it is the only thing there is.
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const pdf = await generatePlansPdf()
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        // 🔴 THE FILENAME IS DEFINED ONCE, in `lib/outreach-attachments.ts#plansPdfFilename`, because
        // outreach attaches the same file under the same name. Admin's download button still reads it
        // back off this header rather than composing its own.
        // ⚠️ THE DATE IS IN THE NAME ON PURPOSE. Without it, a second download lands as
        // "…features (1).pdf" and a folder of them cannot be told apart; with it, the file says what
        // it is a snapshot of. ISO order (YYYY-MM-DD) so they sort.
        'Content-Disposition': `attachment; filename="${plansPdfFilename()}"`,
        // ⚠️ Never cached: the table is generated from source and the price mask can change.
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (err) {
    console.error('[features-pdf] generation failed:', (err as { message?: string })?.message || err)
    return NextResponse.json({ error: 'Could not generate the PDF' }, { status: 500 })
  }
}
