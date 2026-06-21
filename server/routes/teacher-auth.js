const router    = require('express').Router();
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const { readDB, writeDB, newId } = require('../db');
const { loginRateLimit } = require('../middleware/rateLimit');

const JWT_SECRET = () => require('../config/jwtSecret').JWT_SECRET;
const makeToken  = id => jwt.sign({ id, role: 'teacher' }, JWT_SECRET(), { expiresIn: '8h' });

function adminOnly(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'No token.' });
    const decoded = jwt.verify(h.split(' ')[1], JWT_SECRET());
    const user = readDB('users').find(u => u._id === decoded.id);
    if (!user) return res.status(403).json({ success: false, message: 'Admin access required.' });
    if (user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required.' });
    req.user = user; next();
  } catch(e) { res.status(401).json({ success: false, message: 'Unauthorized.' }); }
}

router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username||!password) return res.status(400).json({ success: false, message: 'Username and password required.' });
    const accounts = readDB('teacher-accounts');
    const idx = accounts.findIndex(t => t.username === username.toLowerCase().trim());
    if (idx===-1) { res.loginFailed(); return res.status(401).json({ success: false, message: 'Invalid username or password.' }); }
    const teacher = accounts[idx];
    const ok = await bcrypt.compare(password, teacher.password);
    if (!ok) { res.loginFailed(); return res.status(401).json({ success: false, message: 'Invalid username or password.' }); }
    res.loginSuccess();
    accounts[idx].lastLogin = new Date().toISOString();
    writeDB('teacher-accounts', accounts);
    const token = makeToken(teacher._id);
    const { password: _, ...safe } = accounts[idx];
    res.json({ success: true, token, teacher: safe });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/me', (req, res) => {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'No token.' });
    const decoded = jwt.verify(h.split(' ')[1], JWT_SECRET());
    const teacher = readDB('teacher-accounts').find(t => t._id === decoded.id);
    if (!teacher) return res.status(401).json({ success: false, message: 'Teacher not found.' });
    const { password: _, ...safe } = teacher;
    res.json({ success: true, teacher: safe });
  } catch(e) { res.status(401).json({ success: false, message: 'Invalid token.' }); }
});

router.get('/accounts', adminOnly, (req, res) => {
  try {
    const data = readDB('teacher-accounts').map(t => { const { password, ...safe } = t; return safe; });
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/accounts', adminOnly, async (req, res) => {
  try {
    const { teacherId, username, password, name, assignedClass, assignedSection } = req.body;
    if (!username||!password) return res.status(400).json({ success: false, message: 'username and password are required.' });
    const accounts = readDB('teacher-accounts');
    const dup = accounts.find(t => t.username === username.toLowerCase().trim());
    if (dup) return res.status(409).json({ success: false, message: 'Username already exists.' });
    const hash = await bcrypt.hash(password, 10);
    const item = { _id: newId(), teacherId: teacherId||'', username: username.toLowerCase().trim(), password: hash, name: name||'', assignedClass: assignedClass||'', assignedSection: assignedSection||'A', createdAt: new Date().toISOString() };
    accounts.push(item); writeDB('teacher-accounts', accounts);
    const { password: _, ...safe } = item;
    res.status(201).json({ success: true, data: safe });
  } catch(e) { res.status(400).json({ success: false, message: e.message }); }
});

router.put('/accounts/:id', adminOnly, async (req, res) => {
  try {
    const accounts = readDB('teacher-accounts');
    const idx = accounts.findIndex(t => t._id === req.params.id);
    if (idx===-1) return res.status(404).json({ success: false, message: 'Account not found.' });
    const updates = { ...req.body }; delete updates._id;
    if (updates.password) updates.password = await bcrypt.hash(updates.password, 10);
    accounts[idx] = { ...accounts[idx], ...updates, _id: req.params.id };
    writeDB('teacher-accounts', accounts);
    const { password: _, ...safe } = accounts[idx];
    res.json({ success: true, data: safe });
  } catch(e) { res.status(400).json({ success: false, message: e.message }); }
});

router.delete('/accounts/:id', adminOnly, (req, res) => {
  try {
    const accounts = readDB('teacher-accounts');
    if (!accounts.find(t => t._id === req.params.id)) return res.status(404).json({ success: false, message: 'Account not found.' });
    writeDB('teacher-accounts', accounts.filter(t => t._id !== req.params.id));
    res.json({ success: true, message: 'Account deleted.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
