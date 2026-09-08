/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════════════════╗
 * ║  REFERENCE COPY — NOT EXECUTED FROM THIS REPOSITORY                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * This file is a COPY of the Google Apps Script project bound to the VillageFoodie_Master spreadsheet,
 * "VILLAGE FOODIE: ULTIMATE MASTER PRODUCTION BUILD (v6.57)". Nothing in this repository runs it, imports
 * it, tests it or deploys it. It is here so that the pipeline it belongs to can be READ, cited by line, and
 * planned against (docs/scraper-reference-manual.md §16, docs/apps-script-documentation-report.md).
 *
 * THE LIVE VERSION IS AT:  the Sheet → Extensions → Apps Script.   That is the only copy that executes.
 *
 * Copied: 9 September 2026, from the file the live editor exported (village-foodie-apps-script-v6.57.js).
 * SHA-256 of the verbatim body below this header at the time of copying:
 *   7fd1ad21b99881c5bd939135c9af7cbbb3ea637ee3cae44dad14ed67ad6827a1
 * (Recompute over everything after the "END OF REFERENCE HEADER" line to check for drift.)
 *
 * 🔴 A COPY THAT SILENTLY DRIFTS FROM THE ORIGINAL IS WORSE THAN NO COPY. The next person to edit the live
 * script will not edit this file, and nothing will tell them. Before relying on ANY line number or
 * behaviour cited from this file, diff it against the live editor. If the live project's version string
 * is no longer v6.57, this file is already stale and every citation of it is a claim, not a fact.
 *
 * Line numbers cited in the manual and report are the ORIGINAL file's line numbers, i.e. this file's line
 * numbers MINUS the 26 lines of this header.
 * ── END OF REFERENCE HEADER ─────────────────────────────────────────────────────────────────────────────
 */
/**
 * VILLAGE FOODIE: ULTIMATE MASTER PRODUCTION BUILD (v6.57)
 * --------------------------------------------------------
 * FIX: Email blast now reads events from Supabase (single source of truth).
 *      Sheet Events tab no longer used for email delivery.
 * FIX: Switched back to gemini-2.5-flash to improve processing accuracy.
 * FIX: Extended API Pacer to 15 seconds to safely bypass rapid burst filters.
 * FIX: Removed API key references — all keys in Script Properties.
 * FEATURES: Supabase Mirroring, Targeted Email Replies, Context Injection, 4-Pillar Dupe Checker, Time Clash Flags, API Pacer.
 * --------------------------------------------------------
 */

// --- 🔑 API CONFIGURATION ---
const GOOGLE_API_KEY = PropertiesService.getScriptProperties().getProperty('GOOGLE_API_KEY');
const BREVO_API_KEY = PropertiesService.getScriptProperties().getProperty('BREVO_API_KEY');
const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');

const SOURCE_FOLDER_ID = "1D_v3fOuNqfvfl182PpmBKCvXAwlq-ZwG";

const ADMIN_EMAIL = "dominic@villagefoodie.co.uk";
const SENDER_ALIAS = "schedule@villagefoodie.co.uk";
const REPLY_TO_EMAIL = "schedule@villagefoodie.co.uk";
const TEST_EMAILS = ["dominicbonini@hotmail.com", "villagefoodie.info@gmail.com"];

const BASE_URL = "https://villagefoodie.co.uk";
const SITE_LOGO_FILENAME = 'village-foodie-logo-v2.png';

// --- 🗄️ SUPABASE MIRROR ---
function mirrorEventsToSupabase(rows) {
  if (!rows || rows.length === 0) return;
  try {
    const INBOUND_SCHEDULE_URL = "https://www.villagefoodie.co.uk/api/inbound-schedule";
    const INBOUND_SCHEDULE_SECRET = PropertiesService.getScriptProperties().getProperty('INBOUND_SCHEDULE_SECRET');

    const events = rows.map(r => ({
      event_date: r[0],
      start_time: r[1] || null,
      end_time: r[2] || null,
      truck_name: r[3] || '',
      venue_name: r[4] || null,
      village: r[5] || null,
      event_notes: r[6] || null,
      source: r[7] || null,
      ai_notes: r[8] || null,
    }));

    UrlFetchApp.fetch(INBOUND_SCHEDULE_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ secret: INBOUND_SCHEDULE_SECRET, events: events }),
      muteHttpExceptions: true,
    });

    logToSheet("Mirrored " + rows.length + " event(s) to Supabase.", "INFO");
  } catch(e) {
    logToSheet("Supabase mirror failed: " + e.message, "WARN");
  }
}

// ==========================================
// 📝 VISUAL LOGGER
// ==========================================
function logToSheet(message, status) {
  status = status || "INFO";
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName("Logs");

  if (!logSheet) {
    logSheet = ss.insertSheet("Logs");
    logSheet.appendRow(["Timestamp", "Status", "Message"]);
    logSheet.getRange("A1:C1").setFontWeight("bold").setBackground("#f1f5f9");
    logSheet.setColumnWidth(1, 150);
    logSheet.setColumnWidth(2, 100);
    logSheet.setColumnWidth(3, 800);
  }

  const tz = ss.getSpreadsheetTimeZone();
  const timestamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
  logSheet.appendRow([timestamp, status, message]);

  if (logSheet.getLastRow() > 500) {
    logSheet.deleteRow(2);
  }
}

// ==========================================
// 🍔 UI MENU
// ==========================================
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🍔 Village Foodie')
    .addItem('📨 Send Test Email', 'triggerTestEmail')
    .addSeparator()
    .addItem('🚀 SEND LIVE TO ALL', 'triggerLiveEmail')
    .addSeparator()
    .addItem('🧹 Clean Duplicates (Events)', 'removeDuplicateEvents')
    .addItem('🧹 Clean Past Events', 'removePastEvents')
    .addSeparator()
    .addItem('📸 Auto-Fetch Venue Photos', 'fetchVenueGoogleData')
    .addItem('🖼️ Process Drive Screenshots', 'processFoodTruckScreenshots')
    .addItem('📧 Process Vendor Emails', 'processVendorEmails')
    .addSeparator()
    .addItem('📋 Send Daily New Trucks Report', 'sendDailyNewTrucksReport')
    .addToUi();
}

function triggerTestEmail() { runEmailJob(true); }

function triggerLiveEmail() {
  let ui;
  try { ui = SpreadsheetApp.getUi(); } catch(e) {}
  if (ui) {
    const response = ui.alert("⚠️ WARNING: SEND LIVE?", "Send the weekly email blast to ALL active subscribers?", ui.ButtonSet.YES_NO);
    if (response == ui.Button.YES) runEmailJob(false);
  } else {
    runEmailJob(false);
  }
}

// ==========================================
// 🤖 SMART INBOX AI & SCREENSHOTS
// ==========================================
function getExclusions() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Exclusions");
  const ex = new Set();
  if (!sheet) return ex;
  const data = sheet.getDataRange().getValues().slice(1);
  data.forEach(row => { if (row[0]) ex.add(normalizeTruckKey(row[0])); });
  return ex;
}

function cleanGeminiResponse(rawText) {
  if (!rawText) return "{}";
  const bt = String.fromCharCode(96, 96, 96);
  let cleaned = rawText.replace(new RegExp(bt + 'json', 'gi'), '');
  cleaned = cleaned.replace(new RegExp(bt, 'g'), '');
  return cleaned.trim();
}

