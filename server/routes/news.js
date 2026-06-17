const express     = require('express');
const router      = express.Router();
const { db, newId } = require('../db');
const { protect } = require('../middleware/auth');
const upload      = require('../middleware/upload');

router.get('/', (req, res) => {
  try {
    const { limit=10, page=1, category } = req.query;
    let sql = 'SELECT json_data FROM news WHERE 1=1';
    const p = [];
    if (category) { sql += ' AND category=?'; p.push(category); }
    sql += ' ORDER BY createdAt DESC';
    let data = db.prepare(sql).all(...p).map(r=>JSON.parse(r.json_data));
    const total = data.length;
    data = data.slice((parseInt(page)-1)*parseInt(limit), parseInt(page)*parseInt(limit));
    res.json({ success: true, data, total, page: parseInt(page) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT json_data FROM news WHERE _id=?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, data: JSON.parse(row.json_data) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', protect, (req,res,next)=>{req.uploadDir='news';next();}, upload.single('image'), (req, res) => {
  try {
    const { title, body, category, featured } = req.body;
    if (!title||!body) return res.status(400).json({ success: false, message: 'Title and body required.' });
    const item = { _id: newId(), title, body, category: category||'General', featured: featured==='true', image: req.file?`/uploads/news/${req.file.filename}`:'', createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO news(_id,category,json_data,createdAt) VALUES (?,?,?,?)').run(item._id,item.category,JSON.stringify(item),item.createdAt);
    res.status(201).json({ success: true, message: 'News created.', data: item });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/:id', protect, (req, res) => {
  try {
    const row = db.prepare('SELECT json_data FROM news WHERE _id=?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Not found.' });
    const updated = { ...JSON.parse(row.json_data), ...req.body, _id: req.params.id };
    db.prepare('UPDATE news SET category=?,json_data=? WHERE _id=?').run(updated.category||'General',JSON.stringify(updated),req.params.id);
    res.json({ success: true, message: 'Updated.', data: updated });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', protect, (req, res) => {
  try {
    const changes = db.prepare('DELETE FROM news WHERE _id=?').run(req.params.id).changes;
    if (!changes) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, message: 'Deleted.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
