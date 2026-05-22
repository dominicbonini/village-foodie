/**
 * Village Foodie — Google Sheets to Supabase Migration
 * Run once: node scripts/migrate-from-sheets.js
 *
 * Reads all tabs from the master Google Sheet and populates
 * the Supabase discovery tables. Safe to run multiple times
 * (uses upsert). Does not touch the live website.
 */

require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function readTab(sheets, range) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  return res.data.values || [];
}

function parseDate(raw) {
  if (!raw) return null;
  const parts = String(raw).split('/');
  if (parts.length === 3) {
    let y = parseInt(parts[2]);
    if (y < 100) y += 2000;
    return `${y}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  }
  return null;
}

async function migrateTrucks(sheets) {
  console.log('\n📦 Migrating Trucks...');
  const rows = await readTab(sheets, 'Trucks!A:U');
  const data = rows.slice(1).filter(r => r[0]);

  const trucks = data.map(r => ({
    name: r[0] || '',
    cuisine: r[1] || null,
    phone: r[2] || null,
    order_url: r[3] || null,
    accepted_methods: r[4] || null,
    notes: r[5] || null,
    website: r[6] || null,
    menu_url: r[7] || null,
    schedule_url: r[8] || null,
    logo_url: r[9] || null,
    contact_email: r[10] || null,
    mobile: r[11] || null,
    verified: String(r[12]).toLowerCase() === 'true' || String(r[12]).toLowerCase() === 'yes',
    type: r[13] || null,
    ai_instructions: r[14] || null,
    scraper_strategy: r[15] || null,
    photo_url: r[16] || null,
    aliases: r[17] ? r[17].split(',').map(a => a.trim()).filter(Boolean) : [],
    is_meal: String(r[18]).toLowerCase() !== 'no',
    exclude_reason: r[19] || null,
  }));

  let inserted = 0, failed = 0;
  for (const truck of trucks) {
    const { error } = await supabase
      .from('discovery_trucks')
      .upsert(truck, { onConflict: 'name' });
    if (error) { console.error(`  ❌ ${truck.name}: ${error.message}`); failed++; }
    else inserted++;
  }
  console.log(`  ✅ ${inserted} trucks migrated, ${failed} failed`);
}

async function migrateVenues(sheets) {
  console.log('\n📍 Migrating Venues...');
  const rows = await readTab(sheets, 'Venues!A:N');
  const data = rows.slice(1).filter(r => r[0]);

  const venues = data.map(r => ({
    name: r[0] || '',
    village: r[1] || null,
    postcode: r[2] || null,
    latitude: r[3] ? parseFloat(r[3]) : null,
    longitude: r[4] ? parseFloat(r[4]) : null,
    owner_email: r[5] || null,
    phone: r[6] || null,
    premium: String(r[7]).toLowerCase() === 'true' || String(r[7]).toLowerCase() === 'yes',
    website: r[8] || null,
    schedule_url: r[9] || null,
    ai_instructions: r[10] || null,
    scraper_strategy: r[11] || null,
    photo_url: r[12] || null,
    aliases: r[13] ? r[13].split(',').map(a => a.trim()).filter(Boolean) : [],
  }));

  let inserted = 0, failed = 0;
  for (const venue of venues) {
    const { error } = await supabase
      .from('venues')
      .upsert(venue, { onConflict: 'name' });
    if (error) { console.error(`  ❌ ${venue.name}: ${error.message}`); failed++; }
    else inserted++;
  }
  console.log(`  ✅ ${inserted} venues migrated, ${failed} failed`);
}

async function migrateEvents(sheets) {
  console.log('\n📅 Migrating Events...');
  const rows = await readTab(sheets, 'Events!A:I');
  const today = new Date().toISOString().split('T')[0];

  // Only migrate future events — past events are historical noise
  const data = rows.slice(1).filter(r => {
    const d = parseDate(r[0]);
    return d && d >= today;
  });

  console.log(`  Found ${data.length} upcoming events to migrate`);

  const events = data.map(r => ({
    event_date: parseDate(r[0]),
    start_time: r[1] || null,
    end_time: r[2] || null,
    truck_name: r[3] || '',
    venue_name: r[4] || null,
    village: r[5] || null,
    event_notes: r[6] || null,
    source: r[7] || null,
    ai_notes: r[8] || null,
  }));

  // Insert in batches of 100
  let inserted = 0, failed = 0;
  for (let i = 0; i < events.length; i += 100) {
    const batch = events.slice(i, i + 100);
    const { error } = await supabase
      .from('discovery_events')
      .insert(batch);
    if (error) { console.error(`  ❌ Batch ${i}-${i+100}: ${error.message}`); failed += batch.length; }
    else inserted += batch.length;
  }
  console.log(`  ✅ ${inserted} events migrated, ${failed} failed`);
}

async function migrateExclusions(sheets) {
  console.log('\n🚫 Migrating Exclusions...');
  const rows = await readTab(sheets, 'Exclusions!A:A');
  const terms = rows.slice(1).map(r => r[0]).filter(Boolean);

  let inserted = 0, failed = 0;
  for (const term of terms) {
    const { error } = await supabase
      .from('excluded_terms')
      .upsert({ term }, { onConflict: 'term' });
    if (error) { console.error(`  ❌ ${term}: ${error.message}`); failed++; }
    else inserted++;
  }
  console.log(`  ✅ ${inserted} exclusions migrated, ${failed} failed`);
}

async function migrateSubscribers(sheets) {
  console.log('\n📧 Migrating Subscribers...');
  const rows = await readTab(sheets, 'Subscribers!A:K');
  const data = rows.slice(1).filter(r => r[7] && r[7].includes('@'));

  const subs = data.map(r => ({
    email: String(r[7]).toLowerCase().trim(),
    postcode: r[3] || null,
    preferred_distance_miles: r[6] ? parseFloat(r[6]) : 20,
    latitude: r[8] ? parseFloat(r[8]) : null,
    longitude: r[9] ? parseFloat(r[9]) : null,
    village: r[10] || null,
  })).filter(s => s.email);

  let inserted = 0, failed = 0;
  for (const sub of subs) {
    const { error } = await supabase
      .from('subscribers')
      .upsert(sub, { onConflict: 'email' });
    if (error) { console.error(`  ❌ ${sub.email}: ${error.message}`); failed++; }
    else inserted++;
  }
  console.log(`  ✅ ${inserted} subscribers migrated, ${failed} failed`);
}

async function resolveLinks() {
  console.log('\n🔗 Resolving truck and venue links on events...');

  const { data: events } = await supabase
    .from('discovery_events')
    .select('id, truck_name, venue_name, village')
    .is('discovery_truck_id', null);

  const { data: trucks } = await supabase
    .from('discovery_trucks')
    .select('id, name, aliases');

  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, village, aliases');

  if (!events || !trucks || !venues) return;

  let linked = 0;
  for (const event of events) {
    const normTruck = event.truck_name.toLowerCase().replace(/[^a-z0-9]/g, '');

    const matchedTruck = trucks.find(t => {
      const normName = t.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normName === normTruck || normName.includes(normTruck) || normTruck.includes(normName)) return true;
      return (t.aliases || []).some(a => {
        const normAlias = a.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normAlias === normTruck || normAlias.includes(normTruck) || normTruck.includes(normAlias);
      });
    });

    const normVenue = (event.venue_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normVillage = (event.village || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const matchedVenue = venues.find(v => {
      const vName = v.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const vVil = (v.village || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const nameMatch = vName === normVenue || vName.includes(normVenue) || normVenue.includes(vName) ||
        (v.aliases || []).some(a => {
          const normA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
          return normA === normVenue || normA.includes(normVenue);
        });
      const villageMatch = !normVillage || normVillage === 'tbc' ||
        vVil === normVillage || vVil.includes(normVillage) || normVillage.includes(vVil);
      return nameMatch && villageMatch;
    });

    if (matchedTruck || matchedVenue) {
      await supabase
        .from('discovery_events')
        .update({
          discovery_truck_id: matchedTruck?.id || null,
          venue_id: matchedVenue?.id || null,
        })
        .eq('id', event.id);
      linked++;
    }
  }
  console.log(`  ✅ ${linked} events linked to trucks/venues`);
}

async function main() {
  console.log('🚀 Village Foodie — Sheets to Supabase Migration');
  console.log('================================================');
  console.log('⚠️  This reads from Sheets and writes to Supabase.');
  console.log('⚠️  The live website is NOT affected.');
  console.log('');

  const sheets = await getSheets();

  await migrateTrucks(sheets);
  await migrateVenues(sheets);
  await migrateExclusions(sheets);
  await migrateSubscribers(sheets);
  await migrateEvents(sheets);
  await resolveLinks();

  console.log('\n✅ Migration complete.');
  console.log('   Next step: verify counts match Sheets, then update the scraper.');
}

main().catch(console.error);
