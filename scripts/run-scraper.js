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
  'default':       performModernScroll   
};

// HELPER: Sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// HELPER: Name Normalizer (Updated to ignore "The")
function normalizeName(name) {
    if (!name) return "";
    return name.toLowerCase()
        .replace(/^the\s+/, '')       // Remove leading "The " for better matching
        .replace(/\bst\b/g, 'street') 
        .replace(/\brd\b/g, 'road')   
        .replace(/&/g, 'and')         
        .replace(/[^a-z0-9]/g, '');   
}

// --- FIXED TIME PARSER ---
function parseTime(timeStr) {
    if (!timeStr) return null;
    timeStr = timeStr.toLowerCase().replace(/\s/g, '');

    // "7ish" override
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
    const dayMap = { 'sunday':0, 'monday':1, 'tuesday':2, 'wednesday':3, 'thursday':4, 'friday':5, 'saturday':6 };

    if (!ruleJSON || !ruleJSON.day) return [];
    
    const targetDayName = ruleJSON.day.toLowerCase().trim();
    const targetDay = dayMap[targetDayName];
    let posRaw = (ruleJSON.pos || "").toLowerCase().replace(/\D/g, ''); 
    
    const posNum = parseInt(posRaw, 10);
    
    // Check if it's a specific date (Single Event) vs Recurring Rule
    let isSingleEvent = false;
    
    if (posNum > 5) {
        isSingleEvent = true; 
    } else if (posNum > 0) {
        const testDate = new Date();
        testDate.setDate(posNum); 
        if (testDate.getDay() === targetDay) {
            isSingleEvent = true; 
        }
    }

    if (targetDay === undefined) return [];

    for (let i = 0; i < 28; i++) {
        const d = new Date();
        d.setDate(today.getDate() + i);
        
        if (d.getDay() === targetDay) {
            let isMatch = false;

            if (ruleJSON.freq === 'weekly') {
                if (isSingleEvent) {
                     if (d.getDate() === posNum) isMatch = true;
                } else {
                     isMatch = true; 
                }
            } 
            else if (ruleJSON.freq === 'monthly') {
                const dayOfMonth = d.getDate();
                
                if (isSingleEvent) {
                     if (dayOfMonth === posNum) isMatch = true;
                } else {
                    const weekNum = Math.ceil(dayOfMonth / 7);
                    const nextWeek = new Date(d);
                    nextWeek.setDate(d.getDate() + 7);
                    const isLast = nextWeek.getMonth() !== d.getMonth();

                    if ((ruleJSON.pos || '').includes('last') && isLast) isMatch = true;
                    else if ((ruleJSON.pos || '').includes('1st') && weekNum === 1) isMatch = true;
                    else if ((ruleJSON.pos || '').includes('2nd') && weekNum === 2) isMatch = true;
                    else if ((ruleJSON.pos || '').includes('3rd') && weekNum === 3) isMatch = true;
                    else if ((ruleJSON.pos || '').includes('4th') && weekNum === 4) isMatch = true;
                }
            }

            if (isMatch) {
                dates.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }));
                
                if (isSingleEvent) {
                    return dates;
                }
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

// HELPER: Normalize Date (e.g., "1/1/2024" -> "01/01/2024") to ensure matches
function standardizeDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;
  return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
}

