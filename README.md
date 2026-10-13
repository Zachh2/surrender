# Surrender Desk — JSON file edition

Start with [START-HERE.md](START-HERE.md).

This package runs on a school PC or a persistent Node.js host. It stores records in `data/records.json`. The website assets are in `public/`; the server and private data stay outside that folder.

On Windows, install a current Node.js 22 or newer, extract the package into a new folder, and run `START-SCHOOL.cmd`. Keep its terminal open. On the school PC, open `http://localhost:4174/`. Students use the school network address displayed in the terminal or QR, while connected to the same Wi-Fi/LAN.

The first server start creates `data/teacher-access.txt` containing the teacher password. An optional `TEACHER_PASSWORD` environment variable overrides that file. Do not upload passwords or real student records to GitHub.

No dependency installation is required. Alternative startup:

```sh
npm start
```

Run checks:

```sh
npm test
```

The API and website are served together by `server.js`. `/api/index` resolves to the health endpoint; no separate Vercel API deployment is required. This package does not change your previous Vercel site.

Automatic close runs at/after 6 PM Philippine time while the server is running, with catch-up after downtime. Closed records expire after 30 days. Teacher refresh persistence, section/date history, student returns, and JSON/CSV exports are included.

Run only one server process per data directory. For hosting, use a persistent writable disk and set `DATA_DIR` to its private mount path. Read the setup guide for firewall, offline, backup, and hosting details.

Third-party license notices are included in `public/vendor/QR-LICENSE.txt` and `tests/qr-decoder/package/LICENSE`.
