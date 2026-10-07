# Surrender Desk — Vercel + Supabase setup

Ito ang bagong cloud version. Kasama ang `public/` folder at lahat ng backend files. **Kailangan ang buong package sa GitHub, hindi public/ lang.** Hindi pa naka-connect sa Supabase ang live website mo hanggang matapos ang steps sa ibaba.

**Teacher password:** ikaw ang pipili. Ang value ng `TEACHER_PASSWORD` sa Vercel ang ilalagay sa Teacher access. Walang default password. Hindi ito ang Supabase account password o database password.

## 1. Gumawa ng Supabase project

Open [Supabase Dashboard](https://supabase.com/dashboard), create a project, and wait until it is ready. Keep the project's database password somewhere private; hindi ito kailangan ilagay sa website.

## 2. I-create ang database at 6 PM schedule

In your new project, open **SQL Editor → New query**.

1. Open `supabase/01-schema.sql` from this package, copy its **entire contents**, paste into SQL Editor, and click **Run**. Wait for success.
2. Create another query. Copy the entire `supabase/02-schedule.sql`, paste, and **Run**.
3. The second query must show two jobs with `active = true`: `surrender-desk-daily-close` and `surrender-desk-maintenance`.

If `pg_cron` is unavailable, enable **Integrations → Cron → pg_cron**, then rerun the second file. These are database jobs, so your laptop and the student pages can be closed. Supabase's Cron module supports SQL jobs directly. [Supabase Cron](https://supabase.com/docs/guides/cron)

Keep the database/Cron timezone at its default **UTC**. The daily schedule is `10:00 UTC`, which is **6:00 PM Philippine time**. A second job catches up and removes expired history every 10 minutes. Paused or unavailable databases cannot execute jobs until they recover; API requests also run catch-up maintenance.

## 3. Get your Supabase connection values

Get the **Project URL** from the project's **Connect** dialog. It looks like `https://YOUR-PROJECT.supabase.co`.

Go to **Project Settings → API Keys**. Create/copy a **secret key** beginning with `sb_secret_`. Use it only in the server settings below. This app sends database requests through its backend; it does not need a browser publishable key. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

## 4. Upload all files to the GitHub repository

Extract the ZIP. At your app's repository root, put these files/folders:

```text
api/
  index.js
lib/
  database.js
  handler.js
public/
  index.html
  app.js
  policy.js
  service-worker.js
  manifest.webmanifest
  favicon.svg
  vendor/
    qrcode.js
    QR-LICENSE.txt
scripts/
supabase/
tests/
package.json
pnpm-lock.yaml
vercel.json
.env.example
.gitignore
START-HERE.md
README.md
TESTING.md
```

`package.json` and `vercel.json` must be at the root that Vercel builds. If you upload a wrapper folder instead, set Vercel's Root Directory to that folder.

For an existing v4 repository, replace its app source with this package. The old root `server.js`, root `index.html` redirect, and root service worker belong to the previous package and can be removed from the new Git commit. Keep any old private data backups outside the public repository. GitHub's Upload files button replaces matching files but does not remove obsolete files automatically.

Upload `public/vendor/` too: the missing QR library caused the blank QR in the earlier deployment. No external QR service is used in this version.

Do not upload `node_modules/`, a real `.env`, credentials, or student exports. `.env.example` contains placeholders only.

## 5. Configure Vercel and redeploy

Open your existing Vercel project, then **Settings → Environment Variables**. Add these exact names for **Production** (and Preview only if you also want preview deployments to use this database):

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Your HTTPS Supabase Project URL, without `/rest/v1` |
| `SUPABASE_SECRET_KEY` | Your server secret key starting with `sb_secret_` |
| `TEACHER_PASSWORD` | A password you choose, 12–100 characters |

Enter these values directly in Vercel. Never put the secret key or teacher password in `public/app.js`, GitHub, or chat.

In the build settings, use:

| Setting | Value |
| --- | --- |
| Framework Preset | Other |
| Root Directory | Folder containing this package's `vercel.json` |
| Build Command | `npm run build` |
| Output Directory | `public` |
| Install Command | Default/automatic |
| Node.js version | 22.x |

The included `vercel.json` also specifies the build/output and API routes. Vercel serves only `public/` as static content and runs `api/index.js` as a Node function. [Vercel build settings](https://vercel.com/docs/builds/configure-a-build)

Save, then open **Deployments → latest deployment → Redeploy**. Changing environment variables alone does not update an existing deployment.

## 6. Check before sharing the QR

1. Open `https://YOUR-SITE.vercel.app/api/health`. Expect JSON containing `"ok":true`, `"mode":"cloud"`, and `"schema":5`.
2. Open the homepage online. Expect a visible QR and **Register connected**.
3. Submit a test student. Wait for **Your teacher can see this record.**
4. On a second device/browser, open the **same website**, select **Teacher access**, and enter your `TEACHER_PASSWORD`. The student should be in the correct section.
5. Refresh the teacher page. It should stay in Teacher access in the same tab. Teacher sessions expire after 24 hours; closing the browser session can require signing in again.
6. On the student's browser, tap **Un-surrender after class**. In Teacher access, open **History**, select the section, month, and date. The record should appear there.
7. Verify both Supabase Cron jobs are active. In **Integrations → Cron**, check run history after the next scheduled execution.

Optional command-line check:

```sh
npm run check:live -- https://YOUR-SITE.vercel.app
```

## Offline: what works

Open the deployed HTTPS site once while connected, using the browser the student will keep using. Wait for **This browser has saved the app for offline use.** The page and QR can then load from that browser's cache, and check-ins/returns are saved locally while disconnected. Reopen/keep the same page active after reconnecting so it can send the queue to Supabase.

**The teacher cannot receive an offline phone's record until that phone reconnects.** A first-time QR scan on a phone with neither internet nor a cached copy cannot download a Vercel website. Scanning with another browser does not reuse the first browser's cache. Private browsing or clearing site data may remove saved offline records. Do not clear site data while records are waiting to sync.

For first-time use without internet, the alternative is a local school server reachable over school Wi-Fi/LAN. This package is the Vercel/Supabase version and needs internet to synchronize. A QR code provides the address; it cannot provide a network connection.

## Data and daily cutoff

Records are stored as **JSONB in a private Supabase table**, with dates and device ownership stored alongside them. Teacher **Export JSON** downloads all currently retained records as a `.json` file; **Export CSV** downloads the current filtered view. Data is not saved to a public `students.json` file.

At **6 PM PHT**, active records become history marked **Auto · 6 PM**. This closes the register entry and does not prove that the phone was physically collected. A check-in made at or after 6 PM closes at the following day's 6 PM. Students can still un-surrender earlier after collecting their phones.

Closed records expire **30 days after their return/auto-close timestamp**. This is a rolling 30-day policy, not deletion of all records on the first of every month. January–December tabs remain available, but expired months will be empty. Browser copies are pruned when the app runs again; exported files and provider backups are outside app cleanup.

## If it still does not work

| What you see | Fix |
| --- | --- |
| `/api/health` is 404 or an HTML page | Upload `api/`, `lib/`, and `vercel.json`; check Vercel Root Directory and redeploy the full package. |
| Server setup incomplete | Add the named environment variables in Vercel Production and redeploy. |
| Database setup incomplete | Run all of `supabase/01-schema.sql` in the same project as `SUPABASE_URL`. Keep the `public` schema exposed through Supabase's Data API. |
| Database access failed | Use a secret/server key from that same project; do not use the publishable/anon key. Rerun the schema permissions if they were changed. |
| Database temporarily unavailable | Check that the Supabase project is running, its Data API is enabled, and the Project URL is correct. Pending records remain on the student's browser. |
| Wrong password | Use your Vercel `TEACHER_PASSWORD` value. To change it, update that variable and redeploy; previous teacher sessions become invalid. |
| Too many login attempts | Wait 10 minutes, then enter the correct password. |
| QR is blank | Confirm `https://YOUR-SITE.vercel.app/vendor/qrcode.js` loads JavaScript, then reload online. |
| Previous design/script remains | Reload online after deployment, then close and reopen the page to activate its updated service worker. Keep pending data; do not clear browser storage. |
| Student stays pending | Use the same deployed origin on both devices, bring the student's browser online, and open it to retry. Check `/api/health` first. |

Your live domain has not been changed by this ZIP. After these steps, share the homepage URL if you need the public health/QR endpoints checked. Do not share your password or secret key.
