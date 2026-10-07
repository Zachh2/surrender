'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
for (const name of ['index.html','app.js','policy.js','service-worker.js','manifest.webmanifest','favicon.svg','vendor/qrcode.js','vendor/QR-LICENSE.txt']) {
  if (!fs.existsSync(path.join(root,'public',name))) throw new Error('Missing public/' + name + '. Upload the complete package, including vendor/.');
}
const html = fs.readFileSync(path.join(root,'public/index.html'),'utf8');
for (const match of html.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?[^\"]*)?"/g)) if (!fs.existsSync(path.join(root,'public',match[1]))) throw new Error('Missing asset: ' + match[1]);
const config = JSON.parse(fs.readFileSync(path.join(root,'vercel.json')));
if (config.outputDirectory !== 'public' || !config.rewrites.some(r => r.source === '/api/:path*')) throw new Error('Vercel routing configuration is incomplete.');
const forbidden = ['SUPABASE_SECRET_KEY=', 'sb_secret_', 'TEACHER_PASSWORD='];
for (const name of ['index.html','app.js','policy.js','service-worker.js']) {
  const text = fs.readFileSync(path.join(root,'public',name),'utf8');
  if (forbidden.some(key => text.includes(key))) throw new Error('Do not put server credentials in public/' + name);
}
console.log('Build ready: static assets, offline QR and /api routing verified.');
