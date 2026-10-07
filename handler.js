'use strict';
const crypto = require('node:crypto');
const { config, createDatabase } = require('./database');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function send(res, status, data) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.statusCode = status; res.end(JSON.stringify(data));
}
async function readBody(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) fail(415,'JSON required.');
  if (Number(req.headers['content-length'] || 0) > 8192) fail(413,'Request too large.');
  let data = req.body;
  if (data === undefined) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 8192) fail(413,'Request too large.'); chunks.push(Buffer.from(chunk)); }
    data = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(data)) data = data.toString('utf8');
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (_) { fail(400,'Invalid JSON.'); } }
  if (!data || Array.isArray(data) || typeof data !== 'object') fail(400,'JSON object required.');
  if (Buffer.byteLength(JSON.stringify(data)) > 8192) fail(413,'Request too large.');
  return data;
}
function cleanRecord(input) {
  if (typeof input.id !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(input.id) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 70 || !['Cirrus','Alto','Stratus','Nimbus','Other'].includes(input.section) || typeof input.active !== 'boolean') fail(400,'Check the student name, section and record.');
  if (input.phone !== undefined && (typeof input.phone !== 'string' || input.phone.length > 40)) fail(400,'Phone label must be 40 characters or fewer.');
  const stamp = Date.parse(input.surrenderedAt);
  if (!Number.isFinite(stamp) || stamp > Date.now() + 300000) fail(400,'Check the date and time on this phone.');
  const result = { id:input.id, name:input.name.trim(), section:input.section, phone:input.phone?.trim() || 'Not specified', surrenderedAt:new Date(stamp).toISOString(), active:input.active };
  if (!input.active) {
    const end = Date.parse(input.returnedAt);
    if (!Number.isFinite(end) || end < stamp || end > Date.now() + 300000) fail(400,'Invalid return time.');
    result.returnedAt = new Date(end).toISOString();
  }
  return result;
}
function createHandler(options = {}) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'https://local.invalid');
      let route = url.searchParams.get('route') || url.pathname.replace(/^\/api\/?/, '');
      if (req.query?.route) route = Array.isArray(req.query.route) ? req.query.route.join('/') : req.query.route;
      if (!/^[a-zA-Z0-9/-]+$/.test(route)) fail(404,'API route not found.');
      if (req.headers.origin) {
        let origin;
        try { origin = new URL(req.headers.origin); } catch (_) { fail(403,'Same-origin requests only.'); }
        if (origin.host !== req.headers.host) fail(403,'Same-origin requests only.');
      }
      const settings = options.settings || config();
      const rpc = options.rpc || createDatabase(settings);
      const authVersion = crypto.createHmac('sha256',settings.key).update('teacher-password:' + settings.password).digest('hex');
      const teacher = () => {
        const raw = (req.headers.authorization || '').replace(/^Bearer /,'');
        if (!/^[a-f0-9]{64}$/.test(raw)) fail(401,'Teacher sign-in required.');
        return { tokenHash:digest(raw), authVersion };
      };
      const owner = () => {
        const raw = req.headers['x-device-key'];
        if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/.test(raw)) fail(401,'Student device key required.');
        return digest(raw);
      };
      if (req.method === 'GET' && route === 'health') return send(res,200,await rpc('health'));
      if (req.method === 'POST' && route === 'login') {
        const input = await readBody(req);
        if (typeof input.password !== 'string' || input.password.length > 100) fail(400,'Enter the teacher password.');
        // Vercel overwrites x-forwarded-for. Local development uses the socket IP.
        const ip = process.env.VERCEL ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : req.socket?.remoteAddress || 'local';
        const bucket = crypto.createHmac('sha256',settings.key).update('login:' + ip).digest('hex');
        const matches = crypto.timingSafeEqual(Buffer.from(digest(input.password)),Buffer.from(digest(settings.password)));
        const token = crypto.randomBytes(32).toString('hex');
        await rpc('login',{ bucket,passwordMatches:matches,tokenHash:digest(token),authVersion });
        return send(res,200,{ token });
      }
      if (req.method === 'POST' && route === 'logout') { await rpc('logout',teacher()); return send(res,200,{ok:true}); }
      if (req.method === 'GET' && route === 'records') return send(res,200,await rpc('teacher_records',teacher()));
      if (req.method === 'GET' && route === 'my-records') return send(res,200,await rpc('student_records',{ownerHash:owner()}));
      if (req.method === 'POST' && route === 'records') {
        const ownerHash = owner(), record = cleanRecord(await readBody(req));
        return send(res,200,await rpc('submit',{ownerHash,record}));
      }
      const match = route.match(/^records\/([a-zA-Z0-9-]{8,100})\/return$/);
      if (req.method === 'POST' && match) return send(res,200,await rpc('teacher_return',{...teacher(),id:match[1]}));
      fail(404,'API route not found.');
    } catch (error) {
      // Do not log request bodies, credentials or database responses.
      send(res,error.status || 500,{error:error.status ? error.message : 'Register temporarily unavailable. Try again.',code:error.status === 503 ? 'SETUP_OR_DATABASE_UNAVAILABLE' : undefined});
    }
  };
}
module.exports = { createHandler, cleanRecord };
