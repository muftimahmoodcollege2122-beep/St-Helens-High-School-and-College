// ── Admin Auth ────────────────────────────────────────────────────────────────
const express   = require('express');
const router    = express.Router();
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const { readDB, writeDB } = require('../db');
const { protect }         = require('../middleware/auth');
const { loginRateLimit }  = require('../middleware/rateLimit');

const makeToken = id =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '8h' });

// POST /api/auth/login
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: 'Username and password required.' });

    const users = readDB('users');
    const user  = users.find(u => u.username === username.toLowerCase().trim());

    if (!user) {
      res.loginFailed();
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      res.loginFailed();
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    res.loginSuccess();

    // Update lastLogin
    const idx = users.findIndex(u => u._id === user._id);
    users[idx].lastLogin = new Date().toISOString();
    writeDB('users', users);

    const token = makeToken(user._id);
    const { password: _, ...safeUser } = users[idx];
    res.json({ success: true, message: 'Login successful', token, user: safeUser });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json({ success: true, user: req.user });
});

router.get('/backup-db', protect, (req, res) => {
  const { DB_FILE } = require('../db');
  const dbPath = process.env.DB_PATH || DB_FILE;
  const fs = require('fs');
  if (!fs.existsSync(dbPath)) return res.status(404).json({ success: false, message: 'DB file not found at: ' + dbPath });
  res.download(dbPath, 'mmpc_backup_' + new Date().toISOString().slice(0,10) + '.db');
});

router.post('/restore-db', protect, (req, res) => {
  const { DB_FILE } = require('../db');
  const dbPath = process.env.DB_PATH || DB_FILE;
  const fs   = require('fs');
  const path = require('path');
  const os   = require('os');
  const multer = require('multer');

  // Only superadmin can restore
  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Only admins can restore the database.' });
  }

  const tmpDir = os.tmpdir();
  const storage = multer.diskStorage({
    destination: (r, f, cb) => cb(null, tmpDir),
    filename:    (r, f, cb) => cb(null, 'mmpc_restore_' + Date.now() + '.db')
  });
  const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (r, file, cb) => {
      if (!file.originalname.endsWith('.db')) return cb(new Error('Only .db files allowed'));
      cb(null, true);
    }
  }).single('backup');

  upload(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    try {
      // Make a safety backup of current DB first
      const safetyPath = dbPath + '.pre_restore_' + Date.now();
      if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, safetyPath);

      // Copy uploaded file over the current DB
      fs.copyFileSync(req.file.path, dbPath);
      fs.unlinkSync(req.file.path);

      // Force better-sqlite3 to reconnect on next request
      // by clearing the cached require
      Object.keys(require.cache).forEach(k => {
        if (k.includes('/db/index') || k.includes('/db\\index')) delete require.cache[k];
      });

      res.json({ success: true, message: 'Database restored successfully. Safety backup saved on server.' });
    } catch (e) {
      res.status(500).json({ success: false, message: 'Restore failed: ' + e.message });
    }
  });
});

module.exports = router;
