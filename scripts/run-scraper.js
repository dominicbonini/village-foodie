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

// --- DETERMINISTIC DATE CALCULATOR (ROBUST DAY MATCHER) ---
function generateDatesFromRule(ruleJSON) {
    const dates = [];
    const today = new Date();

    if (!ruleJSON || !ruleJSON.day) return [];
    
    // 👇 FIXED: Robust string matching to catch "every thursday" or "Thursdays"
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
    
    // 👇 FIXED: Ensure monthly events aren't accidentally flagged as single-day events
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
  headless: "new",
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--allow-running-insecure-content', '--disable-web-security'],
});

const newRowsToAdd = [];
const newVenuesDetected = new Map();

for (const [index, site] of sitesToScrape.entries()) {
  try {
    console.log(`\n🔍 [${index + 1}/${sitesToScrape.length}] Scraping: ${site.name} (${site.sourceType} | ${site.strategy})...`);
    
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

    if (site.strategy === 'manual' && site.instructions.length > 10) {
        console.log("   ✨ Manual Mode: Parsing Rules for Calculation...");
        isManualWithRules = true;
        cleanText = `SYSTEM OVERRIDE: Extract Recurrence Rules. TRUCK NAME: "${site.name}". RULES: ${site.instructions}`;
    } else if (cleanText.length < 50) {
        console.log(`   ❌ Empty page content (${cleanText.length} chars). Skipping.`);
        await page.close();
        continue;
    }

    let prompt = "";
    if (isManualWithRules) {
        prompt = `
          You are a Logic Extractor. Parse the user's scheduling rules.
          USER RULES: "${site.instructions}"
          TRUCK NAME: "${site.name}"
          CURRENT YEAR: ${new Date().getFullYear()}
          CRITICAL INSTRUCTIONS:
          1. Extract EACH venue separately.
          2. Copy the EXACT time text you see into "rawTimeStart"/"rawTimeEnd".
          3. Handle Specific Dates: If text says "Mon 2nd", extract "2nd" into "pos".
          4. STRICT FORMATTING: "freq" and "day" MUST BE LOWERCASE ONLY.
          5. MONTHLY EVENTS: If a rule says "First Saturday", set freq: "monthly", day: "saturday", pos: "1st".
          6. VENUE NAME: Extract the exact name from the user rules.
          7. DATE BOUNDARIES: If rules say "from [Date]" or "until [Date]", extract "startDate" and/or "endDate" in "YYYY-MM-DD" format.
          CORRECT FORMAT EXAMPLES:
          [
            { "venue": "The Railway Tavern", "proof": "Every Monday", "rawTimeStart": "5pm", "rawTimeEnd": "7ish", "freq": "weekly", "day": "monday", "pos": "", "startDate": null, "endDate": null },
            { "venue": "City Park", "proof": "Every Sunday from 28th March to October", "rawTimeStart": "12pm", "rawTimeEnd": "4pm", "freq": "weekly", "day": "sunday", "pos": "", "startDate": "2026-03-28", "endDate": "2026-10-31" }
          ]
        `;
      } else {
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
          6. **VENUE NAME (COMPOSITE KEY):** Check if in ${JSON.stringify(validVenues)}. If NO, extract BUSINESS NAME AND TOWN (e.g., 'The Bull - Saffron Walden').
          7. **ADDRESS IN NOTES:** Postcodes/addresses go into "Notes".
          
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
      
      if (isManualWithRules && Array.isArray(result)) {
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
                           "Truck Name": site.name, "Venue Name": rule.venue || "Unknown Venue", "Notes": "" 
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
              const eventTextToSearch = (venueName + " " + eventNotes).toLowerCase();
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
                          
                          if (normVenue === normDbName) score += 100;
                          else if (normDbName.includes(normVenue) || normVenue.includes(normDbName)) score += 10;
                          
                          if (dbVillage && dbVillage.length > 2 && eventTextToSearch.includes(dbVillage)) score += 5; 
                          
                          if (score > 0 || fuzzyMatches.length === 1) verifiedMatches.push({ venue: match, score: score });
                      }
                      verifiedMatches.sort((a, b) => b.score - a.score);
                      if (verifiedMatches.length > 0) confirmedVenue = verifiedMatches[0].venue[0];
                  }
              }
              if (confirmedVenue) finalVenue = confirmedVenue;
              else { isNewVenue = true; newVenuesDetected.set(finalVenue, eventNotes); }
          }

          let aiNotesArr = [];
          if (isNewTruck) aiNotesArr.push("[⚠️ NEW TRUCK]");
          if (isNewVenue) aiNotesArr.push("[⚠️ NEW VENUE]");
          if (eventNotes) aiNotesArr.push(eventNotes);
          let notes = aiNotesArr.join(" ");

          const cleanDate = standardizeDate(event.DateStart);
          const cleanTruckKey = finalTruck.toLowerCase().replace(/[^a-z0-9]/g, '');
          const cleanVenueKey = finalVenue.toLowerCase().replace(/[^a-z0-9]/g, '');
          
          const key = `${cleanDate}|${cleanTruckKey}|${cleanVenueKey}`;
          
          if (!existingEvents.has(key)) {
              console.log(`   ✅ ADDING: ${finalTruck} @ ${finalVenue} (${event.DateStart})`);
              newRowsToAdd.push([event.DateStart, event.TimeStart, event.TimeEnd, finalTruck, finalVenue, "", `URL: ${site.url} | Strategy: ${site.strategy}`, notes]);
              existingEvents.add(key); 
              newCount++;
          } else { dupCount++; }
        }
        console.log(`   📊 Summary: ${newCount} new, ${dupCount} duplicates skipped.`);
      }
    } catch (e) { console.error("   ❌ AI Failed:", e.message); }
    await page.close();
  } catch (error) { console.error(`❌ Error on ${site.name}:`, error.message); }
}

await browser.close();

if (newRowsToAdd.length > 0) {
  console.log(`\n💾 Appending ${newRowsToAdd.length} new events...`);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID, range: `${TABS.EVENTS}!A:H`, valueInputOption: 'USER_ENTERED', resource: { values: newRowsToAdd },
  });
  console.log("🎉 Database Sync Complete!");
} else { console.log("\n💤 No new events found."); }

if (newVenuesDetected.size > 0) {
  console.log(`\n🌍 Asking AI to locate ${newVenuesDetected.size} new venues...`);
  const venueListForPrompt = Array.from(newVenuesDetected.entries()).map(([name, addressInfo]) => `Venue: "${name}", Address: "${addressInfo}"`).join(" | ");
  const geoPrompt = `Return JSON array. Village, Postcode, Lat, Lng for: ${venueListForPrompt}`;
  try {
    const geoResult = await generateContentWithRetry(model, geoPrompt);
    const newVenueRows = geoResult.map(v => [v.name || "", v.village || "", v.postcode || "", v.lat || "", v.lng || "", "", "", "", "", "", "[⚠️ VERIFY GPS]"]);
    await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `${TABS.VENUES}!A:K`, valueInputOption: 'USER_ENTERED', resource: { values: newVenueRows }, });
    console.log(`📍 Successfully added ${newVenueRows.length} locations!`);
  } catch (error) { console.error("❌ Geocoder Failed:", error.message); }
}
}
main();