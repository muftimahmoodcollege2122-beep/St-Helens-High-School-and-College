const router      = require('express').Router();
const { db, newId } = require('../db');
const { protect } = require('../middleware/auth');

router.post('/', (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name||!email||!subject||!message)
      return res.status(400).json({ success: false, message: 'name, email, subject, message required.' });
    const item = { _id: newId(), name, email, phone: req.body.phone||'', subject, message, status:'unread', createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO contact(_id,status,json_data,createdAt) VALUES (?,?,?,?)').run(item._id,'unread',JSON.stringify(item),item.createdAt);
    res.status(201).json({ success: true, message: 'Message sent! We will get back to you soon.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/', protect, (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT json_data FROM contact WHERE 1=1';
    const p = [];
    if (status) { sql += ' AND status=?'; p.push(status); }
    sql += ' ORDER BY createdAt DESC';
    const data = db.prepare(sql).all(...p).map(r=>JSON.parse(r.json_data));
    res.json({ success: true, data, total: data.length });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/:id', protect, (req, res) => {
  try {
    const row = db.prepare('SELECT json_data FROM contact WHERE _id=?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Not found.' });
    const updated = { ...JSON.parse(row.json_data), ...req.body, _id: req.params.id };
    db.prepare('UPDATE contact SET status=?,json_data=? WHERE _id=?').run(updated.status||'unread',JSON.stringify(updated),req.params.id);
    res.json({ success: true, message: 'Updated.', data: updated });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', protect, (req, res) => {
  try {
    const changes = db.prepare('DELETE FROM contact WHERE _id=?').run(req.params.id).changes;
    if (!changes) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, message: 'Deleted.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
