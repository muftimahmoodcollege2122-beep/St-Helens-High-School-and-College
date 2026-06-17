const jwt    = require('jsonwebtoken');
const { db } = require('../db');

const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    const row = db.prepare('SELECT json_data FROM users WHERE _id=?').get(decoded.id);
    if (!row) return res.status(401).json({ success: false, message: 'Token invalid. User not found.' });
    const { password: _, ...safeUser } = JSON.parse(row.json_data);
    req.user = safeUser;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Token expired.' });
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ success: false, message: 'Admin access required.' });
};

module.exports = { protect, adminOnly };
