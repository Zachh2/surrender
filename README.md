# Phone Surrender Attendance

## GitHub Pages phase test

Upload the contents of `dist/` to the repository root and enable GitHub Pages. This mode is useful for testing the UI and the local offline queue. A static GitHub Pages site cannot share offline records between different phones because it has no local database server.

## Shared school-LAN mode (no internet required)

Use the included Node server when the teacher needs student phones to write into one shared register over the school Wi-Fi/LAN:

```bash
node server.js
```

The server prints the LAN URL. Open that URL on the teacher computer, then generate the QR from the page. Students scan the QR while connected to the same Wi-Fi/LAN. Records are saved in `data/records.json`, so refreshing teacher access keeps the register. The app caches its shell for temporary internet loss, while the LAN API keeps new records shared.

If you upload the flat package from `outputs/phone-surrender-attendance`, `node server.js` works directly. If you keep the repository layout, run it from the project folder that contains `dist/`.

Do not use the demo PIN (`2468`) for real school records. Add real teacher authentication before production use.
