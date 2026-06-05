// One-off script: scrape hatchesup.co.uk, take first N trucks in schedule order,
// find their order URLs, scrape and Gemini-extract their menus.
// Usage: node scripts/extract-menus-preview.js [--limit=5]

import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const argLimit = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = argLimit ? parseInt(argLimit.split('=')[1], 10) : 5;
const TARGET_URL = 'https://hatchesup.co.uk/find-food/?when=7days';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const normName = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

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
  const pageLink = pageLinks.find(l => l.truckName && normName(l.truckName) === normName(truckName));
  if (pageLink?.href) return pageLink.href;
  for (const url of constructOrderUrls(truckName)) {
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(6000) });
      if (res.ok) return url;
    } catch { /* unreachable */ }
  }
  return null;
}

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

    await page.evaluate(async () => {
      await new Promise(resolve => {
        let total = 0;
        const distance = 200;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          total += distance;
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

const STANDARD_CATEGORIES = [
  'Starters','Mains','Burgers','Pizza','Wraps & Sandwiches',
  'Sides','Dips & Sauces','Desserts','Drinks','Kids Menu','Specials','Other',
];

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
      console.log(`   ✗ Gemini error: ${err.message}`);
      return null;
    }
  }
}

async function main() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const gemini = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });

  // 1. Scrape hatchesup to get truck order + page links
  console.log(`\nScraping ${TARGET_URL} ...`);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  let scheduleText = '', pageOrderLinks = [];

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const timer = setInterval(() => { window.scrollBy(0, 200); total += 200; if (total >= document.body.scrollHeight * 1.5) { clearInterval(timer); resolve(); } }, 80);
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
          if (h?.innerText.trim() && h.innerText.trim().length < 60) { truckName = h.innerText.trim(); break; }
        }
        el = el.parentElement;
      }
      links.push({ href, truckName });
    });
    return links;
  });
  await page.close();
  console.log(`✓ ${scheduleText.length} chars, ${pageOrderLinks.length} order links`);

  // 2. Gemini: extract schedule to get truck names in order
  const currentYear = new Date().getFullYear();
  const schedulePrompt = `Today is ${new Date().toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}. Current year: ${currentYear}.
Extract EVERY food truck name from this schedule. Return JSON: {"events":[{"truck_name":"exact name as written"}]}
Include each truck only once per day/location. Return ONLY valid JSON.
Schedule:
${scheduleText.slice(0, 150000)}`;

  let truckNames = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await gemini.generateContent(schedulePrompt);
      let raw = result.response.text().trim();
      if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(raw);
      const events = Array.isArray(parsed) ? parsed : (parsed.events || []);
      // Unique truck names, preserving first-seen order
      const seen = new Set();
      for (const e of events) {
        if (e.truck_name && !seen.has(normName(e.truck_name))) {
          seen.add(normName(e.truck_name));
          truckNames.push(e.truck_name);
        }
      }
      break;
    } catch (err) {
      if (attempt < 3) { await sleep(3000); continue; }
      throw new Error(`Schedule extraction failed: ${err.message}`);
    }
  }

  const limited = truckNames.slice(0, LIMIT);
  console.log(`\nFirst ${limited.length} trucks from hatchesup schedule:`);
  limited.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));

  // 3. For each truck: find URL, scrape, extract
  for (const truckName of limited) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🚚 ${truckName}`);

    const orderUrl = await findWorkingUrl(truckName, pageOrderLinks);
    if (!orderUrl) { console.log('   ✗ no order URL found'); continue; }
    console.log(`   URL: ${orderUrl}`);

    let scraped;
    try {
      scraped = await scrapeMenu(browser, orderUrl);
    } catch (err) {
      console.log(`   ✗ scrape error: ${err.message}`);
      continue;
    }
    if (!scraped) { console.log('   ✗ empty page'); continue; }
    console.log(`   ✓ ${scraped.text.length} chars → ${scraped.basketUrl}`);

    const parsed = await extractMenu(gemini, truckName, scraped.text);
    if (!parsed) continue;

    console.log(`   Categories: ${(parsed.categories || []).join(', ')}`);
    console.log(`   Items (${(parsed.items || []).length} total):`);
    for (const item of (parsed.items || []).slice(0, 30)) {
      const price = item.price ? `£${Number(item.price).toFixed(2)}` : 'no price';
      const tags = [...(item.dietary || []), ...(item.allergens || [])].join(', ');
      console.log(`     [${item.category}] ${item.name} — ${price}${tags ? ' (' + tags + ')' : ''}`);
      if (item.description) console.log(`       ${item.description.slice(0, 90)}`);
    }
    if ((parsed.items || []).length > 30) console.log(`     ... and ${parsed.items.length - 30} more`);
  }

  await browser.close();
  console.log('\n\nDone.\n');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
