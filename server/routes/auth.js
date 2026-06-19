// ── Admin Auth ────────────────────────────────────────────────────────────────
const express   = require('express');
const router    = express.Router();
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const { db, readDB, writeDB } = require('../db');
const { protect }         = require('../middleware/auth');
const { loginRateLimit }  = require('../middleware/rateLimit');

const JWT_SECRET = process.env.JWT_SECRET || 'sthelens-shhs-fallback-secret-key-change-in-production';
const makeToken = id =>
  jwt.sign({ id }, JWT_SECRET, { expiresIn: '8h' });

// POST /api/auth/login
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: 'Username and password required.' });

    const row = db.prepare('SELECT json_data FROM users WHERE username=?').get(username.toLowerCase().trim());
    if (!row) {
      res.loginFailed();
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }
    const user = JSON.parse(row.json_data);

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      res.loginFailed();
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }
    res.loginSuccess();

    user.lastLogin = new Date().toISOString();
    db.prepare('UPDATE users SET json_data=? WHERE _id=?').run(JSON.stringify(user), user._id);

    const token = makeToken(user._id);
    const { password: _, ...safeUser } = user;
    res.json({ success: true, message: 'Login successful', token, user: safeUser });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ── JSON Backup: export all collections ───────────────────────────────────────
router.get('/backup-json', protect, (req, res) => {
  try {
    const { readDB, readSettings } = require('../db');
    const COLLECTIONS = ['students','attendance','fees','results','admissions',
      'teachers','news','events','gallery','toppers','contact'];
    const backup = {
      version: 2,
      exportedAt: new Date().toISOString(),
      school: 'sthelens',
      data: {}
    };
    for (const col of COLLECTIONS) {
      try { backup.data[col] = readDB(col); } catch { backup.data[col] = []; }
    }
    try { backup.settings = readSettings(); } catch { backup.settings = null; }

    const filename = 'sthelens_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (e) {
    res.status(500).json({ success: false, message: 'Backup failed: ' + e.message });
  }
});

// ── JSON Restore: import all collections ─────────────────────────────────────
router.post('/restore-json', protect, (req, res) => {
  const multer  = require('multer');
  const os      = require('os');

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (r, file, cb) => {
      if (!file.originalname.endsWith('.json')) return cb(new Error('Only .json backup files are allowed'));
      cb(null, true);
    }
  }).single('backup');

  upload(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    let backup;
    try {
      backup = JSON.parse(req.file.buffer.toString('utf8'));
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid JSON file — could not parse.' });
    }

    if (!backup.data || typeof backup.data !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid backup format — missing data key.' });
    }

    try {
      const { writeDB, writeSettings } = require('../db');
      const COLLECTIONS = ['students','attendance','fees','results','admissions',
        'teachers','news','events','gallery','toppers','contact'];
      const stats = {};

      for (const col of COLLECTIONS) {
        if (Array.isArray(backup.data[col])) {
          writeDB(col, backup.data[col]);
          stats[col] = backup.data[col].length;
        }
      }
      if (backup.settings && typeof backup.settings === 'object') {
        writeSettings(backup.settings);
      }

      res.json({
        success: true,
        message: 'Database restored successfully from JSON backup.',
        exportedAt: backup.exportedAt || 'unknown',
        stats
      });
    } catch (e) {
      res.status(500).json({ success: false, message: 'Restore failed: ' + e.message });
    }
  });
});

module.exports = router;
