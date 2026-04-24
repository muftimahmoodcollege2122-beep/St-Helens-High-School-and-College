// ── Teachers CRUD ─────────────────────────────────────────────────────────────
const express        = require('express');
const router         = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect }    = require('../middleware/auth');
const upload         = require('../middleware/upload');

// GET /api/teachers  (public — active only)
router.get('/', (req, res) => {
  try {
    const data = readDB('teachers')
      .filter(t => t.status !== 'Inactive')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/teachers/all  (admin — all records)
router.get('/all', protect, (req, res) => {
  try {
    const data = readDB('teachers').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/teachers
router.post('/',
  protect,
  (req, res, next) => { req.uploadDir = 'teachers'; next(); },
  upload.single('photo'),
  (req, res) => {
    try {
      const { name, subject } = req.body;
      if (!name || !subject) {
        return res.status(400).json({ success: false, message: 'Name and subject are required.' });
      }
      const all  = readDB('teachers');
      const item = {
        _id:           newId(),
        name:          name.trim(),
        subject:       subject.trim(),
        qualification: (req.body.qualification || '').trim(),
        designation:   (req.body.designation   || '').trim(),
        experience:    (req.body.experience    || '').trim(),
        phone:         (req.body.phone         || '').trim(),
        bio:           (req.body.bio           || '').trim(),
        status:        req.body.status || 'Active',
        photo:         req.file ? `/uploads/teachers/${req.file.filename}` : '',
        createdAt:     new Date().toISOString()
      };
      all.push(item);
      writeDB('teachers', all);
      res.status(201).json({ success: true, message: 'Teacher added.', data: item });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  }
);

// PUT /api/teachers/:id
router.put('/:id', protect, (req, res) => {
  try {
    const all = readDB('teachers');
    const idx = all.findIndex(t => t._id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Teacher not found.' });
    all[idx] = {
      ...all[idx],
      ...req.body,
      _id:    req.params.id,
      status: req.body.status || all[idx].status || 'Active'
    };
    writeDB('teachers', all);
    res.json({ success: true, message: 'Updated.', data: all[idx] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/teachers/:id
router.delete('/:id', protect, (req, res) => {
  try {
    let all = readDB('teachers');
    const idx = all.findIndex(t => t._id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Teacher not found.' });
    all.splice(idx, 1);
    writeDB('teachers', all);
    res.json({ success: true, message: 'Teacher deleted.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