function processVendorEmails() {
  logToSheet("Started processing Vendor Emails from Smart Inbox.", "INFO");
  const functionStartTime = Date.now(), TIME_LIMIT = 200000;
  const ss = SpreadsheetApp.getActiveSpreadsheet(), eventsSheet = ss.getSheetByName("Events"), trucksSheet = ss.getSheetByName("Trucks"), venuesSheet = ss.getSheetByName("Venues"), tz = ss.getSpreadsheetTimeZone();

  let pendingLabel = GmailApp.getUserLabelByName("Process Schedule") || GmailApp.createLabel("Process Schedule");
  let retryLabel = GmailApp.getUserLabelByName("Awaiting Retry") || GmailApp.createLabel("Awaiting Retry");
  let doneLabel = GmailApp.getUserLabelByName("Processed Schedules") || GmailApp.createLabel("Processed Schedules");
  let noEventsLabel = GmailApp.getUserLabelByName("No Events Found") || GmailApp.createLabel("No Events Found");
  const threads = pendingLabel.getThreads().concat(retryLabel.getThreads());

  if (threads.length === 0) {
    logToSheet("No new emails found with 'Process Schedule' label.", "INFO");
    return;
  }

  logToSheet("Found " + threads.length + " email thread(s) to process.", "INFO");
  const trucksData = trucksSheet.getDataRange().getValues();
  const venuesData = venuesSheet.getDataRange().getValues();
  let curEvs = eventsSheet.getDataRange().getValues();
  const exclusions = getExclusions();
  const todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  for (const thread of threads) {
    if (Date.now() - functionStartTime > TIME_LIMIT) {
      logToSheet("Execution time limit reached. Stopping email processing safely.", "WARN");
      break;
    }
    thread.removeLabel(pendingLabel).removeLabel(retryLabel);
    const messages = thread.getMessages();
    const latestMsg = messages[messages.length - 1];
    const emailSubject = latestMsg.getSubject();
    const messageAgeHours = (Date.now() - latestMsg.getDate().getTime()) / (1000 * 60 * 60);
    if (messageAgeHours > 1 && thread.getLabels().some(l => l.getName() === "Awaiting Retry")) {
      logToSheet("Thread '" + emailSubject + "' failed multiple times. Escalating to Admin.", "ERROR");
      latestMsg.forward(ADMIN_EMAIL, { htmlBody: "<b>[ESCALATION]</b> Process manually: " + emailSubject });
      thread.addLabel(doneLabel);
      continue;
    }
    const recentMessages = messages.slice(-3);
    let threadHistoryText = "";
    recentMessages.forEach(m => { threadHistoryText += "\n[MESSAGE]:\n" + m.getPlainBody(); });
    const allAttachments = latestMsg.getAttachments().filter(a => a.getContentType().startsWith('image/'));
    const senderEmail = (latestMsg.getFrom().match(/<([^>]+)>/) ? latestMsg.getFrom().match(/<([^>]+)>/)[1] : latestMsg.getFrom()).trim().toLowerCase();

    let matchedTrucks = [];
    for (let i = 1; i < trucksData.length; i++) {
      if (trucksData[i][10] && trucksData[i][10].toLowerCase().includes(senderEmail)) { matchedTrucks.push({ name: trucksData[i][0], row: i+1 }); }
    }
    let matchedVenues = [];
    for (let i = 1; i < venuesData.length; i++) {
      if (venuesData[i][5] && venuesData[i][5].toLowerCase().includes(senderEmail)) { matchedVenues.push({ name: venuesData[i][0], village: venuesData[i][1], row: i+1 }); }
    }
    let currentScheduleContext = "No upcoming events found for this sender.";
    if (matchedTrucks.length > 0) {
      let upcoming = [];
      for (let i = 1; i < curEvs.length; i++) {
        const rowDateObj = parseEventDate(curEvs[i][0]);
        if (isNaN(rowDateObj.getTime())) continue;
        const rowDateStr = Utilities.formatDate(rowDateObj, tz, "yyyy-MM-dd");
        if (rowDateStr >= todayStr) {
          const rowTruckNorm = normalizeTruckKey(curEvs[i][3]);
          const isTruckMatch = matchedTrucks.some(t => {
            const normT = normalizeTruckKey(t.name);
            return isFuzzyMatch(normT, rowTruckNorm) || normT.includes(rowTruckNorm) || rowTruckNorm.includes(normT);
          });
          if (isTruckMatch) {
            let dStr = Utilities.formatDate(rowDateObj, tz, "dd/MM/yyyy");
            let sTime = normalizeTime(curEvs[i][1], tz);
            let eTime = normalizeTime(curEvs[i][2], tz);
            upcoming.push("- " + dStr + " (" + sTime + "-" + eTime + ") @ " + curEvs[i][4] + ", " + curEvs[i][5]);
          }
        }
      }
      if (upcoming.length > 0) {
        currentScheduleContext = upcoming.join("\n");
        logToSheet("Injected " + upcoming.length + " existing events as context for " + senderEmail, "INFO");
      }
    }
    try {
      logToSheet("Calling Gemini AI to analyze email: " + emailSubject, "INFO");
      const geminiData = analyzeEmailWithGemini(threadHistoryText, allAttachments, functionStartTime, currentScheduleContext);

      let extracted = [];
      let exclusionsToAdd = [];

      if (geminiData) {
        if (geminiData.updates) {
          extracted = geminiData.updates;
        } else if (geminiData.events) {
          extracted = geminiData.events.map(e => { e.Action = "AMEND"; return e; });
        } else if (Array.isArray(geminiData)) {
          extracted = geminiData.map(e => { e.Action = "AMEND"; return e; });
        }
        exclusionsToAdd = geminiData.exclusionsToAdd || [];
      }
      if (exclusionsToAdd.length > 0) {
        const exclSheet = ss.getSheetByName("Exclusions");
        if (exclSheet) {
          exclusionsToAdd.forEach(ex => {
            if (ex && typeof ex === 'string') {
              const cleanEx = normalizeTruckKey(ex);
              if (!Array.from(exclusions).some(existing => isFuzzyMatch(existing, cleanEx))) {
                exclSheet.appendRow([ex]);
                exclusions.add(cleanEx);
                logToSheet("Auto-Excluded non-truck entity: " + ex, "INFO");
                const tempEvs = eventsSheet.getDataRange().getValues();
                const retroRowsToDel = [];
                for (let i = tempEvs.length - 1; i >= 1; i--) {
                  if (isFuzzyMatch(normalizeTruckKey(tempEvs[i][3]), cleanEx)) {
                    retroRowsToDel.push(i + 1);
                  }
                }
                Array.from(new Set(retroRowsToDel)).sort((a,b)=>b-a).forEach(r => eventsSheet.deleteRow(r));
                curEvs = eventsSheet.getDataRange().getValues();
              }
            }
          });
        }
      }

      const validExtracted = extracted.filter(e => {
        const nt = normalizeTruckKey(e["Truck Name"]);
        return nt && !Array.from(exclusions).some(ex => isFuzzyMatch(ex, nt));
      });
      if (validExtracted.length === 0) {
        if (exclusionsToAdd.length === 0) {
          logToSheet("No valid events found in email: " + emailSubject, "WARN");
          thread.addLabel(noEventsLabel);
        } else {
          thread.addLabel(doneLabel);
        }
        continue;
      }
      const uniqueTruckNames = new Set(validExtracted.map(e => normalizeTruckKey(e["Truck Name"])));
      const isVenueSender = matchedVenues.length > 0 || (matchedTrucks.length === 0 && uniqueTruckNames.size > 1);
      const truckRowsToUpdate = new Set();
      const venueRowsToUpdate = new Set();
      const newlyAddedTrucks = new Map();
      const newlyAddedVenues = new Map();
      const finalUpdates = validExtracted.map(event => {
        let action = (event["Action"] || "AMEND").toUpperCase();
        if (action !== 'ADD' && action !== 'AMEND' && action !== 'CANCEL') action = 'AMEND';
        let eT = event["Truck Name"] || "Unknown Truck", eV = event["Venue Name"] || "TBC", eVi = event["Village"] || "TBC";
        const normT = normalizeTruckKey(eT);

        if (eV === "TBC" || eVi === "TBC" || eV === "" || eVi === "") {
          const existingMatch = curEvs.slice(1).find(r => {
            const rd = !isNaN(parseEventDate(r[0]).getTime()) ? Utilities.formatDate(parseEventDate(r[0]), tz, "dd/MM/yyyy") : "";
            return rd === event["DateStart"] && isFuzzyMatch(normalizeTruckKey(r[3]), normT);
          });
          if (existingMatch) {
            if (eV === "TBC" || eV === "") eV = String(existingMatch[4]).trim();
            if (eVi === "TBC" || eVi === "") eVi = String(existingMatch[5]).trim();
          }
        }
        const normV = normalizeTruckKey(eV);
        const normEvi = normalizeTruckKey(eVi);
        let isNewT = true, isNewV = true;
        let tRow = -1, vRow = -1;
        for (let i = 1; i < trucksData.length; i++) {
          if (isFuzzyMatch(normalizeTruckKey(trucksData[i][0]), normT) || String(trucksData[i][17]).split(',').some(a => isFuzzyMatch(normalizeTruckKey(a), normT))) {
            eT = trucksData[i][0]; isNewT = false; tRow = i+1; break;
          }
        }
        if (isNewT && matchedTrucks.length === 1) {
          eT = matchedTrucks[0].name; isNewT = false; tRow = matchedTrucks[0].row;
        }
        for (let i = 1; i < venuesData.length; i++) {
          let dbVenueNorm = normalizeTruckKey(venuesData[i][0]);
          let dbVilNorm = normalizeTruckKey(venuesData[i][1]);
          let nameMatch = isFuzzyMatch(dbVenueNorm, normV) || [venuesData[i][13], venuesData[i][14], venuesData[i][15]].some(a => isFuzzyMatch(normalizeTruckKey(a), normV));
          if (nameMatch) {
            let villageMatch = false;
            if (normEvi !== "tbc" && normEvi !== "") {
              if (isFuzzyMatch(dbVilNorm, normEvi) || dbVilNorm.includes(normEvi) || normEvi.includes(dbVilNorm)) {
                villageMatch = true;
              }
            } else {
              if (dbVilNorm === "" || dbVilNorm === "tbc") villageMatch = true;
            }
            if (villageMatch) {
              eV = venuesData[i][0]; eVi = venuesData[i][1]; isNewV = false; vRow = i+1; break;
            }
          }
        }
        if (isNewV && matchedVenues.length === 1 && eV === "TBC") {
          eV = matchedVenues[0].name; eVi = matchedVenues[0].village; isNewV = false; vRow = matchedVenues[0].row;
        }
        if (action !== 'CANCEL') {
          if (tRow > -1) {
            truckRowsToUpdate.add(tRow);
          } else if (isNewT) {
            eT = toTitleCase(eT);
            if (!newlyAddedTrucks.has(normT)) {
              newlyAddedTrucks.set(normT, true);
              const newTruckRow = new Array(20).fill('');
              newTruckRow[0] = eT;
              if (!isVenueSender) newTruckRow[10] = senderEmail;
              newTruckRow[19] = 'Yes - New Truck';
              trucksSheet.appendRow(newTruckRow);
              trucksData.push(newTruckRow);
              logToSheet("Auto-Created New Truck Profile: " + eT, "INFO");
            }
          }
          if (vRow > -1) {
            venueRowsToUpdate.add(vRow);
          } else if (isNewV && eV && eV !== "TBC") {
            eV = toTitleCase(eV);
            eVi = toTitleCase(eVi !== "TBC" ? eVi : "");
            if (!newlyAddedVenues.has(normV + normEvi)) {
              newlyAddedVenues.set(normV + normEvi, true);
              let vLat = "", vLng = "";
              try {
                const geoUrl = "https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(eV + ", " + eVi + ", UK") + "&key=" + GOOGLE_API_KEY;
                const geoRes = JSON.parse(UrlFetchApp.fetch(geoUrl, { muteHttpExceptions: true }).getContentText());
                if (geoRes.status === "OK" && geoRes.results.length > 0) {
                  vLat = geoRes.results[0].geometry.location.lat; vLng = geoRes.results[0].geometry.location.lng;
                }
              } catch (e) {}
              const newVenueRow = new Array(15).fill('');
              newVenueRow[0] = eV; newVenueRow[1] = eVi; newVenueRow[3] = vLat; newVenueRow[4] = vLng;
              venuesSheet.appendRow(newVenueRow); venuesData.push(newVenueRow);
              logToSheet("Auto-Created & Geocoded New Venue: " + eV + " (" + eVi + ")", "INFO");
            }
          }
        }
        return { action: action, date: event["DateStart"], start: event["TimeStart"], end: event["TimeEnd"], truck: eT, venue: eV, village: eVi, isNewT: isNewT, isNewV: isNewV };
      });
      if (!isVenueSender) {
        truckRowsToUpdate.forEach(row => { let cur = trucksSheet.getRange(row, 11).getValue(); if(!String(cur).toLowerCase().includes(senderEmail)) trucksSheet.getRange(row, 11).setValue(cur ? cur + ", " + senderEmail : senderEmail); });
      } else {
        venueRowsToUpdate.forEach(row => { let cur = venuesSheet.getRange(row, 6).getValue(); if(!String(cur).toLowerCase().includes(senderEmail)) venuesSheet.getRange(row, 6).setValue(cur ? cur + ", " + senderEmail : senderEmail); });
      }
      const rowsToDel = new Set();
      const rowsToAppend = [];
      let tableRows = "";
      const strike = function(txt) { return '<span style="text-decoration:line-through;color:#ef4444;">' + txt + '</span>'; };
      finalUpdates.forEach(fu => {
        let foundOld = null;
        for (let i = curEvs.length - 1; i >= 1; i--) {
          const rd = !isNaN(parseEventDate(curEvs[i][0]).getTime()) ? Utilities.formatDate(parseEventDate(curEvs[i][0]), tz, "dd/MM/yyyy") : "";
          const rowTruck = normalizeTruckKey(curEvs[i][3]);
          const rowVenue = normalizeTruckKey(curEvs[i][4]);
          const rowVillage = normalizeTruckKey(curEvs[i][5]);
          const fuTruck = normalizeTruckKey(fu.truck);
          const fuVenue = normalizeTruckKey(fu.venue);
          const fuVillage = normalizeTruckKey(fu.village);
          const isSameDate = (fu.date === rd);
          const isSameTruck = (fuTruck === rowTruck || fuTruck.includes(rowTruck) || rowTruck.includes(fuTruck));
          if (isSameDate && isSameTruck) {
            const isSameVenue = (fuVenue === rowVenue || fuVenue.includes(rowVenue) || rowVenue.includes(fuVenue));
            const isSameVillage = (fuVillage === rowVillage || fuVillage === "" || rowVillage === "");
            if (isSameVenue && isSameVillage) {
              rowsToDel.add(i + 1);
              foundOld = { start: normalizeTime(curEvs[i][1], tz), end: normalizeTime(curEvs[i][2], tz), venue: String(curEvs[i][4]).trim() };
            } else if (fu.action === 'AMEND' && (fuVenue === "tbc" || fuVenue === "")) {
              rowsToDel.add(i + 1);
              foundOld = { start: normalizeTime(curEvs[i][1], tz), end: normalizeTime(curEvs[i][2], tz), venue: String(curEvs[i][4]).trim() };
              fu.venue = String(curEvs[i][4]).trim();
              fu.village = String(curEvs[i][5]).trim();
            }
          }
        }
        let dS = normalizeTime(fu.start, tz);
        let dE = normalizeTime(fu.end, tz);
        let dV = fu.venue;
        const friendlyDate = formatFriendlyDate(fu.date);
        const truckDisplay = fu.isNewT ? (fu.truck + " *") : fu.truck;
        if (fu.action === 'CANCEL') {
          if (isVenueSender) {
            tableRows += "<tr><td style='padding:8px;border:1px solid #cbd5e1;white-space:nowrap;'>" + strike(friendlyDate) + "</td><td style='padding:8px;border:1px solid #cbd5e1;'>" + strike(dS) + "</td><td style='padding:8px;border:1px solid #cbd5e1;'>" + strike(dE) + "</td><td style='padding:8px;border:1px solid #cbd5e1;'>" + strike(truckDisplay) + "</td></tr>";
          } else {
            tableRows += "<tr><td style='padding:8px;border:1px solid #cbd5e1;white-space:nowrap;'>" + strike(friendlyDate) + "</td><td style='padding:8px;border:1px solid #cbd5e1;'>" + strike(dS) + "</td><td style='padding:8px;border:1px solid #cbd5e1;'>" + strike(dE) + "</td><td style='padding:8px;border:1px solid #cbd5e1;'>" + strike(dV) + "</td><td style='padding:8px;border:1px solid #cbd5e1;'>" + strike(fu.village) + "</td></tr>";
          }
        } else {
          if (foundOld) {
            if (foundOld.start !== dS) dS = "<b>" + dS + "</b>";
            if (foundOld.end !== dE) dE = "<b>" + dE + "</b>";
            if (foundOld.venue.toLowerCase() !== fu.venue.toLowerCase()) dV = "<b>" + fu.venue + "</b>";
          }
          if (isVenueSender) {
            tableRows += "<tr><td style='padding:8px;border:1px solid #cbd5e1;white-space:nowrap;'>" + friendlyDate + "</td><td style='padding:8px;border:1px solid #cbd5e1;'>" + dS + "</td><td style='padding:8px;border:1px solid #cbd5e1;'>" + dE + "</td><td style='padding:8px;border:1px solid #cbd5e1;'>" + truckDisplay + "</td></tr>";
          } else {
            tableRows += "<tr><td style='padding:8px;border:1px solid #cbd5e1;white-space:nowrap;'>" + friendlyDate + "</td><td style='padding:8px;border:1px solid #cbd5e1;'>" + dS + "</td><td style='padding:8px;border:1px solid #cbd5e1;'>" + dE + "</td><td style='padding:8px;border:1px solid #cbd5e1;'>" + dV + "</td><td style='padding:8px;border:1px solid #cbd5e1;'>" + fu.village + "</td></tr>";
          }
          rowsToAppend.push([fu.date, normalizeTime(fu.start, tz), normalizeTime(fu.end, tz), fu.truck, fu.venue, fu.village, "", "Email Scheduler", "[✉️ Email] | [" + fu.action + "]" + (fu.isNewT ? " | [⚠️ NEW TRUCK]" : "")]);
        }
      });
      Array.from(rowsToDel).sort((a,b)=>b-a).forEach(r => eventsSheet.deleteRow(r));
      if (rowsToAppend.length > 0) {
        eventsSheet.getRange(eventsSheet.getLastRow() + 1, 1, rowsToAppend.length, 9).setValues(rowsToAppend);
        mirrorEventsToSupabase(rowsToAppend);
      }
      const headers = isVenueSender ? "<th>Date</th><th>Start</th><th>End</th><th>Food Truck</th>" : "<th>Date</th><th>Start</th><th>End</th><th>Venue</th><th>Village</th>";
      let profileLink = "";
      if (matchedTrucks.length === 1) {
        const tSlug = matchedTrucks[0].name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        profileLink = "<p>You can see your full schedule here: <a href='" + BASE_URL + "/trucks/" + tSlug + "' style='color:#0369a1;font-weight:bold;'>" + matchedTrucks[0].name + "</a></p>";
      } else if (matchedVenues.length === 1) {
        const vSlug = (matchedVenues[0].name + "-" + matchedVenues[0].village).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        profileLink = "<p>You can see your full schedule here: <a href='" + BASE_URL + "/venues/" + vSlug + "' style='color:#0369a1;font-weight:bold;'>" + matchedVenues[0].name + "</a></p>";
      } else if (!isVenueSender && finalUpdates.length > 0 && !finalUpdates[0].isNewT) {
        const tSlug = finalUpdates[0].truck.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        profileLink = "<p>You can see your full schedule here: <a href='" + BASE_URL + "/trucks/" + tSlug + "' style='color:#0369a1;font-weight:bold;'>" + finalUpdates[0].truck + "</a></p>";
      } else if (isVenueSender && finalUpdates.length > 0 && !finalUpdates[0].isNewV && finalUpdates[0].venue !== "TBC") {
        const vSlug = (finalUpdates[0].venue + "-" + finalUpdates[0].village).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        profileLink = "<p>You can see your full schedule here: <a href='" + BASE_URL + "/venues/" + vSlug + "' style='color:#0369a1;font-weight:bold;'>" + finalUpdates[0].venue + "</a></p>";
      }
      const replyHtml = "<div style='font-family:Arial,sans-serif;color:#334155;'>" +
        "Hi,<br><br>" +
        "Your schedule has been updated with the following changes:<br><br>" +
        "<table style='border-collapse:collapse;width:100%;margin-bottom:20px;text-align:left;'>" +
        "<thead><tr style='background-color:#f1f5f9;'>" + headers + "</tr></thead>" +
        "<tbody>" + (tableRows || "<tr><td colspan='5' style='padding:8px;border:1px solid #cbd5e1;text-align:center;'>No changes detected.</td></tr>") + "</tbody>" +
        "</table>" +
        profileLink +
        "<p style='font-size:12px;color:#64748b;'><i>* New trucks appear on the website once they have been verified by our team.</i></p>" +
        "<p style='font-weight:bold;'>Reply directly to this email with any changes!</p>" +
        "<hr style='border:none;border-top:1px solid #e2e8f0;margin:20px 0;'>" +
        "<p style='font-size:11px;color:#94a3b8;'>This update was auto-generated by our AI assistant and this inbox is not actively monitored. If you are having problems or have any questions, please email <a href='mailto:hello@villagefoodie.co.uk' style='color:#0369a1;'>hello@villagefoodie.co.uk</a>.</p>" +
        "<p>Cheers,<br>- Village Foodie</p>" +
        "</div>";
      sendBrevoReply(senderEmail, emailSubject, replyHtml);
      thread.addLabel(doneLabel);
      logToSheet("Successfully processed email: " + emailSubject + " (" + finalUpdates.length + " changes applied).", "SUCCESS");
    } catch (e) {
      if (e.message.includes('bandwidth quota exceeded')) {
        logToSheet("Daily API limit reached while processing email: " + emailSubject, "WARN");
        latestMsg.forward(ADMIN_EMAIL, { htmlBody: "⚠️ <b>DAILY DATA LIMIT REACHED</b><br>Google hit the 100MB daily limit. Processing paused until quota resets." });
        thread.addLabel(doneLabel);
      } else if (e.message.includes('demand') || e.message.includes('quota') || e.message.includes('limit') || e.message.includes('TIME_LIMIT')) {
        logToSheet("API busy while processing: " + emailSubject + ". Left in queue to retry.", "WARN");
        thread.addLabel(retryLabel);
      } else {
        logToSheet("Error processing email '" + emailSubject + "': " + e.message, "ERROR");
        latestMsg.forward(ADMIN_EMAIL, { htmlBody: "⚠️ <b>Error</b>: " + e.message });
        thread.addLabel(doneLabel);
      }
    }
  }
}

