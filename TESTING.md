# Validation — 7 October 2026

## Automated checks

`node scripts/check-build.js` passed. Required assets and references, bundled QR library, Vercel output/routing configuration, and absence of credentials in frontend assets were checked.

`node --test tests/*.test.js` passed **17 tests** using Node 24.19 and PGlite 0.5.8. The package targets Vercel Node 22; deployed Node 22 and a live Supabase project have not been exercised in this workspace.

The tests execute the actual SQL schema/functions in PostgreSQL through PGlite and exercise the actual Node handler over local HTTP. They cover:

- SQL setup and safe reapplication; row-level security; permission denial for anon/authenticated roles.
- Health route and Vercel-style rewritten request paths; same-origin checks.
- Multiple devices sharing the teacher register with isolated student access.
- Duplicate check-ins, immutable submitted identity, stale retries, and manual returns.
- Teacher sessions across independent handler instances, logout, expiry and password changes.
- Login rate limits shared through the database.
- Philippine 6 PM boundary, including midnight and year rollover.
- Scheduled maintenance behavior and exact 30-day history expiry.
- Delayed offline submissions and expired record rejection.
- Invalid input, payload limits, and rejection of unvalidated fields.
- Modern Supabase secret-key headers, legacy compatibility, and sanitized setup/outage errors.
- QR decoding back to the full HTTPS student link without an external service.
- Service worker API-cache exclusion and cached navigation fallback.

## Browser checks

The local preview used the actual frontend and API handler backed by the same PostgreSQL schema in disposable PGlite. Only synthetic QA names and a test-only password were used.

Verified in the Codex in-app Chromium browser:

- Check-in receipt confirmed teacher visibility after database save.
- Teacher register displayed the submitted student.
- Refresh kept the teacher view/session.
- Student un-surrender moved the entry to history.
- Section filtering separated Cirrus and Alto records; all 12 month tabs appeared.
- 390px and 320px phone layouts had no page-wide horizontal overflow.
- During a simulated API outage, the pending check-in survived page refresh.
- After recovery, the queue retried automatically and the receipt confirmed synchronization.
- JSON export downloaded a valid file containing both completed QA records.
- With the local server fully stopped, a reload still displayed the cached student form and QR.
- No JavaScript errors were reported during the online workflow.

The read-only deployment-check script also passed against the local API and assets.

## Checks requiring your deployment

No live Supabase project or Vercel account was configured here. The hosted PostgREST API, actual Vercel build/function routing, and pg_cron scheduler execution still need the setup/verification steps in START-HERE.md. PGlite verifies maintenance SQL behavior but does not run Supabase's pg_cron extension.

Safari/iOS, Android Chrome and Opera were not physically tested. The app uses standard responsive HTML/CSS, Fetch, local storage and HTTPS service workers, but browser storage/privacy settings affect offline use. Test the final HTTPS URL in the browsers your students will use before relying on it for class attendance.
