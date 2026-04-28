import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs'; 

dotenv.config({ path: '.env.local' });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
// Added EXCLUSIONS to tabs
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

// HELPER: Name Normalizer
function normalizeName(name) {
    if (!name) return "";
    return name.toLowerCase()
        .replace(/^the\s+/, '')       
        .replace(/\bst\b/g, 'street') 
        .replace(/\brd\b/g, 'road')   
        .replace(/&/g, 'and')         
        .replace(/[^a-z0-9]/g, '');   
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
          // Look for all headings, titles, or short text blocks
          const elements = Array.from(document.querySelectorAll('h2, h3, h4, h5, .elementor-tab-title, .accordion-title, div, span'));
          
          // Loop backwards to click the innermost specific element, not the giant container
          for (let i = elements.length - 1; i >= 0; i--) {
              const el = elements[i];
              const txt = (el.innerText || "").toLowerCase().trim();
              
              // If it says "Wednesday" or "Wednesday Route" and isn't a massive paragraph...
              if (txt.includes(targetDay) && txt.length < 30 && el.offsetHeight > 0) {
                  try {
                      el.click();
                      return true; // Click successful!
                  } catch(e) {}
              }
          }
          return false;
      }, day);

      if (clicked) {
          console.log(`   👆 Clicked: ${day.toUpperCase()}... Waiting for text to render...`);
          await sleep(1500); // Give the website 1.5 seconds to open the menu and load the text
          
          // Take a snapshot of whatever is currently on the screen
          const pageText = await page.evaluate(() => document.body.innerText);
          accumulatedText += `\n\n--- STATE AFTER CLICKING ${day.toUpperCase()} ---\n` + pageText;
      }
  }

  // Fallback: If no days were clicked, just grab whatever text is normally there
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
// Added fetching of Exclusion Data
const [truckData, venueData, eventData, exclusionData] = await Promise.all([
  getTabData(sheets, TABS.TRUCKS),
  getTabData(sheets, TABS.VENUES),
  getTabData(sheets, TABS.EVENTS),
  getTabData(sheets, TABS.EXCLUSIONS)
]);

// Build Exclusions Set
const excludedTerms = new Set(exclusionData.map(r => r[0] ? r[0].toString().toLowerCase().trim() : '').filter(Boolean));

const validTrucks = truckData.filter(r => r[0]).map(r => {
    return {
        name: r[0].toString().trim(),
        aliases: r[17] ? r[17].toString().split(',').map(a => a.trim()).filter(Boolean) : []
    };
});

const validVenues = venueData.map(r => r[0]).filter(Boolean);

const existingEvents = new Set();

eventData.forEach(row => {
    const date = standardizeDate(row[0]); 
    const truck = (row[3] || "").toLowerCase().replace(/[^a-z0-9]/g, ''); 
    const venue = (row[4] || "").toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (date && truck && venue) {
        existingEvents.add(`${date}|${truck}|${venue}`);
    }
});

console.log(`   ℹ️  Loaded ${existingEvents.size} existing unique events.`);

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
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--allow-running-insecure-content', '--disable-web-security'],
});

