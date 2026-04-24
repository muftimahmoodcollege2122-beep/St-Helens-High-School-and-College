// ── Admin auth middleware ─────────────────────────────────────────────────────
const jwt        = require('jsonwebtoken');
const { readDB } = require('../db');

const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }
    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const users = readDB('users');
    const user  = users.find(u => u._id === decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Token invalid. User not found.' });
    }

    const { password: _, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ success: false, message: 'Admin access required.' });
};

module.exports = { protect, adminOnly };
