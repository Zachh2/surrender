# Validation

Final automated check: 13 October 2026, using the supplied Node.js test runner.

**8 tests passed.** The tests cover:

- Cached navigation and exclusion of private API responses from the service-worker cache.
- Actual JSON file persistence and generated-password persistence after stopping and restarting the server.
- `/api`, `/api/`, `/api/index`, `/api/index.js`, and `/api/health` route handling.
- Twenty simultaneous student submissions without losing records in the JSON file.
- Student device isolation, teacher authentication, logout, duplicate retries, and manual returns.
- Invalid payloads and attempts to alter return timestamps.
- Philippine-time 6 PM closing, catch-up after downtime, and 30-day retention.
- QR decoding without an external QR service.
- Private data/password files returning 404 to HTTP requests.
- Corrupt JSON producing an error without overwriting the file. The deliberate corruption test prints a register error; this is expected.

Browser checks completed on 8 October using the actual JSON server and synthetic QA records: the LAN QR pointed to the PC's network address rather than localhost; a student submission was confirmed; the teacher register displayed that student; and refresh retained teacher view. The responsive frontend was retained from the version previously checked at 320px and 390px.

Physical Safari, Opera and student-phone network access were not verified. The school's Wi-Fi isolation/firewall settings and any external hosting configuration still need the two-device check in START-HERE.md.

No QA records, teacher passwords or environment secrets are included in the delivery. The supplied data/records.json is an empty array. Existing user data must be backed up before replacing an older installation.
