'use strict';
function config(env = process.env) {
  const missing = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'TEACHER_PASSWORD'].filter(key => !env[key] || /REPLACE|YOUR_PROJECT/.test(env[key]));
  if (missing.length) { const err = new Error('Server setup incomplete: add ' + missing.join(', ') + ' in Vercel, then redeploy.'); err.status = 503; throw err; }
  let url;
  try { url = new URL(env.SUPABASE_URL); } catch (_) { const err = new Error('SUPABASE_URL must be your HTTPS project URL.'); err.status = 503; throw err; }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) { const err = new Error('SUPABASE_URL must be your HTTPS project URL without a path.'); err.status = 503; throw err; }
  if (!(env.SUPABASE_SECRET_KEY.startsWith('sb_secret_') || env.SUPABASE_SECRET_KEY.startsWith('eyJ'))) { const err = new Error('Use a Supabase secret key or legacy service_role key in the server settings.'); err.status = 503; throw err; }
  if (env.TEACHER_PASSWORD.length < 12 || env.TEACHER_PASSWORD.length > 100) { const err = new Error('Set TEACHER_PASSWORD to 12–100 characters in Vercel, then redeploy.'); err.status = 503; throw err; }
  return { url: url.origin, key: env.SUPABASE_SECRET_KEY, password: env.TEACHER_PASSWORD };
}
function createDatabase(settings, fetcher = fetch) {
  return async function rpc(action, args = {}) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const headers = { apikey: settings.key, 'Content-Type': 'application/json' };
      // Modern secret keys are API keys, not JWTs. Legacy service_role uses both.
      if (settings.key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + settings.key;
      const response = await fetcher(settings.url + '/rest/v1/rpc/surrender_rpc', { method: 'POST', headers, body: JSON.stringify({ p_action: action, p_args: args }), signal: controller.signal, redirect: 'error' });
      let data;
      try { data = await response.json(); } catch (_) { data = null; }
      if (!response.ok) {
        const message = response.status === 404 || data?.code === 'PGRST202' ? 'Database setup incomplete. Run supabase/01-schema.sql in Supabase SQL Editor.' : [401,403].includes(response.status) ? 'Database access failed. Check the Supabase server key and SQL permissions.' : 'Database is temporarily unavailable. Your phone will retry syncing.';
        const err = new Error(message); err.status = 503; throw err;
      }
      if (data === null) { const err = new Error('Invalid database response.'); err.status = 503; throw err; }
      if (data.error) { const err = new Error(data.error); err.status = data.status || 500; throw err; }
      return data;
    } catch (error) {
      if (error.status) throw error;
      const err = new Error('Database is temporarily unreachable. Your phone will retry syncing.'); err.status = 503; throw err;
    } finally { clearTimeout(timer); }
  };
}
module.exports = { config, createDatabase };
