import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TABS = { EVENTS: 'Events', TRUCKS: 'Trucks', VENUES: 'Venues' };

// --- STRATEGY DICTIONARY ---
const STRATEGIES = {
  'scroll_lazy':   performModernScroll,  
  'click_next':    performButtonHunt,    
  'frames':        performFrameDump,     
  'manual':        performManualMode,
  'manual_single': performManualMode, // 👇 ADD THIS LINE
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

// HELPER: AI Retry
async function generateContentWithRetry(model, prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return JSON.parse(response.text());
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`   ⚠️  AI Busy. Retrying in 5s... (Attempt ${i + 1})`);
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
  console.log("   🔽 Strategy: Expand & Scrape (Deep Extracting)...");

  await page.evaluate(async () => { window.scrollBy(0, 800); });
  await sleep(1500);

  await page.evaluate(() => {
    const selectors = ['button', '[aria-expanded="false"]', '.elementor-tab-title', '.accordion-toggle', 'h2', 'h3', 'h4', 'div'];
    selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            const text = (el.innerText || "").toLowerCase();
            if (el.hasAttribute('aria-expanded') || el.tagName === 'BUTTON' || 
                text.includes('monday') || text.includes('tuesday') || 
                text.includes('wednesday') || text.includes('thursday') || 
                text.includes('friday') || text.includes('saturday') || text.includes('sunday')) {
                try { el.click(); } catch(e) {}
            }
        });
    });
  });
  
  await sleep(3000); 

  let combinedText = await page.evaluate(() => document.body.innerText);
  
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
    const resExtended = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${rangeName}!A2:Q` });
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
const [truckData, venueData, eventData] = await Promise.all([
  getTabData(sheets, TABS.TRUCKS),
  getTabData(sheets, TABS.VENUES),
  getTabData(sheets, TABS.EVENTS)
]);

const validTrucks = truckData.map(r => r[0]).filter(Boolean);
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
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-lite", 
    generationConfig: { responseMimeType: "application/json", temperature: 0 } 
});

const browser = await puppeteer.launch({
  headless: true, // Fixed headless setting
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--allow-running-insecure-content', '--disable-web-security'],
});

const newRowsToAdd = [];
const newVenuesDetected = new Map();

for (const [index, site] of sitesToScrape.entries()) {
  let page; // Initialized here to ensure it can be closed in the finally block
  
  try {
    console.log(`\n🔍 [${index + 1}/${sitesToScrape.length}] Scraping: ${site.name} (${site.sourceType} | ${site.strategy})...`);
    
    let cleanText = "";
    let isRuleExtraction = false; 
    
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const strategyFunc = STRATEGIES[site.strategy] || STRATEGIES['default'];

    if (site.strategy !== 'manual') {
      try {
          const navPromise = page.goto(site.url, { timeout: 30000, waitUntil: 'networkidle2' });
          if (site.url.startsWith('http:')) await Promise.race([navPromise, sleep(15000)]);
          else await navPromise;
          await sleep(5000);
      } catch (e) { console.log("   ⚠️ Navigation warning."); }
      cleanText = await strategyFunc(page);
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
      if (cleanText.length < 50) {
          console.log(`   ❌ Empty page content (${cleanText.length} chars). Skipping.`);
          continue; 
      }
  } else if (cleanText.length < 50) {
      console.log(`   ❌ Empty page content (${cleanText.length} chars). Skipping.`);
      continue; 
  }

    let prompt = "";
    
    // 👇 THE CUSTOM SITE ADAPTER FOR HOWE & CO 👇
    if (site.url && site.url.includes('howeandcofishandchips.co.uk')) {
        console.log("   🐟 Engaging Custom Site Adapter for Howe & Co...");
        isRuleExtraction = true; 
        prompt = `
          You are a Custom Data Extractor for Howe & Co Fish and Chips.
          TRUCK NAME: "${site.name}"
          CURRENT YEAR: ${new Date().getFullYear()}
          
          TASK: Read the messy website text below and extract EVERY single stop on their weekly route.
          
          CRITICAL RULES FOR THIS SPECIFIC SITE:
          1. The text lists routes by day (e.g., "Monday Route", "Tuesday Route"). You must extract EVERY village listed under EVERY day.
          2. Treat every single stop as freq: "weekly".
          3. Convert the day to lowercase in the JSON (e.g., "monday").
          4. "rawTimeStart" and "rawTimeEnd" must be extracted exactly as written (e.g., "4.00", "8.20pm").
          5. FIX TYPOS: If the text says "Stock by Clare", output "Stoke by Clare".
          6. ADD MISSING ROUTE: You MUST also add one extra JSON object for: Venue: "Wickhambrook MSC", Day: "saturday", Start: "11:45", End: "13:45".
          
          WEBSITE TEXT TO PARSE:
          ${cleanText.slice(0, 100000)}

          OUTPUT FORMAT EXAMPLES:
          [
            { "venue": "Wickhambrook MSC", "proof": "Manual Override", "rawTimeStart": "11:45", "rawTimeEnd": "13:45", "freq": "weekly", "day": "saturday", "pos": "", "startDate": null, "endDate": null },
            { "venue": "Great yeldham", "proof": "Monday Route", "rawTimeStart": "4.00", "rawTimeEnd": "6.00pm", "freq": "weekly", "day": "monday", "pos": "", "startDate": null, "endDate": null }
          ]
        `;
    } 
    // 👇 STANDARD RULE EXTRACTION 👇
    else if (isRuleExtraction) {
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

          OUTPUT FORMAT EXAMPLES:
          [
            { "venue": "Wickhambrook MSC", "proof": "Saturday", "rawTimeStart": "11:45", "rawTimeEnd": "13:45", "freq": "weekly", "day": "saturday", "pos": "", "startDate": null, "endDate": null },
            { "venue": "Great yeldham", "proof": "Monday Route", "rawTimeStart": "4.00", "rawTimeEnd": "6.00pm", "freq": "weekly", "day": "monday", "pos": "", "startDate": null, "endDate": null }
          ]
        `;
      } else {
        // 👇 UPDATED: Strict Village separation in the prompt 👇
        prompt = `
          You are extracting food truck events for: "${site.name}".
          Current Date: ${new Date().toDateString()}.
          Current Year: ${new Date().getFullYear()}.
          
          ${site.instructions ? `\n🚨 CRITICAL USER HINT FOR THIS WEBSITE: "${site.instructions}"` : ""}
          
          TASK: Extract EVERY SINGLE upcoming food truck event from the provided text.
          CRITICAL RULES:
          1. **STRICT DATE ADHERENCE:** Do NOT shift past dates into the future. 
          2. **IGNORE PAST EVENTS.**
          3. **THE "TODAY" RULE:** Anchor "Today" to the Post Publish Date or current clock if on a checkout page.
          4. **DAYS OF THE WEEK:** Calculate next immediate date based on Current Date.
          5. **DateStart Format:** "DD/MM/YYYY". 
          6. **VENUE NAME:** Extract ONLY the Business Name (e.g., 'The Plough'). DO NOT append the village.
          7. **VILLAGE:** If a town or village is mentioned, extract it explicitly into the "Village" field.
          8. **NOTES:** Postcodes/addresses or extra event details go into the "Notes" field.
          9. **DOUBLE DAYS:** If a single day lists multiple locations (e.g., "Lunch at X, then Dinner at Y"), you MUST create a completely separate JSON object for each location.
          10. **MISSING TIMES:** If no time is explicitly stated for a venue, output "" (an empty string) for TimeStart and TimeEnd.
          
          RETURN JSON:
          [{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "Town Name", "Notes": "..." }]
          
          WEBSITE TEXT:
          ${cleanText.slice(0, 150000)} 
        `;
    }

    try {
      console.log("   🤖 Sending to AI...");
      const result = await generateContentWithRetry(model, prompt);
      
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
                           "Truck Name": site.name, "Venue Name": rule.venue || "Unknown Venue", "Village": "", "Notes": "" 
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

          let finalTruck = truckName;
          let isNewTruck = false;

          if (site.sourceType === 'truck') {
              finalTruck = site.name; 
          } else {
              const normTruck = normalizeName(truckName);
              let matchedTruck = validTrucks.find(t => normalizeName(t) === normTruck) || 
                                 validTrucks.find(t => normalizeName(t).includes(normTruck) || normTruck.includes(normalizeName(t)));
              finalTruck = matchedTruck || truckName;
              isNewTruck = !matchedTruck;
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

              // 1. Postcode matching
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

              // 2. Fuzzy Matching
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
                  // 👇 UPDATED: Strict New Venue handling
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

          // 👇 FIX: Separate internal AI flags from public Event Notes
          let aiNotesArr = [];
          if (isNewTruck) aiNotesArr.push("[⚠️ NEW TRUCK]");
          if (isNewVenue) aiNotesArr.push("[⚠️ NEW VENUE]");
          let aiNotes = aiNotesArr.join(" ");

          const cleanDate = standardizeDate(event.DateStart);
          const cleanTruckKey = finalTruck.toLowerCase().replace(/[^a-z0-9]/g, '');
          const cleanVenueKey = finalVenue.toLowerCase().replace(/[^a-z0-9]/g, '');
          
          const key = `${cleanDate}|${cleanTruckKey}|${cleanVenueKey}`;
          
          if (!existingEvents.has(key)) {
              console.log(`   ✅ ADDING: ${finalTruck} @ ${finalVenue} (${cleanDate})`);
              
              // 👇 FIX: 9 columns pushed exactly in order to match A to I layout
              newRowsToAdd.push([
                  cleanDate,                                        // Col A: Date
                  event.TimeStart,                                  // Col B: StartTime
                  event.TimeEnd,                                    // Col C: TimeEnd
                  finalTruck,                                       // Col D: Truck Name
                  finalVenue,                                       // Col E: Venue Name
                  extractedVillage,                                 // Col F: Village
                  eventNotes,                                       // Col G: Event Notes
                  `URL: ${site.url} | Strategy: ${site.strategy}`,  // Col H: Event Source
                  aiNotes                                           // Col I: AI Notes
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
    // Memory leak fix: Always close the page
    if (page) {
      await page.close().catch(e => console.error("Failed to close page:", e.message));
    }
  }
}

await browser.close();

if (newRowsToAdd.length > 0) {
  console.log(`\n💾 Appending ${newRowsToAdd.length} new events...`);
  await sheets.spreadsheets.values.append({
    // 👇 FIX: Appending to range A:I so it correctly captures all 9 columns
    spreadsheetId: SPREADSHEET_ID, range: `${TABS.EVENTS}!A:I`, valueInputOption: 'USER_ENTERED', resource: { values: newRowsToAdd },
  });
  console.log("🎉 Database Sync Complete!");
} else { console.log("\n💤 No new events found."); }

// 👇 UPDATED: Intelligent Auto-Geocoder
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
    const geoResult = await generateContentWithRetry(model, geoPrompt);
    
    // Map the AI JSON to match your exact Google Sheet Columns (A to L)
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