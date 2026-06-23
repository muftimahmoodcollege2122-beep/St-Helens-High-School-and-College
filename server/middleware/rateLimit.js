// ── In-memory rate limiter — no extra package needed ─────────────────────────
// Blocks an IP after too many failed attempts within a window.

const attempts = new Map(); // ip → { count, firstAt, blockedUntil }

const MAX_ATTEMPTS  = 5;          // max fails before block
const WINDOW_MS     = 15 * 60 * 1000; // 15 minute window
const BLOCK_MS      = 30 * 60 * 1000; // 30 minute block

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of attempts.entries()) {
    if (entry.blockedUntil < now && entry.firstAt + WINDOW_MS < now) {
      attempts.delete(ip);
    }
  }
}, 10 * 60 * 1000);

function loginRateLimit(req, res, next) {
  const ip  = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = attempts.get(ip) || { count: 0, firstAt: now, blockedUntil: 0 };

  // Currently blocked?
  if (entry.blockedUntil > now) {
    const mins = Math.ceil((entry.blockedUntil - now) / 60000);
    return res.status(429).json({
      success: false,
      message: `Too many failed login attempts. Try again in ${mins} minute(s).`
    });
  }

  // Reset window if expired
  if (now - entry.firstAt > WINDOW_MS) {
    entry.count    = 0;
    entry.firstAt  = now;
    entry.blockedUntil = 0;
  }

  // Attach onFail callback to response so route can call it
  res.loginFailed = () => {
    entry.count++;
    if (entry.count >= MAX_ATTEMPTS) {
      entry.blockedUntil = now + BLOCK_MS;
    }
    attempts.set(ip, entry);
  };

  res.loginSuccess = () => {
    attempts.delete(ip); // reset on successful login
  };

  attempts.set(ip, entry);
  next();
}

module.exports = { loginRateLimit };

// ── Generic lookup rate limiter ──────────────────────────────────────────────
// Parent portal routes are unauthenticated by design (roll number is the only
// "credential"), which makes them scrapable since roll numbers are sequential.
// This won't fully fix that (needs a real second factor like DOB/CNIC), but it
// throttles bulk scraping from a single IP.
const lookupAttempts = new Map();
function lookupRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const WINDOW = 60 * 1000, MAX = 30; // 30 lookups/minute/IP
  const entry = lookupAttempts.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > WINDOW) { entry.count = 0; entry.windowStart = now; }
  entry.count++;
  lookupAttempts.set(ip, entry);
  if (entry.count > MAX) return res.status(429).json({ success:false, message:'Too many requests. Please slow down.' });
  next();
}
module.exports.lookupRateLimit = lookupRateLimit;
