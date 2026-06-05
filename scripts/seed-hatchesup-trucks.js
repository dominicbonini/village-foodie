// Scrapes hatchesup.co.uk once, discovers order URLs for every truck,
// and saves data/hatchesup-trucks.json for hourly batch processing.
// Run this manually whenever you want a fresh truck list.
//
// Usage: node scripts/seed-hatchesup-trucks.js

import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const TARGET_URL = 'https://hatchesup.co.uk/find-food/?when=7days';
const OUTPUT_FILE = 'data/hatchesup-trucks.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const normName = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Trucks successfully scraped in previous runs — skip re-processing
const ALREADY_DONE = new Set([
  'linglingssteamkitchen',
  'pizzamondo',
  'steakandhonour',
  'azahar',
  'rotisseroll',
]);

function constructOrderUrls(truckName) {
  const normalised = truckName.toLowerCase().replace(/&/g, 'and').replace(/[''']/g, '');
  const compact = normalised.replace(/[^a-z0-9]/g, '');
  const hyphenated = normalised.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return [
    `https://${compact}.hatchesup.app`,
    `https://order.${hyphenated}.co.uk/basket`,
  ];
}

async function findWorkingUrl(truckName, pageLinks) {
  const norm = normName(truckName);
  const pageLink = pageLinks.find(l => normName(l.truckName) === norm);
  if (pageLink?.href) return pageLink.href;
  for (const url of constructOrderUrls(truckName)) {
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(6000) });
      if (res.ok) return url;
    } catch { /* unreachable */ }
  }
  // Fall back to hatchesup subdomain even if HEAD fails — may still work in browser
  return constructOrderUrls(truckName)[0];
}

async function main() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const gemini = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });

  // ── 1. Scrape hatchesup main page ─────────────────────────────────────────
  console.log(`\nScraping ${TARGET_URL} ...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
  });

  let scheduleText = '', pageOrderLinks = [];
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, 200); total += 200;
        if (total >= document.body.scrollHeight * 1.5) { clearInterval(timer); resolve(); }
      }, 80);
      setTimeout(() => { clearInterval(timer); resolve(); }, 15000);
    });
  });
  await sleep(2000);
  scheduleText = await page.evaluate(() => document.body.innerText);
  pageOrderLinks = await page.evaluate(() => {
    const links = [];
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href || '';
      if (!href.includes('/basket') && !href.includes('.hatchesup.app') && !href.match(/\/\/order\./)) return;
      let truckName = '';
      let el = a.parentElement;
      for (let d = 0; d < 8 && el && !truckName; d++) {
        for (const tag of ['h2','h3','h4','h5','h6']) {
          const h = el.querySelector(tag);
          if (h?.innerText?.trim() && h.innerText.trim().length < 60) { truckName = h.innerText.trim(); break; }
        }
        el = el.parentElement;
      }
      links.push({ href, truckName });
    });
    return links;
  });
  await page.close();
  await browser.close();
  console.log(`✓ ${scheduleText.length} chars, ${pageOrderLinks.length} order links found`);

  // ── 2. Gemini: extract unique truck names in schedule order ───────────────
  console.log('\nExtracting truck names...');
  const prompt = `Extract every unique food truck name from this schedule.
Return JSON: {"trucks":["Name 1","Name 2",...]}
- Unique names only — if a truck appears on multiple days, list it once
- Exact spelling and capitalisation as written
- Preserve the order they first appear
- No markdown, no explanation

Schedule:
${scheduleText.slice(0, 150000)}`;

  let truckNames = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await gemini.generateContent(prompt);
      let raw = result.response.text().trim();
      if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      truckNames = JSON.parse(raw).trucks || [];
      break;
    } catch (err) {
      if (attempt < 3) { await sleep(3000); continue; }
      throw new Error(`Truck name extraction failed: ${err.message}`);
    }
  }
  console.log(`✓ ${truckNames.length} unique trucks found`);

  // ── 3. Merge with any existing truck list to preserve processed state ──────
  let existing = {};
  if (existsSync(OUTPUT_FILE)) {
    try {
      const prev = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'));
      for (const t of prev.trucks || []) existing[normName(t.name)] = t;
      console.log(`✓ Merged with existing list (${Object.keys(existing).length} previous entries)`);
    } catch { /* ignore corrupt file */ }
  }

  // ── 4. Discover order URLs ────────────────────────────────────────────────
  console.log('\nDiscovering order URLs (this may take a few minutes)...');
  const trucks = [];
  for (let i = 0; i < truckNames.length; i++) {
    const name = truckNames[i];
    const norm = normName(name);
    const prev = existing[norm];

    // Preserve already-processed state from previous seed or hardcoded list
    if (prev?.processed || ALREADY_DONE.has(norm)) {
      process.stdout.write(`  [${i+1}/${truckNames.length}] ✓ ${name} (already done)\n`);
      trucks.push({
        name,
        orderUrl: prev?.orderUrl || constructOrderUrls(name)[0],
        processed: true,
        processedAt: prev?.processedAt || new Date().toISOString(),
        menuChars: prev?.menuChars || null,
        error: null,
      });
      continue;
    }

    process.stdout.write(`  [${i+1}/${truckNames.length}] ${name} ... `);
    const orderUrl = await findWorkingUrl(name, pageOrderLinks);
    console.log(orderUrl || 'no URL');
    trucks.push({
      name,
      orderUrl: orderUrl || null,
      processed: false,
      processedAt: null,
      menuChars: null,
      error: null,
    });
  }

  // ── 5. Save ───────────────────────────────────────────────────────────────
  const output = {
    generatedAt: new Date().toISOString(),
    source: TARGET_URL,
    trucks,
  };
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  const withUrl  = trucks.filter(t => t.orderUrl).length;
  const done     = trucks.filter(t => t.processed).length;
  const pending  = trucks.filter(t => !t.processed && t.orderUrl).length;
  const noUrl    = trucks.filter(t => !t.processed && !t.orderUrl).length;

  console.log(`\n✅ Saved to ${OUTPUT_FILE}`);
  console.log(`   ${trucks.length} trucks total`);
  console.log(`   ✓ ${done} already processed`);
  console.log(`   ⏳ ${pending} pending (have URL)`);
  console.log(`   ✗ ${noUrl} skipped (no URL found)`);
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
