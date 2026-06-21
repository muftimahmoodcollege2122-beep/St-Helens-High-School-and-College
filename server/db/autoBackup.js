const fs   = require('fs');
const path = require('path');
const { readDB, readSettings, attOps, DB_DIR } = require('./index');

const BACKUPS_DIR = path.join(DB_DIR, 'backups');
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BACKUPS = 12; // ~3 months of weekly backups

function takeSnapshot() {
  try {
    const collections = ['students','teachers','fees','results','news','events','gallery','toppers','contact','admissions','alumni','homework','users'];
    const backup = {};
    collections.forEach(c => { backup[c] = readDB(c); });
    backup.attendance = attOps.query({});
    backup.settings = readSettings() || {};
    backup.exportedAt = new Date().toISOString();

    const filename = `auto_backup_${new Date().toISOString().slice(0,10)}.json`;
    fs.writeFileSync(path.join(BACKUPS_DIR, filename), JSON.stringify(backup, null, 2), 'utf8');
    console.log(`✅  Auto-backup saved: ${filename}`);

    // Prune old backups beyond MAX_BACKUPS
    const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith('auto_backup_')).sort();
    while (files.length > MAX_BACKUPS) {
      const oldest = files.shift();
      fs.unlinkSync(path.join(BACKUPS_DIR, oldest));
      console.log(`🗑  Pruned old auto-backup: ${oldest}`);
    }
  } catch (e) {
    console.error('❌  Auto-backup failed:', e.message);
  }
}

function startAutoBackup() {
  // Only snapshot on boot if no backup exists yet today/this week — avoids
  // spamming a new file on every restart/deploy.
  const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith('auto_backup_'));
  const newestTime = files.length
    ? Math.max(...files.map(f => fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs))
    : 0;
  if (Date.now() - newestTime >= SEVEN_DAYS_MS) takeSnapshot();

  setInterval(takeSnapshot, SEVEN_DAYS_MS);
  console.log('🕐  Auto-backup scheduler started (every 7 days, keeps last ' + MAX_BACKUPS + ').');
}

function listBackups() {
  return fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('auto_backup_'))
    .sort().reverse()
    .map(f => ({ filename: f, size: fs.statSync(path.join(BACKUPS_DIR, f)).size,
                 createdAt: fs.statSync(path.join(BACKUPS_DIR, f)).mtime }));
}

function getBackupPath(filename) {
  // Prevent path traversal — only allow exact filenames from our own naming pattern.
  if (!/^auto_backup_\d{4}-\d{2}-\d{2}\.json$/.test(filename)) return null;
  const p = path.join(BACKUPS_DIR, filename);
  return fs.existsSync(p) ? p : null;
}

module.exports = { startAutoBackup, takeSnapshot, listBackups, getBackupPath, BACKUPS_DIR };
