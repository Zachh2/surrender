'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { PGlite } = require('@electric-sql/pglite');
const { createHandler } = require('../lib/handler');
const policy = require('../public/policy');
const settings = { url:'https://test.invalid', key:'sb_secret_TEST_ONLY', password:'test-only-password-2026' };
const schema = fs.readFileSync(path.join(__dirname,'../supabase/01-schema.sql'),'utf8');
let db, server, base, handlerA, handlerB, useA = false;
async function rpc(action,args = {}) {
  const { rows } = await db.query('select public.surrender_rpc($1,$2::jsonb) as data',[action,JSON.stringify(args)]);
  const data = rows[0].data;
  if (data.error) throw Object.assign(new Error(data.error),{status:data.status});
  return data;
}
before(async () => {
  db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(schema);
  handlerA = createHandler({settings,rpc});
  handlerB = createHandler({settings,rpc});
  server = http.createServer((req,res) => { useA = !useA; return (useA ? handlerA : handlerB)(req,res); });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
beforeEach(async () => { await db.exec('truncate surrender_private.records, surrender_private.sessions, surrender_private.login_limits;'); });
after(async () => { if(server) await new Promise(resolve=>server.close(resolve)); if(db) await db.close(); });
async function request(route,{method='GET',body,key,token,headers={}} = {}) {
  const response = await fetch(base + '/api/' + route,{method,headers:{'Content-Type':'application/json',...(key ? {'X-Device-Key':key} : {}),...(token ? {Authorization:'Bearer '+token} : {}),...headers},body:body === undefined ? undefined : JSON.stringify(body)});
  return {status:response.status,data:await response.json(),headers:response.headers};
}
const deviceA = 'a'.repeat(64), deviceB = 'b'.repeat(64);
const record = (id='record-0001',overrides={}) => ({id,name:'Test Student',section:'Cirrus',phone:'Test phone',active:true,surrenderedAt:new Date().toISOString(),...overrides});
async function signIn() { const res=await request('login',{method:'POST',body:{password:settings.password}});assert.equal(res.status,200);return res.data.token; }

test('schema can be reapplied and public/browser roles cannot read records or call privileged functions',async()=>{
  await db.exec(schema);
  for(const role of ['anon','authenticated']) {
    await db.exec('set role '+role);
    try {
      await assert.rejects(db.query('select * from surrender_private.records'),/permission denied/);
      await assert.rejects(db.query("select public.surrender_rpc('health')"),/permission denied/);
      await assert.rejects(db.query('select public.surrender_maintain()'),/permission denied/);
    } finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');
  try { assert.equal((await rpc('health')).schema,5); } finally { await db.exec('reset role'); }
  const rows=(await db.query("select relrowsecurity from pg_class where relnamespace='surrender_private'::regnamespace and relkind='r'")).rows;
  assert.equal(rows.length,3);assert.ok(rows.every(row=>row.relrowsecurity));
});
test('Vercel rewritten URLs work; unauthenticated users cannot open the teacher register',async()=>{
  assert.equal((await request('index?route=health')).data.mode,'cloud');
  assert.equal((await request('records')).status,401);
  assert.equal((await request('my-records')).status,401);
  assert.equal((await request('health',{headers:{Origin:'https://other.invalid'}})).status,403);
  assert.equal((await request('health')).headers.get('cache-control'),'private, no-store');
});
test('two devices share the teacher register but students can only read or return their own records',async()=>{
  const token=await signIn();
  assert.equal((await request('records',{method:'POST',key:deviceA,body:record()})).status,200);
  assert.equal((await request('records',{method:'POST',key:deviceB,body:record('record-0002',{name:'Second Student',section:'Alto'})})).status,200);
  const teacher=await request('records',{token});
  assert.equal(teacher.data.length,2);assert.ok(teacher.data.some(r=>r.section==='Alto'));
  assert.ok(teacher.data.every(r=>!('ownerHash' in r) && !('owner_hash' in r)));
  assert.equal((await request('my-records',{key:deviceA})).data.length,1);
  const hijack=await request('records',{method:'POST',key:deviceB,body:record('record-0001',{active:false,returnedAt:new Date().toISOString()})});
  assert.equal(hijack.status,403);
  assert.equal((await request('records/record-0001/return',{method:'POST',key:deviceB,body:{}})).status,401);
});
test('retries do not duplicate check-ins, overwrite identity, or reopen returned records',async()=>{
  const input=record();
  const submit=body=>request('records',{method:'POST',key:deviceA,body});
  await submit(input);
  assert.equal((await submit({...input,name:'Changed Name'})).data.name,'Test Student');
  assert.equal((await submit(record('record-0002'))).data.id,input.id);
  const returned=await submit({...input,active:false,returnedAt:new Date().toISOString()});
  assert.equal(returned.data.active,false);assert.equal(returned.data.autoClosed,false);
  assert.equal((await submit(input)).data.active,false);
  const next=await submit(record('record-0003'));assert.equal(next.data.active,true);
  assert.equal((await request('my-records',{key:deviceA})).data.length,2);
});
test('teacher sessions survive separate handler instances and logout revokes them centrally',async()=>{
  const token=await signIn();
  for(let n=0;n<3;n++) assert.equal((await request('records',{token})).status,200);
  await request('records',{method:'POST',key:deviceA,body:record()});
  const result=await request('records/record-0001/return',{method:'POST',token,body:{}});
  assert.equal(result.data.active,false);assert.equal(result.data.autoClosed,false);
  assert.equal((await request('logout',{method:'POST',token,body:{}})).status,200);
  assert.equal((await request('records',{token})).status,401);
});
test('expired sessions and a password change invalidate existing logins',async()=>{
  const token=await signIn();
  const original=handlerB;
  handlerB=createHandler({settings:{...settings,password:'a-different-test-password'},rpc});
  const statuses=[(await request('records',{token})).status,(await request('records',{token})).status].sort();
  handlerB=original;
  assert.deepEqual(statuses,[200,401]);
  await db.exec("update surrender_private.sessions set expires_at=now()-interval '1 minute'");
  assert.equal((await request('records',{token})).status,401);
});
test('login rate limit persists across handler instances',async()=>{
  for(let n=0;n<10;n++) assert.equal((await request('login',{method:'POST',body:{password:'wrong'}})).status,401);
  assert.equal((await request('login',{method:'POST',body:{password:settings.password}})).status,429);
  await db.exec("update surrender_private.login_limits set expires_at=now()-interval '1 minute'");
  await signIn();
});
test('server and browser agree on Philippine cutoff at midnight and 6 PM, including year boundaries',async()=>{
  for(const date of ['2026-10-07T00:00:00+08:00','2026-10-07T17:59:59+08:00','2026-10-07T18:00:00+08:00','2026-12-31T23:00:00+08:00']) {
    const row=(await db.query('select surrender_private.close_at($1::timestamptz) as due',[date])).rows[0];
    assert.equal(new Date(row.due).getTime(),policy.closeAt(date));
  }
});
test('scheduled maintenance closes at the recorded 6 PM deadline and removes only expired history',async()=>{
  const input=record();await request('records',{method:'POST',key:deviceA,body:input});
  const due=new Date(policy.closeAt(input.surrenderedAt));
  await db.query('select surrender_private.maintain($1::timestamptz)',[due.toISOString()]);
  let row=(await db.query('select body from surrender_private.records')).rows[0].body;
  assert.equal(row.active,false);assert.equal(row.autoClosed,true);assert.equal(Date.parse(row.returnedAt),due.getTime());
  await db.query('select surrender_private.maintain($1::timestamptz)',[new Date(due.getTime()+policy.RETENTION-1).toISOString()]);
  assert.equal((await db.query('select count(*)::int as count from surrender_private.records')).rows[0].count,1);
  await db.query('select surrender_private.maintain($1::timestamptz)',[new Date(due.getTime()+policy.RETENTION).toISOString()]);
  assert.equal((await db.query('select count(*)::int as count from surrender_private.records')).rows[0].count,0);
});
test('offline records arriving after cutoff are saved to history; expired ones do not reappear',async()=>{
  const begin=new Date(Date.now()-2*86400000).toISOString();
  const result=await request('records',{method:'POST',key:deviceA,body:record('offline-0001',{surrenderedAt:begin})});
  assert.equal(result.status,200);assert.equal(result.data.active,false);assert.equal(result.data.autoClosed,true);
  assert.equal(Date.parse(result.data.returnedAt),policy.closeAt(begin));
  const expired=await request('records',{method:'POST',key:deviceA,body:record('expired-0001',{surrenderedAt:new Date(Date.now()-32*86400000).toISOString()})});
  assert.equal(expired.status,410);
});
test('invalid records are rejected and no unvalidated fields are persisted',async()=>{
  for(const changes of [{section:'Invalid'},{name:''},{active:'yes'},{phone:'x'.repeat(41)},{surrenderedAt:'invalid'},{surrenderedAt:new Date(Date.now()+3600000).toISOString()},{active:false,returnedAt:'invalid'}]) {
    assert.equal((await request('records',{method:'POST',key:deviceA,body:record('invalid-0001',changes)})).status,400);
  }
  const result=await request('records',{method:'POST',key:deviceA,body:record('valid-00001',{token:'untrusted',autoClosed:true,ownerHash:deviceB})});
  assert.equal(result.status,200);assert.equal(result.data.autoClosed,false);assert.equal(result.data.token,undefined);
  assert.equal((await request('records',{method:'POST',key:deviceA,body:{name:'x'.repeat(9000)}})).status,413);
});