function analyzeEmailWithGemini(body, attachments, startTime, currentScheduleContext) {
  currentScheduleContext = currentScheduleContext || "";
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY;
  const today = new Date();
  const currentYear = today.getFullYear();
  const nextYear = currentYear + 1;

  const prompt = "CRITICAL CONTEXT: Today is " + today.toDateString() + ".\n" +
    "TASK: You are a schedule updater and data cleaner.\n" +
    "DATE RULES: If the year is not explicitly stated, assume " + currentYear + ". If the current month is December and the scheduled event is in January, you MUST use " + nextYear + ". If a schedule only lists days of the week (e.g., 'Wednesday', 'Thursday'), map them to the exact DD/MM/YYYY dates for the CURRENT week based on Today's Date.\n" +
    "CURRENT SCHEDULE ON FILE FOR SENDER:\n" + (currentScheduleContext || "None") + "\n" +
    "1. Read the LATEST email message to figure out what needs to change.\n" +
    "2. Determine the specific actions required: ADD a new event, AMEND an existing event (e.g. time/venue change), or CANCEL an event.\n" +
    "3. Use the 'CURRENT SCHEDULE' to fill in missing details (like Venue) if they say 'change tomorrow' or 'cancel Friday'.\n" +
    "4. Output ONLY the events that need to be added, amended, or cancelled. Do NOT output events that are not changing.\n" +
    "5. Look for explicit mentions that something is NOT a food truck (e.g. \"Live Music is not a truck\"). Extract those names into the 'exclusionsToAdd' list.\n" +
    "Date format MUST be \"DD/MM/YYYY\". Times MUST be \"HH:MM\". If no time is explicitly listed, leave TimeStart and TimeEnd as empty strings \"\". Do NOT use \"00:00\".\n\n" +
    "JSON FORMAT ONLY:\n" +
    "{\n" +
    "  \"updates\": [{ \"Action\": \"ADD|AMEND|CANCEL\", \"DateStart\": \"DD/MM/YYYY\", \"TimeStart\": \"HH:MM\", \"TimeEnd\": \"HH:MM\", \"Truck Name\": \"Name\", \"Venue Name\": \"Name\", \"Village\": \"Town\" }],\n" +
    "  \"exclusionsToAdd\": [\"Name of non-truck\"]\n" +
    "}\n\n" +
    "THREAD HISTORY: \"\"\"" + body.substring(0, 5000) + "\"\"\"";

  const uniqueImgs = [];
  const seenSizes = new Set();
  attachments.forEach(img => {
    const size = img.getSize();
    if (!seenSizes.has(size) && size < 3670016 && uniqueImgs.length < 1) {
      uniqueImgs.push(img); seenSizes.add(size);
    }
  });
  const contents = [{ "parts": [{ "text": prompt }].concat(uniqueImgs.map(a => ({ "inlineData": { "mimeType": a.getContentType(), "data": Utilities.base64Encode(a.getBytes()) } }))) }];
  const options = { method: "post", contentType: "application/json", payload: JSON.stringify({ contents: contents, generationConfig: { temperature: 0, responseMimeType: "application/json" } }), muteHttpExceptions: true };

  let wait = 5000;
  for (let i = 1; i <= 8; i++) {
    if (Date.now() - startTime > 180000) throw new Error("TIME_LIMIT");
    try {
      const response = UrlFetchApp.fetch(url, options);
      const res = JSON.parse(response.getContentText());
      if (res.error) {
        if (res.error.code === 429) {
          logToSheet("API Busy (Code 429). Waiting " + (wait/1000) + " seconds before retry.", "WARN");
          Utilities.sleep(wait); wait += 5000; continue;
        }
        throw new Error(res.error.message);
      }
      return JSON.parse(cleanGeminiResponse(res.candidates[0].content.parts[0].text));
    } catch (fetchErr) {
      if (fetchErr.message.includes('Bandwidth quota exceeded') && uniqueImgs.length > 0) {
        logToSheet("Bandwidth quota exceeded with images. Retrying with text-only prompt.", "WARN");
        const textOnlyPayload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } };
        const textRes = JSON.parse(UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(textOnlyPayload), muteHttpExceptions: true }).getContentText());
        if (!textRes.error) return JSON.parse(cleanGeminiResponse(textRes.candidates[0].content.parts[0].text));
      }
      throw fetchErr;
    }
  }
  throw new Error("demand");
}

