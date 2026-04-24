// ── Teacher Auth + Account Management ────────────────────────────────────────
const router         = require('express').Router();
const jwt            = require('jsonwebtoken');
const bcrypt         = require('bcryptjs');
const { readDB, writeDB, newId } = require('../db');
const { loginRateLimit } = require('../middleware/rateLimit');

const JWT_SECRET = () => process.env.JWT_SECRET;

const makeToken = id =>
  jwt.sign({ id, role: 'teacher' }, JWT_SECRET(), { expiresIn: '8h' });

// ── Admin-only middleware (inline — avoids circular import) ───────────────────
function adminOnly(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token.' });
    }
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET());
    const users   = readDB('users');
    const user    = users.find(u => u._id === decoded.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    req.user = user;
    next();
  } catch (e) {
    res.status(401).json({ success: false, message: 'Unauthorized.' });
  }
}

// POST /api/teacher-auth/login
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required.' });
    }
    const teachers = readDB('teacher-accounts');
    const teacher  = teachers.find(t => t.username === username.toLowerCase().trim());
    if (!teacher) {
      res.loginFailed();
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }
    const ok = await bcrypt.compare(password, teacher.password);
    if (!ok) {
      res.loginFailed();
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }
    res.loginSuccess();
    const idx = teachers.findIndex(t => t._id === teacher._id);
    teachers[idx].lastLogin = new Date().toISOString();
    writeDB('teacher-accounts', teachers);

    const token = makeToken(teacher._id);
    const { password: _, ...safe } = teachers[idx];
    res.json({ success: true, token, teacher: safe });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/teacher-auth/me
router.get('/me', (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token.' });
    }
    const decoded  = jwt.verify(authHeader.split(' ')[1], JWT_SECRET());
    const teachers = readDB('teacher-accounts');
    const teacher  = teachers.find(t => t._id === decoded.id);
    if (!teacher) return res.status(401).json({ success: false, message: 'Teacher not found.' });
    const { password: _, ...safe } = teacher;
    res.json({ success: true, teacher: safe });
  } catch (e) { res.status(401).json({ success: false, message: 'Invalid token.' }); }
});

// GET /api/teacher-auth/accounts  (admin)
router.get('/accounts', adminOnly, (req, res) => {
  try {
    const data = readDB('teacher-accounts').map(({ password: _, ...t }) => t);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/teacher-auth/accounts  (admin)
router.post('/accounts', adminOnly, async (req, res) => {
  try {
    const { teacherId, username, password, name, assignedClass, assignedSection } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'username and password are required.' });
    }
    const all = readDB('teacher-accounts');
    if (all.find(t => t.username === username.toLowerCase().trim())) {
      return res.status(409).json({ success: false, message: 'Username already exists.' });
    }
    const hash = await bcrypt.hash(password, 10);
    const item = {
      _id:             newId(),
      teacherId:       teacherId       || '',
      username:        username.toLowerCase().trim(),
      password:        hash,
      name:            name            || '',
      assignedClass:   assignedClass   || '',
      assignedSection: assignedSection || 'A',
      createdAt:       new Date().toISOString()
    };
    all.push(item);
    writeDB('teacher-accounts', all);
    const { password: _, ...safe } = item;
    res.status(201).json({ success: true, data: safe });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// PUT /api/teacher-auth/accounts/:id  (admin — update class/section assignment)
router.put('/accounts/:id', adminOnly, async (req, res) => {
  try {
    const all = readDB('teacher-accounts');
    const idx = all.findIndex(t => t._id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Account not found.' });

    const updates = { ...req.body };
    delete updates._id;
    // If password is being changed, hash it
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }
    all[idx] = { ...all[idx], ...updates, _id: req.params.id };
    writeDB('teacher-accounts', all);
    const { password: _, ...safe } = all[idx];
    res.json({ success: true, data: safe });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// DELETE /api/teacher-auth/accounts/:id  (admin)
router.delete('/accounts/:id', adminOnly, (req, res) => {
  try {
    let all = readDB('teacher-accounts');
    const idx = all.findIndex(t => t._id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Account not found.' });
    all.splice(idx, 1);
    writeDB('teacher-accounts', all);
    res.json({ success: true, message: 'Account deleted.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
