import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

// CI installs Chrome via the workflow and sets PUPPETEER_EXECUTABLE_PATH; puppeteer's own
// downloader is broken on the runner. Locally the var is unset → undefined → puppeteer uses its
// normal bundled-Chrome behaviour, so dev machines are unaffected.
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function toISODate(ddmmyyyy) {
  if (!ddmmyyyy) return null;
  const parts = String(ddmmyyyy).split('/');
  if (parts.length !== 3) return null;
  let y = parseInt(parts[2]);
  if (y < 100) y += 2000;
  return `${y}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TABS = { EVENTS: 'Events', TRUCKS: 'Trucks', VENUES: 'Venues', EXCLUSIONS: 'Exclusions' };

// --- STRATEGY DICTIONARY ---
const STRATEGIES = {
  'scroll_lazy':   performModernScroll,  
  'click_next':    performButtonHunt,    
  'frames':        performFrameDump,     
  'manual':        performManualMode,
  'manual_single': performManualMode,
  'scrape_rules':  performExpandAndScrape, 
  'default':       performModernScroll   
};

// HELPER: Sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 🧼 THE "WASHING MACHINE" (Aggressive Normalization) ---
function normalizeName(name) {
    if (!name) return "";
    return name.toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9\s]/g, '') // Remove punctuation, keep spaces temporarily
        .replace(/\b(the|street|st|food|ltd|co|company|and)\b/g, '') // Strip filler words
        .split(/\s+/) // Split by spaces
        .map(word => word.replace(/s$/, '')) // Chop off trailing 's'
        .join(''); // Smash into a single string (e.g. "guacosmexican")
}

// --- 🧠 THE TYPO FORGIVER (1-Edit Levenshtein Distance) ---
function isFuzzyMatch(str1, str2) {
    if (!str1 || !str2) return false;
    if (str1 === str2) return true;
    if (Math.abs(str1.length - str2.length) > 1) return false;
    
    let diff = 0;
    if (str1.length === str2.length) {
        for (let i = 0; i < str1.length; i++) {
            if (str1[i] !== str2[i]) diff++;
        }
        return diff <= 1;
    }
    
    let longStr = str1.length > str2.length ? str1 : str2;
    let shortStr = str1.length > str2.length ? str2 : str1;
    let i = 0, j = 0;
    while (i < longStr.length && j < shortStr.length) {
        if (longStr[i] !== shortStr[j]) {
            diff++;
            if (diff > 1) return false;
            i++; 
        } else {
            i++; j++;
        }
    }
    return true;
}

// HELPER: Title Case
function toTitleCase(str) {
    if (!str) return "";
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

// --- FIXED TIME PARSER ---
function parseTime(timeStr) {
    if (!timeStr) return null;
    timeStr = timeStr.toLowerCase().replace(/\s/g, '');

    if (timeStr.includes('7ish')) return '19:00';

    if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
        const [h, m] = timeStr.split(':');
        return `${h.padStart(2, '0')}:${m}`;
    }

    const match = timeStr.match(/^(\d{1,2})([:.](\d{2}))?([ap]m)?$/);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = match[3] || "00";
    const meridian = match[4]; 

    if (meridian === 'pm' && hours < 12) hours += 12;
    if (meridian === 'am' && hours === 12) hours = 0;
    
    if (!meridian) {
        if (hours >= 1 && hours <= 7) hours += 12; 
    }

    return `${String(hours).padStart(2, '0')}:${minutes}`;
}

// HELPER: Date Parser for Historical Event Check
function parseEventDateStr(dateStr) {
    if (!dateStr) return new Date(0);
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        let y = parseInt(parts[2], 10);
        if (y < 100) y += 2000;
        // Month is 0-indexed in JS Dates
        return new Date(y, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
    return new Date(0);
}

// --- DETERMINISTIC DATE CALCULATOR ---
function generateDatesFromRule(ruleJSON) {
    const dates = [];
    const today = new Date();

    if (!ruleJSON || !ruleJSON.day) return [];
    
    const targetDayName = String(ruleJSON.day).toLowerCase();
    let targetDay;
    if (targetDayName.includes('sunday')) targetDay = 0;
    else if (targetDayName.includes('monday')) targetDay = 1;
    else if (targetDayName.includes('tuesday')) targetDay = 2;
    else if (targetDayName.includes('wednesday')) targetDay = 3;
    else if (targetDayName.includes('thursday')) targetDay = 4;
    else if (targetDayName.includes('friday')) targetDay = 5;
    else if (targetDayName.includes('saturday')) targetDay = 6;

    if (targetDay === undefined) return [];
    
    let posRaw = (ruleJSON.pos || "").toLowerCase().replace(/\D/g, ''); 
    const posNum = parseInt(posRaw, 10);
    let isSingleEvent = false;
    
    const freq = (ruleJSON.freq || "").toLowerCase();
    
    if (freq !== 'monthly' && posNum > 0) {
        if (posNum > 5) {
            isSingleEvent = true; 
        } else {
            const testDate = new Date();
            testDate.setDate(posNum); 
            if (testDate.getDay() === targetDay) {
                isSingleEvent = true; 
            }
        }
    }

    let startLimit = new Date();
    startLimit.setHours(0,0,0,0);
    if (ruleJSON.startDate && ruleJSON.startDate !== "null") {
        const parsedStart = new Date(ruleJSON.startDate);
        if (!isNaN(parsedStart.getTime())) {
            startLimit = parsedStart;
            startLimit.setHours(0,0,0,0);
        }
    }

    let endLimit = new Date();
    endLimit.setDate(endLimit.getDate() + 365); 
    endLimit.setHours(23,59,59,999);
    if (ruleJSON.endDate && ruleJSON.endDate !== "null") {
        const parsedEnd = new Date(ruleJSON.endDate);
        if (!isNaN(parsedEnd.getTime())) {
            endLimit = parsedEnd;
            endLimit.setHours(23,59,59,999);
        }
    }

    for (let i = 0; i < 60; i++) {
        const d = new Date();
        d.setDate(today.getDate() + i);
        d.setHours(12,0,0,0); 
        
        if (d < startLimit || d > endLimit) continue;

        if (d.getDay() === targetDay) {
            let isMatch = false;

            if (freq === 'weekly' || freq === '') {
                if (isSingleEvent) {
                     if (d.getDate() === posNum) isMatch = true;
                } else {
                     isMatch = true; 
                }
            } 
            else if (freq === 'monthly') {
                const dayOfMonth = d.getDate();
                const weekNum = Math.ceil(dayOfMonth / 7);
                const nextWeek = new Date(d);
                nextWeek.setDate(d.getDate() + 7);
                const isLast = nextWeek.getMonth() !== d.getMonth();

                if ((ruleJSON.pos || '').includes('last') && isLast) isMatch = true;
                else if ((ruleJSON.pos || '').includes('1st') || posNum === 1) { if (weekNum === 1) isMatch = true; }
                else if ((ruleJSON.pos || '').includes('2nd') || posNum === 2) { if (weekNum === 2) isMatch = true; }
                else if ((ruleJSON.pos || '').includes('3rd') || posNum === 3) { if (weekNum === 3) isMatch = true; }
                else if ((ruleJSON.pos || '').includes('4th') || posNum === 4) { if (weekNum === 4) isMatch = true; }
            }

            if (isMatch) {
                dates.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }));
                if (isSingleEvent) return dates;
            }
        }
    }
    return dates;
}

// --- AI RETRY LOGIC ---
async function generateContentWithRetry(model, prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await model.generateContent(prompt);
      let rawText = await result.response.text();
      
      console.log(`\n   🐛 [DEBUG] AI responded with ${rawText.length} characters.`);
      console.log(`   🐛 [DEBUG] Snippet: ${rawText.substring(0, 250).replace(/\n/g, ' ')}...\n`);

      if (rawText.startsWith('```json')) {
          rawText = rawText.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (rawText.startsWith('```')) {
          rawText = rawText.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      return JSON.parse(rawText);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`   ⚠️  AI Formatting Error. Retrying in 5s... (Attempt ${i + 1})`);
      await sleep(5000);
    }
  }
}

