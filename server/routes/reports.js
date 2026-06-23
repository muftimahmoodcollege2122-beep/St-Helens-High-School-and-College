const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { readDB } = require('../db');

const { JWT_SECRET } = require('../config/jwtSecret');

// Reports open in a new browser tab (window.open) for printing, so we can't
// attach an Authorization header — accept the token via ?token= query param too.
function protectViaQueryOrHeader(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.query.token;
    if (!token) return res.status(401).send('Access denied. No token provided.');
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).send('Invalid or expired token.');
  }
}
const protect = protectViaQueryOrHeader;

function page(title, bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#222;padding:30px;}
    h1{font-size:20px;border-bottom:3px solid #8b1a1a;padding-bottom:8px;margin-bottom:4px}
    .sub{color:#666;font-size:12px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
    th{background:#8b1a1a;color:#fff}
    tr:nth-child(even){background:#f7f7f7}
    @media print{ body{padding:10px} }
  </style></head><body>
  <h1>St. Helen's High School &amp; College</h1>
  <div class="sub">${title} — Generated ${new Date().toLocaleString()}</div>
  ${bodyHtml}
  <script>window.onload = () => window.print();</script>
  </body></html>`;
}

router.get('/students', protect, (req,res) => {
  const { class: cls, section } = req.query;
  let data = readDB('students');
  if (cls)     data = data.filter(s => s.class === cls);
  if (section) data = data.filter(s => s.section === section);
  const rows = data.map(s => `<tr><td>${s.rollNo||''}</td><td>${s.name||''}</td><td>${s.fatherName||''}</td><td>${s.class||''}</td><td>${s.section||''}</td><td>${s.gender||''}</td><td>${s.fatherPhone||''}</td><td>${s.status||''}</td></tr>`).join('');
  const html = `<table><tr><th>Roll No</th><th>Name</th><th>Father Name</th><th>Class</th><th>Section</th><th>Gender</th><th>Phone</th><th>Status</th></tr>${rows}</table>`;
  res.send(page('Student Record', html));
});

router.get('/fees', protect, (req,res) => {
  const { month, status } = req.query;
  let data = readDB('fees');
  if (month)  data = data.filter(f => f.month === month);
  if (status) data = data.filter(f => f.status === status);
  const students = readDB('students');
  const rows = data.map(f => {
    const s = students.find(x => x._id === f.student || x.rollNo === f.student);
    return `<tr><td>${s?s.rollNo:''}</td><td>${s?s.name:(f.student||'')}</td><td>${f.month||''}</td><td>${f.amount||''}</td><td>${f.status||''}</td></tr>`;
  }).join('');
  const html = `<table><tr><th>Roll No</th><th>Name</th><th>Month</th><th>Amount</th><th>Status</th></tr>${rows}</table>`;
  res.send(page('Fee Record', html));
});

router.get('/results', protect, (req,res) => {
  const { exam, year, class: cls } = req.query;
  let data = readDB('results');
  if (exam) data = data.filter(r => r.exam === exam);
  if (year) data = data.filter(r => r.year === year);
  if (cls)  data = data.filter(r => r.class === cls);
  const rows = data.map(r => {
    const total = (r.subjects||[]).reduce((s,x)=>s+(+x.totalMarks||0),0);
    const obtained = (r.subjects||[]).reduce((s,x)=>s+(+x.obtainedMarks||0),0);
    const pct = total ? ((obtained/total)*100).toFixed(1)+'%' : '';
    return `<tr><td>${r.rollNo||''}</td><td>${r.studentName||''}</td><td>${r.class||''}</td><td>${r.exam||''}</td><td>${obtained}/${total}</td><td>${pct}</td><td>${r.remarks||''}</td></tr>`;
  }).join('');
  const html = `<table><tr><th>Roll No</th><th>Name</th><th>Class</th><th>Exam</th><th>Marks</th><th>%</th><th>Remarks</th></tr>${rows}</table>`;
  res.send(page('Result Record', html));
});

router.get('/attendance', protect, (req,res) => {
  const { attOps } = require('../db');
  const { date, class: cls, section } = req.query;
  const data = attOps.query({ date, cls, section });
  const rows = data.map(a => `<tr><td>${a.date||''}</td><td>${a.rollNo||''}</td><td>${a.class||''}</td><td>${a.section||''}</td><td>${a.status||''}</td></tr>`).join('');
  const html = `<table><tr><th>Date</th><th>Roll No</th><th>Class</th><th>Section</th><th>Status</th></tr>${rows}</table>`;
  res.send(page('Attendance Record', html));
});

router.get('/payments', protect, (req,res) => {
  const { status, method } = req.query;
  const students = readDB('students');
  let data = readDB('fees').filter(f => f.paymentSubmission);
  if (status) data = data.filter(f => f.status === status);
  if (method) data = data.filter(f => f.paymentSubmission.method === method);
  const rows = data.map(f => {
    const s = students.find(x => x._id === f.student || x.rollNo === f.student);
    const p = f.paymentSubmission;
    return `<tr>
      <td>${s?s.rollNo:''}</td><td>${s?s.name:''}</td><td>${s?s.fatherName:''}</td><td>${s?s.fatherPhone:''}</td>
      <td>${f.month||''}</td><td>${f.amount||''}</td>
      <td>${p.payerName||''}</td><td>${p.payerPhone||''}</td>
      <td>${p.method||''}</td><td>${p.transactionId||''}</td>
      <td>${f.status||''}</td><td>${p.submittedAt?new Date(p.submittedAt).toLocaleDateString():''}</td>
    </tr>`;
  }).join('');
  const html = `<table><tr><th>Roll No</th><th>Student</th><th>Father Name</th><th>Father Phone</th><th>Month</th><th>Amount</th><th>Payer Name</th><th>Payer Phone</th><th>Method</th><th>Transaction ID</th><th>Status</th><th>Submitted</th></tr>${rows}</table>`;
  res.send(page('Fee Payments Report', html));
});

function buildReceiptHtml(f) {
  const students = readDB('students');
  const s = students.find(x => x._id === f.student || x.rollNo === f.student);
  const p = f.paymentSubmission || {};
  const receiptNo = 'RCPT-' + (f._id||'').slice(-8).toUpperCase();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fee Receipt</title>
  <style>
    body{font-family:Arial,sans-serif;color:#222;padding:30px;max-width:600px;margin:0 auto}
    .hdr{text-align:center;border-bottom:3px solid #8b1a1a;padding-bottom:12px;margin-bottom:18px}
    .hdr h1{margin:0;font-size:20px}
    .hdr p{margin:2px 0;font-size:12px;color:#666}
    .title{text-align:center;font-size:16px;font-weight:bold;margin:14px 0;letter-spacing:1px}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
    td{padding:7px 4px;border-bottom:1px solid #eee}
    td:first-child{font-weight:600;color:#555;width:40%}
    .amt{font-size:22px;font-weight:bold;color:#1a7d3a;text-align:center;margin:18px 0;border:2px dashed #1a7d3a;padding:10px;border-radius:8px}
    .ft{margin-top:30px;font-size:11px;color:#888;text-align:center}
    @media print{ body{padding:10px} }
  </style></head><body>
  <div class="hdr"><h1>St. Helen's High School &amp; College</h1><p>Official Fee Payment Receipt</p></div>
  <div class="title">FEE RECEIPT — ${receiptNo}</div>
  <table>
    <tr><td>Student Name</td><td>${s?s.name:''}</td></tr>
    <tr><td>Roll Number</td><td>${s?s.rollNo:''}</td></tr>
    <tr><td>Class / Section</td><td>${s?(s.class+' '+(s.section||'')):''}</td></tr>
    <tr><td>Father Name</td><td>${s?s.fatherName:''}</td></tr>
    <tr><td>Fee Month</td><td>${f.month||''}</td></tr>
    <tr><td>Payer Name</td><td>${p.payerName||'-'}</td></tr>
    <tr><td>Payer Phone</td><td>${p.payerPhone||'-'}</td></tr>
    <tr><td>Payment Method</td><td>${p.method||'-'}</td></tr>
    <tr><td>Transaction ID</td><td>${p.transactionId||'-'}</td></tr>
    <tr><td>Paid On</td><td>${f.paidAt?new Date(f.paidAt).toLocaleString():''}</td></tr>
  </table>
  <div class="amt">Amount Paid: PKR ${(f.amount||0).toLocaleString()}</div>
  <div class="ft">This is a computer-generated receipt. Generated ${new Date().toLocaleString()}.</div>
  <script>window.onload = () => window.print();</script>
  </body></html>`;
}

router.get('/receipt/:feeId', protect, (req,res) => {
  const fees = readDB('fees');
  const f = fees.find(x => x._id === req.params.feeId);
  if (!f) return res.status(404).send('Fee record not found.');
  if (f.status !== 'Paid') return res.status(400).send('This fee is not marked Paid yet — no receipt available.');
  res.send(buildReceiptHtml(f));
});

// Public (no admin token) — parents can view/print their own receipt.
router.get('/receipt-public/:feeId', (req,res) => {
  const fees = readDB('fees');
  const f = fees.find(x => x._id === req.params.feeId);
  if (!f) return res.status(404).send('Fee record not found.');
  if (f.status !== 'Paid') return res.status(400).send('This fee is not marked Paid yet — no receipt available.');
  res.send(buildReceiptHtml(f));
});

module.exports = router;
