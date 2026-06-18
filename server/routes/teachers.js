const express     = require('express');
const router      = express.Router();
const { db, newId } = require('../db');
const { protect } = require('../middleware/auth');
const upload      = require('../middleware/upload');
const fs          = require('fs');
const path        = require('path');

// GET /api/teachers — public (active only)
router.get('/', (req, res) => {
  try {
    const data = db.prepare("SELECT json_data FROM teachers WHERE status!='Inactive' ORDER BY createdAt ASC").all().map(r => JSON.parse(r.json_data));
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/teachers/all — admin
router.get('/all', protect, (req, res) => {
  try {
    const data = db.prepare('SELECT json_data FROM teachers ORDER BY createdAt DESC').all().map(r => JSON.parse(r.json_data));
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/teachers — with photo
router.post('/', protect, (req, res, next) => { req.uploadDir = 'teachers'; next(); }, upload.single('photo'), (req, res) => {
  try {
    const { name, subject } = req.body;
    if (!name || !subject) return res.status(400).json({ success: false, message: 'Name and subject are required.' });
    const item = {
      _id: newId(), name: name.trim(), subject: subject.trim(),
      qualification: (req.body.qualification || '').trim(),
      designation: (req.body.designation || '').trim(),
      department: (req.body.department || '').trim(),
      experience: (req.body.experience || '').trim(),
      phone: (req.body.phone || '').trim(),
      email: (req.body.email || '').trim(),
      bio: (req.body.bio || '').trim(),
      status: req.body.status || 'Active',
      photo: req.file ? `/uploads/teachers/${req.file.filename}` : '',
      createdAt: new Date().toISOString()
    };
    db.prepare('INSERT INTO teachers(_id,name,status,json_data,createdAt) VALUES (?,?,?,?,?)').run(item._id, item.name, item.status, JSON.stringify(item), item.createdAt);
    res.status(201).json({ success: true, message: 'Faculty member added.', data: item });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/teachers/:id — with optional new photo
router.put('/:id', protect, (req, res, next) => { req.uploadDir = 'teachers'; next(); }, upload.single('photo'), (req, res) => {
  try {
    const row = db.prepare('SELECT json_data FROM teachers WHERE _id=?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Faculty member not found.' });
    const existing = JSON.parse(row.json_data);

    // Delete old photo if new one uploaded
    if (req.file && existing.photo) {
      const oldPath = path.join(__dirname, '../../', existing.photo);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const updated = {
      ...existing,
      name: (req.body.name || existing.name).trim(),
      subject: (req.body.subject || existing.subject).trim(),
      qualification: (req.body.qualification !== undefined ? req.body.qualification : existing.qualification || '').trim(),
      designation: (req.body.designation !== undefined ? req.body.designation : existing.designation || '').trim(),
      department: (req.body.department !== undefined ? req.body.department : existing.department || '').trim(),
      experience: (req.body.experience !== undefined ? req.body.experience : existing.experience || '').trim(),
      phone: (req.body.phone !== undefined ? req.body.phone : existing.phone || '').trim(),
      email: (req.body.email !== undefined ? req.body.email : existing.email || '').trim(),
      bio: (req.body.bio !== undefined ? req.body.bio : existing.bio || '').trim(),
      status: req.body.status || existing.status || 'Active',
      photo: req.file ? `/uploads/teachers/${req.file.filename}` : existing.photo,
      _id: req.params.id
    };
    db.prepare('UPDATE teachers SET name=?,status=?,json_data=? WHERE _id=?').run(updated.name, updated.status, JSON.stringify(updated), req.params.id);
    res.json({ success: true, message: 'Updated.', data: updated });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/teachers/:id
router.delete('/:id', protect, (req, res) => {
  try {
    const row = db.prepare('SELECT json_data FROM teachers WHERE _id=?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Faculty member not found.' });
    const t = JSON.parse(row.json_data);
    if (t.photo) {
      const p = path.join(__dirname, '../../', t.photo);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    db.prepare('DELETE FROM teachers WHERE _id=?').run(req.params.id);
    res.json({ success: true, message: 'Faculty member deleted.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
