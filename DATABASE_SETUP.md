# Database Setup — SQLite (handles millions of records)

This app currently ships with the JSON-based data layer working out of the
box (no native compile step, deploys cleanly anywhere). To upgrade to
SQLite for higher record volumes, follow the steps below on your real
server — not in any sandboxed/restricted-network build environment.

## 1. Add better-sqlite3 and regenerate the lock file

```bash
npm install better-sqlite3@^9.4.3
```

This single command adds it to `package.json`, downloads + compiles the
native binary for your server's OS/Node version, and updates
`package-lock.json` to match — all in sync, so `npm ci` will work on
your next deploy.

If the compile step fails, your server is missing build tools (rare on
managed hosts, common on minimal/restricted containers):

```bash
apt-get install -y build-essential python3
npm install better-sqlite3@^9.4.3
```

## 2. Switch the DB layer to SQLite

The SQLite-based `server/db/index.js` (indexed schema, same `readDB` /
`writeDB` / `attOps` API as the JSON version — no route files need to
change) is available in this repo's git history at commit `e3e7662`.
Restore it with:

```bash
git show e3e7662:server/db/index.js > server/db/index.js
git show e3e7662:server/db/migrate.js > server/db/migrate.js
```

## 3. Migrate existing JSON data into SQLite

```bash
npm run migrate
```

Safe to run even if some JSON files are empty or missing — it skips them
and prints a per-collection summary of how many records were imported.

## 4. Start the server

```bash
npm start
```

The SQLite database file will be created at:
```
server/db/schools/shhs/shhs.db
```

## 5. (Optional) Clean up old JSON files

Once you've confirmed everything works correctly with real data, archive
the old `.json` files — they're no longer read by the app:

```bash
mkdir -p server/db/schools/shhs/_archived-json
mv server/db/schools/shhs/*.json server/db/schools/shhs/_archived-json/
```

## Why SQLite over JSON files

JSON files re-read and re-write the *entire* collection on every single
write — fine for hundreds of records, but it breaks down badly at scale
(slow, memory-heavy, eventually crashes) somewhere in the tens-of-thousands
range, well before a million.

SQLite is a single file like JSON was, but it's properly indexed
(`idx_att_class_sec`, `idx_students_rollNo`, etc.), so queries stay fast
and writes stay incremental even with millions of rows — the attendance
table in particular, which grows by one row per student per day, is built
to handle this via the `attOps` fast-path helpers (`replaceBulk`, `query`,
`studentHistory`) instead of full-table reads.

