// ── JSON → SQLite Migration ───────────────────────────────────────────────────
// DEPRECATED: migration now runs automatically inside server/db/index.js
// every time the app starts (safe, idempotent, and correctly routes
// 'attendance' into its own indexed table instead of the generic store,
// which this old standalone script did not do). No need to run this file
// manually — just start the server normally.
console.log('ℹ️  This script is deprecated. Migration now runs automatically on server start.');
console.log('   Just run the app normally (npm start) — no manual migration needed.');
