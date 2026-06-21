const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const { readDB, writeDB, readSettings, writeSettings, attOps, clearAttendance, DB_FILE } = require('../db');
const { protect } = require('../middleware/auth');
const { loginRateLimit } = require('../middleware/rateLimit');

// JSON backup file upload — kept in memory (small file, parsed immediately,
// never written to disk), separate from the image-upload middleware.
const backupUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const JWT_SECRET = process.env.JWT_SECRET || 'sthelens-shhs-fallback-secret-key-change-in-production';
const makeToken = id => jwt.sign({ id }, JWT_SECRET, { expiresIn: '8h' });

router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success:false, message:'Username and password required.' });
    const users = readDB('users');
    const user = users.find(u => u.username === username);
    if (!user) return res.status(401).json({ success:false, message:'Invalid credentials.' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ success:false, message:'Invalid credentials.' });
    const token = makeToken(user._id);
    res.json({ success:true, token, user:{ _id:user._id, username:user.username, name:user.name, role:user.role } });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/me', protect, (req, res) => {
  try {
    const users = readDB('users');
    const user = users.find(u => u._id === req.user.id);
    if (!user) return res.status(404).json({ success:false, message:'User not found.' });
    const settings = readSettings() || {};
    res.json({ success:true, user:{ _id:user._id, username:user.username, name:user.name, role:user.role }, settings });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.put('/password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ success:false, message:'Both passwords required.' });
    if (newPassword.length < 8) return res.status(400).json({ success:false, message:'New password must be at least 8 characters.' });
    const users = readDB('users');
    const idx = users.findIndex(u => u._id === req.user.id);
    if (idx===-1) return res.status(404).json({ success:false, message:'User not found.' });
    const ok = await bcrypt.compare(currentPassword, users[idx].password);
    if (!ok) return res.status(401).json({ success:false, message:'Current password incorrect.' });
    users[idx].password = await bcrypt.hash(newPassword, 12);
    writeDB('users', users);
    res.json({ success:true, message:'Password updated successfully.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/backup-json', protect, (req, res) => {
  try {
    const collections = ['students','teachers','fees','results','news','events','gallery','toppers','contact','admissions','alumni','homework','users'];
    const backup = {};
    collections.forEach(c => { backup[c] = readDB(c); });
    backup.attendance = attOps.query({}); // attendance lives in its own indexed table
    backup.settings = readSettings() || {};
    backup.exportedAt = new Date().toISOString();
    res.json({ success:true, data:backup });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/auto-backups', protect, (req, res) => {
  try {
    const { listBackups } = require('../db/autoBackup');
    res.json({ success:true, data: listBackups() });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/auto-backups/:filename', protect, (req, res) => {
  try {
    const { getBackupPath } = require('../db/autoBackup');
    const p = getBackupPath(req.params.filename);
    if (!p) return res.status(404).json({ success:false, message:'Backup not found.' });
    res.download(p, req.params.filename);
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/backup-db', protect, (req, res) => {
  res.download(DB_FILE, 'sthelens_backup.db', (err) => {
    if (err && !res.headersSent) res.status(500).json({ success:false, message:err.message });
  });
});

router.post('/restore-json', protect, backupUpload.single('backup'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success:false, message:'No backup file uploaded.' });

    let data;
    try { data = JSON.parse(req.file.buffer.toString('utf8')); }
    catch { return res.status(400).json({ success:false, message:'Invalid JSON file.' }); }
    // The downloaded backup file is the raw API response { success, data:{...} } —
    // unwrap it if present, so restoring a file you just downloaded works.
    if (data && typeof data.data === 'object' && !Array.isArray(data.data)) data = data.data;

    const collections = ['students','teachers','fees','results','news','events','gallery','toppers','contact','admissions','alumni','homework','users'];
    const stats = {};
    collections.forEach(c => {
      if (Array.isArray(data[c])) { writeDB(c, data[c]); stats[c] = data[c].length; }
    });
    if (Array.isArray(data.attendance)) {
      clearAttendance();
      data.attendance.forEach(r => attOps.upsert(r));
      stats.attendance = data.attendance.length;
    }
    if (data.settings && typeof data.settings === 'object') writeSettings(data.settings);

    res.json({ success:true, message:'Restore complete.', stats });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