function processFoodTruckScreenshots() {
  logToSheet("Started processing Google Drive screenshots.", "INFO");
  SpreadsheetApp.flush();

  const functionStartTime = Date.now();
  const TIME_LIMIT = 280000;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = DriveApp.getFolderById(SOURCE_FOLDER_ID);
  const eventsSheet = ss.getSheetByName("Events");
  const trucksSheet = ss.getSheetByName("Trucks");
  const venuesSheet = ss.getSheetByName("Venues");

  const exclusions = getExclusions();
  const trucksData = trucksSheet.getDataRange().getValues();
  const venuesData = venuesSheet.getDataRange().getValues();
  const files = src.getFiles();
  const newlyAddedTrucks = new Map();
  const newlyAddedVenues = new Map();

  const today = new Date();
  const currentYear = today.getFullYear();
  const nextYear = currentYear + 1;
  let fileCount = 0;
  const weekDates = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
    weekDates.push(dayName + ' = ' + dd + '/' + mm + '/' + yyyy);
  }
  const weekMapping = weekDates.join('\n');

  while (files.hasNext()) {
    if (Date.now() - functionStartTime > TIME_LIMIT) {
      logToSheet("Time limit reached. Pausing safely. Run the script again to process the remaining images.", "WARN");
      SpreadsheetApp.flush();
      break;
    }
    const file = files.next();
    fileCount++;
    try {
      logToSheet("Found file: " + file.getName() + " (Size: " + file.getSize() + " bytes). Calling Gemini...", "INFO");
      SpreadsheetApp.flush();

      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY;

      const prompt = "CRITICAL CONTEXT: Today is " + today.toDateString() + ".\n" +
        "Extract the food truck schedule from this image.\n\n" +
        "THIS WEEK AND NEXT WEEK DATE REFERENCE — use ONLY these exact dates when you see a day name:\n" +
        weekMapping + "\n\n" +
        "CRITICAL DATE RULES:\n" +
        "- ALWAYS use the exact DD/MM/YYYY from the reference above when you see a day name like 'Monday', 'Tuesday' etc.\n" +
        "- The current year is " + currentYear + ". Never output 2023, 2024, or 2025.\n" +
        "- If a date is written explicitly (e.g. '3rd June') convert it to DD/MM/YYYY using the year " + currentYear + ".\n" +
        "- If no time is listed, use empty string \"\". Never use \"00:00\".\n" +
        "- IMPORTANT: If a venue or day shows as 'Closed', 'N/A', 'TBC', 'No event', 'Unavailable' or similar — skip it entirely. Do not include it in the output.\n\n" +
        "Date format MUST be \"DD/MM/YYYY\". Times MUST be \"HH:MM\".\n\n" +
        "JSON FORMAT ONLY — no markdown, no explanation:\n" +
        "{\n" +
        "  \"events\": [{ \"DateStart\": \"DD/MM/YYYY\", \"TimeStart\": \"HH:MM\", \"TimeEnd\": \"HH:MM\", \"Truck Name\": \"Name\", \"Venue Name\": \"Name\", \"Village\": \"Town\" }]\n" +
        "}";
      const payload = {
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: file.getMimeType(), data: Utilities.base64Encode(file.getBlob().getBytes()) } }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" }
      };

      const options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true };

      let resData = null;
      let success = false;
      let wait = 15000;

      for (let i = 1; i <= 5; i++) {
        const response = UrlFetchApp.fetch(url, options);
        const res = JSON.parse(response.getContentText());
        if (res.error) {
          if (res.error.code === 429 || res.error.code === 503) {
            logToSheet("API Busy (Code " + res.error.code + "). Gemini rate limit hit. Waiting " + (wait/1000) + "s...", "WARN");
            SpreadsheetApp.flush();
            Utilities.sleep(wait);
            wait += 15000;
            continue;
          }
          throw new Error(res.error.message);
        }
        resData = res;
        success = true;
        break;
      }

      if (!success) {
        logToSheet("Failed to process " + file.getName() + " after 5 retries. Left in Drive folder.", "ERROR");
        SpreadsheetApp.flush();
        continue;
      }
      if (!resData.candidates || resData.candidates.length === 0) {
        throw new Error("Gemini returned empty response. The image may have triggered AI safety filters.");
      }
      let events = JSON.parse(cleanGeminiResponse(resData.candidates[0].content.parts[0].text));
      if (!Array.isArray(events) && events.events) events = events.events;

      const invalidVenueNames = ["closed", "n/a", "tba", "tbc", "unavailable", "cancelled", "no event", "no service", "none"];
      const validEvents = events.filter(e => {
        if (!e["Truck Name"]) return false;
        if (Array.from(exclusions).some(ex => isFuzzyMatch(ex, normalizeTruckKey(e["Truck Name"])))) return false;
        const venue = (e["Venue Name"] || "").toLowerCase().trim();
        if (!venue) return false;
        if (invalidVenueNames.some(iv => venue === iv || venue.startsWith(iv))) return false;
        return true;
      });

      if (validEvents.length > 0) {
        const finalRows = [];
        for (const e of validEvents) {
          let eT = e["Truck Name"];
          const normT = normalizeTruckKey(eT);
          let isNewT = true;
          for (let i = 1; i < trucksData.length; i++) {
            if (isFuzzyMatch(normalizeTruckKey(trucksData[i][0]), normT) || String(trucksData[i][17]).split(',').some(a => isFuzzyMatch(normalizeTruckKey(a), normT))) {
              eT = trucksData[i][0];
              isNewT = false;
              break;
            }
          }
          if (isNewT) {
            eT = toTitleCase(eT);
            if (!newlyAddedTrucks.has(normT)) {
              newlyAddedTrucks.set(normT, true);
              const newTruckRow = new Array(20).fill('');
              newTruckRow[0] = eT;
              newTruckRow[19] = 'Yes - New Truck';
              trucksSheet.appendRow(newTruckRow);
              trucksData.push(newTruckRow);
              logToSheet("Auto-Created New Truck Profile from Screenshot: " + eT, "INFO");
              SpreadsheetApp.flush();
            }
          }
          let eV = e["Venue Name"] || "TBC";
          let eVi = e["Village"] || "TBC";
          const normV = normalizeTruckKey(eV);
          const normEvi = normalizeTruckKey(eVi);
          let isNewV = true;
          for (let i = 1; i < venuesData.length; i++) {
            let dbVenueNorm = normalizeTruckKey(venuesData[i][0]);
            let dbVilNorm = normalizeTruckKey(venuesData[i][1]);
            let nameMatch = isFuzzyMatch(dbVenueNorm, normV) || [venuesData[i][13], venuesData[i][14], venuesData[i][15]].some(a => isFuzzyMatch(normalizeTruckKey(a), normV));
            if (nameMatch) {
              let villageMatch = false;
              if (normEvi !== "tbc" && normEvi !== "") {
                if (isFuzzyMatch(dbVilNorm, normEvi) || dbVilNorm.includes(normEvi) || normEvi.includes(dbVilNorm)) {
                  villageMatch = true;
                }
              } else {
                if (dbVilNorm === "" || dbVilNorm === "tbc") {
                  villageMatch = true;
                }
              }
              if (villageMatch) {
                eV = venuesData[i][0];
                eVi = venuesData[i][1];
                isNewV = false;
                break;
              }
            }
          }
          if (isNewV && eV && eV !== "TBC") {
            eV = toTitleCase(eV);
            eVi = toTitleCase(eVi !== "TBC" ? eVi : "");
            if (!newlyAddedVenues.has(normV + normEvi)) {
              newlyAddedVenues.set(normV + normEvi, true);
              let vLat = "", vLng = "";
              try {
                const geoUrl = "https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(eV + ", " + eVi + ", UK") + "&key=" + GOOGLE_API_KEY;
                const geoRes = JSON.parse(UrlFetchApp.fetch(geoUrl, { muteHttpExceptions: true }).getContentText());
                if (geoRes.status === "OK" && geoRes.results.length > 0) {
                  vLat = geoRes.results[0].geometry.location.lat;
                  vLng = geoRes.results[0].geometry.location.lng;
                }
              } catch (e) {}
              const newVenueRow = new Array(15).fill('');
              newVenueRow[0] = eV;
              newVenueRow[1] = eVi;
              newVenueRow[3] = vLat;
              newVenueRow[4] = vLng;
              venuesSheet.appendRow(newVenueRow);
              venuesData.push(newVenueRow);
              logToSheet("Auto-Created & Geocoded New Venue from Screenshot: " + eV + " (" + eVi + ")", "INFO");
              SpreadsheetApp.flush();
            }
          }
          finalRows.push([e["DateStart"], e["TimeStart"], e["TimeEnd"], eT, eV, eVi, "", "Drive Screenshot", "[📱 Drive]" + (isNewT ? " | [⚠️ NEW TRUCK]" : "")]);
        }
        eventsSheet.getRange(eventsSheet.getLastRow()+1, 1, finalRows.length, 9).setValues(finalRows);
        mirrorEventsToSupabase(finalRows);
        logToSheet("Successfully extracted " + finalRows.length + " events from " + file.getName() + ". File trashed.", "SUCCESS");
        SpreadsheetApp.flush();
      } else {
        logToSheet("No valid food truck events found in " + file.getName() + ". File trashed.", "WARN");
        SpreadsheetApp.flush();
      }
      file.setTrashed(true);
      Utilities.sleep(15000);
    } catch(e) {
      logToSheet("Fatal Error processing " + file.getName() + ": " + e.message, "ERROR");
      SpreadsheetApp.flush();
    }
  }
  if (fileCount === 0) {
    logToSheet("No screenshots found in Drive folder.", "INFO");
    SpreadsheetApp.flush();
  } else {
    logToSheet("Finished processing Drive screenshots.", "INFO");
    SpreadsheetApp.flush();
  }
}

