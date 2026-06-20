const jwt = require('jsonwebtoken');
const { readDB } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'sthelens-shhs-fallback-secret-key-change-in-production';

const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer '))
      return res.status(401).json({ success:false, message:'Access denied. No token provided.' });
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success:false, message:'Invalid or expired token.' });
  }
};

module.exports = { protect };
