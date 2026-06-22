const router = require('express').Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');
const { lookupRateLimit } = require('../middleware/rateLimit');
const { sendWhatsApp } = require('../utils/whatsapp');

// Public — parent submits leave request by roll number
router.post('/submit', lookupRateLimit, (req, res) => {
  try {
    const { rollNo, fromDate, toDate, reason, parentName, parentPhone } = req.body;
    if (!rollNo || !fromDate || !reason) return res.status(400).json({ success:false, message:'rollNo, fromDate, reason required.' });
    const students = readDB('students');
    const sr = students.find(s => s.rollNo === rollNo);
    if (!sr) return res.status(404).json({ success:false, message:'Student not found.' });
    const item = {
      _id: newId(), rollNo, studentName: sr.name, class: sr.class, section: sr.section,
      fromDate, toDate: toDate||fromDate, reason, parentName: parentName||sr.fatherName||'',
      parentPhone: parentPhone||sr.fatherPhone||'', status: 'Pending',
      createdAt: new Date().toISOString()
    };
    const data = readDB('leaveRequests');
    data.push(item);
    writeDB('leaveRequests', data);
    // Notify school admin via WA (if WA_NOTIFY_ADMIN_PHONE set)
    const adminPhone = process.env.WA_NOTIFY_ADMIN_PHONE;
    if (adminPhone) {
      sendWhatsApp(adminPhone, `📋 New leave request from *${sr.name}* (Roll: ${rollNo}) for ${fromDate}${toDate&&toDate!==fromDate?' to '+toDate:''}.\nReason: ${reason}\n— St. Helen's Portal`);
    }
    res.status(201).json({ success:true, message:'Leave request submitted. School will review and notify you.', data: item });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// Public — parent checks status by roll number
router.get('/status/:rollNo', lookupRateLimit, (req, res) => {
  try {
    const data = readDB('leaveRequests').filter(r => r.rollNo === req.params.rollNo);
    res.json({ success:true, data: data.sort((a,b) => b.createdAt > a.createdAt ? 1 : -1) });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// Admin — list all leave requests
router.get('/', protect, (req, res) => {
  try {
    const { status, class:cls } = req.query;
    let data = readDB('leaveRequests');
    if (status) data = data.filter(r => r.status === status);
    if (cls) data = data.filter(r => r.class === cls);
    res.json({ success:true, data: data.sort((a,b) => b.createdAt > a.createdAt ? 1 : -1) });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// Admin — approve or reject
router.patch('/:id', protect, async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!['Approved','Rejected'].includes(status)) return res.status(400).json({ success:false, message:'status must be Approved or Rejected.' });
    const data = readDB('leaveRequests');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx === -1) return res.status(404).json({ success:false, message:'Not found.' });
    data[idx].status = status;
    data[idx].note = note||'';
    data[idx].reviewedAt = new Date().toISOString();
    writeDB('leaveRequests', data);
    // Notify parent
    if (data[idx].parentPhone) {
      const emoji = status === 'Approved' ? '✅' : '❌';
      const msg = `${emoji} Leave request for *${data[idx].studentName}* (${data[idx].fromDate}${data[idx].toDate !== data[idx].fromDate ? ' to '+data[idx].toDate : ''}) has been *${status}*.${note ? '\nNote: '+note : ''}\n— St. Helen's High School & College`;
      sendWhatsApp(data[idx].parentPhone, msg);
    }
    res.json({ success:true, data:data[idx] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/:id', protect, (req, res) => {
  try {
    const data = readDB('leaveRequests');
    if (!data.find(r => r._id === req.params.id)) return res.status(404).json({ success:false, message:'Not found.' });
    writeDB('leaveRequests', data.filter(r => r._id !== req.params.id));
    res.json({ success:true });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