// ==========================================
// 🚀 AUTO-GEOCODER
// ==========================================
function geocodeNewSubscribers() {
  logToSheet("Running Pre-Flight check on Subscriber postcodes...", "INFO");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const subsSheet = ss.getSheetByName("Subscribers");
  if (!subsSheet) return;
  const data = subsSheet.getDataRange().getValues();
  let updatedCount = 0;
  for (let i = 1; i < data.length; i++) {
    const postcode = String(data[i][3]).trim();
    const lat = data[i][8];
    const lng = data[i][9];
    if (postcode && (lat === "" || lng === "" || isNaN(lat) || isNaN(lng))) {
      try {
        const url = "https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(postcode + ", UK") + "&key=" + GOOGLE_API_KEY;
        const res = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
        if (res.status === "OK" && res.results.length > 0) {
          const location = res.results[0].geometry.location;
          let villageResult = "";
          for (const comp of res.results[0].address_components) {
            if (comp.types.includes("postal_town") || comp.types.includes("locality")) {
              villageResult = comp.long_name;
              break;
            }
          }
          subsSheet.getRange(i + 1, 9).setValue(location.lat);
          subsSheet.getRange(i + 1, 10).setValue(location.lng);
          if (villageResult) {
            subsSheet.getRange(i + 1, 11).setValue(villageResult);
          }
          updatedCount++;
        }
      } catch (e) {
        logToSheet("Geocoding failed for postcode: " + postcode, "ERROR");
      }
    }
  }
  if (updatedCount > 0) {
    logToSheet("Successfully geocoded " + updatedCount + " new subscriber(s).", "SUCCESS");
    SpreadsheetApp.flush();
  } else {
    logToSheet("All subscriber postcodes are fully mapped.", "INFO");
  }
}