// --- STRATEGY FUNCTIONS ---
async function performManualMode(page) {
    console.log("   ⏭️  Strategy: Manual Mode (Skipping Network)...");
    return ""; 
}

async function performModernScroll(page) {
  console.log("   📜 Strategy: Scroll Lazy (Deep)...");
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 150;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight * 1.5) { clearInterval(timer); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(timer); resolve(); }, 15000);
    });
  });
  await sleep(3000); 
  return await page.evaluate(() => document.body.innerText);
}

async function performExpandAndScrape(page) {
  console.log("   🔽 Strategy: Expand & Scrape (Day-by-Day Sequence)...");
  await page.evaluate(async () => { window.scrollBy(0, 800); });
  await sleep(1500);

  let accumulatedText = "";
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  for (const day of days) {
      const clicked = await page.evaluate((targetDay) => {
          const elements = Array.from(document.querySelectorAll('h2, h3, h4, h5, .elementor-tab-title, .accordion-title, div, span'));
          for (let i = elements.length - 1; i >= 0; i--) {
              const el = elements[i];
              const txt = (el.innerText || "").toLowerCase().trim();
              if (txt.includes(targetDay) && txt.length < 30 && el.offsetHeight > 0) {
                  try { el.click(); return true; } catch(e) {}
              }
          }
          return false;
      }, day);

      if (clicked) {
          console.log(`   👆 Clicked: ${day.toUpperCase()}...`);
          await sleep(1500); 
          const pageText = await page.evaluate(() => document.body.innerText);
          accumulatedText += `\n\n--- STATE AFTER CLICKING ${day.toUpperCase()} ---\n` + pageText;
      }
  }

  if (accumulatedText.length < 500) {
      accumulatedText = await page.evaluate(() => document.body.innerText);
  }

  const frames = page.frames();
  if (frames.length > 0) {
      for (const frame of frames) {
          try {
              const frameContent = await frame.evaluate(() => document.body.innerText);
              if (frameContent.length > 50) accumulatedText += `\n --- FRAME DATA --- \n${frameContent}\n`;
          } catch (e) {}
      }
  }
  return accumulatedText;
}

async function performButtonHunt(page) {
  console.log("   👆 Strategy: Click Next...");
  let combinedText = await page.evaluate(() => document.body.innerText);
  for (let i = 0; i < 4; i++) {
    const clicked = await page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll('*'));
        let candidates = allElements.filter(el => {
            if (!el.offsetParent) return false;
            const text = (el.innerText || '').trim().toLowerCase();
            if (text.length > 50) return false;
            const isClickable = ['BUTTON', 'A'].includes(el.tagName) || el.onclick !== null || el.getAttribute('role') === 'button';
            const isTrigger = text === 'more events' || text === 'load more' || text === 'older entries' || text === 'next' || text === '>' || text === '»';
            const isBack = text.includes('prev') || text.includes('back') || text.includes('newer');
            return isClickable && isTrigger && !isBack;
        });
        if (candidates.length > 0) { candidates[candidates.length - 1].click(); return true; }
        return false;
    });
    if (clicked) {
        await sleep(5000);
        const newText = await page.evaluate(() => document.body.innerText);
        combinedText += `\n\n--- PAGE ${i + 2} START ---\n` + newText;
    } else { break; }
  }
  return combinedText;
}

async function performFrameDump(page) {
  let combinedText = "";
  try { combinedText += await page.content(); } catch(e) {}
  const frames = page.frames();
  if (frames.length > 0) {
      for (const frame of frames) {
          try {
              const frameContent = await frame.evaluate(() => document.body.innerText);
              if (frameContent.length > 50) combinedText += `\n --- FRAME DATA --- \n${frameContent}\n`;
          } catch (e) {}
      }
  }
  return combinedText;
}

function standardizeDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;
  return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
}

