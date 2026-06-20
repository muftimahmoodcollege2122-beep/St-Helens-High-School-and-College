# Database Setup — SQLite (handles millions of records)

This app uses **better-sqlite3** — a single-file, indexed SQLite database.
It is NOT pre-installed in this sandbox because native binary downloads are
blocked here. On your real server (with normal internet access), follow
these steps once.

## 1. Install dependencies

```bash
npm install
```

This will download and compile `better-sqlite3`'s native binary for your
server's OS/Node version. Takes 10–30 seconds. If it fails, make sure your
server has build tools available (most managed Node hosts already do):

```bash
# Only needed if npm install fails with a gyp/compile error:
apt-get install -y build-essential python3
```

## 2. Migrate existing JSON data into SQLite

Your current data (teachers, news, settings, etc.) lives in JSON files at
`server/db/schools/shhs/*.json`. Run the migration once to import it all
into the new indexed SQLite database:

```bash
npm run migrate
```

This is safe to run even if some JSON files are empty or missing — it just
skips them. You'll see a per-collection summary of how many records were
imported.

## 3. Start the server

```bash
npm start
```

The SQLite database file will be created at:
```
server/db/schools/shhs/shhs.db
```

## 4. (Optional) Clean up old JSON files

Once you've confirmed the site is working correctly with real data showing
up (check the homepage, admin panel, etc.), you can archive or delete the
old `.json` files — they are no longer read by the app:

```bash
mkdir -p server/db/schools/shhs/_archived-json
mv server/db/schools/shhs/*.json server/db/schools/shhs/_archived-json/
```

(Keep this backup folder somewhere safe for a while just in case.)

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

No route files needed to change — `readDB`, `writeDB`, `attOps`, and
`newId` all keep the same function signatures as before.
