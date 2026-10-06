'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), os = require('node:os');
const PUBLIC = path.join(__dirname, fs.existsSync(path.join(__dirname, 'public')) ? 'public' : 'dist');
const policy = require(path.join(PUBLIC, 'policy.js'));
function createApp(options = {}) {
  const dataDir = options.dataDir || path.join(__dirname, 'data');
  const file = path.join(dataDir, 'records.json'), secretFile = path.join(dataDir, 'teacher-access.txt');
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]\n');
  let password = options.password || process.env.TEACHER_PASSWORD;
  if (!password) {
    if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(9).toString('base64url'), { mode: 0o600 });
    password = fs.readFileSync(secretFile, 'utf8').trim();
  }
  const digest = s => crypto.createHash('sha256').update(s).digest('hex');
  const sessions = new Map(), failures = new Map();
  function write(items) {
    fs.writeFileSync(file + '.tmp', JSON.stringify(items, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  }
  function read() {
    // Never overwrite unreadable records with an empty register.
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (!Array.isArray(raw)) throw new Error('Invalid register format');
    const clean = policy.maintain(raw);
    if (JSON.stringify(clean) !== JSON.stringify(raw)) write(clean);
    return clean;
  }
  const visible = ({ ownerHash, ...record }) => record;
  function send(res, status, body, type = 'application/json; charset=utf-8') {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
    res.end(Buffer.isBuffer(body) ? body : type.startsWith('application/json') ? JSON.stringify(body) : body);
  }
  function fail(status, message) { const err = new Error(message); err.status = status; throw err; }
  async function body(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'JSON required');
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 8192) fail(413, 'Request too large'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { fail(400, 'Invalid JSON'); }
  }
  function teacher(req) {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const until = sessions.get(token);
    if (!until || until <= Date.now()) { sessions.delete(token); return false; }
    return true;
  }
  function owner(req) {
    const secret = req.headers['x-device-key'];
    if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) fail(401, 'Student device key required');
    return digest(secret);
  }
  const sections = ['Cirrus', 'Alto', 'Stratus', 'Nimbus', 'Other'];
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png' };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) fail(403, 'Same-origin requests only');
      if (req.method === 'GET' && url.pathname === '/api/health') {
        const addresses = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => 'http://' + a.address + ':' + server.address().port + '/?scan=1');
        return send(res, 200, { ok: true, service: 'phone-surrender', studentUrls: addresses });
      }
      if (req.method === 'POST' && url.pathname === '/api/login') {
        const key = req.socket.remoteAddress, now = Date.now();
        const attempt = failures.get(key) || { count: 0, until: now + 600000 };
        if (attempt.until > now && attempt.count >= 10) fail(429, 'Too many attempts. Try again in 10 minutes.');
        const input = await body(req);
        if (typeof input.password !== 'string' || !crypto.timingSafeEqual(Buffer.from(digest(input.password)), Buffer.from(digest(password)))) {
          failures.set(key, { count: attempt.until > now ? attempt.count + 1 : 1, until: attempt.until > now ? attempt.until : now + 600000 });
          fail(401, 'Incorrect teacher password');
        }
        failures.delete(key);
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token, now + 24 * 3600000);
        return send(res, 200, { token });
      }
      if (req.method === 'POST' && url.pathname === '/api/logout') {
        sessions.delete((req.headers.authorization || '').replace(/^Bearer /, ''));
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/api/records') {
        if (!teacher(req)) fail(401, 'Teacher sign-in required');
        return send(res, 200, read().map(visible));
      }
      if (req.method === 'GET' && url.pathname === '/api/my-records') {
        const key = owner(req);
        return send(res, 200, read().filter(r => r.ownerHash === key).map(visible));
      }
      if (req.method === 'POST' && url.pathname === '/api/records') {
        const key = owner(req), input = await body(req), now = Date.now();
        if (!/^[a-zA-Z0-9-]{8,100}$/.test(input.id || '') || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 70 || !sections.includes(input.section) || typeof input.active !== 'boolean') fail(400, 'Check the student name, section and record');
        const start = new Date(input.surrenderedAt).getTime();
        if (!Number.isFinite(start) || start > now + 300000) fail(400, 'Check the date and time on this phone');
        if (start < now - policy.RETENTION) fail(410, 'This record is outside the 30-day retention period');
        if (input.phone !== undefined && (typeof input.phone !== 'string' || input.phone.length > 40)) fail(400, 'Phone label is too long');
        const records = read(), existing = records.find(r => r.id === input.id);
        if (existing && existing.ownerHash !== key) fail(403, 'This record belongs to another device');
        if (existing && !existing.active) return send(res, 200, visible(existing));
        if (!existing && input.active) {
          const active = records.find(r => r.ownerHash === key && r.active);
          if (active) return send(res, 200, visible(active));
        }
        let record = existing || { id: input.id, ownerHash: key, name: input.name.trim(), section: input.section, phone: input.phone?.trim() || 'Not specified', surrenderedAt: new Date(start).toISOString(), active: true };
        if (!input.active) {
          const end = new Date(input.returnedAt).getTime();
          if (!Number.isFinite(end) || end < start || end > now + 300000) fail(400, 'Invalid return time');
          const due = policy.closeAt(record.surrenderedAt);
          record = { ...record, active: false, returnedAt: new Date(Math.min(end, due)).toISOString(), autoClosed: end >= due };
        }
        record = policy.maintain([record], now)[0];
        if (!record) fail(410, 'Record expired');
        write([record, ...records.filter(r => r.id !== record.id)]);
        return send(res, 200, visible(record));
      }
      const match = url.pathname.match(/^\/api\/records\/([a-zA-Z0-9-]+)\/return$/);
      if (req.method === 'POST' && match) {
        if (!teacher(req)) fail(401, 'Teacher sign-in required');
        const records = read(), record = records.find(r => r.id === match[1]);
        if (!record) fail(404, 'Record no longer exists');
        if (record.active) { record.active = false; record.returnedAt = new Date().toISOString(); record.autoClosed = false; write(records); }
        return send(res, 200, visible(record));
      }
      if (url.pathname.startsWith('/api/')) fail(404, 'API route not found');
      if (!['GET', 'HEAD'].includes(req.method)) fail(405, 'Method not allowed');
      const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const target = path.resolve(PUBLIC, '.' + name);
      if (!target.startsWith(PUBLIC + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) fail(404, 'File not found');
      return send(res, 200, req.method === 'HEAD' ? Buffer.alloc(0) : fs.readFileSync(target), types[path.extname(target)] || 'application/octet-stream');
    } catch (error) {
      if (!error.status) console.error('Register error:', error.message);
      if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : 'Register unavailable. Ask the teacher to check the server.' });
    }
  });
  const timer = setInterval(() => {
    try { read(); } catch (error) { console.error('Could not maintain register:', error.message); }
    for (const [token, expires] of sessions) if (expires <= Date.now()) sessions.delete(token);
    for (const [key, attempt] of failures) if (attempt.until <= Date.now()) failures.delete(key);
  }, 10000);
  timer.unref(); server.on('close', () => clearInterval(timer));
  return { server, secretFile };
}
if (require.main === module) {
  const { server, secretFile } = createApp();
  const port = Number(process.env.PORT || 4174);
  server.listen(port, '0.0.0.0', () => {
    console.log('Surrender Desk is ready. Keep this server running.');
    for (const a of Object.values(os.networkInterfaces()).flat()) if (a && a.family === 'IPv4' && !a.internal) console.log('School link: http://' + a.address + ':' + port + '/');
    console.log(process.env.TEACHER_PASSWORD ? 'Teacher password: configured through TEACHER_PASSWORD.' : 'Teacher password is in: ' + secretFile);
    console.log('Use the same Wi-Fi/LAN. No internet is required. Records: data/records.json');
  });
}
module.exports = { createApp };