async function getTabData(sheets, rangeName) {
  try {
    const resExtended = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${rangeName}!A2:T` });
    return resExtended.data.values || [];
  } catch (error) { return []; }
}

async function main() {
const TARGET_NAME = process.argv[2] ? process.argv[2].toLowerCase().trim() : null;

if (TARGET_NAME) {
    console.log(`\n🎯 TARGET MODE ACTIVE: Only scraping "${process.argv[2]}"`);
} else {
    console.log("\n🚀 Starting Smart Scrape (Full Database Sync)...");
}

if (!process.env.GOOGLE_SHEETS_CREDENTIALS || !process.env.GEMINI_API_KEY) {
  throw new Error("Missing Credentials in .env.local");
}

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

console.log("📥 Reading Master Data...");

const [truckData, venueData, eventData, exclusionData] = await Promise.all([
  getTabData(sheets, TABS.TRUCKS),
  getTabData(sheets, TABS.VENUES),
  getTabData(sheets, TABS.EVENTS),
  getTabData(sheets, TABS.EXCLUSIONS)
]);

// Build Exclusions Set with Normalization
const excludedTerms = new Set(exclusionData.map(r => r[0] ? normalizeName(r[0]) : '').filter(Boolean));

const validTrucks = truckData.filter(r => r[0]).map(r => {
    return {
        name: r[0].toString().trim(),
        aliases: r[17] ? r[17].toString().split(',').map(a => a.trim()).filter(Boolean) : []
    };
});

const validVenues = venueData.map(r => r[0]).filter(Boolean);

// DEDUPLICATION ARRAY
const existingEvents = [];
eventData.forEach(row => {
    const date = standardizeDate(row[0]); 
    const truck = normalizeName(row[3] || ""); 
    const venue = normalizeName(row[4] || "");
    
    if (date && truck && venue) {
        existingEvents.push({ date, truck, venue });
    }
});

console.log(`   ℹ️  Loaded ${existingEvents.length} existing unique events.`);

const sitesToScrape = [];

truckData.forEach(row => {
  if (TARGET_NAME && (!row[0] || row[0].toLowerCase().trim() !== TARGET_NAME)) return; 

  const targetUrl = row[8] || row[6] || 'about:blank';
  const aiInstructions = row[14] || ""; 
  const runStrategy = (row[15] || 'scroll_lazy').toLowerCase().trim(); 
  
  const hasUrl = targetUrl !== 'about:blank';
  const hasInstructions = aiInstructions.length > 10;
  
  if (hasUrl || hasInstructions) {
    const strategies = runStrategy.split(',').map(s => s.trim());
    strategies.forEach(strat => {
        sitesToScrape.push({ 
            name: row[0], url: targetUrl, instructions: aiInstructions,
            strategy: strat, sourceType: 'truck' 
        });
    });
  }
});

venueData.forEach(row => {
  if (TARGET_NAME && (!row[0] || row[0].toLowerCase().trim() !== TARGET_NAME)) return;

  if (row[9] && row[9].startsWith('http')) {
    const runStrategy = (row[11] || 'scroll_lazy').toLowerCase().trim();
    const strategies = runStrategy.split(',').map(s => s.trim());
    strategies.forEach(strat => {
        sitesToScrape.push({ 
            name: row[0], url: row[9], instructions: row[10] || "",
            strategy: strat, sourceType: 'venue'
        });
    });
  }
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const modelLite = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-lite", 
    generationConfig: { responseMimeType: "application/json", temperature: 0 } 
});

const modelHeavy = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash", 
    generationConfig: { responseMimeType: "application/json", temperature: 0 } 
});

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--allow-running-insecure-content', '--disable-web-security'],
});

const newRowsToAdd = [];
const newVenuesDetected = new Map();
const newTrucksDetected = new Map(); 

// --- DATE LIMITER ---
const todayZeroed = new Date();
todayZeroed.setHours(0, 0, 0, 0);

for (const [index, site] of sitesToScrape.entries()) {
  let page;
  
  try {
    console.log(`\n🔍 [${index + 1}/${sitesToScrape.length}] Scraping: ${site.name} (${site.sourceType} | ${site.strategy})...`);
    
    let cleanText = "";
    let isRuleExtraction = false; 
    
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const strategyFunc = STRATEGIES[site.strategy] || STRATEGIES['default'];

    if (site.strategy !== 'manual' && site.strategy !== 'manual_single') {
      try {
          const navPromise = page.goto(site.url, { timeout: 30000, waitUntil: 'networkidle2' });
          if (site.url.startsWith('http:')) await Promise.race([navPromise, sleep(15000)]);
          else await navPromise;
          await sleep(5000);
      } catch (e) { console.log("   ⚠️ Navigation warning."); }
      cleanText = await strategyFunc(page);
      
      if (cleanText.length > 0) {
          fs.writeFileSync('DEBUG_SCRAPED_TEXT.txt', cleanText);
      }
    } else {
      cleanText = ""; 
    }

    if (site.strategy === 'manual' && site.instructions.length > 10) {
      console.log("   ✨ Manual Mode: Parsing Rules for Calculation...");
      isRuleExtraction = true;
      cleanText = `SYSTEM OVERRIDE: Extract Recurrence Rules. TRUCK NAME: "${site.name}". RULES: ${site.instructions}`;
    } else if (site.strategy === 'manual_single' && site.instructions.length > 10) {
      console.log("   📅 Manual Single Mode: Parsing one-off exact dates...");
      isRuleExtraction = false; 
      cleanText = `SYSTEM OVERRIDE: Extract ONE-OFF events from this text. Do NOT treat these as recurring rules. TRUCK NAME: "${site.name}". TEXT: ${site.instructions}`;
    } else if (site.strategy === 'scrape_rules') {
      console.log("   🕸️ Scrape Rules Mode: Extracting recurring schedule from website text...");
      isRuleExtraction = true;
    } else {
      if (site.instructions && (site.instructions.toLowerCase().includes('weekly') || site.instructions.toLowerCase().includes('recurring'))) {
          console.log("   🔄 Auto-Detected Weekly Route via AI Instructions...");
          isRuleExtraction = true;
      }
    }

    if (site.strategy !== 'manual' && site.strategy !== 'manual_single' && cleanText.length < 50) {
      console.log(`   ❌ Empty page content (${cleanText.length} chars). Skipping.`);
      continue; 
    }

    let prompt = "";
    
    // --- UPDATED AI PROMPTS: Requesting exclusionsToAdd for the Web Scraper ---
    if (isRuleExtraction) {
        prompt = `
          You are a Data Extraction Bot. 
          TRUCK NAME: "${site.name}"
          CURRENT YEAR: ${new Date().getFullYear()}
          
          TASK 1: Extract any manual rules provided in the user's hint below.
          CRITICAL HINT FROM USER: ${site.instructions || "None provided."}
          
          TASK 2: Extract EVERY recurring schedule stop found in the WEBSITE TEXT below (e.g., Monday Route, Tuesday Route). Treat "Route" as freq: "weekly".
          
          TASK 3: Look for explicit mentions that something is NOT a food truck (e.g., 'Live Music', 'Quiz Night'). Extract those into 'exclusionsToAdd'.

          RULES TO FOLLOW:
          1. Extract EACH venue as a separate JSON object. Do not combine stops.
          2. "rawTimeStart" and "rawTimeEnd" MUST be the exact times from the text (e.g., "4.00", "6.00pm").
          3. "freq" and "day" MUST BE LOWERCASE ONLY.
          4. DATE BOUNDARIES: If rules say "from [Date]" or "until [Date]", extract "startDate" and/or "endDate" in "YYYY-MM-DD" format.
          5. IGNORE PRIVATE EVENTS: Do not extract any event labeled as "private", "private party", or "private lunch".
          6. VILLAGE (MANDATORY): Always extract the town, village, or city into a separate "village" field.

          JSON FORMAT ONLY:
          {
            "events": [
              { "venue": "Wickhambrook MSC", "village": "Wickhambrook", "proof": "Saturday", "rawTimeStart": "11:45", "rawTimeEnd": "13:45", "freq": "weekly", "day": "saturday", "pos": "", "startDate": null, "endDate": null }
            ],
            "exclusionsToAdd": ["Name of non-truck"]
          }
          
          WEBSITE TEXT TO PARSE:
          ${cleanText.slice(0, 100000)}
        `;
      } else {
        prompt = `
          You are extracting food truck events for: "${site.name}".
          Current Date: ${new Date().toDateString()}.
          Current Year: ${new Date().getFullYear()}.
          
          ${site.instructions ? `\n🚨 CRITICAL USER HINT FOR THIS WEBSITE: "${site.instructions}"` : ""}
          
          TASK 1: Extract EVERY food truck event from the provided text for the schedule shown.
          TASK 2: Look for explicit mentions that something is NOT a food truck (e.g., 'Live Music', 'Quiz Night'). Extract those into 'exclusionsToAdd'.

          CRITICAL RULES:
          1. **EXPLICIT DATES OVERRIDE EVERYTHING:** If a specific date is written (e.g., "6th April"), you MUST extract that exact date. Do NOT shift explicit past dates into the future.
          2. **PRESERVE THE WHOLE WEEK:** Extract ALL days of that schedule, including days that have already happened. 
          3. **RELATIVE DAYS:** ONLY calculate the "next immediate date" for a day of the week if NO specific date number is provided.
          4. **DateStart Format:** "DD/MM/YYYY". 
          5. **VENUE NAME:** Extract ONLY the Business Name (e.g., 'The Plough'). DO NOT append the village.
          6. **VILLAGE (MANDATORY):** You must extract the town, village, or city name.
          7. **NOTES:** Postcodes, addresses, or extra event details go into the "Notes" field.
          8. **DOUBLE DAYS:** If a single day lists multiple locations, create a completely separate JSON object for location.
          9. **MISSING TIMES:** If no time is explicitly stated for a venue, output "" (an empty string) for TimeStart and TimeEnd.
          10. **PRIVATE EVENTS:** If an event is explicitly marked as "private", "private party", completely ignore it. Do NOT extract it.
          11. **FACEBOOK 'TONIGHT' RULE (STRICT):** NEVER extract an event based solely on relative words like "tonight", "today", "tomorrow". Ignore these words entirely.
          12. **PROXIMITY REQUIREMENT:** You must ONLY extract an event if an explicit Day or Date is explicitly stated in the exact same sentence or list block as the venue name.
          
          JSON FORMAT ONLY:
          {
            "events": [{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "Town Name", "Notes": "..." }],
            "exclusionsToAdd": ["Name of non-truck"]
          }
          
          WEBSITE TEXT:
          ${cleanText.slice(0, 150000)} 
        `;
    }

    try {
      let activeModel = modelLite;
      if (site.name.toLowerCase().includes('howe')) {
          activeModel = modelHeavy;
          console.log("   🧠 Upgrading to Heavyweight AI for complex parsing...");
      } else {
          console.log("   🤖 Sending to AI (Lite)...");
      }
      
      const result = await generateContentWithRetry(activeModel, prompt);
      
      let finalEvents = [];
      let exclusionsToAdd = [];

      if (result) {
        if (Array.isArray(result)) {
            finalEvents = result;
        } else {
            finalEvents = result.events || [];
            exclusionsToAdd = result.exclusionsToAdd || [];
        }
      }
      
      // --- APPEND AUTO-EXCLUSIONS ---
      if (exclusionsToAdd.length > 0) {
        exclusionsToAdd.forEach(async (ex) => {
            if (ex && typeof ex === 'string') {
                const cleanEx = normalizeName(ex);
                if (!Array.from(excludedTerms).some(existing => isFuzzyMatch(existing, cleanEx))) {
                    try {
                        await sheets.spreadsheets.values.append({
                            spreadsheetId: SPREADSHEET_ID,
                            range: `${TABS.EXCLUSIONS}!A:A`,
                            valueInputOption: 'USER_ENTERED',
                            resource: { values: [[ex]] },
                        });
                        excludedTerms.add(cleanEx);
                        console.log(`   🤖 Auto-Excluded via Scraper: ${ex}`);
                        // DB mirror — parallel run
                        supabase.from('excluded_terms').upsert({
                          term: ex,
                        }, { onConflict: 'term', ignoreDuplicates: true }).then(({ error }) => {
                          if (error) console.warn('[DB] Exclusion write failed:', error.message);
                        });
                    } catch (err) { console.error("Failed to append exclusion:", err.message); }
                }
            }
        });
      }

      // --- FORMAT RULE EXTRACTS ---
      if (isRuleExtraction && finalEvents.length > 0 && !finalEvents[0].DateStart) {
           let expandedEvents = [];
           for (const rule of finalEvents) {
               if (!rule.freq && rule.day) rule.freq = "weekly";
               if (rule.freq) {
                   const dates = generateDatesFromRule(rule);
                   const tStart = parseTime(rule.rawTimeStart) || "Contact Venue";
                   let tEnd = parseTime(rule.rawTimeEnd) || "Contact Venue";
                   if (tStart === "Contact Venue") tEnd = "";

                   for (const date of dates) {
                       expandedEvents.push({
                           "DateStart": date, "TimeStart": tStart, "TimeEnd": tEnd,
                           "Truck Name": site.name, "Venue Name": rule.venue || "Unknown Venue", "Village": rule.village || "", "Notes": "" 
                       });
                   }
               }
           }
           finalEvents = expandedEvents;
      }

      if (Array.isArray(finalEvents)) {
        console.log(`   📋 Processing ${finalEvents.length} events...`);
        let newCount = 0; let dupCount = 0;
        
        for (const event of finalEvents) {
          const truckName = (event["Truck Name"] || "").trim();
          const venueName = (event["Venue Name"] || "").trim();
          const extractedVillage = (event["Village"] || "").trim();
          const eventNotes = (event["Notes"] || "").trim();
          
          if (!truckName || !event.DateStart) continue;
          
          // --- 🛡️ HISTORICAL DATE FILTER ---
          const cleanDate = standardizeDate(event.DateStart);
          const eventDateObj = parseEventDateStr(cleanDate);
          
          if (eventDateObj < todayZeroed) {
              console.log(`   ⏳ Skipping historical event: ${truckName} on ${cleanDate}`);
              continue;
          }
          // ------------------------------------------------

          // --- 🛡️ FUZZY EXCLUSION CHECK ---
          const normRawTruck = normalizeName(truckName);
          const isExcluded = Array.from(excludedTerms).some(ex => isFuzzyMatch(ex, normRawTruck));
          if (isExcluded) {
              console.log(`   🚫 Skipping excluded truck term: ${truckName}`);
              continue;
          }
          // ------------------------------------------------

          // --- 🛡️ PRIVATE EVENT HARD FILTER ---
          const combinedText = (venueName + " " + eventNotes).toLowerCase();
          if (combinedText.includes('private')) {
              console.log(`   🚫 Skipping private event: ${truckName} on ${event.DateStart}`);
              continue;
          }
          // ------------------------------------------------

          let finalTruck = truckName;
          let isNewTruck = false;
          const normTruck = normalizeName(truckName);

          if (site.sourceType === 'truck') {
              finalTruck = site.name; 
          } else {
              // --- 🧠 TRUCK FUZZY IDENTIFICATION ---
              let matchedTruckObj = validTrucks.find(t => {
                  const normDbName = normalizeName(t.name);
                  if (isFuzzyMatch(normDbName, normTruck) || normDbName.includes(normTruck) || normTruck.includes(normDbName)) return true;
                  
                  for (const alias of t.aliases) {
                      const normAlias = normalizeName(alias);
                      if (isFuzzyMatch(normAlias, normTruck) || normAlias.includes(normTruck) || normTruck.includes(normAlias)) return true;
                  }
                  return false;
              });

              if (matchedTruckObj) {
                  finalTruck = matchedTruckObj.name;
              } else {
                  finalTruck = toTitleCase(truckName);
                  isNewTruck = true;
                  
                  if (!newTrucksDetected.has(finalTruck)) {
                      const newTruckRow = new Array(20).fill('');
                      newTruckRow[0] = finalTruck; 
                      newTruckRow[19] = 'Yes';    // Flag as excluded/pending verification
                      newTrucksDetected.set(finalTruck, newTruckRow);
                  }
              }
          }

          let finalVenue = venueName || "Unknown";
          let isNewVenue = false;
          let confirmedVenue = null;
          const normVenue = normalizeName(venueName);

          if (site.sourceType === 'venue') {
              finalVenue = site.name;
              confirmedVenue = site.name;
          } else {
              const eventTextToSearch = (venueName + " " + extractedVillage + " " + eventNotes).toLowerCase();
              const postcodeMatch = eventTextToSearch.match(/[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}/i);
              const eventPostcode = postcodeMatch ? postcodeMatch[0].toLowerCase().replace(/\s+/g, '') : null;

              if (eventPostcode) {
                  const venuesAtPostcode = venueData.filter(v => v[2] && v[2].toLowerCase().replace(/\s+/g, '') === eventPostcode);
                  if (venuesAtPostcode.length > 0) {
                      let bestMatch = null; let highestScore = -1;
                      for (const v of venuesAtPostcode) {
                          const dbNameNorm = normalizeName(v[0]); let score = 0;
                          if (isFuzzyMatch(dbNameNorm, normVenue)) score += 100;
                          else if (dbNameNorm.includes(normVenue) || normVenue.includes(dbNameNorm)) score += 5;
                          if (score > highestScore) { highestScore = score; bestMatch = v[0]; }
                      }
                      if (bestMatch && highestScore > 0) confirmedVenue = bestMatch;
                  }
              }

              if (!confirmedVenue) {
                  // --- 🧠 VENUE FUZZY IDENTIFICATION ---
                  let fuzzyMatches = venueData.filter(v => {
                      if (!v[0]) return false; 
                      const normDbName = normalizeName(v[0]);
                      return isFuzzyMatch(normVenue, normDbName) || normVenue.includes(normDbName) || normDbName.includes(normVenue);
                  });

                  if (fuzzyMatches.length > 0) {
                      let verifiedMatches = [];
                      for (const match of fuzzyMatches) {
                          const normDbName = normalizeName(match[0]);
                          const dbVillage = (match[1] || "").toLowerCase().trim(); 
                          let score = 0;
                          
                          if (isFuzzyMatch(normVenue, normDbName)) {
                              score += 100; 
                          } else if (normDbName.includes(normVenue) || normVenue.includes(normDbName)) {
                              score += 10; 
                              if (dbVillage && dbVillage.length > 2) {
                                  if (eventTextToSearch.includes(dbVillage)) score += 50; 
                                  else score -= 20; 
                              } else if (Math.abs(normDbName.length - normVenue.length) > 5) {
                                  score -= 5; 
                              }
                          }
                          
                          if (score > 0) verifiedMatches.push({ venue: match, score: score });
                      }
                      verifiedMatches.sort((a, b) => b.score - a.score);
                      if (verifiedMatches.length > 0) confirmedVenue = verifiedMatches[0].venue[0];
                  }
              }
              
              if (confirmedVenue) {
                  finalVenue = confirmedVenue;
              } else { 
                  isNewVenue = true; 
                  if (finalVenue && extractedVillage) {
                      const compositeKey = `${finalVenue}|${extractedVillage}`;
                      if (!newVenuesDetected.has(compositeKey)) {
                          newVenuesDetected.set(compositeKey, { name: finalVenue, village: extractedVillage, notes: eventNotes || "" });
                      }
                  }
              }
          }

          let aiNotesArr = [];
          if (isNewTruck) aiNotesArr.push("[⚠️ NEW TRUCK]");
          if (isNewVenue) aiNotesArr.push("[⚠️ NEW VENUE]");
          if (eventNotes) aiNotesArr.push(eventNotes); 
          let finalAiNotes = aiNotesArr.join(" | ");

          const cleanTruckKey = normalizeName(finalTruck);
          const cleanVenueKey = normalizeName(finalVenue);

          const eventSource = (site.strategy === 'manual' || site.strategy === 'manual_single') 
            ? 'Manual Entry' 
            : `URL: ${site.url} | Strategy: ${site.strategy}`;
          
          // --- 🧠 SMART FUZZY DEDUPLICATION CHECK ---
          const isDup = existingEvents.some(ex => 
              ex.date === cleanDate && 
              isFuzzyMatch(ex.truck, cleanTruckKey) && 
              isFuzzyMatch(ex.venue, cleanVenueKey)
          );

          if (!isDup) {
              console.log(`   ✅ ADDING: ${finalTruck} @ ${finalVenue} (${cleanDate})`);
              
              newRowsToAdd.push([
                  cleanDate,                                        // Col A: Date
                  event.TimeStart,                                  // Col B: StartTime
                  event.TimeEnd,                                    // Col C: TimeEnd
                  finalTruck,                                       // Col D: Truck Name
                  finalVenue,                                       // Col E: Venue Name
                  extractedVillage,                                 // Col F: Village
                  "",                                               // Col G: Event Notes
                  eventSource,                                      // Col H: Event Source
                  finalAiNotes                                      // Col I: AI Notes
              ]);
              
              // Push to array so we don't duplicate it within this run
              existingEvents.push({ date: cleanDate, truck: cleanTruckKey, venue: cleanVenueKey });
              newCount++;
          } else { dupCount++; }
        }
        console.log(`   📊 Summary: ${newCount} new, ${dupCount} duplicates skipped.`);
      }
    } catch (e) { console.error("   ❌ AI Failed:", e.message); }
  } catch (error) { 
    console.error(`❌ Error on ${site.name}:`, error.message); 
  } finally {
    if (page) {
      await page.close().catch(e => console.error("Failed to close page:", e.message));
    }
  }
}

await browser.close();

// ── HatchGrab-linked truck scraping ──────────────────────────────────────────

const HATCHGRAB_API_URL = process.env.HATCHGRAB_API_URL;
const INBOUND_SECRET = process.env.INBOUND_SCHEDULE_SECRET;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// ── Helpers ───────────────────────────────────────────────────────────────────

function shouldRunToday(truck) {
  const today = new Date().getDay();
  if (!truck.scraper_learning_complete) return true;
  if (truck.scraper_update_day === null || truck.scraper_update_day === undefined) return true;
  const preferred = truck.scraper_update_day;
  if (today === preferred) return true;
  if (today === (preferred + 1) % 7) return true;
  if (today === (preferred + 2) % 7) return true;
  return false;
}

function hashEvents(events) {
  const sorted = [...events]
    .map(e => `${e.event_date}|${e.venue_name}`)
    .sort()
    .join(',');
  return createHash('md5').update(sorted).digest('hex');
}

async function recordRunAndLearn(supabase, truck, eventsFound, eventsChanged, ruleUsed) {
  const now = new Date();
  const dayOfWeek = now.getDay();

  if (!truck.scraper_first_run_at) {
    await supabase.from('trucks')
      .update({ scraper_first_run_at: now.toISOString() })
      .eq('id', truck.id);
  }

  await supabase.from('scraper_run_log').insert({
    truck_id: truck.id,
    run_at: now.toISOString(),
    day_of_week: dayOfWeek,
    events_found: eventsFound,
    events_changed: eventsChanged,
    rule_used: ruleUsed,
  });

  const firstRun = truck.scraper_first_run_at ? new Date(truck.scraper_first_run_at) : now;
  const daysSinceFirst = (now - firstRun) / (1000 * 60 * 60 * 24);
  if (daysSinceFirst < 30) return;

  const { data: runs } = await supabase
    .from('scraper_run_log')
    .select('day_of_week, events_changed')
    .eq('truck_id', truck.id)
    .gte('run_at', new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString());

  if (!runs || runs.length < 8) return;

  const changeCounts = Array(7).fill(0);
  runs.filter(r => r.events_changed).forEach(r => { changeCounts[r.day_of_week]++; });

  const maxChanges = Math.max(...changeCounts);
  if (maxChanges === 0) return;

  const learnedDay = changeCounts.indexOf(maxChanges);
  await supabase.from('trucks')
    .update({ scraper_update_day: learnedDay, scraper_learning_complete: true })
    .eq('id', truck.id);

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  console.log(`   🧠 Learned update day for ${truck.name}: ${dayNames[learnedDay]}`);
}

async function checkEmptySchedule(supabase, truck) {
  const today = new Date().toISOString().split('T')[0];

  const { count: futureEvents } = await supabase
    .from('truck_events')
    .select('id', { count: 'exact', head: true })
    .eq('truck_id', truck.id)
    .gte('event_date', today)
    .in('status', ['confirmed', 'unconfirmed', 'open']);

  if ((futureEvents || 0) > 0) return;

  if (truck.scraper_last_empty_notify_at) {
    const daysSinceLast = (Date.now() - new Date(truck.scraper_last_empty_notify_at)) / (1000 * 60 * 60 * 24);
    if (daysSinceLast < 14) return;
  }

  const { data: operator } = await supabase
    .from('operators')
    .select('email, first_name')
    .eq('id', truck.operator_id)
    .single();

  if (!operator?.email || !BREVO_API_KEY) return;

  const manageUrl = `https://www.hatchgrab.com/manage/${truck.dashboard_token}?tab=schedule`;
  const firstName = operator.first_name || 'there';

  const html = `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#334155">
    <p>Hi ${firstName},</p>
    <p>We checked your schedule but couldn't find any upcoming events listed.</p>
    <p>If you've got dates coming up, you can add them in two ways:</p>
    <ul style="color:#475569">
      <li><strong>Import your schedule</strong> — upload a photo, PDF, or paste your schedule text</li>
      <li><strong>Add events manually</strong> — add them one at a time</li>
    </ul>
    <p style="margin:24px 0">
      <a href="${manageUrl}" style="background:#ea580c;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block">
        Go to your schedule →
      </a>
    </p>
    <p>If you're taking a break that's completely fine — we'll check again in a couple of weeks.</p>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">— The HatchGrab team · hatchgrab.com</p>
  </div>`;

  // Fire-and-forget — never block scraper on email failure
  fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'HatchGrab', email: 'hello@hatchgrab.com' },
      to: [{ email: operator.email }],
      subject: `No upcoming events showing for ${truck.name}`,
      htmlContent: html,
      textContent: `Hi ${firstName},\n\nWe checked your schedule but couldn't find any upcoming events listed.\n\nYou can add events at: ${manageUrl}\n\nIf you're taking a break that's fine — we'll check again in a couple of weeks.\n\n— The HatchGrab team`,
    }),
  }).then(async r => {
    if (!r.ok) console.warn(`[empty-schedule email] Brevo error for ${truck.name}:`, await r.text());
    else {
      await supabase.from('trucks')
        .update({ scraper_last_empty_notify_at: new Date().toISOString() })
        .eq('id', truck.id);
      console.log(`   📧 Empty-schedule email sent to ${operator.email}`);
    }
  }).catch(err => console.warn(`[empty-schedule email] failed for ${truck.name}:`, err.message));
}

