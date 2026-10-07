'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const handler = require('../api/index');
const root = path.resolve(__dirname,'../public');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
http.createServer((req,res) => {
  const url = new URL(req.url,'http://localhost');
  if (url.pathname.startsWith('/api/')) return handler(req,res);
  let target;
  try { target = path.resolve(root,'.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); } catch (_) { res.writeHead(400); return res.end('Invalid URL'); }
  if (!['GET','HEAD'].includes(req.method) || !target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200,{'Content-Type':mime[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-store'});
  res.end(req.method === 'HEAD' ? '' : fs.readFileSync(target));
}).listen(Number(process.env.PORT || 4181),'127.0.0.1',() => console.log('Local cloud-app preview: http://127.0.0.1:' + (process.env.PORT || 4181)));