const newRowsToAdd = [];
const newVenuesDetected = new Map();
const newTrucksDetected = new Map(); // Added to track new trucks to append

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
          console.log(`   🐛 [DEBUG] Saved what the browser saw to DEBUG_SCRAPED_TEXT.txt`);
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
    
    if (isRuleExtraction) {
        prompt = `
          You are a Data Extraction Bot. 
          TRUCK NAME: "${site.name}"
          CURRENT YEAR: ${new Date().getFullYear()}
          
          TASK 1: Extract any manual rules provided in the user's hint below.
          CRITICAL HINT FROM USER: ${site.instructions || "None provided."}
          
          TASK 2: Extract EVERY recurring schedule stop found in the WEBSITE TEXT below (e.g., Monday Route, Tuesday Route). Treat "Route" as freq: "weekly".
          
          WEBSITE TEXT TO PARSE:
          ${cleanText.slice(0, 100000)}

          RULES TO FOLLOW:
          1. Extract EACH venue as a separate JSON object. Do not combine stops.
          2. "rawTimeStart" and "rawTimeEnd" MUST be the exact times from the text (e.g., "4.00", "6.00pm").
          3. "freq" and "day" MUST BE LOWERCASE ONLY.
          4. DATE BOUNDARIES: If rules say "from [Date]" or "until [Date]", extract "startDate" and/or "endDate" in "YYYY-MM-DD" format.
          5. IGNORE PRIVATE EVENTS: Do not extract any event labeled as "private", "private party", or "private lunch".
          6. VILLAGE (MANDATORY): Always extract the town, village, or city into a separate "village" field.

          OUTPUT FORMAT EXAMPLES:
          [
            { "venue": "Wickhambrook MSC", "village": "Wickhambrook", "proof": "Saturday", "rawTimeStart": "11:45", "rawTimeEnd": "13:45", "freq": "weekly", "day": "saturday", "pos": "", "startDate": null, "endDate": null },
            { "venue": "Hundon", "village": "Hundon", "proof": "Wednesday Route", "rawTimeStart": "4.45", "rawTimeEnd": "8.30pm", "freq": "weekly", "day": "wednesday", "pos": "", "startDate": null, "endDate": null }
          ]
        `;
      } else {
        prompt = `
          You are extracting food truck events for: "${site.name}".
          Current Date: ${new Date().toDateString()}.
          Current Year: ${new Date().getFullYear()}.
          
          ${site.instructions ? `\n🚨 CRITICAL USER HINT FOR THIS WEBSITE: "${site.instructions}"` : ""}
          
          TASK: Extract EVERY food truck event from the provided text for the schedule shown.
          CRITICAL RULES:
          1. **EXPLICIT DATES OVERRIDE EVERYTHING:** If a specific date is written (e.g., "6th April", "10th April"), you MUST extract that exact date, even if it is in the past relative to the Current Date. Do NOT shift explicit past dates into the future.
          2. **PRESERVE THE WHOLE WEEK:** If the text contains a schedule for a specific week, extract ALL days of that schedule, including days that have already happened. Do NOT ignore past events.
          3. **RELATIVE DAYS:** ONLY calculate the "next immediate date" for a day of the week if NO specific date number (like "6th") is provided alongside it.
          4. **DateStart Format:** "DD/MM/YYYY". 
          5. **VENUE NAME:** Extract ONLY the Business Name (e.g., 'The Plough'). DO NOT append the village.
          6. **VILLAGE (MANDATORY):** You must extract the town, village, or city name. If the text says 'The Street, Capel St. Mary', the venue is 'The Street' and the Village is 'Capel St. Mary'. NEVER leave this blank.
          7. **NOTES:** Postcodes, addresses, or extra event details go into the "Notes" field.
          8. **DOUBLE DAYS:** If a single day lists multiple locations, create a completely separate JSON object for each location.
          9. **MISSING TIMES:** If no time is explicitly stated for a venue, output "" (an empty string) for TimeStart and TimeEnd.
          10. **PRIVATE EVENTS:** If an event is explicitly marked as "private", "private party", "private event", or "private lunch", completely ignore it. Do NOT extract it.
          11. **FACEBOOK 'TONIGHT' RULE (STRICT):** NEVER extract an event based solely on relative words like "tonight", "today", "tomorrow", or "this weekend". Social media posts are persistent; "tonight" might be months old. You must ignore these words entirely.
          12. **PROXIMITY REQUIREMENT:** You must ONLY extract an event if an explicit Day (e.g., "Wednesday") or Date (e.g., "24th") is explicitly stated in the exact same sentence or list block as the venue name. Do not guess dates for standalone locations.
          
          RETURN JSON:
          [{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "Town Name", "Notes": "..." }]
          
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
      
      if (isRuleExtraction && Array.isArray(result)) {
           for (const rule of result) {
               if (!rule.freq && rule.day) rule.freq = "weekly";
               if (rule.freq) {
                   const dates = generateDatesFromRule(rule);
                   const tStart = parseTime(rule.rawTimeStart) || "Contact Venue";
                   let tEnd = parseTime(rule.rawTimeEnd) || "Contact Venue";
                   if (tStart === "Contact Venue") tEnd = "";

                   for (const date of dates) {
                       finalEvents.push({
                           "DateStart": date, "TimeStart": tStart, "TimeEnd": tEnd,
                           "Truck Name": site.name, "Venue Name": rule.venue || "Unknown Venue", "Village": rule.village || "", "Notes": "" 
                       });
                   }
               }
           }
      } else { finalEvents = result; }

      if (Array.isArray(finalEvents)) {
        console.log(`   📋 Processing ${finalEvents.length} events...`);
        let newCount = 0; let dupCount = 0;
        
        for (const event of finalEvents) {
          const truckName = (event["Truck Name"] || "").trim();
          const venueName = (event["Venue Name"] || "").trim();
          const extractedVillage = (event["Village"] || "").trim();
          const eventNotes = (event["Notes"] || "").trim();
          
          if (!truckName || !event.DateStart) continue;

          // --- 🛡️ NEW EXCLUSION CHECK ---
          if (excludedTerms.has(truckName.toLowerCase())) {
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

          if (site.sourceType === 'truck') {
              finalTruck = site.name; 
          } else {
              const normTruck = normalizeName(truckName);
              
              let matchedTruckObj = validTrucks.find(t => {
                  const normDbName = normalizeName(t.name);
                  if (normDbName === normTruck || normDbName.includes(normTruck) || normTruck.includes(normDbName)) return true;
                  
                  for (const alias of t.aliases) {
                      const normAlias = normalizeName(alias);
                      if (normAlias === normTruck || normAlias.includes(normTruck) || normTruck.includes(normAlias)) return true;
                  }
                  return false;
              });

              if (matchedTruckObj) {
                  finalTruck = matchedTruckObj.name;
              } else {
                  // --- APPLY TITLE CASE AND TRACK NEW TRUCK ---
                  finalTruck = toTitleCase(truckName);
                  isNewTruck = true;
                  
                  if (!newTrucksDetected.has(finalTruck)) {
                      // Create an empty row with 20 columns to set Col T (index 19) to 'Yes'
                      const newTruckRow = new Array(20).fill('');
                      newTruckRow[0] = finalTruck; // Col A
                      newTruckRow[19] = 'Yes';     // Col T (Excluded until verified)
                      newTrucksDetected.set(finalTruck, newTruckRow);
                  }
              }
          }

          let finalVenue = venueName || "Unknown";
          let isNewVenue = false;
          let confirmedVenue = null;

          if (site.sourceType === 'venue') {
              finalVenue = site.name;
              confirmedVenue = site.name;
          } else {
              const normVenue = normalizeName(venueName);
              const eventTextToSearch = (venueName + " " + extractedVillage + " " + eventNotes).toLowerCase();
              const postcodeMatch = eventTextToSearch.match(/[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}/i);
              const eventPostcode = postcodeMatch ? postcodeMatch[0].toLowerCase().replace(/\s+/g, '') : null;

              if (eventPostcode) {
                  const venuesAtPostcode = venueData.filter(v => v[2] && v[2].toLowerCase().replace(/\s+/g, '') === eventPostcode);
                  if (venuesAtPostcode.length > 0) {
                      let bestMatch = null; let highestScore = -1;
                      for (const v of venuesAtPostcode) {
                          const dbNameNorm = normalizeName(v[0]); let score = 0;
                          if (dbNameNorm === normVenue) score += 100;
                          else if (dbNameNorm.includes(normVenue) || normVenue.includes(dbNameNorm)) score += 5;
                          if (score > highestScore) { highestScore = score; bestMatch = v[0]; }
                      }
                      if (bestMatch && highestScore > 0) confirmedVenue = bestMatch;
                  }
              }

              if (!confirmedVenue) {
                  let fuzzyMatches = venueData.filter(v => {
                      if (!v[0]) return false; const normDbName = normalizeName(v[0]);
                      return normVenue === normDbName || normVenue.includes(normDbName) || normDbName.includes(normVenue);
                  });

                  if (fuzzyMatches.length > 0) {
                      let verifiedMatches = [];
                      for (const match of fuzzyMatches) {
                          const normDbName = normalizeName(match[0]);
                          const dbVillage = (match[1] || "").toLowerCase().trim(); 
                          let score = 0;
                          
                          if (normVenue === normDbName) {
                              score += 100; 
                          } else if (normDbName.includes(normVenue) || normVenue.includes(normDbName)) {
                              score += 10; 
                              if (dbVillage && dbVillage.length > 2) {
                                  if (eventTextToSearch.includes(dbVillage)) {
                                      score += 50; 
                                  } else {
                                      score -= 20; 
                                  }
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
                          newVenuesDetected.set(compositeKey, {
                              name: finalVenue,
                              village: extractedVillage,
                              notes: eventNotes || ""
                          });
                      }
                  }
              }
          }

          let aiNotesArr = [];
          if (isNewTruck) aiNotesArr.push("[⚠️ NEW TRUCK]");
          if (isNewVenue) aiNotesArr.push("[⚠️ NEW VENUE]");
          if (eventNotes) aiNotesArr.push(eventNotes); 
          let finalAiNotes = aiNotesArr.join(" | ");

          const cleanDate = standardizeDate(event.DateStart);
          const cleanTruckKey = finalTruck.toLowerCase().replace(/[^a-z0-9]/g, '');
          const cleanVenueKey = finalVenue.toLowerCase().replace(/[^a-z0-9]/g, '');
          
          const key = `${cleanDate}|${cleanTruckKey}|${cleanVenueKey}`;

          // --- 🛡️ EVENT SOURCE OVERRIDE ---
          const eventSource = (site.strategy === 'manual' || site.strategy === 'manual_single') 
            ? 'Manual Entry' 
            : `URL: ${site.url} | Strategy: ${site.strategy}`;
          // ------------------------------------------------
          
          if (!existingEvents.has(key)) {
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
              
              existingEvents.add(key); 
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
  } catch (error) {
      console.error("❌ Failed to add new trucks:", error.message);
  }
}

if (newRowsToAdd.length > 0) {
  console.log(`\n💾 Appending ${newRowsToAdd.length} new events...`);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID, range: `${TABS.EVENTS}!A:I`, valueInputOption: 'USER_ENTERED', resource: { values: newRowsToAdd },
  });
  console.log("🎉 Database Sync Complete!");
} else { console.log("\n💤 No new events found."); }

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
      v.name || "",            // Col A: Venue Name
      v.village || "",         // Col B: Village
      v.postcode || "",        // Col C: Postcode
      v.lat || "",             // Col D: Latitude
      v.lng || "",             // Col E: Longitude
      "",                      // Col F: Empty (Address)
      "",                      // Col G: Empty (Phone)
      "",                      // Col H: Empty (Email)
      "",                      // Col I: Empty (Website)
      "",                      // Col J: Empty (Facebook)
      "",                      // Col K: Empty (Instagram)
      "[⚠️ NEW FROM SCRAPER]"  // Col L: Photo/Notes Flag
    ]);

    if (newVenueRows.length > 0) {
      await sheets.spreadsheets.values.append({ 
          spreadsheetId: SPREADSHEET_ID, 
          range: `${TABS.VENUES}!A:L`, 
          valueInputOption: 'USER_ENTERED', 
          resource: { values: newVenueRows }, 
      });
      console.log(`📍 Successfully added ${newVenueRows.length} new locations to the Venues tab!`);
    }
  } catch (error) { 
      console.error("❌ Geocoder Failed:", error.message); 
  }
}
}
main();