// ==========================================
// 🚀 EMAIL BLAST ENGINE
// ==========================================
function runEmailJob(isTestMode) {
  logToSheet("Initiating Email Blast Engine (Test Mode: " + isTestMode + ").", "INFO");

  geocodeNewSubscribers();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const subsSheet = ss.getSheetByName("Subscribers");
  const trucksSheet = ss.getSheetByName("Trucks");
  const venuesSheet = ss.getSheetByName("Venues");

  let unsubSheet;
  try { unsubSheet = ss.getSheetByName("Unsubscribes"); } catch(e) {}
  const unsubscribedEmails = new Set();
  if (unsubSheet) {
    unsubSheet.getDataRange().getValues().slice(1).forEach(function(row) {
      if (row[3]) unsubscribedEmails.add(String(row[3]).toLowerCase().trim());
    });
  }

  const tz = ss.getSpreadsheetTimeZone();
  let ui;
  try { ui = SpreadsheetApp.getUi(); } catch(e) {}

  const today = new Date();
  const todayStr = Utilities.formatDate(today, tz, "yyyy-MM-dd");
  const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekEndStr = Utilities.formatDate(weekEnd, tz, "yyyy-MM-dd");

  // --- FETCH EVENTS FROM SUPABASE ---
  const SUPABASE_URL = PropertiesService.getScriptProperties().getProperty('SUPABASE_URL');
  const SUPABASE_ANON_KEY = PropertiesService.getScriptProperties().getProperty('SUPABASE_ANON_KEY');

  var upcomingEvents = [];
  try {
    var query = SUPABASE_URL + "/rest/v1/discovery_events" +
      "?select=event_date,start_time,end_time,truck_name,venue_name,village" +
      "&event_date=gte." + todayStr +
      "&event_date=lte." + weekEndStr +
      "&order=event_date.asc,start_time.asc";

    var res = UrlFetchApp.fetch(query, {
      method: "get",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY,
      },
      muteHttpExceptions: true,
    });

    var rows = JSON.parse(res.getContentText());
    if (!Array.isArray(rows)) throw new Error("Unexpected Supabase response: " + res.getContentText().substring(0, 200));

    // Map to array format: [event_date, start_time, end_time, truck_name, venue_name, village]
    upcomingEvents = rows.map(function(r) {
      return [r.event_date, r.start_time, r.end_time, r.truck_name, r.venue_name, r.village];
    });

    logToSheet("Fetched " + upcomingEvents.length + " events from Supabase (" + todayStr + " to " + weekEndStr + ").", "INFO");
  } catch(e) {
    logToSheet("FATAL: Could not fetch events from Supabase: " + e.message, "ERROR");
    if (ui) ui.alert("❌ Supabase Error", "Could not fetch events: " + e.message, ui.ButtonSet.OK);
    return;
  }
  // --- END SUPABASE FETCH ---

  const truckDetails = {};
  trucksSheet.getDataRange().getValues().slice(1).forEach(function(row) {
    const t = {
      primaryName: row[0],
      type: String(row[1]).trim(),
      photoUrl: formatEmailImageUrl(row[16], "photos"),
      logoUrl: formatEmailImageUrl(row[9], "logos"),
      exclude: String(row[19]).toLowerCase().trim(),
      isMeal: String(row[18]).toLowerCase().trim()
    };
    truckDetails[normalizeTruckKey(row[0])] = t;
    if (row[17]) row[17].toString().split(',').forEach(function(a) { truckDetails[normalizeTruckKey(a.trim())] = t; });
  });

  const venueDetailsList = venuesSheet.getDataRange().getValues().slice(1).map(function(row) {
    return {
      name: row[0],
      village: row[1],
      lat: row[3],
      long: row[4],
      normName: normalizeTruckKey(row[0]),
      normVil: normalizeTruckKey(row[1]),
      aliases: [row[13], row[14], row[15]].map(function(a) { return normalizeTruckKey(a); }).filter(function(a) { return a; })
    };
  });

  const validUpcomingEvents = [];
  const stats = { total: upcomingEvents.length, unmatchedTruck: 0, excluded: 0, notMeal: 0, noLogo: 0, unmatchedVenue: 0, noVenueCoords: 0, finalValid: 0 };
  const freqs = {};

  upcomingEvents.forEach(function(e) {
    const normKey = normalizeTruckKey(e[3]);
    const tInfo = truckDetails[normKey];
    if (!tInfo) { stats.unmatchedTruck++; return; }
    if (tInfo.exclude === 'yes' || tInfo.exclude === 'yes - new truck') { stats.excluded++; return; }
    if (tInfo.isMeal === 'no') { stats.notMeal++; return; }
    if (!tInfo.logoUrl) { stats.noLogo++; return; }

    const evName = normalizeTruckKey(e[4]);
    const evVil = normalizeTruckKey(e[5]);
    let vInfo = null;
    for (var vi = 0; vi < venueDetailsList.length; vi++) {
      const v = venueDetailsList[vi];
      const nameMatch = isFuzzyMatch(v.normName, evName) || v.aliases.some(function(a) { return isFuzzyMatch(a, evName); }) || v.normName === evName || evName.includes(v.normName);
      const vilMatch = (!evVil || evVil === 'tbc' || isFuzzyMatch(v.normVil, evVil) || v.normVil === evVil || evVil.includes(v.normVil) || v.normVil.includes(evVil));
      if (nameMatch && vilMatch) { vInfo = v; break; }
    }
    if (!vInfo) {
      for (var vi2 = 0; vi2 < venueDetailsList.length; vi2++) {
        const v2 = venueDetailsList[vi2];
        if (evName && (v2.normName === evName || v2.aliases.indexOf(evName) !== -1)) { vInfo = v2; break; }
      }
    }
    if (!vInfo) { stats.unmatchedVenue++; return; }
    if (vInfo.lat === "" || vInfo.long === "" || vInfo.lat == null || vInfo.long == null) { stats.noVenueCoords++; return; }

    stats.finalValid++;
    freqs[tInfo.primaryName] = (freqs[tInfo.primaryName] || 0) + 1;
    validUpcomingEvents.push({ raw: e, vInfo: vInfo, tInfo: tInfo });
  });

  const emailsToProcess = [];
  const testSubsLog = [];

  subsSheet.getDataRange().getValues().slice(1).forEach(function(sub) {
    const email = String(sub[7]).toLowerCase().trim();
    const prefDist = parseFloat(sub[6]) || 20;
    const subLat = parseFloat(sub[8]);
    const subLong = parseFloat(sub[9]);
    if (!email.includes("@")) return;
    if (unsubscribedEmails.has(email)) return;

    if (isTestMode && TEST_EMAILS.some(function(te) { return te.toLowerCase() === email; })) {
      let closestDist = 9999;
      validUpcomingEvents.forEach(function(ve) {
        const d = calculateDistance(subLat, subLong, parseFloat(ve.vInfo.lat), parseFloat(ve.vInfo.long));
        if (d < closestDist) closestDist = d;
      });
      if (!isNaN(subLat) && !isNaN(subLong)) {
        if (closestDist <= prefDist) {
          testSubsLog.push("🕵️ TEST EMAIL: " + email + " - MATCHED. Closest truck is " + closestDist.toFixed(1) + " miles away.");
        } else {
          testSubsLog.push("🕵️ TEST EMAIL: " + email + " - SKIPPED. Outside radius (closest is " + closestDist.toFixed(1) + " miles).");
        }
      } else {
        testSubsLog.push("🕵️ TEST EMAIL: " + email + " - ERROR. Invalid map coordinates.");
      }
    }

    if (isTestMode && !TEST_EMAILS.some(function(te) { return te.toLowerCase() === email; })) return;
    if (isNaN(subLat) || isNaN(subLong)) return;

    const matches = [];
    validUpcomingEvents.forEach(function(ve) {
      const d = calculateDistance(subLat, subLong, parseFloat(ve.vInfo.lat), parseFloat(ve.vInfo.long));
      if (d <= prefDist) {
        matches.push({ raw: ve.raw, vInfo: ve.vInfo, tInfo: ve.tInfo, dist: d });
      }
    });
    if (matches.length > 0) {
      matches.sort(function(a,b) { return parseEventDate(a.raw[0]) - parseEventDate(b.raw[0]) || getMinutesSinceMidnight(a.raw[1]) - getMinutesSinceMidnight(b.raw[1]); });
      emailsToProcess.push({ email: email, matches: matches, prefDist: prefDist, village: sub[10], postcode: sub[3] });
    }
  });

  if (emailsToProcess.length === 0) {
    let diagnosticMessage = "We checked " + stats.total + " upcoming events this week:\n\n" +
      "❌ " + stats.excluded + " skipped (Marked 'Yes' or 'New Truck')\n" +
      "❌ " + stats.noLogo + " skipped (Missing Logo URL in Trucks tab)\n" +
      "❌ " + stats.unmatchedVenue + " skipped (Venue name/village did not match DB exactly)\n" +
      "❌ " + stats.noVenueCoords + " skipped (Venue legitimately missing map coordinates)\n" +
      "❌ " + stats.notMeal + " skipped (Not a meal)\n" +
      "❌ " + stats.unmatchedTruck + " skipped (Truck name not found in DB)\n\n" +
      "✅ " + stats.finalValid + " valid events remain.\n";
    if (isTestMode && testSubsLog.length > 0) {
      diagnosticMessage += "\n--- TEST SUBSCRIBER X-RAY ---\n\n" + testSubsLog.join('\n\n');
    }
    logToSheet("Engine aborted. No emails generated based on distance data.", "WARN");
    if (ui) ui.alert("⚠️ No Emails Generated", diagnosticMessage, ui.ButtonSet.OK);
    return;
  }

  if (isTestMode) {
    if (ui) {
      const response = ui.alert("📨 Send Test Emails?", "Found valid events for " + emailsToProcess.length + " test subscriber(s).\n\nDo you want to send the test blast now?", ui.ButtonSet.YES_NO);
      if (response !== ui.Button.YES) {
        logToSheet("Test blast aborted by user.", "INFO");
        return;
      }
    }
  }

  logToSheet("Blasting emails to " + emailsToProcess.length + " subscribers...", "INFO");
  emailsToProcess.forEach(function(job) {
    var subjectLine = "🚚 Don't Fancy Cooking? " + job.matches.length + " Food Trucks near you this week!";
    sendBrevoBlast(job.email, subjectLine, buildHtmlEmail(job.matches, job.prefDist, job.village, job.postcode, tz, freqs));
  });
  logToSheet("Successfully delivered " + emailsToProcess.length + " email(s).", "SUCCESS");
  if (ui) ui.alert("✅ Success", "Successfully sent " + emailsToProcess.length + " email(s).", ui.ButtonSet.OK);
}

