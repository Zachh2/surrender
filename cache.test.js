const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const PUBLIC = fs.existsSync(path.join(__dirname, '../public')) ? '../public' : '../dist';
test('offline navigation works under GitHub subpaths and API responses bypass caching', async () => {
  const events = {}, scope = 'https://school.example/repo/public/';
  const shell = new Response('<html>offline shell</html>');
  const context = {
    URL, Response, self: { registration: { scope }, location: { origin: 'https://school.example' }, addEventListener: (name, listener) => { events[name] = listener; } },
    caches: { open: async () => ({ match: async key => key === './index.html' ? shell : undefined }) },
    fetch: async () => { throw new Error('offline'); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, PUBLIC, 'service-worker.js'), 'utf8'), context);
  for (const pathname of ['/api/records', '/api/my-records', '/api/health']) {
    let intercepted = false;
    events.fetch({ request: { url: 'https://school.example' + pathname, method: 'GET', mode: 'cors' }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
  }
  let result;
  events.fetch({ request: { url: scope + '?scan=1', method: 'GET', mode: 'navigate' }, respondWith: promise => { result = promise; } });
  assert.match(await (await result).text(), /offline shell/);
  let intercepted = false;
  events.fetch({ request: { url: 'https://school.example/another-app/', method: 'GET', mode: 'navigate' }, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
});
