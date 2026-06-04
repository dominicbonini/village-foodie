import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractScheduleEvents } from '@/lib/schedule-extract'

// Vercel Pro limit is 60s. Puppeteer + Gemini can take 45-55s on slow sites.
// If timeouts recur at scale, move to a background job (GitHub Actions / queue)
// rather than increasing this further. Fine for trial scale (< 10 trucks).
export const maxDuration = 60

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getTruck(token: string) {
  const { data } = await supabase
    .from('trucks')
    .select('id')
    .eq('dashboard_token', token)
    .single()
  return data
}

// ── Puppeteer launch — works locally (puppeteer) and on Vercel (puppeteer-core + @sparticuz/chromium)
async function launchBrowser() {
  try {
    const chromium = require('@sparticuz/chromium')
    const puppeteer = require('puppeteer-core')
    return await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })
  } catch {
    const puppeteer = require('puppeteer')
    return await puppeteer.launch({ headless: true })
  }
}

// ── Scrape strategies (copied from scripts/run-scraper.js) ────────────────

async function performModernScroll(page: any): Promise<string> {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0
      const distance = 150
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight
        window.scrollBy(0, distance)
        totalHeight += distance
        if (totalHeight >= scrollHeight * 1.5) { clearInterval(timer); resolve(undefined) }
      }, 100)
      setTimeout(() => { clearInterval(timer); resolve(undefined) }, 15000)
    })
  })
  await new Promise(r => setTimeout(r, 3000))
  return page.evaluate(() => document.body.innerText)
}

async function performButtonHunt(page: any): Promise<string> {
  let combinedText: string = await page.evaluate(() => document.body.innerText)
  for (let i = 0; i < 4; i++) {
    const clicked = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*')) as HTMLElement[]
      const candidates = allElements.filter(el => {
        if (!el.offsetParent) return false
        const text = (el.innerText || '').trim().toLowerCase()
        if (text.length > 50) return false
        const isClickable = ['BUTTON', 'A'].includes(el.tagName) || (el as any).onclick !== null || el.getAttribute('role') === 'button'
        const isTrigger = text === 'more events' || text === 'load more' || text === 'older entries' || text === 'next' || text === '>' || text === '»'
        const isBack = text.includes('prev') || text.includes('back') || text.includes('newer')
        return isClickable && isTrigger && !isBack
      })
      if (candidates.length > 0) { candidates[candidates.length - 1].click(); return true }
      return false
    })
    if (clicked) {
      await new Promise(r => setTimeout(r, 5000))
      const newText: string = await page.evaluate(() => document.body.innerText)
      combinedText += `\n\n--- PAGE ${i + 2} START ---\n` + newText
    } else { break }
  }
  return combinedText
}

async function scrapePageContent(
  browser: any,
  url: string,
  rule: 'scroll_lazy' | 'scroll_next'
): Promise<string> {
  const page = await browser.newPage()
  try {
    await page.setUserAgent('Mozilla/5.0 (compatible; HatchGrabBot/1.0)')
    await page.goto(url, { timeout: 20000, waitUntil: 'networkidle2' }).catch(() => {})

    // Extra wait for JS-rendered content
    await new Promise(r => setTimeout(r, 4000))

    // For button-hunting: wait for interactive elements to appear
    if (rule === 'scroll_next') {
      await page.waitForSelector(
        'a, button, [class*="event"], [class*="schedule"], [class*="booking"]',
        { timeout: 5000 }
      ).catch(() => {})
    }

    const content = rule === 'scroll_next'
      ? await performButtonHunt(page)
      : await performModernScroll(page)

    console.log(`[verify] ${rule}: ${content.length} chars from ${url}`)
    return content
  } finally {
    await page.close().catch(() => {})
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, url } = body

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })
  if (!url || !url.startsWith('http')) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const truck = await getTruck(token)
  if (!truck) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  let browser: any
  try {
    try {
      browser = await launchBrowser()
    } catch {
      return NextResponse.json({ error: 'Could not reach this website' }, { status: 502 })
    }

    const [lazyResult, nextResult] = await Promise.allSettled([
      scrapePageContent(browser, url, 'scroll_lazy'),
      scrapePageContent(browser, url, 'scroll_next'),
    ])

    const lazyText = lazyResult.status === 'fulfilled' ? lazyResult.value : ''
    const nextText = nextResult.status === 'fulfilled' ? nextResult.value : ''

    console.log(`[verify] lazy=${lazyText.length} chars, next=${nextText.length} chars`)

    if (!lazyText && !nextText) {
      return NextResponse.json({ error: 'Could not reach this website' }, { status: 502 })
    }

    const betterContent = nextText.length > lazyText.length
      ? { text: nextText, rule: 'scroll_next' as const }
      : { text: lazyText, rule: 'scroll_lazy' as const }

    if (betterContent.text.trim().length < 50) {
      return NextResponse.json({ found: false, events: [], reason: 'no_content' })
    }

    const events = await extractScheduleEvents(betterContent.text)

    console.log(`[verify] Gemini returned ${events.length} events`)

    if (events.length === 0) {
      return NextResponse.json({ found: false, events: [], reason: 'no_events' })
    }

    await supabase
      .from('trucks')
      .update({ scraper_rule: betterContent.rule })
      .eq('id', truck.id)

    return NextResponse.json({
      found: true,
      events,
      rule_detected: betterContent.rule,
    })
  } finally {
    await browser?.close().catch(() => {})
  }
}
