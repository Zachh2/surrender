# Surrender Desk — actual JSON file edition

This version saves student records in **`data/records.json` on the school PC/server**. No Supabase, database account, or Vercel is needed.

## School PC: start here

1. Extract the ZIP into a **new folder** on the school PC. Do not run it inside the ZIP or overwrite a folder that already contains real records.
2. Install Node.js 22 or newer from [nodejs.org](https://nodejs.org/), if it is not installed.
3. Double-click **`START-SCHOOL.cmd`**. Keep its terminal window open. No `npm install` is required.
4. On that PC, open **http://localhost:4174/**. Do not double-click `public/index.html`.
5. Open **`data/teacher-access.txt`** after the server starts. Its contents are your teacher password. The server creates a random password once and reuses it after restart. There is no default `2468` password.
6. Connect the students' phones to the **same Wi-Fi/LAN** as the school PC. Internet/mobile data is not required while that local connection works.
7. Scan the QR shown by the running website. It points to the PC's network address, such as `http://192.168.1.20:4174/?scan=1`. A phone cannot reach the school PC through `localhost` or `127.0.0.1`.

If there are multiple network addresses, choose the school Wi-Fi/Ethernet address in the dropdown below the QR. Avoid VPN or virtual-adapter addresses. The terminal also lists the school links.

If Windows asks about Node.js network access, allow it on the school's trusted private network. Some guest Wi-Fi networks isolate devices: ask the network administrator to allow phones to reach the school PC on TCP port 4174. Keep the PC awake and the server running during use. An IP reservation on the router keeps printed QR codes stable.

## Where is the data?

```text
surrender-desk-json/
  server.js                  <- starts both website and API
  START-SCHOOL.cmd
  package.json
  public/                    <- website assets only
    index.html
    app.js
    policy.js
    service-worker.js
    manifest.webmanifest
    favicon.svg
    vendor/
  data/
    records.json             <- actual saved student data
    teacher-access.txt       <- generated on first start
```

`records.json` contains an array of records with the student's name, section, phone label, surrender time and return status. Ownership hashes associate records with a student's browser. Teacher exports omit those hashes. **Keep `data/` outside `public/`** so students cannot download the whole register or password. The server serves only `public/` as website files.

The supplied `data/records.json` is empty. Each accepted save updates this file using a temporary file followed by replacement. Restarting the server does not reset it. If the JSON file is damaged, the server reports an error instead of overwriting it with an empty register.

For a backup, use Teacher access → Export JSON. To back up the complete on-disk register, stop the server and copy the `data/` folder to a private location. Do not manually edit `records.json` while the server is running, or upload real student data/passwords to GitHub.

## The API/index error

There is no separate `api/index.js` deployment in this version. **`node server.js` starts the API and website together.** These routes are handled by the running server:

- `/api/health` — should return `"ok":true` and `"storage":"json-file"`.
- `/api/index` and `/api/index.js` — compatibility aliases for the health endpoint.
- `/api/login`, `/api/records`, `/api/my-records` — actual app API endpoints.

Uploading only `public/` to a static file host cannot run this API. Use the school PC instructions above or a persistent Node.js host below. The previous Vercel domain is not changed by this package.

## Test with two devices

1. On a student's phone, open the school's network link and submit a test student. Wait for **Your teacher can see this record**.
2. On the PC, choose **Teacher access** and enter the generated password. Select the student's section. The record should appear.
3. Refresh the teacher page: it remains in teacher view in that tab while its login is valid.
4. On the student's phone, tap **Un-surrender after class**. The entry moves to **History**, organized by section, year, month, and date.
5. Stop the server with Ctrl+C and start it again. Sign in to Teacher access again; the record remains in `data/records.json`.

Teacher sessions expire after 24 hours and are invalidated when the server restarts. A normal page refresh does not restart the server.

## Daily close and offline use

The running server checks records every 10 seconds. At/after **6 PM Philippine time**, active entries are closed at their recorded 6 PM deadline and move to history. Requests also perform this check. If the server was off, it catches up when restarted/next accessed. Check-ins at or after 6 PM close the following day. This marks an entry as auto-unsurrendered; it does not confirm physical collection.

Closed records expire after **30 days from their return timestamp**. This is rolling retention, not a wipe of the entire register each month. Exported backup files have their own retention.

No internet is needed on a working school LAN. With no Wi-Fi/LAN connection at all, a phone cannot send its record to the PC. An already-open page can save pending changes locally and retry when reconnected. On plain HTTP LAN addresses, browsers generally do not allow service-worker caching, so do not expect a closed/reloaded page to open when disconnected from the PC. HTTPS hosting supports caching after the first online load. Do not clear browser data while changes are pending.

## Optional Node.js hosting

Use a host that supports a **long-running Node process and a persistent writable disk**. Put the **whole package** in the application folder, not only `public/`.

- Start command: `npm start`.
- Node version: 22 or newer.
- Build/install step: none required; there are no runtime dependencies.
- `PORT`: use the port assigned by the hosting provider. The server binds to `0.0.0.0` by default.
- `DATA_DIR`: set this to a private persistent disk directory, for example `/var/lib/surrender-desk` (the actual mount path depends on the host).
- `TEACHER_PASSWORD`: optionally set your own password in the host's server environment settings. Otherwise read `teacher-access.txt` inside `DATA_DIR` after startup.
- Run **one instance/process** for each data directory. A shared JSON file is not designed for multiple server replicas.
- For a public domain, use the host's HTTPS reverse proxy and open the final HTTPS URL. Its QR will point to that domain.

Vercel and GitHub Pages are not hosts for this JSON-file edition. Vercel functions have a read-only filesystem except temporary scratch storage, which is unsuitable for this persistent register. [Vercel filesystem documentation](https://vercel.com/docs/functions/runtimes#file-system-support)

To customize a school PC, copy `.env.example` to `.env`, edit the values, and run `START-SCHOOL.cmd`/`npm start` again. Keep the `.env` private. Setting `TEACHER_PASSWORD` overrides the generated password file.

## If a phone cannot connect

- Check that the terminal still says the server is running and that the PC is awake.
- Use the school PC's LAN address shown in the terminal, not its localhost address.
- Put the phone and PC on a network that permits them to communicate; guest/client isolation can block this.
- Check the firewall's private-network permission for Node.js/TCP 4174.
- If the PC's network address changed, reload the PC's page and reprint the QR.
- If the port is already in use, close the extra server or change `PORT` in `.env` and use the new link.
- On managed Node hosting, ensure the provider starts `server.js` and preserves the configured data disk.

The app cannot force students to stay on a browser page. Names/sections are self-entered; the teacher should verify the physical hand-in.
