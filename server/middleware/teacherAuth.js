// ── Teacher auth middleware ───────────────────────────────────────────────────
const jwt        = require('jsonwebtoken');
const { readDB } = require('../db');

const teacherProtect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided.' });
    }
    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, (process.env.JWT_SECRET || 'sthelens-shhs-fallback-secret-key-change-in-production'));

    const teachers = readDB('teacher-accounts');
    const teacher  = teachers.find(t => t._id === decoded.id);
    if (!teacher) {
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    const { password: _, ...safe } = teacher;
    req.teacher = safe;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired.' });
    }
    res.status(401).json({ success: false, message: 'Unauthorized.' });
  }
};

module.exports = { teacherProtect };
