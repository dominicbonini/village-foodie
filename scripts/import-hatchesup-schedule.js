// scripts/import-hatchesup-schedule.js
// Scrapes hatchesup.co.uk and for each truck:
//   - Extracts schedule events → discovery_events
//   - Downloads logo → truck-media/discovery-logos/ storage → discovery_trucks.logo_url
//   - Finds the order/menu URL (page link → own domain → hatchesup subdomain)
//   - Scrapes and imports the menu into menu_categories + menu_items_db for
//     trucks that already exist as HatchGrab operators in the trucks table
//   - Stores menu_url in discovery_trucks for all trucks
//
// Usage:
//   node scripts/import-hatchesup-schedule.js
//   node scripts/import-hatchesup-schedule.js "https://hatchesup.co.uk/find-food/?when=7days"

import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const argUrl = process.argv.find(a => !a.startsWith('--') && a.startsWith('http'));
const argLimit = process.argv.find(a => a.startsWith('--limit='));
const argOffset = process.argv.find(a => a.startsWith('--offset='));
const argDelay = process.argv.find(a => a.startsWith('--delay='));
const TARGET_URL = argUrl || 'https://hatchesup.co.uk/find-food/?when=7days';
const TRUCK_LIMIT = argLimit ? parseInt(argLimit.split('=')[1], 10) : Infinity;
const TRUCK_OFFSET = argOffset ? parseInt(argOffset.split('=')[1], 10) : 0;
const TRUCK_DELAY_MS = argDelay ? parseInt(argDelay.split('=')[1], 10) * 1000 : 0;
const DEBUG = process.argv.includes('--debug');
const BUCKET = 'truck-media';
const LOGO_PREFIX = 'discovery-logos';

const STANDARD_CATEGORIES = [
  'Starters', 'Mains', 'Burgers', 'Pizza', 'Wraps & Sandwiches',
  'Sides', 'Dips & Sauces', 'Desserts', 'Drinks', 'Kids Menu', 'Specials', 'Other',
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Helpers ───────────────────────────────────────────────────────────────────

const normName = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function isFuzzyMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  let diff = 0;
  if (a.length === b.length) {
    for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) diff++; }
    return diff <= 1;
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  let i = 0, j = 0;
  while (i < long.length && j < short.length) {
    if (long[i] !== short[j]) { if (++diff > 1) return false; i++; }
    else { i++; j++; }
  }
  return true;
}

function nameMatches(a, b) {
  const na = normName(a), nb = normName(b);
  return na === nb || isFuzzyMatch(na, nb) ||
    (na.length > 5 && nb.includes(na)) || (nb.length > 5 && na.includes(nb));
}

function isKnownTruck(truckName, knownNorms) {
  return knownNorms.some(n => nameMatches(truckName, n));
}

function findHgTruck(truckName, hgTrucks) {
  return hgTrucks.find(t => nameMatches(truckName, t.name)) || null;
}

function toISODate(ddmmyyyy) {
  if (!ddmmyyyy) return null;
  const parts = String(ddmmyyyy).split('/');
  if (parts.length !== 3) return null;
  let y = parseInt(parts[2]);
  if (y < 100) y += 2000;
  return `${y}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── URL construction ──────────────────────────────────────────────────────────

// "Pizza Mondo"         → pizzamondo.hatchesup.app  (hatchesup tried first)
// "Steak & Honour"      → steakandhonour.hatchesup.app  (& → "and")
// "Ling Ling's Kitchen" → linglingssteamkitchen.hatchesup.app
// Own-domain fallback   → order.pizza-mondo.co.uk/basket
function constructOrderUrls(truckName) {
  const normalised = truckName.toLowerCase()
    .replace(/&/g, 'and')   // & → "and" before stripping anything else
    .replace(/[''']/g, ''); // remove apostrophes

  const hyphenated = normalised
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const compact = normalised.replace(/[^a-z0-9]/g, '');

  return [
    `https://${compact}.hatchesup.app`,          // hatchesup root first — Continue click opens menu
    `https://order.${hyphenated}.co.uk/basket`,  // own-domain fallback
  ];
}

async function findWorkingUrl(truckName, pageLinks) {
  // 1. Try links extracted directly from the hatchesup page
  const pageLink = pageLinks.find(l => l.truckName && nameMatches(truckName, l.truckName));
  if (pageLink?.href) return pageLink.href;

  // 2. Try constructed URLs — HEAD request with 6s timeout
  const candidates = constructOrderUrls(truckName);
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) return url;
    } catch { /* not reachable */ }
  }
  return null;
}