function buildHtmlEmail(matches, miles, village, postcode, tz, freqs) {
  var logoUrl = formatEmailImageUrl(SITE_LOGO_FILENAME, 'logos');
  var html = '<!DOCTYPE html><html><body style="margin:0;padding:0;background-color:#f8fafc;font-family:Arial,sans-serif;">';
  html += '<div style="max-width:600px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;">';
  html += '<div style="background-color:#0f172a;padding:15px 10px 15px 10px;text-align:center;border-bottom:4px solid #ea580c;">';
  html += '<img src="' + logoUrl + '" width="200" style="margin-bottom:8px;display:inline-block;"/>';
  html += '<h1 style="color:#eaddc6;font-size:18px;margin:0;font-weight:bold;">This week\'s street food lineup within ' + miles + ' miles of ' + (village || postcode || 'your area') + '</h1>';
  html += '</div>';
  html += '<div style="padding: 10px;">';
  var groups = {};
  matches.forEach(function(m) {
    var dStr = Utilities.formatDate(parseEventDate(m.raw[0]), tz, 'EEEE, d MMMM').toUpperCase();
    if (!groups[dStr]) groups[dStr] = [];
    groups[dStr].push(m);
  });
  for (var date in groups) {
    html += '<h2 style="font-size:15px;color:#334155;border-bottom:1px solid #e2e8f0;padding-bottom:5px;margin-top:25px;margin-bottom:15px;">' + date + '</h2>';
    var uniqueTrucks = [];
    var seenTrucks = {};
    groups[date].sort(function(a,b) { return freqs[a.tInfo.primaryName] - freqs[b.tInfo.primaryName]; }).forEach(function(m) {
      var tName = m.tInfo.primaryName;
      if (!seenTrucks[tName]) { seenTrucks[tName] = []; uniqueTrucks.push(tName); }
      seenTrucks[tName].push(m);
    });
    uniqueTrucks.forEach(function(tName) {
      var truckEvents = seenTrucks[tName];
      truckEvents.sort(function(a,b) { return getMinutesSinceMidnight(a.raw[1]) - getMinutesSinceMidnight(b.raw[1]); });
      var tLogo = truckEvents[0].tInfo.logoUrl;
      var tPhoto = truckEvents[0].tInfo.photoUrl;
      var tType = truckEvents[0].tInfo.type;
      var isMultiStop = truckEvents.length > 1;
      var stops = [];
      truckEvents.forEach(function(event) {
        var vName = event.vInfo.name;
        var vVil = event.vInfo.village;
        var tStart = normalizeTime(event.raw[1], tz);
        var tEnd = normalizeTime(event.raw[2], tz);
        var locStr = "<strong>" + vName + "</strong>";
        if (vVil && vName.toLowerCase().indexOf(vVil.toLowerCase()) === -1) { locStr += " - " + vVil; }
        if (isMultiStop) {
          stops.push(locStr + " (" + tStart + " - " + tEnd + ")");
        } else {
          stops.push(locStr + " from " + tStart + " - " + tEnd);
        }
      });
      var venueString = stops.join(" & ");
      var rawDate = truckEvents[0].raw[0];
      var dObj = parseEventDate(rawDate);
      var dd = String(dObj.getDate()).padStart(2, '0');
      var mm = String(dObj.getMonth() + 1).padStart(2, '0');
      var yyyy = dObj.getFullYear();
      var baseAnchor = (tName + "-" + truckEvents[0].vInfo.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      baseAnchor = baseAnchor.replace(/-+$/, '');
      var finalAnchor = baseAnchor + "-" + dd + "-" + mm + "-" + yyyy;
      var eventLink = BASE_URL + "/#" + finalAnchor;
      html += '<a href="' + eventLink + '" style="text-decoration:none;"><div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:12px;">';
      html += '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>';
      html += '<td width="55" valign="middle" style="padding-right:12px;">';
      if (tLogo) { html += '<img src="' + tLogo + '" width="50" height="50" style="border-radius:50%;object-fit:cover;display:block;border:1px solid #f1f5f9;"/>'; }
      html += '</td>';
      html += '<td valign="middle" style="font-size:15px;color:#334155;line-height:1.4;">';
      html += '<strong style="color:#0f172a;">' + tName + '</strong> is at ' + venueString;
      html += '</td>';
      html += '<td width="95" valign="middle" align="right" style="padding-left:12px;">';
      if (tPhoto) {
        html += '<img src="' + tPhoto + '" width="85" height="60" style="border-radius:6px;object-fit:cover;display:block;margin-left:auto;"/>';
      } else if (tType) {
        html += '<span style="font-size:13px;color:#64748b;font-style:italic;display:block;text-align:right;">' + tType + '</span>';
      }
      html += '</td>';
      html += '</tr></table>';
      html += '</div></a>';
    });
  }
  html += '</div>';
  html += '<div style="text-align:center;padding:20px 10px 30px 10px;background-color:#ffffff;">';
  html += '<a href="' + BASE_URL + '" style="background:#ea580c;color:white;padding:15px 30px;text-decoration:none;border-radius:30px;font-weight:bold;font-size:16px;display:inline-block;">View Full Map & Menu Details 🗺️</a>';
  html += '</div>';
  html += '<div style="background-color:#0f172a;padding:30px 20px;text-align:center;color:#94a3b8;font-size:12px;">';
  html += '<p style="color:#f8fafc;font-size:15px;font-weight:bold;margin:0 0 10px 0;">Never miss a slice 🍕</p>';
  html += '<p style="margin:0 0 20px 0;line-height:1.5;">Schedules are subject to change by vendors. Please check the<br>website before traveling.</p>';
  html += '<p style="margin:0;"><a href="' + BASE_URL + '" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a> &nbsp;|&nbsp; <a href="mailto:hello@villagefoodie.co.uk" style="color:#94a3b8;text-decoration:underline;">Contact Us</a></p>';
  html += '</div>';
  html += '</div></body></html>';
  return html;
}

function sendBrevoBlast(toEmail, subject, body) {
  const options = {
    method: "post",
    headers: { "accept": "application/json", "api-key": BREVO_API_KEY, "content-type": "application/json" },
    payload: JSON.stringify({
      sender: { name: "Village Foodie", email: SENDER_ALIAS },
      to: [{ email: toEmail }],
      replyTo: { email: REPLY_TO_EMAIL },
      subject: subject,
      htmlContent: body
    }),
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch("https://api.brevo.com/v3/smtp/email", options);
}

function sendBrevoReply(toEmail, subject, body) {
  const options = {
    method: "post",
    headers: { "accept": "application/json", "api-key": BREVO_API_KEY, "content-type": "application/json" },
    payload: JSON.stringify({
      sender: { name: "Village Foodie", email: SENDER_ALIAS },
      to: [{ email: toEmail }],
      replyTo: { email: REPLY_TO_EMAIL },
      subject: "Re: " + subject,
      htmlContent: body
    }),
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch("https://api.brevo.com/v3/smtp/email", options);
}

// ==========================================
// 🚨 NEW TRUCK REPORTING
// ==========================================
function sendDailyNewTrucksReport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eventsSheet = ss.getSheetByName("Events");
  const trucksSheet = ss.getSheetByName("Trucks");
  if (!eventsSheet || !trucksSheet) return;
  const trucksData = trucksSheet.getDataRange().getValues().slice(1);
  const knownTrucks = new Set();
  trucksData.forEach(function(row) {
    knownTrucks.add(normalizeTruckKey(row[0]));
    if (row[17]) String(row[17]).split(',').forEach(function(a) { knownTrucks.add(normalizeTruckKey(a.trim())); });
  });
  const eventsData = eventsSheet.getDataRange().getValues().slice(1);
  const newTruckEvents = [];
  const seenEventKeys = new Set();
  const tz = ss.getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  eventsData.forEach(function(row) {
    const truckName = row[3];
    const normT = normalizeTruckKey(truckName);
    if (!normT || Array.from(knownTrucks).some(function(kt) { return isFuzzyMatch(kt, normT); })) return;
    const eventDateRaw = row[0];
    const dStr = !isNaN(parseEventDate(eventDateRaw).getTime()) ? Utilities.formatDate(parseEventDate(eventDateRaw), tz, "dd/MM/yyyy") : "";
    const sortDateStr = !isNaN(parseEventDate(eventDateRaw).getTime()) ? Utilities.formatDate(parseEventDate(eventDateRaw), tz, "yyyy-MM-dd") : "1970-01-01";
    if (sortDateStr < today && sortDateStr !== "1970-01-01") return;
    const key = normT + "|" + dStr + "|" + row[4];
    if (!seenEventKeys.has(key)) {
      seenEventKeys.add(key);
      newTruckEvents.push({ truck: truckName, venue: row[4], village: row[5], date: dStr, source: row[8] || row[7] || "Unknown" });
    }
  });
  if (newTruckEvents.length === 0) return;
  newTruckEvents.sort(function(a, b) { return a.truck.localeCompare(b.truck); });
  let tableRows = "";
  newTruckEvents.forEach(function(e) {
    const friendlyDate = formatFriendlyDate(e.date);
    tableRows += "<tr>" +
      "<td style='padding:8px;border:1px solid #cbd5e1;font-weight:bold;'>" + e.truck + "</td>" +
      "<td style='padding:8px;border:1px solid #cbd5e1;'>" + e.venue + "</td>" +
      "<td style='padding:8px;border:1px solid #cbd5e1;'>" + e.village + "</td>" +
      "<td style='padding:8px;border:1px solid #cbd5e1;white-space:nowrap;'>" + friendlyDate + "</td>" +
      "<td style='padding:8px;border:1px solid #cbd5e1;font-size:11px;'>" + e.source + "</td>" +
      "</tr>";
  });
  const html = "<div style='font-family:Arial,sans-serif;color:#334155;'>" +
    "<h2>🚨 Daily New Trucks Report</h2>" +
    "<p>The following trucks are currently on the upcoming schedule but are <b>NOT</b> listed in your Trucks tab.</p>" +
    "<table style='border-collapse:collapse;width:100%;text-align:left;margin-bottom:20px;'>" +
    "<thead><tr style='background-color:#f1f5f9;'><th style='padding:8px;border:1px solid #cbd5e1;'>Truck Name</th><th style='padding:8px;border:1px solid #cbd5e1;'>Venue</th><th style='padding:8px;border:1px solid #cbd5e1;'>Village</th><th style='padding:8px;border:1px solid #cbd5e1;'>Date</th><th style='padding:8px;border:1px solid #cbd5e1;'>Source</th></tr></thead>" +
    "<tbody>" + tableRows + "</tbody>" +
    "</table>" +
    "</div>";
  sendBrevoReply(ADMIN_EMAIL, "🚨 Village Foodie: Daily New Trucks Report", html);
}

// ==========================================
// 🚀 MAINTENANCE & ENGINE HELPERS
// ==========================================
function formatFriendlyDate(dateStr) {
  if (!dateStr) return "";
  const parts = String(dateStr).split('/');
  if (parts.length !== 3) return dateStr;
  let y = parseInt(parts[2], 10);
  if (y < 100) y += 2000;
  const dateObj = new Date(y, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  if (isNaN(dateObj.getTime())) return dateStr;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = dateObj.getDate();
  const nth = (d > 3 && d < 21) ? 'th' : ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][d % 10];
  return days[dateObj.getDay()] + " " + d + nth + " " + months[dateObj.getMonth()];
}

function toTitleCase(str) {
  if (!str) return "";
  return str.replace(/\w\S*/g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

function normalizeTime(val, tz) {
  if (!val) return "";
  let strVal = String(val).trim();
  if (strVal === "00:00") return "";
  if (val instanceof Date) return Utilities.formatDate(val, tz, "HH:mm");
  const match = strVal.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    let h = parseInt(match[1], 10);
    if (strVal.toLowerCase().includes('pm') && h < 12) h += 12;
    return h.toString().padStart(2, '0') + ":" + match[2];
  }
  return strVal;
}

function normalizeTruckKey(name) {
  if (!name) return "";
  return String(name).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, '').replace(/\b(the|street|st|food|ltd|co|company|and)\b/g, '').split(/\s+/).map(function(word) { return word.replace(/s$/, ''); }).join('');
}

function isFuzzyMatch(str1, str2) {
  if (!str1 || !str2) return false;
  if (str1 === str2) return true;
  if (str1.includes(str2) || str2.includes(str1)) return true;
  return false;
}

function parseEventDate(rawDate) {
  if (rawDate instanceof Date) return rawDate;
  const str = String(rawDate).trim();
  const parts = str.split('/');
  if (parts.length === 3) {
    let y = parseInt(parts[2], 10);
    if (y < 100) y += 2000;
    return new Date(y, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }
  // Handle ISO format from Supabase (YYYY-MM-DD)
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const p = str.split('-');
    return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
  }
  return new Date(str);
}

function removeDuplicateEvents() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Events");
  const tz = ss.getSpreadsheetTimeZone();
  const data = sheet.getDataRange().getValues();
  const rowsToDelete = [];
  const keptEvents = [];
  for (let i = data.length - 1; i >= 1; i--) {
    if (!data[i][0]) { rowsToDelete.push(i + 1); continue; }
    const dateObj = parseEventDate(data[i][0]);
    if (isNaN(dateObj.getTime())) continue;
    const dateStr = Utilities.formatDate(dateObj, tz, "yyyy-MM-dd");
    const truckNorm = normalizeTruckKey(data[i][3]);
    const venueNorm = normalizeTruckKey(data[i][4]);
    const villageNorm = normalizeTruckKey(data[i][5]);
    const startMins = getMinutesSinceMidnight(data[i][1]);
    const endMins = getMinutesSinceMidnight(data[i][2]);
    let isDup = false;
    for (let j = 0; j < keptEvents.length; j++) {
      const kE = keptEvents[j];
      if (kE.date === dateStr &&
          (kE.truck === truckNorm || kE.truck.includes(truckNorm) || truckNorm.includes(kE.truck)) &&
          (kE.venue === venueNorm || kE.venue.includes(venueNorm) || venueNorm.includes(kE.venue)) &&
          (kE.village === villageNorm || kE.village === "" || villageNorm === "")) {
        isDup = true; break;
      }
    }
    if (isDup) {
      rowsToDelete.push(i + 1);
    } else {
      let hasClash = false;
      for (let j = 0; j < keptEvents.length; j++) {
        const kE = keptEvents[j];
        if (kE.date === dateStr && (kE.truck === truckNorm || kE.truck.includes(truckNorm) || truckNorm.includes(kE.truck))) {
          if (kE.venue !== venueNorm || kE.village !== villageNorm) {
            if (startMins < kE.end && endMins > kE.start && startMins !== 9999 && kE.start !== 9999) {
              hasClash = true; break;
            }
          }
        }
      }
      if (hasClash) {
        const currentNotes = String(data[i][8]);
        if (!currentNotes.includes("[⚠️ TIME CLASH]")) {
          sheet.getRange(i + 1, 9).setValue(currentNotes ? currentNotes + " | [⚠️ TIME CLASH]" : "[⚠️ TIME CLASH]");
        }
      }
      keptEvents.push({ date: dateStr, truck: truckNorm, venue: venueNorm, village: villageNorm, start: startMins, end: endMins });
    }
  }
  rowsToDelete.sort(function(a, b) { return b - a; }).forEach(function(r) { sheet.deleteRow(r); });
}

function removePastEvents() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName("Events"), tz = ss.getSpreadsheetTimeZone();
  const data = sheet.getDataRange().getValues(), today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd"), rows = [];
  for (let i = data.length-1; i>=1; i--) {
    if (Utilities.formatDate(parseEventDate(data[i][0]), tz, "yyyy-MM-dd") < today) rows.push(i+1);
  }
  rows.sort(function(a,b){return b-a;}).forEach(function(r){sheet.deleteRow(r);});
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getMinutesSinceMidnight(timeVal) {
  if (timeVal instanceof Date) return (timeVal.getHours() * 60) + timeVal.getMinutes();
  const match = String(timeVal).match(/(\d{1,2}):(\d{2})/);
  if (!match) return 9999;
  let h = parseInt(match[1], 10);
  if (String(timeVal).toLowerCase().includes('pm') && h < 12) h += 12;
  return (h * 60) + parseInt(match[2], 10);
}

function formatEmailImageUrl(rawPath, folder) {
  if (!rawPath) return "";
  let p = String(rawPath).trim();
  if (!p) return "";
  if (p.startsWith('http')) return p;
  while (p.startsWith('/')) { p = p.substring(1); }
  if (!p.startsWith(folder + '/')) { p = folder + '/' + p; }
  return BASE_URL + '/' + p;
}

function fetchVenueGoogleData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName("Venues");
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0] || (data[i][8] && data[i][12])) continue;
    try {
      const res = JSON.parse(UrlFetchApp.fetch("https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=" + encodeURIComponent(data[i][0]+","+data[i][1]) + "&inputtype=textquery&key=" + GOOGLE_API_KEY).getContentText());
      if (res.candidates[0]) {
        const det = JSON.parse(UrlFetchApp.fetch("https://maps.googleapis.com/maps/api/place/details/json?place_id=" + res.candidates[0].place_id + "&fields=website,photos&key=" + GOOGLE_API_KEY).getContentText()).result;
        if (det.website) sheet.getRange(i+1, 9).setValue(det.website);
        if (det.photos) sheet.getRange(i+1, 13).setValue("https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=" + det.photos[0].photo_reference + "&key=" + GOOGLE_API_KEY);
      }
    } catch (e) {}
  }
}

