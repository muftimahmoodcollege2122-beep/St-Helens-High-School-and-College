const router      = require('express').Router();
const { db, newId } = require('../db');
const { protect } = require('../middleware/auth');

// POST /api/alumni — public registration from alumni.html
router.post('/', (req, res) => {
  try {
    const { name, graduationYear, profession, phone } = req.body;
    if (!name || !graduationYear || !profession || !phone)
      return res.status(400).json({ success: false, message: 'Name, graduation year, profession and phone are required.' });
    const item = {
      _id: newId(), ...req.body,
      status: 'Pending',
      createdAt: new Date().toISOString()
    };
    db.prepare('INSERT INTO alumni(_id,name,batch,status,public,json_data,createdAt) VALUES (?,?,?,?,?,?,?)')
      .run(item._id, item.name, String(item.graduationYear||''), 'Pending', item.public||'Yes', JSON.stringify(item), item.createdAt);
    res.json({ success: true, message: 'Registration submitted! We will review and add you to the directory soon.', id: item._id });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/alumni — public directory (only Approved + public)
router.get('/', (req, res) => {
  try {
    const { batch, profession } = req.query;
    let sql = "SELECT json_data FROM alumni WHERE status='Approved' AND public='Yes'";
    const p = [];
    if (batch) { sql += ' AND batch=?'; p.push(batch); }
    sql += ' ORDER BY createdAt DESC';
    let data = db.prepare(sql).all(...p).map(r => JSON.parse(r.json_data));
    if (profession) data = data.filter(a => (a.profession||'').toLowerCase().includes(profession.toLowerCase()));
    // Strip sensitive fields for public view
    data = data.map(({ phone, cnic, dob, email, _id, name, graduationYear, profession, currentCity, currentCountry, bio, employer, linkedin }) =>
      ({ _id, name, graduationYear, profession, currentCity, currentCountry, bio, employer, linkedin }));
    res.json({ success: true, data, total: data.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/alumni/admin — admin view all with full data
router.get('/admin', protect, (req, res) => {
  try {
    const { status, batch } = req.query;
    let sql = 'SELECT json_data FROM alumni WHERE 1=1';
    const p = [];
    if (status) { sql += ' AND status=?'; p.push(status); }
    if (batch)  { sql += ' AND batch=?';  p.push(batch); }
    sql += ' ORDER BY createdAt DESC';
    const data = db.prepare(sql).all(...p).map(r => JSON.parse(r.json_data));
    res.json({ success: true, data, total: data.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /api/alumni/:id/status — Approve / Reject / Pending
router.patch('/:id/status', protect, (req, res) => {
  try {
    const row = db.prepare('SELECT json_data FROM alumni WHERE _id=?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Alumni not found.' });
    const item = JSON.parse(row.json_data);
    item.status = req.body.status || item.status;
    db.prepare('UPDATE alumni SET status=?,json_data=? WHERE _id=?').run(item.status, JSON.stringify(item), req.params.id);
    res.json({ success: true, data: item });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/alumni/:id
router.delete('/:id', protect, (req, res) => {
  try {
    const changes = db.prepare('DELETE FROM alumni WHERE _id=?').run(req.params.id).changes;
    if (!changes) return res.status(404).json({ success: false, message: 'Alumni not found.' });
    res.json({ success: true, message: 'Alumni record deleted.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
