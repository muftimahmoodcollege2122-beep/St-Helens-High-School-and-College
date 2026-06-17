const express     = require('express');
const router      = express.Router();
const { db, newId } = require('../db');
const { protect } = require('../middleware/auth');
const upload      = require('../middleware/upload');

// GET /api/teachers — public
router.get('/', (req, res) => {
  try {
    const data = db.prepare("SELECT json_data FROM teachers WHERE status!='Inactive' ORDER BY createdAt ASC").all().map(r=>JSON.parse(r.json_data));
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/teachers/all — admin
router.get('/all', protect, (req, res) => {
  try {
    const data = db.prepare('SELECT json_data FROM teachers ORDER BY createdAt DESC').all().map(r=>JSON.parse(r.json_data));
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/teachers
router.post('/', protect, (req,res,next)=>{req.uploadDir='teachers';next();}, upload.single('photo'), (req, res) => {
  try {
    const { name, subject } = req.body;
    if (!name||!subject) return res.status(400).json({ success: false, message: 'Name and subject are required.' });
    const item = {
      _id: newId(), name: name.trim(), subject: subject.trim(),
      qualification: (req.body.qualification||'').trim(), designation: (req.body.designation||'').trim(),
      experience: (req.body.experience||'').trim(), phone: (req.body.phone||'').trim(),
      bio: (req.body.bio||'').trim(), status: req.body.status||'Active',
      photo: req.file ? `/uploads/teachers/${req.file.filename}` : '',
      createdAt: new Date().toISOString()
    };
    db.prepare('INSERT INTO teachers(_id,name,status,json_data,createdAt) VALUES (?,?,?,?,?)').run(item._id,item.name,item.status,JSON.stringify(item),item.createdAt);
    res.status(201).json({ success: true, message: 'Teacher added.', data: item });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/teachers/:id
router.put('/:id', protect, (req, res) => {
  try {
    const row = db.prepare('SELECT json_data FROM teachers WHERE _id=?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Teacher not found.' });
    const updated = { ...JSON.parse(row.json_data), ...req.body, _id: req.params.id };
    db.prepare('UPDATE teachers SET name=?,status=?,json_data=? WHERE _id=?').run(updated.name,updated.status||'Active',JSON.stringify(updated),req.params.id);
    res.json({ success: true, message: 'Updated.', data: updated });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/teachers/:id
router.delete('/:id', protect, (req, res) => {
  try {
    const changes = db.prepare('DELETE FROM teachers WHERE _id=?').run(req.params.id).changes;
    if (!changes) return res.status(404).json({ success: false, message: 'Teacher not found.' });
    res.json({ success: true, message: 'Teacher deleted.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