function testFolderAccess() {
  const folder = DriveApp.getFolderById("1D_v3fOuNqfvfl182PpmBKCvXAwlq-ZwG");
  const files = folder.getFiles();
  let count = 0;
  let names = [];
  while (files.hasNext()) {
    const f = files.next();
    count++;
    names.push(f.getName() + " (" + f.getSize() + " bytes)");
  }
  Logger.log("Files found: " + count);
  Logger.log(names.join("\n"));
}

function testLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("Spreadsheet: " + (ss ? ss.getName() : "NULL"));
}

function testAllKeys() {
  const props = PropertiesService.getScriptProperties();
  const keys = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'BREVO_API_KEY', 'INBOUND_SCHEDULE_SECRET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  keys.forEach(function(k) {
    const val = props.getProperty(k);
    Logger.log(k + ": " + (val ? "EXISTS (length=" + val.length + ", starts=" + val.substring(0,6) + ")" : "MISSING"));
  });
}

function backfillMissingVenueCoords() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Venues");
  const data = sheet.getDataRange().getValues();
  let fixed = 0;
  for (let i = 1; i < data.length; i++) {
    const name = data[i][0];
    const village = data[i][1];
    const lat = data[i][3];
    const lng = data[i][4];
    if (name && (!lat || !lng)) {
      try {
        const url = "https://maps.googleapis.com/maps/api/geocode/json?address=" +
          encodeURIComponent(name + ", " + village + ", UK") + "&key=" + GOOGLE_API_KEY;
        const res = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
        if (res.status === "OK" && res.results.length > 0) {
          sheet.getRange(i + 1, 4).setValue(res.results[0].geometry.location.lat);
          sheet.getRange(i + 1, 5).setValue(res.results[0].geometry.location.lng);
          fixed++;
          Logger.log("Fixed: " + name + " (" + village + ")");
          Utilities.sleep(200);
        }
      } catch(e) {
        Logger.log("Failed: " + name + " - " + e.message);
      }
    }
  }
  Logger.log("Total fixed: " + fixed);
}
