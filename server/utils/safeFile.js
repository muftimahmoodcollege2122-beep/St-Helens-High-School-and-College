const fs = require('fs');
const path = require('path');

const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');

// Only deletes files that resolve to inside the uploads/ directory —
// prevents an admin-supplied imageUrl like "../../../../etc/passwd"
// (or any field that ends up stored as imageUrl/photo) from being used
// to delete files outside the intended folder.
function safeUnlink(relativeUrl) {
  if (!relativeUrl || typeof relativeUrl !== 'string') return false;
  const cleaned = relativeUrl.replace(/^\/+/, ''); // strip leading slash(es)
  const resolved = path.resolve(path.join(__dirname, '..', '..'), cleaned);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep) && resolved !== UPLOADS_ROOT) return false;
  if (fs.existsSync(resolved)) { fs.unlinkSync(resolved); return true; }
  return false;
}

module.exports = { safeUnlink };