async function main() {
console.log("🚀 Starting Smart Scrape (Strict Deduplication)...");

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

// --- CHANGE 1: STRICT DEDUPLICATION SET ---
// We only use Date + Truck + Venue. We ignore Time.
// We also standardize the date to ensure "01/02/2024" matches "1/2/2024"
const existingEvents = new Set();

eventData.forEach(row => {
    const date = standardizeDate(row[0]); 
    const truck = (row[3] || "").toLowerCase().replace(/[^a-z0-9]/g, ''); // Remove spaces/symbols
    const venue = (row[4] || "").toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // key format: "01/01/2024|pizzatruck|thepub"
    if (date && truck) {
        existingEvents.add(`${date}|${truck}|${venue}`);
    }
});

console.log(`   ℹ️  Loaded ${existingEvents.size} existing unique events.`);

const sitesToScrape = [];

truckData.forEach(row => {
  const hasUrl = row[4] && row[4].startsWith('http');
  const hasInstructions = row[10] && row[10].length > 10;
  if (hasUrl || hasInstructions) {
    sitesToScrape.push({ 
        name: row[0], url: row[4] || 'about:blank', 
        instructions: row[10] || "",
        strategy: (row[11] || 'scroll_lazy').toLowerCase().trim()
    });
  }
});

venueData.forEach(row => {
  if (row[9] && row[9].startsWith('http')) {
    sitesToScrape.push({ 
        name: row[0], url: row[9], instructions: row[10] || "",
        strategy: (row[11] || 'scroll_lazy').toLowerCase().trim()
    });
  }
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite", generationConfig: { responseMimeType: "application/json" } });

const browser = await puppeteer.launch({
  headless: "new",
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--allow-running-insecure-content', '--disable-web-security'],
});

const newRowsToAdd = [];

for (const [index, site] of sitesToScrape.entries()) {
  try {
    console.log(`\n🔍 [${index + 1}/${sitesToScrape.length}] Scraping: ${site.name} (${site.strategy})...`);
    
    let cleanText = "";
    let isManualWithRules = false;
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const strategyFunc = STRATEGIES[site.strategy] || STRATEGIES['default'];

    if (site.strategy !== 'manual') {
      try {
          const navPromise = page.goto(site.url, { timeout: 25000, waitUntil: 'domcontentloaded' });
          if (site.url.startsWith('http:')) await Promise.race([navPromise, sleep(12000)]);
          else await navPromise;
          await sleep(2000);
      } catch (e) { console.log("   ⚠️ Navigation warning."); }
      cleanText = await strategyFunc(page);
    } else {
      cleanText = ""; 
    }

    if (cleanText.length < 50 && site.instructions.length > 10) {
        console.log("   ✨ Empty/Manual: Parsing Rules for Calculation...");
        isManualWithRules = true;
        cleanText = `SYSTEM OVERRIDE: Extract Recurrence Rules. TRUCK NAME: "${site.name}". RULES: ${site.instructions}`;
    } else if (cleanText.length < 50) {
        console.log("   ❌ Empty site and no instructions. Skipping.");
        await page.close();
        continue;
    }

    let prompt = "";
    if (isManualWithRules) {
        prompt = `
          You are a Logic Extractor. Parse the user's scheduling rules.
          USER RULES: "${site.instructions}"
          TRUCK NAME: "${site.name}"
          CRITICAL INSTRUCTIONS:
          1. Extract EACH venue separately.
          2. Copy the EXACT time text you see into "rawTimeStart"/"rawTimeEnd".
          3. Handle Specific Dates: If text says "Mon 2nd", extract "2nd" into "pos".
          CORRECT FORMAT:
          [{ "venue": "The Railway Tavern", "proof": "Mon 2nd - The Railway Tavern", "rawTimeStart": "5pm", "rawTimeEnd": "7ish", "freq": "weekly", "day": "monday", "pos": "2nd" }]
        `;
      } else {
        prompt = `
          You are extracting food truck events for: "${site.name}".
          Current Date: ${new Date().toDateString()}.
          Current Year: ${new Date().getFullYear()}.
          TASK: Extract ALL upcoming food truck events from the provided text.
          CRITICAL RULES:
          1. **DEEP SCAN:** The text contains multiple days/months. Scan the ENTIRE text block.
          2. **TODAY/TOMORROW:** If text says "Tonight" or "Tomorrow", convert to dates based on Current Date.
          3. **DateStart:** MUST be "DD/MM/YYYY". You MUST use the Current Year (${new Date().getFullYear()}) for all dates unless the website explicitly states otherwise. Do NOT use past years like 2025.
          4. **Missing Info:** If "TRUCK NAME" is in text, use it. Default to "${site.name}".
          5. Truck Name Fuzzy Match: ${JSON.stringify(validTrucks)}.
          6. Venue Name Fuzzy Match: ${JSON.stringify(validVenues)}.
          RETURN JSON:
          [{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Notes": "..." }]
          WEBSITE TEXT:
          ${cleanText.slice(0, 150000)} 
        `;
    }

    try {
      console.log("   🤖 Sending to AI...");
      const result = await generateContentWithRetry(model, prompt);
      
      let finalEvents = [];
      if (isManualWithRules && Array.isArray(result) && result[0].freq) {
           for (const rule of result) {
               const dates = generateDatesFromRule(rule);
               const tStart = parseTime(rule.rawTimeStart) || "Contact Venue";
               let tEnd = parseTime(rule.rawTimeEnd) || "Contact Venue";
               if (tStart === "Contact Venue") tEnd = "";

               for (const date of dates) {
                   finalEvents.push({
                       "DateStart": date,
                       "TimeStart": tStart,
                       "TimeEnd": tEnd,
                       "Truck Name": site.name,
                       "Venue Name": rule.venue,
                       "Notes": "" 
                   });
               }
           }
      } else {
          finalEvents = result;
      }

      if (Array.isArray(finalEvents)) {
        console.log(`   📋 Processing ${finalEvents.length} events...`);
        let newCount = 0;
        let dupCount = 0;
        
        for (const event of finalEvents) {
          const truckName = (event["Truck Name"] || "").trim();
          const venueName = (event["Venue Name"] || "").trim();
          
          if (!truckName) continue;

          const normTruck = normalizeName(truckName);
          const normVenue = normalizeName(venueName);

          const matchedTruck = validTrucks.find(t => normalizeName(t).includes(normTruck) || normTruck.includes(normalizeName(t)));
          const matchedVenue = validVenues.find(v => normalizeName(v).includes(normVenue) || normVenue.includes(normalizeName(v)));
          
          const finalVenue = matchedVenue || venueName || "Unknown";
          
          // Unknown Truck Logic
          let finalTruck = matchedTruck;
          let notes = "";

          if (!matchedTruck) {
              if (truckName.toLowerCase().includes(normalizeName(site.name))) {
                  finalTruck = site.name;
              } else {
                  finalTruck = truckName; 
                  notes = "[⚠️ NEW TRUCK]"; 
                  console.log(`      ⚠️  ALERT: New Truck Discovered: "${truckName}"`);
              }
          } else {
              finalTruck = matchedTruck;
          }

          // --- CHANGE 2: NEW DEDUPLICATION CHECK ---
          // 1. Clean the incoming data exactly like we cleaned the sheet data
          const cleanDate = standardizeDate(event.DateStart);
          const cleanTruckKey = finalTruck.toLowerCase().replace(/[^a-z0-9]/g, '');
          const cleanVenueKey = finalVenue.toLowerCase().replace(/[^a-z0-9]/g, '');

          // 2. Generate key WITHOUT Time
          const key = `${cleanDate}|${cleanTruckKey}|${cleanVenueKey}`;
          
          if (!existingEvents.has(key)) {
              console.log(`   ✅ ADDING: ${finalTruck} @ ${finalVenue} (${event.DateStart})`);
              newRowsToAdd.push([
                  event.DateStart, 
                  event.TimeStart, 
                  event.TimeEnd, 
                  finalTruck, 
                  finalVenue, 
                  notes 
              ]);
              existingEvents.add(key); // Add to current set to prevent immediate duplicates
              newCount++;
          } else {
              dupCount++;
          }
        }
        console.log(`   📊 Summary: ${newCount} new, ${dupCount} duplicates skipped.`);
      }
    } catch (e) { console.error("   ❌ AI Failed:", e.message); }

    await page.close();

  } catch (error) {
    console.error(`❌ Error on ${site.name}:`, error.message);
  }
}

await browser.close();

if (newRowsToAdd.length > 0) {
  console.log(`\n💾 Appending ${newRowsToAdd.length} new events...`);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TABS.EVENTS}!A:F`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: newRowsToAdd },
  });
  console.log("🎉 Database Sync Complete!");
} else {
  console.log("\n💤 No new events found.");
}
}

async function getTabData(sheets, rangeName) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${rangeName}!A2:K` });
    const resExtended = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${rangeName}!A2:M` });
    return resExtended.data.values || [];
  } catch (error) { return []; }
}

main();