const router    = require('express').Router();
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const { db, newId } = require('../db');
const { loginRateLimit } = require('../middleware/rateLimit');

const JWT_SECRET = () => (process.env.JWT_SECRET || 'sthelens-shhs-fallback-secret-key-change-in-production');
const makeToken  = id => jwt.sign({ id, role: 'teacher' }, JWT_SECRET(), { expiresIn: '8h' });

function adminOnly(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'No token.' });
    const decoded = jwt.verify(h.split(' ')[1], JWT_SECRET());
    const row = db.prepare('SELECT json_data FROM users WHERE _id=?').get(decoded.id);
    if (!row) return res.status(403).json({ success: false, message: 'Admin access required.' });
    const user = JSON.parse(row.json_data);
    if (user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required.' });
    req.user = user; next();
  } catch(e) { res.status(401).json({ success: false, message: 'Unauthorized.' }); }
}

// POST /api/teacher-auth/login
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username||!password) return res.status(400).json({ success: false, message: 'Username and password required.' });
    const row = db.prepare('SELECT json_data FROM teacher_accounts WHERE username=?').get(username.toLowerCase().trim());
    if (!row) { res.loginFailed(); return res.status(401).json({ success: false, message: 'Invalid username or password.' }); }
    const teacher = JSON.parse(row.json_data);
    const ok = await bcrypt.compare(password, teacher.password);
    if (!ok) { res.loginFailed(); return res.status(401).json({ success: false, message: 'Invalid username or password.' }); }
    res.loginSuccess();
    teacher.lastLogin = new Date().toISOString();
    db.prepare('UPDATE teacher_accounts SET json_data=? WHERE _id=?').run(JSON.stringify(teacher), teacher._id);
    const token = makeToken(teacher._id);
    const { password: _, ...safe } = teacher;
    res.json({ success: true, token, teacher: safe });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/teacher-auth/me
router.get('/me', (req, res) => {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'No token.' });
    const decoded = jwt.verify(h.split(' ')[1], JWT_SECRET());
    const row = db.prepare('SELECT json_data FROM teacher_accounts WHERE _id=?').get(decoded.id);
    if (!row) return res.status(401).json({ success: false, message: 'Teacher not found.' });
    const { password: _, ...safe } = JSON.parse(row.json_data);
    res.json({ success: true, teacher: safe });
  } catch(e) { res.status(401).json({ success: false, message: 'Invalid token.' }); }
});

// GET /api/teacher-auth/accounts
router.get('/accounts', adminOnly, (req, res) => {
  try {
    const data = db.prepare('SELECT json_data FROM teacher_accounts ORDER BY createdAt DESC').all()
      .map(r => { const t=JSON.parse(r.json_data); delete t.password; return t; });
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/teacher-auth/accounts
router.post('/accounts', adminOnly, async (req, res) => {
  try {
    const { teacherId, username, password, name, assignedClass, assignedSection } = req.body;
    if (!username||!password) return res.status(400).json({ success: false, message: 'username and password are required.' });
    const dup = db.prepare('SELECT _id FROM teacher_accounts WHERE username=?').get(username.toLowerCase().trim());
    if (dup) return res.status(409).json({ success: false, message: 'Username already exists.' });
    const hash = await bcrypt.hash(password, 10);
    const item = { _id: newId(), teacherId: teacherId||'', username: username.toLowerCase().trim(), password: hash, name: name||'', assignedClass: assignedClass||'', assignedSection: assignedSection||'A', createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO teacher_accounts(_id,username,json_data,createdAt) VALUES (?,?,?,?)').run(item._id, item.username, JSON.stringify(item), item.createdAt);
    const { password: _, ...safe } = item;
    res.status(201).json({ success: true, data: safe });
  } catch(e) { res.status(400).json({ success: false, message: e.message }); }
});

// PUT /api/teacher-auth/accounts/:id
router.put('/accounts/:id', adminOnly, async (req, res) => {
  try {
    const row = db.prepare('SELECT json_data FROM teacher_accounts WHERE _id=?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Account not found.' });
    const updates = { ...req.body }; delete updates._id;
    if (updates.password) updates.password = await bcrypt.hash(updates.password, 10);
    const updated = { ...JSON.parse(row.json_data), ...updates, _id: req.params.id };
    db.prepare('UPDATE teacher_accounts SET json_data=? WHERE _id=?').run(JSON.stringify(updated), req.params.id);
    const { password: _, ...safe } = updated;
    res.json({ success: true, data: safe });
  } catch(e) { res.status(400).json({ success: false, message: e.message }); }
});

// DELETE /api/teacher-auth/accounts/:id
router.delete('/accounts/:id', adminOnly, (req, res) => {
  try {
    const changes = db.prepare('DELETE FROM teacher_accounts WHERE _id=?').run(req.params.id).changes;
    if (!changes) return res.status(404).json({ success: false, message: 'Account not found.' });
    res.json({ success: true, message: 'Account deleted.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
