const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC = fs.existsSync(path.join(ROOT, 'dist')) ? path.join(ROOT, 'dist') : ROOT;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'records.json');
const PORT = Number(process.env.PORT || 4174);

const demoRecords = [
  { id: 'demo-zach', name: 'Zach Altocumulos', section: 'Alto', phone: 'Black Android', surrenderedAt: '2026-10-04T07:42:00', active: true, demo: true },
  { id: 'demo-rhea', name: 'Rhea Dela Cruz', section: 'Cirrus', phone: 'Blue iPhone', surrenderedAt: '2026-10-04T07:39:00', active: true, demo: true },
  { id: 'demo-mia', name: 'Mia Nimbus', section: 'Nimbus', phone: 'White Android', surrenderedAt: '2026-10-03T07:35:00', returnedAt: '2026-10-03T15:40:00', active: false, demo: true }
];

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(demoRecords, null, 2));
syncAutoUnsurrender();
setInterval(syncAutoUnsurrender, 60000);

const readRecords = () => {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (_) { return []; }
};
const writeRecords = (records) => fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));

function autoUnsurrenderAt6PM(records) {
  const now = new Date();
  const manila = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const cutoff = new Date(manila);
  cutoff.setHours(18, 0, 0, 0);
  return records.map((record) => {
    if (record.active && manila >= cutoff) {
      return {
        ...record,
        active: false,
        returnedAt: new Date().toISOString(),
        autoReturned: true,
        historyNote: 'Auto unsurrendered at 6:00 PM'
      };
    }
    return record;
  });
}
function syncAutoUnsurrender() {
  const records = readRecords();
  const updated = autoUnsurrenderAt6PM(records);
  if (JSON.stringify(records) !== JSON.stringify(updated)) writeRecords(updated);
}

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
};
const readBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; if (body.length > 1000000) reject(new Error('payload too large')); });
  req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (_) { reject(new Error('invalid JSON')); } });
  req.on('error', reject);
});
const safeFile = (pathname) => {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(PUBLIC, `.${requested}`);
  return file.startsWith(path.resolve(PUBLIC)) ? file : null;
};
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.css': 'text/css; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' }); return res.end(); }
  if (url.pathname === '/api/health' && req.method === 'GET') return send(res, 200, { ok: true, service: 'phone-surrender' });
  if (url.pathname === '/api/records' && req.method === 'GET') { syncAutoUnsurrender(); return send(res, 200, readRecords()); }
  if (url.pathname === '/api/records' && req.method === 'POST') {
    try {
      const incoming = await readBody(req);
      if (!incoming.id || !incoming.name || !incoming.section || !incoming.surrenderedAt) return send(res, 400, { error: 'id, name, section, and surrenderedAt are required' });
      const records = readRecords();
      const index = records.findIndex((record) => record.id === incoming.id);
      const record = { ...incoming, syncPending: false };
      if (index >= 0) records[index] = { ...records[index], ...record }; else records.unshift(record);
      writeRecords(records);
      return send(res, 200, record);
    } catch (error) { return send(res, 400, { error: error.message }); }
  }
  const match = url.pathname.match(/^\/api\/records\/([^/]+)$/);
  if (match && req.method === 'PATCH') {
    try {
      const incoming = await readBody(req); const records = readRecords(); const index = records.findIndex((record) => record.id === decodeURIComponent(match[1]));
      if (index < 0) return send(res, 404, { error: 'record not found' });
      records[index] = { ...records[index], ...incoming, syncPending: false }; writeRecords(records); return send(res, 200, records[index]);
    } catch (error) { return send(res, 400, { error: error.message }); }
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
  let file = safeFile(url.pathname);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
  try { send(res, 200, fs.readFileSync(file), contentTypes[path.extname(file)] || 'application/octet-stream'); } catch (_) { send(res, 500, { error: 'failed to read site' }); }
});

server.listen(PORT, '0.0.0.0', () => {
  const address = Object.values(require('os').networkInterfaces()).flat().find((item) => item && item.family === 'IPv4' && !item.internal);
  console.log(`Phone Surrender Attendance running on http://${address?.address || 'localhost'}:${PORT}`);
  console.log('Keep this computer and student phones on the same Wi-Fi/LAN for shared offline records.');
});