// ── Logo storage ──────────────────────────────────────────────────────────────

async function uploadLogo(srcUrl, truckName) {
  try {
    const res = await fetch(srcUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png'
              : contentType.includes('webp') ? 'webp'
              : contentType.includes('svg') ? 'svg'
              : 'jpg';

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) return null;

    const path = `${LOGO_PREFIX}/${slugify(truckName)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true });
    if (error) { console.warn(`      logo upload error: ${error.message}`); return null; }

    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  } catch (err) {
    console.warn(`      logo fetch error: ${err.message}`);
    return null;
  }
}

// ── Menu page scraping ────────────────────────────────────────────────────────

// Returns { text, basketUrl } or null
async function scrapeMenuPage(browser, url) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const isHatchesup = url.includes('.hatchesup.app');
    let basketUrl = url;

    if (isHatchesup) {
      // Navigate to the root event-selection page (strip /basket if present)
      const rootUrl = url.replace(/\/basket\/?$/, '').replace(/\/$/, '');
      await page.goto(rootUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(2000);

      if (DEBUG) {
        const debugSlug = rootUrl.replace(/https?:\/\//, '').replace(/[^a-z0-9]/g, '-');
        const debugPath = `/tmp/hatchesup-debug-${debugSlug}.html`;
        writeFileSync(debugPath, await page.content());
        console.log(`      [DEBUG] HTML written → ${debugPath}`);
      }

      // The Continue button is <input type="submit" value="Continue"> inside a POST form.
      // We must click it (not GET the action URL) so the server redirects to the real basket
      // (some trucks like Azahar POST to /basket then redirect to their own domain).
      const submitSelector = 'input[type="submit"][value="Continue"]';
      const hasSubmit = await page.$(submitSelector);

      if (hasSubmit) {
        try {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
            page.click(submitSelector),
          ]);
          basketUrl = page.url();
          if (DEBUG) console.log(`      [DEBUG] navigated to → ${basketUrl}`);
        } catch (navErr) {
          console.warn(`      navigation after click failed: ${navErr.message}`);
          basketUrl = `${rootUrl}/basket`;
          await page.goto(basketUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        }
      } else {
        console.warn('      no Continue button found, falling back to /basket');
        basketUrl = `${rootUrl}/basket`;
        await page.goto(basketUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      }
      await sleep(3000);
    } else {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(3000);
    }

    // Scroll to trigger lazy-loaded menu sections
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let total = 0;
        const distance = 200;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          total += distance;
          if (total >= document.body.scrollHeight * 1.5) { clearInterval(timer); resolve(); }
        }, 80);
        setTimeout(() => { clearInterval(timer); resolve(); }, 12000);
      });
    });
    await sleep(2000);

    const text = await page.evaluate(() => document.body.innerText);
    return text && text.length > 200 ? { text, basketUrl } : null;
  } catch (err) {
    console.warn(`      scrape error: ${err.message}`);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

// ── Menu Gemini extraction ────────────────────────────────────────────────────

async function extractMenuWithGemini(model, menuText, truckName, existingCatNames) {
  const allCategories = [
    ...existingCatNames,
    ...STANDARD_CATEGORIES.filter(c => !existingCatNames.includes(c)),
  ];

  const prompt = `You are a menu digitisation assistant for a food truck called "${truckName}".

Extract all menu items from the content provided.

Available categories (use these exactly, pick the best fit):
${allCategories.map(c => `- ${c}`).join('\n')}

Rules:
- Use existing category names when they match
- Each item needs: name, price (number, no currency symbol), category
- description: dish description ONLY — do NOT include allergen labels, dietary info, or "Contains/May contain" text
- allergens: extract allergen/dietary labels as a separate array (e.g. ["Dairy", "Gluten", "Nuts"])
  Common labels: Dairy, Lactose, Gluten, Nuts, Eggs, Soy, Fish, Shellfish, Celery, Mustard, Vegetarian, Vegan, Halal, Kosher
  Normalise: "Contains Dairy" → "Dairy". "May contain Nuts" → "Nuts"
- dietary: dietary preference labels as a separate array (e.g. ["Vegetarian", "Vegan", "Halal"])
- If price is unclear or missing, use 0
- Group items logically — don't create more than 8 categories
- Return ONLY valid JSON, no markdown

Response format:
{
  "categories": ["Mains", "Sides", "Drinks"],
  "items": [
    {
      "name": "Item name",
      "description": "Description only",
      "price": 6.50,
      "category": "Category",
      "allergens": [],
      "dietary": []
    }
  ]
}

Menu content:
${menuText.slice(0, 80000)}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      let raw = result.response.text().trim();
      if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(raw);
      return {
        categories: parsed.categories || [],
        items: (parsed.items || []).map(item => ({
          ...item,
          price: typeof item.price === 'number' ? item.price : 0,
          price_missing: !item.price || item.price === 0,
          allergens: Array.isArray(item.allergens) ? item.allergens : [],
          dietary: Array.isArray(item.dietary) ? item.dietary : [],
        })),
      };
    } catch (err) {
      if (attempt < 3) { await sleep(2000); continue; }
      console.warn(`      Gemini menu extract failed: ${err.message}`);
      return null;
    }
  }
  return null;
}

