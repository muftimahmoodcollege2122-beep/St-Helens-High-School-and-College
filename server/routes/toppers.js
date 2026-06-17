const express     = require('express');
const router      = express.Router();
const { db, newId } = require('../db');
const { protect } = require('../middleware/auth');
const upload      = require('../middleware/upload');

router.get('/', (req, res) => {
  try {
    const data = db.prepare('SELECT json_data FROM toppers ORDER BY rank ASC, createdAt ASC').all().map(r=>JSON.parse(r.json_data));
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', protect, (req,res,next)=>{req.uploadDir='toppers';next();}, upload.single('photo'), (req, res) => {
  try {
    const { name, class: cls, exam } = req.body;
    if (!name||!cls||!exam) return res.status(400).json({ success: false, message: 'name, class, exam required.' });
    const count = db.prepare('SELECT COUNT(*) as c FROM toppers').get().c;
    const item = { _id: newId(), name, class: cls, exam, year: req.body.year||'', percentage: req.body.percentage||'', position: req.body.position||'', subject: req.body.subject||'', rank: count+1, photo: req.file?`/uploads/toppers/${req.file.filename}`:'', createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO toppers(_id,rank,json_data,createdAt) VALUES (?,?,?,?)').run(item._id,item.rank,JSON.stringify(item),item.createdAt);
    res.status(201).json({ success: true, data: item });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', protect, (req, res) => {
  try {
    const changes = db.prepare('DELETE FROM toppers WHERE _id=?').run(req.params.id).changes;
    if (!changes) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, message: 'Deleted.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
