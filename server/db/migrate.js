// ── JSON → SQLite Migration ───────────────────────────────────────────────────
// Run once: node server/db/migrate.js
// Reads all existing .json files and imports them into mmpc.db
// Safe to run multiple times — skips records already in DB by _id.

const path = require('path');
const fs   = require('fs');

const JSON_DIR = path.join(__dirname, 'schools', 'mmpc');
const { readDB, writeDB, readSettings, writeSettings, db } = require('./index');

const COLLECTIONS = ['students','attendance','fees','results','admissions','teachers','teacher_accounts','users','news','events','gallery','toppers','contact','homework'];

let totalMigrated = 0;

for (const col of COLLECTIONS) {
  const jsonFile = path.join(JSON_DIR, `${col.replace('_','-')}.json`);
  // also try underscore filename
  const jsonFile2 = path.join(JSON_DIR, `${col}.json`);
  const file = fs.existsSync(jsonFile) ? jsonFile : fs.existsSync(jsonFile2) ? jsonFile2 : null;

  if (!file) { console.log(`  ⏭  ${col}: no JSON file found, skipping`); continue; }

  let data;
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw || raw === '[]' || raw === '') { console.log(`  ⏭  ${col}: empty, skipping`); continue; }
    data = JSON.parse(raw);
  } catch (e) {
    console.log(`  ❌ ${col}: parse error — ${e.message}`);
    continue;
  }

  if (!Array.isArray(data) || data.length === 0) { console.log(`  ⏭  ${col}: empty array, skipping`); continue; }

  writeDB(col, data);
  console.log(`  ✅ ${col}: ${data.length} records imported`);
  totalMigrated += data.length;
}

// Migrate settings
const settingsFile = path.join(JSON_DIR, 'settings.json');
if (fs.existsSync(settingsFile)) {
  try {
    const raw = fs.readFileSync(settingsFile, 'utf8').trim();
    if (raw && raw !== '{}') {
      const s = JSON.parse(raw);
      if (typeof s === 'object' && !Array.isArray(s)) {
        writeSettings(s);
        console.log(`  ✅ settings: migrated`);
      }
    }
  } catch (e) { console.log(`  ❌ settings: ${e.message}`); }
}

console.log(`\n🎉 Migration complete. Total records: ${totalMigrated}`);
console.log(`   Database: ${path.join(JSON_DIR, 'mmpc.db')}\n`);