async function pruneScraperRunLog(supabase) {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('scraper_run_log').delete().lt('run_at', cutoff);
  if (error) console.warn('scraper_run_log prune failed:', error.message);
  else console.log('✅ scraper_run_log pruned to 90 days');
}

// ── Per-truck scrape loop ──────────────────────────────────────────────────────

if (HATCHGRAB_API_URL && INBOUND_SECRET) {
  console.log('\n🏪 Starting HatchGrab-linked truck schedule scraping...');

  const { data: hgTrucks } = await supabase
    .from('trucks')
    .select('id, name, schedule_url, scraper_preference, scraper_rule, scraper_last_hash, scraper_learning_complete, scraper_update_day, scraper_first_run_at, scraper_last_empty_notify_at, dashboard_token, operator_id')
    .in('scraper_preference', ['auto', 'both'])
    .not('schedule_url', 'is', null);

  if (hgTrucks && hgTrucks.length > 0) {
    const hgBrowser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
    });

    const scrapeWithRule = async (url, rule) => {
      const page = await hgBrowser.newPage();
      try {
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(url, { timeout: 30000, waitUntil: 'networkidle2' }).catch(() => {});
        await sleep(3000);
        return rule === 'scroll_next'
          ? await performButtonHunt(page)
          : await performModernScroll(page);
      } finally {
        await page.close().catch(() => {});
      }
    };

    const isValidEvent = (e) => e.venue_name && e.venue_name.trim().length > 0 && e.event_date;
    const todayStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentYear = new Date().getFullYear();

    for (const hgTruck of hgTrucks) {
      if (!hgTruck.schedule_url) continue;

      // Adaptive scheduling gate
      if (!shouldRunToday(hgTruck)) {
        console.log(`\n⏭️  Skipping ${hgTruck.name} — not scheduled for today (learned day: ${hgTruck.scraper_update_day})`);
        continue;
      }

      console.log(`\n🔍 HatchGrab truck: ${hgTruck.name} (${hgTruck.schedule_url})`);

      try {
        let winningText;
        let winningRule = hgTruck.scraper_rule;

        if (!winningRule) {
          console.log('   🔄 No stored rule — running dual detection...');
          const [lazyText, nextText] = await Promise.all([
            scrapeWithRule(hgTruck.schedule_url, 'scroll_lazy'),
            scrapeWithRule(hgTruck.schedule_url, 'scroll_next'),
          ]);
          const countDates = (t) => (t.match(/\d{1,2}[\/\-]\d{1,2}/g) || []).length;
          const lazyCount = countDates(lazyText);
          const nextCount = countDates(nextText);
          console.log(`   scroll_lazy: ~${lazyCount} date patterns, scroll_next: ~${nextCount}`);
          if (nextCount > lazyCount) {
            winningRule = 'scroll_next'; winningText = nextText;
          } else {
            winningRule = 'scroll_lazy'; winningText = lazyText;
          }
          await supabase.from('trucks').update({ scraper_rule: winningRule }).eq('id', hgTruck.id);
          console.log(`   ✅ Stored winning rule: ${winningRule}`);
        } else {
          console.log(`   📌 Using stored rule: ${winningRule}`);
          winningText = await scrapeWithRule(hgTruck.schedule_url, winningRule);
        }

        if (!winningText || winningText.length < 50) {
          console.log(`   ❌ Empty page for ${hgTruck.name}. Skipping.`);
          await recordRunAndLearn(supabase, hgTruck, 0, false, winningRule);
          continue;
        }

        // Parse events with Gemini
        const hgPrompt = `CRITICAL CONTEXT: Today is ${todayStr}. Current year is ${currentYear}.
You are extracting a food truck's schedule from website text. Extract ONLY future events.
DATE RULES: Format "DD/MM/YYYY". Always append /${currentYear}. Map day names to exact dates based on today.
TIME RULES: "HH:MM" 24-hour. "5pm" → "17:00". If unknown, use "".
VENUE RULES: Extract only the pub/venue name, not the town.
Return ONLY valid JSON:
{"events":[{"event_date":"DD/MM/YYYY","start_time":"HH:MM","end_time":"HH:MM","venue_name":"Name","town":"Town","postcode":"Postcode or empty"}]}

WEBSITE TEXT:
${winningText.slice(0, 100000)}`;

        let hgEvents = [];
        try {
          // Uses gemini-2.5-flash (not lite) for schedule extraction per the manual spec.
          // Apps Script paths also use gemini-2.5-flash — update there separately if rotated.
          const hgResult = await generateContentWithRetry(modelHeavy, hgPrompt);
          hgEvents = (hgResult?.events || []).filter(isValidEvent);
        } catch (err) {
          console.error(`   ❌ AI parse failed for ${hgTruck.name}:`, err.message);
          await recordRunAndLearn(supabase, hgTruck, 0, false, winningRule);
          continue;
        }

        console.log(`   📋 Extracted ${hgEvents.length} events`);

        // Detect schedule change via hash
        const currentHash = hashEvents(hgEvents);
        const eventsChanged = hgEvents.length > 0 && currentHash !== hgTruck.scraper_last_hash;
        if (eventsChanged) {
          await supabase.from('trucks')
            .update({ scraper_last_hash: currentHash, scraper_last_changed_at: new Date().toISOString() })
            .eq('id', hgTruck.id);
          console.log(`   🔄 Schedule changed (hash: ${currentHash.slice(0, 8)})`);
        } else if (hgEvents.length > 0) {
          console.log(`   ✓ Schedule unchanged (hash: ${currentHash.slice(0, 8)})`);
        }

        // Zero-result recheck: reset rule if truck has had recent events
        if (hgEvents.length === 0) {
          const { count } = await supabase
            .from('truck_events')
            .select('id', { count: 'exact', head: true })
            .eq('truck_id', hgTruck.id)
            .gte('event_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
          if ((count || 0) > 0) {
            await supabase.from('trucks').update({ scraper_rule: null }).eq('id', hgTruck.id);
            console.warn(`   ⚠️  Zero events but has recent history — scraper_rule reset for recheck`);
          }
          await recordRunAndLearn(supabase, hgTruck, 0, false, winningRule);
          await checkEmptySchedule(supabase, hgTruck);
          continue;
        }

        // POST to inbound-schedule
        const payload = {
          secret: INBOUND_SECRET,
          events: hgEvents.map(e => ({
            truck_name: hgTruck.name,
            event_date: e.event_date,
            start_time: e.start_time || null,
            end_time: e.end_time || null,
            venue_name: e.venue_name,
            village: e.town || null,
            postcode: e.postcode || null,
            source: `hg_scraper:${winningRule}`,
          })),
        };

        const res = await fetch(`${HATCHGRAB_API_URL}/api/inbound-schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        console.log(`   ✅ Sent to inbound-schedule: ${result.bridged ?? 0} bridged, ${result.inserted ?? 0} discovery`);

        await recordRunAndLearn(supabase, hgTruck, hgEvents.length, eventsChanged, winningRule);
      } catch (err) {
        console.error(`   ❌ Error scraping ${hgTruck.name}:`, err.message);
      }
    }

    await hgBrowser.close();
  } else {
    console.log('   ℹ️  No HatchGrab trucks with auto-scraping enabled.');
  }

  // Part 5 — prune run log once per daily run
  await pruneScraperRunLog(supabase);

} else {
  console.log('\n⚠️  HATCHGRAB_API_URL or INBOUND_SCHEDULE_SECRET not set — skipping HatchGrab truck scraping.');
}

// --- APPEND NEW TRUCKS ---
if (newTrucksDetected.size > 0) {
  console.log(`\n🚚 Adding ${newTrucksDetected.size} new trucks to the Trucks tab...`);
  const newTruckRows = Array.from(newTrucksDetected.values());
  try {
      await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${TABS.TRUCKS}!A:T`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: newTruckRows },
      });
      console.log(`✅ Successfully added ${newTruckRows.length} new trucks!`);
      // DB mirror — parallel run
      for (const row of newTruckRows) {
        supabase.from('discovery_trucks').upsert({
          name: row[0],
          exclude_reason: 'Yes - New Truck',
        }, { onConflict: 'name', ignoreDuplicates: true }).then(({ error }) => {
          if (error) console.warn('[DB] Truck write failed:', error.message);
        });
      }
  } catch (error) {
      console.error("❌ Failed to add new trucks:", error.message);
  }
}

