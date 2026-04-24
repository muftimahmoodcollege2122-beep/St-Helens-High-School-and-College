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

module.exports = router;