// ── Menu DB commit (mirrors commit-menu/route.ts exactly) ─────────────────────

async function commitMenuToDb(truckId, categories, items) {
  // Build category ID map from existing active categories
  const categoryIdMap = {};
  const { data: existingCats } = await supabase
    .from('menu_categories').select('id, name')
    .eq('truck_id', truckId).eq('is_active', true);
  for (const cat of existingCats || []) categoryIdMap[cat.name] = cat.id;

  // Get current max sort order
  const { data: maxSortData } = await supabase
    .from('menu_categories').select('sort_order')
    .eq('truck_id', truckId)
    .order('sort_order', { ascending: false }).limit(1);
  let sortOrder = (maxSortData?.[0]?.sort_order ?? 0) + 1;

  // Create missing categories
  for (const catName of categories) {
    if (categoryIdMap[catName]) continue;
    const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const { data: newCat } = await supabase
      .from('menu_categories')
      .insert({
        truck_id: truckId, name: catName, slug,
        prep_secs: 0, batch_size: 999, allow_notes: false,
        sort_order: sortOrder++, is_active: true,
      })
      .select('id').single();
    if (newCat) categoryIdMap[catName] = newCat.id;
  }

  // Insert items, skipping duplicates
  let inserted = 0, skipped = 0;
  for (const item of items) {
    if (item._skip) { skipped++; continue; }
    const categoryId = categoryIdMap[item.category];
    if (!categoryId) continue;

    const { data: existing } = await supabase
      .from('menu_items_db').select('id')
      .eq('truck_id', truckId).eq('name', item.name).eq('category_id', categoryId)
      .maybeSingle();
    if (existing) { skipped++; continue; }

    const { data: maxItemSort } = await supabase
      .from('menu_items_db').select('sort_order')
      .eq('category_id', categoryId)
      .order('sort_order', { ascending: false }).limit(1);
    const itemSort = (maxItemSort?.[0]?.sort_order ?? 0) + 1;

    await supabase.from('menu_items_db').insert({
      truck_id: truckId, name: item.name,
      description: item.description || null,
      price: item.price, category_id: categoryId,
      is_available: true, sort_order: itemSort,
      allergens: item.allergens || [],
      dietary_info: item.dietary || [],
    });
    inserted++;
  }
  return { inserted, skipped };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🌐 Scraping: ${TARGET_URL}`);

  // ── 1. Load DB state ──────────────────────────────────────────────────────
  const [{ data: hgTrucks }, { data: discTrucks }] = await Promise.all([
    supabase.from('trucks').select('id, name'),
    supabase.from('discovery_trucks').select('id, name, visibility, logo_url, menu_url'),
  ]);

  const publicDiscTrucks = (discTrucks || []).filter(t => t.visibility !== 'hidden');
  const knownNorms = [
    ...(hgTrucks || []).map(t => normName(t.name)),
    ...publicDiscTrucks.map(t => normName(t.name)),
  ];
  const existingLogos = new Map(
    (discTrucks || []).filter(t => t.logo_url).map(t => [normName(t.name), t.logo_url])
  );
  const existingMenuUrls = new Map(
    (discTrucks || []).filter(t => t.menu_url).map(t => [normName(t.name), t.menu_url])
  );

  console.log(`   ℹ️  ${hgTrucks?.length ?? 0} HG trucks + ${publicDiscTrucks.length} public discovery trucks`);

  // ── 2. Puppeteer: scrape main hatchesup page ──────────────────────────────
  let browser;
  let scheduleText = '';
  let logoImgs = [];
  let pageOrderLinks = [];

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);

    // Full scroll to trigger lazy images and content
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let total = 0;
        const timer = setInterval(() => {
          window.scrollBy(0, 200);
          total += 200;
          if (total >= document.body.scrollHeight * 1.5) { clearInterval(timer); resolve(); }
        }, 80);
        setTimeout(() => { clearInterval(timer); resolve(); }, 15000);
      });
    });
    await sleep(3000);

    scheduleText = await page.evaluate(() => document.body.innerText);
    console.log(`   📄 ${scheduleText.length} chars of schedule text`);

    // Extract img elements for logo matching
    logoImgs = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('img').forEach(img => {
        const src = img.src || img.currentSrc || '';
        if (!src || src.startsWith('data:') || src.length < 10) return;
        const alt = (img.alt || img.title || '').trim();
        let nearestHeading = '';
        let el = img.parentElement;
        for (let d = 0; d < 8 && el; d++) {
          const h = el.querySelector('h1,h2,h3,h4,h5,h6');
          if (h?.innerText.trim()) { nearestHeading = h.innerText.trim(); break; }
          const aria = el.getAttribute('aria-label') || '';
          if (aria.trim()) { nearestHeading = aria.trim(); break; }
          el = el.parentElement;
        }
        results.push({ src, alt, nearestHeading });
      });
      return results;
    });
    console.log(`   🖼️  ${logoImgs.length} img candidates`);

    // Extract ordering links visible on the page alongside their truck context
    pageOrderLinks = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.href || '';
        // Only capture basket/ordering links
        if (!href.includes('/basket') && !href.includes('.hatchesup.app') && !href.match(/\/\/order\./)) return;
        // Walk up to find nearest truck heading
        let truckName = '';
        let el = a.parentElement;
        for (let d = 0; d < 8 && el && !truckName; d++) {
          for (const tag of ['h2','h3','h4','h5','h6']) {
            const h = el.querySelector(tag);
            if (h?.innerText.trim() && h.innerText.trim().length < 60) {
              truckName = h.innerText.trim();
              break;
            }
          }
          el = el.parentElement;
        }
        links.push({ href, truckName });
      });
      return links;
    });
    console.log(`   🔗 ${pageOrderLinks.length} ordering links found on page`);

  } catch (err) {
    if (browser) { await browser.close().catch(() => {}); browser = null; }
    throw new Error(`Main page scrape failed: ${err.message}`);
  }

  if (!scheduleText || scheduleText.length < 100) {
    if (browser) await browser.close().catch(() => {});
    console.error('❌ Page returned empty content');
    process.exit(1);
  }

  // ── 3. Gemini: extract schedule events ───────────────────────────────────
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const geminiModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });

  const currentYear = new Date().getFullYear();
  const todayStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const schedulePrompt = `Today is ${todayStr}. Current year: ${currentYear}.

Extract EVERY food truck event from the schedule below. One row per truck/location/day.

Output JSON:
{
  "events": [
    {
      "truck_name": "Exact truck name as written",
      "event_date": "DD/MM/${currentYear}",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "venue_name": "Venue or location name only — no town or postcode",
      "town": "Town or village name",
      "postcode": "UK postcode if present, else empty string"
    }
  ]
}

Rules:
- event_date: DD/MM/${currentYear}. Map day headers like "Friday 5 June" to exact dates.
- start_time / end_time: 24-hour HH:MM.
- venue_name: business name only — never include town or postcode.
- Create a separate row for EACH location listed under a truck on a given day.
- Skip venues named "Private Event".
- Include ALL trucks regardless of online order status.
- Return ONLY valid JSON, no markdown.

Schedule:
${scheduleText.slice(0, 150000)}`;

  console.log('\n🤖 Extracting schedule events...');
  let events = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await geminiModel.generateContent(schedulePrompt);
      let raw = result.response.text().trim();
      if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(raw);
      events = Array.isArray(parsed) ? parsed : (parsed.events || []);
      console.log(`   ✅ ${events.length} events extracted`);
      break;
    } catch (err) {
      console.warn(`   ⚠️  Attempt ${attempt}: ${err.message}`);
      if (attempt < 3) await sleep(3000);
    }
  }

  if (events.length === 0) {
    if (browser) await browser.close().catch(() => {});
    console.error('❌ No events extracted');
    process.exit(1);
  }

  // ── 4. Find order URLs + scrape menus ─────────────────────────────────────
  let truckNames = [...new Set(events.map(e => e.truck_name).filter(Boolean))];
  if (TRUCK_OFFSET > 0 || TRUCK_LIMIT < Infinity) {
    truckNames = truckNames.slice(TRUCK_OFFSET, TRUCK_OFFSET + TRUCK_LIMIT);
    console.log(`\n⚠️  Processing trucks ${TRUCK_OFFSET + 1}–${TRUCK_OFFSET + truckNames.length} (--offset=${TRUCK_OFFSET} --limit=${TRUCK_LIMIT})`);
  }
  const truckMenuData = new Map(); // truckName → { url, menuText }

  console.log(`\n🔗 Finding order URLs and scraping menus for ${truckNames.length} trucks...`);

  for (const truckName of truckNames) {
    const norm = normName(truckName);

    // Skip if we already have a stored menu_url and the truck already has menu items in HG
    const hgTruck = findHgTruck(truckName, hgTrucks || []);
    let existingMenuCount = 0;
    if (hgTruck) {
      const { count } = await supabase
        .from('menu_categories').select('id', { count: 'exact', head: true })
        .eq('truck_id', hgTruck.id).eq('is_active', true);
      existingMenuCount = count || 0;
    }

    // Find or construct order URL
    const cachedUrl = existingMenuUrls.get(norm);
    let orderUrl = cachedUrl || await findWorkingUrl(truckName, pageOrderLinks);

    if (!orderUrl) {
      console.log(`   ⏭️  ${truckName} — no order URL found`);
      continue;
    }

    if (hgTruck && existingMenuCount > 0) {
      console.log(`   ℹ️  ${truckName} — already has ${existingMenuCount} menu categories, storing URL only`);
      truckMenuData.set(truckName, { url: orderUrl, menuText: null });
      continue;
    }

    // Scrape the menu page
    process.stdout.write(`   🍕 ${truckName} — scraping ${orderUrl} ... `);
    try {
      const scraped = await scrapeMenuPage(browser, orderUrl);
      if (scraped) {
        console.log(`✓ (${scraped.text.length} chars) → ${scraped.basketUrl}`);
        truckMenuData.set(truckName, { url: scraped.basketUrl, menuText: scraped.text });
      } else {
        console.log('✗ (empty)');
        truckMenuData.set(truckName, { url: orderUrl, menuText: null });
      }
    } catch (err) {
      console.log(`✗ (${err.message})`);
      truckMenuData.set(truckName, { url: orderUrl, menuText: null });
    }

    if (TRUCK_DELAY_MS > 0 && truckName !== truckNames[truckNames.length - 1]) {
      const mins = TRUCK_DELAY_MS / 60000;
      console.log(`   ⏳ Waiting ${mins} min before next truck... (${new Date().toLocaleTimeString('en-GB')})`);
      await sleep(TRUCK_DELAY_MS);
    }
  }

  // Done with browser
  if (browser) { await browser.close().catch(() => {}); browser = null; }

  // ── 5. Match logos to truck names ─────────────────────────────────────────
  const logoSrcMap = new Map();
  for (const truckName of truckNames) {
    const norm = normName(truckName);
    const match = logoImgs.find(img => {
      const altNorm = normName(img.alt), headNorm = normName(img.nearestHeading);
      return altNorm === norm || isFuzzyMatch(altNorm, norm) || (norm.length > 4 && altNorm.includes(norm)) ||
             headNorm === norm || isFuzzyMatch(headNorm, norm) || (norm.length > 4 && headNorm.includes(norm));
    });
    if (match) logoSrcMap.set(truckName, match.src);
  }
  console.log(`\n   🖼️  Logos matched for ${logoSrcMap.size}/${truckNames.length} trucks`);

  // ── 6. Process trucks: logo + menu import + discovery upsert ─────────────
  console.log('\n🚚 Processing trucks...');
  let menuImported = 0, logoUploaded = 0;

  for (const truckName of truckNames) {
    const norm = normName(truckName);
    const known = isKnownTruck(truckName, knownNorms);
    const visibility = known ? 'public' : 'hidden';
    const hgTruck = findHgTruck(truckName, hgTrucks || []);
    const menuInfo = truckMenuData.get(truckName);

    // Logo
    let logoUrl = existingLogos.get(norm) || null;
    const logoSrc = logoSrcMap.get(truckName);
    if (logoSrc && !logoUrl) {
      process.stdout.write(`   🖼️  ${truckName} — uploading logo... `);
      logoUrl = await uploadLogo(logoSrc, truckName);
      console.log(logoUrl ? '✓' : '✗');
      if (logoUrl) logoUploaded++;
    }

    // Menu import (HatchGrab trucks with scraped text only)
    if (hgTruck && menuInfo?.menuText) {
      console.log(`   🍕 ${truckName} — importing menu...`);
      const { data: existingCats } = await supabase
        .from('menu_categories').select('name')
        .eq('truck_id', hgTruck.id).eq('is_active', true);
      const existingCatNames = (existingCats || []).map(c => c.name);

      const menuResult = await extractMenuWithGemini(geminiModel, menuInfo.menuText, truckName, existingCatNames);
      if (menuResult && menuResult.items.length > 0) {
        const { inserted, skipped } = await commitMenuToDb(hgTruck.id, menuResult.categories, menuResult.items);
        console.log(`      ✅ ${inserted} items inserted, ${skipped} skipped`);
        menuImported++;
      } else {
        console.log('      ⚠️  No items extracted from menu text');
      }
    }

    // Upsert discovery_trucks
    const truckRow = { name: truckName, visibility };
    if (logoUrl) truckRow.logo_url = logoUrl;
    if (menuInfo?.url) { truckRow.menu_url = menuInfo.url; truckRow.order_url = menuInfo.url; }

    const { error } = await supabase
      .from('discovery_trucks')
      .upsert(truckRow, { onConflict: 'name', ignoreDuplicates: false });
    if (error) console.warn(`   ⚠️  DB write failed for ${truckName}: ${error.message}`);
  }

  // ── 7. Write discovery_events ─────────────────────────────────────────────
  const { data: freshDiscTrucks } = await supabase.from('discovery_trucks').select('id, name');
  function resolveDiscTruckId(truckName) {
    return freshDiscTrucks?.find(t => nameMatches(t.name, truckName))?.id ?? null;
  }

  const rows = [];
  for (const ev of events) {
    if (!ev.truck_name || !ev.event_date) continue;
    const isoDate = toISODate(ev.event_date);
    if (!isoDate) { console.warn(`   ⚠️  Unparseable date "${ev.event_date}" for ${ev.truck_name}`); continue; }
    rows.push({
      event_date: isoDate,
      start_time: ev.start_time || null,
      end_time: ev.end_time || null,
      truck_name: ev.truck_name,
      venue_name: ev.venue_name || 'Unknown',
      village: ev.town || null,
      event_notes: null,
      source: 'hatchesup_scraper',
      ai_notes: null,
      visibility: isKnownTruck(ev.truck_name, knownNorms) ? 'public' : 'hidden',
      discovery_truck_id: resolveDiscTruckId(ev.truck_name),
    });
  }

  console.log(`\n💾 Writing ${rows.length} events...`);
  let written = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase
      .from('discovery_events')
      .upsert(batch, { onConflict: 'event_date,truck_name,venue_name', ignoreDuplicates: false });
    if (error) console.warn(`[DB] Batch ${Math.floor(i / 100) + 1} failed: ${error.message}`);
    else written += batch.length;
  }

  const publicCount = rows.filter(r => r.visibility === 'public').length;
  const hiddenCount = rows.filter(r => r.visibility === 'hidden').length;
  const newTrucks = truckNames.filter(n => !isKnownTruck(n, knownNorms)).length;

  console.log('\n✅ Import complete');
  console.log(`   🌍 ${publicCount} public events / 🚫 ${hiddenCount} hidden events`);
  console.log(`   🚚 ${newTrucks} trucks added as hidden`);
  console.log(`   🖼️  ${logoUploaded} logos uploaded to storage`);
  console.log(`   🍕 ${menuImported} truck menus imported to menu_categories/menu_items_db`);
  console.log(`   🔗 ${truckMenuData.size} order URLs stored in discovery_trucks`);
}

main().catch(err => { console.error('\n❌ Fatal:', err.message); process.exit(1); });
