const router      = require('express').Router();
const { db, newId } = require('../db');
const { protect } = require('../middleware/auth');

router.get('/', (req, res) => {
  try {
    const { status, type, limit=10, page=1 } = req.query;
    let sql = 'SELECT json_data FROM events WHERE 1=1';
    const p = [];
    if (status) { sql += ' AND status=?'; p.push(status); }
    if (type)   { sql += ' AND type=?';   p.push(type); }
    sql += ' ORDER BY date ASC';
    let data = db.prepare(sql).all(...p).map(r=>JSON.parse(r.json_data));
    const total = data.length;
    data = data.slice((parseInt(page)-1)*parseInt(limit), parseInt(page)*parseInt(limit));
    res.json({ success: true, data, total });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT json_data FROM events WHERE _id=?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, data: JSON.parse(row.json_data) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', protect, (req, res) => {
  try {
    const { title, description, date } = req.body;
    if (!title||!description||!date) return res.status(400).json({ success: false, message: 'title, description, date required.' });
    const item = { _id: newId(), ...req.body, createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO events(_id,date,status,json_data,createdAt) VALUES (?,?,?,?,?)').run(item._id,item.date,item.status||'upcoming',JSON.stringify(item),item.createdAt);
    res.status(201).json({ success: true, message: 'Event created.', data: item });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/:id', protect, (req, res) => {
  try {
    const row = db.prepare('SELECT json_data FROM events WHERE _id=?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Not found.' });
    const updated = { ...JSON.parse(row.json_data), ...req.body, _id: req.params.id };
    db.prepare('UPDATE events SET date=?,status=?,json_data=? WHERE _id=?').run(updated.date,updated.status||'upcoming',JSON.stringify(updated),req.params.id);
    res.json({ success: true, message: 'Updated.', data: updated });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', protect, (req, res) => {
  try {
    const changes = db.prepare('DELETE FROM events WHERE _id=?').run(req.params.id).changes;
    if (!changes) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, message: 'Deleted.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
