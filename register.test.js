const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server');
const PUBLIC = fs.existsSync(path.join(__dirname, '../public')) ? '../public' : '../dist';
const P = require(PUBLIC + '/policy');
const at = value => new Date(value).getTime();
test('6 PM Philippine cutoff and next-open catch-up are timezone-independent', () => {
  const row = { id: 'cutoff-test', active: true, surrenderedAt: '2026-10-05T07:00:00+08:00' };
  assert.equal(P.maintain([row], at('2026-10-05T17:59:59+08:00'))[0].active, true);
  const exact = P.maintain([row], at('2026-10-05T18:00:00+08:00'))[0];
  assert.equal(exact.active, false); assert.equal(exact.returnedAt, '2026-10-05T10:00:00.000Z');
  assert.equal(exact.autoClosed, true);
  assert.deepEqual(P.maintain([row], at('2026-10-06T08:00:00+08:00'))[0], exact);
  const late = { ...row, surrenderedAt: '2026-10-05T18:01:00+08:00' };
  assert.equal(P.maintain([late], at('2026-10-06T08:00:00+08:00'))[0].active, true);
  assert.equal(P.maintain([late], at('2026-10-06T18:00:00+08:00'))[0].active, false);
  assert.equal(P.dateKey('2026-10-05T23:00:00Z'), '2026-10-06');
});
test('history expires after 30 days; auto-close does not reset old history dates', () => {
  const old = { active: true, surrenderedAt: '2026-01-01T01:00:00Z' };
  assert.equal(P.maintain([old], at('2026-03-01T00:00:00Z')).length, 0);
  const closed = { active: false, surrenderedAt: '2026-01-01T01:00:00Z', returnedAt: '2026-01-01T08:00:00Z' };
  assert.equal(P.maintain([closed], at(closed.returnedAt) + P.RETENTION - 1).length, 1);
  assert.equal(P.maintain([closed], at(closed.returnedAt) + P.RETENTION).length, 0);
});
test('authenticated register, two student devices, retries, retention, persistence and private files', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'surrender-test-'));
  const { server } = createApp({ dataDir, password: 'test-teacher-password' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function req(route, data, extra = {}) {
    const res = await fetch(base + route, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: data === undefined ? undefined : JSON.stringify(data) });
    const text = await res.text(); return { status: res.status, data: res.headers.get('content-type').includes('json') ? JSON.parse(text) : text };
  }
  const deviceA = { 'X-Device-Key': 'a'.repeat(64) }, deviceB = { 'X-Device-Key': 'b'.repeat(64) };
  assert.equal((await req('/api/records')).status, 401);
  assert.equal((await req('/api/login', { password: '2468' })).status, 401);
  const login = await req('/api/login', { password: 'test-teacher-password' });
  const auth = { Authorization: 'Bearer ' + login.data.token };
  const stamp = new Date().toISOString();
  const row = { id: 'student-a-record-001', name: 'Student A', section: 'Cirrus', phone: 'Black phone', surrenderedAt: stamp, active: true };
  assert.equal((await req('/api/records', row, deviceA)).status, 200);
  assert.equal((await req('/api/records', row, deviceA)).status, 200);
  assert.equal((await req('/api/records', { ...row, name: 'Attempt overwrite' }, deviceB)).status, 403);
  assert.equal((await req('/api/my-records', undefined, deviceB)).data.length, 0);
  assert.equal((await req('/api/my-records', undefined, deviceA)).data[0].name, 'Student A');
  assert.equal((await req('/api/records', undefined, auth)).data.length, 1);
  assert.equal((await req('/api/records', undefined, auth)).data[0].ownerHash, undefined);
  assert.equal((await req('/api/records', { ...row, id: 'duplicate-click-001' }, deviceA)).data.id, row.id);
  assert.equal((await req('/api/records/' + row.id + '/return', {}, deviceA)).status, 401);
  assert.equal((await req('/api/records/' + row.id + '/return', {}, auth)).data.active, false);
  assert.equal((await req('/api/records', row, deviceA)).data.active, false);
  const b = { ...row, id: 'student-b-record-001', name: 'Student B', section: 'Alto' };
  await req('/api/records', b, deviceB);
  const returned = await req('/api/records', { ...b, active: false, returnedAt: new Date().toISOString() }, deviceB);
  assert.equal(returned.data.active, false);
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const delayed = await req('/api/records', { ...row, id: 'delayed-offline-001', surrenderedAt: yesterday }, deviceA);
  assert.equal(delayed.data.active, false); assert.equal(delayed.data.autoClosed, true);
  assert.equal(delayed.data.returnedAt, new Date(P.closeAt(yesterday)).toISOString());
  const stale = { ...row, id: 'expired-offline-001', surrenderedAt: new Date(Date.now() - 40 * 86400000).toISOString() };
  assert.equal((await req('/api/records', stale, deviceA)).status, 410);
  const disk = JSON.parse(fs.readFileSync(path.join(dataDir, 'records.json')));
  assert.equal(disk.length, 3); assert.equal(disk.every(r => !r.active), true);
  for (const target of ['/data/records.json', '/data/teacher-access.txt', '/server.js', '/%2e%2e%2fdata/records.json', '/api/missing']) assert.equal((await req(target)).status, 404);
  assert.equal((await req('/api/records', { ...row, id: 'empty-name-001', name: ' ' }, deviceA)).status, 400);
  assert.equal((await req('/api/my-records', undefined, { ...deviceA, Origin: 'http://example.com' })).status, 403);
  assert.equal((await req('/')).status, 200);
  await req('/api/logout', {}, auth);
  assert.equal((await req('/api/records', undefined, auth)).status, 401);
  const corruptPath = path.join(dataDir, 'records.json'); fs.writeFileSync(corruptPath, '{broken');
  assert.equal((await req('/api/my-records', undefined, deviceA)).status, 500);
  assert.equal(fs.readFileSync(corruptPath, 'utf8'), '{broken');
});
test('QR decodes correctly offline for LAN and long GitHub subpath URLs', () => {
  const qrCode = require(PUBLIC + '/vendor/qrcode');
  const decode = require('./qr-decoder/package/dist/jsQR');
  const urls = ['http://192.168.100.30:4174/?scan=1', 'https://example.github.io/school-phone-surrender-attendance/public/?scan=1'];
  for (const url of urls) {
    const qr = qrCode(0, 'M'); qr.addData(url); qr.make();
    const size = (qr.getModuleCount() + 8) * 8, rgba = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const row = Math.floor(y / 8) - 4, col = Math.floor(x / 8) - 4;
      if (row >= 0 && col >= 0 && row < qr.getModuleCount() && col < qr.getModuleCount() && qr.isDark(row, col)) for (let c = 0; c < 3; c++) rgba[(y * size + x) * 4 + c] = 0;
    }
    assert.equal(decode(rgba, size, size).data, url);
    assert.match(qr.createSvgTag({ cellSize: 5, margin: 20, scalable: true }), /<svg/);
  }
});
