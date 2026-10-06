# Verification — 6 October 2026

Completed on this build:
- JavaScript syntax checks for the server, client, shared policy and service worker.
- Five passing automated test groups: Philippine 6 PM boundaries, catch-up after shutdown, late check-ins, rolling 30-day expiry; authenticated API and independent device ownership; retry idempotency and no reopening after return; JSON persistence and corrupt-file preservation; private-file and cross-origin rejection; offline cache routing under a GitHub subpath; offline QR decoding for LAN and long GitHub URLs.
- Local Chromium browser: student surrender saved to the server; teacher sign-in; dashboard survives refresh; manual return; month/date filters; Cirrus record excluded from Alto.
- Offline browser test: server stopped, cached page reloaded, student surrender and return saved, browser refreshed, server restarted; queued closed record appeared in teacher history.
- Responsive layout visually checked at 320px, 390px and desktop 1280px. No page-wide horizontal overflow at 320px. Filters scroll within their own rows; mobile records use labelled cards.
- Runtime assets are bundled locally. No external QR, font, script, analytics or image request is required.

Limitations:
- Safari/iOS and Opera were not available for direct device testing; no claim of exhaustive browser/device coverage.
- First-ever offline public-URL visits cannot work. No network connection means no cross-device sync. Plain HTTP LAN URLs do not support service-worker installation on typical mobile browsers.
- GitHub Pages cannot run this Node server. The README gives the supported LAN and static-testing setups.
- The timer requires the server to be running. Otherwise due records are processed on restart/access; their history timestamp remains the intended cutoff.
- JSON storage is intended for one running Node process with persistent disk.
- The test data and preview-only password were kept in temporary test storage and excluded from this package.

Repeat with: `npm test` (Node.js 20+; no package installation needed).
