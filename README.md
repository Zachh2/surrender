# Surrender Desk — complete upload package

## Start here: shared register without internet

1. Install Node.js 20 or newer on the teacher computer (one-time setup).
2. Extract this entire ZIP. Keep `server.js` beside the `public` folder.
3. Open a terminal in the extracted folder and run `node server.js` (or `npm start`). No npm install is required.
4. Keep this computer running and connected to the same school Wi-Fi/router as the students. The router does not need internet.
5. Open the **School link** printed in the terminal. Use that link's QR; localhost/127.0.0.1 on a student phone points to the phone itself.
6. Open `data/teacher-access.txt` on the teacher computer for its generated teacher password. Click **Teacher access** and enter it. The old public PIN 2468 no longer works.
7. A student submits their name and section. **Your teacher can see this record** means the server has saved it. **Sync pending** means the record is still only on that phone.

If Windows Firewall prompts, the school administrator must permit the server on the intended private school network. Phones must be allowed to communicate with the teacher computer; guest networks with client/AP isolation prevent this. Use a stable/reserved LAN IP and reprint the QR if the address changes. If several network addresses appear, choose the school Wi-Fi address.

## Folder structure

```text
public/
  index.html
  app.js
  policy.js
  service-worker.js
  manifest.webmanifest
  favicon.svg
  vendor/qrcode.js
  vendor/QR-LICENSE.txt
server.js
package.json
README.md
VALIDATION.md
index.html                  # redirects GitHub Pages to public/
service-worker.js           # retires the old root-scoped cache
.gitignore
.nojekyll
tests/                      # repeatable logic, API, cache, QR tests
```

The server creates these private local files on first use:
- `data/records.json`: shared register, empty initially.
- `data/teacher-access.txt`: this installation's generated password.

Only `public/` is served by Node. Student records and teacher credentials never belong in `public/`. Keep `data/` out of GitHub and preserve it when updating the app. The included .gitignore excludes it. For a Node hosting panel, put the full package in its application directory, use `node server.js` as the startup command, and set `PORT` to the panel's assigned port. A static-only public directory cannot run the JSON backend.

## What offline actually supports

| Situation | Result |
| --- | --- |
| Same Wi-Fi/LAN as the running server; no internet | First scans, student submissions, teacher register, and QR generation work. |
| HTTPS page previously loaded in this same browser | The saved app can reopen without a connection after its offline cache finishes. Submissions queue locally. |
| Phone disconnected from the server | Records cannot reach the teacher until the phone reconnects and opens this same site. |
| First visit to a public website with no connection | The page cannot load. A QR is a link, not a copy of the website or a network connection. |
| Plain HTTP LAN site | Works while connected to the LAN. Most mobile browsers cannot install an offline service worker on an HTTP IP address. |
| GitHub Pages only | Student UI and device-local queue can be tested. No shared teacher login or JSON database server. |

Do not clear site data or use private browsing for offline records. The operating system may clear cached data; it is not a guaranteed backup. GitHub Pages and a LAN IP are different sites: their local queues do not transfer automatically. Use the LAN link from the start for a shared offline classroom register.

A captive portal like public voucher Wi-Fi requires router/network configuration. This ZIP does not turn GitHub Pages into a captive portal.

References: [GitHub Pages static hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [service-worker secure contexts and caching](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## GitHub phase test

Upload the whole extracted package to your repository and enable Pages from the root of the chosen branch. The root index redirects to `public/`. Alternatively, upload only the contents of `public/` to the Pages root. Use the final hosted page to generate the QR.

If updating the earlier version at the repository root, include the new root `service-worker.js` so the old cached prototype is retired. Load once online and refresh if you still see the old design.

GitHub Pages cannot execute `server.js` or write to `data/records.json`. For shared records over the internet, this same Node app needs an always-running Node host with persistent disk and HTTPS. For no-internet school use, run it locally as above.

## Daily cutoff, history, and teacher access

- Active records auto-unsurrender at the first **6:00 PM Asia/Manila** after submission. A submission at/after 6 PM closes at 6 PM the next day.
- The running server checks every 10 seconds and on requests. If it was off at 6 PM, it catches up on restart/next request, storing the intended 6 PM timestamp.
- A closed/suspended browser cannot run an exact-time task. Device-only records catch up when the app next opens. Shared records are maintained by the server.
- Auto-unsurrender closes the attendance record; it does not prove the student physically collected the phone. History labels automatic and manual returns separately.
- Both student and teacher can manually unsurrender. A delayed sync cannot reopen a closed record.
- History has January–December, year, date and section filters. Returned records expire **30 days after return** (rolling monthly retention); exported copies are separate.
- Teacher access survives refresh in the same tab for up to 24 hours. Server restart or session expiry requires another login. Sign out clears the cached teacher view.
- API authorization protects the teacher register. Each student browser can read/update its own records only. Names are self-entered, not verified student identities.
- CSV exports the filtered view; JSON exports the teacher register.
- Use this HTTP mode on a trusted school LAN. For public hosting, terminate HTTPS and keep a single Node process with persistent storage. The JSON store is designed for a single school host, not multiple server replicas.

You can set `TEACHER_PASSWORD` in the server environment to choose a password. Otherwise it generates and preserves one in the private data folder. No password is shipped in this ZIP.

## Verification

Run `npm test` or `node --test tests/*.test.js`. See `VALIDATION.md` for completed checks and browser limitations. Test records and credentials are not included in the package.
