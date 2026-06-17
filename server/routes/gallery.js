const express     = require('express');
const router      = express.Router();
const path        = require('path');
const fs          = require('fs');
const { db, newId } = require('../db');
const { protect } = require('../middleware/auth');
const upload      = require('../middleware/upload');

router.get('/', (req, res) => {
  try {
    const { limit=20, page=1, category } = req.query;
    let sql = 'SELECT json_data FROM gallery WHERE 1=1';
    const p = [];
    if (category) { sql += ' AND category=?'; p.push(category); }
    sql += ' ORDER BY createdAt DESC';
    let data = db.prepare(sql).all(...p).map(r=>JSON.parse(r.json_data));
    const total = data.length;
    data = data.slice((parseInt(page)-1)*parseInt(limit), parseInt(page)*parseInt(limit));
    res.json({ success: true, data, total });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', protect, (req,res,next)=>{req.uploadDir='gallery';next();}, upload.single('image'), (req, res) => {
  try {
    if (!req.body.title) return res.status(400).json({ success: false, message: 'Title required.' });
    if (!req.file)       return res.status(400).json({ success: false, message: 'Image required.' });
    const item = { _id: newId(), title: req.body.title, description: req.body.description||'', imageUrl: `/uploads/gallery/${req.file.filename}`, category: req.body.category||'Other', featured: req.body.featured==='true', createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO gallery(_id,category,json_data,createdAt) VALUES (?,?,?,?)').run(item._id,item.category,JSON.stringify(item),item.createdAt);
    res.status(201).json({ success: true, message: 'Image uploaded.', data: item });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', protect, (req, res) => {
  try {
    const row = db.prepare('SELECT json_data FROM gallery WHERE _id=?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Not found.' });
    const item = JSON.parse(row.json_data);
    if (item.imageUrl && !item.imageUrl.startsWith('/images/')) {
      const fp = path.join(__dirname,'../../',item.imageUrl);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    db.prepare('DELETE FROM gallery WHERE _id=?').run(req.params.id);
    res.json({ success: true, message: 'Deleted.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
