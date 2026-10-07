# Surrender Desk v5

School phone attendance for **Vercel + Supabase**. Start with [START-HERE.md](START-HERE.md) for the complete setup and teacher-password instructions.

## Included

- Responsive student form, locally generated QR, offline app cache, and retry queue.
- Shared teacher register with section filters and month/date history.
- Student returns and authenticated teacher returns.
- Database-scheduled 6 PM Philippine-time auto-close and rolling 30-day history retention.
- Teacher JSON/CSV exports; refresh retains the teacher session in the same browser tab.
- No runtime package dependencies; Node's built-in fetch connects to a private Supabase RPC.

## Project structure

`public/` is the deployable frontend. `api/index.js` is the Vercel entry point. `lib/` contains validation, authentication and database calls. `supabase/` contains database schema and scheduled jobs. `scripts/` contains build checks, a local development server and a read-only deployment check.

The static frontend alone cannot provide shared storage or secure teacher access. GitHub holds the source; Vercel runs the app; Supabase holds the records. Do not deploy this as a GitHub Pages-only site.

## Local development

Use Node.js 22.16+ within Node 22 LTS (or a compatible newer Node for local testing). Copy `.env.example` to a private `.env` and fill in the three values after setting up a Supabase test project.

```sh
npm install
npm run build
npm test
npm start
```

The local server binds only to `http://127.0.0.1:4181`. It is a development preview, not a school LAN host. The backend uses the Supabase project from `.env`; use a separate test project to avoid test records in a school register.

`npm test` uses PGlite's local PostgreSQL engine with disposable in-memory data. It does not need Supabase credentials. PGlite is a development dependency only; it does not ship to the browser or replace Supabase in production. A pnpm lockfile is included for reproducible package installation with pnpm.

## Authentication and persistence

Only Vercel reads `SUPABASE_SECRET_KEY` and `TEACHER_PASSWORD`. Public Supabase roles cannot read private tables or execute the app's RPC. Password comparison runs on the server. Random teacher tokens are stored as hashes in the database for 24 hours; password/key changes invalidate previous sessions. Login attempts are limited per IP in the database, so separate function instances share the same limit.

Student browsers create a random device key and can read/return only records belonging to that key. This identifies a browser, not a verified school identity. Names and sections are self-entered; a teacher should verify the physical hand-in. The app cannot lock students into a browser tab, prove phone collection, or prevent a person creating another browser identity.

Records live in `surrender_private.records`, primarily as JSONB. They are not written to Vercel's temporary filesystem or a public JSON asset. Exports contain student records only, never authentication hashes. JSON exports cover all retained records; CSV respects the current dashboard filters.

## Offline behavior

HTTPS service-worker cache stores the app and QR library, never API responses. A previously loaded page can accept offline check-ins and returns. Pending changes are retried while the page is open and when it becomes visible/reconnects. Shared records require an internet connection; no browser can send a record from a fully disconnected phone to the teacher automatically.

Browser caches/storage can be cleared or evicted. Use the same normal browser and origin for offline submissions and subsequent synchronization. A new origin, private session or different scanning browser has separate storage.

The storage keys intentionally match v4 so existing pending records on the **same origin/browser** can be sent after redeploying. This does not import an old local server's JSON database. Keep a separate copy of any earlier exports. Old server-issued teacher tokens are rejected by the new database and require signing in again.

## Schedule and retention

Run both SQL files. The cron jobs run within Supabase independently of Vercel requests, at 10:00 UTC daily and every 10 minutes for catch-up/cleanup. Every API RPC also performs maintenance. Pauses and outages can delay execution; records are then closed using their original 6 PM due timestamp. The clock boundary, browser maintenance and database logic are covered by automated tests.

Keep the default UTC scheduler timezone. Records surrendered at/after 18:00 Asia/Manila close the next day. Closed history expires after 30 days, including records uploaded late from offline devices. Deletion is within app storage; downloaded exports and provider backups have their own retention.

## Validation and deployment

See [TESTING.md](TESTING.md) for tested behaviors and limits. `npm run check:live -- https://YOUR-SITE.vercel.app` performs read-only health/asset checks after deployment. It does not verify your Cron jobs or submit student data.

No account credentials, student records, production environment file, or running database is included in the ZIP. The passwords in automated tests are disposable test fixtures and are not accepted by production.

Third-party license notices: `public/vendor/QR-LICENSE.txt` for the QR generator; `tests/qr-decoder/package/LICENSE` for the test-only QR decoder. Dependency versions are recorded in `package.json` and `pnpm-lock.yaml`.
