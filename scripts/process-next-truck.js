// Reads data/hatchesup-trucks.json, processes the next unprocessed truck,
// scrapes its menu, stores to Supabase, marks as done.
// Run once per hour via cron.
//
// Usage:  node scripts/process-next-truck.js
// Cron:   0 * * * * cd /path/to/village-foodie && node scripts/process-next-truck.js >> logs/truck-processor.log 2>&1

import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DATA_FILE = 'data/hatchesup-trucks.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const STANDARD_CATEGORIES = [
  'Starters','Mains','Burgers','Pizza','Wraps & Sandwiches',
  'Sides','Dips & Sauces','Desserts','Drinks','Kids Menu','Specials','Other',
];

// ── Menu page scraper ─────────────────────────────────────────────────────────

async function scrapeMenu(browser, orderUrl) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    const isHatchesup = orderUrl.includes('.hatchesup.app');
    let basketUrl = orderUrl;

    if (isHatchesup) {
      const rootUrl = orderUrl.replace(/\/basket\/?$/, '').replace(/\/$/, '');
      await page.goto(rootUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(2000);
      const btn = await page.$('input[type="submit"][value="Continue"]');
      if (btn) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          btn.click(),
        ]);
        basketUrl = page.url();
      } else {
        basketUrl = `${rootUrl}/basket`;
        await page.goto(basketUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      }
    } else {
      await page.goto(orderUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    }
    await sleep(3000);

    // Scroll to trigger lazy-loaded content
    await page.evaluate(async () => {
      await new Promise(resolve => {
        let total = 0;
        const distance = 200;
        const timer = setInterval(() => {
          window.scrollBy(0, distance); total += distance;
          if (total >= document.body.scrollHeight * 1.5) { clearInterval(timer); resolve(); }
        }, 80);
        setTimeout(() => { clearInterval(timer); resolve(); }, 10000);
      });
    });
    await sleep(2000);

    const text = await page.evaluate(() => document.body.innerText);
    return text && text.length > 200 ? { text, basketUrl } : null;
  } finally {
    await page.close().catch(() => {});
  }
}

// ── Gemini menu extraction ────────────────────────────────────────────────────

async function extractMenu(model, truckName, menuText) {
  const prompt = `You are a menu digitisation assistant for "${truckName}".
Extract all menu items from the content below.

Available categories (use exactly):
${STANDARD_CATEGORIES.map(c => `- ${c}`).join('\n')}

Rules:
- description: dish description only — no allergen labels
- allergens: separate array e.g. ["Dairy","Gluten"]
- dietary: separate array e.g. ["Vegetarian","Vegan"]
- price: number, 0 if missing
- max 8 categories
- Return ONLY valid JSON, no markdown

Response format:
{"categories":["Cat1","Cat2"],"items":[{"name":"...","description":"...","price":0,"category":"...","allergens":[],"dietary":[]}]}

Menu content:
${menuText.slice(0, 80000)}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      let raw = result.response.text().trim();
      if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      return JSON.parse(raw);
    } catch (err) {
      if (attempt < 3) { await sleep(2000); continue; }
      throw new Error(`Gemini extraction failed: ${err.message}`);
    }
  }
}

// ── Supabase: upsert discovery_trucks with menu URL ───────────────────────────

async function storeTruck(truckName, basketUrl) {
  const { error } = await sb
    .from('discovery_trucks')
    .upsert({ name: truckName, menu_url: basketUrl, order_url: basketUrl },
             { onConflict: 'name', ignoreDuplicates: false });
  if (error) throw new Error(`DB upsert failed: ${error.message}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const ts = new Date().toLocaleString('en-GB');
  console.log(`\n[${ts}] process-next-truck starting`);

  // Read truck list
  let data;
  try {
    data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error(`Cannot read ${DATA_FILE}: ${err.message}`);
    console.error('Run seed-hatchesup-trucks.js first.');
    process.exit(1);
  }

  const pending  = data.trucks.filter(t => !t.processed && t.orderUrl);
  const noUrl    = data.trucks.filter(t => !t.processed && !t.orderUrl);
  const done     = data.trucks.filter(t => t.processed).length;
  const total    = data.trucks.length;

  console.log(`Progress: ${done}/${total} done, ${pending.length} pending, ${noUrl.length} without URL`);

  if (pending.length === 0) {
    if (noUrl.length > 0) {
      console.log(`⚠️  ${noUrl.length} trucks have no order URL — nothing to process`);
      console.log('   Re-run seed-hatchesup-trucks.js to refresh the list.');
    } else {
      console.log('✅ All trucks processed!');
    }
    return;
  }

  const truck = pending[0];
  const idx = data.trucks.findIndex(t => t.name === truck.name);
  console.log(`\nProcessing [${done + 1}/${total}]: ${truck.name}`);
  console.log(`URL: ${truck.orderUrl}`);

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    // Scrape
    const scraped = await scrapeMenu(browser, truck.orderUrl);
    if (!scraped) {
      console.log('✗ Empty page — marking as processed with error');
      data.trucks[idx] = { ...truck, processed: true, processedAt: new Date().toISOString(), menuChars: 0, error: 'empty_page' };
      writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      return;
    }
    console.log(`✓ Scraped ${scraped.text.length} chars → ${scraped.basketUrl}`);

    // Extract
    let parsed;
    try {
      parsed = await extractMenu(model, truck.name, scraped.text);
    } catch (err) {
      console.log(`✗ Menu extraction failed: ${err.message}`);
      // Don't mark as processed — transient error, retry next run
      console.log('  Will retry on next run.');
      return;
    }

    const itemCount = parsed?.items?.length ?? 0;
    const catCount  = parsed?.categories?.length ?? 0;
    console.log(`✓ Extracted ${itemCount} items across ${catCount} categories`);
    if (itemCount > 0) {
      for (const item of (parsed.items || []).slice(0, 10)) {
        console.log(`  [${item.category}] ${item.name} — £${Number(item.price || 0).toFixed(2)}`);
      }
      if (itemCount > 10) console.log(`  ... and ${itemCount - 10} more`);
    }

    // Store basket URL in discovery_trucks
    await storeTruck(truck.name, scraped.basketUrl);
    console.log(`✓ Stored menu_url in discovery_trucks`);

    // Mark as done
    data.trucks[idx] = {
      ...truck,
      orderUrl: scraped.basketUrl,
      processed: true,
      processedAt: new Date().toISOString(),
      menuChars: scraped.text.length,
      itemCount,
      error: null,
    };
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

    const remaining = pending.length - 1;
    console.log(`\n✅ Done. ${remaining} truck(s) remaining.`);

  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch(err => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});