// --- APPEND NEW EVENTS ---
if (newRowsToAdd.length > 0) {
  console.log(`\n💾 Appending ${newRowsToAdd.length} new events...`);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID, range: `${TABS.EVENTS}!A:I`, valueInputOption: 'USER_ENTERED', resource: { values: newRowsToAdd },
  });
  console.log("🎉 Database Sync Complete!");
  // DB mirror — parallel run
  for (let i = 0; i < newRowsToAdd.length; i += 100) {
    const batch = newRowsToAdd.slice(i, i + 100).map(r => ({
      event_date: toISODate(r[0]),
      start_time: r[1] || null,
      end_time: r[2] || null,
      truck_name: r[3] || '',
      venue_name: r[4] || null,
      village: r[5] || null,
      event_notes: r[6] || null,
      source: r[7] || null,
      ai_notes: r[8] || null,
    }));
    supabase.from('discovery_events').upsert(batch, { onConflict: 'event_date,truck_name,venue_name' }).then(({ error }) => {
      if (error) console.warn('[DB] Event write failed:', error.message);
    });
  }
} else { console.log("\n💤 No new events found."); }

// --- ADD NEW VENUES & GEOCODE ---
if (newVenuesDetected.size > 0) {
  console.log(`\n🌍 Asking AI to locate and add ${newVenuesDetected.size} new venues...`);
  
  const venuesToProcess = Array.from(newVenuesDetected.values());
  const venueListForPrompt = venuesToProcess.map(v => `Name: "${v.name}", Village: "${v.village}", Hints: "${v.notes}"`).join(" | ");
  
  const geoPrompt = `
    You are a UK Geography data assistant. Find the Postcode, Latitude, and Longitude for these locations.
    Only return a valid JSON array.
    Locations: ${venueListForPrompt}
    Format: [{ "name": "Exact Name Provided", "village": "Exact Village Provided", "postcode": "XX1 1XX", "lat": 52.123, "lng": 0.123 }]
  `;
  
  try {
    const geoResult = await generateContentWithRetry(modelLite, geoPrompt);
    
    const newVenueRows = geoResult.map(v => [
      v.name || "",            
      v.village || "",         
      v.postcode || "",        
      v.lat || "",             
      v.lng || "",             
      "",                      
      "",                      
      "",                      
      "",                      
      "",                      
      "",                      
      "[⚠️ NEW FROM SCRAPER]"  
    ]);

    if (newVenueRows.length > 0) {
      await sheets.spreadsheets.values.append({ 
          spreadsheetId: SPREADSHEET_ID, 
          range: `${TABS.VENUES}!A:L`, 
          valueInputOption: 'USER_ENTERED', 
          resource: { values: newVenueRows }, 
      });
      console.log(`📍 Successfully added ${newVenueRows.length} new locations to the Venues tab!`);
      // DB mirror — parallel run
      for (const v of geoResult) {
        supabase.from('venues').upsert({
          name: v.name,
          village: v.village || null,
          latitude: v.lat || null,
          longitude: v.lng || null,
        }, { onConflict: 'name', ignoreDuplicates: true }).then(({ error }) => {
          if (error) console.warn('[DB] Venue write failed:', error.message);
        });
      }
    }
  } catch (error) {
      console.error("❌ Geocoder Failed:", error.message);
  }
}
}
main();