'use strict';
// Read-only deployment check. Never submits a student record or a password.
async function main() {
  const raw = process.argv[2];
  if (!raw) throw new Error('Usage: npm run check:live -- https://YOUR-SITE.vercel.app');
  const base = new URL(raw);
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Use an HTTP(S) website URL.');
  for (const [route, verify] of [
    ['/api/health', async res => {
      if (!(res.headers.get('content-type') || '').includes('application/json')) throw new Error('API returned a web page. Check vercel.json and the project root.');
      const data = await res.json();
      if (!res.ok || data.ok !== true || data.schema !== 5) throw new Error(data.error || 'Database health check failed.');
    }],
    ['/vendor/qrcode.js', async res => { if (!res.ok || !(await res.text()).includes('qrcode')) throw new Error('QR library missing. Upload public/vendor/.'); }],
    ['/service-worker.js', async res => { if (!res.ok || !(await res.text()).includes('surrender-desk-cloud-v6')) throw new Error('Offline app file is missing or outdated.'); }]
  ]) {
    const response = await fetch(new URL(route, base), { cache: 'no-store', signal: AbortSignal.timeout(25000) });
    await verify(response);
    console.log('PASS ' + route);
  }
  console.log('Deployment can reach the shared register. Check that both Supabase Cron jobs are active.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
